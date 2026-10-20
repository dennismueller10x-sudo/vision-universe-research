/**
 * Kristjan Kullamaegi: Common Breakout (C08, written daily alternative), Episodic Pivot (C09) and Parabolic Short (C10)
 * (contracts/kullamagi.mjs). Source: #709 W-KK3 / W-KKFAQ / W-KKEP and own replies (WEB_PRIMARY, HIGH, checked).
 *
 * Executed exactly (HARD): KK-031 ADR20, KK-012 breakout stop = low of day with distance <= ADR (a wider stop REJECTS
 * the trade; it is never replaced by a tighter one - the earlier VU ADR clamp is a #709 false hard rule), KK-034 EP
 * stop = low of day with distance <= 1.5 ADR, KK-027 stop-market fills, KK-001 overnight cap 30 %.
 * Everything else is evidence or a review question. Missing intraday, catalyst and borrow data are never simulated:
 * the opening-range entries, the catalyst, early volume, VWAP and borrow are DATA_BLOCKED.
 */
import { fin, smaAt } from '../common/series.mjs';

export const KK_VERSION = 'sf-kullamagi-1.0.0';
export const KK_PARAMS = Object.freeze({ adrSessions: 20, overnightCap: 0.30, epMaxAdr: 1.5, epGapReference: 0.10, momentumSessions: { m1: 21, m3: 63, m6: 126 } });

/** KK-031: ADR20 (%) = mean over the 20 sessions BEFORE bar i of (high / low - 1) x 100 (no same-day information). */
export function adr20(bars, i, n = KK_PARAMS.adrSessions) {
  if (i < n) return null;
  let s = 0;
  for (let k = i - n; k < i; k++) { const b = bars[k]; if (!fin(b.high) || !fin(b.low) || !(b.low > 0)) return null; s += b.high / b.low - 1; }
  return (s / n) * 100;
}

/** KK-001: largest position value held overnight. */
export const overnightCap = (equity, cap = KK_PARAMS.overnightCap) => (equity > 0 ? equity * cap : 0);

/** KK-027: stop-market sell fill (long): a gap through the stop fills at the open; never skipped. */
export const stopMarketFill = (stop, open) => (fin(open) && open < stop ? { fill: open, gapped: true } : { fill: stop, gapped: false });

function stopCheck(entry, lowOfDay, adrPct, maxAdr, ruleId) {
  if (!(entry > 0) || !fin(lowOfDay) || !fin(adrPct) || !(adrPct > 0)) return { status: 'INSUFFICIENT_DATA', ruleId };
  if (!(lowOfDay < entry)) return { status: 'STOP_NOT_BELOW_ENTRY', ruleId };
  const distancePct = ((entry - lowOfDay) / entry) * 100, limit = maxAdr * adrPct;
  return { status: distancePct <= limit ? 'ACCEPT' : 'REJECT_WIDE_STOP', stop: lowOfDay, distancePct, limitPct: limit, adrPct, ruleId, note: 'the stop is the low of day; a wider stop rejects the trade and is never replaced' };
}
/** KK-012 (C08): stop = low of day, distance <= 1 x ADR. */
export const breakoutStopCheck = ({ entry, lowOfDay, adrPct }) => stopCheck(entry, lowOfDay, adrPct, 1, 'KK-SF-BO-STOP');
/** KK-034 (C09): stop = low of day, distance at most 1.5 x ADR. */
export const epStopCheck = ({ entry, lowOfDay, adrPct }) => stopCheck(entry, lowOfDay, adrPct, KK_PARAMS.epMaxAdr, 'KK-SF-EP-STOP');

/**
 * C08 daily alternative (KK-011) for a reviewer-supplied breakout level: the breakout day is a close above the level;
 * entry at that close (market on close), so the final low of day is known and KK-012 is evaluated exactly.
 */
export function dailyBreakoutEntry(bars, i, level) {
  const b = bars[i];
  if (!fin(level) || !(b.close > level)) return { status: 'NO_DAILY_BREAKOUT' };
  const adr = adr20(bars, i);
  return { status: 'DAILY_BREAKOUT', date: b.date, entry: b.close, entryBasis: 'BREAKOUT_DAY_CLOSE', stopCheck: breakoutStopCheck({ entry: b.close, lowOfDay: b.low, adrPct: adr }) };
}

/**
 * KK-005 momentum: cross-sectional percentiles of 1 / 3 / 6-month returns on one date among securities with a bar
 * that date. RANKING EVIDENCE ONLY (KK-005 PREFERENCE, KK-048 no AND filter): nothing is excluded.
 */
export function momentumRanks(securities, date, P = KK_PARAMS) {
  const rows = [];
  for (const s of securities) {
    const i = s.bars.findIndex((b) => b.date === date); if (i < 0) continue;
    const ret = (n) => (i >= n && fin(s.bars[i].close) && s.bars[i - n].close > 0 ? s.bars[i].close / s.bars[i - n].close - 1 : null);
    rows.push({ id: s.id, r1m: ret(P.momentumSessions.m1), r3m: ret(P.momentumSessions.m3), r6m: ret(P.momentumSessions.m6) });
  }
  const pct = (key) => { const v = rows.filter((r) => r[key] !== null).sort((a, b) => a[key] - b[key]); v.forEach((r, k) => { r[`p${key.slice(1)}`] = v.length > 1 ? (k / (v.length - 1)) * 100 : null; }); };
  pct('r1m'); pct('r3m'); pct('r6m');
  for (const r of rows) { const ps = [r.p1m, r.p3m, r.p6m].filter(fin); r.bestPercentile = ps.length ? Math.max(...ps) : null; }
  return rows.sort((a, b) => (b.bestPercentile ?? -1) - (a.bestPercentile ?? -1) || (a.id < b.id ? -1 : 1));
}

