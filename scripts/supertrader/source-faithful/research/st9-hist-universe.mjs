/**
 * Supertrader 9 – historical backtest infrastructure, data side (point-in-time universe, identity, delisting, coverage).
 * Diagnostics only around the isolated V13 study (st9-v13-delisted-study.mjs): nothing here changes a strategy, a
 * parameter, a registered study input, an engine, the snapshot, the Security Master or quant/data. Every function
 * reads a finished dataset { calendar, securities[{ id, bars, terminal, survivor, fund?, v13? }], benchmark } and
 * returns counts; structural point-in-time violations fail closed.
 *
 *  1. listingWindows / assertPointInTime / pitUniverseByYear: the universe of a date is the set of listings whose
 *     own interval [first bar, last bar] contains it (no today's tickers, survivorship visible per year). A bar after
 *     the economic terminal, a non-increasing date or a bar after the window end stops the run; bars off the session
 *     calendar and runs of unchanged zero-volume bars (forward-fill signature, accounting-contract
 *     zeroVolumeUnchangedCloseCountsAsStale) are counted as uncertainty, never repaired.
 *  2. identityCensus: listings grouped by core/identity.js#securityIdForTicker (ADR-001). Overlapping listings under
 *     one securityId are DUPLICATE_LISTING_OVERLAP, sequential ones TICKER_REUSE_SEQUENTIAL (an explicit ambiguous
 *     identity, owner decision of 30.10.2026). The Security-Master identity blocklist of #1159
 *     (scripts/market/build-security-master-identity-blocklist.mjs, schema and generator imported, never re-derived)
 *     is an INPUT: readIdentityBlocklist validates it fail closed, applyIdentityBlocklist flags (registered study) or
 *     excludes (a future registration) the blocked securityIds.
 *  3. terminalOutcomes: every listing end is classified; an end without a known outcome is censored
 *     (UNKNOWN_CENSORED, DATA_GAP_CENSORED, WINDOW_END_RIGHT_CENSORED), never filled forward.
 *  4. dataCoverageByYear / METHOD_DATA_REQUIREMENTS: coverage per year and per method with uncertainty flags.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { BLOCKLIST_SCHEMA, BLOCKLIST_GENERATOR } from '../../../market/build-security-master-identity-blocklist.mjs';

const require = createRequire(import.meta.url);
const Identity = require('../../../../core/identity.js');

export const ST9_HIST_UNIVERSE_VERSION = 'st9-hist-universe-1.0.0';
export const FORWARD_FILL_RUN_MIN = 5; // accounting-contract POLICY.staleCarryMaxSessions: one trading week
export const IDENTITY_BLOCKLIST_MODES = Object.freeze(['FLAG', 'EXCLUDE']);
const LISTING = /^tiingo:([^:]+):(.+):(\d{4}-\d{2}-\d{2})$/;
const HEX64 = /^[0-9a-f]{64}$/;
const baseId = (id) => String(id).split('#')[0];
const inc = (o, k, by = 1) => { o[k] = (o[k] || 0) + by; };
const sha = (x) => crypto.createHash('sha256').update(typeof x === 'string' || Buffer.isBuffer(x) ? x : JSON.stringify(x)).digest('hex');
const year = (d) => d.slice(0, 4);

export class HistError extends Error { constructor(code, detail = null) { super(detail ? `${code}:${detail}` : code); this.code = code; this.detail = detail; } }
const fail = (code, detail) => { throw new HistError(code, detail); };

/** Ticker of a listing id: tiingo:<EX>:<TICKER>:<start> or, for an added chain, the resolver given by the caller. */
export function tickerOfId(id, addedTickers = null) {
  const m = LISTING.exec(baseId(id));
  if (m) return m[2];
  return addedTickers?.get(baseId(id)) ?? null;
}

