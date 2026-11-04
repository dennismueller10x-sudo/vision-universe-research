#!/usr/bin/env node
// Vision Universe — Watchlist-Ereignisse als vorbereitete Datenart (docs/accounts/WATCHLIST.md §7). KEINE Zustellung.
//
//   node scripts/account/build-watchlist-events.mjs --before=<Uebersicht> --after=<Uebersicht> --out=<datei.json>
//
// <Uebersicht> ist eine veroeffentlichte Watchlist-Uebersicht (scripts/watchlist/build-summary.mjs): entweder das
// ausgelieferte Verzeichnis (meta.json + rows/<shardKey>.json) oder eine einzelne Datei mit dem ganzen Dokument
// (.json oder .json.gz). Verglichen wird ueber core/watchlist-view.js#events - je Instrument einmal, nicht je Nutzer.
//
// Idempotent: eventId ist ein Hash aus Wertpapier (instrumentId, securityId nach core/identity.js), Art, vorher, nachher
// und Datenstand; occurredAt ist der Veroeffentlichungszeitpunkt der neueren Uebersicht. Zwei Laeufe mit denselben
// Eingaben ergeben byte-gleiche Ausgaben ohne doppelte Ereignisse.
//
// Was diese Datei NICHT tut: keine E-Mail, kein Push, kein Versand, kein Lesen von Nutzerdaten, kein Zeitplan.
// Die Datenart steht in core/registry/domains.json auf PREPARED_DISABLED; solange das gilt, verweigert der Erzeuger das
// Schreiben an den kanonischen Ort (Exit 3) und schreibt nur nach --out.
import {readFileSync, writeFileSync, existsSync, statSync, mkdirSync} from 'node:fs';
import {resolve, dirname, join} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const W = require('../../core/watchlist-view.js');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const SCHEMA = 'vu-watchlist-events-1.0.0';
export const DOMAIN_ID = 'watchlistEvents';
const EVENT_SCHEMA = JSON.parse(readFileSync(join(ROOT, 'core/contracts/events.schema.json'), 'utf8'));

const readMaybeGz = (p) => { const b = readFileSync(p); return JSON.parse(p.endsWith('.gz') ? gunzipSync(b) : b); };

/** Laedt eine veroeffentlichte Uebersicht (Verzeichnis in Teilen oder ganzes Dokument). Fehlt eine Scherbe, fehlt sie. */
export function loadSummary(path) {
  if (!path || !existsSync(path)) throw Error('SUMMARY_MISSING:' + path);
  if (statSync(path).isDirectory()) {
    const meta = readMaybeGz(join(path, 'meta.json'));
    const parts = (meta.shards || []).map((k) => {
      const p = join(path, 'rows', k + '.json');
      if (!existsSync(p)) return null;
      const part = readMaybeGz(p);
      return part && part.shard === k ? part : null;
    });
    return W.merge(meta, parts);
  }
  return readMaybeGz(path);
}

/** Pruefung gegen core/contracts/events.schema.json (Pflichtfelder, Aufzaehlungen, Muster). [] = gueltig. */
export function validateEvent(e, schema = EVENT_SCHEMA) {
  const out = [], P = schema.properties;
  for (const k of schema.required) if (e[k] === undefined || e[k] === null) out.push('MISSING:' + k);
  if (e.schemaVersion !== P.schemaVersion.const) out.push('SCHEMA_VERSION');
  if (!new RegExp(P.eventId.pattern).test(e.eventId || '')) out.push('EVENT_ID');
  if (!P.type.enum.includes(e.type)) out.push('TYPE:' + e.type);
  const subs = (P.subtype.enumByType || {})[e.type];
  if (subs && !subs.includes(e.subtype)) out.push('SUBTYPE:' + e.type + '/' + e.subtype);
  for (const k of ['instrumentId', 'securityId']) if (e[k] != null && !new RegExp(P[k].pattern).test(e[k])) out.push('PATTERN:' + k);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.asOf || '')) out.push('AS_OF');
  if (!isFinite(Date.parse(e.occurredAt || ''))) out.push('OCCURRED_AT');
  if (!e.source || P.source.required.some((k) => typeof e.source[k] !== 'string')) out.push('SOURCE');
  if (!e.evidence || typeof e.evidence !== 'object') out.push('EVIDENCE');
  if (e.severity !== undefined && !P.severity.enum.includes(e.severity)) out.push('SEVERITY');
  return out;
}

