#!/usr/bin/env node
/**
 * SEC/EDGAR corporate-action collector (corporate-action-contract-2.0.0). Event-first, not price-first:
 * the candidate filings come from EDGAR full-text search, never from price jumps or from the known V4 cases.
 *
 *   1. EFTS (efts.sec.gov/LATEST/search-index) month by month 2001..today for split language in current reports
 *      (8-K, 8-K/A, 6-K, 6-K/A): "stock split", "reverse split", "share consolidation", "share split",
 *      "split-adjusted". Hit metadata only (CIK, form, items, filing date, accession, file name).
 *   2. Keep hits whose CIK is in --ciks (the universe), group by accession, fetch each document of the filing
 *      (main document and EX-99 press releases), join the text and extract events with
 *      quant/engines/sec-corporate-actions.js#filingEvents.
 *   3. Per CIK: proxy hits (DEF 14A/PRE 14A/DEF 14C/PRE 14C, "reverse stock split") as ANNOUNCED context
 *      (metadata only), and periodic reports (10-Q/10-K/20-F) for retrospective statements, only for CIKs
 *      listed in --periodic-ciks.
 *   4. mergeEvents per CIK -> {cik: [events]} with stageVisibleAt (PIT).
 *
 * SEC fair access: declared User-Agent, <= 8 requests/s. Public SEC data (public domain, 17 CFR 200.80).
 *
 * Periodic reports are read only for issuers with a held price discontinuity or a >= 10x move (candidate-driven, so
 * absence of evidence there is not evidence of absence); their statements never normalize on their own
 * (corporate-action-validation.js requires a dated current report).
 *
 * Usage: node sec-collect.mjs --ciks ciks.json --out events.json [--periodic-ciks p.json] [--from 2001-01] [--to 2026-10]
 *        [--max-docs N] [--cache DIR]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SEC = require(path.join(ROOT, 'quant/engines/sec-corporate-actions.js'));
const UA = process.env.SEC_USER_AGENT || 'VisionUniverse research info@visionuniverse.de';
const args = (() => { const o = {}, a = process.argv.slice(2); for (let i = 0; i < a.length; i += 2) o[a[i].replace(/^--/, '')] = a[i + 1]; return o; })();
const CURRENT_FORMS = '8-K,6-K'; /* EFTS: "/A" in a forms list empties the result; amendments are matched by root form */
const PROXY_FORMS = 'DEF 14A,PRE 14A,DEF 14C,PRE 14C';
const PERIODIC_FORMS = '10-Q,10-K,20-F,10-KSB,10-QSB';
const PHRASES = ['"stock split"', '"reverse split"', '"share consolidation"', '"share split"', '"split-adjusted"'];
export const COLLECTOR_VERSION = 'sec-corporate-action-collector-1.0.0';

const stats = { requests: 0, errors: 0, retries: 0, eftsQueries: 0, eftsHits: 0, universeHits: 0, filings: 0, documents: 0, documentErrors: 0, truncatedWindows: 0,
  proxyHits: 0, periodicFilings: 0, incompleteWindows: [], documentsSkippedByCap: 0 };
let last = 0;
/* <= 8.7 requests/s by default; parallel collection jobs set SEC_MIN_INTERVAL_MS so that together they stay under the SEC fair-access limit of 10/s */
const MIN_INTERVAL = Number(process.env.SEC_MIN_INTERVAL_MS || 115);
async function throttle() { const wait = Math.max(0, last + MIN_INTERVAL - Date.now()); if (wait) await new Promise((r) => setTimeout(r, wait)); last = Date.now(); }
async function get(url, { json = false } = {}) {
  for (let a = 0; a < 5; a++) {
    await throttle(); stats.requests++;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate' } });
      if (res.status === 404) return null;
      /* SEC antwortet auf zu viele Anfragen mit 403 (nicht 429): wie 429 mit Pause wiederholen (Review F13) */
      if (res.status === 403 || res.status === 429 || res.status >= 500) { stats.retries++; await new Promise((r) => setTimeout(r, 5000 * (a + 1))); continue; }
      if (!res.ok) { stats.errors++; return null; }
      return json ? await res.json() : await res.text();
    } catch { stats.retries++; await new Promise((r) => setTimeout(r, 1500 * (a + 1))); }
  }
  stats.errors++; return null;
}
const efts = (p) => get('https://efts.sec.gov/LATEST/search-index?' + new URLSearchParams(p).toString(), { json: true });

function months(from, to) {
  const out = []; let [y, m] = from.split('-').map(Number); const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) { out.push([y, m]); m++; if (m > 12) { m = 1; y++; } }
  return out;
}
const pad = (n) => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** All hits of one query in [start, end]; splits the window when EFTS caps at 10,000. */
async function allHits(q, forms, start, end, extra = {}) {
  const out = [];
  for (let from = 0; from < 10000; from += 100) {
    const d = await efts({ q, forms, dateRange: 'custom', startdt: start, enddt: end, from: String(from), ...extra });
    stats.eftsQueries++;
    if (!d || !d.hits) { stats.incompleteWindows.push(`${q}|${forms}|${start}|${from}`); break; }
    const hits = d.hits.hits || [];
    out.push(...hits);
    const total = d.hits.total?.value ?? 0;
    if (from === 0 && total >= 10000 && start !== end) {
      const mid = new Date((Date.parse(start) + Date.parse(end)) / 2).toISOString().slice(0, 10);
      stats.truncatedWindows++;
      return [...await allHits(q, forms, start, mid, extra), ...await allHits(q, forms, new Date(Date.parse(mid) + 864e5).toISOString().slice(0, 10), end, extra)];
    }
    if (hits.length < 100 || from + 100 >= total) break;
  }
  stats.eftsHits += out.length;
  return out;
}

