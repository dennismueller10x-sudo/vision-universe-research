"""TTM-Integritaet (Kern 1.16.0): ein TTM ist die Summe von vier BERICHTETEN, aufeinanderfolgenden Quartalen
derselben Konzeptklasse auf derselben Aktienbasis - sonst NOT_AVAILABLE mit Grund, nie geraten.

Echte SEC-companyfacts-Auszuege (scripts/quant/tests/fixtures/sec-real/*.json), Befunde aus
scripts/fundamentals-audit/artifacts/FUNDAMENTAL-TTM-INVESTIGATION.json.
"""
import unittest

from test_sec_ground_truth_regressions import build

from quant.sec.model import (TTM_CONCEPT_MISMATCH, TTM_PERIODS_NOT_CONTIGUOUS,  # noqa: E402
                             TTM_SHARE_BASIS_INCONSISTENT)

AS_OF = "2026-10-05"


class TtmPeriods(unittest.TestCase):
    def test_fiscal_year_change_does_not_double_count_a_quarter(self):
        """FUBO (Geschaeftsjahreswechsel 2025/26): das Raster belegte Q2 und Q3 mit demselben Ende 2026-06-30;
        TTM-Umsatz zaehlte 1.481,7 Mio. doppelt (6,09 Mrd.). Zwei Quartale mit demselben Ende sind kein TTM."""
        _, resolver = build("FUBO")
        fact = resolver.ttm("revenue", AS_OF)
        self.assertFalse(fact.available, f"TTM {fact.value} aus doppeltem Quartal")
        self.assertEqual(fact.reason, TTM_PERIODS_NOT_CONTIGUOUS)
        self.assertFalse(resolver.ttm("net_income", AS_OF).available)

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
