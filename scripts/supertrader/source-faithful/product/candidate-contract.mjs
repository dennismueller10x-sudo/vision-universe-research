/**
 * Supertrader 7.0 – Produktvertrag fuer spaetere Kandidatenanzeigen (Datenvertrag, KEINE Laufintegration).
 *
 * Zweck: festlegen, in welcher Form und mit welchen Nachweisen eine spaetere Vision-Universe-Seite Kandidaten aus den
 * 13 Source-faithful-Research-Engines zeigen DUERFTE. Dieses Modul erzeugt keine Kandidaten, liest keine Marktdaten,
 * schreibt nichts, wird von keinem Workflow, keinem Modus und keiner Frontend-Datei importiert und ist nicht in
 * core/registry/domains.json registriert (docs/SUPERTRADER_7_PRODUCT_INTEGRATION_CONTRACT.md).
 *
 * Vier strikt getrennte Stufen (STAGE, aufsteigend):
 *  CHART_CANDIDATE          mechanisches Chartmuster am Stichtag erkannt; KEINE Aussage ueber Handelbarkeit.
 *  CONFIRMED_RESEARCH_SETUP alle mechanischen Setup-/Filter-/Einstiegsregeln des Strategievertrags am Stichtag erfuellt;
 *                           offene Ermessensregeln, mehrdeutige und datenblockierte Regeln werden vollstaendig ausgewiesen.
 *  MODELED_TRADE_PLAN       Einstieg / Stop / Groesse / Ausstieg nach dem Research-Modell; ausdruecklich hypothetisch,
 *                           jede ersetzte Ermessensregel als deklarierte Modellannahme benannt.
 *  VALIDATED_TRADE_SIGNAL   setzt Readiness CERTIFICATION_CANDIDATE + Owner-Freigabe + ausgewertetes SF6-PAPER-2027
 *                           voraus. Vertragsversion 1.0.0 gibt diese Stufe NIE aus (CONTRACT_LOCK): selbst wenn alle
 *                           drei Voraussetzungen vorlaegen, braeuchte es eine neue Vertragsversion in einem eigenen PR.
 *                           Zusaetzlich verlangt jeder Datensatz LIVE_NOT_APPROVED und DIAGNOSTIC_NOT_CERTIFIED, was
 *                           einem validierten Signal widerspricht: doppelt strukturell unerreichbar.
 *
 * Bindungen: Identitaet nur ueber core/identity.js#securityIdForTicker (ADR-001; der Validator bildet die securityId
 * selbst nach und lehnt jede andere Bildung ab). Preise nur aus der einen Preiswahrheit (ADR-002): Split-Faktoren
 * quant/engines/return-series.js#splitFactors, veroeffentlichter Schluss quant/engines/published-close.js – der
 * Datensatz deklariert diese Quellen, eine andere Ableitung wird abgelehnt.
 *
 * Reine Funktionen bis auf loadSf6Readiness (liest das committete Readiness-Artefakt, schreibt nie).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { FOUNDATION, RULE_STATUS, contractFingerprint } from '../contract.mjs';
import { CONTRACTS } from '../registry.mjs';
import { SF6_READINESS_VERSION } from '../completion/sf6-readiness-criteria.mjs';
import { SF6_PAPER_PROTOCOL } from '../completion/sf6-paper-protocol-2027.mjs';
import { DQ_VERSION, EXPOSURE_LOOKBACK_DAYS } from '../integrity/discontinuity.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
const require = createRequire(import.meta.url);
const Identity = require(path.join(ROOT, 'core/identity.js'));

export const CANDIDATE_SCHEMA = 'supertrader-sf-product-candidate-1.0.0';
export const CANDIDATE_CONTRACT_VERSION = '1.0.0';
export const SF6_READINESS_ARTIFACT = 'scripts/supertrader/source-faithful/artifacts/STRATEGY-SF6-READINESS.json';

export const STAGE = Object.freeze({
  CHART_CANDIDATE: 'CHART_CANDIDATE',
  CONFIRMED_RESEARCH_SETUP: 'CONFIRMED_RESEARCH_SETUP',
  MODELED_TRADE_PLAN: 'MODELED_TRADE_PLAN',
  VALIDATED_TRADE_SIGNAL: 'VALIDATED_TRADE_SIGNAL',
});
export const STAGE_ORDER = Object.freeze([STAGE.CHART_CANDIDATE, STAGE.CONFIRMED_RESEARCH_SETUP, STAGE.MODELED_TRADE_PLAN, STAGE.VALIDATED_TRADE_SIGNAL]);
const rank = (s) => STAGE_ORDER.indexOf(s);

/** Contract 1.0.0 never issues VALIDATED_TRADE_SIGNAL, whatever the inputs say. Changing this needs a new contract version. */
export const VALIDATED_ISSUABLE = false;

/** Status fields every record of contract 1.0.0 must carry verbatim. */
export const REQUIRED_STATUS = Object.freeze({ liveReadiness: 'LIVE_NOT_APPROVED', certification: FOUNDATION.certification, tradability: 'NO_STATEMENT' });

