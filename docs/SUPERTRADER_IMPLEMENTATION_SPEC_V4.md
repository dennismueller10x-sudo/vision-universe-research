# Supertrader V4 – Implementation Specs (source-faithful, post-hoc)

Status: research, Draft. Nothing here is live, merged or a trading recommendation.
Companion: [SUPERTRADER_SOURCE_MEASUREMENT_ACCEPTANCE_V4.md](SUPERTRADER_SOURCE_MEASUREMENT_ACCEPTANCE_V4.md).
Machine-readable: `scripts/supertrader/research/v4/` (`SUPERTRADER-V4-*.json`, `methods/TURTLE-SOURCE-V4-SPEC.json`,
`methods/MANUAL-REVIEW-V4-CONTRACT.json`).

## 0. Ground rules

1. Specs come before code. Only `IMPLEMENT_NOW` methods are implemented (rule 32): Turtle System 1 and System 2,
   as a long-only equity translation of the published rules.
2. Every implemented rule has a rule id, a source id, a confidence, a code function and a test
   (`SUPERTRADER-V4-SOURCE-CODE-TRACEABILITY.json`). Numbers without a source id are marked `TRANSLATION` or
   `CONVENTION` and are listed as declared deviations.
3. No parameter search, no grid search, no tuning. The parameters are the source numbers.
4. Old VU adaptations stay unchanged and separately named (A/B track).
5. A manual layer is a first-class component (`MANUAL_REVIEW_REQUIRED`), never a hidden automation.

## 1. Source basis and its limit

| Basis | Where | Verifiable here |
|---|---|---|
| Original Turtle Trading Rules (PDF, page-cited) | `fidelity/canonical/turtle.json` (R15) | yes, HIGH |
| Kullamägi own articles/FAQ | `fidelity/canonical/kullamagi.json` (R15) | yes, HIGH |
| Minervini, Weinstein, Darvas books | R15 only via secondary notes; books not read in-repo | MEDIUM at best |
| Primary Source Reconstruction (13 books, 785 findings, 287 behavioral cases) | **not in this repository** (checked all 592 remote branches on 2026-10-15) | owner summary only (OSR-* ids) |

Consequence: the owner summary can make a VU rule *less* certain (it documents where VU was too hard or foreign),
but it cannot make a rule `SOURCE_ACCEPTED`, because no quote, page or finding id can be checked. This is why
Darvas, Pocket Pivot, Buyable Gap-Up and Holy Grail stay `RESEARCH_ONLY` in this run, and why golden cases for all
non-Turtle methods are `BLOCKED_BEHAVIORAL_CASE_ARTIFACT_ABSENT`.

## 2. Turtle System 1 / System 2 – `IMPLEMENT_NOW` (code: `methods/turtle-source-v4.mjs`)

Scope: `VU_EQUITY_ADAPTATION` (long-only translation). `ORIGINAL_FUTURES_REPLICATION` is `DATA_BLOCKED`
(no futures chains, contract values, rolls, correlation groups, shorting/borrow).

