/**
 * Supertrader 5.0 – Darvas trade lifecycle (C03, contracts/darvas.mjs) on the shared research engine
 * (research/lifecycle-engine.mjs). Built on the unchanged box machine and stop method (methods/darvas.mjs); report
 * docs/SUPERTRADER_5_FULL_STRATEGY_ADVANCEMENT_REPORT.md.
 *
 * Source-bound mechanics (#709 B06 Q&A, HARD, HIGH, original wording checked):
 *  - a box needs a confirmed top and a confirmed bottom, each by the three-day procedure (DAR-Q1 / DAR-Q2);
 *  - no waiting after the breakout: a box complete at a close arms the buy stop for the next session (DAR-Q3);
 *  - buy stop a fraction above the top (DAR-Q4), fill max(open, trigger) on a daily bar;
 *  - every buy carries its stop, a fraction below the broken top (DAR-B6 / DAR-Q5 / DAR-Q7);
 *  - the stop is raised a fraction below the bottom of every later completed box, never lowered (DAR-Q6 / DAR-Q8);
 *  - the breakout must be to an all-time high (DAR-Q9, within the available history: flagged);
 *  - no profit target, the exit is the stop (DAR-B7).
 * Manual by the source and SUBSTITUTED in the simulation (MA-DAR-MANUAL-SUBSTITUTE): techno-fundamental selection,
 * volume judgment, market context (DAR-MR-SELECTION / -VOLUME / -MARKET); sizing (DAR-MR-SIZING) is a model assumption.
 * A lifecycle run is therefore a MODEL study, never a Darvas strategy backtest. Pyramiding (DAR-B8) is not modelled.
 * Point in time: the box state after the close of bar i (bars 0..i) arms the order for session i + 1 only; a stop raise
 * from a box completed at the close of bar j is in force from session j + 1 (darvasPosition convention).
 */
import crypto from 'node:crypto';
import { fin } from '../common/series.mjs';
import { createDarvasBoxMachine, fractionFor, STATES, BOTTOM_SEARCH_START, DARVAS_VERSION, DARVAS_OPEN_QUESTIONS } from '../methods/darvas.mjs';
import { eligibilityResult, STUDY_LABEL } from './lifecycle-engine.mjs';

export const DARVAS_LIFECYCLE_VERSION = 'sf5-darvas-lifecycle-1.0.0';

