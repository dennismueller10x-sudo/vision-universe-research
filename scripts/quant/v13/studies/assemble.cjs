#!/usr/bin/env node
'use strict';
// V13 STUDIES - builds the compact public S1/S2 evidence (docs/quant-recovery/v13/studies/) from the private per-frame runs of
// run-frame.cjs. Only aggregate statistics are published (cell means, counts, p-values); no series, no event list.
//   node scripts/quant/v13/studies/assemble.cjs --private <dir> [--outDir docs/quant-recovery/v13/studies]
const fs = require('node:fs'), path = require('node:path');
const W = require('./lib.cjs'), K = W.K;

const FRAMES = ['F0', 'F1', 'F1w', 'F1c'];
const LABEL = { F0: 'REGISTERED_BASELINE', F1: 'REGISTERED_PRIMARY', F1c: 'REGISTERED_SENSITIVITY', F1w: 'AMENDMENT_1.0.1_SENSITIVITY' };
const r6 = W.r6;

function load(dir, f) {
  const d = path.join(dir, f), j = n => JSON.parse(fs.readFileSync(path.join(d, n), 'utf8'));
  const metaSignal = fs.existsSync(path.join(d, 'run-meta-v13-signalrun.json')) ? j('run-meta-v13-signalrun.json') : j('run-meta-v13.json');
  return { ev: j('signal-backtest-evidence.json'), term: j('s1-terminal.json'), s2: j('s2-population.json'), meta: j('run-meta-v13.json'), metaSignal, funded: j('funded-strategy-evidence.json'), parity: j('parity-engine-signal.json') };
}
const cellKey = c => c.rule + '|' + c.horizonWeeks + '|' + c.endpoint;