// ------------------------------------------------------------------------------------------------ 1. point in time
/** One window per base listing (segments of one listing merged): first bar, last bar, end cause, origin. */
export function listingWindows(ds, { addedIds = new Set(), addedTickers = null } = {}) {
  const by = new Map();
  for (const s of ds.securities) {
    const lid = baseId(s.id), first = s.bars[0]?.date, last = s.bars.at(-1)?.date;
    if (!first) continue;
    const w = by.get(lid) || { lid, origin: addedIds.has(lid) ? 'B_ADDED' : 'A_OWN', ticker: tickerOfId(lid, addedTickers), start: first, end: last, terminal: null, segments: 0, survivor: s.survivor === true, terminalClass: s.v13?.terminalClass ?? null };
    if (first < w.start) w.start = first;
    if (last >= w.end) { w.end = last; w.terminal = s.terminal ? { cause: s.terminal.cause, date: s.terminal.date, delistClass: s.terminal.delistClass ?? null, distress: s.terminal.distress === true } : null; }
    w.segments++;
    by.set(lid, w);
  }
  for (const w of by.values()) { let sid = null; try { sid = w.ticker ? Identity.securityIdForTicker(w.ticker) : null; } catch { sid = null; } w.securityId = sid; }
  return [...by.values()].sort((a, b) => a.lid.localeCompare(b.lid));
}

/**
 * Structural point-in-time check of every security. Fatal: dates not strictly increasing, a bar after the economic
 * terminal date, a bar after window.to. Counted: bars off the calendar, runs of >= FORWARD_FILL_RUN_MIN bars with an
 * unchanged close and zero volume (forward-fill signature), securities whose last bar has zero volume.
 */
export function assertPointInTime(ds, { calendarDates = null, window = null } = {}) {
  const cal = calendarDates ? new Set(calendarDates) : null;
  const out = { version: ST9_HIST_UNIVERSE_VERSION, securities: 0, bars: 0, barsOffCalendar: 0, suspectForwardFillRuns: 0, suspectForwardFillBars: 0, lastBarZeroVolume: 0 };
  for (const s of ds.securities) {
    out.securities++;
    let prev = null, run = 1;
    for (let i = 0; i < s.bars.length; i++) {
      const b = s.bars[i]; out.bars++;
      if (prev !== null && !(b.date > prev.date)) fail('PIT_DATES_NOT_INCREASING', `${s.id}@${b.date}`);
      if (s.terminal && b.date > s.terminal.date) fail('PIT_BAR_AFTER_TERMINAL', `${s.id}@${b.date}`);
      if (window?.to && b.date > window.to) fail('PIT_BAR_AFTER_WINDOW', `${s.id}@${b.date}`);
      if (cal && !cal.has(b.date)) out.barsOffCalendar++;
      const flat = prev !== null && !((b.rawVolume ?? b.volume) > 0) && (b.rawClose ?? b.close) === (prev.rawClose ?? prev.close) && b.open === b.close;
      run = flat ? run + 1 : 1;
      if (run === FORWARD_FILL_RUN_MIN) { out.suspectForwardFillRuns++; out.suspectForwardFillBars += FORWARD_FILL_RUN_MIN - 1; } else if (run > FORWARD_FILL_RUN_MIN) out.suspectForwardFillBars++;
      prev = b;
    }
    const l = s.bars.at(-1); if (l && !((l.rawVolume ?? l.volume) > 0)) out.lastBarZeroVolume++;
  }
  return out;
}

/** The universe of each year: listings with a bar in that year, new listings, ends by cause, survivors. */
export function pitUniverseByYear(windows, { window }) {
  const years = {}, y0 = Number(year(window.warmupFrom ?? window.from)), y1 = Number(year(window.to));
  for (let y = y0; y <= y1; y++) years[y] = { listed: 0, listedA: 0, listedB: 0, newListings: 0, endsEconomic: 0, endsDataGap: 0, survivorsListed: 0 };
  for (const w of windows) {
    for (let y = Math.max(y0, Number(year(w.start))); y <= Math.min(y1, Number(year(w.end))); y++) {
      const r = years[y]; r.listed++; r[w.origin === 'B_ADDED' ? 'listedB' : 'listedA']++; if (w.survivor) r.survivorsListed++;
    }
    const ys = Number(year(w.start)); if (years[ys] && w.start > (window.warmupFrom ?? window.from)) years[ys].newListings++;
    if (w.terminal) { const ye = Number(year(w.terminal.date)); if (years[ye]) years[ye][w.terminal.cause === 'LISTING_INACTIVE' ? 'endsEconomic' : 'endsDataGap']++; }
  }
  for (const r of Object.values(years)) r.survivorShare = r.listed ? r.survivorsListed / r.listed : null;
  return years;
}

