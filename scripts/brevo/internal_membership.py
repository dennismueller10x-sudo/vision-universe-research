"""Add the two privately confirmed internal contacts to list 4, never send mail."""
import datetime as dt
import json
import os
import re
from client import Client, LISTS, structures
from campaigns import confirmed_tests
from prepare import Blocked, normalize
from transfer import trusted_dispatch
from newsletter_approval import load_policy


class MembershipClient(Client):
    def call(self, method, path, body=None, missing=False):
        clean = path.split("?", 1)[0]
        read = method == "GET" and (clean == "/contacts/lists" or clean.startswith("/contacts/"))
        write = (method == "POST" and path == "/contacts/lists/4/contacts/add"
                 and isinstance(body, dict) and set(body) == {"ids"}
                 and 1 <= len(body["ids"]) <= 2
                 and all(type(i) is int and i > 0 for i in body["ids"]))
        if not (read or write):
            raise Blocked("Nur lesender Bestandsabgleich und additive Mitgliedschaft in Liste 4 erlaubt.")
        return super().call(method, path, body, missing)


def automation_review():
    try:
        age = dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(os.environ["BREVO_AUTOMATIONS_REVIEWED_AT"])
        if (not dt.timedelta(0) <= age <= dt.timedelta(hours=24)
                or os.environ.get("BREVO_IMPORT_TRIGGERS_EXCLUDED") != "true"
                or not re.fullmatch(r"[a-f0-9]{64}", os.environ.get("BREVO_AUTOMATION_EVIDENCE_SHA256", ""))):
            raise ValueError()
    except (KeyError, ValueError, TypeError):
        raise Blocked("Aktueller privater Nachweis fehlt, dass der Listenzugang keine Automation auslöst.") from None


def add_membership(client, config, apply=False):
    lists = structures(client)
    if lists != dict(zip(LISTS, (4, 5, 6))):
        raise Blocked("Die belegten Listen 4, 5 und 6 sind nicht eindeutig zugeordnet.")
    addresses = confirmed_tests(client, config, lists)
    before, eligible, held = {}, [], 0
    for address in addresses:
        contact = client.contact(address)
        if (normalize(contact.get("email", "")) != address or type(contact.get("id")) is not int
                or contact["id"] < 1 or not isinstance(contact.get("listIds"), list)):
            raise Blocked("Privater Testkontakt-Abgleich ist nicht eindeutig.")
        before[address] = contact
        if (contact.get("emailBlacklisted") is not False
                or contact.get("listUnsubscribed")
                or contact.get("attributes", {}).get("VU_EMAIL_CONSENT") != "subscribed"
                or 5 in contact["listIds"]):
            held += 1
        else:
            eligible.append(address)
    if len({c["id"] for c in before.values()}) != 2:
        raise Blocked("Die Testkontakte haben keine zwei eindeutigen IDs.")
    missing = [a for a in eligible if 4 not in before[a]["listIds"]]
    if apply:
        automation_review()
        if missing:
            # Add by existing IDs only. Never create contacts, edit consent or unset a block.
            client.call("POST", "/contacts/lists/4/contacts/add", {"ids": [before[a]["id"] for a in missing]})
        for address, baseline in before.items():
            actual = client.contact(address)
            expected = set(baseline["listIds"]) | ({4} if address in missing else set())
            if (not actual or set(actual.get("listIds", [])) != expected
                    or any(actual.get(k) != baseline.get(k) for k in
                           ("id", "email", "attributes", "emailBlacklisted", "smsBlacklisted", "listUnsubscribed"))):
                raise Blocked("Mitgliedschaft oder unveränderter Einwilligungsstatus nicht belegt; keine automatische Wiederholung.")
    return {"operation": "apply" if apply else "preview", "added": len(missing) if apply else 0,
            "would_add": len(missing), "already_in_main": len(eligible) - len(missing),
            "held": held, "test_contacts_retained": 2, "emails_sent": 0,
            "regular_campaigns_still_exclude_test_list": True}


def run():
    policy = load_policy()
    owner = policy["owner"]
    workflow = policy["repository"] + "/.github/workflows/brevo-internal-membership.yml@refs/heads/main"
    if (not trusted_dispatch() or os.environ.get("GITHUB_WORKFLOW_REF") != workflow
            or os.environ.get("GITHUB_ACTOR") != owner["login"]
            or os.environ.get("GITHUB_ACTOR_ID") != str(owner["id"])
            or os.environ.get("GITHUB_TRIGGERING_ACTOR") != owner["login"]
            or os.environ.get("GITHUB_RUN_ATTEMPT") != "1"):
        raise Blocked("Nur ein neuer manueller Owner-Lauf auf dem Standardbranch ist erlaubt.")
    operation = os.environ.get("BREVO_MEMBERSHIP_OPERATION", "preview")
    if operation not in ("preview", "apply"):
        raise Blocked("Ungültige Mitgliedschaftsoperation.")
    if operation == "apply":
        automation_review()
    config = json.loads(os.environ.pop("BREVO_NEWSLETTER_CONFIG", ""))
    return add_membership(MembershipClient(), config, operation == "apply")


if __name__ == "__main__":
    try:
        print(json.dumps(run(), ensure_ascii=False))
    except Blocked as error:
        print("Gesperrt: " + str(error))
        raise SystemExit(1) from None
    except Exception:
        print("Gesperrt: Privaten Bestandsabgleich prüfen; keine Rohdaten und keine automatische Wiederholung.")
        raise SystemExit(1) from None
