/* AP8 L2: Richtung der SMA 200 ueber 21 Handelstage (screen-row.js 1.12.0, technical-query.js 1.12.0,
   docs/technical/SCREENER_FIELDS_AP8_L2.md). SMA 200 heute gegen vor 21 Handelstagen, aus den Tagesbars. */
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

test("L2: SMA 200 heute gegen vor 21 Handelstagen", () => {
  const up = Array.from({ length: 270 }, (_, i) => 10 + i * 0.1), r = row(up), t = up.length - 1;
  const s = I.compute(bars(up), "sma", { period: 200 }).values;
  assert.equal(r.sma200Rising, true);
  assert.ok(Math.abs(r.sma200Slope21 - (s[t] / s[t - 21] - 1)) < 1e-4);
  const down = row(up.slice().reverse());
  assert.equal(down.sma200Rising, false);
  assert.ok(down.sma200Slope21 < 0);
  // Kurs ueber einer fallenden SMA 200: Zustand und Richtung sind getrennte Fragen
  const vee = Array.from({ length: 270 }, (_, i) => (i < 260 ? 100 - i * 0.2 : 48.2 + (i - 259) * 2.8)), v = row(vee);
  assert.equal(v.sma200Rising, false);
  const sv = I.compute(bars(vee), "sma", { period: 200 }).values;
  assert.ok(vee[269] > sv[269], "Kurs liegt ueber der SMA 200");
});

test("L2: ohne 221 Bars leer", () => {
  const r = row(Array.from({ length: 220 }, (_, i) => 10 + i));
  assert.deepEqual([r.sma200Rising, r.sma200Slope21], [null, null]);
  const ok = row(Array.from({ length: 221 }, (_, i) => 10 + i));
  assert.equal(ok.sma200Rising, true);
});

test("L2: Abfragefelder und Wortsuche", () => {
  for (const id of ["sma200Rising", "sma200Slope21"]) { const f = Q.field(id); assert.ok(f, id); assert.deepEqual(f.tfs, ["1D"]); }
  const p = (t) => QT.parse(t).query.groups[0].filters[0];
  assert.deepEqual([p("SMA 200 steigt").field, p("SMA 200 steigt").value], ["sma200Rising", true]);
  assert.deepEqual([p("fallende 200-Tage-Linie").field, p("fallende 200-Tage-Linie").value], ["sma200Rising", false]);
  assert.equal(p("Steigung der SMA 200 größer 1 %").field, "sma200Slope21");
  assert.equal(p("über der SMA 200").field, "aboveSma200");
});

test("L2: Datensatz - Spalte = Rechnung auf den veroeffentlichten Bars, eingefroren leer", () => {
  const c = JSON.parse(readFileSync(join(root, "technical/data/screener-v1.json"), "utf8")).cols;
  if (!c.sma200Rising) return;
  const pos = new Map(c.s.map((t, i) => [t, i])), dir = join(root, "quant/data/product/technical-signals-v1");
  let checked = 0;
  for (const file of readdirSync(dir).filter((x) => /^[A-Z0-9_-]{2}\.json\.gz$/.test(x)).sort().slice(0, 40)) {
    const inst = JSON.parse(gunzipSync(readFileSync(join(dir, file)))).instruments || {};
    for (const [tk, x] of Object.entries(inst)) {
      const i = pos.get(tk); if (i === undefined || c.frozenSince[i]) continue;
      const b = x.bars, t = b.close.length - 1, s = I.compute(b, "sma", { period: 200 }).values;
      assert.equal(c.sma200Rising[i], t >= 220 ? s[t] > s[t - 21] : null, tk);
      checked++;
    }
  }
  assert.ok(checked > 200, "geprueft: " + checked);
  for (let i = 0; i < c.s.length; i++) if (c.frozenSince[i]) assert.equal(c.sma200Rising[i], null, c.s[i]);
});
