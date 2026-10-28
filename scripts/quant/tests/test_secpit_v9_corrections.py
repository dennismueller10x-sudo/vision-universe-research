"""V9 SEC/PIT corrections P1-P3 as regressions on SYNTHETIC issuers.

Every number and CIK below is invented. The PATTERNS are the ones V9 measured
on the SEC bulk archive (docs/quant-recovery/v9/secpit on the V9 branch):

  P1  an annual filing's own `fy` far from the year its period ends in:
      Excel serial dates (PRTH 43465/43830), a transposition (WTBA 2107),
      a +2 error (STX 2027 for the year ending 2025-06-27), and filings whose
      companyfacts annual durations end two years before their own
      DocumentPeriodEndDate (PLD 2008 -> 2010, TRU 2012 -> 2014).
  P2  facts whose period ends after the filing became available: forward
      maturity schedules (PMT), a dividend declared for the next quarter, a
      cover date after acceptance (ASLE 2034-03-05 in a filing of 2024).
  P3  PIT availability never from the bulk submissions archive.
"""
import logging
import re
import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from quant.sec import consumer, quality  # noqa: E402
from quant.sec.fiscal import (
    FiscalCalendar, REJECTED_IMPLAUSIBLE_FILING_FY, REJECTED_LABEL_NOT_INCREASING,
)
from quant.sec.model import ACCEPTANCE_SOURCE_API, ACCEPTANCE_SOURCE_BULK_SUBMISSIONS
from quant.sec.normalize import (
    ISSUE_FUTURE_PERIOD_END, build_availability_map, normalize_company,
)
from quant.sec.provider import PERIODIC_FORMS, SECProvider
from quant.sec.registry import MetricRegistry
from quant.tests.fixtures import FactsBuilder

REGISTRY = MetricRegistry.load()


def raw_facts(company_facts, availability=None):
    return list(SECProvider.iter_raw_facts(SECProvider.__new__(SECProvider), company_facts,
                                           availability=availability or {}, forms=PERIODIC_FORMS))


def annual_filer(cik, year_ends, claimed_fy=None, own_ends=None, filed_after_days=50):
    """One 10-K per year end: the year's revenue and the prior year's comparative.

    claimed_fy maps a year end to the `fy` its own 10-K carries (default: its
    year). own_ends maps a year end to the annual period ends that 10-K's
    companyfacts entries actually carry (default: itself and the prior year).
    """
    claimed_fy = claimed_fy or {}
    own_ends = own_ends or {}
    builder = FactsBuilder(cik)
    for index, end in enumerate(year_ends):
        filed = date.fromordinal(end.toordinal() + filed_after_days)
        accn = f"0000{cik % 100000:05d}-{end.year % 100:02d}-{index:06d}"
        fy = claimed_fy.get(end, end.year)
        ends = own_ends.get(end)
        if ends is None:
            ends = [end] + ([year_ends[index - 1]] if index else [])
        for period_end in ends:
            start = date.fromordinal(period_end.toordinal() - 364)
            builder.add("us-gaap", "Revenues", "USD", 1000.0 + period_end.year, period_end, start,
                        accn, "10-K", filed, fy=fy, fp="FY")
            builder.add("us-gaap", "Assets", "USD", 5000.0 + period_end.year, period_end, None,
                        accn, "10-K", filed, fy=fy, fp="FY")
    return builder


def calendar_of(builder, cik):
    return FiscalCalendar.from_raw_facts(cik, raw_facts(builder.company_facts()))


def labels(calendar):
    return {row["period_end"]: row["fiscal_year"] for row in calendar.to_dict()["fiscal_years"]}


class QuietTest(unittest.TestCase):
    def setUp(self):
        logging.disable(logging.WARNING)
        self.addCleanup(logging.disable, logging.NOTSET)


# ----------------------------------------------------------------------- P1

