import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const P = require('../engines/research-portfolio.cjs');

// research-portfolio 1.2.0: SPINOFF, ADS successor, informationAvailableAt, NOT_STATED pay date.
// Synthetic fixtures only (SYNTHETIC_TEST); real sourced cases live in scripts/quant/v9-followups/ledger.
const H = 'a'.repeat(64), H2 = 'b'.repeat(64);
const closeAt = d => d + 'T21:00:00Z';
const dates = ['2020-01-02', '2020-01-03', '2020-01-06', '2020-01-07', '2020-01-08', '2020-01-09'];
function listing(listingId, close, extra = {}) {
  return { listingId, issuerId: 'ISSUER_' + listingId, mic: 'XNYS', instrumentClass: 'COMMON_STOCK', primary: true, currency: 'USD', firstTradeDate: '2010-01-01', lastTradeDate: null,
    bars: dates.map(date => ({ date, availableAt: closeAt(date), close })), events: [], ...extra };
}
function fixture() {
  return {
    sessions: dates.map(date => ({ date, closeAt: closeAt(date) })), initialCapital: 1000, currency: 'USD',
    provenance: { mode: 'SYNTHETIC_TEST', datasetHash: H }, costs: { basis: 'PER_SIDE_NOTIONAL', feeBps: 10, slippageBps: 5 },
    maxMembershipAgeDays: 45, maxFactorAgeDays: 45,
    listings: [listing('A', 100), listing('B', 50)],
    memberships: [{ effectiveAt: '2020-01-01T21:00:00Z', availableAt: '2020-01-01T21:00:00Z', sourceHash: H, members: ['A', 'B'] }], factorSnapshots: [],
    targets: [{ decisionDate: dates[0], executionDate: dates[1], availableAt: closeAt(dates[0]), membershipHash: H, weights: { A: 1 } }],
    benchmark: { currency: 'USD', returnBasis: 'TOTAL_RETURN', sourceHash: H, costPolicy: 'PASSIVE_NO_TRANSACTION_COSTS', levels: dates.map(date => ({ date, level: 100 })) }
  };
}
const target = (i, weights) => ({ decisionDate: dates[i], executionDate: dates[i + 1], availableAt: closeAt(dates[i]), membershipHash: H, weights });
const spin = (extra = {}) => ({ id: 'SPIN_A_B', type: 'SPINOFF', effectiveDate: dates[2], distributedListingId: 'B', shareRatio: 0.2, informationAvailableAt: '2020-01-01T00:00:00Z', sourceHash: H, sequence: 0, ...extra });
function near(a, b, eps = 1e-9) { assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} != ${b}`); }
function throws(code, fn) { assert.throws(fn, e => e.code === code, code); }
const units = 1000 / 1.0015 / 100;

test('SPINOFF adds distributed units at the ex-date session, cost-basis neutral, no cash and no trade', () => {
  const x = fixture();
  x.listings[0].events = [spin()];
  x.listings[0].bars = x.listings[0].bars.map((b, i) => ({ ...b, close: i < 2 ? 100 : 90 }));
  const r = P.runPortfolio(x);
  const row = r.equity[2], b = row.positions.find(p => p.listingId === 'B');
  near(b.units, units * 0.2); near(row.positions.find(p => p.listingId === 'A').units, units);
  near(row.value, units * 90 + units * 0.2 * 50); assert.equal(row.cash, 0);
  assert.equal(r.trades.length, 1); assert.equal(r.metrics.fees, units * 100 * 0.001);
  assert.deepEqual(r.eventLedger.map(e => [e.type, e.entitlementUnits, e.informationAvailableAt]), [['SPINOFF', units, '2020-01-01T00:00:00Z']]);
  assert.ok(r.limitations.includes('SPINOFF_UNITS_COST_BASIS_NEUTRAL_FRACTIONS_KEPT_NO_CASH_IN_LIEU'));
  assert.equal(r.schemaVersion, 'research-portfolio-1.2.0');
});

test('SPINOFF before its information time: applied at entitlement, but a decision before it fails', () => {
  const x = fixture();
  x.listings[0].events = [spin({ informationAvailableAt: '2020-01-06T22:00:00Z' })];
  // Without a later decision the event is applied although it became known only after the session close.
  const r = P.runPortfolio(x);
  near(r.equity[2].positions.find(p => p.listingId === 'B').units, units * 0.2);
  // Decision at the close of 2020-01-06 (before 22:00) executing 2020-01-07 cannot use the spin-off state.
  x.targets.push(target(2, { A: 0.5, B: 0.5 }));
  throws('DECISION_BEFORE_EVENT_INFORMATION', () => P.runPortfolio(x));
  // Decision before the ex-date but executed on it is equally blind to the event.
  const y = fixture(); y.listings[0].events = [spin({ informationAvailableAt: '2020-01-06T22:00:00Z' })]; y.targets.push(target(1, { A: 0.5 }));
  throws('DECISION_BEFORE_EVENT_INFORMATION', () => P.runPortfolio(y));
  // Once the information is out the same decision schedule is accepted.
  const z = fixture(); z.listings[0].events = [spin({ informationAvailableAt: '2020-01-06T20:00:00Z' })]; z.targets.push(target(2, { A: 0.5, B: 0.5 }));
  assert.ok(P.runPortfolio(z).endCapital > 0);
});

test('information time also separates entitlement for dividends and terminal events', () => {
  const x = fixture();
  x.listings[0].events = [{ id: 'DIV_A', type: 'CASH_DIVIDEND', effectiveDate: dates[2], payDate: dates[4], amount: 1, currency: 'USD', informationAvailableAt: '2020-01-08T00:00:00Z', sourceHash: H, sequence: 0 }];
  // Legacy availableAt after the entitlement close is still EVENT_NOT_AVAILABLE ...
  const legacy = structuredClone(x); legacy.listings[0].events[0].availableAt = '2020-01-08T00:00:00Z'; delete legacy.listings[0].events[0].informationAvailableAt;
  throws('EVENT_NOT_AVAILABLE', () => P.runPortfolio(legacy));
  // ... while informationAvailableAt books the entitlement and only blocks decisions before it.
  const r = P.runPortfolio(x);
  near(r.equity[2].receivables, units); near(r.equity[4].cash, units);
  x.targets.push(target(3, { A: 1 }));
  throws('DECISION_BEFORE_EVENT_INFORMATION', () => P.runPortfolio(x));
  const t = fixture();
  t.listings[0].lastTradeDate = dates[2]; t.listings[0].bars = t.listings[0].bars.slice(0, 3);
  t.listings[0].events = [{ id: 'END_A', type: 'TERMINAL_CASH', effectiveDate: dates[3], payDate: dates[5], amount: 101, currency: 'USD', informationAvailableAt: '2020-01-07T23:00:00Z', sourceHash: H, sequence: 0 }];
  t.targets.push(target(3, { B: 0.5 }));
  throws('DECISION_BEFORE_EVENT_INFORMATION', () => P.runPortfolio(t));
  // Known before the decision: the guard passes and the unpaid terminal claim stays non-investable.
  t.listings[0].events[0].informationAvailableAt = '2020-01-07T20:00:00Z';
  throws('UNSETTLED_CASH_NOT_INVESTABLE', () => P.runPortfolio(t));
});

test('event availability fields are unambiguous and type-restricted', () => {
  const both = fixture(); both.listings[0].events = [spin({ availableAt: '2020-01-01T00:00:00Z' })];
  throws('AMBIGUOUS_EVENT_AVAILABILITY', () => P.runPortfolio(both));
  const split = fixture(); split.listings[0].events = [{ id: 'S', type: 'SPLIT', effectiveDate: dates[2], ratio: 2, informationAvailableAt: '2020-01-01T00:00:00Z', sourceHash: H, sequence: 0 }];
  throws('AMBIGUOUS_EVENT_AVAILABILITY', () => P.runPortfolio(split));
  const none = fixture(); none.listings[0].events = [spin({ informationAvailableAt: undefined })]; delete none.listings[0].events[0].informationAvailableAt;
  throws('INFORMATION_TIME_REQUIRED', () => P.runPortfolio(none));
  const cash = fixture(); cash.listings[0].events = [spin({ amount: 1 })];
  throws('SPINOFF_CASH_NOT_SUPPORTED', () => P.runPortfolio(cash));
});

test('SPINOFF double application, self-distribution and missing distributed prices are rejected', () => {
  const dup = fixture(); dup.listings[0].events = [spin(), spin({ id: 'SPIN_A_B_COMPLETION', sequence: 1 })];
  throws('DUPLICATE_SPINOFF', () => P.runPortfolio(dup));
  const sameId = fixture(); sameId.listings[0].events = [spin(), spin({ sequence: 1 })];
  throws('INVALID_EVENT_SEQUENCE', () => P.runPortfolio(sameId));
  const self = fixture(); self.listings[0].events = [spin({ distributedListingId: 'A' })];
  throws('UNKNOWN_DISTRIBUTED_LISTING', () => P.runPortfolio(self));
  const unknown = fixture(); unknown.listings[0].events = [spin({ distributedListingId: 'Z' })];
  throws('UNKNOWN_DISTRIBUTED_LISTING', () => P.runPortfolio(unknown));
  const late = fixture(); late.listings[1].firstTradeDate = dates[3]; late.listings[1].bars = late.listings[1].bars.slice(3); late.listings[0].events = [spin()];
  throws('DISTRIBUTED_LISTING_NOT_TRADING', () => P.runPortfolio(late));
  const gap = fixture(); gap.listings[1].bars = gap.listings[1].bars.filter(b => b.date !== dates[2]); gap.listings[0].events = [spin()];
  throws('DISTRIBUTED_LISTING_PRICE_REQUIRED', () => P.runPortfolio(gap));
  const ratio = fixture(); ratio.listings[0].events = [spin({ shareRatio: 0 })];
  throws('INVALID_SPINOFF_RATIO', () => P.runPortfolio(ratio));
});

test('NOT_STATED pay date: claim is booked, never credited, never investable and reported separately', () => {
  const x = fixture();
  x.listings[0].events = [{ id: 'DIV_A', type: 'CASH_DIVIDEND', effectiveDate: dates[2], payDate: null, payDateState: 'NOT_STATED', amount: 1, currency: 'USD', availableAt: '2020-01-01T00:00:00Z', sourceHash: H, sequence: 0 }];
  x.targets.push(target(3, { A: 0.5 }));
  const r = P.runPortfolio(x);
  for (const row of r.equity.slice(2)) { near(row.notStatedClaims, units); assert.equal(row.receivables, 0); }
  assert.equal(r.openReceivables.length, 0);
  assert.deepEqual(r.notStatedClaims.map(c => [c.eventId, c.payDateState]), [['DIV_A', 'NOT_STATED']]); near(r.notStatedClaims[0].amount, units);
  // Equity, cash and the rebalance sizing exclude the claim: same as a run without the dividend.
  const without = fixture(); without.targets.push(target(3, { A: 0.5 }));
  const w = P.runPortfolio(without);
  near(r.endCapital, w.endCapital); near(r.equity.at(-1).cash, w.equity.at(-1).cash);
  assert.equal(r.eventLedger[0].payDateState, 'NOT_STATED');
  assert.ok(r.limitations.includes('NOT_STATED_PAY_DATE_CLAIMS_EXCLUDED_FROM_EQUITY_NEVER_CREDITED_OR_INVESTABLE'));
  // A full-investment target cannot be funded from the claim.
  const full = fixture(); full.listings[0].events = structuredClone(x.listings[0].events); full.targets.push(target(3, { A: 0.5, B: 0.5 }));
  near(P.runPortfolio(full).equity.at(-1).value, w.equity.at(-1).value, 1e-2);
  // null pay date without the explicit state is still invalid; a state with a date is contradictory.
  const bare = fixture(); bare.listings[0].events = [{ ...x.listings[0].events[0] }]; delete bare.listings[0].events[0].payDateState;
  throws('INVALID_DATE', () => P.runPortfolio(bare));
  const both = fixture(); both.listings[0].events = [{ ...x.listings[0].events[0], payDate: dates[4] }];
  throws('INVALID_PAY_DATE_STATE', () => P.runPortfolio(both));
});

test('ADS is admitted only as terminal-exchange successor (cash + ADS consideration)', () => {
  const x = fixture();
  x.listings[0].lastTradeDate = dates[2]; x.listings[0].bars = x.listings[0].bars.slice(0, 3);
  x.listings[0].events = [{ id: 'X_A', type: 'TERMINAL_EXCHANGE', effectiveDate: dates[3], successorListingId: 'B', shareRatio: 2, amount: 10, currency: 'USD', payDate: null, payDateState: 'NOT_STATED',
    informationAvailableAt: '2020-01-07T12:00:00Z', sourceHash: H2, sequence: 0 }];
  x.listings[1].instrumentClass = 'ADS'; x.listings[1].primary = false;
  x.targets.push(target(3, {}));
  const r = P.runPortfolio(x);
  near(r.equity[3].positions[0].units, units * 2); near(r.equity[3].notStatedClaims, units * 10);
  near(r.equity[3].value, units * 2 * 50); assert.equal(r.equity.at(-1).positions.length, 0);
  assert.ok(r.limitations.includes('ADS_SUCCESSOR_ONLY_NO_ADS_DISTRIBUTIONS_DEPOSITARY_FEES_OR_FX_MODELLED'));
  // Buying the ADS is never allowed; zero weight (exit) is.
  const buy = structuredClone(x); buy.targets[1] = target(3, { B: 0.5 });
  throws('ADS_SUCCESSOR_ONLY', () => P.runPortfolio(buy));
  // An ADS that is no successor, carries own events, or is a spin-off distribution is rejected.
  const lone = fixture(); lone.listings[1].instrumentClass = 'ADS'; lone.listings[1].primary = false;
  throws('ADS_SUCCESSOR_ONLY', () => P.runPortfolio(lone));
  const withEvents = structuredClone(x); withEvents.listings[1].events = [{ id: 'DIV_B', type: 'CASH_DIVIDEND', effectiveDate: dates[4], payDate: dates[5], amount: 1, currency: 'USD', availableAt: '2020-01-01T00:00:00Z', sourceHash: H, sequence: 0 }];
  throws('ADS_SUCCESSOR_ONLY', () => P.runPortfolio(withEvents));
  const spun = fixture(); spun.listings[1].instrumentClass = 'ADS'; spun.listings[1].primary = false; spun.listings[0].events = [spin()];
  throws('ADS_SUCCESSOR_ONLY', () => P.runPortfolio(spun));
  // An ADS claiming to be the primary listing is an identity error.
  const primary = structuredClone(x); primary.listings[1].primary = true;
  throws('LISTING_IDENTITY_INELIGIBLE', () => P.runPortfolio(primary));
  // Price simulation still excludes all corporate actions and therefore any ADS.
  const sim = fixture(); sim.provenance = { mode: 'HISTORICAL_PRICE_SIMULATION', datasetHash: H, priceSeriesType: 'SPLIT_ADJUSTED', populationBasis: 'CONDITIONAL_FIXED_CURRENT_COHORT', clockBasis: 'MODELED_WEEK_END_DATE' };
  sim.returnBasis = 'PRICE_RETURN'; sim.benchmark.returnBasis = 'PRICE_RETURN'; sim.listings[0].events = [spin()];
  throws('INVALID_CONDITIONAL_PRICE_SIMULATION', () => P.runPortfolio(sim));
});

test('inputs without the new fields keep the 1.1.0 result shape', () => {
  const x = fixture();
  x.listings[0].events = [{ id: 'DIV_A', type: 'CASH_DIVIDEND', effectiveDate: dates[2], payDate: dates[4], amount: 1, currency: 'USD', availableAt: '2020-01-01T00:00:00Z', sourceHash: H, sequence: 0 }];
  const r = P.runPortfolio(x);
  assert.equal('notStatedClaims' in r, false);
  assert.ok(r.equity.every(row => !('notStatedClaims' in row)));
  assert.ok(r.eventLedger.every(e => !('informationAvailableAt' in e) && !('payDateState' in e)));
  assert.deepEqual(r.limitations, ['FRACTIONAL_LONG_ONLY', 'OBSERVED_NEXT_SESSION_CLOSE_MODEL_NOT_GUARANTEED_FILL', 'NO_CASH_INTEREST_OR_TAX', 'NO_VOLUME_CAPACITY_MODEL', 'CASH_PAYMENTS_CREDITED_AT_FIRST_VALUATION_SESSION_ON_OR_AFTER_PAY_DATE', 'SOURCE_REFERENCES_REQUIRE_INDEPENDENT_AUDIT']);
});
