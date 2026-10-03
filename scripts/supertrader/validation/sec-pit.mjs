#!/usr/bin/env node
// Supertrader R11 - Gewinnhistorie zum damaligen Stand fuer Minervini 3.0.0 (PREREGISTRATION-R11),
// auch fuer delistete Titel. Quelle: SEC EDGAR (public domain), keine Kosten.
//
//   node scripts/supertrader/validation/sec-pit.mjs --out DIR
//
// 1. Universum wie loadPitData (Listentabelle + Manifest, ohne Kursreihen).
// 2. CIK je Listing: gelistete Titel ueber die bekannte Zuordnung (company-names / cik-map),
//    delistete ueber die SEC-Namensliste (cik-lookup-data.txt, alle je verwendeten Firmennamen).
//    Mehrdeutige Namen werden ueber Quartalsdaten im Listungszeitraum entschieden, sonst verworfen.
// 3. Quartalswerte aus dem EDGAR-Bulk companyfacts.zip: EPS (verwaessert, sonst unverwaessert) und
//    Umsatz, nur 3-Monats-Perioden (Q4 = Geschaeftsjahr − drei Quartale, als abgeleitet markiert),
//    je Periode nur die ERSTE Einreichung (Datum der ersten Veroeffentlichung).
// 4. Ablage nur im privaten Eimer; Ergebnisstatistik verschluesselt; Log nur Zaehlwerte.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as L from './lib.mjs';

const pexec = promisify(execFile);
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const Store = require(path.join(root, 'quant/engines/history-store.js'));
const Guard = require(path.join(root, 'quant/engines/zero-cost-guard.js'));
const Master = require(path.join(root, 'quant/engines/us-security-master.js'));
const UA = 'VisionUniverse-Research/1.0 (method fidelity review; info@visionuniverse.de)';
export const PIT_KEY = '_validation/sec-pit-r11.json.gz';

