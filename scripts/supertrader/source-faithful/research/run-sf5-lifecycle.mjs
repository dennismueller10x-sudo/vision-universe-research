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
 *
 *   node scripts/supertrader/source-faithful/research/run-sf5-lifecycle.mjs --snapshot sts1-<id> --accounting research-v1 \
 *        --out <dir> [--strategies DARVAS,KK_BREAKOUT,...] [--limit 400 --smoke-snapshot]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as L from '../../validation/lib.mjs';
import { datasetFromPit } from '../runner/snapshot-input.mjs';
import { codeSha256 as engineCodeSha256 } from '../runner/run-research.mjs';
import { FOUNDATION } from '../contract.mjs';
import { runResearchLifecycle, runMetricsSF5, prepareAll, ENGINE_VERSION } from './lifecycle-engine.mjs';
import { SF5_LIFECYCLES, SF5_KEYS, sf5VariantRegistrySha256 } from './sf5-lifecycles.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
export const SF5_RUNNER_VERSION = 'sf5-lifecycle-runner-1.0.0';
// every file the lifecycle results depend on, including the unchanged screens and the reused fill order (fillRank)
export const SF5_RESEARCH_FILES = Object.freeze(['../methods/darvas.mjs', '../methods/kullamagi.mjs', '../methods/morales-kacher.mjs', '../methods/holy-grail.mjs', '../methods/weinstein.mjs', '../common/series.mjs', '../runner/metrics.mjs', 'minervini-execution.mjs', 'lifecycle-engine.mjs', 'darvas-lifecycle.mjs', 'kk-breakout-lifecycle.mjs', 'moka-lifecycle.mjs', 'holy-grail-lifecycle.mjs', 'weinstein-lifecycle.mjs', 'sf5-lifecycles.mjs', 'run-sf5-lifecycle.mjs']);
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
  for (const lc of SF5_LIFECYCLES.filter((l) => keys.includes(l.key))) {
    const cache = new Map(), prep = (cfg) => { const k = lc.adapter.prepareKey(cfg); if (!cache.has(k)) cache.set(k, prepareAll(dataset, lc.adapter, cfg)); return cache.get(k); };
    const ps = (pub.strategies[lc.key] = { strategyId: lc.strategyId, adapterVersion: lc.adapter.version, label: lc.adapter.label, sourceStatus: lc.sourceStatus, variants: {} });
    const ss = (sealed.strategies[lc.key] = { variants: {} });
    for (const v of lc.variants) {
      const prepared = prep(v.config);
      const r = runResearchLifecycle(dataset, { adapter: lc.adapter, config: v.config, prepared, from, to });
      if (!r.reconciliation.pass) throw new Error(`RECONCILIATION_FAILED:${lc.key}:${v.id}`);
      ps.variants[v.id] = { changes: v.changes, securitiesWithSignals: prepared.size, ...publicOf(r) };
      ss.variants[v.id] = { metrics: runMetricsSF5(r, { spyTR: dataset.spyTR }) };
      if (v.id === 'REF') {
        const again = runResearchLifecycle(dataset, { adapter: lc.adapter, config: v.config, prepared: prep(v.config), from, to });
        ps.determinism = { referenceRunTwice: sha(again.ledger) === ps.variants.REF.ledgerSha256 && sha(again.trades) === sha(r.trades) };
        ss.referenceTrades = r.trades.map((t) => ({ id: t.id, signalDate: t.signalDate, entryDate: t.entryDate, entryFill: t.entryFill, entryBasis: t.entryBasis, initialStop: t.initialStop, shares: t.shares, weight: t.weight, riskOfEquity: t.riskOfEquity, exitDate: t.exitDate, exitReason: t.exitReason, pnl: t.pnl ?? null, rMultiple: t.rMultiple ?? null, unrealizedPnl: t.unrealizedPnl ?? null, status: t.status }));
      }
      log(`${lc.key} ${v.id}: trades ${r.trades.length}, entries ${r.counts.entries}, open at end ${r.openAtEnd.length}`);
    }
  }
  return { pub, sealed };
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
    verification = { datasetVerified: v.datasetVerified, codeVersionChanged: v.codeVersionChanged, bytesVerified: opened.verified.bytes, smokeStore: argv.includes('--smoke-snapshot') };
    log(`snapshot ${snapshotId}: dataset ${v.datasetVerified}`);
  } catch (e) {
    console.error(e instanceof K.SnapshotError ? `${K.REASON.INPUT_INTEGRITY_FAILURE}: ${e.code}${e.detail ? ' ' + e.detail : ''}` : `INPUT_INTEGRITY_FAILURE: UNEXPECTED_ERROR ${e?.code ?? ''}`);
    process.exit(3);
  }
  if (LIMIT) pit.segs = pit.segs.slice(0, LIMIT);
  const dataset = datasetFromPit(pit);
  log(`dataset: ${dataset.securities.length} securities, ${dataset.calendar.length} sessions`);
  const receipt = { schema: 'supertrader-sf5-lifecycle-receipt-1.0.0', certification: FOUNDATION.certification, snapshotId, datasetSha256, accounting: FOUNDATION.accounting.mode, engineCodeSha256: engineCodeSha256(), researchCodeSha256: sf5ResearchCodeSha256(), runner: SF5_RUNNER_VERSION, variantRegistrySha256: sf5VariantRegistrySha256(), limit: LIMIT || null, ...verification, computedSegmentsSha256: sha(dataset.securities.map((s) => s.id).join('\n')), survivorship: 'snapshot listing table incl. inactive listings; delisted segments settled by the research-v1 terminal policy', runId: process.env.GITHUB_RUN_ID || 'local', commit: process.env.GITHUB_SHA || null };
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
