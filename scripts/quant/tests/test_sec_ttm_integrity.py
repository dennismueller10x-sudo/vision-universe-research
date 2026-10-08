"""TTM-Integritaet (Kern 1.16.0): ein TTM ist die Summe von vier BERICHTETEN, aufeinanderfolgenden Quartalen
derselben Konzeptklasse auf derselben Aktienbasis - sonst NOT_AVAILABLE mit Grund, nie geraten.

Echte SEC-companyfacts-Auszuege (scripts/quant/tests/fixtures/sec-real/*.json), Befunde aus
scripts/fundamentals-audit/artifacts/FUNDAMENTAL-TTM-INVESTIGATION.json.
"""
import sys
import unittest
from pathlib import Path

# Laeuft als Paket (cli.py test: quant.tests) und direkt (unittest discover -s scripts/quant/tests).
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from test_sec_ground_truth_regressions import build  # noqa: E402

from quant.sec.model import (TTM_CONCEPT_MISMATCH, TTM_EPS_INCONSISTENT,  # noqa: E402
                             TTM_PERIODS_NOT_CONTIGUOUS, TTM_SHARE_BASIS_INCONSISTENT, TTM_UNIT_MISMATCH)

AS_OF = "2026-10-05"


class TtmPeriods(unittest.TestCase):
    def test_fiscal_year_change_does_not_double_count_a_quarter(self):
        """FUBO (Geschaeftsjahreswechsel 2025/26): das Raster belegte Q2 und Q3 mit demselben Ende 2026-06-30;
        TTM-Umsatz zaehlte 1.481,7 Mio. doppelt (6,09 Mrd.). Zwei Quartale mit demselben Ende sind kein TTM."""
        _, resolver = build("FUBO")
        fact = resolver.ttm("revenue", AS_OF)
        # 1.20.0: jedes Quartal hat genau einen Kalenderslot (_on_calendar); das doppelte Quartal ist weg.
        # Das Fenster ist jetzt Jul 2025 - Jun 2026 aus vier verschiedenen gemeldeten Quartalen.
        self.assertGreater(abs(fact.value - 6.09e9), 1e8, f"TTM {fact.value} aus doppeltem Quartal")
        if fact.available:
            y, q = resolver.latest_reported_quarter("revenue", AS_OF)
            ends = [str(resolver.quarter_grid("revenue", yy, AS_OF).get(qq).period_end)[:10]
                    for yy, qq in (resolver.step_back(y, q, k) for k in range(4))]
            self.assertEqual(len(set(ends)), 4, ends)
            self.assertAlmostEqual(fact.value, 1481714000 + 1573867000 + 1548688000 + 377195000, delta=1)

    def test_52_53_week_quarters_are_contiguous(self):
        """PepsiCo: 12/12/12/16-Wochen-Quartale (Enden 2025-09-06, 2025-12-27, 2026-03-21, 2026-06-13).
        Abstaende 112/84/84 Tage sind ein lueckenloses Jahr, keine Luecke."""
        _, resolver = build("PEP")
        fact = resolver.ttm("revenue", AS_OF)
        self.assertTrue(fact.available, fact.reason)
        self.assertAlmostEqual(fact.value, 24181e6 + 19443e6 + 29343e6 + 23937e6, delta=1.0)


class TtmConceptClass(unittest.TestCase):
    def test_continuing_operations_eps_is_not_summed_with_total_eps(self):
        """Capital Southwest FY2027 Q1: 10-Q meldet EarningsPerShareDiluted 0,39; die drei Vorquartale stehen nur als
        IncomeLossFromContinuingOperationsPerDilutedShare (0,44/0,54/0,44) im 10-K. Gesamt- und fortgefuehrtes EPS
        sind verschiedene Groessen; ohne Beleg desselben Werts kein TTM."""
        _, resolver = build("CSWC")
        for metric in ("eps_diluted", "eps_basic"):
            fact = resolver.ttm(metric, AS_OF)
            self.assertFalse(fact.available, f"{metric}: TTM {fact.value} aus gemischten Konzeptklassen")
            self.assertEqual(fact.reason, TTM_CONCEPT_MISMATCH)

    def test_tag_switch_without_evidence_of_difference_stays_a_ttm(self):
        """Murphy Oil: 10-Q 2026 Revenues (928,3 / 733,6 Mio.), 10-K-Quartale nur Vertragsumsatz (613,1 / 721,0 Mio.).
        Dieselben 10-Q melden den Vertragsumsatz 926,3 / 732,4 Mio. - Abweichung < 0,5 %: dieselbe Groesse."""
        _, resolver = build("MUR")
        fact = resolver.ttm("revenue", AS_OF)
        self.assertTrue(fact.available, fact.reason)
        self.assertAlmostEqual(fact.value, 928307e3 + 733552e3 + 613100e3 + 721000e3, delta=1.0)


