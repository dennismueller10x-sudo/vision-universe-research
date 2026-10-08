# Europe product contract — isolated integration foundation

`core/europe-market-data.js` provides an opt-in UMD contract (`VUCore.EuropeMarketData` in the browser, `require(...)` in Node). It performs no provider requests, defines no storage paths and starts no refresh jobs. Discover now has explicit service hooks for this contract, described below; no Europe provider/catalog is selected automatically. Public rollout still requires a qualified canonical catalog and confirmed rights.

The existing `core/client.js`, Tiingo EOD artifacts, SEC readers, ranking populations, Product IDs and user watchlist stores remain the source of truth for US calls. No generated artifact is changed by the module or its tests.

## API and routing

Exports: `create`, `fromFoundation`, `readiness`, `optionalMetrics`, `createWatchlist`, `CONTRACT_VERSION`, `WATCHLIST_KEY`.

`create({usClient, catalog, loadSeries, rights, audience, protectedIds, logoResolver, now})` returns `getSecurity`, `getPriceSeries`, `getLatestPrice`, `getIntraday`, `getFundamentals`, `getCorporateActions`, `getQuantData`, `getTechnicalData`, `getScreenerRow`, `getReadiness`, `search`, and `getLogo`. Existing US `getNews`, `stockPage` and `discoverIndex` calls are also delegated unchanged.

Every data result uses the existing Core envelope:

```js
{state: 'AVAILABLE' | 'UNAVAILABLE', reason, source, asOf, data}
```

Unqualified references such as `getPriceSeries('AAPL', options)` are forwarded with the original arguments to the injected existing US Core client. An explicitly European reference is required for Europe:

```js
const ref = {region: 'EUROPE', securityId: canonicalSecurityId};
await client.getSecurity(ref);
await client.getPriceSeries(ref, {range: '3Y', basis: 'RAW_UNADJUSTED'});
// Alternative listing: include listingId; the security/listing join is checked.
```

Supported range labels are `1Y`, `3Y`, `5Y`, `10Y`, `MAX`. The injected canonical loader owns actual range selection, provenance and publication-grain policy. No Marketstack URL, API key or provider request belongs in a Product UI or this contract.

## Identity and catalog bridge

`fromFoundation(universe, {listingEvidence, companyEvidence, protectedIds})` consumes the output of `scripts/marketstack/europe-universe.mjs#buildEuropeEquityUniverse` directly. It preserves the existing canonical `securityId` and `instrumentId`, maps `companyKey` to `companyId`, and maps `listingKey` to `listingId` without generating identifiers. Only accepted listings with verified source-backed identity evidence enter the catalog. Review candidates never enter product search or watchlists.

`listingEvidence` is keyed by exact foundation listing key and contains independent `latest`, `history`, `priceQuality`, `adjustment`, `corporateActions`, `benchmark`, `technical`, and `snapshot` objects. `companyEvidence` is keyed by exact company key and contains `fundamentals` and `logo`. Fundamentals must be the evaluated, proof-bearing result from `scripts/marketstack/europe-fundamentals.mjs#evaluateFundamentals`; its exact security/share-class/listing mapping is checked for each requested listing. A company-level result for another listing or share class cannot make this security Quant-full. Missing overlays retain unknown/blocked readiness; directory discovery cannot prove price quality. A caller-supplied `protectedIds` list rejects collisions with existing US IDs. No existing ID migration occurs.

The direct catalog shape is:

```js
{securities: [{
  region: 'EUROPE', companyId, securityId, instrumentId,
  name, ticker, isin, aliases, indexes, primaryListingId,
  acceptance: 'ACCEPTED', identity: {status: 'VERIFIED'},
  fundamentals, logo,
  listings: [{listingId, ticker, providerSymbol, mic, exchange,
    country, countryName, currency, aliases,
    latest, history, priceQuality, adjustment, corporateActions,
    benchmark, technical, snapshot}]
}]}
```

