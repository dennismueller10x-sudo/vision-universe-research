#!/usr/bin/env node
'use strict';
// V13b F1W - builds the compact public evidence of study registration 2.0.0 from the private runs of run.cjs and the COMMITTED V13
// results (F0, F1, F1w are cited from docs/quant-recovery/v13/studies/*.json, never rewritten). Only aggregates are published.
//   node scripts/quant/v13b/f1w/assemble.cjs [--private <dir>] [--out docs/quant-recovery/v13b/f1w/results-2.0.0.json]
const fs = require('node:fs'), path = require('node:path');
const L = require('./lib.cjs'), W = L.W, K = L.K;
const r6 = W.r6;
const V13_S1 = 'docs/quant-recovery/v13/studies/s1-signal-1.0.0.json', V13_S2 = 'docs/quant-recovery/v13/studies/s2-population-1.0.0.json';
const cellKey = c => c.rule + '|' + c.horizonWeeks + '|' + c.endpoint;
const roundDeep = x => Array.isArray(x) ? x.map(roundDeep) : (x && typeof x === 'object') ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, roundDeep(v)])) : r6(x);

// Same per-cell shape as scripts/quant/v13/studies/assemble.cjs (so F1d sits next to the committed F0/F1/F1w entries).
function cellOf(ev, term, key, endpoint) {
  const c = ev ? ev.cells.find(x => cellKey(x) === key) : null, t = term.cells.filter(x => cellKey(x) === key), s = j => t.find(x => x.scenario === W.SCENARIO_NAMES[j]);
  const out = {};
  if (c) out.v10 = { n: c.n, estimate: r6(c.estimate), ci: c.ci && c.ci.map(r6), p: c.pValue, holmP: c.holmAdjustedP, holmReject: c.holmReject, gross: r6(c.costSensitivity[0].mean), censored: c.coverage.censored, observed: c.coverage.observed };
  out.terminalS0 = { n: s(0).n, estimate: r6(s(0).estimate), ci: s(0).ci && s(0).ci.map(r6), p: s(0).pValue, holmP: s(0).holmAdjustedP, holmReject: s(0).holmReject, nTerminal: s(0).nTerminal, nTerminalDelisted: s(0).nTerminalDelisted, nObservedDelisted: s(0).nObservedDelisted, gross: endpoint === 'RAW_NET' ? r6(s(0).grossMean) : undefined,
    subperiods: s(0).subperiods.map(x => ({ from: x.from, n: x.n, mean: r6(x.mean) })) };
  out.terminalBand = { S1: r6(s(1).estimate), S2: r6(s(2).estimate), min: r6(Math.min(s(0).estimate, s(1).estimate, s(2).estimate)), max: r6(Math.max(s(0).estimate, s(1).estimate, s(2).estimate)) };
  return out;
}
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function main() {
  const o = W.args(process.argv.slice(2), { private: L.PRIVATE, out: path.join(W.ROOT, L.OUT_DIR, 'results-2.0.0.json') });
  const regSha = L.registrationSha(), j = (f, n) => JSON.parse(fs.readFileSync(path.join(o.private, f, n), 'utf8'));
  const s1v13 = JSON.parse(fs.readFileSync(path.join(W.ROOT, V13_S1), 'utf8')), s2v13 = JSON.parse(fs.readFileSync(path.join(W.ROOT, V13_S2), 'utf8'));
  const meta = Object.fromEntries(['F0', 'F1', 'F1w', 'F1d'].map(f => [f, j(f, 'run-meta-v13b.json')]));
  const evD = j('F1d', 'signal-backtest-evidence.json'), termD = j('F1d', 's1-terminal.json'), s2D = j('F1d', 's2-population.json'), fundD = j('F1d', 'funded-strategy-evidence.json');
  const termW = j('F1w', 's1-terminal.json'), s2W = j('F1w', 's2-population.json');
  const reg = K.readRegistration().registration, SB = reg.studies.SIGNAL_BACKTEST;

  // ---------- R1: F1w reproduction against the committed V13 entries ----------
  let r1Cells = 0, r1Same = 0; const r1Diff = [];
  for (const row of s1v13.cells) {
    const key = cellKey(row), mine = cellOf(null, termW, key, row.endpoint), ref = row.F1w;
    for (const part of ['terminalS0', 'terminalBand']) { r1Cells++; if (sameJson(JSON.parse(JSON.stringify(mine[part])), ref[part])) r1Same++; else r1Diff.push(key + ':' + part); }
  }
  const r1S2 = sameJson(roundDeep(s2W), s2v13.byFrame.F1w);
  const r1 = { manifestHashEqualsV13: meta.F1w.r1.manifestHashEqualsV13, manifestHash: meta.F1w.manifestHash, s1TerminalPartsCompared: r1Cells, s1TerminalPartsIdentical: r1Same, firstDifferences: r1Diff.slice(0, 10), s2Identical: r1S2,
    state: meta.F1w.r1.manifestHashEqualsV13 && r1Same === r1Cells && r1S2 ? 'REPRODUCED' : 'NOT_REPRODUCED' };

  // ---------- S1 side by side ----------
  const cells = [], stability = { END_OF_SERIES_STABLE: [], END_OF_SERIES_SENSITIVE: [] };
  for (const row of s1v13.cells) {
    const key = cellKey(row), d = cellOf(evD, termD, key, row.endpoint);
    const est = (f, v) => (f === 'F1d' ? d : row[f])[v].estimate;
    const delta = v => ({ F1w_minus_F1: r6(est('F1w', v) - est('F1', v)), F1d_minus_F1: r6(est('F1d', v) - est('F1', v)), F1w_minus_F1d: r6(est('F1w', v) - est('F1d', v)), F1d_minus_F0: r6(est('F1d', v) - est('F0', v)) });
    const sg = x => Math.sign(x), f1 = row.F1.terminalS0, fw = row.F1w.terminalS0, fd = d.terminalS0;
    const stable = sg(f1.estimate) === sg(fw.estimate) && sg(fw.estimate) === sg(fd.estimate) && f1.holmReject === fw.holmReject && fw.holmReject === fd.holmReject;
    stability[stable ? 'END_OF_SERIES_STABLE' : 'END_OF_SERIES_SENSITIVE'].push(key);
    cells.push({ rule: row.rule, horizonWeeks: row.horizonWeeks, endpoint: row.endpoint, F0: row.F0, F1: row.F1, F1w: row.F1w, F1d: d,
      delta: { terminalS0: delta('terminalS0'), v10: delta('v10') }, endOfSeries: stable ? 'END_OF_SERIES_STABLE' : 'END_OF_SERIES_SENSITIVE' });
  }
  const holm = { F0: s1v13.multipleTesting.F0, F1: s1v13.multipleTesting.F1, F1w: s1v13.multipleTesting.F1w,
    F1d: { v10Semantics: { rejections: evD.multipleTesting.rejections, familySize: evD.multipleTesting.familySize, rejected: evD.cells.filter(c => c.holmReject).map(cellKey) },
      terminalS0: { rejections: termD.holmScenario0.rejections, familySize: termD.holmScenario0.familySize, rejected: termD.cells.filter(c => c.scenario === W.SCENARIO_NAMES[0] && c.holmReject).map(cellKey) } } };
  const baseRate = { ...s1v13.baseRate, F1d: Object.fromEntries(SB.horizonsWeeks.map(h => [h, { pooledMeanNet: r6(evD.baseRate[h].baseRate.pooledMeanNet), meanOfWeeklyMeansNet: r6(evD.baseRate[h].baseRate.meanOfWeeklyMeansNet), observations: evD.baseRate[h].baseRate.observations }])) };
  const trSubset = { F1: s1v13.totalReturnDelistedSubset.F1, F1w: s1v13.totalReturnDelistedSubset.F1w,
    F1d: Object.fromEntries(Object.entries(termD.totalReturnDelistedSubset).map(([k, v]) => [k, { n: v.n, priceGross: r6(v.priceGrossMean), totalReturnGross: r6(v.totalReturnGrossMean), trMinusPrice: v.n ? r6(v.totalReturnGrossMean - v.priceGrossMean) : null }])) };

  // ---------- DG2 self-check: modal-date estimates must equal the committed F1w SPY_EXCESS cells ----------
  const dg2 = meta.F1w.dg2.map(x => {
    const row = s1v13.cells.find(c => c.rule === x.rule && c.horizonWeeks === x.horizonWeeks && c.endpoint === 'SPY_EXCESS'), ref = x.variant === 'V10' ? row.F1w.v10 : row.F1w.terminalS0;
    return { ...roundDeep(x), committedF1wEstimate: ref.estimate, committedN: ref.n, modalDateMatchesCommitted: r6(x.estimateModalDate) === ref.estimate && x.nModalDate === ref.n };
  });
  const funded = { ...s1v13.fundedStrategy.byFrame, F1d: fundD.performance.map(p => ({ rule: p.rule, universe: p.universe.listings, delistedInUniverse: p.universe.listings - s1v13.fundedStrategy.byFrame.F0.find(x => x.rule === p.rule).universe, episodes: p.episodes,
    cagr: r6(p.variants.base.metrics.cagr), spyCagr: r6(p.variants.base.spy.cagr), excessCagr: r6(p.variants.base.excessCagr), weeklyDifferenceP: p.variants.base.weeklyDifference.pValue, holmAdjustedP: p.variants.base.weeklyDifference.holmAdjustedP })) };
  const dg3 = Object.fromEntries(['F0', 'F1', 'F1w', 'F1d'].map(f => [f, roundDeep(meta[f].dg3)]));

  const populations = { F0: { ...s1v13.populations.F0, source: V13_S1 }, F1: { ...s1v13.populations.F1, source: V13_S1 }, F1w: { ...s1v13.populations.F1w, label: 'V13B_COMPARISON_SENSITIVITY (defined in amendment 1.0.1)', source: V13_S1 },
    F1d: { label: 'V13B_COMPARISON_SENSITIVITY (new in registration 2.0.0)', listings: meta.F1d.frameListings, qualifiedBeforeFrameRule: meta.F1d.qualified, delisted: meta.F1d.delisted, manifestHash: meta.F1d.manifestHash, frameExclusions: evD.inclusionsExclusions.frameExclusions } };
  const expected = { addedDelisted: 1576, sameChainsAsF1w: true }, deviations = [];
  if (meta.F1d.delisted.added !== expected.addedDelisted) deviations.push('F1D_ADDED_COUNT ' + meta.F1d.delisted.added + ' != 1576');
  if (r1.state !== 'REPRODUCED') deviations.push('R1_F1W_NOT_REPRODUCED');
  if (dg2.some(x => !x.modalDateMatchesCommitted)) deviations.push('DG2_MODAL_DATE_SELF_CHECK');

  const out = { studyId: 'V13B-F1W-END-OF-SERIES-COMPARISON', registration: { file: L.REG_FILE, sha256: regSha }, evidenceKind: 'HISTORICAL_DEVELOPMENT_STUDY', evidenceLabel: 'NON_CONFIRMATORY_COMPARISON_STUDY', confirmatory: false,
    certificationStatus: 'NOT_CERTIFIED', productionApproved: false,
    primaryUnchanged: { statement: 'F1 remains the registered V13 primary. F0/F1/F1w values below are copied from the committed V13 files (not recomputed, not rewritten). F1w and F1d are comparison frames; neither becomes a default.', v13S1: { file: V13_S1, sha256: W.shaFile(V13_S1) }, v13S2: { file: V13_S2, sha256: W.shaFile(V13_S2) } },
    labels: { F0: 'REGISTERED_BASELINE (V13)', F1: 'REGISTERED_PRIMARY (V13)', F1w: 'COMPARISON_SENSITIVITY (V13 amendment 1.0.1, results already seen)', F1d: 'COMPARISON_SENSITIVITY (registration 2.0.0, new)' },
    deviations, r1F1wReproduction: r1, populations,
    period: s1v13.period, costs: s1v13.costs, benchmark: s1v13.benchmark, inference: s1v13.inference, rules: SB.rules, horizonsWeeks: SB.horizonsWeeks, endpoints: SB.endpoints, variants: s1v13.variants,
    reading: { F1d_minus_F1: 'adding the 1,186 chains without their last partial week (population composition)', F1w_minus_F1d: 'last partial week plus its modal date label (end-of-series treatment)', F1w_minus_F1: 'sum of both' },
    s1: { multipleTesting: holm, endOfSeriesStability: { stable: stability.END_OF_SERIES_STABLE.length, sensitive: stability.END_OF_SERIES_SENSITIVE.length, sensitiveCells: stability.END_OF_SERIES_SENSITIVE, rule: 'terminal S0: same sign and same Holm decision in F1, F1w, F1d' }, baseRate, cells, totalReturnDelistedSubset: trSubset },
    s2: { definitions: s2v13.definitions, byFrame: { F0: s2v13.byFrame.F0, F1: s2v13.byFrame.F1, F1w: s2v13.byFrame.F1w, F1d: roundDeep(s2D) } },
    diagnostics: { DG1_partialWeek: roundDeep(meta.F1w.dg1), DG2_spyLegTrueDate: dg2, DG3_fundedFragility: { fundedStrategy: funded, decomposition: dg3 } },
    runtimeSeconds: Object.fromEntries(Object.entries(meta).map(([f, m]) => [f, m.timings])), code: meta.F1d.code,
    scope: 'Retrospective, non-confirmatory comparison on explored 2000-2025 history. Long event outcomes, weekly price return, delisted terminal values as scenarios. No alpha claim, no certification, no change of the registered primary or of any default.' };
  W.writeJson(o.out, out);
  console.log(JSON.stringify({ r1: r1.state, deviations, holmF1d: holm.F1d.terminalS0.rejections, stability: out.s1.endOfSeriesStability.stable }));
}
if (require.main === module) main();
module.exports = { cellOf };
