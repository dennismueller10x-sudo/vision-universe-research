// Rückbau L2/L3 (Owner 06.11.2026): voller Ledger kommt aus der Ablage zurück, nur wenn im Repository die öffentliche Sicht steht.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decide, restore, keyFor, HOUSE_ID } from '../restore-full-ledgers.mjs';

const pub = { schema: 'supertrader-ledger-public-1.0.0' }, full = { schema: 'supertrader-ledger-1.2.0', open: [{ symbol: 'ADP', entry: { price: 288.29 }, stop: 282.73 }] };
const housePub = { schema: 'supertrader-house-ledger-2.0.0' }, houseFull = { schema: 'supertrader-house-ledger-1.0.0', current: ['AAPL'] };

test('RF1 voller Ledger im Repository bleibt, öffentliche Sicht wird aus der Ablage ersetzt', () => {
  assert.equal(decide('DARVAS_BOX', full, null).action, 'KEEP');
  assert.deepEqual(decide('DARVAS_BOX', pub, full), { action: 'RESTORE', ledger: full });
  assert.deepEqual(decide(HOUSE_ID, housePub, houseFull), { action: 'RESTORE', ledger: houseFull });
});
test('RF2 fail closed: öffentliche Sicht ohne vollen Ledger in der Ablage bricht ab', () => {
  assert.throws(() => decide('DARVAS_BOX', pub, null), /fail closed/);
  assert.throws(() => decide('DARVAS_BOX', pub, pub), /fail closed/);
  assert.throws(() => decide(HOUSE_ID, housePub, housePub), /fail closed/);
});
test('RF3 Ablageschlüssel wie #1479 und #1452; restore schreibt nur ersetzte Ledger, zweiter Lauf ändert nichts', async () => {
  assert.equal(keyFor('DARVAS_BOX'), 'supertrader-signals/ledger-private-1/DARVAS_BOX.json');
  assert.equal(keyFor(HOUSE_ID), 'supertrader-house/VU_HOUSE_HS4_V03/ledger-private-1.json');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-'));
  fs.writeFileSync(path.join(dir, 'DARVAS_BOX.json'), JSON.stringify(pub));
  fs.writeFileSync(path.join(dir, 'MINERVINI_VCP.json'), JSON.stringify(full));
  const store = { [keyFor('DARVAS_BOX')]: Buffer.from(JSON.stringify(full)) }, driver = { get: async (k) => store[k] || null };
  assert.deepEqual(await restore(driver, dir, { log() {} }), { DARVAS_BOX: 'RESTORE', MINERVINI_VCP: 'KEEP' });
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'DARVAS_BOX.json'), 'utf8')).open[0].stop, 282.73);
  assert.deepEqual(await restore(driver, dir, { log() {} }), { DARVAS_BOX: 'KEEP', MINERVINI_VCP: 'KEEP' });
});