class TtmShareBasis(unittest.TestCase):
    def test_split_inside_the_window_blocks_eps_ttm(self):
        """Piper Sandler, Split 4:1 Anfang 2026: Q3/Q4 2025 stehen nur unbereinigt im 10-K (3,38 / 6,40 bei 17,8 Mio.
        verwaesserten Aktien), Q1/Q2 2026 bereinigt (0,92 / 0,95 bei 71,2 Mio.). Die Summe 11,65 ist kein EPS."""
        _, resolver = build("PIPR")
        for metric in ("eps_diluted", "eps_basic"):
            fact = resolver.ttm(metric, AS_OF)
            self.assertFalse(fact.available, f"{metric}: TTM {fact.value} ueber einen Split")
            self.assertEqual(fact.reason, TTM_SHARE_BASIS_INCONSISTENT)
        ending = resolver.ttm_ending("eps_diluted", 2026, 2, AS_OF)
        self.assertFalse(ending.available)
        # Umsatz und Ergebnis sind vom Split nicht betroffen
        self.assertTrue(resolver.ttm("revenue", AS_OF).available)

    def test_reverse_split_already_adjusted_stays_a_ttm(self):
        """ClearSign, Reverse-Split 1:10: alle vier Quartals-EPS sind bereinigt (Ergebnis/EPS je rund 5,2-5,9 Mio.
        Aktien); nur der Aktienbestand vor dem Split ist 53 Mio. Kein Grund zur Ablehnung."""
        _, resolver = build("CLIR")
        fact = resolver.ttm("eps_diluted", AS_OF)
        self.assertTrue(fact.available, fact.reason)
        self.assertAlmostEqual(fact.value, -0.22 - 0.39 - 0.06 - 0.26, places=6)


class WeightedSharesAreNotAdditive(unittest.TestCase):
    def test_q4_weighted_shares_are_not_fy_minus_nine_months(self):
        """E12 Capital Southwest FY2026 Q4 (Ende 2026-03-31): FY-Durchschnitt minus 9M-Durchschnitt ergab 1,0 Mio.
        verwaesserte Aktien (berichtet sind rund 67-70 Mio.). Ein Durchschnitt ist nicht additiv."""
        calendar, resolver = build("CSWC")
        fiscal_year = calendar.fiscal_year_for("2026-03-31")
        index = calendar.quarter_index("2026-03-31")
        for metric in ("diluted_weighted_average_shares", "basic_weighted_average_shares"):
            seen = resolver.quarter_grid(metric, fiscal_year, AS_OF).get(index)
            self.assertTrue(seen is None or seen.value > 50e6, f"{metric}: Q4 {seen and seen.value}")


if __name__ == "__main__":
    unittest.main()


def bundle(name):
    import json
    from quant.sec.consumer import build_consumer_bundle
    from quant.sec.registry import MetricRegistry
    from test_sec_ground_truth_regressions import FIXTURES  # noqa: E402
    payload = json.loads((FIXTURES / f"{name}.json").read_text())
    return build_consumer_bundle(payload["cik"], payload, MetricRegistry.load(), as_of=AS_OF)


