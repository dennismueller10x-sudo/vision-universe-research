import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { CONTRACT, VALIDATOR, PROOFS, buildDiscoverCrossStackContract, verifyDiscoverIsolation } from '../../scripts/quality/verify-discover-isolation.mjs';
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function fixture(fn) {
  const root = mkdtempSync(join(tmpdir(), 'discover-isolation-'));
  const save = (path, contents) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), typeof contents === 'string' ? contents : JSON.stringify(contents)); };
  try {
    git(root, 'init', '--quiet'); git(root, 'config', 'user.name', 'Isolation Fixture'); git(root, 'config', 'user.email', 'fixture@example.invalid');
    save('discover/index.html', '<html>baseline</html>'); save('quant/engines/company-master.js', 'canonical identity baseline');
    save('quant/data/product/factor-evidence-history/vu-factor-evidence-1.0.0/2026-09-01.json.gz', 'immutable cutoff');
    git(root, 'add', '.'); git(root, 'commit', '--quiet', '-m', 'accepted base'); const baseRef = git(root, 'rev-parse', 'HEAD');
    save(VALIDATOR, readFileSync(new URL('../../' + VALIDATOR, import.meta.url), 'utf8'));
    for (const [path, schemaVersion] of PROOFS) save(path, { schemaVersion, independentReview: true });
    const build = () => { const contract = buildDiscoverCrossStackContract({ root, baseRef }); save(CONTRACT, contract); return contract; };
    const verify = (args = {}) => verifyDiscoverIsolation({ root, baseRef, ...args });
    return fn({ root, baseRef, save, build, verify });
  } finally { rmSync(root, { recursive: true, force: true }); }
}
test('ordinary Discover-only changes retain the original strict boundary with no exception contract', () => fixture(({ save, verify }) => {
  save('discover/index.html', '<html>changed</html>'); assert.equal(verify().mode, 'DISCOVER_ONLY');
  save('quant/engines/company-master.js', 'outside Discover'); assert.throws(verify, /DISCOVER_CHANGED_FILES_OUTSIDE_MODULE/);
}));
test('reviewed exact source and native projection bytes pass without branch-name exemptions', () => fixture(({ save, build, verify }) => {
  save('quant/engines/company-master.js', 'reviewed canonical alias extension'); save('quant/data/universe/instruments/AA.json', { instruments: [] });
  const contract = build(); assert.equal(contract.changes.length, 2);
  const source = contract.changes.find(row => row.path === 'quant/engines/company-master.js');
  assert.match(source.beforeBlobOid, /^[a-f0-9]{40}$/); assert.match(source.beforeSha256, /^[a-f0-9]{64}$/);
  assert.equal(verify().mode, 'EXACT_REVIEWED_CROSS_STACK');
  save('quant/engines/company-master.js', 'unreviewed extra code'); assert.throws(verify, /DISCOVER_UNREVIEWED_BYTES/);
}));
test('new paths, deletions, changed proof bytes and moved accepted bases require independent re-review', () => fixture(({ root, save, build, verify }) => {
  save('quant/data/universe/instruments/AA.json', { instruments: [] }); save('quant/engines/company-master.js', 'reviewed extension'); build();
  save('quant/tests/new.test.mjs', 'new test'); assert.throws(verify, /DISCOVER_UNDECLARED_OR_STALE_CHANGE_SET/); rmSync(join(root, 'quant/tests/new.test.mjs'));
  rmSync(join(root, 'quant/data/universe/instruments/AA.json')); assert.throws(verify, /DISCOVER_UNDECLARED_OR_STALE_CHANGE_SET/); save('quant/data/universe/instruments/AA.json', { instruments: [] });
  save(PROOFS[0][0], { schemaVersion: PROOFS[0][1], independentReview: 'changed' }); assert.throws(verify, /DISCOVER_REVIEW_HASH_MISMATCH/);
  build(); git(root, 'add', '.'); git(root, 'commit', '--quiet', '-m', 'new accepted base'); save('quant/engines/company-master.js', 'next extension'); assert.throws(() => verify({ baseRef: 'HEAD' }), /DISCOVER_CONTRACT_BASE_OR_SCHEMA_MISMATCH/);
}));
test('review manifest cannot exempt methodology, FX, unrelated engines, Tiingo provider or routing', () => {
  for (const path of ['quant/methodology/quant-v2.json', 'quant/engines/fx/core.js', 'quant/engines/quant.js', 'providers/tiingo/adapter.js', 'quant/api/router.js', 'dashboard/index.html']) fixture(({ save, build }) => {
    save(path, 'even explicitly listed bytes remain forbidden'); assert.throws(build, /UNREVIEWABLE_CROSS_STACK_PATH/, path);
  });
});
test('existing historical factor cutoffs and reviewed-source deletion remain forbidden', () => fixture(({ root, save, build }) => {
  save('quant/data/product/factor-evidence-history/vu-factor-evidence-1.0.0/2026-09-01.json.gz', 'changed cutoff'); assert.throws(build, /IMMUTABLE_FACTOR_HISTORY_CHANGED/);
  git(root, 'checkout', '--', 'quant/data/product/factor-evidence-history/vu-factor-evidence-1.0.0/2026-09-01.json.gz');
  rmSync(join(root, 'quant/engines/company-master.js')); assert.throws(build, /SOURCE_DELETION_FORBIDDEN/);
}));
test('validator-byte tampering and symlink projections fail closed', () => fixture(({ root, save, build, verify }) => {
  save('quant/data/universe/instruments/AA.json', { instruments: [] }); build();
  save(VALIDATOR, 'changed validator'); assert.throws(verify, /DISCOVER_VALIDATOR_HASH_MISMATCH/);
  build(); rmSync(join(root, 'quant/data/universe/instruments/AA.json')); symlinkSync(join(root, 'discover/index.html'), join(root, 'quant/data/universe/instruments/AA.json'));
  assert.throws(verify, /DISCOVER_CONTRACT_SYMLINK/);
}));
test('dangling projection symlinks cannot masquerade as reviewed deletions', () => fixture(({ root, save, build, verify }) => {
  save('quant/data/universe/instruments/AA.json', { instruments: [] }); build();
  rmSync(join(root, 'quant/data/universe/instruments/AA.json'));
  symlinkSync(join(root, 'missing-target.json'), join(root, 'quant/data/universe/instruments/AA.json'));
  assert.throws(build, /DISCOVER_CONTRACT_SYMLINK/);
  assert.throws(verify, /DISCOVER_CONTRACT_SYMLINK/);
}));
