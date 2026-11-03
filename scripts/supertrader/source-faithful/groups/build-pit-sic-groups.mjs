#!/usr/bin/env node
/**
 * Erzeuger der PIT-Branchengruppen je Wertpapier (FP-ST-03). Offline: liest nur, schreibt nur nach --out.
 *
 *   node scripts/supertrader/source-faithful/groups/build-pit-sic-groups.mjs --out <datei.json[.gz]>
 *        [--sic-history <dir>]       PIT-SIC-Basis (Standard quant/data/sec/sic-history, nur gelesen)
 *        [--sic-issuers <datei>]     statt der Basis: Stichprobe im Format sic-history (edgar_sample.py --out)
 *        [--instruments <dir>]       Wertpapierstamm (Standard quant/data/universe/instruments, nur gelesen)
 *        [--identity <datei>]        zusaetzliche Kandidaten [{ ticker|securityId, cik, evidence, validFrom, validTo }]
 *        [--fixture <dir>]           setzt sic-history = <dir>/sic-history, instruments = <dir>/instruments
 *        [--tickers A,B] [--limit N] Auswahl (nach securityId sortiert)
 *        [--coverage-from YYYY-MM] [--coverage-to YYYY-MM]   Monatsende-Raster der Coverage-Messung
 *        [--report <datei.json>]     Coverage-Bericht zusaetzlich als Datei
 *
 * Kein Schreiben in erzeugergebundene Datenbaeume (quant/data, discover/data, supertrader/data, social/data): der
 * Datensatz ist ein Research-Zwischenstand, kein Produktartefakt. Keine Strategie liest ihn (keine Aktivierung).
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { buildDataset, createPitSicSource, identityFromInstruments, IDENTITY_EVIDENCE, PIT_SIC_GROUPS_VERSION, STATUS } from './pit-sic-groups.mjs';

const require = createRequire(import.meta.url);
const IC = require('../../../../core/industry-classification.js');
const Identity = require('../../../../core/identity.js');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const FF49_PATH = join(dirname(fileURLToPath(import.meta.url)), 'ff49-siccodes.json');
export const PRODUCER_OWNED = [/^quant\/data\//, /^discover\/data\//, /^supertrader\/data\//, /^social\/data\//];

const readJson = (p) => JSON.parse(p.endsWith('.gz') ? gunzipSync(readFileSync(p)).toString('utf8') : readFileSync(p, 'utf8'));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

export function parseArgs(argv) {
  const o = { tickers: null, limit: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    const take = () => { i++; return v; };
    if (k === '--out') o.out = take();
    else if (k === '--sic-history') o.sicHistory = take();
    else if (k === '--sic-issuers') o.sicIssuers = take();
    else if (k === '--instruments') o.instruments = take();
    else if (k === '--identity') o.identity = take();
    else if (k === '--fixture') o.fixture = take();
    else if (k === '--tickers') o.tickers = take().split(',').map((s) => s.trim()).filter(Boolean);
    else if (k === '--limit') o.limit = Number(take());
    else if (k === '--coverage-from') o.coverageFrom = take();
    else if (k === '--coverage-to') o.coverageTo = take();
    else if (k === '--report') o.report = take();
    else throw new Error('unbekanntes Argument: ' + k);
  }
  if (o.fixture) { o.sicHistory ||= join(o.fixture, 'sic-history'); o.instruments ||= join(o.fixture, 'instruments'); }
  o.sicHistory ||= join(ROOT, 'quant/data/sec/sic-history');
  o.instruments ||= join(ROOT, 'quant/data/universe/instruments');
  if (!o.out) throw new Error('--out fehlt (der Erzeuger schreibt nie in ein committetes Artefakt)');
  if (o.limit != null && !(Number.isInteger(o.limit) && o.limit > 0)) throw new Error('--limit muss eine positive ganze Zahl sein');
  return o;
}

export function assertOutAllowed(out) {
  for (const p of [out]) {
    if (!p) continue;
    const rel = relative(ROOT, resolve(p)).split('\\').join('/');
    if (!rel.startsWith('..') && PRODUCER_OWNED.some((r) => r.test(rel))) throw new Error('OUT_IN_PRODUCER_OWNED_TREE: ' + rel);
  }
}

function loadInstruments(dir) {
  const list = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) list.push(...(readJson(join(dir, f)).instruments || []));
  return list;
}

/** Zusaetzliche Kandidaten (z. B. Snapshot sec-pit). securityId nur ueber core/identity.js. */
function mergeExtraIdentity(bySecurity, rows) {
  for (const r of rows || []) {
    const securityId = r.securityId ?? Identity.securityIdForTicker(r.ticker);
    if (!Identity.isSecurityId(securityId)) throw new Error('INVALID_SECURITY_ID: ' + securityId);
    if (r.ticker && !Identity.consistent(r.ticker, securityId)) throw new Error('IDENTITY_INCONSISTENT: ' + r.ticker + ' / ' + securityId);
    const cik = IC.normalizeCik(r.cik);
    if (!cik) continue;
    if (!Object.values(IDENTITY_EVIDENCE).includes(r.evidence)) throw new Error('UNKNOWN_IDENTITY_EVIDENCE: ' + r.evidence);
    const list = bySecurity.get(securityId) || [];
    list.push({ cik, evidence: r.evidence, validFrom: r.validFrom ?? null, validTo: r.validTo ?? null, source: r.source || 'identity-file' });
    bySecurity.set(securityId, list);
  }
}

