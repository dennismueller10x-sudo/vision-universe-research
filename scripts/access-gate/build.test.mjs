import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes, pbkdf2Sync} from 'node:crypto';
import {protectRelease, socialMeta, verificationFor, accessKeyFor, verifierForKey, accessStateFor, KEY_CONTEXT, DURATION_MS} from './build.mjs';
import {createHash} from 'node:crypto';

test('only a hash of the salted PBKDF2 key is emitted; updates keep 30-day grants and password rotation invalidates them', () => {
  const password = randomBytes(32).toString('hex');
  const first = verificationFor(password);
  assert.deepEqual(verificationFor(password), first);
  assert.equal(first.durationMs, 30 * 86400000);
  assert.equal(first.durationMs, DURATION_MS);
  const key = pbkdf2Sync(password, Buffer.from(first.salt, 'base64'), first.iterations, 32, 'sha256').toString('hex');
  assert.equal(accessKeyFor(password), key);
  // Version 2: the published verifier is a hash of the key, never the key itself.
  assert.equal(first.version, 2);
  assert.equal(first.verifier, createHash('sha256').update(KEY_CONTEXT + key).digest('hex'));
  assert.equal(verifierForKey(key), first.verifier);
  assert.notEqual(first.verifier, key);
  assert.ok(!JSON.stringify(first).includes(key));
  const state = accessStateFor(password, 1000);
  assert.deepEqual(state, {version: 2, key, expiresAt: 1000 + DURATION_MS});
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

test('link previews: the mask carries og:/twitter: tags and description of the page, escaped, nothing else', async () => {
  const head = `<!doctype html><html><head><title>Original</title>
<meta name="description" content="Aktien &amp; Vorsorge">
<meta property="og:title" content="Vision Universe">
<meta property="og:image" content="https://research.visionuniverse.de/assets/home/og-image.jpg">
<meta property='og:image:width' content='1200'>
<meta name="twitter:card" content="summary_large_image">
<meta property="og:description" content="&quot;&gt;<script>alert(1)</script>">
<meta name="robots" content="index">
<meta http-equiv="refresh" content="0;url=https://evil.example">
<script>PRIVATE_APP_MARKER</script></head><body><meta property="og:title" content="BODY_IGNORED"></body></html>`;
  const meta = socialMeta(head);
  assert.match(meta, /<meta name="description" content="Aktien &amp; Vorsorge">/);
  assert.match(meta, /<meta property="og:image" content="https:\/\/research\.visionuniverse\.de\/assets\/home\/og-image\.jpg">/);
  assert.match(meta, /<meta property="og:image:width" content="1200">/);
  assert.match(meta, /<meta name="twitter:card" content="summary_large_image">/);
  assert.doesNotMatch(meta, /<script|robots|refresh|evil|PRIVATE_APP_MARKER|BODY_IGNORED/);
  // Ein Tag, dessen Inhalt rohes Markup enthaelt, ist kein sauberes Tag und faellt weg.
  assert.doesNotMatch(meta, /og:description|alert/);
  assert.match(socialMeta('<meta property="og:title" content="A &quot;B&quot; &lt;C&gt;">'), /content="A &quot;B&quot; &lt;C&gt;"/);
  assert.equal(socialMeta('<html><body>keine Angaben</body></html>'), '');

  const output = await mkdtemp(join(tmpdir(), 'research-gate-social-'));
  try {
    await writeFile(join(output, 'index.html'), head);
    await mkdir(join(output, 'plain'), {recursive: true});
    await writeFile(join(output, 'plain/index.html'), '<!doctype html><body>PRIVATE_APP_MARKER</body>');
    await protectRelease({output, password: randomBytes(32).toString('hex')});
    const wrapper = await readFile(join(output, 'index.html'), 'utf8');
    assert.match(wrapper, /research-access-gate/);
    assert.match(wrapper, /<meta property="og:image" content="https:\/\/research\.visionuniverse\.de\/assets\/home\/og-image\.jpg">/);
    assert.doesNotMatch(wrapper, /PRIVATE_APP_MARKER|alert\(1\)<|evil/);
    assert.doesNotMatch(await readFile(join(output, 'plain/index.html'), 'utf8'), /og:|twitter:/);
  } finally { await rm(output, {recursive: true, force: true}); }
});
