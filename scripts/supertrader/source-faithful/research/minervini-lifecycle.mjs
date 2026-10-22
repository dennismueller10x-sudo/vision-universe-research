/**
 * Supertrader 4.0 – Minervini trade lifecycle (C06 SEPA / VCP, C07 Power Play): setup state, entry eligibility and the
 * daily-bar order model, built on the unchanged screens (methods/minervini.mjs) and the Supertrader 3.0 components
 * (research/minervini-components.mjs). Contract: contracts/minervini.mjs. Report: docs/SUPERTRADER_4_MINERVINI_TRADE_LIFECYCLE_REPORT.md.
 *
 * Every Minervini rule in #709 is MEDIUM confidence with unchecked English wording: nothing here is SOURCE_EXACT. What
 * this module adds is the SEQUENCE (setup -> eligibility -> order -> fill) with every choice the sources do not make
 * named as a model assumption (MODEL_ASSUMPTIONS) and pre-registered as a research variant (RUN_VARIANTS). No variant
 * is activated anywhere, none is selected by a result, and no output declares a buy (buyDeclarationAllowed false).
 *
 * Source-bounded mechanics used here (translation-unverified, see the lifecycle matrix):
 *  - the stop is set before the entry (MIN-RISK-01): an order without a stop below the pivot is not eligible;
 *  - the planned loss is at most 10 % (MIN-MM-STOP-02): a setup whose stop is more than 10 % below the pivot is not
 *    eligible, and a fill whose planned loss would exceed 10 % (gap) is not executed under the reference order type;
 *  - price confirmation before the entry (MIN-PRICE-01, MIN-VCP-07): the order is a buy stop at the pivot; volume is
 *    judged afterwards (MIN-MM-VOL-EX) and low breakout volume alone forces no sale (MIN-MM-VOL-RET).
 * Point in time: a setup is evaluated on the CLOSE of bar i with bars 0..i only; the order it arms is valid for bar
 * i + 1 alone and is re-armed at every close while the setup holds (MA-MIN-SETUP-VALIDITY).
 */
import crypto from 'node:crypto';
import { fin, smaSeries, priorMean, eligibleAtPriorSession, RESEARCH_UNIVERSE } from '../common/series.mjs';
import { trendTemplate, MIN_PARAMS } from '../methods/minervini.mjs';
import { vcpContractions, powerPlayClassify, NOT_A_STRATEGY, COMPONENT_CONVENTIONS } from './minervini-components.mjs';
import { isExecutableBar } from '../../validation/accounting-contract.mjs';

export const LIFECYCLE_VERSION = 'sf4-minervini-lifecycle-1.0.0';
const TRANSL = Object.freeze({ translationUnverified: true, clearance: 'REQUIRES_ORIGINAL_OR_EXPLICIT_WEB_CORROBORATION' });

/** Lifecycle classification of a condition (mandate phase A). The contract RULE_STATUS stays the binding registry term. */
export const CLASS = Object.freeze({
  SOURCE_EXACT: 'SOURCE_EXACT',         // unambiguous original rule (none for Minervini: translation-only wording)
  SOURCE_BOUNDED: 'SOURCE_BOUNDED',     // printed number or range used as a bound; open decision named (wording check, range point)
  MODEL_ASSUMPTION: 'MODEL_ASSUMPTION', // VU operationalisation, declared with a reference and pre-registered alternatives
  MANUAL_REVIEW: 'MANUAL_REVIEW',       // qualitative decision of the reviewer
  DATA_BLOCKED: 'DATA_BLOCKED',         // needed data are not in the snapshot
  SOURCE_BLOCKED: 'SOURCE_BLOCKED',     // the sources give no rule that could be executed
});

export const LIFECYCLE_PHASES = Object.freeze(['SETUP_QUALIFICATION', 'ENTRY_ELIGIBILITY', 'ENTRY_EXECUTION', 'INITIAL_STOP', 'POSITION_SIZING', 'POSITION_MANAGEMENT', 'EXIT_CONDITIONS', 'TRADE_ACCOUNTING', 'BACKTEST_DIAGNOSTICS', 'STRATEGY_READINESS']);

export const MAX_PLANNED_LOSS = MIN_PARAMS.maxStopPct; // MIN-MM-STOP-02 (0.10, translation-unverified)

/**
 * Model assumptions of the lifecycle. Each names its reference reading and the pre-registered alternatives; none is a
 * Minervini rule. Changing a reference needs an owner decision (report section "Entscheidungen").
 */
