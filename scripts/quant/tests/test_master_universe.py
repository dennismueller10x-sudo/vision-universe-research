import unittest

from quant.sec.universe import build_current_universe, gate_sample


STAMP = "2026-09-08T12:00:00+00:00"


def fixture():
    return {
        "fields": ["cik", "name", "ticker", "exchange"],
        "data": [
            [19617, "JPMORGAN CHASE & CO", "JPM", "NYSE"],
            [19617, "JPMORGAN CHASE & CO", "JPM-PL", "NYSE"],
            [320193, "Apple Inc.", "AAPL", "Nasdaq"],
            [789019, "MICROSOFT CORP", "MSFT", "Nasdaq"],
            [1045810, "NVIDIA CORP", "NVDA", "Nasdaq"],
            [34088, "EXXON MOBIL CORP", "XOM", "NYSE"],
            [999, "Example Foreign Issuer", "FPI", "NYSE"],
        ],
        "_retrieved_at": STAMP,
    }


class CurrentUniverseTests(unittest.TestCase):
    def test_company_and_security_mapping_are_not_one_to_one(self):
        universe = build_current_universe(fixture())
        self.assertEqual(6, universe["counts"]["companies"])
        self.assertEqual(7, universe["counts"]["securityMappings"])
        jpm = next(row for row in universe["companies"] if row["cik"] == "0000019617")
        self.assertEqual(2, len(jpm["securityMappingIds"]))

    def test_no_security_master_claim_is_invented(self):
        universe = build_current_universe(fixture())
        self.assertFalse(universe["survivorshipFree"])
        self.assertFalse(universe["historicalInvestableUniverse"])
        self.assertEqual("EXTERNAL_SECURITY_MASTER_REQUIRED", universe["securityMasterStatus"])
        for row in universe["securityMappings"]:
            self.assertEqual("UNKNOWN", row["listingStatus"])
            self.assertEqual("UNKNOWN", row["securityType"])
            self.assertNotIn("firstTradingDate", row)

    def test_source_times_are_preserved(self):
        universe = build_current_universe(fixture())
        self.assertEqual(STAMP, universe["observedAt"])
        self.assertTrue(all(row["availableAt"] == STAMP for row in universe["companies"]))
        self.assertTrue(all(row["observedAt"] == STAMP for row in universe["securityMappings"]))

    def test_malformed_source_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "required fields"):
            build_current_universe({"fields": ["cik", "ticker"], "data": []})


class ScaleSampleTests(unittest.TestCase):
    def test_sample_is_deterministic_and_keeps_golden_ciks(self):
        universe = build_current_universe(fixture())
        golden = ["19617", "320193", "789019", "1045810", "34088"]
        first = gate_sample(universe, 5, golden)
        second = gate_sample(universe, 5, golden)
        self.assertEqual(first, second)
        self.assertEqual(set(map(lambda row: row["cik"], first["companies"])),
                         {str(cik).zfill(10) for cik in golden})

    def test_sample_does_not_claim_sector_or_size_diversification(self):
        sample = gate_sample(build_current_universe(fixture()), 3)
        self.assertEqual(["exchange", "ticker_initial"], sample["diversificationBasis"])
        self.assertTrue(any("market capitalization" in note
                            for note in sample["limitations"]))

    def test_invalid_size_is_rejected(self):
        with self.assertRaises(ValueError):
            gate_sample(build_current_universe(fixture()), 0)

    def test_a_golden_predecessor_cik_survives_a_current_mapping_change(self):
        universe = build_current_universe(fixture())
        old_cik = "0000000340"
        sample = gate_sample(universe, 3, [{
            "cik": old_cik, "ticker": "OLD", "name": "Validated predecessor",
        }])
        row = next(item for item in sample["companies"] if item["cik"] == old_cik)
        self.assertFalse(row["currentSecMapping"])
        self.assertEqual("GOLDEN_BASELINE_OVERRIDE", row["inclusionReason"])


if __name__ == "__main__":
    unittest.main()
