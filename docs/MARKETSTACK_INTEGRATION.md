# Marketstack integration

## Status and protected baseline

Marketstack is an additive, server-side ingestion source and US-provider
candidate. Tiingo remains the
production market-data source, including its existing US live configuration.
The accepted global-equities architecture from PR #324, US security master,
SEC normalization and official ESEF filing paths remain authoritative.

Authenticated probes and bounded imports now provide empirical evidence. The
branch contains **58 real canonical listings: 46 equities and 12 ETFs**, with
**23,016 accepted daily candles and 1,394 quarantined candles**. Five of 63
candidate listings were blocked. This is a measured bounded expansion, not a
complete German/European/global universe or a US-provider migration.

Public delivery is a permission-scoped EOD close chart and price metadata;
raw provider OHLC remains in the canonical working store rather than the public
chart payload. All 58 imported listings still lack a verified adjustment basis.
All imported histories remain `PARTIAL`; equity issuer linkage remains
unresolved. Forty-two listings have official trading-currency mappings,
including four newly mapped Austrian/Spanish listings. Broader German
discovery is candidate evidence, not imported history coverage: the complete
8,959-row directory join identifies 680 equities and 2,374 ETFs, with 3,054
classified candidates whose full histories remain unchecked.
See [`marketstack_canonical_import.json`](../reports/marketstack/marketstack_canonical_import.json)
and the final engineering report for the import and measured limitations.

## Data flow and code

```text
GitHub Actions MARKETSTACK_API_KEY
  -> providers/marketstack/client.js
  -> providers/marketstack/adapter.js
  -> existing canonical market store / unpublished working data
  -> verified permission-scoped listing/close-chart materialization
  -> shared Search / Watchlists / Charts / market-data APIs
```

- [`client.js`](../providers/marketstack/client.js) uses the existing VU market
  transport. It provides serialized requests, bounded transient retries,
  Retry-After handling, a timeout covering body download, cache/in-flight
  deduplication, pagination, symbol batches and request/credit accounting.
- [`adapter.js`](../providers/marketstack/adapter.js) implements the ingestion
  operations used by the Tiingo market path: daily/historical bars, intraday
  bars, quotes, metadata and corporate-action observations. A listing mapping
  with provider symbol, exchange, original trading currency and explicit asset
  type is mandatory. Identity conflicts block the complete series.
- [`ingest-marketstack.mjs`](../scripts/market/ingest-marketstack.mjs) separates
  discovery, backfill and incremental modes. Discovery caches provider pages
  with a continuation offset. Price ingestion uses the existing market-store
  merge/checkpoint machinery, scoped checkpoint IDs and resumable annual
  request windows. It fetches forward from stored history. On an empty cache,
  incremental mode defaults to a 14-day repair window; only explicit backfill
  defaults to 2020. Output stays in the selected working directory; it does not
  replace US production data files.
- [`probe-marketstack.mjs`](../scripts/market/probe-marketstack.mjs) collects
  bounded empirical evidence. It writes diagnostic artifacts, never production
  membership or provider routing.
- [`benchmark-marketstack-us.mjs`](../scripts/market/benchmark-marketstack-us.mjs)
  compares the complete retained US baseline against an official listing
  catalog and supports aligned price-series diagnostics. Catalog matching is
  identity evidence only; authenticated data comparison is a separate step.

The ingestion adapter is not a claim that all methods of the Quant
`MarketDataProvider` interface, bulk panels or certified total-return history
are implemented. Product engines must continue using their existing canonical
delivery boundaries.

## Endpoints

| Purpose | V2 endpoints | Current use |
| --- | --- | --- |
| Exchange/listing discovery | `/exchanges`, `/exchanges/{mic}/tickers`, `/tickerslist`, `/tickers/{symbol}` | Cached/bounded discovery and metadata checks |
| Daily prices | `/eod`, `/eod/latest` | Adapter ingestion and price probes |
| Intraday | `/intraday`, `/intraday/latest` | Adapter/probes; actual venue, delay and session coverage require evidence |
| Price snapshot | `/stockprice` | Explicit snapshot quote/probe; no realtime assertion |
| Corporate actions | `/splits`, `/dividends` | Diagnostic probes; adapter action observations currently originate in EOD bars |
| ETF reference/holdings | `/etflist`, `/etfholdings` | Bounded evidence probes |
| Fundamentals | `/company_facts`, `/concept/accounts_payable`, `/submissions`, `/tickerinfo`, `/companyratings` | Entitlement probes; no replacement of SEC/ESEF |

Real Professional requests returned entitlement restrictions for facts,
concepts, submissions and ratings. `/tickerinfo` was accessible for AAPL, SAP
and EUNL. Metadata access does not imply financial-fact access or broad issuer
linkage.

Provider timestamps and retrieval time remain distinct. Bars carry
`market_timestamp`, `provider_timestamp`, `retrieved_at`, `data_frequency` and
`delay_state`. Daily data is `EOD_ONLY`; intraday and snapshots remain `UNKNOWN`
for delay until independently measured. Returning an endpoint response does
not certify latency or allow a LIVE label.

Raw prices stay in their original trading currency. Reporting currency belongs
to financial facts; display conversion does not rewrite stored OHLC. ETF
classification remains explicit, and an ETF has a fund identity rather than a
company identity. Existing equity-specific engines keep their coverage gates.

