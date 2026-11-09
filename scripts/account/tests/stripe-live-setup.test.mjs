// Stripe-LIVE-Einrichtung ohne Netz: nachgebildetes Stripe (livemode=true).
import test from 'node:test';
import assert from 'node:assert/strict';
import {setupStripeLive, assertLiveKey, livePriceSql, LIVE_CATALOG, PAYMENT_METHODS} from '../stripe-live-setup.mjs';
import {WEBHOOK_EVENTS} from '../stripe-test-setup.mjs';

const LIVE_KEY = ['rk', 'live', 'abc123'].join('_');
const API = 'https://konto.visionuniverse.de';
const json = (status, body) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});

const PM = (available, value = 'off') => ({available, display_preference: {preference: value, value}});
function fakeStripe({pmcStatus = 200} = {}) {
  const state = {products: new Map(), prices: [], portals: [], hooks: [], calls: [],
    pmc: {id: 'pmc_live1', is_default: true, active: true, parent: null, application: null, livemode: true,
      card: PM(true, 'on'), apple_pay: PM(true, 'on'), google_pay: PM(true, 'off'), sepa_debit: PM(true, 'off'),
      paypal: PM(false), klarna: PM(false), link: PM(true, 'on')}};
  let n = 0;
  const fetchImpl = async (url, {method = 'GET', body} = {}) => {
    const u = new URL(url);
    const form = new URLSearchParams(method === 'GET' ? u.search : body || '');
    const p = u.pathname;
    state.calls.push(`${method} ${p}`);
    if (method === 'GET' && p.startsWith('/v1/products/')) {
      const pr = state.products.get(p.split('/').pop());
      return pr ? json(200, pr) : json(404, {error: {code: 'resource_missing'}});
    }
    if (method === 'POST' && p === '/v1/products') {
      const pr = {id: form.get('id'), name: form.get('name'), description: form.get('description'), active: true, livemode: true};
      state.products.set(pr.id, pr);
      return json(200, pr);
    }
    if (method === 'POST' && p.startsWith('/v1/products/')) {
      const pr = state.products.get(p.split('/').pop());
      Object.assign(pr, {name: form.get('name'), description: form.get('description'), active: form.get('active') === 'true'});
      return json(200, pr);
    }
    if (method === 'GET' && p === '/v1/prices') {
      return json(200, {data: state.prices.filter(x => x.lookup_key === form.get('lookup_keys[0]') && x.active)});
    }
    if (method === 'POST' && p === '/v1/prices') {
      const pr = {id: `price_live${++n}`, product: form.get('product'), unit_amount: Number(form.get('unit_amount')), currency: form.get('currency'),
        tax_behavior: form.get('tax_behavior'), recurring: {interval: form.get('recurring[interval]'), interval_count: Number(form.get('recurring[interval_count]'))},
        lookup_key: form.get('lookup_key'),
        active: true, livemode: true};
      state.prices.filter(x => x.lookup_key === pr.lookup_key).forEach(x => { x.active = false; });
      state.prices.push(pr);
      return json(200, pr);
    }
    if (method === 'GET' && p === '/v1/billing_portal/configurations') return json(200, {data: state.portals});
    if (method === 'POST' && p.startsWith('/v1/billing_portal/configurations')) {
      const id = p.split('/')[4];
      let c = state.portals.find(x => x.id === id);
      if (!c) { c = {id: `bpc_live${++n}`, metadata: {vu_managed: 'true'}, livemode: true}; state.portals.push(c); }
      c.form = Object.fromEntries(form.entries());
      return json(200, c);
    }
    if (p.startsWith('/v1/payment_method_configurations') && pmcStatus !== 200) return json(pmcStatus, {error: {type: 'invalid_request_error', code: 'secret_key_required'}});
    if (method === 'GET' && p === '/v1/payment_method_configurations') return json(200, {data: [state.pmc]});
    if (method === 'POST' && p === '/v1/payment_method_configurations/pmc_live1') {
      for (const [k, v] of form.entries()) {
        const m = /^([a-z_]+)\[display_preference\]\[preference\]$/.exec(k);
        if (m && state.pmc[m[1]]?.available) state.pmc[m[1]].display_preference = {preference: v, value: v};
      }
      return json(200, state.pmc);
    }
    if (method === 'GET' && p === '/v1/webhook_endpoints') return json(200, {data: state.hooks});
    if (method === 'POST' && p === '/v1/webhook_endpoints') {
      const h = {id: `we_live${++n}`, url: form.get('url'), secret: 'whsec_' + 'geheim', livemode: true,
        events: [...form.entries()].filter(([k]) => k.startsWith('enabled_events')).map(([, v]) => v)};
      state.hooks.push(h);
      return json(200, h);
    }
    if (method === 'POST' && p.startsWith('/v1/webhook_endpoints/')) return json(200, state.hooks.find(h => h.id === p.split('/').pop()));
    if (method === 'GET' && p === '/v1/tax_rates') return json(200, {data: state.taxRates || []});
    if (method === 'POST' && p === '/v1/tax_rates') {
      const r = {id: `txr_live${++n}`, percentage: Number(form.get('percentage')), inclusive: form.get('inclusive') === 'true', country: form.get('country'),
        tax_type: form.get('tax_type'), metadata: {vu_managed: form.get('metadata[vu_managed]')}, active: true, livemode: true};
      (state.taxRates ||= []).push(r);
      return json(200, r);
    }
    return json(400, {error: {type: 'invalid_request_error'}});
  };
  return {state, fetchImpl};
}

