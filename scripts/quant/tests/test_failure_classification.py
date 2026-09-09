import io
import tempfile
import unittest
import urllib.error

from quant.sec.failures import (
    IngestionFailure, NO_COMPANY_FACTS, NO_FILINGS, QUALITY_FAILURE, SEC_RATE_LIMIT,
    UNKNOWN, UNSUPPORTED_ENTITY, classify_failure,
)
from quant.sec.http_client import DiskCache, RateLimiter, SECHttpClient
from quant.sec.model import RawFact
from quant.sec.pipeline import IngestionPipeline, _ensure_supported_facts
from quant.sec.registry import MetricRegistry
from quant.sec.store import CheckpointStore, JsonFactStore, JsonRawStore

class FailureClassificationTests(unittest.TestCase):
    def test_typed_failure_keeps_its_stable_code(self):
        self.assertEqual(NO_FILINGS,
                         classify_failure(IngestionFailure(NO_FILINGS, "none")))

    def test_unknown_exception_does_not_masquerade_as_missing_data(self):
        self.assertEqual(UNKNOWN, classify_failure(RuntimeError("surprise")))

    def test_foreign_issuer_without_mappings_is_retained_as_unsupported(self):
        raw = RawFact(
            cik="0000000001", taxonomy="ifrs-full", concept="Revenue", unit="USD",
            value=1, start="2023-01-01", end="2023-12-31", accession="a",
            form="20-F", filed="2024-02-01",
        )
        with self.assertRaises(IngestionFailure) as caught:
            _ensure_supported_facts("0000000001", [raw], {"mapped": 0})
        self.assertEqual(UNSUPPORTED_ENTITY, caught.exception.code)

    def test_domestic_entity_without_mapped_facts_is_not_called_foreign(self):
        raw = RawFact(
            cik="0000000001", taxonomy="us-gaap", concept="Unknown", unit="USD",
            value=1, start="2023-01-01", end="2023-12-31", accession="a",
            form="10-K", filed="2024-02-01",
        )
        with self.assertRaises(IngestionFailure) as caught:
            _ensure_supported_facts("0000000001", [raw], {"mapped": 0})
        self.assertEqual(NO_COMPANY_FACTS, caught.exception.code)


class RateLimitStopTests(unittest.TestCase):
    def test_exhausted_429_halts_the_bulk_run_and_is_checkpointed(self):
        def blocked(url, headers, timeout):
            raise urllib.error.HTTPError(url, 429, "slow down", {}, io.BytesIO())

        with tempfile.TemporaryDirectory() as directory:
            client = SECHttpClient(
                opener=blocked,
                max_retries=1,
                sleep=lambda _: None,
                jitter=lambda: 0,
                cache=DiskCache(f"{directory}/cache"),
                rate_limiter=RateLimiter(rate_per_second=100000),
            )

            class Provider:
                ADAPTER_VERSION = "test"
                def __init__(self):
                    self.client = client
                def get_submissions(self, cik, include_history=True):
                    return self.client.get_json(f"https://example.test/{cik}")

            pipeline = IngestionPipeline(
                provider=Provider(),
                registry=MetricRegistry.load(),
                raw_store=JsonRawStore(f"{directory}/raw"),
                fact_store=JsonFactStore(f"{directory}/facts"),
                checkpoint=CheckpointStore(f"{directory}/state", "rate-limit"),
            )
            result = pipeline.ingest_universe([{"cik": 1}, {"cik": 2}])
            self.assertTrue(result["manifest"]["run"]["halted"])
            self.assertEqual(1, result["manifest"]["run"]["processed"])
            self.assertEqual(SEC_RATE_LIMIT,
                             result["state"]["failed"]["0000000001"]["code"])
            self.assertEqual(2, result["manifest"]["run"]["http"]["status_counts"]["429"])

    def test_quality_failure_halts_before_the_next_company(self):
        with tempfile.TemporaryDirectory() as directory:
            class Provider:
                ADAPTER_VERSION = "test"
                client = type("Client", (), {"stats": {}})()

            class QualityFailPipeline(IngestionPipeline):
                calls = []

                def ingest_company(self, cik, force=False):
                    self.calls.append(cik)
                    raise IngestionFailure(QUALITY_FAILURE, "PIT invariant failed")

            pipeline = QualityFailPipeline(
                provider=Provider(), registry=MetricRegistry.load(),
                raw_store=JsonRawStore(f"{directory}/raw"),
                fact_store=JsonFactStore(f"{directory}/facts"),
                checkpoint=CheckpointStore(f"{directory}/state", "quality-stop"),
            )
            result = pipeline.ingest_universe([{"cik": 1}, {"cik": 2}])
            self.assertTrue(result["manifest"]["run"]["halted"])
            self.assertEqual(["0000000001"], pipeline.calls)
            self.assertIn("data quality failure", result["manifest"]["run"]["stop_reason"])


if __name__ == "__main__":
    unittest.main()
