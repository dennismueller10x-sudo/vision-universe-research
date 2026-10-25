/**
 * Supertrader 7.0 – Minervini: the remaining mechanically provable source functions of the E7-2 work list
 * (docs/SUPERTRADER_7_MINERVINI_MECHANICAL_1_4.md, package sf7-minervini-1.4.0). DIAGNOSTICS ONLY: counts on the
 * reference trades, never a gate, never a filter, never an exit, never a fill, never a variant choice. The 4.0 lifecycle
 * (minervini-lifecycle.mjs, minervini-execution.mjs, fingerprint c834b227…) and the 7.0 setup / exit variants are not
 * touched; this file is not part of run-sf4-lifecycle#FILES (test SF7-EXIT-FINGERPRINTS).
 *
 * Each block names the finding, its German paraphrase exactly as recorded in evidence/MINERVINI-SF7-FINDINGS.json
 * (paraphraseDe, a paraphrase of the Indonesian B12 / B07 or Vietnamese B03 translation, never a quotation) and,
 * separately, the MODEL READING of this file. Every model reading and every number the books do not print is a declared
 * model assumption (SF7_MECHANICAL_MODEL_ASSUMPTIONS, MA-MIN7-*); none is a Minervini rule, nothing is SOURCE_EXACT.
 *
 *  - G-BASECOUNT
 *    F7-B03-207-082 (B03 PDF 207): "Basiszählung: 1. und 2. Basis nach einer Marktkorrektur sind gut; 3. und 4. Basis
 *      funktionieren noch, aber spät im Zyklus (eher für Swing); 5./6. Basis scheitern wahrscheinlich – früh in Stärke
 *      verkaufen."
 *    F7-B12-116-203 (B12 PDF 116): "Ab Basis 4 oder 5 ist der Trend spät; plötzliche Basisfehlschläge häufiger."
 *    F7-B12-116-205 (B12 PDF 116): "Basis 1 und 2 entstehen meist aus Marktkorrekturen und sind der beste
 *      Einstiegszeitpunkt; Basis 3 meist noch handelbar."
 *    Model reading: base detection, the reset and the count are MA-MIN7-BASECOUNT-*; the books define neither a base
 *    nor the reset.
 *  - G-BASECOUNT x climax
 *    F7-B03-225-092 (B03 PDF 225): "Ausnahme erste Basis: dieselbe 'Erschöpfungs'-Aktion (≥70% Auftage, Serie starker
 *      Tage) aus der ersten Basis ist bullish, nur nach der letzten Basis ein Verkaufssignal; deshalb muss die Basiszahl
 *      bekannt sein."
 *    Model reading: "the last base" is known only in hindsight, so it is NOT mechanised; the diagnostic only counts the
 *    signals of the research exit variants EXIT-CLIMAX / EXIT-CLIMAX-UPCLOSES by the point-in-time base number of their
 *    trade (1 vs. 2, 3, 4, 5+). No signal is suppressed (that would change trades).
 *  - G-TOPVOL
 *    F7-B03-217-087 (B03 PDF 217): "Weitere Top-Signale: Umkehr auf hohem Volumen; Volumen-Churning ohne
 *      Kursfortschritt; Rückgang mit größtem Volumen seit Trendbeginn."
 *    Model reading (MA-MIN7-TOPVOL): first post-entry down close whose volume is the highest since the trend start,
 *    before the exit session. The books do not date the trend start: two windows are reported side by side, none
 *    chosen. Churning and the high-volume reversal stay QUALITATIVE.
 *  - G-RELDEPTH
 *    F7-B12-280-275 (B12 PDF 280): "Aktien meiden, die mehr als das Zwei- bis Dreifache der Marktkorrektur korrigieren."
 *    Model reading (MA-MIN7-RELDEPTH): stock decline / market decline from closes on both sides, in two windows reported
 *    side by side, flagged above 2x and above 3x. Diagnostic only; the setup filter stays a deferred variant.
 *  - G-CHASE / G-BUFFER
 *    F7-B07-067-140 (B07 PDF 67): "Gaps werden grundsätzlich nicht gejagt; liegt der Gap einige Prozent über dem
 *      Kaufpunkt, kein Kauf."
 *    F7-B07-087-150 (B07 PDF 87): "Liegt die Aktie einige Prozent über dem Kaufpunkt, wird nicht mehr gekauft/aufgestockt;
 *      kein Hinterherlaufen."
 *    F7-B12-297-283 (B12 PDF 297): "So nah wie möglich am Pivot kaufen, nicht mehr als einige Prozentpunkte darüber
 *      hinterherjagen."
 *    F7-B07-040-117 (B07 PDF 40): "Nicht 1 Cent über dem Kaufpunkt kaufen, sondern warten, bis 5, 10 oder 20 Cent über
 *      dem Pivot gehandelt wird; keine magische Zahl."
 *    Model reading (MA-MIN7-ENTRY-DISTANCE): fill and opening-gap distance over the pivot in reporting buckets, and the
 *    REF fills a buy stop 5 / 10 / 20 cents over the pivot would not have triggered on the fill bar. "Einige Prozent" and
 *    the buffer are unquantified: the buckets are reporting steps, not thresholds, and no k is chosen.
 */
