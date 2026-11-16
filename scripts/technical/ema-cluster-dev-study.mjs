#!/usr/bin/env node
// Manual DEV research on an existing immutable snapshot. Raw data stays in runner.temp.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { run, pValue, walkForward, HORIZONS } from './ema-cluster-study.mjs';
import { openSnapshot, verifyAgainstManifest, CANONICAL_LOAD } from '../supertrader/snapshot/snapshot.mjs';
import { createSnapshotStore } from '../supertrader/snapshot/store.mjs';
import { loadPitData } from '../supertrader/validation/analyze-methods.mjs';
import { securityFromSegment, benchmarkFromPit } from '../supertrader/source-faithful/runner/snapshot-input.mjs';
import { flagDiscontinuities } from '../supertrader/source-faithful/integrity/discontinuity.mjs';
import { encryptForOwner, nonStockProduct } from '../supertrader/validation/lib.mjs';
import { restoreBaseline, verifyCompletion, archiveLedger } from './ema-cluster-completion.mjs';
import { archiveBytes } from './ema-cluster-archive.mjs';
import { sha256, canonicalJson } from '../supertrader/snapshot/contract.mjs';
const require = createRequire(import.meta.url);
const S = require('../../quant/engines/research-studies.cjs');
const V = require('../../quant/engines/research-validation.cjs');
const E = require('../../quant/engines/technical/ema-cluster.js');
const Industry = require('../../core/industry-classification.js');
const root = fileURLToPath(new URL('../..', import.meta.url));
export const PLAN = Object.freeze({ id: 'EMA_CLUSTER_DEV_200_V1', snapshotId: 'sts1-134d4d62eb88b6ff8d98fe6e56b12a6d',
  warmupFrom: '2015-01-01', from: '2016-01-04', to: '2026-09-30', active: 150, delisted: 50, minBars: 300,
  batchSize: 5, seed: 'VU_EMA_CLUSTER_DEV_200_V1', classification: 'SEC_SIC_DIVISION_AT_MIN_LIST_END_AND_DEV_END',
  selection: 'EQUAL_STRATUM_ROUND_ROBIN_SHA256_WITHOUT_REPLACEMENT', instrumentClasses: ['EQUITY_COMMON'], excludeKnownNonStockProducts: true,
  multipleTesting: 'HOLM_36_PRIMARY_RAW_SPY_EXCESS_TESTS_SECONDARY_GROUPS_DESCRIPTIVE',
  limitations: ['EXPLORATORY_CONDITIONAL_COHORT_NOT_MARKET_REPRESENTATIVE', 'SNAPSHOT_IDENTITY_NOT_AS_PUBLISHED_PIT',
    'MISSING_CIK_USES_LISTING_AS_ISSUER_PROXY', 'PRICE_RETURNS_NO_DIVIDENDS_BOTH_SIDES',
    'NO_TERMINAL_VALUE_IMPUTATION', 'DQ_K5_FLAGS_RETAINED_NO_REPAIR', 'NO_UNTOUCHED_HOLDOUT',
    'DIRECTION_ADJUSTED_BEARISH_EXCESS_IS_NOT_SHORT_EXECUTION', 'NO_LIQUIDITY_FILTER_OR_FUNDED_PORTFOLIO'] });
