/**
 * Mark Minervini SEPA / VCP screen (C06) and Power Play screen (C07) (contracts/minervini.mjs).
 * Source: #709 B12 (2013, Indonesian machine-like translation), B07 (2015), B03 (2017). Every Minervini rule in #709 is
 * MEDIUM confidence with unchecked English wording; HARD rules need original or explicit web corroboration. Therefore:
 *  - nothing here is SOURCE_EXACT; thresholds are used as printed and flagged translationUnverified;
 *  - the machine only SCREENS (Trend Template criteria 1-7; Power Play run-up / correction / tightness);
 *  - IBD RS (criterion 8) is DATA_BLOCKED: a VU percentile may be shown as a proxy, never as a gate;
 *  - fundamentals, VCP pattern, pivot, stop, size and sells stay with the reviewer (SEPA: manual relative priority,
 *    MIN-PROCESS-04). No hard fundamental filter, no fixed VCP count, no 3R obligation (#709 false hard rules).
 */
import { fin, smaAt } from '../common/series.mjs';

export const MINERVINI_VERSION = 'sf-minervini-1.0.0';
export const MIN_PARAMS = Object.freeze({
  ma: [50, 150, 200],          // MIN-TT-01..05
  ma200RisingSessions: 21,     // MIN-TT-03 "at least one month" (derivation: 21 sessions)
  yearSessions: 252,           // MIN-TT-06 / 07 "52-week" (derivation)
  aboveLow: 0.30,              // MIN-TT-06 at least 30 % above the 52-week low
  belowHigh: 0.25,             // MIN-TT-07 at most 25 % below the 52-week high
  maxStopPct: 0.10,            // MIN-MM-STOP-02 maximum planned loss (flag only)
  ppMultiple: 2.0,             // MIN-PP-02 at least +100 %
  ppMaxSessions: 40,           // MIN-PP-02 "less than eight weeks" = fewer than 40 sessions (derivation)
  ppMaxCorrection: 0.25,       // MIN-PP-04 outer bound of "20-25 %"
  ppReviewCorrection: 0.20,    // MIN-PP-04 inner bound: (20 %, 25 %] goes to review
  ppTight: 0.10,               // MIN-PP-05 "very tight, at most 10 %"
});
const TRANSL = Object.freeze({ translationUnverified: true, clearance: 'REQUIRES_ORIGINAL_OR_EXPLICIT_WEB_CORROBORATION' });

function extreme(bars, i, n, field, cmp) {
  if (i < n - 1) return null;
  let v = null; for (let k = i - n + 1; k <= i; k++) { const x = bars[k][field]; if (!fin(x)) return null; if (v === null || cmp(x, v)) v = x; }
  return v;
}

/** MIN-SF-TT-1..7 on bar i (close of i). IPO scope: insufficient history is reported, not failed (MIN-MM-IPO-01). */
export function trendTemplate(bars, i, P = MIN_PARAMS) {
  const need = Math.max(P.ma[2] + P.ma200RisingSessions, P.yearSessions);
  if (i < need - 1) return { status: 'INSUFFICIENT_HISTORY_IPO_SCOPE', pass: false, criteria: null, ...TRANSL };
  const c = bars[i].close, m50 = smaAt(bars, i, P.ma[0]), m150 = smaAt(bars, i, P.ma[1]), m200 = smaAt(bars, i, P.ma[2]), m200Prev = smaAt(bars, i - P.ma200RisingSessions, P.ma[2]);
  const lo = extreme(bars, i, P.yearSessions, 'low', (a, b) => a < b), hi = extreme(bars, i, P.yearSessions, 'high', (a, b) => a > b);
  if ([c, m50, m150, m200, m200Prev, lo, hi].some((x) => !fin(x))) return { status: 'MISSING_DATA', pass: false, criteria: null, ...TRANSL };
  const criteria = {
    'MIN-SF-TT-1': c > m150 && c > m200,
    'MIN-SF-TT-2': m150 > m200,
    'MIN-SF-TT-3': m200 > m200Prev,
    'MIN-SF-TT-4': m50 > m150 && m50 > m200,
    'MIN-SF-TT-5': c > m50,
    'MIN-SF-TT-6': c >= lo * (1 + P.aboveLow),
    'MIN-SF-TT-7': c >= hi * (1 - P.belowHigh),
  };
  const pass = Object.values(criteria).every(Boolean);
  return { status: pass ? 'TREND_TEMPLATE_1_7_PASS' : 'TREND_TEMPLATE_FAIL', pass, criteria, values: { close: c, ma50: m50, ma150: m150, ma200: m200, ma200OneMonthAgo: m200Prev, low52w: lo, high52w: hi, pctAboveLow: c / lo - 1, pctBelowHigh: 1 - c / hi }, ...TRANSL };
}

