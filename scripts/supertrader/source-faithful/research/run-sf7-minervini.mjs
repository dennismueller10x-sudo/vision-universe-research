#!/usr/bin/env node
/**
 * Supertrader 7.0 snapshot runner: Minervini source completion (research/minervini-sf7.mjs) on the frozen research
 * snapshot with research-v1. DIAGNOSTIC_NOT_CERTIFIED and MODEL_LIFECYCLE_STUDY_NOT_A_STRATEGY_BACKTEST.
 *  - REF of both strategies (4.0 lifecycle, unchanged): must reproduce the authoritative ledger hashes
 *    (completion/sf6-run-facts.mjs, run 39746264325); otherwise the run fails;
 *  - the pre-registered 7.0 variants ALT-SEPA-FLAT-BASE and ALT-PP-VCP-REQUIRED, each against REF trade by trade;
 *  - diagnostics on the REF trades: largest-decline sell signal and half-average-gain stop rule (counts only).
 * Public: counts and hashes. Sealed (owner key): metrics per run. No variant is chosen by any result.
 *
 *   node scripts/supertrader/source-faithful/research/run-sf7-minervini.mjs --snapshot sts1-<id> --accounting research-v1 --out <dir> [--smoke-snapshot] [--limit N]
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as L from '../../validation/lib.mjs';
import { datasetFromPit } from '../runner/snapshot-input.mjs';
import { FOUNDATION } from '../contract.mjs';
import { attachSecPit } from './run-sf3-research.mjs';
import { researchCodeSha256 } from './run-sf4-lifecycle.mjs';
import { REFERENCE_CONFIG, variantRegistrySha256 } from './minervini-lifecycle.mjs';
import { buildSetupIndex, runMinerviniLifecycle, runMetrics } from './minervini-execution.mjs';
import { SF7_MINERVINI_VERSION, SF7_VARIANTS, sf7VariantRegistrySha256, withFlatBaseSetups, withPowerPlayVcpRequired, largestDeclineSignal, halfAverageGainStopCheck } from './minervini-sf7.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
export const SF7_RUNNER_VERSION = 'sf7-minervini-runner-1.0.0';
const SEC_PIT_KEY = '_validation/sec-pit-r12.json.gz';
/** authoritative REF ledger hashes (completion/sf6-run-facts.mjs; run 39746264325) */
export const AUTHORITATIVE_REF_LEDGER = Object.freeze({ SEPA: '1ca5239107bd8bf1da18dfe730329878d21f9d8d2e6233e0ab5645d1f32d3326', POWER_PLAY: '877ceb333831fdcbc25b34b81b254bbdf9845dcc89966d26cb93e595490d0fb3' });
const sha = (x) => crypto.createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
const tally = (rows, key) => rows.reduce((o, r) => { const k = key(r); if (k != null) o[k] = (o[k] || 0) + 1; return o; }, {});
const tradeKey = (t) => `${t.id}|${t.entryDate}`;

function publicOf(r) {
  return {
    trades: r.trades.length, closed: r.trades.filter((t) => t.status === 'CLOSED').length, openAtDataEnd: r.openAtEnd.length,
    tradesByEntryYear: tally(r.trades, (t) => t.entryDate.slice(0, 4)), exitReasons: tally(r.trades, (t) => t.exitReason), entryBasis: tally(r.trades, (t) => t.entryBasis),
    rejections: tally(r.rejections, (x) => x.reason), eligibilityBlockers: r.counts.eligibilityBlockers,
    reconciliation: r.reconciliation.pass, endingPositionCheck: r.endingPositionCheck.status,
    ledgerSha256: sha(r.ledger), tradesSha256: sha(r.trades.map((t) => [t.id, t.entryDate, t.exitDate, t.exitReason, t.shares])),
  };
}

