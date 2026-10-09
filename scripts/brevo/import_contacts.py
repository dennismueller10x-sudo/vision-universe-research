"""Opt-in preserving upsert, usable only in a private durable server process."""
import datetime as dt
import json
import os
import urllib.parse
from client import ATTRS, LISTS, free_account, structures
from prepare import Blocked, private_path


def reviewed(review, prepared, lists):
    try:
        age = dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(review["reviewed_at"])
        valid = dt.timedelta(0) <= age <= dt.timedelta(hours=24)
    except (ValueError, KeyError, TypeError):
        valid = False
    if not (valid and review.get("source_sha256") == prepared["source_sha256"]
            and review.get("list_ids") == lists and review.get("all_active_automations_checked") is True
            and review.get("no_contact_create_update_or_list_entry_triggers") is True
            and review.get("reviewer") and review.get("evidence_note")):
        raise Blocked("Aktuelle private Automationsprüfung fehlt oder passt nicht zum Import.")


def merge_attributes(incoming, existing):
    attrs = dict(incoming)
    previous = existing.get("attributes", {}) if existing else {}
    if previous.get("VU_EMAIL_CONSENT") in ("not_subscribed", "unclear", "withdrawn", "blocked"):
        if attrs["VU_EMAIL_CONSENT"] == "subscribed":
            attrs["VU_EMAIL_CONSENT"] = previous["VU_EMAIL_CONSENT"]
    if existing and existing.get("emailBlacklisted") and attrs["VU_EMAIL_CONSENT"] == "subscribed":
        attrs["VU_EMAIL_CONSENT"] = "blocked"
    if previous.get("VU_BUYER"):
        attrs["VU_BUYER"] = True
    if previous.get("VU_INTERNAL_TEST"):
        attrs["VU_INTERNAL_TEST"] = True
    if previous.get("VU_SHOPIFY_ORDERS", 0) > attrs.get("VU_SHOPIFY_ORDERS", 0):
        attrs["VU_SHOPIFY_ORDERS"] = previous["VU_SHOPIFY_ORDERS"]
    for name in ("VU_TAGS", "VU_SHOPIFY_IDS"):
        attrs[name] = ", ".join(sorted({v.strip() for source in (previous.get(name, ""), attrs.get(name, ""))
                                      for v in source.split(",") if v.strip()}))
    # Do not replace names/country already managed in Brevo.
    for name in ("VU_FIRSTNAME", "VU_LASTNAME", "VU_COUNTRY"):
        if previous.get(name):
            attrs[name] = previous[name]
    return attrs


def import_contacts(client, prepared, review):
    if os.environ.get("GITHUB_ACTIONS"):
        raise Blocked("Kein geschützter Actions-Dateitransfer eingerichtet; Import gesperrt.")
    free_account(client)
    lists = structures(client)
    if set(lists) != set(LISTS):
        raise Blocked("VU-Struktur zuerst einrichten.")
    reviewed(review, prepared, lists)
    attributes = client.call("GET", "/contacts/attributes")["attributes"]
    if any(not any(a.get("name") == n and a.get("type") == t and a.get("category") == "normal" for a in attributes)
           for n, t in ATTRS.items()):
        raise Blocked("Merkmalszuordnung ist unvollständig.")
    tests = prepared["test_addresses"]
    if set(tests) != {"test_1", "test_2"} or any(len(v) != 1 for v in tests.values()) or len({v[0] for v in tests.values()}) != 2:
        raise Blocked("Beide Testadressen müssen eindeutig bestätigt sein.")
    result = {"created": 0, "updated": 0, "unchanged": 0, "newsletter": 0, "blocked_or_unclear": 0}
    for record in prepared["records"]:
        email = record["email"]
        existing = client.contact(email)
        attrs = merge_attributes(record["attributes"], existing)
        eligible = attrs["VU_EMAIL_CONSENT"] == "subscribed" and not attrs["VU_INTERNAL_TEST"]
        desired = []
        if eligible:
            desired.append(lists[LISTS[0]])
        if attrs["VU_INTERNAL_TEST"]:
            desired.append(lists[LISTS[2]])
        membership = set(existing.get("listIds", [])) if existing else set()
        body = {"attributes": attrs}
        if set(desired) - membership:
            body["listIds"] = sorted(set(desired) - membership)
        # Remove only this integration's newsletter membership on a non-eligible record.
        if not eligible and lists[LISTS[0]] in membership:
            body["unlinkListIds"] = [lists[LISTS[0]]]
        if existing:
            if attrs != {k: existing.get("attributes", {}).get(k) for k in attrs} or len(body) > 1:
                # Never set emailBlacklisted=false, SMS/WhatsApp opt-ins or trigger welcome flows.
                client.call("PUT", "/contacts/" + urllib.parse.quote(email, safe=""), body)
                result["updated"] += 1
            else:
                result["unchanged"] += 1
        else:
            body.update(email=email, updateEnabled=False, emailBlacklisted=attrs["VU_EMAIL_CONSENT"] != "subscribed")
            client.call("POST", "/contacts", body)
            result["created"] += 1
        # Read back every upsert without logging contact data; abort on a mismatch.
        actual = client.contact(email)
        if not actual or any(actual.get("attributes", {}).get(k) != v for k, v in attrs.items()):
            raise Blocked("Import-Rückprüfung fehlgeschlagen; privaten Zustand prüfen.")
        if eligible != (lists[LISTS[0]] in actual.get("listIds", [])):
            raise Blocked("Newsletter-Zuordnung stimmt nicht mit Einwilligung überein.")
        if attrs["VU_INTERNAL_TEST"] and lists[LISTS[2]] not in actual.get("listIds", []):
            raise Blocked("Testlisten-Zuordnung fehlt.")
        if existing and existing.get("emailBlacklisted") and not actual.get("emailBlacklisted"):
            raise Blocked("Bestehende Sperre wurde verändert; Import anhalten.")
        result["newsletter"] += eligible
        result["blocked_or_unclear"] += attrs["VU_EMAIL_CONSENT"] in ("blocked", "unclear")
    return result
