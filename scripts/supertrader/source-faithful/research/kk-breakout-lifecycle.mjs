/**
 * Supertrader 5.0 – Kullamaegi Common Breakout trade lifecycle (C08, contracts/kullamagi.mjs), written daily
 * alternative (KK-011) on the shared research engine (research/lifecycle-engine.mjs). Built on the unchanged components
 * of methods/kullamagi.mjs; report docs/SUPERTRADER_5_FULL_STRATEGY_ADVANCEMENT_REPORT.md.
 *
 * Source-exact mechanics (#709 W-KK3 / W-KKFAQ, HARD, HIGH, original wording checked):
 *  - initial stop = low of the entry day; a stop wider than ADR20 REJECTS the trade, it is never tightened (KK-012);
 *  - ADR20 = mean of (high / low - 1) x 100 over the 20 sessions before the bar (KK-031);
 *  - stops are stop-market: a gap through the stop fills at the open (KK-027);
 *  - never more than 30 % of equity in one stock overnight (KK-001; the platform cap 25 % is stricter).
 * Preferences turned into a declared model (MODEL_ASSUMPTION, pre-registered alternatives, none chosen by a result):
 *  - setup proxy for KK-006..009 and the breakout level (KK-MR-SETUP, KK-MR-LEVEL are manual by the source);
 *  - the partial sale after 3-5 days with the rest to break-even (KK-013) and the 10 / 20-day MA trail (KK-014): the
 *    source gives ranges (1/3-1/2, 3-5 days, 10- or 20-day), the reference takes the printed beginner rule for the trail;
 *  - risk per trade inside the printed context ranges (KK-003 0.25-1 %, KK-025 0.3-0.5 %).
 * The opening-range-high entry (KK-010, his main entry) stays DATA_BLOCKED: no intraday history; this lifecycle is the
 * daily alternative, not the same execution. Momentum ranking (KK-005) and the review priority (KK-048) are not used to
 * select: they are preferences for a reviewer; the neutral fill order of the engine decides capital conflicts.
 * Point in time: the reference enters at the close of the breakout day (closing auction, MA-KK-CLOSE-DECISION): the
 * close and the final low are used at that close; the alternative enters at the next open from the prior close only.
 */
import crypto from 'node:crypto';
import { fin, smaAt, priorHigh } from '../common/series.mjs';
import { adr20, breakoutStopCheck, KK_PARAMS, KK_VERSION } from '../methods/kullamagi.mjs';
import { eligibilityResult, STUDY_LABEL } from './lifecycle-engine.mjs';

export const KK_LIFECYCLE_VERSION = 'sf5-kk-breakout-lifecycle-1.0.0';

