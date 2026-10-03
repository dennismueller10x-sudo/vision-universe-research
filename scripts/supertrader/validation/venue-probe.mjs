#!/usr/bin/env node
// Supertrader R10 - Mehrboersen-Minuten (Tiingo /tiingo/equity/intraday, Beta) gegen
// IEX-Minuten und Tageskurse (PREREGISTRATION-R10-VENUES.json, vor dem Abruf eingefroren).
//
//   node scripts/supertrader/validation/venue-probe.mjs --out DIR
//
// 1. Zugangsprobe (eine Anfrage). Ohne 200 + Balken: nur Tiefenproben, dann Ende.
// 2. Faelle aus der R9-Studie mit unveraendertem Engine-Code neu aufbauen (privater Eimer).
// 3. Je Fall hoechstens drei Anfragen: Mehrboersen, IEX, Tageskurs (roh + bereinigt).
// 4. resolve() (Stand nach A4) je Quelle; Vergleich von Zeitraum, Zeitstempel, Kursen,
//    Splits, Reihenfolge und Schranken. Ergebnis nur verschluesselt, Log nur Zaehlwerte.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from './lib.mjs';
import { loadPitData, segCtx, tradesFor } from './analyze-methods.mjs';
import { DEFAULT_EXECUTION } from '../engine/execution.mjs';
import { resolve, etClock } from './intraday-oracle.mjs';
import kk31 from '../engine/strategies/kk-breakout-v31.mjs';
import darvas3 from '../engine/strategies/darvas-v3.mjs';
import don2 from '../engine/strategies/donchian-v2.mjs';
import weinstein3 from '../engine/strategies/weinstein-v3.mjs';
import { stratum } from './intraday-study.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BASE = 'https://api.tiingo.com';
const PREREG = JSON.parse(fs.readFileSync(path.join(root, 'scripts/supertrader/validation/PREREGISTRATION-R10-VENUES.json'), 'utf8'));
const ENGINES = Object.fromEntries([kk31, darvas3, don2, weinstein3].map((e) => [`${e.id}@${e.version}`, e]));
const MAX_REQUESTS = 300;
const tickerOf = (id) => String(id).split(':')[2];

let requests = 0;
export async function getRaw(url, key) {
  if (++requests > MAX_REQUESTS) throw new Error('Anfragegrenze erreicht');
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(url, { headers: { Authorization: 'Token ' + key, 'Content-Type': 'application/json' } });
      if (r.status === 429 || r.status >= 500) { await new Promise((res) => setTimeout(res, 2000 * (a + 1))); continue; }
      const text = await r.text(); let body = null; try { body = JSON.parse(text); } catch { body = null; }
      const headers = {}; for (const [k, v] of r.headers) if (/rate|limit|quota|usage|plan|tier|x-/i.test(k)) headers[k] = v;
      return { status: r.status, body, bytes: text.length, error: Array.isArray(body) ? null : String(body?.detail || text).slice(0, 200), headers };
    } catch (e) { await new Promise((res) => setTimeout(res, 2000)); }
  }
  return { status: 0, body: null, bytes: 0, error: 'Netzwerk' };
}
const mvUrl = (t, d) => `${BASE}/tiingo/equity/intraday/${t}/prices?startDate=${d}&endDate=${d}&resampleFreq=1min`;
const iexUrl = (t, d) => `${BASE}/iex/${t}/prices?startDate=${d}&endDate=${d}&resampleFreq=1min&columns=open,high,low,close,volume`;
const eodUrl = (t, d) => `${BASE}/tiingo/daily/${t}/prices?startDate=${d}&endDate=${d}`;

// Minuten (beliebige Quelle) gegen den Tagesbalken; nur Kennzahlen.
export function describe(bars, eod) {
  if (!Array.isArray(bars) || !bars.length) return { bars: 0 };
  const etMin = (s) => { const [h, m] = etClock(s).split(':').map(Number); return h * 60 + m; };
  const hi = Math.max(...bars.map((b) => b.high)), lo = Math.min(...bars.map((b) => b.low));
  const vol = bars.reduce((a, b) => a + (Number(b.volume) || 0), 0);
  const out = { bars: bars.length, first: bars[0].date, last: bars[bars.length - 1].date, firstET: etClock(bars[0].date), lastET: etClock(bars[bars.length - 1].date),
    outsideRegular: bars.filter((b) => { const m = etMin(b.date); return m < 570 || m >= 960; }).length, keys: Object.keys(bars[0]).sort(),
    open: bars[0].open, high: hi, low: lo, volume: vol, hasVolume: bars.some((b) => b.volume != null) };
  if (eod) Object.assign(out, { vsRaw: { open: bars[0].open / eod.open - 1, high: hi / eod.high - 1, low: lo / eod.low - 1, volumeShare: eod.volume ? vol / eod.volume : null },
    vsAdj: eod.adjHigh ? { high: hi / eod.adjHigh - 1, low: lo / eod.adjLow - 1 } : null });
  return out;
}

const regular = (bars) => (Array.isArray(bars) ? bars : []).filter((b) => { const [h, m] = etClock(b.date).split(':').map(Number); const x = h * 60 + m; return x >= 570 && x < 960; });

