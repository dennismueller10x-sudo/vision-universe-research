/**
 * Unfrozen publication adapter. It does not calculate returns or rank methods.
 * All numerical provider metrics, security identifiers, prices, dates of
 * individual signals and current constituent lists stay in the private payload.
 * Public projections are explicit allowlists: method IDs, enums and counts.
 * CLI is dry-run unless --publish is present; final review is mandatory then.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const PUBLIC_DIR = 'scripts/supertrader/research/tournament';
const SCHEMA = 'supertrader-public-tournament-projection-1.0.0';
const enumValue = (value, allowed, fallback = 'PENDING') => allowed.includes(value) ? value : fallback;
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const array = value => Array.isArray(value) ? value : [];
const unique = values => [...new Set(values)];

export const FINAL_QUESTIONS = Object.freeze([
  'Welche Methoden sind historisch am überzeugendsten?',
  'Welche Methoden zeigen eine echte Signal-Edge?',
  'Welche Ergebnisse erklären sich vor allem durch Cash oder Exposure?',
  'Welche Methoden haben das beste risikoadjustierte Profil?',
  'Welche Methoden sind Regime-Spezialisten?',
  'Welche Legendary-Methoden sind reproduzierbar?',
  'Welche Legendary-Methoden bleiben diskretionär?',
  'Welche systematischen Methoden sind am überzeugendsten?',
  'Welche Methoden sind redundant?',
  'Welche aktuellen Aktien erfüllen die stärksten Methoden?',
  'Welche Aktien haben Multi-Method-Consensus?',
  'Welche drei bis sieben Methoden verdienen einen Deep Dive?',
  'Welche Methoden sollten prominent im Produkt erscheinen?',
  'Welche Methoden sollten sekundär erscheinen?',
  'Welche Methoden bleiben educational?',
  'Welche Forward-Ledgers sollten sofort starten?',
  'Welche Datenlücken blockieren?',
  'Welche Hypothesen entstehen aus der bereits gesehenen Historie?',
  'Was sollte der nächste Entwicklungsauftrag sein?',
  'Welche Methoden sollten aktuell nicht weiter finanziert werden?',
]);

export const PUBLIC_OUTPUT_NAMES = Object.freeze([
  'SUPERTRADER-IMPLEMENTED-CANDIDATES.json',
  'SUPERTRADER-TOURNAMENT-RESULTS.json',
  'SUPERTRADER-SIGNAL-QUALITY.json',
  'SUPERTRADER-RISK-MATRIX.json',
  'SUPERTRADER-REGIME-MATRIX.json',
  'SUPERTRADER-METHOD-OVERLAP.json',
  'SUPERTRADER-CURRENT-CANDIDATES.json',
  'SUPERTRADER-CURRENT-CONSENSUS.json',
  'SUPERTRADER-TIERING-FINAL.json',
  'SUPERTRADER-TOP-DEEP-DIVES.json',
  'SUPERTRADER-FEATURED-PRODUCT.json',
  'SUPERTRADER-FORWARD-LEDGER.json',
  'SUPERTRADER-LEGENDARY-NONREPRODUCIBLE.json',
  'SUPERTRADER-SYSTEMATIC-HIGH-CONFIDENCE.json',
]);

const TIERS = ['A', 'B', 'C', 'D'];
const CONFIDENCE = ['LOW', 'MEDIUM', 'HIGH', 'UNAVAILABLE'];
const SIGNAL = ['POSITIVE', 'NEGATIVE', 'NEUTRAL', 'INSUFFICIENT', 'UNAVAILABLE'];
const PORTFOLIO = ['ABOVE', 'SIMILAR', 'BELOW', 'UNAVAILABLE'];
const RISK = ['SHALLOWER', 'SIMILAR', 'DEEPER', 'UNAVAILABLE'];
const REVIEW = ['PASSED', 'FAILED', 'PENDING', 'BLOCKED', 'NOT_RUN'];
const SCAN = ['OK', 'AVAILABLE', 'READY', 'PARTIAL', 'DATA_GAP', 'BLOCKED_DATA', 'DATA_UNAVAILABLE', 'INSUFFICIENT_DATA', 'UNAVAILABLE'];
const SCAN_WITH_COUNT = ['OK', 'AVAILABLE', 'READY', 'PARTIAL'];
export const ENGINE_DOSSIER_MAP = Object.freeze({
  cross_sectional_momentum: 'cross_sectional_momentum', '52_week_high_effect': '52_week_high_effect',
  LOW_VOLATILITY: 'LOW_VOLATILITY', gross_profitability_novy_marx: 'gross_profitability_novy_marx',
  piotroski_value_fscore: 'piotroski_value_fscore', greenblatt_magic_formula: 'greenblatt_magic_formula',
  value_plus_momentum: 'value_plus_momentum', TURTLE_S2_EQUITY_DAILY: 'turtle',
  WEINSTEIN_STAGE_DAILY: 'stan_weinstein', KULLAMAGI_DAILY_ADAPTATION: 'kullamagi_breakout',
});
const REQUIRED_SUBJECT_DOSSIERS = Object.freeze([
  'MINERVINI', 'kullamagi_breakout', 'stan_weinstein', 'nicolas_darvas', 'william_oneil_canslim', 'david_ryan',
  'richard_dennis', 'turtle', 'ed_seykota', 'jesse_livermore', 'mark_ritchie', 'dan_zanger', 'marty_schwartz',
  'linda_raschke', 'morales_kacher', 'morales_kacher', 'richard_driehaus', 'gary_bielfeldt', 'william_eckhardt',
  'tom_basso', 'larry_hite', 'michael_marcus', 'bruce_kovner', 'paul_tudor_jones',
]);
const ANSWER_STATUS = ['RESOLVED', 'PRIVATE_ENCRYPTED', 'BLOCKED_DATA', 'PENDING_REVIEW', 'NOT_IDENTIFIED', 'RESEARCH_ONLY'];
const QUESTION_ENUMS = new Set([...TIERS, ...CONFIDENCE, ...SIGNAL, ...PORTFOLIO, ...RISK,
  'SEEN_HISTORICAL_DATA', 'HYPOTHESIS_GENERATING', 'NOT_CAUSALLY_IDENTIFIED',
  'NO_UNSEEN_HOLDOUT', 'NO_PROVEN_ALPHA', 'HIGH', 'MEDIUM', 'LOW',
  'PIT_FACTS_MISSING', 'PIT_MARKET_EQUITY_MISSING', 'PIT_SIC_MISSING',
  'PIT_FACTOR_SERIES_MISSING', 'ESTIMATES_REVISIONS_MISSING', 'EDUCATIONAL',
  'SOURCE_DEFINED_ADAPTATION', 'DISCRETIONARY', 'REPRODUCTION_PENDING',
  'FORWARD_TEST_RESEARCH_ONLY', 'GROUND_TRUTH_PENDING', 'PRODUCT_PENDING', 'DEFER',
]);

function loadJSON(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
export function loadPublicMetadata(root = REPO) {
  return {
    universe: loadJSON(path.join(root, PUBLIC_DIR, 'SUPERTRADER-FULL-METHOD-UNIVERSE.json')),
    freeze: loadJSON(path.join(root, PUBLIC_DIR, 'SUPERTRADER-METHOD-FREEZES.json')),
    sourceMap: loadJSON(path.join(root, PUBLIC_DIR, 'SUPERTRADER-LEGENDARY-SOURCE-MAP.json')),
  };
}

function context(payload = {}, review = {}, metadata) {
  if (!metadata?.freeze || !metadata?.universe) throw new Error('PUBLIC_METADATA_REQUIRED');
  const frozen = array(metadata.freeze.methods), dossiers = array(metadata.universe.candidates);
  const frozenIds = new Set(frozen.map(m => m.id)), dossierIds = new Set(dossiers.map(m => m.id));
  const knownIds = new Set([...frozenIds, ...dossierIds]);
  const approvedIds = value => unique(array(value).map(v => typeof v === 'string' ? v : v?.id).filter(id => knownIds.has(id)));
  const methodResults = array(payload.results);
  if (methodResults.some(r => !frozenIds.has(r.id)) || new Set(methodResults.map(r => r.id)).size !== methodResults.length) throw new Error('UNKNOWN_OR_DUPLICATE_RESULT_METHOD');
  if (methodResults.length && !payload.freeze) throw new Error('PAYLOAD_FREEZE_REQUIRED');
  if (payload.freeze && !isDeepStrictEqual(payload.freeze, metadata.freeze)) throw new Error('PAYLOAD_FREEZE_MISMATCH');
  const final = review.finalized === true && review.status === 'PASSED';
  const finalRows = array(review.finalRankings ?? review.methods);
  if (finalRows.some(r => !frozenIds.has(r.id)) || new Set(finalRows.map(r => r.id)).size !== finalRows.length) throw new Error('UNKNOWN_OR_DUPLICATE_REVIEW_METHOD');
  const reviewed = new Map(finalRows.map(r => [r.id, r]));
  if (final && methodResults.some(r => !reviewed.has(r.id))) throw new Error('FINAL_REVIEW_INCOMPLETE');
  const rows = frozen.map(method => {
    const measured = methodResults.find(r => r.id === method.id), r = final ? reviewed.get(method.id) : null;
    const blocked = method.historicalAdmission === 'BLOCKED_DATA';
    return {
      method_id: method.id, implemented: true, measured: !!measured,
      historical_admission: blocked ? 'BLOCKED_DATA' : 'ADMITTED_RESEARCH_ADAPTATION',
      fidelity: 'VU_ADAPTATION', review_status: blocked ? 'BLOCKED' : final && r ? 'PASSED' : 'PENDING',
      tier: blocked ? 'UNRANKED_DATA_BLOCKED' : r ? enumValue(r.tier, TIERS) : 'PENDING',
      confidence: r ? enumValue(r.confidence, CONFIDENCE, 'UNAVAILABLE') : blocked ? 'UNAVAILABLE' : 'PENDING',
      signal: r ? enumValue(r.signalClassification ?? r.signal, SIGNAL, 'UNAVAILABLE') : blocked ? 'UNAVAILABLE' : 'PENDING',
      portfolio: r ? enumValue(r.portfolioClassification ?? r.portfolio, PORTFOLIO, 'UNAVAILABLE') : blocked ? 'UNAVAILABLE' : 'PENDING',
      risk: r ? enumValue(r.riskClassification ?? r.risk, RISK, 'UNAVAILABLE') : blocked ? 'UNAVAILABLE' : 'PENDING',
      signal_count: measured ? count(measured.signalMetrics?.totalSignals ?? measured.run?.signals?.length) : null,
      evidence_kind: measured ? 'SEEN_HISTORICAL_DATA' : 'UNMEASURED',
    };
  });
  const blocked = array(metadata.freeze.dataBlocked).map(m => ({
    method_id: knownIds.has(m.id) ? m.id : null,
    implemented: frozenIds.has(m.id), measured: false, status: 'BLOCKED_DATA',
    reason: ['gross_profitability_novy_marx', 'piotroski_value_fscore', 'greenblatt_magic_formula', 'value_plus_momentum'].includes(m.id)
      ? 'CERTIFIED_ANNUAL_FACTS_AND_DIRECT_MARKET_EQUITY_MISSING'
      : m.id === 'residual_momentum' ? 'CERTIFIED_PIT_FACTOR_SERIES_MISSING' : 'CERTIFIED_PIT_SIC_AND_MARKET_EQUITY_MISSING',
  }));
  const scans = array(payload.currentScans).filter(s => frozenIds.has(s.id)).map(s => ({
    method_id: s.id, status: enumValue(s.status, SCAN, 'UNAVAILABLE'),
    match_count: SCAN_WITH_COUNT.includes(s.status) ? count(s.numberMatches ?? array(s.candidates).length) : null,
    identifiers: 'PRIVATE_ENCRYPTED', metrics: 'PRIVATE_ENCRYPTED',
  }));
  const declared = metadata.universe.counts ?? {};
  const excludedIds = new Set(array(declared.reference_or_excluded_ids));
  const educationalIds = new Set(final ? approvedIds(review.educational) : []);
  const dossierRows = dossiers.map(d => {
    const engine = frozen.find(m => (ENGINE_DOSSIER_MAP[m.id] ?? m.id) === d.id);
    const row = engine && rows.find(r => r.method_id === engine.id);
    const blockedDossier = blocked.some(m => m.method_id === d.id || engine && m.method_id === engine.id);
    const isExcluded = excludedIds.has(d.id) || d.count_as_serious_dossier === false;
    const isLegacy = ['VU_NATIVE', 'VU_ADAPTATION'].includes(d.type) && !engine;
    const isDiscretionaryLegendary = /TRADER/.test(d.type ?? '') && ['LOW', 'NOT_REPRODUCIBLE'].includes(d.reproducibility);
    const disposition = isExcluded ? 'REFERENCE_OR_EXCLUDED' : blockedDossier ? 'DEFERRED_RESEARCH' :
      row?.measured ? final ? 'REVIEWED_RESEARCH_ADAPTATION' : 'PENDING_REVIEW' :
      isLegacy ? 'UNTESTED_LEGACY' : educationalIds.has(d.id) || isDiscretionaryLegendary ? 'EDUCATIONAL' : 'DEFERRED_RESEARCH';
    return {
      dossier_id: d.id, engine_method_id: engine?.id ?? null,
      type: enumValue(d.type, ['SYSTEMATIC_STRATEGY', 'SYSTEMATIC_ACADEMIC', 'SYSTEMATIC_PRACTITIONER', 'ACADEMIC_SYSTEMATIC',
        'REAL_TRADER_METHOD', 'REAL_TRADER', 'TRADER', 'TRADER_SYSTEM', 'TRADER_TECHNIQUE', 'REAL_TRADER_SETUP',
        'VU_NATIVE', 'VU_ADAPTATION', 'REFERENCE_CONTAINER', 'HISTORICAL_STRATEGY_ARCHETYPE', 'TRADER_IDENTITY_REFERENCE'], 'UNCLASSIFIED'),
      source_coverage: enumValue(d.source_coverage, ['HIGH', 'MEDIUM', 'LOW'], 'UNAVAILABLE'),
      reproducibility: enumValue(d.reproducibility, ['HIGH', 'MEDIUM', 'LOW', 'NOT_REPRODUCIBLE'], 'UNAVAILABLE'),
      source_triage_group: enumValue(d.group ?? d.proposed_group, ['A', 'B', 'C'], 'UNAVAILABLE'),
      implementation_status: engine ? 'IMPLEMENTED_RESEARCH_ONLY' : 'NOT_IMPLEMENTED',
      measured: !!row?.measured, disposition,
      tier_scope: blockedDossier ? 'UNRANKED_DATA_BLOCKED' : row?.measured ? row.tier :
        isExcluded ? 'REFERENCE_OR_EXCLUDED' : ['EDUCATIONAL', 'UNTESTED_LEGACY'].includes(disposition) ? 'D_EDUCATIONAL_OR_UNTESTED' : 'UNRANKED_DEFERRED_RESEARCH',
    };
  });
  const totals = {
    requested_person_or_curriculum_subjects: REQUIRED_SUBJECT_DOSSIERS.length,
    requested_person_or_curriculum_subjects_covered: REQUIRED_SUBJECT_DOSSIERS.filter(id => dossierIds.has(id)).length,
    requested_subject_distinct_dossier_ids: unique(REQUIRED_SUBJECT_DOSSIERS.filter(id => dossierIds.has(id))).length,
    researched_rows: dossiers.length,
    serious_external_candidates: count(declared.serious_external_candidates) ?? dossiers.filter(d => d.count_as_external_candidate).length,
    legendary_dossiers: count(declared.legendary_candidates) ?? (array(metadata.sourceMap?.legendary_candidate_ids).filter(id => !excludedIds.has(id)).length || dossiers.filter(d => /TRADER/.test(d.type ?? '') && d.count_as_serious_dossier !== false).length),
    systematic_dossiers: count(declared.systematic_candidates) ?? dossiers.filter(d => /SYSTEMATIC|ACADEMIC/.test(d.type ?? '') && d.count_as_serious_dossier !== false).length,
    baseline_original_rows: count(declared.baseline_dossiers_unchanged) ?? array(metadata.universe.baseline_pr588?.candidates).length,
    active_expanded_rows: dossiers.length,
    engine_definitions_implemented: frozen.length,
    historical_participants_planned: frozen.filter(m => m.historicalAdmission === 'ADMITTED_RESEARCH_ADAPTATION').length,
    historical_participants_measured: methodResults.length,
    blocked_candidates_total: blocked.length,
    blocked_implemented_engines: blocked.filter(m => m.implemented).length,
    blocked_candidates_without_engines: blocked.filter(m => !m.implemented).length,
    rejected_before_implementation: dossierRows.filter(d => d.source_triage_group === 'C' && d.implementation_status === 'NOT_IMPLEMENTED').length,
    current_methods_scanned: scans.length,
    tier_A: rows.filter(r => r.measured && r.tier === 'A').length,
    tier_B: rows.filter(r => r.measured && r.tier === 'B').length,
    tier_C: rows.filter(r => r.measured && r.tier === 'C').length,
    tier_D_measured: rows.filter(r => r.measured && r.tier === 'D').length,
    unranked_data_blocked_implemented: rows.filter(r => r.tier === 'UNRANKED_DATA_BLOCKED').length,
    dossier_tier_D_educational: dossierRows.filter(r => r.disposition === 'EDUCATIONAL').length,
    dossier_tier_D_legacy_unmeasured: dossierRows.filter(r => r.disposition === 'UNTESTED_LEGACY').length,
    tiering_pending: rows.filter(r => r.tier === 'PENDING').length,
  };
  return {payload, review, metadata, rows, blocked, scans, totals, dossierRows, final, approvedIds, knownIds};
}

function answerRows(ctx) {
  const supplied = array(ctx.review.finalAnswers);
  return FINAL_QUESTIONS.map((question, i) => {
    const q = i + 1, answer = ctx.final ? supplied.find(a => a.questionId === q || a.question_id === q) : null;
    let status = answer ? enumValue(answer.answerStatus ?? answer.status, ANSWER_STATUS, 'PENDING_REVIEW') : 'PENDING_REVIEW';
    let method_ids = answer ? ctx.approvedIds(answer.methodIds ?? answer.method_ids) : [];
    let enums = answer ? array(answer.enumValues ?? answer.enums).filter(e => QUESTION_ENUMS.has(e)) : [];
    if ([10, 11].includes(q)) { status = ctx.scans.length && !ctx.scans.some(s => SCAN_WITH_COUNT.includes(s.status)) ? 'BLOCKED_DATA' : 'PRIVATE_ENCRYPTED'; method_ids = []; enums = []; }
    if (q === 17) { status = 'BLOCKED_DATA'; method_ids = ctx.blocked.map(x => x.method_id).filter(Boolean); enums = ['PIT_FACTS_MISSING', 'PIT_MARKET_EQUITY_MISSING', 'PIT_SIC_MISSING', 'PIT_FACTOR_SERIES_MISSING']; }
    if (q === 18) { status = 'RESEARCH_ONLY'; enums = ['SEEN_HISTORICAL_DATA', 'HYPOTHESIS_GENERATING', 'NO_UNSEEN_HOLDOUT', 'NO_PROVEN_ALPHA']; }
    if (q === 3 && !answer) { status = 'NOT_IDENTIFIED'; enums = ['NOT_CAUSALLY_IDENTIFIED']; }
    return {question_id: q, status, method_ids, enums};
  });
}

function selections(ctx, name) {
  const ids = ctx.final ? ctx.approvedIds(ctx.review[name]) : [];
  return {status: ctx.final ? ids.length ? 'REVIEWED_RESEARCH_PRIORITY' : 'NONE_QUALIFIED' : 'PENDING_REVIEW', method_ids: ids, performance_ranking_claim: false};
}

function executiveHighlights(ctx) {
  const names = ['strongestSignal', 'bestPortfolio', 'bestDrawdown', 'bestRegimeSpecialist', 'mostReproducibleLegendary', 'bestSystematic'];
  return {
    status: ctx.final ? 'REVIEWED_RESEARCH_ASSESSMENT' : 'PENDING_REVIEW',
    top_deep_dives: selections(ctx, 'topDeepDives'),
    methods: Object.fromEntries(names.map(name => [name, ctx.final ? ctx.approvedIds(ctx.review.executiveHighlights?.[name]) : []])),
    best_current_candidates: 'PRIVATE_ENCRYPTED', highest_consensus: 'PRIVATE_ENCRYPTED',
  };
}

/** Explicit projections only: never copy raw metric, ticker, score or reason objects. */
export function buildPublicArtifacts(payload = {}, review = {}, metadata) {
  const ctx = context(payload, review, metadata);
  const envelope = body => ({schema: SCHEMA, research_only: true, numerical_metrics: 'PRIVATE_ENCRYPTED', current_security_identifiers: 'PRIVATE_ENCRYPTED', final_review: ctx.final ? 'PASSED' : 'PENDING', ...body});
  const plainRows = ctx.rows.map(({signal_count, ...r}) => r);
  const riskRows = ctx.rows.map(r => ({method_id: r.method_id, status: r.review_status, risk: r.risk, confidence: r.confidence}));
  const regimes = ctx.rows.map(r => {
    const supplied = ctx.final ? array(review.regimeAssessments).find(x => x.id === r.method_id) : null;
    return {method_id: r.method_id, status: supplied ? 'REVIEWED' : r.measured ? 'PENDING_REVIEW' : 'BLOCKED_DATA',
      specialist_regimes: array(supplied?.regimes).filter(x => ['BULL', 'BEAR', 'SIDEWAYS', 'HIGH_VOL', 'LOW_VOL', 'MID_VOL', 'EARLY', 'LATE'].includes(x)), numerical_metrics: 'PRIVATE_ENCRYPTED'};
  });
  const overlap = array(payload.overlap).filter(x => ctx.knownIds.has(x.methodA) && ctx.knownIds.has(x.methodB)).map(x => {
    const reviewed = ctx.final ? array(review.overlapAssessments).find(r => r.methodA === x.methodA && r.methodB === x.methodB) : null;
    return {method_a: x.methodA, method_b: x.methodB, redundancy: reviewed ? enumValue(reviewed.redundancy, ['HIGH', 'MEDIUM', 'LOW', 'UNAVAILABLE'], 'UNAVAILABLE') : 'PENDING', numerical_overlap: 'PRIVATE_ENCRYPTED'};
  });
  const strongestIds = ctx.rows.filter(r => r.measured && ['A', 'B'].includes(r.tier)).map(r => r.method_id);
  const adequateScans = ctx.scans.filter(s => strongestIds.includes(s.method_id) && SCAN_WITH_COUNT.includes(s.status));
  const currentStrongConsensus = array(payload.consensus?.strongMethods);
  // The private run's preliminary consensus cannot establish final consensus.
  // Root must recompute using final Tier A/B method IDs and supply only its count.
  const anyCurrentScanAvailable = ctx.scans.some(s => SCAN_WITH_COUNT.includes(s.status));
  const finalConsensusCount = ctx.final && review.finalConsensusRecomputed === true && anyCurrentScanAvailable ? count(review.finalConsensusCount) : null;
  const ledger = array(payload.forwardLedger?.methods).filter(m => ctx.knownIds.has(m.id)).map(m => ({
    method_id: m.id, records_count: array(m.records).length,
    state: 'PREPARED_NOT_LIVE', historical_snapshot_is_forward_signal: false,
    priority: ctx.final ? ctx.approvedIds(review.forwardPriority).includes(m.id) ? 'HIGH' : 'LOW' : 'PENDING',
    observations: 'PRIVATE_ENCRYPTED', chronology: 'POST_FREEZE_ONLY',
  }));
  const legendary = array(metadata.universe.candidates).filter(d => /TRADER/.test(d.type ?? '') && ['LOW', 'NOT_REPRODUCIBLE'].includes(d.reproducibility)).map(d => ({method_id: d.id, reproducibility: d.reproducibility, discretion: enumValue(d.discretion, ['LOW', 'MEDIUM', 'HIGH'], 'UNAVAILABLE'), product_role: 'EDUCATIONAL'}));
  const systematic = array(metadata.universe.candidates).filter(d => /SYSTEMATIC|ACADEMIC/.test(d.type ?? '') && d.source_coverage === 'HIGH' && d.reproducibility === 'HIGH').map(d => ({method_id: d.id, source_coverage: 'HIGH', reproducibility: 'HIGH', real_trade_ground_truth: 'NONE', historical_admission: ctx.rows.find(r => r.method_id === d.id)?.historical_admission ?? 'NOT_IMPLEMENTED', original_paper_returns_inherited: false}));
  const out = {
    'SUPERTRADER-IMPLEMENTED-CANDIDATES.json': envelope({counts: ctx.totals, methods: plainRows, dossier_rows: ctx.dossierRows, data_blocked: ctx.blocked}),
    'SUPERTRADER-TOURNAMENT-RESULTS.json': envelope({counts: ctx.totals, executive_highlights: executiveHighlights(ctx), history: 'SEEN_HISTORICAL_DATA', methods: ctx.rows, final_questions: answerRows(ctx)}),
    'SUPERTRADER-SIGNAL-QUALITY.json': envelope({methods: ctx.rows.map(r => ({method_id: r.method_id, signal: r.signal, confidence: r.confidence, signal_count: r.signal_count, inference: 'DESCRIPTIVE_HYPOTHESIS_NOT_PROVEN_ALPHA'}))}),
    'SUPERTRADER-RISK-MATRIX.json': envelope({methods: riskRows}),
    'SUPERTRADER-REGIME-MATRIX.json': envelope({methods: regimes}),
    'SUPERTRADER-METHOD-OVERLAP.json': envelope({pair_count: overlap.length, pairs: overlap, independence_proven: false}),
    'SUPERTRADER-CURRENT-CANDIDATES.json': envelope({method_count: ctx.scans.length, methods: ctx.scans, strongest_method_ids: strongestIds, strongest_methods_with_available_scan_count: adequateScans.length, matches: 'PRIVATE_ENCRYPTED'}),
    'SUPERTRADER-CURRENT-CONSENSUS.json': envelope({status: ctx.scans.length && !anyCurrentScanAvailable ? 'BLOCKED_DATA' : finalConsensusCount !== null ? 'FINAL_METHOD_SET_RECOMPUTED' : 'PENDING_FINAL_METHOD_SET', strongest_method_ids: strongestIds, final_consensus_candidate_count: finalConsensusCount, preliminary_diagnostic_candidate_count: !ctx.final && anyCurrentScanAvailable && Array.isArray(payload.consensus?.strongMethods) ? count(currentStrongConsensus.length) : null, candidate_identifiers: 'PRIVATE_ENCRYPTED', independent_trading_score: false}),
    'SUPERTRADER-TIERING-FINAL.json': envelope({status: ctx.final ? 'FINAL_RESEARCH_TIERING' : 'PENDING_REVIEW', counts: ctx.totals, methods: plainRows, dossier_rows: ctx.dossierRows, data_blocked: ctx.blocked}),
    'SUPERTRADER-TOP-DEEP-DIVES.json': envelope(selections(ctx, 'topDeepDives')),
    'SUPERTRADER-FEATURED-PRODUCT.json': envelope({featured: selections(ctx, 'featured'), secondary: selections(ctx, 'secondary'), educational: selections(ctx, 'educational'), readiness: 'PRODUCT_PENDING'}),
    'SUPERTRADER-FORWARD-LEDGER.json': envelope({status: 'PREPARED_NOT_LIVE', method_count: ledger.length, methods: ledger}),
    'SUPERTRADER-LEGENDARY-NONREPRODUCIBLE.json': envelope({method_count: legendary.length, methods: legendary}),
    'SUPERTRADER-SYSTEMATIC-HIGH-CONFIDENCE.json': envelope({method_count: systematic.length, methods: systematic, confidence_scope: 'SOURCE_AND_REPRODUCIBILITY_NOT_PROVEN_ALPHA'}),
  };
  assertPublicProjection(out, ctx.knownIds);
  return out;
}

