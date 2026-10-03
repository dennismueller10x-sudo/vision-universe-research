# Elliott corpus generators: independent audit

Date: 2026-10-03. Scope: `quant/tests/elliott-corpus.mjs` (layouts A, B), `quant/tests/elliott-corpus-c.mjs` (C1, C3),
`quant/tests/elliott-corpus-c2.mjs` (C2), and the evaluator wrapper `caseC` / `observableTruth` in
`scripts/technical/elliott-corpus-eval.mjs`. No generator, engine or evaluator file was changed.

Seeds used: **0–19 only** (all 19 classes, so 380 cases per layout and noise level, 320 of them positive).
No sealed seeds (40–49, 60–79) were generated. The audit scripts were throwaway files in the session scratch directory.
They use an independent rule checker, written for this audit, that tests each truth pivot against the actual closes,
including the extremes inside each wave. They also call the evaluator's own `observableTruth` for comparison.
`node scripts/technical/elliott-noise-realism.mjs` was re-run and rewrote the untracked
`quant/data/technical-intelligence/elliott-validation/noise-realism.json`. That script uses seeds 0–9.

## 1. Headline numbers

### 1.1 Truth pivots versus actual closes (positive cases, n = 320 per cell)

"Hard rule" means an Elliott hard rule or a rule that defines the class:

- W2 beyond the origin.
- W3 the shortest.
- W4 overlapping W1, with the extreme inside W4 counted.
- W3 not beyond W1.
- Diagonal: no W4/W1 overlap, or W4 beyond the end of W2.
- Zigzag: B beyond the origin, or C not beyond A.
- Flat: B below 90 % of A, which is the repo rule `FLAT_B_AT_LEAST_90PCT`.
- Contracting triangle: a leg that goes beyond the start of the previous leg.

| noise  | A          | B          | C1             | C2             | C3             |
|--------|------------|------------|----------------|----------------|----------------|
| none   | 6 (1.9 %)  | 8 (2.5 %)  | 4 (1.3 %)      | 7 (2.2 %)      | 4 (1.3 %)      |
| low    | 14 (4.4 %) | 10 (3.1 %) | **78 (24.4 %)**| **41 (12.8 %)**| **72 (22.5 %)**|
| medium | 30 (9.4 %) | 22 (6.9 %) | 144 (45 %)     | 90 (28 %)      | 142 (44 %)     |

The table below shows how often the evaluator's `observableTruth` (engine `checkRules` plus `intraViolations` at the
visible extremes) is invalid. TRIPLE_ZIGZAG and WXY are excluded because they are always invalid; see M5.

| noise | A          | B          | C1              | C2             | C3              |
|-------|------------|------------|-----------------|----------------|-----------------|
| none  | 6/280      | 9/280      | 4/280           | 7/280          | 4/280           |
| low   | 15/280 (5 %) | 14/280 (5 %) | **108/280 (39 %)** | **58/280 (21 %)** | **89/280 (32 %)** |

The next table shows wider departures from a clean pattern at noise none: a truth pivot that is not the extreme of
its wave, an origin that is not an extreme, or any hard-rule violation.

| A          | B                                | C1         | C2                | C3         |
|------------|----------------------------------|------------|-------------------|------------|
| 94 (29 %)  | 197 (62 %; 149 are origin not extreme) | 110 (34 %) | 7 (only the flat B rule) | 110 (34 %) |

### 1.2 Negative cases that do not violate exactly the intended rule (n = 60, noise none)

| A  | B  | C1/C3 | C2 |
|----|----|-------|----|
| 19 | 21 | 24    | 0  |

### 1.3 Confirmation and cut statistics (noise none, then low)