New equities without a proven issuer join retain `companyId`, company country,
company region and reporting currency as null. `listingCountry` and
`listingRegion` describe the verified venue independently. Searchable company
names or listing geography do not create company fundamentals. The additive
layer does not enter Quant/Discover equity ranking, Factor DNA, company
valuation or fundamental-dependent SuperTrader strategies.

## Adjustments and quality

The adapter validates dates, OHLC consistency, positive prices, nonnegative
volume, split/dividend fields and duplicate candles. Currency, exchange, symbol
or asset-type conflicts fail closed. The global-market contract adds listing,
asset-class, history and holdings checks. The bounded import quarantines
anomalous provider observations; its public output uses only accepted real
closes. Quarantine is visible in listing coverage/quality metadata and does not
certify a complete strategy-ready history.

Provider adjustment observations remain unverified by default. Adjusted close
is withheld from the verified adjustment field until `adjustmentVerified` is
explicitly supported by evidence. No second split/dividend adjustment is applied
to provider-adjusted observations. Broad adjustment-method equivalence to
Tiingo remains a benchmark requirement.

## Request economics

The official Professional plan advertises **100,000 requests per month**. The
client distinguishes HTTP attempts from estimated credits:

- Symbol endpoints conservatively reserve one credit per requested unique
  symbol per page; batching saves HTTP overhead rather than assuming one
  account credit for the entire batch.
- `/etflist` and `/etfholdings` reserve 20 credits per attempt.
- Other endpoints reserve at least one credit per attempt.
- Errors and retries are conservatively charged against the run budget.
  These estimates are not observed invoices or a provider account balance.

Measured complete-US latest-price collection used 69 HTTP calls and 6,738
conservatively accounted credits: 6,278 valid latest observations and 460
flagged observations. Across known authenticated work in this engineering run,
the estimate is 7,224 credits, with uncertainty of at most two additional
in-flight requests from an interrupted probe. No further provider requests are
planned for this run. These observations establish request economics and
diagnostic quality, not Tiingo-replacement readiness.

A repeated 6,738-symbol update on 22 trading days would alone reserve 148,236
credits, above Professional's 100,000 monthly allowance before global history,
ETF holdings or other consumers. Business advertises 500,000 monthly requests
and could address request capacity. It does not fix identity, adjustment or
quality anomalies; its SEC-backed financial access does not justify replacing
the existing SEC pipeline. No upgrade is performed.

The client defaults to 100 HTTP attempts and 100 estimated credits per instance.
The bounded workflow uses 160 attempts and 250 estimated credits; the probe CLI
caps its credit limit at 300. Ingestion defaults to a separate 5,000-credit
monthly safety ceiling, rejects ceilings above 100,000, and persists its local
ledger at `WORKING/marketstack/budget-ledger.json`.

That ledger covers ingestion runs sharing the same persisted working directory.
It is not an account-wide lock and does not include separately executed probes
or other API consumers. Persist the directory between runs and reconcile all
consumers before enabling broad recurring imports. The additive ingestion job
has a weekday 22:20 UTC schedule gated by
`VU_MARKETSTACK_INGESTION_ENABLED == 'true'`; manual workflow dispatch is also
supported. Its configured limits are 100 attempts/100 estimated credits per
run and a 5,000-credit client-side monthly ceiling. It restores/saves the
Marketstack working cache and has no repository write or deployment permission.
No account-wide monthly-budget sufficiency claim is established by this change.

## Credentials and workflow

[`marketstack-probe.yml`](../.github/workflows/marketstack-probe.yml) references
`${{ secrets.MARKETSTACK_API_KEY }}` in GitHub Actions. It has read-only repository
permissions, requires workflow dispatch or an explicit branch commit marker,
checks that protected production artifacts did not change, and uploads evidence
with seven-day retention.

The client adds the key only inside the fetch boundary, rejects credential
parameters, disables redirects and sanitizes provider responses/errors. The
probe rejects final output containing the key. No frontend receives the key;
no Cloudflare secret or Tiingo runtime configuration is changed or required.

Bounded operations, from the repository root:

```sh
# The read-only probe workflow uses the existing GitHub Actions secret;
# dispatch the registered workflow or use its explicit branch commit marker.

# Controlled discovery; requires credentials in the authorized server environment.
node scripts/market/ingest-marketstack.mjs --phase=discovery --exchange=XETR --max-credits=20 --max-pages=2

# Use a real validated global-market layer, never a guessed ticker list.
node scripts/market/ingest-marketstack.mjs --phase=backfill --listings=PATH_TO_VERIFIED_LAYER --from=2020-01-01 --max-credits=100
node scripts/market/ingest-marketstack.mjs --phase=incremental --listings=PATH_TO_VERIFIED_LAYER --max-credits=100
```

Public listing/close-chart output is built through
[`build-global-market.mjs`](../scripts/universe/build-global-market.mjs). A public
output path requires an explicit display-permission record covering every
listing. Staging and atomic directory replacement keep publication reviewable;
the build does not modify the existing US master. Existing Cloudflare Workers,
Tiingo live settings and unrelated schedules remain untouched.

## Documentation sources

- [Official V2 OpenAPI](https://api.swaggerhub.com/apis/apilayer-863/MarketstackAPIv2/2.0.0/swagger.json)
- [Official API documentation](https://docs.apilayer.com/marketstack/docs/api-documentation)
- [Official pricing](https://marketstack.com/product)
- [Provider routing](PROVIDER_ROUTING.md)
- [Fundamentals validation](FUNDAMENTALS_VALIDATION.md)
