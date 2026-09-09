"""Current SEC company/security universe without security-master overclaims.

The SEC ticker/exchange file is a *current mapping observation*.  It is not a
listing history, does not identify share classes with a permanent instrument
identifier and does not prove that a security is active or investable.  This
module therefore keeps Company (CIK) and SecurityMapping as separate records and
uses UNKNOWN wherever the source cannot support a stronger statement.
"""
from dataclasses import dataclass, field
from datetime import datetime, timezone
import hashlib

from .provider import normalize_cik


SOURCE_SEC_TICKER_EXCHANGE = "SEC_COMPANY_TICKERS_EXCHANGE"
UNKNOWN = "UNKNOWN"


def _utcnow():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def company_id(cik):
    return f"sec_company_{normalize_cik(cik)}"


def security_mapping_id(cik, ticker, exchange):
    """Identity of this SEC mapping observation, not a permanent security ID."""
    material = f"{normalize_cik(cik)}|{ticker}|{exchange or ''}".encode("utf-8")
    return "sec_mapping_" + hashlib.sha256(material).hexdigest()[:20]


@dataclass
class Company:
    company_id: str
    cik: str
    name: str
    entity_type: str = UNKNOWN
    source: str = SOURCE_SEC_TICKER_EXCHANGE
    observed_at: str = ""
    available_at: str = ""
    security_mapping_ids: list = field(default_factory=list)

    def to_dict(self):
        return {
            "companyId": self.company_id,
            "cik": self.cik,
            "name": self.name,
            "entityType": self.entity_type,
            "source": self.source,
            "observedAt": self.observed_at,
            "availableAt": self.available_at,
            "securityMappingIds": list(self.security_mapping_ids),
        }


@dataclass(frozen=True)
class SecurityMapping:
    security_mapping_id: str
    company_id: str
    ticker: str
    exchange: str
    security_type: str = UNKNOWN
    listing_status: str = UNKNOWN
    source: str = SOURCE_SEC_TICKER_EXCHANGE
    observed_at: str = ""
    available_at: str = ""

    def to_dict(self):
        return {
            "securityMappingId": self.security_mapping_id,
            "companyId": self.company_id,
            "ticker": self.ticker,
            "exchange": self.exchange,
            "securityType": self.security_type,
            "listingStatus": self.listing_status,
            "currentSecMapping": True,
            "source": self.source,
            "observedAt": self.observed_at,
            "availableAt": self.available_at,
        }


def parse_ticker_exchange(payload, observed_at=None):
    """Parse company_tickers_exchange.json into separate company/security rows."""
    observed_at = observed_at or payload.get("_retrieved_at") or _utcnow()
    fields = payload.get("fields") or []
    data = payload.get("data") or []
    required = {"cik", "name", "ticker", "exchange"}
    if not required.issubset(fields):
        raise ValueError(
            "SEC ticker/exchange response lacks required fields: "
            + ", ".join(sorted(required - set(fields)))
        )
    positions = {name: fields.index(name) for name in required}
    companies = {}
    mappings = {}

    for raw in data:
        if not isinstance(raw, (list, tuple)) or len(raw) < len(fields):
            continue
        ticker = str(raw[positions["ticker"]] or "").strip().upper()
        if not ticker:
            continue
        cik = normalize_cik(raw[positions["cik"]])
        name = str(raw[positions["name"]] or "").strip()
        exchange = str(raw[positions["exchange"]] or UNKNOWN).strip() or UNKNOWN
        cid = company_id(cik)
        mid = security_mapping_id(cik, ticker, exchange)
        if cid not in companies:
            companies[cid] = Company(
                company_id=cid,
                cik=cik,
                name=name,
                observed_at=observed_at,
                available_at=observed_at,
            )
        mappings[mid] = SecurityMapping(
            security_mapping_id=mid,
            company_id=cid,
            ticker=ticker,
            exchange=exchange,
            observed_at=observed_at,
            available_at=observed_at,
        )
        if mid not in companies[cid].security_mapping_ids:
            companies[cid].security_mapping_ids.append(mid)

    for company in companies.values():
        company.security_mapping_ids.sort()
    return sorted(companies.values(), key=lambda row: row.cik), sorted(
        mappings.values(), key=lambda row: (row.company_id, row.ticker, row.exchange)
    )


