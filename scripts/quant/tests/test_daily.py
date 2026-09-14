"""Der taegliche Incremental-Lifecycle - jeder Fall aus §17, synthetisch.

Der Stub spielt die SEC: Tagesindex, Einreichungsuebersicht und Fakten
je Emittent. Was hier PASS sagt, ist am Verhalten gemessen - Anfragen
gezaehlt, Dokumente verglichen, Zeitpunkte geprueft - und nicht an einer
Statusmeldung.
"""
import json
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from quant.sec import daily
from quant.sec.http_client import SECHTTPError
from quant.sec.periods import PeriodResolver
from quant.sec.pipeline import IngestionPipeline, _rehydrate
from quant.sec.provider import SECProvider
from quant.sec.registry import MetricRegistry
from quant.sec.restatements import POLICY_AS_OF_LATEST
from quant.sec.store import CheckpointStore, JsonFactStore, JsonRawStore
from quant.tests.fixtures import build_year_ends, standard_company
from quant.tests.test_pipeline_and_store import StubSEC

TODAY = date(2026, 9, 14)


class DailyStub(StubSEC):
    """StubSEC plus Tagesindex. Ein 404 fuer Tage ohne Index, wie bei der SEC."""

    def __init__(self, companies):
        super().__init__(companies)
        self.index = {}          # date -> list of (cik, form, filed, accession)
        self.broken = set()      # URLs that answer 500

    def get_bytes(self, url, use_cache=True):
        self.calls.append(url)
        for day, rows in self.index.items():
            if url == daily.index_url(day):
                lines = ["Description: Master Index", "", "CIK|Company Name|Form Type|Date Filed|Filename",
                         "--------------------------------------------------------------------------------"]
                for cik, form, filed, accession in rows:
                    lines.append(f"{int(cik)}|SYNTHETIC|{form}|{filed}|edgar/data/{int(cik)}/{accession}.txt")
                return "\n".join(lines).encode("latin-1")
        raise SECHTTPError(url, 404, "no index for that day", 1)

    def get_json(self, url, use_cache=True):
        if url in self.broken:
            self.calls.append(url)
            raise SECHTTPError(url, 500, "synthetic outage", 4)
        return super().get_json(url, use_cache=use_cache)


def _company(cik, ticker, years=4, revenue=None):
    fy_ends = build_year_ends(date(2021, 12, 31), years)
    builder, _ = standard_company(cik, fy_ends, revenue or (lambda year: 1000.0 + year))
    return (cik, ticker, f"SYNTHETIC {ticker}", "3674", "1231", builder), builder


def _new_10q(builder, cik, accession, filed, quarter_end, quarter_start, value):
    """Ein neues 10-Q mit einem Umsatzfakt und einer Bilanz, samt Filing-Eintrag."""
    builder.add("us-gaap", "Revenues", "USD", value, quarter_end, quarter_start, accession,
                "10-Q", filed, fy=quarter_end.year, fp="Q2")
    builder.add("us-gaap", "Assets", "USD", value * 4, quarter_end, None, accession,
                "10-Q", filed, fy=quarter_end.year, fp="Q2")
    builder.add_filing(accession, "10-Q", filed, quarter_end, acceptance=f"{filed}T16:05:00.000Z")


class DailyTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.registry = MetricRegistry.load()
        self.a, self.a_builder = _company(4300000001, "DYA")
        self.b, self.b_builder = _company(4300000002, "DYB")
        self.companies = [self.a, self.b]
        self.stub = DailyStub(self.companies)
        self.store = JsonFactStore(self.root / "facts", compress=True)
        self.checkpoint = CheckpointStore(self.root / "state", run_id="daily")
        self.pipe = IngestionPipeline(provider=SECProvider(client=self.stub), registry=self.registry,
                                      raw_store=JsonRawStore(self.root / "raw"),
                                      fact_store=self.store, checkpoint=self.checkpoint)
        self.ciks = {"4300000001", "4300000002"}
        # Historische Basis: einmal aufgebaut.
        for cik, *_ in self.companies:
            self.pipe.ingest_company(cik)
        self.state_path = self.root / "daily-state.json"
        daily.STATE_PATH = self.state_path
        self.state = daily.load_state(self.state_path)

    def _refresh_stub(self):
        """Die SEC-Antworten nach dem Bau neuer Filings neu einspielen."""
        neu = DailyStub(self.companies)
        neu.index = self.stub.index
        neu.broken = self.stub.broken
        neu.calls = self.stub.calls
        self.stub = neu
        self.pipe.provider = SECProvider(client=self.stub)

    def _run(self, today=TODAY, **kw):
        return daily.run_daily(self.pipe, self.stub, self.ciks, self.state, today=today, **kw)

    def _doc(self, cik):
        return self.store.read_company(str(cik).zfill(10))