| | A (end) | B (end) | C1 C_EARLY | C1 C_LATE | C2 C_EARLY | C2 C_LATE |
|---|---|---|---|---|---|---|
| Pattern end exceeded before the cut | 0 / 22 % | 0 / 7 % | 0.5 / 22 % | **6.3** / 30 % | 0 / 10 % | 0 / 11 % |
| Retrace of last wave < 38.2 % at the cut | 0 | 0.8 % | 18.7 % | 1.6 % | 11.1 % | 0 |
| Last bar is the extreme of the post-end move | **100 %** / 77 % | 38 % | 30 % | 38 % | **100 %** / 90 % | **100 %** / 88 % |

## 2. Findings

### HIGH

**H1. In A, B, C1 and C3, sub-waves are scaled to their net move, not to their extremes, so truth pivots are often
not wave extremes and some labels are wrong** (`build()` in `elliott-corpus.mjs`, reused by C1/C3).

- **What goes wrong:** a sub-pattern whose first leg overshoots its net move gets stretched by 1/net. This applies to
  contracting triangles (net 0.67–0.8, so the overshoot is 1.25–1.5 times), regular and expanded flats (B ≥ 1), and
  sub-impulses with a truncated fifth. The overshoot takes the extreme inside the wave past the wave's end or start.
- **How often:** at noise none, 29 % (A) and 34 % (C1/C3) of positive cases have at least one truth pivot that is not
  the extreme of its wave. The most affected are W2 and W4, the start and end of each.
- **Where it breaks a hard rule:** in about 2 % of cases.
  - IMPULSE_EXT1 and IMPULSE_EXT5 have W4 intra-wave overlap with W1 (A seeds 0, 4 and 1, 4; C1 seed 13).
  - ZIGZAG has B beyond the origin through a triangle or flat sub-wave (A seeds 12, 14; C1 seeds 7, 14, 15).
- **Consequences:**
  - The raw gate scores these as misses when the engine is right.
  - `observedPivots` silently moves the pivots.
  - G8 checks for intra-wave violations, so an engine that is right on these cases is penalised.
- **Fix:**
  - Scale the sub-shape so that its running extreme, not its net move, equals the parent leg.
  - Or reject or redraw any sub-shape whose intra extreme lies outside [start, end].
  - Add the C2-style `structOk` check: endpoints must be the extremes and hard rules must hold on the skeleton.

**H2. Negative cases often violate two rules** (A, B, C1, C3; C2 is clean).

- NEG_W2_BEYOND_ORIGIN also has W4 overlapping W1 in 15/20 cases (A) and 16/20 (C1). `negImpulse` raises w2 after
  `impulse()` has already sized w4 for the old w2.
- NEG_W3_SHORTEST also has a W4 overlap in 4/20 (A) and 7/20 (C1) cases (w4 = 0.3–0.5·w3 with w3 < 1).
- C1 NEG_W4_OVERLAP seed 10 ended up with no violation at all, because knot collisions scrambled the pivots; see L1.
- **Consequence:** rejecting these negatives is easier than intended, so G6 (false accept) is optimistic for
  A, B, C1 and C3.
- **Fix:** recompute w4 and w5 after the mutation and assert on the price path that exactly one rule fails, as C2 does.

**H3. C2 always cuts the confirmation stages on a fresh extreme** (`caseC2`).

- **What it does:** C_EARLY and C_LATE cut at the *first* bar where the skeleton's confirmation progress reaches q.
- **Effect:** the last bar is therefore always the running extreme of the confirmation move. That holds in 100 % of
  cases at noise none and about 90 % at low. C1 does this in 30–38 % of cases and B in 38 %.
- **Who benefits:** an engine that assumes "evaluation happens on a clean, extended confirmation". A always cuts at the
  end of the confirmation (100 %), which has the same bias.
- **Fix:** draw the cut time uniformly within [pe + a·(ce − pe), pe + b·(ce − pe)], as C1 does. Then also allow cuts
  during the counter-moves of the confirmation.

**H4. In C1 and C3 at noise low, about a quarter of truth labels no longer match the visible pattern.**

