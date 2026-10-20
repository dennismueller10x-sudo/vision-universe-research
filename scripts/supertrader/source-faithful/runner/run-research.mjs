#!/usr/bin/env node
/**
 * Source-faithful research runner: diagnostic historical runs on the frozen research snapshot with research-v1
 * accounting. Fails closed before any computation when:
 *  - --accounting is not research-v1 (RESEARCH_ACCOUNTING_REQUIRED);
 *  - --snapshot is missing or malformed (SNAPSHOT_REQUIRED);
 *  - the snapshot cannot be opened with an independent RESTORE receipt, an object hash or the dataset fingerprint
 *    differs (INPUT_INTEGRITY_FAILURE, snapshot/snapshot.mjs);
 *  - the snapshot code fingerprint changed (verifyAgainstManifest then cannot compare the dataset): refused unless
 *    --allow-code-version-change is given, and then recorded in the receipt (review SF-R4-01);
 *  - a requested method is not DIAGNOSTIC_READY in the registry (METHOD_NOT_BACKTEST_READY).
 * Results are DIAGNOSTIC_NOT_CERTIFIED and sealed for the owner (validation/results-public-key.pem); the public file
 * holds only hashes, counts and pass flags (price and metric rights are unresolved, docs/SUPERTRADER_BACKTEST_DATA_FEASIBILITY.md).
 *
 *   node scripts/supertrader/source-faithful/runner/run-research.mjs --snapshot sts1-<id> --accounting research-v1 \
 *        --methods SF_TURTLE_S1,SF_TURTLE_S2 --out <dir> [--limit 400 --smoke-snapshot]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as L from '../../validation/lib.mjs';
import { runTurtle } from '../methods/turtle.mjs';
import { darvasComponentTrades } from '../methods/darvas.mjs';
import { datasetFromPit } from './snapshot-input.mjs';
import { computeDiagnosticMetrics } from './metrics.mjs';
import { CONTRACTS, registryEntry } from '../registry.mjs';
import { loadExtract } from '../evidence/psr709-extract.mjs';
import { reproducibilityReceipt, contractFingerprint, FOUNDATION } from '../contract.mjs';
import { RESEARCH_UNIVERSE, eligibleAtPriorSession } from '../common/series.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
export const RUNNER_VERSION = 'sf-runner-1.1.0';
export const SCENARIO_SET = Object.freeze([
  { id: 'BASE_S0', scenario: 'S0_LAST_PRICE' },
  { id: 'DELIST_S1_MINUS_30', scenario: 'S1_MINUS_30' },
  { id: 'DELIST_S2_DISTRESS_ZERO', scenario: 'S2_DISTRESS_ZERO' },
  { id: 'COST2_S1', scenario: 'S1_MINUS_30', slippageBps: 20, commissionBps: 2 },
  { id: 'DATA_EVENT_MINUS_30', scenario: 'S0_LAST_PRICE', dataEventScenario: 'UNKNOWN_PROCEEDS_MINUS_30_PERCENT' },
  // second reading of the SOURCE_AMBIGUOUS failsafe exit (TUR-SF-FAILSAFE-EXIT): 20-day exit; affects System 1 only
  { id: 'FAILSAFE_EXIT_20D', scenario: 'S0_LAST_PRICE', failsafeExit: '20D' },
]);
const SPLIT_PERIODS = [['2016-01-04', '2020-12-31'], ['2021-01-01', L.WINDOW.to]];

/** Method id -> runner. Only methods the registry marks DIAGNOSTIC_READY may run. */
export const RUNNABLE = Object.freeze({
  SF_TURTLE_S1: (ds, o) => { const r = runTurtle(ds, { system: 'S1', ...o }); return { run: r, trades: r.positionTrades }; },
  SF_TURTLE_S2: (ds, o) => { const r = runTurtle(ds, { system: 'S2', ...o }); return { run: r, trades: r.positionTrades }; },
});

/**
 * Component signal studies (backtestReadiness COMPONENT_SIGNAL_STUDY_ONLY): the mechanical part of a manual-review
 * method, every machine signal of the research universe with its mechanical exit, equal weight, no sizing, no
 * selection. Reported as trade-level statistics, never as a method return.
 */
export const COMPONENT_STUDIES = Object.freeze({
  SF_DARVAS_BOX: (sec, o) => darvasComponentTrades(sec, o).map((t) => ({ ...t, entryIndex: sec.bars.findIndex((b) => b.date === t.entryDate) })),
});

