/**
 * Supertrader 9 – isolated comparison study: universe A (frozen research snapshot) against universe B = A plus the
 * QUALIFIED delisted chains of Quant V13 (docs/quant-recovery/v13/delisted/register-1.0.0.json) that A does not hold.
 * Research only. Nothing here changes a strategy, a parameter, a reference, the execution model, the costs, the
 * snapshot, quant/data or any product path; every engine is imported read-only and called with its unchanged REF
 * configuration (research/sf6-references.mjs). Registration: source-faithful/research/st9-v13-delisted-registration-1.0.0.json.
 *
 * Data binding (fail closed, nothing is repaired or interpolated):
 *  1. weekly series: quant/engines/research-delisted-series.cjs#loadDelisted binds every private weekly file to the
 *     public register row (chainId, status, CIK, weeks, pointsSha256); the register itself is pinned by SHA-256;
 *  2. daily bars: the decrypted V13 fetch (raw/<run>/series.jsonl.gz, the qualify.py input) is read with the
 *     semantics of qualify.py#load_series and #qualify_chain C1 (trailing untraded bars dropped). The weekly closes
 *     are recomputed from these daily bars through validation/lib.mjs#adjustSeries (the snapshot price convention,
 *     ADR-002; the same divisor as qualify.py C3) and must equal the hash-bound weekly points week by week. A chain
 *     whose daily bars do not reproduce its bound weekly series stops the run;
 *  3. terminal class and scenarios must equal the register row and protocol R6.
 * Universe B (point in time, deduplicated):
 *  - a chain is tradable only inside [chain start, last traded day] and the research window; its bars run through
 *    the unchanged production path (validation/lib.mjs#splitSegments, analyze-methods.mjs#segmentEndCause,
 *    runner/snapshot-input.mjs#securityFromSegment); the end inside the window is an economic delisting
 *    (LISTING_INACTIVE) at the actual last traded day, settled by the engines' own research-v1 rule (S0_LAST_PRICE);
 *  - a chain is excluded and counted when it overlaps an A listing: same core/identity.js securityId and an
 *    overlapping interval (tolerance of the listing table, validation/lib.mjs#buildListingTable), the same series
 *    (last-bar key, the duplicate-history rule of analyze-methods.mjs#loadPitData), or (when supplied) the same CIK
 *    with an overlapping interval; overlaps inside B keep the earlier chain;
 *  - corporate actions: only QUALIFIED chains (CA_UNRESOLVED / CA_MISMATCH are never QUALIFIED); split adjustment
 *    by the provider factors through adjustSeries.
 * Quarantine (V4-D1, the 83 reference-exposed sessions and CC-5): applied after B is built, identically to every
 * security of A and B; the A part of B must be piece-identical to A (checked). Default DQ-K5-BOOK
 * (integrity/discontinuity.mjs, a superset of the 83 sessions); optional the sealed CA-Q-K5 session list for A
 * (integrity/ca-overlay.mjs#quarantineUnresolved), with the added chains cut at their DQ-K5 flags.
 * Terminal scenarios (V13 protocol R6, study-registration-1.0.0 decomposition.delisting_terminal): MERGER 0/-10/+10 %,
 * DISTRESS and UNKNOWN 0/-30/-100 % on the terminal settlement of an ADDED chain; A's own delistings stay at scenario 0
 * (V13 study amendment 1.0.1 O1). The engines settle at scenario 0; T1/T2 are applied to the booked terminal proceeds
 * and carried forward in the curve without reinvestment (a first-order band, reported, never optimised).
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import * as L from '../../validation/lib.mjs';
import { segmentEndCause } from '../../validation/analyze-methods.mjs';
import { securityFromSegment } from '../runner/snapshot-input.mjs';
import { cagr, maxDrawdown } from '../runner/metrics.mjs';
import { DQ_POLICIES, quarantineDataset, quarantineSecurity } from '../integrity/discontinuity.mjs';
import { quarantineUnresolved } from '../integrity/ca-overlay.mjs';
import { SF6_REFERENCES, SF6_REFERENCE_KEYS, REFERENCE_COSTS } from './sf6-references.mjs';
import { PLATFORM_RESEARCH_PORTFOLIO_POLICY } from './lifecycle-engine.mjs';

const require = createRequire(import.meta.url);
const Identity = require('../../../../core/identity.js');
const Delisted = require('../../../../quant/engines/research-delisted-series.cjs');

export const ST9_STUDY_VERSION = 'st9-v13-delisted-study-1.0.0';
/** SHA-256 of docs/quant-recovery/v13/delisted/register-1.0.0.json (also coverage-1.0.0 inputs.register). */
export const V13_REGISTER_SHA256 = 'ea986202ab4dee0b33ff12f31d005bc2435e11014e5c4925be2fcacf86657a6f';
/** Protocol 1.0.0 R6 / study registration 1.0.0: scenario k of each class, k = 0 (point estimate), 1, 2. */
export const V13_TERMINAL_SCENARIOS = Object.freeze({ MERGER: Object.freeze([0, -0.1, 0.1]), DISTRESS: Object.freeze([0, -0.3, -1]), UNKNOWN: Object.freeze([0, -0.3, -1]) });
export const SCENARIO_IDS = Object.freeze(['V13_T0', 'V13_T1', 'V13_T2']);
/** C06 Minervini SEPA, C07 Power Play, C08 Kullamaegi Breakout first; then every other measurable reference. */
export const PRIMARY_METHODS = Object.freeze(['MINERVINI_SEPA', 'MINERVINI_POWER_PLAY', 'KK_BREAKOUT']);
export const STUDY_METHODS = Object.freeze([...PRIMARY_METHODS, ...SF6_REFERENCE_KEYS.filter((k) => !PRIMARY_METHODS.includes(k))]);
/** validation/lib.mjs#buildListingTable merges provider rows that restart within 10 days into one listing. */
export const DEDUPE_TOLERANCE_DAYS = 10;
export const MIN_SEGMENT_BARS = 30; // analyze-methods.mjs#loadPitData drops shorter segments
export const ADDED_ID_PREFIX = 'v13dl:';
export const QUARANTINE_MODES = Object.freeze(['DQ-K5-BOOK', 'CA-Q-K5-DATES']);
export const NOT_CERTIFIED = Object.freeze({ evidenceKind: 'HISTORICAL_DEVELOPMENT_STUDY', certification: 'DIAGNOSTIC_NOT_CERTIFIED', productionApproved: false, performanceClaim: 'NONE', publication: 'OWNER_DECISION_REQUIRED' });

