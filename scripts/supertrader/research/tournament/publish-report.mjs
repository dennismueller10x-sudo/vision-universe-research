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
  if (payload.freeze && payload.freeze.protocolHash !== metadata.freeze.protocolHash) throw new Error('PAYLOAD_FREEZE_MISMATCH');
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
  return {status: ctx.final ? 'REVIEWED_RESEARCH_PRIORITY' : 'PENDING_REVIEW', method_ids: ctx.final ? ctx.approvedIds(ctx.review[name]) : [], performance_ranking_claim: false};
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
    `${ctx.totals.engine_definitions_implemented} Engine-Definitionen; ${ctx.totals.historical_participants_planned} zugelassene historische Participants; ${ctx.totals.historical_participants_measured} tatsächlich gemessene Participants. ${ctx.totals.blocked_candidates_total} Kandidaten bleiben datenblockiert: ${ctx.totals.blocked_implemented_engines} besitzen eine Formel-Engine, ${ctx.totals.blocked_candidates_without_engines} besitzen keine zugelassene Engine.`, '',
    `Die eingefrorene ursprüngliche Baseline enthält ${ctx.totals.baseline_original_rows} unveränderte Zeilen. Das aktive Universe erweitert und ergänzt andere Zeilen; Minervini bleibt exakt unverändert. Vorhandene Pipeline oder aktuelle Fundamentals belegen keine historischen PIT-Facts.`, '',
    'Öffentlich stehen ausschließlich Methoden-IDs, Enums und Counts. Numerische Provider-Metriken, aktuelle Aktien, Preise und Signal-IDs stehen ausschließlich im privaten verschlüsselten Report. Fehlende Daten bleiben fehlend; null bedeutet unbekannt oder blockiert.', '',
    'Historie: SEEN_HISTORICAL_DATA. Die Auswertung erzeugt Hypothesen; sie ist kein ungesehener Holdout, kein unabhängiger Alpha-Beweis und kein Beleg einer vollständigen Legendary-Replication. Cash-/Exposure-Attribution ist beschreibend; Sizing und Exit sind nicht kausal identifiziert.', '',
    '## Executive Counts', '', '| Dimension | Count |', '|---|---:|',
    ...Object.entries(ctx.totals).map(([name, n]) => `| ${name} | ${n} |`), '',
    '## Executive-Auswahl', '',
    `Top Deep Dives: ${highlights.top_deep_dives.method_ids.length ? highlights.top_deep_dives.method_ids.join(', ') : 'PENDING_REVIEW'}.`, '',
    ...Object.entries(highlights.methods).map(([name, ids]) => `${name}: ${ids.length ? ids.join(', ') : 'PENDING_OR_NOT_IDENTIFIED'}.`), '',
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

/** Full provider-derived detail stays outside the repository and is never logged. */
export function buildPrivateMarkdown(payload = {}, review = {}) {
  return ['# Supertrader Full Tournament — PRIVATE', '',
    'Provider-derived numerical metrics and security identities. Keep private; public artifacts use enum/count projections only.', '',
    '## Owner review', '', '``````json', JSON.stringify(review, null, 2), '``````', '',
    '## Full private payload', '', '``````json', JSON.stringify(payload, null, 2), '``````', ''].join('\n');
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
  if (privateFile) fs.writeFileSync(privateFile, buildPrivateMarkdown(payload, review), {mode: 0o600});
  return {status: 'PUBLIC_ENUM_COUNT_PROJECTIONS_WRITTEN', counts: summary, artifact_count: PUBLIC_OUTPUT_NAMES.length};
}

function flags(argv) {
  const value = name => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : null; };
  return {inputPath: value('inputPath'), reviewPath: value('reviewPath'), outRoot: value('outRoot'), ownersealedPath: value('ownersealedPath'), privateReportPath: value('privateReportPath'), publish: argv.includes('--publish')};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(JSON.stringify(publishReport(flags(process.argv.slice(2)))) + '\n'); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
