"""Coverage gegen das Produktuniversum — §11, §12, §13, §19.

Der Fehler, den diese Tests verhindern, ist der bequemste von allen:
den Nenner aus dem eigenen Bestand zu nehmen. Eine Pipeline, die fuenf
Emittenten vollstaendig abdeckt und gegen fuenf Emittenten zaehlt, meldet
100 Prozent Coverage - und liegt um 6.999 Titel daneben.

Geprueft wird deshalb vor allem, WOGEGEN gezaehlt wird.
"""
import types
import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from quant.sec import universe_coverage as uc
from quant.sec.normalize import normalize_company
from quant.sec.provider import SECProvider, normalize_cik
from quant.sec.registry import MetricRegistry
from quant.tests.fixtures import build_year_ends, standard_company


class _NullClient:
    def get_json(self, url, use_cache=True):  # pragma: no cover
        raise AssertionError("kein Netz in Tests")


def dokument(cik, jahre=12, first_end=date(2014, 12, 31)):
    """Ein gespeichertes Factbook, wie die Pipeline es ablegt."""
    registry = MetricRegistry.load()
    fy_ends = build_year_ends(first_end, jahre)
    builder, _ = standard_company(cik, fy_ends, lambda year: 1000.0 * (year - 2013))
    provider = SECProvider(client=_NullClient())
    raw = list(provider.iter_raw_facts(builder.company_facts()))
    result = normalize_company(normalize_cik(cik), raw, registry,
                               filing_metadata=builder.filings)
    return {
        "cik": normalize_cik(cik),
        "versions": {"normalization_logic": "test"},
        "profile": {"cik": normalize_cik(cik), "name": f"SYNTHETIC {cik}", "sic": "3674",
                    "fiscal_year_end": "1231", "tickers": [f"SYN{cik % 100}"],
                    "entity_type": "operating", "sic_description": "Semiconductors",
                    "exchanges": ["Nasdaq"], "former_names": []},
        "quality": {"summary": {}, "findings": []},
        "factbook": result.factbook.to_dict(),
        "latest_filing": None,
        "raw_companyfacts_sha256": "deadbeef",
    }


def instrument(symbol, member, issuer_cik=None, eligibility="ELIGIBLE"):
    return {
        "instrumentId": "vu_" + symbol.lower().ljust(14, "0")[:14],
        "symbol": symbol, "masterMemberId": member,
        "productEligibility": eligibility,
        "issuerId": ("iss_cik_" + normalize_cik(issuer_cik)) if issuer_cik else None,
        "cik": normalize_cik(issuer_cik) if issuer_cik else None,
    }


def universum(instruments, resolution=None, capabilities=None):
    return {
        "instruments": instruments,
        "issuers": [],
        "resolution": resolution or {"totals": {"CIK_RESOLVED": 0, "CIK_UNRESOLVED": 0,
                                                "CIK_AMBIGUOUS": 0},
                                     "unresolvedByEligibility": {}},
        "capabilities": capabilities or {"counts": {}},
        "masterCoverage": None,
        "present": True,
    }


ROOT = Path(__file__).resolve().parents[2].parent


