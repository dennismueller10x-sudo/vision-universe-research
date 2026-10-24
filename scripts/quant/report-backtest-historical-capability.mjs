#!/usr/bin/env node
/* Read-only repository inventory for the six existing backtest kinds.
   Writes only the explicitly requested local diagnostic artifact; it does
   not call providers, perform a backfill, or alter certification artifacts. */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const SignalEngine = require(join(ROOT, "quant/engines/signal-backtest.js"));
const P = (...parts) => join(ROOT, ...parts);
const read = (path) => JSON.parse(readFileSync(P(path), "utf8"));
const existsFiles = (path, suffix, recursive = false) => {
  const rootPath = P(path);
  try {
    const visit = (dir, prefix = "") => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const relative = prefix ? prefix + "/" + entry.name : entry.name;
      if (entry.isDirectory() && recursive) return visit(join(dir, entry.name), relative);
      return entry.isFile() && (!suffix || entry.name.endsWith(suffix)) ? [relative] : [];
    });
    return visit(rootPath).sort();
  } catch (error) { if (error.code === "ENOENT") return []; throw error; }
};
const certification = read("quant/data/product/backtest-certification-v1.json");
const readiness = read("quant/data/product/backtest-readiness-v2.json");
const signal = read("quant/data/product/signal-backtest-v1.json");
const totalReturn = read("quant/data/product/total-return-quality-v1.json");
const setup = read("quant/data/product/setup-backtest-v1.json");
const survivorship = read("quant/data/product/survivorship-control-v1.json");
const factorIndex = read("quant/data/product/factor-evidence-history/index.json");
const membershipIndex = read("quant/data/market/index-membership/index.json");
const regimeMethod = read("quant/methodology/market-regime-v1.json");

function listJsonFiles(path) { return existsFiles(path, ".json").filter((f) => f !== "index.json"); }
function rangeFor(dates, warmupBars = 0, trailingBars = 0) {
  if (!dates.length || dates.length <= warmupBars + trailingBars) return { earliestAvailableDataDate: dates[0] || null, earliestEligibleBacktestDate: null, latestEligibleBacktestDate: null, exclusionReasons: ["INSUFFICIENT_OBSERVATIONS"] };
  return { earliestAvailableDataDate: dates[0], earliestEligibleBacktestDate: dates[warmupBars], latestEligibleBacktestDate: dates[dates.length - 1 - trailingBars], exclusionReasons: [] };
}
function sha256(value) { return "sha256:" + createHash("sha256").update(value).digest("hex"); }