/** Trade-level comparison against REF (identity = security id and entry date). */
export function diffTrades(ref, alt) {
  const a = new Map(ref.map((t) => [tradeKey(t), t])), b = new Map(alt.map((t) => [tradeKey(t), t]));
  let same = 0, changed = 0, removed = 0, added = 0;
  for (const [k, t] of a) { const u = b.get(k); if (!u) removed++; else if (u.exitDate === t.exitDate && u.shares === t.shares && u.exitReason === t.exitReason) same++; else changed++; }
  for (const k of b.keys()) if (!a.has(k)) added++;
  return { unchanged: same, changed, removedVsRef: removed, addedVsRef: added };
}

/** REF + 7.0 variants + diagnostics for one dataset. */
export function sf7Part(dataset, { from = L.WINDOW.from, to = L.WINDOW.to, log = () => {} } = {}) {
  const pub = { version: SF7_MINERVINI_VERSION, label: 'MODEL_LIFECYCLE_STUDY_NOT_A_STRATEGY_BACKTEST', certification: FOUNDATION.certification, window: { from, to }, strategies: {} };
  const sealed = { label: 'MODEL_LIFECYCLE_STUDY_METRICS_NOT_A_STRATEGY_RETURN', strategies: {} };
  const byId = new Map(dataset.securities.map((s) => [s.id, s]));
  for (const strategy of ['SEPA', 'POWER_PLAY']) {
    const refIndex = buildSetupIndex(dataset, strategy, { from });
    const ref = runMinerviniLifecycle(dataset, { strategy, setupIndex: refIndex, config: REFERENCE_CONFIG, from, to });
    if (!ref.reconciliation.pass) throw new Error(`RECONCILIATION_FAILED:${strategy}:REF`);
    const ps = (pub.strategies[strategy] = { setupClassCounts: refIndex.counts, ref: publicOf(ref), variants: {} });
    ps.ref.matchesAuthoritativeLedger = ps.ref.ledgerSha256 === AUTHORITATIVE_REF_LEDGER[strategy];
    const ss = (sealed.strategies[strategy] = { ref: runMetrics(ref, { spyTR: dataset.spyTR }), variants: {} });
    log(`${strategy} REF: trades ${ref.trades.length}, ledger ${ps.ref.matchesAuthoritativeLedger ? 'EQUAL' : 'DIFFERENT'}`);
    // diagnostics on the reference trades (never a gate, never a variant choice)
    const decl = ref.trades.map((t) => largestDeclineSignal(byId.get(t.id).bars, t));
    ps.diagnostics = {
      largestDeclineSignal: { ...tally(decl, (x) => x.status), signalStrictlyBeforeExit: decl.filter((x) => x.status === 'SIGNAL' && x.sessionsBeforeExit > 0).length, rule: 'B12 PDF 130 (MA-MIN7-STAGE2-START)' },
      halfAverageGainStop: { ...halfAverageGainStopCheck(ref.trades), rule: 'B12 PDF 398-399 (MA-MIN7-AVG-GAIN)' },
    };
    for (const v of SF7_VARIANTS.filter((x) => x.strategy === strategy)) {
      const idx = v.index === 'withFlatBaseSetups' ? withFlatBaseSetups(dataset, refIndex, { from }) : withPowerPlayVcpRequired(dataset, refIndex);
      const r = runMinerviniLifecycle(dataset, { strategy, setupIndex: idx, config: v.config, from, to });
      if (!r.reconciliation.pass) throw new Error(`RECONCILIATION_FAILED:${strategy}:${v.id}`);
      ps.variants[v.id] = { source: v.source, indexChanges: idx.counts.sf7, ...publicOf(r), vsRef: diffTrades(ref.trades, r.trades) };
      ss.variants[v.id] = { metrics: runMetrics(r, { spyTR: dataset.spyTR }) };
      log(`${strategy} ${v.id}: trades ${r.trades.length} ${JSON.stringify(ps.variants[v.id].vsRef)}`);
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
  const LIMIT = Number(arg('--limit', '0')), smoke = argv.includes('--smoke-snapshot');
  const t0 = Date.now(), log = (m) => console.log(`[sf7 +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
  const K = await import('../../snapshot/contract.mjs');
  let pit, datasetSha256, verification, secPit;
  try {
    const { LIVE_IO, loadPitData } = await import('../../validation/analyze-methods.mjs');
    const { createSnapshotStore } = await import('../../snapshot/store.mjs');
    const { openSnapshot, verifyAgainstManifest, CANONICAL_LOAD } = await import('../../snapshot/snapshot.mjs');
    const opened = await openSnapshot({ store: createSnapshotStore({ driver: await LIVE_IO.createDriver(), smoke }), snapshotId, requireRestoreReceipt: true });
    pit = await loadPitData({ LIMIT: opened.manifest.capture.limit || 0, ...CANONICAL_LOAD, io: opened.io, log });
    const v = verifyAgainstManifest(opened.manifest, pit, { replay: false });
    if (v.codeVersionChanged && !argv.includes('--allow-code-version-change')) K.fail(K.REASON.INPUT_INTEGRITY_FAILURE, 'CODE_VERSION_CHANGED');
    datasetSha256 = K.sha256(K.canonicalJson(v.dataset));
    verification = { datasetVerified: v.datasetVerified, codeVersionChanged: v.codeVersionChanged, bytesVerified: opened.verified.bytes, smokeStore: smoke };
    const driver = await opened.io.createDriver();
    const buf = await driver.get(pit.mine.seriesPrefix + SEC_PIT_KEY);
    secPit = buf ? JSON.parse(zlib.gunzipSync(buf).toString('utf8')) : {};
    log(`snapshot ${snapshotId}: dataset ${v.datasetVerified}`);
  } catch (e) {
    console.error(e instanceof K.SnapshotError ? `${K.REASON.INPUT_INTEGRITY_FAILURE}: ${e.code}${e.detail ? ' ' + e.detail : ''}` : `INPUT_INTEGRITY_FAILURE: UNEXPECTED_ERROR ${e?.code ?? ''}`);
    process.exit(3);
  }
  if (LIMIT) pit.segs = pit.segs.slice(0, LIMIT);
  // same input construction as run-sf4-lifecycle (sec-pit attached; the lifecycle does not use it as a gate)
  const dataset = datasetFromPit(pit); attachSecPit(dataset, secPit);
  const receipt = { schema: 'supertrader-sf7-minervini-receipt-1.0.0', certification: FOUNDATION.certification, snapshotId, datasetSha256, accounting: FOUNDATION.accounting.mode, researchCodeSha256: researchCodeSha256(), variantRegistrySha256: variantRegistrySha256(), sf7VariantRegistrySha256: sf7VariantRegistrySha256(), runner: SF7_RUNNER_VERSION, limit: LIMIT || null, ...verification, runId: process.env.GITHUB_RUN_ID || 'local', commit: process.env.GITHUB_SHA || null };
  const r = sf7Part(dataset, { log });
  const full = !LIMIT && !smoke;
  if (full) for (const s of ['SEPA', 'POWER_PLAY']) if (!r.pub.strategies[s].ref.matchesAuthoritativeLedger) throw new Error(`REF_NOT_REPRODUCED:${s}`);
  const pub = { schema: 'supertrader-sf7-minervini-public-1.0.0', receipt, minervini: r.pub };
  fs.mkdirSync(OUT, { recursive: true });
  const tag = `sf7-minervini${full ? '' : '-smoke'}`;
  const pem = fs.readFileSync(path.join(ROOT, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  fs.writeFileSync(path.join(OUT, `${tag}.sealed.json`), L.encryptForOwner(pem, Buffer.from(JSON.stringify({ receipt, public: pub, minervini: r.sealed }))));
  fs.writeFileSync(path.join(OUT, `${tag}.public.json`), JSON.stringify(pub, null, 1) + '\n');
  log(`done; public ${tag}.public.json`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
