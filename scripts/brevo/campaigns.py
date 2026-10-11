"""Version-bound draft/test/release gate. State must be durable and private."""
import datetime as dt
import fcntl
import hashlib
import html
import json
import os
from pathlib import Path
from string import Template
from client import LISTS, free_account, structures
from prepare import Blocked, normalize, private_path, private_write


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def ids(value):
    return sorted(v["id"] if isinstance(v, dict) else v for v in (value or []))


def version(campaign):
    # Include every content/config field, including resolved HTML and recipient exclusions.
    # Only operational metadata is omitted. Unknown/new API fields invalidate the test safely.
    ignored = {"id", "status", "statistics", "createdAt", "modifiedAt", "sentDate"}
    if campaign.get("type") != "classic" or not campaign.get("htmlContent"):
        raise Blocked("Nur klassische Kampagnen mit aufgelöstem HTML werden unterstützt.")
    if campaign.get("scheduledAt") or campaign.get("abTesting") or campaign.get("sendAtBestTime"):
        raise Blocked("Terminierte oder variable Kampagnen sind gesperrt.")
    if campaign.get("status") != "draft":
        raise Blocked("Produktionskampagne muss ungesendeter Entwurf sein.")
    return digest({k: v for k, v in campaign.items() if k not in ignored})


def render(content):
    required = ("subject", "preheader", "intro", "items", "cta_text", "cta_url", "company_name", "company_address", "sender_id")
    if any(not content.get(k) for k in required) or content.get("company_details_verified") is not True:
        raise Blocked("Freigegebener Inhalt und bestätigte Unternehmensangaben fehlen.")
    if not isinstance(content["items"], list) or not 1 <= len(content["items"]) <= 3:
        raise Blocked("Vorlage benötigt ein bis drei Inhalte.")
    if not content["cta_url"].startswith("https://"):
        raise Blocked("CTA benötigt eine HTTPS-Adresse.")
    values = {k: html.escape(str(v), quote=True) for k, v in content.items() if k != "items"}
    values["items_html"] = "".join('<tr><td style="padding:0 24px 24px"><h2 style="font-size:22px;line-height:1.3">'
            + html.escape(item["title"]) + '</h2><p style="font-size:16px;line-height:1.65">'
            + html.escape(item["text"]) + '</p></td></tr>' for item in content["items"])
    path = Path(__file__).resolve().parent / "newsletter.html.tmpl"
    return Template(path.read_text(encoding="utf-8")).substitute(values)


def readiness(client, sender_id):
    free_account(client)
    sender = [s for s in client.call("GET", "/senders").get("senders", []) if s["id"] == sender_id]
    if len(sender) != 1 or sender[0].get("active") is not True:
        raise Blocked("Gewählter Absender ist nicht bestätigt.")
    domain = sender[0]["email"].rsplit("@", 1)[1]
    from urllib.parse import quote
    config = client.call("GET", "/senders/domains/" + quote(domain, safe=""))
    if config.get("authenticated") is not True or config.get("verified") is not True:
        raise Blocked("Domainbestätigung oder Authentifizierung fehlt.")


def confirmed_tests(client, config, lists):
    people = config.get("test_addresses", {})
    if set(people) != {"test_1", "test_2"} or config.get("test_addresses_confirmed") is not True:
        raise Blocked("Beide internen Empfänger müssen eindeutig eingerichtet sein.")
    addresses = [normalize(people[n]) for n in ("test_1", "test_2")]
    if None in addresses or len(set(addresses)) != 2:
        raise Blocked("Zwei unterschiedliche gültige Testadressen erforderlich.")
    for email in addresses:
        contact = client.contact(email)
        if not contact or contact.get("emailBlacklisted") or contact.get("attributes", {}).get("VU_INTERNAL_TEST") is not True:
            raise Blocked("Testkontakt fehlt oder ist gesperrt.")
        if lists[LISTS[2]] not in contact.get("listIds", []) or lists[LISTS[0]] in contact.get("listIds", []):
            raise Blocked("Test- und Hauptliste sind nicht korrekt getrennt.")
    return addresses


