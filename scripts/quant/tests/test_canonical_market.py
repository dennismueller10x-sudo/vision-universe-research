"""Der Anschluss an die kanonische Marktdatenquelle.

Bis hierher wurde der Overlap gegen die alten Gate-Laeufe gerechnet:
5.397 statt 6.997 Titel mit Kurshistorie, 5.378 statt 5.963 technisch
geeignet. Die Gate-Laeufe endeten VOR der Erweiterung des
Wertpapierstamms - das Ergebnis sah nach Deckung aus und war eine
Stichprobe.

Diese Tests halten drei Dinge fest:

  1. Der Identitaetsjoin trifft: securityId == masterMemberId, 7.004 von
     7.004, kein abweichendes Kuerzel.
  2. Die eigene Rechnung REPRODUZIERT den abgenommenen Stand exakt -
     nicht ungefaehr.
  3. Die kanonische Quelle bleibt die Quelle. Faellt sie weg, sagt das
     Artefakt es, statt still auf die Stichprobe zurueckzufallen.
"""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

ROOT = Path(__file__).resolve().parents[3]
METRIKEN = ROOT / "quant" / "data" / "market" / "history" / "coverage-metrics.json"
TECHNIK = (ROOT / "quant" / "data" / "technical" / "scale" /
           "technical-coverage-ELIGIBLE_US_EQUITY.json")
KANON_UNIVERSUM = (ROOT / "quant" / "data" / "market" / "scale" /
                   "universe-ELIGIBLE_US_EQUITY.json")
HERKUNFT = ROOT / "quant" / "data" / "market" / "history" / "CANONICAL_SOURCE.json"
MARKTFAEHIGKEIT = ROOT / "quant" / "data" / "universe" / "market-capability.json"

# Der am 20.09.2026 gemessene Stand - historischer Bezug. PR #366 hat am
# 03.10.2026 22 belegte Schuldverschreibungen aus der Produktpolicy
# genommen; die Herleitung dagegen bleibt unten exakt geprueft.
HISTORISCH_ABGENOMMEN = {
    "PRODUCT_TITLES": 6875,
    "R2_SERIES_AVAILABLE": 7802,
    "HISTORICAL_CHART_AVAILABLE": 6871,
    "TECHNICAL_HISTORY_ELIGIBLE": 5884,
}
# Stand 20.09.2026 nach Abzug der 22 DEBT-Titel (nur Mitgliedschaft, keine
# neue Messung): 6875-22 / 6871-22 / 5884-8.
STAND_0920_OHNE_DEBT = {
    "PRODUCT_TITLES": 6853,
    "HISTORICAL_CHART_AVAILABLE": 6849,
    "TECHNICAL_HISTORY_ELIGIBLE": 5876,
}
# Neuabnahme 04.10.2026 (coverage-metrics.yml gegen das aktuelle
# Produktuniversum). Jede Abweichung zum 20.09. ist je Titel erklaert
# (scripts/diagnose/coverage-delta.mjs, laeuft vor jedem Commit):
#   Charts  6871 -22 DEBT +1 BRTM (neues Listing vom 10.09., nachgeladen) = 6850
#   Technik 5884  -8 DEBT -139 Listing-Kuerzung (#367) +43 junge Reihen   = 5780
ABGENOMMEN = {
    "PRODUCT_TITLES": 6853,
    "R2_SERIES_AVAILABLE": 7802,
    "HISTORICAL_CHART_AVAILABLE": 6850,
    "TECHNICAL_HISTORY_ELIGIBLE": 5780,
}
# Stand der Mitgliedschaft nach dem Gattungsbeleg aus dem Boersenverzeichnis
# (scripts/market/apply-exchange-directory.mjs, 09.10.2026): 167 Titel belegt
# keine Stammaktie (127 Schuldverschreibungen, 32 ETN, 8 bestaetigte
# Rights/Warrants) - nur Mitgliedschaft, keine neue Messung, wie #366:
#   Titel   6853 - 167 = 6686
#   Charts  6850 - 167 = 6683   (keiner der 167 steht in den Chart-Ausnahmen)
#   Technik 5780 - 137 = 5643   (137 der 167 waren technisch bereit, laut
#                                tooShortSymbols der abgenommenen Messung)
AKTUELLER_POLICY_STAND = {
    "PRODUCT_TITLES": 6686,
    "HISTORICAL_CHART_AVAILABLE": 6683,
    "TECHNICAL_HISTORY_ELIGIBLE": 5643,
}
VERZEICHNIS_AUSGESCHLOSSEN = 167
ENTFERNTE_DEBT_TITEL = {
    "ADAMH", "BNH", "CICB", "CIMN", "CTGG", "CTHH", "DCOMG", "MFAN",
    "MFICL", "MHNC", "PRHIZ", "RWTN", "SAX", "SRJN", "SSSSL", "TMUSI",
    "TMUSL", "TMUSZ", "TPTS", "TRINI", "TRINZ", "UNMA",
}
CHART_AUSNAHMEN = {"GLMD", "BNRG", "JAB"}
# BRTM stand am 20.09. hier (Listing 10.09., < 2 Bars abgelegt); heute 17 Bars.
CHART_AUSNAHMEN_0920 = CHART_AUSNAHMEN | {"BRTM"}



