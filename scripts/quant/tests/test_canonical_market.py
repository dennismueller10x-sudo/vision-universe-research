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

# Der abgenommene Stand. Diese Zahlen sind NICHT verhandelbar und
# duerfen nicht durch eine lokale Ableitung ersetzt werden.
AKZEPTIERT = {
    "PRODUCT_TITLES": 7004,
    "R2_SERIES_AVAILABLE": 7802,
    "HISTORICAL_CHART_AVAILABLE": 6997,
    "TECHNICAL_HISTORY_ELIGIBLE": 5963,
}


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

    def test_die_quelle_traegt_den_abgenommenen_stand(self):
        m = lade(METRIKEN)
        self.assertEqual(m["STORAGE_COVERAGE"]["stored"],
                         AKZEPTIERT["R2_SERIES_AVAILABLE"])
        self.assertEqual(m["CHART_AVAILABILITY"]["renderable"],
                         AKZEPTIERT["HISTORICAL_CHART_AVAILABLE"])
        self.assertEqual(m["TECHNICAL_HISTORY_ELIGIBILITY"]["eligible"],
                         AKZEPTIERT["TECHNICAL_HISTORY_ELIGIBLE"])
        self.assertEqual(m["CHART_AVAILABILITY"]["denominator"],
                         AKZEPTIERT["PRODUCT_TITLES"])


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

    def test_der_bericht_erklaert_selbst_dass_er_nur_befunde_fuehrt(self):
        t = lade(TECHNIK)
        self.assertIn("alles ausser TECHNICAL_READY",
                      t["perSymbolDetail"]["reason"])


class IdentitaetsjoinTests(unittest.TestCase):
    """§3: der Join muss auditierbar sein."""

    def test_securityid_und_mastermemberid_sind_dieselbe_menge(self):
        kanon = {s["securityId"]: s["ticker"] for s in lade(KANON_UNIVERSUM)["securities"]}
        self.assertEqual(len(kanon), AKZEPTIERT["PRODUCT_TITLES"])

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
        self.assertEqual(t["MEMBERS"], AKZEPTIERT["PRODUCT_TITLES"])
        self.assertEqual(t["WITH_PRICE_HISTORY"], AKZEPTIERT["HISTORICAL_CHART_AVAILABLE"])
        self.assertEqual(t["TECHNICAL_READY"], AKZEPTIERT["TECHNICAL_HISTORY_ELIGIBLE"])

    def test_der_abgleich_meldet_sich_als_abgestimmt(self):
        path = ROOT / "quant" / "data" / "fundamentals" / "reconciliation.json"
        if not path.exists():
            self.skipTest("kein Abgleich - erst cli.py reconcile")
        a = lade(path)["overlap"]["acceptedMarketDataState"]
        self.assertTrue(a["reconciled"], a.get("explanation"))
        self.assertEqual(a["delta"]["HISTORICAL_CHART_AVAILABLE"], 0)
        self.assertEqual(a["delta"]["TECHNICAL_HISTORY_ELIGIBLE"], 0)

    def test_die_ablagedeckung_wird_nicht_in_die_schnittmengen_gerechnet(self):
        """7.802 zaehlt gegen den Wertpapierstamm, nicht gegen das Produktuniversum."""
        path = ROOT / "quant" / "data" / "fundamentals" / "reconciliation.json"
        if not path.exists():
            self.skipTest("kein Abgleich")
        o = lade(path)["overlap"]
        for schluessel, wert in o.items():
            if isinstance(wert, int):
                self.assertLessEqual(wert, AKZEPTIERT["PRODUCT_TITLES"],
                                     f"{schluessel} ist groesser als das Produktuniversum")


if __name__ == "__main__":
    unittest.main()
