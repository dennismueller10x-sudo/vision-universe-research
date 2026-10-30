// Zahlungsrelevante Schalter: zustandsloser Vergleich Konfiguration <-> laufender Worker.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {desiredState, liveState, sensitiveChanges} from '../release-guard.mjs';
import {productionVars} from '../check-public-checkout.mjs';
import {LEGAL_VERSION} from '../../../workers/vu-account/src/legal/texts.mjs';

const vars = productionVars(readFileSync(new URL('../../../workers/vu-account/wrangler.toml', import.meta.url), 'utf8'));
// /v1/health des heute laufenden Workers (Deploy #10, 29.10.2026; ohne tax/liveApproved).
const healthToday = {state: 'OK', checkout: 'testers', legal: 'entwurf', legalApproved: false, autoProcess: false, newsletter: false, contactSync: false};

test('heutige Konfiguration gegen den heute laufenden Worker: nichts Zahlungsrelevantes -> automatisch', () => {
  assert.deepEqual(sensitiveChanges(desiredState(vars), liveState(healthToday, {mode: 'live'})), []);
});

test('jede zahlungsrelevante Aenderung wird erkannt', () => {
  const live = liveState(healthToday, {mode: 'live'});
  const keys = extra => sensitiveChanges(desiredState({...vars, ...extra}), live).map(c => c.key);
  assert.deepEqual(keys({VU_CHECKOUT_ACCESS: 'off'}), ['checkout']);
  assert.deepEqual(keys({STRIPE_TAX_MODE: 'txr_abc'}), ['tax']);
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
  const live = liveState({...healthToday, tax: 'txr_abc', liveApproved: true}, {mode: 'live'});
  assert.deepEqual(sensitiveChanges(desiredState(vars), live).map(c => c.key), ['tax']);
});
