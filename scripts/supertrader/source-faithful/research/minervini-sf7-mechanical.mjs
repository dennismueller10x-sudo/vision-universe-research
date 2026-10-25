/**
 * Supertrader 7.0 – Minervini: the remaining mechanically provable source functions of the E7-2 work list
 * (docs/SUPERTRADER_7_MINERVINI_MECHANICAL_1_4.md, package sf7-minervini-1.4.0). DIAGNOSTICS ONLY: counts on the
 * reference trades, never a gate, never a filter, never an exit, never a fill, never a variant choice. The 4.0 lifecycle
 * (minervini-lifecycle.mjs, minervini-execution.mjs, fingerprint c834b227…) and the 7.0 setup / exit variants are not
 * touched; this file is not part of run-sf4-lifecycle#FILES.
 *
 * Every book content below is a German / English PARAPHRASE of the Indonesian (B12, B07) or Vietnamese (B03)
 * translation, never a quotation. Every number the books do not print is a declared model assumption
 * (SF7_MECHANICAL_MODEL_ASSUMPTIONS, MA-MIN7-*), fixed in this file before any snapshot result of it was read.
 *
 *  - G-BASECOUNT (F7-B03-207-082, F7-B12-116-203, F7-B12-116-205): base number of the setup since the last reset.
 *    B03 PDF 207: bases 1 and 2 after a market correction are good, 3 and 4 still work but are late, 5 and 6 likely
 *    fail. B12 PDF 116: from base 4 or 5 the trend is late; bases 1 and 2 mostly come out of market corrections, base 3
 *    is mostly still tradable. The books define neither a base nor the reset (MA-MIN7-BASECOUNT-*).
 *  - G-BASECOUNT x climax (F7-B03-225-092): the same exhaustion action out of the first base is bullish, a sell signal
 *    only after a late base. Diagnostic: the signals of the research exit variants EXIT-CLIMAX / EXIT-CLIMAX-UPCLOSES
 *    counted by the base number of their trade. No suppression variant (it would change trades).
 *  - G-TOPVOL (F7-B03-217-087, with B03 PDF 219): first post-entry down day whose volume is the highest since the
 *    Stage 2 start (MA-MIN7-STAGE2-START), before the exit session. Churning and the high-volume reversal stay
 *    QUALITATIVE (no mechanical reading).
 *  - G-RELDEPTH (F7-B12-280-275, with B12 PDF 295 and B03 PDF 160): base depth relative to the market decline over the
 *    same window, flagged above 2x and above 3x. Diagnostic only; the setup filter stays a deferred variant.
 *  - G-CHASE / G-BUFFER (F7-B07-067-140, F7-B07-087-150, F7-B12-297-283, F7-B07-040-117): how far the reference fill
 *    lay above the pivot, how far a gap open lay above it, and how many reference fills a buy stop 5 / 10 / 20 cents over
 *    the pivot would not have triggered on the fill bar. The books give no chase number ("a few percent") and no buffer
 *    number ("no magic number"): the buckets are reporting steps, not thresholds, and no k is chosen.
 */
import crypto from 'node:crypto';
import { fin } from '../common/series.mjs';
import { trendTemplate, MIN_PARAMS } from '../methods/minervini.mjs';
import { vcpContractions } from './minervini-components.mjs';

export const SF7_MECHANICAL_VERSION = 'sf7-minervini-mechanical-1.0.0';

