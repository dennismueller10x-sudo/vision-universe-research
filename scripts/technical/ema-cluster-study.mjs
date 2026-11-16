#!/usr/bin/env node
// Offline adapter to the existing Quant event-study engine. No fetch, scheduler or UI.
// Contract, fixed research conventions and CLI: docs/technical/EMA_CLUSTER.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../../quant/engines/technical/ema-cluster.js');
const S = require('../../quant/engines/research-studies.cjs');
const V = require('../../quant/engines/research-validation.cjs');
const C = require('../../quant/engines/technical/canonical-bars.js');
const M = require('../../quant/engines/technical/multi-timeframe.js');
const F = require('../../quant/engines/technical/formations.js');
const Ctx = require('../../quant/engines/technical/ti/context.js');
const T = require('../../technical/engine/templates.js');
export const VERSION = 'technical-cluster-study-1.0.0';
export const HORIZONS = Object.freeze([5, 20, 60]);
export const REGISTERED_AT = '2026-11-15T00:00:00Z';
const end = d => d + 'T23:59:59.999Z';
function canonical(listing, bars) {
  return C.createSeries({ instrumentId: listing.listingId, currency: 'USD', timeframe: '1D', priceSeriesType: 'SPLIT_ADJUSTED' }, {
    timestamps: bars.map(b => b.date), open: bars.map(b => b.open ?? b.close), high: bars.map(b => b.high ?? b.close),
    low: bars.map(b => b.low ?? b.close), close: bars.map(b => b.close), volume: bars.map(b => b.volume ?? null)
  });
}
export function detect(listing, { asOf, config, timeframe = '1D', mode = 'EMA_CLUSTER' }) {
  const daily = listing.bars.filter(b => b.date <= asOf);
  if (!daily.length) return [];
  if (!['1D', '1W', '1M'].includes(timeframe)) throw new Error('INVALID_STUDY_TIMEFRAME');
  const dailySeries = canonical(listing, daily);
  const series = timeframe === '1D' ? dailySeries : M.completedSeries(dailySeries, timeframe)?.series;
  if (!series) return [];
  const byDate = new Map(daily.map(b => [b.date, b]));
  const bars = series.timestamps.map((t, i) => ({ date: t.slice(0, 10), close: series.close[i], high: series.high[i], low: series.low[i],
    availableAt: byDate.get(t.slice(0, 10))?.availableAt || end(t.slice(0, 10)) }));
  if (mode === 'EMA_CLUSTER') return E.calculate({ bars, asOf, timeframe, config }).events;
  if (mode !== 'FORMATIONS') throw new Error('UNKNOWN_STUDY_MODE');
  if (daily.some(b => !Number.isFinite(b.high) || !Number.isFinite(b.low) || !Number.isFinite(b.open))) throw new Error('FORMATION_OHLC_REQUIRED');
  const prep = Ctx.prepare(series), seen = new Set(), events = [];
  // First visible state only, evaluated at k; never today's stateNow or retrospective pivot date.
  for (let k = 0; k < series.length; k++) for (const f of F.analyzeAt(prep, k).formations) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    events.push({ type: f.type, direction: f.direction === 'BULLISH' ? 'UP' : f.direction === 'BEARISH' ? 'DOWN' : null,
      date: bars[k].date, availableAt: bars[k].availableAt, timeframe, formationId: f.id, stateAtDetection: f.state });
  }
  return events;
}
// Exact existing template predicates on supplied timestamped historical screen rows.
// Missing historical fields stay unknown; never fill them from today's screener.
export function templateEvents(snapshots, calendar, asOf) {
  if (!Array.isArray(snapshots)) throw new Error('HISTORICAL_TEMPLATE_SNAPSHOTS_REQUIRED');
  const dates = new Map(calendar.map((d, k) => [d, k])), events = [], previous = new Map();
  let last = '';
  for (const s of snapshots.filter(s => s.date <= asOf)) {
    if (!dates.has(s.date) || s.date <= last || !s.sourceHash || !s.availableAt || !s.availableAt.endsWith('Z') ||
        !Number.isFinite(Date.parse(s.availableAt)) || s.availableAt.slice(0, 10) !== s.date || !s.fields) throw new Error('INVALID_TEMPLATE_SNAPSHOT');
    const contiguous = last && dates.get(s.date) === dates.get(last) + 1;
    const ds = { column: key => Object.hasOwn(s.fields, key) ? [s.fields[key]] : null };
    const fresh = T.predicate(ds, T.FRESH)(0) === true;
    for (const t of T.list()) {
      const values = t.criteria.map(c => T.predicate(ds, c.filter)(0));
      const state = !fresh ? null : values.some(v => v === false) ? false : values.every(v => v === true) ? true : null;
      if (contiguous && previous.get(t.id) === false && state === true) events.push({ type: t.id, direction: 'UP', date: s.date,
        availableAt: s.availableAt, timeframe: '1D', snapshotHash: s.sourceHash, templateVersion: T.TEMPLATES_VERSION });
      previous.set(t.id, state);
    }
    last = s.date;
  }
  return events;
}
function summary(rows, field) {
  const obs = rows.filter(r => r.state === 'OBSERVED' && Number.isFinite(r[field]));
  const stats = S.inference(obs, field);
  return { ...stats, positive: obs.filter(r => r[field] > 0).length, negative: obs.filter(r => r[field] < 0).length,
    zero: obs.filter(r => r[field] === 0).length };
}
function pValue(s) {
  if (s.n < 100 || s.timeClusters < 30 || s.issuerClusters < 2 || !(s.standardError > 0)) return null;
  const z = Math.abs(s.mean / s.standardError), t = 1 / (1 + 0.2316419 * z);
  const tail = 0.3989422804014327 * Math.exp(-z * z / 2) * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return Math.min(1, 2 * tail);
}
function walkForward(rows, calendar, asOf) {
  const obs = rows.filter(r => r.state === 'OBSERVED' && Number.isFinite(r.benchmarkExcess));
  try {
    const partition = V.buildWalkForward({ calendar: calendar.map(end), trainSize: 252, validationSize: 63, testSize: 126,
      stepSize: 126, mode: 'ROLLING', embargoDays: 5, asOf: end(asOf) }, obs.map(r => ({ id: r.eventId,
      decisionAt: end(r.signalDate), availableAt: end(r.signalDate), informationStart: end(r.signalDate),
      outcomeEnd: end(r.exitDate), outcomeAvailableAt: end(r.exitDate) })));
    const ids = new Set(partition.folds.flatMap(f => f.test));
    const aggregate = V.aggregateOos(partition, obs.filter(r => ids.has(r.eventId)).map(r => ({ id: r.eventId, value: r.benchmarkExcess })));
    return { state: 'EXECUTED', folds: partition.folds.length, partitionHash: partition.resultHash, ...aggregate,
      interpretation: 'LATER_WINDOWS_OF_FIXED_RULE_NOT_UNTOUCHED_HOLDOUT' };
  } catch (e) {
    if (!/INSUFFICIENT_CALENDAR|PURGE_OPERATION_BUDGET|EVENT_BUDGET/.test(e.message)) throw e;
    return { state: 'NOT_RUN', reason: e.message };
  }
}
export function run(input, { mode = 'EMA_CLUSTER', timeframe = '1D', config = {}, costs = { basis: 'PER_SIDE_NOTIONAL', feeBps: 5, slippageBps: 5 } } = {}) {
  if (input.schemaVersion !== 'technical-event-study-input-1.0.0' || input.priceBasis !== 'SPLIT_ADJUSTED_PRICE') throw new Error('CANONICAL_STUDY_INPUT_REQUIRED');
  if (input.currency !== 'USD' || !['PRICE_RETURN', 'TOTAL_RETURN'].includes(input.returnBasis) || input.benchmark?.id !== 'SPY') throw new Error('SPY_SAME_BASIS_REQUIRED');
  if (!Array.isArray(input.calendar) || !input.calendar.length || !Array.isArray(input.listings) || !input.listings.length) throw new Error('STUDY_POPULATION_REQUIRED');
  if (!input.population || !input.population.sourceHash || !Array.isArray(input.population.limitations)) throw new Error('POPULATION_DISCLOSURE_REQUIRED');
  if (!['SYNTHETIC_TEST', 'HISTORICAL_SIMULATION', 'AS_PUBLISHED_PIT'].includes(input.sourceMode)) throw new Error('SOURCE_MODE_REQUIRED');
  const asOf = input.asOf, cfg = E.configuration(config), calendar = input.calendar.filter(d => d <= asOf);
  const listings = input.listings.map(l => ({ ...l, bars: l.bars.filter(b => b.date <= asOf) }));
  // Do not infer historical availability from today's data. The exploratory cohort must be explicit.
  const calendarIndex = new Map(calendar.map((d, i) => [d, i]));
  const ledger = listings.flatMap(l => {
    const segments = []; let pack = [];
    for (const b of l.bars) {
      if (!calendarIndex.has(b.date)) throw new Error('BAR_OUTSIDE_OBSERVED_CALENDAR');
      if (pack.length && calendarIndex.get(b.date) !== calendarIndex.get(pack.at(-1).date) + 1) { segments.push(pack); pack = []; }
      pack.push(b);
    }
    if (pack.length) segments.push(pack);
    if (mode === 'TEMPLATES' && timeframe !== '1D') throw new Error('TEMPLATES_REQUIRE_DAILY_SNAPSHOTS');
    const detections = mode === 'TEMPLATES' ? templateEvents(l.templateSnapshots, calendar, asOf)
      : segments.flatMap(bars => detect({ ...l, bars }, { asOf, config: cfg, timeframe, mode }));
    return detections.map((e, k) => ({ ...e,
    eventId: [l.listingId, e.type, e.date, k].join('|'), eventType: e.type, listingId: l.listingId,
    occurredAt: e.availableAt, publishedAt: e.availableAt, sourceHash: S.hash({ version: VERSION, config: cfg, event: e, sourceHash: l.sourceHash }) }));
  });
  const directions = new Map(ledger.map(e => [e.eventId, e.direction]));
  const typesById = new Map(ledger.map(e => [e.eventId, e.type]));
  const eventById = new Map(ledger.map(e => [e.eventId, e]));
  const types = mode === 'EMA_CLUSTER' ? E.EVENTS : mode === 'TEMPLATES' ? T.list().map(t => t.id) : [...new Set(ledger.map(e => e.type))].sort();
  const cells = [], engineResults = [];
  const regimeBars = input.benchmark.bars.filter(b => b.date <= asOf);
  const regimes = S.classifyRegimes({ asOf, mode: 'EX_POST_DESCRIPTIVE', bars: regimeBars, lookbackBars: 126, volatilityLookbackBars: 63,
    trendBand: 0.02, volatilityThreshold: 0.25, annualization: 252 }).regimes;
  const regimeByDate = new Map(regimes.map(r => [r.date, r.state + '|' + r.volatilityState]));
  for (const h of HORIZONS) {
    const result = S.runEventStudy({ asOf, sourceMode: input.sourceMode,
      ...(input.cohortMode ? { cohortMode: input.cohortMode } : {}), returnBasis: input.returnBasis, currency: input.currency,
      registration: { id: mode + ':' + timeframe, version: VERSION, frozenAt: REGISTERED_AT, analysisMode: 'EXPLORATORY' },
      entryDelayBars: 1, horizonBars: h, costs, expectedCalendar: calendar, listings,
      benchmark: input.benchmark, events: ledger });
    engineResults.push({ horizonTradingDays: h, resultHash: result.resultHash, engineHash: result.engineHash, calculationProvenance: result.calculationProvenance });
    // The existing EVENT path permits late first observations. Enforce the declared
    // next trading session here rather than silently jumping over a missing entry bar.
    result.events = result.events.map(r => {
      const e = eventById.get(r.eventId), expected = calendar[calendarIndex.get(e.date) + 1];
      return expected && r.entryDate && r.entryDate !== expected ? { ...r, state: 'CENSORED', completed: false,
        netReturn: null, benchmarkExcess: null, reasons: ['IMMEDIATE_NEXT_SESSION_MISSING'] } : r;
    });
    for (const type of types) {
      const rows = result.events.filter(e => typesById.get(e.eventId) === type).map(e => ({ ...e,
        // Reverse only the gross relative move; costs remain a deduction for bearish events.
        directionAdjustedExcess: Number.isFinite(e.benchmarkExcess) && Number.isFinite(e.grossReturn)
          ? (e.grossReturn - e.benchmarkReturn) * (directions.get(e.eventId) === 'DOWN' ? -1 : 1) + e.netReturn - e.grossReturn : null }));
      const excess = summary(rows, 'benchmarkExcess');
      const regimeNames = [...new Set(rows.map(r => regimeByDate.get(r.signalDate) || 'UNKNOWN'))].sort();
      cells.push({ eventType: type, horizonTradingDays: h, events: rows.length,
        states: rows.reduce((o, r) => (o[r.state] = (o[r.state] || 0) + 1, o), {}), net: summary(rows, 'netReturn'),
        excessSpy: excess, directionAdjustedExcess: summary(rows, 'directionAdjustedExcess'), p: pValue(excess),
        regimes: regimeNames.map(name => ({ name, excessSpy: summary(rows.filter(r => (regimeByDate.get(r.signalDate) || 'UNKNOWN') === name), 'benchmarkExcess') })),
        walkForward: walkForward(rows, calendar, asOf) });
    }
  }
  const adjusted = V.holm(cells.map(c => c.p ?? 1));
  cells.forEach((c, i) => { c.holmP = c.p === null ? null : adjusted[i]; });
  const body = { schemaVersion: VERSION, asOf, mode, timeframe, config: cfg, configHash: S.hash(cfg),
    codeHashes: Object.fromEntries([['adapter', fileURLToPath(import.meta.url)], ['cluster', require.resolve('../../quant/engines/technical/ema-cluster.js')],
      ['features', require.resolve('../../quant/engines/technical/feature-store.js')], ['formations', require.resolve('../../quant/engines/technical/formations.js')],
      ['templates', require.resolve('../../technical/engine/templates.js')]].map(([key, file]) => [key, S.hash(readFileSync(file, 'utf8'))])),
    engineResults, inputHash: S.hash(input), population: input.population, returnBasis: input.returnBasis, costs,
    status: 'RESEARCH_LIMITED', productionApproved: false, independentHoldout: false,
    interpretation: 'DESCRIPTIVE_EVENT_STUDY_NOT_A_FUNDED_OR_SHORTABLE_STRATEGY',
    limitations: [...input.population.limitations, 'EXPLORATORY_RULES_NO_UNTOUCHED_HOLDOUT', 'OVERLAPPING_EVENTS_CLUSTERED_BY_DATE_AND_ISSUER',
      'REGIMES_EX_POST_DESCRIPTIVE', 'NO_DELISTING_TERMINAL_VALUE_IMPUTATION', 'NEXT_SESSION_CLOSE_NOT_INTRADAY_EXECUTION',
      'HOLM_FAMILY_ALL_EVENT_TYPES_X_THREE_HORIZONS'],
    counts: { listings: listings.length, events: ledger.length }, cells };
  return { ...body, resultHash: S.hash(body) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), get = k => args[args.indexOf(k) + 1];
  if (!args.includes('--input') || !args.includes('--out')) throw new Error('USAGE: --input dataset.json --out result.json [--mode FORMATIONS] [--timeframe 1W]');
  const out = resolve(get('--out')), root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
  if (out.startsWith(root + '/')) throw new Error('RESEARCH_OUTPUT_MUST_BE_OUTSIDE_REPOSITORY');
  const doc = run(JSON.parse(readFileSync(get('--input'), 'utf8')), { mode: args.includes('--mode') ? get('--mode') : 'EMA_CLUSTER', timeframe: args.includes('--timeframe') ? get('--timeframe') : '1D' });
  writeFileSync(out, JSON.stringify(doc, null, 2) + '\n');
  console.log(JSON.stringify({ out, counts: doc.counts, resultHash: doc.resultHash }));
}
