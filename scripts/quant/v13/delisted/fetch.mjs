#!/usr/bin/env node
// V13 – kontrollierter Abruf delisteter Kursreihen (Research, opt-in).
// Liest request-1.0.0.json, holt je Ticker Meta + Tageskurse, schreibt JSONL (unverschluesselt nur im Runner-Temp),
// gibt im Log nur Zaehlungen aus (keine Kurse, keine Anbieter-Zeilenmetadaten). Verschluesselung: Workflow.
// Aufruf: TIINGO_API_KEY=… node fetch.mjs --batches 0,1 --out <file.jsonl> [--controls] [--max-requests N]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i < 0 ? null : args[i + 1]; };
const req = JSON.parse(fs.readFileSync(path.join(HERE, 'request-1.0.0.json'), 'utf8'));
const key = process.env.TIINGO_API_KEY;
if (!key) { console.error('TIINGO_API_KEY fehlt'); process.exit(2); }
const out = opt('--out');
if (!out) { console.error('--out fehlt'); process.exit(2); }
const sel = String(opt('--batches') || '').split(',').filter(Boolean).map(Number);
if (!sel.length || sel.some(b => !Number.isInteger(b) || b < 0 || b >= req.batches.length)) { console.error('ungueltige --batches'); process.exit(2); }
const maxRequests = Math.min(Number(opt('--max-requests') || req.budget.maxRequestsPerRun), req.budget.maxRequestsPerRun);
const tickers = [...(args.includes('--controls') ? req.controls : []), ...sel.flatMap(b => req.batches[b])];
if (tickers.length * req.requestsPerTicker > maxRequests) { console.error(`Budget: ${tickers.length * req.requestsPerTicker} > ${maxRequests}`); process.exit(2); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
let requests = 0;
const status = {};
async function get(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (requests >= maxRequests) throw new Error('budget');
    requests++;
    await sleep(req.pacingMs);
    let res;
    try { res = await fetch(url, { headers: { Authorization: `Token ${key}`, 'Content-Type': 'application/json' } }); }
    catch { status.NETWORK = (status.NETWORK || 0) + 1; await sleep(2000 * 2 ** attempt); continue; }
    status[res.status] = (status[res.status] || 0) + 1;
    if (res.status === 429 || res.status >= 500) { await sleep(5000 * 2 ** attempt); continue; }
    if (!res.ok) return { http: res.status, body: null };
    return { http: res.status, body: await res.json() };
  }
  return { http: 'RETRY_EXHAUSTED', body: null };
}

const COLS = ['date', 'open', 'high', 'low', 'close', 'volume', 'adjClose', 'divCash', 'splitFactor'];
const fd = fs.openSync(out, 'w');
const summary = { requested: tickers.length, withPrices: 0, empty: 0, failed: 0, bars: 0 };
for (const t of tickers) {
  const base = `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(t)}`;
  let meta, prices;
  try { meta = await get(base); prices = await get(`${base}/prices?startDate=1990-01-01`); }
  catch (e) { if (e.message === 'budget') break; throw e; }
  const rows = Array.isArray(prices.body) ? prices.body.map(r => COLS.map(c => c === 'date' ? String(r.date).slice(0, 10) : r[c] ?? null)) : null;
  if (rows && rows.length) { summary.withPrices++; summary.bars += rows.length; } else if (prices.http === 200 || prices.http === 404) summary.empty++; else summary.failed++;
  fs.writeSync(fd, JSON.stringify({ ticker: t, control: req.controls.includes(t) && !sel.some(b => req.batches[b].includes(t)), metaHttp: meta.http, meta: meta.body, pricesHttp: prices.http, cols: COLS, rows }) + '\n');
}
fs.closeSync(fd);
const done = { batches: sel, requests, httpStatus: status, ...summary, fetchedAt: new Date().toISOString() };
fs.writeFileSync(out.replace(/\.jsonl$/, '') + '.summary.json', JSON.stringify(done, null, 1) + '\n');
console.log(JSON.stringify(done));
if (summary.withPrices + summary.empty === 0) process.exit(1);