/** Printed values used here (source, page, translation status). */
export const SF7_MECHANICAL_SOURCE_BOUNDS = Object.freeze({
  baseMinSessions: Object.freeze({ value: 20, source: 'B12 PDF 115', reading: 'bases / pullbacks inside Stage 2 last 4-5 weeks to more than a year: lower end, 4 weeks = 20 sessions', translationUnverified: true }),
  earlyBaseMax: Object.freeze({ value: 2, source: 'B03 PDF 207, B12 PDF 116', reading: 'bases 1 and 2 (after a market correction) are the best entries', translationUnverified: true }),
  lateBaseFrom: Object.freeze({ value: 3, source: 'B03 PDF 207', reading: 'bases 3 and 4 still work, but late in the cycle', translationUnverified: true }),
  lateStageFrom: Object.freeze({ value: 4, source: 'B12 PDF 116', reading: 'from base 4 or 5 the trend is late (lower printed value)', translationUnverified: true }),
  likelyFailureFrom: Object.freeze({ value: 5, source: 'B03 PDF 207', reading: 'bases 5 and 6 likely fail', translationUnverified: true }),
  relativeDepthStrict: Object.freeze({ value: 2, source: 'B12 PDF 280, B03 PDF 160', reading: 'avoid stocks correcting more than two to three times the market correction: lower printed value', translationUnverified: true }),
  relativeDepthLoose: Object.freeze({ value: 3, source: 'B12 PDF 280, B03 PDF 160', reading: 'upper printed value of the two-to-three-times bound (B12 PDF 295: 2.3x still acceptable)', translationUnverified: true }),
  pivotBufferUsd: Object.freeze({ value: Object.freeze([0.05, 0.10, 0.20]), source: 'B07 PDF 40', reading: 'wait until 5, 10 or 20 cents over the pivot trade; no magic number (the three printed examples, all reported, none chosen)', translationUnverified: true }),
});

/** Model assumptions of this package; none is a Minervini rule. */
export const SF7_MECHANICAL_MODEL_ASSUMPTIONS = Object.freeze([
  Object.freeze({ id: 'MA-MIN7-BASECOUNT-BASE', phase: 'SETUP_QUALIFICATION', reference: 'a base is completed by the first close above the running closing high (highest close since the scan start, updated only by a strictly higher close) at least 20 sessions after that closing high was set; a shorter pause is no base; no depth bound (flat bases count)', why: 'the books name bases and their number, not their detection; 20 sessions is the printed lower end of a Stage 2 base (B12 PDF 115, SF7_MECHANICAL_SOURCE_BOUNDS.baseMinSessions); closes on both sides, because an intraday high above the base high on the breakout attempt would otherwise restart the base one session before its breakout close' }),
  Object.freeze({ id: 'MA-MIN7-BASECOUNT-MARKET-RESET', phase: 'SETUP_QUALIFICATION', reference: 'market correction = the benchmark (snapshot SPY, split-adjusted closes) closes at least 10 % below its highest prior close; the count restarts at the lowest benchmark close of the latest such correction known on the setup date (point in time: benchmark closes up to the setup date only); the base whose breakout follows that low is base 1', why: 'B03 PDF 207 / B12 PDF 116 count bases after a market correction without sizing the correction: 10 % is a convention, not a book number (ABSENT_FROM_MATERIAL); the low is the session the correction is deepest, so a base formed during the correction is base 1 (B12 PDF 116: bases 1 and 2 mostly come out of market corrections)' }),
  Object.freeze({ id: 'MA-MIN7-BASECOUNT-STOCK-RESET', phase: 'SETUP_QUALIFICATION', reference: 'the count also restarts after the last close of the security below its 200-day mean (Trend Template criterion 1 fails: no Stage 2); without such a close since the first 200-day mean and without a market-correction low after it the count is a lower bound (flag baseCountLowerBound)', why: 'bases are counted inside one Stage 2 advance (B12 PDF 115-116); the books do not date its start; the 200-day line is the source\'s own Stage 2 boundary (MIN-SF-TT-1). The Trend Template run (MA-MIN7-STAGE2-START) is not used here because criterion 5 (close above MA50) fails inside most bases' }),
  Object.freeze({ id: 'MA-MIN7-BASECOUNT-CURRENT', phase: 'SETUP_QUALIFICATION', reference: 'base number of a setup = completed bases with their breakout close after the reset + 1 (the setup\'s own base)', why: 'a setup is a buy point out of a base (B12 PDF 297); counting it makes base 1 the first base after the reset, as in B03 PDF 207' }),
  Object.freeze({ id: 'MA-MIN7-TOPVOL', phase: 'EXIT_CONDITIONS', reference: 'top-volume decline = a down close (close below the prior close) whose volume is above the volume of every session since the Stage 2 start (MA-MIN7-STAGE2-START), scanned from the entry session to the session before the exit session of a closed trade (to the data end for an open trade); not evaluable without Stage 2 at the setup', why: 'B03 PDF 217 names the decline on the largest volume since the start of the trend; B03 PDF 219 calls even a 4-5 % decline on it a warning together with other violations: no size bound is applied. The exit-session bound is the one of MA-MIN7-POST-BREAKOUT-WINDOW (every exit fills before that close)' }),
  Object.freeze({ id: 'MA-MIN7-RELDEPTH', phase: 'SETUP_QUALIFICATION', reference: 'relative depth = base depth (G-BASE-DEPTH: 52-week-high base start to the lowest low up to the setup close) / largest peak-to-trough decline of the benchmark closes between the base start and the setup date; measured only when that market decline is at least 10 % (the MA-MIN7-BASECOUNT-MARKET-RESET convention), otherwise not evaluable', why: 'B12 PDF 280 compares the stock\'s correction with the market correction over the same base, without a window or a floor; without a floor a 1 % market dip would make every base "many times the market"' }),
  Object.freeze({ id: 'MA-MIN7-ENTRY-DISTANCE', phase: 'ENTRY_EXECUTION', reference: 'fill distance = reference fill / pivot - 1, gap distance = fill-bar open / pivot - 1 (gap fills only), both split-invariant; buffer check = (fill-bar high - pivot) x splitAdj in raw dollars below 0.05 / 0.10 / 0.20 means a buy stop that far over the pivot would not have triggered on the fill bar; reporting buckets 0, (0, 1 %], (1, 2 %], (2, 3 %], (3, 5 %], above 5 %', why: 'B07 PDF 67 / 87 and B12 PDF 297: no chase "more than a few percent" over the pivot, unquantified; B07 PDF 40: 5, 10 or 20 cents, no magic number. The buckets only report; no bound is applied and no k is chosen' }),
]);

