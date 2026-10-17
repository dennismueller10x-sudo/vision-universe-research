import test from 'node:test';
import assert from 'node:assert/strict';
import { LEGENDARY_METHODS, evaluateTurtle, evaluateWeinstein, turtleN, turtleNSeries } from '../research/tournament/engines/legendary.mjs';

function bars(n, closeFn = () => 100) {
  return Array.from({ length: n }, (_, i) => {
    const date = new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10);
    const close = closeFn(i);
    return { date, close, high: close + 1, low: close - 1, volume: 1000000, totalReturnIndex: close };
  });
}
function context(rows) { return { asOf: rows.at(-1).date, securities: [{ id: 'A', ticker: 'A', bars: rows }] }; }

test('legendary provenance identifies equity/daily adaptation and each foreign operational choice', () => {
  assert.equal(LEGENDARY_METHODS.length, 2);
  for (const method of LEGENDARY_METHODS) {
    assert.equal(method.fidelity, 'VU_ADAPTATION');
    assert.equal(method.replicationClaimAllowed, false);
    assert.equal(method.execution, 'NEXT_SESSION_OPEN');
    assert.ok(method.provenance.some(r => r.classification === 'VU_FORMALIZATION'));
    for (const rule of method.provenance) assert.ok(rule.id && rule.description && rule.source);
    assert.ok(method.portfolioPolicy.maxPositions > 0);
    assert.ok(method.portfolioPolicy.maxWeight > 0);
  }
});

test('Turtle N seeds 20 true ranges then uses Wilder 19/20 recurrence', () => {
  const rows = bars(22);
  assert.equal(turtleN(rows.slice(0, 19)), null);
  assert.equal(turtleN(rows.slice(0, 20)), 2);
  rows[21] = { ...rows[21], high: 106, low: 99, close: 105 };
  assert.equal(turtleN(rows), (19 * 2 + 7) / 20);
});

test('Turtle prior 55-day channel strict breakout; close through own high is not required', () => {
  const rows = bars(56); rows[55] = { ...rows[55], close: 103, high: 105, low: 100 };
  const result = evaluateTurtle(context(rows));
  assert.equal(result.status, 'READY');
  assert.equal(result.signals[0].action, 'ENTER');
  assert.equal(result.signals[0].initialStopDistance, 4);
  assert.equal(result.targets[0].weight, 0.1);
  assert.equal(result.ruleTrace[0].entryChannel, 101);
  rows[55] = { ...rows[55], close: 101, high: 102, low: 100 };
  assert.equal(evaluateTurtle(context(rows)).targets.length, 0);
});

test('new entry sizing/stop distance excludes signal-day high and low and never reads future execution bars', () => {
  const rows = bars(56); rows[55] = { ...rows[55], close: 103, high: 104, low: 102 };
  const ctx = context(rows); const first = evaluateTurtle(ctx);
  const expanded = structuredClone(ctx);
  expanded.securities[0].bars[55].high = 200;
  expanded.securities[0].bars[55].low = 1;
  expanded.securities[0].bars.push({ date: '2025-01-01', close: 1, high: 1000, low: 0.01, volume: 1 });
  assert.deepEqual(evaluateTurtle(expanded), first);
  assert.equal(first.signals[0].stopBasis, 'EXECUTION_FILL_MINUS_PRE_SIGNAL_DISTANCE');
  assert.equal('stop' in first.signals[0], false, 'no pretend actual entry stop before future execution fill');
});

test('PIT truncates all future securities and market bars; neither evaluator mutates input', () => {
  const rows = bars(220, i => 50 + i * 0.2); const ctx = context(rows);
  ctx.market = { bars: bars(220, i => 100 + i * 0.01) };
  const frozen = JSON.stringify(ctx);
  for (const evaluate of [evaluateTurtle, evaluateWeinstein]) {
    const baseline = evaluate(ctx);
    const future = structuredClone(ctx);
    future.securities[0].bars.push({ date: '2026-01-01', close: 2000, high: 2001, low: 1999, volume: 1e8 });
    future.market.bars.push({ date: '2026-01-01', close: 1, high: 2, low: 0.5, volume: 1 });
    assert.deepEqual(evaluate(future), baseline);
  }
  assert.equal(JSON.stringify(ctx), frozen);
});