export const MODEL_ASSUMPTIONS = Object.freeze([
  { id: 'MA-MIN-MANUAL-SUBSTITUTE', phase: 'ENTRY_ELIGIBILITY', reference: 'ACCEPT_AS_MODEL_ASSUMPTION (simulation only)', alternatives: [], why: 'relative priority, earnings quality, VCP validity (SEPA) and the strong-volume judgment (Power Play) are manual by the source; a simulation can only run if they are substituted, so every simulated trade is a MODEL study, never a strategy backtest. Product outputs never substitute (state ENTRY_POSSIBLE_PENDING_MANUAL_REVIEW).' },
  { id: 'MA-MIN-SEPA-PIVOT', phase: 'SETUP_QUALIFICATION', reference: 'high of the last confirmed swing high of the base (sf3 VCP convention, +-5 sessions)', alternatives: [], why: 'MIN-VCP-07 names the pivot, not its construction' },
  { id: 'MA-MIN-SEPA-SETUP-PROXY', phase: 'SETUP_QUALIFICATION', reference: 'VCP_FOOTPRINT_STRICT: >= 2 contractions, contracting left to right, last contraction volume below the 50-day mean', alternatives: ['TREND_TEMPLATE_PIVOT_ONLY'], why: 'VCP validity is manual (MIN-MR-VCP); counts and halving are typical, not limits (MIN-VCP-02/03); the strict proxy narrows the source (flat bases MIN-VCP-04 are excluded), the loose one widens it' },
  { id: 'MA-MIN-STOP-PLACEMENT', phase: 'INITIAL_STOP', reference: 'STRUCTURE: SEPA lowest low of the last contraction, Power Play lowest low of the consolidation', alternatives: ['MAX_PLANNED_LOSS_10'], why: 'MIN-RISK-01 requires a stop before the entry and MIN-MM-STOP-02 bounds it at 10 %; the placement inside the bound is the reviewer\'s' },
  { id: 'MA-MIN-ORDER-TYPE', phase: 'ENTRY_EXECUTION', reference: 'BUY_STOP_LIMIT: buy stop at the pivot, limit at stop / 0.9 (the price at which the planned loss reaches 10 %)', alternatives: ['BUY_STOP_MARKET'], why: 'the sources give no order type; the limit is the consequence of MIN-MM-STOP-02 for a gap; the market variant keeps gap fills and flags the exceeded planned loss' },
  { id: 'MA-MIN-ENTRY-TIMING', phase: 'ENTRY_EXECUTION', reference: 'INTRADAY_PRICE_FIRST: the buy stop fills on the breakout bar (MIN-MM-VOL-EX)', alternatives: ['NEXT_OPEN_AFTER_VOLUME_CONFIRMED_CLOSE'], why: 'MIN-VCP-07 "with increasing volume" is a strong preference; daily bars cannot know the volume of the breakout bar at the fill, so the volume-confirmed reading enters at the next open (volume above the 50-day mean, one of the two sf3 readings)' },
  { id: 'MA-MIN-INTRABAR-ORDER', phase: 'ENTRY_EXECUTION', reference: 'PESSIMISTIC: on an intraday pivot fill with a low at or below the stop on the same bar the stop is assumed hit after the fill', alternatives: ['OPTIMISTIC'], why: 'a daily bar does not show whether the low came before or after the pivot touch; gap and limit fills are unambiguous and not affected' },
  { id: 'MA-MIN-SETUP-VALIDITY', phase: 'ENTRY_ELIGIBILITY', reference: 'RE_EVALUATED_EACH_CLOSE: an order is valid for the next session only and is re-armed while the setup holds at the close', alternatives: [], why: 'no setup lifetime in #709; re-evaluation adds no number and invalidates a setup as soon as its own definition fails (Trend Template, correction, pivot exceeded)' },
  { id: 'MA-MIN-SIGNAL-ORDER', phase: 'POSITION_SIZING', reference: 'SECURITY_ID: simultaneous fills are booked in security-id order', alternatives: [], why: 'relative priority is manual (MIN-PROCESS-04); the neutral order is deterministic, capital-constrained rejections are counted so its influence stays visible' },
  { id: 'MA-MIN-EXIT-POLICY', phase: 'POSITION_MANAGEMENT', reference: 'STOP_BE3R_MA50: initial stop, stop to break-even at 3R on a close (MIN-RISK-05), after break-even a close below MA50 exits at the next open (MIN-TTC-TRAIL / MIN-MM-SELL-02)', alternatives: ['STOP_BE3R', 'FREEROLL_2R', 'FREEROLL_3R'], why: 'sell rules are manual (MIN-SF-SELL); the reference uses only the mechanical parts of the printed sell guides; the free-roll is the OPTIONAL MIN-TTC-FREEROLL example at both printed ends of 2-3R' },
  { id: 'MA-MIN-STAGE2-TREND-TEMPLATE', phase: 'SETUP_QUALIFICATION', reference: 'the Stage 2 context of a base (MIN-BASE-01) is read as "Trend Template 1-7 holds on the setup close"', alternatives: [], why: 'MIN-BASE-01 names the Stage 2 context without a mechanical test; the Trend Template is the source\'s own upstream qualification (MIN-PROCESS-01)' },
  { id: 'MA-MIN-PP-PIVOT', phase: 'SETUP_QUALIFICATION', reference: 'Power Play pivot = run-up high (highest high of the consolidation), as in powerPlayClassify', alternatives: [], why: 'MIN-PP-02..05 describe run-up and consolidation, not the pivot' },
  { id: 'MA-MIN-PP-ELIGIBLE-CLASSES', phase: 'ENTRY_ELIGIBILITY', reference: 'only CONFIRMED_MECHANICAL_SETUP is simulated; MANUAL_REVIEW_SETUP and DATA_BLOCKED_SETUP stay blocked', alternatives: [], why: 'no automatic upgrade of manual or data-blocked setups (owner decision 2026-10-21); a confirmed setup still needs the separate eligibility' },
  { id: 'MA-MIN-RESEARCH-UNIVERSE', phase: 'ENTRY_ELIGIBILITY', reference: 'VU_TOURNAMENT_UNIVERSE_705 at the prior session (raw close >= 5, 20-day dollar volume >= 1 million)', alternatives: [], why: 'MIN-MM-LIQ-01 and MIN-MM-PRC-01 are context and preferences without a hard floor; the pre-registered research universe is shared by every source-faithful method' },
  { id: 'MA-MIN-STOP-FILL', phase: 'INITIAL_STOP', reference: 'a low at or below the stop exits at min(open, stop) (gap through the stop: the open)', alternatives: [], why: 'MIN-MM-STOP-01 executes the stop regardless of volume; the fill on a daily bar is the sf3 convention (sellEvidence)' },
  { id: 'MA-MIN-COSTS', phase: 'ENTRY_EXECUTION', reference: '10 bps slippage per side, 1 bp commission (research-v1 convention of the snapshot runs)', alternatives: [], why: 'no costs in the sources; identical to the Turtle research runs so that methods stay comparable' },
  { id: 'MA-MIN-ACCOUNTING-RESEARCH-V1', phase: 'TRADE_ACCOUNTING', reference: 'research-v1: orders only on real source bars, stale limit 5 sessions -> SECURITY_UNAVAILABLE, economic delisting by the S0 scenario, dividends on held shares, ledger replay', alternatives: [], why: 'platform accounting (validation/accounting-contract.mjs), not a Minervini rule' },
  { id: 'MA-MIN-MAX-POSITIONS', phase: 'POSITION_SIZING', reference: 'at most 20 open positions (platform research portfolio policy)', alternatives: [], why: 'MIN-RISK-10 "not more than 20 positions" (2013) is a strong preference, not a hard rule; used as the cap of the platform policy, not as an original rule' },
  { id: 'MA-MIN-RISK-FRACTION', phase: 'POSITION_SIZING', reference: '0.0125 of equity (the boundary shared by MIN-MM-SIZE-03 and MIN-MM-SIZE-04)', alternatives: ['0.0075', '0.025'], why: 'the risk per trade is the reviewer\'s; the printed ranges are context (0.75-1.25 % average, 1.25-2.5 % typical, at most 2.5 %)' },
]);

