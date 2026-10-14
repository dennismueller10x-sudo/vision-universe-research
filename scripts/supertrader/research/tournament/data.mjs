// Private research inputs. No CLI, logging, strategy rules, price refresh or writes.
// Public PIT listing/classification primitives and existing R2 stores are reused;
// corporate action nulls survive the research adapter (ADR-001/002).
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import * as Listing from '../../validation/lib.mjs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const Identity = require(path.join(root, 'core/identity.js'));
const ReturnSeries = require(path.join(root, 'quant/engines/return-series.js'));
const TotalReturn = require(path.join(root, 'quant/engines/canonical-total-return.js'));
export const DATA_VERSION = 'supertrader-tournament-data-1.0.0';
export const DATA_WINDOW = Object.freeze({ warmupFrom: '2015-01-01', from: '2016-01-04', to: '2026-09-30' });
const REQUIRED_ENV = ['VU_HISTORY_S3_ENDPOINT', 'VU_HISTORY_S3_BUCKET', 'VU_HISTORY_S3_ACCESS_KEY_ID', 'VU_HISTORY_S3_SECRET_ACCESS_KEY'];
const INCLUDED = new Set(['EQUITY_COMMON', 'ADR', 'REIT']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const validDate = (d) => typeof d === 'string' && DATE.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;
const assertDate = (d) => { if (!validDate(d)) throw new Error('INVALID_DATE'); };
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const unavailable = (reason) => ({ version: DATA_VERSION, state: 'BLOCKED', reason, securities: [], segs: [], calendar: [], scanner: [] });
// Errors may contain private object identifiers or provider response details.
// Only the sealed research runner explicitly reads this non-enumerable field;
// ordinary JSON serialization keeps the public BLOCKED result free of details.
function unavailableWithPrivateDiagnostic(reason, error, phase) {
  const blocked = unavailable(reason);
  Object.defineProperty(blocked, 'privateDiagnostics', { enumerable: false, value: {
    schema: 'supertrader-private-data-diagnostic-1.0.0', visibility: 'SEALED_ONLY', phase,
    errorName: typeof error?.name === 'string' ? error.name : 'UnknownError',
    message: typeof error?.message === 'string' ? error.message : String(error),
    stack: typeof error?.stack === 'string' ? error.stack : null,
    code: typeof error?.code === 'string' || typeof error?.code === 'number' ? error.code : null
  } });
  return blocked;
}
export function privateDataConfigured(env = process.env) { return REQUIRED_ENV.every((k) => Boolean(env[k])); }

async function mapEight(items, fn) {
  const out = new Array(items.length); let cursor = 0;
  async function worker() { while (cursor < items.length) { const i = cursor++; out[i] = await fn(items[i], i); } }
  await Promise.all(Array.from({ length: Math.min(8, items.length) }, worker));
  return out;
}
function selectedWindow(options = {}) {
  const window = Object.fromEntries(['warmupFrom', 'from', 'to'].map((k) => [k, options[k] || DATA_WINDOW[k]]));
  Object.values(window).forEach(assertDate);
  if (window.warmupFrom > window.from || window.from > window.to) throw new Error('INVALID_WINDOW');
  return window;
}

// Keep raw fields and original ordering. Undefined action fields become explicit
// nulls so a downstream default can never masquerade as observed zero/one.
export function preserveRawBars(bars, window = DATA_WINDOW) {
  return (bars || []).filter((b) => b.date >= window.warmupFrom && b.date <= window.to).map((b) => ({ ...b,
    dividend: b.dividend === undefined ? null : b.dividend,
    splitFactor: b.splitFactor === undefined ? null : b.splitFactor,
    adjustedClose: b.adjustedClose ?? b.adjClose ?? null }));
}

// Supported-source classification permits some strings the canonical identity
// contract deliberately rejects (for example the official historical -P-HIZ
// row). Reject those source rows before listing construction or series reads;
// preserve the source spelling rather than inventing a normalized alias.
function admissibleSourceRows(rows) {
  const accepted = [], rejected = {}; let supportedRows = 0;
  for (const r of rows) {
    if (r.assetType !== 'Stock' || r.priceCurrency !== 'USD' || !Listing.EXCHANGES.has(r.exchange) || !r.startDate) { accepted.push(r); continue; }
    supportedRows++;
    const reason = !Identity.normalizeTicker(r.ticker) ? 'SOURCE_TICKER_UNSUPPORTED'
      : !validDate(r.startDate) ? 'SOURCE_START_DATE_INVALID'
      : r.endDate && !validDate(r.endDate) ? 'SOURCE_END_DATE_INVALID'
      : r.endDate && r.endDate < r.startDate ? 'SOURCE_DATE_RANGE_INVALID' : null;
    if (reason) rejected[reason] = (rejected[reason] || 0) + 1;
    else accepted.push(r);
  }
  return { accepted, rejected, supportedRows };
}

// The injected dependency contract is private/test only. Production reuses the
// configured S3 driver, the history-store codec and zero-cost guard; no writes.
export async function loadRawHistoricalPayload(options = {}, diagnosticContext = {}) {
  return loadRawHistoricalInput(options, diagnosticContext);
}

// The callback is internal, never a trusted/pre-canonicalized payload flag.
// Every production segment goes through the same identity and canonical engine
// as prepareHistoricalData before its decoded source object can be released.
async function loadRawHistoricalInput(options, diagnosticContext, consumeSegment = null) {
  diagnosticContext.phase = 'WINDOW_VALIDATION';
  const window = selectedWindow(options), deps = options.rawDataDeps || {};
  if (window.warmupFrom < DATA_WINDOW.warmupFrom || window.to > DATA_WINDOW.to || Listing.WINDOW_NAME !== 'DEV') throw new Error('WINDOW_NOT_SUPPORTED');
  const read = deps.readJson || (async (p) => JSON.parse(await fs.readFile(path.join(options.root || root, p), 'utf8')));
  diagnosticContext.phase = 'PUBLIC_UNIVERSE_METADATA';
  const [universe, eligibility, companies] = await Promise.all([
    deps.universe || read('quant/data/market/scale/universe-FULL_UNIVERSE.json'),
    deps.eligibility || read('quant/data/market/security-master/eligibility.json'),
    deps.companies || read('quant/data/market/security-master/company-names.json')]);
  let rows = deps.listingRows;
  if (!rows) {
    diagnosticContext.phase = 'SUPPORTED_TICKER_LIST';
    const key = process.env.TIINGO_API_KEY;
    const response = await fetch(Listing.LIST_URL, { headers: key ? { Authorization: 'Token ' + key } : {} });
    if (!response.ok) throw new Error('LISTING_SOURCE_UNAVAILABLE');
    rows = Listing.parseTickerCsv(Listing.unzipCsv(Buffer.from(await response.arrayBuffer())));
  }
  diagnosticContext.phase = 'LISTING_BUILD';
  const sourceRows = admissibleSourceRows(rows);
  rows = sourceRows.accepted;
  const cls = new Map(eligibility.decisions.map((d) => [d.ticker, d.instrument_type]));
  const storeActive = new Map(universe.securities.filter((s) => s.active !== false).map((s) => [s.ticker, { startDate: s.startDate, instrumentType: cls.get(s.ticker) || null }]));
  const listings = Listing.buildListingTable(rows, storeActive, { today: deps.today || new Date().toISOString().slice(0, 10) }).filter((l) => l.startDate <= window.to && (!l.listEnd || l.listEnd >= window.warmupFrom));
  const companyOf = new Map((companies.rows || []).map((r) => [r.ticker, r]));
  const Master = require(path.join(root, 'quant/engines/us-security-master.js'));
  const listedRoots = Master.collectListedRoots(rows);
  let mainStore = deps.mainStore, pitStore = deps.pitStore, readPrivate = deps.readPrivate;
  if (!mainStore || !pitStore || !readPrivate) {
    diagnosticContext.phase = 'R2_SETUP';
    const { createS3DriverFromEnv } = await import('../../../market/storage/s3-driver.mjs');
    const Store = require(path.join(root, 'quant/engines/history-store.js'));
    const Guard = require(path.join(root, 'quant/engines/zero-cost-guard.js'));
    const driver = createS3DriverFromEnv(process.env), budget = Guard.createBudget({ classAOperations: 0, classBOperations: 30000 });
    mainStore = Store.createHistoryStore({ driver, provider: 'tiingo', market: 'US', budget });
    pitStore = Store.createHistoryStore({ driver, provider: 'tiingo-delisted', market: 'US', budget });
    diagnosticContext.phase = 'R2_USAGE_GUARD';
    const [u, v] = await Promise.all([mainStore.readUsage(), pitStore.readUsage()]);
    const usage = Guard.applyUsage(u, { classAOperations: v.classAOperations, classBOperations: v.classBOperations });
    if (Guard.evaluate({ usage, estimate: Guard.estimateOperations({ kind: 'VALIDATION_ANALYZE', objectReads: listings.length + 5 }), operation: 'VALIDATION_ANALYZE' }).verdict !== Guard.ALLOWED) throw new Error('ZERO_COST_GUARD_BLOCKED');
    readPrivate = async (key) => { budget.consumeClassB(1, 'GET PRIVATE_RESEARCH_INPUT'); const buf = await driver.get(pitStore.seriesPrefix + key); if (!buf) return null; budget.noteDownload(buf.length); return JSON.parse(zlib.gunzipSync(buf).toString('utf8')); };
  }
  diagnosticContext.phase = 'R2_MANIFEST';
  const manifest = (await readPrivate('_validation/manifest.json.gz'))?.entries || {};
  diagnosticContext.phase = 'R2_SEC_AND_BENCHMARK';
  const [pit, delist, spySeries] = await Promise.all([
    options.secPit === false ? {} : readPrivate(options.secPitKey || '_validation/sec-pit-r13.json.gz'),
    options.delistPit === false ? {} : readPrivate('_validation/sec-delist-r13.json.gz'),
    pitStore.getSeries('SPY@1993-01-29')]);
  const spyRaw = preserveRawBars(spySeries?.bars, window), master = new Set(spyRaw.map((b) => b.date));
  diagnosticContext.phase = 'MEMBER_CLASSIFICATION';
  const members = [], excluded = { ...sourceRows.rejected };
  for (const l of listings) {
    const e = manifest[l.id]; let c;
    if (l.source === 'STORE_ACTIVE') c = { included: INCLUDED.has(l.storeClass), cls: l.storeClass };
    else if (e && ['OK', 'PARTIAL'].includes(e.status)) c = l.source === 'UNFETCHABLE_REUSED' ? { included: e.included, cls: e.cls || null } : Listing.classifyListing(Master, l, e.name, listedRoots);
    if (!c?.included || !INCLUDED.has(c.cls)) { excluded.CLASS_OR_HISTORY_UNAVAILABLE = (excluded.CLASS_OR_HISTORY_UNAVAILABLE || 0) + 1; continue; }
    const name = e?.name || companyOf.get(l.ticker)?.companyName;
    if (Listing.nonStockProduct({ ticker: l.ticker, exchange: l.exchange, name })) { excluded.NON_STOCK_PRODUCT = (excluded.NON_STOCK_PRODUCT || 0) + 1; continue; }
    members.push({ listing: l, cls: c.cls, source: l.source === 'STORE_ACTIVE' ? 'MAIN' : 'PIT' });
  }
  const selected = options.limit ? members.slice(0, options.limit) : members;
  diagnosticContext.phase = 'R2_SERIES';
  let offCalendar = 0;
  const perMember = await mapEight(selected, async (m) => {
    const series = await (m.source === 'MAIN' ? mainStore.getSeries(m.listing.ticker) : pitStore.getSeries(`${m.listing.ticker}@${m.listing.startDate}`));
    const l = m.listing;
    const raw = preserveRawBars(series?.bars, window).filter((b) => b.date >= l.startDate && (!l.listEnd || b.date <= l.listEnd) && (master.has(b.date) || (offCalendar++, false)));
    const segments = Listing.splitSegments(raw);
    const output = [];
    segments.forEach((part, i) => {
      if (part.length < 2) return;
      const f = pit?.[l.id], d = delist?.[l.id];
      const gapTerminal = i < segments.length - 1;
      const seg = { id: i ? `${l.id}#${i}` : l.id, raw: part, cls: m.cls, delisted: !l.active && !gapTerminal,
        survivor: m.source === 'MAIN', fund: f ? { eps: f.eps, rev: f.rev, shares: f.shares, cik: f.cik, taxonomy: f.taxonomy || null } : undefined,
        ...(d ? { delistClass: d.cls, delistEvidence: d.evidence } : {}),
        ...(gapTerminal ? { inputQuarantine: { from: segments[i + 1][0].date, lastValidDate: part.at(-1).date, reason: 'LISTING_DATA_GAP', confidence: 'LOW' } } : {}) };
      output.push(consumeSegment ? consumeSegment(seg, listings) : seg);
    });
    return output;
  });
  diagnosticContext.phase = 'SEGMENT_BUILD';
  return { listings, members, ...(consumeSegment ? { normalizedSegments: perMember.flat() } : { segs: perMember.flat() }), spyRaw, calendar: spyRaw.map((b) => b.date).filter((d) => d >= window.from), sourceWindow: window,
    loaderCoverage: { objectReadConcurrency: 8, members: members.length, loadedMembers: selected.length, offCalendar, excluded,
      sourceIdentity: { supportedRows: sourceRows.supportedRows, rejectedRows: Object.values(sourceRows.rejected).reduce((a, b) => a + b, 0), reasons: sourceRows.rejected },
      secPitAvailable: Boolean(pit), delistAvailable: Boolean(delist) } };
}

// Incoming IDs are inherited from the existing listing table, never made from
// ticker alone. A segment suffix separates genuine >30-day series breaks.
function listingFor(seg, listings) {
  const baseId = String(seg.id || '').split('#')[0];
  const l = listings.get(baseId);
  if (!l || l.id !== baseId || !validDate(l.startDate) || !Identity.normalizeTicker(l.ticker)) throw new Error('LISTING_IDENTITY_UNAVAILABLE');
  if (baseId !== `tiingo:${l.exchange}:${l.ticker}:${l.startDate}`) throw new Error('LISTING_IDENTITY_CONFLICT');
  const endDate = l.listEnd || l.endDate || null;
  if (endDate !== null) assertDate(endDate);
  return { ...l, endDate, securityId: Identity.securityIdForTicker(l.ticker) };
}

// SEC private tuples are [periodEnd, value, firstFiled, derived/source?].
// Filing-day facts become visible the following day: legacy contract filed<asOf.
// No balance sheet/quality metric is synthesized from EPS/revenue/shares.
export function fundamentalRows(fund) {
  const out = [];
  for (const [key, field, frequency] of [['eps', 'eps', 'QUARTERLY'], ['revenue', 'rev', 'QUARTERLY'], ['shares_outstanding', 'shares', 'POINT_IN_TIME']]) {
    for (const r of fund?.[field] || []) {
      if (!Array.isArray(r) || !validDate(r[0]) || !validDate(r[2]) || r[0] > r[2] || !finite(r[1])) continue;
      out.push({ key, value: r[1], periodEnd: r[0], availableAt: r[2], frequency,
        source: 'SEC_EDGAR_FIRST_FILING', basis: field === 'shares' ? (r[3] || 'UNSPECIFIED_SHARES_CONCEPT') : 'REPORTED_OR_LEGACY_DERIVATION',
        historicalPITReady: true });
    }
  }
  return out.sort((a, b) => a.availableAt.localeCompare(b.availableAt) || a.periodEnd.localeCompare(b.periodEnd) || a.key.localeCompare(b.key));
}

function firstCanonicalFailure(raw, reconstruct) {
  const checkpoints = new Set([1]); let drift = 0;
  const cfg = TotalReturn.CONFIG;
  for (let i = 0; i < raw.length; i++) {
    const b = raw[i], prev = raw[i - 1];
    if (!finite(b.dividend) || !finite(b.splitFactor) || b.dividend !== 0 || b.splitFactor !== 1) checkpoints.add(Math.max(1, i));
    if (!prev) continue;
    if ((Date.parse(b.date) - Date.parse(prev.date)) / 864e5 > 7 || Math.abs(b.close / prev.close - 1) >= cfg.suspectedSplitMove) checkpoints.add(i);
    if (b.adjustedClose > 0 && prev.adjustedClose > 0 && b.dividend === 0 && b.splitFactor === 1) {
      const mObs = (prev.adjustedClose / prev.close) / (b.adjustedClose / b.close), step = 1 - mObs;
      if (Math.abs(step) > cfg.factorNoise) checkpoints.add(i);
      else {
        drift += Math.log(mObs);
        if (drift < Math.log(1 - cfg.maxUnexplainedDrift)) checkpoints.add(i);
      }
    }
  }
  // Checkpoints include every local event/gap/action-field failure and each
  // cross-check blocking transition. A future dividend is never allowed to
  // retroactively cure a prefix rejection through the core's date-shift window.
  for (const i of [...checkpoints].sort((a, b) => a - b)) {
    if (i >= raw.length) continue;
    const result = reconstruct(raw.slice(0, i + 1));
    if (!result.reconstructed) {
      const at = result.date ? raw.findIndex((b) => b.date === result.date) : i;
      return { index: at >= 0 ? Math.min(at, i) : i, observedAt: raw[i].date, reason: result.reason };
    }
  }
  const full = reconstruct(raw);
  if (full.reconstructed) return { result: full };
  // Unknown/global core failures need chronological prefix validation. No binary
  // search: DATE_SHIFT and provider-coverage availability are not monotone.
  for (let i = 1; i < raw.length; i++) {
    const result = reconstruct(raw.slice(0, i + 1));
    if (!result.reconstructed) return { index: i, observedAt: raw[i].date, reason: result.reason };
  }
  return { index: raw.length - 1, observedAt: raw.at(-1).date, reason: full.reason };
}

function normalizeSegment(seg, listing, window, retainRaw = true) {
  // Validate order BEFORE slicing; never silently repair mixed source histories.
  const original = seg.raw || [];
  for (let i = 0; i < original.length; i++) {
    const b = original[i]; assertDate(b.date);
    if (i && b.date <= original[i - 1].date) throw new Error('BARS_NOT_ORDERED');
  }
  let raw = original.filter((b) => b.date >= listing.startDate && (!listing.endDate || b.date <= listing.endDate) && b.date >= window.warmupFrom && b.date <= window.to)
    .map((b) => ({ ...b, adjustedClose: b.adjustedClose ?? b.adjClose ?? null }));
  if (raw.length < 2) return { rejection: 'INSUFFICIENT_BARS' };
  let quarantine = seg.inputQuarantine || null;
  const badOhlc = raw.findIndex((b) => !['open', 'high', 'low', 'close'].every((k) => finite(b[k]) && b[k] > 0) || !finite(b.volume) || b.volume < 0 || b.high < Math.max(b.open, b.close, b.low) || b.low > Math.min(b.open, b.close, b.high));
  if (badOhlc >= 0) {
    quarantine = { from: raw[badOhlc].date, observedAt: raw[badOhlc].date, reason: 'OHLCV_INVALID', confidence: 'LOW' };
    raw = raw.slice(0, badOhlc);
  }
  if (raw.length < 2) return { rejection: quarantine?.reason || 'INSUFFICIENT_BARS' };
  const reconstruct = (r) => TotalReturn.reconstruct(r, { identity: { state: 'CONFIRMED', listingId: listing.id, basis: 'EXISTING_LISTING_TABLE_AND_DATE_WINDOW' }, delisted: Boolean(seg.delisted) });
  const validity = firstCanonicalFailure(raw, reconstruct);
  if (validity.index !== undefined) {
    const badDate = raw[validity.index].date;
    quarantine = { from: badDate, observedAt: validity.observedAt, reason: validity.reason, confidence: 'LOW' };
    raw = raw.slice(0, validity.index);
  }
  if (raw.length < 2) return { rejection: quarantine?.reason || 'INSUFFICIENT_BARS' };
  const tr = validity.result || reconstruct(raw);
  if (!tr.reconstructed) return { rejection: tr.reason, ...(typeof tr.detail === 'string' ? { rejectionDetail: tr.detail } : {}) };
  const factors = ReturnSeries.splitFactors(raw);
  const bars = raw.map((b, i) => ({ date: b.date, open: b.open / factors[i], high: b.high / factors[i], low: b.low / factors[i], close: b.close / factors[i], volume: b.volume * factors[i],
    rawOpen: b.open, rawHigh: b.high, rawLow: b.low, rawClose: b.close, rawVolume: b.volume,
    dividend: b.dividend / factors[i], splitFactor: b.splitFactor, totalReturnIndex: tr.tr[i], splitAdjustmentFactor: factors[i] }));
  if (quarantine) quarantine = { ...quarantine, lastValidDate: bars.at(-1).date };
  const terminal = quarantine ? { date: quarantine.from, observedAt: quarantine.observedAt || quarantine.from, lastKnownDate: bars.at(-1).date, lastClose: bars.at(-1).close, kind: 'DATA_QUARANTINE', confidence: 'LOW', proceedsKnown: false }
    : seg.delisted ? { date: bars.at(-1).date, lastClose: bars.at(-1).close, kind: 'DELISTED', delistClass: seg.delistClass || 'UNKNOWN', proceedsKnown: false, evidence: seg.delistEvidence || null } : null;
  return { security: { id: seg.id, ticker: listing.ticker, securityId: listing.securityId, bars, listing: { id: listing.id, startDate: listing.startDate, endDate: listing.endDate, active: listing.active === true, reusedLater: listing.reusedLater === true, instrumentType: seg.cls || listing.storeClass || null },
    terminal, dataQuarantine: quarantine, fundamentals: fundamentalRows(seg.fund), fundamentalsMissing: ['historical_balance_sheet', 'historical_margins', 'historical_cash_flow', 'analyst_estimates', 'analyst_revisions'],
    ...(retainRaw ? { raw } : {}), canonicalValidity: quarantine ? 'VALID_PREFIX_QUARANTINED_FUTURE' : 'VALID',
    corporateActionContract: tr.corporateActionContract, returnContract: tr.contract, returnState: tr.state }, ...(retainRaw ? { raw } : {}) };
}

function canonicalAccumulator(window, retainRaw = true) {
  const listings = new Map(), seen = new Set();
  let initialized = false;
  return (seg, sourceListings) => {
    if (!initialized) {
      for (const l of sourceListings) { if (listings.has(l.id)) throw new Error('DUPLICATE_LISTING_ID'); listings.set(l.id, l); }
      initialized = true;
    }
    if (seen.has(seg.id)) throw new Error('DUPLICATE_SEGMENT_ID'); seen.add(seg.id);
    const l = listingFor(seg, listings);
    if (!INCLUDED.has(seg.cls || l.storeClass)) return { rejection: 'NON_EQUITY_OR_UNKNOWN_CLASS' };
    const result = normalizeSegment(seg, l, window, retainRaw);
    return retainRaw && result.security ? { ...result, seg: { ...seg, raw: result.raw, bars: result.security.bars, fundamentals: result.security.fundamentals, listing: result.security.listing } } : result;
  };
}

function collectNormalized(results) {
  const securities = [], segs = [], rejected = {}, rejectionDetails = {};
  for (const result of results) {
    if (result.rejection) { rejected[result.rejection] = (rejected[result.rejection] || 0) + 1; if(result.rejectionDetail){const byDetail=rejectionDetails[result.rejection]??={};byDetail[result.rejectionDetail]=(byDetail[result.rejectionDetail]||0)+1;} continue; }
    securities.push(result.security);
    if (result.seg) segs.push(result.seg);
  }
  return { securities, segs, rejected, rejectionDetails, inputSegments: results.length };
}

export function prepareHistoricalData(payload, options = {}) {
  const window = selectedWindow(options);
  if (payload.sourceWindow && ['warmupFrom', 'from', 'to'].some((k) => payload.sourceWindow[k] !== window[k])) throw new Error('SOURCE_WINDOW_MISMATCH');
  // Validate listing-table conflicts even when there are no input segments.
  const listingIds = new Set();
  for (const l of payload.listings || []) { if (listingIds.has(l.id)) throw new Error('DUPLICATE_LISTING_ID'); listingIds.add(l.id); }
  const consume = canonicalAccumulator(window);
  return completePreparedData(payload, window, collectNormalized((payload.segs || []).map((seg) => consume(seg, payload.listings || []))));
}

function completePreparedData(payload, window, { securities, segs, rejected, rejectionDetails = {}, inputSegments }, compact = false) {
  const spyRaw = (payload.spyRaw || []).filter((b) => b.date >= window.warmupFrom && b.date <= window.to);
  const benchmark = spyRaw.length >= 2 ? normalizeSegment({ id: 'BENCHMARK', raw: spyRaw, delisted: false }, { id: 'tiingo:NYSE:SPY:1993-01-29', ticker: 'SPY', securityId: Identity.securityIdForTicker('SPY'), startDate: '1993-01-29', endDate: null, active: true }, window, !compact).security : null;
  const calendar = (payload.calendar || []).filter((d) => d >= window.from && d <= window.to);
  for (let i = 0; i < calendar.length; i++) { assertDate(calendar[i]); if (i && calendar[i] <= calendar[i - 1]) throw new Error('CALENDAR_NOT_ORDERED'); }
  const spyBars = benchmark?.bars || [];
  return { version: DATA_VERSION, state: securities.length ? 'AVAILABLE' : 'BLOCKED', reason: securities.length ? null : 'NO_USABLE_SECURITIES', universeId: 'US_PIT_2016_A', window,
    securities, segs, calendar, ...(compact ? {} : { spyRaw }), benchmark, spyBars, spyAdj: { date: spyBars.map((b) => b.date), open: spyBars.map((b) => b.open), high: spyBars.map((b) => b.high), low: spyBars.map((b) => b.low), close: spyBars.map((b) => b.close), volume: spyBars.map((b) => b.volume) },
    spyTR: spyBars.filter((b) => b.date >= window.from).map((b) => ({ date: b.date, value: b.totalReturnIndex })),
    fingerprint: fingerprintData(payload.listings, securities, spyRaw, calendar),
    coverage: { inputSegments, usableSegments: securities.length, rejected, rejectionDetails, withFundamentals: securities.filter((s) => s.fundamentals.length).length, benchmarkAvailable: Boolean(benchmark) && !benchmark?.dataQuarantine, quarantined: securities.filter((s) => s.dataQuarantine).length, loader: payload.loaderCoverage || null,
      canonicalContractHash: hash({ totalReturn: TotalReturn.contractVersions(), config: TotalReturn.CONFIG, split: ReturnSeries.ENGINE_VERSION }) },
    limitations: ['DELISTING_PROCEEDS_ASSUMED_NOT_OBSERVED', 'REUSED_TICKER_HISTORY_INCOMPLETE', 'PIT_QUALITY_DATA_MISSING', ...(securities.some((s) => s.dataQuarantine) ? ['DATA_QUARANTINE_SCENARIO_UNCERTAINTY'] : [])] };
}

function fingerprintData(listings, securities, spyRaw, calendar) {
  const h = crypto.createHash('sha256');
  h.update(JSON.stringify({ listings, spyRaw, calendar }));
  for (const s of securities) h.update(hash({ id: s.id, listing: s.listing, bars: s.bars, fundamentals: s.fundamentals, terminal: s.terminal, dataQuarantine: s.dataQuarantine }));
  return h.digest('hex');
}

export async function loadHistoricalData(options = {}) {
  if (!options.loadPitDataFn && !options.rawDataDeps && !privateDataConfigured()) return unavailable('PRIVATE_DATA_NOT_CONFIGURED');
  if (!options.loadPitDataFn && process.env.ST_WINDOW === 'HOLDOUT') return unavailable('WINDOW_NOT_SUPPORTED');
  const diagnosticContext = { phase: options.loadPitDataFn ? 'INJECTED_PIT_LOADER' : 'RAW_HISTORICAL_LOADER' };
  try {
    if (!options.loadPitDataFn) {
      const window = selectedWindow(options), consume = canonicalAccumulator(window, false);
      const payload = await loadRawHistoricalInput(options, diagnosticContext, (seg, listings) => {
        diagnosticContext.phase = 'CANONICAL_NORMALIZATION';
        return consume(seg, listings);
      });
      return completePreparedData(payload, window, collectNormalized(payload.normalizedSegments), true);
    }
    const payload = await options.loadPitDataFn({ LIMIT: options.limit || 0, cross: false, log: () => {} });
    diagnosticContext.phase = 'CANONICAL_NORMALIZATION';
    return prepareHistoricalData(payload, options);
  } catch (error) { return unavailableWithPrivateDiagnostic('HISTORICAL_DATA_LOAD_FAILED', error, diagnosticContext.phase); }
}

// Rebase each historical view to its then-current split basis. Future splits
// must not change absolute price/liquidity filters in an earlier decision.
export function featuresAtDate(security, asOf) {
  assertDate(asOf);
  const visible = security.bars.filter((b) => b.date <= asOf);
  const factor = visible.at(-1)?.splitAdjustmentFactor || 1;
  const trAnchor = visible[0]?.totalReturnIndex || 1;
  const bars = visible.map((b) => ({ ...b, open: b.open * factor, high: b.high * factor, low: b.low * factor, close: b.close * factor, volume: b.volume / factor, dividend: b.dividend * factor,
    totalReturnIndex: b.totalReturnIndex / trAnchor }));
  const visibleQuarantine = security.dataQuarantine && security.dataQuarantine.from <= asOf ? security.dataQuarantine : null;
  const visibleTerminal = security.terminal && security.terminal.date <= asOf ? security.terminal : null;
  return { ...security, bars, raw: security.raw?.filter((b) => b.date <= asOf), dataQuarantine: visibleQuarantine, terminal: visibleTerminal,
    canonicalValidity: visibleQuarantine ? 'QUARANTINED' : 'VALID', fundamentals: security.fundamentals.filter((f) => f.availableAt < asOf), asOf };
}
export function scannerInputs(data, asOf) {
  assertDate(asOf);
  return data.securities.filter((s) => (!s.terminal || (s.terminal.kind === 'DATA_QUARANTINE' && s.terminal.date > asOf)) && s.listing.active && !s.listing.reusedLater && s.listing.startDate <= asOf && (!s.listing.endDate || s.listing.endDate >= asOf)).map((s) => featuresAtDate(s, asOf)).filter((s) => s.bars.length);
}

// Current scanner uses existing daily history objects; no Tiingo refresh.
// `listings`, `getSeries` and `readJson` permit hermetic tests/private exports.
export async function loadCurrentScannerInputs(options = {}) {
  const asOf = options.asOf || new Date().toISOString().slice(0, 10); assertDate(asOf);
  if (!options.getSeries && !privateDataConfigured()) return unavailable('PRIVATE_DATA_NOT_CONFIGURED');
  const read = options.readJson || (async (p) => JSON.parse(await fs.readFile(path.join(options.root || root, p), 'utf8')));
  try {
    const universe = options.listings ? { securities: options.listings } : await read('quant/data/market/scale/universe-FULL_UNIVERSE.json');
    const eligibility = options.eligibility || await read('quant/data/market/security-master/eligibility.json');
    const cls = new Map(eligibility.decisions.map((d) => [d.ticker, d]));
    const fundamentalIndex = options.fundamentalIndex || await read('quant/data/sec/consumer/index.json').catch(() => null);
    const companyNames = options.companyNames || await read('quant/data/market/security-master/company-names.json').catch(() => null);
    const companyCiks = new Map((companyNames?.rows||[]).map(row=>[row.ticker,row.cik||null]));
    let getSeries = options.getSeries;
    if (!getSeries) {
      const { createS3DriverFromEnv } = await import('../../../market/storage/s3-driver.mjs');
      const Store = require(path.join(root, 'quant/engines/history-store.js'));
      const Guard = require(path.join(root, 'quant/engines/zero-cost-guard.js'));
      const budget = Guard.createBudget({ classAOperations: 0, classBOperations: 16000 });
      const store = Store.createHistoryStore({ driver: createS3DriverFromEnv(process.env), provider: 'tiingo', market: 'US', budget });
      const usage = await store.readUsage();
      if (Guard.evaluate({ usage, estimate: Guard.estimateOperations({ kind: 'VALIDATION_ANALYZE', objectReads: universe.securities.length + 1 }), operation: 'VALIDATION_ANALYZE' }).verdict !== Guard.ALLOWED) return unavailable('ZERO_COST_GUARD_BLOCKED');
      getSeries = (ticker) => store.getSeries(ticker);
    }
    const lookback = options.lookbackBars ?? 800;
    if (!Number.isSafeInteger(lookback) || lookback < 2) return unavailable('INVALID_SCANNER_LOOKBACK');
    const spySeries = await getSeries('SPY');
    const spyRaw = preserveRawBars(spySeries?.bars, { warmupFrom: '1900-01-01', from: asOf, to: asOf }).slice(-lookback);
    const formationDate = spyRaw.at(-1)?.date;
    if (!validDate(formationDate) || (Date.parse(asOf) - Date.parse(formationDate)) / 864e5 > (options.maxStaleDays ?? 7)) return unavailable('CURRENT_BENCHMARK_UNAVAILABLE_OR_STALE');
    const rejected = { invalidMetadata: 0, inactiveOrProduct: 0, missingSeries: 0 }, seenCurrentIds = new Set();
    const queue = universe.securities.slice(0, options.limit || undefined);
    const currentWindow = { warmupFrom: '1900-01-01', from: formationDate, to: asOf };
    const currentRows = await mapEight(queue, async (u) => {
      const e = cls.get(u.ticker), instrumentType = e?.instrument_type || u.instrumentType;
      if (u.active !== true || !INCLUDED.has(instrumentType) || (e && !['ELIGIBLE', 'SEPARATE_CLASS'].includes(e.product_eligibility))) { rejected.inactiveOrProduct++; return null; }
      const startDate = e?.start_date || u.startDate;
      if (!validDate(startDate) || !u.exchange || (u.securityId && !Identity.consistent(u.ticker, u.securityId))) { rejected.invalidMetadata++; return null; }
      const series = await getSeries(u.providerSymbol || u.ticker);
      if (!series?.bars?.length) { rejected.missingSeries++; return null; }
      // Identity remains the original provider listing identity; same-ticker
      // earlier generations are excluded through startDate, never concatenated.
      const id = `tiingo:${u.exchange}:${u.ticker}:${startDate}`;
      if (seenCurrentIds.has(id)) throw new Error('DUPLICATE_LISTING_ID'); seenCurrentIds.add(id);
      const listing = { id, ticker: u.ticker, exchange: u.exchange, startDate, active: true, reusedLater: false, storeClass: instrumentType };
      const seg = { id, cls: instrumentType, raw: series.bars.filter((b) => b.date <= asOf).slice(-lookback), delisted: false };
      const confirmed = listingFor(seg, new Map([[id, listing]]));
      return { listing, normalized: normalizeSegment(seg, confirmed, currentWindow, false), metadata: { sector: u.sector || null, industry: u.industry || null, instrumentType } };
    });
    const orderedRows = currentRows.filter(Boolean).sort((a, b) => a.listing.id.localeCompare(b.listing.id));
    const listings = orderedRows.map((r) => r.listing), metadata = new Map(orderedRows.map((r) => [r.listing.id, r.metadata]));
    const data = completePreparedData({ listings, spyRaw }, currentWindow, collectNormalized(orderedRows.map((r) => r.normalized)), true);
    if (!data.coverage.benchmarkAvailable) return unavailable('CURRENT_BENCHMARK_CANONICAL_QUARANTINE');
    data.universeId = 'CURRENT_US_PRODUCT_UNIVERSE';
    data.formationDate = formationDate;
    const bundleCache = new Map();
    async function currentFacts(s) {
      const entry = fundamentalIndex?.byTicker?.[s.ticker];
      if (!entry?.file) return [];
      if (!/^consumer\/CIK\d{10}\.json$/.test(entry.file)) return [];
      if (!bundleCache.has(entry.file)) bundleCache.set(entry.file, read('quant/data/sec/' + entry.file).catch(() => null));
      const bundle = await bundleCache.get(entry.file), facts = [];
      for (const [key, rows] of Object.entries(bundle?.annual || {})) for (const r of rows) {
        if (!Array.isArray(r) || !validDate(r[2]) || !validDate(r[4]) || r[4] >= formationDate || r[2] > r[4] || !finite(r[3])) continue;
        facts.push({ key, value: r[3], periodEnd: r[2], availableAt: r[4], frequency: 'ANNUAL', source: { provider: 'SEC_EDGAR', accession: r[5] || null, cik: entry.cik },
          unit: bundle.units?.[key] || null, origin: 'CURRENT_LATEST_SNAPSHOT', historicalPITReady: false, certification: { normalized: false, reason: 'CURRENT_CONSUMER_NOT_HISTORICAL_PIT_CERTIFIED' } });
      }
      s.issuerCik = entry.cik || null;
      return facts;
    }
    await mapEight(data.securities, async (s) => { s.fundamentals = await currentFacts(s); s.fundamentalReadiness = 'CURRENT_SOURCE_ROWS_ONLY_UNCERTIFIED'; });
    for (const s of data.securities) {Object.assign(s, metadata.get(s.id));const cik=companyCiks.get(s.ticker);s.issuerCikConflict=Boolean(cik&&s.issuerCik&&String(cik)!==String(s.issuerCik));s.issuerCik=s.issuerCik||cik||null;}
    // Keep one full canonical history for source-prefix features. The runner's
    // formationContext performs bounded, causal rebasing per method; copying
    // all history through featuresAtDate here would double the current heap.
    data.scanner = data.securities.filter((s) => s.listing.active && !s.listing.reusedLater && s.listing.startDate <= formationDate && (!s.listing.endDate || s.listing.endDate >= formationDate)
      && (!s.terminal || (s.terminal.kind === 'DATA_QUARANTINE' && s.terminal.date > formationDate))).map((s) => {
        if (!s.bars.length || s.bars.at(-1).date <= formationDate) return s;
        // An asynchronous provider object may extend beyond the latest SPY
        // session. Preserve the old causal scanner prefix without cloning its
        // bar objects or discarding the original full source-feature history.
        let end = s.bars.length;
        while (end && s.bars[end - 1].date > formationDate) end--;
        return { ...s, bars: s.bars.slice(0, end) };
      }).filter((s) => s.bars.at(-1)?.date === formationDate);
    data.coverage.currentRejected = rejected;
    data.coverage.staleRejected = data.securities.length - data.scanner.length;
    data.coverage.objectReadConcurrency = 8;
    data.coverage.scannerLookbackBars = options.lookbackBars ?? 800;
    data.fingerprint = hash({ priceFingerprint: data.fingerprint, universe, eligibility, fundamentalIndex, companyNames, currentFacts: data.securities.map((s) => ({ id: s.id, facts: s.fundamentals, issuerCik: s.issuerCik })), metadata: [...metadata], scannerIds: data.scanner.map((s) => s.id), asOf, formationDate, maxStaleDays: options.maxStaleDays ?? 7, lookbackBars: lookback });
    data.limitations.push('CURRENT_FUNDAMENTALS_UNCERTIFIED_FOR_METHOD_ADMISSION', 'ADR_DUPLICATE_ISSUER_SCREEN_REQUIRED');
    return data;
  } catch { return unavailable('CURRENT_DATA_LOAD_FAILED'); }
}
