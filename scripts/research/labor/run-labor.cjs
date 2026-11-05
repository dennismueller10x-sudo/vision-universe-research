#!/usr/bin/env node
'use strict';
// Strang G Strategie-Labor: Ausführung nach docs/research/labor/PROTOKOLL.md (eingefroren). Forschung, nicht zertifiziert.
//
//   node scripts/research/labor/run-labor.cjs --phase dev     --work-dir D --delisted-dir D --delisted-raw-dir D --fundamentals D
//                                              [--insider FILE] [--sue FILE] --public-key FILE
//   node scripts/research/labor/run-labor.cjs --phase test    (Daten wie dev; verlangt runs/selection.json)
//   node scripts/research/labor/run-labor.cjs --phase holdout (Daten wie dev; verlangt HOLDOUT_FREIGABE.md und runs/test-public.json)
//   node scripts/research/labor/run-labor.cjs --phase open --private-key FILE --in runs/dev.sealed.json --out FILE (außerhalb des Repos)
//   [--etf-only]  nur die ETF-Familie (ohne Kursarchiv; Aktienvarianten werden als NOT_RUN gezählt, nie als Ergebnis)
//
// Öffentlich (docs/research/labor/runs/*-public.json, selection.json): nur Zustände, Auswahl, Urteile und Hashes.
// Alles mit Zahlen: versiegelt (*.sealed.json, seal.cjs). PROTOKOLL.md wird nie geschrieben.
const fs = require('node:fs');
const path = require('node:path');
const Pr = require('./protocol.cjs');
const Ev = require('./evaluate.cjs');
const St = require('./stats.cjs');
const Seal = require('./seal.cjs');
const ROOT = Pr.ROOT;
let OUT = path.join(ROOT, 'docs/research/labor/runs');
const VERSION = 'labor-run-1.0.0';

function args(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) { const k = argv[i]; if (!k.startsWith('--')) throw Error('ARG ' + k); const key = k.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (key === 'etfOnly') { a.etfOnly = true; continue; } a[key] = argv[++i]; }
  return a;
}
const writeJson = (name, doc) => { fs.mkdirSync(OUT, { recursive: true }); const t = JSON.stringify(doc, null, 1) + '\n'; fs.writeFileSync(path.join(OUT, name), t); return Pr.sha256(t); };
const readJson = name => { const f = path.join(OUT, name); if (!fs.existsSync(f)) return null; const b = fs.readFileSync(f); return { doc: JSON.parse(b), sha256: Pr.sha256(b) }; };

function context(a) {
  const MP = require(path.join(ROOT, 'scripts/quant/portfolio/model-portfolios.cjs'));
  const Q = require(path.join(ROOT, 'scripts/research/edge/quant-e3.cjs'));
  const Etf = require('./etf-engine.cjs');
  const spyDaily = JSON.parse(fs.readFileSync(path.join(ROOT, 'quant/data/market/multi-asset/series/SPY.json'), 'utf8'));
  const us10y = JSON.parse(fs.readFileSync(path.join(ROOT, 'quant/data/market/multi-asset/series/US10Y.json'), 'utf8'));
  if (spyDaily.symbol !== 'SPY' || spyDaily.valueSemantics !== 'PRICE') throw Error('SPY_DAILY_INVALID');
  const spyOn = Q.marketFilter(spyDaily.points), shock = Etf.rateShock(us10y.points);
  const etfs = Etf.loadEtfs(MP.isoWeek);
  let panel = null;
  if (!a.etfOnly) {
    panel = MP.buildPanel({ workDir: a.workDir, delistedDir: a.delistedDir, delistedRawDir: a.delistedRawDir, fundamentals: a.fundamentals, window: Pr.WINDOWS.test, limit: Number(a.limit || 0) });
    if (!a.allowPriceOnly && panel.basis !== 'TOTAL_RETURN') throw Error('TOTAL_RETURN_PANEL_REQUIRED');
  }
  const Codec = require(path.join(ROOT, 'vorsorge/engines/series-codec.js'));
  const spyTr = Codec.decode(JSON.parse(fs.readFileSync(path.join(ROOT, 'vorsorge/data/series/SPY.json'), 'utf8')).total.weekly);
  const weeks = spyTr.map(p => p[0]), spyByDate = new Map(spyTr);
  const bilRet = new Map(); weeks.forEach((d, i) => { if (i) { const a0 = etfs.BIL.get(MP.isoWeek(weeks[i - 1])), b0 = etfs.BIL.get(MP.isoWeek(d)); bilRet.set(d, a0 > 0 && b0 > 0 ? b0 / a0 - 1 : 0); } });
  const loadEvents = (file, kind) => {
    if (!file) return null;
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { meta: { schema: d.schema, quarters: d.quarters ? d.quarters.map(q => q.q) : null, missing: d.missing || [], stats: d.stats, sha256: Pr.sha256(fs.readFileSync(file)) }, map: new Map(Object.entries(d.events)), kind };
  };
  const ins = loadEvents(a.insider, 'insider'), sue = loadEvents(a.sue, 'sue');
  return { MP, Q, Etf, panel, spyOn, shock, etfs, weeks, spyByDate, bilRet, ins, sue,
    data: { spyDailySha256: Pr.sha256(fs.readFileSync(path.join(ROOT, 'quant/data/market/multi-asset/series/SPY.json'))), panel: panel ? { ...panel.meta, basis: panel.basis, population: panel.population, datasetHash: panel.provenance.datasetHash } : null,
      insider: ins ? ins.meta : null, sue: sue ? sue.meta : null } };
}

