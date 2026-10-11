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
// Runde 12: erweiterte Fassung (IFRS, weitere EPS-/Umsatzkennzahlen, Ursachen fehlender Reihen); r11 bleibt unveraendert.
export const PIT_KEY_R12 = '_validation/sec-pit-r12.json.gz';
// Hausstrategie HS3: zusaetzlich Aktienanzahl zum Einreichungsdatum (Marktkapitalisierung zum Stichtag); r12 bleibt unveraendert.
export const PIT_KEY_R13 = '_validation/sec-pit-r13.json.gz';

// Aktienanzahl [Stichtag, Stueck, ersteEinreichung, Quelle] aus companyfacts.
// dei:EntityCommonStockSharesOutstanding (Deckblatt, Stichtag nahe der Einreichung); mehrere Gattungen
// derselben Einreichung und desselben Stichtags werden addiert (verschiedene Werte), sonst je Stichtag
// die erste Einreichung. Rueckfall: us-gaap WeightedAverageNumberOfDilutedSharesOutstanding (Quartal).
export function sharesSeries(cf) {
  const dei = cf?.facts?.dei?.EntityCommonStockSharesOutstanding?.units?.shares || [];
  const byFiling = new Map();
  for (const e of dei) {
    if (!e.end || !e.filed || !(e.val > 0)) continue;
    const k = e.accn + '|' + e.end;
    const cur = byFiling.get(k) || { end: e.end, filed: e.filed, vals: new Set() };
    cur.vals.add(e.val); if (e.filed < cur.filed) cur.filed = e.filed; byFiling.set(k, cur);
  }
  const byEnd = new Map();
  for (const f of byFiling.values()) { const v = [...f.vals].reduce((a, b) => a + b, 0); const cur = byEnd.get(f.end); if (!cur || f.filed < cur[2]) byEnd.set(f.end, [f.end, v, f.filed, 'dei']); }
  if (!byEnd.size) {
    const u = cf?.facts?.['us-gaap']?.WeightedAverageNumberOfDilutedSharesOutstanding?.units?.shares;
    for (const r of quarterly(u || [])) if (!r[3]) byEnd.set(r[0], [r[0], r[1], r[2], 'wadso']);
  }
  return [...byEnd.values()].sort((a, b) => a[0].localeCompare(b[0]));
}

// Runde 13: Delisting-Klassifikation aus SEC-Einreichungen (PREREGISTRATION-R13-AUDIT D).
export const DELIST_KEY = '_validation/sec-delist-r13.json.gz';
export const MERGER_FORMS = new Set(['DEFM14A', 'PREM14A', 'DEFM14C', 'PREM14C', 'SC TO-T', 'SC TO-T/A', 'SC 14D9', 'SC 14D9/A', 'SC 13E3', 'SC 13E3/A', 'SC13E3', '425']);
export function classifyDelisting(filings, listEnd) {
  const end = Date.parse(listEnd), lo = end - 450 * 864e5, hi = end + 60 * 864e5;
  const hits = [];
  for (let i = 0; i < (filings.form || []).length; i++) { const f = filings.form[i], d = Date.parse(filings.filingDate[i]); if (d >= lo && d <= hi && MERGER_FORMS.has(f)) hits.push([f, filings.filingDate[i]]); }
  return hits.length ? { cls: 'ACQUISITION', evidence: hits.slice(0, 6) } : { cls: 'UNKNOWN', evidence: [] };
}

