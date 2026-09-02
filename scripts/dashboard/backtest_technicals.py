#!/usr/bin/env python3
"""Run a transparent daily-data baseline backtest for the VISION UNIVERSE pilot."""
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MARKET = ROOT / "dashboard" / "data" / "market_data.json"
OUTPUT = ROOT / "dashboard" / "data" / "backtest_results.json"

LOOKBACK = 50
HORIZON = 20
RISK_FACTOR = 0.04  # fixed 4% invalidation for this baseline, not an Elliott model
REWARD_FACTOR = 0.08  # fixed 2R target

def sma(values, end, window):
    return sum(values[end - window + 1:end + 1]) / window

def backtest_symbol(rows):
    closes = [row["close"] for row in rows]
    outcomes = []
    for index in range(LOOKBACK, len(rows) - HORIZON):
        close = closes[index]
        sma20 = sma(closes, index, 20)
        sma50 = sma(closes, index, 50)
        previous_high = max(row["high"] for row in rows[index - 20:index])
        # Transparent trend-continuation setup; evaluated only with data after entry.
        if not (close > sma20 > sma50 and close > previous_high):
            continue
        entry = rows[index + 1]["open"]
        stop = entry * (1 - RISK_FACTOR)
        target = entry * (1 + REWARD_FACTOR)
        result = "timeout"
        exit_price = rows[index + HORIZON]["close"]
        for candle in rows[index + 1:index + HORIZON + 1]:
            # Conservative treatment: if target and stop occur in one candle, stop wins.
            if candle["low"] <= stop:
                result, exit_price = "stop", stop
                break
            if candle["high"] >= target:
                result, exit_price = "target", target
                break
        outcomes.append({"result": result, "return_pct": round((exit_price / entry - 1) * 100, 3)})
    total = len(outcomes)
    targets = sum(item["result"] == "target" for item in outcomes)
    stops = sum(item["result"] == "stop" for item in outcomes)
    return {
        "setups": total,
        "target_hit_rate_pct": round((targets / total * 100), 1) if total else None,
        "stop_rate_pct": round((stops / total * 100), 1) if total else None,
        "average_return_pct": round(sum(item["return_pct"] for item in outcomes) / total, 2) if total else None,
        "risk_reward": "1:2.0",
    }

def main():
    market = json.loads(MARKET.read_text(encoding="utf-8"))
    by_symbol = {symbol: backtest_symbol(rows) for symbol, rows in market["symbols"].items()}
    active = [value for symbol, value in by_symbol.items() if symbol not in {"SPY", "QQQ"}]
    weighted = [value for value in active if value["setups"]]
    output = {
        "schema_version": "0.1-baseline",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "scope": "Daily OHLC pilot only; not an Elliott-wave probability model.",
        "method": {
            "entry": "Close above SMA20 above SMA50 and 20-day breakout; entry next daily open.",
            "invalidation": "4% fixed stop.",
            "target": "8% fixed target (2R).",
            "horizon": f"{HORIZON} trading days; stop wins on an intraday tie.",
        },
        "symbols": by_symbol,
        "pilot_aggregate": {
            "symbols_with_setups": len(weighted),
            "setups": sum(value["setups"] for value in weighted),
            "target_hit_rate_pct": round(sum(value["target_hit_rate_pct"] * value["setups"] for value in weighted) / sum(value["setups"] for value in weighted), 1) if weighted else None,
        },
    }
    OUTPUT.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")

if __name__ == "__main__":
    main()
