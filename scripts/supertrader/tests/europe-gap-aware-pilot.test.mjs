// E9 Weg 6: Lueckenregeln des Pilot-Backtests (synthetisch, ohne Produktionsdaten).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runLengths, admittedAt, segments, runTurtle, episode, momentum, buildSeries, PROTOCOL_PATH, PROTOCOL_SHA256, RULES } from '../../research/europe-gap-aware/pilot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const days = n => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2011, 0, 3) + i * 864e5).toISOString().slice(0, 10));

test('protocol hash is pinned', () => {
  assert.equal(createHash('sha256').update(readFileSync(join(ROOT, PROTOCOL_PATH))).digest('hex'), PROTOCOL_SHA256);
});

test('segments and run lengths restart after a gap', () => {
  const c = [1, 2, null, 3, 4, 5, null];
  assert.deepEqual(segments(c), [[0, 1], [3, 5]]);
  assert.deepEqual(runLengths(c), [1, 2, 0, 1, 2, 3, 0]);
});

test('admission needs 200 preceding observed sessions and 98 % of the last 252, nothing later', () => {
  const c = Array.from({ length: 400 }, (_, i) => 10 + i * 0.01);
  c[100] = null;
  const run = runLengths(c);
  assert.equal(admittedAt(c, run, 300, RULES), false, 'only 199 sessions since the gap');
  assert.equal(admittedAt(c, run, 301, RULES), true);
  const later = c.slice(); later[350] = null;
  assert.equal(admittedAt(later, runLengths(later), 301, RULES), true, 'a later gap does not change admission at t');
});

test('a position open at a gap is censored, never liquidated before the gap', () => {
  // Rising series triggers a Donchian breakout; the gap follows while the position is open.
  const n = 320, d = days(n);
  const c = d.map((_, i) => i < 260 ? 20 + Math.sin(i / 3) : 20 + (i - 260) * 0.3);
  c[300] = null;
  const r = runTurtle('TEST', buildSeries(d, new Map(d.map((x, i) => [x, c[i]]).filter(([, v]) => v !== null))), { ...RULES, from: '2011-01-01', to: '2099-12-31' });
  assert.ok(r.censored.length >= 1, 'position at the gap is censored');
  assert.equal(r.censored[0].reason, 'GAP');
  for (const t of r.closed) for (const x of t.signal.exits) assert.ok(x.date < d[300] || x.date > d[300], 'no execution on the gap day');
});

test('Q1 episodes: gap before exit censors, gap at entry is not executed', () => {
  const c = Array.from({ length: 30 }, (_, i) => 10 + i);
  const s = { close: c.slice() };
  assert.equal(episode(s, null, 0, 10).kind, 'CLOSED');
  s.close[5] = null;
  assert.equal(episode(s, null, 0, 10).kind, 'CENSORED_GAP');
  assert.equal(episode(s, null, 4, 10).kind, 'NOT_EXECUTED');
  const m = Array.from({ length: 300 }, (_, i) => 1 + i);
  assert.equal(momentum(m, runLengths(m), 299), m[278] / m[47] - 1);
  assert.equal(momentum(m, runLengths(m), 200), null);
});
