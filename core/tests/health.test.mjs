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

const prepared = (d) => !!(d.activation && d.activation.state === "PREPARED_DISABLED");
const activating = (d) => !!(d.activation && d.activation.state === "ACTIVATING");

test("Register · jedes kanonische Artefakt liegt im Repository (vorbereitete Datenarten: gerade NICHT)", () => {
  for (const d of registry.domains) {
    if (prepared(d)) assert.ok(!existsSync(join(ROOT, d.artifact.slice(1))), d.id + ": Artefakt ohne Freigabe veroeffentlicht " + d.artifact);
    else if (activating(d)) continue; /* freigegeben, erster Lauf ausstehend: mit oder ohne Artefakt */
    else assert.ok(existsSync(join(ROOT, d.artifact.slice(1))), d.id + ": " + d.artifact);
  }
});

test("Register · Aktivierungszustand: nur PREPARED_DISABLED oder ACTIVATING, mit Entscheidung; sonst kein Feld", () => {
  for (const d of registry.domains) {
    if (d.activation === undefined) continue;
    assert.ok(["PREPARED_DISABLED", "ACTIVATING"].includes(d.activation.state), d.id + ": unbekannter Aktivierungszustand");
    assert.ok(typeof d.activation.decision === "string" && d.activation.decision.length > 20, d.id + ": ohne Entscheidung");
    assert.equal(d.critical, false, d.id + ": eine nicht freigegebene Datenart ist nie kritisch");
  }
  assert.ok(typeof registry.activation === "string", "Kopf erklaert den Aktivierungszustand");
});

