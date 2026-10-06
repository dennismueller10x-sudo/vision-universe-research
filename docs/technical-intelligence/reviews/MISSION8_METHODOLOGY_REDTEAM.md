# Mission VIII (HSAB): methodology red team

Scope: design, code and CI aggregates on branch `claude/vision-universe-mission-viii-7hjwma` (HEAD `04af59281c5`). No repository files were changed.
Read: methodology, data-usage register, `protocol.json`, `evaluate.mjs`, `structural-outcomes.cjs`, `replay-core.mjs`, `panel.mjs`, `MISSION8_CODE_REVIEW.md`, `TECHNICAL_EVIDENCE.md`, `STATISTICS_AUDIT.md`, `BACKTEST_METHODOLOGY.md` and the CI aggregates in `quant/data/technical-intelligence/historical-accuracy/ci/`.

The question I tried to answer: **how could this study produce an impressive result that means nothing, or a null result that is wrong?**

## 0. What the existing DEV numbers already show (`d-dev-eval.json`, D_DEV, 231 symbols, 21,481 resolved events)

| Quantity | Value | What it means |
|---|---|---|
| PSS | 70.19 % | headline candidate |
| Martingale b/(a+b) from the event geometry | **67.39 %** | A driftless random walk already gets about 67 % from the distances alone |
| Control D (same date, other symbols, same ATR geometry) | 69.50 % → lift +0.69 pp (CI +0.04 … +1.33, p = 0.033) | Barely significant and economically trivial |
| E / B / C | +0.38 / +0.03 / **−0.96** pp | Only D is positive. The same-symbol near-time control is negative, as it was in Mission IV (−2.7 pp) |
| Median bars to Target 1 | **6 trading days** (H = 126) | Target 1 sits about one ATR away. TIMEOUT is only 1.4 % |
| Alternative scenario (opposite direction) reaches its own Target 1 | **61 %**; primary OR alternative 96.8 % | Both directions "succeed" most of the time. PSS mostly measures distances, not direction |
| TRIVIAL_TARGET (target already reached at display, excluded) | 1,585 events (6.9 %) | Counted as failures, the customer-view PSS is **65.4 %**, *below* the martingale rate |
| Directional skill of FULL at the same points | 13-week market-adjusted sign hit 49.1 %, mean signed excess return −1.67 % per 63 days, barrier lift +0.4 pp (CI includes 0) | No directional edge. MOM52 and PULLBACK both do better |
| Coverage of analysis points | 90.1 % | VU speaks almost everywhere, so it is not selective |
| Level B (entry required) | fill rate 73.5 %, T1 among fills 54.9 %, mean return +0.19 % | No control is computed for this level |

**These DEV numbers are stale.** They were produced at commit `35d454f`, before the code-review fixes: `evaluate.mjs` has changed by about 100 lines since, and the file has no `vsP_timingMatched` and no HALF/YEAR blocks. They have to be recomputed with the frozen evaluator (see H7).

Taken together, a 70 % PSS can come almost entirely from geometry: a near target, a farther invalidation, a touch counted on the bar high against an invalidation that needs a close, and display rounding that favours the target. Even the +0.7 pp lift can come from pivot-timing and volatility effects that have nothing to do with the VU method.

---

## 1. Findings

Legend: **Before holdout?** **MUST** = fix or preregister before any holdout opens. **PREREG** = must be written into the preregistration as a disclosure, sensitivity or decision rule. **AFTER** = may follow later.

### CRITICAL-1: Absolute PSS is mostly a geometry artefact and can be communicated misleadingly
- **Evidence:**
  - PSS 70.2 % against a martingale rate of 67.4 %.
  - The opposite-direction alternative reaches its own Target 1 in 61 % of cases.
  - Median time to Target 1 is 6 days.
  - Same-symbol random time (B) gives 70.2 %.
- **Mechanisms that inflate the rate without any skill:**
  1. kT < kI: the "Ziel 1" near edge is typically about 1 ATR away, while the invalidation is farther.
  2. The near edge of a broad Target-1 zone counts as reached.
  3. On daily bars the target counts when touched by the intrabar high or low, while the invalidation needs a *close*.
  4. Outward display rounding on split-adjusted prices pulls the target closer and pushes the invalidation away (Review H1, still present).
  5. TRIVIAL_TARGET cases are removed from the denominator.
