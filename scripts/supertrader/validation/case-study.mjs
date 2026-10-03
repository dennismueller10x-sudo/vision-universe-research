#!/usr/bin/env node
// Supertrader R10 - Fallpruefung grosser Gewinner und aehnlicher Fehlkandidaten
// (PREREGISTRATION-R10-CASES.json, vor Auswahl und Analyse eingefroren).
//
//   node scripts/supertrader/validation/case-study.mjs --out DIR [--limit N]
//
// 1. Point-in-Time-Universum wie analyze-methods (privater Eimer, inkl. delisteter).
// 2. Fallauswahl nach Protokoll: SMCI + je Startjahr Gewinner (gelistet/delistet),
//    Fehlkandidaten am selben Stichtag; Ranguebernaechste als versiegelte Pruefmenge.
// 3. Fuenf Live-Methoden unveraendert ueber alle Reihen, Methodenportfolio S0.
// 4. Je Diagnosefall und Methode die Kette Daten -> Kandidat -> Einstieg -> Portfolio
//    -> Ausstieg mit Tagesspur; SMCI als vollstaendige Zeitlinie.
// Spaetere Renditen nur fuer die Auswahl. Ergebnis nur verschluesselt, Log nur Zaehlwerte.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import * as L from './lib.mjs';
import { loadPitData, segCtx, tradesFor, rawGate, portfolioOf } from './analyze-methods.mjs';
import { runPortfolioTR } from './portfolio.mjs';
import { DEFAULT_EXECUTION } from '../engine/execution.mjs';
import { simulate } from '../engine/simulator.mjs';
import { computeIndicators } from '../engine/indicators.mjs';
import kk31 from '../engine/strategies/kk-breakout-v31.mjs';
import weinstein3 from '../engine/strategies/weinstein-v3.mjs';
import darvas3 from '../engine/strategies/darvas-v3.mjs';
import minervini2 from '../engine/strategies/minervini-v2.mjs';
import donchian2 from '../engine/strategies/donchian-v2.mjs';
import { trendTemplate } from '../engine/strategies/minervini.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const PREREG = 'supertrader-validation-prereg-r10-cases-1.0.0';
export const ENGINES = [kk31, weinstein3, darvas3, minervini2, donchian2];
const keyOf = (e) => `${e.id}@${e.version}`;
const tickerOf = (id) => String(id).split(':')[2];
const H = 252, MIN_GAIN = 3.0, PRE = 63;
const YEARS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];

// Warum liefert ein Scan null? Die Engines verbergen fruehe Ausschluesse; hier werden
// dieselben Pruefungen in derselben Reihenfolge nachgerechnet (nur Diagnose).
export function explainNull(e, ctx, t) {
  const p = e.PARAMS, { bars, ind, cross } = ctx, out = [];
  if (!(ctx.raw.close[t] >= p.minPrice)) out.push('RAW_PRICE');
  if (!(ind.dollarVol20[t] >= p.minDollarVolume)) out.push('LIQ_DOLLAR_VOLUME');
  if (p.minAdr != null && !(ind.adr20[t] >= p.minAdr)) out.push('LIQ_ADR');
  if (e.id === 'MOMENTUM_BREAKOUT') { const v = [cross.mom21?.[t], cross.mom63?.[t], cross.mom126?.[t]].filter(Number.isFinite); if (!(v.length && Math.max(...v) >= p.momentumPercentile)) out.push('KK-BO-MOM-01'); }
  if (e.id === 'DARVAS_BOX') { const hi = ind.high252[t]; if (!(bars.close[t] >= p.nearHighPct * hi)) out.push('DAR-MOM-01'); const m = cross.mom126?.[t]; if (!(m >= p.momentumPercentile)) out.push('DAR-MOM-02'); }
  if (e.id === 'MINERVINI_VCP') { if (t < 252) out.push('HISTORY_252'); else { const tt = trendTemplate(ctx, t, p); for (const [k, v] of Object.entries(tt.rules)) if (!v) out.push(k); } }
  if (e.id === 'WEINSTEIN_STAGE') out.push('WEIN-NO-STAGE');
  if (e.id === 'DONCHIAN_TURTLE') out.push('DON-NOT-NEAR-CHANNEL');
  return out.length ? out : ['UNEXPLAINED'];
}

