/**
 * Gil Morales / Chris Kacher: Pocket Pivot (C11) and Buyable Gap-Up (C12) machine screens (contracts/morales-kacher.mjs).
 * Source: #709 W-MOKAPP / W-MOKA12 / W-MOKASTOP / W-MOKAV24 (WEB_PRIMARY, HIGH, original wording checked).
 * HARD and executed: MOKAPP-003 (volume > highest down-day volume of the prior ten sessions), MOKA12-004
 * (gap >= 0.75 x ATR40), MOKA24-VOL (150 % OF the average = 1.5x). Everything else is evidence or an open question.
 * A record is MANUAL_REVIEW_REQUIRED, never a buy (#709 C11 / C12: chart context and exits retain discretion).
 *
 * Adapted from the V4.1 components of Draft PR #712 (methods/pocket-pivot-v4-1.mjs, buyable-gap-up-v4-1.mjs @ 26e6caf);
 * logic unchanged, rule ids renamed to the source-faithful contract, volume window declared SOURCE_AMBIGUOUS.
 * Bars: split-adjusted { date, open, high, low, close, volume } with one adjustment basis over each window.
 */
import { fin, smaAt } from '../common/series.mjs';

export const MOKA_VERSION = 'sf-morales-kacher-1.1.0';
export const MOKA_PARAMS = Object.freeze({ ppWindow: 10, atrSessions: 40, gapAtr: 0.75, volumeRatio: 1.5, volumeWindow: 50, respectWeeks: 7, sessionsPerWeek: 5 });

/** MOKA-SF-PP-VOLUME / -DOWNDAY / -UPDAY on bar i. Needs 11 prior closes (10 window days + 1 reference). */
export function pocketPivotAt(bars, i, window = MOKA_PARAMS.ppWindow) {
  if (i < window + 1) return { status: 'INSUFFICIENT_HISTORY' };
  const b = bars[i];
  let maxDown = null, downDays = 0;
  for (let k = i - window; k < i; k++) {
    if (!fin(bars[k].close) || !fin(bars[k - 1].close) || !fin(bars[k].volume)) return { status: 'MISSING_DATA_IN_WINDOW' };
    if (bars[k].close < bars[k - 1].close) { downDays++; if (maxDown === null || bars[k].volume > maxDown) maxDown = bars[k].volume; }
  }
  if (!(b.close > bars[i - 1].close)) return { status: 'NOT_UP_DAY', volume: b.volume, maxDownVolume: maxDown, downDays };
  if (maxDown === null) return { status: 'NO_DOWN_DAY_IN_WINDOW', volume: b.volume, maxDownVolume: null, downDays };
  return { status: b.volume > maxDown ? 'VOLUME_SIGNATURE' : 'VOLUME_NOT_ABOVE_DOWN_VOLUME', volume: b.volume, maxDownVolume: maxDown, downDays };
}

export const POCKET_PIVOT_OPEN_QUESTIONS = Object.freeze([
  { flag: 'MOKA-MR-BASE', psr709: ['MOKAPP-001', 'MOKAPP-006', 'MOKAPP-008', 'MOKAPP-009'], question: 'constructive base; no multi-month downtrend, no V-shape after a hard break, no wedging' },
  { flag: 'MOKA-MR-THEME', psr709: ['MOKAPP-002'], question: 'strong fundamentals or a convincing theme' },
  { flag: 'MOKA-MR-EXT', psr709: ['MOKAPP-004', 'MOKAPP-007', 'MOKAPP-010'], question: 'position relative to the 10DMA / critical MA; not extended' },
]);

export function pocketPivotScreen(security, { asOfIndex = security.bars.length - 1 } = {}) {
  const bars = security.bars, r = pocketPivotAt(bars, asOfIndex);
  if (r.status !== 'VOLUME_SIGNATURE') return [];
  const c = bars[asOfIndex].close, dist = (n) => { const m = smaAt(bars, asOfIndex, n); return m === null ? null : c / m - 1; };
  return [{
    status: 'MANUAL_REVIEW_REQUIRED', methodId: 'SF_MOKA_POCKET_PIVOT', securityId: security.id, asOf: bars[asOfIndex].date, buyDeclarationAllowed: false, version: MOKA_VERSION,
    machineScreenEvidence: [
      { ruleId: 'MOKA-SF-PP-VOLUME', psr709: 'MOKAPP-003', value: { volume: r.volume, maxDownVolume: r.maxDownVolume, downDays: r.downDays } },
      { ruleId: 'MOKA-SF-PP-CONTEXT', psr709: 'MOKAPP-004', value: { pctFrom10DMA: dist(10), pctFrom50DMA: dist(50), pctFrom200DMA: dist(200), note: 'evidence; extension is judged by the reviewer, never a rejection (MOKAPP-010)' } },
      { ruleId: 'MOKA-SF-EXIT-GUIDE-EVIDENCE', psr709: 'MOKA12-008', value: sellGuideEvidence(bars, asOfIndex) },
    ],
    openQuestions: POCKET_PIVOT_OPEN_QUESTIONS,
    dataNotAvailableToMachine: ['fundamentals / theme', 'chart-pattern judgment', 'intraday projected volume'],
  }];
}

