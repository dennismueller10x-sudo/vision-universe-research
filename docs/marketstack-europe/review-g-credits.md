# Independent G — credits and performance

Reviewed 8 October 2026. Status: **APPROVED FOR PRIVATE BOUNDED EXECUTION**.
This is not certification of Marketstack account billing or monthly headroom.

**G-4, medium, fixed locally after the signed collector checkpoint:** a partial
latest page could leave a valid-looking row in `r.data` while `r.ok`/`r.complete`
were false, authorizing expensive history despite an uncompleted batch. Eligibility
now also requires both flags to be exactly true. Independent regressions cover
page-budget exhaustion, unverified pagination and HTTP503 after a valid first
page; all retain raw/partial rows but skip history, splits, dividends and snapshots.
The already active signed collector checkpoint was not modified or retriggered.
Its partial latest responses require exclusion during downstream admission.
Final credits/collector/report validation after this fix: **28/28 passed**.
The independent complete provider/foundation rerun passed **222/222**.

The signed completion plan was independently recomputed: 1,307 operations and
at most **3,988 reserved credits** (metadata 378, latest 1,390, history 1,152,
splits 268, dividends 268, tickerInfo 52, holdings 480). At most 2,263 HTTP
attempts are planned; symbol batching reduces HTTP count but preserves credits.
Holdings includes the
maximum two attempts for each of twelve queries at twenty credits each. Prior
measured reservations are 5,771; the maximum combined total is 9,759, leaving
5,241 below the 15,000 target and 15,241 below the hard cap. These are reserved
credits, not observed billing. The completed signed run independently reconciles **1,456 HTTP attempts and
3,019 reserved credits**, below its 3,988 bound. All 1,456 response hashes were
verified; the 1,456 sequential journal entries sum to 3,019 and agree with ledger,
summary and transport. Aggregate measured bootstrap is **5,785 requests / 8,790
reserved credits**, leaving 6,210 below target and 16,210 below the hard cap.
All twenty executed latest batches are pagination- and coverage-complete; the
remaining metadata-blocked batch made no request. All 844 `requiresLatest`
operations were independently reconciled with their preceding complete scoped
batch, with zero execution violations. Thus G-4's incomplete-batch path was not
exercised in the frozen paid run. Final refresh scenarios require the final
accepted listing inventory; safe monthly headroom remains unknown.

Completion collector follow-up reviewed independently: raw-only tickerInfo
operations require a European MIC, and requiresLatest history/action/snapshot
operations require a preceding bound symbol/MIC batch with explicit eligible
sessions. Current valid OHLC, finite nonnegative volume and exact observed date
are checked before collecting further history. This authorizes collection only;
it does not certify identity, liquidity, canonical prices or public rights.

**G-3, medium, fixed and independently reverified:** latest eligibility originally
survived a later missing/ambiguous batch, and an unbounded stale batch could
reuse a previous bounded precondition. Every new batch now clears all requested
listing keys before transport/metadata gating; only that batch's explicit
eligible-session observations can restore eligibility. The compact summary
also preserves a boolean skipped flag. Five offline regressions confirm that
missing, duplicate, HTTP503, unbounded stale and metadata-blocked successors
prevent every subsequent history/split/snapshot call.

Pre-G-4 completion collector/credits suite: **24/24 Node 22 tests passed**, zero
skips. Frozen one-use allocations remain 1,000/14,000/10,000, totaling 25,000;
the default first-two-lease target remains 15,000. No paid review calls or
production writes were made.

Follow-up finding **G-2, medium, fixed and independently verified**: the existing
shared `market-client` retains parsed response bodies even with TTL zero. Private
ingestion now clears its client cache in `finally` after every operation and
controlled 504 retry, bounding retained bodies to the current operation/page
limit. Full source evidence remains in private files. No shared/core/US transport
behavior changed; accounting and endpoint pacing remain intact.

The earlier **G-1 compact-summary retention finding is fixed and independently
verified**: full normalized/raw results remain only in private per-operation
files; the summary holds paths, status and counters. The 14-test selective suite
passed after that correction.

Latest-batch additions were independently reviewed: pagination completeness is
separate from listing coverage. Wrong MIC/symbol, multiple same-symbol latest
rows and missing requested listings cannot yield an admitted complete latest
batch; all rejected original observations remain private. Exact symbol/MIC/ISIN
metadata gates prevent expensive history calls when identity is unresolved,
explicitly fund/debt/warrant/other excluded metadata or inactive. No canonical
or publication admission is implied by provider observations.

Earlier Node 22 selective credits/ingestion validation: **19/19 passed**, including
new successful metadata/latest/history flow, duplicate/missing/foreign batch
isolation, and seven explicit non-equity/inactive metadata rejection cases.
No inspected blocker remains for a signed bounded private foundation batch.

`europe-credits.mjs` uses one shared run ledger, default target 15,000 and hard
cap 25,000 conservative credits. All clients reserve before transport; failed
HTTP responses and retries retain their reservations. Existing ledgers cannot be
resumed or reset. Exclusive locks, private paths, dangling-symlink refusal,
fsynced attempt journal and bounded atomic snapshots fail closed on corruption,
rollback, lock replacement or persistence errors. Per-attempt disk writes do not
rewrite the entire reservations history. Batch estimation uses the connector's
symbol/page semantics and 20 credits per holdings query.

The root runner's frozen leases sum to 25,000 (1,000 discovery, 14,000 foundation,
10,000 completion); discovery plus foundation equals the 15,000 target. A signed
exact-parent/plan marker, sole marker-change gate, first-run restriction and lease
history checks prevent unreviewed invocation or replay. The review found a title
binding gap; it is resolved by requiring `head_commit.message === marker.lease`.
Runner terminal accounting codes, bounded output logs, final manifest writes and
testable once-only 504 retry were also corrected.

Node 22.23.3 tests: 14/14 credits and ingestion tests passed, including two 504
attempts reserving 40 credits. Evidence:
`/workspace/marketstack-europe-private/gh-review.tap` (private execution artifact).
No paid calls were made by this review.

The refresh model counts supplied observed listing inventories, separates
one-time history from latest EOD, action deltas and holdings cadence, and preserves
original holdings identities. Monthly plan 100,000 is labelled user-stated;
actual billed credits, account remaining credits, existing workloads and safe
monthly feasibility remain UNKNOWN/UNVERIFIED. No refresh schedule is enabled.


## Final measured inventory cost report

Final producer inventories confirmed after completion contain **259 accepted
European equity listings and 40 accepted ETF share-class listings**. Their hashes
and the immutable equity publisher manifest are bound into the private
`productization/marketstack_refresh_credit_model.json`, together with all three
measured summary hashes. Identity acceptance does not imply fresh prices, UCITS
certification or complete holdings.

Measured bootstrap: **5,785 requests / 8,790 reserved credits**. Daily latest
scenario: **9 per-MIC HTTP requests / 299 symbol credits**. Assuming 22 trading
days, four corporate-action delta refreshes and one monthly holdings query per
accepted ETF identity, optimized monthly scenario: **2,630 requests / 9,770
credits**, including **40 holdings queries / 800 credits**. The one-time history
scenario uses the maximum four-page bound observed in accepted-listing operations;
it is a conservative scenario, separately labelled from measured bootstrap cost.
Account billing, remaining monthly allocation and other workloads are unknown;
safe monthly cost remains null, and no schedule or public release is enabled.
