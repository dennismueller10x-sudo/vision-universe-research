"""Kern 1.20.0: F-TTM-2 (Quartalsfenster nach Geschaeftsjahreswechsel) und F-TTM-3 (widerspruechliche
Einreichungen am selben Tag) - entdeckt im TTM-Holdout v2 (artifacts/FUNDAMENTAL-TTM-HOLDOUT2-RESULT.json).
Echte SEC-companyfacts-Auszuege: scripts/quant/tests/fixtures/sec-real/{MFLX,CIK1463208,LANDMARK}.json.
"""
import json
import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from quant.sec.fiscal import FiscalCalendar  # noqa: E402
from quant.sec.normalize import normalize_company  # noqa: E402
from quant.sec.periods import PeriodResolver  # noqa: E402
from quant.sec.provider import PERIODIC_FORMS, SECProvider  # noqa: E402
from quant.sec.registry import MetricRegistry  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "sec-real"
REGISTRY = MetricRegistry.load()
_CACHE = {}


def build(name):
    if name not in _CACHE:
        payload = json.loads((FIXTURES / f"{name}.json").read_text())
        cik = str(payload["cik"]).zfill(10)
        raw = list(SECProvider.iter_raw_facts(SECProvider.__new__(SECProvider), payload, forms=PERIODIC_FORMS))
        calendar = FiscalCalendar.from_raw_facts(cik, raw)
        _CACHE[name] = (calendar, PeriodResolver(normalize_company(cik, raw, REGISTRY, calendar=calendar).factbook, REGISTRY))
    return _CACHE[name]


def ttm_for_end(calendar, resolver, end, as_of, metric="eps_diluted"):
    year, index = calendar.fiscal_year_for(end), calendar.quarter_index(end)
    if year is None or index is None:
        return None
    return resolver.ttm_ending(metric, year, index, as_of)


def days(a, b):
    return abs((date.fromisoformat(str(a)[:10]) - date.fromisoformat(str(b)[:10])).days)


class FiscalYearChangeTests(unittest.TestCase):
    """F-TTM-2: Multi-Fineline wechselte 2015 das Geschaeftsjahresende von September auf Dezember
    (FY2015 = 2014-10-01..2015-12-31, fuenf Quartale). 1.19.0 legte Okt-Dez 2015 auf denselben Slot wie
    Jul-Sep 2015 und lieferte fuer das Ende 2015-12-31 das Fenster bis 2015-09-30 (2,02 statt 1,78)."""

    def test_no_window_ends_a_quarter_early(self):
        calendar, resolver = build("MFLX")
        fact = ttm_for_end(calendar, resolver, "2015-12-31", "2016-05-05")
        if fact is not None and fact.available:
            self.assertLessEqual(days(fact.period_end, "2015-12-31"), 7, "TTM-Fenster endet ein Quartal zu frueh")

    def test_distinct_quarters_never_share_a_slot(self):
        for name in ("MFLX", "CIK1463208", "NEOG", "PEP", "HOV", "DE", "OSK", "PIPR"):
            calendar, resolver = build(name)
            slots = {}
            for year in resolver.factbook.fiscal_years("eps_diluted"):
                for index, obs in resolver.quarter_grid("eps_diluted", year, "2099-12-31").items():
                    if obs is None:
                        continue
                    end = str(obs.period_end)[:10]
                    self.assertEqual((calendar.fiscal_year_for(end), calendar.quarter_index(end)), (year, index),
                                     f"{name}: Quartal {end} liegt im Slot {year}Q{index}, der Kalender sagt anders")
                    slots.setdefault((year, index), set()).add(end)
            for slot, ends in slots.items():
                self.assertEqual(len(ends), 1, f"{name}: Slot {slot} traegt mehrere Quartale {ends}")

    def test_every_ttm_window_is_four_contiguous_quarters_ending_at_its_slot(self):
        for name in ("MFLX", "CIK1463208"):
            calendar, resolver = build(name)
            for year in resolver.factbook.fiscal_years("eps_diluted"):
                for index in range(1, 5):
                    fact = resolver.ttm_ending("eps_diluted", year, index, "2099-12-31")
                    if not fact.available:
                        continue
                    end = str(fact.period_end)[:10]
                    self.assertEqual((calendar.fiscal_year_for(end), calendar.quarter_index(end)), (year, index),
                                     f"{name}: TTM {year}Q{index} endet {end}")

    def test_transition_year_quarters_are_not_quarter_eligible(self):
        calendar, _ = build("MFLX")
        # 2014-09-30 -> 2015-12-31 sind 457 Tage: ein Uebergangsjahr, keine vier Quartale
        self.assertIsNone(calendar.quarter_index("2015-12-31"))
        self.assertIsNone(calendar.quarter_index("2015-03-31"))
        # das Jahr davor und danach sind normale Jahre
        self.assertEqual(calendar.quarter_index("2014-06-30"), 3)
        self.assertEqual(calendar.quarter_index("2016-06-30"), 2)