This projection links COMPANY → SECURITY/SHARE CLASS → LISTING. Search returns one result per security and the primary listing even when a secondary listing matched. Separate share classes retain separate canonical security IDs. Search examines ticker, company name, aliases, ISIN, country and exchange metadata. Company counts remain separate from security counts in the foundation outputs.

## Canonical price contract and adjustments

The loader receives `{region, securityId, listingId, range, basis}` and supplies:

```js
{securityId, listingId, basis, currency, grain, asOf,
 points: [['YYYY-MM-DD', close], ...],
 provenance: {evidenceRef, ...}, sessionContinuity: 'VALIDATED' | 'UNKNOWN',
 adjustment: {status, evidenceRef, method}}
```

IDs and currency must match the catalog. Dates must be real, strictly increasing and unique; closes must be positive finite numbers. Invalid projections produce an unavailable envelope, without estimates or repair. Full raw OHLC/volume and provider metadata remain in the private ingestion/quality layer; this close-series product projection does not replace that evidence.

Default basis is `RAW_UNADJUSTED` unless listing adjustment evidence explicitly certifies the canonical series. Unknown adjustment does not block a simple chart: it yields `CHART_LIMITED` with its raw basis visible. A request for provider-adjusted fields is rejected. `CANONICAL_SPLIT_ADJUSTED` requires both listing and series certification and series method `VU_CANONICAL_SPLIT_FACTORS`; the loader must use the existing canonical split-factor pipeline from ADR-002. This adapter computes no split factors or new adjustment methodology.

Latest close reads the same daily series as charts. Its date must match the catalog's verified latest date; a fresh status without that date, or a stale loaded series, produces an unavailable result. Previous close/date are explicit; percent change remains null without validated session continuity. Freshness is supplied by the exchange-calendar evaluator, not inferred from weekday arithmetic here. Provider snapshots require positive finite prices, real nonfuture timestamps and exact security/listing/currency binding. They carry their status and provenance; even `REALTIME_OBSERVED` is not advertised as guaranteed realtime.

## Readiness and rights

`readiness` returns the equity matrix: IDENTITY, LATEST_EOD, SNAPSHOT, HISTORY, CHART, LOGO, SEARCH, WATCHLIST, DISCOVER, SCREENER, TECHNICAL, RS, FUNDAMENTALS, QUANT, SUPERTRADER, BACKTEST, adjustment basis, data tier, public tier and publication state.

Data tiers advance independently of license approval:

| Tier | Data requirement |
|---|---|
| 1 | Accepted canonical identity; Search and Watchlist |
| 2 | Valid price history; chart ready or explicitly limited |
| 3 | Existing technical engine projection, current/last valid EOD, certified adjustment and validated European benchmark |
| 4 | Full official fundamentals plus validated reporting identity, share-class shares basis and currency basis |
| 5 | Strategy and backtest history explicitly qualified, valid volume, corporate actions, adjustment and benchmark |

Technical metrics are passed through from an existing engine projection bound to the exact security, listing and currency. A missing or mismatched projection is blocked. The contract changes no engine parameters. Missing or nonfinite metrics are null; an observed zero stays zero. Screener volume additionally requires an explicit `volumeValid` quality flag. RS is null/`RS_BLOCKED` unless a European benchmark includes a validated status, canonical security ID and evidence reference. No US benchmark default is used.

`getQuantData` is readiness only: separate Europe population, `rankingEligible: false`, null score and rank. No Europe member is inserted into a US ranking or existing Quant population. Official ESEF/filing evidence, or SEC evidence for an actual SEC filer with a validated local reporting identity, is required for full fundamentals; Marketstack is not a standard fundamentals source.

Public audience is the default. Each concrete data path requires:

```js
rights = {
 display: true, commercial: true,
 evidenceRef: 'reference-to-reviewed-contract-for-this-data-path',
 dataPaths: ['IDENTITY', 'CANONICAL_EOD', /* other explicitly reviewed paths */]
};
```

