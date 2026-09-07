"""End-to-end ingestion against a stubbed SEC, plus storage and checkpointing."""
import json
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from quant.sec.coverage import DERIVABLE, FILING_ONLY, MISSING, STRUCTURED, build_matrix, company_coverage
from quant.sec.http_client import SECHTTPError
from quant.sec.periods import PeriodResolver
from quant.sec.pipeline import (
    IngestionPipeline, STATUS_FAILED, STATUS_INGESTED, STATUS_UNCHANGED,
    export_inspector_view, _rehydrate,
)
from quant.sec.provider import SECProvider, normalize_cik
from quant.sec.registry import MetricRegistry
from quant.sec.restatements import POLICY_LATEST_KNOWN
from quant.sec.store import CheckpointStore, JsonFactStore, JsonRawStore
from quant.tests.fixtures import build_year_ends, standard_company, submissions


class StubSEC:
    """Serves fixture payloads at the real SEC URLs. Counts every request."""

    def __init__(self, companies):
        self.responses = {}
        self.calls = []
        ticker_map = {}
        for index, (cik, ticker, name, sic, fye, builder) in enumerate(companies):
            padded = str(cik).zfill(10)
            ticker_map[str(index)] = {"cik_str": int(cik), "ticker": ticker, "title": name}
            self.responses[f"https://data.sec.gov/submissions/CIK{padded}.json"] = \
                submissions(cik, name, sic, fye, [ticker], builder.filings)
            self.responses[f"https://data.sec.gov/api/xbrl/companyfacts/CIK{padded}.json"] = \
                builder.company_facts(name)
        self.responses["https://www.sec.gov/files/company_tickers.json"] = ticker_map

    def get_json(self, url, use_cache=True):
        self.calls.append(url)
        if url not in self.responses:
            raise SECHTTPError(url, 404, "not stubbed", 1)
        return json.loads(json.dumps(self.responses[url]))


def make_company(cik, ticker, name, sic, fye, first_end=date(2016, 12, 31), years=10,
                 revenue=lambda year: 1000.0 * (year - 2015)):
    fy_ends = build_year_ends(first_end, years)
    builder, expected = standard_company(cik, fy_ends, revenue)
    return (cik, ticker, name, sic, fye, builder), expected


class PipelineTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.registry = MetricRegistry.load()
        self.raw_store = JsonRawStore(root / "raw")
        self.fact_store = JsonFactStore(root / "facts", compress=True)
        self.checkpoint = CheckpointStore(root / "state", run_id="test")

    def pipeline(self, companies):
        stub = StubSEC(companies)
        provider = SECProvider(client=stub)
        return IngestionPipeline(provider=provider, registry=self.registry,
                                 raw_store=self.raw_store, fact_store=self.fact_store,
                                 checkpoint=self.checkpoint), stub


