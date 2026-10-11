// Supplemental preregistered context only. No strategy execution, ranking,
// provider refresh, remote writes or public numerical performance output.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createS3DriverFromEnv } from '../../../market/storage/s3-driver.mjs';
import { preserveRawBars, prepareHistoricalData, privateDataConfigured } from './data.mjs';
import { portfolioMetrics } from './metrics.mjs';
import { benchmarkCurve } from './runner.mjs';
import { assertFreeze } from './freeze.mjs';
import { encryptForOwner } from '../../validation/lib.mjs';

const require = createRequire(import.meta.url), dir = path.dirname(fileURLToPath(import.meta.url));
const Core = require('../../../../quant/engines/canonical-total-return.js');
const ReturnSeries = require('../../../../quant/engines/return-series.js');
const Store = require('../../../../quant/engines/history-store.js');
const Guard = require('../../../../quant/engines/zero-cost-guard.js');
const Identity = require('../../../../core/identity.js');
export const CONTEXT_TICKERS = Object.freeze(['IWM', 'QQQ', 'IWV']);
const hash = (x) => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const validDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const missing = (ticker, reason, extras = {}) => ({ ticker, status: 'MISSING_NO_SUBSTITUTION', reason, metrics: null, ...extras });

export function validateContextProtocol(protocol) {
  if (!protocol?.registeredBeforePerformance || !protocol.noPostResultTuning) throw new Error('PREREGISTERED_PROTOCOL_REQUIRED');
  const w = protocol.window;
  if (!w || !['warmupFrom', 'from', 'to'].every((k) => validDate(w[k])) || w.warmupFrom > w.from || w.from > w.to) throw new Error('INVALID_CONTEXT_WINDOW');
  if (!finite(protocol.execution?.initialCapital) || protocol.execution.initialCapital <= 0 || protocol.execution.cashReturn !== 0 || protocol.benchmark?.riskFreeForSharpe !== 0) throw new Error('INVALID_CONTEXT_CAPITAL_CONTRACT');
  if (protocol.benchmark?.primary !== 'SPY_CANONICAL_TOTAL_RETURN' || JSON.stringify(protocol.benchmark.context) !== JSON.stringify(CONTEXT_TICKERS)) throw new Error('PREDECLARED_CONTEXTS_REQUIRED');
  return w;
}

function canonicalReference(series, ticker, sourceTicker, window) {
  if (!series) return missing(ticker, 'OBJECT_NOT_PRESENT', { sourceFingerprint: null });
  const sourceFingerprint = hash(series);
  if (series.ticker !== sourceTicker || (series.securityId && !Identity.consistent(ticker, series.securityId))) return missing(ticker, 'SOURCE_IDENTITY_CONFLICT', { sourceFingerprint });
  if (!Array.isArray(series.bars)) return missing(ticker, 'SOURCE_BARS_UNAVAILABLE', { sourceFingerprint });
  const raw = preserveRawBars(series.bars, window);
  if (raw.length < 2) return missing(ticker, 'INSUFFICIENT_BARS', { sourceFingerprint });
  if (raw.some((b, i) => !validDate(b.date) || (i && b.date <= raw[i - 1].date))) return missing(ticker, 'SOURCE_DATES_INVALID', { sourceFingerprint });
  if (raw.some((b) => !['open', 'high', 'low', 'close'].every((k) => finite(b[k]) && b[k] > 0) || !finite(b.volume) || b.volume < 0 || b.high < Math.max(b.open, b.low, b.close) || b.low > Math.min(b.open, b.high, b.close))) return missing(ticker, 'SOURCE_OHLCV_INVALID', { sourceFingerprint });
  const result = Core.reconstruct(raw, { role: 'BENCHMARK_REFERENCE', identity: { state: 'CONFIRMED', ticker, sourceTicker, basis: 'PREDECLARED_ETF_AND_EXACT_EXISTING_STORE_OBJECT' }, delisted: false });
  if (!result.reconstructed) return missing(ticker, 'CANONICAL_RETURN_UNAVAILABLE', { canonicalReason: result.reason, sourceFingerprint });
  const factors = ReturnSeries.splitFactors(raw);
  const bars = raw.map((b, i) => ({ date: b.date, open: b.open / factors[i], high: b.high / factors[i], low: b.low / factors[i], close: b.close / factors[i], volume: b.volume * factors[i], dividend: b.dividend / factors[i], splitFactor: b.splitFactor, totalReturnIndex: result.tr[i] }));
  return { ticker, status: 'CANONICAL_SOURCE_READY', raw, bars, sourceFingerprint, windowFingerprint: hash(raw), canonicalContract: result.contract, corporateActionContract: result.corporateActionContract, crossCheck: result.crossCheck, metrics: null };
}