/** Point-in-time members on one date (the listing interval contains the date; no today's ticker list). */
export const membersAt = (windows, date) => windows.filter((w) => w.start <= date && date <= w.end).map((w) => w.lid);

// ------------------------------------------------------------------------------------------------ 2. identity
/**
 * Security-Master identity blocklist (#1159) as input. Schema and generator are imported from its builder; the
 * reproduction against both masters is backtest-generation-freeze.cjs' job and is NOT repeated here. Fail closed on
 * a missing file, a hash other than the pinned one, another schema / generator, malformed or duplicate entries.
 */
export function readIdentityBlocklist(file, { expectedSha256 } = {}) {
  if (!file || !fs.existsSync(file)) fail('IDENTITY_BLOCKLIST_MISSING');
  if (!HEX64.test(expectedSha256 || '')) fail('IDENTITY_BLOCKLIST_SHA256_REQUIRED');
  const buf = fs.readFileSync(file), h = sha(buf);
  if (h !== expectedSha256) fail('IDENTITY_BLOCKLIST_HASH_MISMATCH');
  let j; try { j = JSON.parse(buf.toString('utf8')); } catch { fail('IDENTITY_BLOCKLIST_NOT_JSON'); }
  return parseIdentityBlocklist(j, h);
}
export function parseIdentityBlocklist(j, sha256 = null) {
  if (j?.schema !== BLOCKLIST_SCHEMA) fail('IDENTITY_BLOCKLIST_SCHEMA', String(j?.schema));
  if (j.generator !== BLOCKLIST_GENERATOR) fail('IDENTITY_BLOCKLIST_GENERATOR', String(j.generator));
  if (!HEX64.test(j.prevMasterSha256 || '') || !HEX64.test(j.nextMasterSha256 || '')) fail('IDENTITY_BLOCKLIST_MASTER_HASHES');
  if (!Array.isArray(j.entries)) fail('IDENTITY_BLOCKLIST_ENTRIES');
  const map = new Map();
  for (const e of j.entries) {
    if (typeof e?.securityId !== 'string' || !e.securityId || typeof e.reason !== 'string' || !e.reason) fail('IDENTITY_BLOCKLIST_ENTRY_INVALID');
    if (map.has(e.securityId)) fail('IDENTITY_BLOCKLIST_DUPLICATE_ENTRY', e.securityId);
    map.set(e.securityId, e.reason);
  }
  return { map, sha256, schema: j.schema, generator: j.generator, measuredOn: j.measuredOn ?? null, prevMasterSha256: j.prevMasterSha256, nextMasterSha256: j.nextMasterSha256, entries: map.size };
}

const overlap = (a, b) => a.start <= b.end && b.start <= a.end;
/** Listings per securityId: overlaps, sequential ticker reuse, blocklist hits, unresolved tickers. Counts + flags. */
export function identityCensus(windows, { blocklist = null } = {}) {
  const bySid = new Map(), flags = new Map(), census = { version: ST9_HIST_UNIVERSE_VERSION, listings: windows.length, securityIds: 0, unresolvedTicker: 0, multiListingSecurityIds: 0, duplicateListingOverlap: { listings: 0, byOrigin: {} }, tickerReuseSequential: { listings: 0, byOrigin: {} }, blocklisted: { listings: 0, byReason: {}, byOrigin: {} }, blocklist: blocklist ? { sha256: blocklist.sha256, entries: blocklist.entries, prevMasterSha256: blocklist.prevMasterSha256, nextMasterSha256: blocklist.nextMasterSha256 } : null };
  const flag = (w, f) => { (flags.get(w.lid) || flags.set(w.lid, []).get(w.lid)).push(f); };
  for (const w of windows) { if (!w.securityId) { census.unresolvedTicker++; flag(w, 'IDENTITY_UNRESOLVED'); continue; } (bySid.get(w.securityId) || bySid.set(w.securityId, []).get(w.securityId)).push(w); }
  census.securityIds = bySid.size;
  for (const [sid, ws] of bySid) {
    if (ws.length > 1) census.multiListingSecurityIds++;
    for (const w of ws) {
      const others = ws.filter((o) => o !== w);
      if (others.some((o) => overlap(o, w))) { census.duplicateListingOverlap.listings++; inc(census.duplicateListingOverlap.byOrigin, w.origin); flag(w, 'DUPLICATE_LISTING_OVERLAP'); }
      else if (others.length) { census.tickerReuseSequential.listings++; inc(census.tickerReuseSequential.byOrigin, w.origin); flag(w, 'TICKER_REUSE_SEQUENTIAL'); }
      const r = blocklist?.map.get(sid);
      if (r) { census.blocklisted.listings++; inc(census.blocklisted.byReason, r); inc(census.blocklisted.byOrigin, w.origin); flag(w, `IDENTITY_BLOCKLISTED:${r}`); }
    }
  }
  return { census, flags };
}

