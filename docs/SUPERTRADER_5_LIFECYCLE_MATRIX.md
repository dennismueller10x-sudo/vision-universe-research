# Supertrader 5.0 – Source-to-Execution-Matrix (Darvas, Kullamägi Breakout, Pocket Pivot, Buyable Gap-Up, Weinstein Investor / Trader, Holy Grail Research-Variante)

Generiert mit `node scripts/supertrader/source-faithful/completion/build-sf5-lifecycle.mjs` aus `research/sf5-lifecycle-matrix.mjs`, `research/sf5-lifecycles.mjs`, den Verträgen und dem #709-Extrakt. Nicht von Hand bearbeiten. Bericht: [SUPERTRADER_5_FULL_STRATEGY_ADVANCEMENT_REPORT.md](SUPERTRADER_5_FULL_STRATEGY_ADVANCEMENT_REPORT.md).

Validierung: bestanden. Engine `sf5-lifecycle-engine-1.0.0`, Varianten-Fingerabdruck `0a1260e9d087…`. Verbindlicher Registry-Status bleibt der Regelstatus des Vertrags.

Grundsätze: a mechanically confirmed setup is not an executable trade; a model assumption is not a source rule; a lifecycle run with substituted manual decisions is a model study, not a strategy backtest; the original strategy and the platform research portfolio policy stay separate; a research variant from a source the owner has not accepted never changes a contract status; no live activation, no orders, no broker.

## C03 `SF_DARVAS_BOX` (sf5-darvas-lifecycle-1.0.0)

- Source Fidelity: SOURCE_EXACT 2, SOURCE_DERIVED 4, SOURCE_BOUNDED 0, MODEL_ASSUMPTION 10, MANUAL_REVIEW 4, DATA_BLOCKED 0, SOURCE_BLOCKED 0; Vertrag 1.3.1; Quellenstatus CONTRACT_SOURCES
- Mechanik: MECHANICAL_LIFECYCLE_UNDER_MODEL_ASSUMPTIONS (9/9 operative Phasen ausführbar)
- Daten: blockiert –; quellenblockiert –
- Backtest: MODEL_LIFECYCLE_STUDY (Strategie-Backtest: nein), DIAGNOSTIC_NOT_CERTIFIED; Snapshot-Läufe: 40228392651, 40099831813, 39939890956, 39937731507, 39903861586, 39770019164
- Manuell: 4 Zeilen; in der Simulation ersetzt: DAR-SETUP-SELECTION, DAR-SIZE
- Live: LIVE_NOT_APPROVED, NOT_A_TRADABLE_STRATEGY, performanceClaim NONE

| Phase | Zeile | Bedingung | #709 / Quelle | Vertrag | Klasse | Modellannahmen | Code | Tests | Readiness | fehlt / Anmerkung |
|---|---|---|---|---|---|---|---|---|---|---|
| SETUP_QUALIFICATION | DAR-SETUP-TOP | box top: a new high not reached on the three following sessions; a touch restarts the count | DAR-Q1 (B06 PDF 196; printed 184 (HARD, HIGH)) | DAR-SF-TOP | SOURCE_EXACT |  | `methods/darvas.mjs#createDarvasBoxMachine` | 3 | MECHANICAL_IMPLEMENTED |  |
| SETUP_QUALIFICATION | DAR-SETUP-BOTTOM | box bottom by the reverse three-day procedure after the top; start of the search pre-registered in both readings | DAR-Q2 (B06 PDF 196; printed 184 (HARD, HIGH)) | DAR-SF-BOTTOM, DAR-SF-BOTTOM-START | MODEL_ASSUMPTION | MA-DAR-BOTTOM-START | `research/darvas-lifecycle.mjs#darvasBoxSeries` | 2 | MECHANICAL_UNDER_MODEL_ASSUMPTION | DAR-SF-BOTTOM-START is SOURCE_AMBIGUOUS: the executed rule depends on a declared reading |
| SETUP_QUALIFICATION | DAR-SETUP-ATH | the breakout must be to an all-time high; checked within the available history (snapshot from 2015), unverified records are traded in the simulation | DAR-Q9 (B06 PDF 194; printed 182 (HARD, HIGH)) | DAR-SF-ATH | MODEL_ASSUMPTION | MA-DAR-ATH-AVAILABLE-HISTORY | `research/darvas-lifecycle.mjs#DARVAS_ADAPTER` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION | DAR-Q9 is HARD; the contract sends an unverified all-time high to review, the simulation substitutes that review |
| SETUP_QUALIFICATION | DAR-SETUP-SELECTION | techno-fundamental selection, volume relative to own history, market trend | DAR-Q12, DAR-Q14, DAR-Q10, DAR-Q13 (B06 PDF 206; printed 194 (STRONG_PREFERENCE, HIGH); B06 PDF 210; printed 198 (STRONG_PREFERENCE, HIGH); B06 PDF 200; printed 188 (CONTEXTUAL, HIGH); B06 PDF 207; printed 195 (CONTEXTUAL, HIGH)) | DAR-SF-SELECTION, DAR-SF-VOLUME, DAR-SF-MARKET | MANUAL_REVIEW | MA-DAR-MANUAL-SUBSTITUTE | `research/darvas-lifecycle.mjs#DARVAS_ADAPTER` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION | substituted in the simulation (every ATH box breakout is taken); never substituted in a product record |
| ENTRY_ELIGIBILITY | DAR-EL-NO-WAIT | no waiting after the box is complete: the order is armed at the completing close | DAR-Q3 (B06 PDF 196; printed 184 (HARD, HIGH)) | DAR-SF-NO-WAIT | SOURCE_EXACT |  | `research/darvas-lifecycle.mjs#DARVAS_ADAPTER` | 1 | MECHANICAL_IMPLEMENTED |  |
| ENTRY_ELIGIBILITY | DAR-EL-ORDER-VALIDITY | the resting buy stop is re-armed at every close while the box stands | DAR-B5, DAR-Q4 (B06 PDF 66; printed 54 (STRONG_PREFERENCE, HIGH); B06 PDF 204; printed 192 (HARD, HIGH)) |  | MODEL_ASSUMPTION | MA-DAR-ORDER-VALIDITY | `research/lifecycle-engine.mjs#runResearchLifecycle` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION |  |
| ENTRY_ELIGIBILITY | DAR-EL-UNIVERSE | research population (no Darvas liquidity number) | DAR-Q10 (B06 PDF 200; printed 188 (CONTEXTUAL, HIGH)) | DAR-SF-RESEARCH-POPULATION | MODEL_ASSUMPTION | MA-DAR-RESEARCH-UNIVERSE | `research/lifecycle-engine.mjs#runResearchLifecycle` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION |  |
| ENTRY_ELIGIBILITY | DAR-EL-REENTRY | after a stop-out a later all-time-high box can be bought again | DAR-Q11 (B06 PDF 204; printed 192 (CONTEXTUAL, HIGH)) | DAR-SF-REENTRY | MODEL_ASSUMPTION | MA-DAR-REENTRY | `research/lifecycle-engine.mjs#runResearchLifecycle` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION |  |
| ENTRY_EXECUTION | DAR-EX-BUY-STOP | buy stop a fraction (one raw cent) above the top; fill max(open, trigger) | DAR-Q4, DAR-B5 (B06 PDF 204; printed 192 (HARD, HIGH); B06 PDF 66; printed 54 (STRONG_PREFERENCE, HIGH)) | DAR-SF-ENTRY | SOURCE_DERIVED | MA-DAR-FRACTION | `research/lifecycle-engine.mjs#fillOrder` | 2 | MECHANICAL_IMPLEMENTED |  |
| ENTRY_EXECUTION | DAR-EX-COSTS | slippage and commission |  |  | MODEL_ASSUMPTION | MA-DAR-COSTS | `research/lifecycle-engine.mjs#runResearchLifecycle` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION |  |
| INITIAL_STOP | DAR-STOP-INIT | stop placed with the buy, a fraction below the broken top, never inside the box | DAR-B6, DAR-Q5, DAR-Q7 (B06 PDF 68; printed 56 (HARD, HIGH); B06 PDF 200; printed 188 (HARD, HIGH); B06 PDF 205; printed 193 (HARD, HIGH)) | DAR-SF-PROTECT, DAR-SF-STOP-INIT | SOURCE_DERIVED |  | `research/darvas-lifecycle.mjs#DARVAS_ADAPTER` | 1 | MECHANICAL_IMPLEMENTED |  |
| INITIAL_STOP | DAR-STOP-ENTRY-BAR | a low at or below the stop on the trigger bar: pessimistic by default | DAR-Q5 (B06 PDF 200; printed 188 (HARD, HIGH)) | DAR-SF-STOP-INIT | MODEL_ASSUMPTION | MA-DAR-INTRABAR-ORDER | `research/lifecycle-engine.mjs#runResearchLifecycle` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION |  |
| POSITION_SIZING | DAR-SIZE | position size and pilot buys | DAR-B15, DAR-B18 (B06 PDF 113; printed 101 (OPTIONAL, HIGH); B06 PDF 137; printed 125 (CONTEXTUAL, HIGH)) | DAR-SF-SIZING | MANUAL_REVIEW | MA-DAR-SIZING | `research/lifecycle-engine.mjs#plannedShares` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION | reviewer decision in the source; the reference weight is a comparison convention, results are reported as the span of all sizing variants (owner decision 2026-10-23) |
| POSITION_MANAGEMENT | DAR-MGMT-RAISE | stop raised a fraction below the bottom of every later completed box, from the next session, never lowered | DAR-Q6, DAR-Q8 (B06 PDF 202; printed 190 (HARD, HIGH); B06 PDF 209; printed 197 (HARD, HIGH)) | DAR-SF-STOP-RAISE | SOURCE_DERIVED |  | `research/darvas-lifecycle.mjs#DARVAS_ADAPTER` | 2 | MECHANICAL_IMPLEMENTED |  |
| POSITION_MANAGEMENT | DAR-MGMT-PYRAMID | further buys while the confirmed up-trend continues | DAR-B8 (B06 PDF 71; printed 59 (CONTEXTUAL, HIGH)) | DAR-SF-PYRAMID | MANUAL_REVIEW |  | – | 0 | MANUAL_NOT_AUTOMATED | not modelled (manual) |
| EXIT_CONDITIONS | DAR-EXIT-STOP-ONLY | no profit target; the exit is the stop (stop-market fill min(open, stop)) | DAR-B7 (B06 PDF 70; printed 58 (STRONG_PREFERENCE, HIGH)) | DAR-SF-STOP-RAISE | SOURCE_DERIVED |  | `research/lifecycle-engine.mjs#protectiveHit` | 2 | MECHANICAL_IMPLEMENTED |  |
| TRADE_ACCOUNTING | DAR-ACC-RESEARCH-V1 | research-v1: orders only on real source bars, dividends on held shares, stale limit, economic delisting, ledger replay reconciliation |  |  | MODEL_ASSUMPTION | MA-DAR-COSTS | `research/lifecycle-engine.mjs#runResearchLifecycle` | 2 | MECHANICAL_UNDER_MODEL_ASSUMPTION | platform accounting, not a method rule |
| TRADE_ACCOUNTING | DAR-ACC-PORTFOLIO-POLICY | platform research portfolio policy: cash only, 100 000 start, 20 open positions, 25 % weight cap, neutral date-seeded fill order |  |  | MODEL_ASSUMPTION | MA-DAR-COSTS | `research/lifecycle-engine.mjs#plannedShares` | 2 | MECHANICAL_UNDER_MODEL_ASSUMPTION | separate from the original strategy |
| BACKTEST_DIAGNOSTICS | DAR-DIAG-DETERMINISM | deterministic, prefix-stable (no lookahead) lifecycle; public counts, sealed metrics |  |  | MODEL_ASSUMPTION | MA-DAR-MANUAL-SUBSTITUTE | `research/run-sf5-lifecycle.mjs#lifecyclePart` | 2 | MECHANICAL_UNDER_MODEL_ASSUMPTION | MODEL_LIFECYCLE_STUDY_NOT_A_STRATEGY_BACKTEST, DIAGNOSTIC_NOT_CERTIFIED |
| STRATEGY_READINESS | DAR-READINESS | readiness in six dimensions; LIVE_NOT_APPROVED, NOT_A_TRADABLE_STRATEGY, performanceClaim NONE |  |  | MANUAL_REVIEW |  | – | 0 | MANUAL_NOT_AUTOMATED | assessment, not a trading phase |

### Modellannahmen