const longFiles = listJsonFiles("quant/data/market/discover-series-long");
const longSeries = [];
const observedDates = new Set();
let nvda = null;
let invalidSeries = 0, duplicateOrUnordered = 0, nonPositive = 0;
for (const file of longFiles) {
  const value = read(join("quant/data/market/discover-series-long", file));
  if (!Array.isArray(value.points) || value.priceSeriesType !== "SPLIT_ADJUSTED" || value.dataMode !== "real") { invalidSeries++; continue; }
  let previous = null;
  for (const point of value.points) {
    if (!Array.isArray(point) || !/^\d{4}-\d{2}-\d{2}$/.test(point[0]) || !Number.isFinite(point[1])) { invalidSeries++; break; }
    if (previous && point[0] <= previous) duplicateOrUnordered++;
    if (!(point[1] > 0)) nonPositive++;
    observedDates.add(point[0]);
    previous = point[0];
  }
  if (value.ticker === "NVDA") nvda = value;
  longSeries.push({ securityId: value.securityId, ticker: value.ticker, from: value.from, to: value.to, barCount: value.barCount, priceSeriesType: value.priceSeriesType });
}
const allSortedDates = [...observedDates].sort();
const nvdaRange = nvda ? rangeFor(nvda.points.map((p) => p[0]), 53, 27) : null;
const nvdaSignals = nvda ? (() => {
  const close = Float64Array.from(nvda.points.map((p) => p[1]));
  return SignalEngine.RULES.map((rule) => {
    const events = SignalEngine.detectEvents(close, rule);
    const outcomes = events.map((index) => ({ index, result: SignalEngine.outcome(close, index + 1, 26) })).filter((x) => x.result);
    const returns = outcomes.map((x) => x.result.ret).sort((a, b) => a - b);
    const median = returns.length ? (returns.length % 2 ? returns[(returns.length - 1) / 2] : (returns[returns.length / 2 - 1] + returns[returns.length / 2]) / 2) : null;
    return { ruleId: rule.id, ruleVersion: rule.version, occurrences: events.length, completedM6: outcomes.length,
      firstSignalDate: events.length ? nvda.points[events[0]][0] : null,
      lastSignalDate: events.length ? nvda.points[events.at(-1)][0] : null,
      medianM6NetPriceReturnAfterEngineCosts: median,
      positiveShare: returns.length ? returns.filter((x) => x > 0).length / returns.length : null,
      returnBasis: "SPLIT_ADJUSTED_PRICE", roundTripFrictionsBps: 30,
      interpretation: "single-stock diagnostic only; no dividends, benchmark, PIT universe, or certification" };
  });
})() : null;
const factorDates = Object.values(factorIndex.series || {}).flat();
const membershipFiles = existsFiles("quant/data/market/index-membership/history", ".json", true);
const membershipDocs = membershipFiles.map((f) => read(join("quant/data/market/index-membership/history", f)));
const membershipDates = membershipDocs.map((d) => d.asOf).filter(Boolean).sort();
const regimeFiles = listJsonFiles("quant/data/product/market-regime-history");
const regimeDates = regimeFiles.map((f) => f.replace(/\.json$/, "")).sort();
const setupTitles = setup.source?.titles || [];
const setupStartDates = setupTitles.map((t) => t.from).filter(Boolean).sort();
const setupEndDates = setupTitles.map((t) => t.to).filter(Boolean).sort();

const kindCode = {
  SAME_STOCK_REPLAY: { enginePath: "quant/engines/historical-cases.js", relatedEnginePaths: ["quant/engines/pattern-research.js"], producerPath: "scripts/quant/build-evidence-status.mjs", inputs: ["discover-series-long/* (weekly, split-adjusted price)", "historical-cases uses pattern-research.js"], tests: ["quant/tests/frontend-transformation.test.mjs", "quant/tests/pattern-research.test.mjs"], certificationClass: "conditional single-stock replay; survivor-by-construction" },
  PATTERN_EVIDENCE: { enginePath: "quant/engines/pattern-research.js", producerPath: "scripts/quant/build-pattern-research.mjs", inputs: ["discover-series-long/*", "current/repository universe"], tests: ["quant/tests/pattern-research.test.mjs", "quant/tests/pattern-research-volume.test.mjs"], certificationClass: "market-wide descriptive pattern study" },
  SIGNAL_BACKTEST: { enginePath: "quant/engines/signal-backtest.js", producerPath: "scripts/quant/build-signal-backtest.mjs", inputs: ["discover-series-long/* for detection", "canonical daily working-store series for Total Return when --work-dir is supplied"], tests: ["quant/tests/signal-backtest.test.mjs"], certificationClass: "weekly signal event study" },
  SETUP_BACKTEST: { enginePath: "quant/engines/setup-engine.js", producerPath: "scripts/quant/replay-setup-history.mjs", relatedProducerPaths: ["scripts/quant/build-setup-backtest.mjs"], inputs: ["setup-replay-v1 snapshots", "runner-private daily source for broad replay", "published limited output"], tests: ["quant/tests/setup-engine.test.mjs", "quant/tests/setup-state-contract.test.mjs", "quant/tests/setup-stale-bundles.test.mjs"], certificationClass: "published PIT setup replay and completed outcomes" },
  STRATEGY_BACKTEST: { enginePath: "quant/engines/backtest.js", producerPath: null, producerDescription: "POST /v1/backtests uses quant/engines/mock-provider.js in the local test path", inputs: ["mock-provider price/fact/universe panels"], tests: ["quant/tests/backtest.test.mjs", "quant/tests/strategy-history.test.mjs"], certificationClass: "strategy portfolio simulation; published real-data membership/factor history not wired" },
  FACTOR_RANKING_BACKTEST: { enginePath: "quant/engines/profile-backtest.js", producerPath: null, producerDescription: "profile-backtest.run / profile-backtest.quintiles", inputs: ["factor-evidence-history/*", "index-membership/history/*", "total-return price series"], tests: [], certificationClass: "PIT contract exists; real history gates closed" }
};

