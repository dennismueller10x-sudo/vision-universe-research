#!/usr/bin/env node
'use strict';
// EDGE2-PAPER: die nach docs/research/edge2/PROTOKOLL.json ausgewählte Teil-1-Variante unverändert vorwärts (Papierdepot,
// kein echtes Geld, keine Orders). Forschung, nicht zertifiziert. Läuft wöchentlich in research-edge2-paper.yml.
// Jeder Lauf rechnet die Regel ab dem Startstichtag neu (deterministisch) und hängt an das hash-verkettete Ledger
// docs/research/edge2/paper/ledger.jsonl an: neue Entscheidungen und eine Wochenzeile mit Bestand. Weicht eine schon
// aufgezeichnete Entscheidung von der Neurechnung ab (Datenrevision), bleibt die Aufzeichnung gültig und die Abweichung wird vermerkt.
//
//   node scripts/research/edge2/paper.cjs --work-dir D --fundamentals D [--today YYYY-MM-DD] [--ledger FILE]
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../..');
const E2 = require('./edge2.cjs');
const Q = require('../edge/quant-e3.cjs');
const K = require('./ledger-chain.cjs');
const RUN = require('./run-edge2.cjs');
const PIN = require('./protocol-pin.cjs');
const CONFIG = path.join(ROOT, 'docs/research/edge2/paper/CONFIG.json');
const LEDGER = path.join(ROOT, 'docs/research/edge2/paper/ledger.jsonl');
const VERSION = 'edge2-paper-1.0.0';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const r6 = x => Math.round(x * 1e6) / 1e6;

function args(argv) { const a = {}; for (let i = 2; i < argv.length; i++) { a[argv[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[i + 1]; i++; } return a; }

/** Hängt neue Entscheidungen und eine Wochenzeile an; reine Funktion über die Ledgerzeilen (testbar). */
function entriesFor(rows, run, { week, ticker = id => id.replace(/^ref_/, '') }) {
  const recorded = new Map(rows.filter(r => r.type === 'DECISION').map(r => [r.decisionDate, r]));
  const out = [], divergent = [];
  let prev = new Set();
  for (const tg of run.targets) {
    const ids = Object.keys(tg.weights).sort(), weights = Object.fromEntries(ids.map(id => [ticker(id), r6(tg.weights[id])]));
    const buys = ids.filter(id => !prev.has(id)).map(ticker), sells = [...prev].filter(id => !tg.weights[id]).map(ticker);
    prev = new Set(ids);
    const old = recorded.get(tg.decisionDate);
    if (old) { if (JSON.stringify(old.holdings) !== JSON.stringify(Object.keys(weights))) divergent.push(tg.decisionDate); continue; }
    out.push({ type: 'DECISION', decisionDate: tg.decisionDate, execution: 'Schluss der Folgewoche', holdings: Object.keys(weights), weights, buys, sells });
  }
  out.push({ type: 'WEEK', week, holdings: run.holdings.map(ticker), replayDivergentDecisions: divergent });
  return out;
}

function main() {
  const a = args(process.argv), cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  if (cfg.protocolSha256 !== PIN.PROTOCOL_SHA256) throw Error('PROTOCOL_PIN_MISMATCH');
  const proto = JSON.parse(fs.readFileSync(path.join(ROOT, PIN.PROTOCOL_FILE), 'utf8'));
  const v = proto.variants.find(x => x.id === cfg.variant);
  if (!v || v.part !== 'teil1') throw Error('PAPER_VARIANT_INVALID ' + cfg.variant);
  const MP = require(path.join(ROOT, 'scripts/quant/portfolio/model-portfolios.cjs')), MD = require(path.join(ROOT, 'scripts/quant/portfolio/model-depots.cjs'));
  const today = a.today || new Date().toISOString().slice(0, 10), bench = MD.weeklySpy(today), last = bench.points.at(-1)[0];
  if (last < cfg.start) { console.log(JSON.stringify({ state: 'NOT_STARTED', start: cfg.start, last })); return; }
  const panel = MP.buildPanel({ workDir: a.workDir, fundamentals: a.fundamentals, window: [bench.points[0][0], last], benchmark: bench, limit: Number(a.limit || 0) });
  // Ausführung der letzten Entscheidung: Schluss der Folgewoche (Platzhalterwoche, Kurs = letzter Schluss nur für die Gewichtsbemessung).
  const T = panel.calendar.length;
  panel.calendar = panel.calendar.concat(['9999-12-31']);
  panel.benchmark = { ...panel.benchmark, levels: panel.benchmark.levels.concat([panel.benchmark.levels[T - 1]]) };
  for (const s of panel.securities) { s.adj = Float64Array.from([...s.adj, s.adj[T - 1]]); s.raw = Float64Array.from([...s.raw, s.raw[T - 1]]); if (s.dv) s.dv = Float64Array.from([...s.dv, s.dv[T - 1]]); }
  const anchorDate = panel.calendar.find(d => d >= cfg.start);
  return import(path.join(ROOT, 'scripts/research/signals/study.mjs')).then(S1 => {
    const oracle = RUN.createZoneOracle({ calendar: panel.calendar, barsDir: path.join(a.workDir, 'tiingo/daily'), detect: S1.detect, Trade: require(path.join(ROOT, 'quant/engines/technical/trade-setup.js')) });
    const run = E2.runTeil1(panel, Q.createSelector(panel), v, { window: [anchorDate, panel.calendar[T]], anchorDate, zoneAt: oracle.zoneAt, decisionsOnly: true });
    const file = a.ledger ? path.resolve(a.ledger) : LEDGER;
    const rows = K.ledger(file);
    if (rows.some(r => r.type === 'WEEK' && r.week === last)) { console.log(JSON.stringify({ state: 'ALREADY_RECORDED', week: last })); return; }
    const meta = { variant: v.id, protocolSha256: PIN.PROTOCOL_SHA256, code: VERSION, adapter: E2.VERSION, commit: process.env.GITHUB_SHA || null };
    for (const e of entriesFor(rows, run, { week: last })) K.append({ ...e, ...meta }, file, cfg.id);
    console.log(JSON.stringify({ state: 'RECORDED', week: last, holdings: run.holdings.length, zones: oracle.counts.analyses }));
  });
}
if (require.main === module) Promise.resolve().then(main).catch(e => { console.error(String(e && e.stack || e)); process.exit(1); });
module.exports = { VERSION, entriesFor };
