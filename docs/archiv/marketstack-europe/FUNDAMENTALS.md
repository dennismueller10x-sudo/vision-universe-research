# European fundamentals and Quant readiness

`scripts/marketstack/europe-fundamentals.mjs` evaluates evidence without writing production data, calling a provider, calculating a score, or adding companies to a ranking. Its exports are `evaluateIdentityEvidence(candidate, evidence)`, `evaluateFundamentals(candidate, evidence, { asOf })`, and `evaluateQuantReadiness({ identity, prices, technical, fundamentals })`. Identifier checksum helpers are also exported.

Current main has the SEC pipeline and the existing `fundamental-inputs-1.0.0` engine. ESEF ingestion is present in unmerged [PR #324](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/324), including an official-filings provider, French OAM discovery and a provenance-bearing LVMH FY2024 configuration. This run inspected that work read-only. Prior filing evidence is not fresh production data, and this change does not merge that product-spanning PR or certify its facts.

## Evidence contract

Candidates supply existing canonical IDs. This module creates no identifiers and performs no name, ticker or ADR matching. A resolver supplies `identity.mapping` containing `companyId`, `issuerId`, `lei`, `securityId`, `isin`, `shareClassId`, `listingId`, `mic`, `listingCurrency`, `reportingEntityId`, `reportingEntityLei` and `reportingCurrency`. Each field requires a corresponding entry in a proof's `fields` array. A reporting relationship requires a referenced proof and an explicit `SAME_ENTITY` or `CONSOLIDATED_GROUP` association. Issuer and reporting entity are kept separate.

Every accepted proof has an official `kind`, HTTPS `url`, full raw `sha256`, UTC/offset `retrievedAt`, and the resolver's explicit `verified: true` attestation. A URL or identifier format alone does not establish official authority or mapping; the resolver owns that verification. LEI and ISIN checksums, MIC syntax, currency syntax and contradictory candidate fields are checked again here. SEC proof also requires a independently verified actual SEC filer and matching CIK. Audit identifiers without evidence return `PARTIAL`; conflicting identity, corrupt identifiers and ADR associations return `BLOCKED`.

`filings` keep the complete supplied record in either `acceptedFilings` or `quarantinedFilings`. Accepted records require an ESEF, official-filing or eligible SEC proof, exact issuer/reporting-entity/ISIN/class association, reporting currency, `periodEnd`, `filed`, `availableAt`, explicit revision policy and validated numeric facts with concept, context and unit. Zero and negative financial facts remain valid when explicitly reported. Missing values remain absent. SEC local-share use additionally requires `securityBasis: LOCAL_SHARE_CLASS_VERIFIED`; foreign ADR facts are never copied onto a local security by ticker.

Full input readiness further needs a proof-bearing positive local-share-class `sharesBasis`, a verified same-currency or explicit FX `currencyBasis`, and an `engineInputCertificate`. The latter includes a source-certified canonical `consumerDocument`, deterministic `normalizedDocumentSha256`, verified `documentIdentity`, `documentMappingVerified`, and a verified local-share `marketCapBasis`. The evaluator executes the unchanged `fundamental-inputs.compute` engine and checks every generic financial component ID from the unchanged Quant methodology's quality, growth, value and profitability factors. Caller-defined `requiredInputs` and precomputed `rawInputs` cannot certify completeness. Financial-source proof must reference an accepted filing hash. Industry templates remain partial until a separately validated adapter is provided. The existing engine's `STALE_INSTANT_DAYS` controls age. Incomplete official facts yield `PARTIAL`; absent valid facts yield `UNKNOWN`. Supplied records are preserved unchanged. There is no Marketstack fundamentals default.

## Product implications

| Result | Required evidence |
| --- | --- |
| `QUANT_FULL` | Verified local listing identity, certified/current price basis, ready existing technical inputs with European benchmark, full matching official fundamentals, shares and currency basis |
| `QUANT_PARTIAL` | Same identity/price/technical gates and some valid matching official facts; fundamental completeness is insufficient |
| `QUANT_TECHNICAL_ONLY` | Identity/price/technical gates pass; official fundamentals do not |
| `QUANT_BLOCKED` | A local identity, certified price/adjustment or technical/benchmark gate fails |

Price and technical readiness inputs must each name the exact `securityId`, `listingId` and listing `currency`. Technical readiness also requires `benchmarkRegion: EUROPE` and verified benchmark provenance (`provider`, `sourceId`); US fallback cannot pass. Fundamentals must match the same company, security, share class and listing.

Canonical engine documents must carry official-provider provenance, explicit units, valid fiscal periods/filing dates, finite observations and no duplicate dates. Generic profile use requires `profile: GENERIC` and `profileVerified: true`; an unknown or industry profile cannot silently reuse the generic completeness gate.

All results remain in `EUROPE_READINESS` with `admittedToRanking: false`, `scoreProduced: false` and unchanged US population/methodology. Readiness does not authorize public display or establish a full seven-factor score. Fundamentals use date-only availability conservatively, and `pitEligibility` remains `NOT_CERTIFIED`; this result cannot authorize backtests.

Fresh official Xetra tradable-directory and GLEIF ISIN→LEI evidence can support instrument/issuer mapping. Xetra trading MIC and its separately named primary-market MIC are different fields; neither an ISIN country prefix nor a headquarters address proves issuer legal domicile. Such source records and all raw evidence stay in the private run directory until the applicable rights and identity gates are satisfied.

Validation: `node --test providers/marketstack/tests/europe-fundamentals.test.mjs`. Tests include candidate-only identity, checksum conflicts, ADR/SEC-local gates, currency/share basis, stale/future facts, quarantine/raw preservation, cross-company projection and isolated Europe readiness.
