#!/usr/bin/env node
// Strang M5 (08.11.2026): Konzern-Kennzahlen deutscher Emittenten aus ihren ESEF-Jahresfinanzberichten.
// Quelle je Emittent: das ESEF-Paket (ZIP) von der eigenen Website des Emittenten, gelistet mit URL und
// SHA-256 in scripts/official-filings/de-esef-sources.json. Übernommen werden nur drei Fakten
// (Umsatz, Konzernergebnis, operativer Cashflow) des Konzerns; keine Dokumente, keine Texte.
// Pakete bleiben im temporären Verzeichnis des Laufs und werden nie committet.
// Leser: scripts/marketstack/europe-fundamentals-mapping.mjs#packageContexts (unverändert, ohne Abhängigkeiten).
// Identität nur über den veröffentlichten Katalog (securityId aus discover/data/europe/catalog.json, LEI-Bindung).
// Aufruf: node scripts/official-filings/de-esef-facts.mjs [--root=.] [--out=discover/data/europe-esef] [--sources=...]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageContexts } from '../marketstack/europe-fundamentals-mapping.mjs';

export const SCHEMA = 'vu-europe-esef-facts-1';
const IFRS = /^\{https?:\/\/xbrl\.ifrs\.org\/taxonomy\/\d{4}-\d{2}-\d{2}\/ifrs-full\}/;
/** Je Kennzahl die IFRS-Konzepte in Vorrangreihenfolge. Banken und Versicherer melden keinen „Revenue“: dann fehlt der Umsatz. */
export const CONCEPTS = {
  revenue: ['Revenue', 'RevenueFromContractsWithCustomers'],
  netIncome: ['ProfitLoss'],
  operatingCashFlow: ['CashFlowsFromUsedInOperatingActivities'],
};
/** Plausibilität: Geschäftsjahr 350–380 Tage, Vorjahr im selben Paket, Veränderung zum Vorjahr zwischen ×0,25 und ×4
 *  (beim Ergebnis und Cashflow nur bei gleichem Vorzeichen geprüft), Umsatz positiv, keine widersprüchlichen Werte. */
export const RULE = { minDays: 350, maxDays: 380, minRatio: 0.25, maxRatio: 4 };

const sha = (b) => createHash('sha256').update(b).digest('hex');
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;

/** Einträge eines ZIP (zentrales Verzeichnis), ohne Dateisystem. */
function zipEntries(b) {
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return null;
  const n = b.readUInt16LE(eocd + 10); let off = b.readUInt32LE(eocd + 16); const out = [];
  for (let i = 0; i < n; i++) {
    if (b.readUInt32LE(off) !== 0x02014b50) return null;
    const method = b.readUInt16LE(off + 10), csize = b.readUInt32LE(off + 20), size = b.readUInt32LE(off + 24), nl = b.readUInt16LE(off + 28), el = b.readUInt16LE(off + 30), cl = b.readUInt16LE(off + 32), local = b.readUInt32LE(off + 42);
    const name = b.subarray(off + 46, off + 46 + nl).toString('utf8'); off += 46 + nl + el + cl;
    out.push({ name, method, csize, size, read() { const start = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28), d = b.subarray(start, start + csize);
      const x = method === 0 ? d : method === 8 ? inflateRawSync(d, { maxOutputLength: 128 * 1024 * 1024 }) : null; if (!x || x.length !== size) throw Error('ZIP_ENTRY'); return x; } });
  }
  return out;
}
/** Ein ZIP mit genau einem Eintrag (gespeichert, unkomprimiert) für den unveränderten Leser. */
function singleEntryZip(name, data) {
  const nm = Buffer.from(name);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nm.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nm.length, 28);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length + nm.length, 12); end.writeUInt32LE(local.length + nm.length + data.length, 16);
  return Buffer.concat([local, nm, data, central, nm, end]);
}
/** Paket vorbereiten: verschachteltes Paket (ein einziges .xbri/.zip darin) auspacken; bei mehreren Berichten nur den
 *  in der Quellenliste benannten (reportFile) an den Leser geben. Inhalte werden nicht verändert. */