- **Cause:** the OU noise does not pin the pivots, unlike A's Brownian bridge.
  - Permanent jumps (3–6 times the target size, probability 1/260 per bar) can land inside the pattern. With a median
    pattern-plus-confirmation window of 74 bars, that happens in about 25 % of cases.
  - On average there are about 0.6 shock bars per window.
  - Nothing re-checks the rules after noise is added.
- **Effect:** at noise low (1 % noise sd, far below the 5.6 % of a typical stock), hard rules fail in 24 % of C1 cases
  and 22.5 % of C3 cases. The origin stops being an extreme in 17 %. The observable truth is invalid in 32–39 %.
- **Consequence:** the raw gate (`gate`) mixes engine errors with impossible labels. Only `gateObservable` corrects for
  this, and it relies on the engine's own rule checker, which is partly circular.
- **Fix:** report gates only on cases whose truth is still valid under an independent checker on the noisy closes. Or
  keep jumps and gaps out of the active wave in "low" and test them as a separate stress factor.

### MEDIUM

**M1. The noise is mean-reverting, not integrated** (C1, C3, and C2 inside the pattern window).

- **Variance ratio:** over 52 weeks, the noise component's variance ratio is 0.08–0.12 in C1/C3 and 0.10 in C2's
  window. Real stocks are at 0.56 (median of 268 real series, total returns).
- **Wander inside versus outside the window in C2:** inside the window C2 noise is AR(1) around the skeleton, outside it
  is a random walk. The noise level's sd inside the window is 0.0135 at low, against 0.031 on a stretch of the same
  length just before it, which is 2.2 times larger.
- **Consequences:**
  - Noise never builds persistent false trends or competing structures of the target's degree.
  - In C2, the pattern window is statistically quieter than its surroundings, which is a tell an engine could exploit.
  - C3 "real returns" lose their persistence, because they only drive an OU level.
- **Fix:** add the noise as an integrated process (a random walk with GARCH) and correct the skeleton only weakly, or
  embed the pattern multiplicatively into a real price path. Use the same noise process inside and outside the window.

**M2. Other noise statistics compared with real weekly stocks** (noise-only returns at medium; real stocks in brackets).

| Statistic | C1 | C3 | C2 | Real |
|---|---|---|---|---|
| Excess kurtosis | 6.2 | 2.2 | 4.7 | 2.84 |
| Lag-1 autocorrelation of returns | −0.11 | −0.13 | 0.01 | −0.03 |
| Lag-1 autocorrelation of absolute returns (clustering) | 0.19 | 0.16 | 0.13 | 0.086 |
| Jump share | 2.1 % | 1.4 % | 1.8 % | 1.3 % |

- C1/C3 are over-differenced (the OU noise) and over-clustered.
- The total-series statistics in `noise-realism.json` include the deterministic skeleton. That explains the autocorrelation
  of absolute returns of 0.7–0.9 at noise none, so they should not be read as noise realism.
- Swing density is about 28–30 per 100 weeks in C1/C3 at low to high, 22–25 in C2, and 26 in real stocks. That is
  realistic.
- The total sd at "high" is 4.2 % (A), 3.3 % (B), 5.8 % (C1) and 4.7 % (C2), against 5.6 % for real stocks. So only
  "high" matches a typical stock, while low and medium are cleaner than reality.
- **Fix:** compute and publish noise-only statistics. Treat medium or high as the realistic level, and label low as
  "idealised".

**M3. C2 regular flats break the repo's flat definition.** `FLAT_REGULAR` draws B from 0.86–0.98 of A, so 7 of 20
cases have B < 90 %. That fails the repo's `FLAT_B_AT_LEAST_90PCT` rule, which is a DEFINITION rule. Those cases are
labelled FLAT but are zigzags under the rule set. **Fix:** draw B from 0.90–1.0, or document a deliberate different
definition.

**M4. The noise level changes the pattern in A and B, and it changes how C2 is selected at low.**

