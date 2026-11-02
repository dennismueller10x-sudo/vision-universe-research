/* =========================================================================
   VISION UNIVERSE QUANT — BACKTEST RESULT ADAPTERS (backtest-result-adapters-1.0.0)

   Reine Funktionen: bestehende Ergebnisformen -> backtest-result-2.0.0.
   Keine Quellform wird veraendert, kein Fachmodell neu gerechnet, kein
   Artefakt geschrieben. Neu gerechnet werden nur Pfadkennzahlen aus einem
   vorhandenen Equity-Pfad (Jahresrenditen, Volatilitaet, Cash-Anteil,
   Trefferquote abgeschlossener Trades); unabhaengig gegengerechnet in
   scripts/quant/verify-backtest-result-v2.py.

     fromSignalStudyRule(study, ruleId, opts)     signal-backtest-study-2.0.0 (signal-backtest-v1)
     fromSetupStudyRule(study, ruleId, opts)      signal-backtest-study-2.0.0 kind SETUP_BACKTEST (setup-backtest-v1)
     fromPatternFinding(study, patternId, opts)   pattern-research-study-1.0.0
     fromResearchStudy(result, opts)              research-studies finish() / run-research execute()
     fromPortfolio(result, opts)                  research-portfolio runPortfolio()
     fromRealWeeklyLedger(ledger, opts)           real-weekly-backtest-2.0.0
     statusFromCertification(doc, kind, opts)     backtest-certification-1.0.0 -> status-Block
     fromCertificationKind(doc, kind, opts)       Art ohne Ergebnisartefakt -> Umschlag ohne Zahlen

   Kein Adapter setzt PRODUCT_CERTIFIED. A (RESEARCH_EXECUTED) wird nie
   automatisch zu C.
   ========================================================================= */
'use strict';
const Kinds = require('./backtest-kinds.cjs');
const Contract = require('./backtest-result-contract.cjs');
const ResearchContract = require('./research-contract.cjs');

const VERSION = 'backtest-result-adapters-1.0.0';
const DEFAULT_TIER = { SAME_STOCK_REPLAY: 'OBSERVED', PATTERN_EVIDENCE: 'OBSERVED', SIGNAL_BACKTEST: 'TESTED', SETUP_BACKTEST: 'TESTED', STRATEGY_BACKTEST: 'TESTED', FACTOR_RANKING_BACKTEST: 'TESTED' };
const NO_CLAIM = 'NO_ALPHA_OR_CERTIFICATION_CLAIM';

function fail(code) { throw new Error(code); }
const num = x => typeof x === 'number' && Number.isFinite(x) ? x : null;
const int = x => Number.isSafeInteger(x) && x >= 0 ? x : null;
const uniq = list => [...new Set(list.filter(x => typeof x === 'string' && x))];
const minDate = list => list.filter(Boolean).sort()[0] || null;
const maxDate = list => list.filter(Boolean).sort().at(-1) || null;

function methods(overrides = {}) {
  for (const k of Object.keys(overrides)) if (!Kinds.isMethod(k)) fail('UNKNOWN_METHOD:' + k);
  return Kinds.METHODS.map(method => ({ method, state: 'NOT_RUN', result: null, ...(overrides[method] || {}) }));
}
function emptyMetrics() {
  return { basis: 'NONE', totalReturn: null, cagr: null, annualReturns: null, volatility: null, maxDrawdown: null, hitRate: null, trades: null, turnover: null, costs: null, cashShare: null, benchmark: null, excess: null, perEvent: null };
}
function source(adapter, schemaVersion, engineVersion, artifact = null, resultHash = null) {
  return { adapter: VERSION + '#' + adapter, schemaVersion: schemaVersion || 'UNKNOWN', engineVersion: engineVersion || null, artifact, resultHash: resultHash || null };
}

/* ---------------------------------------------------------- Status */
function statusFromCertification(doc, kind, opts = {}) {
  if (!Kinds.isKind(kind)) fail('UNKNOWN_KIND');
  const state = opts.state || 'PREPARED_DATA_LIMITED';
  if (state === 'PRODUCT_CERTIFIED') fail('ADAPTERS_NEVER_SET_PRODUCT_CERTIFIED');
  const evidenceKind = opts.evidenceKind || null;
  if (!doc) return { state, certificationStatus: 'NOT_ASSESSED', certificationScope: 'KIND', certificationRuleId: null, certificationSource: null, productionApproved: false, evidenceKind: evidenceKind || DEFAULT_TIER[kind] };
  if (doc.schemaVersion !== 'backtest-certification-1.0.0' || !Array.isArray(doc.kinds)) fail('UNKNOWN_CERTIFICATION_SCHEMA');
  const entry = doc.kinds.find(k => k && k.id === kind);
  if (!entry) fail('CERTIFICATION_KIND_MISSING:' + kind);
  const rule = opts.ruleId ? (entry.rules || []).find(r => r && r.id === opts.ruleId) || null : null;
  const src = 'quant/data/product/backtest-certification-v1.json#' + kind + (rule ? '.' + rule.id : '') + '@' + (doc.asOf || doc.generatedAt || 'unknown');
  return { state, certificationStatus: (rule || entry).status, certificationScope: rule ? 'RULE' : 'KIND', certificationRuleId: rule ? rule.id : null,
    certificationSource: src, productionApproved: false, evidenceKind: evidenceKind || (entry.tier === 'OBSERVED' ? 'OBSERVED' : 'TESTED') };
}
function certificationLimitations(doc, kind) {
  const entry = doc && Array.isArray(doc.kinds) ? doc.kinds.find(k => k && k.id === kind) : null;
  if (!entry) return [];
  return uniq([...(entry.blockers || []).map(b => 'CERTIFICATION_BLOCKER:' + b.id + ':' + b.reason), entry.readiness ? 'CERTIFICATION_READINESS:' + entry.readiness : null]);
}