test("Register · jeder genannte Workflow und jedes Erzeugerskript existiert", () => {
  for (const d of registry.domains) {
    for (const wf of String(d.workflow || "").match(/[\w-]+\.yml/g) || []) {
      /* Einzige Ausnahme: eine vorbereitete Datenart, deren (abgeschalteter) Workflow noch in einem offenen PR liegt. */
      if (prepared(d) && !existsSync(join(ROOT, ".github", "workflows", wf))) { assert.match(String(d.activation.pendingWorkflow), /^PR #\d+$/, d.id + ": Workflow " + wf); continue; }
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
    if (prepared(d) || (activating(d) && !existsSync(join(ROOT, d.artifact.slice(1))))) continue; /* Artefakt existiert (noch) nicht */
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

test("Intraday · nach Schluss geholt, aber illiquide Titel ohne letzten Slot: OK (fetchedAfterClose), wirklich fehlender Schluss: STALE", () => {
  const d = registry.domains.find((x) => x.id === "intraday");
  /* Stand vom 09.10.2026: 5.045 von 5.049 Snapshots nach Schluss geholt,
     4.512 mit Kurs im letzten Slot - regularComplete false, Schluss da. */
  const mk = (extra) => ({ generatedAt: "2026-10-02T21:40:00Z", entryCount: 1375,
    dataSession: Object.assign({ sessionDate: "2026-10-02", asOf: "2026-10-02T20:55:00Z", asOfLocal: "16:55", regularComplete: false }, extra),
    displaySession: { isRunning: false }, universeSessions: ["2026-10-02"] });
  assert.equal(run(d, mk({ fetchedAfterClose: true, afterCloseSnapshots: 5045, finalSlotSnapshots: 4512 })).status, "OK");
  const fehlt = run(d, mk({ fetchedAfterClose: false }));
  assert.equal(fehlt.status, "STALE");
  assert.equal(fehlt.reason, "SESSION_NOT_COMPLETED");
  /* Aeltere Verzeichnisse ohne das Feld behalten ihre Lesart. */
  assert.equal(run(d, mk({})).reason, "SESSION_NOT_COMPLETED");
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

test("Gegen die Seite: bewusst nicht ausgelieferte Artefakte sind NOT_DELIVERED, nicht FAILED", () => {
  const d = dom({ repositoryOnly: true });
  const site = Health.evaluate({ domains: [d] }, { "/x.json": { ok: false, error: "HTTP 404" } }, Object.assign(ctx(SAT), { target: "site" }));
  assert.equal(site.domains[0].status, "NOT_DELIVERED");
  assert.equal(site.overall, "OK");
  const repo = Health.evaluate({ domains: [d] }, { "/x.json": { ok: false, error: "fehlt" } }, ctx(SAT));
  assert.equal(repo.domains[0].status, "FAILED");
});

test("Register · repositoryOnly stimmt mit der Release-Regel ueberein", async () => {
  const { permitted } = await import("../../scripts/vu2/build-release.mjs");
  for (const d of registry.domains) {
    const ausgeliefert = permitted(d.artifact.slice(1));
    assert.equal(!!d.repositoryOnly, !ausgeliefert, d.id + ": repositoryOnly=" + !!d.repositoryOnly + ", ausgeliefert=" + ausgeliefert);
  }
});

test("Vorbereitete Datenart · fehlt = DISABLED (NOT_ACTIVATED), liegt vor = FAILED, unlesbar bleibt FAILED", () => {
  const d = dom({ timestamp: [], asOf: ["asOf"], records: "counts.candidates", freshness: { kind: "sessions", warnAfter: 1, staleAfter: 2 }, activation: { state: "PREPARED_DISABLED", decision: "Test" } });
  const missing = Health.evaluate({ domains: [d] }, { "/x.json": { ok: false, error: "fehlt: /x.json" } }, ctx(SAT));
  assert.equal(missing.domains[0].status, "DISABLED"); assert.equal(missing.domains[0].reason, "NOT_ACTIVATED");
  assert.equal(missing.overall, "OK", "zieht die Plattform nicht herunter");
  const site = Health.evaluate({ domains: [d] }, { "/x.json": { ok: false, error: "HTTP 404 /x.json" } }, ctx(SAT));
  assert.equal(site.domains[0].status, "DISABLED");
  for (const error of ["Unexpected token } in JSON", "HTTP 500 /x.json", "ausserhalb des Repositorys: /x.json", undefined]) {
    const r = Health.evaluate({ domains: [d] }, { "/x.json": { ok: false, error } }, ctx(SAT)).domains[0];
    assert.equal(r.status, "FAILED", String(error)); assert.equal(r.reason, "ARTIFACT_UNREADABLE");
  }
  assert.equal(Health.evaluate({ domains: [d] }, {}, ctx(SAT)).domains[0].status, "FAILED", "nicht geladen ist nicht fehlend");
  const published = run(d, { asOf: "2026-10-02", counts: { candidates: 3 } });
  assert.equal(published.status, "FAILED"); assert.equal(published.reason, "PUBLISHED_WITHOUT_ACTIVATION");
  /* ohne den Zustand: dieselbe Datenart ist normal bewertet - fehlt = FAILED, frisch = OK, Zaehlfeld gelesen */
  const active = Object.assign({}, d, { activation: undefined });
  assert.equal(run(active, undefined).status, "FAILED");
  const ok = run(active, { asOf: "2026-10-02", counts: { candidates: 3 } });
  assert.equal(ok.status, "OK"); assert.equal(ok.records, 3);
  assert.equal(run(active, { asOf: "2026-09-28", counts: { candidates: 3 } }).status, "STALE");
});

test("Freigegebene Datenart vor dem ersten Lauf (ACTIVATING) · fehlt = DISABLED, liegt vor = normal bewertet; unbekannter Zustand = FAILED", () => {
  const base = { timestamp: [], asOf: ["asOf"], records: "counts.candidates", freshness: { kind: "sessions", warnAfter: 1, staleAfter: 2 } };
  const d = dom(Object.assign({}, base, { activation: { state: "ACTIVATING", decision: "Test" } }));
  const missing = Health.evaluate({ domains: [d] }, { "/x.json": { ok: false, error: "fehlt: /x.json" } }, ctx(SAT)).domains[0];
  assert.equal(missing.status, "DISABLED"); assert.equal(missing.reason, "AWAITING_FIRST_RUN");
  assert.equal(Health.evaluate({ domains: [d] }, { "/x.json": { ok: false, error: "HTTP 500 /x.json" } }, ctx(SAT)).domains[0].status, "FAILED");
  assert.equal(run(d, { asOf: "2026-10-02", counts: { candidates: 3 } }).status, "OK");
  assert.equal(run(d, { asOf: "2026-09-28", counts: { candidates: 3 } }).status, "STALE");
  const odd = dom(Object.assign({}, base, { activation: { state: "ACTIVE", decision: "Test" } }));
  const r = Health.evaluate({ domains: [odd] }, { "/x.json": { ok: false, error: "fehlt: /x.json" } }, ctx(SAT)).domains[0];
  assert.equal(r.status, "FAILED"); assert.equal(r.reason, "UNKNOWN_ACTIVATION_STATE");
});
