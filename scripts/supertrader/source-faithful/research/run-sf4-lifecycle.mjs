#!/usr/bin/env node
/**
 * Supertrader 4.0 snapshot runner: the Minervini trade lifecycle (SEPA / VCP and Power Play) on the frozen research
 * snapshot with research-v1. DIAGNOSTIC_NOT_CERTIFIED and MODEL_LIFECYCLE_STUDY_NOT_A_STRATEGY_BACKTEST: the manual
 * source decisions are substituted by declared model assumptions (lifecycle#MODEL_ASSUMPTIONS), so no number here is a
 * Minervini strategy return. Every pre-registered variant (lifecycle#RUN_VARIANTS) is run and reported; none is chosen.
 *  - public (repository log): setup class counts, eligibility blockers, order / fill / rejection counts, exit reasons,
 *    open positions at the data end, reconciliation, determinism (reference run twice), hashes;
 *  - sealed (owner key): diagnostic metrics per variant (minervini-execution#runMetrics) and the reference trades.
 * Engines and screens are not changed (methods/*, run-research.mjs: AG-3 code fingerprint; run-sf3-research.mjs).
 *
 *   node scripts/supertrader/source-faithful/research/run-sf4-lifecycle.mjs --snapshot sts1-<id> --accounting research-v1 \
 *        --out <dir> [--strategies SEPA,POWER_PLAY] [--limit 400 --smoke-snapshot]
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as L from '../../validation/lib.mjs';
import { datasetFromPit } from '../runner/snapshot-input.mjs';
import { codeSha256 as engineCodeSha256 } from '../runner/run-research.mjs';
import { FOUNDATION } from '../contract.mjs';
import { attachSecPit } from './run-sf3-research.mjs';
import { fundamentalEvidence } from './minervini-components.mjs';
import { RUN_VARIANTS, LIFECYCLE_VERSION, variantRegistrySha256 } from './minervini-lifecycle.mjs';
import { buildSetupIndex, runMinerviniLifecycle, runMetrics, EXECUTION_VERSION } from './minervini-execution.mjs';
import { transitionsDaily, transitionsAt, PP_FIX_COMPARISON_VERSION } from './pp-missing-low-comparison.mjs';
import { SF7_MINERVINI_VARIANTS, SF7_MINERVINI_VERSION, sf7MinerviniVariantsSha256, ledgerWithoutReasonsSha256 } from './sf7-minervini-variants.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
export const SF4_RUNNER_VERSION = 'sf4-lifecycle-runner-1.1.0';
const SEC_PIT_KEY = '_validation/sec-pit-r12.json.gz';
// every file the lifecycle results depend on, including the unchanged screens and the fundamentals attachment (review SF4-C-L5)
const FILES = ['../methods/minervini.mjs', '../common/series.mjs', 'run-sf3-research.mjs', 'minervini-components.mjs', 'minervini-lifecycle.mjs', 'minervini-execution.mjs', 'pp-missing-low-comparison.mjs', 'run-sf4-lifecycle.mjs', 'sf7-minervini-variants.mjs'];
export function researchCodeSha256() {
  const h = crypto.createHash('sha256');
  for (const f of FILES) { h.update(f); h.update(fs.readFileSync(path.join(HERE, f))); }
  return h.digest('hex');
}
const sha = (x) => crypto.createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
const tally = (rows, key) => rows.reduce((o, r) => { const k = key(r); if (k != null) o[k] = (o[k] || 0) + 1; return o; }, {});

/** Public part of one run: counts and hashes only (test SF4-RUNNER-PUBLIC-COUNTS-ONLY). */
function publicOf(r) {
  return {
    trades: r.trades.length, closed: r.trades.filter((t) => t.status === 'CLOSED').length, openAtDataEnd: r.openAtEnd.length,
    tradesByEntryYear: tally(r.trades, (t) => t.entryDate.slice(0, 4)), exitReasons: tally(r.trades, (t) => t.exitReason), entryBasis: tally(r.trades, (t) => t.entryBasis),
    counts: { ...r.counts, costs: undefined, dividends: undefined }, rejections: tally(r.rejections, (x) => x.reason),
    reconciliation: r.reconciliation.pass, endingPositionCheck: r.endingPositionCheck.status, ledgerSha256: sha(r.ledger), tradesSha256: sha(r.trades.map((t) => [t.id, t.entryDate, t.exitDate, t.exitReason, t.shares])),
  };
}

