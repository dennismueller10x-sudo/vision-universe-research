"""A provider's future context never becomes a fact, revision or PIT input."""
import copy
import tempfile
import unittest
from pathlib import Path

from quant.sec.canonical import build_company_bundle
from quant.sec.consumer import build_consumer_bundle
from quant.sec.normalize import normalize_company, ISSUE_FILED_BEFORE_PERIOD_END
from quant.sec.periods import PeriodResolver
from quant.sec.pipeline import IngestionPipeline
from quant.sec.provider import SECProvider
from quant.sec.registry import MetricRegistry
from quant.sec.restatements import Observation, POLICY_ORIGINAL
from quant.sec.model import Provenance
from quant.sec.store import JsonFactStore, JsonRawStore, CheckpointStore
from quant.tests.fixtures import FactsBuilder
from quant.tests.test_pipeline_and_store import StubSEC


class ProviderChronologyTests(unittest.TestCase):
    def setUp(self):
        self.registry = MetricRegistry.load()
        self.builder = FactsBuilder(4100000088)
        for year in (2017, 2018):
            self.builder.add("us-gaap", "Revenues", "USD", 5100, f"{year}-12-31",
                             f"{year}-01-01", f"annual-{year}", "10-K",
                             f"{year + 1}-02-15", year, "FY")
        # Synthetic reproduction of AMC's erroneous companyfacts context:
        # the same May Q1 filing claims both March Q1 and future June Q2.
        for end, start, value, accession, filed in (
            ("2018-03-31", "2018-01-01", 1383.6, "may-q1", "2018-05-07"),
            ("2018-06-30", "2018-04-01", 1383.6, "may-q1", "2018-05-07"),
            ("2018-06-30", "2018-04-01", 1442.5, "aug-q2", "2018-08-07"),
        ):
            self.builder.add("us-gaap", "Revenues", "USD", value, end, start,
                             accession, "10-Q", filed, 2018, "Q1")

    def normalized(self):
        provider = SECProvider(client=StubSEC([]))
        raw = list(provider.iter_raw_facts(self.builder.company_facts()))
        return normalize_company("4100000088", raw, self.registry), raw

    def test_bad_raw_context_is_recorded_and_never_available_before_valid_filing(self):
        result, raw = self.normalized()
        self.assertEqual(len([i for i in result.issues
                              if i["code"] == ISSUE_FILED_BEFORE_PERIOD_END]), 1)
        self.assertEqual(raw[3].filed, "2018-05-07", "raw evidence is never repaired")
        resolver = PeriodResolver(result.factbook, self.registry)
        self.assertFalse(resolver.quarter("revenue", 2018, 2, "2018-06-01").available)
        fact = resolver.quarter("revenue", 2018, 2, "2018-08-07", policy=POLICY_ORIGINAL)
        self.assertTrue(fact.available)
        self.assertEqual(fact.value, 1442.5)
        self.assertEqual(fact.provenance.accession, "aug-q2")

    def test_cached_invalid_observation_cannot_feed_original_or_latest_resolution(self):
        result, _ = self.normalized()
        result.factbook.add_observation("revenue", 2018, "Q2", Observation(
            value=9999, unit="USD", period_start="2018-04-01", period_end="2018-06-30",
            filed="2018-05-07", available_from="2018-05-07",
            provenance=Provenance(filed="2018-05-07", accession="bad-cached")))
        resolver = PeriodResolver(result.factbook, self.registry)
        self.assertFalse(resolver.quarter("revenue", 2018, 2, "2018-06-01").available)
        self.assertEqual(resolver.quarter("revenue", 2018, 2, "2018-08-07",
                                         policy=POLICY_ORIGINAL).value, 1442.5)

    def test_native_ingest_and_exports_keep_valid_revision_zero_and_all_chronology(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)
            provider = SECProvider(client=StubSEC([
                (4100000088, "SYNT", "SYNTHETIC CHRONOLOGY", "3674", "1231", self.builder)]))
            store = JsonFactStore(path / "facts", compress=True)
            pipe = IngestionPipeline(provider=provider, registry=self.registry,
                                     raw_store=JsonRawStore(path / "raw"), fact_store=store,
                                     checkpoint=CheckpointStore(path / "state", run_id="chronology"))
            pipe.ingest_company("4100000088")
            document = store.read_company("4100000088")
            canonical = build_company_bundle(document, self.registry, "SYNT")
            q2 = [f for f in canonical["facts"] if f["metricId"] == "revenue"
                  and f["fiscalYear"] == 2018 and f["fiscalPeriod"] == "Q2"]
            self.assertEqual(len(q2), 1)
            self.assertEqual(q2[0]["revisionId"], 0)
            self.assertEqual(q2[0]["restatementStatus"], "original")
            self.assertEqual(q2[0]["sourceFilingId"], "aug-q2")
            for fact in canonical["facts"]:
                self.assertGreaterEqual(fact["filedAt"], fact["periodEnd"])
                self.assertGreaterEqual(fact["availableAt"], fact["periodEnd"])
            consumer = build_consumer_bundle("4100000088", self.builder.company_facts(),
                                             self.registry, as_of="2018-08-07")
            for scope in ("annual", "quarterly"):
                for rows in consumer[scope].values():
                    for row in rows:
                        self.assertLessEqual(row[2], row[4])
                        self.assertLessEqual(row[4], "2018-08-07")

    def test_future_annual_context_cannot_poison_the_fiscal_calendar(self):
        broken = copy.deepcopy(self.builder.company_facts())
        broken["facts"]["us-gaap"]["Revenues"]["units"]["USD"].append({
            "start": "2030-01-01", "end": "2030-12-31", "val": 100,
            "accn": "bad-year", "form": "10-K", "filed": "2018-05-07", "fy": 2030, "fp": "FY"})
        raw = list(SECProvider(client=StubSEC([])).iter_raw_facts(broken))
        result = normalize_company("4100000088", raw, self.registry)
        self.assertNotIn(2030, result.factbook.fiscal_years())
        self.assertTrue(all(end.year < 2030 for end in result.factbook.calendar.fy_ends))
