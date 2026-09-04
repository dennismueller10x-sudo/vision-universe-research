#!/usr/bin/env python3
"""Calculate deterministic technical indicators from market_data.json only."""
import json
import math
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MARKET_DATA = ROOT / "dashboard" / "data" / "market_data.json"
OUTPUT = ROOT / "dashboard" / "data" / "technical_scores.json"

def average(values):
    return sum(values) / len(values) if values else None

def sma(closes, period):
    return average(closes[-period:]) if len(closes) >= period else None

def standard_deviation(values):
    mean = average(values)
    return math.sqrt(average([(value - mean) ** 2 for value in values])) if values else None

def bollinger(closes, period=20, deviations=2):
    if len(closes) < period:
        return None
    middle = sma(closes, period)
    deviation = standard_deviation(closes[-period:])
    return {"middle": middle, "upper": middle + deviations * deviation, "lower": middle - deviations * deviation}

def ema(closes, period):
    if len(closes) < period:
        return None
    value = average(closes[:period])
    multiplier = 2 / (period + 1)
    for close in closes[period:]:
        value = (close - value) * multiplier + value
    return value

def macd(closes, fast=12, slow=26, signal=9):
    if len(closes) < slow + signal:
        return None
    def ema_series(values, period):
        multiplier = 2 / (period + 1)
        series, value = [], values[0]
        for index, close in enumerate(values):
            value = close if index == 0 else (close - value) * multiplier + value
            series.append(value)
        return series
    fast_series, slow_series = ema_series(closes, fast), ema_series(closes, slow)
    macd_series = [f - s for f, s in zip(fast_series, slow_series)]
    signal_series = ema_series(macd_series, signal)
    return {"macd": macd_series[-1], "signal": signal_series[-1], "histogram": macd_series[-1] - signal_series[-1]}

def rsi(closes, period=14):
    if len(closes) <= period:
        return None
    changes = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains = [max(change, 0) for change in changes[:period]]
    losses = [max(-change, 0) for change in changes[:period]]
    avg_gain, avg_loss = average(gains), average(losses)
    for change in changes[period:]:
        avg_gain = ((avg_gain * (period - 1)) + max(change, 0)) / period
        avg_loss = ((avg_loss * (period - 1)) + max(-change, 0)) / period
    if avg_loss == 0:
        return 100.0
    return 100 - (100 / (1 + avg_gain / avg_loss))

def performance(closes, trading_days):
    if len(closes) <= trading_days:
        return None
    return (closes[-1] / closes[-trading_days] - 1) * 100

def volatility(closes, days=252):
    window = closes[-days:]
    returns = [window[i] / window[i - 1] - 1 for i in range(1, len(window))]
    if len(returns) < 2:
        return None
    mean = average(returns)
    return math.sqrt(average([(item - mean) ** 2 for item in returns])) * math.sqrt(252) * 100

def max_drawdown(closes, days=252):
    peak, worst = None, 0.0
    for close in closes[-days:]:
        peak = close if peak is None else max(peak, close)
        worst = min(worst, (close / peak - 1) * 100)
    return worst

def pct_distance(value, reference):
    return None if reference in (None, 0) else (value / reference - 1) * 100

def technicals(candles):
    closes = [row["close"] for row in candles]
    current = closes[-1]
    sma50, sma150, sma200 = sma(closes, 50), sma(closes, 150), sma(closes, 200)
    high52, low52 = max(closes[-252:]), min(closes[-252:])
    tests = {
        "price_above_sma50": current > sma50,
        "price_above_sma150": current > sma150,
        "price_above_sma200": current > sma200,
        "sma50_above_sma150": sma50 > sma150,
        "sma150_above_sma200": sma150 > sma200,
        "sma200_rising_20d": sma200 > sma(closes[:-20], 200),
        "price_at_least_25pct_above_52w_low": current >= low52 * 1.25,
        "price_within_25pct_of_52w_high": current >= high52 * .75,
    }
    momentum = sum(max(0, min(25, (performance(closes, days) or 0) / 4 + 12.5)) for days in (21, 63, 126, 252))
    timing = sum([
        20 if current > sma50 else 0, 20 if sma50 > sma150 else 0,
        20 if sma150 > sma200 else 0, 20 if (rsi(closes) or 0) >= 50 else 0,
        20 if current >= high52 * .85 else 0,
    ])
    return {
        "last_date": candles[-1]["date"], "close": current, "ema20": ema(closes, 20), "ema50": ema(closes, 50), "ema200": ema(closes, 200),
        "sma50": sma50, "sma150": sma150, "sma200": sma200, "rsi14": rsi(closes), "macd": macd(closes),
        "high_52w": high52, "low_52w": low52, "bollinger20": bollinger(closes),
        "performance_pct": {"1m": performance(closes,21),"3m":performance(closes,63),"6m":performance(closes,126),"12m":performance(closes,252)},
        "annualized_volatility_pct": volatility(closes), "max_drawdown_12m_pct": max_drawdown(closes),
        "distance_52w_high_pct": pct_distance(current, high52),
        "distance_sma_pct": {"sma50":pct_distance(current,sma50),"sma150":pct_distance(current,sma150),"sma200":pct_distance(current,sma200)},
        "momentum_score_beta": round(momentum, 1), "timing_score_beta": round(timing, 1),
        "trend_template_tests": tests, "trend_template_tests_passed": sum(tests.values()),
    }

def main():
    market = json.loads(MARKET_DATA.read_text(encoding="utf-8"))
    if market.get("status") != "generated":
        raise SystemExit("market_data.json has not been generated successfully.")
    symbols = {name: technicals(candles) for name, candles in market["symbols"].items()}
    result = {
        "schema_version": 1, "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "source_market_data_generated_at_utc": market.get("generated_at_utc"),
        "symbols": symbols, "status": "generated",
        "score_rules": {
          "momentum_score_beta": "Equal-weighted capped 1M, 3M, 6M and 12M performance components.",
          "timing_score_beta": "Five deterministic 20-point technical conditions.",
        },
    }
    OUTPUT.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")

if __name__ == "__main__":
    main()