- **Failure mode:** "VU's primary scenario hit its target in 70 % of cases" is true and means nothing. A coin-flip direction with the same distances would score about the same.
- **Fix (MUST, PREREG):**
  - Declare that absolute PSS is **never** a headline or customer number on its own. It may only appear next to (a) the matched-control rate and (b) the geometry-implied rate.
  - Report a per-event *excess over geometry*: `y − kI/(kI+kT)`. Report *expected R*: success·kT/kI − failure·1, with timeouts marked to market, for events and for controls.
  - Add these preregistered sensitivities:
    - Target 1 measured at the **zone mid** and at the far edge;
    - a **close-beyond-target** rule (the same close rule as the invalidation);
    - TRIVIAL and ALREADY_INVALID counted as failures;
    - `excludingCoarseRounding`.

### CRITICAL-2: Metric and comparator shopping against a history of nulls
- **History:**
  - The entry-based Target-1 metric was null in the weekly TEST (35.6 % vs 35.9 %), which was looked at 4 or more times.
  - The near-time baseline was negative (−2.7 pp, STATISTICS_AUDIT addendum).
  - Mission VIII switches to a no-entry metric (PSS) and makes the **same-date cross-sectional control D** the primary comparator.
  - In DEV, D is the only control with a positive lift. C is −0.96 pp, and B and E are about 0.
- **Failure mode:** a "confirmed edge" that exists only for the one metric and comparator combination chosen after the earlier ones failed. This is a garden of forking paths, even though no parameter was tuned.
- **Fix (MUST, PREREG):**
  1. Write the metric history into the preregistration: which metrics and baselines were null before, and why PSS and D are chosen now.
  2. Make the confirmatory decision **conjunctive**:
     - lift vs D > 0 (primary test);
     - **non-inferiority vs P** (timing-matched) and vs C (same symbol, near time), with margin −0.5 pp on the lower 95 % bound;
     - point estimate vs E ≥ 0.
  3. Give the entry-based Level-B metric its own matched control. Use the same entry, fill window and costs, with the zone and levels transferred in ATR units to D-type controls. Make it a preregistered secondary, so the customer-relevant metric is not silently dropped.

### HIGH-3: Estimand mismatch: pivot-confirmation times are not "an investor opens VU at t"
- **Problem:**
  - Events are only the bars at which a scale-2 pivot is confirmed. Those are price-selected moments: right after a confirmed swing, with elevated realized volatility relative to the trailing ATR and short-term reversal or continuation drift.
  - A customer opens VU on an arbitrary day.
  - The daily holdout has **no per-bar sample** (`perbar 0`, `persist 0`), so the study cannot measure the customer-day estimand at all.
- **Failure mode:**
  - The lift reflects "pivot moment" dynamics, which P only partly absorbs.
  - Or the result is null at pivots while the product behaves differently on ordinary days, or the other way round.
  - Either way it is answering a different question from the one in the mission statement.
- **Fix (MUST, because Stage 1 must be sealed before opening):**
  - Add a sealed **calendar-grid Stage 1**: for example the last trading day of each month per symbol, or every 4th Friday on weekly data. Run it on both holdouts with the same lifecycle rule (the first open scenario counts and later grid points are lifecycle only).
  - Preregister it as the key secondary "customer-open estimand", or as co-primary.
  - Cost is roughly 1–1.5 h of CPU for the daily sample, comparable to the existing 3,882 s seal.

### HIGH-4: The D lift can come from timing and volatility, with no method value
- **Mechanism:**
  - At pivot confirmation, realized volatility tends to exceed the trailing ATR.
  - Distances are fixed in *trailing-ATR* units. So the event stock moves more ATRs per bar than a random D control. It resolves faster and has fewer timeouts.
  - Together with the touch-versus-close asymmetry (the high or low touches the target, the invalidation needs a close), more realized volatility per ATR raises PSS whenever kT is small.
  - E matches only the *level* of ATR% (tercile), not the ATR trend or vol-of-vol.
  - On weekly close-only data, ATR is the mean |Δclose|, which differs systematically between calm and trending names.