class TransitionYearBalanceSheetTests(unittest.TestCase):
    def test_year_end_balance_sheet_of_a_transition_year_stays_fy(self):
        """Ein Uebergangsjahr hat keine Quartalsslots, aber eine Jahresbilanz (Multi-Fineline 2015-12-31)."""
        calendar, resolver = build("MFLX")
        fact = resolver.annual("total_assets", calendar.fiscal_year_for("2015-12-31"), "2016-06-01")
        self.assertTrue(fact.available, fact.reason)
        self.assertEqual(str(fact.period_end)[:10], "2015-12-31")


class SameDayConflictTests(unittest.TestCase):
    """F-TTM-3: Landmark Apartment Trust reichte am 2013-03-20 das 10-K (Q3 2012 EPS -1,03) und ein 10-Q/A
    (Q3 2012 EPS +1,03) ein. Ohne Uhrzeit ist nicht bekannt, welche Fassung zuletzt galt; 1.19.0 nahm per
    Sortierung das Amendment (+1,03) und lieferte TTM 0,35 statt -1,71."""

    def test_same_day_conflict_is_not_resolved_by_sort_order(self):
        calendar, resolver = build("LANDMARK")
        fact = ttm_for_end(calendar, resolver, "2012-12-31", "2013-03-20")
        self.assertFalse(fact is not None and fact.available and abs(fact.value - 0.35) < 0.005,
                         "widerspruechliche Fassungen am selben Tag per Sortierung entschieden")
        self.assertTrue(fact is None or not fact.available, "am Konflikttag ist das Quartal nicht eindeutig bekannt")

    def test_conflict_resolves_with_the_next_unambiguous_filing(self):
        """Das 10-Q vom 2013-11-14 meldet Q3 2012 erneut (-1,03): ab dann ist der Stand eindeutig."""
        calendar, resolver = build("LANDMARK")
        fact = ttm_for_end(calendar, resolver, "2012-12-31", "2013-11-14")
        self.assertTrue(fact.available, fact.reason)
        self.assertAlmostEqual(fact.value, -1.71, places=2)

    def test_amendment_never_reaches_back_before_its_filing(self):
        calendar, resolver = build("LANDMARK")
        # vor dem 2013-03-20 galt das urspruengliche 10-Q (Q3 +1,03); das 10-K kommt erst dann
        q3 = resolver.quarter_grid("eps_diluted", calendar.fiscal_year_for("2012-09-30"), "2013-03-19").get(
            calendar.quarter_index("2012-09-30"))
        self.assertIsNotNone(q3)
        self.assertAlmostEqual(q3.value, 1.03, places=2)
        self.assertLess(str(q3.filed)[:10], "2013-03-20")


if __name__ == "__main__":
    unittest.main()