- In A and B the RNG seed includes the noise level, so 760 of the 760 non-"none" cases have a different skeleton from
  the noise-none case. Noise-degradation curves in A and B therefore compare different patterns. C1, C2 and C3 keep the
  skeleton fixed, which was verified with 0 mismatches.
- C2 at noise low retries the noise up to 80 times until the origin is an extreme within ±d1. Medium and high are not
  retried. As a result the observed origin moves in 0 % of C2 low cases, against 14 % in C1, while the pattern end
  moves in 15 %.
- **Fix:** drop the noise from the skeleton seed in A and B. Drop C2's low-only retry, or apply it to every level and
  document it.

**M5. The evaluator's observable truth (`observableTruth`) has gaps.**

- TRIPLE_ZIGZAG and WXY are invalid in 100 % of cases, because the definition rules `*_IS_THREE` need subdivision data
  that the pivots alone do not carry. These classes are therefore silently missing from `gateObservable`.
- DOUBLE_ZIGZAG expects `DOUBLE_ZIGZAG`, a 7-wave pattern in the engine, while the truth has 3 legs (W-X-Y).
  `degreeClass` can never return EXACT for that label; only the WXY or NESTED paths work.
- **Fix:** skip the definition rules that need subdivision in `observableTruth`, and map DOUBLE_ZIGZAG truth to 7
  pivots, or compare only W-X-Y.

**M6. Truth at the running stages (P60/P75/P90)** (C1, C2, C3).

- **Coverage:** P60 drops 37 % of positive cases, namely all the 3-leg classes (ZIGZAG, DOUBLE_ZIGZAG, the three flats
  and WXY), because fewer than 2 waves are complete. So P60 only tests 5-leg patterns.
- **Unconfirmed "completed" waves:** at P75, the current wave has moved less than 23.6 % of the previous wave in 46 %
  (C1) and 37 % (C2) of cases. That wave is labelled complete, although price has barely confirmed it.
- **C2 truth fields:** C2's own `truth.completedWaves` counts T[k] ≤ cut. The evaluator recomputes it with
  T[k] < cut − 1, and the two disagree in 26, 22 and 12 cases (P60, P75, P90). `caseC` overrides `mid`, but
  `truth.completedWaves` and `currentWave` stay inconsistent.
- **Fix:**
  - Choose P cuts from the wave index, not the time fraction.
  - Require a minimum retracement before a wave counts as complete.
  - Set the C2 truth fields to the evaluator's convention.

**M7. C1 confirmation moves can take out the pattern end.**

- **Cause:** the motive confirmation is a FLAT in 30 % of cases, and the regular or expanded B of that flat goes beyond
  its start, which is the pattern end.
- **Effect:** at C_LATE and noise none, 6.3 % of the visible pattern ends are already exceeded before the cut.
- **Also:** C1 C_EARLY retraces less than 38.2 % in 19 % of cases, so the end is weakly confirmed.
- **Fix:** use only zigzags, or flats with b < 1, for the confirmation. Define C_EARLY by retracement rather than time.

### LOW

- **L1. Knot collisions.** Rounding with the "lastX + 1" shift, combined with nearest-x `map()`, can scramble pivots when
  the waves are short (C1 NEG_W4_OVERLAP seed 10: W2 runs the wrong way). This affected 1 in 380 per layout (A: 1 price
  mismatch; B: 1; C1: 1). **Fix:** keep the knot indices as they are built instead of looking them up again.
- **L2. Truncated fifths in plain classes.** In A, B and C1, the non-truncated IMPULSE classes occasionally have a
  truncated W5 (3 of 320 at noise none), and A has 1 regular flat with B > 105 %. These are guideline-level, not
  hard-rule, problems.
- **L3. A's 30-week lead-in** is a near-constant line at noise none, which is trivially structureless.
- **L4. Short C1 series.** C1 series are short (median 151 bars at C_LATE, against 247 in C2), which gives the engine
  less competing history.
