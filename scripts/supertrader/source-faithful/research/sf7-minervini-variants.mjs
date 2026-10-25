/**
 * Supertrader 7.0 – execution revision variants of the Minervini lifecycle (research/minervini-execution.mjs).
 * Docs: docs/SUPERTRADER_7_OPTIMISTIC_FIXES.md (defect SF7-D4, owner decision E7-3, 2026-10-25).
 *
 * Defect SF7-D4: lifecycle#fillBuyOrder calls a same-bar stop after an INTRADAY_PIVOT_TOUCH fill AMBIGUOUS whatever the
 * close, and the pre-registered ALT-INTRABAR-OPTIMISTIC ignores it. With the close at or below the stop the price was at
 * the fill (above the stop) and ended the bar at or below the stop, so it crossed the stop after the fill: the stop is
 * CERTAIN. Example: pivot 10.5, stop 10.0, bar O 10.2 / H 10.8 / L 9.9 / C 9.95 - OPTIMISTIC kept a stopped position.
 * Gap, limit and next-open fills were already CERTAIN (the fill came at or after the open on the way down).
 *
 * Correction EX7-SAME-BAR-CLOSE-CONFIRMS-STOP (the semantics of the SF7-D1 revision of the shared engine, PR #898): an
 * execution-logic correction, not a source rule and not a new model choice. It is NOT applied to any reference or
 * registered variant: lifecycle#RUN_VARIANTS and their registry (f13ea350..., pinned in SF6-PAPER-2027) stay as they
 * are. The correction runs only as declared, versioned variants here: the configuration of the variant they are compared
 * with (compareTo) plus sameBarCloseConfirmsStop = true, which entryEligibility carries onto the order and fillBuyOrder
 * reads (minervini-execution.mjs is unchanged and books the stop as STOP_SAME_BAR_CERTAIN):
 *  - SF7-REF-CLOSE-RULE: the reference configuration (PESSIMISTIC). Expected: identical fills, shares and prices; only
 *    the exit reason of the reclassified exits changes ("assumed" -> "certain");
 *  - SF7-ALT-INTRABAR-OPTIMISTIC-CLOSE-RULE: the corrected optimistic bound. It SUPERSEDES ALT-INTRABAR-OPTIMISTIC, which
 *    is still run unchanged for the before / after comparison and labelled superseded in the artifact.
 * Pinned before any snapshot result (test SF7-D4-MINERVINI-VARIANTS). Sealed metrics never choose a variant (E6).
 */
import crypto from 'node:crypto';
import { RUN_VARIANTS } from './minervini-lifecycle.mjs';

export const SF7_MINERVINI_VERSION = 'sf7-minervini-variants-1.0.0';

export const SF7_MINERVINI_REVISIONS = Object.freeze([
  Object.freeze({ id: 'EX7-SAME-BAR-CLOSE-CONFIRMS-STOP', defect: 'SF7-D4', kind: 'EXECUTION_LOGIC_CORRECTION', class: 'MODEL_ASSUMPTION_CORRECTION_NOT_A_SOURCE_RULE', phase: 'ENTRY_EXECUTION', rule: 'buy stop filled by an intraday pivot touch, low <= stop and close <= stop on the fill bar: the same-bar stop is CERTAIN (exit at the stop), in both intrabar readings', why: 'the close is the last print of the bar; a close at or below the stop after a fill above it means the stop traded after the fill. AMBIGUOUS stays for close > stop', configField: 'sameBarCloseConfirmsStop: true (SF7 variants only; carried on the order as closeConfirmsStop)', appliesTo: 'SF7 variants only; no reference and no registered variant changes' }),
]);

const variant = (id, compareTo, extra = {}) => {
  const base = RUN_VARIANTS.find((v) => v.id === compareTo);
  if (!base) throw new Error(`SF7_MINERVINI_COMPARE_TO_MISSING:${compareTo}`);
  return Object.freeze({ id, compareTo, revision: 'EX7-SAME-BAR-CLOSE-CONFIRMS-STOP', strategies: base.strategies ?? null, config: Object.freeze({ ...base.config, sameBarCloseConfirmsStop: true }), ...extra });
};

export const SF7_MINERVINI_VARIANTS = Object.freeze([
  variant('SF7-REF-CLOSE-RULE', 'REF'),
  variant('SF7-ALT-INTRABAR-OPTIMISTIC-CLOSE-RULE', 'ALT-INTRABAR-OPTIMISTIC', { supersedes: 'ALT-INTRABAR-OPTIMISTIC' }),
]);

/** Registered variants superseded by an SF7 variant (still run, never deleted: before / after evidence). */
export const SF7_MINERVINI_SUPERSEDED = Object.freeze({ 'ALT-INTRABAR-OPTIMISTIC': Object.freeze({ status: 'SUPERSEDED_SF7_D4', supersededBy: 'SF7-ALT-INTRABAR-OPTIMISTIC-CLOSE-RULE', why: 'ignored certain same-bar stops after a pivot touch with the close at or below the stop' }) });

/** sha256 of the ledger without the reason field (fills, shares, prices, fees and trade ids only). */
export function ledgerWithoutReasonsSha256(ledger) {
  return crypto.createHash('sha256').update(JSON.stringify(ledger.map(({ reason, ...row }) => row))).digest('hex'); // eslint-disable-line no-unused-vars
}

export function sf7MinerviniVariantsSha256() {
  return crypto.createHash('sha256').update(JSON.stringify({ version: SF7_MINERVINI_VERSION, revisions: SF7_MINERVINI_REVISIONS, variants: SF7_MINERVINI_VARIANTS.map((v) => ({ id: v.id, compareTo: v.compareTo, revision: v.revision, strategies: v.strategies, config: v.config, supersedes: v.supersedes ?? null })), superseded: SF7_MINERVINI_SUPERSEDED })).digest('hex');
}
