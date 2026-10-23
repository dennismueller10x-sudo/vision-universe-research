/**
 * Kullamaegi Episodic Pivot (C09, contracts/kullamagi.mjs) – CHART-FIRST research model on the shared research engine
 * (research/lifecycle-engine.mjs, order type INTRADAY_RESOLVED) with REAL Tiingo IEX minute bars (research/kk-intraday.mjs).
 *
 * Owner decision (2026-10-23): no news / catalyst database. The catalyst (KK-015 / -038 / -039 / -040) stays
 * DATA_BLOCKED and documented; a chart setup is NEVER an original Episodic Pivot. Three strictly separate classes:
 *  - CHART_EP_CANDIDATE                   daily chart: gap of the official open over the prior close >= 10 % (KK-015
 *                                         printed size, STRONG_PREFERENCE, used as a declared screen convention);
 *  - INTRADAY_CONFIRMED_CHART_EP_SETUP    a candidate whose IEX minutes show the opening-volume pace and a break of the
 *                                         opening range high with an acceptable low-of-day stop (KK-016 / -037 / -032 /
 *                                         -034), all decided in time order;
 *  - CATALYST_CONFIRMED_ORIGINAL_EP       never assigned: no verified catalyst data.
 * Source mechanics used:
 *  - KK-032 (PREFERENCE): mostly the first 1-minute opening range high; KK-033 (OPTIONAL) 5-minute ORH -> alternative;
 *  - KK-034 (HARD, SOURCE_EXACT): stop = low of day, distance at most 1.5 ADR20, a wider stop rejects (never tighter);
 *  - KK-016 / KK-037 (PREFERENCE): exceptional opening volume, ideally the daily average within 15-20 minutes. Read on
 *    the IEX venue only: cumulative IEX volume since the open against the mean IEX daily volume of the 20 prior sessions;
 *  - KK-017 (CONTEXTUAL, SOURCE_AMBIGUOUS): the article names 20 / 50-day and later 10 / 20-day MAs: the reference
 *    trails with the 20-day MA (named in both readings), 10 and 50 are alternatives;
 *  - KK-027 stop-market (engine), KK-001 30 % overnight cap (engine, platform cap 25 % stricter).
 * Point in time inside the day: the opening range is known at its last minute; the volume pace at minute k uses the
 * minutes before k; the buy stop fills in the first minute whose high crosses the level; the low of day used as the stop
 * is the official open and the IEX lows BEFORE the fill minute; later minutes only decide a same-day stop. The order is
 * armed at the prior close as a technical vehicle only (an unfilled order reserves nothing); every condition is checked
 * inside the trade day.
 */
import crypto from 'node:crypto';
import { fin, smaAt, rawTickAdjusted } from '../common/series.mjs';
import { adr20, epStopCheck, KK_PARAMS, KK_VERSION } from '../methods/kullamagi.mjs';
import { eligibilityResult } from './lifecycle-engine.mjs';
import { KK_INTRADAY_VERSION, openingRange, runningVwap, identityCheck, openIdentityCheck, tickerOf } from './kk-intraday.mjs';

export const KK_EP_LIFECYCLE_VERSION = 'kk-ep-chart-lifecycle-1.1.0';
export const EP_LABEL = 'CHART_EP_MODEL_STUDY_IEX_INTRADAY_NOT_AN_ORIGINAL_EPISODIC_PIVOT';
export const EP_CLASS = Object.freeze({ CHART: 'CHART_EP_CANDIDATE', INTRADAY_CONFIRMED: 'INTRADAY_CONFIRMED_CHART_EP_SETUP', ORIGINAL: 'CATALYST_CONFIRMED_ORIGINAL_EP' });
export const EP_ORIGINAL_CLASS_ASSIGNABLE = false; // catalyst data DATA_BLOCKED (owner decision 2026-10-23: no news database)
export const EP_FIRST_INTRADAY_DATE = '2017-01-03'; // IEX minutes start in 2017 (R9, Phase 1)
export const EP_MIN_HISTORY = 64; // 63 prior sessions for the range / run evidence plus the prior close
export const IEX_BASELINE_SESSIONS = 20, IEX_BASELINE_MIN_DAYS = 15;

