import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const old = { ticker: 'DNA', exchange: 'NYSE', asset_type: 'Stock', currency: 'USD',
  start_date: '2001-01-02', end_date: '2010-04-05', active_status: 'INACTIVE',
  instrument_type: 'EQUITY_COMMON', classification_status: 'CLASSIFIED',
  classification_confidence: 'HIGH', policy_bucket: 'INCLUDE', eligible_us_equity: false,
  eligibility_reason: 'LISTING_INACTIVE', review_flags: [] };
const current = { ...old, start_date: '2021-04-19', end_date: '2026-10-01',
  active_status: 'ACTIVE', eligible_us_equity: true,
  eligibility_reason: 'ACTIVE_US_PRIMARY_LISTED_COMMON_EQUITY' };

function run(startDate, rows, version = 'us-security-master-1.2.0') {
  const dir = mkdtempSync(join(tmpdir(), 'vu-listing-period-'));
  try {
    const universe = join(dir, 'universe.json');
    const master = join(dir, 'master.json');
    const out = join(dir, 'out');
    const bytes = JSON.stringify({ securities: [{ securityId: 'ref_DNA', ticker: 'DNA',
      exchange: 'NYSE', currency: 'USD', assetType: 'Stock', instrumentType: 'COMMON_STOCK',
      active: true, startDate }] });
    writeFileSync(universe, bytes);
    writeFileSync(master, JSON.stringify({ version, rows }));
    const result = spawnSync(process.execPath, [join(root, 'scripts/market/build-us-eligibility.mjs'),
      '--universe', universe, '--master', master, '--today', '2026-10-02',
      '--out', out, '--scale-out', join(dir, 'scale'), '--names', join(dir, 'absent.json')],
      { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.equal(readFileSync(universe, 'utf8'), bytes, 'source membership and identity must remain unchanged');
    const output = JSON.parse(readFileSync(join(out, 'eligibility.json'), 'utf8'));
    return output.decisions[0];
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('Ginkgo listing period selects current DNA rather than prior Genentech', () => {
  for (const rows of [[old, current], [current, old]]) {
    const result = run('2021-04-19', rows);
    assert.equal(result.active_status, 'ACTIVE');
    assert.equal(result.product_eligibility, 'ELIGIBLE');
    assert.equal(result.securityId, 'ref_DNA');
  }
});

test('historical DNA membership continues to select historical listing', () => {
  const result = run('2001-01-02', [current, old]);
  assert.equal(result.active_status, 'INACTIVE');
  assert.equal(result.product_eligibility, 'REVIEW');
});

test('old classifier master is rejudged using matching listing period', () => {
  const result = run('2021-04-19', [old, current], 'us-security-master-1.1.0');
  assert.equal(result.active_status, 'ACTIVE');
  assert.equal(result.product_eligibility, 'ELIGIBLE');
  assert.equal(result.evidence_source, 'SECURITY_MASTER_REJUDGED');
});

test('no unique period evidence preserves existing selection rather than guessing latest', () => {
  assert.equal(run('2020-01-01', [old, current]).active_status, 'INACTIVE');
  assert.equal(run(undefined, [old, current]).active_status, 'INACTIVE');
  assert.equal(run('2021-04-19', [old, current, { ...current }]).active_status, 'INACTIVE');
});

test('single listing behavior remains compatible', () => {
  assert.equal(run('2021-04-19', [current]).product_eligibility, 'ELIGIBLE');
});
