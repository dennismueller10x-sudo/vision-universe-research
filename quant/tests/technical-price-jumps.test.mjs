import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const PJ = require("../engines/technical/price-jumps.js");

/* Tagesbars mit Schlusskursen und Volumen; Datum = 2026-01-01 + i Tage (Wochentage spielen hier keine Rolle). */
function bars(closes, volumes) {
  const d0 = Date.UTC(2026, 0, 1);
  return { timestamps: closes.map((_, i) => new Date(d0 + i * 864e5).toISOString().slice(0, 10)), close: closes, volume: volumes || closes.map(() => 1000) };
}
const flat = (n, v) => Array.from({ length: n }, () => v);

test("Kurssprung: Split-Signatur ist Verdacht, auch bei hohem Volumen", () => {
  const c = flat(40, 1.25).concat(flat(20, 22.7)), v = flat(60, 1000); v[40] = 50000; // x18,16 ~ 18, Volumen x50
  const j = PJ.latest(bars(c, v));
  assert.equal(j.status, "SUSPECT"); assert.equal(j.factor, 18.16); assert.equal(j.splitSignature, true); assert.equal(j.date, "2026-02-10");
});

test("Kurssprung: extremer Faktor bleibt Verdacht, auch bei vielfachem Volumen (Abspaltung, Datenfehler)", () => {
  const c = flat(40, 77.65).concat(flat(20, 12.57)), v = flat(60, 1000); v[40] = 20000; // CTVA-Muster x0,162, Volumen x20
  const j = PJ.latest(bars(c, v));
  assert.equal(j.status, "SUSPECT"); assert.equal(j.splitSignature, false); assert.equal(j.volumeRatio, 20);
  assert.equal(PJ.latest(bars(c, flat(60, 0))).volumeRatio, null, "ohne Volumen kein Verhaeltnis");
});

test("Kurssprung: gewoehnliche Bewegungen (x2,77 ohne Signatur, innerhalb 0,2..5) sind nie auffaellig", () => {
  assert.equal(PJ.latest(bars(flat(30, 62.96).concat([174.38, 175]))), null);
});

test("Kurssprung: korrekt bereinigte Kapitalmassnahme springt nicht und bleibt ohne Kennzeichnung", () => {
  const c = Array.from({ length: 80 }, (_, i) => 30 + i * 0.1); // bereinigt: stetig, Split-Tag ohne Sprung
  assert.equal(PJ.latest(bars(c)), null);
});

test("Kurssprung: bestaetigt nur mit Beleg im Register innerhalb von 5 Sitzungen um den Sprung", () => {
  const c = flat(40, 1.25).concat(flat(20, 22.7)), b = bars(c);
  assert.equal(PJ.latest(b, [{ id: "X", effectiveDate: b.timestamps[39] }]).status, "CONFIRMED");
  assert.equal(PJ.latest(b, [{ id: "X", effectiveDate: b.timestamps[39] }]).confirmation, "X");
  assert.equal(PJ.latest(b, [{ id: "X", effectiveDate: b.timestamps[33] }]).status, "SUSPECT", "7 Sitzungen entfernt");
  assert.equal(PJ.latest(b, []).status, "SUSPECT");
});

test("Kurssprung: Fenster 252 Bars, juengster Sprung zaehlt", () => {
  const old = flat(10, 1).concat(flat(300, 10)); // Sprung x10 bei Index 10, 300 Bars vor dem Ende
  assert.equal(PJ.latest(bars(old)), null);
  assert.equal(PJ.latest(bars(old), null, 400).date, bars(old).timestamps[10]);
  assert.equal(PJ.all(bars(old)).length, 1);
});

test("Kurssprung: Texte unterscheiden Verdacht und bestaetigten Fehler", () => {
  const s = PJ.describe({ date: "2026-06-30", factor: 18.16, status: "SUSPECT", splitSignature: true });
  const c = PJ.describe({ date: "2026-06-30", factor: 18.16, status: "CONFIRMED", splitSignature: true });
  assert.match(s.short, /^Datenverdacht/); assert.match(s.long, /×18,16/); assert.match(s.long, /Split-Signatur/);
  assert.match(c.short, /^Datenfehler bestätigt/); assert.match(c.long, /nicht bereinigte Kapitalmaßnahme/);
  assert.equal(PJ.describe(null), null);
});