class ImplausibleFilingFyTest(QuietTest):
    DEC_ENDS = [date(year, 12, 31) for year in range(2015, 2023)]

    def assert_labels_follow_end_year(self, calendar):
        for end, label in labels(calendar).items():
            self.assertEqual(label, int(end[:4]), f"year ending {end} labelled {label}")

    def rejected(self, calendar, reason):
        return [row for row in calendar.to_dict()["rejected_anchors"] if row["reason"] == reason]

    def test_excel_serial_fiscal_years_are_refused(self):
        """PRTH: 10-Ks for 2018 and 2019 tagged fy=43465 and fy=43830."""
        cik = 2000000901
        cal = calendar_of(annual_filer(cik, self.DEC_ENDS, claimed_fy={
            date(2018, 12, 31): 43465, date(2019, 12, 31): 43830}), cik)
        self.assert_labels_follow_end_year(cal)
        refused = self.rejected(cal, REJECTED_IMPLAUSIBLE_FILING_FY)
        self.assertEqual([(r["period_end"], r["filing_claimed_fy"], r["used_fy"]) for r in refused],
                         [("2018-12-31", 43465, 2018), ("2019-12-31", 43830, 2019)])
        # Before the bound the 2020 anchor was refused as "not increasing".
        self.assertEqual(self.rejected(cal, REJECTED_LABEL_NOT_INCREASING), [])

    def test_a_transposed_fiscal_year_is_refused(self):
        """WTBA: the 10-K for 2017 tagged fy=2107."""
        cik = 2000000902
        cal = calendar_of(annual_filer(cik, self.DEC_ENDS, claimed_fy={date(2017, 12, 31): 2107}), cik)
        self.assert_labels_follow_end_year(cal)
        self.assertEqual(len(self.rejected(cal, REJECTED_IMPLAUSIBLE_FILING_FY)), 1)

    def test_a_fiscal_year_two_ahead_is_refused_and_the_next_year_keeps_its_label(self):
        """STX: 52/53-week year ending 2025-06-27 tagged fy=2027; 2026-07-03 tagged 2026."""
        cik = 2000000903
        ends = [date(2021, 7, 2), date(2022, 7, 1), date(2023, 6, 30), date(2024, 6, 28),
                date(2025, 6, 27), date(2026, 7, 3)]
        cal = calendar_of(annual_filer(cik, ends, claimed_fy={date(2025, 6, 27): 2027}), cik)
        got = labels(cal)
        self.assertEqual(got["2025-06-27"], 2025)
        self.assertEqual(got["2026-07-03"], 2026)
        self.assertEqual(self.rejected(cal, REJECTED_LABEL_NOT_INCREASING), [])
        self.assertEqual([(r["period_end"], r["filing_claimed_fy"]) for r in
                          self.rejected(cal, REJECTED_IMPLAUSIBLE_FILING_FY)], [("2025-06-27", 2027)])

    def test_an_anchor_from_durations_two_years_before_the_document_period_is_refused(self):
        """PLD/TRU: the 10-K for 2010 (fy=2010) whose companyfacts annual durations
        end only on 2008-12-31 - its anchor end lies two years before its own
        DocumentPeriodEndDate. The plausible 10-K for 2008 keeps that year."""
        cik = 2000000904
        ends = [date(2006, 12, 31), date(2007, 12, 31), date(2008, 12, 31), date(2009, 12, 31)]
        builder = annual_filer(cik, ends)
        # The odd filing: filed 2011-02-18, fy 2010, durations ending 2008 and 2007.
        for period_end in (date(2008, 12, 31), date(2007, 12, 31)):
            builder.add("us-gaap", "Revenues", "USD", 1.0, period_end,
                        date(period_end.year, 1, 1), "0000000904-11-000001", "10-K", "2011-02-18",
                        fy=2010, fp="FY")
        cal = calendar_of(builder, cik)
        self.assert_labels_follow_end_year(cal)
        refused = self.rejected(cal, REJECTED_IMPLAUSIBLE_FILING_FY)
        self.assertEqual([(r["period_end"], r["filing_claimed_fy"], r["used_fy"]) for r in refused],
                         [("2008-12-31", 2010, 2008)])
        self.assertEqual(self.rejected(cal, REJECTED_LABEL_NOT_INCREASING), [])
        # And the facts follow: 2008 revenue is fiscal year 2008, nothing is labelled 2010.
        result = normalize_company(cik, raw_facts(builder.company_facts()), REGISTRY, calendar=cal)
        years = {fy for (_, fy, _) in result.factbook.timelines}
        self.assertIn(2008, years)
        self.assertNotIn(2010, years)

    def test_conventions_within_one_year_are_still_honoured(self):
        """Target-style (-1) and a filer naming the following year (+1) are not refused."""
        for offset, cik in ((-1, 2000000905), (1, 2000000906)):
            ends = [date(year, 1, 31) for year in range(2016, 2022)]
            cal = calendar_of(annual_filer(cik, ends, claimed_fy={e: e.year + offset for e in ends}), cik)
            self.assertEqual(cal.label_offset, offset)
            self.assertEqual(cal.rejected_anchors, [])
            self.assertTrue(all(label == int(end[:4]) + offset for end, label in labels(cal).items()))

    def test_an_implausible_anchor_does_not_vote_for_the_offset(self):
        """Two serial-date anchors must not outvote the plausible ones."""
        cik = 2000000907
        ends = [date(year, 12, 31) for year in range(2018, 2022)]
        cal = calendar_of(annual_filer(cik, ends, claimed_fy={
            ends[0]: 43465, ends[1]: 43830, ends[2]: 44196}), cik)
        self.assertEqual(cal.label_offset, 0)
        self.assert_labels_follow_end_year(cal)

    def test_the_refusal_is_visible_in_the_quality_report_and_the_consumer_bundle(self):
        cik = 2000000908
        builder = annual_filer(cik, self.DEC_ENDS, claimed_fy={date(2017, 12, 31): 2107})
        raws = raw_facts(builder.company_facts())
        result = normalize_company(cik, raws, REGISTRY)
        findings, summary = quality.run_all(raws, result.factbook, REGISTRY, result.issues)
        self.assertEqual(summary["by_code"].get(REJECTED_IMPLAUSIBLE_FILING_FY), 1)
        finding = next(f for f in findings if f["code"] == REJECTED_IMPLAUSIBLE_FILING_FY)
        self.assertEqual(finding["severity"], quality.SEVERITY_WARNING)
        self.assertEqual((finding["end"], finding["filing_claimed_fy"], finding["fiscal_year"]),
                         ("2017-12-31", 2107, 2017))
        bundle = consumer.build_consumer_bundle(cik, builder.company_facts(), REGISTRY, as_of="2026-10-26")
        self.assertEqual(bundle["quality"]["implausibleFilingFy"],
                         [{"periodEnd": "2017-12-31", "filingClaimedFy": 2107, "usedFy": 2017}])
        self.assertEqual(max(bundle["coverage"]["annualYears"]), 2022)
        self.assertEqual(consumer.summarize_bundle(bundle)["implausibleFilingFy"], 1)