function main() {
  const o = W.args(process.argv.slice(2), { private: null, outDir: path.join(W.ROOT, W.STUDY_DIR) });
  const R = Object.fromEntries(FRAMES.filter(f => fs.existsSync(path.join(o.private, f, 's1-terminal.json'))).map(f => [f, load(o.private, f)]));
  if (!R.F0 || !R.F1) throw Error('F0_AND_F1_REQUIRED');
  const reg = K.readRegistration().registration, SB = reg.studies.SIGNAL_BACKTEST;
  const regSha = W.registrationSha(), amSha = W.amendmentSha();
  // ---------- F0 reproduction against the committed V10 lifecycle run ----------
  const v10 = JSON.parse(fs.readFileSync(path.join(W.ROOT, 'docs/quant-recovery/v10/studies/ca-id-lifecycle/signal-backtest-evidence.json'), 'utf8'));
  const v10c = new Map(v10.cells.map(c => [cellKey(c), c]));
  let identicalN = 0, maxAbsDiff = 0, holmSame = 0;
  for (const c of R.F0.ev.cells) { const v = v10c.get(cellKey(c)); if (v.n === c.n) identicalN++; maxAbsDiff = Math.max(maxAbsDiff, Math.abs(v.estimate - c.estimate)); if (v.holmReject === c.holmReject) holmSame++; }
  const f0Repro = { committedRun: 'docs/quant-recovery/v10/studies/ca-id-lifecycle (V10 lifecycle frame, manifest 2c27039f...)', cells: R.F0.ev.cells.length, cellsWithIdenticalN: identicalN, maxAbsEstimateDiff: maxAbsDiff, sameHolmDecision: holmSame,
    v10Frame: v10.population.frame, f0Frame: R.F0.ev.population.frame, note: 'F0 is rebuilt with the current loader/registers (manifest ' + R.F0.meta.f0ManifestHash.slice(0, 12) + '... instead of 2c27039f... because of register updates after V10); cell counts and estimates are compared with the committed V10 lifecycle run.' };
  // ---------- S1 cells ----------
  const cells = [];
  for (const c0 of R.F0.ev.cells) {
    const key = cellKey(c0), row = { rule: c0.rule, horizonWeeks: c0.horizonWeeks, endpoint: c0.endpoint };
    for (const f of Object.keys(R)) {
      const c = R[f].ev.cells.find(x => cellKey(x) === key), t = R[f].term.cells.filter(x => cellKey(x) === key);
      const s = j => t.find(x => x.scenario === W.SCENARIO_NAMES[j]);
      row[f] = {
        v10: { n: c.n, estimate: r6(c.estimate), ci: c.ci && c.ci.map(r6), p: c.pValue, holmP: c.holmAdjustedP, holmReject: c.holmReject, gross: r6(c.costSensitivity[0].mean), censored: c.coverage.censored, observed: c.coverage.observed },
        terminalS0: { n: s(0).n, estimate: r6(s(0).estimate), ci: s(0).ci && s(0).ci.map(r6), p: s(0).pValue, holmP: s(0).holmAdjustedP, holmReject: s(0).holmReject, nTerminal: s(0).nTerminal, nTerminalDelisted: s(0).nTerminalDelisted, nObservedDelisted: s(0).nObservedDelisted, gross: c0.endpoint === 'RAW_NET' ? r6(s(0).grossMean) : undefined,
          subperiods: s(0).subperiods.map(x => ({ from: x.from, n: x.n, mean: r6(x.mean) })) },
        terminalBand: { S1: r6(s(1).estimate), S2: r6(s(2).estimate), min: r6(Math.min(s(0).estimate, s(1).estimate, s(2).estimate)), max: r6(Math.max(s(0).estimate, s(1).estimate, s(2).estimate)) } };
    }
    row.delta = Object.fromEntries(Object.keys(R).filter(f => f !== 'F0').map(f => [f + '_minus_F0', { v10: r6(row[f].v10.estimate - row.F0.v10.estimate), terminalS0: r6(row[f].terminalS0.estimate - row.F0.terminalS0.estimate) }]));
    cells.push(row);
  }
  const baseRate = Object.fromEntries(Object.keys(R).map(f => [f, Object.fromEntries(SB.horizonsWeeks.map(h => [h, { pooledMeanNet: r6(R[f].ev.baseRate[h].baseRate.pooledMeanNet), meanOfWeeklyMeansNet: r6(R[f].ev.baseRate[h].baseRate.meanOfWeeklyMeansNet), observations: R[f].ev.baseRate[h].baseRate.observations }]))]));
  const populations = Object.fromEntries(Object.keys(R).map(f => [f, { label: LABEL[f], listings: R[f].meta.frameListings, qualifiedBeforeFrameRule: R[f].meta.qualified, delisted: R[f].meta.delisted, manifestHash: R[f].meta.manifestHash,
    frameExclusions: R[f].ev.inclusionsExclusions.frameExclusions }]));
  const funded = Object.fromEntries(Object.keys(R).map(f => [f, R[f].funded.performance.map(p => ({ rule: p.rule, universe: p.universe.listings, delistedInUniverse: p.universe.listings - R.F0.funded.performance.find(x => x.rule === p.rule).universe.listings, episodes: p.episodes,
    cagr: r6(p.variants.base.metrics.cagr), spyCagr: r6(p.variants.base.spy.cagr), excessCagr: r6(p.variants.base.excessCagr), weeklyDifferenceP: p.variants.base.weeklyDifference.pValue, holmAdjustedP: p.variants.base.weeklyDifference.holmAdjustedP }))]));
  const holm = Object.fromEntries(Object.keys(R).map(f => [f, { v10Semantics: { rejections: R[f].ev.multipleTesting.rejections, familySize: R[f].ev.multipleTesting.familySize, rejected: R[f].ev.cells.filter(c => c.holmReject).map(cellKey) },
    terminalS0: { rejections: R[f].term.holmScenario0.rejections, familySize: R[f].term.holmScenario0.familySize, rejected: R[f].term.cells.filter(c => c.scenario === W.SCENARIO_NAMES[0] && c.holmReject).map(cellKey) } }]));
  const trSubset = Object.fromEntries(Object.keys(R).filter(f => f !== 'F0').map(f => [f, Object.fromEntries(Object.entries(R[f].term.totalReturnDelistedSubset).map(([k, v]) => [k, { n: v.n, priceGross: r6(v.priceGrossMean), totalReturnGross: r6(v.totalReturnGrossMean), trMinusPrice: v.n ? r6(v.totalReturnGrossMean - v.priceGrossMean) : null }]))]));
  const common = { registrationSha256: regSha, amendmentSha256: amSha, evidenceKind: 'HISTORICAL_DEVELOPMENT_STUDY', certificationStatus: 'NOT_CERTIFIED', productionApproved: false };
  const s1 = { studyId: 'V13-S1-SIGNAL-DELISTED', ...common,
    basedOn: { study: 'V10-SIGNAL-BACKTEST (scripts/quant/v10/studies/signal-study.cjs, unchanged)', v10RegistrationHash: R.F0.meta.v10RegistrationHash, f0Reproduction: f0Repro },
    populations, period: { signalDates: reg.window.signalDates, studyCalendarWeeks: R.F0.meta.studyCalendarWeeks, calendar: R.F0.meta.calendar },
    returnBasis: { events: 'PRICE_RETURN (split-adjusted weekly closes; delisted: provider close / later split factors)', benchmark: 'SPY PRICE_RETURN same entry/exit dates (terminal outcomes: entry date to expected exit calendar date)', totalReturn: 'only on the delisted subset (totalReturnDelistedSubset)' },
    costs: reg.costs, benchmark: reg.benchmark, inference: reg.inference, rules: SB.rules, horizonsWeeks: SB.horizonsWeeks, endpoints: SB.endpoints,
    variants: { v10: 'V10 semantics: engine outcomes, CENSORED excluded (registered S1 result)', terminalS0: 'terminal-resolved, scenario 0 = last traded close (registered point estimate of the survivorship decomposition; amendment O1-O4)', terminalBand: 'scenarios S1 (MERGER -10 %, DISTRESS/UNKNOWN -30 %) and S2 (MERGER +10 %, DISTRESS/UNKNOWN -100 %)' },
    multipleTesting: holm, baseRate, cells, totalReturnDelistedSubset: trSubset,
    fundedStrategy: { note: 'Part of signal-study.cjs output, unchanged. The V10 funded universe admits only listings whose series reach the last strategy session (2026); delisted chains enter only if they traded until then (delisted in 2026, after the signal window). Differences between frames therefore come from a few late-ended chains and the changed hash tie-break candidate set, not from the population of 2000-2025 delistings. Descriptive only.', byFrame: funded },
    engineParity: Object.fromEntries(Object.keys(R).map(f => [f, { v10: R[f].parity, terminal: R[f].term.parity }])),
    runtimeSeconds: Object.fromEntries(Object.keys(R).map(f => [f, { signalStudy: R[f].metaSignal.timings.signalStudy ?? null, terminal: R[f].meta.timings.terminal, s2: R[f].meta.timings.s2 }])),
    code: R.F1.meta.code,
    scope: 'Retrospective development study on explored 2000-2025 history (V7-V10 saw these rules on the survivor frame). Long event outcomes only; weekly price return; delisted terminal values are scenarios (consideration not verified). Not a certification, no alpha claim.' };
  const s2 = { studyId: 'V13-S2-POPULATION', ...common, populations,
    definitions: { buyAndHold: 'V11 P_t: mean gross return entry t+1 -> exit t+1+h over all eligible completed observations of week t (V10 control eligibility), mean of weekly means per period; SPY price return same dates', weeklyRebalancedEW: 'V11 ewIndex: mean weekly return of listings observed in consecutive calendar weeks (date >= listingStart), chained; CAGR vs SPY price CAGR same calendar dates', terminal: 'scenario applied in the last held week (amendment 1.0.1 O5)' },
    returnBasis: 'PRICE_RETURN both sides (gross population, no costs; populationNet = V10 base cost per round trip, buy-and-hold only)', costs: reg.costs.base, weighting: 'equal weight', periods: ['FULL ' + reg.window.signalDates.join('..'), ...K.SUBPERIODS.map(x => x.join('..'))],
    byFrame: Object.fromEntries(Object.keys(R).map(f => [f, roundDeep(R[f].s2)])),
    scope: 'Descriptive population returns (no test registered for S2). Equal-weight weekly-rebalanced indices contain a rebalancing/bid-ask component (V11).' };
  W.writeJson(path.join(o.outDir, 's1-signal-1.0.0.json'), s1);
  W.writeJson(path.join(o.outDir, 's2-population-1.0.0.json'), s2);
  console.log(JSON.stringify({ frames: Object.keys(R), f0Repro }));
}
function roundDeep(x) { if (Array.isArray(x)) return x.map(roundDeep); if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, roundDeep(v)])); return r6(x); }
if (require.main === module) main();
