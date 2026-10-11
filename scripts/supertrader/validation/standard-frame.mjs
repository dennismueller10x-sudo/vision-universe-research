#!/usr/bin/env node
// Supertrader Portfolio Triage - Standardmessrahmen (scripts/supertrader/triage/PREREGISTRATION-TRIAGE.json).
// Die sechs Live-Methoden (ENGINES_R14 = Live-Konfiguration + VU_TREND_52W ueber simulateRotation, S1C) in EINEM Prozess,
// auf EINEM Fenster (ST_WINDOW, Standard DEV) und EINEM Datenstand. Keine Parameteraenderung, keine neue Regel.
// Je Methode: Signalqualitaet (21/63/126), Portfolio, Exposure, Robustheit (6 Segmente), Ueberlappung je Methodenpaar.
// Ausgabe:
//   * VOLLSTAENDIG nur verschluesselt (lib.encryptForOwner): <out>/standard-frame[-smoke].sealed.json
//   * OEFFENTLICHES Log ausschliesslich ueber publicRow(): Booleans, ganze Zahlen, Enum-Kennungen. Keine Kennzahlen.
// Aufruf: ST_WINDOW=DEV node standard-frame.mjs --out DIR [--limit N]
// Quellverweise: Rahmen und Formeln aus audit-r14.mjs (fwdFrom, spyFrom, delistFactor, quickA, Regime), gleiche Helfer importiert.
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from './lib.mjs';
import { loadPitData, segCtx, tradesFor } from './analyze-methods.mjs';
import { runPortfolioTR, cagrBetween, maxDrawdown, marketOkMap } from './portfolio.mjs';
import { ENGINES_R14, summarize, clusterT, quantile, exposureStats } from './audit-r14.mjs';
import { DEFAULT_EXECUTION } from '../engine/execution.mjs';
import { simulateRotation } from '../engine/rotation-52w.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const SCHEMA_FRAME = 'supertrader-standard-frame-1.0.0';
export const PREREG_TRIAGE = 'supertrader-triage-prereg-1.0.0';
export const HORIZONS = [21, 63, 126];
export const MFE_WINDOWS = [63, 126];
export const TREND_KEY = 'VU_TREND_52W@1.0.0';
export const SEGMENTS = ['early', 'late', 'bull', 'bear', 'highVol', 'lowVol'];
// Frueh/spaet: DEV 2016-2020 / 2021-Ende (Praeregistrierung). HOLDOUT: technisches Analogon (Mitte), nicht praeregistriert.
export const SPLIT_DATE = { DEV: '2020-12-31', HOLDOUT: '2011-12-31' };
const SLIP = 10 / 1e4, COMM = 1 / 1e4;
export const THRESHOLDS = Object.freeze({
  minEntries: 30, minClusters: 12, tPos: 2.0, tNeg: -2.0, cagrDiff: 0.01, ddDiff: 0.05, expLow: 0.25, expHigh: 0.60, jacLow: 0.10, jacHigh: 0.30, corrLow: 0.50, corrHigh: 0.80, eps: 1e-9,
});