def lade(path):
    return json.loads(path.read_text(encoding="utf-8"))


class QuelleVorhandenTests(unittest.TestCase):
    def test_die_kanonischen_artefakte_liegen_vor(self):
        for path in (METRIKEN, TECHNIK, KANON_UNIVERSUM, HERKUNFT):
            self.assertTrue(path.exists(), f"{path.name} fehlt")

    def test_die_herkunft_ist_festgehalten(self):
        """Ein uebernommenes Artefakt ohne Herkunft ist ein Fundstueck."""
        h = lade(HERKUNFT)
        self.assertEqual(h["sourceCommit"], "0b7d09a56e362e955880660e721a4bfc1de64a53")
        self.assertEqual(h["readOnly"]["priceRequests"], 0)
        self.assertEqual(h["readOnly"]["r2Writes"], 0)
        # Seit der Neuabnahme (15.09.2026) rechnet coverage-metrics.yml die
        # Kennzahlen gegen das aktuelle Produktuniversum neu; auch dieser
        # Lauf muss seine Herkunft nennen.
        if "regenerated" in h:
            r = h["regenerated"]
            self.assertEqual(r["workflow"], "coverage-metrics.yml")
            self.assertTrue(r.get("runId") and r.get("commit"), "Neurechnung ohne Lauf-ID oder Commit")

    def test_die_quelle_traegt_den_abgenommenen_stand(self):
        m = lade(METRIKEN)
        self.assertEqual(m["STORAGE_COVERAGE"]["stored"],
                         ABGENOMMEN["R2_SERIES_AVAILABLE"])
        self.assertEqual(m["CHART_AVAILABILITY"]["renderable"],
                         ABGENOMMEN["HISTORICAL_CHART_AVAILABLE"])
        self.assertEqual(m["TECHNICAL_HISTORY_ELIGIBILITY"]["eligible"],
                         ABGENOMMEN["TECHNICAL_HISTORY_ELIGIBLE"])
        self.assertEqual(m["CHART_AVAILABILITY"]["denominator"],
                         ABGENOMMEN["PRODUCT_TITLES"])
        # Die technischen Ausnahmen stehen vollstaendig und namentlich da.
        t = m["TECHNICAL_HISTORY_ELIGIBILITY"]
        self.assertEqual(len(t["tooShortSymbols"]), t["tooShort"])


