/**
 * Stan Weinstein Stage 2 Investor (C04) and Stage 2 Trader continuation (C05) - two separate machine screens with a
 * manual layer (contracts/weinstein.mjs). Source: #709 B09 (1988 reprint, English, original wording checked).
 *
 * Machine gates are only rules that need no judgment: WEIN-MA (no long buy below or at a falling 30-week MA).
 * Everything else is evidence for the reviewer: stage (WEIN-S1..S4, NO3, NO4), volume confirmation (WEIN-VOL with the
 * three printed alternatives, no magic multiplier, VOL4), relative strength (no RS > 0 gate, RSZERO / RSNO), overhead
 * resistance, support stops. Group stage and market breadth are DATA_BLOCKED and never substituted.
 *
 * Timing: a buy-stop is prepared from the completed prior week (MA gate, resistance, stop proposal); the candidate is
 * the week whose high exceeds the resistance. Weekly bars are ISO weeks of the daily snapshot bars.
 */
import { isoWeekKey } from '../../engine/indicators.mjs';
import { rawTickAdjusted, fin, smaSeries } from '../common/series.mjs';

export const WEINSTEIN_VERSION = 'sf-weinstein-1.0.0';
export const WEIN_PARAMS = Object.freeze({
  maWeeks: 30,              // WEIN-S2 / WEIN-MA
  volumeMultiple: 2,        // WEIN-VOL1 / VOL2 / VOL3 ("at least twice" / "more than twice")
  volMonthWeeks: 4,         // WEIN-VOL1 "previous month" = 4 weeks (derivation)
  volBuildWeeks: [3, 4],    // WEIN-VOL2 "3-4 weeks"
  volDailyPriorSessions: 5, // WEIN-VOL3 "previous week" daily mean
  rsNormWeeks: 52,          // Mansfield-style normalisation of the RS line (evidence only)
  riskGuide: 0.15,          // WEIN-STOP4 guide (evidence only, not a gate)
});

/** ISO-week bars from daily bars. A week is complete when a later daily bar belongs to another week. */
export function weeklyBars(daily) {
  const weeks = [];
  for (let i = 0; i < daily.length; i++) {
    const d = daily[i], k = isoWeekKey(d.date);
    let w = weeks.at(-1);
    if (!w || w.key !== k) { w = { key: k, date: d.date, firstIndex: i, lastIndex: i, open: d.open, high: d.high, low: d.low, close: d.close, volume: 0, splitAdj: d.splitAdj ?? 1, complete: false }; if (weeks.length) weeks.at(-1).complete = true; weeks.push(w); }
    w.lastIndex = i; w.date = d.date; w.close = d.close; w.splitAdj = d.splitAdj ?? 1;
    if (fin(d.high) && (!fin(w.high) || d.high > w.high)) w.high = d.high;
    if (fin(d.low) && (!fin(w.low) || d.low < w.low)) w.low = d.low;
    if (fin(d.volume)) w.volume += d.volume;
  }
  return weeks;
}

export const ma30w = (weeks, n = WEIN_PARAMS.maWeeks) => smaSeries(weeks.map((w) => w.close), n);

/**
 * WEIN-SF-MA-GATE on completed week w: the BUY PRICE (default: the week's close; in the screens the buy-stop trigger)
 * must be above MA30w and MA30w must not be below its value one week earlier. A Stage 1 -> 2 breakout crosses
 * resistance and the MA in the same week, so the prior close below the MA is evidence, not a rejection (SF-R1-02).
 */
export function maGate(weeks, ma, w, buyPrice = weeks[w]?.close) {
  if (!fin(ma[w]) || !fin(ma[w - 1])) return { pass: false, reason: 'MA_UNAVAILABLE' };
  if (!(buyPrice > ma[w])) return { pass: false, reason: 'BUY_PRICE_AT_OR_BELOW_MA30W' };
  if (ma[w] < ma[w - 1]) return { pass: false, reason: 'MA30W_FALLING' };
  return { pass: true, reason: 'CLOSE_ABOVE_NON_FALLING_MA30W', maSlope: ma[w] - ma[w - 1] };
}