export const KK_MODEL_ASSUMPTIONS = Object.freeze([
  { id: 'MA-KK-MANUAL-SUBSTITUTE', phase: 'ENTRY_ELIGIBILITY', reference: 'ACCEPT_AS_MODEL_ASSUMPTION (simulation only)', alternatives: [], why: 'setup quality (KK-MR-SETUP), the breakout level (KK-MR-LEVEL) and the review priority (KK-MR-PRIORITY) are the reviewer\'s; they are substituted by MA-KK-SETUP-PROXY, so a run is a model study' },
  { id: 'MA-KK-SETUP-PROXY', phase: 'SETUP_QUALIFICATION', reference: 'CONSOLIDATION_10: level = highest high of the 10 sessions before the breakout day (2 weeks, KK-008 lower end); prior move >= 30 % from the lowest low of the 63 sessions before the consolidation to its first close (KK-006 lower printed end, 3 months); 10- and 20-day MA rising at the prior close (KK-009; the 5-session slope window is a VU convention, as in breakoutEvidence)', alternatives: ['CONSOLIDATION_20 (20 sessions)', 'NO_MA_CONDITION'], why: 'KK-006..009 are preferences and context; the printed lower ends are used as bounds of a declared proxy, never as Kullamaegi gates' },
  { id: 'MA-KK-ENTRY-TIMING', phase: 'ENTRY_EXECUTION', reference: 'BREAKOUT_DAY_CLOSE (CLOSE_DECISION_USES_FINAL_BAR): a close above the level, bought at that close (closing auction); KK-012 is evaluated exactly with the final low of day', alternatives: ['NEXT_OPEN: bought at the next open; stop = breakout-day low, rejected if the open is more than ADR20 above it (not KK-012 literally)'], why: 'KK-011 allows the daily breakout entry; the contract timing is the breakout-day close. The close decision uses the final close and low (an order in the closing auction is placed minutes before); the next-open alternative uses the prior close only and measures the sensitivity to that assumption' },
  { id: 'MA-KK-EXIT-POLICY', phase: 'POSITION_MANAGEMENT', reference: 'PARTIAL3_THIRD_BE_MA10: at the close of the 3rd session after the entry day, if the close is above the entry: sell 1/3 at the next open and raise the stop to break-even; the rest (from the partial-sale day on) exits at the next open after the first close below the 10-day MA (beginner rule KK-014); before that day only the low-of-day stop exits', alternatives: ['PARTIAL5_HALF_BE_MA10', 'PARTIAL3_THIRD_BE_MA20', 'NO_PARTIAL_MA10 (trail from the entry)', 'PARTIAL3_THIRD_BE_MA10_TRAIL_FROM_ENTRY'], why: 'KK-013 / KK-014 are preferences with printed ranges; the reference takes the earliest printed day and the smallest printed fraction; the profit condition prevents a break-even stop above the price' },
  { id: 'MA-KK-RISK-FRACTION', phase: 'POSITION_SIZING', reference: 'RISK 0.005 of equity to the low-of-day stop', alternatives: ['RISK 0.0025', 'RISK 0.01'], why: '0.5 % lies inside both printed context ranges (KK-003 0.25-1 %, KK-025 0.3-0.5 %); the ends are the alternatives' },
  { id: 'MA-KK-RESEARCH-UNIVERSE', phase: 'ENTRY_ELIGIBILITY', reference: 'VU_TOURNAMENT_UNIVERSE_705 at the session before the fill', alternatives: [], why: 'liquidity is reviewed first (KK-048) without a number; the shared research universe is a measurement convention' },
  { id: 'MA-KK-COSTS', phase: 'ENTRY_EXECUTION', reference: '10 bps slippage per side, 1 bp commission (platform policy)', alternatives: [], why: 'no costs in the source' },
]);

export const KK_EXIT_POLICIES = Object.freeze({
  PARTIAL3_THIRD_BE_MA10: Object.freeze({ partialAfter: 3, partialFraction: 1 / 3, trailMa: 10 }),
  PARTIAL5_HALF_BE_MA10: Object.freeze({ partialAfter: 5, partialFraction: 1 / 2, trailMa: 10 }),
  PARTIAL3_THIRD_BE_MA20: Object.freeze({ partialAfter: 3, partialFraction: 1 / 3, trailMa: 20 }),
  NO_PARTIAL_MA10: Object.freeze({ partialAfter: null, partialFraction: null, trailMa: 10 }),
  PARTIAL3_THIRD_BE_MA10_TRAIL_FROM_ENTRY: Object.freeze({ partialAfter: 3, partialFraction: 1 / 3, trailMa: 10, trailFromEntry: true }),
});
export const KK_SETUP_PROXIES = Object.freeze({
  CONSOLIDATION_10: Object.freeze({ window: 10, priorMove: 0.30, priorMoveSessions: 63, maRising: true }),
  CONSOLIDATION_20: Object.freeze({ window: 20, priorMove: 0.30, priorMoveSessions: 63, maRising: true }),
  NO_MA_CONDITION: Object.freeze({ window: 10, priorMove: 0.30, priorMoveSessions: 63, maRising: false }),
});

export const KK_REFERENCE_CONFIG = Object.freeze({ manualSubstitute: 'ACCEPT_AS_MODEL_ASSUMPTION', setupProxy: 'CONSOLIDATION_10', entryTiming: 'BREAKOUT_DAY_CLOSE', exitPolicy: 'PARTIAL3_THIRD_BE_MA10', intrabarOrder: 'PESSIMISTIC', sizing: Object.freeze({ mode: 'RISK', riskFraction: 0.005 }) });

