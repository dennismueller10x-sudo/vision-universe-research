#!/usr/bin/env node
'use strict';
// V11 DISCOVERY – writes candidates-frozen-1.0.0.json (R2) from the TRAIN exploration log: exact specifications of
// the chosen variants (max 12 per family), their TRAIN evidence, the choice rationale, the VALIDATION endpoint,
// Holm families and the final-selection rule. Must be committed BEFORE validate.cjs runs.
const path = require('node:path');
const L = require('./lib.cjs');

const CHOICE = {
  PRICE: [
    ['P3-MOM6_REV1-N20-R4-BUFFER90-EW-PX5', 'strongest TRAIN own-universe excess; buffer halves turnover vs FULL'],
    ['P3-MOM6_REV1-N30-R4-FULL-EW-PX5', 'same signal, broader, positive in both halves'],
    ['P2-MOM_REV1-N20-R4-FULL-INVVOL-PX5', '12-1 momentum + 1-month reversal, inverse-vol weights; positive in both halves'],
    ['P2-MOM3-N20-R4-BUFFER90-EW-PX5', '3-month momentum with buffer; positive in both halves'],
    ['P2-MOM3-N20-R4-FULL-INVVOL-PX5', '3-month momentum inverse-vol; positive in both halves'],
    ['P3-MOM3-N50-R4-BUFFER90-EW-PX5', 'diversified 3-month momentum; positive in both halves'],
    ['P2-MOM6-N20-R4-FULL-EW-PX5-VOL60', '6-month momentum excluding annualised vol > 60%'],
    ['P2-MOM6-N20-R13-FULL-EW-PX5', 'quarterly rebalanced 6-month momentum (low turnover)'],
    ['P3-MOM6-N50-R4-BUFFER90-EW-PX5-MF', 'momentum with SPY 40-week market filter: drawdown control (MDD -25%), positive in both halves'],
    ['P2-SLOPER2-N50-R4-FULL-EW-PX5-MF', 'trend stability (slope x R2) with market filter; positive in both halves'],
    ['P2-MOM6_REV1-N20-R4-FULL-EW-PX5-MF', 'momentum+reversal with market filter; positive in both halves'],
    ['P2-MOM6-N20-R4-RUN-E95-X50-TX-PX5', 'let-winners-run representative (owner hypothesis); best RUN variant, weak in TRAIN']
  ],
  FUND: [
    ['F3-VALUE_PROF_MOM-N20-M3-FULL-EW-PX5-MC300', 'value + profitability + 12-1 momentum, quarterly; positive in both halves'],
    ['F2-VALUE_PROF_MOM-N20-M1-FULL-EW-PX5-MC300', 'same, monthly'],
    ['F3-VALUE_PROF_MOM-N20-M1-FULL-INVVOL-PX5-MC300', 'same, inverse-vol weights'],
    ['F2-VALUE-N20-M1-BUFFER90-EW-PX5-MC300', 'PIT value score with buffer; equal excess in both halves'],
    ['F2-VALUE-N20-M3-FULL-EW-PX5-MC300', 'PIT value score quarterly'],
    ['F2-QUAL-N10-M3-FULL-EW-PX5-MC300', 'concentrated quality, quarterly'],
    ['F2-QUAL-N50-M1-FULL-INVVOL-PX5-MC300', 'diversified quality, inverse vol'],
    ['F3-QUAL_LOWVOL-N20-M3-FULL-EW-PX5-MC300', 'defensive quality: best TRAIN Sharpe (1.32), MDD -9.5%'],
    ['F2-QUAL_LOWVOL-N20-M1-FULL-EW-PX5-MC300', 'defensive quality monthly'],
    ['F2-PROF_MOM-N20-M3-FULL-EW-PX5-MC300', 'profitability + momentum quarterly (V10 IC prior)'],
    ['F1-VALUE_MOM-N50-M1-FULL-EW-PX5-MC300', 'value + momentum diversified; positive in both halves'],
    ['F2-PROF_MOM-N20-M1-RUN-E95-X50-TX-PEXIT40-PX5-MC300', 'let-winners-run with quality (profitability) and trend exit (owner hypothesis); weak in TRAIN']
  ]
};

function main() {
  const log = new Map(require('node:fs').readFileSync(path.join(L.PRIVATE, 'train-exploration.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l)).map(e => [e.id, e]));
  const reg = L.readJson(path.join(L.DOCS, 'registration-1.0.0.json'));
  const fam = f => CHOICE[f].map(([id, why], k) => {
    const e = log.get(id); if (!e) throw Error('NOT_IN_TRAIN_LOG:' + id);
    return { candidateId: (f === 'PRICE' ? 'CP' : 'CF') + String(k + 1).padStart(2, '0'), variantId: id, spec: e.spec, rationale: why,
      train: { cagr: e.cagr, sharpe: e.sharpe, maxDrawdown: e.maxDrawdown, turnoverPerYear: e.turnoverPerYear, exVsSpy: e.exVsSpy, exVsOwnEw: e.exVsOwnEw, stressExVsSpyAnn: e.stress.exVsSpyAnn, halvesVsOwnEw: e.halves.map(h => h.vsOwnEw) } };
  });
  const doc = {
    schemaVersion: 'v11-discovery-candidates-frozen-1.0.0', studyId: L.STUDY_ID + ':CANDIDATES', frozenBeforeAnyValidationOutcome: true, protocolSha256: L.protocolHash(), rule: 'R2',
    choiceCriteria: 'Chosen on TRAIN evidence only: own-universe excess > 0 with preference for positive excess in both TRAIN halves, cost-stress excess vs SPY > 0, diversity of signal/holding/weighting types, and the explicitly requested hypothesis types (concentration, market filter, let-winners-run, quality/value/profitability combinations). Not simply the top-12 in-sample: the TRAIN walk-forward showed that picking the best explored variant has no out-of-sample value.',
    trainWarnings: ['Walk-forward within TRAIN (quoted price >= 5 universe): best-variant selection earned -0.53%/interval vs own EW out of sample, below the average variant (-0.23%); FUND -0.09% vs -0.12%.', 'No TRAIN own-universe excess survives a correction for 203 trials.', 'Oracle TRAIN: explored rules capture 0-3% of the oracle premium; mean forward percentile of picks 0.49-0.52.'],
    trialsBehindThisSet: { total: 203, price: 108, fund: 66, v10Baselines: 10, smokeIncludedInCounts: true },
    families: { PRICE: { period: L.protocol().periods.priceRules.VALIDATION, candidates: fam('PRICE') }, FUND: { period: L.protocol().periods.fundamentalRules.VALIDATION, candidates: fam('FUND') } },
    validationPlan: { computedOnce: true, primaryEndpoint: reg.evaluation.primaryEndpoint, primaryHolmFamily: 'per family (12 tests each), p vs SPY (block 26 w)', secondaryHolmFamily: 'per family, p vs own-universe EW', inference: reg.evaluation.inference, costs: reg.evaluation.costs, benchmarks: reg.evaluation.benchmarks, firstYearSeparately: true, ledger: 'research-portfolio.cjs official ledger + simulator parity per candidate' },
    finalSelectionRule: reg.finalSelectionRule,
    certificationStatus: 'NOT_CERTIFIED', productionApproved: false };
  L.writeJson(path.join(L.DOCS, 'candidates-frozen-1.0.0.json'), doc);
  console.log('frozen', doc.families.PRICE.candidates.length, doc.families.FUND.candidates.length);
}
main();
