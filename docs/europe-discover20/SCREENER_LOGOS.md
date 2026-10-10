# Europe base Screener and logos

The Europe adapter is opt-in. The existing default US adapter, engine, field registry, methods and ranking population remain unchanged. `getBaseScreenerRow` admits rows only when Core reports `UNIVERSE_IDENTITY_READY`, `DISCOVER_ELIGIBLE`, `BASE_SCREENER: READY` and coherent chart/session flags. `CHART_LIMITED` rows can therefore use Country, Exchange, Index, Price, Currency and Chart status filters without passing strict analytics gates. The adapter retains its strict legacy Core path for older callers.

Technical values are read separately through `getTechnicalData`. New Core callers must report an actual `TECHNICAL_READY` or `TECHNICAL_PARTIAL` boolean and return a projection bound to the same canonical security, listing, currency, as-of date and price basis. Values missing or unavailable in that projection stay null. Generic momentum, RS, volatility and drawdown are not relabelled as existing US horizon-specific fields. Chart availability or UI visibility does not create metrics. Unvalidated volume remains null, and a zero filter does not match missing data.

Public delivery remains closed without explicit rights. Withheld technical values are removed before filtering. Cached projections recheck rights, and an awaited price-series response rechecks the full delivery gate after the response arrives.

The private replay producer `scripts/marketstack/europe-discover-screener-replay.mjs` exports:

- `compileEuropeDiscoverScreenerReplay({catalog, identityUniverse, contract, sourceInputs, generatedAt, repositoryRoot?, getUSCallCount?})`.
- `writePrivateDiscoverScreenerReplay(outputs, absolutePrivateDirectory)`.

Each input reference needs an absolute path and expected SHA256. Optional `selector` selects an object inside a source JSON document; the supplied object must match the selected source. The producer reads those sources again after replay and preserves their provenance. Outputs are `europe_logo_status.json`, `europe_company_logo_evidence.json` and `europe_screener_replay.json`, outside the repository only. Actual catalog counts are reported after the current producer and Close-chart cohort are ready.

Logo matching uses the existing central pipeline and current repository registry/cache, including updates made after earlier Europe runs. A legal-name match is eligible only after the exact GLEIF raw hash, ISIN query, LEI, reported legal name and legal jurisdiction agree with the current identity artifact. Weak names and security-scoped issuers without that legal evidence use fallbacks. Existing central review, rejection, path and image-hash gates still decide whether an image is valid. Logos never block identity or Discover admission. No provider calls, image downloads, asset/cache writes or new logo pipeline occur.

The producer records its EUROPE-only call routing. It leaves the underlying US-call count unmeasured until the actual root replay supplies an independent sentinel count through `getUSCallCount`; a routing assertion alone is not an authenticated measurement of downstream calls. Public licensed data publication and schedules are not enabled by these modules.

This work prepares the private base adapter and replay; it does not activate the existing Screener page for Europe. Existing QuickResearch routes and links have separate UI requirements. For the new base path, `series()` requires actual `TECHNICAL_READY` so Close-only rows cannot trigger its implicit SMA overlays. `sparkSeries()` may expose one certified continuous Close segment, independently of strict analytics. Both methods withhold multiple segments because the existing renderer cannot preserve quarantine gaps. Discover's separately reviewed segmented chart renderer remains the chart consumer for those rows; base Screener eligibility is unaffected.
