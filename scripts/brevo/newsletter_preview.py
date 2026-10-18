"""Customer-identical marketing preview to the two private internal contacts.

Brevo sendTest adds a subject marker. This separate, explicitly authorized mode
uses a disposable campaign, never the production draft's sendNow endpoint.
"""
import copy
import json
from pathlib import Path
from campaigns import confirmed_tests, digest, ids, version
from client import LISTS, structures
from prepare import Blocked, normalize


def preview_audience(client, config, lists):
    if set(lists) != set(LISTS) or len(set(lists.values())) != 3:
        raise Blocked("Eindeutige getrennte Listen fehlen; kein Vorabversand.")
    expected = confirmed_tests(client, config, lists)
    # Read actual membership, not a count or only the two configured lookups.
    contacts = client.call("GET", "/contacts/lists/%d/contacts?limit=500&offset=0" % lists[LISTS[2]]).get("contacts", [])
    if len(contacts) != 2 or {normalize(c.get("email", "")) for c in contacts} != set(expected):
        raise Blocked("Testliste enthält nicht exakt die beiden bestätigten internen Empfänger.")
    for contact in contacts:
        membership = contact.get("listIds", [])
        if (contact.get("emailBlacklisted") is not False or
                contact.get("attributes", {}).get("VU_INTERNAL_TEST") is not True or
                lists[LISTS[2]] not in membership or any(lists[n] in membership for n in LISTS[:2])):
            raise Blocked("Testkontakt gesperrt oder Listentrennung nicht eindeutig; keine Änderung von Sperren.")
    return expected


def mail_signature(campaign):
    # All returned fields except audience and operational metadata must agree.
    # testSent/shareLink are provider-generated preview/report metadata.
    ignored = {"id", "status", "statistics", "createdAt", "modifiedAt", "sentDate",
               "recipients", "testSent", "shareLink"}
    return digest({k: v for k, v in campaign.items() if k not in ignored})


def clone_body(source, recipients):
    # Use exactly the fields our managed draft creator writes, whose POST shape
    # is already validated. GET also reports provider defaults/read-only fields;
    # these are not round-trip create parameters (e.g. empty optional strings).
    # The full readback comparison still rejects any differing default/custom
    # setting before a send; do not silently drop a meaningful source setting.
    allowed = {"name", "type", "subject", "previewText", "htmlContent", "mirrorActive"}
    body = {k: copy.deepcopy(v) for k, v in source.items()
            if k in allowed and v is not None and v != ""}
    sender = source.get("sender", {})
    body["sender"] = {k: sender[k] for k in ("id", "name") if k in sender}
    body["recipients"] = recipients
    return body


def preview_report(client, preview_id):
    # Brevo can return empty/default statistical nodes unless explicitly selected.
    campaign = client.call("GET", "/emailCampaigns/" + str(preview_id) + "?statistics=globalStats")
    status = campaign.get("status")
    result = {"preview_campaign_id": preview_id,
              "preview_status": status if status in ("draft", "queued", "sent", "suspended", "inProcess") else "other"}
    stats = campaign.get("statistics", {}).get("globalStats", {})
    for key in ("sent", "delivered", "hardBounces", "softBounces"):
        value = stats.get(key)
        if type(value) is int and value >= 0:
            result["preview_" + key] = value
    return result


def verify_clone(client, preview_id, source, recipients):
    candidate = client.call("GET", "/emailCampaigns/" + str(preview_id))
    version(candidate)  # classic, resolved, unscheduled draft only
    actual = candidate.get("recipients", {})
    if (ids(actual.get("listIds", actual.get("lists"))) != recipients["listIds"] or
            ids(actual.get("exclusionListIds", actual.get("exclusionLists"))) != recipients["exclusionListIds"] or
            ids(actual.get("segmentIds", actual.get("segments")))):
        raise Blocked("Vorabkampagne hat eine abweichende Zielgruppe; kein Versand.")
    if mail_signature(candidate) != mail_signature(source):
        raise Blocked("Vorabkampagne ist in Inhalt oder Einstellungen nicht identisch; kein Versand.")