/** ATR over the n sessions BEFORE bar i (simple mean of the true range; no same-day information). */
export function atrBefore(bars, i, n = MOKA_PARAMS.atrSessions) {
  if (i < n + 1) return null;
  let s = 0;
  for (let k = i - n; k < i; k++) { const b = bars[k], pc = bars[k - 1].close; if (!fin(b.high) || !fin(b.low) || !fin(pc)) return null; s += Math.max(b.high - b.low, b.high - pc, pc - b.low); }
  return s / n;
}
const meanVolumeBefore = (bars, i, n) => { if (i < n) return null; let s = 0; for (let k = i - n; k < i; k++) { if (!fin(bars[k].volume)) return null; s += bars[k].volume; } return s / n; };

/** MOKA-SF-BGU-GAP / -VOLUME / -VOLWINDOW / -MEGA on bar i. */
export function gapUpAt(bars, i, { atrN = MOKA_PARAMS.atrSessions, gapAtr = MOKA_PARAMS.gapAtr, volumeRatio = MOKA_PARAMS.volumeRatio, volumeWindow = MOKA_PARAMS.volumeWindow } = {}) {
  const b = bars[i], p = bars[i - 1];
  if (!p || !fin(b.open) || !fin(p.close) || !fin(b.volume) || !fin(b.low) || !fin(p.high)) return { status: 'MISSING_DATA' };
  const atr = atrBefore(bars, i, atrN);
  if (atr === null) return { status: 'INSUFFICIENT_HISTORY' };
  // the averaging window is SOURCE_AMBIGUOUS: without it the gap is still evaluated and the volume goes to review (SF-R2-06)
  const avgVol = meanVolumeBefore(bars, i, volumeWindow), gap = b.open - p.close, ratio = avgVol > 0 ? b.volume / avgVol : null;
  const base = { gap, fullGap: b.low - p.high, atr40: atr, gapInAtr: gap / atr, volumeRatio: ratio, volumeWindow, volumeWindowStatus: 'SOURCE_AMBIGUOUS' };
  if (!(gap >= gapAtr * atr)) return { status: 'GAP_BELOW_0_75_ATR40', ...base };
  if (ratio === null) return { status: 'GAP_VOLUME_WINDOW_UNAVAILABLE_REVIEW', ...base };
  return { status: ratio >= volumeRatio ? 'GAP_AND_STANDARD_VOLUME' : 'VOLUME_BELOW_STANDARD_EXCEPTION_REVIEW', ...base };
}

export const BGU_OPEN_QUESTIONS = Object.freeze([
  { flag: 'MOKA-MR-LEAD', psr709: ['MOKA12-003', 'MOKA12-006'], question: 'strong leadership or theme; uptrend or constructive consolidation before the gap' },
  { flag: 'MOKA-MR-MEGA', psr709: ['MOKA24-MEGA'], question: 'volume below 1.5x: does the megacap exception apply?' },
  { flag: 'MOKA-MR-VOLWINDOW', psr709: ['MOKA24-VOL'], question: 'confirm the volume standard on the averaging window you use (the 50-session ratio is shown)' },
]);

export function buyableGapUpScreen(security, { asOfIndex = security.bars.length - 1, ...opts } = {}) {
  const r = gapUpAt(security.bars, asOfIndex, opts);
  if (!['GAP_AND_STANDARD_VOLUME', 'VOLUME_BELOW_STANDARD_EXCEPTION_REVIEW', 'GAP_VOLUME_WINDOW_UNAVAILABLE_REVIEW'].includes(r.status)) return [];
  const b = security.bars[asOfIndex];
  return [{
    status: 'MANUAL_REVIEW_REQUIRED', methodId: 'SF_MOKA_BUYABLE_GAP_UP', securityId: security.id, asOf: b.date, buyDeclarationAllowed: false, version: MOKA_VERSION,
    machineScreenEvidence: [
      { ruleId: 'MOKA-SF-BGU-GAP', psr709: 'MOKA12-004', value: { gap: r.gap, atr40: r.atr40, gapInAtr: r.gapInAtr, fullGap: r.fullGap } },
      { ruleId: r.status === 'VOLUME_BELOW_STANDARD_EXCEPTION_REVIEW' ? 'MOKA-SF-BGU-MEGA' : r.status === 'GAP_AND_STANDARD_VOLUME' ? 'MOKA-SF-BGU-VOLUME' : 'MOKA-SF-BGU-VOLWINDOW', psr709: r.status === 'VOLUME_BELOW_STANDARD_EXCEPTION_REVIEW' ? 'MOKA24-MEGA' : 'MOKA24-VOL', value: { volumeRatio: r.volumeRatio, volumeWindow: r.volumeWindow, volumeWindowStatus: r.volumeWindowStatus, status: r.status } },
      { ruleId: 'MOKA-SF-BGU-SELLGUIDE', psr709: 'MOKA12-007', value: { gapDayLow: b.low, note: 'risk reference; below it generally sell at least half (MOKASTOP-006, preference)' } },
      { ruleId: 'MOKA-SF-EXIT-GUIDE-EVIDENCE', psr709: 'MOKA12-008', value: sellGuideEvidence(security.bars, asOfIndex) },
    ],
    openQuestions: BGU_OPEN_QUESTIONS,
    dataNotAvailableToMachine: ['intraday projected volume', 'market capitalisation PIT (megacap judgment)', 'fundamentals / theme'],
  }];
}

