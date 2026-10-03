# Tiingo 2.0 canonical productization

Accepted baseline: draft PR #349 (`1cf199eb54f13dcf96226c5c86c75431a9446c68`).
Implementation and verified output review: [PR #353](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/353), stacked on #349. The [final report](FINAL_REPORT.md) records the verified counts and exact proposed additions.

The productizer consumes the existing authenticated discovery cache and listing-bound staging manifest. It does not replace discovery, SEC, Factor DNA, price producers or the central company-logo builder. All builders run in an isolated copy. New canonical IDs use the existing company/security/listing conventions. Existing instrument records, aliases, published capabilities and unscoped histories are preserved.

## Execution and gates

`.github/workflows/tiingo2-productization.yml` runs after the weekday incremental discovery workflow, or for changes to this draft PR. It restores only encrypted provider evidence. R2 access in this workflow is read-only: the existing SPY history is a reference for the existing factor engine, not a new consumer product.

1. Replay each candidate's original provider response, current raw/adjusted/corporate-action checks and official listing identity. Additional review acceptances require independent response/metadata/directory hashes.
2. Use the existing canonical builders, price normalization, SEC bulk ingestion/PIT, issuer fundamentals, market factors and Factor DNA producers.
3. Generate Search, Charts and Watchlist projections. Generate Discover, Screener, Markets and technical/signals projections using their existing product requirements. Missing evidence remains unavailable; SEC or a logo is not a universal title gate.
4. Resolve official company domains and run the central logo builder. Suspect assets use the existing fallback. Every company has a single canonical asset, reused by products.
5. Prepare an exact-byte canonical transaction with baseline CAS, per-listing product readiness and rollback before images. Private full histories are copied into an additive publication intent; raw provider histories and SEC cache are never public artifacts.
6. Capture the exact current canonical baseline privately before producers, then compare protected bytes/identities, memberships, aliases, unscoped factor values and historical prices. The immutable #349 audit remains available for review; later legitimate additions do not invalidate the next refresh. Document logical Factor DNA population and Discover rank changes.
7. Run release, unchanged resource budgets, the existing browser/accessibility/smoke suites, and every scoped title in Chromium and WebKit. Final QA binds the exact staged manifest, exact addition identities and prepared history hashes.
8. Only for the internal `codex/tiingo2-productization` PR, apply the verified canonical transaction to that review branch. This step cannot write main or production history storage. Regular scheduled runs prepare encrypted reviewable transactions.

Production deployment/merge and private history-store writes remain separate from this preview workflow. The prepared authenticated package contains full private history bytes and their additive-only intent, the canonical transaction, QA proof and rollback evidence. A storage publisher must perform its current zero-cost preflight and identity/index checks; it must not overwrite an existing history with different content. Canonical rollback retains additive historical data for backtests.

## Final package refresh after review corrections

`.github/workflows/tiingo2-publication-package-refresh.yml` validates the final committed review tree against the original authenticated publication transaction. It runs only as a same-repository PR check on the internal review branch and has no apply or deployment step. The existing staging APIs rebind corrected native names, capabilities, patterns, strategy and logo outputs; 113 private histories remain byte-exact. Original QA is discarded, and new protected, Chromium/WebKit, release, accessibility, smoke and unchanged budget proofs certify the final transaction before encryption. The original production baseline, history-store preflight and index CAS must still be current at actual publication. The normal weekday workflow retains its cheap `NO_CHANGES` path.

## Product-specific availability

The existing full seven-factor Quant composite methodology has `publication.allowed:false`. Productization does not override it. Actual available Factor DNA evidence is published as partial or technical-only evidence; missing factors are typed unavailable and never zero-filled. A title can support Search/Chart/Watchlist while a technical strategy, Discover rule or full Quant score remains unavailable.

Verified SEC company identity is retained independently of financial coverage. A newly listed issuer can have a confirmed CIK and company ID while periodic fundamentals and PIT remain unavailable. Contradictory SEC identity blocks a new candidate; missing financial statements do not fabricate scores or block otherwise validated basic products.

DNA's old `UNCONFIRMED:LISTING_INACTIVE` decision has a specific correction path through the existing canonical eligibility function. Current official listing, matched SEC issuer/PIT, exact provider history, valid corporate actions and staged chart provenance must all agree. Publication rederives the exact permitted before/after decision and instrument fields from proof bound to the staged manifest; other baseline instrument fields and all other instruments remain protected.

Short IPO histories use the existing compact-series renderer with an explicit `SHORT_HISTORY` gate of at least five actual bars; the default thirty-bar gate is unchanged elsewhere. Two-to-four-session IPOs retain an independently checked canonical price/quote projection and Search/Watchlist availability, while Charts explicitly remain unavailable. This narrow exception is bound to actual staged price bytes, action checks, current quotes and matching canonical IDs; no missing chart history is fabricated. MAX/weekly and full technical readiness keep their existing longer-history requirements. Blocked fresh revalidation of existing AMC/BIRD/AMWL does not revoke their published capabilities or historical chart artifacts.

## Outputs

Each full run exports the requested nine `tiingo2_*` materialization/readiness/publication JSON reports, plus protected shadow QA, all-title Chromium/WebKit QA, release/browser/accessibility/resource/smoke evidence, private-history publication metadata and final manifest-bound QA. Only authenticated ciphertext persists full private histories and rollback bytes.

Use `tiingo2_final_consumer_universe.json` for the exact proposed addition list; `tiingo2_publication_diff.json` contains each title's product, Quant and logo status. `REMOVED` must be empty. Machine-readable data in a particular run is authoritative; local baseline browser snapshots alone do not certify new titles.

## Delivery budgets

The release builder compacts existing market/universe JSON whitespace in the disposable release only. Every parsed field, missing/null value, identity and URL is retained. Source canonical data and production routing are unchanged. The existing Screener byte limit is not increased. Stock-section artwork is fetched when visible, preventing mobile offscreen overfetch while retaining the original image and unsupported-browser fallback.
