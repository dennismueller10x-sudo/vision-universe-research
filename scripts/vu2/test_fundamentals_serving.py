"""Serving contract tests use explicitly synthetic SEC fixtures, never production mocks."""
import copy
import gzip
import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
spec = importlib.util.spec_from_file_location("fundamentals_serving", Path(__file__).with_name("fundamentals-serving.py"))
serving = importlib.util.module_from_spec(spec)
spec.loader.exec_module(serving)
from quant.sec.pipeline import IngestionPipeline, export_inspector_view
from quant.sec.provider import SECProvider
from quant.sec.registry import MetricRegistry
from quant.sec.store import CheckpointStore, JsonFactStore, JsonRawStore
from quant.tests.test_pipeline_and_store import StubSEC, make_company
from quant.tests.test_industry_layer import _company


class ServingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        base = Path(cls.tmp.name)
        cls.registry = MetricRegistry.load()
        cls.store = JsonFactStore(base / "facts")
        industrial, _ = make_company(4100000001, "TEST", "SYNTHETIC", "3570", "1231", years=4)
        bank = _company(4100000002, "BANK", "6022")
        insurance, _ = make_company(4100000003, "INS", "SYNTHETIC", "6311", "1231", years=2)
        reit, _ = make_company(4100000004, "REIT", "SYNTHETIC", "6798", "1231", years=2)
        pipeline = IngestionPipeline(provider=SECProvider(client=StubSEC([industrial, bank, insurance, reit])),
            registry=cls.registry, raw_store=JsonRawStore(base / "raw"), fact_store=cls.store,
            checkpoint=CheckpointStore(base / "state", run_id="serving"))
        for cik in ("4100000001", "4100000002", "4100000003", "4100000004"):
            pipeline.ingest_company(cik)
        cls.document = cls.store.read_company("4100000001")

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def project(self, doc=None, **kwargs):
        doc = self.document if doc is None else doc
        cik = doc["cik"]
        compressed = gzip.compress(json.dumps(doc).encode())
        args = dict(expected_sha256=hashlib.sha256(compressed).hexdigest(),
            identity={"securityId": "vu_test", "instrumentId": "vu_test", "masterMemberId": "ref_TEST", "issuerId": "iss_cik_" + cik, "cik": cik},
            eligible=True, policy="as_of_latest", as_of="2026-09-18", now=datetime(2026, 9, 18, 12, tzinfo=timezone.utc))
        args.update(kwargs)
        return serving.project_factbook(compressed, **args)

    def test_checked_in_company_master_identity_is_preserved(self):
        shard = json.loads((ROOT / "quant/data/universe/instruments/AA.json").read_text())
        instrument = next(row for row in shard["instruments"] if row["symbol"] == "AAPL")
        identity = {key: instrument[key] for key in ("instrumentId", "masterMemberId", "issuerId", "cik")}
        identity["securityId"] = instrument["instrumentId"]  # existing Product Services convention
        self.assertNotEqual(identity["securityId"], identity["masterMemberId"])
        # Synthetic factbook explicitly matched to the real identity; no real
        # fundamental values or R2 access are claimed by this test.
        doc = copy.deepcopy(self.document)
        doc["cik"] = doc["profile"]["cik"] = instrument["cik"]
        result = self.project(doc, identity=identity)
        self.assertEqual(result["identity"], identity)
        bad = dict(identity, securityId="different-listing")
        with self.assertRaisesRegex(serving.ServingError, "INVALID_IDENTITY"):
            self.project(doc, identity=bad)

    def test_digest_matches_compressed_persistence_bytes_only(self):
        # persist-fundamentals.localFacts hashes readFileSync(<CIK>.json.gz),
        # and push writes that exact buffer. A JSON-body digest must not pass.
        plain_digest = hashlib.sha256(json.dumps(self.document).encode()).hexdigest()
        with self.assertRaisesRegex(serving.ServingError, "OBJECT_DIGEST_MISMATCH"):
            self.project(expected_sha256=plain_digest)

    def test_existing_exporter_rows_are_preserved_exactly(self):
        result = self.project()
        expected = export_inspector_view(self.document, self.registry, as_of="2026-09-18", annual_years=30,
                                         quarterly_years=15, policy="as_of_latest")
        self.assertEqual(result["history"]["rows"], expected["rows"])
        self.assertFalse(result["backtestReady"])
        self.assertTrue(result["pitPolicyApplied"])
        self.assertIsNone(result["industrySpecificMetrics"])

    def test_full_history_ignores_display_window_and_preserves_source_revisions(self):
        result = self.project(full_history=True, annual_years=1, quarterly_years=1)
        years = sorted({t["fiscal_year"] for t in self.document["factbook"]["timelines"]})
        self.assertEqual(result["history"]["scope"]["annual_years"], years)
        self.assertEqual(result["history"]["scope"]["quarterly_years"], years)
        self.assertEqual(result["historyScope"], "FULL_STORED_HISTORY")
        self.assertEqual(result["revisionScope"], "VISIBLE_AT_AS_OF")
        expected = serving._rehydrate(self.document)
        expected_keys = {key for key, timeline in expected.timelines.items() if timeline.visible("2026-09-18")}
        actual_keys = {(timeline["metric"], timeline["fiscal_year"], timeline["fiscal_period"])
                       for timeline in result["revisionHistory"]}
        self.assertEqual(actual_keys, expected_keys)
        self.assertEqual(len(result["revisionHistory"]), len(expected_keys))
        for timeline in result["revisionHistory"]:
            original = expected.get(timeline["metric"], timeline["fiscal_year"], timeline["fiscal_period"])
            self.assertEqual(timeline["observations"], [o.to_dict() for o in original.visible("2026-09-18")])
        self.assertFalse(result["backtestReady"])

    def test_full_history_scope_cannot_reveal_future_period_existence(self):
        first_available = min(observation["available_from"]
                              for timeline in self.document["factbook"]["timelines"]
                              for observation in timeline["observations"])
        result = self.project(full_history=True, as_of=first_available)
        book = serving._rehydrate(self.document)
        visible_years = sorted({timeline.fiscal_year for timeline in book.timelines.values()
                                if timeline.visible(first_available)})
        self.assertEqual(result["history"]["scope"]["annual_years"], visible_years)
        self.assertEqual(result["history"]["scope"]["quarterly_years"], visible_years)
        self.assertTrue(all(row["fiscal_year"] in visible_years for row in result["history"]["rows"]))
        self.assertEqual(result["history"]["metadata_scope"], "AS_OF_ROWS_ONLY")
        for field in ("profile", "calendar", "versions", "quality_summary", "quality_errors"):
            self.assertNotIn(field, result["history"])

    def test_backtest_payload_exposes_only_raw_revision_timelines(self):
        result = self.project(full_history=True, usage="backtest", as_of="2025-01-01")
        self.assertIsNone(result["history"])
        self.assertIsNone(result["industrySpecificMetrics"])
        self.assertEqual(result["pitBacktestSource"], "revisionHistory")
        self.assertEqual(result["resolvedHistoryPITSafety"], "RAW_REVISIONS_ONLY")
        self.assertTrue(result["revisionHistory"])

    def test_full_revisions_exclude_later_amendment_until_acceptance(self):
        doc = copy.deepcopy(self.document)
        cell = next(t for t in doc["factbook"]["timelines"] if t["metric"] == "revenue" and t["fiscal_period"] == "FY")
        revised = copy.deepcopy(cell["observations"][-1])
        revised.update(value=987654321.0, available_from="2025-06-02T16:00:00Z", filed="2025-06-02")
        revised["provenance"].update(accession="4100000001-25-000001", form="10-K/A", filed="2025-06-02", available_from="2025-06-02T16:00:00Z")
        cell["observations"].append(revised)
        before = self.project(doc, full_history=True, as_of="2025-06-02T15:59:59Z")
        after = self.project(doc, full_history=True, as_of="2025-06-02T16:00:00Z")
        values = lambda r: [o["value"] for t in r["revisionHistory"] for o in t["observations"]]
        self.assertNotIn(987654321.0, values(before))
        self.assertIn(987654321.0, values(after))
        self.assertTrue(all(timeline["restated"] is False for timeline in before["revisionHistory"]
                            if timeline["metric"] == "revenue" and timeline["fiscal_year"] == cell["fiscal_year"]
                            and timeline["fiscal_period"] == "FY"))
        self.assertTrue(any(timeline["restated"] is True for timeline in after["revisionHistory"]
                            if timeline["metric"] == "revenue" and timeline["fiscal_year"] == cell["fiscal_year"]
                            and timeline["fiscal_period"] == "FY"))

    def test_full_history_uses_acceptance_time_even_when_filed_date_is_next_day(self):
        doc = copy.deepcopy(self.document)
        cell = next(t for t in doc["factbook"]["timelines"] if t["metric"] == "revenue" and t["fiscal_period"] == "FY")
        accepted = copy.deepcopy(cell["observations"][-1])
        accepted.update(value=876543210.0, available_from="2025-06-02T23:59:00Z", filed="2025-06-03")
        accepted["provenance"].update(accession="4100000001-25-000002", form="10-K/A",
                                      filed="2025-06-03", available_from="2025-06-02T23:59:00Z")
        cell["observations"].append(accepted)
        result = self.project(doc, full_history=True, as_of="2025-06-02T23:59:00Z")
        self.assertIn(876543210.0, [observation["value"] for timeline in result["revisionHistory"]
                                    for observation in timeline["observations"]])

    def test_full_history_rejects_latest_known_policy_that_ignores_cutoff(self):
        with self.assertRaisesRegex(serving.ServingError, "UNSAFE_FULL_HISTORY_POLICY"):
            self.project(full_history=True, policy="latest_known", as_of="2025-06-01")

    def test_intraday_backtest_rejects_date_only_availability(self):
        doc = copy.deepcopy(self.document)
        for timeline in doc["factbook"]["timelines"]:
            for observation in timeline["observations"]:
                observation["available_from"] = observation["filed"]
                observation["provenance"]["available_from"] = observation["filed"]
        with self.assertRaisesRegex(serving.ServingError, "INSUFFICIENT_AVAILABILITY_PRECISION"):
            self.project(doc, full_history=True, usage="backtest", as_of="2026-09-17T12:00:00Z")
        self.assertTrue(self.project(doc, full_history=True, usage="backtest", as_of="2026-09-17")["pitPolicyApplied"])

    def test_bank_industry_rows_are_separate(self):
        result = self.project(self.store.read_company("4100000002"))
        self.assertEqual(result["industrySpecificMetrics"]["industry"], "BANK")
        self.assertTrue(any(row["available"] for row in result["industrySpecificMetrics"]["rows"]))
        self.assertFalse(set(r["metric"] for r in result["industrySpecificMetrics"]["rows"]) &
                         set(r["metric"] for r in result["history"]["rows"]))

    def test_insurance_and_reit_keep_industry_identity(self):
        for cik, industry in (("4100000003", "INSURER"), ("4100000004", "REIT")):
            with self.subTest(cik=cik):
                result = self.project(self.store.read_company(cik))
                self.assertEqual(result["industrySpecificMetrics"]["industry"], industry)

    def test_currency_is_preserved_without_conversion(self):
        doc = copy.deepcopy(self.document)
        for timeline in doc["factbook"]["timelines"]:
            for obs in timeline["observations"]:
                if obs["unit"] == "USD":
                    obs["unit"] = "EUR"
        result = self.project(doc)
        rows = [r for r in result["history"]["rows"] if r["metric"] == "revenue" and r["available"]]
        self.assertTrue(rows)
        self.assertEqual({r["unit"] for r in rows}, {"EUR"})

    def test_later_restatement_cannot_change_earlier_query(self):
        doc = copy.deepcopy(self.document)
        cell = next(t for t in doc["factbook"]["timelines"] if t["metric"] == "revenue" and t["fiscal_period"] == "FY")
        revised = copy.deepcopy(cell["observations"][-1])
        revised.update(value=987654321.0, available_from="2025-06-02T16:00:00Z", filed="2025-06-02")
        revised["provenance"].update(accession="4100000001-25-000001", form="10-K/A", filed="2025-06-02", available_from="2025-06-02T16:00:00Z")
        cell["observations"].append(revised)
        before = self.project(doc, as_of="2025-06-01", usage="backtest")
        after = self.project(doc, as_of="2025-06-03", usage="backtest")
        values = lambda result: [r["value"] for r in result["history"]["rows"] if r["metric"] == "revenue" and r["fiscal_period"] == "FY" and r["fiscal_year"] == cell["fiscal_year"]]
        self.assertNotEqual(values(before), [987654321.0])
        self.assertEqual(values(after), [987654321.0])

    def test_same_day_future_acceptance_is_not_served(self):
        doc = copy.deepcopy(self.document)
        cell = next(t for t in doc["factbook"]["timelines"] if t["metric"] == "revenue" and t["fiscal_period"] == "FY")
        revision = copy.deepcopy(cell["observations"][-1])
        revision.update(value=987654321.0, available_from="2026-09-18T18:00:00Z", filed="2026-09-18")
        revision["provenance"].update(accession="4100000001-26-000001", form="10-K/A",
                                     available_from="2026-09-18T18:00:00Z", filed="2026-09-18")
        cell["observations"].append(revision)
        with self.assertRaisesRegex(serving.ServingError, "FUTURE_FACT"):
            self.project(doc, policy="latest_known", as_of="2026-09-18T12:00:00Z")
        # A proper historical cutoff still resolves the previous observation.
        result = self.project(doc, usage="backtest", as_of="2026-09-18T12:00:00Z")
        self.assertFalse(any(r.get("value") == 987654321.0 for r in result["history"]["rows"]))

    def test_backtest_today_date_requires_completed_day(self):
        with self.assertRaisesRegex(serving.ServingError, "BACKTEST_CUTOFF_NOT_COMPLETE"):
            self.project(usage="backtest", as_of="2026-09-18")
        self.assertTrue(self.project(usage="backtest", as_of="2026-09-17")["pitPolicyApplied"])
        self.assertTrue(self.project(usage="backtest", as_of="2026-09-18T12:00:00Z")["pitPolicyApplied"])

    def test_backtest_rejects_retrospective_policy(self):
        for policy in ("latest_known", "original"):
            with self.subTest(policy=policy), self.assertRaisesRegex(serving.ServingError, "UNSAFE_BACKTEST_POLICY"):
                self.project(policy=policy, usage="backtest")

    def test_no_cik_preserves_security_with_availability(self):
        result = self.project(identity={"securityId": "vu_no_cik", "instrumentId": "vu_no_cik", "masterMemberId": "ref_NO_CIK", "cik": None})
        self.assertEqual((result["state"], result["reason"]), ("UNAVAILABLE", "NO_CIK"))

    def test_bad_identity_eligibility_digest_and_dates_fail_closed(self):
        cases = [(dict(eligible=False), "NOT_ELIGIBLE"), (dict(expected_sha256="0" * 64), "OBJECT_DIGEST_MISMATCH"),
                 (dict(as_of="2026-02-30"), "INVALID_AS_OF"), (dict(as_of="2027-01-01"), "FUTURE_AS_OF"),
                 (dict(as_of="2026-09-18T13:00:00"), "INVALID_AS_OF"), (dict(annual_years=0), "INVALID_SCOPE"),
                 (dict(identity={"securityId": "AAPL", "masterMemberId": "AAPL"}), "INVALID_IDENTITY")]
        for args, code in cases:
            with self.subTest(code=code), self.assertRaisesRegex(serving.ServingError, code):
                self.project(**args)

    def test_mismatched_factbook_and_versions_fail_closed(self):
        for change, code in ((lambda d: d["profile"].update(cik="0000000000"), "FACTBOOK_IDENTITY_MISMATCH"),
                             (lambda d: d["versions"].update(normalization_schema="future"), "UNSUPPORTED_FACTBOOK_VERSION"),
                             (lambda d: d.update(isMock=True), "MOCK_NOT_ALLOWED")):
            doc = copy.deepcopy(self.document)
            change(doc)
            with self.assertRaisesRegex(serving.ServingError, code):
                self.project(doc)

    def test_nonfinite_values_cannot_reach_product(self):
        doc = copy.deepcopy(self.document)
        for timeline in doc["factbook"]["timelines"]:
            if timeline["metric"] == "revenue":
                for observation in timeline["observations"]:
                    observation["value"] = float("inf")
        with self.assertRaisesRegex(serving.ServingError, "INVALID_FACT_EVIDENCE"):
            self.project(doc)

    def test_research_latest_known_never_claims_pit(self):
        result = self.project(policy="latest_known")
        self.assertFalse(result["pitPolicyApplied"])
        self.assertFalse(result["backtestReady"])
        self.assertEqual(result["history"]["policy"], "latest_known")

    def test_source_404_is_distinct_from_unresolved_facts(self):
        doc = copy.deepcopy(self.document)
        doc["factbook"]["timelines"] = []
        self.assertEqual(self.project(doc)["state"], "MISSING")
        doc["companyfacts_status"] = "NOT_AVAILABLE_404"
        result = self.project(doc)
        self.assertEqual(result["state"], "UNAVAILABLE")
        self.assertEqual(result["reason"], "SEC_COMPANYFACTS_NOT_AVAILABLE")

    def test_projection_never_contacts_sec(self):
        with patch.object(SECProvider, "get_company_facts", side_effect=AssertionError("provider forbidden")):
            self.assertEqual(self.project()["state"], "AVAILABLE")


if __name__ == "__main__":
    unittest.main()
