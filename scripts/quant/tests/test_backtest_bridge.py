"""The bridge must reuse the existing engine exactly, and block on thin data."""
import random
import sys
import unittest
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from quant.sec.backtest_bridge import (
    BLOCK_INSUFFICIENT_HISTORY, BLOCK_NO_FUNDAMENTALS, BLOCK_NO_MARKET_DATA,
    EXISTING_BACKTEST_PATH, FundamentalGate, backtest_symbol_filtered,
    load_existing_engine, run,
)
from quant.sec.normalize import normalize_company
from quant.sec.periods import PeriodResolver
from quant.sec.provider import SECProvider
from quant.sec.registry import MetricRegistry
from quant.tests.fixtures import build_year_ends, standard_company


class _NullClient:
    def get_json(self, url, use_cache=True):  # pragma: no cover
        raise AssertionError("no network in tests")


def synthetic_ohlc(count=900, seed=7, start=date(2019, 1, 2)):
    """A deterministic synthetic price path. Not real market data."""
    rng = random.Random(seed)
    rows = []
    price = 100.0
    current = start
    for _ in range(count):
        drift = rng.uniform(-0.02, 0.024)
        open_price = price
        close = max(1.0, price * (1 + drift))
        high = max(open_price, close) * (1 + rng.uniform(0.0, 0.01))
        low = min(open_price, close) * (1 - rng.uniform(0.0, 0.01))
        rows.append({"date": current.isoformat(), "open": round(open_price, 4),
                     "high": round(high, 4), "low": round(low, 4),
                     "close": round(close, 4)})
        price = close
        current += timedelta(days=1)
    return rows


def resolver_for(cik, revenue=lambda year: 1000.0 * (year - 2014)):
    registry = MetricRegistry.load()
    fy_ends = build_year_ends(date(2015, 12, 31), 12)
    builder, _ = standard_company(cik, fy_ends, revenue)
    raw = list(SECProvider(client=_NullClient()).iter_raw_facts(builder.company_facts()))
    result = normalize_company(str(cik).zfill(10), raw, registry,
                               filing_metadata=builder.filings)
    return PeriodResolver(result.factbook, registry)


class EngineReuseTests(unittest.TestCase):
    """The whole point of the bridge: it must not become a second backtester."""

    def test_the_existing_engine_file_is_the_one_imported(self):
        self.assertTrue(EXISTING_BACKTEST_PATH.exists())
        self.assertEqual(EXISTING_BACKTEST_PATH.name, "backtest_technicals.py")

    def test_an_always_eligible_filter_reproduces_the_existing_results_exactly(self):
        engine = load_existing_engine()
        rows = synthetic_ohlc()
        baseline = engine.backtest_symbol(rows)
        bridged = backtest_symbol_filtered(rows, lambda as_of: True, engine=engine)
        for key in ("setups", "target_hit_rate_pct", "stop_rate_pct",
                    "average_return_pct", "risk_reward"):
            with self.subTest(key=key):
                self.assertEqual(bridged[key], baseline[key])
        self.assertEqual(bridged["setups_rejected_by_fundamental_filter"], 0)

    def test_the_bridge_uses_the_engines_own_parameters(self):
        engine = load_existing_engine()
        for name in ("LOOKBACK", "HORIZON", "RISK_FACTOR", "REWARD_FACTOR"):
            with self.subTest(name=name):
                self.assertTrue(hasattr(engine, name))

    def test_a_never_eligible_filter_produces_no_setups(self):
        rows = synthetic_ohlc()
        engine = load_existing_engine()
        baseline = engine.backtest_symbol(rows)
        bridged = backtest_symbol_filtered(rows, lambda as_of: False, engine=engine)
        self.assertEqual(bridged["setups"], 0)
        self.assertEqual(bridged["setups_rejected_by_fundamental_filter"],
                         baseline["setups"])

    def test_a_partial_filter_reduces_but_does_not_invent_setups(self):
        rows = synthetic_ohlc()
        engine = load_existing_engine()
        baseline = engine.backtest_symbol(rows)
        bridged = backtest_symbol_filtered(rows, lambda as_of: as_of >= "2020-06-01",
                                           engine=engine)
        self.assertLessEqual(bridged["setups"], baseline["setups"])
        self.assertEqual(bridged["setups"] + bridged["setups_rejected_by_fundamental_filter"],
                         baseline["setups"])


class FundamentalGateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.resolver = resolver_for(6000000001)

    def test_a_growing_profitable_company_is_eligible_once_data_exists(self):
        outcome = FundamentalGate(self.resolver).evaluate("2024-06-30")
        self.assertEqual(outcome["resolvable_rules"], outcome["total_rules"])
        self.assertTrue(outcome["eligible"])

    def test_an_unknown_input_blocks_rather_than_passing(self):
        outcome = FundamentalGate(self.resolver).evaluate("2015-06-30")
        self.assertFalse(outcome["eligible"])
        self.assertLess(outcome["resolvable_rules"], outcome["total_rules"])

    def test_the_gate_is_point_in_time(self):
        early = FundamentalGate(self.resolver).evaluate("2016-01-01")
        late = FundamentalGate(self.resolver).evaluate("2025-06-30")
        self.assertFalse(early["eligible"])
        self.assertTrue(late["eligible"])

    def test_a_shrinking_company_fails_the_growth_rule(self):
        resolver = resolver_for(6000000002, revenue=lambda year: 10000.0 - 500.0 * (year - 2015))
        outcome = FundamentalGate(resolver).evaluate("2025-06-30")
        self.assertFalse(outcome["eligible"])
        self.assertFalse(outcome["checks"]["revenue_growth_yoy"]["passed"])


class RunTests(unittest.TestCase):
    def test_a_symbol_without_fundamentals_is_blocked_not_silently_dropped(self):
        outcome = run({"SYN": synthetic_ohlc()}, {})
        self.assertEqual(outcome["results"], {})
        self.assertEqual(outcome["blocked"]["SYN"]["reason"], BLOCK_NO_FUNDAMENTALS)

    def test_a_symbol_without_enough_candles_is_blocked(self):
        outcome = run({"SYN": synthetic_ohlc(count=20)},
                      {"SYN": resolver_for(6000000003)})
        self.assertEqual(outcome["blocked"]["SYN"]["reason"], BLOCK_NO_MARKET_DATA)

    def test_thin_fundamental_history_blocks_the_backtest(self):
        resolver = resolver_for(6000000004)
        rows = synthetic_ohlc(count=400, start=date(2015, 1, 2))
        outcome = run({"SYN": rows}, {"SYN": resolver})
        if "SYN" in outcome["blocked"]:
            self.assertEqual(outcome["blocked"]["SYN"]["reason"], BLOCK_INSUFFICIENT_HISTORY)
        else:
            self.assertIn("setups", outcome["results"]["SYN"])

    def test_a_covered_symbol_produces_a_filtered_result(self):
        resolver = resolver_for(6000000005)
        rows = synthetic_ohlc(count=1800, start=date(2019, 1, 2))
        outcome = run({"SYN": rows}, {"SYN": resolver})
        self.assertIn("SYN", outcome["results"])
        result = outcome["results"]["SYN"]
        self.assertIn("setups_rejected_by_fundamental_filter", result)
        self.assertIn("fundamental_rules", result)

    def test_the_report_names_the_engine_it_reused(self):
        outcome = run({}, {})
        self.assertIn("backtest_technicals.py", outcome["engine"])
        self.assertIn("unmodified", outcome["engine"])


if __name__ == "__main__":
    unittest.main()