export function preparePackage(bytes, reportFile = null, depth = 0) {
  const entries = zipEntries(bytes); if (!entries) return bytes;
  const files = entries.filter((e) => !e.name.endsWith('/'));
  const inner = files.filter((e) => /\.(xbri|zip)$/i.test(e.name));
  if (depth < 2 && files.length === 1 && inner.length === 1) return preparePackage(inner[0].read(), reportFile, depth + 1);
  const reports = files.filter((e) => /(^|\/)reports\/[^/]+\.xhtml$/.test(e.name));
  if (reports.length > 1 && reportFile) { const pick = reports.filter((e) => e.name === reportFile || e.name.endsWith('/' + reportFile)); if (pick.length === 1) return singleEntryZip(pick[0].name, pick[0].read()); }
  return bytes;
}

/** Fakten eines Pakets für eine LEI und ein Geschäftsjahresende; ergibt je Kennzahl Wert und Vorjahr oder einen Grund. */
export function extractFacts(rawBytes, { lei, fiscalYearEnd }) {
  const parsed = packageContexts(rawBytes);
  if (!parsed) return { status: 'PACKAGE_UNSUPPORTED', metrics: [], held: [{ metric: '*', reason: 'PACKAGE_UNSUPPORTED' }] };
  const { contexts, rawFacts } = parsed, metrics = [], held = [];
  for (const [metric, names] of Object.entries(CONCEPTS)) {
    let found = null;
    for (const name of names) {
      const facts = rawFacts.filter((f) => IFRS.test(f.concept) && f.concept.endsWith('}' + name) && /^[A-Z]{3}$/.test(f.unit));
      const at = (end) => {
        const vals = facts.filter((f) => { const c = contexts.get(f.contextId); return c && c.kind === 'duration' && c.lei === lei && c.end === end && days(c.start, c.end) >= RULE.minDays - 1 && days(c.start, c.end) <= RULE.maxDays; });
        const distinct = [...new Set(vals.map((v) => v.value + ' ' + v.unit))];
        if (!vals.length) return null;
        if (distinct.length > 1) return { conflict: true };
        const c = contexts.get(vals[0].contextId);
        return { value: vals[0].value, currency: vals[0].unit, start: c.start, end: c.end };
      };
      const cur = at(fiscalYearEnd);
      if (!cur) continue;
      if (cur.conflict) { found = { reason: 'CONFLICTING_VALUES' }; break; }
      const priorEnd = [...new Set(facts.map((f) => contexts.get(f.contextId)).filter((c) => c && c.kind === 'duration' && c.lei === lei && c.end < fiscalYearEnd && Math.abs(days(c.end, fiscalYearEnd) - 365) <= 15).map((c) => c.end))];
      const prior = priorEnd.length === 1 ? at(priorEnd[0]) : null;
      found = { concept: name, cur, prior: prior && !prior.conflict && prior.currency === cur.currency ? prior : null };
      break;
    }
    if (!found) { held.push({ metric, reason: 'NOT_REPORTED' }); continue; }
    if (found.reason) { held.push({ metric, reason: found.reason }); continue; }
    const { cur, prior, concept } = found;
    if (!prior) { held.push({ metric, reason: 'NO_PRIOR_YEAR_IN_PACKAGE' }); continue; }
    if (metric === 'revenue' && !(cur.value > 0 && prior.value > 0)) { held.push({ metric, reason: 'NON_POSITIVE_REVENUE' }); continue; }
    if (Math.sign(cur.value) === Math.sign(prior.value) && prior.value !== 0) {
      const r = cur.value / prior.value;
      if (r < RULE.minRatio || r > RULE.maxRatio) { held.push({ metric, reason: 'YEAR_OVER_YEAR_IMPLAUSIBLE' }); continue; }
    }
    metrics.push({ metric, concept: 'ifrs-full:' + concept, value: cur.value, priorValue: prior.value, currency: cur.currency, periodStart: cur.start, periodEnd: cur.end, priorPeriodEnd: prior.end });
  }
  const rev = metrics.find((m) => m.metric === 'revenue'), ni = metrics.find((m) => m.metric === 'netIncome');
  if (rev && ni && Math.abs(ni.value) > rev.value * 1.5) { metrics.splice(metrics.indexOf(ni), 1); held.push({ metric: 'netIncome', reason: 'PROFIT_EXCEEDS_REVENUE' }); }
  return { status: metrics.length ? 'PLAUSIBLE' : 'NO_PLAUSIBLE_FACTS', metrics, held };
}

