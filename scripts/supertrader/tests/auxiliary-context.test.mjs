import test from 'node:test';
import assert from 'node:assert/strict';
import { collectContextBenchmarks, contextPublicStatus, parseContextArguments, validateContextProtocol } from '../research/tournament/context-benchmark.mjs';

const dates = ['2020-01-02', '2020-01-03', '2020-01-06'];
const protocol = { registeredBeforePerformance: true, noPostResultTuning: true,
  window: { warmupFrom: dates[0], from: dates[0], to: dates[2] },
  execution: { initialCapital: 100000, cashReturn: 0 },
  benchmark: { primary: 'SPY_CANONICAL_TOTAL_RETURN', context: ['IWM', 'QQQ', 'IWV'], riskFreeForSharpe: 0 } };
const bars = () => dates.map((date, i) => ({ date, open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: 100, dividend: 0, splitFactor: 1 }));
const series = (ticker, observed = bars()) => ({ ticker, bars: observed });

test('all three preregistered contexts are attempted on the exact primary calendar with frozen metrics', async () => {
  const reads = [];
  const result = await collectContextBenchmarks({ protocol,
    getMainSeries: async (ticker) => { reads.push(ticker); return series(ticker); },
    getPrimarySeries: async (ticker) => { reads.push(ticker); return series(ticker); } });
  assert.deepEqual(reads.sort(), ['IWM', 'IWV', 'QQQ', 'SPY', 'SPY@1993-01-29']);
  assert.equal(result.parity.status, 'MATCH'); assert.equal(result.sessions, 3);
  assert.ok(result.contexts.every((r) => r.status === 'AVAILABLE' && r.metrics.from === protocol.window.from && r.metrics.to === protocol.window.to && r.metrics.executionCosts === 0 && r.metrics.initialCapital === 100000));
  assert.ok(result.contexts.every((r) => r.metrics.totalReturn === result.primary.metrics.totalReturn));
  const status = contextPublicStatus(result);
  assert.equal(status.contextsAvailable, 3);
  assert.ok(!JSON.stringify(status).includes('totalReturn'));
  assert.ok(Object.values(status).every((v) => typeof v === 'string' || Number.isSafeInteger(v)));
});

test('missing primary never substitutes main SPY and still attempts every context', async () => {
  const reads = [];
  const result = await collectContextBenchmarks({ protocol,
    getMainSeries: async (ticker) => { reads.push(ticker); return series(ticker); }, getPrimarySeries: async () => null });
  assert.deepEqual(reads.sort(), ['IWM', 'IWV', 'QQQ', 'SPY']);
  assert.equal(result.status, 'CONTEXT_UNAVAILABLE_PRIMARY_SPY');
  assert.ok(result.contexts.every((r) => r.status === 'MISSING_NO_SUBSTITUTION' && r.metrics === null && r.reason === 'PRIMARY_SPY_UNAVAILABLE'));
});

test('missing actions, identity conflicts and calendar gaps remain missing without shortened windows', async () => {
  const result = await collectContextBenchmarks({ protocol,
    getMainSeries: async (ticker) => {
      if (ticker === 'IWM') { const observed = bars(); delete observed[1].dividend; return series(ticker, observed); }
      if (ticker === 'QQQ') return series('OTHER');
      if (ticker === 'IWV') return series(ticker, bars().filter((b) => b.date !== dates[1]));
      return series(ticker);
    }, getPrimarySeries: async (ticker) => series(ticker) });
  const [iwm, qqq, iwv] = result.contexts;
  assert.equal(iwm.canonicalReason, 'DIVIDEND_FIELD_MISSING');
  assert.equal(qqq.reason, 'SOURCE_IDENTITY_CONFLICT');
  assert.equal(iwv.reason, 'PRIMARY_CALENDAR_OR_WARMUP_GAP'); assert.equal(iwv.absentSessions, 1);
  assert.ok(result.contexts.every((r) => r.metrics === null));
});

test('read diagnostics stay private and failures do not skip other context attempts', async () => {
  const result = await collectContextBenchmarks({ protocol,
    getMainSeries: async (ticker) => { if (ticker === 'IWM') throw new Error('private provider response'); return series(ticker); },
    getPrimarySeries: async (ticker) => series(ticker) });
  assert.equal(result.attempts.length, 5); assert.equal(result.contexts.filter((r) => r.status === 'AVAILABLE').length, 2);
  assert.equal(result.privateDiagnostics[0].message, 'private provider response');
  assert.ok(!JSON.stringify(contextPublicStatus(result)).includes('provider'));
  assert.throws(() => parseContextArguments([]), /EXPLICIT_OUT_REQUIRED/);
  assert.throws(() => parseContextArguments(['--out', '--other']), /EXPLICIT_OUT_REQUIRED/);
  assert.throws(() => parseContextArguments(['--out', '/tmp/context', '--only', 'QQQ']), /EXPLICIT_OUT_REQUIRED/);
  assert.throws(() => validateContextProtocol({ ...protocol, benchmark: { ...protocol.benchmark, context: ['QQQ'] } }), /PREDECLARED_CONTEXTS_REQUIRED/);
  assert.throws(() => validateContextProtocol({ ...protocol, window: { ...protocol.window, to: '2020-02-30' } }), /INVALID_CONTEXT_WINDOW/);
});