/**
 * MOKA-SF-EXIT-VIOLATION evidence (SOURCE_AMBIGUOUS, MOKA-C2): close below the n-day MA on day v, then a low below
 * day v's low on the NEXT day (2012 slide) or on ANY later day up to i (FAQ). Both readings are reported; no exit.
 */
export function maViolationEvidence(bars, i, n) {
  // v = first day of the most recent run of closes below the MA (the violation day)
  const below = (k) => { const m = smaAt(bars, k, n); return m !== null && bars[k].close < m; };
  let v = null;
  for (let k = i; k >= n; k--) if (below(k)) { v = k; break; }
  if (v === null) return { closeBelowMa: null };
  while (v - 1 >= n && below(v - 1)) v--;
  const next = v + 1 <= i ? bars[v + 1].low < bars[v].low : null;
  let later = false; for (let k = v + 1; k <= i; k++) if (bars[k].low < bars[v].low) later = true;
  return { closeBelowMa: bars[v].date, nextDayUndercut: next, laterUndercut: v < i ? later : null, readings: ['2012 slide: next day', 'FAQ: later days'] };
}

/**
 * MOKA-SF-EXIT-GUIDE-EVIDENCE (MOKA12-008 / MOKASTOP-001, PREFERENCE): which sell guide the printed rule would point to
 * on bar i - the 10DMA if the stock has respected it for at least 7 weeks (35 sessions, 5 per week), otherwise the
 * 50DMA. "Respected" = no confirmed 10DMA violation; the violation itself is SOURCE_AMBIGUOUS (MOKA-C2), so both
 * readings are evaluated: NEXT_DAY (2012 slide) and LATER_DAYS (FAQ). Evidence only, never an exit.
 */
export function sellGuideEvidence(bars, i, P = MOKA_PARAMS) {
  const below = (k) => { const m = smaAt(bars, k, 10); return m !== null && fin(bars[k].close) && bars[k].close < m; };
  const lastViolation = (reading) => {
    // scan backwards for the most recent confirmation day: a day k whose low undercuts the low of a close-below-MA day v
    // (v = k - 1 for NEXT_DAY; any v < k for LATER_DAYS); only bars up to i are used
    // NEXT_DAY: every close below the MA opens a one-day window. LATER_DAYS: every close below the MA since the last
    // confirmation stays open until a later low undercuts it, so the reference is the highest such low (review R1-04:
    // every NEXT_DAY violation is also a LATER_DAYS violation). A bar without a low neither confirms nor opens.
    let ref = null, last = null;
    for (let k = 10; k <= i; k++) {
      const b = bars[k];
      if (!fin(b.low)) { if (reading === 'NEXT_DAY') ref = null; continue; }
      if (ref !== null && b.low < ref) { last = k; ref = null; }
      if (reading === 'NEXT_DAY') ref = below(k) ? b.low : null;
      else if (below(k)) ref = ref === null ? b.low : Math.max(ref, b.low);
    }
    return last;
  };
  const minSessions = P.respectWeeks * P.sessionsPerWeek;
  const firstMa = bars.findIndex((_, k) => smaAt(bars, k, 10) !== null);
  const readings = Object.fromEntries(['NEXT_DAY', 'LATER_DAYS'].map((r) => {
    const v = lastViolation(r), since = v === null ? (firstMa >= 0 && firstMa <= i ? i - firstMa + 1 : 0) : i - v;
    return [r, { lastViolationDate: v === null ? null : bars[v].date, respectedSessions: since, noViolationInHistory: v === null, proposedGuide: since >= minSessions ? '10DMA' : '50DMA' }];
  }));
  const ma = (n) => smaAt(bars, i, n);
  return { asOf: bars[i].date, ma10: ma(10), ma50: ma(50), minRespectSessions: minSessions, readings, agree: readings.NEXT_DAY.proposedGuide === readings.LATER_DAYS.proposedGuide, note: 'evidence for the reviewer (preference MOKA12-008); the exit decision stays manual (MOKA-SF-EXIT-MA)' };
}
