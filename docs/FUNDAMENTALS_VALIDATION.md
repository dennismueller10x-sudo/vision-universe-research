# Fundamentals validation

> This document records the accepted PR #330 baseline. Current scale measurements, expanded branch data and deferred provider decision are documented in [MARKETSTACK_SCALE_ENGINEERING_REPORT](MARKETSTACK_SCALE_ENGINEERING_REPORT.md). Production Tiingo/SEC/ESEF routing remains unchanged.

## Ownership and scope

The existing SEC pipeline remains primary for SEC registrants. Its immutable
raw facts, registry-based concept mappings, fiscal calendars, YTD reconstruction,
unit/sign semantics, amendments and bitemporal revisions are preserved.
Marketstack differences are diagnostic evidence, never automatic corrections
to canonical values or public availability dates.

The existing official ESEF/European architecture remains separate from market
data. Company facts are stored once and projected to listings. A Marketstack
price for a European listing does not establish fundamental coverage. Annual
ESEF availability does not establish quarterly/TTM coverage. UK and Swiss
official-source policies remain distinct.

The accepted baseline includes one real LVMH ESEF package with 12 canonical facts
for FY 2023/2024, original EUR currency, document/manifest hashes and mapping
provenance. Other European discovery adapters and broad issuer/listing joins
remain partial. Conflicting net-income/equity candidates stay quarantined.

## Marketstack Professional versus Business

The official pricing page advertises Company Facts, Company Concepts, Company
Statements, Company Details and Company Ratings as Business additions. Current
Professional entitlement has now been tested with authenticated requests.
Company facts, concepts, submissions and ratings returned entitlement
restrictions; company/ticker metadata was accessible. No plan was upgraded.

| Capability | Current official V2 documentation | Source/limitation |
| --- | --- | --- |
| Company Facts | `/company_facts?cik_code=...` | Professional probe restricted. Explicitly SEC-reported XBRL: US-GAAP, IFRS and DEI; values retain accession, form, filed date and periods |
| Company Concepts | `/concept/accounts_payable?cik_code=...` | Professional probe restricted. SEC AccountsPayableCurrent; generic arbitrary-concept routing is not documented |
| SEC submissions | `/submissions` | Professional probe restricted. Regulatory filing metadata, accession and acceptance timestamps; not normalized statements |
| Company Details | `/tickerinfo?ticker=...` provides extended metadata | Real Professional requests succeeded for AAPL, SAP and EUNL; individual field availability remains response-specific |
| Company Ratings | `/companyratings?ticker=...` | Professional probe restricted. Analyst consensus/targets and ratings; documented one-call-per-minute limit |
| Company Statements | Pricing label; no corresponding named statements path in current OpenAPI | Schema, provenance, normalization and access remain unverified |

Company Facts and Concepts are a second access/parser path to the **same SEC
regulatory source**, not independent company evidence. Business would not by
itself replace SEC normalization or close non-SEC European filing coverage.
Analyst ratings are distinct optional information. No purchasing action or
Business necessity claim follows from these documented capabilities.

Separately, Business's advertised 500,000 monthly requests may be useful for
market-data capacity: the measured full-US latest collection reserved 6,738
credits, so a 22-session repetition would exceed Professional's allowance.
This budget consideration does not make duplicated SEC facts necessary and
does not resolve provider identity, price-basis or quality defects. The current
subscription and primary fundamental sources remain unchanged.

The bounded probe includes AAPL facts/concepts/submissions and metadata/ratings
entitlement checks, supplemented by SAP and EUNL metadata probes. Accessible
metadata does not bypass the financial endpoint restrictions. An authenticated
Marketstack-versus-SEC financial-fact crosscheck is blocked by Professional
entitlement; the comparator is implemented and tested, but no successful
real-provider financial comparison is claimed.

The 46 newly imported equities have no linked canonical company fundamentals.
Unproven company country, reporting currency and issuer identity remain null;
verified `listingCountry`/`listingRegion` do not fill those gaps. New public
EOD close charts do not certify valuation or fundamental strategy coverage.

