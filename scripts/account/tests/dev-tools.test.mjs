// Werkzeuge fuer die echte Entwicklungsumgebung: ohne Netz, mit nachgebildeten
// Stripe-/Brevo-/Worker-Antworten. Mit PG_TEST_URL zusaetzlich das Einspielen
// der Migrationen gegen eine Wegwerf-Datenbank.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {setupStripe, assertTestKey, WEBHOOK_EVENTS, priceSql, CATALOG} from '../stripe-test-setup.mjs';
import {checkBrevo} from '../brevo-check.mjs';
import {doctor} from '../dev-doctor.mjs';
import {pendingMigrations, applyMigrations} from '../apply-migrations.mjs';
import {configureAuth} from '../supabase-auth-config.mjs';

const TEST_KEY = ['sk', 'test', 'abc123'].join('_');
const API = 'https://account-dev.visionuniverse.de';
const json = (status, body) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});

function fakeStripe() {
  const state = {products: new Map(), prices: [], portals: [], hooks: [], calls: []};
  let n = 0;
  const fetchImpl = async (url, {method = 'GET', body} = {}) => {
    const u = new URL(url);
    const form = new URLSearchParams(method === 'GET' ? u.search : body || '');
    state.calls.push(`${method} ${u.pathname}`);
    const p = u.pathname;
    if (method === 'GET' && p.startsWith('/v1/products/')) {
      const pr = state.products.get(p.split('/').pop());
      return pr ? json(200, pr) : json(404, {error: {type: 'invalid_request_error', code: 'resource_missing'}});
    }
    if (method === 'POST' && p === '/v1/products') {
      const pr = {id: form.get('id'), name: form.get('name'), livemode: false};
      state.products.set(pr.id, pr);
      return json(200, pr);
    }
    if (method === 'GET' && p === '/v1/prices') {
      const lk = form.get('lookup_keys[0]');
      return json(200, {data: state.prices.filter(x => x.lookup_key === lk && x.active)});
    }
    if (method === 'POST' && p === '/v1/prices') {
      const price = {id: `price_${String(++n).padStart(10, 'x')}`, product: form.get('product'), currency: form.get('currency'),
        unit_amount: Number(form.get('unit_amount')), tax_behavior: form.get('tax_behavior'),
        recurring: {interval: form.get('recurring[interval]')}, lookup_key: form.get('lookup_key'), active: true, livemode: false};
      state.prices.push(price);
      return json(200, price);
    }
    if (method === 'GET' && p.startsWith('/v1/prices/')) {
      const price = state.prices.find(x => x.id === p.split('/').pop());
      return price ? json(200, price) : json(404, {error: {code: 'resource_missing'}});
    }
    if (p.startsWith('/v1/billing_portal/configurations')) {
      if (method === 'GET') return json(200, {data: state.portals});
      if (p === '/v1/billing_portal/configurations') {
        const c = {id: `bpc_${++n}abcdef`, metadata: {vu_managed: form.get('metadata[vu_managed]')}, livemode: false};
        state.portals.push(c);
        return json(200, c);
      }
      return json(200, state.portals.find(c => c.id === p.split('/').pop()));
    }
    if (p.startsWith('/v1/webhook_endpoints')) {
      if (method === 'GET') return json(200, {data: state.hooks});
      if (p === '/v1/webhook_endpoints') {
        const events = [...form.entries()].filter(([k]) => k.startsWith('enabled_events')).map(([, v]) => v);
        const h = {id: `we_${++n}abcdef`, url: form.get('url'), enabled_events: events, status: 'enabled', secret: 'whsec_geheim', livemode: false};
        state.hooks.push(h);
        return json(200, h);
      }
      const {secret, ...h} = state.hooks.find(x => x.id === p.split('/').pop());
      return json(200, h);
    }
    return json(400, {error: {type: 'unexpected', message: `${method} ${p}`}});
  };
  return {state, fetchImpl};
}

test('Stripe-Einrichtung lehnt Live-Schluessel ab', () => {
  assert.throws(() => assertTestKey(['sk', 'live', 'abc'].join('_')), /LIVE/);
  assert.throws(() => assertTestKey(['rk', 'live', 'abc'].join('_')), /LIVE/);
  assert.throws(() => assertTestKey(''), /Testschluessel/);
  assert.doesNotThrow(() => assertTestKey(TEST_KEY));
});

