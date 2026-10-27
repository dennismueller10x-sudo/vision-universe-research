#!/usr/bin/env node
'use strict';
// Writes compact, derived evidence JSONs from the private run summary into
// docs/quant-recovery/v9/sensitivity/. No recomputation, no product data.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../../..'), OUT = path.join(ROOT, 'docs/quant-recovery/v9/sensitivity');

function stats(xs) {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b); if (!v.length) return null;
  const q = p => v[Math.min(v.length - 1, Math.floor(p * (v.length - 1)))];
  return { min: v[0], median: q(0.5), max: v.at(-1) };
}
function compactPoint(d) {
  return { parameters: d.parameters, n: d.n, T: d.T, occupiedDates: d.occupiedDates, estimate: d.estimate, iidSe: d.iidSe, effectiveN: d.effectiveN,
    acf1to13: d.acf, ljungBox: d.ljungBox, overlap: { maxAbsWithin: d.overlap.maxAbsWithinOverlap, maxAbsBeyond: d.overlap.maxAbsBeyondOverlap, shareBeyondOutsideBand: d.overlap.shareBeyondOutsideBand, ljungBoxBeyond: d.overlap.ljungBoxBeyondOverlap },
    lrv: Object.fromEntries(Object.entries(d.lrv).map(([k, x]) => [k, { bandwidth: x.bandwidth, se: x.se, effectiveDates: x.effectiveDates }])),
    politisWhite: { mhat: d.politisWhite.mhat, M: d.politisWhite.M, bCB: d.politisWhite.bCB, bSB: d.politisWhite.bSB, capped: d.politisWhite.capped },
    cbbCurve: d.cbbCurve.map(x => ({ b: x.b, se: x.se, nwSe: x.nwSe, pValue: x.pValue })), plateauMaxOverMin: d.plateau.maxOverMin,
    methods52: { seCBB: d.methods52.CBB.se, seSB: d.methods52.SB.se, seMBB: d.methods52.MBB.se, pCBB: d.methods52.CBB.pValue, pSB: d.methods52.SB.pValue, pMBB: d.methods52.MBB.pValue, sbOverCbb: d.methods52.sbOverCbb, mbbOverCbb: d.methods52.mbbOverCbb, nwOverCbb: d.methods52.nwOverCbb },
    kpssZ: Object.fromEntries(Object.entries(d.kpssZ).map(([k, x]) => [k, { bandwidth: x.bandwidth, statistic: x.statistic, reject05: x.reject05 }])),
    kpssCounts: Object.fromEntries(Object.entries(d.kpssCounts).map(([k, x]) => [k, { bandwidth: x.bandwidth, statistic: x.statistic, reject05: x.reject05 }])),
    cusum: Object.fromEntries(Object.entries(d.cusum).map(([k, x]) => [k, { bandwidth: x.bandwidth, statistic: x.statistic, reject05: x.reject05 }])),
    adf: { lags: d.adf.lags, statistic: d.adf.statistic, rejectUnitRoot05: d.adf.rejectUnitRoot05 },
    split: { estimates: d.split.parts.map(p => p.estimate), ses: d.split.parts.map(p => p.se), wald: d.split.wald, pValue: d.split.pValue }, criteria: d.criteria };
}
function aggregateDiag(diag) {
  const f = g => stats(diag.map(g));
  return { pwBcb: f(d => d.politisWhite.bCB), pwBsb: f(d => d.politisWhite.bSB), pwMhat: f(d => d.politisWhite.mhat), plateauMaxOverMin: f(d => d.plateau.maxOverMin),
    sbOverCbb: f(d => d.methods52.sbOverCbb), mbbOverCbb: f(d => d.methods52.mbbOverCbb), nwOverCbb: f(d => d.methods52.nwOverCbb),
    effectiveNShare: f(d => d.effectiveN / d.n), effectiveDatesNW52: f(d => d.lrv.fixed_52.effectiveDates), kpssZbw52: f(d => d.kpssZ.bw52.statistic), kpssZl12: f(d => d.kpssZ.l12.statistic),
    kpssCountsbw52: f(d => d.kpssCounts.bw52.statistic), cusumbw52: f(d => d.cusum.bw52.statistic), cusuml12: f(d => d.cusum.l12.statistic), adf: f(d => d.adf.statistic), splitP: f(d => d.split.pValue),
    ljungBox52P: f(d => (d.ljungBox.find(x => x.lags === 52) || {}).pValue), acf1: f(d => d.acf[0]),
    seRatio104over52: f(d => d.cbbCurve.find(x => x.b === 104).se / d.cbbCurve.find(x => x.b === 52).se), seRatio52over13: f(d => d.cbbCurve.find(x => x.b === 52).se / d.cbbCurve.find(x => x.b === 13).se),
    seRatio52overIid: f(d => d.cbbCurve.find(x => x.b === 52).se / d.iidSe) };
}
function main(directory) {
  const file = path.join(path.resolve(directory), 'run-summary.json'), bytes = fs.readFileSync(file), s = JSON.parse(bytes);
  const reg = JSON.parse(fs.readFileSync(path.join(OUT, 'registration-1.0.0.json'), 'utf8'));
  if (s.registrationHash !== reg.registrationHash) throw Error('REGISTRATION_MISMATCH');
  const head = { gitHead: s.gitHead, runtime: s.runtime, code: s.code, registrationHash: s.registrationHash, sourceManifestHash: s.sourceManifestHash, runSummarySha256: crypto.createHash('sha256').update(bytes).digest('hex'), productionApproved: false };
  const diagnostics = { schemaVersion: 'v9-sensitivity-diagnostics-1.0.0', ...head, populations: {} }, grid = { schemaVersion: 'v9-sensitivity-populations-1.0.0', ...head, benchmark: s.benchmark, populations: {} };
  for (const [name, p] of Object.entries(s.populations)) {
    diagnostics.populations[name] = { studyCalendar: p.studyCalendar, endpoints: {} };
    grid.populations[name] = { listings: p.listings, studyCalendar: p.studyCalendar, v8EventMatch: p.v8EventMatch, coverage: p.coverage, endpoints: {} };
    for (const [ep, e] of Object.entries(p.endpoints)) {
      diagnostics.populations[name].endpoints[ep] = { criteriaCounts: e.criteriaCounts, criteriaHold: e.criteriaHold, populationStatus: e.populationStatus, acrossPoints: aggregateDiag(e.diagnostics), points: e.diagnostics.map(compactPoint) };
      grid.populations[name].endpoints[ep] = e.grid;
    }
  }
  const decision = { schemaVersion: 'v9-sensitivity-decision-1.0.0', ...head, method: 'PARAMETER_SENSITIVITY', previousStatus: 'PARTIALLY_VALIDATED (V8)', decision: s.decision,
    criteria: reg.registration.decisionCriteria };
  fs.writeFileSync(path.join(OUT, 'diagnostics-summary.json'), JSON.stringify(diagnostics) + '\n');
  fs.writeFileSync(path.join(OUT, 'population-summary.json'), JSON.stringify(grid) + '\n');
  fs.writeFileSync(path.join(OUT, 'decision.json'), JSON.stringify(decision, null, 1) + '\n');
  console.log(JSON.stringify({ written: ['diagnostics-summary.json', 'population-summary.json', 'decision.json'], decision: s.decision.methodStatus }));
}
if (require.main === module) main(process.argv[2]);
module.exports = { main };