const BASE_MIN = SF7_MECHANICAL_SOURCE_BOUNDS.baseMinSessions.value;
const MARKET_CORRECTION = 0.10; // MA-MIN7-BASECOUNT-MARKET-RESET (convention, not a book number)
const MA_RESET = 200; // MA-MIN7-BASECOUNT-STOCK-RESET

/** Fingerprint of this package's pre-registration (bounds, assumptions, constants). */
export function sf7MechanicalRegistrySha256() {
  return crypto.createHash('sha256').update(JSON.stringify({ version: SF7_MECHANICAL_VERSION, bounds: SF7_MECHANICAL_SOURCE_BOUNDS, assumptions: SF7_MECHANICAL_MODEL_ASSUMPTIONS, baseMin: BASE_MIN, marketCorrection: MARKET_CORRECTION, maReset: MA_RESET, distanceBuckets: DISTANCE_BUCKETS })).digest('hex');
}

/** index of the last element with date <= d among the first n elements (dateOf(k) ascending), -1 if none */
const lastAtOrBefore = (dateOf, n, d) => { let lo = 0, hi = n - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (dateOf(m) <= d) { r = m; lo = m + 1; } else hi = m - 1; } return r; };
const atOrBefore = (dates, d) => lastAtOrBefore((k) => dates[k], dates.length, d);

/**
 * Market-correction lows of the benchmark (MA-MIN7-BASECOUNT-MARKET-RESET), point in time: anchor[p] is the index of
 * the lowest close of the latest correction of at least 10 % known at benchmark session p (closes 0..p only), -1 if none.
 * bench: benchIndex(...) of minervini-sf7.mjs ({ dates[], close: Map }).
 */
export function marketCorrectionAnchors(bench) {
  const n = bench.dates.length, anchor = new Int32Array(n);
  let runMax = -Infinity, inEp = false, trough = Infinity, troughPos = -1, last = -1;
  for (let p = 0; p < n; p++) {
    const c = bench.close.get(bench.dates[p]);
    if (fin(c)) {
      if (c > runMax) { runMax = c; inEp = false; trough = Infinity; troughPos = -1; } // a new high ends the correction
      else if (!inEp && c <= runMax * (1 - MARKET_CORRECTION) + 1e-12) { inEp = true; trough = c; troughPos = p; }
      else if (inEp && c < trough) { trough = c; troughPos = p; }
    }
    if (inEp) last = troughPos;
    anchor[p] = last;
  }
  return anchor;
}

