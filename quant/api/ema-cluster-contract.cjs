'use strict';
// Backend presentation only. Accepts the existing EMA engine output; no EMA or return calculation here.
const E = require('../engines/technical/ema-cluster.js');
const H = require('../engines/hash.js');
const V = require('../engines/research-validation.cjs');
const I = require('../../core/identity.js');
const VERSION = 'ema-cluster-view-1.0.0';
const copy = x => JSON.parse(JSON.stringify(x));
const date = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x;
const unavailable = reason => ({ state: 'UNAVAILABLE', reason });
const stats = s => s ? Object.fromEntries(['n', 'mean', 'median', 'standardError', 'interval95', 'positive', 'negative', 'neutral', 'issuerClusters', 'timeClusters', 'state', 'method'].filter(k => s[k] !== undefined).map(k => [k, copy(s[k])])) : null;
function cellView(c) {
  return { eventType: c.eventType, horizonTradingDays: c.horizonTradingDays, events: c.events, states: copy(c.states),
    net: stats(c.net), excessSpy: stats(c.excessSpy), directionAdjustedExcess: stats(c.directionAdjustedExcess), p: c.p, holmP: c.holmP,
    cohorts: c.cohorts.map(g => ({ name: g.name, events: g.events, states: copy(g.states), net: stats(g.net), excessSpy: stats(g.excessSpy) })),
    regimes: c.regimes.map(g => ({ name: g.name, events: g.events, states: copy(g.states), excessSpy: stats(g.excessSpy) })),
    walkForward: Object.fromEntries(['state', 'reason', 'folds', 'n', 'mean', 'partitionHash', 'resultHash', 'interpretation'].filter(k => c.walkForward[k] !== undefined).map(k => [k, c.walkForward[k]])) };
}
function evidenceView(e, includeCells) {
  if (!includeCells) return { state: 'AVAILABLE', studyRef: e.studyRef, primaryStudyRef: e.primaryStudyRef,
    availableAt: e.availableAt, cellCount: e.cells.length, interpretation: 'SHARED_COHORT_EVIDENCE_NOT_A_STOCK_FORECAST',
    productionApproved: false, independentHoldout: false };
  const result = Object.fromEntries(['state', 'schemaVersion', 'studyRef', 'primaryStudyRef', 'availableAt', 'timeframe', 'currency', 'priceBasis', 'returnBasis',
    'researchConfigSha256', 'status', 'interpretation', 'limitations'].map(k => [k, copy(e[k])]));
  result.population = Object.fromEntries(['definition', 'selected', 'active', 'delisted', 'unknownIndustry', 'from', 'to', 'selectionHash'].map(k => [k, e.population[k]]));
  result.costs = { basis: e.costs.basis, feeBps: e.costs.feeBps, slippageBps: e.costs.slippageBps };
  result.productionApproved = false; result.independentHoldout = false; result.cells = e.cells.map(cellView);
  return result;
}
function projectEvidence(study, { availableAt = study?.completion?.completedAt } = {}) {
  if (!study || study.schemaVersion !== 'ema-cluster-dev-study-1.0.0' || study.plan?.id !== 'EMA_CLUSTER_DEV_200_V1') return unavailable('UNSUPPORTED_STUDY');
  const { resultHash, ...body } = study;
  try { if (V.hash(body) !== resultHash) return unavailable('STUDY_HASH_MISMATCH'); } catch { return unavailable('INVALID_STUDY_CONTRACT'); }
  if (!Array.isArray(study.cells) || !study.selection?.counts || !Array.isArray(study.plan.limitations) ||
    study.cells.some(c => !c.states || !c.walkForward || !Array.isArray(c.cohorts) || !Array.isArray(c.regimes))) return unavailable('INVALID_STUDY_CONTRACT');
  if (!availableAt || !availableAt.endsWith('Z') || !Number.isFinite(Date.parse(availableAt))) return unavailable('STUDY_AVAILABILITY_REQUIRED');
  if (availableAt.slice(0, 10) < study.plan.to) return unavailable('EVIDENCE_PRECEDES_STUDY_WINDOW');
  // Whitelist aggregates. No selected identities, archive keys, private outcomes or OOS row lists escape.
  return { state: 'AVAILABLE', schemaVersion: 'ema-cluster-evidence-view-1.0.0', studyRef: resultHash,
    primaryStudyRef: study.completion?.baselineResultHash || resultHash, availableAt,
    timeframe: '1D', currency: 'USD', priceBasis: 'SPLIT_ADJUSTED_PRICE', returnBasis: 'PRICE_RETURN',
    researchConfigSha256: study.configHash, population: { definition: study.plan.id, selected: study.selected,
      active: study.selection.counts.active, delisted: study.selection.counts.delisted, unknownIndustry: study.selection.counts.unknownIndustry,
      from: study.plan.from, to: study.plan.to, selectionHash: study.selection.selectionHash },
    costs: { basis: 'PER_SIDE_NOTIONAL', feeBps: 5, slippageBps: 5 },
    status: study.status, productionApproved: false, independentHoldout: false,
    interpretation: 'COHORT_EVENT_ASSOCIATION_NOT_STOCK_FORECAST_OR_SHORT_STRATEGY',
    limitations: [...study.plan.limitations, 'OVERLAPPING_EVENTS_CLUSTER_INFERENCE_NOT_COMPLETE_SERIAL_DEPENDENCE_CONTROL',
      'SUBGROUPS_DESCRIPTIVE_PRIMARY_HOLM_FAMILY_36'],
    cells: study.cells.map(cellView) };
}
function build({ ticker, cluster, evidence = null, requestedAsOf = cluster?.asOf, currency = 'USD', eventLimit = 100, rowLimit = 270, includeHistory = false, includeEvidence = false } = {}) {
  if (!cluster || cluster.schemaVersion !== E.VERSION || !Array.isArray(cluster.rows) || !Array.isArray(cluster.events)) return unavailable('EMA_ENGINE_OUTPUT_REQUIRED');
  if (!date(requestedAsOf) || cluster.asOf !== requestedAsOf) return unavailable('ANALYSIS_DATE_MISMATCH');
  if (!Number.isSafeInteger(eventLimit) || eventLimit < 0 || !Number.isSafeInteger(rowLimit) || rowLimit < 0) return unavailable('INVALID_VIEW_WINDOW');
  let config, securityId;
  try { config = E.configuration(cluster.config); securityId = I.securityIdForTicker(ticker); } catch { return unavailable('INVALID_IDENTITY_OR_CONFIGURATION'); }
  if (cluster.configHash !== H.hashValue(config) || cluster.priceBasis !== 'SPLIT_ADJUSTED_PRICE' || !['1D', '1W', '1M'].includes(cluster.timeframe)) return unavailable('CLUSTER_CONTRACT_MISMATCH');
  if (cluster.rows.some((r, i) => !date(r.date) || r.date > requestedAsOf || (i && r.date <= cluster.rows[i - 1].date)) || cluster.events.some(e => !date(e.date) || e.date > requestedAsOf ||
    !e.availableAt || !Number.isFinite(Date.parse(e.availableAt)) || e.availableAt.slice(0, 10) < e.date || e.availableAt.slice(0, 10) > requestedAsOf || e.timeframe !== cluster.timeframe || e.configHash !== cluster.configHash)) return unavailable('INVALID_CLUSTER_HISTORY');
  const latest = cluster.rows.at(-1);
  if (!latest) return unavailable('NO_COMPLETED_BARS');
  const events = cluster.events, eventView = e => Object.fromEntries(['type', 'direction', 'date', 'availableAt', 'timeframe', 'configHash', 'cluster', 'pullbackDate', 'compressionBars'].filter(k => e[k] !== undefined).map(k => [k, e[k]]));
  const lastEvent = fn => { const e = events.findLast(fn); return e ? eventView(e) : null; };
  const pullback = name => {
    const lastTouch = lastEvent(e => e.type === 'PULLBACK_' + name.toUpperCase());
    const lastResumption = lastEvent(e => e.type.startsWith('RESUME_') && e.cluster === name);
    return { lastTouch, lastResumption, resumptionForLastTouch: lastTouch && lastResumption?.pullbackDate === lastTouch.date ? copy(lastResumption) : null,
      interpretation: 'RECORDED_EVENTS_NOT_AN_INFERRED_ACTIVE_POSITION' };
  };
  const researchConfigSha256 = V.hash(config);
  let attached = unavailable('STUDY_NOT_SUPPLIED');
  if (evidence?.state === 'AVAILABLE' && evidence.schemaVersion === 'ema-cluster-evidence-view-1.0.0' && typeof evidence.availableAt === 'string' && Number.isFinite(Date.parse(evidence.availableAt))) {
    const reason = evidence.researchConfigSha256 !== researchConfigSha256 ? 'CONFIGURATION_MISMATCH'
      : evidence.timeframe !== cluster.timeframe ? 'TIMEFRAME_MISMATCH'
      : evidence.currency !== currency || evidence.priceBasis !== cluster.priceBasis || evidence.returnBasis !== 'PRICE_RETURN' ? 'PRICE_OR_CURRENCY_BASIS_MISMATCH'
      : evidence.availableAt.slice(0, 10) > requestedAsOf ? 'EVIDENCE_NOT_YET_AVAILABLE' : null;
    if (reason) attached = unavailable(reason);
    else { try { attached = evidenceView(evidence, includeEvidence); } catch { attached = unavailable('INVALID_EVIDENCE_PROJECTION'); } }
  } else if (evidence) attached = unavailable(typeof evidence.reason === 'string' ? evidence.reason : 'PROJECTED_EVIDENCE_REQUIRED');
  const row = r => ({ date: r.date, quality: r.quality, trend: r.trend, arrangement: r.arrangement, dynamics: r.dynamics,
    ...(r.fast ? { fast: copy(r.fast), slow: copy(r.slow) } : {}), metrics: r.metrics ? copy(r.metrics) : null });
  return { schemaVersion: VERSION, state: latest.quality === 'READY' ? 'AVAILABLE' : 'WARMUP', securityId,
    engineVersion: E.VERSION, configHash: cluster.configHash, researchConfigSha256, config,
    asOf: requestedAsOf, dataAsOf: latest.date, timeframe: cluster.timeframe, currency, priceBasis: cluster.priceBasis,
    current: row(latest), metricUnits: { fastWidth: 'FRACTION_OF_CLOSE', slowWidth: 'FRACTION_OF_CLOSE', width: 'FRACTION_OF_CLOSE', gap: 'FRACTION_OF_CLOSE',
      fastSlope: 'FRACTION_OF_CLOSE_PER_BAR', slowSlope: 'FRACTION_OF_CLOSE_PER_BAR', widthChange: 'FRACTION_OF_CLOSE', widthRatio: 'RATIO',
      distanceFast: 'FRACTION_OF_CLOSE', distanceSlow: 'FRACTION_OF_CLOSE', compressionBars: 'BARS', orderBars: 'BARS', stability: 'INDEX_0_1', strength: 'DESCRIPTIVE_INDEX_0_1' },
    trendStrengthMeaning: 'DESCRIPTIVE_INDEX_NOT_PROBABILITY',
    pullbacks: { fast: pullback('fast'), slow: pullback('slow') },
    eventHistory: { total: events.length, truncated: events.length > eventLimit, events: eventLimit ? events.slice(-eventLimit).map(eventView) : [] },
    ...(includeHistory ? { chart: { total: cluster.rows.length, truncated: cluster.rows.length > rowLimit,
      rows: rowLimit ? cluster.rows.slice(-rowLimit).map(row) : [] } } : {}),
    screener: { quality: latest.quality, trend: latest.trend, arrangement: latest.arrangement, dynamics: latest.dynamics,
      fastWidth: latest.metrics?.fastWidth ?? null, slowWidth: latest.metrics?.slowWidth ?? null, gap: latest.metrics?.gap ?? null,
      compressionBars: latest.metrics?.compressionBars ?? null, stability: latest.metrics?.stability ?? null }, evidence: attached };
}
module.exports = { VERSION, projectEvidence, build };