export function assertPublicProjection(artifacts, knownIds = new Set()) {
  const forbidden = /^(ticker|tickers|price|prices|close|open|high|low|volume|score|weight|signalAsOf|asOf|cagr|sharpe|maxDrawdown|equity|excess|pnl|returns?|mean|median|correlation|jaccard|dataFingerprint|currentFingerprint|issuerCik|candidates)$/i;
  function visit(value, key = '', location = '') {
    if (forbidden.test(key)) throw new Error(`PRIVATE_KEY_IN_PUBLIC_PROJECTION:${location}`);
    if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) throw new Error(`NONCOUNT_NUMBER_IN_PUBLIC_PROJECTION:${location}`);
    if (typeof value === 'string' && !knownIds.has(value) && !/^[A-Z0-9_]+$/.test(value) && value !== SCHEMA) throw new Error(`NONENUM_STRING_IN_PUBLIC_PROJECTION:${location}`);
    if (Array.isArray(value)) value.forEach((v, i) => visit(v, '', `${location}[${i}]`));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => visit(v, k, `${location}.${k}`));
  }
  Object.entries(artifacts).forEach(([name, artifact]) => {
    if (!PUBLIC_OUTPUT_NAMES.includes(name)) throw new Error('UNKNOWN_PUBLIC_ARTIFACT_NAME');
    visit(artifact, '', name);
  });
  return true;
}

