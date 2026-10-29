#!/usr/bin/env node
'use strict';
// V11 DISCOVERY – compiles the private TRAIN exploration log, the walk-forward within TRAIN and the TRAIN oracle
// into compact repository evidence (no new computation). Usage: node compile-train.cjs
const fs = require('node:fs'), path = require('node:path');
const L = require('./lib.cjs');

function main() {
  const log = fs.readFileSync(path.join(L.PRIVATE, 'train-exploration.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  const stages = [...new Set(log.map(e => e.stage))];
  const trials = log.map(({ intervals, ...e }) => e);
  const count = f => trials.filter(f).length;
  const doc = {
    schemaVersion: 'v11-discovery-train-exploration-1.0.0', studyId: L.STUDY_ID + ':TRAIN_EXPLORATION', period: 'TRAIN', protocolSha256: L.protocolHash(), evidenceKind: 'HISTORICAL_DEVELOPMENT_STUDY',
    trainPeriods: { PRICE: L.protocol().periods.priceRules.TRAIN, FUND: L.protocol().periods.fundamentalRules.TRAIN },
    gardenOfForkingPaths: { totalEvaluatedVariants: trials.length, candidateVariantsPrice: count(e => e.family === 'PRICE'), candidateVariantsFund: count(e => e.family === 'FUND'), v10Baselines: count(e => e.family === 'V10RULE'),
      byStage: Object.fromEntries(stages.map(s => [s, count(e => e.stage === s)])),
      designDecisionsTakenAfterSeeingTrainOutcomes: [
       'S1 -> S1b: universe restricted to quoted (unadjusted) price >= 5 USD after the S1 diagnostic showed that penny-stock survivors (min quoted price < 1 USD, e.g. MITK, IESC, LPTH) drive the extreme S1 results (MOM3-N20 50% CAGR, LOWBETA-N10 54%).',
       'S2/S3 variants chosen around the better S1b/S2 signals (momentum 3/6 months, 12-1 momentum with 1-month reversal, trend stability, value+profitability+momentum, quality).',
       'FUND universe fixed a priori at quoted price >= 5 USD and PIT market cap >= 300 Mio USD (one size variant each at 1 bn and without cap filter).'],
      note: 'Every evaluated variant is listed; nothing was dropped. Walk-forward within TRAIN (wf-train) measures whether choosing the best explored variant has out-of-sample value.' },
    returnBasis: 'PRICE_RETURN (strategy and all benchmarks)', costs: L.COSTS, weighting: 'per variant', investment: 'fully invested except market filter / exit rules (cash earns 0)',
    benchmarks: 'SPY price, EW own universe, EW frame population, PIT cap-weighted population (FUND 2011+)',
    inference: L.INFERENCE, survivorship: 'TRAIN populations contain no delisted firm (all frame series end 2023 or later). The EW universe beats SPY by ~9 pp/yr in price TRAIN mostly because of this conditioning; the own-universe EW is therefore the selection-skill benchmark.',
    columns: 'cagr/sharpe/maxDrawdown/turnoverPerYear of the strategy (base costs); ex* = annualised mean weekly excess and block-bootstrap p (26 w); halves = annualised excess in the two TRAIN halves',
    trials, certificationStatus: 'NOT_CERTIFIED', productionApproved: false };
  L.writeJson(path.join(L.DOCS, 'train-exploration-log-1.0.0.json'), doc);
  const wf = L.readJson(path.join(L.PRIVATE, 'wf-train.json')).map(({ oosRows, ...r }) => r);
  L.writeJson(path.join(L.DOCS, 'train-walk-forward-1.0.0.json'), { schemaVersion: 'v11-discovery-wf-train-1.0.0', studyId: L.STUDY_ID + ':WF_TRAIN', period: 'TRAIN', protocolSha256: L.protocolHash(), engine: 'research-validation buildWalkForward/runWalkForward (EXPANDING)',
    question: 'Does picking the best explored TRAIN variant (top 5 on the train fold, best of those on the validation fold) beat the average variant on the test fold?', results: wf, certificationStatus: 'NOT_CERTIFIED', productionApproved: false });
  const o = L.readJson(path.join(L.PRIVATE, 'oracle-TRAIN.json'));
  L.writeJson(path.join(L.DOCS, 'oracle-train-1.0.0.json'), o);
  console.log('trials', trials.length, JSON.stringify(doc.gardenOfForkingPaths.byStage));
}
main();
