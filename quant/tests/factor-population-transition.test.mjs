import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { validateTransition } = require('../engines/factor-population-transition.js');

test('validated additions retain every published factor identity', () => {
  const result = validateTransition({ A: [40], B: [50] }, { A: [41], B: [49], C: [70] });
  assert.equal(result.safe, true);
  assert.deepEqual(result.added, ['C']);
  assert.deepEqual(result.removed, []);
});

test('an unexplained adjustment may not silently remove a published identity', () => {
  const result = validateTransition({ ADTN: [45.73], APD: [50] }, { APD: [50] });
  assert.equal(result.safe, false);
  assert.deepEqual(result.unexpected, ['ADTN']);
});

test('a removal already baked into the current artifact still blocks on the historical baseline', () => {
  const result = validateTransition({ APD: [50] }, { APD: [51] }, [], ['ADTN', 'APD']);
  assert.equal(result.safe, false);
  assert.deepEqual(result.unexpected, ['ADTN']);
});

test('removal requires explicit, complete before and after evidence', () => {
  const prior = { ADTN: [45.73] };
  assert.throws(() => validateTransition(prior, {}, [{ ticker: 'ADTN', reasonCode: 'PROVIDER_HISTORY_RESTATEMENT' }]),
    /FACTOR_REMOVAL_DECISION_INCOMPLETE/);
  const decision = { ticker: 'ADTN', reasonCode: 'VALIDATED_DATA_DEFECT',
    beforeEvidence: 'sha256:old', afterEvidence: 'sha256:new',
    scoreImpact: 'quality 45.73 -> unavailable', rankingImpact: 'population -1',
    reviewedBy: 'data-owner', reviewedAt: '2026-10-04' };
  const result = validateTransition(prior, {}, [decision]);
  assert.equal(result.safe, true);
  assert.deepEqual(result.removed, ['ADTN']);
  assert.deepEqual(result.reviewedRemovals, [decision]);
  assert.throws(() => validateTransition(prior, prior, [decision]), /NOT_APPLICABLE/);
});
