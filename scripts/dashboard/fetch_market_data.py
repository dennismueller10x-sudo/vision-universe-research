#!/usr/bin/env python3
"""Fetch daily OHLCV data from Twelve Data using the central universe file.

Die Reihen werden mit ihrer Bereinigungsstufe gekennzeichnet (Phase 3, §2).
Vorher trugen sie keine Angabe, und nachgelagerte Skripte rechneten darauf
Kennzahlen, ohne zu wissen, was die Zahlen bedeuten.

Die Stufe ist SPLIT_ADJUSTED und nicht hoeher. Belegt ist sie an der
Historie selbst: NVDA steht in dieser Reihe im Juli 2021 bei rund 18 USD -
das ist der um 4:1 (2021) und 10:1 (2024) bereinigte Kurs, unbereinigt
waeren es rund 726 USD. Ein Dividendenendpunkt existiert im kostenlosen
Zugang nicht, und es gibt kein adjusted_close-Feld; TOTAL_RETURN ist damit
ausgeschlossen.

Die Stufe laesst sich hier ueber --adjustment ueberschreiben, falls der
Anbieter das Verhalten aendert oder ein hoeherer Plan genutzt wird.
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

import price_semantics

ROOT = Path(__file__).resolve().parents[2]
UNIVERSE = ROOT / "dashboard" / "config" / "universe.json"
PRIVATE_CACHE = ROOT / ".market-cache"
OUTPUT = PRIVATE_CACHE / "dashboard" / "market_data.json"
BASE_URL = "https://api.twelvedata.com/time_series"
REQUEST_PAUSE_SECONDS = 8

# Empirisch belegt, nicht vom Anbieter zugesichert. Siehe Modul-Docstring
# und docs/VU_PRICE_ADJUSTMENT_SEMANTICS.md.
ADJUSTMENT_LEVEL = price_semantics.SPLIT_ADJUSTED
ADJUSTMENT_EVIDENCE = (
    "Empirisch aus der Reihe selbst: NVDA notiert im Juli 2021 bei rund 18 USD "
    "(splitbereinigt), nicht bei rund 726 USD (unbereinigt). Kein adjusted_close-Feld "
    "und kein Dividendenendpunkt im kostenlosen Zugang, daher nicht TOTAL_RETURN."
)

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
        "symbol": symbol, "interval": "1day", "outputsize": 1500,
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
    parser.add_argument("--adjustment", default=ADJUSTMENT_LEVEL,
                        choices=[price_semantics.RAW, price_semantics.SPLIT_ADJUSTED,
                                 price_semantics.TOTAL_RETURN, price_semantics.UNKNOWN],
                        help="Bereinigungsstufe der gelieferten Reihen.")
    args = parser.parse_args()
    if not args.api_key:
        raise SystemExit("TWELVE_DATA_API_KEY is required.")
    output = args.output.resolve()
    try:
        output.relative_to(PRIVATE_CACHE.resolve())
    except ValueError as error:
        raise SystemExit(
            "Output rejected: Twelve Data raw bars must stay under .market-cache/."
        ) from error
    symbols = load_symbols()
    data = {}
    for index, symbol in enumerate(symbols):
        data[symbol] = fetch_symbol(symbol, args.api_key)
        if index < len(symbols) - 1:
            time.sleep(REQUEST_PAUSE_SECONDS)
    adjustment = price_semantics.normalize(args.adjustment)
    result = {
        "schema_version": 2,
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "provider": "Twelve Data",
        "interval": "1day",
        # Seit schema_version 2: jede Reihe sagt, was sie bedeutet.
        # Ohne dieses Feld gilt UNKNOWN, und nachgelagerte Skripte
        # verweigern die Berechnung, statt sie stillschweigend falsch zu machen.
        "adjustment": adjustment,
        "adjustment_label": price_semantics.label(adjustment),
        "adjustment_caveat": price_semantics.caveat(adjustment),
        "adjustment_evidence": ADJUSTMENT_EVIDENCE,
        "semantics_version": price_semantics.config().get("methodologyVersion"),
        "symbols": data,
        "status": "generated",
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")

if __name__ == "__main__":
    main()
