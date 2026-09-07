# SEC XBRL Normalization

How a raw SEC XBRL fact becomes a canonical Vision Universe number, and what the
pipeline refuses to do along the way.

## 1. The Canonical Metric Registry

`quant/config/metric_registry.json` is the single place where a Vision Universe
metric is mapped onto SEC concepts. It is data, not code.

```json
"revenue": {
  "kind": "duration", "statement": "income_statement", "units": ["USD"],
  "concepts": [
    {"taxonomy": "us-gaap", "concept": "RevenueFromContractWithCustomerExcludingAssessedTax", "priority": 10},
    {"taxonomy": "us-gaap", "concept": "Revenues", "priority": 30},
    {"taxonomy": "us-gaap", "concept": "SalesRevenueNet", "priority": 40}
  ]
}
```

Rules enforced by `registry.py` at load time:

- Every metric declares its allowed units. A fact in another unit is rejected
  with `UNIT_MISMATCH`, never converted.
- Every metric declares `duration` or `instant`. A duration fact can never fill
  an instant metric, or the reverse (`PERIOD_MISMATCH`).
- Two concepts of the same metric may not share a priority. Equal priority would
  make selection non-deterministic — exactly the `AMBIGUOUS_MAPPING` case this
  pipeline refuses to guess at, so the registry fails to load instead.

Selection happens per filing: within one accession, the highest-priority concept
that reports the metric for that period wins, and the concept actually used is
stored with the value. Across filings, each accession contributes its own best
concept, which is what makes an accounting-standard transition (a company moving
from `SalesRevenueNet` to `RevenueFromContractWithCustomer…` under ASC 606) work
without any dated special case.

If two accepted concepts in the same filing disagree by more than 0.5 %, the
higher-priority one is used AND a `CONCEPT_DISAGREEMENT` finding is recorded.
Nothing is averaged.

**There is no company-specific branch anywhere in `scripts/quant/sec/`.** CI
enforces this: `sec-fundamentals-ci.yml` fails the build if a validation
company's ticker, name or CIK appears in the pipeline source.

## 2. The `fy` / `fp` trap

Every fact in SEC `companyfacts` carries `fy` and `fp`. These describe the
**filing** the fact appeared in, not the fact's own period. A FY2024 10-K
restating FY2022 comparatives tags them `fy: 2024, fp: "FY"`.

This pipeline never reads `fy`/`fp` to determine a fact's period. They are
carried through as `filing_fy` / `filing_fp` for diagnostics only. A regression
test (`test_fiscal.py::test_comparative_facts_are_not_labelled_with_the_filing_year`)
asserts that comparatives are labelled by their own period end.

## 3. Learned fiscal calendar

`fiscal.py` builds each company's calendar from that company's own filings:

1. **Anchors.** Annual-duration facts on a 10-K/20-F with `fp="FY"` whose period
   end is that filing's own latest annual end give `(period_end → fiscal_year)`.
2. **Label offset.** `offset = fiscal_year − calendar_year(period_end)`, taken as
   the mode across anchors. This makes both conventions come out right: a year
   ending January 2024 labelled FY2024 (offset 0) and one ending February 2024
   labelled fiscal 2023 (offset −1). No assumption, no lookup table.
3. **Boundaries.** All observed annual period ends are clustered (ends within 60
   days are the same fiscal year), giving the year windows.
4. **Quarter index** = `round((period_end − previous_fy_end) / 91.31)`, clamped
   to 1..4. Elapsed fraction of the fiscal year, not calendar months.

This handles, without a branch per case:

| Case | Handling |
| --- | --- |
| Non-calendar fiscal year (January, June, September ends) | Windows come from the company's own year ends |
| 52/53-week fiscal years | A 371-day year still yields four quarters; the extra week does not spill into the next year |
| Drifting quarter ends | Quarter index is a fraction of the year, not a month match |
| A fiscal year end that moves | Clustering keeps the later end as the boundary |
| A fiscal year not yet complete | The calendar is projected forward one year at a time |

No code anywhere assumes Q4 ends 31 December.

## 4. Period labels

| Label | Meaning |
| --- | --- |
| `Q1`..`Q4` | Standalone quarter (duration) or balance-sheet date (instant) |
| `YTD2` | Cumulative first half |
| `YTD3` | Cumulative nine months |
| `FY` | Full fiscal year (duration) or fiscal-year-end balance sheet (instant) |
| `TTM` | Trailing twelve months, computed at query time |

Cumulative periods keep a **distinct label**. A six-month revenue figure is never
stored in a cell named `Q2`. The `PERIOD_INTEGRITY` gate re-checks this on the
stored data: any quarterly cell holding a period longer than 130 days fails.

A balance sheet dated on the fiscal year end is emitted under both `FY` and `Q4`,
because it is genuinely both, and a quarterly balance-sheet series should not
have a hole every fourth quarter.

## 5. Year-to-date de-accumulation

A typical filer reports Q1 standalone, then Q2 and Q3 only as cumulative
year-to-date, and never reports Q4 standalone at all — the 10-K carries the year.
Summing what is stored would double-count badly.

`periods.py` reconstructs the quarterly grid by iterating two rules to a fixed
point (at most 8 passes):

