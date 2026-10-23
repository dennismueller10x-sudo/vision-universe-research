/**
 * Supertrader 6.0 – the criteria of the readiness matrix and of the completion states, fixed BEFORE any Supertrader 6.0
 * snapshot result was read (commit history of this file; test sf-sf6-readiness pins the fingerprint). The matrix
 * (completion/build-sf6-readiness.mjs) evaluates them from artifacts and public run receipts only; nothing is set by hand
 * and no performance number enters any criterion.
 *
 * Version 1.1.0 (independent source-fidelity review, before any result): CC-8 needs a never-opened window, CC-1 excludes
 * secondary sources, CC-5 needs DQ-K3 reported as well, TECHNICALLY_INCOMPLETE added.
 * CERTIFICATION_CANDIDATE means "clean, complete and measurable enough for an independent certification decision"; it
 * says nothing about profitability and is never a certification.
 *
 * Completion states (mandate section 32). A strategy gets exactly one PRIMARY state, decided in this order:
 *  0. TECHNICALLY_INCOMPLETE  an IMPLEMENTATION_GAP remains or a lifecycle phase is missing for a reason that is neither
 *                         the source nor the data;
 *  1. SOURCE_BLOCKED      an essential lifecycle phase of the reference is SOURCE_BLOCKED (no source mechanics) and no
 *                         owner decision accepts a secondary source for it;
 *  2. DATA_BLOCKED        the reference cannot run: its entry or stop needs data that is not available (no lifecycle);
 *  3. VALIDATION_BLOCKED  a lifecycle exists, but the historical validation is not robust: a model study with an
 *                         intraday sample that is not representative, or a hypothetical execution that cannot be traded
 *                         historically (short borrow);
 *  4. RESEARCH_COMPLETE_WITH_EXCEPTIONS  every operational phase runs (9/9, model assumptions declared) and validation
 *                         evidence exists, but manual source decisions, data exceptions or source gaps remain;
 *  5. CERTIFICATION_CANDIDATE  every hard criterion below passes (none is waived);
 * plus the independent flags TECHNICALLY_COMPLETE (every documented and implementable component runs; no
 * IMPLEMENTATION_GAP) and LIVE_NOT_APPROVED (always).
 */
import crypto from 'node:crypto';

export const SF6_READINESS_VERSION = 'sf6-readiness-criteria-1.1.0';

export const COMPLETION_STATES = Object.freeze(['TECHNICALLY_INCOMPLETE', 'SOURCE_BLOCKED', 'DATA_BLOCKED', 'VALIDATION_BLOCKED', 'RESEARCH_COMPLETE_WITH_EXCEPTIONS', 'CERTIFICATION_CANDIDATE']);

/** The 15 dimensions of mandate section 31 and the grade vocabulary (PASS needs evidence; nothing unproven passes). */
export const DIMENSIONS = Object.freeze([
  'SOURCE_FIDELITY', 'SETUP_COMPLETENESS', 'ENTRY_COMPLETENESS', 'STOP_COMPLETENESS', 'POSITION_MANAGEMENT', 'EXIT_COMPLETENESS',
  'PORTFOLIO_ACCOUNTING', 'PIT_DATA_INTEGRITY', 'CORPORATE_ACTION_INTEGRITY', 'EXECUTION_REALISM', 'BACKTEST_REPRODUCIBILITY',
  'OUT_OF_SAMPLE_EVIDENCE', 'MANUAL_REVIEW_REQUIREMENTS', 'CERTIFICATION_READINESS', 'LIVE_READINESS',
]);
export const GRADES = Object.freeze(['PASS', 'PASS_WITH_DECLARED_LIMITS', 'MODEL_ASSUMPTION', 'PARTIAL', 'BLOCKED', 'NOT_EVIDENCED', 'NOT_APPLICABLE']);

/**
 * Hard criteria of CERTIFICATION_CANDIDATE. Each is evaluated per strategy from artifacts; all must hold.
 * The thresholds are fixed here and are not tuned on any result.
 */
export const CERTIFICATION_CRITERIA = Object.freeze([
  Object.freeze({ id: 'CC-1-SOURCE', test: 'no essential rule of the reference lifecycle is SOURCE_BLOCKED or SOURCE_AMBIGUOUS, no reference rule rests on a secondary source only, and the source wording of the reference rules is available (not translation-only)' }),
  Object.freeze({ id: 'CC-2-LIFECYCLE', test: 'all nine operational phases run in the reference (no phase missing; a phase closed only by an SF6 model variant does not count)' }),
  Object.freeze({ id: 'CC-3-NO-MANUAL', test: 'no essential manual source decision is substituted by a model assumption in the reference (manual review requirement = none)' }),
  Object.freeze({ id: 'CC-4-DATA', test: 'no essential rule of the reference is DATA_BLOCKED (proxies do not unblock)' }),
  Object.freeze({ id: 'CC-5-CORPORATE-ACTIONS', test: 'V4-D1 containment: under DQ-K5 at most 1 % of the reference trades are directly exposed to a flagged session, and the DQ-K3 sensitivity is reported (undeclared 2:1 splits stay invisible to both: the dimension can never be better than PASS_WITH_DECLARED_LIMITS)', threshold: 0.01 }),
  Object.freeze({ id: 'CC-6-REPRODUCIBLE', test: 'the reference ran on the frozen snapshot with research-v1, reconciled, deterministic, current code' }),
  Object.freeze({ id: 'CC-7-EXECUTION', test: 'entry and stop are executable point in time on the data used (no fill at a price unknown at the decision; no hypothetical short without borrow data); cost sensitivity measured' }),
  Object.freeze({ id: 'CC-8-OOS', test: 'out-of-sample evidence on a window that was NEVER opened before the reference was fixed. A previously opened window (e.g. 2008-2015, opened once in R14) FAILS this criterion; it can at most earn PASS_WITH_DECLARED_LIMITS in the OUT_OF_SAMPLE_EVIDENCE dimension' }),
]);

/** CC-5 threshold and the k of the primary containment. */
export const CC5 = Object.freeze({ policy: 'DQ-K5', maxDirectlyExposedShare: 0.01 });

export function sf6ReadinessCriteriaSha256() {
  return crypto.createHash('sha256').update(JSON.stringify({ version: SF6_READINESS_VERSION, states: COMPLETION_STATES, dimensions: DIMENSIONS, grades: GRADES, criteria: CERTIFICATION_CRITERIA, cc5: CC5 })).digest('hex');
}