export function buildPublicMarkdown(payload = {}, review = {}, metadata, ownersealedPath = null) {
  const ctx = context(payload, review, metadata), answers = answerRows(ctx), highlights = executiveHighlights(ctx);
  const lines = ['# Supertrader Full Tournament', '',
    `Status: **${ctx.final ? 'Review abgeschlossen; Research-Tiering' : 'PENDING_REVIEW'}**. Alle Methoden sind Research-Artefakte und ausdrücklich VU Adaptations.`, '',
    `${ctx.totals.serious_external_candidates} ernsthafte externe Kandidaten; ${ctx.totals.active_expanded_rows} aktive Universe-Zeilen; ${ctx.totals.legendary_dossiers} Trader-/Curriculum-Dossiers und ${ctx.totals.systematic_dossiers} systematische Dossiers. Diese Typen sind keine unabhängigen Strategy-Edges.`, '',
    `${ctx.totals.requested_person_or_curriculum_subjects_covered}/${ctx.totals.requested_person_or_curriculum_subjects} geforderte Personen-/Curriculum-Subjects sind abgedeckt, über ${ctx.totals.requested_subject_distinct_dossier_ids} unterschiedliche Dossier-IDs. Das ist keine Zählung einzigartiger Personen: Gil Morales und Chris Kacher teilen ein Methoden-Dossier; das Original-Turtle-Curriculum ist ein eigener Subject.`, '',
    `${ctx.totals.engine_definitions_implemented} Engine-Definitionen; ${ctx.totals.historical_participants_planned} zugelassene historische Participants; ${ctx.totals.historical_participants_measured} tatsächlich gemessene Participants. ${ctx.totals.blocked_candidates_total} Kandidaten bleiben datenblockiert: ${ctx.totals.blocked_implemented_engines} besitzen eine Formel-Engine, ${ctx.totals.blocked_candidates_without_engines} besitzen keine zugelassene Engine.`, '',
    `Die eingefrorene ursprüngliche Baseline enthält ${ctx.totals.baseline_original_rows} unveränderte Zeilen. Das aktive Universe erweitert und ergänzt andere Zeilen; Minervini bleibt exakt unverändert. Vorhandene Pipeline oder aktuelle Fundamentals belegen keine historischen PIT-Facts.`, '',
    'Öffentlich stehen ausschließlich Methoden-IDs, Enums und Counts. Numerische Provider-Metriken, aktuelle Aktien, Preise und Signal-IDs stehen ausschließlich im privaten verschlüsselten Report. Fehlende Daten bleiben fehlend; null bedeutet unbekannt oder blockiert.', '',
    'Historie: SEEN_HISTORICAL_DATA. Die Auswertung erzeugt Hypothesen; sie ist kein ungesehener Holdout, kein unabhängiger Alpha-Beweis und kein Beleg einer vollständigen Legendary-Replication. Cash-/Exposure-Attribution ist beschreibend; Sizing und Exit sind nicht kausal identifiziert.', '',
    '## Executive Counts', '', '| Dimension | Count |', '|---|---:|',
    ...Object.entries(ctx.totals).map(([name, n]) => `| ${name} | ${n} |`), '',
    '## Executive-Auswahl', '',
    `Top Deep Dives: ${highlights.top_deep_dives.method_ids.length ? highlights.top_deep_dives.method_ids.join(', ') : ctx.final ? 'NONE_QUALIFIED' : 'PENDING_REVIEW'}.`, '',
    ...Object.entries(highlights.methods).map(([name, ids]) => `${name}: ${ids.length ? ids.join(', ') : ctx.final ? 'NONE_QUALIFIED' : 'PENDING_REVIEW'}.`), '',
    'Beste aktuelle Kandidaten und höchster Aktien-Consensus: PRIVATE_ENCRYPTED; blockierte oder fehlende Scans sind keine beobachteten null Treffer.', '',
    'Tier-Counts beziehen sich separat auf gemessene Methoden. Datenblockierte Methoden bleiben UNRANKED_DATA_BLOCKED; sie erhalten kein historisches Tier D. Educational-Dossiers und ungemessene Legacy-Methoden haben eigene Dossier-Counts. Eine vorläufige Null bei Tier A/B ist vor Abschluss des Reviews keine negative Performance-Aussage.', '',
    '## Methodenstatus', '', '| Methode | Messung | Tier | Signal | Portfolio | Risk | Confidence |', '|---|---|---|---|---|---|---|',
    ...ctx.rows.map(r => `| ${r.method_id} | ${r.measured ? 'MEASURED' : r.historical_admission} | ${r.tier} | ${r.signal} | ${r.portfolio} | ${r.risk} | ${r.confidence} |`), '',
    '## Vollständige Universe-Dispositionen', '', '| Dossier | Research-Engine | Disposition | Tier-Scope |', '|---|---|---|---|',
    ...ctx.dossierRows.map(d => `| ${d.dossier_id} | ${d.engine_method_id ?? 'NOT_IMPLEMENTED'} | ${d.disposition} | ${d.tier_scope} |`), '',
    '## Zwanzig finale Fragen', '',
  ];
  answers.forEach((a, i) => {
    lines.push(`### ${i + 1}. ${FINAL_QUESTIONS[i]}`, '', `Status: **${a.status}**.`, '');
    if (a.method_ids.length) lines.push(`Methoden: ${a.method_ids.join(', ')}.`, '');
    if (a.enums.length) lines.push(`Einordnung: ${a.enums.join(', ')}.`, '');
    if ([10, 11].includes(i + 1)) lines.push('Aktuelle Aktien-/Signal-Identitäten und numerische Details sind ausschließlich privat verschlüsselt verfügbar. Ein blockierter Scan wird nicht als null Treffer interpretiert.', '');
    else if (a.status === 'PENDING_REVIEW') lines.push('Der Lead beantwortet diese Frage nach unabhängigem Review. Aus vorläufigen Rankings wird keine finale Empfehlung erzeugt.', '');
  });
  lines.push('## Grenzen und nächster Schritt', '',
    'PIT-Annual-Facts mit Concept-/Unit-Zertifizierung, direkte historische Market Equity, historische SIC-/Industry-Zuordnung und zertifizierte Faktorserien fehlen für blockierte Methoden. Estimates/Revisions und tatsächliche Event-Timestamps bleiben eigene Daten-Gates.', '',
    'Die aktuelle Snapshot-Liste ist kein post-freeze Forward-Signal. Forward-Ledgers sind PREPARED_NOT_LIVE; nur spätere chronologische Beobachtungen ohne Regeländerung zählen. Keine Live-Orders, Core-Migration oder automatische Veröffentlichung von Provider-Daten.', '',
    'Top Deep Dives, Produktrollen und die nächste Finanzierung sind Lead-Entscheidungen nach Review; keine automatische Auswahl anhand von Scores.', '',
    '## Private Details', '', ownersealedPath ? 'Ein separat bereitgestelltes Owner-Sealed-Artefakt enthält die privaten Detailergebnisse.' : 'Owner-Sealed-Artefakt: PENDING. Öffentlich werden keine Rohdaten oder entschlüsselten Ergebnisse abgelegt.', '',
    '## Artefakte', '', ...PUBLIC_OUTPUT_NAMES.map(n => `- ${PUBLIC_DIR}/${n}`), '',
    'Vorhandene Source-Artefakte FULL-METHOD-UNIVERSE, LEGENDARY-SOURCE-MAP, REAL-TRADER-TRACK-RECORD-EVIDENCE und METHOD-FREEZES bleiben unverändert. Ihre Quellenbasis ist keine Validierung aktueller Strategy-Performance.', '');
  return lines.join('\n');
}