import crypto from 'node:crypto';
import { fin } from '../common/series.mjs';
import { trendTemplate, MIN_PARAMS } from '../methods/minervini.mjs';
import { vcpContractions } from './minervini-components.mjs';

export const SF7_MECHANICAL_VERSION = 'sf7-minervini-mechanical-1.1.0'; // 1.1.0: review #940 (setup session is no completed base, two trend-start windows for G-TOPVOL, close-based relative depth in two windows, gap reading from the fill-bar open incl. limit fills, uncertainty flags with direction); 1.0.0: first package

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
  Object.freeze({ id: 'MA-MIN7-BASECOUNT-BASE', phase: 'SETUP_QUALIFICATION', reference: 'a base is completed by the first close above the running closing high (highest close since the scan start, updated only by a strictly higher close) at least 20 sessions after that closing high was set, on a session BEFORE the setup session; a shorter pause is no base; no depth bound (flat bases count). A close on the setup session above the running closing high is not a completed base: the setup still closes below its pivot, so that close belongs to the setup\'s own base', why: 'the books name bases and their number, not their detection; 20 sessions is the printed lower end of a Stage 2 base (B12 PDF 115, SF7_MECHANICAL_SOURCE_BOUNDS.baseMinSessions); closes on both sides, because an intraday high above the base high on the breakout attempt would otherwise restart the base one session before its breakout close; the pivot is an intraday level, so a setup close can lie above an older closing high without any breakout' }),
  Object.freeze({ id: 'MA-MIN7-BASECOUNT-MARKET-RESET', phase: 'SETUP_QUALIFICATION', reference: 'market correction = the benchmark (snapshot SPY, split-adjusted closes) closes at least 10 % below its highest prior close; the count restarts at the lowest benchmark close of the latest such correction known on the setup date (point in time: benchmark closes up to the setup date only); the base whose breakout follows that low is base 1', why: 'B03 PDF 207 / B12 PDF 116 count bases after a market correction without sizing the correction: 10 % is a convention, not a book number (ABSENT_FROM_MATERIAL); the low is the session the correction is deepest, so a base formed during the correction is base 1 (model reading of B12 PDF 116: bases 1 and 2 mostly come out of market corrections)' }),
  Object.freeze({ id: 'MA-MIN7-BASECOUNT-STOCK-RESET', phase: 'SETUP_QUALIFICATION', reference: 'the count also restarts after the last close of the security below its 200-day mean (Trend Template criterion 1 fails: no Stage 2). Without such a close since the first computable 200-day mean the count is flagged uncertain: undercountPossible when no reset at all lies in the data (bases before the data start are unseen), overcountPossible when at least one base was counted (the running closing high before the data start is unknown, and a close below the 200-day mean in the first 199 sessions, where the mean is not computable, would restart the count later)', why: 'bases are counted inside one Stage 2 advance (B12 PDF 115-116); the books do not date its start; the 200-day line is the source\'s own Stage 2 boundary (MIN-SF-TT-1). The Trend Template run (MA-MIN7-STAGE2-START) is not used here because criterion 5 (close above MA50) fails inside most bases. The two flags state the direction of the possible error instead of one "lower bound"' }),
  Object.freeze({ id: 'MA-MIN7-BASECOUNT-CURRENT', phase: 'SETUP_QUALIFICATION', reference: 'base number of a setup = completed bases (MA-MIN7-BASECOUNT-BASE, breakout close after the reset and before the setup session) + 1 (the setup\'s own base)', why: 'a setup is a buy point out of a base (B12 PDF 297); counting it makes base 1 the first base after the reset, as in B03 PDF 207' }),
  Object.freeze({ id: 'MA-MIN7-TOPVOL', phase: 'EXIT_CONDITIONS', reference: 'top-volume decline = a down close (close below the prior close) whose volume is above the volume of every session since the trend start, scanned from the entry session to the session before the exit session of a closed trade (to the data end for an open trade). The trend start is reported in two windows side by side, none chosen and none selected by a result: TREND_TEMPLATE_RUN = first session of the uninterrupted Trend Template 1-7 run containing the setup close (MA-MIN7-STAGE2-START; usually starts after the last close below the 50-day mean inside the setup base, so it reaches back only weeks), ABOVE_MA200_RUN = the session after the last close below the 200-day mean (the Stage 2 boundary of MA-MIN7-BASECOUNT-STOCK-RESET; windowTruncated when no such close lies in the data). A window is not evaluable without Stage 2 at the setup (Trend Template fails, resp. setup close below or no computable 200-day mean); both are not evaluable when the trade exits on its entry session (no session before the exit)', why: 'B03 PDF 217 names the decline on the largest volume since the start of the trend without dating that start; B03 PDF 219 calls even a 4-5 % decline on it a warning together with other violations: no size bound is applied. The exit-session bound is the one of MA-MIN7-POST-BREAKOUT-WINDOW (every exit fills before that close)' }),
  Object.freeze({ id: 'MA-MIN7-RELDEPTH', phase: 'SETUP_QUALIFICATION', reference: 'relative depth = stock decline / benchmark decline, both from closes (split-adjusted), over the base window from the 52-week-high base start (G-BASE-DEPTH) to the setup date, in two variants reported side by side, none chosen: SAME_WINDOW = largest peak-to-trough decline inside the window on both sides; TRAILING_HIGH = largest decline below the trailing 252-session closing high, taken over the sessions of the window, on both sides (captures a market correction already running at the base start). Each variant is measured only when its market decline is at least 10 % (the MA-MIN7-BASECOUNT-MARKET-RESET convention), otherwise not evaluable', why: 'B12 PDF 280 compares the stock\'s correction with the market correction, without a window, a price basis or a floor; closes on both sides keep the price basis equal (the intraday G-BASE-DEPTH would inflate the ratio against a close-based market decline); without a floor a 1 % market dip would make every base "many times the market"' }),
  Object.freeze({ id: 'MA-MIN7-ENTRY-DISTANCE', phase: 'ENTRY_EXECUTION', reference: 'fill distance = reference fill / pivot - 1; gap distance = fill-bar open / pivot - 1 for every REF fill whose fill-bar open is at or above the pivot (OPEN_GAP_AT_OR_ABOVE_PIVOT and LIMIT_FILL_AFTER_OPEN), both split-invariant; buy orders the engine did not execute because the open lay above the limit (counts.notExecutedAboveLimit) are reported as a count only, they are no trades; buffer check = (fill-bar high - pivot) x splitAdj in raw dollars below 0.05 / 0.10 / 0.20 means a buy stop that far over the pivot would not have triggered on the fill bar; reporting buckets 0, (0, 1 %], (1, 2 %], (2, 3 %], (3, 5 %], above 5 %', why: 'B07 PDF 67 / 87 and B12 PDF 297: no chase "more than a few percent" over the pivot, unquantified; B07 PDF 40: 5, 10 or 20 cents, no magic number. The buckets only report; no bound is applied and no k is chosen. The gap reading uses the fill bar\'s open, not the engine\'s fill basis, so the largest gaps (filled at the limit) are not dropped; the engine itself is not touched' }),
]);

