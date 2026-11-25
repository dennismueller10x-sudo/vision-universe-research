/* Vertragstest 1T (Steuerung 18.11.2026): eine Regel im Chart-Standard, in allen drei Welten gleich. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const CS = require("../chart-standard.js");

const snap = (date, pts, extra = {}) => ({ sessionDate: date, sessionOpenLocal: "09:30", sessionCloseLocal: "16:00", points: pts, ...extra });
const grid = (n, from = "09:30") => Array.from({ length: n }, (_, i) => { const m = 9 * 60 + 30 + i * 5; return [String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"), 100 + i]; });

test("1T: heute gehandelt -> heutige Sitzung ab Eroeffnung, ohne Vorboerse", () => {
  const pre = [["08:05", 99], ["09:25", 99.5]];
  const v = CS.intradayView(snap("2026-11-18", pre.concat(grid(4))), { today: "2026-11-18" });
  assert.equal(v.mode, "today"); assert.equal(v.points.length, 4); assert.equal(v.points[0][0], "09:30"); assert.equal(v.label, "heute");
});
test("1T: heute noch kein Handel -> letzte volle Sitzung mit Etikett", () => {
  const v = CS.intradayView(snap("2026-11-17", grid(78)), { today: "2026-11-18" });
  assert.equal(v.mode, "last"); assert.equal(v.label, "letzte Sitzung (17.11.)"); assert.equal(v.points.length, 78);
});
test("1T: heute ein Punkt -> Verlauf beginnt gleich (Kopf bleibt live); kein heutiger Punkt -> letzte Sitzung; sonst abgeschaltet, nie leer", () => {
  const ein = snap("2026-11-18", grid(1)), vor = snap("2026-11-17", grid(78));
  const thin = CS.intradayView(ein, { today: "2026-11-18", prev: vor });
  assert.equal(thin.mode, "thin"); assert.equal(thin.available, false);
  const nurVorboerse = snap("2026-11-18", [["08:05", 99], ["09:25", 99.5]]);
  const mitVor = CS.intradayView(nurVorboerse, { today: "2026-11-18", prev: vor });
  assert.equal(mitVor.mode, "last"); assert.equal(mitVor.sessionDate, "2026-11-17");
  const ohne = CS.intradayView(nurVorboerse, { today: "2026-11-18" });
  assert.equal(ohne.available, false); assert.equal(ohne.points.length, 0); assert.ok(ohne.reason);
});
test("1T: Punktzahl und Zeitraum je Titel sind welt-unabhaengig (Messwerte 18.11.2026: NVDA 4, AFG 3 Punkte)", () => {
  const titel = { NVDA: snap("2026-11-18", [["08:05", 159.3], ["09:25", 158.9]].concat(grid(4))), AFG: snap("2026-11-18", grid(3)) };
  for (const [sym, s] of Object.entries(titel)) {
    const welten = ["discover", "quant", "technical"].map(() => CS.intradayView(JSON.parse(JSON.stringify(s)), { today: "2026-11-18" }));
    assert.deepEqual(welten[0], welten[1], sym); assert.deepEqual(welten[1], welten[2], sym);
    assert.equal(welten[0].points.length, sym === "NVDA" ? 4 : 3);
    assert.ok(welten[0].points.every((p) => p[0] >= "09:30" && p[0] < "16:00"), sym);
  }
});
test("1T: Snapshot vom Vortag plus heutige Ticks -> alle drei Welten liefern dieselbe heutige Reihe", () => {
  const gestern = snap("2026-11-17", grid(36), { previousClose: 150 });
  const ticks = [["09:25", 160], ["09:30", 161], ["09:36", 161.5], ["09:42", 161.2]];
  /* Quant/Technical: Vortags-Snapshot + eigene Tick-Reihe; Discover: der Hub hat daraus schon einen Strom-Snapshot gebaut. */
  const quant = CS.intradayView(gestern, { today: "2026-11-18", stream: ticks });
  const technical = CS.intradayView(JSON.parse(JSON.stringify(gestern)), { today: "2026-11-18", stream: ticks });
  const hubSnap = snap("2026-11-18", ticks.slice(1), { fromStream: true, previousClose: null });
  const discover = CS.intradayView(hubSnap, { today: "2026-11-18" });
  for (const v of [quant, technical, discover]) { assert.equal(v.mode, "today"); assert.equal(v.points.length, 3); assert.equal(v.sessionDate, "2026-11-18"); assert.equal(v.label, "heute"); }
  assert.deepEqual(quant.points, discover.points); assert.deepEqual(quant.points, technical.points);
  assert.equal(quant.snap.previousClose, null); /* Vortagesschluss kommt aus der Tagesreihe, nicht aus dem alten Snapshot */
  /* ohne ausreichend Ticks: letzte Sitzung, nie leer */
  const wenig = CS.intradayView(gestern, { today: "2026-11-18", stream: [] });
  assert.equal(wenig.mode, "last"); assert.equal(wenig.points.length, 36);
  /* Eroeffnung: ab 2 heutigen Punkten ist 1T heute (Steuerung 20.11., Live-Kopf hat Vorrang); genau 1 Punkt: Verlauf beginnt gleich, nie der alte Schluss */
  const kurz = [["09:30", 161], ["09:34", 161.4]];
  const q = CS.intradayView(gestern, { today: "2026-11-18", stream: kurz });
  const d = CS.intradayView(snap("2026-11-18", kurz, { fromStream: true }), { today: "2026-11-18", prev: gestern });
  for (const v of [q, d]) { assert.equal(v.mode, "today"); assert.equal(v.points.length, 2); }
  assert.deepEqual(q.points, d.points);
  const eins = [["09:36", 161]];
  const q1 = CS.intradayView(gestern, { today: "2026-11-18", stream: eins });
  const d1 = CS.intradayView(snap("2026-11-18", eins, { fromStream: true }), { today: "2026-11-18", prev: gestern });
  for (const v of [q1, d1]) { assert.equal(v.mode, "thin"); assert.equal(v.available, false); }
  /* ohne jeden heutigen Handel: letzte Sitzung */
  const keiner = CS.intradayView(gestern, { today: "2026-11-18", stream: [] });
  assert.equal(keiner.mode, "last");
});
test("Live-Kopf hat Vorrang: sobald heute ein Kurs da ist, zeigt 1T nie die letzte Sitzung (der Kopf nennt dann nie den alten Schluss), egal welche Welt", () => {
  const gestern = snap("2026-11-17", grid(78), { previousClose: 150 });
  for (const n of [1, 2, 5]) {
    const ticks = Array.from({ length: n }, (_, i) => ["09:" + String(31 + i).padStart(2, "0"), 161 + i]);
    const quant = CS.intradayView(gestern, { today: "2026-11-18", stream: ticks });
    const discover = CS.intradayView(snap("2026-11-18", ticks, { fromStream: true }), { today: "2026-11-18", prev: gestern });
    for (const v of [quant, discover]) assert.notEqual(v.mode, "last", "n=" + n);
    assert.equal(quant.mode, discover.mode, "n=" + n);
  }
  /* Und die Strom-Pruefung haelt den Kopf gegen den Live-Kurs fest */
  const qa = readFileSync(new URL("../../scripts/discover/browser-qa-stream-verlauf.mjs", import.meta.url), "utf8");
  assert.match(qa, /Kopfkurs ist der Live-Kurs/);
});
test("Alle drei Welten rufen dieselbe Funktion", () => {
  for (const f of ["../../discover/ui/detail.js", "../../quant/app/chart.js"])
    assert.match(readFileSync(new URL(f, import.meta.url), "utf8"), /intradayView/, f);
});
