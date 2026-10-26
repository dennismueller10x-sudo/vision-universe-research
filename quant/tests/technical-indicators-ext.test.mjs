/* Referenztests fuer die Katalogerweiterung technical-indicators-1.1.0
   (Williams %R, Aroon, Chaikin Money Flow, VWMA, Ichimoku, Parabolic SAR).

   Wie technical-indicators.test.mjs: Jede Formel wird gegen eine naive,
   unabhaengig geschriebene Implementierung auf dem realen AAPL-Ausschnitt
   geprueft; Parabolic SAR und Aroon zusaetzlich an einem von Hand
   gerechneten Beispiel, weil ihre Zustandslogik (Umkehr, Gleichstand) sich
   naiv kaum anders schreiben laesst. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const I = require("../engines/technical/indicators.js");
const ref = JSON.parse(readFileSync(new URL("./fixtures/technical-reference-aapl.json", import.meta.url), "utf8"));
const S = { open: ref.open, high: ref.high, low: ref.low, close: ref.close, volume: ref.volume };

const fin = Number.isFinite;
function near(a, b, eps = 1e-9) { if (!fin(a) && !fin(b)) return true; return fin(a) && fin(b) && Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)); }
function same(actual, expected, label, eps) {
  assert.equal(actual.length, expected.length, label + ": Laenge");
  for (let i = 0; i < expected.length; i++) assert.ok(near(actual[i], expected[i], eps), `${label}[${i}]: ${actual[i]} != ${expected[i]}`);
}
const win = (x, i, n) => x.slice(i - n + 1, i + 1);
const nMax = (x, n) => x.map((_, i) => i < n - 1 ? NaN : Math.max(...win(x, i, n)));
const nMin = (x, n) => x.map((_, i) => i < n - 1 ? NaN : Math.min(...win(x, i, n)));

test("Williams %R = −100·(HH−C)/(HH−LL), Bereich −100..0 (AAPL real)", () => {
  const hh = nMax(S.high, 14), ll = nMin(S.low, 14);
  const want = S.close.map((c, i) => fin(hh[i]) ? -100 * (hh[i] - c) / (hh[i] - ll[i]) : NaN);
  const got = I.compute(S, "williamsR").values;
  same(got, want, "%R14");
  assert.ok(got.filter(fin).every((v) => v >= -100 && v <= 0));
  assert.equal(I.williamsR([5, 5], [5, 5], [5, 5], 2)[1], -50, "keine Spanne: Mitte");
});

test("Chaikin Money Flow und VWMA nach Definition (AAPL real)", () => {
  const mfv = S.close.map((c, i) => S.volume[i] * ((c - S.low[i]) - (S.high[i] - c)) / (S.high[i] - S.low[i]));
  const sum = (x, i, n) => win(x, i, n).reduce((a, b) => a + b, 0);
  same(I.compute(S, "cmf").values, S.close.map((_, i) => i < 19 ? NaN : sum(mfv, i, 20) / sum(S.volume, i, 20)), "CMF20");
  const pv = S.close.map((c, i) => c * S.volume[i]);
  same(I.compute(S, "vwma").values, S.close.map((_, i) => i < 19 ? NaN : sum(pv, i, 20) / sum(S.volume, i, 20)), "VWMA20");
  assert.ok(I.compute(S, "cmf").values.filter(fin).every((v) => v >= -1 && v <= 1));
  assert.equal(I.cmf([2], [2], [2], [100], 1)[0], 0, "H = L: Multiplikator 0");
  assert.ok(Number.isNaN(I.vwma([1, 2], [0, 0], 2)[1]), "ohne Volumen kein Wert");
});

test("Ichimoku: Mitten von Hoch/Tief, Wolke um 26 Bars verschoben und kausal (AAPL real)", () => {
  const mid = (n) => nMax(S.high, n).map((h, i) => (h + nMin(S.low, n)[i]) / 2);
  const t9 = mid(9), k26 = mid(26), b52 = mid(52), a = t9.map((t, i) => (t + k26[i]) / 2);
  const r = I.compute(S, "ichimoku").values;
  same(r.tenkan, t9, "Tenkan"); same(r.kijun, k26, "Kijun"); same(r.spanA, a, "Senkou A"); same(r.spanB, b52, "Senkou B");
  same(r.cloudA, a.map((_, i) => i < 26 ? NaN : a[i - 26]), "Wolke A");
  same(r.cloudB, b52.map((_, i) => i < 26 ? NaN : b52[i - 26]), "Wolke B");
  assert.equal(r.chikou, undefined, "keine Chikou-Linie (zeigt Zukunft)");
});

test("Aroon: Hand-Beispiel mit Gleichstand (juengstes Extrem zaehlt) und Referenz auf AAPL", () => {
  const r = I.aroon([1, 3, 2, 2, 1], [5, 4, 4, 6, 7], 2);
  assert.deepEqual(r.up.slice(2), [50, 0, 50]);
  assert.deepEqual(r.down.slice(2), [100, 50, 0]);
  assert.deepEqual(r.oscillator.slice(2), [-50, -50, 50]);
  const n = 25, got = I.compute(S, "aroon").values;
  for (let i = n; i < S.high.length; i += 7) {
    const h = S.high.slice(i - n, i + 1), l = S.low.slice(i - n, i + 1);
    const hiAt = h.lastIndexOf(Math.max(...h)), loAt = l.lastIndexOf(Math.min(...l));
    assert.ok(near(got.up[i], 100 * hiAt / n) && near(got.down[i], 100 * loAt / n), "Aroon[" + i + "]");
  }
});

test("Parabolic SAR: Hand-Beispiel mit Beschleunigung, Begrenzung und Umkehr", () => {
  const H = [10, 11, 12, 12.5, 12, 10], L = [9, 9.5, 10.5, 11, 8.5, 8], C = [9.5, 10.5, 11.5, 12, 9, 8.2];
  const r = I.psar(H, L, C, 0.02, 0.2);
  /* 1: Aufwaerts (10,5 > 9,5), SAR = tiefstes Tief 9, EP 11.
     2: 9 + 0,02·2 = 9,04, begrenzt durch L0 = 9 → 9; neues Hoch 12 → AF 0,04.
     3: 9 + 0,04·3 = 9,12; neues Hoch 12,5 → AF 0,06.
     4: 9,12 + 0,06·3,38 = 9,3228; Tief 8,5 bricht → Umkehr, SAR = EP 12,5, EP 8,5.
     5: 12,5 + 0,02·(8,5 − 12,5) = 12,42, begrenzt durch H3 = 12,5 → 12,5. */
  same(r.sar, [NaN, 9, 9, 9.12, 12.5, 12.5], "SAR");
  assert.deepEqual(r.direction.slice(1), [1, 1, 1, -1, -1]);
});