async function fetchBytes(url, fetchImpl) {
  const r = await fetchImpl(url, { headers: { 'user-agent': 'VisionUniverseResearch (ESEF-Kennzahlen; Kontakt über visionuniverse.de)' }, redirect: 'follow' });
  if (!r.ok) throw Error('HTTP_' + r.status);
  const b = Buffer.from(await r.arrayBuffer());
  if (b.length > 32 * 1024 * 1024) throw Error('PACKAGE_TOO_LARGE');
  return b;
}

export async function buildEsefFacts({ root = process.cwd(), sources, fetchImpl = globalThis.fetch, now = new Date().toISOString() } = {}) {
  const list = sources || JSON.parse(await readFile(join(root, 'scripts/official-filings/de-esef-sources.json'), 'utf8'));
  const catalog = JSON.parse(await readFile(join(root, 'discover/data/europe/catalog.json'), 'utf8'));
  const byLei = new Map();
  for (const s of catalog.securities) { const lei = String(s.companyId || '').replace(/^LEI:/, ''); if (!byLei.has(lei)) byLei.set(lei, []); byLei.get(lei).push(s); }
  const rows = [];
  for (const src of list.sources) {
    const secs = (byLei.get(src.lei) || []).filter((s) => s.ticker === src.ticker);
    const base = { ticker: src.ticker, lei: src.lei, fiscalYearEnd: src.fiscalYearEnd, sourceDocument: src.zipUrl, sourcePage: src.pageUrl || null, packageSha256: src.sha256 };
    if (secs.length !== 1) { rows.push({ ...base, securityId: null, status: 'IDENTITY_NOT_IN_CATALOG', metrics: [], held: [] }); continue; }
    const sec = secs[0], issuerCountry = sec.listings[0].identityAdmission?.issuerCountry;
    if (issuerCountry !== 'DE') { rows.push({ ...base, securityId: sec.securityId, status: 'NOT_A_GERMAN_ISSUER', metrics: [], held: [] }); continue; }
    let bytes;
    try { bytes = await fetchBytes(src.zipUrl, fetchImpl); } catch (e) { rows.push({ ...base, securityId: sec.securityId, status: 'DOWNLOAD_FAILED', reason: String(e.message || e).slice(0, 80), metrics: [], held: [] }); continue; }
    if (sha(bytes) !== src.sha256) { rows.push({ ...base, securityId: sec.securityId, status: 'PACKAGE_HASH_MISMATCH', metrics: [], held: [] }); continue; }
    const r = extractFacts(preparePackage(bytes, src.reportFile || null), { lei: src.lei, fiscalYearEnd: src.fiscalYearEnd });
    rows.push({ ...base, securityId: sec.securityId, name: sec.name, status: r.status, metrics: r.metrics, held: r.held });
  }
  return {
    schema: SCHEMA, generatedAt: now, scope: 'CONSOLIDATED_ISSUER_FACTS_ONLY',
    source: 'ESEF-Jahresfinanzbericht von der Website des Emittenten (gesetzliche Pflichtveröffentlichung); nur Kennzahlen, keine Dokumente',
    rule: RULE, concepts: CONCEPTS, quantInputReady: false,
    counts: { sources: list.sources.length, plausible: rows.filter((r) => r.status === 'PLAUSIBLE').length },
    rows,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k) => process.argv.find((a) => a.startsWith('--' + k + '='))?.slice(k.length + 3);
  const root = arg('root') || process.cwd(), out = resolve(arg('out') || join(root, 'discover/data/europe-esef'));
  const sources = arg('sources') ? JSON.parse(await readFile(arg('sources'), 'utf8')) : undefined;
  const data = await buildEsefFacts({ root, sources });
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'facts.json'), JSON.stringify(data, null, 1) + '\n');
  console.log(JSON.stringify({ out: join(out, 'facts.json'), ...data.counts, statuses: data.rows.reduce((a, r) => (a[r.status] = (a[r.status] || 0) + 1, a), {}) }));
}
