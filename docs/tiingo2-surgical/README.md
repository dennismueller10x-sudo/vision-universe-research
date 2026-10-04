# Tiingo 2.0 blocker evidence (current main)

This branch is a read-only/safety follow-up to Draft PR #404. The baseline is
`43ed0f7ced3ac079a23a3dd63e4f9074eb755b74` (6,397 Consumer titles); it
does not publish candidates, write production storage, or replace generated
product artifacts.

## Factor population

The 30 exact identities and old scores/ranks are in
`factor_population_before.json`; their absence on current main is recorded in
`factor_population_after.json` and `factor_population_diff.json`. Twenty-nine
are current Consumer titles. Quant V2 composite scores and composite ranks
were never published (`QUANT_V2_NOT_ACTIVE`); the report's factor ranks are
diagnostic ordinal ranks over the old published screening population.

The 2026-10-03 05:32 UTC factor run executed on workflow head
`164fe3369d053e9e69c9f2d6917dc30d45a6f0ed`, before the stricter
corporate-action validator was merged in `e7b038fcc`. The later 14:25 factor
run used that validator and omitted these 30 with
`unexplained_adjustment_step`. Comparing the actual old run's restored cache
`discover-market-cache-37085599297` with the new run's cache
`discover-market-cache-37125382185` showed identical raw bars, adjusted bars,
and provider action columns for **all 30**. Thus a Tiingo history restatement
between these runs is ruled out. The complete focused event windows and hashes
are retained as the read-only Actions artifact for run `37189204463`; the
per-title condensed evidence is in `factor_adjustment_root_causes.json`.

The new validator finds steps in adjusted/raw ratio with no matching split or
dividend in Tiingo's action columns. Repeated quarterly steps may be missing
cash distributions, but frequency is not independent proof. The report
classifies all 30 as unresolved data defects. No old score is reintroduced as
fresh valid evidence. The new materialization gate checks both current rows and
the historically published 30 before overwriting any shard. It fails with
`UNREVIEWED_FACTOR_REMOVALS:<exact tickers>` until per-title before/after,
score/rank impact, reason, and reviewer evidence is supplied or the source
quality problem is resolved. The run deliberately remains blocked.

Current-main Factor Evidence has already lost those 30 in separate
materializations (`388d9ca55`, `6d8028e55`). The gate prevents another silent
loss; it does not undo that earlier publication. Rank drift is measured in
`factor_population_diff.json`, and is too large to approve PR #404 from the old
population comparison.

## V1 Screener

The five exact old missing-price hits were BURU, NCPL, SDEV, BGDE, ASST. They
were stale index entries: the canonical published chart series and matching
security IDs were already present before the index materialization. On current
main all five have valid 2026-10-02 USD prices. The V1 Screener query and a
new chart/index contract regression both pass.

The prior-to-current index diff contains 344 changed price fields: 342 old
missing prices filled and two old prices advanced. **All 344** match pre-existing
canonical chart values, date, currency, and security ID. There are 433 changed
rows overall, including 373 factor-coverage marker changes and 63 valuation
marker changes; these must be reviewed with the Factor Population blocker.
There was no index rebuild in this branch. The full old/current index snapshots
are local review artifacts in `/workspace/tiingo2-surgical-evidence/`; the
complete 433-row semantic diff and per-five root causes are committed here.

## Publication

PR #404 must stay Draft. This branch does not merge or publish. The unresolved
factor-action evidence and existing materialized factor/rank drift require
explicit resolution before CAS/storage/index/rollback publication gates can be
considered green.