const kinds = certification.kinds.map((kind) => {
  const source = kindCode[kind.id] || {};
  const gateStates = Object.fromEntries((kind.gates || []).map((g) => [g.id, { state: g.state, reason: g.reason || null }]));
  let sourceWindow = null;
  if (kind.id === "SAME_STOCK_REPLAY" || kind.id === "PATTERN_EVIDENCE") {
    sourceWindow = { earliestAvailableDataDate: allSortedDates[0] || null, latestAvailableDataDate: allSortedDates.at(-1) || null, universeSeries: longSeries.length, basis: "SPLIT_ADJUSTED_PRICE", frequency: "weekly" };
  } else if (kind.id === "SIGNAL_BACKTEST") {
    sourceWindow = { from: signal.source.from, to: signal.source.to, globalWeeks: signal.source.weeks, testedSeries: signal.source.titles, warmupWeeks: 53, returnType: signal.returnType, totalReturnCoverage: signal.source.totalReturnCoverage };
  } else if (kind.id === "SETUP_BACKTEST") {
    sourceWindow = { replayFilesInRepository: existsFiles("quant/data/product/setup-replay-v1", ".json.gz").length, studyTitlesWithValidatedTotalReturn: setup.source.totalReturnQuality.confirmed, publishedTitleEntries: setupTitles.length, earliestPublishedSeries: setupStartDates[0] || null, latestPublishedSeries: setupEndDates.at(-1) || null, privateHistoryRequired: setup.scaleUp?.reason || null };
  } else if (kind.id === "STRATEGY_BACKTEST") {
    sourceWindow = { providerMode: "MOCK_ONLY_IN_REPO_EXECUTION_PATH", maxStartIsDependencyDerivedInThisBranch: true, realHistoricalMembership: { snapshots: membershipDates.length, from: membershipDates[0] || null, to: membershipDates.at(-1) || null }, factorSnapshots: factorDates.length, factorFrom: factorDates[0] || null, factorTo: factorDates.at(-1) || null };
  } else if (kind.id === "FACTOR_RANKING_BACKTEST") {
    sourceWindow = { factorSnapshots: factorDates.length, factorFrom: factorDates[0] || null, factorTo: factorDates.at(-1) || null, membershipSnapshots: membershipDates.length, membershipFrom: membershipDates[0] || null, membershipTo: membershipDates.at(-1) || null };
  }
  return { id: kind.id, label: kind.label, enginePath: source.enginePath, relatedEnginePaths: source.relatedEnginePaths || [], producerPath: source.producerPath || null, relatedProducerPaths: source.relatedProducerPaths || [], producerDescription: source.producerDescription || null,
    executionScope: source.certificationClass, dataInputs: source.inputs, executionPathPresent: true, directTests: source.tests,
    status: kind.status, readiness: kind.readiness, reason: kind.reason, gates: gateStates, historicalCoverage: sourceWindow };
});

