/**
 * Supertrader research-signal contract (mandate section 19): the boundary a later Supertrader signal product would
 * consume. It is NOT wired to any product, page, order path or model portfolio; every signal it can produce says
 * liveActivation false, orderRouting NONE. Pure functions, no I/O.
 *
 * A signal carries at least: strategy id, security id, source contract version, signal timestamp, entry / exit type,
 * stop / risk data, execution eligibility, manual review status, data coverage and - for research signals - the
 * snapshot / accounting provenance.
 */
import { FOUNDATION, OUTPUT_KIND, contractFingerprint } from '../contract.mjs';
import { CONTRACTS } from '../registry.mjs';

export const SIGNAL_SCHEMA = 'supertrader-sf-research-signal-1.0.0';
export const SIGNAL_TYPE = Object.freeze({ ENTRY: 'ENTRY', ADD: 'ADD', EXIT: 'EXIT', STOP_UPDATE: 'STOP_UPDATE', REVIEW_CANDIDATE: 'REVIEW_CANDIDATE' });
export const ELIGIBILITY = Object.freeze({ RESEARCH_ONLY: 'RESEARCH_ONLY', REVIEW_REQUIRED: 'REVIEW_REQUIRED', NOT_EXECUTABLE_DATA_BLOCKED: 'NOT_EXECUTABLE_DATA_BLOCKED' });
export const REVIEW = Object.freeze({ NOT_REQUIRED: 'NOT_REQUIRED', REQUIRED_PENDING: 'REQUIRED_PENDING' });
const REQUIRED = ['schema', 'strategyId', 'securityId', 'sourceContractVersion', 'contractFingerprint', 'signalTimestamp', 'signalType', 'risk', 'executionEligibility', 'manualReviewStatus', 'dataCoverage', 'liveActivation', 'orderRouting'];
/** Every top-level key a signal may carry; anything else (order, broker, tradable ...) is rejected (review SF2-R4-03). */
const ALLOWED_KEYS = new Set([...REQUIRED, 'entry', 'evidence', 'openQuestions', 'provenance', 'buyDeclarationAllowed']);
const own = (E, v) => typeof v === 'string' && Object.hasOwn(E, v); // no prototype keys (review SF2-R4-02)
const isDate = (d) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(d ?? '')) return false; const t = Date.parse(`${d}T00:00:00Z`); return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === d; };

/**
 * Validates one signal. Fails closed on anything that could look like a live instruction.
 * Returns { ok, errors[] }.
 */
export function validateSignal(s) {
  const errors = [];
  if (!s || typeof s !== 'object') return { ok: false, errors: ['NOT_AN_OBJECT'] };
  for (const f of REQUIRED) if (s[f] === undefined || s[f] === null) errors.push(`MISSING:${f}`);
  for (const k of Object.keys(s)) if (!ALLOWED_KEYS.has(k)) errors.push(`UNKNOWN_FIELD:${k}`);
  if (s.schema !== SIGNAL_SCHEMA) errors.push('SCHEMA');
  if (!own(SIGNAL_TYPE, s.signalType)) errors.push('SIGNAL_TYPE');
  if (!own(ELIGIBILITY, s.executionEligibility?.status)) errors.push('ELIGIBILITY');
  if (!own(REVIEW, s.manualReviewStatus)) errors.push('REVIEW_STATUS');
  if (s.liveActivation !== false) errors.push('LIVE_ACTIVATION_FORBIDDEN');
  if (s.orderRouting !== 'NONE') errors.push('ORDER_ROUTING_FORBIDDEN');
  if (!isDate(s.signalTimestamp?.date)) errors.push('SIGNAL_DATE');
  if (!s.signalTimestamp?.phase) errors.push('SIGNAL_PHASE');
  // the strategy must be a registered contract with the stated version and fingerprint (review SF2-R4-03)
  const c = CONTRACTS.find((x) => x.strategyId === s.strategyId);
  if (!c) errors.push('UNKNOWN_STRATEGY');
  else {
    if (s.sourceContractVersion !== c.sourceContractVersion) errors.push('CONTRACT_VERSION');
    if (s.contractFingerprint !== contractFingerprint(c)) errors.push('CONTRACT_FINGERPRINT');
    // only a fully mechanical research method may emit a mechanical (RESEARCH_ONLY) signal (review SF2-R4-01)
    if (s.executionEligibility?.status === ELIGIBILITY.RESEARCH_ONLY && c.outputKind !== OUTPUT_KIND.RESEARCH_SIGNAL) errors.push('MECHANICAL_SIGNAL_FROM_REVIEW_METHOD');
    if (c.outputKind !== OUTPUT_KIND.RESEARCH_SIGNAL && s.signalType !== SIGNAL_TYPE.REVIEW_CANDIDATE) errors.push('REVIEW_METHOD_MUST_EMIT_REVIEW_CANDIDATES');
  }
  if (s.manualReviewStatus === REVIEW.REQUIRED_PENDING && s.executionEligibility?.status === ELIGIBILITY.RESEARCH_ONLY) errors.push('REVIEW_PENDING_BUT_MECHANICAL');
  if (s.signalType === SIGNAL_TYPE.REVIEW_CANDIDATE && s.manualReviewStatus !== REVIEW.REQUIRED_PENDING) errors.push('REVIEW_CANDIDATE_WITHOUT_REVIEW');
  if (s.signalType === SIGNAL_TYPE.REVIEW_CANDIDATE && s.executionEligibility?.status === ELIGIBILITY.RESEARCH_ONLY) errors.push('REVIEW_CANDIDATE_AS_MECHANICAL');
  if (s.buyDeclarationAllowed !== undefined && s.buyDeclarationAllowed !== false) errors.push('BUY_DECLARATION_FORBIDDEN');
  if ((s.signalType === SIGNAL_TYPE.ENTRY || s.signalType === SIGNAL_TYPE.ADD) && !Number.isFinite(s.risk?.stop)) errors.push('ENTRY_WITHOUT_STOP');
  if (s.executionEligibility?.status === ELIGIBILITY.RESEARCH_ONLY) {
    const p = s.provenance;
    if (!p || p.snapshotId !== FOUNDATION.snapshotId || p.accounting !== FOUNDATION.accounting.mode) errors.push('RESEARCH_SIGNAL_WITHOUT_SNAPSHOT_PROVENANCE');
  }
  if (!Array.isArray(s.dataCoverage?.missing)) errors.push('DATA_COVERAGE');
  return { ok: errors.length === 0, errors };
}