| Rule | Source ids | Rule (exact) | Kind |
|---|---|---|---|
| T4-N | TUR-F-N-01 | TR = max(H−L, H−PDC, PDC−L); N = (19·PDN + TR)/20, seeded with the 20-day mean TR | SOURCE |
| T4-S1-ENTRY | TUR-F-S1-ENTRY, TUR-F-BO-01 | buy one unit when price exceeds the prior 20-day high by one tick, intraday; at the open on a gap | SOURCE |
| T4-S1-FILTER | TUR-F-S1-FILTER, TUR-E-SHORT-01 | skip S1 if the last breakout (taken or not, long **or short**) was not a losing breakout; losing = 2N against before a profitable 10-day exit. Intrabar order is path-consistent (level nearer to the open first). An open (unresolved) previous breakout counts as not losing; a stop inside the hypothetical breakout bar does not resolve it (both conservative, counted, declared) | SOURCE + declared interpretations |
| T4-FAILSAFE | TUR-F-FAILSAFE-55 | after a skipped S1 breakout, enter at the 55-day breakout; exit like S1 (interpretation) | SOURCE |
| T4-S2-ENTRY | TUR-F-S2-ENTRY | one tick above the 55-day high, no filter | SOURCE |
| T4-UNIT | TUR-F-UNIT-01/02 | unit = 1 % of notional / N | SOURCE |
| T4-NOTIONAL | TUR-F-NOTIONAL-01, TUR-E-NOTIONAL-01 | notional = year-start equity; each loss of 10 % of the *current* notional cuts it by 20 % (1M → 0.8M → 0.64M; thresholds 10 %, 18 %, 24.4 % …); the cut holds until the year start is regained; no new units at a 50 % yearly loss | SOURCE |
| T4-ADD | TUR-F-ADD-01, TUR-E-PYR-01 | add every ½N above the previous fill, up to 4 units, several per day possible | SOURCE |
| T4-STOP | TUR-F-STOP-2N, TUR-F-STOP-ADD | stop 2N below the newest unit; adds raise all stops | SOURCE |
| T4-EXIT-S1 / -S2 | TUR-F-EXIT-S1 / -S2 | exit all units below the prior 10-day (S1) / 20-day (S2) low | SOURCE |
| T4-LIMIT | TUR-F-LIM-01 | ≤ 4 units per market, ≤ 12 per direction; 6/10 correlated-group limits **not applied** (no PIT industry) | SOURCE + declared deviation |
| T4-RANK | TUR-F-RANK-01, TUR-F-SIM-01, TUR-E-RANK-01 | simultaneous signals: strongest first, (C − C₋₆₃)/N; ties by id | SOURCE + translation (3 months = 63 sessions) |
| T4-CONSISTENCY | TUR-F-CONS-01 | take every signal; no VU lifecycle | SOURCE |
| T4-NO-REGIME | TUR-F-REGIME-01, TUR-F-FUND-01 | no regime, index or fundamental filter | SOURCE |
| T4-LONG-ONLY | TUR-F-LS-01, TUR-E-SHORT-01 | short side omitted (no borrow data); short breakouts still feed the filter | TRANSLATION |
| T4-NO-LEVERAGE | TUR-E-LEV-01 | cash account; unit bought only if it fits in cash, else `REJECT_NO_CASH` | TRANSLATION |
| T4-UNIVERSE | TUR-F-MKT-01 | frozen common tournament universe (raw close ≥ 5, 20-day $-volume ≥ 1 M, equity classes), prior session | TRANSLATION |
| T4-TICK | TUR-F-S1-ENTRY | one tick = 0.01 raw, converted to the split-adjusted basis | TRANSLATION |
| T4-INTRABAR | – | daily bars: exits before adds/entries, the exit level nearer to the open first; after an entry or same-bar adds a low at/below the (raised) stop is assumed hit (pessimistic); fills max(open, trigger) / min(open, level) | CONVENTION |
| T4-LEDGER | – | every fill, fee and dividend in a ledger; an independent replay re-values it daily and must match the engine (hard check) | CONVENTION |
| T4-COSTS | TUR-F-ORD-01 | frozen protocol costs 10 bp + 1 bp per side; gross reported separately | CONVENTION |
| T4-TERMINALS | – | V4 measurement policy (stale limit, data events, delisting scenarios) | CONVENTION |

Modal strength: every SOURCE rule is mandatory (the source calls the system complete and mechanical).
Manual layer: none. Regime: none. Exceptions: failsafe 55, gap fills, fast-market multiple adds.

Non-rules (must not be added): regime/market light, fundamentals, VU lifecycle (3 % proximity, 10-session expiry,
5-session cooldown), ADR/channel-width filters, weight caps, alphabetical priority, next-open entry, closing-price
breakout confirmation, single unit without adds.

Golden cases (`tests/v4-turtle-golden.test.mjs`, catalogue in `SUPERTRADER-V4-GOLDEN-CASES.json`): confirmed buy
(TG-01, TG-02, TG-08, TG-09), confirmed reject (TG-03, TG-10), confirmed exception (TG-04 failsafe, TG-05 gap),
educational pattern (TG-06: a winning hypothetical *short* breakout makes VU skip the next *long* breakout),
ambiguous case (TG-07: stop inside the entry bar, resolved by the declared pessimistic convention). Each test states
why. Engine defects found and fixed before any measurement: (1) during golden-case work, the previous breakout's
same-day exit must be resolved before a new breakout is evaluated; (2) the independent review (V4-R2..R5) found the
notional account linear instead of compounding, a stop-before-exit order that ignored the price path, a missing stop
re-check on add bars and possible entries on a terminal bar – all fixed with regression tests.