test('malformed history does not produce tradable targets', () => {
  const rows = bars(56); rows[55].close = 103;
  const missing = structuredClone(rows); delete missing[10].low;
  assert.equal(evaluateTurtle(context(missing)).status, 'READY');
  assert.equal(evaluateTurtle(context(missing)).signals[0].action, 'REJECT');
  const duplicate = structuredClone(rows); duplicate[10].date = duplicate[9].date;
  assert.equal(evaluateTurtle(context(duplicate)).status, 'READY');
  assert.equal(evaluateTurtle(context(duplicate)).signals[0].action, 'REJECT');
  const stale = context(rows); stale.asOf = '2024-01-01';
  assert.equal(evaluateTurtle(stale).status, 'READY');
  assert.equal(evaluateTurtle(stale).signals[0].action, 'REJECT');
});

test('Turtle holds actual fill-based stop and exits only on current close below known stop/channel', () => {
  const rows = bars(56); const ctx = context(rows);
  ctx.positions = [{ id: 'A', ticker: 'A', weight: 0.08, entryPrice: 101, stop: 97 }];
  assert.equal(evaluateTurtle(ctx).targets[0].weight, 0.08);
  rows[55] = { ...rows[55], close: 96, high: 100, low: 95 };
  const exited = evaluateTurtle(ctx);
  assert.equal(exited.targets.length, 0);
  assert.equal(exited.signals[0].action, 'EXIT');
  assert.equal(exited.signals[0].reason, 'KNOWN_STOP_CLOSE');
  const missingStop = context(bars(56));
  missingStop.positions = [{ id: 'A', weight: 0.08, entryPrice: 101 }];
  assert.equal(evaluateTurtle(missingStop).status, 'DATA_GAP');
});

test('portfolio allocation cap and deterministic tie ordering are explicit', () => {
  const rows = bars(56); rows[55] = { ...rows[55], close: 103, high: 104, low: 102 };
  const securities = Array.from({length: 15}, (_, i) => ({ id: String(i).padStart(2, '0'), ticker: String(i).padStart(2,'0'), bars: rows }));
  const ctx = { asOf: rows.at(-1).date, securities };
  const a = evaluateTurtle(ctx);
  const b = evaluateTurtle({ ...ctx, securities: [...securities].reverse() });
  assert.deepEqual(a, b);
  assert.equal(a.targets.length, 10);
  assert.ok(a.targets.reduce((sum, t) => sum + t.weight, 0) <= 1 + 1e-12);
});

test('Weinstein requires actual point-in-time market history and positive relative strength', () => {
  const rows = bars(220, i => 50 + i * 0.2);
  rows[219] = { ...rows[219], close: 110, high: 111, low: 108, volume: 3000000 };
  const ctx = context(rows);
  assert.equal(evaluateWeinstein(ctx).status, 'DATA_GAP');
  ctx.market = { bars: bars(220, i => 100 + i * 0.01) };
  const result = evaluateWeinstein(ctx);
  assert.equal(result.status, 'READY');
  assert.equal(result.signals[0].action, 'ENTER');
  assert.ok(result.signals[0].stopLevel < rows[218].low);
  const weak = structuredClone(ctx);
  weak.market.bars = bars(220, i => 100 * (1.01 ** i));
  assert.equal(evaluateWeinstein(weak).targets.length, 0);
});