def build_current_universe(payload, observed_at=None):
    companies, mappings = parse_ticker_exchange(payload, observed_at=observed_at)
    stamp = observed_at or payload.get("_retrieved_at") or (
        companies[0].observed_at if companies else _utcnow()
    )
    return {
        "schemaVersion": 1,
        "universeType": "CURRENT_SEC_MAPPING",
        "survivorshipFree": False,
        "historicalInvestableUniverse": False,
        "securityMasterStatus": "EXTERNAL_SECURITY_MASTER_REQUIRED",
        "observedAt": stamp,
        "availableAt": stamp,
        "source": SOURCE_SEC_TICKER_EXCHANGE,
        "companies": [row.to_dict() for row in companies],
        "securityMappings": [row.to_dict() for row in mappings],
        "counts": {
            "companies": len(companies),
            "securityMappings": len(mappings),
        },
    }


def gate_sample(universe, size, golden_companies=()):
    """Deterministic company sample spread across exchanges and ticker initials.

    SEC provides neither market cap nor a reliable sector in this endpoint, so
    this function makes no size/sector-diversification claim.  It does avoid a
    top-of-file or mega-cap-only sample and always retains the declared Golden
    CIKs when they exist in the current map.
    """
    if size < 1:
        raise ValueError("sample size must be positive")
    companies = {row["companyId"]: row for row in universe.get("companies", [])}
    by_company = {}
    for mapping in universe.get("securityMappings", []):
        by_company.setdefault(mapping["companyId"], []).append(mapping)

    rows = []
    for cid, company in companies.items():
        mappings = sorted(by_company.get(cid, []), key=lambda row: (
            row.get("exchange") or UNKNOWN, row.get("ticker") or ""))
        if not mappings:
            continue
        representative = mappings[0]
        rows.append({
            "companyId": cid,
            "cik": company["cik"],
            "name": company["name"],
            "representativeTicker": representative["ticker"],
            "representativeExchange": representative["exchange"],
            "securityMappingCount": len(mappings),
        })

    golden_entries = []
    for item in golden_companies:
        if isinstance(item, dict):
            golden_entries.append({**item, "cik": normalize_cik(item["cik"])})
        else:
            golden_entries.append({"cik": normalize_cik(item)})
    golden = {item["cik"] for item in golden_entries}
    selected = [row for row in rows if row["cik"] in golden]
    present = {row["cik"] for row in selected}
    # A reorganisation can move the current ticker mapping to a successor CIK
    # while the validated history stays on the predecessor (the measured XOM
    # case). Golden regression entities remain explicit inputs even then.
    for item in golden_entries:
        if item["cik"] in present:
            continue
        selected.append({
            "companyId": company_id(item["cik"]),
            "cik": item["cik"],
            "name": item.get("name") or "",
            "representativeTicker": item.get("ticker"),
            "representativeExchange": UNKNOWN,
            "securityMappingCount": 0,
            "currentSecMapping": False,
            "inclusionReason": "GOLDEN_BASELINE_OVERRIDE",
        })
    selected_ciks = {row["cik"] for row in selected}

    # Round-robin over source-observable strata. Hash order is stable and avoids
    # treating the SEC file's presentation order as a ranking.
    buckets = {}
    for row in rows:
        if row["cik"] in selected_ciks:
            continue
        ticker = row["representativeTicker"]
        key = (row["representativeExchange"], ticker[:1] or "#")
        buckets.setdefault(key, []).append(row)
    for bucket in buckets.values():
        bucket.sort(key=lambda row: hashlib.sha256(row["cik"].encode()).hexdigest())

    keys = sorted(buckets)
    while len(selected) < min(size, len(rows)) and keys:
        next_keys = []
        for key in keys:
            bucket = buckets[key]
            if bucket and len(selected) < size:
                selected.append(bucket.pop(0))
            if bucket:
                next_keys.append(key)
        keys = next_keys

    selected = selected[:size]
    return {
        "schemaVersion": 1,
        "universeType": "SEC_SCALE_GATE_SAMPLE",
        "requestedSize": size,
        "actualSize": len(selected),
        "sourceUniverseObservedAt": universe.get("observedAt"),
        "diversificationBasis": ["exchange", "ticker_initial"],
        "limitations": [
            "SEC ticker/exchange data has no market capitalization",
            "sector diversification requires a later company-profile enrichment pass",
            "this is not a historical investable or survivorship-free universe",
        ],
        "companies": selected,
    }
