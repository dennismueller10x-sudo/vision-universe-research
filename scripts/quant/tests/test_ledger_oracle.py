"""Unabhaengiges Ledger-Orakel gegen die Engines (Strang U, Teil 2). Forschung, nicht zertifiziert.

Drei Schichten:
1. Das Orakel (exakte Bruchrechnung, scripts/quant/oracle/ledger_oracle.py) gegen Handrechnungen, die hier ohne Orakelcode stehen.
2. Die Engines (research-portfolio.cjs, simulator.mjs, backtest.mjs) ueber 30 synthetische Faelle gegen das Orakel.
3. Die Abweichungsmatrix: jede beobachtete Abweichung ist im Fall deklariert (FEHLER / ERLAUBTE_VARIANTE / DATENMEHRDEUTIGKEIT),
   und jede deklarierte Abweichung tritt auf. Ein Fehler wird gemeldet und gepinnt, nicht repariert.

Die Runner schreiben nur in ein temporaeres Verzeichnis (--out); es werden keine Produktionsdaten gelesen oder geschrieben.
"""
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from fractions import Fraction as Fr
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from quant.oracle import ledger_cases as C  # noqa: E402
from quant.oracle import ledger_oracle as O  # noqa: E402

ORACLE_DIR = Path(__file__).resolve().parents[1] / "oracle"
NODE = shutil.which("node")
REL = 1e-9


def close(a, b, rel=REL):
    a, b = float(a), float(b)
    return abs(a - b) <= rel * max(1.0, abs(a), abs(b))


class _Runs:
    """Laeuft einmal je Testprozess: die Engines ueber alle Faelle."""
    weekly = None
    daily = None

    @classmethod
    def load(cls):
        if cls.weekly is not None:
            return
        tmp = Path(tempfile.mkdtemp(prefix="vu-oracle-"))
        try:
            cases = tmp / "cases.json"
            cases.write_text(json.dumps(C.CASES))
            for runner, name in (("run-js-ledger.cjs", "weekly"), ("run-js-daily.mjs", "daily")):
                out = tmp / (name + ".json")
                subprocess.run([NODE, str(ORACLE_DIR / runner), str(cases), "--out", str(out)], check=True, timeout=120)
                setattr(cls, name, json.loads(out.read_text()))
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


def by_id(rows, cid):
    return next(c for c in rows if c["id"] == cid)


