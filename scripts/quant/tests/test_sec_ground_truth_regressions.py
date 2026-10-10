"""Regressionstests aus dem Fundamental-Data-Integrity-Audit (echte SEC-companyfacts-Auszuege).

Jeder Test belegt einen bestaetigten Kernfehler (scripts/fundamentals-audit/artifacts/FUNDAMENTAL-ERRORS.json) mit der
von der SEC belegten Erwartung. Fixtures: scripts/quant/tests/fixtures/sec-real/*.json (oeffentliche SEC-Daten).
"""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from quant.sec.fiscal import FiscalCalendar  # noqa: E402
from quant.sec.normalize import normalize_company  # noqa: E402
from quant.sec.periods import PeriodResolver  # noqa: E402
from quant.sec.provider import PERIODIC_FORMS, SECProvider  # noqa: E402
from quant.sec.registry import MetricRegistry  # noqa: E402
from quant.sec.restatements import POLICY_AS_OF_LATEST, POLICY_ORIGINAL  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "sec-real"
FAR = "2099-12-31"


def build(name, drop=None):
    payload = json.loads((FIXTURES / f"{name}.json").read_text())
    if drop:
        for tax in payload["facts"].values():
            for body in tax.values():
                for unit, rows in body["units"].items():
                    body["units"][unit] = [row for row in rows if not drop(row)]
    payload["_retrieved_at"] = "2026-10-07T00:00:00+00:00"
    provider = SECProvider.__new__(SECProvider)
    cik = str(payload["cik"]).zfill(10)
    raw = list(provider.iter_raw_facts(payload, forms=PERIODIC_FORMS))
    calendar = FiscalCalendar.from_raw_facts(cik, raw)
    registry = MetricRegistry.load()
    result = normalize_company(cik, raw, registry, calendar=calendar)
    return calendar, PeriodResolver(result.factbook, registry)


def quarter(resolver, calendar, metric, period_end, as_of, policy=POLICY_AS_OF_LATEST):
    fiscal_year = calendar.fiscal_year_for(period_end)
    index = calendar.quarter_index(period_end)
    return resolver.quarter_grid(metric, fiscal_year, as_of, policy).get(index)


