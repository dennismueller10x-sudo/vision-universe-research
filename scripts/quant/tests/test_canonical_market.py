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
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

ROOT = Path(__file__).resolve().parents[3]
ABNAHME = json.loads((ROOT / "quant" / "config" / "product-universe-acceptance.json").read_text(encoding="utf-8"))
# Datenstand-Abnahme (13.11.2026, Strang AK): Pruefungen, die die Zahlen des LIVE-Produktuniversums festschreiben, werden bei
# jedem Eignungslauf rot und blockierten bisher jeden Code-PR (11.11.: 3 PRs und main). Sie laufen jetzt taeglich im
# Quant-Produktionscheck (quant-produktionscheck.yml, VU_DATENSTAND_ABNAHME=1); Abweichung = Alarm-Issue.
nur_datenstand = unittest.skipUnless(
    os.environ.get("VU_DATENSTAND_ABNAHME") == "1",
    "Datenstand-Abnahme: laeuft taeglich im Quant-Produktionscheck (VU_DATENSTAND_ABNAHME=1), blockiert keinen Code-PR")
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
ABGENOMMEN_0410 = {
    "PRODUCT_TITLES": 6853,
    "R2_SERIES_AVAILABLE": 7802,
    "HISTORICAL_CHART_AVAILABLE": 6850,
    "TECHNICAL_HISTORY_ELIGIBLE": 5780,
}
# Neuabnahme 10.10.2026 (coverage-metrics.yml gegen das Produktuniversum nach dem
# Gattungsbeleg aus dem Boersenverzeichnis, Lauf 38040675307). Gegen den Stand vom
# 04.10.2026 ist jede Abweichung je Titel erklaert (coverage-delta.mjs, "GEHT AUF"):
#   Titel   6853 -167 (127 Schuldverschreibungen, 32 ETN, 8 Rights/Warrants)       = 6686
#   Charts  6850 -167 (alle 167 waren darstellbar, keiner stand in den Ausnahmen)  = 6683
#   Technik 5780 -137 (technisch bereit, jetzt nicht mehr im Produktuniversum)
#                +  1 (TBHC: 299 Bars am Bezug, 301 heute - normales Altern ueber
#                      die 300-Bar-Schwelle, unabhaengig von der Korrektur)        = 5644
# Die uebrigen 30 der 167 waren am Bezug schon technisch zu kurz (kein Abgang aus
# der Zahl). Die 85 neu zugelassenen Titel standen als REVIEW schon im
# Produktuniversum: Nenner und Zaehler aendern sich durch sie nicht.
ABGENOMMEN_1010 = {
    "PRODUCT_TITLES": 6686,
    "R2_SERIES_AVAILABLE": 7802,
    "HISTORICAL_CHART_AVAILABLE": 6683,
    "TECHNICAL_HISTORY_ELIGIBLE": 5644,
}
# Neuabnahme 06.11.2026 (coverage-metrics.yml gegen das Produktuniversum nach der
# Eignungs-Bereinigung, #1508/#1414). Gegen den Stand vom 10.10.2026 ist jede
# Abweichung je Titel erklaert (coverage-delta.mjs, "GEHT AUF", Lauf 42201411281;
# Entscheidung Steuerung 06.11. nach dokumentierter Empfehlung: Grenzfaelle ueber
# den letzten Datentag der Messung, hier 06.10.2026):
#   Titel   6686 -396 belegte ETFs (CONFIRMED_NON_EQUITY:ETF) +18 neu zugelassen = 6308
#   Charts  6683 -396 (alle darstellbar)                         +18 darstellbar = 6305
#   Technik 5644  -42 (technisch bereite ETFs) +53 gealtert ueber 300 Bars       = 5655
#           (die 18 neuen waren am Stichtag nicht technisch bereit)
ETF_RAUS_0611, NEU_0611, ETF_TECHNISCH_BEREIT_0611, GEALTERT_0611 = 396, 18, 42, 53
# Stand 11.11.2026 (Neuabnahme nach der Eignung vom 11.11., Herleitung unten bei AKTUELLER_POLICY_STAND).
ABGENOMMEN = ABNAHME["abgenommen"]  # Werte: quant/config/product-universe-acceptance.json
# Stand der Mitgliedschaft nach dem Gattungsbeleg aus dem Boersenverzeichnis
# (scripts/market/apply-exchange-directory.mjs, 09.10.2026): 167 Titel belegt
# keine Stammaktie (127 Schuldverschreibungen, 32 ETN, 8 bestaetigte
# Rights/Warrants) - nur Mitgliedschaft, keine neue Messung, wie #366:
#   Titel   6853 - 167 = 6686
#   Charts  6850 - 167 = 6683   (keiner der 167 steht in den Chart-Ausnahmen)
#   Technik 5780 - 137 + 1 = 5644   (137 der 167 waren technisch bereit, laut
#                                tooShortSymbols der abgenommenen Messung; +1 TBHC
#                                altert mit 301 Bars ueber die Schwelle - Messung
#                                10.10.2026, kein Teil der Korrektur)
POLICY_STAND_1010 = {
    "PRODUCT_TITLES": 6686,
    "HISTORICAL_CHART_AVAILABLE": 6683,
    "TECHNICAL_HISTORY_ELIGIBLE": 5644,
}
AKTUELLER_POLICY_STAND = ABNAHME["aktuellerPolicyStand"]
VERZEICHNIS_AUSGESCHLOSSEN = 167
# Verzeichnisbelege im Abgleich heute (06.11.2026, jede Eignung rechnet den Abgleich
# vollstaendig neu): 167 vom 10.10. - 2 wieder Stammaktie (GREEL, SWKHL) + 269 ETFs
# der Bereinigung (eligibility-cleanup-2026-11-06) + 1 Optionsschein (BNCWW) = 435.
VERZEICHNIS_WIEDER_STAMMAKTIE = {"GREEL", "SWKHL"}
VERZEICHNIS_ETF_0611, VERZEICHNIS_WARRANT_0611 = 269, {"BNCWW"}
# 11.11.2026 (Eignung nach dem Stamm-Lauf, eligibility-catchup-2026-11-11, Lauf 42981455555): WTIB, einer der 269 ETFs der
# Bereinigung, ist wieder Stammaktie (EXCLUDED -> ELIGIBLE, US_COMMON_EQUITY_ON_PRIMARY_VENUE) und der Verzeichnisbeleg entfaellt:
# 435 - 1 = 434 Verzeichnisbelege, Produkt 6308 + 1 = 6309, darstellbar 6305 + 1 = 6306. Technisch bereit 5655 + 6 = 5661: WTIB ist
# neu im Produkt, aber noch zu kurz (SHORT, kein Zugewinn); sechs Titel (ABTC, ELVR, NMP, PLT, PMI, TONX) sind ueber 300 Bars
# gealtert (AGED_PAST_THRESHOLD, Deckungsabweichung je Titel, deckung-Lauf 42987197248).
# Die 200 Wechsel ELIGIBLE -> REVIEW desselben Laufs aendern den Umfang nicht (REVIEW gehoert zum Produkt).
VERZEICHNIS_WIEDER_STAMMAKTIE_1111 = {"WTIB"}
VERZEICHNIS_AUSGESCHLOSSEN_0611 = ABNAHME["verzeichnisAusgeschlossen"]
WTIB_1111, GEALTERT_1111 = 1, 6
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

    @nur_datenstand
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

    @nur_datenstand
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

    @nur_datenstand
    def test_der_verzeichnisbeleg_erklaert_den_rest_je_titel(self):
        """apply-exchange-directory.mjs: jeder seit der Abnahme ausgeschlossene Titel steht mit
        Wertpapierbezeichnung und Regel im Abgleich. Die Kennzahlen des Stands vom 04.10.
        folgen daraus mit den Zaehlungen des Deltaberichts (coverage-delta.mjs, Lauf
        38040675307): 137 der 167 waren technisch bereit, alle 167 darstellbar, TBHC altert
        ueber die 300-Bar-Schwelle. Die neue Messung fuehrt keinen der 167 mehr."""
        abgleich = lade(ROOT / "quant/data/market/security-master/eligibility-reconciliation.json")
        raus = {c["ticker"] for c in abgleich["changes"]
                if c.get("source") == "NASDAQ_TRADER_SYMBOL_DIRECTORY" and c["to"]["productEligibility"] == "EXCLUDED"
                and c["from"]["productEligibility"] != "EXCLUDED"}
        self.assertEqual(len(raus), VERZEICHNIS_AUSGESCHLOSSEN_0611)
        self.assertEqual(VERZEICHNIS_AUSGESCHLOSSEN - len(VERZEICHNIS_WIEDER_STAMMAKTIE) + VERZEICHNIS_ETF_0611
                         + len(VERZEICHNIS_WARRANT_0611) - len(VERZEICHNIS_WIEDER_STAMMAKTIE_1111),
                         VERZEICHNIS_AUSGESCHLOSSEN_0611)
        self.assertFalse((VERZEICHNIS_WIEDER_STAMMAKTIE | VERZEICHNIS_WIEDER_STAMMAKTIE_1111) & raus)
        self.assertTrue(VERZEICHNIS_WARRANT_0611 <= raus)
        bereinigung = lade(ROOT / "docs/data/security-master/eligibility-cleanup-2026-11-06.json")
        etf = {x["ticker"] for x in bereinigung["leave"]}
        self.assertEqual(len(etf), VERZEICHNIS_ETF_0611)
        self.assertTrue(etf - VERZEICHNIS_WIEDER_STAMMAKTIE_1111 <= raus, "ETF der Bereinigung ohne Verzeichnisbeleg im Abgleich")
        for c in abgleich["changes"]:
            if c.get("source") == "NASDAQ_TRADER_SYMBOL_DIRECTORY":
                self.assertTrue(c.get("securityName") and c.get("rule"), c["ticker"] + " ohne Beleg")
        m = lade(METRIKEN)
        # Die Titel sind aus Nenner UND Ausnahmelisten verschwunden - nicht nur aus der Summe.
        self.assertFalse(raus & set(m["CHART_AVAILABILITY"]["notRenderableSymbols"]))
        self.assertFalse(raus & set(m["TECHNICAL_HISTORY_ELIGIBILITY"]["tooShortSymbols"]))
        self.assertNotIn("TBHC", m["TECHNICAL_HISTORY_ELIGIBILITY"]["tooShortSymbols"])
        technisch_bereit_raus, gealtert = 137, 1
        self.assertEqual(VERZEICHNIS_AUSGESCHLOSSEN - technisch_bereit_raus, 30)  # schon am Bezug zu kurz
        # Uebergang 04.10. -> 10.10. (167 Verzeichnisbelege), unveraendert als Rechnung festgehalten
        self.assertEqual(ABGENOMMEN_0410["PRODUCT_TITLES"] - VERZEICHNIS_AUSGESCHLOSSEN, POLICY_STAND_1010["PRODUCT_TITLES"])
        self.assertEqual(ABGENOMMEN_0410["HISTORICAL_CHART_AVAILABLE"] - VERZEICHNIS_AUSGESCHLOSSEN, POLICY_STAND_1010["HISTORICAL_CHART_AVAILABLE"])
        self.assertEqual(ABGENOMMEN_0410["TECHNICAL_HISTORY_ELIGIBLE"] - technisch_bereit_raus + gealtert,
                         POLICY_STAND_1010["TECHNICAL_HISTORY_ELIGIBLE"])
        self.assertEqual(POLICY_STAND_1010, {k: ABGENOMMEN_1010[k] for k in POLICY_STAND_1010})
        # Uebergang 10.10. -> 06.11. (Eignungs-Bereinigung, Deltabericht Lauf 42201411281)
        self.assertEqual(POLICY_STAND_1010["PRODUCT_TITLES"] - ETF_RAUS_0611 + NEU_0611 + WTIB_1111, AKTUELLER_POLICY_STAND["PRODUCT_TITLES"])
        self.assertEqual(POLICY_STAND_1010["HISTORICAL_CHART_AVAILABLE"] - ETF_RAUS_0611 + NEU_0611 + WTIB_1111,
                         AKTUELLER_POLICY_STAND["HISTORICAL_CHART_AVAILABLE"])
        self.assertEqual(POLICY_STAND_1010["TECHNICAL_HISTORY_ELIGIBLE"] - ETF_TECHNISCH_BEREIT_0611 + GEALTERT_0611 + GEALTERT_1111,
                         AKTUELLER_POLICY_STAND["TECHNICAL_HISTORY_ELIGIBLE"])
        eignung = lade(ROOT / "quant/data/market/security-master/eligibility.json")
        etf_raus = [d for d in eignung["decisions"] if d["product_eligibility"] == "EXCLUDED"
                    and d.get("product_eligibility_reason") == "CONFIRMED_NON_EQUITY:ETF"]
        self.assertGreaterEqual(len(etf_raus), ETF_RAUS_0611)
        self.assertEqual(AKTUELLER_POLICY_STAND, {k: ABGENOMMEN[k] for k in AKTUELLER_POLICY_STAND})

    def test_der_bericht_erklaert_selbst_dass_er_nur_befunde_fuehrt(self):
        t = lade(TECHNIK)
        self.assertIn("alles ausser TECHNICAL_READY",
                      t["perSymbolDetail"]["reason"])


class IdentitaetsjoinTests(unittest.TestCase):
    """§3: der Join muss auditierbar sein."""

    @nur_datenstand
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

    @nur_datenstand
    def test_kurshistorie_und_technik_reproduzieren_den_stand(self):
        t = self.mc["totals"]
        self.assertEqual(t["MEMBERS"], AKTUELLER_POLICY_STAND["PRODUCT_TITLES"])
        self.assertEqual(t["WITH_PRICE_HISTORY"], AKTUELLER_POLICY_STAND["HISTORICAL_CHART_AVAILABLE"])
        self.assertEqual(t["TECHNICAL_READY"], AKTUELLER_POLICY_STAND["TECHNICAL_HISTORY_ELIGIBLE"])

    @nur_datenstand
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

    @nur_datenstand
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
