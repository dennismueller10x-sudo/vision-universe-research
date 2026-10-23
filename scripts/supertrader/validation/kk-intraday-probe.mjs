#!/usr/bin/env node
// Supertrader – Kullamaegi Episodic Pivot / Parabolic Short: Zugangs- und Qualitaetsprobe der
// historischen Tiingo-Intraday-Minuten (Phase 1, chart-first). Kleine, budgetierte Abfrage
// (MAX_REQUESTS), kein Massendownload, nur der bestehende Schluessel.
//
//   node scripts/supertrader/validation/kk-intraday-probe.mjs --out DIR
//
// Je Fall (Gap- bzw. Parabel-Tag, vor jeder Messung festgelegt):
//  - /iex/{t}/prices 1 Minute und 5 Minuten (IEX ist EIN Handelsplatz),
//  - /tiingo/daily/{t}/prices (konsolidierter Tagesbalken, roh),
//  - fuer wenige Faelle /tiingo/equity/intraday (Beta, Runde 10: lieferte IEX-Werte ohne Volumen)
//    und die IEX-Minuten der 10 Vortage (relatives Eroeffnungsvolumen).
// Gemessen werden nur Verhaeltnisse und Zaehlwerte (dayQuality): Abdeckung, Uhrzeit erster/letzter
// Balken, IEX-Volumenanteil am konsolidierten Tagesvolumen, Abweichung Hoch/Tief/Eroeffnung, ob
// Opening Range und VWAP berechenbar sind, Konsistenz 5-Minuten zu aggregierten 1-Minuten-Balken.
// Rechte (Runde 9): nur interne, nicht anzeigende Nutzung. Kurse und Zeitreihen nur verschluesselt;
// das oeffentliche Log zeigt gerundete Verhaeltnisse, keine Kurse.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from './lib.mjs';
import { etClock } from './intraday-oracle.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BASE = 'https://api.tiingo.com';
export const KK_PROBE_VERSION = 'kk-intraday-probe-1.1.0';
export const MAX_REQUESTS = 100;

// EP: grosse Gap-Tage (Ergebnis-/Ereignistage, bewusst ohne Katalysatordaten ausgewaehlt);
// PS: Parabel- und Umkehrtage; dazu ein delisteter Titel und ein Tag aus 2017.
export const PROBE_CASES = Object.freeze([
  ['EP', 'NVDA', '2023-05-25'], ['EP', 'META', '2023-02-02'], ['EP', 'PLTR', '2024-11-05'], ['EP', 'SMCI', '2024-01-19'],
  ['EP', 'CVNA', '2023-07-19'], ['EP', 'APP', '2024-11-07'], ['EP', 'AFRM', '2023-08-30'], ['EP', 'TWTR', '2022-04-04'],
  ['PS', 'GME', '2021-01-27'], ['PS', 'GME', '2021-01-28'], ['PS', 'AMC', '2021-06-02'], ['PS', 'AMC', '2021-06-03'],
  ['PS', 'TSLA', '2020-02-04'], ['PS', 'TSLA', '2020-02-05'], ['PS', 'MSTR', '2024-11-21'], ['PS', 'SMCI', '2024-03-08'],
  ['COVERAGE', 'SNAP', '2017-03-02'],
]);
export const RELVOL_CASES = Object.freeze([['NVDA', '2023-05-25'], ['GME', '2021-01-27'], ['CVNA', '2023-07-19']]);
export const CONSOLIDATED_CASES = Object.freeze([['NVDA', '2023-05-25'], ['GME', '2021-01-27'], ['APP', '2024-11-07'], ['SNAP', '2017-03-02']]);
// 1.1.0: can one request return the IEX daily volume of many prior days (venue-consistent volume baseline)?
export const IEX_RANGE_CASES = Object.freeze([['NVDA', '2023-04-24', '2023-05-24']]);
export const IEX_RANGE_FREQS = Object.freeze(['1day', '4hour', '1hour']);
export const MODE_RANGE_ONLY = '--range-only';
export const SESSION_MINUTES = 390;
export const OPENING_RANGES = Object.freeze([5, 15, 30]);

const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const r3 = (x) => (fin(x) ? Math.round(x * 1000) / 1000 : null);
const minutesFromOpen = (iso) => {
  const [h, m] = etClock(iso).split(':').map(Number);
  return (h - 9) * 60 + (m - 30);
};