export const KK_RUN_VARIANTS = Object.freeze([
  { id: 'REF', changes: {} },
  { id: 'ALT-SETUP-CONSOLIDATION-20', changes: { setupProxy: 'CONSOLIDATION_20' } },
  { id: 'ALT-SETUP-NO-MA', changes: { setupProxy: 'NO_MA_CONDITION' } },
  { id: 'ALT-ENTRY-NEXT-OPEN', changes: { entryTiming: 'NEXT_OPEN' } },
  { id: 'ALT-EXIT-PARTIAL5-HALF', changes: { exitPolicy: 'PARTIAL5_HALF_BE_MA10' } },
  { id: 'ALT-EXIT-TRAIL-MA20', changes: { exitPolicy: 'PARTIAL3_THIRD_BE_MA20' } },
  { id: 'ALT-EXIT-NO-PARTIAL', changes: { exitPolicy: 'NO_PARTIAL_MA10' } },
  { id: 'ALT-EXIT-TRAIL-FROM-ENTRY', changes: { exitPolicy: 'PARTIAL3_THIRD_BE_MA10_TRAIL_FROM_ENTRY' } },
  { id: 'ALT-RISK-00025', changes: { sizing: { mode: 'RISK', riskFraction: 0.0025 } } },
  { id: 'ALT-RISK-001', changes: { sizing: { mode: 'RISK', riskFraction: 0.01 } } },
].map((v) => Object.freeze({ ...v, config: Object.freeze({ ...KK_REFERENCE_CONFIG, ...v.changes }) })));

export const KK_OPEN_MANUAL_DECISIONS = Object.freeze(['KK-MR-SETUP', 'KK-MR-LEVEL', 'KK-MR-PRIORITY']);

export function validateKkConfig(cfg) {
  const errs = [];
  if (cfg.manualSubstitute !== 'ACCEPT_AS_MODEL_ASSUMPTION') errs.push('MANUAL_SUBSTITUTE_REQUIRED');
  if (!KK_SETUP_PROXIES[cfg.setupProxy]) errs.push('SETUP_PROXY');
  if (!['BREAKOUT_DAY_CLOSE', 'NEXT_OPEN'].includes(cfg.entryTiming)) errs.push('ENTRY_TIMING');
  if (!KK_EXIT_POLICIES[cfg.exitPolicy]) errs.push('EXIT_POLICY');
  if (!['PESSIMISTIC', 'OPTIMISTIC'].includes(cfg.intrabarOrder)) errs.push('INTRABAR_ORDER');
  if (!(cfg.sizing?.mode === 'RISK' && cfg.sizing.riskFraction > 0 && cfg.sizing.riskFraction <= 0.01)) errs.push('RISK_FRACTION_OUTSIDE_PRINTED_CONTEXT');
  return errs;
}

/** MA-KK-SETUP-PROXY on the close of bar i (bars 0..i): level from bars before i, breakout = close of i above it. */
export function kkBreakoutSetupAt(bars, i, proxy = KK_SETUP_PROXIES.CONSOLIDATION_10) {
  const W = proxy.window, b = bars[i];
  if (i < W + proxy.priorMoveSessions + 1 || !fin(b?.close) || !fin(b.low)) return null;
  const level = priorHigh(bars, i, W);
  if (!fin(level) || !(b.close > level)) return null;
  const s = i - W; // first session of the consolidation
  let lo = Infinity; for (let k = s - proxy.priorMoveSessions; k < s; k++) { const l = bars[k].low; if (!fin(l)) return null; lo = Math.min(lo, l); }
  const base = bars[s].close; if (!fin(base) || !(lo > 0)) return null;
  const priorMove = base / lo - 1;
  if (!(priorMove >= proxy.priorMove)) return null;
  const rising = (n) => { const a = smaAt(bars, i - 1, n), c = smaAt(bars, i - 6, n); return fin(a) && fin(c) ? a > c : null; };
  const ma10 = rising(10), ma20 = rising(20);
  if (proxy.maRising && !(ma10 === true && ma20 === true)) return null;
  return { i, date: b.date, level, priorMove, consolidationSessions: W, ma10Rising: ma10, ma20Rising: ma20, adr20: adr20(bars, i), evidence: { level, priorMove, ma10Rising: ma10, ma20Rising: ma20 } };
}

