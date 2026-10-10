"""Kern 1.23.0: F-TTM-8, F-TTM-7, M-2 - dokumentiert in der Arbeit an 1.22.0
(artifacts/FUNDAMENTAL-TTM-122-NEIGHBOR-SEARCH.json newDefect, artifacts/FUNDAMENTAL-TTM-122-REDTEAM.json M-2).
Echte SEC-companyfacts-Auszuege unter scripts/quant/tests/fixtures/sec-real/. Erwartungswerte unabhaengig vom Kern
direkt aus den SEC-Fakten des Fixtures.
"""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from quant.sec.fiscal import FiscalCalendar  # noqa: E402
from quant.sec.normalize import normalize_company  # noqa: E402
from quant.sec.periods import PeriodResolver  # noqa: E402
from quant.sec.provider import SECProvider, fundamental_facts  # noqa: E402
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
        calendar_facts, values = fundamental_facts(SECProvider.__new__(SECProvider), data)
        calendar = FiscalCalendar.from_raw_facts(cik, calendar_facts)
        factbook = normalize_company(cik, values, REGISTRY, calendar=calendar).factbook
        _CACHE[name] = (data, calendar, factbook, PeriodResolver(factbook, REGISTRY))
    return _CACHE[name]


def sec_quarter(name, concept, start, end, as_of, unit="USD/shares"):
    """Juengste SEC-Fassung eines Dreimonatswerts start..end mit filed <= as_of (unabhaengig vom Kern)."""
    rows = [r for r in payload(name)["facts"]["us-gaap"][concept]["units"][unit]
            if r.get("start") == start and r["end"] == end and r["filed"] <= as_of]
    return max(rows, key=lambda r: (r["filed"], r["accn"]))["val"] if rows else None


class FTTM8PhantomYearEndTests(unittest.TestCase):
    """F-TTM-8. Zurn Elkay (vormals Rexnord, CIK 1439288): Geschaeftsjahr April-Maerz bis 2020-03-31, Uebergangszeitraum
    2020-04-01..2020-12-31 (10-KT 0001439288-21-000016, 2021-02-16), danach Kalenderjahre. Der 10-K 0001439288-22-000032
    (2022-02-09) traegt als Vergleich einen umgerechneten Kalenderjahr-Fakt 2019-01-01..2019-12-31. Weil er auf dem
    Zyklus dieses Berichts liegt, wurde 2019-12-31 Geschaeftsjahresende - mitten im Geschaeftsjahr 2019-04-01..2020-03-31,
    das der frueher eingereichte 10-K 0001439288-20-000090 (2020-05-12) als eigenes Jahr erklaert. Folge: ein 92-Tage-
    'Jahr' 2020 (Januar-Maerz 2020) und kein Quartalsslot fuer April 2019 bis Dezember 2020."""

    def test_comparative_calendar_year_of_a_later_report_is_no_fiscal_year_end(self):
        _, calendar, _, _ = build("ZWS")
        ends = [str(end) for end in calendar.fy_ends]
        self.assertNotIn("2019-12-31", ends)
        for end in ("2019-03-31", "2020-03-31", "2020-12-31", "2021-12-31"):
            self.assertIn(end, ends)

    def test_fiscal_2020_has_its_four_quarters(self):
        _, calendar, _, _ = build("ZWS")
        for end, index in (("2019-06-30", 1), ("2019-09-30", 2), ("2019-12-31", 3), ("2020-03-31", 4)):
            self.assertEqual((calendar.fiscal_year_for(end), calendar.quarter_index(end)), (2020, index), end)

    def test_transition_period_stays_without_quarter_slots(self):
        _, calendar, _, _ = build("ZWS")
        self.assertIsNone(calendar.fiscal_year_for("2020-09-30"))

    def test_ttm_through_fiscal_2020_equals_the_sec_quarters(self):
        _, calendar, _, resolver = build("ZWS")
        as_of = "2020-06-30"
        quarters = (("2019-04-01", "2019-06-30"), ("2019-07-01", "2019-09-30"), ("2019-10-01", "2019-12-31"),
                    ("2020-01-01", "2020-03-31"))
        expected = sum(sec_quarter("ZWS", "EarningsPerShareDiluted", s, e, as_of) for s, e in quarters)
        fact = resolver.ttm_ending("eps_diluted", 2020, 4, as_of)
        self.assertTrue(fact.available, fact.reason)
        self.assertAlmostEqual(fact.value, expected, places=6)