/** Disclaimer codes; the frontend wording is a later product decision, the codes are the contract. */
export const DISCLAIMER = Object.freeze({
  RESEARCH_ONLY_NOT_ADVICE: 'RESEARCH_ONLY_NOT_ADVICE',
  NOT_VALIDATED: 'NOT_VALIDATED',
  NO_TRADABILITY_STATEMENT: 'NO_TRADABILITY_STATEMENT',
  OPEN_DISCRETIONARY_RULES_SHOWN: 'OPEN_DISCRETIONARY_RULES_SHOWN',
  HYPOTHETICAL_MODEL_PLAN: 'HYPOTHETICAL_MODEL_PLAN',
});
export const REQUIRED_DISCLAIMERS = Object.freeze({
  CHART_CANDIDATE: Object.freeze([DISCLAIMER.RESEARCH_ONLY_NOT_ADVICE, DISCLAIMER.NOT_VALIDATED, DISCLAIMER.NO_TRADABILITY_STATEMENT]),
  CONFIRMED_RESEARCH_SETUP: Object.freeze([DISCLAIMER.RESEARCH_ONLY_NOT_ADVICE, DISCLAIMER.NOT_VALIDATED, DISCLAIMER.NO_TRADABILITY_STATEMENT, DISCLAIMER.OPEN_DISCRETIONARY_RULES_SHOWN]),
  MODELED_TRADE_PLAN: Object.freeze([DISCLAIMER.RESEARCH_ONLY_NOT_ADVICE, DISCLAIMER.NOT_VALIDATED, DISCLAIMER.NO_TRADABILITY_STATEMENT, DISCLAIMER.OPEN_DISCRETIONARY_RULES_SHOWN, DISCLAIMER.HYPOTHETICAL_MODEL_PLAN]),
});

/**
 * Block reasons. `blocks` is the LOWEST stage the reason forbids (the record / strategy stays below it).
 * Strategy-level reasons come from the contract and the readiness artifact; record-level ones from the record.
 */
export const BLOCK = Object.freeze({
  // record level
  QUARANTINE_SESSION_IN_LOOKBACK: Object.freeze({ code: 'QUARANTINE_SESSION_IN_LOOKBACK', blocks: STAGE.CONFIRMED_RESEARCH_SETUP, level: 'RECORD' }),
  // strategy level, from the contract rules
  DATA_BLOCKED_SETUP_RULE: Object.freeze({ code: 'DATA_BLOCKED_SETUP_RULE', blocks: STAGE.CONFIRMED_RESEARCH_SETUP, level: 'STRATEGY' }),
  DATA_BLOCKED_EXECUTION_RULE: Object.freeze({ code: 'DATA_BLOCKED_EXECUTION_RULE', blocks: STAGE.MODELED_TRADE_PLAN, level: 'STRATEGY' }),
  // strategy level, from the SF6 readiness artifact
  PRIMARY_STATE_BLOCKED: Object.freeze({ code: 'PRIMARY_STATE_BLOCKED', blocks: STAGE.MODELED_TRADE_PLAN, level: 'STRATEGY' }),
  LIFECYCLE_INCOMPLETE: Object.freeze({ code: 'LIFECYCLE_INCOMPLETE', blocks: STAGE.MODELED_TRADE_PLAN, level: 'STRATEGY' }),
  NOT_MEASURABLE: Object.freeze({ code: 'NOT_MEASURABLE', blocks: STAGE.MODELED_TRADE_PLAN, level: 'STRATEGY' }),
  EXECUTION_NOT_PIT: Object.freeze({ code: 'EXECUTION_NOT_PIT', blocks: STAGE.MODELED_TRADE_PLAN, level: 'STRATEGY' }),
  NOT_REPRODUCIBLE: Object.freeze({ code: 'NOT_REPRODUCIBLE', blocks: STAGE.MODELED_TRADE_PLAN, level: 'STRATEGY' }),
  NOT_TECHNICALLY_COMPLETE: Object.freeze({ code: 'NOT_TECHNICALLY_COMPLETE', blocks: STAGE.CHART_CANDIDATE, level: 'STRATEGY' }),
  NOT_IMPLEMENTED: Object.freeze({ code: 'NOT_IMPLEMENTED', blocks: STAGE.CHART_CANDIDATE, level: 'STRATEGY' }),
  NOT_IN_READINESS: Object.freeze({ code: 'NOT_IN_READINESS', blocks: STAGE.CHART_CANDIDATE, level: 'STRATEGY' }),
  // strategy level, VALIDATED prerequisites (all present today)
  OPEN_DISCRETIONARY_RULE: Object.freeze({ code: 'OPEN_DISCRETIONARY_RULE', blocks: STAGE.VALIDATED_TRADE_SIGNAL, level: 'STRATEGY' }),
  CERTIFICATION_CRITERION_FAILED: Object.freeze({ code: 'CERTIFICATION_CRITERION_FAILED', blocks: STAGE.VALIDATED_TRADE_SIGNAL, level: 'STRATEGY' }),
  NOT_CERTIFICATION_CANDIDATE: Object.freeze({ code: 'NOT_CERTIFICATION_CANDIDATE', blocks: STAGE.VALIDATED_TRADE_SIGNAL, level: 'STRATEGY' }),
  OWNER_APPROVAL_MISSING: Object.freeze({ code: 'OWNER_APPROVAL_MISSING', blocks: STAGE.VALIDATED_TRADE_SIGNAL, level: 'STRATEGY' }),
  PAPER_VALIDATION_NOT_EVALUATED: Object.freeze({ code: 'PAPER_VALIDATION_NOT_EVALUATED', blocks: STAGE.VALIDATED_TRADE_SIGNAL, level: 'STRATEGY' }),
  LIVE_NOT_APPROVED: Object.freeze({ code: 'LIVE_NOT_APPROVED', blocks: STAGE.VALIDATED_TRADE_SIGNAL, level: 'STRATEGY' }),
  CONTRACT_LOCK: Object.freeze({ code: 'CONTRACT_LOCK', blocks: STAGE.VALIDATED_TRADE_SIGNAL, level: 'STRATEGY' }),
});
const BLOCK_BY_CODE = new Map(Object.values(BLOCK).map((b) => [b.code, b]));