function finalize(envelope, opts) {
  const sealed = Contract.seal(envelope);
  if (opts && opts.validate === false) return sealed;
  const check = Contract.validate(sealed, { certification: opts && opts.certification || null });
  if (!check.valid) fail('ADAPTED_ENVELOPE_INVALID:' + check.errors.join(','));
  return sealed;
}

/* ---------------------------------------- Pfadkennzahlen (neu gerechnet) */
/* Jahresrendite = letzter Wert des Jahres / letzter Wert des Vorjahres - 1;
   das erste Jahr misst gegen das Startkapital. Teiljahre sind markiert. */
function annualReturns(dates, values, initialCapital) {
  const out = []; let base = initialCapital;
  for (let i = 0; i < dates.length; i++) {
    const year = dates[i].slice(0, 4), last = i === dates.length - 1 || dates[i + 1].slice(0, 4) !== year;
    if (!last) continue;
    const first = out.length === 0, partial = (first && dates[0].slice(5) > '01-07') || (i === dates.length - 1 && dates[i].slice(5) < '12-24');
    out.push({ year, value: base > 0 ? values[i] / base - 1 : null, partial });
    base = values[i];
  }
  return out;
}
/* Stichproben-Standardabweichung der einfachen Periodenrenditen, annualisiert
   mit der beobachteten Zeilenfrequenz (Zeilen je Jahr aus erstem/letztem Datum). */
function annualizedVolatility(dates, values) {
  const r = []; for (let i = 1; i < values.length; i++) if (values[i - 1] > 0) r.push(values[i] / values[i - 1] - 1);
  const years = (Date.parse(dates.at(-1)) - Date.parse(dates[0])) / (365.25 * 86400000);
  if (r.length < 2 || !(years > 0)) return null;
  const mean = r.reduce((s, x) => s + x, 0) / r.length, variance = r.reduce((s, x) => s + (x - mean) ** 2, 0) / (r.length - 1);
  return Math.sqrt(variance) * Math.sqrt(r.length / years);
}
const mean = list => list.length ? list.reduce((s, x) => s + x, 0) / list.length : null;

/* ------------------------------------------- Studienregel (Signal/Setup) */
function studyRule(study, ruleId, opts, expectedKind) {
  if (!study || study.schemaVersion !== 'signal-backtest-study-2.0.0') fail('UNKNOWN_STUDY_SCHEMA');
  const kind = study.kind ? Kinds.kindOf('certification', study.kind) : 'SIGNAL_BACKTEST';
  if (kind !== expectedKind) fail('STUDY_KIND_MISMATCH:' + kind);
  const r = (study.rules || []).find(x => x.id === ruleId);
  if (!r) fail('UNKNOWN_RULE:' + ruleId);
  const horizon = opts.horizon || 'm6', h = r.horizons && r.horizons[horizon];
  if (!h) fail('HORIZON_MISSING:' + horizon);
  return { kind, r, h, horizon };
}
function checkState(r, id) { return r.checks && r.checks[id] ? r.checks[id].state || null : null; }
function oosResult(r) {
  if (!r.oos) return { state: 'NOT_RUN', result: null };
  const seg = s => s ? { from: s.from || null, to: s.to || null, n: int(s.n), medianExcess: num(s.medianExcess), deltaHitRate: num(s.deltaPositiveShare) } : null;
  return { state: 'EXECUTED', result: { statistic: r.oos.statistic || null, train: seg(r.oos.train), validation: seg(r.oos.validation), test: seg(r.oos.test), checkState: checkState(r, 'oos') } };
}
function walkForwardResult(r) {
  if (!r.walkForward || !Array.isArray(r.walkForward.folds)) return { state: 'NOT_RUN', result: null };
  const folds = r.walkForward.folds;
  return { state: 'EXECUTED', result: { folds: folds.length, agreeingFolds: folds.filter(f => f.agree).length, agreeShare: num(r.walkForward.agreeShare), checkState: checkState(r, 'walkForward') } };
}

