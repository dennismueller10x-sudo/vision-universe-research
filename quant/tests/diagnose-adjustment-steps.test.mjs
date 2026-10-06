// Diagnose der Sperre unexplained_adjustment_step: Spruenge finden und einordnen.
import test from "node:test";
import assert from "node:assert/strict";
import { explainSteps, classifyStep } from "../../scripts/diagnose/adjustment-steps.mjs";

// LOGI um den 22.09.2026 (Werte aus der Ablage, Lauf 37175583706).
const logi = [
  { date: "2025-09-22", close: 90, adjustedClose: 90 * 0.96932589, dividend: 1.585 },
  { date: "2025-09-23", close: 91, adjustedClose: 91 * 0.96932589, dividend: 1.59121 },
  { date: "2026-09-18", close: 101.2, adjustedClose: 98.095780508, dividend: 0 },
  { date: "2026-09-21", close: 105.12, adjustedClose: 103.4988030431, dividend: 0 },
  { date: "2026-09-22", close: 105.82, adjustedClose: 105.82, dividend: 1.657556 },
  { date: "2026-09-23", close: 104.65, adjustedClose: 104.65, dividend: 0 }
];

test("LOGI: genau ein unerklaerter Sprung am 2026-09-21, eingeordnet als doppelte Dividendenbereinigung", () => {
  const steps = explainSteps(logi).filter((s) => !s.explained && s.date.startsWith("2026"));
  assert.equal(steps.length, 1);
  assert.equal(steps[0].date, "2026-09-21");
  assert.ok(Math.abs(steps[0].impliedDividendAtExClose - 1.654) < 0.01);
  const c = classifyStep(steps[0], logi);
  assert.equal(c.kind, "DUPLICATED_DIVIDEND_ADJUSTMENT");
  assert.deepEqual(c.matchedDividend, { date: "2026-09-22", amount: 1.657556 });
  assert.deepEqual(c.consecutiveDividendPairs, [["2025-09-22", "2025-09-23"]]);
});

test("Ausschuettung ohne divCash und ohne Dividende in der Naehe bleibt UNEXPLAINED", () => {
  const b = [
    { date: "2026-01-29", close: 25, adjustedClose: 24.5 },
    { date: "2026-01-30", close: 25, adjustedClose: 24.64 }
  ];
  const s = explainSteps(b);
  assert.equal(s.length, 1);
  assert.equal(classifyStep(s[0], b).kind, "UNEXPLAINED");
});

test("Gemeldete Dividende am Sprungtag gilt als erklaert", () => {
  const b = [
    { date: "a", close: 100, adjustedClose: 99 },
    { date: "b", close: 100, adjustedClose: 100, dividend: 1 }
  ];
  assert.equal(explainSteps(b)[0].explained, true);
});
