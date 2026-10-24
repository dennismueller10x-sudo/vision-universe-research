// FUNDAMENTAL – Auslieferungsansicht der SEC-Historie (nur Release, nie committet).
//
// Die SEC-Verbraucherdateien (quant/data/sec/consumer/CIK*.json, Erzeuger
// scripts/quant/cli.py consumer) bleiben im Repository und werden nicht
// ausgeliefert (scripts/vu2/build-release.mjs#permitted). Fundamental braucht
// aus ihnen die vollen Jahresreihen aller Kennzahlen, die eigenstaendigen
// Quartale und die letzten zwoelf Monate - unveraendert, mit Herkunft je Wert.
//
// Diese Projektion rechnet nichts: sie waehlt Felder aus, prueft jede Zeile
// wie quant/api/fundamentals-contract.js#validateQuarterlyFacts (Datum,
// Meldung, Einheit, Reihenfolge) und legt die Meldungen einmal je Emittent ab.
// Zuordnung Kuerzel -> CIK nur ueber die Discover-Aktiendatei (fundamentals.cik),
// dieselbe Quelle, die die Seite liest; Scherben ueber core/identity.js#shardKey.
//
// Aufruf: node scripts/fundamental/build-history.mjs [--root=.] --out=<dir>
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Identity = require('../../core/identity.js');
const Catalog = require('../../fundamental/engine/catalog.js');
import { sectorFromSic } from '../screener/sic.mjs';

export const SCHEMA = 'vu-fundamental-history-1.0.0';
export const SHARD_SCHEMA = 'vu-fundamental-history-shard-1.0.0';
export const HISTORY_DIR = 'fundamental/data/history/';
/* Eigenes Budget, getrennt vom SEC-Auslieferungsbudget der Quant-Projektionen. */
export const SHARD_BUDGET = 256 * 1024, TOTAL_BUDGET = 40 * 1024 * 1024;
export const INDUSTRY_SCHEMA = Catalog.INDUSTRY_SCHEMA, INDUSTRY_DIR = 'industry/';
/* Branchenmedian je Geschaeftsjahr nur fuer Quoten, Renditen, Wachstum und Bewertungsverhaeltnisse (keine Betraege:
 * deren Median sagt nichts und mischt Waehrungen). Bewertung nur aus der geprueften Bewertung zum GJ-Ende. */
export const INDUSTRY_METRICS = Catalog.INDUSTRY_METRICS;
/* Ein Median braucht mindestens so viele Unternehmen mit Wert im selben Geschaeftsjahr. */
export const INDUSTRY_MIN = 5;
const LONG_PATH = /^\/quant\/data\/market\/discover-series-long\/ref_[A-Z0-9_]{1,24}\.json$/;
const COLUMNS = ['fy', 'fp', 'end', 'v', 'filed', 'accn', 'derived'];

const isDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d));
const isUnit = (u) => typeof u === 'string' && (/^[A-Z]{3}(?:\/shares)?$/.test(u) || u === 'shares');
const isAccn = (a) => typeof a === 'string' && /^\d{10}-\d{2}-\d{6}$/.test(a);

/* Eine Reihe pruefen; jede ungueltige Zeile verwirft die ganze Kennzahl (kein stilles Auslassen). */
function checkRows(rows, { asOf, quarterly }) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const seen = new Set(), out = [];
  for (const r of rows) {
    if (!Array.isArray(r) || r.length !== 7) return null;
    const [fy, fp, end, v, filed, accn, derived] = r, key = fy + '-' + fp;
    if (!Number.isInteger(fy) || seen.has(key)) return null;
    if (quarterly ? !/^Q[1-4]$/.test(fp) : fp !== 'FY') return null;
    if (!Number.isFinite(v) || !isDate(end) || !isDate(filed) || end > filed || filed > asOf || !isAccn(accn) || ![0, 1].includes(derived)) return null;
    seen.add(key); out.push(r);
  }
  return out.sort((a, b) => a[0] - b[0] || String(a[1]).localeCompare(String(b[1])));
}

