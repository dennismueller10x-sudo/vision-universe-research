/** Recover interrupted-run accounting through read-only GitHub operations.
 * No provider requests; artifacts remain in private working storage. */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, renameSync, lstatSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { requestKey } from './scale-marketstack.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const fail = reason => { throw Error('RECOVERY_REQUIRED_' + reason); };
const read = file => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { fail('INVALID_JSON'); } };
const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
const checkpointPath = root => join(root, 'checkpoint.json');
function privateRoot(root) {
  root = resolve(root);
  if (/\/(quant\/data|discover\/data|dashboard\/data)(\/|$)/.test(root)) fail('PRIVATE_WORKING_OUTPUT_REQUIRED');
  for (let path = root; ; path = dirname(path)) {
    if (existsSync(path) && lstatSync(path).isSymbolicLink()) fail('UNSAFE_OUTPUT_PATH');
    if (dirname(path) === path) break;
  }
  return root;
}

export function validateCheckpoint(state, root, { requireFiles = true } = {}) {
  if (!object(state) || state.schemaVersion !== 'marketstack-scale-evidence-1.0.0' || !object(state.runs) || !object(state.tasks)) fail('INVALID_CHECKPOINT');
  for (const [id, run] of Object.entries(state.runs)) {
    if (!/^\d+$/.test(id) || !object(run)) fail('INVALID_RUN_LEDGER');
    for (const field of ['requestsAttempted', 'estimatedCreditsConsumed']) {
      if (!Number.isSafeInteger(run[field]) || run[field] < 0) fail('INVALID_RUN_LEDGER');
    }
  }
  let missingFiles = 0;
  for (const [key, task] of Object.entries(state.tasks)) {
    const hash = digest(key), expected = `responses/${parseInt(hash[0], 16) % 4}/${hash}.json`;
    if (!object(task) || task.file !== expected || typeof task.ok !== 'boolean' ||
      requestKey(task.endpoint || '', task.params || {}) !== key) fail('INVALID_TASK_REFERENCE');
    const file = join(root, task.file);
    for (const path of [dirname(dirname(file)), dirname(file), file]) {
      if (existsSync(path) && lstatSync(path).isSymbolicLink()) fail('UNSAFE_RESPONSE_PATH');
    }
    if (!existsSync(file)) { missingFiles++; if (requireFiles) fail('MISSING_RESPONSE_FILE'); continue; }
    const entry = read(file);
    if (!object(entry) || requestKey(entry.endpoint || '', entry.params || {}) !== key ||
      (entry.ok === true) !== task.ok || (entry.checkedAt || null) !== (task.checkedAt || null)) fail('RESPONSE_REFERENCE_MISMATCH');
  }
  const totalCredits = Object.values(state.runs).reduce((sum, run) => sum + run.estimatedCreditsConsumed, 0);
  if (!Number.isSafeInteger(totalCredits)) fail('INVALID_TOTAL_LEDGER');
  return { missingFiles, totalCredits };
}

/** Maxima preserve conservative per-run accounting; never add overlapping
 * artifact snapshots as if they represented separate provider calls. */
