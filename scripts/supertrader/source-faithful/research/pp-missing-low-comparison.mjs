/**
 * Before / after evidence for the Power Play missing-low fix (sf-minervini-1.0.1, sf-minervini-components-1.0.1).
 * The pre-fix screen and classification are kept here VERBATIM (sf-minervini-1.0.0 / sf-minervini-components-1.0.0),
 * only to measure which setup classifications the fix changes. Nothing else may import them.
 *
 * The two versions differ only on bars whose Power Play peak is followed by a missing low: the fixed screen emits no
 * record there, the legacy screen computed a NaN correction that passed every comparison. transitionsDaily therefore
 * evaluates both versions exactly on the bars with such a peak (same monotone peak tracking as
 * minervini-lifecycle#powerPlaySetupSeries) and counts every other bar as unchanged; transitionsAt evaluates both
 * versions in full on given bars (independent cross-check, test SF4-PPFIX-DAILY-EQUALS-FULL).
 */
import { fin } from '../common/series.mjs';
import { MIN_PARAMS } from '../methods/minervini.mjs';
import { powerPlayClassify, NOT_A_STRATEGY } from './minervini-components.mjs';

const TRANSL = Object.freeze({ translationUnverified: true, clearance: 'REQUIRES_ORIGINAL_OR_EXPLICIT_WEB_CORROBORATION' });
export const PP_FIX_COMPARISON_VERSION = 'sf4-pp-missing-low-comparison-1.0.0';

// ---------------------------------------------------------------- LEGACY (frozen, comparison only)
function legacyPowerPlayScreen(security, { asOfIndex = security.bars.length - 1 } = {}, P = MIN_PARAMS) {
  const bars = security.bars, i = asOfIndex;
  // peak = the MOST RECENT bar p < i with a +100 % run-up from a low j within fewer than 40 sessions such that p is the
  // highest high of the whole leg j..i (review SF-R2-01: an older, higher peak must not hide a newer Power Play)
  let runMax = bars[i].high, best = null;
  for (let p = i - 1; p >= 1 && !best; p--) {
    if (!(bars[p].high > runMax)) continue; // p is the highest high of p..i
    runMax = bars[p].high;
    let j = null; for (let k = p - 1; k >= Math.max(0, p - (P.ppMaxSessions - 1)); k--) if (fin(bars[k].low) && bars[k].low * P.ppMultiple <= bars[p].high && (j === null || bars[k].low < bars[j].low)) j = k;
    if (j === null) continue;
    let legMax = -Infinity; for (let k = j; k < p; k++) legMax = Math.max(legMax, bars[k].high);
    if (legMax <= bars[p].high) best = { p, j };
  }
  if (!best) return [];
  const { p, j } = best;
  let lo = Infinity; for (let k = p + 1; k <= i; k++) lo = Math.min(lo, bars[k].low);
  const correction = 1 - lo / bars[p].high;
  if (correction > P.ppMaxCorrection) return [];
  const v = (() => { if (j < 50) return null; let s = 0; for (let k = j - 50; k < j; k++) s += bars[k].volume; return s > 0 ? bars[j + 1]?.volume / (s / 50) : null; })();
  return [{
    status: 'MANUAL_REVIEW_REQUIRED', methodId: 'SF_MINERVINI_POWER_PLAY', securityId: security.id, asOf: bars[i].date, buyDeclarationAllowed: false, version: 'sf-minervini-1.0.0', ...TRANSL,
    machineScreenEvidence: [
      { ruleId: 'MIN-SF-PP-RUNUP', psr709: 'MIN-PP-02', value: { runStartDate: bars[j].date, peakDate: bars[p].date, sessions: p - j, multiple: bars[p].high / bars[j].low, startVolumeVs50d: v, strongVolumeJudgment: 'REVIEW' } },
      { ruleId: 'MIN-SF-PP-CORRECTION', psr709: 'MIN-PP-04', value: { correction, inPrintedRange20to25: correction > P.ppReviewCorrection } },
      { ruleId: 'MIN-SF-PP-TIGHT', psr709: 'MIN-PP-05', value: { tight: correction <= P.ppTight, status: correction <= P.ppTight ? 'TIGHT' : 'VCP_CHARACTERISTICS_REVIEW' } },
      { ruleId: 'MIN-SF-PP-DURATION', psr709: 'MIN-PP-03', value: { consolidationSessions: i - p, note: 'no minimum; 3-6 weeks typical, twelve days printed' } },
    ],
    openQuestions: [{ flag: 'MIN-MR-PP-VOLUME', psr709: ['MIN-PP-02'], question: 'did the run-up begin with strong volume?' }, ...(correction > P.ppReviewCorrection ? [{ flag: 'MIN-MR-PP-CORR', psr709: ['MIN-PP-04'], question: 'correction between 20 % and 25 %' }] : []), ...(i - p > P.ppTypicalMaxSessions ? [{ flag: 'MIN-MR-PP-LONG-BASE', psr709: ['MIN-PP-03'], question: `consolidation of ${i - p} sessions is far beyond the typical 3-6 weeks: still a Power Play?` }] : [])],
    dataNotAvailableToMachine: ['pivot / entry judgment'],
  }];
}


