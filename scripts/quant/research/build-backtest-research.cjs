#!/usr/bin/env node
'use strict';
// Erzeuger des Produktartefakts quant/data/product/backtest-research-v1.json (Datenart backtestResearch).
//   node scripts/quant/research/build-backtest-research.cjs [--out <datei>] [--as-of YYYY-MM-DD]
//
// Rechnet die festen Prüffälle aus docs/quant/backtest-demos/cases.json mit dem Research-Runner
// (scripts/quant/research/backtest-runner.cjs) und schreibt je Fall die Zusatzmethoden in kompakter Form:
// Monte Carlo, Walk-Forward, Out-of-Sample, Marktregime, Parameter-Sensitivität, Ereignis-Studie,
// Portfolio-Rebalancing. Keine neue Rechnung: die Werte kommen unverändert aus dem Ergebnisvertrag v2.
//
// Das Artefakt ist Forschung, nicht zertifiziert, und nur für die interne Ansicht (audience INTERNAL,
// display.public false). Öffentliche Rendite- oder Performanceaussagen brauchen eine Owner-Freigabe.
// Fälle, die private Daten brauchen (delistete Reihen, V10-Faktorpanel), stehen mit ihrem Zustand
// PREPARED_DATA_LIMITED und dem fehlenden Eingang da; sie werden nicht geschätzt.
const fs = require('node:fs');
const path = require('node:path');
const R = require('./backtest-runner.cjs');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const CASES = path.join(ROOT, 'docs/quant/backtest-demos/cases.json');
const DEFAULT_OUT = path.join(ROOT, 'quant/data/product/backtest-research-v1.json');
const SCHEMA = 'backtest-research-1.0.0';
const METHODS = ['MONTE_CARLO', 'WALK_FORWARD', 'OUT_OF_SAMPLE', 'MARKET_REGIME', 'PARAMETER_SENSITIVITY', 'EVENT_DRIVEN', 'PORTFOLIO_REBALANCING'];

function parse(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i += 2) {
    const k = { '--out': 'out', '--as-of': 'asOf' }[argv[i]];
    if (!k || !argv[i + 1]) throw Error('INVALID_ARGUMENTS:' + argv[i]);
    o[k] = argv[i + 1];
  }
  if (o.asOf && !/^\d{4}-\d{2}-\d{2}$/.test(o.asOf)) throw Error('INVALID_AS_OF');
  return o;
}
const num = x => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const q3 = x => (x && typeof x === 'object' ? { p5: num(x.p5), p50: num(x.p50), p95: num(x.p95) } : null);
const pair = x => (Array.isArray(x) && x.length === 2 ? [num(x[0]), num(x[1])] : null);

// Je Methode nur die Felder, die die interne Ansicht braucht; Hashes bleiben als Beleg.
function compact(id, m) {
  const out = { state: m.state };
  if (m.state !== 'EXECUTED' || !m.result) { if (m.reason) out.reason = String(m.reason); return out; }
  const x = m.result;
  if (id === 'MONTE_CARLO') Object.assign(out, { model: x.model, simulations: num(x.simulations), horizon: num(x.horizon), sourceObservations: num(x.sourceObservations),
    totalReturn: q3(x.totalReturn), maxDrawdown: q3(x.maxDrawdown), scope: x.scope, inputHash: x.inputHash || null });
  else if (id === 'WALK_FORWARD') Object.assign(out, { mode: x.mode, folds: num(x.folds), sizes: x.sizes || null, excludedByReason: x.excludedByReason || {}, partitionHash: x.partitionHash || null });
  else if (id === 'OUT_OF_SAMPLE') Object.assign(out, { endpoint: x.endpoint, n: num(x.n), mean: num(x.mean),
    perFold: (x.perFold || []).map(f => ({ fold: f.fold, test: Array.isArray(f.test) ? f.test.slice(0, 2) : null, n: num(f.n), mean: num(f.mean) })), note: x.note || null, resultHash: x.resultHash || null });
  else if (id === 'MARKET_REGIME') Object.assign(out, { definition: x.definition, mode: x.mode,
    states: (x.states || []).map(s => ({ state: s.state, episodes: num(s.episodes), n: num(s.n), mean: num(s.mean), median: num(s.median), interval95: pair(s.interval95) })), regimeResultHash: x.regimeResultHash || null });
  else if (id === 'PARAMETER_SENSITIVITY') Object.assign(out, {
    grid: (x.grid || []).map(g => ({ parameters: g.parameters || {}, n: num(g.n), estimate: num(g.estimate), ci: pair(g.ci), adjustedPValue: num(g.adjustedPValue) })) });
  else if (id === 'EVENT_DRIVEN') Object.assign(out, { coverage: x.coverage || null, meanNet: num(x.meanNet), medianNet: num(x.medianNet), interval95: pair(x.interval95) });
  else if (id === 'PORTFOLIO_REBALANCING') Object.assign(out, { rule: x.rule || null, maxPositions: num(x.maxPositions), holdingWeeks: num(x.holdingWeeks), rebalances: num(x.rebalances),
    from: x.from || null, to: x.to || null, totalReturn: num(x.totalReturn), cagr: num(x.cagr), maxDrawdown: num(x.maxDrawdown), volatility: num(x.volatility),
    benchmarkTotalReturn: x.benchmark ? num(x.benchmark.totalReturn) : null, oneWayTurnoverSum: num(x.oneWayTurnoverSum) });
  return out;
}

