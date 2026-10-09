"""Private temporary GitHub Actions-secret handoff; no files in Git or artifacts."""
import argparse
import base64
import gzip
import io
import json
import os
import re
from pathlib import Path
from client import ATTRS, Client, LISTS, free_account, structures
from prepare import Blocked, normalize, prepared_digest, private_path, private_write

MAX_SECRET_BYTES = 48000  # Below GitHub's 48 KiB limit; compressed data is not encrypted until uploaded.
MAX_RAW_BYTES = 2_000_000


def trusted_dispatch():
    branch = os.environ.get("BREVO_DEFAULT_BRANCH")
    return bool(os.environ.get("GITHUB_ACTIONS") == "true" and branch
                and os.environ.get("GITHUB_REF") == "refs/heads/" + branch
                and os.environ.get("GITHUB_EVENT_NAME") == "workflow_dispatch")


def validate_prepared(data):
    if not isinstance(data, dict) or data.get("schema") != 1 or not re.fullmatch(r"[a-f0-9]{64}", data.get("source_sha256", "")):
        raise Blocked("Private Importdaten haben kein gültiges Schema.")
    records = data.get("records")
    if not isinstance(records, list) or not 1 <= len(records) <= 10000:
        raise Blocked("Ungültige Importmenge.")
    seen, internal = set(), set()
    for record in records:
        email, attrs = record.get("email"), record.get("attributes")
        if not isinstance(email, str) or normalize(email) != email or email in seen or not isinstance(attrs, dict):
            raise Blocked("Ungültige oder doppelte Kontaktzuordnung.")
        seen.add(email)
        if set(attrs) - set(ATTRS) or attrs.get("VU_SOURCE") != "Shopify-Bestand" or attrs.get("VU_EMAIL_CONSENT") not in ("subscribed", "not_subscribed", "unclear"):
            raise Blocked("Kontaktmerkmale sind nicht freigegeben.")
        for name, value in attrs.items():
            kind = ATTRS[name]
            if ((kind == "boolean" and type(value) is not bool) or (kind == "text" and not isinstance(value, str))
                    or (kind == "float" and (type(value) not in (int, float) or not 0 <= value < 1_000_000_000))):
                raise Blocked("Kontaktmerkmal hat einen ungültigen Typ.")
        if type(attrs.get("VU_BUYER")) is not bool or type(attrs.get("VU_INTERNAL_TEST")) is not bool:
            raise Blocked("Käufer-/Teststatus fehlt.")
        if attrs["VU_INTERNAL_TEST"]:
            internal.add(email)
    matches = data.get("test_addresses", {})
    if (set(matches) != {"test_1", "test_2"} or any(not isinstance(v, list) or len(v) != 1 for v in matches.values())
            or {v[0] for v in matches.values()} != internal or len(internal) != 2):
        raise Blocked("Beide Testempfänger sind nicht eindeutig zugeordnet.")
    return data


def encode(data):
    validate_prepared(data)
    raw = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    if len(raw) > MAX_RAW_BYTES:
        raise Blocked("Importdaten überschreiten den geschützten Übergabeumfang.")
    encoded = base64.b64encode(gzip.compress(raw, mtime=0)).decode("ascii")
    if len(encoded) > MAX_SECRET_BYTES:
        raise Blocked("Importdaten überschreiten das Actions-Secret-Limit.")
    return encoded


def decode(encoded):
    if not encoded or len(encoded) > MAX_SECRET_BYTES:
        raise Blocked("Temporäres Import-Secret fehlt oder ist zu groß.")
    try:
        compressed = base64.b64decode(encoded, validate=True)
        with gzip.GzipFile(fileobj=io.BytesIO(compressed)) as stream:
            raw = stream.read(MAX_RAW_BYTES + 1)
        if len(raw) > MAX_RAW_BYTES:
            raise ValueError()
        data = json.loads(raw)
    except Exception:
        raise Blocked("Temporäres Import-Secret ist ungültig.") from None
    return validate_prepared(data)


def run(operation):
    if not trusted_dispatch() or operation not in ("import-preview", "import"):
        raise Blocked("Geschützter Import ist nur manuell auf dem Standardbranch erlaubt.")
    # No payload files, stdout or artifact uploads: data remains in the process memory.
    data = decode(os.environ.pop("BREVO_IMPORT_PAYLOAD", ""))
    client = Client(mode="import")
    free_account(client)
    lists = structures(client)
    if set(lists) != set(LISTS):
        raise Blocked("VU-Struktur vor Importprüfung einrichten.")
    from import_contacts import import_contacts, preflight
    if operation == "import-preview":
        return {**preflight(client, data), "contacts_imported": 0, "emails_sent": 0,
                "automation_review_required": True}
    try:
        review = json.loads(os.environ.pop("BREVO_IMPORT_REVIEW", ""))
    except Exception:
        raise Blocked("Temporärer privater Automationsprüfbericht fehlt.") from None
    return {**import_contacts(client, data, review, protected_actions=True), "emails_sent": 0}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("prepared")
    parser.add_argument("--out", required=True)
    parser.add_argument("--manifest", required=True)
    args = parser.parse_args()
    try:
        source = private_path(args.prepared)
        if source.stat().st_mode & 0o077:
            raise Blocked("Importdatei benötigt Dateirechte 0600.")
        data = json.loads(source.read_text(encoding="utf-8"))
        payload = encode(data)
        private_write(args.out, payload)
        attrs = [r["attributes"] for r in data["records"]]
        private_write(args.manifest, json.dumps({"source_sha256": data["source_sha256"],
                "prepared_sha256": prepared_digest(data), "encoded_bytes": len(payload),
                "contacts": len(attrs), "regular_subscribers": sum(a["VU_EMAIL_CONSENT"] == "subscribed" and not a["VU_INTERNAL_TEST"] for a in attrs),
                "internal_tests": sum(a["VU_INTERNAL_TEST"] for a in attrs),
                "non_subscribers": sum(a["VU_EMAIL_CONSENT"] != "subscribed" for a in attrs)}, indent=2))
        print("Geschütztes Übergabepaket privat vorbereitet; noch nicht hochgeladen.")
    except Exception:
        print("Übergabe gesperrt: private Dateien und Importzuordnung prüfen.")
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