/** The one price truth (ADR-002) a record must declare. */
export const PRICE_TRUTH = Object.freeze({
  basis: 'SPLIT_ADJUSTED_DAILY',
  splitFactors: 'quant/engines/return-series.js#splitFactors',
  publishedClose: 'quant/engines/published-close.js',
});
export const IDENTITY_SCHEME = 'core/identity.js#securityIdForTicker';
export const BAR_INTERVALS = Object.freeze(['DAILY', 'WEEKLY_FROM_DAILY']);
export const DATA_SOURCE_KIND = Object.freeze({ FROZEN_SNAPSHOT: 'FROZEN_SNAPSHOT', DAILY_EOD: 'DAILY_EOD' });

const SETUP_KINDS = new Set(['SETUP', 'FILTER', 'ENTRY']);
const EXECUTION_KINDS = new Set(['STOP', 'EXIT']);
const RISK_KINDS = new Set(['SIZING', 'PORTFOLIO', 'PYRAMIDING']);
const ESSENTIAL_KINDS = new Set([...SETUP_KINDS, ...EXECUTION_KINDS, ...RISK_KINDS]);
const IMPLEMENTED = new Set([RULE_STATUS.SOURCE_EXACT, RULE_STATUS.SOURCE_DERIVED]);

const COMMON_KEYS = ['schema', 'contractVersion', 'stage', 'recordId', 'strategyId', 'candidateId', 'security', 'asOf', 'pit', 'price', 'provenance', 'pattern', 'status', 'disclaimers', 'dataIntegrity', 'blockReasons', 'liveActivation', 'orderRouting', 'buyDeclarationAllowed'];
const STAGE_KEYS = Object.freeze({
  CHART_CANDIDATE: COMMON_KEYS,
  CONFIRMED_RESEARCH_SETUP: [...COMMON_KEYS, 'setup'],
  MODELED_TRADE_PLAN: [...COMMON_KEYS, 'setup', 'plan'],
});

const HEX64 = /^[0-9a-f]{64}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isDate = (d) => { if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false; const t = Date.parse(`${d}T00:00:00Z`); return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === d; };
const posNum = (x) => typeof x === 'number' && Number.isFinite(x) && x > 0;
const sameSet = (a, b) => a.length === b.length && [...new Set(a)].length === a.length && a.every((x) => b.includes(x));
const keyOf = (b) => `${b.code}:${b.ref ?? ''}`;
/** sub-object whitelist (review SF7-PC-M2): an unknown nested key is rejected like a top-level one */
const onlyKeys = (o, allowed, where, errors) => { if (isObj(o)) for (const k of Object.keys(o)) if (!allowed.includes(k)) errors.push(`UNKNOWN_FIELD:${where}.${k}`); };
const sha256Json = (x) => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
let committedReadinessSha = null;
/** SHA-256 of the committed SF6 readiness artifact (read once, never written). */
export function committedReadinessSha256() { if (committedReadinessSha === null) committedReadinessSha = sha256Json(loadSf6Readiness()); return committedReadinessSha; }

const contractOf = (strategyId) => CONTRACTS.find((c) => c.strategyId === strategyId) || null;
// rules of the declared research scope only (same reading as signals/research-signal.mjs): an ORIGINAL-only rule (the
// futures / short side of Turtle) does not belong to the equity adaptation the product would show
const inScope = (contract, r) => !r.scopes || !contract.rules.some((x) => x.scopes) || r.scopes.includes('EQUITY_ADAPTATION');
const essentialRules = (contract) => contract.rules.filter((r) => r.essential !== false && ESSENTIAL_KINDS.has(r.kind) && inScope(contract, r));

/** The rule classes of one strategy contract that a record must disclose (derived, never set by hand). */
export function ruleClasses(strategyId) {
  const c = contractOf(strategyId);
  if (!c) return null;
  const ess = essentialRules(c);
  const ids = (f) => ess.filter(f).map((r) => r.id);
  return {
    mechanicalSetupRules: ids((r) => SETUP_KINDS.has(r.kind) && IMPLEMENTED.has(r.status)),
    discretionaryRules: ids((r) => r.status === RULE_STATUS.MANUAL_REVIEW_REQUIRED),
    ambiguousRules: ids((r) => r.status === RULE_STATUS.SOURCE_AMBIGUOUS),
    dataBlockedRules: ids((r) => r.status === RULE_STATUS.DATA_BLOCKED),
    dataBlockedSetupRules: ids((r) => r.status === RULE_STATUS.DATA_BLOCKED && SETUP_KINDS.has(r.kind)),
    dataBlockedExecutionRules: ids((r) => r.status === RULE_STATUS.DATA_BLOCKED && EXECUTION_KINDS.has(r.kind)),
    dataBlockedRiskRules: ids((r) => r.status === RULE_STATUS.DATA_BLOCKED && RISK_KINDS.has(r.kind)),
    notImplementedRules: ids((r) => r.status === RULE_STATUS.NOT_IMPLEMENTED),
  };
}

/** Reads the committed SF6 readiness artifact (read only). */
export function loadSf6Readiness(file = path.join(ROOT, SF6_READINESS_ARTIFACT)) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const reason = (b, ref = null) => ({ code: b.code, ref, blocks: b.blocks });

