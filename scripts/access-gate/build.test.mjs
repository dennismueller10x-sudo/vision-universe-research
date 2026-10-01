import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes, pbkdf2Sync} from 'node:crypto';
import {protectRelease, verificationFor, DURATION_MS} from './build.mjs';

test('only a salted PBKDF2 verifier is emitted; updates keep 30-day grants and password rotation invalidates them', () => {
  const password = randomBytes(32).toString('hex');
  const first = verificationFor(password);
  assert.deepEqual(verificationFor(password), first);
  assert.equal(first.durationMs, 30 * 86400000);
  assert.equal(first.durationMs, DURATION_MS);
  assert.equal(first.verifier, pbkdf2Sync(password, Buffer.from(first.salt, 'base64'), first.iterations, 32, 'sha256').toString('hex'));
  assert.notEqual(verificationFor(randomBytes(32).toString('hex')).verifier, first.verifier);
  assert.ok(!JSON.stringify(first).includes(password));
  assert.throws(() => verificationFor(''), /RESEARCH_ACCESS_PASSWORD/);
  assert.throws(() => verificationFor(undefined), /RESEARCH_ACCESS_PASSWORD/);
});

test('central build wraps every HTML page and fallback without app markup; preserves app files, assets, data and URLs', async () => {
  const output = await mkdtemp(join(tmpdir(), 'research-gate-build-'));
  try {
    const password = randomBytes(32).toString('hex');
    const paths = ['index.html', 'discover/index.html', 'quant/index.html', 'supertrader/index.html',
      'screener/index.html', 'stocks/AAPL/index.html', 'future/deep/index.html', '404.html', 'preview.htm'];
    for (const path of paths) {
      await mkdir(join(output, path, '..'), {recursive: true});
      await writeFile(join(output, path), '<!doctype html><body>PRIVATE_APP_MARKER<script src="relative.js"></script></body>');
    }
    await writeFile(join(output, 'asset.js'), 'const original = true;');
    await writeFile(join(output, 'data.json'), '{"market":"unchanged"}');
    const report = await protectRelease({output, password});
    assert.equal(report.pages, paths.length);
    for (const path of paths) {
      const wrapper = await readFile(join(output, path), 'utf8');
      assert.ok(!wrapper.includes(password));
      assert.doesNotMatch(wrapper, /PRIVATE_APP_MARKER|src="relative.js"/);
      assert.match(wrapper, /research-access-gate/);
      assert.match(wrapper, /type="password" autocomplete="current-password"/);
      assert.match(wrapper, /\/__research\/access.js/);
      assert.match(await readFile(join(output, '__research/content', path), 'utf8'), /PRIVATE_APP_MARKER/);
    }
    assert.equal(await readFile(join(output, 'asset.js'), 'utf8'), 'const original = true;');
    assert.equal(await readFile(join(output, 'data.json'), 'utf8'), '{"market":"unchanged"}');
    for (const route of ['login', 'logout']) assert.match(await readFile(join(output, '__research', route, 'index.html'), 'utf8'), /research-access-gate/);
    await assert.rejects(protectRelease({output, password}), /ALREADY_BUILT/);
  } finally { await rm(output, {recursive: true, force: true}); }
});

test('missing build secret never produces an unprotected release', async () => {
  const output = await mkdtemp(join(tmpdir(), 'research-gate-no-secret-'));
  try {
    await writeFile(join(output, 'index.html'), 'original');
    await assert.rejects(protectRelease({output, password: ''}), /RESEARCH_ACCESS_PASSWORD/);
    assert.equal(await readFile(join(output, 'index.html'), 'utf8'), 'original');
    await assert.rejects(readFile(join(output, '__research/access.js')), /ENOENT/);
  } finally { await rm(output, {recursive: true, force: true}); }
});
