import unittest

from quant.sec.regression import compare_bundle


def fact(value=1):
    return {
        "metricId": "revenue", "fiscalPeriod": "Q1", "fiscalYear": 2024,
        "periodEnd": "2024-03-31", "availableAt": "2024-05-01", "revisionId": 0,
        "value": value, "unit": "usd_m", "sourceFilingId": "a",
        "restatementStatus": "original",
    }


class GoldenRegressionTests(unittest.TestCase):
    def test_identical_history_passes(self):
        bundle = {"facts": [fact()], "filings": []}
        self.assertEqual("PASS", compare_bundle(bundle, bundle)["status"])

    def test_new_facts_are_allowed_without_mutating_old_history(self):
        old = {"facts": [fact()], "filings": []}
        newer = fact(2)
        newer["fiscalYear"] = 2025
        candidate = {"facts": [fact(), newer], "filings": []}
        result = compare_bundle(old, candidate)
        self.assertEqual("PASS", result["status"])
        self.assertEqual(1, result["newFacts"])

    def test_missing_or_changed_historical_fact_fails(self):
        old = {"facts": [fact()], "filings": []}
        self.assertEqual("FAIL", compare_bundle(old, {"facts": [], "filings": []})["status"])
        self.assertEqual("FAIL", compare_bundle(
            old, {"facts": [fact(9)], "filings": []})["status"])


if __name__ == "__main__":
    unittest.main()
