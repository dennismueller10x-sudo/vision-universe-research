#!/usr/bin/env node
'use strict';
// V12 MCAP: before/after comparison of the V10 factor study, the V10 top-50 strategy and the size/valuation features of the
// V11 winners study on the old vs. corrected PIT market cap. Pure comparison of outputs produced by the unchanged study code
// (scripts/quant/v10/factor/study.cjs, strategy.cjs; scripts/quant/v11/winners/build.cjs + analyze.cjs) on
//   before = V10 panel rebuilt on the current frame (scripts/quant/v12/mcap/panel.cjs --mode before)
//   after  = same with quant/engines/research-pit-market-cap.cjs (--mode after; winners via winners-preload.cjs).
// Usage: node impact.cjs --private <dir> --out <json>
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto');
const P = require('../../v10/factor/panel.cjs');
const SCRATCH = '/tmp/claude-0/-home-user-vision-universe-research/f429e7bd-1176-554d-8fa5-5081d98ef531/scratchpad';
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const r6 = x => (typeof x === 'number' && Number.isFinite(x) ? +x.toPrecision(6) : x ?? null);
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

function studyCells(study) {
  const out = {};
  for (const t of study.table) {
    const e = t.endpoints, k = t.signal + ':' + t.horizonBars;
    const pick = x => (x ? { mean: r6(x.mean), pBlock: r6(x.block?.pValue), ci: x.block?.ci?.map(r6) || null, holm: r6(x.holm), holmReject05: x.holmReject05 ?? null } : null);
    out[k] = { datesUsed: t.datesUsed, observed: t.coverage?.observed ?? null, E1_IC: pick(e.E1_IC), E2_SPREAD: pick(e.E2_SPREAD), E3_EXCESS_SPY: pick(e.E3_EXCESS_SPY), E4_EXCESS_EW: pick(e.E4_EXCESS_EW),
      icSubperiods: (e.E1_IC?.subperiods || []).map(s => ({ from: s.from, mean: r6(s.mean), p: r6(s.p) })) };
  }
  return out;
}
function compareStudy(b, a) {
  const cb = studyCells(b), ca = studyCells(a), cells = {}, changes = [];
  for (const k of Object.keys(cb)) {
    const x = cb[k], y = ca[k];
    cells[k] = { before: x, after: y, deltaIC: r6(y.E1_IC.mean - x.E1_IC.mean), deltaSpread: r6(y.E2_SPREAD.mean - x.E2_SPREAD.mean), deltaObserved: y.observed - x.observed };
    for (const ep of ['E1_IC', 'E2_SPREAD', 'E3_EXCESS_SPY', 'E4_EXCESS_EW']) {
      if (x[ep].holmReject05 !== y[ep].holmReject05) changes.push({ cell: k, endpoint: ep, kind: 'HOLM_DECISION_CHANGED', before: x[ep].holmReject05, after: y[ep].holmReject05 });
      if (Math.sign(x[ep].mean) !== Math.sign(y[ep].mean)) changes.push({ cell: k, endpoint: ep, kind: 'SIGN_CHANGED', before: x[ep].mean, after: y[ep].mean });
    }
  }
  const rej = s => Object.fromEntries(Object.entries(s.multipleTesting).map(([k, v]) => [k, v.rejections05]));
  return { rejections05: { before: rej(b), after: rej(a) }, changes, cells };
}
function compareStrategy(b, a) {
  const m = r => ({ cagr: r6(r.metrics.cagr), sharpe: r6(r.metrics.sharpe), maxDrawdown: r6(r.metrics.maxDrawdown), excessCagr: r6(r.metrics.excessCagr), turnoverPerYear: r6(r.metrics.turnoverPerYear),
    monthlyExcessMean: r6(r.metrics.monthlyExcess?.mean), monthlyExcessPBlock: r6(r.metrics.monthlyExcess?.pValueBlock ?? r.metrics.monthlyExcess?.block?.pValue) });
  const out = {};
  for (const k of Object.keys(b.runs)) out[k] = { before: m(b.runs[k]), after: m(a.runs[k]) };
  return { runs: out, selection: { before: b.selection, after: a.selection } };
}
function panelCompare(fb, fa) {
  const pb = P.readPanel(fb, { withRaws: true }), pa = P.readPanel(fa, { withRaws: true });
  const sum = (p, key) => p.dates.reduce((s, d) => s + d.rows.filter(r => r.scores && Number.isFinite(r.scores[key])).length, 0);
  const avail = {}; for (const s of ['value', 'quality', 'growth', 'profitability', 'composite']) avail[s] = { before: sum(pb, s), after: sum(pa, s) };
  let jacc = 0, nd = 0, changedRanks = 0, rows = 0, mcapChanged = 0, valueScoreChanged = 0;
  const top = (d, n = 50) => d.rows.filter(r => Number.isFinite(r.scores?.composite)).sort((x, y) => y.scores.composite - x.scores.composite || (x.id < y.id ? -1 : 1)).slice(0, n).map(r => r.id);
  for (let i = 0; i < pb.dates.length; i++) {
    const db = pb.dates[i], da = pa.dates[i];
    if (db.date !== da.date) throw Error('PANEL_DATE_MISMATCH');
    const tb = new Set(top(db)), ta = new Set(top(da));
    if (tb.size && ta.size) { const inter = [...tb].filter(x => ta.has(x)).length; jacc += inter / (tb.size + ta.size - inter); nd++; }
    const ma = new Map(da.rows.map(r => [r.id, r]));
    for (const r of db.rows) {
      const q = ma.get(r.id); rows++;
      if (!q) continue;
      if (r.marketCap !== q.marketCap) mcapChanged++;
      if (r.scores?.value !== q.scores?.value) valueScoreChanged++;
      if (r.scores?.composite !== q.scores?.composite) changedRanks++;
    }
  }
  return { rows, rowsMarketCapChanged: mcapChanged, rowsValueScoreChanged: valueScoreChanged, rowsCompositeChanged: changedRanks, availability: avail, top50CompositeJaccardMean: r6(jacc / nd), datesCompared: nd };
}
const WINNER_FEATURES = ['logMarketCap', 'salesToMarketCap', 'earningsYield', 'salesYield', 'bookToMarket'];
const CONTROL_FEATURES = ['mom12_1m', 'vol52w', 'revenueGrowthTtmYoy'];
function winners(b, a) {
  const out = {}, changes = [];
  for (const h of Object.keys(b.features)) for (const f of WINNER_FEATURES.concat(CONTROL_FEATURES)) {
    const x = b.features[h][f], y = a.features[h][f]; if (!x || !y) continue;
    const pick = z => ({ members: z.membersWithFeature, top1Auc: r6(z.top1?.auc?.mean), top5Auc: r6(z.top5?.auc?.mean), top5AucP: r6(z.top5?.auc?.pValue), top5Holm: r6(z.top5?.auc?.holmAdjustedP), loserAuc: r6(z.loser?.auc?.mean), top5Lift: r6(z.top5?.topQuintile?.lift) });
    const px = pick(x), py = pick(y);
    out[h + '|' + f] = { before: px, after: py, deltaTop5Auc: r6(py.top5Auc - px.top5Auc), control: CONTROL_FEATURES.includes(f) };
    if (px.top5Auc !== null && py.top5Auc !== null && Math.sign(px.top5Auc - 0.5) !== Math.sign(py.top5Auc - 0.5)) changes.push({ key: h + '|' + f, kind: 'AUC_SIDE_OF_0.5_CHANGED' });
  }
  return { features: out, changes, reproHashBefore: b.reproHash, reproHashAfter: a.reproHash };
}

