"""Kern 1.22.0: F-TTM-6 - Korrekturen und Erstveroeffentlichungen in Uebergangsberichten (10-KT, 10-KT/A).

Gefunden in der Nachbarsuche zu Kern 1.21.0 (artifacts/FUNDAMENTAL-TTM-121-NEIGHBOR-SEARCH.json, newDefect F-TTM-6),
ausserhalb des Holdouts v4 (der Holdout bleibt FAIL und validiert diese Version nicht).
Echte SEC-companyfacts-Auszuege: scripts/quant/tests/fixtures/sec-real/{OA,EIGHTPOINT3,SWK}.json.

Orbital ATK (CIK 866121, OA): Geschaeftsjahreswechsel 31.03. -> 31.12.; 10-KT 0000866121-16-000064 (2016-03-15) fuer
den Uebergangszeitraum 2015-04-01..2015-12-31; 10-KT/A 0000866121-17-000005 (2017-02-24) mit Restatement des
Geschaeftsjahres 2014-04-01..2015-03-31 (XBRL-Instanz der Einreichung geprueft: jeder korrigierte Wert steht neben
seinem ScenarioPreviouslyReportedMember-Fakt). Q1 2014-04-01..2014-06-29 verwaessert: 10-Q 2014-08-08 2,59 ->
10-KT/A 2,50; kein spaeterer 10-K/10-Q meldet das Quartal erneut. Geschaeftsjahr bis 2015-03-31: 10-K 2015-06-01
5,60 -> 10-KT/A 5,39 (erst der 10-K 2017-04-28 wiederholt 5,39).
8point3 Energy Partners (CIK 1635581): 10-KT 0001564590-16-012046 (2016-01-28) veroeffentlicht das verkuerzte
Geschaeftsjahr 2014-12-29..2015-11-30 (EPS 0,94) zuerst; der naechste Bericht mit diesem Zeitraum ist der 10-K
2017-01-26.
Ursache: Werte kamen nur aus provider.PERIODIC_FORMS (ohne 10-KT/10-KT/A); 1.21.0 las Uebergangsberichte nur fuer
den Kalender. Zusaetzlich sah die Aenderungserkennung (pipeline.latest_filing_signature, daily.WATCHED_FORMS) einen
neuen 10-KT/A nicht, und AMENDMENT_FORMS kannte ihn nicht.
"""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from quant.sec import daily, provider as provider_module  # noqa: E402
from quant.sec.consumer import build_consumer_bundle  # noqa: E402
from quant.sec.fiscal import FiscalCalendar  # noqa: E402
from quant.sec.normalize import normalize_company  # noqa: E402
from quant.sec.pipeline import IngestionPipeline  # noqa: E402
from quant.sec.registry import MetricRegistry  # noqa: E402
from quant.sec.provider import SECProvider, fundamental_facts  # noqa: E402
from quant.sec.restatements import POLICY_AS_OF_LATEST, POLICY_LATEST_KNOWN  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "sec-real"
REGISTRY = MetricRegistry.load()
OA_10KT = "0000866121-16-000064"
OA_10KTA = "0000866121-17-000005"
EP3_10KT = "0001564590-16-012046"
_PAYLOADS = {}


def payload(name):
    if name not in _PAYLOADS:
        _PAYLOADS[name] = json.loads((FIXTURES / f"{name}.json").read_text())
    return _PAYLOADS[name]


def bundle(name, as_of, policy=POLICY_AS_OF_LATEST):
    data = payload(name)
    return build_consumer_bundle(data["cik"], data, REGISTRY, as_of=as_of, policy=policy,
                                 quarters=80, annual_years=40)


def row(rows, period_end):
    """[fy, fp, end, value, filed, accession, derived] der Zeile mit diesem Periodenende, sonst None."""
    hits = [r for r in rows if r[2] == period_end]
    return hits[-1] if hits else None


def sec_value(name, concept, start, end, as_of, forms):
    """Unabhaengig vom Kern: juengste SEC-Fassung des Zeitraums start..end mit filed <= as_of aus `forms`."""
    rows = [r for r in payload(name)["facts"]["us-gaap"][concept]["units"]["USD/shares"]
            if r.get("start") == start and r["end"] == end and r["filed"] <= as_of and r["form"] in forms]
    return max(rows, key=lambda r: (r["filed"], r["accn"])) if rows else None


