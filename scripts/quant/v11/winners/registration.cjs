#!/usr/bin/env node
'use strict';
// V11 strand WINNERS – pre-registration of the winner anatomy (written and committed BEFORE any
// forward return, winner assignment or feature-outcome comparison is computed).
// Usage: node scripts/quant/v11/winners/registration.cjs [--out <file>]
const fs = require('node:fs'), path = require('node:path');
const ROOT = path.resolve(__dirname, '../../../..');
const V = require(ROOT + '/quant/engines/research-validation.cjs');
const PROTOCOL = 'docs/quant-recovery/v11/protocol/time-split-1.0.0.json';
const PROTOCOL_SHA = fs.readFileSync(path.join(ROOT, 'docs/quant-recovery/v11/protocol/time-split-1.0.0.sha256'), 'utf8').split(/\s+/)[0];

const PRICE_FEATURES = [
  ['mom3m', 'close(t)/close(t-13w)-1', 'higher'],
  ['mom6m', 'close(t)/close(t-26w)-1', 'higher'],
  ['mom12_1m', 'close(t-4w)/close(t-52w)-1 (12-1 month momentum)', 'higher'],
  ['rsSpy12_1m', 'ln(close(t-4w)/close(t-52w)) - ln(SPY(t-4w)/SPY(t-52w)) (relative strength vs SPY, price return both sides)', 'higher'],
  ['near52wHigh', 'close(t)/max(close over last 52 weekly bars incl. t) (1 = at the high)', 'higher'],
  ['shareAbove40w', 'share of the last 52 weekly bars (t-51..t) whose close is above the 40-week simple moving average of that bar (needs 91 bars)', 'higher'],
  ['trendSlope52w', 'OLS slope of ln(close) on week index over t-51..t, times 52 (annualised log trend)', 'higher'],
  ['trendR2_52w', 'R^2 of that regression (trend smoothness)', 'higher'],
  ['drawdown52w', 'max drawdown depth over t-52..t as positive number (0 = none)', 'lower'],
  ['vol52w', 'annualised standard deviation of weekly log returns t-51..t (x sqrt 52)', 'lower']
];
const FUNDAMENTAL_FEATURES = [
  ['logMarketCap', 'ln(PIT market cap): shares outstanding (filed < t) x close(t) x split factor (factor/factors.cjs#marketCapAt, ADR-002)', 'size'],
  ['revenueGrowthTtmYoy', 'fundamental-inputs.compute raws.revenueGrowthTtmYoy', 'growth'],
  ['revenueCagr3y', 'raws.revenueCagr3y', 'growth'],
  ['epsCagr3y', 'raws.epsCagr3y (earnings growth)', 'growth'],
  ['grossMarginTtm', 'change.grossMarginTtm (gross profit / revenue, TTM)', 'profitability'],
  ['operatingMarginTtm', 'raws.operatingMarginTtm', 'profitability'],
  ['roaTtm', 'raws.roaTtm', 'profitability'],
  ['roeTtm', 'raws.roeTtm (only equity > 0)', 'profitability'],
  ['salesYield', 'raws.salesYield = revenue TTM / EV (inverse EV/Sales)', 'valuation'],
  ['earningsYield', 'raws.earningsYield = net income TTM / market cap (inverse P/E, negative allowed)', 'valuation'],
  ['bookToMarket', 'raws.bookToMarket', 'valuation'],
  ['accrualRatio', 'raws.accrualRatio ((NI - OCF)/avg assets)', 'quality'],
  ['netDebtToAssets', 'raws.netDebtToAssets (leverage)', 'quality'],
  ['fcfMarginTtm', 'raws.fcfMarginTtm', 'quality']
];