def cell(name, metric, period_end, fiscal_period):
    _, calendar, factbook, _ = build(name)
    return factbook, calendar.fiscal_year_for(period_end), fiscal_period


def resolved(name, metric, period_end, fiscal_period, as_of=None):
    from quant.sec.restatements import POLICY_LATEST_KNOWN
    factbook, year, period = cell(name, metric, period_end, fiscal_period)
    if as_of is None:
        return factbook.resolve(metric, year, period, policy=POLICY_LATEST_KNOWN)
    return factbook.resolve(metric, year, period, as_of=as_of)


def span(obs):
    return (str(obs.period_start)[:10], str(obs.period_end)[:10])


class FTTM7CellIdentityTests(unittest.TestCase):
    """F-TTM-7: eine Zelle haelt Beobachtungen verschiedener Zeitraeume oder wirtschaftlicher Konzepte aus verschiedenen
    Einreichungen; die juengste ersetzte die fruehere auch dann. 1.23.0 waehlt zur Abfragezeit aus den sichtbaren
    Fassungen: zuerst das primaere wirtschaftliche Konzept, dann den Zeitraum, der am besten zum Kalenderslot der Zelle
    passt, erst dann die juengste Fassung dieses Zeitraums. Keine Fassung wird verworfen."""

    def test_cumulative_period_must_start_at_the_fiscal_year_start_entest(self):
        # Entest Group (CIK 1449447), Geschaeftsjahr September-August. 10-Q 0001607062-15-000304 (2015-07-09) meldet
        # 2014-12-01..2015-05-31 (sechs Monate, aber nicht ab Jahresbeginn); er ersetzte YTD2 2014-09-01..2015-02-28.
        obs = resolved("ENTEST", "eps_diluted", "2015-02-28", "YTD2", as_of="2015-08-01")
        self.assertEqual(span(obs), ("2014-09-01", "2015-02-28"))

    def test_cumulative_period_must_start_at_the_fiscal_year_start_simpson(self):
        # Simpson Manufacturing (CIK 920371), Kalenderjahr. 10-Q 0001104659-14-037084 (2014-05-09) taggt 2013-04-01..
        # 2013-12-31 (neun Monate, nicht ab Jahresbeginn); er ersetzte bis 2014-11-07 YTD3 2013-01-01..2013-09-30.
        obs = resolved("SSD", "dividends_declared_per_share", "2013-09-30", "YTD3", as_of="2014-06-01")
        self.assertEqual((span(obs), obs.value), (("2013-01-01", "2013-09-30"), 0.25))

    def test_cell_period_is_the_one_fitting_the_calendar_slot_not_the_newest(self):
        # Novus Robotics (CIK 1388180), Kalender Dezember: Q3 2011 zuerst 2011-06-01..08-31 (10-Q 0001471242-11-000405,
        # 2011-12-02, Bruttogewinn 1.320), spaeter 2011-07-01..09-30 (10-Q 0001477932-12-004479, 2012-11-16, 565.313).
        # Q3 des Dezember-Kalenders ist Juli-September; vor 2012-11-16 ist nur Juni-August sichtbar.
        before = resolved("NOVUS", "gross_profit", "2011-09-30", "Q3", as_of="2012-11-15")
        latest = resolved("NOVUS", "gross_profit", "2011-09-30", "Q3")
        self.assertEqual((span(before), before.value), (("2011-06-01", "2011-08-31"), 1320.0))
        self.assertEqual((span(latest), latest.value), (("2011-07-01", "2011-09-30"), 565313.0))

    def test_misfitting_first_publication_does_not_lock_the_cell(self):
        # INNOVATE/HC2 (CIK 1006837): Q4 2014 Umsatz zuerst 2014-09-23..12-31 (10-K 0001193125-15-094027), restated
        # 2014-10-01..12-31 (10-K/A 0001006837-16-000029, 2016-03-15). TTM FY2014 = SEC-Geschaeftsjahr 547.438.000
        # (red team 1.23.0 HIGH-2: mit 'Erstveroeffentlichung sperrt' TTM_PERIODS_NOT_CONTIGUOUS).
        _, calendar, _, resolver = build("HCHC")
        fact = resolver.ttm_ending("revenue", calendar.fiscal_year_for("2014-12-31"),
                                   calendar.quarter_index("2014-12-31"), "2099-12-31")
        self.assertTrue(fact.available, fact.reason)
        self.assertAlmostEqual(fact.value, 547438000.0, delta=1)

    def test_same_instant_period_conflict_is_decided_by_slot_fit_not_accession(self):
        # Moxian (CIK 1516805), beide 2012-12-12: 10-Q/A 0001516805-12-000014 meldet 2010-10-12..2011-03-31
        # (-10.979) als Halbjahr, 10-Q 0001516805-12-000016 2011-01-01..2011-06-30 (-11.537). Red team HIGH-3: die
        # Accession-Reihenfolge entschied. Der Slot YTD2 2011 ist Januar-Juni.
        obs = resolved("MOXC", "net_income", "2011-06-30", "YTD2")
        self.assertEqual((span(obs), obs.value), (("2011-01-01", "2011-06-30"), -11537.0))

    def test_quarter_is_not_derived_across_economic_classes(self):
        # Interactive Brokers (CIK 1381197): FY2013 NetIncomeLoss 37.003.000 (Eigentuemer) minus neun Monate ProfitLoss
        # (einschliesslich Minderheiten) ist kein Q4. Red team HIGH-1: 1.23-Entwurf summierte so 397,3 Mio. zu
        # 2014-11-20. Kein gemischtes Fenster - nicht verfuegbar oder klassenrein.
        _, _, _, resolver = build("IBKR")
        fact = resolver.ttm("net_income", "2014-11-20")
        if fact.available:
            self.assertEqual(len({o for o in fact.flags if o.startswith("TTM_CONCEPT_ALIGNED") or o == "TTM_CLASS_ALIGNED"}) >= 0, True)
            self.assertNotAlmostEqual(fact.value, 397263000.0, delta=1e6)
        else:
            self.assertEqual(fact.reason, "TTM_CONCEPT_MISMATCH")

    def test_later_filing_with_another_economic_concept_does_not_replace_the_cell(self):
        # Forestar (CIK 1406587) Q4 2017: NetIncomeLoss -17.574.000 (10-K 2018-02-28), -17.600.000 (10-Q 2019-01-29);
        # die 10-Q 2019-04-30/07-30 melden nur ProfitLoss -15.600.000 (einschliesslich Minderheiten) - ein anderes
        # wirtschaftliches Konzept, kein Restatement des Ergebnisses der Eigentuemer.
        obs = resolved("FOR", "net_income", "2017-12-31", "Q4")
        self.assertEqual((obs.provenance.concept, obs.value), ("NetIncomeLoss", -17600000.0))

    def test_primary_concept_supersedes_another_economic_class(self):
        # BRT Apartments (CIK 14846) Q4 FY2015 (2015-07-01..09-30): zuerst nur ProfitLoss 5.816.000 (10-K 2015-12-11),
        # danach NetIncomeLoss - das primaere Konzept von net_income ersetzt eine andere Klasse (Umkehrung von Forestar).
        _, calendar, factbook, resolver = build("BRT")
        fact = resolver.ttm_ending("net_income", calendar.fiscal_year_for("2016-03-31"),
                                   calendar.quarter_index("2016-03-31"), "2099-12-31")
        quarters = (("2015-04-01", "2015-06-30"), ("2015-07-01", "2015-09-30"), ("2015-10-01", "2015-12-31"),
                    ("2016-01-01", "2016-03-31"))
        expected = sum(sec_quarter("BRT", "NetIncomeLoss", s, e, "2099-12-31", unit="USD") for s, e in quarters)
        self.assertTrue(fact.available, fact.reason)
        self.assertAlmostEqual(fact.value, expected, delta=1)

    def test_restatement_tagged_in_another_class_is_a_version_when_the_filer_shows_no_difference(self):
        # Mobiquity (CIK 1084267), red team 1.23.0 R2: YTD3 2021 zuerst NetIncomeLoss -8.735.146 (10-Q 2021-11-10),
        # restated nur als ProfitLoss -7.704.023 (10-Q 0001683168-22-008319, 2022-12-09) - ohne Minderheiten. TTM durch
        # FY2021 = SEC-Geschaeftsjahr -18.333.383 (10-K/A 0001683168-22-008139).
        _, calendar, _, resolver = build("MOBQ")
        fact = resolver.ttm_ending("net_income", calendar.fiscal_year_for("2021-12-31"),
                                   calendar.quarter_index("2021-12-31"), "2099-12-31")
        self.assertTrue(fact.available, fact.reason)
        self.assertAlmostEqual(fact.value, -18333383.0, delta=1)

    def test_tag_switch_without_class_difference_keeps_the_ttm(self):
        # Johnson & Johnson (CIK 200406), PIT 2012-05-20: Q1 2012 ProfitLoss 3,910 Mrd. (10-Q 0000200406-12-000081),
        # Q2-Q4 2011 NetIncomeLoss (10-K 0001193125-12-075565) - kein Klassenunterschied belegt, TTM bleibt.
        _, _, _, resolver = build("JNJ12")
        fact = resolver.ttm("net_income", "2012-05-20")
        self.assertTrue(fact.available, fact.reason)

    def test_one_class_reading_prefers_owners_net_income(self):
        # Markel (CIK 1096343), TTM Q1 2020: Q4 2019 nur noch als ProfitLoss restated (10-K 0001096343-21-000032),
        # Q2 2019 zeigt NetIncomeLoss 497.298.000 neben ProfitLoss 506.483.000. Klassenrein in der Eigentuemerklasse =
        # SEC-Summe NetIncomeLoss -1.405.763.000 + 511.104.000 + 205.637.000 + 497.298.000.
        _, calendar, _, resolver = build("MKL20")
        fact = resolver.ttm_ending("net_income", calendar.fiscal_year_for("2020-03-31"),
                                   calendar.quarter_index("2020-03-31"), "2099-12-31")
        self.assertTrue(fact.available, fact.reason)
        self.assertAlmostEqual(fact.value, -191724000.0, delta=1)

    def test_one_class_reading_uses_the_newest_filing_that_reported_the_class(self):
        # AMCOL (CIK 813621), TTM Q2 2011 klassenrein ProfitLoss: Q1/Q2 2011 = 13.100.000 aus dem 10-K
        # 0001140361-13-016072 (dort neben NetIncomeLoss), nicht 12.237.000/13.757.000 aus dem 10-K 2012.
        _, calendar, _, resolver = build("ACO11")
        fact = resolver.ttm_ending("net_income", calendar.fiscal_year_for("2011-06-30"),
                                   calendar.quarter_index("2011-06-30"), "2099-12-31")
        self.assertTrue(fact.available, fact.reason)
        self.assertAlmostEqual(fact.value, 17307000.0 - 9448000.0 + 13100000.0 + 13100000.0, delta=1)

    def test_misplaced_first_period_does_not_lock_the_cell(self):
        # Eco-Tek (CIK 1473637), red team 1.23.0 HIGH-2: neun Monate der Mantelgesellschaft 2011-07-01..2012-03-31
        # (10-Q 0001432093-12-000374) lagen zuerst in YTD3 2012. Der Slot ist 2012-01-01..2012-09-30 = -203.723
        # (10-Q 0001214782-12-000107); damit TTM FY2012 = -868.195 (Jahresbericht) und TTM Q3 2013 = -1.111.953.
        obs = resolved("ECOTEK", "net_income", "2012-09-30", "YTD3")
        self.assertEqual((span(obs), obs.value), (("2012-01-01", "2012-09-30"), -203723.0))
        _, calendar, _, resolver = build("ECOTEK")
        for end, expected in (("2012-12-31", -868195.0), ("2013-09-30", -1111953.0)):
            fact = resolver.ttm_ending("net_income", calendar.fiscal_year_for(end), calendar.quarter_index(end),
                                       "2099-12-31")
            self.assertAlmostEqual(fact.value, expected, delta=1, msg=end)

    def test_one_class_reading_ignores_the_cells_own_class_preference(self):
        # RPT Realty (CIK 842183), TTM Q2 2016 klassenrein ProfitLoss: die juengste ProfitLoss-Fassung je Quartal
        # (10-K 0000842183-17-000013 bzw. -18-000013: 33.666.000, 14.686.000, 11.845.000, 27.363.000), nicht die
        # Nebenmeldung der Eigentuemer-Zelle aus dem 10-Q (34.606.000, 12.142.000, 28.020.000).
        _, calendar, _, resolver = build("RPT16")
        fact = resolver.ttm_ending("net_income", calendar.fiscal_year_for("2016-06-30"),
                                   calendar.quarter_index("2016-06-30"), "2099-12-31")
        self.assertTrue(fact.available, fact.reason)
        self.assertAlmostEqual(fact.value, 87560000.0, delta=1)

    def test_same_period_restatement_still_replaces(self):
        # Gleicher Zeitraum, gleiches Konzept: Entest 10-Q 2016-04-13 restated YTD2 2015 0,00 -> -0,01.
        obs = resolved("ENTEST", "eps_diluted", "2015-02-28", "YTD2")
        self.assertEqual((span(obs), obs.value), (("2014-09-01", "2015-02-28"), -0.01))