// SIC-Division aus SIC-Code (SEC-Divisionsgrenzen).
export function sicDivision(sic) {
  const s = Number(sic);
  if (!Number.isFinite(s)) return null;
  const div = [[100, 999, 'A'], [1000, 1499, 'B'], [1500, 1799, 'C'], [2000, 3999, 'D'], [4000, 4999, 'E'], [5000, 5199, 'F'], [5200, 5999, 'G'], [6000, 6799, 'H'], [7000, 8999, 'I'], [9100, 9999, 'J']];
  for (const [a, b, d] of div) if (s >= a && s <= b) return d;
  return null;
}

function loadSic() {
  const dir = path.join(root, 'quant/data/fundamentals/issuers');
  const out = new Map();
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const i of d.issuers || []) for (const t of i.tickers || []) if (!out.has(t)) out.set(t, { sic: i.sic, cik: i.cik, quarterly: i.quarterlyPeriods ?? null, first: i.firstPeriodEnd ?? null });
  }
  return out;
}

// Gleitendes Maximum der folgenden H Schluesse (ohne t selbst).
export function forwardMax(close) {
  const n = close.length, out = new Float64Array(n).fill(NaN), at = new Int32Array(n).fill(-1);
  const dq = [];
  for (let t = n - 1; t >= 0; t--) {
    // Fenster (t, t+H]
    while (dq.length && dq[0] > t + H) dq.shift();
    if (dq.length) { out[t] = close[dq[0]]; at[t] = dq[0]; }
    if (Number.isFinite(close[t])) { while (dq.length && close[dq[dq.length - 1]] <= close[t]) dq.pop(); dq.push(t); }
  }
  return { max: out, at };
}

