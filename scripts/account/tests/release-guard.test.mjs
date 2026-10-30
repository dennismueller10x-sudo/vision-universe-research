// Zahlungsrelevante Schalter: zustandsloser Vergleich Konfiguration <-> laufender Worker.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {desiredState, liveState, sensitiveChanges} from '../release-guard.mjs';
import {productionVars} from '../check-public-checkout.mjs';
import {LEGAL_VERSION} from '../../../workers/vu-account/src/legal/texts.mjs';

const vars = productionVars(readFileSync(new URL('../../../workers/vu-account/wrangler.toml', import.meta.url), 'utf8'));
// /v1/health eines laufenden Workers, der genau die eingecheckte Konfiguration hat (tax je nach wrangler.toml).
const TAX = vars.STRIPE_TAX_MODE === 'automatic' ? 'automatic' : 'none';
const OTHER_TAX = TAX === 'automatic' ? 'none' : 'automatic';
const healthToday = {state: 'OK', checkout: 'testers', legal: 'entwurf', legalApproved: false, autoProcess: false, newsletter: false, contactSync: false, tax: TAX};

test('heutige Konfiguration gegen den heute laufenden Worker: nichts Zahlungsrelevantes -> automatisch', () => {
  assert.deepEqual(sensitiveChanges(desiredState(vars), liveState(healthToday, {mode: 'live'})), []);
});

test('jede zahlungsrelevante Aenderung wird erkannt', () => {
  const live = liveState(healthToday, {mode: 'live'});
  const keys = extra => sensitiveChanges(desiredState({...vars, ...extra}), live).map(c => c.key);
  assert.deepEqual(keys({VU_CHECKOUT_ACCESS: 'off'}), ['checkout']);
  assert.deepEqual(keys({STRIPE_TAX_MODE: OTHER_TAX}), ['tax']);
  assert.deepEqual(keys({STRIPE_LIVE_MODE_APPROVED: 'false'}), ['liveApproved']);
  assert.deepEqual(keys({VU_CANCELLATION_AUTO_PROCESS: 'true'}), ['autoProcess']);
  // "public" mit Entwurfstexten bleibt wirksam "testers" - keine Aenderung am laufenden Verhalten.
  assert.deepEqual(keys({VU_CHECKOUT_ACCESS: 'public', VU_LEGAL_APPROVED: LEGAL_VERSION}), []);
});

test('nicht zahlungsrelevant: Brevo, Newsletter, Listen, Code', () => {
  const live = liveState(healthToday, {mode: 'live'});
  assert.deepEqual(sensitiveChanges(desiredState({...vars, VU_BREVO_SYNC: 'true', VU_NEWSLETTER: 'true', VU_BREVO_LIST_USERS: '99'}), live), []);
});

test('neuer Worker meldet tax und liveApproved selbst', () => {
  const live = liveState({...healthToday, tax: OTHER_TAX, liveApproved: true}, {mode: 'live'});
  assert.deepEqual(sensitiveChanges(desiredState(vars), live).map(c => c.key), ['tax']);
});

test('aelterer Worker ohne tax-Feld gilt als "none"', () => {
  const {tax, ...old} = healthToday;
  assert.equal(liveState(old, {mode: 'live'}).tax, 'none');
});

test('Richtung: nur Oeffnen oder Schutz-Entfernen braucht die Freigabe', async () => {
  const {needsApproval} = await import('../release-guard.mjs');
  const a = (key, from, to) => needsApproval({key, from, to});
  // Zahlungen oeffnen / Berechtigungen erweitern -> Freigabe
  assert.equal(a('checkout', 'testers', 'public'), true, 'oeffentliche Zahlungen');
  assert.equal(a('checkout', 'off', 'testers'), true, 'neue Zahlungsberechtigung');
  assert.equal(a('liveApproved', false, true), true, 'Live-Abrechnung');
  assert.equal(a('autoProcess', false, true), true, 'Kuendigungen automatisch ausfuehren');
  assert.equal(a('tax', 'automatic', 'none'), true, 'Steuerausweis entfernen');
  assert.equal(a('checkout', 'testers', 'unbekannt'), true, 'unbekannter Wert: fail closed');
  // Einschraenken oder gepruefte Schutzfunktion hinzufuegen -> automatisch
  assert.equal(a('checkout', 'public', 'testers'), false, 'zurueck auf Tester');
  assert.equal(a('checkout', 'testers', 'off'), false, 'Checkout aus');
  assert.equal(a('liveApproved', true, false), false, 'Live-Abrechnung aus');
  assert.equal(a('autoProcess', true, false), false);
  assert.equal(a('tax', 'none', 'automatic'), false, 'Stripe Tax ein (fail closed im Worker)');
  assert.equal(a('legalApproved', false, true), false, 'ohne Checkout-Aenderung keine Zahlungswirkung');
});

test('heutiger Stripe-Tax-Wechsel waere jetzt automatisch, der oeffentliche Start nicht', () => {
  const live = liveState({...healthToday, tax: 'none'}, {mode: 'live'});
  const tax = sensitiveChanges(desiredState({...vars, STRIPE_TAX_MODE: 'automatic'}), live);
  assert.deepEqual(tax.map(c => [c.key, c.approval]), [['tax', false]]);
  const golive = sensitiveChanges({...desiredState(vars), checkout: 'public'}, liveState(healthToday, {mode: 'live'}));
  assert.ok(golive.some(c => c.key === 'checkout' && c.approval));
});
