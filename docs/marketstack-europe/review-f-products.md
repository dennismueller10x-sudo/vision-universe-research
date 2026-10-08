# Independent F product-contract review

Reviewer: ESEF/identity agent, independently of the Core/Discover author. Reviewed `core/europe-market-data.js`, existing `core/client.js`, the new Core tests, `discover/engines/europe-product.js`, and release allowlisting. Review runs use synthetic in-memory catalogs and storage only; no production data writes or paid calls.

## Findings resolved by the author

1. **High — mutable audience/rights could unlock an already constructed public client.** `create` retains the caller's `options`; `gate` reads `opts.audience` and `opts.rights` on every request. Reproduction: initial `getSecurity` is `UNAVAILABLE`; changing the original options audience to `research` makes it `AVAILABLE`. Mutating the original closed rights object to set display/commercial/evidence/data paths does the same. Snapshot the default-public audience and deep-copy/freeze rights at construction. Explicit rights changes should require a new reviewed client instance. Include mutation tests. Snapshot protected IDs used by watchlist validation as well.

2. **High — technical projection was not bound to its listing.** `readiness` accepts `TECHNICAL_READY` plus `engineProjection: true` for another security/listing/currency. Reproduction: `secA/listA/EUR` remains `TECHNICAL_READY` with a technical object explicitly naming `secB/listB/USD`. Require exact security/listing/currency projections before promotion or exposure; benchmark evidence must remain European. The separately reviewed fundamentals evaluator already checks this binding.

3. **Medium — future chart observations were accepted.** With `now=2026-10-08`, a positive point and matching `CURRENT` catalog date of `2029-01-01` produces an available chart. Syntax/date ordering checks do not establish temporal validity. Reject future latest/series dates relative to the evaluation clock; retain exchange-calendar freshness evidence upstream.

4. **Medium — the facade omitted existing US-only contract methods.** Existing Core exports `getNews`, `stockPage`, and `discoverIndex`; Europe facade omits them. Replacing a Core client with this facade would remove these existing capabilities despite preservation of the seven delegated market-data methods. Pass all existing non-Europe methods through without changing references/arguments/results, or keep the facade as a separate client and prove all existing consumers retain the original client. `getNews` omission reproduced directly.

## Confirmed protections

- Public reads default closed unless the concrete data path has explicit display/commercial evidence. Canonical adjusted rights do not authorize raw EOD rights.
- Catalog, series, snapshot and fundamentals paths preserve explicit security/listing identities; existing public data stores and production schedules are not changed by this isolated module.
- Series rejects nonpositive/non-numeric closes, duplicate dates, identity/currency drift, and unverified provider-adjusted basis. Simple raw charts can remain limited while Quant/strategy are blocked.
- Search emits one result per security and retains alternate listings as aliases. Missing numerical fields remain null; genuine zero remains zero.
- Separate canonical-ID watchlist tests cover add/save/reload/remove and preserve existing ticker-store values.
- Discover's new projection requires public readiness before identity/search/series display, even if a research Core client was injected. It supplies no provider URL/API key and does not calculate scores.
- Release allowlisting excludes `scripts/`, `docs/`, `providers/`, test paths and existing SEC/fundamentals raw paths. Private run evidence is outside the repository. No new licensed public catalog/series files were found at review time.

## Independent verification and disposition

All four findings are resolved in the reviewed implementation. Core snapshots caller options, deep-copies rights and copies protected IDs. Technical readiness and metric exposure require exact security/listing/currency binding, with explicit foreign certificates blocked. Catalog and series dates cannot exceed the evaluation clock. Existing US `getNews`, `stockPage`, and `discoverIndex` preserve the original receiver, arguments and returned object.

The existing Discover App, Search, Detail, Cards and Watchlist now use the optional canonical Europe projection. It checks public publication tier independently of research access, uses canonical routes and separate canonical watchlist storage, displays native currency and explicit raw/adjusted basis, and omits US intraday/technical links for European securities. No additional provider call is made from the UI. Default configuration contains no public Europe catalog or licensed price artifact.

