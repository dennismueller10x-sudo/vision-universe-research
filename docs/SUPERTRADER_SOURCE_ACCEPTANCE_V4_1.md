# Supertrader V4.1 – Source acceptance on repo-verified evidence (post-hoc)

Branch `research/supertrader-source-acceptance-v4-1` (Draft, stacked on #705). Research only: no live migration,
no merge, no backtest, no performance run, no parameter search.

| Input | Role | Status in V4.1 |
|---|---|---|
| Draft PR #709 @ `8b766fa4947cb2b564ede7cd850c6a995f57aada` (Primary Source Reconstruction) | authoritative source-fidelity evidence | read and hash-verified; not re-researched |
| Draft PR #705 @ `547d604` (V4 measurement / calibration) | measurement basis | unchanged historical evidence; NOT_CERTIFIED stays in force |

Artifacts: `scripts/supertrader/research/v4/v4-1/`. Code: `scripts/supertrader/research/v4/acceptance/*-v4-1.mjs`,
`psr709-extract.mjs` and `scripts/supertrader/research/v4/methods/*-v4-1.mjs`. Tests: `scripts/supertrader/tests/v41-*.test.mjs`.

## 1. How #709 was verified

- `psr709-extract.mjs` reads the 21 #709 files from a checkout of the pinned commit. It recomputes the SHA-256 and byte
  size of all 20 artifacts listed in `SUPERTRADER-ARTIFACT-MANIFEST.json`: 20/20 match and 0 differ.
- The manifest counts are unchanged: 785 rules, 287 cases, 52 conflicts, 4,232 pages and 13 candidates.
- The #709 final review is `PASS_WITH_EXPLICIT_SOURCE_GAPS` with 0 open HIGH and 0 open CRITICAL findings.
- Supertrader Gate A forbids copying the #709 documents into this PR. Instead the script writes a verbatim, machine-readable extract to `v4-1/PSR709-EVIDENCE-EXTRACT.json`. The extract contains:
  - 331 rules of the mapped method contexts, 193 cases and 23 conflicts;
  - the VU gaps and the source gaps;
  - the pin, with every file hash.
- The test `extract regenerates byte-identically` rebuilds the extract from the #709 files when `PSR709_DIR` is set. It passes locally.
- The owner-attested `OSR-*` findings from #705 are no longer used as source evidence. A test checks this.
  `SUPERTRADER-V4-SOURCE-ACCEPTANCE.json` from #705 stays unchanged as history.

## 2. Source acceptance rule (declared post-hoc; it classifies and tunes nothing)

The evidence for each method is the `evidence_rule_ids` of its #709 candidate (C01–C13).

- **SOURCE_ACCEPTED** when every evidence rule meets all of these:
  - modal strength HARD;
  - confidence HIGH;
  - original wording checked;
  - hard-coding clearance `SCOPE_AND_EXCEPTIONS_REQUIRED`.
- **SOURCE_PARTIAL** when either of these holds:
  - An evidence rule is not yet hardenable. That means it needs original or explicit web corroboration, has LOW confidence or UNKNOWN strength, or is HARD with unchecked wording.
  - #709 states that a core component is not disclosed.
- **SOURCE_BLOCKED** when there is no #709 candidate and #709 records a missing original source.
- **SOURCE_MANUAL_REQUIRED** otherwise: the rules are verifiable, but the central components are `DO_NOT_HARDEN_PREFERENCE`.
- **Manual layer** is required when the verdict is not ACCEPTED, or when #709 marks the context `not_fully_reproducible`.

Every #709 sentence that a decision relies on is a verbatim part of the candidate assessment. The tests check this.

## 3. Final matrix

| Method | #709 | Source | Data | Measurement | Eligibility | #705 → V4.1 | Golden cases |
|---|---|---|---|---|---|---|---|
| Turtle System 1 | C01 | SOURCE_ACCEPTED | DATA_PARTIAL | MEASUREMENT_BLOCKED | RESEARCH_ONLY | RESEARCH_ONLY → RESEARCH_ONLY | executable (TG + 5 #709 examples) |
| Turtle System 2 | C02 | SOURCE_ACCEPTED | DATA_PARTIAL | MEASUREMENT_BLOCKED | RESEARCH_ONLY | RESEARCH_ONLY → RESEARCH_ONLY | executable |
| Darvas later Q&A box | C03 | SOURCE_ACCEPTED (box component) | DATA_PARTIAL | MEASUREMENT_BLOCKED | MANUAL_LAYER_REQUIRED | **RESEARCH_ONLY → MANUAL_LAYER_REQUIRED** | executable (DG-01..10) + 103 #709 cases |
| Weinstein Stage 2 investor | C04 | SOURCE_MANUAL_REQUIRED | DATA_PARTIAL | MEASUREMENT_BLOCKED | MANUAL_LAYER_REQUIRED | unchanged | catalogue (25) |
| Weinstein Stage 2 trader | C05 | SOURCE_MANUAL_REQUIRED | DATA_PARTIAL | MEASUREMENT_BLOCKED | MANUAL_LAYER_REQUIRED | unchanged | catalogue (25) |
| Minervini SEPA/VCP | C06 | SOURCE_MANUAL_REQUIRED | DATA_PARTIAL | MEASUREMENT_BLOCKED | MANUAL_LAYER_REQUIRED | unchanged | catalogue (25) |
| Minervini Power Play | C07 | SOURCE_PARTIAL | DATA_PARTIAL | MEASUREMENT_BLOCKED | RESEARCH_ONLY | **MANUAL_LAYER_REQUIRED → RESEARCH_ONLY** | catalogue (19) |
| Kullamägi Breakout (daily variant) | C08 | SOURCE_MANUAL_REQUIRED | DATA_PARTIAL | MEASUREMENT_BLOCKED | MANUAL_LAYER_REQUIRED | unchanged | catalogue (10) |
| Kullamägi Episodic Pivot | C09 | SOURCE_MANUAL_REQUIRED | DATA_BLOCKED | MEASUREMENT_BLOCKED | DATA_BLOCKED | unchanged | catalogue (11) |
| Kullamägi Parabolic Short | C10 | SOURCE_MANUAL_REQUIRED | DATA_BLOCKED | MEASUREMENT_BLOCKED | DATA_BLOCKED | unchanged | catalogue (11) |
| Morales/Kacher Pocket Pivot | C11 | SOURCE_MANUAL_REQUIRED | DATA_PARTIAL | MEASUREMENT_BLOCKED | MANUAL_LAYER_REQUIRED | **RESEARCH_ONLY → MANUAL_LAYER_REQUIRED** | executable (PPG-01..06) + 11 |
| Morales/Kacher Buyable Gap-Up | C12 | SOURCE_MANUAL_REQUIRED | DATA_PARTIAL | MEASUREMENT_BLOCKED | MANUAL_LAYER_REQUIRED | **RESEARCH_ONLY → MANUAL_LAYER_REQUIRED** | executable (BGG-01..05) + 12 |
| Raschke Holy Grail | C13 | SOURCE_PARTIAL | DATA_BLOCKED | MEASUREMENT_BLOCKED | RESEARCH_ONLY | unchanged (reason now #709) | catalogue (4) |
| O'Neil CAN SLIM | – | SOURCE_BLOCKED (GAP-B04) | DATA_BLOCKED | MEASUREMENT_BLOCKED | RESEARCH_ONLY | unchanged | catalogue (9) |

Reasons for the changes:

- **Darvas.**
  - DAR-Q1..Q9 are HARD, HIGH and checked on B06 printed pp. 182–197. The box state machine and its stops can therefore be hard-coded.
  - C03 says "techno-fundamental selection and sizing remain discretionary", so the method gets a manual layer.
  - #705 had no verifiable source.
- **Pocket Pivot.**
  - MOKAPP-003 is HARD and HIGH: volume above the largest down-day volume of the prior 10 days.
  - C11 says "constructive chart context and exits retain discretion".
- **BGU.**
  - MOKA12-004 (gap ≥ 0.75 × ATR40) and MOKA24-VOL (1.5×) are HARD and HIGH.
  - The megacap exception MOKA24-MEGA is contextual.
- **Power Play.** MIN-PP-02/04/05 are numeric HARD rules with MEDIUM confidence and unchecked wording, and their clearance is `REQUIRES_ORIGINAL_OR_EXPLICIT_WEB_CORROBORATION`. No screen may harden them until that is done, so this is a downgrade.
- **Kullamägi Breakout.**
  - The verdict changes from SOURCE_ACCEPTED (#705) to SOURCE_MANUAL_REQUIRED. Setup quality, entry and exit are preferences or optional in #709. Only KK-012 (low-of-day stop with distance ≤ ADR: reject a wide stop, never replace it) is HARD.
  - The daily alternative is allowed (KK-011), so the scope no longer needs intraday execution. The ORH replica stays DATA_BLOCKED.
- **EP and Parabolic Short.** The verdict changes from SOURCE_ACCEPTED to SOURCE_MANUAL_REQUIRED. Eligibility stays DATA_BLOCKED (intraday history, catalysts, borrow and short interest).
- **Holy Grail.** It stays RESEARCH_ONLY. The reason is now #709 C13: "exact stop/order sequence not fully disclosed" (plus intraday DATA_BLOCKED).
- **Data.** Price and volume are `DATA_PARTIAL` while V4-D1 (BLOCKER, undeclared reverse splits) is open; they become DATA_ACCEPTED once it is fixed. #709 also lists their availability as PARTIAL. Darvas additionally needs listing-to-date history for the all-time high (DAR-Q9), which stays DATA_PARTIAL.
- **Measurement.**
  - The #705 result `NOT_CERTIFIED` is applied unchanged, so every method is `MEASUREMENT_BLOCKED`.
  - Tolerances, quarantine rules and calibration inputs are unchanged. A test compares the freeze tolerances and the hashes of all frozen V4 files.
  - `WEEKLY_AGGREGATION` now counts as having no measurement path. #705 had recorded it with the text "not built in V4".

## 4. Measurable immediately after the reverse-split fix

Prerequisites:

1. V4-D1 is fixed in a Quant PR to the canonical core.
2. A new capture is taken.
3. The calibration is re-run with the unchanged tolerances.
4. That run certifies at least the EW_MARKET slice. V4-D2 (MAJOR) can still prevent this.

| Method | Class | Additionally required |
|---|---|---|
| Turtle S1, Turtle S2 | FULL_METHOD_AFTER_ENGINE_FINDINGS | V41-F1: per-unit stops in the engine (code only, its own PR with a before/after comparison) |
| Darvas box | MACHINE_SCREEN_COMPONENT_ONLY | signal-level measurement only; the full method needs manual decisions, which are only ever logged going forward |
| Pocket Pivot detector | MACHINE_SCREEN_COMPONENT_ONLY | same |
| BGU detector | MACHINE_SCREEN_COMPONENT_ONLY | same |

Methods that are not measurable even then:

- Weinstein ×2: no weekly aggregation and no built screen.
- SEPA and KK Breakout: no built screen.
- Power Play and Holy Grail: SOURCE_PARTIAL.
- EP, Parabolic Short and CAN SLIM: DATA_BLOCKED.

## 5. Findings from the source-to-code tracing

- **V41-F1 (MAJOR, OPEN, blocks every Turtle performance run).**
  - The frozen V4 engine (T4-STOP) moves all unit stops to 2N below the newest fill.
  - #709 TUR-STOPADD / TUR-STOPGAP and the worked example TUR-CRUDE require something else:
    - earlier units are raised by ½ N per add;
    - a gapped add therefore leaves the units with different stops.
  - Example: fills 28.30 / 28.90 / 29.50 / 30.80 with N = 1.20. The source gives stops 27.70, 27.70, 27.70 and 28.40. The frozen engine gives 28.40 for all four units.
  - The test `TS-V41-F1` reproduces this with the real engine.
  - The engine is not changed here, because it belongs to freeze `V4-beae51ae1b07768b` and a strategy change needs its own PR. `methods/turtle-unit-stops-v4-1.mjs` is the reference implementation.
- **V41-F2 (MINOR, declared).** Fractional shares replace `floor` whole contracts (TUR-UNIT). Golden case TUR-HO2002 gives 16 contracts, the same quantity before rounding.
- **Turtle traceability.** All 23 T4 rules are traced to #709 ids. 11 #709 Turtle rules have no code, each with a reason:
  - correlation limits 6/10;
  - the Whipsaw variant;
  - the futures contract and roll rules;
  - execution judgments.

## 6. New components (machine screen only, never BUY)

| Component | #709 rules (hard-coded) | Interpretations / conventions (declared) |
|---|---|---|
| `darvas-box-v4-1.mjs` | DAR-Q1..Q9: top/bottom 3-day confirmation with touch reset; entry a fraction above the top; stop a fraction below the top, raised under higher boxes; all-time high | "fraction" = 1 raw cent (DAR-C-THIO: not the same for every trade, set by the reviewer); start of the bottom search (VU-DAR UNRESOLVED, both variants); top exceeded before the bottom → restart; box dissolved by a lower low |
| `pocket-pivot-v4-1.mjs` | MOKAPP-003 | down day = close below the previous close; candidate day = up day; no down day in the window → no candidate |
| `buyable-gap-up-v4-1.mjs` | MOKA12-004, MOKA24-VOL, MOKA24-MEGA (exception goes to review), MOKA12-007 (sell guide) | gap = open − previous close; ATR40 = simple mean over the prior 40 sessions; volume window 50 (**not in #709, source gap**); daily variant at the close |

- Every record has status `MANUAL_REVIEW_REQUIRED` and `buyDeclarationAllowed=false`.
- Context rules (`DO_NOT_HARDEN_PREFERENCE`) become evidence or open questions, never gates.
- The contract is in `v4-1/MANUAL-REVIEW-V4-1-CONTRACT.json`.

## 7. Not done (deliberately)

- No backtest and no performance run (#705 is NOT_CERTIFIED).
- No new quarantine rule and no tolerance change.
- No changes to #705 or #709 files.
- No re-research of the books.
- No fix of V4-D1 here (it belongs in its own Quant PR) and no Turtle engine change (V41-F1 needs its own PR).

## 8. Rebuild

```bash
node scripts/supertrader/research/v4/acceptance/psr709-extract.mjs --psr <dir with the #709 files @ 8b766fa>
node scripts/supertrader/research/v4/acceptance/build-acceptance-v4-1.mjs
node scripts/supertrader/research/v4/methods/build-method-artifacts-v4-1.mjs
PSR709_DIR=<dir> node --test scripts/supertrader/tests/v41-*.test.mjs
```
