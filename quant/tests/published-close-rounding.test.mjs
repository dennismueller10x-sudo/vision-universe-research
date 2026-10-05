/* Plattform-Audit 03.10.2026: Cent-Rundung machte aus Penny-Kursen eine 0
   (CPTAF, DMN) und verzerrte jeden Kurs unter 1 $. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const PC = require("../engines/published-close.js");

test("Ab 1 $ bleibt es beim Cent - kein bestehender Wert aendert sich", () => {
  for (const [v, r] of [[233.954, 233.95], [1, 1], [1.005, 1], [341.07, 341.07]]) assert.equal(PC.roundClose(v), r);
});

test("Unter 1 $ vier signifikante Stellen, nie 0", () => {
  assert.equal(PC.roundClose(0.0149), 0.0149);
  assert.equal(PC.roundClose(0.00312), 0.00312);
  assert.equal(PC.roundClose(0.000041), 0.000041);
  assert.ok(PC.roundClose(0.004) > 0, "ein positiver Kurs wurde 0");
});

test("Kein positiver Kurs ist kein Kurs", () => {
  for (const v of [0, -1, NaN, null, undefined, "1"]) assert.equal(PC.roundClose(v), null);
});

test("Beide Publisher runden ueber dieselbe Regel und verwerfen Nullkurse", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of ["scripts/market/publish-discover-series.mjs", "scripts/market/publish-long-series.mjs"]) {
    const src = readFileSync(new URL("../../" + f, import.meta.url), "utf8");
    assert.ok(src.includes("PublishedClose.roundClose"), f);
    assert.ok(!/function round2/.test(src), f + " rundet noch selbst");
    assert.ok(/b\.close > 0/.test(src), f + " laesst Nullkurse durch");
  }
  const { compactSeries } = await import("../../scripts/market/publish-discover-series.mjs");
  const bars = Array.from({ length: 40 }, (_, i) => ({ date: "2026-08-" + String(i % 28 + 1).padStart(2, "0"), close: i === 5 ? 0 : 0.00312, splitFactor: 1 }))
    .map((b, i) => Object.assign(b, { date: new Date(Date.UTC(2026, 6, 1 + i)).toISOString().slice(0, 10) }));
  const s = compactSeries({ bars, provider: "tiingo" }, { securityId: "ref_X", ticker: "X" }, { basis: "test" });
  assert.ok(s.points.every((p) => p[1] > 0), "Nullkurs veroeffentlicht");
  assert.equal(s.points[s.points.length - 1][1], 0.00312);
});
