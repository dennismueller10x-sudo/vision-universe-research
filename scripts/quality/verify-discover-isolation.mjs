#!/usr/bin/env node
/* Ordinary Discover changes retain the zero-cross-stack guard. A reviewed
 * cross-stack migration must declare every exact changed byte against its
 * accepted base; runtime/methodology/provider boundaries remain explicit. */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, lstatSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { isProductizationProjectionPath } from '../market/tiingo2-publication.mjs';

export const CONTRACT = 'docs/tiingo2-productization/qa/discover-cross-stack-contract.json';
export const VALIDATOR = 'scripts/quality/verify-discover-isolation.mjs';
export const SCOPE = ['quant', 'providers', 'scripts/quant', 'scripts/technical', 'scripts/market', 'dashboard', 'macro', 'academy'];
const EXCEPTIONS = new Set(['quant/tests/currency-fx-matrix.test.mjs', 'quant/config/currency-formatting-baseline.json', 'quant/data/market/fx/currency-debt-register.json']);
const SOURCE_PATHS = new Set([
  'providers/sec/adapter.js', 'quant/api/product-services.js', 'quant/app/page-stock.js', 'quant/app/ui.js',
  'quant/engines/company-master.js', 'quant/engines/fundamental-inputs.js',
  'scripts/market/build-capability-matrix.mjs', 'scripts/market/build-company-names.mjs', 'scripts/market/build-currency-coverage.mjs',
  'scripts/market/build-us-security-master.mjs', 'scripts/market/publish-discover-series.mjs', 'scripts/market/us-security-master-baseline.mjs',
  'scripts/market/tiingo2-publication.mjs',
  'scripts/quant/audit_primary_source.py', 'scripts/quant/cli.py', 'scripts/quant/refresh-native-coverage.py', 'scripts/quant/sec/artifacts.py', 'scripts/quant/sec/canonical.py', 'scripts/quant/sec/consumer.py',
  'scripts/quant/sec/fiscal.py', 'scripts/quant/sec/normalize.py', 'scripts/quant/sec/periods.py',
  'scripts/quant/sec/universe_coverage.py', 'scripts/quant/sec/version.py'
]);
export const PROOFS = [
  ['docs/tiingo2-productization/qa/actual-data-logical-diff.json', 'tiingo2-actual-data-logical-diff-1'],
  ['docs/tiingo2-productization/qa/native-factor-chronology-replay.json', 'tiingo2-factor-chronology-cow-diff-2'],
  ['docs/tiingo2-productization/qa/sec-legacy-context-audit.json', 'tiingo2-sec-chronology-audit-1'],
  ['docs/tiingo2-productization/qa/builder-contract-review.json', 'tiingo2-productization-builder-review-1']
];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (root, args) => execFileSync('git', args, { cwd: root, maxBuffer: 256 * 1024 * 1024 });
function safe(root, path) {
  if (typeof path !== 'string' || !path || path.includes('\\')) throw Error('UNSAFE_DISCOVER_CONTRACT_PATH');
  const full = resolve(root, path), rel = relative(resolve(root), full);
  if (!rel || rel === '..' || rel.startsWith('..' + sep) || path !== rel.split(sep).join('/')) throw Error('UNSAFE_DISCOVER_CONTRACT_PATH');
  let cursor = resolve(root);
  for (const part of rel.split(sep)) {
    cursor = resolve(cursor, part);
    try { if (lstatSync(cursor).isSymbolicLink()) throw Error('DISCOVER_CONTRACT_SYMLINK'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return full;
}
function inventory(root, base) {
  const changes = new Set(git(root, ['diff', '--name-only', '--no-renames', '-z', base, '--', ...SCOPE]).toString().split('\0').filter(Boolean));
  for (const path of git(root, ['ls-files', '--others', '--exclude-standard', '-z', '--', ...SCOPE]).toString().split('\0').filter(Boolean)) changes.add(path);
  const before = new Map();
  for (const item of git(root, ['ls-tree', '-r', '-z', base, '--', ...SCOPE]).toString().split('\0').filter(Boolean)) {
    const [meta, path] = item.split('\t'), [mode, type, oid] = meta.split(' ');
    before.set(path, { mode, type, oid });
  }
  return { paths: [...changes].filter(path => !EXCEPTIONS.has(path)).sort(), before };
}
function category(path, before) {
  if (path.startsWith('quant/data/')) {
    if (/^quant\/data\/product\/factor-evidence-history\/[^/]+\/\d{4}-\d{2}-\d{2}\.json\.gz$/.test(path) && before) throw Error('IMMUTABLE_FACTOR_HISTORY_CHANGED');
    if (isProductizationProjectionPath(path) || ['quant/data/market/scale/universe-FULL_UNIVERSE.json', 'quant/data/market/security-master/reconciliation.json'].includes(path)) return 'CANONICAL_PUBLIC_PROJECTION';
    if (/^quant\/data\/market\/security-master\/baselines\/universe-FULL_UNIVERSE\.[a-f0-9]{64}\.json\.gz$/.test(path) && !before) return 'CONTENT_HASHED_BASELINE_ARCHIVE';
  }
  if (SOURCE_PATHS.has(path)) return 'REVIEWED_SOURCE_EXTENSION';
  if (/^scripts\/market\/tiingo2-[a-z0-9-]+\.mjs$/.test(path) && !before) return 'ADDITIVE_TIINGO2_PIPELINE';
  if (/^(quant\/tests|scripts\/quant\/tests)\/.+\.(?:mjs|js|py)$/.test(path)) return 'REGRESSION_TEST';
  throw Error('UNREVIEWABLE_CROSS_STACK_PATH:' + path);
}
function entry(root, path, previous, base) {
  const full = safe(root, path), present = existsSync(full), kind = category(path, previous);
  if (previous && previous.type !== 'blob' || previous && !['100644', '100755'].includes(previous.mode)) throw Error('UNSUPPORTED_BASELINE_FILE_MODE');
  if (present && !lstatSync(full).isFile()) throw Error('UNSUPPORTED_CHANGED_FILE_TYPE');
  if (!present && kind !== 'CANONICAL_PUBLIC_PROJECTION') throw Error('SOURCE_DELETION_FORBIDDEN');
  if (kind === 'CONTENT_HASHED_BASELINE_ARCHIVE' && (!present || sha(gunzipSync(readFileSync(full))) !== path.match(/\.([a-f0-9]{64})\.json\.gz$/)[1])) throw Error('BASELINE_ARCHIVE_CONTENT_HASH_MISMATCH');
  return { path, category: kind, beforeBlobOid: previous?.oid ?? null,
    beforeSha256: previous && kind !== 'CANONICAL_PUBLIC_PROJECTION' ? sha(git(root, ['show', base + ':' + path])) : null,
    afterSha256: present ? sha(readFileSync(full)) : null,
    beforeMode: previous?.mode ?? null, afterMode: present ? (lstatSync(full).mode & 0o111 ? '100755' : '100644') : null };
}
export function buildDiscoverCrossStackContract({ root, baseRef }) {
  const base = git(root, ['rev-parse', baseRef]).toString().trim(), { paths, before } = inventory(root, base);
  const proofs = PROOFS.map(([path, schemaVersion]) => {
    const bytes = readFileSync(safe(root, path)), doc = JSON.parse(bytes);
    if (doc.schemaVersion !== schemaVersion) throw Error('DISCOVER_REVIEW_SCHEMA_MISMATCH:' + path);
    return { path, schemaVersion, sha256: sha(bytes) };
  });
  return { schemaVersion: 'discover-reviewed-cross-stack-1.0.0', purpose: 'TIINGO2_VERIFIED_CANONICAL_PRODUCTIZATION', baselineCommit: base,
    validator: { path: VALIDATOR, sha256: sha(readFileSync(safe(root, VALIDATOR))) }, proofs,
    note: 'Exact reviewed bytes only. Regenerate and independently review after any source, data, evidence or accepted-base change. Ordinary Discover PRs retain the zero-cross-stack rule.',
    changes: paths.map(path => entry(root, path, before.get(path), base)) };
}
export function verifyDiscoverIsolation({ root, baseRef, contractPath = CONTRACT }) {
  const base = git(root, ['rev-parse', baseRef]).toString().trim(), { paths, before } = inventory(root, base);
  if (!paths.length) return { state: 'PASS', mode: 'DISCOVER_ONLY', changedPaths: 0 };
  if (!existsSync(safe(root, contractPath))) throw Error('DISCOVER_CHANGED_FILES_OUTSIDE_MODULE');
  const contract = JSON.parse(readFileSync(safe(root, contractPath)));
  if (contract.schemaVersion !== 'discover-reviewed-cross-stack-1.0.0' || contract.purpose !== 'TIINGO2_VERIFIED_CANONICAL_PRODUCTIZATION' || contract.baselineCommit !== base) throw Error('DISCOVER_CONTRACT_BASE_OR_SCHEMA_MISMATCH');
  if (contract.validator?.path !== VALIDATOR || contract.validator.sha256 !== sha(readFileSync(safe(root, VALIDATOR)))) throw Error('DISCOVER_VALIDATOR_HASH_MISMATCH');
  if (!Array.isArray(contract.changes) || JSON.stringify(contract.changes.map(row => row.path)) !== JSON.stringify(paths)) throw Error('DISCOVER_UNDECLARED_OR_STALE_CHANGE_SET');
  if (!Array.isArray(contract.proofs) || contract.proofs.length !== PROOFS.length) throw Error('DISCOVER_REVIEW_PROOFS_REQUIRED');
  for (let i = 0; i < PROOFS.length; i++) {
    const [path, schemaVersion] = PROOFS[i], proof = contract.proofs[i], bytes = readFileSync(safe(root, path));
    if (proof.path !== path || proof.schemaVersion !== schemaVersion || proof.sha256 !== sha(bytes) || JSON.parse(bytes).schemaVersion !== schemaVersion) throw Error('DISCOVER_REVIEW_HASH_MISMATCH:' + path);
  }
  for (let i = 0; i < paths.length; i++) {
    const actual = entry(root, paths[i], before.get(paths[i]), base);
    if (JSON.stringify(actual) !== JSON.stringify(contract.changes[i])) throw Error('DISCOVER_UNREVIEWED_BYTES:' + paths[i]);
  }
  return { state: 'PASS', mode: 'EXACT_REVIEWED_CROSS_STACK', baselineCommit: base, changedPaths: paths.length, proofFiles: PROOFS.length };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), baseRef = args.find(arg => arg.startsWith('--base='))?.slice(7);
  if (!baseRef) throw Error('--base=<accepted PR base> required');
  const root = process.cwd();
  if (args.includes('--write-contract')) { writeFileSync(CONTRACT, JSON.stringify(buildDiscoverCrossStackContract({ root, baseRef }), null, 2) + '\n'); }
  console.log(JSON.stringify(verifyDiscoverIsolation({ root, baseRef })));
}