class M2PredecessorSuccessorBasisTests(unittest.TestCase):
    """M-2: Dawson Geophysical (CIK 799165) - Reverse Merger 2015, Legacy Dawson ist bilanzieller Erwerber, der Registrant
    ist TGC. Der 10-QT 0001193125-15-101893 (2015-03-23) meldet Oktober-Dezember 2014 auf Dawson-Basis (Umsatz
    50.802.000); fuer dasselbe Quartal hatte der TGC-10-K 0001104659-15-020069 (2015-03-16) 25.715.000 gemeldet.
    Januar-September 2014 stehen bis zu den restatenden 10-Q 2015 nur auf TGC-Basis. Das PIT-TTM zu 2015-03-24 mischte
    drei TGC-Quartale mit einem Dawson-Quartal (143.935.000 - keine SEC-Zahl). Ein Fenster ist nur kompatibel, wenn keine
    neuere Einreichung des Fensters einer aelteren Einreichung des Fensters bei einem gemeinsam gemeldeten Zeitraum
    widerspricht (dieselbe berichtende Basis)."""

    def test_window_mixing_predecessor_and_successor_bases_is_not_available(self):
        _, _, _, resolver = build("DWSN15")
        for as_of in ("2015-03-24", "2015-06-21"):
            fact = resolver.ttm("revenue", as_of)
            self.assertFalse(fact.available, (as_of, fact.value))
            self.assertEqual(fact.reason, "TTM_BASIS_MIXED")

    def test_window_on_one_basis_before_the_transition_report_stays(self):
        _, _, _, resolver = build("DWSN15")
        fact = resolver.ttm("revenue", "2015-03-22")
        quarters = (("2014-01-01", "2014-03-31"), ("2014-04-01", "2014-06-30"), ("2014-07-01", "2014-09-30"),
                    ("2014-10-01", "2014-12-31"))
        expected = sum(sec_quarter("DWSN15", "SalesRevenueServicesNet", s, e, "2015-03-22", unit="USD")
                       for s, e in quarters)
        self.assertTrue(fact.available, fact.reason)
        self.assertAlmostEqual(fact.value, expected, delta=2000)

    def test_mistagged_comparative_year_outside_the_window_quarters_is_no_basis_change(self):
        # Simpson Manufacturing (CIK 920371): die 10-Q 0000920371-19-000062/-000090 taggen "2018-01-01..2018-12-31"
        # NetIncomeLoss mit 101,2 bzw. 57,1 Mio. (10-K: 126,6 Mio.) - Fehltags, keine neue Basis (red team MEDIUM-1).
        # TTM zu 2019-08-20 = Q3'18 + Q4'18 + Q1'19 + Q2'19 der SEC.
        _, _, _, resolver = build("SSD19")
        fact = resolver.ttm("net_income", "2019-08-20")
        self.assertTrue(fact.available, fact.reason)
        self.assertAlmostEqual(fact.value, 44361000 + 12757000 + 22662000 + 39577000, delta=1000)

    def test_window_on_the_successor_basis_after_the_restating_filings_stays(self):
        _, _, _, resolver = build("DWSN15")
        fact = resolver.ttm("revenue", "2015-11-30")
        quarters = (("2014-10-01", "2014-12-31"), ("2015-01-01", "2015-03-31"), ("2015-04-01", "2015-06-30"),
                    ("2015-07-01", "2015-09-30"))
        expected = sum(sec_quarter("DWSN15", "SalesRevenueServicesNet", s, e, "2015-11-30", unit="USD")
                       for s, e in quarters)
        self.assertTrue(fact.available, fact.reason)
        self.assertAlmostEqual(fact.value, expected, delta=1)