class AusnahmelistenSindVollstaendigTests(unittest.TestCase):
    """Der Grund, warum sich aus Summen eine Aussage je Titel gewinnen laesst.

    Beide Berichte fuehren ihre Ausnahmen NAMENTLICH. Wer im
    Produktuniversum steht und in keiner Liste, ist gedeckt - das ist die
    Umkehrung einer vollstaendigen Aufzaehlung, keine Schaetzung. Sind
    die Listen unvollstaendig, faellt die ganze Konstruktion, und zwar
    still. Deshalb hier.
    """

    def test_die_chart_ausnahmen_gehen_genau_auf(self):
        m = lade(METRIKEN)["CHART_AVAILABILITY"]
        self.assertEqual(len(m["notRenderableSymbols"]), m["notRenderable"])
        self.assertEqual(m["renderable"] + m["notRenderable"], m["denominator"])

    def test_die_technischen_befunde_gehen_genau_auf(self):
        t = lade(TECHNIK)
        befunde = [r for r in t["perSymbol"].values()
                   if r.get("technical") != "TECHNICAL_READY"]
        nicht_ready = t["requested"] - t["coverage"]["TECHNICAL_READY"]
        self.assertEqual(len(befunde), nicht_ready,
                         "Die Befundliste deckt nicht alle nicht-READY Titel ab - "
                         "dann waere die Umkehrung falsch und die Deckung zu hoch.")

    def test_die_chart_ausnahmen_bleiben_im_aktuellen_universum(self):
        self.assertEqual(set(lade(METRIKEN)["CHART_AVAILABILITY"]["notRenderableSymbols"]), CHART_AUSNAHMEN)
        aktuell = {s["ticker"] for s in lade(KANON_UNIVERSUM)["securities"]}
        self.assertTrue(CHART_AUSNAHMEN <= aktuell)
        self.assertEqual({r["s"] for r in lade(MARKTFAEHIGKEIT)["members"] if not r["ph"]}, CHART_AUSNAHMEN)
        self.assertEqual(len(aktuell) - len(CHART_AUSNAHMEN), AKTUELLER_POLICY_STAND["HISTORICAL_CHART_AVAILABLE"])

    def test_der_aktuelle_nennerunterschied_ist_vollstaendig_durch_belegte_debt_erklaert(self):
        entscheidungen = lade(ROOT / "quant/data/market/security-master/eligibility.json")["decisions"]
        nach_id = {r["securityId"]: r for r in entscheidungen}
        # #366: die 22 Schuldverschreibungen aus dem Firmennamen bleiben ausgeschlossen
        debt = {t: nach_id["ref_" + t] for t in ENTFERNTE_DEBT_TITEL}
        aktuell = {s["securityId"]: s["ticker"] for s in lade(KANON_UNIVERSUM)["securities"]}
        for ticker, row in debt.items():
            self.assertEqual(row["instrument_type"], "DEBT")
            self.assertEqual(row["product_eligibility"], "EXCLUDED")
            self.assertEqual(row["product_eligibility_reason"], "CONFIRMED_NON_EQUITY:DEBT")
            self.assertNotIn(row["securityId"], aktuell)
        self.assertEqual(aktuell, {r["securityId"]: r["ticker"] for r in entscheidungen
                                   if r["product_eligibility"] != "EXCLUDED"})
        self.assertEqual(STAND_0920_OHNE_DEBT["PRODUCT_TITLES"], HISTORISCH_ABGENOMMEN["PRODUCT_TITLES"] - len(debt))
        self.assertFalse(ENTFERNTE_DEBT_TITEL & CHART_AUSNAHMEN_0920)
        befund = lade(TECHNIK)["perSymbol"]
        technisch_ready_entfernt = {ticker for ticker in debt
                                   if befund.get(ticker, {}).get("technical", "TECHNICAL_READY") == "TECHNICAL_READY"}
        self.assertEqual(len(technisch_ready_entfernt), 8)
        self.assertEqual(HISTORISCH_ABGENOMMEN["TECHNICAL_HISTORY_ELIGIBLE"] - len(technisch_ready_entfernt),
                         STAND_0920_OHNE_DEBT["TECHNICAL_HISTORY_ELIGIBLE"])
        self.assertEqual(HISTORISCH_ABGENOMMEN["HISTORICAL_CHART_AVAILABLE"] - len(debt),
                         STAND_0920_OHNE_DEBT["HISTORICAL_CHART_AVAILABLE"])

    def test_der_verzeichnisbeleg_erklaert_den_rest_je_titel(self):
        """apply-exchange-directory.mjs: jeder seit der Abnahme ausgeschlossene Titel steht mit
        Wertpapierbezeichnung und Regel im Abgleich; die Kennzahlen folgen aus den Namenslisten
        der abgenommenen Messung (keine neue Messung)."""
        abgleich = lade(ROOT / "quant/data/market/security-master/eligibility-reconciliation.json")
        raus = {c["ticker"] for c in abgleich["changes"]
                if c.get("source") == "NASDAQ_TRADER_SYMBOL_DIRECTORY" and c["to"]["productEligibility"] == "EXCLUDED"
                and c["from"]["productEligibility"] != "EXCLUDED"}
        self.assertEqual(len(raus), VERZEICHNIS_AUSGESCHLOSSEN)
        for c in abgleich["changes"]:
            if c.get("source") == "NASDAQ_TRADER_SYMBOL_DIRECTORY":
                self.assertTrue(c.get("securityName") and c.get("rule"), c["ticker"] + " ohne Beleg")
        m = lade(METRIKEN)
        self.assertFalse(raus & set(m["CHART_AVAILABILITY"]["notRenderableSymbols"]))
        ready_raus = raus - set(m["TECHNICAL_HISTORY_ELIGIBILITY"]["tooShortSymbols"])
        self.assertEqual(ABGENOMMEN["PRODUCT_TITLES"] - len(raus), AKTUELLER_POLICY_STAND["PRODUCT_TITLES"])
        self.assertEqual(ABGENOMMEN["HISTORICAL_CHART_AVAILABLE"] - len(raus), AKTUELLER_POLICY_STAND["HISTORICAL_CHART_AVAILABLE"])
        self.assertEqual(ABGENOMMEN["TECHNICAL_HISTORY_ELIGIBLE"] - len(ready_raus), AKTUELLER_POLICY_STAND["TECHNICAL_HISTORY_ELIGIBLE"])

    def test_der_bericht_erklaert_selbst_dass_er_nur_befunde_fuehrt(self):
        t = lade(TECHNIK)
        self.assertIn("alles ausser TECHNICAL_READY",
                      t["perSymbolDetail"]["reason"])