export class StudyError extends Error { constructor(code, detail = null) { super(detail ? `${code}:${detail}` : code); this.code = code; this.detail = detail; } }
const fail = (code, detail) => { throw new StudyError(code, detail); };
const sha = (x) => crypto.createHash('sha256').update(typeof x === 'string' || Buffer.isBuffer(x) ? x : JSON.stringify(x)).digest('hex');
const inc = (o, k, by = 1) => { o[k] = (o[k] || 0) + by; };
const addDays = (d, n) => L.addDays(d, n);
const baseId = (id) => String(id).split('#')[0];

// ------------------------------------------------------------------------------------------------ daily V13 input
/** qualify.py#load_series: files raw/<run>/series.jsonl.gz in sorted order; the first entry with rows wins per ticker. */
export function readDailyRaw(rawDir) {
  if (typeof rawDir !== 'string' || !fs.existsSync(rawDir)) fail('V13_DAILY_DIR_MISSING');
  const files = fs.readdirSync(rawDir).sort().map((d) => path.join(rawDir, d, 'series.jsonl.gz')).filter((f) => fs.existsSync(f));
  if (!files.length) fail('V13_DAILY_DIR_EMPTY');
  const out = new Map(), fileHashes = [];
  for (const f of files) {
    const buf = fs.readFileSync(f); fileHashes.push({ file: path.basename(path.dirname(f)), sha256: sha(buf) });
    for (const line of zlib.gunzipSync(buf).toString('utf8').split('\n')) {
      if (!line.trim()) continue;
      const r = JSON.parse(line), prev = out.get(r.ticker);
      if (!prev || (!(prev.rows && prev.rows.length) && r.rows && r.rows.length)) out.set(r.ticker, r);
    }
  }
  return { byTicker: out, fileHashes };
}

