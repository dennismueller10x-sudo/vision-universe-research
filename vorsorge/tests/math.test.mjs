import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const M = createRequire(import.meta.url)("../engines/vorsorge-math.js");
const close = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test("futureValue: Sparplan mit 0 % Rendite = Summe der Einzahlungen", () => {
  const r = M.futureValue({ start: 1000, monthly: 100, years: 10, annualReturn: 0 });
  close(r.nominal, 1000 + 100 * 120);
  close(r.invested, 13000);
});

test("futureValue: Startkapital mit 5 % ueber 10 Jahre (geometrisch, monatlich)", () => {
  const r = M.futureValue({ start: 10000, years: 10, annualReturn: 0.05 });
  close(r.nominal, 10000 * Math.pow(1.05, 10), 0.001);
});

test("futureValue: Rentenformel nachschuessig", () => {
  const m = Math.pow(1.06, 1 / 12) - 1, n = 360;
  const expect = 200 * (Math.pow(1 + m, n) - 1) / m;
  close(M.futureValue({ monthly: 200, years: 30, annualReturn: 0.06 }).nominal, expect);
});

test("Edge: 0 € Startkapital und 0 € Sparrate ergibt 0", () => {
  assert.equal(M.futureValue({ start: 0, monthly: 0, years: 30, annualReturn: 0.07 }).nominal, 0);
});

test("Edge: negative Rendite verringert das Vermoegen", () => {
  const r = M.futureValue({ start: 10000, years: 5, annualReturn: -0.05 });
  close(r.nominal, 10000 * Math.pow(0.95, 5), 0.001);
  assert.ok(r.gain < 0);
});

test("Edge: Rendite <= -100 % stuerzt nicht ab", () => {
  const r = M.futureValue({ start: 10000, monthly: 10, years: 2, annualReturn: -1.5 });
  assert.ok(Number.isFinite(r.nominal));
});

test("Kosten: Nettorendite = (1+R)(1-K)-1", () => {
  close(M.netAnnualReturn(0.07, 0.01), 1.07 * 0.99 - 1, 1e-12);
  const a = M.futureValue({ start: 10000, years: 20, annualReturn: 0.07, annualCost: 0.01 }).nominal;
  close(a, 10000 * Math.pow(1.07 * 0.99, 20), 0.01);
});

test("Inflation: Kaufkraft", () => {
  close(M.inflationAdjustedValue(100000, 30, 0.02), 100000 / Math.pow(1.02, 30), 1e-6);
  const r = M.realFutureValue({ start: 10000, years: 10, annualReturn: 0.02, inflation: 0.02 });
  close(r.real, 10000, 0.01);
});

test("requiredSavingsRate ist die Umkehrung von futureValue", () => {
  const p = { start: 5000, years: 25, annualReturn: 0.05, annualCost: 0.002 };
  const rate = M.requiredSavingsRate({ ...p, target: 250000 });
  close(M.futureValue({ ...p, monthly: rate }).nominal, 250000, 0.05);
});

test("requiredSavingsRate: Ziel bereits erreicht -> 0, keine Laufzeit -> null", () => {
  assert.equal(M.requiredSavingsRate({ start: 1e6, target: 1000, years: 10, annualReturn: 0.03 }), 0);
  assert.equal(M.requiredSavingsRate({ start: 0, target: 1000, years: 0 }), null);
  close(M.requiredSavingsRate({ target: 12000, years: 10, annualReturn: 0 }), 100);
});

test("requiredCapital und retirementIncome sind invers", () => {
  const cap = M.requiredCapital({ monthlyIncome: 1000, years: 25, annualReturn: 0.02 });
  close(M.retirementIncome({ capital: cap, years: 25, annualReturn: 0.02 }), 1000, 1e-6);
  close(M.requiredCapital({ monthlyIncome: 1000, years: 10, annualReturn: 0 }), 120000);
});