// Insider-Abdeckung: alle Quartale von (Fensterstart − 26 Wochen) bis zur letzten Entscheidung vorhanden.
function insiderCovered(meta, window) {
  if (!meta || !meta.quarters) return false;
  const have = new Set(meta.quarters), q = d => d.slice(0, 4) + 'q' + (Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1);
  const start = new Date(Date.parse(window[0]) - 26 * 7 * 86400000).toISOString().slice(0, 10);
  // Letzte Entscheidung liegt eine Woche vor Fensterende (Ausführung in der Folgewoche); gebraucht werden Einreichungen davor.
  const end = new Date(Date.parse(window[1]) - 7 * 86400000).toISOString().slice(0, 10);
  for (let t = Date.parse(start); t <= Date.parse(end); t += 28 * 86400000) if (!have.has(q(new Date(t).toISOString().slice(0, 10)))) return false;
  return have.has(q(end));
}
function blockedReason(v, ctx, window) {
  if (v.kind === 'etf') return null;
  if (!ctx.panel) return 'NOT_RUN_ETF_ONLY';
  const needIns = v.family === 'INS' || v.score === 'K6' || v.family === 'LERN', needSue = v.family === 'PEAD' || v.score === 'K5' || v.family === 'LERN';
  if (needIns && !insiderCovered(ctx.ins && ctx.ins.meta, window)) return 'INSIDER_DATA_MISSING';
  if (needSue && !ctx.sue) return 'SUE_DATA_MISSING';
  return null;
}

function runOne(v, ctx, phase, opts = {}) {
  const window = Pr.WINDOWS[phase];
  const reason = blockedReason(v, ctx, window);
  if (reason) return { id: v.id, family: v.family, state: 'BLOCKED', reason };
  const t0 = Date.now();
  try {
    let equity, extra;
    if (v.kind === 'etf') {
      const r = ctx.Etf.runEtf(v, { weeks: ctx.weeks, window, etfs: ctx.etfs, isoWeek: ctx.MP.isoWeek, spyOn: ctx.spyOn, shock: ctx.shock, cashInterest: opts.cashInterest !== false });
      if (opts.engineCosts) throw Error('ETF_ENGINE_COSTS_VIA_COSTS_OVERRIDE');
      equity = r.equity; extra = { costs: r.costs, turnover: r.turnover, trades: r.trades, switches: r.switches, blockedWeeks: r.blockedWeeks, lastHolding: r.held.at(-1) };
    } else {
      const SE = require('./stock-engine.cjs');
      if (!ctx.selector) ctx.selector = SE.createSelector(ctx.panel, { insider: ctx.ins ? ctx.ins.map : null, sue: ctx.sue ? ctx.sue.map : null });
      const variant = opts.engineCosts ? { ...v, standard: { ...v.standard, ...Pr.ENGINE_COSTS } } : v;
      const r = SE.runVariant(ctx.panel, ctx.selector, variant, { window, trainStart: Pr.TRAIN_START[phase], filterStateAt: ctx.spyOn, terminalRecovery: opts.terminal || Pr.TERMINAL });
      equity = opts.cashInterest === false ? r.equity : SE.withCashInterest(r.equity, r.cashShare, ctx.bilRet);
      extra = { costs: r.costs, turnover: r.turnover, terminalEvents: r.terminalEvents, carriedBars: r.carriedBars, construction: r.construction, ledgerResultHash: r.ledgerResultHash || null, lastHoldings: r.lastHoldings };
    }
    const e = Ev.evaluate(equity, ctx.spyByDate);
    return { id: v.id, family: v.family, state: 'RUN', window: [e.dates[0], e.dates.at(-1)], evaluation: { strategy: e.strategy, SPY: e.SPY, weeks: e.dates.length, droppedWeeks: e.droppedWeeks },
      returns: e.returns, spyReturns: e.spyReturns, retDates: e.retDates, ...extra, seconds: Math.round((Date.now() - t0) / 1000) };
  } catch (err) { return { id: v.id, family: v.family, state: 'FAILED', error: err.code || String(err.message).slice(0, 160) }; }
}
const evalOf = r => (r.state === 'RUN' ? { strategy: r.evaluation.strategy, SPY: r.evaluation.SPY, returns: r.returns, spyReturns: r.spyReturns, retDates: r.retDates } : null);

