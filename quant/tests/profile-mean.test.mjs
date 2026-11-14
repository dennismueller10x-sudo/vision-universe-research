/* Gesamtwert (vu-profile-mean-1.0.0): einfacher Durchschnitt, mindestens 4, Platz 1 = hoechster Wert. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const PM = require("../engines/profile-mean.js");

test("Durchschnitt nur aus vorhandenen Werten, ohne Gewichtung", () => {
  const m = PM.mean([40, 60, null, 80, undefined, 100]);
  assert.deepEqual(m, { state: "AVAILABLE", reason: null, score: 70, count: 4 });
  assert.equal(PM.mean([10, 20, 30, 40, 50, 60]).score, 35);
});
test("weniger als vier Werte: nicht genug Daten, keine Zahl", () => {
  const m = PM.mean([90, 80, 70, null, null, null]);
  assert.equal(m.state, "UNAVAILABLE"); assert.equal(m.score, null); assert.equal(m.count, 3);
  assert.equal(PM.mean([]).state, "UNAVAILABLE");
});
test("Plaetze: 1 = hoechster Wert, gleiche Werte teilen den Platz", () => {
  const r = PM.places({ A: 50, B: 70, C: 50, D: 10, E: null });
  assert.deepEqual(r.places, { B: 1, A: 2, C: 2, D: 4 });
  assert.equal(r.total, 4);
});
test("Methodenversion und Satz zur Rueckwaertspruefung", () => {
  assert.equal(PM.VERSION, "vu-profile-mean-1.0.0");
  assert.match(PM.NO_ADVANTAGE_SENTENCE, /nicht besser als der Markt/);
  assert.match(readFileSync(new URL("../app/page-ranking.js", import.meta.url), "utf8"), /nicht besser als der Markt/);
});
test("Rangliste nennt nichts Empfehlungsnahes und liest die Pflicht-Hinweise", () => {
  const src = readFileSync(new URL("../app/page-ranking.js", import.meta.url), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//, ""); /* Kopfkommentar nennt die Verbote */
  assert.doesNotMatch(code, /beste Aktien|Top.?Pick|Kaufempfehlung|Kaufsignal/i);
  assert.match(src, /legal\("ranking"\)/);
});
