/**
 * Supertrader 6.0 – model variants that close the one missing lifecycle phase of Pocket Pivot (C11, no initial stop) and
 * of the Holy Grail research variant (C13, no trailing). Both phases are SOURCE_BLOCKED: no source discloses them
 * (contracts/morales-kacher.mjs MOKA-SF-PP-STOP, research/holy-grail-lifecycle.mjs "trail stops as profits grow" without
 * mechanics). The mandate allows an alternative research execution if it stays labelled as a model assumption. So:
 *  - every variant here is a VU RESEARCH OPERATIONALIZATION, never a source rule; contract statuses do not change;
 *  - each variant changes exactly ONE phase of the unchanged Supertrader 5.0 reference (same adapter, same screens, same
 *    configuration otherwise) and reuses a definition that already exists in the code (no new number);
 *  - the sf5 registry, its fingerprint and its references are not touched (wrappers only); the variants have their own
 *    registry and fingerprint, pinned before the first snapshot result (test sf-sf6-model-variants);
 *  - the label MODEL_LIFECYCLE_STUDY_SF6_MODEL_VARIANT marks a lifecycle whose missing phase is modelled: "9/9 phases
 *    under a model variant" is not "source-complete".
 */
import crypto from 'node:crypto';
import { fin } from '../common/series.mjs';
import { POCKET_PIVOT_ADAPTER, PP_REFERENCE_CONFIG, PP_OPEN_MANUAL_DECISIONS } from './moka-lifecycle.mjs';
import { HOLY_GRAIL_RESEARCH_ADAPTER, HG_REFERENCE_CONFIG } from './holy-grail-lifecycle.mjs';
import { eligibilityResult } from './lifecycle-engine.mjs';

export const SF6_MODEL_VARIANTS_VERSION = 'sf6-model-variants-1.0.0';
export const SF6_MODEL_LABEL = 'MODEL_LIFECYCLE_STUDY_SF6_MODEL_VARIANT';

export const SF6_MODEL_ASSUMPTIONS = Object.freeze([
  Object.freeze({ id: 'MA6-PP-STOP-SIGNAL-DAY-LOW', candidateId: 'C11', phase: 'INITIAL_STOP', sourceStatus: 'SOURCE_BLOCKED (MOKA-SF-PP-STOP: no numeric stop in the Pocket Pivot rules)', reference: 'stop-market for the whole position at the low of the Pocket Pivot day, entry unchanged at the next open; sizing unchanged (WEIGHT 0.10); sell guide unchanged', analogy: 'the same authors use the gap-day low as the risk reference of the Buyable Gap-Up (MOKA12-007, MA-MOKA-BGU-STOP); transferred by analogy to the signal day of the Pocket Pivot', notASourceRule: true, why: 'closes the INITIAL_STOP phase for a measurable research study; without it the 20 position slots stay filled and the neutral fill order decides which signals trade (Supertrader 5.0 finding)' }),
  Object.freeze({ id: 'MA6-HG-TRAIL-SWING-LOWS', candidateId: 'C13', phase: 'POSITION_MANAGEMENT', sourceStatus: 'SOURCE_BLOCKED (W-RAS97 "trail stops as profits grow" without mechanics)', reference: 'the new-high exit is replaced by a trailing stop: after the highest high so far, the lowest low of the following pullback becomes the stop once a later close exceeds that high (each new swing low confirmed by a higher close); the initial stop is unchanged', analogy: 'repeats the variant\'s own swing-low definition (MA-RAS-SWING-LOW: lowest low from the impulse high to the pullback) on every new swing; no parameter', notASourceRule: true, why: 'the reference exits at the first close above the impulse high (MA-RAS-EXIT), so profits are never trailed; this variant measures the trailing reading the source names' }),
]);

