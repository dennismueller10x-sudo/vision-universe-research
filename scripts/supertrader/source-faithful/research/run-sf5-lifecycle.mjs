#!/usr/bin/env node
/**
 * Supertrader 5.0 snapshot runner: the trade lifecycles on the shared research engine (Darvas, Kullamaegi Common
 * Breakout, Pocket Pivot, Buyable Gap-Up, Holy Grail research variant W-RAS97) on the frozen research snapshot with
 * research-v1. DIAGNOSTIC_NOT_CERTIFIED and MODEL_LIFECYCLE_STUDY_NOT_A_STRATEGY_BACKTEST: the manual source decisions
 * are substituted by declared model assumptions, so no number here is a strategy return. Every pre-registered variant
 * (sf5-lifecycles.mjs) is run and reported; none is chosen.
 *  - public (repository log): signal / order / fill / rejection counts, eligibility blockers, exit reasons, open
 *    positions at the data end, reconciliation, determinism (reference run twice), hashes;
 *  - sealed (owner key): diagnostic metrics per variant (lifecycle-engine#runMetricsSF5) and the reference trades.
 * Engines, screens and the Minervini lifecycle are not changed (AG-3 code fingerprint; run-sf4-lifecycle.mjs).
 * A variant naming a Weinstein group proxy (ALT-SIC3-GROUP-PROXY) gets the PIT SIC3 group index of
 * research/industry-strength.mjs, built exactly as the Supertrader 3.0 runner builds it (sec-pit r12 listings of the
 * snapshot, SIC history of the repository at the run commit); its public block reports the group coverage of the setups.
 *
 *   node scripts/supertrader/source-faithful/research/run-sf5-lifecycle.mjs --snapshot sts1-<id> --accounting research-v1 \
 *        --out <dir> [--strategies DARVAS,KK_BREAKOUT,...] [--limit 400 --smoke-snapshot]
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as L from '../../validation/lib.mjs';
import { datasetFromPit } from '../runner/snapshot-input.mjs';
import { codeSha256 as engineCodeSha256 } from '../runner/run-research.mjs';
import { FOUNDATION } from '../contract.mjs';
import { runResearchLifecycle, runMetricsSF5, prepareAll, ENGINE_VERSION } from './lifecycle-engine.mjs';
import { GROUP_VARIANTS, buildGroupStrength } from './industry-strength.mjs';
import { makeWeinsteinGroupMembership, cikCandidatesFromSegments } from '../adapters/industry-groups.mjs';
import { SF5_LIFECYCLES, SF5_KEYS, sf5VariantRegistrySha256 } from './sf5-lifecycles.mjs';
import { SF7_EXECUTION_VARIANTS, SF7_EXECUTION_VERSION, sf7ExecutionVariantsSha256, ledgerWithoutReasonsSha256 } from './sf7-execution-variants.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
export const SF5_RUNNER_VERSION = 'sf5-lifecycle-runner-1.1.0'; // 1.1.0 (Supertrader 7.0): SF7 execution revision variants beside the unchanged sf5 variants
// every file the lifecycle results depend on, including the unchanged screens and the reused fill order (fillRank)
export const SF5_RESEARCH_FILES = Object.freeze(['../methods/darvas.mjs', '../methods/kullamagi.mjs', '../methods/morales-kacher.mjs', '../methods/holy-grail.mjs', '../methods/weinstein.mjs', '../common/series.mjs', '../runner/metrics.mjs', 'minervini-execution.mjs', 'lifecycle-engine.mjs', 'darvas-lifecycle.mjs', 'kk-breakout-lifecycle.mjs', 'moka-lifecycle.mjs', 'holy-grail-lifecycle.mjs', 'weinstein-lifecycle.mjs', 'sf5-lifecycles.mjs', 'run-sf5-lifecycle.mjs', 'sf7-execution-variants.mjs', 'industry-strength.mjs', '../adapters/industry-groups.mjs', '../../../core/load-sic-history.mjs', '../../../../core/industry-classification.js']);
const SEC_PIT_KEY = '_validation/sec-pit-r12.json.gz'; // as run-sf3-research.mjs
export function sf5ResearchCodeSha256() {
  const h = crypto.createHash('sha256');
  for (const f of SF5_RESEARCH_FILES) { h.update(f); h.update(fs.readFileSync(path.join(HERE, f))); }
  return h.digest('hex');
}
const sha = (x) => crypto.createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
const tally = (rows, key) => rows.reduce((o, r) => { const k = key(r); if (k != null) o[k] = (o[k] || 0) + 1; return o; }, {});

/** Public part of one run: counts and hashes only (test SF5-RUNNER-PUBLIC-COUNTS-ONLY). */
export function publicOf(r) {
  return {
    trades: r.trades.length, closed: r.trades.filter((t) => t.status === 'CLOSED').length, openAtDataEnd: r.openAtEnd.length,
    tradesByEntryYear: tally(r.trades, (t) => t.entryDate.slice(0, 4)), exitReasons: tally(r.trades, (t) => t.exitReason), entryBasis: tally(r.trades, (t) => t.entryBasis),
    counts: { ...r.counts, costs: undefined, dividends: undefined }, rejections: tally(r.rejections, (x) => x.reason),
    reconciliation: r.reconciliation.pass, endingPositionCheck: r.endingPositionCheck.status, ledgerSha256: sha(r.ledger), tradesSha256: sha(r.trades.map((t) => [t.id, t.entryDate, t.exitDate, t.exitReason, t.shares])),
  };
}