ALL_REPORTS = {"10-K", "10-K/A", "10-Q", "10-Q/A", "10-KT", "10-KT/A"}


class TransitionAmendmentCorrectionTests(unittest.TestCase):
    """Orbital ATK: die Korrektur steht ausschliesslich im 10-KT/A."""

    def test_pit_before_amendment_keeps_original_value(self):
        quarter = row(bundle("OA", "2017-02-23")["quarterly"]["eps_diluted"], "2014-06-29")
        self.assertEqual(quarter[3], 2.59)
        self.assertEqual(sec_value("OA", "EarningsPerShareDiluted", "2014-04-01", "2014-06-29", "2017-02-23",
                                   ALL_REPORTS)["val"], 2.59)

    def test_pit_from_amendment_acceptance_uses_corrected_value(self):
        truth = sec_value("OA", "EarningsPerShareDiluted", "2014-04-01", "2014-06-29", "2017-02-24", ALL_REPORTS)
        self.assertEqual((truth["val"], truth["form"], truth["accn"]), (2.5, "10-KT/A", OA_10KTA))
        quarter = row(bundle("OA", "2017-02-24")["quarterly"]["eps_diluted"], "2014-06-29")
        self.assertEqual((quarter[3], quarter[4], quarter[5]), (2.5, "2017-02-24", OA_10KTA))

    def test_latest_restated_uses_corrected_value(self):
        quarter = row(bundle("OA", "2099-12-31", POLICY_LATEST_KNOWN)["quarterly"]["eps_diluted"], "2014-06-29")
        self.assertEqual((quarter[3], quarter[5]), (2.5, OA_10KTA))

    def test_annual_correction_visible_from_amendment_not_from_later_10k(self):
        before = row(bundle("OA", "2017-02-23")["annual"]["eps_diluted"], "2015-03-31")
        after = row(bundle("OA", "2017-02-24")["annual"]["eps_diluted"], "2015-03-31")
        self.assertEqual(before[3], 5.6)
        self.assertEqual((after[3], after[5]), (5.39, OA_10KTA))

    def test_quarterly_amendment_still_applies_from_its_own_date(self):
        # 10-Q/A 0000866121-17-000015 (2017-04-03): 2016-01-01..2016-04-03 1,19 -> 1,31.
        before = row(bundle("OA", "2017-04-02")["quarterly"]["eps_diluted"], "2016-04-03")
        after = row(bundle("OA", "2017-04-03")["quarterly"]["eps_diluted"], "2016-04-03")
        self.assertEqual((before[3], after[3], after[5]), (1.19, 1.31, "0000866121-17-000015"))


class TransitionPeriodSemanticsTests(unittest.TestCase):
    """Uebergangszeitraeume bekommen durch den 10-KT keine normale Jahres-/Quartalssemantik."""

    def test_short_transition_period_is_no_fiscal_year_and_has_no_quarter_slots(self):
        b = bundle("OA", "2099-12-31", POLICY_LATEST_KNOWN)
        # 2015-04-01..2015-12-31 (275 Tage): kein Jahreswert, keine Quartale im Uebergangszeitraum.
        self.assertIsNone(row(b["annual"]["eps_diluted"], "2015-12-31"))
        for end in ("2015-07-05", "2015-10-04", "2015-12-31"):
            self.assertIsNone(row(b["quarterly"]["eps_diluted"], end), end)

    def test_shortened_fiscal_year_first_published_in_10kt_is_visible_from_10kt(self):
        # 8point3: 336-Tage-Geschaeftsjahr 2014-12-29..2015-11-30 (gelabelt 2015, verkuerztes Jahr).
        truth = sec_value("EIGHTPOINT3", "EarningsPerShareDiluted", "2014-12-29", "2015-11-30", "2016-02-01", ALL_REPORTS)
        self.assertEqual((truth["val"], truth["form"]), (0.94, "10-KT"))
        annual = row(bundle("EIGHTPOINT3", "2016-02-01")["annual"].get("eps_diluted", []), "2015-11-30")
        self.assertIsNotNone(annual)
        self.assertEqual((annual[0], annual[1], annual[3], annual[5]), (2015, "FY", 0.94, EP3_10KT))

    def test_nothing_from_10kt_before_its_filing_date(self):
        self.assertIsNone(row(bundle("EIGHTPOINT3", "2016-01-27")["annual"].get("eps_diluted", []), "2015-11-30"))