const base = (contract, securityId, date, phase, signalType) => ({
  schema: SIGNAL_SCHEMA, strategyId: contract.strategyId, securityId, sourceContractVersion: contract.sourceContractVersion, contractFingerprint: contractFingerprint(contract),
  signalTimestamp: { date, phase }, signalType, liveActivation: false, orderRouting: 'NONE',
});
// rules of the declared research scope only: an ORIGINAL-only rule (e.g. the futures short side) does not block an
// equity signal (review SF2-R4-15)
const inDeclaredScope = (contract, r) => !r.scopes || !contract.rules.some((x) => x.scopes) || r.scopes.includes('EQUITY_ADAPTATION');
const missingData = (contract) => [...contract.rules.filter((r) => r.status === 'DATA_BLOCKED' && inDeclaredScope(contract, r)).map((r) => r.id), ...(contract.dataPartial || []).map((p) => p.split(':')[0])];

/**
 * A mechanical research signal of a RESEARCH_SIGNAL method (e.g. a Turtle entry from runTurtle().signals plus the
 * unit stop): research only, bound to the snapshot and research-v1.
 * fill: { securityId, date, path, trigger, fill, stop, unitShares?, n? }; provenance: { runId?, codeVersion }.
 */
export function researchSignal(contract, fill, { signalType = SIGNAL_TYPE.ENTRY, provenance = {} } = {}) {
  return {
    ...base(contract, fill.securityId, fill.date, 'INTRADAY_STOP_ORDER_RESTING_FROM_PRIOR_CLOSE', signalType),
    entry: { path: fill.path, trigger: fill.trigger, fill: fill.fill },
    risk: { stop: fill.stop, riskPerShare: Number.isFinite(fill.fill) && Number.isFinite(fill.stop) ? fill.fill - fill.stop : null, unitShares: fill.unitShares ?? null, n: fill.n ?? null },
    executionEligibility: { status: ELIGIBILITY.RESEARCH_ONLY, reason: 'research backtest on the frozen snapshot; no live execution exists' },
    manualReviewStatus: REVIEW.NOT_REQUIRED,
    dataCoverage: { required: contract.requiredData, missing: missingData(contract) },
    provenance: { snapshotId: FOUNDATION.snapshotId, accounting: FOUNDATION.accounting.mode, certification: FOUNDATION.certification, ...provenance },
  };
}

/**
 * A review candidate from a screen record (MANUAL_REVIEW_REQUIRED): never mechanical, never a buy. The stop / risk
 * data are the machine proposals the record carries (null when the source leaves them to the reviewer).
 */
export function reviewCandidateSignal(contract, record, { stopProposal = null } = {}) {
  const blockedEntry = contract.rules.some((r) => r.kind === 'ENTRY' && r.essential !== false && r.status === 'DATA_BLOCKED' && inDeclaredScope(contract, r));
  return {
    ...base(contract, record.securityId, record.asOf, 'AFTER_CLOSE_REVIEW', SIGNAL_TYPE.REVIEW_CANDIDATE),
    evidence: (record.machineScreenEvidence || []).map((e) => ({ ruleId: e.ruleId, psr709: e.psr709 })),
    risk: { stop: stopProposal, stopSource: stopProposal === null ? 'REVIEWER' : 'MACHINE_PROPOSAL_REVIEWER_DECIDES' },
    executionEligibility: { status: blockedEntry ? ELIGIBILITY.NOT_EXECUTABLE_DATA_BLOCKED : ELIGIBILITY.REVIEW_REQUIRED, reason: contract.timing.earliestExecutable },
    manualReviewStatus: REVIEW.REQUIRED_PENDING,
    openQuestions: (record.openQuestions || []).map((q) => q.flag),
    dataCoverage: { required: contract.requiredData, missing: [...new Set([...missingData(contract), ...(record.dataNotAvailableToMachine || [])])] },
    provenance: { snapshotId: null, accounting: null, note: 'review candidates carry no research provenance until a reviewer decision is logged forward' },
    buyDeclarationAllowed: false,
  };
}