```
cumulative[n] = native YTDn, else sum(standalone[1..n])
standalone[n] = native Qn,   else cumulative[n] − cumulative[n−1]
```

with `cumulative[4] = FY` and `cumulative[0] = 0`. So:

- `Q2 = YTD2 − Q1` → `YTD_DIFF`
- `Q3 = YTD3 − YTD2` → `YTD_DIFF`
- `Q4 = FY − YTD3` → `FY_MINUS_YTD`
- `FY = Q1+Q2+Q3+Q4` when the annual line is absent → `SUM`

Two properties matter and are tested:

1. **The reconstruction is point-in-time.** The grid is built from observations
   already filtered to what was visible at `as_of`. A reconstructed Q4 is
   therefore invisible until the 10-K that supplies the FY figure has been filed
   — not on the day the quarter ended.
2. **A derived value is never fresher than its ingredients.** `available_from`
   of a reconstructed quarter is the **latest** `available_from` among its
   inputs.

Reconstructed periods carry `transformation = YTD_DIFF | FY_MINUS_YTD | SUM`, the
flag `VU_PERIOD_TRANSFORM`, and the fact ids of every input. `source` stays
`SEC_EDGAR_XBRL`: the quantity is a SEC-reported one, arithmetically recombined —
the `transformation` field, shown as its own column in the data inspector, says
exactly how. This is deliberately distinct from a **derived metric** (§6), which
is a new quantity Vision Universe invented and is labelled as such.

## 6. Derived metrics are never SEC facts

Everything in `derived.py` carries:

```
source           = VISION_UNIVERSE_DERIVED
transformation   = FORMULA
formula_version  = 1.0.0
inputs           = ["revenue@FY2024TTM", "total_assets@FY2024FY", ...]
flags            = ["FORMULA:revenue / total_assets"]
```

Derived: `free_cash_flow`, `gross_profit_derived`, `total_debt_derived`,
`net_debt`, `gross_margin`, `operating_margin`, `net_margin`, `fcf_margin`,
`roe`, `roa`, `roic`, `asset_turnover`, `capex_to_revenue`, `debt_to_equity`,
`revenue_growth_yoy`, `eps_growth_yoy`, `fcf_growth_yoy`, `revenue_cagr_3y/5y`,
`eps_cagr_3y/5y`.

`DERIVED_SEPARATION` is a qualification gate, so a derived metric leaking out
labelled as SEC data is a build failure, not a review comment.

Refusals rather than plausible-looking numbers:

- zero denominator → `DIVISION_BY_ZERO`
- negative equity base for ROE / debt-to-equity → refused, not sign-flipped
- growth off a zero or negative base → refused; that is not a rate
- effective tax rate outside [0, 1] → ROIC refused, never clamped
- non-positive invested capital → ROIC refused

## 7. Sector-dependent availability

Sector rules live in the registry, keyed by SIC range from the SEC submissions
endpoint — a property of the issuer, not a hard-coded ticker list.

SIC 6000–6499 (depository, credit, security and insurance institutions) marks
`cost_of_revenue`, `gross_profit`, `gross_margin`, `ebitda`, `total_debt`,
`net_debt`, `debt_to_equity` and `roic` as `NOT_APPLICABLE_FOR_SECTOR`. A bank
has no cost of revenue, so gross margin is undefined rather than missing; debt is
an operating input for a bank, not leverage.

The rule is applied to the **output** metric of a formula, not only its inputs:
debt-to-equity for a bank is computable from available numbers and still not a
leverage ratio, so the sector rule wins over the arithmetic.

Metrics that stay computable but are not comparable to industrials — capex, free
cash flow, operating margin — remain **available** and are flagged here rather
than suppressed. Suppressing them would hide real data; presenting them as
peer-comparable would mislead. Cross-sector factor comparison for financials is
out of scope for V1.

## 8. Missing data

`UNKNOWN ≠ FALSE. MISSING ≠ ZERO.`

An unavailable value is `value: null`, `available: false`, plus one reason:
`MISSING_XBRL_CONCEPT`, `AMBIGUOUS_MAPPING`, `UNIT_MISMATCH`, `PERIOD_MISMATCH`,
`UNSUPPORTED_ACCOUNTING_STRUCTURE`, `INSUFFICIENT_HISTORY`,
`NOT_APPLICABLE_FOR_SECTOR`, `MISSING_INPUT`, `NOT_YET_AVAILABLE`,
`DIVISION_BY_ZERO`.

The `NO_INVENTED_VALUES` gate fails if any unavailable metric carries a value or
lacks a reason. The data inspector renders unavailable rows **with their reason**
rather than omitting them, so a gap is visible rather than invisible.

## 9. Versioning

Every stored document carries `versions`:

```json
{"normalization_schema": "1.0.0", "normalization_logic": "1.0.0",
 "formula": "1.0.0", "provider_adapter": "sec-edgar-1.0.0",
 "quality_rules": "1.0.0",
 "metric_registry": {"schema_version": 1, "mapping_version": "1.0.0"}}
```

A change to any of them invalidates stored output: the pipeline's "unchanged,
skip" path compares versions as well as the latest filing, so changing a revenue
mapping re-normalizes everything rather than leaving a mixed-vintage store. This
is tested (`test_a_registry_version_change_invalidates_stored_output`).