class TransitionReportPeriodIdentityTests(unittest.TestCase):
    """Dthera Sciences (CIK 1586372): Geschaeftsjahresende 30.06. -> 31.12. (Reverse Merger). Der 10-QT
    0001683168-16-...(2016-11-21) und sein 10-QT/A (2017-04-17) melden neben dem Quartal 2015-07-01..09-30 (korrigiert
    0 -> -0,01) die neun Monate 2015-01-01..2015-09-30 auf der Basis des alten Kalenderjahres. Mit 10-K-Semantik landete
    dieser Zeitraum in YTD3 des Geschaeftsjahres 2016 (Juli 2015 - Maerz 2016) und ersetzte als juengste Einreichung den
    richtigen Zeitraum."""

    @classmethod
    def setUpClass(cls):
        data = payload("DTHERA")
        cik = str(data["cik"]).zfill(10)
        calendar_facts, values = fundamental_facts(SECProvider.__new__(SECProvider), data)
        cls.calendar = FiscalCalendar.from_raw_facts(cik, calendar_facts)
        cls.factbook = normalize_company(cik, values, REGISTRY, calendar=cls.calendar).factbook

    def test_old_basis_period_from_10qt_does_not_enter_the_new_years_cell(self):
        year = self.calendar.fiscal_year_for("2016-03-31")
        latest = self.factbook.resolve("eps_diluted", year, "YTD3", policy=POLICY_LATEST_KNOWN)
        self.assertEqual((str(latest.period_start)[:10], str(latest.period_end)[:10], latest.form),
                         ("2015-07-01", "2016-03-31", "10-Q"))
        periods = {(str(o.period_start)[:10], str(o.period_end)[:10])
                   for o in self.factbook.get("eps_diluted", year, "YTD3").observations}
        self.assertNotIn(("2015-01-01", "2015-09-30"), periods)

    def test_same_period_correction_in_10qt_amendment_is_applied(self):
        year, index = self.calendar.fiscal_year_for("2015-09-30"), self.calendar.quarter_index("2015-09-30")
        cell = f"Q{index}"
        before = self.factbook.resolve("eps_diluted", year, cell, as_of="2016-11-20")
        after = self.factbook.resolve("eps_diluted", year, cell, as_of="2099-12-31")
        self.assertEqual((before.value, before.form), (0.0, "10-Q"))
        self.assertEqual((after.value, after.form), (-0.01, "10-QT/A"))


class GeneralAmendmentPolicyTests(unittest.TestCase):
    """Eine Amendment-Regel fuer alle periodischen und Uebergangsformulare."""

    def test_amendment_forms_cover_every_value_form_amendment(self):
        for form in ("10-K/A", "10-Q/A", "20-F/A", "40-F/A", "10-KT/A"):
            self.assertIn(form, provider_module.AMENDMENT_FORMS, form)

    def test_annual_amendment_10k_a_from_acceptance(self):
        # Stanley Black & Decker 10-K/A 0000093556-22-000004 (2022-01-31): FY2020 EPS 7,77 -> 7,46.
        before = row(bundle("SWK", "2022-01-30")["annual"]["eps_diluted"], "2021-01-02")
        after = row(bundle("SWK", "2022-01-31")["annual"]["eps_diluted"], "2021-01-02")
        self.assertEqual((before[3], after[3], after[5]), (7.77, 7.46, "0000093556-22-000004"))

    def test_change_detector_sees_a_new_transition_amendment(self):
        rows = [
            {"accession": "0000866121-17-000005", "form": "10-KT/A", "filing_date": "2017-02-24",
             "acceptance_datetime": "2017-02-24T16:05:12.000Z"},
            {"accession": "0000866121-16-000083", "form": "10-Q", "filing_date": "2016-05-09",
             "acceptance_datetime": "2016-05-09T16:01:00.000Z"},
        ]
        signature = IngestionPipeline.latest_filing_signature(IngestionPipeline.__new__(IngestionPipeline), rows)
        self.assertEqual(signature["accession"], "0000866121-17-000005")

    def test_daily_watch_includes_transition_reports(self):
        for form in ("10-KT", "10-KT/A"):
            self.assertIn(form, daily.WATCHED_FORMS, form)


if __name__ == "__main__":
    unittest.main()