class StubPeriodTests(unittest.TestCase):
    """1.20.0 Stub-Policy (vor Holdout v3 festgelegt): NORMAL_QUARTER 77-119 Tage; SHORT_STUB < 77 und LONG_STUB
    > 119 sind NOT_QUARTER_ELIGIBLE; ein TTM ist eine Kette tatsaechlicher Perioden ueber 357-374 Tage.
    Echte Faelle: Denbury Fresh Start 2020-09-18 (Nachfolger-Rumpf 2020-09-19..12-31, 104 Tage, LONG im Fenster:
    377 Tage), Tidewater Fresh Start 2017-07-31 (2017-08-01..09-30, 60 Tage, SHORT)."""

    STUBS = {"DENBURY": ("2020-09-19", "2020-12-31"), "TDW": ("2017-08-01", "2017-09-30")}

    def test_no_ttm_window_contains_a_stub(self):
        for name, (stub_start, stub_end) in self.STUBS.items():
            calendar, resolver = build(name)
            for year in range(2014, 2027):
                for index in range(1, 5):
                    fact = resolver.ttm_ending("eps_diluted", year, index, "2099-12-31")
                    if not fact.available:
                        continue
                    self.assertFalse(str(fact.period_start)[:10] <= stub_start and str(fact.period_end)[:10] >= stub_end,
                                     f"{name}: TTM {fact.period_start}..{fact.period_end} enthaelt die Rumpfperiode")

    def test_every_available_ttm_is_one_fiscal_year_of_real_periods(self):
        names = ("MFLX", "CIK1463208", "LANDMARK", "DENBURY", "TDW", "PEP", "NEOG", "PIPR", "HOV", "DE", "OSK",
                 "MUR", "CSWC", "CHDN", "FUBO", "VFC", "NVDA", "WBHC")
        checked = 0
        for name in names:
            calendar, resolver = build(name)
            for metric in ("eps_diluted", "eps_basic", "revenue", "net_income"):
                for year in range(2009, 2027):
                    for index in range(1, 5):
                        fact = resolver.ttm_ending(metric, year, index, "2099-12-31")
                        if not fact.available:
                            continue
                        span = days(fact.period_start, fact.period_end) + 1
                        self.assertTrue(357 <= span <= 374, f"{name} {metric} {year}Q{index}: {span} Tage")
                        checked += 1
        self.assertGreater(checked, 500)


class CustomTagTests(unittest.TestCase):
    """EPS nur in einem Erweiterungs-Tag (companyfacts fuehrt nur us-gaap/ifrs/dei): kein EPS-TTM, und kein
    Ersatz aus Ergebnis / Aktien. Echte PepsiCo-Daten, EPS-Konzepte entfernt."""

    def test_missing_gaap_eps_is_not_rebuilt_from_net_income(self):
        payload = json.loads((FIXTURES / "PEP.json").read_text())
        payload["facts"]["us-gaap"] = {k: v for k, v in payload["facts"]["us-gaap"].items()
                                       if not k.startswith("EarningsPerShare") and "PerShare" not in k}
        cik = str(payload["cik"]).zfill(10)
        raw = list(SECProvider.iter_raw_facts(SECProvider.__new__(SECProvider), payload, forms=PERIODIC_FORMS))
        calendar = FiscalCalendar.from_raw_facts(cik, raw)
        resolver = PeriodResolver(normalize_company(cik, raw, REGISTRY, calendar=calendar).factbook, REGISTRY)
        for metric in ("eps_diluted", "eps_basic"):
            self.assertFalse(resolver.ttm(metric, "2026-10-05").available, metric)
        self.assertTrue(resolver.ttm("net_income", "2026-10-05").available, "Gegenprobe: Ergebnis-TTM vorhanden")


