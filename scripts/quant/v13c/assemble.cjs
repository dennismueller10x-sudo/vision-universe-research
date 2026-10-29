#!/usr/bin/env node
'use strict';
// V13c - builds the compact public S1/S2 evidence of study registration 3.0.0 (docs/quant-recovery/v13c/) from the private runs of
// run-frame.cjs and the cited, unchanged V13 (s1-signal-1.0.0.json, s2-population-1.0.0.json) and V13b (results-2.0.0.json) files.
// Only aggregate statistics are published.   node scripts/quant/v13c/assemble.cjs [--private <dir>] [--outDir docs/quant-recovery/v13c]
const fs = require('node:fs'), path = require('node:path');
const C = require('./lib.cjs'), W = C.W, K = C.K, r6 = W.r6;

const FR = ['F1p', 'F1wp', 'F1dp'];
const CITED = { V13_S1: 'docs/quant-recovery/v13/studies/s1-signal-1.0.0.json', V13_S2: 'docs/quant-recovery/v13/studies/s2-population-1.0.0.json', V13B: 'docs/quant-recovery/v13b/f1w/results-2.0.0.json' };
const cellKey = c => c.rule + '|' + c.horizonWeeks + '|' + c.endpoint;

function load(dir, f) {
  const d = path.join(dir, f), j = n => JSON.parse(fs.readFileSync(path.join(d, n), 'utf8'));
  return { ev: j('signal-backtest-evidence.json'), term: j('s1-terminal.json'), s2: j('s2-population.json'), meta: j('run-meta-v13c.json'), funded: j('funded-strategy-evidence.json'), parity: j('parity-engine-signal.json') };
}
function frameCell(R, key, endpoint) {
  const c = R.ev.cells.find(x => cellKey(x) === key), t = R.term.cells.filter(x => cellKey(x) === key), s = j => t.find(x => x.scenario === W.SCENARIO_NAMES[j]);
  return { v10: { n: c.n, estimate: r6(c.estimate), ci: c.ci && c.ci.map(r6), p: c.pValue, holmP: c.holmAdjustedP, holmReject: c.holmReject, gross: r6(c.costSensitivity[0].mean), censored: c.coverage.censored, observed: c.coverage.observed },
    terminalS0: { n: s(0).n, estimate: r6(s(0).estimate), ci: s(0).ci && s(0).ci.map(r6), p: s(0).pValue, holmP: s(0).holmAdjustedP, holmReject: s(0).holmReject, nTerminal: s(0).nTerminal, nTerminalDelisted: s(0).nTerminalDelisted, nObservedDelisted: s(0).nObservedDelisted,
      gross: endpoint === 'RAW_NET' ? r6(s(0).grossMean) : undefined, subperiods: s(0).subperiods.map(x => ({ from: x.from, n: x.n, mean: r6(x.mean) })) },
    terminalBand: { S1: r6(s(1).estimate), S2: r6(s(2).estimate), min: r6(Math.min(s(0).estimate, s(1).estimate, s(2).estimate)), max: r6(Math.max(s(0).estimate, s(1).estimate, s(2).estimate)) } };
}
const brief = x => x && { v10: { n: x.v10.n, estimate: x.v10.estimate, p: x.v10.p, holmReject: x.v10.holmReject }, terminalS0: { n: x.terminalS0.n, estimate: x.terminalS0.estimate, p: x.terminalS0.p, holmReject: x.terminalS0.holmReject }, terminalBand: x.terminalBand };
const d6 = (a, b) => (typeof a === 'number' && typeof b === 'number') ? r6(a - b) : null;
// delta of two (rounded) S2 trees: same shape, numbers subtracted for the listed leaf keys
function s2Delta(a, b, keys) {
  if (a && typeof a === 'object' && b && typeof b === 'object') { const o = {}; for (const k of Object.keys(a)) { if (keys.includes(k)) o[k] = d6(a[k], b[k]); else if (typeof a[k] === 'object') { const v = s2Delta(a[k], b[k], keys); if (v && Object.keys(v).length) o[k] = v; } } return o; }
  return null;
}

