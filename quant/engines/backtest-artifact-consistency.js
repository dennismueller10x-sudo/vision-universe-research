/* Shared consistency checks for the signal-study readiness and certificate.
   This validates provenance and reported basis; it does not grant a release. */
(function (global) {
  "use strict";

  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  function signalSourceStatus(signal, quality) {
    if (!signal || !quality) return { state: "UNAVAILABLE", reason: "SIGNAL_OR_QUALITY_ARTIFACT_MISSING", asOf: signal && signal.asOf || null,
      generatedAt: signal && signal.generatedAt || null, returnType: signal && signal.returnType || null, contract: null, coverage: null,
      benchmark: null, studyBenchmark: { id: null, state: "FAIL", basis: signal && signal.returnType || null, asOf: signal && signal.asOf || null } };
    const study = quality.signalStudy || {};
    const coverage = signal.source && signal.source.totalReturnCoverage;
    const benchmark = quality.benchmark;
    const spy = signal.source && signal.source.spyTotalReturn;
    const errors = [];
    if (signal.schemaVersion !== "signal-backtest-study-2.0.0" || quality.schemaVersion !== "total-return-quality-2.0.0") errors.push("SOURCE_SCHEMA_UNSUPPORTED");
    if (!signal.generatedAt || signal.generatedAt !== quality.generatedAt) errors.push("GENERATION_MISMATCH");
    if (!signal.asOf || signal.asOf !== quality.asOf) errors.push("AS_OF_MISMATCH");
    if (signal.returnType !== study.returnType) errors.push("RETURN_TYPE_MISMATCH");
    if (!coverage || !study.share || coverage.share !== study.share || coverage.titles !== study.titles || coverage.withTotalReturn !== study.withTotalReturn ||
        coverage.minimumShare !== study.minimumShare || signal.source.titles !== coverage.withTotalReturn) errors.push("COVERAGE_MISMATCH");
    if (signal.returnType === "TOTAL_RETURN" && (!study.contract || study.contract !== quality.contract || study.contract !== coverage.contract || study.returnBasis !== "CANONICAL_TOTAL_RETURN" || coverage.basis !== "CANONICAL_TOTAL_RETURN")) errors.push("RETURN_CONTRACT_MISMATCH");
    if (signal.returnType === "TOTAL_RETURN" && (!study.corporateActionContract || study.corporateActionContract !== quality.corporateActionContract || study.corporateActionContract !== coverage.corporateActionContract)) errors.push("CORPORATE_ACTION_CONTRACT_MISMATCH");
    if (signal.returnType === "TOTAL_RETURN" && (!coverage || coverage.share < (coverage.minimumShare || 0.95))) errors.push("TOTAL_RETURN_COVERAGE_BELOW_MINIMUM");
    if (signal.returnType === "TOTAL_RETURN" && (!spy || spy.state !== "PASS" || !benchmark || benchmark.state !== "TOTAL_RETURN_RECONSTRUCTED")) errors.push("TOTAL_RETURN_BENCHMARK_NOT_CONFIRMED");
    if (signal.returnType === "TOTAL_RETURN" && (!signal.source.benchmark || !/BENCHMARK_REFERENCE/.test(signal.source.benchmark) || benchmark.role !== "BENCHMARK_REFERENCE")) errors.push("BENCHMARK_ROLE_MISMATCH");
    if (signal.returnType === "TOTAL_RETURN" && (!spy.canonical || spy.canonical.benchmarkContract !== benchmark.benchmarkContract ||
        quality.benchmarkContract !== benchmark.benchmarkContract || !benchmark.crossCheck || benchmark.crossCheck.state !== "MATCH" || benchmark.crossCheck.unexplainedDrift !== 0)) errors.push("BENCHMARK_CROSSCHECK_MISMATCH");
    if (errors.length) return { state: "INCONSISTENT", reason: errors[0], errors, asOf: signal.asOf || null, generatedAt: signal.generatedAt || null };
    return {
      state: signal.returnType === "TOTAL_RETURN" ? "AVAILABLE" : "UNAVAILABLE",
      reason: signal.returnType === "TOTAL_RETURN" ? null : "TOTAL_RETURN_NOT_CONFIRMED",
      asOf: signal.asOf,
      generatedAt: signal.generatedAt,
      studySchemaVersion: signal.schemaVersion,
      studyEngineVersion: signal.engineVersion,
      qualitySchemaVersion: quality.schemaVersion,
      returnType: signal.returnType,
      contract: study.contract || null,
      corporateActionContract: study.corporateActionContract || null,
      coverage: coverage ? { unit: "SECURITY_PRICE_SERIES", titles: coverage.titles, withTotalReturn: coverage.withTotalReturn,
        share: coverage.share, minimumShare: coverage.minimumShare } : null,
      benchmark: benchmark ? { id: signal.source.benchmark, state: benchmark.state, role: benchmark.role, contract: benchmark.benchmarkContract, from: spy.from, to: spy.to, weeks: spy.weeks, gaps: spy.gaps } : null,
      benchmarkContract: benchmark && benchmark.benchmarkContract || null,
      studyBenchmark: { id: signal.source.benchmark || null, state: signal.rules && signal.rules.every(r => r.checks && r.checks.benchmark && r.checks.benchmark.state === "PASS") ? "PASS" : "FAIL",
        basis: signal.returnType, asOf: signal.asOf }
    };
  }

  function assertSignalSourceStatus(signal, quality) {
    const status = signalSourceStatus(signal, quality);
    if (status.state === "INCONSISTENT") throw new Error("BACKTEST_SOURCE_ARTIFACTS_INCONSISTENT: " + status.errors.join(","));
    return status;
  }

  function readinessMatches(readiness, status) {
    const asset = readiness && readiness.assets && readiness.assets.find((a) => a.id === "priceTotalReturn");
    const benchmark = readiness && readiness.assets && readiness.assets.find((a) => a.id === "benchmark");
    return !!readiness && readiness.signalStudy && readiness.signalStudy.asOf === status.asOf &&
      readiness.signalStudy.generatedAt === status.generatedAt && readiness.signalStudy.returnType === status.returnType &&
      readiness.signalStudy.studySchemaVersion === status.studySchemaVersion && readiness.signalStudy.studyEngineVersion === status.studyEngineVersion &&
      readiness.signalStudy.qualitySchemaVersion === status.qualitySchemaVersion && readiness.signalStudy.contract === status.contract &&
      readiness.signalStudy.corporateActionContract === status.corporateActionContract && readiness.signalStudy.benchmarkContract === status.benchmarkContract &&
      readiness.signalStudy.totalReturn.state === status.state && same(readiness.signalStudy.benchmark, status.benchmark) && same(readiness.signalStudy.studyBenchmark, status.studyBenchmark) &&
      (!status.benchmark || (asset && asset.weekly && asset.weekly.titles === status.coverage.withTotalReturn &&
        asset.weekly.unit === status.coverage.unit && asset.weekly.eligibleTitles === status.coverage.titles && asset.weekly.share === status.coverage.share &&
        benchmark && benchmark.basis === "TOTAL_RETURN" && benchmark.totalReturn === true &&
        benchmark.from === status.benchmark.from && benchmark.to === status.benchmark.to));
  }

  function hasConfirmedTotalReturn(signal, status) {
    return !!signal && !!status && status.state === "AVAILABLE" && signal.returnType === "TOTAL_RETURN";
  }

  const api = { signalSourceStatus, assertSignalSourceStatus, readinessMatches, hasConfirmedTotalReturn };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.BacktestArtifactConsistency = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