class RedTeamRegressionTests(unittest.TestCase):
    """Red Team 1.20.0 vor dem Freeze (alle Emittenten aus dem bereits gesehenen Produktuniversum)."""

    def test_no_quarter_from_cumulative_points_with_different_starts(self):
        """HIGH-1 Best Buy FY2013 (11-Monats-Uebergangsjahr): FY 2012-03-04.. minus YTD3 2012-01-29.. ergab
        einen Q4 von 10,73 Mrd.; TTM 2014Q2 zum 2014-09-15 war 38,728 statt 42,877 Mrd."""
        calendar, resolver = build("BBY")
        fact = resolver.ttm_ending("revenue", 2014, 2, "2014-09-15")
        self.assertFalse(fact.available and abs(fact.value - 38.728e9) < 1e7, fact.value)
        for year in (2013, 2014):
            for index, cell in resolver.quarter_grid("revenue", year, "2015-06-01").items():
                if cell is not None and cell.provenance.transformation != "AS_REPORTED":
                    self.assertTrue(77 <= days(cell.period_start, cell.period_end) + 1 <= 119, (year, index))

    def test_restated_fy_minus_old_ytd_with_other_start_is_not_a_quarter(self):
        """HIGH-1 Wendy's FY2009: restated FY minus YTD3 mit anderem Beginn (2008-12-09 vs. 2008-12-29) = -242,8 Mio."""
        _, resolver = build("WEN")
        cell = resolver.quarter_grid("revenue", 2009, "2013-01-01").get(4)
        self.assertTrue(cell is None or cell.value > 0, cell and cell.value)

    def test_ambiguous_same_day_quarter_is_not_derived(self):
        """HIGH-2 Rayonier 2013 Q2: 10-K/A 409,1 Mio. und 10-Q/A 154,9 Mio. am selben Tag; YTD2 (restated) minus
        Q1 (unrestated) ergab -131,8 Mio."""
        _, resolver = build("RYN")
        self.assertIsNone(resolver.quarter_grid("revenue", 2013, "2014-12-01").get(2))
        self.assertFalse(resolver.ttm_ending("revenue", 2013, 2, "2014-12-01").available)

    def test_weighted_shares_tagged_as_eps_are_not_summed(self):
        """Stanley Black & Decker 10-Q/A (2022): gewichtete Aktien als EPS getaggt, TTM 329.535.005,31."""
        _, resolver = build("SWK")
        fact = resolver.ttm("eps_diluted", "2022-02-01")
        self.assertFalse(fact.available, fact.value)
        self.assertTrue(resolver.ttm("eps_diluted", "2022-03-01").available)

    def test_quarter_starting_before_the_previous_end_is_contiguous(self):
        """MEDIUM-1 Vishay Q4 2015 beginnt 2015-10-01, Q3 endete 2015-10-03 (Datumskonvention)."""
        _, resolver = build("VSH")
        fact = resolver.ttm_ending("revenue", 2015, 4, "2016-06-01")
        self.assertTrue(fact.available, fact.reason)

    def test_every_quarter_cell_sits_on_its_calendar_slot_for_all_metrics(self):
        """MEDIUM-2: die Invariante gilt fuer alle Kennzahlen, auch abgeleitete Quartale."""
        for name in ("MFLX", "BBY", "WEN", "DENBURY", "TDW", "CIK1463208", "FUBO", "VFC"):
            calendar, resolver = build(name)
            for metric in ("revenue", "net_income", "operating_cash_flow", "eps_diluted"):
                for year in range(2009, 2027):
                    for index, cell in resolver.quarter_grid(metric, year, "2099-12-31").items():
                        if cell is None:
                            continue
                        end = str(cell.period_end)[:10]
                        self.assertEqual((calendar.fiscal_year_for(end), calendar.quarter_index(end)), (year, index),
                                         f"{name} {metric} {year}Q{index} {end}")


class StaleAfterFiscalYearChangeTests(unittest.TestCase):
    """Red Team (Nachpruefung): ein neueres, im Kalender nicht einordbares Quartal macht ein aelteres Fenster nicht
    aktuell. MFLX: das 10-K vom 2016-02-11 meldet Okt-Dez 2015 (Uebergangsjahr, kein Slot)."""

    def test_elf_window_through_2018_is_not_current_in_august_2019(self):
        """e.l.f. Beauty: Geschaeftsjahreswechsel Dezember -> Maerz 2019; 1.20.0 vor der Nachpruefung lieferte am
        2019-08-20 EPS 0,32 bis 2018-12-31 als aktuelles TTM, obwohl Apr-Jun 2019 eingereicht war."""
        _, resolver = build("ELF")
        for as_of in ("2019-08-20", "2019-11-20"):
            fact = resolver.ttm("eps_diluted", as_of)
            self.assertFalse(fact.available and str(fact.period_end)[:10] <= "2018-12-31", (as_of, fact.value))

    def test_current_ttm_is_not_an_older_window(self):
        calendar, resolver = build("MFLX")
        fact = resolver.ttm("eps_diluted", "2016-03-01")
        if fact.available:
            self.assertLessEqual(days(fact.period_end, "2015-12-31"), 7, f"veraltetes Fenster bis {fact.period_end}")
