import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { repositoryRoot } from '../../scripts/marketstack/private-output.mjs';
import { privateOutputFile } from '../../scripts/discover/browser-private-output.mjs';

test('both browser QA entrypoints reject public repository outputs before loading Playwright or making requests', () => {
  for (const name of ['de-eu-browser-qa.mjs', 'de-eu-integration-qa.mjs']) {
    const script = fileURLToPath(new URL('../../scripts/discover/' + name, import.meta.url));
    const result = spawnSync(process.execPath, [script, '--out', join(repositoryRoot, 'discover', 'data')],
      { encoding: 'utf8', env: { ...process.env, NODE_PATH: '' }, timeout: 5000 });
    assert.equal(result.status, 1); assert.match(result.stderr, /PRIVATE_OUTPUT_OUTSIDE_REPOSITORY_REQUIRED/);
    assert.doesNotMatch(result.stderr, /Cannot find module 'playwright'|fetch failed/);
  }
});

test('nested output symlinks cannot send browser JSON or PNG files into public data paths', () => {
  const dir = mkdtempSync(join(tmpdir(), 'browser-output-'));
  try {
    mkdirSync(join(dir, 'nested')); symlinkSync(join(repositoryRoot, 'discover', 'data'), join(dir, 'nested', 'public'));
    for (const file of ['result.json', 'listing.png']) assert.throws(() => privateOutputFile(dir, 'nested/public/' + file), /SYMLINK_REJECTED/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('dangling output-file symlinks are rejected even when their target does not exist', () => {
  const dir = mkdtempSync(join(tmpdir(), 'browser-output-'));
  try {
    symlinkSync(join(dir, 'nonexistent-target'), join(dir, 'result.json'));
    assert.throws(() => privateOutputFile(dir, 'result.json'), /SYMLINK_REJECTED/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('ordinary private children are accepted while parent traversal remains blocked', () => {
  const dir = mkdtempSync(join(tmpdir(), 'browser-output-'));
  try {
    assert.equal(privateOutputFile(dir, 'result.json'), join(dir, 'result.json'));
    assert.throws(() => privateOutputFile(dir, '../outside.json'), /CHILD_REQUIRED/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
