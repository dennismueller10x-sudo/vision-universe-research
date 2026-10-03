"""Reconcile public discovery with bounded, current-account China/global probes.

Read-only inputs; outputs stay in this audit directory. Missing or empty API
responses never become positive coverage. ZIP rows are discovery candidates.
"""
import collections
import csv
import datetime as dt
import json
import math
import re
import urllib.parse
from pathlib import Path
from crosscheck_actions import build as build_action_crosscheck

HERE = Path(__file__).resolve().parent
AUDIT = HERE.parent
ROOT = AUDIT.parents[1]


def load(path, default):
    return json.loads(path.read_text()) if path.exists() else default


def finite(value):
    return isinstance(value, (int, float)) and math.isfinite(value)


def summarize_response(row):
    if not row:
        return {"state": "NOT_RUN", "httpStatus": None}
    payload = row.get("payload")
    result = {"httpStatus": row.get("status"), "url": row.get("url"),
              "observedAt": row.get("observedAt"), "sha256": row.get("sha256"),
              "sourceRunId": row.get("sourceRunId"), "sourceCommit": row.get("sourceCommit"),
              "sourceEvidenceFile": row.get("sourceEvidenceFile")}
    if row.get("status") == 200 and isinstance(payload, dict) and payload.get("ticker"):
        result.update(state="METADATA_RETURNED", metadata=payload)
    elif row.get("status") == 200 and isinstance(payload, list) and "/utilities/search" in row.get("url", ""):
        result.update(state="SEARCH_RETURNED", responseRows=len(payload), results=payload)
    elif row.get("status") == 200 and isinstance(payload, list):
        bars = [b for b in payload if isinstance(b, dict) and b.get("date")
                and all(finite(b.get(k)) for k in ["open", "high", "low", "close"])]
        result.update(state="PRICES_RETURNED" if bars else "EMPTY_OR_NONPRICE_RESPONSE",
                      responseRows=len(payload), usableBars=len(bars))
        if bars:
            bars = sorted(bars, key=lambda b: b["date"])
            dates = [b["date"][:10] for b in bars]
            fields = sorted(set().union(*(b.keys() for b in bars)))
            bad_ohlc = sum(b["low"] > min(b["open"], b["close"])
                           or b["high"] < max(b["open"], b["close"])
                           or b["low"] > b["high"] for b in bars)
            bad_adj = 0
            for b in bars:
                if all(finite(b.get(k)) for k in ["adjOpen", "adjHigh", "adjLow", "adjClose"]):
                    bad_adj += int(b["adjLow"] > min(b["adjOpen"], b["adjClose"])
                                   or b["adjHigh"] < max(b["adjOpen"], b["adjClose"]))
            result.update(firstBar=dates[0], lastBar=dates[-1], latestRawClose=bars[-1]["close"],
                          fields=fields, duplicateDates=len(dates)-len(set(dates)),
                          distinctRawCloseCount=len({b["close"] for b in bars}),
                          zeroRangeBars=sum(b["high"] == b["low"] for b in bars),
                          invalidRawOhlcBars=bad_ohlc, invalidAdjustedOhlcBars=bad_adj,
                          nonpositiveCloseBars=sum(b["close"] <= 0 for b in bars),
                          zeroVolumeBars=sum(b.get("volume") == 0 for b in bars),
                          negativeVolumeBars=sum(finite(b.get("volume")) and b["volume"] < 0 for b in bars),
                          dividendEvents=sum(finite(b.get("divCash")) and b["divCash"] != 0 for b in bars),
                          splitEvents=sum(finite(b.get("splitFactor")) and b["splitFactor"] != 1 for b in bars),
                          sampleHas200Bars=len(bars) >= 200, sampleHas252Bars=len(bars) >= 252,
                          adjustmentSemantics="FIELDS_OBSERVED_EVENTS_REQUIRE_INDEPENDENT_VALIDATION")
            cash_checks = []
            for before, after in zip(bars, bars[1:]):
                if after.get("divCash", 0) and after.get("splitFactor") == 1 and all(finite(b.get("adjClose")) for b in [before, after]):
                    observed = (before["adjClose"] / before["close"]) / (after["adjClose"] / after["close"])
                    expected = after["close"] / (after["close"] + after["divCash"])
                    cash_checks.append({"date": after["date"], "cash": after["divCash"],
                        "observedFactorRatio": observed, "expectedFactorRatio": expected,
                        "absoluteError": abs(observed-expected), "matched": abs(observed-expected) < 1e-7})
            result["dividendAdjustmentChecks"] = cash_checks
            if cash_checks:
                result["adjustmentSemantics"] = "DIVIDEND_FACTOR_MATCHES_EXDATE_CLOSE_OVER_CLOSE_PLUS_CASH" if all(c["matched"] for c in cash_checks) else "DIVIDEND_FACTOR_MISMATCH_REVIEW"
            split_checks = []
            for before, after in zip(bars, bars[1:]):
                split = after.get("splitFactor", 1)
                if finite(split) and split not in [0, 1] and all(finite(b.get("adjClose")) for b in [before, after]):
                    observed = (before["adjClose"] / before["close"]) / (after["adjClose"] / after["close"])
                    cash_factor = after["close"] / (after["close"] + after.get("divCash", 0))
                    expected = cash_factor / split
                    check = {"date": after["date"], "splitFactor": split,
                        "observedPriceFactorRatio": observed, "expectedPriceFactorRatio": expected,
                        "absoluteError": abs(observed-expected), "matched": abs(observed-expected) < 1e-6,
                        "simultaneousDividend": after.get("divCash", 0)}
                    if all(finite(b.get(k)) and b[k] > 0 for b in [before, after] for k in ["volume", "adjVolume"]):
                        volume_ratio = (before["adjVolume"] / before["volume"]) / (after["adjVolume"] / after["volume"])
                        check.update(observedVolumeFactorRatio=volume_ratio, expectedVolumeFactorRatio=split,
                                     volumeMatched=abs(volume_ratio-split) < 1e-6)
                    split_checks.append(check)
            result["splitAdjustmentChecks"] = split_checks
    else:
        text = str(payload)
        if row.get("status") in [401, 403]:
            state = "ACCESS_DENIED"
        elif row.get("status") == 429:
            state = "RATE_LIMITED"
        elif row.get("status") == 404:
            state = "NOT_FOUND_EXACT_ENDPOINT"
        else:
            state = "NO_CONFIRMED_COVERAGE"
        result.update(state=state, providerMessage=text[:1200])
    return result