- **L5. Shared skeletons in C1 and C3.** They are identical, so C3 is only a noise variant and not a second structural
  test.

## 3. Hidden easy assumptions (point 3)

| Assumption | A | B | C1/C3 | C2 |
|---|---|---|---|---|
| Origin is the extreme of the visible series (all classes, none / low) | 46 / 44 % | 28 / 29 % | 35 / 25 % | 42 / 38 % |
| Origin not an extreme over the duration of W1 (none) | 1 % | **47 %** (truth wrong) | 0 % (enforced on the skeleton) | 0 % (enforced) |
| Pattern end exactly at a generated pivot (observed end moved, low) | 22 % moved; pinned at none by the bridge | 9 % | 23 % | 15 % |
| Cut on the extreme of the confirmation | 100 % | 38 % | 30–38 % | **100 %** |
| Running stage cut on the extreme of the current wave | 24 % | 28 % | 35 % | 34 % |
| Target is the most recent structure (median bars from end to cut) | 25 | 17 | 10 / 21 | 7 / 24 |

The "origin is the most significant pivot" assumption is not systematically rewarded: the range before the origin is
larger than the pattern's net move in 37–65 % of cases at noise none. The remaining structural easing is shared by all
layouts:

- There is exactly one target, and it always ends within the last 7–25 bars.
- The confirmation is clean: motive patterns retrace 40–70 %, corrective patterns reach beyond the origin.
- There is only one level of subdivision.
- Drift regimes act only on the context (C1) or outside the window (C2). Nothing tilts the pattern itself.
- C2 gaps are excluded from the pattern window. C1 jumps are not, but no re-labelling follows.

## 4. Independence of C2 (point 6)

**Independent code.** C2 has its own PRNG (xmur3/sfc32), its own pattern proportions, sub-wave fractions, durations
and power-warped interpolation, a regime-switching log-drift background, and validation in price space (`structOk`)
with re-draws. C2 is the only generator whose skeletons are fully clean: no intra-wave overshoot, and negatives that
violate exactly one rule.

**Shared design.** C2 matches the C1 header almost point by point:

- the same 19 classes and `expect` lists, copied, including the DOUBLE_ZIGZAG issue in M5;
- the same "move into the origin of 0.55–1.5 × W1";
- the same confirmation conventions (motive 40–70 %; corrective beyond the origin);
- a competing structure with probability 0.5;
- the same stage definitions and noise targets (1 / 2.5 / 4.5 %);
- the same noise process (GARCH + t + AR + shocks);
- noise that is stationary inside the pattern;
- an origin forced to be an extreme;
- the same evaluator.

So C2 is independent in its implementation but not in its specification. It cannot reveal blind spots that are shared
in the spec (M1, H3-type cut conventions, M6).

## 5. Determinism and stage truncation (point 7)

Each check below was run for C1, C2 and C3, with seeds 0–19, all classes, and noise none, low and high.

- **Determinism:** 0 mismatches between identical calls.
- **Prefix:** 0 / 13,680 prefix mismatches between each P or C_EARLY stage and C_LATE (C2: `opts.full`).
- **Skeleton:** `topIdx` is identical across stages and noise levels.
- **Layout A:** the mid-cut prefix is identical to the end case.

The claim that stage truncation does not change the prefix holds. The claim that noise does not change the skeleton
holds for C1, C2 and C3, but not for A and B (M4).

## 6. Priority fixes

1. Make A, B, C1 and C3 skeletons extreme-consistent, and validate them on the price path as C2 does (H1). Recompute
   the negatives so each breaks exactly one rule (H2).
2. Randomise the C2 confirmation cut in time (H3). Score the gates only on truth that is still valid after noise, using
   an independent checker (H4, M5).
3. Make the noise integrated and identical inside and outside the pattern (M1). Fix the C2 flat B range (M3). Make the
   A and B skeletons independent of the noise level (M4).