- **Fix (MUST before holdout, code in Stage 2 only, no engine change):**
  - Promote **P** (same date, other symbols that also confirm a scale-2 pivot) to co-primary, or require the conjunctive rule from CRITICAL-2.
  - Add a P' control that also matches the **swing direction** of the confirmed pivot (Review M14 asked for this; the implemented P ignores pivot direction).
  - Report the volatility ratio ATR(short)/ATR(long) at t for events and controls, and the realized-volatility ratio over the outcome window, in ATR units, as a *diagnostic*. It is not a matching variable, because it would look ahead.
  - Report timeout and same-bar shares for controls next to the events'.

### HIGH-5: The delisted weekly cohort is a weak holdout for product claims
- **Problems:**
  1. **Conditioned on the future.** Every series ends in delisting, mostly through M&A, often after a jump to the deal price. Bankruptcies end in collapses. A customer at t looks at all listed stocks, not at future delisters. Absolute rates are not representative, and the direction mix is biased (bullish targets get gap hits on takeovers).
  2. **History truncated at 2015.** The bundle starts at `w0` ≥ 2015, so the replay sees at most a few years of history. The product at t would have seen the full listing history: different S/R, Elliott degree and 52-week states. 1,463 of 3,082 listings are "too short" (fewer than 160 weeks after 2015), which selects listings that survived at least 3 years after 2015. **The replay is not "what VU would have shown."**
  3. **Weekly close-only is the product's fallback.** Production analyses daily data first (`build-technical-intelligence.mjs`, "Tagesanalyse hat Vorrang"), so customers mostly see the daily product. The weekly holdout tests a degraded variant: no range, no volume, no HTF, no Wyckoff volume.
  4. **Inconsistent censoring rule.**
     - For survivors, events without a full horizon are excluded (`INCOMPLETE_HORIZON`).
     - For delisted names, they are kept, and CENSORED events are dropped from the primary metric. So an event inside the last 26 weeks before delisting counts only if it resolved quickly, and censoring at delisting is informative.
     - D controls drawn from the cohort are censored at *their own* delisting dates, so the asymmetry does not cancel.
  5. Weeks with no trading (`null`) are dropped, so 26 bars can span more than 26 calendar weeks, and the stale detection is weakened.
- **Fair-control question:** controls drawn inside the delisted cohort share the conditioning on future delisting. That is fair for a *lift*, but the result is a statement about the delisted subpopulation only.
- **Fixes:**
  - (MUST) Use one rule for the delisted primary: exclude events *and* control draws with `t + H > last bar`. Report a separate outcome category, "delisted within H", by delisting class, and keep "censored = failure" as a sensitivity.
  - (MUST, on DEV data only) Quantify the truncation effect. Replay W_DEV survivors with history cut to start in 2015, then compare primary direction, geometry, PSS and lift with the full-history replay. If the primary scenario differs in more than about 10 % of records, label the delisted holdout "VU on short histories" in the preregistration.
  - (PREREG) The delisted result is a **generalisation test of the lift**, not a customer-representative rate.
    - Add a D-control drawn from the **union pool** (survivors and delisted on the same date) as a sensitivity. The control outcomes of survivors carry no VU snooping.
    - Stratify by delisting class (M&A vs distress) if the class field allows it.
  - (PREREG) Exclude listings with more than X % null weeks, or report them.

### HIGH-6: The daily holdout is only conditionally independent and survivor-only
- **Problems:**
  - It covers the same calendar period (2017–2026) and largely the same symbols that were evaluated weekly. Weekly TEST ≥ 2019 was consumed at least 4 times.
  - Product design choices (Elliott weight 0, plausibility bounds, measured move, template rules) were made after seeing those outcomes, so method and outcomes share the same price paths.
  - The 600 D_DEV symbols are exactly the first 600 of the 1,200 holdout symbols.
  - The sample contains only today's listings, so it has survivorship bias, which inflates bullish absolute rates. D is also survivor-only, which partly protects the lift.
  - `symbolsByYear` rises from 517 to 936, so the composition drifts toward recent IPOs.