/** Sum of the volume of the 1-minute bars in the first `n` session minutes (09:30 <= t < 09:30 + n). */
export function openingVolume(bars, n) {
  let v = 0;
  for (const b of bars) { const k = minutesFromOpen(b.date); if (k >= 0 && k < n && fin(b.volume)) v += b.volume; }
  return v;
}

/** 5-minute bars aggregated from 1-minute bars by session minute (bucket = floor(minute / 5)). */
export function aggregate5(bars) {
  const out = new Map();
  for (const b of bars) {
    const k = Math.floor(minutesFromOpen(b.date) / 5);
    const a = out.get(k);
    if (!a) out.set(k, { k, high: b.high, low: b.low, volume: b.volume || 0 });
    else { a.high = Math.max(a.high, b.high); a.low = Math.min(a.low, b.low); a.volume += b.volume || 0; }
  }
  return out;
}

/**
 * Quality ratios of one day (no prices in the output): coverage, venue share, agreement with the consolidated daily
 * bar, opening range and VWAP availability, 5-minute consistency. bars1m / bars5m: Tiingo IEX bars; eod: raw daily bar.
 */
export function dayQuality(bars1m, bars5m, eod) {
  const n = bars1m.length;
  const q = { bars1m: n, bars5m: bars5m.length, coverage: r3(n / SESSION_MINUTES) };
  if (!n) return q;
  const mins = bars1m.map((b) => minutesFromOpen(b.date));
  q.firstEt = etClock(bars1m[0].date); q.lastEt = etClock(bars1m[n - 1].date);
  q.outsideSession = mins.filter((m) => m < 0 || m >= SESSION_MINUTES).length;
  const hi = Math.max(...bars1m.map((b) => b.high)), lo = Math.min(...bars1m.map((b) => b.low));
  const vol = bars1m.reduce((a, b) => a + (fin(b.volume) ? b.volume : 0), 0);
  q.volumePresent = bars1m.some((b) => fin(b.volume));
  for (const nmin of OPENING_RANGES) q[`openingRange${nmin}Bars`] = mins.filter((m) => m >= 0 && m < nmin).length;
  let pv = 0, vv = 0;
  for (const b of bars1m) if (fin(b.volume) && b.volume > 0 && fin(b.close)) { const tp = (b.high + b.low + b.close) / 3; pv += tp * b.volume; vv += b.volume; }
  const vwap = vv > 0 ? pv / vv : null;
  q.vwapComputable = fin(vwap);
  if (eod) {
    q.eodPresent = true;
    q.iexVolumeShare = eod.volume ? r3(vol / eod.volume) : null;
    q.highVsEod = r3(hi / eod.high - 1); q.lowVsEod = r3(lo / eod.low - 1);
    q.firstOpenVsOfficialOpen = r3(bars1m[0].open / eod.open - 1);
    q.vwapInsideDailyRange = fin(vwap) ? vwap >= eod.low * 0.999 && vwap <= eod.high * 1.001 : null;
    q.vwapVsDailyTypical = fin(vwap) ? r3(vwap / ((eod.high + eod.low + eod.close) / 3) - 1) : null;
  }
  if (bars5m.length) {
    // the 5-minute timestamp may label the start or the end of its bucket: both alignments are measured, the better kept
    const agg = aggregate5(bars1m);
    const align = (off) => {
      let cmp = 0, maxDiff = 0, volA = 0, volB = 0;
      for (const b of bars5m) {
        const a = agg.get(Math.floor(minutesFromOpen(b.date) / 5) + off); if (!a) continue;
        cmp++; maxDiff = Math.max(maxDiff, Math.abs(a.high / b.high - 1), Math.abs(a.low / b.low - 1));
        volA += a.volume; volB += fin(b.volume) ? b.volume : 0;
      }
      return { off, cmp, maxDiff, ratio: volB ? volA / volB : null };
    };
    const best = [align(0), align(-1)].sort((x, y) => (x.cmp && y.cmp ? x.maxDiff - y.maxDiff : y.cmp - x.cmp))[0];
    q.fiveMinuteLabel = best.off === 0 ? 'BUCKET_START' : 'BUCKET_END';
    q.fiveMinuteCompared = best.cmp; q.fiveMinuteMaxPriceDiff = r3(best.maxDiff); q.fiveMinuteVolumeRatio = r3(best.ratio);
  }
  return q;
}