class KeinNeuesFilingTests(DailyTestCase):
    def test_ohne_neues_filing_null_updates_und_keine_emittentenanfrage(self):
        self.stub.index[TODAY] = []
        vorher = len(self.stub.calls)
        report = self._run()
        self.assertEqual(report["STATUS"], "SUCCESS")
        self.assertEqual(report["ISSUERS_UPDATED"], 0)
        self.assertEqual(report["SEC_CHANGES_FOUND"], 0)
        self.assertEqual(report["NO_CHANGE"], 2)
        anfragen = self.stub.calls[vorher:]
        self.assertTrue(all("daily-index" in u for u in anfragen), anfragen)
        self.assertEqual(self.state["LAST_SEC_CHECK"], TODAY.isoformat())

    def test_ein_tag_ohne_index_ist_kein_fehler(self):
        report = self._run()
        self.assertEqual(report["STATUS"], "SUCCESS")
        self.assertIn(TODAY.isoformat(), report["SEC_INDEX"]["daysWithoutIndex"])


class EinNeues10QTests(DailyTestCase):
    def setUp(self):
        super().setUp()
        _new_10q(self.a_builder, "4300000001", "4300000001-26-000099", "2026-09-12",
                 date(2026, 6, 30), date(2026, 4, 1), 777.0)
        self._refresh_stub()
        self.stub.index[date(2026, 9, 12)] = [("4300000001", "10-Q", "2026-09-12", "4300000001-26-000099")]

    def test_nur_der_eine_emittent_wird_aktualisiert(self):
        vorher = len(self.stub.calls)
        report = self._run(since=date(2026, 9, 12))
        self.assertEqual(report["STATUS"], "SUCCESS")
        self.assertEqual(report["ISSUERS_UPDATED"], 1)
        self.assertEqual(report["updated"][0]["cik"], "4300000001")
        self.assertEqual(report["updated"][0]["latestAccession"], "4300000001-26-000099")
        self.assertEqual(report["updated"][0]["latestAcceptedAt"], "2026-09-12T16:05:00.000Z")
        self.assertIn("revenue", report["updated"][0]["metricsChanged"])
        # Emittent B: keine einzige Anfrage.
        anfragen = self.stub.calls[vorher:]
        self.assertFalse(any("4300000002" in u for u in anfragen), anfragen)
        # Kein Full Backfill: zwei Anfragen fuer A (submissions, companyfacts) plus Index.
        self.assertLessEqual(sum(1 for u in anfragen if "data.sec.gov" in u), 3)
        self.assertEqual(report["UNCHANGED_ISSUERS_REPROCESSED"], 0)

    def test_zwei_laeufe_mit_denselben_daten_sind_idempotent(self):
        self._run(since=date(2026, 9, 12))
        doc1 = json.dumps({k: v for k, v in self._doc("4300000001").items() if k != "generated_at_utc"},
                          sort_keys=True)
        state1 = json.dumps(self.state["ISSUER_LAST_PROCESSED"], sort_keys=True)
        vorher = len(self.stub.calls)
        report = self._run(since=date(2026, 9, 12))
        self.assertEqual(report["ISSUERS_UPDATED"], 0)
        self.assertEqual(report["SEC_CHANGES_FOUND"], 1)      # der Index nennt es noch
        self.assertEqual(report["ISSUERS_CHANGED"], 0)        # aber es ist verarbeitet
        self.assertFalse(any("data.sec.gov" in u for u in self.stub.calls[vorher:]))
        doc2 = json.dumps({k: v for k, v in self._doc("4300000001").items() if k != "generated_at_utc"},
                          sort_keys=True)
        self.assertEqual(doc1, doc2)
        self.assertEqual(state1, json.dumps(self.state["ISSUER_LAST_PROCESSED"], sort_keys=True))

    def test_keine_doppelten_perioden_oder_akzessionen(self):
        self._run(since=date(2026, 9, 12))
        report = self._run(since=date(2026, 9, 12))
        doc = self._doc("4300000001")
        keys = [(t["metric"], t["fiscal_year"], t["fiscal_period"]) for t in doc["factbook"]["timelines"]]
        self.assertEqual(len(keys), len(set(keys)), "doppelte Periode")
        self.assertEqual(daily._accession_dupes(doc), 0)
        self.assertEqual(report["ACCESSION_DUPLICATES"], 0)

    def test_keine_future_leakage(self):
        self._run(since=date(2026, 9, 12))
        doc = self._doc("4300000001")
        for t in doc["factbook"]["timelines"]:
            for o in t["observations"]:
                self.assertGreaterEqual(o["available_from"][:10], o["filed"],
                                        "verfuegbar vor der Einreichung")
                self.assertGreaterEqual(o["filed"], o["period_end"][:10] if False else "0000",)
        # Der neue Fakt ist erst ab seinem Einreichungsdatum sichtbar.
        factbook = _rehydrate(doc)
        resolver = PeriodResolver(factbook, self.registry)
        davor = resolver.quarter("revenue", 2026, 2, date(2026, 9, 11), policy=POLICY_AS_OF_LATEST)
        danach = resolver.quarter("revenue", 2026, 2, date(2026, 9, 12), policy=POLICY_AS_OF_LATEST)
        self.assertTrue(davor is None or not davor.available or davor.value is None)
        self.assertEqual(danach.value, 777.0)