- **Fix (PREREG):**
  - Call it a "conditional holdout".
  - Preregister the **disjoint-symbol subset** (holdout symbols not among the 600 DEV symbols) as a sensitivity, and require the same sign.
  - Disclose the survivorship bias and state that no daily delisted data exist.

### HIGH-7: Stale evidence and seal versions
- **Problems:**
  - `d-dev-eval.json` (the 70.2 % / 69.5 % numbers) and all Stage-1 seals were produced at `35d454f`, before the review fixes (H2 relabel, M5, M10, M14 P, M11 blocks).
  - `replay.mjs` has changed since then.
  - Any power calculation, threshold freeze (`agreementCutoffs`) or design decision based on these numbers uses a different evaluator from the one that will open the holdout.
- **Fix (MUST):**
  - Re-run W_DEV and D_DEV with the frozen code.
  - Freeze `selectivity.agreementCutoffs` from that run.
  - Re-seal the holdout Stage 1 at the frozen commit, and assert that the records are byte-identical to the earlier dev-mode seals apart from metadata. That is a drift check of engine and data.
  - Put the record hash and the per-symbol input hashes into the preregistration (Review H3.6, M13).

### HIGH-8: No product-significance threshold, and no way to call a null a null
- **Problem:**
  - The DEV CI half-width is about 0.65 pp at 21k events. The daily holdout will likely have about 40k events, so it will detect lifts as small as about 1 pp.
  - In expected-R terms, Δp·(kT+kI)/kI is about 0.03 R per pp, which is below trading costs. "Significant" and "useful" diverge.
  - On the other side, an underpowered delisted test (about 10k events, CI about ±1.5 pp) can produce a "null" that is merely inconclusive.
- **Fix (PREREG):** a minimum relevant lift plus an equivalence test (see section 2).

### MEDIUM-9: Rounding look-ahead (Review H1) remains in the replay
- **Problem:** it inflates absolute PSS, shifts the TRIVIAL classification, and has a residual effect on the lift through the TRIVIAL and ALREADY_INVALID filtering, which applies to events but not controls.
- **Fix (PREREG):** make `excludingCoarseRounding` (step > 0.25 ATR) a *required-same-sign* robustness check, and report the share of excluded events. Engine changes are out of scope for this mission.

### MEDIUM-10: The customer view excludes TRIVIAL and ALREADY_INVALID
- **Problem:** the disposition says "BEHOBEN" (fixed), but only `coverageScorable` was added. There is no PSS that counts them as failures. On DEV, the customer view gives 65.4 % instead of 70.2 %.
- **Fix (MUST, a few lines in Stage 2):** add `customerView` to `T.primary.sensitivity`, and show the TRIVIAL share next to any headline.

### MEDIUM-11: The coverage definition flatters selectivity
- **Problem:**
  - Coverage is measured over *pivot points*, not over customer days, and TRIVIAL scenarios count as "spoken".
  - At 90 % coverage VU is not selective. Any "VU only speaks when sure" story would come from post-hoc tier choice among ALL / NOT_MIXED / CLARITY / AGREEMENT_TOP25/50/10 / ELLIOTT_SPEAKS.
- **Fix (PREREG):**
  - Name **one** selectivity hypothesis (for example: CLARITY_CLEAR lift − ALL lift > 0, using paired bootstrap on the same events), with cutoffs frozen from the re-run DEV.
  - Treat all other tiers as exploratory.
  - Report coverage on the calendar-grid sample too.

### MEDIUM-12: Inference is too optimistic
- **Problems:**
  - Quarter blocks are shorter than H (26 weeks / 126 days).
  - Market-wide pivot clusters (for example 2020-03, 2022) put many events into the same weeks.
  - The daily holdout spans about 10 years, so YEAR blocks give about 10 clusters, where the bootstrap is unreliable.
  - The base is draw-weighted (Σch/Σcd), not a per-event mean (Review M5 second half, not implemented).