const DAILY_COLS = ['date', 'open', 'high', 'low', 'close', 'volume', 'adjClose', 'divCash', 'splitFactor'];
/** Raw bars of one fetched entry: rows with a close, trailing untraded bars dropped (qualify.py C1). */
export function tradedRawBars(entry) {
  const ix = Object.fromEntries((entry.cols || []).map((c, i) => [c, i]));
  for (const c of DAILY_COLS) if (ix[c] === undefined) fail('V13_DAILY_COLUMNS_MISSING', c);
  const rows = (entry.rows || []).filter((r) => r[ix.close] !== null && r[ix.close] !== undefined);
  while (rows.length && !((rows.at(-1)[ix.volume] || 0) > 0)) rows.pop();
  return rows.map((r) => ({ date: String(r[ix.date]).slice(0, 10), open: r[ix.open], high: r[ix.high], low: r[ix.low], close: Number(r[ix.close]), volume: r[ix.volume] ?? 0, adjClose: r[ix.adjClose] ?? null, dividend: r[ix.divCash] ?? 0, splitFactor: r[ix.splitFactor] ?? 1 }));
}

/** ISO week key (Monday-based; the Thursday of the week decides the year), as Python date.isocalendar(). */
export function isoWeek(d) {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 3 - ((t.getUTCDay() + 6) % 7)); // Thursday of this week
  const y = t.getUTCFullYear();
  return `${y}-W${1 + Math.floor((t - Date.UTC(y, 0, 1)) / (7 * 864e5))}`;
}
/** Weekly split-adjusted closes (qualify.py C2/C3): close of the last traded bar of each ISO week. */
export function weeklyFromDaily(raw) {
  const a = L.adjustSeries(raw), out = [];
  for (let i = 0; i < a.date.length; i++) {
    const wk = isoWeek(a.date[i]);
    if (out.length && out.at(-1).wk === wk) out[out.length - 1] = { wk, date: a.date[i], v: a.close[i] }; else out.push({ wk, date: a.date[i], v: a.close[i] });
  }
  return out.map((w) => [w.date, w.v]);
}

/** The daily bars must reproduce the hash-bound weekly points (date and 6-decimal value, qualify.py rounding). */
export function bindDailyToWeekly(chainId, raw, points) {
  const w = weeklyFromDaily(raw);
  if (w.length !== points.length) fail('V13_DAILY_WEEKLY_BINDING_MISMATCH', `${chainId}:weeks`);
  for (let k = 0; k < w.length; k++) {
    const [d, v] = w[k], [pd, pv] = points[k];
    if (d !== pd || !(Math.abs(v - pv) <= 1e-6 + 1e-12 * Math.abs(pv))) fail('V13_DAILY_WEEKLY_BINDING_MISMATCH', `${chainId}:${k}`);
  }
  return true;
}

/**
 * Loads the QUALIFIED V13 chains with daily bars, bound end to end. Missing files, a register or hash mismatch, a
 * daily/weekly mismatch or an unexpected terminal mapping stop the run (no partial universe).
 */