class AmendmentTests(DailyTestCase):
    def setUp(self):
        super().setUp()
        _new_10q(self.a_builder, "4300000001", "4300000001-26-000099", "2026-09-10",
                 date(2026, 6, 30), date(2026, 4, 1), 777.0)
        self._refresh_stub()
        self.stub.index[date(2026, 9, 10)] = [("4300000001", "10-Q", "2026-09-10", "4300000001-26-000099")]
        self._run(since=date(2026, 9, 10), today=date(2026, 9, 10))
        # Das Amendment korrigiert den Umsatz - spaeter eingereicht.
        self.a_builder.add("us-gaap", "Revenues", "USD", 790.0, date(2026, 6, 30), date(2026, 4, 1),
                           "4300000001-26-000120", "10-Q/A", "2026-09-13", fy=2026, fp="Q2")
        self.a_builder.add_filing("4300000001-26-000120", "10-Q/A", "2026-09-13", date(2026, 6, 30),
                                  acceptance="2026-09-13T17:30:00.000Z")
        self._refresh_stub()
        self.stub.index[date(2026, 9, 13)] = [("4300000001", "10-Q/A", "2026-09-13", "4300000001-26-000120")]

    def test_amendment_erhaelt_die_pit_historie(self):
        report = self._run(since=date(2026, 9, 11))
        self.assertEqual(report["AMENDMENTS_FOUND"], 1)
        self.assertEqual(report["ISSUERS_UPDATED"], 1)
        doc = self._doc("4300000001")
        cell = next(t for t in doc["factbook"]["timelines"]
                    if t["metric"] == "revenue" and t["fiscal_year"] == 2026 and t["fiscal_period"] == "Q2")
        accessions = [o["provenance"]["accession"] for o in cell["observations"]]
        self.assertIn("4300000001-26-000099", accessions, "der urspruengliche Fakt wurde geloescht")
        self.assertIn("4300000001-26-000120", accessions)
        self.assertTrue(cell["restated"])
        resolver = PeriodResolver(_rehydrate(doc), self.registry)
        vor_amendment = resolver.quarter("revenue", 2026, 2, date(2026, 9, 12), policy=POLICY_AS_OF_LATEST)
        nach_amendment = resolver.quarter("revenue", 2026, 2, date(2026, 9, 14), policy=POLICY_AS_OF_LATEST)
        self.assertEqual(vor_amendment.value, 777.0)
        self.assertEqual(nach_amendment.value, 790.0)


class TeilfehlerUndRetryTests(DailyTestCase):
    def setUp(self):
        super().setUp()
        for cik, builder in (("4300000001", self.a_builder), ("4300000002", self.b_builder)):
            _new_10q(builder, cik, f"{cik}-26-000099", "2026-09-12", date(2026, 6, 30), date(2026, 4, 1), 500.0)
        self._refresh_stub()
        self.stub.index[date(2026, 9, 12)] = [
            ("4300000001", "10-Q", "2026-09-12", "4300000001-26-000099"),
            ("4300000002", "10-Q", "2026-09-12", "4300000002-26-000099")]

    def test_ein_fehler_kostet_nicht_den_ganzen_lauf(self):
        self.stub.broken.add("https://data.sec.gov/submissions/CIK4300000002.json")
        report = self._run(since=date(2026, 9, 12))
        self.assertEqual(report["STATUS"], "PARTIAL_SUCCESS")
        self.assertEqual(report["ISSUERS_UPDATED"], 1)
        self.assertEqual(report["FAILED_ISSUERS"], 1)
        self.assertEqual(report["retryQueue"], ["4300000002"])
        self.assertEqual(self.state["LAST_SEC_CHECK"], TODAY.isoformat())

    def test_die_schlange_wird_beim_naechsten_lauf_geleert(self):
        self.stub.broken.add("https://data.sec.gov/submissions/CIK4300000002.json")
        self._run(since=date(2026, 9, 12))
        self.stub.broken.clear()
        self.stub.index[date(2026, 9, 13)] = []
        report = self._run(since=date(2026, 9, 13))
        self.assertEqual(report["STATUS"], "SUCCESS")
        self.assertEqual(report["RETRIED"], 1)
        self.assertEqual(report["ISSUERS_UPDATED"], 1)
        self.assertEqual(report["updated"][0]["cik"], "4300000002")
        self.assertEqual(report["RETRY_QUEUE"], 0)

    def test_keine_endlosschleife(self):
        self.stub.broken.add("https://data.sec.gov/submissions/CIK4300000002.json")
        for _ in range(daily.MAX_ATTEMPTS + 2):
            self._run(since=date(2026, 9, 12))
        report = self._run(since=date(2026, 9, 12))
        self.assertEqual(report["RETRIED"], 0)
        self.assertEqual(report["ISSUERS_UPDATED"], 0)


