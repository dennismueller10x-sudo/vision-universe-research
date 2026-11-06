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
import { buildEvents, mergeWindow, loadSummary, validateEvent, run, SCHEMA, DOMAIN_ID } from "../build-watchlist-events.mjs";

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

test("Registry: watchlistEvents ist ACTIVATING im Release-Bau, Artefakt nur in der Auslieferung, nicht kritisch", () => {
  const d = registry.domains.find((x) => x.id === DOMAIN_ID);
  assert.ok(d, "Eintrag vorhanden");
  assert.equal(d.activation.state, "ACTIVATING");
  assert.equal(d.critical, false);
  assert.match(d.workflow, /^pages-release\.yml /, "Schritt des Release-Baus");
  const wf = readFileSync(join(ROOT, ".github/workflows/pages-release.yml"), "utf8");
  assert.match(wf, /fetch-published\.mjs --site=https:\/\/research\.visionuniverse\.de --out="\$RUNNER_TEMP\/watchlist-prev"/);
  assert.match(wf, /VU_WATCHLIST_PREVIOUS: \$\{\{ runner\.temp \}\}\/watchlist-prev\n\s+run: node scripts\/vu2\/build-release\.mjs/);
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
  assert.equal(doc.delivery.state, "APP_PUSH");
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

test("CLI: --out ist Pflicht, der Ort im Repository bleibt gesperrt (nur Auslieferung), fehlende Eingabe bricht ab", (t) => {
  const dir = tmp(t);
  writeSummary({ root: ROOT, out: join(dir, "s"), now: NOW });
  const cli = (...a) => spawnSync(process.execPath, [SCRIPT, ...a], { encoding: "utf8" });
  assert.equal(cli("--before=" + join(dir, "s"), "--after=" + join(dir, "s")).status, 2);
  const d = registry.domains.find((x) => x.id === DOMAIN_ID), canonical = join(ROOT, d.artifact.slice(1));
  const r = cli("--before=" + join(dir, "s"), "--after=" + join(dir, "s"), "--out=" + canonical);
  assert.equal(r.status, 3);
  assert.match(r.stderr, /RELEASE_ONLY/);
  assert.ok(!existsSync(canonical));
  const miss = cli("--before=" + join(dir, "fehlt"), "--after=" + join(dir, "s"), "--out=" + join(dir, "e.json"));
  assert.equal(miss.status, 1);
  assert.match(miss.stderr, /SUMMARY_MISSING/);
  const ok = cli("--before=" + join(dir, "s"), "--after=" + join(dir, "s"), "--out=" + join(dir, "e.json"));
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(JSON.parse(ok.stdout).total, 0);
});

test("mergeWindow: Ereignisse der vorigen Auslieferung bleiben 48 h, gleiche eventId einmal, aeltere fallen weg", (t) => {
  const dir = tmp(t);
  writeSummary({ root: ROOT, out: join(dir, "before"), now: NOW });
  writeFileSync(join(dir, "after.json.gz"), gzipSync(JSON.stringify(changed())));
  const fresh = JSON.parse(readFileSync(run({ before: join(dir, "before"), after: join(dir, "after.json.gz"), out: join(dir, "n.json") }).out, "utf8"));
  assert.ok(fresh.events.length > 0);
  const ref = Date.parse(fresh.generatedAt), old = (h, id) => ({ ...fresh.events[0], eventId: id, occurredAt: new Date(ref - h * 3600e3).toISOString() });
  const prev = { events: [old(30, "ev_00000000000000a1"), old(49, "ev_00000000000000a2"), fresh.events[0], { broken: true }] };
  const m = mergeWindow(prev, fresh);
  const ids = m.events.map((e) => e.eventId);
  assert.ok(ids.includes("ev_00000000000000a1"), "30 h alt: bleibt");
  assert.ok(!ids.includes("ev_00000000000000a2"), "49 h alt: faellt weg");
  assert.equal(ids.filter((x) => x === fresh.events[0].eventId).length, 1, "gleiche eventId nur einmal");
  assert.equal(m.counts.total, m.events.length); assert.equal(m.window.hours, 48); assert.equal(m.window.carried, 2);
  assert.deepEqual(m.events.flatMap((e) => validateEvent(e)), [], "nur gueltige Ereignisse");
  /* Ueber run(): previousEvents als Datei */
  writeFileSync(join(dir, "prev.json"), JSON.stringify(prev));
  const viaRun = JSON.parse(readFileSync(run({ before: join(dir, "before"), after: join(dir, "after.json.gz"), out: join(dir, "w.json"), previousEvents: join(dir, "prev.json") }).out, "utf8"));
  assert.deepEqual(viaRun.events.map((e) => e.eventId), ids);
});