const CODE_FILES = ['source-faithful/methods/turtle.mjs', 'source-faithful/methods/darvas.mjs', 'source-faithful/common/series.mjs', 'source-faithful/runner/run-research.mjs', 'source-faithful/runner/metrics.mjs', 'source-faithful/runner/snapshot-input.mjs', 'source-faithful/contract.mjs', 'validation/accounting-contract.mjs', 'validation/portfolio.mjs', 'validation/lib.mjs'];
export function codeSha256() {
  const h = crypto.createHash('sha256');
  for (const f of CODE_FILES) { h.update(f); h.update(fs.readFileSync(path.join(ROOT, 'scripts/supertrader', f))); }
  return h.digest('hex');
}

/** Gate: method is registered, implemented and DIAGNOSTIC_READY. */
export function assertBacktestReady(methodId, extract = loadExtract()) {
  const c = CONTRACTS.find((x) => x.strategyId === methodId);
  if (!c) throw new Error(`UNKNOWN_METHOD:${methodId}`);
  const e = registryEntry(c, extract);
  if (e.backtestReadiness !== 'DIAGNOSTIC_READY' || !RUNNABLE[methodId]) throw new Error(`METHOD_NOT_BACKTEST_READY:${methodId}:${e.backtestReadiness}`);
  if (!e.contractValidation.ok) throw new Error(`CONTRACT_INVALID:${methodId}`);
  return { contract: c, entry: e };
}

/** Gate for component studies: implemented, valid, COMPONENT_SIGNAL_STUDY_ONLY. */
export function assertComponentStudy(methodId, extract = loadExtract()) {
  const c = CONTRACTS.find((x) => x.strategyId === methodId);
  if (!c) throw new Error(`UNKNOWN_METHOD:${methodId}`);
  const e = registryEntry(c, extract);
  if (e.backtestReadiness !== 'COMPONENT_SIGNAL_STUDY_ONLY' || !COMPONENT_STUDIES[methodId]) throw new Error(`METHOD_NOT_COMPONENT_STUDY:${methodId}:${e.backtestReadiness}`);
  return { contract: c, entry: e };
}

