"""Regression checks for the SEC Product universe denominator gate."""

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "check-sec-product-denominator.py"
SPEC = importlib.util.spec_from_file_location("sec_product_denominator", SCRIPT)
GATE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(GATE)


class ProductDenominatorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.protected = [
            {"ticker": f"D{i:02d}", "securityId": f"ref_D{i:02d}"}
            for i in range(22)
        ]
        self.decisions = [
            {"ticker": "AAA", "securityId": "ref_AAA", "instrument_type": "EQUITY_COMMON", "product_eligibility": "ELIGIBLE"},
            {"ticker": "BBB", "securityId": "ref_BBB", "instrument_type": "ADR", "product_eligibility": "SEPARATE_CLASS"},
        ] + [
            {**entry, "instrument_type": "DEBT", "product_eligibility": "EXCLUDED"}
            for entry in self.protected
        ]
        self.coverage = {
            "universe": {"PRODUCT_TITLES": 2},
            "fundamentals": {"COMPANY_FACTS_AVAILABLE": 1},
            "metrics": {"revenue": {"COUNT": 1, "PERCENT_OF_PRODUCT_UNIVERSE": 50}},
        }
        self.write()

    def write(self):
        files = {
            "quant/data/market/security-master/eligibility.json": {
                "counts": {"universeMembers": len(self.decisions), "productUniverse": sum(
                    row["product_eligibility"] != "EXCLUDED" for row in self.decisions
                )},
                "decisions": self.decisions,
            },
            "quant/data/fundamentals/coverage-report.json": self.coverage,
            "docs/tiingo2-finalization/tiingo2_production_baseline.json": {
                "baselineConsumerRemovedBeforeThisRun": self.protected,
            },
        }
        for name, value in files.items():
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(value))

    def test_current_canonical_denominator_has_no_arbitrary_7000_floor(self):
        self.assertEqual(GATE.validate(self.root), (2, 1))

    def test_stale_coverage_denominator_fails(self):
        self.coverage["universe"]["PRODUCT_TITLES"] = 3
        self.write()
        with self.assertRaisesRegex(ValueError, "Product denominator mismatch"):
            GATE.validate(self.root)

    def test_protected_debt_readdition_fails_even_when_denominators_match(self):
        self.decisions[2]["product_eligibility"] = "ELIGIBLE"
        self.coverage["universe"]["PRODUCT_TITLES"] = 3
        self.write()
        with self.assertRaisesRegex(ValueError, "Historically excluded debt security"):
            GATE.validate(self.root)

    def test_protected_security_id_change_fails(self):
        self.decisions[2]["securityId"] = "ref_reassigned"
        self.write()
        with self.assertRaisesRegex(ValueError, "Historically excluded debt security"):
            GATE.validate(self.root)


if __name__ == "__main__":
    unittest.main()
