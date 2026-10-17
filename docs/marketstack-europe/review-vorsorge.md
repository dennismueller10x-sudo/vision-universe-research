# Independent review — Marketstack Vorsorge secondary facade

Reviewed 2026-10-08 with Node 22: `vorsorge/engines/marketstack-secondary.js` and its selective tests. No paid requests, production-data writes or author-file edits.

## Findings

**V-1, high, fixed and independently reverified: component identity binding.** The original mixed top-level conflicting ISIN (`IE00B5BMR087`), symbol, currency and fund-ID reproduction now rejects both prices and holdings, even when a trusted test producer authentically signs those contradictory objects. Each component requires the exact nested fund/share-class/listing/currency identity, and every reported top-level identity alias must agree. Tests cover ten aliases across all three component kinds.

**V-2, high, fixed and independently reverified: primary-fund contamination.** A primary base declaring another ISIN/fund ID is returned unchanged. Primary identity and nested existing price/holdings evidence are checked before fusion and every registry fallback; contradictory identity suppresses all secondary additions.

**V-3, high, fixed and independently reverified: artificially scaled partial holdings.** Node now verifies an Ed25519 producer signature against public keys supplied out of band. The signed payload binds the exact component SHA-256, identity, raw evidence SHA-256, original fraction vector, provider row total, FULL completeness and NONE normalization. Decorative hashes/flags, invalid signatures and mutation of signed partial weights or completeness fail closed. The original mass-0.2-to-1 reproduction no longer produces holdings or X-Ray output. Signature authenticity establishes the configured producer, whose independent completeness/quality validation remains an upstream prerequisite.

**V-4, medium, fixed and independently reverified: public-rights flags.** Preparation is permitted only in explicit PRIVATE_RESEARCH mode. Public preparation remains blocked even with all caller-supplied rights booleans true. Browser UMD cannot authenticate the producer signature and admits no secondary fields, prices or holdings. Actual display/redistribution rights remain unresolved and no public release is approved.

## Verified safeguards

- Without a secondary input, the registry/base object is returned unchanged. Existing primary values, provenance, prices and holdings are preserved; conflicting metadata is reported rather than overwritten.
- Exact input identity versus expected identity checks reject ticker-only joins, invalid ISINs, changed share-class/fund/listing IDs and missing provenance.
- Metadata missing values are not converted to zero. Expense ratio is not silently renamed to TER; AUM/NAV require currency, and NAV requires its observation date.
- Stale, invalid dated, duplicate, derivative, partially weighted, missing-ISIN and explicitly PARTIAL/504 holdings are blocked by the tested structural gates. Original rows and sums remain unchanged by the facade.
- Existing Holdings and X-Ray engines are reused. No primary provider table, strategy, schedule, production artifact or UI is changed. Browser UMD loading works.
- The implementation does not mutate the caller's supplied secondary data in the baseline tests. Returning existing primary objects by reference is intentional for unchanged-source compatibility; no primary rewrite was observed.

## Validation

`node22 --test vorsorge/tests/marketstack-secondary.test.mjs`: **16/16 passed**, zero skips. Additional offline reruns independently confirm all four original reproductions are blocked after the fixes, including authentic signatures over contradictory top-level identities. No remaining inspected blocker for the optional private facade; no actual provider holdings, production use or public rights are certified by this review.
