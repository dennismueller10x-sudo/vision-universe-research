/**
 * Supertrader 5.0 – Raschke Holy Grail research variant (C13, contracts/holy-grail.mjs) on the shared research engine.
 * NOT a change of the contract: RAS-SF-ENTRY and RAS-SF-STOP stay SOURCE_AMBIGUOUS until the owner accepts the source.
 *
 * Source checked in Supertrader 5.0 (legally free, hosted by the author on her own site):
 *   W-RAS97  AIQ Opening Bell Vol. 6 Issue 8 (August 1997), "Linda Bradford Raschke on Short Term Trading Strategies",
 *            https://lindaraschke.net/wp-content/uploads/2026/01/august1997.pdf (sha256 693ce57175bf4cf27057c2c2bd5f775df2a85ca0309b00c73d568488f79e0ffb),
 *            sidebar "Holy Grail Pattern", Buy rules: 1. 14-period ADX initially greater than 30 and rising; 2. a
 *            retracement to the 20-period exponential moving average; 3. when the price touches the 20 period moving
 *            average, put a buy stop above the high of the previous bar; 4. once filled, a protective sell stop at the
 *            newly formed swing low; trail stops as profits grow.
 *   Caveat: the sidebar is most likely the newsletter's summary of Street Smarts (1995, commercial, not used), not text
 *   written by Raschke; hosting on her site suggests endorsement. Owner decision D-RAS97 (report): accept as source?
 * What this variant runs (every choice the sidebar does not make is a declared model assumption):
 *  - setup on the close of bar i: ADX(14) > 30 at i - 1, +DI > -DI (long side), low of bar i at or below the 20 EMA (the
 *    unchanged component of methods/holy-grail.mjs). "Initially greater than 30 and rising" (W-RAS97 rule 1) holds for
 *    every run above 30 (ADX crossed 30 upward); at the touch the ADX usually turns down (rule 2), so no extra condition;
 *  - order: buy stop one raw cent above the high of the touch bar, valid for the next session (MA-RAS-PREVIOUS-BAR);
 *  - stop: the newly formed swing low = lowest low from the impulse high to the touch bar (MA-RAS-SWING-LOW);
 *  - exit: "trail stops as profits grow" has no mechanics; RAS04-003 names a new high as an exit opportunity, so the
 *    reference exits at the next open after the first close above the impulse high (MA-RAS-EXIT); the short side needs
 *    borrow data and is not run.
 */
import crypto from 'node:crypto';
import { fin, emaSeries, rawTickAdjusted } from '../common/series.mjs';
import { adx, HG_PARAMS, HOLY_GRAIL_VERSION } from '../methods/holy-grail.mjs';
import { eligibilityResult, STUDY_LABEL } from './lifecycle-engine.mjs';

export const HG_LIFECYCLE_VERSION = 'sf5-holy-grail-research-variant-1.0.0';
export const W_RAS97 = Object.freeze({ sourceId: 'W-RAS97', url: 'https://lindaraschke.net/wp-content/uploads/2026/01/august1997.pdf', sha256: '693ce57175bf4cf27057c2c2bd5f775df2a85ca0309b00c73d568488f79e0ffb', provenance: 'WEB_HOSTED_BY_AUTHOR_THIRD_PARTY_SIDEBAR', status: 'PENDING_OWNER_DECISION_D-RAS97', contractStatusUnchanged: true });

export const HG_MODEL_ASSUMPTIONS = Object.freeze([
  { id: 'MA-RAS-SOURCE-W-RAS97', phase: 'ENTRY_EXECUTION', reference: 'entry order and initial stop read from W-RAS97 (research variant, owner decision pending)', alternatives: [], why: 'the contract source W-RAS04 discloses neither (#709 C13); W-RAS97 is a newsletter sidebar on the author\'s site' },
  { id: 'MA-RAS-PREVIOUS-BAR', phase: 'ENTRY_EXECUTION', reference: 'TOUCH_BAR: buy stop one raw cent above the high of the bar that touched the 20 EMA, for the next session only', alternatives: ['BAR_BEFORE_TOUCH: above the high of the bar before the touch bar'], why: '"the previous bar" is read from the next session, where the touch bar is the previous bar; the other reading is pre-registered' },
  { id: 'MA-RAS-SWING-LOW', phase: 'INITIAL_STOP', reference: 'lowest low from the impulse high (highest high since ADX rose above 30) to the touch bar', alternatives: [], why: '"newly formed swing low" without a swing definition; the pullback low is the low the pattern forms' },
  { id: 'MA-RAS-EXIT', phase: 'EXIT_CONDITIONS', reference: 'NEW_HIGH: first close above the impulse high exits at the next open (RAS04-003 preference)', alternatives: [], why: '"trail stops as profits grow" gives no rule; the stop is not trailed' },
  { id: 'MA-RAS-INTRABAR-ORDER', phase: 'INITIAL_STOP', reference: 'PESSIMISTIC', alternatives: ['OPTIMISTIC'], why: 'daily bars do not show the order of the trigger and a low below the stop' },
  { id: 'MA-RAS-COSTS', phase: 'ENTRY_EXECUTION', reference: '10 bps slippage per side, 1 bp commission (platform policy)', alternatives: [], why: 'no costs in the source' },
  { id: 'MA-RAS-SIZING', phase: 'POSITION_SIZING', reference: 'RISK 0.01 to the swing-low stop (platform model assumption)', alternatives: [], why: 'size not disclosed (RAS-SF-SIZE SOURCE_AMBIGUOUS)' },
]);

