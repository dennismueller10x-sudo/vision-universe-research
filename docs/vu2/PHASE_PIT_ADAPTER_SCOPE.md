# Retained R2 Fundamentals adapter — bounded continuation

Current base: `3345715ab045cf5977ef9d3f177051be581f312a` (`main`, including
independent Discover 2.0 PR #119). The Owner permits reuse of the existing PR #111
adapter only for complete Fundamentals revisions and PIT queries that static
artifacts cannot answer.

## Locked scope

- Reuse `api/fundamentals.py`, `scripts/vu2/fundamentals-serving.py`, Company
  Master identity, SEC `PeriodResolver`/`FactTimeline`, and the existing R2 index.
- Require `scope=full_history` and an explicit `asOf` cutoff.
- Include every stored fiscal year and every canonical observation visible at
  that cutoff. Period scope must itself be cutoff-visible; visible-only
  `restated` evidence must never reveal later filings.
- Preserve exact R2 object namespace and compressed-byte SHA-256 verification.
- Keep normal annual/quarterly product views on existing static artifacts.
- Keep market History, Intraday, Realtime, Discovery, ingestion and normalization
  outside this activation.

`full_history` means the complete canonical history currently stored for one
issuer. It does not claim every filing ever published by the SEC. Backtest calls
must use `as_of_latest`; timestamp cutoffs reject filing-date-only evidence.
Backtest payloads expose `revisionHistory` as their sole certified PIT fundamental
source. Current SIC/profile metadata can alter resolved sector rows, so resolved
`history` and industry rows are omitted for `usage=backtest`; historical issuer
classification remains an explicit limitation rather than a retroactive input.
Professional backtest readiness still depends on universe, corporate actions,
execution, costs and slippage.

## Fail-closed bounds

- one canonical issuer per request;
- explicit scope and cutoff before identity or R2 reads;
- compressed factbook <= 16 MiB and decoded factbook <= 64 MiB;
- decoded index <= 32 MiB;
- response <= 4 MiB, otherwise `RESPONSE_BUDGET_EXCEEDED` with no truncation;
- exact index key/digest and supported schema versions;
- no secret values in URL, response, client assets or logs.

Activation is additionally gated by non-secret `VU_PIT_FUNDAMENTALS_ENABLED=true`.
The parked market-history endpoint has a separate
`VU_MARKET_HISTORY_API_ENABLED=true` gate and remains disabled. Thus adding the
shared existing R2 binding cannot silently activate the alternative market-history
API. `/api/status` reports both capabilities independently.

## Production dependency

The Vercel Production project currently has none of the `VU_HISTORY_S3_*`
variables. GitHub Actions demonstrably has the existing R2 binding, but GitHub
secret values are not exportable and the repository contains no Vercel management
token or secure transfer workflow. No value was read, logged or requested.

Manual Production-only binding is therefore the external Owner gate. Required
existing names are `VU_HISTORY_S3_ENDPOINT`, `VU_HISTORY_S3_BUCKET`,
`VU_HISTORY_S3_ACCESS_KEY_ID`, and `VU_HISTORY_S3_SECRET_ACCESS_KEY`;
`VU_HISTORY_S3_REGION` is needed only when the existing value is not `auto`.
Set the non-secret `VU_PIT_FUNDAMENTALS_ENABLED=true`; do not set
`VU_MARKET_HISTORY_API_ENABLED` for this workstream.

After a Production redeploy, verify `/api/status`, representative current and
historical NVDA/TSLA full-history responses, exact amendment acceptance cutoffs,
unsafe-policy/future-cutoff failures, response budgets, and unchanged static Pages.
Until that evidence exists, R2 Production access and Production PIT smoke remain
blocked rather than inferred from synthetic tests.

The activation decision also still requires an existing-platform operational
budget (rate/concurrency/request control). Per-request size limits are not a
global cost ceiling, and the public endpoint is not being represented as
cost-bounded merely because it is feature-gated. Keep the flag disabled until
that production control and its no-overage behavior are evidenced or explicitly
approved by the Owner.

Rollback is the branch revert plus removal of the PIT enable flag. Static product
delivery remains available; no data migration or deletion is involved.
