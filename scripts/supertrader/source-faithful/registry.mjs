/**
 * Source-faithful strategy registry: exactly the 13 #709 candidates (C01-C13), one contract each. CAN SLIM and the
 * Weinstein short side are documented as non-candidates; no candidate is added to reach a count.
 *
 * Every status in an entry is derived from its contract (contract.mjs). The registry never marks a method tradable:
 * no live signal, no order, no portfolio change (mandate section 17). `fullyAutomatable` is true only for a method
 * whose essential rules are all implemented without a manual or blocked rule.
 */
import { TURTLE_S1, TURTLE_S2 } from './contracts/turtle.mjs';
import { DARVAS } from './contracts/darvas.mjs';
import { WEINSTEIN_INVESTOR, WEINSTEIN_TRADER } from './contracts/weinstein.mjs';
import { MINERVINI_SEPA, MINERVINI_POWER_PLAY } from './contracts/minervini.mjs';
import { KK_BREAKOUT, KK_EPISODIC_PIVOT, KK_PARABOLIC_SHORT } from './contracts/kullamagi.mjs';
import { POCKET_PIVOT, BUYABLE_GAP_UP } from './contracts/morales-kacher.mjs';
import { HOLY_GRAIL } from './contracts/holy-grail.mjs';
import { METHOD_CONTEXTS, NON_CANDIDATE_CONTEXTS } from './evidence/psr709-extract.mjs';
import { deriveImplementationStatus, sourceCoverage, validateContract, contractFingerprint, OUTPUT_KIND, FOUNDATION } from './contract.mjs';

export const REGISTRY_SCHEMA = 'supertrader-sf-registry-1.0.0';
export const CONTRACTS = Object.freeze([TURTLE_S1, TURTLE_S2, DARVAS, WEINSTEIN_INVESTOR, WEINSTEIN_TRADER, MINERVINI_SEPA, MINERVINI_POWER_PLAY, KK_BREAKOUT, KK_EPISODIC_PIVOT, KK_PARABOLIC_SHORT, POCKET_PIVOT, BUYABLE_GAP_UP, HOLY_GRAIL]);

export const NON_CANDIDATES = Object.freeze([
  { id: 'ONEIL_CAN_SLIM', status: 'NOT_A_709_CANDIDATE', reason: '#709 has no CAN SLIM candidate: B04 (O\'Neil 2009) is BOOK_PARTIAL, chapters 3-20 missing (GAP-B04); later IBD / MarketSmith sources close topic gaps, not the original wording. #712 rated it SOURCE_BLOCKED. Not implemented and not counted among the 13.', contexts: NON_CANDIDATE_CONTEXTS.ONEIL_CAN_SLIM.contexts },
  { id: 'WEINSTEIN_SHORT', status: 'NOT_A_709_CANDIDATE', reason: 'Weinstein Stage 4 short side is a separate #709 context without a candidate row; documented, not implemented.', contexts: NON_CANDIDATE_CONTEXTS.WEINSTEIN_SHORT.contexts },
]);

const ENTRY_KINDS = new Set(['ENTRY']);
const isImpl = (r) => r.status === 'SOURCE_EXACT' || r.status === 'SOURCE_DERIVED';
const essential = (c) => c.rules.filter((r) => r.essential !== false && ['ENTRY', 'EXIT', 'STOP', 'SIZING', 'SETUP', 'FILTER', 'PYRAMIDING', 'PORTFOLIO'].includes(r.kind));