/** FLAG: dataset unchanged, flags returned (registered st9 study). EXCLUDE: blocked listings removed (new registration). */
export function applyIdentityBlocklist(ds, blocklist, { mode = 'FLAG', addedTickers = null } = {}) {
  if (!IDENTITY_BLOCKLIST_MODES.includes(mode)) fail('IDENTITY_BLOCKLIST_MODE', mode);
  if (!blocklist?.map) fail('IDENTITY_BLOCKLIST_REQUIRED');
  const blocked = new Set();
  for (const s of ds.securities) { const t = tickerOfId(s.id, addedTickers); let sid = null; try { sid = t ? Identity.securityIdForTicker(t) : null; } catch { sid = null; } if (sid && blocklist.map.has(sid)) blocked.add(baseId(s.id)); }
  if (mode === 'FLAG') return { ds, blocked, removedSecurities: 0 };
  const kept = ds.securities.filter((s) => !blocked.has(baseId(s.id)));
  return { ds: { ...ds, securities: kept }, blocked, removedSecurities: ds.securities.length - kept.length };
}

// ------------------------------------------------------------------------------------------------ 3. delisting
export const OUTCOMES = Object.freeze(['ACTIVE_AT_WINDOW_END', 'WINDOW_END_RIGHT_CENSORED', 'DELISTED_MERGER', 'DELISTED_DISTRESS', 'DELISTED_UNKNOWN_CENSORED', 'DATA_GAP_CENSORED']);
/** Outcome of one listing end. The engines settle every economic end at the last traded close (S0_LAST_PRICE). */
export function outcomeOf(w) {
  const t = w.terminal;
  if (!t) return w.survivor ? 'ACTIVE_AT_WINDOW_END' : 'WINDOW_END_RIGHT_CENSORED';
  if (t.cause === 'DATA_GAP') return 'DATA_GAP_CENSORED';
  if (w.terminalClass) return w.terminalClass === 'MERGER' ? 'DELISTED_MERGER' : w.terminalClass === 'DISTRESS' ? 'DELISTED_DISTRESS' : 'DELISTED_UNKNOWN_CENSORED';
  if (t.delistClass === 'ACQUISITION') return 'DELISTED_MERGER';
  return 'DELISTED_UNKNOWN_CENSORED'; // A's own unclassified ends: distress signature is a price pattern, not an outcome
}
/** Ends by outcome, origin and year; a known outcome only where a source classifies it (V13 class / SEC delistClass). */
export function terminalOutcomes(windows) {
  const out = { version: ST9_HIST_UNIVERSE_VERSION, byOutcome: {}, byOrigin: {}, byYear: {}, distressSignatureAmongUnknown: 0 };
  for (const w of windows) {
    const o = outcomeOf(w); inc(out.byOutcome, o);
    (out.byOrigin[w.origin] ||= {}); inc(out.byOrigin[w.origin], o);
    if (w.terminal) { const y = year(w.terminal.date); (out.byYear[y] ||= {}); inc(out.byYear[y], o); }
    if (o === 'DELISTED_UNKNOWN_CENSORED' && w.terminal?.distress) out.distressSignatureAmongUnknown++;
  }
  out.censored = (out.byOutcome.DELISTED_UNKNOWN_CENSORED || 0) + (out.byOutcome.DATA_GAP_CENSORED || 0) + (out.byOutcome.WINDOW_END_RIGHT_CENSORED || 0);
  return out;
}

// ------------------------------------------------------------------------------------------------ 4. coverage
/**
 * Data a method needs beyond daily OHLCV, and what the study supplies (docs/SUPERTRADER_9_V13_DELISTED_REUSE.md §4).
 * flag = the uncertainty label every result of that method carries.
 */
