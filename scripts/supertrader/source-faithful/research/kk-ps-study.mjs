/**
 * Kullamaegi Parabolic Short (C10, contracts/kullamagi.mjs) – CHART-FIRST trade-level SHORT model study on REAL
 * Tiingo IEX minute bars (research/kk-intraday.mjs). Not run on the long-only portfolio engine: a short book needs
 * borrow, locates and fees, which are DATA_BLOCKED (KK-030). Every trade is a hypothetical research short of one unit;
 * the result is reported per trade (return, R multiple) and is NEVER an executable, certified short backtest.
 *
 * Source mechanics (#709 W-KK3, all PREFERENCE / OPTIONAL / CONTEXTUAL; no number is a source threshold):
 *  - KK-018 several strongly accelerated up days; KK-019 move sizes are EXAMPLE_ONLY (never thresholds);
 *  - KK-020 entry on the opening range low or the first red 5-minute candle; KK-021 after the break a failed VWAP
 *    retest;
 *  - KK-022 risk: high of day or a VWAP reclaim; KK-023 cover toward the 10 / 20-day MA, early partial profits;
 *  - KK-027 stops are stop-market (a gap through the stop fills at the open).
 * Two data layers, kept apart:
 *  A  daily screen (snapshot bars, all history): PS_CHART_CANDIDATE known at the close before the trade day;
 *  B  intraday confirmation (IEX minutes, 2017+): entry, stop and the entry-day exits decided minute by minute.
 * No minute is ever derived from a daily bar; a candidate day without minutes is reported, not simulated.
 */
import crypto from 'node:crypto';
import { fin, smaAt, rawTickAdjusted } from '../common/series.mjs';
import { adr20, parabolicEvidence, KK_VERSION } from '../methods/kullamagi.mjs';
import { KK_INTRADAY_VERSION, openingRange, runningVwap, fiveMinuteCandles, identityCheck, openIdentityCheck, tickerOf } from './kk-intraday.mjs';

export const KK_PS_STUDY_VERSION = 'kk-ps-chart-short-study-1.1.0';
export const PS_LABEL = 'CHART_PS_SHORT_MODEL_STUDY_TRADE_LEVEL_NO_BORROW_DATA_NOT_EXECUTABLE';
export const PS_CLASS = Object.freeze({ CHART: 'PS_CHART_CANDIDATE', INTRADAY_CONFIRMED: 'INTRADAY_CONFIRMED_CHART_PS_SETUP', EXECUTABLE: 'BORROW_CONFIRMED_EXECUTABLE_SHORT' });
export const PS_EXECUTABLE_CLASS_ASSIGNABLE = false; // KK-SF-PS-BORROW DATA_BLOCKED: no historical borrow / locates / fees
export const PS_FIRST_INTRADAY_DATE = '2017-01-03';
export const PS_MIN_HISTORY = 31; // 30 sessions before the signal close (ADR20, MA10, streak evidence)
export const PS_COSTS = Object.freeze({ slippageBps: 10, commissionBps: 1, borrowFee: 'DATA_BLOCKED_NOT_INCLUDED' });

