import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { recoverScaleEvidence, validateCheckpoint } from '../../scripts/market/recover-marketstack-scale.mjs';
import { requestKey } from '../../scripts/market/scale-marketstack.mjs';

const roots = [], root = () => { const r = mkdtempSync(join(tmpdir(), 'vu-recovery-test-')); roots.push(r); return r; };
process.on('exit', () => roots.forEach(r => rmSync(r, { recursive: true, force: true })));
const run = (id, credits = 3) => ({ phase: 'validation', requestsAttempted: 1, estimatedCreditsConsumed: credits, startedAt: '2026-10-01T12:00:00Z' });
const workflowRun = (id, changes = {}) => ({ id, head_branch: 'feat/marketstack-scale-test', status: 'completed', run_attempt: 1, ...changes });
const startedJobs = [{ steps: [{ name: 'Bounded scaled evidence collection', started_at: '2026-10-01T12:00:00Z', completed_at: '2026-10-01T12:02:00Z', status: 'completed', conclusion: 'failure' }] }];
const options = (output, gh, extra = {}) => ({ output, gh, repo: 'org/repo', branch: 'feat/marketstack-scale-test', currentRunId: '200', ...extra });
function snapshot(id = '100', changes = {}) {
  const directory = root(), key = requestKey('eod', { symbols: 'SAP.DE', exchange: 'XETR' });
  const hash = createHash('sha256').update(key).digest('hex'), file = `responses/${parseInt(hash[0], 16) % 4}/${hash}.json`;
  const entry = { endpoint: 'eod', params: { symbols: 'SAP.DE', exchange: 'XETR' }, checkedAt: changes.checkedAt || '2026-10-01T12:01:00Z', ok: true, data: { data: [{ close: changes.close || 100 }] } };
  const state = { schemaVersion: 'marketstack-scale-evidence-1.0.0', updatedAt: '2026-10-01T12:02:00Z',
    runs: { [id]: run(id, changes.credits || 3) }, tasks: { [key]: { file, endpoint: entry.endpoint, params: entry.params, checkedAt: entry.checkedAt, ok: true } } };
  mkdirSync(dirname(join(directory, file)), { recursive: true });
  writeFileSync(join(directory, file), JSON.stringify(entry)); writeFileSync(join(directory, 'checkpoint.json'), JSON.stringify(state));
  return { directory, state, file, key, entry };
}
function fakeGh(runs, sources = {}, config = {}) {
  const calls = [], downloads = [];
  return { calls, downloads,
    api: async path => {
      calls.push(path);
      if (path.includes('/workflows/')) return { workflow_runs: runs };
      const attempt = path.match(/\/attempts\/(\d+)/)?.[1];
      if (attempt && !path.includes('/jobs')) return config.attempts?.[attempt] || { status: 'completed', head_branch: 'feat/marketstack-scale-test', conclusion: 'failure' };
      const id = path.match(/\/runs\/(\d+)\//)?.[1];
      if (path.includes('/jobs')) {
        const jobs = config.attemptJobs?.[attempt] ?? config.jobs?.[id] ?? startedJobs.map(job => ({ ...job, run_attempt: runs.find(run => String(run.id) === id)?.run_attempt || Number(attempt || 1) }));
        return { jobs, total_count: jobs.length };
      }
      if (path.includes('/artifacts')) return { artifacts: config.artifacts?.[id] ?? [
        { name: `marketstack-scale-core-${id}`, created_at: '2026-10-01T12:03:00Z' }, ...[0, 1, 2, 3].map(part => ({ name: `marketstack-scale-part${part}-${id}` }))] };
      throw Error('Unexpected test path');
    },
    download: async (id, name, directory) => {
      downloads.push(name); const source = sources[id];
      if (name.includes('-core-')) copyFileSync(join(source.directory, 'checkpoint.json'), join(directory, 'checkpoint.json'));
      else { const part = Number(name.match(/-part(\d)-/)[1]);
        for (const task of Object.values(source.state.tasks)) if (Number(task.file.split('/')[1]) === part) copyFileSync(join(source.directory, task.file), join(directory, task.file.split('/').at(-1)));
      }
    }
  };
}

test('current, other-branch, and proven pending/skipped runs cannot add provider spend', async () => {
  const gh = fakeGh([workflowRun('200'), workflowRun('300', { head_branch: 'other' }), workflowRun('101', { status: 'queued' }), workflowRun('102')], {},
    { jobs: { '101': [], '102': [{ steps: [{ name: 'Bounded scaled evidence collection', conclusion: 'skipped', started_at: null }] }] } });
  const result = await recoverScaleEvidence(options(root(), gh));
  assert.equal(result.estimatedCreditsConsumed, 0); assert.equal(result.noCollectionStartedRuns, 2);
  assert.equal(gh.downloads.length, 0); assert.ok(!gh.calls.some(path => /runs\/(200|300)\//.test(path)));
});

test('interrupted collection recovers core plus four buckets and retained conservative credits', async () => {
  const source = snapshot(), out = root(), gh = fakeGh([workflowRun('100')], { '100': source });
  const result = await recoverScaleEvidence(options(out, gh));
  assert.equal(result.recoveredRuns, 1); assert.equal(result.estimatedCreditsConsumed, 3);
  assert.equal(gh.downloads.length, 5); assert.equal(result.responseFiles, 1);
  assert.equal(JSON.parse(readFileSync(join(out, source.file))).data.data[0].close, 100);
});

test('collection that started with no usable core artifact fails closed before creating a new ledger', async () => {
  const out = root(), gh = fakeGh([workflowRun('100')], {}, { artifacts: { '100': [] } });
  await assert.rejects(recoverScaleEvidence(options(out, gh)), /RECOVERY_REQUIRED_MISSING_CORE_ARTIFACT/);
  assert.equal(existsSync(join(out, 'checkpoint.json')), false);
});

test('referenced response missing from the artifact buckets cannot be treated as a resumable zero-spend run', async () => {
  const source = snapshot(), out = root(), gh = fakeGh([workflowRun('100')], { '100': source },
    { artifacts: { '100': [{ name: 'marketstack-scale-core-100' }] } });
  await assert.rejects(recoverScaleEvidence(options(out, gh)), /RECOVERY_REQUIRED_MISSING_RESPONSE_FILE/);
  assert.equal(existsSync(join(out, 'checkpoint.json')), false);
});

test('merging overlapping snapshots takes per-run credit maxima and preserves newer local response data', async () => {
  const older = snapshot('100'), newer = snapshot('100', { credits: 5, checkedAt: '2026-10-01T12:03:00Z', close: 110 });
  const gh = fakeGh([workflowRun('100')], { '100': older });
  const result = await recoverScaleEvidence(options(newer.directory, gh));
  assert.equal(result.estimatedCreditsConsumed, 5);
  assert.equal(JSON.parse(readFileSync(join(newer.directory, newer.file))).data.data[0].close, 110);
});

test('an incomplete restored response tree can recover matching files while preserving accounted spend', async () => {
  const source = snapshot(), out = root(); writeFileSync(join(out, 'checkpoint.json'), JSON.stringify(source.state));
  const result = await recoverScaleEvidence(options(out, fakeGh([workflowRun('100')], { '100': source })));
  assert.equal(result.estimatedCreditsConsumed, 3); assert.equal(existsSync(join(out, source.file)), true);
});

test('invalid ledger and escaping response paths abort before any GitHub or provider operation', async () => {
  const bad = snapshot(), gh = fakeGh([]); bad.state.runs['100'].estimatedCreditsConsumed = -1;
  writeFileSync(join(bad.directory, 'checkpoint.json'), JSON.stringify(bad.state));
  await assert.rejects(recoverScaleEvidence(options(bad.directory, gh)), /RECOVERY_REQUIRED_INVALID_RUN_LEDGER/);
  assert.equal(gh.calls.length, 0);
  const escape = snapshot(); escape.state.tasks[escape.key].file = '../../outside.json';
  assert.throws(() => validateCheckpoint(escape.state, escape.directory), /RECOVERY_REQUIRED_INVALID_TASK_REFERENCE/);
});

test('a missing ledger on a collection-started current workflow rerun requires recoverable artifacts', async () => {
  const gh = fakeGh([], {}, { artifacts: { '200': [] } });
  await assert.rejects(recoverScaleEvidence(options(root(), gh, { currentRunAttempt: 2 })), /RECOVERY_REQUIRED_MISSING_CORE_ARTIFACT/);
  assert.ok(gh.calls.some(path => path.includes('/attempts/1/jobs')));
});

test('a still active previous collection cannot share the request budget concurrently', async () => {
  const gh = fakeGh([workflowRun('100', { status: 'in_progress' })]);
  await assert.rejects(recoverScaleEvidence(options(root(), gh)), /RECOVERY_REQUIRED_PREVIOUS_RUN_ACTIVE/);
  assert.equal(gh.downloads.length, 0);
});

test('an older artifact from a previous retry attempt cannot conceal additional interrupted spend', async () => {
  const source = snapshot(), gh = fakeGh([workflowRun('100', { run_attempt: 2, run_started_at: '2026-10-01T13:00:00Z' })], { '100': source });
  await assert.rejects(recoverScaleEvidence(options(root(), gh)), /RECOVERY_REQUIRED_MISSING_CORE_ARTIFACT/);
});

test('a three-attempt current retry rejects an attempt-one cached ledger after attempt-two collection', async () => {
  const old = snapshot('200', { credits: 5 });
  const gh = fakeGh([], { '200': old });
  await assert.rejects(recoverScaleEvidence(options(old.directory, gh, { currentRunAttempt: 3 })), /RECOVERY_REQUIRED_MISSING_CORE_ARTIFACT/);
  assert.equal(JSON.parse(readFileSync(join(old.directory, 'checkpoint.json'))).runs['200'].estimatedCreditsConsumed, 5);
});

test('attempt-scoped final artifacts restore additional same-ID retry credits', async () => {
  const old = snapshot('200', { credits: 5 }), latest = snapshot('200', { credits: 15, checkedAt: '2026-10-01T12:04:00Z' });
  const artifacts = [{ name: 'marketstack-scale-core-200-2', created_at: '2026-10-01T12:05:00Z' }, ...[0, 1, 2, 3].map(part => ({ name: `marketstack-scale-part${part}-200-2` }))];
  const result = await recoverScaleEvidence(options(old.directory, fakeGh([], { '200': latest }, { artifacts: { '200': artifacts } }), { currentRunAttempt: 3 }));
  assert.equal(result.estimatedCreditsConsumed, 15);
});

test('a completed cancelled run with officially zero jobs is proven zero spend; failed/successful zero-job runs are unknown', async () => {
  const gh = fakeGh([workflowRun('100', { conclusion: 'cancelled' })], {}, { jobs: { '100': [] } });
  assert.equal((await recoverScaleEvidence(options(root(), gh))).estimatedCreditsConsumed, 0);
  for (const conclusion of ['success', 'failure']) {
    const unknown = fakeGh([workflowRun('100', { conclusion })], {}, { jobs: { '100': [] } });
    await assert.rejects(recoverScaleEvidence(options(root(), unknown)), /RECOVERY_REQUIRED_COLLECTION_HISTORY_UNKNOWN/);
  }
});
