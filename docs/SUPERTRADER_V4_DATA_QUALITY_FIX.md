# Supertrader V4 – data quality fix (V4-D1 / V4-D2)

**Result: NOT_READY.** Do not start a new pre-registered calibration yet. The blockers are listed in section 7.

This is research only. No calibration was run, no strategy was measured, no performance figure was calculated, and no claim was produced. Nothing was merged or migrated. #705, #709 and #712 are untouched.

The work is split into two Draft PRs because of Supertrader Gate A:

| PR | Branch | Content |
|---|---|---|
| Quant (canonical core) | `quant/canonical-price-integrity-d1-d2` | `quant/engines/canonical-total-return.js` 1.2.0, `quant/engines/price-integrity.js`, `quant/tests/price-integrity.test.mjs`, audit script and workflow, public audit results `docs/data-quality/price-integrity/`, sealed case evidence |
| Supertrader (this file) | `research/supertrader-v4-data-fix`, stacked on the Quant PR | the six required JSON files in `scripts/supertrader/research/v4/data-fix/`, their builder and consistency test |

The fix lives in the canonical core, not in Supertrader code. Supertrader only reports on it.

## 1. Procedure

1. **Pre-registration (commit `dbb9aba`).** I fixed the detection rule and the policy before seeing any case-level data. The rule was `corporate-action-contract-1.1.0`. A synthetic-fixture check had already led me to add the condition "volume below the median".
2. **Audit runs.** Each run took a BEFORE capture with the pinned #705 pipeline and core 1.0.0. It then reconstructed the population and re-read the raw store series, including the provider adjustedClose column. Finally it took an AFTER capture with the new core overlaid and compared the two.
   - **Run 38760425332:** a defect in the audit tooling made all raw re-reads fail. The run is invalid as evidence.
   - **Run 38766580165 (core 1.1.0):** it failed its own false-positive check. For k = 2 or 3, the SEC share count contradicted the split in 51 of 53 holds that had share-count evidence; for k ≥ 5 it contradicted 2 of 11. **1.1.0 is rejected.** Its results remain in `docs/data-quality/price-integrity/run-38766580165-core-1.1.0/`.
   - **Run 38772238376 (core 1.2.0, post hoc):** the current result. The changes from 1.1.0: k ≥ 5, an exact-ratio overnight path, and a path for jumps of at least 100× overnight with falling volume. Tolerances are unchanged.
3. **Population reproduced exactly.** The BEFORE capture has the same canonical content as freeze V4-beae51ae1b07768b. It reproduces 2,200 / 65 / 13 extreme security-months and the 55 + 28 diagnostic cases.
4. **Independent adversarial review.** The public part is in `SUPERTRADER-V4-DATA-FIX-REVIEW.json`.

## 2. Answers

**1. What caused V4-D1?**
- **Provider side.** Tiingo carried no split factor for the reverse split. Its adjustedClose also moved with the raw price: on all 23 undeclared reverse-split days the provider factor stayed unchanged.
- **VU side.** `canonical-total-return.js` 1.0.0 detected a missing split only in two situations:
  - the provider column showed it (`SPLIT_MISSING`);
  - there was no provider column and the jump fit a ratio list up to 20 (`SPLIT_SUSPECTED`).
- **How the defect got in.** When the provider column moved with the raw price, the core accepted an overnight jump of 10× to 5,000× as a market move. `data.mjs#firstCanonicalFailure` then marked the series VALID.

**2. What caused V4-D2?**
- **Adjusted levels above 1e6 (74 securities).**
  - 61 are the correct arithmetic of declared, consistent serial reverse splits on penny stocks. The returns are correct and the level is no defect.
  - 10 have an undeclared jump in their history.
  - 3 have an inconsistent declared split. These are the "SPLIT_ARTIFACT" cases in V4.
- **#705's original V4-D2** (the VU equal-weight population is about 1.34× the CRSP population) is a universe definition question, not a price defect. It is unchanged.

