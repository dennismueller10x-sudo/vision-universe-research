// Oeffentlicher Pro-Checkout nur mit freigegebenen Rechtstexten, bestaetigter Fassung, Live-Freigabe und USt-Ausweis.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {productionVars, publicCheckoutProblems} from '../check-public-checkout.mjs';

const approved = {status: 'freigegeben', version: 'vu-recht-2026-11-10-1', docs: {agb: {blocks: ['Text']}}};
const ready = {VU_CHECKOUT_ACCESS: 'public', VU_LEGAL_APPROVED: 'vu-recht-2026-11-10-1', STRIPE_LIVE_MODE_APPROVED: 'true', STRIPE_TAX_MODE: 'txr_123'};

test('testers und off sind immer zulaessig, unbekannte Werte nicht', () => {
  assert.deepEqual(publicCheckoutProblems({VU_CHECKOUT_ACCESS: 'testers'}), []);
  assert.deepEqual(publicCheckoutProblems({VU_CHECKOUT_ACCESS: 'off'}), []);
  assert.equal(publicCheckoutProblems({VU_CHECKOUT_ACCESS: 'oeffentlich'}).length, 1);
});

test('public: alle vier Bedingungen', () => {
  assert.deepEqual(publicCheckoutProblems(ready, approved), []);
  assert.deepEqual(publicCheckoutProblems({...ready, STRIPE_TAX_MODE: 'automatic'}, approved), []);
  assert.equal(publicCheckoutProblems(ready, {...approved, status: 'entwurf'}).length, 1);
  assert.equal(publicCheckoutProblems(ready, {...approved, docs: {agb: {blocks: ['[[OFFEN: x]]']}}}).length, 1);
  assert.equal(publicCheckoutProblems({...ready, VU_LEGAL_APPROVED: 'vu-recht-alt'}, approved).length, 1);
  assert.equal(publicCheckoutProblems({...ready, STRIPE_LIVE_MODE_APPROVED: 'false'}, approved).length, 1);
  assert.equal(publicCheckoutProblems({...ready, STRIPE_TAX_MODE: 'none'}, approved).length, 1);
});

test('heutiger Stand: Produktion zulaessig (testers), public waere mit den Entwuerfen abgelehnt', () => {
  const vars = productionVars(readFileSync(new URL('../../../workers/vu-account/wrangler.toml', import.meta.url), 'utf8'));
  assert.equal(vars.VU_CHECKOUT_ACCESS, 'testers');
  assert.deepEqual(publicCheckoutProblems(vars), []);
  assert.ok(publicCheckoutProblems({...vars, VU_CHECKOUT_ACCESS: 'public'}).length >= 3);
});