class IngestionTests(PipelineTestCase):
    def setUp(self):
        super().setUp()
        self.company, self.expected = make_company(
            4000000001, "SYN1", "SYNTHETIC ONE", "3674", "1231")
        self.pipe, self.stub = self.pipeline([self.company])
        self.cik = normalize_cik(4000000001)
        self.facts_url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{self.cik}.json"
        self.submissions_url = f"https://data.sec.gov/submissions/CIK{self.cik}.json"

    def test_a_company_is_ingested_and_stored(self):
        outcome = self.pipe.ingest_company(self.cik)
        self.assertEqual(outcome["status"], STATUS_INGESTED)
        self.assertIsNotNone(self.fact_store.read_company(self.cik))
        self.assertEqual(self.fact_store.list_companies(), [self.cik])

    def test_the_stored_document_carries_versions_and_provenance(self):
        self.pipe.ingest_company(self.cik)
        document = self.fact_store.read_company(self.cik)
        self.assertIn("normalization_schema", document["versions"])
        self.assertIn("metric_registry", document["versions"])
        self.assertTrue(document["raw_companyfacts_sha256"])
        self.assertTrue(document["factbook"]["timelines"])

    def test_raw_payloads_are_archived_immutably(self):
        self.pipe.ingest_company(self.cik)
        versions = self.raw_store.versions(self.cik, "companyfacts")
        self.assertEqual(len(versions), 1)
        self.pipe.ingest_company(self.cik, force=True)
        versions = self.raw_store.versions(self.cik, "companyfacts")
        self.assertEqual(len(versions), 1, "identical payload must not be duplicated")
        self.assertEqual(versions[0]["sightings"], 2)

    def test_re_ingesting_unchanged_data_skips_the_large_fetch(self):
        self.pipe.ingest_company(self.cik)
        before = self.stub.calls.count(self.facts_url)
        self.assertEqual(before, 1)
        outcome = self.pipe.ingest_company(self.cik)
        self.assertEqual(outcome["status"], STATUS_UNCHANGED)
        self.assertEqual(self.stub.calls.count(self.facts_url), before)

    def test_force_re_ingests_even_when_unchanged(self):
        self.pipe.ingest_company(self.cik)
        outcome = self.pipe.ingest_company(self.cik, force=True)
        self.assertEqual(outcome["status"], STATUS_INGESTED)

    def test_a_new_filing_triggers_a_re_ingest(self):
        self.pipe.ingest_company(self.cik)
        payload = self.stub.responses[self.submissions_url]
        recent = payload["filings"]["recent"]
        recent["accessionNumber"].append("brand-new")
        recent["form"].append("10-Q")
        recent["filingDate"].append("2026-05-01")
        recent["reportDate"].append("2026-03-31")
        recent["acceptanceDateTime"].append("2026-05-01T16:00:00.000Z")
        recent["primaryDocument"].append("d.htm")
        recent["isXBRL"].append(1)
        self.assertEqual(self.pipe.ingest_company(self.cik)["status"], STATUS_INGESTED)

    def test_a_registry_version_change_invalidates_stored_output(self):
        self.pipe.ingest_company(self.cik)
        self.pipe.registry.mapping_version = "2.0.0-test"
        self.assertEqual(self.pipe.ingest_company(self.cik)["status"], STATUS_INGESTED)

    def test_ingestion_is_idempotent_in_content(self):
        self.pipe.ingest_company(self.cik)
        first = self.fact_store.read_company(self.cik)
        self.pipe.ingest_company(self.cik, force=True)
        second = self.fact_store.read_company(self.cik)
        self.assertEqual(first["factbook"], second["factbook"])
        self.assertEqual(first["raw_companyfacts_sha256"],
                         second["raw_companyfacts_sha256"])

    def test_provenance_records_first_retrieval_not_the_current_run(self):
        """Re-running against unchanged SEC data must not churn the store.

        The retrieval timestamp in provenance is when the payload was first
        seen, so an unchanged companyfacts payload re-normalizes byte for byte.
        """
        self.pipe.ingest_company(self.cik)
        first = self.fact_store.read_company(self.cik)
        self.pipe.ingest_company(self.cik, force=True)
        second = self.fact_store.read_company(self.cik)
        timelines = {t["metric"]: t for t in first["factbook"]["timelines"]}
        again = {t["metric"]: t for t in second["factbook"]["timelines"]}
        sample = timelines["revenue"]["observations"][0]["provenance"]["retrieved_at"]
        self.assertEqual(sample, again["revenue"]["observations"][0]["provenance"]["retrieved_at"])
        self.assertEqual(first["profile"]["retrieved_at"],
                         second["profile"]["retrieved_at"])
        self.assertEqual(first["factbook"], second["factbook"])

    def test_the_content_hash_ignores_our_own_annotations(self):
        store = JsonRawStore(Path(self.tmp.name) / "hash-check")
        first = store.put("0000000001", "companyfacts",
                          {"cik": 1, "facts": {}, "_retrieved_at": "2026-01-01T00:00:00+00:00"})
        second = store.put("0000000001", "companyfacts",
                           {"cik": 1, "facts": {}, "_retrieved_at": "2026-09-07T12:00:00+00:00"})
        self.assertEqual(first, second)
        self.assertEqual(len(store.versions("0000000001", "companyfacts")), 1)


