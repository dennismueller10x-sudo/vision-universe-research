# V6 offline study calculators

Implementation: `quant/engines/research-studies.cjs`. No frontend, public transport, production pipeline, active methodology or legacy result artifact is changed. Outputs always carry `NOT_CERTIFIED`, `productionApproved=false` and `independentEvidence=NOT_ESTABLISHED_BY_CALCULATOR` where applicable. Synthetic fixtures validate algorithms; they establish no historical data eligibility or economic advantage.

## Reuse and observed defects

- All five frozen weekly signal definitions and cooldown semantics come from `signal-backtest.js`. Their long event outcomes are measured separately; downward signals do not silently become short strategies. Event-study costs use exact explicit `PER_SIDE_NOTIONAL`, not a relabeling of legacy round-trip friction.
- Fixed pattern features/matching come from `pattern-research.js`. The existing `historical-cases.js` descriptive view remains unchanged. New replay validation uses a fixed versioned pattern and declared cooldown rather than choosing today's matching conditions and calling the resulting historical cases independent evidence.
- Historical technical snapshot rows delegate to the approved `setup-engine.js#evaluate` mapping. These rows must have their own cutoff, availability and source mode; the calculator does not fabricate historical technical features or published production snapshots. Existing path-dependent activation locks remain in force.
- Factor history coverage uses `profile-backtest.js#historyCoverage`. The new factor calculator deliberately does not reuse its `quintiles()` selection: legacy quintiles filters unavailable future exit prices before sorting/ranking, thereby changing the original ranking population. V6 assigns ranks/buckets before looking up outcomes and retains missing outcomes in those original buckets. Legacy output is preserved, not silently recomputed.
- The strategy/rebalancing implementation is `research-portfolio.cjs`; no second portfolio book is implemented here. The legacy profile book's automatic stale/end-of-series liquidation at last price or zero is unsuitable for V6 terminal accounting; the new explicit ledger supersedes that behavior.

## Shared input and causal boundaries

Common study options:

- `asOf`: strict ISO date; `sourceMode`: `SYNTHETIC_TEST`, `HISTORICAL_SIMULATION` or `AS_PUBLISHED_PIT`.
- `returnBasis`: `PRICE_RETURN` or `TOTAL_RETURN`, `currency`, `horizonBars`, optional predeclared `entryDelayBars >= 1` (default next close).
- `registration`: `id`, `version`, `frozenAt`, `analysisMode` (`EXPLORATORY` or `CONFIRMATORY_CANDIDATE`). A candidate whose rule was frozen after a signal is ineligible. Actual untouched holdout verification belongs to the independent OOS layer.
- `costs`: `{basis:'PER_SIDE_NOTIONAL',feeBps,slippageBps}`. Exact net event return is `exitLevel/entryLevel * (1-side)/(1+side) - 1`. This is a fixed-horizon event outcome, not financed portfolio performance. Passive benchmarks have no transaction costs and are labeled accordingly.
- `listings`: immutable supplied `listingId`, `issuerId`; dated identity evidence (`mic`, `instrumentClass:'COMMON_STOCK'`, `primary:true`, `validFrom`, optional `validTo`, `availableAt`, `sourceHash`); historical membership intervals with availability and source hashes; strictly ordered `bars` with `date`, `close`, optional canonical `returnLevel`, `availableAt`, `closeAt`, `sourceHash`.
- `expectedCalendar`: mandatory for non-synthetic studies. Calendar gaps within the signal feature/cooldown prefix block its evidence; factor/event/setup snapshot inputs do not require unrelated ancient price history; replay/pattern guards conservatively cover their full prefix because all-time features and historical greedy episode selection can depend on it; gaps relevant to entry or outcome do not silently lengthen windows. A future gap does not invalidate an already completed earlier event. A missing expected mature entry/exit is `CENSORED`; a genuinely unreached horizon remains `IMMATURE`.
- Optional `benchmark`: same currency and return basis, exact matched endpoints. Missing benchmark points yield null comparisons, never interpolated values or shortened MAX.

No ticker-to-listing invention, raw-price adjustment or alternative corporate-action truth is performed. Inputs must come from approved canonical producers. In particular, a supplied `returnLevel` or source hash is not independent proof of valid Total Return, complete survivorship coverage, rights or original PIT vintages. Every result explicitly limits its universe claim to the supplied historical listing cohort. Root manifest/quality evidence must establish the actual target-population coverage; structural gaps cannot be erased by these calculators.

Entry close times must be explicit and later than signal availability. Price availability cannot precede the represented close. Original PIT studies also check feature-prefix vintages and outcome availability at the selected as-of cutoff. Dates/timestamps accept ISO dates or UTC RFC3339 timestamps only, preventing locale/timezone dependent parsing. Invalid identity/membership rows expose no numeric outcome.

## APIs