**3. How many of the 83 extreme cases were real reverse splits?**
- 23 were undeclared reverse splits; the core now holds 19 of them.
- Separately, 28 cases are months that contain a declared split. In 26 of those the split day is consistent, and the extreme monthly return comes from real price moves on other days.

**4. How many were other data errors?** 15:
- 7 unit or scale errors;
- 4 provider spikes;
- 2 stale prices;
- 1 inconsistent declared split;
- 1 split recorded on the wrong day.

5 more remain unexplained, and 40 are real price moves: 26 declared-split months plus 14 intraday squeezes on 100× to 7,000× volume.

**5. How many of the >1e6 cases were legitimate?**
- 61 of 74, all from declared reverse splits.
- None was a legitimately high nominal price.
- 60 of the 61 are not newly held. One is newly held because of a separate undeclared event in its history.

**6. Which errors lay with the provider?** Every defect among the 83: the 23 undeclared reverse splits, the 7 unit or scale errors, the 4 spikes, the 2 stale prices, the 1 inconsistent declared factor and the 1 split recorded on the wrong day.

**7. Which lay in VU normalization?** Three:
- The missing plausibility check in the core (1.0.0) let all 38 defects of the 83 into the canonical dataset.
- The V4 price-sanity selection reads the full-history level, which is look-ahead (review R16).
- `scripts/quant/lib/daily-prices.mjs` drops the whole total-return series when a hold fires (review R8). This blocks a merge.

**8. Which lay in identity or listing mapping?**
- None of the 83. `data.mjs` breaks segments at gaps over 30 days before returns are formed.
- The daily census finds 61 jumps after listing gaps. They stay outside the returns.

**9. What policy now applies to undeclared splits?**
- `SUSPECTED_UNDECLARED_SPLIT` leads to **HOLD**, with reason code `SPLIT_SUSPECTED_UNDECLARED`.
- **Combined evidence is required.** All of the following must hold:
  - no corporate action is reported;
  - the close and the open are at a conventional ratio k ≥ 5 (±25 %);
  - the share volume falls to below the median and to no more than 3/k of it.

  Alternatively, the close and the open hit k exactly (±2 %), or the jump is at least 100× overnight with falling volume. The size of a return alone is never enough.
- **No silent correction.** A hold is released only by a corporate-action record; the declared factor then normalizes the series.
- **The full policy** is in `SUPERTRADER-V4-CORPORATE-ACTION-POLICY.json`. It covers confirmed, conflicting and suspected splits, unresolved discontinuities, high nominal prices, stale data and listing breaks, with outcomes ACCEPT, NORMALIZE, QUARANTINE, HOLD and REJECT. There is no price cap.

**10. Are there new false positives?** Yes.
- **1.2.0:** 106 new holds (90 undeclared-split, 16 spikes). 35 of them have no forensic evidence of a defect.
- **SEC share count as the independent label (review R1):**
  - 13 holds confirm the split.
  - 14 contradict or do not support it; in 5 of these the share count is unchanged.
  - 58 have no SEC evidence.
- **Independent false-positive rate:** 16 % (strict) to 44 % (broad).
- **Where they come from:** most of the contested holds are sub-cent or stale quotes.

**11. Is the canonical dataset now clean enough for calibration?** **No.** See section 7.

**12. Which exact blockers remain?** See section 7.

## 3. Before and after (rebuild, same source objects)

| | BEFORE (1.0.0) | AFTER (1.2.0) |
|---|---|---|
| Segments | 9,408 | 9,399 |
| Bars | 14,374,702 | 14,286,912 (−0.61 %) |
| Data-quarantine terminals | 521 | 592 |
| `SPLIT_SUSPECTED_UNDECLARED` / `PRICE_SPIKE_REVERTED` | – | 90 / 16 |
| Security-months above +100 % / above +1,000 % / below −99 % | 2,200 / 65 / 13 | 2,098 / 38 / 11 |
| Diagnostic class UNDECLARED_RAW_JUMP_10X | 55 | 20 |
| Undeclared ≥10× sessions in canonical bars | – | 188 |
| Content hash (fingerprint) | `318c051f…` (= V4 freeze) | `2549d118…` |