/** Eine Verbraucherdatei -> kompakte Historie oder null (ungueltige Herkunft). */
export function projectHistory(source, ticker) {
  if (source?.schema !== 'vu-consumer-fundamentals-1.0.0' || source.dataSource?.isMock !== false || source.dataSource?.provider !== 'sec_edgar'
    || source.policy !== 'as_of_latest' || !/^\d{10}$/.test(source.cik || '') || !isDate(source.asOf) || JSON.stringify(source.columns) !== JSON.stringify(COLUMNS)) return null;
  const filings = [], index = new Map();
  const ref = (accn, filed) => { const k = accn + '|' + filed; if (!index.has(k)) { index.set(k, filings.length); filings.push([accn, filed]); } return index.get(k); };
  const units = {}, annual = {}, quarterly = {}, ttm = {}, unavailable = {};
  const unitOf = (m) => (isUnit(source.units?.[m]) ? source.units[m] : null);
  for (const [period, target, quarterlyRows] of [['annual', annual, false], ['quarterly', quarterly, true]]) {
    for (const [metric, rows] of Object.entries(source[period] || {})) {
      if (!/^[a-z_]{2,40}$/.test(metric)) continue;
      const unit = unitOf(metric), checked = unit ? checkRows(rows, { asOf: source.asOf, quarterly: quarterlyRows }) : null;
      if (!checked) { unavailable[period + ':' + metric] = unit ? 'INVALID_FACT_EVIDENCE' : 'INVALID_UNIT'; continue; }
      units[metric] = unit;
      // Jahr: [fy, end, v, Meldung, abgeleitet]; Quartal: [fy, Quartal 1-4, end, v, Meldung, abgeleitet]
      target[metric] = checked.map(([fy, fp, end, v, filed, accn, derived]) => quarterlyRows
        ? [fy, Number(fp.slice(1)), end, v, ref(accn, filed), derived]
        : [fy, end, v, ref(accn, filed), derived]);
    }
  }
  for (const [metric, t] of Object.entries(source.ttm || {})) {
    const unit = unitOf(metric);
    if (!unit || !t || !Number.isFinite(t.v) || !isDate(t.end) || t.end > source.asOf || !['TTM', 'INSTANT'].includes(t.kind)) continue;
    units[metric] = unit;
    ttm[metric] = [t.v, t.end, typeof t.through === 'string' ? t.through : null, t.kind];
  }
  if (!Object.keys(annual).length && !Object.keys(quarterly).length) return null;
  return {
    schema: SCHEMA, ticker, cik: source.cik, name: source.name || null, asOf: source.asOf, generatedAtUtc: source.generatedAtUtc || null,
    versions: source.versions || null, calendar: source.calendar || null, semantics: source.semantics || null,
    units, filings, annual, quarterly, ttm, unavailable
  };
}

/** Alle Scherben aus dem Repository: { shards: {key: payload}, stats }. */
export async function buildHistory({ root }) {
  root = resolve(root);
  const stockDir = join(root, 'discover/data/stocks/US_REAL'), consumerDir = join(root, 'quant/data/sec/consumer');
  if (!existsSync(consumerDir)) throw Error('CONSUMER_SOURCE_MISSING');
  const shards = {}, stats = { stocks: 0, projected: 0, noFundamentals: 0, noSource: 0, invalid: 0 };
  const sic = await sicByTicker(root), members = [];
  const names = (await readdir(stockDir)).filter((n) => /^[A-Z0-9.-]+\.json$/.test(n)).sort();
  for (const name of names) {
    stats.stocks++;
    let doc; try { doc = JSON.parse(await readFile(join(stockDir, name), 'utf8')); } catch { stats.invalid++; continue; }
    const ticker = doc?.symbol, f = doc?.fundamentals;
    if (!ticker || ticker + '.json' !== name || doc.dataMode !== 'real') { stats.invalid++; continue; }
    if (!f || f.available !== true || !/^\d{10}$/.test(f.cik || '')) { stats.noFundamentals++; continue; }
    const path = join(consumerDir, 'CIK' + f.cik + '.json');
    if (!existsSync(path)) { stats.noSource++; continue; }
    const projected = projectHistory(JSON.parse(await readFile(path, 'utf8')), ticker);
    if (!projected || projected.cik !== f.cik) { stats.invalid++; continue; }
    const key = Identity.shardKey(ticker);
    if (!/^[A-Z0-9_]{1,2}$/.test(key)) { stats.invalid++; continue; }
    (shards[key] ||= { schema: SHARD_SCHEMA, shard: key, issuers: {} }).issuers[ticker] = projected;
    stats.projected++;
    const sic4 = sic.get(ticker);
    if (sic4) members.push({ ticker, sic2: sic4.slice(0, 2), sector: sectorFromSic(sic4), values: await issuerValues(root, projected, doc) });
  }
  return { shards, stats, industry: industryMedians(members) };
}

/* SIC-Code je Kuerzel aus derselben Quelle wie das Screener-Universum (quant/data/product/sic-peer-taxonomy-v1.json). */
async function sicByTicker(root) {
  const out = new Map(), path = join(root, 'quant/data/product/sic-peer-taxonomy-v1.json');
  if (!existsSync(path)) return out;
  const tax = JSON.parse(await readFile(path, 'utf8')), c = tax.rowColumns || [];
  const t = c.indexOf('ticker'), s = c.indexOf('sic4');
  for (const r of tax.rows || []) if (r[t] && /^\d{3,4}$/.test(String(r[s] ?? ''))) out.set(r[t], String(r[s]).padStart(4, '0'));
  return out;
}

