# Supertrader V4 – Source & Measurement Acceptance (post-hoc)

Branch `research/supertrader-source-measurement-acceptance-v4` (Draft, stacked on #677; #677 and #643 are not
changed). Research only: no live migration, no merge, no performance optimisation, no parameter search.
Implementation specs: [SUPERTRADER_IMPLEMENTATION_SPEC_V4.md](SUPERTRADER_IMPLEMENTATION_SPEC_V4.md).
Artifacts: `scripts/supertrader/research/v4/`.

> Three questions are kept apart: (1) did we understand the trader? (sources) – (2) can we measure a strategy
> correctly? (calibration) – (3) does the strategy work? (backtest). V4 answers (2) with **no**: the measurement
> layer is `NOT_CERTIFIED`. Question (3) is therefore not asked in this run.

## Executive summary

**What V3 proved.** The share/cash ledger reconciles internally; orders fill only on real source bars at the next
open; the cash-budget roundoff and the synthetic data-quarantine order bug were real and are fixed; the 52W failure
was a share-count dust deletion (now value-aware).

**What V3 did not prove.** That VU measures returns correctly. V3's `PARTIALLY_CERTIFIED` rested on internal
reconciliation and a same-author review; its stock-level source oracle had 0/105 valid months for EW, JT and 52W.

**What the books changed (owner summary).** Minervini SEPA is a review process, not a Boolean VCP gate; Weinstein
needs separate investor/trader/short paths and support stops; Darvas has precise later box rules; Turtles'
published core is reproducible but VU's engine is a foreign adaptation; Kullamägi has three separate families and
the low-of-day stop must not become an ADR clamp; CAN SLIM is out of scope. **Caveat:** the reconstruction
artifacts (13 books, 785 findings, 287 behavioral cases) are not in this repository (checked all 592 remote branches
on 2026-10-15). They were used as owner-attested findings only (ids `OSR-*`). They can downgrade a VU rule but cannot
make a rule `SOURCE_ACCEPTED`.

**Measurement defects closed.** V3 A1–A14 are each closed or classified (`SUPERTRADER-V4-ADVERSARIAL-FINDINGS.json`).
The independent V4 review (V4-R1…R17, before any result) was also closed or scoped. Split logic is freeze-bound,
missing-bar/stale valuation is defined, and the >1e6 prices are classified.

**External oracles acquired.** Kenneth R. French Data Library, all hash-pinned: EW market (size-decile EW returns ×
firm counts), 12-2 momentum EW deciles, 60-day variance EW quintiles, all 2018-01…2026-08 (104 months).

**V4 certification status: `NOT_CERTIFIED`.** Freeze `V4-beae51ae1b07768b`, run 38722939085:
- EW control vs French EW market: FAIL (correlation 0.145).
- Internal two-path reconciliation (share ledger vs TR arithmetic): FAIL (90.4 % of months within 5 bp; maximum 7.8 %).
- Momentum and variance oracles: FAIL. Inner buckets correlate 0.98/0.99, but the extreme buckets and the spreads do not.
- No pre-registered sensitivity changes any verdict.
- Rule 14 applies: the EW control is not reproduced, so the measurement layer is not certified.

**Methods.**

| Status | Methods |
|---|---|
| Source-accepted | Turtle S1, Turtle S2 (primary PDF); Kullamägi Breakout / EP / Parabolic Short (own articles) |
| Data-accepted (declared scope) | Turtle S1/S2 (long-only equity), Darvas, Weinstein ×2, Minervini ×2 (machine screen), KK Breakout (daily screen), Holy Grail |
| Measurement-accepted | none (V4 `NOT_CERTIFIED`) |
| Implementation-ready | none formally (`IMPLEMENT_NOW` needs measurement). Turtle S1/S2 are source- and data-ready; spec, engine and golden tests exist; no performance measured |
| Manual-only | Minervini SEPA/VCP, Minervini Power Play, Weinstein Stage 2 Investor, Weinstein Stage 2 Trader, Kullamägi Common Breakout |
| Data-blocked | Kullamägi Episodic Pivot, Kullamägi Parabolic Short (and the original Turtle futures replication) |
| Research-only | Turtle S1/S2 (measurement blocked), Darvas later Q&A, Pocket Pivot, Buyable Gap-Up, Holy Grail, CAN SLIM (source not traceable) |
| Educational-only | none assigned: without the 287 behavioral cases no method can be shown non-reproducible |