/**
 * Runs every pre-registered variant of each strategy. The setup index is built once per strategy (setups do not depend
 * on the variant). The reference run is executed twice and must be identical (determinism).
 */
export function lifecyclePart(dataset, { strategies = ['SEPA', 'POWER_PLAY'], variants = RUN_VARIANTS, sf7Variants = SF7_MINERVINI_VARIANTS, from = L.WINDOW.from, to = L.WINDOW.to, log = () => {} } = {}) {
  const pub = { version: LIFECYCLE_VERSION, executionVersion: EXECUTION_VERSION, label: 'MODEL_LIFECYCLE_STUDY_NOT_A_STRATEGY_BACKTEST', certification: FOUNDATION.certification, window: { from, to }, strategies: {} };
  const sealed = { label: 'MODEL_LIFECYCLE_STUDY_METRICS_NOT_A_STRATEGY_RETURN', strategies: {} };
  for (const strategy of strategies) {
    const setupIndex = buildSetupIndex(dataset, strategy, { from });
    const ps = (pub.strategies[strategy] = { setupClassCounts: setupIndex.counts, securitiesWithSetups: setupIndex.index.size, variants: {} });
    const ss = (sealed.strategies[strategy] = { variants: {} });
    log(`${strategy}: setup index ${JSON.stringify(setupIndex.counts)}`);
    const runsById = new Map();
    for (const v of variants) {
      if (v.strategies && !v.strategies.includes(strategy)) continue;
      const r = runMinerviniLifecycle(dataset, { strategy, setupIndex, config: v.config, from, to });
      if (sf7Variants.some((x) => x.compareTo === v.id)) runsById.set(v.id, r); // only the comparison runs are kept
      if (!r.reconciliation.pass) throw new Error(`RECONCILIATION_FAILED:${strategy}:${v.id}`);
      ps.variants[v.id] = { changes: v.changes, ...publicOf(r) };
      ss.variants[v.id] = { metrics: runMetrics(r, { spyTR: dataset.spyTR }) };
      if (v.id === 'REF') {
        const again = runMinerviniLifecycle(dataset, { strategy, setupIndex, config: v.config, from, to });
        ps.determinism = { referenceRunTwice: sha(again.ledger) === ps.variants.REF.ledgerSha256 && sha(again.trades) === sha(r.trades) };
        if (strategy === 'SEPA') {
          const byId = new Map(dataset.securities.map((s) => [s.id, s]));
          ps.referenceEntriesWithPitFundamentals = r.trades.filter((t) => fundamentalEvidence(byId.get(t.id)?.fund, t.signalDate).status === 'EVIDENCE_ONLY').length;
        }
        ss.referenceTrades = r.trades.map((t) => ({ id: t.id, setupDate: t.setupDate, entryDate: t.entryDate, entryFill: t.entryFill, entryBasis: t.entryBasis, initialStop: t.initialStop, shares: t.shares, riskOfEquity: t.riskOfEquity, exitDate: t.exitDate, exitReason: t.exitReason, pnl: t.pnl ?? null, rMultiple: t.rMultiple ?? null, unrealizedPnl: t.unrealizedPnl ?? null, status: t.status }));
      }
      log(`${strategy} ${v.id}: trades ${r.trades.length}, entries ${r.counts.entries}, open at end ${r.openAtEnd.length}`);
    }
    // Supertrader 7.0 (SF7-D4): each SF7 variant beside the unchanged variant it is compared with; public counts only
    const sf7 = {};
    for (const v of sf7Variants) {
      if (v.strategies && !v.strategies.includes(strategy)) continue;
      const base = runsById.get(v.compareTo);
      if (!base) throw new Error(`SF7_COMPARE_TO_NOT_RUN:${strategy}:${v.compareTo}`);
      const r = runMinerviniLifecycle(dataset, { strategy, setupIndex, config: v.config, from, to });
      if (!r.reconciliation.pass) throw new Error(`RECONCILIATION_FAILED:${strategy}:${v.id}`);
      const reasonsChanged = r.ledger.length === base.ledger.length ? r.ledger.filter((row, k) => row.reason !== base.ledger[k].reason).length : null;
      sf7[v.id] = { compareTo: v.compareTo, revision: v.revision, supersedes: v.supersedes ?? null, ...publicOf(r), comparison: { ledgerWithoutReasonsEqual: ledgerWithoutReasonsSha256(r.ledger) === ledgerWithoutReasonsSha256(base.ledger), ledgerRowsWithChangedReason: reasonsChanged, tradesDelta: r.trades.length - base.trades.length, sameBarStopCertainDelta: r.counts.sameBarStopCertain - base.counts.sameBarStopCertain, sameBarStopAmbiguousDelta: (r.counts.sameBarStopAmbiguousExecuted + r.counts.sameBarStopAmbiguousIgnored) - (base.counts.sameBarStopAmbiguousExecuted + base.counts.sameBarStopAmbiguousIgnored) } };
      (ss.sf7Execution ||= {})[v.id] = { metrics: runMetrics(r, { spyTR: dataset.spyTR }) };
      log(`${strategy} ${v.id}: trades ${r.trades.length} (${v.compareTo} ${base.trades.length}), certain ${r.counts.sameBarStopCertain} (${base.counts.sameBarStopCertain})`);
    }
    if (Object.keys(sf7).length) ps.sf7Execution = { version: SF7_MINERVINI_VERSION, variantsSha256: sf7MinerviniVariantsSha256(), variants: sf7 };
    runsById.clear();
  }
  return { pub, sealed };
}

