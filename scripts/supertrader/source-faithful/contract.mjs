/**
 * Source-faithful Supertrader strategies: the common research and execution contract.
 *
 * Every one of the 13 #709 candidates (C01-C13) has exactly one contract (contracts/*.mjs). A contract states, per
 * rule, which #709 rule ids it implements, how faithfully (RULE_STATUS), in which code and with which tests. The
 * implementation status of the whole method is DERIVED from the rule statuses (deriveImplementationStatus); it is
 * never set by hand, so a method cannot be declared complete while an essential rule is missing.
 *
 * Rule status (per executable rule):
 *  SOURCE_EXACT            the #709 rule is HARD, HIGH confidence, original wording checked, clearance
 *                          SCOPE_AND_EXCEPTIONS_REQUIRED, and the code executes it without an added number.
 *  SOURCE_DERIVED          a declared technical derivation of a #709 rule (e.g. equity translation of a futures rule,
 *                          a daily-bar reading of an intraday rule, or a HARD rule whose wording is translation-only).
 *                          `derivation` must say what was derived and why.
 *  MANUAL_REVIEW_REQUIRED  the decision stays with a reviewer; the machine only reports evidence.
 *  DATA_BLOCKED            the rule needs data that the frozen research snapshot does not contain.
 *  SOURCE_AMBIGUOUS        #709 records an unresolved conflict or gap; both readings are kept or none is chosen.
 *  NOT_IMPLEMENTED         not (yet) implemented; `reason` is mandatory.
 *
 * Method implementation status (derived):
 *  IMPLEMENTED_SOURCE_EXACT, IMPLEMENTED_SOURCE_DERIVED, PARTIAL_MANUAL_REVIEW, PARTIAL_DATA_BLOCKED,
 *  SOURCE_UNRESOLVED, NOT_IMPLEMENTED.
 *
 * No function in this file reads market data or results. It is pure and deterministic.
 */
import crypto from 'node:crypto';

export const CONTRACT_SCHEMA = 'supertrader-sf-strategy-contract-1.0.0';
export const CONTRACT_FRAMEWORK_VERSION = '1.0.0';

export const RULE_STATUS = Object.freeze({
  SOURCE_EXACT: 'SOURCE_EXACT',
  SOURCE_DERIVED: 'SOURCE_DERIVED',
  MANUAL_REVIEW_REQUIRED: 'MANUAL_REVIEW_REQUIRED',
  DATA_BLOCKED: 'DATA_BLOCKED',
  SOURCE_AMBIGUOUS: 'SOURCE_AMBIGUOUS',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
});
export const IMPLEMENTATION_STATUS = Object.freeze({
  IMPLEMENTED_SOURCE_EXACT: 'IMPLEMENTED_SOURCE_EXACT',
  IMPLEMENTED_SOURCE_DERIVED: 'IMPLEMENTED_SOURCE_DERIVED',
  PARTIAL_MANUAL_REVIEW: 'PARTIAL_MANUAL_REVIEW',
  PARTIAL_DATA_BLOCKED: 'PARTIAL_DATA_BLOCKED',
  SOURCE_UNRESOLVED: 'SOURCE_UNRESOLVED',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
});
/** What a machine output of a method may be. No source-faithful method emits a live BUY. */
export const OUTPUT_KIND = Object.freeze({
  RESEARCH_SIGNAL: 'RESEARCH_SIGNAL',           // fully mechanical method, research backtest only
  MANUAL_REVIEW_CANDIDATE: 'MANUAL_REVIEW_CANDIDATE', // machine screen; status MANUAL_REVIEW_REQUIRED, buyDeclarationAllowed=false
  NONE: 'NONE',
});
export const READINESS = Object.freeze({
  READY: 'READY',
  PARTIAL: 'PARTIAL',
  BLOCKED: 'BLOCKED',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
});

/** Foundation bindings every contract inherits (PR #779 / #781). */
export const FOUNDATION = Object.freeze({
  snapshotId: 'sts1-134d4d62eb88b6ff8d98fe6e56b12a6d',
  snapshotContract: 'supertrader-research-snapshot-1.0.0',
  accounting: Object.freeze({ cli: '--accounting research-v1', mode: 'RESEARCH_V1', module: 'scripts/supertrader/validation/accounting-contract.mjs', id: 'SUPERTRADER_RESEARCH_ACCOUNTING', version: '1.0.0' }),
  securityIdentity: Object.freeze({ scheme: 'core/identity.js#securityIdForTicker (ADR-001)', listing: 'snapshot identity listingId tiingo:<EX>:<TICKER>:<start>' }),
  priceTruth: Object.freeze({ splitFactors: 'quant/engines/return-series.js#splitFactors (ADR-002) via validation/lib.mjs#adjustSeries', corporateActions: 'snapshot convention hash (adjustSeries, splitSegments, MAX_GAP_DAYS); no new corporate-action protocol' }),
  certification: 'DIAGNOSTIC_NOT_CERTIFIED',
});