- **Fix (PREREG):**
  - The primary CI uses two-way symbol × **half-year** blocks, taking the widest of the three schemes. YEAR is a required sensitivity.
  - Suppress rows with fewer than 20 clusters in any dimension.
  - The estimand is the per-event paired excess `y_i − ch_i/cd_i`.
  - Report the top-5-weeks event share, and a sensitivity that excludes 2020-Q1/Q2.

### MEDIUM-13: Direction skill is not separated from geometry in PSS
- **Problem:** Review M14's second half was not done: simple models are evaluated only on barrier and fixed-horizon tests, not on PSS.
- **Fix (before holdout, Stage 2 only):** at the same events, mirror VU's (kT, kI) onto the direction of MA_TREND, MOM52 and ALWAYS_LONG, and onto the *opposite* direction. Compute PSS for each. The FULL-minus-opposite-direction PSS on the same stock and date is the cleanest test of direction value given the geometry. If it is about 0, PSS lift is not "the scenario was right".

### MEDIUM-14: Replay fidelity to the product (Elliott state and evidence table) is unverified on the holdout
- **Problems:**
  - Holdout records are stateless, while the product runs a 52-bar Elliott chain.
  - The daily holdout has no persistence sample.
  - `evidenceTable = null` is asserted to affect only the confidence label. The FULL self-check compares two null-table builds, so it does not test this.
- **Fix (MUST, DEV only):**
  - On a DEV subsample, compare the primary scenario with today's evidence table against the null table. It should be identical; if not, disclose the mismatch rate.
  - Preregister a fidelity threshold, for example: primary direction and geometry differ between chained and stateless runs in at most 5 % of persistence-sample records. Above that, the result is labelled "stateless approximation of VU".

### MEDIUM-15: Regime and segment cherry-picking, and multiple testing
- **Problem:**
  - Prior evidence flagged risk-off and extreme-volatility segments (+2–3 pp) as hypotheses.
  - There are about 25 segment tables, 17 ablation variants and 5 controls.
  - BH is applied per table only, not across tables.
- **Fix (PREREG):**
  - At most **one** regime hypothesis (risk-off lift vs D > 0) inside the Holm secondary family. Everything else carries BH-q across *all* exploratory rows and makes no customer claim.
  - Ablation and attribution are explicitly exploratory. With an effective-independent-families estimate below 3, no claim of the form "method X adds value" can be made.

### LOW-16: Symbol and sector concentration
- **Problem:** volatile names produce more pivots and therefore more events, and the sector taxonomy is today's.
- **Fix (PREREG sensitivity):** a symbol-equal-weighted lift (mean of per-symbol lifts), and the top-10 symbol share.

### LOW-17: Duplicated and overlapping events
- **Problem:** the lifecycle blocking is sound, but it ties event selection to the previous event's resolution time.
- **Fix (sensitivity):** "all scorable analysis points", clustered, without blocking. It should have the same sign.

### LOW-18: Holdout once-only rule across branches is procedural only
- **Fix (PREREG):** state the ledger location, and require the opening commit's parent to contain the preregistration for at least 24 h.

---

## 2. Recommended preregistration content

**Unit and estimand.**
- Unit: one *event*, meaning the first display of a directional primary scenario with Target 1 and invalidation, not already trivial or invalid, under the lifecycle rule.
- Estimand: the per-event paired excess `Δ_i = y_i − mean(control D draws_i)`, with D drawn from the same cohort and date, the same direction and the same ATR geometry (5 draws).
- Horizon: H = 126 days / 26 weeks.
- Events and control draws with an incomplete horizon (survivors) or that reach the end of the series (delisted) are excluded under one rule.

**Confirmatory hypotheses** (intersection-union; each one-sided α = 0.025; no further correction is needed because all must pass):
- **H1 (daily, product-relevant):** in D_HOLDOUT, mean Δ vs D > 0.
- **H2 (weekly delisted):** in W_HOLDOUT, mean Δ vs D > 0.
- Inference uses the two-way cluster bootstrap (symbol × half-year), B ≥ 2,000, widest of SYMBOL / TIME / TWO_WAY.

