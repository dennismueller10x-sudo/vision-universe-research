#!/usr/bin/env python3
"""Fetch daily OHLCV data from Twelve Data using the central universe file."""
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
OUTPUT = ROOT / "dashboard" / "data" / "market_data.json"
BASE_URL = "https://api.twelvedata.com/time_series"
REQUEST_PAUSE_SECONDS = 8

def load_symbols():
    with UNIVERSE.open(encoding="utf-8") as handle:
        universe = json.load(handle)
    entries = universe.get("stocks", []) + universe.get("benchmarks", [])
    symbols = [entry["symbol"] for entry in entries if entry.get("active")]
    if not symbols or len(symbols) != len(set(symbols)):
        raise ValueError("Universe must contain unique active symbols.")
    return symbols

def fetch_symbol(symbol, api_key):
    query = urlencode({
        "symbol": symbol, "interval": "1day", "outputsize": 1000,
        "apikey": api_key,
    })
    try:
        with urlopen(f"{BASE_URL}?{query}", timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Could not fetch {symbol}: {type(error).__name__}") from error
    if payload.get("status") == "error" or "values" not in payload:
        message = payload.get("message", "provider returned no time series")
        raise RuntimeError(f"Could not fetch {symbol}: {message}")
    candles = []
    for value in payload["values"]:
        try:
            candles.append({
                "date": value["datetime"],
                "open": float(value["open"]), "high": float(value["high"]),
                "low": float(value["low"]), "close": float(value["close"]),
                "volume": float(value.get("volume") or 0),
            })
        except (KeyError, TypeError, ValueError) as error:
            raise RuntimeError(f"Invalid candle received for {symbol}") from error
    candles.sort(key=lambda item: item["date"])
    if len(candles) < 200:
        raise RuntimeError(f"Insufficient history for {symbol}: {len(candles)} rows")
    return candles

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-key", default=os.environ.get("TWELVE_DATA_API_KEY"))
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    if not args.api_key:
        raise SystemExit("TWELVE_DATA_API_KEY is required.")
    symbols = load_symbols()
    data = {}
    for index, symbol in enumerate(symbols):
        data[symbol] = fetch_symbol(symbol, args.api_key)
        if index < len(symbols) - 1:
            time.sleep(REQUEST_PAUSE_SECONDS)
    result = {
        "schema_version": 1,
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "provider": "Twelve Data",
        "interval": "1day",
        "symbols": data,
        "status": "generated",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")

if __name__ == "__main__":
    main()