| ID | Phase | Referenz | Alternativen | Begründung |
|---|---|---|---|---|
| MA-DAR-MANUAL-SUBSTITUTE | ENTRY_ELIGIBILITY | ACCEPT_AS_MODEL_ASSUMPTION (simulation only): every all-time-high box breakout of the research universe is taken |  | selection (DAR-Q12/Q14, B9-B11), volume (DAR-Q10, B3) and market (DAR-Q13, B14) are the reviewer's; a simulation runs only with them substituted, so it is a model study. Product records stay MANUAL_REVIEW_REQUIRED. |
| MA-DAR-BOTTOM-START | SETUP_QUALIFICATION | AFTER_TOP_DAY (contract default of DAR-SF-BOTTOM-START) | AFTER_TOP_CONFIRMED | start of the bottom search is SOURCE_AMBIGUOUS in #709 (VU-DAR UNRESOLVED); the DAR-Q2 wording (bottom only after the top is established) leans toward AFTER_TOP_CONFIRMED, the contract default keeps already traded lows; both readings are pre-registered |
| MA-DAR-ATH-AVAILABLE-HISTORY | SETUP_QUALIFICATION | the all-time high (DAR-Q9) is checked against the available split-adjusted history; records flagged ALL_TIME_HIGH_IN_AVAILABLE_HISTORY_UNVERIFIED are traded |  | the snapshot starts at the 2015 warm-up, not at the listing date; the contract sends such records to review, the simulation substitutes that review. No listing-date field exists in the snapshot to pre-register a verified-only alternative |
| MA-DAR-FRACTION | ENTRY_EXECUTION | one raw cent in the split-adjusted basis of the arming bar (DAR-SF-ENTRY convention) |  | "a fraction" is not quantified (DAR-Q4/Q5); the reviewer may set another fraction per trade (DAR-MR-FRACTION). The level and the stop of an order use the fraction of the bar whose close armed it; the component study uses the fill bar: identical except across a split between the two sessions |
| MA-DAR-ORDER-VALIDITY | ENTRY_ELIGIBILITY | the buy stop is valid for the next session only and is re-armed at every close while the box stands |  | a resting order is the source (DAR-B5, DAR-Q4); daily re-arming reproduces it without a lifetime number |
| MA-DAR-INTRABAR-ORDER | INITIAL_STOP | PESSIMISTIC (research reference, owner decision 2026-10-23): an intraday trigger fill with a low at or below the stop on the same bar exits at the stop | OPTIMISTIC | a daily bar does not show the order of the trigger and the low; the contract derivation of DAR-SF-STOP-INIT is pessimistic |
| MA-DAR-REENTRY | ENTRY_ELIGIBILITY | after a stop-out a later all-time-high box breakout is taken again (DAR-Q11 reading, as the component study) |  | DAR-Q11 (CONTEXTUAL): new all-time highs can allow a re-entry; the decision is the reviewer's (DAR-SF-REENTRY) |
| MA-DAR-SIZING | POSITION_SIZING | WEIGHT 0.10 of equity per position: a platform comparison convention, NOT a Darvas rule; results are reported as the span of all sizing variants (owner decision 2026-10-23) | WEIGHT 0.05; WEIGHT 0.20; RISK 0.01 to the initial stop | no Darvas sizing rule (DAR-SF-SIZING manual; pilot buys DAR-B15 OPTIONAL). The stop one fraction below the top makes risk-based sizing hit the platform weight cap on most fills, so fixed weight is the reference |
| MA-DAR-RESEARCH-UNIVERSE | ENTRY_ELIGIBILITY | VU_TOURNAMENT_UNIVERSE_705 at the session before the fill |  | DAR-SF-RESEARCH-POPULATION: measurement convention, not a Darvas rule (DAR-Q10: no general minimum) |
| MA-DAR-COSTS | ENTRY_EXECUTION | 10 bps slippage per side, 1 bp commission (platform policy) |  | no costs in the source; identical to the Turtle and Minervini research runs |

### Vorregistrierte Research-Varianten (nicht aktiviert, nicht nach Ergebnis gewählt)

| ID | Änderung gegenüber REF |
|---|---|
| REF | {} |
| ALT-BOTTOM-AFTER-TOP-CONFIRMED | {"bottomSearchStart":"AFTER_TOP_CONFIRMED"} |
| ALT-INTRABAR-OPTIMISTIC | {"intrabarOrder":"OPTIMISTIC"} |
| ALT-SIZE-WEIGHT-005 | {"sizing":{"mode":"WEIGHT","weight":0.05}} |
| ALT-SIZE-WEIGHT-020 | {"sizing":{"mode":"WEIGHT","weight":0.2}} |
| ALT-SIZE-RISK-001 | {"sizing":{"mode":"RISK","riskFraction":0.01}} |

## C08 `SF_KK_BREAKOUT` (sf5-kk-breakout-lifecycle-1.1.0)

- Source Fidelity: SOURCE_EXACT 2, SOURCE_DERIVED 2, SOURCE_BOUNDED 0, MODEL_ASSUMPTION 7, MANUAL_REVIEW 6, DATA_BLOCKED 1, SOURCE_BLOCKED 0; Vertrag 1.2.1; Quellenstatus CONTRACT_SOURCES
- Mechanik: MECHANICAL_LIFECYCLE_UNDER_MODEL_ASSUMPTIONS (9/9 operative Phasen ausführbar)
- Daten: blockiert KK-EX-ORH; quellenblockiert –
- Backtest: MODEL_LIFECYCLE_STUDY (Strategie-Backtest: nein), DIAGNOSTIC_NOT_CERTIFIED; Snapshot-Läufe: 40228392651, 40099831813, 39939890956, 39937731507, 39903861586, 39770019164
- Manuell: 6 Zeilen; in der Simulation ersetzt: KK-SIZE-RISK, KK-MGMT-PARTIAL, KK-EXIT-TRAIL
- Live: LIVE_NOT_APPROVED, NOT_A_TRADABLE_STRATEGY, performanceClaim NONE

| Phase | Zeile | Bedingung | #709 / Quelle | Vertrag | Klasse | Modellannahmen | Code | Tests | Readiness | fehlt / Anmerkung |
|---|---|---|---|---|---|---|---|---|---|---|
| SETUP_QUALIFICATION | KK-SETUP-PROXY | prior move, consolidation length, rising 10 / 20-day MA, breakout level (higher lows and orderly tightening, KK-007, are not modelled) | KK-006, KK-008, KK-009, KK-011 (W-KK3 Breakouts:criteria1 (PREFERENCE, HIGH); W-KK3 Breakouts:criteria3 (CONTEXTUAL, HIGH); W-KK3 Breakouts:criteria3 (STRONG_PREFERENCE, HIGH); W-KK3 HowtoTrade1 (OPTIONAL, HIGH)) | KK-SF-BO-SETUP, KK-SF-BO-ENTRY | MODEL_ASSUMPTION | MA-KK-SETUP-PROXY, MA-KK-MANUAL-SUBSTITUTE | `research/kk-breakout-lifecycle.mjs#kkBreakoutSetupAt` | 2 | MECHANICAL_UNDER_MODEL_ASSUMPTION | KK-MR-SETUP / KK-MR-LEVEL are manual; the proxy uses the printed lower ends as bounds |
| SETUP_QUALIFICATION | KK-SETUP-TIGHTENING | higher lows, orderly tightening | KK-007 (W-KK3 Breakouts:criteria2 (STRONG_PREFERENCE, HIGH)) | KK-SF-BO-SETUP | MANUAL_REVIEW |  | – | 0 | EVIDENCE_FOR_REVIEWER | reported by breakoutEvidence, not part of the simulated proxy |
| SETUP_QUALIFICATION | KK-SETUP-MOMENTUM | top 1-2 % by 1 / 3 / 6-month performance and the review priority | KK-005, KK-048 (W-KK3 Breakouts:steps1–3 (PREFERENCE, HIGH); W-KK3 own reply 2021-04-13 16:07 to enumerated six-factor question (PREFERENCE, HIGH)) | KK-SF-BO-MOMENTUM, KK-SF-PRIORITY | MANUAL_REVIEW |  | – | 0 | EVIDENCE_FOR_REVIEWER | ranking evidence (momentumRanks), never used to select in the simulation |
| ENTRY_ELIGIBILITY | KK-EL-STOP-WIDTH | the stop may not be wider than ADR20: a wider stop rejects the trade, never tightened. Reference (next open): planned loss from the open to the breakout-day low <= ADR20, derived reading; KK-012 exactly only in ALT-ENTRY-BREAKOUT-DAY-CLOSE | KK-012, KK-031 (W-KK3 HowtoTrade2 (HARD, HIGH); W-KKFAQ ADR formula (HARD, HIGH)) | KK-SF-BO-STOP, KK-SF-ADR | SOURCE_DERIVED |  | `research/kk-breakout-lifecycle.mjs#KK_BREAKOUT_ADAPTER` | 3 | MECHANICAL_IMPLEMENTED | owner decision 2026-10-23: next open is the research reference; the deviation from KK-012 is declared |
| ENTRY_ELIGIBILITY | KK-EL-UNIVERSE | liquidity first (no number) | KK-048 (W-KK3 own reply 2021-04-13 16:07 to enumerated six-factor question (PREFERENCE, HIGH)) |  | MODEL_ASSUMPTION | MA-KK-RESEARCH-UNIVERSE | `research/lifecycle-engine.mjs#runResearchLifecycle` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION |  |
| ENTRY_EXECUTION | KK-EX-NEXT-OPEN | daily breakout (written alternative to the ORH), bought at the next tradable open after the completed breakout-day bar (owner decision 2026-10-23) | KK-011 (W-KK3 HowtoTrade1 (OPTIONAL, HIGH)) | KK-SF-BO-ENTRY | MODEL_ASSUMPTION | MA-KK-ENTRY-TIMING | `research/lifecycle-engine.mjs#runResearchLifecycle` | 2 | MECHANICAL_UNDER_MODEL_ASSUMPTION |  |
| ENTRY_EXECUTION | KK-EX-ORH | opening range high entry (1 / 5 / 60 minutes) | KK-010 (W-KK3 HowtoTrade1 (OPTIONAL, HIGH)) | KK-SF-BO-ORH | DATA_BLOCKED |  | – | 0 | BLOCKED | no frozen intraday history |
| ENTRY_EXECUTION | KK-EX-COSTS | slippage and commission |  |  | MODEL_ASSUMPTION | MA-KK-COSTS | `research/lifecycle-engine.mjs#runResearchLifecycle` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION |  |
| INITIAL_STOP | KK-STOP-LOD | initial stop = low of the breakout day (reference, the day before the next-open fill; KK-012 names the low of the entry day, kept exactly in ALT-ENTRY-BREAKOUT-DAY-CLOSE), stop-market | KK-012, KK-027 (W-KK3 HowtoTrade2 (HARD, HIGH); W-KKFAQ stopmarket question (HARD, HIGH)) | KK-SF-BO-STOP, KK-SF-STOPMARKET | SOURCE_DERIVED |  | `research/lifecycle-engine.mjs#protectiveHit` | 3 | MECHANICAL_IMPLEMENTED |  |
| POSITION_SIZING | KK-SIZE-CAP | never more than 30 % of equity in one stock overnight | KK-001 (W-KK3 opening risk note (HARD, HIGH)) | KK-SF-CAP | SOURCE_EXACT |  | `research/lifecycle-engine.mjs#plannedShares` | 2 | MECHANICAL_IMPLEMENTED | the platform cap (25 %) is stricter and applies |
| POSITION_SIZING | KK-SIZE-RISK | risk per trade inside the printed context ranges | KK-003, KK-025, KK-002, KK-026 (W-KK3 risk note (CONTEXTUAL, HIGH); W-KKFAQ Howmuchrisk (CONTEXTUAL, HIGH); W-KKFAQ position size (CONTEXTUAL, HIGH)) | KK-SF-SIZE | MANUAL_REVIEW | MA-KK-RISK-FRACTION | `research/lifecycle-engine.mjs#plannedShares` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION |  |
| POSITION_MANAGEMENT | KK-MGMT-PARTIAL | after 3-5 days sell 1/3-1/2, rest to break-even | KK-013 (W-KK3 HowtoTrade3 (PREFERENCE, HIGH)) | KK-SF-BO-PARTIAL | MANUAL_REVIEW | MA-KK-EXIT-POLICY | `research/kk-breakout-lifecycle.mjs#KK_BREAKOUT_ADAPTER` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION | printed ranges; the reference uses day 3 and 1/3, alternatives pre-registered |
| EXIT_CONDITIONS | KK-EXIT-TRAIL | trail the rest with the 10 / 20-day MA; beginners: first close below the 10-day MA | KK-014 (W-KK3 HowtoTrade3 (PREFERENCE, HIGH)) | KK-SF-BO-TRAIL | MANUAL_REVIEW | MA-KK-EXIT-POLICY | `research/kk-breakout-lifecycle.mjs#KK_BREAKOUT_ADAPTER` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION |  |
| EXIT_CONDITIONS | KK-EXIT-STOP | stop-market exit at min(open, stop), never skipped | KK-027 (W-KKFAQ stopmarket question (HARD, HIGH)) | KK-SF-STOPMARKET | SOURCE_EXACT |  | `research/lifecycle-engine.mjs#protectiveHit` | 1 | MECHANICAL_IMPLEMENTED |  |
| TRADE_ACCOUNTING | KK-ACC-RESEARCH-V1 | research-v1: orders only on real source bars, dividends on held shares, stale limit, economic delisting, ledger replay reconciliation |  |  | MODEL_ASSUMPTION | MA-KK-COSTS | `research/lifecycle-engine.mjs#runResearchLifecycle` | 2 | MECHANICAL_UNDER_MODEL_ASSUMPTION | platform accounting, not a method rule |
| TRADE_ACCOUNTING | KK-ACC-PORTFOLIO-POLICY | platform research portfolio policy: cash only, 100 000 start, 20 open positions, 25 % weight cap, neutral date-seeded fill order |  |  | MODEL_ASSUMPTION | MA-KK-COSTS | `research/lifecycle-engine.mjs#plannedShares` | 2 | MECHANICAL_UNDER_MODEL_ASSUMPTION | separate from the original strategy |
| BACKTEST_DIAGNOSTICS | KK-DIAG-DETERMINISM | deterministic, prefix-stable (no lookahead) lifecycle; public counts, sealed metrics |  |  | MODEL_ASSUMPTION | MA-KK-MANUAL-SUBSTITUTE | `research/run-sf5-lifecycle.mjs#lifecyclePart` | 2 | MECHANICAL_UNDER_MODEL_ASSUMPTION | MODEL_LIFECYCLE_STUDY_NOT_A_STRATEGY_BACKTEST, DIAGNOSTIC_NOT_CERTIFIED |
| STRATEGY_READINESS | KK-READINESS | readiness in six dimensions; LIVE_NOT_APPROVED, NOT_A_TRADABLE_STRATEGY, performanceClaim NONE |  |  | MANUAL_REVIEW |  | – | 0 | MANUAL_NOT_AUTOMATED | assessment, not a trading phase |

