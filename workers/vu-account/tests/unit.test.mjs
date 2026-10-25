// Einheitstests ohne Datenbank: Signaturen, Tokens, Adapter, Konfiguration, HTTP.
import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {verifyStripeSignature, signStripePayload, formEncode, StripeError} from '../src/stripe.mjs';
import {formDecode} from '../../../scripts/account/sim/fake-stripe.mjs';
import {verifyAccessToken, createJwksCache, JwtError} from '../src/jwt.mjs';
import {base64UrlEncode} from '../src/crypto.mjs';
import {loadConfig, billingBlocker, stripeKeyMode} from '../src/config.mjs';
import {normalizeStripeSubscription, normalizeStripeInvoice} from '../src/providers/stripe-adapter.mjs';
import {normalizeAppleTransaction, normalizeGoogleSubscription} from '../src/providers/store-adapters.mjs';
import {subscriptionGrantsAccess, featureDecision} from '../src/entitlements.mjs';
import {cookie, assertCsrf, HttpError} from '../src/http.mjs';
import * as v from '../src/validate.mjs';
import {createApp} from '../src/index.mjs';

const SECRET = 'whsec_unit_test_secret';

test('Stripe-Signatur: gueltig, mehrere v1, Toleranz, falsches Geheimnis, veraenderter Koerper', async () => {
  const body = JSON.stringify({id: 'evt_123', type: 'invoice.paid', data: {object: {}}});
  const now = Date.UTC(2026, 9, 25, 12) ;
  const ts = Math.floor(now / 1000);
  const header = await signStripePayload(body, SECRET, ts);
  assert.equal((await verifyStripeSignature(body, header, SECRET, {now})).id, 'evt_123');
  // Rotation: ein alter und ein neuer v1-Wert
  assert.ok(await verifyStripeSignature(body, `t=${ts},v1=${'0'.repeat(64)},${header.split(',')[1]}`, SECRET, {now}));
  const reject = async (b, h, s, code, at = now) => {
    await assert.rejects(verifyStripeSignature(b, h, s, {now: at}), e => e instanceof StripeError && e.code === code);
  };
  await reject(body, header, SECRET, 'SIGNATURE_TIMESTAMP_OUT_OF_TOLERANCE', now + 301_000);
  await reject(body, header, 'whsec_other', 'SIGNATURE_INVALID');
  await reject(body.replace('invoice.paid', 'invoice.voided'), header, SECRET, 'SIGNATURE_INVALID');
  await reject(body, '', SECRET, 'SIGNATURE_HEADER_INVALID');
  await reject(body, `t=${ts}`, SECRET, 'SIGNATURE_HEADER_INVALID');
  await reject(body, header, '', 'WEBHOOK_SECRET_MISSING');
  const notEvent = '{"id":"cus_1","type":"x"}';
  await reject(notEvent, await signStripePayload(notEvent, SECRET, ts), SECRET, 'PAYLOAD_INVALID');
});

test('Formularkodierung wie Stripe und zurueck', () => {
  const params = {mode: 'subscription', line_items: [{price: 'price_1', quantity: 1}], metadata: {vu_user_id: 'u'},
    expand: ['items.data.price'], skip: undefined};
  const text = formEncode(params).toString();
  assert.match(text, /line_items%5B0%5D%5Bprice%5D=price_1/);
  assert.deepEqual(formDecode(text), {mode: 'subscription', line_items: [{price: 'price_1', quantity: '1'}],
    metadata: {vu_user_id: 'u'}, expand: ['items.data.price']});
});

