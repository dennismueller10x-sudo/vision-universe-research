# Marketstack provider audit contracts

This is a Node-only, inactive provider observation adapter built from current main.
Main had no Marketstack adapter. The transport is ported selectively from unmerged
PR #461 (`3f11a5a9d523e2b12f448ff91a6ddf7783cdaf7e`) and corrected; its canonical
ISIN adapter, product builders, cache wrappers and workflows are not imported.

`createAuditAdapter()` provides `searchTicker`, `listExchangeTickers`,
`getLatestEOD`, `getHistoricalEOD`, `getRealtimePrice`, `getIntraday`, `getSplits`,
`getDividends`, `getETFHoldings`. It also exposes documented exchange/ticker/ETF
metadata reads. These are real documented v2 routes. Method presence does not
certify that this account or a given listing supports the data.

All price observations require `{providerTicker, mic}`. `mic` is the requested
provider MIC, not an inferred mapping from a symbol suffix. `resolveTicker` tests
explicit candidate strings, preserving attempts and returning
`identityVerified:false`; matching a provider row cannot authorize Core identity.
Search matches are not automatically aliases. Verified symbol relationships and
ISIN/share-class mapping must be established before product admission.

Results separate `raw` and `normalized`; no product payload is emitted. Raw
fields, adjusted observations and original holdings weights are retained.
Unknown fields stay in the raw object. `providerUpdateTimestamp` is null unless
an update field actually occurs; last trade time is never a provider update time.
Stockprice is independently routed from intraday; all delay/capability states
start UNKNOWN. No global adjusted-field observation grants methodology admission.

Live stockprice accepts native ticker strings and provider venue codes rather
than the documented MIC filter. Pass an explicitly observed `canonicalTicker`
or `snapshotTicker` for that endpoint; no suffix is stripped implicitly. The
audited ETR/XETR, EPA/XPAR, AMS/XAMS and NASDAQ/XNAS mappings are linked to raw
response hashes in `snapshot-exchange-mappings.json`. Unmapped or ambiguous
home venues fail visibly, while raw retains every venue, including symbol
collisions. An accepted quote does not certify freshness or realtime latency.
Stockprice calls are paced at least 61 seconds apart. Metadata `about` prose is
preserved as `description`, without fabricating structured fund attributes.

Pagination validates count, offset and stable total; uses actual count rather
than requested limit; detects repeated pages; reports caps and errors explicitly.
A nonzero starting offset cannot certify the full population. Batch wrappers
propagate incompleteness. A response without pagination stays incomplete; an
optional `probePagination:true` ETF differential experiment cannot by itself
certify full holdings. ETF FULL requires consistent exact ticker/report identity,
valid report date, nonempty holdings, valid total and no repeated cross-page rows.
All duplicate positions and signed weights remain intact; no 100% renormalization.
Report-period start is exposed separately from provider-reported period end.
FULL describes pagination of that report, not issuer completeness or freshness.

`client` fixes HTTPS to api.marketstack.com/v2, injects access_key only at fetch,
requires a shared budget before real requests, and reserves all retries/pages.
ETF list/holdings each reserve 20 credits. Symbol batch costs are conservatively
reserved per symbol/page. These are estimates, not observed account billing.
Cache TTL defaults to five minutes in the generic client; audit reads explicitly
use TTL0, including bypassing a pre-existing warm entry. No stale fallback.
The awaited `onResponse` receives redacted original `rawText` before adapter
normalization; persistence failure withholds success.

The live runner is explicit, never scheduled, and writes only outside the repo:

```bash
node scripts/marketstack/capability-audit.mjs
node scripts/marketstack/capability-audit.mjs --live --out=/absolute/private/new-run
```

The first command is offline and makes zero account requests. The second requires
`MARKETSTACK_API_KEY` supplied through the execution environment, never the CLI.
Default cap is 1,999 estimated additional credits; configured caps cannot exceed
3,500. A durable run ledger reserves before requests, a run lock prevents parallel
use of one output, and existing ledgers cannot be reused silently. Auth/quota/budget
failures stop later probes. No account balance or plan verification is invented.
The 42-case plan includes the 39 website parity cases and three action controls.
Histories use one-row boundary samples, not mass history/universe ingestion.

Validation:

```bash
node --test providers/marketstack/tests/*.test.mjs
node scripts/quality/check-test-isolation.mjs --suite 'providers/marketstack/tests/*.test.mjs'
```

Every test uses synthetic transport. Authenticated Actions runs and independent
raw-response reviews now establish scoped account/website parity and freshness.
Frozen one-shot Actions leases total 3,500 reserved credits; the final signed
marker only authorizes a child of the exact reviewed source and cannot replay.
No schedule or production registration is added. See
[the audit report](../../docs/marketstack-audit/ROOT_CAUSE_REPORT.md).