function fromStudyRule(study, ruleId, opts, expectedKind, adapterName) {
  const { kind, r, h, horizon } = studyRule(study, ruleId, opts, expectedKind);
  const setup = kind === 'SETUP_BACKTEST';
  const titlesList = Array.isArray(study.source && study.source.titles) ? study.source.titles : null;
  const population = { artifact: opts.artifact || null, schemaVersion: study.schemaVersion, engineVersion: study.engineVersion, asOf: study.asOf, source: study.source };
  const from = r.firstEvent || (titlesList ? minDate(titlesList.map(t => t.from)) : (study.source && study.source.from) || null);
  const to = r.lastEvent || study.asOf;
  const n = int(h.n);
  const benchmark = setup
    ? (h.vsSpy ? { id: 'SPY', returnBasis: r.returnType, costsBps: 0 } : null)
    : { id: 'SAME_WEEK_MARKET', returnBasis: r.baseRateReturnType || r.returnType, costsBps: 0 };
  const excess = setup
    ? (h.vsSpy ? { medianExcess: num(h.vsSpy.medianExcess), deltaHitRate: null, spyMedianExcess: num(h.vsSpy.medianExcess) } : null)
    : { medianExcess: num(h.vsMarket && h.vsMarket.medianExcess), deltaHitRate: num(h.baseRate && h.baseRate.deltaPositiveShare), spyMedianExcess: num(h.vsSpy && h.vsSpy.medianExcess) };
  const uncertainty = setup
    ? { method: 'HIT_RATE_INTERVAL_95_FROM_STUDY', interval: Array.isArray(h.positiveInterval) ? h.positiveInterval : null, level: 0.95, p: null, family: { size: study.rules.length, correction: 'NONE', adjustedP: null, alpha: null } }
    : { method: 'CLUSTER_ROBUST_HIT_RATE_DELTA_VS_SAME_WEEK_BASE_RATE', interval: h.baseRate && Array.isArray(h.baseRate.ci) ? h.baseRate.ci : null, level: 0.95, p: null, family: { size: study.rules.length, correction: 'NONE', adjustedP: null, alpha: null } };
  const coverage = setup
    ? (study.source.totalReturnQuality ? { numerator: int(study.source.totalReturnQuality.confirmed), denominator: int(study.source.totalReturnQuality.replays), share: num(study.source.totalReturnQuality.share), contract: study.source.totalReturnQuality.contract || null } : null)
    : (study.source.totalReturnCoverage ? { numerator: int(study.source.totalReturnCoverage.withTotalReturn), denominator: int(study.source.totalReturnCoverage.titles), share: num(study.source.totalReturnCoverage.share), contract: study.source.totalReturnCoverage.contract || null } : null);
  const regimeState = setup ? (r.regimes ? 'EXECUTED' : 'NOT_RUN') : (study.regime && study.regime.used ? 'EXECUTED' : 'NOT_RUN');
  const sensitivity = r.parameterStability
    ? { state: 'EXECUTED', result: { neighbours: (r.parameterStability.neighbours || []).length, entryDelays: (r.parameterStability.entryDelay || []).length, mainMedianExcessM6: num(r.parameterStability.main && r.parameterStability.main.medianExcessM6), checkState: checkState(r, 'parameterStability') } }
    : { state: 'NOT_RUN', result: { reason: (r.trustReasons || []).find(t => t.id === 'parameterStability') ? r.trustReasons.find(t => t.id === 'parameterStability').reason : 'NOT_IN_STUDY' } };
  const executed = n > 0;
  const envelope = {
    schemaVersion: Contract.VERSION,
    identity: { kind, scope: 'POPULATION', listingId: null, listingHash: null, populationId: (setup ? 'setup-backtest-v1' : 'signal-backtest-v1') + '@' + study.asOf, populationHash: Contract.hash(population),
      source: source(adapterName, study.schemaVersion, study.engineVersion, opts.artifact || null, null) },
    period: { from, to, asOf: study.asOf, grain: r.grain === 'DAILY' ? 'DAILY' : r.grain === 'WEEKLY' ? 'WEEKLY' : 'UNSPECIFIED' },
    spec: { id: r.id, version: r.version || (setup ? study.setupSchema : null) || null, description: r.plain || null,
      parameters: { params: r.params || null, semantics: r.semantics || null, horizon, opposite: r.opposite || null, contractExits: setup && r.contractTrade ? r.contractTrade.semantics || null : null }, specHash: null },
    events: { form: 'EVENTS', occurrences: int(r.occurrences), completed: n, immature: null, censored: null, ineligible: null, titles: int(r.sample && r.sample.titles), entry: (r.semantics && r.semantics.entry) || null,
      exit: setup && r.contractTrade ? 'TIME_EXIT_AND_CONTRACT_EXITS' : (r.semantics && r.semantics.exit) || null },
    portfolio: null,
    metrics: { ...emptyMetrics(), basis: 'PER_EVENT', maxDrawdown: num(h.maxDrawdown && h.maxDrawdown.median), hitRate: num(h.positiveShare), trades: n,
      costs: { model: 'ROUND_TRIP_BPS', roundTripBps: num(study.frictions && study.frictions.roundTripBps), slippageBps: num(study.frictions && study.frictions.slippageBps), totalRoundTripBps: num(r.semantics && r.semantics.frictionsBps), paid: null, scenarios: study.costScenarios || null },
      benchmark, excess,
      perEvent: { horizon, label: h.label || null, n, median: num(h.median), mean: num(h.mean), p10: num(h.p10), p90: num(h.p90), avgWin: num(h.avgWin), avgLoss: num(h.avgLoss), chanceRisk: num(h.chanceRisk),
        maxDrawdownStatistic: 'MEDIAN_OF_EVENT_MAX_DRAWDOWNS', effectiveN: r.independence ? int(r.independence.effectiveN) : null } },
    uncertainty,
    dataQuality: { coverage, censored: null,
      terminal: { state: study.survivorship && study.survivorship.endedBeforeAsOf === 0 ? 'DELISTED_TITLES_ABSENT_FROM_MAIN_STUDY' : setup ? 'HAND_PICKED_CURRENT_TITLES' : 'NOT_STATED' },
      corporateActions: { contract: (study.canonicalTotalReturn && study.canonicalTotalReturn.corporateActionContract) || (coverage && coverage.contract) || null },
      totalReturnBasis: r.returnType || study.returnType || 'UNKNOWN',
      survivorship: study.survivorship ? { state: study.survivorship.state || null, control: study.survivorship.control || null } : { state: setup ? 'HAND_PICKED_SURVIVORS' : 'NOT_STATED', control: null },
      warnings: uniq((r.trustReasons || []).map(t => t.id + ':' + t.reason)) },
    methods: methods({ OUT_OF_SAMPLE: oosResult(r), WALK_FORWARD: walkForwardResult(r), PARAMETER_SENSITIVITY: sensitivity,
      MARKET_REGIME: regimeState === 'EXECUTED' ? { state: 'EXECUTED', result: setup ? { definition: 'SPY_26_WEEK_EX_POST', groups: Object.keys(r.regimes) } : { definition: 'STUDY_REGIME' } } : { state: 'NOT_RUN', result: { reason: (study.regime && study.regime.reason) || 'NOT_IN_STUDY' } },
      EVENT_DRIVEN: { state: 'NOT_APPLICABLE', result: null }, PORTFOLIO_REBALANCING: { state: 'NOT_APPLICABLE', result: null } }),
    limitations: uniq(['PER_EVENT_STATISTICS_NOT_A_FUNDED_PORTFOLIO', 'OVERLAPPING_EVENTS_NOMINAL_N_EXCEEDS_INDEPENDENT_N',
      ...(r.trustReasons || []).map(t => 'TRUST:' + t.id + ':' + t.reason), r.display && r.display.allowed ? null : 'PRODUCT_DISPLAY_NOT_ALLOWED',
      setup && study.certification !== 'CERTIFIED' ? 'SETUP_METHOD_' + (study.certification || 'NOT_CERTIFIED') : null,
      ...certificationLimitations(opts.certification, kind), NO_CLAIM]),
    status: statusFromCertification(opts.certification || null, kind, { ruleId: r.id, state: executed ? 'RESEARCH_EXECUTED' : 'PREPARED_DATA_LIMITED', evidenceKind: 'TESTED' }),
    envelopeHash: null
  };
  return finalize(envelope, opts);
}
function fromSignalStudyRule(study, ruleId, opts = {}) { return fromStudyRule(study, ruleId, opts, 'SIGNAL_BACKTEST', 'fromSignalStudyRule'); }
function fromSetupStudyRule(study, ruleId, opts = {}) { return fromStudyRule(study, ruleId, opts, 'SETUP_BACKTEST', 'fromSetupStudyRule'); }