function sealTo(name, doc, a) {
  const pem = fs.readFileSync(a.publicKey || path.join(ROOT, 'docs/research/labor/empfaenger.pem'), 'utf8');
  const text = JSON.stringify(doc), sealed = Seal.seal(text, pem);
  writeJson(name, sealed);
  return sealed.plaintextSha256;
}
function stateCounts(results) { return results.reduce((o, r) => (o[r.state] = (o[r.state] || 0) + 1, o), {}); }

function phaseDev(a) {
  Pr.protocolGuard();
  if (readJson('selection.json')) throw Error('SELECTION_ALREADY_FROZEN');
  const ctx = context(a), variants = Pr.variants(), results = [];
  for (const v of variants) { const r = runOne(v, ctx, 'dev'); results.push(r); console.log(JSON.stringify({ id: r.id, state: r.state, reason: r.reason || r.error || null, s: r.seconds })); }
  const evals = Object.fromEntries(results.map(r => [r.id, evalOf(r)])), fam = Object.fromEntries(variants.map(v => [v.id, v.family]));
  const sel = Ev.select(evals, fam), wf = Ev.walkForward(evals), rc = Ev.realityCheck(evals);
  const doc = { schemaVersion: VERSION, phase: 'dev', label: 'Forschung, nicht zertifiziert', protocolSha256: Pr.PROTOCOL_SHA256, window: Pr.WINDOWS.dev, data: ctx.data, results, selection: sel, walkForward: wf, realityCheck: rc };
  const plain = sealTo('dev.sealed.json', doc, a);
  const pub = { schemaVersion: VERSION, phase: 'dev', label: 'Forschung, nicht zertifiziert', protocolSha256: Pr.PROTOCOL_SHA256, devPlaintextSha256: plain,
    rule: 'Protokoll §7: Zulassung (a) Gesamtrendite > SPY, (b) beide Hälften positiv, (c) Verlust höchstens 10 pp schlechter; Rang DSR, max. 2 je Familie, max. 5; freie Plätze Weg weniger Verlust',
    trials: variants.length, states: stateCounts(results), blocked: results.filter(r => r.state !== 'RUN').map(r => ({ id: r.id, state: r.state, reason: r.reason || r.error })),
    candidates: sel.candidates, walkForwardSelectorBeatsSpy: wf.beats, etfOnly: !!a.etfOnly, data: { insider: ctx.data.insider && { quarters: (ctx.data.insider.quarters || []).length, missing: ctx.data.insider.missing, sha256: ctx.data.insider.sha256 }, sue: ctx.data.sue && { sha256: ctx.data.sue.sha256 }, panelDatasetHash: ctx.data.panel && ctx.data.panel.datasetHash } };
  if (!a.etfOnly) writeJson('selection.json', pub); else writeJson('dev-etf-public.json', pub);
  console.log(JSON.stringify({ candidates: sel.candidates, states: pub.states }));
}