/** Pocket Pivot with a model stop at the signal-day low (one change against PP_REFERENCE_CONFIG). */
export const PP_MODEL_STOP_ADAPTER = Object.freeze({
  ...POCKET_PIVOT_ADAPTER,
  strategy: 'POCKET_PIVOT', version: `${POCKET_PIVOT_ADAPTER.version}+${SF6_MODEL_VARIANTS_VERSION}`, label: SF6_MODEL_LABEL,
  eligibility: ({ setup, bars, i }) => {
    const low = bars[setup.i]?.low, blockers = fin(low) ? [] : [{ code: 'NO_SIGNAL_DAY_LOW', rule: 'MA6-PP-STOP-SIGNAL-DAY-LOW', class: 'DATA_BLOCKED' }];
    return eligibilityResult({ strategy: 'POCKET_PIVOT', bars, i, blockers, openManualDecisions: PP_OPEN_MANUAL_DECISIONS, order: { type: 'ON_OPEN', stop: low, rule: 'MA-MOKA-ENTRY-TIMING; model stop MA6-PP-STOP-SIGNAL-DAY-LOW (not a source rule)' } });
  },
});

/**
 * Trailing of MA6-HG-TRAIL-SWING-LOWS at the close of held bar i (effective from the next session, never the same bar).
 * State: hi = highest high so far (starts at the impulse high of the setup), pb = lowest low since hi was set (starts at
 * the setup's swing low, the pullback that produced the entry). A close above hi confirms pb as the new swing low.
 */
export function hgTrailOnClose(pos, ctx, i, api) {
  const b = ctx.bars[i], st = pos.state, ev = pos.trade.setupEvidence ?? {};
  if (st.hi === undefined) { st.hi = fin(ev.impulseHigh) ? ev.impulseHigh : -Infinity; st.pb = fin(ev.swingLow) ? ev.swingLow : null; }
  if (fin(b.close) && b.close > st.hi && st.pb !== null) api.raiseStop(st.pb, 'MA6_HG_TRAIL_SWING_LOW');
  if (fin(b.high) && b.high > st.hi) { st.hi = b.high; st.pb = null; }
  else if (fin(b.low)) st.pb = st.pb === null ? b.low : Math.min(st.pb, b.low);
}

/** Holy Grail W-RAS97 research variant with the trailing model instead of the new-high exit (one change). */
export const HG_MODEL_TRAIL_ADAPTER = Object.freeze({
  ...HOLY_GRAIL_RESEARCH_ADAPTER,
  version: `${HOLY_GRAIL_RESEARCH_ADAPTER.version}+${SF6_MODEL_VARIANTS_VERSION}`, label: SF6_MODEL_LABEL,
  onClose: hgTrailOnClose,
});

/** Registry: one model variant per lifecycle, run beside its unchanged sf5 reference (SF5 REF = comparison). */
export const SF6_MODEL_VARIANTS = Object.freeze([
  Object.freeze({ key: 'POCKET_PIVOT', id: 'SF6-MODEL-PP-STOP-SIGNAL-DAY-LOW', candidateId: 'C11', assumption: 'MA6-PP-STOP-SIGNAL-DAY-LOW', adapter: PP_MODEL_STOP_ADAPTER, config: PP_REFERENCE_CONFIG, phaseClosed: 'INITIAL_STOP' }),
  Object.freeze({ key: 'HOLY_GRAIL_W_RAS97', id: 'SF6-MODEL-HG-TRAIL-SWING-LOWS', candidateId: 'C13', assumption: 'MA6-HG-TRAIL-SWING-LOWS', adapter: HG_MODEL_TRAIL_ADAPTER, config: HG_REFERENCE_CONFIG, phaseClosed: 'POSITION_MANAGEMENT' }),
]);

export function sf6ModelVariantsSha256() {
  return crypto.createHash('sha256').update(JSON.stringify({ version: SF6_MODEL_VARIANTS_VERSION, assumptions: SF6_MODEL_ASSUMPTIONS, variants: SF6_MODEL_VARIANTS.map((v) => ({ key: v.key, id: v.id, assumption: v.assumption, config: v.config, adapter: v.adapter.version, phaseClosed: v.phaseClosed })) })).digest('hex');
}
