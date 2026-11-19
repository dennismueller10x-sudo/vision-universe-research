/* Chart-Historie im Technical-Produktartefakt (product-materialization.js#chartHistory, Owner 19.11.2026):
   rein additiv neben `bars` und `bundle`; HISTORY_DAILY_BARS Tageskerzen unmittelbar VOR dem Anzeigefenster (Anlaufzeit)
   und die ganze Reihe als Wochenkerzen je ISO-Woche, beides aus derselben SPLIT_ADJUSTED-Reihe wie `bars`. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Product = require("../engines/technical/product-materialization.js");
const Analysis = require("../engines/technical/technical-analysis.js");
const Canonical = require("../engines/technical/canonical-bars.js");
const METH = { technical: JSON.parse(readFileSync(join(ROOT, "quant/methodology/technical-v1.json"), "utf8")),
  elliott: JSON.parse(readFileSync(join(ROOT, "quant/methodology/elliott-v1.json"), "utf8")) };
const AAPL = JSON.parse(readFileSync(join(ROOT, "quant/tests/fixtures/technical-reference-aapl.json"), "utf8"));
function series() {
  const rows = AAPL.date.map((d, i) => ({ date: d, open: AAPL.open[i], high: AAPL.high[i], low: AAPL.low[i], close: AAPL.close[i], volume: AAPL.volume[i] }));
  return Canonical.fromRows(rows, { instrumentId: "AAPL", exchange: "US", currency: "USD", timeframe: "1D", priceSeriesType: "SPLIT_ADJUSTED", source: "test", sourceRevision: "fixture" });
}
const r4 = (x) => Math.round(x * 1e4) / 1e4;

test("Chart-Historie: Tageskerzen unmittelbar vor dem Anzeigefenster, lückenlos anschließend an bars", () => {
  const s = series();
  const bundle = Analysis.analyze({ series: s, methodology: METH, options: { elliott: false, annotations: false, includeChartSeries: true } });
  const a = Product.project({ ticker: "AAPL", securityId: "ref_AAPL", series: s, bundle, provenance: { observedAt: "2026-01-01T00:00:00Z" } });
  const h = a.history, d = h.daily, from = a.bars.fromIndex;
  assert.equal(h.schemaVersion, Product.HISTORY_SCHEMA);
  assert.equal(d.timestamps.length, Math.min(from, Product.HISTORY_DAILY_BARS));
  for (const k of ["open", "high", "low", "close", "volume"]) assert.equal(d[k].length, d.timestamps.length, k);
  const start = from - d.timestamps.length;
  d.timestamps.forEach((t, i) => {
    assert.equal(t, String(s.timestamps[start + i]).slice(0, 10));
    assert.equal(d.close[i], r4(s.close[start + i]));
    assert.equal(d.low[i], r4(s.low[start + i]));
  });
  if (d.timestamps.length) assert.ok(d.timestamps.at(-1) < String(a.bars.timestamps[0]).slice(0, 10), "endet vor dem Fenster");
  /* bars und bundle bleiben, was sie waren. */
  const plain = Product.project({ ticker: "AAPL", securityId: "ref_AAPL", series: s, bundle, provenance: { observedAt: "2026-01-01T00:00:00Z" } });
  delete plain.history;
  const again = JSON.parse(JSON.stringify(a)); delete again.history;
  assert.deepEqual(Object.keys(a).filter((k) => k !== "history"), Object.keys(plain));
  assert.equal(JSON.stringify(again), JSON.stringify(JSON.parse(JSON.stringify(plain))));
});

test("Chart-Historie: Wochenkerzen je ISO-Woche (Eröffnung erster, Hoch/Tief über alle, Schluss letzter Tag, Volumen Summe)", () => {
  const s = series(), w = Product.weeklyBars(s);
  const weeks = new Map();
  s.timestamps.forEach((t, i) => { const k = Product.isoWeek(t); if (!weeks.has(k)) weeks.set(k, []); weeks.get(k).push(i); });
  assert.equal(w.timestamps.length, weeks.size);
  [...weeks.values()].forEach((idx, n) => {
    assert.equal(w.timestamps[n], String(s.timestamps[idx.at(-1)]).slice(0, 10));
    assert.equal(w.open[n], r4(s.open[idx[0]]));
    assert.equal(w.close[n], r4(s.close[idx.at(-1)]));
    assert.equal(w.high[n], r4(Math.max(...idx.map((i) => s.high[i]))));
    assert.equal(w.low[n], r4(Math.min(...idx.map((i) => s.low[i]))));
    assert.equal(w.volume[n], Math.round(idx.reduce((a, i) => a + s.volume[i], 0)));
  });
  assert.equal(Product.isoWeek("2021-01-03"), "2020-W53");
  assert.equal(Product.isoWeek("2027-01-01"), "2026-W53");
  assert.equal(Product.isoWeek("2026-11-19"), "2026-W47");
});
