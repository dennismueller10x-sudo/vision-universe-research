/* Materialize Technical, Signals and Elliott Product Data from the existing
 * private canonical history. No provider request and no public history API. */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";

const require = createRequire(import.meta.url);
const rootDefault = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
function arg(name, fallback = null) { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback; }
const root = arg("--root", rootDefault);
const workDir = arg("--work-dir", join(root, ".market-cache"));
const outDir = arg("--out", join(root, "quant", "data", "product", "technical-signals-v1"));
const limit = parseInt(arg("--limit", "0"), 10) || 0;
const now = arg("--now", new Date().toISOString());
const minTechnicalBars = 300;
const signalLookbacks = [5, 20, 60];

const Canonical = require(join(root, "quant/engines/technical/canonical-bars.js"));
const Analysis = require(join(root, "quant/engines/technical/technical-analysis.js"));
const Product = require(join(root, "quant/engines/technical/product-materialization.js"));
const MarketSignals = require(join(root, "quant/api/market-signal-contract.js"));
const Service = require(join(root, "quant/api/product-services.js"));
const Policy = require(join(root, "quant/engines/display-policy.js"));
const Query = require(join(root, "quant/engines/query.js"));
const calendar = JSON.parse(readFileSync(join(root, "quant/config/market-calendar.json"), "utf8"));
const methodology = {
  technical: JSON.parse(readFileSync(join(root, "quant/methodology/technical-v1.json"), "utf8")),
  elliott: JSON.parse(readFileSync(join(root, "quant/methodology/elliott-v1.json"), "utf8"))
};
const recipes = Service.create({ loadJSON: async () => { throw new Error("NO_IO"); }, displayPolicy: Policy, queryEngine: Query }).getRecipes();

function load(path) { return JSON.parse(readFileSync(path, "utf8")); }
function historyFile(securityId) { return join(workDir, "tiingo", "daily", securityId + ".json"); }
function isDate(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + "T00:00:00Z")); }
function roundNumbers(_key, value) { return typeof value === "number" && !Number.isInteger(value) ? Math.round(value * 1e6) / 1e6 : value; }
function writeGzip(path, payload) {
  mkdirSync(dirname(path), { recursive: true });
  const raw = Buffer.from(JSON.stringify(payload, roundNumbers));
  const compressed = gzipSync(raw, { level: 9, mtime: 0 });
  writeFileSync(path, compressed);
  return { raw: raw.length, compressed: compressed.length };
}

function validatedInput(payload, member) {
  if (!payload || payload.ticker !== member.s || payload.securityId !== member.m || payload.provider !== "tiingo" ||
      payload.adjustmentStatus !== "adjusted" || !Array.isArray(payload.bars)) throw new Error("INVALID_HISTORY_PROVENANCE");
  let previous = null, splits = 0, dividends = 0;
  for (const bar of payload.bars) {
    if (!bar || bar.securityId !== member.m || !isDate(bar.date) || (previous && bar.date <= previous) ||
        ![bar.open, bar.high, bar.low, bar.close, bar.adjustedClose, bar.volume, bar.splitFactor].every(Number.isFinite) ||
        bar.open <= 0 || bar.high <= 0 || bar.low <= 0 || bar.close <= 0 || bar.adjustedClose <= 0 ||
        bar.volume < 0 || bar.splitFactor <= 0 || bar.high < Math.max(bar.open, bar.close, bar.low) ||
        bar.low > Math.min(bar.open, bar.close)) throw new Error("INVALID_HISTORY_BAR");
    if (bar.splitFactor !== 1) splits++;
    if (Number.isFinite(bar.dividend) && bar.dividend > 0) dividends++;
    previous = bar.date;
  }
  const observedAt = payload.updatedAt || payload.durableUpdatedAt;
  if (!observedAt || !Number.isFinite(Date.parse(observedAt)) || observedAt.slice(0, 10) < payload.bars.at(-1)?.date || Date.parse(observedAt) > Date.parse(now)) {
    throw new Error("INVALID_HISTORY_OBSERVED_AT");
  }
  const actions = [];
  for (const bar of payload.bars) {
    if (bar.splitFactor !== 1) actions.push({ type: "split", exDate: bar.date, ratio: bar.splitFactor });
    if (Number.isFinite(bar.dividend) && bar.dividend > 0) actions.push({ type: "dividend", exDate: bar.date, amount: bar.dividend });
  }
  const worlds = Canonical.fromPriceBars(payload.bars, actions, { instrumentId: member.s, source: "tiingo",
    sourceRevision: observedAt, currency: payload.currency || "USD", exchange: payload.exchange || "US" });
  const series = worlds.SPLIT_ADJUSTED, validation = Canonical.validateSeries(series);
  if (!validation.valid) throw new Error("INVALID_CANONICAL_SERIES:" + validation.errors[0]);
  const reconciled = { status: "PASS", method: "CANONICAL_SPLIT_FACTORS_V1", priceSeriesType: "SPLIT_ADJUSTED", events: splits };
  const signalBars = payload.bars.map((bar, i) => ({ ...bar, adjustedClose: series.close[i] }));
  return { series, signalSource: { ticker: member.s, securityId: member.m, provider: "tiingo", dataMode: "real",
    isMock: false, publishBasis: "CANONICAL_PRODUCT_MATERIALIZATION", currency: payload.currency || "USD",
    adjustmentStatus: "adjusted", updatedAt: observedAt, bars: signalBars, corporateActionReconciliation: reconciled },
    provenance: { observedAt, adjustmentStatus: payload.adjustmentStatus, splitEvents: splits, dividendEvents: dividends,
      corporateActionReconciliation: reconciled,
      calendarValidation: { status: "PASS", contract: "quant/config/market-calendar.json", exchange: "XNYS" } } };
}

