/**
 * Morales/Kacher Pocket Pivot volume detector (V4.1, research). MACHINE SCREEN ONLY: MANUAL_REVIEW_REQUIRED, never BUY.
 * Source: #709 MOKAPP-003 (W-MOKAPP rule 3, HARD, HIGH, original wording checked, SCOPE_AND_EXCEPTIONS_REQUIRED):
 * volume greater than the highest down-day volume of the prior ten days. Everything else in the method
 * (constructive base, fundamentals/theme, 10DMA context, V-shape, wedging, extension, exits) is a preference or
 * context in #709 (DO_NOT_HARDEN_PREFERENCE) and is reported as evidence or an open question, never as a gate.
 *
 * Input bars: split-adjusted { date, close, volume } with volume on the same adjustment basis for the whole window.
 */

export const POCKET_PIVOT_RULES_V41 = [
  { ruleId: 'PP41-VOLUME', psr709: ['MOKAPP-003'], kind: 'SOURCE', rule: 'volume of the candidate day > the highest down-day volume of the ten sessions before it (strictly greater)', code: 'pocketPivotAt' },
  { ruleId: 'PP41-DOWN-DAY', psr709: ['MOKAPP-003'], kind: 'INTERPRETATION', rule: 'a down day closes below the previous close; a window without a down day yields NO_DOWN_DAY_IN_WINDOW (no comparison, no candidate)', code: 'pocketPivotAt' },
  { ruleId: 'PP41-UP-DAY', psr709: ['MOKAPP-003', 'MOKAPP-005'], kind: 'INTERPRETATION', rule: 'the candidate day itself closes above the previous close (a pivot is a buy point on strength); not stated numerically in #709', code: 'pocketPivotAt' },
  { ruleId: 'PP41-CONTEXT', psr709: ['MOKAPP-001', 'MOKAPP-002', 'MOKAPP-004', 'MOKAPP-006', 'MOKAPP-007', 'MOKAPP-008', 'MOKAPP-009', 'MOKAPP-010', 'MOKA12-001', 'MOKA12-002'], kind: 'CONTEXT_EVIDENCE_ONLY', rule: 'distance to the 10/50/200-day averages is reported; base quality, trend, V-shape, wedging and extension are reviewer judgments', code: 'pocketPivotScreen' },
  { ruleId: 'PP41-EXIT', psr709: ['MOKA12-008', 'MOKA12-009', 'MOKA-C2'], kind: 'NOT_IMPLEMENTED', rule: 'exit guides (10DMA after >= 7 weeks of respect, else 50DMA; violation semantics differ by version) are preferences; not part of the detector', code: null },
];

export const POCKET_PIVOT_OPEN_QUESTIONS = [
  { psr709: ['MOKAPP-001', 'MOKAPP-006', 'MOKAPP-008', 'MOKAPP-009'], question: 'constructive base; no multi-month downtrend, no V-shape after a hard break, no wedging' },
  { psr709: ['MOKAPP-002'], question: 'strong fundamentals or a convincing theme' },
  { psr709: ['MOKAPP-004', 'MOKAPP-007', 'MOKAPP-010'], question: 'position relative to the 10DMA and the critical moving average; not extended' },
  { psr709: ['MOKA12-001'], question: 'early base pivot or continuation / add-on pivot' },
];

const sma = (bars, i, n) => { if (i < n - 1) return null; let s = 0; for (let k = i - n + 1; k <= i; k++) s += bars[k].close; return s / n; };

/** Evaluates bar i; returns { status, volume, maxDownVolume, downDays }. Needs 11 prior closes (10 window days + 1 reference). */
export function pocketPivotAt(bars, i, window = 10) {
  if (i < window + 1) return { status: 'INSUFFICIENT_HISTORY' };
  const b = bars[i];
  let maxDown = null, downDays = 0;
  for (let k = i - window; k < i; k++) if (bars[k].close < bars[k - 1].close) { downDays++; if (maxDown === null || bars[k].volume > maxDown) maxDown = bars[k].volume; }
  if (!(b.close > bars[i - 1].close)) return { status: 'NOT_UP_DAY', volume: b.volume, maxDownVolume: maxDown, downDays };
  if (maxDown === null) return { status: 'NO_DOWN_DAY_IN_WINDOW', volume: b.volume, maxDownVolume: null, downDays };
  return { status: b.volume > maxDown ? 'VOLUME_SIGNATURE' : 'VOLUME_NOT_ABOVE_DOWN_VOLUME', volume: b.volume, maxDownVolume: maxDown, downDays };
}

export function pocketPivotScreen(security, { asOfIndex = security.bars.length - 1 } = {}) {
  const bars = security.bars, r = pocketPivotAt(bars, asOfIndex);
  if (r.status !== 'VOLUME_SIGNATURE') return [];
  const c = bars[asOfIndex].close, dist = (n) => { const m = sma(bars, asOfIndex, n); return m === null ? null : c / m - 1; };
  return [{
    status: 'MANUAL_REVIEW_REQUIRED', methodId: 'MORALES_KACHER_POCKET_PIVOT', securityId: security.id, asOf: bars[asOfIndex].date, buyDeclarationAllowed: false,
    machineScreenEvidence: [
      { ruleId: 'PP41-VOLUME', psr709: 'MOKAPP-003', value: { volume: r.volume, maxDownVolume: r.maxDownVolume, downDays: r.downDays } },
      { ruleId: 'PP41-CONTEXT', psr709: 'MOKAPP-004', value: { pctFrom10DMA: dist(10), pctFrom50DMA: dist(50), pctFrom200DMA: dist(200) } },
    ],
    openQuestions: POCKET_PIVOT_OPEN_QUESTIONS,
    dataNotAvailableToMachine: ['fundamentals / theme (PARTIAL)', 'chart-pattern judgment'],
  }];
}
