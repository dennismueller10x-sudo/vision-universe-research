import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { loadHistoricalExclusions, assertProtectedConsumerBaseline, loadProtectedConsumerBaseline } from '../../scripts/market/tiingo2-historical-exclusions.mjs';
import { classifyCandidate } from '../../scripts/market/tiingo2-policy.mjs';
import { resolveProductUniverse } from '../../scripts/market/universe-source.mjs';

const root = resolve(import.meta.dirname, '../..');

test('all 22 confirmed debt exclusions remain bound to current canonical decisions', () => {
  const excluded = loadHistoricalExclusions(root);
  assert.equal(excluded.size, 22);
  for (const row of excluded.values()) {
    assert.equal(row.historicallyExcluded, true);
    assert.equal(row.securityId, `ref_${row.ticker}`);
  }
});

test('fresh Stock metadata cannot re-admit a protected historical debt exclusion', () => {
  const row = loadHistoricalExclusions(root).get('BNH');
  const candidate = {
    ticker: row.ticker, securityId: row.securityId, instrument_type: 'EQUITY_COMMON',
    active: true, historicallyExcluded: true,
    evidence: { identity: { resolved: true }, price: {
      historyValid: true, latestValid: true, latestDate: '2026-10-02', corporateActionValid: true, bars: 1000
    } }
  };
  const decision = classifyCandidate(candidate, { today: '2026-10-03', root });
  assert.equal(decision.decision, 'REJECT_WITH_REASON');
  assert.equal(decision.publicationReady, false);
  assert.ok(decision.reasonCodes.includes('HISTORICALLY_EXCLUDED'));
});

test('the original 6,397 consumer identities remain protected after additive publication', () => {
  const consumer = resolveProductUniverse(root).securities.filter(row => row.consumer);
  const base = loadProtectedConsumerBaseline(root, consumer);
  assert.deepEqual(base, { original: 6397, current: 6397, additions: 0, removals: 0 });
  const small = { count: 2, rows: [{ticker:'A',securityId:'ref_A'},{ticker:'B',securityId:'ref_B'}] };
  assert.deepEqual(assertProtectedConsumerBaseline([...small.rows,{ticker:'C',securityId:'ref_C'}],small),
    { original: 2, current: 3, additions: 1, removals: 0 });
  assert.throws(() => assertProtectedConsumerBaseline([{ticker:'A',securityId:'ref_A'}],small), /COUNT_MISMATCH/);
  assert.throws(() => assertProtectedConsumerBaseline([{ticker:'A',securityId:'ref_A'},{ticker:'B',securityId:'ref_WRONG'}],small), /IDENTITY_REMOVED_OR_CHANGED/);
});