const quantile = (s, q) => (s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : null);
/** Trade-level statistics of a component study, net of the research execution costs (10 bp + 1 bp per side). */
export function componentStudy(methodId, dataset, { snapshotId, datasetSha256, accounting, from = L.WINDOW.from, to = L.WINDOW.to, slippageBps = 10, commissionBps = 1, runId = 'local', commit = null, inputs = {} } = {}) {
  if (accounting !== FOUNDATION.accounting.mode) throw new Error('RESEARCH_ACCOUNTING_REQUIRED');
  if (!datasetSha256) throw new Error('DATASET_SHA_REQUIRED');
  const { contract, entry } = assertComponentStudy(methodId);
  const slip = slippageBps / 1e4, fee = commissionBps / 1e4, trades = [];
  const net = (entryFill, exitPx) => (exitPx * (1 - fee)) / (entryFill * (1 + slip) * (1 + fee)) - 1;
  for (const sec of dataset.securities) for (const t of COMPONENT_STUDIES[methodId](sec, { from, to })) {
    if (!(t.entryIndex > 0) || !eligibleAtPriorSession(sec.bars, t.entryIndex, RESEARCH_UNIVERSE)) continue;
    // research-v1 terminal semantics (review SF-R3-03 / SF-R4-03): a trade still open at an inactive listing is
    // settled by the delisting scenarios, at a data gap at the last valid close (data-event sensitivity -30 %)
    let end = 'CLOSED', exitBase = t.exitFill, exitS1 = t.exitFill;
    if (t.exitFill == null) {
      const last = sec.bars.at(-1).close, cause = sec.terminal?.cause ?? null;
      if (cause === 'LISTING_INACTIVE') { end = 'OPEN_AT_DELISTING'; exitBase = last * (1 - slip); exitS1 = last * 0.7; }
      else if (cause === 'DATA_GAP') { end = 'OPEN_AT_DATA_GAP'; exitBase = last * (1 - slip); exitS1 = last * 0.7 * (1 - slip); }
      else { end = 'OPEN_AT_WINDOW_END'; exitBase = last * (1 - slip); exitS1 = exitBase; }
    } else { exitBase = t.exitFill * (1 - slip); exitS1 = exitBase; }
    trades.push({ ...t, end, ret: net(t.entryFill, exitBase), retS1: net(t.entryFill, exitS1) });
  }
  const stats = (key) => {
    const r = trades.map((t) => t[key]).sort((a, b) => a - b), wins = r.filter((x) => x > 0), losses = r.filter((x) => x < 0);
    return { hitRate: r.length ? wins.length / r.length : null, mean: r.length ? r.reduce((a, b) => a + b, 0) / r.length : null, median: quantile(r, 0.5), p05: quantile(r, 0.05), p95: quantile(r, 0.95), profitFactor: losses.length ? wins.reduce((a, b) => a + b, 0) / -losses.reduce((a, b) => a + b, 0) : null };
  };
  const byYear = {}; for (const t of trades) { const y = t.entryDate.slice(0, 4); (byYear[y] ||= { n: 0, wins: 0 }).n++; if (t.ret > 0) byYear[y].wins++; }
  const ends = {}; for (const t of trades) ends[t.end] = (ends[t.end] || 0) + 1;
  const receipt = reproducibilityReceipt({ snapshotId, datasetSha256, accounting, codeSha256: codeSha256(), contractFingerprint: contractFingerprint(contract), params: { from, to, universe: RESEARCH_UNIVERSE, slippageBps, commissionBps, kind: 'COMPONENT_SIGNAL_STUDY', ...inputs }, runId, commit });
  return {
    schema: 'supertrader-sf-component-study-1.0.0', runner: RUNNER_VERSION, certification: FOUNDATION.certification, label: 'COMPONENT_SIGNAL_STUDY_NOT_A_METHOD_RETURN', method: methodId,
    implementationStatus: entry.implementationStatus, manualReviewRequirements: entry.manualReviewRequirements.map((m) => m.id), receipt, window: { from, to }, inputs,
    stats: { signals: trades.length, endStates: ends, base: stats('ret'), delistingMinus30: stats('retS1'), medianHeldSessions: quantile(trades.map((t) => t.heldSessions).sort((a, b) => a - b), 0.5), entryBarStops: trades.filter((t) => t.entryBarStop).length, byYear },
    population: 'research universe protocol of #705 at the prior session (convention, DAR-SF-RESEARCH-POPULATION)',
    ...coverageOf(dataset, from, to),
    tradesSha256: crypto.createHash('sha256').update(JSON.stringify(trades)).digest('hex'),
  };
}

const coverageOf = (dataset, from, to) => ({
  dataCoverage: { securities: dataset.securities.length, delistedSecurities: dataset.securities.filter((s) => s.terminal?.cause === 'LISTING_INACTIVE').length, dataGapSegments: dataset.securities.filter((s) => s.terminal?.cause === 'DATA_GAP').length, bars: dataset.securities.reduce((a, s) => a + s.bars.length, 0), sessions: dataset.calendar.filter((d) => d >= from && d <= to).length },
  survivorship: 'point-in-time listing table incl. inactive listings (snapshot); economic delistings settled by scenario; survivors-only is not run',
  dataFindings: ['V4-D1 (BLOCKER for certification, OPEN): undeclared reverse splits in about 1 % of security-months of the canonical price core; inherited by this run'],
});

