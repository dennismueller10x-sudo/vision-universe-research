#!/usr/bin/env node
// Supertrader R13 - forensischer Methoden- und Backtest-Audit (PREREGISTRATION-R13-AUDIT.json).
// Keine neuen Handelsregeln. Je Live-Methode:
//   A Reproduktion (gleiche Versionen wie Lauf r12), B Invarianten an ALLEN Engine-Trades,
//   C unabhaengige zweite Buchung des Modellportfolios + SPY-Gesamtrendite gegen Tiingo-adjClose,
//   D Delisting-Szenarien S1C/S2C (SEC-Klassifikation), E Zerlegung des Rueckstands zu SPY,
//   F Gegenproben je eine Ursache (Gleichgewicht, Halten 126 Sitzungen, Zufallsreihenfolge).
// Ausgabe nur verschluesselt; Log nur Zaehlwerte.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from './lib.mjs';
import { loadPitData, segCtx, tradesFor, portfolioOf, tradeRet } from './analyze-methods.mjs';
import { runPortfolioTR, cagrBetween, maxDrawdown, marketOkMap } from './portfolio.mjs';
import { DEFAULT_EXECUTION } from '../engine/execution.mjs';
import kk32 from '../engine/strategies/kk-breakout-v32.mjs';
import weinstein3 from '../engine/strategies/weinstein-v3.mjs';
import darvas302 from '../engine/strategies/darvas-v302.mjs';
import minervini2 from '../engine/strategies/minervini-v2.mjs';
import don201 from '../engine/strategies/donchian-v201.mjs';
import { simulateRotation } from '../engine/rotation-52w.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const W = L.WINDOW;
const EXEC2 = { ...DEFAULT_EXECUTION, slippageBps: 20, commissionBps: 2 };
const SPLIT = [['2016-01-04', '2020-12-31'], ['2021-01-01', W.to]];
const rs = (e) => ({ ...e, portfolio: { ...portfolioOf(e), priority: 'RS' } });
export const ENGINES_A13 = [rs(kk32), rs(weinstein3), darvas302, rs(minervini2), don201];
const keyOf = (e) => `${e.id}@${e.version}`;

// G2: gleiche Einstiege, Verkauf zum Schluss nach N Sitzungen (ohne Stop/Methodenausstieg); keine Ueberlappung je Notierung.
export function holdTrades(trades, ctx, seg, N = 126, slipBps = 10) {
  const d = ctx.bars.date, c = ctx.bars.close, slip = slipBps / 1e4, out = [];
  let busyUntil = '';
  for (const t of trades.slice().sort((a, b) => a.entry.date.localeCompare(b.entry.date))) {
    if (t.entry.date <= busyUntil) continue;
    const ei = d.indexOf(t.entry.date); if (ei < 0) continue;
    const last = d.length - 1, xi = Math.min(ei + N, last);
    const marks = new Map(), divs = new Map();
    for (let i = ei; i <= xi; i++) { marks.set(d[i], c[i]); if (ctx.divAdj[i] > 0) divs.set(d[i], ctx.divAdj[i]); }
    const ended = xi === last && ei + N > last;
    const tr = { ...t, id: t.id + ':G2', exits: [], terminal: null, marks, divs, heldSessions: xi - ei };
    if (ended && seg.delisted) tr.terminal = { date: d[last], lastClose: c[last], distress: L.distressSignature(ctx.raw.close), kind: 'DELISTED', delistClass: seg.delistClass || null };
    else tr.exits = [{ date: d[xi], price: c[xi] * (ended ? 1 : 1 - slip), fraction: 1, ruleId: ended ? 'OPEN_AT_END_MARK' : 'G2-HOLD126', basis: 'CLOSE' }];
    busyUntil = d[xi];
    out.push(tr);
  }
  return out;
}