class OracleHandRechnung(unittest.TestCase):
    """Schicht 1: das Orakel gegen Handrechnung (ohne Orakelcode)."""

    def test_w01_kauf_und_halten(self):
        r = O.settle_weekly(by_id(C.WEEKLY, "W01"))
        self.assertEqual([float(x) for x in r["equity"]], [1000, 1000, 1100, 1100])
        self.assertEqual(r["units"], {"A": Fr(10)})

    def test_w02_kosten_je_seite_zusaetzlich_zum_umsatz(self):
        # A + 0,0015*A = 1000  ->  A = 1000/1,0015; Stueck = A/100; Gebuehr 10 bps, Slippage 5 bps auf A.
        A = Fr(1000) / Fr("1.0015")
        r = O.settle_weekly(by_id(C.WEEKLY, "W02"))
        self.assertEqual(r["equity"][1], A)
        self.assertEqual(r["units"]["A"], A / 100)
        self.assertEqual(r["fees"], A * Fr("0.001"))
        self.assertEqual(r["slippage"], A * Fr("0.0005"))
        self.assertEqual(r["cash"][1], 0)
        self.assertEqual(r["equity"][3], A / 100 * 120)

    def test_w05_dividende_forderung_dann_cash(self):
        r = O.settle_weekly(by_id(C.WEEKLY, "W05"))
        self.assertEqual(r["receivables"][2], 5)       # 5 Stueck * 1 USD, Zahltag erst Index 4
        self.assertEqual(r["cash"][3], 500)
        self.assertEqual(r["cash"][4], 505)
        self.assertEqual(r["equity"][2], 1005)

    def test_w07_split_und_w10_delisting_und_w11_wiederanlage(self):
        self.assertEqual(O.settle_weekly(by_id(C.WEEKLY, "W07"))["equity"][5], 1100)   # 20 Stueck * 55
        self.assertEqual(O.settle_weekly(by_id(C.WEEKLY, "W10"))["equity"][3], 700)    # 10 * 70 Erloes
        w11 = O.settle_weekly(by_id(C.WEEKLY, "W11"))
        self.assertEqual(w11["equity"][3], 900)        # B 500 + 5 A * 80
        self.assertEqual(w11["units"], {"B": Fr(950) / 55})

    def test_kostenform_ist_geschlossen_geloest(self):
        # Nach jedem Handel gilt: Wert vor dem Handel - Wert danach = Kosten = r * Summe |Delta|.
        w3 = by_id(C.WEEKLY, "W03")
        r = O.settle_weekly(w3)
        paid = r["fees"] + r["slippage"]
        self.assertEqual(paid, Fr("0.002") * sum(t["notional"] for t in r["trades"]))
        self.assertEqual(r["equity"][1], 1000 - Fr("0.002") * r["trades"][0]["notional"] - Fr("0.002") * r["trades"][1]["notional"])

    def test_w14_forderung_blockiert_volle_investition(self):
        self.assertEqual(O.settle_weekly(by_id(C.WEEKLY, "W14"))["error"], "UNSETTLED_CASH_NOT_INVESTABLE")

    def test_daily_bar_regeln(self):
        s02 = O.settle_daily(by_id(C.DAILY, "S02"))
        self.assertEqual(s02["entry"]["price"], Fr(100) * Fr("1.001"))
        self.assertEqual(s02["exit"]["price"], Fr(95) * Fr("0.999"))
        self.assertEqual(O.settle_daily(by_id(C.DAILY, "S04"))["outcome"], "INVALIDATED_OPEN_AT_OR_BELOW_STOP")
        self.assertEqual(O.settle_daily(by_id(C.DAILY, "S12"))["outcome"], "NO_ENTRY")       # Hoch == Trigger loest nicht aus
        s10 = O.settle_daily(by_id(C.DAILY, "S10"))
        self.assertTrue(s10["ambiguous"])
        self.assertEqual(s10["variants"]["NEUTRAL"]["outcome"], "OPEN")
        self.assertEqual(s10["variants"]["PESSIMISTIC"]["price"], Fr(95) * Fr("0.999"))

    def test_fallzahl_und_klassen(self):
        self.assertTrue(20 <= len(C.CASES) <= 30, len(C.CASES))
        for c in C.CASES:
            for d in c["declared"]:
                self.assertIn(d["class"], (C.FEHLER, C.VARIANTE, C.MEHRDEUTIG))
                self.assertTrue(d["what"])


