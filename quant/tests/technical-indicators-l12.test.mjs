/* Katalogerweiterung L12 (indicators 1.6.0): 14 Indikatoren gegen eine fremde Referenz auf dem eingefrorenen AAPL-Ausschnitt.
   TA-Lib 0.8.2 (APO, MIDPRICE, TSF, ADXR, STOCHF), pandas-ta 0.4.71b0 (Fisher, RVGI, PVT, VHF, Efficiency Ratio, QStick) und
   TA-Lib-/numpy-Bausteine nach der dokumentierten Formel (Schaff Trend Cycle, Williams Alligator, Williams Fractals).
   Fixture: fixtures/technical-l12-reference-aapl.json, erzeugt mit scripts/technical/build-l12-reference.py.
   Begruendete Startwert-Konventionen stehen in FROM und in docs/technical/INDICATORS_EXTERNAL_REFERENCE.md (L12). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const I = require("../engines/technical/indicators.js");
const ref = JSON.parse(readFileSync(new URL("./fixtures/technical-reference-aapl.json", import.meta.url), "utf8"));
const R = JSON.parse(readFileSync(new URL("./fixtures/technical-l12-reference-aapl.json", import.meta.url), "utf8"));
const N = ref.close.length;
const L12 = ["apo", "midprice", "tsf", "adxr", "stochFast", "fisher", "stc", "rvgi", "pvt", "vhf", "efficiencyRatio", "qstick", "alligator", "fractals"];

const TOL = 1e-8;
const close = (e, t) => Math.abs(e - t) <= TOL * Math.max(1, Math.abs(t));
const cache = {};
function engine(key) {
  const [id, part] = key.split(".");
  cache[id] = cache[id] || I.compute(ref, id).values;
  return part ? cache[id][part] : cache[id];
}

/* ADXR erbt die ADX-Startwert-Konvention (ADX gleich ab Bar 264, ADXR nutzt ADX₋₁₃): gleich ab Bar 274.
   TA-Lib gibt die schnelle %K erst ab der ersten %D-Bar aus (15), die Engine schon ab 13. */
const FROM = { adxr: 274, "stochFast.k": 15 };

test("Version, Katalog und Fixture", () => {
  assert.equal(I.INDICATORS_VERSION, "technical-indicators-1.6.0");
  assert.equal(I.CATALOG.length, 92);
  for (const id of L12) {
    const e = I.catalogEntry(id);
    assert.ok(e && e.catalogOnly === true, id + ": nur Katalog, keine Produktflaeche");
    assert.ok(e.definition && typeof e.warmup === "function", id);
  }
  assert.equal(R.bars, N);
  assert.deepEqual([R.libraries.talib, R.libraries.pandas_ta], ["0.8.2", "0.4.71b0"]);
  assert.deepEqual([...new Set(Object.keys(R.series).map((k) => k.split(".")[0]))].sort(), [...L12].sort());
});

for (const [key, r] of Object.entries(R.series)) {
  const from = FROM[key] ?? FROM[key.split(".")[0]] ?? 0;
  test("gleich der Referenz ab Bar " + from + ": " + key + " (" + r.source + ")", () => {
    const eng = engine(key), t = r.values, bad = [];
    assert.equal(eng.length, N);
    let compared = 0;
    for (let i = from; i < N; i++) {
      const e = eng[i], v = t[i];
      if (v === null || !Number.isFinite(e)) { if ((v === null) !== !Number.isFinite(e)) bad.push(i + ":Aufwaermung"); continue; }
      compared++;
      if (!close(e, v)) bad.push(i + ":" + e + "≠" + v);
    }
    assert.deepEqual(bad.slice(0, 5), [], key);
    assert.equal(compared, t.slice(from).filter((v) => v !== null).length, key + ": alle Referenzwerte verglichen");
    /* Fraktale sind selten (je ~40 im Ausschnitt), ADXR wegen der geerbten Konvention kuerzer. */
    assert.ok(compared >= (key.startsWith("fractals") ? 30 : 40), key + ": nur " + compared + " Bars verglichen");
  });
}

test("Startwert-Konventionen wirken und sind begrenzt", () => {
  const a = engine("adxr"), t = R.series.adxr.values;
  let differ = 0;
  for (let i = 40; i < 274; i++) if (!close(a[i], t[i])) differ++;
  assert.ok(differ > 0, "ADXR: die geerbte ADX-Konvention wirkt tatsaechlich");
  const gap = (i) => Math.abs(a[i] - t[i]);
  assert.ok(gap(41) > gap(150) && gap(150) > gap(260), "ADXR: die Abweichung klingt ab");
  const adx = I.compute(ref, "adx").values.adx;
  for (let i = 40; i < N; i++) assert.ok(Math.abs(a[i] - (adx[i] + adx[i - 13]) / 2) < 1e-12, "ADXR = (ADX + ADX₋₁₃)/2 an Bar " + i);
  const k = engine("stochFast.k"), raw = I.compute(ref, "stochastic").values.raw;
  for (let i = 13; i < N; i++) assert.equal(k[i], raw[i], "schnelle %K = rohe %K der Stochastik");
});

test("Kein Vorgriff: jeder Wert an Bar i haengt nur von Bars ≤ i ab", () => {
  const cut = (s, upto) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Array.isArray(v) ? v.slice(0, upto + 1) : v]));
  for (const upto of [120, 200, 280]) {
    const part = cut(ref, upto);
    for (const id of L12) {
      const full = I.compute(ref, id).values, short = I.compute(part, id).values;
      const pairs = Array.isArray(full) ? [[full, short]] : Object.keys(full).map((p) => [full[p], short[p]]);
      for (const [f, s] of pairs) for (let i = 0; i <= upto; i++) {
        assert.ok(Object.is(f[i], s[i]) || (Number.isNaN(f[i]) && Number.isNaN(s[i])), id + " Bar " + i + " Stand " + upto);
      }
    }
  }
});

test("Fraktale erscheinen erst zwei Bars nach dem Extrem, mit dessen Preis", () => {
  const f = engine("fractals.upPrice"), flag = engine("fractals.up");
  const i = f.findIndex((v) => Number.isFinite(v));
  assert.ok(i >= 4);
  assert.equal(f[i], ref.high[i - 2]);
  for (const j of [i - 4, i - 3, i - 1, i]) assert.ok(ref.high[i - 2] > ref.high[j]);
  /* Merker 1/0 ab Bar 4, 1 genau dort, wo ein Preis steht. */
  for (let k = 4; k < N; k++) assert.equal(flag[k], Number.isFinite(f[k]) ? 1 : 0, "Bar " + k);
});