test('nur freigegebene Live-Restricted-Keys', () => {
  assert.throws(() => assertLiveKey(['sk', 'test', 'x'].join('_'), 'true'), /Testschluessel/);
  assert.throws(() => assertLiveKey(['sk', 'live', 'x'].join('_'), 'true'), /Restricted Key/);
  assert.throws(() => assertLiveKey(LIVE_KEY, 'false'), /Freigabe/);
  assert.throws(() => assertLiveKey('', 'true'), /fehlt/);
  assertLiveKey(LIVE_KEY, 'true');
});

test('Katalog: nur Pro, 1,00 EUR im Monat', () => {
  assert.deepEqual(LIVE_CATALOG.map(c => [c.product, c.name, c.plan, c.prices]), [['vu_pro', 'Vision Universe Pro', 'pro', [['month', 100]]]]);
});

test('legt Produkt Pro, Monatspreis 1,00 EUR inkl. USt, Portal und Webhook an - idempotent', async () => {
  const s = fakeStripe();
  const first = await setupStripeLive({key: LIVE_KEY, approved: 'true', apiOrigin: API, fetchImpl: s.fetchImpl, log: () => {}});
  assert.deepEqual([...s.state.products.keys()], ['vu_pro'], 'kein Plus-Produkt');
  assert.equal(s.state.products.get('vu_pro').name, 'Vision Universe Pro');
  assert.equal(s.state.prices.length, 1);
  assert.deepEqual([s.state.prices[0].unit_amount, s.state.prices[0].currency, s.state.prices[0].tax_behavior, s.state.prices[0].recurring,
    s.state.prices[0].lookup_key], [100, 'eur', 'inclusive', {interval: 'month', interval_count: 1}, 'vu_pro_month']);
  assert.deepEqual(first.prices.map(p => [p.plan, p.interval, p.amount]), [['pro', 'month', 100]]);
  assert.ok(first.portalId.startsWith('bpc_'));
  const portal = s.state.portals[0].form;
  assert.equal(portal['features[subscription_cancel][mode]'], 'at_period_end', 'Kuendigung zum Laufzeitende');
  assert.equal(portal['features[subscription_update][enabled]'], 'false', 'kein Tarifwechsel');
  assert.equal(portal['features[payment_method_update][enabled]'], 'true');
  assert.equal(s.state.hooks.length, 1);
  assert.equal(s.state.hooks[0].url, `${API}/v1/billing/webhook/stripe`);
  assert.deepEqual(s.state.hooks[0].events, [...WEBHOOK_EVENTS]);
  assert.equal(first.webhookSecret.startsWith('whsec_'), true);

  const second = await setupStripeLive({key: LIVE_KEY, approved: 'true', apiOrigin: API, fetchImpl: s.fetchImpl, log: () => {}});
  assert.equal(s.state.prices.length, 1, 'kein zweiter Preis');
  assert.equal(s.state.portals.length, 1, 'kein zweites Portal');
  assert.equal(s.state.hooks.length, 1, 'kein zweiter Webhook');
  assert.equal(second.webhookSecret, null, 'Geheimnis nur beim Anlegen');
  assert.equal(second.prices[0].priceId, first.prices[0].priceId);
  assert.equal(livePriceSql(first.prices).trim().split('\n').filter(l => l.startsWith('  (')).join(),
    `  ('pro_month_live', 'pro', 'stripe', '${first.prices[0].priceId}', 'month', 'EUR', 100, true, true)`);
});

test('vorhandenes Produkt wird umbenannt, abweichender Preis ergaenzt statt geaendert', async () => {
  const s = fakeStripe();
  s.state.products.set('vu_pro', {id: 'vu_pro', name: 'Alt', description: null, active: true, livemode: true});
  s.state.prices.push({id: 'price_alt', product: 'vu_pro', unit_amount: 1990, currency: 'eur', tax_behavior: 'inclusive',
    recurring: {interval: 'month', interval_count: 1}, lookup_key: 'vu_pro_month', active: true, livemode: true});
  const r = await setupStripeLive({key: LIVE_KEY, approved: 'true', apiOrigin: API, fetchImpl: s.fetchImpl, log: () => {}});
  assert.equal(s.state.products.get('vu_pro').name, 'Vision Universe Pro');
  assert.equal(s.state.prices.find(p => p.id === 'price_alt').unit_amount, 1990, 'alter Preis unveraendert');
  assert.notEqual(r.prices[0].priceId, 'price_alt');
  assert.equal(r.prices[0].amount, 100);
});