def main():
    rows = list(csv.DictReader((AUDIT / "endpoints/supported_tickers.csv").open()))
    runtime = load(AUDIT / "runtime/account_evidence.json", {})
    responses = {}
    for row in runtime.get("responses", []):
        for ref in row.get("references", []):
            responses[ref["id"]] = row
    manifest = load(HERE / "probes.json", {"probes": []})
    probe_rows = []
    for ref in manifest["probes"]:
        if ref["path"] == "/tiingo/utilities/search":
            continue
        probe_rows.append({**ref, "evidence": summarize_response(responses.get(ref["id"]))})
    metadata = {r["symbol"]: r["evidence"] for r in probe_rows if r["path"].endswith(r["symbol"])}
    prices = {r["symbol"]: r["evidence"] for r in probe_rows if r["path"].endswith("/prices")}
    # Utility search revealed a newer Nasdaq ADR for SK Hynix. Join bounded
    # supplemental checks without counting its OTC listing as another company.
    for row in runtime.get("responses", []):
        endpoint = urllib.parse.urlsplit(row.get("url", "")).path.lower().rstrip("/")
        if endpoint == "/tiingo/daily/skhy":
            metadata["SKHY"] = summarize_response(row)
        elif endpoint == "/tiingo/daily/skhy/prices":
            prices["SKHY"] = summarize_response(row)
    venues = {"SHG", "SHE", "SHGB", "SHEB"}
    china = [r for r in rows if r["exchange"] in venues]
    china_counts = {exchange: {
        "discoveredRows": len(rs), "uniqueTickers": len({r["ticker"] for r in rs}),
        "providerAssetTypeCounts": dict(collections.Counter(r["assetType"] for r in rs)),
        "currencyCounts": dict(collections.Counter(r["priceCurrency"] for r in rs)),
        "freshDateProxyRows": sum(r["endDate"] >= "2026-09-23" for r in rs),
        "earliestMetadataStart": min(r["startDate"] for r in rs),
        "latestMetadataEnd": max(r["endDate"] for r in rs)}
        for exchange in sorted(venues) if (rs := [r for r in china if r["exchange"] == exchange])}
    account_china = [r for r in probe_rows if r["group"] in ["china_local", "china_etf", "hong_kong_local"]]
    confirmed_china_symbols = sorted({r["symbol"] for r in account_china
                                     if r["evidence"]["state"] == "PRICES_RETURNED"})
    confirmed_local_symbols = [tick for tick in confirmed_china_symbols
        if str(metadata.get(tick, {}).get("metadata", {}).get("ticker", "")).upper() == tick.upper()
        and metadata.get(tick, {}).get("metadata", {}).get("exchangeCode") in venues]
    extra_china_histories = []
    for row in runtime.get("responses", []):
        parsed = urllib.parse.urlsplit(row.get("url", ""))
        query = urllib.parse.parse_qs(parsed.query)
        if parsed.path.lower() in ["/tiingo/daily/600519/prices", "/tiingo/daily/002594/prices"] and query.get("startDate", [""])[0] < "2025-09-01":
            extra_china_histories.append(summarize_response(row))
    action_crosscheck = build_action_crosscheck(runtime, load(HERE / "moutai-split-secondary.json", {}),
        HERE / "tiingo_china_corporate_action_crosscheck.json", load(HERE / "byd-split-secondary.json", {}))
    requested_companies = []
    names = load(ROOT / "quant/data/market/security-master/company-names.json", {}).get("rows", [])
    exchange_names = {}
    for filename, symbol_field in [("nasdaqlisted.txt", "Symbol"), ("otherlisted.txt", "ACT Symbol")]:
        if (HERE / filename).exists():
            for r in csv.DictReader((HERE / filename).open(), delimiter="|"):
                exchange_names[r.get(symbol_field)] = r.get("Security Name", "")
    issuer_forms = {r["symbol"]: r for r in load(HERE / "issuer-listing-forms.json", [])}
    current_master = load(ROOT / "quant/data/market/security-master/us-security-master.json", {}).get("rows", [])
    current_product = load(ROOT / "quant/data/market/security-master/eligibility.json", {}).get("decisions", [])
    raw_vu = load(ROOT / "quant/data/market/scale/universe-FULL_UNIVERSE.json", {}).get("securities", [])
    identity_terms = {"TSM": ["taiwan", "semiconductor"], "BABA": ["alibaba"],
        "XPEV": ["xpeng"], "JD": ["jd"], "BIDU": ["baidu"], "MELI": ["mercado"],
        "SONY": ["sony"], "TM": ["toyota"], "HMC": ["honda"], "NIO": ["nio"],
        "BYDDY": ["byd"], "TCEHY": ["tencent"], "SSNLF": ["samsung"],
        "HXSCL": ["hynix"], "NTDOY": ["nintendo"], "SE": ["sea"],
        "GRAB": ["grab"], "INFY": ["infosys"]}
    identity_terms["SKHY"] = ["hynix"]
    for ref in manifest["probes"]:
        if ref["group"] != "global_select" or "symbol" not in ref or not ref["id"].endswith("-metadata"):
            continue
        tick = ref["symbol"]
        alternate = None
        if tick == "HXSCL" and prices.get("SKHY", {}).get("state") == "PRICES_RETURNED":
            alternate = {"ticker": "HXSCL", "metadata": metadata.get("HXSCL"), "history": prices.get("HXSCL")}
            tick = "SKHY"
        discovered = [r for r in rows if r["ticker"] == tick]
        latest_candidate = max(discovered, key=lambda r: r["endDate"], default={})
        p = prices.get(tick, {"state": "NOT_RUN"})
        m = metadata.get(tick, {"state": "NOT_RUN"})
        venue = latest_candidate.get("exchange")
        evidence_name = m.get("metadata", {}).get("name", "")
        current_name = next((r for r in names if r["ticker"] == tick), {})
        name = exchange_names.get(tick) or evidence_name or current_name.get("companyName", "")
        identity_name = evidence_name or exchange_names.get(tick) or current_name.get("companyName", "")
        identity_text = re.sub(r"[^a-z0-9]+", " ", identity_name.lower())
        # MERCADOLIBRE is one token; use a substring for its unique issuer stem.
        issuer_match = all(term in identity_text for term in identity_terms[tick])
        returned_ticker = m.get("metadata", {}).get("ticker")
        symbol_match = returned_ticker is None or str(returned_ticker).upper() == tick.upper()
        company_coverage = p["state"] == "PRICES_RETURNED" and issuer_match and symbol_match
        kind = "UNKNOWN"
        if "depositary" in name.lower() or "adr" in name.lower() or "ads" in name.lower().split():
            kind = "ADR"
        elif tick in ["MELI", "GRAB"]:
            kind = "US_ORDINARY_LISTING"
        elif issuer_forms.get(tick, {}).get("excerpts"):
            kind = "ADR"
        requested_companies.append({"company": ref["company"], "ticker": tick,
            "listingForm": kind, "listingFormEvidence": "EXCHANGE_SECURITY_NAME_OR_ISSUER_REFERENCE" if kind == "ADR"
                else "COMPANY_SHARE_STRUCTURE_KNOWN_NOT_TIINGO_ASSETTYPE" if kind != "UNKNOWN" else "INSUFFICIENT_PROVIDER_METADATA",
            "venue": venue, "venueClass": "US_PRIMARY" if venue in ["NYSE", "NASDAQ"] else "US_OTC",
            "localListingConfirmed": False, "discoveredRecords": discovered,
            "metadata": m, "history": p,
            "accountPriceCoverage": p["state"] == "PRICES_RETURNED",
            "accountCompanyCoverage": company_coverage,
            "technicalPriceSuitability": "BLOCKED_ZERO_VOLUME_OR_FLAT_QUOTES" if p.get("zeroVolumeBars", 0) > p.get("usableBars", 0) / 2 and company_coverage
                else "PARTIAL_SHORT_HISTORY" if company_coverage and p.get("usableBars", 0) < 252
                else "READY_WITH_EXISTING_US_PIPELINE" if company_coverage and venue in ["NYSE", "NASDAQ"]
                else "PARTIAL_OTC_VENUE_LIQUIDITY_POLICY_REQUIRED" if company_coverage else "BLOCKED_NO_CONFIRMED_COMPANY_PRICES",
            "issuerIdentityMatched": issuer_match, "metadataTickerMatched": symbol_match,
            "identityNameUsed": identity_name,
            "alternateListingEvidence": alternate,
            "vuRawUniverseMember": any(r["ticker"] == tick for r in raw_vu),
            "vuSecurityMasterRows": [r for r in current_master if r["ticker"] == tick],
            "vuProductDecisions": [r for r in current_product if r["ticker"] == tick],
            "existingResolvedName": current_name.get("companyName"),
            "exchangeDirectorySecurityName": exchange_names.get(tick),
            "issuerListingFormReference": issuer_forms.get(tick),
            "qualification": "OTC availability does not establish liquid, executable local-primary equivalence"
                if venue not in ["NYSE", "NASDAQ"] else "US listing represents US venue, currency and trading sessions"})
    common = {"schemaVersion": 1, "auditDate": "2026-10-02",
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "evidenceSource": "PUBLIC_PROVIDER_ZIP_PLUS_BOUNDED_CURRENT_ACCOUNT_API",
        "accountRunId": runtime.get("runId"), "accountAuthentication": runtime.get("authentication", "NOT_RUN"),
        "protectedOutputsModified": False}
    china_report = {**common, "discovery": {"rows": len(china), "uniqueTickers": len({r["ticker"] for r in china}),
        "byExchange": china_counts, "providerAssetTypeCounts": dict(collections.Counter(r["assetType"] for r in china)),
        "hongKongExchangeRows": 0,
        "limitations": ["Provider ZIP includes reserved symbols; discovery is not account entitlement.",
            "Stock is a provider label, not verified common equity. Famous mainland ETFs are mislabeled Stock.",
            "Date freshness is not active-listing confirmation; B-share venue labels may be historical aliases.",
            "HKD currency rows are Shenzhen B shares; they are not Hong Kong local listings."]},
        "accountConfirmedSamplePriceSymbols": confirmed_china_symbols,
        "accountConfirmedLocalListingSamples": confirmed_local_symbols,
        "freshAccountConfirmedLocalSampleSymbols": [tick for tick in confirmed_local_symbols if prices[tick].get("lastBar", "") >= "2026-09-23"],
        "staleAccountConfirmedLocalSampleSymbols": [tick for tick in confirmed_local_symbols if prices[tick].get("lastBar", "") < "2026-09-23"],
        "sampleCurrenciesBySymbol": {tick: sorted({r["priceCurrency"] for r in china if r["ticker"] == tick}) for tick in confirmed_local_symbols},
        "currencyEvidence": "PUBLIC_PROVIDER_DISCOVERY_CSV; prices do not carry currency",
        "additionalHistoryEvidence": extra_china_histories,
        "corporateActionCrosscheck": action_crosscheck,
        "historicalBacktestFitness": "BLOCKED_PENDING_CORPORATE_ACTION_RECONCILIATION" if action_crosscheck.get("checks") else "UNVERIFIED_MAINLAND_SPLIT_SEMANTICS",
        "automaticTechnicalProductActivation": "BLOCKED_PENDING_CORPORATE_ACTION_RECONCILIATION" if action_crosscheck.get("checks") else "PARTIAL_NOT_IN_PRODUCTION_PIPELINE",
        "bydTargetedSplitWindowCorrection": "2025-05-20..2025-06-30 did not target the mainland split. Secondary reference places 3:1 on 2025-07-29; absence in earlier window is not provider failure.",
        "exactAccountAccessibleUniverseCount": None,
        "publicProviderChineseAggregate": load(AUDIT / "endpoints/public_tiingo_stats.json", {}).get("response", {}).get("data", {}).get("numOfAllPriceDataChineseStocks"),
        "publicAggregateContradictedByLiveAccountSamples": bool(confirmed_local_symbols),
        "chinaLinkedUsBridgeSample": [{"company": r["company"], "ticker": r["ticker"],
            "venueClass": r["venueClass"], "accountCompanyCoverage": r["accountCompanyCoverage"],
            "listingForm": r["listingForm"], "lastBar": r["history"].get("lastBar")}
            for r in requested_companies if r["ticker"] in ["BABA", "XPEV", "JD", "BIDU", "NIO", "BYDDY", "TCEHY"]],
        "chinaBridgeRegionBasis": "Chinese operating companies in requested sample; not legal issuer domicile classification",
        "entireUniverseEntitlement": "UNKNOWN_UNLESS_ALL_SYMBOLS_INDIVIDUALLY_CHECKED",
        "probes": account_china,
        "productFitness": "PARTIAL_NEEDS_LOCAL_VENUE_CALENDARS_CURRENCY_IDENTITY_AND_ADJUSTMENT_VALIDATION"
            if confirmed_local_symbols else "BLOCKED_NO_ACCOUNT_CONFIRMED_LOCAL_PRICES"}
    global_report = {**common, "referenceTotal": len(requested_companies),
        "discoveredCandidateCompanies": sum(bool(r["discoveredRecords"]) for r in requested_companies),
        "accountConfirmedPriceCandidates": sum(r["accountPriceCoverage"] for r in requested_companies),
        "accountConfirmedPriceCompanies": sum(r["accountCompanyCoverage"] for r in requested_companies),
        "accountConfirmedUsPrimaryCompanies": sum(r["accountCompanyCoverage"] and r["venueClass"] == "US_PRIMARY" for r in requested_companies),
        "accountConfirmedOtcCompanies": sum(r["accountCompanyCoverage"] and r["venueClass"] == "US_OTC" for r in requested_companies),
        "confirmedListingCountIncludingAlternates": sum(r["accountPriceCoverage"] for r in requested_companies)
            + sum(bool(r.get("alternateListingEvidence")) and r["alternateListingEvidence"]["history"]["state"] == "PRICES_RETURNED" for r in requested_companies),
        "localListingsConfirmed": 0, "companies": requested_companies,
        "hynixSearch": summarize_response(responses.get("global-hynix-search")),
        "hynixPrimaryCandidateDiscovered": "SKHY",
        "hynixPrimaryCandidateValidated": prices.get("SKHY", {}).get("state") == "PRICES_RETURNED",
        "limitations": ["Selected large global companies are a convenience sample, not most globally important companies by count or capitalization.",
            "ADR and ordinary US listing differ from local listing; OTC quotes do not establish comparable liquidity.",
            "Known company listing-form expectations are not encoded in ZIP Stock labels; UNKNOWN retained when unverified."]}
    for filename, report in [("tiingo_china_coverage.json", china_report),
                             ("tiingo_global_select_coverage.json", global_report)]:
        (HERE / filename).write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"chinaDiscoveryRows": len(china), "chinaAccountPriceSamples": len(confirmed_china_symbols),
                      "globalReference": len(requested_companies), "globalPriceConfirmed": global_report["accountConfirmedPriceCompanies"]}))


if __name__ == "__main__":
    main()
