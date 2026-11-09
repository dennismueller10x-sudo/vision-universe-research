# Phase 1a — daily continuation and storage integrity

Active requirements: Master §§26–27,36,60,77–85; Research #1 incremental EOD; Research #3 fail-closed migration and resumability.
Relevant contract excerpts: “INCREMENTAL UPDATE FOREVER”; “Keine stille Null”; “CURRENT REPOSITORY REALITY WINS”.
Affected contracts: market store read failures and checkpoint scope. Existing missing-file return remains null; corrupt existing files must be distinguishable and must not be overwritten/rebackfilled silently.
Affected files: quant/engines/market-store.js, scripts/market/ingest-tiingo.mjs, focused quant/tests. SEC paths excluded.
Acceptance: same-day resume skips completed work; next-day run is independent; corrupt JSON bars/checkpoints fail with typed error; no secret/payload content in error; inventory reports unreadable without crashing; original publish permission remains unchanged. No claim of full lifecycle completion: persistent deployment storage and adjusted-history reconciliation remain gaps.
Tests: targeted store/resume/ingestion tests; full Node regression at gate. No provider calls or full-universe backfill. Rollback: revert phase commit; existing checkpoints preserved, not deleted.
