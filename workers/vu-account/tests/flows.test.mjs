// Integrationstests ueber die ganze Kette:
//   Browser (Cookie-Speicher) -> Worker vu-account -> simuliertes Supabase Auth
//   -> ECHTES PostgreSQL (Migrationen, RLS, billing_*) und simuliertes Stripe
//   mit signierten Webhooks. Kein Netzwerk, keine echten Konten, keine Zahlungen.
//
// Braucht PG_TEST_URL (Superuser-Verbindung zu einem Wegwerf-PostgreSQL).
// Fehlt sie, wird die Datei ausdruecklich uebersprungen (in CI ist sie gesetzt).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createEnvironment} from '../../../scripts/account/sim/environment.mjs';
import {subscriptionGrantsAccess} from '../src/entitlements.mjs';
import {LOCAL_KEYS} from '../../../scripts/account/sim/fake-supabase.mjs';

const skip = process.env.PG_TEST_URL ? false : 'PG_TEST_URL fehlt - Integrationstests uebersprungen';
const PASSWORD = 'Sicheres-Passwort-26';

async function register(env, browser, email, extra = {}) {
  const res = await browser.post('/v1/auth/signup', {email, password: PASSWORD, acceptTerms: true, displayName: 'Testperson', ...extra});
  assert.equal(res.status, 202, JSON.stringify(res.data));
  const mail = env.supabase.lastMail(email);
  assert.ok(mail, 'Bestaetigungs-E-Mail verschickt');
  const verify = await env.supabase.handle(new Request(mail.link));
  return {verify, mail, location: verify.headers.get('Location')};
}

async function signedIn(env, email) {
  const browser = env.browser();
  const {location} = await register(env, browser, email);
  const cb = await browser.open(location);
  assert.equal(cb.status, 303);
  assert.equal(cb.location, env.site + '/konto/?status=verified');
  return browser;
}

async function subscribe(env, browser, price = 'plus_month') {
  const res = await browser.post('/v1/billing/checkout', {price});
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const sessionId = res.data.url.split('/').pop();
  const sub = env.stripe.sim.completeCheckout(sessionId);
  const deliveries = await env.deliverWebhooks();
  assert.ok(deliveries.every(d => d.status === 200), JSON.stringify(deliveries));
  return sub;
}

