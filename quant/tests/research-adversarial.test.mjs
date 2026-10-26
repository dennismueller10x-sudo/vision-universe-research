import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const MC = require('../engines/research-monte-carlo.cjs');
const P = require('../engines/research-portfolio.cjs');
const V = require('../engines/research-validation.cjs');
const M = require('../engines/research-methodology.cjs');
const S = require('../engines/research-studies.cjs');
const H = 'a'.repeat(64), J = 'b'.repeat(64), K = 'c'.repeat(64);

function portfolioFixture() {
  const dates = ['2020-01-02', '2020-01-03', '2020-01-06', '2020-01-07'];
  const closeAt = date => `${date}T21:00:00Z`;
  return {
    sessions: dates.map(date => ({ date, closeAt: closeAt(date) })),
    initialCapital: 1000, currency: 'USD',
    provenance: { mode: 'SYNTHETIC_TEST', datasetHash: H },
    costs: { basis: 'PER_SIDE_NOTIONAL', feeBps: 75, slippageBps: 25 },
    maxMembershipAgeDays: 45, maxFactorAgeDays: 45,
    listings: ['A', 'B'].map(listingId => ({
      listingId, issuerId: `ISSUER_${listingId}`, mic: 'XNAS',
      instrumentClass: 'COMMON_STOCK', primary: true, currency: 'USD',
      firstTradeDate: '2010-01-01', lastTradeDate: null,
      bars: dates.map((date, i) => ({ date, availableAt: closeAt(date), close: i < 2 ? 100 : 110 })), events: []
    })),
    memberships: [{ effectiveAt: '2020-01-02T20:00:00Z', availableAt: '2020-01-02T20:00:00Z', sourceHash: H, members: ['A'] }],
    factorSnapshots: [],
    targets: [
      { decisionDate: dates[0], executionDate: dates[1], availableAt: closeAt(dates[0]), membershipHash: H, weights: { A: 1 } },
      { decisionDate: dates[1], executionDate: dates[2], availableAt: closeAt(dates[1]), membershipHash: H, weights: {} }
    ],
    benchmark: { currency: 'USD', returnBasis: 'TOTAL_RETURN', sourceHash: H, costPolicy: 'PASSIVE_NO_TRANSACTION_COSTS', levels: dates.map(date => ({ date, level: 100 })) }
  };
}

test('independent analytical round-trip: entry division and exit multiplication reconcile across portfolio and MC', () => {
  const x = portfolioFixture(), r = P.runPortfolio(x);
  const expected = 1000 / 1.01 * 1.10 * 0.99;
  assert.ok(Math.abs(r.endCapital - expected) < 1e-9);
  assert.ok(Math.abs(r.metrics.fees + r.metrics.slippage - (1000 / 1.01 + 1000 / 1.01 * 1.10) * 0.01) < 1e-9);
  const m = MC.runMonteCarlo({ model: 'TRADE_IID', seed: 17, simulations: 9, horizon: 1, initialCapital: 1000,
    observations: [{ date: '2020-01-01', return: 0.10 }, { date: '2020-02-01', return: 0.10 }],
    returnBasis: 'PRICE_RETURN', costs: { basis: 'PER_SIDE_NOTIONAL', modelVersion: 'INDEPENDENT_TEST', feeBps: 75, slippageBps: 25 },
    provenance: { sourceKind: 'SYNTHETIC_TEST', sourceHash: H, sourceVersion: 'INDEPENDENT_TEST', samplingUnit: 'NON_OVERLAPPING_TRADE', scope: 'ANALYTICAL_TEST_ONLY' } });
  assert.ok(Math.abs(m.distributions.endCapital.min - expected) < 1e-9);
  assert.ok(Math.abs(m.distributions.endCapital.max - expected) < 1e-9);
  assert.equal(m.productionApproved, false);
});

test('late publication of an older membership state cannot roll the current universe back', () => {
  const x = portfolioFixture();
  x.memberships.push(
    { effectiveAt: '2020-01-01T20:00:00Z', availableAt: '2020-01-01T20:00:00Z', sourceHash: J, members: ['B'] },
    { effectiveAt: '2020-01-01T20:00:00Z', availableAt: '2020-01-02T20:30:00Z', sourceHash: K, members: ['B'] }
  );
  const r = P.runPortfolio(x);
  assert.equal(r.trades[0].listingId, 'A');
  assert.ok(Math.abs(r.endCapital - 1000 / 1.01 * 1.10 * 0.99) < 1e-9);
});

test('finite Monte Carlo sample extrema are not asserted as confidence bounds on unsampled tails', () => {
  const r = MC.runMonteCarlo({ model: 'TRADE_IID', seed: 1, simulations: 1, horizon: 1, initialCapital: 1000,
    observations: [{ date: '2020-01-01', return: -1 }, { date: '2020-02-01', return: 0 }],
    returnBasis: 'PRICE_RETURN', percentiles: [0, 0.01, 0.99, 1], costs: { basis: 'ALREADY_NET', modelVersion: 'TEST' },
    provenance: { sourceKind: 'SYNTHETIC_TEST', sourceHash: H, sourceVersion: 'TEST', samplingUnit: 'NON_OVERLAPPING_TRADE', scope: 'TAIL_TEST_ONLY' } });
  for (const q of r.distributions.endCapital.quantiles) {
    assert.deepEqual(q.conditionalMonteCarloBand, [null, null]);
    assert.deepEqual(q.conditionalMonteCarloBandBounds, ['UNBOUNDED', 'UNBOUNDED']);
  }
});