/**
 * Highest stage a strategy may issue today, from its contract and the SF6 readiness artifact.
 * `ownerApproval` is accepted only to show that it changes nothing in contract 1.0.0 (CONTRACT_LOCK).
 * Returns { strategyId, candidateId, maxStage, blockers[] } (blockers sorted by stage, code, ref).
 */
export function deriveStageCeiling(strategyId, readiness, { ownerApproval = null } = {}) {
  const contract = contractOf(strategyId);
  const cand = readiness?.candidates?.find((x) => x.strategyId === strategyId) || null;
  const blockers = [];
  if (!contract) return { strategyId, candidateId: null, maxStage: null, blockers: [reason(BLOCK.NOT_IMPLEMENTED, 'UNKNOWN_STRATEGY')] };
  if (!cand) blockers.push(reason(BLOCK.NOT_IN_READINESS, readiness?.criteriaVersion ?? null));
  if (!contract.implemented) blockers.push(reason(BLOCK.NOT_IMPLEMENTED));
  const rc = ruleClasses(strategyId);
  for (const id of rc.notImplementedRules) blockers.push(reason(BLOCK.NOT_IMPLEMENTED, id));
  if (cand && cand.technicallyComplete !== true) blockers.push(reason(BLOCK.NOT_TECHNICALLY_COMPLETE));
  // a rule the product cannot evaluate on its data is never "met": proxies do not unblock (CC-4, E4)
  for (const id of rc.dataBlockedSetupRules) blockers.push(reason(BLOCK.DATA_BLOCKED_SETUP_RULE, id));
  for (const id of rc.dataBlockedExecutionRules) blockers.push(reason(BLOCK.DATA_BLOCKED_EXECUTION_RULE, id));
  if (cand) {
    if (cand.primaryState !== 'RESEARCH_COMPLETE_WITH_EXCEPTIONS' && cand.primaryState !== 'CERTIFICATION_CANDIDATE') blockers.push(reason(BLOCK.PRIMARY_STATE_BLOCKED, cand.primaryState));
    if (cand.executablePhases !== 9) blockers.push(reason(BLOCK.LIFECYCLE_INCOMPLETE, cand.executablePhases == null ? 'NONE' : String(cand.executablePhases)));
    if (cand.measurementClass === 'NOT_MEASURABLE') blockers.push(reason(BLOCK.NOT_MEASURABLE));
    if (cand.certificationCriteria?.['CC-7-EXECUTION'] !== true) blockers.push(reason(BLOCK.EXECUTION_NOT_PIT, 'CC-7-EXECUTION'));
    if (cand.certificationCriteria?.['CC-6-REPRODUCIBLE'] !== true) blockers.push(reason(BLOCK.NOT_REPRODUCIBLE, 'CC-6-REPRODUCIBLE'));
    for (const [k, v] of Object.entries(cand.certificationCriteria || {})) if (v !== true) blockers.push(reason(BLOCK.CERTIFICATION_CRITERION_FAILED, k));
    if (cand.primaryState !== 'CERTIFICATION_CANDIDATE') blockers.push(reason(BLOCK.NOT_CERTIFICATION_CANDIDATE, cand.primaryState));
    if (cand.liveReadiness !== 'LIVE_APPROVED') blockers.push(reason(BLOCK.LIVE_NOT_APPROVED, cand.liveReadiness ?? null));
  }
  for (const id of rc.discretionaryRules) blockers.push(reason(BLOCK.OPEN_DISCRETIONARY_RULE, id));
  const paper = readiness?.paperProtocol;
  if (!paper || paper.id !== SF6_PAPER_PROTOCOL.id || paper.status !== 'EVALUATED') blockers.push(reason(BLOCK.PAPER_VALIDATION_NOT_EVALUATED, `${paper?.id ?? 'SF6-PAPER-2027'}:${paper?.status ?? 'MISSING'}`));
  if (!isObj(ownerApproval) || ownerApproval.strategyId !== strategyId || ownerApproval.decision !== 'APPROVED') blockers.push(reason(BLOCK.OWNER_APPROVAL_MISSING));
  if (!VALIDATED_ISSUABLE) blockers.push(reason(BLOCK.CONTRACT_LOCK, `candidate-contract-${CANDIDATE_CONTRACT_VERSION}`));
  blockers.sort((a, b) => rank(a.blocks) - rank(b.blocks) || a.code.localeCompare(b.code) || String(a.ref).localeCompare(String(b.ref)));
  const lowest = blockers.length ? Math.min(...blockers.map((b) => rank(b.blocks))) : STAGE_ORDER.length;
  return { strategyId, candidateId: contract.candidateId, maxStage: lowest === 0 ? null : STAGE_ORDER[lowest - 1], blockers };
}

/** Ceiling for all 13 strategies (the eligibility matrix of the integration document). */
export function stageCeilings(readiness, opts) {
  return CONTRACTS.map((c) => deriveStageCeiling(c.strategyId, readiness, opts));
}

/** Record-level block reasons from the record itself (today only the V4-D1 quarantine). */
export function recordBlockers(record) {
  const q = record?.dataIntegrity?.quarantinedSessions;
  return Array.isArray(q) && q.length ? [reason(BLOCK.QUARANTINE_SESSION_IN_LOOKBACK, q.map((s) => s?.date).filter(Boolean).sort().join(','))] : [];
}

/** The exact block reasons a record must carry: strategy ceiling + record level, in contract order. */
export function blockReasonsFor(record, readiness) {
  const all = [...deriveStageCeiling(record.strategyId, readiness).blockers, ...recordBlockers(record)];
  return all.sort((a, b) => rank(a.blocks) - rank(b.blocks) || a.code.localeCompare(b.code) || String(a.ref).localeCompare(String(b.ref)));
}

