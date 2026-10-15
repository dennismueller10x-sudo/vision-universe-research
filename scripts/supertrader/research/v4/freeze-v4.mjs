/**
 * V4 pre-measurement freeze. Post-hoc generation: V3 freezes and results stay unchanged historical evidence.
 *
 * Differences to freeze-v3.mjs (adversarial findings A3, A13):
 *  - The code closure also follows `require(path.join(root|ROOT, '<repo path>'))` and `createRequire`
 *    requires, so quant/engines/return-series.js, canonical-total-return.js and published-close.js are bound.
 *    A require target that cannot be resolved statically fails the freeze (no unbound loader).
 *  - The corporate-action/split policy is an explicit, hashed section (files, functions, conventions).
 *  - freezeId hashes the frozen content only; createdAt and run provenance are outside the id, so the same
 *    content always yields the same id. Pinning before measurement is a pushed git commit (workflow), verified
 *    by the measuring job (`verifyFreezePinned`).
 *  - Contracts (policy, constructions, tolerances, oracle manifest, calibration spec) and the V4 test suite are bound.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MEASUREMENT_POLICY_V4 } from './measurement/measurement-policy-v4.mjs';
import { CONSTRUCTION_CONTRACT_V4 } from './oracle/constructions-v4.mjs';
import { ORACLE_TOLERANCES_V4, INTERNAL_RECONCILIATION_TOLERANCE_V4 } from './oracle/compare-v4.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../../../..');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const demand = (ok, code) => { if (!ok) throw new Error(code); };
const rel = (root, f) => path.relative(root, f).split(path.sep).join('/');
export const FREEZE_V4_SCHEMA = 'supertrader-calibration-v4-freeze-1.0.0';
const V4 = 'scripts/supertrader/research/v4';

export const ENTRY_POINTS_V4 = [
  `${V4}/run-calibration-v4.mjs`,
  `${V4}/capture-oracle-v4.mjs`,
  `${V4}/freeze-v4.mjs`,
  `${V4}/completion-v4.mjs`,
  'scripts/supertrader/research/calibration/capture-v3-inrunner.mjs',
];
export const CONTRACT_FILES_V4 = [
  `${V4}/SUPERTRADER-V4-ORACLE-MANIFEST.json`,
  `${V4}/SUPERTRADER-V4-CALIBRATION-SPEC.json`,
  `${V4}/SUPERTRADER-V4-ADVERSARIAL-FINDINGS.json`,
  'scripts/supertrader/research/tournament/protocol.json',
  'scripts/supertrader/research/calibration/protocol.json',
  '.github/workflows/supertrader-v4-calibration.yml',
];
export const SPLIT_POLICY_V4 = Object.freeze({
  id: 'VU_V4_CORPORATE_ACTION_SPLIT_POLICY',
  files: [
    'quant/engines/return-series.js',
    'quant/engines/canonical-total-return.js',
    'quant/engines/published-close.js',
    'scripts/supertrader/research/tournament/data.mjs',
    `${V4}/measurement/measurement-policy-v4.mjs`,
    `${V4}/measurement/price-sanity-v4.mjs`,
    `${V4}/measurement/accounting-v4.mjs`,
  ],
  runtimeFiles: [
    'quant/engines/return-series.js',
    'quant/engines/canonical-total-return.js',
    'scripts/supertrader/research/tournament/data.mjs',
    `${V4}/measurement/measurement-policy-v4.mjs`,
    `${V4}/measurement/price-sanity-v4.mjs`,
    `${V4}/measurement/accounting-v4.mjs`,
  ],
  publishedCloseNote: 'published-close.js is hash-bound but not on the calibration runtime path (ADR-002 deviation, finding A12: calibration reads the canonical total-return index, which uses the same splitFactors)',
  functions: ['return-series.js#splitFactors', 'canonical-total-return.js#reconstruct', 'data.mjs#normalizeSegment', 'data.mjs#firstCanonicalFailure'],
  adjustmentMode: 'BACKWARD_CUMULATIVE_SPLIT_FACTORS (adjusted = raw / cumulative factor of later splits)',
  rawAdjustedConvention: 'bars carry raw OHLCV (rawOpen..rawVolume) and split-adjusted OHLCV; dividends split-adjusted; total-return index from the canonical core',
  exceptionCodes: 'canonical core reasons (FIRST_CANONICAL_FAILURE -> DATA_QUARANTINE of the future, valid prefix kept); V4 price sanity classes',
  terminalHandling: MEASUREMENT_POLICY_V4.cases,
  acquisitionHandling: MEASUREMENT_POLICY_V4.cases.ACQUISITION_OFFICIAL_CLASS,
  cashProceeds: 'not observed; scenario factors only (frozen protocol); certified cash events fail closed in calibration',
  delistingHandling: MEASUREMENT_POLICY_V4.cases.DELISTED_UNKNOWN_CLASS,
});

const STATIC_RE = /(?:from\s+|import\(\s*|require\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g;
const JOIN_RE = /require\(\s*path\.join\(\s*(?:root|ROOT)\s*,\s*['"]([^'"]+)['"]\s*\)\s*\)/g;
/** Balanced-parenthesis arguments of every `require(` call. */
function requireArguments(code) {
  const out = []; let i = 0;
  while ((i = code.indexOf('require(', i)) >= 0) {
    if (/[\w$.]/.test(code[i - 1] ?? '')) { i += 8; continue; }
    let depth = 1, j = i + 8;
    while (j < code.length && depth) { if (code[j] === '(') depth++; else if (code[j] === ')') depth--; j++; }
    out.push(code.slice(i + 8, j - 1).trim()); i = j;
  }
  return out;
}

