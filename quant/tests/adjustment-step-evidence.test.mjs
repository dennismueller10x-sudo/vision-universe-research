/* Belegte Faktorspruenge (quant/config/adjustment-step-evidence.json, Steuerung 22.11.2026).
   AS-1  ein Eintrag erklaert genau seinen Sprung (Tag + Betrag in Toleranz) - das Gate bleibt sonst hart
   AS-2  Register: nur SPIN_OFF, jeder Eintrag mit SEC-Beleg (Accession, URL, sha256, Zitat) und Anbieterprobe; fail closed
   AS-3  die Leser des Faktorlaufs und des Skalen-Gates uebergeben das Register; Kurse/Faktoren bleiben unveraendert */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { indexAdjustmentStepEvidence, loadAdjustmentStepEvidence, SCHEMA } from "../../scripts/market/lib/adjustment-step-evidence.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MQ = createRequire(import.meta.url)("../engines/market-quality.js");

/* APD um den Spin-off von Versum (R2-Diagnose, Lauf 44997904558): splitFactor 1, keine Dividende, Faktorsprung 1,09369 */
const BARS = [
  { date: "2016-09-28", close: 149.78, adjustedClose: 106.5888468856, dividend: 0, splitFactor: 1 },
  { date: "2016-09-29", close: 150.51, adjustedClose: 107.1083411987, dividend: 0, splitFactor: 1 },
  { date: "2016-09-30", close: 150.34, adjustedClose: 106.987363071, dividend: 0, splitFactor: 1 },
  { date: "2016-10-03", close: 140.57, adjustedClose: 109.4069256255, dividend: 0, splitFactor: 1 },
  { date: "2016-10-04", close: 137.32, adjustedClose: 106.8774206935, dividend: 0, splitFactor: 1 },
  { date: "2016-10-05", close: 136.98, adjustedClose: 106.6127955622, dividend: 0, splitFactor: 1 }
];
const OPT = { claimedStatus: "TOTAL_RETURN", dividendConvention: "TIINGO_REINVESTMENT_CLOSE" };
const codes = (v) => v.findings.filter((f) => f.severity === "error").map((f) => f.code);
const STEP = { id: "APD-2016-10-03-SPIN-OFF-VERSUM", kind: "SPIN_OFF", date: "2016-10-03", expectedStep: 1.09369, tolerance: 0.002 };

test("AS-1 · der belegte Sprung ist erklaert, ohne Beleg sperrt er wie bisher", () => {
  assert.ok(codes(MQ.validateAdjustmentConsistency(BARS, OPT)).includes("unexplained_adjustment_step"), "Vorher: gesperrt");
  const mit = MQ.validateAdjustmentConsistency(BARS, { ...OPT, explainedSteps: [STEP] });
  assert.ok(!codes(mit).includes("unexplained_adjustment_step"), "Nachher: erklaert");
  assert.ok(mit.findings.some((f) => f.code === "adjustment_step_explained" && f.context.evidenceId === STEP.id));
  assert.ok(codes(MQ.validateAdjustmentConsistency(BARS, { ...OPT, explainedSteps: [{ ...STEP, date: "2016-10-04" }] })).includes("unexplained_adjustment_step"), "anderer Tag");
  assert.ok(codes(MQ.validateAdjustmentConsistency(BARS, { ...OPT, explainedSteps: [{ ...STEP, expectedStep: 1.05 }] })).includes("unexplained_adjustment_step"), "anderer Betrag");
  /* ein zweiter, unbelegter Sprung in derselben Reihe sperrt weiter */
  const zwei = BARS.concat([{ date: "2016-10-06", close: 137, adjustedClose: 110, dividend: 0, splitFactor: 1 }]);
  assert.ok(codes(MQ.validateAdjustmentConsistency(zwei, { ...OPT, explainedSteps: [STEP] })).includes("unexplained_adjustment_step"));
  /* die Bars bleiben unveraendert */
  const kopie = JSON.stringify(BARS); MQ.validateAdjustmentConsistency(BARS, { ...OPT, explainedSteps: [STEP] }); assert.equal(JSON.stringify(BARS), kopie);
});

test("AS-2 · Register: nur SPIN_OFF, SEC-Beleg und Anbieterprobe je Eintrag, sonst Abbruch", () => {
  const doc = JSON.parse(readFileSync(join(ROOT, "quant/config/adjustment-step-evidence.json"), "utf8"));
  assert.equal(doc.schemaVersion, SCHEMA);
  const idx = loadAdjustmentStepEvidence(ROOT);
  assert.deepEqual([...idx.keys()], ["ref_APD"]);
  assert.equal(idx.get("ref_APD")[0].expectedStep, 1.09369);
  for (const r of doc.records) { assert.equal(r.kind, "SPIN_OFF"); assert.ok(r.evidence.every((e) => /^[0-9a-f]{64}$/.test(e.sha256))); }
  const base = doc.records[0];
  for (const [what, rec] of [["kind", { ...base, kind: "PROVIDER_CORRECTION" }], ["sha256", { ...base, evidence: [{ ...base.evidence[0], sha256: "abc" }] }],
    ["tolerance", { ...base, tolerance: 0.5 }], ["providerCheck", { ...base, providerCheck: null }], ["evidence", { ...base, evidence: [] }]])
    assert.throws(() => indexAdjustmentStepEvidence({ ...doc, records: [rec] }), /ADJUSTMENT_STEP_EVIDENCE_INVALID/, what);
  assert.throws(() => indexAdjustmentStepEvidence({ ...doc, records: [base, base] }), /id/, "doppelte id");
});

test("AS-3 · Faktorlauf und Skalen-Gate reichen das Register an assessSeries", () => {
  for (const f of ["scripts/market/build-market-factors.mjs", "scripts/market/run-scale-gate.mjs"]) {
    const src = readFileSync(join(ROOT, f), "utf8");
    assert.match(src, /loadAdjustmentStepEvidence\(/, f);
    const calls = src.match(/MarketQuality\.assessSeries\([^)]*\)/g) || [];
    assert.ok(calls.length && calls.every((c) => /explainedSteps: STEP_EVIDENCE\.get\(sec\.securityId\)/.test(c)), f + ": jeder Aufruf mit Register");
  }
  const sm = MQ.assessSeries({ securityId: "ref_APD", provider: "tiingo", adjustmentStatus: "TOTAL_RETURN", bars: BARS.map((b) => ({ ...b, open: b.close, high: b.close, low: b.close, volume: 1000 })) },
    { today: "2016-10-05", explainedSteps: [STEP] });
  assert.ok(!sm.findings.some((f) => f.code === "unexplained_adjustment_step"));
});
