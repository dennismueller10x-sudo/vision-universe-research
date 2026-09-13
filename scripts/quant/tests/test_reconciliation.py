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
            # Tiefe am EMITTENTEN, nicht am Umsatz - eine Bank meldet
            # keinen Umsatz und haette hier sonst Historie 0.
            "historyYears": 9.0, "quarterlyPeriods": 36,
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
                     "historyYears": 10.0, "quarterlyPeriods": 40,
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

    def test_eine_abweichung_vom_abgenommenen_stand_wird_gemeldet(self):
        """§4: nicht stillschweigend einen neuen Nenner verwenden.

        Diese drei Testsaetze koennen den abgenommenen Stand gar nicht
        treffen. Genau das muss der Bericht sagen - mit Differenz und
        Ursachenliste, nicht mit einer stillen Anpassung.
        """
        o = rec.overlap_report(self.records, None)
        a = o["acceptedMarketDataState"]
        self.assertEqual(a["accepted"]["HISTORICAL_CHART_AVAILABLE"], 6997)
        self.assertEqual(a["accepted"]["TECHNICAL_HISTORY_ELIGIBLE"], 5963)
        self.assertFalse(a["reconciled"])
        self.assertNotEqual(a["delta"]["HISTORICAL_CHART_AVAILABLE"], 0)
        self.assertIn("neuer Nenner", a["explanation"])
        # Keine Schnittmenge darf gegen die abgenommene Summe gerechnet sein.
        self.assertLessEqual(o["TECHNICAL_AND_FUNDAMENTAL"], o["TECHNICAL_COVERED"])

    def test_mit_der_kanonischen_quelle_stimmt_die_rechnung_ueberein(self):
        """Der Sinn des Anschlusses: die eigene Zahl MUSS die abgenommene treffen."""
        markt = {
            "source": {"kind": "CANONICAL", "runId": "34611793308",
                       "accepted": {"HISTORICAL_CHART_AVAILABLE": 2,
                                    "TECHNICAL_HISTORY_ELIGIBLE": 2}},
            "members": [],
        }
        a = rec.overlap_report(self.records, markt)["acceptedMarketDataState"]
        self.assertEqual(a["status"], "CANONICAL_PER_INSTRUMENT")
        self.assertTrue(a["reconciled"], a["explanation"])
        self.assertEqual(a["delta"]["HISTORICAL_CHART_AVAILABLE"], 0)
        self.assertIsNone(a["explanation"])

    def test_ohne_kanonische_quelle_sagt_der_bericht_das(self):
        """Eine Stichprobe darf sich nicht als Deckung ausgeben."""
        a = rec.overlap_report(self.records, None)["acceptedMarketDataState"]
        self.assertEqual(a["status"], "LEGACY_GATE_RUNS")


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


class HistorientiefeTests(unittest.TestCase):
    """Die Tiefe gehoert dem Emittenten, nicht dem Umsatz.

    AllianceBernstein ist seit 1988 notiert und hat 17 Jahre
    Nettoergebnis, Cashflow und Bilanzsumme - aber keinen Umsatz-Tag.
    Banken melden Zinsertraege, Vermoegensverwalter Gebuehren. Wer die
    Historie am Umsatz misst, schreibt 635 Emittenten eine Null zu und
    schiebt 517 davon in die Anbieterbegruendung.
    """

    @staticmethod
    def bank():
        return {"issuerId": "iss_cik_0001109354", "historyYears": 17.0,
                "quarterlyPeriods": 69,
                "pit": {"state": "PIT_READY", "resolvedValues": 600},
                "metrics": {
                    "revenue": {"annualPeriods": 0, "historyYears": 0.0},
                    "net_income": {"annualPeriods": 18, "historyYears": 17.0},
                    "total_assets": {"annualPeriods": 17, "historyYears": 16.0},
                },
                "latestFiling": {"form": "10-Q"}, "qualitySummary": {}}

    def test_ein_emittent_ohne_umsatz_hat_trotzdem_historie(self):
        self.assertEqual(rec._annual_years(self.bank()), 17.0)
        self.assertEqual(rec._revenue_years(self.bank()), 0.0)

    def test_die_quartalstiefe_kommt_ebenfalls_vom_emittenten(self):
        self.assertEqual(rec._quarter_years(self.bank()), 69 / 4.0)

    def test_eine_bank_ist_kein_anbieterkandidat(self):
        """Der Fehler, den das kostet: 517 Titel, die nichts brauchen,
        was man kaufen kann, in der Begruendung fuer einen Einkauf."""
        members = {"ref_AB": {
            "memberId": "ref_AB", "symbols": ["AB"], "instrumentIds": ["vu_ab"],
            "issuerId": "iss_cik_0001109354", "cik": "0001109354",
            "eligibility": "ELIGIBLE", "securityType": "COMMON_STOCK",
            "securityClass": None, "shareClass": None, "country": "US",
            "adrEvidence": None, "firstTradeDate": "1988-04-15", "otc": False}}
        records = rec.join_members(members, {"iss_cik_0001109354": self.bank()},
                                  {"members": []})
        grund, wieder = rec.classify_gap(records[0], today="2026-09-13",
                                         sec_tickers={"AB"})
        self.assertIsNone(grund, "eine Bank mit 17 Jahren Historie hat keine Luecke")
        self.assertIsNone(wieder)