/* ------------------------------------------------- Musterbefund */
function fromPatternFinding(study, patternId, opts = {}) {
  if (!study || study.schemaVersion !== 'pattern-research-study-1.0.0') fail('UNKNOWN_STUDY_SCHEMA');
  const f = (study.findings || []).find(x => x.patternId === patternId);
  if (!f) fail('UNKNOWN_PATTERN:' + patternId);
  const pr = study.primary || {}, pop = study.population || {};
  const corr = pr.correction || {};
  const support = int(f.support);
  const population = { artifact: opts.artifact || null, schemaVersion: study.schemaVersion, methodologyVersion: study.methodologyVersion, generatedAt: study.generatedAt, contentHash: study.contentHash || null, population: pop };
  const asOf = (study.generatedAt || '').slice(0, 10);
  const envelope = {
    schemaVersion: Contract.VERSION,
    identity: { kind: 'PATTERN_EVIDENCE', scope: 'POPULATION', listingId: null, listingHash: null, populationId: 'pattern-research-v1@' + asOf, populationHash: Contract.hash(population),
      source: source('fromPatternFinding', study.schemaVersion, study.methodologyVersion, opts.artifact || null, study.contentHash || null) },
    period: { from: pop.firstDate || null, to: pop.lastDate && pop.lastDate <= asOf ? pop.lastDate : null, asOf, grain: 'MONTHLY' },
    spec: { id: f.patternId, version: study.methodologyVersion || null, description: f.plain || null,
      parameters: { patternKind: f.kind || null, terms: f.terms || [], horizon: pr.horizon || null, horizonMonths: num(pr.horizonMonths), winnerThreshold: pr.winnerThreshold || null, winnerMinReturn: num(pr.winnerMinReturn), lossThreshold: num(f.lossThreshold) }, specHash: null },
    events: { form: 'FINDING', occurrences: support, completed: support, immature: null, censored: int(f.outcomeUnavailableInPattern), ineligible: int(f.notMeasurable), titles: null, entry: null, exit: pr.horizon ? 'FIXED_HORIZON_' + pr.horizon : null },
    portfolio: null,
    metrics: { ...emptyMetrics(), basis: 'PER_EVENT', maxDrawdown: num(f.medianMaxDrawdownWithinHorizon),
      costs: study.frictions ? { model: 'ROUND_TRIP_BPS', roundTripBps: num(study.frictions.roundTripBps), slippageBps: num(study.frictions.slippageBps), totalRoundTripBps: null, paid: null, appliedTo: 'MEDIAN_FORWARD_RETURN_NET_ONLY' } : null,
      benchmark: { id: 'POPULATION_BASE_RATE', returnBasis: pop.priceSeriesType === 'SPLIT_ADJUSTED' ? 'SPLIT_ADJUSTED_PRICE' : (pop.priceSeriesType || 'UNKNOWN'), costsBps: 0 },
      excess: { conditionalMinusBaseRate: num(f.conditionalRate) !== null && num(f.baseRate) !== null ? f.conditionalRate - f.baseRate : null, lift: num(f.lift), lossLift: num(f.lossLift) },
      perEvent: { horizon: pr.horizon || null, label: null, n: support, median: num(f.medianForwardReturn), medianNetOfFrictions: num(f.medianForwardReturnNetOfFrictions), medianPopulation: num(f.medianForwardReturnPopulation),
        conditionalRate: num(f.conditionalRate), baseRate: num(f.baseRate), conditionalLossRate: num(f.conditionalLossRate), baseLossRate: num(f.baseLossRate), verdict: f.verdict || null,
        maxDrawdownStatistic: 'MEDIAN_MAX_DRAWDOWN_WITHIN_HORIZON' } },
    uncertainty: { method: 'WILSON_INTERVAL_CONDITIONAL_RATE', interval: Array.isArray(f.wilsonInterval) ? f.wilsonInterval : null, level: 0.95, p: num(f.pValue),
      family: { size: int(pr.hypotheses) || null, correction: corr.method === 'BENJAMINI_HOCHBERG' ? 'BENJAMINI_HOCHBERG' : 'NONE', adjustedP: null, alpha: num(corr.alpha) } },
    dataQuality: { coverage: { numerator: int(pop.seriesUsed), denominator: int(pop.seriesConsidered), share: pop.seriesConsidered ? pop.seriesUsed / pop.seriesConsidered : null, contract: null },
      censored: int(f.outcomeUnavailableInPattern), terminal: { state: 'DELISTED_TITLES_ABSENT' }, corporateActions: { contract: null, adjustment: pop.priceSeriesType || null },
      totalReturnBasis: pop.totalReturn === true ? 'TOTAL_RETURN' : 'SPLIT_ADJUSTED_PRICE',
      survivorship: { state: (study.survivorship && study.survivorship.state) || null, control: null },
      warnings: uniq([study.independence && study.independence.state, pop.totalReturn === false ? 'NOT_DIVIDEND_ADJUSTED' : null, f.significantAfterCorrection === false ? 'NOT_SIGNIFICANT_AFTER_BH_CORRECTION' : null]) },
    methods: methods({
      OUT_OF_SAMPLE: f.outOfSample ? { state: 'EXECUTED', result: { inSampleLift: num(f.inSample && f.inSample.lift), outOfSampleLift: num(f.outOfSample.lift), outOfSampleSupport: int(f.outOfSample.support), folds: Array.isArray(pr.folds) ? pr.folds.length : null, purged: true } } : { state: 'NOT_RUN', result: { reason: f.verdict || 'NOT_MEASURED' } },
      WALK_FORWARD: Array.isArray(pr.folds) && pr.folds.length ? { state: 'EXECUTED', result: { folds: pr.folds.length, purgedObservations: pr.folds.reduce((s, x) => s + (x.purged || 0), 0), scope: 'STUDY_LEVEL_FOLDS' } } : { state: 'NOT_RUN', result: null },
      PARAMETER_SENSITIVITY: f.parameterStability ? { state: 'EXECUTED', result: { state: f.parameterStability.state || null, minLift: num(f.parameterStability.minLift), maxLift: num(f.parameterStability.maxLift), relativeSpread: num(f.parameterStability.relativeSpread) } } : { state: 'NOT_RUN', result: null },
      EVENT_DRIVEN: { state: 'NOT_APPLICABLE', result: null }, PORTFOLIO_REBALANCING: { state: 'NOT_APPLICABLE', result: null } }),
    limitations: uniq(['CONDITIONAL_FREQUENCY_NOT_A_BACKTEST', study.backtest === 'NOT_CERTIFIED' ? 'STUDY_DECLARES_BACKTEST_NOT_CERTIFIED' : null,
      study.publication && study.publication.predictionAllowed === false ? 'PREDICTION_NOT_ALLOWED' : null, 'OVERLAPPING_OBSERVATIONS_NOMINAL_P_UNDERSTATES_UNCERTAINTY',
      'FAMILY_CORRECTION_IS_BENJAMINI_HOCHBERG_NOT_HOLM', 'VERDICT:' + (f.verdict || 'UNKNOWN'), ...certificationLimitations(opts.certification, 'PATTERN_EVIDENCE'), NO_CLAIM]),
    status: statusFromCertification(opts.certification || null, 'PATTERN_EVIDENCE', { state: support > 0 ? 'RESEARCH_EXECUTED' : 'PREPARED_DATA_LIMITED', evidenceKind: 'OBSERVED' }),
    envelopeHash: null
  };
  return finalize(envelope, opts);
}