/**
 * The only allowed exemptions from "a #709 preference is never a machine gate". Each names the #709 candidate row whose
 * assessment makes the rule the core of the method (review SF-R2-02: no free-text escape hatch).
 */
export const GATE_EXEMPTIONS = Object.freeze({
  SETUP_DEFINITION_C13: Object.freeze({ candidate: 'C13', ruleIds: Object.freeze(['RAS04-001']), citation: '#709 C13 assessment: "20EMA/ADX14>30 core"' }),
});

export const REQUIRED_CONTRACT_FIELDS = Object.freeze([
  'strategyId', 'candidateId', 'sourceContractVersion', 'trader', 'method', 'scope', 'sources', 'outputKind',
  'securityIdentity', 'timing', 'entryConditions', 'exitConditions', 'stops', 'positionSizing',
  'corporateActionPolicy', 'requiredData', 'missingDataBehavior', 'manualReviewFlags', 'accountingContract',
  'snapshot', 'reproducibilityReceipt', 'rules', 'knownLimitations',
]);
const RULE_FIELDS = ['id', 'psr709', 'status', 'rule'];
const ESSENTIAL_KINDS = new Set(['ENTRY', 'EXIT', 'STOP', 'SIZING', 'SETUP', 'FILTER', 'PYRAMIDING', 'PORTFOLIO']);

/**
 * Validates one contract against the #709 extract. Returns { ok, errors[], warnings[] }; never throws.
 *  - every #709 id exists in the extract;
 *  - SOURCE_EXACT only on #709 rules that are HARD, HIGH, original wording checked and SCOPE_AND_EXCEPTIONS_REQUIRED;
 *  - a DO_NOT_HARDEN_PREFERENCE rule is never SOURCE_EXACT or SOURCE_DERIVED as a machine gate (gate: true);
 *  - a REQUIRES_ORIGINAL_OR_EXPLICIT_WEB_CORROBORATION rule is never SOURCE_EXACT;
 *  - SOURCE_DERIVED needs `derivation`; NOT_IMPLEMENTED / DATA_BLOCKED / SOURCE_AMBIGUOUS need `reason`;
 *  - implemented rules (EXACT/DERIVED) name their code and at least one test;
 *  - every #709 evidence rule of the candidate is covered by a contract rule.
 */