/** WEIN-VOL1..3 evidence for breakout week w and its breakout day (daily index); no gate (WEIN-VOL4). */
export function volumeAlternatives(weeks, w, daily, breakoutDay, P = WEIN_PARAMS) {
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const wv = (a, b) => (a < 0 ? null : weeks.slice(a, b).map((x) => x.volume));
  const month = wv(w - P.volMonthWeeks, w), A = month && mean(month) > 0 ? weeks[w].volume / mean(month) : null;
  const B = P.volBuildWeeks.map((n) => {
    const build = wv(w - n, w), before = wv(w - n - P.volMonthWeeks, w - n);
    if (!build || !before || !(mean(before) > 0)) return { weeks: n, ratio: null, rising: null, holds: false };
    const ratio = mean(build) / mean(before), rising = weeks[w].volume > weeks[w - 1].volume;
    return { weeks: n, ratio, rising, holds: ratio >= P.volumeMultiple && rising };
  });
  let C = null;
  if (breakoutDay !== null && breakoutDay >= P.volDailyPriorSessions) {
    const prior = daily.slice(breakoutDay - P.volDailyPriorSessions, breakoutDay).map((d) => d.volume);
    C = mean(prior) > 0 ? daily[breakoutDay].volume / mean(prior) : null;
  }
  const holds = { A: A !== null && A >= P.volumeMultiple, B: B.some((x) => x.holds), C: C !== null && C > P.volumeMultiple };
  return { A: { ratio: A, holds: holds.A, rule: 'WEIN-VOL1' }, B: { variants: B, holds: holds.B, rule: 'WEIN-VOL2' }, C: { ratio: C, holds: holds.C, rule: 'WEIN-VOL3' }, anyAlternative: holds.A || holds.B || holds.C, note: 'evidence; the judgment of a clear confirmation is manual (WEIN-VOL4)' };
}

/** WEIN-RS evidence: RS line = close / benchmark close (weekly), normalised level vs its 52-week mean, recent change. */
export function relativeStrength(weeks, benchWeeklyClose, w, P = WEIN_PARAMS) {
  const rs = weeks.map((x) => { const b = benchWeeklyClose.get(x.key); return fin(b) && b > 0 && fin(x.close) ? x.close / b : null; });
  const norm = smaSeries(rs, P.rsNormWeeks);
  const chg = (n) => (w - n >= 0 && fin(rs[w]) && fin(rs[w - n]) && rs[w - n] > 0 ? rs[w] / rs[w - n] - 1 : null);
  const level = fin(rs[w]) && fin(norm[w]) && norm[w] > 0 ? rs[w] / norm[w] - 1 : null;
  return { rsLine: rs[w], normalisedLevel: level, change4w: chg(4), change13w: chg(13), belowZero: level !== null ? level < 0 : null, improving: chg(4) !== null ? chg(4) > 0 : null, note: 'evidence only: below zero but clearly improving may be bought (WEIN-RSZERO); negative and still poor is no buy (WEIN-RSNO) - reviewer call' };
}

/** WEIN-SF-MARKET evidence: SPY on weekly bars relative to its 30-week MA (breadth data not available). */
export function marketEvidence(benchWeeks, key) {
  const ma = ma30w(benchWeeks), w = benchWeeks.findIndex((x) => x.key === key);
  if (w < 1 || !fin(ma[w]) || !fin(ma[w - 1])) return { status: 'UNAVAILABLE' };
  return { status: 'EVIDENCE_ONLY', spyAboveMa30w: benchWeeks[w].close > ma[w], spyMa30wRising: ma[w] > ma[w - 1], breadth: 'DATA_BLOCKED (NYSE advance / decline, new highs / lows not in the snapshot)' };
}