export function division(sic) {
  const n = Number(String(sic || '').slice(0, 2));
  if (!sic || !Number.isFinite(n)) return 'UNKNOWN';
  for (const [a, b, name] of [[1, 9, 'AGRICULTURE'], [10, 14, 'MINING'], [15, 17, 'CONSTRUCTION'],
    [20, 39, 'MANUFACTURING'], [40, 49, 'TRANSPORT_UTILITIES'], [50, 51, 'WHOLESALE'],
    [52, 59, 'RETAIL'], [60, 67, 'FINANCE_REAL_ESTATE'], [70, 89, 'SERVICES'], [91, 99, 'PUBLIC_ADMIN']]) if (n >= a && n <= b) return name;
  return 'UNKNOWN';
}
const rank = id => S.hash(PLAN.seed + '|' + PLAN.snapshotId + '|' + id);
// Metadata only. No returns, events, rankings by performance, or parameter evaluation.
export function selectSample(candidates) {
  const excluded = [], eligible = [];
  for (const c of candidates) {
    const reasons = [];
    if (!PLAN.instrumentClasses.includes(c.instrumentClass)) reasons.push('NOT_COMMON_EQUITY');
    if (c.nonStockReason) reasons.push('KNOWN_NON_STOCK_PRODUCT:' + c.nonStockReason);
    if (c.reusedLater) reasons.push('REUSED_LISTING_IDENTITY');
    if (c.bars < PLAN.minBars) reasons.push('INSUFFICIENT_BARS');
    if (!c.hasStudyBars) reasons.push('NO_DEV_OBSERVATIONS');
    if (!['ACTIVE', 'DELISTED'].includes(c.cohort)) reasons.push('STATUS_NOT_ESTABLISHED');
    if (reasons.length) excluded.push({ listingId: c.listingId, reasons }); else eligible.push({ ...c, rank: rank(c.listingId) });
  }
  eligible.sort((a, b) => a.rank.localeCompare(b.rank) || a.listingId.localeCompare(b.listingId));
  const seen = new Set(), unique = [];
  for (const c of eligible) {
    const key = c.cik ? 'CIK:' + Industry.normalizeCik(c.cik) : 'LISTING:' + c.listingId;
    if (seen.has(key)) excluded.push({ listingId: c.listingId, reasons: ['DUPLICATE_KNOWN_ISSUER'] });
    else { seen.add(key); unique.push(c); }
  }
  const selected = [];
  for (const [cohort, target] of [['ACTIVE', PLAN.active], ['DELISTED', PLAN.delisted]]) {
    const groups = new Map();
    for (const c of unique.filter(c => c.cohort === cohort)) {
      const g = c.industry || 'UNKNOWN'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(c);
    }
    const keys = [...groups.keys()].sort(); let n = 0;
    while (n < target) {
      let progressed = false;
      for (const key of keys) { const c = groups.get(key).shift(); if (c && n < target) { selected.push(c); n++; progressed = true; } }
      if (!progressed) break;
    }
  }
  excluded.sort((a, b) => a.listingId.localeCompare(b.listingId));
  const body = { plan: PLAN, candidates: candidates.length, eligible: unique.length, excluded,
    selected, counts: { active: selected.filter(c => c.cohort === 'ACTIVE').length, delisted: selected.filter(c => c.cohort === 'DELISTED').length,
      unknownIndustry: selected.filter(c => c.industry === 'UNKNOWN').length, missingCik: selected.filter(c => !c.cik).length } };
  return { ...body, selectionHash: S.hash(body) };
}
function stats(rows, field) {
  const r = rows.filter(x => x.state === 'OBSERVED' && Number.isFinite(x[field]));
  return { ...S.inference(r, field), positive: r.filter(x => x[field] > 0).length, negative: r.filter(x => x[field] < 0).length,
    neutral: r.filter(x => x[field] === 0).length };
}
export function aggregateCell(rows, calendar, asOf) {
  const group = (key, value) => {
    const r = rows.filter(x => x[key] === value);
    return { name: value, events: r.length, states: stateCounts(r), excessSpy: stats(r, 'benchmarkExcess'),
      directionAdjustedExcess: stats(r, 'directionAdjustedExcess'), net: stats(r, 'netReturn') };
  };
  const excessSpy = stats(rows, 'benchmarkExcess');
  return { events: rows.length, states: stateCounts(rows), net: stats(rows, 'netReturn'), excessSpy,
    directionAdjustedExcess: stats(rows, 'directionAdjustedExcess'), p: pValue(excessSpy), walkForward: walkForward(rows, calendar, asOf),
    cohorts: [...new Set(rows.map(r => r.cohort))].sort().map(x => group('cohort', x)),
    regimes: [...new Set(rows.map(r => r.regime))].sort().map(x => group('regime', x)),
    years: [...new Set(rows.map(r => r.year))].sort().map(x => group('year', x)),
    industries: [...new Set(rows.map(r => r.industry))].sort().map(x => group('industry', x)) };
}
function stateCounts(rows) { return rows.reduce((a, r) => (a[r.state] = (a[r.state] || 0) + 1, a), {}); }
function writeJson(file, obj) { fs.writeFileSync(file, JSON.stringify(obj), { mode: 0o600 }); }
function readIndustry(cik, date, cache) {
  if (!cik) return { industry: 'UNKNOWN', sic: null, status: 'NO_VERIFIED_CIK' };
  const shard = Industry.shardOf(cik);
  if (!cache.has(shard)) {
    const file = path.join(root, 'quant/data/sec/sic-history/issuers', shard + '.json.gz');
    cache.set(shard, fs.existsSync(file) ? Industry.create(JSON.parse(zlib.gunzipSync(fs.readFileSync(file)))) : null);
  }
  const c = cache.get(shard)?.getIndustryClassification(cik, date);
  return { industry: division(c?.sic), sic: c?.sic || null, status: c?.status || 'NO_SIC_SHARD', knownAt: c?.knownAt || null,
    note: 'OBSERVED_CLASSIFICATION_FOR_CONDITIONAL_SAMPLING_NOT_PIT_UNIVERSE' };
}
async function main() {
  const a = process.argv.slice(2), opt = k => a[a.indexOf(k) + 1];
  if (!a.includes('--out') || !a.includes('--reviewer-key')) throw new Error('OUT_AND_REVIEWER_KEY_REQUIRED');
  const out = path.resolve(opt('--out'));
  if (out === path.resolve(root) || out.startsWith(path.resolve(root) + path.sep)) throw new Error('PRIVATE_OUTPUT_OUTSIDE_REPOSITORY_REQUIRED');
  fs.mkdirSync(out, { recursive: true, mode: 0o700 });
  const pub = fs.readFileSync(opt('--reviewer-key'), 'utf8');
  const { createS3DriverFromEnv } = await import('../market/storage/s3-driver.mjs');
  const store = createSnapshotStore({ driver: createS3DriverFromEnv(process.env) });
  const completing = a.includes('--complete');
  const metadata = completing ? JSON.parse(process.env.EMA_ARCHIVE_METADATA || '{}') : null;
  const baseline = completing ? await restoreBaseline(store, metadata.baselineWrappedKey, process.env.V13_ARCHIVE_PRIVATE_KEY, out) : null;
  const ownerKey = fs.readFileSync(path.join(root, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  console.log(JSON.stringify({ phase: 'RESTORE_EXISTING_DEV_ONLY', snapshotId: PLAN.snapshotId, planHash: S.hash(PLAN) }));
  const opened = await openSnapshot({ store, snapshotId: PLAN.snapshotId, requireRestoreReceipt: true });
  const pit = await loadPitData({ LIMIT: opened.manifest.capture.limit || 0, ...CANONICAL_LOAD, io: opened.io });
  // Verify existing dataset fingerprint, without rerunning the old control backtest.
  const restored = verifyAgainstManifest(opened.manifest, pit, { replay: false });
  if (restored.datasetVerified !== 'EXACT') throw new Error('DEV_DATASET_NOT_EXACT');
  const replayDriver = await opened.io.createDriver();
  const secBuf = await replayDriver.get('v1/tiingo-delisted/daily/US/_validation/sec-pit-r12.json.gz');
  const sec = secBuf ? JSON.parse(zlib.gunzipSync(secBuf)) : {};
  const metaBuf = await replayDriver.get('v1/tiingo-delisted/daily/US/_validation/manifest.json.gz');
  const listingMeta = metaBuf ? JSON.parse(zlib.gunzipSync(metaBuf)).entries : {};
  const companyNames = JSON.parse(opened.io.readRepoFile('quant/data/market/security-master/company-names.json'));
  const companyByTicker = new Map((companyNames.rows || []).map(r => [r.ticker, r.companyName]));
  const byListing = new Map(pit.listings.map(l => [l.id, l])), byRoot = new Map(), cache = new Map();
  for (const seg of pit.segs) { const id = seg.id.split('#')[0]; if (!byRoot.has(id)) byRoot.set(id, []); byRoot.get(id).push(seg); }
  const candidates = completing ? [] : pit.members.map(m => {
    const l = m.l, segs = byRoot.get(l.id) || [], bars = segs.flatMap(s => s.raw).filter(b => b.date >= PLAN.warmupFrom && b.date <= PLAN.to);
    const cik = sec[l.id]?.cik || segs.find(s => s.fund?.cik)?.fund.cik || null;
    const cutoff = l.listEnd && l.listEnd < PLAN.to ? l.listEnd : PLAN.to;
    return { listingId: l.id, ticker: l.ticker, cik, instrumentClass: m.cls, reusedLater: l.reusedLater,
      nonStockReason: nonStockProduct({ ticker: l.ticker, exchange: l.exchange, name: m.from === 'STORE' ? companyByTicker.get(l.ticker) : listingMeta[l.id]?.name }),
      bars: bars.length, hasStudyBars: bars.some(b => b.date >= PLAN.from), cohort: l.active ? 'ACTIVE' : l.listEnd && l.listEnd <= PLAN.to ? 'DELISTED' : 'STATUS_UNCERTAIN',
      ...readIndustry(cik, cutoff, cache), startDate: l.startDate, endDate: l.endDate };
  });
  const selection = baseline ? baseline.selection : selectSample(candidates);
  if (baseline && S.hash(PLAN) !== baseline.planHash) throw new Error('REGISTERED_PLAN_CHANGED');
  // This immutable, sealed manifest is written BEFORE detecting even one EMA event.
  writeJson(path.join(out, 'selection.private.json'), selection);
  fs.writeFileSync(path.join(out, 'selection.reviewer.sealed.json'), encryptForOwner(pub, Buffer.from(JSON.stringify(selection))), { mode: 0o600 });
  fs.writeFileSync(path.join(out, 'selection.owner.sealed.json'), encryptForOwner(fs.readFileSync(path.join(root, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8'), Buffer.from(JSON.stringify(selection))), { mode: 0o600 });
  console.log(JSON.stringify({ phase: 'SELECTION_FIXED_BEFORE_OUTCOMES', selectionHash: selection.selectionHash, counts: selection.counts }));
  const calendar = benchmarkFromPit(pit).map(b => b.date).filter(d => d >= PLAN.warmupFrom && d <= PLAN.to);
  const benchmark = { id: 'SPY', currency: 'USD', returnBasis: 'PRICE_RETURN', bars: benchmarkFromPit(pit).filter(b => calendar.includes(b.date)).map(b => ({ date: b.date, close: b.close })) };
  const calendarSet = new Set(calendar), failures = [], dq = [], receipts = [], outcomesByListing = new Map(), prepared = new Map();
  const rowFiles = new Map();
  for (const type of E.EVENTS) for (const h of HORIZONS) {
    const key = type + '-' + h, file = path.join(out, key + '.private.jsonl'); rowFiles.set(key, file); fs.writeFileSync(file, '', { mode: 0o600 });
  }
  const selectedById = new Map(selection.selected.map(c => [c.listingId, c]));
  for (let first = 0; first < selection.selected.length; first += PLAN.batchSize) {
    const listings = [];
    for (const c of selection.selected.slice(first, first + PLAN.batchSize)) {
      const l = byListing.get(c.listingId);
      for (const seg of byRoot.get(c.listingId) || []) {
        try {
          const raw = seg.raw.filter(b => calendarSet.has(b.date)), s = securityFromSegment({ ...seg, raw });
          const bars = s.bars.map(b => ({ ...b, closeAt: b.date + 'T23:59:59.999Z' }));
          if (!bars.length) continue;
          if (bars.some(b => ![b.open, b.high, b.low, b.close].every(Number.isFinite) || b.low <= 0 || b.high < Math.max(b.open, b.close) || b.low > Math.min(b.open, b.close))) throw new Error('INVALID_CANONICAL_OHLC');
          dq.push({ listingId: c.listingId, segmentId: seg.id, flags: flagDiscontinuities(s.bars, 5).map(i => s.bars[i].date), endCause: seg.endCause });
          listings.push({ listingId: seg.id, issuerId: c.cik ? 'iss_cik_' + Industry.normalizeCik(c.cik) : c.listingId,
            sourceHash: S.hash(raw), identity: { mic: l.exchange === 'NASDAQ' ? 'XNAS' : l.exchange === 'NYSE' ? 'XNYS' : 'XASE',
              instrumentClass: 'COMMON_STOCK', primary: true, validFrom: l.startDate, ...(l.endDate ? { validTo: l.endDate } : {}),
              availableAt: l.startDate + 'T00:00:00Z', sourceHash: opened.manifest.universe.listingTableHash }, bars });
          prepared.set(c.listingId, (prepared.get(c.listingId) || 0) + bars.length);
        } catch (e) { failures.push({ listingId: c.listingId, segmentId: seg.id, reason: e.message }); }
      }
    }
    if (!listings.length) continue;
    const input = { schemaVersion: 'technical-event-study-input-1.0.0', asOf: PLAN.to, priceBasis: 'SPLIT_ADJUSTED_PRICE', returnBasis: 'PRICE_RETURN', currency: 'USD',
      sourceMode: 'HISTORICAL_SIMULATION', cohortMode: 'CONDITIONAL_CURRENT_CLASSIFICATION', calendar, benchmark, listings,
      population: { sourceHash: selection.selectionHash, definition: PLAN.id, limitations: PLAN.limitations } };
    const batch = run(input, { eventFrom: PLAN.from, deferWalkForward: completing, onCell({ eventType, horizonTradingDays, rows, regimeByDate }) {
      const packed = rows.map(r => { const id = r.listingId.split('#')[0], c = selectedById.get(id);
        const n = outcomesByListing.get(id) || { horizonObservations: 0, observed: 0 }; n.horizonObservations++; if (r.state === 'OBSERVED') n.observed++; outcomesByListing.set(id, n);
        return { ...r, cohort: c.cohort, industry: c.industry, regime: regimeByDate.get(r.signalDate) || 'UNKNOWN', year: r.signalDate.slice(0, 4) }; });
      fs.appendFileSync(rowFiles.get(eventType + '-' + horizonTradingDays), packed.map(r => JSON.stringify(r) + '\n').join(''));
    } });
    receipts.push({ first, inputHash: batch.inputHash, resultHash: batch.resultHash, codeHashes: batch.codeHashes, counts: batch.counts, engineResults: batch.engineResults,
      walkForward: batch.cells.map(c => ({ eventType: c.eventType, horizon: c.horizonTradingDays, ...c.walkForward })) });
    console.log(JSON.stringify({ phase: 'BATCH_COMPLETED', first, listings: listings.length, events: batch.counts.events, resultHash: batch.resultHash }));
  }
  const cells = [], ledger = [], timings = [];
  for (const type of E.EVENTS) for (const h of HORIZONS) {
    const text = fs.readFileSync(rowFiles.get(type + '-' + h), 'utf8');
    const rows = text.trim() ? text.trim().split('\n').map(s => JSON.parse(s)) : [];
    const started = performance.now();
    cells.push({ eventType: type, horizonTradingDays: h, ...aggregateCell(rows, calendar, PLAN.to) });
    timings.push({ eventType: type, horizonTradingDays: h, milliseconds: performance.now() - started });
    if (completing) ledger.push(await archiveLedger(store, ownerKey, text, type, h));
  }
  const holm = V.holm(cells.map(c => c.p ?? 1)); cells.forEach((c, i) => { c.holmP = c.p === null ? null : holm[i]; });
  const report = { schemaVersion: 'ema-cluster-dev-study-1.0.0', plan: PLAN, planHash: S.hash(PLAN), selection, restored: { snapshotId: PLAN.snapshotId,
    datasetVerified: restored.datasetVerified, datasetSha256: opened.manifest.dataset.segmentsSha256 }, config: E.configuration(), configHash: S.hash(E.configuration()),
    sourceHashes: { adapter: S.hash(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8')), sicIndex: S.hash(fs.readFileSync(path.join(root, 'quant/data/sec/sic-history/index.json'), 'utf8')) },
    selected: selection.selected.length, processedListings: [...prepared].map(([listingId, bars]) => ({ listingId, bars,
      ...(outcomesByListing.get(listingId) || { horizonObservations: 0, observed: 0 }) })),
    failures, dq, receipts, events: receipts.reduce((n, b) => n + b.counts.events, 0), cells,
    status: 'EXPLORATORY_RESEARCH_LIMITED', productionApproved: false, independentHoldout: false, rawDataPublished: false };
  if (completing) report.completion = { ...verifyCompletion(baseline, report), completedAt: new Date().toISOString(),
    sourceCommit: process.env.GITHUB_SHA || null, validationSourceHash: S.hash(fs.readFileSync(require.resolve('../../quant/engines/research-validation.cjs'), 'utf8')),
    ledger, timings };
  report.resultHash = S.hash(report);
  fs.writeFileSync(path.join(out, 'result.reviewer.sealed.json'), encryptForOwner(pub, Buffer.from(JSON.stringify(report))), { mode: 0o600 });
  fs.writeFileSync(path.join(out, 'result.owner.sealed.json'), encryptForOwner(fs.readFileSync(path.join(root, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8'), Buffer.from(JSON.stringify(report))), { mode: 0o600 });
  if (completing) {
    const bytes = fs.readFileSync(path.join(out, 'result.owner.sealed.json'));
    const object = await archiveBytes(store, bytes, sha256(bytes));
    const receipt = { role: 'EMA_WALK_FORWARD_COMPLETION', snapshotId: PLAN.snapshotId, sourceCommit: process.env.GITHUB_SHA,
      runId: process.env.GITHUB_RUN_ID, job: 'portfolio', at: new Date().toISOString(), baselineResultHash: baseline.resultHash,
      selectionHash: selection.selectionHash, resultHash: report.resultHash, object, completedCells: report.completion.completedCells,
      newlyCompletedCells: report.completion.newlyCompletedCells, primaryResultsUnchanged: true, ledgerObjects: ledger.map(r => r.sha256) };
    await store.putReceipt(PLAN.snapshotId, receipt);
    if (!(await store.listReceipts(PLAN.snapshotId)).some(r => canonicalJson(r) === canonicalJson(receipt))) throw new Error('COMPLETION_RECEIPT_RESTORE_MISMATCH');
    writeJson(path.join(out, 'completion.public.json'), receipt);
  }
  // Only encrypted results and non-performance hashes/counts may leave the temporary workspace.
  const upload = path.join(out, 'upload'); fs.mkdirSync(upload, { mode: 0o700 });
  for (const name of ['selection.reviewer.sealed.json', 'result.reviewer.sealed.json', 'selection.owner.sealed.json', 'result.owner.sealed.json']) fs.copyFileSync(path.join(out, name), path.join(upload, name));
  if (completing) fs.copyFileSync(path.join(out, 'completion.public.json'), path.join(upload, 'completion.public.json'));
  writeJson(path.join(upload, 'receipt.public.json'), { planId: PLAN.id, snapshotId: PLAN.snapshotId, selected: report.selected,
    processedListings: report.processedListings.length, events: report.events, failures: failures.length, selectionHash: selection.selectionHash,
    resultHash: report.resultHash, configHash: report.configHash, rawDataPublished: false });
  console.log(JSON.stringify({ phase: 'COMPLETE_ENCRYPTED', selected: report.selected, processedListings: report.processedListings.length, resultHash: report.resultHash }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exitCode = 1; });