/**
 * Runs every pre-registered variant of each lifecycle. The per-security preparation is shared by the variants with the
 * same adapter.prepareKey. The reference run is executed twice and must be identical (determinism).
 */
export function lifecyclePart(dataset, { keys = SF5_KEYS, from = L.WINDOW.from, to = L.WINDOW.to, log = () => {} } = {}) {
  const pub = { engineVersion: ENGINE_VERSION, label: 'MODEL_LIFECYCLE_STUDY_NOT_A_STRATEGY_BACKTEST', certification: FOUNDATION.certification, window: { from, to }, strategies: {} };
  const sealed = { label: 'MODEL_LIFECYCLE_STUDY_METRICS_NOT_A_STRATEGY_RETURN', strategies: {} };
  const baseRuns = new Map();
  for (const lc of SF5_LIFECYCLES.filter((l) => keys.includes(l.key))) {
    const cache = new Map(), prep = (cfg) => { const k = lc.adapter.prepareKey(cfg); if (!cache.has(k)) cache.set(k, prepareAll(dataset, lc.adapter, cfg)); return cache.get(k); };
    const ps = (pub.strategies[lc.key] = { strategyId: lc.strategyId, adapterVersion: lc.adapter.version, label: lc.adapter.label, sourceStatus: lc.sourceStatus, variants: {} });
    const ss = (sealed.strategies[lc.key] = { variants: {} });
    for (const v of lc.variants) {
      const prepared = prep(v.config);
      const r = runResearchLifecycle(dataset, { adapter: lc.adapter, config: v.config, prepared, from, to });
      if (!r.reconciliation.pass) throw new Error(`RECONCILIATION_FAILED:${lc.key}:${v.id}`);
      ps.variants[v.id] = { changes: v.changes, securitiesWithSignals: prepared.size, ...publicOf(r), ...(v.config.groupProxy ? { groupProxyCoverage: groupProxyCoverage(prepared) } : {}) };
      ss.variants[v.id] = { metrics: runMetricsSF5(r, { spyTR: dataset.spyTR }) };
      if (v.id === 'REF') {
        const again = runResearchLifecycle(dataset, { adapter: lc.adapter, config: v.config, prepared: prep(v.config), from, to });
        ps.determinism = { referenceRunTwice: sha(again.ledger) === ps.variants.REF.ledgerSha256 && sha(again.trades) === sha(r.trades) };
        ss.referenceTrades = r.trades.map((t) => ({ id: t.id, signalDate: t.signalDate, entryDate: t.entryDate, entryFill: t.entryFill, entryBasis: t.entryBasis, initialStop: t.initialStop, shares: t.shares, weight: t.weight, riskOfEquity: t.riskOfEquity, exitDate: t.exitDate, exitReason: t.exitReason, pnl: t.pnl ?? null, rMultiple: t.rMultiple ?? null, unrealizedPnl: t.unrealizedPnl ?? null, status: t.status }));
      }
      log(`${lc.key} ${v.id}: trades ${r.trades.length}, entries ${r.counts.entries}, open at end ${r.openAtEnd.length}`);
      if (SF7_EXECUTION_VARIANTS.some((x) => x.key === lc.key && x.compareTo === v.id)) baseRuns.set(v.id, r); // kept only as a comparison base
    }
    // Supertrader 7.0: execution revision variants (sf7-execution-variants.mjs), each beside the unchanged variant it is
    // compared with; the sf5 variants above are not touched. Public: counts and hashes only, as publicOf.
    const sf7 = SF7_EXECUTION_VARIANTS.filter((x) => x.key === lc.key);
    if (sf7.length) { ps.sf7Execution = { version: SF7_EXECUTION_VERSION, variants: {} }; ss.sf7Execution = {}; }
    for (const x of sf7) {
      const r = runResearchLifecycle(dataset, { adapter: x.adapter, config: x.config, prepared: prep(x.config), from, to });
      if (!r.reconciliation.pass) throw new Error(`RECONCILIATION_FAILED:${lc.key}:${x.id}`);
      const base = baseRuns.get(x.compareTo), changedReasons = r.ledger.length === base.ledger.length ? r.ledger.filter((row, k) => row.reason !== base.ledger[k].reason).length : null;
      ps.sf7Execution.variants[x.id] = { compareTo: x.compareTo, revision: x.revision, ...publicOf(r), comparison: { ledgerWithoutReasonsEqual: ledgerWithoutReasonsSha256(r.ledger) === ledgerWithoutReasonsSha256(base.ledger), ledgerRowsWithChangedReason: changedReasons, tradesDelta: r.trades.length - base.trades.length, sameBarStopCertainByClose: r.counts.sameBarStopCertainByClose ?? 0 } };
      ss.sf7Execution[x.id] = { metrics: runMetricsSF5(r, { spyTR: dataset.spyTR }) };
      log(`${lc.key} ${x.id} (vs ${x.compareTo}): trades ${r.trades.length}, certain by close ${r.counts.sameBarStopCertainByClose ?? 0}`);
    }
    baseRuns.clear();
  }
  return { pub, sealed };
}

