// Oeffentlicher Pro-Checkout nur mit freigegebenen Rechtstexten, bestaetigter Fassung, Live-Freigabe und USt-Ausweis.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {productionVars, publicCheckoutProblems} from '../check-public-checkout.mjs';

const approved = {status: 'freigegeben', version: 'vu-recht-2026-11-10-1', docs: {agb: {blocks: ['Text']}}};
const ready = {VU_CHECKOUT_ACCESS: 'public', VU_LEGAL_APPROVED: 'vu-recht-2026-11-10-1', STRIPE_LIVE_MODE_APPROVED: 'true', STRIPE_TAX_MODE: 'automatic'};

test('testers und off sind immer zulaessig, unbekannte Werte nicht', () => {
  assert.deepEqual(publicCheckoutProblems({VU_CHECKOUT_ACCESS: 'testers'}), []);
  assert.deepEqual(publicCheckoutProblems({VU_CHECKOUT_ACCESS: 'off'}), []);
  assert.equal(publicCheckoutProblems({VU_CHECKOUT_ACCESS: 'oeffentlich'}).length, 1);
});

test('public: alle vier Bedingungen', () => {
  assert.deepEqual(publicCheckoutProblems(ready, approved), []);
  assert.equal(publicCheckoutProblems({...ready, STRIPE_TAX_MODE: 'txr_123'}, approved).length, 1, 'fester Steuersatz nicht mehr zulaessig');
  assert.equal(publicCheckoutProblems(ready, {...approved, status: 'entwurf'}).length, 1);
  assert.equal(publicCheckoutProblems(ready, {...approved, docs: {agb: {blocks: ['[[OFFEN: x]]']}}}).length, 1);
  assert.equal(publicCheckoutProblems({...ready, VU_LEGAL_APPROVED: 'vu-recht-alt'}, approved).length, 1);
  assert.equal(publicCheckoutProblems({...ready, STRIPE_LIVE_MODE_APPROVED: 'false'}, approved).length, 1);
  assert.equal(publicCheckoutProblems({...ready, STRIPE_TAX_MODE: 'none'}, approved).length, 1);
});

test('heutiger Stand: Rechtstexte freigeschaltet (06.11.2026), Checkout bleibt testers', () => {
  const vars = productionVars(readFileSync(new URL('../../../workers/vu-account/wrangler.toml', import.meta.url), 'utf8'));
  assert.equal(vars.VU_CHECKOUT_ACCESS, 'testers', 'oeffentliche Zahlungen sind eine eigene Owner-Freigabe');
  assert.deepEqual(publicCheckoutProblems(vars), []);
  // Mit freigegebenen Texten waere public technisch zulaessig; ausgerollt wird es nur ueber den Job zahlungsfreigabe.
  assert.deepEqual(publicCheckoutProblems({...vars, VU_CHECKOUT_ACCESS: 'public'}), []);
  assert.ok(publicCheckoutProblems({...vars, VU_CHECKOUT_ACCESS: 'public', VU_LEGAL_APPROVED: ''}).length >= 1, 'ohne bestaetigte Fassung abgelehnt');
});