/* -------------------------------------- research-studies finish() */
function unwrapResearch(result) {
  if (result && result.schemaVersion === ResearchContract.VERSION) {
    const r = Kinds.resolve('researchArea', result.area);
    return { inner: result.result, outer: result, taxonomy: 'researchArea', id: result.area, resolved: r };
  }
  if (!result || typeof result.kind !== 'string' || !/^research-studies-/.test(result.schemaVersion || '')) fail('UNKNOWN_RESEARCH_RESULT');
  return { inner: result, outer: null, taxonomy: 'researchStudyKind', id: result.kind, resolved: Kinds.resolve('researchStudyKind', result.kind) };
}
function fromResearchStudy(result, opts = {}) {
  const u = unwrapResearch(result), x = u.inner;
  if (!x || !/^research-studies-/.test(x.schemaVersion || '') || !Array.isArray(x.events)) fail('UNKNOWN_RESEARCH_RESULT');
  const method = u.resolved.method;
  const kind = u.resolved.kind || opts.kind;
  if (!Kinds.isKind(kind)) fail('KIND_REQUIRED_FOR_METHOD_ENVELOPE');
  if (u.resolved.kind && opts.kind && opts.kind !== u.resolved.kind) fail('KIND_CONTRADICTS_RESULT');
  const listings = uniq(x.events.map(e => e.listingId)).sort();
  const single = listings.length === 1;
  const synthetic = x.sourceMode === 'SYNTHETIC_TEST';
  const cov = x.coverage || {}, st = x.statistics || {};
  const observed = x.events.filter(e => e.state === 'OBSERVED' && Number.isFinite(e.netReturn));
  const excess = observed.filter(e => Number.isFinite(e.benchmarkExcess)).map(e => e.benchmarkExcess);
  const dd = observed.filter(e => Number.isFinite(e.maxDrawdown)).map(e => e.maxDrawdown).sort((a, b) => a - b);
  const medianOf = a => a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : null;
  const signalDates = x.events.map(e => e.signalDate), exitDates = observed.map(e => e.exitDate);
  const to = maxDate([...exitDates, ...signalDates]);
  const costs = x.costs || {};
  const state = synthetic || !observed.length ? 'PREPARED_DATA_LIMITED' : 'RESEARCH_EXECUTED';
  const executed = {};
  if (method) executed[method] = { state: 'EXECUTED', result: { kind: x.kind, entryModel: x.entryModel || null, events: x.events.length } };
  executed.PORTFOLIO_REBALANCING = { state: 'NOT_APPLICABLE', result: null };
  const envelope = {
    schemaVersion: Contract.VERSION,
    identity: { kind, scope: single ? 'SINGLE_LISTING' : 'POPULATION', listingId: single ? listings[0] : null, listingHash: single ? Contract.hash({ listingId: listings[0], inputHash: x.inputHash || null }) : null,
      populationId: single ? null : 'research-cohort:' + (x.inputHash || 'unknown').slice(0, 16), populationHash: single ? null : Contract.hash({ listings, inputHash: x.inputHash || null, universeClaim: x.universeClaim || null }),
      source: source('fromResearchStudy', x.schemaVersion, u.outer ? u.outer.schemaVersion : null, null, (u.outer || x).resultHash || null) },
    period: { from: minDate(signalDates), to: to && to <= x.asOf ? to : x.asOf, asOf: x.asOf, grain: x.executionClock === 'OBSERVED_WEEKLY_DATES' ? 'WEEKLY' : 'UNSPECIFIED' },
    spec: { id: (x.registration && x.registration.id) || ('registration:' + (x.registrationHash || '').slice(0, 16)), version: null, description: u.taxonomy + ':' + u.id,
      parameters: { registrationHash: x.registrationHash || null, analysisMode: x.analysisMode || null, sourceMode: x.sourceMode || null, pattern: x.pattern || null, ruleHash: x.ruleHash || null,
        factorId: x.factorId || null, rules: Array.isArray(x.rules) ? x.rules.map(r => r.id) : null, entryStates: x.entryStates || null, costs: x.costs || null }, specHash: null },
    events: { form: 'EVENTS', occurrences: int(cov.expected), completed: int(cov.observed), immature: int(cov.immature), censored: int(cov.censored), ineligible: int(cov.ineligible), titles: listings.length,
      entry: x.entryModel || 'NEXT_OBSERVED_CLOSE_AFTER_AVAILABILITY', exit: 'FIXED_HORIZON' },
    portfolio: null,
    metrics: { ...emptyMetrics(), basis: observed.length ? 'PER_EVENT' : 'NONE', maxDrawdown: observed.length ? medianOf(dd) : null, hitRate: observed.length ? observed.filter(e => e.netReturn > 0).length / observed.length : null,
      trades: observed.length ? observed.length : null,
      costs: { model: costs.basis || 'UNKNOWN', feeBpsPerSide: num(costs.feeBps), slippageBpsPerSide: num(costs.slippageBps), paid: null },
      benchmark: excess.length ? { id: 'SUPPLIED_RESEARCH_BENCHMARK', returnBasis: x.returnBasis || null, costsBps: 0 } : null,
      excess: excess.length ? { meanExcess: mean(excess), n: excess.length } : null,
      perEvent: observed.length ? { horizon: 'REGISTERED_HORIZON', label: null, n: int(st.n), median: num(st.median), mean: num(st.mean), maxDrawdownStatistic: 'MEDIAN_OF_EVENT_MAX_DRAWDOWNS' } : null },
    uncertainty: st.method ? { method: st.method, interval: Array.isArray(st.interval95) ? st.interval95 : null, level: Array.isArray(st.interval95) ? 0.95 : null, p: null, family: null } : null,
    dataQuality: { coverage: { numerator: int(cov.observed), denominator: int(cov.maturedDenominator), share: num(cov.observedShareMatured), contract: null }, censored: int(cov.censored),
      terminal: { state: 'IDENTITY_VALID_TO_CENSORS_EVENTS' }, corporateActions: { contract: null, state: 'SUPPLIED_RETURN_LEVELS' }, totalReturnBasis: x.returnBasis || 'UNKNOWN',
      survivorship: { state: x.cohortMode || null, control: x.universeClaim || null }, warnings: uniq([...(x.dataIssues || []).map(d => d.reason + ':' + d.listingId), st.state || null]) },
    methods: methods(executed),
    limitations: uniq([...(x.limitations || []), x.universeClaim, x.independentEvidence ? 'INDEPENDENT_EVIDENCE_' + x.independentEvidence : null, synthetic ? 'SYNTHETIC_TEST_DATA' : null,
      'PER_EVENT_STATISTICS_NOT_A_FUNDED_PORTFOLIO', ...certificationLimitations(opts.certification, kind), NO_CLAIM]),
    status: statusFromCertification(opts.certification || null, kind, { state, evidenceKind: synthetic ? 'SYNTHETIC_TEST' : DEFAULT_TIER[kind] }),
    envelopeHash: null
  };
  return finalize(envelope, opts);
}

