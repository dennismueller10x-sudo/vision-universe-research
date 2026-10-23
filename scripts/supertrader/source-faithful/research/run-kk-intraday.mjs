#!/usr/bin/env node
/**
 * Kullamaegi Episodic Pivot (C09) / Parabolic Short (C10), chart-first snapshot runner. DIAGNOSTIC_NOT_CERTIFIED.
 *  A  daily chart screens on the frozen research snapshot (all history): CHART_EP_CANDIDATE, PS_CHART_CANDIDATE;
 *  B  intraday confirmation on REAL Tiingo IEX minute bars (2017+), fetched only for screened candidate days, in a
 *     deterministic order (sha256 of `TICKER|date`), within a hard request budget (--max-requests), cached in the private
 *     bucket and resumable; a day that is not (yet) fetched is reported as such, never simulated from daily bars;
 *  EP  every pre-registered variant on the shared research engine (research-v1, order type INTRADAY_RESOLVED);
 *  PS  every pre-registered variant as a trade-level short model study (no borrow data, never executable).
 * Public (repository log): candidate counts per year, fetch coverage, statuses, trade and exit-reason counts, hashes.
 * Sealed (owner key): metrics and trade lists. Minute values never leave the sealed file and the private cache
 * (internal, non-displaying use).
 *
 *   node scripts/supertrader/source-faithful/research/run-kk-intraday.mjs --snapshot sts1-<id> --accounting research-v1 \
 *        --out <dir> [--max-requests 6000] [--count-only] [--limit 400 --smoke-snapshot]
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
import { eligibleAtPriorSession } from '../common/series.mjs';
import { runResearchLifecycle, runMetricsSF5, prepareAll, ENGINE_VERSION } from './lifecycle-engine.mjs';
import { toSession, compactSession, expandSession, tickerOf, KK_INTRADAY_VERSION } from './kk-intraday.mjs';
import { KK_EP_ADAPTER, EP_RUN_VARIANTS, EP_REFERENCE_CONFIG, EP_FIRST_INTRADAY_DATE, epChartCandidate, epVariantRegistrySha256, KK_EP_LIFECYCLE_VERSION, IEX_BASELINE_SESSIONS, IEX_BASELINE_MIN_DAYS } from './kk-ep-lifecycle.mjs';
import { PS_RUN_VARIANTS, PS_FIRST_INTRADAY_DATE, psChartCandidate, runPsCandidate, psVariantRegistrySha256, KK_PS_STUDY_VERSION } from './kk-ps-study.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
export const KK_RUNNER_VERSION = 'kk-intraday-runner-1.1.0';
export const KK_RESEARCH_FILES = Object.freeze(['kk-intraday.mjs', 'kk-ep-lifecycle.mjs', 'kk-ps-study.mjs', 'run-kk-intraday.mjs', 'lifecycle-engine.mjs', 'minervini-execution.mjs', '../methods/kullamagi.mjs', '../common/series.mjs', '../runner/metrics.mjs']);
export const DEFAULT_MAX_REQUESTS = 6000, MAX_REQUESTS_CAP = 6000; // per run, every HTTP attempt counts; the cache resumes
export const EP_BUDGET_SHARE = 2 / 3; // EP (baseline + minutes per day) first, the rest to PS; EP leftovers go to PS
// Phase 1b (run 39933893419): resampleFreq=1day is rejected (400), 4hour returns one bar set per session with IEX volume
export const BASELINE_FREQS = Object.freeze(['4hour', '1hour']);
export const CACHE_SHARDS = 16; // shard = first hex digit of sha256(key); each shard is one private gzip JSON object
// the baseline value depends on its rule (sessions, minimum days): the rule is part of the key, so a new rule never reuses old means
export const cacheKey = (kind, shard) => `_validation/kk-epps-v2/${kind === 'baseline' ? `baseline-s${IEX_BASELINE_SESSIONS}m${IEX_BASELINE_MIN_DAYS}` : kind}-${shard}.json.gz`;
export const CHECKPOINT_REQUESTS = 2000; // shards are rewritten every 2000 requests and at the end (each write re-reads the shard)
export const shardOf = (key) => crypto.createHash('sha256').update(key).digest('hex')[0];
export function kkResearchCodeSha256() {
  const h = crypto.createHash('sha256');
  for (const f of KK_RESEARCH_FILES) { h.update(f); h.update(fs.readFileSync(path.join(HERE, f))); }
  return h.digest('hex');
}
const sha = (x) => crypto.createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
const bump = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };

// screens use the widest pre-registered variant, so every variant's candidate days are covered by one fetch list
const EP_SCREEN = Object.freeze({ ...EP_REFERENCE_CONFIG, quietPhase: 'NONE' });
const PS_SCREEN = Object.freeze({ streak: 3, accel: false });

/** Daily candidates of both methods: { ep: [{ id, ticker, i, date }], ps: [...] } inside the research universe. */
export function screenCandidates(dataset) {
  const ep = [], ps = [];
  for (const s of dataset.securities) {
    const t = tickerOf(s.id), bars = s.bars;
    for (let i = 1; i < bars.length; i++) {
      if (!eligibleAtPriorSession(bars, i)) continue;
      const e = epChartCandidate(bars, i, EP_SCREEN); if (e) ep.push({ id: s.id, ticker: t, i, date: bars[i].date, gap: e.gap });
      const p = psChartCandidate(bars, i, PS_SCREEN); if (p) ps.push({ id: s.id, ticker: t, i, date: bars[i].date });
    }
  }
  return { ep, ps };
}

