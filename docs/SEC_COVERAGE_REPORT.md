# SEC Coverage Report

**Status: measured against live SEC data on 2026-09-08** (GitHub Actions run #11
on `claude/sec-financial-data-core-qiizhj`, normalization logic 1.3.0).

Every number below comes from `quant/data/sec/coverage_matrix.json`, which
`scripts/quant/sec/coverage.py` computes from ingested facts. Nothing here is
hand-written or quoted from documentation.

## 1. The measured grid

| Fiscal year | NVDA | AAPL | MSFT | JPM | XOM |
| --- | --- | --- | --- | --- | --- |
| 2025 | STRUCTURED | STRUCTURED | STRUCTURED | STRUCTURED | STRUCTURED |
| 2020 | STRUCTURED | STRUCTURED | STRUCTURED | STRUCTURED | STRUCTURED |
| 2015 | STRUCTURED | STRUCTURED | STRUCTURED | STRUCTURED | STRUCTURED |
| 2010 | STRUCTURED | STRUCTURED | STRUCTURED | STRUCTURED | STRUCTURED |
| 2005 | FILING_ONLY | FILING_ONLY | FILING_ONLY | FILING_ONLY | FILING_ONLY |
| 2000 | FILING_ONLY | FILING_ONLY | FILING_ONLY | FILING_ONLY | FILING_ONLY |
| 1995 | **MISSING** | FILING_ONLY | FILING_ONLY | FILING_ONLY | FILING_ONLY |

| Company | First structured year | First usable year | Filing years found |
| --- | --- | --- | --- |
| NVDA | 2008 | 2008 | 1999–2026 |
| AAPL | 2007 | 2007 | 1993–2026 |
| MSFT | 2008 | 2008 | 1993–2026 |
| JPM  | 2007 | 2007 | 1993–2026 |
| XOM  | 2008 | 2007 | 1993–2026 |

`earliest_usable_year: 2007`, `latest_first_usable_year: 2008`.

Two results are worth stating plainly:

- **Structured coverage predates the XBRL mandate.** The mandate phased in from
  mid-2009, yet FY2007 and FY2008 come back STRUCTURED. That is the comparative
  effect: an FY2009 or FY2010 filing carries the two prior years as tagged
  comparatives. It was an open empirical question in the pre-live version of this
  document; the answer is roughly two years of reach behind the first XBRL filing.
- **NVDA 1995 is MISSING, not FILING_ONLY**, because NVDA's first periodic filing
  in EDGAR is from 1999 — the company IPO'd in 1999. The distinction is the point
  of the four-state scale: nothing was filed, so nothing can be recovered by
  parsing documents later.

`FILING_ONLY` for 1995–2005 across the other four means EDGAR holds the 10-K but
it carries no machine-readable facts. Those years are recoverable in principle
(document parsing), at a cost this measurement now quantifies: roughly 14 years
per company.

**A backtest on this universe can start in fiscal 2008**, with 2007 available for
four of the five.

## 2. Canonical output per company

