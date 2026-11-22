#!/usr/bin/env node
/**
 * Backtest 2.0 – Lauf: offene Suche mit Walk-forward-Bestätigung. Forschung, nicht zertifiziert.
 * Protokoll: docs/research/backtest2/PROTOKOLL.md. Schreibt nur nach --out (Ergebnis zuerst nur an den Owner, Workflow-Artefakt).
 *
 *   node --max-old-space-size=12288 scripts/research/backtest2/run.mjs --work-dir D [--delisted-dir D --delisted-raw-dir D]
 *        --out DIR [--workers 4] [--smoke]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { loadMarket, loadBenchmarks, lastCompleteMonthEnd } from './data.mjs';
import { buildSignals, SOURCES } from './signals.mjs';
import { share } from './market.mjs';
import { simulate, ENGINE_VERSION, INITIAL } from './engine.mjs';
import * as Q from './search.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
export const SMOKE_GRID = Object.freeze({ ...Q.GRID, positions: [5, 10], sizing: [Q.GRID.sizing[0]], exit: [Q.GRID.exit[2], Q.GRID.exit[8]], filter: ['NONE', 'SMA200'], universe: [Q.GRID.universe[2]] });

function args(argv) {
  const a = { workers: Math.max(1, os.cpus().length - 0) };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--smoke') { a.smoke = true; continue; }
    if (k === '--survivors-only') { a.survivorsOnly = true; continue; }
    if (!k.startsWith('--')) throw new Error('ARG ' + k);
    a[k.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i];
  }
  if (!a.workDir || !a.out) throw new Error('--work-dir und --out sind Pflicht');
  return a;
}

/** Rechnet Jahreskennzahlen aller Kombinationen parallel. */
export async function runGrid(market, signals, combos, { t0, t1, nYears, workers, log = console.log }) {
  const out = new Float64Array(new SharedArrayBuffer(combos.length * nYears * Q.YEAR_FIELDS * 8)).fill(NaN);
  const shared = share(market), sig = Object.fromEntries(Object.entries(signals).map(([k, v]) => [k, { offsets: v.offsets.buffer, items: v.items.buffer }]));
  const chunks = Array.from({ length: workers }, (_, w) => combos.filter((c) => c.id % workers === w));
  let done = 0, lastLog = Date.now();
  await Promise.all(chunks.map((chunk) => new Promise((resolve, reject) => {
    const wk = new Worker(new URL('./worker.mjs', import.meta.url), { workerData: { market: shared, signals: sig, out: out.buffer, combos: chunk, t0, t1, nYears, fields: Q.YEAR_FIELDS } });
    wk.on('message', (msg) => { if (msg.done) { done++; if (Date.now() - lastLog > 30000) { lastLog = Date.now(); log(`Kombinationen: ${done} / ${combos.length}`); } } if (msg.finished) resolve(); });
    wk.on('error', reject); wk.on('exit', (code) => { if (code) reject(new Error('WORKER_EXIT ' + code)); });
  })));
  return out;
}