export const PS_MODEL_ASSUMPTIONS = Object.freeze([
  { id: 'MA-PS-ACCELERATION', reference: 'STREAK3_ACCEL: at the close before the trade day at least 3 consecutive higher closes, each return >= the one before, their sum >= 3 x ADR20 and the close above the 10-day MA', alternatives: ['STREAK4_ACCEL: at least 4', 'STREAK3_NO_ACCEL: no acceleration condition'], why: 'KK-018 "several strongly accelerated up days" has no number; KK-019 sizes are examples only. ADR20 (KK-031) scales "strongly" to the stock' },
  { id: 'MA-PS-HISTORY', reference: 'a candidate needs 31 sessions up to the signal close', alternatives: [], why: 'ADR20, the 10-day MA and the streak evidence need them; shorter histories are not screened (declared)' },
  { id: 'MA-PS-IDENTITY', reference: 'first IEX print within the first 5 minutes and within 5 % of the raw official open; the whole-day high / low agreement (R9) is evidence only', alternatives: [], why: 'ticker reuse; the gate must be known at the decision, never selected by the day\'s outcome' },
  { id: 'MA-PS-ENTRY', reference: 'ORL_5: short one raw cent below the 5-minute opening range low (IEX lows and the official open), active from minute 5', alternatives: ['FIRST_RED_5MIN: below the low of the first completed red 5-minute candle', 'FAILED_VWAP_RETEST: after a minute closed below the IEX VWAP, the first minute that trades up to the VWAP and closes below it; short at that close'], why: 'KK-020 / KK-021 (OPTIONAL) leave the choice open; "ORL" names no length, 5 minutes matches the 5-minute candle of KK-020' },
  { id: 'MA-PS-FILL', reference: 'fill = min(level, open of the first IEX minute whose low reaches the level) (never better than the level)', alternatives: [], why: 'IEX prints can jump; a consolidated fill is not known' },
  { id: 'MA-PS-STOP', reference: 'HOD: buy stop one raw cent above the high of day before the fill minute (official open included), stop-market', alternatives: ['VWAP_RECLAIM: cover at the close of the first minute after the fill that closes above the IEX VWAP (high-of-day stop kept as the hard stop)'], why: 'KK-022 (CONTEXTUAL) names both' },
  { id: 'MA-PS-TARGET', reference: 'MA10: cover the whole position at the 10-day MA of the prior close (limit; an open below it covers at the open)', alternatives: ['MA20', 'HALF_MA10_REST_MA20'], why: 'KK-023 (PREFERENCE) "toward the 10 / 20-day MA, early partials" gives no split' },
  { id: 'MA-PS-SAME-MINUTE', reference: 'PESSIMISTIC: a minute (or daily bar) that reaches both the stop and the target is a stop', alternatives: [], why: 'the order inside one bar is unknown' },
  { id: 'MA-PS-BORROW', reference: 'NOT MODELLED: borrow availability, locates and fees are unknown; a trade is a hypothetical short', alternatives: [], why: 'KK-SF-PS-BORROW DATA_BLOCKED (KK-030); never an executable short' },
  { id: 'MA-PS-UNIVERSE', reference: 'VU_TOURNAMENT_UNIVERSE_705 at the session before the trade day', alternatives: [], why: 'measurement convention shared by every method' },
  { id: 'MA-PS-COSTS', reference: '10 bps slippage per side, 1 bp commission; no borrow fee (unknown)', alternatives: [], why: 'platform policy; borrow DATA_BLOCKED' },
]);

export const PS_REFERENCE_CONFIG = Object.freeze({ streak: 3, accel: true, entry: 'ORL_5', stop: 'HOD', target: 'MA10', borrow: 'NOT_MODELLED' });
export const PS_RUN_VARIANTS = Object.freeze([
  { id: 'REF', changes: {} },
  { id: 'ALT-STREAK4', changes: { streak: 4 } },
  { id: 'ALT-NO-ACCEL', changes: { accel: false } },
  { id: 'ALT-ENTRY-FIRST-RED-5MIN', changes: { entry: 'FIRST_RED_5MIN' } },
  { id: 'ALT-ENTRY-FAILED-VWAP-RETEST', changes: { entry: 'FAILED_VWAP_RETEST' } },
  { id: 'ALT-STOP-VWAP-RECLAIM', changes: { stop: 'VWAP_RECLAIM' } },
  { id: 'ALT-TARGET-MA20', changes: { target: 'MA20' } },
  { id: 'ALT-TARGET-HALF-MA10-MA20', changes: { target: 'HALF_MA10_REST_MA20' } },
].map((v) => Object.freeze({ ...v, config: Object.freeze({ ...PS_REFERENCE_CONFIG, ...v.changes }) })));

export function validatePsConfig(cfg) {
  const e = [];
  if (cfg.borrow !== 'NOT_MODELLED') e.push('BORROW_IS_DATA_BLOCKED');
  if (![3, 4].includes(cfg.streak)) e.push('STREAK');
  if (typeof cfg.accel !== 'boolean') e.push('ACCEL');
  if (!['ORL_5', 'FIRST_RED_5MIN', 'FAILED_VWAP_RETEST'].includes(cfg.entry)) e.push('ENTRY');
  if (!['HOD', 'VWAP_RECLAIM'].includes(cfg.stop)) e.push('STOP');
  if (!['MA10', 'MA20', 'HALF_MA10_REST_MA20'].includes(cfg.target)) e.push('TARGET');
  return e;
}

