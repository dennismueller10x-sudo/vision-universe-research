# Red-Team Review: Elliott engine 3.2.0 (candidate)

Reviewer: independent red team. I did not write the engine. I changed no engine, test or generator file and committed nothing.
Data used: corpus seeds 0–19 only (DEVELOPMENT 0–9, VALIDATION 10–19) plus synthetic fuzz series. I ran nothing on seeds 40–49 or 60–79.
State reviewed: HEAD `b93feca39`. While this review was running, the working tree also had uncommitted edits to
`quant/tests/elliott-corpus-c2.mjs` (mtime 09:52, see H4) and an untracked `scripts/technical/elliott-holdout3.mjs`.
All C2 numbers below were produced with the HEAD version of C2 (the rows were written at 09:50).

## How the numbers were produced

* `dump.mjs SPLIT LAYOUT` (scratchpad harness) is a copy of `evaluateCase` from `scripts/technical/elliott-corpus-eval.mjs`
  that also records `ambiguity.kind`, `applicability.score/level`, nested-hit details and the observable-truth judgement.
  It ran on DEVELOPMENT and VALIDATION for layouts A, B, C1, C2, C3 (default engine, all classes, all noise levels and
  stages). That is about 23,000 cases.
* `scanM.mjs`: an independent check that a wave whose expected subdivision is motive (`spec.subdivision[k] === "M"`) never
  trades beyond its own start (see H1).
* `fuzz.mjs`: 320 random series of 8 kinds: random walk, trend, gaps/jumps, constant, prices around 1e-6, prices around 1e9,
  sawtooth with ties, integer ticks. Each series gets a strict hard-rule check on the primary, alternatives, higher degree
  and subdivisions. 160 of them also get a causality check: `asOfIndex = t` on the full series compared with the series cut at `t`.
* The unit tests `node --test quant/tests/ti-elliott-v3.test.mjs` pass (11/11).

The core checks are reproduced inline below, so the results can be rebuilt without the scratchpad.

---

## HIGH

### H1. Hard-rule leak: motive sub-waves of corrections trade beyond their own start. The G8/G1 checker cannot see it.

**Defect.** In ZIGZAG (A, C), FLAT (C) and DOUBLE_ZIGZAG (W·a, W·c, Y·a, Y·c) the waves at positions with subdivision "M" are
emitted even when the price inside the wave moves beyond the wave's start. A 5-wave motive wave cannot do that: its
own wave 2 would retrace more than 100 %, and the preceding wave would not end at its extreme.

**Mechanism.**
1. `succ()` (`elliott-v3.js:261`) admits an "orthodox overshoot" `over > 0` for **every** leg.
2. `score()` (`elliott-v3.js:454`) checks the overshooting leg for a FLAT or TRIANGLE subdivision only if
   `lg.status !== "DEVELOPING"`. **Developing legs are exempt.** A confirmed leg at an "M" position is also accepted if
   it subdivides as FLAT or TRIANGLE, which contradicts its own expected 5-wave subdivision.
3. `intraOk()` (`elliott-v3.js:310`) checks the "back" extreme only for odd waves of motive patterns. Corrective patterns
   are not checked.
4. The evaluator's independent checker `intraViolations()` (`elliott-corpus-eval.mjs:76`) has the same blind spot. G8 (and
   G1 "hard-rule violations" in `elliott-holdout3.mjs`) therefore reports **0** even though the leak is frequent.

**Numbers.**

| Data | primaries with leak | all emitted counts with leak | evaluator G8 |
|---|---|---|---|
| Layout A, DEVELOPMENT (end + mid) | 131 / 1400 (9.4 %) | 408 / 4200 | 0 |
| Layout C1, DEVELOPMENT (P75 + C_LATE) | 110 / 1376 (8.0 %) | 287 / 4128 | 0 |
| Fuzz (320 series) | many | many | – |

* None of the leaking primaries in the corpus was rated HIGH or MODERATE. Product impact is therefore mostly on
  alternatives and abstained counts, but the gate is blind.
* The fuzz found the same leak in all series kinds, including confirmed ZIGZAG and FLAT counts.
* A related, softer leak: developing legs at "K" positions overshoot their start without the FLAT/TRIANGLE subdivision check
  (285 counts in A DEVELOPMENT).

**Reproduction** (layout A, `IMPULSE|none|0`, primary):