/** Group proxies named by the selected variants (empty when none is). */
export function requiredGroupProxies(keys = SF5_KEYS) {
  return [...new Set(SF5_LIFECYCLES.filter((l) => keys.includes(l.key)).flatMap((l) => l.variants.map((v) => v.config.groupProxy).filter(Boolean)))];
}

/** Status / label tally of the group evidence attached to the prepared weekly setups (public counts only; every
 * prepared setup of the securities, including weeks outside the run window). */
export function groupProxyCoverage(prepared) {
  const setups = { total: 0, byStatus: {}, byLabel: {} };
  for (const ctx of prepared.values()) for (const s of ctx.setupFor.values()) {
    setups.total++; const e = s.groupProxy ?? { status: 'NOT_ATTACHED' };
    setups.byStatus[e.status] = (setups.byStatus[e.status] || 0) + 1;
    if (e.label) setups.byLabel[e.label] = (setups.byLabel[e.label] || 0) + 1;
  }
  return setups;
}

/** sha256 over index, code list and every issuer shard of the SIC history (sorted file names). */
export function sicHistorySha256(dir) {
  const h = crypto.createHash('sha256');
  const files = ['index.json', 'sic-codes.json', ...fs.readdirSync(path.join(dir, 'issuers')).filter((f) => f.endsWith('.json.gz')).sort().map((f) => `issuers/${f}`)];
  for (const f of files) if (fs.existsSync(path.join(dir, f))) { h.update(f); h.update(fs.readFileSync(path.join(dir, f))); }
  return h.digest('hex');
}

/** PIT SIC group indices for the named proxies (same construction as run-sf3-research.mjs#main). */
export function buildGroupProxies(dataset, { ids, classification, cikCandidates }) {
  const out = {};
  for (const id of ids) {
    const v = GROUP_VARIANTS.find((x) => x.id === id);
    if (!v || v.weighting !== 'EQUAL') throw new Error(`GROUP_PROXY_UNAVAILABLE:${id}`);
    const membership = makeWeinsteinGroupMembership({ classification, cikCandidates, decision: { ref: v.ref, level: v.level, maxAgeDays: v.maxAgeDays, acceptedIdentityEvidence: v.acceptedIdentityEvidence } });
    out[id] = buildGroupStrength(dataset, membership, { minMembers: v.minMembers });
    if (out[id].status !== 'BUILT') throw new Error(`GROUP_PROXY_NOT_BUILT:${id}`);
  }
  return out;
}