class BranchenschichtTests(unittest.TestCase):
    """§10: die Branchenschicht wird je Branche gezaehlt, nie gegen den Kern."""

    def _bank(self, member, cik, nii_jahre, deposits_jahre):
        return titel(
            memberId=member, cik=cik, fundamentals=True, resolvedValues=40,
            pitState="PIT_READY", annualYears=float(max(nii_jahre, deposits_jahre)),
            metrics={m: m in ("net_income", "total_assets", "stockholders_equity")
                     for m in rec.CORE_METRIC_LABELS},
            _fund={"cik": cik, "industry": "BANK", "industryMetrics": {
                "net_interest_income": {"annualPeriods": nii_jahre,
                                        "historyYears": float(nii_jahre)},
                "deposits": {"annualPeriods": deposits_jahre,
                             "historyYears": float(deposits_jahre)},
            }})

    def test_der_nenner_ist_die_branche(self):
        records = [
            self._bank("ref_b1", "0000000021", 8, 8),
            self._bank("ref_b2", "0000000022", 0, 3),
            self._bank("ref_b3", "0000000023", 0, 0),
            titel(memberId="ref_i1", cik="0000000031", fundamentals=True,
                  _fund={"cik": "0000000031", "industry": None, "industryMetrics": {}}),
        ]
        bericht = rec.industry_layer_report(records)
        self.assertEqual(list(bericht["industries"]), ["BANK"])
        bank = bericht["industries"]["BANK"]
        self.assertEqual(bank["ISSUERS"], 3)
        self.assertEqual(bank["ISSUERS_WITH_ANY_INDUSTRY_METRIC"], 2)
        self.assertEqual(bank["ISSUERS_WITHOUT_ANY_INDUSTRY_METRIC"], 1)
        self.assertEqual(bank["metrics"]["net_interest_income"]["ISSUERS"], 1)
        self.assertEqual(bank["metrics"]["net_interest_income"]["ISSUERS_5Y"], 1)
        self.assertEqual(bank["metrics"]["deposits"]["ISSUERS"], 2)
        self.assertEqual(bank["metrics"]["deposits"]["ISSUERS_5Y"], 1)

    def test_zwei_titel_eines_emittenten_zaehlen_einmal(self):
        records = [self._bank("ref_b1", "0000000021", 8, 8),
                   self._bank("ref_b1_classB", "0000000021", 8, 8)]
        bank = rec.industry_layer_report(records)["industries"]["BANK"]
        self.assertEqual(bank["ISSUERS"], 1)

    def test_der_kernvertrag_bleibt_unberuehrt(self):
        records = [self._bank("ref_b1", "0000000021", 8, 8)]
        kern = rec.core_metric_report(records)["metrics"]
        self.assertEqual(kern[rec.CORE_METRIC_LABELS["revenue"]]["COUNT"], 0)
        self.assertEqual(kern[rec.CORE_METRIC_LABELS["net_income"]]["COUNT"], 1)


class OhneXbrlTests(unittest.TestCase):
    """Ein leeres companyfacts ist kein Mapping-Problem."""

    def test_null_rohe_fakten_sind_kein_mapping_fall(self):
        r = titel(fundamentals=True, latestForm="40-F", cik="0000000041",
                  _fund={"rawFacts": 0, "mappedFacts": 0, "unmappedFacts": 0, "sic": "4011"})
        ursache, beleg = rec.fine_cause(r)
        self.assertEqual(ursache, "NO_XBRL_FACTS")
        self.assertEqual(rec.FINE_TO_RECOVERABILITY[ursache], "EXTERNAL_PROVIDER_CANDIDATE")
        self.assertIn("40-F", beleg)

    def test_nur_deckblatt_fakten_sind_keine_abschluesse(self):
        r = titel(fundamentals=True, latestForm="40-F", cik="0000016868",
                  findingCodes={"UNPLACEABLE_PERIOD": 6},
                  _fund={"rawFacts": 6, "mappedFacts": 0, "unmappedFacts": 0, "sic": "4011",
                         "name": "CANADIAN NATIONAL RAILWAY CO"})
        ursache, _ = rec.fine_cause(r)
        self.assertEqual(ursache, "NO_XBRL_FINANCIALS")

    def test_ein_emittent_mit_abschluessen_faellt_nicht_darunter(self):
        r = titel(fundamentals=True, latestForm="10-Q", cik="0000000042",
                  findingCodes={"UNKNOWN_CONCEPT": 400},
                  _fund={"rawFacts": 632, "mappedFacts": 0, "unmappedFacts": 442, "sic": "3572",
                         "name": "Cerebras Systems Inc."})
        ursache, _ = rec.fine_cause(r)
        self.assertNotIn(ursache, ("NO_XBRL_FACTS", "NO_XBRL_FINANCIALS"))