async function main() {
  const argv = process.argv.slice(2);
  const OUT = argv[argv.indexOf('--out') + 1] || path.join(os.tmpdir(), 'r10');
  fs.mkdirSync(OUT, { recursive: true });
  const KEY = process.env.TIINGO_API_KEY;
  if (!KEY) { console.error('TIINGO_API_KEY fehlt'); process.exit(2); }
  const t0 = Date.now();
  const log = (m) => console.log(`[r10 +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
  const result = { schema: 'supertrader-venue-probe-1.0.0', prereg: PREREG.schema, at: new Date().toISOString(), commit: process.env.GITHUB_SHA || null };

  // 1. Zugangsprobe + Tiefe
  const access = await getRaw(mvUrl('AAPL', '2024-06-03'), KEY);
  result.access = { status: access.status, bars: Array.isArray(access.body) ? access.body.length : 0, error: access.error, headers: access.headers, sample: Array.isArray(access.body) ? access.body.slice(0, 2) : null };
  log(`Zugangsprobe: Status ${access.status}, Balken ${result.access.bars}`);
  result.depth = [];
  for (const [t, d] of PREREG.depthProbes) {
    const mv = await getRaw(mvUrl(t, d), KEY), eod = await getRaw(eodUrl(t, d), KEY);
    const e = Array.isArray(eod.body) && eod.body[0] ? eod.body[0] : null;
    result.depth.push({ ticker: t, date: d, status: mv.status, error: mv.error, ...describe(mv.body, e), regular: describe(regular(mv.body), e) });
    log(`Tiefe ${t} ${d}: Status ${mv.status}, Balken ${Array.isArray(mv.body) ? mv.body.length : 0}`);
  }
  const usable = access.status === 200 && result.access.bars > 0;
  if (usable) {
    // 2. Faelle neu aufbauen
    const want = new Map(PREREG.cases.map((c) => [`${c.engine}|${c.seg}|${c.date}`, c]));
    const segIds = new Set(PREREG.cases.map((c) => c.seg));
    const { segs, bench } = await loadPitData({ log });
    const recs = [];
    for (const seg of segs.filter((s) => segIds.has(s.id))) {
      const ctx = segCtx(seg, bench);
      for (const [ek, eng] of Object.entries(ENGINES)) {
        if (![...want.values()].some((c) => c.engine === ek && c.seg === seg.id)) continue;
        for (const t of tradesFor(eng, seg, ctx, DEFAULT_EXECUTION)) {
          const c = want.get(`${ek}|${seg.id}|${t.entry.date}`); if (!c) continue;
          const i = ctx.bars.date.indexOf(t.entry.date);
          const slip = DEFAULT_EXECUTION.slippageBps / 1e4;
          const rec = { group: c.group, engine: ek, engineId: eng.id, seg: seg.id, ticker: tickerOf(seg.id), date: t.entry.date, trigger: t.trigger,
            fill: t.entry.price / (1 + slip), stop: t.initialStop, open: ctx.bars.open[i], high: ctx.bars.high[i], low: ctx.bars.low[i], close: ctx.bars.close[i],
            rawFactor: ctx.raw.close[i] / ctx.bars.close[i], adr: ctx.ind.adr20[i - 1], neutralExit: !!t.exits[0] && t.exits[0].date === t.entry.date,
            splits: seg.raw.slice(Math.max(0, i - 3), i + 4).filter((b) => b.splitFactor && b.splitFactor !== 1).map((b) => [b.date, b.splitFactor]) };
          rec.stratum = stratum(eng.id, rec);
          recs.push(rec);
        }
      }
    }
    log(`Faelle neu aufgebaut ${recs.length} von ${PREREG.cases.length}`);
    result.missingCases = PREREG.cases.filter((c) => !recs.some((r) => r.engine === c.engine && r.seg === c.seg && r.date === c.date)).map((c) => `${c.group}|${c.seg}|${c.date}`);
    // 3./4. Abruf und Vergleich
    result.cases = [];
    for (const r of recs) {
      const mv = await getRaw(mvUrl(r.ticker, r.date), KEY), iex = await getRaw(iexUrl(r.ticker, r.date), KEY), eod = await getRaw(eodUrl(r.ticker, r.date), KEY);
      const e = Array.isArray(eod.body) && eod.body[0] ? eod.body[0] : null;
      const mvReg = regular(mv.body), iexBars = Array.isArray(iex.body) ? iex.body : [];
      const pick = (x) => x && ({ status: x.status, gap: x.gap, entryMinute: x.entryMinute, stopAdj: x.stopAdj, exitSameDay: x.exitSameDay, exitMinute: x.exitMinute, dayLowAfterEntry: x.dayLowAfterEntry, iexLowGap: x.iexLowGap, iexHighGap: x.iexHighGap, shortfall: x.shortfall });
      result.cases.push({ ...r, eodStatus: eod.status, eod: e && { open: e.open, high: e.high, low: e.low, close: e.close, volume: e.volume, adjHigh: e.adjHigh, adjLow: e.adjLow, splitFactor: e.splitFactor },
        mv: { status: mv.status, error: mv.error, ...describe(mv.body, e), regular: describe(mvReg, e) }, iex: { status: iex.status, ...describe(iexBars, e) },
        truthMV: pick(resolve(r, mvReg, r.engineId)), truthIEX: pick(resolve(r, iexBars, r.engineId)) });
      await new Promise((res) => setTimeout(res, 200));
    }
    const n = (f) => result.cases.filter(f).length;
    log(`Mehrboersen mit Balken ${n((c) => c.mv.bars > 0)}/${result.cases.length}, aufgeloest MV ${n((c) => c.truthMV?.status === 'RESOLVED')}, IEX ${n((c) => c.truthIEX?.status === 'RESOLVED')}`);
  }
  result.requests = requests;
  const pem = fs.readFileSync(path.join(root, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  fs.writeFileSync(path.join(OUT, 'venue-probe.sealed.json'), L.encryptForOwner(pem, Buffer.from(JSON.stringify(result))));
  log(`Anfragen ${requests}; verschluesseltes Ergebnis geschrieben`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