/** Deterministic record id: strategy, security, date and stage (a stage change is a new record, never an upgrade in place). */
export function recordIdFor(r) {
  return 'stc_' + crypto.createHash('sha256').update([CANDIDATE_SCHEMA, r.strategyId, r.security?.securityId, r.asOf, r.stage].join('|')).digest('hex').slice(0, 24);
}

function checkSecurity(s, errors) {
  if (!isObj(s)) { errors.push('MISSING:security'); return; }
  for (const k of Object.keys(s)) if (!['securityId', 'ticker', 'identityScheme'].includes(k)) errors.push(`UNKNOWN_FIELD:security.${k}`);
  if (s.identityScheme !== IDENTITY_SCHEME) errors.push('IDENTITY_SCHEME');
  let expected = null;
  if (typeof s.ticker !== 'string') { errors.push('IDENTITY_TICKER_INVALID'); return; }
  try { expected = Identity.securityIdForTicker(s.ticker); } catch { errors.push('IDENTITY_TICKER_INVALID'); }
  // ADR-001: the id must be exactly what core/identity.js builds; any hand-built prefix concatenation is rejected
  if (expected !== null && s.securityId !== expected) errors.push('IDENTITY_NOT_FROM_CORE_IDENTITY');
  if (expected !== null && s.ticker !== String(s.ticker).trim().toUpperCase()) errors.push('IDENTITY_TICKER_NOT_NORMALIZED');
}

function checkProvenance(p, record, contract, readiness, errors) {
  if (!isObj(p)) { errors.push('MISSING:provenance'); return; }
  const allowed = ['engineId', 'engineVersion', 'codeSha256', 'sourceContractVersion', 'contractFingerprint', 'candidateContractVersion', 'readinessCriteriaVersion', 'dataSource', 'accounting'];
  for (const k of Object.keys(p)) if (!allowed.includes(k)) errors.push(`UNKNOWN_FIELD:provenance.${k}`);
  for (const k of allowed.filter((x) => x !== 'accounting')) if (p[k] === undefined || p[k] === null || p[k] === '') errors.push(`MISSING:provenance.${k}`);
  if (typeof p.engineId !== 'string') errors.push('PROVENANCE_ENGINE_ID');
  if (typeof p.engineVersion !== 'string' || !p.engineVersion) errors.push('PROVENANCE_ENGINE_VERSION');
  if (!HEX64.test(p.codeSha256 ?? '')) errors.push('PROVENANCE_CODE_SHA256');
  if (p.candidateContractVersion !== CANDIDATE_CONTRACT_VERSION) errors.push('PROVENANCE_CANDIDATE_CONTRACT_VERSION');
  if (contract) {
    if (p.sourceContractVersion !== contract.sourceContractVersion) errors.push('PROVENANCE_SOURCE_CONTRACT_VERSION');
    if (p.contractFingerprint !== contractFingerprint(contract)) errors.push('PROVENANCE_CONTRACT_FINGERPRINT');
  }
  if (p.readinessCriteriaVersion !== SF6_READINESS_VERSION || (readiness && p.readinessCriteriaVersion !== readiness.criteriaVersion)) errors.push('PROVENANCE_READINESS_CRITERIA_VERSION');
  const ds = p.dataSource;
  if (!isObj(ds)) errors.push('PROVENANCE_DATA_SOURCE');
  else if (ds.kind === DATA_SOURCE_KIND.FROZEN_SNAPSHOT) {
    if (ds.snapshotId !== FOUNDATION.snapshotId) errors.push('PROVENANCE_SNAPSHOT_ID');
    for (const k of Object.keys(ds)) if (!['kind', 'snapshotId'].includes(k)) errors.push(`UNKNOWN_FIELD:provenance.dataSource.${k}`);
  } else if (ds.kind === DATA_SOURCE_KIND.DAILY_EOD) {
    if (ds.asOf !== record.asOf) errors.push('PROVENANCE_DATA_ASOF');
    if (!HEX64.test(ds.inputsSha256 ?? '')) errors.push('PROVENANCE_INPUTS_SHA256');
    for (const k of Object.keys(ds)) if (!['kind', 'asOf', 'inputsSha256'].includes(k)) errors.push(`UNKNOWN_FIELD:provenance.dataSource.${k}`);
  } else errors.push('PROVENANCE_DATA_SOURCE_KIND');
  if (record.stage === STAGE.MODELED_TRADE_PLAN && p.accounting !== FOUNDATION.accounting.mode) errors.push('PROVENANCE_ACCOUNTING');
  // accounting belongs to the modeled plan only (review SF7-PC-L3)
  if (record.stage !== STAGE.MODELED_TRADE_PLAN && p.accounting !== undefined) errors.push('STAGE_MIXING:provenance.accounting');
}

function checkPit(pit, record, errors) {
  if (!isObj(pit)) { errors.push('MISSING:pit'); return; }
  for (const k of Object.keys(pit)) if (!['lastBarDate', 'barInterval', 'usesIntraday', 'usesFundamentals', 'usesFutureBars'].includes(k)) errors.push(`UNKNOWN_FIELD:pit.${k}`);
  if (!isDate(pit.lastBarDate) || pit.lastBarDate !== record.asOf) errors.push('PIT_LAST_BAR_NOT_ASOF');
  if (!BAR_INTERVALS.includes(pit.barInterval)) errors.push('PIT_BAR_INTERVAL');
  // a later daily product run has EOD bars only: no intraday, no fundamentals, no bar after the as-of date
  if (pit.usesIntraday !== false) errors.push('PIT_INTRADAY_NOT_ALLOWED');
  if (pit.usesFundamentals !== false) errors.push('PIT_FUNDAMENTALS_NOT_ALLOWED');
  if (pit.usesFutureBars !== false) errors.push('PIT_FUTURE_BARS');
}