async function main() {
  const argv = process.argv.slice(2), arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  if (arg('--accounting') !== 'research-v1') { console.error('RESEARCH_ACCOUNTING_REQUIRED'); process.exit(2); }
  const snapshotId = arg('--snapshot');
  if (!/^sts1-[0-9a-f]{32}$/.test(snapshotId || '')) { console.error('SNAPSHOT_REQUIRED'); process.exit(2); }
  const OUT = arg('--out'); if (!OUT) { console.error('--out required'); process.exit(2); }
  const LIMIT = Number(arg('--limit', '0')), keys = arg('--strategies', SF5_KEYS.join(',')).split(',');
  if (!keys.every((s) => SF5_KEYS.includes(s))) { console.error('UNKNOWN_STRATEGY'); process.exit(2); }
  const t0 = Date.now(), log = (m) => console.log(`[sf5 +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
  const K = await import('../../snapshot/contract.mjs');
  let pit, datasetSha256, verification, secPit = null;
  const proxyIds = requiredGroupProxies(keys);
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
    if (proxyIds.length) {
      const driver = await opened.io.createDriver();
      const buf = await driver.get(pit.mine.seriesPrefix + SEC_PIT_KEY);
      if (!buf) K.fail(K.REASON.INPUT_INTEGRITY_FAILURE, 'SEC_PIT_MISSING_FOR_GROUP_PROXY');
      secPit = JSON.parse(zlib.gunzipSync(buf).toString('utf8'));
    }
    log(`snapshot ${snapshotId}: dataset ${v.datasetVerified}${secPit ? `; sec-pit r12 listings ${Object.keys(secPit).length}` : ''}`);
  } catch (e) {
    console.error(e instanceof K.SnapshotError ? `${K.REASON.INPUT_INTEGRITY_FAILURE}: ${e.code}${e.detail ? ' ' + e.detail : ''}` : `INPUT_INTEGRITY_FAILURE: UNEXPECTED_ERROR ${e?.code ?? ''}`);
    process.exit(3);
  }
  if (LIMIT) pit.segs = pit.segs.slice(0, LIMIT);
  const dataset = datasetFromPit(pit);
  log(`dataset: ${dataset.securities.length} securities, ${dataset.calendar.length} sessions`);
  let groupProxyReceipt = null;
  if (proxyIds.length) {
    try {
      const { loadSicHistory, DEFAULT_DIR } = await import('../../../core/load-sic-history.mjs');
      const cikCandidates = cikCandidatesFromSegments(pit.segs, Object.fromEntries(Object.entries(secPit).filter(([, v]) => v?.cik).map(([k, v]) => [k, { cik: v.cik, how: v.how }])));
      const ciks = new Set([...cikCandidates.values()].flat().map((c) => c.cik));
      dataset.groupProxies = buildGroupProxies(dataset, { ids: proxyIds, classification: loadSicHistory({ ciks }), cikCandidates });
      // the SIC history is repository data (not in the snapshot): pin every file of it in the receipt
      groupProxyReceipt = { ids: proxyIds, sicHistorySha256: sicHistorySha256(DEFAULT_DIR), ciks: ciks.size, coverage: Object.fromEntries(proxyIds.map((id) => [id, dataset.groupProxies[id].coverage])), setupCoverageScope: 'every prepared weekly setup of the securities, not only the run window', sourceStatus: 'VU_PROXY_OF_WEINSTEIN_GROUP_CHART' };
      log(`group proxies ${proxyIds.join(',')}: ${ciks.size} ciks`);
    } catch (e) {
      console.error(`INPUT_INTEGRITY_FAILURE: GROUP_PROXY_INPUT ${String(e?.message ?? e).slice(0, 200)}`);
      process.exit(3);
    }
  }
  const receipt = { schema: 'supertrader-sf5-lifecycle-receipt-1.0.0', certification: FOUNDATION.certification, snapshotId, datasetSha256, accounting: FOUNDATION.accounting.mode, engineCodeSha256: engineCodeSha256(), researchCodeSha256: sf5ResearchCodeSha256(), runner: SF5_RUNNER_VERSION, variantRegistrySha256: sf5VariantRegistrySha256(), sf7ExecutionVariantsSha256: sf7ExecutionVariantsSha256(), groupProxy: groupProxyReceipt, limit: LIMIT || null, ...verification, computedSegmentsSha256: sha(dataset.securities.map((s) => s.id).join('\n')), survivorship: 'snapshot listing table incl. inactive listings; delisted segments settled by the research-v1 terminal policy', runId: process.env.GITHUB_RUN_ID || 'local', commit: process.env.GITHUB_SHA || null };
  const r = lifecyclePart(dataset, { keys, log });
  const pub = { schema: 'supertrader-sf5-lifecycle-public-1.0.0', receipt, lifecycle: r.pub };
  const sealed = { receipt, public: pub, lifecycle: r.sealed };
  fs.mkdirSync(OUT, { recursive: true });
  const tag = `sf5-lifecycle${LIMIT || verification.smokeStore ? '-smoke' : ''}`;
  const pem = fs.readFileSync(path.join(ROOT, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  fs.writeFileSync(path.join(OUT, `${tag}.sealed.json`), L.encryptForOwner(pem, Buffer.from(JSON.stringify(sealed))));
  fs.writeFileSync(path.join(OUT, `${tag}.public.json`), JSON.stringify(pub, null, 1) + '\n');
  log(`done; public ${tag}.public.json`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