// At most five series reads, all attempted independently. Failed/missing SPY
// prevents every context metric; context dates never shorten the primary window.
export async function collectContextBenchmarks({ protocol, getMainSeries, getPrimarySeries }) {
  const window = validateContextProtocol(protocol), diagnostics = [], attempts = [];
  async function read(ticker, sourceTicker, load, namespace) {
    attempts.push({ ticker, sourceTicker, namespace, status: 'ATTEMPTED' });
    try { return canonicalReference(await load(sourceTicker), ticker, sourceTicker, window); }
    catch (error) {
      diagnostics.push({ ticker, namespace, visibility: 'SEALED_ONLY', errorName: error?.name || 'Error', message: String(error?.message || error), stack: typeof error?.stack === 'string' ? error.stack : null });
      return missing(ticker, 'SOURCE_READ_OR_DECODE_FAILED', { sourceFingerprint: null });
    }
  }
  const [primary, mainSpy, ...contexts] = await Promise.all([
    read('SPY', 'SPY@1993-01-29', getPrimarySeries, 'TIINGO_DELISTED_PRIMARY'),
    read('SPY', 'SPY', getMainSeries, 'TIINGO_MAIN_PARITY'),
    ...CONTEXT_TICKERS.map((t) => read(t, t, getMainSeries, 'TIINGO_MAIN_CONTEXT'))
  ]);
  let calendar = [], primaryBars = [], primaryReason = primary.reason || null;
  if (primary.status === 'CANONICAL_SOURCE_READY') {
    // Exact frozen historical SPY normalization, including causal quarantine.
    const normalized = prepareHistoricalData({ listings: [], segs: [], spyRaw: primary.raw, calendar: primary.raw.map((b) => b.date).filter((d) => d >= window.from) }, window);
    if (normalized.coverage.benchmarkAvailable) {
      primaryBars = normalized.benchmark.bars;
      calendar = normalized.calendar;
      if (calendar[0] !== window.from || calendar.at(-1) !== window.to) { primaryReason = 'PRIMARY_WINDOW_ENDPOINT_MISSING'; calendar = []; }
    } else primaryReason = 'PRIMARY_FROZEN_CANONICAL_QUARANTINE';
  }
  const primaryReady = calendar.length >= 2;
  const primaryMetrics = primaryReady ? portfolioMetrics(benchmarkCurve({ benchmark: { bars: primaryBars }, calendar }, protocol.execution.initialCapital), { initialCapital: protocol.execution.initialCapital, executionCosts: 0 }) : null;
  const results = contexts.map((context) => {
    if (context.status !== 'CANONICAL_SOURCE_READY') return context;
    if (!primaryReady) return missing(context.ticker, 'PRIMARY_SPY_UNAVAILABLE', { sourceFingerprint: context.sourceFingerprint, windowFingerprint: context.windowFingerprint });
    const byDate = new Map(context.bars.map((b) => [b.date, b]));
    const absentSessions = calendar.filter((d) => !byDate.has(d)).length;
    if (absentSessions || context.raw[0].date > primaryBars[0].date) return missing(context.ticker, 'PRIMARY_CALENDAR_OR_WARMUP_GAP', { sourceFingerprint: context.sourceFingerprint, windowFingerprint: context.windowFingerprint, absentSessions });
    const curve = benchmarkCurve({ benchmark: { bars: context.bars }, calendar }, protocol.execution.initialCapital);
    const metrics = portfolioMetrics(curve, { initialCapital: protocol.execution.initialCapital, executionCosts: 0 });
    if (metrics.status !== 'READY') return missing(context.ticker, 'METRICS_UNAVAILABLE', { sourceFingerprint: context.sourceFingerprint, windowFingerprint: context.windowFingerprint });
    return { ticker: context.ticker, status: 'AVAILABLE', reason: null, metrics, sourceFingerprint: context.sourceFingerprint, windowFingerprint: context.windowFingerprint, canonicalContract: context.canonicalContract, corporateActionContract: context.corporateActionContract, sourceBars: context.raw.length, matchedSessions: calendar.length, offPrimaryCalendarSessions: context.bars.filter((b) => b.date >= window.from && !calendar.includes(b.date)).length, crossCheck: context.crossCheck };
  });
  let parity = { status: 'UNAVAILABLE', reason: !primaryReady ? 'PRIMARY_SPY_UNAVAILABLE' : mainSpy.reason || null };
  if (primaryReady && mainSpy.status === 'CANONICAL_SOURCE_READY') {
    const main = new Map(mainSpy.bars.map((b) => [b.date, b])), original = new Map(primaryBars.map((b) => [b.date, b]));
    const gaps = calendar.filter((d) => !main.has(d)).length;
    if (gaps) parity = { status: 'UNAVAILABLE', reason: 'PRIMARY_CALENDAR_GAP', missingSessions: gaps };
    else {
      const anchorA = main.get(calendar[0]).totalReturnIndex, anchorB = original.get(calendar[0]).totalReturnIndex;
      const deviations = calendar.map((d) => Math.abs((main.get(d).totalReturnIndex / anchorA) / (original.get(d).totalReturnIndex / anchorB) - 1));
      parity = { status: deviations.every((d) => d <= 1e-10) ? 'MATCH' : 'DIFFERENT', reason: null, matchedSessions: calendar.length, maxRelativeDeviation: Math.max(...deviations), tolerance: 1e-10, mainSpyMetrics: portfolioMetrics(benchmarkCurve({ benchmark: { bars: mainSpy.bars }, calendar }, protocol.execution.initialCapital), { initialCapital: protocol.execution.initialCapital, executionCosts: 0 }) };
    }
  }
  return { schema: 'supertrader-auxiliary-context-private-1.0.0', status: primaryReady ? 'CONTEXT_ATTEMPTS_COMPLETED' : 'CONTEXT_UNAVAILABLE_PRIMARY_SPY', protocol, window, attempts, primary: { status: primaryReady ? 'AVAILABLE' : 'MISSING_NO_SUBSTITUTION', reason: primaryReady ? null : primaryReason, sourceFingerprint: primary.sourceFingerprint, windowFingerprint: primary.windowFingerprint || null, metrics: primaryMetrics }, mainSpy: { status: mainSpy.status, sourceFingerprint: mainSpy.sourceFingerprint }, parity, contexts: results, calendarFingerprint: primaryReady ? hash(calendar) : null, sessions: calendar.length, execution: { initialCapital: protocol.execution.initialCapital, executionCosts: 0, cashReturn: 0, benchmarkBuyAndHold: true }, coreContractHash: hash({ contracts: Core.contractVersions(), config: Core.CONFIG, split: ReturnSeries.ENGINE_VERSION }), privateDiagnostics: diagnostics, limitations: ['SUPPLEMENTAL_PREDECLARED_CONTEXT_ONLY', 'NO_METHOD_RERUN_OR_RANKING', 'NO_NEW_PROVIDER_OR_REMOTE_WRITES', 'EXISTING_STORE_SNAPSHOT_ONLY', 'MISSING_SERIES_NEVER_SUBSTITUTED', 'PRIMARY_SPY_FROZEN_NORMALIZATION_REQUIRED', 'CONTEXT_FULL_WINDOW_CANONICAL_VALIDATION', 'NO_DATE_INTERSECTION_SHORTENING', 'ZERO_BENCHMARK_TRANSACTION_COSTS_MATCH_PRIMARY_BASELINE'] };
}

