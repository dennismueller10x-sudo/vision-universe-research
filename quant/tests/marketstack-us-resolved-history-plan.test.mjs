import test from 'node:test';
import assert from 'node:assert/strict';
import { planResolvedUSHistory } from '../../scripts/market/plan-marketstack-us-resolved-history.mjs';
const row = (id, accepted = true, valid = true) => ({ securityId: id, acceptedIdentity: { identityAccepted: accepted, symbol: id, mic: 'XNYS',
  identityBasis: 'SEC_CLASS_MIC_CIK', latestDiagnostics: [{ validLatest: valid }] } });
test('only identity-resolved latest-passing candidates receive bounded history and actions', () => {
  const p = planResolvedUSHistory({ rows: [row('GOOD'), row('UNVERIFIED', false), row('BADQUOTE', true, false)] });
  assert.equal(p.estimatedCredits, 3); assert.deepEqual(p.tasks.map(t => t.endpoint), ['eod', 'splits', 'dividends']);
  assert.ok(p.tasks.every(t => t.providerSymbol === 'GOOD' && t.maxPages === 1 && t.retries === 0 && !t.canonicalWritesApproved));
});
test('complete covering cached windows are reused, wrong venue or partial page cannot satisfy history', () => {
  const existing = { endpoint: 'eod', ok: true, params: { symbols: 'GOOD', exchange: 'XNYS', date_from: '2024-01-01', date_to: '2026-10-01' },
    data: { pagination: { total: 1 }, data: [{ symbol: 'GOOD' }] } };
  const p = planResolvedUSHistory({ rows: [row('GOOD')] }, [{ endpoints: [existing] }]);
  assert.equal(p.reusedRequests, 1); assert.equal(p.estimatedRequests, 2);
  assert.equal(planResolvedUSHistory({ rows: [row('GOOD')] }, [{ endpoints: [{ ...existing, params: { ...existing.params, exchange: 'XNAS' } }] }]).reusedRequests, 0);
  assert.equal(planResolvedUSHistory({ rows: [row('GOOD')] }, [{ endpoints: [{ ...existing, data: { pagination: { total: 2 }, data: [{ symbol: 'GOOD' }] } }] }]).reusedRequests, 0);
});
test('hard ceilings persist deferred tasks without redefining resolved target counts', () => {
  const p = planResolvedUSHistory({ rows: [row('A'), row('B')] }, [], { maxRequests: 2 });
  assert.equal(p.tasks.length, 2); assert.equal(p.deferred.length, 4); assert.equal(p.resolvedLatestPassingTargets, 2);
  assert.throws(() => planResolvedUSHistory({ rows: [] }, [], { maxCredits: 501 }), /bounded/);
});