def reconcile_creation(process, campaign_id, fingerprint, source, recipients, github):
    """One reviewed incident only; never recover a possibly attempted send."""
    incident=json.loads((Path(__file__).parent / "newsletter-preview-recovery.json").read_text())
    state=process.state["campaigns"][str(campaign_id)]
    attempt=state.get("tests",{}).get(fingerprint,{})
    prior=state.get("approvals",{}).get(str(incident["failed_run_id"]),{})
    if (github is None or campaign_id!=incident["campaign_id"] or fingerprint!=incident["version"] or
            attempt.get("state")!="pending" or "preview_id" in attempt or
            prior.get("operation")!="preview" or prior.get("version")!=fingerprint or
            prior.get("approval_sha256")!=incident["approval_sha256"] or
            prior.get("actor_id")!=incident["owner_id"] or
            fingerprint in state.get("creation_recoveries",{})):
        raise Blocked("Vorabtest bereits reserviert; keine sichere einmalige Erstellungskorrektur verfügbar.")
    run=github.call("GET","/actions/runs/"+str(incident["failed_run_id"]))
    if (run.get("id")!=incident["failed_run_id"] or run.get("status")!="completed" or run.get("conclusion")!="failure" or
            run.get("event")!="workflow_dispatch" or run.get("head_branch")!="main" or
            run.get("head_sha")!=incident["head_sha"] or run.get("run_attempt")!=1 or
            run.get("path")!=".github/workflows/brevo-newsletter.yml" or
            run.get("actor",{}).get("id")!=incident["owner_id"] or
            run.get("triggering_actor",{}).get("id")!=incident["owner_id"]):
        raise Blocked("Belegter fehlgeschlagener Erstellungslauf passt nicht; keine Wiederholung.")
    # Missing durable preview_id proves this code could not yet reach sendNow.
    # Also reconcile remote drafts before creating another: adopt exactly one
    # matching unscheduled draft, otherwise block or prove absence on all pages.
    client=process.client
    client.preview_recovery=True
    candidates=[];offset=0;total=None;seen=0
    while True:
        response=client.call("GET","/emailCampaigns?type=classic&limit=50&offset="+str(offset))
        page=response.get("campaigns")
        count=response.get("count")
        if (not isinstance(page,list) or type(count) is not int or count<0 or
                total is not None and count!=total):
            raise Blocked("Privater Kampagnenabgleich unvollständig.")
        total=count;seen+=len(page)
        for candidate in page:
            actual=candidate.get("recipients",{})
            if candidate.get("name")==source.get("name") and ids(actual.get("listIds",actual.get("lists")))==recipients["listIds"]:
                candidates.append(candidate)
        if len(page)<50: break
        offset+=50
    if seen!=total: raise Blocked("Privater Kampagnenabgleich hat nicht alle Einträge belegt.")
    if len(candidates)>1: raise Blocked("Mehrere mögliche Vorabentwürfe; kein Versand und keine neue Kopie.")
    candidate_id=None
    if candidates:
        candidate=candidates[0]
        candidate_id=candidate.get("id")
        if type(candidate_id) is not int or candidate_id<1 or candidate_id==campaign_id:
            raise Blocked("Vorabentwurf nicht eindeutig identifiziert.")
        client.preview_id=candidate_id
        verify_clone(client,candidate_id,source,recipients)
    # Consume this exact incident exception durably BEFORE any corrective POST.
    state.setdefault("creation_recoveries",{})[fingerprint]=incident["failed_run_id"]
    process.save()
    return candidate_id


def preview(process, campaign_id, expected_version, authorized=False, github=None):
    if not authorized:
        raise Blocked("Vorabkampagne benötigt konkrete ausdrückliche Freigabe.")
    state, fingerprint, addresses = process.current(campaign_id)
    if fingerprint != expected_version:
        raise Blocked("Vorabfreigabe gilt nicht für die aktuelle Inhaltsversion.")
    client = process.client
    lists = structures(client)
    if preview_audience(client, process.config, lists) != addresses:
        raise Blocked("Testempfänger wurden verändert.")
    source = client.call("GET", "/emailCampaigns/" + str(campaign_id))
    if version(source) != fingerprint:
        raise Blocked("Entwurf wurde zwischenzeitlich verändert.")
    attempts = state.setdefault("tests", {})
    recipients = {"listIds": [lists[LISTS[2]]], "exclusionListIds": sorted(lists[n] for n in LISTS[:2])}
    preview_id=None
    if fingerprint in attempts:
        if attempts[fingerprint].get("test_identity")!=process.test_identity(addresses):
            raise Blocked("Reservierung gehört nicht zu den aktuellen Testempfängern.")
        preview_id=reconcile_creation(process,campaign_id,fingerprint,source,recipients,github)
        attempt=attempts[fingerprint]
    else:
        # Reserve before creation. Unknown failures still never retry generically.
        attempt = {"state": "pending", "test_identity": process.test_identity(addresses)}
        attempts[fingerprint] = attempt
        process.save()
    client.preview_recipients = recipients
    if preview_id is None:
        result = client.call("POST", "/emailCampaigns", clone_body(source, recipients))
        preview_id = result.get("id")
    if type(preview_id) is not int or preview_id < 1 or preview_id == campaign_id:
        raise Blocked("Vorabkampagnen-ID ungültig; kein Versand.")
    attempt["preview_id"] = preview_id
    process.save()
    verify_clone(client, preview_id, source, recipients)
    _, current_version, current_addresses = process.current(campaign_id)
    if current_version != fingerprint or current_addresses != addresses:
        raise Blocked("Entwurf oder Testempfänger während Vorbereitung verändert.")
    preview_audience(client, process.config, lists)
    verify_clone(client, preview_id, source, recipients)
    client.call("POST", "/emailCampaigns/%d/sendNow" % preview_id)
    # Acknowledgement is not delivery evidence. Save acceptance only after
    # verifying that the production draft still has the same exact version.
    _, after_version, _ = process.current(campaign_id)
    if after_version != fingerprint:
        raise Blocked("Hauptentwurf nach Vorabversand verändert; keine Hauptfreigabe.")
    attempt["state"] = "api_accepted"
    process.save()
    return {"campaign_id": campaign_id, **preview_report(client, preview_id), "version": fingerprint,
            "test": "API angenommen; Zustellung nicht nachgewiesen", "recipient_count": 2,
            "subject_prefix_added": False, "production_sent": False}
