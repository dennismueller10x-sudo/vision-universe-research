/* Klinger Volume Oscillator (technical-indicators-1.5.0, L2 abgeschlossen).
   TA-Lib hat kein Gegenstueck. Referenz: eine zweite, naive Umsetzung der dokumentierten Definition
   (StockCharts) mit eigener EMA (SMA-Startwert), Bar fuer Bar auf echten AAPL-Kursen; dazu Kleinstbeispiel. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const I = require("../engines/technical/indicators.js");
const ref = JSON.parse(readFileSync(new URL("./fixtures/technical-reference-aapl.json", import.meta.url), "utf8"));
const S = { open: ref.open, high: ref.high, low: ref.low, close: ref.close, volume: ref.volume };

function emaNaive(x, n) {
  const out = x.map(() => NaN), k = 2 / (n + 1);
  let start = x.findIndex(Number.isFinite);
  if (start < 0 || start + n > x.length) return out;
  let e = 0; for (let i = start; i < start + n; i++) e += x[i];
  e /= n; out[start + n - 1] = e;
  for (let i = start + n; i < x.length; i++) { e = Number.isFinite(x[i]) ? (x[i] - e) * k + e : e; out[i] = e; }
  return out;
}
function klingerNaive({ high: H, low: L, close: C, volume: V }, f = 34, s = 55, g = 13) {
  const n = C.length, vf = Array(n).fill(NaN);
  let prev = 0, cm = NaN;
  for (let i = 1; i < n; i++) {
    const t = H[i] + L[i] + C[i] > H[i - 1] + L[i - 1] + C[i - 1] ? 1 : -1, dm = H[i] - L[i];
    cm = t === prev ? cm + dm : (H[i - 1] - L[i - 1]) + dm;
    prev = t;
    if (cm > 0) vf[i] = V[i] * Math.abs(2 * dm / cm - 1) * t * 100;
  }
  const a = emaNaive(vf, f), b = emaNaive(vf, s), kvo = a.map((v, i) => v - b[i]);
  return { kvo, signal: emaNaive(kvo, g) };
}

test("Klinger: Bar fuer Bar gleich einer zweiten, naiven Umsetzung (echte AAPL-Kurse)", () => {
  const e = I.compute(S, "klinger").values, r = klingerNaive(S);
  for (const k of ["kvo", "signal"]) for (let i = 0; i < r[k].length; i++) {
    if (!Number.isFinite(r[k][i])) { assert.ok(!Number.isFinite(e[k][i]), k + "[" + i + "] Aufwaermung"); continue; }
    assert.ok(Math.abs(e[k][i] - r[k][i]) <= 1e-6 * Math.max(1, Math.abs(r[k][i])), k + "[" + i + "]: " + e[k][i] + " ≠ " + r[k][i]);
  }
  assert.equal(e.kvo.findIndex(Number.isFinite), 55, "erster Wert an Bar slow = 55");
  assert.equal(e.signal.findIndex(Number.isFinite), 67);
});

test("Klinger: Kleinstbeispiel und Vorzeichen", () => {
  /* Steigende typische Preise: Trend +1, gleicher Trend kumuliert cm; VF positiv. */
  const s = { high: [10, 11, 12, 13], low: [9, 10, 11, 12], close: [9.5, 10.5, 11.5, 12.5], volume: [100, 100, 100, 100] };
  const vf1 = 100 * Math.abs(2 * 1 / 2 - 1) * 100;        /* i=1: Start wie Trendwechsel, cm = dm0 + dm1 = 2 → |2·1/2 − 1| = 0 */
  const vf2 = 100 * Math.abs(2 * 1 / 3 - 1) * 100;        /* i=2: gleicher Trend, cm = 2 + 1 = 3 */
  const r = I.compute(s, "klinger", { fast: 1, slow: 1, signal: 1 }).values;
  assert.equal(r.kvo[1], 0, "EMA_1 − EMA_1 = 0");
  const one = I.compute(s, "klinger", { fast: 1, slow: 2, signal: 1 }).values;
  assert.ok(Math.abs(one.kvo[2] - (vf2 - (vf1 + vf2) / 2)) < 1e-9);
  /* Fallende Preise: negatives VF. */
  const d = { high: [13, 12, 11], low: [12, 11, 10], close: [12.5, 11.5, 10.5], volume: [100, 100, 100] };
  const dn = I.compute(d, "klinger", { fast: 1, slow: 2, signal: 1 }).values;
  assert.ok(dn.kvo[2] <= 0);
});

test("Vertrag 1.5.0: Klinger nur im Katalog, 78 Eintraege, Produktflaechen unveraendert", () => {
  assert.equal(I.INDICATORS_VERSION, "technical-indicators-1.5.0");
  const e = I.catalogEntry("klinger");
  assert.ok(e && e.catalogOnly === true && e.definition && e.family === "VOLUME");
  assert.equal(I.CATALOG.length, 78);
  assert.equal(I.CATALOG.filter((x) => !x.catalogOnly).length, 24, "gelistete Indikatoren unveraendert");
});