export const EP_MODEL_ASSUMPTIONS = Object.freeze([
  { id: 'MA-EP-CATALYST-NOT-VERIFIED', phase: 'SETUP_QUALIFICATION', reference: 'NOT_VERIFIED: no catalyst filter; no setup is an original EP', alternatives: [], why: 'owner decision 2026-10-23: chart-first, no news / catalyst history (KK-SF-EP-CATALYST DATA_BLOCKED)' },
  { id: 'MA-EP-HISTORY', phase: 'SETUP_QUALIFICATION', reference: 'a candidate needs 64 prior sessions in the snapshot (63-session range / run evidence + prior close)', alternatives: [], why: 'the quiet-phase evidence (KK-035) and its alternative read 63 sessions; a shorter history is not screened (IPO gaps are therefore excluded, declared)' },
  { id: 'MA-EP-IDENTITY', phase: 'ENTRY_ELIGIBILITY', reference: 'first IEX print within the first 5 minutes and within 5 % of the raw official open; otherwise not executed. The whole-day IEX high / low agreement (R9, 1 %) is evidence only', alternatives: [], why: 'tickers are reused after delistings; the gate must be known at the decision, a whole-day check would select days by their outcome' },
  { id: 'MA-EP-IEX-PRINTS', phase: 'INITIAL_STOP', reference: 'every IEX minute after the fill is taken as printed (no per-minute outlier filter); a single bad print can trigger the same-day stop', alternatives: [], why: 'a filter would need the day after the decision; the whole-day agreement is reported as evidence (dayRangeAgreement)' },
  { id: 'MA-EP-GAP-SCREEN', phase: 'SETUP_QUALIFICATION', reference: 'official open / prior close - 1 >= 10 % (KK-015 printed size as a declared screen convention)', alternatives: [], why: 'KK-015 is a STRONG_PREFERENCE description; the printed 10 % is the only number the source gives' },
  { id: 'MA-EP-QUIET-PHASE', phase: 'SETUP_QUALIFICATION', reference: 'NONE: the prior range and run are evidence only (KK-SF-EP-SIDEWAYS manual)', alternatives: ['PRIOR_RUN_LIMIT_50: prior close at most 50 % above the lowest low of the 63 sessions before the gap ("without a big prior run", declared convention)'], why: 'KK-035 "ideally 3-6 months sideways" gives no measure' },
  { id: 'MA-EP-VOLUME-PACE', phase: 'ENTRY_ELIGIBILITY', reference: 'PACE_20: before the entry minute k <= 20 the cumulative IEX volume since the open is at least the mean IEX daily volume of the 20 prior sessions x k / 20; after minute 20 only if the IEX volume of minutes 0-19 reached that average. Baseline: mean over all 20 prior sessions (a session without IEX volume counts 0), only when at least 15 of them have IEX volume, otherwise not executed', alternatives: ['NONE: no volume condition (volume reported as evidence)'], why: 'KK-037 "ideally the daily average within 15-20 minutes" read on the IEX venue only (IEX is 1-5 % of the market; never compared with consolidated volume)' },
  { id: 'MA-EP-ORH', phase: 'ENTRY_EXECUTION', reference: 'ORH_1: buy stop one raw cent above the opening range of the first session minute (its IEX high and the official open), active from minute 1', alternatives: ['ORH_5: above the 5-minute opening range high, active from minute 5 (KK-033)'], why: 'KK-032 "mostly the first 1-minute opening range high"' },
  { id: 'MA-EP-FILL', phase: 'ENTRY_EXECUTION', reference: 'fill = max(level, open of the first IEX minute whose high reaches the level) (IEX prints can jump; never better than the level)', alternatives: [], why: 'IEX is one venue; a consolidated fill price is not known' },
  { id: 'MA-EP-LOD-AT-ENTRY', phase: 'INITIAL_STOP', reference: 'low of day = min(official open, IEX lows of the minutes BEFORE the fill minute)', alternatives: [], why: 'the opening auction is not an IEX print (R9 A4); the fill minute\'s own low is not known to precede the fill' },
  { id: 'MA-EP-FILL-MINUTE-STOP', phase: 'INITIAL_STOP', reference: 'PESSIMISTIC: a fill minute whose low reaches the stop exits at the stop', alternatives: ['OPTIMISTIC'], why: 'inside one minute the order of the fill and the low is unknown' },
  { id: 'MA-EP-EXIT', phase: 'EXIT_CONDITIONS', reference: 'MA20: first daily close below the 20-day MA exits at the next open (plus the low-of-day stop-market)', alternatives: ['MA10', 'MA50'], why: 'KK-017 names 20 / 50 and later 10 / 20-day MAs (SOURCE_AMBIGUOUS, KK-C2); 20 is named in both readings' },
  { id: 'MA-EP-SIZING', phase: 'POSITION_SIZING', reference: 'RISK 0.005 of equity to the low-of-day stop, KK-001 cap 30 % (platform 25 %)', alternatives: ['RISK 0.0025', 'RISK 0.01'], why: 'KK-SF-SIZE is the reviewer\'s; the printed context ranges KK-003 / KK-025' },
  { id: 'MA-EP-UNIVERSE', phase: 'ENTRY_ELIGIBILITY', reference: 'VU_TOURNAMENT_UNIVERSE_705 at the session before the gap day', alternatives: [], why: 'measurement convention shared by every method' },
  { id: 'MA-EP-COSTS', phase: 'ENTRY_EXECUTION', reference: '10 bps slippage per side, 1 bp commission (platform policy)', alternatives: [], why: 'no costs in the source' },
]);

