# Canonical corporate-action validation v2

Goal: make the canonical price history independently trustworthy before any strategy is measured again.

This track adds an independent corporate-action source (SEC EDGAR) to the canonical data contract and validates missing or conflicting split events against it. It also keeps partial series instead of discarding whole histories (R8), and measures all of this on an independent control set. No calibration was run, no performance was measured and no strategy rule was changed. #705, #709, #712, #721 and #722 are unchanged.

**Verdict: `NOT_READY`** (`docs/data-quality/corporate-action-v2/SUPERTRADER-CORPORATE-ACTION-V2-CALIBRATION-READINESS.json`).

## 1. Artifacts

| File | Content |
|---|---|
| `docs/data-quality/corporate-action-v2/CORPORATE-ACTION-SOURCE-MANIFEST-V2.json` | Sources in priority order (SEC > issuer > exchange > provider > other), with coverage, PIT, split/reverse support, date, ratio, identity, latency, licence, access and failure modes |
| `…/CORPORATE-ACTION-EVIDENCE-MODEL-V2.json` | Evidence classes, SEC stages, outcomes, record fields |
| `…/CANONICAL-PRICE-VALIDITY-CONTRACT-V2.json` | Validity intervals, PIT rules, data contract fields (contract `canonical-price-validity-2.2.0`; measured as 2.1.0) |
| `…/PARTIAL-SERIES-CONSUMER-MATRIX-V2.json` | Consumer audit and adoption requirements |
| `…/CONTROL-SET-PROTOCOL-V2.json` | Pre-registered control protocol 2.0.0 (1.0.0 withdrawn before any result) |
| `…/INDEPENDENT-DATA-CONTROL-SET-V2.json` | Control set and acceptance results of the final run |
| `…/KNOWN-V4-REGRESSION-RESULTS-V2.json` | Regression on the 83 cases and the 74 high-level securities (counts only) |
| `…/CORPORATE-ACTION-V2-ADVERSARIAL-REVIEW.json` | Independent review rounds 1, 1b (F19) and 2 |
| `…/SUPERTRADER-CORPORATE-ACTION-V2-CALIBRATION-READINESS.json` | Verdict, criteria and blockers |
| `docs/PARTIAL_SERIES_HANDLING_V2.md` | Partial-series contract and PIT semantics |
| `…/run-*/` | Every audit run, including the cancelled ones, each with a README. Per-case results are in sealed envelopes only. |

Code:
- `quant/engines/sec-corporate-actions.js`: SEC text extraction (stages, ratio, dates, direction).
- `quant/engines/corporate-action-validation.js`: the evidence model.
- `quant/engines/canonical-price-validity.js`: validity intervals, as-of views and `pitHistory`.
- `scripts/quant/lib/daily-prices.mjs#fromBarsPartial`: the opt-in partial-series loader.
- `scripts/quant/corporate-action-v2/`: SEC collector and audit.
- `.github/workflows/quant-corporate-action-v2-audit.yml`: the audit workflow.
- Tests: `quant/tests/corporate-action-v2.test.mjs` (39 tests).

## 2. Model in brief

- **SEC stages.** ANNOUNCED → APPROVED → EFFECTIVE → OBSERVED_IN_PRICE.
  - Only an EFFECTIVE statement in a dated current report (8-K/6-K) can normalize a price series.
  - An approval (proxy, shareholder vote) is context and never becomes an effective event.
  - Retrospective statements in 10-Q/10-K only support; undated statements never normalize.
- **Evidence classes.** Every record carries sources, confidence, event date, ratio, identity basis and a provenance hash.

  | Class | Outcome |
  |---|---|
  | CONFIRMED_SPLIT, CONFIRMED_REVERSE_SPLIT | ACCEPT (provider factor matches SEC) or NORMALIZE (provider missing, SEC effective and the price concordant) |
  | PROBABLE_CORPORATE_ACTION | HOLD |
  | CONFLICTING_CORPORATE_ACTION | HOLD |
  | PRICE_DISCONTINUITY_NO_CA_EVIDENCE | HOLD |
  | UNKNOWN | no action |

- **Small ratios.** A ratio under 3:1 additionally needs share-volume direction or an SEC share count before it normalizes.
- **No silent price repair.** A suspicion from price alone always becomes `HOLD_FROM_EVENT_DATE`; nothing is back-calculated from the price.
- **Partial series.** Each series is described by these intervals:

  | Interval | Meaning |
  |---|---|
  | VALID | bars whose total return the core reconstructs |
  | INVALID_RANGE | a single bar without a valid price; the series continues |
  | HOLD | from here on not canonical, because a corporate action is likely but not independently proven |
  | QUARANTINE | from here on not canonical, because the data contradict each other |
  | TERMINAL | listing break, or end of the series (open or delisted) |

  Two more fields: `resumeFrom`, the day a later SEC filing resolves a hold, and `validUntil`. Details are in `PARTIAL_SERIES_HANDLING_V2.md`.
