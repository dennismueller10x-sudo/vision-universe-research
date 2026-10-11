# Discover identity admission

`scripts/marketstack/europe-discover-reclassification.mjs` is an additive private producer. It makes no provider calls and changes no US universe, schedules, product data, scores or strategies.

Identity and chart admission are separate. A cash-share identity does not require fundamentals, liquidity, volume, adjusted prices, indicators or a certified primary listing. A missing provider LEI is allowed. An explicit contradictory provider issuer identifier, ETF/fund classification, ISIN, native symbol or MIC remains a blocker.

The producer replays each metadata response body from a hash-pinned ingestion summary and raw manifest. It verifies response hashes and exact endpoint/request symbol scope, derives metadata from every raw response row, and refuses ambiguous row cardinality. Normalized observations do not establish identity. Official share-class type, activity, name, native ticker, MIC and local quote currency are extracted from the original hashed exchange CSV. Optional GLEIF issuer facts are rederived from raw exact-ISIN queries, with both pagination query links, total cardinality, record ID, LEI checksum, legal name and jurisdiction checked. No company is matched by a fuzzy name or ISIN prefix.

The current country gate requires an independently evidenced European issuer jurisdiction. An exchange country or primary MIC alone does not establish issuer domicile. A future official issuer reference can supply the same exact class-to-issuer/country proof without a LEI. An instrument name alone is a security display label, not a verified legal entity name.

The narrowly scoped Nordea issuer-page reader uses the original issuer-owned ORD-class table: Company name, ORD ISIN and Country. It admits only the identified ordinary class and its explicitly published Finnish issuer domicile. ADR identifiers, prices, ratio, activity date and the independently unjoined LEI are excluded. This remains a security-scoped issuer group with no consolidated legal-company count.

The Nokia and UPM compound bridges preserve the dates of original issuer notifications separately from current legal-entity observations. They extract the exact class ISIN and issuer LEI from visible issuer-owned publication text, then verify that identifier against the original current GLEIF entity-endpoint response. A GLEIF ISIN-query relationship is never claimed. Script/metadata copies alone cannot establish this bridge, and transaction prices, currencies and financial facts are not projected.

`classifyDiscoverIdentity()` returns the diagnostic string `identityAdmission`. The generated graph exposes the Core proof separately as `listing.admissionProof`, containing:

- version `europe-discover-identity-2.0.0` and status `UNIVERSE_IDENTITY_READY`;
- exact security/company/listing IDs, ISIN/security key, MIC, provider symbol and currency;
- source-bound issuer country, equity classification, issuer-binding level, local activity and resolved duplicates;
- hash references for authenticated provider metadata, official cash-share reference and issuer evidence.

The Core producer must assign this object to its `identityAdmission` field. The diagnostic string is never a Core proof. Discover eligibility additionally requires the separately produced chart gate. The identity producer does not mark any chart, Discover screen, Screener metric, Quant population or strategy ready.

The graph preserves Company → Security → Listing. A verified LEI can consolidate securities under one legal entity. Without an independently identified legal entity, a security-scoped issuer group is not counted as a verified company and cannot merge classes. Exact ISINs across venues share one Core security ID. Same-ISIN/same-MIC provider symbols consolidate to one listing with every authenticated alias retained. Product display-primary selection is explicit and separate from official primary certification.

Pinned previous artifacts are used only to retain exact ISIN-to-canonical-ID associations. They do not establish current admission. `knownReferenceGraph` retains prior IDs whose new observations are blocked; their `identityBlocked`, `chartBlocked` and `discoverEligible:false` fields prevent promotion. Their existing acceptance label preserves historical classification rather than overriding the new gate. New admitted securities carry `acceptance:DISCOVER_ONLY`; no analytical readiness follows from that label.

All 3,170 scoped candidate keys retain their dispositions. Candidate/query counts, canonical security counts, listings, verified legal companies and unresolved issuer groups are reported separately. Evidence dates remain their original observation dates; producer generation time is not a refreshed provider observation.

`candidateAccounting` partitions all current query keys by a deterministic primary reason and retains overlapping reason counts. Its separate `priorReview` partition accounts for every historically reviewed query key. Explicit excluded instrument types are `REJECTED`; missing or contradictory identity evidence remains `REVIEW`.

Run with explicit private paths:

```sh
node scripts/marketstack/europe-discover-reclassification.mjs --config /workspace/europe-discover20-private/reclassification-config.json --out /workspace/europe-discover20-private/identity
node --test providers/marketstack/tests/europe-discover-reclassification.test.mjs
```

The configuration pins every summary, raw manifest, official reference, prior identity artifact and current-main protected-ID snapshot by SHA256. Output paths must be private, and symlink input/output substitution is refused.