export function mergeSnapshots(snapshots) {
  const state = { schemaVersion: 'marketstack-scale-evidence-1.0.0', tasks: {}, runs: {} }, sources = new Map();
  for (const { root, state: incoming } of snapshots) {
    for (const [id, run] of Object.entries(incoming.runs)) {
      const old = state.runs[id];
      if (!old) { state.runs[id] = { ...run }; continue; }
      const newer = time(run.finishedAt || run.startedAt) > time(old.finishedAt || old.startedAt) ? run : old;
      state.runs[id] = { ...newer,
        requestsAttempted: Math.max(old.requestsAttempted, run.requestsAttempted),
        estimatedCreditsConsumed: Math.max(old.estimatedCreditsConsumed, run.estimatedCreditsConsumed) };
    }
    for (const [key, task] of Object.entries(incoming.tasks)) {
      const previous = state.tasks[key], previousRoot = sources.get(key);
      if (!previous || time(task.checkedAt) > time(previous.checkedAt) ||
        time(task.checkedAt) === time(previous.checkedAt) && !existsSync(join(previousRoot, previous.file))) {
        state.tasks[key] = { ...task }; sources.set(key, root);
      } else if (time(task.checkedAt) === time(previous.checkedAt) && existsSync(join(root, task.file)) &&
        existsSync(join(previousRoot, previous.file)) &&
        digest(readFileSync(join(root, task.file))) !== digest(readFileSync(join(previousRoot, previous.file)))) fail('AMBIGUOUS_RESPONSE_SNAPSHOT');
    }
  }
  for (const [key, task] of Object.entries(state.tasks)) if (!existsSync(join(sources.get(key), task.file))) fail('NEWER_RESPONSE_FILE_MISSING');
  return { state, sources };
}

function ghAdapter(repo) {
  const invoke = args => { try { return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 }); }
    catch { fail('GITHUB_READ_FAILED'); } };
  return {
    api: async path => { try { return JSON.parse(invoke(['api', path])); } catch (error) {
      if (error.message?.startsWith('RECOVERY_REQUIRED_')) throw error; fail('GITHUB_METADATA_INVALID'); } },
    download: async (id, name, directory) => { invoke(['run', 'download', String(id), '--repo', repo, '--name', name, '--dir', directory]); }
  };
}

async function pages(api, path, key) {
  const all = []; let reportedTotal = null;
  for (let page = 1; page <= 100; page++) {
    const result = await api(path + (path.includes('?') ? '&' : '?') + `per_page=100&page=${page}`);
    if (!object(result) || !Array.isArray(result[key])) fail('GITHUB_PAGINATION_INVALID');
    if (result.total_count !== undefined) {
      if (!Number.isSafeInteger(result.total_count) || result.total_count < 0 || reportedTotal !== null && reportedTotal !== result.total_count) fail('GITHUB_PAGINATION_INVALID');
      reportedTotal = result.total_count;
    }
    all.push(...result[key]);
    if (result[key].length < 100) { Object.defineProperty(all, 'reportedTotal', { value: reportedTotal }); return all; }
  }
  fail('GITHUB_PAGINATION_LIMIT');
}