/** KK-006..009 setup evidence on bar i (conventions declared, never gates). */
export function breakoutEvidence(bars, i) {
  const c = bars[i].close, ret = (n) => (i >= n && bars[i - n].close > 0 ? c / bars[i - n].close - 1 : null);
  const rising = (n) => { const a = smaAt(bars, i, n), b = smaAt(bars, i - 5, n); return a !== null && b !== null ? a > b : null; };
  const low = (a, b) => { let v = Infinity; for (let k = a; k <= b; k++) v = Math.min(v, bars[k].low); return v; };
  return {
    priorMove: { r21: ret(21), r42: ret(42), r63: ret(63), reference: '30-100 % over 1-3 months (KK-006, preference)' },
    higherLows: i >= 20 ? low(i - 9, i) > low(i - 19, i - 10) : null,
    risingMA: { ma10: rising(10), ma20: rising(20), ma50: rising(50), reference: 'rising 10 / 20, sometimes 50-day MA (KK-009)' },
    adr20: adr20(bars, i),
    conventions: 'windows (21 / 42 / 63 sessions, two 10-session halves, 5-session MA slope) are evidence conventions, not Kullamaegi numbers',
  };
}

/** Review queue for C08: all names ordered by momentum priority with evidence; no exclusion. */
export function kkBreakoutReviewQueue(securities, date) {
  const byId = new Map(securities.map((s) => [s.id, s]));
  return momentumRanks(securities, date).map((r) => {
    const s = byId.get(r.id), i = s.bars.findIndex((b) => b.date === date);
    return { status: 'MANUAL_REVIEW_REQUIRED', methodId: 'SF_KK_BREAKOUT', securityId: r.id, asOf: date, buyDeclarationAllowed: false, version: KK_VERSION,
      machineScreenEvidence: [{ ruleId: 'KK-SF-BO-MOMENTUM', psr709: 'KK-005', value: r }, { ruleId: 'KK-SF-BO-SETUP', psr709: 'KK-006', value: breakoutEvidence(s.bars, i) }],
      openQuestions: [{ flag: 'KK-MR-SETUP', psr709: ['KK-006', 'KK-007', 'KK-008', 'KK-009'] }, { flag: 'KK-MR-LEVEL', psr709: ['KK-011'] }],
      dataNotAvailableToMachine: ['opening range high (intraday, DATA_BLOCKED)'] };
  });
}

/** C09 evidence on bar i: gap vs previous close (10 % reference), prior range and move, daily volume ratio. */
export function epGapEvidence(bars, i) {
  if (i < 1) return { status: 'INSUFFICIENT_HISTORY' };
  const b = bars[i], p = bars[i - 1], gap = p.close > 0 ? b.open / p.close - 1 : null;
  const range = (n) => { if (i < n) return null; let hi = -Infinity, lo = Infinity; for (let k = i - n; k < i; k++) { hi = Math.max(hi, bars[k].high); lo = Math.min(lo, bars[k].low); } return lo > 0 ? hi / lo - 1 : null; };
  const vol50 = (() => { if (i < 50) return null; let s = 0; for (let k = i - 50; k < i; k++) s += bars[k].volume; return s > 0 ? b.volume / (s / 50) : null; })();
  return {
    status: 'EVIDENCE_ONLY', gap, atLeastTenPercentReference: gap !== null ? gap >= KK_PARAMS.epGapReference : null,
    priorRange63: range(63), priorRange126: range(126), priorMove126: i >= 126 && bars[i - 126].close > 0 ? p.close / bars[i - 126].close - 1 : null,
    dailyVolumeVs50d: vol50, earlyIntradayVolume: 'DATA_BLOCKED', catalyst: 'DATA_BLOCKED', entryOpeningRangeHigh: 'DATA_BLOCKED',
    note: 'KK-015 10 % gap is a STRONG_PREFERENCE description: reported, never an exclusion; 63 / 126 / 50-session windows are evidence conventions',
  };
}

/** C10 evidence on bar i: streak of up closes, their returns, acceleration, distance to the 10 / 20-day MA. */
export function parabolicEvidence(bars, i) {
  const rets = [];
  for (let k = i; k >= 1 && bars[k].close > bars[k - 1].close; k--) rets.unshift(bars[k].close / bars[k - 1].close - 1);
  const accelerating = rets.length >= 2 ? rets.every((r, k) => k === 0 || r >= rets[k - 1]) : null;
  const dist = (n) => { const m = smaAt(bars, i, n); return m ? bars[i].close / m - 1 : null; };
  return { status: 'EVIDENCE_ONLY', upStreak: rets.length, streakReturns: rets, accelerating, distanceToMA10: dist(10), distanceToMA20: dist(20), entry: 'DATA_BLOCKED (ORL / first red 5-minute candle / VWAP)', borrow: 'DATA_BLOCKED', note: 'move sizes in KK-019 are illustrative, never thresholds' };
}
