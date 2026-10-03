#!/usr/bin/env node
// Supertrader R14 - unabhaengiger Red-Team-Audit (PREREGISTRATION-R14.json).
// Keine Live-Aenderung. Je Live-Methode (exakte Live-Konfiguration):
//   Exposition (Verteilung, Positionszahl, Zerlegung des ungenutzten Kapitals),
//   Ebenen A (real vs. SPY), B (investiertes Kapital: tradegleich, zeitgewichtet, CAPM), C (Allokation ohne Hebel),
//   Signalqualitaet aller Engine-Einstiege (vs. SPY, liquides Universum, RS-Dezil), Exit-Audit, verpasste Gewinner,
//   groesste Fehlkandidaten, Portfolio-Konstruktion (Reihenfolgen, genommen vs. abgewiesen), Regime, Kosten,
//   Handelbarkeit, Fundamental-PIT. Gleicher Code fuer DEV und HOLDOUT (ST_WINDOW=HOLDOUT).
// Ausgabe nur verschluesselt; Log nur Zaehlwerte.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import * as L from './lib.mjs';
import { loadPitData, segCtx, tradesFor, rawGate } from './analyze-methods.mjs';
import { runPortfolioTR, cagrBetween, maxDrawdown, marketOkMap } from './portfolio.mjs';
import { holdTrades } from './audit-r13.mjs';
import { explainNull, forwardMax } from './case-study.mjs';
import { portfolioConfig } from '../model-portfolio.mjs';
import { DEFAULT_EXECUTION } from '../engine/execution.mjs';
import kk32 from '../engine/strategies/kk-breakout-v32.mjs';
import weinstein4 from '../engine/strategies/weinstein-v4.mjs';
import darvas302 from '../engine/strategies/darvas-v302.mjs';
import minervini2 from '../engine/strategies/minervini-v2.mjs';
import minervini3 from '../engine/strategies/minervini-v3.mjs';
import don202 from '../engine/strategies/donchian-v202.mjs';
import { simulateRotation } from '../engine/rotation-52w.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const W = L.WINDOW;
export const PREREG_R14 = 'supertrader-validation-prereg-r14-1.0.0';
const EXEC2 = { ...DEFAULT_EXECUTION, slippageBps: 20, commissionBps: 2 };
export const H = [5, 10, 20, 40, 60, 120, 252];
const POST = [20, 60, 120, 252];
const HOLDS = [63, 126, 252];
const SLIP = 10 / 1e4, COMM = 1 / 1e4;
const live = (e) => ({ ...e, portfolio: portfolioConfig(e) });
export const ENGINES_R14 = [live(kk32), live(weinstein4), live(darvas302), live(minervini2), live(don202)];
const keyOf = (e) => `${e.id}@${e.version}`;
const YEARS = W === L.WINDOWS.HOLDOUT ? [['2008', '2008'], ['2009', '2009'], ['2010-2011', '2010', '2011'], ['2012-2013', '2012', '2013'], ['2014-2015', '2014', '2015']]
  : [['2016-2019', '2016', '2019'], ['2020', '2020'], ['2021', '2021'], ['2022', '2022'], ['2023', '2023'], ['2024', '2024'], ['2025', '2025'], ['2026', '2026']];
const CONTEXT_ETFS = ['RSP', 'QQQ', 'IWM', 'IWV', 'IWF', 'IWO', 'MDY', 'IJR', 'IEF', 'TLT'];