### Modellannahmen

| ID | Phase | Referenz | Alternativen | Begründung |
|---|---|---|---|---|
| MA-KK-MANUAL-SUBSTITUTE | ENTRY_ELIGIBILITY | ACCEPT_AS_MODEL_ASSUMPTION (simulation only) |  | setup quality (KK-MR-SETUP), the breakout level (KK-MR-LEVEL) and the review priority (KK-MR-PRIORITY) are the reviewer's; they are substituted by MA-KK-SETUP-PROXY, so a run is a model study |
| MA-KK-SETUP-PROXY | SETUP_QUALIFICATION | CONSOLIDATION_10: level = highest high of the 10 sessions before the breakout day (2 weeks, KK-008 lower end); prior move >= 30 % from the lowest low of the 63 sessions before the consolidation to its first close (KK-006 lower printed end, 3 months); 10- and 20-day MA rising at the prior close (KK-009; the 5-session slope window is a VU convention, as in breakoutEvidence) | CONSOLIDATION_20 (20 sessions); NO_MA_CONDITION | KK-006..009 are preferences and context; the printed lower ends are used as bounds of a declared proxy, never as Kullamaegi gates |
| MA-KK-ENTRY-TIMING | ENTRY_EXECUTION | NEXT_OPEN (owner decision 2026-10-23, strictly PIT): bought at the next open after the breakout-day close; stop = breakout-day low; not executed when the open lies more than ADR20 above the stop or at / below it (derived reading of KK-012, not KK-012 literally) | BREAKOUT_DAY_CLOSE (former reference, CLOSE_DECISION_USES_FINAL_BAR): bought at the breakout-day close; KK-012 evaluated exactly with the final low of day | KK-011 allows the daily breakout entry; the contract timing is the breakout-day close. The close decision uses the final close and low (an order in the closing auction is placed minutes before); the next-open alternative uses the prior close only and measures the sensitivity to that assumption |
| MA-KK-EXIT-POLICY | POSITION_MANAGEMENT | PARTIAL3_THIRD_BE_MA10: at the close of the 3rd session after the entry day, if the close is above the entry: sell 1/3 at the next open and raise the stop to break-even; the rest (from the partial-sale day on) exits at the next open after the first close below the 10-day MA (beginner rule KK-014); before that day only the low-of-day stop exits | PARTIAL5_HALF_BE_MA10; PARTIAL3_THIRD_BE_MA20; NO_PARTIAL_MA10 (trail from the entry); PARTIAL3_THIRD_BE_MA10_TRAIL_FROM_ENTRY | KK-013 / KK-014 are preferences with printed ranges; the reference takes the earliest printed day and the smallest printed fraction; the profit condition prevents a break-even stop above the price |
| MA-KK-RISK-FRACTION | POSITION_SIZING | RISK 0.005 of equity to the low-of-day stop | RISK 0.0025; RISK 0.01 | 0.5 % lies inside both printed context ranges (KK-003 0.25-1 %, KK-025 0.3-0.5 %); the ends are the alternatives |
| MA-KK-RESEARCH-UNIVERSE | ENTRY_ELIGIBILITY | VU_TOURNAMENT_UNIVERSE_705 at the session before the fill |  | liquidity is reviewed first (KK-048) without a number; the shared research universe is a measurement convention |
| MA-KK-COSTS | ENTRY_EXECUTION | 10 bps slippage per side, 1 bp commission (platform policy) |  | no costs in the source |

### Vorregistrierte Research-Varianten (nicht aktiviert, nicht nach Ergebnis gewählt)

| ID | Änderung gegenüber REF |
|---|---|
| REF | {} |
| ALT-SETUP-CONSOLIDATION-20 | {"setupProxy":"CONSOLIDATION_20"} |
| ALT-SETUP-NO-MA | {"setupProxy":"NO_MA_CONDITION"} |
| ALT-ENTRY-BREAKOUT-DAY-CLOSE | {"entryTiming":"BREAKOUT_DAY_CLOSE"} |
| ALT-EXIT-PARTIAL5-HALF | {"exitPolicy":"PARTIAL5_HALF_BE_MA10"} |
| ALT-EXIT-TRAIL-MA20 | {"exitPolicy":"PARTIAL3_THIRD_BE_MA20"} |
| ALT-EXIT-NO-PARTIAL | {"exitPolicy":"NO_PARTIAL_MA10"} |
| ALT-EXIT-TRAIL-FROM-ENTRY | {"exitPolicy":"PARTIAL3_THIRD_BE_MA10_TRAIL_FROM_ENTRY"} |
| ALT-RISK-00025 | {"sizing":{"mode":"RISK","riskFraction":0.0025}} |
| ALT-RISK-001 | {"sizing":{"mode":"RISK","riskFraction":0.01}} |

## C11 `SF_MOKA_POCKET_PIVOT` (sf5-moka-lifecycle-1.0.0)

- Source Fidelity: SOURCE_EXACT 0, SOURCE_DERIVED 1, SOURCE_BOUNDED 0, MODEL_ASSUMPTION 6, MANUAL_REVIEW 5, DATA_BLOCKED 1, SOURCE_BLOCKED 1; Vertrag 1.3.0; Quellenstatus CONTRACT_SOURCES
- Mechanik: INCOMPLETE_LIFECYCLE (8/9 operative Phasen ausführbar)
- Daten: blockiert PP-EX-INTRADAY; quellenblockiert PP-STOP
- Backtest: MODEL_LIFECYCLE_STUDY (Strategie-Backtest: nein), DIAGNOSTIC_NOT_CERTIFIED; Snapshot-Läufe: 40228392651, 40099831813, 39939890956, 39937731507, 39903861586, 39770019164
- Manuell: 5 Zeilen; in der Simulation ersetzt: PP-SETUP-CONTEXT, PP-SIZE, PP-MGMT-GUIDE
- Live: LIVE_NOT_APPROVED, NOT_A_TRADABLE_STRATEGY, performanceClaim NONE

| Phase | Zeile | Bedingung | #709 / Quelle | Vertrag | Klasse | Modellannahmen | Code | Tests | Readiness | fehlt / Anmerkung |
|---|---|---|---|---|---|---|---|---|---|---|
| SETUP_QUALIFICATION | PP-SETUP-SIGNATURE | up-day volume greater than the highest down-day volume of the ten prior sessions | MOKAPP-003 (W-MOKAPP rule3 (HARD, HIGH)) | MOKA-SF-PP-VOLUME, MOKA-SF-PP-UPDAY, MOKA-SF-PP-DOWNDAY | SOURCE_DERIVED |  | `research/moka-lifecycle.mjs#pocketPivotSignal` | 2 | MECHANICAL_IMPLEMENTED | MOKA-SF-PP-VOLUME SOURCE_EXACT; up / down day SOURCE_DERIVED |
| SETUP_QUALIFICATION | PP-SETUP-CONTEXT | constructive base, theme, critical MA, not extended | MOKAPP-001, MOKAPP-002, MOKAPP-007, MOKAPP-010 (W-MOKAPP rule1 (STRONG_PREFERENCE, HIGH); W-MOKAPP rule2 (PREFERENCE, HIGH); W-MOKAPP rule7 (CONTEXTUAL, HIGH); W-MOKAPP rule10 (STRONG_PREFERENCE, HIGH)) | MOKA-SF-PP-CONTEXT | MANUAL_REVIEW | MA-MOKA-CONTEXT-PROXY, MA-MOKA-MANUAL-SUBSTITUTE | `research/moka-lifecycle.mjs#pocketPivotSignal` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION |  |
| ENTRY_ELIGIBILITY | PP-EL-UNIVERSE | research population |  |  | MODEL_ASSUMPTION | MA-MOKA-RESEARCH-UNIVERSE | `research/lifecycle-engine.mjs#runResearchLifecycle` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION |  |
| ENTRY_EXECUTION | PP-EX-NEXT-OPEN | buy at the next open after the signal close (full-day volume known) |  |  | MODEL_ASSUMPTION | MA-MOKA-ENTRY-TIMING | `research/lifecycle-engine.mjs#fillOrder` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION |  |
| ENTRY_EXECUTION | PP-EX-INTRADAY | intraday buy on projected volume |  |  | DATA_BLOCKED |  | – | 0 | BLOCKED | no intraday history; the authors' own entry |
| INITIAL_STOP | PP-STOP | numeric stop | MOKAPP-004 (W-MOKAPP rule4/5 (CONTEXTUAL, HIGH)) | MOKA-SF-PP-STOP | SOURCE_BLOCKED |  | – | 0 | MANUAL_NOT_AUTOMATED | no numeric stop in the Pocket Pivot sources; none invented (the sell guide is the only exit) |
| POSITION_SIZING | PP-SIZE | position size | MOKAPP-002 (W-MOKAPP rule2 (PREFERENCE, HIGH)) | MOKA-SF-PP-SIZE | MANUAL_REVIEW | MA-MOKA-SIZING | `research/lifecycle-engine.mjs#plannedShares` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION |  |
| POSITION_MANAGEMENT | PP-MGMT-GUIDE | sell guide: 10DMA after >= 7 weeks of respect, otherwise 50DMA | MOKA12-008, MOKASTOP-001 (W-MOKA12 PDF50 (PREFERENCE, HIGH); W-MOKASTOP paragraph2/3 (PREFERENCE, HIGH)) | MOKA-SF-EXIT-MA, MOKA-SF-EXIT-GUIDE-EVIDENCE | MANUAL_REVIEW | MA-MOKA-SELL-GUIDE | `research/moka-lifecycle.mjs#sellGuideSeries` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION |  |
| EXIT_CONDITIONS | PP-EXIT-VIOLATION | MA violation: close below the guide MA, then a lower low (next day vs later days) | MOKA12-009, MOKASTOP-002 (W-MOKA12 PDF50 (CONTEXTUAL, HIGH); W-MOKASTOP paragraph2 (CONTEXTUAL, HIGH)) | MOKA-SF-EXIT-VIOLATION | MODEL_ASSUMPTION | MA-MOKA-VIOLATION-READING | `research/lifecycle-engine.mjs#protectiveHit` | 2 | MECHANICAL_UNDER_MODEL_ASSUMPTION | SOURCE_AMBIGUOUS (MOKA-C2); both readings pre-registered |
| EXIT_CONDITIONS | PP-EXIT-CONTEXT | weak market, partial vs full exit, laggards | MOKASTOP-003, MOKASTOP-004, MOKASTOP-005 (W-MOKASTOP paragraph3 (CONTEXTUAL, HIGH); W-MOKASTOP paragraph4 (CONTEXTUAL, HIGH)) | MOKA-SF-EXIT-CONTEXT | MANUAL_REVIEW |  | – | 0 | MANUAL_NOT_AUTOMATED | reviewer decisions; the simulation sells all at the violation |
| TRADE_ACCOUNTING | PP-ACC-RESEARCH-V1 | research-v1: orders only on real source bars, dividends on held shares, stale limit, economic delisting, ledger replay reconciliation |  |  | MODEL_ASSUMPTION | MA-MOKA-COSTS | `research/lifecycle-engine.mjs#runResearchLifecycle` | 2 | MECHANICAL_UNDER_MODEL_ASSUMPTION | platform accounting, not a method rule |
| TRADE_ACCOUNTING | PP-ACC-PORTFOLIO-POLICY | platform research portfolio policy: cash only, 100 000 start, 20 open positions, 25 % weight cap, neutral date-seeded fill order |  |  | MODEL_ASSUMPTION | MA-MOKA-COSTS | `research/lifecycle-engine.mjs#plannedShares` | 2 | MECHANICAL_UNDER_MODEL_ASSUMPTION | separate from the original strategy |
| BACKTEST_DIAGNOSTICS | PP-DIAG-DETERMINISM | deterministic, prefix-stable (no lookahead) lifecycle; public counts, sealed metrics |  |  | MODEL_ASSUMPTION | MA-MOKA-MANUAL-SUBSTITUTE | `research/run-sf5-lifecycle.mjs#lifecyclePart` | 2 | MECHANICAL_UNDER_MODEL_ASSUMPTION | MODEL_LIFECYCLE_STUDY_NOT_A_STRATEGY_BACKTEST, DIAGNOSTIC_NOT_CERTIFIED |
| STRATEGY_READINESS | PP-READINESS | readiness in six dimensions; LIVE_NOT_APPROVED, NOT_A_TRADABLE_STRATEGY, performanceClaim NONE |  |  | MANUAL_REVIEW |  | – | 0 | MANUAL_NOT_AUTOMATED | assessment, not a trading phase |