export function contextPublicStatus(report) {
  return { status: report.status, attemptedSeries: report.attempts.length, contextsRequested: CONTEXT_TICKERS.length, contextsAvailable: report.contexts.filter((r) => r.status === 'AVAILABLE').length, contextsMissing: report.contexts.filter((r) => r.status !== 'AVAILABLE').length, primary: report.primary.status, parity: report.parity.status, ...Object.fromEntries(report.contexts.map((r) => [r.ticker, r.status])) };
}

export function parseContextArguments(argv) {
  if (argv.length !== 2 || argv[0] !== '--out' || !argv[1] || argv[1].startsWith('--')) throw new Error('EXPLICIT_OUT_REQUIRED');
  return { out: path.resolve(argv[1]) };
}

async function configuredReaders() {
  if (!privateDataConfigured()) throw new Error('PRIVATE_DATA_NOT_CONFIGURED');
  const driver = createS3DriverFromEnv(process.env), budget = Guard.createBudget({ classAOperations: 0, classBOperations: 30000 });
  const main = Store.createHistoryStore({ driver, provider: 'tiingo', market: 'US', budget });
  const primary = Store.createHistoryStore({ driver, provider: 'tiingo-delisted', market: 'US', budget });
  const [a, b] = await Promise.all([main.readUsage(), primary.readUsage()]);
  const usage = Guard.applyUsage(a, { classAOperations: b.classAOperations, classBOperations: b.classBOperations });
  if (Guard.evaluate({ usage, estimate: Guard.estimateOperations({ kind: 'VALIDATION_ANALYZE', objectReads: 5 }), operation: 'VALIDATION_ANALYZE' }).verdict !== Guard.ALLOWED) throw new Error('ZERO_COST_GUARD_BLOCKED');
  return { getMainSeries: (t) => main.getSeries(t), getPrimarySeries: (t) => primary.getSeries(t) };
}

