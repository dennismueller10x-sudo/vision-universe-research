#!/usr/bin/env node
'use strict';
// E3-Ausführung nach docs/research/edge/PROTOKOLL.md (eingefroren, SHA-256 in study.cjs). Forschung, nicht zertifiziert.
//
//   node scripts/research/edge/run-e3.cjs --phase dev-quant  --work-dir D --delisted-dir D --delisted-raw-dir D --fundamentals D
//   node scripts/research/edge/run-e3.cjs --phase select                       (braucht runs/dev-quant.json und runs/dev-st.json)
//   node scripts/research/edge/run-e3.cjs --phase test-quant ... (Daten wie dev) (verweigert ohne festgeschriebene Auswahl)
//   node scripts/research/edge/run-e3.cjs --phase report                       (Statistik, Holm über 192 Hypothesen, BERICHT.md)
//
// Schreibt nur unter docs/research/edge/runs/ bzw. docs/research/edge/BERICHT.md. PROTOKOLL.md wird nie geschrieben.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../..');
const S = require('./study.cjs');
const Q = require('./quant-e3.cjs');
const OUT = path.join(ROOT, 'docs/research/edge/runs');
const DEV = ['2012-01-01', '2019-12-31'], TEST = ['2020-01-01', '2026-10-02'];
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const VERSION = 'edge-e3-run-1.0.0';

function args(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) { const k = argv[i]; if (!k.startsWith('--')) throw Error('ARG ' + k); a[k.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[i + 1]; i++; }
  return a;
}
function protocolGuard() {
  const h = sha(fs.readFileSync(path.join(ROOT, 'docs/research/edge/PROTOKOLL.md')));
  if (h !== S.PROTOCOL_SHA256) throw Error('PROTOCOL_CHANGED ' + h);
  return h;
}
function write(name, doc) {
  fs.mkdirSync(OUT, { recursive: true });
  const text = JSON.stringify(doc) + '\n';
  fs.writeFileSync(path.join(OUT, name), text);
  return sha(text);
}
const read = name => { const f = path.join(OUT, name); return fs.existsSync(f) ? { doc: JSON.parse(fs.readFileSync(f, 'utf8')), sha256: sha(fs.readFileSync(f)) } : null; };

// ------------------------------------------------------------ Benchmarks (Gesamtrendite, Wochenraster, ohne Auffüllen)
function benchmarks(MP) {
  const Codec = require(path.join(ROOT, 'vorsorge/engines/series-codec.js'));
  const out = {};
  for (const sym of ['SPY', 'RSP', 'IWM']) {
    const file = 'vorsorge/data/series/' + sym + '.json', bytes = fs.readFileSync(path.join(ROOT, file)), d = JSON.parse(bytes);
    if (d.symbol !== sym || d.totalReturn.state !== 'TOTAL_RETURN_RECONSTRUCTED') throw Error('BENCHMARK_TR_UNAVAILABLE ' + sym);
    out[sym] = { file, sha256: sha(bytes), byWeek: new Map(Codec.decode(d.total.weekly).map(([dt, v]) => [MP.isoWeek(dt), v])) };
  }
  return out;
}
function spyDaily() {
  const file = 'quant/data/market/multi-asset/series/SPY.json', bytes = fs.readFileSync(path.join(ROOT, file)), d = JSON.parse(bytes);
  if (d.symbol !== 'SPY' || d.valueSemantics !== 'PRICE' || d.source !== 'tiingo-equity') throw Error('SPY_DAILY_INVALID');
  return { file, sha256: sha(bytes), points: d.points };
}
function evaluate(equity, bm, MP) {
  // Gemeinsame Wochenstichtage aller drei Benchmarks; kein Auffüllen.
  const rows = equity.filter(([d]) => ['SPY', 'RSP', 'IWM'].every(s => bm[s].byWeek.has(MP.isoWeek(d))));
  const dates = rows.map(r => r[0]), lv = rows.map(r => r[1]);
  const res = { dates: [dates[0], dates.at(-1)], weeks: dates.length, droppedWeeks: equity.length - rows.length, strategy: S.metrics(lv, dates) };
  for (const s of ['SPY', 'RSP', 'IWM']) {
    const b = dates.map(d => bm[s].byWeek.get(MP.isoWeek(d)));
    res[s] = S.metrics(b, dates);
  }
  res.returns = lv.slice(1).map((v, i) => v / lv[i] - 1);
  res.spyReturns = (() => { const b = dates.map(d => bm.SPY.byWeek.get(MP.isoWeek(d))); return b.slice(1).map((v, i) => v / b[i] - 1); })();
  return res;
}

