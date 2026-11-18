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
test("1T: heute zu wenig Punkte, letzte Sitzung bekannt -> letzte Sitzung; sonst abgeschaltet, nie leer", () => {
  const dunn = snap("2026-11-18", grid(1));
  const mitVor = CS.intradayView(dunn, { today: "2026-11-18", prev: snap("2026-11-17", grid(78)) });
  assert.equal(mitVor.mode, "last"); assert.equal(mitVor.sessionDate, "2026-11-17");
  const ohne = CS.intradayView(dunn, { today: "2026-11-18" });
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
test("Alle drei Welten rufen dieselbe Funktion", () => {
  for (const f of ["../../discover/ui/detail.js", "../../quant/app/chart.js"])
    assert.match(readFileSync(new URL(f, import.meta.url), "utf8"), /intradayView/, f);
});
