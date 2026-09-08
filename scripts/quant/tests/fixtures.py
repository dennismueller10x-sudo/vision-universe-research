"""SYNTHETIC test fixtures.

Every number in this file is invented for testing and is explicitly NOT SEC
data. No fixture claims to represent a real company's real financials; the
CIKs are placeholders and the values are chosen to exercise edge cases
(year-to-date accumulation, 53-week years, restatements, banks without a cost
of revenue). Real SEC validation happens in the GitHub Actions workflow against
data.sec.gov, never here.
"""
from datetime import date, timedelta

SYNTHETIC = True


def qend(previous_fy_end, index, week_based=False, extra_week_in_q4=False):
    """Quarter end `index` (1..4) inside the year following previous_fy_end."""
    step = 91
    days = step * index
    if extra_week_in_q4 and index == 4:
        days += 7
    return previous_fy_end + timedelta(days=days)


def build_year_ends(first_end, count, week_based=False, fifty_three_week_years=()):
    """Consecutive fiscal year ends, optionally with 53-week years."""
    ends = [first_end]
    for step in range(1, count):
        length = 364 if week_based else 365
        if step in fifty_three_week_years:
            length = 371
        ends.append(ends[-1] + timedelta(days=length))
    return ends


class FactsBuilder:
    """Builds a SEC-shaped companyfacts payload from synthetic inputs."""

    def __init__(self, cik, fiscal_year_label_offset=0):
        self.cik = int(cik)
        self.offset = fiscal_year_label_offset
        self._units = {}
        self.filings = []

    def _bucket(self, taxonomy, concept, unit):
        return (self._units
                .setdefault(taxonomy, {})
                .setdefault(concept, {"label": concept, "units": {}})["units"]
                .setdefault(unit, []))

    def add(self, taxonomy, concept, unit, value, end, start=None, accn=None,
            form="10-Q", filed=None, fy=None, fp=None):
        entry = {"end": str(end) if end is not None else None, "val": value,
                 "accn": accn, "fy": fy, "fp": fp, "form": form,
                 "filed": str(filed) if filed is not None else None}
        if start is not None:
            entry["start"] = str(start)
        self._bucket(taxonomy, concept, unit).append(entry)
        return self

    def add_filing(self, accession, form, filing_date, report_date, acceptance=None):
        self.filings.append({
            "accession": accession, "form": form, "filing_date": str(filing_date),
            "report_date": str(report_date), "acceptance_datetime": acceptance,
            "primary_document": "doc.htm", "is_amendment": form.endswith("/A"),
            "is_xbrl": True, "cik": str(self.cik).zfill(10),
        })
        return self

    def company_facts(self, entity_name="SYNTHETIC TEST ISSUER"):
        return {"cik": self.cik, "entityName": entity_name,
                "facts": self._units, "_retrieved_at": "2026-09-07T00:00:00+00:00"}


# Flow concepts a real periodic filer reports, as a share of revenue. Values are
# synthetic; the point is that every metric the pipeline maps has a plausible
# quarterly and annual series to work on.
FLOW_CONCEPTS = (
    ("CostOfGoodsAndServicesSold", "USD", 0.55),
    ("OperatingIncomeLoss", "USD", 0.25),
    ("IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest", "USD", 0.24),
    ("IncomeTaxExpenseBenefit", "USD", 0.05),
    ("NetIncomeLoss", "USD", 0.19),
    ("NetCashProvidedByUsedInOperatingActivities", "USD", 0.30),
    ("PaymentsToAcquirePropertyPlantAndEquipment", "USD", 0.08),
    ("ResearchAndDevelopmentExpense", "USD", 0.12),
    ("ShareBasedCompensation", "USD", 0.03),
)

# Balance-sheet concepts, as a share of the fiscal year's revenue.
INSTANT_CONCEPTS = (
    ("Assets", "USD", 2.5),
    ("StockholdersEquity", "USD", 1.2),
    ("CashAndCashEquivalentsAtCarryingValue", "USD", 0.4),
    ("LongTermDebtNoncurrent", "USD", 0.5),
    ("LongTermDebtCurrent", "USD", 0.1),
)

SYNTHETIC_SHARE_COUNT = 1000.0


