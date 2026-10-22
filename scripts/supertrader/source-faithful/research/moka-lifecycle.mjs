/**
 * Supertrader 5.0 – Morales / Kacher Pocket Pivot (C11) and Buyable Gap-Up (C12) trade lifecycles
 * (contracts/morales-kacher.mjs) on the shared research engine (research/lifecycle-engine.mjs). Built on the unchanged
 * screens and the sell-guide evidence of methods/morales-kacher.mjs; report docs/SUPERTRADER_5_FULL_STRATEGY_ADVANCEMENT_REPORT.md.
 *
 * Source-exact mechanics (#709 W-MOKAPP / W-MOKA12 / W-MOKAV24, HARD, HIGH, original wording checked):
 *  - Pocket Pivot: volume of an up day greater than the highest down-day volume of the ten prior sessions (MOKAPP-003);
 *  - Buyable Gap-Up: gap >= 0.75 x ATR40 (MOKA12-004) with standard volume 150 % OF the average (MOKA24-VOL);
 * Preferences used as a declared model (MODEL_ASSUMPTION, pre-registered alternatives):
 *  - the sell guide: 10DMA if it was respected for >= 7 weeks, otherwise 50DMA (MOKA12-008 / MOKASTOP-001); a violation
 *    is a close below the guide MA followed by a lower low; the follow-up day is SOURCE_AMBIGUOUS (MOKA-C2: next day in
 *    the 2012 slide, later days in the FAQ): both readings are pre-registered, the dedicated selling source (FAQ) is the
 *    reference; the whole position is sold (MOKASTOP-004: Gil often all, Chris sometimes half - a reviewer decision);
 *  - BGU: the gap-day low is the risk reference (MOKA12-007); below it at least half is generally sold (MOKASTOP-006):
 *    the reference sells all (inside "at least half"), as a stop-market order at the gap-day low;
 *  - context (constructive base, theme, leadership, uptrend) is manual (MOKA-MR-*); a 50-day MA proxy is the reference
 *    reading of MOKAPP-007 / MOKA12-006, and "no proxy" is pre-registered.
 * Entry: both screens need the FULL-day volume, known only after the close; intraday projected volume is not in the
 * snapshot. The PIT-safe daily variant buys at the next open after the signal close (MA-MOKA-ENTRY-TIMING). A buy at the
 * signal close would use volume that is not known before that close and is not modelled.
 * The Pocket Pivot has no numeric stop in the sources (MOKA-SF-PP-STOP manual): no price stop is invented; the sell guide
 * is the only exit, and sizing is a fixed weight.
 */
import crypto from 'node:crypto';
import { fin, smaAt } from '../common/series.mjs';
import { pocketPivotAt, gapUpAt, MOKA_PARAMS, MOKA_VERSION } from '../methods/morales-kacher.mjs';
import { eligibilityResult, STUDY_LABEL } from './lifecycle-engine.mjs';

export const MOKA_LIFECYCLE_VERSION = 'sf5-moka-lifecycle-1.0.0';

