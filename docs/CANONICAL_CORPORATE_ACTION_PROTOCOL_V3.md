# Canonical corporate-action protocol 3.0.0

Goal: prove the canonical price-data layer before any return to the book-derived strategies. This is a data-integrity track only: no calibration, no strategy performance, no change to the source acceptance rules of #709/#712. PRs #721/#722 (V4-D1/D2) and #737 (v2) stay unchanged as historical evidence.

**Verdict: `NOT_READY`.** The readiness file is `docs/data-quality/corporate-action-v3/SUPERTRADER-CORPORATE-ACTION-V3-CALIBRATION-READINESS.json`. The verdict was pre-committed from the public counts of the first run, before any sealed result was decrypted (`VERDICT-PRECOMMIT.json`). The final run confirms it.

## 1. What v3 adds

| Item | Implementation |
|---|---|
| Second independent corporate-action source | FINRA OTC Daily List (`quant/engines/finra-daily-list.js`, collector `scripts/quant/corporate-action-v3/finra-collect.mjs`). Public FINRA Query API: splits with ratio and ex-date, symbol/name changes, exchange↔OTC market-center changes, deletions, bankruptcy and ADR-ratio changes. Each row carries its publication timestamp (`dailyListDatetime`). It is integrated in the evidence model (`corporate-action-validation-3.0.0`) next to SEC: SEC↔FINRA disagreement means HOLD, agreement is a second confirmation. |
| Validation-only second vendor | Yahoo chart: split events and split-adjusted closes. It is not point in time and has no commercial licence, so it is never a core input; it is used only for labels. |
| Independent PIT oracle | A truncation oracle checks the engine's as-of view against a build on inputs truncated outside the engine. EDGAR acceptance times come from `data.sec.gov/submissions`, a different SEC system than the full-text search behind `visibleAt`. Every `observedAt` must be visible in the oracle view of that day. |
| Event semantics of large jumps | `quant/engines/discontinuity-semantics.js` classifies every overnight move of 3:1 or more without a provider event. Causes: forward/reverse split, special distribution, currency/unit, listing change, bad tick, staleness, genuine move, unresolved. It works from mechanics (event-day share and dollar volume, persistence of the volume scaling, reversion, stale run, gap, FINRA listing events), not from return size. |
| Validity contract 3.0.0 | Named boundaries `VALID_UNTIL`, `HOLD_FROM`, `INVALID_RANGE`, `RESUME_FROM`, `TERMINAL`. After a scale-type hold the series resumes as a new segment with its own index base, and no return is computed across the break (`isValidReturn`, `alignSegments`). The 2.x fields keep describing the first segment. |
| Normalization rule | NORMALIZE now needs a second confirmation independent of the triggering statement for every ratio: the other source, share volume in split direction, or the SEC share count. This answers v2 blocker B2 and was pre-registered. |
| Blinded control set | 11 categories (normal, volatile, penny, confirmed forward/reverse splits, downward jumps, symbol change, merger, delisting, stale, high nominal). They are drawn from independent data before any v3 decision, and the member hash is published first. The 83/74 V4 cases and the v2 control members are excluded. |
| Pre-registration | `CORPORATE-ACTION-PROTOCOL-V3.json`. An independent pre-run review (round P3, 5 HIGH) was fixed **before** the first run. Nothing was changed after any result. |

## 2. Runs

| Run | Role | Result |
|---|---|---|
| 39007119068 | full run | Everything collected except the validation vendor: GitHub runners get HTTP 429 (25 of 25 symbols blocked). Probe run 39013825289 confirmed both vendor hosts are blocked; FMP and Twelve Data are reachable but limited to 250 and 800 requests per day. |
| 39019906367 | reuse run (label request) | SEC parts reused; merged SEC/FINRA/EDGAR inputs kept as an artifact. A sealed label request was produced: ticker, a 124-bar identity sample and the days to label. All counts are identical to the first run. |
| 39031465706 | **final reuse run** | Same merged inputs, plus the vendor evidence computed outside the runner (`vendor-evidence.mjs`, `VENDOR-EVIDENCE-V3.json`: ticker-free, keyed by hashed segment id, no vendor price series). Decisions are identical; only the vendor labels differ. |