/** Monatsenden (Kalender) von YYYY-MM bis YYYY-MM. */
export function monthEnds(from, to) {
  const out = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10));
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

export function run(opts) {
  assertOutAllowed(opts.out); assertOutAllowed(opts.report);
  const ff49Table = JSON.parse(readFileSync(FF49_PATH, 'utf8'));
  const { bySecurity, rejected } = identityFromInstruments(loadInstruments(opts.instruments));
  if (opts.identity) mergeExtraIdentity(bySecurity, readJson(opts.identity));
  let ids = [...bySecurity.keys()].sort();
  const sample = opts.sicIssuers ? readJson(opts.sicIssuers) : null;
  // Eine Stichprobe deckt nur ihre Emittenten: die Auswahl folgt ihr, sonst waere jede andere Aktie "ohne Beobachtung".
  if (sample) ids = ids.filter((id) => bySecurity.get(id).some((x) => sample.issuers?.[x.cik]));
  if (opts.tickers) { const want = new Set(opts.tickers.map((t) => Identity.securityIdForTicker(t))); ids = ids.filter((x) => want.has(x)); }
  if (opts.limit) ids = ids.slice(0, opts.limit);
  const identity = new Map(ids.map((id) => [id, bySecurity.get(id)]));
  const ciks = new Set(ids.flatMap((id) => identity.get(id).map((x) => x.cik)));

  // SIC-Beobachtungen nur fuer die benoetigten CIKs (Scherbe = letzte drei Ziffern)
  const issuers = {};
  let sicSource;
  if (sample) {
    const s = sample;
    for (const cik of ciks) if (s.issuers?.[cik]) issuers[cik] = s.issuers[cik];
    sicSource = { kind: 'EDGAR_HEADER_SAMPLE', file: opts.sicIssuers, schemaVersion: s.schemaVersion ?? null, run: s.run ?? null };
  } else {
    const index = readJson(join(opts.sicHistory, 'index.json'));
    if (index.schemaVersion !== IC.SCHEMA) throw new Error('sic-history Schema ' + index.schemaVersion + ' != ' + IC.SCHEMA);
    const shards = new Set([...ciks].map((c) => IC.shardOf(c)));
    for (const sh of [...shards].sort()) {
      // Bestand: gzip-Scherben; Testfixturen duerfen unkomprimiert sein
      const p = [join(opts.sicHistory, 'issuers', sh + '.json.gz'), join(opts.sicHistory, 'issuers', sh + '.json')].find((x) => existsSync(x));
      if (!p) continue;
      const data = readJson(p);
      for (const [cik, rec] of Object.entries(data.issuers || {})) if (ciks.has(cik)) issuers[cik] = rec;
    }
    sicSource = { kind: 'PIT_SIC_BASE', path: relative(ROOT, resolve(opts.sicHistory)).split('\\').join('/'), schemaVersion: index.schemaVersion, observedThrough: index.observedThrough ?? null };
  }

  const dataset = buildDataset({
    issuers, identity,
    generatedFrom: sicSource.observedThrough ?? null,
    sources: { sic: sicSource, identity: { instruments: relative(ROOT, resolve(opts.instruments)).split('\\').join('/'), extra: opts.identity || null, rejected }, ff49: { sha256: ff49Table.source.sha256, url: ff49Table.source.url } },
  });

  // Coverage auf Monatsenden (Messung, keine deklarierte Fortschreibung: STALE wird nicht gesetzt)
  const src = createPitSicSource(dataset, ff49Table);
  const to = opts.coverageTo || (sicSource.observedThrough ? String(sicSource.observedThrough).slice(0, 7) : '2026-09');
  const dates = monthEnds(opts.coverageFrom || '2016-01', to);
  const cov = src.coverage(ids, dates);
  const intervals = Object.values(dataset.issuers).flatMap((x) => x.intervals);
  const report = {
    producer: PIT_SIC_GROUPS_VERSION,
    securities: ids.length,
    ciks: ciks.size,
    ciksWithObservations: Object.keys(dataset.issuers).length,
    intervals: intervals.length,
    observedSicChanges: intervals.filter((x) => x.start === 'OBSERVED_CHANGE').length,
    ambiguousSecurities: ids.filter((id) => new Set(identity.get(id).map((x) => x.cik)).size > 1).length,
    identityRejected: rejected,
    coverageGrid: { from: dates[0], to: dates.at(-1), points: cov.points },
    byStatus: cov.byStatus,
    observedShare: cov.points ? Math.round((1e4 * (cov.byStatus[STATUS.OBSERVED] || 0)) / cov.points) / 1e4 : null,
    observedByFf49Status: cov.observedByFf49Status,
    byYear: cov.byYear,
  };
  dataset.coverage = report;
  const json = JSON.stringify(dataset);
  mkdirSync(dirname(resolve(opts.out)), { recursive: true });
  writeFileSync(opts.out, opts.out.endsWith('.gz') ? gzipSync(Buffer.from(json), { level: 9 }) : json);
  if (opts.report) writeFileSync(opts.report, JSON.stringify({ ...report, datasetSha256: sha256(Buffer.from(json)) }, null, 1) + '\n');
  return { dataset, report, datasetSha256: sha256(Buffer.from(json)) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const { report, datasetSha256 } = run(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify({ ...report, byYear: undefined, datasetSha256 }, null, 1));
  } catch (e) { console.error(e.message); process.exit(1); }
}