async function signer() {
  const {publicKey, privateKey} = await webcrypto.subtle.generateKey({name: 'ECDSA', namedCurve: 'P-256'}, true, ['sign', 'verify']);
  const jwk = {...(await webcrypto.subtle.exportKey('jwk', publicKey)), kid: 'k1', alg: 'ES256'};
  const sign = async (claims, header = {alg: 'ES256', kid: 'k1', typ: 'JWT'}) => {
    const h = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
    const p = base64UrlEncode(new TextEncoder().encode(JSON.stringify(claims)));
    const s = await webcrypto.subtle.sign({name: 'ECDSA', hash: 'SHA-256'}, privateKey, new TextEncoder().encode(`${h}.${p}`));
    return `${h}.${p}.${base64UrlEncode(s)}`;
  };
  let fetches = 0;
  const jwks = createJwksCache({url: 'https://x/jwks', fetchImpl: async () => { fetches++; return new Response(JSON.stringify({keys: [jwk]})); }});
  return {sign, jwks, fetches: () => fetches};
}

test('Zugriffstoken: ES256 ueber JWKS, Ablauf, Aussteller, Rolle, alg none, HS256 ohne Freigabe', async () => {
  const {sign, jwks, fetches} = await signer();
  const now = Date.UTC(2026, 9, 25);
  const t = Math.floor(now / 1000);
  const issuer = 'https://proj.supabase.co/auth/v1';
  const good = {iss: issuer, aud: 'authenticated', role: 'authenticated', sub: '0d3a3c3e-1111-4222-8333-444455556666', exp: t + 600};
  const opts = {jwks, issuer, now};
  assert.equal((await verifyAccessToken(await sign(good), opts)).sub, good.sub);
  await verifyAccessToken(await sign(good), opts);
  assert.equal(fetches(), 1, 'JWKS wird zwischengespeichert');
  const bad = async (claims, code, header) => assert.rejects(verifyAccessToken(await sign(claims, header), opts),
    e => e instanceof JwtError && e.message === code);
  await bad({...good, exp: t - 60}, 'TOKEN_EXPIRED');
  await bad({...good, iss: 'https://evil.example/auth/v1'}, 'ISSUER_INVALID');
  await bad({...good, aud: 'other'}, 'AUDIENCE_INVALID');
  await bad({...good, role: 'service_role'}, 'ROLE_INVALID');
  await bad({...good, sub: 'admin'}, 'SUBJECT_INVALID');
  await bad({...good, is_anonymous: true}, 'ANONYMOUS_NOT_ALLOWED');
  await bad(good, 'KEY_UNKNOWN', {alg: 'ES256', kid: 'unbekannt'});
  // Unsigniertes Token und HS256 ohne ausdrueckliches Legacy-Geheimnis
  const none = (await sign(good)).split('.').slice(0, 2).join('.') + '.';
  const noneHeader = base64UrlEncode(new TextEncoder().encode('{"alg":"none"}')) + '.' + none.split('.')[1] + '.';
  await assert.rejects(verifyAccessToken(noneHeader, opts), /ALG_NOT_ALLOWED/);
  await bad(good, 'ALG_NOT_ALLOWED', {alg: 'HS256'});
  // Nutzlast nach dem Signieren veraendert
  const [h, , s] = (await sign(good)).split('.');
  const forged = base64UrlEncode(new TextEncoder().encode(JSON.stringify({...good, sub: '99999999-1111-4222-8333-444455556666'})));
  await assert.rejects(verifyAccessToken(`${h}.${forged}.${s}`, opts), /SIGNATURE_INVALID/);
});