async function getJson(url, key, budget) {
  if (budget.used >= MAX_REQUESTS) return { status: 'BUDGET_EXHAUSTED', body: null };
  budget.used++;
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(url, { headers: { Authorization: 'Token ' + key, 'Content-Type': 'application/json' } });
      if (r.status === 429 || r.status >= 500) { await new Promise((res) => setTimeout(res, 2000 * (a + 1))); continue; }
      const t = await r.text(); let b = null; try { b = JSON.parse(t); } catch { b = null; }
      return { status: r.status, body: b };
    } catch { await new Promise((res) => setTimeout(res, 2000)); }
  }
  return { status: 0, body: null };
}

const iexUrl = (t, d, f) => `${BASE}/iex/${t}/prices?startDate=${d}&endDate=${d}&resampleFreq=${f}&columns=open,high,low,close,volume`;
const eodUrl = (t, from, to = from) => `${BASE}/tiingo/daily/${t}/prices?startDate=${from}&endDate=${to}`;
const mvUrl = (t, d) => `${BASE}/tiingo/equity/intraday/${t}/prices?startDate=${d}&endDate=${d}&resampleFreq=1min`;
const arr = (r) => (Array.isArray(r.body) ? r.body : []);
const pause = () => new Promise((r) => setTimeout(r, 400));
const shiftDays = (d, k) => new Date(Date.parse(d + 'T00:00:00Z') + k * 864e5).toISOString().slice(0, 10);