function main() {
  const priv = arg('--private', path.join(SCRATCH, 'v12-private/mcap'));
  const outFile = arg('--out');
  const J = f => JSON.parse(fs.readFileSync(f, 'utf8'));
  const sb = J(path.join(priv, 'impact-before/factor-study-1.0.0.json')), sa = J(path.join(priv, 'impact-after/factor-study-1.0.0.json'));
  const gb = J(path.join(priv, 'impact-before/strategy-1.0.0.json')), ga = J(path.join(priv, 'impact-after/strategy-1.0.0.json'));
  const wb = J(path.join(priv, 'winners-before/out/anatomy-results-1.0.0.json')), wa = J(path.join(priv, 'winners-after/out/anatomy-results-1.0.0.json'));
  const pubV10 = J(path.resolve(__dirname, '../../../../docs/quant-recovery/v10/factor/factor-study-1.0.0.json'));
  const pubV11 = J(path.resolve(__dirname, '../../../../docs/quant-recovery/v11/winners/anatomy-results-1.0.0.json'));
  const panel = panelCompare(path.join(priv, 'before/panel.jsonl.gz'), path.join(priv, 'after/panel.jsonl.gz'));
  const doc = {
    schemaVersion: 'v12-mcap-impact-1.0.0', evidenceKind: 'RECONSTRUCTION', certificationStatus: 'NOT_CERTIFIED', productionApproved: false,
    correction: { module: 'quant/engines/research-pit-market-cap.cjs', register: 'quant/engines/research-pit-market-cap-register.cjs', ruleVersion: '1.0.8' },
    reproducibility: {
      v10StudyBeforeVsPublished: { publishedReproHash: pubV10.reproHash, beforeReproHash: sb.reproHash, note: 'before = V10 code on the current frame; differs from the published V10 run only by the CA register 1.1.2 frame (VSTS, 23 panel rows) if hashes differ' },
      v11WinnersBeforeVsPublished: { publishedReproHash: pubV11.reproHash, beforeReproHash: wb.reproHash, identical: pubV11.reproHash === wb.reproHash },
      inputs: { panelBefore: sha(path.join(priv, 'before/panel.jsonl.gz')), panelAfter: sha(path.join(priv, 'after/panel.jsonl.gz')) }
    },
    panel, factorStudy: compareStudy(sb, sa), strategyTop50: compareStrategy(gb, ga), winners: winners(wb, wa)
  };
  fs.writeFileSync(outFile, JSON.stringify(doc, null, 1) + '\n');
  console.log(JSON.stringify({ panel, rejections: doc.factorStudy.rejections05, studyChanges: doc.factorStudy.changes, strategy: doc.strategyTop50.runs, winnersChanges: doc.winners.changes }, null, 1));
}
if (require.main === module) main();