/**
 * Before / after evidence of the Power Play missing-low fix (sf-minervini-1.0.1): classification transitions of every
 * session from the window start (daily) and of the month-end sessions with both versions in full (the sampling of the
 * sf3 screen statistics). Counts only.
 */
export function ppFixPart(dataset, { from = L.WINDOW.from } = {}) {
  const monthEnds = new Set(dataset.calendar.filter((d, i, a) => i === a.length - 1 || a[i + 1].slice(0, 7) !== d.slice(0, 7)));
  return { version: PP_FIX_COMPARISON_VERSION, legacy: 'sf-minervini-1.0.0 / sf-minervini-components-1.0.0 (frozen copy)', fixed: 'sf-minervini-1.0.1 / sf-minervini-components-1.0.1', daily: transitionsDaily(dataset, { from }), monthEndFull: transitionsAt(dataset, (s, i) => monthEnds.has(s.bars[i].date)) };
}

async function main() {
  const argv = process.argv.slice(2), arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  if (arg('--accounting') !== 'research-v1') { console.error('RESEARCH_ACCOUNTING_REQUIRED'); process.exit(2); }
  const snapshotId = arg('--snapshot');
  if (!/^sts1-[0-9a-f]{32}$/.test(snapshotId || '')) { console.error('SNAPSHOT_REQUIRED'); process.exit(2); }
  const OUT = arg('--out'); if (!OUT) { console.error('--out required'); process.exit(2); }
  const LIMIT = Number(arg('--limit', '0')), strategies = arg('--strategies', 'SEPA,POWER_PLAY').split(','), parts = new Set(arg('--parts', 'lifecycle,ppfix').split(','));
  if (!strategies.every((s) => ['SEPA', 'POWER_PLAY'].includes(s))) { console.error('UNKNOWN_STRATEGY'); process.exit(2); }
  const t0 = Date.now(), log = (m) => console.log(`[sf4 +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
  const K = await import('../../snapshot/contract.mjs');
  let pit, datasetSha256, verification, secPit;
  try {
    const { LIVE_IO, loadPitData } = await import('../../validation/analyze-methods.mjs');
    const { createSnapshotStore } = await import('../../snapshot/store.mjs');
    const { openSnapshot, verifyAgainstManifest, CANONICAL_LOAD } = await import('../../snapshot/snapshot.mjs');
    const opened = await openSnapshot({ store: createSnapshotStore({ driver: await LIVE_IO.createDriver(), smoke: argv.includes('--smoke-snapshot') }), snapshotId, requireRestoreReceipt: true });
    pit = await loadPitData({ LIMIT: opened.manifest.capture.limit || 0, ...CANONICAL_LOAD, io: opened.io, log });
    const v = verifyAgainstManifest(opened.manifest, pit, { replay: false });
    if (v.codeVersionChanged && !argv.includes('--allow-code-version-change')) K.fail(K.REASON.INPUT_INTEGRITY_FAILURE, 'CODE_VERSION_CHANGED');
    datasetSha256 = K.sha256(K.canonicalJson(v.dataset));
    verification = { datasetVerified: v.datasetVerified, codeVersionChanged: v.codeVersionChanged, bytesVerified: opened.verified.bytes, smokeStore: argv.includes('--smoke-snapshot') };
    const driver = await opened.io.createDriver();
    const buf = await driver.get(pit.mine.seriesPrefix + SEC_PIT_KEY);
    secPit = buf ? JSON.parse(zlib.gunzipSync(buf).toString('utf8')) : {};
    log(`snapshot ${snapshotId}: dataset ${v.datasetVerified}; sec-pit r12 listings ${Object.keys(secPit).length}`);
  } catch (e) {
    console.error(e instanceof K.SnapshotError ? `${K.REASON.INPUT_INTEGRITY_FAILURE}: ${e.code}${e.detail ? ' ' + e.detail : ''}` : `INPUT_INTEGRITY_FAILURE: UNEXPECTED_ERROR ${e?.code ?? ''}`);
    process.exit(3);
  }
  if (LIMIT) pit.segs = pit.segs.slice(0, LIMIT);
  const dataset = datasetFromPit(pit);
  const fundCoverage = attachSecPit(dataset, secPit);
  log(`dataset: ${dataset.securities.length} securities, ${dataset.calendar.length} sessions, sec-pit ${fundCoverage.withFund}`);
  const receipt = { schema: 'supertrader-sf4-lifecycle-receipt-1.0.0', certification: FOUNDATION.certification, snapshotId, datasetSha256, accounting: FOUNDATION.accounting.mode, engineCodeSha256: engineCodeSha256(), researchCodeSha256: researchCodeSha256(), runner: SF4_RUNNER_VERSION, variantRegistrySha256: variantRegistrySha256(), sf7MinerviniVariantsSha256: sf7MinerviniVariantsSha256(), limit: LIMIT || null, ...verification, computedSegmentsSha256: sha(dataset.securities.map((s) => s.id).join('\n')), survivorship: 'snapshot listing table incl. inactive listings; delisted segments settled by the research-v1 terminal policy', runId: process.env.GITHUB_RUN_ID || 'local', commit: process.env.GITHUB_SHA || null };
  const r = parts.has('lifecycle') ? lifecyclePart(dataset, { strategies, log }) : { pub: null, sealed: null };
  const pub = { schema: 'supertrader-sf4-lifecycle-public-1.0.0', receipt, fundCoverage, lifecycle: r.pub };
  if (parts.has('ppfix')) { pub.ppFix = ppFixPart(dataset); log(`pp fix: daily changed ${pub.ppFix.daily.changed}, month-end changed ${pub.ppFix.monthEndFull.changed}`); }
  const sealed = { receipt, public: pub, lifecycle: r.sealed };
  fs.mkdirSync(OUT, { recursive: true });
  const tag = `sf4-lifecycle${LIMIT || verification.smokeStore ? '-smoke' : ''}`;
  const pem = fs.readFileSync(path.join(ROOT, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  fs.writeFileSync(path.join(OUT, `${tag}.sealed.json`), L.encryptForOwner(pem, Buffer.from(JSON.stringify(sealed))));
  fs.writeFileSync(path.join(OUT, `${tag}.public.json`), JSON.stringify(pub, null, 1) + '\n');
  log(`done; public ${tag}.public.json`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
