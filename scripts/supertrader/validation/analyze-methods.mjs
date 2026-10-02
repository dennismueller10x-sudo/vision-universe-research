#!/usr/bin/env node
// Supertrader — interner Datentest, Teil 2: Momentum Breakout, Weinstein,
// Darvas und Minervini auf demselben Point-in-Time-Universum wie der
// Donchian-Lauf (PREREGISTRATION-METHODS.json, vor dem Lauf eingefroren).
//
//   node scripts/supertrader/validation/analyze-methods.mjs [--limit 400]
//
// Ablauf:
//   1. Listentabelle, Manifest und Reihen laden (privater Eimer), Reihenbruch A2.
//   2. Querschnitt: Momentum-/RS-Perzentile je Handelstag ueber alle damals
//      gelisteten Titel (Point-in-Time, inklusive spaeter delisteter Titel).
//   3. Je Reihe: Wochenreihe (Weinstein), Engine-Simulation je Methode
//      (unveraenderte Regeln, Rohkursgrenze), Trades mit Delisting-Abschluss.
//   4. Portfolio S0/S1/S2, doppelte Kosten, Zufallsreihenfolgen, nur heute
//      gelistete Titel; Kontrollen C1/C2/C3m/C5; Diagnose aller Engine-Trades.
// Ausgabe nur verschluesselt; Logs nur Fortschrittszahlen.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as L from './lib.mjs';
import { runPortfolioTR, reconcile, cagrBetween, maxDrawdown } from './portfolio.mjs';
import { computeIndicators, isoWeekKey } from '../engine/indicators.mjs';
import { simulate } from '../engine/simulator.mjs';
import { runPortfolio, computeMetrics, PORTFOLIO_DEFAULTS } from '../engine/backtest.mjs';
import { DEFAULT_EXECUTION } from '../engine/execution.mjs';
import kk from '../engine/strategies/kk-breakout.mjs';
import weinstein from '../engine/strategies/weinstein.mjs';
import darvas from '../engine/strategies/darvas.mjs';
import minervini from '../engine/strategies/minervini.mjs';
import { buildWeekly } from '../engine/weekly.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const Store = require(path.join(root, 'quant/engines/history-store.js'));
const Guard = require(path.join(root, 'quant/engines/zero-cost-guard.js'));
const Master = require(path.join(root, 'quant/engines/us-security-master.js'));

export const PREREG_METHODS = 'supertrader-validation-prereg-methods-1.0.0';
export const ENGINES = [kk, weinstein, darvas, minervini];
const W = L.WINDOW;
const EXEC2 = { ...DEFAULT_EXECUTION, slippageBps: 20, commissionBps: 2 };
const SPLIT_PERIODS = [['2016-01-04', '2020-12-31'], ['2021-01-01', W.to]];
const PHASES = [['Q4_2018', '2018-09-20', '2018-12-24'], ['COVID_2020', '2020-02-19', '2020-03-23'], ['BEAR_2022', '2022-01-03', '2022-10-12'], ['BULL_2023_2024', '2023-01-03', '2024-12-31']];
const CROSS_KEYS = ['mom21', 'mom63', 'mom126', 'rs'];

// Rohkursgrenze (wie PREREGISTRATION strategy.harnessAdapter), fuer Wochen-
// strategien korrekt: an Tagen ohne Wochenentscheidung (undefined) wird nicht
// eingegriffen, sonst gaelte ein wartendes Setup als verloren.
export function rawGate(base) {
  return {
    ...base,
    scan(ctx, t, p, o) {
      const r = base.scan(ctx, t, { ...(p || base.PARAMS), minPrice: 0 }, o);
      if (r === undefined) return r;
      const rc = ctx.raw.close[t];
      if (!(Number.isFinite(rc) && rc >= base.PARAMS.minPrice)) return null;
      return r;
    },
  };
}