const lastBelowCache = new WeakMap();
/** lastBelow[j] = last index k <= j whose close is below its 200-day mean (-1 if none); exact smaAt semantics. */
function lastBelowMa200(bars) {
  let a = lastBelowCache.get(bars); if (a) return a;
  a = new Int32Array(bars.length);
  let sum = 0, bad = 0, last = -1;
  for (let j = 0; j < bars.length; j++) {
    const v = bars[j].close; if (fin(v)) sum += v; else bad++;
    if (j >= MA_RESET) { const o = bars[j - MA_RESET].close; if (fin(o)) sum -= o; else bad--; }
    if (j >= MA_RESET - 1 && bad === 0 && fin(v) && v < sum / MA_RESET) last = j;
    a[j] = last;
  }
  lastBelowCache.set(bars, a);
  return a;
}

/**
 * G-BASECOUNT: base number of the setup on the close of bar s0 (MA-MIN7-BASECOUNT-*). Reads bars 0..s0 and benchmark
 * closes up to the setup date only. ctx: { bench, anchors } (benchIndex + marketCorrectionAnchors) or null (no market
 * reset available: the stock reset alone, the flag tells it).
 */
export function baseCountAt(bars, s0, ctx = null) {
  if (!(s0 >= 0 && s0 < bars.length)) return { status: 'NOT_EVALUABLE' };
  const stockReset = lastBelowMa200(bars)[s0];
  let marketIdx = -1, marketDate = null;
  if (ctx?.bench && ctx.anchors) {
    const p = atOrBefore(ctx.bench.dates, bars[s0].date), a = p >= 0 ? ctx.anchors[p] : -1;
    if (a >= 0) { marketDate = ctx.bench.dates[a]; marketIdx = lastAtOrBefore((k) => bars[k].date, s0 + 1, marketDate); }
  }
  const resetIdx = Math.max(stockReset, marketIdx);
  const reset = resetIdx < 0 ? 'NONE' : marketIdx >= stockReset ? 'MARKET_CORRECTION' : 'BELOW_MA200';
  const start = stockReset >= 0 ? stockReset + 1 : 0;
  let peak = -Infinity, peakIdx = -1, completed = 0;
  for (let k = start; k <= s0; k++) {
    const b = bars[k];
    if (peakIdx >= 0 && fin(b.close) && b.close > peak && k - peakIdx >= BASE_MIN && k > resetIdx) completed++;
    if (fin(b.close) && b.close > peak) { peak = b.close; peakIdx = k; }
  }
  const n = completed + 1, B = SF7_MECHANICAL_SOURCE_BOUNDS;
  return {
    status: 'EVIDENCE', baseNumber: n, reset, resetDate: resetIdx >= 0 ? bars[resetIdx].date : null, marketCorrectionLowDate: marketDate,
    baseCountLowerBound: stockReset < 0 && marketIdx < MA_RESET - 1, earlyBase: n <= B.earlyBaseMax.value, lateBase: n >= B.lateBaseFrom.value && n < B.likelyFailureFrom.value,
    lateStage: n >= B.lateStageFrom.value, likelyFailure: n >= B.likelyFailureFrom.value,
  };
}

/** Stage 2 start (MA-MIN7-STAGE2-START, as minervini-sf7#largestDeclineSignal): null without a pass at s0. */
function stage2Start(bars, s0, P) {
  if (trendTemplate(bars, s0, P).status !== 'TREND_TEMPLATE_1_7_PASS') return null;
  let start = s0; while (start > 0 && trendTemplate(bars, start - 1, P).status === 'TREND_TEMPLATE_1_7_PASS') start--;
  return start;
}

/**
 * G-TOPVOL (MA-MIN7-TOPVOL) for one trade: first down close from the entry session on whose volume is above every
 * session's volume since the Stage 2 start. A closed trade's scan ends the session before the exit session.
 */
