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

from quant.cli import (_canonical_ticker, _declared_tickers, _load_universe,
                       _prune, _resolve_universe, _ticker_of, DEFAULT_UNIVERSE)

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


class TickerLabelTests(unittest.TestCase):
    """A CIK is not a ticker.

    Live run #8: CIK 0000034088 carries the whole Exxon filing history but the
    SEC lists no ticker on it any more, so the label fell back to the CIK and
    the canonical Security record went out with ticker "0000034088" — an
    identifier nobody can look up, and an invented value in a pipeline whose
    first rule is that there are none.
    """

    @staticmethod
    def document(cik, tickers):
        return {"cik": cik, "profile": {"tickers": tickers}}

    def test_the_sec_ticker_wins_when_the_sec_lists_one(self):
        declared = {"0000000001": "DECLARED"}
        self.assertEqual(
            _ticker_of(self.document("0000000001", ["REAL"]), declared), "REAL")

    def test_an_entity_without_a_sec_ticker_uses_the_declared_one(self):
        declared = {"0000034088": "XOM"}
        self.assertEqual(
            _ticker_of(self.document("0000034088", []), declared), "XOM")

    def test_a_cik_is_never_used_as_a_ticker(self):
        self.assertIsNone(_ticker_of(self.document("0000034088", []), {}))

    def test_a_canonical_security_without_any_ticker_stops_the_export(self):
        with self.assertRaises(SystemExit) as raised:
            _canonical_ticker(self.document("0000000042", []), {})
        self.assertIn("the CIK is not one", str(raised.exception))

    def test_the_shipped_universe_declares_a_ticker_for_every_cik(self):
        declared = _declared_tickers()
        for company in _load_universe(DEFAULT_UNIVERSE):
            with self.subTest(ticker=company["ticker"]):
                self.assertEqual(declared.get(company["cik"].zfill(10)),
                                 company["ticker"])


class PruneTests(unittest.TestCase):
    """An export directory must contain exactly what this run produced."""

    def setUp(self):
        import tempfile
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.directory = Path(self.tmp.name)

    def test_a_file_from_a_previous_name_is_removed(self):
        (self.directory / "0000034088.json").write_text("{}")
        (self.directory / "XOM.json").write_text("{}")
        with redirect_stdout(io.StringIO()):
            _prune(self.directory, {"XOM.json"})
        self.assertEqual([p.name for p in self.directory.glob("*.json")],
                         ["XOM.json"])

    def test_files_this_run_wrote_survive(self):
        for name in ("AAPL.json", "MSFT.json"):
            (self.directory / name).write_text("{}")
        _prune(self.directory, {"AAPL.json", "MSFT.json"})
        self.assertEqual(sorted(p.name for p in self.directory.glob("*.json")),
                         ["AAPL.json", "MSFT.json"])

    def test_a_missing_directory_is_not_an_error(self):
        _prune(self.directory / "absent", {"AAPL.json"})


if __name__ == "__main__":
    unittest.main()