function checkPrice(px, errors) {
  if (!isObj(px)) { errors.push('MISSING:price'); return; }
  for (const k of Object.keys(px)) if (!['basis', 'splitFactors', 'publishedClose', 'close', 'currency'].includes(k)) errors.push(`UNKNOWN_FIELD:price.${k}`);
  if (px.basis !== PRICE_TRUTH.basis || px.splitFactors !== PRICE_TRUTH.splitFactors || px.publishedClose !== PRICE_TRUTH.publishedClose) errors.push('PRICE_TRUTH_NOT_ADR_002');
  if (!posNum(px.close)) errors.push('PRICE_CLOSE');
  if (px.currency !== 'USD') errors.push('PRICE_CURRENCY');
}

function checkDataIntegrity(di, record, errors) {
  if (!isObj(di)) { errors.push('MISSING:dataIntegrity'); return; }
  for (const k of Object.keys(di)) if (!['quarantinePolicy', 'lookbackDays', 'quarantinedSessions'].includes(k)) errors.push(`UNKNOWN_FIELD:dataIntegrity.${k}`);
  if (di.quarantinePolicy !== DQ_VERSION) errors.push('DATA_INTEGRITY_POLICY');
  if (di.lookbackDays !== EXPOSURE_LOOKBACK_DAYS) errors.push('DATA_INTEGRITY_LOOKBACK');
  if (!Array.isArray(di.quarantinedSessions)) { errors.push('DATA_INTEGRITY_SESSIONS'); return; }
  for (const s of di.quarantinedSessions) {
    onlyKeys(s, ['date', 'flag'], 'dataIntegrity.quarantinedSessions[]', errors);
    if (!isObj(s) || !isDate(s.date) || !['DQ-K5', 'DQ-K3'].includes(s.flag)) errors.push('DATA_INTEGRITY_SESSION_FORMAT');
    else if (s.date > record.asOf) errors.push('DATA_INTEGRITY_SESSION_AFTER_ASOF');
  }
}

function checkSetup(setup, record, rc, errors) {
  if (!isObj(setup)) { errors.push('MISSING:setup'); return; }
  for (const k of Object.keys(setup)) if (!['mechanicalRules', 'openDiscretionaryRules', 'ambiguousRules', 'dataBlockedRules', 'manualReviewStatus'].includes(k)) errors.push(`UNKNOWN_FIELD:setup.${k}`);
  const mech = Array.isArray(setup.mechanicalRules) ? setup.mechanicalRules : null;
  if (!mech) errors.push('SETUP_MECHANICAL_RULES');
  else {
    for (const m of mech) onlyKeys(m, ['ruleId', 'met'], 'setup.mechanicalRules[]', errors);
    if (!sameSet(mech.map((m) => m?.ruleId), rc.mechanicalSetupRules)) errors.push('SETUP_MECHANICAL_RULES_INCOMPLETE');
    if (mech.some((m) => m?.met !== true)) errors.push('SETUP_MECHANICAL_RULE_NOT_MET');
  }
  if (!Array.isArray(setup.openDiscretionaryRules) || !sameSet(setup.openDiscretionaryRules, rc.discretionaryRules)) errors.push('SETUP_OPEN_DISCRETIONARY_RULES_NOT_DISCLOSED');
  const amb = Array.isArray(setup.ambiguousRules) ? setup.ambiguousRules : null;
  if (amb) for (const a of amb) onlyKeys(a, ['ruleId', 'reading'], 'setup.ambiguousRules[]', errors);
  if (!amb || !sameSet(amb.map((a) => a?.ruleId), rc.ambiguousRules) || amb.some((a) => typeof a?.reading !== 'string' || !a.reading)) errors.push('SETUP_AMBIGUOUS_RULES_NOT_DISCLOSED');
  if (!Array.isArray(setup.dataBlockedRules) || !sameSet(setup.dataBlockedRules, rc.dataBlockedRules)) errors.push('SETUP_DATA_BLOCKED_RULES_NOT_DISCLOSED');
  const expectReview = rc.discretionaryRules.length ? 'REQUIRED_PENDING' : 'NOT_REQUIRED';
  if (setup.manualReviewStatus !== expectReview) errors.push('SETUP_MANUAL_REVIEW_STATUS');
}

