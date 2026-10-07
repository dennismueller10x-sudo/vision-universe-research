# Accepted-state recovery — 7 October 2026

PR #356 and PR #455 stay open and unmerged. No production gate, access control or scheduler is activated. This recovery supersedes the earlier missing-workspace assessment with the three files supplied by Dennis; it does not add historical coverage from other ledgers.

## Input and isolation

The supplied `accepted-preservation-20261006T155510Z.tar.gz` is exactly **30,905,804 bytes**, SHA-256 `2368931508ec869fed1246733465b15dd550a6bcaec1d2154aed2359cb7ba6f9`. The supplied manifest and evidence agree on accepted generation `21cc611a43b06f488418b58a`, data time `2026-10-06T14:00:21Z`. The evidence explicitly excludes the stopped incomplete discovery batch.

Existing safe `checkpoint.py restore` imported it into new directories outside the repository. All six original fingerprints match: 20,419 items; 12,722 events; 5,366 sources; 974 aliases; 69,127 state rows; 24,727 audit rows. The separate archive contains 1,107 history rows. Independent all-table schema, record and primary-key proofs additionally cover both databases. No existing writer lock was removed and no live database was copied. No crawl, seed, prune or polling command ran.

Read-only recomputation of the original coverage definitions at the retained data timestamp independently reproduces 5,120 payloads, 3,678 available profiles, 2,601 news issuers, 1,069 call issuers and 1,821 presentation issuers. These are operational availability counts, **not** customer-ready German profiles or published coverage. The raw export has news arrays for 2,616 issuers: `anyNews` deliberately restricts this to the 2,601 issuers with an actual publication within 180 days. The raw `calls` array covers 943 issuers with dated call events; the operational 1,069-call count additionally includes undated webcast/recording document evidence. This is a definition difference, not lost records.

## Generation diagnosis

`Store.export` includes timestamp, a digest of all producer Python files, issuer identities/sites and relevant ledger rows. The unchanged accepted ledger with its retained timestamp reproduces **exactly `21cc611a43b06f488418b58a` using original producer `5a3ca18d3099df1f916e922e409aa01cb4a33436`**. Newest inspected #356 producer `abbea154a90ffece598e494530eea38661a20a95` reproduces `2b1a4bcdffb54e9b40a23a98`, exactly matching the previously reported reprojection mismatch.

This is a producer revision difference, not lost ledger rows. Both pinned producers are checked separately; each exports twice with identical asset hashes and counts. All operational tables must remain identical before/after. Facts and accepted timestamps are not changed to force a hash match. The latest engine remains the integration target; the older producer is only a recovery proof.

## Private transfer design

Local R2 bindings are absent. The existing repository Actions secrets and `privacy.mjs` provide the authorized route. `accepted_handoff=issue` checks that the bucket has no managed public domain or custom domains and reads both the original rollout pointer and the separate accepted pointer **before any write authorization**. It issues a short-lived PUT authorization, signed by the existing `signRequest`, bound to the exact SHA-256, content length, method, private object key and `If-None-Match: *`. Its secret signing key never leaves Actions.

The authorization is encrypted with AES-GCM and RSA-OAEP to an ephemeral workspace public key. Only the encrypted capability goes into a one-day Actions artifact; **neither plaintext credentials nor the private archive go into any artifact**. The archive travels directly from this workspace to the non-public R2 bucket over the managed proxy. Decryption and upload occur outside Git. An expired local key cannot prevent restoring the durable checkpoint later.

`accepted_handoff=accept` reads the uploaded bytes back, checks the exact size/hash, restores and verifies every database, generates consumer projections from the two pinned engines, then invokes the existing bounded two-slot `sync-state.mjs`. Pointer publication is last. The original rollout namespace is never modified. A different checkpoint in the accepted namespace blocks the operation; a richer original rollout cannot be replaced by this recovery. All mutating workflow jobs retain the existing serialized writer group.

The final job is a genuinely independent hosted runner: it receives no ledger/cache/archive artifact and reads the checkpoint solely through the durable R2 pointer, rechecks privacy and repeats exact restore plus both exports. Only sanitized hash/count evidence is uploaded.

Private namespace: `accepted-20261006-21cc611a43b06f488418b58a`. Pointer: `v1/company-intelligence/state/accepted-20261006-21cc611a43b06f488418b58a/index.json`. This accepted handoff is not an authorization to resume or overwrite a later operational writer.

## Acceptance evidence

Authenticated issue run: [37593324150](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37593324150). Both relevant pointers were absent. The exact private PUT returned HTTP 200. Acceptance/fresh-restore run: [37593716690](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37593716690). Final runner evidence and statuses will be recorded after completion; an HTTP 200 by itself is not a fresh restore proof.

## Publication boundary

The supplied request says “DO NOT merge or deploy anything” and later asks for an external preview. Until Dennis resolves that contradiction, the explicit no-deployment instruction applies. Local product inspection after preservation and remote code/documentation preservation remain authorized. No localhost address is represented as an external preview. Customer activation always needs separate approval.
