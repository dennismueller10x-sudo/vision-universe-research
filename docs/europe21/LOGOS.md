# Europe 2.1 — existing central logo evidence

`scripts/marketstack/europe-company-logos.mjs` reads the existing Discover logo registry, reviewed assets, rejects, exclusions, central SEC names and official-site cache. It neither downloads images nor changes the central producer, cached assets, review decisions or product data. No Marketstack requests or credits are used.

The company join remains the previous exact official GLEIF issuer name against a unique resolved SEC registrant, including the stricter legal-name predicate that preserves brand words and one-letter names. There is no ticker-only join, domain guessing, former-name substitution, price/fundamentals transfer or ADR transfer. Multiple issuer owners of a central CIK are blocked. The name index changes candidate lookup cost only; all existing matching predicates are retained.

Cached official-site candidates come from `discover/logos/sites.json`, with curated overrides from `discover/config/logo-sites.json`. Each candidate retains the central key, CIK, exact cache path/SHA-256, recorded source kind and cache date. Missing source hashes, unrecognized source kinds, unsafe URLs or conflicting hosts do not produce a usable site candidate. Duplicate issuer ownership blocks domains even when the asset itself is absent or pending review.

`DOMAIN_CACHED` reports source availability. Its network availability is `NOT_PROBED`, `canonical` is false and its use is `LOGO_SOURCE_CANDIDATE_ONLY`. Regional and investor sites can occur in the existing producer's cache; the bridge does not promote them to canonical company domains or independently certify current ownership. Live acquisition/revalidation belongs to the existing central producer. Domain evidence never promotes a pending, rejected, missing or hash-mismatched image to `LOGO_VALID`.

The new `buildEuropeLogoReadiness(evidence)` projection emits one row per accepted security and separates company and security totals. It retains central asset paths, current bytes/SHA-256, reviewed source SHA-1 and its scope, status/reason, initial fallback, cached-domain evidence and company evidence reference. Logos never block a security's identity or product readiness. Conflicting company ownership of one security throws rather than producing duplicate rows.

CLI:

```sh
node scripts/marketstack/europe-company-logos.mjs \
  --universe=/absolute/private/current-universe.json \
  --out=/absolute/private/current-logos \
  --now=2026-10-09T14:50:00Z
```

This writes the existing private `marketstack_europe_central_logo_evidence.json` plus `europe_logo_readiness.json`, outside the repository. Both outputs remain `PRIVATE_RESEARCH`, with public admission false. Symbolic or nonregular final output files, including dangling symlinks, are refused. The existing resolver rereads and verifies the reviewed cache bytes before returning an asset.

Eight focused tests cover existing issuer/asset binding, ticker and weak-name collisions, pending/rejected/corrupt assets, domain/source/URL conflicts, independent domain ambiguity, company versus security counts and private output containment. The old 259-security cohort, re-evaluated diagnostically against current-main cache, still reports 13 valid, 243 fallback and 3 suspect logos; company totals are 13/237/3 over 253 companies. There are 12 issuer-bound cached site candidates and zero live-domain probes. The three suspects (Sanofi, Novartis and UBS) retain `CENTRAL_ASSET_REVIEW_HASH_MISMATCH`; no review bypass was applied.

The indexed diagnostic took approximately 115 ms for those 253 companies, versus approximately 10 seconds for the earlier full-registry scan on this environment. This is an observed local comparison, not a performance guarantee. Current Europe 2.1 acceptance and final logo counts must come from the final current universe, not this old-cohort diagnostic.