/** PS_CHART_CANDIDATE for trade day t, decided at the close of t - 1 from bars 0..t-1 only. */
export function psChartCandidate(bars, t, cfg = PS_REFERENCE_CONFIG) {
  const i = t - 1;
  if (t < PS_MIN_HISTORY || !bars[t]) return null;
  const ev = parabolicEvidence(bars, i), adr = adr20(bars, i + 1); // ADR of the 20 sessions up to and including i
  if (!(ev.upStreak >= cfg.streak) || !fin(adr)) return null;
  const rets = ev.streakReturns.slice(-cfg.streak);
  const accel = rets.every((r, k) => k === 0 || r >= rets[k - 1]);
  if (cfg.accel && !accel) return null;
  const sum = rets.reduce((a, b) => a + b, 0);
  if (!(sum * 100 >= 3 * adr)) return null;
  const m10 = smaAt(bars, i, 10);
  if (!(fin(m10) && bars[i].close > m10)) return null;
  return { t, date: bars[t].date, class: PS_CLASS.CHART, upStreak: ev.upStreak, streakReturnSum: sum, accelerating: accel, adr20: adr, distanceToMA10: ev.distanceToMA10, distanceToMA20: ev.distanceToMA20, borrow: 'DATA_BLOCKED' };
}

/** Short entry of the trade day from minutes in time order (raw prices). */
export function psEntry(minutes, bar, cfg, rawFactor) {
  const f = rawFactor > 0 ? rawFactor : 1, tick = rawTickAdjusted(bar) * f, officialOpen = bar.open * f;
  const { vwap } = runningVwap(minutes);
  let high = officialOpen, level = null, from = Infinity, belowVwap = false;
  if (cfg.entry === 'ORL_5') { const or = openingRange(minutes, 5, officialOpen); if (!or) return { status: 'NO_OPENING_RANGE' }; level = or.low - tick; from = 5; }
  if (cfg.entry === 'FIRST_RED_5MIN') {
    const red = fiveMinuteCandles(minutes).find((c) => c.close < c.open);
    if (!red) return { status: 'NO_RED_5MIN_CANDLE' };
    level = red.low - tick; from = red.completeAt;
  }
  for (let j = 0; j < minutes.length; j++) {
    const m = minutes[j];
    if (cfg.entry === 'FAILED_VWAP_RETEST') {
      const vw = j > 0 ? vwap[j - 1] : null; // VWAP known before minute j
      if (belowVwap && fin(vw) && m.high >= vw && m.close < vw) return { status: 'FILLED', fill: m.close, minuteIndex: j, hodBefore: Math.max(high, m.high), fillAtClose: true };
      if (fin(vwap[j]) && m.close < vwap[j]) belowVwap = true;
    } else if (m.k >= from && m.low <= level) return { status: 'FILLED', fill: Math.min(level, m.open), minuteIndex: j, hodBefore: high, fillAtClose: false };
    high = Math.max(high, m.high);
  }
  return { status: 'NOT_TRIGGERED' };
}

const SLIP = PS_COSTS.slippageBps / 1e4, FEE = PS_COSTS.commissionBps / 1e4;
/** Net short return of one unit: sell at entry (less slippage), buy back at exit (plus slippage), commission both sides. */
export const shortReturn = (entry, exit) => (entry * (1 - SLIP) - exit * (1 + SLIP) - (entry + exit) * FEE) / entry;

/**
 * One candidate: intraday entry and entry-day exits from minutes, later days from daily bars (adjusted prices).
 * Returns { status, trade? } – never simulated without minutes.
 */
