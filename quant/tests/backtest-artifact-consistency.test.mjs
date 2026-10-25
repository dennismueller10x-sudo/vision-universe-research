import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = new URL("../../", import.meta.url);
const C = require("../engines/backtest-artifact-consistency.js");
const json = (p) => JSON.parse(readFileSync(new URL(p, root), "utf8"));

test("signal readiness derives total return and SPY basis from matching canonical artifacts", () => {
  const signal = json("quant/data/product/signal-backtest-v1.json");
  const quality = json("quant/data/product/total-return-quality-v1.json");
  const readiness = json("quant/data/product/backtest-readiness-v2.json");
  const status = C.assertSignalSourceStatus(signal, quality);
  assert.equal(status.state, "AVAILABLE");
  assert.equal(status.returnType, "TOTAL_RETURN");
  assert.equal(status.coverage.withTotalReturn, 6036);
  assert.equal(status.coverage.titles, 6174);
  assert.equal(status.coverage.unit, "SECURITY_PRICE_SERIES");
  assert.equal(status.studySchemaVersion, signal.schemaVersion);
  assert.equal(status.studyEngineVersion, signal.engineVersion);
  assert.equal(status.qualitySchemaVersion, quality.schemaVersion);
  assert.equal(status.corporateActionContract, quality.corporateActionContract);
  assert.equal(status.benchmarkContract, quality.benchmarkContract);
  assert.equal(status.benchmark.role, "BENCHMARK_REFERENCE");
  assert.equal(status.studyBenchmark.state, "PASS");
  assert.equal(C.readinessMatches(readiness, status), true);
  const cert = json("quant/data/product/backtest-certification-v1.json");
  const certSignal = cert.kinds.find((k) => k.id === "SIGNAL_BACKTEST");
  assert.deepEqual(certSignal.source, { asOf: status.asOf, generatedAt: status.generatedAt, returnType: status.returnType,
    studySchemaVersion: status.studySchemaVersion, studyEngineVersion: status.studyEngineVersion,
    qualitySchemaVersion: status.qualitySchemaVersion, returnContract: status.contract,
    corporateActionContract: status.corporateActionContract, benchmarkContract: status.benchmarkContract,
    totalReturnCoverage: status.coverage, benchmark: status.benchmark, studyBenchmark: status.studyBenchmark });
  assert.equal(readiness.kinds.find(k => k.key === "SIGNAL_BACKTEST").gates.find(g => g.id === "survivorship").reason,
    certSignal.gates.find(g => g.id === "survivorship").reason);
  const intelligence = json("quant/data/product/backtest-signal-intelligence-v1.json");
  assert.deepEqual(intelligence.measures.SIGNAL_STUDY_SOURCE, readiness.signalStudy);
  assert.equal(readiness.assets.find(a => a.id === "priceTotalReturn").weekly.unit, "SECURITY_PRICE_SERIES");
  assert.ok(!intelligence.measures.SIGNAL_BACKTEST_READY.reasons.includes("TOTAL_RETURN_SERIES_NOT_PUBLISHED"));
});

test("a mismatched timestamp, coverage, return basis or benchmark fails closed", () => {
  const signal = json("quant/data/product/signal-backtest-v1.json");
  const quality = json("quant/data/product/total-return-quality-v1.json");
  for (const mutate of [
    (s, q) => { q.generatedAt = "2000-01-01T00:00:00.000Z"; },
    (s, q) => { q.asOf = "2000-01-01"; },
    (s, q) => { q.signalStudy.withTotalReturn -= 1; },
    (s, q) => { q.signalStudy.returnType = "SPLIT_ADJUSTED_PRICE"; },
    (s, q) => { q.corporateActionContract = "future-contract"; },
    (s, q) => { q.benchmarkContract = "future-contract"; },
    (s, q) => { q.benchmark.role = "UNIVERSE_MEMBER"; },
    (s, q) => { q.schemaVersion = "future-unreviewed-contract"; }
  ]) {
    const s = structuredClone(signal), q = structuredClone(quality);
    mutate(s, q);
    assert.equal(C.signalSourceStatus(s, q).state, "INCONSISTENT");
    assert.throws(() => C.assertSignalSourceStatus(s, q), /BACKTEST_SOURCE_ARTIFACTS_INCONSISTENT/);
  }
});

test("an unverified or missing quality artifact cannot pass the certification return-basis gate", () => {
  const signal = json("quant/data/product/signal-backtest-v1.json");
  const missing = C.signalSourceStatus(signal, null);
  assert.equal(missing.state, "UNAVAILABLE");
  assert.equal(C.hasConfirmedTotalReturn(signal, missing), false);
  assert.equal(C.hasConfirmedTotalReturn(signal, { state: "INCONSISTENT" }), false);
  assert.equal(C.hasConfirmedTotalReturn(signal, { state: "AVAILABLE" }), true);
});

test("source consistency does not change any backtest certification status", () => {
  const certification = json("quant/data/product/backtest-certification-v1.json");
  const signalKind = certification.kinds.find((k) => k.id === "SIGNAL_BACKTEST");
  assert.equal(signalKind.status, "LIMITED");
  assert.ok(signalKind.gates.some((g) => g.id === "survivorship" && g.state === "FAIL"));
  assert.ok(signalKind.rules.every((r) => r.status !== "CERTIFIED"));
});
