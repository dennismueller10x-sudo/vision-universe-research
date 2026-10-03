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
import gzip
import hashlib
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

# Der abgenommene historische Stand. Diese Zahlen pruefen weiterhin
# unveraenderte historische Dateien; frische Listing-Projektionen haben
# eigene, je Instrument nachpruefbare Preis- und Faktornachweise.
#
# Neu abgenommen am 15.09.2026 mit der Produkt-Datenhygiene des Eigentuemers
# (docs/VU_DISCOVER_V3_NETFLIX_BUILD.md §1): 44 Testsymbole und die
# belegten Nicht-Aktien (Warrants, Units, Rights) sind EXCLUDED, 123
# Vorzuege mit NASDAQ-Suffix P/O/N/M sind SEPARATE_CLASS. Produkttitel
# 7 004 -> 6 875; die Deckungen wurden mit denselben kanonischen
# Artefakten (coverage-metrics.json, technical-coverage) ueber das neue
# Produktuniversum neu gemessen (build-company-master + build-universe-
# indexes, market-capability.json). Der vorherige Stand (7 004 / 6 997 /
# 5 963) steht im Abnahmebericht.
AKZEPTIERT = {
    "PRODUCT_TITLES": 6875,
    "R2_SERIES_AVAILABLE": 7802,
    "HISTORICAL_CHART_AVAILABLE": 6871,
    "TECHNICAL_HISTORY_ELIGIBLE": 5884,
}


def lade(path):
    return json.loads(path.read_text(encoding="utf-8"))


def aktuelle_produkttitel():
    from quant.sec.universe_coverage import load_universe, product_members
    return product_members(load_universe(ROOT)["instruments"])


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

        self.assertTrue(set(kanon).issubset(meine), "Historische Produktmitglieder duerfen nicht verschwinden.")
        capability = lade(MARKTFAEHIGKEIT)
        current = capability["members"]
        self.assertEqual(len(current), len({row["m"] for row in current}), "Doppelte kanonische Mitglieds-ID")
        self.assertEqual({row["m"] for row in current}, set(meine), "Aktuelle Coverage braucht genau das aktuelle Produktuniversum.")
        additions = {row["m"] for row in current} - set(kanon)
        if additions:
            projections = lade(ROOT / "quant/data/universe/tiingo2-product-projections.json")
            verified = {row["securityId"] for row in projections["rows"] if not row["isBaseline"]}
            self.assertEqual(additions, verified, "Neue Mitgliedschaft benoetigt konkrete Listing-Projektionen.")
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
        members = self.mc["members"]
        self.assertEqual(t["MEMBERS"], len(aktuelle_produkttitel()))
        self.assertEqual(t["MEMBERS"], len(members))
        self.assertEqual(t["WITH_PRICE_HISTORY"], sum(row["ph"] is True for row in members))
        self.assertEqual(t["TECHNICAL_READY"], sum(row["t"] == "TECHNICAL_READY" for row in members))
        self.assertEqual(t["FACTOR_READY"], sum(row["fr"] is True for row in members))
        # Every historical member without a verified fresh overlay still
        # reproduces the original complete exception lists exactly.
        chart_missing = set(lade(METRIKEN)["CHART_AVAILABILITY"]["notRenderableSymbols"])
        technical_exceptions = lade(TECHNIK)["perSymbol"]
        for row in members:
            if row["src"].startswith("tiingo2:"):
                continue
            self.assertEqual(row["ph"], row["s"] not in chart_missing, row["s"])
            expected_ready = technical_exceptions.get(row["s"], {}).get("technical", "TECHNICAL_READY") == "TECHNICAL_READY"
            self.assertEqual(row["t"] == "TECHNICAL_READY", expected_ready, row["s"])

    def test_neue_preis_und_faktorfaehigkeit_hat_konkrete_getrennte_nachweise(self):
        scoped = [row for row in self.mc["members"] if row["src"].startswith("tiingo2:")]
        if not scoped:
            return
        projection = lade(ROOT / "quant/data/universe/tiingo2-product-projections.json")
        projected = {row["securityId"]: row for row in projection["rows"]}
        factors = {row["securityId"]: row for row in lade(ROOT / "quant/data/market/factors/factors-FULL_UNIVERSE.json")["securities"]}
        for row in scoped:
            proof = projected[row["m"]]
            self.assertEqual(row["s"], proof["ticker"])
            self.assertEqual(row["i"], proof["instrumentId"])
            self.assertEqual(row["ph"], proof["chart"]["ready"])
            self.assertEqual(row["ps"], proof["chart"]["priceReady"])
            relative = proof["chart"]["priceProjectionPath"]
            self.assertTrue(relative.startswith("/quant/data/market/discover-series/"))
            price_path = ROOT / relative.lstrip("/")
            self.assertEqual(hashlib.sha256(price_path.read_bytes()).hexdigest(), projection["artifactHashes"][relative])
            price = lade(price_path)
            self.assertEqual(price["securityId"], row["m"])
            self.assertEqual(price["sourceBarCount"], row["b"])
            self.assertEqual(price["corporateActionStatus"], "PASS")
            self.assertEqual(price["asOf"], row["l"])
            self.assertEqual(row["ph"], len(price["points"]) >= 5, "Kurze IPO-Preise sind noch keine Chartfreigabe.")
            shard = row["s"][:2].ljust(2, "_")
            technical = json.loads(gzip.decompress((ROOT / ("quant/data/product/technical-signals-v1/" + shard + ".json.gz")).read_bytes()))
            self.assertEqual(row["t"] == "TECHNICAL_READY", row["s"] in technical["instruments"], row["s"])
            factor_path = ROOT / ("quant/data/product/factor-evidence-v1/" + shard + ".json.gz")
            evidence = json.loads(gzip.decompress(factor_path.read_bytes()))["securities"].get(row["s"])
            available = [factor for factor in (evidence or {}).get("factors", {}).values() if factor["state"] == "AVAILABLE"]
            self.assertEqual(row["fr"], bool(available), "Keine erfundene oder unterdrueckte Faktorfreigabe: " + row["s"])
            if row["fr"]:
                market = factors[row["m"]]
                self.assertEqual(market["ticker"], row["s"])
                self.assertEqual(market["bars"], row["b"])
                if market["dataQuality"] == "WARNING":
                    self.assertEqual(market["dataQualityReason"], "insufficient_history_for_factors")
                    self.assertLess(market["bars"], 252)
                    self.assertIsNone(market["values"].get("return12M1M"))
                    self.assertIsNone(market["values"].get("volatility252d"))
                else:
                    self.assertEqual(market["dataQuality"], "PASS")
                # Fundamental partial factors may exist for a short IPO;
                # that never grants technical readiness or a full Quant score.
                self.assertEqual(evidence["securityId"], row["m"])
                self.assertEqual(evidence["bars"], row["b"])
                self.assertEqual(evidence["asOf"], row["l"])
                self.assertTrue(available, row["s"])
                for factor in available:
                    self.assertIsNotNone(factor["score"], row["s"])
                    self.assertGreaterEqual(factor["score"], 0)
                    self.assertLessEqual(factor["score"], 100)
                self.assertEqual(evidence["composite"]["state"], "WITHHELD")
                for factor in evidence["factors"].values():
                    if factor["state"] == "UNAVAILABLE":
                        self.assertIsNone(factor["score"])
                        self.assertTrue(factor.get("reason"))
            elif row["b"] < 300:
                self.assertNotEqual(row["t"], "TECHNICAL_READY", row["s"])

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
