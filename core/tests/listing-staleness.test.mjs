/* Core · eingefrorene Kursenden und Stamm <-> Reihe (core/listing-staleness.js,
   DQ-PX-6/7, DQ-ID-4). Fixtures nach echten V9-Faellen: CHL/ADEX (Kurs nach
   Delisting fortgeschrieben, Stamm ACTIVE), COHR (Stammzeile gehoert dem frueheren
   Ticker-Inhaber), DBRG (Stamm ACTIVE, Reihe nach Uebernahme zu Ende). */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const S = require("../listing-staleness.js");
const DQ = require("../data-quality.js");

const days = (from, n, closeAt) => {
  const out = []; const d = new Date(from + "T00:00:00Z");
  while (out.length < n) { const wd = d.getUTCDay(); if (wd > 0 && wd < 6) out.push([d.toISOString().slice(0, 10), closeAt(out.length)]); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
};
const weeks = (from, n, closeAt) => {
  const out = []; const d = new Date(from + "T00:00:00Z");
  for (let i = 0; i < n; i++) { out.push([d.toISOString().slice(0, 10), closeAt(i)]); d.setUTCDate(d.getUTCDate() + 7); }
  return out;
};
const series = (id, grain, points) => ({ securityId: id, ticker: id.slice(4), grain, to: points[points.length - 1][0], points });
const row = (id, status, end, extra) => Object.assign({ baseline_security_id: id, ticker: id.slice(4), active_status: status, end_date: end }, extra);
const MASTER = { version: "us-security-master-1.1.0", generatedAt: "2026-09-11T00:00:00Z", today: "2026-09-11", rows: [
  row("ref_CHL", "ACTIVE", "2026-09-10"), row("ref_LIQ", "ACTIVE", "2026-09-10"), row("ref_ILQ", "ACTIVE", "2026-09-10"),
  row("ref_COHR", "INACTIVE", "2022-07-01"), row("ref_OLD", "INACTIVE", "2026-01-30"),
  row("ref_DBRG", "ACTIVE", "2026-09-10"), row("ref_MIX", "ACTIVE", "2026-09-10"), row("ref_MIX", "INACTIVE", "2019-05-01")
] };
const idx = S.masterIndex(MASTER);
/* Sitzungsrueckstand: Fixture-Kalender ohne Feiertage */
const lagFn = (date, exp) => { if (date >= exp) return 0; let n = 0; const d = new Date(date + "T00:00:00Z"); while (d.toISOString().slice(0, 10) < exp && n < 60) { d.setUTCDate(d.getUTCDate() + 1); const wd = d.getUTCDay(); if (wd > 0 && wd < 6) n++; } return n; };

test("tailRun · Endlauf exakt gleicher Schluesse, Beginn und Kurs", () => {
  assert.equal(S.tailRun([]), null);
  assert.deepEqual(S.tailRun([["2026-10-01", 1], ["2026-10-02", 2], ["2026-10-05", 2]]), { run: 2, since: "2026-10-02", close: 2, to: "2026-10-05", points: 3 });
  assert.equal(S.tailRun([["2026-10-01", 2.5]]).run, 1);
  assert.equal(S.tailRun([["a", 1.0001], ["b", 1]]).run, 1, "exakter Vergleich, keine Toleranz");
});

test("masterIndex · mehrere Zeilen je ID werden zusammengefasst (active = eine ACTIVE-Zeile)", () => {
  assert.equal(idx.byId.ref_MIX.status, "ACTIVE+INACTIVE");
  assert.equal(idx.byId.ref_MIX.active, true);
  assert.equal(idx.byId.ref_MIX.rows, 2);
  assert.equal(idx.byId.ref_COHR.active, false);
  assert.equal(idx.byId.ref_COHR.maxEnd, "2022-07-01");
  assert.equal(idx.today, "2026-09-11");
});

test("STALE_TAIL · CHL-Fall: Stamm ACTIVE, Reihe endet mit eingefrorenem Kurs - Tag ab 5, Woche ab 4", () => {
  const d = series("ref_CHL", "daily", days("2026-09-01", 40, (i) => (i < 30 ? 20 + i / 10 : 27.51)));
  const f = S.staleTail(d, idx.byId.ref_CHL, S.DEFAULTS.dailyMinRun);
  assert.equal(f.run, 10); assert.equal(f.close, 27.51); assert.equal(f.master, "ACTIVE");
  const vier = series("ref_CHL", "daily", days("2026-09-01", 20, (i) => (i < 16 ? i + 1 : 99)));
  assert.equal(S.staleTail(vier, idx.byId.ref_CHL, 5), null, "4 gleiche Tagesschluesse sind noch kein Befund");
  const w = series("ref_CHL", "weekly", weeks("2025-08-01", 20, (i) => (i < 16 ? 30 - i : 27.51)));
  assert.equal(S.staleTail(w, idx.byId.ref_CHL, S.DEFAULTS.weeklyMinRun).run, 4, "genau an der Schwelle: Befund");
  const w3 = series("ref_CHL", "weekly", weeks("2025-08-01", 20, (i) => (i < 17 ? 30 - i : 27.51)));
  assert.equal(S.staleTail(w3, idx.byId.ref_CHL, 4), null, "3 gleiche Wochen sind noch kein Befund");
});

test("STALE_TAIL · nur bei ACTIVE: inaktive Titel und Titel ohne Stammzeile gehen an DQ-ID-4 bzw. bleiben ungeprueft", () => {
  const flat = series("ref_OLD", "daily", days("2026-09-01", 30, () => 5));
  assert.equal(S.staleTail(flat, idx.byId.ref_OLD, 5), null);
  assert.equal(S.staleTail(flat, undefined, 5), null);
});

test("masterConflict · COHR-Fall: Stamm INACTIVE (frueherer Ticker-Inhaber), Reihe aktuell und beweglich", () => {
  const d = series("ref_COHR", "daily", days("2026-09-01", 40, (i) => 200 + i));
  const c = S.masterConflict(d, idx.byId.ref_COHR, { expectedSession: d.to, lagFn, maxLag: 2, minRun: 5 });
  assert.equal(c.class, "MASTER_INACTIVE_SERIES_CURRENT");
  assert.equal(c.masterEnd, "2022-07-01");
});

test("masterConflict · Stamm INACTIVE, Reihe nach dem Stamm-Ende eingefroren fortgeschrieben", () => {
  const d = series("ref_OLD", "daily", days("2026-01-02", 60, (i) => (i < 15 ? 3 + i : 9.5)));
  assert.equal(S.masterConflict(d, idx.byId.ref_OLD, { expectedSession: d.to, lagFn, maxLag: 2, minRun: 5 }).class, "MASTER_INACTIVE_SERIES_FROZEN");
  const ende = series("ref_OLD", "daily", days("2026-01-02", 20, (i) => 3 + i));
  assert.equal(S.masterConflict(ende, idx.byId.ref_OLD, { expectedSession: "2026-10-27", lagFn, maxLag: 2 }), null, "Reihe endet mit dem Stamm-Ende: kein Widerspruch");
});

test("masterConflict · DBRG-Fall: Stamm ACTIVE, Reihe seit Wochen zu Ende; aktuelle Reihe ist unauffaellig", () => {
  const d = series("ref_DBRG", "daily", days("2026-08-03", 45, (i) => 15 + i / 100));
  const c = S.masterConflict(d, idx.byId.ref_DBRG, { expectedSession: "2026-10-27", lagFn, maxLag: 2 });
  assert.equal(c.class, "MASTER_ACTIVE_SERIES_ENDED");
  assert.ok(c.lag > 2);
  const ok = series("ref_LIQ", "daily", days("2026-09-01", 40, (i) => 10 + i));
  assert.equal(S.masterConflict(ok, idx.byId.ref_LIQ, { expectedSession: ok.to, lagFn, maxLag: 2 }), null);
});

test("DQ-PX-6/7 · Regel zaehlt nur aktive Titel, sortiert nach Lauflaenge, Verteilung ueber alle Reihen", () => {
  const list = [
    series("ref_CHL", "daily", days("2026-09-01", 40, (i) => (i < 10 ? i + 1 : 27.51))),
    series("ref_ILQ", "daily", days("2026-09-01", 40, (i) => (i < 34 ? i + 1 : 4))),
    series("ref_LIQ", "daily", days("2026-09-01", 40, (i) => i + 1)),
    series("ref_OLD", "daily", days("2026-09-01", 40, () => 1)),
    series("ref_NONE", "daily", days("2026-09-01", 40, () => 1))
  ];
  const r = DQ.staleTails(list, idx, S, "daily");
  assert.equal(r.id, "DQ-PX-6"); assert.equal(r.severity, "WARN");
  assert.equal(r.checked, 3); assert.equal(r.failed, 2);
  assert.deepEqual(r.findings.map((f) => [f.securityId, f.run]), [["ref_CHL", 30], ["ref_ILQ", 6]]);
  assert.deepEqual(r.histogram, { 1: 1, 6: 1, "30+": 3 });
  assert.match(r.note, /1 ohne Stammzeile, 1 im Stamm nur INACTIVE/);
  const w = DQ.staleTails([series("ref_CHL", "weekly", weeks("2025-08-01", 8, () => 27.51))], idx, S, "weekly");
  assert.equal(w.id, "DQ-PX-7"); assert.equal(w.minRun, 4);
  assert.match(w.samples[0], /ref_CHL: alle 8 gleiche Wochenschluesse seit 2025-08-01 \(27.51\), Stamm ACTIVE/);
});

test("DQ-ID-4 · Klassen werden gezaehlt, Befunde nach Klasse geordnet; WARN, nie ERROR", () => {
  const cohr = series("ref_COHR", "daily", days("2026-09-01", 40, (i) => 200 + i));
  const dbrg = series("ref_DBRG", "daily", days("2026-08-03", 20, (i) => 15 + i / 100));
  const liq = series("ref_LIQ", "daily", days("2026-09-01", 40, (i) => 10 + i));
  const r = DQ.masterSeriesConsistency([dbrg, cohr, liq], idx, S, cohr.to, lagFn, 2, 5);
  assert.equal(r.severity, "WARN"); assert.equal(r.checked, 3); assert.equal(r.failed, 2);
  assert.deepEqual(r.byClass, { MASTER_ACTIVE_SERIES_ENDED: 1, MASTER_INACTIVE_SERIES_CURRENT: 1 });
  assert.equal(r.findings[0].securityId, "ref_COHR");
  assert.equal(DQ.summarize([r]).overall, "WARN", "nur Bericht: --strict faellt nicht");
});

test("assess · Diagnose je Titel buendelt alle Befunde", () => {
  const daily = series("ref_CHL", "daily", days("2026-09-01", 40, (i) => (i < 10 ? i + 1 : 27.51)));
  const weekly = series("ref_CHL", "weekly", weeks("2025-08-01", 10, () => 27.51));
  const out = S.assess({ state: idx.byId.ref_CHL, daily, weekly }, { expectedSession: daily.to, lagFn });
  assert.deepEqual(out.map((f) => f.kind), ["STALE_TAIL_DAILY", "STALE_TAIL_WEEKLY"]);
  assert.match(out[1].text, /^alle 10 gleiche Wochenschluesse/);
  assert.deepEqual(S.assess({ state: null }).map((f) => f.kind), ["NO_MASTER_ROW"]);
});
