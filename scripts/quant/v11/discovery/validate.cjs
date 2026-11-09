#!/usr/bin/env node
'use strict';
// V11 DISCOVERY – one-time evaluation of a frozen set (R2: VALIDATION of candidates-frozen; R3: TEST of
// final-hypotheses-frozen). Refuses to run unless the frozen file is committed and unchanged; refuses to
// overwrite an existing result. Usage: node validate.cjs --stage VALIDATION|TEST [--out-dir <dir>]
const fs = require('node:fs'), path = require('node:path');
const L = require('./lib.cjs'), R = require('./rules.cjs'), E = require('./evaluate.cjs');

const STAGES = {
  VALIDATION: { frozen: 'docs/quant-recovery/v11/discovery/candidates-frozen-1.0.0.json', out: 'validation-results-1.0.0.json', items: d => Object.entries(d.families).flatMap(([f, x]) => x.candidates.map(c => ({ family: f, id: c.candidateId, variantId: c.variantId, spec: c.spec }))) },
  TEST: { frozen: 'docs/quant-recovery/v11/discovery/final-hypotheses-frozen-1.0.0.json', out: 'test-results-1.0.0.json', items: d => d.hypotheses.map(h => ({ family: h.family, id: h.hypothesisId, variantId: h.variantId, spec: h.spec, label: h.label })) }
};

function coverage(ctx, spec, sch) {
  if (spec.family !== 'FUND') return null;
  const per = sch.decisions.map(j => { const fd = ctx.fund.byJ.get(j); const alive = L.featuresAt(ctx, j).filter(r => r.canEnter).length; return { date: ctx.cal[j], aliveFrame: alive, panelRows: fd ? fd.rows.size : 0, eligibleForRule: R.eligibleRows(ctx, spec, j).length }; });
  return { first: per[0], last: per.at(-1), minEligible: Math.min(...per.map(p => p.eligibleForRule)), meanEligibleShareOfAlive: L.mean(per.map(p => p.eligibleForRule / p.aliveFrame)) };
}

function main() {
  const a = process.argv.slice(2), stage = a[a.indexOf('--stage') + 1], st = STAGES[stage];
  if (!st) throw Error('STAGE_REQUIRED');
  const outDir = a.includes('--out-dir') ? a[a.indexOf('--out-dir') + 1] : L.DOCS, outFile = path.join(outDir, st.out);
  const gate = L.assertCommitted(st.frozen);
  if (fs.existsSync(outFile) && !a.includes('--out-dir')) throw Error('ALREADY_COMPUTED_ONCE:' + outFile);
  const frozen = JSON.parse(fs.readFileSync(path.join(L.ROOT, st.frozen), 'utf8'));
  const proto = L.protocol(), t0 = Date.now();
  const ctx = L.buildContext({ withPanel: true });
  const results = [], priv = {};
  for (const it of st.items(frozen)) {
    const per = proto.periods[it.family === 'FUND' ? 'fundamentalRules' : 'priceRules'][stage];
    const t1 = Date.now();
    const r = E.evaluateSpec(ctx, it.spec, per[0], per[1], { engine: true, firstYear: true, delistBounds: true, keepSim: true });
    const sim = r._sim; delete r._sim;
    r.coverage = coverage(ctx, it.spec, sim.sch);
    priv[it.id] = { spec: it.spec, decisions: sim.sch.decisions.map(j => ctx.cal[j]), endExec: ctx.cal[sim.sch.endExec], equity: sim.base.equity.map(e => [e.date, e.value, e.invested, e.n]), own: sim.own.equity.map(e => e.value), frameEw: sim.frameEw.equity.map(e => e.value), cap: sim.cap ? sim.cap.equity.map(e => e.value) : null,
      targets: sim.base.targets.map(t => [ctx.cal[t.decision], ctx.cal[t.exec], t.weights]), exits: sim.base.exits.map(x => [x.id, ctx.cal[x.entry], ctx.cal[x.exit], x.entryPrice, x.exitPrice, x.forced]) };
    results.push({ family: it.family, id: it.id, variantId: it.variantId, label: it.label || null, spec: it.spec, ...r, seconds: (Date.now() - t1) / 1000 });
    const f = v => v === null || v === undefined ? 'na' : (v * 100).toFixed(2);
    console.error(stage, it.id, it.variantId.padEnd(48), 'CAGR', f(r.strategy.cagr), 'SPY', f(r.spy.cagr), 'own', f(r.ownUniverseEw.cagr), 'exSPY', f(r.excess.vsSpy.annualisedMean), 'p', r.excess.vsSpy.pValue, 'exOwn', f(r.excess.vsOwnUniverseEw.annualisedMean), 'p', r.excess.vsOwnUniverseEw.pValue, 'parity', r.engineLedger.parityWithSimulator.maxAbsEquityDiff);
  }
  const families = {};
  for (const fam of ['PRICE', 'FUND']) {
    const cells = results.filter(r => r.family === fam);
    if (!cells.length) continue;
    const prim = cells.map(c => ({ id: c.id, pValue: c.excess.vsSpy.pValue })), sec = cells.map(c => ({ id: c.id, pValue: c.excess.vsOwnUniverseEw.pValue }));
    families[fam] = { primary: L.holm(prim), secondary: L.holm(sec) };
    for (const c of cells) { const p = prim.find(x => x.id === c.id), s = sec.find(x => x.id === c.id); c.excess.vsSpy.holmAdjustedP = p.holmAdjustedP; c.excess.vsSpy.holmReject = p.holmReject; c.excess.vsOwnUniverseEw.holmAdjustedP = s.holmAdjustedP; c.excess.vsOwnUniverseEw.holmReject = s.holmReject; }
  }
  const doc = { schemaVersion: 'v11-discovery-' + stage.toLowerCase() + '-results-1.0.0', studyId: L.STUDY_ID + ':' + stage, period: stage, protocolSha256: L.protocolHash(), computedOnce: true, gate, codeCommit: L.gitHead(),
    evidenceKind: 'HISTORICAL_DEVELOPMENT_STUDY', population: { loaderOptions: L.LOADER_OPTIONS, frame: ctx.listings.length, survivorship: 'Frame series all end 2023 or later except 121 ended listings (2023-2026): VALIDATION contains no delisting; TEST forced exits at the last observed close (primary), bounds -100% and sourced cash consideration reported per candidate. Coverage of SEC 10-K filers 22% (2010) / 48% (2020).' },
    returnBasis: { strategy: 'PRICE_RETURN', benchmarks: 'PRICE_RETURN (SPY total return not used: no sourced dividend path in this strand; TR exists for 8 titles only)' },
    costs: L.COSTS, investment: 'fully invested at target weights except market filter / exit rules; cash 0 %', inference: L.INFERENCE,
    multipleTesting: { ...families, note: 'Primary: Holm within family over the weekly excess vs SPY (block bootstrap, 26 w). Secondary: Holm within family vs own-universe EW. Observed excess is not secured unless Holm-adjusted p <= 0.05.' },
    results, manifestHash: ctx.manifestHash, codeHashes: L.codeHashes(), seconds: (Date.now() - t0) / 1000, certificationStatus: 'NOT_CERTIFIED', productionApproved: false };
  doc.reproHash = L.C.hash({ gate, manifest: ctx.manifestHash, code: doc.codeHashes, results: results.map(r => r.engineLedger.resultHash) });
  L.writeJson(outFile, doc);
  L.writeJson(path.join(L.PRIVATE, stage.toLowerCase() + '-paths.json.gz'), priv, true);
  console.error('done', doc.seconds, 's', JSON.stringify(families));
}
if (require.main === module) main();