if __name__ == "__main__":
    unittest.main()


def truncated_resolver(name, as_of):
    """Kern nur aus den bis as_of eingereichten Fakten (Kalender aus dem vollen Fixture, damit nur Werte und
    Klassenbelege verglichen werden)."""
    data = payload(name)
    cik = str(data["cik"]).zfill(10)
    _, calendar, _, _ = build(name)
    cut = json.loads(json.dumps(data))
    for taxonomy in cut["facts"].values():
        for concept in taxonomy.values():
            for unit, rows in concept["units"].items():
                concept["units"][unit] = [r for r in rows if r["filed"] <= as_of]
    _, values = fundamental_facts(SECProvider.__new__(SECProvider), cut)
    return PeriodResolver(normalize_company(cik, values, REGISTRY, calendar=calendar).factbook, REGISTRY)


class FTTM7PointInTimeEvidenceTests(unittest.TestCase):
    """Red team 1.23.0 R3 CRITICAL-1: die Klassenbelege einer Zelle kamen aus allen Einreichungen, auch aus solchen
    nach as_of. Ein PIT-TTM darf sich nicht aendern, wenn spaetere Einreichungen hinzukommen."""

    CASES = (
        # Apartment Income REIT (CIK 1820877): das Klassenpaar fuer Q3 2020 zeigt erst 10-Q 0000950170-21-002654
        # (2021-11-02, NetIncomeLoss +25.007.000 gegen ProfitLoss -24.815.000). Am 2021-08-20 nicht sichtbar.
        ("AIRC21", "2021-08-20", -84858000.0),
        # Bausch Health (CIK 885590): Q4 2010 = GJ minus neun Monate; das Klassenpaar kam erst mit dem 10-K vom
        # 2012-02-29. Am 2011-11-20 verfuegbar.
        ("BHC11", "2011-11-20", 72574000.0),
        # Mobiquity (CIK 1084267): Klassenpaar fuer Q2 2019 erst im 10-Q 0001683168-20-002444 (2020-07-31); am
        # 2019-11-20 ProfitLoss aus 10-Q 0001683168-19-003483.
        ("MOBQ19", "2019-11-20", -70667163.0),
    )

    def test_pit_ttm_uses_only_class_evidence_filed_by_as_of(self):
        for name, as_of, expected in self.CASES:
            _, _, _, resolver = build(name)
            fact = resolver.ttm("net_income", as_of)
            self.assertTrue(fact.available, (name, fact.reason))
            self.assertAlmostEqual(fact.value, expected, delta=1, msg=name)

    def test_pit_ttm_equals_the_core_built_from_filings_up_to_as_of(self):
        for name, as_of, _ in self.CASES:
            _, _, _, resolver = build(name)
            full, cut = resolver.ttm("net_income", as_of), truncated_resolver(name, as_of).ttm("net_income", as_of)
            self.assertEqual((full.available, full.value, full.reason), (cut.available, cut.value, cut.reason), name)


