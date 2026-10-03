#!/usr/bin/env node
// Supertrader R10 - Universumspruefung: Welche aufgenommenen (delisteten) Listings sind
// nach Name keine Aktien (ETN/ETF/gehebelt), welche haben gar keinen Namen? Anlass:
// NRGU (3x-ETN) erschien in der Fallpruefung als "Aktiengewinner".
//
//   node scripts/supertrader/validation/universe-audit.mjs --out DIR
// Liest nur Listentabelle und Manifest (keine Kursreihen). Ergebnis verschluesselt; Log nur Zaehlwerte.
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

async function main() {
  const argv = process.argv.slice(2);
  const OUT = argv[argv.indexOf('--out') + 1] || path.join(os.tmpdir(), 'uaudit');
  fs.mkdirSync(OUT, { recursive: true });
  const KEY = process.env.TIINGO_API_KEY || '';
  const zip = Buffer.from(await (await fetch(L.LIST_URL, { headers: KEY ? { Authorization: 'Token ' + KEY } : {} })).arrayBuffer());
  const rows = L.parseTickerCsv(L.unzipCsv(zip));
  const uni = JSON.parse(fs.readFileSync(path.join(root, 'quant/data/market/scale/universe-FULL_UNIVERSE.json'), 'utf8'));
  const elig = JSON.parse(fs.readFileSync(path.join(root, 'quant/data/market/security-master/eligibility.json'), 'utf8'));
  const cls = new Map(elig.decisions.map((d) => [d.ticker, d.instrument_type]));
  const storeActive = new Map(uni.securities.filter((s) => s.active !== false).map((s) => [s.ticker, { startDate: s.startDate, instrumentType: cls.get(s.ticker) || null }]));
  const listings = L.buildListingTable(rows, storeActive);
  const listedRoots = Master.collectListedRoots(rows);
  const { createS3DriverFromEnv } = await import(path.join(root, 'scripts/market/storage/s3-driver.mjs'));
  const driver = createS3DriverFromEnv(process.env);
  const budget = Guard.createBudget({ classAOperations: 5, classBOperations: 50 });
  const mine = Store.createHistoryStore({ driver, provider: 'tiingo-delisted', market: 'US', budget });
  budget.consumeClassB(1, 'GET manifest');
  const mbuf = await driver.get(mine.seriesPrefix + '_validation/manifest.json.gz');
  const manifest = mbuf ? JSON.parse(zlib.gunzipSync(mbuf).toString('utf8')).entries : {};
  const out = { included: 0, noName: [], nonEquityByName: [], byBasis: {}, examples: {} };
  for (const l of listings) {
    if (l.source === 'STORE_ACTIVE') continue;
    const e = manifest[l.id];
    if (!(e && (e.status === 'OK' || e.status === 'PARTIAL'))) continue;
    const c = l.source === 'UNFETCHABLE_REUSED' ? { included: e.included, cls: e.cls || null, basis: 'STORED' } : L.classifyListing(Master, l, e.name, listedRoots);
    if (!c.included) continue;
    out.included++;
    out.byBasis[c.basis] = (out.byBasis[c.basis] || 0) + 1;
    const name = e.name || '';
    if (!name) out.noName.push(l.id);
    else if (L.nonEquityName(name)) out.nonEquityByName.push([l.id, name]);
    if (/^(NRGU|NRGD|FNGU|BNKU|OILU)$/.test(l.ticker)) out.examples[l.id] = { name: e.name || null, source: l.source, basis: c.basis, status: e.status };
  }
  console.log(`aufgenommene Eimer-Listings ${out.included}, ohne Namen ${out.noName.length}, Nicht-Aktie nach Name ${out.nonEquityByName.length}`);
  const pem = fs.readFileSync(path.join(root, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  fs.writeFileSync(path.join(OUT, 'universe-audit.sealed.json'), L.encryptForOwner(pem, Buffer.from(JSON.stringify({ schema: 'supertrader-universe-audit-1.0.0', at: new Date().toISOString(), commit: process.env.GITHUB_SHA || null, ...out }))));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
