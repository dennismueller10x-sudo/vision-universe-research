import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRunArguments } from '../research/tournament/run.mjs';

const frozenIds = ['systematic_a', 'systematic_b', 'TURTLE_S2_EQUITY_DAILY', 'WEINSTEIN_STAGE_DAILY'];

test('default CLI preserves all frozen historical participants and current scan', () => {
  const args = parseRunArguments(['--out', '/tmp/report'], frozenIds);
  assert.deepEqual(args.selectedMethodIds, frozenIds);
  assert.equal(args.skipCurrent, false);
  assert.equal(args.currentOnly, false);
});

test('historical shard uses only valid frozen IDs and keeps frozen participant order', () => {
  const args = parseRunArguments(['--only', 'TURTLE_S2_EQUITY_DAILY, systematic_a', '--skip-current', '--out', '/tmp/shard'], frozenIds);
  assert.deepEqual(args.selectedMethodIds, ['systematic_a', 'TURTLE_S2_EQUITY_DAILY']);
  assert.equal(args.skipCurrent, true);
  assert.equal(args.currentOnly, false);
});

test('current-only selects no historical participants and remains independent from historical data', () => {
  const args = parseRunArguments(['--out', '/tmp/current', '--current-only'], frozenIds);
  assert.deepEqual(args.selectedMethodIds, []);
  assert.equal(args.currentOnly, true);
  assert.equal(args.skipCurrent, false);
});

test('unknown/duplicate/empty IDs and conflicting modes fail before any data loading', () => {
  for (const args of [
    ['--out','/tmp/a','--only','not_frozen'],
    ['--out','/tmp/a','--only','systematic_a,systematic_a'],
    ['--out','/tmp/a','--only','systematic_a,,systematic_b'],
    ['--out','/tmp/a','--only',''],
    ['--out','/tmp/a','--current-only','--only','systematic_a'],
    ['--out','/tmp/a','--current-only','--skip-current'],
    ['--out','/tmp/a','--current-only','--current-only'],
    ['--out','/tmp/a','--out','/tmp/b'],
    ['--out','/tmp/a','--invented'],
    ['--out','--current-only'],
    ['--only','systematic_a'],
  ]) assert.throws(() => parseRunArguments(args, frozenIds));
});