Disclosed deviation: the vendor data were fetched from this session's container, not the runner. The label rules are unchanged and the same code computes them; the local path was verified to give byte-identical audit sections on a dry run. The vendor then rate-limited this host too, so 3,204 symbols (3,345 segments, mostly delisted names, of which 94 % of those tried are unknown to the vendor) were not collected. They are reported as `NOT_COLLECTED_BLOCKED`, never guessed. Vendor identity is CONFIRMED for 5,233 of 9,407 segments.

## 3. Results (final run 39031465706)

| Criterion (pre-registered) | Value | Threshold | Pass |
|---|---|---|---|
| PIT violations | Oracle: 0 mismatches in 3,512 views, 0 observedAt too early. 2 SEC observations have a filing date before their EDGAR acceptance day (0 of the 146 behind decisions) | 0 | **no** |
| Acceptance-time coverage (decision observations) | 1.00 | ≥ 0.95 | yes |
| Blinded FP rate, pooled (segments) | 0.0119 (10 of 842 labelable; Wilson 0.0065–0.0217) | ≤ 0.02 | yes |
| Blinded FP rate, per category | all ≤ 0.04, but HIGH_NOMINAL has 1 labelable segment (pool of 1) | ≤ 0.05, ≥ 30 labelable | **no** |
| Blinded FP share, per labelled intervention | 0.345 (10 of 29) | ≤ 0.10 | **no** |
| Blinded FN rate (vendor events) | 0 of 15 | ≤ 0.05, ≥ 50 evaluable | **no** (n) |
| FN rate, universe (vendor events) | 0.103 (4 of 39; Wilson 0.041–0.236) | ≤ 0.05 | **no** |
| Course-only hold false share | 0.568 (21 of 37 labelled; labelled share 0.13) | ≤ 0.10, ≥ 0.5 labelled | **no** |
| Course-only FN rate | 0.038 (1 of 26) | ≤ 0.10, ≥ 50 evaluable | **no** (n) |
| Normalize false share | 0.818 (18 of 22 labelled) | ≤ 0.05 | **no** |
| Downward FN rate | 0 of 21 (Wilson ≤ 0.155) | ≤ 0.10, ≥ 20 evaluable | yes |
| Downward hold false share | 0.566 (43 of 76 labelled) | ≤ 0.10 | **no** |
| Known D2 defects in valid range | 10 of 11 (the 11 are reproduced exactly) | 0 | **no** |
| Extreme moves left valid that evidence calls event / bad data | 6 of 107 | 0 | **no** |
| Extreme moves left valid, unexplained | 0.589 | ≤ 0.10 | **no** |
| Unresolved conflicting holds | 21 = 0.92 % of segments with CA evidence | ≤ 0.5 % | **no** |
| Independent label coverage of interventions | 0.261 | ≥ 0.5 | **no** |
| Blinded labelable share | 0.845 | ≥ 0.5 | yes |
| Second source integrated | 204 FINRA effective split events joined, 15 normalizations, 18 second-source corroborations | ≥ 1 | yes |
| SEC collection complete | 1 incomplete search window, 1 unreadable document out of 70,395 | 0 windows, ≤ 0.1 % | **no** |

Coverage and data layer:
- **Valid bars.** First segment: 14,555,110 (v2: 14,601,860; the new holds cost 46,750). All segments: 14,675,565 (+73,705 versus v2, including 118,657 resumed bars in 163 segments).
- **States.** 9,014 FULL_VALID, 367 VALID_PREFIX, 17 VALID_WITH_INVALID_BARS, 9 NO_VALID_BARS (v2: 9,072 / 316 / 14 / 5).
- **New holds.** 67 unexplained extreme, 26 split signatures, 45 stale-then-jump, 12 currency/unit, 49 semantic listing terminals.

