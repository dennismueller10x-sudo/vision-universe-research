/**
 * Morales/Kacher Buyable Gap-Up detector (V4.1, research, daily evaluation at the close). MACHINE SCREEN ONLY:
 * MANUAL_REVIEW_REQUIRED, never BUY.
 * Source (#709): MOKA12-004 gap >= 0.75 x ATR40 (HARD, HIGH); MOKA24-VOL standard volume = 150 % OF the average,
 * i.e. 1.5x (HARD, HIGH); MOKA24-MEGA megacap exception (MCD accepted at +47.09 %, CONTEXTUAL); MOKA12-005 2012 wording
 * UNKNOWN/LOW and superseded for the standard by MOKA24-VOL (conflicts MOKA-C1, MOKA-C-MEGA: no universal 1.5x hard gate);
 * MOKA12-007 gap-day low as risk reference (STRONG_PREFERENCE); MOKA12-003/006 leadership and trend are preferences.
 */

export const BGU_RULES_V41 = [
  { ruleId: 'BGU41-GAP', psr709: ['MOKA12-004'], kind: 'SOURCE', rule: 'gap size >= 0.75 x ATR(40)', code: 'gapUpAt' },
  { ruleId: 'BGU41-GAP-MEASURE', psr709: ['MOKA12-004'], kind: 'INTERPRETATION', rule: 'gap = open - previous close; the full gap (low - previous high) is reported as evidence', code: 'gapUpAt' },
  { ruleId: 'BGU41-ATR', psr709: ['MOKA12-004'], kind: 'INTERPRETATION', rule: 'ATR(40) = simple mean of the true range over the 40 sessions before the gap day (no same-day information)', code: 'atrBefore' },
  { ruleId: 'BGU41-VOLUME', psr709: ['MOKA24-VOL', 'MOKA12-005', 'MOKA-C1'], kind: 'SOURCE', rule: 'standard: gap-day volume >= 1.5 x average volume', code: 'gapUpAt' },
  { ruleId: 'BGU41-VOLUME-EXCEPTION', psr709: ['MOKA24-MEGA', 'MOKA-C-MEGA'], kind: 'SOURCE_CONTEXTUAL', rule: 'below the standard the record is not rejected: VOLUME_BELOW_STANDARD_EXCEPTION_REVIEW (megacap exception is a reviewer decision)', code: 'gapUpAt' },
  { ruleId: 'BGU41-VOLUME-WINDOW', psr709: [], kind: 'CONVENTION', rule: 'average volume over the 50 sessions before the gap day; #709 does not state the averaging window (SOURCE GAP); the ratio is reported for the reviewer', code: 'gapUpAt' },
  { ruleId: 'BGU41-SELL-GUIDE', psr709: ['MOKA12-007'], kind: 'SOURCE_PREFERENCE', rule: 'gap-day low reported as the risk reference; not enforced', code: 'buyableGapUpScreen' },
  { ruleId: 'BGU41-INTRADAY', psr709: ['MOKA24-VOL'], kind: 'SCOPE', rule: 'daily variant: evaluated with the full-day volume after the close; intraday projected volume is not available (intraday history DATA_BLOCKED)', code: 'gapUpAt' },
];

export const BGU_OPEN_QUESTIONS = [
  { psr709: ['MOKA12-003'], question: 'strong leadership or fundamental theme' },
  { psr709: ['MOKA12-006'], question: 'uptrend or constructive consolidation before the gap' },
  { psr709: ['MOKA24-MEGA'], question: 'if volume is below 1.5x: is the megacap exception applicable?' },
];

export function atrBefore(bars, i, n = 40) {
  if (i < n + 1) return null;
  let s = 0;
  for (let k = i - n; k < i; k++) { const b = bars[k], pc = bars[k - 1].close; s += Math.max(b.high - b.low, b.high - pc, pc - b.low); }
  return s / n;
}
const avgVolumeBefore = (bars, i, n) => { if (i < n) return null; let s = 0; for (let k = i - n; k < i; k++) s += bars[k].volume; return s / n; };

export function gapUpAt(bars, i, { atrN = 40, gapAtr = 0.75, volumeRatio = 1.5, volumeWindow = 50 } = {}) {
  const atr = atrBefore(bars, i, atrN), avgVol = avgVolumeBefore(bars, i, volumeWindow);
  if (atr === null || avgVol === null) return { status: 'INSUFFICIENT_HISTORY' };
  const b = bars[i], p = bars[i - 1], gap = b.open - p.close, ratio = b.volume / avgVol;
  const base = { gap, fullGap: b.low - p.high, atr40: atr, gapInAtr: gap / atr, volumeRatio: ratio };
  if (!(gap >= gapAtr * atr)) return { status: 'GAP_BELOW_0_75_ATR40', ...base };
  return { status: ratio >= volumeRatio ? 'GAP_AND_STANDARD_VOLUME' : 'VOLUME_BELOW_STANDARD_EXCEPTION_REVIEW', ...base };
}

export function buyableGapUpScreen(security, { asOfIndex = security.bars.length - 1, ...opts } = {}) {
  const r = gapUpAt(security.bars, asOfIndex, opts);
  if (!['GAP_AND_STANDARD_VOLUME', 'VOLUME_BELOW_STANDARD_EXCEPTION_REVIEW'].includes(r.status)) return [];
  const b = security.bars[asOfIndex];
  return [{
    status: 'MANUAL_REVIEW_REQUIRED', methodId: 'MORALES_KACHER_BUYABLE_GAP_UP', securityId: security.id, asOf: b.date, buyDeclarationAllowed: false,
    machineScreenEvidence: [
      { ruleId: 'BGU41-GAP', psr709: 'MOKA12-004', value: { gap: r.gap, atr40: r.atr40, gapInAtr: r.gapInAtr, fullGap: r.fullGap } },
      { ruleId: r.status === 'GAP_AND_STANDARD_VOLUME' ? 'BGU41-VOLUME' : 'BGU41-VOLUME-EXCEPTION', psr709: r.status === 'GAP_AND_STANDARD_VOLUME' ? 'MOKA24-VOL' : 'MOKA24-MEGA', value: { volumeRatio: r.volumeRatio, status: r.status } },
      { ruleId: 'BGU41-SELL-GUIDE', psr709: 'MOKA12-007', value: b.low },
    ],
    openQuestions: BGU_OPEN_QUESTIONS,
    dataNotAvailableToMachine: ['intraday projected volume', 'market capitalisation PIT (megacap judgment)', 'fundamentals / theme'],
  }];
}
