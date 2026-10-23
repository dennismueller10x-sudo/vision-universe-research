/* Eingefrorene Elliott-Thesen nach einem Split (scripts/technical/elliott-registry/split-adjusted-view.mjs):
   Original bleibt unveraendert, die angepasste Ansicht steht daneben, Faktor aus return-series.js#splitFactors. */
import test from "node:test";
import assert from "node:assert/strict";
import { factorAfter, splitAdjustedThesis } from "../../scripts/technical/elliott-registry/split-adjusted-view.mjs";

const thesis = () => ({
  id: "MBRX|1W|IMPULSE|2026-07-31|1|WAVE_3|3", symbol: "MBRX", timeframe: "1W", state: "ARCHIVED",
  revisions: [{ rev: 1, frozenAt: "2026-10-06", anchor: { price: 0.4455, time: "2026-10-06" }, reference: { length: 0.3731 },
    zones: [{ tier: "BASE", low: 0.8186, high: 1.0491758, stateAtFreeze: "OPEN" }],
    invalidation: { price: 0.3, direction: "below" }, confirmation: { price: 0.9 } }]
});

test("Faktor: nur Splits nach dem Einfrieren, kumuliert wie return-series.js", () => {
  assert.equal(factorAfter("2026-10-06", [["2026-10-20", 0.05]]).factor, 0.05);
  assert.equal(factorAfter("2026-10-20", [["2026-10-20", 0.05]]).factor, 1, "Split am Einfriertag: Werte sind schon neue Basis");
  assert.equal(factorAfter("2026-10-06", [["2026-01-01", 0.1], ["2026-10-20", 0.05]]).factor, 0.05, "frueherer Split zaehlt nicht");
  assert.ok(Math.abs(factorAfter("2026-01-01", [["2026-03-01", 2], ["2026-10-20", 0.05]]).factor - 0.1) < 1e-12);
  assert.equal(factorAfter("2026-10-06", [["2026-10-20", 0.05]], "2026-10-19").factor, 1, "Stichtag vor dem Split");
});

test("Reverse-Split 1:20: Zonen x20, Original und historischer Zustand unveraendert", () => {
  const t = thesis(), vorher = JSON.stringify(t);
  const v = splitAdjustedThesis(t, [["2026-10-20", 0.05]]);
  assert.equal(JSON.stringify(t), vorher, "These selbst wird nicht veraendert");
  const r = v.revisions[0];
  assert.deepEqual(r.original.zones[0], { tier: "BASE", low: 0.8186, high: 1.0491758, stateAtFreeze: "OPEN" });
  assert.deepEqual(r.adjusted.zones[0], { tier: "BASE", low: 16.372, high: 20.9835, stateAtFreeze: "OPEN" });
  assert.equal(r.adjusted.anchor.price, 8.91);
  assert.equal(r.adjusted.referenceLength, 7.462);
  assert.equal(r.adjusted.invalidation.direction, "below");
  assert.deepEqual(r.splitsApplied, [["2026-10-20", 0.05]]);
});

test("Ohne Split nach dem Einfrieren keine Ansicht", () => {
  assert.equal(splitAdjustedThesis(thesis(), [["2025-01-01", 0.1]]), null);
  assert.equal(splitAdjustedThesis(thesis(), []), null);
});