/* ------------------------------------------------ Portfolio-Ledger */
function fromPortfolio(result, opts = {}) {
  if (!result || !/^research-portfolio-/.test(result.schemaVersion || '') || !Array.isArray(result.equity) || result.equity.length < 2) fail('UNKNOWN_PORTFOLIO_RESULT');
  const kind = opts.kind || 'STRATEGY_BACKTEST';
  if (kind !== 'STRATEGY_BACKTEST' && kind !== 'FACTOR_RANKING_BACKTEST') fail('PORTFOLIO_KIND_MUST_BE_STRATEGY_OR_FACTOR');
  const eq = result.equity, dates = eq.map(e => e.date), values = eq.map(e => e.value);
  const cash = eq.map(e => e.value > 0 ? Math.min(1, Math.max(0, e.cash / e.value)) : null);
  const listings = uniq([...result.trades.map(t => t.listingId), ...eq.flatMap(e => e.positions.map(p => p.listingId))]).sort();
  const synthetic = result.mode === 'SYNTHETIC_TEST';
  const bench0 = result.initialCapital, benchEnd = eq.at(-1).benchmark;
  const years = (Date.parse(dates.at(-1)) - Date.parse(dates[0])) / (365.25 * 86400000);
  const benchTotal = Number.isFinite(benchEnd) ? benchEnd / bench0 - 1 : null;
  const benchCagr = benchTotal !== null && years > 0 ? Math.pow(benchEnd / bench0, 1 / years) - 1 : null;
  const m = result.metrics;
  const rebal = result.rebalances || [];
  const envelope = {
    schemaVersion: Contract.VERSION,
    identity: { kind, scope: 'POPULATION', listingId: null, listingHash: null, populationId: 'portfolio-input:' + result.inputHash.slice(0, 16), populationHash: Contract.hash({ listings, inputHash: result.inputHash }),
      source: source('fromPortfolio', result.schemaVersion, null, null, result.resultHash || null) },
    period: { from: dates[0], to: dates.at(-1), asOf: opts.asOf || dates.at(-1), grain: 'UNSPECIFIED' },
    spec: { id: opts.specId || 'portfolio:' + result.inputHash.slice(0, 16), version: null, description: opts.description || 'research-portfolio runPortfolio ledger',
      parameters: { inputHash: result.inputHash, mode: result.mode || null, returnBasis: result.returnBasis || null, currency: result.currency || null, conditionalPriceSimulation: !!result.conditionalPriceSimulation }, specHash: null },
    events: { form: 'TRADES', occurrences: result.trades.length, completed: result.trades.length, immature: null, censored: null, ineligible: null, titles: listings.length, entry: 'NEXT_SESSION_CLOSE_AFTER_DECISION', exit: 'REBALANCE_OR_EVENT' },
    portfolio: { dates, equity: values, cashShare: cash, initialCapital: result.initialCapital, endCapital: result.endCapital },
    metrics: { ...emptyMetrics(), basis: 'PORTFOLIO', totalReturn: num(m.cumulativeReturn), cagr: num(m.cagr), annualReturns: annualReturns(dates, values, result.initialCapital),
      volatility: annualizedVolatility(dates, values), maxDrawdown: num(m.maxDrawdown), hitRate: null, trades: result.trades.length, turnover: num(m.oneWayTurnoverSum),
      costs: { model: 'PER_SIDE_NOTIONAL', paid: num(m.fees) !== null && num(m.slippage) !== null ? m.fees + m.slippage : null, fees: num(m.fees), slippage: num(m.slippage) },
      cashShare: mean(cash.filter(x => x !== null)),
      benchmark: { id: opts.benchmarkId || 'RUN_PORTFOLIO_BENCHMARK', returnBasis: result.returnBasis || null, costsBps: 0, totalReturn: benchTotal, cagr: benchCagr },
      excess: { totalReturn: benchTotal !== null && num(m.cumulativeReturn) !== null ? m.cumulativeReturn - benchTotal : null, cagr: benchCagr !== null && num(m.cagr) !== null ? m.cagr - benchCagr : null },
      perEvent: null },
    uncertainty: null,
    dataQuality: { coverage: null, censored: null, terminal: { state: (result.eventLedger || []).some(e => /TERMINAL/.test(e.type || '')) ? 'TERMINAL_EVENTS_APPLIED' : 'NO_TERMINAL_EVENTS_IN_LEDGER' },
      corporateActions: { applied: (result.eventLedger || []).length, openReceivables: (result.openReceivables || []).length }, totalReturnBasis: result.returnBasis || 'UNKNOWN',
      survivorship: { state: result.conditionalPriceSimulation ? 'CONDITIONAL_CURRENT_SURVIVOR_COHORT' : 'SUPPLIED_MEMBERSHIP', control: null }, warnings: [] },
    methods: methods({ PORTFOLIO_REBALANCING: { state: 'EXECUTED', result: { rebalances: rebal.length, skipped: rebal.filter(r => r.skipped).length, oneWayTurnoverSum: num(m.oneWayTurnoverSum) } } }),
    limitations: uniq([...(result.limitations || []), synthetic ? 'SYNTHETIC_TEST_DATA' : null, 'VOLATILITY_ANNUALIZED_BY_OBSERVED_ROW_FREQUENCY', ...certificationLimitations(opts.certification, kind), NO_CLAIM]),
    status: statusFromCertification(opts.certification || null, kind, { state: synthetic ? 'PREPARED_DATA_LIMITED' : 'RESEARCH_EXECUTED', evidenceKind: synthetic ? 'SYNTHETIC_TEST' : 'SIMULATED_LEDGER' }),
    envelopeHash: null
  };
  return finalize(envelope, opts);
}