class UniverseTests(PipelineTestCase):
    def setUp(self):
        super().setUp()
        self.companies = [
            make_company(4000000010 + index, f"SYN{index}", f"SYNTHETIC {index}",
                         "3674", "1231")[0]
            for index in range(1, 5)
        ]
        self.pipe, self.stub = self.pipeline(self.companies)
        self.entries = [{"cik": company[0]} for company in self.companies]

    def test_a_universe_is_ingested_and_a_manifest_written(self):
        outcome = self.pipe.ingest_universe(self.entries)
        self.assertEqual(len(outcome["results"]), 4)
        self.assertEqual(len(self.fact_store.list_companies()), 4)
        self.assertEqual(outcome["manifest"]["run"]["completed"], 4)

    def test_a_resumed_run_skips_companies_already_completed(self):
        self.pipe.ingest_universe(self.entries)
        second = self.pipe.ingest_universe(self.entries)
        self.assertEqual(second["results"], [])

    def test_a_failure_is_logged_and_the_run_continues(self):
        entries = self.entries + [{"cik": 4999999}]  # not stubbed -> 404
        outcome = self.pipe.ingest_universe(entries)
        statuses = {result["cik"]: result["status"] for result in outcome["results"]}
        self.assertEqual(statuses["0004999999"], STATUS_FAILED)
        self.assertEqual(sum(1 for value in statuses.values()
                             if value == STATUS_INGESTED), 4)

    def test_a_failed_company_lands_in_the_retry_queue(self):
        self.pipe.ingest_universe(self.entries + [{"cik": 4999999}])
        state = self.checkpoint.load()
        self.assertIn("0004999999", state["retry_queue"])
        self.assertEqual(state["failed"]["0004999999"]["attempts"], 1)

    def test_an_interrupted_run_resumes_where_it_stopped(self):
        self.pipe.ingest_universe(self.entries, limit=2)
        state = self.checkpoint.load()
        self.assertEqual(len(state["completed"]), 2)
        self.pipe.ingest_universe(self.entries)
        self.assertEqual(len(self.checkpoint.load()["completed"]), 4)
        self.assertEqual(len(self.fact_store.list_companies()), 4)

    def test_a_company_is_abandoned_after_repeated_failures(self):
        broken = [{"cik": 4999999}]
        for _ in range(4):
            self.pipe.ingest_universe(broken, resume=True)
        self.assertEqual(self.checkpoint.load()["failed"]["0004999999"]["attempts"], 3)

    def test_refresh_since_only_re_ingests_companies_with_new_filings(self):
        self.pipe.ingest_universe(self.entries)
        outcome = self.pipe.refresh_since("2099-01-01")
        self.assertEqual(outcome["results"], [])

    def test_a_checkpoint_without_a_stored_document_re_ingests(self):
        """A cleared store must not stay empty just because the checkpoint says done."""
        self.pipe.ingest_universe(self.entries)
        cik = self.fact_store.list_companies()[0]
        self.fact_store._path(cik).unlink()
        self.assertIsNone(self.fact_store.read_company(cik))
        outcome = self.pipe.ingest_universe(self.entries)
        statuses = {r["cik"]: r["status"] for r in outcome["results"]}
        self.assertEqual(statuses.get(cik), STATUS_INGESTED)
        self.assertIsNotNone(self.fact_store.read_company(cik))

    def test_refresh_since_picks_up_recent_filers(self):
        self.pipe.ingest_universe(self.entries)
        outcome = self.pipe.refresh_since("1990-01-01")
        self.assertEqual(len(outcome["results"]), 4)


class InspectorExportTests(PipelineTestCase):
    def setUp(self):
        super().setUp()
        company, _ = make_company(4000000020, "SYN9", "SYNTHETIC NINE", "3674", "1231")
        self.pipe, _ = self.pipeline([company])
        self.pipe.ingest_company(4000000020)
        self.document = self.fact_store.read_company(normalize_cik(4000000020))

    def test_the_view_carries_rows_with_full_provenance(self):
        view = export_inspector_view(self.document, self.registry, annual_years=3,
                                     quarterly_years=1)
        available = [row for row in view["rows"] if row["available"]]
        self.assertTrue(available)
        for row in available:
            with self.subTest(metric=row["metric"], period=row["fiscal_period"]):
                for field in ("available_from", "form", "accession", "concept", "source"):
                    self.assertTrue(row[field], f"{field} missing")

    def test_unavailable_rows_state_a_reason_instead_of_disappearing(self):
        view = export_inspector_view(self.document, self.registry, annual_years=3,
                                     quarterly_years=1)
        unavailable = [row for row in view["rows"] if not row["available"]]
        self.assertTrue(unavailable)
        for row in unavailable:
            self.assertIsNone(row["value"])
            self.assertTrue(row["reason"])

    def test_the_export_stays_small_enough_to_commit(self):
        view = export_inspector_view(self.document, self.registry)
        payload = json.dumps(view)
        self.assertLess(len(payload), 2_000_000, "inspector view must stay committable")

    def test_a_rehydrated_factbook_resolves_the_same_values(self):
        factbook = _rehydrate(self.document)
        resolver = PeriodResolver(factbook, self.registry)
        fact = resolver.annual("revenue", 2023, None, policy=POLICY_LATEST_KNOWN)
        self.assertTrue(fact.available)
        self.assertEqual(fact.provenance.source, "SEC_EDGAR_XBRL")