// B: Invarianten eines Trades gegen die (bereinigten) Tagesbalken.
export function invariants(t, ctx, seg, slipBps = 10) {
  const d = ctx.bars.date, slip = slipBps / 1e4, eps = 1e-6, v = [];
  const i = d.indexOf(t.entry.date);
  if (i < 0) v.push('ENTRY_NOT_TRADING_DAY');
  else if (!(t.entry.price <= ctx.bars.high[i] * (1 + slip) * (1 + eps) && t.entry.price >= ctx.bars.low[i] * (1 + slip) * (1 - eps))) v.push('ENTRY_OUTSIDE_RANGE');
  let frac = 0, prev = t.entry.date;
  for (const x of t.exits) {
    const k = d.indexOf(x.date);
    if (k < 0) { v.push('EXIT_NOT_TRADING_DAY'); continue; }
    if (x.date < prev) v.push('EXIT_BEFORE_PREVIOUS');
    const hi = ctx.bars.high[k] * (x.ruleId === 'OPEN_AT_END_MARK' ? 1 : 1 - slip), lo = ctx.bars.low[k] * (1 - slip);
    if (!(x.price <= hi * (1 + eps) && x.price >= lo * (1 - eps))) v.push('EXIT_OUTSIDE_RANGE');
    frac += x.fraction; prev = x.date;
  }
  if (t.terminal?.kind === 'DELISTED') { frac += t.remainingAtTerminal ?? 1 - frac; if (t.terminal.date !== d[d.length - 1]) v.push('TERMINAL_NOT_LAST_BAR'); if (!seg.delisted) v.push('TERMINAL_NOT_DELISTED'); }
  if (Math.abs(frac - 1) > 1e-6) v.push('FRACTIONS_NOT_ONE');
  return v;
}

// C: unabhaengige Buchung aus den aufgenommenen Positionen (eigener Code, gleiche Konventionen).
export function replay(run, calendar, cfg, opts = {}) {
  const comm = (opts.commissionBps ?? 1) / 1e4, slip = (opts.slippageBps ?? 10) / 1e4, scen = opts.scenarioFn;
  const ev = new Map(); const push = (dt, x) => (ev.get(dt) || ev.set(dt, []).get(dt)).push(x);
  for (const p of run.taken) {
    push(p.tr.entry.date, { k: 'B', p });
    for (const x of p.tr.exits) push(x.date, { k: 'S', p, x });
    if (p.tr.terminal?.kind === 'DELISTED') push(p.tr.terminal.date, { k: 'T', p });
  }
  let cash = cfg.initialEquity; const held = new Map(); const last = new Map(); let maxRel = 0;
  for (let di = 0; di < calendar.length; di++) {
    const date = calendar[di];
    for (const [p, sh] of held) { const dv = p.tr.divs.get(date); if (dv > 0 && p.tr.entry.date < date) cash += sh * dv; }
    const es = ev.get(date) || [];
    for (const e of es) if (e.k === 'S' && held.has(e.p) && e.p.tr.entry.date < date) { const q = e.p.entryShares * e.x.fraction; cash += q * e.x.price * (1 - comm); held.set(e.p, held.get(e.p) - q); }
    for (const e of es) if (e.k === 'B') { cash -= e.p.entryShares * e.p.tr.entry.price * (1 + comm); held.set(e.p, e.p.entryShares); for (const x of e.p.tr.exits) if (x.date === date) { const q = e.p.entryShares * x.fraction; cash += q * x.price * (1 - comm); held.set(e.p, held.get(e.p) - q); } }
    for (const e of es) if (e.k === 'T' && held.has(e.p)) { const sh = held.get(e.p); if (sh > 1e-9) cash += sh * scen(e.p.tr.terminal, slip) * (1 - comm); held.set(e.p, 0); }
    let mv = 0;
    for (const [p, sh] of held) { if (sh <= 1e-9) { held.delete(p); continue; } const m = p.tr.marks.get(date); if (Number.isFinite(m)) last.set(p, m); mv += sh * (last.get(p) ?? p.tr.entry.price); }
    const eq = cash + mv, ref = run.equity[di]?.equity;
    if (ref) maxRel = Math.max(maxRel, Math.abs(eq / ref - 1));
  }
  return { maxRelDiff: maxRel };
}