Root cause of `NOT_CERTIFIED` (section 4.1): a handful of security-months with undeclared reverse splits in the canonical price data (data defect V4-D1). Removing them (diagnostic only) gives EW correlation 0.99.

**Next best product candidates.**
1. Repair the measurement layer (section 4), then re-run V4 calibration as a new post-hoc generation.
2. Turtle S1/S2 source-faithful, which is ready to measure the moment the gate opens.
3. Minervini/Weinstein machine screens with the manual review contract.
4. Commit the book-reconstruction artifacts so that Darvas, Pocket Pivot, Buyable Gap-Up and Holy Grail can get source ids.

## 1. Inputs and what was not redone

* V3 (#677 head `98653c5d`): read as evidence (freezes, results, adversarial review, discrepancies, protocol,
  reference plan); not rewritten. V3 public files keep their content.
* R15 canonical rulebooks (`scripts/supertrader/fidelity/canonical/*.json`) are the repository's primary-source contracts.
* Books, Dropbox and momentum calibrations were not redone. The French files are the same bytes as V3's reference
  plan (MOM10, VAR), plus the ME file.

## 2. V3 review closure (A1–A14) and V4 review (R1–R17)

| Id | V3 sev. | V4 sev. | Topic | V4 status |
|---|---|---|---|---|
| A1 | blocker | BLOCKER | reconciliation presented as calibration | CLOSED (external oracles, levels) |
| A2 | major | MAJOR | LowVol direction conflict | CLOSED (direction hard check) |
| A3 | major | MAJOR | split logic not freeze-bound | CLOSED (path.join closure, split policy section) |
| A4 | major | MAJOR | positions without a bar held forever | CLOSED (5-session stale limit, settlement) |
| A5 | major | MAJOR | quarantine terminal before observation; DQ got −30 % | CLOSED (causal terminal, data-event factor) |
| A6 | major | MAJOR | circular dividend check; off-calendar bars | CLOSED_SCOPE_LIMITED (R8b; V3 books not re-reviewed) |
| A7 | major | MAJOR | formation not reviewed | CLOSED_SCOPE_LIMITED (truncation + independent scorer; JT/GH not re-scored) |
| A8 | major | MAJOR | dust not value-aware | CLOSED |
| A9 | major | MAJOR | 74 prices > 1e6 | CLOSED (classified: 71 serial reverse splits, 3 split artifacts) |
| A10 | major | MAJOR | completion builder trusted self-reports | CLOSED |
| A11 | major | MODERATE (reason recorded) | observed-only universe | OPEN (data limitation; EW oracle quantifies it) |
| A12 | minor | MINOR | tolerance relative to equity; ADR-002 | CLOSED |
| A13 | informational | MODERATE | literal freeze flag; createdAt in id | CLOSED (content id, git pinning) |
| A14 | informational | MINOR | quasi-identifiers in V3 public files | CLOSED_SCOPE_LIMITED |

There were 17 findings from the independent V4 review, made before any result existed. Three of them were HIGH:

* R1: the findings file was not frozen.
* R2: the Turtle notional account was linear, contradicting the source example.
* R6: Turtle P&L runs outside the certified ledger.

Medium and low findings covered filter path order, the add-bar stop, terminal-bar entries, quarantine order,
EW sensitivity flips, tolerance capping, coverage split, provenance of the summary, push rebase, eligibility
lookahead, stale-rule parity, fixture binding and count duplication. All are CLOSED or CLOSED_SCOPE_LIMITED; R6 leaves
the Turtle fill model `MEASUREMENT_PARTIAL` by design. The first V4 freeze (`V4-bbc5fbdc5a12d978`) failed closed
before any computation and is kept under `superseded/`.

## 3. V4 calibration design (pre-registered, `SUPERTRADER-V4-CALIBRATION-SPEC.json`)

