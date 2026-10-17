#!/usr/bin/env node
// Minervini Canonical Replication – SEC-Erstmeldungen (EPS, Umsatz, Bruttogewinn, operatives und Nettoergebnis)
// point-in-time je Listing in den privaten Eimer schreiben (Schluessel sec-pit-mrepl-1).
//
//   ST_WINDOW=DEV|HOLDOUT node scripts/supertrader/replication/minervini/build-sec-facts.mjs --out DIR
//
// Keine neue Datenquelle: EDGAR companyfacts.zip (public domain), wie validation/sec-pit.mjs.
// Keine neue Namenszuordnung: CIK je Listing aus dem bestehenden Speicher sec-pit-r12 (sonst r11) desselben Fensters.
// Das Log zeigt nur Zaehlwerte aus SEC-Daten (oeffentlich); keine Kursdaten.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as L from '../../validation/lib.mjs';
import { PIT_KEY, PIT_KEY_R12 } from '../../validation/sec-pit.mjs';
import { extractCompanyFacts, SCHEMA } from './sec-facts.mjs';
import { SEC_STORE_KEY } from './measure.mjs';

const pexec = promisify(execFile);
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..', '..');
const Store = require(path.join(root, 'quant/engines/history-store.js'));
const Guard = require(path.join(root, 'quant/engines/zero-cost-guard.js'));
const UA = 'VisionUniverse-Research/1.0 (method fidelity review; info@visionuniverse.de)';

async function download(url, file) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate' } });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  const ws = fs.createWriteStream(file);
  for await (const chunk of r.body) ws.write(chunk);
  await new Promise((res) => ws.end(res));
  return fs.statSync(file).size;
}

async function main() {
  const argv = process.argv.slice(2);
  const OUT = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : path.join(os.tmpdir(), 'mrepl-sec');
  fs.mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();
  const log = (m) => console.log(`[mrepl-sec ${L.WINDOW_NAME} +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
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
  const ciks = new Map(Object.entries(mapping).map(([id, v]) => [id, v.cik]));
  log(`CIK-Zuordnung aus ${from}: ${ciks.size} Listings`);
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sec-'));
  const cfZip = path.join(TMP, 'companyfacts.zip');
  log(`companyfacts.zip ${await download('https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip', cfZip)} Byte`);
  const cache = new Map();
  const records = {};
  const stats = { listings: ciks.size, withRecord: 0, withEps: 0, withRev: 0, withGp: 0, withOpinc: 0, withNi: 0, ifrs: 0, noFacts: 0, derivedQ4Eps: 0, causes: {} };
  let k = 0;
  for (const [id, cik] of ciks) {
    let rec = cache.get(cik);
    if (rec === undefined) {
      rec = null;
      try { const { stdout } = await pexec('unzip', ['-p', cfZip, `CIK${cik}.json`], { maxBuffer: 512 * 1024 * 1024, encoding: 'buffer' }); if (stdout.length) rec = extractCompanyFacts(JSON.parse(stdout.toString('utf8'))); } catch { rec = null; }
      cache.set(cik, rec);
    }
    if (!rec || !rec.taxonomy) { stats.noFacts++; const c = rec?.cause || 'NO_COMPANYFACTS'; stats.causes[c] = (c in stats.causes ? stats.causes[c] : 0) + 1; continue; }
    records[id] = { cik, ...rec };
    stats.withRecord++;
    if (rec.eps.length) stats.withEps++;
    if (rec.rev.length) stats.withRev++;
    if (rec.gp.length) stats.withGp++;
    if (rec.opinc.length) stats.withOpinc++;
    if (rec.ni.length) stats.withNi++;
    if (rec.taxonomy === 'ifrs-full') stats.ifrs++;
    stats.derivedQ4Eps += rec.eps.filter((r) => r[5] === 1).length;
    if (++k % 500 === 0) log(`verarbeitet ${k}`);
  }
  log(`Ergebnis: ${JSON.stringify(stats)}`);
  budget.consumeClassA(1, 'PUT sec facts mrepl');
  await driver.put(mine.seriesPrefix + SEC_STORE_KEY, zlib.gzipSync(Buffer.from(JSON.stringify({ schema: SCHEMA, window: L.WINDOW_NAME, cikSource: from, builtAt: new Date().toISOString(), commit: process.env.GITHUB_SHA || null, records }))), { contentType: 'application/gzip' });
  log(`abgelegt: ${SEC_STORE_KEY}`);
  const pem = fs.readFileSync(path.join(root, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  fs.writeFileSync(path.join(OUT, `mrepl-sec-facts-${L.WINDOW_NAME.toLowerCase()}.sealed.json`), L.encryptForOwner(pem, Buffer.from(JSON.stringify({ schema: 'vu-mrepl-sec-stats-1.0.0', stats, cikSource: from, at: new Date().toISOString() }))));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
