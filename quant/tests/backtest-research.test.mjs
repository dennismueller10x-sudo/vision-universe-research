// Vertrag der Datenart backtestResearch (quant/data/product/backtest-research-v1.json).
// Erzeuger: scripts/quant/research/build-backtest-research.cjs (pipeline-weekly, Teil backtest-forschung).
// Mit BACKTEST_RESEARCH_ARTIFACT=<datei> prueft der Test zusaetzlich das gerade erzeugte Artefakt (Workflow-Schritt).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const B = require("../../scripts/quant/research/build-backtest-research.cjs");
const STATES = ["EXECUTED", "NOT_RUN", "NOT_APPLICABLE", "FAILED", "SKIPPED"];

function checkDoc(doc) {
  assert.equal(doc.schemaVersion, B.SCHEMA);
  assert.match(doc.asOf, /^\d{4}-\d{2}-\d{2}$/);
  // Forschung, nie Produktaussage: intern, nicht oeffentlich, nicht zertifiziert.
  assert.equal(doc.label, "Forschung, nicht zertifiziert");
  assert.equal(doc.audience, "INTERNAL");
  assert.equal(doc.display.public, false);
  assert.equal(doc.productionApproved, false);
  assert.equal(doc.certificationStatus, "NOT_CERTIFIED");
  assert.ok(Array.isArray(doc.cases) && doc.cases.length > 0);
  assert.equal(doc.summary.cases, doc.cases.length);
  for (const c of doc.cases) {
    assert.ok(c.id && c.kind && c.state, "Fall ohne id/kind/state");
    assert.ok(/^[0-9a-f]{64}$/.test(c.resultHash), c.id + ": resultHash");
    assert.deepEqual(Object.keys(c.methods), B.METHODS, c.id + ": Methoden in fester Reihenfolge");
    for (const [m, r] of Object.entries(c.methods)) {
      assert.ok(STATES.includes(r.state) || typeof r.state === "string", c.id + " " + m);
      if (r.state !== "EXECUTED") continue;
      if (m === "MONTE_CARLO") {
        assert.equal(r.scope, "CONDITIONAL_RESAMPLING_NOT_A_FORECAST", c.id + ": Monte Carlo ist keine Prognose");
        assert.ok(r.totalReturn.p5 <= r.totalReturn.p50 && r.totalReturn.p50 <= r.totalReturn.p95, c.id + ": Quantile geordnet");
      }
      if (m === "OUT_OF_SAMPLE") assert.ok(Array.isArray(r.perFold), c.id + ": OOS je Fenster");
      if (m === "MARKET_REGIME") assert.ok(Array.isArray(r.states) && r.states.length > 0, c.id + ": Regime-Zustaende");
    }
    if (c.state === "PREPARED_DATA_LIMITED") assert.ok(c.missingInputs.length > 0 || c.privateData, c.id + ": nennt den fehlenden Eingang");
  }
}

test("BR-1 · Erzeuger: ein ausgefuehrter und ein datenbegrenzter Fall, deterministisch, Vertrag erfuellt", () => {
  const only = ["replay-intc-loser", "acquisition-agn"];
  const a = B.build({ asOf: "2026-11-12", only }), b = B.build({ asOf: "2026-11-12", only });
  assert.deepEqual(a, b, "gleiche Eingaben, gleiches Artefakt");
  checkDoc(a);
  const exec = a.cases.find((c) => c.id === "replay-intc-loser");
  assert.equal(exec.state, "RESEARCH_EXECUTED");
  assert.equal(exec.methods.MONTE_CARLO.state, "EXECUTED");
  assert.equal(a.cases.find((c) => c.id === "acquisition-agn").state, "PREPARED_DATA_LIMITED");
});

test("BR-2 · compact nimmt nur Felder des Ergebnisvertrags, rechnet nichts neu", () => {
  const mc = B.compact("MONTE_CARLO", { state: "EXECUTED", result: { model: "TRADE_IID", simulations: 2000, horizon: 10, sourceObservations: 20, scope: "CONDITIONAL_RESAMPLING_NOT_A_FORECAST",
    totalReturn: { p5: -0.1, p50: 0.2, p95: 0.5 }, maxDrawdown: { p5: -0.4, p50: -0.2, p95: 0 }, inputHash: "x", extra: 1 } });
  assert.deepEqual(mc.totalReturn, { p5: -0.1, p50: 0.2, p95: 0.5 });
  assert.equal(mc.extra, undefined);
  assert.deepEqual(B.compact("WALK_FORWARD", { state: "NOT_RUN" }), { state: "NOT_RUN" });
});

test("BR-3 · Erzeugtes Artefakt (falls angegeben) erfuellt den Vertrag", { skip: !process.env.BACKTEST_RESEARCH_ARTIFACT }, () => {
  const f = process.env.BACKTEST_RESEARCH_ARTIFACT;
  assert.ok(existsSync(f), f);
  checkDoc(JSON.parse(readFileSync(f, "utf8")));
});
