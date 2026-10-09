"""Private Shopify preparation. Prints counts only; never customer data."""
import argparse
import csv
import hashlib
import json
import os
from pathlib import Path
import re
import unicodedata

ROOT = Path(__file__).resolve().parents[2]


class Blocked(Exception):
    pass


def private_path(path):
    path = Path(path).expanduser().resolve()
    if path == ROOT or ROOT in path.parents:
        raise Blocked("Private Dateien müssen außerhalb des Repositories liegen.")
    return path


def private_write(path, data):
    path = private_path(path)
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if path.is_symlink():
        raise Blocked("Unsicherer Dateipfad.")
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
        f.write(data)


def normalize(email):
    # ASCII mailbox syntax supported by this import. No provider rules or alias stripping.
    email = email.strip()
    if len(email) > 254 or not re.fullmatch(
        r"[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+", email
    ):
        return None
    local, domain = email.rsplit("@", 1)
    if len(local) > 64 or local.startswith(".") or local.endswith(".") or ".." in local:
        return None
    if any(len(part) > 63 or part.startswith("-") or part.endswith("-") for part in domain.split(".")):
        return None
    # Case variants of the same mailbox are merged conservatively, retaining all consent states.
    return email.lower()


def namekey(value):
    return unicodedata.normalize("NFC", value.strip()).casefold()


def consent(rows):
    states = {r.get("Accepts Email Marketing", "").strip().lower() for r in rows}
    if states == {"yes"}:
        return "subscribed"
    if states == {"no"}:
        return "not_subscribed"
    return "unclear"


def orders(value):
    return int(value) if re.fullmatch(r"\d+", value.strip()) else None


def prepare(source, test_people):
    raw = Path(source).read_bytes()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise Blocked("Export ist kein gültiges UTF-8; Codierung separat prüfen.") from None
    import io
    reader = csv.DictReader(io.StringIO(text, newline=""))
    headers = reader.fieldnames or []
    if not {"Email", "First Name", "Last Name", "Accepts Email Marketing", "Total Orders"} <= set(headers):
        raise Blocked("Erforderliche Shopify-Spalten fehlen.")
    groups, held = {}, 0
    for row in reader:
        if None in row or any(v is None for v in row.values()):
            raise Blocked("CSV-Struktur ist widersprüchlich.")
        address = normalize(row["Email"])
        if address:
            groups.setdefault(address, []).append(row)
        else:
            held += 1
    if set(test_people) != {"test_1", "test_2"}:
        raise Blocked("Private Zuordnung beider interner Testpersonen fehlt.")
    test_matches = {}
    for person, identity in test_people.items():
        test_matches[person] = [e for e, rows in groups.items() if any(
            namekey(r["First Name"]) == namekey(identity["first_name"])
            and namekey(r["Last Name"]) in {namekey(n) for n in identity["last_names"]} for r in rows)]
    internal = {e for found in test_matches.values() for e in found}
    records, conflicts, buyers, non_buyers = [], 0, 0, 0
    for email, rows in groups.items():
        state = consent(rows)
        conflicts += state == "unclear"
        counts = [orders(r["Total Orders"]) for r in rows]
        buyer = any(n is not None and n > 0 for n in counts)
        buyers += buyer
        non_buyers += buyer and state != "subscribed"
        attrs = {"VU_SOURCE": "Shopify-Bestand", "VU_EMAIL_CONSENT": state,
                 "VU_BUYER": buyer, "VU_INTERNAL_TEST": email in internal,
                 "VU_SHOPIFY_IDS": ",".join(sorted({r.get("Customer ID", "") for r in rows} - {""})),
                 "VU_TAGS": ", ".join(sorted({t.strip() for r in rows for t in r.get("Tags", "").split(",") if t.strip()}))}
        for source_col, target in (("First Name", "VU_FIRSTNAME"), ("Last Name", "VU_LASTNAME"),
                                   ("Default Address Country Code", "VU_COUNTRY")):
            values = {r.get(source_col, "").strip() for r in rows} - {""}
            if len(values) == 1:
                attrs[target] = values.pop()
        if any(n is not None for n in counts):
            attrs["VU_SHOPIFY_ORDERS"] = max(n for n in counts if n is not None)
        records.append({"email": email, "attributes": attrs})
    summary = {"rows_checked": sum(len(v) for v in groups.values()) + held,
               "unique_contacts": len(records), "duplicates_merged": sum(len(v)-1 for v in groups.values()),
               "invalid_rows_held": held, "unclear_consent": conflicts,
               "subscribed_in_export": sum(r["attributes"]["VU_EMAIL_CONSENT"] == "subscribed" for r in records),
               "regular_subscribers_prepared": sum(r["attributes"]["VU_EMAIL_CONSENT"] == "subscribed"
                                                    and not r["attributes"]["VU_INTERNAL_TEST"] for r in records),
               "buyers": buyers, "non_subscribed_buyers": non_buyers,
               "rows_with_tags": sum(bool(r.get("Tags")) for rows in groups.values() for r in rows),
               "test_matches": {n: len(v) for n, v in test_matches.items()},
               "encoding": "UTF-8 BOM" if raw.startswith(b"\xef\xbb\xbf") else "UTF-8",
               "consent_timestamp_present": False, "doi_evidence_present": False,
               "imported": 0}
    # The current Shopify schema has no evidence fields. Additional schemas must be reviewed.
    return {"schema": 1, "source_sha256": hashlib.sha256(raw).hexdigest(), "columns": headers,
            "records": records, "test_addresses": test_matches, "summary": summary}


