/**
 * Minervini SEPA / VCP (C06) and Power Play (C07): mechanical components around the existing screens
 * (methods/minervini.mjs stays unchanged; research/ because method modules do not import each other). Contract: contracts/minervini.mjs. Source: #709 B12 / B07 / B03, every
 * Minervini rule MEDIUM confidence with unchecked English wording (translation-only): nothing here is SOURCE_EXACT.
 *
 * What is mechanical (computed exactly, no added number):
 *  - point-in-time quarterly EPS and revenue growth from the snapshot's SEC data (first-filed date), MIN-EPS-01 /
 *    MIN-QUALITY-03 EVIDENCE: no growth threshold (MIN-EPS-02: "20-25 % is a common minimum, not a SEPA constant");
 *  - a cross-sectional VU relative-strength percentile of the point-in-time research universe (MIN-TT-08 PROXY: the
 *    IBD rating stays DATA_BLOCKED; the proxy never gates);
 *  - position size from a reviewer-chosen equity risk and stop (MIN-TTC-SIZING), capped at 25 % (MIN-MM-SIZE-01),
 *    with the 10 % maximum planned loss flag (MIN-MM-STOP-02);
 *  - stop execution once a stop is set: a low at or below the stop exits regardless of volume (MIN-MM-STOP-01);
 *  - Power Play classification into CONFIRMED_MECHANICAL / MANUAL_REVIEW / DATA_BLOCKED / NOT_QUALIFIED.
 * What stays EVIDENCE with a declared convention (the source gives no mechanical rule):
 *  - VCP contraction footprint (swing highs with a +-5 session window; MIN-VCP-01..06, MIN-VCP-10): counts, depths and
 *    halving are typical, not limits (MIN-VCP-02 / 03); flat bases are allowed (MIN-VCP-04);
 *  - pivot breakout "with increasing volume" (MIN-VCP-07, STRONG_PREFERENCE, DO_NOT_HARDEN): two readings reported
 *    (vs the 50-day mean, vs the prior session), none chosen;
 *  - sell-rule evidence: 3R break-even question (MIN-RISK-05), MA50 guide for early leaders (MIN-MM-SELL-02).
 * Nothing here declares a buy: every output keeps buyDeclarationAllowed false.
 */
import { fin, smaAt, eligibleAtPriorSession, RESEARCH_UNIVERSE } from '../common/series.mjs';
import { trendTemplate, powerPlayScreen, powerPlayPeak, stopCheck, MIN_PARAMS } from '../methods/minervini.mjs';

export const MINERVINI_COMPONENTS_VERSION = 'sf-minervini-components-1.0.1'; // 1.0.1: missing low in the consolidation -> DATA_BLOCKED_SETUP
export const COMPONENT_CONVENTIONS = Object.freeze({
  rsLookbackSessions: 252,   // MIN-TT-08 proxy: 12-month price change (VU convention; IBD's formula is proprietary)
  swingSessions: 5,          // VCP evidence: a swing high is the highest high of +-5 sessions (convention)
  volumeMeanSessions: 50,    // MIN-VCP-06 / MIN-MM-VOL-NUM "50-day volume average" (source number)
  yoyMinDays: 350, yoyMaxDays: 380, // same fiscal quarter one year earlier (end-date distance)
});
const TRANSL = Object.freeze({ translationUnverified: true, clearance: 'REQUIRES_ORIGINAL_OR_EXPLICIT_WEB_CORROBORATION' });
/**
 * Carried by every classification (owner 2026-10-21): a mechanically confirmed setup or a Trend Template pass is a
 * review candidate, never a complete tradable strategy and never a performance statement.
 */
export const NOT_A_STRATEGY = Object.freeze({ tradability: 'NOT_A_TRADABLE_STRATEGY', performanceClaim: 'NONE', meaning: 'machine screen / setup classification for manual review; entry, stop, size and sells stay manual; no historical return is implied' });
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 864e5;

/**
 * MIN-SF-TT-8 proxy: percentile (0-100) of the 252-session price change among research-universe members at `date`
 * (members: eligible at that close, i.e. eligibleAtPriorSession(bars, idx + 1); a change needs a bar 252 bars earlier).
 * Cached per date. Point in time: only bars up to `date`.
 */