export const MOKA_MODEL_ASSUMPTIONS = Object.freeze([
  { id: 'MA-MOKA-MANUAL-SUBSTITUTE', phase: 'ENTRY_ELIGIBILITY', strategies: ['POCKET_PIVOT', 'BUYABLE_GAP_UP'], reference: 'ACCEPT_AS_MODEL_ASSUMPTION (simulation only)', alternatives: [], why: 'base, theme, extension (MOKA-MR-BASE / -THEME / -EXT) and leadership, megacap exception, volume window (MOKA-MR-LEAD / -MEGA / -VOLWINDOW) are the reviewer\'s; a run is a model study' },
  { id: 'MA-MOKA-CONTEXT-PROXY', phase: 'SETUP_QUALIFICATION', strategies: ['POCKET_PIVOT', 'BUYABLE_GAP_UP'], reference: 'Pocket Pivot: close of the signal day above its 50-day MA (MOKAPP-007 "avoid below the critical MA"); BGU: close before the gap day above its 50-day MA (MOKA12-006 uptrend)', alternatives: ['NONE'], why: 'context is a preference; #709 names "the critical MA" (MOKAPP-007) and an uptrend (MOKA12-006) without a period: the 50-day MA is a VU choice (the authors\' sell guide uses the 10 / 50-day MAs, MOKA12-008); the 200-day support exception of MOKAPP-007 is not modelled' },
  { id: 'MA-MOKA-ENTRY-TIMING', phase: 'ENTRY_EXECUTION', strategies: ['POCKET_PIVOT', 'BUYABLE_GAP_UP'], reference: 'NEXT_OPEN after the signal close (full-day volume known)', alternatives: [], why: 'the authors buy intraday on projected volume (DATA_BLOCKED); a signal-close fill would use the day\'s final volume before it is known' },
  { id: 'MA-MOKA-VIOLATION-READING', phase: 'EXIT_CONDITIONS', strategies: ['POCKET_PIVOT', 'BUYABLE_GAP_UP'], reference: 'LATER_DAYS (FAQ, MOKASTOP-002): the highest low of the closes below the guide MA since the entry stays the trigger until undercut', alternatives: ['NEXT_DAY (2012 slide, MOKA12-009): only the session after a close below the MA can confirm'], why: 'MOKA-C2 conflict kept open (MOKA-SF-EXIT-VIOLATION SOURCE_AMBIGUOUS); the dedicated selling source is the reference' },
  { id: 'MA-MOKA-SELL-GUIDE', phase: 'POSITION_MANAGEMENT', strategies: ['POCKET_PIVOT', 'BUYABLE_GAP_UP'], reference: 'guide = 10DMA when it was respected for >= 35 sessions (7 weeks x 5) under the same violation reading, else 50DMA, re-evaluated at every close (sellGuideEvidence); the whole position is sold at the undercut (stop-market at the violation-day low)', alternatives: [], why: 'MOKA12-008 / MOKASTOP-001 PREFERENCE; full vs half (MOKASTOP-004) is a reviewer decision' },
  { id: 'MA-MOKA-BGU-STOP', phase: 'INITIAL_STOP', strategies: ['BUYABLE_GAP_UP'], reference: 'stop-market at the gap-day low, whole position', alternatives: [], why: 'MOKA12-007 risk reference; MOKASTOP-006 "generally at least half" - selling all lies inside the printed rule' },
  { id: 'MA-MOKA-BGU-VOLWINDOW', phase: 'SETUP_QUALIFICATION', strategies: ['BUYABLE_GAP_UP'], reference: '1.5x the mean volume of the 50 sessions before the gap day (gapUpAt)', alternatives: [], why: 'the averaging window is SOURCE_AMBIGUOUS (MOKA-SF-BGU-VOLWINDOW); only the screen\'s window is run, so the measurement depends on this choice (owner decision)' },
  { id: 'MA-MOKA-SIZING', phase: 'POSITION_SIZING', strategies: ['POCKET_PIVOT', 'BUYABLE_GAP_UP'], reference: 'Pocket Pivot: WEIGHT 0.10 (no price stop to size against); BGU: RISK 0.01 to the gap-day low', alternatives: ['PP WEIGHT 0.05 / 0.20', 'BGU RISK 0.005 / 0.02'], why: 'sizing is not specified in #709 (MOKA-SF-PP-SIZE, MOKA-SF-BGU-SIZE manual)' },
  { id: 'MA-MOKA-RESEARCH-UNIVERSE', phase: 'ENTRY_ELIGIBILITY', strategies: ['POCKET_PIVOT', 'BUYABLE_GAP_UP'], reference: 'VU_TOURNAMENT_UNIVERSE_705 at the signal session', alternatives: [], why: 'measurement convention shared by every method' },
  { id: 'MA-MOKA-COSTS', phase: 'ENTRY_EXECUTION', strategies: ['POCKET_PIVOT', 'BUYABLE_GAP_UP'], reference: '10 bps slippage per side, 1 bp commission (platform policy)', alternatives: [], why: 'no costs in the sources' },
]);

const BASE = Object.freeze({ manualSubstitute: 'ACCEPT_AS_MODEL_ASSUMPTION', contextProxy: 'MA50', violationReading: 'LATER_DAYS', intrabarOrder: 'PESSIMISTIC' });
export const PP_REFERENCE_CONFIG = Object.freeze({ ...BASE, sizing: Object.freeze({ mode: 'WEIGHT', weight: 0.10 }) });
export const BGU_REFERENCE_CONFIG = Object.freeze({ ...BASE, sizing: Object.freeze({ mode: 'RISK', riskFraction: 0.01 }) });

const variants = (ref, list) => Object.freeze(list.map((v) => Object.freeze({ ...v, config: Object.freeze({ ...ref, ...v.changes }) })));
export const PP_RUN_VARIANTS = variants(PP_REFERENCE_CONFIG, [
  { id: 'REF', changes: {} },
  { id: 'ALT-CONTEXT-NONE', changes: { contextProxy: 'NONE' } },
  { id: 'ALT-VIOLATION-NEXT-DAY', changes: { violationReading: 'NEXT_DAY' } },
  { id: 'ALT-SIZE-WEIGHT-005', changes: { sizing: { mode: 'WEIGHT', weight: 0.05 } } },
  { id: 'ALT-SIZE-WEIGHT-020', changes: { sizing: { mode: 'WEIGHT', weight: 0.20 } } },
]);
export const BGU_RUN_VARIANTS = variants(BGU_REFERENCE_CONFIG, [
  { id: 'REF', changes: {} },
  { id: 'ALT-CONTEXT-NONE', changes: { contextProxy: 'NONE' } },
  { id: 'ALT-VIOLATION-NEXT-DAY', changes: { violationReading: 'NEXT_DAY' } },
  { id: 'ALT-RISK-0005', changes: { sizing: { mode: 'RISK', riskFraction: 0.005 } } },
  { id: 'ALT-RISK-002', changes: { sizing: { mode: 'RISK', riskFraction: 0.02 } } },
]);

