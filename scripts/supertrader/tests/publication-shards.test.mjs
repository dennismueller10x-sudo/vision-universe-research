import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {loadShardPayload, publishShardManifest} from '../research/tournament/publish-shards.mjs';

function fixtures(directory) {
  const entries = [{path: 'history.json', value: {kind: 'historical'}}, {path: 'current.json', value: {kind: 'current'}}];
  for (const entry of entries) {
    const bytes = Buffer.from(JSON.stringify(entry.value));
    fs.writeFileSync(path.join(directory, entry.path), bytes, {mode: 0o600});
    entry.sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  }
  const manifest = {historicalShards: [{path: entries[0].path, sha256: entries[0].sha256}],
    currentShard: {path: entries[1].path, sha256: entries[1].sha256}};
  const manifestPath = path.join(directory, 'manifest.json'), reviewPath = path.join(directory, 'review.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  fs.writeFileSync(reviewPath, JSON.stringify({status: 'PASSED'}));
  return {manifest, manifestPath, reviewPath};
}

test('hashed relative shards reach assembler, freeze validator and object publisher with dry run default', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'publication-shards-'));
  try {
    const {manifestPath, reviewPath} = fixtures(directory);
    const payload = {freeze: {sentinel: true}}, calls = [];
    const result = publishShardManifest({manifestPath, reviewPath, outRoot: directory}, {
      assemble(shards, current) {
        assert.deepEqual(shards, [{kind: 'historical'}]); assert.deepEqual(current, {kind: 'current'});
        calls.push('assemble'); return payload;
      },
      validateFreeze(freeze) {assert.equal(freeze, payload.freeze); calls.push('freeze');},
      publisher(options) {
        assert.equal(options.payload, payload); assert.equal(options.publish, false);
        assert.deepEqual(options.review, {status: 'PASSED'});
        assert.equal(options.inputReference, manifestPath); assert.equal(options.reviewReference, reviewPath);
        calls.push('publish'); return {status: 'DRY_RUN_NO_FILES_WRITTEN'};
      },
    });
    assert.deepEqual(calls, ['assemble', 'freeze', 'publish']);
    assert.equal(result.status, 'DRY_RUN_NO_FILES_WRITTEN');
    assert.equal(fs.existsSync(path.join(directory, 'docs')), false);
  } finally {fs.rmSync(directory, {recursive: true, force: true});}
});

test('hash mismatch and incomplete manifests fail before assembly or publication', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'publication-shards-'));
  try {
    const {manifest, manifestPath} = fixtures(directory);
    const neverAssemble = {assemble() {assert.fail('unverified input reached assembler');}};
    fs.writeFileSync(path.join(directory, 'history.json'), JSON.stringify({changed: true}));
    assert.throws(() => loadShardPayload(manifestPath, neverAssemble), /INPUT_SHARD_BYTEHASH_MISMATCH/);
    for (const invalid of [{historicalShards: []}, {shards: [{path: 'history.json'}], current: manifest.currentShard}]) {
      fs.writeFileSync(manifestPath, JSON.stringify(invalid));
      assert.throws(() => loadShardPayload(manifestPath, neverAssemble), /FULL_HASHED_SHARD_MANIFEST_REQUIRED|HASHED_SHARD_MANIFEST_ENTRY_REQUIRED/);
    }
  } finally {fs.rmSync(directory, {recursive: true, force: true});}
});

test('shard CLI never discloses private parse contents on failure', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'publication-shards-'));
  try {
    const manifestPath = path.join(directory, 'private.json');
    fs.writeFileSync(manifestPath, '{"PRIVATE_LEAK_SENTINEL": invalid}', {mode: 0o600});
    const script = fileURLToPath(new URL('../research/tournament/publish-shards.mjs', import.meta.url));
    const run = spawnSync(process.execPath, [script, '--manifest', manifestPath, '--review', manifestPath, '--outRoot', directory], {encoding: 'utf8'});
    assert.equal(run.status, 1); assert.equal(run.stdout, ''); assert.equal(run.stderr, 'PUBLICATION_FAILED\n');
  } finally {fs.rmSync(directory, {recursive: true, force: true});}
});
