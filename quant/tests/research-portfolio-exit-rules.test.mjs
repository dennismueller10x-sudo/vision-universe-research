import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as F from './helpers/weekly-portfolio-fixtures.mjs';
const require = createRequire(import.meta.url);
const P = require('../engines/research-portfolio.cjs');
const throws = (code, fn) => assert.throws(fn, e => e.code === code, code);
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} != ${b}`);
const STOP = (threshold = 0.1, reference = 'AVERAGE_ENTRY_PRICE') => ({ semantics: 'WEEKLY_CLOSE_STOP', threshold, reference });

// Hashes of runPortfolio outputs WITHOUT sourceHashes/runtime/generation/resultHash, recorded with research-portfolio-1.2.0
// (main @ e62d7268e1) before exitRules existed: inputs without exitRules must stay byte-identical.
const GOLDEN_1_2_0 = {
  base: '827e2ae5b1c3463aa35c033efc10484642fdbe924a8f6f8b2afa30ecd39edbb2', drift: '610c66f713f010fa38d098c3b4b6ee14fee0cbd6f17e7263d29b8c0e18ebf377',
  split: '5b728a2e599e8ea36bff270f288f8848e8a766e94ea1f8e5133f4fe6f0033e16', rotate: '6403e7bd25ec9b8257336ed11ec4feb818b1b9f5ea78bae9760377d8449611e4',
  zero: '7fb837aa88b2ae0254b5f96bcfa45ada3cb496013518945da5f063f13e2aa231',
};

test('default behaviour is byte-identical to research-portfolio-1.2.0 (golden fixtures)', () => {
  for (const [k, x] of Object.entries(F.goldenCases())) {
    const r = P.runPortfolio(x);
    assert.equal(P.hash(F.stripVolatile(r)), GOLDEN_1_2_0[k], k);
    assert.equal(r.schemaVersion, 'research-portfolio-1.2.0');
    for (const key of ['exitRules', 'exitLedger', 'openExitBlocks']) assert.equal(key in r, false);
    assert.ok(r.trades.every(t => !('reason' in t)));
  }
});

test('weekly close stop: triggered on the close, sold in full at the next session close, weight held as cash, NEXT_TARGET re-entry', () => {
  const x = F.weeklyFixture(); x.exitRules = { stop: STOP(0.1), reentry: 'NEXT_TARGET' };
  const r = P.runPortfolio(x), dates = x.sessions.map(s => s.date), close = (k, d) => x.listings.find(l => l.listingId === k).bars.find(b => b.date === d).close;
  assert.equal(r.schemaVersion, 'research-portfolio-1.3.0'); assert.deepEqual(r.exitRules, { stop: STOP(0.1), maxHoldingSessions: null, reentry: 'NEXT_TARGET' });
  const e = r.exitLedger.find(z => z.listingId === 'A');
  assert.equal(e.rule, 'WEEKLY_CLOSE_STOP'); assert.equal(e.state, 'EXECUTED_NEXT_SESSION_CLOSE');
  // first close at or below 90% of the entry price, never earlier
  const entry = r.trades.find(t => t.listingId === 'A' && t.side === 'BUY');
  near(e.referencePrice, entry.price);
  const firstBreach = dates.find(d => d >= entry.date && close('A', d) <= entry.price * 0.9);
  assert.equal(e.triggerDate, firstBreach);
  const exec = dates[dates.indexOf(e.triggerDate) + 1];
  assert.equal(e.executionDate, exec); near(e.executionPrice, close('A', exec)); assert.ok(e.executionPrice < e.triggerClose, 'gap loss beyond the threshold is kept, not capped');
  const sell = r.trades.find(t => t.reason === 'WEEKLY_CLOSE_STOP');
  assert.equal(sell.date, exec); assert.equal(sell.decisionDate, e.triggerDate); near(sell.units, e.units); near(sell.fee, sell.notional * 0.001);
  // the target executing at the exit session (decided at the trigger close) does not buy A back; the next target does
  const row = r.equity[dates.indexOf(exec)];
  assert.equal(row.positions.some(p => p.listingId === 'A'), false); assert.ok(row.cash / row.value > 0.3);
  const rebuy = r.trades.find(t => t.listingId === 'A' && t.side === 'BUY' && t.date > exec);
  const nextTarget = x.targets.find(t => t.decisionDate > e.triggerDate);
  assert.equal(rebuy.date, nextTarget.executionDate);
  assert.ok(r.limitations.includes('EXIT_RULES_EVALUATED_ON_SESSION_CLOSE_ONLY_NO_INTRAWEEK_PRICES'));
  assert.deepEqual(P.runPortfolio(x), r);
  // costs of the forced exit enter the totals
  near(r.metrics.fees, r.trades.reduce((s, t) => s + t.fee, 0));
});

test('AFTER_TARGET_DROPS blocks re-entry until a later target omits the listing', () => {
  const x = F.weeklyFixture(); x.exitRules = { stop: STOP(0.1), reentry: 'AFTER_TARGET_DROPS' };
  const r = P.runPortfolio(x), e = r.exitLedger[0];
  assert.equal(r.trades.some(t => t.listingId === 'A' && t.side === 'BUY' && t.date > e.executionDate), false);
  assert.deepEqual(r.openExitBlocks, [{ listingId: 'A', triggerDate: e.triggerDate }]);
  const y = F.weeklyFixture(); y.exitRules = { stop: STOP(0.1), reentry: 'AFTER_TARGET_DROPS' };
  const drop = y.targets.findIndex(t => t.decisionDate > e.triggerDate);
  y.targets[drop] = { ...y.targets[drop], weights: { B: 0.3, C: 0.3 } };
  const ry = P.runPortfolio(y), rebuy = ry.trades.find(t => t.listingId === 'A' && t.side === 'BUY' && t.date > e.executionDate);
  assert.equal(rebuy.date, y.targets[drop + 1].executionDate);
});

test('trailing high-close reference and split scaling of the reference', () => {
  const x = F.weeklyFixture(); x.exitRules = { stop: STOP(0.08, 'TRAILING_HIGH_CLOSE'), reentry: 'NEXT_TARGET' };
  const r = P.runPortfolio(x);
  for (const e of r.exitLedger.filter(z => z.rule === 'WEEKLY_CLOSE_STOP')) assert.ok(e.triggerClose <= e.referencePrice * 0.92 + 1e-12);
  // A 2:1 split halves raw prices and the reference: no stop is triggered by the split itself
  const s = F.weeklyFixture(); s.listings[1].bars = s.listings[1].bars.map((b, i) => i >= 6 ? { ...b, close: b.close / 2 } : b);
  s.listings[1].events = [{ id: 'SPLIT_B', type: 'SPLIT', effectiveDate: s.sessions[6].date, ratio: 2, sequence: 0, availableAt: '2019-01-01T00:00:00Z', sourceHash: F.H }];
  const plain = F.weeklyFixture();
  for (const z of [s, plain]) z.exitRules = { stop: STOP(0.1), reentry: 'NEXT_TARGET' };
  assert.deepEqual(P.runPortfolio(s).exitLedger.filter(e => e.listingId === 'B').map(e => e.triggerDate), P.runPortfolio(plain).exitLedger.filter(e => e.listingId === 'B').map(e => e.triggerDate));
  const noAdj = F.weeklyFixture(); noAdj.listings[1].bars = s.listings[1].bars; noAdj.exitRules = s.exitRules; // same raw drop without the split event
  assert.ok(P.runPortfolio(noAdj).exitLedger.some(e => e.listingId === 'B' && e.triggerDate === s.sessions[6].date));
});

test('max holding period: exit after exactly N sessions at the next close; last-session triggers are reported, not executed', () => {
  const x = F.weeklyFixture(30, 4); x.exitRules = { maxHoldingSessions: 3, reentry: 'NEXT_TARGET' };
  const r = P.runPortfolio(x), dates = x.sessions.map(s => s.date);
  const ex = r.exitLedger.filter(e => e.state === 'EXECUTED_NEXT_SESSION_CLOSE');
  assert.ok(ex.length >= 3);
  for (const e of ex) { assert.equal(e.rule, 'MAX_HOLDING_PERIOD'); assert.equal(e.heldSessionsAtTrigger, 3); assert.equal(dates.indexOf(e.executionDate) - dates.indexOf(e.openDate), 3); }
  const y = F.weeklyFixture(6, 10); y.exitRules = { maxHoldingSessions: 5, reentry: 'NEXT_TARGET' };
  const ry = P.runPortfolio(y);
  assert.deepEqual([...new Set(ry.exitLedger.map(e => e.state))], ['TRIGGERED_AT_LAST_SESSION_NOT_EXECUTED']);
  assert.equal(ry.trades.some(t => t.reason), false);
});

test('terminal cash before the exit session supersedes a pending exit', () => {
  const x = F.weeklyFixture(30, 4); x.exitRules = { maxHoldingSessions: 2, reentry: 'AFTER_TARGET_DROPS' };
  const d = x.sessions.map(s => s.date), a = x.listings[0];
  a.lastTradeDate = d[3]; a.bars = a.bars.slice(0, 4);
  a.events = [{ id: 'END_A', type: 'TERMINAL_CASH', effectiveDate: d[3], payDate: d[4], amount: 90, currency: 'USD', sequence: 0, availableAt: '2019-01-01T00:00:00Z', sourceHash: F.H }];
  x.targets = x.targets.map(t => ({ ...t, weights: t.decisionDate === d[0] ? t.weights : { B: 0.3, C: 0.3 } }));
  const r = P.runPortfolio(x), e = r.exitLedger.find(z => z.listingId === 'A');
  assert.equal(e.state, 'SUPERSEDED_POSITION_CLOSED_BEFORE_EXECUTION'); assert.equal(e.triggerDate, d[2]);
  assert.equal(r.trades.some(t => t.listingId === 'A' && t.side === 'SELL'), false);
});

test('exit-rule inputs fail closed', () => {
  const run = rules => { const x = F.weeklyFixture(); x.exitRules = rules; return P.runPortfolio(x); };
  throws('EXIT_RULES_EMPTY', () => run({ reentry: 'NEXT_TARGET' }));
  throws('EXIT_RULES_REENTRY_REQUIRED', () => run({ maxHoldingSessions: 4 }));
  throws('INVALID_EXIT_RULES', () => run({ maxHoldingSessions: 4, reentry: 'NEXT_TARGET', takeProfit: 0.2 }));
  throws('STOP_SEMANTICS_REQUIRED', () => run({ stop: { semantics: 'INTRADAY_STOP', threshold: 0.1, reference: 'AVERAGE_ENTRY_PRICE' }, reentry: 'NEXT_TARGET' }));
  throws('INVALID_STOP_THRESHOLD', () => run({ stop: STOP(1), reentry: 'NEXT_TARGET' }));
  throws('INVALID_STOP_THRESHOLD', () => run({ stop: STOP(0), reentry: 'NEXT_TARGET' }));
  throws('INVALID_STOP_REFERENCE', () => run({ stop: STOP(0.1, 'OPEN_PRICE'), reentry: 'NEXT_TARGET' }));
  throws('INVALID_MAX_HOLDING', () => run({ maxHoldingSessions: 0, reentry: 'NEXT_TARGET' }));
  throws('INVALID_MAX_HOLDING', () => run({ maxHoldingSessions: 2.5, reentry: 'NEXT_TARGET' }));
  const daily = F.weeklyFixture(); daily.sessions[1] = { date: '2020-01-06', closeAt: '2020-01-06T21:00:00Z' };
  daily.sessions[2] = { date: '2020-01-08', closeAt: '2020-01-08T21:00:00Z' }; // two sessions in one ISO week
  daily.listings.forEach(l => { l.bars[1] = { ...l.bars[1], date: '2020-01-06', availableAt: '2020-01-06T21:00:00Z' }; l.bars[2] = { ...l.bars[2], date: '2020-01-08', availableAt: '2020-01-08T21:00:00Z' }; });
  daily.benchmark.levels[1].date = '2020-01-06'; daily.benchmark.levels[2].date = '2020-01-08';
  daily.targets = daily.targets.slice(1);
  daily.exitRules = { stop: STOP(0.1), reentry: 'NEXT_TARGET' };
  throws('WEEKLY_CLOSE_STOP_REQUIRES_WEEKLY_SESSIONS', () => P.runPortfolio(daily));
  const spin = F.weeklyFixture(); spin.exitRules = { maxHoldingSessions: 4, reentry: 'NEXT_TARGET' };
  spin.listings[0].events = [{ id: 'SPIN', type: 'SPINOFF', distributedListingId: 'B', shareRatio: 0.5, effectiveDate: spin.sessions[5].date, sequence: 0, informationAvailableAt: '2019-01-01T00:00:00Z', sourceHash: F.H }];
  throws('EXIT_RULES_UNSUPPORTED_EVENT', () => P.runPortfolio(spin));
});
