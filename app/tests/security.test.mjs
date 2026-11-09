// Sicherheitstests Phase 2: Speicherung, Erneuerung, Loeschung der Tokens und die beiden Anmeldeschienen.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuth, AuthError, OFFLINE} from '../www/js/auth.js';
import {createApi} from '../www/js/api.js';
import {memoryStore, secureStore} from '../www/js/token-store.js';
import {fakeSupabase, CONFIG, clock} from './helpers.mjs';

const WORKER = {...CONFIG, authTransport: 'worker', supabaseUrl: '', supabasePublishableKey: ''};

// Simulierter Worker-Vorschlag (docs/mobile/SECURITY_LOGIN.md): /v1/auth/app/login|refresh|logout
function fakeWorker({limitAfter = Infinity, rejectRefresh = false} = {}) {
  const calls = []; let n = 0, logins = 0;
  const impl = async (url, init = {}) => {
    calls.push({url, init, body: init.body ? JSON.parse(init.body) : null});
    const reply = (status, data) => ({ok: status < 400, status, json: async () => data});
    const p = new URL(url).pathname;
    if (p === '/v1/auth/app/login') {
      if (++logins > limitAfter) return reply(429, {state: 'RATE_LIMITED'});
      if (JSON.parse(init.body).password !== 'richtig') return reply(401, {state: 'INVALID_CREDENTIALS'});
      n++; return reply(200, {accessToken: 'wat' + n, refreshToken: 'wrt' + n, expiresIn: 3600, user: {id: 'u1', email: 'a@b.de'}});
    }
    if (p === '/v1/auth/app/refresh') {
      if (rejectRefresh) return reply(401, {state: 'TOKEN_INVALID'});
      n++; return reply(200, {accessToken: 'wat' + n, refreshToken: 'wrt' + n, expiresIn: 3600, user: {id: 'u1', email: 'a@b.de'}});
    }
    if (p === '/v1/auth/app/logout') return reply(200, {authenticated: false});
    return reply(404, {});
  };
  impl.calls = calls; return impl;
}

test('Worker-Schiene: kein Supabase-Schluessel, kein apikey-Header, Antwort wird normalisiert', async () => {
  const f = fakeWorker();
  const auth = createAuth({config: WORKER, store: memoryStore(), fetchImpl: f, now: clock()});
  await auth.signIn('a@b.de', 'richtig');
  assert.equal(f.calls[0].url, 'https://api.test/v1/auth/app/login');
  assert.equal(f.calls[0].init.headers.apikey, undefined);
  assert.equal(await auth.accessToken(), 'wat1');
});

test('Worker-Schiene: 429 und 401 werden als Zustand gemeldet, ohne Sitzung', async () => {
  const f = fakeWorker({limitAfter: 1});
  const auth = createAuth({config: WORKER, store: memoryStore(), fetchImpl: f, now: clock()});
  await assert.rejects(auth.signIn('a@b.de', 'falsch'), e => e.code === 'INVALID_CREDENTIALS' && e.status === 401);
  await assert.rejects(auth.signIn('a@b.de', 'richtig'), e => e.code === 'RATE_LIMITED' && e.status === 429);
  assert.equal(auth.state().signedIn, false);
});

test('Worker-Schiene: Refresh sendet refreshToken, rotiert, abgelehnt = abmelden und loeschen', async () => {
  const store = memoryStore(), now = clock();
  const a = createAuth({config: WORKER, store, fetchImpl: fakeWorker(), now});
  await a.signIn('a@b.de', 'richtig');
  assert.equal((await store.get()).refreshToken, 'wrt1');
  const b = createAuth({config: WORKER, store, fetchImpl: fakeWorker({rejectRefresh: true}), now: () => now() + 3_600_000});
  await b.restore();
  assert.equal(b.state().signedIn, false);
  assert.equal(await store.get(), null);
});