// Percentile mit Mittelrang bei Gleichstand - identisch zu indicators.percentileRanks.
export function percentilesInPlace(values, ids, out) {
  const n = values.length;
  if (n < 2) { for (let k = 0; k < n; k++) out(ids[k], null); return; }
  const order = Array.from({ length: n }, (_, k) => k).sort((a, b) => values[a] - values[b]);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && values[order[j + 1]] === values[order[i]]) j++;
    const rank = ((i + j) / 2) / (n - 1) * 100;
    for (let k = i; k <= j; k++) out(ids[order[k]], rank);
    i = j + 1;
  }
}

export function segCtx(seg, bench) {
  const a = L.adjustSeries(seg.raw);
  const bars = { date: a.date, open: a.open, high: a.high, low: a.low, close: a.close, volume: a.volume };
  const ctx = { symbol: seg.id, bars, ind: computeIndicators(bars), raw: { close: a.rawClose, volume: a.rawVolume }, divAdj: a.divAdj, tr: a.tr, regime: null, cross: seg.cross || {} };
  if (bench) Object.assign(ctx, buildWeekly({ bars }, null, bench));
  return ctx;
}

// Trades einer Reihe fuer eine Methode (Engine unveraendert) + Abschluss offener Positionen.
export function tradesFor(engine, seg, ctx, exec, sink = null) {
  const d = ctx.bars.date;
  const from = d.findIndex((x) => x >= W.from);
  if (from < 0) return [];
  const res = simulate(rawGate(engine), ctx, { from, exec, params: { ...engine.PARAMS, minPrice: 0 } });
  const out = [];
  const mk = (s, terminal) => {
    const ei = s.entry.index, lastIdx = terminal ? d.length - 1 : s.exits[s.exits.length - 1].index;
    const marks = new Map(), divs = new Map();
    for (let i = ei; i <= lastIdx; i++) { marks.set(d[i], ctx.bars.close[i]); if (ctx.divAdj[i] > 0) divs.set(d[i], ctx.divAdj[i]); }
    const ci = s.confirmation?.index;
    return {
      id: s.id, listingId: seg.id, entry: { date: s.entry.date, price: s.entry.price, rawOpen: s.entry.rawOpen }, initialStop: s.initialStop,
      exits: s.exits.map((x) => ({ date: x.date, price: x.price, fraction: x.fraction, ruleId: x.ruleId, basis: x.priceBasis })),
      confirmDate: s.confirmation?.date || null, rawCloseAtConfirm: ci != null ? ctx.raw.close[ci] : null, qualityFailed: s.quality?.failed || null,
      trigger: s.levels?.trigger ?? null, confirmClose: s.confirmation?.close ?? null, rawOpenEntry: s.entry.rawOpen ?? null,
      terminal, marks, divs, heldSessions: lastIdx - ei, survivor: seg.survivor,
    };
  };
  if (sink) for (const s of res.finished) if (!s.entry) sink(s);
  for (const s of res.finished) if (s.entry && s.exits.length && s.entry.date <= W.to) out.push(mk(s, null));
  const s = res.state.signal;
  if (s && s.entry && (s.remaining ?? 1) > 1e-9) {
    const last = d.length - 1;
    const t = { date: d[last], lastClose: ctx.bars.close[last], distress: L.distressSignature(ctx.raw.close), kind: seg.delisted ? 'DELISTED' : 'OPEN_AT_END' };
    const tr = mk(s, t);
    tr.remainingAtTerminal = s.remaining ?? 1;
    if (!seg.delisted) tr.exits.push({ date: d[last], price: ctx.bars.close[last], fraction: s.remaining ?? 1, ruleId: 'OPEN_AT_END_MARK', basis: 'CLOSE' });
    out.push(tr);
  }
  return out;
}

