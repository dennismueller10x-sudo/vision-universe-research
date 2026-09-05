#!/usr/bin/env python3
"""Fetch a curated fundamentals snapshot from Financial Modeling Prep (FMP).

This is a separate, manually-triggered pipeline from fetch_market_data.py.
It never touches market_data.json, technical_scores.json, technical_scenarios.json
or backtest_results.json, and it only ever updates the symbols explicitly passed
via --symbols so a single low-volume run cannot burn through the whole
free-tier request budget by accident.

Switched from Twelve Data to FMP because Twelve Data's /statistics endpoint
(fundamentals) requires a Pro-or-above plan; FMP's free tier (250 requests/day)
includes profile, ratios-ttm, key-metrics-ttm and financial-growth for US stocks,
which covers the curated fields below with 4 requests per symbol.
"""
import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "dashboard" / "data" / "fundamental_metrics.json"
BASE_URL = "https://financialmodelingprep.com/stable"
REQUEST_PAUSE_SECONDS = 2
SCHEMA_VERSION = 3

# 4 FMP requests per symbol (profile, ratios-ttm, key-metrics-ttm, financial-growth).
# FMP's free tier does not include forward P/E estimates, so pe_ratio_forward stays null.
CURATED_FIELDS = [
    "market_capitalization", "enterprise_value",
    "pe_ratio_ttm", "pe_ratio_forward", "ps_ratio_ttm",
    "ev_to_revenue", "ev_to_ebitda", "ev_to_fcf", "price_to_book", "peg_ratio",
    "gross_margin_pct", "operating_margin_pct", "net_margin_pct", "return_on_equity_pct",
    "revenue_growth_yoy_pct", "earnings_growth_yoy_pct",
    "debt_to_equity", "dividend_yield_pct",
    "free_cash_flow_ttm", "shares_outstanding",
]


def fmp_get(endpoint, symbol, api_key, extra_params=None):
    params = {"symbol": symbol, "apikey": api_key}
    if extra_params:
        params.update(extra_params)
    url = f"{BASE_URL}/{endpoint}?{urlencode(params)}"
    try:
        with urlopen(url, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Could not fetch {endpoint} for {symbol}: HTTP {error.code} {error.reason} - {body}") from error
    except (URLError, TimeoutError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Could not fetch {endpoint} for {symbol}: {type(error).__name__}") from error
    if isinstance(payload, dict) and ("Error Message" in payload or payload.get("error")):
        raise RuntimeError(f"Could not fetch {endpoint} for {symbol}: {payload}")
    if isinstance(payload, list):
        return payload[0] if payload else {}
    return payload or {}


def pct(value):
    return round(value * 100, 4) if isinstance(value, (int, float)) else None


def extract_metrics(profile, ratios, key_metrics, growth):
    market_cap = profile.get("marketCap")
    price = profile.get("price")
    shares_outstanding = None
    if isinstance(market_cap, (int, float)) and isinstance(price, (int, float)) and price:
        shares_outstanding = round(market_cap / price)

    enterprise_value = key_metrics.get("enterpriseValueTTM")
    free_cash_flow_yield = key_metrics.get("freeCashFlowYieldTTM")
    free_cash_flow_ttm = None
    if isinstance(free_cash_flow_yield, (int, float)) and isinstance(market_cap, (int, float)):
        free_cash_flow_ttm = round(free_cash_flow_yield * market_cap)

    ev_to_fcf = key_metrics.get("evToFreeCashFlowTTM")
    if ev_to_fcf is None and isinstance(enterprise_value, (int, float)) and free_cash_flow_ttm:
        ev_to_fcf = round(enterprise_value / free_cash_flow_ttm, 2)

    values = {
        "market_capitalization": market_cap,
        "enterprise_value": enterprise_value,
        "pe_ratio_ttm": ratios.get("priceToEarningsRatioTTM"),
        "pe_ratio_forward": None,
        "ps_ratio_ttm": ratios.get("priceToSalesRatioTTM"),
        "ev_to_revenue": key_metrics.get("evToSalesTTM"),
        "ev_to_ebitda": key_metrics.get("evToEBITDATTM"),
        "ev_to_fcf": ev_to_fcf,
        "price_to_book": ratios.get("priceToBookRatioTTM"),
        "peg_ratio": ratios.get("priceToEarningsGrowthRatioTTM"),
        "gross_margin_pct": pct(ratios.get("grossProfitMarginTTM")),
        "operating_margin_pct": pct(ratios.get("operatingProfitMarginTTM")),
        "net_margin_pct": pct(ratios.get("netProfitMarginTTM")),
        "return_on_equity_pct": pct(key_metrics.get("returnOnEquityTTM")),
        "revenue_growth_yoy_pct": pct(growth.get("revenueGrowth")),
        "earnings_growth_yoy_pct": pct(growth.get("netIncomeGrowth")),
        "debt_to_equity": ratios.get("debtToEquityRatioTTM"),
        "dividend_yield_pct": pct(ratios.get("dividendYieldTTM")),
        "free_cash_flow_ttm": free_cash_flow_ttm,
        "shares_outstanding": shares_outstanding,
    }
    return {key: values.get(key) for key in CURATED_FIELDS}


def fetch_symbol(symbol, api_key):
    profile = fmp_get("profile", symbol, api_key)
    ratios = fmp_get("ratios-ttm", symbol, api_key)
    key_metrics = fmp_get("key-metrics-ttm", symbol, api_key)
    growth = fmp_get("financial-growth", symbol, api_key, {"period": "quarterly", "limit": 1})
    if not profile:
        raise RuntimeError(f"Could not fetch {symbol}: profile endpoint returned no data (invalid symbol or plan restriction)")
    metrics = extract_metrics(profile, ratios, key_metrics, growth)
    missing = [key for key, value in metrics.items() if value is None]
    if missing:
        print(f"  note: {symbol} has no data for: {', '.join(missing)}", file=sys.stderr)
    return metrics


def load_existing():
    if not OUTPUT.exists():
        return {"schema_version": SCHEMA_VERSION, "symbols": {}}
    with OUTPUT.open(encoding="utf-8") as handle:
        existing = json.load(handle)
    if existing.get("schema_version") != SCHEMA_VERSION:
        existing = {"schema_version": SCHEMA_VERSION, "symbols": {}}
    existing.setdefault("symbols", {})
    return existing


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--symbols", required=True, help="Comma-separated symbols, e.g. AMZN or AMZN,NVDA")
    parser.add_argument("--api-key", default=os.environ.get("FMP_API_KEY"))
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    if not args.api_key:
        raise SystemExit("FMP_API_KEY is required.")
    symbols = [s.strip().upper() for s in args.symbols.split(",") if s.strip()]
    if not symbols:
        raise SystemExit("--symbols must name at least one symbol.")

    result = load_existing()
    generated_at = datetime.now(timezone.utc).isoformat()
    for index, symbol in enumerate(symbols):
        print(f"Fetching {symbol} ({index + 1}/{len(symbols)})...", file=sys.stderr)
        legacy = (result["symbols"].get(symbol) or {}).get("legacy")
        metrics = fetch_symbol(symbol, args.api_key)
        metrics["data_as_of"] = generated_at
        metrics["source"] = "fmp_stable"
        metrics["legacy"] = legacy
        result["symbols"][symbol] = metrics
        if index < len(symbols) - 1:
            time.sleep(REQUEST_PAUSE_SECONDS)

    result["schema_version"] = SCHEMA_VERSION
    result["generated_at_utc"] = generated_at
    result["provider"] = "Financial Modeling Prep"
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
