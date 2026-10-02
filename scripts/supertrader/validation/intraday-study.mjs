#!/usr/bin/env node
// Supertrader R9 - Reihenfolge am Kauf-Stop-Tag mit IEX-Minuten
// (PREREGISTRATION-R9-INTRADAY.json, vor dem Abruf eingefroren).
//
//   node scripts/supertrader/validation/intraday-study.mjs --out DIR [--limit 400]
//
// 1. Universum und Reihen wie analyze-methods (privater Eimer, Point-in-Time).
// 2. Einstiege der Kauf-Stop-Engines (Momentum 3.1.0, Darvas 3.0.0, Turtle 2.0.0,
//    Weinstein 3.0.0) mit unveraendertem Code; Einordnung je Schicht.
// 3. Auswahl nach Protokoll (Hash), Abruf je Fall ein Handelstag 1-Minuten-IEX.
// 4. Wahrheit aus der Minutenreihenfolge gegen die Tagesbalken-Annahmen.
// 5. Beispielpruefung MNKD 2013 / AXON 2004 (Tiingo-Tageskurse) und TSLA 2020 (Minuten).
// Minutenbalken nur im privaten Eimer, Ergebnis nur verschluesselt, Log nur Zaehlwerte.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as L from './lib.mjs';
import { loadPitData, segCtx, tradesFor } from './analyze-methods.mjs';
import { DEFAULT_EXECUTION } from '../engine/execution.mjs';
import { simulate } from '../engine/simulator.mjs';
import { computeIndicators } from '../engine/indicators.mjs';
import kk31 from '../engine/strategies/kk-breakout-v31.mjs';
import kk3 from '../engine/strategies/kk-breakout-v3.mjs';
import darvas3 from '../engine/strategies/darvas-v3.mjs';
import don2 from '../engine/strategies/donchian-v2.mjs';
import weinstein3 from '../engine/strategies/weinstein-v3.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const PREREG_R9 = 'supertrader-validation-prereg-r9-intraday-1.0.0';
export const WINDOW = ['2017-01-01', '2026-09-30'];
export const ENGINES = [kk31, darvas3, don2, weinstein3];
const keyOf = (e) => `${e.id}@${e.version}`;
export const QUOTA = {
  'MOMENTUM_BREAKOUT@3.1.0': { census: true },
  'DARVAS_BOX@3.0.0': { AMBIGUOUS: 300, CERTAIN: 50, CLEAR: 100 },
  'DONCHIAN_TURTLE@2.0.0': { AMBIGUOUS: 100, CERTAIN: 25, CLEAR: 50 },
  'WEINSTEIN_STAGE@3.0.0': { AMBIGUOUS: 100, CERTAIN: 25, CLEAR: 50 },
};
const SPLIT_EXTRA = 50;
const tickerOf = (id) => String(id).split(':')[2];
const h = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Schicht eines Einstiegs aus dem Tagesbalken (Engine-unabhaengige Definition laut Protokoll).
export function stratum(engineId, rec) {
  if (rec.close <= rec.stop) return 'CERTAIN';
  const pess = engineId === 'MOMENTUM_BREAKOUT' ? rec.close < rec.fill : rec.low <= rec.stop;
  return pess ? 'AMBIGUOUS' : 'CLEAR';
}

export function select(records) {
  const out = [], byKey = {};
  for (const r of records) (byKey[`${r.engine}|${r.stratum}`] ||= []).push(r);
  for (const [k, list] of Object.entries(byKey)) {
    const [eng, st] = k.split('|');
    const q = QUOTA[eng];
    list.sort((a, b) => h(`${a.engine}|${a.seg}|${a.date}`).localeCompare(h(`${b.engine}|${b.seg}|${b.date}`)));
    const n = q.census ? list.length : (q[st] ?? 0);
    for (const r of list.slice(0, n)) out.push({ ...r, reason: q.census ? 'CENSUS' : 'STRATUM' });
  }
  const chosen = new Set(out.map((r) => `${r.engine}|${r.seg}|${r.date}`));
  const split = records.filter((r) => r.splitNear && !chosen.has(`${r.engine}|${r.seg}|${r.date}`))
    .sort((a, b) => h(`S|${a.engine}|${a.seg}|${a.date}`).localeCompare(h(`S|${b.engine}|${b.seg}|${b.date}`))).slice(0, SPLIT_EXTRA);
  for (const r of split) out.push({ ...r, reason: 'SPLIT_NEAR' });
  return out;
}

import { etClock, resolve, getJson, fetchMinutes } from './intraday-oracle.mjs';
export { etClock, resolve, fetchMinutes };