test("Parabolic SAR auf AAPL: SAR liegt nie im Kursbereich, auch an Umkehrbars (seit 1.2.1), AF-Grenze haelt", () => {
  const r = I.compute(S, "psar").values;
  let flips = 0;
  for (let i = 2; i < S.close.length; i++) {
    if (r.direction[i] !== r.direction[i - 1]) flips++;
    if (r.direction[i] > 0) assert.ok(r.sar[i] <= S.low[i] + 1e-9, "lang, SAR ueber Tief bei " + i);
    else assert.ok(r.sar[i] >= S.high[i] - 1e-9, "kurz, SAR unter Hoch bei " + i);
  }
  assert.ok(flips > 5, "reale Reihe kehrt mehrfach: " + flips);
  assert.equal(I.compute(S, "psar", { step: 0.02, max: 0.2 }).error, undefined, "Bruchparameter erlaubt");
  assert.equal(I.compute(S, "psar", { step: -1 }).error, "INVALID_PARAM:step");
});

test("Luecken: neue Indikatoren liefern NaN statt 0 und rechnen nach der Luecke weiter", () => {
  const gap = Object.fromEntries(Object.entries(S).map(([k, v]) => [k, v.map((x, i) => i === 150 ? null : x)]));
  for (const id of ["williamsR", "cmf", "vwma", "aroon", "psar"]) {
    const v = I.compute(gap, id).values, main = Array.isArray(v) ? v : v.up || v.sar;
    assert.ok(Number.isNaN(main[150]), id + " an der Luecke");
    assert.ok(fin(main[S.close.length - 1]), id + " danach");
  }
});
