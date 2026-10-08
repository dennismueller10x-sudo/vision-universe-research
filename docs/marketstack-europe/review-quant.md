# Independent review — Europe Quant presentation contract

Reviewed 2026-10-08 with Node 22: `quant/api/europe-readiness.js` and its selective tests. No paid requests, production-data writes or author-file edits.

## Finding

**Q-1, high, fixed and independently verified: mutable-envelope time-of-check/time-of-use promotion.** `evaluate` previously hashed/authenticated an envelope then projected the caller's mutable original after awaited verification. An authenticated `PARTIAL` payload could be changed to `VALIDATED` during verification and become `QUANT_FULL`, despite its current digest differing from the authenticated digest. The implementation now pins a cloned envelope, expected binding, protected IDs and attestation; the verifier receives a separate copy and projection uses only the authenticated snapshot. The original reproduction now remains `QUANT_PARTIAL`. Adapter resolver functions, references, protected IDs and original US methods are also captured at their creation/call boundaries. Two concurrent mutation regressions cover both promotion and protected-binding mutation.

No unresolved blocker remains in this reviewed evidence-driven readiness projection. No existing US ranking or scoring path is modified. Actual official fundamentals/price/benchmark readiness and producer authentication still depend on independently resolved run evidence.

## Verified safeguards

- Naked readiness booleans and a verifier returning only `{verified:true}` do not admit FULL. Producer/version/schema, digest, exact binding and attestation fields are checked.
- Altered payloads before verification, mismatched financial certificates, cross-company filing joins, US MICs, unconfirmed calendar/price series joins and US-labelled benchmarks fail closed in the tested cases.
- Fundamentals use the official-filing policy. Marketstack fundamentals cannot become the standard source. SEC filings require actual-filer/CIK/local-share-class proof.
- Protected IDs and duplicate security/listing populations are rejected. Europe readiness remains separate, with null score/rank and no ranking admission or strategy data.
- The optional adapter retains the existing US method receiver, arguments and exact return object. Europe rankings remain unavailable.
- There is no provider IO, storage write, schedule activation, methodology change or active UI integration in this module. Authentication of the pinned producer remains a trusted server/resolver responsibility.

## Validation

`node22 --test quant/tests/europe-readiness.test.mjs`: **11/11 passed** after correction. The original offline mutation reproduction was independently rerun and returns `QUANT_PARTIAL`, without promoting changed unverified data. No authenticated producer service was contacted.
