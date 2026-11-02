/* AP8 L1: SMA 150 im Screener (screen-row.js 1.12.0, technical-query.js 1.12.0, docs/technical/SCREENER_FIELDS_AP8_L1.md).
   Rechnung aus den veroeffentlichten Tagesbars, beide Seiten jedes Vergleichs aus derselben Quelle, leer ohne 150 Bars,
   leer bei eingefrorener Reihe; bestehende Felder unveraendert. */
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
const I = require(join(root, "quant/engines/technical/indicators.js"));

function bars(closes) {
  const ts = closes.map((_, i) => new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10));
  return { timestamps: ts, open: closes, high: closes.map((c) => c * 1.01), low: closes.map((c) => c * 0.99), close: closes, volume: closes.map(() => 1e6) };
}
const row = (closes) => Row.computeRow({ ticker: "TST", bars: bars(closes), features: {}, series: null });

test("L1: SMA 150 aus den Tagesbars, Vergleiche aus derselben Quelle", () => {
  const up = Array.from({ length: 270 }, (_, i) => 10 + i * 0.1);
  const r = row(up), t = up.length - 1;
  const s = (p) => I.compute(bars(up), "sma", { period: p }).values[t];
  assert.equal(r.aboveSma150, up[t] > s(150));
  assert.equal(r.sma150AboveSma200, s(150) > s(200));
  assert.equal(r.sma50AboveSma150, s(50) > s(150));
  assert.ok(Math.abs(r.distSma150 - (up[t] / s(150) - 1)) < 1e-4);
  assert.deepEqual([r.aboveSma150, r.sma150AboveSma200, r.sma50AboveSma150], [true, true, true]);
  const down = up.slice().reverse(), d = row(down);
  assert.deepEqual([d.aboveSma150, d.sma150AboveSma200, d.sma50AboveSma150], [false, false, false]);
});

test("L1: ohne ausreichende Historie leer, nie geraten", () => {
  const r160 = row(Array.from({ length: 160 }, (_, i) => 10 + i));
  assert.equal(typeof r160.aboveSma150, "boolean");
  assert.equal(r160.sma150AboveSma200, null, "SMA 200 braucht 200 Bars");
  const r120 = row(Array.from({ length: 120 }, (_, i) => 10 + i));
  assert.deepEqual([r120.aboveSma150, r120.sma150AboveSma200, r120.sma50AboveSma150, r120.distSma150], [null, null, null, null]);
});

test("L1: Abfragefelder, Wortsuche und Vertrag", () => {
  for (const id of ["aboveSma150", "sma150AboveSma200", "sma50AboveSma150", "distSma150"]) {
    const f = Q.field(id); assert.ok(f, id); assert.deepEqual(f.tfs, ["1D"]); assert.equal(f.group, "Trend");
  }
  const p = (t) => QT.parse(t).query.groups[0].filters[0];
  assert.deepEqual([p("über der SMA 150").field, p("SMA 150 über SMA 200").field, p("SMA 50 über SMA 150").field, p("Abstand zur SMA 150 kleiner 5 %").field],
    ["aboveSma150", "sma150AboveSma200", "sma50AboveSma150", "distSma150"]);
  // bestehende Begriffe unveraendert
  assert.equal(p("über der SMA 50").field, "aboveSma50");
  assert.equal(p("SMA 50 über SMA 200").field, "sma50AboveSma200");
});

test("L1: Datensatz - Spalte = SMA 150 der veroeffentlichten Bars, eingefroren leer", () => {
  const sc = JSON.parse(readFileSync(join(root, "technical/data/screener-v1.json"), "utf8")), c = sc.cols;
  if (!c.aboveSma150) return; // Datensatz vor 1.12.0
  const pos = new Map(c.s.map((t, i) => [t, i])), dir = join(root, "quant/data/product/technical-signals-v1");
  let checked = 0;
  for (const file of readdirSync(dir).filter((x) => /^[A-Z0-9_-]{2}\.json\.gz$/.test(x)).sort().slice(0, 40)) {
    const inst = JSON.parse(gunzipSync(readFileSync(join(dir, file)))).instruments || {};
    for (const [tk, x] of Object.entries(inst)) {
      const i = pos.get(tk); if (i === undefined || c.frozenSince[i]) continue;
      /* nur Titel, deren Zeile auf denselben Bars beruht (Datensatz und Materialisierung koennen einen Tag auseinander liegen) */
      if (c.asOf[i] !== String(x.bars.timestamps[x.bars.timestamps.length - 1]).slice(0, 10)) continue;
      const b = x.bars, t = b.close.length - 1, s150 = I.compute(b, "sma", { period: 150 }).values[t];
      assert.equal(c.aboveSma150[i], Number.isFinite(s150) ? b.close[t] > s150 : null, tk);
      checked++;
    }
  }
  assert.ok(checked > 200, "geprueft: " + checked);
  for (let i = 0; i < c.s.length; i++) if (c.frozenSince[i]) assert.equal(c.aboveSma150[i], null, c.s[i]);
});