export const EP_REFERENCE_CONFIG = Object.freeze({ catalyst: 'NOT_VERIFIED', gapMin: 0.10, quietPhase: 'NONE', volumeRule: 'PACE_20', orMinutes: 1, exitMa: 20, intrabarOrder: 'PESSIMISTIC', sizing: Object.freeze({ mode: 'RISK', riskFraction: 0.005 }) });
export const EP_RUN_VARIANTS = Object.freeze([
  { id: 'REF', changes: {} },
  { id: 'ALT-ORH-5', changes: { orMinutes: 5 } },
  { id: 'ALT-NO-VOLUME-RULE', changes: { volumeRule: 'NONE' } },
  { id: 'ALT-QUIET-PRIOR-RUN-50', changes: { quietPhase: 'PRIOR_RUN_LIMIT_50' } },
  { id: 'ALT-EXIT-MA10', changes: { exitMa: 10 } },
  { id: 'ALT-EXIT-MA50', changes: { exitMa: 50 } },
  { id: 'ALT-FILL-MINUTE-OPTIMISTIC', changes: { intrabarOrder: 'OPTIMISTIC' } },
  { id: 'ALT-RISK-00025', changes: { sizing: { mode: 'RISK', riskFraction: 0.0025 } } },
  { id: 'ALT-RISK-001', changes: { sizing: { mode: 'RISK', riskFraction: 0.01 } } },
].map((v) => Object.freeze({ ...v, config: Object.freeze({ ...EP_REFERENCE_CONFIG, ...v.changes }) })));
export const EP_OPEN_MANUAL_DECISIONS = Object.freeze(['KK-MR-CATALYST', 'KK-SF-EP-SIDEWAYS', 'KK-SF-SIZE']);

export function validateEpConfig(cfg) {
  const e = [];
  if (cfg.catalyst !== 'NOT_VERIFIED') e.push('CATALYST_CANNOT_BE_VERIFIED');
  if (cfg.gapMin !== 0.10) e.push('GAP_SCREEN_IS_THE_PRINTED_10_PERCENT');
  if (!['NONE', 'PRIOR_RUN_LIMIT_50'].includes(cfg.quietPhase)) e.push('QUIET_PHASE');
  if (!['PACE_20', 'NONE'].includes(cfg.volumeRule)) e.push('VOLUME_RULE');
  if (![1, 5].includes(cfg.orMinutes)) e.push('OPENING_RANGE');
  if (![10, 20, 50].includes(cfg.exitMa)) e.push('EXIT_MA_NOT_NAMED_IN_SOURCE');
  if (!['PESSIMISTIC', 'OPTIMISTIC'].includes(cfg.intrabarOrder)) e.push('INTRABAR_ORDER');
  if (!(cfg.sizing?.mode === 'RISK' && cfg.sizing.riskFraction > 0 && cfg.sizing.riskFraction <= 0.01)) e.push('RISK_FRACTION_OUTSIDE_PRINTED_CONTEXT');
  return e;
}