/** Exit policies (MA-MIN-EXIT-POLICY). */
export const EXIT_POLICIES = Object.freeze({
  STOP_BE3R_MA50: Object.freeze({ breakevenAtR: 3, freerollAtR: null, ma50AfterBreakeven: true }),
  STOP_BE3R: Object.freeze({ breakevenAtR: 3, freerollAtR: null, ma50AfterBreakeven: false }),
  FREEROLL_2R: Object.freeze({ breakevenAtR: null, freerollAtR: 2, ma50AfterBreakeven: false }),
  FREEROLL_3R: Object.freeze({ breakevenAtR: null, freerollAtR: 3, ma50AfterBreakeven: false }),
});

/** Reference configuration of the research lifecycle (all fields are model assumptions or source bounds). */
export const REFERENCE_CONFIG = Object.freeze({
  manualSubstitute: 'ACCEPT_AS_MODEL_ASSUMPTION',
  sepaSetupProxy: 'VCP_FOOTPRINT_STRICT',
  ppClasses: Object.freeze(['CONFIRMED_MECHANICAL_SETUP']),
  stopPlacement: 'STRUCTURE',
  orderType: 'BUY_STOP_LIMIT',
  entryTiming: 'INTRADAY_PRICE_FIRST',
  intrabarOrder: 'PESSIMISTIC',
  exitPolicy: 'STOP_BE3R_MA50',
  riskFraction: 0.0125,
});