const sourcesOf = (doc) => Object.fromEntries(W.EVENT_SOURCES.map((k) => [k, doc.sources && doc.sources[k] ? doc.sources[k].asOf || null : null]));

/** Reine Funktion: zwei Uebersichten -> Ereignisdokument (deterministisch, ohne Uhrzeit des Laufs). */
export function buildEvents(beforeDoc, afterDoc) {
  if (!beforeDoc || !beforeDoc.cols || !afterDoc || !afterDoc.cols) throw Error('SUMMARY_INVALID');
  const raw = W.events(beforeDoc, afterDoc);
  const seen = new Map();
  for (const e of raw) if (!seen.has(e.eventId)) seen.set(e.eventId, e);
  const events = [...seen.values()].sort((a, b) =>
    String(a.ticker || '').localeCompare(String(b.ticker || '')) || a.type.localeCompare(b.type) || String(a.subtype).localeCompare(String(b.subtype)) || a.eventId.localeCompare(b.eventId));
  const invalid = events.map((e) => [e.eventId, validateEvent(e)]).filter(([, v]) => v.length);
  if (invalid.length) throw Error('EVENT_SCHEMA_VIOLATION:' + JSON.stringify(invalid.slice(0, 5)));
  const byType = {};
  for (const e of events) { const k = e.type + '/' + e.subtype; byType[k] = (byType[k] || 0) + 1; }
  return {
    schemaVersion: SCHEMA, eventSchema: EVENT_SCHEMA.properties.schemaVersion.const, ruleVersion: W.RULE_VERSION,
    generatedAt: afterDoc.generatedAt || null,
    delivery: { state: 'NONE', note: 'Vorbereitet, keine Zustellung (WATCHLIST.md §7, FREIGABEN.md). Wer ein Ereignis bekommt, entscheidet eine spaetere, freigabepflichtige Stufe.' },
    before: { generatedAt: beforeDoc.generatedAt || null, count: beforeDoc.cols.i.length, sources: sourcesOf(beforeDoc) },
    after: { generatedAt: afterDoc.generatedAt || null, count: afterDoc.cols.i.length, sources: sourcesOf(afterDoc) },
    counts: { total: events.length, duplicatesDropped: raw.length - events.length, byType: Object.fromEntries(Object.entries(byType).sort()) },
    events,
  };
}

function registryEntry(root) {
  try { return (JSON.parse(readFileSync(join(root, 'core/registry/domains.json'), 'utf8')).domains || []).find((d) => d.id === DOMAIN_ID) || null; } catch { return null; }
}

export function run({before, after, out, root = ROOT}) {
  if (!out) throw Object.assign(Error('OUT_REQUIRED: --out=<datei> fehlt; es gibt keinen Standard-Ausgabeort.'), {exit: 2});
  const target = resolve(out), d = registryEntry(root);
  if (d && d.activation && d.activation.state === 'PREPARED_DISABLED' && target === resolve(root, d.artifact.slice(1)))
    throw Object.assign(Error('NOT_ACTIVATED: ' + DOMAIN_ID + ' ist PREPARED_DISABLED; der kanonische Ort ' + d.artifact + ' bleibt leer.'), {exit: 3});
  const doc = buildEvents(loadSummary(before), loadSummary(after));
  mkdirSync(dirname(target), {recursive: true});
  writeFileSync(target, JSON.stringify(doc, null, 1) + '\n');
  return {out: target, total: doc.counts.total, byType: doc.counts.byType};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (n) => { const a = process.argv.find((x) => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : null; };
  try {
    console.log(JSON.stringify(run({before: arg('before'), after: arg('after'), out: arg('out')})));
  } catch (e) {
    console.error(String(e && e.message || e));
    process.exit(e && e.exit || 1);
  }
}
