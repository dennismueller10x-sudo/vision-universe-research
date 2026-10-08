# Independent review F — regression safety

Baseline reviewed: current main `b39d8d7ddbd093d138e2844ddec2cb2bb07a6962`; reference open PR #461 head `3f11a5a9d523e2b12f448ff91a6ddf7783cdaf7e`.

## Initial result

The proposed provider-only, unregistered observational connector is a safe scope for this task. Importing the reference adapter verbatim is not safe: it calls `core/identity.js.normalizeISIN`, `securityIdForISIN`, and `listingIdFor`, which do not exist on current main. Porting reference Core identity and European product code would exceed the explicitly authorized connector-only audit.

Current main contains no tracked Marketstack connector. Existing main `quant/engines/market-client.js`, `schema.js`, and `capabilities.js` match the reference Git objects (no diff). A new client may read existing market-client implementation without editing it. The reference client creates its own MarketClient instance and local queue/cache/budget counters; its import does not register itself in the existing provider registry. An observational audit adapter should likewise not register a provider or create canonical identities.

## Architecture constraints read

Read `/workspace/vision-universe/CLAUDE.md`, `docs/VISION_UNIVERSE_ARCHITECTURE.md`, and `docs/operations/RUNBOOK.md`.

- Quant scores, ranking, strategies, regimes and technical methods require their own PR; excluded here.
- Generated artifacts under `quant/data`, `discover/data`, `supertrader/data`, `social/data` must not be changed.
- Canonical identity creation belongs only to `core/identity.js`; the audit must retain supplied provider/listing identities and observations instead of fabricating `ref_` or ISIN IDs.
- Existing Tiingo price truth, published closes and action methods remain unchanged.
- Products must not consume raw vendor fields; provider observations remain within provider/audit boundaries.
- Tests write only temporary output through explicit directories, never production data.
- No workflow schedule or public deployment is necessary for this audit.

## Scope recommendations

1. Add only `providers/marketstack/client.js`, provider-only observational adapter/capability contracts, offline fixture tests, docs, and an explicitly invoked private audit runner if needed.
2. Do not copy reference `core/**`, European consumers/materializers, generated data, workflows, or Marketstack private cache wrapper. The latter imports a Tiingo encryption module and is unnecessary for an offline/private scratch audit.
3. Every paid attempt must reserve conservative credits in a supplied shared budget before fetching. A configured API key alone must not start traffic. Test-only uncoordinated fetch must use injected fakes.
4. Probes must default to no live API requests; live evidence stays outside tracked product paths. Original raw JSON and normalized observations remain distinct.
5. Mapping must retain canonical/provider/exchange-qualified/legacy aliases as separately identified facts. No assumed `.DE`, `.XETRA`, `.XFRA` substitutions or first-match identity resolution.
6. Intraday/realtime capabilities require response timestamps, identity and market evidence; a successful response alone must not certify European realtime.

## Final review checks planned

- Changed-path allowlist against baseline and byte identity of existing Tiingo, Core, product engines, API and workflows.
- New tests cover no import-time requests or registry mutation, injected-fake requests, explicit budget rejection, raw response retention, strict partial-page outcomes, holding weight preservation, and capability routing.
- Run new offline tests plus appropriate existing Core/provider/Tiingo transport regression tests.
- Run production test-isolation gate on the new fixture suite, recording both suite exit and isolation result (gate can report isolation success with a failing suite, so both matter).
- Inspect tracked artifacts and secret leakage before draft PR.

No live API calls were made by this reviewer. Final diff not yet available.

## Baseline regression probe

Executed on unchanged main with Node v24.19.0 (repository documents Node 22):

`node --test core/tests/identity.test.mjs quant/tests/provider.test.mjs quant/tests/tiingo.test.mjs quant/tests/verify-tiingo-realtime-wiring.test.mjs`

25 passed and four failed due solely to absent sparse-checkout fixtures: eligibility.json, tiingo-universe.json, and price-adjustment-v1.json. Provider registry tests (21) and realtime wiring tests (2) passed. These setup failures are baseline limitations, not evidence about future connector changes. Current sparse paths are `.github`, `api`, `core`, `docs`, `providers`, `quant/engines`, `quant/tests`, `scripts`, and `server`; final verification should materialize only exact tracked fixture dependencies without changing their contents.
