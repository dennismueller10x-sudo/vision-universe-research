'use strict';
// V10 STUDIES – the registered plan. This object is written into registration-1.0.0.json BEFORE any
// outcome is computed; the runner reads all parameters back from the committed registration, not from here.
const PATTERN_PRICE_CANDIDATES = ['strong-12m-momentum', 'very-strong-12m-momentum', 'weak-12m-momentum', 'near-52w-high', 'far-below-52w-high', 'deep-drawdown', 'at-all-time-high',
  'above-40w-line', 'trend-stacked', 'quiet-range', 'wide-range', 'high-volatility', 'low-volatility', 'six-month-thrust', 'three-month-thrust'];

function plan() {
  return {
    id: 'V10-STUDIES', version: '1.0.0', purpose: 'HISTORICAL_DEVELOPMENT_STUDY',
    strand: 'STUDIES (Arbeitsstraenge D und E)',
    priorExposure: [
      'All five signal rules (MOMENTUM_IMPROVED, MOMENTUM_DETERIORATED, TREND_UP, TREND_DOWN, NEW_52W_HIGH) were studied in V7/V8 on named survivors and in the product signal study on the product universe (same 2000-2025 history).',
      'V9 results known before this registration: NEW_52W_HIGH P1 (1,000 listings) raw 13W +3.37 % Holm-significant, SPY excess +1.37 % not significant; P2 +2.98 % / +1.00 % (p 0.15). V9 found the SPY-excess series instationary.',
      'The 15 price candidates of quant/methodology/pattern-research-v1.json were studied by the product pattern study (12-60 month winner frequencies, product universe); ABOVE_40W_SMA was studied in V7/V8 (11 survivors, h=13).',
      'This strand computed NO outcome, return or benchmark comparison before this registration. Computed beforehand (outcome-free): loader qualification, modal weekly calendar, frame exclusions, SPY calendar coverage and the counts of signal detections per rule (detection reads closes up to the signal week only).',
      'No untouched holdout exists; 2000-2025 is explored history. A second implementation language is not a holdout.'
    ],
    population: {
      frameRule: 'createResearchLoader(root, loaderOptions) QUALIFIED weekly listings (current classification = survivors unless listingLifecycleEvidence cuts/excludes series), minus listings with any weekly date label differing from the modal label of its ISO week among QUALIFIED listings, minus listings outside the engine primary exchange set XNAS/XNYS/XASE (exchange from listingId; for identity-evidence bindings the sourced MIC). Same rule as V9 frame, applied to the research loader. Exclusions are counted, never repaired.',
      loaderConfigurations: {
        PRIMARY: { loaderOptions: { identityEvidence: true, corporateActionEvidence: true }, role: 'PRIMARY_NOW' },
        LIFECYCLE: { loaderOptions: { identityEvidence: true, corporateActionEvidence: true, listingLifecycleEvidence: true }, role: 'REGISTERED_RERUN_AFTER_POPULATION_STRAND_INTEGRATION',
          note: 'Same rules, same code path; frame differs (lifecycle-cut series, FROZEN_TAIL_UNRESOLVED exclusions). Enables the survivorship sensitivity.' }
      },
      cohortMode: 'CONDITIONAL_CURRENT_CLASSIFICATION', identityRule: 'research-weekly-loader listingId (provider listing id or SEC binding canonical id); issuerId = securityId; no ticker-only identity',
      calendar: 'Modal ISO-week labels among QUALIFIED listings (full history; warm-up before 2000 uses it)'
    },
    window: { signalDates: ['2000-01-01', '2025-12-31'], maturity: 'Outcomes may mature after 2025 up to the data asOf; IMMATURE/CENSORED/INELIGIBLE counted, never imputed.' },
    timing: { decision: 'Signal/pattern reads weekly closes up to and including the signal week (engine detect/featuresAt).', entry: 'Close of the next observed calendar week (entryDelayBars = 1, engine NEXT_OBSERVED_WEEK_CLOSE model).', exit: 'Time exit after h observed calendar weeks; any missing calendar week in the path censors the outcome (engine SESSION_GAP).' },
    returnBasis: 'PRICE_RETURN (split-adjusted weekly closes, dividends excluded). TOTAL_RETURN is not available for this population and is not claimed.',
    costs: { basis: 'PER_SIDE_NOTIONAL', base: { feeBps: 10, slippageBps: 5 }, net: 'net = (1+gross)*(1-s)/(1+s)-1, s = (fee+slippage)/1e4 (engine net)', sensitivity: [{ feeBps: 0, slippageBps: 0 }, { feeBps: 10, slippageBps: 5 }, { feeBps: 10, slippageBps: 20 }, { feeBps: 20, slippageBps: 30 }], benchmarkCosts: 'SPY passive, no costs' },
    benchmark: { id: 'SPY_PRICE_RETURN', source: 'quant/engines/weekly-benchmark.cjs (exact dates, no filling)', rule: 'SPY price return between the same entry and exit dates; events without both SPY dates are excluded from the SPY endpoint and counted.' },
    endpoints: {
      RAW_NET: 'Pooled event mean of net price return (base costs).',
      SPY_EXCESS: 'Pooled event mean of RAW_NET minus SPY price return over the same entry/exit dates.',
      BASE_RATE_EXCESS: 'Pooled event mean of RAW_NET minus the same-date mean RAW_NET of the control observations (same population, same signal week, same entry/exit dates, eligible and completed, NOT matching the rule/pattern). Control costs identical (same basis).'
    },
    controls: {
      signal: 'Control at week t for rule R: frame listing-weeks that are eligible under the engine signal rule (bar index >= WARMUP 53, date >= listingStart, no calendar gap in the previous WARMUP+COOLDOWN bars), have a completed h-week outcome, and where R.detect is false (cooldown-suppressed detections are NOT controls).',
      pattern: 'Control at week t for pattern P: frame listing-weeks with bar index >= 53, date >= listingStart, no calendar gap at or before t (engine eventOutcome rule without lookback), completed outcome, and P measurable and false (engine runPatternStudy control definition; unmeasurable and cooldown-suppressed hits excluded). Mean over observed controls; incomplete controls are counted (deviation from the engine complete-cohort rule, which would drop most late dates in a 4,000-listing cohort).'
    },
    inference: {
      primary: 'research-validation.inferTemporalBlockMean: circular calendar-block bootstrap over the study calendar (all weeks 2000-2025 incl. zero-event weeks; all listings of a week move together = clustering by date), basic centered interval, two-sided p.',
      blockLength: 'b = 52 weeks for h <= 26, b = 104 for h = 52 (>= 2h for the 52-week overlap)', robustnessBlockLength: 104, replicates: 1999, seed: 1729, alpha: 0.05,
      secondary: 'research-studies.inference two-way cluster (signal date x issuer), asymptotic; used for regime, subperiod and descriptive tables.',
      engineBudget: 'If a cell has more than 100,000 events (engine observation budget), the block inference uses the 100,000 events with the smallest sha256("V10-STUDIES-SUBSAMPLE-1.0.0|" + securityId + "|" + signalDate); the point estimate is reported on all events. Pre-registered, outcome-free.',
      assumption: 'CONDITIONAL_WEAK_STATIONARITY_AND_MIXING (V9 found the SPY-excess series instationary; SPY-excess inference is reported but its p-values are interpreted with that limitation).'
    },
    studies: {
      SIGNAL_BACKTEST: {
        rules: ['MOMENTUM_IMPROVED', 'MOMENTUM_DETERIORATED', 'TREND_UP', 'TREND_DOWN', 'NEW_52W_HIGH'], ruleEngine: 'quant/engines/signal-backtest.js RULES (unchanged definitions, cooldown 13, warm-up 53) via research-studies.runSignalStudy per listing',
        horizonsWeeks: [4, 13, 26, 52], endpoints: ['RAW_NET', 'SPY_EXCESS', 'BASE_RATE_EXCESS'],
        family: { size: 60, definition: '5 rules x 4 horizons x 3 endpoints, Holm over all 60, two-sided H0: mean = 0' },
        expectations: 'MOMENTUM_DETERIORATED and TREND_DOWN are long event studies only; expected direction is underperformance; no short strategy is built from them.',
        descriptive: ['robustness block 104 for all cells', 'two-way cluster interval', 'distribution (p10/p25/median/p75/p90, hit rate with Wilson interval) via signal-backtest.summarize', 'regimes: research-studies.classifyRegimes on SPY weekly closes (trend 26 weeks +-5 %, 26-week volatility vs 25 % annualised, trailing data only, EX_POST_DESCRIPTIVE label)', 'subperiods 2000-2007, 2008-2012, 2013-2019, 2020-2025', 'cost sensitivity (four registered cost points)', 'V9 P1/P2 id subsets of NEW_52W_HIGH (replication check against V9, not a new test)', 'basis-rate table (mean control return per horizon)'],
        fundedStrategy: {
          rules: ['MOMENTUM_IMPROVED', 'TREND_UP', 'NEW_52W_HIGH'], engine: 'quant/engines/research-portfolio.cjs runPortfolio, provenance HISTORICAL_PRICE_SIMULATION (split-adjusted virtual units)',
          parameters: { maxPositions: 10, holdingWeeks: 13, weight: 'EQUAL_1_OVER_N_OF_EQUITY', initialCapital: 100000, costs: { feeBps: 10, slippageBps: 5 }, costSensitivity: { feeBps: 20, slippageBps: 30 } },
          rules_detail: [
            'Decision at the close of signal week t (signal = engine detection, date >= listingStart, signal week within 2000-01-01..2025-12-31); execution at the next calendar week close.',
            'A position is held exactly 13 weeks (exit executed at entry + 13 weeks). No stop, no target, no early exit.',
            'Free slots = 10 minus positions still held after this week\'s exits. Candidates = signalling listings not currently held; if more candidates than free slots, take the smallest sha256("V10-STUDIES-FUNDED-1.0.0|" + securityId + "|" + signalDate) (outcome-free tie-break).',
            'At every execution week where the set of positions changes, all positions are reset to 1/10 of equity (engine rebalances to target weights, costs on every traded notional); uninvested weight stays cash (no interest).',
            'Funded universe = frame listings whose weekly series has no calendar gap and reaches at least the last strategy session (last decision week + 14 calendar weeks) (engine price simulation cannot take terminal events; with listingLifecycleEvidence the cut series are therefore excluded and counted, i.e. this strategy stays a survivor-cohort result). Sessions = study calendar weeks from the first decision week to the last exit week; SPY must exist on every session.'
          ],
          metrics: ['endCapital', 'CAGR', 'maxDrawdown', 'Sharpe (weekly equity returns, rf = 0, x sqrt(52))', 'volatility', 'fees + slippage', 'turnover', 'average invested share', 'SPY buy-and-hold over the same sessions (weekly-benchmark.compare)'],
          inference: { family: 3, endpoint: 'mean weekly return difference strategy - SPY over all sessions', method: 'inferTemporalBlockMean, one observation per week, b = 52, Holm over the 3 strategies' },
          noShort: 'No short or long/short strategy from MOMENTUM_DETERIORATED or TREND_DOWN.'
        }
      },
      PATTERN_EVIDENCE: {
        candidates: PATTERN_PRICE_CANDIDATES, candidateSource: 'quant/methodology/pattern-research-v1.json (single price features, unchanged thresholds)',
        excludedCandidates: { 'up-volume-dominance': 'VOLUME_FEATURE_NOT_IN_WEEKLY_CLOSES', 'volume-accumulation': 'VOLUME_FEATURE_NOT_IN_WEEKLY_CLOSES', 'volume-dry-up-near-high': 'VOLUME_FEATURE_NOT_IN_WEEKLY_CLOSES' },
        features: 'pattern-research.featuresAt (closes up to t, runningMax context) and matchesPattern; cooldown 13 bars (V7/V8 runPatternStudy setting); events and outcomes follow runPatternStudy/runReplayValidation semantics; engine parity is checked on a registered listing subsample.',
        horizonsWeeks: [13, 52], endpoints: ['RAW_NET', 'SPY_EXCESS', 'BASE_RATE_EXCESS'],
        family: { size: 90, definition: '15 patterns x 2 horizons x 3 endpoints, Holm over all 90' },
        descriptive: ['robustness block 104', 'two-way cluster', 'distribution', 'regimes', 'subperiods', 'cost sensitivity', 'scope comparison with V7/V8 pattern studies'],
        engineParitySample: { method: 'smallest sha256("V10-STUDIES-PATTERN-PARITY-1.0.0|" + securityId)', listings: 25, patterns: ['above-40w-line', 'near-52w-high'], horizonWeeks: 13 }
      },
      SAME_STOCK_REPLAY: {
        descriptiveViewUnchanged: true, separation: 'Rule-based replay study, separate from the descriptive single-stock view and from any hand-picked example.',
        caseSelection: { method: 'Hash sample from the frame (not hand-picked): smallest sha256("V10-STUDIES-REPLAY-SAMPLE-1.0.0|seed=20261028|" + securityId)', listings: 200 },
        rule: { pattern: { id: 'ABOVE_40W_SMA', version: '1', terms: [{ feature: 'aboveSma40w', operator: 'eq', value: true }] }, cooldownBars: 13, engine: 'research-studies.runReplayValidation per listing (single listing, fixed pattern)' },
        horizonsWeeks: [13, 52], endpoints: ['RAW_NET', 'SPY_EXCESS', 'BASE_RATE_EXCESS'], control: 'BASE_RATE_EXCESS control = PATTERN_EVIDENCE control of the identical pattern above-40w-line (whole frame, same week).',
        persistence: { question: 'Does a stock\'s own earlier replay outcome predict its later replay outcome?', definition: 'Per sampled listing with >= 2 completed events in each chronological half (split at the listing\'s median event index): Spearman rank correlation (research-studies.rankCorrelation) between first-half and second-half mean BASE_RATE_EXCESS; p from Fisher z with sqrt(n-3) (approximate; cross-sectional dependence not modelled).', horizonsWeeks: [13, 52] },
        family: { size: 8, definition: '3 endpoints x 2 horizons + persistence x 2 horizons, Holm over 8' },
        descriptive: ['episodes per listing (cooldown-separated events)', 'event max drawdown (engine)', 'per-listing mean distribution', 'cost sensitivity'],
        dependence: 'D1 events are, by construction, the above-40w-line events of PATTERN_EVIDENCE restricted to the sample; D1 is not independent of D2.'
      }
    },
    survivorship: {
      withoutLifecycle: 'Reported as NOT_EVALUABLE: survivor cohort only.',
      withLifecycle: 'For every endpoint cell: observed-only, without delisted listings, with TERMINAL_CONSIDERATION (known cash per share replaces the exit value when the window passes lastTradeDate), bound -100 % and bound last close for still-censored outcomes; counts of censored/terminal outcomes.'
    },
    decisionRules: [
      'A cell is called significant only if Holm-adjusted p <= 0.05 within its registered family; sign and magnitude are reported regardless.',
      'An economic advantage claim requires SPY_EXCESS and BASE_RATE_EXCESS both Holm-significant positive at the same horizon; otherwise none is claimed.',
      'No parameter search, no winner selection, no change of rules after outcomes. Negative or non-significant results are reported unchanged.',
      'Nothing here changes a certification status, an active contract or a gate (NOT_CERTIFIED, productionApproved=false).'
    ],
    productionApproved: false
  };
}
module.exports = { plan, PATTERN_PRICE_CANDIDATES };
