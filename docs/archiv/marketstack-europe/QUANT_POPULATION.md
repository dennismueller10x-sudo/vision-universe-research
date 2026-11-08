# Separate Europe Quant readiness contract

`quant/api/europe-readiness.js` prepares a separate `EUROPE_READINESS` population.
It is optional and not wired into the UI, existing product-services, rankings or
materialization. It changes no factor definitions, scores, ranking population,
SuperTrader strategy, SEC/Tiingo routing or generated data. Scores and ranks are
always null; ranking and strategy-data admission are always false.

## Producer proof boundary

An evaluated readiness boolean is insufficient. The caller supplies an envelope
with schema `vu-europe-quant-readiness-proof-1.0.0`, exact producer
`scripts/marketstack/europe-fundamentals.mjs#evaluateQuantReadiness`, version
`marketstack-europe-fundamentals-1.0.0`, timestamp, exact security/listing/MIC/currency
binding, evaluated payload and its SHA-256 over the existing canonical JSON
serialization. SHA-256 establishes integrity, not authority.

`verifyEvidence(envelope)` must independently authenticate that producer evidence
(for example against an approved private manifest or signed resolver output),
returning a verified attestation containing the same producer/version/digest,
exact binding and sourceId. A missing verifier, `{verified:true}` alone, altered
payload, another producer or identity mismatch blocks readiness. The verifier is
a trusted upstream dependency, never an end-user or provider-response flag. This
module does not mint attestations or infer official authority from a URL.

Evaluation snapshots the envelope, expected binding and protected IDs before any
asynchronous digest or verifier call. The verifier receives a separate copy;
projection reads the same authenticated snapshot. Adapter creation pins the
loader/verifier dependencies and protected IDs, and calls pin the European
reference before awaiting. Caller mutation cannot promote authenticated partial
or invalid evidence during verification.

The payload contains evaluated `identity`, `prices`, `technical`, `fundamentals`
and, for FULL, `fundamentalProducerCertificate`. Price and technical projections
use version `marketstack-europe-quality-1`, exact binding and common price-series
SHA-256. Prices need independent adjustment evidence and an exchange-bound
calendar proof; Technical needs unchanged-engine projection evidence and a
verified European benchmark. Official identity/filing proofs retain secure source
URLs, source hashes and retrieval times. Financial evidence uses the D module's
official-source policy and exact company/share-class/listing identity.

The financial certificate pins
`europe-fundamentals.mjs#evaluateFundamentals`, its existing engine
`fundamental-inputs-1.0.0`, verified GENERIC profile, evaluated-fundamentals digest,
source hashes and exact binding. FULL additionally requires the D producer's
current fundamentals, shares/currency basis, computed engine inputs and empty
missing-input list. The D producer executes the unchanged fundamental-inputs
engine; this product adapter never calculates factors. BANK/unknown profiles do
not receive a new methodology through this path.

## States and isolation

| Status | Required evidence |
|---|---|
| QUANT_FULL | Authenticated producer; official identity; certified current prices; Technical with European benchmark; full certified official financial inputs |
| QUANT_PARTIAL | Same identity/price/Technical gates; correctly bound partial official filings |
| QUANT_TECHNICAL_ONLY | Same identity/price/Technical gates; financial full/partial evidence unavailable |
| QUANT_BLOCKED | Unauthenticated proof, protected/colliding identity or failed price/Technical gates |

Population construction rejects duplicate security/listing IDs and protected US
IDs, retains deterministic ID order and returns counts by readiness only.
No percentile, peer ranking or strategy record is produced. Optional adapter
`getQuantData` delegates non-Europe arguments and receiver unchanged to the
existing US client. Explicit Europe rank requests return unavailable; US ranking
calls remain unchanged.

No Marketstack IO, browser storage, schedules or public display is implemented.
The separate product display-rights gate remains mandatory before exposing any
licensed values. This isolated PR prepares architecture; admitting a European
ranking population or changing methodology requires its own reviewed PR.