test('delayed label availability excludes an otherwise ended training outcome at the fit boundary', () => {
  const day = i => new Date(Date.UTC(2020, 0, i + 1)).toISOString().slice(0, 10);
  const config = { calendar: Array.from({ length: 9 }, (_, i) => day(i)), trainSize: 3, validationSize: 2, testSize: 2, mode: 'ROLLING', asOf: day(8) };
  const outcome = { id: 'LATE', informationStart: day(0), decisionAt: day(0), availableAt: day(0), outcomeEnd: day(1), outcomeAvailableAt: day(3) };
  const r = V.buildWalkForward(config, [outcome]);
  assert.deepEqual(r.folds[0].train, []);
  assert.ok(r.folds[0].excluded.some(x => x.id === 'LATE' && x.reason === 'OUTCOME_NOT_MATURE_AT_CUTOFF'));
});

test('coverage ledger rejects an observed result purportedly available before its declared maturity', () => {
  assert.throws(() => M.outcomeCoverage({ expected: [{ id: 'E', maturesAt: '2020-07-01T00:00:00Z' }],
    outcomes: [{ id: 'E', state: 'OBSERVED', value: 0.1, availableAt: '2020-01-01T00:00:00Z' }],
    asOf: '2020-08-01T00:00:00Z' }), /MATUR|AVAILAB|FUTURE/);
});

function studyFixture() {
  const calendar = ['2020-01-02', '2020-01-03', '2020-01-06', '2020-01-07', '2020-01-08'];
  const listing = id => ({ listingId: id, issuerId: `issuer:${id}`,
    identity: { mic: 'XNYS', instrumentClass: 'COMMON_STOCK', primary: true, validFrom: '2010-01-01', availableAt: '2010-01-01T00:00:00Z', sourceHash: H },
    membership: [{ validFrom: '2010-01-01', availableAt: '2010-01-01T00:00:00Z', sourceHash: H }],
    bars: calendar.map((date, i) => ({ date, close: 100 + 10 * i, returnLevel: 100 + 10 * i, closeAt: `${date}T21:00:00Z`, availableAt: `${date}T21:01:00Z`, sourceHash: H })) });
  return { asOf: calendar.at(-1), sourceMode: 'HISTORICAL_SIMULATION', returnBasis: 'TOTAL_RETURN', currency: 'USD', expectedCalendar: calendar,
    registration: { id: 'INDEPENDENT_REVIEW_FIXTURE', version: '1', frozenAt: '2019-01-01T00:00:00Z', analysisMode: 'EXPLORATORY' },
    horizonBars: 1, costs: { basis: 'PER_SIDE_NOTIONAL', feeBps: 0, slippageBps: 0 }, listings: [listing('A'), listing('B')] };
}

test('after-close event enters the next observed session and its outcome matches an independent price ratio', () => {
  const x = studyFixture(); x.events = [{ eventId: 'AFTER_CLOSE', eventType: 'FILING', listingId: 'A', occurredAt: '2020-01-02T21:30:00Z', publishedAt: '2020-01-02T21:30:00Z', availableAt: '2020-01-02T21:30:00Z', sourceHash: H }];
  const r = S.runEventStudy(x), e = r.events[0];
  assert.equal(e.entryDate, '2020-01-03'); assert.equal(e.exitDate, '2020-01-06');
  assert.equal(e.netReturn, 120 / 110 - 1);
  assert.equal(e.completed, true); assert.equal(r.productionApproved, false);
});

test('mature missing factor outcomes remain censored in their pre-outcome buckets', () => {
  const x = studyFixture(); x.listings[1].bars = x.listings[1].bars.slice(0, 2);
  x.buckets = 2; x.factorId = 'REVIEW_FACTOR';
  x.factorSnapshots = [{ date: '2020-01-02', availableAt: '2020-01-02T21:30:00Z', sourceHash: H,
    rows: [{ listingId: 'A', value: 1, availableAt: '2020-01-02T20:00:00Z', sourceHash: H }, { listingId: 'B', value: 2, availableAt: '2020-01-02T20:00:00Z', sourceHash: H }] }];
  const r = S.runFactorStudy(x);
  assert.deepEqual(r.events.map(e => [e.listingId, e.bucket, e.state]), [['A', 0, 'OBSERVED'], ['B', 1, 'CENSORED']]);
  assert.equal(r.coverage.maturedDenominator, 2); assert.equal(r.coverage.observedShareMatured, 0.5);
  assert.equal(r.periods[0].topMinusBottom, null);
});

test('a later source gap cannot alter an already completed event or its eligibility', () => {
  const a = studyFixture(); a.asOf = '2020-01-06';
  a.events = [{ eventId: 'BEFORE_CLOSE', eventType: 'FILING', listingId: 'A', occurredAt: '2020-01-02T20:00:00Z', publishedAt: '2020-01-02T20:00:00Z', availableAt: '2020-01-02T20:00:00Z', sourceHash: H }];
  const before = S.runEventStudy(a);
  const b = structuredClone(a); b.asOf = '2020-01-08'; b.listings[0].bars = b.listings[0].bars.filter(row => row.date !== '2020-01-07');
  const after = S.runEventStudy(b);
  assert.equal(before.events[0].completed, true);
  assert.deepEqual(after.events, before.events);
});