* Constructions mirror the oracle definitions. Holding month m runs from the last session of m−1 to the last session
  of m. Returns are monthly total-return arithmetic. Universe: NYSE/AMEX/NASDAQ `EQUITY_COMMON`, with NYSE breakpoints
  from the listing exchange.
  Classification: `MATCHED_UNIVERSE_APPROXIMATION` (not an exact replication; declared deviations listed).
  JT 6/6 has `DIRECTIONAL_REPLICATION` at most and 52W is `INTERNAL_CONTROL_ONLY` (no public series).
* Tolerances, fixed in code and freeze before measurement:
  * correlation ≥ 0.95 market / 0.90 bucket / 0.60 spread;
  * mean difference within max(25 bp, 2 SE), capped at 50/50/75 bp;
  * tracking error ≤ 8/12/20 % p.a.;
  * volatility within ±25 %;
  * max drawdown within ±5 pp;
  * direction is hard when the reference mean is at least 25 bp;
  * VU coverage of reference months ≥ 95 %.
* Internal oracle: an EW share/cash book with formation-close fills, compared to the arithmetic EW
  (≤ 5 bp in ≥ 99 % of months, mean ≤ 1 bp). The next-open book is informational.
* Review: R8b dividends recomputed, dust cap, curve, ending freshness, truncation + independent scorer (39 sampled
  formations), EW eligible set rebuilt from truncated data, off-calendar census.
* Sensitivities: exclude all >1e6 names, keep the sanity defects, data events at −30 %, last-price and distress-zero
  delisting scenarios.
* Levels: CERTIFIED (EW plus two factor families pass) / PARTIALLY / INTERNALLY_RECONCILED / NOT_CERTIFIED.
  PASS is never CERTIFIED.

## 4. V4 calibration result and attribution

Run 38722939085, freeze `V4-beae51ae1b07768b`, freeze commit `af173006c63`. Universe: 9,408 securities, 3,194
delisted, 523 quarantined.

| Check | Result |
|---|---|
| EW market vs French | **FAIL**: correlation 0.145, mean/TE/vol/drawdown checks failed, direction equal; VU holds about 1.34× as many names |
| Momentum 12-2 deciles | **FAIL**: median bucket correlation 0.979, but low decile 0.027, high decile mean fails, spread correlation 0.04 with opposite direction |
| Variance 60d quintiles | **FAIL**: median bucket correlation 0.994, but low/high quintiles fail, spread correlation −0.002 with opposite direction |
| Internal reconciliation (book vs arithmetic) | **FAIL**: 90.4 % of months within tolerance, mean 14 bp, max 7.8 % |
| Independent review | PASS: all books and constructions, 12 hard checks |
| Off-calendar bars | 0 |
| Price sanity (>1e6) | 74: 71 genuine serial reverse splits, 3 split artifacts quarantined |
| Causal terminals | 146 quarantine terminal dates moved to observation |
| Sensitivities | all FAIL (no flip) |
| Certification | **NOT_CERTIFIED** (PROVEN_MEASUREMENT_DEFECT_INTERNAL_RECONCILIATION_FAILED, MEASUREMENT_LAYER_EW_CONTROL_FAILED) |

### 4.1 Attribution (post-result diagnostic, no verdict effect)

Diagnostic run 38724718674 used the same canonical price content as the freeze. Code:
`diagnose-calibration-v4.mjs`; public summary: `SUPERTRADER-V4-DIAGNOSTIC-SUMMARY.json`; security-level evidence
is sealed.

| Observation | Value |
|---|---|
| Largest security-month return | order of 10⁴ (≈ +1,000,000 %) |
| Security-months > +100 % / > +1,000 % / < −99 % | 2,200 / 65 / 13 |
| Of the > +100 %: undeclared raw jump ≥ 10× / declared split in the month / sub-dollar start / other price moves | 55 / 28 / 765 / 1,352 |
| Share of the squared EW gap in the worst 5 months | 99.9 % (4 months differ by more than 5 %) |
| EW correlation: baseline → without the 83 data-signature security-months | 0.145 → **0.992** |
| EW correlation: without > ±100 % / winsorised 1–99 % / without sub-dollar starts | 0.990 / 0.994 / 0.992 |
| Internally failing months that contain > +100 % outliers | 10 of 10 |

