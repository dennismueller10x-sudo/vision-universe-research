/* Konten · Watchlist-Ereignisse (scripts/account/build-watchlist-events.mjs): vorbereitete Datenart ohne Zustellung.
   Gegen den echten Bestand (Uebersicht im Speicher gebaut, in ein Wegwerfverzeichnis geschrieben) mit gezielten
   Aenderungen: Idempotenz, leerer Vergleich, Ereignisarten, fehlende Welt, kein Schreiben an den kanonischen Ort. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { gzipSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { buildSummary, writeSummary } from "../../watchlist/build-summary.mjs";
import { buildEvents, loadSummary, validateEvent, run, SCHEMA, DOMAIN_ID } from "../build-watchlist-events.mjs";

const require = createRequire(import.meta.url);
const Ident = require("../../../core/identity.js");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SCRIPT = join(ROOT, "scripts", "account", "build-watchlist-events.mjs");
const registry = JSON.parse(readFileSync(join(ROOT, "core", "registry", "domains.json"), "utf8"));
const NOW = new Date("2026-11-03T12:00:00Z");
const base = buildSummary(ROOT, { now: NOW }).doc;
const clone = (d) => JSON.parse(JSON.stringify(d));
const at = (doc, t) => doc.cols.s.findIndex((s, i) => s === t && doc.cols.act[i] === 1);

function tmp(t) { const d = mkdtempSync(join(tmpdir(), "vu-wl-events-")); t.after(() => rmSync(d, { recursive: true, force: true })); return d; }
/* Nachher-Stand: dieselbe Uebersicht mit Aenderungen an einem bekannten Titel (NVDA). */
function changed() {
  const d = clone(base), k = at(d, "NVDA");
  d.cols.a200[k] = !d.cols.a200[k];
  d.cols.st[k] = d.cols.st[k] === "BULLISH" ? "BEARISH" : "BULLISH";
  return d;
}

