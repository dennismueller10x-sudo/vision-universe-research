#!/usr/bin/env python3
"""Fetch a curated fundamentals snapshot from Twelve Data's /statistics endpoint.

This is a separate, manually-triggered pipeline from fetch_market_data.py.
It never touches market_data.json, technical_scores.json, technical_scenarios.json
or backtest_results.json, and it only ever updates the symbols explicitly passed
via --symbols so a single low-volume run cannot burn through the whole
free-tier credit budget by accident.
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
BASE_URL = "https://api.twelvedata.com/statistics"
REQUEST_PAUSE_SECONDS = 8
SCHEMA_VERSION = 2

# One /statistics call costs 1 API credit and returns all of these groups at once,
# so the curated set below adds no extra credit cost over just fetching pe_ratio/ps_ratio.
CURATED_FIELDS = [
    "market_capitalization", "enterprise_value",
    "pe_ratio_ttm", "pe_ratio_forward", "ps_ratio_ttm",
    "ev_to_revenue", "ev_to_ebitda", "ev_to_fcf", "price_to_book", "peg_ratio",
    "gross_margin_pct", "operating_margin_pct", "net_margin_pct", "return_on_equity_pct",
    "revenue_growth_yoy_pct", "earnings_growth_yoy_pct",
    "debt_to_equity", "dividend_yield_pct",
    "free_cash_flow_ttm", "shares_outstanding",
]


def dig(payload, *path):
    node = payload
    for key in path:
        if not isinstance(node, dict):
            return None
        node = node.get(key)
    return node


def extract_metrics(payload):
    stats = payload.get("statistics", {})
    valuations = stats.get("valuations_metrics", {}) or {}
    financials = stats.get("financials", {}) or {}
    income = financials.get("income_statement", {}) or {}
    balance = financials.get("balance_sheet", {}) or {}
    cash_flow = financials.get("cash_flow", {}) or {}
    stock_stats = stats.get("stock_statistics", {}) or {}
    dividends = stats.get("dividends_and_splits", {}) or {}

    enterprise_value = valuations.get("enterprise_value")
    levered_fcf = cash_flow.get("levered_free_cash_flow_ttm")
    ev_to_fcf = None
    if isinstance(enterprise_value, (int, float)) and isinstance(levered_fcf, (int, float)) and levered_fcf:
        ev_to_fcf = round(enterprise_value / levered_fcf, 2)

    values = {
        "market_capitalization": valuations.get("market_capitalization"),
        "enterprise_value": enterprise_value,
        "pe_ratio_ttm": valuations.get("trailing_pe"),
        "pe_ratio_forward": valuations.get("forward_pe"),
        "ps_ratio_ttm": valuations.get("price_to_sales_ttm"),
        "ev_to_revenue": valuations.get("enterprise_to_revenue"),
        "ev_to_ebitda": valuations.get("enterprise_to_ebitda"),
        "ev_to_fcf": ev_to_fcf,
        "price_to_book": valuations.get("price_to_book_mrq"),
        "peg_ratio": valuations.get("peg_ratio"),
        "gross_margin_pct": financials.get("gross_margin"),
        "operating_margin_pct": financials.get("operating_margin"),
        "net_margin_pct": financials.get("profit_margin"),
        "return_on_equity_pct": financials.get("return_on_equity_ttm"),
        "revenue_growth_yoy_pct": income.get("quarterly_revenue_growth_yoy"),
        "earnings_growth_yoy_pct": income.get("quarterly_earnings_growth_yoy"),
        "debt_to_equity": balance.get("total_debt_to_equity_mrq"),
        "dividend_yield_pct": dividends.get("forward_annual_dividend_yield") or dividends.get("trailing_annual_dividend_yield"),
        "free_cash_flow_ttm": levered_fcf,
        "shares_outstanding": stock_stats.get("shares_outstanding"),
    }
    return {key: values.get(key) for key in CURATED_FIELDS}


def fetch_symbol(symbol, api_key):
    query = urlencode({"symbol": symbol, "apikey": api_key})
    try:
        with urlopen(f"{BASE_URL}?{query}", timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Could not fetch {symbol}: {type(error).__name__}") from error
    if payload.get("status") == "error" or "statistics" not in payload:
        message = payload.get("message", "provider returned no statistics")
        raise RuntimeError(f"Could not fetch {symbol}: {message}")
    metrics = extract_metrics(payload)
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
    parser.add_argument("--api-key", default=os.environ.get("TWELVE_DATA_API_KEY"))
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    if not args.api_key:
        raise SystemExit("TWELVE_DATA_API_KEY is required.")
    symbols = [s.strip().upper() for s in args.symbols.split(",") if s.strip()]
    if not symbols:
        raise SystemExit("--symbols must name at least one symbol.")

    result = load_existing()
    generated_at = datetime.now(timezone.utc).isoformat()
    for index, symbol in enumerate(symbols):
        print(f"Fetching {symbol} ({index + 1}/{len(symbols)})...", file=sys.stderr)
        metrics = fetch_symbol(symbol, args.api_key)
        metrics["data_as_of"] = generated_at
        metrics["source"] = "twelvedata_statistics"
        result["symbols"][symbol] = metrics
        if index < len(symbols) - 1:
            time.sleep(REQUEST_PAUSE_SECONDS)

    result["schema_version"] = SCHEMA_VERSION
    result["generated_at_utc"] = generated_at
    result["provider"] = "Twelve Data"
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