/** Readiness from the rule statuses (never set by hand). */
export function readinessOf(contract) {
  const ess = essential(contract), blocked = ess.filter((r) => r.status === 'DATA_BLOCKED');
  const entries = ess.filter((r) => ENTRY_KINDS.has(r.kind));
  const anyImpl = contract.rules.some(isImpl);
  const dataReadiness = !anyImpl && !contract.implemented ? 'NOT_ASSESSED' : blocked.length === 0 ? 'READY' : entries.length && entries.every((r) => r.status === 'DATA_BLOCKED') ? 'BLOCKED' : 'PARTIAL';
  let executionReadiness = 'NOT_IMPLEMENTED';
  if (contract.implemented && anyImpl) {
    if (contract.outputKind === OUTPUT_KIND.RESEARCH_SIGNAL) executionReadiness = ess.filter((r) => ['ENTRY', 'EXIT', 'STOP'].includes(r.kind) && (!r.scopes || r.scopes.includes('EQUITY_ADAPTATION'))).every((r) => isImpl(r) || r.status === 'SOURCE_AMBIGUOUS') ? 'RESEARCH_EXECUTABLE' : 'PARTIAL';
    else executionReadiness = entries.length && entries.every((r) => r.status === 'DATA_BLOCKED') ? 'COMPONENTS_ONLY_DATA_BLOCKED' : 'MANUAL_REVIEW_SCREEN';
  }
  let backtestReadiness = 'NOT_READY';
  if (executionReadiness === 'RESEARCH_EXECUTABLE') backtestReadiness = 'DIAGNOSTIC_READY';
  else if (contract.implemented && contract.componentBacktest) backtestReadiness = 'COMPONENT_SIGNAL_STUDY_ONLY';
  return { dataReadiness, executionReadiness, backtestReadiness, dataBlockedEssentialRules: blocked.map((r) => r.id) };
}

export function registryEntry(contract, extract) {
  const ctx = METHOD_CONTEXTS[contract.strategyId];
  if (!ctx || ctx.candidate !== contract.candidateId) throw new Error(`REGISTRY_CONTEXT_MISMATCH:${contract.strategyId}`);
  const validation = validateContract(contract, extract);
  const coverage = sourceCoverage(contract, extract, ctx.contexts);
  const status = deriveImplementationStatus(contract);
  const scoped = contract.rules.some((r) => r.scopes) ? { EQUITY_ADAPTATION: deriveImplementationStatus(contract, { scope: 'EQUITY_ADAPTATION' }), ORIGINAL: deriveImplementationStatus(contract, { scope: 'ORIGINAL' }) } : null;
  const ess = essential(contract);
  const fullyAutomatable = contract.implemented && contract.outputKind === OUTPUT_KIND.RESEARCH_SIGNAL && ess.every(isImpl);
  const cand = extract.candidates.find((c) => c.candidate_id === contract.candidateId);
  return {
    strategyId: contract.strategyId,
    candidateId: contract.candidateId,
    rank709: cand?.rank ?? null,
    trader: contract.trader,
    method: contract.method,
    sources: contract.sources,
    sourceContractVersion: contract.sourceContractVersion,
    contractFingerprint: contractFingerprint(contract),
    implementationStatus: status,
    statusByScope: scoped,
    outputKind: contract.outputKind,
    tradable: false,
    liveActivation: false,
    fullyAutomatable,
    sourceCoverage: { rulesInScope: coverage.rulesInScope, hardRules: coverage.hardRules, hardRulesImplemented: coverage.hardRulesImplemented, implementedExact: coverage.implementedExact, implementedDerived: coverage.implementedDerived, manualReview: coverage.manualReview, dataBlocked: coverage.dataBlocked, ambiguous: coverage.ambiguous, notImplemented: coverage.notImplemented, excluded: coverage.unmappedWithExclusion, unmapped: coverage.unmappedWithoutExclusion },
    ...readinessOf(contract),
    manualReviewRequirements: contract.manualReviewFlags.map((f) => ({ id: f.id, psr709: f.psr709, question: f.question, blocksAutomation: f.blocksAutomation })),
    knownLimitations: contract.knownLimitations,
    certification: FOUNDATION.certification,
    contractValidation: { ok: validation.ok, errors: validation.errors, warnings: validation.warnings },
    plannedIn: contract.implemented ? null : contract.plannedIn,
  };
}

export function buildRegistry(extract) {
  if (CONTRACTS.length !== 13) throw new Error('REGISTRY_MUST_HOLD_13');
  const ids = CONTRACTS.map((c) => c.candidateId).sort();
  const expected = extract.candidates.map((c) => c.candidate_id).sort();
  if (JSON.stringify(ids) !== JSON.stringify(expected)) throw new Error('REGISTRY_CANDIDATES_DIFFER_FROM_709');
  return { schema: REGISTRY_SCHEMA, sourceEvidence: { pullRequest: 709, commit: extract.pin.commit, manifestSha256: extract.pin.manifestSha256 }, foundation: FOUNDATION, entries: CONTRACTS.map((c) => registryEntry(c, extract)), nonCandidates: NON_CANDIDATES };
}