export function validateContract(contract, extract) {
  const errors = [], warnings = [];
  const R = new Map(extract.rules.map((r) => [r.rule_id, r]));
  for (const f of REQUIRED_CONTRACT_FIELDS) if (contract[f] === undefined) errors.push(`MISSING_FIELD:${f}`);
  const cand = extract.candidates.find((c) => c.candidate_id === contract.candidateId);
  if (!cand) errors.push(`UNKNOWN_CANDIDATE:${contract.candidateId}`);
  const ids = new Set();
  for (const r of contract.rules || []) {
    for (const f of RULE_FIELDS) if (r[f] === undefined) errors.push(`RULE_FIELD:${r.id}:${f}`);
    if (ids.has(r.id)) errors.push(`DUPLICATE_RULE:${r.id}`); ids.add(r.id);
    if (!RULE_STATUS[r.status]) errors.push(`RULE_STATUS:${r.id}:${r.status}`);
    for (const p of r.psr709 || []) if (!R.has(p)) errors.push(`UNKNOWN_PSR709_RULE:${r.id}:${p}`);
    const src = (r.psr709 || []).map((p) => R.get(p)).filter(Boolean);
    if (r.status === 'SOURCE_EXACT') {
      if (!src.length) errors.push(`EXACT_WITHOUT_SOURCE:${r.id}`);
      for (const s of src) {
        const clean = s.modal_strength === 'HARD' && s.confidence === 'HIGH' && s.original_wording_checked === true && s.hard_coding_clearance === 'SCOPE_AND_EXCEPTIONS_REQUIRED';
        if (!clean) errors.push(`EXACT_ON_NON_HARDENABLE_RULE:${r.id}:${s.rule_id}`);
      }
    }
    if (contract.implemented && (r.status === 'SOURCE_EXACT' || r.status === 'SOURCE_DERIVED') && src.some((x) => x.hard_coding_clearance === 'DO_NOT_HARDEN_PREFERENCE') && typeof r.gate !== 'boolean') errors.push(`GATE_FLAG_REQUIRED:${r.id}`);
    if (r.gate && (r.status === 'SOURCE_EXACT' || r.status === 'SOURCE_DERIVED')) {
      for (const s of src) if (s.hard_coding_clearance === 'DO_NOT_HARDEN_PREFERENCE') {
        const ex = GATE_EXEMPTIONS[r.gateExemption];
        if (!ex || ex.candidate !== contract.candidateId || !ex.ruleIds.includes(s.rule_id)) errors.push(`PREFERENCE_HARDENED_AS_GATE:${r.id}:${s.rule_id}`);
      }
    }
    if (r.status === 'SOURCE_DERIVED' && !r.derivation) errors.push(`DERIVED_WITHOUT_DERIVATION:${r.id}`);
    if (['NOT_IMPLEMENTED', 'DATA_BLOCKED', 'SOURCE_AMBIGUOUS'].includes(r.status) && !r.reason) errors.push(`STATUS_WITHOUT_REASON:${r.id}`);
    if (['SOURCE_EXACT', 'SOURCE_DERIVED'].includes(r.status)) {
      if (!r.code) errors.push(`IMPLEMENTED_WITHOUT_CODE:${r.id}`);
      if (!(r.tests && r.tests.length)) errors.push(`IMPLEMENTED_WITHOUT_TEST:${r.id}`);
    }
    if (r.status === 'MANUAL_REVIEW_REQUIRED' && r.gate) errors.push(`MANUAL_RULE_AS_GATE:${r.id}`);
  }
  for (const id of Object.keys(contract.exclusions || {})) if (!R.has(id)) errors.push(`UNKNOWN_EXCLUSION_RULE:${id}`);
  if (cand) {
    const covered = new Set((contract.rules || []).flatMap((r) => r.psr709 || []));
    for (const id of cand.evidence_rule_ids) if (!covered.has(id)) errors.push(`CANDIDATE_EVIDENCE_NOT_COVERED:${id}`);
  }
  if (contract.outputKind === OUTPUT_KIND.RESEARCH_SIGNAL && (contract.manualReviewFlags || []).some((f) => f.blocksAutomation)) errors.push('RESEARCH_SIGNAL_WITH_BLOCKING_MANUAL_FLAG');
  if (contract.snapshot && contract.snapshot.id && contract.snapshot.id !== FOUNDATION.snapshotId) warnings.push('SNAPSHOT_DIFFERS_FROM_FOUNDATION');
  if (contract.accountingContract && contract.accountingContract.mode !== FOUNDATION.accounting.mode) errors.push('ACCOUNTING_NOT_RESEARCH_V1');
  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Derives the method status from its rules (single source of truth). Order of precedence:
 *  - no implemented rule at all                                   -> NOT_IMPLEMENTED
 *  - an essential rule is SOURCE_AMBIGUOUS and nothing else rescues it -> SOURCE_UNRESOLVED
 *  - an essential rule is DATA_BLOCKED                            -> PARTIAL_DATA_BLOCKED
 *  - an essential rule is MANUAL_REVIEW_REQUIRED or NOT_IMPLEMENTED -> PARTIAL_MANUAL_REVIEW
 *  - every essential rule SOURCE_EXACT                            -> IMPLEMENTED_SOURCE_EXACT
 *  - otherwise (EXACT and DERIVED only)                           -> IMPLEMENTED_SOURCE_DERIVED
 * "Essential" = rule.kind in ENTRY/EXIT/STOP/SIZING/SETUP/FILTER/PYRAMIDING/PORTFOLIO and rule.essential !== false.
 * `scope` (e.g. 'EQUITY_ADAPTATION') restricts the derivation to rules whose `scopes` include it (rules without
 * `scopes` apply to every scope); used to report the Turtle equity adaptation apart from the futures original.
 * The outcome for an essential NOT_IMPLEMENTED rule is PARTIAL_MANUAL_REVIEW only if the method has implemented rules;
 * that keeps a half-built method from looking finished.
 */
export function deriveImplementationStatus(contract, { scope = null } = {}) {
  const rules = (contract.rules || []).filter((r) => !scope || !r.scopes || r.scopes.includes(scope));
  const implemented = rules.filter((r) => r.status === 'SOURCE_EXACT' || r.status === 'SOURCE_DERIVED');
  if (!implemented.length) return IMPLEMENTATION_STATUS.NOT_IMPLEMENTED;
  const essential = rules.filter((r) => ESSENTIAL_KINDS.has(r.kind) && r.essential !== false);
  const has = (s) => essential.some((r) => r.status === s);
  if (has('SOURCE_AMBIGUOUS') && contract.ambiguityBlocksMethod) return IMPLEMENTATION_STATUS.SOURCE_UNRESOLVED;
  if (has('DATA_BLOCKED')) return IMPLEMENTATION_STATUS.PARTIAL_DATA_BLOCKED;
  if (has('MANUAL_REVIEW_REQUIRED') || has('NOT_IMPLEMENTED') || has('SOURCE_AMBIGUOUS')) return IMPLEMENTATION_STATUS.PARTIAL_MANUAL_REVIEW;
  if (essential.length && essential.every((r) => r.status === 'SOURCE_EXACT')) return IMPLEMENTATION_STATUS.IMPLEMENTED_SOURCE_EXACT;
  return IMPLEMENTATION_STATUS.IMPLEMENTED_SOURCE_DERIVED;
}

/** Source coverage of the #709 rules in the method's contexts: implemented / manual / blocked / uncovered. */
export function sourceCoverage(contract, extract, contexts) {
  const ctx = new Set(contexts);
  const inScope = extract.rules.filter((r) => ctx.has(r.method));
  const byId = new Map();
  for (const r of contract.rules || []) for (const p of r.psr709 || []) {
    const prev = byId.get(p);
    const rank = { SOURCE_EXACT: 6, SOURCE_DERIVED: 5, MANUAL_REVIEW_REQUIRED: 4, DATA_BLOCKED: 3, SOURCE_AMBIGUOUS: 2, NOT_IMPLEMENTED: 1 };
    if (!prev || rank[r.status] > rank[prev]) byId.set(p, r.status);
  }
  const rows = inScope.map((r) => ({ ruleId: r.rule_id, method: r.method, modal: r.modal_strength, confidence: r.confidence, clearance: r.hard_coding_clearance, status: byId.get(r.rule_id) ?? 'UNMAPPED', exclusion: (contract.exclusions || {})[r.rule_id] ?? null }));
  const count = (pred) => rows.filter(pred).length;
  const hardScoped = rows.filter((r) => r.modal === 'HARD');
  return {
    rulesInScope: rows.length,
    implementedExact: count((r) => r.status === 'SOURCE_EXACT'),
    implementedDerived: count((r) => r.status === 'SOURCE_DERIVED'),
    manualReview: count((r) => r.status === 'MANUAL_REVIEW_REQUIRED'),
    dataBlocked: count((r) => r.status === 'DATA_BLOCKED'),
    ambiguous: count((r) => r.status === 'SOURCE_AMBIGUOUS'),
    notImplemented: count((r) => r.status === 'NOT_IMPLEMENTED'),
    unmappedWithExclusion: count((r) => r.status === 'UNMAPPED' && r.exclusion),
    unmappedWithoutExclusion: count((r) => r.status === 'UNMAPPED' && !r.exclusion),
    hardRules: hardScoped.length,
    hardRulesImplemented: hardScoped.filter((r) => r.status === 'SOURCE_EXACT' || r.status === 'SOURCE_DERIVED').length,
    rows,
  };
}

/** Deterministic content hash of a contract (rules and bindings; the hash is the source contract fingerprint). */
export function contractFingerprint(contract) {
  const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
  return crypto.createHash('sha256').update(JSON.stringify(canon(contract))).digest('hex');
}

/**
 * Reproducibility receipt of one research run (written by the runner, never by hand).
 * inputs: { snapshotId, datasetSha256, accounting, codeSha256, contractFingerprint, params, runId, commit }.
 */
export function reproducibilityReceipt(inputs) {
  for (const k of ['snapshotId', 'accounting', 'contractFingerprint', 'codeSha256']) if (!inputs[k]) throw new Error(`RECEIPT_FIELD_REQUIRED:${k}`);
  if (inputs.accounting !== FOUNDATION.accounting.mode) throw new Error('RECEIPT_ACCOUNTING_NOT_RESEARCH_V1');
  if (!/^sts1-[0-9a-f]{32}$/.test(inputs.snapshotId)) throw new Error('RECEIPT_SNAPSHOT_ID_FORMAT');
  const body = { schema: 'supertrader-sf-reproducibility-receipt-1.0.0', certification: FOUNDATION.certification, ...inputs };
  return { ...body, receiptSha256: contractFingerprint(body) };
}
