# SEC Coverage Report

**Status: the coverage matrix has NOT yet been measured against live SEC data.**

This document explains why, what the measurement will produce, and how to run it.
It deliberately contains no invented numbers.

## 1. Why the matrix is empty

The brief asks for a measured coverage matrix over NVDA, AAPL, MSFT, JPM and XOM
— explicitly *not* a quotation of SEC documentation. That measurement requires
network access to `data.sec.gov`.

The environment this phase was implemented in cannot reach the SEC:

```
$ curl -sS -A "VisionUniverseResearch info@visionuniverse.de" \
    https://data.sec.gov/api/xbrl/companyfacts/CIK0001045810.json
curl: (56) CONNECT tunnel failed, response 403
  data.sec.gov:443 - connect_rejected (egress policy denied the CONNECT)
  www.sec.gov:443  - connect_rejected (egress policy denied the CONNECT)
```

This is an organisation egress policy on the development sandbox, not a SEC
block, not a rate limit and not a bug in the client. **GitHub Actions runners are
not subject to it** — `scripts/hedgefonds/fetch_edgar_data.py` has been pulling
13F data from `www.sec.gov` in this repository's workflows for some time.

Statt eine plausibel aussehende Matrix zu erfinden, trägt `quant/data/sec/coverage_matrix.json`
ships with `status: "not_generated"`, matching this repository's existing
convention for generated data (`dashboard/data/*.json`).

## 2. How to produce it

```bash
# In GitHub Actions: run the "Update SEC fundamentals" workflow (workflow_dispatch).
# It ingests the universe, then:
python3 scripts/quant/cli.py coverage
```

The workflow writes `quant/data/sec/coverage_matrix.json` and commits it. The data
inspector at `/quant/data-inspector/` renders it as soon as it exists.

## 3. What the measurement means

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

The distinction between `FILING_ONLY` and `MISSING` is the point of the exercise:
it separates "the SEC has the company but not in a machine-readable form" from
"the SEC has nothing", and only the former is recoverable by future work
(document parsing), at a cost worth knowing before committing to it.

Output shape:

```json
{"probe_years": [2025, 2020, 2015, 2010, 2005, 2000, 1995],
 "grid": {"2015": {"NVDA": "STRUCTURED", "JPM": "STRUCTURED", ...}, ...},
 "companies": [{"cik": "...", "first_structured_year": 2010,
                "first_usable_year": 2009, "years": {...}}],
 "summary": {"earliest_usable_year": ..., "latest_first_usable_year": ...}}
```

`first_usable_year` per company is the number that actually answers "from which
year is SEC data good enough for our quant backtester?".

## 4. What is already known — and what is not

The following is SEC **policy**, from the XBRL mandate's published phase-in, and
is stated here as context, not as a measurement:

- XBRL financial statement tagging phased in for US filers between mid-2009 and
  mid-2011, largest filers first.
- Before that, filings exist in EDGAR as documents, without structured facts.

What this does **not** tell us, and only the measurement can:

- Whether early XBRL years are complete enough to pass the core-metric threshold,
  or land in `DERIVABLE` / `FILING_ONLY`.
- How far back each company's *comparatives* reach. A FY2011 10-K carries FY2009
  and FY2010 figures as tagged comparatives, so structured coverage can predate
  a company's first XBRL filing — by how much is an empirical question per filer.
- Whether JPM's bank income statement leaves enough core metrics to qualify at
  all in the early years.
- How much of the quarterly grid survives de-accumulation in the early years,
  which is what a quarterly-rebalanced strategy actually needs.

Do not quote a start year for the backtester until the matrix has been generated.

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
