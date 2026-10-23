#!/usr/bin/env node
/**
 * Supertrader 6.0 – validation run on the frozen research snapshot with research-v1 (DIAGNOSTIC_NOT_CERTIFIED):
 *  1. cost sensitivity: every measurable reference (research/sf6-references.mjs) at four pre-registered cost levels;
 *     two of them already existed before any Supertrader 6.0 result (REF 10/1 bps, the research runner's COST2 20/2 bps);
 *  2. robustness splits of the REF trades, all defined before the run and known at the decision:
 *     - period: the research runner's split periods (2016-2020 / 2021-) and calendar years;
 *     - market regime at the prior session: SPY close above / below its 200-session SMA;
 *     - liquidity at the prior session: mean 20-session raw dollar volume in fixed bands (1-5 M, 5-25 M, >= 25 M USD);
 *     - concentration: share of the summed profit carried by the ten largest trades;
 *  3. the Supertrader 6.0 model variants (research/sf6-model-variants.mjs) beside their unchanged sf5 references;
 *  4. the split consistency of the Minervini EPS evidence at the SEPA REF entries (research/minervini-fundamentals-sf6.mjs).
 * No parameter is chosen from these results. The DEV window has been read by many earlier rounds: none of this is an
 * untouched holdout. Public: counts and hashes only; sealed (owner key): metrics and trade statistics.
 *
 *   node scripts/supertrader/source-faithful/research/run-sf6-validation.mjs --snapshot sts1-<id> --accounting research-v1 \
 *        --out <dir> [--references TURTLE_S1,...] [--parts costs,splits,models,fundamentals] [--limit 400 --smoke-snapshot]
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
import { fin, smaAt } from '../common/series.mjs';
import { attachSecPit } from './run-sf3-research.mjs';
import { runResearchLifecycle, prepareAll } from './lifecycle-engine.mjs';
import { SF5_LIFECYCLES } from './sf5-lifecycles.mjs';
import { SF6_REFERENCES, SF6_REFERENCE_KEYS, REFERENCE_COSTS } from './sf6-references.mjs';
import { SF6_MODEL_VARIANTS, sf6ModelVariantsSha256 } from './sf6-model-variants.mjs';
import { fundamentalEvidenceSf6, MIN_FUNDAMENTALS_SF6_VERSION } from './minervini-fundamentals-sf6.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
export const SF6_VALIDATION_RUNNER_VERSION = 'sf6-validation-runner-1.0.0';
const SEC_PIT_KEY = '_validation/sec-pit-r12.json.gz';

/** Pre-registered before the first Supertrader 6.0 result (test SF6-VALIDATION-PREREGISTERED pins it). */
export const SF6_VALIDATION_PROTOCOL = Object.freeze({
  id: 'SF6-VALIDATION-PROTOCOL', version: '1.1.0',
  costLevels: Object.freeze([
    Object.freeze({ id: 'COST-0', slippageBps: 0, commissionBps: 0, origin: 'frictionless bound' }),
    Object.freeze({ id: 'REF', ...REFERENCE_COSTS, origin: 'research-v1 reference of every earlier run' }),
    Object.freeze({ id: 'COST-20', slippageBps: 20, commissionBps: 2, origin: 'the bps of the COST2 scenario of runner/run-research.mjs (there combined with S1_MINUS_30; only the costs are reused)' }),
    Object.freeze({ id: 'COST-50', slippageBps: 50, commissionBps: 5, origin: 'stress level (small caps, wide spreads)' }),
  ]),
  // split periods per window (review SF6-B M2): DEV = the research runner's periods; HOLDOUT = before / after 2011-12-31
  splitPeriods: Object.freeze({ DEV: Object.freeze([['2016-01-04', '2020-12-31'], ['2021-01-01', L.WINDOWS.DEV.to]]), HOLDOUT: Object.freeze([[L.WINDOWS.HOLDOUT.from, '2011-12-31'], ['2012-01-01', L.WINDOWS.HOLDOUT.to]]) }),
  regime: Object.freeze({ id: 'SPY_SMA200_PRIOR_SESSION', sma: 200, basis: 'benchmark close vs its 200-session SMA at the session before the entry' }),
  liquidityBandsUsd: Object.freeze([1e6, 5e6, 25e6]), // 1 M = #705 universe floor; 5 M / 25 M are VU reporting bands (no source, set before any result)
  concentrationTopN: 10,
  holdout: 'NONE: the DEV window 2016-2026 was read by earlier rounds; the HOLDOUT window 2008-2015 was opened once in R14 for other implementations (a previously opened window, never an untouched holdout; ticker list incomplete for old delistings)',
});
export function sf6ValidationProtocolSha256() { return crypto.createHash('sha256').update(JSON.stringify(SF6_VALIDATION_PROTOCOL)).digest('hex'); }