export function materialize(options = {}) {
  const target = options.outDir || outDir, sourceDir = options.workDir || workDir;
  const universe = load(join(root, "quant/data/universe/market-capability.json"));
  let members = universe.members.slice().sort((a, b) => a.s.localeCompare(b.s));
  if (options.tickers) { const wanted = new Set(options.tickers); members = members.filter(m => wanted.has(m.s)); }
  else if (limit) members = members.slice(0, limit);
  const pathFor = (securityId) => join(sourceDir, "tiingo", "daily", securityId + ".json");

  rmSync(target, { recursive: true, force: true }); mkdirSync(target, { recursive: true });
  const shards = {}, signalPayloads = Object.fromEntries(signalLookbacks.map(n => [n, []]));
  const reasons = {}, rows = {}, stats = { productUniverse: members.length, historiesFound: 0, historiesValidated: 0,
    lookbackCovered: 0, adjustedProvenance: 0, splitFactors: 0, corporateActionsValidated: 0,
    calendarValidated: 0, technicalFullBundles: 0, signalsCapable: 0, elliottCapable: 0 };

  let benchmark = null;
  const benchmarkMember = universe.members.find(m => m.s === "SPY");
  if (benchmarkMember && existsSync(pathFor(benchmarkMember.m))) {
    try { benchmark = validatedInput(load(pathFor(benchmarkMember.m)), benchmarkMember).series; } catch { benchmark = null; }
  }

  function unavailableSignals(ticker, reason) {
    for (const lookback of signalLookbacks) signalPayloads[lookback].push({ ticker, state: "UNAVAILABLE", reason, events: [] });
  }

  for (const member of members) {
    const file = pathFor(member.m);
    if (!existsSync(file)) { rows[member.s] = { technical: "SOURCE_MISSING", signals: "SOURCE_MISSING", elliott: "NOT_RUN" }; unavailableSignals(member.s, "SOURCE_MISSING"); reasons.SOURCE_MISSING = (reasons.SOURCE_MISSING || 0) + 1; continue; }
    stats.historiesFound++;
    let input;
    try { input = validatedInput(load(file), member); }
    catch (error) { const reason = String(error.message).split(":")[0]; rows[member.s] = { technical: reason, signals: reason, elliott: "NOT_RUN" }; unavailableSignals(member.s, reason); reasons[reason] = (reasons[reason] || 0) + 1; continue; }
    stats.historiesValidated++; stats.adjustedProvenance++; stats.corporateActionsValidated++;
    stats.splitFactors += input.provenance.splitEvents;
    if (input.series.length >= 261) stats.lookbackCovered++;

    let signal60 = null;
    for (const lookback of signalLookbacks) {
      const result = MarketSignals.build(input.signalSource, { ticker: member.s, recipes, lookback, calendar, now });
      signalPayloads[lookback].push({ ticker: member.s, ...result });
      if (lookback === 60) signal60 = result;
    }
    if (signal60?.state === "AVAILABLE") { stats.signalsCapable++; stats.calendarValidated++; }

    if (member.t !== "TECHNICAL_READY" || input.series.length < minTechnicalBars) {
      rows[member.s] = { technical: "INSUFFICIENT_HISTORY", signals: signal60?.state || "UNAVAILABLE", elliott: "NOT_RUN", bars: input.series.length };
      continue;
    }
    if (signal60?.state !== "AVAILABLE") {
      const reason = signal60?.reason || "SIGNAL_CONTRACT_UNAVAILABLE";
      rows[member.s] = { technical: "CALENDAR_OR_SIGNAL_CONTRACT_UNAVAILABLE", signals: reason, elliott: "NOT_RUN", bars: input.series.length };
      reasons[reason] = (reasons[reason] || 0) + 1;
      continue;
    }
    try {
      const bundle = Analysis.analyze({ series: input.series,
        benchmarkSeries: member.s === "SPY" ? null : benchmark,
        methodology, options: { elliott: true, annotations: true, includeChartSeries: true, displayWindow: "1Y" } });
      const required = ["trend", "momentum", "volatility", "volume", "structure", "supportResistance", "confluence", "opportunityScore", "scenarios", "tradeSetup"];
      const missing = required.filter(key => !bundle[key]);
      if (missing.length) throw new Error("TECHNICAL_PARTIAL:" + missing.join(","));
      const artifact = Product.project({ ticker: member.s, securityId: member.m, series: input.series, bundle,
        benchmarkId: benchmark && member.s !== "SPY" ? "SPY" : null, provenance: input.provenance });
      const key = Product.shardKey(member.s);
      (shards[key] ||= {})[member.s] = artifact;
      stats.technicalFullBundles++;
      const elliottCapable = !!bundle.elliott && bundle.elliott.status !== "UNAVAILABLE" && bundle.elliott.status !== "INSUFFICIENT_DATA";
      if (elliottCapable) stats.elliottCapable++;
      rows[member.s] = { technical: "AVAILABLE", signals: signal60?.state || "UNAVAILABLE",
        elliott: elliottCapable ? "AVAILABLE" : "UNAVAILABLE", bars: input.series.length, asOf: bundle.dataCutoff, shard: key };
    } catch (error) {
      const reason = String(error.message).split(":")[0] || "TECHNICAL_FAILED";
      rows[member.s] = { technical: reason, signals: signal60?.state || "UNAVAILABLE", elliott: "NOT_RUN", bars: input.series.length };
      reasons[reason] = (reasons[reason] || 0) + 1;
    }
  }

  let rawBytes = 0, compressedBytes = 0;
  for (const key of Object.keys(shards).sort()) {
    const result = writeGzip(join(target, key + ".json.gz"), { schemaVersion: Product.VERSION, shard: key,
      generatedAt: now, instruments: shards[key] }); rawBytes += result.raw; compressedBytes += result.compressed;
  }
  for (const lookback of signalLookbacks) {
    const results = signalPayloads[lookback], available = results.filter(r => r.state === "AVAILABLE");
    writeGzip(join(target, "signals-" + lookback + ".json.gz"), { schemaVersion: "market-signals-product-1.0.0",
      generatedAt: now, lookback, scope: "CANONICAL_PRODUCT_UNIVERSE", results,
      events: available.flatMap(r => r.events).sort((a, b) => b.asOf.localeCompare(a.asOf) || a.ticker.localeCompare(b.ticker)),
      counts: { requested: results.length, available: available.length, unavailable: results.length - available.length } });
  }
  const summary = { schemaVersion: "technical-signals-product-summary-1.0.0", generatedAt: now,
    source: { history: "CANONICAL_R2_V1_TIINGO_DAILY_US", historyOwner: "quant/engines/history-store.js",
      technicalOwner: "quant/engines/technical/technical-analysis.js", signalOwner: "quant/api/market-signal-contract.js",
      calendar: "quant/config/market-calendar.json", methodology: methodology.technical.methodologyVersion,
      elliottMethodology: methodology.elliott.methodologyVersion }, counts: stats, reasons,
    artifacts: { shardCount: Object.keys(shards).length, rawBytes, compressedBytes, compression: "gzip", displayBars: Product.DISPLAY_BARS }, rows };
  writeFileSync(join(target, "summary.json"), JSON.stringify(summary));
  return summary;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const summary = materialize();
  console.log(JSON.stringify({ generatedAt: summary.generatedAt, counts: summary.counts, reasons: summary.reasons, artifacts: summary.artifacts }, null, 2));
  if (!limit && summary.counts.technicalFullBundles === 0) process.exitCode = 1;
}
