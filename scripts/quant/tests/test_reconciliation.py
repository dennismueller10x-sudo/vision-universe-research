"""Der Abgleich Fundamentals x Marktdaten - und die Fehler, die er machen koennte.

Die teuersten Fehler in einem Deckungsabgleich sind nicht die, bei denen
eine Zahl falsch ist. Es sind die, bei denen eine Zahl richtig aussieht
und etwas anderes misst als behauptet:

  - eine Luecke als "die SEC hat das schon" auszuweisen, ohne dass die
    SEC das Kuerzel ueberhaupt fuehrt,
  - eine Notiz von diesem Jahr als Anbieterkandidat zu zaehlen,
  - Werte und rohe Fakten in einen Qualitaetstopf zu addieren,
  - ueber das Kuerzel zu joinen und irgendwann die Geschaeftszahlen des
    Vorbesitzers an ein anderes Unternehmen zu haengen.

Jeder dieser Fehler steckte in einem frueheren Entwurf dieses Moduls.
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from quant.sec import reconciliation as rec


def titel(**kwargs):
    """Ein Produkttitel mit vernuenftigen Vorgaben; Tests setzen nur, was zaehlt."""
    basis = {
        "memberId": "ref_TEST", "symbols": ["TEST"], "instrumentIds": ["vu_test"],
        "issuerId": None, "cik": None, "eligibility": "ELIGIBLE",
        "securityType": "COMMON_STOCK", "shareClass": None, "country": "US",
        "adrEvidence": None, "firstTradeDate": "2005-01-03", "otc": False,
        "priceHistory": True, "priceSnapshot": True, "factorReady": True,
        "technicalState": "TECHNICAL_READY", "bars": 4000,
        "priceFirst": None, "priceLast": None, "marketEvidence": None,
        "fundamentals": False, "pitState": None, "resolvedValues": 0,
        "annualYears": 0.0, "quarterYears": 0.0, "latestForm": None,
        "findingCodes": {}, "metrics": {m: False for m in rec.CORE_METRIC_LABELS},
        "_fund": None,
    }
    basis.update(kwargs)
    return basis


class IdentitaetsjoinTests(unittest.TestCase):
    """§2. Das Kuerzel darf nicht der alleinige Schluessel sein."""

    def test_der_join_laeuft_ueber_mitglied_und_emittent(self):
        members = {
            "ref_A": {"memberId": "ref_A", "symbols": ["A"], "instrumentIds": ["vu_a"],
                      "issuerId": "iss_cik_0000000001", "cik": "0000000001",
                      "eligibility": "ELIGIBLE", "securityType": "COMMON_STOCK",
                      "securityClass": None, "shareClass": None, "country": "US",
                      "adrEvidence": None, "firstTradeDate": "2000-01-03", "otc": False},
        }
        fundamentals = {"iss_cik_0000000001": {
            "issuerId": "iss_cik_0000000001", "pit": {"state": "PIT_READY",
                                                      "resolvedValues": 12},
            "metrics": {"revenue": {"annualPeriods": 9, "historyYears": 9.0,
                                    "quarterlyPeriods": 36}},
            "latestFiling": {"form": "10-K"}, "qualitySummary": {}}}
        market = {"members": [{"m": "ref_A", "ph": True, "t": "TECHNICAL_READY", "b": 900}]}
        records = rec.join_members(members, fundamentals, market)
        self.assertEqual(len(records), 1)
        self.assertTrue(records[0]["fundamentals"])
        self.assertTrue(records[0]["priceHistory"])
        self.assertEqual(records[0]["annualYears"], 9.0)

    def test_zwei_aktienklassen_teilen_eine_historie_und_zaehlen_zweimal_als_papier(self):
        """§2: Fundamentals nicht duplizieren - aber zwei Papiere bleiben zwei."""
        gemeinsam = {"issuerId": "iss_cik_0000000002",
                     "pit": {"state": "PIT_READY", "resolvedValues": 40},
                     "metrics": {"revenue": {"annualPeriods": 10, "historyYears": 10.0,
                                             "quarterlyPeriods": 40}},
                     "latestFiling": {"form": "10-K"}, "qualitySummary": {}}
        members = {}
        for sym in ("GOOG", "GOOGL"):
            members["ref_" + sym] = {
                "memberId": "ref_" + sym, "symbols": [sym], "instrumentIds": ["vu_" + sym],
                "issuerId": "iss_cik_0000000002", "cik": "0000000002",
                "eligibility": "ELIGIBLE", "securityType": "COMMON_STOCK",
                "securityClass": None, "shareClass": None, "country": "US",
                "adrEvidence": None, "firstTradeDate": "2004-08-19", "otc": False}
        records = rec.join_members(members, {"iss_cik_0000000002": gemeinsam}, {"members": []})
        self.assertEqual(len(records), 2)
        self.assertTrue(all(r["fundamentals"] for r in records))
        # Die Historie wird REFERENZIERT, nicht kopiert und nicht addiert.
        self.assertEqual({r["annualYears"] for r in records}, {10.0})


class LueckenklassifikationTests(unittest.TestCase):

    def test_ohne_cik_und_ohne_sec_verzeichnis_wird_nichts_behauptet(self):
        """Der teuerste Fehler des ersten Entwurfs.

        838 Titel standen als IDENTITY_MAPPING_GAP und damit als
        SEC_RECOVERABLE im Bericht - "die SEC fuehrt jeden Einreicher".
        Kein einziger davon stand in den SEC-Verzeichnissen.
        """
        grund, wieder = rec.classify_gap(titel(), today="2026-09-13",
                                         sec_tickers={"ANDERS"})
        self.assertEqual(grund, rec.NO_CIK)
        self.assertEqual(wieder, rec.REQUIRES_REVIEW)

    def test_mit_sec_verzeichnis_ist_es_belegbar_unsere_luecke(self):
        grund, wieder = rec.classify_gap(titel(), today="2026-09-13",
                                         sec_tickers={"TEST"})
        self.assertEqual(grund, rec.IDENTITY_MAPPING_GAP)
        self.assertEqual(wieder, rec.SEC_RECOVERABLE)

    def test_ein_fehlgeschlagener_verzeichnisabruf_wird_nicht_zum_befund(self):
        """sec_tickers=None heisst 'nicht gemessen', nicht 'kennt das Kuerzel nicht'."""
        grund, _ = rec.classify_gap(titel(), today="2026-09-13", sec_tickers=None)
        self.assertEqual(grund, rec.NO_CIK)

    def test_eine_junge_notiz_ist_kein_anbieterkandidat(self):
        """Kein Anbieter verkauft Historie, die es noch nicht gibt."""
        grund, wieder = rec.classify_gap(
            titel(firstTradeDate="2026-02-02"), today="2026-09-13", sec_tickers=set())
        self.assertEqual(grund, rec.VERY_YOUNG_LISTING)
        self.assertEqual(wieder, rec.RESOLVES_WITH_TIME)

    def test_auslaendischer_einreicher_ist_mapping_arbeit_keine_anbieterfrage(self):
        """20-F liegt bei der SEC - die IFRS-Taxonomie ist nur nicht gemappt."""
        grund, wieder = rec.classify_gap(
            titel(fundamentals=True, resolvedValues=0, cik="0000217410",
                  latestForm="20-F", findingCodes={"UNKNOWN_CONCEPT": 5618}),
            today="2026-09-13", sec_tickers=set())
        self.assertEqual(grund, rec.FOREIGN_ISSUER)
        self.assertEqual(wieder, rec.SEC_RECOVERABLE)

    def test_us_einreicher_ohne_aufloesbare_werte_ist_unsere_normalisierung(self):
        grund, wieder = rec.classify_gap(
            titel(fundamentals=True, resolvedValues=0, cik="0000000003",
                  latestForm="10-Q", findingCodes={"UNKNOWN_CONCEPT": 12}),
            today="2026-09-13", sec_tickers=set())
        self.assertEqual(grund, rec.MISSING_CANONICAL_TAG_MAPPING)
        self.assertEqual(wieder, rec.SEC_RECOVERABLE)

    def test_ein_vorzug_meldet_keinen_eigenen_abschluss(self):
        grund, wieder = rec.classify_gap(
            titel(securityType="PREFERRED"), today="2026-09-13", sec_tickers=set())
        self.assertEqual(grund, rec.SPECIAL_SECURITY_STRUCTURE)
        self.assertEqual(wieder, rec.BY_DESIGN)

    def test_ein_gedeckter_titel_hat_keinen_grund(self):
        grund, wieder = rec.classify_gap(
            titel(fundamentals=True, resolvedValues=400, cik="0000000004",
                  annualYears=12.0, pitState="PIT_READY"),
            today="2026-09-13", sec_tickers=set())
        self.assertIsNone(grund)
        self.assertIsNone(wieder)

    def test_jeder_grund_hat_eine_wiederherstellbarkeit(self):
        """Ein Grund ohne Zuordnung faellt im Bericht mit KeyError auf - hier frueher."""
        for name, wert in vars(rec).items():
            if name.isupper() and isinstance(wert, str) and name.endswith(
                    ("_GAP", "_CIK", "_FACTS", "_ISSUER", "_REPORTING", "_LISTING",
                     "_STRUCTURE", "_MAPPING", "_CONFLICT", "_HISTORY", "_NORMALIZED",
                     "_UNAVAILABLE", "_REVIEW")):
                if wert in (rec.REQUIRES_REVIEW,):
                    continue
                self.assertIn(wert, rec.RECOVERABILITY,
                              f"{name} hat keine Wiederherstellbarkeit")


class BerichtTests(unittest.TestCase):

    def setUp(self):
        self.records = [
            titel(memberId="ref_1", symbols=["ONE"], fundamentals=True,
                  resolvedValues=100, pitState="PIT_READY", annualYears=12.0,
                  quarterYears=11.0, cik="0000000011",
                  metrics={m: True for m in rec.CORE_METRIC_LABELS}),
            titel(memberId="ref_2", symbols=["TWO"], fundamentals=False,
                  technicalState="TECHNICAL_READY"),
            titel(memberId="ref_3", symbols=["THREE"], fundamentals=True,
                  resolvedValues=5, pitState="PIT_READY", annualYears=1.0,
                  cik="0000000013", technicalState=None, priceHistory=False),
        ]

    def test_overlap_zaehlt_schnittmengen_und_nicht_summen(self):
        o = rec.overlap_report(self.records, None)
        self.assertEqual(o["PRODUCT_TITLES"], 3)
        self.assertEqual(o["TECHNICAL_COVERED"], 2)
        self.assertEqual(o["FUNDAMENTAL_COMPANY_FACTS_AVAILABLE"], 2)
        self.assertEqual(o["TECHNICAL_AND_FUNDAMENTAL"], 1)
        self.assertEqual(o["TECHNICAL_WITHOUT_FUNDAMENTALS"], 1)
        self.assertEqual(o["FUNDAMENTALS_WITHOUT_TECHNICAL"], 1)

    def test_backtest_stufen_sind_echte_teilmengen(self):
        b = rec.backtest_report(self.records)
        self.assertGreaterEqual(b["BACKTEST_PRICE_READY"], b["BACKTEST_PRICE_TECHNICAL_READY"])
        self.assertGreaterEqual(b["BACKTEST_PRICE_TECHNICAL_READY"],
                                b["BACKTEST_PRICE_FUNDAMENTAL_READY"])
        self.assertGreaterEqual(b["BACKTEST_PRICE_FUNDAMENTAL_READY"],
                                b["BACKTEST_PIT_FUNDAMENTAL_READY"])
        self.assertGreaterEqual(b["BACKTEST_PIT_FUNDAMENTAL_READY"], b["BACKTEST_5Y_READY"])
        self.assertGreaterEqual(b["BACKTEST_5Y_READY"], b["BACKTEST_10Y_READY"])
        self.assertGreaterEqual(b["BACKTEST_10Y_READY"], b["BACKTEST_15Y_READY"])

    def test_survivorship_wird_nicht_behauptet(self):
        b = rec.backtest_report(self.records)
        self.assertIs(b["lookAheadControl"]["survivorshipFreeUniverse"], False)

    def test_der_abgenommene_r2_stand_wird_nicht_nachgerechnet(self):
        """§1: read-only. Die Differenz gehoert in den Bericht, nicht in die Rechnung."""
        o = rec.overlap_report(self.records, None)
        akzeptiert = o["acceptedMarketDataState"]
        self.assertEqual(akzeptiert["accepted"]["HISTORICAL_CHART_AVAILABLE"], 6997)
        self.assertEqual(akzeptiert["accepted"]["TECHNICAL_HISTORY_ELIGIBLE"], 5963)
        # Keine Schnittmenge darf gegen die abgenommene Summe gerechnet sein.
        self.assertLessEqual(o["TECHNICAL_AND_FUNDAMENTAL"], o["TECHNICAL_COVERED"])
        self.assertIn("unattributable", akzeptiert)


class QualitaetTests(unittest.TestCase):

    def test_werte_und_rohe_fakten_werden_nicht_addiert(self):
        """Der erste Entwurf meldete 49,6 Mio MISSING gegen 1,6 Mio VALID."""
        fundamentals = {"iss_1": {
            "quality": {"HIGH": 100, "MEDIUM": 10},
            "pit": {"resolvedValues": 110},
            "metrics": {"revenue": {"annualPeriods": 5}},
            "qualitySummary": {"by_code": {"UNKNOWN_CONCEPT": 90000}},
        }}
        q = rec.quality_report([titel(fundamentals=True, resolvedValues=110,
                                     annualYears=5.0)], fundamentals)
        self.assertEqual(q["values"]["byState"], {"VALID": 100, "WARNING": 10})
        self.assertEqual(q["findings"]["byState"]["MISSING"], 90000)
        self.assertNotEqual(q["values"]["denominator"]["RESOLVED_VALUES"],
                            q["findings"]["denominator"]["RAW_XBRL_FACTS_WITH_FINDING"])

    def test_die_titelebene_deckt_alle_titel_ab(self):
        records = [titel(fundamentals=True, resolvedValues=9, annualYears=7.0),
                   titel(fundamentals=True, resolvedValues=0),
                   titel(fundamentals=False)]
        q = rec.quality_report(records, {})
        self.assertEqual(sum(q["titles"]["byState"].values()), len(records))


if __name__ == "__main__":
    unittest.main()