export function loadV13Additions({ root, seriesDir, rawDir, expectedRegisterSha256 = V13_REGISTER_SHA256 }) {
  if (typeof seriesDir !== 'string' || !fs.existsSync(seriesDir)) fail('V13_SERIES_DIR_MISSING');
  const regPath = path.join(root, Delisted.REGISTER);
  if (!fs.existsSync(regPath)) fail('V13_REGISTER_MISSING');
  const registerSha256 = sha(fs.readFileSync(regPath));
  if (expectedRegisterSha256 && registerSha256 !== expectedRegisterSha256) fail('V13_REGISTER_HASH_MISMATCH');
  let loaded;
  try { loaded = Delisted.loadDelisted(root, { dir: seriesDir, include: 'QUALIFIED' }); } catch (e) { fail('V13_WEEKLY_BINDING_FAILED', String(e.message || e)); }
  if (loaded.counts.missingFile) fail('V13_SERIES_MISSING', String(loaded.counts.missingFile));
  if (loaded.registerHash !== registerSha256) fail('V13_REGISTER_HASH_MISMATCH');
  const reg = JSON.parse(fs.readFileSync(regPath, 'utf8')), ix = Object.fromEntries(reg.columns.map((c, i) => [c, i]));
  const rowOf = new Map(reg.rows.map((r) => [r[ix.chainId], r]));
  const daily = readDailyRaw(rawDir), chains = [];
  for (const doc of [...loaded.docs.values()].sort((a, b) => a.securityId.localeCompare(b.securityId))) {
    const chainId = doc.securityId.slice(3), file = JSON.parse(fs.readFileSync(path.join(seriesDir, chainId + '.json'), 'utf8')), row = rowOf.get(chainId);
    const cls = file.terminal?.class;
    if (cls !== row[ix.terminalClass] || !V13_TERMINAL_SCENARIOS[cls] || JSON.stringify(file.terminal.scenarios) !== JSON.stringify(V13_TERMINAL_SCENARIOS[cls])) fail('V13_TERMINAL_SCENARIO_MISMATCH', chainId);
    if (!file.chain?.startDate || typeof file.exchange !== 'string' || file.lastTradeDate !== file.points.at(-1)[0]) fail('V13_CHAIN_FIELDS_INVALID', chainId);
    const entry = daily.byTicker.get(file.ticker);
    if (!entry || !(entry.rows && entry.rows.length)) fail('V13_DAILY_MISSING', chainId);
    const raw = tradedRawBars(entry);
    bindDailyToWeekly(chainId, raw, file.points);
    if (raw.at(-1).date !== file.lastTradeDate) fail('V13_DAILY_WEEKLY_BINDING_MISMATCH', `${chainId}:lastTrade`);
    chains.push({ chainId, ticker: file.ticker, exchange: file.exchange, cik: String(file.cik), chainStart: file.chain.startDate, lastTradeDate: file.lastTradeDate, terminalClass: cls, scenarios: V13_TERMINAL_SCENARIOS[cls], raw, dailySha256: sha(raw) });
  }
  return { chains, provenance: { registerSha256, include: 'QUALIFIED', requested: loaded.counts.requested, loaded: loaded.counts.loaded, dailyFiles: daily.fileHashes, dailyBoundChains: chains.length, chainsSha256: sha(chains.map((c) => [c.chainId, c.dailySha256])) } };
}

// ------------------------------------------------------------------------------------------------ universe B
const LISTING = /^tiingo:([^:]+):(.+):(\d{4}-\d{2}-\d{2})$/;
const OPEN_END = '9999-12-31';
const plusTol = (d, tol) => (d >= OPEN_END ? OPEN_END : addDays(d, tol)); // never step past year 9999 (string order)
const overlaps = (a0, a1, b0, b1, tol = DEDUPE_TOLERANCE_DAYS) => b0 <= plusTol(a1, tol) && a0 <= plusTol(b1, tol);
const barKey = (date, close, volume) => `${date}|${close}|${volume ?? 0}`;

/** Listing intervals of A by securityId (an active / window-end listing is open-ended). */
function aIndex(dsA, aCikByListing) {
  const byListing = new Map();
  for (const s of dsA.securities) {
    const lid = baseId(s.id), m = LISTING.exec(lid), first = s.bars[0]?.date, last = s.bars.at(-1)?.date;
    if (!first) continue;
    const e = byListing.get(lid) || { lid, ticker: m ? m[2] : null, start: m ? (m[3] < first ? m[3] : first) : first, end: last, open: false };
    if (last > e.end) e.end = last;
    if (first < e.start) e.start = first;
    if (!s.terminal) e.open = true; // ACTIVE or WINDOW_END: listed beyond its last bar
    byListing.set(lid, e);
  }
  const bySid = new Map(), byCik = new Map();
  for (const e of byListing.values()) {
    const end = e.open ? OPEN_END : e.end;
    if (e.ticker) { let sid = null; try { sid = Identity.securityIdForTicker(e.ticker); } catch { sid = null; } if (sid) (bySid.get(sid) || bySid.set(sid, []).get(sid)).push({ start: e.start, end }); }
    const cik = aCikByListing?.get(e.lid);
    if (cik) (byCik.get(String(cik)) || byCik.set(String(cik), []).get(String(cik))).push({ start: e.start, end });
  }
  const lastKeys = new Set(dsA.securities.map((s) => { const b = s.bars.at(-1); return b ? barKey(b.date, b.rawClose, b.rawVolume) : null; }).filter(Boolean));
  return { bySid, byCik, lastKeys };
}

/**
 * Builds B = A + deduplicated, point-in-time cut V13 chains. A is not modified (its security objects are shared).
 * window: { warmupFrom, from, to } (default the research DEV window); calendarDates: the session calendar of the
 * snapshot (SPY bars incl. warm-up; default dsA.benchmark dates).
 */