- **Downward jumps.** They are judged by event semantics, not return thresholds:
  - an SEC-confirmed forward split that the provider misses is normalized (test V11);
  - a downward jump with no evidence is held as a price discontinuity;
  - there is no global price cap.

## 3. Runs

| Run | Status | Note |
|---|---|---|
| 38885412883 | cancelled before any result | Protocol 1.0.0 withdrawn after review round 1 (F01/F02); 2.0.0 pre-registered |
| 38889245815 | completed, precondition failed | SEC document cap of 45,000 hit (15,862 filings unread) |
| 38915593595 | cancelled | Single-runner SEC step > 4.5 h; split into three parallel jobs |
| 38957800888 | completed | PIT check found F19 (HIGH): `observedAt` of SEC normalizations too early. Fixed as contract 2.1.0, timestamps only |
| **38976628673** | **completed (final)** | Identical detection rules. PIT clean. Every other count identical to the previous run (±1 from a new trading day in the store) |

Detection rules, thresholds and ratios have not changed since the protocol was pre-registered. Two timestamp fixes followed results, and neither changes a decision:

- **F19 (contract 2.1.0):** normalizations. Measured in the final run.
- **R2-01 (contract 2.2.0):** SEC-conflict holds. Found by review round 2 and not yet re-measured on real data.

The PIT failure behind F19 was already visible in run 38889245815 (6 mismatches in 525 views). The diagnostics that located it were added after that result (R2-08).

## 4. Results (final run 38976628673)

| Measure | Value | Threshold | Pass |
|---|---|---|---|
| SEC collection complete | 308 of 70,394 documents not loadable after retries (SEC throttling) | complete | no |
| Control false positives, pooled | 0 of 905 segments (Wilson 95 % ≤ 0.0053) | ≤ 0.02 | yes |
| Control false positives, per category | 0 in every category | ≤ 0.05 | yes |
| Hold precision | 0.981 (52 of 53 labelled, 109 unlabelled; worst case 0.32) | ≥ 0.8 | conditional (R2-03) |
| Normalize false share | 0.25 (7 of 28 labelled) | ≤ 0.05 | **no** |
| False negatives | 0.0298 (47 of 1,577; out of sample 11 of 592) | ≤ 0.05 | yes |
| PIT consistency | 600 views, 0 violations, 17 disclosed revisions | 0 violations | conditional (R2-02) |

Valid bars, compared with the earlier versions:

| Version | Valid bars |
|---|---|
| main 1.0.0 (whole series) | 14,590,465 |
| #721 1.2.0 (whole series) | 14,407,116 |
| V4 prefix | 14,591,303 |
| v2 without SEC | 14,610,809 |
| v2 | 14,597,306 |

States: 9,073 FULL_VALID, 315 VALID_PREFIX, 14 VALID_WITH_INVALID_BARS, 5 NO_VALID_BARS.

## 5. Answers to the 17 questions

1. **Which independent source was used?**
   - Main source: SEC EDGAR full-text search over current reports (8-K, 6-K). These are effective statements with ratio and trading date.
   - Supporting: 10-Q/10-K, read only for candidates, and SEC XBRL shares outstanding (corroboration and control labels).
   - Context only: proxies (DEF/PRE 14A/14C).
   - The price provider's split factor is not independent; it is the thing being checked.
2. **Its coverage?**
   - 7,352 of 9,407 segments have an issuer CIK. 2,254 segments have SEC corporate-action statements, 2,027 of them effective.
   - 4,277 merged events, 3,297 of them EFFECTIVE. These come from 45,763 filings and 70,394 documents.
   - In this audit, coverage effectively starts in late 2013, because the captured universe starts on 2015-01-02.
   - Not covered: issuers without a CIK link, non-reporting OTC issuers, and events before 2001.
3. **Is it PIT-capable?**
   - Yes. Every observation carries its own filing date, and an as-of view uses only filings strictly before asOf, field by field.
   - Since contract 2.1.0, `observedAt` is the first session whose as-of view actually contains a normalization.
4. **Which events can it confirm?**
   - Effective forward and reverse splits and share consolidations with ratio and date, and stock dividends of 25 % or more.
   - Announcements and approvals are recorded as stages but never confirm anything.
   - Not covered: cash dividends, exchange ratios of mergers or spin-offs (deliberately skipped), and events without a dated current report.
5. **How many previously unresolved reverse splits were independently confirmed?**
   - Of the 23 undeclared reverse splits among the 83 cases, 3 were normalized after SEC confirmation.
   - Across the universe, 40 events the provider missed were normalized. Of the 28 the control could label, 21 are confirmed and 7 contradicted (see 7).
   - Separately, 1,975 SEC-effective events match the provider's own factor.