/** Jahreswerte eines Emittenten fuer den Branchenmedian: dieselbe Rechnung wie auf der Seite (fundamental/engine/catalog.js). */
export async function issuerValues(root, projected, stock) {
  const book = Catalog.fromHistory(projected, stock);
  if (!book) return {};
  const lp = stock?.series?.long?.path;
  if (LONG_PATH.test(lp || '') && existsSync(join(root, lp))) {
    try { Catalog.attachValuation(book, JSON.parse(await readFile(join(root, lp), 'utf8'))); } catch { /* ohne Kursreihe keine Bewertung */ }
  }
  const out = {};
  for (const id of INDUSTRY_METRICS) {
    const rows = Catalog.seriesOf(book, Catalog.BY_ID[id], 'annual').filter((r) => Number.isFinite(r.v));
    if (rows.length) out[id] = rows.map((r) => [r.fy, r.v]);
  }
  return out;
}

function median(v) { const s = v.slice().sort((a, b) => a - b), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }
const round = (v) => Number(v.toPrecision(5));
/** Median je Gruppe (SIC-Hauptgruppe, Sektor), Kennzahl und Geschaeftsjahr: [GJ, Median, Anzahl, Unternehmen der Gruppe]. */
export function industryMedians(members) {
  const groups = {};
  for (const m of members) for (const key of [m.sic2 && 'sic-' + m.sic2, m.sector && 'sec-' + m.sector]) if (key) (groups[key] ||= []).push(m);
  const out = {};
  for (const [key, list] of Object.entries(groups)) {
    const metrics = {};
    for (const id of INDUSTRY_METRICS) {
      const byFy = {};
      for (const m of list) for (const [fy, v] of m.values[id] || []) (byFy[fy] ||= []).push(v);
      const rows = Object.keys(byFy).map(Number).sort((a, b) => a - b).filter((fy) => byFy[fy].length >= INDUSTRY_MIN).map((fy) => [fy, round(median(byFy[fy])), byFy[fy].length]);
      if (rows.length) metrics[id] = rows;
    }
    out[key] = { schema: INDUSTRY_SCHEMA, group: key, members: list.length, min: INDUSTRY_MIN, metrics };
  }
  return out;
}

/** Schreibt die Scherben als .json.gz nach out; Budget je Scherbe und gesamt. */
export async function writeHistory({ root, out, log = console.log }) {
  const { shards, stats, industry } = await buildHistory({ root });
  await mkdir(out, { recursive: true });
  let bytes = 0;
  for (const [key, payload] of Object.entries(shards)) {
    const gz = gzipSync(Buffer.from(JSON.stringify(payload)), { level: 9 });
    if (gz.length > SHARD_BUDGET) throw Error('FUNDAMENTAL_HISTORY_SHARD_BUDGET_EXCEEDED:' + key);
    bytes += gz.length;
    if (bytes > TOTAL_BUDGET) throw Error('FUNDAMENTAL_HISTORY_BUDGET_EXCEEDED');
    await writeFile(join(out, key + '.json.gz'), gz);
  }
  await mkdir(join(out, INDUSTRY_DIR), { recursive: true });
  for (const [key, payload] of Object.entries(industry)) {
    const json = JSON.stringify(payload);
    if (json.length > SHARD_BUDGET) throw Error('FUNDAMENTAL_INDUSTRY_BUDGET_EXCEEDED:' + key);
    bytes += json.length;
    await writeFile(join(out, INDUSTRY_DIR, key + '.json'), json);
  }
  if (bytes > TOTAL_BUDGET) throw Error('FUNDAMENTAL_HISTORY_BUDGET_EXCEEDED');
  const report = { schema: SCHEMA, state: 'AVAILABLE', shards: Object.keys(shards).length, industryGroups: Object.keys(industry).length, bytes, ...stats };
  await writeFile(join(out, 'status.json'), JSON.stringify(report));
  log(JSON.stringify(report));
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k) => (process.argv.find((a) => a.startsWith('--' + k + '=')) || '').split('=').slice(1).join('=');
  const out = arg('out');
  if (!out) { console.error('--out=<Verzeichnis> fehlt (das Ergebnis gehoert nie ins Repository)'); process.exit(2); }
  await writeHistory({ root: arg('root') || '.', out: resolve(out) });
}
