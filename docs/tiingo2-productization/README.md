# Tiingo 2.0 canonical productization

Accepted baseline: draft PR #349 (`1cf199eb54f13dcf96226c5c86c75431a9446c68`).
Implementation and verified output review: [draft PR #353](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/353), stacked on #349.

The productizer consumes the existing authenticated discovery cache and listing-bound staging manifest. It does not replace discovery, SEC, Factor DNA, price producers or the central company-logo builder. All builders run in an isolated copy. New canonical IDs use the existing company/security/listing conventions. Existing instrument records, aliases, published capabilities and unscoped histories are preserved.

## Execution and gates

`.github/workflows/tiingo2-productization.yml` runs after the weekday incremental discovery workflow, or for changes to this draft PR. It restores only encrypted provider evidence. R2 access in this workflow is read-only: the existing SPY history is a reference for the existing factor engine, not a new consumer product.

1. Replay each candidate's original provider response, current raw/adjusted/corporate-action checks and official listing identity. Additional review acceptances require independent response/metadata/directory hashes.
2. Use the existing canonical builders, price normalization, SEC bulk ingestion/PIT, issuer fundamentals, market factors and Factor DNA producers.
3. Generate Search, Charts and Watchlist projections. Generate Discover, Screener, Markets and technical/signals projections using their existing product requirements. Missing evidence remains unavailable; SEC or a logo is not a universal title gate.
4. Resolve official company domains and run the central logo builder. Suspect assets use the existing fallback. Every company has a single canonical asset, reused by products.
5. Prepare an exact-byte canonical transaction with baseline CAS, per-listing product readiness and rollback before images. Private full histories are copied into an additive publication intent; raw provider histories and SEC cache are never public artifacts.
6. Compare protected baseline bytes/identities, memberships, aliases, unscoped factor values and historical prices. Document logical Factor DNA population and Discover rank changes.
7. Run release, unchanged resource budgets, the existing browser/accessibility/smoke suites, and every scoped title in Chromium and WebKit. Final QA binds the exact staged manifest, exact addition identities and prepared history hashes.
8. Only for the internal `codex/tiingo2-productization` PR, apply the verified canonical transaction to that review branch. This step cannot write main or production history storage. Regular scheduled runs prepare encrypted reviewable transactions.

Production deployment/merge and private history-store writes remain separate from this preview workflow. The prepared authenticated package contains full private history bytes and their additive-only intent, the canonical transaction, QA proof and rollback evidence. A storage publisher must perform its current zero-cost preflight and identity/index checks; it must not overwrite an existing history with different content. Canonical rollback retains additive historical data for backtests.

## Product-specific availability

The existing full seven-factor Quant composite methodology has `publication.allowed:false`. Productization does not override it. Actual available Factor DNA evidence is published as partial or technical-only evidence; missing factors are typed unavailable and never zero-filled. A title can support Search/Chart/Watchlist while a technical strategy, Discover rule or full Quant score remains unavailable.

Short IPO histories use the existing compact-series renderer with an explicit `SHORT_HISTORY` gate of at least five actual bars; the default thirty-bar gate is unchanged elsewhere. MAX/weekly and full technical readiness keep their existing longer-history requirements. Blocked fresh revalidation of existing AMC/BIRD/AMWL does not revoke their published capabilities or historical chart artifacts.

## Outputs

Each full run exports the requested nine `tiingo2_*` materialization/readiness/publication JSON reports, plus protected shadow QA, all-title Chromium/WebKit QA, release/browser/accessibility/resource/smoke evidence, private-history publication metadata and final manifest-bound QA. Only authenticated ciphertext persists full private histories and rollback bytes.

Use `tiingo2_final_consumer_universe.json` for the exact proposed addition list; `tiingo2_publication_diff.json` contains each title's product, Quant and logo status. `REMOVED` must be empty. Machine-readable data in a particular run is authoritative; local baseline browser snapshots alone do not certify new titles.

## Delivery budgets

The release builder compacts existing market/universe JSON whitespace in the disposable release only. Every parsed field, missing/null value, identity and URL is retained. Source canonical data and production routing are unchanged. The existing Screener byte limit is not increased. Stock-section artwork is fetched when visible, preventing mobile offscreen overfetch while retaining the original image and unsupported-browser fallback.