export function createRsPercentileProxy(dataset, { lookback = COMPONENT_CONVENTIONS.rsLookbackSessions, universe = RESEARCH_UNIVERSE } = {}) {
  const idx = new Map(dataset.securities.map((s) => [s.id, new Map(s.bars.map((b, i) => [b.date, i]))]));
  const cache = new Map();
  function table(date) {
    if (cache.has(date)) return cache.get(date);
    const rows = [];
    for (const s of dataset.securities) {
      const i = idx.get(s.id).get(date);
      if (i === undefined || i < lookback || !eligibleAtPriorSession(s.bars, i + 1, universe)) continue;
      const a = s.bars[i - lookback].close, b = s.bars[i].close;
      if (fin(a) && fin(b) && a > 0) rows.push([s.id, b / a - 1]);
    }
    rows.sort((x, y) => x[1] - y[1] || x[0].localeCompare(y[0]));
    const m = new Map(); const n = rows.length;
    rows.forEach(([id, r], k) => { let lo = k; while (lo > 0 && rows[lo - 1][1] === r) lo--; m.set(id, { percentile: n > 1 ? (100 * lo) / (n - 1) : 50, change: r }); });
    const t = { date, population: n, map: m };
    cache.set(date, t);
    return t;
  }
  return {
    at(id, date) {
      const t = table(date), v = t.map.get(id);
      return { criterion: 'MIN-SF-TT-8', status: 'DATA_BLOCKED_IBD_RS', gate: false, proxy: v ? { vuPercentile: v.percentile, change252: v.change, population: t.population, note: 'VU percentile of the point-in-time research universe, not the IBD rating (#709)' } : { vuPercentile: null, reason: 'NOT_IN_UNIVERSE_OR_INSUFFICIENT_HISTORY', population: t.population } };
    },
  };
}

/** Visible quarters (first filed strictly before the session date: a same-day filing may be after the close). */
function visible(rows, asOfDate) { return (rows || []).filter((r) => r[2] && r[2] < asOfDate && fin(r[1])).sort((a, b) => a[0].localeCompare(b[0])); }
function yoySeries(rows, n) {
  const out = [];
  for (let k = rows.length - 1; k >= 0 && out.length < n; k--) {
    const q = rows[k], prev = rows.slice(0, k).reverse().find((p) => { const d = days(p[0], q[0]); return d >= COMPONENT_CONVENTIONS.yoyMinDays && d <= COMPONENT_CONVENTIONS.yoyMaxDays; });
    if (!prev) { out.push({ quarterEnd: q[0], value: q[1], filed: q[2], derivedQ4: q[3] === 1, yoy: null, status: 'NO_YEAR_AGO_QUARTER' }); continue; }
    out.push({ quarterEnd: q[0], value: q[1], priorYearValue: prev[1], filed: q[2], derivedQ4: q[3] === 1, yoy: prev[1] > 0 ? q[1] / prev[1] - 1 : null, status: prev[1] > 0 ? 'OK' : 'NEGATIVE_OR_ZERO_BASE' });
  }
  return out;
}

/**
 * MIN-SF-FUNDAMENTALS evidence (MIN-EPS-01, MIN-QUALITY-03): the last 4 visible quarters with year-over-year growth of
 * EPS and revenue. fund: segment fund { eps: [[end, value, firstFiled, derivedQ4]], rev: [...] } (validation/sec-pit.mjs).
 * No gate, no threshold; earnings quality (core vs one-off, MIN-QUALITY-01/02) is not visible in these numbers.
 */
export function fundamentalEvidence(fund, asOfDate) {
  if (!fund || (!fund.eps?.length && !fund.rev?.length)) return { ruleId: 'MIN-SF-FUNDAMENTALS', status: 'NO_PIT_FUNDAMENTALS', gate: false };
  const eps = yoySeries(visible(fund.eps, asOfDate), 4), rev = yoySeries(visible(fund.rev, asOfDate), 4);
  if (!eps.length && !rev.length) return { ruleId: 'MIN-SF-FUNDAMENTALS', status: 'NO_QUARTER_FILED_BEFORE_DATE', gate: false };
  const accel = (s) => (s.length >= 2 && fin(s[0].yoy) && fin(s[1].yoy) ? s[0].yoy > s[1].yoy : null);
  return {
    ruleId: 'MIN-SF-FUNDAMENTALS', status: 'EVIDENCE_ONLY', gate: false, asOf: asOfDate,
    eps: { quarters: eps, latestYoy: eps[0]?.yoy ?? null, accelerating: accel(eps) },
    revenue: { quarters: rev, latestYoy: rev[0]?.yoy ?? null, accelerating: accel(rev) },
    latestQuarterAgeDays: eps[0] ? Math.round(days(eps[0].quarterEnd, asOfDate)) : rev[0] ? Math.round(days(rev[0].quarterEnd, asOfDate)) : null,
    context: 'MIN-EPS-02: 20-25 % is a common growth-manager minimum, 30-40 % characterises many superperformers; not a SEPA constant. Earnings quality (MIN-QUALITY-01/02) needs the filing text.',
    pointInTime: 'first-filed date strictly before the session (sec-pit companyfacts); Q4 derived as FY - Q1..Q3 is flagged derivedQ4',
  };
}