/** MIN-SF-TT-8: IBD RS is DATA_BLOCKED; a supplied VU percentile is shown as a proxy and never gates. */
export function rsProxy(vuPercentile = null) {
  return { criterion: 'MIN-SF-TT-8', status: 'DATA_BLOCKED_IBD_RS', proxy: fin(vuPercentile) ? { vuPercentile, note: 'VU cross-sectional percentile, not the IBD rating' } : null, gate: false };
}

/**
 * MIN-SF-VCP evidence (never a gate): base = from the highest high of the prior 252 sessions to bar i; base length,
 * largest correction, range of each third of the base (left to right) and the recent volume vs the 50-day mean.
 * The thirds and the 10-session window are evidence conventions, not Minervini numbers.
 */
export function vcpEvidence(bars, i, P = MIN_PARAMS) {
  if (i < P.yearSessions) return { status: 'INSUFFICIENT_HISTORY' };
  let h = -Infinity, hk = null; for (let k = i - P.yearSessions + 1; k <= i; k++) if (bars[k].high >= h) { h = bars[k].high; hk = k; }
  const len = i - hk;
  let lo = Infinity; for (let k = hk; k <= i; k++) lo = Math.min(lo, bars[k].low);
  const thirds = [];
  if (len >= 3) for (let t = 0; t < 3; t++) { const a = hk + Math.floor((len * t) / 3), b = hk + Math.floor((len * (t + 1)) / 3); let mx = -Infinity, mn = Infinity; for (let k = a; k <= b; k++) { mx = Math.max(mx, bars[k].high); mn = Math.min(mn, bars[k].low); } thirds.push(mx > 0 ? 1 - mn / mx : null); }
  const v50 = (() => { if (i < 50) return null; let s = 0; for (let k = i - 50; k < i; k++) s += bars[k].volume; return s / 50; })();
  const v10 = (() => { let s = 0; for (let k = i - 9; k <= i; k++) s += bars[k].volume; return s / 10; })();
  return { status: 'EVIDENCE_ONLY', baseHigh: h, baseHighDate: bars[hk].date, baseLengthSessions: len, largestCorrection: h > 0 ? 1 - lo / h : null, thirdRanges: thirds, rangesContracting: thirds.length === 3 ? thirds[0] > thirds[1] && thirds[1] > thirds[2] : null, recentVolumeVs50d: v50 ? v10 / v50 : null, conventions: 'thirds of the base and 10 / 50-session volume windows are evidence conventions (MIN-VCP-02/03 counts and halving are typical, not limits)' };
}

/** MIN-SF-STOP: reviewer stop vs the 10 % maximum (flag only; the reviewer decides). */
export function stopCheck(entry, stop, P = MIN_PARAMS) {
  if (!(entry > 0) || !fin(stop)) return { status: 'NO_STOP', flag: 'STOP_REQUIRED_BEFORE_ENTRY' };
  const risk = (entry - stop) / entry;
  return { status: 'CHECKED', riskPct: risk, exceedsMaxPlannedLoss: risk > P.maxStopPct, rule: 'MIN-MM-STOP-02 (translation-unverified)', ...TRANSL };
}

export const SEPA_OPEN_QUESTIONS = Object.freeze([
  { flag: 'MIN-MR-PRIORITY', psr709: ['MIN-PROCESS-04'], question: 'relative priority among the remaining names (results, surprises, guidance, industry position, peers, catalysts)' },
  { flag: 'MIN-MR-QUALITY', psr709: ['MIN-QUALITY-01', 'MIN-EPS-01', 'MIN-EPS-02'], question: 'earnings and sales: recent and prior quarters, core vs one-off; 20-25 % is a common minimum, not a SEPA constant' },
  { flag: 'MIN-MR-VCP', psr709: ['MIN-VCP-01', 'MIN-VCP-02', 'MIN-VCP-04'], question: 'is there a valid contraction pattern and a pivot?' },
  { flag: 'MIN-MR-RS', psr709: ['MIN-TT-08'], question: 'IBD RS rating >= 70 (not computable by the machine)' },
]);

