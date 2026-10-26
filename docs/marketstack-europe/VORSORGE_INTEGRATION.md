# Optional Marketstack secondary source for Vorsorge

`vorsorge/engines/marketstack-secondary.js` adds an opt-in UMD facade around the existing `ETFProvider` registry. It uses the existing mapping validation, ISIN checksum validator, canonical `Holdings.snapshot`/quality gates and `XRay.validateHoldingsFile`. It does not change provider rankings, SEC N-PORT, ESMA FIRDS, GLEIF, Xetra reference data, Tiingo, strategies, schedules, or generated artifacts.

The separate Vorsorge PR contains the engine, its tests and this document. It has no Discover, Quant or SuperTrader path changes and does not weaken their isolation gates. CLAUDE.md defines no additional Vorsorge-only path gate.

## Integration hook

An existing build or private research consumer opts in by wrapping its registry:

```js
const MarketstackSecondary = require('./vorsorge/engines/marketstack-secondary.js');
const registry = MarketstackSecondary.wrapRegistry(existingRegistry, reviewedInputs, {
  mode: 'PRIVATE_RESEARCH',
  today: '2026-10-08',
  getIdentity: symbol => officialCanonicalListingEvidence[symbol] || null,
  trustedProducerKeys: { approvedKeyId: canonicalProducerPublicKeyPem }
});

registry.metadata(symbol);      // existing fields plus safe missing fields
registry.prices(symbol);        // existing series first; certified canonical fallback only
registry.holdings(symbol);      // existing snapshot first; complete fallback only
registry.xrayHoldings(symbol);  // existing X-Ray first; complete fallback only
```

This is a Node private-ingestion contract hook, not an automatic UI connection or an activated data producer. Passing no Marketstack inputs returns the original registry. Missing, ambiguous, unverified or rights-blocked inputs preserve the original merged result byte for byte. A duplicate provider symbol requires explicit listing resolution; the facade never chooses the first candidate. Browser UMD registration is retained, but cryptographic producer authentication is unavailable there, so secondary fields/prices/holdings remain blocked.

## Reviewed input contract

Every input binds to an existing canonical fund/share class/listing with:

- `identity.verified: true`, checksum-valid exact `isin`, exact `providerSymbol`, `exchangeMic`, listing `currency`, existing `canonicalETFId` and `shareClassId`. Every metadata/price/holdings component repeats this exact identity; it cannot relabel another fund or listing under the top-level identity.
- Identity provenance with `source`, HTTPS `sourceUrl`/`url`, SHA-256 `sha256` and real ISO `asOf`. The independently resolved expected identity needs the same evidence and must match every identifier.
- `metadata.fields` using existing `ETFProvider.MAPPING_CONTRACT` names and units. Each populated field needs its own source/date/hash/URL provenance. Missing fields stay absent. A contradictory metadata ISIN quarantines the entire source record.
- TER is a decimal fraction. Expense ratio, ongoing charges and management fee are distinct; a source field with one of those names cannot silently become TER. AUM requires its currency. NAV requires its currency, observation date and currency provenance. Listing country never becomes domicile, and name cues never certify UCITS.
- `prices` contains existing analytics points `[[ISO_DATE, positive_price], ...]`, strictly increasing dates, `canonical: true`, `quality: "CERTIFIED"`, `priceSeriesType: "SPLIT_ADJUSTED"`, `adjustmentStatus: "ADJUSTMENT_CERTIFIED"`, `freshness: "CURRENT"` or `"LAST_VALID_SESSION"`, and exact last-date `asOf` matching source provenance. This facade does no price adjustment or repair.
- `holdings` contains `status: "FULL"`, `sufficientComplete: true`, `xrayReady: true`, `paginationComplete: true`, exact `providerTotal`, explicit `weightUnit: "fraction"`, dated source evidence and all canonical `rows`. The date must be current under the configured holdings age limit (90 days by default). Every non-cash position needs a checksum-valid ISIN. Derivatives, unknown types, repeated rows and duplicate security identities do not enter the existing X-Ray engine, which uses a single position per identifier.