const registration = {
  id: 'V11-WINNERS', version: '1.0.0', strand: 'winners', period: 'FULL_DESCRIPTIVE',
  protocol: { path: PROTOCOL, sha256: PROTOCOL_SHA, rule: 'R4: descriptive strand, full period allowed; outputs firewalled from the DISCOVERY strand (must not read docs/quant-recovery/v11/winners or scripts/quant/v11/winners).' },
  purpose: 'Describe which publicly and historically observable properties exceptional winners had BEFORE their large price rise, compared with contemporaneous average stocks and losers, and how much ex-ante separation each property had (lift, precision/recall, false positives, rank AUC). Descriptive anatomy, not a strategy and not a candidate source.',
  priorExposure: [
    'V7-V10 studied the same 2000-2025 history: momentum/52W-high/trend signals and the reconstructed factor rank IC (momentum, profitability, quality small positive IC; quintile spreads without excess).',
    'NVIDIA is a known ex-post winner and is named by the owner as case study; it is not used to choose features or thresholds.',
    'Before this registration the strand computed only outcome-free quantities: loader qualification and frame (4,329 listings, 121 ended, lifecycle kinds), calendar range. No forward return, winner label or feature distribution was computed.'
  ],
  population: {
    loaderOptions: { identityEvidence: true, corporateActionEvidence: true, listingLifecycleEvidence: true },
    frameRule: 'scripts/quant/v10/studies/common.cjs buildFrame (modal ISO-week labels, primary exchanges XNAS/XNYS/XASE); identityEvidenceProtocolV10 NOT used.',
    cohortMembership: 'At cohort date t a frame listing is a member when it has a weekly close exactly at t, listingStart <= t, and the 52 preceding weekly bars are contiguous on the frame calendar (k >= 52, no calendar gap in k-52..k). Listings younger than 52 weeks at t are excluded and counted (IPO-year exclusion).',
    survivorship: 'Frame = today\'s provider universe + ended series kept by listingLifecycle (19 SEC-sourced delistings incl. 5 cash mergers, 2 delisted without consideration; 102 unsourced frozen tails cut and censored). For each cohort the gap is reported as members / SEC 10-K filers of that ISO year (docs/quant-recovery/v10/population/population-frame-1.0.0.json perIsoYear.sec10KFilers; 10-K filers include OTC and non-listed registrants, order of magnitude).'
  },
  cohorts: {
    dates: 'Last frame-calendar date of March, June, September and December, 2001-Q1 through 2024-Q4 (96 quarterly cohort dates). December dates form the annual sub-view.',
    horizons: { '1Y': 52, '3Y': 156, '5Y': 260 },
    maturity: 'A (cohort, horizon) is used only when the scheduled exit week t+1+h is on or before the last frame-calendar date (data as of 2026-10-26); immature cohorts are counted and excluded. No outcome information enters membership.',
    overlap: 'Quarterly cohorts with 3Y/5Y horizons overlap; inference uses blocks of consecutive cohort dates (below).'
  },
  forwardReturn: {
    entry: 'close of the next frame-calendar week after t (k+1); features use closes up to t only.',
    exit: 'close at k+1+h on a contiguous calendar path.',
    basis: 'PRICE_RETURN (split-adjusted weekly closes, no dividends) for all stocks; SPY PRICE_RETURN over the same dates as context. Ranking is cross-sectional, therefore costs (10+5 bps per side) do not change classes; they are stated for completeness.',
    seriesEndsBeforeExit: {
      CASH_MERGER: 'terminal value = sourced cashPerShare (TERMINAL_CONSIDERATION)',
      DELISTED_NO_CONSIDERATION: 'terminal value = 0 (-100 %)',
      OTHER: 'STOCK_MERGER, CASH_AND_STOCK, UNKNOWN and unsourced frozen tails are CENSORED: primary value = last observed close (LAST_CLOSE bound); sensitivity = -100 % (MINUS_100 bound). Counts per cohort and the number of class changes between the bounds are reported.',
      noEntryBar: 'member whose series ends at t (no k+1 bar) is excluded and counted.'
    }
  },
  classes: {
    rule: 'Within each (cohort, horizon) rank members by forward return (descending; ties at a boundary are all included).',
    WINNER_TOP1: 'top ceil(0.01 n) members',
    WINNER_TOP5: 'top ceil(0.05 n) members',
    LOSER: 'bottom ceil(0.10 n) members, plus any member with terminal DELISTED_NO_CONSIDERATION inside the window',
    AVERAGE: 'members with forward-return percentile rank in the middle quintiles (Q2-Q4: rank percentile in (0.2, 0.8])',
    note: 'Classes are relative to the contemporaneous frame population, not to SPY.'
  },
  features: {
    availability: 'Only information available at t: weekly closes up to t; SEC PIT documents of the V10 factor strand (pit_docs.py versions with from <= t and asOf <= t-1, i.e. filed < t) evaluated by quant/engines/fundamental-inputs.js compute(doc, t-1, marketCap). No current values.',
    price: { from: '2001-Q1', list: PRICE_FEATURES },
    fundamental: { from: '2011-Q1 (protocol: fundamentals before 2011 excluded; panel available from 2010)', list: FUNDAMENTAL_FEATURES,
      exclusions: 'listings without CIK, without PIT document or without a visible filing are missing for fundamentals (counted); banks/insurers/REITs (industry template, SIC 6020-6220, 6300-6399, 6798) excluded from margin/valuation/quality features as in the V10 factor reconstruction; market cap withheld by the V10 reasons (multi-listing issuer, foreign reporting currency, no PIT share count).' },
    standardisation: 'Per cohort date each feature is converted to a mid-rank percentile among members with a finite value (direction as stated; quintiles from these percentiles). Raw medians are reported for interpretation.'
  },
  endpoints: {
    E1_effect: 'Per (feature, horizon, winner definition, cohort): mean percentile of WINNERS minus mean percentile of AVERAGE, and WINNERS minus LOSERS; averaged over cohorts.',
    E2_auc: 'Per cohort rank AUC (Mann-Whitney) of the feature for WINNER vs all other members; averaged over cohorts; 0.5 = no separation.',
    E3_baseRates: 'Pooled and per-cohort: base rate P(W); P(W | feature in top quintile); P(W | bottom quintile); lift = P(W|topQ)/P(W); precision = P(W|topQ); recall = share of winners in topQ; false-positive share = share of top-quintile members that did NOT become winners; FPR = P(topQ | non-winner); P(LOSER | topQ) to show two-tailed enrichment.',
    E4_translation: 'Mean and median forward return of the feature top quintile minus the cohort equal-weight population mean (descriptive; explains why separation does not translate into excess).',
    E5_tailShare: 'Share of the cohort equal-weight forward gain attributable to WINNER_TOP1/TOP5 (skewness).',
    splits: 'E1/E2/E3 also by SPY trend regime at t (research-studies.classifyRegimes, trailing 26 weeks, band 5 %), by V10 subperiods (2000-07, 2008-12, 2013-19, 2020-25 by cohort date), and by rate phase: 52-week change of the US 10Y CMT yield at t (quant/data/market/multi-asset/series/US10Y.json, US Treasury): RISING >= +0.50 pp, FALLING <= -0.50 pp, else FLAT. The SPY trend regime is the SPY-regime proxy requested by the owner; the yield-change proxy is reported beside it.'
  },
  inference: {
    unit: 'cohort date (one statistic per cohort), calendar = the quarterly cohort dates of the horizon',
    method: 'research-validation.inferTemporalBlockMean (circular block bootstrap over consecutive cohort dates), block length = horizon in quarters (1Y: 4, 3Y: 12, 5Y: 20), 1,999 replicates, seed 1729, alpha 0.05',
    multipleTesting: 'Holm over the E2 family (all features x 3 horizons x 2 winner definitions, H0 AUC = 0.5) and separately over the E1 winner-vs-average family; results are descriptive (FULL_DESCRIPTIVE), not candidate rules.',
    limitation: 'Overlapping 3Y/5Y cohorts leave few independent blocks (5Y: about 4); intervals are wide by construction.'
  },
  caseStudies: {
    nvda: 'ref_NVDA: all quarterly cohort dates 2014-Q4..2024-Q4 with features, percentiles, forward returns, classes and the SEC accession/filed date of the TTM revenue fact used; profile peers (below).',
    selection: 'Systematic: for each V10 subperiod (by cohort date) the two distinct listings with the highest 3Y forward return among all members (primary censoring), excluding ref_NVDA; if a listing repeats, the next one is taken. No hand-picking. Data plausibility of each selected case (corporate-action or price-scale artefacts) is checked and reported, never repaired.',
    profilePeers: 'At the case cohort date: members sharing the case listing\'s top-quintile memberships on mom12_1m, near52wHigh, revenueGrowthTtmYoy and operatingMarginTtm (only features available); report their count, forward return distribution and winner shares.'
  },
  pythonCheck: 'Independent stdlib Python (python3 -I) from an exported private input (loader-qualified weekly closes and lifecycle, SPY, cohort dates): recomputes forward returns, class assignment for every cohort/horizon, the price features for all members and fundamental features for a sample from the PIT documents, and the pooled lift tables. A second language is technical parity, not a holdout.',
  costs: { feeBps: 10, slippageBps: 5, note: 'not applied to ranking; stated for E4 context only' },
  evidenceKind: 'HISTORICAL_DEVELOPMENT_STUDY', certificationStatus: 'NOT_CERTIFIED', productionApproved: false
};