export function buildUniverseB(dsA, chains, { window = L.WINDOW, calendarDates = null, aCikByListing = null } = {}) {
  const cal = new Set(calendarDates ?? (dsA.benchmark || []).map((b) => b.date));
  if (!cal.size) fail('CALENDAR_REQUIRED');
  const A = aIndex(dsA, aCikByListing), ids = new Set(dsA.securities.map((s) => s.id));
  const census = { schema: 'st9-universe-b-census-1.0.0', chainsIn: chains.length, added: 0, addedSecurities: 0, excluded: {}, barsOutsideInterval: 0, barsOffCalendar: 0, addedByTerminalClass: {}, addedLastTradeInWindow: 0, addedWindowEnd: 0 };
  const exclude = (k) => inc(census.excluded, k);
  // B's own identity intervals (earlier chain wins)
  const keptSid = new Map(), keptCik = new Map(), added = [];
  // A bars that equal the last bar of a chain (duplicate history in the other direction)
  const chainLast = new Map(chains.map((c) => { const b = c.raw.at(-1); return [c.chainId, barKey(b.date, b.close, b.volume)]; }));
  const lastByDate = new Map(); for (const [id, k] of chainLast) { const d = k.slice(0, 10); (lastByDate.get(d) || lastByDate.set(d, []).get(d)).push([id, k]); }
  const seenInA = new Set();
  for (const s of dsA.securities) for (const b of s.bars) { const l = lastByDate.get(b.date); if (l) for (const [id, k] of l) if (k === barKey(b.date, b.rawClose, b.rawVolume)) seenInA.add(id); }
  for (const c of [...chains].sort((a, b) => a.chainStart.localeCompare(b.chainStart) || a.chainId.localeCompare(b.chainId))) {
    const sid = Identity.securityIdForTicker(c.ticker), b0 = c.chainStart, b1 = c.lastTradeDate;
    if (b1 < window.warmupFrom || b0 > window.to) { exclude('OUTSIDE_WINDOW'); continue; }
    if ((A.bySid.get(sid) || []).some((a) => overlaps(a.start, a.end, b0, b1))) { exclude('DUPLICATE_A_SECURITY_ID_INTERVAL'); continue; }
    if (seenInA.has(c.chainId) || c.raw.some((x) => A.lastKeys.has(barKey(x.date, x.close, x.volume)))) { exclude('DUPLICATE_A_SERIES'); continue; }
    if ((A.byCik.get(c.cik) || []).some((a) => overlaps(a.start, a.end, b0, b1))) { exclude('DUPLICATE_A_CIK_INTERVAL'); continue; }
    if ((keptSid.get(sid) || []).some((a) => overlaps(a.start, a.end, b0, b1)) || (keptCik.get(c.cik) || []).some((a) => overlaps(a.start, a.end, b0, b1))) { exclude('DUPLICATE_WITHIN_B'); continue; }
    // point in time: only inside the chain's own interval, the research window and the session calendar
    const lo = b0 > window.warmupFrom ? b0 : window.warmupFrom, hi = b1 < window.to ? b1 : window.to;
    const inWin = [];
    for (const x of c.raw) {
      if (x.date < b0 || x.date > b1) { census.barsOutsideInterval++; continue; }
      if (x.date < lo || x.date > hi) continue;
      if (!cal.has(x.date)) { census.barsOffCalendar++; continue; }
      inWin.push(x);
    }
    const segs = L.splitSegments(inWin), pieces = [];
    segs.forEach((seg, i) => {
      if (seg.length < MIN_SEGMENT_BARS) return;
      const id = `${ADDED_ID_PREFIX}${c.exchange}:${c.chainId}${i ? `#${i}` : ''}`;
      if (ids.has(id)) fail('DUPLICATE_SECURITY_ID', id);
      const sec = securityFromSegment({ id, raw: seg, endCause: segmentEndCause(i, segs.length, false, b1, window.to), delisted: true, survivor: false, delistClass: c.terminalClass === 'MERGER' ? 'ACQUISITION' : 'UNKNOWN' });
      sec.v13 = Object.freeze({ chainId: c.chainId, terminalClass: c.terminalClass, scenarios: c.scenarios, lastTradeDate: b1 });
      pieces.push(sec); ids.add(id);
    });
    if (!pieces.length) { exclude('SHORT_IN_WINDOW'); continue; }
    (keptSid.get(sid) || keptSid.set(sid, []).get(sid)).push({ start: b0, end: b1 });
    (keptCik.get(c.cik) || keptCik.set(c.cik, []).get(c.cik)).push({ start: b0, end: b1 });
    added.push(...pieces); census.added++; census.addedSecurities += pieces.length; inc(census.addedByTerminalClass, c.terminalClass);
    if (b1 <= window.to) census.addedLastTradeInWindow++; else census.addedWindowEnd++;
  }
  census.excludedTotal = Object.values(census.excluded).reduce((a, b) => a + b, 0);
  return { dsB: { ...dsA, securities: [...dsA.securities, ...added] }, addedIds: new Set(added.map((s) => baseId(s.id))), census };
}

