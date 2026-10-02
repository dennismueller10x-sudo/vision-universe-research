#!/usr/bin/env python3
"""Rebuild public Tiingo evidence locally; --refresh fetches public sources only.

This never reads credentials or mutates production data. Discovery records are
candidates including provider-reserved symbols, not proof of account entitlement.
"""
import argparse
import ast
import collections
import csv
import datetime
import hashlib
import io
import json
from pathlib import Path
import re
import urllib.request
from urllib.parse import urlsplit
import zipfile

HERE = Path(__file__).resolve().parent
ZIP_URL = "https://apimedia.tiingo.com/docs/tiingo/daily/supported_tickers.zip"
DOC_URL = "https://www.tiingo.com/documentation/end-of-day"
STR = r'''(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')'''


def get(url):
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=45) as response:
        return response.read()


def save(name, value):
    (HERE / name).write_text(json.dumps(value, indent=2) + "\n")


def refresh():
    (HERE / "supported_tickers.zip").write_bytes(get(ZIP_URL))
    # The HTML shell contains session CSRF values: use it transiently, do not save.
    html = get(DOC_URL).decode()
    scripts = re.findall(r'<script[^>]*src="([^"]+)"', html)
    main = next(url for url in scripts if "/main-es2015." in url)
    runtime = next(url for url in scripts if "/runtime-es2015." in url)
    (HERE / "main.js").write_bytes(get(main))
    (HERE / "runtime.js").write_bytes(get(runtime))
    runtime_text = (HERE / "runtime.js").read_text()
    sources = {"main.js": main, "runtime.js": runtime}
    for module in ["documentation", "products"]:
        stem = f"src_app_api_{module}_{module}_module_ts"
        digest = re.search(re.escape(stem) + r':"([a-z0-9]+)"', runtime_text)[1]
        url = f"https://apimedia.tiingo.com/dist/{stem}-es2015.{digest}.js"
        (HERE / f"{module}.js").write_bytes(get(url))
        sources[f"{module}.js"] = url
    save("public_sources.json", {
        "retrieved_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "documentation_url": DOC_URL, "zip_url": ZIP_URL,
        "sources": sources,
        "sha256": {name: hashlib.sha256((HERE / name).read_bytes()).hexdigest()
                   for name in [*sources, "supported_tickers.zip"]},
    })


def balanced(text, start):
    depth = 0
    quote = None
    escaped = False
    for i in range(start, len(text)):
        char = text[i]
        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
        elif char in ["'", '"']:
            quote = char
        elif char == "[":
            depth += 1
        elif char == "]":
            depth -= 1
            if depth == 0:
                return text[start:i + 1]
    raise ValueError("Unbalanced documentation table")


def tables(text):
    result = {}
    for match in re.finditer(r'this\.([A-Za-z0-9]*Table[A-Za-z0-9]*Rows)=\[', text):
        array = balanced(text, match.end() - 1)
        rows = []
        for entry in re.finditer(r'\{((?:' + STR + r'|[^{}])*)\}', array):
            row = {}
            for field in re.finditer(r'(\w+):(' + STR + r'|![01])', entry[1]):
                value = field[2]
                row[field[1]] = value == "!0" if value.startswith("!") else ast.literal_eval(value)
            if row:
                rows.append(row)
        name = match[1]
        suffix = 2
        while name in result:
            name = f"{match[1]}__occurrence_{suffix}"
            suffix += 1
        result[name] = rows
    return result


