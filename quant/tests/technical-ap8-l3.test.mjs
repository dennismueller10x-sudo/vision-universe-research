/* AP8 L3: Abstand zum 52-Wochen-Tief (screen-row.js 1.12.0, technical-query.js 1.12.0, query-text.js 1.9.0,
   docs/technical/SCREENER_FIELDS_AP8_L3.md). Schluss / tiefstes Tagestief der letzten 252 Handelstage - 1. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const Row = require(join(root, "quant/engines/technical/screen-row.js"));
const Q = require(join(root, "quant/engines/technical/technical-query.js"));
const QT = require(join(root, "quant/engines/technical/query-text.js"));

function bars(closes) {
  const ts = closes.map((_, i) => new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10));
  return { timestamps: ts, open: closes, high: closes.map((c) => c * 1.01), low: closes.map((c) => c * 0.99), close: closes, volume: closes.map(() => 1e6) };
}

test("L3: Wert aus dem Feature-Store der Materialisierung, gerundet wie distHigh52w; ohne Wert leer", () => {
  const b = bars(Array.from({ length: 260 }, (_, i) => 10 + i * 0.1));
  const r = Row.computeRow({ ticker: "TST", bars: b, features: { distanceTo52wLow: 0.311134, distanceTo52wHigh: -0.11501, low52w: 164.27 }, series: null });
  assert.equal(r.distLow52w, 0.3111);
  assert.equal(r.distHigh52w, -0.115);
  assert.equal(Row.computeRow({ ticker: "TST", bars: b, features: {}, series: null }).distLow52w, null);
});

test("L3: Abfragefeld und Wortsuche (auch die Kriterien-Formulierungen der Trendvorlage)", () => {
  const f = Q.field("distLow52w"); assert.ok(f); assert.deepEqual(f.tfs, ["1D"]); assert.equal(f.kind, "pct");
  const p = (t) => QT.parse(t).query.groups[0].filters;
  assert.deepEqual(p("Abstand zum 52-Wochen-Tief mindestens 30 %"), [{ field: "distLow52w", op: "gte", value: 0.3, id: p("Abstand zum 52-Wochen-Tief mindestens 30 %")[0].id }]);
  const a = p("mindestens 30 % über dem 52-Wochen-Tief")[0]; assert.deepEqual([a.field, a.op, a.value], ["distLow52w", "gte", 0.3]);
  const h = p("höchstens 25 % unter dem 52-Wochen-Hoch")[0]; assert.deepEqual([h.field, h.op, h.value], ["distHigh52w", "gte", -0.25]);
  // bestehende Phrasen unveraendert
  assert.deepEqual([p("neues 52-Wochen-Tief")[0].field, p("52-Wochen-Hoch")[0].field], ["newLow52w", "newHigh52w"]);
});

test("L3: Datensatz - Spalte = Schluss / tiefstes Tagestief (252) - 1 auf den Bars, nie negativ, eingefroren leer", () => {
  const c = JSON.parse(readFileSync(join(root, "technical/data/screener-v1.json"), "utf8")).cols;
  if (!c.distLow52w) return;
  const pos = new Map(c.s.map((t, i) => [t, i])), dir = join(root, "quant/data/product/technical-signals-v1");
  let checked = 0;
  for (const file of readdirSync(dir).filter((x) => /^[A-Z0-9_-]{2}\.json\.gz$/.test(x)).sort().slice(0, 40)) {
    const inst = JSON.parse(gunzipSync(readFileSync(join(dir, file)))).instruments || {};
    for (const [tk, x] of Object.entries(inst)) {
      const i = pos.get(tk); if (i === undefined || c.frozenSince[i]) continue;
      /* nur Titel, deren Zeile auf denselben Bars beruht (Datensatz und Materialisierung koennen einen Tag auseinander liegen) */
      if (c.asOf[i] !== String(x.bars.timestamps[x.bars.timestamps.length - 1]).slice(0, 10)) continue;
      const b = x.bars, n = b.low.length, lo = Math.min(...b.low.slice(Math.max(0, n - 252))), want = b.close[n - 1] / lo - 1;
      assert.ok(Math.abs(c.distLow52w[i] - want) <= 5e-5 + 1e-4 * Math.abs(want), tk + " " + c.distLow52w[i] + " vs " + want);
      checked++;
    }
  }
  assert.ok(checked > 200, "geprueft: " + checked);
  for (let i = 0; i < c.s.length; i++) {
    if (c.frozenSince[i]) assert.equal(c.distLow52w[i], null, c.s[i]);
    else if (c.distLow52w[i] !== null) assert.ok(c.distLow52w[i] >= 0, c.s[i]);
  }
});
