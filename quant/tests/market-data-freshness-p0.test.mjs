/* =========================================================================
   MARKET DATA FRESHNESS P0 (24.09.2026)

   Der Befund: Tageskurse Stand 18.09., erwartet 23.09.; Intraday 23.09.
   vorhanden, aber als STALE gemeldet; im Browser trotzdem Kurse vom
   Vortag. Drei Ursachen, drei Gruppen von Tests:

   FP1-FP3  Freshness-Vertrag und Quellzustand sagen fuer einen
            illiquiden Titel, der nach dem Schluss geholt wurde, dasselbe
            (vorher: STALE/closeMissing hier, FINAL_SESSION im Browser).
   FP4      Der Ingest schreibt den Nach-Schluss-Stand auch dann, wenn
            sich die Punkte seit Mittag nicht geaendert haben.
   FC1-FC12 check-freshness.mjs gegen ein Fixture-Root: urteilt nach den
            Reihen, meldet ein abweichendes Summary eigens, trennt
            Tageskurse und Intraday, kennt Wochenende, Feiertag,
            verkuerzte Sitzung und offene Boerse.

   Die dritte Ursache (ein an Live-Daten gezaehlter Test warf die frischen
   Tageskurse weg) steht in market-signal-contract.test.mjs.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const T = require("../engines/realtime/trading-session.js");
const F = require("../engines/realtime/freshness.js");
const SS = require("../engines/realtime/source-state.js");
const Snapshot = require("../engines/realtime/intraday-snapshot.js");
const CAL = require("../config/market-calendar.json");

const r = (iso) => T.resolve(iso, { calendar: CAL });
const snap = (sessionDate, lastRegularLocal, extra) => Object.assign({
  symbol: "RFAI", securityId: "ref_RFAI", provider: "tiingo", venue: "IEX", interval: "5min",
  sessionDate, asOfLocal: lastRegularLocal, lastRegularLocal, closeLocal: "16:00",
  asOf: T.localToUtc(sessionDate, lastRegularLocal, "America/New_York"),
  points: [["09:30", 10], [lastRegularLocal, 10.1]], isComplete: true
}, extra || {});

/* Der reale Fall RFAI am 23.09.2026: letzter Handel 10:55, nichts danach. */
const NACH_SCHLUSS = "2026-09-24T01:24:00Z";   // 21:24 New York, Boerse zu

test("FP1 · Illiquide, nach Schluss geholt: Vertrag LAST_SESSION wie der Quellzustand FINAL_SESSION", () => {
  const s = snap("2026-09-23", "10:55", { fetchedAfterClose: true, coversFinalSlot: false, regularComplete: false });
  const f = F.assess({ resolution: r(NACH_SCHLUSS), series: s, kind: "intraday", calendar: CAL });
  const q = SS.bestimme({ resolution: r(NACH_SCHLUSS), snapshot: s, now: NACH_SCHLUSS });
  assert.equal(f.freshnessState, "LAST_SESSION");
  assert.equal(f.reason, "sessionCompleteNoLateTrades");
  assert.equal(q.state, "FINAL_SESSION");
  assert.equal(q.reason, "sessionCompleteNoLateTrades");
  /* Kein erfundener Schluss um 16:00. */
  assert.equal(f.label.label, "Heute · Schluss · letzter Kurs 10:55");
  assert.equal(f.label.label, q.label);
});

test("FP2 · Gegenprobe: am Mittag geholt, Schluss vorbei -> beide Vertraege STALE/closeMissing", () => {
  const s = snap("2026-09-23", "10:55", { fetchedAfterClose: false, coversFinalSlot: false, regularComplete: false });
  const f = F.assess({ resolution: r(NACH_SCHLUSS), series: s, kind: "intraday", calendar: CAL });
  const q = SS.bestimme({ resolution: r(NACH_SCHLUSS), snapshot: s, now: NACH_SCHLUSS });
  assert.equal(f.freshnessState, "STALE");
  assert.equal(f.reason, "closeMissing");
  assert.equal(q.state, "STALE");
  assert.equal(q.reason, "closeMissing");
});

test("FP3 · Aeltere Snapshots ohne fetchedAfterClose behalten ihre Lesart (regularComplete)", () => {
  const alt = snap("2026-09-23", "10:55", { regularComplete: false });
  delete alt.fetchedAfterClose;
  assert.equal(F.assess({ resolution: r(NACH_SCHLUSS), series: alt, kind: "intraday", calendar: CAL }).reason, "closeMissing");
  const altFertig = snap("2026-09-23", "15:55", { regularComplete: true });
  assert.equal(F.assess({ resolution: r(NACH_SCHLUSS), series: altFertig, kind: "intraday", calendar: CAL }).reason, "lastCompletedSession");
});