def reconcile_account_inventory():
    """Attach observed account results without changing documented capabilities.

    Keep existing authenticated results if the account evidence cache is absent;
    a public-source rerun must not revert verified observations to pending claims.
    """
    inventory_path = HERE / "tiingo_endpoint_inventory.json"
    evidence_path = HERE.parent / "runtime" / "account_evidence.json"
    runtime_inventory = HERE.parent / "runtime" / "tiingo_endpoint_inventory.json"
    if not inventory_path.exists() or not evidence_path.exists():
        return
    inventory = json.loads(inventory_path.read_text())
    evidence = json.loads(evidence_path.read_text())

    def masked(value):
        if isinstance(value, str):
            return "not available for free/evaluation" in value.lower()
        if isinstance(value, dict):
            return any(masked(v) for v in value.values())
        if isinstance(value, list):
            return any(masked(v) for v in value)
        return False

    for endpoint in inventory["endpoints"]:
        template = endpoint["endpoint"].split("?")[0].rstrip("/")
        if template.startswith("https://"):
            continue  # Public symbol download is separate from account evidence.
        parts = re.split(r"(<[^>]+>)", template)
        pattern = "".join(r"[^/]+" if part.startswith("<") else re.escape(part)
                          for part in parts)
        observed = [r for r in evidence["responses"]
                    if re.fullmatch(pattern, urlsplit(r["url"]).path.rstrip("/"))]
        counts = collections.Counter(str(r.get("status")) for r in observed)
        successful = [r for r in observed if r.get("status") == 200]
        nonempty = [r for r in successful if r.get("payload")]
        observed_fields = set()
        masked_fields = set()
        for response in nonempty:
            payload = response["payload"]
            records = payload if isinstance(payload, list) else [payload]
            for record in records:
                if isinstance(record, dict):
                    observed_fields.update(record)
                    masked_fields.update(k for k, v in record.items() if masked(v))
        if nonempty:
            result = "HTTP200_NONEMPTY_SAMPLE_WITH_EVALUATION_MASKS" if masked_fields else "HTTP200_NONEMPTY_SAMPLE"
            if len(counts) > 1:
                result += "_AND_OTHER_STATUSES"
        elif successful:
            result = "HTTP200_EMPTY_SAMPLE_NO_DATA_SUPPORT_DEMONSTRATED"
        elif counts and set(counts) == {"403"}:
            result = "HTTP403_DENIED_SAMPLE"
        elif counts and set(counts) == {"404"}:
            result = "HTTP404_SAMPLE_NO_DATA_FOUND_NOT_ENTITLEMENT_DENIAL"
        elif counts:
            result = "MIXED_FAILURE_STATUSES_SAMPLE"
        else:
            result = "NOT_TESTED_IN_COMPLETED_ACCOUNT_SAMPLE"
        endpoint["account_entitlement_result"] = result
        endpoint["authenticated_evidence"] = {
            "provenance": "../runtime/account_evidence.json",
            "request_count": len(observed), "status_counts": dict(counts),
            "nonempty_http200": len(nonempty),
            "empty_http200": len(successful) - len(nonempty),
            "observed_response_fields": sorted(observed_fields),
            "evaluation_masked_fields": sorted(masked_fields),
            "denial_details": sorted({r["payload"]["detail"] for r in observed
                                      if isinstance(r.get("payload"), dict)
                                      and isinstance(r["payload"].get("detail"), str)}),
            "evidence": [{"url": r["url"], "status": r.get("status"),
                          "source_run_id": r.get("sourceRunId"),
                          "observed_at": r.get("observedAt"),
                          "sha256": r.get("sha256")} for r in observed],
            "claim_limit": "Observed account samples only. HTTP404 is distinct from HTTP403; nonempty metadata/search does not prove price support, and quotes do not establish live freshness. Evaluation-masked fields are not available data.",
        }
    inventory["inventory_status"] = "PUBLIC_DOCUMENTATION_WITH_COMPLETED_AUTHENTICATED_SAMPLE"
    inventory["authenticated_sample"] = {
        "provenance": "../runtime/account_evidence.json",
        "runtime_inventory": "../runtime/tiingo_endpoint_inventory.json",
        "generated_at": evidence.get("generatedAt"),
        "actual_requests": evidence.get("actualRequests"),
        "run_ids": evidence.get("runId"),
        "exhaustive_account_universe": False,
    }
    if runtime_inventory.exists():
        runtime = json.loads(runtime_inventory.read_text())
        inventory["authenticated_sample"]["observed_quota_headers"] = runtime.get("quotaHeaders")
    save("tiingo_endpoint_inventory.json", inventory)


def analyze():
    zipped = (HERE / "supported_tickers.zip").read_bytes()
    with zipfile.ZipFile(io.BytesIO(zipped)) as archive:
        raw_csv = archive.read("supported_tickers.csv")
    (HERE / "supported_tickers.csv").write_bytes(raw_csv)
    rows = list(csv.DictReader(io.StringIO(raw_csv.decode())))
    warning = ("Public discovery includes reserved symbols for planned coverage. "
               "Rows include recycled ticker histories; dates do not prove active status. "
               "No account entitlement can be inferred from these records.")
    save("tiingo_full_symbol_master.json", {
        "source": ZIP_URL, "warning": warning,
        "fields": list(rows[0]), "record_count": len(rows),
        "unique_ticker_count": len({row["ticker"] for row in rows}), "records": rows,
    })
    save("tiingo_asset_type_breakdown.json", {
        "source": ZIP_URL, "warning": warning, "record_count": len(rows),
        "unique_ticker_count": len({row["ticker"] for row in rows}),
        "duplicate_ticker_count": sum(n > 1 for n in collections.Counter(r["ticker"] for r in rows).values()),
        "assetType_records": dict(collections.Counter(r["assetType"] for r in rows)),
        "exchange_records": dict(collections.Counter(r["exchange"] for r in rows)),
        "currency_records": dict(collections.Counter(r["priceCurrency"] for r in rows)),
        "classification_limit": "Stock includes common, ADR, preferred, closed-end funds, warrants, units etc.; insufficient source fields to disaggregate.",
    })
    docs = (HERE / "documentation.js").read_text()
    schema = tables(docs)
    save("documented_field_schemas.json", {
        "evidence_type": "PUBLIC_DOCUMENTATION_NOT_ACCOUNT_RESPONSE", "tables": schema,
    })
    urls = sorted(set(re.findall(r'https://api\.tiingo\.com/[A-Za-z0-9_<>?=&.,/-]+', docs)))
    save("documented_api_urls.json", {"evidence_type": "PUBLIC_DOCUMENTATION_NOT_ACCOUNT_RESPONSE", "urls": urls})
    texts = []
    for match in re.finditer(r'\._uU\(\d+,(' + STR + r')\)', docs):
        texts.append(ast.literal_eval(match[1]))
    (HERE / "documentation_text.txt").write_text("\n".join(texts) + "\n")
    assert len(schema["eodTableResponseRows"]) == 13
    assert {r["jsonFieldName"] for r in schema["fundFeeTableResponseRows"]} == {
        "ticker", "name", "description", "shareClass", "netExpense", "otherShareClasses"}
    assert "holdings" not in docs.lower(), "Provider documentation now mentions holdings: reassess support."
    reconcile_account_inventory()
    print(json.dumps({"records": len(rows), "documented_tables": len(schema), "documented_urls": len(urls)}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    if args.refresh:
        refresh()
    analyze()