test('Konfiguration: Testmodus-Sperre fuer Live-Schluessel', () => {
  assert.equal(stripeKeyMode('sk_test_abc'), 'test');
  assert.equal(stripeKeyMode('rk_live_abc'), 'live');
  assert.equal(stripeKeyMode('pk_test_abc'), 'invalid');
  const base = {SUPABASE_URL: 'https://p.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x', SUPABASE_SECRET_KEY: 'sb_secret_x',
    VU_ACCOUNT_API_ORIGIN: 'https://account.visionuniverse.de', STRIPE_WEBHOOK_SECRET: 'whsec_x'};
  assert.equal(billingBlocker(loadConfig({...base, STRIPE_SECRET_KEY: 'sk_test_1'})), null);
  assert.equal(billingBlocker(loadConfig({...base, STRIPE_SECRET_KEY: 'sk_live_1'})), 'BILLING_LIVE_MODE_NOT_APPROVED');
  assert.equal(billingBlocker(loadConfig({...base, STRIPE_SECRET_KEY: 'sk_live_1', STRIPE_LIVE_MODE_APPROVED: 'true'})), null);
  assert.equal(billingBlocker(loadConfig({...base, STRIPE_SECRET_KEY: 'pk_live_1'})), 'BILLING_KEY_INVALID');
  assert.equal(billingBlocker(loadConfig({...base, STRIPE_SECRET_KEY: 'sk_test_1', STRIPE_WEBHOOK_SECRET: ''})), 'BILLING_WEBHOOK_NOT_CONFIGURED');
  assert.equal(billingBlocker(loadConfig({STRIPE_SECRET_KEY: 'sk_test_1'})), 'ACCOUNTS_NOT_CONFIGURED');
  const cfg = loadConfig({...base, VU_REGISTRATION_ALLOWLIST: 'A@x.de, b@y.de'});
  assert.equal(cfg.registration.enabled, false, 'Registrierung standardmaessig geschlossen');
  assert.ok(cfg.registration.allowlist.has('a@x.de'));
  assert.equal(cfg.siteOrigin, 'https://research.visionuniverse.de');
});

const basilSubscription = (over = {}) => ({id: 'sub_ABCDEF1', object: 'subscription', customer: 'cus_ABCDEF1', status: 'active',
  livemode: false, cancel_at_period_end: false, metadata: {vu_user_id: 'u1'},
  items: {data: [{price: {id: 'price_test_plus_month'}, current_period_start: 1761350400, current_period_end: 1763942400}]}, ...over});

test('Stripe-Adapter: neue und alte API-Form, Statusabbildung, eine Position je Abo', () => {
  const s = normalizeStripeSubscription(basilSubscription(), {stateAt: '2026-10-25T00:00:00.000Z'});
  assert.equal(s.provider_price_id, 'price_test_plus_month');
  assert.equal(s.current_period_end, '2025-11-24T00:00:00.000Z');
  assert.equal(s.claimed_user_id, 'u1');
  const legacy = basilSubscription({current_period_end: 1763942400, items: {data: [{price: 'price_test_plus_month'}]}});
  assert.equal(normalizeStripeSubscription(legacy, {stateAt: 'x'}).current_period_end, '2025-11-24T00:00:00.000Z');
  assert.equal(normalizeStripeSubscription(basilSubscription({status: 'incomplete_expired'}), {stateAt: 'x'}).status, 'expired');
  assert.throws(() => normalizeStripeSubscription(basilSubscription({status: 'mystery'}), {stateAt: 'x'}), /STATUS_UNKNOWN/);
  assert.throws(() => normalizeStripeSubscription(basilSubscription({items: {data: [{price: 'a'}, {price: 'b'}]}}), {stateAt: 'x'}), /MULTIPLE_ITEMS/);
  const inv = normalizeStripeInvoice({id: 'in_ABCDEF1', object: 'invoice', customer: 'cus_ABCDEF1', status: 'paid', currency: 'eur',
    hosted_invoice_url: 'javascript:alert(1)', invoice_pdf: 'https://pay.stripe.com/x.pdf',
    parent: {subscription_details: {subscription: 'sub_ABCDEF1'}}, status_transitions: {paid_at: 1761350400}}, {stateAt: 'x'});
  assert.equal(inv.provider_subscription_id, 'sub_ABCDEF1');
  assert.equal(inv.hosted_invoice_url, null, 'nur https-Links');
  assert.equal(inv.currency, 'EUR');
  assert.equal(normalizeStripeInvoice({id: 'in_1', object: 'invoice', subscription: 'sub_OLD123'}, {stateAt: 'x'}).provider_subscription_id, 'sub_OLD123');
});