def manual_csvs(data, directory):
    """UI import files for NEW contacts only; existing contacts require private API upsert."""
    matches = data["test_addresses"]
    if any(len(v) != 1 for v in matches.values()) or len({v[0] for v in matches.values()}) != 2:
        raise Blocked("Manuelle CSVs bis zur eindeutigen Testzuordnung gesperrt.")
    import io
    columns = ["EMAIL", "VU_FIRSTNAME", "VU_LASTNAME", "VU_SOURCE", "VU_EMAIL_CONSENT", "VU_BUYER",
               "VU_INTERNAL_TEST", "VU_COUNTRY", "VU_SHOPIFY_IDS", "VU_TAGS", "VU_SHOPIFY_ORDERS"]
    buckets = {"newsletter-new-only.csv": [], "non-subscribers-new-only.csv": [], "tests-new-only.csv": []}
    for record in data["records"]:
        attrs = record["attributes"]
        bucket = "tests-new-only.csv" if attrs["VU_INTERNAL_TEST"] else (
            "newsletter-new-only.csv" if attrs["VU_EMAIL_CONSENT"] == "subscribed" else "non-subscribers-new-only.csv")
        buckets[bucket].append({"EMAIL": record["email"], **attrs})
    for name, rows in buckets.items():
        output = io.StringIO(newline="")
        writer = csv.DictWriter(output, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({k: str(v).lower() if isinstance(v, bool) else v for k, v in row.items()})
        private_write(Path(directory) / name, output.getvalue())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("--out", required=True)
    parser.add_argument("--csv-dir")
    parser.add_argument("--test-identities", required=True)
    args = parser.parse_args()
    try:
        identities = private_path(args.test_identities)
        if identities.stat().st_mode & 0o077:
            raise Blocked("Private Testzuordnung benötigt Dateirechte 0600.")
        data = prepare(private_path(args.source), json.loads(identities.read_text(encoding="utf-8")))
        private_write(args.out, json.dumps(data, ensure_ascii=False, indent=2))
        if args.csv_dir:
            manual_csvs(data, private_path(args.csv_dir))
        print(json.dumps(data["summary"], ensure_ascii=False))
    except Exception:
        print("Vorbereitung gesperrt: private Pfade, CSV-Schema und Codierung prüfen.")
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