**Root cause (V4-D1, BLOCKER, open):** the canonical price data contains undeclared reverse splits and mis-adjusted
split months. A handful of security-months with returns of 1,000 %–1,000,000 % dominate any equal-weighted
measurement, and they also explain the share-ledger vs TR divergence. The ledger, the arithmetic, the oracle
parsing and the review are not the cause: once those security-months are removed, EW tracks CRSP at 0.99. The
removal is a diagnostic only; it is not a certification.

**Also open (V4-D2, MAJOR):** the VU EW population is about 1.34× the CRSP size-portfolio population, and its mean
stays above the oracle after cleaning. The likely cause is non-common instruments classified as `EQUITY_COMMON`.

**Why this run does not "fix and re-certify":**
* A quarantine rule chosen after seeing this result would be post-result tuning.
* The correct fix is causal detection of undeclared corporate actions in the canonical core (`quant/engines`, a
  protected path). It needs its own Quant PR and a new pre-registered calibration generation with the unchanged
  V4.1 tolerances (proposal in `SUPERTRADER-V4-POST-RESULT-FINDINGS.json`).
* The V3 tournament results run on the same canonical core and inherit the defect. This retroactively explains part
  of the V3 oracle insufficiency (0/105 months).

## 5. Acceptance per method

Machine-readable: `SUPERTRADER-V4-SOURCE-ACCEPTANCE.json`, `-DATA-ACCEPTANCE.json`, `-MEASUREMENT-ACCEPTANCE.json`,
`-METHOD-ELIGIBILITY.json` (generated by `acceptance/build-acceptance-v4.mjs` from the V4.1 summary).

| Method | Source | Data (machine scope) | Measurement | Eligibility |
|---|---|---|---|---|
| Turtle System 1 | SOURCE_ACCEPTED | DATA_ACCEPTED (long-only equity; futures original DATA_BLOCKED) | MEASUREMENT_BLOCKED | RESEARCH_ONLY (ready to measure) |
| Turtle System 2 | SOURCE_ACCEPTED | DATA_ACCEPTED (idem) | MEASUREMENT_BLOCKED | RESEARCH_ONLY (ready to measure) |
| Darvas later Q&A | SOURCE_PARTIAL | DATA_ACCEPTED | MEASUREMENT_BLOCKED | RESEARCH_ONLY |
| Weinstein Stage 2 Investor | SOURCE_MANUAL_REQUIRED | DATA_ACCEPTED (industry for review: PARTIAL) | MEASUREMENT_BLOCKED | MANUAL_LAYER_REQUIRED |
| Weinstein Stage 2 Trader | SOURCE_MANUAL_REQUIRED | DATA_ACCEPTED | MEASUREMENT_BLOCKED | MANUAL_LAYER_REQUIRED |
| Minervini SEPA/VCP | SOURCE_MANUAL_REQUIRED | DATA_ACCEPTED (review data: fundamentals PARTIAL, estimates/surprises/institutional BLOCKED) | MEASUREMENT_BLOCKED | MANUAL_LAYER_REQUIRED |
| Minervini Power Play | SOURCE_MANUAL_REQUIRED | DATA_ACCEPTED | MEASUREMENT_BLOCKED | MANUAL_LAYER_REQUIRED |
| Kullamägi Common Breakout | SOURCE_ACCEPTED | DATA_ACCEPTED (intraday for entry: PARTIAL) | MEASUREMENT_BLOCKED | MANUAL_LAYER_REQUIRED |
| Kullamägi Episodic Pivot | SOURCE_ACCEPTED | DATA_BLOCKED (catalysts, surprises, intraday) | MEASUREMENT_BLOCKED | DATA_BLOCKED |
| Kullamägi Parabolic Short | SOURCE_ACCEPTED | DATA_BLOCKED (borrow, short interest, intraday) | MEASUREMENT_BLOCKED | DATA_BLOCKED |
| Morales/Kacher Pocket Pivot | SOURCE_PARTIAL | DATA_PARTIAL | MEASUREMENT_BLOCKED | RESEARCH_ONLY |
| Morales/Kacher Buyable Gap-Up | SOURCE_PARTIAL | DATA_BLOCKED | MEASUREMENT_BLOCKED | RESEARCH_ONLY |
| Raschke Holy Grail | SOURCE_PARTIAL | DATA_ACCEPTED | MEASUREMENT_BLOCKED | RESEARCH_ONLY |
| O'Neil CAN SLIM | SOURCE_PARTIAL | DATA_BLOCKED | MEASUREMENT_BLOCKED | RESEARCH_ONLY (out of scope) |