const SUFFIX = /\b(INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|LLC|L\.?L\.?C|PLC|LP|L\.?P|HOLDINGS?|GROUP|THE|SA|NV|AG|SE|N\.?V|S\.?A|CL(ASS)? [A-Z]|COMMON STOCK|ORDINARY SHARES|ADR|ADS|NEW|DEL|DE|NY|MD|NV|CAN)\b/g;
export function normName(s) {
  return String(s || '').toUpperCase().replace(/\/[A-Z]{2,3}\//g, ' ').replace(/&/g, ' AND ').replace(/[^A-Z0-9 ]/g, ' ').replace(SUFFIX, ' ').replace(/\s+/g, ' ').trim();
}

const EPS_TAGS = ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted', 'EarningsPerShareBasic'];
const REV_TAGS = ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueNet', 'SalesRevenueGoodsNet', 'SalesRevenueServicesNet'];
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 864e5;

// Quartalsreihe [end, value, firstFiled, derived] aus companyfacts-Eintraegen einer Kennzahl.
export function quarterly(entries) {
  const q = new Map(), fy = [];
  for (const e of entries || []) {
    if (!e.start || !e.end || !Number.isFinite(e.val) || !e.filed) continue;
    const d = days(e.start, e.end);
    if (d >= 80 && d <= 100) { const cur = q.get(e.end); if (!cur || e.filed < cur[2]) q.set(e.end, [e.end, e.val, e.filed, 0, e.start]); }
    else if (d >= 350 && d <= 380) fy.push(e);
  }
  // Q4 = Geschaeftsjahr minus die drei Quartale dieses Jahres (erste Einreichung des Jahreswerts).
  const fyFirst = new Map();
  for (const e of fy) { const k = e.start + '|' + e.end; const cur = fyFirst.get(k); if (!cur || e.filed < cur.filed) fyFirst.set(k, e); }
  for (const e of fyFirst.values()) {
    if (q.has(e.end)) continue;
    const inYear = [...q.values()].filter((x) => x[4] >= e.start && x[0] < e.end && x[3] === 0);
    if (inYear.length !== 3) continue;
    q.set(e.end, [e.end, e.val - inYear.reduce((a, x) => a + x[1], 0), e.filed, 1, null]);
  }
  return [...q.values()].map((x) => x.slice(0, 4)).sort((a, b) => a[0].localeCompare(b[0]));
}

export function extractFacts(cf) {
  const g = cf?.facts?.['us-gaap'] || {};
  const pick = (tags, unitPred) => { for (const t of tags) { const u = g[t]?.units; if (!u) continue; for (const [unit, arr] of Object.entries(u)) if (unitPred(unit)) { const q = quarterly(arr); if (q.length >= 4) return { tag: t, q }; } } return null; };
  const eps = pick(EPS_TAGS, (u) => /USD\/shares/i.test(u));
  // Umsatz: je Periode der erste verfuegbare Tag in Prioritaetsreihenfolge.
  const revMap = new Map();
  for (const t of REV_TAGS) { const u = g[t]?.units?.USD; if (!u) continue; for (const r of quarterly(u)) if (!revMap.has(r[0])) revMap.set(r[0], r); }
  return { name: cf?.entityName || null, epsTag: eps?.tag || null, eps: eps?.q || [], rev: [...revMap.values()].sort((a, b) => a[0].localeCompare(b[0])) };
}

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
  const OUT = argv[argv.indexOf('--out') + 1] || path.join(os.tmpdir(), 'secpit');
  fs.mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();
  const log = (m) => console.log(`[sec-pit +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sec-'));
  const KEY = process.env.TIINGO_API_KEY || '';

  // 1. Universum (wie loadPitData, ohne Kursreihen)
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
  const companyRows = JSON.parse(fs.readFileSync(path.join(root, 'quant/data/market/security-master/company-names.json'), 'utf8')).rows || [];
  const companyOf = new Map(companyRows.map((r) => [r.ticker, r]));
  const members = [];
  for (const l of listings) {
    if (l.source === 'STORE_ACTIVE') { if (L.INCLUDED_CLASSES.has(l.storeClass)) members.push({ l, name: companyOf.get(l.ticker)?.companyName || null, knownCik: companyOf.get(l.ticker)?.cik || null }); continue; }
    const e = manifest[l.id];
    if (!(e && (e.status === 'OK' || e.status === 'PARTIAL'))) continue;
    const inc = l.source === 'UNFETCHABLE_REUSED' ? e.included : L.classifyListing(Master, l, e.name, listedRoots).included;
    if (inc) members.push({ l, name: e.name || null, knownCik: null });
  }
  log(`Mitglieder ${members.length}, davon mit bekannter CIK ${members.filter((m) => m.knownCik).length}`);

  // 2. SEC-Namensliste und Bulk-Daten
  const lookupFile = path.join(TMP, 'cik-lookup-data.txt');
  log(`Namensliste ${await download('https://www.sec.gov/Archives/edgar/cik-lookup-data.txt', lookupFile)} Byte`);
  const byName = new Map();
  for (const line of fs.readFileSync(lookupFile, 'latin1').split('\n')) {
    const m = line.match(/^(.*):(\d{10}):\s*$/); if (!m) continue;
    const k = normName(m[1]); if (!k) continue;
    (byName.get(k) || byName.set(k, new Set()).get(k)).add(m[2]);
  }
  log(`Namen ${byName.size}`);
  const cfZip = path.join(TMP, 'companyfacts.zip');
  log(`companyfacts.zip ${await download('https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip', cfZip)} Byte`);
  const cache = new Map();
  const facts = async (cik) => {
    if (cache.has(cik)) return cache.get(cik);
    let v = null;
    try { const { stdout } = await pexec('unzip', ['-p', cfZip, `CIK${cik}.json`], { maxBuffer: 512 * 1024 * 1024, encoding: 'buffer' }); if (stdout.length) v = extractFacts(JSON.parse(stdout.toString('utf8'))); } catch { v = null; }
    cache.set(cik, v); return v;
  };
  const overlaps = (f, l) => { const from = l.startDate, to = l.listEnd || '2026-12-31'; return !!f && [...f.eps, ...f.rev].some((r) => r[0] >= from && r[0] <= to); };

  // 3. Zuordnung
  const out = {}, stats = { members: members.length, known: 0, nameMatched: 0, ambiguous: 0, noName: 0, noMatch: 0, noFacts: 0, withEps: { active: 0, delisted: 0 }, total: { active: 0, delisted: 0 }, accuracy: { tested: 0, correct: 0, wrong: 0, ambiguousOrNone: 0 } };
  let k = 0;
  for (const m of members) {
    const active = m.l.source === 'STORE_ACTIVE';
    stats.total[active ? 'active' : 'delisted']++;
    let cik = m.knownCik ? String(m.knownCik).padStart(10, '0') : null, how = cik ? 'KNOWN' : null;
    // Zuordnungsguete: gelistete Titel mit bekannter CIK zusaetzlich ueber den Namen zuordnen.
    if (cik && m.name && stats.accuracy.tested < 1500) {
      const cands = [...(byName.get(normName(m.name)) || [])];
      const ok = []; for (const c of cands.slice(0, 6)) if (overlaps(await facts(c), m.l)) ok.push(c);
      stats.accuracy.tested++;
      if (ok.length === 1) { if (ok[0] === cik) stats.accuracy.correct++; else stats.accuracy.wrong++; } else stats.accuracy.ambiguousOrNone++;
    }
    if (!cik) {
      if (!m.name) { stats.noName++; continue; }
      const cands = [...(byName.get(normName(m.name)) || [])];
      if (!cands.length) { stats.noMatch++; continue; }
      const ok = []; for (const c of cands.slice(0, 6)) if (overlaps(await facts(c), m.l)) ok.push(c);
      if (ok.length !== 1) { stats[ok.length ? 'ambiguous' : 'noFacts']++; continue; }
      cik = ok[0]; how = 'NAME_MATCH'; stats.nameMatched++;
    } else stats.known++;
    const f = await facts(cik);
    if (!f || !f.eps.length) { stats.noFacts++; continue; }
    out[m.l.id] = { cik, how, epsTag: f.epsTag, eps: f.eps, rev: f.rev };
    stats.withEps[active ? 'active' : 'delisted']++;
    if (++k % 500 === 0) log(`zugeordnet ${k}`);
  }
  log(`mit EPS: gelistet ${stats.withEps.active}/${stats.total.active}, delistet ${stats.withEps.delisted}/${stats.total.delisted}; Namensabgleich-Pruefung ${stats.accuracy.correct}/${stats.accuracy.tested} richtig, ${stats.accuracy.wrong} falsch`);
  budget.consumeClassA(1, 'PUT sec pit');
  await driver.put(mine.seriesPrefix + PIT_KEY, zlib.gzipSync(Buffer.from(JSON.stringify(out))), { contentType: 'application/gzip' });
  log('Gewinnhistorie im privaten Eimer abgelegt');
  const byYear = {};
  for (const v of Object.values(out)) for (const r of v.eps) { const y = r[2].slice(0, 4); byYear[y] = (byYear[y] || 0) + 1; }
  const pem = fs.readFileSync(path.join(root, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  fs.writeFileSync(path.join(OUT, 'sec-pit.sealed.json'), L.encryptForOwner(pem, Buffer.from(JSON.stringify({ schema: 'supertrader-sec-pit-1.0.0', at: new Date().toISOString(), commit: process.env.GITHUB_SHA || null, stats, epsFilingsByYear: byYear }))));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