async function main(argv) {
  const { out } = parseContextArguments(argv);
  let report;
  const protocolBytes = fs.readFileSync(path.join(dir, 'protocol.json'));
  const protocol = JSON.parse(protocolBytes);
  const freeze = JSON.parse(fs.readFileSync(path.join(dir, 'SUPERTRADER-METHOD-FREEZES.json'), 'utf8'));
  assertFreeze(freeze);
  const protocolSha256 = crypto.createHash('sha256').update(protocolBytes).digest('hex');
  if (freeze.protocolHash !== protocolSha256) throw new Error('FROZEN_PROTOCOL_HASH_MISMATCH');
  const openedAt = new Date().toISOString();
  // Captured before any store read or metric calculation. Supplemental code is
  // bound separately; the original tournament freeze stays byte-for-byte intact.
  const auxiliaryProvenance = { openedAt, codeCommit: process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: path.resolve(dir, '../../../..'), encoding: 'utf8' }).trim(), auxiliaryCodeSha256: crypto.createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex'), protocolSha256, frozenProtocolHash: freeze.protocolHash, preregisteredContexts: [...CONTEXT_TICKERS], capturedBeforeCalculation: true };
  try { report = await collectContextBenchmarks({ protocol, ...await configuredReaders() }); }
  catch (error) { report = { schema: 'supertrader-auxiliary-context-private-1.0.0', status: 'CONTEXT_ACCESS_BLOCKED', protocol, attempts: [], primary: { status: 'MISSING_NO_SUBSTITUTION' }, parity: { status: 'UNAVAILABLE' }, contexts: CONTEXT_TICKERS.map((t) => missing(t, 'ACCESS_OR_BUDGET_BLOCKED')), privateDiagnostics: [{ visibility: 'SEALED_ONLY', message: String(error?.message || error), stack: typeof error?.stack === 'string' ? error.stack : null }] }; }
  report.freeze = freeze; report.openedAt = openedAt; report.closedAt = new Date().toISOString();
  report.auxiliaryProvenance = auxiliaryProvenance;
  fs.mkdirSync(out, { recursive: true });
  const buf = Buffer.from(JSON.stringify(report));
  for (const [tag, file] of [['owner', path.join(dir, '../../validation/results-public-key.pem')], ['session', path.join(dir, 'session-public-key.pem')]]) fs.writeFileSync(path.join(out, `context-benchmark-results.${tag}.sealed.json`), encryptForOwner(fs.readFileSync(file, 'utf8'), buf));
  const status = contextPublicStatus(report);
  fs.writeFileSync(path.join(out, 'context-benchmark-status.json'), JSON.stringify(status, null, 2) + '\n');
  console.log(JSON.stringify(status));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(() => { console.log(JSON.stringify({ status: 'CONTEXT_RUN_FAILED' })); process.exitCode = 2; });