test('Tokens landen nie in Fehlermeldungen oder Konsole', async () => {
  const logged = []; const orig = {...console};
  for (const k of ['log', 'warn', 'error', 'info', 'debug']) console[k] = (...a) => logged.push(a.join(' '));
  try {
    const sb = fakeSupabase();
    const auth = createAuth({config: CONFIG, store: memoryStore(), fetchImpl: sb, now: clock()});
    await auth.signIn('a@b.de', 'richtig');
    sb.setDown(true);
    const e = await auth.forceRefresh().catch(x => x);
    assert.ok(e instanceof AuthError);
    assert.doesNotMatch(String(e.message) + JSON.stringify(e), /at1|rt1|richtig/);
    await auth.signOut();
  } finally { Object.assign(console, orig); }
  assert.equal(logged.filter(l => /at\d|rt\d|richtig/.test(l)).length, 0);
});

test('Ablage fehlgeschlagen (Keychain gesperrt): keine Sitzung im Speicher, Fehler STORAGE_FAILED', async () => {
  const broken = {kind: 'keychain', get: async () => null, set: async () => { throw new Error('locked'); }, clear: async () => {}};
  const auth = createAuth({config: CONFIG, store: broken, fetchImpl: fakeSupabase(), now: clock()});
  await assert.rejects(auth.signIn('a@b.de', 'richtig'), e => e.code === 'STORAGE_FAILED');
  assert.equal(auth.state().signedIn, false);
  assert.equal(await auth.accessToken(), null);
});

test('Keychain: genau ein Eintrag, Zugriffsklasse nur-dieses-Geraet, kein iCloud-Abgleich, Loeschung entfernt ihn', async () => {
  const items = new Map(); const sets = [];
  const plugin = {get: async k => items.get(k) ?? null, set: async (k, v, convertDate, sync, access) => { sets.push({sync, access}); items.set(k, v); }, remove: async k => items.delete(k)};
  const store = secureStore(plugin, {access: 'whenUnlockedThisDeviceOnly'});
  const auth = createAuth({config: CONFIG, store, fetchImpl: fakeSupabase(), now: clock()});
  await auth.signIn('a@b.de', 'richtig');
  assert.equal(items.size, 1);
  assert.deepEqual(sets[0], {sync: false, access: 'whenUnlockedThisDeviceOnly'});
  await auth.signOut();
  assert.equal(items.size, 0);
});

test('Kaltstart mit abgelaufenem Token ohne Netz: Sitzung bleibt erhalten', async () => {
  const store = memoryStore(), now = clock();
  await createAuth({config: CONFIG, store, fetchImpl: fakeSupabase({expiresIn: 120}), now}).signIn('a@b.de', 'richtig');
  const offline = createAuth({config: CONFIG, store, fetchImpl: fakeSupabase({down: true}), now: () => now() + 600_000});
  assert.equal((await offline.restore()).signedIn, true);
  assert.equal((await store.get()).refreshToken, 'rt1');
});

test('Kontowechsel: neue Anmeldung ersetzt den alten Eintrag vollstaendig', async () => {
  const store = memoryStore(); const sb = fakeSupabase();
  const auth = createAuth({config: CONFIG, store, fetchImpl: sb, now: clock()});
  await auth.signIn('a@b.de', 'richtig'); await auth.signIn('c@d.de', 'richtig');
  const saved = await store.get();
  assert.equal(saved.refreshToken, 'rt2'); assert.equal(saved.user.email, 'c@d.de');
});

test('Ein abgelaufenes Token wird nie an die API gesendet, wenn die Erneuerung gelang', async () => {
  const now = clock(); const sb = fakeSupabase({expiresIn: 120});
  const auth = createAuth({config: CONFIG, store: memoryStore(), fetchImpl: sb, now});
  await auth.signIn('a@b.de', 'richtig'); now.advance(100_000);
  const seen = [];
  const api = createApi({config: CONFIG, auth, fetchImpl: async (u, i) => { seen.push(i.headers.Authorization); return {ok: true, status: 200, json: async () => ({})}; }});
  await api.me();
  assert.deepEqual(seen, ['Bearer at2']);
});

test('Konfiguration: Worker-Schiene braucht keine Supabase-Werte', async () => {
  const {readConfig} = await import('../www/js/config.js');
  assert.equal(readConfig({VU_APP_CONFIG: {authTransport: 'worker'}}).configured, true);
  assert.equal(readConfig({VU_APP_CONFIG: {authTransport: 'unbekannt'}}).authTransport, 'supabase');
  assert.equal(readConfig({}).configured, false);
});
