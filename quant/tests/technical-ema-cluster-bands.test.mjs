/* EMA-Cluster-Baender in chartSeries (technical-analysis.js, includeChartSeries):
   emaFastMin/-Max und emaSlowMin/-Max je Bar aus der vollen Historie, dieselbe Rechnung wie ema-cluster.js#calculate,
   rein additiv (alle bisherigen chartSeries-Spalten und Bundle-Felder unveraendert). Anzeige: Technical „EMA-Bänder“. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Analysis = require("../engines/technical/technical-analysis.js");
const Canonical = require("../engines/technical/canonical-bars.js");
const Cluster = require("../engines/technical/ema-cluster.js");
const METH = { technical: JSON.parse(readFileSync(join(ROOT, "quant/methodology/technical-v1.json"), "utf8")),
  elliott: JSON.parse(readFileSync(join(ROOT, "quant/methodology/elliott-v1.json"), "utf8")) };
const BANDS = ["emaFastMin", "emaFastMax", "emaSlowMin", "emaSlowMax"];

/* Fixture statt Live-Artefakt (core/tests/test-inputs.test.mjs): echte AAPL-Tagesbalken, 315 Bars. */
const AAPL = JSON.parse(readFileSync(join(ROOT, "quant/tests/fixtures/technical-reference-aapl.json"), "utf8"));
function golden() {
  const rows = AAPL.date.map((d, i) => ({ date: d, open: AAPL.open[i], high: AAPL.high[i], low: AAPL.low[i], close: AAPL.close[i], volume: AAPL.volume[i] }));
  return Canonical.fromRows(rows, { instrumentId: "AAPL", exchange: "US", currency: "USD", timeframe: "1D", priceSeriesType: "SPLIT_ADJUSTED", source: "test", sourceRevision: "fixture" });
}
const opts = { elliott: false, annotations: false, includeChartSeries: true };
const r4 = (x) => Math.round(x * 1e4) / 1e4;

test("EMA-Bänder: je Bar gleich ema-cluster.js#calculate auf der vollen Historie (4 Nachkommastellen)", () => {
  const series = golden(), n = series.length;
  const cs = Analysis.analyze({ series, methodology: METH, options: opts }).chartSeries;
  const rows = Cluster.calculate({ asOf: String(series.timestamps[n - 1]).slice(0, 10), bars: series.timestamps.map((t, i) => ({ date: String(t).slice(0, 10), close: series.close[i] })) }).rows;
  for (const k of BANDS) assert.equal(cs[k].length, n, k);
  rows.forEach((r, i) => {
    assert.equal(cs.emaFastMin[i], r.fast ? r4(r.fast.min) : null);
    assert.equal(cs.emaFastMax[i], r.fast ? r4(r.fast.max) : null);
    assert.equal(cs.emaSlowMin[i], r.slow ? r4(r.slow.min) : null);
    assert.equal(cs.emaSlowMax[i], r.slow ? r4(r.slow.max) : null);
  });
  /* Nach der Anlaufzeit lueckenlos bis zum Stichtag, Minimum nie ueber Maximum. */
  const first = cs.emaSlowMin.findIndex(Number.isFinite);
  assert.ok(first > 0 && first < n - 50, "Anlauf " + first);
  for (const k of BANDS) assert.ok(cs[k].slice(first).every(Number.isFinite), k + " hat Luecken nach der Anlaufzeit");
  for (let i = first; i < n; i++) { assert.ok(cs.emaFastMin[i] <= cs.emaFastMax[i]); assert.ok(cs.emaSlowMin[i] <= cs.emaSlowMax[i]); }
});

test("EMA-Bänder: rein additiv, alle bisherigen Felder unverändert und deterministisch", () => {
  const series = golden();
  const b = Analysis.analyze({ series, methodology: METH, options: opts });
  const without = JSON.parse(JSON.stringify(b));
  for (const k of BANDS) delete without.chartSeries[k];
  /* SMA 150 (18.11.2026): gleich der Engine-SMA, Laenge wie die Reihe. */
  const s150 = without.chartSeries.sma150; delete without.chartSeries.sma150;
  assert.equal(s150.length, series.length);
  const ref150 = series.close.map((_, i) => i < 149 ? null : r4(series.close.slice(i - 149, i + 1).reduce((a, x) => a + x, 0) / 150));
  s150.forEach((v, i) => { if (ref150[i] === null) assert.equal(v, null, "SMA 150 im Anlauf " + i); else assert.ok(Math.abs(v - ref150[i]) < 1e-3, "SMA 150 an " + i); });
  assert.deepEqual(Object.keys(without.chartSeries), ["sma20", "sma50", "sma200", "atr", "rsi14", "relativeVolume", "ema20", "ema50", "ema200"]);
  const plain = Analysis.analyze({ series, methodology: METH, options: { elliott: false, annotations: false, includeChartSeries: false } });
  delete without.chartSeries;
  assert.equal(JSON.stringify(without), JSON.stringify(plain), "Bundle ohne chartSeries muss gleich bleiben");
  assert.equal(JSON.stringify(Analysis.analyze({ series, methodology: METH, options: opts })), JSON.stringify(b));
});