```js
const cs = corpusCase("IMPULSE", 0, "none", { layout: "A" });   // analyze as in evaluateCase, default engine
// primary: FLAT DOWN, developing C
// A 118→144 (164.12→154.10), B 144→151 (154.10→167.948), C 151→193 DEVELOPING (→151.47)
// max(close[151..193]) = 169.428 @ bar 157  > start of C (167.948): C rises above its start, so B really ends at 157
```

**Check used** (independent of the engine):

```js
W.forEach((w,k)=>{ const wd = k%2===0 ? s : -s; let e = c[w.fromIndex];
  for (let i=w.fromIndex;i<=w.toIndex;i++) e = wd>0 ? Math.min(e,c[i]) : Math.max(e,c[i]);
  if (spec.subdivision[k]==="M" && wd*e < wd*c[w.fromIndex]) violation(); });
```

**Fix (one line):** in `intraOk`, apply the back-extreme check to every leg with `spec.subdivision[k]==="M"`, including
developing legs. In `score()`, drop the DEVELOPING exemption at line 454. Add the same check to `intraViolations`.

### H2. "Observable truth" silently drops two classes, and its gain comes from changing the denominator

**Bug.** `observableTruth()` (`elliott-corpus-eval.mjs:99`) calls `PAT.checkRules(t, waves)` on legs **without `.sub`**.
The rules `WXY_W_IS_THREE`, `WXY_Y_IS_THREE` and `TZ_*_IS_THREE` therefore always fail. Result: **WXY and TRIPLE_ZIGZAG
are 0/80 observable-valid in every layout (A, C1, C2) and at every noise level, including `none`.** They are removed from
gateObservable and from HOLDOUT-3 gates G2–G5 and G9, and the min-class criterion never sees them.

DOUBLE_ZIGZAG (3 truth legs W-X-Y) is validated against the 7-leg DOUBLE_ZIGZAG rules with only 3 legs. In practice that
only checks X < 90 % of W.

Reproduce with a loop over `observableTruth(caseC(...,"C_LATE"))` / `corpusCase` for seeds 0–19.

**Selection effect.** On the valid subset, the observable hit rate is almost the same as the strict hit rate (for example C1
DEVELOPMENT 29.2 % vs 29.2 %, C3 VALIDATION 25.2 % vs 25.5 %). Moving the truth points therefore adds almost nothing. The whole
increase comes from dropping cases, and the dropped cases are the hard ones: the strict hit rate on the excluded cases is
only 7–22 %.

Strict G1 compared with observable G1, completed cases, noise none/low/medium:

| Layout / split | strict G1 (n) | observable G1 (n) | strict without WXY+TRIPLE |
|---|---|---|---|
| C1 DEVELOPMENT | 19.9 % (960) | 29.2 % (542) | 19.0 % |
| C1 VALIDATION | 18.4 % | 25.6 % (558) | 17.4 % |
| C2 DEVELOPMENT | 38.5 % | 47.7 % (658) | 37.4 % |
| C2 VALIDATION | 44.7 % | 55.3 % (646) | 42.9 % |
| C3 VALIDATION | 19.5 % | 25.2 % (584) | 18.9 % |
| B VALIDATION | 48.5 % (480) | 54.2 % (389) | 47.1 % |

High noise (G9): observable keeps only 20–30 % of the C cases. The metric roughly doubles (C3 VALIDATION 3.1 % → 8.1 %,
C2 VALIDATION 3.8 % → 8.3 %, B DEVELOPMENT 10.0 % → 19.2 %).

**Counter-argument.** Removing cases where the pattern has visibly been destroyed is legitimate in principle.

**Why it is still a problem.** The validity filter uses the engine's own rule module (`PAT.checkRules`) and the same
intra-wave interpretation. Every case the engine's rule interpretation cannot represent is therefore removed by
construction (circular). The filter also has the bug above.

**Fix:** pass the generator's subdivision (`subIdx`) for combination truths, or validate only HARD rules. Pre-register the
**strict** gate as primary and the observable gate as secondary, and always report both denominators.

### H3. Developing counts: every MODERATE or HIGH rating is wrong

Across all layouts and both splits, **no correct developing primary was ever rated above LOW**:

* About 1,300 developing hits; all of them are LOW.
* Every developing (mid / P-stage) case rated MODERATE or HIGH is wrong:
  * C1+C2+C3 pooled: DEVELOPMENT 48/48, VALIDATION 55/55.
  * A/B: 3–5 per split, all wrong.

Almost all of these are **complete** primaries: the engine reports a finished lower-degree sub-structure inside the running
pattern (for example C1 VALIDATION, 23 of 24 HM cases). The applicability features look good for such sub-structures:
`complete`, quality, proportion.

