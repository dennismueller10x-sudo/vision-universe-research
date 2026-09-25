"""Consumer fundamentals: compact bundle from a SYNTHETIC companyfacts payload.

Annual, quarterly and TTM stay apart; nothing is visible before its filing
date; a metric the issuer never reported is absent, not zero; horizons are
measured on the annual revenue series; the coverage grid counts honestly.
"""
import json
import unittest
from datetime import date

from quant.sec import consumer
from quant.sec.consumer import rowdict as R
from quant.sec.registry import MetricRegistry
from quant.tests.fixtures import build_year_ends, standard_company


class ConsumerBundleTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.registry = MetricRegistry.load()
        cls.fy_ends = build_year_ends(date(2013, 12, 31), 13)   # FY2014 .. FY2025
        cls.builder, cls.expected = standard_company(
            2000000077, cls.fy_ends, lambda year: 1000.0 * (year - 2010))
        cls.payload = cls.builder.company_facts("SYNTHETIC CONSUMER ISSUER")
        cls.bundle = consumer.build_consumer_bundle(
            2000000077, cls.payload, cls.registry, as_of="2026-09-14",
            tickers=["SYNT"], security_ids=["ref_SYNT"], name="Synthetic Consumer Issuer")

    def test_bundle_identity_and_schema(self):
        b = self.bundle
        self.assertEqual(b["schema"], consumer.SCHEMA)
        self.assertEqual(b["cik"], "2000000077")
        self.assertEqual(b["tickers"], ["SYNT"])
        self.assertEqual(b["asOf"], "2026-09-14")
        self.assertIn("filing-date granularity", b["availability"])

    def test_annual_series_is_fiscal_years_only(self):
        rows = [R(r) for r in self.bundle["annual"]["revenue"]]
        self.assertTrue(rows, "annual revenue missing")
        self.assertTrue(all(r["fp"] == "FY" for r in rows))
        years = [r["fy"] for r in rows]
        self.assertEqual(years, sorted(years))
        self.assertLessEqual(len(years), consumer.DEFAULT_ANNUAL_YEARS)
        latest = rows[-1]
        self.assertAlmostEqual(latest["v"], self.expected[latest["fy"]]["annual"], places=2)
        self.assertTrue(latest.get("filed"), "every annual value names its filing date")
        self.assertTrue(latest.get("accn"))

    def test_quarterly_series_is_standalone_quarters(self):
        rows = [R(r) for r in self.bundle["quarterly"]["revenue"]]
        self.assertTrue(rows)
        self.assertTrue(all(r["fp"] in ("Q1", "Q2", "Q3", "Q4") for r in rows))
        self.assertLessEqual(len(rows), consumer.DEFAULT_QUARTERS)
        # Q2 is reported only YTD by the fixture: the consumer sees the de-accumulated quarter.
        q2 = [r for r in rows if r["fp"] == "Q2"]
        self.assertTrue(q2)
        fy = q2[-1]["fy"]
        self.assertAlmostEqual(q2[-1]["v"], self.expected[fy]["quarters"][1], places=2)
        # A quarter is never the annual figure.
        for r in rows:
            self.assertNotAlmostEqual(r["v"], self.expected[r["fy"]]["annual"], places=2)

    def test_ttm_is_four_quarters_and_named(self):
        ttm = self.bundle["ttm"]
        self.assertIn("revenue", ttm)
        self.assertEqual(ttm["revenue"]["kind"], "TTM")
        self.assertTrue(ttm["revenue"]["through"].startswith("FY"))
        # The fixture's latest complete year: TTM through Q4 equals the annual figure.
        fy = int(ttm["revenue"]["through"][2:6])
        if ttm["revenue"]["through"].endswith("Q4"):
            self.assertAlmostEqual(ttm["revenue"]["v"], self.expected[fy]["annual"], places=2)
        self.assertIn("free_cash_flow", ttm)
        self.assertTrue(ttm["free_cash_flow"]["derived"])
        self.assertEqual(ttm["free_cash_flow"]["inputs"], ["operating_cash_flow", "capital_expenditures"])

    def test_point_in_time_hides_unfiled_periods(self):
        early = consumer.build_consumer_bundle(
            2000000077, self.payload, self.registry, as_of="2020-01-15", tickers=["SYNT"])
        latest = early["coverage"]["horizons"]["latest"]
        self.assertLessEqual(latest, 2019, "a 10-K filed in 2020 is not visible on 2020-01-15 if filed later")
        for rows in early["annual"].values():
            for r in rows:
                self.assertLessEqual(R(r)["filed"], "2020-01-15", "value visible before its filing date")

    def test_missing_metrics_are_absent_not_zero(self):
        b = self.bundle
        self.assertNotIn("dividends_paid", b["annual"], "the fixture never reports dividends")
        for rows in b["annual"].values():
            for r in rows:
                self.assertIsNotNone(R(r)["v"])
        self.assertEqual(b["columns"], consumer.ROW_COLUMNS)
        self.assertEqual(b["units"]["revenue"], "USD")

    def test_horizons_and_coverage_summary(self):
        h = self.bundle["coverage"]["horizons"]
        self.assertTrue(h["10y"]); self.assertTrue(h["5y"]); self.assertTrue(h["3y"])
        s = consumer.summarize_bundle(self.bundle)
        self.assertEqual(s["tickers"], ["SYNT"]); self.assertTrue(s["h10"]); self.assertTrue(s["ttm"])
        grid = consumer.aggregate_coverage(
            [dict(s, metricsAnnual=list(self.bundle["annual"]), metricsQuarterly=list(self.bundle["quarterly"]),
                  metricsTtm=list(self.bundle["ttm"]))], product_count=3, cik_mapped=2, without_cik=["X"],
            unmatched_in_zip=["0000000001"])
        self.assertEqual(grid["productUniverse"], 3); self.assertEqual(grid["secAvailable"], 1)
        self.assertEqual(grid["history10y"], 1); self.assertEqual(grid["notInCompanyFacts"], 1)
        self.assertEqual(grid["perMetric"]["revenue"]["annual"], 1)
        self.assertEqual(grid["perMetric"]["dividends_paid"]["annual"], 0)

    def test_tax_inputs_are_exported_so_a_return_on_capital_has_a_disclosed_rate(self):
        """Vorsteuerergebnis und Steueraufwand verlassen die SEC-Schicht.

        Ohne sie muesste jeder Verbraucher einen pauschalen Steuersatz
        annehmen - und eine angenommene Zahl sieht in einer Kennzahl genauso
        aus wie eine gemeldete."""
        for metric in ("pretax_income", "income_tax_expense"):
            with self.subTest(metric=metric):
                self.assertIn(metric, self.bundle["annual"], metric + " fehlt im Jahresteil")
                self.assertIn(metric, self.bundle["ttm"], metric + " fehlt im TTM-Teil")
                self.assertEqual(self.bundle["units"][metric], "USD")

    def test_without_depreciation_there_is_no_ebitda_and_no_stand_in(self):
        """Der Fixture-Emittent meldet keine Abschreibungen.

        EBITDA darf dann fehlen - aber es darf auf keinen Fall zum
        operativen Ergebnis unter anderem Namen werden."""
        self.assertNotIn("depreciation_and_amortization", self.bundle["annual"])
        self.assertNotIn("ebitda", self.bundle["annual"])
        self.assertNotIn("ebitda", self.bundle["ttm"])
        self.assertIn("operating_income", self.bundle["ttm"],
                      "die Gegenprobe braucht ein vorhandenes operatives Ergebnis")

    def test_with_depreciation_ebitda_is_exported_and_marked_as_derived(self):
        from quant.tests.fixtures import FLOW_CONCEPTS
        mit_da = FLOW_CONCEPTS + (("DepreciationDepletionAndAmortization", "USD", 0.07),)
        builder, _ = standard_company(
            2000000078, self.fy_ends, lambda year: 1000.0 * (year - 2010), flow_concepts=mit_da)
        bundle = consumer.build_consumer_bundle(
            2000000078, builder.company_facts("WITH DA"), self.registry,
            as_of="2026-09-14", tickers=["SYNTDA"])
        self.assertIn("ebitda", bundle["annual"])
        ttm = bundle["ttm"]
        self.assertIn("ebitda", ttm)
        self.assertTrue(ttm["ebitda"]["derived"])
        self.assertEqual(ttm["ebitda"]["inputs"],
                         ["operating_income", "depreciation_and_amortization"])
        # Dasselbe TTM-Fenster fuer beide Eingaben, und die Summe stimmt.
        self.assertEqual(ttm["ebitda"]["through"], ttm["operating_income"]["through"])
        self.assertEqual(ttm["ebitda"]["through"], ttm["depreciation_and_amortization"]["through"])
        self.assertAlmostEqual(
            ttm["ebitda"]["v"],
            ttm["operating_income"]["v"] + ttm["depreciation_and_amortization"]["v"], places=6)
        self.assertGreater(ttm["ebitda"]["v"], ttm["operating_income"]["v"],
                           "EBITDA ohne Aufschlag waere das operative Ergebnis")

    def test_bundle_is_compact(self):
        size = len(json.dumps(self.bundle, separators=(",", ":")))
        self.assertLess(size, 30000, f"bundle too large for 6,000 companies: {size} bytes")


