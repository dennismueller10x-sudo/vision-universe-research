# Marketstack Europe production integration — controlled private foundation

This implementation adds an explicit Europe route through the existing canonical market-data and product surfaces. US consumers retain Tiingo, existing SEC readers, ranking populations, Product IDs and schedules. No existing production artifact is imported, rewritten or published by this work.

## Connector decision and baseline

PR [#479](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/479) supplied the corrected connector at `c7731194acd729b4bd8878487bd30807b1824332`. The conditional green-CI merge was not available. Its isolated connector/audit changes were reapplied to main baseline `2165c4bb70542962d2d22741a018470f84815bcf` in [#520](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/520). Audit responses are not production inputs. Full baseline regression reproduces five existing Quant failures; those are not waived to merge this integration. Main can advance independently, so the private final report records the final observed SHA and time separately.

## Reviewable merge order

| Stage | PR | Scope and prerequisite |
|---|---|---|
| 1. Connector/Core | [#520](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/520), [#523](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/523) | Corrected connector and provider-independent, rights-gated canonical Europe contract. Resolve inherited CI failures without changing methods. |
| 2. Europe Data Foundation | [#521](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/521) | Private discovery, price/identity quality, corporate actions, fundamentals gates, measured budgets and evidence compilers. Currently stacked on the connector branch. |
| 3. Discover/Search/Charts | [#525](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/525) | Discover-only diff, explicit Europe selection, canonical IDs and existing views. Requires Core and a qualified canonical catalog. |
| 4. Screener/Technical | [#526](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/526) | Separate Europe scope, nullable metrics, country/exchange/currency and freshness; existing engines and defaults. Requires Core and qualified projections. |
| 5. Quant readiness | [#527](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/527) | Separate authenticated Europe readiness; no US ranking membership, scores or methodology changes. |
| 6. SuperTrader readiness | [#528](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/528) | SuperTrader-only paths, shadow readiness and strict replay gates. No strategy, trading or schedule activation. |
| 7. Vorsorge/UCITS | [#529](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/529) | Authenticated secondary-source fusion with exact class/listing/currency binding. SEC N-PORT, ESMA FIRDS, GLEIF and Xetra remain primary sources. |

Retarget stacked PRs after their prerequisites merge, then rerun their required checks on the resulting base. The private producer-to-Core replay requires both the Foundation producer and Core contract; its script belongs to the Core PR. A Foundation CI job must not import a Core adapter that is absent from its branch.

## Evidence and publication boundaries

The raw layer keeps every full response with a SHA-256 manifest. Normalized observations retain raw fields; canonical identities and quote currency can add independently verified official-source evidence without filling missing provider fields. Company, security/share class and listing remain separate. An exact, current Xetra native mnemonic/MIC/ISIN bridge is allowed only for a blank provider ISIN; contradictory ISINs remain unresolved. A same-listing official quote currency can resolve a missing canonical currency; contradictory provider currencies are quarantined. No currency transfer to another venue or implicit FX conversion occurs.

Price validation rejects impossible bars, duplicate dates, invalid volume, foreign scope, future/uncompleted sessions and out-of-request-range observations. Invalid bars remain in quarantine, with their complete private source evidence. Current/last-session counts use exchange calendars, not weekday arithmetic. Raw chart readiness is separate from adjusted technical, Quant and replay readiness. An empty corporate-action response proves neither that no actions occurred nor that adjustments are certified. Unverified European benchmarks block RS; they never select a US default.

The public product audience is closed by default and rejects an unapproved scope before loading a canonical series. Private research is an explicit evaluation mode. Catalogs, prices, raw responses and unconfirmed ETF metadata remain outside the repository and public deploy paths. Commercial-plan availability is distinct from proof of rights for a concrete display or redistribution path.

On 8 October 2026 the public [Professional product page](https://marketstack.com/product) advertised 100,000 monthly requests and Commercial Use. The account contract/remaining budget is user-stated, not independently verified. The [terms page](https://marketstack.com/terms) redirects to APILayer legal terms; its linked SaaS agreement returned HTTP403 during this run. This is an unresolved rights-evidence gap, not an inferred permission or prohibition. No public Marketstack delivery was activated.

## Budget and refresh

One-time signed discovery/foundation/completion leases have immutable caps of 1,000/14,000/10,000 credits, totaling the 25,000 hard cap. Each request is conservatively reserved before transport and retains its reservation on failure. History runs once; a future refresh scenario batches latest EOD per MIC, requests corporate-action deltas and refreshes holdings at an explicit cadence. Batching reduces HTTP requests, not symbol credits.

The three completed leases measured 5,785 authenticated requests, 8,790 conservatively reserved credits and 5,785 hash-verified raw responses. Discovery used 261 requests/318 credits; foundation 4,068/5,453; completion 1,456/3,019. There were zero production writes. The completed inventory contains 259 accepted equity listings and 40 accepted ETF share-class/listing identities. A future identity-inventory scenario uses 9 MIC-scoped HTTP requests/299 symbol credits per latest-EOD refresh; 22 trading-day refreshes plus four corporate-action deltas and one holdings refresh yield 2,630 requests/9,770 credits monthly. Holdings alone require 40 queries/800 reserved credits per refresh. These are conservative scenarios, not billed consumption or evidence that those products are ready. Actual billed credits, other account workloads and a safe monthly allocation remain unknown. No recurring refresh schedule is enabled.

## Validation and reviews

See [REGRESSION_VALIDATION.md](REGRESSION_VALIDATION.md), the `review-*` files, [PRODUCT_INTEGRATION.md](PRODUCT_INTEGRATION.md), [BENCHMARKS.md](BENCHMARKS.md) and [FUNDAMENTALS.md](FUNDAMENTALS.md). Independent equity, price, corporate-action, fundamentals, holdings, product, credit/performance and regression reviews retain their findings and fixes. Final private producer outputs and actual product replay provide per-security readiness; fixture tests are not counted as live availability.