Consequences:
* D2 in `elliott-holdout3.mjs` (when nHigh < 20, HIGH+MODERATE false ≤ 50 %) is predictably **failed**.
* In the product, a wrong-degree count is shown with MODERATE or HIGH confidence.

**Fix:** if a complete primary ends inside a rule-valid developing candidate of higher degree that has a comparable rank,
cap it at LOW. Alternatively, calibrate and gate the developing stages separately.

### H4. C2 (the "independent" generator) conditions its noise on the truth

* **HEAD:** at noise `low`, C2 redraws its noise up to 80 times until `originOk()` holds, i.e. until the noisy truth origin
  is the strict extreme over ±W1 duration (`caseC2`).
* **Uncommitted working-tree change:** `tries = noise === "none" ? 1 : 200` with the same `originOk` acceptance at **all**
  noise levels. In addition, `structOk` requires every top-level wave end to be the strict extreme of its wave, so there
  are no orthodox tops.

This is the engine's anchor and extremal-segment prior: weights `anchor 0.45`, `dominance 0.45`, plus extremal-successor
search. The rejection sampling feeds that prior into the test data and inflates C2 hit rates and the observable-valid share.

The working-tree change is also an unfrozen generator change made after DEVELOPMENT/VALIDATION evaluation and before HOLDOUT-3.

**Fix:** remove the truth-conditioned rejection sampling, or report C2 as "origin-visible subset". Freeze the generator
(commit and hash it in the prereg) before seeds 60–79 are opened.

---

## MEDIUM

### M1. The HIGH threshold does not transfer from DEVELOPMENT to VALIDATION

The engine uses `high: 0.75, moderate: 0.6`. These values are set by hand. The fit script's rule (false ≤ 15 % / ≤ 40 %)
does not produce them, and the comment cites "≈ 20 %".

On C1+C2+C3 pooled, completed cases:

| | DEVELOPMENT | VALIDATION |
|---|---|---|
| HIGH, false | 1/17 = 5.9 % | 9/44 = 20.5 % |
| C1 HIGH | 0 cases | 5/15 false = 33 % |
| C3 HIGH | 1 case | 4/14 false = 29 % |
| HIGH+MODERATE, false | 12.4 % | 20.5 % |

Sweeping the VALIDATION threshold from 0.6 to 0.75 gives about 20 % false at every point. The ranking quality itself is
stable (AUC 0.844 on DEVELOPMENT, 0.843 on VALIDATION), so the threshold sits where the false-HIGH rate is unstable. G10
(≤ 20 %) is already borderline on VALIDATION. A/B is fine (VALIDATION 1/34 false at ≥ 0.75).

**Fix:** choose thresholds with seed cross-validation and a Wilson upper bound, and pre-register them.

### M2. Applicability model 3.2: imputed clarity and the sign of the STRUCTURE coefficient

There is no label leak: none of the features encodes the truth. Two problems remain:

* For ambiguity kinds NONE, LABEL and DEGREE, clarity is set to 1.0, the maximum (`elliott-v3.js:715`).
* The "structure ambiguity" coefficient is **+0.911**.

Together these mean that a count with a competing alternative that has a different structure scores **higher** than a count
with no alternative at all. HIGH was issued only for `amb = STRUCTURE`: 51/51 on DEVELOPMENT and 78/78 on VALIDATION.

This looks like an artefact of the generators rather than a real effect. It may not transfer to HOLDOUT-3 or to real charts.

**Fix:** compute clarity from the rank gap to the best other candidate for every kind, and constrain that coefficient to ≤ 0.

### M3. DEGREE and LABEL ambiguity are reported as clear

`clarityLevel` is forced to HIGH and status to OK whenever `amb.kind !== "STRUCTURE"` (`elliott-v3.js:630`).

Completed cases, all layouts:

| Ambiguity kind | primary correct (DEVELOPMENT / VALIDATION) |
|---|---|
| DEGREE | 35/292 = 12 % / 39/285 = 14 % (the worst group) |
| LABEL | 32 % / 42 % |
| STRUCTURE | 27 % / 26 % |

Applicability stays LOW in practice (291 of 292), so the gate is not affected. The `status`, `clarityLevel` and real-chart
"structural relabel" statistics (G11/G12) are.

**Fix:** derive `clarityLevel` from the rank gap for all kinds, and report DEGREE as its own status.

### M4. Generator coupling (C1/C3 and C2)

* The C1 skeleton is rejected unless the origin is the extreme over the W1 duration (`elliott-corpus-c.mjs:126`). C2 does
  the same (`structOk`, and `originOk`, see H4). This matches the engine's anchor and dominance prior.