### Modellannahmen

| ID | Phase | Referenz | Alternativen | Begründung |
|---|---|---|---|---|
| MA-MOKA-MANUAL-SUBSTITUTE | ENTRY_ELIGIBILITY | ACCEPT_AS_MODEL_ASSUMPTION (simulation only) |  | base, theme, extension (MOKA-MR-BASE / -THEME / -EXT) and leadership, megacap exception, volume window (MOKA-MR-LEAD / -MEGA / -VOLWINDOW) are the reviewer's; a run is a model study |
| MA-MOKA-CONTEXT-PROXY | SETUP_QUALIFICATION | Pocket Pivot: close of the signal day above its 50-day MA (MOKAPP-007 "avoid below the critical MA"); BGU: close before the gap day above its 50-day MA (MOKA12-006 uptrend) | NONE | context is a preference; #709 names "the critical MA" (MOKAPP-007) and an uptrend (MOKA12-006) without a period: the 50-day MA is a VU choice (the authors' sell guide uses the 10 / 50-day MAs, MOKA12-008); the 200-day support exception of MOKAPP-007 is not modelled |
| MA-MOKA-ENTRY-TIMING | ENTRY_EXECUTION | NEXT_OPEN after the signal close (full-day volume known) |  | the authors buy intraday on projected volume (DATA_BLOCKED); a signal-close fill would use the day's final volume before it is known |
| MA-MOKA-VIOLATION-READING | EXIT_CONDITIONS | LATER_DAYS (FAQ, MOKASTOP-002): the highest low of the closes below the guide MA since the entry stays the trigger until undercut | NEXT_DAY (2012 slide, MOKA12-009): only the session after a close below the MA can confirm | MOKA-C2 conflict kept open (MOKA-SF-EXIT-VIOLATION SOURCE_AMBIGUOUS); the dedicated selling source is the reference |
| MA-MOKA-SELL-GUIDE | POSITION_MANAGEMENT | guide = 10DMA when it was respected for >= 35 sessions (7 weeks x 5) under the same violation reading, else 50DMA, re-evaluated at every close (sellGuideEvidence); the whole position is sold at the undercut (stop-market at the violation-day low) |  | MOKA12-008 / MOKASTOP-001 PREFERENCE; full vs half (MOKASTOP-004) is a reviewer decision |
| MA-MOKA-SIZING | POSITION_SIZING | Pocket Pivot: WEIGHT 0.10 (no price stop to size against); BGU: RISK 0.01 to the gap-day low | PP WEIGHT 0.05 / 0.20; BGU RISK 0.005 / 0.02 | sizing is not specified in #709 (MOKA-SF-PP-SIZE, MOKA-SF-BGU-SIZE manual) |
| MA-MOKA-RESEARCH-UNIVERSE | ENTRY_ELIGIBILITY | VU_TOURNAMENT_UNIVERSE_705 at the signal session |  | measurement convention shared by every method |
| MA-MOKA-COSTS | ENTRY_EXECUTION | 10 bps slippage per side, 1 bp commission (platform policy) |  | no costs in the sources |

### Vorregistrierte Research-Varianten (nicht aktiviert, nicht nach Ergebnis gewählt)

| ID | Änderung gegenüber REF |
|---|---|
| REF | {} |
| ALT-CONTEXT-NONE | {"contextProxy":"NONE"} |
| ALT-VIOLATION-NEXT-DAY | {"violationReading":"NEXT_DAY"} |
| ALT-SIZE-WEIGHT-005 | {"sizing":{"mode":"WEIGHT","weight":0.05}} |
| ALT-SIZE-WEIGHT-020 | {"sizing":{"mode":"WEIGHT","weight":0.2}} |

## C12 `SF_MOKA_BUYABLE_GAP_UP` (sf5-moka-lifecycle-1.0.0)

- Source Fidelity: SOURCE_EXACT 0, SOURCE_DERIVED 1, SOURCE_BOUNDED 0, MODEL_ASSUMPTION 7, MANUAL_REVIEW 7, DATA_BLOCKED 1, SOURCE_BLOCKED 0; Vertrag 1.3.0; Quellenstatus CONTRACT_SOURCES
- Mechanik: MECHANICAL_LIFECYCLE_UNDER_MODEL_ASSUMPTIONS (9/9 operative Phasen ausführbar)
- Daten: blockiert BGU-EX-INTRADAY; quellenblockiert –
- Backtest: MODEL_LIFECYCLE_STUDY (Strategie-Backtest: nein), DIAGNOSTIC_NOT_CERTIFIED; Snapshot-Läufe: 40228392651, 40099831813, 39939890956, 39937731507, 39903861586, 39770019164
- Manuell: 7 Zeilen; in der Simulation ersetzt: BGU-SETUP-CONTEXT, BGU-STOP-GAPLOW, BGU-SIZE, BGU-MGMT-GUIDE
- Live: LIVE_NOT_APPROVED, NOT_A_TRADABLE_STRATEGY, performanceClaim NONE

| Phase | Zeile | Bedingung | #709 / Quelle | Vertrag | Klasse | Modellannahmen | Code | Tests | Readiness | fehlt / Anmerkung |
|---|---|---|---|---|---|---|---|---|---|---|
| SETUP_QUALIFICATION | BGU-SETUP-GAP | gap >= 0.75 x ATR40 | MOKA12-004 (W-MOKA12 PDF35 (HARD, HIGH)) | MOKA-SF-BGU-GAP, MOKA-SF-BGU-GAP-MEASURE | SOURCE_DERIVED |  | `research/moka-lifecycle.mjs#buyableGapUpSignal` | 2 | MECHANICAL_IMPLEMENTED |  |
| SETUP_QUALIFICATION | BGU-SETUP-VOLUME | standard volume 150 % of the average (window not recorded) | MOKA24-VOL (W-MOKAV24 MCDparagraph (HARD, HIGH)) | MOKA-SF-BGU-VOLUME, MOKA-SF-BGU-VOLWINDOW | MODEL_ASSUMPTION | MA-MOKA-BGU-VOLWINDOW | `research/moka-lifecycle.mjs#buyableGapUpSignal` | 2 | MECHANICAL_UNDER_MODEL_ASSUMPTION | 1.5x SOURCE_EXACT; the 50-session window is a declared research model convention (owner decision 2026-10-23), the source rule stays SOURCE_AMBIGUOUS |
| SETUP_QUALIFICATION | BGU-SETUP-EXCEPTION | megacap exception below the standard volume | MOKA24-MEGA (W-MOKAV24 MCDparagraph (CONTEXTUAL, HIGH)) | MOKA-SF-BGU-MEGA | MANUAL_REVIEW |  | – | 0 | MANUAL_NOT_AUTOMATED | exception records are never simulated |
| SETUP_QUALIFICATION | BGU-SETUP-CONTEXT | leadership / theme, uptrend or constructive consolidation | MOKA12-003, MOKA12-006 (W-MOKA12 PDF35 (PREFERENCE, HIGH); W-MOKA12 PDF35 (STRONG_PREFERENCE, HIGH)) | MOKA-SF-BGU-CONTEXT | MANUAL_REVIEW | MA-MOKA-CONTEXT-PROXY, MA-MOKA-MANUAL-SUBSTITUTE | `research/moka-lifecycle.mjs#buyableGapUpSignal` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION |  |
| ENTRY_ELIGIBILITY | BGU-EL-UNIVERSE | research population |  |  | MODEL_ASSUMPTION | MA-MOKA-RESEARCH-UNIVERSE | `research/lifecycle-engine.mjs#runResearchLifecycle` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION |  |
| ENTRY_EXECUTION | BGU-EX-NEXT-OPEN | buy at the next open after the gap-day close; an open at or below the gap-day low is not executed |  |  | MODEL_ASSUMPTION | MA-MOKA-ENTRY-TIMING | `research/lifecycle-engine.mjs#fillOrder` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION |  |
| ENTRY_EXECUTION | BGU-EX-INTRADAY | gap-day buy on projected volume |  |  | DATA_BLOCKED |  | – | 0 | BLOCKED | no intraday history |
| INITIAL_STOP | BGU-STOP-GAPLOW | gap-day low as the risk reference; below it generally sell at least half | MOKA12-007, MOKASTOP-006 (W-MOKA12 PDF35 (STRONG_PREFERENCE, HIGH); W-MOKASTOP paragraph5 (PREFERENCE, HIGH)) | MOKA-SF-BGU-SELLGUIDE | MANUAL_REVIEW | MA-MOKA-BGU-STOP | `research/lifecycle-engine.mjs#protectiveHit` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION | preference; the simulation sells all (inside "at least half") |
| POSITION_SIZING | BGU-SIZE | position size | MOKA12-003 (W-MOKA12 PDF35 (PREFERENCE, HIGH)) | MOKA-SF-BGU-SIZE | MANUAL_REVIEW | MA-MOKA-SIZING | `research/lifecycle-engine.mjs#plannedShares` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION |  |
| POSITION_MANAGEMENT | BGU-MGMT-GUIDE | sell guide: 10DMA after >= 7 weeks of respect, otherwise 50DMA | MOKA12-008, MOKASTOP-001 (W-MOKA12 PDF50 (PREFERENCE, HIGH); W-MOKASTOP paragraph2/3 (PREFERENCE, HIGH)) | MOKA-SF-EXIT-MA, MOKA-SF-EXIT-GUIDE-EVIDENCE | MANUAL_REVIEW | MA-MOKA-SELL-GUIDE | `research/moka-lifecycle.mjs#sellGuideSeries` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION |  |
| EXIT_CONDITIONS | BGU-EXIT-VIOLATION | MA violation: close below the guide MA, then a lower low (next day vs later days) | MOKA12-009, MOKASTOP-002 (W-MOKA12 PDF50 (CONTEXTUAL, HIGH); W-MOKASTOP paragraph2 (CONTEXTUAL, HIGH)) | MOKA-SF-EXIT-VIOLATION | MODEL_ASSUMPTION | MA-MOKA-VIOLATION-READING | `research/lifecycle-engine.mjs#protectiveHit` | 2 | MECHANICAL_UNDER_MODEL_ASSUMPTION | SOURCE_AMBIGUOUS (MOKA-C2); both readings pre-registered |
| EXIT_CONDITIONS | BGU-EXIT-CONTEXT | weak market, partial vs full exit, laggards | MOKASTOP-003, MOKASTOP-004, MOKASTOP-005 (W-MOKASTOP paragraph3 (CONTEXTUAL, HIGH); W-MOKASTOP paragraph4 (CONTEXTUAL, HIGH)) | MOKA-SF-EXIT-CONTEXT | MANUAL_REVIEW |  | – | 0 | MANUAL_NOT_AUTOMATED | reviewer decisions; the simulation sells all at the violation |
| TRADE_ACCOUNTING | BGU-ACC-RESEARCH-V1 | research-v1: orders only on real source bars, dividends on held shares, stale limit, economic delisting, ledger replay reconciliation |  |  | MODEL_ASSUMPTION | MA-MOKA-COSTS | `research/lifecycle-engine.mjs#runResearchLifecycle` | 2 | MECHANICAL_UNDER_MODEL_ASSUMPTION | platform accounting, not a method rule |
| TRADE_ACCOUNTING | BGU-ACC-PORTFOLIO-POLICY | platform research portfolio policy: cash only, 100 000 start, 20 open positions, 25 % weight cap, neutral date-seeded fill order |  |  | MODEL_ASSUMPTION | MA-MOKA-COSTS | `research/lifecycle-engine.mjs#plannedShares` | 2 | MECHANICAL_UNDER_MODEL_ASSUMPTION | separate from the original strategy |
| BACKTEST_DIAGNOSTICS | BGU-DIAG-DETERMINISM | deterministic, prefix-stable (no lookahead) lifecycle; public counts, sealed metrics |  |  | MODEL_ASSUMPTION | MA-MOKA-MANUAL-SUBSTITUTE | `research/run-sf5-lifecycle.mjs#lifecyclePart` | 2 | MECHANICAL_UNDER_MODEL_ASSUMPTION | MODEL_LIFECYCLE_STUDY_NOT_A_STRATEGY_BACKTEST, DIAGNOSTIC_NOT_CERTIFIED |
| STRATEGY_READINESS | BGU-READINESS | readiness in six dimensions; LIVE_NOT_APPROVED, NOT_A_TRADABLE_STRATEGY, performanceClaim NONE |  |  | MANUAL_REVIEW |  | – | 0 | MANUAL_NOT_AUTOMATED | assessment, not a trading phase |