// ------------------------------------------------------------------------------------------------ quarantine
const pieceKey = (s) => { const n = s.bars.length; return `${s.id}|${n}|${s.bars[0]?.date}|${s.bars[n - 1]?.date}|${s.bars.reduce((a, b) => a + (b.close || 0), 0).toFixed(6)}|${s.terminal?.cause ?? ''}|${s.terminal?.date ?? ''}`; };

/** Identical quarantine of every security; datesBySegment (Map id -> dates) is the sealed CA-Q-K5 list for A. */
export function applyQuarantine(ds, { mode = 'DQ-K5-BOOK', datesBySegment = null, addedIds = new Set() } = {}) {
  if (!QUARANTINE_MODES.includes(mode)) fail('UNKNOWN_QUARANTINE_MODE', mode);
  const K5 = DQ_POLICIES['DQ-K5-BOOK'];
  if (mode === 'DQ-K5-BOOK') { const q = quarantineDataset(ds, K5); return { ds: q.ds, census: q.census }; }
  if (!(datesBySegment instanceof Map)) fail('QUARANTINE_DATES_REQUIRED');
  const own = { ...ds, securities: ds.securities.filter((s) => !addedIds.has(baseId(s.id))) };
  const qa = quarantineUnresolved(own, datesBySegment, { ...K5, id: 'CA-Q-K5' });
  const addedPieces = [], flags = { added: 0 };
  for (const s of ds.securities) if (addedIds.has(baseId(s.id))) { const q = quarantineSecurity(s, K5); addedPieces.push(...q.pieces); flags.added += q.flags.length; }
  return { ds: { ...ds, securities: [...qa.ds.securities, ...addedPieces] }, census: { policy: 'CA-Q-K5', cuts: qa.cuts, droppedBars: qa.droppedBars, addedDqK5Flags: flags.added } };
}

// ------------------------------------------------------------------------------------------------ evaluation
/** Terminal proceeds of ADDED chains shifted by scenario k and carried forward in the curve (no reinvestment). */
export function terminalScenarioAdjust(curve, ledger, scenarioOf, k) {
  const shocks = [];
  for (const r of ledger) {
    if (r.side !== 'SELL' || r.reason !== 'TERMINAL_DELISTED') continue;
    const sc = scenarioOf(baseId(r.id)); if (!sc) continue;
    const d = sc[k] * (r.gross - (r.fee || 0)); if (d !== 0) shocks.push({ date: r.date, d });
  }
  shocks.sort((a, b) => a.date.localeCompare(b.date));
  let j = 0, acc = 0;
  const out = curve.map((p) => { while (j < shocks.length && shocks[j].date <= p.date) acc += shocks[j++].d; return acc ? { ...p, equity: p.equity + acc } : p; });
  return { curve: out, total: shocks.reduce((a, s) => a + s.d, 0), shocks: shocks.length };
}

