#!/usr/bin/env node
// Supertrader — interner Datentest: Qualitaetsbericht, Universum je Stichtag,
// Donchian-Backtest mit Delisting-Szenarien, Kontrollrechnungen.
//
//   node scripts/supertrader/validation/analyze.mjs
//
// Liest die Listentabelle (Tiingo-Tickerliste), das Manifest und die Reihen
// aus dem privaten Eimer (tiingo-delisted) sowie die aktiven Reihen aus dem
// bestehenden Speicher (tiingo). Schreibt NUR ein verschluesseltes Ergebnis;
// Logs enthalten Fortschrittszahlen, keine Kennzahlen.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as L from './lib.mjs';
import { runPortfolioTR, reconcile, cagrBetween, maxDrawdown } from './portfolio.mjs';
import { computeIndicators } from '../engine/indicators.mjs';
import { simulate } from '../engine/simulator.mjs';
import { runPortfolio, computeMetrics, PORTFOLIO_DEFAULTS } from '../engine/backtest.mjs';
import { DEFAULT_EXECUTION } from '../engine/execution.mjs';
import donchian from '../engine/strategies/donchian.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const Store = require(path.join(root, 'quant/engines/history-store.js'));
const Guard = require(path.join(root, 'quant/engines/zero-cost-guard.js'));
const Master = require(path.join(root, 'quant/engines/us-security-master.js'));

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const OUT_DIR = arg('--out', path.join(os.tmpdir(), 'supertrader-validation'));
const LIMIT = Number(arg('--limit', '0')); // nur fuer Testlaeufe
const t0 = Date.now();
const log = (m) => console.log(`[validation-analyze +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
const W = L.WINDOW;
const EXEC2 = { ...DEFAULT_EXECUTION, slippageBps: 20, commissionBps: 2 };
const SPLIT_PERIODS = [['2016-01-04', '2020-12-31'], ['2021-01-01', W.to]];

// Harness-Adapter rawPriceGate (PREREGISTRATION strategy.harnessAdapter):
// Kursgrenze auf dem Rohschluss, sonst unveraenderte Regeln.
export function rawGateStrategy(base = donchian) {
  return {
    ...base,
    scan(ctx, t, p, o) {
      const rc = ctx.raw.close[t];
      if (!(Number.isFinite(rc) && rc >= base.PARAMS.minPrice)) return null;
      return base.scan(ctx, t, { ...p, minPrice: 0 }, o);
    },
  };
}
const STRAT = rawGateStrategy();

export function rawToCtx(listingId, raw) {
  const a = L.adjustSeries(raw);
  const bars = { date: a.date, open: a.open, high: a.high, low: a.low, close: a.close, volume: a.volume };
  return { symbol: listingId, bars, ind: computeIndicators(bars), raw: { close: a.rawClose, volume: a.rawVolume }, divAdj: a.divAdj, tr: a.tr, split: a.split };
}

// Trades einer Reihe (Engine unveraendert) + Abschluss offener Positionen.
export function tradesFor(listing, ctx, exec, delisted) {
  const d = ctx.bars.date;
  let from = d.findIndex((x) => x >= W.from);
  if (from < 0) return { trades: [], openSignal: null };
  const res = simulate(STRAT, ctx, { from, exec, params: { ...donchian.PARAMS, minPrice: 0 } });
  const trades = [];
  const mk = (s, terminal) => {
    const ei = s.entry.index, lastIdx = terminal ? d.length - 1 : s.exits[s.exits.length - 1].index;
    const marks = new Map(), divs = new Map();
    for (let i = ei; i <= lastIdx; i++) { marks.set(d[i], ctx.bars.close[i]); if (ctx.divAdj[i] > 0) divs.set(d[i], ctx.divAdj[i]); }
    const ci = s.confirmation?.index;
    return {
      id: s.id, listingId: listing.id, entry: { date: s.entry.date, price: s.entry.price }, initialStop: s.initialStop,
      exits: s.exits.map((x) => ({ date: x.date, price: x.price, fraction: x.fraction, ruleId: x.ruleId })),
      confirmDate: s.confirmation?.date || null, rawCloseAtConfirm: ci != null ? ctx.raw.close[ci] : null,
      terminal, marks, divs, heldSessions: lastIdx - ei,
    };
  };
  for (const s of res.finished) if (s.entry && s.exits.length && s.entry.date <= W.to) trades.push(mk(s, null));
  const s = res.state.signal;
  if (s && s.entry && (s.remaining ?? 1) > 1e-9) {
    const last = d.length - 1;
    const t = { date: d[last], lastClose: ctx.bars.close[last], distress: L.distressSignature(ctx.raw.close), kind: delisted ? 'DELISTED' : 'OPEN_AT_END' };
    const tr = mk(s, t);
    tr.remainingAtTerminal = s.remaining ?? 1;
    if (!delisted) tr.exits.push({ date: d[last], price: ctx.bars.close[last], fraction: s.remaining ?? 1, ruleId: 'OPEN_AT_END_MARK' });
    trades.push(tr);
  }
  return { trades };
}

function quality(listing, raw, calIndex, calendar) {
  const q = { bars: raw.length, first: raw[0]?.date, last: raw[raw.length - 1]?.date, splits: 0, dividends: 0, extremeMoves: 0, zeroVolume: 0, missingDays: 0, maxMissingRun: 0 };
  if (!raw.length) return q;
  const fi = calIndex.get(q.first), li = calIndex.get(q.last);
  if (fi != null && li != null) {
    const have = new Set(raw.map((b) => b.date));
    let run = 0;
    for (let i = fi; i <= li; i++) { if (!have.has(calendar[i])) { q.missingDays++; run++; q.maxMissingRun = Math.max(q.maxMissingRun, run); } else run = 0; }
    q.expectedDays = li - fi + 1;
  }
  for (let i = 0; i < raw.length; i++) {
    const b = raw[i];
    if (b.splitFactor !== 1) q.splits++;
    if (b.dividend > 0) q.dividends++;
    if (!(b.volume > 0)) q.zeroVolume++;
    if (i > 0 && raw[i - 1].close > 0) { const r = ((b.close + b.dividend) * b.splitFactor) / raw[i - 1].close - 1; if (r > 1 || r < -0.5) q.extremeMoves++; }
  }
  const sc = L.splitChecks(raw);
  q.splitChecks = sc.length; q.splitChecksOk = sc.filter((x) => x.ok === true).length; q.splitChecksNA = sc.filter((x) => x.ok === null).length;
  if (!listing.active && listing.listEnd) q.lastVsListEndDays = L.days(q.last, listing.listEnd);
  const closes = raw.map((b) => b.close);
  q.distress = L.distressSignature(closes);
  const tail = closes.slice(-20);
  q.pinned = tail.length >= 20 && Math.max(...tail) / Math.min(...tail) - 1 < 0.03;
  return q;
}

function rawFromStoreBars(bars) {
  return bars.map((b) => ({ date: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? 0, adjClose: b.adjustedClose ?? b.adjClose ?? null, dividend: b.dividend ?? 0, splitFactor: b.splitFactor ?? 1 }))
    .filter((b) => b.close != null && b.date >= W.warmupFrom && b.date <= W.to).sort((a, b) => a.date.localeCompare(b.date));
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
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
  const main = Store.createHistoryStore({ driver, provider: 'tiingo', market: 'US', budget });
  {
    const u = await mine.readUsage(), v = await main.readUsage();
    const est = Guard.estimateOperations({ kind: 'VALIDATION_ANALYZE', objectReads: 16000, indexWrites: 2 });
    const verdict = Guard.evaluate({ usage: Guard.applyUsage(v, { classAOperations: u.classAOperations, classBOperations: u.classBOperations }), estimate: est, operation: 'VALIDATION_ANALYZE' });
    log(`Zero-Cost-Guard: ${verdict.verdict}`);
    if (verdict.verdict !== Guard.ALLOWED) { console.error('Zero-Cost-Guard blockiert. ' + verdict.reason); process.exit(4); }
  }
  budget.consumeClassB(1, 'GET manifest');
  const mbuf = await driver.get(mine.seriesPrefix + '_validation/manifest.json.gz');
  const manifest = mbuf ? JSON.parse(zlib.gunzipSync(mbuf).toString('utf8')).entries : {};
  log(`Manifest ${Object.keys(manifest).length} Einträge`);

  // Kalender und SPY-Gesamtrendite
  const spySeries = await mine.getSeries('SPY@1993-01-29');
  if (!spySeries) throw new Error('SPY-Reihe fehlt - zuerst Abruf');
  const spyRaw = rawFromStoreBars(spySeries.bars);
  const calendar = spyRaw.map((b) => b.date).filter((d) => d >= W.from && d <= W.to);
  const calIndex = new Map(calendar.map((d, i) => [d, i]));
  const spyAdj = L.adjustSeries(spyRaw);
  const spyTR = []; { let v = 1; for (let i = 0; i < spyAdj.date.length; i++) { const d = spyAdj.date[i]; if (d < W.from) continue; if (d > W.from && spyAdj.tr[i] != null) v *= 1 + spyAdj.tr[i]; spyTR.push({ date: d, value: v }); } }

  // Universumsmitglieder
  const members = [];
  for (const l of listings) {
    if (l.source === 'STORE_ACTIVE') { if (L.INCLUDED_CLASSES.has(l.storeClass)) members.push({ l, from: 'STORE' }); continue; }
    const e = manifest[l.id];
    // Gattung mit dem aktuellen Regelstand (inkl. Amendment A1) neu bestimmen
    if (e && (e.status === 'OK' || e.status === 'PARTIAL')) {
      e.included = l.source === 'UNFETCHABLE_REUSED' ? e.included : L.classifyListing(Master, l, e.name, listedRoots).included;
      if (e.included) members.push({ l, from: 'R2' });
    }
  }
  const todo = LIMIT ? members.slice(0, LIMIT) : members;
  log(`Universumsmitglieder ${members.length} (Speicher ${members.filter((m) => m.from === 'STORE').length}, neu ${members.filter((m) => m.from === 'R2').length})`);

  // Pass A: delistete/neue Reihen laden (Doppelhistorien-Abgleich braucht sie vorab)
  const rawById = new Map();
  const lastKey = new Map();
  for (const m of todo.filter((x) => x.from === 'R2')) {
    const s = await mine.getSeries(`${m.l.ticker}@${m.l.startDate}`);
    const raw = s ? rawFromStoreBars(s.bars).filter((b) => b.date >= m.l.startDate && b.date <= (m.l.listEnd || W.to)) : [];
    rawById.set(m.l.id, raw);
    if (raw.length) { const b = raw[raw.length - 1]; lastKey.set(`${b.date}|${b.close}|${b.volume}`, m.l.id); }
  }
  log(`Pass A: ${rawById.size} neue Reihen geladen`);

  const out = { quality: [], trades: { base: [], cost2: [] }, ew: null, duplicates: [], droppedOutside: 0, seriesBreaks: [] };
  const n = calendar.length;
  const ew = { S0_LAST_PRICE: { sum: new Float64Array(n), cnt: new Float64Array(n) }, S1_MINUS_30: { sum: new Float64Array(n), cnt: new Float64Array(n) }, S2_DISTRESS_ZERO: { sum: new Float64Array(n), cnt: new Float64Array(n) }, SURVIVOR: { sum: new Float64Array(n), cnt: new Float64Array(n) } };
  const duplicateIds = new Set();
  const universeYear = {};
  const sample = { trades: [] };

  const processSeries = (m, raw) => {
    const inWin = raw.filter((b) => b.date >= m.l.startDate && b.date <= (m.l.listEnd || W.to));
    out.droppedOutside += raw.length - inWin.length;
    const segs = L.splitSegments(inWin);
    if (segs.length > 1) out.seriesBreaks.push({ id: m.l.id, segments: segs.length, gaps: segs.slice(1).map((s, i) => [segs[i][segs[i].length - 1].date, s[0].date]) });
    segs.forEach((seg, k) => processSegment({ ...m, l: k ? { ...m.l, id: `${m.l.id}#${k}` } : m.l, segEnd: k < segs.length - 1 }, seg));
  };
  const processSegment = (m, inWin) => {
    const l = m.l;
    if (inWin.length < 30) { out.quality.push({ id: l.id, from: m.from, skipped: 'TOO_FEW_BARS', bars: inWin.length }); return; }
    const delisted = !l.active || m.segEnd;
    const q = quality(l, inWin, calIndex, calendar);
    q.id = l.id; q.from = m.from; q.delisted = delisted; q.segEnd = !!m.segEnd; q.endYear = m.segEnd ? q.last.slice(0, 4) : l.listEnd?.slice(0, 4) || null;
    out.quality.push(q);
    const ctx = rawToCtx(l.id, inWin);
    for (const [k, exec] of [['base', DEFAULT_EXECUTION], ['cost2', EXEC2]]) {
      const { trades } = tradesFor(l, ctx, exec, delisted);
      for (const t of trades) { t.survivor = m.from === 'STORE'; out.trades[k].push(t); }
    }
    // Gleichgewichteter Vergleich (taeglich, Vortages-Eignung)
    const d = ctx.bars.date;
    let lastEligible = false;
    for (let i = 1; i < d.length; i++) {
      const ci = calIndex.get(d[i]);
      const ok = ctx.raw.close[i - 1] >= 10 && ctx.ind.dollarVol20[i - 1] >= 20e6;
      if (ci != null && ok && ctx.tr[i] != null && Math.abs(ctx.tr[i]) < 5) {
        for (const s of ['S0_LAST_PRICE', 'S1_MINUS_30', 'S2_DISTRESS_ZERO']) { ew[s].sum[ci] += ctx.tr[i]; ew[s].cnt[ci]++; }
        if (m.from === 'STORE') { ew.SURVIVOR.sum[ci] += ctx.tr[i]; ew.SURVIVOR.cnt[ci]++; }
      }
      if (i === d.length - 1) lastEligible = ctx.raw.close[i] >= 10 && ctx.ind.dollarVol20[i] >= 20e6;
    }
    if (delisted && lastEligible) {
      const ci = calIndex.get(d[d.length - 1]);
      if (ci != null && ci + 1 < n) {
        ew.S0_LAST_PRICE.cnt[ci + 1]++;
        ew.S1_MINUS_30.sum[ci + 1] += -0.3; ew.S1_MINUS_30.cnt[ci + 1]++;
        ew.S2_DISTRESS_ZERO.sum[ci + 1] += q.distress ? -1 : -0.3; ew.S2_DISTRESS_ZERO.cnt[ci + 1]++;
      }
    }
    // Universumsgroesse zu Jahresbeginn
    for (let y = 2016; y <= 2026; y++) {
      const dy = `${y}-01-15`;
      if (q.first <= dy && q.last >= dy) { const u = universeYear[y] ||= { members: 0, survivorsOnly: 0, delistedDuringYear: 0 }; u.members++; if (m.from === 'STORE') u.survivorsOnly++; if (delisted && l.listEnd?.startsWith(String(y))) u.delistedDuringYear++; }
    }
  };

  // Pass B: aktive Reihen aus dem Speicher (+ Doppelhistorien-Abgleich)
  let k = 0;
  for (const m of todo) {
    if (m.from === 'STORE') {
      const s = await main.getSeries(m.l.ticker);
      if (!s) { out.quality.push({ id: m.l.id, from: 'STORE', skipped: 'MISSING_IN_STORE' }); continue; }
      const raw = rawFromStoreBars(s.bars);
      for (const b of raw) { const dup = lastKey.get(`${b.date}|${b.close}|${b.volume}`); if (dup) { duplicateIds.add(dup); out.duplicates.push({ delisted: dup, active: m.l.id, date: b.date }); } }
      processSeries(m, raw);
    }
    if (++k % 1000 === 0) log(`Pass B: ${k}/${todo.length}`);
  }
  for (const m of todo) if (m.from === 'R2' && !duplicateIds.has(m.l.id)) processSeries(m, rawById.get(m.l.id) || []);
  log(`Reihen verarbeitet: ${out.quality.length}; Doppelhistorien ${duplicateIds.size}; Trades ${out.trades.base.length}`);

  // AT5: kein Trade mit Rohschluss < 10 am Bestaetigungstag
  const at5Violations = out.trades.base.filter((t) => !(t.rawCloseAtConfirm >= 10)).length;

  // Portfolio-Laeufe
  const cfg = PORTFOLIO_DEFAULTS;
  const runs = {};
  const metricsOf = (run, label) => {
    const eq = run.equity;
    const tr = run.taken.filter((p) => p.returnPct !== undefined).map((p) => ({ result: { returnPct: p.returnPct, sessionsHeld: p.tr.heldSessions } }));
    const m = computeMetrics(eq, tr, spyTR, cfg);
    const sub = SPLIT_PERIODS.map(([a, b]) => ({ from: a, to: b, cagr: cagrBetween(eq, a, b), spy: cagrBetween(spyTR, a, b, 'value') }));
    return { label, cagr: m.cagr, spyCagr: m.benchmarkCagr, excessCagr: m.excessCagr, totalReturn: m.totalReturn, maxDrawdown: m.maxDrawdown, volatility: m.volatility, sharpe: m.sharpe, trades: m.trades, hitRate: m.hitRate, expectancy: m.expectancy, profitFactor: m.profitFactor, exposure: m.exposure, avgHoldingSessions: m.avgHoldingSessions, annualReturns: m.annualReturns, subperiods: sub.map((s) => ({ ...s, excess: s.cagr != null && s.spy != null ? s.cagr - s.spy : null })), skipped: run.skipped.length, taken: run.taken.length, terminalCount: run.book.terminalCount, dividends: run.book.dividends, commissions: run.book.commissions, reconciliation: reconcile(run, cfg) };
  };
  const all = out.trades.base, all2 = out.trades.cost2;
  const surv = all.filter((t) => t.survivor);
  const cal = [...new Set([...calendar, ...all.flatMap((t) => [t.entry.date, ...t.exits.map((x) => x.date)]).filter((d) => d >= W.from && d <= W.to)])].sort();
  for (const sc of ['S0_LAST_PRICE', 'S1_MINUS_30', 'S2_DISTRESS_ZERO']) {
    const r = runPortfolioTR(all, cal, cfg, { scenario: sc });
    runs[sc] = metricsOf(r, sc);
    if (sc === 'S1_MINUS_30') { runs[sc].curveMonthly = r.equity.filter((p, i, a) => i === a.length - 1 || a[i + 1].date.slice(0, 7) !== p.date.slice(0, 7)).map((p) => [p.date, +p.equity.toFixed(2)]); }
  }
  runs.COST2_S1 = metricsOf(runPortfolioTR(all2, cal, cfg, { scenario: 'S1_MINUS_30', slippageBps: 20, commissionBps: 2 }), 'COST2_S1');
  runs.SURVIVORS_ONLY = metricsOf(runPortfolioTR(surv, cal, cfg, { scenario: 'S0_LAST_PRICE' }), 'SURVIVORS_ONLY');
  const seeds = [];
  for (let s = 1; s <= 20; s++) { const m = metricsOf(runPortfolioTR(all, cal, cfg, { scenario: 'S1_MINUS_30', seed: s }), 'SEED_' + s); seeds.push({ seed: s, excessCagr: m.excessCagr, cagr: m.cagr, maxDrawdown: m.maxDrawdown, trades: m.trades }); }
  runs.SEEDS_S1 = seeds;
  log('Portfolio-Läufe fertig');

  // C2: runPortfolioTR ohne Dividenden/Kommission/Delisting == runPortfolio
  const plain = all.filter((t) => !t.terminal || t.terminal.kind === 'OPEN_AT_END');
  const asSignals = plain.map((t) => ({ symbol: t.listingId, signal: { id: t.id, entry: { ...t.entry }, initialStop: t.initialStop, exits: t.exits.map((x) => ({ ...x })) } }));
  const priceOf = (() => { const by = new Map(plain.map((t) => [t.listingId + '|' + t.entry.date, t])); const open = new Map(plain.map((t) => [t.listingId, []])); for (const t of plain) open.get(t.listingId).push(t); return (sym, date) => { for (const t of open.get(sym) || []) { const v = t.marks.get(date); if (v !== undefined) return v; } void by; return undefined; }; })();
  const eng = runPortfolio(asSignals, priceOf, cal, cfg);
  const mine2 = runPortfolioTR(plain, cal, cfg, { commissionBps: 0, dividends: false, sizingSameDay: true, engineCompat: true });
  let c2max = 0; for (let i = 0; i < cal.length; i++) c2max = Math.max(c2max, Math.abs(eng.equity[i].equity / mine2.equity[i].equity - 1));
  // EW-Kurven
  const ewCurve = {};
  for (const [s, a] of Object.entries(ew)) { let v = 1; ewCurve[s] = calendar.map((d, i) => { if (i > 0 && a.cnt[i] > 0) v *= 1 + a.sum[i] / a.cnt[i]; return { date: d, value: v }; }); }
  const ewStats = Object.fromEntries(Object.entries(ewCurve).map(([s, c]) => [s, { cagr: cagrBetween(c, W.from, W.to, 'value'), maxDrawdown: maxDrawdown(c, 'value') }]));

  // Diagnose (explorativ, nicht praeregistriert): alle Engine-Trades gleich
  // gewichtet - trennt die Regel von der Portfolioauswahl. Delisting: S0.
  const slip0 = DEFAULT_EXECUTION.slippageBps / 10000, comm0 = DEFAULT_EXECUTION.commissionBps / 10000;
  const tradeRet = (t) => {
    let proceeds = 0, frac = 0;
    for (const x of t.exits) { proceeds += x.fraction * x.price; frac += x.fraction; }
    if (t.terminal?.kind === 'DELISTED') { const r = t.remainingAtTerminal ?? 1 - frac; proceeds += r * t.terminal.lastClose * (1 - slip0); frac += r; }
    return frac > 0 ? (proceeds / frac) * (1 - comm0) / (t.entry.price * (1 + comm0)) - 1 : null;
  };
  const diag = (list) => {
    const r = list.map(tradeRet).filter(Number.isFinite).sort((a, b) => a - b);
    const mean = r.reduce((a, b) => a + b, 0) / (r.length || 1);
    const byYear = {};
    for (const t of list) { const v = tradeRet(t); if (!Number.isFinite(v)) continue; const y = t.entry.date.slice(0, 4); const b = byYear[y] ||= { n: 0, sum: 0, wins: 0 }; b.n++; b.sum += v; if (v > 0) b.wins++; }
    const byExit = {};
    for (const t of list) { const k = t.terminal ? t.terminal.kind : t.exits[t.exits.length - 1].ruleId; const v = tradeRet(t); const b = byExit[k] ||= { n: 0, sum: 0 }; b.n++; b.sum += v; }
    const rawBand = {};
    for (const t of list) { const c = t.rawCloseAtConfirm; const k = c < 20 ? '10-20' : c < 50 ? '20-50' : c < 100 ? '50-100' : '100+'; const v = tradeRet(t); const b = rawBand[k] ||= { n: 0, sum: 0 }; b.n++; b.sum += v; }
    return { n: r.length, mean, median: r[Math.floor(r.length / 2)], hitRate: r.filter((x) => x > 0).length / (r.length || 1), p05: r[Math.floor(r.length * 0.05)], p95: r[Math.floor(r.length * 0.95)],
      byYear: Object.fromEntries(Object.entries(byYear).map(([y, b]) => [y, { n: b.n, mean: b.sum / b.n, hit: b.wins / b.n }])),
      byExit: Object.fromEntries(Object.entries(byExit).map(([k, b]) => [k, { n: b.n, mean: b.sum / b.n }])),
      byRawPrice: Object.fromEntries(Object.entries(rawBand).map(([k, b]) => [k, { n: b.n, mean: b.sum / b.n }])) };
  };
  const diagnostics = { allTrades: diag(all), survivorTrades: diag(surv), delistedListingTrades: diag(all.filter((t) => !t.survivor)), takenS0: null };
  {
    const r = runPortfolioTR(all, cal, cfg, { scenario: 'S0_LAST_PRICE' });
    diagnostics.takenS0 = diag(r.taken.map((p) => p.tr));
    diagnostics.maxPositionsSkipped = r.skipped.filter((x) => x.reason === 'MAX_POSITIONS').length;
    diagnostics.avgPositionPct = r.taken.reduce((a, p) => a + p.cost, 0) / r.taken.length / cfg.initialEquity;
  }

  // C3: 20 Zufallstrades unabhaengig aus Rohbalken nachrechnen
  const pick = [...all].filter((t) => !t.terminal).sort((a, b) => L.sha256(a.id).localeCompare(L.sha256(b.id))).slice(0, 20);
  const c3 = [];
  for (const t of pick) {
    const baseId = t.listingId.split('#')[0];
    const m = members.find((x) => x.l.id === baseId);
    let raw = rawById.get(baseId);
    if (!raw) { const s = await main.getSeries(m.l.ticker); raw = rawFromStoreBars(s.bars).filter((b) => b.date >= m.l.startDate); }
    const seg = L.splitSegments(raw.filter((b) => b.date <= (m.l.listEnd || W.to))).find((sg) => sg.some((b) => b.date === t.entry.date));
    if (seg) raw = seg;
    c3.push(verifyTrade(t, raw));
  }
  // C4: Ankerfaelle
  const anchors = ['TWX', 'CELG', 'MON', 'SHLD', 'JCP', 'HTZ', 'CHK', 'WFT', 'FTR', 'DO'];
  const c4 = listings.filter((l) => anchors.includes(l.ticker)).map((l) => { const e = manifest[l.id] || {}; const q = out.quality.find((x) => x.id === l.id) || {}; const tt = all.filter((t) => t.listingId.split('#')[0] === l.id); return { id: l.id, source: l.source, status: e.status || (l.source === 'STORE_ACTIVE' ? 'STORE' : null), cls: e.cls || l.storeClass, listEnd: l.listEnd, last: q.last || null, lastVsListEndDays: q.lastVsListEndDays ?? null, distress: q.distress ?? null, pinned: q.pinned ?? null, trades: tt.length, openAtDelisting: tt.filter((t) => t.terminal?.kind === 'DELISTED').length }; });
  // C5: extremste Trades (S0) mit Split-Kontrolle
  const r0 = runPortfolioTR(all, cal, cfg, { scenario: 'S0_LAST_PRICE' });
  const ext = r0.taken.filter((p) => p.returnPct !== undefined).sort((a, b) => Math.abs(b.returnPct) - Math.abs(a.returnPct)).slice(0, 10).map((p) => ({ id: p.tr.id, returnPct: p.returnPct, entry: p.tr.entry, exits: p.tr.exits, terminal: p.tr.terminal ? { ...p.tr.terminal } : null, rawCloseAtConfirm: p.tr.rawCloseAtConfirm }));

  // Abdeckung je Endjahr / Status
  const coverage = {};
  for (const l of listings) {
    if (l.active) continue;
    const y = l.listEnd.slice(0, 4); if (y < '2015') continue;
    const e = manifest[l.id];
    const c = coverage[y] ||= { ended: 0, byStatus: {}, includedFetched: 0, includedOk: 0, unfetchableReused: 0, unfetchablePlain: 0 };
    c.ended++;
    const st = l.source === 'UNFETCHABLE_REUSED' ? (e?.status === 'OK' || e?.status === 'PARTIAL' ? e.status : 'UNFETCHABLE_REUSED') : (e?.status || 'NOT_FETCHED');
    c.byStatus[st] = (c.byStatus[st] || 0) + 1;
    if (e?.included && (e.status === 'OK' || e.status === 'PARTIAL')) { c.includedFetched++; if (e.status === 'OK') c.includedOk++; }
    if (st === 'UNFETCHABLE_REUSED') { c.unfetchableReused++; if (l.plainTicker) c.unfetchablePlain++; }
  }

  const result = {
    schema: 'supertrader-validation-result-1.0.0', at: new Date().toISOString(), prereg: L.PREREG_VERSION, tableHash: hash,
    commit: process.env.GITHUB_SHA || null, strategy: { id: donchian.id, version: donchian.version, params: donchian.PARAMS, adapter: 'rawPriceGate' }, execution: DEFAULT_EXECUTION, portfolio: cfg,
    counts: { listings: listings.length, bySource: count(listings, (l) => l.source), members: members.length, processed: out.quality.filter((q) => !q.skipped).length, skipped: count(out.quality.filter((q) => q.skipped), (q) => q.skipped), duplicates: duplicateIds.size, droppedOutsideWindow: out.droppedOutside, manifestByStatus: count(Object.values(manifest), (e) => e.status), manifestByClass: count(Object.values(manifest), (e) => e.cls || 'BENCH') },
    coverage, universeYear,
    qualitySummary: summarizeQuality(out.quality),
    at5Violations,
    runs, ew: ewStats, spy: { cagr: cagrBetween(spyTR, W.from, W.to, 'value'), maxDrawdown: maxDrawdown(spyTR, 'value') },
    controls: { C2maxRelDiff: c2max, C3: c3, C4: c4, C5: ext },
    diagnostics,
    duplicatesSample: out.duplicates.slice(0, 30),
    seriesBreaks: { count: out.seriesBreaks.length, sample: out.seriesBreaks.slice(0, 40) },
    budget: budget.spent,
  };
  if (!LIMIT) {
    const sp = budget.spent, u = await mine.readUsage();
    await mine.writeUsage(Guard.applyUsage(u, { classAOperations: sp.classA + 1, classBOperations: sp.classB, bytesDownloaded: sp.bytesDownloaded, run: { at: new Date().toISOString(), kind: 'VALIDATION_ANALYZE', classB: sp.classB } }));
  }
  const pem = fs.readFileSync(path.join(root, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  const sealed = L.encryptForOwner(pem, Buffer.from(JSON.stringify(result)));
  fs.writeFileSync(path.join(OUT_DIR, LIMIT ? 'analyze-smoke.sealed.json' : 'analyze.sealed.json'), sealed);
  log(`Verschlüsseltes Ergebnis geschrieben (${sealed.length} Byte)`);
}

function count(arr, f) { const o = {}; for (const x of arr) { const k = f(x); o[k] = (o[k] || 0) + 1; } return o; }

function summarizeQuality(qs) {
  const ok = qs.filter((q) => !q.skipped);
  const del = ok.filter((q) => q.delisted && !q.segEnd);
  const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
  const miss = ok.map((q) => (q.expectedDays ? q.missingDays / q.expectedDays : 0));
  const byEndYear = {};
  for (const q of del) { const y = q.endYear; const b = byEndYear[y] ||= { n: 0, distress: 0, pinned: 0, other: 0, endWithin7: 0, missingOver5pct: 0 }; b.n++; if (q.distress) b.distress++; else if (q.pinned) b.pinned++; else b.other++; if (Math.abs(q.lastVsListEndDays ?? 99) <= 7) b.endWithin7++; if (q.expectedDays && q.missingDays / q.expectedDays > 0.05) b.missingOver5pct++; }
  return {
    series: ok.length, delisted: del.length,
    missingShare: { p50: pct(miss, 0.5), p90: pct(miss, 0.9), p99: pct(miss, 0.99), over5pct: miss.filter((x) => x > 0.05).length },
    haltsOver5Days: ok.filter((q) => q.maxMissingRun > 5).length,
    splits: ok.reduce((a, q) => a + q.splits, 0), splitChecks: ok.reduce((a, q) => a + q.splitChecks, 0), splitChecksOk: ok.reduce((a, q) => a + q.splitChecksOk, 0), splitChecksNA: ok.reduce((a, q) => a + q.splitChecksNA, 0),
    dividendEvents: ok.reduce((a, q) => a + q.dividends, 0), seriesWithDividends: ok.filter((q) => q.dividends > 0).length,
    extremeMoves: ok.reduce((a, q) => a + q.extremeMoves, 0), seriesWithExtremeMoves: ok.filter((q) => q.extremeMoves > 0).length,
    zeroVolumeDays: ok.reduce((a, q) => a + q.zeroVolume, 0),
    delistedEnd: { within7: del.filter((q) => Math.abs(q.lastVsListEndDays ?? 99) <= 7).length, over30: del.filter((q) => Math.abs(q.lastVsListEndDays ?? 99) > 30).length, distress: del.filter((q) => q.distress).length, pinned: del.filter((q) => !q.distress && q.pinned).length },
    byEndYear,
  };
}

// C3 - unabhaengige Nachrechnung eines Trades aus Rohbalken (eigener Code,
// nicht die Engine): Bestaetigung, Einstieg, Stop, Ausstieg.
export function verifyTrade(t, raw) {
  const a = L.adjustSeries(raw);
  const i = a.date.indexOf(t.entry.date);
  const c = i - 1;
  const res = { id: t.id, checks: {} };
  if (i < 21) { res.checks.located = false; return res; }
  let hh = -Infinity; for (let j = c - 20; j <= c - 1; j++) hh = Math.max(hh, a.high[j]);
  res.checks.confirmCloseAboveChannel = a.close[c] > hh;
  res.checks.confirmDate = a.date[c] === t.confirmDate;
  res.checks.rawPriceGate = raw[c].close >= 10;
  const slip = DEFAULT_EXECUTION.slippageBps / 10000;
  res.checks.entryPrice = Math.abs(a.open[i] * (1 + slip) / t.entry.price - 1) < 1e-6;
  let trs = 0; for (let j = c - 19; j <= c; j++) { const pc = a.close[j - 1]; trs += Math.max(a.high[j] - a.low[j], Math.abs(a.high[j] - pc), Math.abs(a.low[j] - pc)); }
  const stop = a.open[i] - 2 * (trs / 20);
  res.checks.stop = Math.abs(stop / t.initialStop - 1) < 1e-6;
  // Ausstieg: erster Tag mit Tief <= Stop (Fuellung min(stop, open) - Slippage) oder
  // Schluss unter 10-Tage-Tief der Vortage -> naechste Eroeffnung.
  let exit = null;
  for (let j = i; j < a.date.length && !exit; j++) {
    if (a.low[j] <= stop) { exit = { date: a.date[j], price: Math.min(stop, j === i ? stop : a.open[j]) * (1 - slip), rule: 'STOP' }; if (j === i) exit.price = stop * (1 - slip); break; }
    if (j > i) { let ll = Infinity; for (let k = j - 10; k <= j - 1; k++) ll = Math.min(ll, a.low[k]); if (a.close[j] < ll && j + 1 < a.date.length) { const k = j + 1; if (a.low[k] <= stop && a.open[k] < stop) exit = { date: a.date[k], price: a.open[k] * (1 - slip), rule: 'EXIT_GAP' }; else exit = { date: a.date[k], price: a.open[k] * (1 - slip), rule: 'EXIT' }; } }
  }
  const x = t.exits[t.exits.length - 1];
  res.checks.exitDate = !!exit && exit.date === x.date;
  res.checks.exitPrice = !!exit && Math.abs(exit.price / x.price - 1) < 1e-6;
  res.ok = Object.values(res.checks).every(Boolean);
  return res;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