/** Static + path.join(root, ...) closure. Unresolvable dynamic requires fail closed. */
export function importClosureV4(entries, root = ROOT) {
  const seen = new Set(), queue = entries.map((e) => path.resolve(root, e)), unresolved = [];
  while (queue.length) {
    const file = queue.pop(); if (seen.has(file)) continue;
    demand(file.startsWith(root + path.sep) && fs.existsSync(file), 'FREEZE_CODE_FILE_MISSING:' + rel(root, file));
    seen.add(file); if (!/\.(mjs|js|cjs)$/.test(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(STATIC_RE)) { const t = path.resolve(path.dirname(file), m[1]); if (fs.existsSync(t) && fs.statSync(t).isFile()) queue.push(t); else if (fs.existsSync(t + '.js')) queue.push(t + '.js'); }
    for (const m of text.matchAll(JOIN_RE)) { const t = path.resolve(root, m[1]); demand(fs.existsSync(t), 'FREEZE_JOIN_TARGET_MISSING:' + m[1]); queue.push(t); }
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
    for (const arg of requireArguments(code)) {
      if (/^path\.join\(\s*(?:root|ROOT)\s*,\s*['"][^'"]+['"]\s*\)$/.test(arg)) continue;
      if (/^['"]/.test(arg)) continue;
      unresolved.push(`${rel(root, file)}:${arg.slice(0, 60)}`);
    }
  }
  return { files: [...seen].map((f) => rel(root, f)).sort(), unresolvedDynamicRequires: unresolved };
}

export function hashFilesV4(files, root = ROOT) {
  return Object.fromEntries([...new Set(files)].sort().map((f) => [f, sha(fs.readFileSync(path.join(root, f)))]));
}
export function testSuiteFiles(root = ROOT) {
  const dir = path.join(root, 'scripts/supertrader/tests');
  return fs.readdirSync(dir).filter((f) => /^v4-.*\.mjs$/.test(f)).map((f) => `scripts/supertrader/tests/${f}`).sort();
}

/** Canonical JSON (sorted keys) so the id does not depend on key insertion order. */
export function canonicalJson(v) {
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonicalJson(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
export function freezeIdOf(frozen) { return 'V4-' + sha(Buffer.from(canonicalJson(frozen))).slice(0, 16); }

const V3_SEVERITY = { blocker: 'BLOCKER', major: 'MAJOR', minor: 'MINOR', informational: 'MINOR' };
const RANK = { BLOCKER: 4, MAJOR: 3, MODERATE: 2, MINOR: 1, NON_ISSUE: 0, ALREADY_FIXED: 0 };
/** V4.1 (review R1): open findings are derived once and frozen; a severity below the V3 severity needs a written reason. */
export function frozenOpenFindings(root = ROOT) {
  const f = JSON.parse(fs.readFileSync(path.join(root, V4, 'SUPERTRADER-V4-ADVERSARIAL-FINDINGS.json'), 'utf8'));
  return f.findings.filter((x) => ['V3', 'V4'].includes(x.source)).map((x) => {
    const v3 = V3_SEVERITY[x.v3Severity];
    if (v3 && RANK[x.severity] < RANK[v3]) demand(typeof x.downgradeReason === 'string' && x.downgradeReason.length > 20, 'SEVERITY_DOWNGRADE_WITHOUT_REASON:' + x.id);
    return { id: x.id, severity: x.severity, status: /^(CLOSED|ALREADY_FIXED)/.test(x.statusBeforeV4Measurement) ? 'CLOSED' : 'OPEN' };
  });
}

export function buildFreezeV4({ root = ROOT, captureReceipt, oracleReceipt, now = new Date().toISOString(), runId = null, codeCommit = null }) {
  demand(captureReceipt?.status === 'V3_CANONICAL_CAPTURE_VERIFIED_IN_RUNNER' && captureReceipt.contentBinding?.schema, 'CAPTURE_RECEIPT_NOT_VERIFIED');
  demand(oracleReceipt?.status === 'V4_ORACLE_CAPTURED_HASH_VERIFIED', 'ORACLE_RECEIPT_NOT_VERIFIED');
  const closure = importClosureV4(ENTRY_POINTS_V4, root);
  demand(closure.unresolvedDynamicRequires.length === 0, 'FREEZE_UNRESOLVED_DYNAMIC_REQUIRE');
  for (const f of SPLIT_POLICY_V4.runtimeFiles) demand(closure.files.includes(f), 'SPLIT_POLICY_FILE_NOT_IN_CODE_CLOSURE:' + f);
  const tests = testSuiteFiles(root);
  demand(tests.length > 0, 'V4_TEST_SUITE_REQUIRED');
  const frozen = {
    schema: FREEZE_V4_SCHEMA, generation: 'CALIBRATION_V4', postHoc: true, supersedesNothing: 'V3_FREEZES_AND_RESULTS_REMAIN_HISTORICAL_EVIDENCE',
    status: 'FROZEN_BEFORE_V4_MEASUREMENT', strategyDefinitionsChanged: false, postResultTuningAllowed: false,
    sourceRuleContract: { file: `${V4}/SUPERTRADER-V4-SOURCE-ACCEPTANCE.json`, sha256: sha(fs.readFileSync(path.join(root, V4, 'SUPERTRADER-V4-SOURCE-ACCEPTANCE.json'))) },
    dataContract: { canonicalCapture: captureReceipt.contentBinding, captureCounts: captureReceipt.counts, inputs: { manifestSha256: captureReceipt.inputs?.manifestSha256 ?? null, sourceMetadataSha256: captureReceipt.inputs?.sourceMetadataSha256 ?? null } },
    universe: CONSTRUCTION_CONTRACT_V4.universe,
    corporateActions: { ...SPLIT_POLICY_V4, fileHashes: hashFilesV4(SPLIT_POLICY_V4.files, root) },
    missingBars: MEASUREMENT_POLICY_V4,
    execution: { calibration: 'MONTHLY_CLOSE_TO_CLOSE_ARITHMETIC + CLOSE_BOOK (measurement adapter) + NEXT_OPEN_BOOK (frozen tournament convention)', ordersOnlyOnRealSourceBars: true },
    costs: { calibration: 'ZERO (oracle returns are gross)', tournamentProtocol: 'scripts/supertrader/research/tournament/protocol.json (unchanged)' },
    portfolio: CONSTRUCTION_CONTRACT_V4.constructions,
    oracleParsedSha256: oracleReceipt.parsedSha256,
    openFindings: frozenOpenFindings(root),
    calibrationOracle: oracleReceipt.sources.map(({ id, url, archiveSha256, memberName, memberSha256 }) => ({ id, url, archiveSha256, memberName, memberSha256 })),
    tolerances: { external: ORACLE_TOLERANCES_V4, internal: INTERNAL_RECONCILIATION_TOLERANCE_V4 },
    contracts: hashFilesV4(CONTRACT_FILES_V4, root),
    code: hashFilesV4(closure.files, root),
    testSuite: hashFilesV4(tests, root),
  };
  return { ...frozen, freezeId: freezeIdOf(frozen), createdAt: now, provenance: { workflowRunId: runId, codeCommit, node: process.version, pinning: 'GIT_COMMIT_PUSHED_BEFORE_MEASUREMENT' } };
}

/** Recomputes every bound hash against the working tree; the content id must match. */
export function verifyFreezeV4(freeze, root = ROOT) {
  demand(freeze?.schema === FREEZE_V4_SCHEMA && freeze.postHoc === true, 'FREEZE_V4_SCHEMA_INVALID');
  const { freezeId, createdAt, provenance, ...frozen } = freeze;
  demand(freezeIdOf(frozen) === freezeId, 'FREEZE_V4_ID_MISMATCH');
  for (const section of ['contracts', 'code', 'testSuite']) for (const [f, h] of Object.entries(frozen[section])) demand(sha(fs.readFileSync(path.join(root, f))) === h, 'FREEZE_V4_HASH_MISMATCH:' + f);
  for (const [f, h] of Object.entries(frozen.corporateActions.fileHashes)) demand(sha(fs.readFileSync(path.join(root, f))) === h, 'FREEZE_V4_SPLIT_POLICY_CHANGED:' + f);
  const closure = importClosureV4(ENTRY_POINTS_V4, root);
  demand(closure.files.every((f) => f in frozen.code), 'FREEZE_V4_CODE_CLOSURE_GREW');
  return { status: 'V4_FREEZE_VERIFIED', freezeId };
}

/** A13: the freeze must be committed in an ancestor of HEAD (pushed before the measuring job checked out). */
export function verifyFreezePinned(freezeFile, root = ROOT) {
  const relFile = rel(root, path.resolve(freezeFile));
  const commit = execFileSync('git', ['log', '-n', '1', '--format=%H', '--', relFile], { cwd: root, encoding: 'utf8' }).trim();
  demand(/^[0-9a-f]{40}$/.test(commit), 'FREEZE_V4_NOT_COMMITTED');
  execFileSync('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], { cwd: root });
  const committed = execFileSync('git', ['show', `${commit}:${relFile}`], { cwd: root });
  demand(sha(committed) === sha(fs.readFileSync(path.resolve(freezeFile))), 'FREEZE_V4_WORKTREE_DIFFERS_FROM_COMMIT');
  return { freezeCommit: commit, freezeFileSha256: sha(committed) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...a] = process.argv.slice(2), get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
  try {
    if (cmd === 'build') {
      const freeze = buildFreezeV4({ captureReceipt: JSON.parse(fs.readFileSync(get('--capture-receipt'), 'utf8')), oracleReceipt: JSON.parse(fs.readFileSync(get('--oracle-receipt'), 'utf8')), runId: process.env.GITHUB_RUN_ID ?? null, codeCommit: process.env.GITHUB_SHA ?? null });
      fs.writeFileSync(get('--out'), JSON.stringify(freeze, null, 2) + '\n', { flag: 'wx' });
      process.stdout.write(JSON.stringify({ status: freeze.status, freezeId: freeze.freezeId, codeFiles: Object.keys(freeze.code).length, tests: Object.keys(freeze.testSuite).length }) + '\n');
    } else if (cmd === 'verify') {
      const r = verifyFreezeV4(JSON.parse(fs.readFileSync(get('--freeze'), 'utf8')));
      process.stdout.write(JSON.stringify(a.includes('--pinned') ? { ...r, ...verifyFreezePinned(get('--freeze')) } : r) + '\n');
    } else throw new Error('USAGE_BUILD_OR_VERIFY');
  } catch (e) { process.stderr.write(JSON.stringify({ phase: 'V4_FREEZE', code: /^[A-Z0-9_:./-]+$/.test(e.message) ? e.message : 'FREEZE_FAILED' }) + '\n'); process.exitCode = 1; }
}