/** CHART_EP_CANDIDATE on day i (decided at the official open of i from bars 0..i-1 and the open of i). */
export function epChartCandidate(bars, i, cfg = EP_REFERENCE_CONFIG) {
  if (i < EP_MIN_HISTORY) return null;
  const b = bars[i], p = bars[i - 1];
  if (!fin(b?.open) || !fin(p?.close) || !(p.close > 0)) return null;
  const gap = b.open / p.close - 1;
  if (!(gap >= cfg.gapMin)) return null;
  let lo = Infinity; for (let k = i - 63; k < i; k++) if (fin(bars[k].low)) lo = Math.min(lo, bars[k].low);
  const priorRun = lo > 0 && lo < Infinity ? p.close / lo - 1 : null;
  if (cfg.quietPhase === 'PRIOR_RUN_LIMIT_50' && !(priorRun !== null && priorRun <= 0.50)) return null;
  let hi = -Infinity; for (let k = i - 63; k < i; k++) if (fin(bars[k].high)) hi = Math.max(hi, bars[k].high);
  return { i, date: b.date, class: EP_CLASS.CHART, gap, priorRun63: priorRun, priorRange63: lo > 0 && hi > 0 ? hi / lo - 1 : null, adr20: adr20(bars, i), catalyst: 'NOT_VERIFIED' };
}

/**
 * Resolves one candidate day from its minutes in time order (raw prices; rawFactor = raw / adjusted).
 * Returns { status, fill, stop, sameDayStop, sameDayExitFill, evidence } with adjusted prices.
 */
export function resolveEpDay({ minutes, bar, rawFactor, adrPct, iexBaseline, cfg }) {
  const f = rawFactor > 0 ? rawFactor : 1, ev = { orMinutes: cfg.orMinutes, volumeRule: cfg.volumeRule, iexVolumeOnly: true };
  if (!minutes) return { status: 'NOT_EXECUTED_INTRADAY_NOT_FETCHED', evidence: ev };
  if (!minutes.length) return { status: 'NOT_EXECUTED_NO_INTRADAY_DATA', evidence: ev };
  const id = openIdentityCheck(minutes, bar, f);
  ev.openIdentityGap = id.openGap ?? null;
  ev.dayRangeAgreement = identityCheck(minutes, bar, f).status; // evidence only (whole day)
  if (id.status !== 'IDENTITY_OK') return { status: id.status === 'IDENTITY_MISMATCH' ? 'NOT_EXECUTED_IDENTITY_MISMATCH' : `NOT_EXECUTED_${id.status}`, evidence: ev };
  if (!fin(adrPct)) return { status: 'NOT_EXECUTED_ADR_NOT_MEASURABLE', evidence: ev };
  if (cfg.volumeRule === 'PACE_20' && !(iexBaseline > 0)) return { status: 'NOT_EXECUTED_NO_IEX_VOLUME_BASELINE', evidence: ev };
  const officialOpen = bar.open * f;
  const or = openingRange(minutes, cfg.orMinutes, officialOpen);
  if (!or) return { status: 'NOT_EXECUTED_NO_OPENING_RANGE', evidence: ev };
  const tick = rawTickAdjusted(bar) * f; // one raw cent
  const level = or.high + tick;
  const { cum } = runningVwap(minutes);
  // IEX volume of the minutes 0-19 (known at minute 20); used only for entries after minute 20
  const volumeBy20 = minutes.reduce((a, m) => (m.k < 20 ? a + m.volume : a), 0);
  let low = officialOpen;
  for (let j = 0; j < minutes.length; j++) {
    const m = minutes[j];
    if (m.k >= cfg.orMinutes) {
      const volBefore = j > 0 ? cum[j - 1] : 0;
      // PACE_20: on pace to the IEX daily average by minute 20; later only when it was reached within those 20 minutes
      const volumeOk = cfg.volumeRule !== 'PACE_20' || (m.k <= 20 ? volBefore >= (iexBaseline * m.k) / 20 : volumeBy20 >= iexBaseline);
      if (volumeOk && m.high >= level) {
        const fill = Math.max(level, m.open), stop = low;
        const evidence = { ...ev, entryMinute: m.k, relativeIexVolumeAtEntry: iexBaseline > 0 ? volBefore / iexBaseline : null, class: EP_CLASS.INTRADAY_CONFIRMED, catalyst: 'NOT_VERIFIED' };
        const chk = epStopCheck({ entry: fill, lowOfDay: stop, adrPct });
        if (chk.status !== 'ACCEPT') return { status: chk.status === 'REJECT_WIDE_STOP' ? 'NOT_EXECUTED_KK034_WIDE_STOP' : 'NOT_EXECUTED_STOP_NOT_BELOW_ENTRY', evidence: { ...evidence, stopDistancePct: chk.distancePct ?? null, limitPct: chk.limitPct ?? null } };
        // same-day stop from the later minutes; the fill minute's own low is ambiguous (MA-EP-FILL-MINUTE-STOP)
        let sameDayStop = null, exitRaw = null;
        if (m.low <= stop && cfg.intrabarOrder === 'PESSIMISTIC') { sameDayStop = 'CERTAIN'; exitRaw = stop; evidence.fillMinuteStop = 'ASSUMED'; }
        else for (let q = j + 1; q < minutes.length; q++) if (minutes[q].low <= stop) { sameDayStop = 'CERTAIN'; exitRaw = Math.min(stop, minutes[q].open); evidence.stopMinute = minutes[q].k; break; }
        return { status: 'FILLED', fill: fill / f, stop: stop / f, sameDayStop, sameDayExitFill: exitRaw === null ? null : exitRaw / f, evidence: { ...evidence, stopDistancePct: chk.distancePct, limitPct: chk.limitPct } };
      }
    }
    low = Math.min(low, m.low);
  }
  return { status: 'NOT_TRIGGERED', evidence: { ...ev, class: EP_CLASS.CHART } };
}

