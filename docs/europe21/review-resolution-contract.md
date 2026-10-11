# Europe 2.1 classification and identity producer

The producer is `scripts/marketstack/europe-review-resolution.mjs`. It makes no Marketstack requests and writes only to an explicit private directory outside this repository. The earlier data remains immutable.

`readPinnedBaseline(directory, manifestSha256)` verifies every declared file's actual bytes and refuses symlinks. `buildReviewClusters` emits all twenty requested labels, one primary label per review query key, and separate overlapping secondary counts. Missing history is null. Company counts require a checksum-valid LEI key; security counts require a checksum-valid ISIN. Same-MIC symbol attempts are aliases, while multiple listings require distinct MICs for an exact ISIN. Names and exchange country never establish issuer identity.

The primary order is explicit in `PRIMARY_CLUSTER_ORDER`: identity and listing gates precede downstream product dependencies. It represents the first blocking gate rather than a claim that subsequent labels have been resolved. Exact official CS evidence distinguishes known cash-share category from a missing primary policy. Unknown ordinary/preferred details remain unknown. Xetra regulatory liquidity never transfers to a foreign home MIC.

`buildReviewResolutionPlan` validates the exact baseline review-key set and produces evidence requirements without promotions. `buildPrioritizedRefreshPlan` emits at most one metadata hypothesis per ISIN/MIC. It prioritizes prior official index gaps and German issuers, excludes rejected and excluded ETF/fund rows, and avoids repeating all historical native aliases. Its prior proofs authorize query planning only.

`buildCanonicalEuropeGraph` creates explicit companies, ISIN share classes and listings. Companies contain `securities` as ISIN keys and `securityIds` as Core IDs. Securities retain unknown class details and point to `primaryListing`/`primaryListingId`. Every listing for a class shares one Core-derived ID. The previous 259 IDs are reused for the same class and issuer. A hard new class/issuer conflict is quarantined; there is no ticker reassignment. Protected IDs and US MICs are refused.

Retained prior identity records are separate from the current accepted consumer universe. `priorIdentityRetained` and `admissionStatus` explicitly describe these records. They do not establish current price readiness and are not an input for consumer publication.

`compileEurope21ResolutionFromPaths` replays current and cached ingestion directories through the complete authenticated RAW loader and delegates admission to the existing strict foundation compiler. Current runs require externally pinned descriptors `{path, phase, planHash, baselineMain}`. The loader validates the new version and fixed phase allocations without rewriting legacy summaries or including old credits. New accepted classes additionally require current-day exact metadata, EOD transport, GLEIF and official CS reference evidence plus recent valid exchange-calendar-bound prices. `readSourceBoundOfficialIdentity` derives issuer legal names from the verified GLEIF bodies.

Private identity/readiness and publication rights remain separate. All outputs set `publicationAllowed:false`. US prices, populations, rankings, strategy parameters and production files are outside this producer's scope.

Baseline generation:

```sh
node scripts/marketstack/europe-review-resolution.mjs \
  --baseline=/absolute/private/productization \
  --baseline-sha=<pinned-manifest-sha256> \
  --out=/absolute/private/review-baseline
```

Tests use temporary directories and explicit fixture evidence. Their counts are never reported as live provider evidence.