/** Pure part: runs every scenario of one method on a dataset; returns the (unsealed) result. */
export function runMethod(methodId, dataset, { snapshotId, datasetSha256, accounting, from = L.WINDOW.from, to = L.WINDOW.to, initialCapital = 100000, runId = 'local', commit = null, inputs = {} } = {}) {
  if (accounting !== FOUNDATION.accounting.mode) throw new Error('RESEARCH_ACCOUNTING_REQUIRED');
  if (!datasetSha256) throw new Error('DATASET_SHA_REQUIRED'); // binding to the verified snapshot dataset (review SF-R3-07)
  const { contract, entry } = assertBacktestReady(methodId);
  const runs = {};
  for (const sc of SCENARIO_SET) {
    const { run, trades } = RUNNABLE[methodId](dataset, { from, to, initialCapital, scenario: sc.scenario, dataEventScenario: sc.dataEventScenario, failsafeExit: sc.failsafeExit, slippageBps: sc.slippageBps ?? 10, commissionBps: sc.commissionBps ?? 1 });
    if (!run.reconciliation.pass) throw new Error(`RECONCILIATION_FAILED:${methodId}:${sc.id}`);
    runs[sc.id] = {
      metrics: computeDiagnosticMetrics({ curve: run.curve, trades, ledger: run.ledger, costs: run.counts.costs, spyTR: dataset.spyTR, splitPeriods: SPLIT_PERIODS, initialCapital }),
      counts: run.counts, filterCounts: run.filterCounts ?? null, staleCounts: run.staleCounts, rejections: run.rejections.length,
      reconciliation: run.reconciliation, endingPositionCheck: run.endingPositionCheck, openAtEnd: run.openAtEnd.length,
      correlationLimits: run.correlationLimits ?? null, liquidity: run.liquidity ?? null,
      ledgerSha256: crypto.createHash('sha256').update(JSON.stringify(run.ledger)).digest('hex'),
    };
  }
  const receipt = reproducibilityReceipt({ snapshotId, datasetSha256, accounting, codeSha256: codeSha256(), contractFingerprint: contractFingerprint(contract), params: { from, to, initialCapital, universe: RESEARCH_UNIVERSE, scenarios: SCENARIO_SET, ...inputs }, runId, commit });
  return {
    schema: 'supertrader-sf-research-result-1.0.0', runner: RUNNER_VERSION, certification: FOUNDATION.certification, method: methodId,
    implementationStatus: entry.implementationStatus, statusByScope: entry.statusByScope, knownLimitations: contract.knownLimitations,
    receipt, window: { from, to }, inputs,
    ...coverageOf(dataset, from, to),
    runs,
  };
}

/** Execution counters (no prices) that the public view may carry for the regression comparison. */
const PUBLIC_COUNTS = ['entries', 'adds', 'failsafeEntries', 'skippedByFilter', 'rejectNoCash', 'rejectZeroUnit', 'rejectUnitLimit12', 'rejectCorrelationLimit6', 'rejectCorrelationLimit10', 'unitStopExits', 'channelExits', 'sameBarEntryStops', 'sameBarAddStops', 'sameBarEntryChannelExits', 'noAddAfterStopSameBar', 'terminalSettlements', 'unavailableSettlements', 'filterResolvedIntrabar', 'reentrySameBarAsExit', 'correlationGroupMissing'];
export const executionCountsOf = (c = {}) => Object.fromEntries(PUBLIC_COUNTS.filter((k) => c[k] !== undefined).map((k) => [k, c[k]]));

/** Public, hash-only view of a result (safe for the public repository and logs). */
export function publicView(result) {
  if (result.schema === 'supertrader-sf-component-study-1.0.0') return { schema: 'supertrader-sf-research-public-1.1.0', method: result.method, certification: result.certification, label: result.label, receiptSha256: result.receipt.receiptSha256, snapshotId: result.receipt.snapshotId, codeSha256: result.receipt.codeSha256, tradesSha256: result.tradesSha256, signals: result.stats.signals, inputs: result.inputs };
  return { schema: 'supertrader-sf-research-public-1.1.0', method: result.method, certification: result.certification, receiptSha256: result.receipt.receiptSha256, snapshotId: result.receipt.snapshotId, codeSha256: result.receipt.codeSha256, contractFingerprint: result.receipt.contractFingerprint,
    scenarios: Object.fromEntries(Object.entries(result.runs).map(([k, v]) => [k, { reconciliation: v.reconciliation.pass, endingPositionCheck: v.endingPositionCheck.status, ledgerSha256: v.ledgerSha256, trades: v.metrics.trades, executionCounts: executionCountsOf(v.counts), correlationLimits: v.correlationLimits ?? null, liquidity: v.liquidity ? { fills: v.liquidity.fills, participationOfBarVolumeP50: v.liquidity.participationOfBarVolume.p50, participationOfAdv20P50: v.liquidity.participationOfAdv20.p50 } : null }])), dataCoverage: result.dataCoverage, inputs: result.inputs };
}