export function topVolumeDecline(bars, trade, { P = MIN_PARAMS } = {}) {
  const dates = bars.map((b) => b.date), exact = (d) => { const k = atOrBefore(dates, d); return k >= 0 && dates[k] === d ? k : -1; };
  const e = exact(trade.entryDate), s0 = exact(trade.setupDate ?? trade.signalDate ?? trade.entryDate);
  if (e < 1 || s0 < 0 || s0 > e) return { status: 'NOT_EVALUABLE' };
  const start = stage2Start(bars, s0, P);
  if (start === null) return { status: 'NOT_IN_STAGE2_AT_SETUP', topVolumeDeclineBeforeExit: null };
  const last = trade.exitDate ? atOrBefore(dates, trade.exitDate) - 1 : bars.length - 1;
  let maxVol = 0; for (let k = start; k < e; k++) if (fin(bars[k].volume)) maxVol = Math.max(maxVol, bars[k].volume);
  for (let k = e; k <= last; k++) {
    const b = bars[k], a = bars[k - 1];
    if (!fin(b.volume)) continue;
    if (fin(b.close) && fin(a.close) && b.close < a.close && b.volume > maxVol) return { status: 'EVIDENCE', topVolumeDeclineBeforeExit: true, sessionsFromEntry: k - e, decline: b.close / a.close - 1 };
    maxVol = Math.max(maxVol, b.volume);
  }
  return { status: 'EVIDENCE', topVolumeDeclineBeforeExit: false };
}

/**
 * G-RELDEPTH (MA-MIN7-RELDEPTH) on the setup close s0: base depth / market decline over the base window. Reads bars
 * 0..s0 and benchmark closes between the base start and the setup date only.
 */
export function relativeBaseDepth(bars, s0, bench) {
  if (!bench) return { status: 'NOT_EVALUABLE' };
  const v = vcpContractions(bars, s0);
  if (v.status !== 'EVIDENCE_ONLY') return { status: 'NOT_EVALUABLE' };
  const hk = bars.findIndex((b) => b.date === v.base.highDate);
  let lo = Infinity; for (let k = hk; k <= s0; k++) if (fin(bars[k].low)) lo = Math.min(lo, bars[k].low);
  if (!(hk >= 0 && Number.isFinite(lo) && v.base.high > 0)) return { status: 'NOT_EVALUABLE' };
  const depth = 1 - lo / v.base.high, d0 = bars[hk].date, d1 = bars[s0].date;
  let peak = -Infinity, dd = 0, seen = 0;
  for (let p = Math.max(0, atOrBefore(bench.dates, d0)); p < bench.dates.length && bench.dates[p] <= d1; p++) {
    if (bench.dates[p] < d0) continue;
    const c = bench.close.get(bench.dates[p]); if (!fin(c) || !(c > 0)) continue;
    seen++; peak = Math.max(peak, c); dd = Math.max(dd, 1 - c / peak);
  }
  if (!seen) return { status: 'NOT_EVALUABLE' };
  if (dd < MARKET_CORRECTION - 1e-12) return { status: 'MARKET_DECLINE_BELOW_FLOOR', baseDepth: depth, marketDecline: dd, relativeDepth: null, aboveStrict: null, aboveLoose: null };
  const r = depth / dd, B = SF7_MECHANICAL_SOURCE_BOUNDS;
  return { status: 'EVIDENCE', baseDepth: depth, marketDecline: dd, relativeDepth: r, aboveStrict: r > B.relativeDepthStrict.value + 1e-12, aboveLoose: r > B.relativeDepthLoose.value + 1e-12 };
}

const DISTANCE_BUCKETS = Object.freeze([['0', 0, 0], ['0-1pct', 0, 0.01], ['1-2pct', 0.01, 0.02], ['2-3pct', 0.02, 0.03], ['3-5pct', 0.03, 0.05], ['above5pct', 0.05, Infinity]]);
const bucketOf = (x) => { if (!fin(x)) return 'unknown'; if (Math.abs(x) <= 1e-12) return '0'; if (x < 0) return 'belowPivot'; for (const [k, a, b] of DISTANCE_BUCKETS.slice(1)) if (x > a + 1e-12 && x <= b + 1e-12) return k; return 'above5pct'; };
const emptyBuckets = () => Object.fromEntries([...DISTANCE_BUCKETS.map(([k]) => [k, 0]), ['belowPivot', 0], ['unknown', 0]]);