/**
 * Pre-registered research runs: the reference and one-at-a-time alternatives. Not selected by any result; the snapshot
 * runner measures all of them and reports every one.
 */
export const RUN_VARIANTS = Object.freeze([
  { id: 'REF', changes: {} },
  { id: 'ALT-SETUP-TT-PIVOT', strategies: ['SEPA'], changes: { sepaSetupProxy: 'TREND_TEMPLATE_PIVOT_ONLY' } },
  { id: 'ALT-STOP-MAXLOSS10', changes: { stopPlacement: 'MAX_PLANNED_LOSS_10' } },
  { id: 'ALT-ORDER-STOP-MARKET', changes: { orderType: 'BUY_STOP_MARKET' } },
  { id: 'ALT-ENTRY-VOLUME-NEXT-OPEN', changes: { entryTiming: 'NEXT_OPEN_AFTER_VOLUME_CONFIRMED_CLOSE' } },
  { id: 'ALT-INTRABAR-OPTIMISTIC', changes: { intrabarOrder: 'OPTIMISTIC' } },
  { id: 'ALT-EXIT-STOP-BE3R', changes: { exitPolicy: 'STOP_BE3R' } },
  { id: 'ALT-EXIT-FREEROLL-2R', changes: { exitPolicy: 'FREEROLL_2R' } },
  { id: 'ALT-EXIT-FREEROLL-3R', changes: { exitPolicy: 'FREEROLL_3R' } },
  { id: 'ALT-RISK-0075', changes: { riskFraction: 0.0075 } },
  { id: 'ALT-RISK-025', changes: { riskFraction: 0.025 } },
].map((v) => Object.freeze({ ...v, config: Object.freeze({ ...REFERENCE_CONFIG, ...v.changes }) })));

/** Manual decisions that stay open on every setup (contracts/minervini.mjs manualReviewFlags + method questions). */
export const OPEN_MANUAL_DECISIONS = Object.freeze({
  SEPA: Object.freeze(['MIN-MR-PRIORITY', 'MIN-MR-QUALITY', 'MIN-MR-VCP', 'MIN-MR-RS']),
  POWER_PLAY: Object.freeze(['MIN-MR-PP-VOLUME']),
});

export function validateConfig(cfg) {
  const errs = [];
  if (cfg.manualSubstitute !== 'ACCEPT_AS_MODEL_ASSUMPTION') errs.push('MANUAL_SUBSTITUTE_REQUIRED');
  if (!['VCP_FOOTPRINT_STRICT', 'TREND_TEMPLATE_PIVOT_ONLY'].includes(cfg.sepaSetupProxy)) errs.push('SEPA_SETUP_PROXY');
  // MA-MIN-PP-ELIGIBLE-CLASSES: manual or data-blocked Power Play setups are never upgraded to a simulated trade
  if (!Array.isArray(cfg.ppClasses) || cfg.ppClasses.length !== 1 || cfg.ppClasses[0] !== 'CONFIRMED_MECHANICAL_SETUP') errs.push('PP_CLASSES_CONFIRMED_ONLY');
  if (!['STRUCTURE', 'MAX_PLANNED_LOSS_10'].includes(cfg.stopPlacement)) errs.push('STOP_PLACEMENT');
  if (!['BUY_STOP_LIMIT', 'BUY_STOP_MARKET'].includes(cfg.orderType)) errs.push('ORDER_TYPE');
  if (!['INTRADAY_PRICE_FIRST', 'NEXT_OPEN_AFTER_VOLUME_CONFIRMED_CLOSE'].includes(cfg.entryTiming)) errs.push('ENTRY_TIMING');
  if (!['PESSIMISTIC', 'OPTIMISTIC'].includes(cfg.intrabarOrder)) errs.push('INTRABAR_ORDER');
  if (!EXIT_POLICIES[cfg.exitPolicy]) errs.push('EXIT_POLICY');
  // research-range guard of MA-MIN-RISK-FRACTION (the printed ranges of MIN-MM-SIZE-03/04 are context, not a source bound)
  if (!(cfg.riskFraction > 0 && cfg.riskFraction <= 0.025)) errs.push('RISK_FRACTION_OUTSIDE_RESEARCH_RANGE');
  return errs;
}

