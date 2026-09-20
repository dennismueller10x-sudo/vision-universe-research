# Discover 2.0 visual generation: architecture and data audit

Audited baseline: `27b045971cb5a96db71646a5e5befe63943b4e5e`.

## Canonical sources

All new presentation consumes `/discover/data/` metadata, home chunks, rows,
stock bundles, search and feed. There are 34 published home surfaces in three
chunks; 54 hidden surfaces must not be invented or presented as available.
The shared Discover renderers retain historical-series, fundamental, valuation,
freshness, source-state and eligibility interpretation.

Compared with the previous v2 audit baseline `e4bcd8e1`, Discover source and
data have no changes. New Quant commits add existing SEC quarterly delivery,
product-service integration and trade relay support. They do not authorize a
second Discover transport or a semantic change to the Discover live reference.
The regression baseline must advance to the actual starting commit to avoid
mistaking these independent prior changes for changes by this redesign.

## Return content that is supported

Use canonical new-year-highs, breakout-watch, momentum leaders, index leaders,
comeback, growth/profit/margin, cashflow and fundamental-turnaround collections.
Show their actual snapshot date. Current inspected Apple snapshot is
2026-09-17; its fundamental hook is dated 2026-09-14. Neither implies today.
No audited contract establishes ranking deltas, newly added titles since the
previous visit, actual visitor demand, or yesterday-to-today transitions.
Avoid inventing “Heute neu”, “Gerade gefragt” or “Ranking-Aufsteiger”.

Ranking card order, `row.rule`, editorial designation and index provenance
remain canonical. Page composition may reorder worlds; it may not silently
reorder a ranking or replace its ranking basis with the most prominent card
performance number. Index proxy holdings must stay identified as a proxy.

## Session and feed

Canonical feed uses a deterministic 400-title order, initial 12 cards and
batch loading with duplicate suppression. Shared renderer already supports
`merken`, `resumeIndex`, optional within-batch affinity and continuation links.
Old v2 did not pass the memory options. Shared `D.Memory` supports recent
views, opened symbols, collection affinity and named positions; reuse these.
Its store is device-local, not an account or a saved watchlist.

Shared feed resume has a six-batch loading cap. A v2-specific presentation
adapter may resume by rotating/slicing the existing order with truthful
position labels, or otherwise restore deeper positions safely. Do not change
the shared v1 renderer to implement v2 UX. Ensure initial population remains
bounded and visible current stock agrees with the counter after a swipe.

No saved-watchlist implementation was found in Discover app, engines or UI.
“Zuletzt angesehen” is supported. Labeling these entries “Watchlist” would
misrepresent their meaning.

## Realtime and financial truth

Initialize existing LiveHub once. Use its stock-page scope and existing
`wss://live.visionuniverse.de/live` configuration; metadata limits subscription
to five symbols and identifies TIINGO_IEX_LEVEL6 / REALTIME_REFERENCE. Keep
snapshot, last-session and stale handling in canonical renderers. Do not
label static home ranking values live, and do not use new Quant trade-relay
semantics to reinterpret Discover reference quotes.

Performance cards must show the actual metric horizon; historical charts
must disclose their own horizon when different. The chart’s direction remains
green/red/neutral independently of collection atmosphere. Missing data is not
zero; shared artwork can fall back from price history to a return ladder and
its label must acknowledge that fallback.

Example correction to an earlier conversational claim: Apple's −13.8% value
is `rawValues.maxDrawdown252d`, not maximum drawdown over all history. Its
38.69 P/E comes from the canonical TTM valuation bundle. Preserve each metric's
period, economic-sanity state and source instead of embellishing the story.

## Remaining implementation review

After implementation, inspect only v2 changes for network source expansion,
new calculations, source-label changes, memory correctness and subscription
cleanup. Verify Discover1 and canonical files remain byte-identical to the
starting baseline. Browser checks must prove actual hero/feed motion and
visible next-title transitions, not only successful rendering.

## Implementation review findings

The new shell preserves canonical collection order and adds explicit dated
ETF proxy membership provenance. Feed continuation uses an unchanged suffix
of canonical order and loads only its initial batch. Its counter describes
the remaining selection, marked “Fortgesetzt”, with a reset action. Position
memory stores the original absolute index. This avoids loading hundreds of
previously viewed stock bundles merely to restore a deep session.

Stock-page changes move canonical DOM nodes and retain original chart,
fundamental and source-state listeners and the existing guarded live cleanup.
No new financial computations or data providers were introduced there.

Home-story critique identified a concrete evidence-period mismatch: LHX's
cashflow comparison covers FY2015–FY2025, while its canonical “+25% zuletzt”
statement covers FY2024–FY2025. Matching only the metric is insufficient;
displayed chart statements must also match period endpoints and values or
show their separate period explicitly. Root also flagged that negative values
must use a signed zero baseline or the canonical fallback, never absolute
upward bars. Both findings were corrected before browser QA: story text now
requires exact metric, fiscal endpoints and endpoint values, and any negative
comparison delegates the entire surface to its existing canonical renderer.

Final source-contract review: PASS. The regression gate confirms 39,223
protected files and shared navigation unchanged against the starting baseline;
noindex remains enabled. This source review does not substitute for browser
interaction, performance or visual gates.
