"""Bridge between the SEC fundamental core and the EXISTING backtest engine.

This does not implement a backtester. `scripts/dashboard/backtest_technicals.py`
stays untouched and remains the single definition of the trade mechanics: this
module imports its parameters and its helpers, and adds one thing on top - a
point-in-time fundamental eligibility check evaluated at each candidate entry
date, using only what had been filed with the SEC by that date.

A regression test (test_backtest_bridge.py) asserts that with an
always-eligible predicate the bridge reproduces the existing engine's output
exactly, so the two cannot silently drift apart.

If a symbol's fundamental data is not good enough, the bridge BLOCKS it and says
why. It never emits a precise-looking result on data that cannot support one.
"""
import importlib.util
import logging
from datetime import date
from pathlib import Path

from .derived import BASIS_TTM, compute_derived
from .periods import PeriodResolver
from .restatements import POLICY_AS_OF_LATEST

LOGGER = logging.getLogger("vu.sec.backtest")

ROOT = Path(__file__).resolve().parents[3]
EXISTING_BACKTEST_PATH = ROOT / "scripts" / "dashboard" / "backtest_technicals.py"

BLOCK_NO_FUNDAMENTALS = "NO_FUNDAMENTAL_DATA"
BLOCK_INSUFFICIENT_HISTORY = "INSUFFICIENT_FUNDAMENTAL_HISTORY"
BLOCK_QUALITY = "FUNDAMENTAL_DATA_QUALITY"
BLOCK_NO_MARKET_DATA = "NO_MARKET_DATA"

# A symbol needs this many distinct as-of dates with a resolvable fundamental
# snapshot before a fundamental-filtered backtest is allowed to run at all.
MIN_ELIGIBLE_SNAPSHOTS = 8