### Modellannahmen

| ID | Phase | Referenz | Alternativen | Begründung |
|---|---|---|---|---|
| MA-MOKA-MANUAL-SUBSTITUTE | ENTRY_ELIGIBILITY | ACCEPT_AS_MODEL_ASSUMPTION (simulation only) |  | base, theme, extension (MOKA-MR-BASE / -THEME / -EXT) and leadership, megacap exception, volume window (MOKA-MR-LEAD / -MEGA / -VOLWINDOW) are the reviewer's; a run is a model study |
| MA-MOKA-CONTEXT-PROXY | SETUP_QUALIFICATION | Pocket Pivot: close of the signal day above its 50-day MA (MOKAPP-007 "avoid below the critical MA"); BGU: close before the gap day above its 50-day MA (MOKA12-006 uptrend) | NONE | context is a preference; #709 names "the critical MA" (MOKAPP-007) and an uptrend (MOKA12-006) without a period: the 50-day MA is a VU choice (the authors' sell guide uses the 10 / 50-day MAs, MOKA12-008); the 200-day support exception of MOKAPP-007 is not modelled |
| MA-MOKA-ENTRY-TIMING | ENTRY_EXECUTION | NEXT_OPEN after the signal close (full-day volume known) |  | the authors buy intraday on projected volume (DATA_BLOCKED); a signal-close fill would use the day's final volume before it is known |
| MA-MOKA-VIOLATION-READING | EXIT_CONDITIONS | LATER_DAYS (FAQ, MOKASTOP-002): the highest low of the closes below the guide MA since the entry stays the trigger until undercut | NEXT_DAY (2012 slide, MOKA12-009): only the session after a close below the MA can confirm | MOKA-C2 conflict kept open (MOKA-SF-EXIT-VIOLATION SOURCE_AMBIGUOUS); the dedicated selling source is the reference |
| MA-MOKA-SELL-GUIDE | POSITION_MANAGEMENT | guide = 10DMA when it was respected for >= 35 sessions (7 weeks x 5) under the same violation reading, else 50DMA, re-evaluated at every close (sellGuideEvidence); the whole position is sold at the undercut (stop-market at the violation-day low) |  | MOKA12-008 / MOKASTOP-001 PREFERENCE; full vs half (MOKASTOP-004) is a reviewer decision |
| MA-MOKA-BGU-STOP | INITIAL_STOP | stop-market at the gap-day low, whole position |  | MOKA12-007 risk reference; MOKASTOP-006 "generally at least half" - selling all lies inside the printed rule |
| MA-MOKA-BGU-VOLWINDOW | SETUP_QUALIFICATION | 1.5x the mean volume of the 50 sessions before the gap day (gapUpAt): declared RESEARCH MODEL CONVENTION confirmed by owner decision 2026-10-23, not an original source rule |  | the averaging window is SOURCE_AMBIGUOUS (MOKA-SF-BGU-VOLWINDOW); only the screen's window is run, so the measurement depends on this choice (owner decision) |
| MA-MOKA-SIZING | POSITION_SIZING | Pocket Pivot: WEIGHT 0.10 (no price stop to size against); BGU: RISK 0.01 to the gap-day low | PP WEIGHT 0.05 / 0.20; BGU RISK 0.005 / 0.02 | sizing is not specified in #709 (MOKA-SF-PP-SIZE, MOKA-SF-BGU-SIZE manual) |
| MA-MOKA-RESEARCH-UNIVERSE | ENTRY_ELIGIBILITY | VU_TOURNAMENT_UNIVERSE_705 at the signal session |  | measurement convention shared by every method |
| MA-MOKA-COSTS | ENTRY_EXECUTION | 10 bps slippage per side, 1 bp commission (platform policy) |  | no costs in the sources |

### Vorregistrierte Research-Varianten (nicht aktiviert, nicht nach Ergebnis gewählt)

| ID | Änderung gegenüber REF |
|---|---|
| REF | {} |
| ALT-CONTEXT-NONE | {"contextProxy":"NONE"} |
| ALT-VIOLATION-NEXT-DAY | {"violationReading":"NEXT_DAY"} |
| ALT-RISK-0005 | {"sizing":{"mode":"RISK","riskFraction":0.005}} |
| ALT-RISK-002 | {"sizing":{"mode":"RISK","riskFraction":0.02}} |

## C04 `SF_WEINSTEIN_INVESTOR` (sf5-weinstein-lifecycle-1.0.0)

- Source Fidelity: SOURCE_EXACT 1, SOURCE_DERIVED 5, SOURCE_BOUNDED 0, MODEL_ASSUMPTION 5, MANUAL_REVIEW 9, DATA_BLOCKED 2, SOURCE_BLOCKED 0; Vertrag 1.2.0; Quellenstatus CONTRACT_SOURCES_WITH_DATA_EXCEPTION
- Mechanik: MECHANICAL_LIFECYCLE_UNDER_MODEL_ASSUMPTIONS (9/9 operative Phasen ausführbar)
- Daten: blockiert WI-EL-GROUP, WI-EL-MARKET; quellenblockiert –
- Backtest: MODEL_LIFECYCLE_STUDY_WITH_DATA_EXCEPTION (Strategie-Backtest: nein), DIAGNOSTIC_NOT_CERTIFIED; Snapshot-Läufe: 40228392651, 40099831813, 39939890956, 39937731507, 39903861586, 39770019164
- Manuell: 9 Zeilen; in der Simulation ersetzt: WI-SETUP-STAGE, WI-EXIT-VOL5, WI-STOP-LEVEL, WI-SIZE, WI-MGMT-TRAIL
- Live: LIVE_NOT_APPROVED, NOT_A_TRADABLE_STRATEGY, performanceClaim NONE

| Phase | Zeile | Bedingung | #709 / Quelle | Vertrag | Klasse | Modellannahmen | Code | Tests | Readiness | fehlt / Anmerkung |
|---|---|---|---|---|---|---|---|---|---|---|
| SETUP_QUALIFICATION | WI-SETUP-BREAKOUT | early Stage 2 breakout above the base resistance (base since the MA30w stopped falling) | WEIN-BUY1, WEIN-BASE (B09 PDF 73; printed 59 (STRONG_PREFERENCE, HIGH); B09 PDF 78; printed 64 (PREFERENCE, HIGH)) | WEIN-SF-INV-BREAKOUT | SOURCE_DERIVED |  | `research/weinstein-lifecycle.mjs#weinsteinWeeklySetups` | 1 | MECHANICAL_IMPLEMENTED |  |
| SETUP_QUALIFICATION | WI-SETUP-WEEKLY | weekly bars and the 30-week MA; a week is decided at its last session | WEIN-S2 (B09 PDF 48; printed 34 (CONTEXTUAL, HIGH)) | WEIN-SF-WEEKLY | SOURCE_DERIVED | MA-WEIN-WEEK-END | `research/weinstein-lifecycle.mjs#weinsteinWeeklySetups` | 1 | MECHANICAL_IMPLEMENTED |  |
| SETUP_QUALIFICATION | WI-SETUP-MA-GATE | no long buy at or below a falling 30-week MA | WEIN-MA (B09 PDF 143; printed 129 (HARD, HIGH)) | WEIN-SF-MA-GATE | SOURCE_DERIVED |  | `research/weinstein-lifecycle.mjs#weinsteinWeeklySetups` | 1 | MECHANICAL_IMPLEMENTED |  |
| SETUP_QUALIFICATION | WI-SETUP-STAGE | stage classification (no Stage 3 / Stage 4 buys), volume judgment, RS (no buy when negative and still poor), overhead resistance | WEIN-S1, WEIN-S2, WEIN-NO3, WEIN-NO4, WEIN-VOL, WEIN-RS, WEIN-RSNO, WEIN-OH (B09 PDF 47; printed 33 (CONTEXTUAL, HIGH); B09 PDF 48; printed 34 (CONTEXTUAL, HIGH); B09 PDF 52; printed 38 (HARD, HIGH); B09 PDF 53; printed 39 (HARD, HIGH); B09 PDF 117; printed 103 (HARD, HIGH); B09 PDF 122; printed 108 (CONTEXTUAL, HIGH); B09 PDF 124; printed 110 (HARD, HIGH)) | WEIN-SF-STAGE, WEIN-SF-VOLUME, WEIN-SF-RS, WEIN-SF-OVERHEAD | MANUAL_REVIEW | MA-WEIN-MANUAL-SUBSTITUTE | `research/weinstein-lifecycle.mjs#weinsteinWeeklySetups` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION |  |
| ENTRY_ELIGIBILITY | WI-EL-GROUP | no long buy in a negative industry group | WEIN-GROUP (B09 PDF 94; printed 80 (HARD, HIGH)) | WEIN-SF-GROUP | DATA_BLOCKED |  | – | 0 | BLOCKED | not applied in the reference run (MA-WEIN-DATA-EXCEPTION); the research variant ALT-SIC3-GROUP-PROXY only shows the owner-approved SIC3 proxy (MA-WEIN-GROUP-PROXY) and never unblocks the rule |
| ENTRY_ELIGIBILITY | WI-EL-MARKET | normal long selection only in a positive overall market | WEIN-MARKET (B09 PDF 143; printed 129 (HARD, HIGH)) | WEIN-SF-MARKET | DATA_BLOCKED |  | – | 0 | BLOCKED | not applied in the run (MA-WEIN-DATA-EXCEPTION) |
| ENTRY_ELIGIBILITY | WI-EL-UNIVERSE | research population |  |  | MODEL_ASSUMPTION | MA-WEIN-RESEARCH-UNIVERSE | `research/lifecycle-engine.mjs#runResearchLifecycle` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION |  |
| ENTRY_EXECUTION | WI-EX-BUY-STOP | breakout buy prepared as a buy stop one raw cent above the resistance, resting through the next week | WEIN-ORD (B09 PDF 79; printed 65 (HARD, HIGH)) | WEIN-SF-ORDER | SOURCE_DERIVED | MA-WEIN-ORDER-WEEK | `research/lifecycle-engine.mjs#fillOrder` | 2 | MECHANICAL_IMPLEMENTED |  |
| ENTRY_EXECUTION | WI-EX-COSTS | slippage and commission |  |  | MODEL_ASSUMPTION | MA-WEIN-COSTS | `research/lifecycle-engine.mjs#runResearchLifecycle` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION |  |
| INITIAL_STOP | WI-STOP-PLAN | the stop is computed before the buy and placed right after it | WEIN-STOP1 (B09 PDF 197; printed 183 (HARD, HIGH)) | WEIN-SF-STOP-PLAN | SOURCE_DERIVED |  | `research/weinstein-lifecycle.mjs#weinsteinWeeklySetups` | 1 | MECHANICAL_IMPLEMENTED |  |
| EXIT_CONDITIONS | WI-EXIT-STAGE4 | no long hold in Stage 4 | WEIN-NO4 (B09 PDF 53; printed 39 (HARD, HIGH)) | WEIN-SF-STAGE | MANUAL_REVIEW |  | – | 0 | MANUAL_NOT_AUTOMATED | stage judgment is manual; only the price stop exits a Stage 4 decline in the simulation |
| POSITION_MANAGEMENT | WI-MGMT-NO-AVG-DOWN | never average down; add only on confirmation | WEIN-AVG (B09 PDF 186; printed 172 (HARD, HIGH)) | WEIN-SF-NO-AVG-DOWN | MANUAL_REVIEW |  | – | 0 | MANUAL_NOT_AUTOMATED | adds are manual; the simulation never adds, so it never averages down |
| EXIT_CONDITIONS | WI-EXIT-VOL5 | buy stop filled without volume confirmation: sell into the first small strength (shared rule of C04 / C05) | WEIN-VOL5 (B09 PDF 251; printed 237 (HARD, HIGH)) | WEIN-SF-VOL5 | MANUAL_REVIEW | MA-WEIN-VOL5-STRENGTH | `research/weinstein-lifecycle.mjs#WEINSTEIN_INVESTOR_ADAPTER` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION | WEIN-VOL5 is HARD in #709; "clear confirmation" and "first small strength" need judgment, so the contract keeps the rule manual |
| EXIT_CONDITIONS | WI-EXIT-NONTECH | no tax, dividend or P/E exit | WEIN-SELL4 (B09 PDF 181; printed 167 (HARD, HIGH)) | WEIN-SF-NONTECH | SOURCE_EXACT |  | `research/lifecycle-engine.mjs#runResearchLifecycle` | 1 | MECHANICAL_IMPLEMENTED | the engine has no non-technical exit |
| INITIAL_STOP | WI-STOP-LEVEL | investor stop below a significant correction low (machine proposal: lowest weekly low of the base) | WEIN-STOP2 (B09 PDF 196; printed 182 (HARD, HIGH)) | WEIN-SF-INV-STOP | MANUAL_REVIEW | MA-WEIN-INITIAL-STOP, MA-WEIN-INTRABAR-ORDER | `research/weinstein-lifecycle.mjs#weinsteinWeeklySetups` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION |  |
| POSITION_SIZING | WI-SIZE | half of the planned position at the breakout, half on a constructive pullback; equal dollar amounts | WEIN-BUY2, WEIN-PB, WEIN-DIVERS2 (B09 PDF 73; printed 59 (STRONG_PREFERENCE, HIGH); B09 PDF 152; printed 138 (STRONG_PREFERENCE, HIGH)) | WEIN-SF-INV-SIZE | MANUAL_REVIEW | MA-WEIN-SIZING | `research/lifecycle-engine.mjs#plannedShares` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION | the pullback half is not bought (manual) |
| POSITION_MANAGEMENT | WI-MGMT-TRAIL | raise the stop after an 8-10 % correction and a return to the prior high, under the low and the rising MA | WEIN-TRAIL1, WEIN-TRAIL2, WEIN-TRAIL4 (B09 PDF 198; printed 184 (CONTEXTUAL, HIGH); B09 PDF 203; printed 189 (CONTEXTUAL, HIGH)) | WEIN-SF-INV-TRAIL | MANUAL_REVIEW | MA-WEIN-TRAIL | `research/weinstein-lifecycle.mjs#WEINSTEIN_INVESTOR_ADAPTER` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION |  |
| POSITION_MANAGEMENT | WI-MGMT-STAGE3 | Stage 3: sell half, protect the rest under new support | WEIN-SELL3, WEIN-TRAIL3 (B09 PDF 50; printed 36 (STRONG_PREFERENCE, HIGH); B09 PDF 199; printed 185 (CONTEXTUAL, HIGH)) | WEIN-SF-INV-TRAIL | MANUAL_REVIEW |  | – | 0 | MANUAL_NOT_AUTOMATED | stage judgment is manual; not modelled |
| TRADE_ACCOUNTING | WI-ACC-RESEARCH-V1 | research-v1: orders only on real source bars, dividends on held shares, stale limit, economic delisting, ledger replay reconciliation |  |  | MODEL_ASSUMPTION | MA-WEIN-COSTS | `research/lifecycle-engine.mjs#runResearchLifecycle` | 2 | MECHANICAL_UNDER_MODEL_ASSUMPTION | platform accounting, not a method rule |
| TRADE_ACCOUNTING | WI-ACC-PORTFOLIO-POLICY | platform research portfolio policy: cash only, 100 000 start, 20 open positions, 25 % weight cap, neutral date-seeded fill order |  |  | MODEL_ASSUMPTION | MA-WEIN-COSTS | `research/lifecycle-engine.mjs#plannedShares` | 2 | MECHANICAL_UNDER_MODEL_ASSUMPTION | separate from the original strategy |
| BACKTEST_DIAGNOSTICS | WI-DIAG-DETERMINISM | deterministic, prefix-stable (no lookahead) lifecycle; public counts, sealed metrics |  |  | MODEL_ASSUMPTION | MA-WEIN-MANUAL-SUBSTITUTE | `research/run-sf5-lifecycle.mjs#lifecyclePart` | 2 | MECHANICAL_UNDER_MODEL_ASSUMPTION | MODEL_LIFECYCLE_STUDY_NOT_A_STRATEGY_BACKTEST, DIAGNOSTIC_NOT_CERTIFIED |
| STRATEGY_READINESS | WI-READINESS | readiness in six dimensions; LIVE_NOT_APPROVED, NOT_A_TRADABLE_STRATEGY, performanceClaim NONE |  |  | MANUAL_REVIEW |  | – | 0 | MANUAL_NOT_AUTOMATED | assessment, not a trading phase |