class DenominatorTests(unittest.TestCase):
    def test_the_denominator_is_the_product_universe_not_the_ingested_set(self):
        instruments = [instrument(f"S{n}", f"ref_S{n}", 4200000000 + n if n < 3 else None)
                       for n in range(10)]
        docs = [dokument(4200000000 + n) for n in range(3)]
        reports = uc.build_reports(ROOT, docs, universe=universum(instruments))

        c = reports["coverage"]
        self.assertEqual(c["universe"]["PRODUCT_TITLES"], 10)
        self.assertEqual(c["fundamentals"]["COMPANY_FACTS_AVAILABLE"], 3)
        # 3 von 10, nicht 3 von 3.
        self.assertAlmostEqual(c["metrics"]["revenue"]["PERCENT_OF_PRODUCT_UNIVERSE"], 30.0)

    def test_excluded_members_are_not_in_the_denominator(self):
        instruments = [instrument("A", "ref_A", 4200000001),
                       instrument("B", "ref_B", None, eligibility="EXCLUDED"),
                       instrument("C", "ref_C", None, eligibility="REVIEW")]
        reports = uc.build_reports(ROOT, [dokument(4200000001)],
                                   universe=universum(instruments))
        # ELIGIBLE + REVIEW zaehlen, EXCLUDED nicht.
        self.assertEqual(reports["coverage"]["universe"]["PRODUCT_TITLES"], 2)

    def test_two_share_classes_are_two_titles_but_one_issuer(self):
        """Der Kern von §15 in einer Zahl."""
        instruments = [instrument("GOOGL", "ref_GOOGL", 4200000007),
                       instrument("GOOG", "ref_GOOG", 4200000007)]
        reports = uc.build_reports(ROOT, [dokument(4200000007)],
                                   universe=universum(instruments))
        c = reports["coverage"]
        self.assertEqual(c["universe"]["PRODUCT_TITLES"], 2)
        self.assertEqual(c["universe"]["PRODUCT_ISSUERS"], 1)
        self.assertEqual(c["fundamentals"]["COMPANY_FACTS_AVAILABLE"], 1)

    def test_a_title_without_an_issuer_is_counted_and_named(self):
        instruments = [instrument("A", "ref_A", 4200000002),
                       instrument("OHNE", "ref_OHNE", None)]
        reports = uc.build_reports(ROOT, [dokument(4200000002)],
                                   universe=universum(instruments))
        c = reports["coverage"]
        self.assertEqual(c["universe"]["PRODUCT_TITLES"], 2)
        self.assertEqual(c["universe"]["PRODUCT_TITLES_WITHOUT_ISSUER"], 1)


class HistoryTests(unittest.TestCase):
    def test_history_depth_is_measured_not_assumed(self):
        instruments = [instrument("LANG", "ref_LANG", 4200000010)]
        docs = [dokument(4200000010, jahre=12, first_end=date(2014, 12, 31))]
        reports = uc.build_reports(ROOT, docs, universe=universum(instruments))
        tiefe = reports["history"]["annual"]["revenue"]
        self.assertEqual(tiefe[">=1y"], 1)
        self.assertEqual(tiefe[">=5y"], 1)
        self.assertEqual(tiefe[">=10y"], 1, "zwoelf Geschaeftsjahre muessen >=10y erreichen")
        self.assertEqual(tiefe[">=15y"], 0, "und nicht >=15y")

    def test_a_short_history_does_not_reach_the_deep_buckets(self):
        instruments = [instrument("KURZ", "ref_KURZ", 4200000011)]
        docs = [dokument(4200000011, jahre=3, first_end=date(2023, 12, 31))]
        reports = uc.build_reports(ROOT, docs, universe=universum(instruments))
        tiefe = reports["history"]["annual"]["revenue"]
        self.assertEqual(tiefe[">=1y"], 1)
        self.assertEqual(tiefe[">=5y"], 0)
        self.assertEqual(tiefe[">=10y"], 0)

    def test_first_and_last_period_are_reported_per_issuer(self):
        instruments = [instrument("X", "ref_X", 4200000012)]
        docs = [dokument(4200000012, jahre=8, first_end=date(2018, 12, 31))]
        reports = uc.build_reports(ROOT, docs, universe=universum(instruments))
        zeile = reports["history"]["perIssuerSample"][0]
        self.assertIsNotNone(zeile["firstPeriodEnd"])
        self.assertIsNotNone(zeile["lastPeriodEnd"])
        self.assertLess(zeile["firstPeriodEnd"], zeile["lastPeriodEnd"])
        self.assertGreater(zeile["annualPeriods"], 0)
        self.assertGreater(zeile["quarterlyPeriods"], 0)