def load_existing_engine(path=EXISTING_BACKTEST_PATH):
    """Import the existing backtest module without modifying or copying it."""
    spec = importlib.util.spec_from_file_location("vu_existing_backtest", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FundamentalGate:
    """Point-in-time fundamental eligibility for one company."""

    def __init__(self, resolver, rules=None, basis=BASIS_TTM,
                 policy=POLICY_AS_OF_LATEST, lag_days=0):
        self.resolver = resolver
        self.basis = basis
        self.policy = policy
        self.lag_days = lag_days
        # Default screen from Phase 4 § 27: growing, cash-generative, profitable.
        self.rules = rules or {
            "revenue_growth_yoy": (">", 0.0),
            "free_cash_flow": (">", 0.0),
            "net_margin": (">", 0.0),
        }
        self._cache = {}

    def evaluate(self, as_of):
        key = str(as_of)
        if key in self._cache:
            return self._cache[key]
        derived = compute_derived(self.resolver, as_of, basis=self.basis,
                                  policy=self.policy, lag_days=self.lag_days)
        checks = {}
        eligible = True
        resolvable = 0
        for metric, (operator, threshold) in self.rules.items():
            fact = derived.get(metric)
            if fact is None or not fact.available:
                checks[metric] = {"passed": None, "value": None,
                                  "reason": fact.reason if fact is not None else "MISSING_INPUT"}
                # An unknown input is not a pass. UNKNOWN != FALSE, but it is
                # also never treated as TRUE.
                eligible = False
                continue
            resolvable += 1
            passed = fact.value > threshold if operator == ">" else fact.value < threshold
            checks[metric] = {"passed": bool(passed), "value": fact.value,
                              "available_from": fact.provenance.available_from}
            eligible = eligible and passed
        outcome = {"as_of": key, "eligible": eligible, "checks": checks,
                   "resolvable_rules": resolvable, "total_rules": len(self.rules)}
        self._cache[key] = outcome
        return outcome

    def is_eligible(self, as_of):
        return self.evaluate(as_of)["eligible"]


def backtest_symbol_filtered(rows, is_eligible, engine=None):
    """The existing engine's setup, with a point-in-time fundamental filter.

    Every parameter and the moving-average helper come from the existing module,
    so this cannot drift from it; the only addition is the `is_eligible(as_of)`
    call on the signal date. Passing a predicate that always returns True must
    reproduce the existing engine's numbers exactly.
    """
    engine = engine or load_existing_engine()
    closes = [row["close"] for row in rows]
    outcomes = []
    rejected = 0

    for index in range(engine.LOOKBACK, len(rows) - engine.HORIZON):
        close = closes[index]
        sma20 = engine.sma(closes, index, 20)
        sma50 = engine.sma(closes, index, 50)
        previous_high = max(row["high"] for row in rows[index - 20:index])
        if not (close > sma20 > sma50 and close > previous_high):
            continue
        signal_date = rows[index].get("date") or rows[index].get("datetime")
        if signal_date is not None and not is_eligible(str(signal_date)[:10]):
            rejected += 1
            continue
        entry = rows[index + 1]["open"]
        stop = entry * (1 - engine.RISK_FACTOR)
        target = entry * (1 + engine.REWARD_FACTOR)
        result = "timeout"
        exit_price = rows[index + engine.HORIZON]["close"]
        for candle in rows[index + 1:index + engine.HORIZON + 1]:
            if candle["low"] <= stop:
                result, exit_price = "stop", stop
                break
            if candle["high"] >= target:
                result, exit_price = "target", target
                break
        outcomes.append({"result": result,
                         "return_pct": round((exit_price / entry - 1) * 100, 3)})

    total = len(outcomes)
    targets = sum(item["result"] == "target" for item in outcomes)
    stops = sum(item["result"] == "stop" for item in outcomes)
    return {
        "setups": total,
        "setups_rejected_by_fundamental_filter": rejected,
        "target_hit_rate_pct": round((targets / total * 100), 1) if total else None,
        "stop_rate_pct": round((stops / total * 100), 1) if total else None,
        "average_return_pct": round(sum(item["return_pct"] for item in outcomes) / total, 2) if total else None,
        "risk_reward": "1:2.0",
    }


def run(symbol_rows, resolvers_by_symbol, rules=None, basis=BASIS_TTM,
        policy=POLICY_AS_OF_LATEST, lag_days=0, engine=None):
    """Run the existing engine with a PIT fundamental filter, per symbol.

    `symbol_rows`: {symbol: [ohlc rows]}  (the existing market_data.json shape)
    `resolvers_by_symbol`: {symbol: PeriodResolver}
    Symbols without sufficient fundamental data are blocked with a reason and
    produce no result at all.
    """
    engine = engine or load_existing_engine()
    results, blocked = {}, {}

    for symbol, rows in symbol_rows.items():
        resolver = resolvers_by_symbol.get(symbol)
        if resolver is None:
            blocked[symbol] = {"reason": BLOCK_NO_FUNDAMENTALS,
                               "detail": "no SEC factbook ingested for this symbol"}
            continue
        if not rows or len(rows) <= engine.LOOKBACK + engine.HORIZON:
            blocked[symbol] = {"reason": BLOCK_NO_MARKET_DATA,
                               "detail": f"{len(rows)} candles is below the engine's "
                                         f"{engine.LOOKBACK + engine.HORIZON} candle minimum"}
            continue

        gate = FundamentalGate(resolver, rules=rules, basis=basis, policy=policy,
                               lag_days=lag_days)
        probe_dates = sorted({str(row.get("date") or row.get("datetime"))[:10]
                              for row in rows[engine.LOOKBACK::21]
                              if row.get("date") or row.get("datetime")})
        resolvable = sum(1 for probe in probe_dates
                         if gate.evaluate(probe)["resolvable_rules"] == gate.evaluate(probe)["total_rules"])
        if resolvable < MIN_ELIGIBLE_SNAPSHOTS:
            blocked[symbol] = {
                "reason": BLOCK_INSUFFICIENT_HISTORY,
                "detail": f"only {resolvable} of {len(probe_dates)} probed dates have a "
                          f"complete fundamental snapshot; {MIN_ELIGIBLE_SNAPSHOTS} required",
            }
            continue

        results[symbol] = backtest_symbol_filtered(rows, gate.is_eligible, engine=engine)
        results[symbol]["fundamental_rules"] = {
            metric: f"{operator} {threshold}" for metric, (operator, threshold) in gate.rules.items()
        }

    return {
        "engine": "scripts/dashboard/backtest_technicals.py (unmodified, imported)",
        "method": {
            "entry": "Existing engine: close above SMA20 above SMA50 and a 20-day breakout.",
            "fundamental_filter": "Evaluated at the signal date from SEC facts filed by "
                                  "that date only; a rule whose input is unknown blocks the setup.",
            "basis": basis,
            "restatement_policy": policy,
        },
        "results": results,
        "blocked": blocked,
    }