## 4. Tests (Phase F)

`quant/tests/price-integrity.test.mjs` has 35 tests: the 10 required cases plus 11 golden cases built from real case signatures. The golden cases contain no prices, tickers or dates. Two of them deliberately document known false negatives. The full Quant suite passes 2,825/2,825.

The fixture series `ref_AGX` from the published Discover long series contains an undeclared 1:25 reverse split from 1995 (exactly 25.00× overnight). Two study tests now count it.

## 5. Independent review (Phase H)

| Severity | Count | Findings |
|---|---|---|
| HIGH | 4 | R1 (the false-positive measure is circular), R4 (false negatives), R5 (11 known D2 defects remain canonical), R8 (`daily-prices` drops whole series; blocks merge) |
| MEDIUM | 8 | R2, R3, R6, R7, R10, R13, R16 and others |

I did not fix any HIGH finding post hoc. That would be more in-sample tuning (R13). All HIGH findings, and every MEDIUM finding that blocks a calibration, are documented as **open blockers**.

## 6. Private evidence

- The per-case file (identities, raw OHLC, adjusted OHLC, corporate-action records, SEC share counts, expected and observed transformation) is sealed to the owner and session keys in `scripts/quant/price-integrity/sealed/`.
- The public counts are bound to it by the plaintext SHA-256.

## 7. Calibration readiness: NOT_READY

`SUPERTRADER-V4-DATA-FIX-CALIBRATION-READINESS.json` lists the blockers:

- **DF-B1 – undeclared discontinuities that prices alone cannot prove.**
  - Evidence:
    - 12 of the 83 still carry a defect: 4 undeclared reverse splits confirmed by SEC share counts, 3 unit or scale errors, 1 inconsistent declared split, 1 split recorded on the wrong day, and 3 unexplained.
    - 188 undeclared ≥10× sessions remain in canonical bars, and downward jumps are never caught.
  - Needed: an independent corporate-action source in the core, such as provider split history or SEC share-count reconciliation as a second evidence path. This is an external data blocker.
- **DF-B2 – the fix is not merged.** A calibration needs the merged core, a fresh capture and a manifest that records canonical-total-return-1.2.0.
- **DF-B3 – #705 V4-D2 (universe population) is unchanged.**
- **Review blockers:**
  - R1 and R13: precision and recall against an independent SEC label on a held-out set, with a pass threshold set in advance.
  - R4 and R10: the k-selection bug, plus no rule yet for downward and unit jumps.
  - R5: the 11 known D2 defect securities.
  - R6: censoring and settlement of holds.
  - R7: one session of look-ahead for spikes.
  - R16: level-conditioned sanity selection.
  - R8: whole-series drop in quant consumers; this blocks a merge.

The exact rebuilt dataset is an audit rebuild, not a calibration input:
- fingerprint `2549d1185c57e0c6019aa287f2c6667b4ff03eefb08920336ca1e90892ecb199`;
- part-list hash `ff1b7ae435503adabf6f8acb19133fcca8eb1978436f3a559bffbc8b72feed69`;
- built in run 38772238376, commit `e049f4c8a61`.

## 8. Rebuild

```bash
# Quant: audit (Actions, with the store secrets): a commit containing [price-integrity:audit] on quant/canonical-price-integrity-d1-d2
# Supertrader artifacts from the decrypted, sealed case file:
node scripts/supertrader/research/v4/data-fix/build-data-fix-v4.mjs --private <decrypted> --review <review-public.json>
node --test scripts/supertrader/tests/v4-data-fix-artifacts.test.mjs "quant/tests/price-integrity.test.mjs"
```
