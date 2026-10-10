"""Brevo v3 REST, stdlib only. No response bodies or sensitive URLs in errors."""
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from prepare import Blocked

USER_AGENT = "VisionUniverse-Brevo/1.0"

LISTS = ("VU | Newsletter", "VU | App-Warteliste", "VU | Newsletter-Test")
ATTRS = {"VU_SOURCE": "text", "VU_EMAIL_CONSENT": "text", "VU_BUYER": "boolean",
         "VU_INTERNAL_TEST": "boolean", "VU_FIRSTNAME": "text", "VU_LASTNAME": "text",
         "VU_COUNTRY": "text", "VU_SHOPIFY_IDS": "text", "VU_TAGS": "text", "VU_SHOPIFY_ORDERS": "float"}


class Client:
    def __init__(self, mode="normal"):
        self.mode = mode
        self._key = os.environ.get("BREVO_API_KEY")
        if not self._key:
            raise Blocked("BREVO_API_KEY ist im sicheren Prozess nicht verfügbar.")

    def call(self, method, path, body=None, missing=False):
        if not path.startswith("/") or ".." in path:
            raise Blocked("Ungültiger API-Pfad.")
        if self.mode != "normal" and not permitted_call(self.mode, method, path):
            raise Blocked("API-Aufruf liegt außerhalb des freigegebenen Betriebsumfangs.")
        req = urllib.request.Request("https://api.brevo.com/v3" + path,
              data=None if body is None else json.dumps(body).encode(), method=method,
              headers={"api-key": self._key, "Accept": "application/json", "Content-Type": "application/json",
                       "User-Agent": USER_AGENT})
        try:
            # Redirects are disabled to prevent forwarding the API key to another origin.
            class NoRedirect(urllib.request.HTTPRedirectHandler):
                def redirect_request(self, *args, **kwargs):
                    return None
            with urllib.request.build_opener(NoRedirect).open(req, timeout=30) as response:
                raw = response.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            if missing and exc.code == 404:
                return None
            raise Blocked("Brevo-Aufruf abgelehnt (HTTP %d); keine automatische Wiederholung." % exc.code) from None
        except (OSError, ValueError):
            raise Blocked("Brevo-Aufruf unklar; Status vor Wiederholung prüfen.") from None

    def pages(self, path, key, limit=50):
        result, offset = [], 0
        while True:
            page = self.call("GET", path + "?" + urllib.parse.urlencode({"limit": limit, "offset": offset})).get(key) or []
            result.extend(page)
            if len(page) < limit:
                return result
            offset += limit

    def contact(self, email):
        return self.call("GET", "/contacts/" + urllib.parse.quote(email, safe=""), missing=True)


def permitted_call(mode, method, path):
    clean = path.split("?", 1)[0]
    if mode not in ("admin", "import"):
        return False
    if method == "GET":
        return clean == "/account" or clean == "/senders" or clean.startswith("/senders/domains") or clean == "/contacts" or clean.startswith("/contacts/")
    if mode == "admin":
        return method == "POST" and (clean in ("/contacts/folders", "/contacts/lists")
               or re.fullmatch(r"/contacts/attributes/normal/VU_[A-Z_]+", clean) is not None)
    return (method == "POST" and clean == "/contacts") or (
        method == "PUT" and clean.startswith("/contacts/") and "%40" in clean and "/" not in clean[len("/contacts/"):])


def positive_id(value):
    if type(value) is not int or value < 1:
        raise Blocked("Brevo-Struktur enthält eine ungültige ID.")
    return value


def free_account(client):
    account = client.call("GET", "/account")
    if not any(p.get("type") == "free" for p in account.get("plan", [])):
        raise Blocked("Kostenloser Tarif nicht bestätigt; keine Buchung oder Tarifänderung.")
    return account


def structures(client):
    lists = client.pages("/contacts/lists", "lists")
    found = {}
    for name in LISTS:
        matches = [r for r in lists if r["name"] == name]
        if len(matches) > 1:
            raise Blocked("Mehrdeutige VU-Listenstruktur; manuell zuordnen.")
        if matches:
            found[name] = positive_id(matches[0]["id"])
    return found


def setup(client):
    free_account(client)
    found = structures(client)
    attrs = client.call("GET", "/contacts/attributes")["attributes"]
    for name, kind in ATTRS.items():
        existing = [a for a in attrs if a["name"] == name]
        if existing and (len(existing) != 1 or existing[0].get("type") != kind or existing[0].get("category") != "normal"):
            raise Blocked("Bestehendes VU-Merkmal hat einen anderen Typ; keine Überschreibung.")
    for name, kind in ATTRS.items():
        if not any(a["name"] == name for a in attrs):
            client.call("POST", "/contacts/attributes/normal/" + name, {"type": kind})
    if len(found) != len(LISTS):
        folders = client.pages("/contacts/folders", "folders")
        folder = [f for f in folders if f["name"] == "Vision Universe"]
        if len(folder) > 1:
            raise Blocked("Mehrdeutiger Brevo-Ordner.")
        folder_id = folder[0]["id"] if folder else client.call("POST", "/contacts/folders", {"name": "Vision Universe"})["id"]
        for name in LISTS:
            if name not in found:
                found[name] = positive_id(client.call("POST", "/contacts/lists", {"name": name, "folderId": folder_id})["id"])
    return found


def audit(client):
    account = client.call("GET", "/account")
    senders = client.call("GET", "/senders").get("senders", [])
    domains = client.call("GET", "/senders/domains").get("domains", [])
    segments = client.pages("/contacts/segments", "segments")
    attrs = client.call("GET", "/contacts/attributes").get("attributes", [])
    inventory = client.call("GET", "/contacts?limit=1&offset=0")
    count = inventory.get("count")
    if type(count) is not int or count < 0:
        raise Blocked("Kontaktinventar enthält keinen verlässlichen Zählwert.")
    domain_configs = [client.call("GET", "/senders/domains/" + urllib.parse.quote(d["domain_name"], safe=""))
                      for d in domains if isinstance(d.get("domain_name"), str)]
    # Only allowlisted aggregate information may enter public Actions logs.
    plans = {p.get("type") for p in account.get("plan", [])}
    return {"plan_types": sorted(p if p in ("free", "payAsYouGo", "subscription", "sms") else "unknown" for p in plans),
            "vu_lists": structures(client), "segments_count": len(segments),
            "existing_contacts_count": count,
            "vu_attributes_present": sum(any(a.get("name") == n for a in attrs) for n in ATTRS),
            "vu_attribute_conflicts": sum(any(a.get("name") == n and (a.get("type") != t or a.get("category") != "normal") for a in attrs) for n, t in ATTRS.items()),
            "senders_count": len(senders), "active_senders_count": sum(s.get("active") is True for s in senders),
            "domains_count": len(domains), "domains_checked": len(domain_configs),
            "verified_domains_count": sum(d.get("verified") is True for d in domain_configs),
            "authenticated_domains_count": sum(d.get("authenticated") is True for d in domain_configs),
            "automation_review": "Brevo UI required; no documented enumeration API",
            "contacts_imported": 0, "emails_sent": 0}