function privateCell(value) {
  return String(value ?? 'UNAVAILABLE').replaceAll('|', '\\|').replaceAll('\n', '<br>').replaceAll('\r', '');
}
function privateNumber(value, style = 'number') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'UNAVAILABLE';
  if (style === 'percent') return `${(value * 100).toFixed(2)}%`;
  if (style === 'count') return Number.isSafeInteger(value) ? String(value) : 'INVALID_COUNT';
  return value.toLocaleString('en-US', {maximumFractionDigits: 4});
}
function privateTable(headers, rows) {
  return [`| ${headers.map(privateCell).join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map(r => `| ${r.map(privateCell).join(' | ')} |`), ''];
}
function boundedPrivateValue(value, depth = 0) {
  if (typeof value === 'string') return value.slice(0, 500);
  if (!value || typeof value !== 'object') return value;
  if (depth >= 4) return Array.isArray(value) ? `[${value.length} nested items; full private JSON]` : '[nested object; full private JSON]';
  if (Array.isArray(value)) return [...value.slice(0, 8).map(v => boundedPrivateValue(v, depth + 1)), ...(value.length > 8 ? [`${value.length - 8} further items; full private JSON`] : [])];
  return Object.fromEntries(Object.entries(value).slice(0, 20).map(([k, v]) => [k, boundedPrivateValue(v, depth + 1)]));
}
function privateTrace(value) {
  if (value == null) return 'UNAVAILABLE';
  return JSON.stringify(boundedPrivateValue(value)).slice(0, 1600);
}
function privateFileLink(label, value) {
  if (!value) return `${label}: NOT_LINKED; pass the corresponding private file path to the builder.`;
  const absolute = path.resolve(value), target = absolute.replaceAll('>', '%3E').replaceAll('\n', '%0A').replaceAll('\r', '%0D');
  return `[${label}](<${target}>)`;
}

/** Human-readable provider-derived detail. Called only for an outside-repo destination. */
export function buildPrivateMarkdown(payload = {}, review = {}, options = {}) {
  const results = array(payload.results), finalRows = array(review.finalRankings ?? review.methods);
  const candidateLimit = count(options.maxCandidatesPerMethod) ?? 20, consensusLimit = count(options.maxConsensusRows) ?? 100;
  const lines = ['# Supertrader Full Tournament — PRIVATE', '',
    'Provider-derived numerical metrics and security identities. Keep private. This report formats supplied measurements; it calculates no new returns and changes no rules, rankings or parameters.', '',
    `Review: **${review.finalized === true && review.status === 'PASSED' ? 'FINAL_REVIEW_PASSED' : 'PENDING_REVIEW'}**. Historical results are SEEN_HISTORICAL_DATA, hypothesis-generating and subject to terminal/cost scenarios. No unseen holdout or independent alpha proof.`, '',
    privateFileLink('Full private payload JSON', options.inputPath), '',
    privateFileLink('Full private review JSON', options.reviewPath), '',
    'Large curves, every execution and complete rule traces stay in those private JSON files. This Markdown contains compact comparisons and bounded candidate lists; display truncation is not a data filter or strategy decision.', '',
    '## Portfolio comparison', '',
  ];
  const columns = [{id: 'SPY_BENCHMARK', p: payload.benchmarkMetrics ?? {}}, ...results.map(r => ({id: r.id, p: r.portfolioMetrics ?? {}}))];
  const metrics = [
    ['Status', 'status', 'text'], ['From', 'from', 'text'], ['To', 'to', 'text'], ['Observations', 'observations', 'count'],
    ['Return observations', 'returnObservations', 'count'], ['Elapsed days', 'elapsedDays', 'count'],
    ['Initial capital', 'initialCapital'], ['Final equity', 'finalEquity'], ['Total return', 'totalReturn', 'percent'],
    ['CAGR', 'cagr', 'percent'], ['Max drawdown', 'maxDrawdown', 'percent'], ['Annualized volatility', 'annualizedVolatility', 'percent'],
    ['Sharpe (risk-free 0)', 'sharpe'], ['Average exposure', 'averageExposure', 'percent'], ['Median exposure', 'medianExposure', 'percent'],
    ['Average holdings', 'averageHoldings'], ['Median holdings', 'medianHoldings'], ['Maximum holdings', 'maxHoldings', 'count'],
    ['Total turnover', 'turnover'], ['Annualized turnover', 'turnoverAnnualized'], ['Turnover coverage', 'turnoverCoverage', 'text'],
    ['Execution costs', 'executionCosts'],
  ];
  lines.push(...privateTable(['Metric', ...columns.map(c => c.id)], metrics.map(([label, key, style]) =>
    [label, ...columns.map(c => style === 'text' ? c.p[key] ?? 'UNAVAILABLE' : privateNumber(c.p[key], style))])));
  lines.push('## Realized exit records', '', 'Counts and win rates include partial exits. Each record represents an allocated position exit, rather than an independent complete round trip. P&L is already net as supplied by the runner; transaction costs are reporting fields and are not subtracted a second time.', '');
  const tradeMetrics = [['Realized exit records', 'n', 'count'], ['Supplied exit records', 'supplied', 'count'], ['Invalid P&L count', 'invalidPnl', 'count'],
    ['Net P&L', 'pnl'], ['Win rate', 'winRate', 'percent'], ['Average win', 'averageWin'], ['Average loss', 'averageLoss'],
    ['Average exit-record return', 'averageReturnPct', 'percent'], ['Median exit-record return', 'medianReturnPct', 'percent'],
    ['Profit factor', 'profitFactor'], ['Entry capital basis', 'entryCapitalBasis'], ['Execution costs', 'executionCosts']];
  lines.push(...privateTable(['Metric', ...results.map(r => r.id)], tradeMetrics.map(([label, key, style]) =>
    [label, ...results.map(r => privateNumber(r.portfolioMetrics?.trades?.[key], style))])));
  lines.push('## Final and preliminary evidence', '', ...privateTable(['Method', 'Review state', 'Tier', 'Confidence', 'Signal', 'Portfolio', 'Risk', 'Rubric score'], results.map(r => {
    const final = review.finalized === true && review.status === 'PASSED' ? finalRows.find(x => x.id === r.id) : null;
    const ranking = final ?? r.ranking ?? {};
    return [r.id, final ? 'FINAL_REVIEWED' : 'PRELIMINARY_ONLY', ranking.tier ?? 'PENDING', ranking.confidence ?? 'UNAVAILABLE',
      ranking.signalClassification ?? ranking.signal ?? 'UNAVAILABLE', ranking.portfolioClassification ?? ranking.portfolio ?? 'UNAVAILABLE',
      ranking.riskClassification ?? ranking.risk ?? 'UNAVAILABLE', privateNumber(ranking.score)];
  })));
  lines.push('## Signals, exposure, regimes and sensitivities by method', '');
  for (const result of results) {
    lines.push(`### ${result.id}`, '', `Signal status: ${result.signalMetrics?.status ?? 'UNAVAILABLE'}. Inference remains descriptive; overlapping forward windows are not independent observations.`, '',
      '#### Forward returns and SPY-matched excess', '',
      ...privateTable(['Sessions', 'N return', 'N excess', 'Censored', 'Missing', 'Mean return', 'Median return', 'Hit rate', 'Mean excess', 'Median excess', 'Excess hit rate'], [21, 63, 126].map(h => {
        const s = result.signalMetrics?.horizons?.[h] ?? {};
        return [h, privateNumber(s.n, 'count'), privateNumber(s.nExcess, 'count'), privateNumber(s.censored, 'count'), privateNumber(s.missing, 'count'),
          ...['meanReturn', 'medianReturn', 'hitRate', 'meanExcess', 'medianExcess', 'excessHitRate'].map(k => privateNumber(s[k], 'percent'))];
      })), '#### Tails, excursions and month-cluster inference', '',
      ...privateTable(['Sessions', 'Left tail', 'Right tail', 'Excess left', 'Excess right', 'Mean MFE', 'Median MFE', 'Mean MAE', 'Median MAE', 'Month clusters', 'Cluster t', 'HAC t', 'HAC SE'], [21, 63, 126].map(h => {
        const s = result.signalMetrics?.horizons?.[h] ?? {};
        return [h, ...['leftTail', 'rightTail', 'excessLeftTail', 'excessRightTail'].map(k => privateNumber(s[k], 'percent')),
          privateNumber(s.meanMfe, 'percent'), privateNumber(s.mfe?.median, 'percent'), privateNumber(s.meanMae, 'percent'), privateNumber(s.mae?.median, 'percent'),
          privateNumber(s.clusters, 'count'), privateNumber(s.clusterT ?? s.descriptiveT), privateNumber(s.hacT), privateNumber(s.hacStandardError)];
      })), 'The tail convention and inference provenance are retained in the private JSON. HAC is descriptive and does not correct multiplicity or create an unseen holdout.', '',
      '#### Exposure distribution', '',
      ...privateTable(['Session-exposure bucket', 'Sessions'], Object.entries(result.portfolioMetrics?.exposureBuckets ?? {}).map(([label, n]) => [label, privateNumber(n, 'count')])),
      ...privateTable(['Exposure share', 'Fraction of observations'], Object.entries(result.portfolioMetrics?.exposureBreakdown ?? {}).map(([label, fraction]) => [label, privateNumber(fraction, 'percent')])),
      '#### Regime-conditioned signal evidence (63 sessions)', '',
      ...privateTable(['Dimension', 'Regime', 'N excess', 'Clusters', 'Mean excess', 'Median excess', 'Excess hit rate', 'HAC t'], array(result.regimeMetrics?.segments).map(seg => {
        const s = seg.horizons?.[63] ?? {};
        return [seg.dimension, seg.label, privateNumber(s.nExcess, 'count'), privateNumber(s.clusters, 'count'), privateNumber(s.meanExcess, 'percent'), privateNumber(s.medianExcess, 'percent'), privateNumber(s.excessHitRate, 'percent'), privateNumber(s.hacT)];
      })), '#### Conditional portfolio observations', '',
      'Conditional returns concatenate selected regime sessions and are not contiguous portfolio time series. They are not presented as regime CAGR.', '',
      ...privateTable(['Regime', 'Sessions', 'Mean daily return', 'Conditional compounded return'], Object.entries(result.conditionalPortfolio ?? {}).map(([label, m]) =>
        [label, privateNumber(m.sessions, 'count'), privateNumber(m.meanDaily, 'percent'), privateNumber(m.conditionalCompoundedReturn, 'percent')])),
      '#### Cost and terminal-outcome sensitivity', '',
      ...privateTable(['Scenario', 'Cost multiplier', 'CAGR', 'Max DD', 'Sharpe', '63-session mean excess', '63-session HAC t'], array(result.sensitivity).map(s =>
        [s.scenario, privateNumber(s.costMultiplier), privateNumber(s.portfolioMetrics?.cagr, 'percent'), privateNumber(s.portfolioMetrics?.maxDrawdown, 'percent'), privateNumber(s.portfolioMetrics?.sharpe), privateNumber(s.signalMetrics?.horizons?.[63]?.meanExcess, 'percent'), privateNumber(s.signalMetrics?.horizons?.[63]?.hacT)])),
      '#### Cash/exposure diagnostic attribution', '',
      ...privateTable(['Field', 'Value'], [
        ['Exposure-matched benchmark CAGR', privateNumber(result.attribution?.exposureMatchedBenchmarkMetrics?.cagr, 'percent')],
        ['Method minus exposure-matched benchmark CAGR', privateNumber(result.attribution?.methodMinusExposureMatchedCagr, 'percent')],
        ['Exposure/cash benchmark CAGR difference', privateNumber(result.attribution?.exposureAndCashBenchmarkCagrDifference, 'percent')],
        ['Transaction costs', privateNumber(result.attribution?.transactionCosts)], ['Dividends', privateNumber(result.attribution?.dividends)],
        ['Sizing effect', result.attribution?.sizingEffect ?? 'NOT_CAUSALLY_IDENTIFIED'], ['Exit effect', result.attribution?.exitEffect ?? 'NOT_CAUSALLY_IDENTIFIED'],
      ]), result.attribution?.interpretation ?? 'Descriptive benchmark substitution only; no additive causal attribution.', '',
      `Market-cap robustness: ${result.marketCapRobustness?.status ?? 'UNAVAILABLE'}.`, '');
  }
  lines.push('## Method overlap', '', 'Correlations and shared constituent observations do not establish independent strategy edges.', '',
    ...privateTable(['Method A', 'Method B', 'Return correlation', 'Matched intervals', 'ID/month Jaccard', 'ID/date Jaccard'], array(payload.overlap).map(o =>
      [o.methodA, o.methodB, privateNumber(o.returnCorrelation), privateNumber(o.commonReturnIntervals, 'count'), privateNumber(o.jaccardSameIdMonth), privateNumber(o.jaccardSameIdDate)])),
    '## Current source-qualified candidates', '', `Snapshot as-of: ${payload.currentAsOf ?? 'UNAVAILABLE'}. Freshness, ticker identity and scanner availability remain data gates. Display up to ${candidateLimit} candidates per method in supplied engine order; this is not a new performance ranking.`, '');
  for (const scan of array(payload.currentScans)) {
    const candidates = array(scan.candidates), available = SCAN_WITH_COUNT.includes(scan.status);
    lines.push(`### ${scan.id}`, '', `Status: ${scan.status ?? 'UNAVAILABLE'}; snapshot: ${scan.asOf ?? 'UNAVAILABLE'}; matches: ${available ? privateNumber(scan.numberMatches ?? candidates.length, 'count') : 'UNAVAILABLE / BLOCKED'}; shown: ${available ? Math.min(candidates.length, candidateLimit) : 0}.`, '');
    if (!available) { lines.push('No candidate list is inferred from a blocked scan. A missing scan is not zero observed matches.', ''); continue; }
    lines.push(...privateTable(['Ticker', 'Security ID', 'Signal as-of', 'Freshness', 'Weight', 'Score', 'Identity flags', 'Regime compatibility'], candidates.slice(0, candidateLimit).map(c =>
      [c.ticker, c.id, c.signalAsOf ?? scan.asOf, c.signalFreshness, privateNumber(c.weight, 'percent'), typeof c.score === 'number' ? privateNumber(c.score) : privateTrace(c.score), array(c.identityFlags).join(', ') || 'NONE_REPORTED', c.regimeCompatibility])));
    for (const c of candidates.slice(0, candidateLimit)) lines.push(`- ${privateCell(c.ticker)} / ${privateCell(c.id)}: rules=${privateTrace(c.reason ?? c.ruleTrace)}; satisfied=${c.keyRulesSatisfied === true ? 'TRUE' : c.keyRulesSatisfied === false ? 'FALSE' : 'UNAVAILABLE'}; issuer=${privateCell(c.issuerCik)}; related securities=${privateCell(array(c.sameIssuerSecurities).join(', ') || 'NONE_REPORTED')}.`);
    lines.push('');
  }
  const consensusSection = (title, observations, state) => {
    lines.push(`## ${title}`, '', `Status: ${state}. Display is limited to ${consensusLimit} rows; full private JSON retains all observations.`, '',
      ...privateTable(['Ticker', 'Security ID', 'As-of', 'Method count', 'Methods'], array(observations).slice(0, consensusLimit).map(c =>
        [c.ticker, c.id, c.asOf, privateNumber(c.methodCount ?? array(c.methods).length, 'count'), array(c.methods).join(', ')])));
  };
  const finalConsensus = review.finalConsensusRecomputed === true && Array.isArray(review.finalConsensus) ? review.finalConsensus : null;
  consensusSection('Strong-method consensus', finalConsensus ?? payload.consensus?.strongMethods,
    finalConsensus ? 'FINAL_REVIEW_METHOD_SET_RECOMPUTED' : 'PRELIMINARY_METHOD_SET_ONLY; NOT_FINAL_CONSENSUS');
  lines.push('Only the final reviewed Tier A/B method set may support a strong-method product view. No consensus implies a proven independent trading score.', '');
  consensusSection('All-frozen diagnostic consensus', payload.consensus?.allFrozenDiagnostic, 'DIAGNOSTIC_ONLY; INCLUDES_EXPERIMENTAL_METHODS');
  lines.push('## Frozen source and adaptation references', '',
    `Freeze: ${payload.freeze?.frozenAt ?? options.metadata?.freeze?.frozenAt ?? 'UNAVAILABLE'}. Rulebook hashes and original/adapted scope are immutable research references.`, '');
  for (const method of array(payload.freeze?.methods ?? options.metadata?.freeze?.methods)) {
    const book = method.rulebook ?? {};
    lines.push(`### ${method.id}`, '', `Historical admission: ${method.historicalAdmission ?? 'UNAVAILABLE'}; rulebook hash: ${method.rulebookHash ?? 'UNAVAILABLE'}.`, '',
      ...privateTable(['Source ID', 'URL', 'Locator'], array(book.sources).map(s => typeof s === 'string' ? [s, 'See source map', 'See source map'] : [s.id, s.url, s.locator])));
    const adaptations = array(book.adaptations ?? book.fidelity?.adaptations ?? book.parameters?.adaptations);
    if (adaptations.length) lines.push('Adaptations:', '', ...adaptations.map(a => `- ${privateCell(a)}`), '');
  }
  lines.push('## Data-blocked research candidates', '', ...privateTable(['Method', 'Status', 'Reason / requirements'], array(payload.dataBlocked).map(b =>
    [b.id, b.status ?? 'BLOCKED_DATA', b.reason ?? (array(b.requirements).join('; ') || 'UNAVAILABLE')])),
    'Current fundamentals or an existing provider pipeline do not substitute for certified historical annual facts, direct market equity, SIC or factor histories.', '',
    '## Forward ledger', '', ...privateTable(['Method', 'Priority', 'Records', 'Snapshot is a post-freeze signal'], array(payload.forwardLedger?.methods).map(m =>
      [m.id, m.priority ?? 'PENDING', array(m.records).length, m.baselineIsPostFreezeSignal === true ? 'TRUE — VERIFY CHRONOLOGY' : 'FALSE'])),
    'Prepared ledger snapshots are not live orders. Only subsequent chronological immutable observations after the freeze count as forward evidence.', '',
    '## Twenty final owner-review questions', '');
  FINAL_QUESTIONS.forEach((q, i) => {
    const a = array(review.finalAnswers).find(x => (x.questionId ?? x.question_id) === i + 1);
    lines.push(`### ${i + 1}. ${q}`, '', a ? privateCell(a.privateAnswer ?? a.answerText ?? a.answer ?? a.status ?? a.answerStatus ?? 'PENDING_REVIEW') : 'PENDING_REVIEW', '');
    if (a?.methodIds || a?.method_ids) lines.push(`Methods: ${array(a.methodIds ?? a.method_ids).join(', ')}.`, '');
    if (a?.enumValues || a?.enums) lines.push(`Assessment: ${array(a.enumValues ?? a.enums).join(', ')}.`, '');
  });
  return lines.join('\n');
}

