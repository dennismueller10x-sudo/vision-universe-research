"""Customer-identical marketing preview to the two private internal contacts.

Brevo sendTest adds a subject marker. This separate, explicitly authorized mode
uses a disposable campaign, never the production draft's sendNow endpoint.
"""
import copy
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
    allowed = {"name", "type", "subject", "previewText", "htmlContent", "replyTo", "toField",
               "footer", "header", "inlineImageActivation", "mirrorActive", "recurring", "params",
               "tag", "utmContent", "utmId", "utmMedium", "utmSource", "utmTerm",
               "unsubscriptionPageId", "emailExpirationDate"}
    body = {k: copy.deepcopy(v) for k, v in source.items() if k in allowed and v is not None}
    if "utmCampaignValue" in source:
        body["utmCampaign"] = source["utmCampaignValue"]
    sender = source.get("sender", {})
    body["sender"] = {k: sender[k] for k in ("id", "name") if k in sender}
    body["recipients"] = recipients
    return body


def preview_report(client, preview_id):
    campaign = client.call("GET", "/emailCampaigns/" + str(preview_id))
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


def preview(process, campaign_id, expected_version, authorized=False):
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
    if fingerprint in attempts:
        raise Blocked("Vorabtest dieser Version bereits reserviert; keine doppelte Sendung.")
    # Reserve before campaign creation, not just before send. Ambiguous failures
    # remain pending across runners; never reset or automatically retry.
    attempt = {"state": "pending", "test_identity": process.test_identity(addresses)}
    attempts[fingerprint] = attempt
    process.save()
    recipients = {"listIds": [lists[LISTS[2]]], "exclusionListIds": sorted(lists[n] for n in LISTS[:2])}
    client.preview_recipients = recipients
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