class PointInTimeTtm(unittest.TestCase):
    def test_pit_ttm_before_the_split_is_a_valid_ttm(self):
        """PIT_TTM(as_of): Piper Sandler am 2025-12-01 kennt nur vorsplit-Quartale (Q4 2024 bis Q3 2025, alle auf
        rund 17,8 Mio. Aktien). Derselbe Emittent hat dann ein TTM - die Pruefung ist zeitpunktbezogen."""
        _, resolver = build("PIPR")
        fact = resolver.ttm("eps_diluted", "2025-12-01")
        self.assertTrue(fact.available, fact.reason)
        self.assertLessEqual(str(fact.provenance.filed)[:10], "2025-12-01")

    def test_pit_ttm_never_sees_a_later_filing(self):
        """Am Tag vor der 10-Q-Einreichung fuer Q2 2026 endet das TTM spaetestens mit Q1 2026."""
        _, resolver = build("CLIR")
        fact = resolver.ttm("eps_diluted", "2026-08-01")
        if fact.available:
            self.assertLess(str(fact.period_end)[:10], "2026-06-30")


class ConsumerEpsContract(unittest.TestCase):
    def test_eps_ttm_is_never_replaced_by_fiscal_year(self):
        doc = bundle("PIPR")
        self.assertNotIn("eps_diluted", doc["ttm"])
        self.assertEqual(doc["ttmAbsent"]["eps_diluted"], TTM_SHARE_BASIS_INCONSISTENT)
        eps = doc["eps"]
        self.assertEqual(eps["ttmDiluted"], {"status": "NOT_AVAILABLE", "reason": TTM_SHARE_BASIS_INCONSISTENT})
        self.assertEqual(eps["fyDiluted"]["fp"], "FY")
        self.assertNotIn("v", eps["ttmDiluted"])

    def test_verified_ttm_basic_and_diluted_stay_separate(self):
        doc = bundle("MUR")
        eps = doc["eps"]
        self.assertEqual(eps["ttmDiluted"]["status"], "VERIFIED")
        self.assertEqual(eps["ttmBasic"]["status"], "VERIFIED")
        self.assertAlmostEqual(eps["ttmDiluted"]["v"], 1.59 + 0.37 + 0.08 - 0.02, places=6)
        self.assertAlmostEqual(eps["ttmBasic"]["v"], 1.62 + 0.37 + 0.08 - 0.02, places=6)
        self.assertEqual(doc["views"]["bundle"], "LATEST_RESTATED")
        self.assertEqual(doc["views"]["ttm"], "CURRENT_TTM")

    def test_quarterly_series_has_one_cell_per_quarter_end(self):
        doc = bundle("FUBO")
        for metric, rows in doc["quarterly"].items():
            ends = [row[2] for row in rows]
            self.assertEqual(len(ends), len(set(ends)), f"{metric}: doppelte Quartalsenden {ends}")


class ContinuingOnlyWindow(unittest.TestCase):
    def test_a_window_of_continuing_operations_eps_is_not_an_eps_ttm(self):
        """F-TTM-1 (TTM-Holdout, nach der Auswertung behoben): VF Corp 10-K vom 2011-03-02 meldet die Quartale 2009 nur
        als IncomeLossFromContinuingOperationsPerDilutedShare (0,91/0,68/1,94/0,60). Die Latest-Sicht stellte alle vier
        Quartale auf das fortgefuehrte EPS um; das TTM 4,13 stand ohne Kennzeichen als verwaessertes Gesamt-EPS da."""
        calendar, resolver = build("VFC")
        fiscal_year, index = calendar.fiscal_year_for("2010-01-02"), calendar.quarter_index("2010-01-02")
        fact = resolver.ttm_ending("eps_diluted", fiscal_year, index, "2011-03-02")
        self.assertFalse(fact.available, f"TTM {fact.value} aus fortgefuehrtem EPS")
        self.assertEqual(fact.reason, TTM_CONCEPT_MISMATCH)


