import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { kullamagiMethods, evaluateKullamagi, validateKullamagiEntryFill } from '../research/tournament/engines/kullamagi.mjs';

function setup() {
  return Array.from({ length: 128 }, (_, i) => {
    const date = new Date(Date.UTC(2020, 0, i + 1)).toISOString().slice(0, 10);
    let close = 50 + i * 0.5, range = 1;
    if (i >= 107 && i < 127) { close = 104 + (i - 107) * 0.1; range = i < 112 ? 2 : i >= 122 ? 0.5 : 1; }
    if (i === 127) return { date, open: 106.5, close: 107, high: 108, low: 106.1, volume: 1e6 };
    return { date, open: close, close, high: close + range, low: close - range, volume: 1e6 };
  });
}
const context = (bars = setup()) => ({ asOf: bars.at(-1).date, securities: [{ id: 'A', ticker: 'AAA', bars }] });
function held({ heldSessions = 0, partialDone = false, entryPrice = 100, stop = 95, weight = 0.1 } = {}) {
  return { id: 'A', weight, entryPrice, stop, heldSessions, partialDone };
}

test('provenance distinguishes public daily option from every frozen VU numeric choice and excludes live imports', () => {
  const m = kullamagiMethods[0];
  assert.equal(m.id, 'KULLAMAGI_DAILY_ADAPTATION');
  assert.equal(m.fidelity, 'VU_ADAPTATION'); assert.equal(m.replicationClaimAllowed, false);
  assert.equal(m.portfolioSemantics.execution, 'NEXT_SESSION_OPEN');
  assert.equal(m.portfolioSemantics.targetWeightScope, 'STATEFUL');
  assert.equal(m.portfolioSemantics.marketFilter, 'NONE');
  assert.equal(m.parameters.baseSessions, 20); assert.equal(m.parameters.partialAfterSessions, 4);
  assert.ok(m.rules.some(r => r.classification === 'SOURCE_DEFINED_OPTION'));
  assert.ok(m.rules.some(r => r.id === 'KK-V-BASE' && r.classification === 'VU_FORMALIZATION'));
  for (const r of m.rules) assert.ok(r.id && r.source && r.description);
  assert.ok(Object.isFrozen(m.parameters)); assert.ok(Object.isFrozen(m.parameters.momentumSessions));
  const source = readFileSync(new URL('../research/tournament/engines/kullamagi.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /^\s*import\s/m, 'self-contained research engine cannot import live registry/core/shared defaults');
});

test('synthetic momentum consolidation produces next-open entry with known signal-day stop', () => {
  const ctx = context(), result = evaluateKullamagi(ctx);
  assert.equal(result.status, 'READY'); assert.equal(result.signals[0].action, 'ENTER');
  const signal = result.signals[0];
  assert.equal(signal.stopLevel, ctx.securities[0].bars.at(-1).low);
  assert.equal(signal.stopBasis, 'KNOWN_SIGNAL_DAY_LOW'); assert.equal(signal.requiresEntryFillValidation, true);
  assert.ok(signal.weight > 0 && signal.weight <= 0.1);
  assert.ok(result.ruleTrace[0].impulse >= 0.3); assert.ok(result.ruleTrace[0].baseWidth <= 0.15);
});

test('PIT ignores future execution-day lows, highs, closes, even malformed values; optional market has no effect', () => {
  const ctx = context(), before = JSON.stringify(ctx), result = evaluateKullamagi(ctx);
  const extended = structuredClone(ctx);
  extended.securities[0].bars.push({ date: '2026-01-01', low: 0.01, high: 100000, close: NaN });
  extended.market = { bars: [{ date: '1900-01-01', close: 0 }] };
  assert.deepEqual(evaluateKullamagi(extended), result);
  assert.equal(JSON.stringify(ctx), before);
  const changedSignalLow = structuredClone(ctx);
  changedSignalLow.securities[0].bars.at(-1).low = 106.3;
  assert.equal(evaluateKullamagi(changedSignalLow).signals[0].stopLevel, 106.3);
  assert.equal(evaluateKullamagi(changedSignalLow).ruleTrace[0].preSignalATR20, result.ruleTrace[0].preSignalATR20);
});

test('actual next-open fill must exceed fixed known stop and respect prior ATR; size recalculates at actual fill', () => {
  const signal = evaluateKullamagi(context()).signals[0];
  assert.equal(validateKullamagiEntryFill(signal, signal.stopLevel).accepted, false);
  assert.equal(validateKullamagiEntryFill(signal, signal.stopLevel - 1).accepted, false);
  assert.equal(validateKullamagiEntryFill(signal, signal.stopLevel + signal.maxInitialStopDistance + 0.01).accepted, false);
  assert.equal(validateKullamagiEntryFill(signal, NaN).accepted, false);
  const fill = signal.stopLevel + signal.maxInitialStopDistance / 2;
  const accepted = validateKullamagiEntryFill(signal, fill);
  assert.equal(accepted.accepted, true); assert.equal(accepted.stopLevel, signal.stopLevel);
  assert.equal(accepted.maximumEntryWeight, Math.min(0.1, 0.005 * fill / (fill - signal.stopLevel)));
});

test('held position partial starts after four completed held sessions; state changes only after actual execution', () => {
  const ctx = context(); ctx.positions = [held({ heldSessions: 3 })];
  assert.equal(evaluateKullamagi(ctx).signals.length, 0);
  ctx.positions[0].heldSessions = 4;
  const before = JSON.stringify(ctx), partial = evaluateKullamagi(ctx);
  assert.equal(partial.signals[0].action, 'PARTIAL');
  assert.equal(partial.signals[0].sellFraction, 1 / 3);
  assert.ok(Math.abs(partial.targets[0].weight - 0.1 * (2 / 3)) < 1e-12);
  assert.equal(partial.signals[0].stopAfterSuccessfulPartial, 100);
  assert.equal(partial.signals[0].partialDoneAfterSuccessfulExecution, true);
  assert.equal(JSON.stringify(ctx), before);
  ctx.positions[0].partialDone = true;
  assert.equal(evaluateKullamagi(ctx).signals.length, 0, 'no second partial');
});

test('known-stop close exit overrides partial; MA10 remainder exit follows a completed partial', () => {
  const ctx = context(); ctx.positions = [held({ heldSessions: 4, entryPrice: 110, stop: 108 })];
  const stopped = evaluateKullamagi(ctx);
  assert.equal(stopped.signals[0].action, 'EXIT'); assert.equal(stopped.signals[0].reason, 'KNOWN_STOP_CLOSE');
  assert.equal(stopped.targets.length, 0);
  ctx.positions = [held({ heldSessions: 6, partialDone: true, entryPrice: 70, stop: 65 })];
  Object.assign(ctx.securities[0].bars.at(-1), { close: 80, high: 81, low: 79 });
  const trailed = evaluateKullamagi(ctx);
  assert.equal(trailed.signals[0].reason, 'MA10_CLOSE');
  ctx.positions[0].partialDone = false;
  assert.equal(evaluateKullamagi(ctx).signals[0].action, 'PARTIAL', 'MA trail starts only after successful partial');
});

test('invalid dated history or held-state is DATA_GAP; new short histories are explicitly skipped', () => {
  const invalid = context(); invalid.securities[0].bars[1].date = invalid.securities[0].bars[0].date;
  assert.equal(evaluateKullamagi(invalid).status, 'DATA_GAP');
  const missing = context(); delete missing.securities[0].bars[4].low;
  assert.equal(evaluateKullamagi(missing).status, 'DATA_GAP');
  const badState = context(); badState.positions = [held()]; delete badState.positions[0].partialDone;
  assert.equal(evaluateKullamagi(badState).status, 'DATA_GAP');
  const short = context(setup().slice(-20));
  assert.equal(evaluateKullamagi(short).status, 'READY');
  assert.equal(evaluateKullamagi(short).ruleTrace[0].decision, 'INSUFFICIENT_ENTRY_HISTORY');
});

test('leader ties and allocation are independent of input order; cash-only portfolio cap is explicit', () => {
  const ctx = context();
  ctx.securities = Array.from({ length: 12 }, (_, i) => ({ id: String(i).padStart(2, '0'), ticker: 'S' + i, bars: setup() }));
  const a = evaluateKullamagi(ctx), b = evaluateKullamagi({ ...ctx, securities: [...ctx.securities].reverse() });
  assert.deepEqual(a, b); assert.equal(a.targets.length, 1, 'top2% ties deliberately select one eligible ID');
  assert.equal(a.targets[0].id, '00');
  ctx.positions = ctx.securities.slice(0, 10).map(s => ({ ...held(), id: s.id }));
  assert.equal(evaluateKullamagi(ctx).targets.length, 10);
  assert.ok(evaluateKullamagi(ctx).targets.reduce((a, t) => a + t.weight, 0) <= 1 + 1e-12);
});
