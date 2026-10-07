# Private selected-listing Actions execution

For the 2026-10-07 existing817 completion, the original run/auth ID and cumulative counter remain unchanged. Add `authorization.additionalBudgetScope={id:"vu-europe-817-completion-20261007",openingCredits:3702,targetCredits:8000,hardCredits:12000}` and the exact preceding ledger hash. The additional scope is immutable; it cannot be removed, reopened or reset. This caps the cumulative run at15,702 or a lower verified bound. Freeze existing cached history hashes, explicit sample IDs and incremental retrieval policy in the authorized reference hash. This is a one-off private development allowance, never a monthly schedule or account-balance claim.


The current explicit instruction authorizes a deterministic counter when the account remainder is unavailable: target 15,000, hard maximum 20,000 additional estimated symbol credits for this one run. `USER_AUTHORIZED_BOUNDED_RUN` records this authorization separately from account evidence; it never invents a balance or implies a tariff change. The unmerged historical 5,000-credit opt-in monthly safety default remains for legacy account-bound callers, but is not a current repository/account requirement for the newly authorized run. If a verified smaller account remainder is supplied, it still reduces the bound and retains a reserve. There is no recurring schedule. Controlled source/selection updates require `authorization.previousLedgerHash` from the preceding encrypted result (`budget.ledgerHash`, equivalently SHA256(JSON.stringify(parsed shared-budget.json))). The stable authorization ID/run ID/hard/target caps must stay unchanged; an explicit revision appends provenance and carries every previous attempt and credit. An absent/stale parent hash cannot reset or replace the counter.

Create an owner-authored, same-repository PR and add `vu-marketstack-bootstrap`. The new `pull_request` workflow can run before the workflow exists on main. It verifies the existing Actions secret without printing it, creates an RSA3072 public recipient, persists the private key only in the existing API-key-derived authenticated encrypted cache, and uploads only `marketstack-handoff-public-<PR>.json`. Cache context is the stable `refs/pull/<PR>/merge`; caches are restricted to that PR. An unreadable existing encrypted cache stops rather than resets state.

After fetching the public artifact, generate a separate result-recipient key in authorized private local storage. Construct a private request with these fields:

```js
{
  version: 'vu-marketstack-live-request-1',
  context: 'refs/pull/<PR>/merge',
  sourceSHA: '<approved code commit before the ciphertext-only commit>',
  runId: '<stable ID for all phases and all agents in this authorized run>',
  phase: 'sample', // then mandatory/refresh only with the root importer proof
  asOf: 'YYYY-MM-DD', listingMap: frozenMap,
  resultPublicKey: '<local result RSA3072 public key PEM>',
  authorization: {
    kind: 'USER_AUTHORIZED_BOUNDED_RUN', id: '<stable authorization ID>',
    source: 'Current explicit user instruction: target 15000, hard 20000',
    runId, month: 'YYYY-MM', observedAt: '<current ISO timestamp>',
    hardLimit: 20000, targetLimit: 15000,
    unknownAccountUsageAcknowledged: true, sourceSHA,
    referenceHash: SHA256(JSON.stringify(frozenMap))
  }
}
```

Use `actions-handoff.mjs encrypt-request --input=<PRIVATE_JSON> --public=<PUBLIC_ARTIFACT_JSON> --out=<REQUEST_PATH>`. Commit only the ciphertext at `scripts/marketstack/private-bootstrap/request.enc.json`. Source SHA must be an ancestor of HEAD, and the only intervening changed path may be this ciphertext. All scripts are excluded from site releases. Add `vu-marketstack-live` and remove the bootstrap label before the ciphertext push.

The live job decrypts in ephemeral private runner storage, validates the frozen map, SHA and authorization, and persists an encrypted ACTIVE execution lease before the first paid call. If a runner crashes or a cache cannot be persisted, later work must reconcile the lease; it cannot silently receive a fresh 20,000 allowance. Every client request/page/retry reserves from the same durable ledger. GitHub rerun attempts are blocked pending reconciliation. A completed identical request is not queried again. The root importer controls sample, real browser proof and mandatory continuation; this handoff does not bypass those gates.

Results include privately stored provider source responses, normalized cache, counter, status and preview in an RSA/AES-GCM encrypted tar archive addressed only to the local result public key. The bootstrap private RSA key is omitted from the result. GitHub artifacts contain only the public recipient or ciphertext; raw responses, account evidence and the Marketstack API key never enter plaintext artifacts. Use `actions-handoff.mjs decrypt-result --input=<CIPHERTEXT_JSON> --private=<LOCAL_RESULT_KEY> --out=<PRIVATE_TAR_GZ>` and extract into authorized private storage. Public display and automatic production publication remain independently gated.

Before preparing a paid lease, authenticated Actions history for this workflow and
head branch is read (bounded to 1,000 runs; inaccessible/truncated history fails
closed). The newest earlier run whose live prepare succeeded or whose execution
started must match the restored COMPLETED lease, exact final counter and ledger
hash. Bootstrap-only runs do not reset that evidence. Restoring an older bootstrap
cache after a final/lease cache eviction therefore cannot restart the allowance.
Attempted reruns and unreconciled ACTIVE leases remain blocked. A revised
authorization carrying `previousLedgerHash` also requires the original ledger to
exist; it cannot create a replacement zero ledger. No paid transport happens
before these checks and the independent exact remote lease-cache verification.

`identity_probe` is a metadata-only phase using the same authenticated client,
private response store, shared counter and durable Actions lease. Place the frozen
resolution reference under `listingMap.identityProbe`; it is then included in the
existing authorization reference hash. At most 12 target share classes and 20
deduplicated request candidates are allowed. The current 12-member reference
produces 17 candidates (official local ticker `.DE` plus documented cached
alternatives). Suffix construction creates only an unverified request candidate.
There are no retries, price requests or history requests in this phase.

Exact returned symbol, ISIN, MIC and compatible share-class evidence are required
for `FOUND` or `ALIAS_RESOLVED`. A separately sourced current official share class
can be supplied with `reference.shareClass` and `reference.shareClassSource`.
Unknown or contradictory class evidence stays PARTIAL, even when ISIN/MIC match.
Alternative venues receive a canonical distinct listing ID and no inherited
currency basis. The private `identity-probe/de_eu_identity_probe.json` mapping
delta always has `priceHistoryAdmitted:false`; applying it and admitting prices
requires the ordinary selected-listing validation path. No provider key, licensed
response or plaintext probe reference is added to source control.