6. **How many remain unresolved?**
   - Of the 23: 17 held (4 conflicting, 9 price-only, 4 probable) and 3 still in the valid range.
   - Across the universe:
     - 92 holds without corporate-action evidence;
     - 52 holds with conflicting SEC and provider evidence;
     - 272 day moves of 10x or more inside the valid range without evidence either way (123 up, 149 down).
7. **How many false positives?**
   - Control set: 0 of 905 segments.
   - Holds: 1 of 53 labelled. Price-only holds are excluded from the control set, and 91 of the 92 are unlabelled, so their false-positive rate is unmeasured (R2-03, B10).
   - Normalizations: 7 of 28 labelled. This fails the threshold and is blocker B2.
8. **How many false negatives?**
   - 47 of 1,577 SEC share-count drops of 3:1 or more (0.0298). Out of sample: 11 of 592.
   - Another 56 were held rather than normalized, which counts as data loss, not as a miss.
   - Caveat (R2-04): drops without any price move count as handled, which flatters the rate. Downward jumps (undeclared forward splits) have no false-negative measure.
9. **Does partial-series handling work?**
   - Yes. 306 of the 311 histories that #721 rejects as a whole are kept as a valid prefix, which is 221,428 bars.
   - All 169 histories rejected by main are kept (119,662 bars).
   - Tests V8, C1–C4 and R8; PIT tests V9, V10, V14, R-F10, R-F19 and R-F19b.
10. **Which consumers were adapted?**
    - Only the loader, as an opt-in: `scripts/quant/lib/daily-prices.mjs#fromBarsPartial` (new, tests C1–C4). `fromBars` is unchanged.
    - The backtests, survivorship control, setup outcomes, the Supertrader V4 research, the benchmark and the ETF ingest are unchanged.
    - Their adoption changes model outputs (review F07, F08, F15), so it needs product-owned PRs with before/after. Supertrader adoption falls under Gate A.
    - Discover, Screener, Technical, Watchlists and the scans do not read the core.
11. **Is there lookahead?**
    - **Bars and evidence:** none. In 600 as-of views of the final run, no bar, hold or evidence lies after asOf, and no return differs outside the 17 disclosed revisions.
    - **Timestamps:** two lookaheads were found, both fixed in code:
      - F19: normalization `observedAt` too early (fixed in 2.1.0 and measured).
      - R2-01: SEC-conflict hold `observedAt` too early by at least one session (fixed in 2.2.0, not yet re-measured).
    - The PIT acceptance check is largely self-referential after F19 (R2-02). So the honest answer is: no lookahead known in 2.2.0, but not yet proven independently (B8, B9).
    - A backtest must use the as-of view.
12. **Are downward jumps covered?**
    - The event semantics are implemented: SEC-confirmed forward splits the provider misses are normalized (test V11), and an unexplained downward jump with a split signature is held.
    - Coverage is not measured: there is no downward false-negative measure (R2-04, B11), and 149 downward moves of 10x or more inside the valid range have no evidence either way (B3).
13. **How many historical bars are newly usable?**
    - +190,190 valid bars versus #721 (1.2.0 whole series), and 306 histories retained.
    - Versus main (1.0.0) it is a net +6,841: 112,772 bars are newly held, while partial series win back more than that.
14. **Are the 11 D2 defects still in the valid range?** Yes, all 11 (9 undeclared jumps in the history, 2 inconsistent declared splits). R5 therefore says NOT_READY.
15. **Do the 61 legitimate cases stay accepted?** No. 56 do; 5 are newly held by price evidence.
16. **Which HIGH/CRITICAL findings remain?**
    - Rounds 1 and 1b are closed (F01–F19).
    - From round 2, these HIGH findings are open:
      - R2-01: hold timestamps; fixed in code, not re-measured.
      - R2-02: the PIT check is self-referential.
      - R2-03: price-only hold false positives are unmeasured.
    - They are blockers B8–B10. None is CRITICAL.
17. **Is the core ready for calibration?** No: `NOT_READY`. Blockers:
    - B1: R5 (the 11 D2 defects are in the valid range).
    - B2: normalization precision.
    - B3: unresolved 10x moves.
    - B4: legitimate histories held.
    - B5: SEC completeness and extractor recall (523 of 2,732 provider splits not found).
    - B6: no distress control.
    - B7: no consumer adopted.
    - B8–B10: open HIGH review findings.
    - B11: no downward false-negative measure.

## 6. What would change the verdict

None of these may be fitted on the known 83/74:
- an independent source for the D2-type undeclared jumps (exchange or FINRA corporate-action notices, which are not integrated for licensing reasons, or a second price vendor);
- a stricter normalization rule, derived from SEC semantics and re-measured on new data only;
- a pre-registered protocol 3.0.0 with an independent PIT timing check, hold labels that exclude the triggering observation, and a downward false-negative population;
- product-owned adoption PRs with before/after.