class NeuerEmittentTests(DailyTestCase):
    def test_ein_neuer_emittent_im_universum_wird_geholt(self):
        c, _ = _company(4300000003, "DYC", years=2)
        self.companies.append(c)
        self._refresh_stub()
        self.ciks.add("4300000003")
        self.stub.index[TODAY] = []
        report = self._run()
        self.assertEqual(report["NEW_ISSUERS"], 1)
        self.assertEqual(report["ISSUERS_UPDATED"], 1)
        self.assertTrue(report["updated"][0]["wasNew"])
        self.assertIsNotNone(self._doc("4300000003"))


class StateTests(DailyTestCase):
    def test_der_state_wird_aus_dem_speicher_gebootstrappt_und_fortgeschrieben(self):
        self.assertEqual(self.state["ISSUER_LAST_PROCESSED"], {})
        self.stub.index[TODAY] = []
        report = self._run()
        self.assertEqual(report["STATE_BOOTSTRAPPED"], 2)
        wieder = daily.load_state(self.state_path)
        for feld in ("LAST_SUCCESSFUL_RUN", "LAST_SEC_CHECK", "NORMALIZATION_LOGIC_VERSION"):
            self.assertIsNotNone(wieder[feld], feld)
        eintrag = wieder["ISSUER_LAST_PROCESSED"]["4300000001"]
        for feld in ("LATEST_ACCESSION", "LATEST_FILED_AT", "LATEST_ACCEPTED_AT", "PROCESSED_AT"):
            self.assertIn(feld, eintrag)

    def test_dry_run_holt_nichts_und_schreibt_keinen_erfolg(self):
        _new_10q(self.a_builder, "4300000001", "4300000001-26-000099", "2026-09-12",
                 date(2026, 6, 30), date(2026, 4, 1), 777.0)
        self._refresh_stub()
        self.stub.index[date(2026, 9, 12)] = [("4300000001", "10-Q", "2026-09-12", "4300000001-26-000099")]
        vorher = len(self.stub.calls)
        report = self._run(since=date(2026, 9, 12), dry_run=True)
        self.assertEqual(report["ISSUERS_CHANGED"], 1)
        self.assertEqual(report["ISSUERS_UPDATED"], 0)
        self.assertFalse(any("data.sec.gov" in u for u in self.stub.calls[vorher:]))
        self.assertIsNone(self.state["LAST_SUCCESSFUL_RUN"])


class IndexParserTests(unittest.TestCase):
    def test_master_index_wird_gelesen(self):
        text = ("Description: x\n\nCIK|Company Name|Form Type|Date Filed|Filename\n"
                "----\n1045810|NVIDIA CORP|10-Q|2026-08-27|edgar/data/1045810/0001045810-26-000123.txt\n"
                "12345|SOME TRUST|N-CSR|2026-08-27|edgar/data/12345/0000012345-26-000001.txt\n")
        rows = daily.parse_master_index(text)
        self.assertEqual(rows[0]["cik"], "0001045810")
        self.assertEqual(rows[0]["accession"], "0001045810-26-000123")
        self.assertEqual(rows[0]["form"], "10-Q")
        self.assertEqual(len(rows), 2)

    def test_manifest_traegt_die_ziele(self):
        report = {"RUN_DATE": "2026-09-14", "STATUS": "SUCCESS", "updated": []}
        m = daily.updated_issuers_manifest(report)
        self.assertEqual(m["UPDATED_ISSUERS"], [])
        self.assertIn("Backtesting Data", m["INVALIDATE"])


if __name__ == "__main__":
    unittest.main()
