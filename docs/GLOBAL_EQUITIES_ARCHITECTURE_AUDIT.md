# Global equities — Phase 0 audit

Baseline: main `0ec4d2631de7bba4493c4b0665f3ce6e0cf26d55` (2026-10-01).
No AGENTS.md exists in this checkout. Work is additive on `feat/global-equity-data-layer`.

## Architecture map

| Layer | Existing implementation / propagation |
| --- | --- |
| Entry | Tiingo supported_tickers ZIP → `scripts/market/build-market-universe.mjs` → US security-master eligibility |
| Product membership | `scripts/market/universe-source.mjs#resolveProductUniverse`, reads eligibility; no independent product lists |
| Identity | `company-master.js`, stable instrumentId, legacy ref_* aliases; issuerId from CIK; instrument/search/issuer shards under quant/data/universe |
| Persistence | Versioned JSON/gzip artifacts; ignored .market-cache and .quant-state for checkpoints/raw data; history-store with filesystem/S3 drivers and R2 delivery. No SQL database or schema migrations |
| Prices | Tiingo server adapter → market-client budgets/retries/cache → market-quality → market-store; full backfill separated from incremental publication |
| Live | Cloudflare worker Tiingo IEX link, canonical relay, snapshot/polling fallback, subscriptions and freshness modules. Credentials remain server-side |
| Actions | Tiingo daily splitFactor/divCash; raw, split-adjusted and total-return bases stay distinct; other actions are not comprehensively supplied |
| Fundamentals | Python SEC provider → registry/fiscal/normalization/restatement/PIT → company FactBook → canonical/consumer artifacts → existing SEC adapter and product exporters |
| SEC foreign issuers | 20-F/40-F and IFRS registry already supported. 6-K is not treated as guaranteed quarterly structured coverage |
| Derived / Quant | Existing factors, evidence, quant-score, ranking hygiene and missing-data rules; no score redesign |
| Discover | Shared resolver + factors + canonical SEC consumer data → stocks/search/feed/collections. US_REAL is an existing route namespace and is retained |
| Screener | Columnar artifact built from Discover, master and factor evidence; country currently means exchange country; region mapping only US/CA |
| SuperTrader | Existing technical materialization and signal engines; USD liquidity thresholds and strategy-specific US universes must remain explicit |
| Markets / Research / Charts | Canonical instrument directory, market pulse, history APIs, session profiles and shared currency layer |
| Search / watchlists | Sharded company master and stable instrument IDs; server identity resolver currently picks first ticker match, unsafe for future collisions |
| Logos | Existing centralized Discover asset pipeline, company domain mappings, asset store and fallbacks. No new logo scraping/provider |
| Operations | GitHub Actions for universe, prices, SEC daily/consumer, logos, technical products and deployments; current runtime has no Tiingo/fallback secrets |

## Hardcodings / scale findings

- Exchange-derived US country cannot represent an issuer's headquarters or domicile.
- Tiingo import/scale scripts write USD/US even when input metadata differs; mapping holds currency but daily adapter ignores it unless passed explicitly.
- IEX quotes/intraday are a distinct US endpoint and cannot be reused for European venues.
- Company-master publication is intentionally US-primary/USD. Do not widen it beyond actual provider evidence.
- Existing calendars include European/Asian exchange sessions; holiday coverage varies and must not inherit NYSE coverage.
- Ticker-only maps in current materializers remain suitable for the current US-listed slice; local listings with collisions require explicit IDs before activation.
- Existing Discover/Screener valuation checks exclude non-USD reporting; missing ADR ratios must also block share-based valuation. Currency-neutral profitability/growth should remain available.
- Historical universe survivorship guarantees and analyst/revisions coverage are already incomplete; global expansion cannot claim to cure them.
- Existing client budgets are safety ceilings, not proven account entitlements. Use bounded/resumable runs and do not dispatch production backfills without credentials and coverage.

## Untouched baseline verification

- Quant: 2,054 passed, 0 failed.
- SEC Python: 484 passed, 0 failed.
- Discover / Screener / SuperTrader: 333 passed, 0 failed, 5 skipped (existing artifact-dependent tests).
- All runs were captured before implementation in /workspace/scratch/baseline-*.log.

## Decisions

1. Preserve US eligibility/membership, IDs, route names and scoring contracts. Enrich through an optional central global identity layer.
2. Prefer evidenced US-listed international securities now. Do not create European provider symbols by suffix guessing.
3. SEC issuer identity remains the company key when available. No name-based merges; ordinary security IDs and ADR ratios require separate evidence.
4. Official European structured documents normalize into the existing FundamentalFact shape. Uncertain extensions/dimensions stay unavailable; no PDF/AI number extraction.
5. UK and Switzerland have separate source policies. ESEF annual availability does not imply interim or quarterly availability.