def standard_company(cik, fy_ends, annual_revenue, quarterly_pattern=(0.2, 0.24, 0.26, 0.30),
                     week_based=False, ytd_only_from_q2=True, include_balance_sheet=True,
                     revenue_concept="Revenues", comparative_years=2,
                     flow_concepts=FLOW_CONCEPTS, include_eps=True):
    """A synthetic issuer that files 10-Qs and 10-Ks the way real ones do.

    Q1 is reported as a standalone quarter. Q2 and Q3 are reported ONLY as
    cumulative year-to-date figures (the common case that breaks naive
    pipelines), and Q4 is never reported standalone at all - the 10-K carries
    the full year. That forces de-accumulation to do real work.
    """
    builder = FactsBuilder(cik)
    revenue_by_year = {}
    concepts = ((revenue_concept, "USD", 1.0),) + tuple(flow_concepts)

    def emit_flows(share_of_revenue, annual, end, start, accession, form, filed,
                   fiscal_year, fiscal_period):
        for concept, unit, ratio in concepts:
            builder.add("us-gaap", concept, unit, round(annual * ratio * share_of_revenue, 2),
                        end, start, accession, form, filed,
                        fy=fiscal_year, fp=fiscal_period)
        if include_eps:
            net_income = annual * 0.19 * share_of_revenue
            builder.add("us-gaap", "EarningsPerShareDiluted", "USD/shares",
                        round(net_income / SYNTHETIC_SHARE_COUNT, 4), end, start,
                        accession, form, filed, fy=fiscal_year, fp=fiscal_period)
            builder.add("us-gaap", "WeightedAverageNumberOfDilutedSharesOutstanding",
                        "shares", SYNTHETIC_SHARE_COUNT, end, start, accession, form,
                        filed, fy=fiscal_year, fp=fiscal_period)

    def emit_instants(annual, end, accession, form, filed, fiscal_year, fiscal_period):
        if not include_balance_sheet:
            return
        for concept, unit, ratio in INSTANT_CONCEPTS:
            builder.add("us-gaap", concept, unit, round(annual * ratio, 2), end, None,
                        accession, form, filed, fy=fiscal_year, fp=fiscal_period)

    for index in range(1, len(fy_ends)):
        previous_end, fy_end = fy_ends[index - 1], fy_ends[index]
        fiscal_year = fy_end.year
        annual = annual_revenue(fiscal_year)
        quarters = [annual * share for share in quarterly_pattern]
        revenue_by_year[fiscal_year] = {"annual": annual, "quarters": quarters}

        starts = previous_end + timedelta(days=1)
        q_ends = [qend(previous_end, step, week_based) for step in range(1, 4)]
        q_ends.append(fy_end)

        # Three 10-Qs.
        for step, quarter_end in enumerate(q_ends[:3], start=1):
            filed = quarter_end + timedelta(days=25)
            accession = f"{cik}-{str(fiscal_year)[2:]}-Q{step}"
            builder.add_filing(accession, "10-Q", filed, quarter_end,
                               acceptance=f"{filed}T16:30:00.000Z")
            if step == 1 or not ytd_only_from_q2:
                period_start = starts if step == 1 else q_ends[step - 2] + timedelta(days=1)
                emit_flows(quarterly_pattern[step - 1], annual, quarter_end, period_start,
                           accession, "10-Q", filed, fiscal_year, f"Q{step}")
            if step >= 2 or not ytd_only_from_q2:
                emit_flows(sum(quarterly_pattern[:step]), annual, quarter_end, starts,
                           accession, "10-Q", filed, fiscal_year, f"Q{step}")
            emit_instants(annual, quarter_end, accession, "10-Q", filed,
                          fiscal_year, f"Q{step}")

        # The annual report, with comparatives carrying the FILING's fy/fp.
        filed = fy_end + timedelta(days=55)
        accession = f"{cik}-{str(fiscal_year)[2:]}-FY"
        builder.add_filing(accession, "10-K", filed, fy_end,
                           acceptance=f"{filed}T17:05:00.000Z")
        for back in range(0, comparative_years + 1):
            target_index = index - back
            if target_index < 1:
                continue
            target_end = fy_ends[target_index]
            target_start = fy_ends[target_index - 1] + timedelta(days=1)
            target_annual = annual_revenue(target_end.year)
            emit_flows(1.0, target_annual, target_end, target_start, accession, "10-K",
                       filed, fiscal_year, "FY")
            emit_instants(target_annual, target_end, accession, "10-K", filed,
                          fiscal_year, "FY")
    return builder, revenue_by_year


def submissions(cik, name, sic, fiscal_year_end, tickers, filings, exchanges=("Nasdaq",)):
    """SEC-shaped submissions payload built from a FactsBuilder's filing list."""
    columns = {"accessionNumber": [], "form": [], "filingDate": [], "reportDate": [],
               "acceptanceDateTime": [], "primaryDocument": [], "isXBRL": []}
    for row in filings:
        columns["accessionNumber"].append(row["accession"])
        columns["form"].append(row["form"])
        columns["filingDate"].append(row["filing_date"])
        columns["reportDate"].append(row["report_date"])
        columns["acceptanceDateTime"].append(row["acceptance_datetime"])
        columns["primaryDocument"].append(row["primary_document"])
        columns["isXBRL"].append(1)
    return {
        "cik": str(int(cik)), "name": name, "sic": sic,
        "sicDescription": f"SYNTHETIC SIC {sic}", "fiscalYearEnd": fiscal_year_end,
        "tickers": list(tickers), "exchanges": list(exchanges),
        "entityType": "operating", "stateOfIncorporation": "DE", "formerNames": [],
        "filings": {"recent": columns, "files": []},
        "_retrieved_at": "2026-09-07T00:00:00+00:00",
    }
