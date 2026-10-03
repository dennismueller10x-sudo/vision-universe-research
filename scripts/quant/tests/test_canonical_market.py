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

# Die Quelle ist der unveraenderte, am 20.09.2026 gemessene Stand.
# PR #366 hat am 03.10.2026 22 belegte Schuldverschreibungen aus der
# Produktpolicy genommen. Das aendert die aktuelle Mitgliedschaft, aber
# regeneriert keine historische R2-Messung. Beide Staende bleiben exakt
# geprueft; der native Abgleich muss die unterschiedliche Grundgesamtheit
# weiterhin als nicht abgestimmt melden.
HISTORISCH_ABGENOMMEN = {
    "PRODUCT_TITLES": 6875,
    "R2_SERIES_AVAILABLE": 7802,
    "HISTORICAL_CHART_AVAILABLE": 6871,
    "TECHNICAL_HISTORY_ELIGIBLE": 5884,
}
AKTUELLER_POLICY_STAND = {
    "PRODUCT_TITLES": 6853,
    "HISTORICAL_CHART_AVAILABLE": 6849,
    "TECHNICAL_HISTORY_ELIGIBLE": 5876,
}
ENTFERNTE_DEBT_TITEL = {
    "ADAMH", "BNH", "CICB", "CIMN", "CTGG", "CTHH", "DCOMG", "MFAN",
    "MFICL", "MHNC", "PRHIZ", "RWTN", "SAX", "SRJN", "SSSSL", "TMUSI",
    "TMUSL", "TMUSZ", "TPTS", "TRINI", "TRINZ", "UNMA",
}
CHART_AUSNAHMEN = {"GLMD", "BNRG", "BRTM", "JAB"}



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
                         HISTORISCH_ABGENOMMEN["R2_SERIES_AVAILABLE"])
        self.assertEqual(m["CHART_AVAILABILITY"]["renderable"],
                         HISTORISCH_ABGENOMMEN["HISTORICAL_CHART_AVAILABLE"])
        self.assertEqual(m["TECHNICAL_HISTORY_ELIGIBILITY"]["eligible"],
                         HISTORISCH_ABGENOMMEN["TECHNICAL_HISTORY_ELIGIBLE"])
        self.assertEqual(m["CHART_AVAILABILITY"]["denominator"],
                         HISTORISCH_ABGENOMMEN["PRODUCT_TITLES"])


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

    def test_alle_vier_historischen_chart_ausnahmen_bleiben_im_aktuellen_universum(self):
        self.assertEqual(set(lade(METRIKEN)["CHART_AVAILABILITY"]["notRenderableSymbols"]), CHART_AUSNAHMEN)
        aktuell = {s["ticker"] for s in lade(KANON_UNIVERSUM)["securities"]}
        self.assertTrue(CHART_AUSNAHMEN <= aktuell)
        self.assertEqual({r["s"] for r in lade(MARKTFAEHIGKEIT)["members"] if not r["ph"]}, CHART_AUSNAHMEN)
        self.assertEqual(len(aktuell) - len(CHART_AUSNAHMEN), AKTUELLER_POLICY_STAND["HISTORICAL_CHART_AVAILABLE"])

    def test_der_aktuelle_nennerunterschied_ist_vollstaendig_durch_belegte_debt_erklaert(self):
        entscheidungen = lade(ROOT / "quant/data/market/security-master/eligibility.json")["decisions"]
        debt = {r["ticker"]: r for r in entscheidungen if r.get("instrument_type") == "DEBT"}
        self.assertEqual(set(debt), ENTFERNTE_DEBT_TITEL)
        self.assertEqual(len(debt), 22)
        aktuell = {s["securityId"]: s["ticker"] for s in lade(KANON_UNIVERSUM)["securities"]}
        for ticker, row in debt.items():
            self.assertEqual(row["product_eligibility"], "EXCLUDED")
            self.assertEqual(row["product_eligibility_reason"], "CONFIRMED_NON_EQUITY:DEBT")
            self.assertEqual(row["securityId"], "ref_" + ticker)
            self.assertNotIn(row["securityId"], aktuell)
        self.assertEqual(aktuell, {r["securityId"]: r["ticker"] for r in entscheidungen
                                   if r["product_eligibility"] != "EXCLUDED"})
        self.assertEqual(len(aktuell) + len(debt), HISTORISCH_ABGENOMMEN["PRODUCT_TITLES"])
        self.assertFalse(ENTFERNTE_DEBT_TITEL & CHART_AUSNAHMEN)
        befund = lade(TECHNIK)["perSymbol"]
        technisch_ready_entfernt = {ticker for ticker in debt
                                   if befund.get(ticker, {}).get("technical", "TECHNICAL_READY") == "TECHNICAL_READY"}
        self.assertEqual(len(technisch_ready_entfernt), 8)
        self.assertEqual(HISTORISCH_ABGENOMMEN["TECHNICAL_HISTORY_ELIGIBLE"] - len(technisch_ready_entfernt),
                         AKTUELLER_POLICY_STAND["TECHNICAL_HISTORY_ELIGIBLE"])

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

    def test_der_abgleich_behaelt_den_erklaerten_historischen_nennerunterschied(self):
        path = ROOT / "quant" / "data" / "fundamentals" / "reconciliation.json"
        if not path.exists():
            self.skipTest("kein Abgleich - erst cli.py reconcile")
        a = lade(path)["overlap"]["acceptedMarketDataState"]
        self.assertFalse(a["reconciled"], "Die alte Messung darf nicht als aktuelle Neuabnahme erscheinen")
        self.assertEqual(a["status"], "CANONICAL_PER_INSTRUMENT")
        for key, value in HISTORISCH_ABGENOMMEN.items():
            self.assertEqual(a["accepted"][key], value)
        self.assertEqual(a["computed"], AKTUELLER_POLICY_STAND)
        self.assertEqual(a["delta"], {
            "HISTORICAL_CHART_AVAILABLE": -22,
            "TECHNICAL_HISTORY_ELIGIBLE": -8,
        })
        self.assertIn("KEIN neuer Nenner ohne geklaerte Ursache", a["explanation"])

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