function privateDestination(file, repoRoot) {
  const destination = path.resolve(file), parent = path.dirname(destination);
  fs.mkdirSync(parent, {recursive: true, mode: 0o700});
  const resolvedParent = fs.realpathSync(parent), repos = unique([fs.realpathSync(repoRoot), fs.realpathSync(REPO)]);
  const resolved = path.join(resolvedParent, path.basename(destination));
  if (repos.some(repo => resolved === repo || resolved.startsWith(`${repo}${path.sep}`))) throw new Error('PRIVATE_REPORT_MUST_STAY_OUTSIDE_REPO');
  if (fs.existsSync(destination) && fs.lstatSync(destination).isSymbolicLink()) throw new Error('PRIVATE_REPORT_SYMLINK_FORBIDDEN');
  return resolved;
}

export function publishReport({inputPath, reviewPath, outRoot, ownersealedPath, privateReportPath = null, publish = false}) {
  if (!inputPath || !reviewPath || !outRoot) throw new Error('INPUT_REVIEW_OUTROOT_REQUIRED');
  const root = path.resolve(outRoot), payload = loadJSON(inputPath), review = loadJSON(reviewPath), metadata = loadPublicMetadata(root);
  const artifacts = buildPublicArtifacts(payload, review, metadata), summary = artifacts['SUPERTRADER-IMPLEMENTED-CANDIDATES.json'].counts;
  if (!publish) return {status: 'DRY_RUN_NO_FILES_WRITTEN', counts: summary, artifact_count: PUBLIC_OUTPUT_NAMES.length};
  if (review.finalized !== true || review.status !== 'PASSED') throw new Error('FINAL_REVIEW_REQUIRED_BEFORE_PUBLICATION');
  if (!ownersealedPath || !fs.existsSync(ownersealedPath)) throw new Error('OWNER_SEALED_ARTIFACT_REQUIRED');
  if (!array(payload.results).length) throw new Error('MEASUREMENT_RESULTS_REQUIRED');
  const sealed = loadJSON(ownersealedPath);
  if (sealed.schema !== 'supertrader-sealed-1.0.0' || sealed.alg !== 'RSA-OAEP-256+A256GCM+gzip' ||
      !['wrappedKey', 'iv', 'tag', 'body'].every(k => typeof sealed[k] === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(sealed[k]))) throw new Error('VALID_OWNER_SEALED_ENVELOPE_REQUIRED');
  const privateFile = privateReportPath ? privateDestination(privateReportPath, root) : null;
  // Do not decrypt or copy the sealed artifact. Its presence is an availability gate.
  const jsonDir = path.join(root, PUBLIC_DIR), docDir = path.join(root, 'docs');
  fs.mkdirSync(jsonDir, {recursive: true}); fs.mkdirSync(docDir, {recursive: true});
  for (const [name, artifact] of Object.entries(artifacts)) fs.writeFileSync(path.join(jsonDir, name), JSON.stringify(artifact, null, 2) + '\n');
  fs.writeFileSync(path.join(docDir, 'SUPERTRADER_FULL_TOURNAMENT.md'), buildPublicMarkdown(payload, review, metadata, ownersealedPath));
  if (privateFile) fs.writeFileSync(privateFile, buildPrivateMarkdown(payload, review, {inputPath, reviewPath, metadata}), {mode: 0o600});
  return {status: 'PUBLIC_ENUM_COUNT_PROJECTIONS_WRITTEN', counts: summary, artifact_count: PUBLIC_OUTPUT_NAMES.length};
}

function flags(argv) {
  const value = name => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : null; };
  return {inputPath: value('inputPath'), reviewPath: value('reviewPath'), outRoot: value('outRoot'), ownersealedPath: value('ownersealedPath'), privateReportPath: value('privateReportPath'), publish: argv.includes('--publish')};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(JSON.stringify(publishReport(flags(process.argv.slice(2)))) + '\n'); }
  catch { process.stderr.write('PUBLICATION_FAILED\n'); process.exitCode = 1; }
}