const seriesDigestInput = longSeries.map((s) => [s.securityId, s.ticker, s.from, s.to, s.barCount, s.priceSeriesType].join("|")).sort().join("\n");
const dump = {
  schemaVersion: "backtest-historical-capability-1.0.0",
  diagnosticOnly: true,
  generatedAt: new Date().toISOString(),
  sourceArtifactsLatestGeneratedAt: new Date(Math.max(Date.parse(signal.generatedAt), Date.parse(setup.generatedAt), Date.parse(certification.generatedAt))).toISOString(),
  repositoryMainAsOf: certification.asOf,
  note: "Repository-only inspection. No provider calls, backfill, private runner store, or production mutation. codeCanExecute means an execution path exists; it does not mean the real historical data contract is complete or the result is certified.",
  sourceArtifacts: {
    certification: { path: "quant/data/product/backtest-certification-v1.json", schemaVersion: certification.schemaVersion, generatedAt: certification.generatedAt, asOf: certification.asOf },
    readiness: { path: "quant/data/product/backtest-readiness-v2.json", schemaVersion: readiness.schemaVersion, generatedAt: readiness.generatedAt },
    signalStudy: { path: "quant/data/product/signal-backtest-v1.json", schemaVersion: signal.schemaVersion, engineVersion: signal.engineVersion, generatedAt: signal.generatedAt, asOf: signal.asOf },
    totalReturn: { path: "quant/data/product/total-return-quality-v1.json", contract: totalReturn.contract, generatedAt: totalReturn.generatedAt, asOf: totalReturn.asOf },
    setupStudy: { path: "quant/data/product/setup-backtest-v1.json", engineVersion: setup.engineVersion, generatedAt: setup.generatedAt, asOf: setup.asOf }
  },
  historicMaximum: {
    universeSeries: { fileCount: longFiles.length, validatedRealSplitAdjustedSeries: longSeries.length, invalidSeries: invalidSeries, duplicateOrUnorderedObservations: duplicateOrUnordered, nonPositivePriceObservations: nonPositive, earliestDate: allSortedDates[0] || null, latestDate: allSortedDates.at(-1) || null, frequency: "weekly", fieldsAvailable: ["date", "split_adjusted_close"], fieldsAbsent: ["OHLC", "volume", "intraday", "historical_provider_vintage"], manifestHash: sha256(seriesDigestInput) },
    nvda: nvda ? { securityId: nvda.securityId, ticker: nvda.ticker, provider: nvda.provider, dataMode: nvda.dataMode, priceSeriesType: nvda.priceSeriesType, from: nvda.from, to: nvda.to, bars: nvda.points.length, splitEvents: nvda.corporateActions?.splits?.length || 0, sourceBars: nvda.sourceBarCount, sourceFirst: nvda.sourceFirst, sourceLast: nvda.sourceLast, priceOnlySignalEligibility: nvdaRange, existingSignalEngineSmokeRun: nvdaSignals, returnBasis: "SPLIT_ADJUSTED_PRICE; dividends are not included", note: nvda.note } : null,
    periodDefinitions: { "1Y": 366, "3Y": 1096, "5Y": 1827, "10Y": 3653, "MAX": "all eligible observations after dependency warm-up" }
  },
  dataQuality: {
    totalReturnSignalCoverage: signal.source.totalReturnCoverage,
    totalReturnRejected: totalReturn.rejected,
    survivorship: survivorship.delisted,
    historicalListingCoverage: survivorship.historicalSecurityMasterCoverage,
    historicalIndexMembership: { snapshots: membershipDates.length, dates: membershipDates, latestPublishedCurrentIndexAsOf: (membershipIndex.indexes || []).map((x) => x.asOf).sort().at(-1) || null, limitation: "Repository history directory has only a small recent snapshot set; full historical adds/removes are not established." },
    factorHistory: { methodologySeries: factorIndex.series, totalSnapshots: factorDates.length, earliest: factorDates.sort()[0] || null, latest: [...factorDates].sort().at(-1) || null, maxPermittedGapDays: 45 },
    regimeHistory: { snapshots: regimeFiles.length, from: regimeDates[0] || null, to: regimeDates.at(-1) || null, existingPathRequirements: regimeMethod.tiers.PATH_DEPENDENT.minimumOrderedObservations + " ordered observations over " + regimeMethod.tiers.PATH_DEPENDENT.minimumObservationDays + " days", regimeTransitionsCertified: false }
  },
    backtestKinds: kinds,
  limits: ["Weekly price series are split-adjusted price, not total return.", "Listing series do not reconstruct a complete historical all-tradeable universe.", "The published strategy engine execution path is synthetic/mock; real PIT factor and membership history are not wired into its data provider.", "Private runner-only history was not read.", "This dump is diagnostic, not a certification artifact."]
};

const serialized = JSON.stringify(dump, null, 2) + "\n";
if (process.argv.includes("--write")) {
  const output = P("quant/data/product/backtest-historical-capability-v1.json");
  writeFileSync(output, serialized);
  process.stdout.write(JSON.stringify({ output: "quant/data/product/backtest-historical-capability-v1.json", kinds: kinds.length, nvdaFrom: nvda?.from, nvdaEligibleFrom: nvdaRange?.earliestEligibleBacktestDate, series: longSeries.length }) + "\n");
} else process.stdout.write(serialized);