// Amendment 1.0.1 (committed before any winner/feature comparison was computed).
const AMENDMENT_1_0_1 = {
  id: 'V11-WINNERS', version: '1.0.1', amends: { version: '1.0.0', registrationHash: V.hash(registration) },
  reason: 'Outcome-free availability check of the built member set (feature counts per cohort; no forward return compared with any feature): salesYield (revenue/EV) and netDebtToAssets need a net-debt figure and are finite for only 2-9 % of fundamental members (e.g. 2016-03: 78 resp. 100 of 2,273 members). They stay in the tables (counted) but cannot carry the valuation/leverage questions.',
  added: [['salesToMarketCap', 'revenue TTM (PIT document ttm.revenue, version filed < t) / PIT market cap = inverse price-to-sales; substitute for EV/Sales', 'valuation'],
    ['equityToAssets', 'fundamental-inputs raws.equityToAssets (balance-sheet leverage; higher = less leverage); substitute for netDebtToAssets', 'quality']],
  unchanged: 'All other definitions, classes, endpoints, inference and splits of 1.0.0.',
  disclosure: 'Decided after seeing feature availability counts and the forward return of the pre-named case NVDA at 2016-03 (a known ex-post fact named by the owner), before any winner/feature comparison was computed.'
};

function main() {
  if (process.argv.includes('--amendment-1.0.1')) {
    const out = path.join(ROOT, 'docs/quant-recovery/v11/winners/registration-amendment-1.0.1.json');
    const doc = { schemaVersion: 'v11-winners-registration-amendment-1.0.1', registeredAt: new Date().toISOString(), amendmentHash: V.hash(AMENDMENT_1_0_1), amendment: AMENDMENT_1_0_1 };
    fs.writeFileSync(out, JSON.stringify(doc, null, 1) + '\n'); console.log(out, doc.amendmentHash); return;
  }
  const i = process.argv.indexOf('--out');
  const out = i > 0 ? process.argv[i + 1] : path.join(ROOT, 'docs/quant-recovery/v11/winners/registration-1.0.0.json');
  const doc = { schemaVersion: 'v11-winners-registration-1.0.0', registeredAt: new Date().toISOString(), registrationHash: V.hash(registration), registration };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(doc, null, 1) + '\n');
  console.log(out, doc.registrationHash);
}
if (require.main === module) main();
module.exports = { registration, AMENDMENT_1_0_1, PRICE_FEATURES, FUNDAMENTAL_FEATURES, PROTOCOL_SHA };