# ----------------------------------------------------------------------- P2

class FuturePeriodQuarantineTest(QuietTest):
    CIK = 2000000911

    def builder(self):
        """FY2022-FY2023 10-Ks and a Q1-2024 10-Q, plus the future-dated facts."""
        b = FactsBuilder(self.CIK)
        k22, k23, q124 = "0000000911-23-000001", "0000000911-24-000001", "0000000911-24-000002"
        for accn, end, filed in ((k22, date(2022, 12, 31), "2023-02-20"),
                                 (k23, date(2023, 12, 31), "2024-03-27")):
            for period_end in (end, date(end.year - 1, 12, 31)):
                b.add("us-gaap", "Revenues", "USD", 100.0 * period_end.year, period_end,
                      date(period_end.year, 1, 1), accn, "10-K", filed, fy=end.year, fp="FY")
                b.add("us-gaap", "LongTermDebtNoncurrent", "USD", 7.0 * period_end.year, period_end, None,
                      accn, "10-K", filed, fy=end.year, fp="FY")
        b.add("us-gaap", "Revenues", "USD", 555.0, date(2024, 3, 31), date(2024, 1, 1), q124, "10-Q",
              "2024-05-06", fy=2024, fp="Q1")
        b.add("us-gaap", "CommonStockDividendsPerShareDeclared", "USD/shares", 0.25, date(2024, 3, 31),
              date(2024, 1, 1), q124, "10-Q", "2024-05-06", fy=2024, fp="Q1")
        # Forward schedule (PMT-like): maturities in the 10-K for 2023.
        for year in (2025, 2026, 2027, 2028):
            b.add("us-gaap", "LongTermDebt", "USD", 1000.0 + year, date(year, 12, 31), None,
                  k23, "10-K", "2024-03-27", fy=2023, fp="FY")
        # Dividend declared in the Q1 10-Q for the quarter that has not ended yet.
        b.add("us-gaap", "CommonStockDividendsPerShareDeclared", "USD/shares", 0.30, date(2024, 6, 30),
              date(2024, 4, 1), q124, "10-Q", "2024-05-06", fy=2024, fp="Q1")
        # Cover dates of the 10-K for 2023 (filed 2024-03-27): a legitimate one and
        # an ASLE-like typo ten years ahead; a second typo a few days after filing
        # that the cover-date logic would otherwise place into Q1 2024.
        b.add("dei", "EntityCommonStockSharesOutstanding", "shares", 47_000_000.0, date(2024, 3, 20),
              None, k23, "10-K", "2024-03-27", fy=2023, fp="FY")
        b.add("dei", "EntityCommonStockSharesOutstanding", "shares", 52_000_000.0, date(2034, 3, 5),
              None, k23, "10-K", "2024-03-27", fy=2023, fp="FY")
        b.add("dei", "EntityCommonStockSharesOutstanding", "shares", 53_000_000.0, date(2024, 4, 5),
              None, k23, "10-K", "2024-03-27", fy=2023, fp="FY")
        return b

    def normalized(self, filing_metadata=None):
        b = self.builder()
        availability = build_availability_map(filing_metadata)
        raws = raw_facts(b.company_facts(), availability)
        return raws, normalize_company(self.CIK, raws, REGISTRY, filing_metadata=filing_metadata)

    def observations(self, result):
        for (metric, fy, fp), timeline in result.factbook.timelines.items():
            for obs in timeline.observations:
                yield metric, fy, fp, obs

    def test_no_observation_ends_after_it_became_available(self):
        _, result = self.normalized()
        for metric, fy, fp, obs in self.observations(result):
            known = max(str(obs.available_from or obs.filed)[:10], str(obs.filed)[:10])
            self.assertLessEqual(str(obs.period_end)[:10], known, (metric, fy, fp, obs.period_end))

    def test_a_forward_schedule_is_quarantined_not_published(self):
        _, result = self.normalized()
        years = {fy for (metric, fy, _) in result.factbook.timelines if metric == "long_term_debt"}
        self.assertEqual(years, {2021, 2022, 2023})
        quarantined = [i for i in result.issues if i["code"] == ISSUE_FUTURE_PERIOD_END
                       and i["metric"] == "long_term_debt"]
        self.assertEqual(sorted(i["end"] for i in quarantined),
                         ["2025-12-31", "2026-12-31", "2027-12-31", "2028-12-31"])

    def test_a_dividend_declared_for_a_later_quarter_is_quarantined(self):
        _, result = self.normalized()
        cells = {(fy, fp): [o.value for o in tl.observations]
                 for (metric, fy, fp), tl in result.factbook.timelines.items()
                 if metric == "dividends_declared_per_share"}
        self.assertEqual(cells, {(2024, "Q1"): [0.25]})

    def test_a_cover_date_after_acceptance_is_quarantined_not_redated(self):
        _, result = self.normalized()
        shares = [(fy, fp, obs.value, obs.period_end) for metric, fy, fp, obs in self.observations(result)
                  if metric == "shares_outstanding"]
        values = {value for _, _, value, _ in shares}
        self.assertIn(47_000_000.0, values, "the legitimate cover date stays")
        for typo in (52_000_000.0, 53_000_000.0):
            self.assertNotIn(typo, values, "a cover date after acceptance must not land in any quarter")
        # The legitimate cover date is still placed on the last CLOSED period
        # (assign_cover_date unchanged): FY2023 / Q4 2023, period end 2023-12-31.
        legit = sorted((fy, fp, end) for fy, fp, value, end in shares if value == 47_000_000.0)
        self.assertEqual(legit, [(2023, "FY", "2023-12-31"), (2023, "Q4", "2023-12-31")])
        ends = sorted(i["end"] for i in result.issues if i["code"] == ISSUE_FUTURE_PERIOD_END
                      and i["metric"] == "shares_outstanding")
        self.assertEqual(ends, ["2024-04-05", "2034-03-05"])

    def test_quarantine_is_counted_and_reaches_quality_and_the_bundle(self):
        raws, result = self.normalized()
        self.assertEqual(result.stats["future_period_quarantined"], 7)
        _, summary = quality.run_all(raws, result.factbook, REGISTRY, result.issues)
        self.assertEqual(summary["by_code"].get(ISSUE_FUTURE_PERIOD_END), 7)
        bundle = consumer.build_consumer_bundle(self.CIK, self.builder().company_facts(), REGISTRY,
                                                as_of="2026-10-26")
        self.assertEqual(bundle["quality"]["futurePeriodEnd"],
                         {"quarantined": 7, "byMetric": {"dividends_declared_per_share": 1,
                                                         "long_term_debt": 4, "shares_outstanding": 2}})
        self.assertNotIn("implausibleFilingFy", bundle["quality"])

    def test_a_cover_date_on_the_filing_date_after_an_evening_acceptance_stays(self):
        """Acceptance at 21:00 the evening before the official filing date: a
        cover date on the filing date is not in the future (1.4.0 convention)."""
        b = FactsBuilder(2000000912)
        accn = "0000000912-24-000001"
        b.add("us-gaap", "Revenues", "USD", 10.0, date(2023, 12, 31), date(2023, 1, 1), accn, "10-K",
              "2024-03-27", fy=2023, fp="FY")
        b.add("dei", "EntityCommonStockSharesOutstanding", "shares", 9.0, date(2024, 3, 27), None,
              accn, "10-K", "2024-03-27", fy=2023, fp="FY")
        b.add_filing(accn, "10-K", "2024-03-27", "2023-12-31", acceptance="2024-03-26T21:00:00.000Z")
        availability = build_availability_map(b.filings)
        result = normalize_company(2000000912, raw_facts(b.company_facts(), availability), REGISTRY,
                                   filing_metadata=b.filings)
        self.assertEqual(result.stats["future_period_quarantined"], 0)
        self.assertIn(("shares_outstanding", 2023, "FY"), result.factbook.timelines)

    def test_nothing_changes_for_an_issuer_without_future_periods(self):
        b = FactsBuilder(2000000913)
        for year in (2021, 2022, 2023):
            b.add("us-gaap", "Revenues", "USD", float(year), date(year, 12, 31), date(year, 1, 1),
                  f"0000000913-{year - 1999}-000001", "10-K", f"{year + 1}-02-20", fy=year, fp="FY")
        result = normalize_company(2000000913, raw_facts(b.company_facts()), REGISTRY)
        self.assertEqual(result.stats["future_period_quarantined"], 0)
        self.assertEqual(consumer.build_consumer_bundle(2000000913, b.company_facts(), REGISTRY,
                                                        as_of="2026-10-26").get("quality"), None)


