#!/usr/bin/env python3
"""Generate transparent trend/volatility scenario zones from stored OHLC data."""
import json
import math
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MARKET = ROOT / "dashboard" / "data" / "market_data.json"
TECHNICAL = ROOT / "dashboard" / "data" / "technical_scores.json"
OUTPUT = ROOT / "dashboard" / "data" / "technical_scenarios.json"

def average(values):
    return sum(values) / len(values) if values else None

def atr(candles, period=14):
    if len(candles) < period + 1:
        return None
    ranges = []
    for index in range(1, len(candles)):
        current, previous = candles[index], candles[index - 1]
        ranges.append(max(current["high"] - current["low"], abs(current["high"] - previous["close"]), abs(current["low"] - previous["close"])))
    return average(ranges[-period:])

def scenario(candles, technical):
    close = technical["close"]
    band = technical.get("bollinger20") or {}
    volatility = atr(candles)
    if not volatility:
        return {"status": "unavailable"}
    support = max(band.get("lower", 0), technical.get("ema50") or 0, technical.get("sma50") or 0)
    entry_low = max(support, close - 0.75 * volatility)
    entry_high = min(close + 0.25 * volatility, band.get("upper", close + 0.25 * volatility))
    invalidation = entry_low - 1.25 * volatility
    risk = entry_high - invalidation
    target_1 = entry_high + 1.5 * risk
    target_2 = entry_high + 2.5 * risk
    return {
        "status": "beta",
        "method": "Trend/volatility scenario; not an Elliott-wave forecast.",
        "entry_zone": {"low": round(entry_low, 2), "high": round(entry_high, 2)},
        "invalidation": round(invalidation, 2),
        "target_1": round(target_1, 2),
        "target_2": round(target_2, 2),
        "risk_reward": {"target_1": "1:1.5", "target_2": "1:2.5"},
        "reference": {"ema20": technical.get("ema20"), "ema50": technical.get("ema50"), "ema200": technical.get("ema200"), "rsi14": technical.get("rsi14"), "bollinger20": band},
    }

def main():
    market = json.loads(MARKET.read_text(encoding="utf-8"))
    technical = json.loads(TECHNICAL.read_text(encoding="utf-8"))
    symbols = {symbol: scenario(candles, technical["symbols"][symbol]) for symbol, candles in market["symbols"].items() if symbol in technical["symbols"]}
    OUTPUT.write_text(json.dumps({"schema_version": "0.1", "generated_at_utc": datetime.now(timezone.utc).isoformat(), "scope": "Technical scenario beta. No investment recommendation.", "symbols": symbols}, indent=2) + "\n", encoding="utf-8")

if __name__ == "__main__":
    main()