const BASE_MIN = SF7_MECHANICAL_SOURCE_BOUNDS.baseMinSessions.value;
const MARKET_CORRECTION = 0.10; // MA-MIN7-BASECOUNT-MARKET-RESET (convention, not a book number)
const MA_RESET = 200; // MA-MIN7-BASECOUNT-STOCK-RESET
const TRAILING_HIGH_SESSIONS = 252; // MA-MIN7-RELDEPTH TRAILING_HIGH (the 52-week window of G-BASE-DEPTH)
const DISTANCE_BUCKETS = Object.freeze([['0', 0, 0], ['0-1pct', 0, 0.01], ['1-2pct', 0.01, 0.02], ['2-3pct', 0.02, 0.03], ['3-5pct', 0.03, 0.05], ['above5pct', 0.05, Infinity]]);

/** Fingerprint of this package's pre-registration (bounds, assumptions, constants). */
export function sf7MechanicalRegistrySha256() {
  return crypto.createHash('sha256').update(JSON.stringify({ version: SF7_MECHANICAL_VERSION, bounds: SF7_MECHANICAL_SOURCE_BOUNDS, assumptions: SF7_MECHANICAL_MODEL_ASSUMPTIONS, baseMin: BASE_MIN, marketCorrection: MARKET_CORRECTION, maReset: MA_RESET, trailingHighSessions: TRAILING_HIGH_SESSIONS, distanceBuckets: DISTANCE_BUCKETS })).digest('hex');
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
/**
 * lastBelow[j] = last index k <= j whose close is below its 200-day mean (-1 if none), with exact smaAt semantics;
 * computable[j] = the 200-day mean of bar j is defined.
 */
function ma200State(bars) {
  let a = lastBelowCache.get(bars); if (a) return a;
  const lastBelow = new Int32Array(bars.length), computable = new Uint8Array(bars.length);
  let sum = 0, bad = 0, last = -1;
  for (let j = 0; j < bars.length; j++) {
    const v = bars[j].close; if (fin(v)) sum += v; else bad++;
    if (j >= MA_RESET) { const o = bars[j - MA_RESET].close; if (fin(o)) sum -= o; else bad--; }
    if (j >= MA_RESET - 1 && bad === 0) { computable[j] = 1; if (fin(v) && v < sum / MA_RESET) last = j; }
    lastBelow[j] = last;
  }
  a = { lastBelow, computable };
  lastBelowCache.set(bars, a);
  return a;
}

/**
 * G-BASECOUNT: base number of the setup on the close of bar s0 (MA-MIN7-BASECOUNT-*). Reads bars 0..s0 and benchmark
 * closes up to the setup date only. ctx: { bench, anchors } (benchIndex + marketCorrectionAnchors) or null (no market
 * reset available: the stock reset alone, the flags tell it).
 */
export function baseCountAt(bars, s0, ctx = null) {
  if (!(s0 >= 0 && s0 < bars.length)) return { status: 'NOT_EVALUABLE' };
  const stockReset = ma200State(bars).lastBelow[s0];
  let marketIdx = -1, marketDate = null;
  if (ctx?.bench && ctx.anchors) {
    const p = atOrBefore(ctx.bench.dates, bars[s0].date), a = p >= 0 ? ctx.anchors[p] : -1;
    if (a >= 0) { marketDate = ctx.bench.dates[a]; marketIdx = lastAtOrBefore((k) => bars[k].date, s0 + 1, marketDate); }
  }
  const resetIdx = Math.max(stockReset, marketIdx);
  const reset = resetIdx < 0 ? 'NONE' : marketIdx >= stockReset ? 'MARKET_CORRECTION' : 'BELOW_MA200';
  const start = stockReset >= 0 ? stockReset + 1 : 0;
  let peak = -Infinity, peakIdx = -1, completed = 0;
  // completed bases break out strictly before the setup session (MA-MIN7-BASECOUNT-BASE): bar s0 is the setup's own base
  for (let k = start; k < s0; k++) {
    const b = bars[k];
    if (peakIdx >= 0 && fin(b.close) && b.close > peak && k - peakIdx >= BASE_MIN && k > resetIdx) completed++;
    if (fin(b.close) && b.close > peak) { peak = b.close; peakIdx = k; }
  }
  const n = completed + 1, B = SF7_MECHANICAL_SOURCE_BOUNDS;
  const reasons = [];
  if (stockReset < 0 && marketIdx < 0) reasons.push('NO_RESET_IN_DATA');
  if (stockReset < 0 && completed > 0) reasons.push('RUNNING_HIGH_BEFORE_DATA_UNKNOWN');
  if (stockReset < 0 && completed > 0 && resetIdx < MA_RESET - 1) reasons.push('MA200_NOT_COMPUTABLE_AFTER_RESET');
  return {
    status: 'EVIDENCE', baseNumber: n, reset, resetDate: resetIdx >= 0 ? bars[resetIdx].date : null, marketCorrectionLowDate: marketDate,
    baseCountUncertain: reasons.length > 0, undercountPossible: reasons.includes('NO_RESET_IN_DATA'), overcountPossible: completed > 0 && stockReset < 0, uncertaintyReasons: reasons,
    earlyBase: n <= B.earlyBaseMax.value, lateBase: n >= B.lateBaseFrom.value && n < B.likelyFailureFrom.value,
    lateStage: n >= B.lateStageFrom.value, likelyFailure: n >= B.likelyFailureFrom.value,
  };
}

/** Stage 2 start (MA-MIN7-STAGE2-START, as minervini-sf7#largestDeclineSignal): null without a pass at s0. */
function trendTemplateRunStart(bars, s0, P) {
  if (trendTemplate(bars, s0, P).status !== 'TREND_TEMPLATE_1_7_PASS') return null;
  let start = s0; while (start > 0 && trendTemplate(bars, start - 1, P).status === 'TREND_TEMPLATE_1_7_PASS') start--;
  return start;
}

/** first down close in e..last whose volume is above every volume in start..(that session - 1) */
function topVolumeScan(bars, start, e, last) {
  let maxVol = 0; for (let k = start; k < e; k++) if (fin(bars[k].volume)) maxVol = Math.max(maxVol, bars[k].volume);
  for (let k = e; k <= last; k++) {
    const b = bars[k], a = bars[k - 1];
    if (!fin(b.volume)) continue;
    if (fin(b.close) && fin(a.close) && b.close < a.close && b.volume > maxVol) return { status: 'EVIDENCE', topVolumeDeclineBeforeExit: true, sessionsFromEntry: k - e, decline: b.close / a.close - 1, windowStartDate: bars[start].date };
    maxVol = Math.max(maxVol, b.volume);
  }
  return { status: 'EVIDENCE', topVolumeDeclineBeforeExit: false, windowStartDate: bars[start].date };
}

/**
 * G-TOPVOL (MA-MIN7-TOPVOL) for one trade, in both trend-start windows: first down close from the entry session on
 * whose volume is above every session's volume since the window start. A closed trade's scan ends the session before
 * the exit session. Reads bars up to that session only; the windows start at or before the setup close.
 */
export function topVolumeDecline(bars, trade, { P = MIN_PARAMS } = {}) {
  const dates = bars.map((b) => b.date), exact = (d) => { const k = atOrBefore(dates, d); return k >= 0 && dates[k] === d ? k : -1; };
  const e = exact(trade.entryDate), s0 = exact(trade.setupDate ?? trade.signalDate ?? trade.entryDate);
  if (e < 1 || s0 < 0 || s0 > e) return { status: 'NOT_EVALUABLE', trendTemplateRun: { status: 'NOT_EVALUABLE' }, aboveMa200Run: { status: 'NOT_EVALUABLE' } };
  const last = trade.exitDate ? atOrBefore(dates, trade.exitDate) - 1 : bars.length - 1;
  if (last < e) { const x = { status: 'NO_SESSION_BEFORE_EXIT', topVolumeDeclineBeforeExit: null }; return { status: 'EVIDENCE', trendTemplateRun: x, aboveMa200Run: x }; } // exit on the entry session
  const tt = trendTemplateRunStart(bars, s0, P);
  const trendTemplateRun = tt === null ? { status: 'NOT_IN_STAGE2_AT_SETUP', topVolumeDeclineBeforeExit: null } : topVolumeScan(bars, tt, e, last);
  const m = ma200State(bars);
  let aboveMa200Run;
  if (!m.computable[s0] || m.lastBelow[s0] === s0) aboveMa200Run = { status: 'NOT_IN_STAGE2_AT_SETUP', topVolumeDeclineBeforeExit: null };
  else aboveMa200Run = { ...topVolumeScan(bars, m.lastBelow[s0] + 1, e, last), windowTruncated: m.lastBelow[s0] < 0 };
  return { status: 'EVIDENCE', trendTemplateRun, aboveMa200Run };
}

/** largest peak-to-trough decline of the values in order (positive values only); null if none */
const peakToTrough = (vals) => { let peak = -Infinity, dd = 0, seen = 0; for (const c of vals) { if (!(fin(c) && c > 0)) continue; seen++; peak = Math.max(peak, c); dd = Math.max(dd, 1 - c / peak); } return seen ? dd : null; };
/** largest decline below the trailing closing high (lookback TRAILING_HIGH_SESSIONS) over positions from..to of closes */
const belowTrailingHigh = (closes, from, to) => {
  let dd = null;
  for (let p = Math.max(0, from); p <= to; p++) {
    const c = closes[p]; if (!(fin(c) && c > 0)) continue;
    let hi = -Infinity; for (let q = Math.max(0, p - TRAILING_HIGH_SESSIONS + 1); q <= p; q++) if (fin(closes[q])) hi = Math.max(hi, closes[q]);
    dd = Math.max(dd ?? 0, 1 - c / hi);
  }
  return dd;
};
const relativeOf = (stock, market) => {
  if (stock === null || market === null) return { status: 'NOT_EVALUABLE' };
  if (market < MARKET_CORRECTION - 1e-12) return { status: 'MARKET_DECLINE_BELOW_FLOOR', stockDecline: stock, marketDecline: market, relativeDepth: null, aboveStrict: null, aboveLoose: null };
  const r = stock / market, B = SF7_MECHANICAL_SOURCE_BOUNDS;
  return { status: 'EVIDENCE', stockDecline: stock, marketDecline: market, relativeDepth: r, aboveStrict: r > B.relativeDepthStrict.value + 1e-12, aboveLoose: r > B.relativeDepthLoose.value + 1e-12 };
};

/**
 * G-RELDEPTH (MA-MIN7-RELDEPTH) on the setup close s0, variants SAME_WINDOW and TRAILING_HIGH, closes on both sides.
 * Reads bars 0..s0 and benchmark closes up to the setup date only.
 */
export function relativeBaseDepth(bars, s0, bench) {
  const none = { status: 'NOT_EVALUABLE', sameWindow: { status: 'NOT_EVALUABLE' }, trailingHigh: { status: 'NOT_EVALUABLE' } };
  if (!bench || !(s0 >= 0 && s0 < bars.length)) return none;
  const v = vcpContractions(bars, s0);
  if (v.status !== 'EVIDENCE_ONLY') return none;
  const hk = bars.findIndex((b) => b.date === v.base.highDate);
  if (!(hk >= 0 && hk <= s0)) return none;
  const d0 = bars[hk].date, d1 = bars[s0].date;
  const p1 = atOrBefore(bench.dates, d1); if (p1 < 0) return none;
  const p0 = atOrBefore(bench.dates, d0), from = bench.dates[Math.max(0, p0)] >= d0 ? Math.max(0, p0) : p0 + 1;
  if (from > p1) return none;
  const sc = bars.slice(0, s0 + 1).map((b) => b.close), mc = bench.dates.slice(0, p1 + 1).map((d) => bench.close.get(d));
  const sameWindow = relativeOf(peakToTrough(sc.slice(hk)), peakToTrough(mc.slice(from)));
  const trailingHigh = relativeOf(belowTrailingHigh(sc, hk, s0), belowTrailingHigh(mc, from, p1));
  return { status: 'EVIDENCE', baseStartDate: d0, sameWindow, trailingHigh };
}

const bucketOf = (x) => { if (!fin(x)) return 'unknown'; if (Math.abs(x) <= 1e-12) return '0'; if (x < 0) return 'belowPivot'; for (const [k, a, b] of DISTANCE_BUCKETS.slice(1)) if (x > a + 1e-12 && x <= b + 1e-12) return k; return 'above5pct'; };
const emptyBuckets = () => Object.fromEntries([...DISTANCE_BUCKETS.map(([k]) => [k, 0]), ['belowPivot', 0], ['unknown', 0]]);

/**
 * G-CHASE / G-BUFFER (MA-MIN7-ENTRY-DISTANCE) over the reference trades: reads only the fill bar of each trade.
 * counts: the REF run's counts (notExecutedAboveLimit is reported as is). Counts only; no bound is applied.
 */
export function entryDistanceTally(trades, byId, counts = null) {
  const fill = emptyBuckets(), gap = emptyBuckets(), byBasis = {}, gapByBasis = {};
  const buffer = Object.fromEntries(SF7_MECHANICAL_SOURCE_BOUNDS.pivotBufferUsd.value.map((c) => [`noTriggerAt${Math.round(c * 100)}c`, 0]));
  let bufferEvaluated = 0, bufferUnknown = 0, gapUnknown = 0;
  for (const t of trades) {
    byBasis[t.entryBasis] = (byBasis[t.entryBasis] || 0) + 1;
    const pivotOk = fin(t.pivot) && t.pivot > 0;
    fill[bucketOf(fin(t.entryFill) && pivotOk ? t.entryFill / t.pivot - 1 : null)]++;
    const bars = byId.get(t.id)?.bars, b = bars ? bars.find((x) => x.date === t.entryDate) : null;
    // gap = the fill bar opened at or above the pivot, whatever the engine's fill basis (open, or the limit after the open)
    if (!(b && fin(b.open) && pivotOk)) gapUnknown++;
    else if (b.open >= t.pivot) { gap[bucketOf(b.open / t.pivot - 1)]++; gapByBasis[t.entryBasis] = (gapByBasis[t.entryBasis] || 0) + 1; }
    const adj = b && fin(b.splitAdj) && b.splitAdj > 0 ? b.splitAdj : null;
    if (!(b && fin(b.high) && pivotOk && adj)) { bufferUnknown++; continue; }
    bufferEvaluated++;
    const excess = (b.high - t.pivot) * adj; // raw dollars over the pivot on the fill bar
    for (const c of SF7_MECHANICAL_SOURCE_BOUNDS.pivotBufferUsd.value) if (excess < c - 1e-9) buffer[`noTriggerAt${Math.round(c * 100)}c`]++;
  }
  return {
    trades: trades.length, entryBasis: byBasis, fillAbovePivot: fill,
    gapOpenAbovePivot: { ...gap, unknown: gap.unknown + gapUnknown, byEntryBasis: gapByBasis },
    ordersNotExecutedAboveLimit: fin(counts?.notExecutedAboveLimit) ? counts.notExecutedAboveLimit : null,
    buyStopBuffer: { evaluated: bufferEvaluated, unknown: bufferUnknown, ...buffer },
    rule: 'B07 PDF 40 / 67 / 87, B12 PDF 297 (MA-MIN7-ENTRY-DISTANCE), counts only',
  };
}

/** Bucket of a base number for public tallies. */
export const baseBucket = (r) => (r?.status !== 'EVIDENCE' ? 'unknown' : r.baseNumber >= 5 ? '5+' : String(r.baseNumber));

/** Tally of baseCountAt rows (counts only). */
export function baseCountTally(rows) {
  const by = { 1: 0, 2: 0, 3: 0, 4: 0, '5+': 0, unknown: 0 }, reset = {};
  for (const r of rows) { by[baseBucket(r)]++; if (r.status === 'EVIDENCE') reset[r.reset] = (reset[r.reset] || 0) + 1; }
  const n = (f) => rows.filter((r) => r.status === 'EVIDENCE' && r[f]).length;
  return { baseNumber: by, reset, uncertain: n('baseCountUncertain'), undercountPossible: n('undercountPossible'), overcountPossible: n('overcountPossible'), earlyBase: n('earlyBase'), lateBase: n('lateBase'), lateStage: n('lateStage'), likelyFailure: n('likelyFailure') };
}

/** Tally of diagnostic rows: status counts plus true / false of one field. */
export function fieldTally(rows, field) {
  const status = {}; for (const r of rows) status[r.status] = (status[r.status] || 0) + 1;
  return { status, true: rows.filter((r) => r[field] === true).length, false: rows.filter((r) => r[field] === false).length };
}

/**
 * F7-B03-225-092 diagnostic: the scheduled signals of a research exit variant counted by the point-in-time base number
 * of their trade's setup (baseOf(trade) -> baseCountAt row). Counts only; no signal is suppressed; "the last base" of
 * the paraphrase is not mechanised (known only in hindsight).
 */
export function signalsByBaseNumber(trades, baseOf) {
  const out = { 1: 0, 2: 0, 3: 0, 4: 0, '5+': 0, unknown: 0 };
  for (const t of trades) for (const e of t.events ?? []) if (e.type === 'EXIT_SCHEDULED_NEXT_OPEN' && e.rule === 'SF7_EXIT_VARIANT') out[baseBucket(baseOf(t))]++;
  return out;
}
