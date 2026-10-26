// Stripe-LIVE-Einrichtung ohne Netz: nachgebildetes Stripe (livemode=true).
import test from 'node:test';
import assert from 'node:assert/strict';
import {setupStripeLive, assertLiveKey, parseLivePrices, livePriceSql} from '../stripe-live-setup.mjs';
import {WEBHOOK_EVENTS} from '../stripe-test-setup.mjs';

const LIVE_KEY = ['rk', 'live', 'abc123'].join('_');
const API = 'https://konto.visionuniverse.de';
const PRICES = {plus_month: 990, plus_year: 9900, pro_month: 1990, pro_year: 19900};
const json = (status, body) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});

function fakeStripe() {
  const state = {products: new Map(), prices: [], portals: [], hooks: [], calls: []};
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
      const pr = {id: form.get('id'), name: form.get('name'), livemode: true};
      state.products.set(pr.id, pr);
      return json(200, pr);
    }
    if (method === 'GET' && p === '/v1/prices') {
      return json(200, {data: state.prices.filter(x => x.lookup_key === form.get('lookup_keys[0]') && x.active)});
    }
    if (method === 'POST' && p === '/v1/prices') {
      const pr = {id: `price_live${++n}`, product: form.get('product'), unit_amount: Number(form.get('unit_amount')), currency: form.get('currency'),
        tax_behavior: form.get('tax_behavior'), recurring: {interval: form.get('recurring[interval]')}, lookup_key: form.get('lookup_key'),
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
      return json(200, c);
    }
    if (method === 'GET' && p === '/v1/webhook_endpoints') return json(200, {data: state.hooks});
    if (method === 'POST' && p === '/v1/webhook_endpoints') {
      const h = {id: `we_live${++n}`, url: form.get('url'), secret: 'whsec_' + 'geheim', livemode: true,
        events: [...form.entries()].filter(([k]) => k.startsWith('enabled_events')).map(([, v]) => v)};
      state.hooks.push(h);
      return json(200, h);
    }
    if (method === 'POST' && p.startsWith('/v1/webhook_endpoints/')) return json(200, state.hooks.find(h => h.id === p.split('/').pop()));
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

test('Preise nur als vollstaendige Owner-Vorgabe', () => {
  assert.equal(parseLivePrices(''), null);
  assert.equal(parseLivePrices(undefined), null);
  assert.deepEqual(parseLivePrices(JSON.stringify(PRICES)), PRICES);
  assert.throws(() => parseLivePrices('{"plus_month":990}'), /genau/);
  assert.throws(() => parseLivePrices(JSON.stringify({...PRICES, pro_year: 199.5})), /ungueltig/);
  assert.throws(() => parseLivePrices(JSON.stringify({...PRICES, pro_year: 0})), /ungueltig/);
  assert.throws(() => parseLivePrices('kein json'), /JSON/);
});

test('ohne Preise: nur Produkte und Webhook, kein Portal, keine Preise', async () => {
  const s = fakeStripe();
  const r = await setupStripeLive({key: LIVE_KEY, approved: 'true', apiOrigin: API, fetchImpl: s.fetchImpl, log: () => {}});
  assert.deepEqual([...s.state.products.keys()], ['vu_plus', 'vu_pro']);
  assert.equal(s.state.prices.length, 0);
  assert.equal(s.state.portals.length, 0);
  assert.equal(r.prices.length, 0);
  assert.equal(r.portalId, null);
  assert.equal(s.state.hooks.length, 1);
  assert.equal(s.state.hooks[0].url, `${API}/v1/billing/webhook/stripe`);
  assert.deepEqual(s.state.hooks[0].events, [...WEBHOOK_EVENTS]);
  assert.equal(r.webhookSecret.startsWith('whsec_'), true);
});

test('mit Preisen: vier Preise inkl. USt, Portal, idempotent', async () => {
  const s = fakeStripe();
  const first = await setupStripeLive({key: LIVE_KEY, approved: 'true', apiOrigin: API, prices: PRICES, fetchImpl: s.fetchImpl, log: () => {}});
  assert.equal(first.prices.length, 4);
  assert.ok(s.state.prices.every(p => p.tax_behavior === 'inclusive' && p.currency === 'eur'));
  assert.equal(s.state.prices.find(p => p.lookup_key === 'vu_pro_year').unit_amount, 19900);
  assert.ok(first.portalId);
  const calls = s.state.calls.length;
  const second = await setupStripeLive({key: LIVE_KEY, approved: 'true', apiOrigin: API, prices: PRICES, fetchImpl: s.fetchImpl, log: () => {}});
  assert.equal(s.state.prices.length, 4, 'keine doppelten Preise');
  assert.equal(s.state.hooks.length, 1, 'kein zweiter Webhook');
  assert.equal(second.webhookSecret, null, 'Geheimnis nur beim Anlegen');
  assert.ok(s.state.calls.length > calls);
  const sql = livePriceSql(first.prices);
  assert.match(sql, /\('plus_month_live', 'plus', 'stripe', 'price_live\d+', 'month', 'EUR', 990, true, true\)/);
  assert.doesNotMatch(sql, /livemode = false/);
});

test('Probelauf legt nichts an', async () => {
  const s = fakeStripe();
  await setupStripeLive({key: LIVE_KEY, approved: 'true', apiOrigin: API, prices: PRICES, fetchImpl: s.fetchImpl, dryRun: true, log: () => {}});
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
