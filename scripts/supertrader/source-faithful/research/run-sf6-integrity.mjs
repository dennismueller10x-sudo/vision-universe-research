#!/usr/bin/env node
/**
 * Supertrader 6.0 – V4-D1 containment run (integrity/discontinuity.mjs) on the frozen research snapshot with research-v1.
 * For every measurable lifecycle reference (Turtle S1 / S2 BASE_S0, Minervini SEPA / Power Play REF, the seven sf5 REF
 * configurations) it runs the UNCHANGED reference configuration on
 *   BASE   the snapshot segments as every earlier run read them,
 *   DQ-K5  the segments cut before every session with a total-return relative >= 5 or <= 1/5 (primary containment),
 *   DQ-K3  the same with k = 3 (sensitivity band),
 * and compares the trades (integrity/discontinuity.mjs#compareTrades). No engine, screen, adapter or configuration is
 * changed; BASE must reproduce the trade hashes of the earlier authoritative runs.
 *  - public (repository log): census of the flagged sessions (counts by year, direction, kind, price band, universe),
 *    trade counts, exit reasons, the trade-level comparison, reconciliation, hashes;
 *  - sealed (owner key): the flagged sessions (segment ids, dates, ratios), diagnostic metrics per run incl. the
 *    pre-registered split periods of the research runner (2016-2020 / 2021-), and the exposed trade keys.
 * DIAGNOSTIC_NOT_CERTIFIED; the quarantine is a containment of a SUPERSET of suspicious sessions, not a data correction.
 *
 *   node scripts/supertrader/source-faithful/research/run-sf6-integrity.mjs --snapshot sts1-<id> --accounting research-v1 \
 *        --out <dir> [--lifecycles TURTLE_S1,...] [--policies DQ-K5,DQ-K3] [--limit 400 --smoke-snapshot]
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as L from '../../validation/lib.mjs';
import { datasetFromPit } from '../runner/snapshot-input.mjs';
import { codeSha256 as engineCodeSha256 } from '../runner/run-research.mjs';
import { computeDiagnosticMetrics } from '../runner/metrics.mjs';
import { FOUNDATION } from '../contract.mjs';
import { runTurtle } from '../methods/turtle.mjs';
import { attachSecPit } from './run-sf3-research.mjs';
import { RUN_VARIANTS as MIN_VARIANTS } from './minervini-lifecycle.mjs';
import { buildSetupIndex, runMinerviniLifecycle } from './minervini-execution.mjs';
import { runResearchLifecycle, prepareAll } from './lifecycle-engine.mjs';
import { SF5_LIFECYCLES } from './sf5-lifecycles.mjs';
import { DQ_POLICIES, DQ_VERSION, quarantineSegments, compareTrades, EXPOSURE_LOOKBACK_DAYS, NOT_A_DEFECT_CLAIM } from '../integrity/discontinuity.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
export const SF6_INTEGRITY_RUNNER_VERSION = 'sf6-integrity-runner-1.0.0';
const SEC_PIT_KEY = '_validation/sec-pit-r12.json.gz';
/** The pre-registered split periods of the research runner (runner/run-research.mjs SPLIT_PERIODS), reused unchanged. */
export const SPLIT_PERIODS = Object.freeze([['2016-01-04', '2020-12-31'], ['2021-01-01', L.WINDOW.to]]);
const FILES = ['../integrity/discontinuity.mjs', 'run-sf6-integrity.mjs'];
export function integrityCodeSha256() {
  const h = crypto.createHash('sha256');
  for (const f of FILES) { h.update(f); h.update(fs.readFileSync(path.join(HERE, f))); }
  return h.digest('hex');
}
const sha = (x) => crypto.createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
const tally = (rows, key) => rows.reduce((o, r) => { const k = key(r); if (k != null) o[k] = (o[k] || 0) + 1; return o; }, {});

/**
 * The reference runs, each returning normalized trades { id, entryDate, exitDate, exitReason, shares, status, pnl } and
 * the run (curve, ledger, counts, reconciliation). The configurations are the unchanged REF / BASE_S0 of each registry.
 */