// ---------------------------------------------------------------- SEPA setup

const TT_CLASS = { MISSING_DATA: 'DATA_BLOCKED', INSUFFICIENT_HISTORY_IPO_SCOPE: 'IPO_SCOPE_REVIEW', TREND_TEMPLATE_FAIL: 'NOT_QUALIFIED' };

/**
 * SEPA setup on the close of bar i from the Trend Template result and the VCP footprint. States:
 *  NOT_QUALIFIED / DATA_BLOCKED / IPO_SCOPE_REVIEW   (Trend Template, as sepaClassify);
 *  PIVOT_NOT_CONFIRMED  the pivot high has fewer than the +-swing sessions after it (no confirmed swing yet);
 *  NO_BASE            Trend Template holds, but there is no contraction after the pivot (stock at its high);
 *  PIVOT_ALREADY_EXCEEDED  a high after the pivot swing reached the pivot: the breakout is past, no fresh pivot;
 *  VCP_DATA_BLOCKED   footprint not evaluable (missing bars in the 252-session base window);
 *  SETUP_DETECTED     pivot and structure stop known; vcpProxyStrict tells whether MA-MIN-SEPA-SETUP-PROXY's strict
 *                     reading holds. "Detected" is the machine part; the VCP validity stays a manual decision.
 */
export function sepaSetupFromTrendTemplate(bars, i, tt) {
  if (tt.status !== 'TREND_TEMPLATE_1_7_PASS') return { i, date: bars[i]?.date, state: TT_CLASS[tt.status] ?? 'NOT_QUALIFIED' };
  const v = vcpContractions(bars, i);
  if (v.status !== 'EVIDENCE_ONLY') return { i, date: bars[i].date, state: 'VCP_DATA_BLOCKED', reason: v.status };
  const last = v.contractions.at(-1);
  if (!last || last.highDate !== v.pivot.date) return { i, date: bars[i].date, state: 'NO_BASE' };
  let pk = i; while (pk > 0 && bars[pk].date !== v.pivot.date) pk--;
  // the base high is used as a swing without its own confirmation in vcpContractions; the lifecycle requires the same
  // +-swing confirmation for the pivot as for every other swing high (no pivot before the contraction is visible)
  if (i - pk < COMPONENT_CONVENTIONS.swingSessions) return { i, date: bars[i].date, state: 'PIVOT_NOT_CONFIRMED', pivot: v.pivot.level };
  for (let k = pk + 1; k <= i; k++) if (bars[k].high >= v.pivot.level) return { i, date: bars[i].date, state: 'PIVOT_ALREADY_EXCEEDED', pivot: v.pivot.level };
  return {
    i, date: bars[i].date, state: 'SETUP_DETECTED', pivot: v.pivot.level, pivotDate: v.pivot.date, stopStructure: last.low,
    vcpProxyStrict: v.count >= 2 && v.contractingLeftToRight === true && fin(v.lastContractionVolumeVs50d) && v.lastContractionVolumeVs50d < 1,
    footprint: { contractions: v.count, depths: v.contractions.map((c) => c.depth), contractingLeftToRight: v.contractingLeftToRight, lastContractionVolumeVs50d: v.lastContractionVolumeVs50d, baseSessions: v.base.sessions },
  };
}
export const sepaSetupAt = (security, i) => sepaSetupFromTrendTemplate(security.bars, i, trendTemplate(security.bars, i));

/**
 * SEPA setups for every bar of a security, identical to sepaSetupAt bar by bar (test SF4-SEPA-SERIES-EQUIVALENCE). A
 * rolling-mean prefilter only skips bars whose moving-average criteria fail by a clear margin with every value present;
 * every other bar goes through trendTemplate itself, so no result differs from the unchanged screen.
 */
