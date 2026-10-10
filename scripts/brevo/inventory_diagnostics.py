"""Manual GET-only inventory audit. Contact and sender values never leave memory."""
import json
import os
import re
from client import Client, LISTS, structures
from prepare import Blocked

BRANCH = "refs/heads/ops/brevo-contact-audit-20261010"


class ReadOnlyInventory(Client):
    def call(self, method, path, body=None, missing=False):
        clean = path.split("?", 1)[0]
        allowed = clean in ("/account", "/contacts", "/contacts/lists", "/senders",
                            "/senders/domains", "/smtp/blockedContacts") or bool(
            re.fullmatch(r"/contacts/[1-9][0-9]*", clean))
        if method != "GET" or body is not None or not allowed:
            raise Blocked("Nur ausdrücklich erlaubte GET-Inventarabrufe sind zulässig.")
        return super().call(method, path, missing=missing)


def summarize(client):
    account = client.call("GET", "/account")
    automation_status = account.get("marketingAutomation", {}).get("status")
    lists = structures(client)
    contacts = client.pages("/contacts", "contacts")
    counts = {"contacts_checked": len(contacts), "email_blocklisted": 0,
              "email_not_blocklisted": 0, "email_blocklist_status_missing": 0,
              "contacts_with_list_unsubscriptions": 0,
              "list_unsubscription_status_missing": 0,
              "contacts_with_recorded_unsubscription_history": 0,
              "vu_internal_test": 0, "vu_subscribed": 0,
              "vu_not_subscribed": 0, "vu_consent_unknown": 0}
    memberships = {name: 0 for name in LISTS}
    for entry in contacts:
        cid = entry.get("id")
        if type(cid) is not int or cid < 1:
            raise Blocked("Kontaktinventar enthält keine verlässliche Kontakt-ID.")
        contact = client.call("GET", "/contacts/" + str(cid))
        blocked = contact.get("emailBlacklisted")
        if type(blocked) is not bool:
            counts["email_blocklist_status_missing"] += 1
        else:
            counts["email_blocklisted" if blocked else "email_not_blocklisted"] += 1
        unsubscribed = contact.get("listUnsubscribed")
        if not isinstance(unsubscribed, list):
            counts["list_unsubscription_status_missing"] += 1
        elif unsubscribed:
            counts["contacts_with_list_unsubscriptions"] += 1
        history = contact.get("statistics", {}).get("unsubscriptions")
        counts["contacts_with_recorded_unsubscription_history"] += int(
            isinstance(history, list) and bool(history))
        attrs = contact.get("attributes") or {}
        counts["vu_internal_test"] += int(attrs.get("VU_INTERNAL_TEST") is True)
        consent = attrs.get("VU_EMAIL_CONSENT")
        key = {"subscribed": "vu_subscribed", "not_subscribed": "vu_not_subscribed"}.get(
            consent, "vu_consent_unknown") if isinstance(consent, str) else "vu_consent_unknown"
        counts[key] += 1
        for name, lid in lists.items():
            memberships[name] += int(lid in (contact.get("listIds") or []))
    transactional = client.call("GET", "/smtp/blockedContacts?limit=1&offset=0")
    blocked_count = transactional.get("count")
    if type(blocked_count) is not int or blocked_count < 0:
        raise Blocked("Transaktionelles Sperrinventar enthält keinen verlässlichen Zählwert.")
    senders = client.call("GET", "/senders").get("senders") or []
    consumer_domains = {"gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com",
                        "yahoo.com", "yahoo.de", "icloud.com", "me.com", "gmx.de", "gmx.net",
                        "web.de", "aol.com"}
    sender_counts = {"active": 0, "consumer_mailbox_domain": 0,
                     "visionuniverse_de_domain": 0, "other_domain": 0, "domain_missing": 0}
    for sender in senders:
        sender_counts["active"] += int(sender.get("active") is True)
        address = sender.get("email")
        domain = address.rsplit("@", 1)[-1].lower() if isinstance(address, str) and "@" in address else None
        key = "domain_missing" if not domain else "consumer_mailbox_domain" if domain in consumer_domains else (
            "visionuniverse_de_domain" if domain == "visionuniverse.de" else "other_domain")
        sender_counts[key] += 1
    return {"operation": "audit", "scope": "GET-only inventory aggregates",
            "contact_status_counts": counts, "vu_list_member_counts": memberships,
            "transactional_blocked_or_unsubscribed_count": blocked_count,
            "marketing_automation_account_status": automation_status if automation_status in (
                "active", "inactive", "enabled", "disabled") else "unknown",
            "active_workflows_review": "Brevo UI required; account status is not a workflow inventory",
            "sender_status_counts": sender_counts,
            "contacts_imported": 0, "emails_sent": 0}


def main():
    try:
        if not (os.environ.get("GITHUB_ACTIONS") == "true" and
                os.environ.get("GITHUB_EVENT_NAME") == "workflow_dispatch" and
                os.environ.get("GITHUB_REF") == BRANCH and os.environ.get("BREVO_OPERATION") == "audit"):
            raise Blocked("Nur der ausdrücklich manuelle Inventaraudit ist freigegeben.")
        print(json.dumps(summarize(ReadOnlyInventory()), ensure_ascii=False))
    except Exception:
        print("Gesperrt: Inventaraudit unvollständig; keine personenbezogenen Fehlerdetails.")
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