Data categories: price, volume ACCEPTED; intraday, fundamentals, industry, float PARTIAL; estimates, surprises,
guidance, institutional, short interest, borrow, futures, options, catalysts/news BLOCKED.

## 6. Performance, consensus, tiering, claims

* The final performance run did not happen. The gate (`run-performance-v4.mjs#performanceGate`) is closed by
  `NOT_CERTIFIED`. The performance workflow, performance freeze, A/B track and fair-benchmark metrics (rule 40/41)
  are built and tested on synthetic data only.
* Current scan and consensus were not produced: there is no accepted engine (rule 42/43). The V3 diagnostic
  consensus (333) stays V3 research evidence, not a qualified consensus.
* Product tiering (rule 44): CORE none; ADVANCED none; MANUAL REVIEW METHOD Minervini SEPA/VCP, Power Play, Weinstein
  investor/trader, KK Breakout; EXPERIMENTAL Turtle S1/S2 source-faithful (implemented, unmeasured); EDUCATIONAL none.
* Claim readiness (rule 45): every method is RESEARCH_ONLY. No historical outperformance claim is possible.

## 7. Public vs private

Public: counts, hashes, classifications, verdict flags, rounded correlations, directions. Sealed to owner/session keys
(Actions artifacts, 30 days): monthly series, oracle values, sensitivity details, price-sanity identities, diagnostic
security-level evidence. Raw French files are not committed (licence not established).

## 8. Answers to the final questions

1. **Which V3 findings remain valid?** The ledger reconciles internally. Next-open, bar-backed execution holds. The
   cash-budget and synthetic data-quarantine fixes stand. The 52W failure was share-count dust. The V3 fundamental
   methods remain data-blocked. The V3 statement that the mechanics were "not validated against an independent oracle"
   is now confirmed and sharpened: against an independent oracle they fail.
2. **Which V3 claims were too strong?** `PARTIALLY_CERTIFIED` and the EW control `PASS`. Strictly they were
   `NOT_CERTIFIED / INSUFFICIENT_REFERENCE_DATA`, and with an external oracle the EW control fails. Tournament results,
   the current replay and the 333-name diagnostic consensus rest on the same uncertified data.
3. **Which A1–A10 findings were closed?** A1–A5, A8–A10 CLOSED. A6 and A7 CLOSED_SCOPE_LIMITED (V3 books/engines are
   not re-reviewed). Also A12, A13 CLOSED; A14 CLOSED_SCOPE_LIMITED.
4. **Which remain open?** A11 (observed-only universe, MODERATE, quantified by the EW oracle). New: V4-D1 (BLOCKER,
   undeclared splits in canonical data) and V4-D2 (MAJOR, population/share-class).
5. **Is the split logic fully freeze-bound?** Yes. `return-series.js`, `canonical-total-return.js`, `data.mjs`
   (runtime), `published-close.js` (bound, not on the runtime path) and the V4 policy/sanity/accounting files are
   hashed. The closure fails on any unresolvable dynamic require. Verified in freeze `V4-beae51ae1b07768b`.
6. **Is missing-bar/stale-valuation behaviour cleanly defined?** Yes, in `measurement-policy-v4.mjs`:
   * stale carry for at most 5 sessions, then SECURITY_UNAVAILABLE at the last close;
   * data events are not economic delistings, with −30 %/0 as sensitivities;
   * causal quarantine timing;
   * zero-volume unchanged closes are stale.

   The book and the arithmetic apply the same rule.