const STOP = /STOP/;
/** Metrics of one method run on one universe; trades are the normalized trades of sf6-references. */
export function evaluateRun(r, { addedIds, scenarioOf, initialCapital = PLATFORM_RESEARCH_PORTFOLIO_POLICY.initialCapital }) {
  const run = r.run, closed = r.trades.filter((t) => t.status === 'CLOSED');
  const origin = (id) => (addedIds.has(baseId(id)) ? 'B_ADDED' : 'A_OWN');
  const term = run.ledger.filter((x) => x.side === 'SELL' && x.reason === 'TERMINAL_DELISTED');
  const termTrades = closed.filter((t) => t.exitReason === 'TERMINAL_DELISTED');
  const delisting = { trades: termTrades.length, byOrigin: {}, pnlS0ByOrigin: {}, losingByOrigin: {}, addedByTerminalClass: {}, settlements: term.length };
  for (const t of termTrades) { const o = origin(t.id); inc(delisting.byOrigin, o); inc(delisting.pnlS0ByOrigin, o, t.pnl ?? 0); if ((t.pnl ?? 0) < 0) inc(delisting.losingByOrigin, o); if (o === 'B_ADDED') inc(delisting.addedByTerminalClass, scenarioOf.classOf(baseId(t.id)) ?? 'UNKNOWN_CLASS'); }
  const scen = {};
  SCENARIO_IDS.forEach((sid, k) => {
    const adj = terminalScenarioAdjust(run.curve, run.ledger, scenarioOf, k);
    const curve = adj.curve.length ? [{ date: adj.curve[0].date, equity: initialCapital }, ...adj.curve] : adj.curve;
    scen[sid] = { cagr: cagr(curve), maxDrawdown: maxDrawdown(curve), endingEquity: curve.at(-1)?.equity ?? null, terminalShockTotal: adj.total, terminalShocks: adj.shocks };
  });
  const tradesByOrigin = {}; for (const t of r.trades) inc(tradesByOrigin, origin(t.id));
  return {
    trades: r.trades.length, closedTrades: closed.length, openAtDataEnd: r.trades.length - closed.length, tradesByOrigin,
    hitRate: closed.length ? closed.filter((t) => t.pnl > 0).length / closed.length : null,
    stopExits: closed.filter((t) => STOP.test(String(t.exitReason ?? ''))).length,
    delisting, scenarios: scen,
    reconciliation: run.reconciliation ? { pass: run.reconciliation.pass, absoluteDifference: run.reconciliation.absoluteDifference } : null,
  };
}

/** Frozen run parameters; the same object drives A and B (its hash is reported for both). */
export function studyParameters({ methods = STUDY_METHODS, window = L.WINDOW, quarantine = 'DQ-K5-BOOK' } = {}) {
  if (L.WINDOW_NAME !== 'DEV') fail('HOLDOUT_NOT_PERMITTED'); // the 2008-2015 holdout (PREREGISTRATION-R14) stays untouched
  for (const m of methods) if (!SF6_REFERENCE_KEYS.includes(m)) fail('UNKNOWN_METHOD', m);
  if (!QUARANTINE_MODES.includes(quarantine)) fail('UNKNOWN_QUARANTINE_MODE', quarantine);
  const p = { version: ST9_STUDY_VERSION, methods: [...methods], configuration: 'REF (research/sf6-references.mjs, unchanged)', from: window.from, to: window.to, warmupFrom: window.warmupFrom, costs: { ...REFERENCE_COSTS }, engineTerminalScenario: 'S0_LAST_PRICE', terminalScenarios: V13_TERMINAL_SCENARIOS, quarantine, initialCapital: PLATFORM_RESEARCH_PORTFOLIO_POLICY.initialCapital };
  return Object.freeze({ ...p, sha256: sha(p) });
}

/**
 * Runs every method with identical parameters on A and on B. Returns per method A, B, the B - A delta (T0) and the
 * terminal-scenario band of B. Fails closed when the quarantined A part of B differs from quarantined A.
 */
