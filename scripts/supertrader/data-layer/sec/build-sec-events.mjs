#!/usr/bin/env node
// Generischer VU-Datenlayer – Ergebnis-Ereignisse (8-K Item 2.02) und SIC point-in-time je CIK des Fensters
// in den privaten Eimer schreiben (Schluessel sec-events-sic-1). Nur offizielle, kostenlose SEC-Quellen:
//   data.sec.gov/submissions/CIK##########.json (+ aeltere Seiten), www.sec.gov/Archives/.../<acc>.hdr.sgml
//
//   ST_WINDOW=DEV|HOLDOUT node scripts/supertrader/data-layer/sec/build-sec-events.mjs --out DIR [--limit N]
//
// CIK-Zuordnung: bestehender Speicher sec-pit-r12 (sonst r11) desselben Fensters – keine neue Namenszuordnung.
// SEC-Fairness: hoechstens ca. 8 Anfragen je Sekunde, eigener User-Agent mit Kontakt. Log nur Zaehlwerte.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as L from '../../validation/lib.mjs';
import { PIT_KEY, PIT_KEY_R12 } from '../../validation/sec-pit.mjs';
import { extractEarningsEvents, EV, EVENT, SCHEMA as EVENTS_SCHEMA } from './earnings-events.mjs';
import { parseHeaderSic, periodicFilings, sicHistoryByBisection, SCHEMA as SIC_SCHEMA } from './industry-sic.mjs';

export const STORE_KEY = 'sec-events-sic-1.json.gz';
export const REQUEST_INTERVAL_MS = 125;
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..', '..');
const Store = require(path.join(root, 'quant/engines/history-store.js'));
const Guard = require(path.join(root, 'quant/engines/zero-cost-guard.js'));
const UA = 'VisionUniverse-Research/1.0 (point-in-time research data; info@visionuniverse.de)';

let last = 0;
async function secGet(url, kind) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const wait = last + REQUEST_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate' } });
    if (r.status === 404) return null;
    if (r.ok) return kind === 'json' ? r.json() : r.text();
    if (r.status === 429 || r.status >= 500) { await new Promise((res) => setTimeout(res, 2000 * attempt)); continue; }
    throw new Error(`${url}: ${r.status}`);
  }
  throw new Error(`${url}: retries exhausted`);
}

const pad = (cik) => String(cik).padStart(10, '0');