test('Probelauf legt nichts an', async () => {
  const s = fakeStripe();
  await setupStripeLive({key: LIVE_KEY, approved: 'true', apiOrigin: API, fetchImpl: s.fetchImpl, dryRun: true, log: () => {}});
  assert.equal(s.state.calls.filter(c => c.startsWith('POST')).length, 0);
});

test('bricht ab, wenn Stripe Testmodus meldet', async () => {
  const s = fakeStripe();
  const testModeFetch = async (url, opts) => {
    const res = await s.fetchImpl(url, opts);
    const body = await res.json();
    return json(res.status, {...body, livemode: false});
  };
  await assert.rejects(setupStripeLive({key: LIVE_KEY, approved: 'true', apiOrigin: API, fetchImpl: testModeFetch, log: () => {}}), /livemode=false/);
});

test('Preis-SQL nimmt nur echte Preis-IDs', () => {
  assert.throws(() => livePriceSql([{plan: 'plus', interval: 'month', amount: 990, priceId: "price_x'; drop table x;--"}]), /ungueltig/);
});

test('Zahlungsmethoden: verfuegbare einschalten, fehlende Freischaltung melden, Link unberuehrt', async () => {
  const s = fakeStripe();
  const r = await setupStripeLive({key: LIVE_KEY, approved: 'true', apiOrigin: API, fetchImpl: s.fetchImpl, log: () => {}});
  assert.deepEqual(PAYMENT_METHODS.map(m => m.key), ['card', 'apple_pay', 'google_pay', 'paypal', 'sepa_debit', 'klarna']);
  const state = Object.fromEntries(r.paymentMethods.map(m => [m.key, m.state]));
  assert.deepEqual(state, {card: 'aktiv', apple_pay: 'aktiv', google_pay: 'eingeschaltet', paypal: 'Freischaltung im Dashboard noetig',
    sepa_debit: 'eingeschaltet', klarna: 'Freischaltung im Dashboard noetig'});
  assert.equal(s.state.pmc.sepa_debit.display_preference.value, 'on');
  assert.equal(s.state.pmc.paypal.display_preference.value, 'off', 'nicht freigeschaltete Methode bleibt aus');
  assert.equal(s.state.pmc.link.display_preference.value, 'on');
  const again = await setupStripeLive({key: LIVE_KEY, approved: 'true', apiOrigin: API, fetchImpl: s.fetchImpl, log: () => {}});
  assert.equal(again.paymentMethods.find(m => m.key === 'sepa_debit').state, 'aktiv', 'idempotent');
});

test('Zahlungsmethoden: fehlendes Recht des Schluessels bricht die Einrichtung nicht ab', async () => {
  const s = fakeStripe({pmcStatus: 403});
  const logs = [];
  const r = await setupStripeLive({key: LIVE_KEY, approved: 'true', apiOrigin: API, fetchImpl: s.fetchImpl, log: m => logs.push(m)});
  assert.ok(r.prices.length === 1 && r.webhookId, 'Produkt, Preis, Webhook trotzdem eingerichtet');
  assert.ok(r.paymentMethods.every(m => m.state === 'unbekannt'));
  assert.ok(logs.some(l => /im Stripe-Dashboard pruefen/.test(l)));
});

test('Zahlungsmethoden: Probelauf schaltet nichts ein', async () => {
  const s = fakeStripe();
  const r = await setupStripeLive({key: LIVE_KEY, approved: 'true', apiOrigin: API, fetchImpl: s.fetchImpl, dryRun: true, log: () => {}});
  assert.equal(r.paymentMethods.find(m => m.key === 'sepa_debit').state, 'wird eingeschaltet');
  assert.equal(s.state.pmc.sepa_debit.display_preference.value, 'off');
});

test('Preis aus der Tarifverwaltung: kein neuer Preis, keine Preiszeile', async () => {
  const s = fakeStripe();
  s.state.products.set('vu_pro', {id: 'vu_pro', name: 'Vision Universe Pro', description: LIVE_CATALOG[0].description, active: true, livemode: true});
  s.state.prices.push({id: 'price_verwaltet', product: 'vu_pro', unit_amount: 490, currency: 'eur', tax_behavior: 'inclusive',
    recurring: {interval: 'month', interval_count: 1}, lookup_key: 'vu_pro_month', active: true, livemode: true,
    metadata: {vu_change_id: 'pc_' + 'a'.repeat(32)}});
  const r = await setupStripeLive({key: LIVE_KEY, approved: 'true', apiOrigin: API, fetchImpl: s.fetchImpl, log: () => {}});
  assert.equal(s.state.prices.length, 1, 'nichts angelegt');
  assert.equal(s.state.prices[0].unit_amount, 490);
  assert.deepEqual(r.prices, [], 'keine Preiszeile');
});
