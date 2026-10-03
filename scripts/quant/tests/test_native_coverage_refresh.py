"""Existing native aggregates remain current without ingestion or price rebuild."""
import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from quant.sec import universe_coverage as uc

spec = importlib.util.spec_from_file_location(
    "native_coverage_refresh", Path(__file__).resolve().parents[1] / "refresh-native-coverage.py")
refresh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)


class NativeCoverageRefreshTests(unittest.TestCase):
    def test_reaggregates_current_members_with_available_and_missing_fundamentals(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            instruments = [{"instrumentId": "vu_A", "masterMemberId": "ref_A", "symbol": "A",
                            "productEligibility": "ELIGIBLE", "issuerId": "iss_cik_0000000001",
                            "cik": "0000000001"},
                           {"instrumentId": "vu_IPO", "masterMemberId": "ref_IPO", "symbol": "IPO",
                            "productEligibility": "ELIGIBLE", "issuerId": None, "cik": None}]
            path = root / "quant/data/universe/instruments/AA.json"
            path.parent.mkdir(parents=True)
            path.write_text(json.dumps({"instruments": instruments}))
            before = hashlib.sha256(path.read_bytes()).hexdigest()
            record = {"cik": "0000000001", "name": "A", "status": "INGESTED", "metrics": {},
                      "pit": {"state": "PIT_UNAVAILABLE"}, "quality": {}, "historyYears": 0,
                      "annualPeriods": 0, "quarterlyPeriods": 0, "firstPeriodEnd": None, "lastPeriodEnd": None}
            uc.write_issuer_shards(root, {"iss_cik_0000000001": record})
            sec_inputs = {"canonical_index.json": {"securities": {}},
                          "consumer/CIK0000000001.json": {"cik": "0000000001", "metrics": {}}}
            for name, value in sec_inputs.items():
                file = root / "quant/data/sec" / name
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text(json.dumps(value))
            sec_bytes = {name: (root / "quant/data/sec" / name).read_bytes() for name in sec_inputs}
            with patch("urllib.request.urlopen", side_effect=AssertionError("Provider requests forbidden")):
                result = refresh.materialize_native_coverage(root)
                again = refresh.materialize_native_coverage(root)
            self.assertEqual(result, again)
            self.assertEqual(result["productTitles"], 2)
            self.assertEqual(result["companyFactsAvailable"], 1)
            self.assertEqual(result["providerRequests"], 0)
            self.assertFalse(result["priceHistoryRebuilt"])
            self.assertTrue(result["sourceIssuerSummariesUnchanged"])
            self.assertEqual(uc.load_issuer_shards(root)["iss_cik_0000000001"], record)
            self.assertEqual({name: (root / "quant/data/sec" / name).read_bytes() for name in sec_inputs}, sec_bytes)
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), before)
            coverage = json.loads((root / "quant/data/fundamentals/coverage-report.json").read_text())
            self.assertEqual(coverage["universe"]["PRODUCT_TITLES_WITHOUT_ISSUER"], 1)
            self.assertEqual(coverage["metrics"]["revenue"]["COUNT"], 0)
            self.assertEqual(coverage["pointInTime"]["PIT_UNAVAILABLE_SECURITIES"], 2)
            self.assertFalse((root / "quant/data/sec/facts").exists())
            self.assertFalse((root / "quant/data/market/history").exists())

    def test_missing_current_universe_fails_without_creating_reports(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaisesRegex(ValueError, "CURRENT_CANONICAL_UNIVERSE_REQUIRED"):
                refresh.materialize_native_coverage(root)
            self.assertFalse((root / "quant/data/fundamentals").exists())