test('healthy Turtle signal survives unrelated IPO, zero-N and malformed unheld securities', () => {
  const healthy = bars(56); healthy[55] = { ...healthy[55], close: 103, high: 104, low: 102 };
  const flat = bars(56).map(b => ({ ...b, high: 100, low: 100, close: 100 }));
  const broken = structuredClone(healthy); delete broken[10].low;
  const ctx = { asOf: healthy.at(-1).date, securities: [
    {id:'A',ticker:'A',bars:healthy},
    {id:'IPO',ticker:'IPO',bars:healthy.slice(-10)},
    {id:'FLAT',ticker:'FLAT',bars:flat},
    {id:'BROKEN',ticker:'BROKEN',bars:broken},
  ]};
  const result = evaluateTurtle(ctx);
  assert.equal(result.status, 'READY');
  assert.deepEqual(result.targets.map(t => t.id), ['A']);
  assert.equal(result.ruleTrace.find(t => t.id === 'IPO').decision, 'REJECT');
  assert.equal(result.ruleTrace.find(t => t.id === 'FLAT').decision, 'REJECT');
  assert.equal(result.ruleTrace.find(t => t.id === 'BROKEN').decision, 'REJECT');
  ctx.positions = [{id:'BROKEN',weight:0.08,entryPrice:100,stop:97}];
  assert.equal(evaluateTurtle(ctx).status, 'DATA_GAP', 'a held incoherent series cannot silently disappear');
  ctx.positions = [{id:'IPO',weight:0.08,entryPrice:100,stop:97}];
  assert.equal(evaluateTurtle(ctx).status, 'DATA_GAP', 'held insufficient history cannot silently disappear');
});

test('healthy Weinstein signal survives an unrelated new IPO', () => {
  const healthy = bars(220, i => 50 + i * 0.2);
  healthy[219] = { ...healthy[219], close: 110, high: 111, low: 108, volume: 3000000 };
  const ctx = {asOf:healthy.at(-1).date, market:{bars:bars(220,i => 100+i*0.01)},securities:[
    {id:'A',ticker:'A',bars:healthy},
    {id:'IPO',ticker:'IPO',bars:healthy.slice(-10)},
  ]};
  const result = evaluateWeinstein(ctx);
  assert.equal(result.status, 'READY');
  assert.deepEqual(result.targets.map(t => t.id), ['A']);
  assert.equal(result.ruleTrace.find(t => t.id === 'IPO').decision, 'REJECT');
  ctx.positions = [{id:'IPO',weight:0.08,entryPrice:100,stop:97}];
  assert.equal(evaluateWeinstein(ctx).status, 'DATA_GAP');
});


test('full-prefix Turtle N series matches the source recurrence on every prefix', () => {
  const rows = bars(620, i => 100 + Math.sin(i / 7) * 10);
  rows[100] = { ...rows[100], high: 300, low: 1 };
  const series = turtleNSeries(rows);
  assert.equal(series.length, rows.length);
  for (let i = 0; i < rows.length; i++) {
    assert.equal(series[i], turtleN(rows.slice(0, i + 1)));
    if (i < 19) assert.equal(series[i], null);
    if (i >= 20) {
      const r = rows[i], prev = rows[i - 1];
      const tr = Math.max(r.high-r.low, Math.abs(r.high-prev.close), Math.abs(r.low-prev.close));
      assert.equal(series[i], (19*series[i-1]+tr)/20);
    }
  }
  assert.deepEqual(turtleNSeries([]), []);
});

test('Turtle uses a strictly prior-session certified full-prefix N instead of a truncated window seed', () => {
  const rows = bars(56); rows[55] = { ...rows[55], close: 103, high: 104, low: 102 };
  const ctx = context(rows);
  ctx.securities[0].preSignalN = {asOf:rows[54].date,method:'TURTLE_N20_FULL_PREFIX',value:20};
  const result = evaluateTurtle(ctx);
  assert.equal(result.status, 'READY');
  assert.equal(result.signals[0].initialStopDistance, 40);
  assert.equal(result.targets[0].weight, 0.01*103/20);
  assert.equal(result.ruleTrace[0].preSignalNSource, 'TURTLE_N20_FULL_PREFIX');
  const signalDayN = structuredClone(ctx);
  signalDayN.securities[0].preSignalN.asOf = rows[55].date;
  assert.equal(evaluateTurtle(signalDayN).targets.length, 0);
  assert.equal(evaluateTurtle(signalDayN).ruleTrace[0].decision, 'REJECT');
  const heldInvalid = structuredClone(signalDayN);
  heldInvalid.positions = [{id:'A',weight:0.08,entryPrice:101,stop:97}];
  assert.equal(evaluateTurtle(heldInvalid).status, 'DATA_GAP');
});