test('Konten und Abos Ende-zu-Ende', {skip}, async t => {
  const env = await createEnvironment();
  t.after(() => env.close());

  await t.test('Registrierung, Bestaetigung, Sitzung ohne Token im Browser', async () => {
    const browser = env.browser();
    const {location, mail} = await register(env, browser, 'anna@example.test');
    assert.match(mail.link, /redirect_to=https%3A%2F%2Faccount\.sim%2Fv1%2Fauth%2Fcallback/);
    assert.ok(browser.jar.has('__Host-vu_pkce'), 'PKCE-Pruefwert im HttpOnly-Cookie');
    assert.match(location, /^https:\/\/account\.sim\/v1\/auth\/callback\?flow=signup&code=/);
    const cb = await browser.open(location);
    assert.equal(cb.location, 'https://research.sim/konto/?status=verified');
    assert.ok(browser.jar.has('__Host-vu_at') && browser.jar.has('__Host-vu_rt'));
    assert.ok(!browser.jar.has('__Host-vu_pkce'), 'Pruefwert verbraucht');
    const me = await browser.get('/v1/me');
    assert.equal(me.status, 200);
    assert.equal(me.data.profile.displayName, 'Testperson');
    assert.equal(me.data.entitlements.plan_id, 'free');
    assert.deepEqual(me.data.roles, ['user']);
    assert.ok(!JSON.stringify(me.data).includes('eyJ'), 'kein JWT in der Antwort');
  });

  await t.test('Bestaetigungslink auf anderem Geraet und abgelaufener Link', async () => {
    const browser = env.browser();
    const {location} = await register(env, browser, 'ben@example.test');
    const other = env.browser();
    const cb = await other.open(location);
    assert.equal(cb.location, 'https://research.sim/konto/anmelden/?status=verified_other_device');
    const login = await other.post('/v1/auth/login', {email: 'ben@example.test', password: PASSWORD});
    assert.equal(login.status, 200, 'Adresse ist trotzdem bestaetigt');
    // Das zweite Geraet hatte keinen Pruefwert und hat den Code nicht verbraucht: das erste meldet sich an.
    const verifier = browser.jar.get('__Host-vu_pkce');
    assert.equal((await browser.open(location)).location, 'https://research.sim/konto/?status=verified');
    browser.jar.set('__Host-vu_pkce', verifier);
    const reused = await browser.open(location);
    assert.equal(reused.location, 'https://research.sim/konto/anmelden/?status=link_expired', 'Code nur einmal');
    const junk = await browser.open('https://account.sim/v1/auth/callback?flow=signup&code=<script>');
    assert.equal(junk.location, 'https://research.sim/konto/anmelden/?status=link_invalid');
    const redirect = await browser.open('https://account.sim/v1/auth/callback?flow=signup&code=abcdefgh123&redirect=https://evil.example');
    assert.ok(redirect.location.startsWith('https://research.sim/'), 'kein offener Redirect');
  });

  await t.test('Login: falsches Passwort, unbestaetigt, Herkunft und CSRF-Kopf', async () => {
    const browser = env.browser();
    await browser.post('/v1/auth/signup', {email: 'carla@example.test', password: PASSWORD, acceptTerms: true});
    assert.equal((await browser.post('/v1/auth/login', {email: 'carla@example.test', password: PASSWORD})).data.state, 'EMAIL_NOT_CONFIRMED');
    assert.equal((await browser.post('/v1/auth/login', {email: 'anna@example.test', password: 'Falsches-Passwort-1'})).status, 401);
    assert.equal((await browser.post('/v1/auth/login', {email: 'niemand@example.test', password: PASSWORD})).data.state, 'INVALID_CREDENTIALS',
      'unbekannte Adresse = gleiche Antwort');
    assert.equal((await browser.post('/v1/auth/login', {email: 'anna@example.test', password: PASSWORD}, {origin: 'https://evil.example'})).status, 403);
    assert.equal((await browser.post('/v1/auth/login', {email: 'anna@example.test', password: PASSWORD}, {headers: {'X-VU-Client': ''}})).status, 403);
    const ok = await browser.post('/v1/auth/login', {email: 'anna@example.test', password: PASSWORD});
    assert.equal(ok.status, 200);
    assert.ok(!('access_token' in ok.data) && !('refresh_token' in ok.data));
    for (const c of ok.headers.getSetCookie()) assert.match(c, /HttpOnly; SameSite=Lax; Max-Age=\d+; Secure/);
  });

  await t.test('Registrierung geschlossen, ausser Positivliste', async () => {
    const closed = await createEnvironment({envOverrides: {VU_REGISTRATION_ENABLED: 'false', VU_REGISTRATION_ALLOWLIST: 'tester@example.test'}});
    try {
      const b = closed.browser();
      const denied = await b.post('/v1/auth/signup', {email: 'fremd@example.test', password: PASSWORD, acceptTerms: true});
      assert.deepEqual([denied.status, denied.data.state], [403, 'REGISTRATION_CLOSED']);
      assert.equal(closed.supabase.outbox.length, 0, 'keine E-Mail, kein Konto');
      assert.equal((await b.post('/v1/auth/signup', {email: 'tester@example.test', password: PASSWORD, acceptTerms: true})).status, 202);
      assert.equal((await b.post('/v1/auth/signup', {email: 'tester2@example.test', password: 'schwach', acceptTerms: true})).status, 403);
    } finally { await closed.close(); }
    const b = env.browser();
    assert.equal((await b.post('/v1/auth/signup', {email: 'dora@example.test', password: PASSWORD})).data.state, 'TERMS_REQUIRED');
    assert.equal((await b.post('/v1/auth/signup', {email: 'dora@example.test', password: 'kurzesPW1', acceptTerms: true})).data.state, 'PASSWORD_LENGTH');
  });

  await t.test('Sitzung erneuert sich still, alte Erneuerungstoken sind wertlos, Logout', async () => {
    const browser = env.browser();
    await browser.post('/v1/auth/login', {email: 'anna@example.test', password: PASSWORD});
    const oldRefresh = browser.jar.get('__Host-vu_rt');
    env.advance(2 * 3600 * 1000);
    const s = await browser.get('/v1/session');
    assert.equal(s.data.authenticated, true);
    assert.notEqual(browser.jar.get('__Host-vu_rt'), oldRefresh, 'rotiert');
    const thief = env.browser();
    thief.jar.set('__Host-vu_rt', oldRefresh);
    assert.equal((await thief.get('/v1/session')).data.authenticated, false);
    assert.equal((await thief.get('/v1/me')).status, 401);
    await browser.post('/v1/auth/logout');
    assert.equal((await browser.get('/v1/session')).data.authenticated, false);
    assert.equal(browser.jar.size, 0);
  });

  await t.test('Passwort vergessen: gleiche Antwort, Link setzt neues Passwort ohne altes', async () => {
    const b = env.browser();
    assert.equal((await b.post('/v1/auth/recover', {email: 'niemand@example.test'})).status, 202);
    assert.equal(env.supabase.lastMail('niemand@example.test'), null);
    assert.equal((await b.post('/v1/auth/recover', {email: 'anna@example.test'})).status, 202);
    const mail = env.supabase.lastMail('anna@example.test');
    assert.equal(mail.type, 'recovery');
    const verify = await env.supabase.handle(new Request(mail.link));
    const cb = await b.open(verify.headers.get('Location'));
    assert.equal(cb.location, 'https://research.sim/konto/passwort-neu/');
    const changed = await b.post('/v1/auth/password', {password: 'Neues-Passwort-2026'});
    assert.equal(changed.status, 200, JSON.stringify(changed.data));
    assert.equal((await env.browser().post('/v1/auth/login', {email: 'anna@example.test', password: PASSWORD})).status, 401);
    assert.equal((await env.browser().post('/v1/auth/login', {email: 'anna@example.test', password: 'Neues-Passwort-2026'})).status, 200);
  });

  await t.test('Passwortwechsel in normaler Sitzung verlangt das aktuelle Passwort', async () => {
    const b = env.browser();
    await b.post('/v1/auth/login', {email: 'ben@example.test', password: PASSWORD});
    assert.equal((await b.post('/v1/auth/password', {password: 'Anderes-Passwort-9'})).data.state, 'REAUTHENTICATION_REQUIRED');
    assert.equal((await b.post('/v1/auth/password', {password: 'Anderes-Passwort-9', currentPassword: 'falsch'})).data.state, 'CURRENT_PASSWORD_INVALID');
    assert.equal((await b.post('/v1/auth/password', {password: 'Anderes-Passwort-9', currentPassword: PASSWORD})).status, 200);
  });

  await t.test('Profil und Einstellungen: nur erlaubte Felder, RLS haelt Konten getrennt', async () => {
    const b = await signedIn(env, 'erik@example.test');
    const res = await b.patch('/v1/me', {profile: {displayName: 'Erik'}, settings: {appearance: 'dark', notifications: {EARNINGS: true}}});
    assert.equal(res.status, 200);
    assert.equal(res.data.settings.appearance, 'dark');
    assert.deepEqual(res.data.settings.notifications, {EARNINGS: true});
    assert.equal((await b.patch('/v1/me', {settings: {user_id: 'x'}})).status, 400);
    assert.equal((await b.patch('/v1/me', {profile: {role: 'admin'}})).status, 400);
    const anna = env.browser();
    await anna.post('/v1/auth/login', {email: 'anna@example.test', password: 'Neues-Passwort-2026'});
    assert.equal((await anna.get('/v1/me')).data.settings.appearance, 'system', 'Annas Daten unberuehrt');
  });

  await t.test('Tarife, Checkout, Webhooks, Freischaltung, Rechnung', async () => {
    const plans = await env.browser().get('/v1/plans');
    assert.equal(plans.status, 200);
    assert.deepEqual(plans.data.plans.map(p => p.id), ['free', 'plus', 'pro']);
    assert.equal(plans.data.mode, 'test');
    assert.deepEqual(plans.data.plans[1].prices.map(p => p.key).sort(), ['plus_month', 'plus_year']);
    assert.ok(!JSON.stringify(plans.data).includes('price_test_'), 'Anbieter-IDs bleiben serverseitig');

    const b = await signedIn(env, 'fiona@example.test');
    assert.equal((await b.post('/v1/billing/checkout', {price: 'gratis'})).status, 404);
    const first = await b.post('/v1/billing/checkout', {price: 'plus_month'});
    const again = await b.post('/v1/billing/checkout', {price: 'plus_month'});
    assert.equal(first.data.url, again.data.url, 'Doppelklick -> dieselbe Checkout-Sitzung');
    assert.ok(first.data.url.startsWith('https://checkout.stripe.com/'));
    assert.equal(env.stripe.sim.customers.size >= 1, true);
    const session = env.stripe.sim.sessions.get(first.data.url.split('/').pop());
    assert.match(session.success_url, /^https:\/\/research\.sim\/konto\/abo\/\?checkout=success/);

    // Vor der Zahlung: free.
    assert.equal((await b.get('/v1/me')).data.entitlements.plan_id, 'free');
    env.stripe.sim.completeCheckout(session.id);
    const deliveries = await env.deliverWebhooks();
    assert.deepEqual(deliveries.map(d => d.status), deliveries.map(() => 200));
    const billing = await b.get('/v1/me/billing');
    assert.equal(billing.data.entitlements.plan_id, 'plus');
    assert.equal(billing.data.subscriptions[0].status, 'active');
    assert.equal(billing.data.subscriptions[0].interval, 'month');
    assert.equal(billing.data.invoices[0].status, 'paid');
    assert.equal(billing.data.invoices[0].amountPaid, 990);
    assert.ok(billing.data.invoices[0].url.startsWith('https://'));
    const check = await b.get('/v1/entitlements/check?feature=quant.screener.full');
    assert.deepEqual([check.data.allowed, check.data.plan], [true, 'plus']);
    assert.equal((await b.get('/v1/entitlements/check?feature=export.csv')).data.allowed, false);

    // Zweiter Checkout trotz aktivem Abo -> abgewiesen.
    const twice = await b.post('/v1/billing/checkout', {price: 'pro_month'});
    assert.deepEqual([twice.status, twice.data.state, twice.data.detail.manage], [409, 'ALREADY_SUBSCRIBED', 'portal']);
    const portal = await b.post('/v1/billing/portal');
    assert.ok(portal.data.url.startsWith('https://billing.stripe.com/'));
  });

  await t.test('Webhook: doppelt, alt, gefaelscht, Fremdabo, manipulierte Metadaten', async () => {
    const b = await signedIn(env, 'gerd@example.test');
    const sub = await subscribe(env, b, 'pro_month');
    const evt = env.stripe.sim.events.find(e => e.type === 'invoice.paid' && e.data.object.parent.subscription_details.subscription === sub.id);
    const {delivered, ...payload} = evt;
    const raw = JSON.stringify(payload);
    const {signStripePayload} = await import('../src/stripe.mjs');
    const nowSec = Math.floor(env.now() / 1000);
    const dup = await env.webhook(raw, await signStripePayload(raw, env.stripe.webhookSecret, nowSec));
    assert.deepEqual([dup.status, (await dup.json()).duplicate], [200, true]);
    assert.equal((await env.webhook(raw, await signStripePayload(raw, env.stripe.webhookSecret, nowSec - 3600))).status, 400, 'Replay');
    assert.equal((await env.webhook(raw, await signStripePayload(raw, 'whsec_geraten', nowSec))).status, 400);
    const forged = raw.replace('"paid"', '"void"');
    assert.equal((await env.webhook(forged, await signStripePayload(raw, env.stripe.webhookSecret, nowSec))).status, 400);
    const live = JSON.stringify({...payload, id: 'evt_live_1', livemode: true});
    assert.equal((await env.webhook(live, await signStripePayload(live, env.stripe.webhookSecret, nowSec))).status, 400, 'Livemodus gesperrt');

    // Abo an der Integration vorbei (unbekannter Kunde): aufgezeichnet, niemand bekommt Zugang.
    env.stripe.sim.foreignSubscription();
    const foreign = await env.deliverWebhooks();
    assert.ok(foreign.every(d => d.status === 200 && ['FAILED_PERMANENT', 'IGNORED'].includes(d.body.state)), JSON.stringify(foreign));
    const failed = await env.pg.json(`select json_agg(last_error) from billing.payment_events where status = 'failed'`);
    assert.ok(failed.some(e => /CUSTOMER_NOT_LINKED/.test(e)));

    // Jemand setzt im Stripe-Dashboard die Nutzer-ID eines anderen in die Metadaten.
    const fiona = await env.pg.json(`select to_json(id) from auth.users where email = 'fiona@example.test'`);
    env.stripe.sim.subscriptions.get(sub.id).metadata.vu_user_id = fiona;
    env.stripe.sim.changePrice(sub.id, 'price_test_pro_month');
    const tampered = await env.deliverWebhooks();
    assert.equal(tampered[0].body.state, 'FAILED_PERMANENT');
    assert.ok(env.logs.some(l => l.message === 'WEBHOOK_FAILED' && /SUBSCRIPTION_USER_MISMATCH/.test(l.code)));
    const fionaBrowser = env.browser();
    await fionaBrowser.post('/v1/auth/login', {email: 'fiona@example.test', password: PASSWORD});
    assert.equal((await fionaBrowser.get('/v1/me')).data.entitlements.plan_id, 'plus', 'kein fremdes Pro');
  });

  await t.test('Tarifwechsel, fehlgeschlagene Zahlung, Kulanz, endgueltig unbezahlt', async () => {
    const b = await signedIn(env, 'hanna@example.test');
    const sub = await subscribe(env, b, 'plus_month');
    env.stripe.sim.changePrice(sub.id, 'price_test_pro_year');
    await env.deliverWebhooks();
    let billing = await b.get('/v1/me/billing');
    assert.deepEqual([billing.data.entitlements.plan_id, billing.data.subscriptions[0].interval], ['pro', 'year']);

    env.stripe.sim.renew(sub.id, {paid: false});
    await env.deliverWebhooks();
    billing = await b.get('/v1/me/billing');
    assert.equal(billing.data.subscriptions[0].status, 'past_due');
    assert.equal(billing.data.entitlements.plan_id, 'pro', 'Kulanz waehrend Stripe erneut versucht');
    assert.ok(billing.data.invoices.some(i => i.status === 'open'));

    env.stripe.sim.markUnpaid(sub.id);
    await env.deliverWebhooks();
    billing = await b.get('/v1/me/billing');
    assert.deepEqual([billing.data.subscriptions[0].status, billing.data.entitlements.plan_id], ['unpaid', 'free']);
  });

  await t.test('Kuendigungsbutton: angemeldet zum Periodenende, ohne Anmeldung als Eingang', async () => {
    const b = await signedIn(env, 'ida@example.test');
    const sub = await subscribe(env, b, 'plus_year');
    const res = await b.post('/v1/billing/cancel');
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.state, 'CANCELED_AT_PERIOD_END');
    assert.ok(res.data.confirmationId && res.data.endsAt);
    assert.equal(res.data.emailSent, true);
    const mail = env.lastMailTo('ida@example.test');
    assert.match(mail.subject, /Eingangsbestätigung deiner Kündigung/);
    for (const part of ['Eingang:', 'Bestätigungsnummer: ' + res.data.confirmationId, 'ordentliche Kündigung', 'Vision Universe Plus', 'Dein Vertrag endet am']) {
      assert.ok(mail.text.includes(part), part);
    }
    let billing = await b.get('/v1/me/billing');
    assert.deepEqual([billing.data.subscriptions[0].cancelAtPeriodEnd, billing.data.entitlements.plan_id], [true, 'plus']);
    await env.deliverWebhooks(); // Stripe meldet die Aenderung zusaetzlich - wirkungsgleich
    env.stripe.sim.endPeriod(sub.id);
    await env.deliverWebhooks();
    billing = await b.get('/v1/me/billing');
    assert.deepEqual([billing.data.subscriptions[0].status, billing.data.entitlements.plan_id], ['canceled', 'free']);
    assert.equal((await b.post('/v1/billing/cancel')).status, 404);
    // Nach Ablauf wieder buchbar.
    assert.equal((await b.post('/v1/billing/checkout', {price: 'plus_month'})).status, 200);

    const signedInRow = await env.pg.json(`select to_json(r) from (select source, status, confirmation_status, ends_at is not null as has_end
      from billing.cancellation_requests where id = :'id') r`, {id: res.data.confirmationId});
    assert.deepEqual(signedInRow, {source: 'signed_in', status: 'completed', confirmation_status: 'sent', has_end: true});
  });

  await t.test('Kuendigung ohne Anmeldung: Eingang, Zuordnung, Bestaetigung per E-Mail, keine Kontoauskunft', async () => {
    const row = id => env.pg.json(`select to_json(r) from (select email, kind, status, confirmation_status, provider, ends_at is not null as has_end,
      reason from billing.cancellation_requests where id = :'id') r`, {id});
    const anon = env.browser();
    assert.equal((await anon.post('/v1/billing/cancellation-request', {email: 'kunde@example.test'})).data.state, 'NAME_REQUIRED');

    // Unbekannte Adresse: gleiche Antwort, Bestaetigung an die Adresse, Status "kein Vertrag".
    const unknown = await anon.post('/v1/billing/cancellation-request', {email: 'Kunde@Example.test', fullName: 'K. Unde', reference: 'VU-0042'});
    assert.deepEqual([unknown.status, unknown.data.state, unknown.data.emailSent], [202, 'CANCELLATION_RECEIVED', true]);
    assert.deepEqual(Object.keys(unknown.data).sort(), ['confirmationId', 'emailSent', 'receivedAt', 'state']);
    assert.deepEqual(await row(unknown.data.confirmationId), {email: 'kunde@example.test', kind: 'ordinary', status: 'no_contract',
      confirmation_status: 'sent', provider: null, has_end: false, reason: null});
    assert.match(env.lastMailTo('kunde@example.test').text, /kein laufendes Abonnement gefunden/);

    // Bekannte Adresse mit Abo: Eingang bestaetigt, Zuordnung vorgeschlagen, Abo NICHT angefasst
    // (VU_CANCELLATION_AUTO_PROCESS=false). Ausfuehrung durch eine berechtigte Person.
    const b = await signedIn(env, 'lena@example.test');
    const sub = await subscribe(env, b, 'pro_month');
    const known = await env.browser().post('/v1/billing/cancellation-request', {email: 'lena@example.test', fullName: 'Lena L.'});
    assert.deepEqual(Object.keys(known.data).sort(), Object.keys(unknown.data).sort(), 'Antwort verraet nichts');
    assert.deepEqual(await row(known.data.confirmationId), {email: 'lena@example.test', kind: 'ordinary', status: 'pending_assignment',
      confirmation_status: 'sent', provider: null, has_end: false, reason: null});
    assert.equal(env.stripe.sim.subscriptions.get(sub.id).cancel_at_period_end, false, 'ohne Freigabe kein Eingriff');
    assert.match(env.lastMailTo('lena@example.test').text, /wirksam eingegangen[\s\S]*unverzüglich/);
    const {executeCancellation} = await import('../src/cancellation.mjs');
    await assert.rejects(executeCancellation(env.app.deps, known.data.confirmationId, {}), /OPERATOR_REQUIRED/);
    const done = await executeCancellation(env.app.deps, known.data.confirmationId, {operator: 'test-operator'});
    assert.equal(done.status, 'completed');
    assert.equal(env.stripe.sim.subscriptions.get(sub.id).cancel_at_period_end, true);
    const final = env.lastMailTo('lena@example.test');
    assert.match(final.subject, /Kündigung ist ausgeführt/);
    assert.match(final.text, /Dein Vertrag Vision Universe Pro endet am/);
    assert.equal((await executeCancellation(env.app.deps, known.data.confirmationId, {operator: 'x'})).alreadyDone, true, 'idempotent');
    assert.equal((await b.get('/v1/me/billing')).data.entitlements.plan_id, 'pro', 'Zugang bis zum Laufzeitende');

    // Ausserordentlich mit Grund: Pruefung von Hand; Links aus Fremdeingaben werden nicht weitergegeben.
    const extra = await env.browser().post('/v1/billing/cancellation-request', {email: 'lena@example.test', fullName: 'Lena L.',
      kind: 'extraordinary', reason: 'Bitte hier klicken: https://evil.example/login und www.evil.example'});
    const extraRow = await row(extra.data.confirmationId);
    assert.deepEqual([extraRow.status, extraRow.kind], ['manual_review', 'extraordinary']);
    const extraMail = env.lastMailTo('lena@example.test');
    assert.ok(extraMail.text.includes('außerordentliche') && extraMail.text.includes('Grund: Bitte hier klicken: [Link entfernt]'));
    assert.ok(!/evil\.example/.test(extraMail.text + extraMail.html));

    // Hoechstens drei Bestaetigungen je Adresse und Tag (Schutz gegen Mail-Bombing).
    assert.equal((await env.browser().post('/v1/billing/cancellation-request', {email: 'lena@example.test', fullName: 'Lena L.'})).status, 202);
    assert.equal((await env.browser().post('/v1/billing/cancellation-request', {email: 'lena@example.test', fullName: 'Lena L.'})).status, 429);
  });

  await t.test('Angemeldete Kuendigung bei Stripe-Ausfall: Eingang bestaetigt, Pruefung von Hand', async () => {
    const b = await signedIn(env, 'nils@example.test');
    const sub = await subscribe(env, b, 'plus_month');
    const original = env.stripe.handle;
    env.stripe.handle = async req => (req.method === 'POST' && req.url.includes('/v1/subscriptions/'))
      ? new Response('{"error":{"type":"api_error","message":"down"}}', {status: 500}) : original(req);
    try {
      const res = await b.post('/v1/billing/cancel');
      assert.deepEqual([res.status, res.data.state, res.data.emailSent], [202, 'CANCELLATION_RECEIVED', true]);
      const row = await env.pg.json(`select to_json(r) from (select status, confirmation_status, note from billing.cancellation_requests where id = :'id') r`,
        {id: res.data.confirmationId});
      assert.deepEqual(row, {status: 'manual_review', confirmation_status: 'sent', note: 'PROCESS_FAILED'});
      assert.match(env.lastMailTo('nils@example.test').text, /teilen dir den Zeitpunkt der Beendigung/);
      assert.equal(env.stripe.sim.subscriptions.get(sub.id).cancel_at_period_end, false);
    } finally { env.stripe.handle = original; }
  });

  await t.test('Ohne E-Mail-Versand: Eingang trotzdem gespeichert und als nicht bestaetigt markiert', async () => {
    const noMail = await createEnvironment({envOverrides: {BREVO_API_KEY: ''}});
    try {
      const res = await noMail.browser().post('/v1/billing/cancellation-request', {email: 'm@example.test', fullName: 'M.'});
      assert.deepEqual([res.status, res.data.emailSent], [202, false]);
      assert.equal(await noMail.pg.json(`select to_json(confirmation_status) from billing.cancellation_requests where id = :'id'`,
        {id: res.data.confirmationId}), 'not_configured');
      assert.ok(noMail.logs.some(l => l.message === 'MAIL_NOT_SENT'));
      assert.equal(await noMail.pg.json(`select to_json(status) from billing.mail_outbox where cancellation_id = :'id'`,
        {id: res.data.confirmationId}), 'not_configured', 'bleibt im Postausgang und wird wiederholt');
      assert.equal((await noMail.browser().get('/v1/health')).data.mail, false);
    } finally { await noMail.close(); }
  });

  await t.test('Bearbeitung von Hand: Arbeitsliste, Zuordnung anderer Adresse, kein Vertrag', async () => {
    const c = await import('../src/cancellation.mjs');
    const b = await signedIn(env, 'otto@example.test');
    const sub = await subscribe(env, b, 'plus_month');
    // Kunde kuendigt mit anderer Adresse als der Kontoadresse.
    const res = await env.browser().post('/v1/billing/cancellation-request', {email: 'otto.privat@example.test', fullName: 'Otto O.'});
    const queue = await env.app.deps.store.cancellationQueue();
    assert.ok(!queue.some(q => q.id === res.data.confirmationId), 'kein Vorschlag -> nicht in der Arbeitsliste (no_contract)');
    const otto = await env.pg.json(`select to_json(id) from auth.users where email = 'otto@example.test'`);
    await assert.rejects(c.assignAndExecute(env.app.deps, res.data.confirmationId, otto, {operator: ''}), /OPERATOR_REQUIRED/);
    const r = await c.assignAndExecute(env.app.deps, res.data.confirmationId, otto, {operator: 'test-operator'});
    assert.equal(r.status, 'completed');
    assert.equal(env.stripe.sim.subscriptions.get(sub.id).cancel_at_period_end, true);
    assert.match(env.lastMailTo('otto.privat@example.test').subject, /ausgeführt/, 'Abschluss an die Adresse der Kuendigung');
    assert.match(env.lastMailTo('otto@example.test').subject, /ausgeführt/, 'Kontoinhaber erfaehrt die Zuordnung immer');
    assert.equal(await env.pg.json(`select to_json(processed_by) from billing.cancellation_requests where id = :'id'`, {id: res.data.confirmationId}), 'test-operator');
    await c.executeCancellation(env.app.deps, res.data.confirmationId, {operator: 'test-operator'});
    const notices = await env.pg.json(`select count(*) from billing.mail_outbox where cancellation_id = '${res.data.confirmationId}' and kind = 'cancellation_final'`);
    assert.equal(Number(notices), 2, 'wiederholtes Ausfuehren verschickt nichts doppelt');
    // Ohne Vertrag abschliessen und mitteilen.
    const none = await env.browser().post('/v1/billing/cancellation-request', {email: 'paula@example.test', fullName: 'Paula'});
    assert.equal(await c.closeWithoutContract(env.app.deps, none.data.confirmationId, {operator: 'test-operator'}), true);
    assert.match(env.lastMailTo('paula@example.test').subject, /ausgeführt/);
    assert.match(env.lastMailTo('paula@example.test').text, /kein laufendes Abonnement gefunden/);
    // Ausserordentliche Kuendigung eines Kunden: immer in die Arbeitsliste, nie automatisch ausfuehrbar.
    const extra = await env.browser().post('/v1/billing/cancellation-request', {email: 'otto@example.test', fullName: 'Otto O.',
      kind: 'extraordinary', reason: 'Umzug'});
    const item = (await env.app.deps.store.cancellationQueue()).find(q => q.id === extra.data.confirmationId);
    assert.deepEqual([item.status, item.has_match, 'reason' in item], ['manual_review', true, false], 'Grund nicht in der Liste');
    await assert.rejects(c.executeCancellation(env.app.deps, extra.data.confirmationId, {operator: 'x'}), /NOT_ASSIGNABLE/);
  });

  await t.test('Bearbeitungswerkzeug: Liste ohne Personendaten, Ausfuehrung, Fristueberwachung', async () => {
    const {run} = await import('../../../scripts/account/cancellations.mjs');
    const lines = [];
    const cli = argv => run(argv, {env: env.env, fetchImpl: env.fetchImpl, out: l => lines.push(l)});
    const b = await signedIn(env, 'wanda@example.test');
    const sub = await subscribe(env, b, 'pro_year');
    const res = await env.browser().post('/v1/billing/cancellation-request', {email: 'wanda@example.test', fullName: 'Wanda Wunder', reference: 'geheim-42'});
    lines.length = 0;
    assert.equal(await cli(['list', '--redact']), 0);
    const listed = lines.join('\n');
    assert.ok(listed.includes(res.data.confirmationId));
    assert.ok(!/wanda@example\.test|Wanda Wunder|geheim-42/.test(listed), 'redigiert: keine Personendaten im Protokoll');
    await assert.rejects(cli(['execute', res.data.confirmationId]), /OPERATOR_REQUIRED/);
    await assert.rejects(cli(['execute', 'keine-id', '--operator=ops']), /ID_REQUIRED/);
    assert.equal(await cli(['execute', res.data.confirmationId, '--operator=ops', '--redact']), 0);
    assert.equal(env.stripe.sim.subscriptions.get(sub.id).cancel_at_period_end, true);
    assert.match(env.lastMailTo('wanda@example.test').subject, /ausgeführt/);
    // Frist: offene Kuendigung ueber 24 h -> check meldet Exit 1.
    const late = await env.browser().post('/v1/billing/cancellation-request', {email: 'wanda@example.test', fullName: 'W', kind: 'extraordinary'});
    await env.pg.json(`with u as (update billing.cancellation_requests set due_at = now() - interval '1 minute' where id = :'id' returning 1)
      select to_json(count(*)) from u`, {id: late.data.confirmationId});
    lines.length = 0;
    assert.equal(await cli(['check']), 1);
    assert.match(lines.join('\n'), /"overdue":1/);
    assert.equal(await cli(['no-contract', late.data.confirmationId, '--operator=ops']), 0);
    assert.equal(await cli(['check']), 0, 'nach Bearbeitung wieder in Ordnung');
    assert.equal(await cli(['unbekannt']), 2);
  });

  await t.test('Bestaetigung bei Brevo-Ausfall: wiederholt, ueberwacht, Alarm an den Betrieb', async () => {
    const ops = await createEnvironment({envOverrides: {VU_OPS_ALERT_EMAIL: 'ops@visionuniverse.de'}});
    try {
      ops.brevo.down = true;
      const res = await ops.browser().post('/v1/billing/cancellation-request', {email: 'q@example.test', fullName: 'Q'});
      assert.deepEqual([res.status, res.data.emailSent], [202, false], 'Eingang gilt trotz Ausfall');
      const status = () => ops.pg.json(`select to_json(r) from (select o.status, o.attempts, c.confirmation_status from billing.mail_outbox o
        join billing.cancellation_requests c on c.id = o.cancellation_id where c.id = :'id') r`, {id: res.data.confirmationId});
      assert.deepEqual(await status(), {status: 'failed', attempts: 1, confirmation_status: 'failed'});
      // Cron vor Ablauf des Abstands: kein erneuter Versuch.
      await ops.app.scheduled();
      assert.equal((await status()).attempts, 1);
      // Brevo wieder da, Abstand abgelaufen: zugestellt.
      ops.brevo.down = false;
      await ops.pg.json(`with u as (update billing.mail_outbox set next_attempt_at = now() - interval '1 second' returning 1) select to_json(count(*)) from u`);
      await ops.app.scheduled();
      assert.deepEqual(await status(), {status: 'sent', attempts: 2, confirmation_status: 'sent'});
      assert.ok(ops.lastMailTo('q@example.test'));

      // Dauerausfall: nach 8 Versuchen "dead" -> Alarm (hoechstens einer je Stunde) und Gesundheit "attention".
      ops.brevo.down = true;
      const res2 = await ops.browser().post('/v1/billing/cancellation-request', {email: 'r@example.test', fullName: 'R'});
      await ops.pg.json(`with u as (update billing.mail_outbox set attempts = 7, next_attempt_at = now() - interval '1 second'
        where cancellation_id = :'id' returning 1) select to_json(count(*)) from u`, {id: res2.data.confirmationId});
      await ops.app.scheduled();
      assert.equal(await ops.pg.json(`select to_json(status) from billing.mail_outbox where cancellation_id = :'id'`, {id: res2.data.confirmationId}), 'dead');
      assert.ok(ops.logs.some(l => l.message === 'CANCELLATIONS_NEED_ATTENTION'));
      ops.brevo.down = false;
      await ops.pg.json(`with u as (update billing.mail_outbox set next_attempt_at = now() - interval '1 second' where kind = 'ops_alert' returning 1) select to_json(count(*)) from u`);
      await ops.app.scheduled();
      await ops.app.scheduled();
      const alerts = ops.mails.filter(m => m.to === 'ops@visionuniverse.de');
      assert.equal(alerts.length, 1, 'ein Alarm je Stunde');
      assert.match(alerts[0].text, /Endgültig nicht zustellbar: 1/);
      assert.ok(!/r@example\.test/.test(alerts[0].text), 'keine personenbezogenen Daten im Alarm');
      const {resetHealthCache} = await import('../src/index.mjs');
      resetHealthCache();
      const health = await ops.browser().get('/v1/health');
      assert.deepEqual([health.data.cancellations, health.data.autoProcess], ['attention', false]);
      assert.ok(!('open' in health.data) && !JSON.stringify(health.data).includes('@'), 'keine Zahlen, keine Adressen');

      // Nachbearbeiten: erneut senden (Ursache behoben) bzw. begruendet aufgeben.
      const c = await import('../src/cancellation.mjs');
      await assert.rejects(c.retryMails(ops.app.deps, res2.data.confirmationId, {operator: ''}), /OPERATOR_REQUIRED/);
      const retried = await c.retryMails(ops.app.deps, res2.data.confirmationId, {operator: 'test-operator'});
      assert.equal(retried.requeued, 1);
      assert.equal(await ops.pg.json(`select to_json(confirmation_status) from billing.cancellation_requests where id = :'id'`, {id: res2.data.confirmationId}), 'sent');
      assert.ok(ops.lastMailTo('r@example.test'), 'Bestaetigung nachgeliefert');
      ops.brevo.down = true;
      const res3 = await ops.browser().post('/v1/billing/cancellation-request', {email: 's@example.test', fullName: 'S'});
      await ops.pg.json(`with u as (update billing.mail_outbox set status = 'dead' where cancellation_id = :'id' returning 1) select to_json(count(*)) from u`, {id: res3.data.confirmationId});
      await assert.rejects(c.dropMails(ops.app.deps, res3.data.confirmationId, {operator: 'test-operator', note: ' '}), /NOTE_REQUIRED/);
      assert.deepEqual(await c.dropMails(ops.app.deps, res3.data.confirmationId, {operator: 'test-operator', note: 'Adresse existiert nicht (Bounce)'}), {dropped: 1});
      assert.deepEqual(await ops.pg.json(`select to_json(r) from (select o.status, o.last_error, c.confirmation_status from billing.mail_outbox o
        join billing.cancellation_requests c on c.id = o.cancellation_id where c.id = :'id') r`, {id: res3.data.confirmationId}),
        {status: 'dropped', last_error: 'test-operator: Adresse existiert nicht (Bounce)', confirmation_status: 'dropped'});
      const after = await ops.app.deps.store.cancellationHealth();
      assert.deepEqual([Number(after.mails_dead), Number(after.mails_unsent_30min)], [0, 0], 'nachbearbeitet -> nicht mehr offen');
    } finally { await ops.close(); }
  });

  await t.test('Automatische Ausfuehrung nur mit ausdruecklicher Freigabe', async () => {
    const auto = await createEnvironment({envOverrides: {VU_CANCELLATION_AUTO_PROCESS: 'true'}});
    try {
      const b = await signedIn(auto, 'vera@example.test');
      const sub = await subscribe(auto, b, 'plus_month');
      const res = await auto.browser().post('/v1/billing/cancellation-request', {email: 'vera@example.test', fullName: 'Vera'});
      assert.equal(res.status, 202);
      assert.equal(auto.stripe.sim.subscriptions.get(sub.id).cancel_at_period_end, true);
      assert.match(auto.lastMailTo('vera@example.test').text, /Dein Vertrag endet am/);
    } finally { await auto.close(); }
  });

  await t.test('Preisabgleich mit Stripe und Alarm bei Rueckbuchung', async () => {
    const b = await signedIn(env, 'mara@example.test');
    env.stripe.sim.overridePrice('price_test_plus_month', {unit_amount: 1490}); // im Dashboard geaendert, Datenbank nicht
    const sessionsBefore = env.stripe.sim.sessions.size;
    const res = await b.post('/v1/billing/checkout', {price: 'plus_month'});
    assert.deepEqual([res.status, res.data.state], [409, 'PRICE_NOT_AVAILABLE']);
    assert.equal(env.stripe.sim.sessions.size, sessionsBefore, 'keine Checkout-Sitzung zu falschem Preis');
    assert.ok(env.logs.some(l => l.message === 'PRICE_MISMATCH'));
    env.stripe.sim.overridePrice('price_test_plus_month', {active: false});
    assert.equal((await b.post('/v1/billing/checkout', {price: 'plus_month'})).status, 409);
    env.stripe.sim.overridePrice('price_test_plus_month', {});

    const {signStripePayload} = await import('../src/stripe.mjs');
    const dispute = JSON.stringify({id: 'evt_dispute_1', object: 'event', type: 'charge.dispute.created', livemode: false,
      data: {object: {id: 'dp_1', customer: 'cus_x'}}});
    const r = await env.webhook(dispute, await signStripePayload(dispute, env.stripe.webhookSecret, Math.floor(env.now() / 1000)));
    assert.equal(r.status, 200);
    assert.ok(env.logs.some(l => l.message === 'PAYMENT_DISPUTED'));
  });

  await t.test('Datenexport und Kontoloeschung (DSGVO)', async () => {
    const b = await signedIn(env, 'jan@example.test');
    const sub = await subscribe(env, b, 'plus_month');
    const exp = await b.get('/v1/me/export');
    assert.equal(exp.status, 200);
    assert.match(exp.headers.get('Content-Disposition'), /attachment/);
    assert.equal(exp.data.account.email, 'jan@example.test');
    assert.equal(exp.data.subscriptions.length, 1);
    assert.equal(exp.data.invoices.length, 1);

    assert.equal((await b.post('/v1/me/delete', {currentPassword: PASSWORD})).data.state, 'CONFIRMATION_REQUIRED');
    assert.equal((await b.post('/v1/me/delete', {confirm: 'LOESCHEN', currentPassword: 'falsch'})).data.state, 'CURRENT_PASSWORD_INVALID');
    const del = await b.post('/v1/me/delete', {confirm: 'LOESCHEN', currentPassword: PASSWORD});
    assert.deepEqual([del.status, del.data.subscriptionsCanceled], [200, 1]);
    assert.equal(env.stripe.sim.subscriptions.get(sub.id).status, 'canceled', 'kein Abbuchen nach Loeschung');
    assert.equal((await b.get('/v1/me')).status, 401);
    assert.equal((await env.browser().post('/v1/auth/login', {email: 'jan@example.test', password: PASSWORD})).status, 401);
    const left = await env.pg.json(`select json_build_object(
      'users', (select count(*) from auth.users where email = 'jan@example.test'),
      'profiles', (select count(*) from public.profiles p left join auth.users u on u.id = p.user_id where u.id is null),
      'pseudonymousSubs', (select count(*) from public.subscriptions where provider_subscription_id = :'sub' and user_id is null),
      'deletions', (select count(*) from billing.account_deletions))`, {sub: sub.id});
    assert.deepEqual(left, {users: 0, profiles: 0, pseudonymousSubs: 1, deletions: 1});
    await env.deliverWebhooks(); // spaete Stripe-Meldung zum geloeschten Konto
    assert.equal(await env.pg.json(`select to_json(count(*)) from public.subscriptions where provider_subscription_id = :'sub' and user_id is not null`, {sub: sub.id}), 0);
  });

  await t.test('Ohne Anmeldung, gefaelschtes Bearer-Token, App-Zugang mit Bearer', async () => {
    const anon = env.browser();
    for (const path of ['/v1/me', '/v1/me/billing', '/v1/me/export', '/v1/entitlements/check?feature=export.csv']) {
      assert.equal((await anon.get(path)).status, 401, path);
    }
    assert.equal((await anon.post('/v1/billing/checkout', {price: 'plus_month'})).status, 401);
    const unsigned = ['{"alg":"none"}', '{"sub":"x"}'].map(p => Buffer.from(p).toString('base64url')).join('.') + '.';
    assert.equal((await anon.get('/v1/me', {headers: {Authorization: ['Bearer', unsigned].join(' ')}})).status, 401);
    // Native App: meldet sich bei Supabase an und schickt das JWT (kein Cookie, kein CSRF-Kopf noetig).
    const session = await (await env.supabase.handle(new Request('http://supabase.sim/auth/v1/token?grant_type=password', {method: 'POST',
      headers: {apikey: LOCAL_KEYS.publishable, 'Content-Type': 'application/json'},
      body: JSON.stringify({email: 'erik@example.test', password: PASSWORD})}))).json();
    const res = await env.app.handle(new Request('https://account.sim/v1/me', {headers: {Authorization: ['Bearer', session.access_token].join(' ')}}));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).profile.displayName, 'Erik');
  });

  await t.test('Zugriffsregel in Worker und Datenbank identisch', async () => {
    const at = Date.parse('2026-10-25T12:00:00Z');
    const H = 3600e3;
    const cases = [];
    for (const status of ['incomplete', 'trialing', 'active', 'past_due', 'in_grace_period', 'on_hold', 'paused', 'unpaid', 'canceled', 'expired', 'revoked']) {
      for (const endOffset of [null, -9 * 24 * H, -3 * 24 * H, -47 * H, -49 * H, 1 * H, 30 * 24 * H]) {
        for (const graceOffset of [null, -H, H]) cases.push({status, end: endOffset === null ? null : new Date(at + endOffset).toISOString(),
          grace: graceOffset === null ? null : new Date(at + graceOffset).toISOString()});
      }
    }
    const db = await env.pg.json(`select json_agg(public.subscription_grants_access((c->>'status')::public.subscription_status,
      (c->>'end')::timestamptz, (c->>'grace')::timestamptz, :'at'::timestamptz) order by o)
      from jsonb_array_elements(:'cases'::jsonb) with ordinality as x(c, o)`, {cases: JSON.stringify(cases), at: new Date(at).toISOString()});
    const js = cases.map(c => subscriptionGrantsAccess({status: c.status, current_period_end: c.end, grace_until: c.grace}, at));
    assert.deepEqual(js, db);
    assert.ok(js.filter(Boolean).length > 10 && js.filter(x => !x).length > 100, 'Fallliste deckt beide Seiten ab');
  });

  await t.test('Abgleich aus Stripe stellt verlorene Abozustaende wieder her', async () => {
    const {reconcile} = await import('../../../scripts/account/reconcile-stripe.mjs');
    const before = await env.pg.json(`select to_json(count(*)) from public.subscriptions`);
    assert.ok(before >= 5);
    // Datenverlust simulieren: Abos weg, Kunden-Zuordnung bleibt (eigene Tabelle).
    await env.pg.json(`with d as (delete from public.subscriptions returning 1) select to_json(count(*)) from d`);
    const fetchImpl = (url, init) => (url.startsWith('http://stripe.sim') ? env.stripe.handle(new Request(url, init)) : env.supabase.handle(new Request(url, init)));
    const report = await reconcile({env: env.env, fetchImpl, log: () => {}});
    assert.equal(report.seen, env.stripe.sim.subscriptions.size);
    // Fremdabo (unbekannter Kunde) bleibt draussen; geloeschtes Konto wird pseudonym wiederhergestellt.
    // Abgewiesen bleiben genau: das Fremdabo und das Abo mit manipulierten Metadaten.
    assert.deepEqual(report.failed.map(f => f.code.split(':')[1]).sort(), ['CUSTOMER_NOT_LINKED', 'SUBSCRIPTION_USER_MISMATCH']);
    // Gerds Abo traegt bei Stripe inzwischen fremde Metadaten: bleibt bis zur Klaerung draussen.
    assert.equal(await env.pg.json(`select to_json(count(*)) from public.subscriptions`), before - 1);
    assert.equal(await env.pg.json(`select to_json(count(*)) from public.subscriptions where user_id is null`), 1, 'geloeschtes Konto pseudonym');
    const b = env.browser();
    await b.post('/v1/auth/login', {email: 'hanna@example.test', password: PASSWORD});
    assert.equal((await b.get('/v1/me/billing')).data.subscriptions[0].status, 'unpaid', 'Zustand wie bei Stripe');
    assert.equal((await reconcile({env: {...env.env, STRIPE_SECRET_KEY: 'sk_live_x'}, fetchImpl, log: () => {}}).catch(e => e.message)),
      'BILLING_LIVE_MODE_NOT_APPROVED');
  });

  await t.test('Live-Schluessel ohne Freigabe: Abrechnung gesperrt', async () => {
    const live = await createEnvironment({envOverrides: {STRIPE_SECRET_KEY: 'sk_live_simulation'}});
    try {
      const b = await signedIn(live, 'kim@example.test');
      const res = await b.post('/v1/billing/checkout', {price: 'plus_month'});
      assert.deepEqual([res.status, res.data.state], [503, 'BILLING_LIVE_MODE_NOT_APPROVED']);
      assert.equal(live.stripe.sim.customers.size, 0, 'kein Aufruf bei Stripe');
      assert.equal((await b.get('/v1/me')).data.billingAvailable, false);
    } finally { await live.close(); }
  });
});
