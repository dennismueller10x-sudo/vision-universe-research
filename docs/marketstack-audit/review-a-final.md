# Independent review A — final connector draft

Reviewed `/workspace/vision-universe/providers/marketstack/client.js`, `audit-adapter.js`, `scripts/marketstack/capability-audit.mjs`, representative plan and current official V2 Swagger downloaded on 2026-10-07. No paid requests; no edits to implementation.

## Changes with correct documentation fidelity

- Global directory correctly calls `/tickerslist` with search/exchange/limit/offset, not undocumented global `/tickers`.
- Exact ticker route `/tickers/{symbol}`, richer `/tickerinfo?ticker=`, exchange directory `/exchanges/{mic}/tickers`, ETF list and holdings route/parameters match current Swagger.
- Snapshot uses `/stockprice?ticker=&exchange=`; intraday uses `/intraday[/latest]?symbols=&interval=`; global EOD uses `/eod[/latest]?symbols=&exchange=`.
- Raw future/unknown fields retained independently; adjusted values preserved as observations without asserting canonical verification.
- Missing pagination totals never establish complete; repeat-page protection and partial holdings classification address false completeness risk.
- Documented `404_not_found` error mapping is now fixed.
- Capability UNKNOWN defaults and lack of automatic live/delayed assertions are appropriate without account timestamp observations.

## Defects requiring correction

### High: legitimate corporate-action payloads always rejected

`audit-adapter.js` getSplits/getDividends delegate to common prices() which insists micOf(row) equals request MIC. Current official SplitItem/DividendItem schemas contain symbol,date,value and action dates, but no exchange/MIC. A successful documented payload for AAPL thus becomes identityMismatch. Additionally exchange is not a documented parameter on `/splits` or `/dividends`; do not silently imply exchange-scoped action guarantees.

Correct behavior: exact-symbol action observations with venue state NOT_REPORTED and request-listing context, no canonical listing admission; conflicting actually reported venue still rejected. Missing MIC means unidentified action venue, not a provider response failure. Add synthetic tests using official schema (no exchange).

### High: plan treats sibling companies as symbol aliases

representative-plan Siemens aliases ENR.DE and SHL.DE are Siemens Energy and Siemens Healthineers, respectively; Fresenius FME.DE is Fresenius Medical Care. resolveTicker accepts exact candidate ticker + MIC only and can wrongly resolve fallback candidates to these separate companies. Remove these from same-security aliases or record them as independent search results. Other keyword-search results must be validated before their promotion to alias.

### Medium: scoped exchange directory loses MIC in normalized fields

Official `/exchanges/{mic}/tickers` returns exchange metadata in top-level data plus ticker rows in `data.tickers[]`; those rows do not include exchange. Generic directory() passes only ticker rows to normalizeObservation(), so providerExchange is null and dedup key is symbol/null. Request-derived scope should be exposed separately with provenance (e.g. requestedMIC), or used as normalized exchange when raw has none and explicitly marked request-derived. Raw stays unchanged. This matters for raw-vs-normalized field-loss findings and cross-venue symbol identity.

### Low: endpoint-specific rate spacing missing for commodity routes

Current official Swagger enforces 1API call/min on `/commodities` and `/commoditieshistory`; client defaults only contain `/companyratings:60000`. Audit currently invokes each commodity route once, so current run is unaffected, but connector repeated calls lack documented spacing. Add endpoint defaults if these routes remain available to client consumers.

### Low: ETF report end-date naming adds unverified semantics

ETF attributes schema documents `end_report_period` as report-period end date, while normalized ETF data calls it fiscalYearEnds. Preserve `reportPeriodEnds` or raw semantic label instead unless actual filing metadata confirms fiscal-year end. Raw exact field is retained, so this is labeling rather than data loss.

## Remaining coverage limits

Audit plan includes 42 cases and representative corporate actions; boundary history samples are economical but cannot prove uninterrupted complete 1Y/5Y/10Y/15Y series. No current main Marketstack connector existed at baseline; this provider observation adapter is a new isolated diagnostic contract, not a correction deployed to product. Paid API unavailable means no raw endpoint findings or live/delayed/capability flags may be promoted beyond UNKNOWN from this review.

Primary source: https://api.swaggerhub.com/apis/apilayer-863/MarketstackAPIv2/2.0.0/swagger.json . Authentication/pagination/errors: https://docs.apilayer.com/marketstack/docs/getting-started . Pricing distinguishes IEX US intraday, intervals below15min, and separate stock-market-price capability: https://marketstack.com/pricing . Full previous docs inventory/review: `review-a.md`, `official-endpoint-inventory.json`.

## Final re-review disposition — 2026-10-07

All five findings above are now resolved in the reviewed final implementation; the original review history remains above for traceability.

- Dedicated action methods request only documented symbols/date/sort/limit parameters. Exact-symbol actions with absent venue are retained with `identityVenueState: NOT_REPORTED` and `canonicalAdmission: false`; reported conflicting venue is rejected.
- Execution plan aliases are all empty, removing keyword-search sibling substitutions. Metadata resolver explicitly labels `identityVerified: false` and provider observation only.
- Exchange-scoped directory retains the requested MIC when row MIC is absent, records exchangeProvenance, preserves raw exchange envelopes, and rejects a conflicting reported envelope MIC.
- `/commodities` and `/commoditieshistory` both default to 60,000ms endpoint spacing.
- ETF period-end field is now neutral `reportedPeriodEnds`.

Independently reran `node --test providers/marketstack/tests/audit.test.mjs providers/marketstack/tests/runner.test.mjs`: 28 tests passed, 0 failed. New action test uses the no-venue documented action contract; plan test verifies no unverified sibling aliases. No live/paid API calls were made.

**Final disposition: PASS for current docs/parameter fidelity and provider-observation isolation.** Actual account entitlement, European fresh/live/delayed support, ETF pagination behavior and completeness, historical coverage and website/API parity still require authenticated provider evidence and remain UNKNOWN in this reviewer’s scope. Synthetic pass does not establish provider capabilities.
