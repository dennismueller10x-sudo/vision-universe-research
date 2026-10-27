// Werkzeuge des Produktions-Ende-zu-Ende-Laufs ohne Netz.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Jar, pickInstruments, strongPassword, runE2E} from '../prod-e2e.mjs';

const res = cookies => ({headers: {getSetCookie: () => cookies}});

test('Cookie-Speicher uebernimmt, ersetzt und loescht Cookies', () => {
  const jar = new Jar();
  jar.take(res(['__Host-vu_at=abc; Path=/; HttpOnly; Secure; Max-Age=3600', '__Host-vu_rt=r1; Path=/']));
  assert.equal(jar.header(), '__Host-vu_at=abc; __Host-vu_rt=r1');
  jar.take(res(['__Host-vu_at=; Path=/; Max-Age=0', '__Host-vu_rt=r2; Path=/']));
  assert.equal(jar.header(), '__Host-vu_rt=r2');
});

test('Testtitel kommen aus dem Company Master (instrumentId, nie der Ticker als Kennung)', () => {
  const list = pickInstruments(21);
  assert.equal(list.length, 21);
  assert.ok(list.every(i => /^vu_[a-f0-9]{6,32}$/.test(i.instrumentId) && /^[A-Z0-9.-]{1,24}$/.test(i.ticker)));
  assert.equal(new Set(list.map(i => i.instrumentId)).size, 21);
});

test('Testpasswoerter erfuellen die Produktionsregel (>= 10, Gross/Klein/Ziffer)', () => {
  for (let i = 0; i < 20; i++) {
    const p = strongPassword();
    assert.ok(p.length >= 10 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /\d/.test(p));
  }
});

test('ohne Zugangsdaten startet der Lauf nicht', async () => {
  await assert.rejects(runE2E({}, {fetchImpl: () => { throw new Error('kein Netz'); }, log: () => {}}), /fehlt/);
});