export function quick(run, spyTR) {
  const eq = run.equity, n = eq.length;
  const yrs = (Date.parse(eq[n - 1].date) - Date.parse(eq[0].date)) / (365.25 * 864e5);
  const cagr = (eq[n - 1].equity / eq[0].equity) ** (1 / yrs) - 1;
  const spyMap = new Map(spyTR.map((p) => [p.date, p.value]));
  let m = 1, prevSpy = spyMap.get(eq[0].date), prevExp = 0;
  for (let i = 1; i < n; i++) { const s = spyMap.get(eq[i].date); if (s && prevSpy) m *= 1 + prevExp * (s / prevSpy - 1); if (s) prevSpy = s; prevExp = eq[i].exposure; }
  const matched = m ** (1 / yrs) - 1;
  const spy = cagrBetween(spyTR, eq[0].date, eq[n - 1].date, 'value');
  const tk = run.taken.filter((p) => p.returnPct !== undefined);
  return { cagr, spy, excess: cagr - spy, exposureMatchedSpy: matched, maxDrawdown: maxDrawdown(eq), meanExposure: eq.reduce((a, p) => a + p.exposure, 0) / n,
    taken: run.taken.length, skipped: run.skipped.length, skippedByReason: run.skipped.reduce((a, x) => ((a[x.reason] = (a[x.reason] || 0) + 1), a), {}),
    hit: tk.filter((p) => p.returnPct > 0).length / (tk.length || 1), terminal: run.book.terminalCount,
    subperiods: SPLIT.map(([a, b]) => { const c = cagrBetween(eq, a, b), s = cagrBetween(spyTR, a, b, 'value'); return { from: a, to: b, excess: c != null && s != null ? c - s : null }; }) };
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  const OUT = arg('--out', path.join(os.tmpdir(), 'audit13')); const LIMIT = Number(arg('--limit', '0'));
  fs.mkdirSync(OUT, { recursive: true });
  const t0 = Date.now(); const log = (m) => console.log(`[audit13 +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
  const { segs, calendar, spyTR, spyAdj, spyRaw, bench, nonEquityExcluded, delistCoverage, dataFingerprint } = await loadPitData({ LIMIT, log, excludeNonEquity: true, delistPit: true });
  // C2: SPY-Gesamtrendite eigene Rechnung vs. Tiingo-adjClose
  const sr = spyRaw.filter((b) => b.date >= W.from && b.date <= W.to);
  const yrs = (Date.parse(sr[sr.length - 1].date) - Date.parse(sr[0].date)) / (365.25 * 864e5);
  const benchmark = { ownTrCagr: cagrBetween(spyTR, W.from, W.to, 'value'), adjCloseCagr: (sr[sr.length - 1].adjClose / sr[0].adjClose) ** (1 / yrs) - 1, priceOnlyCagr: (sr[sr.length - 1].close / sr[0].close) ** (1 / yrs) - 1, from: sr[0].date, to: sr[sr.length - 1].date };
  log(`SPY: eigene Gesamtrendite ${benchmark.ownTrCagr.toFixed(4)}, adjClose ${benchmark.adjCloseCagr.toFixed(4)}`);
  // B: Ticker-Wiederverwendung (gleiches Kuerzel, verschiedene Notierungen, ueberlappende Zeitraeume)
  const byTicker = new Map();
  for (const s of segs) { const tk = s.id.split(':')[2]; const a = s.raw?.[0]?.date, b = s.raw?.[s.raw.length - 1]?.date; (byTicker.get(tk) || byTicker.set(tk, []).get(tk)).push([s.id, a, b]); }
  const reuse = []; for (const [tk, l] of byTicker) if (l.length > 1) for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) if (l[i][1] <= l[j][2] && l[j][1] <= l[i][2] && l[i][0].split('#')[0] !== l[j][0].split('#')[0]) reuse.push([tk, l[i][0], l[j][0]]);
  log(`Ticker mehrfach: ${[...byTicker.values()].filter((l) => l.length > 1).length}, ueberlappend ${reuse.length}`);
  const MOK = marketOkMap(spyAdj);
  const R = Object.fromEntries(ENGINES_A13.map((e) => [keyOf(e), { base: [], cost2: [], hold: [], inv: {}, invEx: [], overlap: 0, cut: { n: 0, cutWinners: 0, doubled: 0, actualMean: 0, holdMean: 0 } }]));
  const stocks = [];
  let k = 0;
  for (const seg of segs) {
    const ctx = segCtx(seg, bench);
    for (const e of ENGINES_A13) {
      const r = R[keyOf(e)];
      const base = tradesFor(e, seg, ctx, DEFAULT_EXECUTION);
      r.base.push(...base); r.cost2.push(...tradesFor(e, seg, ctx, EXEC2));
      for (const t of base) { const v = invariants(t, ctx, seg); for (const x of v) { r.inv[x] = (r.inv[x] || 0) + 1; if (r.invEx.length < 25) r.invEx.push([t.id, x]); } }
      const sorted = base.slice().sort((a, b) => a.entry.date.localeCompare(b.entry.date));
      for (let i = 1; i < sorted.length; i++) { const p = sorted[i - 1], lx = p.exits.length ? p.exits[p.exits.length - 1].date : p.terminal?.date; if (lx && sorted[i].entry.date < lx) r.overlap++; }
      const h = holdTrades(base, ctx, seg); r.hold.push(...h);
      // abgeschnittene Gewinner: Handelsergebnis vs. gleicher Einstieg 126 Sitzungen gehalten
      const hm = new Map(h.map((x) => [x.id.replace(/:G2$/, ''), x]));
      for (const t of base) { const g = hm.get(t.id); if (!g) continue; const ra = tradeRet(t), d = ctx.bars.date, ei = d.indexOf(t.entry.date), xi = Math.min(ei + 126, d.length - 1), rh = ctx.bars.close[xi] / t.entry.price - 1;
        if (!Number.isFinite(ra) || !Number.isFinite(rh)) continue; r.cut.n++; r.cut.actualMean += ra; r.cut.holdMean += rh; if (rh >= 1) { r.cut.doubled++; if (ra < 0.1) r.cut.cutWinners++; } }
    }
    const a = L.adjustSeries(seg.raw); const n = a.date.length;
    stocks.push({ id: seg.id, symbol: seg.id.split(':')[2], survivor: seg.survivor, bars: { date: a.date, open: a.open, high: a.high, low: a.low, close: a.close, volume: a.volume }, divAdj: a.divAdj, rs: seg.cross?.rs || null,
      terminal: seg.delisted ? { date: a.date[n - 1], lastClose: a.close[n - 1], distress: L.distressSignature(a.rawClose), kind: 'DELISTED', delistClass: seg.delistClass || null } : null });
    seg.raw = null;
    if (++k % 1000 === 0) log(`simuliert ${k}/${segs.length}`);
  }
  log('Simulation fertig');
  const results = {};
  const SC = { S1C_CLASSIFIED: (t, slip) => (t.delistClass === 'ACQUISITION' ? t.lastClose * (1 - slip) : t.lastClose * 0.7) };
  for (const e of ENGINES_A13) {
    const r = R[keyOf(e)], cfg = portfolioOf(e);
    const cal = [...new Set([...calendar, ...r.base.flatMap((t) => [t.entry.date, ...t.exits.map((x) => x.date)]).filter((d) => d >= W.from && d <= W.to)])].sort();
    const go = (tr, o, c = cfg) => runPortfolioTR(tr, cal, c, { marketOk: MOK, ...o });
    const runs = {};
    const s0 = go(r.base, { scenario: 'S0_LAST_PRICE' }); runs.S0 = quick(s0, spyTR);
    runs.S1 = quick(go(r.base, { scenario: 'S1_MINUS_30' }), spyTR);
    runs.S2 = quick(go(r.base, { scenario: 'S2_DISTRESS_ZERO' }), spyTR);
    const s1c = go(r.base, { scenario: 'S1C_CLASSIFIED' }); runs.S1C = quick(s1c, spyTR);
    runs.S2C = quick(go(r.base, { scenario: 'S2C_CLASSIFIED' }), spyTR);
    runs.COST2_S1C = quick(go(r.cost2, { scenario: 'S1C_CLASSIFIED', slippageBps: 20, commissionBps: 2 }), spyTR);
    runs.G1_EQUALWEIGHT_S1C = quick(go(r.base, { scenario: 'S1C_CLASSIFIED' }, { ...cfg, riskPerTrade: 1, maxPositionPct: 1 / cfg.maxPositions }), spyTR);
    runs.G2_HOLD126_S1C = quick(go(r.hold, { scenario: 'S1C_CLASSIFIED' }), spyTR);
    const seeds = []; for (let sd = 1; sd <= 20; sd++) seeds.push(quick(go(r.base, { scenario: 'S1C_CLASSIFIED', seed: sd }), spyTR).excess);
    runs.SEEDS_S1C = seeds;
    const rep0 = replay(s0, cal, cfg, { scenarioFn: (t, slip) => t.lastClose * (1 - slip) });
    const rep1 = replay(s1c, cal, cfg, { scenarioFn: SC.S1C_CLASSIFIED });
    const sp = runs.S0.spy;
    const decomposition = { spy: sp, cashDrag: runs.S0.exposureMatchedSpy - sp, investedResult: runs.S0.cagr - runs.S0.exposureMatchedSpy, delistingAssumptionS1C: runs.S1C.cagr - runs.S0.cagr, oldS1Assumption: runs.S1.cagr - runs.S0.cagr, costUnit: runs.COST2_S1C.cagr - runs.S1C.cagr, excessS1C: runs.S1C.excess };
    const terminals = s1c.taken.filter((p) => p.tr.terminal?.kind === 'DELISTED').map((p) => ({ id: p.tr.id, date: p.tr.terminal.date, lastClose: p.tr.terminal.lastClose, cls: p.tr.terminal.delistClass, distress: p.tr.terminal.distress, weightAtEntry: (p.entryShares * p.tr.entry.price) / p.eqAtEntry, returnPct: p.returnPct }));
    const taken = s1c.taken.map((p) => ({ id: p.tr.id, l: p.tr.listingId, e: [p.tr.entry.date, p.tr.entry.price], x: p.tr.exits.map((x) => [x.date, x.price, x.fraction, x.ruleId]), t: p.tr.terminal ? [p.tr.terminal.kind, p.tr.terminal.date, p.tr.terminal.delistClass] : null, w: (p.entryShares * p.tr.entry.price) / p.eqAtEntry, r: p.returnPct ?? null, rs: p.tr.rsAtEntry ?? null }));
    const c = r.cut; const cut = { n: c.n, doubledWithin126: c.doubled, cutWinners: c.cutWinners, actualMean: c.actualMean / (c.n || 1), hold126Mean: c.holdMean / (c.n || 1) };
    results[keyOf(e)] = { cfg: { riskPerTrade: cfg.riskPerTrade, maxPositionPct: cfg.maxPositionPct, maxPositions: cfg.maxPositions, priority: cfg.priority || 'ALPHA', marketFilter: !!cfg.marketFilter },
      engineTrades: r.base.length, runs, decomposition, accounting: { replayS0: rep0, replayS1C: rep1 }, invariants: { counts: r.inv, examples: r.invEx, overlappingTrades: r.overlap }, cutWinners: cut, terminals, taken,
      skippedSample: s1c.skipped.slice(0, 2000).map((x) => [x.id, x.reason]) };
    R[keyOf(e)] = null;
    log(`${keyOf(e)}: S1C Ueberrendite ${(runs.S1C.excess * 100).toFixed(1)} %, Abstimmung ${rep1.maxRelDiff.toExponential(1)}`);
  }
  // VU Trendfolge 52W: S1C neben S0/S1
  const spy = { date: spyAdj.date, close: spyAdj.close };
  const t52 = {}; for (const sc of ['S0_LAST_PRICE', 'S1_MINUS_30', 'S1C_CLASSIFIED']) { const r = simulateRotation(stocks, calendar, spy, { from: W.from, to: W.to, variant: 'PP', rank: 'CLENOW', scenario: sc });
    const eq = r.equity, n = eq.length, y = (Date.parse(eq[n - 1].date) - Date.parse(eq[0].date)) / (365.25 * 864e5), cg = (eq[n - 1].equity / eq[0].equity) ** (1 / y) - 1, s = cagrBetween(spyTR, eq[0].date, eq[n - 1].date, 'value');
    t52[sc] = { cagr: cg, excess: cg - s, maxDrawdown: maxDrawdown(eq), terminals: r.trades.filter((t) => t.exits.some((x) => x.ruleId === 'DELISTED')).length,
      subperiods: SPLIT.map(([a, b]) => { const c = cagrBetween(eq, a, b), sv = cagrBetween(spyTR, a, b, 'value'); return c != null && sv != null ? c - sv : null; }) }; }
  log('Trendfolge 52W fertig');
  const result = { schema: 'supertrader-audit-r13-1.0.0', prereg: 'supertrader-validation-prereg-r13-audit-1.0.0', at: new Date().toISOString(), commit: process.env.GITHUB_SHA || null, limit: LIMIT || null,
    dataFingerprint, universe: { segments: segs.length, nonEquityExcluded: Array.isArray(nonEquityExcluded) ? nonEquityExcluded.length : nonEquityExcluded, delistCoverage, tickerReuseOverlapping: reuse.length, tickerReuseExamples: reuse.slice(0, 30) },
    benchmark, results, trend52: t52 };
  const pem = fs.readFileSync(path.join(root, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  fs.writeFileSync(path.join(OUT, `audit-r13${LIMIT ? '-smoke' : ''}.sealed.json`), L.encryptForOwner(pem, Buffer.from(JSON.stringify(result))));
  log('Verschluesseltes Ergebnis geschrieben');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