async function main() {
  const argv = process.argv.slice(2), arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  const accounting = arg('--accounting');
  if (accounting !== 'research-v1') { console.error('RESEARCH_ACCOUNTING_REQUIRED'); process.exit(2); }
  const snapshotId = arg('--snapshot');
  if (!/^sts1-[0-9a-f]{32}$/.test(snapshotId || '')) { console.error('SNAPSHOT_REQUIRED'); process.exit(2); }
  const methods = (arg('--methods', [...Object.keys(RUNNABLE), ...Object.keys(COMPONENT_STUDIES)].join(','))).split(',').map((s) => s.trim()).filter(Boolean);
  const OUT = arg('--out'); if (!OUT) { console.error('--out required'); process.exit(2); }
  const LIMIT = Number(arg('--limit', '0'));
  for (const m of methods) (COMPONENT_STUDIES[m] ? assertComponentStudy : assertBacktestReady)(m); // gate before any data access
  const t0 = Date.now(), log = (m) => console.log(`[sf-research +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
  const K = await import('../../snapshot/contract.mjs');
  let pit, datasetSha256, verification;
  try {
    const { LIVE_IO, loadPitData } = await import('../../validation/analyze-methods.mjs');
    const { createSnapshotStore } = await import('../../snapshot/store.mjs');
    const { openSnapshot, verifyAgainstManifest, CANONICAL_LOAD } = await import('../../snapshot/snapshot.mjs');
    const opened = await openSnapshot({ store: createSnapshotStore({ driver: await LIVE_IO.createDriver(), smoke: argv.includes('--smoke-snapshot') }), snapshotId, requireRestoreReceipt: true });
    pit = await loadPitData({ LIMIT: opened.manifest.capture.limit || 0, ...CANONICAL_LOAD, io: opened.io, log });
    const v = verifyAgainstManifest(opened.manifest, pit, { replay: false });
    if (v.codeVersionChanged && !argv.includes('--allow-code-version-change')) K.fail(K.REASON.INPUT_INTEGRITY_FAILURE, 'CODE_VERSION_CHANGED');
    datasetSha256 = K.sha256(K.canonicalJson(v.dataset));
    verification = { datasetVerified: v.datasetVerified, codeVersionChanged: v.codeVersionChanged, manifestDatasetSha256: K.sha256(K.canonicalJson(opened.manifest.dataset)), bytesVerified: opened.verified.bytes, smokeStore: argv.includes('--smoke-snapshot') };
    log(`snapshot ${snapshotId}: bytes ${opened.verified.bytes}, dataset ${v.datasetVerified}`);
  } catch (e) {
    // the detail names the failed check (e.g. CODE_VERSION_CHANGED); unexpected errors stay opaque in the public log
    console.error(e instanceof K.SnapshotError ? `${K.REASON.INPUT_INTEGRITY_FAILURE}: ${e.code}${e.detail ? ' ' + e.detail : ''}` : 'INPUT_INTEGRITY_FAILURE: UNEXPECTED_ERROR');
    process.exit(3);
  }
  if (LIMIT) pit.segs = pit.segs.slice(0, LIMIT);
  const dataset = datasetFromPit(pit);
  // review SF-R4-02 / SF-R3-02: the receipt names the subset actually computed
  const inputs = { ...verification, limit: LIMIT || null, computedSegmentsSha256: crypto.createHash('sha256').update(dataset.securities.map((x) => x.id).join('\n')).digest('hex'), computedSegments: dataset.securities.length };
  log(`dataset: ${dataset.securities.length} securities, ${dataset.calendar.length} sessions`);
  fs.mkdirSync(OUT, { recursive: true });
  const pem = fs.readFileSync(path.join(ROOT, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  for (const m of methods) {
    const result = (COMPONENT_STUDIES[m] ? componentStudy : runMethod)(m, dataset, { snapshotId, datasetSha256, accounting: FOUNDATION.accounting.mode, runId: process.env.GITHUB_RUN_ID || 'local', commit: process.env.GITHUB_SHA || null, inputs });
    const tag = `sf-${m.toLowerCase()}${LIMIT || inputs.smokeStore ? '-smoke' : ''}`;
    fs.writeFileSync(path.join(OUT, `${tag}.sealed.json`), L.encryptForOwner(pem, Buffer.from(JSON.stringify(result))));
    const pub = publicView(result);
    fs.writeFileSync(path.join(OUT, `${tag}.public.json`), JSON.stringify(pub, null, 1) + '\n');
    log(`${m}: sealed; receipt ${pub.receiptSha256.slice(0, 16)}${pub.scenarios ? `; reconciliation ${Object.values(pub.scenarios).every((s) => s.reconciliation) ? 'PASS' : 'FAIL'}` : `; component signals ${pub.signals}`}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(String(e?.message || e)); process.exit(1); });
