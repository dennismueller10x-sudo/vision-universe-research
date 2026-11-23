// Elliott-Neustart Schritt 3 (22.11.2026): Wochenkerzen als Seitenkanal (series.extremes).
// Produktion (elliott-3.4.0): mit angehaengten Kerzen ist die Ausgabe byte-gleich; nur das Forschungsprofil nutzt sie.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { weeklySeriesFromPoints } from "../../scripts/technical/lib/ti-data.mjs";

const ROOT = join(fileURLToPath(import.meta.url), "../../..");
const require = createRequire(import.meta.url);
const EV3 = require(join(ROOT, "quant/engines/technical/elliott/elliott-v3.js"));
const Ctx = require(join(ROOT, "quant/engines/technical/ti/context.js"));

function synth(n, seed) {
  let s = seed, p = 50; const pts = [], hi = [], lo = [], op = [];
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const d0 = Date.parse("2015-01-02T00:00:00Z");
  for (let i = 0; i < n; i++) {
    const o = p; p = Math.max(1, p * (1 + 0.04 * Math.sin(i / 9) + (rnd() - 0.5) * 0.06));
    pts.push([new Date(d0 + i * 7 * 864e5).toISOString().slice(0, 10), Math.round(p * 100) / 100]);
    op.push(o); hi.push(Math.max(o, p) * (1 + rnd() * 0.03)); lo.push(Math.min(o, p) * (1 - rnd() * 0.03));
  }
  return { pts, ex: { open: op, high: hi, low: lo } };
}

test("EX-1 · Produktion: Kerzen angehängt, Ausgabe byte-gleich mit der Schlusskurs-Reihe", () => {
  assert.equal(EV3.ENGINE_VERSION, "elliott-3.4.0");
  assert.equal(EV3.DEFAULTS.windowYears, 3, "3.4.0: Ursprung hoechstens 3 Jahre zurueck");
  assert.equal(EV3.DEFAULTS.extremes, false);
  const { pts, ex } = synth(420, 7);
  const a = weeklySeriesFromPoints(pts, "SYN"), b = weeklySeriesFromPoints(pts, "SYN"); b.extremes = ex;
  const P = Ctx.prepare(a), Q = Ctx.prepare(b);
  const ra = EV3.analyzeElliottV3({ series: a, features: P.features, pivots: P.pivots, barsPerYear: 52 });
  const rb = EV3.analyzeElliottV3({ series: b, features: Q.features, pivots: Q.pivots, barsPerYear: 52 });
  assert.equal(JSON.stringify(rb), JSON.stringify(ra));
});

test("EX-2 · Forschungsprofil nutzt Hoch/Tief: Wellenpreise liegen an Kerzenextremen, kausal", () => {
  const { pts, ex } = synth(420, 11);
  const b = weeklySeriesFromPoints(pts, "SYN"); b.extremes = ex;
  const Q = Ctx.prepare(b);
  const r = EV3.analyzeElliottV3({ series: b, features: Q.features, pivots: Q.pivots, barsPerYear: 52, profile: "elliott-4.0.0-rc1-extremes" });
  assert.equal(r.engineVersion, "elliott-4.0.0-rc1-extremes");
  if (r.primary) for (const w of r.primary.waves) {
    const i = b.timestamps.indexOf(w.toTime);
    assert.ok([b.close[i], ex.high[i], ex.low[i]].some((v) => Math.abs(v - w.toPrice) < 1e-3), w.label + " an Schluss, Hoch oder Tief");
  }
  /* kausal: der Preis einer Bar haengt nur von Bars bis asOf ab */
  const px1 = EV3.extremePrices(ex, b.close, 300, 2), px2 = EV3.extremePrices({ open: ex.open, high: ex.high.map((v, i) => (i > 300 ? v * 9 : v)), low: ex.low }, b.close, 300, 2);
  assert.deepEqual(px1.slice(0, 301), px2.slice(0, 301));
});