export const PP_OPEN_MANUAL_DECISIONS = Object.freeze(['MOKA-MR-BASE', 'MOKA-MR-THEME', 'MOKA-MR-EXT']);
export const BGU_OPEN_MANUAL_DECISIONS = Object.freeze(['MOKA-MR-LEAD', 'MOKA-MR-MEGA', 'MOKA-MR-VOLWINDOW']);

function validate(cfg, strategy) {
  const errs = [];
  if (cfg.manualSubstitute !== 'ACCEPT_AS_MODEL_ASSUMPTION') errs.push('MANUAL_SUBSTITUTE_REQUIRED');
  if (!['MA50', 'NONE'].includes(cfg.contextProxy)) errs.push('CONTEXT_PROXY');
  if (!['LATER_DAYS', 'NEXT_DAY'].includes(cfg.violationReading)) errs.push('VIOLATION_READING');
  if (!['PESSIMISTIC', 'OPTIMISTIC'].includes(cfg.intrabarOrder)) errs.push('INTRABAR_ORDER');
  const s = cfg.sizing;
  if (strategy === 'POCKET_PIVOT' && !(s?.mode === 'WEIGHT' && s.weight > 0 && s.weight <= 0.25)) errs.push('PP_SIZING_WEIGHT_ONLY'); // no price stop to size against
  if (strategy === 'BUYABLE_GAP_UP' && !(s?.mode === 'RISK' && s.riskFraction > 0 && s.riskFraction <= 0.025)) errs.push('BGU_SIZING_OUTSIDE_RESEARCH_RANGE');
  return errs;
}
export const validatePpConfig = (cfg) => validate(cfg, 'POCKET_PIVOT');
export const validateBguConfig = (cfg) => validate(cfg, 'BUYABLE_GAP_UP');

/**
 * Last confirmed 10DMA violation up to every bar under one reading, in one forward pass; identical to the scan of
 * methods/morales-kacher.mjs#sellGuideEvidence (test GC-SF5-MOKA-GUIDE-EQUIV). Returns the proposed guide per bar.
 */
export function sellGuideSeries(bars, reading, P = MOKA_PARAMS) {
  const n = bars.length, guide = new Array(n).fill(null);
  const below = (k) => { const m = smaAt(bars, k, 10); return m !== null && fin(bars[k].close) && bars[k].close < m; };
  const firstMa = bars.findIndex((_, k) => smaAt(bars, k, 10) !== null), minSessions = P.respectWeeks * P.sessionsPerWeek;
  let ref = null, last = null;
  for (let k = 0; k < n; k++) {
    if (k >= 10) {
      const b = bars[k];
      if (!fin(b.low)) { if (reading === 'NEXT_DAY') ref = null; }
      else {
        if (ref !== null && b.low < ref) { last = k; ref = null; }
        if (reading === 'NEXT_DAY') ref = below(k) ? b.low : null;
        else if (below(k)) ref = ref === null ? b.low : Math.max(ref, b.low);
      }
    }
    const since = last === null ? (firstMa >= 0 && firstMa <= k ? k - firstMa + 1 : 0) : k - last;
    guide[k] = since >= minSessions ? 10 : 50;
  }
  return guide;
}

function prepareCommon(security, cfg, signalFn) {
  const bars = security.bars, setups = new Map();
  for (let i = 0; i < bars.length; i++) { const s = signalFn(bars, i, cfg); if (s) setups.set(i, s); }
  return setups.size ? { setups, bars, guide: sellGuideSeries(bars, cfg.violationReading) } : null;
}

/** MA-MOKA-SELL-GUIDE / MA-MOKA-VIOLATION-READING at the close of a held bar i. */
function sellGuideOnClose(pos, ctx, i, api, cfg) {
  const bars = ctx.bars, n = ctx.guide[i], m = smaAt(bars, i, n), b = bars[i], st = pos.state;
  st.refs ??= { 10: null, 50: null };
  for (const k of [10, 50]) {
    const mk = k === n ? m : smaAt(bars, i, k), below = fin(mk) && fin(b.close) && b.close < mk;
    if (cfg.violationReading === 'NEXT_DAY') st.refs[k] = below && fin(b.low) ? b.low : null;
    else {
      // a violation confirmed by this low is used up (sellGuideSeries / sellGuideEvidence reset; review SF5-C-M1); for the
      // active guide the engine has already sold on this undercut, for the other MA the level must not come back later
      if (st.refs[k] !== null && fin(b.low) && b.low < st.refs[k]) st.refs[k] = null;
      if (below && fin(b.low)) st.refs[k] = st.refs[k] === null ? b.low : Math.max(st.refs[k], b.low);
    }
  }
  const lvl = st.refs[n];
  const cur = pos.trigger;
  if (lvl === null) { if (cur) api.setTrigger(null); }
  else if (!cur || cur.level !== lvl || cur.ma !== n) api.setTrigger({ level: lvl, strict: true, reason: `MOKA_MA${n}_VIOLATION`, rule: n === 10 ? 'MOKA12-008 10DMA guide / MOKA-SF-EXIT-VIOLATION' : 'MOKA12-008 50DMA guide / MOKA-SF-EXIT-VIOLATION', ma: n });
}