@unittest.skipUnless(NODE, "node fehlt")
class WeeklyLedgerGegenOrakel(unittest.TestCase):
    """Schicht 2a: research-portfolio.cjs (Wochenschluss-Ledger) gegen das Orakel. Erwartung: keine Abweichung."""

    @classmethod
    def setUpClass(cls):
        _Runs.load()

    def test_alle_wochenfaelle(self):
        for case in C.WEEKLY:
            with self.subTest(case=case["id"]):
                o, j = O.settle_weekly(case), _Runs.weekly[case["id"]]
                if "error" in o or "error" in j:
                    self.assertEqual(o.get("error"), j.get("error"))
                    continue
                for a, b in zip(o["equity"], j["equity"]):
                    self.assertTrue(close(a, b), (case["id"], "equity", a, b))
                for a, b in zip(o["cash"], j["cash"]):
                    self.assertTrue(close(a, b), (case["id"], "cash", a, b))
                for a, b in zip(o["receivables"], j["receivables"]):
                    self.assertTrue(close(a, b), (case["id"], "receivables", a, b))
                self.assertEqual(sorted(o["units"]), sorted(j["units"]))
                for k in o["units"]:
                    self.assertTrue(close(o["units"][k], j["units"][k]), (case["id"], k))
                self.assertTrue(close(o["fees"], j["fees"]))
                self.assertTrue(close(o["slippage"], j["slippage"]))
                self.assertTrue(close(o["turnover"], j["turnover"]))
                self.assertTrue(close(o["not_stated"], j["notStated"]))
                self.assertTrue(close(o["total_return"], j["totalReturn"]))
                self.assertTrue(close(o["total_return"], j["metricsTotalReturn"]))
                self.assertTrue(close(o["max_drawdown"], j["maxDrawdown"], 1e-9))
                self.assertTrue(close(o["max_drawdown"], j["metricsMaxDrawdown"], 1e-9))
                self.assertEqual([(t["index"], t["listing"], t["side"]) for t in o["trades"]], [(t["index"], t["listing"], t["side"]) for t in j["trades"]])
                for a, b in zip(o["trades"], j["trades"]):
                    self.assertTrue(close(a["notional"], b["notional"]) and close(a["units"], b["units"]), (case["id"], a, b))

    def test_w12_dividende_ohne_zahltag_bleibt_ausserhalb_von_equity_und_cash(self):
        j = _Runs.weekly["W12"]
        self.assertEqual(j["equity"][-1], 1000)
        self.assertTrue(close(j["notStated"], 5))


def deviations_daily(case, o, j):
    """Beobachtete Abweichungen eines Tagesbalken-Falls als Menge von Codes. Unerklaerte Abweichung -> Code 'MISMATCH:...'."""
    obs = set()
    d, p = j["default"], j["pessimistic"]
    if o["ambiguous"]:
        obs.add("AMBIGUOUS_ORDER")
        if d["sameDayOrder"] != "AMBIGUOUS":
            obs.add("MISMATCH:ambiguity_not_flagged")
        for name, jv in (("NEUTRAL", d), ("PESSIMISTIC", p)):
            v = o["variants"][name]
            if v["outcome"] == "OPEN":
                if jv["exit"] is not None:
                    obs.add("MISMATCH:variant_" + name)
            elif jv["exit"] is None or not close(jv["exit"]["price"], v["price"], 1e-12):
                obs.add("MISMATCH:variant_" + name)
        if o["entry"] is None or d["entry"] is None or not close(o["entry"]["price"], d["entry"]["price"], 1e-12):
            obs.add("MISMATCH:entry")
        if d["openAtEnd"]:   # Neutralvariante bleibt am Fensterende offen und wird nicht gebucht
            obs.add("OPEN_NOT_BOOKED")
        return obs
    if o["entry"] is None:
        if d["entry"] is not None:
            obs.add("MISMATCH:unexpected_entry")
        if o["outcome"].startswith("INVALIDATED") and j["invalidatedRule"] != "LC-OPEN-BELOW-STOP":
            obs.add("MISMATCH:invalidation_rule")
        return obs
    if d["entry"] is None or d["entry"]["index"] != o["entry"]["index"] or not close(d["entry"]["price"], o["entry"]["price"], 1e-12):
        obs.add("MISMATCH:entry")
    if o["exit"] is None:
        if d["exit"] is not None:
            obs.add("MISMATCH:unexpected_exit")
        if o["outcome"] == "OPEN" and d["openAtEnd"] and d.get("collected", 0) == 0:
            obs.add("OPEN_NOT_BOOKED")
        return obs
    if d["exit"] is None or d["exit"]["index"] != o["exit"]["index"]:
        obs.add("MISMATCH:exit_index")
    else:
        ref = o["exit"].get("price_strict", o["exit"]["price"])
        if not close(d["exit"]["price"], ref, 1e-12):
            obs.add("EXIT_PRICE")
    return obs