/** Public counts of a candidate list: per year and per intraday availability window. */
export function candidateCounts(list, firstIntraday) {
  const byYear = {}; for (const c of list) bump(byYear, c.date.slice(0, 4));
  return { total: list.length, byYear, inIexHistory: list.filter((c) => c.date >= firstIntraday).length };
}

/** Deterministic fetch order: sha256 of the cache key (no ranking by anything that could relate to an outcome). */
export const fetchOrder = (keys) => [...new Set(keys)].sort((a, b) => (sha(a) < sha(b) ? -1 : sha(a) > sha(b) ? 1 : 0));

/** Every budget ({ used, max }) in `budgets` still has room. */
export const hasRoom = (budgets, n = 1) => budgets.every((b) => b.max - b.used >= n);
/** Budgeted GET: every attempt (retries included) consumes one unit of each budget in `budgets`; none past a cap. */
export async function getJson(url, key, budgets, fetchImpl = fetch, pause = (ms) => new Promise((res) => setTimeout(res, ms))) {
  for (let a = 0; a < 3; a++) {
    if (!hasRoom(budgets)) return { status: 'BUDGET_EXHAUSTED', body: null };
    for (const b of budgets) b.used++;
    try {
      const r = await fetchImpl(url, { headers: { Authorization: 'Token ' + key } });
      if (r.status === 429 || r.status >= 500) { await pause(2000 * (a + 1)); continue; }
      const t = await r.text(); let b = null; try { b = JSON.parse(t); } catch { b = null; }
      return { status: r.status, body: b };
    } catch { await pause(2000); }
  }
  return { status: 0, body: null };
}
/**
 * Only a definitive answer is cached: a 200 with a JSON array, or 404 (no IEX data); 0 / 429 / 5xx / budget and a 200
 * with an unreadable body stay open for a later run. Concurrent runs: the read-before-write merge narrows, but does not
 * close, the window in which two runs write the same shard (no conditional put); a lost key is only fetched again.
 */
export const definitive = (status, body) => (status === 200 && Array.isArray(body)) || status === 404;

/** Validated numeric argument: an integer in [min, max], else null. */
export const intArg = (v, min, max) => { const n = Number(v); return Number.isInteger(n) && n >= min && n <= max ? n : null; };

const etDate = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

/**
 * Mean IEX daily volume over the given session dates from one range request (MA-EP-VOLUME-PACE: mean over all sessions,
 * a session without IEX volume counts 0; null below IEX_BASELINE_MIN_DAYS sessions with volume).
 */