class JungeNotierungOhneXbrlTests(unittest.TestCase):
    def test_ein_fonds_ohne_xbrl_bleibt_not_applicable(self):
        r = titel(fundamentals=True, latestForm="N-CSR", cik="0000000051",
                  _fund={"rawFacts": 0, "mappedFacts": 0, "unmappedFacts": 0, "sic": "",
                         "name": "BlackRock Capital Allocation Term Trust"})
        ursache, _ = rec.fine_cause(r)
        self.assertEqual(ursache, "SPECIAL_PURPOSE_ENTITY")

    def test_eine_junge_notierung_ohne_xbrl_loest_die_zeit(self):
        from datetime import date
        jung = date.today().replace(year=date.today().year - 1).isoformat()
        r = titel(fundamentals=True, latestForm="20-F", cik="0000000052", firstTradeDate=jung,
                  _fund={"rawFacts": 1, "mappedFacts": 0, "unmappedFacts": 0, "sic": "2834",
                         "name": "Agomab Therapeutics NV"})
        ursache, _ = rec.fine_cause(r)
        self.assertEqual(ursache, "VERY_YOUNG_LISTING")
        self.assertEqual(rec.FINE_TO_RECOVERABILITY[ursache], "RESOLVES_WITH_TIME")

    def test_nur_10q_und_kein_kalender_bei_junger_notierung(self):
        from datetime import date
        jung = date.today().replace(year=date.today().year - 1).isoformat()
        r = titel(fundamentals=True, latestForm="10-Q", cik="0000000053", firstTradeDate=jung,
                  findingCodes={"UNPLACEABLE_PERIOD": 16, "UNKNOWN_CONCEPT": 18},
                  _fund={"rawFacts": 34, "mappedFacts": 0, "unmappedFacts": 18, "calendarYears": 0,
                         "sic": "2834", "name": "Obsidian Therapeutics, Inc."})
        ursache, _ = rec.fine_cause(r)
        self.assertEqual(ursache, "VERY_YOUNG_LISTING")


class FeinkonsequenzTests(unittest.TestCase):
    """Die Grobgruppe uebernimmt die Feinkonsequenz - SEC_RECOVERABLE heisst dann, was es sagt."""

    def test_spac_wird_by_design_und_junge_notierung_loest_die_zeit(self):
        from datetime import date
        jung = date.today().replace(year=date.today().year - 1).isoformat()
        spac = titel(memberId="ref_s", cik="0000000061", fundamentals=True, latestForm="10-Q",
                     _fund={"cik": "0000000061", "rawFacts": 300, "mappedFacts": 0,
                            "unmappedFacts": 200, "calendarYears": 0, "sic": "6770",
                            "name": "Any Acquisition Corp"})
        jungtitel = titel(memberId="ref_j", cik="0000000062", fundamentals=True, latestForm="20-F",
                          firstTradeDate=jung,
                          _fund={"cik": "0000000062", "rawFacts": 0, "mappedFacts": 0,
                                 "unmappedFacts": 0, "sic": "2834", "name": "Fresh Bio NV"})
        for r in (spac, jungtitel):
            r["gapCause"] = "MISSING_CANONICAL_TAG_MAPPING"
            r["gapRecoverability"] = rec.SEC_RECOVERABLE
        records = [spac, jungtitel]
        rec.fine_classification_report(records)
        self.assertEqual(rec.apply_fine_consequences(records), 2)
        self.assertEqual(spac["gapRecoverability"], rec.BY_DESIGN)
        self.assertEqual(spac["coarseRecoverability"], rec.SEC_RECOVERABLE)
        self.assertEqual(jungtitel["gapRecoverability"], rec.RESOLVES_WITH_TIME)
        zaehlung = rec.recoverability_counts(records)
        self.assertEqual(zaehlung[rec.SEC_RECOVERABLE], 0)
        self.assertEqual(zaehlung[rec.BY_DESIGN], 1)
        self.assertEqual(zaehlung[rec.RESOLVES_WITH_TIME], 1)

    def test_ein_echter_mapping_fall_bleibt_sec_recoverable(self):
        r = titel(memberId="ref_m", cik="0000000063", fundamentals=True, latestForm="10-K",
                  findingCodes={"UNKNOWN_CONCEPT": 400},
                  _fund={"cik": "0000000063", "rawFacts": 900, "mappedFacts": 0,
                         "unmappedFacts": 800, "calendarYears": 5, "sic": "3572",
                         "name": "Old Industrial Corp"})
        r["gapCause"] = "MISSING_CANONICAL_TAG_MAPPING"; r["gapRecoverability"] = rec.SEC_RECOVERABLE
        rec.fine_classification_report([r])
        self.assertEqual(rec.apply_fine_consequences([r]), 0)
        self.assertEqual(r["gapRecoverability"], rec.SEC_RECOVERABLE)