export const METHOD_DATA_REQUIREMENTS = Object.freeze({
  MINERVINI_SEPA: Object.freeze({ needs: ['DAILY_OHLCV', 'SEC_FUNDAMENTALS_PIT'], fundamentalsBlocking: false, flag: 'FUNDAMENTALS_NOT_BLOCKING_EVIDENCE_MANUAL' }),
  MINERVINI_POWER_PLAY: Object.freeze({ needs: ['DAILY_OHLCV', 'SEC_FUNDAMENTALS_PIT'], fundamentalsBlocking: false, flag: 'FUNDAMENTALS_NOT_BLOCKING_EVIDENCE_MANUAL' }),
  WEINSTEIN_INVESTOR: Object.freeze({ needs: ['DAILY_OHLCV', 'INDUSTRY_GROUP'], flag: 'GROUP_FILTER_NOT_APPLIED' }),
  WEINSTEIN_TRADER: Object.freeze({ needs: ['DAILY_OHLCV', 'INDUSTRY_GROUP'], flag: 'GROUP_FILTER_NOT_APPLIED' }),
  KK_EPISODIC_PIVOT: Object.freeze({ needs: ['DAILY_OHLCV', 'INTRADAY_MINUTES'], flag: 'NOT_MEASURABLE_NO_MINUTE_BARS', excluded: true }),
});
export const DAILY_ONLY = Object.freeze({ needs: ['DAILY_OHLCV'], flag: null });
export const requirementsOf = (key) => METHOD_DATA_REQUIREMENTS[key] ?? DAILY_ONLY;

/** Per year: securities with a bar, bars, bars of securities with SEC fundamentals, added share, flags. */
export function dataCoverageByYear(ds, { addedIds = new Set(), window }) {
  const years = {}, y0 = Number(year(window.warmupFrom ?? window.from)), y1 = Number(year(window.to));
  for (let y = y0; y <= y1; y++) years[y] = { securities: 0, securitiesA: 0, securitiesB: 0, bars: 0, barsB: 0, barsWithFundamentals: 0, flags: [] };
  for (const s of ds.securities) {
    const seen = new Set(), added = addedIds.has(baseId(s.id)), fund = !!(s.fund && ((s.fund.eps || []).length || (s.fund.rev || []).length));
    for (const b of s.bars) {
      const r = years[Number(year(b.date))]; if (!r) continue;
      r.bars++; if (added) r.barsB++; if (fund) r.barsWithFundamentals++;
      if (!seen.has(r)) { seen.add(r); r.securities++; r[added ? 'securitiesB' : 'securitiesA']++; }
    }
  }
  for (const [y, r] of Object.entries(years)) {
    r.fundamentalsShare = r.bars ? r.barsWithFundamentals / r.bars : null;
    r.addedShare = r.bars ? r.barsB / r.bars : null;
    if (!r.bars) r.flags.push('NO_DATA');
    if (Number(y) < 2010) r.flags.push('V13_SPARSE_BEFORE_2010');
    if (r.barsB && r.barsB > 0) r.flags.push('ADDED_CHAINS_WITHOUT_FUNDAMENTALS');
    if (Number(y) === y1 && window.to < `${y1}-12-31`) r.flags.push('PARTIAL_YEAR');
    if (Number(y) < Number(year(window.from))) r.flags.push('WARMUP_ONLY');
  }
  return years;
}

/** All data-side diagnostics of one universe in one public-safe object (counts only, no ticker, no id, no price). */
export function universeDiagnostics(ds, { addedIds = new Set(), addedTickers = null, window, calendarDates = null, blocklist = null }) {
  const pit = assertPointInTime(ds, { calendarDates, window });
  const windows = listingWindows(ds, { addedIds, addedTickers });
  const id = identityCensus(windows, { blocklist });
  return { version: ST9_HIST_UNIVERSE_VERSION, pointInTime: pit, universeByYear: pitUniverseByYear(windows, { window }), identity: id.census, terminalOutcomes: terminalOutcomes(windows), coverageByYear: dataCoverageByYear(ds, { addedIds, window }), _flags: id.flags };
}
/** Public form: the per-listing flag map is private (it carries listing ids). */
export const publicUniverseDiagnostics = ({ _flags, ...rest }) => rest; // eslint-disable-line no-unused-vars