Scopes are `IDENTITY`, `RAW_EOD`, `CANONICAL_EOD`, `TECHNICAL`, `QUANT`, `STRATEGY`, `SNAPSHOT`, `FUNDAMENTALS`, `CORPORATE_ACTIONS`. Raw EOD display requires `RAW_EOD`; rights for a canonical adjusted projection do not authorize raw prices. Commercial-plan availability by itself opens no gate. Closed scopes return `DISPLAY_RIGHTS_UNCONFIRMED` before any canonical series load. `audience: 'research'` is an explicit private-evaluation option and must never be used for public delivery. The publishing layer must additionally prevent private artifacts/raw provider responses from entering the release; a client-side gate cannot secure already published files.

Audience, rights and protected-ID policy are cloned at construction. Mutating the caller's options or rights object cannot unlock an existing public client. Policy changes require a new explicitly configured client; the caller's own objects are not frozen or modified.

## Canonical watchlist and central logos

`createWatchlist({storage, catalog, protectedIds})` exposes `add(securityId)`, `save()`, `reload()`, `remove(securityId)`, `values()` and `key`. Add/remove operate on an in-memory selection; save is explicit. The separate key `vu.core.europe.watchlist.v1` stores canonical security IDs, not ticker strings. A fresh instance reloads the saved selection; duplicate add is idempotent. Malformed saves fail explicitly. Existing Discover, Quant and Quant 2 ticker stores are never read or rewritten.

Saved IDs remain present if a later catalog omits a security; a subsequent UI integration must display an unavailable item rather than erase the user selection. This is a separate Europe store until the shared user-data account schema receives a reviewed migration; it is not a claim that current US and Europe watchlists already share one UI.

Logo lookup uses only the injected central resolver and the company logo key. Existing pipeline: `scripts/discover/build-company-logos.mjs`, `scripts/discover/company-logos-lib.mjs`, `discover/ui/logos.js`. There is no direct Marketstack logo URL fallback. Missing/suspect/fallback logos never block a valid identity or chart.

## Product PR sequence and concrete linkage

The isolation gates in `CLAUDE.md` require separate product changes. The following sequence preserves those gates; the Discover hook code is implemented in its own product change, while full public data publication remains closed.

| PR | Existing integration points | Required behavior |
|---|---|---|
| Connector/Core | `core/client.js`, `core/registry/domains.json`, `docs/architecture/ADR-001-canonical-security-id.md`, `docs/architecture/ADR-002-market-data-source-of-truth.md` | Register segregated Europe canonical artifacts/producer and inject the optional contract; document the regional source extension without changing US price truth. Paths remain centralized in the existing client. |
| Europe Data Foundation | `scripts/marketstack/europe-universe.mjs`, `scripts/marketstack/europe-quality.mjs` | Build the accepted catalog bridge and exact evidence overlays; load canonical private series once; never copy old audit data into production. |
| Discover/Search/Charts | `discover/ui/search.js`, `discover/ui/daten.js`, `discover/ui/detail.js`, `discover/ui/series-loader.js`, `discover/ui/logos.js` | Bind existing search to Europe canonical references, show primary results once, expose freshness/adjustment basis, read chart projections through Core and retain existing keyboard/accessibility behavior. Keep this Discover-only gate PR separate from engine changes. |
| Watchlist/Product API | `quant/api/product-services.js`, `quant/api/watchlist-workspace.js`, `core/contracts/user-data.schema.json` | Preserve existing ticker watchlists and Product IDs, add canonical Europe selection and unavailable-item handling; design explicit lossless migration only as separate work. |
| Screener/Technical | `screener/engine/adapters.js`, `screener/engine/fields.js`, `quant/api/screener-workspace.js`, `quant/api/technical-workspace-contract.js`, `quant/engines/technical/technical-analysis.js` | Bind the additional regional projection; optional numbers stay null; pass only a verified Europe benchmark to unchanged engines. Keep Discover paths out of this PR. |
| Quant | `quant/api/product-services.js`, `quant/api/quant-workspace-contract.js` | Add separate readiness/population selection; no US score/rank rewriting. Methodology changes require a dedicated comparison PR. |
| Supertrader | `scripts/supertrader/**`, `supertrader/**` | Only qualified canonical Europe inputs enter unchanged strategies. Supertrader Gate A permits only its protected path world in that PR. This Core module does not publish a strategy or backtest result. |
| Vorsorge/UCITS | `vorsorge/engines/etf-master.js`, `vorsorge/engines/etf-provider.js`, `vorsorge/engines/etf-holdings.js`, `vorsorge/engines/xray.js`, `vorsorge/ui/etf.js` | Use a separate FUND → SHARE CLASS → LISTING adapter with provider fusion; retain SEC N-PORT/FIRDS/GLEIF. Full or sufficiently complete dated holdings only for X-Ray; partial holdings never normalized to 100%. No ETF projection is implemented by this equity module. |