### Modellannahmen

| ID | Phase | Referenz | Alternativen | Begründung |
|---|---|---|---|---|
| MA-WEIN-MANUAL-SUBSTITUTE | ENTRY_ELIGIBILITY | ACCEPT_AS_MODEL_ASSUMPTION (simulation only): every MA-gated breakout of the screen is taken |  | stage, volume judgment, RS and overhead resistance are the reviewer's (WEIN-MR-*); a run with them substituted is a model study |
| MA-WEIN-DATA-EXCEPTION | ENTRY_ELIGIBILITY | group and market filters NOT applied (DATA_BLOCKED); the run is labelled WITH_DATA_EXCEPTION |  | no point-in-time group stage or NYSE breadth in the snapshot; the SIC proxy and the universe breadth never unblock the rules |
| MA-WEIN-ORDER-WEEK | ENTRY_EXECUTION | the buy stop prepared from the completed week rests for every session of the following week (re-armed daily) and is prepared again from every later completed week while the setup holds, fill max(open, trigger) |  | WEIN-ORD prepares a buy stop; re-preparing it every week while the setup holds is the good-till-cancelled practice of WEIN-GTC (STRONG_PREFERENCE) on weekly decisions |
| MA-WEIN-WEEK-END | SETUP_QUALIFICATION | a week is complete at its last session; whether the next session opens a new ISO week is read from the trading calendar, not from prices |  | weeklyBars marks a week complete when a later bar of the security belongs to another week; the lifecycle takes the weekly decision at that close. Only a security without a bar on the last calendar session of a week (halt) differs: its week is decided at its own last bar |
| MA-WEIN-INITIAL-STOP | INITIAL_STOP | one raw cent below the machine proposal of the screen (Investor: lowest weekly low of the base; Trader: lowest weekly low of the consolidation) | RISK_GUIDE_15: orders whose planned loss exceeds 15 % are not executed (WEIN-STOP4 guide applied without its exceptions for outstanding charts; never a tighter stop, WEIN-STOP2) | WEIN-STOP2 / WEIN-TR-STOP leave the significant low to the reviewer; WEIN-STOP4 is a guide with exceptions, so only an alternative uses it |
| MA-WEIN-INTRABAR-ORDER | INITIAL_STOP | PESSIMISTIC |  | a daily bar does not show the order of the trigger and a low below the stop |
| MA-WEIN-VOL5-STRENGTH | EXIT_CONDITIONS | volume confirmation is judged at the end of the breakout week by the three printed alternatives (volumeAlternatives); with none holding, the first later daily close above the prior close is the "first small strength": exit at the next open | NO_VOL5_EXIT | WEIN-VOL5 is HARD; "clear confirmation" (WEIN-VOL4) and "first small strength" have no numbers |
| MA-WEIN-TRAIL | POSITION_MANAGEMENT | weekly: a correction of the weekly lows from the highest weekly high since entry by >= 8 % (Investor, lower printed end of 8-10 %) / >= 7 % (Trader), followed by a weekly high at or above that high, raises the stop one raw cent under the correction low (Investor: under the lower of the correction low and MA30w) | INVESTOR_10PCT: 10 % (upper printed end) | WEIN-TRAIL1/2 and WEIN-TR-TRAIL are CONTEXTUAL; "return near the prior high" has no number, so the stricter reading (at or above) is used |
| MA-WEIN-SIZING | POSITION_SIZING | equal dollar amounts (WEIN-DIVERS2): planned position 10 % of equity; Investor buys half (5 %) at the breakout and does not add (the pullback half is manual); Trader buys the full 10 % (WEIN-TR-CONT-SIZE) | INVESTOR_FULL_AT_BREAKOUT (10 %) | the amount is the reviewer's; the halves follow WEIN-BUY2 / WEIN-TR-CONT-SIZE |
| MA-WEIN-RESEARCH-UNIVERSE | ENTRY_ELIGIBILITY | VU_TOURNAMENT_UNIVERSE_705 at the session before the fill |  | measurement convention shared by every method |
| MA-WEIN-GROUP-PROXY | ENTRY_ELIGIBILITY | no group filter (MA-WEIN-DATA-EXCEPTION) | SIC3_PROXY_NOT_BELOW_FALLING: skip a buy stop whose SIC3-EW-MIN5-400D-WIDE proxy group closed the completed week before the order week below a falling MA30w; unknown membership or history never blocks | owner decision 2026-10-21: the SIC3 proxy is a clearly labelled research reference, not SOURCE_EXACT and not a trading gate; WEIN-SF-GROUP stays DATA_BLOCKED and the group stage stays the reviewer's (WEIN-RG-GROUP) |
| MA-WEIN-COSTS | ENTRY_EXECUTION | 10 bps slippage per side, 1 bp commission (platform policy) |  | no costs in the source (stop-limit spacing WEIN-LIM is an execution example) |

### Vorregistrierte Research-Varianten (nicht aktiviert, nicht nach Ergebnis gewählt)

| ID | Änderung gegenüber REF |
|---|---|
| REF | {} |
| ALT-NO-VOL5-EXIT | {"vol5":false} |
| ALT-TRAIL-10PCT | {"trailThreshold":0.1} |
| ALT-RISK-GUIDE-15 | {"riskGuide":0.15} |
| ALT-FULL-AT-BREAKOUT | {"sizing":{"mode":"WEIGHT","weight":0.1}} |
| ALT-SIC3-GROUP-PROXY | {"groupProxy":"SIC3-EW-MIN5-400D-WIDE"} |

## C05 `SF_WEINSTEIN_TRADER` (sf5-weinstein-lifecycle-1.0.0)

- Source Fidelity: SOURCE_EXACT 1, SOURCE_DERIVED 5, SOURCE_BOUNDED 0, MODEL_ASSUMPTION 5, MANUAL_REVIEW 9, DATA_BLOCKED 2, SOURCE_BLOCKED 0; Vertrag 1.2.0; Quellenstatus CONTRACT_SOURCES_WITH_DATA_EXCEPTION
- Mechanik: MECHANICAL_LIFECYCLE_UNDER_MODEL_ASSUMPTIONS (9/9 operative Phasen ausführbar)
- Daten: blockiert WT-EL-GROUP, WT-EL-MARKET; quellenblockiert –
- Backtest: MODEL_LIFECYCLE_STUDY_WITH_DATA_EXCEPTION (Strategie-Backtest: nein), DIAGNOSTIC_NOT_CERTIFIED; Snapshot-Läufe: 40228392651, 40099831813, 39939890956, 39937731507, 39903861586, 39770019164
- Manuell: 9 Zeilen; in der Simulation ersetzt: WT-SETUP-STAGE, WT-EXIT-VOL5, WT-STOP-LEVEL, WT-SIZE, WT-MGMT-TRAIL
- Live: LIVE_NOT_APPROVED, NOT_A_TRADABLE_STRATEGY, performanceClaim NONE