class IdentitaetsjoinTests(unittest.TestCase):
    """§3: der Join muss auditierbar sein."""

    def test_securityid_und_mastermemberid_sind_dieselbe_menge(self):
        kanon = {s["securityId"]: s["ticker"] for s in lade(KANON_UNIVERSUM)["securities"]}
        self.assertEqual(len(kanon), AKTUELLER_POLICY_STAND["PRODUCT_TITLES"])

        base = ROOT / "quant" / "data" / "universe" / "instruments"
        if not base.exists():
            self.skipTest("kein Company Master")
        IN_PRODUCT = {"ELIGIBLE", "SEPARATE_CLASS", "REVIEW"}
        meine = {}
        for path in sorted(base.glob("*.json")):
            for row in lade(path)["instruments"]:
                if row.get("productEligibility") in IN_PRODUCT:
                    key = row.get("masterMemberId") or row["instrumentId"]
                    meine.setdefault(key, set()).add(row["symbol"])

        self.assertEqual(set(kanon), set(meine),
                         "Das Produktuniversum hier ist nicht dasselbe, gegen das die "
                         "kanonischen Kennzahlen gerechnet wurden.")
        abweichend = [k for k, t in kanon.items() if t not in meine[k]]
        self.assertEqual(abweichend, [], f"Kuerzel weichen ab: {abweichend[:5]}")


class DieRechnungTrifftDenStandTests(unittest.TestCase):

    def setUp(self):
        if not MARKTFAEHIGKEIT.exists():
            self.skipTest("market-capability.json fehlt - erst der Node-Indexlauf")
        self.mc = lade(MARKTFAEHIGKEIT)

    def test_die_kanonische_quelle_hat_entschieden(self):
        self.assertEqual(self.mc["source"]["kind"], "CANONICAL",
                         "Es wurde aus den alten Gate-Laeufen gerechnet - das ist eine "
                         "Stichprobe und keine Deckung.")

    def test_kurshistorie_und_technik_reproduzieren_den_stand(self):
        t = self.mc["totals"]
        self.assertEqual(t["MEMBERS"], AKTUELLER_POLICY_STAND["PRODUCT_TITLES"])
        self.assertEqual(t["WITH_PRICE_HISTORY"], AKTUELLER_POLICY_STAND["HISTORICAL_CHART_AVAILABLE"])
        self.assertEqual(t["TECHNICAL_READY"], AKTUELLER_POLICY_STAND["TECHNICAL_HISTORY_ELIGIBLE"])

    def test_der_abgleich_trifft_den_neu_abgenommenen_stand(self):
        path = ROOT / "quant" / "data" / "fundamentals" / "reconciliation.json"
        if not path.exists():
            self.skipTest("kein Abgleich - erst cli.py reconcile")
        a = lade(path)["overlap"]["acceptedMarketDataState"]
        self.assertTrue(a["reconciled"], a.get("explanation"))
        self.assertEqual(a["status"], "CANONICAL_PER_INSTRUMENT")
        for key, value in ABGENOMMEN.items():
            self.assertEqual(a["accepted"][key], value)
        self.assertEqual(a["computed"], AKTUELLER_POLICY_STAND)
        self.assertEqual(a["delta"], {
            "HISTORICAL_CHART_AVAILABLE": 0,
            "TECHNICAL_HISTORY_ELIGIBLE": 0,
        })

    def test_die_technische_deckung_kommt_aus_der_aktuellen_messung(self):
        """Der Skalierungsbericht vom 11.09. kennt die Listing-Kuerzungen
        aus #367 nicht; er ist nur noch Rueckfall (Abgleich 04.10.2026)."""
        herkunft = lade(HERKUNFT).get("regenerated") or {}
        self.assertEqual(self.mc["source"]["runId"], herkunft.get("runId"),
                         "Der Abgleich nennt einen anderen Lauf als den, der gerechnet hat")
        self.assertEqual(self.mc["source"]["technicalSource"],
                         "quant/data/market/history/coverage-metrics.json"
                         "#TECHNICAL_HISTORY_ELIGIBILITY.tooShortSymbols")

    def test_die_ablagedeckung_wird_nicht_in_die_schnittmengen_gerechnet(self):
        """7.802 zaehlt gegen den Wertpapierstamm, nicht gegen das Produktuniversum."""
        path = ROOT / "quant" / "data" / "fundamentals" / "reconciliation.json"
        if not path.exists():
            self.skipTest("kein Abgleich")
        o = lade(path)["overlap"]
        for schluessel, wert in o.items():
            if isinstance(wert, int):
                self.assertLessEqual(wert, AKTUELLER_POLICY_STAND["PRODUCT_TITLES"],
                                     f"{schluessel} ist groesser als das Produktuniversum")


if __name__ == "__main__":
    unittest.main()