const FILES = ['sf6-references.mjs', 'sf6-model-variants.mjs', 'minervini-fundamentals-sf6.mjs', 'run-sf6-validation.mjs'];
export function validationCodeSha256() {
  const h = crypto.createHash('sha256');
  for (const f of FILES) { h.update(f); h.update(fs.readFileSync(path.join(HERE, f))); }
  return h.digest('hex');
}
const sha = (x) => crypto.createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
const tally = (rows, key) => rows.reduce((o, r) => { const k = key(r); if (k != null) o[k] = (o[k] || 0) + 1; return o; }, {});
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const median = (a) => { const v = [...a].sort((x, y) => x - y), n = v.length; return n ? (n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2) : null; };

/** Trade statistics of closed trades (sealed only): count, hit rate, average win / loss, expectancy, profit factor, hold. */
export function tradeStats(trades) {
  const c = trades.filter((t) => t.status === 'CLOSED' && fin(t.pnl)), r = c.map((t) => t.returnPct).filter(fin);
  const w = c.filter((t) => t.pnl > 0), l = c.filter((t) => t.pnl < 0), gw = w.reduce((a, t) => a + t.pnl, 0), gl = -l.reduce((a, t) => a + t.pnl, 0);
  return { closed: c.length, winRate: c.length ? w.length / c.length : null, avgWinPct: mean(w.map((t) => t.returnPct).filter(fin)), avgLossPct: mean(l.map((t) => t.returnPct).filter(fin)), expectancyPct: mean(r), medianReturnPct: median(r), profitFactor: gl > 0 ? gw / gl : null, profitFactorUndefined: gl > 0 ? null : c.length ? 'NO_LOSING_TRADES' : 'NO_TRADES', sumPnl: gw - gl, medianHeldSessions: median(c.map((t) => t.heldSessions).filter(fin)) };
}

/** Share of the summed positive profit carried by the topN largest trades, and the net result without them. */
export function concentration(trades, topN) {
  const c = trades.filter((t) => t.status === 'CLOSED' && fin(t.pnl)).sort((a, b) => b.pnl - a.pnl), pos = c.filter((t) => t.pnl > 0).reduce((a, t) => a + t.pnl, 0);
  const topW = c.slice(0, topN).filter((t) => t.pnl > 0), top = topW.reduce((a, t) => a + t.pnl, 0), net = c.reduce((a, t) => a + t.pnl, 0);
  // only the largest WINNERS are removed (review L5: never a loser when fewer than topN trades won)
  return { topN, topShareOfPositivePnl: pos > 0 ? top / pos : null, netPnl: net, netPnlWithoutTopN: net - top };
}