export const INTEGRITY_LIFECYCLES = Object.freeze([
  { key: 'TURTLE_S1', candidateId: 'C01', run: (ds, w) => turtle(ds, 'S1', w) },
  { key: 'TURTLE_S2', candidateId: 'C02', run: (ds, w) => turtle(ds, 'S2', w) },
  { key: 'MINERVINI_SEPA', candidateId: 'C06', run: (ds, w) => minervini(ds, 'SEPA', w) },
  { key: 'MINERVINI_POWER_PLAY', candidateId: 'C07', run: (ds, w) => minervini(ds, 'POWER_PLAY', w) },
  ...SF5_LIFECYCLES.map((lc) => ({ key: lc.key, candidateId: lc.candidateId, run: (ds, w) => sf5(ds, lc, w) })),
]);
export const INTEGRITY_KEYS = Object.freeze(INTEGRITY_LIFECYCLES.map((l) => l.key));

function turtle(ds, system, { from, to }) {
  const r = runTurtle(ds, { system, from, to, scenario: 'S0_LAST_PRICE' });
  const trades = r.positionTrades.map((t) => ({ id: t.id, entryDate: t.entryDate, exitDate: t.exitDate, exitReason: t.reason, shares: t.maxUnits, status: 'CLOSED', pnl: t.pnl }));
  return { run: r, trades, metricTrades: r.positionTrades };
}
function minervini(ds, strategy, { from, to }) {
  const ref = MIN_VARIANTS.find((v) => v.id === 'REF');
  const r = runMinerviniLifecycle(ds, { strategy, setupIndex: buildSetupIndex(ds, strategy, { from }), config: ref.config, from, to });
  return { run: r, trades: r.trades.map(norm), metricTrades: r.trades.filter((t) => t.status === 'CLOSED') };
}
function sf5(ds, lc, { from, to }) {
  const ref = lc.variants.find((v) => v.id === 'REF');
  const r = runResearchLifecycle(ds, { adapter: lc.adapter, config: ref.config, prepared: prepareAll(ds, lc.adapter, ref.config), from, to });
  return { run: r, trades: r.trades.map(norm), metricTrades: r.trades.filter((t) => t.status === 'CLOSED') };
}
const norm = (t) => ({ id: t.id, entryDate: t.entryDate, exitDate: t.exitDate ?? null, exitReason: t.exitReason ?? null, shares: t.shares, status: t.status, pnl: t.pnl ?? null });

/**
 * Pure part: runs the selected references on BASE and on each quarantine policy of the given segments.
 * segs: snapshot segments ({ id, raw, endCause, ... }); makeDataset(segs) builds the method input.
 */
