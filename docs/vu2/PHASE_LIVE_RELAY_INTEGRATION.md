# Existing relay integration — continuation after PR114/115

Base: 3d44d5bc470d5a38197f0a9d78b2f63270df401c. Main drift since PR115
only updates the existing weekly-series index. No shared source conflict.
PR115 deployed at 1127c99c; previous targeted production smoke verified the
versioned bundle, TSLA canonical history and annual facts. Whole-product PASS
was not claimed.

## Active requirement and scope
Reuse Cloudflare wss://live.visionuniverse.de/live, shared WebSocket transport,
canonical Product Service identity/permission and existing intraday snapshots.
No Discovery edits, provider access, secret/configuration changes or new backend.
Only confirmed typed trades may move the Quant live view; quote/unspecified
updates and mixed reference OHLC must never become trade prices/candles.

## Contract / files
quant/api/live-relay-client.js adapts vu-live-update-1.1.0 into bounded observed
trade points. It consumes the existing parallel semantics array and refuses
legacy/untyped, malformed, stale, future, duplicate/out-of-order updates.
quant/engines/realtime/transport.js ignores open/error callbacks after stop.
quant/ui/charts.js adds optional x-label formatting; existing default unchanged.
vu2/index.html and experience.js connect the adapter only on explicit stock-page
request, only in the regular session. Hidden tab/page exit/session close closes
subscription. No automatic reconnect storm; retry is explicit. Historical and
snapshot charts are independent and never modified by live events.

## Acceptance / tests
Unit tests cover identity, semantics, staleness, ordering, quota denial, cleanup,
late callbacks and retry isolation. Existing worker/Discovery regression required.
Browser QA tests real snapshot UI at desktop/390 and separate test-only WebSocket
fixtures for trade/quote invariants. Those fixture screenshots are NOT proof of
production provider trades. Production session may be closed; never fabricate a
live-session PASS. Visual inspection, accessibility and unchanged resource budget
remain pre-merge gates. Rollback: base SHA; no data/storage mutation.

## Remaining integration
Full-universe Quant/Technical/screener inputs and quarterly/PIT delivery remain
open. This slice does not certify complete backtest data, live event coverage or
all-symbol live availability. Existing per-domain coverage report remains scoped.