// ---------- Klassifikation (Schwellen aus PREREGISTRATION-TRIAGE.json publicClassThresholds, unveraendert) ----------
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
export function classifySignalEdge({ t, median, n, clusters }) {
  if (!(n >= THRESHOLDS.minEntries) || !(clusters >= THRESHOLDS.minClusters) || !fin(t) || !fin(median)) return 'UNKNOWN';
  if (t >= THRESHOLDS.tPos && median > 0) return 'POSITIVE';
  if (t <= THRESHOLDS.tNeg && median < 0) return 'NEGATIVE';
  return 'NEUTRAL';
}
// diff = CAGR(Methode) - CAGR(SPY TR) als Anteil (0,01 = 1 Prozentpunkt).
export function classifyPortfolioVsSpy(diff) {
  if (!fin(diff)) return 'UNKNOWN';
  if (diff >= THRESHOLDS.cagrDiff - THRESHOLDS.eps) return 'ABOVE';
  if (diff <= -THRESHOLDS.cagrDiff + THRESHOLDS.eps) return 'BELOW';
  return 'SIMILAR';
}
// MaxDD als Anteil (negativ oder positiv; es zaehlt der Betrag). SHALLOWER: Methode um >= 5 pp flacher als SPY.
export function classifyDrawdownVsSpy(mddMethod, mddSpy) {
  if (!fin(mddMethod) || !fin(mddSpy)) return 'UNKNOWN';
  const d = Math.abs(mddSpy) - Math.abs(mddMethod);
  if (d >= THRESHOLDS.ddDiff - THRESHOLDS.eps) return 'SHALLOWER';
  if (d <= -THRESHOLDS.ddDiff + THRESHOLDS.eps) return 'DEEPER';
  return 'SIMILAR';
}
export function classifyExposure(mean) {
  if (!fin(mean)) return 'UNKNOWN';
  return mean < THRESHOLDS.expLow ? 'LOW' : mean > THRESHOLDS.expHigh ? 'HIGH' : 'MID';
}
export function classifyOverlap(jaccardValue) {
  if (!fin(jaccardValue)) return 'UNKNOWN';
  return jaccardValue < THRESHOLDS.jacLow ? 'LOW' : jaccardValue > THRESHOLDS.jacHigh ? 'HIGH' : 'MEDIUM';
}
export function classifyReturnCorrelation(r) {
  if (!fin(r)) return 'UNKNOWN';
  return r < THRESHOLDS.corrLow ? 'LOW' : r > THRESHOLDS.corrHigh ? 'HIGH' : 'MEDIUM';
}
// Anzahl der Segmente mit gleichem Vorzeichen der 63-Sitzungs-Signaluberrendite wie im Gesamtfenster.
// segs: { name: { n, mean } }. consistent: alle Segmente mit n>0; consistentN30: nur Segmente mit n>=30; segmentsN30: Segmente mit n>=30.
export function regimeConsistency(overallMean, segs) {
  const out = { consistent: 0, consistentN30: 0, segmentsN30: 0 };
  const sg = fin(overallMean) ? Math.sign(overallMean) : 0;
  for (const s of Object.values(segs || {})) {
    if (!s || !(s.n > 0) || !fin(s.mean)) continue;
    const same = sg !== 0 && Math.sign(s.mean) === sg;
    if (same) out.consistent++;
    if (s.n >= THRESHOLDS.minEntries) { out.segmentsN30++; if (same) out.consistentN30++; }
  }
  return out;
}

// ---------- Sperre fuer oeffentliche Ausgabe ----------
// Erlaubt: Booleans, ganze Zahlen (|x| <= 10^7), Enum-Kennungen [A-Za-z0-9_.+-]{1,48}, die nicht wie eine Dezimalzahl aussehen.
export const PUBLIC_ENUM = /^[A-Za-z0-9_.+-]{1,48}$/;
const PUBLIC_KEY = /^[A-Za-z][A-Za-z0-9_]{0,47}$/;
const NUMERIC_LIKE = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;
export function publicRow(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('publicRow: Objekt erwartet');
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!PUBLIC_KEY.test(k)) throw new Error(`publicRow: unzulaessiger Schluessel ${JSON.stringify(k).slice(0, 60)}`);
    if (typeof v === 'boolean') { out[k] = v; continue; }
    if (typeof v === 'number') {
      if (!Number.isSafeInteger(v) || Math.abs(v) > 1e7) throw new Error(`publicRow: ${k} ist keine zulaessige ganze Zahl`);
      out[k] = v; continue;
    }
    if (typeof v === 'string') {
      if (!PUBLIC_ENUM.test(v) || NUMERIC_LIKE.test(v)) throw new Error(`publicRow: ${k} ist keine zulaessige Enum-Kennung`);
      out[k] = v; continue;
    }
    throw new Error(`publicRow: ${k} hat unzulaessigen Typ ${v === null ? 'null' : typeof v}`);
  }
  return Object.freeze(out);
}
export const formatPublic = (row) => Object.entries(publicRow(row)).map(([k, v]) => `${k}=${v}`).join(' ');
export const enumId = (key) => String(key).replace('@', '_');

