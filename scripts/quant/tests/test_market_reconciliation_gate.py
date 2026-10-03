"""The historical R2 acceptance may only drift by evidenced exclusions."""

import copy
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from quant.sec import market_reconciliation_gate as gate


ROOT = Path(__file__).resolve().parents[3]
FILES = (
    "quant/data/fundamentals/reconciliation.json",
    "quant/data/universe/market-capability.json",
    "quant/data/market/scale/universe-ELIGIBLE_US_EQUITY.json",
    "quant/data/market/security-master/eligibility.json",
    "quant/data/market/history/coverage-metrics.json",
    "quant/data/technical/scale/technical-coverage-ELIGIBLE_US_EQUITY.json",
)


class MarketReconciliationGateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = {name: json.loads((ROOT / name).read_text(encoding="utf-8"))
                      for name in FILES}

    def verify_with(self, change=None):
        source = copy.deepcopy(self.source)
        if change:
            change(source)
        with patch.object(gate, "_load", side_effect=lambda root, name: source[name]):
            return gate.verify(ROOT)

    def test_the_exact_documented_debt_removal_reconciles(self):
        result = self.verify_with()
        self.assertEqual(result["status"], "POLICY_ADJUSTED_RECONCILED")
        self.assertEqual(len(result["excludedDebt"]), 22)
        self.assertEqual(result["removedChartReady"], 22)
        self.assertEqual(result["removedTechnicalReady"], 8)

    def test_unexplained_chart_loss_remains_red(self):
        def change(source):
            row = source["quant/data/universe/market-capability.json"]["members"][0]
            self.assertTrue(row["ph"])
            row["ph"] = False
            source["quant/data/fundamentals/reconciliation.json"]["overlap"][
                "acceptedMarketDataState"]["computed"]["HISTORICAL_CHART_AVAILABLE"] -= 1

        with self.assertRaisesRegex(ValueError, "per-instrument states differ"):
            self.verify_with(change)

    def test_unexplained_aggregate_delta_remains_red(self):
        def change(source):
            source["quant/data/fundamentals/reconciliation.json"]["overlap"][
                "acceptedMarketDataState"]["computed"]["TECHNICAL_HISTORY_ELIGIBLE"] -= 1

        with self.assertRaisesRegex(ValueError, "reconciliation differs from current"):
            self.verify_with(change)

    def test_debt_reintroduction_remains_red(self):
        def change(source):
            row = next(row for row in source["quant/data/market/security-master/eligibility.json"][
                "decisions"] if row["ticker"] == "ADAMH")
            row["product_eligibility"] = "ELIGIBLE"

        with self.assertRaisesRegex(ValueError, "22 evidenced debt exclusions required"):
            self.verify_with(change)

    def test_incomplete_technical_exception_list_remains_red(self):
        def change(source):
            per_symbol = source["quant/data/technical/scale/technical-coverage-ELIGIBLE_US_EQUITY.json"][
                "perSymbol"]
            ticker = next(ticker for ticker, row in per_symbol.items()
                          if row["technical"] != "TECHNICAL_READY")
            del per_symbol[ticker]

        with self.assertRaisesRegex(ValueError, "incomplete technical exception evidence"):
            self.verify_with(change)

    def test_historical_acceptance_cannot_be_rewritten_to_hide_delta(self):
        def change(source):
            source["quant/data/fundamentals/reconciliation.json"]["overlap"][
                "acceptedMarketDataState"]["accepted"]["HISTORICAL_CHART_AVAILABLE"] = 6849

        with self.assertRaisesRegex(ValueError, "historical R2 acceptance mismatch"):
            self.verify_with(change)


if __name__ == "__main__":
    unittest.main()