/**
 * VCP contraction footprint (evidence; MIN-VCP-01..06, MIN-VCP-10). Base: from the highest high of the last 252
 * sessions to bar i. Swing high = highest high of the +-swing sessions around it (confirmed only with `swing` later
 * bars). Each contraction = swing high -> lowest low before the next higher-or-equal swing high (or bar i).
 */
export function vcpContractions(bars, i, { swing = COMPONENT_CONVENTIONS.swingSessions, P = MIN_PARAMS } = {}) {
  if (i < P.yearSessions) return { status: 'INSUFFICIENT_HISTORY', gate: false };
  for (let k = i - P.yearSessions + 1; k <= i; k++) if (!fin(bars[k].high) || !fin(bars[k].low) || !fin(bars[k].volume)) return { status: 'MISSING_DATA', gate: false };
  let hk = i - P.yearSessions + 1; for (let k = hk; k <= i; k++) if (bars[k].high >= bars[hk].high) hk = k;
  const swings = [];
  for (let k = hk; k <= i - swing; k++) {
    let top = true; for (let m = Math.max(hk, k - swing); m <= k + swing; m++) if (m !== k && bars[m].high > bars[k].high) { top = false; break; }
    if (top && (!swings.length || k - swings.at(-1) > swing)) swings.push(k);
  }
  if (!swings.length || swings[0] !== hk) swings.unshift(hk);
  const contractions = [];
  for (let s = 0; s < swings.length; s++) {
    const a = swings[s], b = s + 1 < swings.length ? swings[s + 1] : i + 1;
    let lo = Infinity, lk = a; for (let k = a + 1; k < b; k++) if (bars[k].low < lo) { lo = bars[k].low; lk = k; }
    if (lo === Infinity) continue;
    let vs = 0, vn = 0; for (let k = a; k <= lk; k++) { vs += bars[k].volume; vn++; }
    contractions.push({ highDate: bars[a].date, high: bars[a].high, lowDate: bars[lk].date, low: lo, depth: 1 - lo / bars[a].high, sessions: lk - a, meanVolume: vs / vn });
  }
  const depths = contractions.map((c) => c.depth);
  const v50 = (() => { let s = 0; for (let k = i - P.ma[0]; k < i; k++) s += bars[k].volume; return s / P.ma[0]; })();
  const last = contractions.at(-1);
  let upV = 0, dnV = 0; for (let k = hk + 1; k <= i; k++) { if (bars[k].close > bars[k - 1].close) upV += bars[k].volume; else if (bars[k].close < bars[k - 1].close) dnV += bars[k].volume; }
  const pivotIndex = swings.at(-1);
  let dry = Infinity; if (last) for (let k = pivotIndex; k <= i; k++) dry = Math.min(dry, bars[k].volume); // since the last swing high
  return {
    status: 'EVIDENCE_ONLY', gate: false, ...TRANSL, version: MINERVINI_COMPONENTS_VERSION,
    base: { highDate: bars[hk].date, high: bars[hk].high, sessions: i - hk },
    contractions, count: contractions.length,
    contractingLeftToRight: depths.length >= 2 ? depths.every((d, k) => k === 0 || d < depths[k - 1]) : null,
    depthRatios: depths.slice(1).map((d, k) => (depths[k] > 0 ? d / depths[k] : null)),
    lastContractionVolumeVs50d: last && v50 > 0 ? last.meanVolume / v50 : null,
    driestDayVolumeVs50d: Number.isFinite(dry) && v50 > 0 ? dry / v50 : null,
    upDownVolumeRatio: dnV > 0 ? upV / dnV : null,
    pivot: { level: bars[pivotIndex].high, date: bars[pivotIndex].date, basis: 'high of the last confirmed swing high (convention)' },
    conventions: `swing high = highest high of +-${swing} sessions; 2-6 contractions and approximate halving are typical, not limits (MIN-VCP-02/03); flat bases allowed (MIN-VCP-04)`,
  };
}

