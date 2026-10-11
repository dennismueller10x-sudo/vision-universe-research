/** Europe shadow input admission. No strategy invocation, IO, production
 * population merge, new ranking, schedule or publication follows from READY. */
import { evaluateGates, TEST_PLANS, MIN_HISTORY_YEARS } from './engine/gates.mjs';

export const EUROPE_READINESS_VERSION = 'supertrader-europe-shadow-readiness-1';
const US_MICS = new Set(['XNYS', 'XNAS', 'ARCX', 'XASE', 'BATS', 'IEXG']);
const finite = value => typeof value === 'number' && Number.isFinite(value);
// Existing canonical hashes are 16 hex (VUHash); private SHA-256 proofs are 64.
// A VUHash value binds a validator's series, it is not an authentication proof.
const seriesDigest = value => typeof value === 'string' && /^(?:[a-f0-9]{16}|[a-f0-9]{64})$/.test(value);
const exactDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
function documented(value, identity, seriesHash, statuses = ['VERIFIED']) {
  return Boolean(value && statuses.includes(value.status) && value.verified === true && value.independent === true
    && value.source && value.document && value.securityId === identity.securityId && value.listingId === identity.listingId
    && value.mic === identity.mic && value.currency === identity.currency && value.seriesHash === seriesHash);
}

/** Validators pass structured evidence via arguments. Readiness labels from
 * another product and provider-adjusted column presence alone cannot pass.
 * Minimum signal inputs are 253 daily observations; backtests retain their
 * existing method-specific multi-cycle plans via evaluateGates unchanged.
 */
export function assessEuropeSupertraderInputs(input = {}, { protectedIds = [] } = {}) {
  if (!Array.isArray(protectedIds)) throw new TypeError('protectedIds must be an array');
  const identity = input.identity ?? {}, price = input.price ?? {}, history = input.history ?? {}, ohlc = input.ohlc ?? {}, volume = input.volume ?? {};
  const actions = input.corporateActions ?? {}, adjustment = input.adjustment ?? {}, benchmark = input.benchmark ?? {}, backtest = input.backtest ?? {};
  const seriesHash = price.seriesHash;
  const now = input.now ?? new Date().toISOString().slice(0, 10);
  const today = typeof now === 'string' ? now.slice(0, 10) : null;
  const idReady = identity.region === 'EUROPE' && identity.verified === true && identity.source && identity.document
    && identity.securityId && identity.instrumentId && identity.listingId && identity.companyId
    && /^[A-Z0-9]{4}$/.test(identity.mic ?? '') && !US_MICS.has(identity.mic) && /^[A-Z]{3}$/.test(identity.currency ?? '')
    && identity.instrumentType === 'EQUITY' && identity.primaryListing === true
    && ![identity.securityId, identity.listingId, identity.instrumentId, identity.companyId].some(id => protectedIds.includes(id));
  const hashReady = seriesDigest(seriesHash);
  const gates = {
    IDENTITY: Boolean(idReady),
    PRICE: Boolean(idReady && hashReady && documented(price, identity, seriesHash)
      && exactDate(today) && exactDate(price.latestDate) && price.latestDate <= today
      && ['CURRENT', 'LAST_VALID_SESSION'].includes(price.freshness) && price.calendarVerified === true
      && price.calendarSource && price.calendarMic === identity.mic && price.expectedLastCompletedSession === price.latestDate),
    HISTORY: Boolean(documented(history, identity, seriesHash) && Number.isInteger(history.observations) && history.observations >= 253
      && finite(history.years) && history.years >= 0 && exactDate(history.from) && exactDate(history.to) && history.from < history.to
      && history.years <= (Date.parse(history.to) - Date.parse(history.from)) / (365.25 * 86400000) + 0.02
      && history.to === price.latestDate && history.calendarVerified === true && history.calendarMic === identity.mic
      && Array.isArray(history.missingDates) && history.missingDates.length === 0),
    OHLC: Boolean(documented(ohlc, identity, seriesHash) && ohlc.observations === history.observations
      && ohlc.invalidBars === 0 && ohlc.quarantinedBars === 0 && ohlc.duplicateDates === 0
      && ohlc.currencyConflicts === 0 && ohlc.unexplainedGaps === 0),
    VOLUME: Boolean(documented(volume, identity, seriesHash) && volume.observations === history.observations
      && volume.missingObservations === 0 && volume.invalidObservations === 0 && volume.zeroObservations === 0),
    CORPORATE_ACTIONS: Boolean(documented(actions, identity, seriesHash) && actions.complete === true
      && exactDate(actions.from) && exactDate(actions.to) && actions.from <= history.from && actions.to >= history.to
      && actions.splitsVerified === true && actions.dividendsVerified === true && actions.symbolContinuityVerified === true),
    ADJUSTMENT: Boolean(documented(adjustment, identity, seriesHash, ['ADJUSTMENT_CERTIFIED'])
      && adjustment.basis === 'SPLIT_ADJUSTED' && adjustment.seriesMatched === true && adjustment.canonicalSeriesHash === seriesHash),
    BENCHMARK: Boolean(documented(benchmark, identity, seriesHash) && benchmark.region === 'EUROPE'
      && benchmark.marketScope === 'EUROPE_EQUITIES'
      && benchmark.benchmarkId && benchmark.benchmarkId !== identity.securityId && /^[A-Z0-9]{4}$/.test(benchmark.benchmarkMic ?? '') && !US_MICS.has(benchmark.benchmarkMic)
      && benchmark.benchmarkCurrency === identity.currency && benchmark.basis === 'SPLIT_ADJUSTED'
      && seriesDigest(benchmark.benchmarkSeriesHash)
      && benchmark.alignmentVerified === true && benchmark.historyVerified === true),
  };
  const failedGates = Object.entries(gates).filter(([, pass]) => !pass).map(([name]) => name);
  const ready = failedGates.length === 0;
  let backtestStatus = gates.IDENTITY && gates.OHLC && hashReady ? 'RESEARCH_ONLY' : 'BLOCKED';
  const minYears = TEST_PLANS[input.variantId]?.minYears ?? MIN_HISTORY_YEARS;
  const measuredCoverage = backtest.coverage ?? {};
  const backtestChecks = {
    INPUTS: ready,
    DOCUMENTED_STUDY: documented(backtest, identity, seriesHash),
    POINT_IN_TIME: backtest.selectionUniverseRegion === 'EUROPE' && !!backtest.selectionUniverseId
      && backtest.pointInTimeSelectionVerified === true && backtest.survivorshipVerified === true,
    WALK_FORWARD: backtest.walkForwardVerified === true && backtest.outOfSampleVerified === true && backtest.noLookaheadVerified === true,
    EXECUTION: backtest.executionModelVerified === true && backtest.costsAndSlippageVerified === true && backtest.baselinesVerified === true,
    TOTAL_RETURN: backtest.totalReturnBasis === 'TOTAL_RETURN' && backtest.totalReturnVerified === true
      && seriesDigest(backtest.totalReturnSeriesHash)
      && backtest.totalReturnSeriesHash !== seriesHash && backtest.corporateActionReplayVerified === true && backtest.delistingReturnsVerified === true,
    HISTORY_PLAN: finite(history.years) && history.years >= minYears && finite(measuredCoverage.dailyOhlcvYears)
      && measuredCoverage.dailyOhlcvYears <= history.years,
  };
  let existingGateResult = null;
  if (Object.values(backtestChecks).every(Boolean)) {
    const existing = evaluateGates(input.variantId, measuredCoverage, { timeframe: backtest.timeframe ?? 'daily',
      missingFields: backtest.missingFields ?? [], baselines: backtest.baselines ?? [] });
    existingGateResult = { status: existing.status, failedGates: existing.failedGates, testPlan: existing.testPlan ?? null };
    if (existing.status === 'BACKTEST_READY') backtestStatus = 'BACKTEST_READY';
  }
  return { version: EUROPE_READINESS_VERSION, region: identity.region ?? 'UNKNOWN', securityId: identity.securityId ?? null,
    companyId: identity.companyId ?? null, listingId: identity.listingId ?? null, seriesHash: seriesHash ?? null,
    inputStatus: ready ? 'SUPERTRADER_READY' : 'SUPERTRADER_BLOCKED', gates, failedGates,
    backtestStatus, backtestChecks, failedBacktestChecks: Object.entries(backtestChecks).filter(([, pass]) => !pass).map(([name]) => name),
    existingGateResult, variantId: input.variantId ?? null, minimumBacktestYears: minYears,
    population: 'EUROPE_SHADOW', strategyAdmission: 'SHADOW_ONLY', admittedToTrading: false,
    strategyInvoked: false, metricsPublishable: false, publicationReady: false,
    provenance: { identitySource: identity.source ?? null, validators: Object.fromEntries(Object.entries({ price, history, ohlc, volume, actions, adjustment, benchmark, backtest })
      .map(([name, value]) => [name, { source: value.source ?? null, document: value.document ?? null }])) } };
}

