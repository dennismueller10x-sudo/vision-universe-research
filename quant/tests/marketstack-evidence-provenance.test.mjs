import test from 'node:test';
import assert from 'node:assert/strict';
import {responseProvenance, probeResponseProvenance} from '../../scripts/market/marketstack-evidence-provenance.mjs';
const runs = {old: {startedAt: '2026-10-01T01:00:00Z', finishedAt: '2026-10-01T02:00:00Z'}, latest: {startedAt: '2026-10-01T03:00:00Z', finishedAt: '2026-10-01T04:00:00Z'}};
test('cached explicit original run overrides replay run and interval', () => {
  assert.equal(responseProvenance({sourceRunId:'original', checkedAt:'2026-10-01T03:30:00Z'}, {runs,lastRun:{runId:'latest'}}).sourceRunId,'original');
});
test('legacy unique intervals are explicitly inferred rather than relabeled latest', () => {
  assert.deepEqual(responseProvenance({checkedAt:'2026-10-01T01:30:00Z'}, {runs,lastRun:{runId:'latest'}}), {sourceRunId:'old',sourceRunAttribution:'CHECKPOINT_INTERVAL_ATTRIBUTION'});
});
test('missing, seeded and overlapping original-run evidence stays unknown', () => {
  assert.equal(responseProvenance({seeded:true,checkedAt:'2026-10-01T01:30:00Z'}, {runs}).sourceRunId,null);
  assert.equal(responseProvenance({}, {runs,lastRun:{runId:'latest'}}).sourceRunId,null);
  assert.equal(responseProvenance({checkedAt:'2026-10-01T01:30:00Z'}, {runs:{...runs,overlap:runs.old}}).sourceRunId,null);
});

test('replaying inferred provenance cannot upgrade it to explicit source proof',()=>{assert.deepEqual(responseProvenance({sourceRunId:'old',sourceRunAttribution:'CHECKPOINT_INTERVAL_ATTRIBUTION'}),{sourceRunId:'old',sourceRunAttribution:'CHECKPOINT_INTERVAL_ATTRIBUTION'});});

test('only a verified original single-run probe supplies enclosing response origin', () => {
  const original = {schemaVersion:'marketstack-probe-1.0.0',run:{source:'github-actions',runId:'first'},accounting:{provider:'marketstack',requestsAttempted:1}};
  assert.equal(probeResponseProvenance({}, original).sourceRunAttribution,'ORIGINAL_SINGLE_RUN_PROBE');
  assert.equal(probeResponseProvenance({}, {...original,run:{...original.run,snapshotRunId:'later'}}).sourceRunId,null);
  assert.equal(probeResponseProvenance({}, {...original,accounting:runs}).sourceRunId,null);
  assert.deepEqual(probeResponseProvenance({checkedAt:'2026-10-01T01:30:00Z'}, {run:{runId:'latest'},accounting:runs}),{sourceRunId:'old',sourceRunAttribution:'CHECKPOINT_INTERVAL_ATTRIBUTION'});
  assert.equal(probeResponseProvenance({seeded:true}, original).sourceRunId,null);
});