| Phase | Zeile | Bedingung | #709 / Quelle | Vertrag | Klasse | Modellannahmen | Code | Tests | Readiness | fehlt / Anmerkung |
|---|---|---|---|---|---|---|---|---|---|---|
| SETUP_QUALIFICATION | WT-SETUP-CONTINUATION | continuation breakout over new resistance after a consolidation near a clearly rising MA30w | WEIN-TR-CONT (B09 PDF 75; printed 61 (STRONG_PREFERENCE, HIGH)) | WEIN-SF-TR-CONT | SOURCE_DERIVED |  | `research/weinstein-lifecycle.mjs#weinsteinWeeklySetups` | 1 | MECHANICAL_IMPLEMENTED |  |
| SETUP_QUALIFICATION | WT-SETUP-WEEKLY | weekly bars and the 30-week MA; a week is decided at its last session | WEIN-S2 (B09 PDF 48; printed 34 (CONTEXTUAL, HIGH)) | WEIN-SF-WEEKLY | SOURCE_DERIVED | MA-WEIN-WEEK-END | `research/weinstein-lifecycle.mjs#weinsteinWeeklySetups` | 1 | MECHANICAL_IMPLEMENTED |  |
| SETUP_QUALIFICATION | WT-SETUP-MA-GATE | no long buy at or below a falling 30-week MA | WEIN-MA (B09 PDF 143; printed 129 (HARD, HIGH)) | WEIN-SF-MA-GATE | SOURCE_DERIVED |  | `research/weinstein-lifecycle.mjs#weinsteinWeeklySetups` | 1 | MECHANICAL_IMPLEMENTED |  |
| SETUP_QUALIFICATION | WT-SETUP-STAGE | stage classification (no Stage 3 / Stage 4 buys), volume judgment, RS (no buy when negative and still poor), overhead resistance | WEIN-S1, WEIN-S2, WEIN-NO3, WEIN-NO4, WEIN-VOL, WEIN-RS, WEIN-RSNO, WEIN-OH (B09 PDF 47; printed 33 (CONTEXTUAL, HIGH); B09 PDF 48; printed 34 (CONTEXTUAL, HIGH); B09 PDF 52; printed 38 (HARD, HIGH); B09 PDF 53; printed 39 (HARD, HIGH); B09 PDF 117; printed 103 (HARD, HIGH); B09 PDF 122; printed 108 (CONTEXTUAL, HIGH); B09 PDF 124; printed 110 (HARD, HIGH)) | WEIN-SF-STAGE, WEIN-SF-VOLUME, WEIN-SF-RS, WEIN-SF-OVERHEAD | MANUAL_REVIEW | MA-WEIN-MANUAL-SUBSTITUTE | `research/weinstein-lifecycle.mjs#weinsteinWeeklySetups` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION |  |
| ENTRY_ELIGIBILITY | WT-EL-GROUP | no long buy in a negative industry group | WEIN-GROUP (B09 PDF 94; printed 80 (HARD, HIGH)) | WEIN-SF-GROUP | DATA_BLOCKED |  | – | 0 | BLOCKED | not applied in the reference run (MA-WEIN-DATA-EXCEPTION); the research variant ALT-SIC3-GROUP-PROXY only shows the owner-approved SIC3 proxy (MA-WEIN-GROUP-PROXY) and never unblocks the rule |
| ENTRY_ELIGIBILITY | WT-EL-MARKET | normal long selection only in a positive overall market | WEIN-MARKET (B09 PDF 143; printed 129 (HARD, HIGH)) | WEIN-SF-MARKET | DATA_BLOCKED |  | – | 0 | BLOCKED | not applied in the run (MA-WEIN-DATA-EXCEPTION) |
| ENTRY_ELIGIBILITY | WT-EL-UNIVERSE | research population |  |  | MODEL_ASSUMPTION | MA-WEIN-RESEARCH-UNIVERSE | `research/lifecycle-engine.mjs#runResearchLifecycle` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION |  |
| ENTRY_EXECUTION | WT-EX-BUY-STOP | breakout buy prepared as a buy stop one raw cent above the resistance, resting through the next week | WEIN-ORD (B09 PDF 79; printed 65 (HARD, HIGH)) | WEIN-SF-ORDER | SOURCE_DERIVED | MA-WEIN-ORDER-WEEK | `research/lifecycle-engine.mjs#fillOrder` | 2 | MECHANICAL_IMPLEMENTED |  |
| ENTRY_EXECUTION | WT-EX-COSTS | slippage and commission |  |  | MODEL_ASSUMPTION | MA-WEIN-COSTS | `research/lifecycle-engine.mjs#runResearchLifecycle` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION |  |
| INITIAL_STOP | WT-STOP-PLAN | the stop is computed before the buy and placed right after it | WEIN-STOP1 (B09 PDF 197; printed 183 (HARD, HIGH)) | WEIN-SF-STOP-PLAN | SOURCE_DERIVED |  | `research/weinstein-lifecycle.mjs#weinsteinWeeklySetups` | 1 | MECHANICAL_IMPLEMENTED |  |
| EXIT_CONDITIONS | WT-EXIT-STAGE4 | no long hold in Stage 4 | WEIN-NO4 (B09 PDF 53; printed 39 (HARD, HIGH)) | WEIN-SF-STAGE | MANUAL_REVIEW |  | – | 0 | MANUAL_NOT_AUTOMATED | stage judgment is manual; only the price stop exits a Stage 4 decline in the simulation |
| POSITION_MANAGEMENT | WT-MGMT-NO-AVG-DOWN | never average down; add only on confirmation | WEIN-AVG (B09 PDF 186; printed 172 (HARD, HIGH)) | WEIN-SF-NO-AVG-DOWN | MANUAL_REVIEW |  | – | 0 | MANUAL_NOT_AUTOMATED | adds are manual; the simulation never adds, so it never averages down |
| EXIT_CONDITIONS | WT-EXIT-VOL5 | buy stop filled without volume confirmation: sell into the first small strength (shared rule of C04 / C05) | WEIN-VOL5 (B09 PDF 251; printed 237 (HARD, HIGH)) |  | MANUAL_REVIEW | MA-WEIN-VOL5-STRENGTH | `research/weinstein-lifecycle.mjs#WEINSTEIN_TRADER_ADAPTER` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION | WEIN-VOL5 is HARD in #709; "clear confirmation" and "first small strength" need judgment, so the contract keeps the rule manual |
| EXIT_CONDITIONS | WT-EXIT-NONTECH | no tax, dividend or P/E exit | WEIN-SELL4 (B09 PDF 181; printed 167 (HARD, HIGH)) | WEIN-SF-NONTECH | SOURCE_EXACT |  | `research/lifecycle-engine.mjs#runResearchLifecycle` | 1 | MECHANICAL_IMPLEMENTED | the engine has no non-technical exit |
| INITIAL_STOP | WT-STOP-LEVEL | trader stop below the next relevant reaction low (machine proposal: consolidation low) | WEIN-TR-STOP (B09 PDF 208; printed 194 (CONTEXTUAL, HIGH)) | WEIN-SF-TR-STOP | MANUAL_REVIEW | MA-WEIN-INITIAL-STOP, MA-WEIN-INTRABAR-ORDER | `research/weinstein-lifecycle.mjs#weinsteinWeeklySetups` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION |  |
| POSITION_SIZING | WT-SIZE | full planned position at the continuation breakout | WEIN-TR-CONT-SIZE (B09 PDF 77; printed 63 (STRONG_PREFERENCE, HIGH)) | WEIN-SF-TR-SIZE | MANUAL_REVIEW | MA-WEIN-SIZING | `research/lifecycle-engine.mjs#plannedShares` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION |  |
| POSITION_MANAGEMENT | WT-MGMT-TRAIL | ignore corrections under 7 %; after a significant correction and recovery raise the stop under the reaction low, also above the MA | WEIN-TR-TRAIL (B09 PDF 209; printed 195 (CONTEXTUAL, HIGH)) | WEIN-SF-TR-TRAIL | MANUAL_REVIEW | MA-WEIN-TRAIL | `research/weinstein-lifecycle.mjs#WEINSTEIN_TRADER_ADAPTER` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION |  |
| EXIT_CONDITIONS | WT-EXIT-EARLY | do not wait for the MA break; exit earlier than investors at a Stage 3 top | WEIN-TR-EARLY, WEIN-TR-SELL3 (B09 PDF 208; printed 194 (STRONG_PREFERENCE, HIGH); B09 PDF 50; printed 36 (STRONG_PREFERENCE, HIGH)) | WEIN-SF-TR-TRAIL | MANUAL_REVIEW |  | – | 0 | MANUAL_NOT_AUTOMATED | stage judgment is manual; the trailed stop is the only mechanical exit |
| TRADE_ACCOUNTING | WT-ACC-RESEARCH-V1 | research-v1: orders only on real source bars, dividends on held shares, stale limit, economic delisting, ledger replay reconciliation |  |  | MODEL_ASSUMPTION | MA-WEIN-COSTS | `research/lifecycle-engine.mjs#runResearchLifecycle` | 2 | MECHANICAL_UNDER_MODEL_ASSUMPTION | platform accounting, not a method rule |
| TRADE_ACCOUNTING | WT-ACC-PORTFOLIO-POLICY | platform research portfolio policy: cash only, 100 000 start, 20 open positions, 25 % weight cap, neutral date-seeded fill order |  |  | MODEL_ASSUMPTION | MA-WEIN-COSTS | `research/lifecycle-engine.mjs#plannedShares` | 2 | MECHANICAL_UNDER_MODEL_ASSUMPTION | separate from the original strategy |
| BACKTEST_DIAGNOSTICS | WT-DIAG-DETERMINISM | deterministic, prefix-stable (no lookahead) lifecycle; public counts, sealed metrics |  |  | MODEL_ASSUMPTION | MA-WEIN-MANUAL-SUBSTITUTE | `research/run-sf5-lifecycle.mjs#lifecyclePart` | 2 | MECHANICAL_UNDER_MODEL_ASSUMPTION | MODEL_LIFECYCLE_STUDY_NOT_A_STRATEGY_BACKTEST, DIAGNOSTIC_NOT_CERTIFIED |
| STRATEGY_READINESS | WT-READINESS | readiness in six dimensions; LIVE_NOT_APPROVED, NOT_A_TRADABLE_STRATEGY, performanceClaim NONE |  |  | MANUAL_REVIEW |  | – | 0 | MANUAL_NOT_AUTOMATED | assessment, not a trading phase |

### Modellannahmen

| ID | Phase | Referenz | Alternativen | Begründung |
|---|---|---|---|---|
| MA-WEIN-MANUAL-SUBSTITUTE | ENTRY_ELIGIBILITY | ACCEPT_AS_MODEL_ASSUMPTION (simulation only): every MA-gated breakout of the screen is taken |  | stage, volume judgment, RS and overhead resistance are the reviewer's (WEIN-MR-*); a run with them substituted is a model study |
| MA-WEIN-DATA-EXCEPTION | ENTRY_ELIGIBILITY | group and market filters NOT applied (DATA_BLOCKED); the run is labelled WITH_DATA_EXCEPTION |  | no point-in-time group stage or NYSE breadth in the snapshot; the SIC proxy and the universe breadth never unblock the rules |
| MA-WEIN-ORDER-WEEK | ENTRY_EXECUTION | the buy stop prepared from the completed week rests for every session of the following week (re-armed daily) and is prepared again from every later completed week while the setup holds, fill max(open, trigger) |  | WEIN-ORD prepares a buy stop; re-preparing it every week while the setup holds is the good-till-cancelled practice of WEIN-GTC (STRONG_PREFERENCE) on weekly decisions |
| MA-WEIN-WEEK-END | SETUP_QUALIFICATION | a week is complete at its last session; whether the next session opens a new ISO week is read from the trading calendar, not from prices |  | weeklyBars marks a week complete when a later bar of the security belongs to another week; the lifecycle takes the weekly decision at that close. Only a security without a bar on the last calendar session of a week (halt) differs: its week is decided at its own last bar |
| MA-WEIN-INITIAL-STOP | INITIAL_STOP | one raw cent below the machine proposal of the screen (Investor: lowest weekly low of the base; Trader: lowest weekly low of the consolidation) | RISK_GUIDE_15: orders whose planned loss exceeds 15 % are not executed (WEIN-STOP4 guide applied without its exceptions for outstanding charts; never a tighter stop, WEIN-STOP2) | WEIN-STOP2 / WEIN-TR-STOP leave the significant low to the reviewer; WEIN-STOP4 is a guide with exceptions, so only an alternative uses it |
| MA-WEIN-INTRABAR-ORDER | INITIAL_STOP | PESSIMISTIC |  | a daily bar does not show the order of the trigger and a low below the stop |
| MA-WEIN-VOL5-STRENGTH | EXIT_CONDITIONS | volume confirmation is judged at the end of the breakout week by the three printed alternatives (volumeAlternatives); with none holding, the first later daily close above the prior close is the "first small strength": exit at the next open | NO_VOL5_EXIT | WEIN-VOL5 is HARD; "clear confirmation" (WEIN-VOL4) and "first small strength" have no numbers |
| MA-WEIN-TRAIL | POSITION_MANAGEMENT | weekly: a correction of the weekly lows from the highest weekly high since entry by >= 8 % (Investor, lower printed end of 8-10 %) / >= 7 % (Trader), followed by a weekly high at or above that high, raises the stop one raw cent under the correction low (Investor: under the lower of the correction low and MA30w) | INVESTOR_10PCT: 10 % (upper printed end) | WEIN-TRAIL1/2 and WEIN-TR-TRAIL are CONTEXTUAL; "return near the prior high" has no number, so the stricter reading (at or above) is used |
| MA-WEIN-SIZING | POSITION_SIZING | equal dollar amounts (WEIN-DIVERS2): planned position 10 % of equity; Investor buys half (5 %) at the breakout and does not add (the pullback half is manual); Trader buys the full 10 % (WEIN-TR-CONT-SIZE) | INVESTOR_FULL_AT_BREAKOUT (10 %) | the amount is the reviewer's; the halves follow WEIN-BUY2 / WEIN-TR-CONT-SIZE |
| MA-WEIN-RESEARCH-UNIVERSE | ENTRY_ELIGIBILITY | VU_TOURNAMENT_UNIVERSE_705 at the session before the fill |  | measurement convention shared by every method |
| MA-WEIN-GROUP-PROXY | ENTRY_ELIGIBILITY | no group filter (MA-WEIN-DATA-EXCEPTION) | SIC3_PROXY_NOT_BELOW_FALLING: skip a buy stop whose SIC3-EW-MIN5-400D-WIDE proxy group closed the completed week before the order week below a falling MA30w; unknown membership or history never blocks | owner decision 2026-10-21: the SIC3 proxy is a clearly labelled research reference, not SOURCE_EXACT and not a trading gate; WEIN-SF-GROUP stays DATA_BLOCKED and the group stage stays the reviewer's (WEIN-RG-GROUP) |
| MA-WEIN-COSTS | ENTRY_EXECUTION | 10 bps slippage per side, 1 bp commission (platform policy) |  | no costs in the source (stop-limit spacing WEIN-LIM is an execution example) |

