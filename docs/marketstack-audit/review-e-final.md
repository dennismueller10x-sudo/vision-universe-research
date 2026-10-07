# Final independent review E — realtime semantics

Reviewed `/workspace/vision-universe/providers/marketstack/client.js`, `audit-adapter.js`, `scripts/marketstack/capability-audit.mjs` and adapter test coverage. No paid API calls. Ran `node --test providers/marketstack/tests/audit.test.mjs`: **19 passed, 0 failed**.

**Verdict: no blocking realtime-semantic finding in the audit implementation.** This is an observation-only adapter, not a production registration or independent canonical price truth. Provider Europe realtime/delayed capabilities remain unverified until the account-backed evidence is collected.

Resolved earlier reference findings:

- `getRealtimePrice` routes to `/stockprice` separately from `/intraday` (audit-adapter.js:104–105). No US-IEX limitation is projected onto the worldwide snapshot endpoint.
- Intraday `interval` and `after_hours` are forwarded (audit-adapter.js:91; tests:49–50), without invented suffix transformations.
- Original provider fields survive in a deep-cloned `raw` object including future fields (audit-adapter.js:20–31; tests:53).
- Currency comes only from actual `price_currency` or `currency`; no currency is fabricated from market, country or canonical listing (audit-adapter.js:23).
- `marketTimestamp` records trade_last/date. `providerUpdateTimestamp` remains null unless an actual updated_at/update_timestamp field is returned (audit-adapter.js:29; tests:46–47). Retrieval time remains separate.
- Non-EOD delay remains UNKNOWN (audit-adapter.js:31). A successful snapshot neither claims realtime nor measures delay (audit-adapter.js:100).
- Listing MIC and exact ticker/explicit verified alias are required before price observations are accepted (audit-adapter.js:87–98); mismatches return raw evidence and fail explicitly.
- Audit runner creates a fresh client with TTL0, retries disabled and explicit cache0 requests (runner:36–42). Raw provider bytes are stored through the onResponse callback separately from normalized observations (runner:37–49).

One minor reusable-client caveat remains: `request(...,{cacheTtlMs:0})` still checks and can return an already-existing cache entry at client.js:126–127. This does not affect the audit runner because its new client only ever populates TTL0 requests. A generic mixed-TTL client should gate cache reads on `ttl > 0` or document TTL as write-only; existing adapter test:43–44 verifies consecutive TTL0 reads rather than warm-cache bypass. It must not be used as evidence of the historic two-day EOD lag.

Important evidence limits are preserved: trade_last denotes last-known trade, not publication time; an EOD date denotes trading date, not close/update timestamp; the raw intraday record is not certified as an interval OHLC candle; snapshot/EOD listings are not admitted to products by this adapter. Accordingly Europe REALTIME_SUPPORTED, DELAYED_SUPPORTED, EOD_ONLY, or UNSUPPORTED require live identity/timestamp/entitlement evidence outside these fixture tests.

## Final recheck after cache fix

The warm-cache caveat above is **resolved**: client.js:127 now requires `ttl > 0` before returning a cached response. A dedicated warm-cache regression at audit.test.mjs:98–99 verifies a second provider fetch and newer observed trading date. Re-ran the adapter suite: **23 passed, 0 failed**. Realtime review remains **PASS**, with no outstanding E findings and no paid API calls performed for review.