| Function | Computation / additional options |
|---|---|
| `runSignalStudy(options)` | All five rules by default, or an explicit valid unique `ruleIds` subset. Per-rule outcomes, exact costs, market benchmark and same-date base-rate cohorts. In-universe missing bars/outcomes prevent complete-cohort mean claims. |
| `runReplayValidation(options)` | Exactly one listing; fixed `{id,version,terms}` pattern and `cooldownBars`. Prefix-only historical selection; conditional single-listing scope. |
| `runPatternStudy(options)` | Fixed pattern, `cooldownBars`, positive cases and contemporaneous non-pattern controls. Unmeasurable features remain unknown. Missing contemporaneous listings block matched complete-control claims. Observations, controls and suppressed episodes stay auditable. |
| `buildSetupStates(options)` | `setupMethodology` and `technicalSnapshots` with historical rows, cutoff and source mode; calls the existing setup mapping. |
| `runSetupStudy(options)` | Supplied `setups` or reconstructed states; `entryStates`; repeated same-state observations are deduplicated. Optional predeclared `entryVariants:[{id,delayBars>=1}]` and `exitVariants:[{id,type,horizonBars}]`. |
| `runFactorStudy(options)` | `factorId`, `buckets >= 2`, historical `factorSnapshots` with individual value vintages. Rank at decision, then observe outcomes. Fixed factor-ascending/listing-ID-ascending tie policy and tied-row count. Full-cohort bucket means and spread withheld if any assigned outcome is missing. Optional `interactionFactorIds` yields pairwise PIT Spearman dependence of row `factors`, without conditioning on future outcome availability. |
| `runEventStudy(options)` | Immutable original `events` carrying `eventId`, `eventType`, `listingId`, `occurredAt`, `publishedAt`, `availableAt`, `sourceHash`. First explicit close strictly after availability, plus registered additional delay. Revised events require their own preregistered rule and are rejected by this original-event calculator. |
| `classifyRegimes(options)` | Supplemental fixed trailing trend/volatility diagnostics with explicit `lookbackBars`, `volatilityLookbackBars`, `trendBand`, `volatilityThreshold`, `annualization`, optional sourced `stressWindows`. `EX_POST_DESCRIPTIVE` and `PIT_AVAILABLE` are separate. Does not replace or certify active VU breadth-regime history. |
| `analyzeRegimes(options)` | Group supplied observed outcomes by exact regime ledger date, report episodes, issuer/time clusters and uncertainty. Unavailable-at-decision PIT labels remain unmatched. Ex-post grouping never claims a historical trading signal. |

Setup exits support `TIME_EXIT`, `INVALIDATION_CLOSE`, `TARGET_CLOSE`. Barrier exits require explicitly evidenced thresholds in `SIGNAL_SERIES` scale; a trigger at a completed close executes at a later observed close. Intraday high/low fills, inferred stop/target rules and unproven cross-split thresholds are unsupported. Mature M6 outcomes are not manufactured. Target/stop rule changes require new registration.

Factor dependence is an observational rank-correlation diagnostic, not a causal joint-factor or optimizer model. Multiple factor/pattern/rule claims require a registered testing family and the common sensitivity/OOS inference layer; no calculator automatically selects a profitable variant.

## Uncertainty, provenance and bounds

The common summary reports mean/median and asymptotic two-way clustered mean uncertainty (issuer and declared time cluster, subtracting intersection contribution). One cluster or non-estimable variance yields no interval. The interval is explicitly not a certification: cluster independence, overlapping horizons, few-cluster adequacy and multiplicity require the separately approved study design. Raw event count is never labeled an independent N. Default time labels are observation dates, not a claim that overlapping M6 dates are independent.

Result hashes bind data inputs, registration, calculator/dependent engine source hashes, recorded Node/V8/platform/architecture/glibc and actual Node binary hash. No rounding is used to hide disagreements. At most 2,000,000 source bars per call, 250,000 estimated output/cohort rows and 50,000,000 estimated work units. Signal matching, pattern matching, setup variant grids, factor dependence and event/regime loops reject oversized work before their expensive loops. Price/date lookups use maps, event entry uses binary search, setup/factor/event outcomes avoid whole-history copying, and pattern features reuse running maxima. The independent Python report records wall time and child peak RSS on its small 360-source-bar synthetic workload; it includes startup/runtime hashing and is not a production throughput estimate. Larger populations require explicit bounded offline partitioning with population-wide matching/aggregation, not independent batches misrepresented as one complete cross-section.

## Validation and remaining external evidence

Run:

```bash
node --test quant/tests/research-studies.test.mjs
python3 scripts/quant/verify-research-studies.py --node /path/to/node22 --out /private/studies-reference.json
```

The Python standard-library reference independently implements all five signal predicates/cooldown, fixed replay/pattern selection and controls, setup execution variants, exact net outcomes, path drawdowns, rank allocation, publication-to-entry timing, trailing volatility/trend and two-way cluster inference. Fixtures are labeled `SYNTHETIC_TEST`. It compares 25 signal events and 526 independently reconstructed selection/numerical values at `1e-12` absolute/relative tolerance. Node tests additionally cover causal cutoff changes, delayed revisions, identity/membership exclusions, missing mature outcomes, rank-first censoring, controls, original versus reconstructed setups, execution variants, factor dependence, regime mode separation and provenance.

Still required for historical method acceptance: complete eligible population including delisted listings, validated canonical Corporate Actions/Total Return and terminal events, sourced historical membership/factor/setup/event vintages, independent unexposed test data, justified clusters/power/multiplicity, approved economic thresholds, licensing and explicit certification review. Implemented arithmetic does not grant those statuses.
