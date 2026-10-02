#!/usr/bin/env node
// Supertrader R9 - Zugangsprobe: Welche historischen Intraday-Daten liefert
// der bestehende Tiingo-Zugang (IEX-Endpunkt) tatsaechlich?
//
//   node scripts/supertrader/validation/intraday-probe.mjs --out DIR
//
// Je Fall eine Anfrage /iex/{t}/prices (1 Minute, ein Handelstag) und eine
// Anfrage /tiingo/daily/{t}/prices (derselbe Tag, Rohkurse). Gemessen werden:
// HTTP-Status, Zahl der Minutenbalken, erster/letzter Zeitstempel und ob
// Tageshoch/-tief der IEX-Minuten mit dem konsolidierten Tagesbalken
// uebereinstimmen (IEX ist nur ein Handelsplatz). Ergebnis nur verschluesselt;
// das Log zeigt Status und Zaehlwerte, keine Kurse.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from './lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BASE = 'https://api.tiingo.com';

// Zugangsfrage, keine Studie: Tiefe (2016-2026), ein delisteter Titel je Epoche,
// Kullamaegis Beispiele (TSLA 29.05./01.06.2020, NVDA 11.11.2016).
export const PROBE_CASES = [
  ['AAPL', '2016-01-05'], ['AAPL', '2016-09-01'], ['AAPL', '2017-06-01'], ['AAPL', '2018-06-01'],
  ['AAPL', '2019-06-03'], ['AAPL', '2020-06-01'], ['AAPL', '2022-06-01'], ['AAPL', '2024-06-03'], ['AAPL', '2026-09-30'],
  ['NVDA', '2016-11-11'], ['TSLA', '2020-05-29'], ['TSLA', '2020-06-01'],
  ['TWTR', '2021-06-01'], ['SIVB', '2023-03-08'], ['ATVI', '2022-06-01'], ['CELG', '2018-06-01'],
];

export function summarize(bars, eod) {
  const n = bars.length;
  if (!n) return { bars: 0 };
  const hi = Math.max(...bars.map((b) => b.high)), lo = Math.min(...bars.map((b) => b.low));
  const vol = bars.reduce((a, b) => a + (b.volume || 0), 0);
  const out = { bars: n, first: bars[0].date, last: bars[n - 1].date, iexHigh: hi, iexLow: lo, iexOpen: bars[0].open, iexClose: bars[n - 1].close, iexVolume: vol };
  if (eod) Object.assign(out, { eodOpen: eod.open, eodHigh: eod.high, eodLow: eod.low, eodClose: eod.close, eodVolume: eod.volume, splitFactor: eod.splitFactor,
    highGap: hi / eod.high - 1, lowGap: lo / eod.low - 1, volumeShare: eod.volume ? vol / eod.volume : null });
  return out;
}

async function getJson(url, key) {
  const r = await fetch(url, { headers: { Authorization: 'Token ' + key, 'Content-Type': 'application/json' } });
  const text = await r.text();
  let body = null; try { body = JSON.parse(text); } catch { body = null; }
  return { status: r.status, body, len: text.length };
}

async function main() {
  const argv = process.argv.slice(2);
  const OUT = argv[argv.indexOf('--out') + 1] || '/tmp/probe';
  fs.mkdirSync(OUT, { recursive: true });
  const KEY = process.env.TIINGO_API_KEY;
  if (!KEY) { console.error('TIINGO_API_KEY fehlt'); process.exit(2); }
  const results = [];
  for (const [t, d] of PROBE_CASES) {
    const iex = await getJson(`${BASE}/iex/${t}/prices?startDate=${d}&endDate=${d}&resampleFreq=1min&columns=open,high,low,close,volume`, KEY);
    const eod = await getJson(`${BASE}/tiingo/daily/${t}/prices?startDate=${d}&endDate=${d}`, KEY);
    const bars = Array.isArray(iex.body) ? iex.body : [];
    const e = Array.isArray(eod.body) && eod.body.length ? eod.body[0] : null;
    const s = summarize(bars, e);
    results.push({ ticker: t, date: d, iexStatus: iex.status, iexBytes: iex.len, iexError: Array.isArray(iex.body) ? null : (iex.body?.detail || String(iex.body).slice(0, 120)), eodStatus: eod.status, ...s });
    console.log(`${t} ${d}: IEX ${iex.status} ${s.bars} Balken | EOD ${eod.status}`);
    await new Promise((r) => setTimeout(r, 400));
  }
  const pem = fs.readFileSync(path.join(root, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  fs.writeFileSync(path.join(OUT, 'intraday-probe.sealed.json'), L.encryptForOwner(pem, Buffer.from(JSON.stringify({ schema: 'supertrader-intraday-probe-1.0.0', at: new Date().toISOString(), commit: process.env.GITHUB_SHA || null, results }))));
  console.log(`Faelle ${results.length}, mit Minutenbalken ${results.filter((r) => r.bars > 0).length}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
