/**
 * V4 performance freeze: built after the V4 calibration summary exists and before any performance measurement.
 * Binds the method code closure (source-faithful Turtle engine, V4 runner for the old adaptation, metrics),
 * the method specs/traceability/golden cases, the V4 test suite, the exact calibration summary bytes and the
 * same canonical content binding as the calibration freeze. Content-only id; git pinning as in freeze-v4.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { importClosureV4, hashFilesV4, testSuiteFiles, freezeIdOf, ROOT, verifyFreezePinned } from './freeze-v4.mjs';

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const demand = (ok, code) => { if (!ok) throw new Error(code); };
const V4 = 'scripts/supertrader/research/v4';
export const PERFORMANCE_FREEZE_SCHEMA = 'supertrader-v4-performance-freeze-1.0.0';
export const PERFORMANCE_ENTRY_POINTS = [`${V4}/run-performance-v4.mjs`, `${V4}/freeze-performance-v4.mjs`, 'scripts/supertrader/research/calibration/capture-v3-inrunner.mjs'];
export const PERFORMANCE_CONTRACTS = [
  `${V4}/SUPERTRADER-V4-METHOD-ELIGIBILITY.json`,
  `${V4}/SUPERTRADER-V4-SOURCE-CODE-TRACEABILITY.json`,
  `${V4}/SUPERTRADER-V4-GOLDEN-CASES.json`,
  `${V4}/methods/TURTLE-SOURCE-V4-SPEC.json`,
  'scripts/supertrader/research/tournament/protocol.json',
  '.github/workflows/supertrader-v4-performance.yml',
];
export const IMPLEMENT_NOW_METHODS = ['TURTLE_S1_SOURCE', 'TURTLE_S2_SOURCE'];
export const AB_OLD_ADAPTATIONS = ['TURTLE_S2_EQUITY_DAILY'];

/**
 * V4.1 (review R11): the calibration summary must come from the measuring job of the pinned calibration freeze:
 * its freezeCommit is the commit that last wrote the freeze file, that commit is an ancestor of the commit that
 * last wrote the summary, and the summary commit was made by the workflow bot.
 */
export function verifyCalibrationSummaryProvenance(root, calibrationFreezeFile, calibrationSummaryFile, summary) {
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
  const freezeCommit = git('log', '-n', '1', '--format=%H', '--', calibrationFreezeFile);
  demand(summary.freezeCommit === freezeCommit, 'CALIBRATION_SUMMARY_FREEZE_COMMIT_MISMATCH');
  const summaryCommit = git('log', '-n', '1', '--format=%H', '--', calibrationSummaryFile);
  demand(/^[0-9a-f]{40}$/.test(summaryCommit), 'CALIBRATION_SUMMARY_NOT_COMMITTED');
  execFileSync('git', ['merge-base', '--is-ancestor', freezeCommit, summaryCommit], { cwd: root });
  demand(git('log', '-n', '1', '--format=%an', summaryCommit) === 'github-actions[bot]', 'CALIBRATION_SUMMARY_NOT_WRITTEN_BY_WORKFLOW');
  return { freezeCommit, summaryCommit };
}