export const DARVAS_MODEL_ASSUMPTIONS = Object.freeze([
  { id: 'MA-DAR-MANUAL-SUBSTITUTE', phase: 'ENTRY_ELIGIBILITY', reference: 'ACCEPT_AS_MODEL_ASSUMPTION (simulation only): every all-time-high box breakout of the research universe is taken', alternatives: [], why: 'selection (DAR-Q12/Q14, B9-B11), volume (DAR-Q10, B3) and market (DAR-Q13, B14) are the reviewer\'s; a simulation runs only with them substituted, so it is a model study. Product records stay MANUAL_REVIEW_REQUIRED.' },
  { id: 'MA-DAR-BOTTOM-START', phase: 'SETUP_QUALIFICATION', reference: 'AFTER_TOP_DAY (contract default of DAR-SF-BOTTOM-START)', alternatives: ['AFTER_TOP_CONFIRMED'], why: 'start of the bottom search is SOURCE_AMBIGUOUS in #709 (VU-DAR UNRESOLVED); the DAR-Q2 wording (bottom only after the top is established) leans toward AFTER_TOP_CONFIRMED, the contract default keeps already traded lows; both readings are pre-registered' },
  { id: 'MA-DAR-ATH-AVAILABLE-HISTORY', phase: 'SETUP_QUALIFICATION', reference: 'the all-time high (DAR-Q9) is checked against the available split-adjusted history; records flagged ALL_TIME_HIGH_IN_AVAILABLE_HISTORY_UNVERIFIED are traded', alternatives: [], why: 'the snapshot starts at the 2015 warm-up, not at the listing date; the contract sends such records to review, the simulation substitutes that review. No listing-date field exists in the snapshot to pre-register a verified-only alternative' },
  { id: 'MA-DAR-FRACTION', phase: 'ENTRY_EXECUTION', reference: 'one raw cent in the split-adjusted basis of the arming bar (DAR-SF-ENTRY convention)', alternatives: [], why: '"a fraction" is not quantified (DAR-Q4/Q5); the reviewer may set another fraction per trade (DAR-MR-FRACTION). The level and the stop of an order use the fraction of the bar whose close armed it; the component study uses the fill bar: identical except across a split between the two sessions' },
  { id: 'MA-DAR-ORDER-VALIDITY', phase: 'ENTRY_ELIGIBILITY', reference: 'the buy stop is valid for the next session only and is re-armed at every close while the box stands', alternatives: [], why: 'a resting order is the source (DAR-B5, DAR-Q4); daily re-arming reproduces it without a lifetime number' },
  { id: 'MA-DAR-INTRABAR-ORDER', phase: 'INITIAL_STOP', reference: 'PESSIMISTIC: an intraday trigger fill with a low at or below the stop on the same bar exits at the stop', alternatives: ['OPTIMISTIC'], why: 'a daily bar does not show the order of the trigger and the low; the contract derivation of DAR-SF-STOP-INIT is pessimistic' },
  { id: 'MA-DAR-REENTRY', phase: 'ENTRY_ELIGIBILITY', reference: 'after a stop-out a later all-time-high box breakout is taken again (DAR-Q11 reading, as the component study)', alternatives: [], why: 'DAR-Q11 (CONTEXTUAL): new all-time highs can allow a re-entry; the decision is the reviewer\'s (DAR-SF-REENTRY)' },
  { id: 'MA-DAR-SIZING', phase: 'POSITION_SIZING', reference: 'WEIGHT 0.10 of equity per position (platform model assumption)', alternatives: ['WEIGHT 0.05', 'WEIGHT 0.20', 'RISK 0.01 to the initial stop'], why: 'no Darvas sizing rule (DAR-SF-SIZING manual; pilot buys DAR-B15 OPTIONAL). The stop one fraction below the top makes risk-based sizing hit the platform weight cap on most fills, so fixed weight is the reference' },
  { id: 'MA-DAR-RESEARCH-UNIVERSE', phase: 'ENTRY_ELIGIBILITY', reference: 'VU_TOURNAMENT_UNIVERSE_705 at the session before the fill', alternatives: [], why: 'DAR-SF-RESEARCH-POPULATION: measurement convention, not a Darvas rule (DAR-Q10: no general minimum)' },
  { id: 'MA-DAR-COSTS', phase: 'ENTRY_EXECUTION', reference: '10 bps slippage per side, 1 bp commission (platform policy)', alternatives: [], why: 'no costs in the source; identical to the Turtle and Minervini research runs' },
]);

export const DARVAS_REFERENCE_CONFIG = Object.freeze({ manualSubstitute: 'ACCEPT_AS_MODEL_ASSUMPTION', bottomSearchStart: BOTTOM_SEARCH_START.AFTER_TOP_DAY, intrabarOrder: 'PESSIMISTIC', sizing: Object.freeze({ mode: 'WEIGHT', weight: 0.10 }) });

export const DARVAS_RUN_VARIANTS = Object.freeze([
  { id: 'REF', changes: {} },
  { id: 'ALT-BOTTOM-AFTER-TOP-CONFIRMED', changes: { bottomSearchStart: BOTTOM_SEARCH_START.AFTER_TOP_CONFIRMED } },
  { id: 'ALT-INTRABAR-OPTIMISTIC', changes: { intrabarOrder: 'OPTIMISTIC' } },
  { id: 'ALT-SIZE-WEIGHT-005', changes: { sizing: { mode: 'WEIGHT', weight: 0.05 } } },
  { id: 'ALT-SIZE-WEIGHT-020', changes: { sizing: { mode: 'WEIGHT', weight: 0.20 } } },
  { id: 'ALT-SIZE-RISK-001', changes: { sizing: { mode: 'RISK', riskFraction: 0.01 } } },
].map((v) => Object.freeze({ ...v, config: Object.freeze({ ...DARVAS_REFERENCE_CONFIG, ...v.changes }) })));

export const DARVAS_OPEN_MANUAL_DECISIONS = Object.freeze(['DAR-MR-SELECTION', 'DAR-MR-VOLUME', 'DAR-MR-MARKET', 'DAR-MR-SIZING']);