function fullPeriod(stats, k, nYears, w) {
  let s = 0, s2 = 0, n = 0, e = NaN, dd = NaN;
  for (let y = 0; y < nYears; y++) { const b = (k * nYears + y) * Q.YEAR_FIELDS; if (!(stats[b + 2] > 0)) continue; s += stats[b]; s2 += stats[b + 1]; n += stats[b + 2]; e = stats[b + 3]; dd = stats[b + 4]; }
  const mu = s / n, sd = Math.sqrt(Math.max(0, s2 / n - mu * mu));
  return { cagr: Q.cagr(INITIAL, e, w.start, w.end), maxDrawdown: dd, sharpeDaily: sd > 0 ? mu / sd : 0, sharpe: sd > 0 ? (mu / sd) * Math.sqrt(252) : 0, n };
}
const median = (xs) => { const a = xs.filter(Number.isFinite).sort((x, y) => x - y); return a.length ? (a.length % 2 ? a[a.length >> 1] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : null; };
const pct = (x) => (x == null || !Number.isFinite(x) ? '–' : (x * 100).toFixed(1).replace('.', ',') + ' %');

/** Walk-forward: Auswahl je Runde, Bestätigungskurve, Benchmarks, Phasen, Urteil. */
export function walkForward(m, signals, combos, stats, nYears, bench, end, select = (r) => Q.selectRound(stats, combos.length, nYears, r, m, bench.SPY)) {
  const rounds = [], chainDates = [], chainEq = [], weekly = { SPY: [], QQQ: [], RSP: [] }, regime = [];
  let level = 1;
  const full = Q.windowDates(m, Q.FIRST_YEAR, 9999);
  for (const r of Q.ROUNDS) {
    const sel = select(r);
    const w = Q.windowDates(m, r.confirm[0], r.confirm[1]);
    if (sel.combo < 0 || w.t0 < 0 || w.t1 < w.t0) { rounds.push({ ...r, selected: null }); continue; }
    const c = combos[sel.combo], res = simulate(m, signals[c.source], c, { t0: full.t0, t1: full.t1, daily: true });
    const eq = res.daily, off = full.t0, seg = [], segDates = [];
    for (let t = w.t0; t <= w.t1; t++) {
      const prev = eq[t - 1 - off] ?? INITIAL; level *= eq[t - off] / prev;
      chainDates.push(m.dates[t]); chainEq.push(level); seg.push(eq[t - off]); segDates.push(m.dates[t]);
      regime.push([m.spyOn200[t - 1] === 1, Math.log(eq[t - off] / prev), Math.log(m.spyClose[t] / m.spyClose[t - 1])]);
    }
    const segM = Q.curveMetrics([eq[w.t0 - 1 - off] ?? INITIAL, ...seg], [m.dates[w.t0 - 1], ...segDates]);
    const benchW = Object.fromEntries(Object.entries(bench).map(([s, pts]) => [s, Q.cagr(Q.valueAt(pts, w.start), Q.valueAt(pts, w.end), w.start, w.end)]));
    for (const s of Object.keys(weekly)) weekly[s].push(...Q.weeklyReturns([eq[w.t0 - 1 - off] ?? INITIAL, ...seg], [m.dates[w.t0 - 1], ...segDates], bench[s]));
    rounds.push({ ...r, confirm: [r.confirm[0], Math.min(r.confirm[1], +end.slice(0, 4))], selected: { id: c.id, label: Q.label(c), params: c }, learnExcessCagr: sel.learnExcess, neighborhoodMedian: sel.neighborhoodMedian ?? null, spyLearnCagr: sel.spyLearnCagr, confirmMetrics: segM, benchmarksConfirmCagr: benchW });
  }
  if (!chainEq.length) return { rounds, chain: null, verdict: 'nicht bestimmbar' };
  const chain = Q.curveMetrics([1, ...chainEq], [Q.windowDates(m, Q.ROUNDS[0].confirm[0], 9999).start, ...chainDates]);
  const bm = {};
  for (const s of Object.keys(weekly)) {
    const lr = weekly[s].map((x) => x[1]), sumB = lr.reduce((a, b) => a + b, 0), yrs = (Date.parse(chain.to) - Date.parse(chain.from)) / (365.25 * 864e5);
    let lv = 1, pk = 1, dd = 0; for (const x of lr) { lv *= Math.exp(x); pk = Math.max(pk, lv); dd = Math.min(dd, lv / pk - 1); }
    const mu = sumB / lr.length, sd = Math.sqrt(lr.reduce((a, b) => a + (b - mu) ** 2, 0) / lr.length);
    const ex = weekly[s].map(([a, b]) => a - b);
    bm[s] = { cagr: Math.exp(sumB / yrs) - 1, maxDrawdown: dd, sharpe: sd > 0 ? (mu / sd) * Math.sqrt(52) : 0, excessCagr: chain.cagr - (Math.exp(sumB / yrs) - 1), pExcess: Q.bootstrapP(ex) };
  }
  const phases = {};
  for (const [key, on] of [['SPY über SMA200', true], ['SPY unter SMA200', false]]) {
    const rows = regime.filter((x) => x[0] === on), ex = rows.map((x) => x[1] - x[2]);
    const sumS = rows.reduce((a, x) => a + x[1], 0), sumB = rows.reduce((a, x) => a + x[2], 0);
    phases[key] = { days: rows.length, strategyAnnual: rows.length ? Math.exp(sumS / rows.length * 252) - 1 : null, spyPriceAnnual: rows.length ? Math.exp(sumB / rows.length * 252) - 1 : null, pExcess: Q.bootstrapP(ex) };
  }
  const spy = bm.SPY;
  let verdict = 'schlägt nicht';
  if (spy.excessCagr > 0 && spy.pExcess !== null && spy.pExcess <= 0.05) verdict = 'schlägt den Index';
  else if (Object.values(phases).some((p) => p.strategyAnnual > p.spyPriceAnnual && p.pExcess !== null && p.pExcess <= 0.05)) verdict = 'schlägt nur in Phasen';
  else if (chain.sharpe > spy.sharpe && chain.maxDrawdown > spy.maxDrawdown) verdict = 'nur risikobereinigt';
  return { rounds, chain, benchmarks: bm, phases, verdict };
}

export function summarize(m, signals, combos, stats, nYears, bench) {
  const w = Q.windowDates(m, Q.FIRST_YEAR, 9999);
  const spyFull = Q.cagr(Q.valueAt(bench.SPY, w.start), Q.valueAt(bench.SPY, w.end), w.start, w.end);
  const rows = combos.map((c, k) => ({ c, ...fullPeriod(stats, k, nYears, w) })).map((r) => ({ ...r, excess: r.cagr - spyFull }));
  const ranked = rows.filter((r) => Number.isFinite(r.excess)).sort((a, b) => b.excess - a.excess || a.c.id - b.c.id);
  const top = ranked.slice(0, 20).map((r) => ({ id: r.c.id, label: Q.label(r.c), cagr: r.cagr, excessCagr: r.excess, maxDrawdown: r.maxDrawdown, sharpe: r.sharpe }));
  const knobs = {};
  const keyOf = { source: (c) => c.source, positions: (c) => String(c.positions), sizing: (c) => c.sizing === 'EQUAL' ? 'gleich' : 'Risiko ' + Math.round(c.cap * 100) + ' %', exit: (c) => Q.exitLabel(c.exit), filter: (c) => c.filter, universe: (c) => `Top ${c.uniTop}, ≥ ${c.minPrice} $` };
  for (const [k, f] of Object.entries(keyOf)) {
    const g = new Map(); for (const r of rows) { const v = f(r.c); if (!g.has(v)) g.set(v, []); g.get(v).push(r); }
    knobs[k] = [...g].map(([v, rs]) => ({ value: v, medianExcessCagr: median(rs.map((r) => r.excess)), shareBeatingSpy: rs.filter((r) => r.excess > 0).length / rs.length, medianMaxDrawdown: median(rs.map((r) => r.maxDrawdown)) }));
  }
  const best = ranked[0];
  let dsr = null;
  if (best) {
    const res = simulate(m, signals[best.c.source], best.c, { t0: w.t0, t1: w.t1, daily: true }), eq = res.daily, lr = [];
    for (let k = 1; k < eq.length; k++) lr.push(Math.log(eq[k] / eq[k - 1]));
    const mu = lr.reduce((a, b) => a + b, 0) / lr.length, sd = Math.sqrt(lr.reduce((a, b) => a + (b - mu) ** 2, 0) / lr.length);
    const skew = lr.reduce((a, b) => a + ((b - mu) / sd) ** 3, 0) / lr.length, kurt = lr.reduce((a, b) => a + ((b - mu) / sd) ** 4, 0) / lr.length;
    const bestBySharpe = rows.reduce((a, b) => (b.sharpeDaily > a.sharpeDaily ? b : a));
    dsr = { combo: bestBySharpe.c.id, label: Q.label(bestBySharpe.c), sharpe: bestBySharpe.sharpe, ...Q.deflatedSharpe(bestBySharpe.sharpeDaily, rows.map((r) => r.sharpeDaily).filter(Number.isFinite), bestBySharpe.n, skew, kurt), note: 'Schiefe/Wölbung aus der Kombination mit der höchsten Überrendite' };
  }
  return { spyFullCagr: spyFull, window: [w.start, w.end], beatingSpy: ranked.filter((r) => r.excess > 0).length, top, knobs, deflatedSharpe: dsr };
}

export function report(res) {
  const L = [];
  L.push('# Backtest 2.0 – Ergebnis' + (res.smoke ? ' (RAUCHTEST, kein Ergebnis)' : ''), '', '**Forschung, nicht zertifiziert.** Nur für den Owner. Protokoll-SHA-256 `' + res.protocolSha256 + '`.', '');
  L.push(`Daten: ${res.data.loaded} Titel (davon delistet ${res.data.delisted - res.data.delistedNoRaw}), ${res.window[0]} bis ${res.window[1]}. Kombinationen geprüft: ${res.combos}.`, '');
  if (res.survivorsOnly) L.push('**Nur heutige Überlebende (ohne delistete Titel): zu gut gerechnet, nur zum Vergleich, nicht für das Urteil.**', '');
  if (res.diagnostics) L.push('## Datenprüfung', '', '| Gruppe | Titel | mit Sprung ×2 bis ×5 | Sprünge auf | Sprünge ab |', '|---|---|---|---|---|',
    ...Object.entries(res.diagnostics.jumps2to5).map(([g, d]) => `| ${g} | ${d.titles} | ${d.titlesWithJump} (${pct(d.titlesWithJump / d.titles)}) | ${d.jumpsUp} | ${d.jumpsDown} |`), '',
    'Spalten der delisteten Rohreihen (Anzahl Titel): ' + (Object.entries(res.diagnostics.delistedColumns).map(([k, n]) => '`' + k + '` ' + n).join(' · ') || '–'), '');
  const sections = [['Auswahl Fassung 2 (vorab festgelegt): beste Lern-Überrendite', res.walkForward], ['Auswahl Fassung 3 (zweiter Versuch nach Einsicht in Lauf 44918416065): robust, mind. 10 Positionen, Median mit Nachbarn', res.walkForwardRobust]];
  for (const [title, wf] of sections) { if (!wf) continue;
  L.push('## ' + title, '', `Urteil: **${wf.verdict}**`, '');
  if (wf.chain) {
    L.push('### Bestätigungskurve (nur ungesehene Jahre, so hätte ein Kunde das Vorgehen erlebt)', '', '| | CAGR | max. Verlust | Sharpe | Überrendite | p |', '|---|---|---|---|---|---|');
    L.push(`| Strategie | ${pct(wf.chain.cagr)} | ${pct(wf.chain.maxDrawdown)} | ${wf.chain.sharpe.toFixed(2)} | | |`);
    for (const [s, b] of Object.entries(wf.benchmarks)) L.push(`| ${s} | ${pct(b.cagr)} | ${pct(b.maxDrawdown)} | ${b.sharpe.toFixed(2)} | ${pct(b.excessCagr)} | ${b.pExcess?.toFixed(4) ?? '–'} |`);
    L.push('', '### Runden', '', '| Lernen | Bestätigen | gewählt | Lern-Überrendite | Bestätigung CAGR | SPY | QQQ | max. Verlust |', '|---|---|---|---|---|---|---|---|');
    for (const r of wf.rounds) L.push(`| ${r.learn.join('–')} | ${r.confirm.join('–')} | ${r.selected?.label ?? '–'} | ${pct(r.learnExcessCagr)}${r.neighborhoodMedian != null ? ' (Nachbarn ' + pct(r.neighborhoodMedian) + ')' : ''} | ${pct(r.confirmMetrics?.cagr)} | ${pct(r.benchmarksConfirmCagr?.SPY)} | ${pct(r.benchmarksConfirmCagr?.QQQ)} | ${pct(r.confirmMetrics?.maxDrawdown)} |`);
    L.push('', '### Marktphasen (Bestätigungskurve; SPY als Kursreihe ohne Dividenden)', '', '| Phase | Tage | Strategie p. a. | SPY p. a. | p |', '|---|---|---|---|---|');
    for (const [k, p] of Object.entries(wf.phases)) L.push(`| ${k} | ${p.days} | ${pct(p.strategyAnnual)} | ${pct(p.spyPriceAnnual)} | ${p.pExcess?.toFixed(4) ?? '–'} |`);
  }
  L.push(''); }
  const s = res.summary;
  L.push('', `## Gesamtzeitraum, beschreibend (Rückschau, kein Nachweis)`, '', `SPY ${pct(s.spyFullCagr)} p. a.; ${s.beatingSpy} von ${res.combos} Kombinationen lagen roh darüber.`, '');
  L.push('| # | Kombination | CAGR | Überrendite | max. Verlust | Sharpe |', '|---|---|---|---|---|---|');
  s.top.forEach((r, i) => L.push(`| ${i + 1} | ${r.label} | ${pct(r.cagr)} | ${pct(r.excessCagr)} | ${pct(r.maxDrawdown)} | ${r.sharpe.toFixed(2)} |`));
  if (s.deflatedSharpe) L.push('', `Deflated Sharpe der besten Kombination nach Sharpe (${s.deflatedSharpe.label}): ${s.deflatedSharpe.dsr.toFixed(3)} (≥ 0,95 wäre belastbar nach ${res.combos} Versuchen).`);
  L.push('', '## Welche Stellschraube macht wie viel aus (Median der Überrendite, Gesamtzeitraum)', '');
  for (const [k, vs] of Object.entries(s.knobs)) { L.push(`**${k}:** ` + vs.map((v) => `${v.value} ${pct(v.medianExcessCagr)} (${Math.round(v.shareBeatingSpy * 100)} % über SPY)`).join(' · '), ''); }
  L.push('## Grenzen', '', '- Signalquellen Stufe 1 nur aus Kursen (Marktführer, Trendvorlage, Ausbrüche); die zertifizierten Supertrader-Module und die Quant-Profile folgen in Stufe 2.', '- Population: heutige Kursdateien plus qualifizierte delistete V13-Ketten; keine historische Indexmitgliedschaft. Alle Jahre ab 2008 waren in früheren Studien schon geöffnet.', '- Stopps auf Tagesbalken: nachgezogener Stopp auf Schlussbasis-Hoch, Ausführung zu min(Eröffnung, Stopp).');
  return L.join('\n') + '\n';
}

async function main() {
  const a = args(process.argv), t = Date.now();
  const cal = JSON.parse(fs.readFileSync(path.join(ROOT, 'quant/data/market/multi-asset/series/SPY.json'), 'utf8')).points.map((p) => p[0]);
  const bench = loadBenchmarks();
  // Ende: letzter vollständiger Monat, höchstens bis zum letzten gemeinsamen Benchmark-Stichtag (sonst vergleicht die letzte
  // Bestätigungsrunde Strategie-Wochen mit fehlenden Index-Wochen)
  const benchEnd = Object.values(bench).map((p) => p.at(-1)[0]).sort()[0];
  const end = a.to || [lastCompleteMonthEnd(cal.filter((d) => d >= '2007-01-01')), cal.findLast((d) => d <= benchEnd)].sort()[0];
  const { market: m, counts, diagnostics } = loadMarket({ workDir: a.workDir, delistedDir: a.survivorsOnly ? null : a.delistedDir, delistedRawDir: a.delistedRawDir, to: end, limit: a.smoke ? 400 : 0 });
  const signals = buildSignals(m);
  const grid = a.smoke ? SMOKE_GRID : Q.GRID, list = Q.combos(grid);
  const w = Q.windowDates(m, Q.FIRST_YEAR, 9999), nYears = +end.slice(0, 4) - Q.FIRST_YEAR + 1;
  console.log(`Signale: ${SOURCES.map((k) => k + ' ' + signals[k].items.length).join(', ')}; Kombinationen ${list.length}; Fenster ${w.start} … ${w.end}`);
  const stats = await runGrid(m, signals, list, { t0: w.t0, t1: w.t1, nYears, workers: +a.workers });
  const wf = walkForward(m, signals, list, stats, nYears, bench, end);
  const nbrs = Q.neighbors(list, grid);
  const wfRobust = walkForward(m, signals, list, stats, nYears, bench, end, (r) => Q.selectRoundRobust(stats, list, nbrs, nYears, r, m, bench.SPY));
  const summary = summarize(m, signals, list, stats, nYears, bench);
  const res = {
    schema: 'backtest2-result-1.0.0', label: 'Forschung, nicht zertifiziert', smoke: !!a.smoke, versions: { engine: ENGINE_VERSION, search: Q.SEARCH_VERSION },
    protocolSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'docs/research/backtest2/PROTOKOLL.md'))).digest('hex'),
    survivorsOnly: !!a.survivorsOnly, data: counts, diagnostics, window: [w.start, w.end], combos: list.length, grid, walkForward: wf, walkForwardRobust: wfRobust, summary, runtimeSeconds: Math.round((Date.now() - t) / 1000),
  };
  fs.mkdirSync(a.out, { recursive: true });
  fs.writeFileSync(path.join(a.out, 'results.json'), JSON.stringify(res, null, 1));
  fs.writeFileSync(path.join(a.out, 'BERICHT.md'), report(res));
  console.log(report(res));
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