// ---------- reine Hilfsfunktionen (getestet) ----------
export function quantile(sorted, q) { if (!sorted.length) return null; const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); }
export function summarize(vals) {
  const v = vals.filter(Number.isFinite).sort((a, b) => a - b), n = v.length;
  if (!n) return { n: 0 };
  const mean = v.reduce((a, b) => a + b, 0) / n;
  return { n, mean, median: quantile(v, 0.5), q05: quantile(v, 0.05), q25: quantile(v, 0.25), q75: quantile(v, 0.75), q95: quantile(v, 0.95), pos: v.filter((x) => x > 0).length / n };
}
// t-Wert des Mittelwerts mit Clustern (Mittel je Cluster, dann t ueber Cluster).
export function clusterT(vals, keys) {
  const g = new Map();
  vals.forEach((v, i) => { if (!Number.isFinite(v)) return; const k = keys[i]; const b = g.get(k) || g.set(k, [0, 0]).get(k); b[0] += v; b[1]++; });
  const m = [...g.values()].map(([s, c]) => s / c), J = m.length;
  if (J < 3) return { clusters: J, mean: null, t: null };
  const mu = m.reduce((a, b) => a + b, 0) / J, sd = Math.sqrt(m.reduce((a, x) => a + (x - mu) ** 2, 0) / (J - 1));
  return { clusters: J, mean: mu, t: sd > 0 ? mu / (sd / Math.sqrt(J)) : null };
}
// OLS y = a + b x mit Newey-West-Standardfehler fuer a (lags).
export function olsNW(x, y, lags = 5) {
  const n = x.length; if (n < 30) return null;
  const mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0; for (let i = 0; i < n; i++) { sxx += (x[i] - mx) ** 2; sxy += (x[i] - mx) * (y[i] - my); }
  const b = sxx > 0 ? sxy / sxx : 0, a = my - b * mx;
  const e = y.map((v, i) => v - a - b * x[i]);
  // Varianz des Achsenabschnitts ueber HAC fuer den Mittelwert von e + Regressor-Korrektur (vereinfachte Sandwich-Form fuer [1, x]).
  const Z = x.map((v) => [1, v - mx]);
  const S = [[0, 0], [0, 0]];
  for (let l = 0; l <= lags; l++) { const w = l === 0 ? 1 : 1 - l / (lags + 1);
    for (let t = l; t < n; t++) { const g0 = [Z[t][0] * e[t], Z[t][1] * e[t]], g1 = [Z[t - l][0] * e[t - l], Z[t - l][1] * e[t - l]];
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) S[i][j] += w * (l === 0 ? g0[i] * g1[j] : g0[i] * g1[j] + g1[i] * g0[j]); } }
  const varA = S[0][0] / (n * n); // Z'Z diagonal mit Zentrierung: (n, sxx)
  return { alpha: a, beta: b, tAlpha: varA > 0 ? a / Math.sqrt(varA) : null, n };
}
export function annualize(dailyMean) { return (1 + dailyMean) ** 252 - 1; }
// Kapital in SPY statt Bargeld: E'_t = E'_{t-1} (1 + R_t + (1 - x_{t-1}) r_spy,t) - Kosten je Umschichtung.
export function cashInSpy(equity, spyRet, costBps = 0) {
  const out = [{ date: equity[0].date, equity: equity[0].equity }]; let v = equity[0].equity;
  for (let i = 1; i < equity.length; i++) {
    const R = equity[i].equity / equity[i - 1].equity - 1, xs = equity[i - 1].exposure, rs = spyRet.get(equity[i].date) ?? 0;
    const turn = Math.abs((1 - equity[i].exposure) - (1 - xs));
    v *= 1 + R + (1 - xs) * rs - turn * costBps / 1e4;
    out.push({ date: equity[i].date, equity: v });
  }
  return out;
}
// Exposition: Verteilung, Positionszahl.
export function exposureStats(equity) {
  const x = equity.map((p) => p.exposure).sort((a, b) => a - b), n = x.length, pos = equity.map((p) => p.n ?? 0).sort((a, b) => a - b);
  const share = (f) => equity.filter(f).length / n;
  return { mean: x.reduce((a, b) => a + b, 0) / n, median: quantile(x, 0.5), lt25: share((p) => p.exposure < 0.25), b25_50: share((p) => p.exposure >= 0.25 && p.exposure < 0.5), b50_75: share((p) => p.exposure >= 0.5 && p.exposure < 0.75),
    b75_100: share((p) => p.exposure >= 0.75), full95: share((p) => p.exposure >= 0.95), zero: share((p) => p.exposure < 0.005), meanPositions: pos.reduce((a, b) => a + b, 0) / n, medianPositions: quantile(pos, 0.5) };
}
// Zerlegung des ungenutzten Kapitals (beschreibend, PREREGISTRATION-R14 exposure.attribution).
export function attributeIdle(run, cfg) {
  const skipBy = new Map(); for (const s of run.skipped) { if (!s.date) continue; const b = skipBy.get(s.date) || skipBy.set(s.date, {}).get(s.date); b[s.reason] = (b[s.reason] || 0) + 1; }
  const openBy = new Map(); // date -> sum (cap - wEntry) ueber offene Positionen
  for (const p of run.taken) { const w = (p.entryShares * p.tr.entry.price) / p.eqAtEntry, gap = Math.max(0, cfg.maxPositionPct - w);
    const last = p.tr.exits.length ? p.tr.exits[p.tr.exits.length - 1].date : p.tr.terminal?.date || '9999';
    for (const q of run.equity) { if (q.date < p.tr.entry.date) continue; if (q.date >= last) break; openBy.set(q.date, (openBy.get(q.date) || 0) + gap); } }
  const acc = { idle: 0, sizing: 0, emptyNoSignal: 0, marketFilter: 0, constrained: 0, days: run.equity.length };
  for (const q of run.equity) {
    const idle = 1 - q.exposure; acc.idle += idle;
    const sk = skipBy.get(q.date) || {};
    const sizing = openBy.get(q.date) || 0;
    const empty = Math.max(0, cfg.maxPositions - (q.n ?? 0)) * cfg.maxPositionPct;
    let a = sizing, b = 0, c = 0, d = 0;
    if (sk.MARKET_FILTER) c = empty; else if (sk.NO_CASH || sk.MAX_POSITIONS) d = empty; else b = empty;
    const tot = a + b + c + d; const k = tot > idle && tot > 0 ? idle / tot : 1;
    acc.sizing += a * k; acc.emptyNoSignal += b * k; acc.marketFilter += c * k; acc.constrained += d * k;
  }
  const n = acc.days; return { idleMean: acc.idle / n, sizingMean: acc.sizing / n, emptyNoSignalMean: acc.emptyNoSignal / n, marketFilterMean: acc.marketFilter / n, cashOrSlotsFullMean: acc.constrained / n, unexplainedMean: (acc.idle - acc.sizing - acc.emptyNoSignal - acc.marketFilter - acc.constrained) / n };
}
// Ebene B2: zeitgewichtete Rendite des investierten Kapitals gegen SPY an denselben Tagen.
export function investedReturns(equity, spyRet, minExp = 0.02) {
  const ri = [], rs = [];
  for (let i = 1; i < equity.length; i++) { const x = equity[i - 1].exposure; if (!(x >= minExp)) continue; const R = equity[i].equity / equity[i - 1].equity - 1, s = spyRet.get(equity[i].date); if (!Number.isFinite(s)) continue; ri.push(R / x); rs.push(s); }
  if (ri.length < 30) return { days: ri.length };
  const m = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const geo = (a) => Math.exp(a.reduce((x, y) => x + Math.log(1 + Math.max(y, -0.99)), 0) / a.length * 252) - 1;
  const reg = olsNW(rs, ri);
  return { days: ri.length, invAnn: geo(ri), spyAnnSameDays: geo(rs), excessAnn: geo(ri) - geo(rs), alphaAnn: reg ? annualize(reg.alpha) : null, beta: reg?.beta ?? null, tAlpha: reg?.tAlpha ?? null, meanDailyInv: m(ri), meanDailySpy: m(rs) };
}
function quickA(equity, spyTR) {
  const n = equity.length, yrs = (Date.parse(equity[n - 1].date) - Date.parse(equity[0].date)) / (365.25 * 864e5);
  const cagr = (equity[n - 1].equity / equity[0].equity) ** (1 / yrs) - 1, spy = cagrBetween(spyTR, equity[0].date, equity[n - 1].date, 'value');
  return { cagr, spy, excess: cagr - spy, maxDrawdown: maxDrawdown(equity) };
}
function exposureMatched(equity, spyRet) { let m = 1; for (let i = 1; i < equity.length; i++) m *= 1 + equity[i - 1].exposure * (spyRet.get(equity[i].date) ?? 0); const yrs = (Date.parse(equity[equity.length - 1].date) - Date.parse(equity[0].date)) / (365.25 * 864e5); return m ** (1 / yrs) - 1; }