function checkPlan(plan, record, rc, contract, errors) {
  if (!isObj(plan)) { errors.push('MISSING:plan'); return; }
  for (const k of Object.keys(plan)) if (!['hypothetical', 'model', 'entry', 'stop', 'sizing', 'exit', 'modelAssumptions', 'declaredDataExceptions'].includes(k)) errors.push(`UNKNOWN_FIELD:plan.${k}`);
  if (plan.hypothetical !== true) errors.push('PLAN_NOT_HYPOTHETICAL');
  onlyKeys(plan.model, ['lifecycleKey', 'variantId'], 'plan.model', errors);
  onlyKeys(plan.entry, ['type', 'trigger', 'earliestSession'], 'plan.entry', errors);
  onlyKeys(plan.stop, ['initial'], 'plan.stop', errors);
  onlyKeys(plan.sizing, ['method', 'riskFraction'], 'plan.sizing', errors);
  onlyKeys(plan.exit, ['ruleIds'], 'plan.exit', errors);
  if (Array.isArray(plan.modelAssumptions)) for (const a of plan.modelAssumptions) onlyKeys(a, ['ruleId', 'assumption'], 'plan.modelAssumptions[]', errors);
  if (!isObj(plan.model) || typeof plan.model.lifecycleKey !== 'string' || typeof plan.model.variantId !== 'string') errors.push('PLAN_MODEL');
  const e = plan.entry, s = plan.stop;
  if (!isObj(e) || typeof e.type !== 'string' || !posNum(e.trigger) || !isDate(e.earliestSession)) errors.push('PLAN_ENTRY');
  // PIT: the plan was made at the as-of close; the earliest session it could act in is strictly later
  else if (e.earliestSession <= record.asOf) errors.push('PLAN_ENTRY_NOT_AFTER_ASOF');
  if (!isObj(s) || !posNum(s.initial)) errors.push('PLAN_STOP');
  // long-only: the product contract never models a short (no borrow / locate data, KK-SF-PS-BORROW)
  else if (isObj(e) && posNum(e.trigger) && !(s.initial < e.trigger)) errors.push('PLAN_STOP_NOT_BELOW_ENTRY');
  if (!isObj(plan.sizing) || typeof plan.sizing.method !== 'string' || !(posNum(plan.sizing.riskFraction) && plan.sizing.riskFraction <= 0.05)) errors.push('PLAN_SIZING');
  if (!isObj(plan.exit) || !Array.isArray(plan.exit.ruleIds) || !plan.exit.ruleIds.length) errors.push('PLAN_EXIT');
  // an exit rule is a STOP / EXIT rule of the declared scope that the model can execute (implemented, or manual /
  // ambiguous and then covered by a model assumption / reading); never data-blocked or not implemented (review SF7-PC-L4)
  else for (const id of plan.exit.ruleIds) { const r = contract.rules.find((x) => x.id === id); if (!r || !EXECUTION_KINDS.has(r.kind) || !inScope(contract, r) || r.status === RULE_STATUS.DATA_BLOCKED || r.status === RULE_STATUS.NOT_IMPLEMENTED) errors.push(`PLAN_EXIT_RULE:${id}`); }
  // every open discretionary rule must be replaced by a NAMED model assumption, never silently
  const ma = Array.isArray(plan.modelAssumptions) ? plan.modelAssumptions : null;
  if (!ma || ma.some((a) => typeof a?.ruleId !== 'string' || typeof a?.assumption !== 'string' || !a.assumption)) errors.push('PLAN_MODEL_ASSUMPTIONS');
  else for (const id of rc.discretionaryRules) if (!ma.some((a) => a.ruleId === id)) errors.push(`PLAN_OPEN_DISCRETIONARY_RULE_WITHOUT_ASSUMPTION:${id}`);
  if (!Array.isArray(plan.declaredDataExceptions) || !sameSet(plan.declaredDataExceptions, rc.dataBlockedRiskRules)) errors.push('PLAN_DATA_EXCEPTIONS_NOT_DECLARED');
}

/**
 * Validates one candidate record against contract 1.0.0. Fails closed. The stage ceiling is derived from the SF6
 * readiness artifact, never from the record. `readiness` defaults to the committed artifact; a passed one must be
 * byte-identical in content to it (review SF7-PC-M1: a caller cannot lift a ceiling with an edited readiness).
 * Returns { ok, errors[] }.
 */