/** Classifiers known at the session before the entry. */
export function makeClassifiers(ds, protocol = SF6_VALIDATION_PROTOCOL) {
  const bench = ds.benchmark ?? [], bIdx = new Map(bench.map((b, i) => [b.date, i])), cal = ds.calendar, cIdx = new Map(cal.map((d, i) => [d, i]));
  const secs = new Map(ds.securities.map((s) => [s.id, { bars: s.bars, idx: new Map(s.bars.map((b, i) => [b.date, i])) }]));
  const prior = (date) => { const k = cIdx.get(date); return k > 0 ? cal[k - 1] : null; };
  const regime = (date) => {
    const p = prior(date), j = p === null ? undefined : bIdx.get(p);
    if (j === undefined) return 'UNKNOWN';
    const m = smaAt(bench, j, protocol.regime.sma);
    return m === null || !fin(bench[j].close) ? 'UNKNOWN' : bench[j].close > m ? 'SPY_ABOVE_SMA200' : 'SPY_AT_OR_BELOW_SMA200';
  };
  const liquidity = (id, date) => {
    const x = secs.get(id), k = x?.idx.get(date);
    if (k === undefined || k < 20) return 'UNKNOWN';
    let dv = 0; for (let q = k - 20; q < k; q++) { const b = x.bars[q], c = b.rawClose ?? b.close, v = b.rawVolume ?? b.volume; if (!fin(c) || !fin(v)) return 'UNKNOWN'; dv += c * v; }
    dv /= 20; const [a, b2, c2] = protocol.liquidityBandsUsd;
    return dv < a ? 'LT_1M' : dv < b2 ? '1M_TO_5M' : dv < c2 ? '5M_TO_25M' : 'GE_25M';
  };
  return { regime, liquidity };
}

function splitsOf(trades, cls, protocol) {
  const groups = (key) => { const g = {}; for (const t of trades) (g[key(t)] ||= []).push(t); return g; };
  const byPeriod = groups((t) => { const p = protocol.splitPeriods.findIndex(([a, b]) => t.entryDate >= a && t.entryDate <= b); return p < 0 ? 'OUTSIDE' : `P${p + 1}`; });
  const byYear = groups((t) => t.entryDate.slice(0, 4)), byRegime = groups((t) => cls.regime(t.entryDate)), byLiquidity = groups((t) => cls.liquidity(t.id, t.entryDate));
  const pubCounts = (g) => Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.length]));
  const sealedStats = (g) => Object.fromEntries(Object.entries(g).map(([k, v]) => [k, tradeStats(v)]));
  return {
    pub: { byPeriod: pubCounts(byPeriod), byRegime: pubCounts(byRegime), byLiquidity: pubCounts(byLiquidity), byYear: pubCounts(byYear) },
    sealed: { all: tradeStats(trades), byPeriod: sealedStats(byPeriod), byRegime: sealedStats(byRegime), byLiquidity: sealedStats(byLiquidity), byYear: sealedStats(byYear), concentration: concentration(trades, protocol.concentrationTopN) },
  };
}

const metricsOf = (x, ds, protocol) => computeDiagnosticMetrics({ curve: x.run.curve, trades: x.metricTrades, ledger: x.run.ledger, costs: x.run.counts.costs, spyTR: ds.spyTR, splitPeriods: protocol.splitPeriods, initialCapital: 100000 });
const pubRun = (x) => ({ trades: x.trades.length, closed: x.trades.filter((t) => t.status === 'CLOSED').length, exitReasons: tally(x.trades, (t) => t.exitReason), reconciliation: x.run.reconciliation.pass, ledgerSha256: sha(x.run.ledger), tradesSha256: sha(x.trades.map((t) => [t.id, t.entryDate, t.exitDate, t.exitReason, t.shares])) });

/**
 * MIN-SF-FUNDAMENTALS split consistency at every SEPA REF entry (evidence only, no trade changes): how many entries
 * carry a year-ago EPS across a split, and where the 4.0 evidence and the split-consistent evidence differ. Counts only.
 */