export function validateDarvasConfig(cfg) {
  const errs = [];
  if (cfg.manualSubstitute !== 'ACCEPT_AS_MODEL_ASSUMPTION') errs.push('MANUAL_SUBSTITUTE_REQUIRED');
  if (!BOTTOM_SEARCH_START[cfg.bottomSearchStart]) errs.push('BOTTOM_SEARCH_START');
  if (!['PESSIMISTIC', 'OPTIMISTIC'].includes(cfg.intrabarOrder)) errs.push('INTRABAR_ORDER');
  const s = cfg.sizing;
  if (!s || !((s.mode === 'WEIGHT' && s.weight > 0 && s.weight <= 0.25) || (s.mode === 'RISK' && s.riskFraction > 0 && s.riskFraction <= 0.025))) errs.push('SIZING_OUTSIDE_RESEARCH_RANGE');
  return errs;
}

/**
 * Per-bar box state of a security (one forward pass of the unchanged machine): the open box after each close, the
 * box confirmations (stop raises) and the highest high of the available history up to each bar (DAR-SF-ATH).
 */
export function darvasBoxSeries(security, { bottomSearchStart = DARVAS_REFERENCE_CONFIG.bottomSearchStart } = {}) {
  const bars = security.bars, m = createDarvasBoxMachine(bars, { bottomSearchStart });
  const boxAt = new Map(), confirmAt = new Map();
  let ath = -Infinity;
  for (let i = 0; i < bars.length; i++) {
    for (const e of m.step(i)) if (e.type === 'BOTTOM_CONFIRMED') confirmAt.set(i, { top: e.top, bottom: e.bottom, topDate: e.topDate, bottomDate: e.bottomDate });
    if (fin(bars[i].high) && bars[i].high > ath) ath = bars[i].high;
    const st = m.state;
    if (st.phase === STATES.BOX) { const box = m.boxes.at(-1); boxAt.set(i, { top: st.top, bottom: st.bottom, topDate: box.topDate, bottomDate: box.bottomDate, completeDate: box.completeDate, athThroughBar: ath }); }
  }
  return { boxAt, confirmAt, boxes: m.boxes.length };
}

export const DARVAS_ADAPTER = Object.freeze({
  strategy: 'DARVAS', version: DARVAS_LIFECYCLE_VERSION, methodVersion: DARVAS_VERSION, label: STUDY_LABEL.MODEL,
  validateConfig: validateDarvasConfig,
  prepareKey: (cfg) => cfg.bottomSearchStart, // inputs of prepare(); variants with the same key share the preparation
  prepare(security, cfg) { const r = darvasBoxSeries(security, { bottomSearchStart: cfg.bottomSearchStart }); return r.boxAt.size ? { ...r, bars: security.bars } : null; },
  signalAt(ctx, i) { const b = ctx.boxAt.get(i); return b ? { date: ctx.bars[i].date, i, ...b } : null; },
  eligibility({ setup, bars, i }) {
    const frac = fractionFor(bars[i]), level = setup.top + frac, stop = setup.top - frac, blockers = [];
    // DAR-SF-ATH: the trigger must exceed every earlier high of the available history (bars 0..i)
    if (!(level > setup.athThroughBar)) blockers.push({ code: 'NOT_ALL_TIME_HIGH_IN_HISTORY', rule: 'DAR-SF-ATH (DAR-Q9)', class: 'SOURCE_DERIVED' });
    return eligibilityResult({ strategy: 'DARVAS', bars, i, blockers, openManualDecisions: DARVAS_OPEN_MANUAL_DECISIONS, order: { type: 'BUY_STOP', level, stop, rule: 'DAR-SF-ENTRY / DAR-SF-STOP-INIT' }, extra: { allTimeHigh: 'ALL_TIME_HIGH_IN_AVAILABLE_HISTORY_UNVERIFIED' } });
  },
  onClose(pos, ctx, i, api) {
    // DAR-SF-STOP-RAISE: a box completed at this close (after the entry bar) raises the stop from the next session
    const c = ctx.confirmAt.get(i);
    if (c && i > pos.entryIndex) api.raiseStop(c.bottom - fractionFor(ctx.bars[i]), 'DAR-SF-STOP-RAISE');
  },
});

export function darvasVariantRegistrySha256() {
  return crypto.createHash('sha256').update(JSON.stringify({ reference: DARVAS_REFERENCE_CONFIG, variants: DARVAS_RUN_VARIANTS.map((v) => ({ id: v.id, changes: v.changes })) })).digest('hex');
}

export const DARVAS_LIFECYCLE_QUESTIONS = DARVAS_OPEN_QUESTIONS;