export function iexBaselineFromRange(rangeBars, sessionDates) {
  const per = new Map();
  for (const b of rangeBars || []) { const d = etDate(b.date); if (Number.isFinite(b.volume)) per.set(d, (per.get(d) || 0) + b.volume); }
  const vols = sessionDates.map((d) => per.get(d) ?? 0), withVol = vols.filter((v) => v > 0).length;
  return withVol >= IEX_BASELINE_MIN_DAYS ? { mean: vols.reduce((a, b) => a + b, 0) / vols.length, days: vols.length, daysWithVolume: withVol } : { mean: null, days: vols.length, daysWithVolume: withVol };
}

async function main() {
  const argv = process.argv.slice(2), arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  if (arg('--accounting') !== 'research-v1') { console.error('RESEARCH_ACCOUNTING_REQUIRED'); process.exit(2); }
  const snapshotId = arg('--snapshot');
  if (!/^sts1-[0-9a-f]{32}$/.test(snapshotId || '')) { console.error('SNAPSHOT_REQUIRED'); process.exit(2); }
  const OUT = arg('--out'); if (!OUT) { console.error('--out required'); process.exit(2); }
  const LIMIT = intArg(arg('--limit', '0'), 0, 1e6), MAX_REQ = intArg(arg('--max-requests', String(DEFAULT_MAX_REQUESTS)), 1, MAX_REQUESTS_CAP), COUNT_ONLY = argv.includes('--count-only');
  if (LIMIT === null) { console.error('LIMIT_INVALID'); process.exit(2); }
  if (MAX_REQ === null) { console.error(`MAX_REQUESTS_INVALID (integer 1..${MAX_REQUESTS_CAP})`); process.exit(2); }
  const t0 = Date.now(), log = (m) => console.log(`[kk +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
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

  // A: daily screens
  const cand = screenCandidates(dataset);
  const counts = { ep: candidateCounts(cand.ep, EP_FIRST_INTRADAY_DATE), ps: candidateCounts(cand.ps, PS_FIRST_INTRADAY_DATE) };
  log(`candidates: EP ${counts.ep.total} (IEX window ${counts.ep.inIexHistory}), PS ${counts.ps.total} (IEX window ${counts.ps.inIexHistory})`);
  const receipt = { schema: 'supertrader-kk-intraday-receipt-1.0.0', certification: FOUNDATION.certification, snapshotId, datasetSha256, accounting: FOUNDATION.accounting.mode, engineVersion: ENGINE_VERSION, engineCodeSha256: engineCodeSha256(), researchCodeSha256: kkResearchCodeSha256(), runner: KK_RUNNER_VERSION, intraday: KK_INTRADAY_VERSION, ep: KK_EP_LIFECYCLE_VERSION, ps: KK_PS_STUDY_VERSION, epVariantRegistrySha256: epVariantRegistrySha256(), psVariantRegistrySha256: psVariantRegistrySha256(), limit: LIMIT || null, maxRequests: MAX_REQ, ...verification, runId: process.env.GITHUB_RUN_ID || 'local', commit: process.env.GITHUB_SHA || null };
  const pub = { schema: 'supertrader-kk-intraday-public-1.0.0', receipt, label: 'CHART_FIRST_MODEL_STUDIES_NOT_ORIGINAL_EP_NOT_EXECUTABLE_SHORTS', candidates: counts };
  fs.mkdirSync(OUT, { recursive: true });
  const write = (sealed) => {
    const tag = `kk-intraday${COUNT_ONLY ? '-count' : ''}${LIMIT || verification.smokeStore ? '-smoke' : ''}`;
    fs.writeFileSync(path.join(OUT, `${tag}.public.json`), JSON.stringify(pub, null, 1) + '\n');
    const pem = fs.readFileSync(path.join(ROOT, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
    fs.writeFileSync(path.join(OUT, `${tag}.sealed.json`), L.encryptForOwner(pem, Buffer.from(JSON.stringify({ receipt, public: pub, ...sealed }))));
    log(`done; public ${tag}.public.json`);
  };
  if (COUNT_ONLY) { write({}); return; }

  // B: minute cache (private bucket, sharded), budgeted and resumable
  const { createS3DriverFromEnv } = await import(path.join(ROOT, 'scripts/market/storage/s3-driver.mjs'));
  const driver = createS3DriverFromEnv(process.env), KEY = process.env.TIINGO_API_KEY || '';
  const SHARDS = Array.from({ length: CACHE_SHARDS }, (_, n) => n.toString(16));
  const getShard = async (kind, h) => { pit.budget.consumeClassB(1, `GET ${kind}-${h}`); const b = await driver.get(pit.mine.seriesPrefix + cacheKey(kind, h)); return b ? JSON.parse(zlib.gunzipSync(b).toString('utf8')) : {}; };
  const loadAll = async (kind) => { const o = {}; for (const h of SHARDS) Object.assign(o, await getShard(kind, h)); return o; };
  const added = { minutes: new Map(), baseline: new Map() }; // shard -> keys added by this run
  const mark = (kind, k) => { const h = shardOf(k); if (!added[kind].has(h)) added[kind].set(h, new Set()); added[kind].get(h).add(k); };
  // re-read a shard before writing it, so entries another run added meanwhile are kept (definitive entries only)
  const saveDirty = async (kind, cache) => {
    if (LIMIT || verification.smokeStore) return; // smoke runs never write the shared cache
    for (const [h, keys] of added[kind]) {
      const merged = await getShard(kind, h);
      for (const k of keys) merged[k] = cache[k];
      pit.budget.consumeClassA(1, `PUT ${kind}-${h}`);
      await driver.put(pit.mine.seriesPrefix + cacheKey(kind, h), zlib.gzipSync(Buffer.from(JSON.stringify(merged))), { contentType: 'application/gzip' });
    }
    added[kind].clear();
  };
  const minuteCache = await loadAll('minutes'), baseCache = await loadAll('baseline');
  const startMinutes = Object.keys(minuteCache).length, startBase = Object.keys(baseCache).length;
  const sec = new Map(dataset.securities.map((s) => [s.id, s]));
  const epKeys = [...new Set(cand.ep.filter((c) => c.date >= EP_FIRST_INTRADAY_DATE).map((c) => `${c.ticker}|${c.date}`))];
  const psKeys = [...new Set(cand.ps.filter((c) => c.date >= PS_FIRST_INTRADAY_DATE).map((c) => `${c.ticker}|${c.date}`))];
  const budget = { used: 0, max: MAX_REQ }, epBudget = { used: 0, max: Math.floor(MAX_REQ * EP_BUDGET_SHARE) };
  const epByKey = new Map(cand.ep.map((c) => [`${c.ticker}|${c.date}`, c]));
  const httpStatus = {};
  const fetchMinutes = async (k, b) => {
    const [t, d] = k.split('|');
    const r = await getJson(`https://api.tiingo.com/iex/${encodeURIComponent(t)}/prices?startDate=${d}&endDate=${d}&resampleFreq=1min&columns=open,high,low,close,volume`, KEY, b);
    bump(httpStatus, `minutes:${r.status}`);
    if (definitive(r.status, r.body)) { minuteCache[k] = compactSession(toSession(Array.isArray(r.body) ? r.body : [])); mark('minutes', k); }
    return r.status;
  };
  const fetchBaseline = async (k, b) => {
    const c = epByKey.get(k), bars = sec.get(c.id).bars;
    if (c.i < IEX_BASELINE_SESSIONS) { baseCache[k] = { mean: null, reason: 'HISTORY' }; mark('baseline', k); return 'HISTORY'; }
    const dates = bars.slice(c.i - IEX_BASELINE_SESSIONS, c.i).map((x) => x.date), [t] = k.split('|');
    for (const f of BASELINE_FREQS) {
      const r = await getJson(`https://api.tiingo.com/iex/${encodeURIComponent(t)}/prices?startDate=${dates[0]}&endDate=${dates.at(-1)}&resampleFreq=${f}&columns=volume`, KEY, b);
      bump(httpStatus, `baseline:${f}:${r.status}`);
      if (r.status === 400) continue; // frequency rejected: next pre-registered frequency
      if (definitive(r.status, r.body)) { baseCache[k] = { ...iexBaselineFromRange(Array.isArray(r.body) ? r.body : [], dates), freq: f, status: r.status }; mark('baseline', k); }
      return r.status;
    }
    return 400;
  };
  let lastSave = 0;
  const checkpoint = async () => { if (budget.used - lastSave >= CHECKPOINT_REQUESTS) { lastSave = budget.used; await saveDirty('minutes', minuteCache); await saveDirty('baseline', baseCache); log(`requests ${budget.used}`); } };
  // EP first (each day needs its baseline and its minutes), deterministic hash order
  const epB = [budget, epBudget];
  for (const k of fetchOrder(epKeys)) {
    const needBase = !(k in baseCache), needMin = !(k in minuteCache);
    if (!needBase && !needMin) continue;
    if (!hasRoom(epB, (needBase ? 1 : 0) + (needMin ? 1 : 0))) break; // do not start a day without room for both requests (retries can still leave one for a later run)
    if (needBase) await fetchBaseline(k, epB);
    if (needMin) await fetchMinutes(k, epB);
    await checkpoint(); await new Promise((res) => setTimeout(res, 120));
  }
  // PS with the rest of the run budget
  for (const k of fetchOrder(psKeys)) {
    if (!hasRoom([budget])) break;
    if (k in minuteCache) continue;
    await fetchMinutes(k, [budget]);
    await checkpoint(); await new Promise((res) => setTimeout(res, 120));
  }
  await saveDirty('minutes', minuteCache); await saveDirty('baseline', baseCache);
  const requests = budget.used;
  pub.intradayCoverage = {
    requestsThisRun: requests, epRequests: epBudget.used, maxRequests: MAX_REQ, epBudgetShare: EP_BUDGET_SHARE, baselineFreqs: BASELINE_FREQS, httpStatus,
    sample: 'DETERMINISTIC_HASH_ORDER_PREFIX (sha256 of TICKER|date; nothing outcome-related)',
    minuteCache: { start: startMinutes, end: Object.keys(minuteCache).length, emptyDays: Object.values(minuteCache).filter((v) => !v.k?.length).length },
    baselineCache: { start: startBase, end: Object.keys(baseCache).length },
    ep: { candidateDaysInIexHistory: epKeys.length, withMinutes: epKeys.filter((k) => k in minuteCache).length, withBaseline: epKeys.filter((k) => baseCache[k]?.mean > 0).length, baselineTooFewIexDays: epKeys.filter((k) => k in baseCache && !(baseCache[k].mean > 0)).length },
    ps: { candidateDaysInIexHistory: psKeys.length, withMinutes: psKeys.filter((k) => k in minuteCache).length },
    complete: epKeys.every((k) => k in minuteCache && k in baseCache) && psKeys.every((k) => k in minuteCache),
  };
  receipt.minuteCacheSha256 = sha(fetchOrder([...epKeys, ...psKeys]).filter((k) => k in minuteCache).map((k) => [k, minuteCache[k]]));
  receipt.baselineCacheSha256 = sha(fetchOrder(epKeys).filter((k) => k in baseCache).map((k) => [k, baseCache[k]]));
  log(`coverage: EP minutes ${pub.intradayCoverage.ep.withMinutes}/${epKeys.length}, baselines ${pub.intradayCoverage.ep.withBaseline}; PS minutes ${pub.intradayCoverage.ps.withMinutes}/${psKeys.length}; requests ${requests}`);

  // EP: engine variants
  dataset.kkIntraday = {
    minutes: (t, d) => { const c = minuteCache[`${t}|${d}`]; return c === undefined ? undefined : expandSession(c); },
    iexBaseline: (t, d) => baseCache[`${t}|${d}`]?.mean ?? null,
  };
  const sealed = { ep: {}, ps: {} };
  pub.ep = { label: KK_EP_ADAPTER.label, variants: {} };
  const prepCache = new Map();
  for (const v of EP_RUN_VARIANTS) {
    const key = KK_EP_ADAPTER.prepareKey(v.config);
    if (!prepCache.has(key)) prepCache.set(key, prepareAll(dataset, KK_EP_ADAPTER, v.config));
    const r = runResearchLifecycle(dataset, { adapter: KK_EP_ADAPTER, config: v.config, prepared: prepCache.get(key), from: L.WINDOW.from, to: L.WINDOW.to });
    if (!r.reconciliation.pass) throw new Error(`RECONCILIATION_FAILED:EP:${v.id}`);
    const tally = (f) => r.trades.reduce((o, t) => { bump(o, f(t)); return o; }, {});
    pub.ep.variants[v.id] = { changes: v.changes, trades: r.trades.length, closed: r.trades.filter((t) => t.status === 'CLOSED').length, openAtDataEnd: r.openAtEnd.length, exitReasons: tally((t) => t.exitReason), entryYears: tally((t) => t.entryDate.slice(0, 4)), notExecuted: r.counts.notExecutedResolved ?? {}, technicalOrdersArmed: r.counts.ordersArmed, notTriggered: r.counts.ordersNotTriggered, rejections: r.rejections.reduce((o, x) => { bump(o, x.reason); return o; }, {}), reconciliation: r.reconciliation.pass, ledgerSha256: sha(r.ledger), tradesSha256: sha(r.trades.map((t) => [t.id, t.entryDate, t.exitDate, t.exitReason, t.shares])) };
    sealed.ep[v.id] = { metrics: runMetricsSF5(r, { spyTR: dataset.spyTR }), trades: r.trades.map((t) => ({ id: t.id, entryDate: t.entryDate, entryFill: t.entryFill, initialStop: t.initialStop, exitDate: t.exitDate, exitReason: t.exitReason, realizedPnl: t.realizedPnl, intraday: t.intradayEvidence })) };
    log(`EP ${v.id}: trades ${r.trades.length}`);
  }
  // PS: trade-level short studies
  pub.ps = { label: 'CHART_PS_SHORT_MODEL_STUDY_TRADE_LEVEL_NO_BORROW_DATA_NOT_EXECUTABLE', variants: {} };
  for (const v of PS_RUN_VARIANTS) {
    const statuses = {}, exits = {}, years = {}, trades = [];
    for (const c of cand.ps) {
      const bars = sec.get(c.id).bars, pc = psChartCandidate(bars, c.i, v.config); if (!pc) continue;
      if (c.date < L.WINDOW.from || c.date > L.WINDOW.to) continue;
      const res = runPsCandidate({ bars, cand: pc, minutes: dataset.kkIntraday.minutes(c.ticker, c.date), cfg: v.config });
      bump(statuses, res.status);
      if (res.status === 'CLOSED') { trades.push({ id: c.id, ...res.trade }); bump(years, c.date.slice(0, 4)); for (const x of res.trade.exitReasons) bump(exits, x); }
    }
    const rs = trades.map((t) => t.netReturn).sort((a, b) => a - b), rm = trades.map((t) => t.rMultiple).filter(Number.isFinite);
    pub.ps.variants[v.id] = { changes: v.changes, statuses, closedTrades: trades.length, exitReasons: exits, entryYears: years, tradesSha256: sha(trades.map((t) => [t.id, t.entryDate, t.exitReasons])) };
    sealed.ps[v.id] = { metrics: { label: 'TRADE_LEVEL_SHORT_MODEL_STUDY_NO_BORROW_COST', trades: trades.length, meanNetReturn: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null, medianNetReturn: rs.length ? rs[Math.floor(rs.length / 2)] : null, hitRate: rs.length ? rs.filter((x) => x > 0).length / rs.length : null, meanR: rm.length ? rm.reduce((a, b) => a + b, 0) / rm.length : null }, trades };
    log(`PS ${v.id}: closed ${trades.length}`);
  }
  write(sealed);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