test("FP4 · Gleiche Punkte, aber jetzt nach Schluss geholt: das ist eine Aenderung und wird geschrieben", () => {
  const mittag = snap("2026-09-23", "10:55", { fetchedAfterClose: false, coversFinalSlot: false, regularComplete: false });
  const abend = snap("2026-09-23", "10:55", { fetchedAfterClose: true, coversFinalSlot: false, regularComplete: false });
  assert.equal(Snapshot.merge(mittag, abend).reason, "refreshed");
  assert.equal(Snapshot.unchanged(mittag, abend), false);
  /* Gegenprobe: zweimal nach Schluss, gleiche Punkte -> nichts zu schreiben. */
  assert.equal(Snapshot.unchanged(abend, Object.assign({}, abend)), true);
  /* Und neue Punkte bleiben eine Aenderung. */
  assert.equal(Snapshot.unchanged(mittag, Object.assign({}, mittag, { points: [["09:30", 10], ["10:55", 10.2]] })), false);
  /* Der Ingest benutzt genau diese Entscheidung. */
  const ingest = readFileSync(join(ROOT, "scripts", "market", "ingest-intraday.mjs"), "utf8");
  assert.match(ingest, /m\.reason === "refreshed" && Snapshot\.unchanged\(vorher, snap\)/);
});

/* ------------------------------------------------ check-freshness.mjs */

const SYMBOLE = ["AAPL", "NVDA", "NBIS", "RFAI"];

function fixtureRoot({ seriesTo, summaryAsOf, intraday }) {
  const dir = mkdtempSync(join(tmpdir(), "vu-freshness-"));
  mkdirSync(join(dir, "quant"), { recursive: true });
  symlinkSync(join(ROOT, "quant", "engines"), join(dir, "quant", "engines"));
  symlinkSync(join(ROOT, "quant", "config"), join(dir, "quant", "config"));
  const w = (rel, obj) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), JSON.stringify(obj)); };
  w("discover/data/meta.json", { generatedAt: "x", universes: [{ universeId: "US_REAL", provider: "tiingo", asOf: summaryAsOf }] });
  w("discover/data/live-scope/US_REAL.json", { symbols: SYMBOLE });
  w("quant/data/market/discover-series/index.json", { count: SYMBOLE.length });
  for (const s of SYMBOLE) w("quant/data/market/discover-series/ref_" + s + ".json", { securityId: "ref_" + s, to: seriesTo, asOf: seriesTo, provider: "tiingo" });
  const i = intraday;
  const entries = {};
  for (const s of SYMBOLE) {
    entries[s] = { securityId: "ref_" + s, sessionDate: i.sessionDate, asOf: T.localToUtc(i.sessionDate, i.asOfLocal, "America/New_York"),
                   asOfLocal: i.asOfLocal, regularComplete: s === "RFAI" ? false : i.regularComplete,
                   fetchedAfterClose: i.fetchedAfterClose, lastRegularLocal: s === "RFAI" ? "10:55" : i.asOfLocal };
  }
  const ds = { sessionDate: i.sessionDate, asOf: T.localToUtc(i.sessionDate, i.asOfLocal, "America/New_York"), asOfLocal: i.asOfLocal,
               regularComplete: false, snapshots: 5196, universe: true };
  if (i.fetchedAfterClose !== undefined) ds.fetchedAfterClose = i.fetchedAfterClose;
  w("quant/data/market/intraday/index.json", { schemaVersion: "intraday-index-1.1.0", generatedAt: "x", dataSession: ds,
                                                universeSessions: [i.sessionDate], entries });
  return dir;
}

