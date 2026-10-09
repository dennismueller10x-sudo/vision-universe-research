/* M-B1: Ein Wert unter einem TTM-Label ist ein echter TTM-Wert - nie das Geschaeftsjahr.

   Echte Consumer-Bundles (SEC companyfacts, as of 2026-10-05):
     BMI-core-1.19   Badger Meter, Kern 1.19.0: eps.ttmDiluted VERIFIED 4,28 (vier gemeldete Quartale)
     AAPL-core-1.19  Apple, Kern 1.19.0: eps.ttmDiluted NOT_AVAILABLE (Q4 nur als Jahreswert gemeldet)
     AAPL-main-1.10  Apple, main (Kern 1.10.0): ttm.eps_diluted 8,71 aus FY minus 9M, kein eps-Block
   Geschaeftsjahres-EPS: BMI FY2025 4,79; AAPL FY2025 7,46. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { epsColumns } from '../../scripts/screener/build-universe.mjs';

const require = createRequire(import.meta.url);
const Fundamentals = require('../engines/fundamentals.js');
const Unternehmen = require('../engines/unternehmen.js');
const bundle = (name) => JSON.parse(readFileSync(new URL(`./fixtures/eps-semantics/${name}.json`, import.meta.url), 'utf8'));
const NAMES = ['BMI-core-1.19', 'AAPL-core-1.19', 'AAPL-main-1.10'];

test('echtes TTM-EPS erscheint als TTM (BMI 4,28)', () => {
  const model = Fundamentals.fromBundle(bundle('BMI-core-1.19'));
  const latest = Fundamentals.latest(model);
  assert.equal(latest.ttm.eps_diluted.v, 4.28);
  assert.deepEqual({ status: latest.eps.ttmDiluted.status, v: latest.eps.ttmDiluted.v }, { status: 'VERIFIED', v: 4.28 });
  assert.equal(latest.eps.fyDiluted.v, 4.79);
  const karte = Unternehmen.ausConsumerBundle(model, { preis: 100 });
  assert.equal(karte.kgvBasis, 'TTM');
  assert.equal(karte.gewinnJeAktie, 4.28);
  assert.ok(Math.abs(karte.kgv - 100 / 4.28) < 0.01);
  assert.ok(Math.abs(karte.kgvFy - 100 / 4.79) < 0.01, 'FY-KGV steht separat');
});

test('ohne verifiziertes TTM-EPS bleibt das TTM-Feld leer - kein FY-Ersatz (AAPL 1.19)', () => {
  const model = Fundamentals.fromBundle(bundle('AAPL-core-1.19'));
  const latest = Fundamentals.latest(model);
  assert.equal(latest.ttm.eps_diluted, undefined);
  assert.equal(latest.eps.ttmDiluted.status, 'NOT_AVAILABLE');
  assert.equal(latest.eps.ttmDiluted.reason, 'INSUFFICIENT_HISTORY');
  assert.equal(latest.eps.fyDiluted.v, 7.46);
  assert.deepEqual(epsColumns({ latest }), { eps: null, epsFy: 7.46 });
  const karte = Unternehmen.ausConsumerBundle(model, { preis: 200 });
  assert.equal(karte.epsTtm, null);
  assert.equal(karte.kgvTtm, null);
  assert.equal(karte.kgvBasis, 'FY', 'das KGV ist ausdruecklich ein Geschaeftsjahres-KGV');
  assert.ok(Math.abs(karte.kgv - 200 / 7.46) < 0.01);
});

test('altes Bundle: das FY-9M-TTM von main wird nicht als TTM gezeigt (AAPL 1.10, 8,71)', () => {
  const model = Fundamentals.fromBundle(bundle('AAPL-main-1.10'));
  assert.ok(model.ttm.eps_diluted && Math.abs(model.ttm.eps_diluted.v - 8.71) < 1e-9, 'Fixture traegt das alte TTM');
  const latest = Fundamentals.latest(model);
  assert.equal(latest.ttm.eps_diluted, undefined);
  assert.equal(latest.eps.ttmDiluted.status, 'NOT_AVAILABLE');
  assert.equal(latest.eps.ttmDiluted.reason, Fundamentals.EPS_TTM_UNVERIFIED);
  assert.deepEqual(epsColumns({ latest }), { eps: null, epsFy: 7.46 });
  const karte = Unternehmen.ausConsumerBundle(model, { preis: 200 });
  assert.notEqual(karte.kgvBasis, 'TTM');
  assert.notEqual(karte.gewinnJeAktie, 8.71);
});

test('fortgefuehrtes EPS ist kein Gesamt-EPS: kein FY-KGV daraus', () => {
  const b = bundle('AAPL-core-1.19');
  b.eps.fyDiluted = Object.assign({}, b.eps.fyDiluted, { class: 'CONTINUING' });
  const model = Fundamentals.fromBundle(b);
  const karte = Unternehmen.ausConsumerBundle(model, { preis: 200 });
  assert.equal(karte.kgvFy, null);
  assert.equal(karte.kgvStatus, 'SOURCE_MISSING');
  assert.deepEqual(epsColumns({ latest: Fundamentals.latest(model) }), { eps: null, epsFy: null });
});

test('HARD GATE: in keinem Fall steht ein FY-Wert unter einem TTM-Namen', () => {
  for (const name of NAMES) {
    const model = Fundamentals.fromBundle(bundle(name));
    const latest = Fundamentals.latest(model);
    const verified = latest.eps.ttmDiluted.status === 'VERIFIED';
    assert.equal(!!latest.ttm.eps_diluted, verified, `${name}: ttm.eps_diluted nur mit VERIFIED`);
    const cols = epsColumns({ latest });
    assert.equal(cols.eps !== null, verified, `${name}: Screener-EPS (TTM) nur mit VERIFIED`);
    const karte = Unternehmen.ausConsumerBundle(model, { preis: 150 });
    if (karte.kgvBasis === 'TTM') assert.ok(verified, `${name}: TTM-KGV nur aus verifiziertem EPS`);
    if (karte.basis === 'FY') {
      assert.equal(karte.umsatzTTM, null, `${name}: umsatzTTM ohne TTM-Basis`);
      assert.equal(karte.gewinnTTM, null, `${name}: gewinnTTM ohne TTM-Basis`);
    }
  }
});

test('Kartenwerte tragen ihre Basis; umsatzTTM/gewinnTTM nur bei TTM-Basis', () => {
  const b = bundle('AAPL-core-1.19');
  delete b.ttm.net_income;               // erzwingt Basis FY (kein TTM-Ergebnis)
  const karte = Unternehmen.ausConsumerBundle(Fundamentals.fromBundle(b), { preis: 200 });
  assert.equal(karte.basis, 'FY');
  assert.equal(karte.umsatzTTM, null);
  assert.equal(karte.gewinnTTM, null);
  assert.ok(karte.umsatz > 0 && karte.gewinn > 0);
});

test('EPS GJ ist ein Je-Aktie-Wert: Eingabe "5" bleibt 5 $, keine Mio.-Skalierung', () => {
  const F = require('../../screener/engine/fields.js');
  const field = (F.FIELDS || F.fields || []).find ? (F.FIELDS || F.fields).find((f) => f.id === 'epsFy') : F.get('epsFy');
  assert.ok(field, 'Feld epsFy fehlt');
  assert.equal(F.fromInput(field, '5', undefined), 5);
  const epsTtm = (F.FIELDS || F.fields || []).find ? (F.FIELDS || F.fields).find((f) => f.id === 'eps') : F.get('eps');
  assert.equal(F.inputUnit(field, 5e6), F.inputUnit(epsTtm, 5e6), 'dieselbe Je-Aktie-Einheit wie EPS TTM, keine Mio.-Einheit');
  assert.equal(F.toInput(field, 5), '5');
});