* Noise is mean-reverting around the skeleton: C1/C3 use OU with θ = 0.2 (`elliott-corpus-c.mjs:148,198`). C2 uses an
  AR(1) deviation anchored to the skeleton inside the pattern window. Pivots therefore cannot drift away the way they do in
  real markets.
* The confirmation move is always ≥ 0.4 × net (A/B/C1), against the engine's `tail` band of 0.382 × last wave.
* C1/C3 reuse `impulse()`, `zigzag()`, `SUBSHAPE` and `build()` from layout A/B. Only C2 is a separate code base.

**Fix:** for HOLDOUT-3, add a secondary layout with non-reverting noise, unguaranteed origins and orthodox tops.

### M5. Some truth labels are invalid under the engine's own rules even without noise

* Layout A: 6/280 cases are invalid at noise `none`. Examples: IMPULSE_EXT1/EXT5 where a wave-4 sub-wave reaches into W1,
  and ZIGZAG where a B sub-wave goes beyond A's origin.
* Layout C1: 4/280 cases are invalid.

Both generators enforce rules only at the top level, so these are positives the engine cannot hit. At HEAD, C2 FLAT_REGULAR
draws B in 0.86–0.98 while the engine's FLAT needs B ≥ 0.90: 6 of 20 invalid at `none`. The working-tree change to 0.90–1.05
addresses this, but it is uncommitted (see H4).

**Fix:** validate generated truths with the intra-wave checker and redraw any that fail.

### M6. Parameter and design leakage from consumed or validation data

* The 3.2 design draws on the HOLDOUT-2 failure taxonomy:
  `quant/data/.../failure-taxonomy-holdout2-layoutB-3.1.0.json`, and comments "HOLDOUT-2: 65 %" and "59 % … Bestätigungsbewegung".
* The hierarchy weight was set to 0 based on VALIDATION ("VALIDATION: Gewicht 0").

I found no numeric parameter fitted on HOLDOUT data. Still, HOLDOUT-2 cannot be cited as evidence for 3.2, and the
VALIDATION numbers are not unbiased.

The C3 HOLDOUT-3 noise pool uses the same issuer partition (ew3 hash 7–9) as the real-chart HOLDOUT runs that were already
evaluated. The HOLDOUT-3 real phase reuses those issuers, only with a new window.

**Fix:** state this in the prereg, and draw the C3 holdout noise from issuers that have never been evaluated.

---

## LOW

* **L1. The nested hit does not check internal points** (`elliott-corpus-eval.mjs:70`). Of 33 nested-only hits across all
  layouts and splits, 15 have subdivision points that do not match the truth. Small, under 1 % of cases.
  Fix: require the subdivision points to lie within the tolerance.
* **L2. Prices are rounded to 4 decimals** in output (`round(v,4)` in `buildCount` and `decorate`). For instruments around
  1e-6, wave prices and **invalidation prices become 0** (fuzz, kind `tiny`). The evaluator checker also uses rounded prices
  and a tolerance of 1e-4·|p0|, which is loose for large prices.
  Fix: round to significant digits, and have the checker use `closes[index]`.
* **L3. Dead code and a wrong comment.** `noiseSigma` is causal (uses bars ≤ asOf), but `subNoise = 0` and
  `subShrink = null` mean `_sigma` is never used. Its comment says it is "relative to the price", while the code works in
  absolute price units. Fix: remove the code or correct the comment.
* **L4. The HOLDOUT-3 prereg is not in the repo.** `docs/technical-intelligence/ELLIOTT_HOLDOUT3_PREREG.md` is referenced by
  the untracked `scripts/technical/elliott-holdout3.mjs`. The gate code and the C2 changes are uncommitted.
  Fix: commit the prereg, gate script and generators with hashes before the run.

## Checked with no defect found

* **Causality.** 140 truncation comparisons, `asOfIndex = t` on the full series vs the series cut at `t`, compared on primary
  pattern and waves, alternatives, applicability score, scale and ATR: **0 differences**. `noiseSigma`, `buildPool`, `sufMax`
  and `dataQuality` only use bars ≤ asOf.
* **Endpoint hard rules and the existing intraOk rules.** No violation by any primary, alternative or higher-degree count in
  320 fuzz series and about 23k corpus cases. Subdivision points are clean.
* **Robustness.** Constant series, integer and tied prices, gaps, and prices around 1e-6 and 1e9 produced no crashes and no
  NaN.
