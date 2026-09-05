#!/usr/bin/env python3
"""Fetch analyst recommendation trends (Finnhub) and price targets
(Finnhub, falling back to Financial Modeling Prep) for the dashboard.

Uses the central universe file (dashboard/config/universe.json). Only stocks
are queried; benchmarks (ETFs) have no analyst coverage on either provider.
"""
import argparse
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[2]
UNIVERSE = ROOT / "dashboard" / "config" / "universe.json"
OUTPUT = ROOT / "dashboard" / "data" / "analyst_ratings.json"
FINNHUB_BASE_URL = "https://finnhub.io/api/v1"
FMP_BASE_URL = "https://financialmodelingprep.com/stable"
REQUEST_PAUSE_SECONDS = 1.1
MAX_CALLS_PER_RUN = 100
_call_count = 0


def load_symbols():
    with UNIVERSE.open(encoding="utf-8") as handle:
        universe = json.load(handle)
    symbols = [entry["symbol"] for entry in universe.get("stocks", []) if entry.get("active")]
    if not symbols or len(symbols) != len(set(symbols)):
        raise ValueError("Universe must contain unique active stock symbols.")
    return symbols


class PlanLimitError(RuntimeError):
    """Raised when a provider denies access because the endpoint needs a paid plan."""


def _fetch(url, provider, path, symbol):
    global _call_count
    _call_count += 1
    if _call_count > MAX_CALLS_PER_RUN:
        raise SystemExit(
            f"Aborting: exceeded safety ceiling of {MAX_CALLS_PER_RUN} API calls in one run."
        )
    try:
        with urlopen(url, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        if error.code in (401, 403):
            raise PlanLimitError(
                f"Could not fetch {provider} {path} for {symbol}: access denied (HTTP {error.code}). "
                "This endpoint may require a paid plan."
            ) from error
        raise RuntimeError(f"Could not fetch {provider} {path} for {symbol}: HTTP {error.code}") from error
    except (URLError, TimeoutError, json.JSONDecodeError) as error:
        raise RuntimeError(
            f"Could not fetch {provider} {path} for {symbol}: {type(error).__name__}"
        ) from error


def fetch_json(path, symbol, api_key):
    query = urlencode({"symbol": symbol, "token": api_key})
    return _fetch(f"{FINNHUB_BASE_URL}{path}?{query}", "Finnhub", path, symbol)


def fetch_fmp_json(path, symbol, api_key):
    query = urlencode({"symbol": symbol, "apikey": api_key})
    return _fetch(f"{FMP_BASE_URL}{path}?{query}", "FMP", path, symbol)


TREND_HISTORY_LENGTH = 6


def consensus_score(period):
    weighted = 2 * period["strongBuy"] + period["buy"] - period["sell"] - 2 * period["strongSell"]
    total = period["strongBuy"] + period["buy"] + period["hold"] + period["sell"] + period["strongSell"]
    return None if total == 0 else weighted / total


def consensus_label(period):
    score = consensus_score(period)
    if score is None:
        return "no_coverage"
    if score > 1:
        return "strong_buy"
    if score > 0.3:
        return "buy"
    if score >= -0.3:
        return "hold"
    if score >= -1:
        return "sell"
    return "strong_sell"


def fetch_price_target(symbol, api_key, fmp_api_key):
    """Try Finnhub first (works on a sufficiently high plan), then fall back
    to FMP's price-target-consensus (free-tier eligible on some accounts)."""
    try:
        target = fetch_json("/stock/price-target", symbol, api_key)
    except PlanLimitError as error:
        print(f"::warning::{error} Falling back to FMP for {symbol}.")
        target = None
    else:
        if target and target.get("targetMean") is not None:
            return {
                "targetHigh": target.get("targetHigh"),
                "targetLow": target.get("targetLow"),
                "targetMean": target.get("targetMean"),
                "targetMedian": target.get("targetMedian"),
                "numberAnalysts": target.get("numberAnalysts"),
                "lastUpdated": target.get("lastUpdated"),
            }, "Finnhub"

    if not fmp_api_key:
        return None, None
    try:
        fmp_target = fetch_fmp_json("/price-target-consensus", symbol, fmp_api_key)
    except PlanLimitError as error:
        print(f"::warning::{error} Continuing without a price target for {symbol}.")
        return None, None
    if isinstance(fmp_target, list):
        fmp_target = fmp_target[0] if fmp_target else None
    if not fmp_target or fmp_target.get("targetConsensus") is None:
        return None, None
    return {
        "targetHigh": fmp_target.get("targetHigh"),
        "targetLow": fmp_target.get("targetLow"),
        "targetMean": fmp_target.get("targetConsensus"),
        "targetMedian": fmp_target.get("targetMedian"),
        "numberAnalysts": None,
        "lastUpdated": None,
    }, "FMP"


def fetch_symbol(symbol, api_key, fmp_api_key):
    trends = fetch_json("/stock/recommendation", symbol, api_key)
    if not isinstance(trends, list) or not trends:
        raise RuntimeError(f"No recommendation trend data for {symbol}")
    trends = sorted(trends, key=lambda item: item["period"], reverse=True)[:TREND_HISTORY_LENGTH]
    trend_history = [
        {
            "period": period["period"],
            "strongBuy": int(period["strongBuy"]),
            "buy": int(period["buy"]),
            "hold": int(period["hold"]),
            "sell": int(period["sell"]),
            "strongSell": int(period["strongSell"]),
        }
        for period in trends
    ]
    latest = trend_history[0]
    price_target, price_target_provider = fetch_price_target(symbol, api_key, fmp_api_key)
    return {
        "trend_history": trend_history,
        "consensus_label": consensus_label(latest),
        "consensus_score": consensus_score(latest),
        "previous_consensus_label": consensus_label(trend_history[1]) if len(trend_history) > 1 else None,
        "price_target": price_target,
        "price_target_provider": price_target_provider,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-key", default=os.environ.get("FINNHUB_API_KEY"))
    parser.add_argument("--fmp-api-key", default=os.environ.get("FMP_API_KEY"))
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    if not args.api_key:
        raise SystemExit("FINNHUB_API_KEY is required.")
    if not args.fmp_api_key:
        print("::warning::FMP_API_KEY not set; price targets will only use Finnhub.")
    symbols = load_symbols()
    data = {}
    for index, symbol in enumerate(symbols):
        data[symbol] = fetch_symbol(symbol, args.api_key, args.fmp_api_key)
        if index < len(symbols) - 1:
            time.sleep(REQUEST_PAUSE_SECONDS)
    result = {
        "schema_version": 1,
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "provider": "Finnhub + FMP",
        "symbols": data,
        "status": "generated",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