function pruefe(now, fixture) {
  const dir = fixtureRoot(fixture);
  try {
    const p = spawnSync(process.execPath, [join(ROOT, "scripts", "market", "check-freshness.mjs"), "--root=" + dir, "--now=" + now, "--strict"],
                        { encoding: "utf8" });
    const report = JSON.parse(readFileSync(join(dir, "quant", "data", "market", "freshness", "health.json"), "utf8"));
    return { exit: p.status, report, out: p.stdout + p.stderr };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const VORBOERSE_24 = "2026-09-24T11:55:00Z";   // Donnerstag 07:55 New York
const nachSchluss = (sessionDate) => ({ sessionDate, asOfLocal: "16:55", regularComplete: true, fetchedAfterClose: true });

test("FC1 · Session-Wahrheit: Donnerstag vor der Boerse erwartet Mittwoch, nicht 'heute minus eins' am Montag", () => {
  const { report } = pruefe(VORBOERSE_24, { seriesTo: "2026-09-23", summaryAsOf: "2026-09-23", intraday: nachSchluss("2026-09-23") });
  assert.equal(report.market.state, "PRE_MARKET");
  assert.equal(report.market.lastCompletedSession, "2026-09-23");
  /* Montag frueh: erwartet Freitag - currentDate-1 waere Sonntag. */
  const mo = pruefe("2026-09-21T11:00:00Z", { seriesTo: "2026-09-18", summaryAsOf: "2026-09-18", intraday: nachSchluss("2026-09-18") });
  assert.equal(mo.report.market.lastCompletedSession, "2026-09-18");
  assert.equal(mo.report.overall, "OK");
  /* Dienstag nach Labor Day: erwartet Freitag, 04.09. */
  const ld = pruefe("2026-09-08T11:00:00Z", { seriesTo: "2026-09-04", summaryAsOf: "2026-09-04", intraday: nachSchluss("2026-09-04") });
  assert.equal(ld.report.market.lastCompletedSession, "2026-09-04");
  assert.equal(ld.report.overall, "OK");
});

test("FC2 · Beide aktuell -> OK, --strict Exit 0", () => {
  const { exit, report } = pruefe(VORBOERSE_24, { seriesTo: "2026-09-23", summaryAsOf: "2026-09-23", intraday: nachSchluss("2026-09-23") });
  assert.equal(report.overall, "OK", JSON.stringify(report.findings));
  assert.equal(report.daily.state, "LAST_SESSION");
  assert.equal(report.intraday.state, "OK");
  assert.equal(exit, 0);
});

test("FC3 · Der gemessene Fall: EOD 18.09. + Intraday 23.09. -> Tageskurse STALE, Intraday OK, getrennt berichtet", () => {
  const { exit, report } = pruefe(VORBOERSE_24, { seriesTo: "2026-09-18", summaryAsOf: "2026-09-18", intraday: nachSchluss("2026-09-23") });
  assert.equal(report.daily.state, "STALE");
  assert.equal(report.daily.basis, "series");
  assert.equal(report.intraday.state, "OK");
  assert.equal(report.findings.length, 1, JSON.stringify(report.findings));
  assert.match(report.findings[0], /^Tageskurse STALE/);
  assert.equal(exit, 2);
});

test("FC4 · Intraday-Aggregat: illiquide Titel ohne 15:55-Kurs machen die Sitzung nicht STALE (Gegenprobe: vor Schluss geholt schon)", () => {
  const illiquid = { sessionDate: "2026-09-23", asOfLocal: "16:55", regularComplete: true, fetchedAfterClose: true };
  const ok = pruefe(VORBOERSE_24, { seriesTo: "2026-09-23", summaryAsOf: "2026-09-23", intraday: illiquid });
  assert.equal(ok.report.intraday.dataState, "LAST_SESSION");
  assert.equal(ok.report.intraday.state, "OK");
  const mittag = pruefe(VORBOERSE_24, { seriesTo: "2026-09-23", summaryAsOf: "2026-09-23",
                                        intraday: { sessionDate: "2026-09-23", asOfLocal: "12:00", regularComplete: false, fetchedAfterClose: false } });
  assert.equal(mittag.report.intraday.state, "STALE");
  assert.equal(mittag.report.intraday.dataReason, "closeMissing");
});

test("FC5 · Aktuelle Reihen + altes Summary -> Tageskurse nicht STALE, aber der Widerspruch ist ein eigener Befund", () => {
  const { report } = pruefe(VORBOERSE_24, { seriesTo: "2026-09-23", summaryAsOf: "2026-09-18", intraday: nachSchluss("2026-09-23") });
  assert.equal(report.daily.state, "LAST_SESSION");
  assert.equal(report.daily.summaryState, "STALE");
  assert.equal(report.daily.summaryContradictsSeries, true);
  assert.equal(report.findings.length, 1);
  assert.match(report.findings[0], /^Summary widerspricht den Reihen/);
  assert.ok(!report.findings.some((f) => /^Tageskurse STALE/.test(f)));
});

test("FC6 · Aktuelles Summary + alte Reihen (Auslieferungsrueckstand) -> STALE, das Summary kaschiert es nicht", () => {
  const { report } = pruefe(VORBOERSE_24, { seriesTo: "2026-09-18", summaryAsOf: "2026-09-23", intraday: nachSchluss("2026-09-23") });
  assert.equal(report.daily.state, "STALE");
  assert.equal(report.daily.summaryState, "LAST_SESSION");
  assert.ok(report.findings.some((f) => /^Tageskurse STALE/.test(f)));
  assert.ok(report.findings.some((f) => /^Summary widerspricht/.test(f)));
});

test("FC7 · Beide stale -> zwei Befunde", () => {
  const { report } = pruefe(VORBOERSE_24, { seriesTo: "2026-09-18", summaryAsOf: "2026-09-18", intraday: nachSchluss("2026-09-22") });
  assert.equal(report.daily.state, "STALE");
  assert.equal(report.intraday.state, "STALE");
  assert.ok(report.findings.some((f) => /^Tageskurse STALE/.test(f)));
  assert.ok(report.findings.some((f) => /^Intraday STALE/.test(f)));
});

test("FC8 · Boerse offen: laufende Sitzung frisch, Tageskurse vom Vortag -> OK; kein Realtime wird behauptet", () => {
  const offen = "2026-09-24T15:00:00Z";   // 11:00 New York
  const { report } = pruefe(offen, { seriesTo: "2026-09-23", summaryAsOf: "2026-09-23",
                                     intraday: { sessionDate: "2026-09-24", asOfLocal: "10:55", regularComplete: false, fetchedAfterClose: false } });
  assert.equal(report.market.state, "OPEN");
  assert.equal(report.intraday.dataState, "LIVE");
  assert.equal(report.daily.state, "LAST_SESSION");
  assert.equal(report.overall, "OK", JSON.stringify(report.findings));
  /* Gegenprobe: der Stand von 10:55 um 14:00 ist stehen geblieben. */
  const spaeter = pruefe("2026-09-24T18:00:00Z", { seriesTo: "2026-09-23", summaryAsOf: "2026-09-23",
                                                   intraday: { sessionDate: "2026-09-24", asOfLocal: "10:55", regularComplete: false, fetchedAfterClose: false } });
  assert.equal(spaeter.report.intraday.state, "STALE");
});

test("FC9 · Wochenende: Samstag erwartet Freitag; Donnerstag ist dann einen Tag zu alt", () => {
  const sa = "2026-09-26T15:00:00Z";
  assert.equal(pruefe(sa, { seriesTo: "2026-09-25", summaryAsOf: "2026-09-25", intraday: nachSchluss("2026-09-25") }).report.overall, "OK");
  const alt = pruefe(sa, { seriesTo: "2026-09-24", summaryAsOf: "2026-09-24", intraday: nachSchluss("2026-09-25") });
  assert.equal(alt.report.daily.state, "STALE");
});

test("FC10 · Feiertag: an Thanksgiving (26.11.) ist Mittwoch aktuell", () => {
  const { report } = pruefe("2026-11-26T17:00:00Z", { seriesTo: "2026-11-25", summaryAsOf: "2026-11-25", intraday: nachSchluss("2026-11-25") });
  assert.equal(report.market.lastCompletedSession, "2026-11-25");
  assert.equal(report.overall, "OK", JSON.stringify(report.findings));
});

test("FC11 · Verkuerzte Sitzung (27.11., Schluss 13:00): um 15:00 ist der 27.11. die erwartete Sitzung", () => {
  const { report } = pruefe("2026-11-27T20:00:00Z", { seriesTo: "2026-11-27", summaryAsOf: "2026-11-27",
                                                      intraday: { sessionDate: "2026-11-27", asOfLocal: "13:55", regularComplete: true, fetchedAfterClose: true } });
  assert.equal(report.market.lastCompletedSession, "2026-11-27");
  assert.equal(report.overall, "OK", JSON.stringify(report.findings));
});

test("FC12 · Falscher Session-Tag: Tageskurse zwei Sitzungen alt sind nie 'Schluss folgt'", () => {
  const { report } = pruefe(VORBOERSE_24, { seriesTo: "2026-09-21", summaryAsOf: "2026-09-21", intraday: nachSchluss("2026-09-23") });
  assert.equal(report.daily.state, "STALE");
  assert.equal(report.daily.sample.byReason.olderThanLastSession, SYMBOLE.length);
});
