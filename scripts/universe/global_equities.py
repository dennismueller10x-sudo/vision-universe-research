"""Bounded official-source discovery; enrich existing listings, never replace US membership.

Full Tiingo directory and SEC submissions live in the existing ignored cache.
Only selected identity/coverage evidence is published. Repeated runs reuse source
timestamps and serialize deterministically. Failures preserve prior valid identity.
"""
import argparse
import csv
import hashlib
import io
import json
import sys
import time
import urllib.error
import urllib.request
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from scripts.quant.sec.http_client import SECHttpClient, DiskCache, RateLimiter
EUROPE = set("DE FR NL BE ES IT AT CH GB SE DK NO FI IE PT LU IS GR PL CZ HU RO BG HR EE LV LT CY MT SI SK LI".split())
COUNTRIES = {
    "GERMANY": "DE", "FRANCE": "FR", "NETHERLANDS": "NL", "BELGIUM": "BE",
    "SPAIN": "ES", "ITALY": "IT", "AUSTRIA": "AT", "SWITZERLAND": "CH",
    "UNITED KINGDOM": "GB", "SWEDEN": "SE", "DENMARK": "DK", "NORWAY": "NO",
    "FINLAND": "FI", "JAPAN": "JP", "KOREA, REPUBLIC OF": "KR", "SOUTH KOREA": "KR",
    "TAIWAN": "TW", "CHINA": "CN", "HONG KONG": "HK", "INDIA": "IN",
    "BRAZIL": "BR", "CANADA": "CA", "IRELAND": "IE", "LUXEMBOURG": "LU",
    "CAYMAN ISLANDS": "KY", "BERMUDA": "BM", "UNITED STATES": "US", "ISRAEL": "IL"
}
VENUES = {"NYSE": "XNYS", "NASDAQ": "XNAS", "NYSE ARCA": "ARCX", "AMEX": "XASE", "NYSE MKT": "XASE"}
MARKETS = [
    ("DE", "XETR", "Xetra", "EUR"), ("DE", "XFRA", "Frankfurt", "EUR"),
    ("FR", "XPAR", "Paris", "EUR"), ("NL", "XAMS", "Amsterdam", "EUR"),
    ("BE", "XBRU", "Brussels", "EUR"), ("ES", "XMAD", "Madrid", "EUR"),
    ("IT", "XMIL", "Milan", "EUR"), ("AT", "XWBO", "Vienna", "EUR"),
    ("CH", "XSWX", "SIX Swiss", "CHF"), ("GB", "XLON", "London", "GBP"),
    ("SE", "XSTO", "Stockholm", "SEK"), ("DK", "XCSE", "Copenhagen", "DKK"),
    ("NO", "XOSL", "Oslo", "NOK"), ("FI", "XHEL", "Helsinki", "EUR"),
    ("JP", "XTKS", "Tokyo", "JPY"), ("KR", "XKRX", "Korea", "KRW"),
    ("TW", "XTAI", "Taiwan", "TWD"), ("HK", "XHKG", "Hong Kong", "HKD"),
    ("IN", "XNSE", "India NSE", "INR")
]


def write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
    if path.exists() and path.read_text() == text:
        return
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(text)
    temp.replace(path)


def country_from_submission(doc):
    address = doc.get("addresses", {}).get("business", {})
    # EDGAR countryCode is an SEC code (F5 etc), NOT an ISO code.
    label = address.get("country") or address.get("stateOrCountryDescription")
    if label:
        return COUNTRIES.get(label.strip().upper())
    if address.get("isForeignLocation") == 0 and address.get("stateOrCountry"):
        return "US"
    return None


def region(country):
    if country in EUROPE:
        return "EUROPE"
    if country in {"US", "CA"}:
        return "NORTH_AMERICA"
    if country in {"BR", "MX", "AR", "CL", "UY"}:
        return "LATIN_AMERICA"
    if country in {"JP", "KR", "TW", "CN", "HK", "IN"}:
        return "ASIA_PACIFIC"
    return "OTHER" if country else None