export function sepaSetupSeries(security, { P = MIN_PARAMS, from = null } = {}) {
  const bars = security.bars, n = bars.length, closes = bars.map((b) => b.close);
  const m50 = smaSeries(closes, P.ma[0]), m150 = smaSeries(closes, P.ma[1]), m200 = smaSeries(closes, P.ma[2]);
  const miss = new Int32Array(n + 1); for (let k = 0; k < n; k++) miss[k + 1] = miss[k] + (fin(bars[k].high) && fin(bars[k].low) ? 0 : 1);
  const need = Math.max(P.ma[2] + P.ma200RisingSessions, P.yearSessions), eps = 1e-9;
  const clearlyBelow = (a, b) => a <= b * (1 - eps); // positive prices: a > b fails by a margin
  const setups = new Map(), counts = {};
  for (let i = 0; i < n; i++) {
    if (from && bars[i].date < from) continue;
    let rec;
    if (i < need - 1) rec = { state: 'IPO_SCOPE_REVIEW' };
    else {
      const c = closes[i], a = m50[i], b = m150[i], d = m200[i], dp = m200[i - P.ma200RisingSessions];
      const allKnown = [c, a, b, d, dp].every(fin) && miss[i + 1] - miss[i - P.yearSessions + 1] === 0;
      if (allKnown && (clearlyBelow(c, b) || clearlyBelow(c, d) || clearlyBelow(b, d) || clearlyBelow(a, b) || clearlyBelow(a, d) || clearlyBelow(c, a) || clearlyBelow(d, dp))) rec = { state: 'NOT_QUALIFIED' };
      else rec = sepaSetupFromTrendTemplate(bars, i, trendTemplate(bars, i, P));
    }
    counts[rec.state] = (counts[rec.state] || 0) + 1;
    if (rec.state === 'SETUP_DETECTED') setups.set(i, rec);
  }
  return { setups, counts };
}

// ---------------------------------------------------------------- Power Play setup

function ppSetupFromClassification(bars, i, c) {
  const base = { i, date: bars[i]?.date, state: c.classification, reasons: c.reasons ?? [], dataGaps: c.dataGaps ?? [] };
  if (!c.evidence) return base;
  return { ...base, pivot: c.evidence.breakout.pivot.level, pivotDate: c.evidence.breakout.pivot.date, stopStructure: c.evidence.stopReference.level, correction: c.evidence.correction.correction, consolidationSessions: c.evidence.duration.consolidationSessions, startVolumeVs50d: c.evidence.runUp.startVolumeVs50d };
}
export const powerPlaySetupAt = (security, i) => ppSetupFromClassification(security.bars, i, powerPlayClassify(security, i));

/**
 * Power Play setups for every bar, identical to powerPlaySetupAt bar by bar (test SF4-PP-SERIES-EQUIVALENCE). Exact
 * prefilter: the screen's peak p must have a +100 % leg (a finite low at most half its high within the 39 sessions
 * before), stay strictly above every later finite high and keep every later finite low at or above 75 % of it. Both
 * conditions are monotone, so violated peaks are dropped for good; bars without a surviving peak are classified
 * without the screen (history and missing-bar checks of powerPlayClassify), all others by powerPlayClassify itself.
 */
export function powerPlaySetupSeries(security, { P = MIN_PARAMS, from = null } = {}) {
  const bars = security.bars, n = bars.length;
  const miss = new Int32Array(n + 1); for (let k = 0; k < n; k++) miss[k + 1] = miss[k] + (fin(bars[k].high) && fin(bars[k].low) ? 0 : 1);
  const setups = new Map(), counts = {};
  let active = [];
  for (let i = 0; i < n; i++) {
    const h = bars[i].high, l = bars[i].low;
    if (active.length) active = active.filter((p) => !((fin(h) && h >= bars[p].high) || (fin(l) && l < 0.75 * bars[p].high * (1 - 1e-9))));
    if (!(from && bars[i].date < from)) {
      let rec;
      if (active.length) rec = ppSetupFromClassification(bars, i, powerPlayClassify(security, i, P));
      else {
        const lo = Math.max(0, i - 2 * P.ppMaxSessions);
        rec = { i, date: bars[i].date, state: i < P.ppMaxSessions || miss[i + 1] - miss[lo] > 0 ? 'DATA_BLOCKED_SETUP' : 'NOT_QUALIFIED' };
      }
      counts[rec.state] = (counts[rec.state] || 0) + 1;
      if (rec.state !== 'NOT_QUALIFIED' && fin(rec.pivot)) setups.set(i, rec);
    }
    if (i >= 1 && fin(h)) {
      let ok = false; for (let k = Math.max(0, i - (P.ppMaxSessions - 1)); k < i && !ok; k++) if (fin(bars[k].low) && bars[k].low * P.ppMultiple <= h) ok = true;
      if (ok) active.push(i);
    }
  }
  return { setups, counts };
}

// ---------------------------------------------------------------- eligibility

