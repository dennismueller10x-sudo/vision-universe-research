"""Ticker -> CIK resolution, including the reorganisation case found live.

The first live SEC run stopped here: the ticker XOM resolves to a different CIK
than the configured hint. That turned out not to be a typo but a corporate
reorganisation — measured on 2026-09-07 against data.sec.gov:

    CIK 0000034088  EXXON MOBIL CORP          132 periodic filings, 1993..2026,
                                              tickers=[] (no longer listed)
    CIK 0002115436  ExxonMobil Holdings Corp  1 periodic filing (2026-06-30),
                                              tickers=['XOM'] on NYSE

For fundamentals the historical CIK is the right one. These tests pin the rule
that lets that stand: a divergence is allowed ONLY when it is declared and
justified, so an accidentally wrong CIK still stops the run.
"""
import io
import json
import sys
import unittest
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from quant.cli import _load_universe, _resolve_universe, DEFAULT_UNIVERSE

ROOT = Path(__file__).resolve().parents[3]


class FakeProvider:
    """Ticker map stub. No network."""

    def __init__(self, mapping):
        self.mapping = mapping

    def try_resolve_ticker(self, ticker):
        return self.mapping.get(ticker)


class ResolutionRuleTests(unittest.TestCase):
    def test_a_matching_cik_is_accepted(self):
        provider = FakeProvider({"SYN": "0000000001"})
        entries = [{"ticker": "SYN", "cik": "0000000001"}]
        with redirect_stdout(io.StringIO()):
            resolved = _resolve_universe(provider, entries)
        self.assertEqual(resolved[0]["cik"], "0000000001")

    def test_an_unexplained_mismatch_still_stops_the_run(self):
        """The guard that caught the real problem must keep working."""
        provider = FakeProvider({"SYN": "0000000002"})
        entries = [{"ticker": "SYN", "cik": "0000000001"}]
        with self.assertRaises(SystemExit) as caught, redirect_stdout(io.StringIO()):
            _resolve_universe(provider, entries)
        self.assertIn("CIK mismatch", str(caught.exception))

    def test_a_declared_and_justified_override_is_accepted(self):
        provider = FakeProvider({"SYN": "0000000002"})
        entries = [{
            "ticker": "SYN", "cik": "0000000001",
            "cik_authority": "config",
            "cik_authority_reason": ("Measured against the SEC on 2026-09-07: the "
                                     "history sits on the configured CIK."),
        }]
        with redirect_stdout(io.StringIO()) as out:
            resolved = _resolve_universe(provider, entries)
        self.assertEqual(resolved[0]["cik"], "0000000001")
        self.assertEqual(resolved[0]["sec_ticker_map_cik"], "0000000002")
        self.assertIn("declared override", out.getvalue())

    def test_an_override_without_a_reason_is_refused(self):
        """An override is a claim; a claim without evidence is not accepted."""
        provider = FakeProvider({"SYN": "0000000002"})
        entries = [{"ticker": "SYN", "cik": "0000000001", "cik_authority": "config"}]
        with self.assertRaises(SystemExit) as caught, redirect_stdout(io.StringIO()):
            _resolve_universe(provider, entries)
        self.assertIn("cik_authority_reason", str(caught.exception))

    def test_a_token_reason_is_not_enough(self):
        provider = FakeProvider({"SYN": "0000000002"})
        entries = [{"ticker": "SYN", "cik": "0000000001",
                    "cik_authority": "config", "cik_authority_reason": "weil"}]
        with self.assertRaises(SystemExit), redirect_stdout(io.StringIO()):
            _resolve_universe(provider, entries)

    def test_a_ticker_the_sec_does_not_list_falls_back_to_the_hint(self):
        """Delisted issuers are not in the ticker map; the CIK still works."""
        provider = FakeProvider({})
        entries = [{"ticker": "GONE", "cik": "0000000009"}]
        with redirect_stdout(io.StringIO()) as out:
            resolved = _resolve_universe(provider, entries)
        self.assertEqual(resolved[0]["cik"], "0000000009")
        self.assertIn("not in the SEC ticker map", out.getvalue())


class ConfiguredUniverseTests(unittest.TestCase):
    """The shipped universe file must obey the rule it relies on."""

    @classmethod
    def setUpClass(cls):
        cls.companies = _load_universe(DEFAULT_UNIVERSE)

    def test_the_five_validation_companies_are_configured(self):
        self.assertEqual([c["ticker"] for c in self.companies],
                         ["NVDA", "AAPL", "MSFT", "JPM", "XOM"])

    def test_every_override_carries_measured_evidence(self):
        for company in self.companies:
            if company.get("cik_authority") == "config":
                with self.subTest(ticker=company["ticker"]):
                    reason = company.get("cik_authority_reason", "")
                    self.assertGreater(len(reason), 100,
                                       "an override must state what was measured")
                    self.assertIn("data.sec.gov", reason)
                    self.assertRegex(reason, r"\d{4}-\d{2}-\d{2}")

    def test_the_exxon_override_points_at_the_history_not_the_listing(self):
        xom = next(c for c in self.companies if c["ticker"] == "XOM")
        self.assertEqual(xom["cik"], "0000034088")
        self.assertEqual(xom["successor_cik"], "0002115436")
        self.assertEqual(xom["cik_authority"], "config")

    def test_no_other_company_overrides_the_sec(self):
        overrides = [c["ticker"] for c in self.companies
                     if c.get("cik_authority") == "config"]
        self.assertEqual(overrides, ["XOM"],
                         "an override is an exception and must stay one")


if __name__ == "__main__":
    unittest.main()