export const KK_BREAKOUT_ADAPTER = Object.freeze({
  strategy: 'KK_BREAKOUT', version: KK_LIFECYCLE_VERSION, methodVersion: KK_VERSION, label: STUDY_LABEL.MODEL,
  sourceMaxPositionWeight: KK_PARAMS.overnightCap, // KK-001 (SOURCE_EXACT)
  validateConfig: validateKkConfig,
  prepareKey: (cfg) => cfg.setupProxy,
  closeEntry: (cfg) => cfg.entryTiming === 'BREAKOUT_DAY_CLOSE',
  prepare(security, cfg) {
    const proxy = KK_SETUP_PROXIES[cfg.setupProxy], bars = security.bars, setups = new Map();
    for (let i = 0; i < bars.length; i++) { const s = kkBreakoutSetupAt(bars, i, proxy); if (s) setups.set(i, s); }
    return setups.size ? { setups, bars } : null;
  },
  signalAt(ctx, i) { return ctx.setups.get(i) ?? null; },
  eligibility({ setup, bars, i, cfg }) {
    const b = bars[i], blockers = [];
    if (cfg.entryTiming === 'BREAKOUT_DAY_CLOSE') {
      // KK-012 exactly: entry at the close, stop = final low of the same day, distance <= ADR20 else REJECT (never tightened)
      const chk = breakoutStopCheck({ entry: b.close, lowOfDay: b.low, adrPct: setup.adr20 }), dist = chk.distancePct ?? null;
      if (chk.status === 'INSUFFICIENT_DATA') blockers.push({ code: 'ADR_NOT_MEASURABLE', rule: 'KK-SF-ADR (KK-031)', class: 'DATA_BLOCKED' });
      else if (chk.status === 'STOP_NOT_BELOW_ENTRY') blockers.push({ code: 'STOP_NOT_BELOW_ENTRY', rule: 'KK-SF-BO-STOP (KK-012)', class: 'SOURCE_EXACT' });
      else if (chk.status === 'REJECT_WIDE_STOP') blockers.push({ code: 'REJECT_WIDE_STOP', rule: 'KK-SF-BO-STOP (KK-012)', class: 'SOURCE_EXACT' });
      return eligibilityResult({ strategy: 'KK_BREAKOUT', bars, i, blockers, openManualDecisions: KK_OPEN_MANUAL_DECISIONS, order: { type: 'ON_CLOSE', stop: b.low, rule: 'KK-SF-BO-ENTRY daily / KK-SF-BO-STOP' }, extra: { stopDistancePct: dist, adr20: setup.adr20 } });
    }
    // NEXT_OPEN alternative: stop = breakout-day low; the open fill is rejected when it lies more than ADR20 above it
    const adrNext = adr20(bars, i + 1); // the 20 sessions before the fill session: bars i - 19 .. i, known at this close
    if (!fin(adrNext)) blockers.push({ code: 'ADR_NOT_MEASURABLE', rule: 'KK-SF-ADR (KK-031)', class: 'DATA_BLOCKED' });
    return eligibilityResult({ strategy: 'KK_BREAKOUT', bars, i, blockers, openManualDecisions: KK_OPEN_MANUAL_DECISIONS, order: { type: 'ON_OPEN', stop: b.low, maxPlannedLoss: fin(adrNext) ? adrNext / 100 : null, rule: 'MA-KK-ENTRY-TIMING NEXT_OPEN (not KK-012 literally)' } });
  },
  onClose(pos, ctx, i, api, cfg) {
    const P = KK_EXIT_POLICIES[cfg.exitPolicy], bars = ctx.bars, c = bars[i].close;
    const after = i - pos.entryIndex; // sessions after the entry day
    if (!fin(c)) return; // no close: no close rule on this bar (the partial check moves to the next bar with a close)
    if (P.partialAfter && !pos.state.partialDone && after >= P.partialAfter) {
      pos.state.partialDone = true;
      if (c > pos.entry) { api.scheduleExit(P.partialFraction, 'KK_PARTIAL_AFTER_DAYS'); api.raiseStop(pos.entry, 'KK-013-BREAKEVEN'); }
    }
    // KK-014 trails the REST: from the partial-sale day on (MA-KK-EXIT-POLICY); without a partial sale from the entry
    if (P.partialAfter && !P.trailFromEntry && after < P.partialAfter) return;
    const m = smaAt(bars, i, P.trailMa);
    if (fin(m) && c < m) api.scheduleExit(1, `KK_TRAIL_CLOSE_BELOW_MA${P.trailMa}`);
  },
});

export function kkVariantRegistrySha256() {
  return crypto.createHash('sha256').update(JSON.stringify({ reference: KK_REFERENCE_CONFIG, variants: KK_RUN_VARIANTS.map((v) => ({ id: v.id, changes: v.changes })) })).digest('hex');
}