const wilson = (k, n) => { if (!n) return null; const z = 1.96, p = k / n, d = 1 + z * z / n; const c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return { p, lo: (c - m) / d, hi: (c + m) / d, k, n }; };

export function evaluate(cases) {
  const out = {};
  for (const c of cases) {
    const g = out[c.engine] ||= { total: 0, status: {}, strata: {}, fill: [], stopDiff: [], gapOpen: [], dayLowAfterEntry: 0, resolvedN: 0 };
    g.total++; g.status[c.truth.status] = (g.status[c.truth.status] || 0) + 1;
    if (c.truth.status !== 'RESOLVED') continue;
    g.resolvedN++;
    const s = g.strata[c.stratum] ||= { n: 0, truthExit: 0, neutralAgree: 0, pessAgree: 0, minuteAmbiguous: 0 };
    s.n++; if (c.truth.exitSameDay) s.truthExit++; if (c.truth.minuteAmbiguous) s.minuteAmbiguous++;
    if (c.neutralExit === c.truth.exitSameDay) s.neutralAgree++;
    if (c.pessExit === c.truth.exitSameDay) s.pessAgree++;
    g.fill.push(c.truth.fillDiff); g.stopDiff.push(c.truth.stopDiff);
    if (c.truth.gap) g.gapOpen.push(c.truth.iexOpenVsRaw);
    if (c.truth.dayLowAfterEntry) g.dayLowAfterEntry++;
  }
  const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
  for (const g of Object.values(out)) {
    for (const s of Object.values(g.strata)) { s.truthExitShare = wilson(s.truthExit, s.n); s.neutralAgreeShare = s.n ? s.neutralAgree / s.n : null; s.pessAgreeShare = s.n ? s.pessAgree / s.n : null; }
    g.fillDiff = { n: g.fill.length, p05: q(g.fill, 0.05), median: q(g.fill, 0.5), p95: q(g.fill, 0.95), absOver10bp: g.fill.filter((x) => Math.abs(x) > 0.001).length };
    g.stopDiffQ = { n: g.stopDiff.length, p05: q(g.stopDiff, 0.05), median: q(g.stopDiff, 0.5), p95: q(g.stopDiff, 0.95), nonZero: g.stopDiff.filter((x) => Math.abs(x) > 1e-6).length };
    g.gapOpenQ = { n: g.gapOpen.length, median: q(g.gapOpen, 0.5), absOver50bp: g.gapOpen.filter((x) => Math.abs(x) > 0.005).length };
    delete g.fill; delete g.stopDiff; delete g.gapOpen;
  }
  return out;
}