class OfficialClient:
    def __init__(self, budget, user_agent):
        self.budget, self.user_agent = budget, user_agent
        self.requests = 0
        self.sec = SECHttpClient(user_agent=user_agent, cache=DiskCache(ROOT / ".sec-cache"),
                                rate_limiter=RateLimiter(rate_per_second=4, burst=1),
                                opener=self._sec_open, max_retries=2)

    def _sec_open(self, url, headers, timeout):
        if self.requests >= self.budget:
            raise RuntimeError("REQUEST_BUDGET_REACHED")
        self.requests += 1
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=timeout) as response:
            data = response.read(32 * 1024 * 1024 + 1)
            if len(data) > 32 * 1024 * 1024:
                raise ValueError("SOURCE_TOO_LARGE")
            if response.headers.get("Content-Encoding") == "gzip":
                import gzip
                data = gzip.decompress(data)
            return data

    def get(self, url):
        if url.startswith("https://data.sec.gov/"):
            return self.sec.get_bytes(url)
        if self.requests >= self.budget:
            raise RuntimeError("REQUEST_BUDGET_REACHED")
        for attempt in range(3):
            if self.requests >= self.budget:
                raise RuntimeError("REQUEST_BUDGET_REACHED")
            self.requests += 1
            time.sleep(0.25)  # < SEC's documented 10 requests/second
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": self.user_agent}), timeout=30) as response:
                    data = response.read(32 * 1024 * 1024 + 1)
                    if len(data) > 32 * 1024 * 1024:
                        raise ValueError("SOURCE_TOO_LARGE")
                    return data
            except urllib.error.HTTPError as error:
                if error.code not in {429, 500, 502, 503, 504} or attempt == 2:
                    raise
                time.sleep(min(2 ** attempt, 4))
        raise RuntimeError("SOURCE_UNAVAILABLE")


def directory_rows(data):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        names = [n for n in archive.namelist() if n.lower().endswith(".csv")]
        if len(names) != 1 or archive.getinfo(names[0]).file_size > 32 * 1024 * 1024:
            raise ValueError("DIRECTORY_ARCHIVE_INVALID")
        rows = list(csv.DictReader(io.StringIO(archive.read(names[0]).decode("utf-8-sig"))))
    if not rows or not {"ticker", "exchange", "priceCurrency", "assetType", "startDate", "endDate"}.issubset(rows[0]):
        raise ValueError("DIRECTORY_SCHEMA_INVALID")
    return rows


def coverage_report(rows, retrieved_at, digest):
    exchanges = Counter(r["exchange"] for r in rows)
    markets = []
    for country, mic, name, currency in MARKETS:
        # Only LSE is actually present among these venues. No suffix guessing.
        codes = ["LSE"] if mic == "XLON" else []
        selected = [r for r in rows if r["exchange"] in codes]
        markets.append({"country": country, "mic": mic, "exchange": name, "currency": currency,
                        "providerExchangeCodes": sorted({r["exchange"] for r in selected}),
                        "directoryRows": len(selected), "equityRows": sum(r["assetType"].lower() == "stock" for r in selected),
                        "observedCurrencies": sorted({r["priceCurrency"] for r in selected}),
                        "symbolFormat": "PROVIDER_DIRECTORY_EXACT" if selected else None,
                        "eod": "DIRECTORY_LISTED_UNPROBED" if selected else "NOT_IN_DIRECTORY",
                        "historical": None, "intraday": None, "realtime": None, "corporateActions": None,
                        "metadata": ["ticker", "exchange", "assetType", "priceCurrency", "startDate", "endDate"],
                        "restriction": "Directory presence is not account entitlement, equity suitability, live coverage or API success."})
    return {"schemaVersion": "tiingo-global-coverage-1.0.0", "source": "https://apimedia.tiingo.com/docs/tiingo/daily/supported_tickers.zip",
            "retrievedAt": retrieved_at, "sha256": digest, "rows": len(rows), "exchanges": dict(exchanges),
            "currencies": dict(Counter(r["priceCurrency"] for r in rows)), "markets": markets,
            "authenticatedProbe": "NOT_CONFIGURED", "note": "No Tiingo key in this runtime. Unknown capabilities stay null. Do not infer OTC ADR quality from Stock assetType."}