test('Apple- und Google-Normalisierer liefern denselben Schnappschuss', () => {
  const signed = Date.UTC(2026, 9, 25);
  const apple = normalizeAppleTransaction({notificationType: 'DID_RENEW', signedDateMs: signed,
    transaction: {originalTransactionId: '2000000001', productId: 'de.visionuniverse.plus.monthly', purchaseDate: signed - 1000,
      expiresDate: signed + 30 * 864e5, appAccountToken: 'u1', environment: 'Sandbox'}, renewal: {autoRenewStatus: 1}});
  assert.deepEqual([apple.provider, apple.status, apple.livemode, apple.claimed_user_id], ['apple', 'active', false, 'u1']);
  const grace = normalizeAppleTransaction({notificationType: 'DID_FAIL_TO_RENEW', subtype: 'GRACE_PERIOD', signedDateMs: signed,
    transaction: {originalTransactionId: '1', productId: 'p', expiresDate: signed + 1000}, renewal: {gracePeriodExpiresDate: signed + 6 * 864e5}});
  assert.equal(grace.status, 'in_grace_period');
  assert.equal(normalizeAppleTransaction({signedDateMs: signed, transaction: {originalTransactionId: '1', productId: 'p',
    expiresDate: signed + 1000, revocationDate: signed}}).status, 'revoked');
  const google = normalizeGoogleSubscription({purchaseTokenHash: 'abc', eventTimeMs: signed, testPurchase: true,
    purchase: {subscriptionState: 'SUBSCRIPTION_STATE_ON_HOLD', lineItems: [{productId: 'plus', offerDetails: {basePlanId: 'monthly'},
      expiryTime: '2026-11-25T00:00:00Z'}], externalAccountIdentifiers: {obfuscatedExternalAccountId: 'u1'}}});
  assert.deepEqual([google.status, google.provider_price_id, google.livemode], ['on_hold', 'plus:monthly', false]);
});

test('Zugriffsregel und Funktionsentscheid', () => {
  const at = Date.UTC(2026, 9, 25);
  const day = 864e5;
  const iso = ms => new Date(ms).toISOString();
  assert.equal(subscriptionGrantsAccess({status: 'active', current_period_end: iso(at - day)}, at), true);
  assert.equal(subscriptionGrantsAccess({status: 'active', current_period_end: iso(at - 3 * day)}, at), false);
  assert.equal(subscriptionGrantsAccess({status: 'past_due', current_period_end: iso(at - 6 * day)}, at), true);
  assert.equal(subscriptionGrantsAccess({status: 'past_due', current_period_end: iso(at - 8 * day)}, at), false);
  assert.equal(subscriptionGrantsAccess({status: 'canceled', current_period_end: iso(at + day)}, at), false);
  const ent = {plan_id: 'plus', features: {'watchlist.items': 100, 'quant.screener.full': true, 'export.csv': 0}};
  assert.deepEqual(featureDecision(ent, 'quant.screener.full'), {allowed: true, limit: null, plan: 'plus'});
  assert.deepEqual(featureDecision(ent, 'watchlist.items'), {allowed: true, limit: 100, plan: 'plus'});
  assert.equal(featureDecision(ent, 'export.csv').allowed, false);
  assert.equal(featureDecision(ent, 'supertrader.signals').allowed, false);
  assert.equal(featureDecision(null, 'x').plan, 'free');
});

