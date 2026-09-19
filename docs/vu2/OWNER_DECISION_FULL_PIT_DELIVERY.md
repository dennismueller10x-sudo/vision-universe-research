# Decision boundary: full canonical fundamental history and PIT delivery

This is a bounded remaining requirement, not a claim that the whole build is blocked.
No additional service or secret is activated by this document or PR118.

## Evidence from current committed artifacts

- quant/data/fundamentals/persistence.json, generated2026-09-19:5,480persisted
  factbooks,5,337PIT histories,639,862,725stored bytes in the existing R2 prefix.
  Versions:5,433normalization1.9.0 and47normalization1.10.0. These are recorded
  pipeline measurements, not a new independent R2 read.
- Current daily health2026-09-19:9factbooks updated; R2 persistence and reload
  without SEC refetch PASS. Full sources retain versions and PIT fields.
- Existing committed SEC consumer is a separate bounded delivery projection:
  5,067files, latest-as-of snapshot, default eight quarters. It has no complete
  revision chain or acceptance-time history. Example TSLA consumer is generated
  2026-09-14, normalization1.6.0. Serving that snapshot does NOT imply current
  R2 contents have been integrated. UI now states the actual preparation date.
- PR118 only exposes those existing standalone quarter facts with provenance;
  it does not regenerate them, alter SEC normalization, supply full lifetime
  history, or certify PIT. Older consumer/source refresh remains an explicit gap.
- Full consumer files alone still use13,959,164bytes when compressed per issuer;
  complete stored R2 factbooks are substantially larger. The8MiB release gate is
  unchanged. This does not preclude small projections; PR118 demonstrates those.

## Precisely missing capability

A professional research/backtest request for an arbitrary security and historical
as-of instant must select the canonical revision and availability timestamp then
known, across the full history. A latest-known eight-quarter snapshot cannot
recover removed revisions or acceptance timestamps. Current compact issuer shards
only describe coverage, not the complete historical facts. Do not infer PIT from
filing-date granularity or relabel current values as historically available.

## Smallest proposed exception to the artifact-only serving decision

Reuse the retained PR111 read-only Python path (`api/fundamentals.py`,
`scripts/vu2/fundamentals-serving.py`, `server/r2_reader.py`) in the existing project
ONLY for full fundamental/PIT requests that the small artifact cannot answer.
Its projection delegates to the existing SEC PeriodResolver and verifies the
existing R2 index/object digest. R2 remains the only historical source of truth.
Do not activate the parked History/Intraday/Realtime API alternatives. Existing
canonical series, snapshots and Cloudflare live relay stay unchanged. Discovery
stays unchanged; its future use of the same read-only fundamentals path is possible.

This is an Owner architecture decision under the explicit artifact-only rule:
additional serving is permitted only after demonstrating a concrete unmet use case.
It is NOT another request for Tiingo licensing, a request to raise8MiB, or a request
for secrets now.

## Conditions before any activation

Revalidate identity/eligibility parity against current Company Master, full as-of
semantics and industry/currency evidence. Confirm existing project/environment
and whether an authorized server-side R2 binding already exists. Do not duplicate
credentials automatically. Bound requests, caching, decompression, concurrency and
budget; do not enable unrestricted historical exports. Existing tariff only;
no cost/overage assumption is made here. If paid capacity is required, stop for
Owner approval. Preview protection must remain separate from the chosen public
production API. Production smoke and negative tests required before enablement.

Rollback: retain production.enabled=false / revert the scoped consumer configuration;
no data migration or deletion. Public artifact experiences remain available.

Owner options: authorize this narrowly scoped reuse of the retained serving path,
or keep artifact-only delivery and explicitly defer arbitrary full-history/PIT
requests. No implementation of a new serving path should precede that decision.