function main() {
  const o = W.args(process.argv.slice(2), { private: C.PRIVATE, outDir: path.join(W.ROOT, C.OUT_DIR) });
  const R = Object.fromEntries(FR.map(f => [f, load(o.private, f)]));
  const regSha = C.registrationSha(), amSha = C.amendmentSha();
  const readC = f => JSON.parse(fs.readFileSync(path.join(W.ROOT, f), 'utf8'));
  const v13 = readC(CITED.V13_S1), v13s2 = readC(CITED.V13_S2), v13b = readC(CITED.V13B);
  const citedSha = Object.fromEntries(Object.entries(CITED).map(([k, f]) => [k, { file: f, sha256: W.shaFile(f) }]));
  const v13Cells = new Map(v13.cells.map(c => [cellKey(c), c])), v13bCells = new Map(v13b.s1.cells.map(c => [cellKey(c), c]));
  const cited = key => ({ F0: v13Cells.get(key).F0, F1: v13Cells.get(key).F1, F1w: v13Cells.get(key).F1w, F1d: v13bCells.get(key).F1d });
  const reg = K.readRegistration().registration, SB = reg.studies.SIGNAL_BACKTEST;
  // ---------- S1 cells ----------
  const cells = [], holmChanges = Object.fromEntries(FR.map(f => [f, { v10: [], terminalS0: [] }]));
  for (const c0 of R.F1p.ev.cells) {
    const key = cellKey(c0), ci = cited(key), row = { rule: c0.rule, horizonWeeks: c0.horizonWeeks, endpoint: c0.endpoint, cited: Object.fromEntries(Object.entries(ci).map(([k, v]) => [k, brief(v)])) };
    for (const f of FR) row[f] = frameCell(R[f], key, c0.endpoint);
    row.delta = {};
    for (const f of FR) {
      const cp = C.FRAMES[f].counterpart, b = ci[cp];
      row.delta[f + '_minus_' + cp] = { v10: d6(row[f].v10.estimate, b.v10.estimate), terminalS0: d6(row[f].terminalS0.estimate, b.terminalS0.estimate), nV10: row[f].v10.n - b.v10.n, nTerminalS0: row[f].terminalS0.n - b.terminalS0.n,
        bandMin: d6(row[f].terminalBand.min, b.terminalBand.min), bandMax: d6(row[f].terminalBand.max, b.terminalBand.max) };
      if (row[f].v10.holmReject !== b.v10.holmReject) holmChanges[f].v10.push(key + (row[f].v10.holmReject ? ' +' : ' -'));
      if (row[f].terminalS0.holmReject !== b.terminalS0.holmReject) holmChanges[f].terminalS0.push(key + (row[f].terminalS0.holmReject ? ' +' : ' -'));
    }
    row.delta.F1p_minus_F0 = { v10: d6(row.F1p.v10.estimate, ci.F0.v10.estimate), terminalS0: d6(row.F1p.terminalS0.estimate, ci.F0.terminalS0.estimate) };
    cells.push(row);
  }
  const holm = Object.fromEntries(FR.map(f => [f, { v10Semantics: { rejections: R[f].ev.multipleTesting.rejections, familySize: R[f].ev.multipleTesting.familySize, rejected: R[f].ev.cells.filter(c => c.holmReject).map(cellKey) },
    terminalS0: { rejections: R[f].term.holmScenario0.rejections, familySize: R[f].term.holmScenario0.familySize, rejected: R[f].term.cells.filter(c => c.scenario === W.SCENARIO_NAMES[0] && c.holmReject).map(cellKey) },
    changesVsCounterpart: holmChanges[f] }]));
  const citedHolm = { F0: v13.multipleTesting.F0, F1: v13.multipleTesting.F1, F1w: v13.multipleTesting.F1w, F1d: v13b.s1.multipleTesting.F1d };
  const baseRate = Object.fromEntries(FR.map(f => [f, Object.fromEntries(SB.horizonsWeeks.map(h => [h, { pooledMeanNet: r6(R[f].ev.baseRate[h].baseRate.pooledMeanNet), meanOfWeeklyMeansNet: r6(R[f].ev.baseRate[h].baseRate.meanOfWeeklyMeansNet), observations: R[f].ev.baseRate[h].baseRate.observations,
    citedCounterpart: (C.FRAMES[f].counterpart === 'F1d' ? v13b.s1.baseRate.F1d : v13.baseRate[C.FRAMES[f].counterpart])[h] }]))]));
  const populations = Object.fromEntries(FR.map(f => [f, { label: C.LABEL[f], counterpart: C.FRAMES[f].counterpart, endOfSeriesRule: C.FRAMES[f].rule, listings: R[f].meta.frameListings, qualifiedBeforeFrameRule: R[f].meta.qualified,
    delisted: R[f].meta.delisted, manifestHash: R[f].meta.manifestHash, f0ManifestHash: R[f].meta.f0ManifestHash, r2: R[f].meta.r2, data: R[f].meta.data, frameExclusions: R[f].ev.inclusionsExclusions.frameExclusions }]));
  const fundedOf = (perf, f0perf) => perf.map(p => ({ rule: p.rule, universe: p.universe.listings, delistedInUniverse: p.universe.listings - f0perf.find(x => x.rule === p.rule).universe, episodes: p.episodes,
    cagr: r6(p.variants.base.metrics.cagr), spyCagr: r6(p.variants.base.spy.cagr), excessCagr: r6(p.variants.base.excessCagr), weeklyDifferenceP: p.variants.base.weeklyDifference.pValue, holmAdjustedP: p.variants.base.weeklyDifference.holmAdjustedP }));
  const funded = Object.fromEntries(FR.map(f => [f, fundedOf(R[f].funded.performance, v13.fundedStrategy.byFrame.F0)]));
  const trSubset = Object.fromEntries(FR.map(f => [f, Object.fromEntries(Object.entries(R[f].term.totalReturnDelistedSubset).map(([k, v]) => [k, { n: v.n, priceGross: r6(v.priceGrossMean), totalReturnGross: r6(v.totalReturnGrossMean), trMinusPrice: v.n ? r6(v.totalReturnGrossMean - v.priceGrossMean) : null }]))]));
  const common = { registrationSha256: regSha, amendmentSha256: amSha, evidenceKind: 'HISTORICAL_DEVELOPMENT_STUDY', evidenceLabel: 'NON_CONFIRMATORY_EXTENSION_STUDY', confirmatory: false, certificationStatus: 'NOT_CERTIFIED', productionApproved: false };
  const s1 = { studyId: 'V13C-S1-SIGNAL', ...common, cited: citedSha,
    labels: { F1p: "F1' = F0 + register-1.1.0 QUALIFIED chains, registered V13 frame rule (primary of this study)", F1wp: "F1w' = same chains, amendment-1.0.1 relabel (sensitivity)", F1dp: "F1d' = same chains, registration-2.0.0 drop rule (sensitivity)", cited: 'F0/F1/F1w from V13 s1-signal-1.0.0.json, F1d from V13b results-2.0.0.json (unchanged)' },
    populations, period: { signalDates: reg.window.signalDates, studyCalendarWeeks: R.F1p.meta.studyCalendarWeeks, calendar: R.F1p.meta.calendar },
    returnBasis: v13.returnBasis, costs: reg.costs, benchmark: reg.benchmark, inference: reg.inference, rules: SB.rules, horizonsWeeks: SB.horizonsWeeks, endpoints: SB.endpoints, variants: v13.variants,
    multipleTesting: { thisStudy: holm, cited: citedHolm, note: 'Six Holm families of 60 (frame x variant). No test on deltas.' }, baseRate, cells,
    newChainEvents: Object.fromEntries(FR.map(f => [f, R[f].meta.newChainEvents])), totalReturnDelistedSubset: trSubset,
    fundedStrategy: { note: v13.fundedStrategy.note, byFrame: funded, cited: { F0: v13.fundedStrategy.byFrame.F0, F1: v13.fundedStrategy.byFrame.F1, F1w: v13.fundedStrategy.byFrame.F1w } },
    engineParity: Object.fromEntries(FR.map(f => [f, { v10: R[f].parity, terminal: R[f].term.parity }])),
    runtimeSeconds: Object.fromEntries(FR.map(f => [f, R[f].meta.timings])), code: R.F1p.meta.code,
    scope: 'Retrospective development study on explored 2000-2025 history; adds 13 source-backed delisted chains (register 1.1.0) to the V13 frames. Long event outcomes only; weekly price return; terminal values are scenarios. Not a certification, no alpha claim.' };
  const S2C = { F1: v13s2.byFrame.F1, F1w: v13s2.byFrame.F1w, F1d: v13b.s2.byFrame.F1d, F0: v13s2.byFrame.F0 };
  const byFrame = Object.fromEntries(FR.map(f => [f, C.roundDeep(R[f].s2)]));
  const s2 = { studyId: 'V13C-S2-POPULATION', ...common, cited: citedSha, populations: Object.fromEntries(FR.map(f => [f, { listings: populations[f].listings, newChainsAdded: populations[f].delisted.newChains.added, counterpart: C.FRAMES[f].counterpart }])),
    definitions: v13s2.definitions, returnBasis: v13s2.returnBasis, costs: v13s2.costs, weighting: v13s2.weighting, periods: v13s2.periods, byFrame,
    deltaVsCounterpart: Object.fromEntries(FR.map(f => [f + '_minus_' + C.FRAMES[f].counterpart, s2Delta(byFrame[f], S2C[C.FRAMES[f].counterpart], ['cagr', 'populationGross', 'populationNet', 'populationGrossMinusSpy', 'priceMedian', 'totalReturnMedian'])])),
    scope: v13s2.scope };
  W.writeJson(path.join(o.outDir, 's1-signal-3.0.0.json'), s1);
  W.writeJson(path.join(o.outDir, 's2-population-3.0.0.json'), s2);
  console.log(JSON.stringify({ frames: FR, listings: Object.fromEntries(FR.map(f => [f, populations[f].listings])), newChains: Object.fromEntries(FR.map(f => [f, populations[f].delisted.newChains.added])), holm: Object.fromEntries(FR.map(f => [f, [holm[f].v10Semantics.rejections, holm[f].terminalS0.rejections]])) }));
}
if (require.main === module) main();
