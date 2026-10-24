/**
 * Supertrader 7.0 – execution revision variant of the Kullamaegi Episodic Pivot chart study (research/kk-ep-lifecycle.mjs).
 * Docs: docs/SUPERTRADER_7_EXECUTION_AND_STRATEGIES.md (defect SF7-D5, tests sf-sf7-execution).
 *
 * Defect SF7-D5: under ALT-FILL-MINUTE-OPTIMISTIC the fill minute's own low at or below the stop is ignored. That is
 * right only while the low may precede the fill. It cannot when the fill is the minute's open (open >= level: every
 * later price of the minute comes after the fill) or when the minute closes at or below the stop (the close is the last
 * print of the minute, after the fill). Then the same-day stop is CERTAIN.
 * Correction EX7-EP-FILL-MINUTE-CERTAIN: execution-logic correction, no new number, no source rule. Not applied to any
 * reference: REF is PESSIMISTIC (the fill-minute low is already a stop there), the EP registry (epVariantRegistrySha256)
 * and every sf5 / sf6 pin are untouched. It runs only as the variant below (wrapper adapter with the resolveEpDay flag
 * fillMinuteRule) beside the unchanged ALT-FILL-MINUTE-OPTIMISTIC, on the reference day set CLEAN, cache only (E5).
 * Pinned before any snapshot result (test SF7-D5-EP-VARIANT).
 */
import crypto from 'node:crypto';
import { makeEpAdapter, EP_RUN_VARIANTS } from './kk-ep-lifecycle.mjs';

export const SF7_EP_EXECUTION_VERSION = 'sf7-ep-execution-variants-1.0.0';
export const SF7_EP_REVISION = Object.freeze({ id: 'EX7-EP-FILL-MINUTE-CERTAIN', defect: 'SF7-D5', kind: 'EXECUTION_LOGIC_CORRECTION', class: 'MODEL_ASSUMPTION_CORRECTION_NOT_A_SOURCE_RULE', rule: 'OPTIMISTIC fill-minute reading: a fill-minute low <= stop is a same-day stop at the stop when the fill is the minute open (open >= level) or the minute closes at / below the stop; otherwise the later minutes decide as before', why: 'every print after the minute open, and the minute close, come after a fill at the open / inside the minute; IEX prints only (the consolidated tape of the minute is not available), so the rule can only miss certain stops, never invent one', appliesTo: 'SF7 EP variant only; REF (PESSIMISTIC) unchanged' });
export const SF7_EP_ADAPTER = makeEpAdapter({ fillMinuteRule: true, versionSuffix: `+${SF7_EP_EXECUTION_VERSION}` });
const base = EP_RUN_VARIANTS.find((v) => v.id === 'ALT-FILL-MINUTE-OPTIMISTIC');
export const SF7_EP_VARIANTS = Object.freeze([Object.freeze({ id: 'SF7-ALT-FILL-MINUTE-OPTIMISTIC-CERTAIN-RULE', compareTo: base.id, revision: SF7_EP_REVISION.id, daySet: 'CLEAN', adapter: SF7_EP_ADAPTER, config: base.config })]);

export function sf7EpExecutionVariantsSha256() {
  return crypto.createHash('sha256').update(JSON.stringify({ version: SF7_EP_EXECUTION_VERSION, revision: SF7_EP_REVISION, variants: SF7_EP_VARIANTS.map((v) => ({ id: v.id, compareTo: v.compareTo, revision: v.revision, daySet: v.daySet, adapter: v.adapter.version, config: v.config })) })).digest('hex');
}