# ----------------------------------------------------------------------- P3

class NoBulkAcceptanceTest(QuietTest):
    TRUE_ACCEPTANCE = "2024-02-21T16:31:11.000Z"
    BULK_ACCEPTANCE = "2024-02-21T21:31:11.000Z"     # +5h, as V9 measured on the bulk archive

    def rows(self, source, acceptance):
        return [{"accession": "0000000921-24-000001", "form": "10-K", "filing_date": "2024-02-21",
                 "report_date": "2023-12-31", "acceptance_datetime": acceptance,
                 "acceptance_source": source}]

    def test_a_bulk_acceptance_timestamp_is_never_availability(self):
        availability = build_availability_map(self.rows(ACCEPTANCE_SOURCE_BULK_SUBMISSIONS, self.BULK_ACCEPTANCE))
        self.assertEqual(availability, {"0000000921-24-000001": "2024-02-21"})

    def test_the_api_acceptance_timestamp_is_used(self):
        availability = build_availability_map(self.rows(ACCEPTANCE_SOURCE_API, self.TRUE_ACCEPTANCE))
        self.assertEqual(availability, {"0000000921-24-000001": self.TRUE_ACCEPTANCE})

    def test_end_to_end_no_observation_carries_the_bulk_timestamp(self):
        b = FactsBuilder(2000000921)
        accn = "0000000921-24-000001"
        b.add("us-gaap", "Revenues", "USD", 10.0, date(2023, 12, 31), date(2023, 1, 1), accn, "10-K",
              "2024-02-21", fy=2023, fp="FY")
        metadata = self.rows(ACCEPTANCE_SOURCE_BULK_SUBMISSIONS, self.BULK_ACCEPTANCE)
        raws = raw_facts(b.company_facts(), build_availability_map(metadata))
        result = normalize_company(2000000921, raws, REGISTRY, filing_metadata=metadata)
        observations = [o for tl in result.factbook.timelines.values() for o in tl.observations]
        self.assertTrue(observations)
        for obs in observations:
            self.assertNotEqual(obs.available_from, self.BULK_ACCEPTANCE)
            self.assertEqual(obs.available_from, "2024-02-21")

    def test_the_provider_tags_api_submissions(self):
        class Client:
            def get_json(self, url, use_cache=True):
                assert url.startswith("https://data.sec.gov/submissions/"), url
                return {"name": "X", "filings": {"recent": {
                    "accessionNumber": ["a-1"], "form": ["10-K"], "filingDate": ["2024-02-21"],
                    "reportDate": ["2023-12-31"], "acceptanceDateTime": [self_true],
                    "primaryDocument": ["d.htm"], "isXBRL": [1]}, "files": []}}
        self_true = self.TRUE_ACCEPTANCE
        provider = SECProvider.__new__(SECProvider)
        provider.client = Client()
        rows = provider.get_filing_metadata("2000000921", provider.get_submissions("2000000921"))
        self.assertEqual(rows[0]["acceptance_source"], ACCEPTANCE_SOURCE_API)
        self.assertEqual(build_availability_map(rows), {"a-1": self.TRUE_ACCEPTANCE})

    def test_no_production_module_reads_the_bulk_submissions_archive(self):
        """Only model.py may name the archive (to document the guard).

        Offline research scripts (v9/, v9_followups/) are not production modules:
        they read the archive only to measure its acceptance-time offset and never
        feed the pipeline. They stay excluded; everything else is scanned."""
        root = Path(__file__).resolve().parents[1]
        offenders = []
        for path in sorted(root.rglob("*.py")):
            rel = path.relative_to(root).as_posix()
            if rel.startswith(("tests/", "v9/", "v9_followups/", "v9-followups/")) or rel == "sec/model.py":
                continue
            if re.search(r"bulkdata/submissions|submissions\.zip", path.read_text(encoding="utf-8")):
                offenders.append(rel)
        self.assertEqual(offenders, [], "PIT availability must not come from the bulk submissions archive")


if __name__ == "__main__":
    unittest.main()