class CoverageTests(PipelineTestCase):
    def setUp(self):
        super().setUp()
        company, _ = make_company(4000000030, "SYN8", "SYNTHETIC EIGHT", "3674", "1231",
                                  first_end=date(2016, 12, 31), years=10)
        self.pipe, _ = self.pipeline([company])
        self.pipe.ingest_company(4000000030)
        self.document = self.fact_store.read_company(normalize_cik(4000000030))

    def test_years_with_full_structured_data_are_marked_structured(self):
        coverage = company_coverage(self.document, self.registry)
        self.assertEqual(coverage["years"][2023]["status"], STRUCTURED)

    def test_the_first_usable_year_is_reported(self):
        coverage = company_coverage(self.document, self.registry)
        self.assertIsNotNone(coverage["first_usable_year"])
        self.assertGreaterEqual(coverage["first_usable_year"], 2017)

    def test_a_year_with_no_filing_is_missing_not_silently_absent(self):
        coverage = company_coverage(self.document, self.registry)
        self.assertNotIn(1995, coverage["years"])
        matrix = build_matrix([self.document], self.registry, probe_years=(1995, 2023))
        self.assertEqual(matrix["grid"]["1995"]["SYN8"], MISSING)
        self.assertEqual(matrix["grid"]["2023"]["SYN8"], STRUCTURED)

    def test_the_matrix_reports_every_status_honestly(self):
        matrix = build_matrix([self.document], self.registry)
        statuses = set(matrix["grid"][year]["SYN8"] for year in matrix["grid"])
        self.assertTrue(statuses <= {STRUCTURED, DERIVABLE, FILING_ONLY, MISSING})


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def test_the_raw_store_never_overwrites_a_different_payload(self):
        store = JsonRawStore(Path(self.tmp.name) / "raw")
        first = store.put("0000000001", "companyfacts", {"a": 1})
        second = store.put("0000000001", "companyfacts", {"a": 2})
        self.assertNotEqual(first, second)
        self.assertEqual(len(store.versions("0000000001", "companyfacts")), 2)

    def test_the_fact_store_round_trips_a_document(self):
        store = JsonFactStore(Path(self.tmp.name) / "facts", compress=True)
        store.write_company("0000000001", {"cik": "0000000001", "x": [1, 2, 3]})
        self.assertEqual(store.read_company("0000000001")["x"], [1, 2, 3])
        self.assertEqual(store.list_companies(), ["0000000001"])

    def test_reading_an_unknown_company_returns_none(self):
        store = JsonFactStore(Path(self.tmp.name) / "facts", compress=True)
        self.assertIsNone(store.read_company("0000000099"))

    def test_a_checkpoint_survives_a_process_restart(self):
        directory = Path(self.tmp.name) / "state"
        checkpoint = CheckpointStore(directory, run_id="r1")
        state = checkpoint.load()
        state = checkpoint.mark_completed(state, "0000000001", {"status": "INGESTED"})
        checkpoint.save(state)
        reloaded = CheckpointStore(directory, run_id="r1").load()
        self.assertTrue(reloaded["completed"]["0000000001"])
        self.assertEqual(reloaded["last_cik"], "0000000001")

    def test_a_retry_success_clears_the_failure_entry(self):
        checkpoint = CheckpointStore(Path(self.tmp.name) / "state", run_id="r2")
        state = checkpoint.mark_failed(checkpoint.load(), "0000000002", "boom")
        self.assertIn("0000000002", state["retry_queue"])
        state = checkpoint.mark_completed(state, "0000000002", {"status": "INGESTED"})
        self.assertEqual(state["retry_queue"], [])
        self.assertNotIn("0000000002", state["failed"])


if __name__ == "__main__":
    unittest.main()
