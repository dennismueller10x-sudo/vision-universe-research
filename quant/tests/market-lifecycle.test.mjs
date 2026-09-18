import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { createMarketStore, ingestionRunId } = createRequire(import.meta.url)('../engines/market-store.js');
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'vu-lifecycle-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, store: createMarketStore({ root, providerId: 'tiingo' }) };
}
test('EOD resumes the same processing day, but a new day does not inherit done symbols', t => {
  const { store } = fixture(t);
  const first = ingestionRunId(false, '2026-09-09T21:30:00Z');
  const checkpoint = store.loadCheckpoint(first);
  checkpoint.done.push('ref_AAPL');
  store.saveCheckpoint(checkpoint);
  assert.deepEqual(store.remaining(store.loadCheckpoint(ingestionRunId(false, '2026-09-09T23:00:00Z')), ['ref_AAPL']), []);
  assert.deepEqual(store.remaining(store.loadCheckpoint(ingestionRunId(false, '2026-09-10T21:30:00Z')), ['ref_AAPL']), ['ref_AAPL']);
  assert.equal(ingestionRunId(true, '2026-09-10'), 'initial');
  assert.throws(() => ingestionRunId(false, 'invalid'), TypeError);
});
test('damaged history fails closed and merge cannot overwrite the original bytes', t => {
  const { root, store } = fixture(t);
  const dir = join(root, '.market-cache/tiingo/daily');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'ref_AAPL.json');
  const damaged = '{"sensitiveProviderContent":';
  writeFileSync(file, damaged);
  const typed = err => err.code === 'MARKET_STORE_READ_ERROR' && !err.message.includes('sensitiveProviderContent');
  assert.throws(() => store.nextFetchFrom('ref_AAPL'), typed);
  assert.throws(() => store.mergeBars('ref_AAPL', []), typed);
  assert.equal(readFileSync(file, 'utf8'), damaged);
  assert.equal(store.inventory()[0].qualityStatus, 'PIPELINE_ERROR');
  for (const malformed of ['{}', 'null', '{"bars":{}}', '{"bars":[{}]}',
    '{"bars":[{"date":"2026-02-30"}]}',
    '{"bars":[{"date":"2026-09-09"},{"date":"2026-09-08"}]}']) {
    writeFileSync(file, malformed);
    assert.throws(() => store.nextFetchFrom('ref_AAPL'), typed);
    assert.throws(() => store.mergeBars('ref_AAPL', []), typed);
    assert.equal(readFileSync(file, 'utf8'), malformed);
    assert.equal(store.inventory()[0].qualityStatus, 'PIPELINE_ERROR');
  }
});
test('damaged checkpoints cannot become empty successful runs; absent remains a fresh checkpoint', t => {
  const { root, store } = fixture(t);
  assert.deepEqual(store.loadCheckpoint('new').done, []);
  const dir = join(root, '.market-cache/tiingo/checkpoints');
  mkdirSync(dir, { recursive: true });
  for (const damaged of ['{', '{}', 'null']) {
    writeFileSync(join(dir, 'bad.json'), damaged);
    assert.throws(() => store.loadCheckpoint('bad'), { code: 'MARKET_STORE_READ_ERROR' });
  }
});