// C3m: Plausibilitaet eines Trades gegen die (bereinigten) Rohbalken.
export function verifyGeneric(t, ctx, engine, exec = DEFAULT_EXECUTION) {
  const d = ctx.bars.date, slip = exec.slippageBps / 10000, eps = 1e-6;
  const i = d.indexOf(t.entry.date), c = t.confirmDate ? d.indexOf(t.confirmDate) : -1;
  const checks = {
    entryAfterConfirm: c >= 0 && i === c + 1,
    entryPrice: i >= 0 && Math.abs(ctx.bars.open[i] * (1 + slip) / t.entry.price - 1) < eps,
    rawGate: c >= 0 && ctx.raw.close[c] >= engine.PARAMS.minPrice,
    stopBelowEntry: t.initialStop < t.entry.price,
  };
  checks.exits = t.exits.filter((x) => x.ruleId !== 'OPEN_AT_END_MARK').every((x) => {
    const k = d.indexOf(x.date);
    if (k < 0) return false;
    if (x.basis === 'NEXT_OPEN' || x.basis === 'OPEN_BELOW_STOP') return Math.abs(ctx.bars.open[k] * (1 - slip) / x.price - 1) < eps;
    return x.price <= ctx.bars.high[k] * (1 - slip) * (1 + eps) && x.price >= ctx.bars.low[k] * (1 - slip) * (1 - eps);
  });
  return { id: t.id, ok: Object.values(checks).every(Boolean), checks };
}

const slip0 = DEFAULT_EXECUTION.slippageBps / 10000, comm0 = DEFAULT_EXECUTION.commissionBps / 10000;
export function tradeRet(t) {
  let proceeds = 0, frac = 0;
  for (const x of t.exits) { proceeds += x.fraction * x.price; frac += x.fraction; }
  if (t.terminal?.kind === 'DELISTED') { const r = t.remainingAtTerminal ?? 1 - frac; proceeds += r * t.terminal.lastClose * (1 - slip0); frac += r; }
  return frac > 0 ? (proceeds / frac) * (1 - comm0) / (t.entry.price * (1 + comm0)) - 1 : null;
}
function diag(list) {
  const r = list.map(tradeRet).filter(Number.isFinite).sort((a, b) => a - b);
  const byYear = {}, byExit = {};
  for (const t of list) {
    const v = tradeRet(t); if (!Number.isFinite(v)) continue;
    const y = t.entry.date.slice(0, 4); const b = byYear[y] ||= { n: 0, sum: 0, wins: 0 }; b.n++; b.sum += v; if (v > 0) b.wins++;
    const k = t.terminal ? t.terminal.kind : t.exits[t.exits.length - 1].ruleId; const e = byExit[k] ||= { n: 0, sum: 0 }; e.n++; e.sum += v;
  }
  return { n: r.length, mean: r.reduce((a, b) => a + b, 0) / (r.length || 1), median: r[Math.floor(r.length / 2)] ?? null, hitRate: r.filter((x) => x > 0).length / (r.length || 1), p05: r[Math.floor(r.length * 0.05)] ?? null, p95: r[Math.floor(r.length * 0.95)] ?? null,
    byYear: Object.fromEntries(Object.entries(byYear).map(([y, b]) => [y, { n: b.n, mean: b.sum / b.n, hit: b.wins / b.n }])),
    byExit: Object.fromEntries(Object.entries(byExit).map(([k, b]) => [k, { n: b.n, mean: b.sum / b.n }])) };
}

// Entscheidung nach PREREGISTRATION-METHODS.acceptance (rein, testbar).
export function judge(runs) {
  const ex = (k) => runs[k]?.excessCagr;
  const sub = (k, i) => runs[k]?.subperiods?.[i]?.excess;
  const seedsPos = (runs.SEEDS_S1 || []).filter((s) => s.excessCagr > 0).length;
  const R = {
    R1: ['S0_LAST_PRICE', 'S1_MINUS_30', 'S2_DISTRESS_ZERO'].every((k) => ex(k) > 0),
    R2: sub('S1_MINUS_30', 0) > 0 && sub('S1_MINUS_30', 1) > 0,
    R3: seedsPos >= 16,
    R4: ex('COST2_S1') > 0,
  };
  const robustNegative = ex('S0_LAST_PRICE') < 0 && sub('S0_LAST_PRICE', 0) < 0 && sub('S0_LAST_PRICE', 1) < 0;
  const allPos = Object.values(R).every(Boolean);
  return { ...R, seedsPositive: seedsPos, robustNegative, verdict: allPos ? 'ROBUST_POSITIVE' : robustNegative ? 'ROBUST_NEGATIVE' : 'NOT_ROBUST', evidence: allPos ? 'CRITERIA_MET' : 'TESTED_NO_EDGE' };
}