export function buildPerformanceFreezeV4({ root = ROOT, calibrationFreezeFile, calibrationSummaryFile, now = new Date().toISOString() }) {
  const calFreeze = JSON.parse(fs.readFileSync(path.join(root, calibrationFreezeFile))), summaryBytes = fs.readFileSync(path.join(root, calibrationSummaryFile));
  const summary = JSON.parse(summaryBytes);
  demand(summary.freezeId === calFreeze.freezeId, 'CALIBRATION_SUMMARY_NOT_FROM_THIS_FREEZE');
  const provenance = verifyCalibrationSummaryProvenance(root, calibrationFreezeFile, calibrationSummaryFile, summary);
  const eligibility = JSON.parse(fs.readFileSync(path.join(root, V4, 'SUPERTRADER-V4-METHOD-ELIGIBILITY.json')));
  const implementNow = eligibility.methods.filter((m) => m.eligibility === 'IMPLEMENT_NOW').map((m) => m.id).sort();
  demand(JSON.stringify(implementNow) === JSON.stringify([...IMPLEMENT_NOW_METHODS].sort()), 'PERFORMANCE_METHOD_SET_DIFFERS_FROM_ELIGIBILITY');
  const closure = importClosureV4(PERFORMANCE_ENTRY_POINTS, root);
  demand(closure.unresolvedDynamicRequires.length === 0, 'FREEZE_UNRESOLVED_DYNAMIC_REQUIRE');
  const frozen = {
    schema: PERFORMANCE_FREEZE_SCHEMA, generation: 'V4', postHoc: true, status: 'FROZEN_BEFORE_V4_PERFORMANCE',
    calibrationFreezeId: calFreeze.freezeId, calibrationSummarySha256: sha(summaryBytes), calibrationProvenance: provenance, calibrationLevel: summary.certification?.level ?? null,
    dataContract: calFreeze.dataContract.canonicalCapture,
    methods: { implementNow: IMPLEMENT_NOW_METHODS, abOldAdaptations: AB_OLD_ADAPTATIONS },
    noParameterSearch: true, noPostResultTuning: true,
    contracts: hashFilesV4(PERFORMANCE_CONTRACTS, root), code: hashFilesV4(closure.files, root), testSuite: hashFilesV4([...testSuiteFiles(root), 'scripts/supertrader/tests/v4-fixtures.mjs'], root),
  };
  return { ...frozen, freezeId: 'P' + freezeIdOf(frozen), createdAt: now };
}

export function verifyPerformanceFreezeV4(freeze, root = ROOT) {
  demand(freeze?.schema === PERFORMANCE_FREEZE_SCHEMA, 'PERFORMANCE_FREEZE_SCHEMA_INVALID');
  const { freezeId, createdAt, ...frozen } = freeze;
  demand('P' + freezeIdOf(frozen) === freezeId, 'PERFORMANCE_FREEZE_ID_MISMATCH');
  for (const section of ['contracts', 'code', 'testSuite']) for (const [f, h] of Object.entries(frozen[section])) demand(sha(fs.readFileSync(path.join(root, f))) === h, 'PERFORMANCE_FREEZE_HASH_MISMATCH:' + f);
  const closure = importClosureV4(PERFORMANCE_ENTRY_POINTS, root);
  demand(closure.files.every((f) => f in frozen.code), 'PERFORMANCE_FREEZE_CODE_CLOSURE_GREW');
  return { status: 'V4_PERFORMANCE_FREEZE_VERIFIED', freezeId };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...a] = process.argv.slice(2), get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
  try {
    if (cmd === 'build') {
      const f = buildPerformanceFreezeV4({ calibrationFreezeFile: get('--calibration-freeze'), calibrationSummaryFile: get('--calibration-summary') });
      fs.writeFileSync(get('--out'), JSON.stringify(f, null, 2) + '\n', { flag: 'wx' });
      process.stdout.write(JSON.stringify({ status: f.status, freezeId: f.freezeId, calibrationLevel: f.calibrationLevel }) + '\n');
    } else if (cmd === 'verify') {
      const r = verifyPerformanceFreezeV4(JSON.parse(fs.readFileSync(get('--freeze'), 'utf8')));
      process.stdout.write(JSON.stringify(a.includes('--pinned') ? { ...r, ...verifyFreezePinned(get('--freeze')) } : r) + '\n');
    } else throw new Error('USAGE_BUILD_OR_VERIFY');
  } catch (e) { process.stderr.write(JSON.stringify({ phase: 'V4_PERFORMANCE_FREEZE', code: /^[A-Z0-9_:./-]+$/.test(e.message) ? e.message : 'FREEZE_FAILED' }) + '\n'); process.exitCode = 1; }
}