def audience_check(client, config, lists):
    # Inspect actual audience, not just the configured name of a segment.
    source = config.get("audience_segment_id")
    path = "/contacts?segmentId=" + str(int(source)) if source else "/contacts/lists/%d/contacts" % lists[LISTS[0]]
    audience, offset = [], 0
    while True:
        sep = "&" if "?" in path else "?"
        page = client.call("GET", path + sep + "limit=500&offset=" + str(offset)).get("contacts", [])
        audience.extend(page)
        if len(page) < 500:
            break
        offset += 500
    for contact in audience:
        if contact.get("emailBlacklisted"):
            continue
        attrs = contact.get("attributes", {})
        if attrs.get("VU_INTERNAL_TEST"):
            if lists[LISTS[2]] not in contact.get("listIds", []):
                raise Blocked("Interner Kontakt liegt außerhalb der Ausschlussliste.")
            continue
        if attrs.get("VU_EMAIL_CONSENT") != "subscribed":
            raise Blocked("Zielgruppe enthält ungeklärte oder nicht angemeldete Kontakte.")
    return len(audience)


class Process:
    def __init__(self, client, config, state_file):
        if os.environ.get("GITHUB_ACTIONS"):
            raise Blocked("Versand benötigt dauerhaften privaten Zustand; in Actions gesperrt.")
        self.client, self.config = client, config
        self.path = private_path(state_file)
        self.path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
        if self.path.exists() and self.path.stat().st_mode & 0o077:
            raise Blocked("Dauerhafter Zustand benötigt Dateirechte 0600.")
        # Advisory lock is held for the entire operation, including API calls.
        self.lock = os.open(str(self.path) + ".lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        os.fchmod(self.lock, 0o600)
        try:
            fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except Exception:
            os.close(self.lock)
            raise
        self.state = json.loads(self.path.read_text()) if self.path.exists() else {"drafts": {}, "campaigns": {}}

    def close(self):
        os.close(self.lock)

    def save(self):
        # Atomic private write; state is persisted BEFORE every irreversible call.
        temp = self.path.with_name(self.path.name + ".tmp")
        private_write(temp, json.dumps(self.state, ensure_ascii=False, indent=2))
        with open(temp, "rb") as f:
            os.fsync(f.fileno())
        os.replace(temp, self.path)
        fd = os.open(self.path.parent, os.O_DIRECTORY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)

    def draft(self, content):
        client, cfg = self.client, self.config
        sender_id = int(content["sender_id"])
        readiness(client, sender_id)
        lists = structures(client)
        if set(lists) != set(LISTS):
            raise Blocked("Listenstruktur fehlt.")
        confirmed_tests(client, cfg, lists)
        audience_check(client, cfg, lists)
        recipients = {"exclusionListIds": [lists[LISTS[2]]]}
        if cfg.get("audience_segment_id"):
            recipients["segmentIds"] = [int(cfg["audience_segment_id"])]
        else:
            recipients["listIds"] = [lists[LISTS[0]]]
        body = {"name": content["name"], "type": "classic", "sender": {"id": sender_id},
                "subject": content["subject"], "previewText": content["preheader"],
                "htmlContent": render(content), "recipients": recipients,
                "mirrorActive": False}
        fingerprint = digest(body)
        if fingerprint in self.state["drafts"]:
            found = self.state["drafts"][fingerprint]
            if found.get("id"):
                return {"campaign_id": found["id"], "reused": True}
            raise Blocked("Entwurfserstellung unklar; Brevo vor Wiederholung prüfen.")
        self.state["drafts"][fingerprint] = {"state": "pending"}
        self.save()
        response = client.call("POST", "/emailCampaigns", body)
        campaign_id = response["id"]
        self.state["drafts"][fingerprint] = {"id": campaign_id}
        self.state["campaigns"][str(campaign_id)] = {"recipients": recipients, "sender_id": sender_id}
        self.save()
        return {"campaign_id": campaign_id, "sent": False}

    def current(self, campaign_id):
        state = self.state["campaigns"].get(str(campaign_id))
        if not state or state.get("send"):
            raise Blocked("Kampagne nicht verwaltet oder Versand bereits reserviert/ausgeführt.")
        campaign = self.client.call("GET", "/emailCampaigns/" + str(campaign_id))
        fingerprint = version(campaign)
        # Recipient fields differ in GET (lists/exclusionLists) and POST (listIds...).
        # Compare the complete server version across test/release; source audience is checked again.
        readiness(self.client, state["sender_id"])
        lists = structures(self.client)
        if set(lists) != set(LISTS):
            raise Blocked("Listenstruktur fehlt.")
        actual = campaign.get("recipients", {})
        exclude = ids(actual.get("exclusionListIds", actual.get("exclusionLists")))
        include = ids(actual.get("listIds", actual.get("lists")))
        segments = ids(actual.get("segmentIds", actual.get("segments")))
        if exclude != state["recipients"]["exclusionListIds"] or include != state["recipients"].get("listIds", []) or segments != state["recipients"].get("segmentIds", []):
            raise Blocked("Zielgruppe oder Testlistenausschluss wurde verändert.")
        expected_segments = [int(self.config["audience_segment_id"])] if self.config.get("audience_segment_id") else []
        if segments != expected_segments or (not segments and include != [lists[LISTS[0]]]):
            raise Blocked("Private Zielgruppenkonfiguration passt nicht zur Kampagne.")
        if campaign.get("sender", {}).get("id") != state["sender_id"]:
            raise Blocked("Absender der Kampagne wurde verändert.")
        tests = confirmed_tests(self.client, self.config, lists)
        audience_check(self.client, self.config, lists)
        return state, fingerprint, tests

    def test(self, campaign_id, authorized=False):
        if not authorized:
            raise Blocked("Testversand benötigt ausdrückliche Freigabe für diese Kampagne.")
        state, fingerprint, addresses = self.current(campaign_id)
        attempts = state.setdefault("tests", {})
        if fingerprint in attempts:
            raise Blocked("Vorabtest dieser Version bereits aufgerufen; keine doppelte Sendung.")
        attempts[fingerprint] = {"state": "pending", "test_identity": digest(addresses)}
        self.save()
        self.client.call("POST", "/emailCampaigns/%d/sendTest" % campaign_id, {"emailTo": addresses})
        # A failed/ambiguous call leaves pending and permanently blocks automatic retries/release.
        attempts[fingerprint]["state"] = "api_accepted"
        self.save()
        after = self.client.call("GET", "/emailCampaigns/" + str(campaign_id))
        if version(after) != fingerprint:
            raise Blocked("Kampagne während Test geändert; neuer Test der neuen Version erforderlich.")
        return {"campaign_id": campaign_id, "version": fingerprint,
                "test": "API angenommen; Zustellung nicht nachgewiesen", "production_sent": False}

    def check(self, campaign_id):
        state, fingerprint, addresses = self.current(campaign_id)
        attempt = state.get("tests", {}).get(fingerprint, {})
        if attempt.get("state") != "api_accepted" or attempt.get("test_identity") != digest(addresses):
            raise Blocked("Erfolgreich angenommener Vorabtest dieser Version für beide Testempfänger fehlt.")
        return {"campaign_id": campaign_id, "version": fingerprint, "requires_owner_approval": True}

    def send(self, campaign_id, approval, authorized=False):
        if not authorized:
            raise Blocked("Produktionsversand benötigt ausdrückliche Owner-Freigabe.")
        check = self.check(campaign_id)
        if approval.get("campaign_id") != campaign_id or approval.get("version") != check["version"] or approval.get("explicit_owner_approval") is not True or not approval.get("approval_reference"):
            raise Blocked("Freigabe gilt nicht für diese konkrete Kampagnenversion.")
        state = self.state["campaigns"][str(campaign_id)]
        state["send"] = "pending"
        self.save()
        self.client.call("POST", "/emailCampaigns/%d/sendNow" % campaign_id)
        state["send"] = "api_accepted"
        self.save()
        return {"campaign_id": campaign_id, "send": "API angenommen; Zustellung nicht nachgewiesen"}