class ProductUniverseTest(unittest.TestCase):
    def test_load_product_universe_ciks_groups_tickers_by_cik(self):
        import tempfile, os
        payload = {"rows": [
            {"ticker": "GOOGL", "securityId": "ref_GOOGL", "cik": "0001652044", "companyName": "Alphabet Inc - Class A", "inProductUniverse": True},
            {"ticker": "GOOG", "securityId": "ref_GOOG", "cik": "0001652044", "companyName": "Alphabet Inc - Class C", "inProductUniverse": True},
            {"ticker": "NOCIK", "securityId": "ref_NOCIK", "cik": None, "companyName": "No Cik Corp", "inProductUniverse": True},
            {"ticker": "OUT", "securityId": "ref_OUT", "cik": "0000000009", "companyName": "Excluded Warrants", "inProductUniverse": False},
        ]}
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as handle:
            json.dump(payload, handle); path = handle.name
        try:
            by_cik, without = consumer.load_product_universe_ciks(path)
        finally:
            os.unlink(path)
        self.assertEqual(sorted(by_cik["0001652044"]["tickers"]), ["GOOG", "GOOGL"])
        self.assertEqual(without, ["NOCIK"])
        self.assertNotIn("0000000009", by_cik)


if __name__ == "__main__":
    unittest.main()