/** Blocker tag of a SEPA setup state that is not SETUP_DETECTED: [rule, class] (review SF4-S-L2). */
const SEPA_STATE_BLOCKER = Object.freeze({
  NOT_QUALIFIED: ['MIN-SF-PROCESS (Trend Template 1-7)', CLASS.SOURCE_BOUNDED],
  DATA_BLOCKED: ['MIN-SF-PROCESS (missing bars)', CLASS.DATA_BLOCKED],
  VCP_DATA_BLOCKED: ['MIN-SF-VCP (missing bars in the base)', CLASS.DATA_BLOCKED],
  IPO_SCOPE_REVIEW: ['MIN-MM-IPO-01', CLASS.MANUAL_REVIEW],
  NO_BASE: ['MA-MIN-SEPA-PIVOT', CLASS.MODEL_ASSUMPTION], PIVOT_NOT_CONFIRMED: ['MA-MIN-SEPA-PIVOT', CLASS.MODEL_ASSUMPTION], PIVOT_ALREADY_EXCEEDED: ['MA-MIN-SEPA-PIVOT', CLASS.MODEL_ASSUMPTION],
});

/**
 * Fingerprint of the pre-registered research configuration (REFERENCE_CONFIG and RUN_VARIANTS). Pinned in a test and
 * written into every snapshot receipt: a change after results exist needs an owner decision (review SF4-S-Q5).
 */
export function variantRegistrySha256() {
  return crypto.createHash('sha256').update(JSON.stringify({ reference: REFERENCE_CONFIG, variants: RUN_VARIANTS.map((v) => ({ id: v.id, strategies: v.strategies ?? null, changes: v.changes })) })).digest('hex');
}

/** Stop of a setup under MA-MIN-STOP-PLACEMENT. */
export function stopFor(setup, cfg) {
  if (!setup || !fin(setup.pivot)) return null;
  return cfg.stopPlacement === 'MAX_PLANNED_LOSS_10' ? setup.pivot * (1 - MAX_PLANNED_LOSS) : fin(setup.stopStructure) ? setup.stopStructure : null;
}

/**
 * Entry eligibility of a setup known at the close of bar k - 1 for an order on bar k (k may equal bars.length: the
 * next, still unknown session). Separate from the setup class: a mechanically confirmed setup is not an executable
 * trade. Returns ENTRY_BLOCKED with every mechanical blocker, or ENTRY_POSSIBLE_PENDING_MANUAL_REVIEW with the open
 * manual decisions and the order the research simulation would place. Uses bars 0..k-1 only.
 */
export function entryEligibility({ strategy, setup, bars, k, cfg = REFERENCE_CONFIG, hasPosition = false, universe = RESEARCH_UNIVERSE }) {
  const blockers = [], add = (code, rule, cls) => blockers.push({ code, rule, class: cls });
  const isPP = strategy === 'POWER_PLAY';
  if (!setup) add('NO_SETUP', isPP ? 'MIN-SF-PP-RUNUP' : 'MIN-SF-PROCESS', CLASS.SOURCE_BOUNDED);
  else if (isPP) {
    if (setup.state === 'DATA_BLOCKED_SETUP') add('DATA_BLOCKED_SETUP', 'MIN-PP-02', CLASS.DATA_BLOCKED);
    else if (setup.state === 'NOT_QUALIFIED') add('NOT_QUALIFIED', 'MIN-SF-PP-RUNUP', CLASS.SOURCE_BOUNDED);
    else if (!cfg.ppClasses.includes(setup.state)) add('MANUAL_REVIEW_SETUP', 'MIN-SF-PP-CORRECTION / MIN-SF-PP-TIGHT', CLASS.MANUAL_REVIEW);
  } else {
    if (setup.state !== 'SETUP_DETECTED') add(setup.state, ...SEPA_STATE_BLOCKER[setup.state] ?? ['MA-MIN-SEPA-PIVOT', CLASS.MODEL_ASSUMPTION]);
    else if (cfg.sepaSetupProxy === 'VCP_FOOTPRINT_STRICT' && !setup.vcpProxyStrict) add('VCP_PROXY_NOT_MET', 'MA-MIN-SEPA-SETUP-PROXY', CLASS.MODEL_ASSUMPTION);
  }
  const pivot = setup?.pivot, stop = stopFor(setup, cfg);
  const plannedLossAtPivot = fin(pivot) && fin(stop) && pivot > 0 ? 1 - stop / pivot : null;
  if (setup && fin(pivot)) {
    if (!fin(stop) || !(stop > 0) || !(stop < pivot)) add('NO_STOP_BELOW_PIVOT', 'MIN-RISK-01', CLASS.SOURCE_BOUNDED);
    else if (plannedLossAtPivot > MAX_PLANNED_LOSS + 1e-12) add('PLANNED_LOSS_ABOVE_10PCT', 'MIN-MM-STOP-02', CLASS.SOURCE_BOUNDED);
    const prev = bars[k - 1];
    if (prev && fin(prev.close) && prev.close >= pivot) add('ALREADY_ABOVE_PIVOT', 'MA-MIN-ORDER-TYPE (reading of MIN-VCP-07 / MIN-PRICE-01)', CLASS.MODEL_ASSUMPTION);
  }
  if (k < 1 || !eligibleAtPriorSession(bars, k, universe)) add('OUTSIDE_RESEARCH_UNIVERSE', 'VU_TOURNAMENT_UNIVERSE_705 (convention)', CLASS.MODEL_ASSUMPTION);
  if (hasPosition) add('POSITION_OPEN_DUPLICATE_SIGNAL', 'MIN-ADD-01 (adds are manual)', CLASS.MANUAL_REVIEW);
  const manual = [...OPEN_MANUAL_DECISIONS[isPP ? 'POWER_PLAY' : 'SEPA'], ...(isPP && setup?.reasons ? setup.reasons.map((r) => `PP:${r}`) : [])];
  const ok = blockers.length === 0;
  return {
    strategy, asOf: bars[k - 1]?.date ?? null, state: ok ? 'ENTRY_POSSIBLE_PENDING_MANUAL_REVIEW' : 'ENTRY_BLOCKED', blockers, openManualDecisions: manual,
    plannedLossAtPivot, buyDeclarationAllowed: false, ...TRANSL, ...NOT_A_STRATEGY,
    order: ok ? { type: cfg.orderType, level: pivot, stop, limit: cfg.orderType === 'BUY_STOP_LIMIT' ? stop / (1 - MAX_PLANNED_LOSS) : null, validFor: 'NEXT_SESSION_ONLY', simulatedOnly: true } : null,
  };
}