export function runPsCandidate({ bars, cand, minutes, cfg }) {
  const t = cand.t, bar = bars[t], f = bar.splitAdj > 0 ? bar.splitAdj : 1;
  if (bar.date < PS_FIRST_INTRADAY_DATE) return { status: 'NOT_EXECUTED_BEFORE_IEX_HISTORY' };
  if (minutes === undefined) return { status: 'NOT_EXECUTED_INTRADAY_NOT_FETCHED' };
  if (!minutes.length) return { status: 'NOT_EXECUTED_NO_INTRADAY_DATA' };
  const idc = openIdentityCheck(minutes, bar, f);
  if (idc.status !== 'IDENTITY_OK') return { status: idc.status === 'IDENTITY_MISMATCH' ? 'NOT_EXECUTED_IDENTITY_MISMATCH' : `NOT_EXECUTED_${idc.status}` };
  const dayRangeAgreement = identityCheck(minutes, bar, f).status; // evidence only (whole day)
  const e = psEntry(minutes, bar, cfg, f);
  if (e.status !== 'FILLED') return { status: e.status === 'NOT_TRIGGERED' ? 'NOT_TRIGGERED' : `NOT_EXECUTED_${e.status}` };
  const tick = rawTickAdjusted(bar) * f, stopRaw = e.hodBefore + tick;
  if (!(stopRaw > e.fill)) return { status: 'NOT_EXECUTED_STOP_NOT_ABOVE_ENTRY' };
  const maOf = (n) => smaAt(bars, t - 1, n); // targets fixed from the prior close (known before the trade day)
  const legs = cfg.target === 'HALF_MA10_REST_MA20' ? [{ frac: 0.5, ma: 10 }, { frac: 0.5, ma: 20 }] : [{ frac: 1, ma: cfg.target === 'MA20' ? 20 : 10 }];
  const targets = legs.map((l) => ({ ...l, levelRaw: fin(maOf(l.ma)) ? maOf(l.ma) * f : null, done: null }));
  if (targets.some((x) => !(x.levelRaw < e.fill))) return { status: 'NOT_EXECUTED_TARGET_NOT_BELOW_ENTRY' };
  const fills = [], open = () => targets.filter((x) => !x.done);
  const close = (x, priceRaw, reason, date) => { x.done = { price: priceRaw / f, reason, date }; fills.push({ frac: x.frac, priceAdj: priceRaw / f, reason, date }); };
  // entry day: minutes after the fill (a fill at a minute close starts with the next minute)
  const { vwap } = runningVwap(minutes);
  for (let q = e.fillAtClose ? e.minuteIndex + 1 : e.minuteIndex; q < minutes.length && open().length; q++) {
    const m = minutes[q], fillMinute = q === e.minuteIndex && !e.fillAtClose;
    // MA-PS-SAME-MINUTE: a minute reaching the stop is a stop (on the fill minute its high may precede the fill: assumed)
    if (m.high >= stopRaw) { const px = fillMinute ? stopRaw : Math.max(stopRaw, m.open); for (const x of open()) close(x, px, fillMinute ? 'PS_STOP_HOD_FILL_MINUTE_ASSUMED' : 'PS_STOP_HOD', bar.date); break; }
    if (cfg.stop === 'VWAP_RECLAIM' && !fillMinute && fin(vwap[q]) && m.close > vwap[q]) { for (const x of open()) close(x, m.close, 'PS_VWAP_RECLAIM', bar.date); break; }
    if (!fillMinute) for (const x of open()) if (m.low <= x.levelRaw) close(x, Math.min(x.levelRaw, m.open), `PS_TARGET_MA${x.ma}`, bar.date);
  }
  // later days: daily bars (adjusted), stop-market above the entry-day stop; each target is the MA of the prior close
  const sAdj = stopRaw / f;
  for (let d = t + 1; d < bars.length && open().length; d++) {
    const b = bars[d];
    if (![b.open, b.high, b.low].every(fin)) continue;
    if (b.high >= sAdj) { for (const x of open()) close(x, Math.max(sAdj, b.open) * f, b.open >= sAdj ? 'PS_STOP_HOD_GAP_OPEN' : 'PS_STOP_HOD', b.date); break; }
    for (const x of open()) { const lv = smaAt(bars, d - 1, x.ma); if (fin(lv) && b.low <= lv) close(x, Math.min(lv, b.open) * f, `PS_TARGET_MA${x.ma}`, b.date); }
  }
  if (open().length) return { status: 'OPEN_AT_DATA_END', trade: { entryDate: bar.date, entryAdj: e.fill / f, stopAdj: stopRaw / f, fills } };
  const ret = fills.reduce((a, x) => a + x.frac * shortReturn(e.fill / f, x.priceAdj), 0);
  const riskPerUnit = (stopRaw - e.fill) / e.fill;
  return { status: 'CLOSED', trade: { entryDate: bar.date, entryMinute: minutes[e.minuteIndex].k, entryAdj: e.fill / f, stopAdj: stopRaw / f, fills, exitReasons: fills.map((x) => x.reason), netReturn: ret, rMultiple: riskPerUnit > 0 ? ret / riskPerUnit : null, class: PS_CLASS.INTRADAY_CONFIRMED, borrow: 'DATA_BLOCKED', dayRangeAgreement } };
}

export function psVariantRegistrySha256() {
  return crypto.createHash('sha256').update(JSON.stringify({ version: KK_PS_STUDY_VERSION, reference: PS_REFERENCE_CONFIG, variants: PS_RUN_VARIANTS.map((v) => ({ id: v.id, changes: v.changes })), costs: PS_COSTS })).digest('hex');
}
export { tickerOf, KK_VERSION, KK_INTRADAY_VERSION };