/** C06 machine screen on bar i: Trend Template 1-7 only; one simple screen (MIN-PROCESS-15). */
export function sepaScreen(security, { asOfIndex = security.bars.length - 1, vuRsPercentile = null } = {}) {
  const bars = security.bars, tt = trendTemplate(bars, asOfIndex);
  if (!tt.pass) return [];
  return [{
    status: 'MANUAL_REVIEW_REQUIRED', methodId: 'SF_MINERVINI_SEPA_VCP', securityId: security.id, asOf: bars[asOfIndex].date, buyDeclarationAllowed: false, version: MINERVINI_VERSION, ...TRANSL,
    machineScreenEvidence: [
      { ruleId: 'MIN-SF-PROCESS', psr709: 'MIN-PROCESS-01', value: tt },
      { ruleId: 'MIN-SF-TT-8', psr709: 'MIN-TT-08', value: rsProxy(vuRsPercentile) },
      { ruleId: 'MIN-SF-VCP', psr709: 'MIN-VCP-01', value: vcpEvidence(bars, asOfIndex) },
    ],
    openQuestions: SEPA_OPEN_QUESTIONS,
    dataNotAvailableToMachine: ['IBD RS rating', 'estimates / surprises / guidance history', 'earnings quality adjustments', 'industry and peer ranking'],
  }];
}

/**
 * C07 machine screen on bar i. Peak p = most recent bar that is the highest high of p..i and is preceded, within fewer
 * than 40 sessions, by a low at most half of it (+100 %). Consolidation = p+1..i (>= 1 session, no minimum length).
 * Correction = 1 - lowest low since p / high at p: > 25 % no record; (20 %, 25 %] review flag; <= 10 % TIGHT, else
 * VCP_CHARACTERISTICS_REVIEW. No fundamental input (MIN-PP-01).
 */
export function powerPlayScreen(security, { asOfIndex = security.bars.length - 1 } = {}, P = MIN_PARAMS) {
  const bars = security.bars, i = asOfIndex;
  // peak = the highest bar p < i that no later bar exceeds and that has a +100 % run-up within fewer than 40 sessions
  let runMax = bars[i].high, best = null;
  for (let p = i - 1; p >= 1; p--) {
    if (!(bars[p].high > runMax)) continue; // p is the highest high of p..i
    runMax = bars[p].high;
    let j = null; for (let k = p - 1; k >= Math.max(0, p - (P.ppMaxSessions - 1)); k--) if (fin(bars[k].low) && bars[k].low * P.ppMultiple <= bars[p].high && (j === null || bars[k].low < bars[j].low)) j = k;
    if (j !== null) best = { p, j };
  }
  if (!best) return [];
  const { p, j } = best;
  let lo = Infinity; for (let k = p + 1; k <= i; k++) lo = Math.min(lo, bars[k].low);
  const correction = 1 - lo / bars[p].high;
  if (correction > P.ppMaxCorrection) return [];
  const v = (() => { if (j < 50) return null; let s = 0; for (let k = j - 50; k < j; k++) s += bars[k].volume; return s > 0 ? bars[j + 1]?.volume / (s / 50) : null; })();
  return [{
    status: 'MANUAL_REVIEW_REQUIRED', methodId: 'SF_MINERVINI_POWER_PLAY', securityId: security.id, asOf: bars[i].date, buyDeclarationAllowed: false, version: MINERVINI_VERSION, ...TRANSL,
    machineScreenEvidence: [
      { ruleId: 'MIN-SF-PP-RUNUP', psr709: 'MIN-PP-02', value: { runStartDate: bars[j].date, peakDate: bars[p].date, sessions: p - j, multiple: bars[p].high / bars[j].low, startVolumeVs50d: v, strongVolumeJudgment: 'REVIEW' } },
      { ruleId: 'MIN-SF-PP-CORRECTION', psr709: 'MIN-PP-04', value: { correction, inPrintedRange20to25: correction > P.ppReviewCorrection } },
      { ruleId: 'MIN-SF-PP-TIGHT', psr709: 'MIN-PP-05', value: { tight: correction <= P.ppTight, status: correction <= P.ppTight ? 'TIGHT' : 'VCP_CHARACTERISTICS_REVIEW' } },
      { ruleId: 'MIN-SF-PP-DURATION', psr709: 'MIN-PP-03', value: { consolidationSessions: i - p, note: 'no minimum; 3-6 weeks typical, twelve days printed' } },
    ],
    openQuestions: [{ flag: 'MIN-MR-PP-VOLUME', psr709: ['MIN-PP-02'], question: 'did the run-up begin with strong volume?' }, ...(correction > P.ppReviewCorrection ? [{ flag: 'MIN-MR-PP-CORR', psr709: ['MIN-PP-04'], question: 'correction between 20 % and 25 %' }] : [])],
    dataNotAvailableToMachine: ['pivot / entry judgment'],
  }];
}