async function main() {
  const argv = process.argv.slice(2);
  const OUT = argv[argv.indexOf('--out') + 1] || '/tmp/kk-probe';
  fs.mkdirSync(OUT, { recursive: true });
  const KEY = process.env.TIINGO_API_KEY;
  if (!KEY) { console.error('TIINGO_API_KEY fehlt'); process.exit(2); }
  const budget = { used: 0 };
  const results = [], sealed = [];
  // IEX multi-day ranges: per-day sums of the bars (date in ET), counted, no prices
  const ranges = [];
  for (const [t, from, to] of IEX_RANGE_CASES) for (const f of IEX_RANGE_FREQS) {
    const r = await getJson(`${BASE}/iex/${t}/prices?startDate=${from}&endDate=${to}&resampleFreq=${f}&columns=open,high,low,close,volume`, KEY, budget); await pause();
    const days = new Map();
    for (const b of arr(r)) { const k = new Date(b.date).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); days.set(k, (days.get(k) || 0) + (fin(b.volume) ? b.volume : 0)); }
    const x = { ticker: t, from, to, freq: f, status: r.status, bars: arr(r).length, days: days.size, daysWithVolume: [...days.values()].filter((v) => v > 0).length, error: Array.isArray(r.body) ? null : String(r.body?.detail ?? '').slice(0, 160) };
    ranges.push(x); sealed.push({ kind: 'RANGE', ...x, raw: arr(r) });
    console.log(`RANGE ${t} ${from}..${to} ${f}: ${r.status}, Balken ${x.bars}, Tage ${x.days} (mit Volumen ${x.daysWithVolume})${x.error ? ' ' + x.error : ''}`);
  }
  for (const [kind, t, d] of argv.includes(MODE_RANGE_ONLY) ? [] : PROBE_CASES) {
    const m1 = await getJson(iexUrl(t, d, '1min'), KEY, budget); await pause();
    const m5 = await getJson(iexUrl(t, d, '5min'), KEY, budget); await pause();
    const eod = await getJson(eodUrl(t, d), KEY, budget); await pause();
    const e = arr(eod)[0] ?? null;
    const q = dayQuality(arr(m1), arr(m5), e ? { open: e.open, high: e.high, low: e.low, close: e.close, volume: e.volume } : null);
    results.push({ kind, ticker: t, date: d, iexStatus: m1.status, iex5Status: m5.status, eodStatus: eod.status, ...q });
    sealed.push({ kind, ticker: t, date: d, bars1m: arr(m1), bars5m: arr(m5), eod: e });
    console.log(`${kind} ${t} ${d}: IEX1 ${m1.status}/${q.bars1m} IEX5 ${m5.status}/${q.bars5m} EOD ${eod.status} | Abdeckung ${q.coverage} Volumenanteil ${q.iexVolumeShare ?? '-'} Hoch ${q.highVsEod ?? '-'} Tief ${q.lowVsEod ?? '-'} Eroeffnung ${q.firstOpenVsOfficialOpen ?? '-'} OR5/15/30 ${q.openingRange5Bars ?? 0}/${q.openingRange15Bars ?? 0}/${q.openingRange30Bars ?? 0} VWAP ${q.vwapComputable ? (q.vwapInsideDailyRange ? 'im Tagesbereich' : 'AUSSERHALB') : 'nein'} 5min-Diff ${q.fiveMinuteMaxPriceDiff ?? '-'} 5min-Vol ${q.fiveMinuteVolumeRatio ?? '-'}`);
  }
  // relatives Eroeffnungsvolumen: IEX-Volumen der ersten 30 Minuten gegen den Mittelwert der 10 Vortage (nur IEX-Anteil)
  const relvol = [];
  for (const [t, d] of argv.includes(MODE_RANGE_ONLY) ? [] : RELVOL_CASES) {
    const cal = await getJson(eodUrl(t, shiftDays(d, -21), shiftDays(d, -1)), KEY, budget); await pause();
    const prior = arr(cal).map((x) => String(x.date).slice(0, 10)).slice(-10);
    const vols = [];
    for (const p of prior) { const r = await getJson(iexUrl(t, p, '1min'), KEY, budget); vols.push(openingVolume(arr(r), 30)); await pause(); }
    const day = results.find((x) => x.ticker === t && x.date === d), dayBars = sealed.find((x) => x.ticker === t && x.date === d)?.bars1m ?? [];
    const mean = vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : null;
    const rel = mean ? r3(openingVolume(dayBars, 30) / mean) : null;
    relvol.push({ ticker: t, date: d, priorDays: prior.length, priorDaysWithVolume: vols.filter((v) => v > 0).length, relativeOpening30Volume: rel, dayCoverage: day?.coverage ?? null });
    console.log(`RELVOL ${t} ${d}: Vortage ${prior.length} (mit Volumen ${vols.filter((v) => v > 0).length}), relatives IEX-Volumen erste 30 Min ${rel ?? '-'}`);
  }
  // konsolidierter Beta-Endpunkt getrennt von IEX (Runde 10: IEX-Werte ohne Volumen)
  const consolidated = [];
  for (const [t, d] of argv.includes(MODE_RANGE_ONLY) ? [] : CONSOLIDATED_CASES) {
    const r = await getJson(mvUrl(t, d), KEY, budget); await pause();
    const b = arr(r), iex = sealed.find((x) => x.ticker === t && x.date === d)?.bars1m ?? [];
    const byTs = new Map(iex.map((x) => [x.date, x]));
    let same = 0, cmp = 0; for (const x of b) { const y = byTs.get(x.date); if (!y) continue; cmp++; if (x.high === y.high && x.low === y.low) same++; }
    const c = { ticker: t, date: d, status: r.status, bars: b.length, volumeField: b.some((x) => 'volume' in x), comparedWithIex: cmp, identicalHighLowShare: cmp ? r3(same / cmp) : null, firstEt: b.length ? etClock(b[0].date) : null, lastEt: b.length ? etClock(b.at(-1).date) : null };
    consolidated.push(c);
    console.log(`KONSOLIDIERT ${t} ${d}: ${r.status}, Balken ${c.bars}, Volumenfeld ${c.volumeField}, gleiche Hoch/Tief wie IEX ${c.identicalHighLowShare ?? '-'} (${cmp})`);
  }
  const summary = { version: KK_PROBE_VERSION, requests: budget.used, maxRequests: MAX_REQUESTS, cases: results.length, withMinutes: results.filter((r) => r.bars1m > 0).length, results, relvol, consolidated, ranges };
  fs.writeFileSync(path.join(OUT, 'kk-intraday-probe.public.json'), JSON.stringify(summary, null, 1) + '\n');
  const pem = fs.readFileSync(path.join(root, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  fs.writeFileSync(path.join(OUT, 'kk-intraday-probe.sealed.json'), L.encryptForOwner(pem, Buffer.from(JSON.stringify({ schema: 'supertrader-kk-intraday-probe-1.0.0', at: new Date().toISOString(), commit: process.env.GITHUB_SHA || null, summary, raw: sealed }))));
  console.log(`Anfragen ${budget.used}/${MAX_REQUESTS}; Faelle ${results.length}, mit Minutenbalken ${summary.withMinutes}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