### Vorregistrierte Research-Varianten (nicht aktiviert, nicht nach Ergebnis gewählt)

| ID | Änderung gegenüber REF |
|---|---|
| REF | {} |
| ALT-NO-VOL5-EXIT | {"vol5":false} |
| ALT-RISK-GUIDE-15 | {"riskGuide":0.15} |
| ALT-SIC3-GROUP-PROXY | {"groupProxy":"SIC3-EW-MIN5-400D-WIDE"} |

## C13 `SF_RASCHKE_HOLY_GRAIL` (sf5-holy-grail-research-variant-1.0.0)

- Source Fidelity: SOURCE_EXACT 1, SOURCE_DERIVED 1, SOURCE_BOUNDED 0, MODEL_ASSUMPTION 8, MANUAL_REVIEW 3, DATA_BLOCKED 1, SOURCE_BLOCKED 1; Vertrag 1.2.1; Quellenstatus RESEARCH_VARIANT_SECONDARY_SOURCE
- Mechanik: INCOMPLETE_LIFECYCLE (8/9 operative Phasen ausführbar)
- Daten: blockiert HG-EX-INTRADAY; quellenblockiert HG-MGMT-TRAIL
- Backtest: MODEL_LIFECYCLE_STUDY_RESEARCH_VARIANT (Strategie-Backtest: nein), DIAGNOSTIC_NOT_CERTIFIED; Snapshot-Läufe: 40228392651, 40099831813, 39939890956, 39937731507, 39903861586, 39770019164
- Manuell: 3 Zeilen; in der Simulation ersetzt: HG-SETUP-IMPULSE-FIRST, HG-EXIT-NEW-HIGH
- Live: LIVE_NOT_APPROVED, NOT_A_TRADABLE_STRATEGY, performanceClaim NONE

| Phase | Zeile | Bedingung | #709 / Quelle | Vertrag | Klasse | Modellannahmen | Code | Tests | Readiness | fehlt / Anmerkung |
|---|---|---|---|---|---|---|---|---|---|---|
| SETUP_QUALIFICATION | HG-SETUP-ADX | ADX(14) > 30 on the same timeframe before the pullback (Wilder) | RAS04-002 (W-RAS04 PDF4;ownquote (HARD, HIGH)) | RAS-SF-ADX | SOURCE_EXACT |  | `research/holy-grail-lifecycle.mjs#holyGrailSetupSeries` | 2 | MECHANICAL_IMPLEMENTED |  |
| SETUP_QUALIFICATION | HG-SETUP-ADX-READING | W-RAS97 "initially greater than 30 and rising": which bars must carry ADX > 30 | RAS04-002 (W-RAS04 PDF4;ownquote (HARD, HIGH)) | RAS-SF-ADX | MODEL_ASSUMPTION | MA-RAS-ADX-READING | `research/holy-grail-lifecycle.mjs#holyGrailSetupSeries` | 2 | MECHANICAL_UNDER_MODEL_ASSUMPTION |  |
| SETUP_QUALIFICATION | HG-SETUP-PULLBACK | touch of the 20 EMA while ADX(14) > 30 (the contract component) | RAS04-001 (W-RAS04 PDF4;ownquote (STRONG_PREFERENCE, HIGH)) | RAS-SF-PULLBACK | SOURCE_DERIVED |  | `research/holy-grail-lifecycle.mjs#holyGrailSetupSeries` | 1 | MECHANICAL_IMPLEMENTED |  |
| SETUP_QUALIFICATION | HG-SETUP-IMPULSE-FIRST | strong impulse; FIRST pullback to the 20 EMA | RAS04-001 (W-RAS04 PDF4;ownquote (STRONG_PREFERENCE, HIGH)) | RAS-SF-PULLBACK | MANUAL_REVIEW | MA-RAS-MANUAL-SUBSTITUTE | `research/holy-grail-lifecycle.mjs#holyGrailSetupSeries` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION | review flags RAS-MR-IMPULSE / RAS-MR-NOT-FIRST in the contract; substituted in the simulation |
| ENTRY_ELIGIBILITY | HG-EL-SOURCE | entry and stop from W-RAS97 (newsletter sidebar on the author's site): accepted as explicitly labelled secondary source (D-RAS97, 2026-10-23) | RAS04-001 (W-RAS04 PDF4;ownquote (STRONG_PREFERENCE, HIGH)) | RAS-SF-ENTRY | MODEL_ASSUMPTION | MA-RAS-SOURCE-W-RAS97 | `research/holy-grail-lifecycle.mjs#HOLY_GRAIL_RESEARCH_ADAPTER` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION | contract: SOURCE_DERIVED with sourceBasis SECONDARY_SOURCE, never SOURCE_EXACT; the lifecycle is not source-conform |
| ENTRY_EXECUTION | HG-EX-BUY-STOP | buy stop above the high of the previous bar after the touch | RAS04-001 (W-RAS04 PDF4;ownquote (STRONG_PREFERENCE, HIGH)) | RAS-SF-ENTRY | MODEL_ASSUMPTION | MA-RAS-PREVIOUS-BAR | `research/lifecycle-engine.mjs#fillOrder` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION |  |
| ENTRY_EXECUTION | HG-EX-INTRADAY | intraday timeframes (5-120 minutes) | RAS04-006 (W-RAS04 PDF4;ownquote (CONTEXTUAL, HIGH)) | RAS-SF-TIMEFRAME | DATA_BLOCKED |  | – | 0 | BLOCKED | daily timeframe only |
| INITIAL_STOP | HG-STOP-SWING-LOW | protective stop at the newly formed swing low | RAS04-001 (W-RAS04 PDF4;ownquote (STRONG_PREFERENCE, HIGH)) | RAS-SF-STOP | MODEL_ASSUMPTION | MA-RAS-SWING-LOW, MA-RAS-INTRABAR-ORDER | `research/holy-grail-lifecycle.mjs#holyGrailSetupSeries` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION |  |
| POSITION_SIZING | HG-SIZE | position size (not disclosed) |  | RAS-SF-SIZE | MODEL_ASSUMPTION | MA-RAS-SIZING | `research/lifecycle-engine.mjs#plannedShares` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION |  |
| POSITION_MANAGEMENT | HG-MGMT-TRAIL | "trail stops as profits grow" |  |  | SOURCE_BLOCKED |  | – | 0 | MANUAL_NOT_AUTOMATED | no trailing mechanics in any free source; not trailed |
| EXIT_CONDITIONS | HG-EXIT-NEW-HIGH | a new high is an exit opportunity | RAS04-003 (W-RAS04 PDF4;ownquote (PREFERENCE, HIGH)) | RAS-SF-EXIT | MANUAL_REVIEW | MA-RAS-EXIT | `research/holy-grail-lifecycle.mjs#HOLY_GRAIL_RESEARCH_ADAPTER` | 1 | MECHANICAL_UNDER_MODEL_ASSUMPTION |  |
| TRADE_ACCOUNTING | HG-ACC-RESEARCH-V1 | research-v1: orders only on real source bars, dividends on held shares, stale limit, economic delisting, ledger replay reconciliation |  |  | MODEL_ASSUMPTION | MA-RAS-COSTS | `research/lifecycle-engine.mjs#runResearchLifecycle` | 2 | MECHANICAL_UNDER_MODEL_ASSUMPTION | platform accounting, not a method rule |
| TRADE_ACCOUNTING | HG-ACC-PORTFOLIO-POLICY | platform research portfolio policy: cash only, 100 000 start, 20 open positions, 25 % weight cap, neutral date-seeded fill order |  |  | MODEL_ASSUMPTION | MA-RAS-COSTS | `research/lifecycle-engine.mjs#plannedShares` | 2 | MECHANICAL_UNDER_MODEL_ASSUMPTION | separate from the original strategy |
| BACKTEST_DIAGNOSTICS | HG-DIAG-DETERMINISM | deterministic, prefix-stable (no lookahead) lifecycle; public counts, sealed metrics |  |  | MODEL_ASSUMPTION | MA-RAS-SOURCE-W-RAS97 | `research/run-sf5-lifecycle.mjs#lifecyclePart` | 2 | MECHANICAL_UNDER_MODEL_ASSUMPTION | MODEL_LIFECYCLE_STUDY_NOT_A_STRATEGY_BACKTEST, DIAGNOSTIC_NOT_CERTIFIED |
| STRATEGY_READINESS | HG-READINESS | readiness in six dimensions; LIVE_NOT_APPROVED, NOT_A_TRADABLE_STRATEGY, performanceClaim NONE |  |  | MANUAL_REVIEW |  | – | 0 | MANUAL_NOT_AUTOMATED | assessment, not a trading phase |

### Modellannahmen

| ID | Phase | Referenz | Alternativen | Begründung |
|---|---|---|---|---|
| MA-RAS-SOURCE-W-RAS97 | ENTRY_EXECUTION | entry order and initial stop read from W-RAS97, an explicitly labelled secondary source (owner decision D-RAS97, 2026-10-23); the readings of "previous bar" and "swing low" stay model assumptions |  | the contract source W-RAS04 discloses neither (#709 C13); W-RAS97 is a newsletter sidebar on the author's site |
| MA-RAS-PREVIOUS-BAR | ENTRY_EXECUTION | TOUCH_BAR: buy stop one raw cent above the high of the bar that touched the 20 EMA, placed after its close for the next session only | BAR_BEFORE_TOUCH: above the high of the bar before the touch bar, also for the next session | the literal real-time reading is a buy stop above the bar before the touch, which can fill on the touch bar itself; that needs intraday data and is DATA_BLOCKED on daily bars. Both daily variants are conventions that place the order after the touch close; the one-session validity is not in the sidebar |
| MA-RAS-ADX-READING | SETUP_QUALIFICATION | RUN_TO_TOUCH: ADX(14) > 30 on every bar from the start of the run to the bar before the touch (the contract component RAS-SF-PULLBACK); "rising" holds where the run crossed 30 upward | AT_IMPULSE_HIGH: ADX > 30 on the bar of the impulse high only; the ADX may fall below 30 during the retracement ("initially") | W-RAS97 rule 1 says "initially greater than 30 and rising" and rule 2 expects a turndown during the retracement; which bars carry the condition is not stated |
| MA-RAS-MANUAL-SUBSTITUTE | SETUP_QUALIFICATION | EVERY_TOUCH: every touch of the 20 EMA in the setup is taken (strong impulse and first pullback substituted) | FIRST_TOUCH_ONLY: only the first touch since the impulse high | RAS04-001 (STRONG_PREFERENCE) strong impulse, first pullback; review flags RAS-MR-IMPULSE / RAS-MR-NOT-FIRST in the contract |
| MA-RAS-SWING-LOW | INITIAL_STOP | lowest low from the impulse high to the touch bar |  | "newly formed swing low" without a swing definition; the pullback low is the low the pattern forms. A lower low on the fill bar is handled by the same-bar stop (intrabar order), not by moving the stop |
| MA-RAS-EXIT | EXIT_CONDITIONS | NEW_HIGH: first close above the impulse high exits at the next open (RAS04-003 preference) |  | "trail stops as profits grow" gives no rule; the stop is not trailed |
| MA-RAS-INTRABAR-ORDER | INITIAL_STOP | PESSIMISTIC | OPTIMISTIC | daily bars do not show the order of the trigger and a low below the stop |
| MA-RAS-COSTS | ENTRY_EXECUTION | 10 bps slippage per side, 1 bp commission (platform policy) |  | no costs in the source |
| MA-RAS-SIZING | POSITION_SIZING | RISK 0.01 to the swing-low stop (platform model assumption) |  | size not disclosed (RAS-SF-SIZE SOURCE_AMBIGUOUS) |

### Vorregistrierte Research-Varianten (nicht aktiviert, nicht nach Ergebnis gewählt)

| ID | Änderung gegenüber REF |
|---|---|
| REF | {} |
| ALT-PREVIOUS-BAR-BEFORE-TOUCH | {"previousBar":"BAR_BEFORE_TOUCH"} |
| ALT-INTRABAR-OPTIMISTIC | {"intrabarOrder":"OPTIMISTIC"} |
| ALT-ADX-AT-IMPULSE-HIGH | {"adxReading":"AT_IMPULSE_HIGH"} |
| ALT-FIRST-TOUCH-ONLY | {"touches":"FIRST_TOUCH_ONLY"} |