export function integrityPart(segs, makeDataset, { keys = INTEGRITY_KEYS, policies = Object.keys(DQ_POLICIES), from = L.WINDOW.from, to = L.WINDOW.to, dataEnd = L.WINDOW.to, log = () => {} } = {}) {
  const pub = { version: DQ_VERSION, runner: SF6_INTEGRITY_RUNNER_VERSION, ...NOT_A_DEFECT_CLAIM, exposureLookbackDays: EXPOSURE_LOOKBACK_DAYS, window: { from, to }, census: {}, lifecycles: {} };
  const sealed = { label: 'DIAGNOSTIC_METRICS_NOT_A_STRATEGY_RETURN', events: {}, lifecycles: {} };
  const lcs = INTEGRITY_LIFECYCLES.filter((l) => keys.includes(l.key));
  const runAll = (ds, tag) => {
    const out = {};
    for (const lc of lcs) {
      const x = lc.run(ds, { from, to });
      if (!x.run.reconciliation.pass) throw new Error(`RECONCILIATION_FAILED:${lc.key}:${tag}`);
      const metrics = computeDiagnosticMetrics({ curve: x.run.curve, trades: x.metricTrades, ledger: x.run.ledger, costs: x.run.counts.costs, spyTR: ds.spyTR, splitPeriods: SPLIT_PERIODS, initialCapital: 100000 });
      out[lc.key] = { trades: x.trades, metrics, pub: { trades: x.trades.length, closed: x.trades.filter((t) => t.status === 'CLOSED').length, exitReasons: tally(x.trades, (t) => t.exitReason), tradesByEntryYear: tally(x.trades, (t) => t.entryDate.slice(0, 4)), reconciliation: x.run.reconciliation.pass, ledgerSha256: sha(x.run.ledger), tradesSha256: sha(x.trades.map((t) => [t.id, t.entryDate, t.exitDate, t.exitReason, t.shares])) } };
      log(`${tag} ${lc.key}: trades ${x.trades.length}`);
    }
    return out;
  };
  const base = runAll(makeDataset(segs), 'BASE');
  for (const lc of lcs) { pub.lifecycles[lc.key] = { candidateId: lc.candidateId, BASE: base[lc.key].pub }; sealed.lifecycles[lc.key] = { BASE: { metrics: base[lc.key].metrics } }; }
  for (const pid of policies) {
    const policy = DQ_POLICIES[pid]; if (!policy) throw new Error(`UNKNOWN_DQ_POLICY:${pid}`);
    const q = quarantineSegments(segs, policy);
    pub.census[pid] = q.census; sealed.events[pid] = q.events;
    log(`${pid}: flags ${q.census.flags} in ${q.census.segmentsFlagged} segments; pieces ${q.census.piecesAfter}`);
    const res = runAll(makeDataset(q.segs), pid);
    for (const lc of lcs) {
      const cmp = compareTrades(base[lc.key].trades, res[lc.key].trades, q.events, { dataEnd });
      pub.lifecycles[lc.key][pid] = { ...res[lc.key].pub, comparisonWithBase: cmp.public };
      sealed.lifecycles[lc.key][pid] = { metrics: res[lc.key].metrics, exposedBaseTradeKeys: cmp.sealedExposedKeys };
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
  const LIMIT = Number(arg('--limit', '0')), keys = arg('--lifecycles', INTEGRITY_KEYS.join(',')).split(','), policies = arg('--policies', Object.keys(DQ_POLICIES).join(',')).split(',');
  if (!keys.every((k) => INTEGRITY_KEYS.includes(k))) { console.error('UNKNOWN_LIFECYCLE'); process.exit(2); }
  if (!policies.every((p) => DQ_POLICIES[p])) { console.error('UNKNOWN_DQ_POLICY'); process.exit(2); }
  const t0 = Date.now(), log = (m) => console.log(`[sf6-integrity +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
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
  // same input construction as run-sf4-lifecycle (sec-pit attached for Minervini) for every segment list
  const makeDataset = (segs) => { const ds = datasetFromPit({ ...pit, segs }); attachSecPit(ds, secPit); return ds; };
  const receipt = { schema: 'supertrader-sf6-integrity-receipt-1.0.0', certification: FOUNDATION.certification, snapshotId, datasetSha256, accounting: FOUNDATION.accounting.mode, engineCodeSha256: engineCodeSha256(), integrityCodeSha256: integrityCodeSha256(), runner: SF6_INTEGRITY_RUNNER_VERSION, policies: policies.map((p) => DQ_POLICIES[p]), lifecycles: keys, limit: LIMIT || null, ...verification, runId: process.env.GITHUB_RUN_ID || 'local', commit: process.env.GITHUB_SHA || null };
  const r = integrityPart(pit.segs, makeDataset, { keys, policies, log });
  const pub = { schema: 'supertrader-sf6-integrity-public-1.0.0', receipt, integrity: r.pub };
  const sealed = { receipt, public: pub, integrity: r.sealed };
  fs.mkdirSync(OUT, { recursive: true });
  const tag = `sf6-integrity${LIMIT || verification.smokeStore ? '-smoke' : ''}`;
  const pem = fs.readFileSync(path.join(ROOT, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  fs.writeFileSync(path.join(OUT, `${tag}.sealed.json`), L.encryptForOwner(pem, Buffer.from(JSON.stringify(sealed))));
  fs.writeFileSync(path.join(OUT, `${tag}.public.json`), JSON.stringify(pub, null, 1) + '\n');
  log(`done; public ${tag}.public.json`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