// Episoden je Segment und Startjahr (W1).
export function episodesOf(seg, a, ind) {
  const { max, at } = forwardMax(a.close);
  const best = new Map();
  for (let t = 0; t < a.date.length; t++) {
    const y = Number(a.date[t].slice(0, 4));
    if (!YEARS.includes(y) && !(seg.forceAnyYear)) continue;
    if (!(a.rawClose[t] >= 5) || !(ind.dollarVol20[t] >= 5e6) || !Number.isFinite(max[t])) continue;
    const g = max[t] / a.close[t] - 1;
    const k = seg.forceAnyYear ? 0 : y;
    if (!best.has(k) || g > best.get(k).gain) best.set(k, { year: y, t0: t, t1: at[t], gain: g, start: a.date[t], peak: a.date[at[t]] });
  }
  return [...best.values()];
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  const OUT = arg('--out', path.join(os.tmpdir(), 'r10-cases'));
  const LIMIT = Number(arg('--limit', '0'));
  fs.mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();
  const log = (m) => console.log(`[cases +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
  const sicMap = loadSic();
  const { segs, bench, calendar, budget, mine } = await loadPitData({ LIMIT, log });

  // 2. Auswahl
  const info = new Map();
  const eps = [];
  const dateIdx = new Map();
  for (let si = 0; si < segs.length; si++) {
    const seg = segs[si];
    const a = L.adjustSeries(seg.raw);
    const ind = computeIndicators({ date: a.date, open: a.open, high: a.high, low: a.low, close: a.close, volume: a.volume });
    seg.sel = { c: Float32Array.from(a.close), r: Float32Array.from(a.rawClose), h: Float32Array.from(ind.high252) };
    for (let t = 0; t < a.date.length; t++) if (!dateIdx.has(a.date[t])) dateIdx.set(a.date[t], seg.dIdx[t]);
    const tk = tickerOf(seg.id);
    const sic = seg.delisted ? null : sicMap.get(tk) || null;
    info.set(seg.id, { si, ticker: tk, sicDiv: sic ? sicDivision(sic.sic) : null, sic: sic?.sic ?? null, cik: sic?.cik ?? null, delisted: !!seg.delisted });
    if (tk === 'SMCI' && !seg.delisted) { const e = episodesOf({ forceAnyYear: true }, a, ind)[0]; if (e) eps.push({ ...e, seg: seg.id, smci: true }); }
    for (const e of episodesOf(seg, a, ind)) if (e.gain >= MIN_GAIN) eps.push({ ...e, seg: seg.id });
  }
  log(`Episoden >= 300 %: ${eps.filter((e) => !e.smci).length}`);
  const used = new Set();
  const pick = (list, rankWanted, year) => {
    const out = [];
    for (const cls of ['SURVIVOR', 'DELISTED']) {
      const c = list.filter((e) => e.year === year && (cls === 'DELISTED') === info.get(e.seg).delisted).sort((x, y) => y.gain - x.gain || L.sha256(x.seg).localeCompare(L.sha256(y.seg)));
      let rank = 0;
      for (const e of c) {
        if (used.has(e.seg)) continue;
        const div = info.get(e.seg).sicDiv;
        if (div && out.some((o) => o.year === year && info.get(o.seg).sicDiv === div)) continue;
        rank++;
        if (rank === rankWanted) { out.push({ ...e, cls }); used.add(e.seg); break; }
      }
    }
    return out;
  };
  const smci = eps.find((e) => e.smci);
  if (smci) used.add(smci.seg);
  const winners = [], holdout = [];
  const regular = eps.filter((e) => !e.smci);
  for (const y of YEARS) winners.push(...pick(regular, 1, y));
  // Rang 2 erst nach allen Diagnosefaellen, damit Rang 1 unabhaengig bleibt.
  const usedDiag = new Set(used);
  for (const y of YEARS) { const r = []; for (const cls of ['SURVIVOR', 'DELISTED']) { const c = regular.filter((e) => e.year === y && (cls === 'DELISTED') === info.get(e.seg).delisted && !usedDiag.has(e.seg)).sort((x, z) => z.gain - x.gain || L.sha256(x.seg).localeCompare(L.sha256(z.seg))); for (const e of c) { const div = info.get(e.seg).sicDiv; if (div && r.some((o) => info.get(o.seg).sicDiv === div)) continue; r.push({ ...e, cls }); used.add(e.seg); break; } } holdout.push(...r); }
  if (smci) winners.unshift({ ...smci, cls: 'SMCI' });
  log(`Gewinner Diagnose ${winners.length}, Pruefmenge ${holdout.length}`);

  // F1/F2 Fehlkandidaten (Querschnittsdaten aus loadPitData: seg.cross.rs)
  const idxOf = (seg, d) => { const mi = dateIdx.get(d); if (mi === undefined) return -1; let lo = 0, hi = seg.dIdx.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (seg.dIdx[m] === mi) return m; if (seg.dIdx[m] < mi) lo = m + 1; else hi = m - 1; } return -1; };
  const strongAt = (seg, d) => {
    const t = idxOf(seg, d); if (t < 0) return null;
    const rs = seg.cross.rs[t], x = seg.sel;
    return x.r[t] >= 5 && x.c[t] >= 0.85 * x.h[t] && rs >= 90 ? { t, rs } : null;
  };
  const byDate = new Map();
  const lookDate = (w) => {
    const seg = segs[info.get(w.seg).si];
    for (let t = w.t0; t <= w.t1; t++) if (strongAt(seg, seg.raw[t].date)) return seg.raw[t].date;
    return seg.raw[Math.min(w.t0 + 21, seg.raw.length - 1)].date;
  };
  const usedL = new Set();
  const matchLoser = (w) => {
    const d = lookDate(w); w.lookDate = d;
    const div = info.get(w.seg).sicDiv;
    let cands = byDate.get(d);
    if (!cands) {
      cands = [];
      for (const seg of segs) {
        if (seg.raw[0].date > d || seg.raw[seg.raw.length - 1].date < d) continue;
        const s = strongAt(seg, d); if (!s) continue;
        const c = seg.sel.c, n = c.length; const end = Math.min(n - 1, s.t + H);
        let lo = Infinity; for (let i = s.t + 1; i <= end; i++) lo = Math.min(lo, c[i]);
        const delistedSoon = seg.delisted && n - 1 - s.t <= H && c[n - 1] < c[s.t];
        if (lo <= 0.5 * c[s.t] || delistedSoon) cands.push({ seg: seg.id, rs: s.rs, minRatio: lo / c[s.t], delistedSoon });
      }
      byDate.set(d, cands);
    }
    const pool = cands.filter((c) => c.seg !== w.seg && !usedL.has(c.seg) && !used.has(c.seg));
    const same = div ? pool.filter((c) => info.get(c.seg).sicDiv === div) : [];
    const p = (same.length ? same : pool).sort((x, y) => y.rs - x.rs || L.sha256(x.seg).localeCompare(L.sha256(y.seg)))[0];
    if (p) usedL.add(p.seg);
    return p ? { ...p, lookDate: d, sameDivision: same.length > 0, forWinner: w.seg } : { none: true, lookDate: d, forWinner: w.seg };
  };
  const losers = winners.map(matchLoser);
  const holdoutLosers = holdout.map(matchLoser);
  log(`Fehlkandidaten ${losers.filter((x) => !x.none).length}/${winners.length}, Pruefmenge ${holdoutLosers.filter((x) => !x.none).length}/${holdout.length}`);
  for (const seg of segs) delete seg.sel;

  // 3. Methoden ueber alle Reihen + Spur fuer Diagnosefaelle
  const caseSegs = new Map();
  for (const w of winners) caseSegs.set(w.seg, { role: 'WINNER', w });
  for (const l of losers) if (!l.none) caseSegs.set(l.seg, { role: 'LOSER', l, w: winners.find((x) => x.seg === l.forWinner) });
  const allTrades = Object.fromEntries(ENGINES.map((e) => [keyOf(e), []]));
  const traces = {};
  let k = 0;
  for (const seg of segs) {
    const ctx = segCtx(seg, bench);
    const cs = caseSegs.get(seg.id);
    for (const e of ENGINES) {
      allTrades[keyOf(e)].push(...tradesFor(e, seg, ctx, DEFAULT_EXECUTION));
      if (!cs) continue;
      const d = ctx.bars.date;
      const ref = cs.role === 'WINNER' ? cs.w : { t0: d.indexOf(cs.l.lookDate), t1: Math.min(d.length - 1, d.indexOf(cs.l.lookDate) + H) };
      const ws = cs.role === 'WINNER' ? d.indexOf(cs.w.start) : ref.t0;
      const we = cs.role === 'WINNER' ? d.indexOf(cs.w.peak) : ref.t1;
      const from = Math.max(0, ws - PRE);
      const g = rawGate(e);
      const days = [];
      for (let t = from; t <= we; t++) {
        const r = g.scan(ctx, t, { ...e.PARAMS, minPrice: 0 }, {});
        if (r === undefined) continue; // Wochenmethode ohne Wochenentscheidung
        const rawOk = ctx.raw.close[t] >= e.PARAMS.minPrice;
        days.push([d[t], r ? r.stage : (rawOk ? null : 'RAW_GATE'), r && r.rules ? Object.entries(r.rules).filter(([, v]) => !v).map(([x]) => x) : explainNull(e, ctx, t), seg.cross.rs?.[t] ?? null, ctx.bars.close[t]]);
      }
      const startIdx = d.findIndex((x) => x >= L.WINDOW.from);
      const sim = simulate(g, ctx, { from: startIdx, exec: DEFAULT_EXECUTION, params: { ...e.PARAMS, minPrice: 0 }, ...(e.simOpts || {}) });
      const sigs = [...sim.finished, ...(sim.state.signal ? [sim.state.signal] : [])]
        .filter((s) => { const a0 = s.transitions[0]?.date, a1 = s.transitions[s.transitions.length - 1]?.date; return a1 >= d[from] && a0 <= d[we]; })
        .map((s) => ({ id: s.id, created: s.createdAt, state: s.state, trigger: s.levels?.trigger ?? null, entry: s.entry ? { date: s.entry.date, price: s.entry.price } : null, initialStop: s.initialStop ?? null,
          exits: (s.exits || []).map((x) => [x.date, x.price, x.fraction, x.ruleId]), transitions: s.transitions.map((x) => [x.date, x.state, x.ruleId, x.note || null]) }));
      (traces[seg.id] ||= {})[keyOf(e)] = { window: [d[from], d[we]], episode: [d[ws], d[we]], days, signals: sigs,
        gaps: (() => { let g2 = 0; for (let t = from + 1; t <= we; t++) if (!Number.isFinite(ctx.bars.close[t])) g2++; return g2; })(),
        segEnd: d[d.length - 1], closeAt: { start: ctx.bars.close[ws], peak: ctx.bars.close[we] } };
    }
    if (++k % 2000 === 0) log(`simuliert ${k}/${segs.length}`);
  }
  log('Simulation fertig: ' + ENGINES.map((e) => `${keyOf(e)} ${allTrades[keyOf(e)].length}`).join(', '));

  // 4. Methodenportfolio S0
  const portfolios = {};
  for (const e of ENGINES) {
    const cfg = portfolioOf(e);
    const all = allTrades[keyOf(e)];
    const cal = [...new Set([...calendar, ...all.flatMap((t) => [t.entry.date, ...t.exits.map((x) => x.date)]).filter((dd) => dd >= L.WINDOW.from && dd <= L.WINDOW.to)])].sort();
    const run = runPortfolioTR(all, cal, cfg, { scenario: 'S0_LAST_PRICE' });
    const takenById = new Map(run.taken.map((p) => [p.tr.id, p]));
    const skippedById = new Map(run.skipped.map((x) => [x.id, x]));
    const sameDay = new Map(); for (const t of all) (sameDay.get(t.entry.date) || sameDay.set(t.entry.date, []).get(t.entry.date)).push(t.listingId);
    for (const v of sameDay.values()) v.sort();
    const openAt = (date) => run.taken.filter((p) => p.tr.entry.date < date && (p.tr.exits.length ? p.tr.exits[p.tr.exits.length - 1].date >= date : true)).map((p) => p.tr.listingId);
    portfolios[keyOf(e)] = { cfg: { riskPerTrade: cfg.riskPerTrade, maxPositionPct: cfg.maxPositionPct, maxPositions: cfg.maxPositions, progressive: cfg.progressive || null }, taken: run.taken.length, skipped: run.skipped.length,
      skippedReasons: run.skipped.reduce((a, x) => ((a[x.reason] = (a[x.reason] || 0) + 1), a), {}),
      cases: Object.fromEntries([...caseSegs.keys()].map((sid) => [sid, all.filter((t) => t.listingId === sid).map((t) => {
        const p = takenById.get(t.id), s = skippedById.get(t.id);
        return { id: t.id, entry: t.entry, initialStop: t.initialStop, exits: t.exits, terminal: t.terminal ? { kind: t.terminal.kind, date: t.terminal.date } : null,
          taken: !!p, skipReason: s?.reason || null, weightAtEntry: p ? (p.entryShares * t.entry.price) / p.eqAtEntry : null, riskAtEntry: p ? ((t.entry.price - t.initialStop) * p.entryShares) / p.eqAtEntry : null,
          returnPct: p?.returnPct ?? null, sameDayRank: (sameDay.get(t.entry.date) || []).indexOf(sid) + 1, sameDayCount: (sameDay.get(t.entry.date) || []).length,
          openPositionsAtEntry: s ? openAt(t.entry.date).length : null };
      })])) };
  }
  log('Portfolios fertig: ' + ENGINES.map((e) => `${keyOf(e)} aufgenommen ${portfolios[keyOf(e)].taken}, ohne Platz ${portfolios[keyOf(e)].skipped}`).join(' | '));

  // Fundamentaldaten (SEC-Factbook, Stand <= Stichtag)
  const fundamentals = {};
  try {
    const { createS3DriverFromEnv } = await import(path.join(root, 'scripts/market/storage/s3-driver.mjs'));
    const driver = createS3DriverFromEnv(process.env);
    for (const [sid, c] of caseSegs) {
      const i = info.get(sid); const asOf = c.role === 'WINNER' ? (c.w.lookDate || c.w.start) : c.l.lookDate;
      if (!i.cik) { fundamentals[sid] = { available: false, reason: i.delisted ? 'DELISTED_NO_SEC_MAPPING' : 'NO_SEC_ISSUER' }; continue; }
      budget.consumeClassB(1, 'GET factbook');
      const buf = await driver.get(`v1/sec/fundamentals/facts/${i.cik}.json.gz`);
      if (!buf) { fundamentals[sid] = { available: false, reason: 'FACTBOOK_MISSING' }; continue; }
      const doc = JSON.parse(zlib.gunzipSync(buf).toString('utf8'));
      const pick = (metric) => (doc.factbook?.timelines || []).filter((x) => x.metric === metric && /^Q[1-4]$/.test(x.fiscal_period)).map((x) => {
        const o = (x.observations || []).filter((ob) => (ob.available_from || ob.filed) <= asOf).sort((p, q) => String(p.available_from || p.filed).localeCompare(String(q.available_from || q.filed)))[0];
        return o ? { fy: x.fiscal_year, fp: x.fiscal_period, end: o.period_end, value: o.value, availableFrom: o.available_from || o.filed } : null;
      }).filter(Boolean).sort((p, q) => String(p.end).localeCompare(String(q.end)));
      const yoy = (rows) => rows.slice(-4).map((r) => { const prev = rows.find((x) => x.fp === r.fp && x.fy === r.fy - 1); return { fy: r.fy, fp: r.fp, end: r.end, availableFrom: r.availableFrom, value: r.value, prior: prev?.value ?? null, growth: prev && prev.value > 0 ? r.value / prev.value - 1 : null }; });
      fundamentals[sid] = { available: true, asOf, sic: i.sic, eps: yoy(pick('eps_diluted')), revenue: yoy(pick('revenue')) };
    }
  } catch (e) { log('Fundamentaldaten: ' + String(e?.message || e).slice(0, 80)); }
  log(`Fundamentaldaten vorhanden ${Object.values(fundamentals).filter((x) => x.available).length}/${caseSegs.size}`);

  const brief = (e) => ({ seg: e.seg, ticker: info.get(e.seg).ticker, cls: e.cls, year: e.year, start: e.start, peak: e.peak, gain: e.gain, sicDiv: info.get(e.seg).sicDiv, delisted: info.get(e.seg).delisted, lookDate: e.lookDate || null });
  const result = { schema: 'supertrader-case-study-1.0.0', prereg: PREREG, at: new Date().toISOString(), commit: process.env.GITHUB_SHA || null, limit: LIMIT || null,
    selection: { episodes: eps.filter((e) => !e.smci).length, winners: winners.map(brief), losers, holdout: { winners: holdout.map(brief), losers: holdoutLosers } },
    caseInfo: Object.fromEntries([...caseSegs.keys()].map((sid) => [sid, info.get(sid)])),
    traces, portfolios, fundamentals };
  const pem = fs.readFileSync(path.join(root, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  fs.writeFileSync(path.join(OUT, `case-study${LIMIT ? '-smoke' : ''}.sealed.json`), L.encryptForOwner(pem, Buffer.from(JSON.stringify(result))));
  log('Verschluesseltes Ergebnis geschrieben');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
