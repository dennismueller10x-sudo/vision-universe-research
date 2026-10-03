import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFsDriver } from '../../market/storage/fs-driver.mjs';
import { createS3Driver } from '../../market/storage/s3-driver.mjs';
import { sync, prefixFor } from '../sync-state.mjs';
import { inspectPrivacy } from '../privacy.mjs';

test('privacy proof fails closed for missing credentials, public domains and denied account reads', async () => {
  assert.equal((await inspectPrivacy({})).reason, 'MISSING_R2_BINDINGS');
  const env = {VU_HISTORY_S3_ENDPOINT: 'https://' + 'a'.repeat(32) + '.r2.cloudflarestorage.com', VU_HISTORY_S3_BUCKET: 'fixture', VU_HISTORY_S3_ACCESS_KEY_ID: 'fixture', VU_HISTORY_S3_SECRET_ACCESS_KEY: 'fixture', CLOUDFLARE_API_TOKEN: 'fixture'};
  const response = (enabled, domains) => async url => new Response(JSON.stringify({success: true, result: url.endsWith('managed') ? {enabled} : {domains}}));
  assert.equal((await inspectPrivacy(env, response(false, []))).status, 'VERIFIED_NON_PUBLIC');
  assert.equal((await inspectPrivacy(env, response(true, []))).status, 'BLOCKED');
  assert.equal((await inspectPrivacy(env, response(false, [{enabled: false}]))).status, 'BLOCKED');
  assert.equal((await inspectPrivacy(env, async () => new Response(null, {status: 403}))).reason, 'BUCKET_PRIVACY_READ_DENIED');
  assert.equal((await inspectPrivacy(env, async () => new Response(JSON.stringify({success: true, result: {}})))).reason, 'BUCKET_PRIVACY_RESPONSE_INVALID');
});

test('fresh runner durability, bounded slots, digest failure and previous recovery', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vu-intelligence-'));
  try {
    const driver = createFsDriver(join(dir, 'remote')), file = join(dir, 'snapshot'), restored = join(dir, 'restored');
    const config = {namespace: 'test', file, direction: 'push'};
    writeFileSync(file, Buffer.from('first ledger'));
    await assert.rejects(sync(driver, config), /INITIALIZATION_REQUIRED/);
    await sync(driver, {...config, initialize: true});
    assert.equal((await sync(driver, config)).status, 'UNCHANGED');
    writeFileSync(file, Buffer.from('second ledger'));
    await sync(driver, config);
    assert.equal((await sync(driver, {...config, direction: 'pull', file: restored})).status, 'RESTORED');
    assert.equal(readFileSync(restored).toString(), 'second ledger');
    assert.equal((await driver.list(prefixFor('test'))).length, 3);
    const pointer = JSON.parse(await driver.get(prefixFor('test') + 'index.json'));
    await driver.put(prefixFor('test') + `snapshot-${pointer.slot}.tar.gz`, Buffer.from('bad'));
    assert.equal((await sync(driver, {...config, direction: 'pull', file: restored})).status, 'RECOVERED_PREVIOUS');
    assert.equal(readFileSync(restored).toString(), 'first ledger');
    writeFileSync(file, Buffer.from('recovered new ledger'));
    await sync(driver, config);
    assert.equal((await sync(driver, {...config, direction: 'pull', file: restored})).status, 'RESTORED');
    assert.equal(readFileSync(restored).toString(), 'recovered new ledger');
  } finally { rmSync(dir, {recursive: true, force: true}); }
});
test('failed upload cannot advance the durable pointer', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vu-intelligence-'));
  try {
    const file = join(dir, 'snapshot'); writeFileSync(file, 'ledger');
    let pointerWritten = false;
    const driver = {get: async () => null, put: async key => { if (key.endsWith('index.json')) pointerWritten = true; }};
    await assert.rejects(sync(driver, {direction: 'push', namespace: 'test', file, initialize: true}), /UPLOAD_VERIFICATION_FAILED/);
    assert.equal(pointerWritten, false);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});
test('protected storage prefixes and traversal are impossible', () => {
  for (const name of ['../tiingo', 'v1/sec', '', 'test/../../prod']) assert.throws(() => prefixFor(name), /INVALID/);
  assert.equal(prefixFor('feature_company-intelligence'), 'v1/company-intelligence/state/feature_company-intelligence/');
});

test('checkpoint bridge uses the existing signed S3 driver without bucket changes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vu-intelligence-s3-'));
  try {
    const objects = new Map(), methods = [];
    const driver = createS3Driver({endpoint: 'https://example.r2.cloudflarestorage.com', bucket: 'fixture', accessKeyId: 'fixture-id', secretAccessKey: 'fixture-key', maxRetries: 0,
      fetchImpl: async (url, opts) => {
        const key = new URL(url).pathname; methods.push(opts.method);
        assert.ok(key.startsWith('/fixture/' + prefixFor('test')));
        assert.equal(new URL(url).search, '');
        if (opts.method === 'PUT') { objects.set(key, Buffer.from(opts.body)); return new Response(null, {status: 200}); }
        const bytes = objects.get(key);
        if (!bytes) return new Response(null, {status: 404});
        return new Response(opts.method === 'HEAD' ? null : bytes, {status: 200, headers: {'content-length': String(bytes.length)}});
      }});
    const file = join(dir, 'snapshot'), restored = join(dir, 'restored'); writeFileSync(file, 'ledger');
    await sync(driver, {direction: 'push', namespace: 'test', file, initialize: true});
    await sync(driver, {direction: 'pull', namespace: 'test', file: restored});
    assert.equal(readFileSync(restored).toString(), 'ledger');
    assert.ok(methods.every(m => ['GET', 'PUT', 'HEAD'].includes(m)));
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('permission failure cannot initialize an empty replacement ledger', async () => {
  let writes = 0;
  const driver = {get: async () => { throw new Error('S3_HTTP_403'); }, put: async () => { writes++; }};
  await assert.rejects(sync(driver, {direction: 'pull', namespace: 'test', file: '/unused', initialize: true}), /403/);
  assert.equal(writes, 0);
});