class SecGroundTruthRegressions(unittest.TestCase):
    def test_e1_eps_basic_and_diluted_tag_is_eps(self):
        """TNDM Q1 2020: SEC 10-Q vom 2020-04-30 meldet EarningsPerShareBasicAndDiluted = -0.25."""
        calendar, resolver = build("TNDM")
        for metric in ("eps_diluted", "eps_basic"):
            seen = quarter(resolver, calendar, metric, "2020-03-31", "2020-05-01")
            self.assertIsNotNone(seen, f"{metric}: am 2020-05-01 oeffentlich, VU sieht nichts")
            self.assertAlmostEqual(seen.value, -0.25, places=6)
            self.assertEqual(str(seen.period_end), "2020-03-31")
            # kein Lookahead: am Vortag der Einreichung unsichtbar
            self.assertIsNone(quarter(resolver, calendar, metric, "2020-03-31", "2020-04-29"))

    def test_e2_total_revenue_beats_contract_revenue_in_same_filing(self):
        """AMT Q3 2019: dieselbe Einreichung meldet Revenues 1.953,6 Mio. und Vertragsumsatz 137,3 Mio."""
        calendar, resolver = build("AMT")
        seen = quarter(resolver, calendar, "revenue", "2019-09-30", FAR, POLICY_ORIGINAL)
        self.assertIsNotNone(seen)
        self.assertAlmostEqual(seen.value, 1953600000.0, delta=1.0)

    def test_e3_fiscal_calendar_ignores_off_cycle_annual_disclosure(self):
        """DE: eine Steuersatz-Angabe fuer Kalenderjahr 2017 im 10-K FY2018 darf kein Geschaeftsjahresende erzeugen."""
        calendar, resolver = build("DE")
        self.assertEqual(calendar.quarter_index("2018-01-28"), 1)
        self.assertEqual(calendar.quarter_index("2018-04-29"), 2)
        self.assertEqual(calendar.quarter_index("2018-07-29"), 3)
        q1 = quarter(resolver, calendar, "eps_diluted", "2018-01-28", "2018-06-30")
        self.assertIsNotNone(q1)
        self.assertEqual(str(q1.period_end), "2018-01-28", "Q1-Abfrage darf nicht den April-Wert liefern")
        self.assertAlmostEqual(q1.value, -1.66, places=6)

    def test_e4_per_share_quarters_are_not_derived_from_cumulative_values(self):
        """REPL Q4 FY2021 (Ende 2021-03-31): SEC meldet -0.42; FY minus 9M ergaebe -0.41 und ist fuer EPS unzulaessig."""
        calendar, resolver = build("REPL")
        seen = quarter(resolver, calendar, "eps_diluted", "2021-03-31", FAR, POLICY_ORIGINAL)
        if seen is not None:
            self.assertEqual(getattr(seen.provenance, "transformation", "AS_REPORTED"), "AS_REPORTED")
            self.assertAlmostEqual(seen.value, -0.42, places=6)

    def test_e3b_fiscal_labels_stay_unique_across_new_year_52_53_week_drift(self):
        """CERN: Geschaeftsjahre enden 2010-01-02, 2011-01-01, 2011-12-31. Zwei Jahre duerfen nicht dasselbe Label tragen."""
        calendar, resolver = build("CERN")
        labels = [calendar.fiscal_year_for(end) for end in ("2010-01-02", "2011-01-01", "2011-12-31", "2012-12-29")]
        self.assertEqual(len(set(labels)), 4, f"doppelte Geschaeftsjahreslabels: {labels}")
        q1_2011 = quarter(resolver, calendar, "eps_diluted", "2011-04-02", FAR, POLICY_ORIGINAL)
        self.assertIsNotNone(q1_2011)
        self.assertEqual(str(q1_2011.period_end), "2011-04-02", "Abfrage Q1 2011 lieferte ein anderes Quartal")
        self.assertAlmostEqual(q1_2011.value, 0.75, places=6)

    def test_e9_foreign_currency_fact_does_not_beat_reporting_currency_concept(self):
        """CECO FY2025: der 10-K meldet Revenues = 750 Mio. EUR (in jeder Einreichung derselbe Betrag, kein Abschlusswert)
        und RevenueFromContractWithCustomerExcludingAssessedTax = 774,381 Mio. USD. Ein EUR-Betrag ist nicht der Umsatz
        eines in USD berichtenden Emittenten."""
        calendar, resolver = build("CECO")
        annual = resolver.annual("revenue", calendar.fiscal_year_for("2025-12-31"), FAR, POLICY_ORIGINAL)
        self.assertIsNotNone(annual)
        self.assertAlmostEqual(annual.value, 774381000.0, delta=1.0)
        self.assertEqual(annual.unit, "USD")
        q2 = quarter(resolver, calendar, "revenue", "2026-06-30", FAR, POLICY_ORIGINAL)
        self.assertIsNotNone(q2)
        self.assertAlmostEqual(q2.value, 284961000.0, delta=1.0)

    def test_e2r_revenues_smaller_than_contract_revenue_is_not_the_total(self):
        """Gegenprobe zu E2 (gefunden in der Consumer-Wirkungsanalyse): manche Einreicher taggen einen Teilbetrag als
        us-gaap:Revenues. FLS meldet in jedem 10-Q Revenues = 0 neben 1.169,175 Mio. Vertragsumsatz (Q2 2026);
        PESI meldet im 10-K FY2025 Revenues = 642.000 neben 61,674 Mio. Vertragsumsatz. Ein Gesamtbetrag ist nie
        kleiner als ein Teilbetrag derselben Einreichung."""
        calendar, resolver = build("FLS")
        q2 = quarter(resolver, calendar, "revenue", "2026-06-30", FAR, POLICY_ORIGINAL)
        self.assertIsNotNone(q2)
        self.assertAlmostEqual(q2.value, 1169175000.0, delta=1.0)
        calendar, resolver = build("PESI")
        fy = resolver.annual("revenue", calendar.fiscal_year_for("2025-12-31"), FAR, POLICY_ORIGINAL)
        self.assertIsNotNone(fy)
        self.assertAlmostEqual(fy.value, 61674000.0, delta=1.0)
        q4 = quarter(resolver, calendar, "revenue", "2025-12-31", FAR, POLICY_ORIGINAL)
        self.assertIsNotNone(q4)
        self.assertAlmostEqual(q4.value, 61674000.0 - 45959000.0, delta=1.0)

    def test_e2r_revenues_total_still_beats_contract_subset(self):
        """AMT bleibt korrigiert: Revenues (1.953,6 Mio.) ist groesser als der Vertragsumsatz (137,3 Mio.) und ist der Gesamtumsatz."""
        calendar, resolver = build("AMT")
        seen = quarter(resolver, calendar, "revenue", "2019-09-30", FAR, POLICY_ORIGINAL)
        self.assertAlmostEqual(seen.value, 1953600000.0, delta=1.0)

    def test_e10_derived_quarter_never_subtracts_two_concepts(self):
        """NTRS FY2025: der 10-K meldet Revenues 8.086,4 Mio. (Gesamtertrag) UND Vertragsumsatz 5.017,8 Mio.; die 10-Qs
        nur den Vertragsumsatz (9M 3.710,4 Mio.). Q4 = Gesamtertrag minus 9M-Vertragsumsatz = 4.376 Mio. ist kein Quartal.
        Abgeleitet wird ueber das Konzept, das beide Kumulwerte melden: 5.017,8 - 3.710,4 = 1.307,4 Mio."""
        calendar, resolver = build("NTRS")
        fy = resolver.annual("revenue", calendar.fiscal_year_for("2025-12-31"), FAR, POLICY_ORIGINAL)
        self.assertAlmostEqual(fy.value, 8086400000.0, delta=1.0)
        q4 = quarter(resolver, calendar, "revenue", "2025-12-31", FAR, POLICY_ORIGINAL)
        self.assertIsNotNone(q4)
        self.assertAlmostEqual(q4.value, 5017800000.0 - 3710400000.0, delta=1.0)
        self.assertEqual(q4.provenance.concept, "RevenueFromContractWithCustomerExcludingAssessedTax")
        q3 = quarter(resolver, calendar, "revenue", "2025-09-30", FAR, POLICY_ORIGINAL)
        self.assertAlmostEqual(q3.value, 1265500000.0, delta=1.0)

    def test_e10_tag_switch_without_evidence_of_a_difference_still_derives(self):
        """NVDA FY2021: der 10-K meldet nur den Vertragsumsatz (16.675 Mio.), die 10-Qs nur Revenues (9M 11.672 Mio.).
        Kein Beleg, dass die beiden Tags verschiedene Groessen sind -> Q4 = 5.003 Mio. (SEC-Ground-Truth)."""
        calendar, resolver = build("NVDA")
        q4 = quarter(resolver, calendar, "revenue", "2021-01-31", FAR, POLICY_ORIGINAL)
        self.assertIsNotNone(q4)
        self.assertAlmostEqual(q4.value, 5003000000.0, delta=1.0)

    def test_e2r_net_total_revenue_below_contract_revenue_is_kept(self):
        """UPST Q2 2022 (10-Q 0001647639-22-000049): Revenues 228.162 Tsd. = Vertragsumsatz 258.345 Tsd. +
        RevenueNotFromContractWithCustomer -30.183 Tsd. Der Gesamtumsatz ist kleiner als der Vertragsumsatz, weil ein
        Bestandteil negativ ist - er ist kein Teilbetrag."""
        calendar, resolver = build("UPST")
        q2 = quarter(resolver, calendar, "revenue", "2022-06-30", FAR, POLICY_ORIGINAL)
        self.assertIsNotNone(q2)
        self.assertAlmostEqual(q2.value, 228162000.0, delta=1.0)
        self.assertEqual(q2.provenance.concept, "Revenues")

    def test_e4_unreported_eps_quarter_stays_missing(self):
        """Derselbe REPL-Auszug ohne die gemeldeten Q4-Dreimonatswerte: kein FY - 9M fuer EPS, die Luecke bleibt."""
        def q4_eps(row):
            return row.get("end") == "2021-03-31" and row.get("start") == "2021-01-01"
        calendar, resolver = build("REPL", drop=q4_eps)
        self.assertIsNone(quarter(resolver, calendar, "eps_diluted", "2021-03-31", FAR, POLICY_ORIGINAL))
        # additive Groessen werden weiter aus Kumulwerten rekonstruiert (unveraendert)
        self.assertIsNotNone(quarter(resolver, calendar, "net_income", "2021-03-31", FAR, POLICY_ORIGINAL))


if __name__ == "__main__":
    unittest.main()