export function fundamentalsComparison(ds, trades) {
  const byId = new Map(ds.securities.map((s) => [s.id, s])), out = { version: MIN_FUNDAMENTALS_SF6_VERSION, entries: trades.length, withEvidence: 0, withCorrectedQuarter: 0, withUndeterminableQuarter: 0, latestYoyChanged: 0, acceleratingChanged: 0 };
  for (const t of trades) {
    const s = byId.get(t.id); if (!s || !t.signalDate) continue;
    const e = fundamentalEvidenceSf6(s.fund, t.signalDate, s.bars);
    if (!e.epsSplitConsistent) continue;
    out.withEvidence++;
    if (e.epsSplitConsistent.correctedQuarters > 0) out.withCorrectedQuarter++;
    if (e.epsSplitConsistent.undeterminableQuarters > 0) out.withUndeterminableQuarter++;
    if (e.changedVsV1.latestYoy) out.latestYoyChanged++;
    if (e.changedVsV1.accelerating) out.acceleratingChanged++;
  }
  return out;
}

/** Pure part on one dataset. */
export function validationPart(ds, { keys = SF6_REFERENCE_KEYS, parts = ['costs', 'splits', 'models', 'fundamentals'], from = L.WINDOW.from, to = L.WINDOW.to, windowName = L.WINDOW_NAME, protocol = SF6_VALIDATION_PROTOCOL, log = () => {} } = {}) {
  protocol = { ...protocol, splitPeriods: protocol.splitPeriods[windowName] ?? protocol.splitPeriods.DEV };
  const pub = { runner: SF6_VALIDATION_RUNNER_VERSION, windowName, protocol: protocol.id, protocolSha256: sf6ValidationProtocolSha256(), certification: 'DIAGNOSTIC_NOT_CERTIFIED', holdout: protocol.holdout, window: { from, to }, references: {}, models: {} };
  const sealed = { label: 'DIAGNOSTIC_METRICS_NOT_A_STRATEGY_RETURN', references: {}, models: {} };
  const cls = makeClassifiers(ds, protocol);
  for (const ref of SF6_REFERENCES.filter((r) => keys.includes(r.key))) {
    const prep = ref.prep(ds, { from }) ?? {}, levels = parts.includes('costs') ? protocol.costLevels : protocol.costLevels.filter((c) => c.id === 'REF');
    const p = (pub.references[ref.key] = { candidateId: ref.candidateId, costLevels: {} }), s = (sealed.references[ref.key] = { costLevels: {} });
    for (const c of levels) {
      const x = ref.run(ds, { from, to, costs: { slippageBps: c.slippageBps, commissionBps: c.commissionBps }, ...prep });
      if (!x.run.reconciliation.pass) throw new Error(`RECONCILIATION_FAILED:${ref.key}:${c.id}`);
      p.costLevels[c.id] = pubRun(x); s.costLevels[c.id] = { metrics: metricsOf(x, ds, protocol), stats: tradeStats(x.trades) };
      if (c.id === 'REF' && parts.includes('splits')) { const sp = splitsOf(x.trades, cls, protocol); p.splits = sp.pub; s.splits = sp.sealed; }
      if (c.id === 'REF' && ref.key === 'MINERVINI_SEPA' && parts.includes('fundamentals')) p.fundamentalsSplitConsistency = fundamentalsComparison(ds, x.trades);
      log(`${ref.key} ${c.id}: trades ${x.trades.length}`);
    }
  }
  if (parts.includes('models')) {
    for (const v of SF6_MODEL_VARIANTS) {
      const lc = SF5_LIFECYCLES.find((l) => l.key === v.key);
      const r = runResearchLifecycle(ds, { adapter: v.adapter, config: v.config, prepared: prepareAll(ds, v.adapter, v.config), from, to });
      if (!r.reconciliation.pass) throw new Error(`RECONCILIATION_FAILED:${v.id}`);
      const x = { run: r, trades: r.trades.map((t) => ({ id: t.id, entryDate: t.entryDate, exitDate: t.exitDate ?? null, exitReason: t.exitReason ?? null, shares: t.shares, status: t.status, pnl: t.pnl ?? null, returnPct: t.returnPct ?? null, heldSessions: t.heldSessions ?? null })), metricTrades: r.trades.filter((t) => t.status === 'CLOSED') };
      pub.models[v.id] = { key: v.key, candidateId: v.candidateId, assumption: v.assumption, phaseClosed: v.phaseClosed, label: v.adapter.label, comparedWith: `${lc.key} REF (unchanged)`, ...pubRun(x), counts: { ...r.counts, costs: undefined, dividends: undefined, eligibilityBlockers: undefined }, rejections: tally(r.rejections, (q) => q.reason) };
      sealed.models[v.id] = { metrics: metricsOf(x, ds, protocol), stats: tradeStats(x.trades), splits: splitsOf(x.trades, cls, protocol).sealed };
      log(`${v.id}: trades ${x.trades.length}`);
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
  const LIMIT = Number(arg('--limit', '0')), keys = arg('--references', SF6_REFERENCE_KEYS.join(',')).split(','), parts = arg('--parts', 'costs,splits,models,fundamentals').split(',');
  if (!keys.every((k) => SF6_REFERENCE_KEYS.includes(k))) { console.error('UNKNOWN_REFERENCE'); process.exit(2); }
  const t0 = Date.now(), log = (m) => console.log(`[sf6-validation +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
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
    verification = { datasetVerified: v.datasetVerified, codeVersionChanged: v.codeVersionChanged, bytesVerified: opened.verified.bytes, smokeStore: argv.includes('--smoke-snapshot'), window: opened.manifest.window ?? null };
    const driver = await opened.io.createDriver();
    const buf = await driver.get(pit.mine.seriesPrefix + SEC_PIT_KEY);
    secPit = buf ? JSON.parse(zlib.gunzipSync(buf).toString('utf8')) : {};
    log(`snapshot ${snapshotId}: dataset ${v.datasetVerified}; sec-pit r12 listings ${Object.keys(secPit).length}`);
  } catch (e) {
    console.error(e instanceof K.SnapshotError ? `${K.REASON.INPUT_INTEGRITY_FAILURE}: ${e.code}${e.detail ? ' ' + e.detail : ''}` : `INPUT_INTEGRITY_FAILURE: UNEXPECTED_ERROR ${e?.code ?? ''}`);
    process.exit(3);
  }
  if (LIMIT) pit.segs = pit.segs.slice(0, LIMIT);
  const ds = datasetFromPit(pit); attachSecPit(ds, secPit);
  log(`dataset: ${ds.securities.length} securities, ${ds.calendar.length} sessions`);
  const receipt = { schema: 'supertrader-sf6-validation-receipt-1.0.0', certification: FOUNDATION.certification, snapshotId, datasetSha256, accounting: FOUNDATION.accounting.mode, engineCodeSha256: engineCodeSha256(), validationCodeSha256: validationCodeSha256(), protocolSha256: sf6ValidationProtocolSha256(), modelVariantsSha256: sf6ModelVariantsSha256(), runner: SF6_VALIDATION_RUNNER_VERSION, references: keys, parts, limit: LIMIT || null, ...verification, runId: process.env.GITHUB_RUN_ID || 'local', commit: process.env.GITHUB_SHA || null };
  const r = validationPart(ds, { keys, parts, log });
  const pub = { schema: 'supertrader-sf6-validation-public-1.0.0', receipt, validation: r.pub };
  const sealed = { receipt, public: pub, validation: r.sealed };
  fs.mkdirSync(OUT, { recursive: true });
  const tag = `sf6-validation${LIMIT || verification.smokeStore ? '-smoke' : ''}`;
  const pem = fs.readFileSync(path.join(ROOT, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  fs.writeFileSync(path.join(OUT, `${tag}.sealed.json`), L.encryptForOwner(pem, Buffer.from(JSON.stringify(sealed))));
  fs.writeFileSync(path.join(OUT, `${tag}.public.json`), JSON.stringify(pub, null, 1) + '\n');
  log(`done; public ${tag}.public.json`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