// ---------------------------------------------------------------- daily-bar order model

/**
 * Fill of a research buy order on one daily bar (no broker, simulated only). order: { type, level, stop, limit } for the
 * buy stop at the pivot, or { type: 'ON_OPEN', stop, limit } for the volume-confirmed next-open variant.
 * Fill basis:
 *  OPEN_GAP_AT_OR_ABOVE_PIVOT  the open is at or above the pivot: fill at the open (the stop order triggers at the open);
 *  INTRADAY_PIVOT_TOUCH        open below, high at or above the pivot: fill at the pivot;
 *  LIMIT_FILL_AFTER_OPEN       the open is above the limit and the price later trades down to it: fill at the limit;
 *  OPEN                        next-open variant: fill at the open.
 * sameBarStop: CERTAIN when the fill happened at or after the open on the way down (gap, limit, open fills) and the low
 * reaches the stop; AMBIGUOUS for an intraday pivot touch (MA-MIN-INTRABAR-ORDER decides).
 */
export function fillBuyOrder(bar, order) {
  if (!isExecutableBar(bar, 'open') || !fin(bar.high) || !fin(bar.low)) return { status: 'NOT_EXECUTED_NO_SOURCE_BAR' };
  let fill, basis;
  if (order.type === 'ON_OPEN') { fill = bar.open; basis = 'OPEN'; }
  else {
    if (!(bar.high >= order.level)) return { status: 'NOT_TRIGGERED' };
    if (bar.open >= order.level) { fill = bar.open; basis = 'OPEN_GAP_AT_OR_ABOVE_PIVOT'; } else { fill = order.level; basis = 'INTRADAY_PIVOT_TOUCH'; }
  }
  if (fin(order.limit) && fill > order.limit) {
    if (bar.low <= order.limit) { fill = order.limit; basis = 'LIMIT_FILL_AFTER_OPEN'; } else return { status: 'NOT_EXECUTED_ABOVE_LIMIT', open: bar.open, limit: order.limit, rule: 'MIN-MM-STOP-02 via MA-MIN-ORDER-TYPE' };
  }
  if (!(fill > order.stop)) return { status: 'NOT_EXECUTED_PRICE_AT_OR_BELOW_STOP', fill };
  const plannedLoss = 1 - order.stop / fill;
  const sameBarStop = bar.low <= order.stop ? (basis === 'INTRADAY_PIVOT_TOUCH' ? 'AMBIGUOUS' : 'CERTAIN') : null;
  return { status: 'FILLED', fill, basis, plannedLoss, plannedLossExceedsMax: plannedLoss > MAX_PLANNED_LOSS + 1e-12, sameBarStop };
}

/** Breakout volume of bar i vs the mean of the 50 prior sessions (MIN-VCP-07 reading, evidence; null if not measurable). */
export function breakoutVolumeVs50d(bars, i) {
  const m = priorMean(bars, i, 50, 'volume');
  return fin(m) && m > 0 && fin(bars[i]?.volume) ? bars[i].volume / m : null;
}