export function pocketPivotSignal(bars, i, cfg) {
  const r = pocketPivotAt(bars, i);
  if (r.status !== 'VOLUME_SIGNATURE') return null;
  const m50 = smaAt(bars, i, 50), aboveMa50 = fin(m50) ? bars[i].close > m50 : null;
  if (cfg.contextProxy === 'MA50' && aboveMa50 !== true) return null;
  return { i, date: bars[i].date, evidence: { volume: r.volume, maxDownVolume: r.maxDownVolume, downDays: r.downDays, aboveMa50 } };
}
export function buyableGapUpSignal(bars, i, cfg) {
  const r = gapUpAt(bars, i);
  if (r.status !== 'GAP_AND_STANDARD_VOLUME') return null; // exception and window-unavailable records stay with the reviewer
  const m50 = i >= 1 ? smaAt(bars, i - 1, 50) : null, priorAboveMa50 = fin(m50) ? bars[i - 1].close > m50 : null;
  if (cfg.contextProxy === 'MA50' && priorAboveMa50 !== true) return null;
  return { i, date: bars[i].date, gapDayLow: bars[i].low, evidence: { gapInAtr: r.gapInAtr, volumeRatio: r.volumeRatio, priorAboveMa50 } };
}

export const POCKET_PIVOT_ADAPTER = Object.freeze({
  strategy: 'POCKET_PIVOT', version: MOKA_LIFECYCLE_VERSION, methodVersion: MOKA_VERSION, label: STUDY_LABEL.MODEL,
  validateConfig: validatePpConfig,
  prepareKey: (cfg) => `${cfg.contextProxy}|${cfg.violationReading}`,
  prepare: (security, cfg) => prepareCommon(security, cfg, pocketPivotSignal),
  signalAt: (ctx, i) => ctx.setups.get(i) ?? null,
  eligibility: ({ bars, i }) => eligibilityResult({ strategy: 'POCKET_PIVOT', bars, i, blockers: [], openManualDecisions: PP_OPEN_MANUAL_DECISIONS, order: { type: 'ON_OPEN', stop: null, rule: 'MA-MOKA-ENTRY-TIMING; no price stop (MOKA-SF-PP-STOP manual)' } }),
  onClose: sellGuideOnClose,
});

export const BUYABLE_GAP_UP_ADAPTER = Object.freeze({
  strategy: 'BUYABLE_GAP_UP', version: MOKA_LIFECYCLE_VERSION, methodVersion: MOKA_VERSION, label: STUDY_LABEL.MODEL,
  validateConfig: validateBguConfig,
  prepareKey: (cfg) => `${cfg.contextProxy}|${cfg.violationReading}`,
  prepare: (security, cfg) => prepareCommon(security, cfg, buyableGapUpSignal),
  signalAt: (ctx, i) => ctx.setups.get(i) ?? null,
  eligibility: ({ setup, bars, i }) => {
    const blockers = fin(setup.gapDayLow) ? [] : [{ code: 'NO_GAP_DAY_LOW', rule: 'MOKA-SF-BGU-SELLGUIDE', class: 'DATA_BLOCKED' }];
    return eligibilityResult({ strategy: 'BUYABLE_GAP_UP', bars, i, blockers, openManualDecisions: BGU_OPEN_MANUAL_DECISIONS, order: { type: 'ON_OPEN', stop: setup.gapDayLow, rule: 'MA-MOKA-ENTRY-TIMING; stop MA-MOKA-BGU-STOP (MOKA12-007)' } });
  },
  onClose: sellGuideOnClose,
});

export function mokaVariantRegistrySha256() {
  return crypto.createHash('sha256').update(JSON.stringify({ pp: { reference: PP_REFERENCE_CONFIG, variants: PP_RUN_VARIANTS.map((v) => ({ id: v.id, changes: v.changes })) }, bgu: { reference: BGU_REFERENCE_CONFIG, variants: BGU_RUN_VARIANTS.map((v) => ({ id: v.id, changes: v.changes })) } })).digest('hex');
}