/**
 * dataset.kkIntraday: { minutes(ticker, date) -> session minutes | [] (fetched, empty) | undefined (not fetched),
 * iexBaseline(ticker, date) -> mean IEX daily volume of the 20 prior sessions | null }.
 */
export const KK_EP_ADAPTER = Object.freeze({
  strategy: 'KK_EPISODIC_PIVOT_CHART', version: KK_EP_LIFECYCLE_VERSION, methodVersion: `${KK_VERSION}+${KK_INTRADAY_VERSION}`, label: EP_LABEL,
  sourceMaxPositionWeight: KK_PARAMS.overnightCap, // KK-001
  validateConfig: validateEpConfig,
  prepareKey: (cfg) => `${cfg.quietPhase}`,
  prepare(security, cfg, dataset) {
    const bars = security.bars, armAt = new Map();
    for (let i = 1; i < bars.length; i++) { const c = epChartCandidate(bars, i, cfg); if (c) armAt.set(i - 1, c); }
    return armAt.size ? { armAt, bars, ticker: tickerOf(security.id), intraday: dataset?.kkIntraday ?? null } : null;
  },
  signalAt(ctx, i) { const c = ctx.armAt.get(i); return c ? { ...c, armIndex: i, evidence: { gap: c.gap, priorRun63: c.priorRun63, priorRange63: c.priorRange63, adr20: c.adr20, class: c.class, catalyst: c.catalyst } } : null; },
  eligibility({ ctx, setup, bars, i, cfg }) {
    const t = setup.i, bar = bars[t];
    const resolve = () => {
      if (bar.date < EP_FIRST_INTRADAY_DATE) return { status: 'NOT_EXECUTED_BEFORE_IEX_HISTORY', evidence: { class: EP_CLASS.CHART } };
      const minutes = ctx.intraday ? ctx.intraday.minutes(ctx.ticker, bar.date) : undefined;
      const base = ctx.intraday ? ctx.intraday.iexBaseline(ctx.ticker, bar.date) : null;
      return resolveEpDay({ minutes, bar, rawFactor: bar.splitAdj, adrPct: setup.adr20, iexBaseline: base, cfg });
    };
    return eligibilityResult({ strategy: 'KK_EPISODIC_PIVOT_CHART', bars, i, blockers: [], openManualDecisions: EP_OPEN_MANUAL_DECISIONS, order: { type: 'INTRADAY_RESOLVED', resolve, rule: 'MA-EP-ORH / KK-SF-EP-STOP (KK-034) on IEX minutes' }, extra: { candidateClass: EP_CLASS.CHART, originalEpAssignable: EP_ORIGINAL_CLASS_ASSIGNABLE } });
  },
  onClose(pos, ctx, i, api, cfg) {
    const c = ctx.bars[i].close, m = smaAt(ctx.bars, i, cfg.exitMa);
    if (fin(c) && fin(m) && c < m) api.scheduleExit(1, `EP_CLOSE_BELOW_MA${cfg.exitMa}`);
  },
});

export function epVariantRegistrySha256() {
  return crypto.createHash('sha256').update(JSON.stringify({ version: KK_EP_LIFECYCLE_VERSION, reference: EP_REFERENCE_CONFIG, variants: EP_RUN_VARIANTS.map((v) => ({ id: v.id, changes: v.changes })) })).digest('hex');
}