## 4. Answers to the 12 items

1. **Second independent source.** FINRA OTC Daily List, integrated in the core. Its coverage is honest but narrow:
   - 602 of 9,407 segments have any FINRA row and 169 have a split event. The universe is exchange-listed, and FINRA lists OTC securities only, plus transitions into and out of OTC.
   - Exchange notices (priority 1) are not obtainable with history. Nasdaq Daily List needs a subscription, the Nasdaq calendar has no history, and NYSE has no machine-readable archive.
   - Issuer IR pages cannot be bulk-read.
   - Commercial keys exist but free tiers cannot cover the universe and the licence is unknown.
   - Full table: `CORPORATE-ACTION-SOURCE-MANIFEST-V3.json`.
2. **Independent PIT oracle.** LABEL_SOURCE (EFTS file date, FINRA timestamp) ≠ VALIDATION_SOURCE (truncation outside the engine, EDGAR submissions acceptance time).
   - The engine passes: 0 mismatches, 0 observedAt too early, 0 decision observations filed before acceptance.
   - The data layer fails on 2 SEC observations whose filing date precedes their acceptance day. The fix, `visibleAt = max(filing date, acceptance day)`, is a rule change for the next protocol.
   - FINRA has a single timestamp, so it is checked by truncation only.
3. **Blinded control set.** 997 segments in 11 categories, fixed and hashed before evaluation. Pooled segment FP is 0.0119. Per labelled intervention it is 0.345, and blinded FN is not measurable (15 evaluable events).
4. **Course-only holds.** 277 holds. FP share is 0.568 (21 of 37 labelled, 13 % labelled); FN is 1 of 26. Not acceptable, so **NOT_READY**.
   - All 21 FP labels rest on "the vendor shows the same raw move without a split". This cannot separate a genuine move from a split both vendors missed (`labelSensitivity`).
   - No rule was adapted to known cases.
5. **Downward jumps.** Event semantics are implemented for both directions; the full census is in `DOWNWARD-JUMP-VALIDATION-V3.json`.
   - 1,550 candidates. Causes: 674 genuine, 243 unresolved, 219 bad tick, 188 staleness, 154 listing change, 37 forward split, 19 currency/unit, 16 special distribution.
   - Downward FN is 0 of 21, but the downward hold false share is 0.566 (43 of 76).
6. **D2 defects.** All 11 are reproduced; 10 remain in the valid range. Diagnosis (counts only; no fitting):
   - 2 are declared-split residuals of 2.0 and 1/2.25, below the 3:1 candidate threshold and inside the core band.
   - 8 are downward moves of −90 % to −97 % on 114× to 30,609× share volume, which the semantics read as genuine.
   - Of those 8, the second vendor shows 4 identically without a split, the SEC share count confirms 1 as an event, and 3 are unresolved. So #722's "defect" label is itself partly contradicted by independent evidence.
7. **Extreme movements.** The 272 v2-unresolved moves of 10× or more are reproduced exactly (149 down, 123 up).
   - Independent class: 21 confirmed event, 4 bad data, 53 legitimate move, 194 unresolved.
   - v3 removes 167 from valid returns and adjusts 8; 97 stay valid, of which 38 are legitimate and 5 are confirmed events still unadjusted.
8. **Validity intervals.** VALID_UNTIL / HOLD_FROM / INVALID_RANGE / RESUME_FROM / TERMINAL are implemented and tested.
   - Historically valid ranges stay usable, and resumed segments add 118,657 bars.
   - Segments must never be chained. Resumed bars after breaks that a label calls false are reported (`resumedBarsByBreakLabel`).
