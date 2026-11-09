'use strict';
// V11 strand DECOMPOSITION - the registered plan. Written into docs/quant-recovery/v11/decomposition/registration-1.0.0.json
// BEFORE any V11 outcome is computed; the runner reads every parameter back from the committed registration.
const PROTOCOL_FILE = 'docs/quant-recovery/v11/protocol/time-split-1.0.0.json';
const RULES = ['MOMENTUM_IMPROVED', 'MOMENTUM_DETERIORATED', 'TREND_UP', 'TREND_DOWN', 'NEW_52W_HIGH'];

function plan(protocolHash) {
  return {
    id: 'V11-DECOMPOSITION', version: '1.0.0', strand: 'decomposition',
    purpose: 'Explain systematically WHY the five V10 signal rules show no secured excess over SPY: additive return decomposition, entry/exit/holding, portfolio construction, costs, benchmark and return definition, power, regimes/time. Descriptive attribution, not a search for a winner.',
    protocol: { file: PROTOCOL_FILE, sha256: protocolHash, period: 'FULL_DESCRIPTIVE', firewall: 'R4: outputs of this strand are FULL_DESCRIPTIVE and must not be read by the DISCOVERY strand (enforced by instruction; stated in every output file).' },
    priorExposure: [
      'All V10 results of docs/quant-recovery/v10/studies/ca-id-lifecycle are known before this registration, in particular: 7/60 Holm rejections (6 raw returns), SPY excess 0/20, TREND_UP 13W base-rate excess -0.63 %, NEW_52W_HIGH 13W SPY excess +1.07 % (p 0.11), its subperiod SPY excess +5.1 % (2000-07) ... -0.7 % (2020-25), funded NEW_52W_HIGH 10 positions 13W CAGR 16.4 % vs SPY 5.9 %, not cost robust, ~97 % of signals skipped by the hash tie-break.',
      'This strand computed NO outcome before this registration. Computed beforehand (outcome-free): the lifecycle frame (4,329 listings, source manifest hash identical to the V10 lifecycle run), the detection flags, the funded schedule signal counts (42,054 NEW_52W_HIGH signals in the funded universe, 1,041 episodes) and two SEC requests listing the SPDR S&P 500 ETF Trust filings (CIK 884394, no XBRL companyfacts: HTTP 404).',
      'Periods 2000-2025 are explored history (protocol priorExposure). Nothing here is confirmatory.'
    ],
    population: {
      loaderOptions: { identityEvidence: true, corporateActionEvidence: true, listingLifecycleEvidence: true },
      frameRule: 'scripts/quant/v10/studies/common.cjs buildFrame (V10 frame rule, modal ISO-week labels, XNAS/XNYS/XASE) on the lifecycle loader; frame expected 4,329; the run aborts if the source manifest hash differs from the V10 lifecycle run (2c27039f...).',
      survivorship: 'Provider universe of today plus ended series; coverage of SEC 10-K filers 2000 14 %, 2010 22 %, 2020 48 % (protocol). Survivorship of issuers that vanished before universe formation is NOT measurable here; only the in-sample ended listings (V10 bounds) and the cap-weighted vs equal-weighted comparison are quantified.'
    },
    rules: RULES,
    signalTiming: 'V10: signal = engine detection at weekly close k (signal-backtest.js RULES, cooldown 13, warm-up 53), eligibility = V10 eligibleAt(k, WARMUP+COOLDOWN); base entry close k+1; exit after h weeks; every window requires a contiguous calendar path (else censored, counted).',
    signalWindow: ['2000-01-01', '2025-12-31'],
    returnBasis: 'PRICE_RETURN on both sides (split-adjusted weekly closes; SPY split-adjusted price, weekly-benchmark exact dates). Total return only in A5 as a separately labelled estimate.',
    costs: { basis: 'PER_SIDE_NOTIONAL', base: { feeBps: 10, slippageBps: 5 }, stress: { feeBps: 20, slippageBps: 30 }, net: 'net = (1+g)(1-s)/(1+s)-1, s=(fee+slippage)/1e4 (V10 netOf)', benchmarkCosts: 'SPY and population benchmarks without costs unless stated' },
    inference: {
      method: 'research-validation.inferTemporalBlockMean via V10 common.blockInference: circular calendar-block bootstrap over the study calendar 2000-2025, b = 52 (h <= 26), b = 104 (h >= 52), 1,999 replicates, seed 1729, basic interval, two-sided p; events per week move together (date clustering).',
      families: {
        A1: 'Holm over 5 rules x 4 horizons x 3 terms (SPY_EXCESS_NET, POPULATION_MINUS_SPY, SIGNAL_MINUS_POPULATION) = 60',
        A2_ENTRY: 'Holm over 5 rules x 4 delays x 2 endpoints (SPY excess net, population excess) at h = 13 = 40',
        A2_EXIT: 'Holm over the exit-variant cells (rules x variants x 2 endpoints) as listed in the result file',
        A2_CURVE: 'pointwise 95 % intervals only (descriptive curve, no test family)',
        A3: 'Holm over the 3 funded rules for each portfolio variant (weekly difference vs SPY, b = 52); random tie-break paths are reported as a distribution, not tested',
        A6: 'Power uses the Holm family of 60 (V10 signal family) and the funded family of 3'
      },
      note: 'All p-values are descriptive attribution diagnostics under the V10 stationarity assumption; observed and statistically secured excess are reported separately per cell.'
    },
    analyses: {
      A1_DECOMPOSITION: {
        horizonsWeeks: [4, 13, 26, 52],
        identity: 'For each event e (signal week t, entry t+1, exit t+1+h): net_e = S_e + (P_t - S_e) + (g_e - P_t) - cost_e, with g_e gross price return, S_e SPY price return same dates, P_t equal-weighted mean gross return of ALL eligible completed frame observations of week t (incl. signal events; same entry/exit dates), cost_e = g_e - net_e. Event means are additive exactly. SPY excess (net) = (P - S) + (g - P) - cost.',
        reconciliation: 'Also reported: V10 control mean (eligible, completed, rule NOT detected) to reconcile with the V10 BASE_RATE_EXCESS endpoint.',
        capWeighted: 'From 2010-01 (PIT market cap of the V10 factor panel, latest monthly rank date <= signal week, panel built on the V10 primary frame): P_EW - S = (P_EW(all) - P_EW(mcap subset)) [coverage] + (P_EW(sub) - P_CW(sub)) [equal-weight / size effect] + (P_CW(sub) - S) [composition, survivor cohort, residual]. Coverage of the market-cap subset reported per year.',
        censoring: 'Event states (observed, censored, immature, without SPY) counted per cell; V10 survivorship bounds (-100 % / last close for censored outcomes) quoted from the V10 evidence per cell as the Zensur term.',
        selectionProfile: '2010+: market-cap percentile of signal events vs population (median), listing age (weeks since first observed bar) of signal events vs population.'
      },
      A2_ENTRY_EXIT: {
        entryDelaysWeeks: [0, 1, 2, 4], entryHorizonWeeks: 13, entryNote: 'delay 0 = buy at the signal close itself (not executable without intraweek knowledge; upper bound). Reaction before entry = return from close k to close k+1 (vs SPY and population).',
        fixedHorizonsWeeks: [4, 8, 13, 26, 52, 104],
        trailingStops: [0.15, 0.25], trailingRule: 'peak of weekly closes since entry; breach detected at close k (close <= peak*(1-stop)), sold at close k+1 (same one-week execution lag as entries); maximum holding 52 weeks; no breach -> exit at 52',
        oppositeExit: 'signal-backtest.oppositeExit semantics (opposite rule detected at k, sold at k+1, maximum 52 weeks) for MOMENTUM_IMPROVED/DETERIORATED, TREND_UP/DOWN; for NEW_52W_HIGH (no opposite) the TREND_DOWN detection is used as the registered trend-break exit.',
        variableExitBenchmark: 'SPY over identical dates; population = weekly rebalanced equal-weighted frame index (mean weekly return of all listings observed in both consecutive calendar weeks with date >= listingStart), chained over identical dates; its difference to the buy-and-hold population mean is reported for the fixed horizons.',
        eventTimeCurve: { offsetsWeeks: [-26, -13, -4, -1, 0, 1, 2, 3, 4, 6, 8, 10, 13, 17, 21, 26, 34, 39, 45, 52, 65, 78, 91, 104], definition: 'offset < 0: cumulative return from close k+offset to close k (run-up before the signal); offset 0: reaction week close k -> k+1; offset > 0: cumulative from entry close k+1 to close k+1+offset. Endpoints: minus SPY (same dates), minus population (eligible at k, same window, buy-and-hold mean). Gross (no costs). Pointwise block-bootstrap 95 % intervals.' }
      },
      A3_PORTFOLIO: {
        engine: 'quant/engines/research-portfolio.cjs runPortfolio with the V10 fundedInput (numeraire 1, V10 deviation), sessions/universe/SPY exactly as V10.',
        rules: ['MOMENTUM_IMPROVED', 'TREND_UP', 'NEW_52W_HIGH'], holdingWeeks: 13,
        positions: [5, 10, 20, 50],
        weightings: { EQUAL: 'V10: every position 1/N of equity at each change, rest cash', VOL_INVERSE: 'weights proportional to 1/sigma (std of the 26 weekly log returns up to the decision week), scaled so the held positions sum to held/N (same invested share as EQUAL), single weight capped at 2/N with excess left in cash', FULLY_INVESTED: 'each held position 1/(number held) (no slot cash drag)' },
        tieBreaks: { HASH_V10: 'sha256("V10-STUDIES-FUNDED-1.0.0|"+id+"|"+date) (must reproduce V10)', RANDOM: 'sha256("V11-DECOMPOSITION-TIEBREAK-1.0.0|seed="+s+"|"+id+"|"+date), seeds 1..S' },
        randomPaths: { 'EQUAL_N10': 200, 'EQUAL_N5': 50, 'EQUAL_N20': 50, 'EQUAL_N50': 50, 'VOL_INVERSE_N10': 50, 'FULLY_INVESTED_N10': 50 },
        metrics: ['CAGR', 'excess CAGR vs SPY (same sessions)', 'maxDrawdown', 'Sharpe', 'average invested share (cash drag)', 'one-way turnover per year', 'fees+slippage', 'share of signals skipped', 'weekly difference vs SPY (block bootstrap, HASH path only)'],
        distribution: 'For random paths: mean, p5, p25, median, p75, p95 of CAGR and excess CAGR; share of paths with excess CAGR > 0; position of the V10 hash path in that distribution.'
      },
      A4_COSTS: {
        eventBreakEven: 'Per rule and horizon: per-side cost s* with mean net = mean SPY (closed form: q=(1+mean S)/(1+mean g), s*=(1-q)/(1+q)); negative s* means no cost level yields a positive SPY excess. Against the population: costs are symmetric in V10, so the base-rate excess is cost-invariant to first order; reported as such.',
        costGridPerSideBps: [[0, 0], [10, 5], [20, 30], [25, 25], [50, 50], [100, 100]],
        fundedBreakEven: 'HASH path, N = 10, EQUAL: CAGR and weekly-difference p over the cost grid; break-even = linear interpolation where excess CAGR crosses 0; also the cost level where the weekly-difference p (block bootstrap, unadjusted) crosses 0.05.'
      },
      A5_BENCHMARK_REFERENCE: {
        python: 'scripts/quant/v11/decomposition/verify_decomposition.py (stdlib, python3 -I): independent re-derivation from the raw weekly series files and the SPY daily file (loader qualification and series bounds taken from the committed V10 lifecycle source manifest as input), of event outcomes, SPY returns, population means and the A1 terms for all rules at h 13 and 52 and the entry delays at h 13; and an independent equal-weight ledger of the funded NEW_52W_HIGH HASH path (N 10) with checks that strategy and SPY use identical session dates, price-return definition, split adjustment, costs only on the strategy side, cash without interest.',
        spyDividends: 'SPY total vs price return from the SPDR S&P 500 ETF Trust annual reports (form N-30D, fiscal year ending 30 Sept; Financial Highlights: distributions per unit and total return) fetched with scripts/quant/sec/http_client.py (<= 2 requests/s, private cache); facts with accession, URL, SHA-256 and quote <= 300 characters. Fiscal-year dividend yield = distributions / average of beginning and ending NAV; applied to the SPY comparison as an ESTIMATE (calendar mismatch Sept vs Dec, even spreading within the year).',
        signalDividends: '2010+: issuer dividend yield = PaymentsOfDividendsCommonStock (latest 10-K FY value filed before the signal week, companyfacts bulk archive of the V10 factor strand, private) / PIT market cap (V10 factor panel); mean for signal events vs the population of the same weeks; order of magnitude only (issuer level, ignores multiple listings and special dividends).'
      },
      A6_POWER: {
        definition: 'Per A1 SPY-excess cell and V10 family cell: SE = (CI upper - CI lower)/(2*1.96) of the block bootstrap; N_eff = sample variance / SE^2; minimum detectable effect at 80 % power: MDE = (z_{1-alpha_k/2} + z_{0.8}) * SE with alpha_k = 0.05/60 (first Holm step, worst case) and 0.05 (last step, best case); annualised MDE = MDE_h * 52/h (simple scaling, stated). Funded strategies: weekly difference SE, family 3, MDE annualised x52.',
        verdict: 'Each cell: observed estimate, secured = Holm-rejected sign with CI bound, else NOT_SECURED; whether |observed| >= MDE.'
      },
      A7_REGIME_TIME: {
        subperiods: [['2000-01-01', '2007-12-31'], ['2008-01-01', '2012-12-31'], ['2013-01-01', '2019-12-31'], ['2020-01-01', '2025-12-31']],
        protocolPeriods: 'TRAIN 2001-2012, VALIDATION 2013-2018, TEST 2019-2025 of the price-rule protocol, shown descriptively (FULL_DESCRIPTIVE; no selection made on them).',
        regimes: 'V10 REGIME_CONFIG on SPY weekly closes (trend 26 weeks +-5 %, volatility 26 weeks vs 25 %).',
        decomposition: 'Per subperiod and regime the A1 terms (SPY, P-S, g-P, cost) at h 13 and 52; change 2000-07 -> 2020-25 attributed to delta(P-S) [benchmark/population], delta(g-P) [selection effect decay], delta(cost).',
        populationChange: 'Per year: eligible listings, median listing age, share of signal events from listings younger than 3 years, 2010+: median market-cap percentile of events.'
      },
      A8_CAUSE_MATRIX: 'Per rule (h 13, the funded horizon; plus h 52): contribution in percentage points and share of |total| for: selection (g-P), entry (delay 1 vs 0, reaction week), exit/holding (best/worst registered exit variant vs fixed h), weighting (EQUAL vs VOL_INVERSE vs FULLY_INVESTED, random tie-break dispersion), costs, benchmark (P-S incl. equal-weight/size and composition split 2010+, dividends estimate), data coverage (censoring bound, survivor cohort), uncertainty (MDE vs observed). Explanatory text; Python cross-check of the A1 terms.'
    },
    outputs: ['registration-1.0.0.json', 'decomposition-results.json', 'benchmark-reference-check.json', 'power-analysis.json', 'cause-matrix.json', 'README.md'],
    evidence: { evidenceKind: 'HISTORICAL_DEVELOPMENT_STUDY (decomposition, FULL_DESCRIPTIVE)', certificationStatus: 'NOT_CERTIFIED', productionApproved: false },
    decisionRules: [
      'No rule, parameter or variant is selected as a candidate; variants exist only to attribute the V10 result.',
      'Observed and statistically secured excess are reported separately; non-significant and negative results are reported unchanged.',
      'Any deviation from this plan is disclosed in the result file with reason.'
    ]
  };
}
module.exports = { plan, PROTOCOL_FILE, RULES };