class RedTeamTtm(unittest.TestCase):
    """Red Team der TTM-Logik (1.16-1.18): echte Faelle, die als VERIFIED-TTM falsch waren."""

    def test_small_split_ratios_block_eps_ttm(self):
        """HIGH-1: Neogen 4:3-Split 2017-12-29 - TTM 1,28 mischt 0,31/0,32 (vor Split) mit 0,32/0,33; konsistent 1,12.
        Wilson Bank 4:3 - 2,94 statt 2,35. Verwaesserte Aktien springen um das Splitverhaeltnis (1,26-1,35)."""
        for name, as_of in (("NEOG", "2018-03-29"), ("WBHC", "2016-05-10")):
            _, resolver = build(name)
            fact = resolver.ttm("eps_diluted", as_of)
            self.assertFalse(fact.available, f"{name}: TTM {fact.value} ueber einen Split")
            self.assertEqual(fact.reason, TTM_SHARE_BASIS_INCONSISTENT)

    def test_fiscal_year_change_does_not_publish_a_stale_ttm(self):
        """HIGH-2: VF Corp (Geschaeftsjahr Dezember -> Maerz): das 10-K 0000103379-19-000006 meldet Okt-Dez 2018
        (1,16) und Jan-Maer 2019 (0,32) in derselben Rasterzelle; behalten wurde nur eines, das TTM stand am 2019-06-01
        als VERIFIED 3,45 bis 2018-12-29 ('FY2019Q4'). Richtig waere 3,14 bis 2019-03-30 - oder keins."""
        _, resolver = build("VFC")
        for metric in ("eps_diluted", "revenue"):
            fact = resolver.ttm(metric, "2019-06-01")
            if fact.available:
                self.assertEqual(str(fact.period_end)[:10], "2019-03-30", f"{metric}: veraltetes TTM {fact.value}")

    def test_calendar_year_tax_disclosures_do_not_shift_fiscal_years(self):
        """HIGH-3: Hovnanian (Geschaeftsjahr Oktober) meldet im 10-K FY2021 Steuersaetze fuer Kalenderjahre bis
        2021-12-31; max(ends) machte den Dezember zum Jahresende, das Jahr bis 2025-10-31 hiess FY2028."""
        calendar, _ = build("HOV")
        self.assertEqual(calendar.fiscal_year_for("2025-10-31"), 2025)
        self.assertEqual(calendar.fiscal_year_for("2021-10-31"), 2021)

    def test_mis_scaled_eps_is_not_summed(self):
        """HIGH-4: Churchill Downs 10-Q Q1 2020 taggt EPS -590000 (SEC spaeter -0,59); Ergebnis -23,4 Mio. bei 39,7 Mio.
        Aktien. Das TTM -589.996,91 stand bis 2021-02 als VERIFIED."""
        _, resolver = build("CHDN")
        fact = resolver.ttm("eps_diluted", "2020-06-01")
        self.assertFalse(fact.available, f"TTM {fact.value}")
        self.assertEqual(fact.reason, TTM_EPS_INCONSISTENT)

    def test_quarters_in_different_currencies_are_not_summed(self):
        """MEDIUM-5: Viscount Systems - TTM-Umsatz 3.477.609 aus einem CAD- und drei USD-Quartalen, als CAD beschriftet."""
        _, resolver = build("VSYS")
        fact = resolver.ttm("revenue", "2012-08-14")
        self.assertFalse(fact.available, f"TTM {fact.value} {fact.unit}")
        self.assertEqual(fact.reason, TTM_UNIT_MISMATCH)

    def test_evidence_names_the_statement_concept(self):
        """MEDIUM-6: Escalade 0001104659-20-023597 - Beleg OTHER:RevenueFromContractWithCustomerIncludingAssessedTax
        (Abschlusszeile 180,5 Mio.); gewaehlt wurde der Vertragsumsatz ohne Steuern 203,4 Mio. (naechste Prioritaet)."""
        calendar, resolver = build("ESCA")
        fact = resolver.annual("revenue", calendar.fiscal_year_for("2019-12-28"), "2020-06-01")
        if fact.available:
            self.assertEqual(fact.provenance.concept, "RevenueFromContractWithCustomerIncludingAssessedTax", fact.value)

    def test_eps_fields_carry_their_concept_class(self):
        """MEDIUM-7: Oshkosh - eps.fyDiluted 10,02 und latestQuarterDiluted 0,68 sind EPS fortgefuehrter Bereiche, ohne
        Kennzeichen unter dem Gesamt-EPS-Namen."""
        doc = bundle("OSK")
        for field in ("fyDiluted", "latestQuarterDiluted"):
            value = doc["eps"][field]
            self.assertIsNotNone(value)
            self.assertIn(value.get("class"), ("TOTAL", "CONTINUING"))
            self.assertTrue(value.get("concept"))
        self.assertEqual(doc["eps"]["fyDiluted"]["class"], "CONTINUING")