Raw provider responses remain in the private ingestion evidence store owned by the caller. They are never discarded by this facade, never rewritten, and never included in its product envelopes. The canonical snapshot uses the existing contract's eight-decimal weight precision; original weights remain available in the raw store. It never rescales partial weights to 100 percent. For a gateway timeout the reason is `HOLDINGS_GATEWAY_COVERAGE_UNKNOWN`.

## Authenticated producer evidence

Each component also requires an Ed25519 signature, verified with Node's `crypto.verify`, against an approved public key from the trusted caller's `trustedProducerKeys`. Keys supplied inside a source record are never accepted. No private signing key is configured or generated in production by this change, so current unattested Marketstack data stays blocked.

The signed `attestation.payload` has schema `vu-marketstack-secondary-attestation-1`, producer `VU_MARKETSTACK_CANONICAL_PRODUCER`, `keyId`, `kind` (`METADATA`, `PRICES` or `HOLDINGS`), exact component `identity`, valid `asOf`, archived provider `rawSha256`, and `componentSha256`. The component hash covers recursively sorted-key JSON of the complete component excluding only `attestation`. The signature covers recursively sorted-key JSON of this payload. Component identities, values, rows, original provenance and statuses therefore cannot be changed while retaining a valid signature.

For holdings the signed payload additionally certifies `completeness: "FULL"`, `normalization: "NONE"`, `originalWeightUnit: "fraction"`, exact `providerTotal`, and every `originalWeightFractions` value in source row order. Each signed original fraction must match the supplied canonical row weight exactly. The approved producer may sign only after verifying raw-response archival, identity, complete stable pagination, reporting date, structure and original weights with the private UCITS ingestion gates. A caller-created FULL flag, SHA-looking string, or rescaled partial basket cannot authorize X-Ray without this authenticated producer evidence. A private research consumer cannot act as its own source attester.

## Fusion and rights

`fuse(existingMergedResult, input, options)` fills only null or missing canonical fields, prices and holdings. A contradictory primary ISIN, fund/share-class ID, symbol, MIC or currency blocks the entire fusion, including nested existing price/holdings identity; it never attaches another fund's prices or holdings to that base. Every existing populated primary value wins, regardless of source age. Conflicting secondary fields remain visible in `secondaryEvidence.conflicts`, with both source provenances. Existing arrays, IDs, rankings and provider configuration are not mutated. If primary holdings exist, the wrapper never substitutes secondary X-Ray holdings beside them.

Public mode is unconditionally blocked in this initial facade. Caller-supplied commercial/display/data-path booleans cannot authorize publication. Plan-level commercial wording does not establish display or redistribution rights. A future public integration requires a separate reviewed rights resolver with authenticated documentary evidence bound to the exact instrument, data path and use. `PRIVATE_RESEARCH` allows internal review and must not be supplied to a public renderer. No schedule or public release is activated by this module.

## Validation

```bash
node --test vorsorge/tests/marketstack-secondary.test.mjs
node --test vorsorge/tests/*.test.mjs
node scripts/quality/check-test-isolation.mjs --suite 'vorsorge/tests/marketstack-secondary.test.mjs'
```

Tests exercise preservation of primary regulatory/reference sources, exact share-class/listing joins, closed rights, sourced metadata, price certification, holdings completeness/ambiguity and actual existing registry/holdings/X-Ray contracts. They also load all required UMD engines in a browser-like VM. All fixtures are synthetic and perform no paid requests.

Validation before independent-review hardening: targeted integration 13/13 passed and test isolation passed; the complete Vorsorge suite passed 129/132. Existing tests could not read `vorsorge/data/etf-index.json`, `vorsorge/data/funding-rules/`, or the SEC N-PORT fixture build's temporary `S000004310.json`. Those failures are outside the unchanged primary engines/data pipelines; no production files were generated to satisfy them. The hardened targeted suite now includes authenticated payloads, cross-fund component binding, contradictory primary identity, forged/rescaled partial holdings and unconditional public blocking.
