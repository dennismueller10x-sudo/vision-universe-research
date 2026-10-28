// Stripe-LIVE-Pruefung ohne Netz: nachgebildetes Stripe (livemode=true).
import test from 'node:test';
import assert from 'node:assert/strict';
import {checkStripeLive} from '../stripe-live-check.mjs';
import {WEBHOOK_EVENTS} from '../stripe-test-setup.mjs';

const LIVE_KEY = ['rk', 'live', 'abc123'].join('_');
const API = 'https://konto.visionuniverse.de';
const json = (status, body) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
const PM = (available, value = 'off') => ({available, display_preference: {preference: value, value}});

function fakeStripe({paypal = PM(true, 'on'), sessionTypes = ['card', 'link', 'paypal'], accountStatus = 200, sessionStatus = 200} = {}) {
  const calls = [];
  const fetchImpl = async (url, {method = 'GET'} = {}) => {
    const p = new URL(url).pathname;
    calls.push(`${method} ${p}`);
    if (p === '/v1/prices') return json(200, {data: [{id: 'price_live1', unit_amount: 100, currency: 'eur', recurring: {interval: 'month'}, livemode: true}]});
    if (p === '/v1/payment_method_configurations') return json(200, {data: [{id: 'pmc_1', is_default: true, active: true, livemode: true,
      card: PM(true, 'on'), apple_pay: PM(true, 'on'), google_pay: PM(true, 'on'), paypal, sepa_debit: PM(false), klarna: PM(true, 'on'), link: PM(true, 'on')}]});
    if (p === '/v1/account') return accountStatus === 200
      ? json(200, {livemode: true, capabilities: {card_payments: 'active', paypal_payments: 'active', sepa_debit_payments: 'pending'}})
      : json(accountStatus, {error: {type: 'invalid_request_error'}});
    if (p === '/v1/webhook_endpoints') return json(200, {data: [{id: 'we_1', url: `${API}/v1/billing/webhook/stripe`, status: 'enabled', enabled_events: [...WEBHOOK_EVENTS], livemode: true}]});
    if (p === '/v1/billing_portal/configurations') return json(200, {data: [{id: 'bpc_1', metadata: {vu_managed: 'true'}, livemode: true,
      features: {subscription_cancel: {enabled: true, mode: 'at_period_end'}, payment_method_update: {enabled: true}, invoice_history: {enabled: true}}}]});
    if (method === 'POST' && p === '/v1/checkout/sessions') return sessionStatus === 200
      ? json(200, {id: 'cs_live_1', url: 'https://checkout.stripe.com/c/pay/geheim', payment_method_types: sessionTypes, livemode: true})
      : json(sessionStatus, {error: {type: 'invalid_request_error'}});
    if (method === 'POST' && p === '/v1/checkout/sessions/cs_live_1/expire') return json(200, {id: 'cs_live_1', status: 'expired', livemode: true});
    return json(500, {error: {type: 'unexpected', path: p}});
  };
  return {calls, fetchImpl};
}
const run = (s, opts = {}) => {
  const lines = [];
  return checkStripeLive({key: LIVE_KEY, approved: 'true', apiOrigin: API, fetchImpl: s.fetchImpl, log: l => lines.push(l), ...opts})
    .then(r => ({r, lines}));
};

test('ohne Probe nur lesend; PayPal eingeschaltet, Abo-Faehigkeit unbekannt', async () => {
  const s = fakeStripe();
  const {r} = await run(s);
  assert.ok(s.calls.every(c => c.startsWith('GET ')), s.calls.join(','));
  assert.equal(r.price.ok, true);
  assert.equal(r.methods.find(m => m.key === 'sepa_debit').state, 'nicht freigeschaltet');
  assert.equal(r.capabilities.sepa_debit, 'pending');
  assert.deepEqual(r.webhook, {status: 'enabled', missing: []});
  assert.equal(r.portal.mode, 'at_period_end');
  assert.match(r.paypal, /^unbekannt/);
});

test('Probe: PayPal im Abo-Checkout, Sitzung sofort beendet, Link nie ausgegeben', async () => {
  const s = fakeStripe();
  const {r, lines} = await run(s, {probeCheckout: true});
  assert.equal(r.paypal, 'ja');
  assert.equal(r.checkout.expired, true);
  assert.deepEqual(s.calls.filter(c => c.startsWith('POST')), ['POST /v1/checkout/sessions', 'POST /v1/checkout/sessions/cs_live_1/expire']);
  assert.ok(!lines.join('\n').includes('checkout.stripe.com'));
  assert.ok(!lines.join('\n').includes(LIVE_KEY));
});

test('Probe: PayPal fehlt im Abo-Checkout -> nein', async () => {
  const {r} = await run(fakeStripe({sessionTypes: ['card', 'link']}), {probeCheckout: true});
  assert.match(r.paypal, /^nein: PayPal fehlt im Abo-Checkout/);
});

test('PayPal ausgeschaltet; fehlende Leserechte sind Hinweise, kein Abbruch', async () => {
  const {r, lines} = await run(fakeStripe({paypal: PM(true, 'off'), accountStatus: 403, sessionStatus: 403}), {probeCheckout: true});
  assert.equal(r.paypal, 'nein: PayPal ausgeschaltet');
  assert.equal(r.capabilities, null);
  assert.ok(r.checkout.error);
  assert.ok(lines.some(l => l.startsWith('Konto-Faehigkeiten nicht lesbar')));
});

test('lehnt Test- und Standard-Schluessel ab', async () => {
  await assert.rejects(checkStripeLive({key: ['sk', 'test', 'x'].join('_'), approved: 'true', apiOrigin: API, fetchImpl: fakeStripe().fetchImpl}), /Testschluessel/);
  await assert.rejects(checkStripeLive({key: LIVE_KEY, approved: 'false', apiOrigin: API, fetchImpl: fakeStripe().fetchImpl}), /APPROVED/);
});