Measurement status: TR arithmetic, corporate actions and terminals are covered by the V4 EW oracle; the stop-trigger
fill model on daily bars has no external oracle (MEASUREMENT_PARTIAL). Therefore results are `RESEARCH_ONLY`, not
`CLAIM_READY`, whatever they show.

A/B: `TURTLE_S2_EQUITY_DAILY` (old VU adaptation, unchanged method code) runs on the same V4 infrastructure
(`methods/runner-v4.mjs` = runner-certified-v3 with accounting-v4 and the V4 stale limit). The old live S1 engine
(`DONCHIAN_TURTLE 2.0.2`) has no tournament definition and is not part of the A/B run.

## 3. Manual-layer architecture (Minervini, Weinstein, Kullamägi Breakout) – `MANUAL_LAYER_REQUIRED`

Pipeline: `MACHINE_SCREEN → RANKING → MANUAL/AI REVIEW → FINAL_CANDIDATE`
(contract: `methods/MANUAL-REVIEW-V4-CONTRACT.json`).

* The machine screen may only create `MANUAL_REVIEW_REQUIRED` records with evidence (rule id, value, source id) and
  explicit open questions (what the source leaves to judgment). It never emits `BUY`.
* An AI review is a proposal; the status stays `MANUAL_REVIEW_REQUIRED` until a human decision with source-id reasons.
* Decisions are logged forward only and are never back-filled into a historical backtest.

Per method (not implemented in this run; specs for the next PRs):

| Method | Machine screen (data accepted) | Judgment left to review | Must not be a Boolean gate |
|---|---|---|---|
| Minervini SEPA/VCP | Trend Template as screen; relative ranking | priority, fundamentals and price confirmation (OSR-MIN-01/06), turnaround vs growth family (OSR-MIN-02), VCP shape as typical form (OSR-MIN-04) | universal GAAP-EPS-25 % AND, fixed 3R, fixed 25/50/75/100 exposure ladder, MA50 full sell |
| Minervini Power Play | price/volume screen | exception characteristics (OSR-MIN-03), pivot | VCP limits from the normal family |
| Weinstein Stage 2 Investor | weekly MA30 slope, price vs MA30, volume on breakout, RS as context | stage call, resistance, support-based stop, group strength | RS>0 as universal gate, every MA30 close break as full sell (OSR-WEI-01) |
| Weinstein Stage 2 Trader | same screen, trader path | earlier entry, tighter support stop | mixing with investor path |
| Weinstein Stage 4 Short | (data blocked: borrow) | – | – |
| Kullamägi Common Breakout | top 1–2 % movers 1/3/6 M, prior move, base | base quality; ORH entry and low-of-day stop on intraday data | ADR clamp instead of LOD (OSR-KK-01) |

Weinstein is specified as three separate engines (investor, trader, stage-4 short), not one engine with flags.

## 4. Separate engines that stay blocked in this run

| Method | Verdict | Blocking input | Spec note |
|---|---|---|---|
| Kullamägi Episodic Pivot | DATA_BLOCKED | PIT catalysts/news, surprises, intraday | separate engine; shares no rule with Breakout without a source id |
| Kullamägi Parabolic Short | DATA_BLOCKED | borrow, short interest, intraday | separate engine |
| Darvas later Q&A | RESEARCH_ONLY | source artifact absent | build in this order once source ids exist: box detection → upper 3-day confirmation → lower 3-day confirmation → touch-reset policy (source vs VU, OSR-DAR-02) → breakout buy stop → box stop. Fundamental selection and sizing are later, separate layers |
| Pocket Pivot, Buyable Gap-Up | RESEARCH_ONLY | source artifact absent | signal detectors with context; no thresholds may be typed in without source ids |
| Raschke Holy Grail | RESEARCH_ONLY | source artifact absent | indicator thresholds would be source-less magic numbers |
| CAN SLIM | RESEARCH_ONLY | original O'Neil coverage partial; estimates/institutional data | new design scope (rule 29) |

## 5. Forbidden VU additions (all methods)

Market lights or regime gates without a source id; universal hard filters where the source describes typical forms;
foreign rules from other traders or TraderFox; alphabetical capital priority; silent replacement of intraday rules by
daily approximations; any parameter chosen after looking at results.