test("withdrawalScenario: Kapital reicht bei passender Entnahme genau", () => {
  const cap = M.requiredCapital({ monthlyIncome: 500, years: 20, annualReturn: 0.03 });
  const w = M.withdrawalScenario({ capital: cap, monthlyWithdrawal: 500, annualReturn: 0.03, years: 30, indexToInflation: false });
  assert.ok(w.depletedAfterMonths >= 239 && w.depletedAfterMonths <= 241, String(w.depletedAfterMonths));
});

test("feeImpact: hoehere Kosten -> niedrigeres Endvermoegen, entgangener Zinseszins > 0", () => {
  const r = M.feeImpact({ start: 10000, monthly: 200, years: 30, annualReturn: 0.06, costA: 0.002, costB: 0.015 });
  assert.ok(r.a.endValue > r.b.endValue);
  assert.ok(r.b.costsAbsolute > r.a.costsAbsolute);
  assert.ok(r.b.lostCompounding > 0);
  close(r.b.costsAbsolute, r.b.directFees + r.b.lostCompounding, 1e-6);
  assert.ok(r.b.costsRelative > 0 && r.b.costsRelative < 1);
});

test("feeImpact: ohne Kosten keine Kosten", () => {
  const r = M.feeImpact({ start: 1000, monthly: 0, years: 10, annualReturn: 0.05, costA: 0, costB: 0 });
  close(r.a.costsAbsolute, 0, 1e-9);
});

test("goalProbability ist deterministisch und monoton in der Sparrate", () => {
  const base = { start: 0, years: 25, target: 200000, annualReturn: 0.06, volatility: 0.15, paths: 1000 };
  const a = M.goalProbability({ ...base, monthly: 300 });
  const b = M.goalProbability({ ...base, monthly: 300 });
  assert.equal(a.probability, b.probability);
  const c = M.goalProbability({ ...base, monthly: 600 });
  assert.ok(c.probability >= a.probability);
  assert.ok(a.percentiles.p10 <= a.percentiles.p50 && a.percentiles.p50 <= a.percentiles.p90);
});

test("plan: drei Szenarien, steigende Endwerte, real < nominal", () => {
  const p = M.plan({ age: 30, targetAge: 67, start: 5000, monthly: 250, cost: 0.002, inflation: 0.02, desiredIncome: 2500, existingIncome: 1600 });
  assert.equal(p.scenarios.length, 3);
  assert.ok(p.scenarios[0].nominal < p.scenarios[1].nominal && p.scenarios[1].nominal < p.scenarios[2].nominal);
  p.scenarios.forEach((s) => { assert.ok(s.real < s.nominal); assert.ok(s.goalAttainment >= 0); });
});

test("plan: Zielalter kleiner als Alter wird abgefangen", () => {
  const p = M.plan({ age: 70, targetAge: 60, monthly: 100 });
  assert.equal(p.years, 0);
});

test("retirementGap: spaeter Start kostet mehr Sparrate", () => {
  const g = M.retirementGap({ age: 30, targetAge: 67, desiredIncome: 3000, existingIncome: 1800, inflation: 0.02, cost: 0.002, annualReturn: 0.05 });
  assert.ok(g.gapMonthlyReal === 1200);
  assert.ok(g.starts[0].monthly < g.starts[1].monthly && g.starts[1].monthly < g.starts[2].monthly);
  assert.ok(g.delayCost > 0);
});

test("retirementGap: keine Luecke -> 0 Sparrate", () => {
  const g = M.retirementGap({ age: 40, desiredIncome: 1000, existingIncome: 1500 });
  assert.equal(g.gapMonthlyReal, 0);
  assert.equal(g.starts[0].monthly, 0);
});

test("retirementGap: Start nach Rentenbeginn ist nicht moeglich", () => {
  const g = M.retirementGap({ age: 60, targetAge: 67, desiredIncome: 2000, existingIncome: 1000 });
  assert.equal(g.starts[2].possible, false);
});

test("leverAnalysis sortiert nach Wirkung", () => {
  const l = M.leverAnalysis({ age: 35, targetAge: 67, monthly: 200, cost: 0.01, desiredIncome: 2500, existingIncome: 1500 });
  for (let i = 1; i < l.levers.length; i++) assert.ok(l.levers[i - 1].delta >= l.levers[i].delta);
});
