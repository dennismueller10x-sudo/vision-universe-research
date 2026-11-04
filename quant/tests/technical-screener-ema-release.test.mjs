/* screen-row 1.15.0: aboveEma20/aboveEma50 nur, wenn die Materialisierung die EMA-Linie am Stichtag freigibt
   (bundle.chartSeries.emaP[t] gesetzt, ema-settled, docs/technical/EMA200_MATERIALIZATION.md). Chart Studio zeichnet
   genau diese Linie (technical/app.js: X.cs.emaP || X.ind.emaP). Referenz: echte AAPL-Tagesbars (Fixture). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Row = require("../engines/technical/screen-row.js");

const ref = JSON.parse(readFileSync(new URL("./fixtures/technical-reference-aapl.json", import.meta.url), "utf8"));
const k = ref.date.length, from = k - 270, pick = (a) => a.slice(from, k);
const bars = { timestamps: pick(ref.date), open: pick(ref.open), high: pick(ref.high), low: pick(ref.low), close: pick(ref.close), volume: pick(ref.volume) };
const c = bars.close[269];
const features = { ema20: c * 0.98, ema50: c * 1.02 };
const line = (last) => bars.close.map((_, i) => (i === 269 ? last : 1));
const row = (chartSeries) => Row.computeRow({ ticker: "AAPL", bars, features, chartSeries });

test("Version ab 1.15.0", () => assert.match(Row.ROW_VERSION, /1\.(1[5-9]|[2-9]\d)\.\d+$/));

test("Freigegebene Linie: Vergleich mit dem Vollhistorien-Wert aus featuresAtCutoff", () => {
  const r = row({ ema20: line(features.ema20), ema50: line(features.ema50) });
  assert.equal(r.aboveEma20, true);
  assert.equal(r.aboveEma50, false);
});

test("Linie am Stichtag nicht freigegeben (INSUFFICIENT_HISTORY): Feld leer, nie aus dem unsicheren Wert", () => {
  const r = row({ ema20: line(features.ema20), ema50: line(null) });
  assert.equal(r.aboveEma20, true);
  assert.equal(r.aboveEma50, null);
  assert.equal(row({ ema20: line(null), ema50: line(features.ema50) }).aboveEma20, null);
});

test("Ohne chartSeries oder mit fremder Laenge (aeltere Buendel): Wert aus featuresAtCutoff wie bis 1.14.0", () => {
  for (const cs of [null, {}, { ema50: [1, 2, 3] }]) {
    const r = row(cs);
    assert.equal(r.aboveEma20, true);
    assert.equal(r.aboveEma50, false);
  }
  assert.equal(Row.computeRow({ ticker: "AAPL", bars, features: {}, chartSeries: null }).aboveEma50, null);
});
