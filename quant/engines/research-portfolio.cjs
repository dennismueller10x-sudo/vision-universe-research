'use strict';

// Versioned raw-price ledger. Legacy selection/scheduling is reused; legacy
// carried-price and last-price delisting liquidations are deliberately excluded.
// 1.2.0 adds source-evidenced corporate-action types without changing any
// result of inputs that do not use them: SPINOFF, ADS successor listings,
// informationAvailableAt (entitlement separated from information time) and
// cash with a NOT_STATED pay date (claim never credited, reported separately).
const crypto = require('node:crypto');
const fs = require('node:fs');
const Profile = require('./profile-backtest.js');
const Legacy = require('./backtest.js');
const VERSION = 'research-portfolio-1.2.0';
const INFORMATION_TIME_TYPES = ['CASH_DIVIDEND', 'TERMINAL_CASH', 'TERMINAL_EXCHANGE', 'SPINOFF'];
const HASH = /^[a-f0-9]{64}$/;
const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function fail(code, detail) { const e = new Error(code + (detail ? ': ' + detail : '')); e.code = code; throw e; }
function finite(x, code, min = -Infinity) { if (typeof x !== 'number' || !Number.isFinite(x) || x < min) fail(code); return x; }
function date(x) { if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x) || !Number.isFinite(Date.parse(x)) || new Date(x).toISOString().slice(0, 10) !== x) fail('INVALID_DATE'); return x; }
function instant(x) { if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(x) || !Number.isFinite(Date.parse(x))) fail('INVALID_TIMESTAMP'); return Date.parse(x); }
function id(x) { if (typeof x !== 'string' || !/^[A-Za-z0-9_:./-]{1,160}$/.test(x) || ['__proto__', 'constructor', 'prototype'].includes(x)) fail('INVALID_ID'); return x; }
function hashRef(x) { if (!HASH.test(x)) fail('SOURCE_HASH_REQUIRED'); return x; }
function canonical(x) {
  if (x === null || typeof x === 'string' || typeof x === 'boolean') return JSON.stringify(x);
  if (typeof x === 'number') { finite(x, 'NONFINITE_HASH_INPUT'); return JSON.stringify(x); }
  if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']';
  if (x && typeof x === 'object' && Object.getPrototypeOf(x) === Object.prototype) return '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + canonical(x[k])).join(',') + '}';
  fail('NON_JSON_INPUT');
}
const sha = x => crypto.createHash('sha256').update(typeof x === 'string' ? x : canonical(x)).digest('hex');
let runtime;
function runtimeIdentity() {
  if (!runtime) runtime = { node: process.version, v8: process.versions.v8, icu: process.versions.icu || null, platform: process.platform, arch: process.arch, glibc: process.report?.getReport().header.glibcVersionRuntime || null, nodeBinaryHash: crypto.createHash('sha256').update(fs.readFileSync(process.execPath)).digest('hex') };
  return { ...runtime };
}
function sourceIdentity() {
  return Object.fromEntries(['research-portfolio.cjs', 'profile-backtest.js', 'backtest.js'].map(p => [p, crypto.createHash('sha256').update(fs.readFileSync(require.resolve('./' + p))).digest('hex')]));
}
function requireArray(x, code) { if (!Array.isArray(x)) fail(code); return x; }
function latestEligible(snapshots, decisionAt) {
  const t = instant(decisionAt);
  const eligible = snapshots.filter(s => instant(s.availableAt) <= t && instant(s.effectiveAt) <= t);
  // latestBefore is strict: +1 millisecond expresses inclusive available-at <=.
  return Profile.latestBefore(eligible.map(s => ({ ...s, asOf: new Date(instant(s.effectiveAt)).toISOString() })).sort((a, b) => instant(a.asOf) - instant(b.asOf) || instant(a.availableAt) - instant(b.availableAt)), new Date(t + 1).toISOString());
}
function buildSchedule(sessions, frequency = 'monthly', everySessions = 1) {
  validateSessions(sessions);
  const dates = sessions.map(s => s.date);
  let indices;
  if (frequency === 'monthly' || frequency === 'quarterly') indices = Legacy.rebalanceIndices(dates, dates[0], dates.at(-1), frequency);
  else if (frequency === 'sessions') {
    if (!Number.isInteger(everySessions) || everySessions < 1) fail('INVALID_INTERVAL');
    indices = dates.map((_, i) => i).filter(i => i % everySessions === 0 && i + 1 < dates.length);
  } else fail('UNSUPPORTED_FREQUENCY');
  return indices.map(i => ({ decisionDate: dates[i], executionDate: dates[i + 1] }));
}
function validateSessions(sessions) {
  requireArray(sessions, 'SESSIONS_REQUIRED');
  if (!sessions.length || sessions.length > 30000) fail('SESSION_BUDGET');
  sessions.forEach((s, i) => {
    date(s.date); instant(s.closeAt);
    if (s.closeAt.slice(0, 10) !== s.date || (i && (s.date <= sessions[i - 1].date || instant(s.closeAt) <= instant(sessions[i - 1].closeAt)))) fail('INVALID_SESSION_ORDER');
  });
}
function validateSnapshots(list, kind, listings) {
  const seen = new Set(), times = new Set();
  requireArray(list, kind + '_REQUIRED').forEach(s => {
    instant(s.availableAt); instant(s.effectiveAt); hashRef(s.sourceHash);
    if (seen.has(s.sourceHash)) fail('DUPLICATE_SNAPSHOT_HASH'); seen.add(s.sourceHash);
    const pair = instant(s.effectiveAt) + '/' + instant(s.availableAt);
    if (times.has(pair)) fail('AMBIGUOUS_SNAPSHOT_VINTAGE'); times.add(pair);
    if (kind === 'MEMBERSHIP') {
      requireArray(s.members, 'MEMBERS_REQUIRED');
      if (new Set(s.members).size !== s.members.length || s.members.some(m => !listings.has(m))) fail('MEMBERSHIP_IDENTITY');
    } else {
      if (!s.rows || typeof s.rows !== 'object' || Array.isArray(s.rows)) fail('FACTOR_ROWS_REQUIRED');
      Object.entries(s.rows).forEach(([k, row]) => {
        if (!listings.has(k) || !row || typeof row !== 'object') fail('FACTOR_IDENTITY');
        Object.values(row).forEach(v => { if (v !== null) finite(v, 'INVALID_FACTOR'); });
        if (!s.rowAvailableAt || instant(s.rowAvailableAt[k]) > instant(s.availableAt)) fail('FACTOR_ROW_NOT_AVAILABLE');
      });
    }
  });
}
function buildProfileTargets(options) {
  validateSessions(options.sessions);
  if (!Number.isInteger(options.maxPositions) || options.maxPositions < 1) fail('INVALID_POSITION_LIMIT');
  if (!options.profile || !Array.isArray(options.profile.conditions)) fail('PROFILE_REQUIRED');
  options.profile.conditions.forEach(c => { id(c.id); finite(c.value, 'INVALID_PROFILE'); if (c.weight !== undefined) finite(c.weight, 'INVALID_PROFILE'); if (!['gt', 'gte', 'lt', 'lte'].includes(c.operator)) fail('INVALID_PROFILE_OPERATOR'); });
  const ids = new Map(options.listings.map(l => [l.listingId, l]));
  validateSnapshots(options.memberships, 'MEMBERSHIP', ids);
  validateSnapshots(options.factorSnapshots, 'FACTORS', ids);
  const byDate = new Map(options.sessions.map(s => [s.date, s]));
  return options.schedule.map(s => {
    const decision = byDate.get(s.decisionDate); if (!decision) fail('DECISION_SESSION_REQUIRED');
    const m = latestEligible(options.memberships, decision.closeAt), f = latestEligible(options.factorSnapshots, decision.closeAt);
    if (!m || !f) fail('PIT_SNAPSHOT_UNAVAILABLE');
    const picks = Profile.select(options.profile, m.members, f.rows, options.maxPositions);
    const weights = Legacy.targetWeights(picks.map(listingId => ({ securityId: listingId, rankScore: 1 })), { weighting: 'equal' });
    return { ...s, availableAt: decision.closeAt, membershipHash: m.sourceHash, factorSnapshotHash: f.sourceHash, weights, selectionKind: 'PROFILE' };
  });
}
function runPortfolio(input) {
  canonical(input); // Reject non-JSON/nonfinite values before hashing or finance.
  validateSessions(input.sessions);
  const sessions = input.sessions, dates = sessions.map(s => s.date), byDate = new Map(sessions.map((s, i) => [s.date, { ...s, i }]));
  const initialCapital = finite(input.initialCapital, 'INVALID_INITIAL_CAPITAL', Number.MIN_VALUE);
  if (typeof input.currency !== 'string' || !/^[A-Z]{3}$/.test(input.currency)) fail('CURRENCY_REQUIRED');
  const p = input.provenance;
  if (!p || !['SYNTHETIC_TEST', 'HISTORICAL_OBSERVED', 'HISTORICAL_PRICE_SIMULATION'].includes(p.mode)) fail('PROVENANCE_REQUIRED');
  hashRef(p.datasetHash);
  const priceSimulation = p.mode === 'HISTORICAL_PRICE_SIMULATION';
  if (priceSimulation && (input.returnBasis !== 'PRICE_RETURN' || p.priceSeriesType !== 'SPLIT_ADJUSTED' || p.populationBasis !== 'CONDITIONAL_FIXED_CURRENT_COHORT' || p.clockBasis !== 'MODELED_WEEK_END_DATE' || input.listings.some(l => l.events.length || l.lastTradeDate !== null) || input.targets.some(t => t.factorSnapshotHash || t.selectionKind === 'PROFILE'))) fail('INVALID_CONDITIONAL_PRICE_SIMULATION');
  const returnBasis = priceSimulation ? 'PRICE_RETURN' : 'TOTAL_RETURN';
  if (p.mode === 'HISTORICAL_OBSERVED') {
    for (const field of ['identityEvidence', 'populationEvidence', 'corporateActionEvidence', 'lifecycleEvidence', 'licenseEvidence']) hashRef(p[field]);
    if (p.historicalPopulation !== 'ALL_THEN_TRADEABLE_LISTINGS' && p.historicalPopulation !== 'HISTORICAL_INDEX_MEMBERSHIP' && p.historicalPopulation !== 'CUSTOM_STRATEGY_UNIVERSE') fail('HISTORICAL_POPULATION_REQUIRED');
    if (p.unresolvedIdentityCount !== 0 || p.unresolvedTerminalCount !== 0) fail('UNRESOLVED_HISTORICAL_INPUT');
  }
  const costs = input.costs;
  if (!costs || costs.basis !== 'PER_SIDE_NOTIONAL') fail('COST_BASIS_REQUIRED');
  const feeRate = finite(costs.feeBps, 'INVALID_FEE', 0) / 10000;
  const slipRate = finite(costs.slippageBps, 'INVALID_SLIPPAGE', 0) / 10000, rate = feeRate + slipRate;
  if (rate >= 1) fail('INVALID_COST_RATE');
  if (input.liquidity) {
    if (finite(input.liquidity.maxParticipation, 'INVALID_PARTICIPATION', Number.MIN_VALUE) > 1) fail('INVALID_PARTICIPATION');
    hashRef(input.liquidity.sourceHash);
  }
  finite(input.maxMembershipAgeDays, 'MEMBERSHIP_AGE_REQUIRED', 0);
  finite(input.maxFactorAgeDays, 'FACTOR_AGE_REQUIRED', 0);
  if (input.driftThreshold !== undefined && (finite(input.driftThreshold, 'INVALID_DRIFT', 0) > 1)) fail('INVALID_DRIFT');
  const listings = new Map(), allEvents = [], eventIds = new Set();
  let barCount = 0;
  requireArray(input.listings, 'LISTINGS_REQUIRED');
  if (input.listings.length > 30000 || input.listings.length * sessions.length > 2000000) fail('PORTFOLIO_OPERATION_BUDGET');
  for (const l of input.listings) {
    id(l.listingId); id(l.issuerId); date(l.firstTradeDate); if (l.lastTradeDate !== null) date(l.lastTradeDate);
    // An ADS is never a primary listing; it is admitted only as terminal-exchange consideration (checked below).
    const classOk = l.instrumentClass === 'COMMON_STOCK' ? l.primary === true : l.instrumentClass === 'ADS' && l.primary === false;
    if (listings.has(l.listingId) || !['XNYS', 'XNAS', 'XASE'].includes(l.mic) || !classOk || l.currency !== input.currency || (l.lastTradeDate && l.lastTradeDate < l.firstTradeDate)) fail('LISTING_IDENTITY_INELIGIBLE', l.listingId);
    const bars = new Map();
    requireArray(l.bars, 'BARS_REQUIRED');
    barCount += l.bars.length;
    if (barCount > 250000) fail('BAR_MEMORY_BUDGET');
    l.bars.forEach((b, i) => {
      date(b.date); instant(b.availableAt); finite(b.close, 'INVALID_RAW_PRICE', Number.MIN_VALUE);
      if (bars.has(b.date) || (i && l.bars[i - 1].date >= b.date) || b.date < l.firstTradeDate || (l.lastTradeDate && b.date > l.lastTradeDate)) fail('INVALID_BAR_IDENTITY');
      bars.set(b.date, b);
    });
    listings.set(l.listingId, { ...l, barMap: bars });
    requireArray(l.events, 'EVENTS_REQUIRED').forEach(e => {
      id(e.id); date(e.effectiveDate);
      // Either legacy availableAt (event must be known by its entitlement session close) or
      // informationAvailableAt (applied at entitlement regardless; decisions before it fail).
      if (e.informationAvailableAt !== undefined) {
        if (!INFORMATION_TIME_TYPES.includes(e.type) || e.availableAt !== undefined) fail('AMBIGUOUS_EVENT_AVAILABILITY', e.id);
        instant(e.informationAvailableAt);
      } else if (e.type === 'SPINOFF') fail('INFORMATION_TIME_REQUIRED', e.id);
      else instant(e.availableAt);
      hashRef(e.sourceHash);
      if (!Number.isInteger(e.sequence) || e.sequence < 0 || eventIds.has(e.id)) fail('INVALID_EVENT_SEQUENCE');
      eventIds.add(e.id);
      if (!['SPLIT', 'CASH_DIVIDEND', 'TERMINAL_CASH', 'TERMINAL_EXCHANGE', 'SPINOFF'].includes(e.type)) fail('UNSUPPORTED_CORPORATE_ACTION');
      if (e.type === 'SPLIT') finite(e.ratio, 'INVALID_SPLIT', Number.MIN_VALUE);
      else if (e.type === 'SPINOFF') {
        // Cost-basis neutral unit distribution: no cash leg, no pay date.
        id(e.distributedListingId); finite(e.shareRatio, 'INVALID_SPINOFF_RATIO', Number.MIN_VALUE);
        if (e.amount !== undefined || e.payDate !== undefined || e.payDateState !== undefined) fail('SPINOFF_CASH_NOT_SUPPORTED', e.id);
      } else {
        // payDate null is accepted only with the explicit sourced state NOT_STATED.
        const notStated = e.payDate === null && e.payDateState === 'NOT_STATED';
        if (!notStated) { if (e.payDateState !== undefined) fail('INVALID_PAY_DATE_STATE', e.id); date(e.payDate); }
        finite(e.amount, 'UNKNOWN_EVENT_VALUE', 0);
        if ((!notStated && e.payDate < e.effectiveDate) || e.currency !== input.currency) fail('INVALID_EVENT_CASH');
      }
      if (e.type === 'TERMINAL_EXCHANGE') { id(e.successorListingId); finite(e.shareRatio, 'INVALID_EXCHANGE_RATIO', Number.MIN_VALUE); }
      allEvents.push({ ...e, listingId: l.listingId });
    });
  }
  if (!listings.size || allEvents.length > 100000) fail('PORTFOLIO_INPUT_BUDGET');
  const spinoffKeys = new Set();
  for (const l of listings.values()) {
    // ADS: successor-only consideration of a terminal exchange; own distributions are not modelled.
    if (l.instrumentClass === 'ADS' && (l.events.length || !allEvents.some(e => e.type === 'TERMINAL_EXCHANGE' && e.successorListingId === l.listingId))) fail('ADS_SUCCESSOR_ONLY', l.listingId);
  }
  allEvents.sort((a, b) => cmp(a.effectiveDate, b.effectiveDate) || a.sequence - b.sequence || cmp(a.id, b.id));
  allEvents.forEach((e, i) => {
    if (i && e.effectiveDate === allEvents[i - 1].effectiveDate && e.sequence === allEvents[i - 1].sequence) fail('AMBIGUOUS_EVENT_ORDER');
    if (e.type === 'TERMINAL_EXCHANGE' && (!listings.has(e.successorListingId) || e.successorListingId === e.listingId)) fail('UNKNOWN_SUCCESSOR');
    if (e.type === 'SPINOFF') {
      const d = listings.get(e.distributedListingId);
      if (!d || d.listingId === e.listingId) fail('UNKNOWN_DISTRIBUTED_LISTING', e.id);
      if (d.instrumentClass !== 'COMMON_STOCK') fail('ADS_SUCCESSOR_ONLY', d.listingId);
      // The distributed listing must trade, with an exact bar, from the ex-date session on.
      if (d.firstTradeDate > e.effectiveDate || (d.lastTradeDate && d.lastTradeDate < e.effectiveDate)) fail('DISTRIBUTED_LISTING_NOT_TRADING', e.id);
      if (e.effectiveDate >= dates[0] && e.effectiveDate <= dates.at(-1) && !d.barMap.has(e.effectiveDate)) fail('DISTRIBUTED_LISTING_PRICE_REQUIRED', e.id);
      const key = e.listingId + '>' + e.distributedListingId + '@' + e.effectiveDate;
      if (spinoffKeys.has(key)) fail('DUPLICATE_SPINOFF', e.id);
      spinoffKeys.add(key);
    }
    // Entitlement-changing events must land on an explicit valuation session.
    if (e.effectiveDate >= dates[0] && e.effectiveDate <= dates.at(-1) && !byDate.has(e.effectiveDate)) fail('EVENT_SESSION_REQUIRED');
  });
  validateSnapshots(input.memberships, 'MEMBERSHIP', listings);
  validateSnapshots(input.factorSnapshots || [], 'FACTORS', listings);
  requireArray(input.targets, 'TARGETS_REQUIRED');
  if ((input.memberships.length + (input.factorSnapshots || []).length) * input.targets.length > 2000000) fail('SNAPSHOT_OPERATION_BUDGET');
  const targetMap = new Map();
  requireArray(input.targets, 'TARGETS_REQUIRED').forEach(t => {
    const d = byDate.get(date(t.decisionDate)), e = byDate.get(date(t.executionDate));
    if (!d || !e || e.i !== d.i + 1 || targetMap.has(t.executionDate) || instant(t.availableAt) > instant(d.closeAt)) fail('EXECUTION_NOT_NEXT_SESSION');
    const m = latestEligible(input.memberships, d.closeAt);
    if (!m || m.sourceHash !== t.membershipHash || (instant(d.closeAt) - instant(m.effectiveAt)) / 86400000 > input.maxMembershipAgeDays) fail('MEMBERSHIP_UNAVAILABLE_OR_STALE');
    if (t.selectionKind === 'PROFILE' && !t.factorSnapshotHash) fail('FACTOR_SNAPSHOT_REQUIRED');
    if (t.factorSnapshotHash) {
      const f = latestEligible(input.factorSnapshots || [], d.closeAt);
      if (!f || f.sourceHash !== t.factorSnapshotHash || (instant(d.closeAt) - instant(f.effectiveAt)) / 86400000 > input.maxFactorAgeDays) fail('FACTOR_UNAVAILABLE_OR_STALE');
    }
    if (!t.weights || typeof t.weights !== 'object' || Array.isArray(t.weights)) fail('WEIGHTS_REQUIRED');
    let sum = 0;
    Object.entries(t.weights).forEach(([k, w]) => { finite(w, 'INVALID_WEIGHT', 0); if (!listings.has(k) || !m.members.includes(k)) fail('TARGET_OUTSIDE_PIT_UNIVERSE', k); if (w > 0 && listings.get(k).instrumentClass === 'ADS') fail('ADS_SUCCESSOR_ONLY', k); sum += w; });
    if (sum > 1 + 1e-12) fail('LEVERAGE_NOT_SUPPORTED');
    targetMap.set(t.executionDate, t);
  });
  const eventsByDate = new Map();
  allEvents.forEach(e => { if (!eventsByDate.has(e.effectiveDate)) eventsByDate.set(e.effectiveDate, []); eventsByDate.get(e.effectiveDate).push(e); });
  const benchmark = input.benchmark;
  if (!benchmark || benchmark.currency !== input.currency || benchmark.returnBasis !== returnBasis || benchmark.costPolicy !== 'PASSIVE_NO_TRANSACTION_COSTS') fail('BENCHMARK_CONTRACT_REQUIRED');
  hashRef(benchmark.sourceHash);
  const benchMap = new Map();
  requireArray(benchmark.levels, 'BENCHMARK_LEVELS_REQUIRED').forEach(b => { date(b.date); finite(b.level, 'INVALID_BENCHMARK_LEVEL', Number.MIN_VALUE); if (benchMap.has(b.date)) fail('DUPLICATE_BENCHMARK_DATE'); benchMap.set(b.date, b.level); });
  if (dates.some(d => !benchMap.has(d))) fail('BENCHMARK_UNAVAILABLE');
  let cash = initialCapital, totalFees = 0, totalSlippage = 0, turnover = 0;
  let holdings = new Map(), receivables = [], previousTarget = null;
  const equity = [], trades = [], eventLedger = [], rebalances = [], terminated = new Set();
  // New-feature state; inputs without the new fields never populate it and keep their result shape.
  const notStatedClaims = [], informationPending = [];
  const usesNotStated = allEvents.some(e => e.payDate === null), usesInformationTime = allEvents.some(e => e.informationAvailableAt !== undefined);
  const usesSpinoff = allEvents.some(e => e.type === 'SPINOFF'), usesAds = [...listings.values()].some(l => l.instrumentClass === 'ADS');
  let retainedPositionCells = 0;
  function price(k, session) {
    const l = listings.get(k), b = l.barMap.get(session.date);
    if (terminated.has(k) || session.date < l.firstTradeDate || (l.lastTradeDate && session.date > l.lastTradeDate)) fail('LISTING_NOT_TRADABLE', k + '@' + session.date);
    if (!b || instant(b.availableAt) > instant(session.closeAt)) fail('EXACT_PRICE_UNAVAILABLE', k + '@' + session.date);
    return b.close;
  }
  for (const session of sessions) {
    for (const e of eventsByDate.get(session.date) || []) {
      const informationTime = e.informationAvailableAt !== undefined;
      if (!informationTime && instant(e.availableAt) > instant(session.closeAt)) fail('EVENT_NOT_AVAILABLE', e.id);
      const units = holdings.get(e.listingId) || 0;
      if (informationTime && units) informationPending.push({ eventId: e.id, at: instant(e.informationAvailableAt) });
      if (e.type === 'SPLIT') { if (units) holdings.set(e.listingId, units * e.ratio); }
      else if (e.type === 'SPINOFF') {
        if (units) {
          const d = listings.get(e.distributedListingId);
          if (terminated.has(d.listingId)) fail('DISTRIBUTED_LISTING_NOT_TRADING', e.id);
          holdings.set(d.listingId, (holdings.get(d.listingId) || 0) + units * e.shareRatio);
        }
      } else {
        if (units && e.amount) {
          if (e.payDate === null) notStatedClaims.push({ eventId: e.id, listingId: e.listingId, entitlementDate: session.date, amount: units * e.amount, payDateState: 'NOT_STATED' });
          else receivables.push({ eventId: e.id, amount: units * e.amount, payDate: e.payDate });
        }
        if (e.type.startsWith('TERMINAL_')) {
          if (terminated.has(e.listingId)) fail('DUPLICATE_TERMINAL_EVENT');
          terminated.add(e.listingId); holdings.delete(e.listingId);
          if (e.type === 'TERMINAL_EXCHANGE' && units) {
            const successor = listings.get(e.successorListingId);
            if (session.date < successor.firstTradeDate || (successor.lastTradeDate && session.date > successor.lastTradeDate) || terminated.has(successor.listingId)) fail('SUCCESSOR_NOT_VALID');
            holdings.set(e.successorListingId, (holdings.get(e.successorListingId) || 0) + units * e.shareRatio);
          }
        }
      }
      const entry = { date: session.date, eventId: e.id, listingId: e.listingId, type: e.type, entitlementUnits: units, sourceHash: e.sourceHash };
      if (informationTime) entry.informationAvailableAt = e.informationAvailableAt;
      if (e.payDate === null) entry.payDateState = 'NOT_STATED';
      eventLedger.push(entry);
    }
    const due = receivables.filter(r => r.payDate <= session.date);
    cash += due.reduce((s, r) => s + r.amount, 0);
    receivables = receivables.filter(r => r.payDate > session.date);
    const marked = new Map([...holdings].map(([k, units]) => [k, units * price(k, session)]));
    const claims = receivables.reduce((s, r) => s + r.amount, 0);
    const before = cash + claims + [...marked.values()].reduce((a, b) => a + b, 0);
    const t = targetMap.get(session.date);
    if (t) {
      // A decision taken before an applied event became known cannot rely on the state it changed.
      const decisionAt = instant(byDate.get(t.decisionDate).closeAt), unknown = informationPending.find(x => x.at > decisionAt);
      if (unknown) fail('DECISION_BEFORE_EVENT_INFORMATION', unknown.eventId + '@' + t.decisionDate);
      const weights = t.weights, keys = [...new Set([...holdings.keys(), ...Object.keys(weights)])].sort();
      keys.forEach(k => price(k, session));
      const drift = Math.max(0, ...keys.map(k => Math.abs((before ? (marked.get(k) || 0) / before : 0) - (weights[k] || 0))));
      const unchanged = previousTarget !== null && canonical(previousTarget) === canonical(weights);
      if (input.driftThreshold !== undefined && unchanged && drift <= input.driftThreshold) rebalances.push({ date: session.date, decisionDate: t.decisionDate, skipped: true, drift, turnover: 0, fees: 0, slippage: 0 });
      else {
        // Receivables are equity, but cannot fund orders before payment. The
        // requested allocation must leave enough cash weight to cover claims.
        const available = before - claims, sumWeights = Object.values(weights).reduce((s, w) => s + w, 0);
        let lo = 0, hi = before;
        const costAt = v => keys.reduce((s, k) => s + Math.abs((weights[k] || 0) * v - (marked.get(k) || 0)), 0) * rate;
        for (let j = 0; j < 80; j++) { const mid = (lo + hi) / 2; if (mid + costAt(mid) > before) hi = mid; else lo = mid; }
        const after = (lo + hi) / 2;
        if (sumWeights * after > available - costAt(after) + 1e-9 * initialCapital) fail('UNSETTLED_CASH_NOT_INVESTABLE');
        let traded = 0, fees = 0, slippage = 0;
        const deltas = keys.map(k => ({ k, delta: (weights[k] || 0) * after - (marked.get(k) || 0) })).sort((a, b) => a.delta - b.delta || cmp(a.k, b.k));
        for (const { k, delta } of deltas) {
          if (Math.abs(delta) <= 1e-12 * initialCapital) continue;
          const rawPrice = price(k, session), notional = Math.abs(delta), fee = notional * feeRate, slip = notional * slipRate;
          if (input.liquidity) {
            const dollarVolume = finite(listings.get(k).barMap.get(session.date).dollarVolume, 'LIQUIDITY_DATA_UNAVAILABLE', 0);
            if (notional > dollarVolume * input.liquidity.maxParticipation) fail('LIQUIDITY_CAPACITY_EXCEEDED', k);
          }
          // Full exit (target weight 0): sell exactly the held units, so no scale-dependent rounding dust remains.
          const exit = !(weights[k] > 0) && holdings.has(k);
          const units = exit ? -holdings.get(k) : delta / rawPrice;
          cash -= delta + fee + slip;
          const newUnits = (holdings.get(k) || 0) + units;
          if (newUnits < -1e-10) fail('NEGATIVE_UNITS');
          if (exit || Math.abs(newUnits) <= 1e-12) holdings.delete(k); else holdings.set(k, newUnits);
          trades.push({ date: session.date, decisionDate: t.decisionDate, listingId: k, side: delta > 0 ? 'BUY' : 'SELL', units: Math.abs(units), price: rawPrice, notional, fee, slippage: slip });
          traded += notional; fees += fee; slippage += slip;
        }
        if (cash < -1e-9 * initialCapital) fail('NEGATIVE_CASH');
        if (Math.abs(cash) < 1e-12 * initialCapital) cash = 0;
        totalFees += fees; totalSlippage += slippage; const turn = before > 0 ? traded / (2 * before) : 0; turnover += turn;
        rebalances.push({ date: session.date, decisionDate: t.decisionDate, skipped: false, drift, turnover: turn, fees, slippage, targetEquity: after });
        previousTarget = { ...weights };
      }
    }
    const positions = [...holdings].sort(([a], [b]) => cmp(a, b)).map(([listingId, units]) => ({ listingId, units, price: price(listingId, session) }));
    retainedPositionCells += positions.length;
    if (retainedPositionCells > 100000) fail('POSITION_HISTORY_MEMORY_BUDGET');
    const value = cash + claims + positions.reduce((s, h) => s + h.units * h.price, 0);
    if (!Number.isFinite(value) || value < 0) fail('INVALID_EQUITY');
    const row = { date: session.date, value, cash, receivables: claims, positions, benchmark: initialCapital * benchMap.get(session.date) / benchMap.get(dates[0]) };
    // NOT_STATED claims are entitlements without a sourced credit date: outside equity and cash.
    if (usesNotStated) row.notStatedClaims = notStatedClaims.reduce((s, c) => s + c.amount, 0);
    equity.push(row);
  }
  const values = [initialCapital, ...equity.map(e => e.value)], years = (Date.parse(dates.at(-1)) - Date.parse(dates[0])) / (365.25 * 86400000), endCapital = equity.at(-1).value;
  const result = { schemaVersion: VERSION, returnBasis, conditionalPriceSimulation: priceSimulation, currency: input.currency, mode: p.mode, certification: 'NOT_CERTIFIED', productionApproved: false,
    inputHash: sha(input), sourceHashes: sourceIdentity(), runtime: runtimeIdentity(), initialCapital, endCapital,
    equity, trades, eventLedger, rebalances, openReceivables: receivables,
    metrics: { cumulativeReturn: endCapital / initialCapital - 1, cagr: years > 0 ? Math.pow(endCapital / initialCapital, 1 / years) - 1 : null, maxDrawdown: Legacy.maxDrawdownOf(values), fees: totalFees, slippage: totalSlippage, oneWayTurnoverSum: turnover },
    limitations: [...(priceSimulation ? ['CONDITIONAL_CURRENT_SURVIVOR_COHORT_NOT_PIT_MEMBERSHIP','SPLIT_ADJUSTED_VIRTUAL_UNITS_NO_DIVIDENDS_OR_TERMINAL_VALUES','MODELED_CLOCK_NOT_HISTORICAL_PUBLICATION_TIMES'] : []), 'FRACTIONAL_LONG_ONLY', 'OBSERVED_NEXT_SESSION_CLOSE_MODEL_NOT_GUARANTEED_FILL', 'NO_CASH_INTEREST_OR_TAX', input.liquidity ? 'DAILY_DOLLAR_VOLUME_CAP_IS_NOT_CLOSE_AUCTION_CAPACITY' : 'NO_VOLUME_CAPACITY_MODEL', 'CASH_PAYMENTS_CREDITED_AT_FIRST_VALUATION_SESSION_ON_OR_AFTER_PAY_DATE', 'SOURCE_REFERENCES_REQUIRE_INDEPENDENT_AUDIT',
      ...(usesInformationTime ? ['EVENTS_APPLIED_AT_ENTITLEMENT_DECISIONS_BEFORE_INFORMATION_TIME_REJECTED'] : []),
      ...(usesSpinoff ? ['SPINOFF_UNITS_COST_BASIS_NEUTRAL_FRACTIONS_KEPT_NO_CASH_IN_LIEU'] : []),
      ...(usesAds ? ['ADS_SUCCESSOR_ONLY_NO_ADS_DISTRIBUTIONS_DEPOSITARY_FEES_OR_FX_MODELLED'] : []),
      ...(usesNotStated ? ['NOT_STATED_PAY_DATE_CLAIMS_EXCLUDED_FROM_EQUITY_NEVER_CREDITED_OR_INVESTABLE'] : [])] };
  if (usesNotStated) result.notStatedClaims = notStatedClaims;
  result.generation = sha({ version: VERSION, inputHash: result.inputHash, sourceHashes: result.sourceHashes, runtime: result.runtime });
  result.resultHash = sha(result);
  return result;
}

module.exports = { VERSION, runPortfolio, buildSchedule, buildProfileTargets, canonical, hash: sha };