/** Separate readiness population, preserving canonical IDs without changing
 * existing US strategies, rankings, portfolio contents or trading membership. */
export function buildEuropeShadowPopulation(inputs = [], { protectedIds = [] } = {}) {
  if (!Array.isArray(inputs)) throw new TypeError('inputs must be an array');
  const entries = inputs.filter(input => input?.identity?.region === 'EUROPE').map(input => assessEuropeSupertraderInputs(input, { protectedIds }));
  const counts = new Map(), securityCounts = new Map();
  for (const entry of entries) if (entry.listingId) counts.set(entry.listingId, (counts.get(entry.listingId) ?? 0) + 1);
  for (const entry of entries) if (entry.securityId) securityCounts.set(entry.securityId, (securityCounts.get(entry.securityId) ?? 0) + 1);
  for (const entry of entries) if ((counts.get(entry.listingId) ?? 0) > 1) {
    entry.inputStatus = 'SUPERTRADER_BLOCKED'; entry.backtestStatus = 'BLOCKED';
    entry.failedGates.push('DUPLICATE_LISTING_INPUT');
  }
  for (const entry of entries) if ((securityCounts.get(entry.securityId) ?? 0) > 1) {
    entry.inputStatus = 'SUPERTRADER_BLOCKED'; entry.backtestStatus = 'BLOCKED';
    entry.failedGates.push('DUPLICATE_PRIMARY_SECURITY');
  }
  return { version: EUROPE_READINESS_VERSION, population: 'EUROPE_SHADOW', entries,
    counts: { inputs: inputs.length, europeListings: entries.length, securities: new Set(entries.map(entry => entry.securityId).filter(Boolean)).size,
      excludedNonEuropeanInputs: inputs.length - entries.length,
      supertraderInputReady: entries.filter(entry => entry.inputStatus === 'SUPERTRADER_READY').length,
      backtestReady: entries.filter(entry => entry.backtestStatus === 'BACKTEST_READY').length,
      researchOnly: entries.filter(entry => entry.backtestStatus === 'RESEARCH_ONLY').length,
      admittedToTrading: 0 }, admittedToTrading: [], productionWrites: 0, strategyInvocations: 0,
    existingUSPopulationChanged: false, publicationReady: false };
}