9. **Consumers.** Only the four Quant studies read the core, and they drop whole series. No product uses `fromBarsPartial`. Discover, Screener, Supertrader production and Technical are not on the core. Migration is required for Quant, Supertrader (Gate A) and Technical (`PARTIAL-SERIES-CONSUMER-READINESS-V3.json`).
10. **Pre-registered criteria.** `CORPORATE-ACTION-PROTOCOL-V3.json`, unchanged after the first result. The pre-run review changes are listed in it.
11. **Independent review.** Round P3 before the run: 5 HIGH, all fixed before any result. Round R3 after the run: see `CORPORATE-ACTION-V3-ADVERSARIAL-REVIEW.json`.
12. **Readiness:** `NOT_READY`.
    - PIT: not independently passed (data-side timestamp finding).
    - FP/FN: measured and failing.
    - Downward jumps: covered semantically, but the hold false share fails.
    - D2: not out of the valid range.
    - Second source: integrated.

## 5. What would change the verdict (for a protocol 4.0.0, not applied here)

- A source of exchange-listed corporate actions with history and timestamps. The 8 remaining D2 jumps and most unresolved extremes are exchange-listed and outside FINRA's scope.
- A validation vendor reachable from the runner, or a licensed one, with delisted coverage. 4,174 of 9,407 segments have no CONFIRMED vendor identity (3,943 without vendor data), so labels are survivor-biased.
- A label that can tell "both vendors missed the split" from "genuine move". Candidates are a third price source or share counts at daily resolution. Without one, vendor-move FP labels bound the FP rate only from above.
- `visibleAt = max(EFTS filing date, EDGAR acceptance day)` for SEC observations.
- A downward-hold rule that keeps genuine crashes valid. Today the unresolved extreme rule and the forward-split signature hold 43 labelled-genuine down moves. It must be derived from mechanics and pre-registered, not fitted to these 43.
- Consumer migrations in product-owned PRs (Quant per study, Supertrader under Gate A, Technical).

## 6. Files

`docs/data-quality/corporate-action-v3/`:

| File | Content |
|---|---|
| `CORPORATE-ACTION-PROTOCOL-V3.json` | the pre-registered protocol |
| `CORPORATE-ACTION-SOURCE-MANIFEST-V3.json` | sources |
| `INDEPENDENT-PIT-VALIDATION-V3.json` | PIT oracle |
| `BLINDED-CONTROL-SET-V3.json` | blinded control set |
| `COURSE-ONLY-HOLD-VALIDATION-V3.json` | course-only holds |
| `DOWNWARD-JUMP-VALIDATION-V3.json` | downward jumps |
| `D2-REGRESSION-V3.json` | D2 and 83 regression |
| `EXTREME-MOVEMENT-CLASSIFICATION-V3.json` | extreme moves |
| `PARTIAL-SERIES-CONSUMER-READINESS-V3.json` | consumers |
| `CORPORATE-ACTION-V3-ADVERSARIAL-REVIEW.json` | review |
| `SUPERTRADER-CORPORATE-ACTION-V3-CALIBRATION-READINESS.json` | verdict |
| `VERDICT-PRECOMMIT.json` | verdict pre-commitment |
| `VENDOR-EVIDENCE-V3.json` | ticker-free vendor evidence |
| `RUN-INPUTS.json` | reuse inputs |
| `run-*/` | the three runs, public counts only |

Per-case results are sealed in `scripts/quant/corporate-action-v3/sealed-run-*/` (owner and session envelopes).

Code:
- `quant/engines/finra-daily-list.js`
- `quant/engines/discontinuity-semantics.js`
- `quant/engines/corporate-action-validation.js` (3.0.0)
- `quant/engines/canonical-price-validity.js` (3.0.0)
- `scripts/quant/corporate-action-v3/`
- `.github/workflows/quant-corporate-action-v3-audit.yml`
- `.github/workflows/quant-corporate-action-v3-vendor-probe.yml`

Tests:
- `quant/tests/corporate-action-v3.test.mjs` (26 tests)
- the v2 tests, which are unchanged and still pass