function phaseTest(a) {
  Pr.protocolGuard();
  const s = readJson('selection.json'); if (!s) throw Error('SELECTION_MISSING');
  if (readJson('test-public.json')) throw Error('TEST_ALREADY_RUN');
  const ctx = context(a), byId = new Map(Pr.variants().map(v => [v.id, v])), out = [];
  for (const c of s.doc.candidates) {
    const v = byId.get(c.id);
    const main = runOne(v, ctx, 'test');
    const sens = {
      CASH_UNVERZINST: runOne(v, ctx, 'test', { cashInterest: false }),
      ...(v.kind === 'stock' ? { ENGINE_KOSTEN_1_5: runOne(v, ctx, 'test', { engineCosts: true }), ENDWERT_STRENG: runOne(v, ctx, 'test', { terminal: Pr.TERMINAL_HARSH }) } : {}),
    };
    const e = evalOf(main), p = e ? St.pairedTest(e.returns, e.spyReturns) : null;
    out.push({ ...c, result: main, test: p, verdict: Ev.verdict(e, null), sensitivity: Object.fromEntries(Object.entries(sens).map(([k, r]) => [k, r.state === 'RUN' ? { strategy: r.evaluation.strategy, SPY: r.evaluation.SPY } : { state: r.state }])) });
    console.log(JSON.stringify({ id: c.id, state: main.state }));
  }
  const holm = out.length ? St.holm(out.map(x => (x.test ? x.test.pLog : 1))) : [];
  out.forEach((x, i) => { x.holmP = holm[i]; });
  const plain = sealTo('test.sealed.json', { schemaVersion: VERSION, phase: 'test', protocolSha256: Pr.PROTOCOL_SHA256, selectionSha256: s.sha256, window: Pr.WINDOWS.test, data: ctx.data, candidates: out }, a);
  writeJson('test-public.json', { schemaVersion: VERSION, phase: 'test', label: 'Forschung, nicht zertifiziert', protocolSha256: Pr.PROTOCOL_SHA256, selectionSha256: s.sha256, testPlaintextSha256: plain,
    candidates: out.map(x => ({ id: x.id, track: x.track, state: x.result.state, testBeatsSpy: x.verdict.testBeats ?? null, testLowLoss: x.verdict.testLowLoss ?? null, verdict: typeof x.verdict === 'string' ? x.verdict : x.verdict.final })) });
}

function phaseHoldout(a) {
  Pr.protocolGuard();
  const t = readJson('test-public.json'); if (!t) throw Error('TEST_MISSING');
  const ff = path.join(ROOT, 'docs/research/labor/HOLDOUT_FREIGABE.md');
  if (!fs.existsSync(ff)) throw Error('HOLDOUT_NOT_CONFIRMED');
  const text = fs.readFileSync(ff, 'utf8'), m = /Finalisten:\s*([^\n]+)/.exec(text);
  if (!m || !/Bestätigung der Steuerung/.test(text)) throw Error('HOLDOUT_CONFIRMATION_INVALID');
  const finalists = m[1].split(',').map(x => x.trim()).filter(Boolean);
  const passed = t.doc.candidates.filter(c => c.testBeatsSpy || c.testLowLoss).map(c => c.id);
  if (!finalists.length || finalists.length > Pr.MAX_FINALISTS || finalists.some(f => !passed.includes(f))) throw Error('FINALISTS_INVALID');
  if (readJson('holdout-public.json')) throw Error('HOLDOUT_ALREADY_RUN');
  const ctx = context(a), byId = new Map(Pr.variants().map(v => [v.id, v])), out = [];
  for (const id of finalists) { const r = runOne(byId.get(id), ctx, 'holdout'); out.push({ id, result: r }); console.log(JSON.stringify({ id, state: r.state })); }
  const plain = sealTo('holdout.sealed.json', { schemaVersion: VERSION, phase: 'holdout', protocolSha256: Pr.PROTOCOL_SHA256, window: Pr.WINDOWS.holdout, data: ctx.data, finalists: out }, a);
  writeJson('holdout-public.json', { schemaVersion: VERSION, phase: 'holdout', label: 'Forschung, nicht zertifiziert', protocolSha256: Pr.PROTOCOL_SHA256, holdoutPlaintextSha256: plain,
    finalists: out.map(x => ({ id: x.id, state: x.result.state, holdoutBeatsSpy: x.result.state === 'RUN' ? x.result.evaluation.strategy.totalReturn > x.result.evaluation.SPY.totalReturn : null })) });
}

function phaseOpen(a) {
  if (!a.privateKey || !a.in || !a.out) throw Error('--private-key, --in, --out');
  if (path.resolve(a.out).startsWith(ROOT)) throw Error('OUT_INSIDE_REPOSITORY');
  fs.writeFileSync(a.out, Seal.open(JSON.parse(fs.readFileSync(a.in, 'utf8')), fs.readFileSync(a.privateKey, 'utf8')));
}

if (require.main === module) {
  const a = args(process.argv);
  if (a.outDir) OUT = path.resolve(a.outDir); // Tests: eigener Ordner statt docs/research/labor/runs
  const fn = { dev: phaseDev, test: phaseTest, holdout: phaseHoldout, open: phaseOpen }[a.phase];
  if (!fn) throw Error('PHASE ' + a.phase);
  fn(a);
}
module.exports = { insiderCovered, blockedReason, runOne, VERSION };