/** MIN-VCP-07 evidence on bar i: does the high reach the pivot, and with which volume (two readings, none chosen). */
export function pivotBreakout(bars, i, pivot, { P = MIN_PARAMS } = {}) {
  if (!fin(pivot) || i < P.ma[0] || !fin(bars[i]?.high)) return { status: 'NOT_EVALUABLE', gate: false };
  const touched = bars[i].high >= pivot && !(bars[i - 1].close >= pivot);
  let s = 0; for (let k = i - P.ma[0]; k < i; k++) { if (!fin(bars[k].volume)) return { status: 'MISSING_VOLUME', gate: false }; s += bars[k].volume; }
  const v50 = s / P.ma[0], v = bars[i].volume, pv = bars[i - 1].volume;
  return {
    status: touched ? 'PIVOT_REACHED' : bars[i - 1].close >= pivot ? 'ALREADY_ABOVE_PIVOT' : 'BELOW_PIVOT', gate: false, ...TRANSL,
    referenceFill: touched ? Math.max(bars[i].open, pivot) : null,
    volume: { vs50dMean: v50 > 0 ? v / v50 : null, vsPriorSession: pv > 0 ? v / pv : null, increasingVs50d: v50 > 0 ? v > v50 : null, increasingVsPriorSession: pv > 0 ? v > pv : null, readings: 'MIN-VCP-07 "with increasing volume": both readings reported; MIN-MM-VOL-EX: buy on price first, judge volume afterwards' },
  };
}

/**
 * MIN-TTC-SIZING / MIN-MM-SIZE-01: shares from the reviewer's accepted equity risk and the stop distance, capped at
 * 25 % of equity. riskFraction has no default (MIN-MM-SIZE-03/04 ranges are context): the reviewer must set it.
 */
export function positionSize({ equity, riskFraction, entry, stop, maxWeight = 0.25 } = {}) {
  if (!(riskFraction > 0 && riskFraction < 1)) return { status: 'RISK_FRACTION_REQUIRED', note: 'reviewer decision; #709 context: 1.25-2.5 % (MIN-MM-SIZE-03), 0.75-1.25 % average, at most 2.5 % (MIN-MM-SIZE-04)' };
  if (!(equity > 0) || !(entry > 0) || !fin(stop) || !(stop < entry)) return { status: 'INVALID_INPUT' };
  const byRisk = Math.floor((equity * riskFraction) / (entry - stop) + 1e-9), byWeight = Math.floor((maxWeight * equity) / entry + 1e-9);
  const shares = Math.min(byRisk, byWeight);
  return { status: 'SIZED', shares, cappedByMaxWeight: byWeight < byRisk, weight: (shares * entry) / equity, riskAmount: shares * (entry - stop), riskOfEquity: (shares * (entry - stop)) / equity, stopCheck: stopCheck(entry, stop), rules: ['MIN-TTC-SIZING', 'MIN-MM-SIZE-01 (25 %)', 'MIN-MM-STOP-02 (10 % flag)'], ...TRANSL };
}

/**
 * Exit evidence of a reviewer position on bar i. MIN-MM-STOP-01 is mechanical once the stop exists: a low at or below
 * the stop exits at min(open, stop) regardless of volume. 3R break-even (MIN-RISK-05) and the MA50 guide
 * (MIN-MM-SELL-02) are review questions, never forced sales.
 */
export function sellEvidence(bars, i, { entry, stop }) {
  const b = bars[i];
  if (!(entry > 0) || !fin(stop) || !b) return { status: 'NO_POSITION_INPUT' };
  const stopHit = fin(b.low) && b.low <= stop;
  const r = entry - stop > 0 ? (b.close - entry) / (entry - stop) : null, ma50 = smaAt(bars, i, 50);
  return {
    status: stopHit ? 'STOP_EXIT' : 'HOLD_REVIEW', stopExit: stopHit ? { fill: Math.min(b.open, stop), rule: 'MIN-MM-STOP-01 (regardless of volume)' } : null,
    rMultiple: r, reviewQuestions: [...(r !== null && r >= 3 ? [{ rule: 'MIN-RISK-05', question: 'about 3R: raise the stop at least to break-even? (almost always, no absolute obligation)' }] : []), ...(fin(ma50) && b.close < ma50 ? [{ rule: 'MIN-MM-SELL-02', question: 'close below MA50: for an early leader the MA50 is an additional sell guide' }] : [])],
    ...TRANSL,
  };
}

/**
 * C06 classification on bar i: NOT_QUALIFIED (Trend Template 1-7 fails), DATA_BLOCKED (missing bars), IPO_SCOPE_REVIEW
 * (too little history, MIN-MM-IPO-01), MECHANICAL_SCREEN_PASS (Trend Template 1-7 holds; every other component is
 * evidence and the decision stays MANUAL_REVIEW_REQUIRED). A Trend Template pass is never a complete SEPA trade.
 */