/** First daily bar of week w whose high exceeds the level (the buy-stop day). */
function breakoutDayOf(week, daily, level) { for (let i = week.firstIndex; i <= week.lastIndex; i++) if (fin(daily[i].high) && daily[i].high >= level) return i; return null; }

/** Week where the MA30w last stopped falling before week w (start of the base); null if none. */
export function baseStart(ma, w) {
  for (let k = w - 1; k >= 2; k--) if (fin(ma[k]) && fin(ma[k - 1]) && fin(ma[k - 2]) && ma[k] >= ma[k - 1] && ma[k - 1] < ma[k - 2]) return k;
  return null;
}

/** Most recent weekly swing high before w: week p <= w-2 that is a local peak and not exceeded in p+1..w-1. */
export function lastSwingHigh(weeks, w) {
  let maxAfter = -Infinity;
  for (let p = w - 1; p >= 1; p--) {
    if (p <= w - 2 && weeks[p].high > maxAfter && weeks[p].high >= weeks[p - 1].high) return p;
    if (weeks[p].high > maxAfter) maxAfter = weeks[p].high;
  }
  return null;
}

const EXIT_POLICY = Object.freeze(['technical only (WEIN-SELL4): stop below support / reaction low, trailing per WEIN-TRAIL* (investor) or WEIN-TR-TRAIL / WEIN-TR-EARLY (trader); no tax, dividend or P/E exit']);

/** Candidate record shared by both screens (MANUAL_REVIEW_REQUIRED, never BUY). */
export function candidateRecord({ methodId, security, daily, weeks, ma, w, resistance, stopProposal, rangeStart, bench }) {
  const wk = weeks[w], dayIdx = breakoutDayOf(wk, daily, resistance.trigger);
  const entryRef = Math.max(daily[dayIdx].open, resistance.trigger);
  const risk = entryRef > 0 ? (entryRef - stopProposal) / entryRef : null;
  const overhead = (() => { let h = null, age = null; for (let k = w - 1; k >= 0; k--) if (weeks[k].high > resistance.level && (h === null || weeks[k].high < h)) { h = weeks[k].high; age = w - k; } return h === null ? { nearestHigherWeeklyHigh: null } : { nearestHigherWeeklyHigh: h, weeksAgo: age, distancePct: h / entryRef - 1 }; })();
  const roundBelow = Math.floor(stopProposal);
  return {
    status: 'MANUAL_REVIEW_REQUIRED', methodId, securityId: security.id, asOfWeek: wk.key, asOf: daily[dayIdx].date, buyDeclarationAllowed: false, version: WEINSTEIN_VERSION,
    buyStop: { level: resistance.trigger, resistance: resistance.level, ruleId: 'WEIN-SF-ORDER', psr709: 'WEIN-ORD' },
    proposedStop: { level: stopProposal, ruleId: methodId === 'SF_WEINSTEIN_INVESTOR' ? 'WEIN-SF-INV-STOP' : 'WEIN-SF-TR-STOP', basis: rangeStart.label, riskPct: risk, riskGuide15pct: risk !== null ? risk <= WEIN_PARAMS.riskGuide : null, nearestRoundNumberBelow: roundBelow, decidedByReviewer: true },
    machineScreenEvidence: [
      { ruleId: 'WEIN-SF-MA-GATE', psr709: 'WEIN-MA', value: { ...maGate(weeks, ma, w - 1, resistance.trigger), ma30w: ma[w - 1], priorCloseAboveMa: weeks[w - 1].close > ma[w - 1] } },
      { ruleId: 'WEIN-SF-STAGE', psr709: 'WEIN-S2', value: { closeVsMa: weeks[w - 1].close / ma[w - 1] - 1, maSlope4w: fin(ma[w - 5]) ? ma[w - 1] / ma[w - 5] - 1 : null, baseOrConsolidationWeeks: w - rangeStart.week } },
      { ruleId: 'WEIN-SF-VOLUME', psr709: 'WEIN-VOL', value: volumeAlternatives(weeks, w, daily, dayIdx) },
      { ruleId: 'WEIN-SF-RS', psr709: 'WEIN-RS', value: bench ? relativeStrength(weeks, bench.weeklyClose, w) : 'BENCHMARK_UNAVAILABLE' },
      { ruleId: 'WEIN-SF-OVERHEAD', psr709: 'WEIN-OH', value: overhead },
      { ruleId: 'WEIN-SF-MARKET', psr709: 'WEIN-MARKET', value: bench ? marketEvidence(bench.weeks, wk.key) : 'BENCHMARK_UNAVAILABLE' },
    ],
    exitPolicy: EXIT_POLICY,
    dataNotAvailableToMachine: ['industry group stage (WEIN-GROUP, DATA_BLOCKED)', 'market breadth (WEIN-MARKET, DATA_BLOCKED)', 'stage judgment', 'significance of the correction / reaction low'],
  };
}