test('Cookies: __Host-, HttpOnly, Secure, SameSite=Lax; CSRF-Regeln', () => {
  const cfg = loadConfig({VU_SITE_ORIGIN: 'https://research.visionuniverse.de'});
  const c = cookie(cfg, 'vu_rt', 'abc', 60);
  for (const part of ['__Host-vu_rt=abc', 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Secure', 'Max-Age=60']) assert.ok(c.includes(part), part);
  assert.ok(!/Domain=/i.test(c), '__Host- verbietet Domain');
  const req = (method, headers) => new Request('https://a/v1/x', {method, headers});
  assert.doesNotThrow(() => assertCsrf(req('POST', {Origin: 'https://research.visionuniverse.de', 'X-VU-Client': 'web'}), cfg, {bearer: false}));
  assert.throws(() => assertCsrf(req('POST', {Origin: 'https://evil.example', 'X-VU-Client': 'web'}), cfg, {bearer: false}), HttpError);
  assert.throws(() => assertCsrf(req('POST', {Origin: 'https://research.visionuniverse.de'}), cfg, {bearer: false}), /CLIENT_HEADER_REQUIRED/);
  assert.throws(() => assertCsrf(req('POST', {}), cfg, {bearer: false}), /ORIGIN_NOT_ALLOWED/);
  assert.doesNotThrow(() => assertCsrf(req('POST', {}), cfg, {bearer: true}));
});

test('Eingaben: Passwortregeln, E-Mail, Einstellungen nur aus der Positivliste', () => {
  assert.throws(() => v.password('kurz1A!'), /PASSWORD_LENGTH/);
  assert.throws(() => v.password('nurkleinbuchstaben'), /PASSWORD_WEAK/);
  assert.throws(() => v.password('Ä'.repeat(40) + 'a1'), /PASSWORD_LENGTH/, '72-Byte-Grenze');
  assert.equal(v.password('Sicheres-Passwort-26'), 'Sicheres-Passwort-26');
  assert.equal(v.email(' Max@Example.DE '), 'max@example.de');
  assert.throws(() => v.email('max@'), /EMAIL_INVALID/);
  assert.throws(() => v.email('a@b.de<script>'), /EMAIL_INVALID/);
  assert.throws(() => v.settingsPatch({user_id: 'x'}), /SETTING_INVALID/);
  assert.throws(() => v.settingsPatch({notification_settings: {FREE_MONEY: true}}), /SETTING_INVALID/);
  assert.equal(v.displayName('  <b>Max</b> '), 'bMax/b');
  assert.throws(() => v.priceKey('plus_month; drop table'), /PRICE_INVALID/);
});

test('Geheimnis-Scanner schlaegt an, Simulationswerte nicht', async () => {
  const {findSecrets} = await import('../../../scripts/account/assert-no-billing-secrets.mjs');
  assert.deepEqual(findSecrets('STRIPE_SECRET_KEY=sk_live_' + 'a1B2c3D4e5F6g7H8i9J0k1L2'), ['Stripe-Geheimschluessel']);
  assert.deepEqual(findSecrets('whsec_' + 'Zz9Yy8Xx7Ww6Vv5Uu4Tt3Ss2'), ['Stripe-Webhook-Geheimnis']);
  assert.deepEqual(findSecrets('sb_secret_' + 'abcdEFGH12345678xyz'), ['Supabase-Secret-Key']);
  assert.deepEqual(findSecrets("'sk_test_local_simulation' 'whsec_local_simulation' 'sb_secret_local_simulation'"), []);
});

test('Worker ohne Konfiguration: Gesundheit ja, Kontofunktionen 503, Store-Webhooks 501', async () => {
  const app = createApp({env: {}, fetchImpl: () => { throw new Error('kein Netz'); }, log: () => {}});
  const call = (method, path, headers = {}) => app.handle(new Request('https://account.example' + path, {method, headers}));
  assert.equal((await call('GET', '/v1/health')).status, 200);
  const me = await call('GET', '/v1/me');
  assert.equal(me.status, 503);
  assert.equal((await me.json()).state, 'ACCOUNTS_NOT_CONFIGURED');
  assert.equal((await call('GET', '/v1/unbekannt')).status, 404);
  assert.equal((await call('DELETE', '/v1/me')).status, 405);
  assert.equal((await call('POST', '/v1/billing/webhook/apple')).status, 501);
  const res = await call('GET', '/v1/health', {Origin: 'https://evil.example'});
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), null, 'kein CORS fuer fremde Herkunft');
  assert.equal(res.headers.get('X-Frame-Options'), 'DENY');
  assert.equal((await call('OPTIONS', '/v1/me', {Origin: 'https://evil.example'})).status, 403);
  const ok = await call('OPTIONS', '/v1/me', {Origin: 'https://research.visionuniverse.de'});
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('Access-Control-Allow-Credentials'), 'true');
});
