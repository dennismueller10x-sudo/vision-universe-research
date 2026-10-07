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


def build(name):
    payload = json.loads((FIXTURES / f"{name}.json").read_text())
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


if __name__ == "__main__":
    unittest.main()