Browser Chromium/WebKit/iPhone, dark-mode and accessibility checks belong to the product PRs that connect these existing surfaces. Public deployment remains gated by actual rights and data evidence, even after these PRs land. No Marketstack schedule is activated here.

## Implemented Discover opt-in hooks

`discover/engines/europe-product.js#create({client, watchlist, securityRefs})` projects the Core contract onto the existing Discover stock format. `client` is the injected Core Europe client; `watchlist` is its canonical-ID watchlist; `securityRefs` is the accepted security-ID roster. The product facade exposes `search`, `detail`, `series`, `browse`, `toggle`, `saved`, `savedIds`, `remove`. Public tier is checked before search or series loading, including when someone accidentally injects a private research Core client.

The actual App entrypoint is `VUDiscover.App.configureEurope(options)` followed by explicit `VUDiscover.App.selectUniverse('EUROPE')`. Default `US_REAL`, its ticker IDs and its existing storage remain untouched. Existing URLs `#/s/EUROPE/<canonical-security-id>`, `#/c/EUROPE/all` and `#/watchlist/EUROPE` reuse the current detail, collection and watchlist surfaces. The explicit watchlist route preserves Europe after a full-page reload; reinjection with `configureEurope` rerenders that route without forcing a new universe selection. `discover/ui/search.js` calls the injected facade for Europe and retains the existing US index path. `discover/app.js` connects detail, browse and canonical watchlist actions. `discover/ui/detail.js` loads chart points through the product/Core contract, labels raw basis honestly, formats the native listing currency, and uses the supplied exchange-calendar freshness rather than the US session calendar. `discover/ui/cards.js` carries canonical route links and prevents US live subscriptions for European tickers.

European details also suppress US Company Intelligence fetches, US live/intraday subscriptions and unqualified links to US technical products. This change enables Search, Watchlist and simple Charts; Technical UI still requires its separate product PR. Logos use only qualified central keys or the existing letter fallback. No parallel UI was built.

`VU_EUROPE_BROWSER_TESTS=1 node --test discover/tests/europe-product.test.mjs` exercises the actual shipped App/Search/Detail scripts in Chromium mobile, WebKit desktop and WebKit iPhone-13 emulation with an in-memory synthetic catalog and local fixture responses. It verifies the existing US route, closed European display with zero series loads, canonical search/detail links, keyboard navigation, raw basis/EUR labels, dark mode, watchlist save/full-page reload/remove and unchanged US storage. The completed run passed all 10 tests, with zero axe violations across four checked flows in each browser scenario. Test fixtures are explicitly synthetic and are never written to production artifacts. The ordinary Node test run requires no browser dependency. See [browser-validation.md](browser-validation.md) for the exact scope and private evidence locations.

## Verification

`node --test core/tests/europe-market-data.test.mjs` covers US pass-through using the actual existing Core client, closed display gates with zero loader calls, duplicate-free identity search, canonical watchlist persistence, null/zero distinction, explicit raw chart basis, adjustment certification, invalid series refusal, recovery/caching, official fundamentals/European benchmark readiness, snapshot uncertainty, central logo fallback, and accepted-only foundation bridging.

Full Core and repository isolation runs are tracked in the run report; missing local generated production artifacts must be reported separately from fixture-driven adapter results. Tests write only an in-memory storage object and never production data.
