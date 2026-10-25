"""An annual report's forward-looking year is not a fiscal year.

SYNTHETIC: every number and CIK below is invented. Modelled on Nutrien's 40-F
for 2020 (filed 26.02.2021), which tags commitments for 2021-01-01..2021-12-31.
Taken as a year end, that period made 2021 the fiscal year "2020", shifted every
later label by one and, from the 40-F for 2025, added a phantom year 2026.
"""
import logging
import unittest

from quant.sec.fiscal import FiscalCalendar
from quant.sec.provider import PERIODIC_FORMS, SECProvider
from quant.tests.fixtures import FactsBuilder

CIK = 2000000099


def payload(with_commitments):
    builder = FactsBuilder(CIK)
    for year in range(2020, 2026):
        accn, filed = f"0000000099-{year + 1 - 2000}-000001", f"{year + 1}-02-27"
        builder.add("us-gaap", "Revenues", "USD", 1000.0 + year, f"{year}-12-31", f"{year}-01-01",
                    accn, "10-K", filed, fy=year, fp="FY")
        builder.add("us-gaap", "Revenues", "USD", 900.0 + year, f"{year - 1}-12-31", f"{year - 1}-01-01",
                    accn, "10-K", filed, fy=year, fp="FY")
        if with_commitments:
            builder.add("us-gaap", "PurchaseObligationDueInNextTwelveMonths", "USD", 50.0,
                        f"{year + 1}-12-31", f"{year + 1}-01-01", accn, "10-K", filed, fy=year, fp="FY")
    return builder.company_facts()


def calendar(company_facts):
    raw = list(SECProvider.iter_raw_facts(SECProvider.__new__(SECProvider), company_facts,
                                          availability={}, forms=PERIODIC_FORMS))
    return FiscalCalendar.from_raw_facts(CIK, raw).to_dict()["fiscal_years"]


class FutureFiscalPeriodsTest(unittest.TestCase):
    def setUp(self):
        logging.disable(logging.WARNING)
        self.addCleanup(logging.disable, logging.NOTSET)

    def test_a_coming_year_in_an_annual_report_is_not_a_year_end(self):
        clean = calendar(payload(with_commitments=False))
        self.assertEqual(calendar(payload(with_commitments=True)), clean)
        self.assertEqual(clean[-1], {"fiscal_year": 2025, "period_end": "2025-12-31"})
        self.assertTrue(all(int(y["period_end"][:4]) == y["fiscal_year"] for y in clean))


if __name__ == "__main__":
    unittest.main()
