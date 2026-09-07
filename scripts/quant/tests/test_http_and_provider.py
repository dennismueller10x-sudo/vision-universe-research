"""SEC fair access and the provider surface. No test here touches the network."""
import json
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from quant.sec.http_client import (
    DiskCache, RateLimiter, SECHTTPError, SECHttpClient,
)
from quant.sec.provider import (
    SECProvider, TickerNotFound, normalize_cik, PERIODIC_FORMS,
)
from quant.tests.fixtures import FactsBuilder, submissions


class FakeClock:
    def __init__(self):
        self.now = 0.0
        self.slept = []

    def monotonic(self):
        return self.now

    def sleep(self, seconds):
        self.slept.append(seconds)
        self.now += seconds


class RateLimiterTests(unittest.TestCase):
    def test_burst_is_served_without_waiting(self):
        clock = FakeClock()
        limiter = RateLimiter(rate_per_second=5, burst=5,
                              monotonic=clock.monotonic, sleep=clock.sleep)
        for _ in range(5):
            self.assertEqual(limiter.acquire(), 0.0)
        self.assertEqual(clock.slept, [])

    def test_the_next_request_after_the_burst_waits(self):
        clock = FakeClock()
        limiter = RateLimiter(rate_per_second=5, burst=5,
                              monotonic=clock.monotonic, sleep=clock.sleep)
        for _ in range(5):
            limiter.acquire()
        waited = limiter.acquire()
        self.assertGreater(waited, 0.0)
        self.assertAlmostEqual(waited, 0.2, places=6)

    def test_the_sustained_rate_never_exceeds_the_configured_limit(self):
        clock = FakeClock()
        limiter = RateLimiter(rate_per_second=5, burst=5,
                              monotonic=clock.monotonic, sleep=clock.sleep)
        for _ in range(25):
            limiter.acquire()
        self.assertGreaterEqual(clock.now, (25 - 5) / 5 - 1e-9)

    def test_a_non_positive_rate_is_rejected(self):
        with self.assertRaises(ValueError):
            RateLimiter(rate_per_second=0)


class DiskCacheTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def test_a_stored_payload_is_returned(self):
        cache = DiskCache(self.tmp.name, ttl_seconds=3600)
        cache.put("https://example.test/a", b"payload")
        self.assertEqual(cache.get("https://example.test/a"), b"payload")
        self.assertEqual(cache.hits, 1)

    def test_an_expired_entry_is_a_miss(self):
        import os
        import time as time_module
        cache = DiskCache(self.tmp.name, ttl_seconds=10)
        cache.put("https://example.test/a", b"payload")
        path = cache._path("https://example.test/a")
        stale = time_module.time() - 3600
        os.utime(path, (stale, stale))
        self.assertIsNone(cache.get("https://example.test/a"))
        self.assertEqual(cache.misses, 1)

    def test_a_fresh_entry_within_the_ttl_is_a_hit(self):
        cache = DiskCache(self.tmp.name, ttl_seconds=3600)
        cache.put("https://example.test/a", b"payload")
        self.assertEqual(cache.get("https://example.test/a"), b"payload")

    def test_different_urls_do_not_collide(self):
        cache = DiskCache(self.tmp.name)
        cache.put("https://example.test/a", b"A")
        cache.put("https://example.test/b", b"B")
        self.assertEqual(cache.get("https://example.test/a"), b"A")
        self.assertEqual(cache.get("https://example.test/b"), b"B")


class HttpClientTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.clock = FakeClock()

    def _client(self, opener, **kwargs):
        return SECHttpClient(
            user_agent="TestSuite test@example.test",
            cache=DiskCache(self.tmp.name, ttl_seconds=3600),
            rate_limiter=RateLimiter(rate_per_second=1000, burst=1000,
                                     monotonic=self.clock.monotonic,
                                     sleep=self.clock.sleep),
            opener=opener, sleep=self.clock.sleep, jitter=lambda: 0.0, **kwargs)

    def test_a_user_agent_without_a_contact_address_is_refused(self):
        with self.assertRaises(ValueError):
            SECHttpClient(user_agent="just-a-bot")

    def test_the_declaring_user_agent_is_sent(self):
        seen = {}

        def opener(url, headers, timeout):
            seen.update(headers)
            return b"{}"

        self._client(opener).get_json("https://data.sec.gov/x.json")
        self.assertIn("@", seen["User-Agent"])

    def test_a_second_request_is_served_from_cache(self):
        calls = []

        def opener(url, headers, timeout):
            calls.append(url)
            return b'{"ok": true}'

        client = self._client(opener)
        client.get_json("https://data.sec.gov/x.json")
        client.get_json("https://data.sec.gov/x.json")
        self.assertEqual(len(calls), 1)
        self.assertEqual(client.stats["cache_hits"], 1)

    def test_a_retryable_status_is_retried_with_exponential_backoff(self):
        attempts = []

        def opener(url, headers, timeout):
            attempts.append(url)
            if len(attempts) < 3:
                raise urllib.error.HTTPError(url, 503, "Service Unavailable", {}, None)
            return b'{"ok": true}'

        client = self._client(opener)
        client.get_json("https://data.sec.gov/x.json")
        self.assertEqual(len(attempts), 3)
        self.assertEqual(self.clock.slept, [1.0, 2.0])

    def test_a_non_retryable_status_fails_immediately(self):
        attempts = []

        def opener(url, headers, timeout):
            attempts.append(url)
            raise urllib.error.HTTPError(url, 404, "Not Found", {}, None)

        with self.assertRaises(SECHTTPError) as caught:
            self._client(opener).get_json("https://data.sec.gov/missing.json")
        self.assertEqual(len(attempts), 1)
        self.assertEqual(caught.exception.status, 404)

    def test_retries_are_bounded(self):
        attempts = []

        def opener(url, headers, timeout):
            attempts.append(url)
            raise urllib.error.HTTPError(url, 429, "Too Many Requests", {}, None)

        client = self._client(opener, max_retries=2)
        with self.assertRaises(SECHTTPError):
            client.get_json("https://data.sec.gov/x.json")
        self.assertEqual(len(attempts), 3)

    def test_a_network_error_is_retried(self):
        attempts = []

        def opener(url, headers, timeout):
            attempts.append(url)
            if len(attempts) == 1:
                raise urllib.error.URLError("connection reset")
            return b"{}"

        self._client(opener).get_json("https://data.sec.gov/x.json")
        self.assertEqual(len(attempts), 2)

    def test_malformed_json_is_an_error_not_an_empty_result(self):
        with self.assertRaises(SECHTTPError):
            self._client(lambda url, headers, timeout: b"<html>").get_json(
                "https://data.sec.gov/x.json")

    def test_a_failed_fetch_is_not_cached(self):
        attempts = []

        def opener(url, headers, timeout):
            attempts.append(url)
            raise urllib.error.HTTPError(url, 404, "Not Found", {}, None)

        client = self._client(opener)
        for _ in range(2):
            with self.assertRaises(SECHTTPError):
                client.get_json("https://data.sec.gov/x.json")
        self.assertEqual(len(attempts), 2)


class StubClient:
    def __init__(self, responses):
        self.responses = responses
        self.calls = []

    def get_json(self, url, use_cache=True):
        self.calls.append(url)
        if url not in self.responses:
            raise SECHTTPError(url, 404, "not stubbed", 1)
        return json.loads(json.dumps(self.responses[url]))