/**
 * G-CHASE / G-BUFFER (MA-MIN7-ENTRY-DISTANCE) over the reference trades: reads only the fill bar of each trade.
 * Counts only; no bound is applied.
 */
export function entryDistanceTally(trades, byId) {
  const fill = emptyBuckets(), gap = emptyBuckets(), byBasis = {};
  const buffer = Object.fromEntries(SF7_MECHANICAL_SOURCE_BOUNDS.pivotBufferUsd.value.map((c) => [`noTriggerAt${Math.round(c * 100)}c`, 0]));
  let bufferEvaluated = 0, bufferUnknown = 0;
  for (const t of trades) {
    byBasis[t.entryBasis] = (byBasis[t.entryBasis] || 0) + 1;
    const d = fin(t.entryFill) && fin(t.pivot) && t.pivot > 0 ? t.entryFill / t.pivot - 1 : null;
    fill[bucketOf(d)]++;
    const bars = byId.get(t.id)?.bars, b = bars ? bars.find((x) => x.date === t.entryDate) : null;
    if (t.entryBasis === 'OPEN_GAP_AT_OR_ABOVE_PIVOT') gap[bucketOf(b && fin(b.open) && fin(t.pivot) && t.pivot > 0 ? b.open / t.pivot - 1 : null)]++;
    const adj = b && fin(b.splitAdj) && b.splitAdj > 0 ? b.splitAdj : null;
    if (!(b && fin(b.high) && fin(t.pivot) && adj)) { bufferUnknown++; continue; }
    bufferEvaluated++;
    const excess = (b.high - t.pivot) * adj; // raw dollars over the pivot on the fill bar
    for (const c of SF7_MECHANICAL_SOURCE_BOUNDS.pivotBufferUsd.value) if (excess < c - 1e-9) buffer[`noTriggerAt${Math.round(c * 100)}c`]++;
  }
  return { trades: trades.length, entryBasis: byBasis, fillAbovePivot: fill, gapOpenAbovePivot: gap, buyStopBuffer: { evaluated: bufferEvaluated, unknown: bufferUnknown, ...buffer }, rule: 'B07 PDF 40 / 67 / 87, B12 PDF 297 (MA-MIN7-ENTRY-DISTANCE), counts only' };
}

/** Bucket of a base number for public tallies. */
export const baseBucket = (r) => (r?.status !== 'EVIDENCE' ? 'unknown' : r.baseNumber >= 5 ? '5+' : String(r.baseNumber));

/** Tally of baseCountAt rows (counts only). */
export function baseCountTally(rows) {
  const by = { 1: 0, 2: 0, 3: 0, 4: 0, '5+': 0, unknown: 0 }, reset = {};
  let lowerBound = 0;
  for (const r of rows) { by[baseBucket(r)]++; if (r.status === 'EVIDENCE') { reset[r.reset] = (reset[r.reset] || 0) + 1; if (r.baseCountLowerBound) lowerBound++; } }
  const n = (f) => rows.filter((r) => r.status === 'EVIDENCE' && r[f]).length;
  return { baseNumber: by, reset, lowerBound, earlyBase: n('earlyBase'), lateBase: n('lateBase'), lateStage: n('lateStage'), likelyFailure: n('likelyFailure') };
}

/** Tally of topVolumeDecline / relativeBaseDepth rows: status counts plus true / false of one field. */
export function fieldTally(rows, field) {
  const status = {}; for (const r of rows) status[r.status] = (status[r.status] || 0) + 1;
  return { status, true: rows.filter((r) => r[field] === true).length, false: rows.filter((r) => r[field] === false).length };
}

/**
 * F7-B03-225-092 diagnostic: the scheduled signals of a research exit variant counted by the base number of their
 * trade's setup (baseOf(trade) -> baseCountAt row). Counts only; no signal is suppressed.
 */
export function signalsByBaseNumber(trades, baseOf) {
  const out = { 1: 0, 2: 0, 3: 0, 4: 0, '5+': 0, unknown: 0 };
  for (const t of trades) for (const e of t.events ?? []) if (e.type === 'EXIT_SCHEDULED_NEXT_OPEN' && e.rule === 'SF7_EXIT_VARIANT') out[baseBucket(baseOf(t))]++;
  return out;
}