test("Registry: watchlistEvents ist PREPARED_DISABLED, ohne Workflow, Artefakt fehlt, nicht kritisch", () => {
  const d = registry.domains.find((x) => x.id === DOMAIN_ID);
  assert.ok(d, "Eintrag vorhanden");
  assert.equal(d.activation.state, "PREPARED_DISABLED");
  assert.equal(d.critical, false);
  assert.equal(d.workflow, undefined, "kein Workflow, kein Zeitplan");
  assert.match(d.producer, /^scripts\/account\/build-watchlist-events\.mjs /);
  assert.ok(!existsSync(join(ROOT, d.artifact.slice(1))), "kein veroeffentlichtes Ereignisartefakt");
  /* Keine Zustellung: der Erzeuger kennt weder Mail-, Push- noch Nutzerdaten. */
  const src = readFileSync(SCRIPT, "utf8").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(src, /brevo|smtp|sendmail|webpush|fetch\(|supabase|watchlist_items|PG_|process\.env/i);
});

test("Idempotenz: zwei Laeufe ergeben byte-gleiche Dateien, eindeutige eventId, gueltig nach Vertrag", (t) => {
  const dir = tmp(t);
  writeSummary({ root: ROOT, out: join(dir, "before"), now: NOW });
  writeFileSync(join(dir, "after.json.gz"), gzipSync(JSON.stringify(changed())));
  const one = run({ before: join(dir, "before"), after: join(dir, "after.json.gz"), out: join(dir, "a.json") });
  const two = run({ before: join(dir, "before"), after: join(dir, "after.json.gz"), out: join(dir, "b.json") });
  assert.equal(readFileSync(one.out, "utf8"), readFileSync(two.out, "utf8"), "byte-gleich");
  const doc = JSON.parse(readFileSync(one.out, "utf8"));
  assert.equal(doc.schemaVersion, SCHEMA);
  assert.equal(doc.delivery.state, "NONE");
  assert.equal(new Set(doc.events.map((e) => e.eventId)).size, doc.events.length, "keine Duplikate");
  assert.deepEqual(doc.events.flatMap((e) => validateEvent(e)), []);
  const nvda = doc.events.filter((e) => e.ticker === "NVDA").map((e) => e.type + ":" + e.subtype).sort();
  assert.deepEqual(nvda, ["TECHNICAL_CHANGE:" + (doc.events.find((e) => e.ticker === "NVDA" && /SMA200/.test(e.subtype)).subtype), "TECHNICAL_CHANGE:TREND_STRUCTURE_CHANGED"].sort());
  assert.ok(doc.events.every((e) => e.instrumentId === null || e.securityId === Ident.securityIdForTicker(e.ticker)));
  assert.equal(doc.counts.total, doc.events.length);
  // Ein erneuter Vergleich mit einer Kopie des Nachher-Stands (gleiche Daten) erzeugt dieselben IDs, nichts dazu.
  const again = buildEvents(loadSummary(join(dir, "before")), clone(changed()));
  assert.deepEqual(again.events.map((e) => e.eventId), doc.events.map((e) => e.eventId));
});

test("Leerer Vergleich: dieselbe Uebersicht vorher und nachher ergibt kein Ereignis", (t) => {
  const dir = tmp(t);
  writeSummary({ root: ROOT, out: join(dir, "s"), now: NOW });
  const r = run({ before: join(dir, "s"), after: join(dir, "s"), out: join(dir, "e.json") });
  assert.equal(r.total, 0);
  assert.deepEqual(JSON.parse(readFileSync(r.out, "utf8")).events, []);
});

test("Ereignisarten am echten Bestand: Datenstand, Quant, Supertrader-Zustand", () => {
  const before = clone(base), after = clone(base), k = at(after, "NVDA");
  before.sources.technical.asOf = "2026-10-01";
  after.cols.qdq[k] = after.cols.qdq[k] === "PASS" ? "WARNING" : "PASS";
  const q = after.cols.q[k], m = q.findIndex((f) => f && f[1] != null);
  q[m] = [q[m][0], q[m][1] >= 2 ? 0 : 4];
  after.cols.sts[k] = (after.cols.sts[k] || []).concat([["MOMENTUM_BREAKOUT_TEST", "SETUP", "1.0.0"]]);
  const doc = buildEvents(before, after);
  const types = new Set(doc.events.map((e) => e.type + ":" + e.subtype));
  for (const ty of ["DATA_STATE_CHANGE:SOURCE_UPDATED", "QUANT_CHANGE:DATA_QUALITY_CHANGED", "SUPERTRADER_SIGNAL:STATE_CHANGED"]) assert.ok(types.has(ty), ty);
  assert.ok(types.has("QUANT_CHANGE:FACTOR_BAND_UP") || types.has("QUANT_CHANGE:FACTOR_BAND_DOWN"));
  const st = doc.events.find((e) => e.subtype === "STATE_CHANGED" && e.evidence.strategyId === "MOMENTUM_BREAKOUT_TEST");
  assert.equal(st.evidence.presentation, "RESEARCH", "nicht freigegebene Strategie bleibt Forschung");
  assert.equal(st.severity, "INFO");
});

test("Fehlende Welt: ohne Supertrader-Quelle ein Quellereignis, keine Supertrader-Ereignisse je Titel", () => {
  const after = clone(base);
  delete after.sources.supertrader;
  const doc = buildEvents(base, after);
  assert.deepEqual(doc.events.map((e) => [e.type, e.subtype, e.evidence.source, e.evidence.state, e.instrumentId]),
    [["DATA_STATE_CHANGE", "SOURCE_STATE_CHANGED", "supertrader", "UNAVAILABLE", null]]);
  assert.equal(doc.after.sources.supertrader, null);
});

test("CLI: --out ist Pflicht, der kanonische Ort bleibt gesperrt, fehlende Eingabe bricht ab", (t) => {
  const dir = tmp(t);
  writeSummary({ root: ROOT, out: join(dir, "s"), now: NOW });
  const cli = (...a) => spawnSync(process.execPath, [SCRIPT, ...a], { encoding: "utf8" });
  assert.equal(cli("--before=" + join(dir, "s"), "--after=" + join(dir, "s")).status, 2);
  const d = registry.domains.find((x) => x.id === DOMAIN_ID), canonical = join(ROOT, d.artifact.slice(1));
  const r = cli("--before=" + join(dir, "s"), "--after=" + join(dir, "s"), "--out=" + canonical);
  assert.equal(r.status, 3);
  assert.match(r.stderr, /NOT_ACTIVATED/);
  assert.ok(!existsSync(canonical));
  const miss = cli("--before=" + join(dir, "fehlt"), "--after=" + join(dir, "s"), "--out=" + join(dir, "e.json"));
  assert.equal(miss.status, 1);
  assert.match(miss.stderr, /SUMMARY_MISSING/);
  const ok = cli("--before=" + join(dir, "s"), "--after=" + join(dir, "s"), "--out=" + join(dir, "e.json"));
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(JSON.parse(ok.stdout).total, 0);
});