@unittest.skipUnless(NODE, "node fehlt")
class DailyExecutionGegenOrakel(unittest.TestCase):
    """Schicht 2b + 3: Supertrader-Simulator (Tagesbalken) gegen das Orakel, mit deklarierter Abweichungsmatrix."""

    @classmethod
    def setUpClass(cls):
        _Runs.load()

    def test_matrix_alle_tagesfaelle(self):
        for case in C.DAILY:
            if case["id"] in ("S14", "S16"):
                continue
            with self.subTest(case=case["id"]):
                observed = deviations_daily(case, O.settle_daily(case), _Runs.daily[case["id"]])
                declared = {d["code"] for d in case["declared"]}
                self.assertEqual(observed, declared, case["id"])

    def test_s11_variante_ist_konservativ_und_quantifiziert(self):
        case = by_id(C.DAILY, "S11")
        o, j = O.settle_daily(case), _Runs.daily["S11"]["default"]
        strict, engine = float(o["exit"]["price_strict"]), j["exit"]["price"]
        self.assertAlmostEqual(strict, 95 * 0.999, places=9)
        self.assertAlmostEqual(engine, 93 * 0.999, places=9)
        self.assertLess(engine, strict)                      # nie guenstiger als belegbar
        self.assertAlmostEqual((strict - engine) / strict, 2 / 95, places=9)   # 2 USD von 95: rund 2,1 %

    def _s14_oracle(self, j, fee_bps):
        """Sollbuchung des Portfolio-Cash eines Round Trips mit Gebuehr (Vorschrift im Orakel, ohne Engine-Code)."""
        entry, exit_, stop = Fr(str(j["entryPrice"])), Fr(str(j["exitPrice"])), Fr(str(j["initialStop"]))
        self.assertTrue(close(entry, Fr(100) * Fr("1.001"), 1e-12))
        self.assertTrue(close(exit_, Fr(120) * Fr("0.999"), 1e-12))
        f = Fr(fee_bps) / 10000
        eq = Fr(100000)
        shares = min(eq * Fr("0.005") / (entry - stop), eq * Fr("0.20") / entry, eq / (entry * (1 + f)))
        return eq + shares * (exit_ * (1 - f) - entry * (1 + f)), shares * (entry + exit_) * f

    def test_s14_legacy_portfolio_ohne_gebuehr_ist_gepinnte_abweichung(self):
        """Legacy-Standard (C2-Referenz, eingefroren): runPortfolio bucht keine Gebuehr; closeTrade zieht 2 bps additiv vom Einzelertrag ab."""
        j = _Runs.daily["S14"]["portfolio"]
        net, fees = self._s14_oracle(j, 1)
        gross, _ = self._s14_oracle(j, 0)
        self.assertTrue(close(gross, j["endEquity"], 1e-12))          # Engine (Standard) = brutto
        self.assertFalse(close(net, j["endEquity"], 1e-12))           # Orakel = netto
        self.assertTrue(0 < float(gross - net) < 3.0)                 # 2,16 USD auf 100 000 USD
        self.assertEqual(j["commissions"], 0)
        self.assertTrue(close(float(O.round_trip_net(100, 120, 1, 10, "ADDITIVE_FEE")), j["returnPct"], 1e-6))

    def test_s16_opt_in_gebuehr_gleich_orakel_und_gleich_produktivem_pfad(self):
        """Korrektur U2-F1 als Opt-in (cfg.commissionBps): Legacy-Portfolio = Orakel = validation/portfolio.mjs runPortfolioTR (Produktion)."""
        j = _Runs.daily["S16"]["portfolio"]
        net, fees = self._s14_oracle(j, 1)
        self.assertTrue(close(net, j["endEquity"], 1e-12), (float(net), j["endEquity"]))
        self.assertTrue(close(fees, j["commissions"], 1e-12))
        self.assertTrue(close(net, j["productionEndEquity"], 1e-12))
        self.assertTrue(close(j["endEquity"], j["productionEndEquity"], 1e-12))
        # Vorher/Nachher auf dem Beispieltrade: 2,16 USD Gebuehr, 0,0022 % des Kapitals
        before = _Runs.daily["S14"]["portfolio"]["endEquity"]
        self.assertTrue(close(before - j["endEquity"], j["commissions"], 1e-9))

    def test_split_skaliert_gespeicherte_levels_und_laesst_die_rendite_gleich(self):
        r = _Runs.daily["RESCALE"]
        for k, v in (("entry", 100.1), ("stop", 95), ("initialStop", 95), ("exit", 94.905), ("trigger", 100), ("invalidation", 90)):
            self.assertTrue(close(r[k], v * 0.5, 1e-12), k)
        self.assertTrue(close(r["exit"] / r["entry"], 94.905 / 100.1, 1e-12))