Independent Node 22 execution of `core/tests/europe-market-data.test.mjs` and `discover/tests/europe-product.test.mjs` passed **27 tests**, with **3 explicit browser scenarios skipped** because browser opt-in was absent. Scoped contract and hook review is approved. The author subsequently executed the explicit browser opt-in: **10/10 Discover tests passed with no skips**, including Chromium 151 mobile, WebKit 26.5 desktop and WebKit 26.5 iPhone 13. Independent inspection of all three private JSON reports confirms zero provider requests and zero axe violations (including noncritical) across existing US detail, European search, raw European detail in light mode, and the European watchlist after a dark-mode browser reload. Four screenshots per scenario are retained in `/tmp/vu-europe-browser-evidence/`; the reviewer inspected the mobile raw-price detail and desktop dark watchlist screenshots. The explicit `#/watchlist/EUROPE` route survived browser reload without a universe-selection override.

Scoped product integration is approved after code review and browser-evidence inspection. These browser fixtures are synthetic, with external network requests blocked. This approval does not approve data licensing, public catalogs, live data quality or any production deployment.

### Private artifact contract replay

The independent follow-up review covers `scripts/marketstack/europe-product-contract-replay.mjs` and its six targeted tests. The loader verifies compiler-manifest SHA-256 and byte counts for the universe and canonical projection before replay. It requires private research artifacts and an explicit clock, rejects duplicate or adjusted replay series, and writes only outside the repository with mode 0600. Every accepted security is exercised through the real Core identity/search contract and canonical watchlist add/save/reload/remove. Every admitted listing with observed history is requested through the real raw canonical chart contract; missing or invalid data is reported without synthesis. Public access is checked independently with zero public loader calls; the US delegate and existing ticker watchlist store remain untouched.

Independent Node 22 execution passed all six replay tests and all 23 current price-quality tests (**29/29**, no skips). The replay is approved as private contract evidence; live output still depends on the independently reviewed compiler and actual run artifacts. A single EOD observation is explicitly distinguished from an observed multi-session chart and never treated as maximum-history completeness.

The author's subsequent seventh replay test was independently executed: absent history produces no chart attempt, and one observed EOD remains `SINGLE_EOD_OBSERVATION` with range completeness uninferred. It passed; the replay implementation was unchanged.

### Independent central-logo and official-name follow-up

The separate ESEF/identity reviewer independently inspected the central-logo bridge and reran Core, logo and private replay tests: **32/32 passed**, zero skips. The bridge matches the verified GLEIF issuer name and company LEI to exactly one resolved central SEC registrant through the existing `namesEqual` helper. Ticker coincidence cannot establish a match. Multiple CIKs, conflicting issuer ownership, rejected or pending assets, unsafe paths and invalid PNGs yield nonblocking fallback/suspect evidence. The derived PNG SHA-256 and reviewed Commons-original SHA-1 retain their different meanings; the resolver rechecks the actual PNG hash. Existing assets are read without download or overwrite, and no price or fundamentals data transfers through the logo match.

Core uses a single verified issuer name bound to the security's exact company LEI as its display name and retains the original provider name as a search alias. A foreign issuer name cannot replace it. These isolated logo/name changes are approved for the private product contract. The listing-level canonical reference-currency provenance remains a separate required source-preservation check; approval does not grant public rights or certify generated live counts.

The follow-up source-preservation correction is independently verified: `fromFoundation` now clones listing-evidence provenance, preserves the exact canonical reference-currency source, and retains authoritative identity evidence over any conflicting overlay. Security/search projections expose cloned provenance. The logo helper's filesystem guard is standalone and imports no Core/provider data module. Updated Core/logo/replay tests plus compiler/universe tests passed **75/75**, zero skips.

A live central-registry replay exposed two lossy matches in the existing shared name helper: E.ON SE could match On Holding AG, and NN Group N.V. could match NN Inc. The Europe bridge now additionally requires full brand/entity-name equality, preserving all name tokens and omitting only a terminal legal form. It also binds issuer country to the accepted company's GLEIF jurisdiction. The existing central pipeline remains unchanged. The independent reviewer inspected both real collision regressions and reran current Core/logo/replay: **33/33 passed**, zero skips. Those cases now remain fallback; scoped logo reuse is approved with the stronger gate.
