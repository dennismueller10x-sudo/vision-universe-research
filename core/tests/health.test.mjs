/* Core · Systemzustand (core/health.js) und Source-of-Truth-Register. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Health = require(join(ROOT, "core", "health.js"));
const TS = require(join(ROOT, "quant", "engines", "realtime", "trading-session.js"));
const calendar = JSON.parse(readFileSync(join(ROOT, "quant", "config", "market-calendar.json"), "utf8"));
const registry = JSON.parse(readFileSync(join(ROOT, "core", "registry", "domains.json"), "utf8"));
const ctx = (iso) => ({ now: new Date(iso), calendar, tradingSession: TS });
/* Samstag 03.10.2026, 12:00 UTC: Boerse zu, letzte Sitzung Freitag 02.10. */
const SAT = "2026-10-03T12:00:00Z";

const dom = (over) => Object.assign({ id: "x", label: "X", artifact: "/x.json", timestamp: ["generatedAt"], records: "rows",
  freshness: { kind: "hours", warnAfter: 24, staleAfter: 72 } }, over);
const run = (d, data, iso = SAT) => Health.evaluate({ domains: [d] }, { [d.artifact]: data === undefined ? { ok: false, error: "fehlt" } : { ok: true, data } }, ctx(iso)).domains[0];

test("Register · jede Domaene ist vollstaendig beschrieben und eindeutig", () => {
  const ids = new Set();
  for (const d of registry.domains) {
    assert.ok(!ids.has(d.id), "doppelte id " + d.id); ids.add(d.id);
    for (const k of ["label", "layer", "artifact", "producer", "role", "freshness", "consumers"]) assert.ok(d[k], d.id + " ohne " + k);
    assert.ok(["CORE", "INTELLIGENCE", "PRODUCT", "CONTENT"].includes(d.layer), d.id);
    assert.ok(registry.freshnessKinds[d.freshness.kind], d.id + ": unbekannte Frischeart " + d.freshness.kind);
  }
});

test("Register · jedes kanonische Artefakt liegt im Repository", () => {
  for (const d of registry.domains) assert.ok(existsSync(join(ROOT, d.artifact.slice(1))), d.id + ": " + d.artifact);
});

test("Register · jeder genannte Workflow und jedes Erzeugerskript existiert", () => {
  for (const d of registry.domains) {
    for (const wf of String(d.workflow || "").match(/[\w-]+\.yml/g) || []) {
      assert.ok(existsSync(join(ROOT, ".github", "workflows", wf)), d.id + ": Workflow " + wf);
    }
    for (const p of String(d.producer).match(/scripts\/[\w/.-]+\.(?:mjs|py|js)/g) || []) {
      assert.ok(existsSync(join(ROOT, p)), d.id + ": Erzeuger " + p);
    }
  }
});

test("Register · das Register liest seine Felder wirklich aus den Artefakten", () => {
  /* Ein Tippfehler im Pfad ergaebe still UNKNOWN statt eines Urteils. */
  for (const d of registry.domains) {
    const data = JSON.parse(readFileSync(join(ROOT, d.artifact.slice(1)), "utf8"));
    if (d.disabledWhen && Health.at(data, d.disabledWhen.path) === d.disabledWhen.equals) continue;
    if ((d.timestamp || []).length) assert.ok(d.timestamp.some((p) => Health.at(data, p)), d.id + ": kein Zeitstempel unter " + d.timestamp);
    if (d.records) assert.notEqual(Health.at(data, d.records), null, d.id + ": records " + d.records);
    if (d.expectedRecords) assert.notEqual(Health.at(data, d.expectedRecords), null, d.id + ": expectedRecords " + d.expectedRecords);
    for (const p of d.asOf || []) void p;
    if (d.asOf) assert.ok(d.asOf.some((p) => Health.at(data, p)), d.id + ": kein asOf unter " + d.asOf);
  }
});

test("Stunden · frisch OK, ueber Warnschwelle DEGRADED, ueber harter Schwelle STALE", () => {
  assert.equal(run(dom(), { generatedAt: "2026-10-03T06:00:00Z", rows: [1] }).status, "OK");
  assert.equal(run(dom(), { generatedAt: "2026-10-02T06:00:00Z", rows: [1] }).status, "DEGRADED");
  const s = run(dom(), { generatedAt: "2026-09-21T10:35:16Z", rows: [1] });
  assert.equal(s.status, "STALE");
  assert.equal(s.reason, "OLDER_THAN_72H");
});

test("Fehlendes Artefakt ist FAILED, nicht OK und nicht leer", () => {
  const d = run(dom(), undefined);
  assert.equal(d.status, "FAILED");
  assert.equal(d.reason, "ARTIFACT_UNREADABLE");
});

test("Ohne Zeitstempel ist die Frische UNKNOWN - nie still OK", () => {
  assert.equal(run(dom(), { rows: [1] }).status, "UNKNOWN");
});