From `quant/data/sec/canonical_index.json` (run #11):

| Company | Canonical facts | Metrics | Suppressed cells | Quarterly years |
| --- | --- | --- | --- | --- |
| AAPL | 962 | 13 | 0 | 2007–2026 |
| MSFT | 998 | 13 | 0 | 2008–2026 |
| NVDA | 791 | 13 | 29 | 2008–2027 (fiscal) |
| XOM  | 846 | 11 | 1 | 2007–2026 |
| JPM  | 619 | 7  | 0 | 2007–2026 |

Total: 4216 canonical `FundamentalFact` records.

**JPM has 7 metrics, not 13, and that is correct** — and the two reasons for the
gap are kept apart, which is the point:

- `cost_of_revenue`, `gross_profit` and `total_debt` come back
  `NOT_APPLICABLE_FOR_SECTOR` with a rule id. A bank has no cost of revenue, so
  no gross profit exists to report or to reconstruct; the sector rule also blocks
  the debt aggregate rather than summing components that do not mean the same
  thing on a bank balance sheet.
- `capital_expenditures`, `long_term_debt` and `operating_income` come back
  `MISSING_XBRL_CONCEPT`: the concept could exist for this filer but is not in
  the tagged data.

Neither is zero and neither is silently absent. XOM has 11 for the second reason
only: `gross_profit`, `cost_of_revenue` and `operating_income` are simply not
tagged in its filings — an oil major reports a different income-statement shape,
and that is `MISSING_XBRL_CONCEPT`, not a sector rule.

**Suppressed cells** are cells where the same (metric, fiscal year, quarter)
resolved to more than one period end. A fiscal quarter has exactly one end date,
so rather than publish an ambiguous number the cell is withheld and reported
under `periodEndConflicts` with reason `AMBIGUOUS_PERIOD_END`. All 30 remaining
are in the thin early XBRL years — 29 for NVDA (2010–2013), 1 for XOM — where the
learned fiscal calendar cannot place the periods unambiguously. An honest gap
with a stated reason, not a guess.

## 3. What the states mean

Per company and fiscal year, one of four states, computed from real ingested data
by `coverage.py` — never hand-written:

| State | Definition |
| --- | --- |
| `STRUCTURED` | ≥80 % of the core metrics are present as **native XBRL facts** for that fiscal year |
| `DERIVABLE` | Not all native, but ≥60 % are **reconstructible** — quarters from year-to-date, the year from four quarters, gross profit from revenue minus cost of revenue |
| `FILING_ONLY` | The company filed a periodic report that year, but it yields no usable structured data. The numbers exist only inside the document |
| `MISSING` | No periodic filing found for that fiscal year |

Core metrics: `revenue`, `net_income`, `operating_cash_flow`, `total_assets`,
`stockholders_equity`. A fundamental backtest cannot run without them.

## 4. How to reproduce it

```bash
# In GitHub Actions: run the "Update SEC fundamentals" workflow (workflow_dispatch).
python3 scripts/quant/cli.py ingest
python3 scripts/quant/cli.py coverage
python3 scripts/quant/cli.py canonical
python3 scripts/quant/cli.py gates
```

The development sandbox this code was written in cannot reach `data.sec.gov`
(egress policy, HTTP 403 on CONNECT); GitHub Actions runners can, which is why
every measurement in this document was produced there.

## 5. Delisted securities and survivorship bias

This was investigated at the capability level and the answer is definite.

**What SEC/EDGAR can do:** every filing a company ever made stays retrievable by
CIK, forever, including after delisting. `SECProvider.get_submissions(cik)` and
`get_company_facts(cik)` work for a delisted issuer exactly as for a live one.
Capability `delisted_by_cik: true`.

**What it cannot do:** `https://www.sec.gov/files/company_tickers.json` maps only
issuers with a **currently assigned ticker**. A company delisted in 2013 is not
in it. There is no SEC endpoint that maps a historical ticker to a CIK, and no
delisting event feed. Capability `delisted_by_ticker: false`.

`SECProvider.resolve_ticker` raises `TickerNotFound` for such a ticker rather
than returning a wrong CIK, and `try_resolve_ticker` returns `None`.

**Consequence for backtesting.** Fundamentals per company are point-in-time
correct, but the *universe* is not. Building "the S&P 500 as it stood in 2012"
from SEC data alone is impossible: you cannot enumerate the companies that were
listed then and are not now. So a backtest built on SEC alone still carries
survivorship bias in its membership even with perfectly timed fundamentals.

Gate B (`GATE_B_DELISTING`) from `quant/engines/gate-tests.js` — the existing
qualification stand, not a SEC-specific re-implementation — **FAILS**, because
`providers/sec/adapter.js` returns `unavailable` for `getUniverseAsOf` rather than
handing back today's universe and letting it pass for a historical one. The
ingestion check `SURVIVORSHIP_FREE_UNIVERSE` fails for the same reason. No PASS was
awarded for a capability the provider does not have, and the provider profile
records `survivorshipBiasControls: false` as an explicit exclusion rather than as
"unverified".

**What would close the gap** (out of scope for this phase, documented so the
decision is informed):

1. A point-in-time index constituent history (S&P, CRSP or equivalent) — the
   proper fix; commercial.
2. An exchange listing/delisting history keyed to CIK.
3. A partial, free approximation: EDGAR full-text and form-type history can
   identify companies that stopped filing 10-Ks, and Form 25 (notification of
   delisting) filings are themselves in EDGAR. This yields a *filing-status*
   history, not a *listing* history, and would need validation before trust.

Nothing should be purchased for this phase. The requirement is now documented
with its actual cost.

## 6. What SEC cannot provide at all

Confirmed from the provider capability matrix, so no downstream component quietly
assumes otherwise:

| Not available from SEC | Consequence |
| --- | --- |
| OHLCV / prices | No Value factor, no Momentum factor, no market cap, no returns. Stays a MarketDataProvider job |
| Analyst estimates | No forward P/E, no surprise factors |
| Corporate actions / split history | Per-share figures across splits need an external source |
| Security master / delisting events | See §5 |
| Intraday or real-time anything | SEC is a filing archive |