function docUrl(cik, adsh, file) { return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${adsh.replace(/-/g, '')}/${file}`; }

async function main() {
  const ciks = new Map(Object.entries(JSON.parse(fs.readFileSync(args.ciks, 'utf8')))); // cik(10) -> {tickers:[...], windows:[[from,to]]}
  /* cik -> candidate dates; per date at most two periodic reports filed within 200 days after it, at most eight per CIK */
  const periodic = new Map(Object.entries(args['periodic-ciks'] ? JSON.parse(fs.readFileSync(args['periodic-ciks'], 'utf8')) : {}));
  const from = args.from || '2001-01', to = args.to || new Date().toISOString().slice(0, 7);
  const maxDocs = Number(args['max-docs'] || 90000);
  /* --phases current,proxies,periodic (default all); --raw-out writes unmerged per-filing events (one part of a split
     collection); --merge-raw a.json,b.json loads such parts before merging (parallel collection jobs, same rules) */
  const phases = new Set(String(args.phases || 'current,proxies,periodic').split(','));
  const inWindow = (cik, d) => { const c = ciks.get(cik); return !!c && c.windows.some(([a, b]) => d >= addDays(a, -400) && d <= (b ? addDays(b, 30) : '9999-12-31')); };
  /* 1. current reports, event-first */
  const filings = new Map(); // adsh -> {cik, form, items, filedDate, files:Set}
  for (const [y, m] of phases.has('current') ? months(from, to) : []) {
    const s = `${y}-${pad(m)}-01`, e = `${y}-${pad(m)}-${pad(lastDay(y, m))}`;
    for (const q of PHRASES) {
      for (const h of await allHits(q, CURRENT_FORMS, s, e)) {
        const src = h._source || {}, adsh = src.adsh, file = String(h._id || '').split(':')[1];
        const cik = (src.ciks || []).map((c) => String(c).padStart(10, '0')).find((c) => ciks.has(c));
        if (!adsh || !file || !cik || !inWindow(cik, src.file_date)) continue;
        stats.universeHits++;
        const f = filings.get(adsh) || { cik, form: src.form, rootForm: (src.root_forms || [])[0] || src.form, items: src.items || [], filedDate: src.file_date, files: new Set() };
        f.files.add(file); filings.set(adsh, f);
      }
    }
    if (m === 12) console.log(`[sec] ${y}: filings ${filings.size}, requests ${stats.requests}`);
  }
  stats.filings = filings.size;
  /* 2. documents -> events */
  const perCik = new Map(); let docs = 0;
  const add = (cik, evs) => { const l = perCik.get(cik) || []; l.push(...evs); perCik.set(cik, l); };
  const proxies = new Map();
  for (const f of String(args['merge-raw'] || '').split(',').filter(Boolean)) {
    const part = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const [cik, evs] of Object.entries(part.perCik || {})) add(cik, evs);
    for (const [cik, px] of Object.entries(part.proxies || {})) { const l = proxies.get(cik) || new Map(); px.forEach((x) => l.set(x.accession, x)); proxies.set(cik, l); }
    for (const [k, v] of Object.entries(part.stats || {})) {
      if (k === 'incompleteWindows') stats.incompleteWindows.push(...v);
      else if (typeof v === 'number') stats[k] = (stats[k] || 0) + v;
    }
    stats.parts = (stats.parts || []).concat([{ file: path.basename(f), from: part.from, to: part.to, phases: part.phases }]);
  }
  /* up to four filings in flight; the shared throttle keeps the request rate under the SEC limit */
  const queue = [...filings.entries()].sort((a, b) => a[1].filedDate.localeCompare(b[1].filedDate) || a[0].localeCompare(b[0]));
  let next = 0;
  const worker = async () => {
    while (next < queue.length) {
      const [adsh, f] = queue[next++];
      if (docs >= maxDocs) { stats.documentsSkippedByCap++; continue; }
      let text = '';
      for (const file of [...f.files].sort()) {
        if (!/\.(htm|html|txt)$/i.test(file)) continue;
        docs++;
        const raw = await get(docUrl(f.cik, adsh, file)); stats.documents++;
        if (raw === null) { stats.documentErrors++; continue; }
        text += ' ' + SEC.textOf(raw);
      }
      if (!text.trim()) continue;
      const tickers = ciks.get(f.cik).tickers || [];
      const evs = SEC.filingEvents(text, { form: f.form, items: f.items, accession: adsh, cik: f.cik, filedDate: f.filedDate, ticker: tickers[0] || null });
      if (tickers.length > 1) evs.forEach((e) => { e.tickerMentioned = tickers.some((t) => { const p = SEC.tickerPattern(t); return !!p && p.test(text); }); });
      add(f.cik, evs);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  /* 3a. proxies: ANNOUNCED context, metadata only (no ratio) */
  for (const [y, m] of phases.has('proxies') ? months(from, to) : []) {
    const s = `${y}-${pad(m)}-01`, e = `${y}-${pad(m)}-${pad(lastDay(y, m))}`;
    for (const h of await allHits('"reverse stock split"', PROXY_FORMS, s, e)) {
      const src = h._source || {}, cik = (src.ciks || []).map((c) => String(c).padStart(10, '0')).find((c) => ciks.has(c));
      if (!cik || !inWindow(cik, src.file_date) || !src.adsh) continue;
      stats.proxyHits++;
      const l = proxies.get(cik) || new Map(); l.set(src.adsh, { form: src.form, filedDate: src.file_date, accession: src.adsh }); proxies.set(cik, l);
    }
  }
  /* 3b. periodic reports for listed CIKs (retrospective statements with dates) */
  for (const [cik, dates] of phases.has('periodic') ? periodic : new Map()) {
    if (!ciks.has(cik) || !Array.isArray(dates) || !dates.length) continue;
    const ds = dates.filter((d) => d >= '2001-01-01').sort();
    if (!ds.length) continue;
    const hits = await allHits('"split"', PERIODIC_FORMS, ds[0], addDays(ds[ds.length - 1], 200), { ciks: cik });
    const byAdsh = new Map();
    for (const h of hits) {
      const src = h._source || {}, file = String(h._id || '').split(':')[1];
      if (!src.adsh || !file) continue;
      const f = byAdsh.get(src.adsh) || { form: src.form, filedDate: src.file_date, files: new Set() };
      f.files.add(file); byAdsh.set(src.adsh, f);
    }
    const chosen = new Map();
    for (const d of ds) {
      const after = [...byAdsh.entries()].filter(([, f]) => f.filedDate > d && f.filedDate <= addDays(d, 200)).sort((a, b) => a[1].filedDate.localeCompare(b[1].filedDate)).slice(0, 2);
      for (const [a, f] of after) if (chosen.size < 8) chosen.set(a, f);
    }
    for (const [adsh, f] of chosen) {
      const main = [...f.files].find((x) => !/ex-?\d/i.test(x)) || [...f.files][0];
      const raw = await get(docUrl(cik, adsh, main)); stats.documents++; stats.periodicFilings++;
      if (raw === null) { stats.documentErrors++; continue; }
      add(cik, SEC.filingEvents(SEC.textOf(raw), { form: f.form, accession: adsh, cik, filedDate: f.filedDate, ticker: (ciks.get(cik).tickers || [])[0] || null }));
    }
  }
  if (args['raw-out']) {
    fs.mkdirSync(path.dirname(args['raw-out']), { recursive: true });
    fs.writeFileSync(args['raw-out'], JSON.stringify({ schema: 'sec-corporate-action-raw-part-1.0.0', collector: COLLECTOR_VERSION, extractor: SEC.VERSION, from, to, phases: [...phases], stats,
      perCik: Object.fromEntries(perCik), proxies: Object.fromEntries([...proxies.entries()].map(([c, m]) => [c, [...m.values()]])) }));
    console.log('[sec] raw part', JSON.stringify(stats));
    return;
  }
  const out = {};
  for (const cik of new Set([...perCik.keys(), ...proxies.keys()])) {
    /* deterministic input order regardless of fetch completion order */
    const list = (perCik.get(cik) || []).slice().sort((x, y) => String(x.visibleAt).localeCompare(String(y.visibleAt)) || String(x.source?.accession).localeCompare(String(y.source?.accession)) || (x.ratio || 0) - (y.ratio || 0));
    const merged = SEC.mergeEvents(list);
    const prox = [...(proxies.get(cik) || new Map()).values()].sort((a, b) => a.filedDate.localeCompare(b.filedDate));
    out[cik] = { events: merged, proxies: prox };
  }
  /* Vollstaendigkeit: jede fehlende Suchseite, jedes nicht lesbare Dokument und jede Kappung wird ausgewiesen;
     die Bereitschaft verlangt complete = true. */
  stats.complete = stats.incompleteWindows.length === 0 && stats.documentErrors === 0 && stats.documentsSkippedByCap === 0 && stats.errors === 0;
  const body = { schema: 'sec-corporate-action-events-1.0.0', collector: COLLECTOR_VERSION, extractor: SEC.VERSION, from, to, phrases: PHRASES, currentForms: CURRENT_FORMS,
    proxyForms: PROXY_FORMS, periodicForms: PERIODIC_FORMS, userAgentDeclared: true, stats, ciks: out };
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(body));
  console.log('[sec] done', JSON.stringify(stats), 'ciks with events', Object.keys(out).length, 'sha', crypto.createHash('sha256').update(JSON.stringify(out)).digest('hex').slice(0, 16));
}
function addDays(d, n) { return new Date(Date.parse(String(d).slice(0, 10) + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10); }

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