export function sepaClassify(security, i, { rsProxy = null, asOfDate = security.bars[i]?.date } = {}) {
  const tt = trendTemplate(security.bars, i);
  const cls = tt.status === 'TREND_TEMPLATE_1_7_PASS' ? 'MECHANICAL_SCREEN_PASS' : tt.status === 'MISSING_DATA' ? 'DATA_BLOCKED' : tt.status === 'INSUFFICIENT_HISTORY_IPO_SCOPE' ? 'IPO_SCOPE_REVIEW' : 'NOT_QUALIFIED';
  if (cls !== 'MECHANICAL_SCREEN_PASS') return { methodId: 'SF_MINERVINI_SEPA_VCP', securityId: security.id, asOf: asOfDate, classification: cls, trendTemplate: tt.status, buyDeclarationAllowed: false, ...NOT_A_STRATEGY };
  const vcp = vcpContractions(security.bars, i);
  return {
    methodId: 'SF_MINERVINI_SEPA_VCP', securityId: security.id, asOf: asOfDate, classification: cls, buyDeclarationAllowed: false, status: 'MANUAL_REVIEW_REQUIRED', version: MINERVINI_COMPONENTS_VERSION, ...TRANSL, ...NOT_A_STRATEGY,
    components: {
      trendTemplate: { state: 'MECHANICAL_PASS', value: tt },
      relativeStrength: { state: 'DATA_BLOCKED_IBD_RS', value: rsProxy ? rsProxy.at(security.id, asOfDate) : null },
      fundamentals: { state: 'EVIDENCE_MANUAL', value: fundamentalEvidence(security.fund, asOfDate) },
      vcp: { state: 'EVIDENCE_MANUAL', value: vcp },
      pivot: { state: 'EVIDENCE_MANUAL', value: vcp.pivot ? pivotBreakout(security.bars, i, vcp.pivot.level) : null },
      entry: { state: 'MANUAL' }, stop: { state: 'MANUAL_THEN_MECHANICAL_EXECUTION' }, sizing: { state: 'MECHANICAL_GIVEN_REVIEWER_RISK' }, sell: { state: 'MANUAL_WITH_EVIDENCE' },
    },
  };
}

/**
 * C07 classification on bar i:
 *  - NOT_QUALIFIED: no +100 % run-up in < 8 weeks with the run-up high still the high, or a correction > 25 %;
 *  - DATA_BLOCKED_SETUP: the window cannot be evaluated (missing bars in the last 2 x 40 sessions), a low of the
 *    consolidation is missing so the correction cannot be measured (MISSING_LOW_IN_CONSOLIDATION, 1.0.1), or the run-up
 *    start volume evidence (MIN-PP-02 "begins with strong volume") has no 50-session history;
 *  - MANUAL_REVIEW_SETUP: qualified, but a printed range or OR branch needs judgment (correction 20-25 %, not tight ->
 *    VCP characteristics, consolidation beyond the typical 3-6 weeks);
 *  - CONFIRMED_MECHANICAL_SETUP: every machine-decidable component holds unambiguously (run-up, correction <= 20 %,
 *    tight <= 10 %, typical duration, start volume measurable). The strong-volume judgment, entry, stop and size stay
 *    manual: "confirmed" means the mechanical part, never a trade.
 */
export function powerPlayClassify(security, i, P = MIN_PARAMS) {
  const bars = security.bars, from = Math.max(0, i - 2 * P.ppMaxSessions);
  const base = { methodId: 'SF_MINERVINI_POWER_PLAY', securityId: security.id, asOf: bars[i]?.date, buyDeclarationAllowed: false, version: MINERVINI_COMPONENTS_VERSION, ...TRANSL, ...NOT_A_STRATEGY };
  if (i < P.ppMaxSessions) return { ...base, classification: 'DATA_BLOCKED_SETUP', reasons: ['INSUFFICIENT_HISTORY'] };
  for (let k = from; k <= i; k++) if (!fin(bars[k].high) || !fin(bars[k].low)) return { ...base, classification: 'DATA_BLOCKED_SETUP', reasons: ['MISSING_BARS_IN_WINDOW'] };
  const [rec] = powerPlayScreen(security, { asOfIndex: i }, P);
  if (!rec) {
    // the screen emits nothing when a consolidation low is missing (correction not measurable): data, not a rejection
    const peak = powerPlayPeak(bars, i, P);
    if (peak) for (let k = peak.p + 1; k <= i; k++) if (!fin(bars[k].low)) return { ...base, classification: 'DATA_BLOCKED_SETUP', reasons: ['MISSING_LOW_IN_CONSOLIDATION'], dataGaps: ['MISSING_LOW_IN_CONSOLIDATION'], peakDate: bars[peak.p].date };
    return { ...base, classification: 'NOT_QUALIFIED' };
  }
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
