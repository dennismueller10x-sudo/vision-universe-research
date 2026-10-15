# Supertrader V3 – owner delivery (sealed results)

Everything private is sealed to the owner key (and a session key); nothing private is in the repository or in public logs.
Only the key holder can open the files. Open them on your own machine; the private key never leaves it.

## Where the sealed results are

GitHub Actions artifacts of run **38685897684** (freeze `V3-84caf2e84e560bec`, commit of the pipeline `71f9c7e0`):

| Artifact | Content | Expires |
|---|---|---|
| `v3-sealed-calibration-CALIB_EQUAL_WEIGHT` | books, trades, curve per cost mode (owner + session envelopes) | 2026-10-29 |
| `v3-sealed-calibration-CAL_JT1993_6_6_REBALANCED_EW_NO_SKIP` | same | 2026-10-29 |
| `v3-sealed-calibration-CAL_GH2004_52WH_30_6_NO_SKIP` | same | 2026-10-29 |
| `v3-sealed-calibration-CAL_BLITZVANVLIET2007_US_LOWVOL_LOG_EXCESS` | same | 2026-10-29 |
| `v3-sealed-tournament-{cross_sectional_momentum, 52_week_high_effect, LOW_VOLATILITY, TURTLE_S2_EQUITY_DAILY, WEINSTEIN_STAGE_DAILY, KULLAMAGI_DAILY_ADAPTATION}` | summary, data-ready receipt, baseline and further sealed parts within a 0.9 GB budget per method | 2026-10-29 |
| `v3-sealed-current-replay` (separate replay run, see its public summary) | private candidate lists of the diagnostic replay | 14 days after that run |

**Download before the expiry date.** Public artifacts and all hash receipts (`CALIBRATION-V3-*`, `TOURNAMENT-V3-*`, `CURRENT-REPLAY-V3-*` in `scripts/supertrader/research/calibration/`) are committed and do not expire. Every public summary lists `plaintextSha256`, so a file you open can be checked against the committed hash.

## How to open a file

```bash
node scripts/supertrader/research/calibration/open-sealed-v3.mjs \
  --input <file>.sealed --output <plaintext-path> --private-key <your-owner-private-key.pem> --audience owner
```

Both sealed formats (streaming `*.sealed` and the JSON envelope `*.owner.sealed.json`) are detected automatically. The command prints only the plaintext SHA-256 and byte count. Compare it with `plaintextSha256` in the matching public summary. Do not store the plaintext in a repository.

## What the results mean (read before using)

See `docs/SUPERTRADER_CALIBRATION_V3_AND_TOURNAMENT.md` (claim boundary) and `CALIBRATION-V3-ADVERSARIAL-REVIEW.json`.
In short: the construction reconciles and passes a separate-path review, but it is not validated against an independent magnitude/direction oracle; tournament results are `MEASURED_RECONCILED_REVIEW_PENDING`, unranked, research-only.

## Reproducibility if an artifact expires

The pipeline re-captures the data content-bound (`[supertrader-v3:pipeline]` tag on a non-merge head commit) and produces new sealed files; unchanged results have the same `plaintextSha256` as published.