function caseRow(c, r) {
  const e = r.envelope;
  const byId = Object.fromEntries(e.methods.map(m => [m.method, m]));
  return {
    id: c.id, kind: c.kind, scenarios: c.scenarios || [], purpose: c.purpose || null, privateData: c.privateData || null,
    state: r.state, evidenceKind: e.status.evidenceKind, certificationStatus: e.status.certificationStatus, period: e.period,
    events: { occurrences: num(e.events.occurrences), completed: num(e.events.completed) },
    metrics: { basis: e.metrics.basis, hitRate: num(e.metrics.hitRate), maxDrawdown: num(e.metrics.maxDrawdown), trades: num(e.metrics.trades), totalReturn: num(e.metrics.totalReturn), cagr: num(e.metrics.cagr) },
    missingInputs: e.limitations.filter(x => x.startsWith('MISSING_INPUT:')),
    methods: Object.fromEntries(METHODS.map(id => [id, byId[id] ? compact(id, byId[id]) : { state: 'NOT_APPLICABLE' }])),
    resultHash: r.resultHash
  };
}

function build(opts = {}) {
  const spec = JSON.parse(fs.readFileSync(CASES, 'utf8'));
  const cases = spec.cases.filter(c => !opts.only || opts.only.includes(c.id)).map(c => {
    const s = JSON.parse(fs.readFileSync(path.join(path.dirname(CASES), c.spec), 'utf8'));
    return caseRow(c, R.runBacktest(s, { cacheDir: null, privateDirs: { delistedSeries: null, factorPanel: null } }));
  });
  const executed = m => cases.filter(c => c.methods[m].state === 'EXECUTED').length;
  return {
    schemaVersion: SCHEMA,
    asOf: opts.asOf || new Date().toISOString().slice(0, 10),
    runner: R.VERSION,
    label: 'Forschung, nicht zertifiziert',
    audience: 'INTERNAL',
    display: { public: false, reason: 'Öffentliche Rendite- oder Performanceaussagen brauchen eine Owner-Freigabe (CLAUDE.md, Freigaben).' },
    certificationStatus: 'NOT_CERTIFIED',
    productionApproved: false,
    source: 'docs/quant/backtest-demos/cases.json',
    summary: { cases: cases.length, executed: cases.filter(c => c.state === 'RESEARCH_EXECUTED').length,
      dataLimited: cases.filter(c => c.state === 'PREPARED_DATA_LIMITED').length,
      methods: Object.fromEntries(METHODS.map(m => [m, executed(m)])) },
    cases
  };
}

function main(argv = process.argv.slice(2)) {
  const o = parse(argv);
  const out = path.resolve(o.out || DEFAULT_OUT);
  const doc = build({ asOf: o.asOf });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(doc, null, 1) + '\n');
  console.log(JSON.stringify({ out: path.relative(ROOT, out), ...doc.summary }));
  return doc;
}
if (require.main === module) { try { main(); } catch (e) { console.error(e.stack); process.exitCode = 1; } }
module.exports = { build, compact, caseRow, METHODS, SCHEMA };