export const HG_REFERENCE_CONFIG = Object.freeze({ sourceVariant: 'W-RAS97', previousBar: 'TOUCH_BAR', intrabarOrder: 'PESSIMISTIC', sizing: Object.freeze({ mode: 'RISK', riskFraction: 0.01 }) });
export const HG_RUN_VARIANTS = Object.freeze([
  { id: 'REF', changes: {} },
  { id: 'ALT-PREVIOUS-BAR-BEFORE-TOUCH', changes: { previousBar: 'BAR_BEFORE_TOUCH' } },
  { id: 'ALT-INTRABAR-OPTIMISTIC', changes: { intrabarOrder: 'OPTIMISTIC' } },
].map((v) => Object.freeze({ ...v, config: Object.freeze({ ...HG_REFERENCE_CONFIG, ...v.changes }) })));

export function validateHgConfig(cfg) {
  const errs = [];
  if (cfg.sourceVariant !== 'W-RAS97') errs.push('SOURCE_VARIANT');
  if (!['TOUCH_BAR', 'BAR_BEFORE_TOUCH'].includes(cfg.previousBar)) errs.push('PREVIOUS_BAR');
  if (!['PESSIMISTIC', 'OPTIMISTIC'].includes(cfg.intrabarOrder)) errs.push('INTRABAR_ORDER');
  if (!(cfg.sizing?.mode === 'RISK' && cfg.sizing.riskFraction > 0 && cfg.sizing.riskFraction <= 0.025)) errs.push('SIZING');
  return errs;
}

/** Setups of a security: one pass with the unchanged ADX and the 20 EMA; bar i uses bars 0..i only. */
export function holyGrailSetupSeries(bars, P = HG_PARAMS) {
  const { ADX, PDI, MDI } = adx(bars, P.adxPeriod), ema = emaSeries(bars.map((b) => b.close), P.ema), setups = new Map();
  let k0 = null; // first bar of the current run with ADX > 30
  for (let i = 2; i < bars.length; i++) {
    const j = i - 1;
    if (fin(ADX[j]) && ADX[j] > P.adxThreshold) { if (k0 === null) k0 = j; } else k0 = null;
    if (k0 === null || !(PDI[j] > MDI[j]) || !fin(ema[i]) || !fin(bars[i].low) || !(bars[i].low <= ema[i])) continue;
    let hi = -Infinity, hiK = -1; for (let k = k0; k < i; k++) if (fin(bars[k].high) && bars[k].high > hi) { hi = bars[k].high; hiK = k; }
    if (hiK < 0) continue;
    let lo = Infinity; for (let k = hiK; k <= i; k++) if (fin(bars[k].low)) lo = Math.min(lo, bars[k].low);
    setups.set(i, { i, date: bars[i].date, impulseHigh: hi, impulseHighDate: bars[hiK].date, swingLow: lo, touchHigh: bars[i].high, priorHigh: bars[i - 1].high, adx: ADX[j], ema20: ema[i], evidence: { adx: ADX[j], adxAbove30Since: bars[k0].date, ema20: ema[i], impulseHigh: hi, swingLow: lo } });
  }
  return setups;
}

export const HOLY_GRAIL_RESEARCH_ADAPTER = Object.freeze({
  strategy: 'HOLY_GRAIL_W_RAS97_VARIANT', version: HG_LIFECYCLE_VERSION, methodVersion: HOLY_GRAIL_VERSION, label: 'MODEL_LIFECYCLE_STUDY_RESEARCH_VARIANT_SOURCE_PENDING',
  validateConfig: validateHgConfig,
  prepareKey: () => 'W-RAS97',
  prepare(security) { const setups = holyGrailSetupSeries(security.bars); return setups.size ? { setups, bars: security.bars } : null; },
  signalAt: (ctx, i) => ctx.setups.get(i) ?? null,
  eligibility({ setup, bars, i, cfg }) {
    const ref = cfg.previousBar === 'TOUCH_BAR' ? setup.touchHigh : setup.priorHigh, blockers = [];
    const level = fin(ref) ? ref + rawTickAdjusted(bars[i]) : null;
    if (!fin(level)) blockers.push({ code: 'NO_REFERENCE_HIGH', rule: 'MA-RAS-PREVIOUS-BAR', class: 'DATA_BLOCKED' });
    else if (!(setup.swingLow < level)) blockers.push({ code: 'NO_STOP_BELOW_ENTRY', rule: 'MA-RAS-SWING-LOW', class: 'MODEL_ASSUMPTION' });
    return eligibilityResult({ strategy: 'HOLY_GRAIL_W_RAS97_VARIANT', bars, i, blockers, openManualDecisions: ['RAS-MR-IMPULSE', 'RAS-MR-EXECUTION', 'D-RAS97'], order: { type: 'BUY_STOP', level, stop: setup.swingLow, impulseHigh: setup.impulseHigh, rule: 'W-RAS97 rules 3 / 4 (research variant)' }, extra: { source: W_RAS97 } });
  },
  onClose(pos, ctx, i, api) {
    const imp = pos.trade.setupEvidence?.impulseHigh;
    if (fin(imp) && ctx.bars[i].close > imp) api.scheduleExit(1, 'RAS_NEW_HIGH_EXIT');
  },
});

export function hgVariantRegistrySha256() {
  return crypto.createHash('sha256').update(JSON.stringify({ reference: HG_REFERENCE_CONFIG, variants: HG_RUN_VARIANTS.map((v) => ({ id: v.id, changes: v.changes })) })).digest('hex');
}
