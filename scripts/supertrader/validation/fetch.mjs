#!/usr/bin/env node
// Supertrader — interner Datentest: kontrollierter Abruf delisteter Listings.
//
//   node scripts/supertrader/validation/fetch.mjs --mode subset
//   node scripts/supertrader/validation/fetch.mjs --mode full [--max-requests 15000]
//   node scripts/supertrader/validation/fetch.mjs --mode plan     (ohne Kursanfragen)
//
// Regeln: PREREGISTRATION.json (vor dem ersten Abruf committet).
//  * Rohreihen nur in den privaten R2-Eimer (Namensraum tiingo-delisted).
//  * Logs: nur Fortschrittszahlen. Keine Kurse, keine Namen, kein Schluessel.
//  * Fortsetzbar: das Manifest im Eimer haelt je Listing den Status; ein
//    erneuter Lauf ueberspringt Erledigtes (ERROR wird erneut versucht).
//  * Stopp bei 429/401/403, Limit-Hinweis im Antworttext, 5 Fehlern in Folge.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as L from './lib.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const Store = require(path.join(root, 'quant/engines/history-store.js'));
const Guard = require(path.join(root, 'quant/engines/zero-cost-guard.js'));
const Master = require(path.join(root, 'quant/engines/us-security-master.js'));

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const MODE = arg('--mode', 'plan');
const MAX_REQ = Number(arg('--max-requests', MODE === 'subset' ? '400' : '15000'));
const MAX_MIN = Number(arg('--max-minutes', '320'));
const PACE_MS = Number(arg('--pace-ms', '1200')); // 50/min
const OUT_DIR = arg('--out', path.join(os.tmpdir(), 'supertrader-validation'));
const KEY = process.env.TIINGO_API_KEY || '';
const t0 = Date.now();
const log = (m) => console.log(`[validation-fetch +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const SUBSET_ANCHORS = ['TWX', 'CELG', 'MON', 'SHLD', 'JCP', 'HTZ', 'CHK', 'WFT', 'FTR', 'DO'];

// Teilmenge (vorab festgelegt, deterministisch nach SHA-256 der Listing-ID):
// 12 fruehe Delistings (Ende 2016-2017), 12 spaete (2024-2026), Ankerfaelle
// (Uebernahme/Insolvenz/neu vergebene Kuerzel), 8 alte Listings neu vergebener
// Kuerzel, 6 aktive Listings ohne Speicherreihe.
export function pickSubset(listings) {
  const by = (a, b) => L.sha256(a.id).localeCompare(L.sha256(b.id));
  const fetchable = listings.filter((l) => l.source === 'FETCH' && !l.active && l.plainTicker);
  const early = fetchable.filter((l) => l.endDate >= '2016-01-01' && l.endDate <= '2017-12-31').sort(by).slice(0, 12);
  const late = fetchable.filter((l) => l.endDate >= '2024-01-01').sort(by).slice(0, 12);
  const anchors = listings.filter((l) => SUBSET_ANCHORS.includes(l.ticker));
  const reused = listings.filter((l) => l.source === 'UNFETCHABLE_REUSED' && l.plainTicker).sort(by).slice(0, 8);
  const activeNoStore = listings.filter((l) => l.source === 'FETCH' && l.active && l.plainTicker).sort(by).slice(0, 6);
  const seen = new Set();
  return [...early, ...late, ...anchors, ...reused, ...activeNoStore].filter((l) => !seen.has(l.id) && seen.add(l.id));
}

function storeActiveMap() {
  const uni = JSON.parse(fs.readFileSync(path.join(root, 'quant/data/market/scale/universe-FULL_UNIVERSE.json'), 'utf8'));
  const elig = JSON.parse(fs.readFileSync(path.join(root, 'quant/data/market/security-master/eligibility.json'), 'utf8'));
  const cls = new Map(elig.decisions.map((d) => [d.ticker, d.instrument_type]));
  return new Map(uni.securities.filter((s) => s.active !== false).map((s) => [s.ticker, { startDate: s.startDate, instrumentType: cls.get(s.ticker) || null }]));
}

class StopError extends Error {}
let requests = 0, consecutiveErrors = 0;
const stats = { http: {}, stoppedBy: null };

async function tiingo(url) {
  if (requests >= MAX_REQ) throw new StopError('MAX_REQUESTS');
  if ((Date.now() - t0) / 60000 > MAX_MIN) throw new StopError('MAX_MINUTES');
  const h = new Date().getUTCHours() * 60 + new Date().getUTCMinutes();
  if (h >= 21 * 60 + 30 || h < 30) throw new StopError('QUIET_WINDOW_MARKET_RUN');
  requests++;
  let r, text;
  try {
    r = await fetch(url, { headers: { Authorization: 'Token ' + KEY, 'Content-Type': 'application/json' } });
    text = await r.text();
  } catch (e) {
    consecutiveErrors++;
    stats.http.NETWORK = (stats.http.NETWORK || 0) + 1;
    if (consecutiveErrors >= 5) throw new StopError('NETWORK_ERRORS');
    await sleep(PACE_MS * 3);
    return { status: 0, body: null };
  }
  stats.http[r.status] = (stats.http[r.status] || 0) + 1;
  if (r.status === 429 || r.status === 401 || r.status === 403) throw new StopError('HTTP_' + r.status);
  if (/(rate limit|limit reached|exceeded|quota|unique symbol|symbol look ?up|run over)/i.test(text.slice(0, 400)) && !text.trim().startsWith('[')) throw new StopError('LIMIT_MESSAGE');
  if (r.status >= 500) { consecutiveErrors++; if (consecutiveErrors >= 5) throw new StopError('HTTP_5XX'); }
  else consecutiveErrors = 0;
  let body = null;
  try { body = JSON.parse(text); } catch { body = null; }
  await sleep(PACE_MS);
  return { status: r.status, body };
}

async function main() {
  if (MODE !== 'plan' && !KEY) { console.error('TIINGO_API_KEY fehlt - kein Abruf.'); process.exit(2); }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const zip = Buffer.from(await (await fetch(L.LIST_URL, { headers: KEY ? { Authorization: 'Token ' + KEY } : {} })).arrayBuffer());
  const rows = L.parseTickerCsv(L.unzipCsv(zip));
  const listedRoots = Master.collectListedRoots(rows);
  const listings = L.buildListingTable(rows, storeActiveMap());
  const hash = L.tableHash(listings);
  const count = (f) => listings.filter(f).length;
  log(`Tickerliste ${rows.length} Zeilen; Listings im Fenster ${listings.length} (Hash ${hash.slice(0, 12)})`);
  log(`Quelle: STORE_ACTIVE ${count((l) => l.source === 'STORE_ACTIVE')}, FETCH ${count((l) => l.source === 'FETCH')} (davon beendet ${count((l) => l.source === 'FETCH' && !l.active)}), UNFETCHABLE_REUSED ${count((l) => l.source === 'UNFETCHABLE_REUSED')}`);

  let driver = null, store = null, budget = null, manifest = { schema: 'supertrader-validation-manifest-1.0.0', entries: {} };
  const manifestKey = () => store.seriesPrefix + '_validation/manifest.json.gz';
  if (MODE !== 'plan') {
    const { createS3DriverFromEnv } = await import(path.join(root, 'scripts/market/storage/s3-driver.mjs'));
    driver = createS3DriverFromEnv(process.env);
    budget = Guard.createBudget({ classAOperations: 20000, classBOperations: 20000 });
    store = Store.createHistoryStore({ driver, provider: 'tiingo-delisted', market: 'US', budget });
    const main = Store.createHistoryStore({ driver, provider: 'tiingo', market: 'US', budget });
    const mine = await store.readUsage();
    const theirs = await main.readUsage();
    const prev = theirs.storageBytes ? theirs : await main.readUsage(Guard.previousMonthKey());
    const combined = Guard.applyUsage(theirs, { classAOperations: mine.classAOperations, classBOperations: mine.classBOperations, storageBytes: (prev.storageBytes || 0) + (mine.storageBytes || 0) });
    const est = Guard.estimateOperations({ kind: 'VALIDATION_FETCH', objectWrites: Math.min(MAX_REQ, 8000), indexWrites: 200, objectReads: 10, bytesDelta: Math.min(MAX_REQ, 8000) * 60000 });
    const verdict = Guard.evaluate({ usage: combined, estimate: est, operation: 'VALIDATION_FETCH' });
    log(`Zero-Cost-Guard: ${verdict.verdict}; Projektion max. ${verdict.PROJECTED_FREE_TIER_USAGE_PERCENT} % der Freigrenze`);
    if (verdict.verdict !== Guard.ALLOWED) { console.error('Zero-Cost-Guard blockiert - kein Abruf. ' + verdict.reason); process.exit(4); }
    budget.consumeClassB(1, 'GET manifest');
    const buf = await driver.get(manifestKey());
    if (buf) manifest = JSON.parse(zlib.gunzipSync(buf).toString('utf8'));
    log(`Manifest: ${Object.keys(manifest.entries).length} Einträge vorhanden`);
  }

  const queue = MODE === 'subset' ? pickSubset(listings) : MODE === 'full' ? listings.filter((l) => l.source !== 'STORE_ACTIVE') : [];
  const todo = queue.filter((l) => { const e = manifest.entries[l.id]; return !e || e.status === 'ERROR'; });
  if (MODE === 'subset' || MODE === 'full') { todo.push({ id: 'BENCH:SPY', ticker: 'SPY', bench: true, startDate: '1993-01-29', listEnd: null, active: true }); }
  log(`Warteschlange ${queue.length}, offen ${todo.length}`);

  const saveManifest = async () => {
    manifest.updatedAt = new Date().toISOString(); manifest.tableHash = hash;
    budget.consumeClassA(1, 'PUT manifest');
    await driver.put(manifestKey(), zlib.gzipSync(Buffer.from(JSON.stringify(manifest))), { contentType: 'application/json', contentEncoding: 'gzip' });
  };

  let done = 0;
  try {
    for (const l of todo) {
      if (l.bench && manifest.entries[l.id]?.status === 'OK') continue;
      const e = { id: l.id, at: new Date().toISOString() };
      const t = encodeURIComponent(l.ticker);
      const from = l.startDate > L.WINDOW.warmupFrom ? l.startDate : L.WINDOW.warmupFrom;
      const to = l.listEnd && l.listEnd < L.WINDOW.to ? l.listEnd : L.WINDOW.to;
      let meta = null;
      if (l.source !== 'UNFETCHABLE_REUSED') {
        const m = await tiingo(`https://api.tiingo.com/tiingo/daily/${t}`);
        e.metaStatus = m.status;
        if (m.status === 200 && m.body) { meta = { name: m.body.name || null, startDate: m.body.startDate || null, endDate: m.body.endDate || null }; e.name = meta.name; e.metaStart = meta.startDate; e.metaEnd = meta.endDate; }
      }
      if (!l.bench) {
        const c = L.classifyListing(Master, l, meta?.name, listedRoots);
        Object.assign(e, { cls: c.cls, clsConfidence: l.source === 'UNFETCHABLE_REUSED' ? 'LOW' : c.confidence, clsBasis: l.source === 'UNFETCHABLE_REUSED' ? 'tickerOnly' : c.basis, included: c.included });
        if (!c.included && l.source !== 'UNFETCHABLE_REUSED') { e.status = 'SKIPPED_CLASS'; manifest.entries[l.id] = e; done++; continue; }
      }
      const px = await tiingo(`https://api.tiingo.com/tiingo/daily/${t}/prices?startDate=${from}&endDate=${to}&format=json`);
      e.pricesStatus = px.status;
      if (px.status !== 200 || !Array.isArray(px.body)) { e.status = px.status === 404 ? 'EMPTY' : 'ERROR'; if (l.source === 'UNFETCHABLE_REUSED') e.status = 'UNFETCHABLE_REUSED'; manifest.entries[l.id] = e; done++; continue; }
      const bars = px.body.map(L.toRawBar).filter((b) => /^\d{4}-\d{2}-\d{2}$/.test(b.date) && b.close != null).sort((a, b) => a.date.localeCompare(b.date));
      const fc = L.classifyFetch(l, bars, meta);
      Object.assign(e, { status: fc.status, bars: fc.bars, outsideWindow: fc.outsideWindow, first: fc.first || null, last: fc.last || null, flags: fc.flags, returnedFirst: bars[0]?.date || null, returnedLast: bars[bars.length - 1]?.date || null });
      if (l.source === 'UNFETCHABLE_REUSED' && fc.status !== 'OK' && fc.status !== 'PARTIAL') e.status = 'UNFETCHABLE_REUSED';
      if (fc.bars > 0 && (e.status === 'OK' || e.status === 'PARTIAL' || l.bench)) {
        const lo = l.startDate, hi = l.listEnd || '9999-12-31';
        const keep = l.bench ? bars : bars.filter((b) => b.date >= lo && b.date <= hi);
        const put = await store.putSeries({ ticker: `${l.ticker}@${l.startDate}`, listingId: l.id, bars: keep }, { checkRemote: false, skipIfUnchanged: false });
        e.sha256 = put.sha256; e.bytes = put.bytes;
        if (l.bench) e.status = 'OK';
      }
      manifest.entries[l.id] = e; done++;
      if (done % 100 === 0) { await saveManifest(); log(`Fortschritt ${done}/${todo.length}, Anfragen ${requests}`); }
    }
  } catch (err) {
    if (err instanceof StopError) { stats.stoppedBy = err.message; log(`Gestoppt: ${err.message}`); }
    else { stats.stoppedBy = 'EXCEPTION'; console.error(String(err?.message || err).replaceAll(KEY || '\u0000', '***')); }
  }

  const statusCount = {};
  for (const e of Object.values(manifest.entries)) statusCount[e.status] = (statusCount[e.status] || 0) + 1;
  if (store) {
    await saveManifest();
    const sp = budget.spent;
    const usage = await store.readUsage();
    await store.writeUsage(Guard.applyUsage(usage, { classAOperations: sp.classA + 1, classBOperations: sp.classB, bytesUploaded: sp.bytesUploaded, storageBytes: (usage.storageBytes || 0) + sp.bytesUploaded, run: { at: new Date().toISOString(), kind: 'VALIDATION_FETCH', mode: MODE, requests, classA: sp.classA + 1 } }));
  }
  log(`Ende: ${done} Listings bearbeitet, ${requests} Tiingo-Anfragen, HTTP ${JSON.stringify(stats.http)}, Stopp ${stats.stoppedBy || '-'}`);
  log(`Manifest-Status: ${JSON.stringify(statusCount)}`);
  const summary = { schema: 'supertrader-validation-fetch-1.0.0', mode: MODE, at: new Date().toISOString(), tableHash: hash, listings: listings.length, requests, http: stats.http, stoppedBy: stats.stoppedBy, statusCount, listingTable: listings, manifest: manifest.entries };
  const pem = fs.readFileSync(path.join(root, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  const sealed = L.encryptForOwner(pem, Buffer.from(JSON.stringify(summary)));
  if (KEY && sealed.includes(KEY)) throw new Error('Schluessel im Ergebnis');
  fs.writeFileSync(path.join(OUT_DIR, `fetch-${MODE}.sealed.json`), sealed);
  log(`Verschlüsseltes Ergebnis geschrieben (${sealed.length} Byte)`);
  if (stats.stoppedBy && !['MAX_REQUESTS', 'MAX_MINUTES', 'QUIET_WINDOW_MARKET_RUN'].includes(stats.stoppedBy)) process.exitCode = 5;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(String(e?.message || e).replaceAll(KEY || '\u0000', '***')); process.exit(1); });