function rawFromStoreBars(bars) {
  return bars.map((b) => ({ date: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? 0, adjClose: b.adjustedClose ?? b.adjClose ?? null, dividend: b.dividend ?? 0, splitFactor: b.splitFactor ?? 1 }))
    .filter((b) => b.close != null && b.date >= W.warmupFrom && b.date <= W.to).sort((a, b) => a.date.localeCompare(b.date));
}

// Laedt Listentabelle, Reihen (privater Eimer), Segmente (A2) und den
// Point-in-Time-Querschnitt. Gemeinsam fuer analyze-methods und diagnose-methods.
export async function loadPitData({ LIMIT = 0, log = () => {} } = {}) {
  const KEY = process.env.TIINGO_API_KEY || '';
  const zip = Buffer.from(await (await fetch(L.LIST_URL, { headers: KEY ? { Authorization: 'Token ' + KEY } : {} })).arrayBuffer());
  const rows = L.parseTickerCsv(L.unzipCsv(zip));
  const uni = JSON.parse(fs.readFileSync(path.join(root, 'quant/data/market/scale/universe-FULL_UNIVERSE.json'), 'utf8'));
  const elig = JSON.parse(fs.readFileSync(path.join(root, 'quant/data/market/security-master/eligibility.json'), 'utf8'));
  const cls = new Map(elig.decisions.map((d) => [d.ticker, d.instrument_type]));
  const storeActive = new Map(uni.securities.filter((s) => s.active !== false).map((s) => [s.ticker, { startDate: s.startDate, instrumentType: cls.get(s.ticker) || null }]));
  const listings = L.buildListingTable(rows, storeActive);
  const listedRoots = Master.collectListedRoots(rows);
  const hash = L.tableHash(listings);
  log(`Listings ${listings.length}, Hash ${hash.slice(0, 12)}`);

  const { createS3DriverFromEnv } = await import(path.join(root, 'scripts/market/storage/s3-driver.mjs'));
  const driver = createS3DriverFromEnv(process.env);
  const budget = Guard.createBudget({ classAOperations: 50, classBOperations: 30000 });
  const mine = Store.createHistoryStore({ driver, provider: 'tiingo-delisted', market: 'US', budget });
  const mainStore = Store.createHistoryStore({ driver, provider: 'tiingo', market: 'US', budget });
  {
    const u = await mine.readUsage(), v = await mainStore.readUsage();
    const est = Guard.estimateOperations({ kind: 'VALIDATION_ANALYZE', objectReads: 16000, indexWrites: 2 });
    const verdict = Guard.evaluate({ usage: Guard.applyUsage(v, { classAOperations: u.classAOperations, classBOperations: u.classBOperations }), estimate: est, operation: 'VALIDATION_ANALYZE' });
    log(`Zero-Cost-Guard: ${verdict.verdict}`);
    if (verdict.verdict !== Guard.ALLOWED) { console.error('Zero-Cost-Guard blockiert. ' + verdict.reason); process.exit(4); }
  }
  budget.consumeClassB(1, 'GET manifest');
  const mbuf = await driver.get(mine.seriesPrefix + '_validation/manifest.json.gz');
  const manifest = mbuf ? JSON.parse(zlib.gunzipSync(mbuf).toString('utf8')).entries : {};

  const spySeries = await mine.getSeries('SPY@1993-01-29');
  const spyRaw = rawFromStoreBars(spySeries.bars);
  const spyAdj = L.adjustSeries(spyRaw);
  const calendar = spyRaw.map((b) => b.date).filter((d) => d >= W.from && d <= W.to);
  const master = spyRaw.map((b) => b.date);
  const masterIdx = new Map(master.map((d, i) => [d, i]));
  const spyTR = []; { let v = 1; for (let i = 0; i < spyAdj.date.length; i++) { const d = spyAdj.date[i]; if (d < W.from) continue; if (d > W.from && spyAdj.tr[i] != null) v *= 1 + spyAdj.tr[i]; spyTR.push({ date: d, value: v }); } }
  const bench = { byWeek: new Map() };
  for (let i = 0; i < spyAdj.date.length; i++) bench.byWeek.set(isoWeekKey(spyAdj.date[i]), spyAdj.close[i]);

  const members = [];
  for (const l of listings) {
    if (l.source === 'STORE_ACTIVE') { if (L.INCLUDED_CLASSES.has(l.storeClass)) members.push({ l, from: 'STORE' }); continue; }
    const e = manifest[l.id];
    if (e && (e.status === 'OK' || e.status === 'PARTIAL')) {
      const inc = l.source === 'UNFETCHABLE_REUSED' ? e.included : L.classifyListing(Master, l, e.name, listedRoots).included;
      if (inc) members.push({ l, from: 'R2' });
    }
  }
  const todo = LIMIT ? members.slice(0, LIMIT) : members;
  log(`Universumsmitglieder ${members.length}, bearbeitet ${todo.length}`);

  // 1. Reihen laden, Doppelhistorien wie im Donchian-Lauf, Segmente (A2).
  const r2Raw = new Map(), lastKey = new Map();
  for (const m of todo.filter((x) => x.from === 'R2')) {
    const s = await mine.getSeries(`${m.l.ticker}@${m.l.startDate}`);
    const raw = s ? rawFromStoreBars(s.bars).filter((b) => b.date >= m.l.startDate && b.date <= (m.l.listEnd || W.to)) : [];
    r2Raw.set(m.l.id, raw);
    if (raw.length) { const b = raw[raw.length - 1]; lastKey.set(`${b.date}|${b.close}|${b.volume}`, m.l.id); }
  }
  const storeRaw = new Map(), dup = new Set();
  let k = 0;
  for (const m of todo.filter((x) => x.from === 'STORE')) {
    const s = await mainStore.getSeries(m.l.ticker);
    const raw = s ? rawFromStoreBars(s.bars) : [];
    for (const b of raw) { const x = lastKey.get(`${b.date}|${b.close}|${b.volume}`); if (x) dup.add(x); }
    storeRaw.set(m.l.id, raw);
    if (++k % 1000 === 0) log(`geladen ${k}`);
  }
  const segs = [];
  let offCalendar = 0;
  for (const m of todo) {
    if (m.from === 'R2' && dup.has(m.l.id)) continue;
    const raw = (m.from === 'R2' ? r2Raw.get(m.l.id) : storeRaw.get(m.l.id)) || [];
    const inWin = raw.filter((b) => b.date >= m.l.startDate && b.date <= (m.l.listEnd || W.to) && (masterIdx.has(b.date) || (offCalendar++, false)));
    L.splitSegments(inWin).forEach((seg, i, all) => {
      if (seg.length < 30) return;
      segs.push({ id: i ? `${m.l.id}#${i}` : m.l.id, raw: seg, delisted: !m.l.active || i < all.length - 1, survivor: m.from === 'STORE' });
    });
  }
  r2Raw.clear(); storeRaw.clear();
  log(`Segmente ${segs.length}, Doppelhistorien ${dup.size}, Balken ausserhalb des Kalenders ${offCalendar}`);

  // 2. Querschnitt Point-in-Time (wie build.mjs crossSection, aber ueber das damalige Universum).
  const metric = {};
  for (const key of CROSS_KEYS) metric[key] = [];
  segs.forEach((seg, si) => {
    const a = L.adjustSeries(seg.raw);
    const ind = computeIndicators({ date: a.date, open: a.open, high: a.high, low: a.low, close: a.close, volume: a.volume });
    const n = a.date.length;
    const vals = Object.fromEntries(CROSS_KEYS.map((x) => [x, new Float32Array(n).fill(NaN)]));
    for (let t = 0; t < n; t++) {
      if (!(ind.dollarVol20[t] >= 1e6)) continue;
      vals.mom21[t] = ind.ret21[t] ?? NaN; vals.mom63[t] = ind.ret63[t] ?? NaN; vals.mom126[t] = ind.ret126[t] ?? NaN;
      const parts = [ind.ret63[t], ind.ret126[t], ind.ret189[t], ind.ret252[t]];
      vals.rs[t] = parts.every(Number.isFinite) ? 0.4 * parts[0] + 0.2 * parts[1] + 0.2 * parts[2] + 0.2 * parts[3] : NaN;
    }
    seg.dIdx = Int32Array.from(a.date, (d) => masterIdx.get(d));
    seg.vals = vals;
    seg.cross = Object.fromEntries(CROSS_KEYS.map((x) => [x, new Array(n).fill(null)]));
    void si;
  });
  for (const key of CROSS_KEYS) {
    const count = new Int32Array(master.length);
    for (const seg of segs) { const v = seg.vals[key]; for (let t = 0; t < v.length; t++) if (Number.isFinite(v[t])) count[seg.dIdx[t]]++; }
    const offs = new Int32Array(master.length + 1);
    for (let d = 0; d < master.length; d++) offs[d + 1] = offs[d] + count[d];
    const vals = new Float64Array(offs[master.length]), sid = new Int32Array(offs[master.length]), tix = new Int32Array(offs[master.length]);
    const fill = offs.slice(0, master.length);
    segs.forEach((seg, si) => { const v = seg.vals[key]; for (let t = 0; t < v.length; t++) if (Number.isFinite(v[t])) { const d = seg.dIdx[t], p = fill[d]++; vals[p] = v[t]; sid[p] = si; tix[p] = t; } });
    for (let d = 0; d < master.length; d++) {
      const a = offs[d], b = offs[d + 1];
      percentilesInPlace(vals.subarray(a, b), Array.from({ length: b - a }, (_, q) => a + q), (p, rank) => { segs[sid[p]].cross[key][tix[p]] = rank; });
    }
    log(`Querschnitt ${key} fertig`);
  }
  for (const seg of segs) delete seg.vals;

  return { listings, members, hash, segs, dup, offCalendar, calendar, spyTR, spyAdj, bench, budget, mine };
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  const OUT_DIR = arg('--out', path.join(os.tmpdir(), 'supertrader-validation'));
  const LIMIT = Number(arg('--limit', '0'));
  const t0 = Date.now();
  const log = (m) => console.log(`[validation-methods +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const { listings, members, hash, segs, dup, offCalendar, calendar, spyTR, bench, budget, mine } = await loadPitData({ LIMIT, log });
  let k = 0;
  // 3. Simulation je Methode.
  const R = Object.fromEntries(ENGINES.map((e) => [e.id, { base: [], cost2: [], c3: [] }]));
  const pickC3 = new Set(segs.map((s) => s.id).sort((a, b) => L.sha256(a).localeCompare(L.sha256(b))).slice(0, 400));
  k = 0;
  for (const seg of segs) {
    const ctx = segCtx(seg, bench);
    for (const e of ENGINES) {
      const base = tradesFor(e, seg, ctx, DEFAULT_EXECUTION);
      R[e.id].base.push(...base);
      R[e.id].cost2.push(...tradesFor(e, seg, ctx, EXEC2));
      if (pickC3.has(seg.id) && R[e.id].c3.length < 20) { const t = base.find((x) => !x.terminal); if (t) R[e.id].c3.push(verifyGeneric(t, ctx, e)); }
    }
    if (++k % 1000 === 0) log(`simuliert ${k}/${segs.length}`);
  }
  log('Simulation fertig: ' + ENGINES.map((e) => `${e.id} ${R[e.id].base.length}`).join(', '));

  // 4. Portfolio und Kennzahlen.
  const cfg = PORTFOLIO_DEFAULTS;
  const metricsOf = (run, label, cal) => {
    const eq = run.equity;
    const tr = run.taken.filter((p) => p.returnPct !== undefined).map((p) => ({ result: { returnPct: p.returnPct, sessionsHeld: p.tr.heldSessions } }));
    const m = computeMetrics(eq, tr, spyTR, cfg);
    const sub = SPLIT_PERIODS.map(([a, b]) => { const c = cagrBetween(eq, a, b), s = cagrBetween(spyTR, a, b, 'value'); return { from: a, to: b, cagr: c, spy: s, excess: c != null && s != null ? c - s : null }; });
    const at = (curve, d, key) => { let v = null; for (const p of curve) { if (p.date > d) break; v = p[key]; } return v; };
    const phases = PHASES.map(([id, a, b]) => { const s0 = at(eq, a, 'equity'), s1 = at(eq, b, 'equity'), b0 = at(spyTR, a, 'value'), b1 = at(spyTR, b, 'value'); return { id, from: a, to: b, strategy: s0 && s1 ? s1 / s0 - 1 : null, spy: b0 && b1 ? b1 / b0 - 1 : null }; });
    void cal;
    return { label, cagr: m.cagr, spyCagr: m.benchmarkCagr, excessCagr: m.excessCagr, totalReturn: m.totalReturn, maxDrawdown: m.maxDrawdown, volatility: m.volatility, sharpe: m.sharpe, trades: m.trades, hitRate: m.hitRate, expectancy: m.expectancy, profitFactor: m.profitFactor, exposure: m.exposure, avgHoldingSessions: m.avgHoldingSessions, annualReturns: m.annualReturns, subperiods: sub, phases, skipped: run.skipped.length, taken: run.taken.length, terminalCount: run.book.terminalCount, reconciliation: reconcile(run, cfg) };
  };
  const results = {};
  for (const e of ENGINES) {
    const all = R[e.id].base, all2 = R[e.id].cost2, surv = all.filter((t) => t.survivor);
    const cal = [...new Set([...calendar, ...all.flatMap((t) => [t.entry.date, ...t.exits.map((x) => x.date)]).filter((d) => d >= W.from && d <= W.to)])].sort();
    const runs = {};
    for (const sc of ['S0_LAST_PRICE', 'S1_MINUS_30', 'S2_DISTRESS_ZERO']) runs[sc] = metricsOf(runPortfolioTR(all, cal, cfg, { scenario: sc }), sc, cal);
    runs.COST2_S1 = metricsOf(runPortfolioTR(all2, cal, cfg, { scenario: 'S1_MINUS_30', slippageBps: 20, commissionBps: 2 }), 'COST2_S1', cal);
    runs.SURVIVORS_ONLY = metricsOf(runPortfolioTR(surv, cal, cfg, { scenario: 'S0_LAST_PRICE' }), 'SURVIVORS_ONLY', cal);
    runs.SEEDS_S1 = [];
    for (let s = 1; s <= 20; s++) { const m = metricsOf(runPortfolioTR(all, cal, cfg, { scenario: 'S1_MINUS_30', seed: s }), 'SEED_' + s, cal); runs.SEEDS_S1.push({ seed: s, excessCagr: m.excessCagr, cagr: m.cagr, maxDrawdown: m.maxDrawdown, trades: m.trades }); }
    if (e.id === 'DARVAS_BOX') {
      const aOnly = all.filter((t) => Array.isArray(t.qualityFailed) && t.qualityFailed.filter((x) => x !== 'DAR-Q-REGIME').length === 0);
      runs.EXPLORATIVE_A_WITHOUT_REGIME_S1 = metricsOf(runPortfolioTR(aOnly, cal, cfg, { scenario: 'S1_MINUS_30' }), 'EXPLORATIVE_A_WITHOUT_REGIME_S1', cal);
      runs.EXPLORATIVE_A_WITHOUT_REGIME_S1.engineTrades = aOnly.length;
    }
    // C2
    const plain = all.filter((t) => !t.terminal || t.terminal.kind === 'OPEN_AT_END');
    const bySym = new Map(); for (const t of plain) (bySym.get(t.listingId) || bySym.set(t.listingId, []).get(t.listingId)).push(t);
    const priceOf = (sym, date) => { for (const t of bySym.get(sym) || []) { const v = t.marks.get(date); if (v !== undefined) return v; } return undefined; };
    const eng = runPortfolio(plain.map((t) => ({ symbol: t.listingId, signal: { id: t.id, entry: { ...t.entry }, initialStop: t.initialStop, exits: t.exits.map((x) => ({ ...x })) } })), priceOf, cal, cfg);
    const mine2 = runPortfolioTR(plain, cal, cfg, { commissionBps: 0, dividends: false, sizingSameDay: true, engineCompat: true });
    let c2 = 0; for (let i = 0; i < cal.length; i++) c2 = Math.max(c2, Math.abs(eng.equity[i].equity / mine2.equity[i].equity - 1));
    const r0 = runPortfolioTR(all, cal, cfg, { scenario: 'S0_LAST_PRICE' });
    const c5 = r0.taken.filter((p) => p.returnPct !== undefined).sort((a, b) => Math.abs(b.returnPct) - Math.abs(a.returnPct)).slice(0, 10).map((p) => ({ id: p.tr.id, returnPct: p.returnPct, entry: p.tr.entry, lastExit: p.tr.exits[p.tr.exits.length - 1] || null, terminal: p.tr.terminal ? { ...p.tr.terminal } : null, rawCloseAtConfirm: p.tr.rawCloseAtConfirm }));
    const at5 = all.filter((t) => !(t.rawCloseAtConfirm >= e.PARAMS.minPrice)).length;
    results[e.id] = {
      variant: e.variant, version: e.version, params: e.PARAMS, engineTrades: all.length, portfolioTrades: runs.S0_LAST_PRICE.taken,
      runs, judgement: judge(runs), at5Violations: at5,
      controls: { C1max: Math.max(...['S0_LAST_PRICE', 'S1_MINUS_30', 'S2_DISTRESS_ZERO', 'COST2_S1', 'SURVIVORS_ONLY'].map((x) => runs[x].reconciliation.relDiff)), C2maxRelDiff: c2, C3m: R[e.id].c3, C5: c5 },
      diagnostics: { allTrades: diag(all), survivorTrades: diag(surv), delistedTrades: diag(all.filter((t) => !t.survivor)), takenS0: diag(r0.taken.map((p) => p.tr)), maxPositionsSkipped: r0.skipped.filter((x) => x.reason === 'MAX_POSITIONS').length },
    };
    R[e.id] = null;
    log(`${e.id}: Portfolio fertig`);
  }

  if (!LIMIT) {
    const sp = budget.spent, u = await mine.readUsage();
    await mine.writeUsage(Guard.applyUsage(u, { classAOperations: sp.classA + 1, classBOperations: sp.classB, bytesDownloaded: sp.bytesDownloaded, run: { at: new Date().toISOString(), kind: 'VALIDATION_ANALYZE_METHODS', classB: sp.classB } }));
  }
  const result = { schema: 'supertrader-validation-methods-result-1.0.0', at: new Date().toISOString(), prereg: PREREG_METHODS, tableHash: hash, commit: process.env.GITHUB_SHA || null, limit: LIMIT || null,
    counts: { listings: listings.length, members: members.length, segments: segs.length, duplicates: dup.size, offCalendar }, execution: DEFAULT_EXECUTION, portfolio: cfg,
    spy: { cagr: cagrBetween(spyTR, W.from, W.to, 'value'), maxDrawdown: maxDrawdown(spyTR, 'value') }, results, budget: budget.spent };
  const pem = fs.readFileSync(path.join(root, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  const sealed = L.encryptForOwner(pem, Buffer.from(JSON.stringify(result)));
  fs.writeFileSync(path.join(OUT_DIR, LIMIT ? 'analyze-methods-smoke.sealed.json' : 'analyze-methods.sealed.json'), sealed);
  log(`Verschlüsseltes Ergebnis geschrieben (${sealed.length} Byte)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