async function main() {
  const argv = process.argv.slice(2);
  const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  const OUT = arg('--out', path.join(os.tmpdir(), 'audit14')); const LIMIT = Number(arg('--limit', '0'));
  const HOLD = L.WINDOW_NAME === 'HOLDOUT';
  fs.mkdirSync(OUT, { recursive: true });
  const t0 = Date.now(); const log = (m) => console.log(`[audit14 ${L.WINDOW_NAME} +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
  const openedAt = new Date().toISOString();
  const { segs, calendar, spyTR, spyAdj, bench, mine, mainStore, driver, budget, delistCoverage, secCoverage, dataFingerprint } = await loadPitData({ LIMIT, log, excludeNonEquity: true, delistPit: true, secPit: true, secPitKey: HOLD ? '_validation/sec-pit-r12.json.gz' : '_validation/sec-pit-r11.json.gz' });
  // SPY: Tagesrendite (Gesamtrendite) je Datum, Index ueber Masterkalender
  const spyDates = spyAdj.date, spyRet = new Map(), spyTri = new Float64Array(spyDates.length), spyPos = new Map(spyDates.map((d, i) => [d, i]));
  spyTri[0] = 1; for (let i = 1; i < spyDates.length; i++) { const r = spyAdj.tr[i] ?? 0; spyTri[i] = spyTri[i - 1] * (1 + r); if (spyDates[i] >= W.from && spyDates[i] <= W.to) spyRet.set(spyDates[i], r); }
  const spyFrom = (dEntry, dEnd) => { const a = spyPos.get(dEntry), b = spyPos.get(dEnd); if (a == null || b == null) return NaN; return (spyTri[b] / spyTri[a]) * (spyAdj.close[a] / spyAdj.open[a]) - 1; };
  const M = spyDates.length, NH = H.length;
  const uniS = new Float64Array(M * NH), uniC = new Int32Array(M * NH), decS = new Float64Array(M * NH * 10), decC = new Int32Array(M * NH * 10);
  const delistFactor = (seg) => (seg.delistClass === 'ACQUISITION' ? 1 - SLIP : 0.7);

  // Vorlauf: Gewinnerliste (PREREGISTRATION-R14 missedWinners), mechanisch.
  const cands = [];
  for (const seg of segs) {
    const a = L.adjustSeries(seg.raw), n = a.date.length; const { max, at } = forwardMax(a.close);
    let dv = 0; const dvA = new Float64Array(n); for (let i = 0; i < n; i++) { dv += (a.rawClose[i] || 0) * (a.rawVolume[i] || 0); if (i >= 20) dv -= (a.rawClose[i - 20] || 0) * (a.rawVolume[i - 20] || 0); dvA[i] = i >= 19 ? dv / 20 : NaN; }
    let best = null;
    for (let t = 0; t < n; t++) { if (a.date[t] < W.from || a.date[t] > W.to) continue; if (!(a.rawClose[t] >= 5) || !(dvA[t] >= 5e6) || !Number.isFinite(max[t]) || at[t] < 0) continue; const g = max[t] / a.close[t] - 1; if (!best || g > best.gain) best = { seg: seg.id, start: a.date[t], peak: a.date[at[t]], gain: g }; }
    if (best) cands.push(best);
    if (!HOLD && seg.id.split(':')[2] === 'SMCI') { const t = a.date.indexOf('2023-03-13'); if (t >= 0) { const { max: mx, at: at2 } = { max, at }; cands.push({ seg: seg.id, start: a.date[t], peak: a.date[at2[t]], gain: mx[t] / a.close[t] - 1, forced: 'SMCI' }); } }
  }
  const winners = cands.filter((c) => !c.forced).sort((a, b) => b.gain - a.gain).slice(0, 15).concat(cands.filter((c) => c.forced));
  const winSeg = new Map(); for (const w of winners) (winSeg.get(w.seg) || winSeg.set(w.seg, []).get(w.seg)).push(w);
  log(`Gewinnerliste ${winners.length}`);

  // Zusatz (nicht praeregistriert, DEV): Minervini 3.0.0 mit SEC-Stand r11 (bisherige Backtests) vs. r12 (R12-Erweiterung).
  let sec12 = null;
  if (!HOLD) { budget.consumeClassB(1, 'GET sec pit r12'); const b = await driver.get(mine.seriesPrefix + '_validation/sec-pit-r12.json.gz'); sec12 = b ? JSON.parse(zlib.gunzipSync(b).toString('utf8')) : null; log(`SEC r12 geladen: ${sec12 ? Object.keys(sec12).length : 0}`); }

  const R = Object.fromEntries(ENGINES_R14.map((e) => [keyOf(e), { base: [], cost2: [], holds: { 63: [], 126: [], 252: [] }, rec: [], traces: {} }]));
  const M3 = { r11: [], r12: [], segsWithFund11: 0, segsWithFund12: 0 };
  const stocks = [];
  let k = 0;
  for (const seg of segs) {
    const ctx = segCtx(seg, bench);
    const d = ctx.bars.date, n = d.length, c = ctx.bars.close, o = ctx.bars.open;
    const tri = new Float64Array(n); tri[0] = 1; for (let i = 1; i < n; i++) tri[i] = tri[i - 1] * (1 + (Number.isFinite(ctx.tr[i]) ? ctx.tr[i] : 0));
    let SM = null; const segMaps = () => SM || (SM = { marks: new Map(d.map((x, i) => [x, c[i]])), divs: new Map(d.map((x, i) => [x, ctx.divAdj[i]]).filter(([, v]) => v > 0)) });
    const fwdFrom = (i0, base, h) => { const j = i0 + h; if (j < n) return (tri[j] / tri[i0]) * (c[i0] / base) - 1; if (seg.delisted) return (tri[n - 1] / tri[i0]) * (c[i0] / base) * delistFactor(seg) - 1; return NaN; };
    // Universum (liquide) und RS-Dezil je Starttag
    for (let t = 1; t < n; t++) {
      if (d[t] < W.from || d[t] > W.to) continue;
      if (!(ctx.raw.close[t - 1] >= 5) || !(ctx.ind.dollarVol20[t - 1] >= 1e6) || !(o[t] > 0)) continue;
      const g = seg.dIdx[t], rs = seg.cross?.rs?.[t - 1], dec = Number.isFinite(rs) ? Math.min(9, Math.floor(rs / 10)) : -1;
      for (let h = 0; h < NH; h++) { const v = fwdFrom(t, o[t], H[h]); if (!Number.isFinite(v)) continue; uniS[g * NH + h] += v; uniC[g * NH + h]++; if (dec >= 0) { decS[(g * NH + h) * 10 + dec] += v; decC[(g * NH + h) * 10 + dec]++; } }
    }
    for (const e of ENGINES_R14) {
      const r = R[keyOf(e)];
      const base = tradesFor(e, seg, ctx, DEFAULT_EXECUTION);
      r.base.push(...base); r.cost2.push(...tradesFor(e, seg, ctx, EXEC2));
      // Halte-Gegenproben teilen sich eine Kurs-/Dividendentabelle je Reihe (Speicher); abgefragt wird nur waehrend der Haltedauer.
      if (base.length) { const sm = segMaps(); for (const N of HOLDS) for (const h of holdTrades(base, ctx, seg, N)) { h.marks = sm.marks; h.divs = sm.divs; r.holds[N].push(h); } }
      for (const t of base) {
        const ei = d.indexOf(t.entry.date); if (ei < 0) continue;
        const px = t.entry.price, last = t.terminal?.kind === 'DELISTED' ? n - 1 : d.indexOf(t.exits[t.exits.length - 1].date);
        const fwd = H.map((h) => fwdFrom(ei, px, h));
        const spy = H.map((h) => { const j = Math.min(ei + h, n - 1); if (ei + h >= n && !seg.delisted) return NaN; return spyFrom(d[ei], d[j]); });
        let mfe60 = -Infinity, mae60 = Infinity, mfe252 = -Infinity, mae252 = Infinity, maxC = -Infinity;
        for (let i = ei; i <= Math.min(n - 1, ei + 252); i++) { const hi = ctx.bars.high[i] / px - 1, lo = ctx.bars.low[i] / px - 1; if (i <= ei + 60) { mfe60 = Math.max(mfe60, hi); mae60 = Math.min(mae60, lo); } mfe252 = Math.max(mfe252, hi); mae252 = Math.min(mae252, lo); maxC = Math.max(maxC, c[i] / px - 1); }
        // Handelsrendite (S1C) mit Dividenden und tradegleiches SPY
        let proceeds = 0, frac = 0, divs = 0, spyW = 0; let rem = 1;
        const exits = t.exits.filter((x) => x.ruleId !== 'OPEN_AT_END_MARK' || !seg.delisted);
        for (let i = ei + 1; i <= last; i++) { if (ctx.divAdj[i] > 0) { let soldBefore = 0; for (const x of exits) if (x.date < d[i]) soldBefore += x.fraction; divs += (1 - soldBefore) * ctx.divAdj[i]; } }
        for (const x of exits) { proceeds += x.fraction * x.price * (1 - COMM); frac += x.fraction; spyW += x.fraction * (1 + spyFrom(d[ei], x.date)); }
        rem = 1 - frac;
        if (t.terminal?.kind === 'DELISTED' && rem > 1e-9) { const tp = seg.delistClass === 'ACQUISITION' ? t.terminal.lastClose * (1 - SLIP) : t.terminal.lastClose * 0.7; proceeds += rem * tp * (1 - COMM); spyW += rem * (1 + spyFrom(d[ei], t.terminal.date)); frac += rem; }
        const ret = frac > 0 ? (proceeds + divs) / (px * (1 + COMM)) - 1 : NaN, spyHold = frac > 0 ? spyW / frac - 1 : NaN;
        const lx = t.exits.length ? t.exits[t.exits.length - 1] : null, li = lx ? d.indexOf(lx.date) : -1;
        const finalRule = t.terminal?.kind === 'DELISTED' && rem > 1e-9 ? 'DELISTED' : lx?.ruleId || null;
        const big = t.exits.reduce((m, x) => (!m || x.fraction > m.fraction ? x : m), null);
        const post = POST.map((h) => (finalRule === 'DELISTED' || finalRule === 'OPEN_AT_END_MARK' || li < 0 ? NaN : li + h < n ? (tri[li + h] / tri[li]) * (c[li] / lx.price) - 1 : seg.delisted ? (tri[n - 1] / tri[li]) * (c[li] / lx.price) * delistFactor(seg) - 1 : NaN));
        const holds = HOLDS.map((N) => fwdFrom(ei, px, N));
        let splits = 0, rsplits = 0, jumps = 0;
        for (let i = ei + 1; i <= last; i++) { const sf = seg.raw[i]?.splitFactor; if (sf && sf !== 1) { if (sf > 1) splits++; else rsplits++; } else if (Math.abs(c[i] / c[i - 1] - 1) > 0.5) jumps++; }
        let gapN = 0, gapDev = 0; for (const x of t.exits) if (x.basis === 'OPEN_BELOW_STOP') { gapN++; if (t.initialStop > 0 && x.price < t.initialStop) gapDev += x.price / t.initialStop - 1; }
        const rs = seg.cross?.rs?.[ei - 1];
        r.rec.push({ id: t.id, l: seg.id, e: d[ei], gi: seg.dIdx[ei], px, stop: t.initialStop, dv: ctx.ind.dollarVol20[ei - 1] ?? null, rc: ctx.raw.close[ei - 1] ?? null, rs: rs ?? null, dec: Number.isFinite(rs) ? Math.min(9, Math.floor(rs / 10)) : -1,
          fwd, spy, mfe60, mae60, mfe252, mae252, maxC, ret, spyHold, finalRule, bigRule: big?.ruleId || null, held: last - ei, post, holds, splits, rsplits, jumps, gapN, gapDev, delisted: t.terminal?.kind === 'DELISTED', cls: seg.delistClass || null });
      }
      // Fallkette: Scan-Diagnose fuer Gewinner-Segmente
      const ws = winSeg.get(seg.id);
      if (ws) for (const w of ws) {
        const a0 = d.indexOf(w.start), a1 = d.indexOf(w.peak); if (a0 < 0 || a1 < 0) continue;
        const g = rawGate(e), blockers = {}, stages = {}; let scanned = 0;
        for (let t = Math.max(0, a0 - 63); t <= a1; t++) { const s = g.scan(ctx, t, { ...e.PARAMS, minPrice: 0 }, {}); if (s === undefined) continue; scanned++;
          if (s) stages[s.stage || 'SETUP'] = (stages[s.stage || 'SETUP'] || 0) + 1; const why = s && s.rules ? Object.entries(s.rules).filter(([, v]) => !v).map(([x]) => x) : s ? [] : explainNull(e, ctx, t); for (const b of why) blockers[b] = (blockers[b] || 0) + 1; }
        r.traces[`${seg.id}|${w.start}`] = { scanned, stages, blockers, entries: base.filter((t) => t.entry.date >= d[Math.max(0, a0 - 63)] && t.entry.date <= w.peak).map((t) => t.id) };
      }
    }
    if (!HOLD) {
      // Minervini 3.0.0: r11 (wie R11/R13) vs. r12 (erweiterte SEC-Daten)
      const id0 = seg.id.split('#')[0]; const f12 = sec12?.[id0];
      if (seg.fund) M3.segsWithFund11++; if (f12) M3.segsWithFund12++;
      M3.r11.push(...tradesFor(live(minervini3), seg, ctx, DEFAULT_EXECUTION));
      const ctx12 = { ...ctx, fund: f12 ? { eps: f12.eps, rev: f12.rev } : null };
      M3.r12.push(...tradesFor(live(minervini3), seg, ctx12, DEFAULT_EXECUTION));
    }
    const a = L.adjustSeries(seg.raw); const nn = a.date.length;
    stocks.push({ id: seg.id, symbol: seg.id.split(':')[2], survivor: seg.survivor, bars: { date: a.date, open: a.open, high: a.high, low: a.low, close: a.close, volume: a.volume }, divAdj: a.divAdj, rs: seg.cross?.rs || null,
      terminal: seg.delisted ? { date: a.date[nn - 1], lastClose: a.close[nn - 1], distress: L.distressSignature(a.rawClose), kind: 'DELISTED', delistClass: seg.delistClass || null } : null });
    seg.raw = null;
    if (++k % 1000 === 0) log(`simuliert ${k}/${segs.length}`);
  }
  log('Simulation fertig');

  const uniAt = (gi, h) => (uniC[gi * NH + h] ? uniS[gi * NH + h] / uniC[gi * NH + h] : NaN);
  const decAt = (gi, h, dec) => (dec >= 0 && decC[(gi * NH + h) * 10 + dec] >= 5 ? decS[(gi * NH + h) * 10 + dec] / decC[(gi * NH + h) * 10 + dec] : NaN);
  const MOK = marketOkMap(spyAdj);
  // Regime je Kalendertag (PREREGISTRATION-R14 regimes)
  const regime = new Map(); { const cl = spyAdj.close; const sma = new Float64Array(cl.length).fill(NaN); let s = 0; for (let i = 0; i < cl.length; i++) { s += cl[i]; if (i >= 200) s -= cl[i - 200]; if (i >= 199) sma[i] = s / 200; }
    const vol = new Float64Array(cl.length).fill(NaN); for (let i = 20; i < cl.length; i++) { let m = 0, q = 0; for (let j = i - 19; j <= i; j++) { const r = cl[j] / cl[j - 1] - 1; m += r; q += r * r; } vol[i] = Math.sqrt(Math.max(0, q / 20 - (m / 20) ** 2)) * Math.sqrt(252); }
    const inWin = []; for (let i = 0; i < cl.length; i++) if (spyDates[i] >= W.from && spyDates[i] <= W.to && Number.isFinite(vol[i])) inWin.push(vol[i]); inWin.sort((a, b) => a - b); const vMed = quantile(inWin, 0.5);
    for (let i = 220; i < cl.length; i++) { const up = sma[i] > sma[i - 20]; const tr = cl[i] > sma[i] && up ? 'BULL' : cl[i] < sma[i] && !up ? 'BEAR' : 'SIDEWAYS'; regime.set(spyDates[i], { trend: tr, vol: vol[i] >= vMed ? 'HIGH_VOL' : 'LOW_VOL', year: spyDates[i].slice(0, 4) }); } }
  // Zinsen (IEF/TLT), Kontext-ETFs
  const context = {};
  for (const t of CONTEXT_ETFS) {
    let s = null; try { s = await mainStore.getSeries(t); } catch { s = null; }
    if (!s?.bars?.length) { context[t] = { available: false }; continue; }
    const raw = s.bars.map((b) => ({ date: b.date, close: b.close, dividend: b.dividend ?? 0, splitFactor: b.splitFactor ?? 1 })).filter((b) => b.close != null).sort((a, b) => a.date.localeCompare(b.date));
    const a = L.adjustSeries(raw.map((b) => ({ ...b, open: b.close, high: b.close, low: b.close, volume: 0 })));
    let v = 1; const curve = []; for (let i = 0; i < a.date.length; i++) { if (a.date[i] < W.from || a.date[i] > W.to) continue; if (curve.length && Number.isFinite(a.tr[i])) v *= 1 + a.tr[i]; curve.push({ date: a.date[i], value: v, ret: curve.length ? a.tr[i] : 0 }); }
    if (curve.length < 100 || curve[0].date > addD(W.from, 30)) { context[t] = { available: false, reason: 'COVERAGE', first: curve[0]?.date || null }; continue; }
    context[t] = { available: true, cagr: cagrBetween(curve, W.from, W.to, 'value'), first: curve[0].date, last: curve[curve.length - 1].date, curve };
  }
  const rates = context.IEF?.available ? context.IEF : context.TLT?.available ? context.TLT : null;
  if (rates) { const cv = rates.curve; for (let i = 126; i < cv.length; i++) { const g = regime.get(cv[i].date); if (g) g.rates = cv[i].value / cv[i - 126].value - 1 < 0 ? 'RISING_RATES' : 'FALLING_RATES'; } }
  const ctxOut = Object.fromEntries(Object.entries(context).map(([t, v]) => [t, v.available ? { available: true, cagr: v.cagr, first: v.first, last: v.last } : v]));
  log(`Kontext-ETFs verfuegbar: ${Object.values(ctxOut).filter((v) => v.available).length}/${CONTEXT_ETFS.length}`);

  const segmentReturns = (equity, invMinExp = 0.02) => {
    const acc = {}; const add = (key, R, s, inv) => { const b = acc[key] ||= { n: 0, r: 0, s: 0, ni: 0, ri: 0, si: 0 }; b.n++; b.r += Math.log(1 + R); b.s += Math.log(1 + s); if (inv != null) { b.ni++; b.ri += Math.log(1 + Math.max(inv, -0.99)); b.si += Math.log(1 + s); } };
    for (let i = 1; i < equity.length; i++) { const dt = equity[i].date, g = regime.get(dt), s = spyRet.get(dt); if (!g || !Number.isFinite(s)) continue; const R = equity[i].equity / equity[i - 1].equity - 1, x = equity[i - 1].exposure, inv = x >= invMinExp ? R / x : null;
      add(g.trend, R, s, inv); add(g.vol, R, s, inv); if (g.rates) add(g.rates, R, s, inv); const y = YEARS.find((Y) => dt.slice(0, 4) >= Y[1] && dt.slice(0, 4) <= (Y[2] || Y[1])); if (y) add('Y' + y[0], R, s, inv); }
    return Object.fromEntries(Object.entries(acc).map(([kk, b]) => [kk, { days: b.n, portAnn: Math.exp(b.r / b.n * 252) - 1, spyAnn: Math.exp(b.s / b.n * 252) - 1, invDays: b.ni, invAnn: b.ni ? Math.exp(b.ri / b.ni * 252) - 1 : null, spyAnnInvDays: b.ni ? Math.exp(b.si / b.ni * 252) - 1 : null }]));
  };

  const results = {};
  for (const e of ENGINES_R14) {
    const r = R[keyOf(e)], cfg = portfolioOf14(e);
    const cal = [...new Set([...calendar, ...r.base.flatMap((t) => [t.entry.date, ...t.exits.map((x) => x.date)]).filter((x) => x >= W.from && x <= W.to)])].sort();
    const go = (tr, o = {}, c2 = cfg) => runPortfolioTR(tr, cal, c2, { marketOk: MOK, scenario: 'S1C_CLASSIFIED', ...o });
    const base = go(r.base);
    const A = quickA(base.equity, spyTR);
    const s0 = go(r.base, { scenario: 'S0_LAST_PRICE' });
    const cost2 = go(r.cost2, { slippageBps: 20, commissionBps: 2 });
    const eqw = { ...cfg, riskPerTrade: 1, maxPositionPct: 1 / cfg.maxPositions };
    const C2 = go(r.base, {}, eqw);
    const C4 = go(r.base, {}, { ...cfg, maxPositions: 1e9 });
    const C5 = Object.fromEntries(HOLDS.map((N) => [N, quickA(go(r.holds[N]).equity, spyTR)]));
    const C6 = cfg.marketFilter ? quickA(go(r.base, {}, { ...cfg, marketFilter: false }).equity, spyTR) : null;
    const C7 = { ALPHA: quickA(go(r.base, { priority: 'ALPHA' }).equity, spyTR).excess, RALPHA: quickA(go(r.base, { priority: 'RALPHA' }).equity, spyTR).excess, RS: quickA(go(r.base, { priority: 'RS' }).equity, spyTR).excess, seeds: [] };
    for (let sd = 1; sd <= 20; sd++) C7.seeds.push(quickA(go(r.base, { seed: sd }).equity, spyTR).excess);
    const C1hi = quickA(cashInSpy(base.equity, spyRet, 0), spyTR), C1lo = quickA(cashInSpy(base.equity, spyRet, 1), spyTR);
    const C3 = quickA(cashInSpy(C2.equity, spyRet, 1), spyTR);
    const expo = exposureStats(base.equity);
    const weights = base.taken.map((p) => (p.entryShares * p.tr.entry.price) / p.eqAtEntry);
    const B2 = investedReturns(base.equity, spyRet);
    const B3 = { exposureMatchedSpy: exposureMatched(base.equity, spyRet), contributionPp: A.cagr - exposureMatched(base.equity, spyRet), s0ContributionPp: quickA(s0.equity, spyTR).cagr - exposureMatched(s0.equity, spyRet) };
    // Signalqualitaet
    const recs = r.rec, mon = recs.map((x) => x.e.slice(0, 7));
    const sig = {};
    H.forEach((h, hi) => {
      const ex = recs.map((x) => x.fwd[hi] - x.spy[hi]), eu = recs.map((x) => x.fwd[hi] - uniAt(x.gi, hi)), ed = recs.map((x) => x.fwd[hi] - decAt(x.gi, hi, x.dec));
      sig[h] = { raw: summarize(recs.map((x) => x.fwd[hi])), vsSpy: { ...summarize(ex), ...clusterT(ex, mon) }, vsUniverse: { ...summarize(eu), ...clusterT(eu, mon) }, vsRsDecile: { ...summarize(ed), ...clusterT(ed, mon) } };
    });
    const f252 = recs.map((x) => x.fwd[H.length - 1]).filter(Number.isFinite), share = (arr, f) => (arr.length ? arr.filter(f).length / arr.length : null);
    const dist = { n252: f252.length, ge25: share(f252, (v) => v >= 0.25), ge50: share(f252, (v) => v >= 0.5), ge100: share(f252, (v) => v >= 1), le20: share(f252, (v) => v <= -0.2), le50: share(f252, (v) => v <= -0.5),
      maxClose252ge25: share(recs, (x) => x.maxC >= 0.25), maxClose252ge50: share(recs, (x) => x.maxC >= 0.5), maxClose252ge100: share(recs, (x) => x.maxC >= 1), mae252le20: share(recs, (x) => x.mae252 <= -0.2), mae252le50: share(recs, (x) => x.mae252 <= -0.5),
      mfe60: summarize(recs.map((x) => x.mfe60)), mae60: summarize(recs.map((x) => x.mae60)), mfe252: summarize(recs.map((x) => x.mfe252)), mae252: summarize(recs.map((x) => x.mae252)) };
    const edgeByYear = {}; for (const x of recs) { const y = x.e.slice(0, 4), v = x.fwd[5] - uniAt(x.gi, 5); if (!Number.isFinite(v)) continue; const b = edgeByYear[y] ||= { n: 0, s: 0 }; b.n++; b.s += v; }
    // Ebene B1: tradegleich
    const b1 = recs.map((x) => x.ret - x.spyHold);
    const B1 = { ...summarize(b1), ...clusterT(b1, mon), tradeRet: summarize(recs.map((x) => x.ret)) };
    // Exit-Audit
    const exitByRule = {};
    for (const x of recs) { const k2 = x.finalRule || 'NONE'; const b = exitByRule[k2] ||= { n: 0, ret: 0, post60: [], post252: [], cutDoublers: 0, cut50: 0, cut25: 0 }; b.n++; b.ret += Number.isFinite(x.ret) ? x.ret : 0; b.post60.push(x.post[1]); b.post252.push(x.post[3]);
      if (x.maxC >= 1 && x.ret < 0.1) b.cutDoublers++; if (x.maxC >= 0.5 && x.ret < 0.1) b.cut50++; if (x.maxC >= 0.25 && x.ret < 0.1) b.cut25++; }
    for (const b of Object.values(exitByRule)) { b.ret /= b.n; b.post60 = summarize(b.post60); b.post252 = summarize(b.post252); }
    const paired = recs.map((x) => x.ret - x.holds[1]);
    const exitAudit = { byRule: exitByRule, doublers: recs.filter((x) => x.maxC >= 1).length, doublersCut: recs.filter((x) => x.maxC >= 1 && x.ret < 0.1).length, gain50: recs.filter((x) => x.maxC >= 0.5).length, gain50Cut: recs.filter((x) => x.maxC >= 0.5 && x.ret < 0.1).length,
      gain25: recs.filter((x) => x.maxC >= 0.25).length, gain25Cut: recs.filter((x) => x.maxC >= 0.25 && x.ret < 0.1).length,
      captureRatio: summarize(recs.filter((x) => x.mfe252 > 0.05).map((x) => x.ret / x.mfe252)), post: Object.fromEntries(POST.map((h, i) => [h, summarize(recs.map((x) => x.post[i]))])),
      vsHold: Object.fromEntries(HOLDS.map((N, i) => [N, { hold: summarize(recs.map((x) => x.holds[i])), diff: summarize(recs.map((x) => x.ret - x.holds[i])) }])), pairedVsHold126: { ...summarize(paired), ...clusterT(paired, mon) }, heldSessions: summarize(recs.map((x) => x.held)) };
    // Portfolio-Konstruktion: genommen vs. abgewiesen
    const retOf = new Map(recs.map((x) => [x.id, x]));
    const takenIds = new Set(base.taken.map((p) => p.tr.id));
    const pc = { taken: summarize(base.taken.map((p) => retOf.get(p.tr.id)?.ret)), takenRs: summarize(base.taken.map((p) => retOf.get(p.tr.id)?.rs)), skipped: {} };
    for (const s of base.skipped) { const b = pc.skipped[s.reason] ||= []; b.push(s.id); }
    for (const [why, ids] of Object.entries(pc.skipped)) pc.skipped[why] = { n: ids.length, ret: summarize(ids.map((i) => retOf.get(i)?.ret)), rs: summarize(ids.map((i) => retOf.get(i)?.rs)), fwd120vsUni: summarize(ids.map((i) => { const x = retOf.get(i); return x ? x.fwd[5] - uniAt(x.gi, 5) : NaN; })) };
    const byDate = new Map(); for (const t of r.base) byDate.set(t.entry.date, (byDate.get(t.entry.date) || 0) + 1);
    pc.daysWithSignals = byDate.size; pc.daysMultiSignals = [...byDate.values()].filter((v) => v > 1).length; pc.daysWithSkips = new Set(base.skipped.map((s) => s.date)).size;
    // Fehlkandidaten: groesster Verlustbeitrag
    const failures = base.taken.filter((p) => p.pnl !== undefined).map((p) => ({ p, contrib: p.pnl / p.eqAtEntry })).sort((a, b) => a.contrib - b.contrib).slice(0, 10).map(({ p, contrib }) => { const x = retOf.get(p.tr.id);
      return { id: p.tr.id, entry: [p.tr.entry.date, p.tr.entry.price], stop: p.tr.initialStop, weight: (p.entryShares * p.tr.entry.price) / p.eqAtEntry, exits: p.tr.exits.map((y) => [y.date, y.price, y.fraction, y.ruleId]), terminal: p.tr.terminal ? [p.tr.terminal.kind, p.tr.terminal.date, p.tr.terminal.delistClass] : null, ret: p.returnPct, contrib, post60: x?.post?.[1] ?? null, post252: x?.post?.[3] ?? null, maxC252: x?.maxC ?? null, mae252: x?.mae252 ?? null }; });
    // Gewinner-Fallketten
    const skipOf = new Map(base.skipped.map((s) => [s.id, s.reason]));
    const winnerCases = winners.map((w) => { const tr = r.traces[`${w.seg}|${w.start}`] || null; return { seg: w.seg, start: w.start, peak: w.peak, gain: w.gain, forced: w.forced || null, scan: tr ? { scanned: tr.scanned, stages: tr.stages, topBlockers: Object.entries(tr.blockers).sort((a, b) => b[1] - a[1]).slice(0, 6) } : null,
      entries: (tr?.entries || []).map((id) => { const x = retOf.get(id), p = base.taken.find((q) => q.tr.id === id); return { id, entry: x ? [x.e, x.px] : null, taken: takenIds.has(id), skip: skipOf.get(id) || null, weight: p ? (p.entryShares * p.tr.entry.price) / p.eqAtEntry : null, ret: x?.ret ?? null, finalRule: x?.finalRule ?? null, held: x?.held ?? null, capture: x && w.gain > 0 ? x.ret / w.gain : null }; }) }; });
    // Kosten, Handelbarkeit
    const yrs = (Date.parse(base.equity[base.equity.length - 1].date) - Date.parse(base.equity[0].date)) / (365.25 * 864e5);
    const meanEq = base.equity.reduce((a, q) => a + q.equity, 0) / base.equity.length;
    const traded = base.taken.reduce((a, p) => a + p.cost + (p.proceeds || 0), 0);
    const takenRecs = base.taken.map((p) => retOf.get(p.tr.id)).filter(Boolean);
    const costs = { turnoverPerYear: traded / meanEq / yrs, commissionsPerYearPct: base.book.commissions / meanEq / yrs, roundTripCostPct: 2 * (SLIP + COMM), cost2Excess: quickA(cost2.equity, spyTR).excess, heldSessionsTaken: summarize(takenRecs.map((x) => x.held)), tradesPerYear: base.taken.length / yrs,
      gapStops: { exits: recs.reduce((a, x) => a + x.gapN, 0), meanDevBelowInitialStop: (() => { const v = recs.filter((x) => x.gapN && x.gapDev < 0); return v.length ? v.reduce((a, x) => a + x.gapDev, 0) / v.length : null; })() },
      dollarVolumeAtEntry: summarize(takenRecs.map((x) => x.dv)), rawPriceAtEntry: summarize(takenRecs.map((x) => x.rc)) };
    const tradability = { entriesBelow5: recs.filter((x) => x.rc != null && x.rc < 5).length, entriesBelow1M: recs.filter((x) => x.dv != null && x.dv < 1e6).length, tradesWithSplit: recs.filter((x) => x.splits).length, tradesWithReverseSplit: recs.filter((x) => x.rsplits).length, tradesWithJump50NoSplit: recs.filter((x) => x.jumps).length,
      jumpExamples: recs.filter((x) => x.jumps).slice(0, 15).map((x) => [x.id, x.e]), delistedTrades: recs.filter((x) => x.delisted).length, delistedAcq: recs.filter((x) => x.delisted && x.cls === 'ACQUISITION').length };
    // Ketten-Zerlegung (Einzelgegenproben gegen dieselbe Basis)
    const chain = { excessA: A.excess, cashDrag: A.cagr - C1hi.cagr, sizingEffect: quickA(C2.equity, spyTR).cagr - A.cagr, slotEffect: quickA(C4.equity, spyTR).cagr - A.cagr, exitEffect126: C5[126].cagr - A.cagr, costUnit: quickA(cost2.equity, spyTR).cagr - A.cagr, delistingS0minusS1C: quickA(s0.equity, spyTR).cagr - A.cagr };
    chain.rest = chain.excessA - (chain.cashDrag + chain.sizingEffect + chain.exitEffect126);
    results[keyOf(e)] = {
      cfg: { riskPerTrade: cfg.riskPerTrade, maxPositionPct: cfg.maxPositionPct, maxPositions: cfg.maxPositions, priority: cfg.priority, marketFilter: !!cfg.marketFilter, progressive: cfg.progressive || null, turtleNotional: cfg.turtleNotional || null },
      engineTrades: r.base.length, taken: base.taken.length, skippedByReason: base.skipped.reduce((a, x) => ((a[x.reason] = (a[x.reason] || 0) + 1), a), {}),
      A: { ...A, s0: quickA(s0.equity, spyTR), cost2: quickA(cost2.equity, spyTR), subperiods: null },
      B: { B1, B2, B3 }, C: { C1_cashInSpy_noCost: C1hi, C1_cashInSpy_1bp: C1lo, C2_equalWeight: quickA(C2.equity, spyTR), C2_exposure: exposureStats(C2.equity).mean, C3_equalWeight_cashInSpy: C3, C4_unlimitedSlots: quickA(C4.equity, spyTR), C4_exposure: exposureStats(C4.equity).mean, C5_hold: C5, C6_noMarketFilter: C6, C7_rank: C7 },
      exposure: { ...expo, weightAtEntry: summarize(weights), idle: attributeIdle(base, cfg) }, chain,
      signal: { n: recs.length, byHorizon: sig, distribution: dist, edgeByYear120vsUni: Object.fromEntries(Object.entries(edgeByYear).map(([y, b]) => [y, { n: b.n, mean: b.s / b.n }])) },
      exitAudit, portfolioConstruction: pc, failures, winnerCases, regimes: segmentReturns(base.equity), costs, tradability };
    R[keyOf(e)] = null;
    log(`${keyOf(e)}: Trades ${r.base.length}, A ${(A.excess * 100).toFixed(1)}, Expo ${(expo.mean * 100).toFixed(0)} %`);
  }
  // Minervini 3.0.0 SEC r11 vs r12 (Zusatz, DEV)
  let m3 = null;
  if (!HOLD) { const cfg = portfolioOf14(live(minervini3)); const cal = calendar; const q = (tr) => quickA(runPortfolioTR(tr, [...new Set([...cal, ...tr.flatMap((t) => [t.entry.date, ...t.exits.map((x) => x.date)]).filter((x) => x >= W.from && x <= W.to)])].sort(), cfg, { marketOk: MOK, scenario: 'S1C_CLASSIFIED' }).equity, spyTR);
    m3 = { segsWithFund11: M3.segsWithFund11, segsWithFund12: M3.segsWithFund12, trades11: M3.r11.length, trades12: M3.r12.length, A11: M3.r11.length ? q(M3.r11) : null, A12: M3.r12.length ? q(M3.r12) : null }; }
  // VU Trendfolge 52W
  const spy = { date: spyAdj.date, close: spyAdj.close };
  const rot = simulateRotation(stocks, calendar, spy, { from: W.from, to: W.to, variant: 'PP', rank: 'CLENOW', scenario: 'S1C_CLASSIFIED' });
  const sIdx = new Map(stocks.map((s, i) => [s.id, i]));
  const t52rec = rot.trades.map((t) => { const s = stocks[sIdx.get(t.listingId)]; if (!s) return null; const d = s.bars.date, c = s.bars.close, ei = d.indexOf(t.entry.date); if (ei < 0) return null;
    const tri = new Float64Array(d.length); tri[0] = 1; for (let i = 1; i < d.length; i++) tri[i] = tri[i - 1] * ((c[i] + (s.divAdj[i] || 0)) / c[i - 1]);
    const f = (h) => (ei + h < d.length ? (tri[ei + h] / tri[ei]) * (c[ei] / t.entry.price) - 1 : s.terminal ? (tri[d.length - 1] / tri[ei]) * (c[ei] / t.entry.price) * (s.terminal.delistClass === 'ACQUISITION' ? 1 - SLIP : 0.7) - 1 : NaN);
    const g = spyPos.get(d[ei]); return { e: d[ei], fwd: H.map(f), spy: H.map((h) => (ei + h < d.length || s.terminal ? spyFrom(d[ei], d[Math.min(ei + h, d.length - 1)]) : NaN)), gi: g, ret: t.returnPct, rule: t.exits?.[t.exits.length - 1]?.ruleId || null }; }).filter(Boolean);
  const t52mon = t52rec.map((x) => x.e.slice(0, 7));
  const trend52 = { A: quickA(rot.equity, spyTR), exposure: exposureStats(rot.equity.map((q) => ({ ...q, n: q.positions }))), B2: investedReturns(rot.equity, spyRet), C1_cashInSpy_1bp: quickA(cashInSpy(rot.equity, spyRet, 1), spyTR), trades: rot.trades.length,
    signal: Object.fromEntries(H.map((h, hi) => { const ex = t52rec.map((x) => x.fwd[hi] - x.spy[hi]), eu = t52rec.map((x) => x.fwd[hi] - uniAt(x.gi, hi)); return [h, { vsSpy: { ...summarize(ex), ...clusterT(ex, t52mon) }, vsUniverse: { ...summarize(eu), ...clusterT(eu, t52mon) } }]; })),
    tradeRet: summarize(t52rec.map((x) => x.ret)), exitRules: t52rec.reduce((a, x) => ((a[x.rule] = (a[x.rule] || 0) + 1), a), {}), regimes: segmentReturns(rot.equity) };
  log('Trendfolge 52W fertig');
  const spyCagr = cagrBetween(spyTR, W.from, W.to, 'value');
  const result = { schema: 'supertrader-audit-r14-1.0.0', prereg: PREREG_R14, window: L.WINDOW_NAME, period: W, openedAt, at: new Date().toISOString(), commit: process.env.GITHUB_SHA || null, limit: LIMIT || null,
    dataFingerprint, universe: { segments: segs.length, delistCoverage, secCoverage }, spyCagr, context: ctxOut, winners, results, minervini3Sec: m3, trend52 };
  const pem = fs.readFileSync(path.join(root, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  const name = `audit-r14${HOLD ? '-holdout' : ''}${LIMIT ? '-smoke' : ''}`;
  if (LIMIT && HOLD) { // technischer Probelauf im Holdout: nur Zaehlwerte (PREREGISTRATION-R14 openingRule)
    const counts = { schema: 'supertrader-audit-r14-holdout-smoke-1.0.0', at: new Date().toISOString(), segments: segs.length, trades: Object.fromEntries(Object.entries(results).map(([k2, v]) => [k2, v.engineTrades])), trend52Trades: rot.trades.length, delistCoverage, secCoverage };
    fs.writeFileSync(path.join(OUT, `${name}.sealed.json`), L.encryptForOwner(pem, Buffer.from(JSON.stringify(counts))));
  } else fs.writeFileSync(path.join(OUT, `${name}.sealed.json`), L.encryptForOwner(pem, Buffer.from(JSON.stringify(result))));
  log('Verschluesseltes Ergebnis geschrieben');
}
function addD(d, n) { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
function portfolioOf14(e) { return e.portfolio; }

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