class ProviderTests(unittest.TestCase):
    TICKER_URL = "https://www.sec.gov/files/company_tickers.json"

    def _provider(self, extra=None):
        responses = {self.TICKER_URL: {
            "0": {"cik_str": 1045810, "ticker": "SYN1", "title": "SYNTHETIC ONE"},
            "1": {"cik_str": 320193, "ticker": "SYN2", "title": "SYNTHETIC TWO"},
        }}
        responses.update(extra or {})
        return SECProvider(client=StubClient(responses))

    def test_normalize_cik_pads_and_strips(self):
        self.assertEqual(normalize_cik(320193), "0000320193")
        self.assertEqual(normalize_cik("CIK0000320193"), "0000320193")
        self.assertEqual(normalize_cik("320193"), "0000320193")

    def test_normalize_cik_rejects_nonsense(self):
        for value in (None, "", "abc"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                normalize_cik(value)

    def test_ticker_resolves_to_a_padded_cik(self):
        self.assertEqual(self._provider().resolve_ticker("syn1"), "0001045810")

    def test_an_unlisted_ticker_raises_rather_than_guessing(self):
        with self.assertRaises(TickerNotFound):
            self._provider().resolve_ticker("DELISTED")

    def test_try_resolve_returns_none_for_a_delisted_ticker(self):
        self.assertIsNone(self._provider().try_resolve_ticker("DELISTED"))

    def test_the_ticker_map_is_fetched_once(self):
        provider = self._provider()
        provider.resolve_ticker("SYN1")
        provider.resolve_ticker("SYN2")
        self.assertEqual(provider.client.calls.count(self.TICKER_URL), 1)

    def test_older_filing_pages_are_merged_into_the_index(self):
        base = submissions(1045810, "SYNTHETIC ONE", "3674", "0126", ["SYN1"], [])
        base["filings"]["recent"] = {
            "accessionNumber": ["a-2"], "form": ["10-K"], "filingDate": ["2024-02-20"],
            "reportDate": ["2023-12-31"], "acceptanceDateTime": [None],
            "primaryDocument": ["d.htm"], "isXBRL": [1],
        }
        base["filings"]["files"] = [{"name": "CIK0001045810-submissions-001.json"}]
        page = {"accessionNumber": ["a-1"], "form": ["10-K"], "filingDate": ["2013-02-20"],
                "reportDate": ["2012-12-31"], "acceptanceDateTime": [None],
                "primaryDocument": ["d.htm"], "isXBRL": [1]}
        provider = self._provider({
            "https://data.sec.gov/submissions/CIK0001045810.json": base,
            "https://data.sec.gov/submissions/CIK0001045810-submissions-001.json": page,
        })
        merged = provider.get_submissions("1045810")
        self.assertEqual(len(merged["filings"]["recent"]["accessionNumber"]), 2)
        rows = provider.get_filing_metadata("1045810", merged)
        self.assertEqual([row["accession"] for row in rows], ["a-2", "a-1"])

    def test_the_profile_carries_sic_and_fiscal_year_end(self):
        payload = submissions(19617, "SYNTHETIC BANK", "6021", "1231", ["SYNB"], [])
        provider = self._provider({
            "https://data.sec.gov/submissions/CIK0000019617.json": payload})
        profile = provider.get_company_profile("19617")
        self.assertEqual(profile.sic, "6021")
        self.assertEqual(profile.fiscal_year_end, "1231")
        self.assertTrue(profile.is_financial)

    def test_only_periodic_forms_become_raw_facts(self):
        builder = FactsBuilder(1045810)
        builder.add("us-gaap", "Revenues", "USD", 100.0, "2023-12-31", "2023-01-01",
                    "acc-1", "10-K", "2024-02-20", fy=2023, fp="FY")
        builder.add("us-gaap", "Revenues", "USD", 999.0, "2023-12-31", "2023-01-01",
                    "acc-2", "8-K", "2024-01-20", fy=2023, fp="FY")
        facts = list(self._provider().iter_raw_facts(builder.company_facts()))
        self.assertEqual([fact.form for fact in facts], ["10-K"])

    def test_incomplete_facts_are_dropped_not_repaired(self):
        builder = FactsBuilder(1045810)
        builder.add("us-gaap", "Revenues", "USD", None, "2023-12-31", "2023-01-01",
                    "acc-1", "10-K", "2024-02-20")
        builder.add("us-gaap", "Revenues", "USD", 100.0, "2023-12-31", "2023-01-01",
                    "acc-2", "10-K", None)
        self.assertEqual(list(self._provider().iter_raw_facts(builder.company_facts())), [])

    def test_availability_map_is_attached_to_raw_facts(self):
        builder = FactsBuilder(1045810)
        builder.add("us-gaap", "Revenues", "USD", 100.0, "2023-12-31", "2023-01-01",
                    "acc-1", "10-K", "2024-02-20")
        facts = list(self._provider().iter_raw_facts(
            builder.company_facts(), availability={"acc-1": "2024-02-20T17:05:00.000Z"}))
        self.assertEqual(facts[0].available_from, "2024-02-20T17:05:00.000Z")

    def test_capabilities_are_read_from_the_shared_provider_profile(self):
        """There is no SEC-specific capability matrix; the profile file is it."""
        declared = self._provider().DECLARED_CAPABILITIES
        self.assertIs(declared["marketDataOhlcv"], False)
        self.assertIs(declared["pointInTimeFundamentals"], True)
        self.assertIsNone(declared["delistedSecurities"])

    def test_an_unreadable_profile_yields_unverified_not_false(self):
        from quant.sec.provider import load_declared_capabilities
        self.assertEqual(load_declared_capabilities(path="/nonexistent.json"), {})

    def test_a_large_filing_index_is_processed_in_linear_time(self):
        """Regression: real filers have tens of thousands of filings.

        JPMorgan's live submissions index has roughly 70,000 filings across 71
        pages. The first live SEC run downloaded all of it in eight seconds and
        then spent over ten minutes inside get_filing_metadata, because the
        column helper copied the whole column once per row. The synthetic
        fixtures had fifty filings and never showed it.

        The bound below is deliberately generous: the linear version handles
        50,000 rows in well under a second, the quadratic one needs many
        minutes. Anything in between still fails the test.
        """
        import time

        count = 50_000
        payload = submissions(1045810, "SYNTHETIC ONE", "3674", "1231", ["SYN1"], [])
        payload["filings"]["recent"] = {
            "accessionNumber": [f"acc-{i:06d}" for i in range(count)],
            "form": ["10-Q" if i % 4 else "10-K" for i in range(count)],
            "filingDate": ["2024-02-20"] * count,
            "reportDate": ["2023-12-31"] * count,
            "acceptanceDateTime": [None] * count,
            "primaryDocument": ["d.htm"] * count,
            "isXBRL": [1] * count,
        }
        provider = self._provider({
            "https://data.sec.gov/submissions/CIK0001045810.json": payload})

        started = time.monotonic()
        rows = provider.get_filing_metadata("1045810", payload)
        elapsed = time.monotonic() - started

        self.assertEqual(len(rows), count)
        self.assertLess(elapsed, 10.0,
                        f"get_filing_metadata took {elapsed:.1f}s for {count} filings; "
                        "the per-row column copy is back")

    def test_a_short_column_is_padded_not_truncated(self):
        """Padding still has to work now that columns are built once."""
        payload = submissions(1045810, "SYNTHETIC ONE", "3674", "1231", ["SYN1"], [])
        payload["filings"]["recent"] = {
            "accessionNumber": ["a-1", "a-2"],
            "form": ["10-K", "10-Q"],
            "filingDate": ["2024-02-20", "2024-05-20"],
            "reportDate": ["2023-12-31"],          # deliberately short
            "acceptanceDateTime": [],              # deliberately empty
            "primaryDocument": ["d.htm", "e.htm"],
            "isXBRL": [1, 1],
        }
        provider = self._provider({
            "https://data.sec.gov/submissions/CIK0001045810.json": payload})
        rows = {row["accession"]: row for row in provider.get_filing_metadata("1045810", payload)}
        self.assertEqual(rows["a-1"]["report_date"], "2023-12-31")
        self.assertIsNone(rows["a-2"]["report_date"])
        self.assertIsNone(rows["a-1"]["acceptance_datetime"])

    def test_amendments_are_recognised_in_the_filing_index(self):
        payload = submissions(1045810, "SYNTHETIC ONE", "3674", "1231", ["SYN1"], [])
        payload["filings"]["recent"] = {
            "accessionNumber": ["a-1"], "form": ["10-K/A"], "filingDate": ["2024-06-01"],
            "reportDate": ["2023-12-31"], "acceptanceDateTime": ["2024-06-01T16:00:00.000Z"],
            "primaryDocument": ["d.htm"], "isXBRL": [1],
        }
        provider = self._provider({
            "https://data.sec.gov/submissions/CIK0001045810.json": payload})
        row = provider.get_filing_metadata("1045810")[0]
        self.assertTrue(row["is_amendment"])
        self.assertIn("10-K/A", PERIODIC_FORMS)


if __name__ == "__main__":
    unittest.main()
