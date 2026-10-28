/* Dreiecksklassifikation (ti-chart-patterns 1.2.0, docs/technical/FORMATION_VALIDATION.md §6).
   "Flach" (Abstand <= tol) und "steigend/fallend" (> 0,5 tol) ueberlappen. Gelten aufsteigendes und absteigendes Dreieck
   zugleich (beide Kanten flach, Hochs fallen, Tiefs steigen), konvergiert das Muster: symmetrisch, beide Kanten als Linien.
   Vorher entschied die Reihenfolge ("aufsteigend"), und das Spiegelbild war wieder "aufsteigend".
   Referenz: echte Tagesbars INGM und TRMK (Stand 26.10.2026), die genau diesen Fall zeigen. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { mirrorBars } from "../../scripts/technical/validate-formations.mjs";

const require = createRequire(import.meta.url);
const F = require("../engines/technical/formations.js");
const C = require("../engines/technical/canonical-bars.js");
const CP = require("../engines/technical/ti/chart-patterns.js");
const fx = JSON.parse(readFileSync(new URL("./fixtures/technical-formations-triangles.json", import.meta.url), "utf8"));

function series(tk, t) {
  const rows = t.date.map((d, i) => ({ date: d, open: t.open[i], high: t.high[i], low: t.low[i], close: t.close[i], volume: t.volume[i] }));
  return C.fromRows(rows, { instrumentId: tk, exchange: "US", currency: "USD", timeframe: "1D", priceSeriesType: "SPLIT_ADJUSTED", source: "fixture", sourceRevision: "triangles" });
}
const triangles = (s) => F.analyze(s).formations.filter((f) => /TRIANGLE/.test(f.type));

test("Version: Regelwerk 1.3.0 (Kanten nach Typ)", () => {
  assert.match(CP.ENGINE_VERSION || "", /1\.3\.0$/);
  assert.match(F.ENGINE_VERSION, /1\.4\.0$/);
});

for (const [tk, t] of Object.entries(fx.titles)) {
  test(tk + ": konvergentes Muster ist symmetrisch, beide Kanten geneigt (oben fallend, unten steigend)", () => {
    const tri = triangles(series(tk, t));
    assert.equal(tri.filter((f) => f.type === "ASCENDING_TRIANGLE").length, 0, "nicht mehr aufsteigend");
    const sym = tri.find((f) => f.type === "SYMMETRICAL_TRIANGLE");
    assert.ok(sym, "symmetrisch erkannt");
    const highs = sym.points.filter((p) => p.side === "HIGH"), lows = sym.points.filter((p) => p.side === "LOW");
    assert.ok(highs[highs.length - 1].price < highs[0].price && lows[lows.length - 1].price > lows[0].price, "Hochs fallen, Tiefs steigen");
    const up = sym.lines.find((l) => l.role === "upper"), lo = sym.lines.find((l) => l.role === "lower");
    assert.ok(up.to.price < up.from.price, "obere Kante faellt");
    assert.ok(lo.to.price > lo.from.price, "untere Kante steigt");
  });

  test(tk + ": jedes Dreieck hat sein Gegenstueck im Spiegelbild am selben Erkennungstag", () => {
    const MIRROR = { ASCENDING_TRIANGLE: "DESCENDING_TRIANGLE", DESCENDING_TRIANGLE: "ASCENDING_TRIANGLE", SYMMETRICAL_TRIANGLE: "SYMMETRICAL_TRIANGLE" };
    const orig = triangles(series(tk, t));
    const mb = mirrorBars({ timestamps: t.date, open: t.open, high: t.high, low: t.low, close: t.close, volume: t.volume });
    const mirrored = triangles(series(tk, { date: mb.timestamps, open: mb.open, high: mb.high, low: mb.low, close: mb.close, volume: mb.volume }));
    assert.ok(orig.length > 0, "die Pruefung laeuft nicht leer");
    for (const f of orig) {
      assert.ok(mirrored.some((m) => m.type === MIRROR[f.type] && m.detectedAt === f.detectedAt), f.id + ": " + MIRROR[f.type] + " fehlt im Spiegelbild");
    }
  });
}
