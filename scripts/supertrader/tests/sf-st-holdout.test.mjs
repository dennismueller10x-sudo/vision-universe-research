// Holdout 2008–2015 (Strang H): Supertrader-Teil. Die vollständigen Prüfungen stehen in scripts/research/holdout/holdout.test.cjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as H from '../source-faithful/research/run-st-holdout.mjs';

test('ST-HOLDOUT-1: Protokoll gepinnt, 11 Methoden; Lauf nur im Holdout-Fenster und nur mit registriertem Snapshot', () => {
  const P = H.loadProtocol();
  assert.equal(P.methods.length, 11);
  const r = spawnSync(process.execPath, [new URL('../source-faithful/research/run-st-holdout.mjs', import.meta.url).pathname, '--snapshot', 'sts1-85959e4bab0681baa6ed221bee94821e', '--out', '/tmp/x'], { encoding: 'utf8', env: { ...process.env, ST_WINDOW: 'DEV' } });
  assert.equal(r.status, 2); assert.match(r.stderr, /HOLDOUT_WINDOW_REQUIRED/);
  const r2 = spawnSync(process.execPath, [new URL('../source-faithful/research/run-st-holdout.mjs', import.meta.url).pathname, '--snapshot', 'sts1-134d4d62eb88b6ff8d98fe6e56b12a6d', '--out', '/tmp/x'], { encoding: 'utf8', env: { ...process.env, ST_WINDOW: 'HOLDOUT' } });
  assert.equal(r2.status, 2); assert.match(r2.stderr, /HOLDOUT_SNAPSHOT_NOT_REGISTERED/);
});

test('ST-HOLDOUT-2: die Holdout-Tests der Forschungsseite laufen grün', () => {
  const r = spawnSync(process.execPath, ['--test', new URL('../../research/holdout/holdout.test.cjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout.slice(-2000));
});
