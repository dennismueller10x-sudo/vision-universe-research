/** Public-only Rerun I/O. No returns, score calculation, engine or performance run. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {constants as bufferConstants} from 'node:buffer';
import {assertFreezeV2} from './freeze-v2.mjs';
import {FINAL_QUESTIONS} from '../tournament/publish-report.mjs';

export const RERUN_PUBLIC_NAMES = Object.freeze([
  'SUPERTRADER-TOURNAMENT-RERUN.json', 'SUPERTRADER-SIGNAL-QUALITY-RERUN.json',
  'SUPERTRADER-RISK-RERUN.json', 'SUPERTRADER-REGIME-RERUN.json',
  'SUPERTRADER-CURRENT-CANDIDATES-RERUN.json', 'SUPERTRADER-CONSENSUS-RERUN.json',
  'SUPERTRADER-FINAL-TIERING-RERUN.json', 'SUPERTRADER-TOP-CANDIDATES-RERUN.json',
  'SUPERTRADER-METHOD-OVERLAP-RERUN.json', 'SUPERTRADER-FORWARD-LEDGER-RERUN.json',
]);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const PUBLIC_DIR = 'scripts/supertrader/research/certification';
const BASE_DIR = 'scripts/supertrader/research/tournament';
const SIX = ['cross_sectional_momentum', '52_week_high_effect', 'LOW_VOLATILITY',
  'TURTLE_S2_EQUITY_DAILY', 'WEINSTEIN_STAGE_DAILY', 'KULLAMAGI_DAILY_ADAPTATION'];
const DIRECTIONS = ['INCREASED', 'DECREASED', 'UNCHANGED', 'UNAVAILABLE'];
const SCAN = ['READY', 'OK', 'AVAILABLE', 'PARTIAL', 'DATA_GAP', 'BLOCKED_DATA', 'DATA_UNAVAILABLE', 'INSUFFICIENT_DATA', 'UNAVAILABLE'];
const READY = ['READY', 'OK', 'AVAILABLE', 'PARTIAL'];
const SIGNAL = ['POSITIVE', 'NEGATIVE', 'NEUTRAL', 'INSUFFICIENT', 'UNAVAILABLE'];
const PORTFOLIO = ['ABOVE', 'SIMILAR', 'BELOW', 'UNAVAILABLE'];
const RISK = ['SHALLOWER', 'SIMILAR', 'DEEPER', 'UNAVAILABLE'];
const ANSWER = ['RESOLVED', 'PRIVATE_ENCRYPTED', 'BLOCKED_DATA', 'NOT_IDENTIFIED', 'RESEARCH_ONLY', 'NONE_QUALIFIED'];
const REGIMES = ['BULL', 'BEAR', 'SIDEWAYS', 'UNKNOWN', 'HIGH_VOL', 'LOW_VOL', 'MID_VOL', 'EARLY', 'LATE'];
const SHA = /^[a-f0-9]{64}$/;
const array = value => Array.isArray(value) ? value : [];
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const enumOnly = (value, allowed) => {if (!allowed.includes(value)) throw new Error('UNREVIEWED_PUBLIC_ENUM'); return value;};
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const sameSet = (rows, ids) => Array.isArray(rows) && rows.length === ids.length && new Set(rows.map(r => r.id)).size === ids.length && ids.every(id => rows.some(r => r.id === id));
function boundedJson(file, maximum = bufferConstants.MAX_STRING_LENGTH) {
  if (fs.statSync(file).size > maximum) throw new Error('BOUNDED_INPUT_FILE_REQUIRED');
  const bytes = fs.readFileSync(file);
  if (bytes.length > maximum) throw new Error('BOUNDED_INPUT_FILE_REQUIRED');
  return {value: JSON.parse(bytes.toString('utf8')), sha256: hash(bytes)};
}
export function loadRerunPublicMetadata(outRoot = ROOT) {
  const root = path.resolve(outRoot), prefix = name => path.join(root, PUBLIC_DIR, name), base = name => path.join(root, BASE_DIR, name);
  return {eligibility: json(prefix('SUPERTRADER-METHOD-ELIGIBILITY.json')),
    coverage: json(prefix('SUPERTRADER-PIT-COVERAGE.json')),
    originalFreeze: json(base('SUPERTRADER-METHOD-FREEZES.json')),
    universe: json(base('SUPERTRADER-FULL-METHOD-UNIVERSE.json')),
    baselineTiering: json(base('SUPERTRADER-TIERING-FINAL.json'))};
}

function reviewGate(review, bindings) {
  if (review?.status !== 'PASSED' || review.finalized !== true || review.reviewScope !== 'FULL_SIX_METHODS' ||
      review.fullSixMethodReviewComplete !== true || review.fullFifteenPairReviewComplete !== true ||
      review.controlReviewComplete !== true || review.currentRunReviewed !== true) throw new Error('FINAL_FULL_NUMERIC_AND_REDTEAM_REVIEW_REQUIRED');
  for (const name of ['historicalInputSha256', 'controlInputSha256', 'currentInputSha256', 'certificationFreezeHash', 'eligibilityFileSha256']) {
    if (!SHA.test(bindings?.[name] ?? '') || review[name] !== bindings[name]) throw new Error('REVIEW_INPUT_BINDING_MISMATCH');
  }
}

export function validateRerunPublication({historical, control, current, numericReview, redTeamReview, finalReview,
  bindings, metadata, verifyFreeze} = {}) {
  if (!metadata?.eligibility || !metadata.originalFreeze || !metadata.baselineTiering) throw new Error('PUBLIC_CERTIFICATION_METADATA_REQUIRED');
  const eligibility = metadata.eligibility, ids = array(eligibility.methods).map(r => r.id);
  if (ids.length !== 10 || new Set(ids).size !== 10 || eligibility.methods.filter(r => r.eligibility === 'PARTIAL').length !== 6 ||
      eligibility.methods.filter(r => r.eligibility === 'BLOCKED').length !== 4 || eligibility.methods.some(r => r.fully_certified !== false)) throw new Error('EXACT_PREMEASUREMENT_ELIGIBILITY_REQUIRED');
  if (!sameSet(historical?.results, SIX) || !sameSet(control?.results, SIX)) throw new Error('COMPLETE_SIX_ACTUAL_AND_CONTROL_RESULTS_REQUIRED');
  if (!historical.dataFingerprint || historical.dataFingerprint !== control.dataFingerprint ||
      !isDeepStrictEqual(historical.freeze, metadata.originalFreeze) || !isDeepStrictEqual(historical.certificationFreeze?.eligibility, eligibility) ||
      !isDeepStrictEqual(current?.freeze, historical.certificationFreeze)) throw new Error('ACTUAL_SOURCE_FREEZE_ELIGIBILITY_BINDING_MISMATCH');
  if (hash(JSON.stringify(historical.certificationFreeze)) !== bindings?.certificationFreezeHash) throw new Error('CERTIFICATION_FREEZE_HASH_MISMATCH');
  (verifyFreeze ?? assertFreezeV2)(historical.certificationFreeze);
  reviewGate(numericReview, bindings); reviewGate(redTeamReview, bindings);
  if (finalReview?.status !== 'PASSED' || finalReview.finalized !== true || finalReview.publicationAuthorized !== true) throw new Error('FINAL_OWNER_PUBLICATION_REVIEW_REQUIRED');
  if (finalReview.numericReviewSha256 !== hash(JSON.stringify(numericReview)) || finalReview.redTeamReviewSha256 !== hash(JSON.stringify(redTeamReview))) throw new Error('OWNER_REVIEW_BINDING_REQUIRED');
  const answers = array(finalReview.finalAnswers);
  if (answers.length !== 20 || new Set(answers.map(a => a.questionId)).size !== 20 ||
      answers.some(a => !Number.isInteger(a.questionId) || a.questionId < 1 || a.questionId > 20 || !ANSWER.includes(a.status))) throw new Error('TWENTY_FINAL_ANSWERS_REQUIRED');
  for (const r of historical.results) {
    if (r.run?.reconciliation?.pass !== true || r.dataQuality?.pitListings !== false || r.ranking?.score !== null ||
        r.ranking?.components?.dataQuality !== null || r.ranking.confidence !== 'LOW' || !['C', 'D'].includes(r.ranking.tier) ||
        r.qualification?.fullyQualified !== false || r.qualification.tierCeiling !== 'C' ||
        r.rubricInputCertificationAmendment?.weightsChanged !== false || r.rubricInputCertificationAmendment?.thresholdsChanged !== false) throw new Error('TRUTHFUL_NULL_SCORE_PARTIAL_CEILING_REQUIRED');
    enumOnly(r.ranking.signalClassification, SIGNAL); enumOnly(r.ranking.portfolioClassification, PORTFOLIO); enumOnly(r.ranking.riskClassification, RISK);
  }
  if (!sameSet(current?.currentScans, ids) || !['CURRENT_SCANNED_REVIEW_PENDING', 'CURRENT_BLOCKED_DATA'].includes(current.status) ||
      !current.closedAt || current.historicalCalculation !== 'NOT_RUN_CURRENT_ONLY') throw new Error('COMPLETED_ACTUAL_CURRENT_RUN_REQUIRED');
  for (const s of current.currentScans) {
    const admission = eligibility.methods.find(r => r.id === s.id);
    enumOnly(s.status, SCAN);
    if (s.fullyCertified !== false || s.eligibility !== admission.eligibility || admission.eligibility === 'BLOCKED' && (s.eligibility !== 'BLOCKED' || s.numberMatches !== null || array(s.candidates).length)) throw new Error('CURRENT_BLOCKED_OR_PARTIAL_ADMISSION_MISMATCH');
  }
  if (array(current.consensus?.qualifiedEligible).length || array(current.consensus?.qualifiedEligibleMethodIds).length ||
      array(current.consensus?.strongMethods).length || array(current.consensus?.eligibleStrongMethods).length) throw new Error('NO_QUALIFIED_CONSENSUS_MUST_BE_PRESERVED');
  for (const row of control.results) if ((row.run?.reconciliation ?? row.reconciliation)?.pass !== true) throw new Error('CONTROL_RECONCILIATION_REQUIRED');
  if (current.eligibilityFileHash !== bindings.eligibilityFileSha256 || !isDeepStrictEqual(current.eligibility, eligibility)) throw new Error('CURRENT_ELIGIBILITY_RECEIPT_MISMATCH');
  if (current.forwardLedger?.status !== 'PREPARED_NOT_LIVE' || array(current.forwardLedger?.records).length ||
      array(current.forwardLedger?.methods).some(r => r.baselineIsPostFreezeSignal !== false || array(r.records).length)) throw new Error('ACTUAL_FORWARD_NOT_ESTABLISHED');
  if (array(historical.overlap).length !== 15) throw new Error('FULL_FIFTEEN_PAIR_OVERLAP_REQUIRED');
  const education = metadata.baselineTiering.counts;
  if (education?.dossier_tier_D_educational !== 24 || education.dossier_tier_D_legacy_unmeasured !== 3) throw new Error('BASELINE_SOURCE_EDUCATIONAL_SCOPE_REQUIRED');
  return {ids, eligibility, answers, education};
}

function statusCounts(value) {
  return Object.fromEntries(Object.entries(value ?? {}).filter(([k, v]) => SCAN.includes(k) && count(v) !== null));
}
export function assertRerunPublicPrivacy(value, knownIds) {
  const forbidden = /^(ticker|tickers|securityId|listingId|issuerCik|price|prices|close|open|high|low|volume|cagr|sharpe|maxDrawdown|exposure|weight|score|mean|median|returns?|pnl|candidateIds|candidates)$/i;
  const visit = (v, key = '') => {
    if (forbidden.test(key)) throw new Error('PRIVATE_PROVIDER_FIELD_IN_PUBLIC_ARTIFACT');
    if (typeof v === 'number' && (!Number.isSafeInteger(v) || v < 0)) throw new Error('NONCOUNT_NUMBER_IN_PUBLIC_ARTIFACT');
    if (typeof v === 'string' && !knownIds.has(v) && !/^[A-Z0-9_]+$/.test(v) && !/^supertrader-[a-z0-9-]+$/.test(v)) throw new Error('UNALLOWLISTED_PUBLIC_STRING');
    if (Array.isArray(v)) v.forEach(x => visit(x));
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => visit(x, k));
  };
  visit(value);
}

export function buildRerunPublicArtifacts(inputs) {
  const ctx = validateRerunPublication(inputs), {historical, control, current, finalReview, metadata} = inputs;
  const knownIds = new Set([...ctx.ids, ...array(metadata.universe?.candidates).map(r => r.id), ...array(ctx.eligibility.unimplemented_candidates).map(r => r.id)]);
  const idsOnly = value => {
    const ids = array(value).map(v => typeof v === 'string' ? v : v?.id);
    if (ids.some(id => !knownIds.has(id)) || new Set(ids).size !== ids.length) throw new Error('UNKNOWN_OR_DUPLICATE_SELECTION');
    return ids;
  };
  const measured = historical.results.map(r => ({method_id: r.id, implemented: true, measured: true,
    eligibility: 'PARTIAL', raw_fixed_rubric_tier: r.ranking.tier, qualified_tier: r.ranking.tier, qualified_ceiling: 'C', overall_confidence: 'LOW',
    actual_total_score: null, actual_data_quality_component: null, score_status: 'UNAVAILABLE_MISSING_RUBRIC_COMPONENT_NOT_ZERO',
    signal: r.ranking.signalClassification, portfolio: r.ranking.portfolioClassification, risk: r.ranking.riskClassification,
    data_confidence: 'MEDIUM', execution_confidence: 'LOW', signal_count: count(r.signalMetrics?.totalSignals),
    signal_census_basis: r.run?.signalCensus?.basis === 'PORTFOLIO_INDEPENDENT_COMMON_ELIGIBLE_SETUP' ? 'PORTFOLIO_INDEPENDENT_COMMON_ELIGIBLE_SETUP' : r.run?.signalCensus?.basis === 'ACADEMIC_FORMATION_SELECTION' ? 'ACADEMIC_FORMATION_SELECTION' : 'UNAVAILABLE',
    signal_census_status_counts: statusCounts(r.run?.signalCensus?.formationCounts),
    portfolio_formation_status_counts: statusCounts(r.run?.formationCounts),
    causal_alpha_proven: false, historical_label: 'SEEN_HISTORICAL_DATA_OBSERVED_PANEL'}));
  const blocked = ctx.eligibility.methods.filter(r => r.eligibility === 'BLOCKED').map(r => ({method_id: r.id, implemented: true,
    measured: false, eligibility: 'BLOCKED', qualified_tier: 'UNRANKED_DATA_BLOCKED', overall_confidence: 'LOW',
    actual_total_score: null, score_status: 'UNMEASURED_DATA_BLOCKED_NOT_ZERO', source_fidelity_confidence: r.source_fidelity_confidence}));
  const sourceBlocked = array(ctx.eligibility.unimplemented_candidates).map(r => ({method_id: r.id, implemented: false,
    measured: false, eligibility: 'BLOCKED', blocking_status: r.eligibility_status}));
  const counts = {implemented_engines: 10, historical_method_participants: 6, control_method_participants: 6,
    control_conditions_are_additional_strategies: false, measured_tier_A: 0, measured_tier_B: 0, measured_tier_C: measured.filter(r => r.raw_fixed_rubric_tier === 'C').length, measured_tier_D: measured.filter(r => r.raw_fixed_rubric_tier === 'D').length,
    partial_methods: 6, blocked_engines: 4, blocked_unimplemented_candidates: 2, blocked_candidates_total: 6,
    fully_certified_methods: 0, qualified_winners: 0, baseline_source_educational_dossiers: 24,
    baseline_legacy_unmeasured_dossiers: 3, baseline_source_educational_and_legacy_total: 27};
  if (sourceBlocked.length !== 2) throw new Error('TWO_UNIMPLEMENTED_BLOCKED_SOURCE_CANDIDATES_REQUIRED');
  const envelope = fields => ({schema: 'supertrader-public-rerun-2-0-0', status: 'FINAL_REVIEWED_RERUN_PROJECTION', ...fields});
  const scans = current.currentScans.map(s => ({method_id: s.id, eligibility: s.eligibility, status: s.status,
    match_count: READY.includes(s.status) ? count(s.numberMatches ?? array(s.candidates).length) : null,
    portfolio_admitted_match_count: READY.includes(s.status) ? count(s.portfolioAdmittedMatches) : null,
    identifiers: 'PRIVATE_OWNER_ENCRYPTED', confidence: 'LOW', investment_recommendation: false}));
  const comparisons = array(finalReview.comparisons).map(r => {
    if (!SIX.includes(r.id)) throw new Error('UNKNOWN_COMPARISON_METHOD');
    const project = value => Object.fromEntries(['portfolio', 'signal', 'risk'].map(k => [k, enumOnly(value?.[k], DIRECTIONS)]));
    return {method_id: r.id, old_589_to_same_new_source_original_execution: project(r.sourceSnapshotDelta),
      same_new_source_original_execution_to_v2: project(r.certificationOverlayDelta),
      old_589_to_v2: project(r.combinedDelta), interpretation: 'DESCRIPTIVE_THREE_CONDITIONS_NOT_CERT_ONLY_CAUSAL'};
  });
  if (comparisons.length !== 6 || new Set(comparisons.map(r => r.method_id)).size !== 6) throw new Error('FULL_SIX_THREE_CONDITION_COMPARISON_REQUIRED');
  const regimes = array(finalReview.regimeAssessments).map(r => {
    if (!SIX.includes(r.id)) throw new Error('UNKNOWN_REGIME_METHOD');
    return {method_id: r.id, regimes: array(r.regimes).map(g => ({regime: enumOnly(g.regime, REGIMES), direction: enumOnly(g.direction, SIGNAL)})),
      interpretation: 'OBSERVED_CONDITIONAL_RESEARCH_NOT_CONTIGUOUS_CAGR'};
  });
  if (regimes.length !== 6 || new Set(regimes.map(r => r.method_id)).size !== 6) throw new Error('FULL_SIX_REVIEWED_REGIME_ASSESSMENTS_REQUIRED');
  const overlap = array(finalReview.overlapAssessments).map(r => {
    if (!SIX.includes(r.methodA) || !SIX.includes(r.methodB) || r.methodA === r.methodB) throw new Error('UNKNOWN_OVERLAP_PAIR');
    return {method_a: r.methodA, method_b: r.methodB, redundancy: enumOnly(r.redundancy, ['HIGH', 'MEDIUM', 'LOW', 'UNAVAILABLE']), independence_proven: false};
  });
  if (overlap.length !== 15 || new Set(overlap.map(r => [r.method_a, r.method_b].sort().join('|'))).size !== 15) throw new Error('FULL_REVIEWED_FIFTEEN_PAIR_OVERLAP_REQUIRED');
  const questions = ctx.answers.map(a => ({question_id: a.questionId, status: a.status, method_ids: idsOnly(a.methodIds),
    confidential_detail: [10, 11].includes(a.questionId) ? 'PRIVATE_OWNER_ENCRYPTED' : 'PRIVATE_FINAL_REVIEW'}));
  const priorities = idsOnly(finalReview.researchPriorityMethodIds);
  const out = {
    'SUPERTRADER-TOURNAMENT-RERUN.json': envelope({counts, methods: [...measured, ...blocked], blocked_source_candidates: sourceBlocked,
      comparisons, comparison_conditions: ['ORIGINAL_589', 'SAME_NEW_SOURCE_ORIGINAL_EXECUTION_CONTROL', 'CERTIFIED_RECEIVER_V2'],
      old_results_relabelled: false, current_status: current.status, final_questions: questions}),
    'SUPERTRADER-SIGNAL-QUALITY-RERUN.json': envelope({methods: measured.map(r => ({method_id: r.method_id, signal: r.signal,
      signal_count: r.signal_count, signal_census_basis: r.signal_census_basis, signal_census_status_counts: r.signal_census_status_counts,
      portfolio_formation_status_counts: r.portfolio_formation_status_counts, inference: 'DESCRIPTIVE_HYPOTHESIS_NOT_PROVEN_ALPHA', independent_trades: false}))}),
    'SUPERTRADER-RISK-RERUN.json': envelope({methods: measured.map(r => ({method_id: r.method_id, risk: r.risk,
      confidence: 'LOW', terminal_outcomes: 'UNCERTIFIED_SCENARIOS_NOT_REALIZED_LEDGER'}))}),
    'SUPERTRADER-REGIME-RERUN.json': envelope({methods: regimes, no_regime_performance_optimized_variant: true}),
    'SUPERTRADER-CURRENT-CANDIDATES-RERUN.json': envelope({status: current.status, methods: scans, scan_method_count: 10,
      qualified_method_count: 0, qualified_stock_selection_status: 'NONE_QUALIFIED', candidate_identities: 'PRIVATE_OWNER_ENCRYPTED'}),
    'SUPERTRADER-CONSENSUS-RERUN.json': envelope({qualified_method_count: 0, qualified_consensus_candidate_count: 0,
      strong_method_count: 0, strong_consensus_candidate_count: 0, qualified_status: 'NONE_QUALIFIED',
      partial_diagnostic_method_count: array(current.consensus?.partialDiagnosticMethodIds).length,
      partial_diagnostic_candidate_count: current.status === 'CURRENT_BLOCKED_DATA' ? null : array(current.consensus?.partialDiagnostic).length,
      diagnostic_status: 'UNQUALIFIED_OBSERVED_PANEL_DIAGNOSTIC_ONLY', candidate_identities: 'PRIVATE_OWNER_ENCRYPTED', independent_trading_score: false}),
    'SUPERTRADER-FINAL-TIERING-RERUN.json': envelope({counts, methods: [...measured, ...blocked], blocked_source_candidates: sourceBlocked,
      source_educational_scope: 'BASELINE_DOSSIER_ROLES_SEPARATE_FROM_MEASURED_TIERS', source_educational_count: 27,
      fully_certified_eligible_method_ids: [], missing_component_imputation: false, score_weights_redistributed: false}),
    'SUPERTRADER-TOP-CANDIDATES-RERUN.json': envelope({qualified_method_ids: [], qualified_winner_status: 'NONE_QUALIFIED',
      research_hypothesis_method_ids: priorities, research_hypothesis_status: priorities.length ? 'RESEARCH_ONLY_NOT_QUALIFIED_WINNERS' : 'NONE_SELECTED',
      qualified_current_stock_selection_status: 'NONE_QUALIFIED', identities: 'PRIVATE_OWNER_ENCRYPTED'}),
    'SUPERTRADER-METHOD-OVERLAP-RERUN.json': envelope({pair_count: 15, pairs: overlap, independence_proven: false}),
    'SUPERTRADER-FORWARD-LEDGER-RERUN.json': envelope({status: 'PREPARED_NOT_LIVE', qualified_priority_method_ids: [],
      research_watch_method_ids: idsOnly(finalReview.forwardResearchMethodIds), actual_post_freeze_record_count: array(current.forwardLedger?.records).length,
      baseline_closed_session_snapshot_is_forward_signal: false, identities: 'PRIVATE_OWNER_ENCRYPTED'}),
  };
  assertRerunPublicPrivacy(out, knownIds);
  return out;
}

function list(values) {return values.length ? values.join(', ') : 'Keine';}
export function buildRerunMarkdown(inputs, artifacts = buildRerunPublicArtifacts(inputs)) {
  const table = artifacts['SUPERTRADER-TOURNAMENT-RERUN.json'], methods = table.methods.filter(r => r.measured);
  const positive = methods.filter(r => r.signal === 'POSITIVE').map(r => r.method_id), above = methods.filter(r => r.portfolio === 'ABOVE').map(r => r.method_id);
  const shallow = methods.filter(r => r.risk === 'SHALLOWER').map(r => r.method_id);
  const priorities = artifacts['SUPERTRADER-TOP-CANDIDATES-RERUN.json'].research_hypothesis_method_ids;
  const answers = [
    `Keine vollständig qualifizierte Methode. Beobachtete Portfolio-Richtung ABOVE: ${list(above)}. Gesamt-Confidence LOW.`,
    `POSITIVE explorative Signal-Richtung: ${list(positive)}. Das ist kein bewiesenes Alpha und kein unabhängiger Holdout.`,
    'Cash-/Exposure-Matched-Diagnostik liegt privat vor. Selection, Sizing und Exits sind damit nicht kausal isoliert.',
    `SHALLOWER Drawdown-Richtung im beobachteten Panel: ${list(shallow)}. Exakte Risikometriken bleiben privat; Terminal-Outcomes sind unzertifiziert.`,
    'Die geprüfte Regime-Matrix enthält Richtungen und unzureichend belegte Segmente. Bedingte Gruppen sind keine zusammenhängende CAGR-Reihe.',
    'Die drei Legendary-Engines sind VU-Adaptionen mit LOW Source-Fidelity; keine vollständige Original-Replikation wird behauptet.',
    'Die unveränderten Source-Dossiers behalten ihren educational-/diskretionären Kontext. Source-Rollen sind getrennt von gemessenen Tier-Counts.',
    'Die systematischen Methoden können Forschungsansätze liefern. Fehlende PIT-/Execution-Zertifizierung verhindert vollständig qualifizierte Gewinner.',
    'Die unabhängige Prüfung deckt alle fünfzehn Methodenpaare ab. Überschneidung und Korrelation beweisen keine unabhängigen Trading-Edges.',
    'Kein vollständig qualifiziertes Current-Methodenset. Tatsächliche PARTIAL-Matches und Source-Flags stehen ausschließlich im privaten Owner-Paket.',
    'Qualified und Strong Consensus sind leer. PARTIAL-Consensus bleibt eine getrennte Diagnostik mit privaten Aktienidentitäten.',
    `Research-Prioritäten ohne Gewinnerbehauptung: ${list(priorities)}. Eine erzwungene Drei-bis-sieben-Auswahl findet nicht statt.`,
    'Keine Methode wird aufgrund dieses unvollständig zertifizierten Reruns als voll qualifizierter Produktgewinner hervorgehoben.',
    'Eine sekundäre Research-Darstellung muss PARTIAL, LOW Confidence und die belegten Source-/Execution-Grenzen zeigen.',
    'Der alte Source-Bereich umfasst vierundzwanzig educational Dossiers und drei ungemessene Legacy-Dossiers; zusammen siebenundzwanzig, getrennt von den tatsächlichen gemessenen Tiers.',
    'Die Ledger sind vorbereitet. Frühere geschlossene Source-Snapshots werden nicht zu echten Post-freeze-Forward-Signalen erklärt.',
    'Historische Security-/Issuer-/Full-Class-Bindung, PIT-Marktpopulation, exakte Market Equity, breite Jahresoperanden und tatsächliche Terminal-Proceeds bleiben offen. Industry-Membership/Source-Taxonomie und die Residual-Holding-Variante fehlen.',
    'Alle gemessenen Ergebnisse sind SEEN_HISTORY und hypothesengenerierend. Neue Varianten oder Schwellen dürfen nicht aus denselben Ergebnissen ausgewählt und anschließend als ungesehener Test bezeichnet werden.',
    'Der nächste Auftrag muss die offenen Source-/Data-/Execution-Verträge schließen und echte Forward-Beobachtungen sammeln. Methodendefinitionen und eingefrorene Score-Gewichte bleiben unverändert.',
    'Kein Ausbau blockierter Engines oder Varianten ohne die benannten Verträge; kein erneuter Minervini-Optimierungstrack und keine künstlich erzwungene Gewinnerliste.',
  ];
  const lines = ['# Supertrader: vollständiger Tournament-Rerun', '',
    'Die tatsächlichen historischen Läufe, der Source-Control und der frische Current-Lauf wurden unabhängig numerisch und im Red Team geprüft. Dieser Report veröffentlicht nur Counts, Enums und Richtungen. Alle Provider-Metriken und Aktienidentitäten bleiben im Owner-Paket.', '',
    'Zehn Engines; sechs PARTIAL historische Teilnehmer und dieselben sechs im Source-Control; vier datenblockierte Engines. Zwei weitere Source-/Regelkandidaten bleiben ohne Engine gesperrt. Vollständig zertifizierte Methoden und qualifizierte Gewinner: null.', '',
    'Alle sechs tatsächlichen Rerun-Scores sind NULL: der korrigierte `pitListings:false`-Input lässt die Data-Quality-Komponente im unveränderten festen Algorithmus fehlen. Fehlende Komponenten werden nicht auf null gesetzt, imputiert oder mit umverteilten Gewichten ersetzt. Die tatsächlichen Raw Tiers des unveränderten Algorithmus werden erhalten; die vorab bestimmte Qualifizierungsobergrenze ist C. Overall Confidence LOW.', '',
    `Die siebenundzwanzig alten educational-/Legacy-Dossierrollen sind kein measured Tier D. Gemessene Tiers: A ${table.counts.measured_tier_A}, B ${table.counts.measured_tier_B}, C ${table.counts.measured_tier_C}, D ${table.counts.measured_tier_D}. Blockierte Methoden bleiben ungerankt.`, '',
    '## Beobachtete Richtungen', '', '| Methode | Signal | Portfolio vs Benchmark | Drawdown vs Benchmark | Eligibility | Confidence |',
    '|---|---|---|---|---|---|', ...methods.map(r => `| ${r.method_id} | ${r.signal} | ${r.portfolio} | ${r.risk} | PARTIAL | LOW |`), '',
    '## Old-vs-new: drei Bedingungen getrennt', '',
    'Original #589 → gleiche neue Source-Daten mit originaler Execution misst eine deskriptive Source-Snapshot-Differenz. Source-Control → V2 vergleicht denselben neuen Canonical-Source mit den vorab registrierten Zertifizierungs-/Execution-Overlays. Original #589 → V2 enthält beide Änderungen und ist kein rein kausaler Certification-Effekt. Alte Ergebnisse werden nicht nachträglich umetikettiert.', '',
    '| Methode | Source-Snapshot-Delta: Portfolio / Signal / Risiko | Certification-Overlay-Delta | Kombiniertes Delta |', '|---|---|---|---|',
    ...table.comparisons.map(r => {const f = x => `${x.portfolio} / ${x.signal} / ${x.risk}`; return `| ${r.method_id} | ${f(r.old_589_to_same_new_source_original_execution)} | ${f(r.same_new_source_original_execution_to_v2)} | ${f(r.old_589_to_v2)} |`;}), '',
    'Predeclared Overlays filtern post-terminal/undatierte Klassenhinweise und bewahren echte Zeitgrenzen. Bekannte Cash-Entitlements wären von spendbarer Settlement-Cash getrennt; ein vollständiges tatsächliches Ledger wurde nicht hergestellt. Unbekannte Terminal-Proceeds und Quarantäne bleiben Szenarien, keine realisierten Outcomes.', '',
    'Die separate Legacy-Execution-Day-Low-Bugfix gilt nicht pauschal für den Kullamägi-Daily-Signal-Day-Low/Next-open-Pfad. Der Piotroski-FY-Link-Resolver ist eine isolierte Implementierungsbugfix-Version ohne neue Formel, Rankings oder synthetisch umbenannte Perioden; die Engine bleibt mangels kompletter Daten blockiert.', '',
    '## Current, Consensus und Forward', '',
    'Der tatsächliche Current-Lauf behandelt alle zehn Engines. Vier bleiben BLOCKED; PARTIAL-Diagnostik darf nicht zum ELIGIBLE-Set werden. Qualified/Strong Consensus und vollständig qualifizierte aktuelle Kandidaten bleiben leer. Die privaten Matches sind keine Kaufempfehlung.', '',
    '## Zwanzig Abschlussfragen', '', ...FINAL_QUESTIONS.flatMap((q, i) => [`### ${i + 1}. ${q}`, '', answers[i], '']),
    '## Grenzen und Quellen', '',
    'Beobachtetes Panel, unzertifizierter historischer Markt-Nenner, keine breite historische Full-Class-Bindung, keine abschließende Terminal-Cash-Zertifizierung und kein ungesehener Holdout begrenzen jede Schlussfolgerung. Ein Source-Pilot oder eine bedingt freigegebene Accounting-Normalisierung stellt kein vollständiges PIT-Universum her.', '',
    'Offizielle SEC-Quellen: [API-Vertrag](https://www.sec.gov/search-filings/edgar-application-programming-interfaces), [Companyfacts](https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip), [Submissions](https://www.sec.gov/Archives/edgar/daily-index/bulkdata/submissions.zip). Der Residual-Faktor-Snapshot ist [revidiertes French-Research-Material](https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html), kein historischer as-known-Vintage.', '',
    'Die immutable Vorabentscheidung steht in `SUPERTRADER-METHOD-ELIGIBILITY.json`; Daten-/Execution-Verträge und Source-Pilot-Grenzen stehen in `SUPERTRADER_DATA_EXECUTION_CERTIFICATION.md`. Der Owner erhält vollständige private Rohdaten, exakte Zahlen, aktuelle Aktien, Review- und Vergleichsdetails.'];
  return lines.join('\n') + '\n';
}

function validOwnerEnvelope(file) {
  if (!file || !fs.existsSync(file)) throw new Error('VALID_OWNER_RESULTS_ENVELOPE_REQUIRED');
  const bytes = fs.readFileSync(file); if (bytes.length > 90 * 1024 * 1024) throw new Error('OWNER_COMPACT_ENVELOPE_BOUND_REQUIRED');
  const envelope = JSON.parse(bytes.toString('utf8'));
  if (envelope?.schema !== 'supertrader-sealed-1.0.0' || envelope.alg !== 'RSA-OAEP-256+A256GCM+gzip' ||
    !['wrappedKey', 'iv', 'tag', 'body'].every(k => typeof envelope[k] === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(envelope[k]))) throw new Error('VALID_OWNER_RESULTS_ENVELOPE_REQUIRED');
}
export function publishRerunPayload({outRoot = ROOT, ownerSealedPath, publish = false, ...inputs}) {
  const metadata = inputs.metadata ?? loadRerunPublicMetadata(outRoot), checked = {...inputs, metadata};
  const artifacts = buildRerunPublicArtifacts(checked), markdown = buildRerunMarkdown(checked, artifacts);
  if (!publish) return {status: 'REVIEWED_DRY_RUN_NO_FILES_WRITTEN', artifact_count: RERUN_PUBLIC_NAMES.length};
  validOwnerEnvelope(ownerSealedPath);
  const directory = path.join(path.resolve(outRoot), PUBLIC_DIR), docs = path.join(path.resolve(outRoot), 'docs');
  fs.mkdirSync(directory, {recursive: true}); fs.mkdirSync(docs, {recursive: true});
  for (const [name, artifact] of Object.entries(artifacts)) fs.writeFileSync(path.join(directory, name), JSON.stringify(artifact, null, 2) + '\n');
  fs.writeFileSync(path.join(docs, 'SUPERTRADER_FULL_TOURNAMENT_RERUN.md'), markdown);
  return {status: 'FINAL_REVIEWED_PUBLIC_ENUM_COUNT_DIRECTIONS_WRITTEN', artifact_count: RERUN_PUBLIC_NAMES.length};
}

// Object API supports bounded external shard assembly beyond V8's single-string
// limit. The file CLI is only for already bounded consolidated summaries.
export async function publishRerunFiles(options) {
  for (const k of ['historicalPath', 'controlPath', 'currentPath', 'numericReviewPath', 'redTeamReviewPath', 'finalReviewPath', 'outRoot']) if (!options[k]) throw new Error('EXPLICIT_REVIEWED_RERUN_FILES_REQUIRED');
  const historical = boundedJson(options.historicalPath), control = boundedJson(options.controlPath), current = boundedJson(options.currentPath);
  const numericReview = boundedJson(options.numericReviewPath, 64 * 1024 * 1024).value, redTeamReview = boundedJson(options.redTeamReviewPath, 64 * 1024 * 1024).value;
  const finalReview = boundedJson(options.finalReviewPath, 64 * 1024 * 1024).value, metadata = loadRerunPublicMetadata(options.outRoot);
  const bindings = {historicalInputSha256: historical.sha256, controlInputSha256: control.sha256, currentInputSha256: current.sha256,
    certificationFreezeHash: hash(JSON.stringify(historical.value.certificationFreeze)),
    eligibilityFileSha256: hash(fs.readFileSync(path.join(options.outRoot, PUBLIC_DIR, 'SUPERTRADER-METHOD-ELIGIBILITY.json')))};
  return publishRerunPayload({...options, historical: historical.value, control: control.value, current: current.value,
    numericReview, redTeamReview, finalReview, metadata, bindings, verifyFreeze: assertFreezeV2});
}
function flags(argv) {
  const names = ['historicalPath', 'controlPath', 'currentPath', 'numericReviewPath', 'redTeamReviewPath', 'finalReviewPath', 'outRoot', 'ownerSealedPath'];
  const out = {publish: false};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--publish') {out.publish = true; continue;}
    const name = argv[i].slice(2);
    if (!argv[i].startsWith('--') || !names.includes(name) || out[name] !== undefined || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('INVALID_RERUN_PUBLICATION_ARGUMENT');
    out[name] = argv[++i];
  }
  return out;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  Promise.resolve().then(() => publishRerunFiles(flags(process.argv.slice(2)))).then(status => process.stdout.write(JSON.stringify(status) + '\n'))
    .catch(() => {process.stderr.write('RERUN_PUBLICATION_FAILED\n'); process.exitCode = 1;});
}