async function main() {
  const argv = process.argv.slice(2);
  const OUT = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : path.join(os.tmpdir(), 'sec-events');
  const LIMIT = argv.includes('--limit') ? Number(argv[argv.indexOf('--limit') + 1]) : null;
  fs.mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();
  const log = (m) => console.log(`[sec-events ${L.WINDOW_NAME} +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
  const { createS3DriverFromEnv } = await import(path.join(root, 'scripts/market/storage/s3-driver.mjs'));
  const driver = createS3DriverFromEnv(process.env);
  const budget = Guard.createBudget({ classAOperations: 4, classBOperations: 8 });
  const mine = Store.createHistoryStore({ driver, provider: L.SERIES_PROVIDER, market: 'US', budget });
  let mapping = null, from = null;
  for (const key of [PIT_KEY_R12, PIT_KEY]) {
    budget.consumeClassB(1, 'GET ' + key);
    const buf = await driver.get(mine.seriesPrefix + key);
    if (buf) { mapping = JSON.parse(zlib.gunzipSync(buf).toString('utf8')); from = key; break; }
  }
  if (!mapping) { console.error('Kein bestehender sec-pit-Speicher mit CIK-Zuordnung in diesem Fenster.'); process.exit(3); }
  const listingCik = Object.fromEntries(Object.entries(mapping).filter(([, v]) => v && v.cik).map(([id, v]) => [id, pad(v.cik)]));
  let ciks = [...new Set(Object.values(listingCik))].sort();
  if (LIMIT) ciks = ciks.slice(0, LIMIT);
  // Ein Jahr vor dem Aufwaermbeginn, damit am ersten Fenstertag eine SIC und die letzte Mitteilung bekannt sind.
  const fromDate = L.addDays(L.WINDOW.warmupFrom, -366), toDate = L.WINDOW.to;
  const fromYear = Number(fromDate.slice(0, 4));
  log(`CIK-Zuordnung aus ${from}: ${Object.keys(listingCik).length} Listings, ${ciks.length} CIKs, Zeitraum ${fromDate}..${toDate}`);
  const byCik = {};
  const stats = { ciks: ciks.length, noSubmissions: 0, pagesFetched: 0, headersRead: 0, headersNoSic: 0, withEvents: 0, releases: 0, amendments: 0, duplicates: 0, periodic: 0, withSic: 0, withSicChange: 0, sicChanges: 0, errors: 0 };
  let k = 0;
  for (const cik of ciks) {
    try {
      const sub = await secGet(`https://data.sec.gov/submissions/CIK${cik}.json`, 'json');
      if (!sub) { stats.noSubmissions++; continue; }
      const pages = [sub.filings?.recent];
      for (const f of sub.filings?.files || []) {
        if (f.filingTo < fromDate || f.filingFrom > toDate) continue;
        const pg = await secGet(`https://data.sec.gov/submissions/${f.name}`, 'json');
        stats.pagesFetched++;
        if (pg) pages.push(pg);
      }
      const events = extractEarningsEvents(pages).filter((e) => e[EV.FILED] >= fromDate && e[EV.FILED] <= toDate);
      const filings = periodicFilings(pages, fromYear).filter((f) => f.filingDate <= toDate);
      const cikNum = String(Number(cik));
      const sic = await sicHistoryByBisection(filings, async (f) => {
        stats.headersRead++;
        const txt = await secGet(`https://www.sec.gov/Archives/edgar/data/${cikNum}/${f.accession.replace(/-/g, '')}/${f.accession}.hdr.sgml`, 'text');
        const s = parseHeaderSic(txt);
        if (!s) stats.headersNoSic++;
        return s;
      });
      byCik[cik] = { events, sic, currentSic: sub.sic ? String(sub.sic).padStart(4, '0') : null };
      if (events.length) stats.withEvents++;
      for (const e of events) {
        if (e[EV.TYPE] === EVENT.EARNINGS_RELEASE) stats.releases++;
        else if (e[EV.TYPE] === EVENT.AMENDMENT) stats.amendments++;
        else if (e[EV.TYPE] === EVENT.DUPLICATE) stats.duplicates++;
        else stats.periodic++;
      }
      if (sic.length) stats.withSic++;
      const changes = sic.filter((h, i) => i > 0 && h[2] !== sic[i - 1][2]).length;
      if (changes) { stats.withSicChange++; stats.sicChanges += changes; }
    } catch (e) { stats.errors++; }
    if (++k % 250 === 0) log(`verarbeitet ${k}/${ciks.length}`);
  }
  log(`Ergebnis: ${JSON.stringify(stats)}`);
  const payload = { schema: { events: EVENTS_SCHEMA, sic: SIC_SCHEMA }, window: L.WINDOW_NAME, cikSource: from, range: [fromDate, toDate], builtAt: new Date().toISOString(), commit: process.env.GITHUB_SHA || null, listingCik, byCik };
  if (LIMIT) { log('--limit: kein Ablegen im Eimer (Probelauf)'); }
  else {
    budget.consumeClassA(1, 'PUT sec events/sic');
    await driver.put(mine.seriesPrefix + STORE_KEY, zlib.gzipSync(Buffer.from(JSON.stringify(payload))), { contentType: 'application/gzip' });
    log(`abgelegt: ${STORE_KEY}`);
  }
  const pem = fs.readFileSync(path.join(root, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  fs.writeFileSync(path.join(OUT, `sec-events-sic-${L.WINDOW_NAME.toLowerCase()}.sealed.json`), L.encryptForOwner(pem, Buffer.from(JSON.stringify({ schema: 'vu-sec-events-sic-stats-1.0.0', stats, cikSource: from, at: new Date().toISOString() }))));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
