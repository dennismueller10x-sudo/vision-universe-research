// Calculation-logic tests for the Follow the Money financial model.
// Run with: node --test academy/engines/financial-model-engine.test.mjs
// Uses Node's built-in test runner (node:test) — no new dependency, per
// the "don't introduce a whole new test framework" instruction.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Engine = require("./financial-model-engine.js");

test("baseline model: revenue is not cash (FCF < revenue)", () => {
  const m = Engine.computeModel({});
  assert.ok(m.year1.incomeStatement.revenue > 0);
  assert.ok(m.bridge.fcf < m.year1.incomeStatement.revenue);
});

test("baseline model: profit is not cash flow (FCF !== Net Income)", () => {
  const m = Engine.computeModel({});
  assert.notEqual(
    Math.round(m.bridge.fcf * 100),
    Math.round(m.bridge.netIncome * 100)
  );
});

test("higher revenue growth increases working-capital cash drag", () => {
  const low = Engine.computeModel({ revenueGrowth: 0.02 });
  const high = Engine.computeModel({ revenueGrowth: 0.40 });
  assert.ok(
    high.bridge.deltaWC > low.bridge.deltaWC,
    "faster growth should require more receivables/inventory build than payables offset"
  );
});

test("growth can reduce FCF even while net income rises", () => {
  const low = Engine.computeModel({ revenueGrowth: 0.02 });
  const high = Engine.computeModel({ revenueGrowth: 0.55, daysReceivable: 90, daysInventory: 80, daysPayable: 20 });
  assert.ok(high.bridge.netIncome > low.bridge.netIncome, "net income should scale up with revenue");
  assert.ok(high.bridge.fcf < low.bridge.fcf, "aggressive growth + working-capital intensity should eat into FCF");
});

test("higher CapEx reduces FCF without touching net income", () => {
  const lowCapex = Engine.computeModel({ capexPctRevenue: 0.02 });
  const highCapex = Engine.computeModel({ capexPctRevenue: 0.25 });
  assert.equal(
    Math.round(lowCapex.bridge.netIncome * 100),
    Math.round(highCapex.bridge.netIncome * 100),
    "CapEx must not appear above the operating income line"
  );
  assert.ok(highCapex.bridge.fcf < lowCapex.bridge.fcf);
});

test("SBC is a non-cash add-back inside CFO", () => {
  const noSbc = Engine.computeModel({ sbcPctRevenue: 0 });
  const withSbc = Engine.computeModel({ sbcPctRevenue: 0.08 });
  assert.ok(withSbc.bridge.sbc > 0);
  assert.ok(withSbc.bridge.cfo > noSbc.bridge.cfo, "SBC add-back should raise CFO relative to a no-SBC case");
});

test("assumptions are clamped to sane ranges", () => {
  const m = Engine.computeModel({ grossMargin: 5, taxRate: -1, capexPctRevenue: 999 });
  assert.ok(m.assumptions.grossMargin <= Engine.ASSUMPTION_RANGES.grossMargin.max);
  assert.ok(m.assumptions.taxRate >= Engine.ASSUMPTION_RANGES.taxRate.min);
  assert.ok(m.assumptions.capexPctRevenue <= Engine.ASSUMPTION_RANGES.capexPctRevenue.max);
});

test("margins and cash conversion are internally consistent", () => {
  const m = Engine.computeModel({});
  const is1 = m.year1.incomeStatement;
  assert.ok(Math.abs(m.metrics.grossMarginPct - is1.grossProfit / is1.revenue) < 1e-9);
  assert.ok(Math.abs(m.metrics.cashConversion - m.bridge.cfo / is1.netIncome) < 1e-9);
});