// Runde 15 (R14-Regressionsfaelle DESP, BEL, HLAH, HIII, BSKY): R13 scheiterte an zwei Stellen –
//  (1) keine CIK-Zuordnung, weil die Zuordnung XBRL-Gewinndaten im Notierungszeitraum verlangte (SPACs, Auslandsemittenten);
//  (2) Uebernahmen ohne Proxy-/Tender-Formular im Fenster (Vollzug erkennbar an S-8 POS / POS AM am Delisting-Tag).
// R15-Regeln (VU-Formalisierung, versioniert; R13-Klassifikator bleibt unveraendert fuer die Reproduktion):
//  A) Uebernahmeformulare wie R13 → ACQUISITION (basis MERGER_FORM)
//  B) SIC 6770 "Blank Checks" → SPAC_TRUST: Aufloesung zum Treuhandwert ≈ letzter Kurs
//  C) Abmeldung von Registrierungen (S-8 POS, POS AM, POSASR, POS462B) zwischen 5 Tagen vor und 10 Tagen nach dem letzten
//     Handelstag UND keine Notlagen-Signatur im Kurs → ACQUISITION (basis DEREGISTRATION_NO_DISTRESS)
export const DEREG_FORMS = new Set(['S-8 POS', 'POS AM', 'POSASR', 'POS462B']);
export const DELIST_CLASSIFIER_R15 = 'supertrader-delist-classifier-r15-1.0.0';
export function classifyDelistingR15({ filings, sic, listEnd, distress }) {
  const r13 = classifyDelisting(filings, listEnd);
  if (r13.cls === 'ACQUISITION') return { cls: 'ACQUISITION', basis: 'MERGER_FORM', evidence: r13.evidence };
  if (String(sic) === '6770') return { cls: 'SPAC_TRUST', basis: 'SIC_6770', evidence: [['SIC', '6770']] };
  const end = Date.parse(listEnd), lo = end - 5 * 864e5, hi = end + 10 * 864e5;
  const dereg = [];
  for (let i = 0; i < (filings.form || []).length; i++) { const d = Date.parse(filings.filingDate[i]); if (d >= lo && d <= hi && DEREG_FORMS.has(filings.form[i])) dereg.push([filings.form[i], filings.filingDate[i]]); }
  if (dereg.length && distress === false) return { cls: 'ACQUISITION', basis: 'DEREGISTRATION_NO_DISTRESS', evidence: dereg.slice(0, 6) };
  return { cls: 'UNKNOWN', basis: dereg.length ? 'DEREGISTRATION_WITH_DISTRESS' : 'NO_EVIDENCE', evidence: dereg.slice(0, 6) };
}
// R15: CIK fuer die Delisting-Klassifikation ohne XBRL-Zwang. Mehrere Kandidaten → nur der mit identischem normalisiertem
// Namen (z. B. Fonds II vs. III); sonst keine Zuordnung (lieber UNKNOWN als falsche Firma).
// Kandidaten ohne Einreichungen im Fenster um das Delisting (filingsInWindow leer) scheiden aus.
export function selectDelistCik(listingNameNorm, candidates) {
  const live = candidates.filter((c) => c && c.cik && c.name && (!Array.isArray(c.filingsInWindow) || c.filingsInWindow.length > 0));
  if (live.length === 1) return live[0].cik;
  const exact = live.filter((c) => normName(c.name) === listingNameNorm);
  return exact.length === 1 ? exact[0].cik : null;
}