test("Zu wenige Datensaetze ziehen auf DEGRADED (News mit einer Meldung)", () => {
  const d = run(dom({ minRecords: 3 }), { generatedAt: "2026-10-03T11:00:00Z", rows: [1] });
  assert.equal(d.status, "DEGRADED");
  assert.equal(d.records, 1);
});

test("Sitzungen · Freitag ist am Samstag aktuell, Mittwoch ist zwei Sitzungen zurueck", () => {
  const d = dom({ asOf: ["asOf"], freshness: { kind: "sessions", warnAfter: 1, staleAfter: 2 } });
  assert.equal(run(d, { generatedAt: "2026-10-03T05:00:00Z", asOf: "2026-10-02", rows: [1] }).status, "OK");
  const alt = run(d, { generatedAt: "2026-10-01T05:00:00Z", asOf: "2026-09-30", rows: [1] });
  assert.equal(alt.lagSessions, 2);
  assert.equal(alt.status, "STALE");
  assert.equal(run(d, { generatedAt: "2026-10-02T05:00:00Z", asOf: "2026-10-01", rows: [1] }).status, "DEGRADED");
});

test("Intraday · der Stand vom 03.10.2026 (14:25, 'laeuft', nach Schluss) ist STALE mit Grund", () => {
  const d = registry.domains.find((x) => x.id === "intraday");
  const data = { generatedAt: "2026-10-02T18:28:13Z", entryCount: 1388,
    dataSession: { sessionDate: "2026-10-02", asOf: "2026-10-02T18:25:00Z", asOfLocal: "14:25", regularComplete: false },
    displaySession: { sessionDate: "2026-10-02", isRunning: true }, universeSessions: ["2026-10-01"] };
  const r = run(d, data);
  assert.equal(r.status, "STALE");
  assert.equal(r.reason, "SESSION_NOT_COMPLETED");
  assert.ok(r.warnings.some((w) => /laufend/.test(w)));
  assert.ok(r.warnings.some((w) => /Universumslauf/.test(w)));
});

test("Intraday · vollstaendiger Schluss mit Universum ist OK", () => {
  const d = registry.domains.find((x) => x.id === "intraday");
  const data = { generatedAt: "2026-10-02T21:40:00Z", entryCount: 1388,
    dataSession: { sessionDate: "2026-10-02", asOf: "2026-10-02T20:00:00Z", regularComplete: true },
    displaySession: { isRunning: false }, universeSessions: ["2026-10-02"] };
  assert.equal(run(d, data).status, "OK");
});

test("Intraday · bei offener Boerse zaehlt das Alter des letzten Takts", () => {
  const d = registry.domains.find((x) => x.id === "intraday");
  const mk = (asOf) => ({ generatedAt: asOf, entryCount: 1, dataSession: { sessionDate: "2026-10-02", asOf, regularComplete: false } });
  assert.equal(run(d, mk("2026-10-02T15:50:00Z"), "2026-10-02T16:00:00Z").status, "OK");
  assert.equal(run(d, mk("2026-10-02T15:00:00Z"), "2026-10-02T16:00:00Z").status, "STALE");
});

test("Abgeschaltete Domaene ist DISABLED und zieht das Gesamturteil nicht herunter", () => {
  const d = dom({ disabledWhen: { path: "state", equals: "DISABLED" } });
  const r = Health.evaluate({ domains: [d] }, { [d.artifact]: { ok: true, data: { state: "DISABLED" } } }, ctx(SAT));
  assert.equal(r.domains[0].status, "DISABLED");
  assert.equal(r.overall, "OK");
});

test("Gesamturteil · nicht-kritische Domaene zieht hoechstens auf DEGRADED, kritische bis FAILED", () => {
  const a = dom({ id: "a", artifact: "/a.json", critical: false });
  const b = dom({ id: "b", artifact: "/b.json", critical: true });
  const nurNews = Health.evaluate({ domains: [a, b] }, { "/a.json": { ok: false, error: "x" }, "/b.json": { ok: true, data: { generatedAt: "2026-10-03T11:00:00Z", rows: [1] } } }, ctx(SAT));
  assert.equal(nurNews.overall, "DEGRADED");
  const kurse = Health.evaluate({ domains: [a, b] }, { "/a.json": { ok: true, data: { generatedAt: "2026-10-03T11:00:00Z", rows: [1] } }, "/b.json": { ok: false, error: "x" } }, ctx(SAT));
  assert.equal(kurse.overall, "FAILED");
});

test("Textbericht nennt Grund und Erzeuger jedes nicht gesunden Systems", () => {
  const r = Health.evaluate({ domains: [dom({ workflow: "update-news.yml" })] }, { "/x.json": { ok: true, data: { generatedAt: "2026-09-21T10:35:16Z", rows: [1] } } }, ctx(SAT));
  const txt = Health.formatText(r);
  assert.match(txt, /STALE/);
  assert.match(txt, /update-news\.yml/);
});