export function runStudy({ dsA, dsB, addedIds, params, datesBySegment = null, log = () => {} }) {
  if (L.WINDOW_NAME !== 'DEV') fail('HOLDOUT_NOT_PERMITTED');
  const scenOf = new Map(), clsOf = new Map();
  for (const s of dsB.securities) if (s.v13) { scenOf.set(baseId(s.id), s.v13.scenarios); clsOf.set(baseId(s.id), s.v13.terminalClass); }
  const scenarioOf = Object.assign((id) => scenOf.get(id) || null, { classOf: (id) => clsOf.get(id) || null });
  const qa = applyQuarantine(dsA, { mode: params.quarantine, datesBySegment, addedIds: new Set() });
  const qb = applyQuarantine(dsB, { mode: params.quarantine, datesBySegment, addedIds });
  const aKeys = qa.ds.securities.map(pieceKey).sort(), bOwn = qb.ds.securities.filter((s) => !addedIds.has(baseId(s.id))).map(pieceKey).sort();
  if (aKeys.length !== bOwn.length || aKeys.some((k, i) => k !== bOwn[i])) fail('QUARANTINE_NOT_IDENTICAL_IN_A_AND_B');
  const frames = { A: qa.ds, B: qb.ds }, methods = {};
  for (const key of params.methods) {
    const ref = SF6_REFERENCES.find((r) => r.key === key), out = { candidateId: ref.candidateId, parametersSha256: {} };
    for (const [f, ds] of Object.entries(frames)) {
      const opts = { from: params.from, to: params.to, costs: params.costs };
      const prep = ref.prep(ds, opts) || {};
      out[f] = evaluateRun(ref.run(ds, { ...opts, ...prep }), { addedIds, scenarioOf, initialCapital: params.initialCapital });
      out.parametersSha256[f] = sha({ params: params.sha256, opts });
      log(`${key} ${f}: ${out[f].trades} trades`);
    }
    const d = (g) => (Number.isFinite(g(out.B)) && Number.isFinite(g(out.A)) ? g(out.B) - g(out.A) : null);
    const bc = SCENARIO_IDS.map((s) => out.B.scenarios[s].cagr).filter(Number.isFinite);
    out.deltaBminusA = { cagrT0: d((x) => x.scenarios.V13_T0.cagr), maxDrawdownT0: d((x) => x.scenarios.V13_T0.maxDrawdown), hitRate: d((x) => x.hitRate), trades: out.B.trades - out.A.trades, stopExits: out.B.stopExits - out.A.stopExits };
    out.survivorshipSensitivity = { cagrA: out.A.scenarios.V13_T0.cagr, cagrBBand: bc.length ? [Math.min(...bc), Math.max(...bc)] : null, terminalScenarioSpread: bc.length ? Math.max(...bc) - Math.min(...bc) : null };
    methods[key] = out;
  }
  return { params, quarantine: { A: qa.census, B: qb.census }, methods, hypotheses: evaluateHypotheses(methods), ...NOT_CERTIFIED };
}

/** H1-H3 of the registration, primary methods only; descriptive readings. */
export function evaluateHypotheses(methods) {
  const read = (ok) => (ok === null ? 'NOT_EVALUABLE' : ok ? 'HOLDS' : 'DOES_NOT_HOLD');
  const out = {};
  for (const k of PRIMARY_METHODS) {
    const m = methods[k]; if (!m) continue;
    const d = m.deltaBminusA.cagrT0, band = m.survivorshipSensitivity.terminalScenarioSpread, nB = m.B.trades, nAdd = m.B.tradesByOrigin.B_ADDED || 0;
    out[k] = { H1: read(Number.isFinite(d) ? Math.abs(d) <= 0.01 : null), H2: read(Number.isFinite(band) ? band <= 0.005 : null), H3: read(nB > 0 ? nAdd / nB < 0.05 : null) };
  }
  return out;
}

/** Public part: counts and hashes only (no metric, no ticker, no chainId, no price). */
export function publicPart(result, { census, provenance, receipt }) {
  return { schema: 'st9-v13-delisted-study-public-1.0.0', ...NOT_CERTIFIED, receipt, parametersSha256: result.params.sha256, universeB: census, v13: { registerSha256: provenance.registerSha256, requested: provenance.requested, loaded: provenance.loaded, dailyBoundChains: provenance.dailyBoundChains, chainsSha256: provenance.chainsSha256 }, methods: Object.fromEntries(Object.entries(result.methods).map(([k, m]) => [k, { candidateId: m.candidateId, tradesA: m.A.trades, tradesB: m.B.trades, reconciliationPass: !!(m.A.reconciliation?.pass && m.B.reconciliation?.pass) }])) };
}

/** --out must lie outside the repository (never a committed data directory). */
export function assertOutsideRepo(out, root) {
  if (typeof out !== 'string' || !out) fail('OUT_REQUIRED');
  const rel = path.relative(path.resolve(root), path.resolve(out));
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) fail('OUT_INSIDE_REPOSITORY');
  return path.resolve(out);
}

/** Sealed CA-Q-K5 session list (owner-only file): { "<segmentId>": ["YYYY-MM-DD", ...] }. */
export function readQuarantineDates(file) {
  if (!file || !fs.existsSync(file)) fail('QUARANTINE_DATES_MISSING');
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { map: new Map(Object.entries(j).map(([k, v]) => [k, [...v].sort()])), sha256: sha(fs.readFileSync(file)) };
}

export const STUDY_FILES = Object.freeze(['st9-v13-delisted-study.mjs', 'run-st9-v13-delisted-study.mjs']);