test('Stripe-Einrichtung ist idempotent und gibt das Webhook-Geheimnis nur einmal zurueck', async () => {
  const s = fakeStripe();
  const logs = [];
  const first = await setupStripe({key: TEST_KEY, apiOrigin: API, fetchImpl: s.fetchImpl, log: m => logs.push(m)});
  assert.equal(first.prices.length, 4);
  assert.equal(s.state.products.size, 2);
  assert.equal(first.webhookSecret, 'whsec_geheim');
  assert.ok(first.portalId.startsWith('bpc_'));
  assert.deepEqual(s.state.hooks[0].enabled_events, [...WEBHOOK_EVENTS]);
  assert.equal(s.state.hooks[0].url, `${API}/v1/billing/webhook/stripe`);
  assert.ok(!logs.join('\n').includes('whsec_'), 'Geheimnis nie im Protokoll');

  const second = await setupStripe({key: TEST_KEY, apiOrigin: API, fetchImpl: s.fetchImpl, log: () => {}});
  assert.equal(s.state.prices.length, 4, 'keine doppelten Preise');
  assert.equal(s.state.portals.length, 1);
  assert.equal(s.state.hooks.length, 1);
  assert.equal(second.webhookSecret, null);
  assert.deepEqual(second.prices.map(p => p.priceId), first.prices.map(p => p.priceId));

  // Preis geaendert (Betrag passt nicht mehr) -> neuer Preis, Lookup-Key wandert.
  s.state.prices[0].unit_amount = 1;
  const third = await setupStripe({key: TEST_KEY, apiOrigin: API, fetchImpl: s.fetchImpl, log: () => {}});
  assert.equal(s.state.prices.length, 5);
  assert.notEqual(third.prices[0].priceId, first.prices[0].priceId);
});

test('Probelauf schreibt nichts', async () => {
  const s = fakeStripe();
  await setupStripe({key: TEST_KEY, apiOrigin: API, fetchImpl: s.fetchImpl, dryRun: true, log: () => {}});
  assert.ok(s.state.calls.every(c => c.startsWith('GET ')), s.state.calls.join(','));
});

test('Webhook-Ereignisse decken alles ab, was der Worker verarbeitet', () => {
  const src = readFileSync(new URL('../../../workers/vu-account/src/billing.mjs', import.meta.url), 'utf8');
  const handled = new Set([...src.matchAll(/'((?:customer\.subscription|invoice|checkout\.session|charge)\.[a-z_.]+)'/g)].map(m => m[1]));
  for (const e of handled) assert.ok(WEBHOOK_EVENTS.includes(e), `fehlt: ${e}`);
  for (const e of WEBHOOK_EVENTS) assert.ok(handled.has(e), `nicht verarbeitet: ${e}`);
});

test('plan_prices-Upsert nutzt die Schluessel aus seed.sql', () => {
  const sql = priceSql([{plan: 'plus', interval: 'month', amount: 990, priceId: 'price_1abcdefgh'}]);
  assert.match(sql, /\('plus_month', 'plus', 'stripe', 'price_1abcdefgh', 'month', 'EUR', 990, false\)/);
  assert.match(sql, /on conflict \(id\) do update/);
  const seed = readFileSync(new URL('../../../supabase/seed.sql', import.meta.url), 'utf8');
  for (const c of CATALOG) for (const [interval, amount] of c.prices) {
    assert.match(seed, new RegExp(`'${c.plan}_${interval}',\\s+'${c.plan}',\\s+'stripe',\\s+'[^']+',\\s+'${interval}',\\s+'EUR',\\s+${amount}`));
  }
});

test('Brevo-Pruefung erkennt fehlenden Absender und nicht authentifizierte Domain', async () => {
  const brevo = (senders, domains) => async url => url.endsWith('/v3/account') ? json(200, {})
    : url.endsWith('/v3/senders') ? json(200, {senders}) : json(200, {domains});
  const sender = 'konto@visionuniverse.de';
  assert.deepEqual(await checkBrevo({apiKey: 'k', sender, fetchImpl: brevo([{email: sender, active: true}],
    [{domain_name: 'visionuniverse.de', authenticated: true}])}), {ok: true, problems: []});
  const bad = await checkBrevo({apiKey: 'k', sender, fetchImpl: brevo([], [{domain_name: 'visionuniverse.de', authenticated: false}])});
  assert.equal(bad.ok, false);
  assert.equal(bad.problems.length, 2);
  const denied = await checkBrevo({apiKey: 'k', sender, fetchImpl: async () => json(401, {})});
  assert.match(denied.problems[0], /401/);
  assert.equal((await checkBrevo({apiKey: '', sender})).ok, false);
});