export function legacyPowerPlayClassify(security, i, P = MIN_PARAMS) {
  const bars = security.bars, from = Math.max(0, i - 2 * P.ppMaxSessions);
  const base = { methodId: 'SF_MINERVINI_POWER_PLAY', securityId: security.id, asOf: bars[i]?.date, buyDeclarationAllowed: false, version: 'sf-minervini-components-1.0.0', ...TRANSL, ...NOT_A_STRATEGY };
  if (i < P.ppMaxSessions) return { ...base, classification: 'DATA_BLOCKED_SETUP', reasons: ['INSUFFICIENT_HISTORY'] };
  for (let k = from; k <= i; k++) if (!fin(bars[k].high) || !fin(bars[k].low)) return { ...base, classification: 'DATA_BLOCKED_SETUP', reasons: ['MISSING_BARS_IN_WINDOW'] };
  const [rec] = legacyPowerPlayScreen(security, { asOfIndex: i }, P);
  if (!rec) return { ...base, classification: 'NOT_QUALIFIED' };
  const ev = Object.fromEntries(rec.machineScreenEvidence.map((e) => [e.ruleId, e.value]));
  const run = ev['MIN-SF-PP-RUNUP'], corr = ev['MIN-SF-PP-CORRECTION'], tight = ev['MIN-SF-PP-TIGHT'], dur = ev['MIN-SF-PP-DURATION'];
  const peak = bars.findIndex((b) => b.date === run.peakDate);
  const lowSince = (() => { let lo = Infinity; for (let k = peak + 1; k <= i; k++) lo = Math.min(lo, bars[k].low); return lo; })();
  const stopReference = { level: lowSince, riskFromPeakPct: 1 - lowSince / bars[peak].high, exceeds10pct: 1 - lowSince / bars[peak].high > P.maxStopPct, note: 'reference only: lowest low of the consolidation; the stop is the reviewer\'s (MIN-RISK-01)' };
  // the run-up high is the highest high of peak..i, so bar i cannot be the breakout (review L2): the pivot is set and
  // a LATER bar is evaluated with pivotBreakout(bars, k, pivot.level)
  const breakout = { status: 'PIVOT_SET_AWAITING_BREAKOUT', pivot: { level: bars[peak].high, date: bars[peak].date, basis: 'run-up high (highest high of the consolidation)' }, distanceToPivotPct: bars[peak].high / bars[i].close - 1, evaluateWith: 'pivotBreakout(bars, k, pivot.level) for k > i' };
  const reasons = [], dataGaps = [];
  if (!fin(run.startVolumeVs50d)) dataGaps.push('RUN_START_VOLUME_HISTORY_UNAVAILABLE');
  if (corr.inPrintedRange20to25) reasons.push('CORRECTION_IN_PRINTED_RANGE_20_25');
  if (!tight.tight) reasons.push('NOT_TIGHT_VCP_CHARACTERISTICS_REVIEW');
  if (dur.consolidationSessions > P.ppTypicalMaxSessions) reasons.push('CONSOLIDATION_BEYOND_TYPICAL_DURATION');
  const classification = dataGaps.length ? 'DATA_BLOCKED_SETUP' : reasons.length ? 'MANUAL_REVIEW_SETUP' : 'CONFIRMED_MECHANICAL_SETUP';
  return { ...base, classification, reasons, dataGaps, status: 'MANUAL_REVIEW_REQUIRED', evidence: { runUp: run, correction: corr, tightness: tight, duration: dur, breakout, stopReference }, openManualQuestions: rec.openQuestions };
}

// ---------------------------------------------------------------- comparison

const key = (a, b) => `${a} -> ${b}`;
function tally(out, oldC, newC, date) {
  out.total++;
  if (oldC === newC) { out.unchanged++; return; }
  out.changed++; const k = key(oldC, newC); out.transitions[k] = (out.transitions[k] || 0) + 1;
  const y = date.slice(0, 4); (out.changedByYear[y] ||= 0); out.changedByYear[y]++;
}
const empty = () => ({ total: 0, unchanged: 0, changed: 0, transitions: {}, changedByYear: {} });

/** Both versions in full on the bars selected by pick(security, i) (independent cross-check). */
export function transitionsAt(dataset, pick, P = MIN_PARAMS) {
  const out = empty();
  for (const s of dataset.securities) for (let i = 0; i < s.bars.length; i++) if (pick(s, i)) tally(out, legacyPowerPlayClassify(s, i, P).classification, powerPlayClassify(s, i, P).classification, s.bars[i].date);
  return out;
}

/** Every bar from `from` on: both versions only where a peak with a later missing low is still active (see header). */
export function transitionsDaily(dataset, { from = null, P = MIN_PARAMS } = {}) {
  const out = empty(); let evaluated = 0;
  for (const s of dataset.securities) {
    const bars = s.bars; let active = []; const poisoned = new Set();
    for (let i = 0; i < bars.length; i++) {
      const h = bars[i].high, l = bars[i].low;
      if (!fin(l)) for (const p of active) poisoned.add(p);
      if (active.length) active = active.filter((p) => !((fin(h) && h >= bars[p].high) || (!poisoned.has(p) && fin(l) && l < 0.75 * bars[p].high * (1 - 1e-9))));
      if (!(from && bars[i].date < from)) {
        if (active.some((p) => poisoned.has(p))) { evaluated++; tally(out, legacyPowerPlayClassify(s, i, P).classification, powerPlayClassify(s, i, P).classification, bars[i].date); }
        else { out.total++; out.unchanged++; }
      }
      if (i >= 1 && fin(h)) { let ok = false; for (let k = Math.max(0, i - (P.ppMaxSessions - 1)); k < i && !ok; k++) if (fin(bars[k].low) && bars[k].low * P.ppMultiple <= h) ok = true; if (ok) active.push(i); }
    }
  }
  return { ...out, barsEvaluatedWithBothVersions: evaluated };
}