const SUFFIX = /\b(INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|LLC|L\.?L\.?C|PLC|LP|L\.?P|HOLDINGS?|GROUP|THE|SA|NV|AG|SE|N\.?V|S\.?A|CL(ASS)? [A-Z]|COMMON STOCK|ORDINARY SHARES|ADR|ADS|NEW|DEL|DE|NY|MD|NV|CAN)\b/g;
export function normName(s) {
  return String(s || '').toUpperCase().replace(/\/[A-Z]{2,3}\//g, ' ').replace(/&/g, ' AND ').replace(/[^A-Z0-9 ]/g, ' ').replace(SUFFIX, ' ').replace(/\s+/g, ' ').trim();
}

const EPS_TAGS = ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted', 'EarningsPerShareBasic'];
// Runde 12: zusaetzliche Kennzahlen (nur wenn die obigen fehlen) und IFRS-Taxonomie (Auslandsemittenten).
const EPS_TAGS_R12 = [...EPS_TAGS, 'IncomeLossFromContinuingOperationsPerDilutedShare', 'IncomeLossFromContinuingOperationsPerBasicShare'];
const IFRS_EPS = ['DilutedEarningsLossPerShare', 'BasicEarningsLossPerShare', 'BasicAndDilutedEarningsLossPerShare'];
const IFRS_REV = ['Revenue', 'RevenueFromContractsWithCustomers'];
const REV_TAGS = ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueNet', 'SalesRevenueGoodsNet', 'SalesRevenueServicesNet'];
const REV_TAGS_R12 = [...REV_TAGS, 'RevenuesNetOfInterestExpense', 'InterestAndDividendIncomeOperating', 'RegulatedAndUnregulatedOperatingRevenue'];
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


// Runde 12: Extraktion mit erweiterten Kennzahlen, IFRS und Ursachenangabe, wenn keine Quartals-EPS vorliegen.
export function extractFactsR12(cf) {
  const g = cf?.facts?.['us-gaap'] || {}, ifrs = cf?.facts?.['ifrs-full'] || {};
  const pick = (tax, tags, unitPred) => { for (const t of tags) { const u = tax[t]?.units; if (!u) continue; for (const [unit, arr] of Object.entries(u)) if (unitPred(unit)) { const q = quarterly(arr); if (q.length >= 4) return { tag: t, q, unit }; } } return null; };
  const perShare = (u) => /\/shares$/i.test(u);
  let eps = pick(g, EPS_TAGS_R12, perShare), tax = 'us-gaap';
  if (!eps) { eps = pick(ifrs, IFRS_EPS, perShare); if (eps) tax = 'ifrs-full'; }
  const revMap = new Map();
  const revSrc = tax === 'ifrs-full' ? [[ifrs, IFRS_REV]] : [[g, REV_TAGS_R12]];
  for (const [t0, tags] of revSrc) for (const t of tags) { const u = t0[t]?.units; if (!u) continue; for (const [unit, arr] of Object.entries(u)) { if (perShare(unit) || /shares/i.test(unit)) continue; for (const r of quarterly(arr)) if (!revMap.has(r[0])) revMap.set(r[0], r); } }
  let cause = null;
  if (!eps) {
    const anyEps = [...EPS_TAGS_R12.map((t) => g[t]), ...IFRS_EPS.map((t) => ifrs[t])].filter(Boolean);
    if (!anyEps.length) cause = Object.keys(ifrs).length && !Object.keys(g).length ? 'IFRS_NO_EPS' : 'NO_EPS_TAG';
    else {
      const all = anyEps.flatMap((x) => Object.values(x.units || {}).flat());
      const q = all.filter((e) => e.start && e.end && (Date.parse(e.end) - Date.parse(e.start)) / 864e5 <= 100).length;
      cause = q ? 'FEW_QUARTERS' : 'ANNUAL_ONLY';
    }
  }
  return { name: cf?.entityName || null, taxonomy: eps ? tax : null, epsTag: eps?.tag || null, epsUnit: eps?.unit || null, eps: eps?.q || [], rev: [...revMap.values()].sort((a, b) => a[0].localeCompare(b[0])), shares: sharesSeries(cf), cause };
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
  const R13 = argv.includes('--r13');
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
  const budget = Guard.createBudget({ classAOperations: 8, classBOperations: 50 });
  const mine = Store.createHistoryStore({ driver, provider: L.SERIES_PROVIDER, market: 'US', budget }); // Runde 14: HOLDOUT eigener Namensraum
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
    // Runde 14 (HOLDOUT): bekannte CIK nur fuer Listings, die heute noch dieselbe Notierung sind (sonst Kuerzel evtl. neu vergeben).
    if (inc) members.push({ l, name: e.name || null, knownCik: L.WINDOW_NAME === 'HOLDOUT' && !l.listEnd ? companyOf.get(l.ticker)?.cik || null : null });
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
    try { const { stdout } = await pexec('unzip', ['-p', cfZip, `CIK${cik}.json`], { maxBuffer: 512 * 1024 * 1024, encoding: 'buffer' }); if (stdout.length) v = extractFactsR12(JSON.parse(stdout.toString('utf8'))); } catch { v = null; }
    cache.set(cik, v); return v;
  };
  const overlaps = (f, l) => { const from = l.startDate, to = l.listEnd || '2026-12-31'; return !!f && [...f.eps, ...f.rev].some((r) => r[0] >= from && r[0] <= to); };
  const causes = { active: {}, delisted: {} }, byStartYear = {};
  const cause = (active, c, l) => { const b = causes[active ? 'active' : 'delisted']; b[c] = (b[c] || 0) + 1; const end = (l.listEnd || '2026').slice(0, 4); const y = byStartYear[end] ||= {}; y[c] = (y[c] || 0) + 1; };

  // 3. Zuordnung
  const cikAll = {};
  const out = {}, stats = { members: members.length, known: 0, nameMatched: 0, ambiguous: 0, noName: 0, noMatch: 0, noFacts: 0, withEps: { active: 0, delisted: 0 }, total: { active: 0, delisted: 0 }, accuracy: { tested: 0, correct: 0, wrong: 0, ambiguousOrNone: 0 } };
  let k = 0;
  for (const m of members) {
    const active = L.WINDOW_NAME === 'HOLDOUT' ? m.l.active : m.l.source === 'STORE_ACTIVE'; // HOLDOUT: ueber 2015 hinaus gelistet
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
      if (!m.name) { stats.noName++; cause(active, 'NO_NAME', m.l); continue; }
      const cands = [...(byName.get(normName(m.name)) || [])];
      if (!cands.length) { stats.noMatch++; cause(active, 'NO_NAME_MATCH', m.l); continue; }
      const ok = []; for (const c of cands.slice(0, 6)) if (overlaps(await facts(c), m.l)) ok.push(c);
      if (ok.length !== 1) { stats[ok.length ? 'ambiguous' : 'noFacts']++; cause(active, ok.length ? 'AMBIGUOUS_NAME' : 'NAME_MATCH_NO_DATA_IN_LISTING_WINDOW', m.l); continue; }
      cik = ok[0]; how = 'NAME_MATCH'; stats.nameMatched++;
    } else stats.known++;
    cikAll[m.l.id] = { cik, active, listEnd: m.l.listEnd || null };
    const f = await facts(cik);
    if (!f) { stats.noFacts++; cause(active, 'CIK_NO_COMPANYFACTS', m.l); continue; }
    if (!f.eps.length) {
      if (R13 && f.shares.length) { out[m.l.id] = { cik, how, epsTag: null, taxonomy: null, eps: [], rev: f.rev, shares: f.shares }; stats.sharesOnly = (stats.sharesOnly || 0) + 1; }
      stats.noFacts++; cause(active, f.cause || 'NO_EPS', m.l); continue;
    }
    if (!f.eps.some((r) => r[0] >= m.l.startDate && r[0] <= (m.l.listEnd || '2026-12-31'))) cause(active, 'EPS_OUTSIDE_LISTING_WINDOW', m.l); else cause(active, 'OK_' + (f.taxonomy || 'us-gaap'), m.l);
    out[m.l.id] = { cik, how, epsTag: f.epsTag, taxonomy: f.taxonomy, eps: f.eps, rev: f.rev, ...(R13 ? { shares: f.shares } : {}) };
    stats.withEps[active ? 'active' : 'delisted']++;
    if (++k % 500 === 0) log(`zugeordnet ${k}`);
  }
  log(`mit EPS: gelistet ${stats.withEps.active}/${stats.total.active}, delistet ${stats.withEps.delisted}/${stats.total.delisted}; Namensabgleich-Pruefung ${stats.accuracy.correct}/${stats.accuracy.tested} richtig, ${stats.accuracy.wrong} falsch`);
  // Runde 13: Delisting-Klassifikation (Uebernahme vs. unbekannt) fuer delistete Notierungen mit CIK.
  const delist = {}, dstats = { delistedWithCik: 0, fetched: 0, failed: 0, ACQUISITION: 0, UNKNOWN: 0 };
  const subCache = new Map();
  const todo = Object.entries(cikAll).filter(([, v]) => !v.active && v.listEnd);
  dstats.delistedWithCik = todo.length;
  for (const [id, v] of todo) {
    let fl = subCache.get(v.cik);
    if (fl === undefined) {
      fl = null;
      try {
        const r = await fetch(`https://data.sec.gov/submissions/CIK${v.cik}.json`, { headers: { 'User-Agent': UA } });
        if (r.ok) { const j = await r.json(); fl = { form: [...(j.filings?.recent?.form || [])], filingDate: [...(j.filings?.recent?.filingDate || [])] };
          // aeltere Seiten nur, wenn die juengste Seite nicht bis zum Delisting zurueckreicht
          const oldest = fl.filingDate[fl.filingDate.length - 1];
          if (oldest && oldest > v.listEnd) for (const f of (j.filings?.files || [])) { const r2 = await fetch(`https://data.sec.gov/submissions/${f.name}`, { headers: { 'User-Agent': UA } }); if (r2.ok) { const j2 = await r2.json(); fl.form.push(...(j2.form || [])); fl.filingDate.push(...(j2.filingDate || [])); } await new Promise((res) => setTimeout(res, 120)); }
          dstats.fetched++; } else dstats.failed++;
      } catch { dstats.failed++; }
      subCache.set(v.cik, fl);
      await new Promise((res) => setTimeout(res, 120));
    }
    if (!fl) continue;
    const c = classifyDelisting(fl, v.listEnd);
    delist[id] = { cik: v.cik, listEnd: v.listEnd, cls: c.cls, evidence: c.evidence };
    dstats[c.cls]++;
    if ((dstats.ACQUISITION + dstats.UNKNOWN) % 500 === 0) log(`Delisting klassifiziert ${dstats.ACQUISITION + dstats.UNKNOWN}`);
  }
  log(`Delistings: mit CIK ${dstats.delistedWithCik}, Uebernahme ${dstats.ACQUISITION}, unbekannt ${dstats.UNKNOWN}, Abruf fehlgeschlagen ${dstats.failed}`);
  budget.consumeClassA(1, 'PUT sec delist');
  if (!R13) await driver.put(mine.seriesPrefix + DELIST_KEY, zlib.gzipSync(Buffer.from(JSON.stringify(delist))), { contentType: 'application/gzip' });
  budget.consumeClassA(1, 'PUT sec pit');
  await driver.put(mine.seriesPrefix + (R13 ? PIT_KEY_R13 : PIT_KEY_R12), zlib.gzipSync(Buffer.from(JSON.stringify(out))), { contentType: 'application/gzip' });
  log('Gewinnhistorie im privaten Eimer abgelegt');
  const byYear = {};
  for (const v of Object.values(out)) for (const r of v.eps) { const y = r[2].slice(0, 4); byYear[y] = (byYear[y] || 0) + 1; }
  const pem = fs.readFileSync(path.join(root, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  if (R13) { const sh = Object.values(out).filter((v) => v.shares?.length); stats.withShares = sh.length; stats.sharesSource = sh.reduce((a, v) => ((a[v.shares[0][3]] = (a[v.shares[0][3]] || 0) + 1), a), {}); log(`mit Aktienanzahl: ${sh.length}`); }
  fs.writeFileSync(path.join(OUT, R13 ? 'sec-pit-r13.sealed.json' : `sec-pit-r12${L.WINDOW_NAME === 'HOLDOUT' ? '-holdout' : ''}.sealed.json`), L.encryptForOwner(pem, Buffer.from(JSON.stringify({ schema: 'supertrader-sec-pit-1.2.0', r13: R13, delisting: dstats, delistSample: Object.entries(delist).filter(([, v]) => v.cls === 'ACQUISITION').slice(0, 40), causes, byListEndYear: byStartYear, at: new Date().toISOString(), commit: process.env.GITHUB_SHA || null, stats, epsFilingsByYear: byYear }))));
  if (R13) { const sp = path.join(root, 'scripts/supertrader/house/session-public-key.pem'); if (fs.existsSync(sp)) fs.writeFileSync(path.join(OUT, 'sec-pit-r13.session.sealed.json'), fs.readFileSync(path.join(OUT, 'sec-pit-r13.sealed.json'), 'utf8') && L.encryptForOwner(fs.readFileSync(sp, 'utf8'), Buffer.from(JSON.stringify({ r13: true, causes, stats, at: new Date().toISOString() })))); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