7. **What explains the >1e6 prices?** 71 of 74 are genuine adjusted levels of serial reverse splitters (backward
   cumulative split factors). 3 are split artifacts (declared split without a matching raw move) and are quarantined
   from the event. No clamping.
8. **Which external calibration oracles were found?** Kenneth R. French Data Library: size portfolios (EW market via
   firm counts), 10 prior-return (12-2) portfolios, variance (60-day) portfolios. All are hash-pinned. Not available:
   52W (George/Hwang) and JT 6/6 series. SEO pages and ETF prices were rejected.
9. **Which strategies does VU reproduce externally in a plausible way?** None certifiably. The inner momentum and
   variance buckets correlate 0.98–0.99 with French, and the diagnostic (not certifying) EW reaches 0.99 once the data
   defects are removed. That is evidence that the construction mechanics are right.
10. **Which only internally?** The share/cash ledger (R8b, dust, reconciliation identity), next-open execution, costs,
    Turtle stop-trigger fills (independent ledger replay), JT 6/6 and 52W.
11. **Is the measurement layer now CERTIFIED?** No: **NOT_CERTIFIED** (EW control failed externally; internal two-path
    reconciliation failed), with an attributed root cause in the input data.
12. **Which of the 13 source candidates are IMPLEMENT_NOW?** None formally (measurement blocked). Turtle S1 and S2 are
    source- and data-accepted, specified, implemented and golden-tested, and ready to measure once the gate opens.
13. **Which need manual review?** Minervini SEPA/VCP, Minervini Power Play, Weinstein Stage 2 Investor, Weinstein
    Stage 2 Trader, Kullamägi Common Breakout.
14. **Which are data-blocked?** Kullamägi Episodic Pivot, Kullamägi Parabolic Short, and the original Turtle futures
    replication (for its scope).
15. **Which are educational-only?** None was classified as such. Without the 287 behavioral cases no method can be
    shown to be non-reproducible. Darvas, Pocket Pivot, Buyable Gap-Up and Holy Grail are RESEARCH_ONLY because their
    sources are not traceable here.
16. **Which old VU engines were source-unfaithful?** Each was unfaithful in a specific way:
    * DONCHIAN_TURTLE / TURTLE_S2_EQUITY_DAILY: no adds, alphabetical priority, VU lifecycle, S1 filter without
      short breakouts.
    * DARVAS_BOX: VU/TraderFox numbers, foreign risk logic.
    * WEINSTEIN_STAGES / WEINSTEIN_STAGE_DAILY: RS>0 gate, MA30 full sell, no support stops, mixed paths.
    * MINERVINI_VCP: Boolean gate, universal EPS filters, no sell into strength.
    * MOMENTUM_BREAKOUT / KULLAMAGI_DAILY_ADAPTATION: ADR clamp instead of LOD, daily entry, no EP/PS.
    * CAN_SLIM: partial coverage.
17. **Which can be corrected locally?** The Minervini machine screen (drop universal hard gates, keep the Trend
    Template as a screen and add the manual layer). The Kullamägi daily screen (but not its source entry, which needs
    intraday data).
18. **Which must be rebuilt?**
    * Turtle: done as a separate source engine.
    * Weinstein: three separate paths.
    * Darvas box state machine: once source ids exist.
    * Kullamägi EP and Parabolic Short: new engines.
    * CAN SLIM: new design scope.
19. **Which original methods show positive historical evidence after a clean rebuild?** None can be stated. The
    performance gate stayed closed because the measurement layer is not certified, so no source-faithful method was
    measured (by design: rule 38).
20. **Which methods deserve product priority?** In order:
    * (a) the data/measurement repair (V4-D1, V4-D2), since every method depends on it;
    * (b) Turtle S1/S2 source-faithful, which is ready to measure;
    * (c) the Minervini and Weinstein manual-review products (machine screen plus `MANUAL_REVIEW_REQUIRED` records,
      no BUY);
    * (d) committing the book reconstruction artifacts so that Darvas, Pocket Pivot, Buyable Gap-Up and Holy Grail
      can become source-traceable.