## Read-only crosscheck contract

[`fundamental-crosscheck.js`](../providers/marketstack/fundamental-crosscheck.js)
exports:

```js
const { compareCompanyFacts } = require('./providers/marketstack/fundamental-crosscheck.js');
const diagnostic = compareCompanyFacts(marketstackCompanyFacts, officialSECCompanyFacts, {
  relativeTolerance: 1e-6,
  absoluteTolerance: 1e-6
});
```

The function accepts the documented Marketstack `.data` wrapper or a raw
companyfacts object. It performs no network access, production writes, source
mutation, revision selection or canonical financial calculation.

1. Require matching valid CIK identities.
2. Use the existing SEC metric registry to select reported facts for the key
   metrics and debt components; record the registry mapping version.
3. Match exact `(CIK, taxonomy, concept, unit, start, end, accession, form, filed)`
   identities. `fy`/`fp` are filing metadata, not inferred canonical periods.
4. Compare finite reported values with the greater of absolute and relative
   tolerance. Negative values and zero remain valid financial observations.
5. Flag duplicate facts as ambiguous rather than selecting a winning value.
6. Keep unmatched facts separate. Single-field provenance differences generate
   review diagnostics; they do not become value matches.

The artifact records `sourceRelation: SAME_REGULATORY_SOURCE`,
`canonicalMetricsCompared: false` and `pointInTimeCertified: false`. It contains
counts, rows, issues, tolerances and per-metric status for revenue, gross profit,
operating/net income, basic/diluted EPS, operating cash flow, capex, FCF, cash,
debt, assets, liabilities, equity and outstanding shares.

Raw FCF is not synthesized. Missing direct FCF or debt data exposes dependency
requirements and `DERIVED_METRIC_REQUIRES_CANONICAL_VALIDATION`. Matching reported
components does not validate canonical sign transformations, YTD reconstruction,
sector rules, ADR share basis or derived values. Any subsequent canonical
comparison must reuse existing normalization in isolated output and explicitly
match the same filing revision, periods, units and currency.

## Quality and PIT safeguards

The crosscheck flags missing/invalid dates, filing-before-period-end, invalid
accessions/values, unit dimensions, instant/duration mismatches, dimensional
facts, duplicates and material value differences. Reported foreign currency is
retained; monetary unit validation does not convert it to USD. Fiscal-label
disagreements are visible metadata diagnostics.

Marketstack company_facts does not document acceptance timestamps in each fact.
The submissions endpoint documents acceptance dates. Neither retrieval time,
calendar frame nor period end may substitute for the official public filing
moment. The crosscheck creates no `availableAt` field and cannot certify a
historical investment decision.

The SEC factbook keeps acceptance evidence and its existing conservative daily
reduction. The ESEF parser keeps evidenced publication instants and uses
conservative end-of-day availability where only a publication date is known.
Later revisions never overwrite earlier PIT observations.

## Validation

The new synthetic crosscheck tests cover wrapper/CIK identity, tolerances,
duplicate ambiguity, missing dates, currency/unit dimensions, periods,
amendments/YTD separation, missing derived metrics, determinism and unchanged
inputs. Synthetic fixtures do not establish API entitlement or provider quality.

```sh
node --test quant/tests/marketstack-fundamentals.test.mjs
node --test quant/tests/sec-adapter.test.mjs quant/tests/fundamentals-contract.test.mjs quant/tests/pit-fundamental-history.test.mjs quant/tests/global-equities.test.mjs
python3 scripts/quant/cli.py test
python3 -m unittest discover -s scripts/fundamentals/tests
```

The initial implementation check passed 12 new tests and 72 combined related
JS tests. Broader final regression and authenticated comparisons are reported
in the engineering report, rather than inferred from this targeted result.

Sources: [official V2 OpenAPI](https://api.swaggerhub.com/apis/apilayer-863/MarketstackAPIv2/2.0.0/swagger.json),
[official pricing](https://marketstack.com/product),
[accepted global operations](GLOBAL_EQUITIES_OPERATIONS.md).