test('Doctor meldet Platzhalter-Preise, Automatik und fehlenden Webhook', async () => {
  const fetchImpl = async url => {
    if (url.endsWith('/v1/health')) return json(200, {state: 'OK', accounts: true, mail: true, cancellations: 'ok', autoProcess: true});
    if (url.endsWith('/v1/plans')) return json(200, {mode: 'test', plans: []});
    if (url.includes('/rest/v1/plan_prices')) return json(200, [{id: 'plus_month', provider_price_id: 'price_test_plus_month', unit_amount: 990, currency: 'EUR', billing_interval: 'month'}]);
    if (url.includes('/v1/prices/')) return json(404, {});
    if (url.includes('/v1/webhook_endpoints')) return json(200, {data: []});
    return json(404, {});
  };
  const r = await doctor({VU_ACCOUNT_API_ORIGIN: API, SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x', STRIPE_SETUP_KEY: TEST_KEY}, {fetchImpl});
  assert.equal(r.ok, false);
  const errors = r.results.filter(x => x.level === 'error').map(x => x.msg).join('\n');
  assert.match(errors, /VU_CANCELLATION_AUTO_PROCESS/);
  assert.match(errors, /Platzhalter/);
  assert.match(errors, /kein Webhook/);
  assert.ok(r.results.some(x => x.area === 'brevo' && x.level === 'skip'));
});

test('Doctor ohne Zugaenge: alles uebersprungen, kein Fehler', async () => {
  const r = await doctor({}, {fetchImpl: async () => { throw new Error('kein Netz'); }});
  assert.equal(r.ok, true);
  assert.ok(r.results.every(x => x.level === 'skip'));
});

test('Migrationen: Reihenfolge, nur Dateien aus supabase/migrations', () => {
  const todo = pendingMigrations(new Set(['20261025000100']), ['20261026000100_b.sql', 'README.md', '20261025000100_a.sql', '20261025000200_c.sql']);
  assert.deepEqual(todo, ['20261025000200_c.sql', '20261026000100_b.sql']);
});

test('Migrationen gegen PostgreSQL: einspielen, wiederholen, Fehler rollt zurueck', {skip: !process.env.PG_TEST_URL && 'PG_TEST_URL fehlt'}, () => {
  const base = new URL(process.env.PG_TEST_URL);
  const db = `vu_migrate_${process.pid}`;
  const admin = args => execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', process.env.PG_TEST_URL, ...args], {stdio: 'pipe'});
  admin(['-c', `drop database if exists ${db}`, '-c', `create database ${db}`]);
  const url = new URL(base); url.pathname = `/${db}`;
  const root = mkdtempSync(join(tmpdir(), 'vu-mig-'));
  try {
    execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', String(url), '-f',
      new URL('../../../supabase/local/platform-stub.sql', import.meta.url).pathname], {stdio: 'pipe'});
    const all = applyMigrations({dbUrl: String(url), log: () => {}});
    assert.ok(all.length >= 6);
    assert.deepEqual(applyMigrations({dbUrl: String(url), log: () => {}}), []);

    mkdirSync(join(root, 'supabase/migrations'), {recursive: true});
    writeFileSync(join(root, 'supabase/migrations/29990101000000_broken.sql'), 'create table public.half_done (id int);\nselect 1/0;\n');
    assert.throws(() => applyMigrations({dbUrl: String(url), root, log: () => {}}), /29990101000000_broken\.sql: .*division by zero/);
    const left = execFileSync('psql', ['-X', '-t', '-A', '-d', String(url), '-c',
      "select count(*) from pg_tables where tablename = 'half_done'"], {encoding: 'utf8'}).trim();
    assert.equal(left, '0', 'fehlerhafte Migration vollstaendig zurueckgerollt');
  } finally {
    rmSync(root, {recursive: true, force: true});
    admin(['-c', `drop database if exists ${db}`]);
  }
});

test('Supabase-Auth: nur Entwicklungsprojekt, Hook und Redirect, Geheimnis nie im Protokoll', async () => {
  const ref = 'abcdefghijklmnopqrst';
  const token = ['sbp', 'abc123'].join('_');
  const make = name => {
    const calls = [];
    const fetchImpl = async (url, {method, body}) => {
      calls.push({method, path: new URL(url).pathname, body: body ? JSON.parse(body) : null});
      if (url.endsWith(`/v1/projects/${ref}`)) return json(200, {name});
      if (method === 'GET') return json(200, {site_url: 'https://research.visionuniverse.de/konto/'});
      return json(200, {});
    };
    return {calls, fetchImpl};
  };
  const prod = make('vision-universe');
  await assert.rejects(configureAuth({token, ref, apiOrigin: API, fetchImpl: prod.fetchImpl, log: () => {}}), /dev\/test\/staging/);
  assert.ok(!prod.calls.some(c => c.method === 'PATCH'));

  const dev = make('vision-universe-dev');
  const logs = [];
  const smtp = {login: 'login@smtp-brevo.com', key: 'xsmtpsib-geheim', sender: 'konto@visionuniverse.de'};
  const r = await configureAuth({token, ref, apiOrigin: API, smtp, fetchImpl: dev.fetchImpl, log: m => logs.push(m)});
  const patch = dev.calls.find(c => c.method === 'PATCH').body;
  assert.equal(patch.uri_allow_list, `${API}/v1/auth/callback**`);
  assert.equal(patch.hook_before_user_created_enabled, true);
  assert.equal(patch.mailer_autoconfirm, false);
  assert.equal(patch.smtp_host, 'smtp-relay.brevo.com');
  assert.ok(!('site_url' in patch), 'unveraenderte Werte nicht senden');
  assert.match(patch.mailer_templates_confirmation_content, /\{\{ \.ConfirmationURL \}\}/);
  assert.ok(r.changed.includes('smtp_pass'));
  assert.ok(!logs.join('\n').includes('xsmtpsib-geheim'));

  const dry = make('vu-dev');
  await configureAuth({token, ref, apiOrigin: API, dryRun: true, fetchImpl: dry.fetchImpl, log: () => {}});
  assert.ok(dry.calls.every(c => c.method === 'GET'));
  await assert.rejects(configureAuth({token, ref, apiOrigin: API, smtp: {login: 'x', key: 'y', sender: 'a@gmail.com'}, fetchImpl: dry.fetchImpl}), /SMTP/);
});