def enrich(inst, row, doc, source_time, root):
    ticker = inst["symbol"]
    pairs = list(zip(doc.get("tickers", []), doc.get("exchanges", [])))
    if not any(t == ticker and x.upper() == inst["exchange"].upper() for t, x in pairs):
        raise ValueError("SEC_LISTING_MISMATCH")
    if str(doc.get("cik")).zfill(10) != inst["cik"]:
        raise ValueError("SEC_COMPANY_MISMATCH")
    if row["assetType"].lower() != "stock" or row["exchange"].upper() not in VENUES:
        raise ValueError("NON_EQUITY_OR_OTC")
    country = country_from_submission(doc)
    if not country or country == "US":
        raise ValueError("FOREIGN_COUNTRY_UNRESOLVED")
    if inst.get("active") is not True:
        raise ValueError("INACTIVE_OR_UNKNOWN")
    security_id = inst["masterMemberId"]
    series = root / "quant/data/market/discover-series" / (security_id + ".json")
    has_price = False
    if series.exists():
        data = json.loads(series.read_text())
        points = data.get("points", [])
        has_price = len(points) > 1 and all(isinstance(p[1], (int, float)) and p[1] > 0 for p in points)
    fundamental_path = root / "quant/data/sec/consumer" / ("CIK" + inst["cik"] + ".json")
    reporting_currency = None
    fundamental_coverage = "NONE"
    if fundamental_path.exists():
        fund = json.loads(fundamental_path.read_text())
        units = {v for v in fund.get("units", {}).values() if isinstance(v, str) and len(v) == 3 and v.isupper()}
        reporting_currency = next(iter(units)) if len(units) == 1 else None
        if fund.get("annual", {}).get("revenue"):
            fundamental_coverage = "ANNUAL_AND_INTERIM" if fund.get("quarterly", {}).get("revenue") else "ANNUAL_ONLY"
    adr = inst.get("securityType") == "ADR" and bool(inst.get("adrEvidence"))
    return {"securityId": security_id, "companyId": inst["issuerId"], "listingId": inst["instrumentId"],
            "canonicalSymbol": ticker, "ticker": ticker, "providerSymbol": row["ticker"],
            "providerSymbols": {"tiingo": row["ticker"]}, "exchange": inst["exchange"], "mic": inst["mic"],
            "country": country, "countryBasis": "SEC_BUSINESS_ADDRESS", "region": region(country),
            "domicile": COUNTRIES.get((doc.get("stateOfIncorporationDescription") or "").upper()),
            "listingCountry": "US", "tradingCurrency": row["priceCurrency"], "reportingCurrency": reporting_currency,
            "listingType": "ADR" if adr else "UNVERIFIED", "adrFlag": True if adr else None,
            "ordinaryShareFlag": None, "adrRatio": None, "adrRatioSource": None,
            "primaryListing": None, "assetType": "EQUITY", "active": True, "delisted": False,
            "isin": inst.get("isin"), "figi": inst.get("figi"), "cusip": inst.get("cusip"), "sedol": None, "lei": inst.get("lei"),
            "companyName": doc.get("name"), "cik": inst["cik"], "source": "https://data.sec.gov/submissions/CIK" + inst["cik"] + ".json",
            "sourceUpdatedAt": source_time, "providerDirectoryEnd": row["endDate"],
            "coverage": {"price": "VERIFIED" if has_price else "DIRECTORY_ONLY", "intraday": "UNVERIFIED",
                         "realtime": "UNVERIFIED", "fundamentals": fundamental_coverage, "estimates": "NONE"}}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--directory", type=Path)
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--limit", type=int, default=60)
    parser.add_argument("--user-agent", default="VisionUniverseResearch info@visionuniverse.de")
    args = parser.parse_args(argv)
    if args.limit < 1:
        parser.error("--limit must be positive")
    root = args.root.resolve()
    policy = json.loads((root / "quant/config/global-equities.json").read_text())
    out = args.out or root / "quant/data/universe/global-equities.json"
    cache = root / ".market-cache/global-equities"
    cache.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).isoformat()
    client = OfficialClient(min(args.limit, policy["maxRequestsPerRun"]), args.user_agent)
    directory = args.directory or cache / "supported_tickers.zip"
    if not args.directory and not args.offline and (args.refresh or not directory.exists()):
        directory.write_bytes(client.get(policy["tiingoDirectoryURL"]))
    rows = directory_rows(directory.read_bytes())
    directory_time = datetime.fromtimestamp(directory.stat().st_mtime, timezone.utc).isoformat()
    write_json(out.parent / "tiingo-global-coverage.json", coverage_report(rows, directory_time, hashlib.sha256(directory.read_bytes()).hexdigest()))
    instruments = []
    for path in sorted((root / "quant/data/universe/instruments").glob("*.json")):
        instruments.extend(json.loads(path.read_text())["instruments"])
    by_ticker = {i["symbol"]: i for i in instruments if i.get("primaryListing") and i.get("masterMemberId") and i.get("cik")}
    provider_rows = {(r["ticker"].upper(), r["exchange"].upper()): r for r in rows}
    previous = json.loads(out.read_text()) if out.exists() else {"listings": []}
    listings = {r["securityId"]: r for r in previous["listings"]}
    skipped = []
    for ticker in policy["discoveryCandidates"]:
        try:
            inst = by_ticker.get(ticker)
            if not inst:
                raise ValueError("EXISTING_LISTING_OR_CIK_MISSING")
            row = provider_rows.get((ticker, inst["exchange"].upper()))
            if not row:
                raise ValueError("PROVIDER_LISTING_ABSENT")
            path = cache / ("CIK" + inst["cik"] + ".json")
            if not args.offline and (args.refresh or not path.exists()):
                document = json.loads(client.get(policy["sources"]["SEC"].format(cik=inst["cik"])))
                write_json(path, {"retrievedAt": now, "document": document})
            wrapped = json.loads(path.read_text())
            enriched = enrich(inst, row, wrapped["document"], wrapped["retrievedAt"], root)
            listings[enriched["securityId"]] = enriched
        except (ValueError, OSError, RuntimeError, KeyError) as error:
            # No secrets or complete request/header representations in diagnostics.
            skipped.append({"ticker": ticker, "reason": str(error)[:120]})
    companies = {r["companyId"]: r for r in previous.get("companies", [])}
    for r in listings.values():
        companies[r["companyId"]] = {"companyId": r["companyId"], "companyName": r["companyName"],
            "country": r["country"], "countryBasis": r["countryBasis"], "region": r["region"], "domicile": r["domicile"],
            "cik": r["cik"], "lei": r["lei"], "reportingCurrency": r["reportingCurrency"],
            "assetIdentity": r["companyId"], "source": r["source"], "sourceUpdatedAt": r["sourceUpdatedAt"]}
    # Official-only companies are valid entities, not tradable listings. No
    # local security is activated simply because a financial report exists.
    for path in sorted((root / "quant/data/fundamentals/official").glob("*.json")):
        b = json.loads(path.read_text())
        if b.get("schemaVersion") != "official-filing-1.0.0" or not b.get("companyId") or not b.get("documentSha256"):
            raise ValueError("OFFICIAL_COMPANY_SOURCE_INVALID")
        if b["companyId"] in companies:
            continue
        currencies = {f["currency"] for f in b.get("facts", []) if f.get("currency")}
        companies[b["companyId"]] = {"companyId": b["companyId"], "companyName": b.get("companyName"),
            "country": b.get("country"), "countryBasis": "OFFICIAL_FILING_MANIFEST", "region": region(b.get("country")),
            "domicile": None, "cik": None, "lei": b.get("lei"),
            "reportingCurrency": next(iter(currencies)) if len(currencies) == 1 else None,
            "assetIdentity": b["companyId"], "source": b["sourceDocument"], "sourceUpdatedAt": b["facts"][0]["ingestedAt"] if b.get("facts") else None}
    payload = {"schemaVersion": "global-equities-1.0.0", "policy": "quant/config/global-equities.json",
               "companies": sorted(companies.values(), key=lambda r: r["companyId"]),
               "listings": sorted(listings.values(), key=lambda r: r["securityId"]),
               "countries": dict(Counter(r["country"] for r in listings.values())), "skipped": skipped,
               "membership": "ENRICH_EXISTING_ONLY", "note": "No local listings imported without provider evidence. ADR type and ratio remain nullable unless verified."}
    write_json(out, payload)
    print(json.dumps({"listings": len(listings), "requests": client.requests, "skipped": skipped, "out": str(out)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
