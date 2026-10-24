/**
 * Supertrader 6.0 – the criteria of the readiness matrix and of the completion states, fixed BEFORE any Supertrader 6.0
 * snapshot result was read (commit history of this file; test sf-sf6-readiness pins the fingerprint). The matrix
 * (completion/build-sf6-readiness.mjs) evaluates them from artifacts and public run receipts only; nothing is set by hand
 * and no performance number enters any criterion.
 *
 * Version 1.1.0 (independent source-fidelity review, before any result): CC-8 needs a never-opened window, CC-1 excludes
 * secondary sources, CC-5 needs DQ-K3 reported as well, TECHNICALLY_INCOMPLETE added.
 * Version 1.2.0 (owner decisions E1-E6 of 2026-10-24, after the results; every change makes a criterion STRICTER):
 *   CC-5 needs V4-D1 RESOLVED by verified corporate-action evidence: the quarantine (DQ-K5 / DQ-K3) is a diagnostic
 *   containment and never satisfies CC-5 (E1); CC-8 needs evidence from the prospective paper protocol SF6-PAPER-2027
 *   (window from 2027-01-01), no historical window qualifies (E2); model variants and SIC proxies never count (E3, E4).
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

export const SF6_READINESS_VERSION = 'sf6-readiness-criteria-1.2.0';

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
  Object.freeze({ id: 'CC-4-DATA', test: 'no essential rule of the reference is DATA_BLOCKED (proxies do not unblock; the SIC-based Turtle correlation groups stay a research proxy, E4)' }),
  Object.freeze({ id: 'CC-5-CORPORATE-ACTIONS', test: 'V4-D1 RESOLVED for the reference: every flagged session behind a reference trade verified by corporate-action evidence (CONFIRMED_UNDECLARED_SPLIT corrected in a versioned data PR, or CONFIRMED_GENUINE_MOVE) and the reference recomputed. The DQ-K5 / DQ-K3 quarantine is a diagnostic containment only and never satisfies this criterion (owner decision E1, 2026-10-24)' }),
  Object.freeze({ id: 'CC-6-REPRODUCIBLE', test: 'the reference ran on the frozen snapshot with research-v1, reconciled, deterministic, current code' }),
  Object.freeze({ id: 'CC-7-EXECUTION', test: 'entry and stop are executable point in time on the data used (no fill at a price unknown at the decision; no hypothetical short without borrow data); cost sensitivity measured' }),
  Object.freeze({ id: 'CC-8-OOS', test: 'out-of-sample evidence from the prospective paper validation protocol SF6-PAPER-2027 (window from 2027-01-01, fixed before it opens; owner decision E2). No historical window qualifies: 2008-2015 (opened once in R14, survivorship-limited) and 2016-2026 (development data) FAIL this criterion and can at most earn PASS_WITH_DECLARED_LIMITS in the OUT_OF_SAMPLE_EVIDENCE dimension' }),
]);

/** The containment that is REPORTED in the corporate-action dimension (never a pass of CC-5, E1). */
export const CC5 = Object.freeze({ policy: 'DQ-K5', reportedExposureBound: 0.01, satisfiesCriterion: false });

/** Owner decisions of 2026-10-24 on the six open questions of the Supertrader 6.0 report. */
export const SF6_OWNER_DECISIONS = Object.freeze([
  Object.freeze({ id: 'E1', decision: 'V4-D1 stays a genuine data-integrity blocker; no quarantine reading is a final solution or a certification exception; existing Tiingo / Marketstack corporate-action data and verifiable public filings may be checked in a targeted way, without new costs and without bulk requests' }),
  Object.freeze({ id: 'E2', decision: 'a versioned prospective paper validation protocol from 2027-01-01 (SF6-PAPER-2027); no historical data are called an untouched holdout; no permanent scheduler, no live trading' }),
  Object.freeze({ id: 'E3', decision: 'the Pocket Pivot stop and the Holy Grail trailing stay explicit research variants, never original rules; no automatic upgrade of measurement classes' }),
  Object.freeze({ id: 'E4', decision: 'SIC-based Turtle correlation groups stay research proxies; no certification on their basis' }),
  Object.freeze({ id: 'E5', decision: 'no additional EP / PS intraday requests; only a prioritised plan for better stratified coverage within the existing budget' }),
  Object.freeze({ id: 'E6', decision: 'evaluation by metrics and distributions, not by the identity of single trades; numerical reproducibility, trade stability and robustness are reported separately and the sensitivity of the portfolio studies stays visible' }),
]);

export function sf6ReadinessCriteriaSha256() {
  return crypto.createHash('sha256').update(JSON.stringify({ version: SF6_READINESS_VERSION, states: COMPLETION_STATES, dimensions: DIMENSIONS, grades: GRADES, criteria: CERTIFICATION_CRITERIA, cc5: CC5, ownerDecisions: SF6_OWNER_DECISIONS })).digest('hex');
}