**Robustness gates.** All must hold for a positive claim; they are not tested for significance.
1. Δ vs **P** (timing-matched): point > 0, lower 95 % bound > −0.5 pp.
2. Δ vs C ≥ −0.5 pp on the lower bound. Δ vs E: point ≥ 0.
3. Same sign under each of these:
   - customer view (TRIVIAL and ALREADY_INVALID count as failures);
   - target at zone mid;
   - close-beyond-target rule;
   - `excludingCoarseRounding`;
   - YEAR blocks;
   - disjoint-symbol subset (daily);
   - union-pool controls (delisted).
4. FULL vs opposite-direction PSS at the same events: point > 0.

**Product-significance threshold.**
- **Meaningful edge:** point lift ≥ **+2.0 pp** AND lower 95 % bound ≥ **+0.5 pp** in both holdouts. On a ~70 % base, anything smaller is below roughly 0.06 R per signal, which is less than typical costs.
- **Detectable but negligible:** H1 and H2 pass, but the point lift is below 2.0 pp. No customer edge claim; say "kein praktisch relevanter Vorteil".
- **No edge (equivalence):** the 90 % CI lies within **±1.5 pp** (TOST). This supports the explicit statement "Ziele werden so oft erreicht wie bei Zufallsfällen mit gleichen Abständen".
- **Inconclusive:** neither of the above, typically in the delisted cohort. Report exactly that.
- **Harm signal:** upper 95 % bound below 0 in either holdout. Review how prominently "Ziel" is presented in the UI.

**Holm secondary family (at most 5).**
1. Calendar-grid "customer opens VU" Δ vs D (daily).
2. Level B: Target 1 among filled entries vs an entry-matched D control (same entry, fill and cost rules).
3. Expected R per event vs D.
4. Selectivity: CLARITY_CLEAR Δ minus ALL Δ > 0 (paired).
5. Risk-off regime Δ vs D > 0.

Everything else (ablation, Elliott groups, segments, coverage tiers) is exploratory, carries BH-q across all rows, and is not used in customer communication.

**Customer-claim criteria.**
- Never publish an absolute PSS ("70 % erreicht Ziel 1") without, in the same sentence or table, the matched-control rate, the geometry-implied rate, the median distance to Target 1 in ATR and percent, and the median time to Target 1.
- An edge claim needs the "meaningful edge" outcome in **both** holdouts plus all robustness gates. Wording: "In einem einmaligen, vorab registrierten Test auf nicht zuvor ausgewerteten Daten erreichten Hauptszenarien Ziel 1 um X pp (KI …) häufiger als Vergleichsfälle mit identischen Abständen am selben Tag."
- On a null or negligible outcome, state it plainly in the product evidence box: "Das Chartbild ordnet ein; die Zielerreichung entspricht der von Zufallsfällen mit gleichen Abständen."
- Any customer number must state the timeframe (daily vs weekly fallback), the survivorship status, the period, the stateless-replay caveat, and that the daily holdout calendar period was previously seen at weekly resolution.

## 3. Must-do list before any holdout opens
1. Re-run D_DEV and W_DEV with the frozen evaluator, freeze cutoffs, and re-seal Stage 1 at the frozen commit with a record-identity check (H7).
2. Add and seal the calendar-grid Stage 1 on both holdouts (H3).
3. Stage 2 additions:
   - a single censoring rule for delisted events and controls;
   - a "delisted within H" category;
   - `customerView`;
   - zone-mid and close-touch sensitivities;
   - P' with swing direction;
   - per-event paired estimand;
   - half-year primary blocks;
   - opposite-direction and simple-direction PSS;
   - an entry-matched control for Level B;
   - union-pool D for delisted;
   - a disjoint-symbol flag (CRITICAL-1/2, H4, H5, M10, M12, M13).
4. DEV-only fidelity checks:
   - history truncated at 2015 vs full history (H5);
   - evidence table vs null (M14);
   - persistence sample n > 0 (M14).
5. Write the preregistration with the decision table above, the metric-history disclosure and the customer-claim rules. Hash it into `protocol.json` in a parent commit at least 24 h before opening.