/* ------------------------------------------ Real-Weekly-Ledger */
function fromRealWeeklyLedger(ledger, opts = {}) {
  if (!ledger || ledger.schemaVersion !== 'real-weekly-backtest-2.0.0' || !Array.isArray(ledger.equity) || ledger.equity.length < 2) fail('UNKNOWN_REAL_WEEKLY_LEDGER');
  const kind = opts.kind || 'SIGNAL_BACKTEST';
  if (kind !== 'SIGNAL_BACKTEST' && kind !== 'SAME_STOCK_REPLAY') fail('REAL_WEEKLY_KIND_MUST_BE_SIGNAL_OR_REPLAY');
  const inp = ledger.input, prov = ledger.provenance || {}, eq = ledger.equity;
  const dates = eq.map(e => e.date), values = eq.map(e => e.value), initial = inp.initialCapital;
  const held = [...ledger.trades.map(t => [t.entryDate, t.exitDate]), ...(ledger.openPosition ? [[ledger.openPosition.entryDate, null]] : [])];
  const cash = dates.map(d => held.some(([a, b]) => a <= d && (b === null || d < b)) ? 0 : 1);
  const b = ledger.benchmark || {}, mb = ledger.marketBenchmark || {};
  const envelope = {
    schemaVersion: Contract.VERSION,
    identity: { kind, scope: 'SINGLE_LISTING', listingId: inp.listingId, listingHash: /^[a-f0-9]{64}$/.test(inp.identityHash || '') ? inp.identityHash : Contract.hash({ listingId: inp.listingId }), populationId: null, populationHash: null,
      source: source('fromRealWeeklyLedger', ledger.schemaVersion, inp.signalEngineVersion, opts.artifact || null, ledger.resultHash || null) },
    period: { from: dates[0], to: dates.at(-1), asOf: inp.asOf, grain: 'WEEKLY' },
    spec: { id: inp.ruleId, version: inp.ruleVersion || null, description: inp.version + ' ' + inp.entry + ' -> ' + inp.exit,
      parameters: { params: inp.params || null, period: inp.period, horizonWeeks: inp.horizonWeeks, entry: inp.entry, exit: inp.exit, overlap: inp.overlap, costModel: inp.costModel, costs: inp.costs || null, inputHash: ledger.inputHash }, specHash: null },
    events: { form: 'TRADES', occurrences: ledger.trades.length + (ledger.openPosition ? 1 : 0) + ledger.exclusions.length, completed: ledger.trades.length, immature: ledger.openPosition ? 1 : 0, censored: null,
      ineligible: ledger.exclusions.length, titles: 1, entry: inp.entry, exit: inp.exit },
    portfolio: { dates, equity: values, cashShare: cash, initialCapital: initial, endCapital: values.at(-1) },
    metrics: { ...emptyMetrics(), basis: 'PORTFOLIO', totalReturn: num(ledger.metrics.totalReturn), cagr: num(ledger.metrics.cagr), annualReturns: annualReturns(dates, values, initial),
      volatility: annualizedVolatility(dates, values), maxDrawdown: num(ledger.metrics.maxDrawdown),
      hitRate: ledger.trades.length ? ledger.trades.filter(t => t.netReturn > 0).length / ledger.trades.length : null, trades: ledger.trades.length, turnover: null,
      costs: { model: inp.costModel, paid: ledger.metrics.fees + ledger.metrics.slippage, fees: num(ledger.metrics.fees), slippage: num(ledger.metrics.slippage), roundTripBps: num(inp.costs && inp.costs.roundTripBps), slippageBps: num(inp.costs && inp.costs.slippageBps) },
      cashShare: mean(cash),
      benchmark: { id: b.id || 'SAME_LISTING_BUY_AND_HOLD', returnBasis: b.returnBasis || 'PRICE_RETURN', costsBps: num(b.costsBps), totalReturn: num(b.totalReturn), cagr: num(b.cagr),
        market: mb.state === 'AVAILABLE' ? { id: mb.id || null, returnBasis: mb.returnBasis || null, state: mb.state } : { id: mb.id || null, state: mb.state || 'UNKNOWN' } },
      excess: { totalReturn: num(b.excessTotalReturn), cagr: num(b.excessCagr) }, perEvent: null },
    uncertainty: null,
    dataQuality: { coverage: null, censored: null, terminal: { state: ledger.openPosition ? 'OPEN_POSITION_MARKED_NOT_COMPLETED' : 'NO_OPEN_POSITION' },
      corporateActions: { state: prov.corporateActionQuality ? prov.corporateActionQuality.status || null : null, version: prov.corporateActions ? prov.corporateActions.version || null : null },
      totalReturnBasis: inp.returnBasis || 'PRICE_RETURN', survivorship: { state: 'SINGLE_CURRENT_LISTING', control: null },
      warnings: uniq([...(prov.warnings || []), inp.returnBasis === 'PRICE_RETURN' ? 'PRICE_RETURN_WITHOUT_DIVIDENDS' : null]) },
    methods: methods({ EVENT_DRIVEN: { state: 'NOT_APPLICABLE', result: null }, PORTFOLIO_REBALANCING: { state: 'NOT_APPLICABLE', result: null } }),
    limitations: uniq(['SINGLE_LISTING_NOT_AGGREGATE_SIGNAL_EVIDENCE', 'ONE_FUNDED_POSITION_AT_A_TIME_OVERLAPS_EXCLUDED', ledger.certification === 'NOT_CERTIFIED' ? 'LEDGER_NOT_CERTIFIED' : null,
      ledger.status || null, 'VOLATILITY_ANNUALIZED_BY_OBSERVED_ROW_FREQUENCY', ...certificationLimitations(opts.certification, kind), NO_CLAIM]),
    status: statusFromCertification(opts.certification || null, kind, { state: ledger.trades.length ? 'RESEARCH_EXECUTED' : 'PREPARED_DATA_LIMITED', evidenceKind: 'SIMULATED_LEDGER' }),
    envelopeHash: null
  };
  return finalize(envelope, opts);
}

