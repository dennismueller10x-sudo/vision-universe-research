/* Zeitraeume aus echten Schlusskursen (V4 §13-14): Wochenschluss je
   ISO-Woche, Naht zwischen Wochen- und Tagesreihe, Kalender-Ausschnitte.
   Kein Punkt entsteht, keiner wird verschoben. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const S = require("../engines/series-sampling.js");

/* Handelstage September 2026: Mo 7. ist Feiertag; Fr 11., Mo 14. ... */
const tage = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-08", "2026-09-09", "2026-09-10",
              "2026-09-11", "2026-09-14", "2026-09-15", "2026-09-16"];
const daily = tage.map((d, i) => [d, 100 + i]);

test("SS1 · ISO-Wochen: Donnerstag bestimmt das Jahr, Sonntag gehoert zur Vorwoche", () => {
  assert.equal(S.isoWeekKey("2026-09-11"), "2026-W37");
  assert.equal(S.isoWeekKey("2026-09-13"), "2026-W37");
  assert.equal(S.isoWeekKey("2026-09-14"), "2026-W38");
  assert.equal(S.isoWeekKey("2027-01-01"), "2026-W53");
  assert.equal(S.isoWeekKey("2024-12-30"), "2025-W01");
});

test("SS2 · weeklyPoints: der letzte Handelstag jeder Woche, Feiertagswoche ohne Montag bleibt eine Woche", () => {
  const w = S.weeklyPoints(daily);
  assert.deepEqual(w, [["2026-09-04", 103], ["2026-09-11", 107], ["2026-09-16", 110]]);
  /* Ungueltige Punkte werden uebersprungen, nicht erfunden. */
  assert.deepEqual(S.weeklyPoints([["2026-09-01", null], ["2026-09-02", 5], [null, 6]]), [["2026-09-02", 5]]);
});

test("SS3 · mergeWeeklyWithDaily: vorne Wochen, hinten Tagesreihe als Wochen, letzter Punkt = juengster Schluss", () => {
  const weekly = [["2026-08-21", 90], ["2026-08-28", 91], ["2026-09-04", 92], ["2026-09-11", 93]];
  const m = S.mergeWeeklyWithDaily(weekly, daily.slice(4));   /* Tagesreihe ab 08.09. */
  assert.deepEqual(m, [["2026-08-21", 90], ["2026-08-28", 91], ["2026-09-04", 92],
                       ["2026-09-11", 107], ["2026-09-16", 110]]);
  /* Naht: die Woche 37 kommt aus der Tagesreihe (frischer), nicht doppelt. */
  assert.equal(m.filter((p) => S.isoWeekKey(p[0]) === "2026-W37").length, 1);
  /* Ohne Tagesreihe: die Wochenreihe unveraendert. */
  assert.deepEqual(S.mergeWeeklyWithDaily(weekly, []), weekly);
  /* Mitten in der Woche: der letzte Tagespunkt steht als letzter Punkt. */
  const m2 = S.mergeWeeklyWithDaily(weekly, daily.slice(4, 10));
  assert.deepEqual(m2[m2.length - 1], ["2026-09-15", 109]);
});

test("SS4 · sliceRange nach Kalender: 1W sind sieben Tage plus Startlinie, MAX alles, unbekannt wirft", () => {
  const w = S.sliceRange(daily, "1W", "2026-09-16");
  /* Sieben Tage zurueck (09.09.) plus der Handelstag davor als Startlinie. */
  assert.deepEqual(w.points.map((p) => p[0]), ["2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-14", "2026-09-15", "2026-09-16"]);
  assert.equal(w.complete, true);
  const m = S.sliceRange(daily, "1M", "2026-09-16");
  assert.equal(m.points.length, daily.length);
  assert.equal(m.complete, false, "die Reihe reicht nicht einen Monat zurueck");
  const max = S.sliceRange(daily, "MAX");
  assert.equal(max.points.length, daily.length);
  assert.equal(max.from, "2026-09-01");
  assert.throws(() => S.sliceRange(daily, "2W"));
  assert.deepEqual(S.sliceRange([], "1M").points, []);
});

test("SS5 · Fuenf Jahre aus einer Wochenreihe: 260 Wochen, kein Punkt ausserhalb", () => {
  const punkte = [];
  const start = Date.UTC(2015, 0, 2);
  for (let i = 0; i < 620; i++) punkte.push([new Date(start + i * 7 * 86400000).toISOString().slice(0, 10), 50 + i * 0.1]);
  const r = S.sliceRange(punkte, "5Y");
  assert.ok(r.points.length >= 260 && r.points.length <= 263, String(r.points.length));
  assert.ok(r.points.every((p) => p[0] >= "2021-11-01"));
  assert.equal(r.complete, true);
});
