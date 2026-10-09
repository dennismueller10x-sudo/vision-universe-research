"""Kern 1.21.0: F-TTM-4 und F-TTM-5 - entdeckt im TTM-Holdout v3 (artifacts/FUNDAMENTAL-TTM-HOLDOUT3-RESULT.json,
FAIL gegen Kern 1.20.0; der Holdout bleibt FAIL und validiert 1.21.0 nicht).
Echte SEC-companyfacts-Auszuege: scripts/quant/tests/fixtures/sec-real/{EIGHTPOINT3,DSSI,FRP,UNTC,COOP}.json.
Erwartungswerte werden unabhaengig vom Kern direkt aus den SEC-Fakten des Fixtures gerechnet (sec_quarter_eps).

F-TTM-4  Geschaeftsjahreswechsel, dessen altes Jahresende nur als Vergleichsjahr im Jahresbericht steht.
         8point3 Energy Partners (CIK 1635581): 10-KT 0001564590-16-012046 (2016-01-28) fuer den Uebergangszeitraum
         2014-12-29..2015-11-30 (336 Tage, altes 52/53-Wochen-Jahr bis 2014-12-28, neues Jahresende 30.11.).
         Diamond S Shipping (CIK 1761940): 10-K 0001104659-20-039594 (2020-03-27) mit Vorgaenger-Geschaeftsjahr
         2017-04-01..2018-03-31 und Uebergangszeitraum 2018-04-01..2018-12-31 (275 Tage).
         Kern 1.20.0 verwarf das Vergleichsjahr als "nicht auf dem Zyklus des Berichts" (Deere-Regel) und schrieb das
         neue Jahresende rueckwaerts fort; das Uebergangsjahr sah wie ein normales Jahr aus, seine Quartale bekamen
         Slots, und TTM-Fenster durch den Uebergangszeitraum galten als verfuegbar (8point3 bis 2016-05-31: 1,70;
         Diamond S bis 2018-12-31: -3,17).
F-TTM-5  Geschaeftsjahr in Predecessor- und Successor-Perioden geteilt (Fresh Start, Uebernahme), Geschaeftsjahresende
         unveraendert (SEC: fiscalYearEnd 1231, regulaerer 10-K). Die TTM-Fenster des Kerns waren korrekt (die
         v3-Wahrheit wertete das fehlende 12-Monats-Jahr faelschlich als Geschaeftsjahreswechsel). Der Kern-Defekt
         derselben Struktur ist die Jahreskennung: FairPoint (CIK 1062613) teilte FY2011 (2011-01-01..01-24 /
         01-25..12-31); der 10-K 0001193125-12-105272 (2012-03-09, fy=2011) traegt als einziges 12-Monats-Jahr das
         Vergleichsjahr 2010. Kern 1.20.0 las es als eigenes Jahr des Berichts (2010-12-31 = FY2011) und verschob jede
         spaetere Jahreskennung um +1 (Jahres-EPS 2012 unter FY2013).
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


def payload(name):
    return json.loads((FIXTURES / f"{name}.json").read_text())


def build(name):
    if name not in _CACHE:
        data = payload(name)
        cik = str(data["cik"]).zfill(10)
        raw = list(SECProvider.iter_raw_facts(SECProvider.__new__(SECProvider), data, forms=PERIODIC_FORMS))
        calendar = FiscalCalendar.from_raw_facts(cik, raw)
        _CACHE[name] = (calendar, PeriodResolver(normalize_company(cik, raw, REGISTRY, calendar=calendar).factbook, REGISTRY))
    return _CACHE[name]


def ttm_for_end(name, end, as_of):
    calendar, resolver = build(name)
    year, index = calendar.fiscal_year_for(end), calendar.quarter_index(end)
    if year is None or index is None:
        return None
    return resolver.ttm_ending("eps_diluted", year, index, as_of)


def d(value):
    return date.fromisoformat(str(value)[:10])


def sec_quarter_eps(name, start, end, as_of):
    """Dreimonats-EPS (verwaessert, sonst BasicAndDiluted) der Periode start..end, juengste Fassung mit filed <= as_of."""
    facts = payload(name)["facts"]["us-gaap"]
    for concept in ("EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted"):
        rows = [r for r in facts.get(concept, {}).get("units", {}).get("USD/shares", [])
                if r.get("start") == start and r["end"] == end and r["filed"] <= as_of]
        if rows:
            return max(rows, key=lambda r: (r["filed"], r["accn"]))["val"]
    raise AssertionError(f"{name}: kein Dreimonats-EPS {start}..{end} bis {as_of}")


def near(calendar_ends, day, tolerance=5):
    return any(abs((end - d(day)).days) <= tolerance for end in calendar_ends)


class FiscalYearChangeFromComparativeYearTests(unittest.TestCase):
    """F-TTM-4: das alte Geschaeftsjahr steht nur als Vergleichsjahr im Jahresbericht des neuen Zyklus."""

    def test_8point3_old_year_end_is_a_fiscal_year_end(self):
        calendar, _ = build("EIGHTPOINT3")
        self.assertTrue(near(calendar.fy_ends, "2014-12-28"), [str(x) for x in calendar.fy_ends])
        self.assertTrue(near(calendar.fy_ends, "2015-11-30"))

    def test_8point3_transition_period_has_no_quarter_slots(self):
        calendar, _ = build("EIGHTPOINT3")
        previous, fy_end = calendar._boundaries_covering("2015-08-31")
        self.assertTrue(calendar.is_transition_year(previous, fy_end), (previous, fy_end))
        for end in ("2015-03-29", "2015-06-28", "2015-08-31", "2015-11-30"):
            self.assertIsNone(calendar.quarter_index(end), f"{end} liegt im Uebergangszeitraum 2014-12-29..2015-11-30")

    def test_8point3_no_ttm_through_the_transition_period(self):
        # Holdout-v3-Fall: Fenster bis 2016-05-31 zu 2018-02-05; 1.20.0 lieferte 1,70 (0,05 + 0,88 + 0,27 + 0,50)
        for end in ("2016-02-29", "2016-05-31", "2016-08-31"):
            fact = ttm_for_end("EIGHTPOINT3", end, "2018-02-05")
            self.assertTrue(fact is None or not fact.available,
                            f"TTM bis {end} enthaelt ein Quartal des Uebergangszeitraums: {fact and fact.value}")

    def test_8point3_first_full_year_of_the_new_cycle_stays_available(self):
        quarters = [("2015-12-01", "2016-02-29"), ("2016-03-01", "2016-05-31"), ("2016-06-01", "2016-08-31"),
                    ("2016-09-01", "2016-11-30")]
        expected = sum(sec_quarter_eps("EIGHTPOINT3", s, e, "2018-02-05") for s, e in quarters)
        fact = ttm_for_end("EIGHTPOINT3", "2016-11-30", "2018-02-05")
        self.assertTrue(fact is not None and fact.available, fact and fact.reason)
        self.assertAlmostEqual(fact.value, expected, places=6)
        self.assertEqual(str(fact.period_start)[:10], "2015-12-01")

    def test_diamond_s_march_year_and_transition_period(self):
        calendar, _ = build("DSSI")
        self.assertTrue(near(calendar.fy_ends, "2018-03-31"), [str(x) for x in calendar.fy_ends])
        self.assertTrue(near(calendar.fy_ends, "2018-12-31"), [str(x) for x in calendar.fy_ends])
        previous, fy_end = calendar._boundaries_covering("2018-09-30")
        self.assertTrue(calendar.is_transition_year(previous, fy_end), (previous, fy_end))
        for end in ("2018-06-30", "2018-09-30", "2018-12-31"):
            self.assertIsNone(calendar.quarter_index(end))

    def test_diamond_s_no_ttm_through_the_transition_period(self):
        # Holdout-v3-Fall: Fenster bis 2018-12-31 zu 2021-03-16; 1.20.0 lieferte -3,17
        fact = ttm_for_end("DSSI", "2018-12-31", "2021-03-16")
        self.assertTrue(fact is None or not fact.available, fact and fact.value)

    def test_diamond_s_first_calendar_year_stays_available(self):
        quarters = [("2019-01-01", "2019-03-31"), ("2019-04-01", "2019-06-30"), ("2019-07-01", "2019-09-30"),
                    ("2019-10-01", "2019-12-31")]
        expected = sum(sec_quarter_eps("DSSI", s, e, "2021-03-16") for s, e in quarters)
        fact = ttm_for_end("DSSI", "2019-12-31", "2021-03-16")
        self.assertTrue(fact is not None and fact.available, fact and fact.reason)
        self.assertAlmostEqual(fact.value, expected, places=6)

    def test_reporting_cycle_rule_still_rejects_disclosures_inside_the_own_year(self):
        # Deere (Kalenderjahr-Steuersatz im Oktober-Jahr) und Hovnanian (Kalenderjahr bis nach dem eigenen Jahresende):
        # ein 12-Monats-Zeitraum, der das eigene Geschaeftsjahr ueberlappt, ist kein Vorgaengerjahr.
        for name, wrong in (("DE", "2017-12-31"), ("HOV", "2021-12-31")):
            calendar, _ = build(name)
            self.assertFalse(any(abs((end - d(wrong)).days) <= 5 for end in calendar.fy_ends), (name, wrong))


class PredecessorSuccessorYearTests(unittest.TestCase):
    """F-TTM-5: geteiltes Geschaeftsjahr ohne Wechsel des Geschaeftsjahresendes."""

    def test_fairpoint_labels_follow_the_filers_own_annual_reports(self):
        calendar, resolver = build("FRP")
        self.assertEqual(calendar.rejected_anchors, [], "jede Jahreskennung der 10-Ks 2012-2017 wurde verworfen")
        for end, year in (("2010-12-31", 2010), ("2011-12-31", 2011), ("2012-12-31", 2012), ("2013-12-31", 2013)):
            self.assertEqual(calendar.fiscal_year_for(end), year, end)
        timeline = resolver.factbook.get("eps_diluted", 2012, "FY")
        self.assertIsNotNone(timeline)
        self.assertEqual({str(o.period_end)[:10] for o in timeline.observations}, {"2012-12-31"})
        self.assertEqual(calendar.fiscal_year_for("2012-09-30"), 2012)

    def test_fairpoint_split_year_quarters_are_not_combined(self):
        # Q1 2011 = 2011-01-01..01-24 (Predecessor) + 01-25..03-31 (Successor): kein Dreimonatswert, kein TTM ueber ihn
        for end in ("2011-03-31", "2011-06-30", "2011-09-30", "2011-12-31"):
            fact = ttm_for_end("FRP", end, "2026-10-07")
            self.assertTrue(fact is None or not fact.available, (end, fact and fact.value))
        fact = ttm_for_end("FRP", "2012-09-30", "2014-03-05")
        quarters = [("2011-10-01", "2011-12-31"), ("2012-01-01", "2012-03-31"), ("2012-04-01", "2012-06-30"),
                    ("2012-07-01", "2012-09-30")]
        self.assertTrue(fact is not None and fact.available)
        self.assertAlmostEqual(fact.value, sum(sec_quarter_eps("FRP", s, e, "2014-03-05") for s, e in quarters), places=6)

    def test_unit_corp_windows_on_each_side_of_the_fresh_start(self):
        # Fresh Start 2020-09-01: Q3 2020 = 07-01..08-31 + 09-01..09-30, kein Dreimonatswert
        quarters = [("2019-07-01", "2019-09-30"), ("2019-10-01", "2019-12-31"), ("2020-01-01", "2020-03-31"),
                    ("2020-04-01", "2020-06-30")]
        fact = ttm_for_end("UNTC", "2020-06-30", "2021-08-16")
        self.assertTrue(fact is not None and fact.available, fact and fact.reason)
        self.assertAlmostEqual(fact.value, sum(sec_quarter_eps("UNTC", s, e, "2021-08-16") for s, e in quarters), places=6)
        for end in ("2020-09-30", "2020-12-31", "2021-03-31", "2021-06-30"):
            fact = ttm_for_end("UNTC", end, "2022-12-31")
            self.assertTrue(fact is None or not fact.available, (end, fact and fact.value))
        self.assertTrue(ttm_for_end("UNTC", "2021-09-30", "2022-12-31").available)

    def test_mr_cooper_windows_on_each_side_of_the_acquisition(self):
        # Uebernahme 2018-07-31 (Nationstar Predecessor bis 07-31, Successor ab 08-01)
        for end in ("2018-09-30", "2018-12-31", "2019-03-31", "2019-06-30"):
            fact = ttm_for_end("COOP", end, "2021-12-31")
            self.assertTrue(fact is None or not fact.available, (end, fact and fact.value))
        quarters = [("2018-10-01", "2018-12-31"), ("2019-01-01", "2019-03-31"), ("2019-04-01", "2019-06-30"),
                    ("2019-07-01", "2019-09-30")]
        fact = ttm_for_end("COOP", "2019-09-30", "2020-10-29")
        self.assertTrue(fact is not None and fact.available)
        self.assertAlmostEqual(fact.value, sum(sec_quarter_eps("COOP", s, e, "2020-10-29") for s, e in quarters), places=6)

    def test_split_years_are_not_fiscal_year_changes(self):
        for name, end in (("FRP", "2011-06-30"), ("UNTC", "2020-06-30"), ("COOP", "2018-06-30")):
            calendar, _ = build(name)
            previous, fy_end = calendar._boundaries_covering(end)
            self.assertFalse(calendar.is_transition_year(previous, fy_end), (name, previous, fy_end))


class VisibilityChainTests(unittest.TestCase):
    """Kein Quartal gelangt vor seinem Einreichungstag in ein TTM (alle neuen Faelle)."""

    def test_every_selected_quarter_was_filed_by_as_of(self):
        cases = (("EIGHTPOINT3", "2016-11-30", "2017-01-26"), ("DSSI", "2019-12-31", "2020-03-27"),
                 ("FRP", "2012-09-30", "2013-03-07"), ("UNTC", "2020-06-30", "2020-08-10"),
                 ("COOP", "2019-09-30", "2019-11-05"))
        for name, end, as_of in cases:
            calendar, resolver = build(name)
            year, index = calendar.fiscal_year_for(end), calendar.quarter_index(end)
            fact = resolver.ttm_ending("eps_diluted", year, index, as_of)
            for step in range(4):
                y, i = resolver.step_back(year, index, step)
                obs = resolver.quarter_grid("eps_diluted", y, as_of).get(i)
                if obs is not None:
                    self.assertLessEqual(str(obs.available_from or obs.filed)[:10], as_of, (name, end, y, i))
            if fact.available:
                self.assertLessEqual(str(fact.provenance.filed)[:10], as_of)


if __name__ == "__main__":
    unittest.main()
