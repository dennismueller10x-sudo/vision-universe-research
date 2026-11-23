import test from 'node:test';
import assert from 'node:assert/strict';
import {ohneVorubergehende5xx, szeneMitWiederholung} from '../../scripts/technical/world/transient-5xx.mjs';
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

/* ---------- Szene genau einmal neu laden, nur nach einem 5xx in derselben Szene (Steuerung 23.11.2026) ---------- */
test("LQ-5 Szene scheitert nach einem 503: genau einmal neu laden, zweiter Versuch ok -> kein Befund, vermerkt 'wiederholt nach 503'", async () => {
  let n = 0, neu = 0;
  const r = await szeneMitWiederholung({ lauf: async () => { n++; if (n === 1) throw new Error("page.waitForSelector: Timeout 90000ms exceeded."); }, fuenfxx: () => ["503 /technical/engine/chart-explain.js"], neuLaden: async () => { neu++; } });
  assert.equal(r.fehler, null); assert.equal(r.wiederholt, true); assert.equal(r.code, "503"); assert.equal(n, 2); assert.equal(neu, 1);
});
test("LQ-6 ohne vorherigen 5xx bleibt ein Timeout rot: kein Neuladen, keine Wiederholung (auch 4xx zaehlt nicht)", async () => {
  for (const liste of [[], ["404 /technical/x.js"], ["200 /a"]]) {
    let n = 0, neu = 0;
    const r = await szeneMitWiederholung({ lauf: async () => { n++; throw new Error("Timeout"); }, fuenfxx: () => liste, neuLaden: async () => { neu++; } });
    assert.match(r.fehler.message, /Timeout/); assert.equal(r.wiederholt, false); assert.equal(n, 1); assert.equal(neu, 0);
  }
});
test("LQ-7 scheitert auch der zweite Versuch, bleibt es ein Befund; es gibt nie einen dritten Versuch; eine gelungene Szene wird nie wiederholt", async () => {
  let n = 0, neu = 0;
  const r = await szeneMitWiederholung({ lauf: async () => { n++; throw new Error("Timeout " + n); }, fuenfxx: () => ["503 /a"], neuLaden: async () => { neu++; } });
  assert.match(r.fehler.message, /Timeout 2/); assert.equal(r.wiederholt, true); assert.equal(n, 2); assert.equal(neu, 1);
  let m = 0, neu2 = 0;
  const ok = await szeneMitWiederholung({ lauf: async () => { m++; }, fuenfxx: () => ["503 /a"], neuLaden: async () => { neu2++; } });
  assert.equal(ok.fehler, null); assert.equal(ok.wiederholt, false); assert.equal(m, 1); assert.equal(neu2, 0);
});
