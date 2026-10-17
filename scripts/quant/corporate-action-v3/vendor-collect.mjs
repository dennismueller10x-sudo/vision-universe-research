#!/usr/bin/env node
/**
 * Second price vendor for VALIDATION ONLY (protocol 3.0.0): Yahoo Finance chart endpoint (split events and
 * split-adjusted daily closes). Never an input of the canonical core: not point in time (no publication timestamp),
 * no commercial licence (research reading only, nothing redistributed; per-ticker data stay in the private runner
 * space and leave it only sealed). Delisted symbols are mostly absent (survivor bias, measured and reported).
 *
 * Input  --tickers <json>: [{ticker, from, to}] (one row per listing segment; merged per symbol here).
 * Output --out <file.ndjson.gz>: one line per symbol {t, status, http, splits:[[date, ratio]], d0, dd:[day deltas], c:[closes]}.
 *
 * Pacing: one request per --interval-ms (default 700). 429/5xx: backoff and retry; 25 consecutive blocked symbols stop the
 * collection (stats.stoppedBlocked) so a blocked runner does not burn the job; the rest is reported, never guessed.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const args = (() => { const o = {}, a = process.argv.slice(2); for (let i = 0; i < a.length; i += 2) o[a[i].replace(/^--/, '')] = a[i + 1]; return o; })();
export const COLLECTOR_VERSION = 'vendor-yahoo-chart-collector-1.0.0';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const INTERVAL = Number(args['interval-ms'] || process.env.VENDOR_INTERVAL_MS || 700);
export const stats = { symbols: 0, ok: 0, notFound: 0, empty: 0, errors: 0, retries: 0, blocked: 0, requests: 0, stoppedBlocked: false };
let last = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function throttle() { const w = Math.max(0, last + INTERVAL - Date.now()); if (w) await sleep(w); last = Date.now(); }
const ts = (d) => Math.floor(Date.parse(d + 'T00:00:00Z') / 1000);
const iso = (s) => new Date(s * 1000).toISOString().slice(0, 10);
export const yahooSymbol = (t) => String(t).toUpperCase().replace(/\./g, '-');

export async function fetchSymbol(sym, from, to) {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=${ts(from)}&period2=${ts(to)}&interval=1d&events=split&includeAdjustedClose=false`;
  for (let a = 0; a < 5; a++) {
    await throttle(); stats.requests++;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (res.status === 404) return { status: 'NOT_FOUND', http: 404 };
      if (res.status === 429 || res.status >= 500) { stats.retries++; await sleep(15000 * (a + 1)); continue; }
      if (!res.ok) return { status: 'ERROR', http: res.status };
      const j = await res.json(), r = j?.chart?.result?.[0];
      if (!r || !Array.isArray(r.timestamp) || !r.timestamp.length) return { status: 'EMPTY', http: 200 };
      const q = r.indicators?.quote?.[0] || {};
      const dates = [], closes = [];
      r.timestamp.forEach((t, k) => { const c = q.close?.[k]; if (typeof c === 'number' && Number.isFinite(c) && c > 0) { dates.push(iso(t)); closes.push(Number(c.toPrecision(7))); } });
      const splits = Object.values(r.events?.splits || {}).map((s) => [iso(s.date), s.numerator > 0 && s.denominator > 0 ? s.numerator / s.denominator : null]).filter((s) => s[1]).sort((x, y) => (x[0] < y[0] ? -1 : 1));
      const dd = []; let prev = null;
      for (const d of dates) { const t = Date.parse(d) / 864e5; dd.push(prev === null ? 0 : t - prev); prev = t; }
      return { status: 'OK', http: 200, exchange: r.meta?.exchangeName ?? null, currency: r.meta?.currency ?? null, instrumentType: r.meta?.instrumentType ?? null, splits, d0: dates[0] ?? null, dd, c: closes };
    } catch { stats.retries++; await sleep(3000 * (a + 1)); }
  }
  return { status: 'BLOCKED', http: 429 };
}

/** Decode one line into {dates, close, splits}. */
export function decode(line) {
  const x = typeof line === 'string' ? JSON.parse(line) : line;
  if (!x || x.status !== 'OK') return x ? { status: x.status } : null;
  const dates = []; let t = Date.parse(x.d0) / 864e5;
  x.dd.forEach((d, k) => { if (k) t += d; dates.push(new Date(t * 864e5).toISOString().slice(0, 10)); });
  return { status: 'OK', ticker: x.t, dates, close: x.c, splits: x.splits, exchange: x.exchange, currency: x.currency };
}

async function main() {
  const rows = JSON.parse(fs.readFileSync(args.tickers, 'utf8'));
  const by = new Map();
  for (const r of rows) {
    if (!r.ticker || !r.from) continue;
    const s = yahooSymbol(r.ticker), cur = by.get(s) || { from: r.from, to: r.to || '9999-12-31' };
    if (r.from < cur.from) cur.from = r.from; if ((r.to || '9999-12-31') > cur.to) cur.to = r.to || '9999-12-31';
    by.set(s, cur);
  }
  const today = new Date().toISOString().slice(0, 10);
  const add = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
  const out = [];
  let consecutiveBlocked = 0;
  const symbols = [...by.keys()].sort();
  for (const sym of symbols) {
    const w = by.get(sym);
    stats.symbols++;
    if (stats.stoppedBlocked) { out.push(JSON.stringify({ t: sym, status: 'NOT_ATTEMPTED_BLOCKED' })); continue; }
    const r = await fetchSymbol(sym, add(w.from, -40), w.to > today ? today : add(w.to, 40));
    if (r.status === 'OK') stats.ok++; else if (r.status === 'NOT_FOUND') stats.notFound++; else if (r.status === 'EMPTY') stats.empty++; else if (r.status === 'BLOCKED') stats.blocked++; else stats.errors++;
    consecutiveBlocked = r.status === 'BLOCKED' ? consecutiveBlocked + 1 : 0;
    if (consecutiveBlocked >= 25) stats.stoppedBlocked = true;
    out.push(JSON.stringify({ t: sym, ...r }));
    if (stats.symbols % 500 === 0) console.log('[vendor]', JSON.stringify(stats));
  }
  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  fs.writeFileSync(args.out, zlib.gzipSync(out.join('\n')));
  fs.writeFileSync(args.out + '.stats.json', JSON.stringify({ collector: COLLECTOR_VERSION, fetchedAt: new Date().toISOString(), intervalMs: INTERVAL, stats }));
  console.log('[vendor] done', JSON.stringify(stats));
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