// Beispielpruefung mit Tiingo-Tageskursen (vor dem Universumszeitraum, Rang nicht pruefbar).
async function exampleCheck(ticker, from, to, marked, key) {
  // Nachtrag A2: Kullamaegis Charts sind bis zum Veroeffentlichungstag split-bereinigt
  // (marked.chartDate). Der Chartwert wird deshalb mit allen Splits bis dahin verglichen.
  const full = await getJson(`https://api.tiingo.com/tiingo/daily/${ticker}/prices?startDate=${from}&endDate=${marked.chartDate}`, key);
  const splitsAfter = (d) => (Array.isArray(full.body) ? full.body : []).filter((b) => b.date.slice(0, 10) > d && (b.splitFactor || 1) !== 1).reduce((a, b) => a * b.splitFactor, 1);
  const r = await getJson(`https://api.tiingo.com/tiingo/daily/${ticker}/prices?startDate=${from}&endDate=${to}`, key);
  if (!Array.isArray(r.body) || !r.body.length) return { ticker, status: 'NO_DATA', http: r.status };
  const raw = r.body.map((b) => ({ date: b.date.slice(0, 10), open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume, adjClose: b.adjClose, dividend: b.divCash || 0, splitFactor: b.splitFactor || 1 }));
  const a = L.adjustSeries(raw);
  const bars = { date: a.date, open: a.open, high: a.high, low: a.low, close: a.close, volume: a.volume };
  const n = bars.date.length, ninety9 = new Array(n).fill(99);
  const ctx = { symbol: ticker, bars, ind: computeIndicators(bars), raw: { close: a.rawClose, volume: a.rawVolume }, divAdj: a.divAdj, cross: { mom21: ninety9, mom63: ninety9, mom126: ninety9 } };
  // Markierter Tag laut Protokoll: Tagesgewinn > 5 %, bereinigter Schluss am naechsten am Chartwert.
  const cand = []; for (let i = 1; i < n; i++) if (bars.date[i] >= marked.from && bars.date[i] <= marked.to && bars.close[i] / bars.close[i - 1] - 1 > 0.05) cand.push(i);
  const chartScale = (i) => a.rawClose[i] / splitsAfter(bars.date[i]);
  cand.sort((x, y) => Math.abs(chartScale(x) - marked.close) - Math.abs(chartScale(y) - marked.close));
  const mi = cand[0];
  const res = {};
  for (const eng of [kk3, kk31]) {
    const s = simulate(eng, ctx, { from: 60, exec: DEFAULT_EXECUTION, params: { ...eng.PARAMS, minPrice: 0 } });
    const all = [...s.finished, ...(s.state.signal ? [s.state.signal] : [])];
    const entries = all.filter((x) => x.entry).map((x) => ({ date: x.entry.date, price: x.entry.price, stop: x.initialStop, setup: x.createdAt, exits: (x.exits || []).map((e) => [e.date, e.price, e.fraction, e.ruleId]) }));
    const near = mi != null ? entries.filter((x) => Math.abs(bars.date.indexOf(x.date) - mi) <= 2) : [];
    const setups = all.filter((x) => x.createdAt >= bars.date[Math.max(0, (mi ?? 0) - 40)] && x.createdAt <= bars.date[Math.min(n - 1, (mi ?? 0) + 2)]).map((x) => ({ created: x.createdAt, state: x.state, trigger: x.levels?.trigger ?? null, transitions: x.transitions.map((t) => [t.date, t.state, t.ruleId]) }));
    const scanAt = mi != null ? [-3, -2, -1, 0].map((k) => { const t = mi + k; const sc = eng.scan(ctx, t, { ...eng.PARAMS, minPrice: 0 }); return { date: bars.date[t], stage: sc?.stage ?? null, failed: sc ? Object.entries(sc.rules).filter(([, v]) => !v).map(([r]) => r) : null, trigger: sc?.levels?.trigger ?? null, facts: sc ? { priorRun: sc.facts.priorRun, baseLength: sc.facts.baseLength ?? null, baseDepth: sc.facts.baseDepth ?? null } : null }; }) : [];
    res[keyOf(eng)] = { verdict: near.some((x) => x.date === bars.date[mi]) ? 'ENTRY_ON_MARKED_DAY' : near.length ? 'ENTRY_NEAR' : 'MISSED', near, setups, scanAt };
  }
  return { ticker, status: 'OK', markedDay: mi != null ? { date: bars.date[mi], close: bars.close[mi], chartScaleClose: chartScale(mi), chartClose: marked.close, gain: bars.close[mi] / bars.close[mi - 1] - 1, candidates: cand.slice(0, 3).map((i) => [bars.date[i], chartScale(i)]) } : null, rankRule: 'NOT_CHECKABLE_SET_TRUE', engines: res };
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  const OUT = arg('--out', path.join(os.tmpdir(), 'supertrader-validation'));
  const LIMIT = Number(arg('--limit', '0'));
  const KEY = process.env.TIINGO_API_KEY || '';
  const t0 = Date.now();
  const log = (m) => console.log(`[intraday +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
  fs.mkdirSync(OUT, { recursive: true });

  const examples = {
    MNKD: await exampleCheck('MNKD', '2012-06-01', '2013-07-31', { from: '2013-05-01', to: '2013-05-31', close: 22.15, chartDate: '2020-01-15' }, KEY),
    AXON: await exampleCheck('AXON', '2003-01-02', '2004-03-31', { from: '2004-01-02', to: '2004-01-15', close: 7.85, chartDate: '2021-01-05' }, KEY),
  };
  log('Beispielpruefung: ' + Object.entries(examples).map(([k, v]) => `${k} ${v.status}`).join(', '));

  const { segs, bench, budget, mine } = await loadPitData({ LIMIT, log });
  const records = [];
  let k = 0;
  for (const seg of segs) {
    const ctx = segCtx(seg, bench);
    for (const eng of ENGINES) {
      for (const t of tradesFor(eng, seg, ctx, DEFAULT_EXECUTION)) {
        if (t.entry.date < WINDOW[0] || t.entry.date > WINDOW[1]) continue;
        const i = ctx.bars.date.indexOf(t.entry.date);
        if (i < 1) continue;
        const slip = DEFAULT_EXECUTION.slippageBps / 1e4;
        const rec = {
          engine: keyOf(eng), engineId: eng.id, seg: seg.id, ticker: tickerOf(seg.id), date: t.entry.date, trigger: t.trigger,
          fill: t.entry.price / (1 + slip), stop: t.initialStop, open: ctx.bars.open[i], high: ctx.bars.high[i], low: ctx.bars.low[i], close: ctx.bars.close[i],
          rawFactor: ctx.raw.close[i] / ctx.bars.close[i], adr: ctx.ind.adr20[i - 1],
          neutralExit: !!t.exits[0] && t.exits[0].date === t.entry.date,
          splitNear: seg.raw.slice(Math.max(0, i - 3), i + 4).some((b) => b.splitFactor && b.splitFactor !== 1),
          gap: ctx.bars.open[i] >= t.trigger,
        };
        rec.stratum = stratum(eng.id, rec);
        rec.pessExit = rec.stratum !== 'CLEAR';
        records.push(rec);
      }
    }
    if (++k % 1000 === 0) log(`simuliert ${k}/${segs.length}`);
  }
  const counts = {}; for (const r of records) { const c = counts[r.engine] ||= {}; c[r.stratum] = (c[r.stratum] || 0) + 1; }
  log('Einstiege im Fenster: ' + JSON.stringify(counts));
  const chosen = select(records);
  log(`ausgewaehlt ${chosen.length}`);

  // TSLA-Beispieltage mit Minuten (Beschreibung).
  const tslaDays = {};
  for (const d of ['2020-05-27', '2020-05-28', '2020-05-29', '2020-06-01']) { const r = await fetchMinutes('TSLA', d, KEY); tslaDays[d] = Array.isArray(r.body) ? r.body : []; }

  const cache = {};
  let done = 0, i0 = 0;
  const worker = async () => {
    while (i0 < chosen.length) {
      const c = chosen[i0++];
      const ck = `${c.ticker}|${c.date}`;
      if (!(ck in cache)) { const r = await fetchMinutes(c.ticker, c.date, KEY); cache[ck] = Array.isArray(r.body) ? r.body.map((b) => ({ date: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume })) : []; await new Promise((res) => setTimeout(res, 150)); }
      c.truth = resolve(c, cache[ck], c.engineId);
      if (++done % 200 === 0) log(`aufgeloest ${done}/${chosen.length}`);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  const summary = evaluate(chosen);
  log('Status: ' + Object.entries(summary).map(([e, g]) => `${e} ${JSON.stringify(g.status)}`).join(' | '));

  // TSLA-Auswertung: Trigger 3.1.0 laut r8c = 55,64 (bereinigt), Faktor aus Rohdaten des Tages.
  const tsla = {};
  for (const [d, bars] of Object.entries(tslaDays)) {
    if (!bars.length) { tsla[d] = { bars: 0 }; continue; }
    const hi = Math.max(...bars.map((b) => b.high)); const at = bars.findIndex((b) => b.high === hi);
    tsla[d] = { bars: bars.length, open: bars[0].open, high: hi, highMinute: etClock(bars[at].date), low: Math.min(...bars.map((b) => b.low)), close: bars[bars.length - 1].close };
    tsla[d].series = bars.map((b) => [etClock(b.date), b.high, b.low]).filter((_, j) => j % 5 === 0 || j === at);
  }

  // Minutenbalken nur privat (ein Objekt), fuer den aufgeloesten Folgelauf.
  if (!LIMIT) {
    try {
      const { createS3DriverFromEnv } = await import(path.join(root, 'scripts/market/storage/s3-driver.mjs'));
      const driver = createS3DriverFromEnv(process.env);
      budget.consumeClassA(1, 'PUT intraday cache');
      await driver.put(mine.seriesPrefix + '_validation/intraday-r9.json.gz', zlib.gzipSync(Buffer.from(JSON.stringify(cache))), { contentType: 'application/gzip' });
      log(`Minuten-Cache abgelegt (${Object.keys(cache).length} Tage)`);
    } catch (e) { log('Cache nicht abgelegt: ' + String(e?.message || e).slice(0, 80)); }
  }
  const result = { schema: 'supertrader-intraday-study-1.0.0', prereg: PREREG_R9, at: new Date().toISOString(), commit: process.env.GITHUB_SHA || null, limit: LIMIT || null,
    population: counts, selected: chosen.length, summary, examples, tsla,
    cases: chosen.map((c) => ({ engine: c.engine, seg: c.seg, date: c.date, stratum: c.stratum, reason: c.reason, gap: c.gap, splitNear: c.splitNear, trigger: c.trigger, fill: c.fill, stop: c.stop, ohlc: [c.open, c.high, c.low, c.close], rawFactor: c.rawFactor, neutralExit: c.neutralExit, pessExit: c.pessExit, truth: c.truth })) };
  const pem = fs.readFileSync(path.join(root, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  fs.writeFileSync(path.join(OUT, `intraday-study${LIMIT ? '-smoke' : ''}.sealed.json`), L.encryptForOwner(pem, Buffer.from(JSON.stringify(result))));
  log('Verschluesseltes Ergebnis geschrieben');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