class StreamingTests(unittest.TestCase):
    """Der Bericht darf nie zwei Factbooks gleichzeitig halten.

    Der zweite Produktivlauf ist genau daran gestorben: der Ingest lief
    76 Minuten erfolgreich durch, dann lud die Coverage-Messung alle
    5.437 Factbooks in eine Liste und der Runner bekam ein
    Shutdown-Signal. Ein einzelnes Factbook erreicht 17 MB.
    """

    def test_a_generator_is_accepted_and_consumed_lazily(self):
        instruments = [instrument(f"S{n}", f"ref_S{n}", 4300000000 + n) for n in range(4)]
        gleichzeitig = []
        lebend = {"n": 0}

        def strom():
            for n in range(4):
                lebend["n"] += 1
                gleichzeitig.append(lebend["n"])
                yield dokument(4300000000 + n, jahre=3, first_end=date(2023, 12, 31))
                lebend["n"] -= 1

        reports = uc.build_reports(ROOT, strom(), universe=universum(instruments))
        self.assertEqual(reports["coverage"]["fundamentals"]["COMPANY_FACTS_AVAILABLE"], 4)
        self.assertEqual(max(gleichzeitig), 1,
                         "es war mehr als ein Factbook gleichzeitig in Arbeit")

    def test_only_the_summary_is_kept_not_the_factbook(self):
        instruments = [instrument("A", "ref_A", 4300000100)]
        reports = uc.build_reports(
            ROOT, (dokument(4300000100) for _ in range(1)),
            universe=universum(instruments))
        zeile = list(reports["perIssuer"].values())[0]
        self.assertNotIn("factbook", zeile)
        self.assertNotIn("timelines", zeile)
        self.assertIn("metrics", zeile)
        self.assertIn("annualPeriods", zeile)

    def test_progress_logging_does_not_change_the_result(self):
        instruments = [instrument(f"S{n}", f"ref_S{n}", 4300000200 + n) for n in range(3)]
        docs = [dokument(4300000200 + n, jahre=3, first_end=date(2023, 12, 31))
                for n in range(3)]
        ohne = uc.build_reports(ROOT, iter(list(docs)), universe=universum(instruments))
        mit = uc.build_reports(ROOT, iter(list(docs)), universe=universum(instruments),
                               progress_every=1)
        self.assertEqual(ohne["coverage"]["metrics"], mit["coverage"]["metrics"])


class HonestyTests(unittest.TestCase):
    def test_an_empty_store_reports_zero_coverage_and_says_so(self):
        instruments = [instrument(f"S{n}", f"ref_S{n}", None) for n in range(50)]
        reports = uc.build_reports(ROOT, [], universe=universum(instruments))
        c = reports["coverage"]
        self.assertEqual(c["universe"]["PRODUCT_TITLES"], 50)
        self.assertEqual(c["fundamentals"]["COMPANY_FACTS_AVAILABLE"], 0)
        for metric, row in c["metrics"].items():
            with self.subTest(metric=metric):
                self.assertEqual(row["COUNT"], 0)
                self.assertEqual(row["PERCENT_OF_PRODUCT_UNIVERSE"], 0.0)

    def test_a_metric_the_issuer_never_reports_is_not_counted_as_covered(self):
        """Eine Kennzahl ohne aufloesbaren Wert ist keine Deckung."""
        instruments = [instrument("A", "ref_A", 4200000020)]
        docs = [dokument(4200000020)]
        reports = uc.build_reports(ROOT, docs, universe=universum(instruments))
        # Die Fixtur meldet keine Abschreibungen, also auch kein EBITDA -
        # und keinen Goodwill.
        per = list(reports["perIssuer"].values())[0]
        self.assertGreater(per["metrics"]["revenue"]["annualPeriods"], 0)
        self.assertEqual(reports["coverage"]["metrics"]["revenue"]["COUNT"], 1)

    def test_the_gap_report_names_causes_and_refuses_a_provider_decision(self):
        reports = uc.build_reports(ROOT, [], universe=universum(
            [instrument("A", "ref_A", None)],
            resolution={"totals": {"CIK_RESOLVED": 0, "CIK_UNRESOLVED": 7804,
                                   "CIK_AMBIGUOUS": 3},
                        "unresolvedByEligibility": {"ELIGIBLE": 6000}}))
        gaps = reports["gaps"]
        ursachen = {row["cause"] for row in gaps["byCause"]}
        self.assertIn("CIK_UNRESOLVED", ursachen)
        self.assertIn("CIK_AMBIGUOUS", ursachen)
        self.assertIn("NO_SEC_FILER", ursachen)
        self.assertTrue(gaps["providerDecision"].startswith("OFFEN"),
                        "eine Providerentscheidung auf ungemessenen Luecken waere eine "
                        "Ausgabe auf Verdacht")
        for row in gaps["byCause"]:
            with self.subTest(cause=row["cause"]):
                self.assertIn(row["secCanSupply"],
                              ("JA", "NEIN", "TEILWEISE", "EINGESCHRAENKT"))

    def test_the_overlap_report_admits_what_it_cannot_measure(self):
        reports = uc.build_reports(ROOT, [], universe=universum(
            [instrument("A", "ref_A", None)],
            capabilities={"counts": {"HAS_PRICE_HISTORY": {"PROVIDER_VERIFIED": 5690,
                                                           "DELIVERED": 5}}}))
        o = reports["overlap"]
        # Die Gate-Ableitung steht unter ihrem eigenen Namen und NICHT als
        # Marktdatendeckung: die kanonische Zahl gehoert dem R2-Workstream.
        self.assertEqual(o["fromGateRuns"]["instrumentsWithProviderPriceHistory"], 5690)
        self.assertIsNone(o["TECHNICAL_COVERED"])
        self.assertIsNone(o["TECHNICAL_AND_FUNDAMENTAL"])
        self.assertEqual(o["marketDataSource"]["status"], "NOT_CONNECTED")
        self.assertEqual(o["marketDataSource"]["accepted"]["R2_SERIES_AVAILABLE"], 7802)
        self.assertTrue(o["unmeasured"], "eine nicht gemessene Zahl braucht einen Grund")

    def test_the_gate_derivation_is_not_labelled_market_data_coverage(self):
        """Der Grund fuer diesen Test steht in einer Korrektur des Auftraggebers.

        Aus den Gate-Laeufen liess sich ableiten, dass 1.607 Produkttitel
        keine Kursdaten haben. Diese Zahl ist NICHT die kanonische
        Marktdatendeckung - die liegt im R2-Workstream und lautet 6.997
        von 7.004. Eine Ableitung aus einem fremden, aelteren Bestand als
        Deckung auszugeben ist genau die Art Fehler, die niemandem
        auffaellt.
        """
        reports = uc.build_reports(ROOT, [], universe=universum(
            [instrument("A", "ref_A", None)],
            capabilities={"counts": {"HAS_PRICE_HISTORY": {"PROVIDER_VERIFIED": 5690,
                                                           "DELIVERED": 5}}}))
        o = reports["overlap"]
        self.assertNotIn("TECHNICAL_COVERED_INSTRUMENTS", o,
                         "die Gate-Zahl darf nicht wie eine Deckungszahl heissen")
        self.assertIn("keine Marktdatendeckung", o["fromGateRuns"]["note"])
        self.assertEqual(o["marketDataSource"]["canonicalOwner"],
                         "R2-Workstream (quant/data/market/history)")