export async function recoverScaleEvidence(options) {
  const repo = options.repo, branch = options.branch, currentRunId = String(options.currentRunId || '');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '') || !branch || !/^\d+$/.test(currentRunId)) fail('INVALID_GITHUB_SCOPE');
  const root = privateRoot(options.output);
  const empty = { schemaVersion: 'marketstack-scale-evidence-1.0.0', tasks: {}, runs: {} };
  const local = existsSync(checkpointPath(root)) ? read(checkpointPath(root)) : empty;
  const localStatus = validateCheckpoint(local, root, { requireFiles: false });
  const currentRunAttempt = Number(options.currentRunAttempt || 1);
  if (!Number.isSafeInteger(currentRunAttempt) || currentRunAttempt < 1 || currentRunAttempt > 100) fail('INVALID_CURRENT_RUN_ATTEMPT');
  const gh = options.gh || ghAdapter(repo), workflow = options.workflow || 'marketstack-scale-probe.yml';
  if (!/^[\w.-]+\.ya?ml$/.test(workflow)) fail('INVALID_WORKFLOW');
  const runs = (await pages(gh.api, `repos/${repo}/actions/workflows/${workflow}/runs?branch=${encodeURIComponent(branch)}`, 'workflow_runs'))
    .filter(run => run.head_branch === branch && String(run.id) !== currentRunId);
  const stage = mkdtempSync(join(tmpdir(), 'vu-marketstack-scale-recovery-'));
  const snapshots = [{ root, state: local }], recovered = [], noCollectionStarted = [];
  try {
    const downloadSnapshot = async (id, attempt, { startedAt, completedAt, strictProvenance = false } = {}) => {
      const artifacts = await pages(gh.api, `repos/${repo}/actions/runs/${id}/artifacts`, 'artifacts');
      const available = name => artifacts.find(artifact => artifact.name === name && !artifact.expired);
      let suffix = `${id}-${attempt}`, core = available(`marketstack-scale-core-${suffix}`);
      // Immutable legacy names cannot represent later workflow attempts.
      if (!core && attempt === 1) { suffix = id; core = available(`marketstack-scale-core-${suffix}`); }
      if (!core) fail('MISSING_CORE_ARTIFACT');
      if (strictProvenance && (!time(completedAt) || !time(core.created_at) || time(core.created_at) < time(completedAt))) fail('STALE_RETRY_ARTIFACT');
      const directory = join(stage, id + '-' + attempt); mkdirSync(directory, { recursive: true });
      await gh.download(id, core.name, directory);
      const state = read(checkpointPath(directory));
      if (!state.runs?.[id]) fail('SOURCE_RUN_LEDGER_MISSING');
      if (time(startedAt) && time(state.updatedAt) < time(startedAt)) fail('STALE_RETRY_ARTIFACT');
      for (let part = 0; part < 4; part++) {
        const name = `marketstack-scale-part${part}-${suffix}`, partRoot = join(directory, 'responses', String(part));
        if (available(name)) { mkdirSync(partRoot, { recursive: true }); await gh.download(id, name, partRoot); }
      }
      validateCheckpoint(state, directory); snapshots.push({ root: directory, state }); recovered.push(id + ':' + attempt);
    };
    const collectionStepName = options.collectionStepName || 'Bounded scaled evidence collection';
    const collectionSteps = (jobs, fallbackAttempt) => jobs.flatMap(job => Array.isArray(job.steps) ? job.steps
      .filter(step => step.name === collectionStepName && step.conclusion !== 'skipped' && (!!step.started_at || step.status === 'in_progress'))
      .map(step => ({ ...step, attempt: Number(job.run_attempt || fallbackAttempt) })) : []);
    // The current ID is excluded from the previous-run scan, but its prior
    // attempts still need independent artifact proof. An old cache ledger is
    // not proof that a newer timed-out attempt incurred no additional spend.
    if (currentRunAttempt > 1) {
      const priorStarted = [];
      for (let attempt = 1; attempt < currentRunAttempt; attempt++) {
        const metadata = await gh.api(`repos/${repo}/actions/runs/${currentRunId}/attempts/${attempt}`);
        if (!object(metadata) || metadata.status !== 'completed' || metadata.head_branch !== branch) fail('CURRENT_RETRY_HISTORY_UNKNOWN');
        const jobs = await pages(gh.api, `repos/${repo}/actions/runs/${currentRunId}/attempts/${attempt}/jobs`, 'jobs');
        if (!jobs.length && !(metadata.conclusion === 'cancelled' && jobs.reportedTotal === 0)) fail('CURRENT_RETRY_HISTORY_UNKNOWN');
        if (jobs.length && !jobs.some(job => Array.isArray(job.steps) && job.steps.some(step => step.name === collectionStepName)) &&
          jobs.some(job => job.conclusion !== 'skipped')) fail('CURRENT_RETRY_HISTORY_UNKNOWN');
        priorStarted.push(...collectionSteps(jobs, attempt));
      }
      if (priorStarted.length) {
        const latest = priorStarted.sort((a, b) => b.attempt - a.attempt || time(b.started_at) - time(a.started_at))[0];
        await downloadSnapshot(currentRunId, latest.attempt, { startedAt: latest.started_at,
          completedAt: latest.completed_at, strictProvenance: true });
      }
    }
    for (const run of runs) {
      const id = String(run.id);
      if (!/^\d+$/.test(id)) fail('INVALID_GITHUB_RUN_ID');
      const jobs = await pages(gh.api, `repos/${repo}/actions/runs/${id}/jobs?filter=all`, 'jobs');
      if (!jobs.length && !['queued', 'pending', 'waiting', 'requested'].includes(run.status) &&
        !(run.status === 'completed' && run.conclusion === 'cancelled' && jobs.reportedTotal === 0)) fail('COLLECTION_HISTORY_UNKNOWN');
      const stepName = collectionStepName;
      const relevantSteps = jobs.flatMap(job => Array.isArray(job.steps) ? job.steps.filter(step => step.name === stepName) : []);
      if (jobs.length && !relevantSteps.length && jobs.some(job => job.conclusion !== 'skipped' &&
        !['queued', 'pending', 'waiting', 'requested'].includes(job.status))) fail('COLLECTION_HISTORY_UNKNOWN');
      const started = collectionSteps(jobs, Number(run.run_attempt || 1) === 1 ? 1 : null);
      if (!started.length) { noCollectionStarted.push(id); continue; }
      if (run.status !== 'completed') fail('PREVIOUS_RUN_ACTIVE');
      if (local.runs[id]?.finishedAt && !localStatus.missingFiles && Number(run.run_attempt || 1) === 1) continue;
      const latest = started.sort((a, b) => b.attempt - a.attempt || time(b.started_at) - time(a.started_at))[0];
      if (!Number.isSafeInteger(latest.attempt) || latest.attempt < 1) fail('RETRY_ATTEMPT_UNKNOWN');
      await downloadSnapshot(id, latest.attempt, { startedAt: latest.started_at, completedAt: latest.completed_at,
        strictProvenance: Number(run.run_attempt || 1) > 1 });
    }
    const merged = mergeSnapshots(snapshots);
    // Validate every selected source before changing any restored cache file.
    for (const [key, task] of Object.entries(merged.state.tasks)) {
      const source = join(merged.sources.get(key), task.file), destination = join(root, task.file);
      if (source === destination) continue;
      privateRoot(dirname(destination));
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination + '.tmp', readFileSync(source), { mode: 0o600 }); renameSync(destination + '.tmp', destination);
    }
    mkdirSync(root, { recursive: true });
    merged.state.createdAt = local.createdAt || new Date().toISOString();
    merged.state.updatedAt = new Date().toISOString();
    merged.state.recovery = { checkedRunIds: runs.map(run => String(run.id)), recoveredRunIds: recovered,
      noCollectionStartedRunIds: noCollectionStarted, recoveredAt: merged.state.updatedAt };
    const status = validateCheckpoint(merged.state, root);
    writeFileSync(checkpointPath(root) + '.tmp', JSON.stringify(merged.state) + '\n', { mode: 0o600 });
    renameSync(checkpointPath(root) + '.tmp', checkpointPath(root));
    return { ok: true, checkedRuns: runs.length, recoveredRuns: recovered.length,
      noCollectionStartedRuns: noCollectionStarted.length, accountedRunCount: Object.keys(merged.state.runs).length,
      estimatedCreditsConsumed: status.totalCredits, responseFiles: Object.keys(merged.state.tasks).length };
  } finally { rmSync(stage, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const arg = name => process.argv.find(value => value.startsWith('--' + name + '='))?.slice(name.length + 3);
  try {
    const result = await recoverScaleEvidence({ repo: arg('repo') || process.env.GITHUB_REPOSITORY,
      branch: arg('branch') || process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME,
      currentRunId: arg('run-id') || process.env.GITHUB_RUN_ID,
      currentRunAttempt: arg('run-attempt') || process.env.GITHUB_RUN_ATTEMPT || 1,
      workflow: arg('workflow'), output: arg('out') || '.market-cache/marketstack/scale' });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, reason: error.message?.startsWith('RECOVERY_REQUIRED_') ? error.message : 'RECOVERY_REQUIRED' }));
    process.exitCode = 1;
  }
}