/* ---------------------------- Art ohne Ergebnisartefakt (nur Status) */
function fromCertificationKind(doc, kind, opts = {}) {
  const status = statusFromCertification(doc, kind, { state: 'PREPARED_DATA_LIMITED' });
  const entry = doc.kinds.find(k => k.id === kind);
  const asOf = doc.asOf || (doc.generatedAt || '').slice(0, 10);
  const envelope = {
    schemaVersion: Contract.VERSION,
    identity: { kind, scope: 'POPULATION', listingId: null, listingHash: null, populationId: 'certification:' + kind + '@' + asOf, populationHash: Contract.hash({ kind, gates: entry.gates || [] }),
      source: source('fromCertificationKind', doc.schemaVersion, null, opts.artifact || null, null) },
    period: { from: null, to: null, asOf, grain: 'UNSPECIFIED' },
    spec: { id: kind, version: doc.schemaVersion, description: entry.label || null, parameters: { tier: entry.tier || null, minimumTrust: entry.minimumTrust || null, gates: (entry.gates || []).map(g => ({ id: g.id, category: g.category, state: g.state })) }, specHash: null },
    events: { form: 'NONE', occurrences: null, completed: null, immature: null, censored: null, ineligible: null, titles: null, entry: null, exit: null },
    portfolio: null,
    metrics: emptyMetrics(),
    uncertainty: null,
    dataQuality: { coverage: null, censored: null, terminal: null, corporateActions: null, totalReturnBasis: 'NOT_APPLICABLE_NO_RESULT', survivorship: null, warnings: uniq([entry.reason]) },
    methods: methods(),
    limitations: uniq(['NO_RESULT_ARTIFACT_STATUS_ONLY', ...certificationLimitations(doc, kind), NO_CLAIM]),
    status,
    envelopeHash: null
  };
  return finalize(envelope, { ...opts, certification: doc });
}

module.exports = { VERSION, fromSignalStudyRule, fromSetupStudyRule, fromPatternFinding, fromResearchStudy, fromPortfolio, fromRealWeeklyLedger, statusFromCertification, fromCertificationKind, annualReturns, annualizedVolatility };