if __name__ == "__main__":
    unittest.main()


class PointInTimeTests(unittest.TestCase):
    """§13. Zeitpunktgenauigkeit ist eine Eigenschaft jedes einzelnen Werts.

    Der Acceptance Report fuehrte PIT bis hierher nur als Provider-Gate
    und fuer die fuenf Validierungstitel. Ein Gate, das sagt "die SEC
    liefert Einreichungsdaten", sagt nichts darueber, fuer wie viele der
    7.004 Produkttitel diese Daten auch wirklich da sind.
    """

    def test_ein_wert_ohne_einreichung_ist_nicht_datierbar(self):
        class OhneAkzession:
            provenance = types.SimpleNamespace(filed="2020-02-01", accession=None,
                                               available_from=None)

        class OhneDatum:
            provenance = types.SimpleNamespace(filed=None, accession="0001-20-00001",
                                               available_from=None)

        class Vollstaendig:
            provenance = types.SimpleNamespace(filed="2020-02-01",
                                               accession="0001-20-00001",
                                               available_from=None)

        self.assertFalse(uc._pit_datierbar(OhneAkzession()))
        self.assertFalse(uc._pit_datierbar(OhneDatum()))
        self.assertTrue(uc._pit_datierbar(Vollstaendig()))

    def test_ohne_provenance_ist_nichts_datierbar(self):
        self.assertFalse(uc._pit_datierbar(types.SimpleNamespace(provenance=None)))

    def test_pit_ready_verlangt_alle_werte(self):
        self.assertEqual(uc._pit_zustand(100, 100), uc.PIT_READY)
        self.assertEqual(uc._pit_zustand(99, 100), uc.PIT_PARTIAL)
        self.assertEqual(uc._pit_zustand(1, 100), uc.PIT_PARTIAL)

    def test_gar_keine_werte_ist_unavailable_und_nicht_ready(self):
        """Der bequemste Fehler: 0 von 0 als "alle" zu lesen."""
        self.assertEqual(uc._pit_zustand(0, 0), uc.PIT_UNAVAILABLE)
        self.assertEqual(uc._pit_zustand(0, 100), uc.PIT_UNAVAILABLE)
