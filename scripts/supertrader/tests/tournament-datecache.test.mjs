import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Compare the entire engine against its preserved original validator. These test-only
// exports never add a live engine API or depend on local profiling scratch files.
async function variants(file, validator, methodsExport) {
  const source = readFileSync(new URL(`../research/tournament/engines/${file}.mjs`, import.meta.url), 'utf8');
  const uncachedName = validator === 'dateValid' ? 'uncachedDateValid' : 'uncachedValidDate';
  const start = source.indexOf('// Pure bounded memoization of immutable ISO date strings;');
  const end = source.indexOf(`function ${uncachedName}(`, start);
  assert.ok(start >= 0 && end > start, 'original validator must remain available for the independent oracle');
  const original = (source.slice(0, start) + source.slice(end)).replace(`function ${uncachedName}(`, `function ${validator}(`);
  const load = s => import(`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`);
  return {
    cached: await load(`${source}\nexport { ${validator} as validateDate, dateValidityCache as testCache };`),
    original: await load(`${original}\nexport { ${validator} as validateDate };`),
    methodsExport,
  };
}
const engines = await Promise.all([
  variants('academic', 'validDate', 'academicMethods'),
  variants('legendary', 'dateValid', 'legendaryMethods'),
  variants('kullamagi', 'validDate', 'kullamagiMethods'),
]);
function outcome(fn, value) {
  try { return { result: fn(value) }; }
  catch (error) { return { thrown: error.constructor.name, message: error.message }; }
}
function fixture() {
  const bars = [];
  for (let t = Date.parse('2020-01-01T00:00:00Z'); t <= Date.parse('2024-01-31T00:00:00Z'); t += 86400000) {
    const d = new Date(t);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const close = 50 + bars.length * 0.02 + Math.sin(bars.length / 20);
    bars.push({ date: d.toISOString().slice(0, 10), close, high: close + 1, low: close - 1, volume: 1e6, totalReturnIndex: close });
  }
  return { asOf: '2024-01-31', securities: [
    { id: 'a', ticker: 'A', bars },
    { id: 'b', ticker: 'B', bars: bars.map(b => ({ ...b, totalReturnIndex: b.totalReturnIndex * 1.01 })) },
  ], market: { bars } };
}

test('cached date validation preserves original values and thrown errors for malformed inputs', () => {
  const inputs = [null, undefined, 0, {}, [], new Date(), '', '2024-1-01', '2024-01-01T00:00:00Z',
    '2024-02-29', '2023-02-29', '2024-02-30', '2024-00-01', '2024-99-99', '0000-01-01', '9999-12-31'];
  for (const engine of engines) for (const value of inputs) {
    const expected = outcome(engine.original.validateDate, value);
    assert.deepEqual(outcome(engine.cached.validateDate, value), expected);
    assert.deepEqual(outcome(engine.cached.validateDate, value), expected, 'repetition cannot suppress an original exception');
  }
  assert.equal(outcome(engines[1].cached.validateDate, '2024-99-99').thrown, 'RangeError');
});

test('date cache is bounded and eviction preserves all validator behavior', () => {
  for (const engine of engines) {
    const first = '1950-01-01';
    for (let i = 0; i < 4300; i++) {
      const date = new Date(Date.UTC(1950, 0, 1 + i)).toISOString().slice(0, 10);
      assert.deepEqual(outcome(engine.cached.validateDate, date), outcome(engine.original.validateDate, date));
    }
    assert.equal(engine.cached.testCache.size, 4096);
    assert.equal(engine.cached.testCache.has(first), false);
    assert.deepEqual(outcome(engine.cached.validateDate, first), outcome(engine.original.validateDate, first));
    assert.equal(engine.cached.testCache.size, 4096);
  }
});

test('all six engine outputs including rejections and held-state failures equal the uncached engines', () => {
  const base = fixture();
  const contexts = [base, ...[null, '2024-02-30', '2024-99-99'].map(asOf => ({ ...base, asOf }))];
  const mutate = change => { const context = structuredClone(base); change(context); contexts.push(context); };
  mutate(c => { c.securities[0].bars[20].date = '2020-00-01'; });
  mutate(c => { c.securities[0].bars[20].date = '2020-02-30'; });
  mutate(c => { c.securities[0].bars[20].date = undefined; });
  mutate(c => { c.securities[0].bars[20].close = NaN; });
  mutate(c => { c.securities[0].bars.push({ date: '2025-01-01', close: NaN, high: 0, low: -1, volume: -1 }); });
  mutate(c => { c.securities[0].bars.pop(); });
  mutate(c => { c.securities[0].bars[20].date = c.securities[0].bars[19].date; });
  mutate(c => { c.securities[1].id = c.securities[0].id; });
  mutate(c => { c.positions = [{ id: 'a', weight: 0.1, entryPrice: 50, stop: 45, heldSessions: 4, partialDone: false }]; });
  mutate(c => { c.positions = [{ id: 'absent', weight: 0.1, entryPrice: 50, stop: 45 }]; });
  for (const engine of engines) {
    const originals = engine.original[engine.methodsExport];
    const cached = engine.cached[engine.methodsExport];
    for (let i = 0; i < cached.length; i++) for (const context of contexts) {
      const expected = outcome(originals[i].evaluate, context);
      assert.deepEqual(outcome(cached[i].evaluate, context), expected, `${cached[i].id} exact output`);
      assert.deepEqual(outcome(cached[i].evaluate, context), expected, `${cached[i].id} repeated exact output`);
    }
  }
});