class KostenformenUndSpread(unittest.TestCase):
    """Schicht 3: erlaubte Varianten der Kostenbuchung, quantifiziert (kein Fehler, solange die Schranken halten)."""

    def test_kostenformen_gleiche_ordnung_je_round_trip(self):
        forms = ("SLIPPAGE_AS_COST", "MULTIPLICATIVE", "ADDITIVE_FEE", "NO_FEE_IN_PORTFOLIO_CASH")
        # +20 % Trade, 10 bps Slippage, 1 bp Gebuehr je Seite
        res = {f: O.round_trip_net(100, 120, 1, 10, f) for f in forms}
        # Slippage als Kosten (research-portfolio) und multiplikativ (rotation-52w, source-faithful) unterscheiden sich nur in 2. Ordnung
        self.assertLess(abs(float(res["SLIPPAGE_AS_COST"] - res["MULTIPLICATIVE"])), 1e-6)
        # additiv (Simulator) weicht um 2*f*X ab: hoechstens 2 bps * Ertrag
        self.assertLess(abs(float(res["ADDITIVE_FEE"] - res["MULTIPLICATIVE"])), 5e-5)
        # ohne Gebuehr im Portfolio-Cash: die volle 2-bp-Luecke (FEHLER-Klasse, siehe S14)
        self.assertAlmostEqual(float(res["MULTIPLICATIVE"] - res["NO_FEE_IN_PORTFOLIO_CASH"]), -2e-4 * 1.2, delta=2e-6)
        # Reihenfolge: ohne Gebuehr ist es am guenstigsten
        self.assertGreater(res["NO_FEE_IN_PORTFOLIO_CASH"], max(res["SLIPPAGE_AS_COST"], res["MULTIPLICATIVE"], res["ADDITIVE_FEE"]))

    def test_spread_abschlag_gegen_abbuchung_je_fill(self):
        """portfolio-backtest.cjs bucht den halben Spread als proportionalen Abschlag auf den Portfoliowert am Handelstag. Am Handelstag
        gleicher Wert wie eine Cash-Abbuchung; danach schrumpft der Abschlag auch die Positionen. Differenz: zweite Ordnung."""
        v = O.spread_variants(equity_before=1_000_000, positions_value=900_000, cash=100_000, traded_notional=500_000, half_spread_bps=10, later_return=Fr("0.10"))
        # Differenz = Spread * Positionsertrag / Portfoliowert: bei Gewinn ist der Abschlag (Engine) konservativer als die Abbuchung je Fill.
        self.assertEqual(v["difference"], Fr(500) * Fr(900_000) * Fr("0.10") / Fr(1_000_000))
        self.assertGreater(v["difference"], 0)
        self.assertLess(float(v["difference"]) / 1_000_000, 1e-4)    # unter 1 bp des Portfolios selbst bei 10 % Folgerendite
        same_day = O.spread_variants(1_000_000, 900_000, 100_000, 500_000, 10, 0)
        self.assertEqual(same_day["difference"], 0)


if __name__ == "__main__":
    unittest.main()