class FTTM7DerivedQuarterInOneClassTests(unittest.TestCase):
    """Red team 1.23.0 R3 MEDIUM-2: die klassenreine Lesung brach bei einem abgeleiteten Quartal ab."""

    def test_derived_quarter_is_derived_again_inside_the_class(self):
        # Goodyear (CIK 42582), PIT 2022-11-20: Q3 2022 44 Mio. (0000950170-22-020726), Q2 166 Mio. (-22-014987),
        # Q1 96 Mio. (-22-008036), Q4 2021 = GJ 764 Mio. (-22-001201) minus neun Monate 211 Mio. (-21-003186).
        _, _, _, resolver = build("GT22")
        fact = resolver.ttm("net_income", "2022-11-20")
        self.assertTrue(fact.available, fact.reason)
        self.assertAlmostEqual(fact.value, 44e6 + 166e6 + 96e6 + (764e6 - 211e6), delta=1)

    def test_class_without_every_quarter_falls_to_the_complete_class(self):
        # Lincoln Electric (CIK 59527), PIT 2011-11-20: Q3 2011 nur als ProfitLoss (10-Q 0001104659-11-058711);
        # klassenrein konsolidiert: Q4 2010 132.210.000 - 90.701.000, Q1 46.942.000, Q2 57.022.000, Q3 55.358.000.
        # Nicht ProfitLoss-neun-Monate minus NetIncomeLoss-Halbjahr.
        _, _, _, resolver = build("LECO11")
        fact = resolver.ttm("net_income", "2011-11-20")
        self.assertTrue(fact.available, fact.reason)
        self.assertAlmostEqual(fact.value, (132210000 - 90701000) + 46942000 + 57022000 + 55358000, delta=1)