export function validateCandidateRecord(record, { readiness = loadSf6Readiness() } = {}) {
  const errors = [];
  if (!isObj(record)) return { ok: false, errors: ['NOT_AN_OBJECT'] };
  if (!isObj(readiness) || !Array.isArray(readiness.candidates)) return { ok: false, errors: ['READINESS_REQUIRED'] };
  if (sha256Json(readiness) !== committedReadinessSha256()) return { ok: false, errors: ['READINESS_NOT_COMMITTED_ARTIFACT'] };
  // only the readiness generation this contract was written against (criteria 1.2.0); a later one needs a contract review
  if (readiness.criteriaVersion !== SF6_READINESS_VERSION || readiness.liveReadiness !== REQUIRED_STATUS.liveReadiness || readiness.certification !== REQUIRED_STATUS.certification) errors.push('READINESS_GENERATION');
  if (record.schema !== CANDIDATE_SCHEMA) errors.push('SCHEMA');
  if (record.contractVersion !== CANDIDATE_CONTRACT_VERSION) errors.push('CONTRACT_VERSION');
  const stage = record.stage;
  if (!STAGE_ORDER.includes(stage)) return { ok: false, errors: [...errors, 'STAGE_UNKNOWN'] };
  // VALIDATED_TRADE_SIGNAL: structurally unreachable in contract 1.0.0, independent of every other field
  if (stage === STAGE.VALIDATED_TRADE_SIGNAL) return { ok: false, errors: [...errors, 'STAGE_NOT_ISSUABLE:VALIDATED_TRADE_SIGNAL'] };
  // stages are not mixable: exactly the keys of the stated stage, nothing of a higher stage, nothing unknown
  const keys = STAGE_KEYS[stage];
  for (const k of keys) if (record[k] === undefined || record[k] === null) errors.push(`MISSING:${k}`);
  for (const k of Object.keys(record)) if (!keys.includes(k)) errors.push(STAGE_KEYS.MODELED_TRADE_PLAN.includes(k) ? `STAGE_MIXING:${k}` : `UNKNOWN_FIELD:${k}`);

  const contract = contractOf(record.strategyId);
  if (!contract) errors.push('UNKNOWN_STRATEGY');
  else if (record.candidateId !== contract.candidateId) errors.push('CANDIDATE_ID');
  if (!isDate(record.asOf)) errors.push('ASOF');
  if (record.recordId !== recordIdFor(record)) errors.push('RECORD_ID');
  if (record.liveActivation !== false) errors.push('LIVE_ACTIVATION_FORBIDDEN');
  if (record.orderRouting !== 'NONE') errors.push('ORDER_ROUTING_FORBIDDEN');
  if (record.buyDeclarationAllowed !== false) errors.push('BUY_DECLARATION_FORBIDDEN');

  checkSecurity(record.security, errors);
  checkPit(record.pit, record, errors);
  checkPrice(record.price, errors);
  checkProvenance(record.provenance, record, contract, readiness, errors);
  checkDataIntegrity(record.dataIntegrity, record, errors);

  const st = record.status;
  if (!isObj(st) || Object.keys(st).length !== Object.keys(REQUIRED_STATUS).length || Object.entries(REQUIRED_STATUS).some(([k, v]) => st[k] !== v)) errors.push('STATUS_FIELDS');
  const disc = record.disclaimers;
  if (!Array.isArray(disc) || !sameSet(disc, REQUIRED_DISCLAIMERS[stage])) errors.push('DISCLAIMERS');
  const pat = record.pattern;
  onlyKeys(pat, ['patternId', 'ruleIds'], 'pattern', errors);
  if (!isObj(pat) || typeof pat.patternId !== 'string' || !pat.patternId || !Array.isArray(pat.ruleIds) || !pat.ruleIds.length) errors.push('PATTERN');
  else if (contract) {
    const known = new Set(contract.rules.map((r) => r.id));
    for (const id of pat.ruleIds) if (!known.has(id)) errors.push(`PATTERN_UNKNOWN_RULE:${id}`);
    // a chart pattern is mechanical: a manual, ambiguous or data-blocked rule can never be part of it
    for (const id of pat.ruleIds) { const r = contract.rules.find((x) => x.id === id); if (r && !IMPLEMENTED.has(r.status)) errors.push(`PATTERN_NON_MECHANICAL_RULE:${id}`); }
  }

  if (contract) {
    const rc = ruleClasses(record.strategyId);
    if (rank(stage) >= rank(STAGE.CONFIRMED_RESEARCH_SETUP)) checkSetup(record.setup, record, rc, errors);
    if (stage === STAGE.MODELED_TRADE_PLAN) checkPlan(record.plan, record, rc, contract, errors);
    // block reasons: exactly the derived ones (strategy ceiling + record level), none invented, none dropped
    const expected = blockReasonsFor(record, readiness);
    const got = Array.isArray(record.blockReasons) ? record.blockReasons : null;
    if (got) for (const b of got) onlyKeys(b, ['code', 'ref', 'blocks'], 'blockReasons[]', errors);
    if (!got || got.some((b) => !isObj(b) || !BLOCK_BY_CODE.has(b.code) || BLOCK_BY_CODE.get(b.code).blocks !== b.blocks)) errors.push('BLOCK_REASONS_FORMAT');
    else if (!sameSet(got.map(keyOf), expected.map(keyOf))) errors.push('BLOCK_REASONS_NOT_DERIVED');
    // the stage must lie below every block reason that applies (strategy ceiling and record level)
    const lowest = Math.min(...expected.map((b) => rank(b.blocks)));
    if (rank(stage) >= lowest) errors.push(`STAGE_ABOVE_CEILING:${stage}>${lowest === 0 ? 'NONE' : STAGE_ORDER[lowest - 1]}`);
  }
  return { ok: errors.length === 0, errors };
}

/**
 * The only allowed transition: a NEW record of the next stage for the same strategy, security and as-of date, valid on
 * its own. Never in place, never a skip, never to VALIDATED_TRADE_SIGNAL in contract 1.0.0.
 */
export function checkStageTransition(from, to, { readiness = loadSf6Readiness() } = {}) {
  const errors = [];
  if (!isObj(from) || !isObj(to)) return { ok: false, errors: ['NOT_AN_OBJECT'] };
  if (to.stage === STAGE.VALIDATED_TRADE_SIGNAL) errors.push('STAGE_NOT_ISSUABLE:VALIDATED_TRADE_SIGNAL');
  if (rank(to.stage) !== rank(from.stage) + 1) errors.push('TRANSITION_NOT_NEXT_STAGE');
  if (to.strategyId !== from.strategyId || to.security?.securityId !== from.security?.securityId || to.asOf !== from.asOf) errors.push('TRANSITION_IDENTITY_CHANGED');
  if (to.recordId === from.recordId) errors.push('TRANSITION_IN_PLACE');
  for (const r of [from, to]) { const v = validateCandidateRecord(r, { readiness }); if (!v.ok) errors.push(...v.errors.map((e) => `${r === from ? 'FROM' : 'TO'}:${e}`)); }
  return { ok: errors.length === 0, errors };
}

/** Fingerprint of this contract's fixed definitions (for later producer registration and the status page). */
export function candidateContractSha256() {
  const def = { CANDIDATE_SCHEMA, CANDIDATE_CONTRACT_VERSION, STAGE_ORDER, VALIDATED_ISSUABLE, REQUIRED_STATUS, REQUIRED_DISCLAIMERS, BLOCK, PRICE_TRUTH, IDENTITY_SCHEME, BAR_INTERVALS, DATA_SOURCE_KIND, STAGE_KEYS };
  return crypto.createHash('sha256').update(JSON.stringify(def)).digest('hex');
}
