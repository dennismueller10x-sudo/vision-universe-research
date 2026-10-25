'use strict';
// Versioned offline research calculators. They never confer certification.
const crypto = require('node:crypto');
const fs = require('node:fs');
const Signal = require('./signal-backtest.js');
const Pattern = require('./pattern-research.js');
const Setup = require('./setup-engine.js');
const Profile = require('./profile-backtest.js');
const path = require('node:path');
const Contract = require('./research-contract.cjs');
const CALCULATION_RUNTIME = Contract.runtime();
function calculationProvenance() {
  const files = ['research-studies.cjs', 'research-contract.cjs', 'signal-backtest.js', 'pattern-research.js', 'setup-engine.js', 'profile-backtest.js'];
  return { runtime: CALCULATION_RUNTIME, sourceHashes: Object.fromEntries(files.map(f => [f, crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, f))).digest('hex')])) };
}
const VERSION = 'research-studies-1.0.0';
const DAY = 86400000;
const BUDGETS = Object.freeze({ maxSourceBars: 2000000, maxEstimatedWork: 50000000, maxOutputRows: 250000 });
const SOURCE_MODES = ['SYNTHETIC_TEST', 'HISTORICAL_SIMULATION', 'AS_PUBLISHED_PIT'];
function fail(code) { throw new Error(code); }
function canonical(x) {
  if (x === null || typeof x === 'boolean' || typeof x === 'string') return JSON.stringify(x);
  if (typeof x === 'number') { if (!Number.isFinite(x)) fail('NON_FINITE_INPUT'); return JSON.stringify(x); }
  if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']';
  if (!x || Object.getPrototypeOf(x) !== Object.prototype) fail('NON_JSON_INPUT');
  return '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + canonical(x[k])).join(',') + '}';
}
function hash(x) { return crypto.createHash('sha256').update(canonical(x)).digest('hex'); }
function time(x, name = 'TIME') {
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(x)) fail('INVALID_' + name);
  const t = Date.parse(x);
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== x.slice(0, 10)) fail('INVALID_' + name);
  return t;
}
function date(x) { if (!/^\d{4}-\d{2}-\d{2}$/.test(x) || new Date(time(x)).toISOString().slice(0, 10) !== x) fail('INVALID_DATE'); return x; }
function num(x, name, min = -Infinity) { if (!Number.isFinite(x) || x < min) fail('INVALID_' + name); return x; }
function integer(x, name, min = 1) { if (!Number.isSafeInteger(x) || x < min) fail('INVALID_' + name); return x; }
function text(x, name) { if (typeof x !== 'string' || !x.length) fail('MISSING_' + name); return x; }
function positive(x, name) { num(x, name, 0); if (!x) fail('INVALID_' + name); return x; }
function avg(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; }
function median(a) { return Signal.median(a); }
function barsOf(bars, asOf) {
  if (!Array.isArray(bars) || !bars.length) fail('BARS_REQUIRED');
  let last = '';
  return bars.filter(b => {
    date(b.date); if (b.date <= last) fail('UNORDERED_OR_DUPLICATE_BARS'); last = b.date;
    positive(b.close, 'CLOSE'); if (b.returnLevel !== undefined) positive(b.returnLevel, 'RETURN_LEVEL');
    if (b.availableAt !== undefined) time(b.availableAt, 'BAR_AVAILABLE_AT');
    if (b.closeAt !== undefined) { time(b.closeAt, 'BAR_CLOSE_AT'); if (b.closeAt.slice(0, 10) !== b.date) fail('CLOSE_TIME_DATE_MISMATCH'); }
    if (b.closeAt && b.availableAt && time(b.availableAt) < time(b.closeAt)) fail('BAR_AVAILABLE_BEFORE_CLOSE');
    return b.date <= asOf;
  });
}
function identityErrors(l, signalDate, decisionAt) {
  const e = [];
  if (!l.identity) return ['IDENTITY_EVIDENCE_MISSING'];
  const i = l.identity;
  if (!['XNYS', 'XNAS', 'XASE'].includes(i.mic) || i.instrumentClass !== 'COMMON_STOCK' || i.primary !== true) e.push('OUTSIDE_PRIMARY_US_COMMON_UNIVERSE');
  if (!i.validFrom || signalDate < i.validFrom || (i.validTo && signalDate > i.validTo)) e.push('IDENTITY_OUTSIDE_VALID_INTERVAL');
  if (!i.availableAt || time(i.availableAt) > time(decisionAt) || !i.sourceHash) e.push('IDENTITY_NOT_AVAILABLE_AT_DECISION');
  const m = (l.membership || []).find(x => x.validFrom <= signalDate && (!x.validTo || x.validTo >= signalDate) && x.availableAt && time(x.availableAt) <= time(decisionAt) && x.sourceHash);
  if (!m) e.push('HISTORICAL_MEMBERSHIP_MISSING');
  return e;
}
function context(o) {
  date(o.asOf); if (!SOURCE_MODES.includes(o.sourceMode)) fail('SOURCE_MODE_REQUIRED');
  if (!['PRICE_RETURN', 'TOTAL_RETURN'].includes(o.returnBasis)) fail('RETURN_BASIS_REQUIRED');
  text(o.currency, 'CURRENCY');
  if (!o.registration || !o.registration.id || !o.registration.version || !o.registration.frozenAt) fail('REGISTRATION_REQUIRED');
  time(o.registration.frozenAt);
  if (!['EXPLORATORY', 'CONFIRMATORY_CANDIDATE'].includes(o.registration.analysisMode)) fail('ANALYSIS_MODE_REQUIRED');
  if (!Array.isArray(o.listings) || !o.listings.length) fail('LISTINGS_REQUIRED');
  if (o.sourceMode !== 'SYNTHETIC_TEST' && (!Array.isArray(o.expectedCalendar) || !o.expectedCalendar.length)) fail('OBSERVED_CALENDAR_REQUIRED');
  if (o.expectedCalendar) { let prev = ''; for (const d of o.expectedCalendar) { date(d); if (d <= prev) fail('INVALID_OBSERVED_CALENDAR'); prev = d; } }
  const ids = new Set();
  const calendarIndex = o.expectedCalendar ? new Map(o.expectedCalendar.map((d, k) => [d, k])) : null;
  const listings = o.listings.map(l => {
    text(l.listingId, 'LISTING_ID'); text(l.issuerId, 'ISSUER_ID');
    if (ids.has(l.listingId)) fail('DUPLICATE_LISTING_ID'); ids.add(l.listingId);
    const bars = barsOf(l.bars, o.asOf);
    if (calendarIndex && bars.some(b => !calendarIndex.has(b.date))) fail('BAR_OUTSIDE_OBSERVED_CALENDAR');
    const calendarGaps = calendarIndex ? bars.slice(1).filter((b, k) => calendarIndex.get(b.date) !== calendarIndex.get(bars[k].date) + 1).map(b => b.date) : [];
    return { ...l, bars, calendarGaps, dateIndex: new Map(bars.map((b,k)=>[b.date,k])), allCloseTimes: bars.every(b=>!!b.closeAt) };
  });
  if (listings.reduce((n, l) => n + l.bars.length, 0) > BUDGETS.maxSourceBars) fail('OBSERVATION_BUDGET_EXCEEDED');
  const entryDelayBars = o.entryDelayBars === undefined ? 1 : integer(o.entryDelayBars, 'ENTRY_DELAY_BARS');
  const cost = o.costs;
  if (!cost || cost.basis !== 'PER_SIDE_NOTIONAL') fail('PER_SIDE_COST_CONTRACT_REQUIRED');
  const side = (num(cost.feeBps, 'FEE_BPS', 0) + num(cost.slippageBps, 'SLIPPAGE_BPS', 0)) / 10000;
  if (side >= 1) fail('INVALID_COST_RATE');
  let benchmark = null;
  if (o.benchmark) {
    if (o.benchmark.currency !== o.currency || o.benchmark.returnBasis !== o.returnBasis) fail('BENCHMARK_BASIS_MISMATCH');
    benchmark = new Map(barsOf(o.benchmark.bars, o.asOf).map(b => [b.date, b]));
  }
  return { listings, side, benchmark, calendarIndex, entryDelayBars, o };
}
function decisionAt(b) { return b.availableAt || b.date + 'T23:59:59.999Z'; }
function eligible(c, l, b, featureStartDate = null) {
  const issues = identityErrors(l, b.date, decisionAt(b));
  if (featureStartDate !== false && l.calendarGaps?.some(d => d <= b.date && (!featureStartDate || d >= featureStartDate))) issues.push('FEATURE_CALENDAR_GAP_BEFORE_SIGNAL');
  if (c.o.registration.analysisMode === 'CONFIRMATORY_CANDIDATE' && time(c.o.registration.frozenAt) > time(decisionAt(b))) issues.push('RULE_NOT_FROZEN_BEFORE_SIGNAL');
  if (b.availableAt && time(b.availableAt) > time(c.o.asOf + 'T23:59:59.999Z')) issues.push('SIGNAL_NOT_AVAILABLE_AS_OF');
  if (c.o.sourceMode === 'AS_PUBLISHED_PIT' && (!b.availableAt || !b.sourceHash)) issues.push('PRICE_VINTAGE_EVIDENCE_MISSING');
  return issues;
}
function level(c, b) { return c.o.returnBasis === 'TOTAL_RETURN' ? b?.returnLevel : b?.close; }
function net(c, a, b) { return b / a * (1 - c.side) / (1 + c.side) - 1; }
function eventOutcome(c, l, signalIndex, horizon, overrides = {}) {
  const b = l.bars, signal = overrides.signalBar || b[signalIndex], entryIndex = overrides.entryIndex ?? signalIndex + c.entryDelayBars;
  const exitIndex = overrides.exitIndex ?? entryIndex + horizon, entry = b[entryIndex], exit = b[exitIndex];
  const base = { listingId: l.listingId, issuerId: l.issuerId, signalDate: signal.date,
    signalAvailableAt: decisionAt(signal), entryDate: entry?.date || null, exitDate: exit?.date || null,
    timeCluster: overrides.timeCluster || signal.date, completed: false };
  const expectedEntryDate = c.calendarIndex && !overrides.eventTiming ? c.o.expectedCalendar[c.calendarIndex.get(signal.date) + (overrides.entryDelay || c.entryDelayBars)] : entry?.date;
  const expectedExitDate = c.calendarIndex && expectedEntryDate ? c.o.expectedCalendar[c.calendarIndex.get(expectedEntryDate) + horizon] : null;
  base.expectedEntryDate = expectedEntryDate || null; base.expectedExitDate = expectedExitDate || null;
  const featureStart = overrides.priceFeatureLookback === 0 ? false : overrides.priceFeatureLookback ? b[Math.max(0, signalIndex - overrides.priceFeatureLookback)]?.date : null;
  const issues = eligible(c, l, signal, featureStart);
  if (issues.length) return { ...base, state: 'INELIGIBLE', reasons: issues };
  if (!entry) return { ...base, state: expectedEntryDate && expectedEntryDate <= c.o.asOf || l.identity?.validTo && l.identity.validTo <= c.o.asOf ? 'CENSORED' : 'IMMATURE', reasons: ['ENTRY_NOT_OBSERVED'] };
  if (c.calendarIndex && !overrides.eventTiming && c.calendarIndex.get(entry.date) !== c.calendarIndex.get(signal.date) + (overrides.entryDelay || c.entryDelayBars)) return { ...base, state: 'CENSORED', reasons: ['IMMEDIATE_NEXT_SESSION_MISSING'] };
  if (!entry.closeAt || entryIndex <= signalIndex || time(entry.closeAt) <= time(decisionAt(signal))) return { ...base, state: 'INELIGIBLE', reasons: ['ENTRY_NOT_AFTER_AVAILABILITY'] };
  if (!exit) return { ...base, state: expectedExitDate && expectedExitDate <= c.o.asOf || l.identity?.validTo && l.identity.validTo <= c.o.asOf ? 'CENSORED' : 'IMMATURE', reasons: ['OUTCOME_NOT_OBSERVED'] };
  const path = b.slice(entryIndex, exitIndex + 1);
  if (path.some(x => x.availableAt && time(x.availableAt) > time(c.o.asOf + 'T23:59:59.999Z'))) return { ...base, state: 'IMMATURE', reasons: ['OUTCOME_NOT_AVAILABLE_AS_OF'] };
  if (c.o.sourceMode === 'AS_PUBLISHED_PIT' && b.slice(overrides.priceFeatureLookback === 0 ? signalIndex : Math.max(0, signalIndex - (overrides.priceFeatureLookback || signalIndex)), signalIndex + 1).some(x => !x.availableAt || !x.sourceHash || time(x.availableAt) > time(decisionAt(signal)))) return { ...base, state: 'INELIGIBLE', reasons: ['FEATURE_VINTAGE_NOT_AVAILABLE_AT_SIGNAL'] };
  if (c.o.expectedCalendar && path.some((x, k) => k && c.o.expectedCalendar.indexOf(x.date) !== c.o.expectedCalendar.indexOf(path[k - 1].date) + 1)) return { ...base, state: 'CENSORED', reasons: ['SESSION_GAP'] };
  if (path.some(x => !(level(c, x) > 0))) return { ...base, state: 'CENSORED', reasons: ['RETURN_LEVEL_MISSING'] };
  if (c.o.sourceMode === 'AS_PUBLISHED_PIT' && path.some(x => !x.availableAt || !x.sourceHash)) return { ...base, state: 'INELIGIBLE', reasons: ['PRICE_VINTAGE_EVIDENCE_MISSING'] };
  const a = level(c, entry), z = level(c, exit);
  let peak = a, dd = 0;
  for (const x of path) { peak = Math.max(peak, level(c, x)); dd = Math.min(dd, level(c, x) / peak - 1); }
  const ba = c.benchmark?.get(entry.date), bz = c.benchmark?.get(exit.date);
  const benchmarkReturn = ba && bz && level(c, ba) > 0 && level(c, bz) > 0 ? level(c, bz) / level(c, ba) - 1 : null;
  return { ...base, completed: true, state: 'OBSERVED', grossReturn: z / a - 1, netReturn: net(c, a, z),
    maxDrawdown: dd, benchmarkReturn, benchmarkExcess: benchmarkReturn === null ? null : net(c, a, z) - benchmarkReturn,
    benchmarkCostBasis: 'PASSIVE_WITHOUT_TRANSACTION_COSTS', model: 'NEXT_OBSERVED_CLOSE_EVENT_STUDY_NOT_FUNDED_PORTFOLIO' };
}
function clusterVariance(rows, key, mean) {
  const g = new Map(); for (const r of rows) { const k = key(r); const x = g.get(k) || { sum: 0, n: 0 }; x.sum += r.value; x.n++; g.set(k, x); }
  return { groups: g.size, variance: g.size > 1 ? g.size / (g.size - 1) * [...g.values()].reduce((s, x) => s + (x.sum - x.n * mean) ** 2, 0) / rows.length ** 2 : null };
}
function inference(events, field = 'netReturn') {
  const rows = events.filter(e => Number.isFinite(e[field])).map(e => ({ ...e, value: e[field] }));
  if (!rows.length) return { n: 0, mean: null, interval95: null, state: 'NO_OBSERVED_OUTCOMES' };
  const mean = avg(rows.map(r => r.value)), t = clusterVariance(rows, r => r.timeCluster, mean), i = clusterVariance(rows, r => r.issuerId, mean), x = clusterVariance(rows, r => JSON.stringify([r.issuerId,r.timeCluster]), mean);
  const v = t.variance !== null && i.variance !== null && x.variance !== null ? t.variance + i.variance - x.variance : null;
  const se = v !== null && v >= 0 ? Math.sqrt(v) : null;
  return { n: rows.length, mean, median: median(rows.map(r => r.value)), standardError: se,
    interval95: se === null ? null : [mean - 1.96 * se, mean + 1.96 * se],
    timeClusters: t.groups, issuerClusters: i.groups, intersectionClusters: x.groups,
    method: 'TWO_WAY_CLUSTER_MEAN_ASYMPTOTIC', state: se === null ? 'INSUFFICIENT_OR_NONPOSITIVE_CLUSTER_VARIANCE' : 'ESTIMATED_NOT_CERTIFIED',
    limitation: 'Asymptotic interval; clusters must be justified independently. Overlapping horizons and few clusters can invalidate inference.' };
}
function finish(c, kind, payload) {
  const events = payload.events || [];
  const counts = { expected: events.length, observed: 0, immature: 0, censored: 0, ineligible: 0 };
  for (const e of events) counts[e.state === 'OBSERVED' ? 'observed' : e.state === 'IMMATURE' ? 'immature' : e.state === 'CENSORED' ? 'censored' : 'ineligible']++;
  const eligibleDenominator = counts.expected - counts.immature;
  const result = { schemaVersion: VERSION, kind, sourceMode: c.o.sourceMode, analysisMode: c.o.registration.analysisMode,
    returnBasis: c.o.returnBasis, currency: c.o.currency, asOf: c.o.asOf, registrationHash: hash(c.o.registration),
    certification: 'NOT_CERTIFIED', productionApproved: false, independentEvidence: 'NOT_ESTABLISHED_BY_CALCULATOR',
    universeClaim: 'SUPPLIED_HISTORICAL_LISTING_COHORT_NOT_PROOF_OF_MARKET_COMPLETENESS',
    costs: c.o.costs, dataIssues: c.listings.filter(l => l.calendarGaps.length).map(l => ({ listingId: l.listingId, reason: 'OBSERVED_CALENDAR_GAPS', dates: l.calendarGaps })), coverage: { ...counts, maturedDenominator: eligibleDenominator, observedShareMatured: eligibleDenominator ? counts.observed / eligibleDenominator : null },
    ...payload, statistics: inference(events), inputHash: hash(c.o), calculationProvenance: calculationProvenance(), engineHash: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex') };
  return { ...result, resultHash: hash(result) };
}
function workBudget(work, rows, label) { if (!Number.isFinite(work) || work > BUDGETS.maxEstimatedWork || rows > BUDGETS.maxOutputRows) fail(label + '_WORK_BUDGET_EXCEEDED'); }
function horizonOf(o) { return integer(o.horizonBars, 'HORIZON_BARS'); }
function fixedPattern(o) {
  const p = o.pattern; if (!p || !p.id || !p.version || !Array.isArray(p.terms) || !p.terms.length) fail('FIXED_PATTERN_REQUIRED');
  for (const t of p.terms) if (!Pattern.FEATURE_IDS.includes(t.feature) || !['gte', 'lte', 'gt', 'lt', 'eq'].includes(t.operator)) fail('UNSUPPORTED_PATTERN_TERM');
  return p;
}
function patternHit(closes, index, p, featureContext) {
  const features = Pattern.featuresAt(closes, index, featureContext);
  return !!features && Pattern.matchesPattern(features, p);
}
function runSignalStudy(o) {
  const c = context(o), h = horizonOf(o);
  const ids = o.ruleIds || Signal.RULES.map(r => r.id);
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length || ids.some(id => !Signal.RULE_BY_ID[id])) fail('UNKNOWN_OR_DUPLICATE_SIGNAL_RULE');
  workBudget(c.listings.reduce((n,l)=>n+l.bars.length,0) * ids.length * 110, c.listings.reduce((n,l)=>n+l.bars.length,0)*ids.length, 'SIGNAL');
  const events = [];
  for (const l of c.listings) {
    const closes = l.bars.map(b => b.close);
    for (const id of ids) for (const index of Signal.detectEvents(closes, Signal.RULE_BY_ID[id])) events.push({ ruleId: id, ruleVersion: Signal.RULE_BY_ID[id].version, ...eventOutcome(c, l, index, h, { priceFeatureLookback: Signal.WARMUP_WEEKS + Signal.COOLDOWN_WEEKS }) });
  }
  const baseRates = [];
  const signalDates = [...new Set(events.map(e => e.signalDate))].sort();
  workBudget(signalDates.length*c.listings.length*(h+10), signalDates.length*c.listings.length, 'SIGNAL_MATCHING');
  for (const d of signalDates) {
    const population = [];
    for (const l of c.listings) {
      const k = l.dateIndex.get(d) ?? -1;
      const errors = identityErrors(l, d, d + 'T23:59:59.999Z');
      if (errors.length && errors.every(x => ['OUTSIDE_PRIMARY_US_COMMON_UNIVERSE', 'IDENTITY_OUTSIDE_VALID_INTERVAL'].includes(x))) population.push({ listingId: l.listingId, state: 'OUTSIDE_UNIVERSE', reasons: errors });
      else if (k >= 0) population.push(eventOutcome(c, l, k, h, { priceFeatureLookback: 0 }));
      else population.push({ listingId: l.listingId, state: 'CENSORED', reasons: ['SIGNAL_BAR_MISSING_IN_COHORT'] });
    }
    const eligible = population.filter(e => e.state !== 'OUTSIDE_UNIVERSE'), observed = eligible.filter(e => e.completed);
    baseRates.push({ signalDate: d, population, observedOnlyMean: avg(observed.map(e => e.netReturn)),
      completeCohortMean: eligible.length && observed.length === eligible.length ? avg(observed.map(e => e.netReturn)) : null });
  }
  const baseRatesByDate = new Map(baseRates.map(b=>[b.signalDate,b]));
  for (const e of events) { const b = baseRatesByDate.get(e.signalDate); e.matchedExcess = e.completed && b.completeCohortMean !== null ? e.netReturn - b.completeCohortMean : null; }
  return finish(c, 'SIGNAL_BACKTEST', { events, baseRates, rules: ids.map(id => ({ id, definition: Signal.RULE_BY_ID[id].plain, version: Signal.RULE_BY_ID[id].version,
    statistics: inference(events.filter(e => e.ruleId === id)) })), executionScope: 'LONG_EVENT_OUTCOMES_FOR_ALL_FIVE_RULES_NO_SHORT_OR_FUNDED_EXECUTION_ASSUMED' });
}
function runReplayValidation(o) {
  const c = context(o), h = horizonOf(o), p = fixedPattern(o);
  if (c.listings.length !== 1) fail('REPLAY_REQUIRES_SINGLE_LISTING');
  const cooldown = integer(o.cooldownBars, 'COOLDOWN_BARS'), l = c.listings[0], closes = l.bars.map(b => b.close);
  workBudget(closes.length*(200+h), closes.length, 'REPLAY');
  const featureContext = { runningMax: Pattern.runningMaxOf(closes) };
  const events = []; let last = -Infinity;
  for (let k = Signal.WARMUP_WEEKS; k < closes.length; k++) if (patternHit(closes, k, p, featureContext) && k - last >= cooldown) {
    events.push(eventOutcome(c, l, k, h)); last = k;
  }
  return finish(c, 'SAME_STOCK_REPLAY_RULE', { events, pattern: p, ruleHash: hash({ pattern: p, cooldownBars: cooldown, horizonBars: h }),
    descriptiveViewPreserved: true, scope: 'CONDITIONAL_SINGLE_LISTING_RULE_NOT_MARKET_EDGE',
    note: 'Fixed rule selection differs from choosing today\'s matching historical cases; independent confirmation requires separate sealed data.' });
}
function runPatternStudy(o) {
  const c = context(o), h = horizonOf(o), p = fixedPattern(o), cooldown = integer(o.cooldownBars, 'COOLDOWN_BARS');
  const events = [], controls = [], suppressed = [];
  const sourceBars = c.listings.reduce((n,l)=>n+l.bars.length,0);
  workBudget(sourceBars*(200+h),sourceBars,'PATTERN');
  const featureInputs = new Map(c.listings.map(l => { const closes = l.bars.map(b => b.close); return [l.listingId, { closes, context: { runningMax: Pattern.runningMaxOf(closes) }, dateIndex: new Map(l.bars.map((b,k)=>[b.date,k])) }]; }));
  for (const l of c.listings) {
    const { closes, context: featureContext } = featureInputs.get(l.listingId); let last = -Infinity;
    for (let k = Signal.WARMUP_WEEKS; k < closes.length; k++) {
      const hit = patternHit(closes, k, p, featureContext);
      if (hit === null) { suppressed.push({ listingId: l.listingId, date: l.bars[k].date, reason: 'FEATURE_NOT_MEASURABLE_AT_DECISION' }); continue; }
      if (hit && k - last < cooldown) { suppressed.push({ listingId: l.listingId, date: l.bars[k].date, reason: 'PREREGISTERED_COOLDOWN' }); continue; }
      const e = eventOutcome(c, l, k, h);
      if (hit) { events.push(e); last = k; } else controls.push(e);
    }
  }
  const allByDate = new Map(); for (const e of controls) { if (!allByDate.has(e.signalDate)) allByDate.set(e.signalDate, []); allByDate.get(e.signalDate).push(e); }
  const byDate = new Map(); for (const e of controls.filter(e => e.completed)) { if (!byDate.has(e.signalDate)) byDate.set(e.signalDate, []); byDate.get(e.signalDate).push(e.netReturn); }
  const caseDates = [...new Set(events.map(e=>e.signalDate))].sort();
  workBudget(caseDates.length*c.listings.length*200,caseDates.length*c.listings.length,'PATTERN_MATCHING');
  const controlCoverage = caseDates.map(d => {
    const unknownListingIds = [], excludedListingIds = []; let eligibleListings = 0;
    for (const l of c.listings) {
      const features = featureInputs.get(l.listingId), k = features.dateIndex.get(d) ?? -1, b = l.bars[k];
      const issues = identityErrors(l, d, b ? decisionAt(b) : d + 'T23:59:59.999Z');
      if (issues.length && issues.every(x => ['OUTSIDE_PRIMARY_US_COMMON_UNIVERSE', 'IDENTITY_OUTSIDE_VALID_INTERVAL'].includes(x))) { excludedListingIds.push(l.listingId); continue; }
      eligibleListings++;
      if (issues.length || k < 0 || patternHit(features.closes, k, p, features.context) === null || l.calendarGaps.some(x => x <= d)) unknownListingIds.push(l.listingId);
    }
    return { signalDate: d, eligibleListings, unknownListingIds, excludedListingIds };
  });
  const coverageByDate = new Map(controlCoverage.map(x=>[x.signalDate,x]));
  const matched = events.map(e => ({ ...e, matchedControlN: byDate.get(e.signalDate)?.length || 0,
    matchedExcess: e.completed && byDate.has(e.signalDate) && allByDate.get(e.signalDate).every(x => x.completed) && !coverageByDate.get(e.signalDate).unknownListingIds.length ? e.netReturn - avg(byDate.get(e.signalDate)) : null }));
  return finish(c, 'PATTERN_EVIDENCE', { events: matched, controls, controlCoverage, suppressed, pattern: p, matchedStatistics: inference(matched, 'matchedExcess'),
    controlStatistics: inference(controls), scope: 'FIXED_PATTERN_EVENT_STUDY_NOT_TRADABLE_RULE',
    multiplicity: 'Single pattern estimate; joint claims across runs require registered family-level correction.' });
}
function buildSetupStates(o) {
  const methodology = o.setupMethodology;
  if (!methodology) fail('SETUP_METHODOLOGY_REQUIRED');
  if (!Array.isArray(o.technicalSnapshots)) fail('TECHNICAL_SNAPSHOTS_REQUIRED');
  workBudget(o.technicalSnapshots.length*100,o.technicalSnapshots.length,'SETUP_RECONSTRUCTION');
  const previous = new Map(), out = [];
  const ordered = o.technicalSnapshots.slice().sort((a, b) => a.date.localeCompare(b.date) || a.listingId.localeCompare(b.listingId));
  const seen = new Set();
  for (const s of ordered) {
    date(s.date); text(s.listingId, 'LISTING_ID'); time(s.availableAt); text(s.sourceHash, 'SNAPSHOT_HASH');
    if (s.dataCutoff !== s.date || !s.row || !s.rowSourceMode || !['AS_PUBLISHED_PIT', 'HISTORICAL_SIMULATION', 'SYNTHETIC_TEST'].includes(s.rowSourceMode)) fail('SETUP_SOURCE_CUTOFF_OR_MODE_INVALID');
    const key = s.listingId + ':' + s.date; if (seen.has(key)) fail('DUPLICATE_SETUP_SNAPSHOT'); seen.add(key);
    const prev = previous.get(s.listingId);
    const result = Setup.evaluate({ row: s.row, close: positive(s.close, 'SETUP_CLOSE'), previous: prev?.observation || null, historyDepth: prev ? prev.depth + 1 : 1, methodology });
    const entry = { listingId: s.listingId, date: s.date, availableAt: s.availableAt, sourceHash: s.sourceHash, sourceMode: s.rowSourceMode,
      state: result.classification.state, stateResult: result };
    previous.set(s.listingId, { observation: { setupState: result.classification.state, invalidationPrice: s.invalidationPrice ?? null, exitPrice: s.exitPrice ?? null }, depth: prev ? prev.depth + 1 : 1 }); out.push(entry);
  }
  return out;
}
function runSetupStudy(o) {
  const c = context(o), h = horizonOf(o);
  const sourceStates = o.technicalSnapshots ? buildSetupStates(o) : o.setups;
  if (!Array.isArray(sourceStates)) fail('SETUP_STATES_REQUIRED');
  const states = sourceStates.filter(s => s.date <= o.asOf);
  if (!Array.isArray(o.entryStates) || !o.entryStates.length) fail('ENTRY_STATES_REQUIRED');
  const entryVariants = o.entryVariants || [{ id: c.entryDelayBars === 1 ? 'NEXT_CLOSE' : 'REGISTERED_DELAY', delayBars: c.entryDelayBars }];
  const exitVariants = o.exitVariants || [{ id: 'TIME_EXIT', type: 'TIME_EXIT', horizonBars: h }];
  if (!Array.isArray(entryVariants) || !Array.isArray(exitVariants) || !entryVariants.length || !exitVariants.length) fail('SETUP_VARIANTS_REQUIRED');
  for (const v of entryVariants) { text(v.id, 'ENTRY_VARIANT_ID'); integer(v.delayBars, 'ENTRY_DELAY_BARS'); }
  for (const v of exitVariants) { text(v.id, 'EXIT_VARIANT_ID'); integer(v.horizonBars, 'EXIT_HORIZON'); if (!['TIME_EXIT', 'INVALIDATION_CLOSE', 'TARGET_CLOSE'].includes(v.type)) fail('UNSUPPORTED_SETUP_EXIT'); }
  if (new Set(entryVariants.map(v => v.id)).size !== entryVariants.length || new Set(exitVariants.map(v => v.id)).size !== exitVariants.length) fail('DUPLICATE_SETUP_VARIANT');
  workBudget(states.length*entryVariants.length*exitVariants.length*(h+100),states.length*entryVariants.length*exitVariants.length,'SETUP');
  const seen = new Set(), previous = new Map(), events = [], suppressed = [];
  if (states.some((s, k) => k && states[k - 1].date > s.date)) fail('SETUP_STATES_NOT_CHRONOLOGICAL');
  for (const s of states) {
    date(s.date); time(s.availableAt); text(s.sourceHash, 'SETUP_SOURCE_HASH'); text(s.state, 'SETUP_STATE');
    if (!SOURCE_MODES.includes(s.sourceMode)) fail('SETUP_SOURCE_MODE_REQUIRED');
    if (o.sourceMode === 'AS_PUBLISHED_PIT' && s.sourceMode !== 'AS_PUBLISHED_PIT') fail('RECONSTRUCTED_SETUP_IS_NOT_PUBLISHED_PIT');
    const key = s.listingId + ':' + s.date; if (seen.has(key)) fail('DUPLICATE_SETUP_STATE'); seen.add(key);
    const prior = previous.get(s.listingId); previous.set(s.listingId, s.state);
    if (!o.entryStates.includes(s.state) || s.date > o.asOf) continue;
    if (prior === s.state) { suppressed.push({ listingId: s.listingId, date: s.date, reason: 'REPEATED_SETUP_STATE' }); continue; }
    const l = c.listings.find(l => l.listingId === s.listingId); if (!l) fail('SETUP_LISTING_NOT_IN_COHORT');
    const idx = l.dateIndex.get(s.date) ?? -1; if (idx < 0) fail('SETUP_SIGNAL_BAR_MISSING');
    const copy = l, signalBar = { ...l.bars[idx], availableAt: s.availableAt };
    for (const entryVariant of entryVariants) for (const exitVariant of exitVariants) {
      const entryIndex = idx + entryVariant.delayBars, endIndex = entryIndex + exitVariant.horizonBars;
      let exitIndex = endIndex, exitReason = 'TIME_EXIT';
      if (exitVariant.type !== 'TIME_EXIT') {
        if (s.levelBasis !== 'SIGNAL_SERIES') fail('SETUP_EXIT_THRESHOLD_SCALE_UNPROVEN');
        const threshold = positive(exitVariant.type === 'INVALIDATION_CLOSE' ? s.invalidationLevel : s.targetLevel, 'EXIT_THRESHOLD');
        for (let j = entryIndex + 1; j < endIndex && j + 1 < copy.bars.length; j++) {
          const hit = exitVariant.type === 'INVALIDATION_CLOSE' ? copy.bars[j].close < threshold : copy.bars[j].close >= threshold;
          if (hit) {
            if (!copy.bars[j + 1].closeAt || time(copy.bars[j + 1].closeAt) <= time(decisionAt(copy.bars[j]))) fail('EXIT_NOT_AFTER_TRIGGER_AVAILABILITY');
            exitIndex = j + 1; exitReason = exitVariant.type; break;
          }
        }
      }
      events.push({ setupState: s.state, entryVariant: entryVariant.id, exitVariant: exitVariant.id, exitReason, ...eventOutcome(c, copy, idx, exitVariant.horizonBars, { entryIndex, exitIndex, entryDelay: entryVariant.delayBars, priceFeatureLookback: 0, signalBar }) });
    }
  }
  return finish(c, 'SETUP_BACKTEST', { events, suppressed, entryVariants, exitVariants, inputStates: states.length, entryStates: o.entryStates, horizonsRemainUncompleted: true,
    sourceNote: 'Historical technical inputs must themselves have cutoff/vintage evidence; calculator does not invent historical production snapshots.' });
}
function rankCorrelation(rows) {
  if (rows.length < 2) return null;
  function ranks(field) {
    const sorted = rows.map((r, k) => ({ k, v: r[field] })).sort((a, b) => a.v - b.v), out = [];
    for (let k = 0; k < sorted.length;) { let j = k + 1; while (j < sorted.length && sorted[j].v === sorted[k].v) j++; const v = (k + j - 1) / 2; for (; k < j; k++) out[sorted[k].k] = v; }
    return out;
  }
  const a = ranks('factor'), b = ranks('netReturn'), ma = avg(a), mb = avg(b);
  const cov = a.reduce((s, x, k) => s + (x - ma) * (b[k] - mb), 0), va = a.reduce((s, x) => s + (x - ma) ** 2, 0), vb = b.reduce((s, x) => s + (x - mb) ** 2, 0);
  return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : null;
}
function runFactorStudy(o) {
  const c = context(o), h = horizonOf(o), buckets = integer(o.buckets, 'BUCKETS', 2);
  text(o.factorId, 'FACTOR_ID'); if (!Array.isArray(o.factorSnapshots)) fail('FACTOR_SNAPSHOTS_REQUIRED');
  workBudget(o.factorSnapshots.reduce((n,s)=>n+(s.rows?.length||0),0)*(h+100+(o.interactionFactorIds?.length||0)**2),o.factorSnapshots.reduce((n,s)=>n+(s.rows?.length||0),0),'FACTOR');
  const events = [], periods = [], seen = new Set();
  for (const s of o.factorSnapshots) {
    date(s.date); time(s.availableAt); text(s.sourceHash, 'FACTOR_SOURCE_HASH');
    if (s.date > o.asOf) continue;
    if (seen.has(s.date)) fail('DUPLICATE_FACTOR_CROSS_SECTION'); seen.add(s.date);
    if (!Array.isArray(s.rows)) fail('FACTOR_ROWS_REQUIRED');
    const rows = [], excluded = [], rowIds = new Set();
    for (const r of s.rows) {
      if (rowIds.has(r.listingId)) fail('DUPLICATE_FACTOR_LISTING'); rowIds.add(r.listingId);
      if (!Number.isFinite(r.value)) { excluded.push({ listingId: r.listingId, reason: 'FACTOR_MISSING_AT_DECISION' }); continue; }
      time(r.availableAt); text(r.sourceHash, 'FACTOR_VINTAGE_HASH');
      if (time(r.availableAt) > time(s.availableAt)) { excluded.push({ listingId: r.listingId, reason: 'FACTOR_NOT_AVAILABLE_AT_DECISION' }); continue; }
      const l = c.listings.find(l => l.listingId === r.listingId); if (!l) fail('FACTOR_LISTING_NOT_IN_COHORT');
      const idx = l.dateIndex.get(s.date) ?? -1; if (idx < 0) { excluded.push({ listingId: r.listingId, reason: 'SIGNAL_BAR_MISSING' }); continue; }
      const errs = identityErrors(l, s.date, s.availableAt);
      if (errs.length) { excluded.push({ listingId: r.listingId, reasons: errs }); continue; }
      rows.push({ l, idx, factor: r.value, decisionAt: s.availableAt });
    }
    for (const l of c.listings) if (!rowIds.has(l.listingId) && !identityErrors(l, s.date, s.availableAt).length) excluded.push({ listingId: l.listingId, reason: 'FACTOR_ROW_MISSING_AT_DECISION' });
    // Rank BEFORE accessing outcome availability. Missing exits remain in their original buckets.
    rows.sort((a, b) => a.factor - b.factor || a.l.listingId.localeCompare(b.l.listingId));
    const factorIds = o.interactionFactorIds || [];
    if (!Array.isArray(factorIds) || factorIds.length > 32 || new Set(factorIds).size !== factorIds.length) fail('INVALID_FACTOR_INTERACTION_SET');
    const factorDependence = [], factorRowById=new Map(s.rows.map(r=>[r.listingId,r]));
    for (let a = 0; a < factorIds.length; a++) for (let b = a + 1; b < factorIds.length; b++) {
      const pairs = rows.map(x => factorRowById.get(x.l.listingId)).filter(r => Number.isFinite(r.factors?.[factorIds[a]]) && Number.isFinite(r.factors?.[factorIds[b]])).map(r => ({ factor: r.factors[factorIds[a]], netReturn: r.factors[factorIds[b]] }));
      factorDependence.push({ factorA: factorIds[a], factorB: factorIds[b], n: pairs.length, spearman: rankCorrelation(pairs), scope: 'PIT_CROSS_SECTION_DEPENDENCE_NOT_CAUSAL_INTERACTION' });
    }
    const periodEvents = rows.map((r, k) => {
      const signalBar = { ...r.l.bars[r.idx], availableAt: r.decisionAt };
      return { factor: r.factor, bucket: Math.min(buckets - 1, Math.floor(k * buckets / rows.length)), ...eventOutcome(c, r.l, r.idx, h, { priceFeatureLookback: 0, signalBar }) };
    });
    const factorCounts = new Map(); for (const r of rows) factorCounts.set(r.factor, (factorCounts.get(r.factor) || 0) + 1);
    const q = Array.from({ length: buckets }, (_, k) => {
      const all = periodEvents.filter(e => e.bucket === k), observed = all.filter(e => e.completed);
      return { bucket: k, assigned: all.length, observed: observed.length, incomplete: all.length - observed.length,
        observedOnlyMean: avg(observed.map(e => e.netReturn)), completeCohortMean: observed.length && observed.length === all.length ? avg(observed.map(e => e.netReturn)) : null };
    });
    events.push(...periodEvents);
    periods.push({ date: s.date, eligibleAtDecision: rows.length, excluded, buckets: q, factorDependence,
      tiePolicy: 'FACTOR_ASCENDING_THEN_LISTING_ID_ASCENDING', tiedRows: rows.filter(r => factorCounts.get(r.factor) > 1).length,
      topMinusBottom: q[0].completeCohortMean !== null && q[buckets - 1].completeCohortMean !== null ? q[buckets - 1].completeCohortMean - q[0].completeCohortMean : null,
      spearmanObservedOnly: rankCorrelation(periodEvents.filter(e => e.completed)),
      completeCohort: periodEvents.length > 0 && periodEvents.every(e => e.completed) });
  }
  return finish(c, 'FACTOR_RANKING_BACKTEST', { events, periods, factorId: o.factorId, selectionOrder: 'RANK_AT_DECISION_BEFORE_OUTCOME_LOOKUP',
    history: Profile.historyCoverage(o.factorSnapshots.filter(s => s.date <= o.asOf).map(s => s.date), o.asOf), interactions: 'Predeclared pairwise PIT rank correlations; joint causal models require separate registration.' });
}
function runEventStudy(o) {
  const c = context(o), h = horizonOf(o);
  if (!Array.isArray(o.events)) fail('EVENT_LEDGER_REQUIRED');
  workBudget(o.events.length*(h+100),o.events.length,'EVENT');
  const events = [], seen = new Set();
  for (const e of o.events) {
    text(e.eventId, 'EVENT_ID'); text(e.eventType, 'EVENT_TYPE'); text(e.sourceHash, 'EVENT_SOURCE_HASH');
    time(e.occurredAt); time(e.publishedAt); time(e.availableAt);
    if (time(e.availableAt) < time(e.publishedAt)) fail('EVENT_AVAILABLE_BEFORE_PUBLICATION');
    if (seen.has(e.eventId)) fail('DUPLICATE_EVENT_OR_REVISION'); seen.add(e.eventId);
    if (time(e.availableAt) > time(o.asOf + 'T23:59:59.999Z')) continue;
    if (e.revisionOf) fail('REVISED_EVENT_REQUIRES_SEPARATE_PREREGISTERED_RULE');
    const l = c.listings.find(l => l.listingId === e.listingId); if (!l) fail('EVENT_LISTING_NOT_IN_COHORT');
    if (!l.allCloseTimes) fail('EXPLICIT_SESSION_CLOSE_TIMES_REQUIRED');
    let lo=0,hi=l.bars.length;
    while(lo<hi){const mid=(lo+hi)>>1;if(time(l.bars[mid].closeAt)>time(e.availableAt))hi=mid;else lo=mid+1;}
    const entryIndex = lo < l.bars.length ? lo : -1;
    if (entryIndex < 0) { events.push({ eventId: e.eventId, listingId: e.listingId, issuerId: l.issuerId, signalDate: e.availableAt.slice(0, 10), timeCluster: e.availableAt.slice(0, 10), state: c.o.expectedCalendar?.some(d => d > e.availableAt.slice(0, 10) && d <= c.o.asOf) ? 'CENSORED' : 'IMMATURE', completed: false, reasons: ['NEXT_SESSION_NOT_OBSERVED'] }); continue; }
    // Virtual signal preceding first eligible close permits pre-open events on the first supplied session.
    const signal = { date: e.availableAt.slice(0, 10), close: l.bars[entryIndex].close, availableAt: e.availableAt, sourceHash: e.sourceHash };
    const outcome = eventOutcome(c, l, entryIndex-1, h, { entryIndex: entryIndex+c.entryDelayBars-1, timeCluster: e.availableAt.slice(0, 10), eventTiming: true, priceFeatureLookback: 0, signalBar: signal });
    const actualErrors = identityErrors(l, e.availableAt.slice(0, 10), e.availableAt);
    events.push({ eventId: e.eventId, eventType: e.eventType, ...outcome, signalDate: e.availableAt.slice(0, 10),
      ...(actualErrors.length ? { state: 'INELIGIBLE', completed: false, reasons: actualErrors } : {}) });
  }
  return finish(c, 'EVENT_DRIVEN', { events, entryModel: 'FIRST_EXPLICIT_SESSION_CLOSE_STRICTLY_AFTER_AVAILABILITY',
    scope: 'EVENT_STUDY_NO_GUARANTEED_LIVE_FILL', revisionPolicy: 'ORIGINAL_IMMUTABLE_EVENTS_ONLY' });
}
function classifyRegimes(o) {
  date(o.asOf);
  if (!['EX_POST_DESCRIPTIVE', 'PIT_AVAILABLE'].includes(o.mode)) fail('REGIME_MODE_REQUIRED');
  const lookback = integer(o.lookbackBars, 'TREND_LOOKBACK'), volLookback = integer(o.volatilityLookbackBars, 'VOLATILITY_LOOKBACK', 2);
  const band = num(o.trendBand, 'TREND_BAND', 0), volThreshold = positive(o.volatilityThreshold, 'VOLATILITY_THRESHOLD'), annualization = positive(o.annualization, 'ANNUALIZATION');
  const bars = barsOf(o.bars, o.asOf), out = [];
  workBudget(bars.length*(Math.max(lookback,volLookback)+20),bars.length,'REGIME');
  for (let k = Math.max(lookback, volLookback); k < bars.length; k++) {
    const used = bars.slice(k - Math.max(lookback, volLookback), k + 1);
    if (o.mode === 'PIT_AVAILABLE' && used.some(b => !b.availableAt || !b.sourceHash)) fail('REGIME_PRICE_VINTAGE_MISSING');
    if (o.mode === 'PIT_AVAILABLE' && used.some(b => time(b.availableAt) > time(o.asOf + 'T23:59:59.999Z'))) fail('REGIME_INPUT_NOT_AVAILABLE_AS_OF');
    const trendReturn = bars[k].close / bars[k - lookback].close - 1;
    const rets = bars.slice(k - volLookback + 1, k + 1).map((b, j) => b.close / bars[k - volLookback + j].close - 1);
    const mean = avg(rets), volatility = Math.sqrt(rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1)) * Math.sqrt(annualization);
    const trend = trendReturn > band ? 'POSITIVE_TREND' : trendReturn < -band ? 'NEGATIVE_TREND' : 'SIDEWAYS';
    const vol = volatility >= volThreshold ? 'HIGH_VOLATILITY' : 'LOW_VOLATILITY';
    const stress = (o.stressWindows || []).filter(w => {
      date(w.from); date(w.to); text(w.label, 'STRESS_LABEL'); text(w.sourceHash, 'STRESS_SOURCE_HASH');
      if (w.from > w.to) fail('INVALID_STRESS_WINDOW');
      if (o.mode === 'PIT_AVAILABLE' && (!w.declaredAt || time(w.declaredAt) > time(bars[k].date + 'T00:00:00Z'))) return false;
      return w.from <= bars[k].date && w.to >= bars[k].date;
    }).map(w => w.label);
    const availableAt = o.mode === 'PIT_AVAILABLE' ? new Date(Math.max(...used.map(b => time(b.availableAt)))).toISOString() : null;
    const record = { date: bars[k].date, state: trend, volatilityState: vol, trendReturn, volatility, stress,
      mode: o.mode, sourceHash: hash({ used, lookback, volLookback, band, volThreshold, annualization }) };
    if (availableAt) record.availableAt = availableAt;
    out.push(record);
  }
  const result = { schemaVersion: VERSION, kind: 'SUPPLEMENTAL_TREND_VOLATILITY_REGIMES', mode: o.mode, regimes: out,
    replacesActiveMarketRegimeHistory: false, certification: 'NOT_CERTIFIED', productionApproved: false,
    inputHash: hash(o), calculationProvenance: calculationProvenance() };
  return { ...result, resultHash: hash(result) };
}
function analyzeRegimes(o) {
  if (!['EX_POST_DESCRIPTIVE', 'PIT_AVAILABLE'].includes(o.mode)) fail('REGIME_MODE_REQUIRED');
  if (!Array.isArray(o.regimes) || !Array.isArray(o.observations)) fail('REGIME_INPUT_REQUIRED');
  workBudget(o.regimes.length+o.observations.length*10,o.regimes.length+o.observations.length,'REGIME_GROUPING');
  const regimes = new Map();
  for (const r of o.regimes) {
    date(r.date); text(r.state, 'REGIME_STATE'); text(r.sourceHash, 'REGIME_HASH');
    if (regimes.has(r.date)) fail('DUPLICATE_REGIME'); if (o.mode === 'PIT_AVAILABLE') time(r.availableAt);
    regimes.set(r.date, r);
  }
  const grouped = Object.create(null), unknown = [];
  for (const e of o.observations) {
    date(e.signalDate); num(e.netReturn, 'RETURN', -1); text(e.listingId, 'LISTING_ID'); text(e.issuerId, 'ISSUER_ID');
    const r = regimes.get(e.signalDate);
    if (!r || (o.mode === 'PIT_AVAILABLE' && (!e.decisionAt || time(r.availableAt) > time(e.decisionAt)))) { unknown.push({ ...e, reason: r ? 'REGIME_NOT_AVAILABLE_AT_DECISION' : 'REGIME_MISSING' }); continue; }
    if (!grouped[r.state]) grouped[r.state] = []; grouped[r.state].push({ ...e, timeCluster: e.timeCluster || e.signalDate });
  }
  const ordered = [...regimes.values()].sort((a, b) => a.date.localeCompare(b.date)), episodes = Object.create(null);
  let previous = null; for (const r of ordered) { if (r.state !== previous) episodes[r.state] = (episodes[r.state] || 0) + 1; previous = r.state; }
  const result = { schemaVersion: VERSION, kind: 'MARKET_REGIMES', mode: o.mode, productionApproved: false, certification: 'NOT_CERTIFIED',
    states: Object.keys(grouped).sort().map(state => ({ state, episodes: episodes[state] || 0, statistics: inference(grouped[state]) })),
    unmatched: unknown, scope: o.mode === 'EX_POST_DESCRIPTIVE' ? 'POST_HOC_CONDITIONING_NOT_HISTORICALLY_AVAILABLE_SIGNAL' : 'SUPPLIED_PIT_REGIME_LEDGER_REQUIRES_EXTERNAL_SOURCE_AUDIT', inputHash: hash(o), calculationProvenance: calculationProvenance() };
  return { ...result, resultHash: hash(result) };
}
module.exports = { VERSION, BUDGETS, runSignalStudy, runReplayValidation, runPatternStudy, buildSetupStates, runSetupStudy, runFactorStudy, runEventStudy, classifyRegimes, analyzeRegimes, inference, rankCorrelation, hash };
