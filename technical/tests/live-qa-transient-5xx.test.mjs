import test from 'node:test';
import assert from 'node:assert/strict';
import {ohneVorubergehende5xx} from '../../scripts/technical/world/transient-5xx.mjs';
const keinWarten = () => Promise.resolve();
const CONS = 'Failed to load resource: the server responded with a status of 503 ()';

test('LQ-1 ein 503, der beim Nachladen 200 liefert, ist kein Befund (samt Konsolenmeldung)', async () => {
  const r = await ohneVorubergehende5xx({failed: ['503 /technical/data/meta.json'], errs: [CONS], holen: async () => 200, warten: keinWarten});
  assert.deepEqual(r.failed, []);
  assert.deepEqual(r.errs, []);
  assert.deepEqual(r.erholt, ['503 /technical/data/meta.json']);
});
test('LQ-2 ein anhaltender 503 bleibt Befund, nach drei Versuchen', async () => {
  let n = 0;
  const r = await ohneVorubergehende5xx({failed: ['503 /x.json'], errs: [CONS], holen: async () => { n++; return 503; }, warten: keinWarten});
  assert.equal(n, 3);
  assert.deepEqual(r.failed, ['503 /x.json']);
  assert.deepEqual(r.errs, [CONS]);
});
test('LQ-3 4xx bleibt immer Befund und wird nicht nachgeladen', async () => {
  let n = 0;
  const r = await ohneVorubergehende5xx({failed: ['404 /a.json'], errs: ['Failed to load resource: the server responded with a status of 404 ()'], holen: async () => { n++; return 200; }, warten: keinWarten});
  assert.equal(n, 0);
  assert.deepEqual(r.failed, ['404 /a.json']);
  assert.equal(r.errs.length, 1);
});
test('LQ-4 Netzfehler beim Nachladen zaehlt als nicht erholt; andere Konsolenfehler bleiben', async () => {
  const r = await ohneVorubergehende5xx({failed: ['502 /b.png'], errs: ['PAGEERROR x'], holen: async () => { throw Error('net'); }, warten: keinWarten, versuche: 2});
  assert.deepEqual(r.failed, ['502 /b.png']);
  assert.deepEqual(r.errs, ['PAGEERROR x']);
});
// Probe Pfadfilter (ci-gate-neu), nicht mergen