function runQuant(a, window, phase) {
  const MP = require(path.join(ROOT, 'scripts/quant/portfolio/model-portfolios.cjs'));
  const panel = MP.buildPanel({ workDir: a.workDir, delistedDir: a.delistedDir, delistedRawDir: a.delistedRawDir, fundamentals: a.fundamentals, window: TEST, limit: 0 });
  if (panel.basis !== 'TOTAL_RETURN') throw Error('TOTAL_RETURN_PANEL_REQUIRED');
  const bm = benchmarks(MP), spy = spyDaily(), filterStateAt = Q.marketFilter(spy.points);
  const anchorDate = panel.calendar.find(d => d >= DEV[0]);
  const selector = Q.createSelector(panel);
  const variants = S.variants().filter(v => v.family === 'quant');
  const results = [];
  for (const v of variants) {
    const t0 = Date.now();
    let r;
    try { r = Q.runVariant(panel, selector, v, { window, anchorDate, filterStateAt }); }
    catch (e) { results.push({ id: v.id, state: 'FAILED', error: e.code || String(e.message).slice(0, 120) }); continue; }
    const ev = evaluate(r.equity, bm, MP);
    results.push({ id: v.id, state: r.state, window: r.window, evaluation: { ...ev, returns: undefined, spyReturns: undefined }, weeklyReturns: ev.returns, spyWeeklyReturns: ev.spyReturns,
      costs: r.costs, turnover: r.turnover, cashShare: r.cashShare, terminalEvents: r.terminalEvents, carriedBars: r.carriedBars, construction: r.construction, ledgerResultHash: r.ledgerResultHash || null, seconds: Math.round((Date.now() - t0) / 1000) });
    console.log(JSON.stringify({ id: v.id, state: r.state, sharpe: ev.strategy.sharpe, cagr: ev.strategy.cagr, spyCagr: ev.SPY.cagr }));
  }
  return { schemaVersion: VERSION, phase, label: 'Forschung, nicht zertifiziert', protocolSha256: S.PROTOCOL_SHA256, adapter: Q.VERSION, window, anchorDate,
    data: { ...panel.meta, population: panel.population, benchmarks: Object.fromEntries(Object.entries(bm).map(([k, v]) => [k, { file: v.file, sha256: v.sha256 }])), spyDaily: { file: spy.file, sha256: spy.sha256 } },
    results };
}

function select() {
  const q = read('dev-quant.json'), st = read('dev-st.json');
  if (!q) throw Error('DEV_QUANT_MISSING');
  if (!st) throw Error('DEV_ST_MISSING: Supertrader-Entwicklungsläufe (Strang B) fehlen; Auswahl über alle 96 Varianten erst danach');
  const all = [...q.doc.results, ...st.doc.results];
  if (all.length !== 96) throw Error('VARIANT_COUNT ' + all.length);
  const ok = all.filter(r => r.state === 'RUN' && Number.isFinite(r.evaluation.strategy.sharpe));
  ok.sort((x, y) => y.evaluation.strategy.sharpe - x.evaluation.strategy.sharpe || y.evaluation.strategy.cagr - x.evaluation.strategy.cagr || (x.id < y.id ? -1 : 1));
  const doc = { schemaVersion: VERSION, phase: 'select', protocolSha256: S.PROTOCOL_SHA256, rule: 'höchster Netto-Sharpe (rf=0), dann Netto-CAGR, dann Varianten-ID',
    devQuantSha256: q.sha256, devStSha256: st.sha256, winner: ok[0] ? ok[0].id : null, ranking: ok.map(r => [r.id, r.evaluation.strategy.sharpe, r.evaluation.strategy.cagr]),
    notComputable: all.filter(r => !ok.includes(r)).map(r => r.id) };
  return write('selection.json', doc);
}

function main() {
  const a = args(process.argv);
  protocolGuard();
  if (a.phase === 'dev-quant') console.log(JSON.stringify({ sha256: write('dev-quant.json', runQuant(a, DEV, 'dev-quant')) }));
  else if (a.phase === 'select') console.log(JSON.stringify({ sha256: select() }));
  else if (a.phase === 'test-quant') {
    const s = read('selection.json');
    if (!s || !s.doc.winner) throw Error('SELECTION_NOT_FROZEN: Prüfteil bleibt geschlossen');
    console.log(JSON.stringify({ sha256: write('test-quant.json', { ...runQuant(a, TEST, 'test-quant'), selectionSha256: s.sha256 }) }));
  } else if (a.phase === 'report') require('./report-e3.cjs').main(OUT);
  else throw Error('PHASE ' + a.phase);
}
if (require.main === module) main();
module.exports = { evaluate, DEV, TEST };