// ---------- reine Statistik ----------
export function jaccard(a, b) {
  const A = a instanceof Set ? a : new Set(a), B = b instanceof Set ? b : new Set(b);
  if (!A.size && !B.size) return null;
  let inter = 0; for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}
// Anteil gleicher Titel: |A n B| / min(|A|, |B|) (Ueberlappungskoeffizient).
export function sharedShare(a, b) {
  const A = a instanceof Set ? a : new Set(a), B = b instanceof Set ? b : new Set(b);
  const m = Math.min(A.size, B.size); if (!m) return null;
  let inter = 0; for (const x of A) if (B.has(x)) inter++;
  return inter / m;
}
export function pearson(x, y) {
  const xs = [], ys = [];
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (fin(x[i]) && fin(y[i])) { xs.push(x[i]); ys.push(y[i]); }
  const n = xs.length; if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}
// Pearson ueber gemeinsame Datumsschluessel zweier Maps date -> Wert; weniger als minN gemeinsame Tage -> null.
export function pearsonOnCommon(mapA, mapB, minN = 30) {
  const x = [], y = [];
  for (const [d, v] of [...mapA].sort((a, b) => a[0].localeCompare(b[0]))) { const w = mapB.get(d); if (fin(v) && fin(w)) { x.push(v); y.push(w); } }
  return x.length < minN ? null : pearson(x, y);
}
export function isoWeekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3); // Donnerstag der Woche
  const y = d.getUTCFullYear(), jan4 = new Date(Date.UTC(y, 0, 4));
  const wk = 1 + Math.round(((d - jan4) / 864e5 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${y}-W${String(wk).padStart(2, '0')}`;
}
export const titleOf = (listingId) => String(listingId).split('#')[0];
// Einstiege als Menge "Titel|Einstiegs-Kalenderwoche"; Eintraege { listingId, entry: { date } } oder { listingId, date }.
export function entryKeys(trades) { return new Set(trades.map((t) => `${titleOf(t.listingId)}|${isoWeekKey(t.entry?.date ?? t.date)}`)); }
export function titleSet(trades) { return new Set(trades.map((t) => titleOf(t.listingId))); }
export function overlapStats(tradesA, tradesB) {
  return { jaccard: jaccard(entryKeys(tradesA), entryKeys(tradesB)), sameTitleShare: sharedShare(titleSet(tradesA), titleSet(tradesB)), entriesA: tradesA.length, entriesB: tradesB.length };
}
// Tagesrendite je Datum aus einer Kurve [{date, equity}], nur Daten in [from, to].
export function dailyReturnMap(equity, from = '0000', to = '9999') {
  const m = new Map();
  for (let i = 1; i < equity.length; i++) { const d = equity[i].date; if (d < from || d > to) continue; m.set(d, equity[i].equity / equity[i - 1].equity - 1); }
  return m;
}
export function excessMap(retMap, spyRet) {
  const m = new Map(); for (const [d, r] of retMap) { const s = spyRet.get(d); if (fin(s)) m.set(d, r - s); }
  return m;
}

// ---------- Regime / Segmente ----------
// Zustand am Schluss des Vortags (kein Vorgriff): Bull = SPY ueber 200-Tage-Linie, Vol hoch = 21-Tage-Realized-Vol (Stichproben-SD der
// Tagesrenditen) >= Median ueber die Tage des Fensters. Rueckgabe: Map(Datum -> { trend: 'BULL'|'BEAR', vol: 'HIGH'|'LOW' }).
export function buildRegimes(dates, closes, { smaN = 200, volN = 21, from, to } = {}) {
  const n = closes.length, sma = new Array(n).fill(NaN), vol = new Array(n).fill(NaN);
  let s = 0;
  for (let i = 0; i < n; i++) { s += closes[i]; if (i >= smaN) s -= closes[i - smaN]; if (i >= smaN - 1) sma[i] = s / smaN; }
  for (let i = volN; i < n; i++) {
    let m = 0; for (let j = i - volN + 1; j <= i; j++) m += closes[j] / closes[j - 1] - 1; m /= volN;
    let q = 0; for (let j = i - volN + 1; j <= i; j++) q += (closes[j] / closes[j - 1] - 1 - m) ** 2;
    vol[i] = Math.sqrt(q / (volN - 1));
  }
  const inWin = []; for (let i = 0; i < n; i++) if ((from == null || dates[i] >= from) && (to == null || dates[i] <= to) && fin(vol[i])) inWin.push(vol[i]);
  inWin.sort((a, b) => a - b);
  const volMedian = quantile(inWin, 0.5), map = new Map();
  for (let i = 0; i + 1 < n; i++) {
    const g = {}; if (fin(sma[i])) g.trend = closes[i] > sma[i] ? 'BULL' : 'BEAR'; if (fin(vol[i]) && fin(volMedian)) g.vol = vol[i] >= volMedian ? 'HIGH' : 'LOW';
    if (g.trend || g.vol) map.set(dates[i + 1], g);
  }
  return { map, volMedian };
}
export function segmentTags(date, regimeMap, splitDate) {
  const tags = [date <= splitDate ? 'early' : 'late'], g = regimeMap.get(date);
  if (g?.trend) tags.push(g.trend === 'BULL' ? 'bull' : 'bear');
  if (g?.vol) tags.push(g.vol === 'HIGH' ? 'highVol' : 'lowVol');
  return tags;
}
// entries: [{ date, ex, mon }] (ex = Ueberrendite 63d). Rueckgabe je Segment und gesamt: n, Mittel, Median, Cluster, t, Richtung.
export function segmentSignal(entries, regimeMap, splitDate) {
  const buckets = Object.fromEntries(SEGMENTS.map((s) => [s, []])); const all = [];
  for (const e of entries) { if (!fin(e.ex)) continue; all.push(e); for (const t of segmentTags(e.date, regimeMap, splitDate)) buckets[t].push(e); }
  const sum = (arr) => { const v = arr.map((e) => e.ex), s = summarize(v), c = clusterT(v, arr.map((e) => e.mon)); return { n: s.n, mean: s.n ? s.mean : null, median: s.n ? s.median : null, clusters: c.clusters, t: c.t, dir: s.n ? Math.sign(s.mean) : 0 }; };
  return { overall: sum(all), segments: Object.fromEntries(SEGMENTS.map((s) => [s, sum(buckets[s])])) };
}

// ---------- Einstiegsrecord (Signalqualitaet) ----------
// series: { date[], close[], high[], low[], tri[] } (tri = Total-Return-Index der Reihe); px = Einstiegspreis; ei = Einstiegsindex.
// opts: { delisted, delistClassAcq, spyFrom(dateA, dateB) }. Formeln wie audit-r14 (fwdFrom/spy/MFE-MAE), Horizonte 21/63/126.
export function entryRecord(series, ei, px, opts) {
  const { date: d, close: c, high, low, tri } = series, n = d.length;
  const factor = opts.delisted ? (opts.delistClassAcq ? 1 - SLIP : 0.7) : null;
  const fwd = HORIZONS.map((h) => {
    const j = ei + h;
    if (j < n) return (tri[j] / tri[ei]) * (c[ei] / px) - 1;
    return opts.delisted ? (tri[n - 1] / tri[ei]) * (c[ei] / px) * factor - 1 : NaN;
  });
  const spy = HORIZONS.map((h) => { if (ei + h >= n && !opts.delisted) return NaN; return opts.spyFrom(d[ei], d[Math.min(ei + h, n - 1)]); });
  const mfe = {}, mae = {};
  for (const w of MFE_WINDOWS) {
    if (ei + w >= n && !opts.delisted) { mfe[w] = NaN; mae[w] = NaN; continue; }
    let mx = -Infinity, mn = Infinity;
    for (let i = ei; i <= Math.min(n - 1, ei + w); i++) { mx = Math.max(mx, high[i] / px - 1); mn = Math.min(mn, low[i] / px - 1); }
    mfe[w] = mx; mae[w] = mn;
  }
  return { date: d[ei], listingId: opts.listingId ?? null, mon: d[ei].slice(0, 7), fwd, spy, ex: fwd.map((v, i) => v - spy[i]), mfe, mae };
}

// Signalqualitaet je Horizont aus Records.
export function signalQuality(recs) {
  const mon = recs.map((r) => r.mon), byHorizon = {};
  HORIZONS.forEach((h, i) => {
    const ex = recs.map((r) => r.ex[i]), s = summarize(ex), c = clusterT(ex, mon);
    byHorizon[h] = { n: s.n, mean: s.n ? s.mean : null, median: s.n ? s.median : null, hitRate: s.n ? s.pos : null, clusters: c.clusters, clusterMean: c.mean, clusterT: c.t, raw: summarize(recs.map((r) => r.fwd[i])) };
  });
  const mfeMae = Object.fromEntries(MFE_WINDOWS.map((w) => [w, { mfe: summarize(recs.map((r) => r.mfe[w])), mae: summarize(recs.map((r) => r.mae[w])) }]));
  return { entries: recs.length, byHorizon, mfeMae };
}

// ---------- Portfolio ----------
// equity [{date, equity, exposure, n}], tradeReturns: abgeschlossene Trade-Renditen, tradedNotional: Summe Kauf+Verkauf (Einheit Kapital),
// spyCurve: [{date, value}] (Total Return).
export function portfolioMetrics({ equity, tradeReturns, tradedNotional, spyCurve }) {
  const n = equity.length, first = equity[0], last = equity[n - 1];
  const yrs = (Date.parse(last.date) - Date.parse(first.date)) / (365.25 * 864e5);
  const rets = []; for (let i = 1; i < n; i++) rets.push(equity[i].equity / equity[i - 1].equity - 1);
  const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const sd = rets.length > 1 ? Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1)) : null;
  const cagr = (last.equity / first.equity) ** (1 / yrs) - 1;
  const spyPts = spyCurve.filter((p) => p.date >= first.date && p.date <= last.date);
  const spyCagr = cagrBetween(spyCurve, first.date, last.date, 'value'), spyMdd = spyPts.length ? maxDrawdown(spyPts, 'value') : null;
  const meanEq = equity.reduce((a, q) => a + q.equity, 0) / n;
  const tr = tradeReturns.filter(fin), wins = tr.filter((r) => r > 0), losses = tr.filter((r) => r < 0), avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  return { days: n, years: yrs, cagr, totalReturn: last.equity / first.equity - 1, maxDrawdown: maxDrawdown(equity), vol: sd == null ? null : sd * Math.sqrt(252), sharpe: sd > 0 ? (mean / sd) * Math.sqrt(252) : null,
    turnoverPerYear: tradedNotional / meanEq / yrs, trades: tr.length, hitRate: tr.length ? wins.length / tr.length : null, avgWin: avg(wins), avgLoss: avg(losses),
    spy: { cagr: spyCagr, maxDrawdown: spyMdd, totalReturn: spyPts.length > 1 ? spyPts[spyPts.length - 1].value / spyPts[0].value - 1 : null },
    excessCagr: fin(spyCagr) ? cagr - spyCagr : null };
}

// Drawdown-Reihe (Abstand zum bisherigen Hoch) je Tag im Fenster; Ueberlappung = Tage, an denen beide >= thr unter dem Hoch liegen / Tage, an denen mindestens einer es tut.
export function drawdownMap(equity, from, to) {
  const m = new Map(); let peak = -Infinity;
  for (const q of equity) { if (!(q.equity > 0)) continue; peak = Math.max(peak, q.equity); if (q.date >= from && q.date <= to) m.set(q.date, 1 - q.equity / peak); }
  return m;
}
export function drawdownOverlap(a, b, thr = 0.10) {
  let both = 0, either = 0;
  for (const [d, x] of a) { const y = b.get(d); if (y === undefined) continue; const ia = x >= thr, ib = y >= thr; if (ia && ib) both++; if (ia || ib) either++; }
  return either ? both / either : null;
}

// Klassen einer Methode (ganze Zahlen/Enums). sig63: byHorizon[63] aus signalQuality; rob: Ergebnis von segmentSignal.
export function methodClasses({ sig63, portfolio, exposureMean, rob }) {
  const rc = regimeConsistency(rob.overall.mean, rob.segments);
  return {
    signalEdge63: classifySignalEdge({ t: sig63.clusterT, median: sig63.median, n: sig63.n, clusters: sig63.clusters }),
    portfolioVsSpy: classifyPortfolioVsSpy(portfolio.excessCagr),
    drawdownVsSpy: classifyDrawdownVsSpy(portfolio.maxDrawdown, portfolio.spy.maxDrawdown),
    exposureClass: classifyExposure(exposureMean),
    regimeConsistency: rc.consistent, regimeConsistentN30: rc.consistentN30, regimeSegmentsN30: rc.segmentsN30,
  };
}
export function pairClasses({ jaccard: j, retCorr }) { return { overlapClass: classifyOverlap(j), returnCorrelationClass: classifyReturnCorrelation(retCorr) }; }

// ---------- Lauf ----------
async function main() {
  const argv = process.argv.slice(2);
  const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  const OUT = arg('--out', path.join(os.tmpdir(), 'standard-frame')); const LIMIT = Number(arg('--limit', '0'));
  const HOLD = L.WINDOW_NAME === 'HOLDOUT', W = L.WINDOW, split = SPLIT_DATE[L.WINDOW_NAME];
  if (HOLD) throw new Error('HOLDOUT in diesem Modus gesperrt (PREREGISTRATION-TRIAGE A1)');
  fs.mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();
  const log = (m) => console.log(`[standard ${L.WINDOW_NAME} +${Math.round((Date.now() - t0) / 1000)}s] ${m}`); // nur feste Texte und Zaehler
  const pub = (row) => log(formatPublic(row));
  const openedAt = new Date().toISOString();
  const { segs, calendar, spyTR, spyAdj, bench, delistCoverage, secCoverage, dataFingerprint } = await loadPitData({ LIMIT, log, excludeNonEquity: true, delistPit: true, secPit: true, secPitKey: HOLD ? '_validation/sec-pit-r12.json.gz' : '_validation/sec-pit-r11.json.gz' });
  const spyDates = spyAdj.date, spyRet = new Map(), spyTri = new Float64Array(spyDates.length), spyPos = new Map(spyDates.map((d, i) => [d, i]));
  spyTri[0] = 1; for (let i = 1; i < spyDates.length; i++) { const r = spyAdj.tr[i] ?? 0; spyTri[i] = spyTri[i - 1] * (1 + r); if (spyDates[i] >= W.from && spyDates[i] <= W.to) spyRet.set(spyDates[i], r); }
  const spyFrom = (a, b) => { const x = spyPos.get(a), y = spyPos.get(b); if (x == null || y == null) return NaN; return (spyTri[y] / spyTri[x]) * (spyAdj.close[x] / spyAdj.open[x]) - 1; };
  const { map: regimeMap } = buildRegimes(spyDates, spyAdj.close, { from: W.from, to: W.to });
  const MOK = marketOkMap(spyAdj);
  const keyOf = (e) => `${e.id}@${e.version}`;
  const R = Object.fromEntries(ENGINES_R14.map((e) => [keyOf(e), { base: [], recs: [] }]));
  const stocks = []; let k = 0;
  for (const seg of segs) {
    const ctx = segCtx(seg, bench), d = ctx.bars.date, n = d.length;
    const tri = new Float64Array(n); tri[0] = 1; for (let i = 1; i < n; i++) tri[i] = tri[i - 1] * (1 + (Number.isFinite(ctx.tr[i]) ? ctx.tr[i] : 0));
    const series = { date: d, close: ctx.bars.close, high: ctx.bars.high, low: ctx.bars.low, tri };
    for (const e of ENGINES_R14) {
      const r = R[keyOf(e)], base = tradesFor(e, seg, ctx, DEFAULT_EXECUTION);
      r.base.push(...base);
      for (const t of base) { const ei = d.indexOf(t.entry.date); if (ei < 0) continue; r.recs.push(entryRecord(series, ei, t.entry.price, { delisted: !!seg.delisted, delistClassAcq: seg.delistClass === 'ACQUISITION', spyFrom, listingId: seg.id })); }
    }
    const a = L.adjustSeries(seg.raw), nn = a.date.length;
    stocks.push({ id: seg.id, symbol: seg.id.split(':')[2], survivor: seg.survivor, bars: { date: a.date, open: a.open, high: a.high, low: a.low, close: a.close, volume: a.volume }, divAdj: a.divAdj, rs: seg.cross?.rs || null,
      terminal: seg.delisted ? { date: a.date[nn - 1], lastClose: a.close[nn - 1], distress: L.distressSignature(a.rawClose), kind: 'DELISTED', delistClass: seg.delistClass || null } : null });
    seg.raw = null;
    if (++k % 1000 === 0) pub({ phase: 'simulate', done: k, of: segs.length });
  }
  pub({ phase: 'simulationDone', segments: segs.length });

  // Je Methode: Portfolio, Exposure, Signal, Robustheit; kompakte Zwischenstaende fuer die Paare.
  const M = {}, keep = {}; // keep: Einstiege (Titel, Datum), Tagesrenditen
  const finalize = ({ key, equity, tradeReturns, tradedNotional, entries, recs, cfg }) => {
    const eqIn = equity.map((q) => ({ ...q, n: q.n ?? q.positions ?? 0 }));
    const portfolio = portfolioMetrics({ equity: eqIn, tradeReturns, tradedNotional, spyCurve: spyTR });
    const exposure = exposureStats(eqIn), sig = signalQuality(recs);
    const rob = segmentSignal(recs.map((r) => ({ date: r.date, ex: r.ex[1], mon: r.mon })), regimeMap, split);
    const classes = methodClasses({ sig63: sig.byHorizon[63], portfolio, exposureMean: exposure.mean, rob });
    M[key] = { key, cfg, tradeSetBasis: key === TREND_KEY ? 'EXECUTED_CLOSED_TRADES_ONLY' : 'ALL_ENGINE_SIGNALS', engineTrades: entries.length, takenTrades: tradeReturns.length, signal: sig, portfolio, exposure, robustness: rob, classes };
    keep[key] = { entries: entries.map((t) => ({ listingId: t.listingId, date: t.entry.date })), ret: dailyReturnMap(eqIn, W.from, W.to), dd: drawdownMap(eqIn, W.from, W.to) };
    pub({ phase: 'method', m: enumId(key), engineTrades: entries.length, takenTrades: tradeReturns.length, ...classes });
  };
  for (const e of ENGINES_R14) {
    const key = keyOf(e), r = R[key], cfg = e.portfolio;
    const cal = [...new Set([...calendar, ...r.base.flatMap((t) => [t.entry.date, ...t.exits.map((x) => x.date)]).filter((x) => x >= W.from && x <= W.to)])].sort();
    const run = runPortfolioTR(r.base, cal, cfg, { marketOk: MOK, scenario: 'S1C_CLASSIFIED' });
    const done = run.taken.filter((p) => p.pnl !== undefined);
    finalize({ key, equity: run.equity, tradeReturns: done.map((p) => p.returnPct), tradedNotional: run.taken.reduce((a, p) => a + p.cost + (p.proceeds || 0), 0), entries: r.base, recs: r.recs,
      cfg: { riskPerTrade: cfg.riskPerTrade, maxPositionPct: cfg.maxPositionPct, maxPositions: cfg.maxPositions, priority: cfg.priority, marketFilter: !!cfg.marketFilter, progressive: cfg.progressive || null, turtleNotional: cfg.turtleNotional || null } });
    R[key] = null;
  }
  // VU Trendfolge 52W (wie audit-r14: PP, CLENOW, S1C)
  const spy = { date: spyAdj.date, close: spyAdj.close };
  const rot = simulateRotation(stocks, calendar, spy, { from: W.from, to: W.to, variant: 'PP', rank: 'CLENOW', scenario: 'S1C_CLASSIFIED' });
  const sIdx = new Map(stocks.map((s, i) => [s.id, i])), t52recs = [];
  for (const t of rot.trades) {
    const s = stocks[sIdx.get(t.listingId)]; if (!s) continue; const d = s.bars.date, c = s.bars.close, ei = d.indexOf(t.entry.date); if (ei < 0) continue;
    const tri = new Float64Array(d.length); tri[0] = 1; for (let i = 1; i < d.length; i++) tri[i] = tri[i - 1] * ((c[i] + (s.divAdj[i] || 0)) / c[i - 1]);
    t52recs.push(entryRecord({ date: d, close: c, high: s.bars.high, low: s.bars.low, tri }, ei, t.entry.price, { delisted: !!s.terminal, delistClassAcq: s.terminal?.delistClass === 'ACQUISITION', spyFrom, listingId: s.id }));
  }
  finalize({ key: TREND_KEY, equity: rot.equity, tradeReturns: rot.trades.map((t) => t.returnPct), tradedNotional: rot.book.commissions / COMM, entries: rot.trades, recs: t52recs, cfg: { variant: 'PP', rank: 'CLENOW', scenario: 'S1C_CLASSIFIED' } });

  // Paare
  const keys = Object.keys(M), pairs = [];
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const A = keep[keys[i]], B = keep[keys[j]];
    const ov = overlapStats(A.entries, B.entries);
    const retCorr = pearsonOnCommon(A.ret, B.ret), excessCorr = pearsonOnCommon(excessMap(A.ret, spyRet), excessMap(B.ret, spyRet));
    const classes = pairClasses({ jaccard: ov.jaccard, retCorr });
    pairs.push({ a: keys[i], b: keys[j], ...ov, returnPearson: retCorr, excessPearson: excessCorr, drawdownOverlap: drawdownOverlap(A.dd, B.dd, 0.10), comparableTradeSets: (keys[i] === TREND_KEY) === (keys[j] === TREND_KEY), classes });
    pub({ phase: 'pair', m1: enumId(keys[i]), m2: enumId(keys[j]), ...classes });
  }

  let commit = null; try { commit = execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim(); } catch { commit = process.env.GITHUB_SHA || null; }
  const result = { schema: SCHEMA_FRAME, prereg: PREREG_TRIAGE, window: L.WINDOW_NAME, period: W, splitDate: split, openedAt, at: new Date().toISOString(), commit, limit: LIMIT || null,
    engines: ENGINES_R14.map((e) => ({ key: keyOf(e), cfg: M[keyOf(e)].cfg })).concat([{ key: TREND_KEY, cfg: M[TREND_KEY].cfg }]), execution: DEFAULT_EXECUTION, thresholds: THRESHOLDS,
    dataFingerprint, universe: { segments: segs.length, delistCoverage, secCoverage }, methods: M, pairs };
  const pem = fs.readFileSync(path.join(root, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  const name = `standard-frame${HOLD ? '-holdout' : ''}${LIMIT ? '-smoke' : ''}`;
  fs.writeFileSync(path.join(OUT, `${name}.sealed.json`), L.encryptForOwner(pem, Buffer.from(JSON.stringify(result))));
  pub({ phase: 'done', window: L.WINDOW_NAME, commit: commit ? `sha_${commit.slice(0, 12)}` : 'none', fingerprint: `fp_${String(dataFingerprint.hash).slice(0, 16)}`, segments: segs.length, methods: keys.length, pairs: pairs.length, smoke: !!LIMIT, sealed: true });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(String(e?.message || e).slice(0, 300)); process.exit(1); });
