"""Read-only aggregate account/list/suppression and campaign 11 reconciliation.

Only fixed keys, integers and allowlisted statuses may leave this private process.
"""
from prepare import Blocked


def read_contacts(client, path, inventory=False):
    contacts, seen, offset, total = [], set(), 0, None
    while True:
        page = client.call("GET", path + "?limit=500&offset=" + str(offset))
        rows = page.get("contacts")
        if not isinstance(rows, list):
            raise Blocked("Privater Kontaktzählungs-Abgleich ist unvollständig.")
        if inventory:
            count = page.get("count")
            if type(count) is not int or count < 0 or total is not None and count != total:
                raise Blocked("Kontaktinventar ändert sich während des Abgleichs.")
            total = count
        for contact in rows:
            cid = contact.get("id")
            if type(cid) is not int or cid < 1 or cid in seen:
                raise Blocked("Kontaktzählung enthält fehlende oder doppelte IDs.")
            seen.add(cid)
        contacts.extend(rows)
        if len(rows) < 500:
            break
        offset += len(rows)
    if inventory and len(contacts) != total:
        raise Blocked("API-Zählwert und vollständig gelesene Kontakte stimmen nicht überein.")
    return contacts


def summarize(contacts):
    result = {"total": len(contacts), "email_blacklisted": 0, "email_not_blacklisted": 0,
              "email_status_unknown": 0, "list_unsubscribed_reported": 0,
              "internal_test": 0, "consent_subscribed": 0, "consent_withdrawn": 0,
              "consent_blocked": 0, "consent_not_subscribed": 0, "consent_unclear": 0,
              "consent_missing_or_other": 0}
    for contact in contacts:
        flag = contact.get("emailBlacklisted")
        result["email_blacklisted" if flag is True else
               "email_not_blacklisted" if flag is False else "email_status_unknown"] += 1
        result["list_unsubscribed_reported"] += bool(contact.get("listUnsubscribed"))
        attrs = contact.get("attributes", {})
        result["internal_test"] += attrs.get("VU_INTERNAL_TEST") is True
        consent = attrs.get("VU_EMAIL_CONSENT")
        key = "consent_" + consent if consent in ("subscribed", "withdrawn", "blocked", "not_subscribed", "unclear") else "consent_missing_or_other"
        result[key] += 1
    return result


def contact_report(client):
    all_contacts = read_contacts(client, "/contacts", inventory=True)
    lists = {str(i): read_contacts(client, "/contacts/lists/%d/contacts" % i) for i in (4, 5, 6)}
    memberships = {key: {c["id"] for c in contacts} for key, contacts in lists.items()}
    campaign = client.call("GET", "/emailCampaigns/11?statistics=globalStats")
    status = campaign.get("status")
    stats = campaign.get("statistics", {}).get("globalStats", {})
    report = {"campaign_id": 11, "status": status if status in ("draft", "queued", "sent", "suspended", "inProcess") else "other"}
    for key in ("sent", "delivered", "hardBounces", "softBounces", "complaints", "unsubscriptions", "deferred"):
        value = stats.get(key)
        if type(value) is int and value >= 0:
            report[key] = value
    return {"operation": "audit", "all_contacts": summarize(all_contacts),
            "lists": {key: summarize(contacts) for key, contacts in lists.items()},
            "main_test_overlap": len(memberships["4"] & memberships["6"]),
            "outside_vu_lists": sum(c["id"] not in set.union(*memberships.values()) for c in all_contacts),
            "campaign": report, "contacts_changed": 0, "emails_sent": 0}