function prepare(security, bench) {
  const daily = security.bars, weeks = weeklyBars(daily), ma = ma30w(weeks);
  return { daily, weeks, ma, bench };
}

/** Benchmark (SPY) weekly view for RS and market evidence. */
export function benchmarkWeekly(benchDaily) {
  const weeks = weeklyBars(benchDaily);
  return { weeks, weeklyClose: new Map(weeks.map((w) => [w.key, w.close])) };
}

/**
 * C04 Investor screen on completed week w (default: last complete week): early Stage 2 breakout above the base
 * resistance; base = weeks since the MA30w last stopped falling (WEIN-SF-INV-BREAKOUT derivation).
 */
export function investorScreen(security, { bench = null, week = null } = {}) {
  const { daily, weeks, ma } = prepare(security, bench);
  const w = week ?? lastComplete(weeks);
  if (w === null || w < 2) return [];
  const s = baseStart(ma, w);
  if (s === null || s > w - 1) return [];
  let level = -Infinity, low = Infinity;
  for (let k = s; k <= w - 1; k++) { level = Math.max(level, weeks[k].high); low = Math.min(low, weeks[k].low); }
  const trigger = level + rawTickAdjusted(weeks[w - 1]);
  if (!maGate(weeks, ma, w - 1, trigger).pass) return [];
  if (!(weeks[w].high >= trigger)) return [];
  return [candidateRecord({ methodId: 'SF_WEINSTEIN_INVESTOR', security, daily, weeks, ma, w, resistance: { level, trigger }, stopProposal: low, rangeStart: { week: s, label: 'lowest weekly low of the base (since the MA30w stopped falling)' }, bench })];
}

/**
 * C05 Trader screen on completed week w: MA30w rising (WEIN-TR-CONT "clearly rising"), breakout over the most recent
 * weekly swing high (new resistance) after at least one consolidation week.
 */
export function traderScreen(security, { bench = null, week = null } = {}) {
  const { daily, weeks, ma } = prepare(security, bench);
  const w = week ?? lastComplete(weeks);
  if (w === null || w < 3) return [];
  const p = lastSwingHigh(weeks, w);
  if (p === null) return [];
  const level = weeks[p].high, trigger = level + rawTickAdjusted(weeks[w - 1]);
  if (!maGate(weeks, ma, w - 1, trigger).pass || !(ma[w - 1] > ma[w - 2])) return [];
  if (!(weeks[w].high >= trigger)) return [];
  let low = Infinity; for (let k = p + 1; k <= w - 1; k++) low = Math.min(low, weeks[k].low);
  return [candidateRecord({ methodId: 'SF_WEINSTEIN_TRADER', security, daily, weeks, ma, w, resistance: { level, trigger }, stopProposal: low, rangeStart: { week: p, label: 'lowest weekly low of the consolidation after the swing high' }, bench })];
}

function lastComplete(weeks) { for (let k = weeks.length - 1; k >= 0; k--) if (weeks[k].complete) return k; return null; }
