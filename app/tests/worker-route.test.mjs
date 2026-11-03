// Die App-Schiene authTransport 'worker' gegen den ECHTEN Worker vu-account (workers/vu-account/src)
// mit Supabase Auth im Arbeitsspeicher (scripts/account/sim/memory-auth.mjs). Kein Netz, keine Datenbank.
// fetch wie CapacitorHttp: kein Origin, kein Cookie.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuth, AuthError} from '../www/js/auth.js';
import {memoryStore} from '../www/js/token-store.js';
import {readConfig, DEFAULT_CONFIG} from '../www/js/config.js';

// Der Worker-Teil kommt mit einem eigenen PR (workers/vu-account). Fehlt er auf dieser Basis, werden die Tests uebersprungen.
let createMemoryWorker = null;
try { ({createMemoryWorker} = await import('../../scripts/account/sim/memory-auth.mjs')); } catch { /* Worker-PR noch nicht auf dieser Basis */ }
const skip = createMemoryWorker ? false : 'Worker-Routen /v1/auth/app/* noch nicht auf dieser Basis';

const PASSWORD = 'Sicheres-Passwort-26';

async function setup({start = Date.UTC(2026, 10, 3)} = {}) {
  let t = start;
  const now = () => t;
  now.advance = ms => { t += ms; };
  const w = await createMemoryWorker({now, users: {'app@example.test': {password: PASSWORD}}});
  const sent = [];
  const nativeFetch = async (url, init = {}) => {
    sent.push({url, headers: {...init.headers}, body: init.body ? JSON.parse(init.body) : null});
    return w.app.handle(new Request(url, {...init, headers: {'CF-Connecting-IP': '203.0.113.9', ...init.headers}}));
  };
  const config = readConfig({VU_APP_CONFIG: {authTransport: 'worker', accountApi: w.api}});
  const store = memoryStore();
  const auth = createAuth({config, store, fetchImpl: nativeFetch, now});
  return {w, auth, store, sent, now, config, nativeFetch};
}

test('Standard bleibt supabase (bis zum Geraetetest)', () => {
  assert.equal(DEFAULT_CONFIG.authTransport, 'supabase');
  assert.equal(readConfig({}).authTransport, 'supabase');
});

test('Worker-Schiene gegen den echten Worker: Anmelden, Konto lesen, Erneuern mit Rotation, Abmelden widerruft', {skip}, async () => {
  const {w, auth, store, sent, now} = await setup();
  await auth.signIn('app@example.test', PASSWORD);
  assert.equal(auth.state().user.email, 'app@example.test');
  assert.equal(sent[0].url, w.api + '/v1/auth/app/login');
  assert.equal(sent[0].headers.apikey, undefined, 'kein Supabase-Schluessel in der App');
  assert.ok(!('Origin' in sent[0].headers) && !('Cookie' in sent[0].headers));
  const first = await store.get();

  // Bearer an der Konto-API (/v1/session prueft das JWT wie /v1/me)
  const session = await w.app.handle(new Request(w.api + '/v1/session', {headers: {Authorization: 'Bearer ' + await auth.accessToken()}}));
  assert.equal((await session.json()).authenticated, true);

  // Kurz vor Ablauf: Erneuerung ueber /v1/auth/app/refresh, neues Paar
  now.advance(3600_000 - 30_000);
  const fresh = await auth.accessToken();
  assert.notEqual(fresh, first.accessToken);
  const second = await store.get();
  assert.notEqual(second.refreshToken, first.refreshToken);
  assert.ok(sent.some(s => s.url.endsWith('/v1/auth/app/refresh')));

  // Abmelden: lokal geloescht, Refresh-Token serverseitig widerrufen
  await auth.signOut();
  assert.equal(auth.state().signedIn, false);
  assert.equal(await store.get(), null);
  assert.deepEqual(sent.at(-1).body, {refreshToken: second.refreshToken});
  assert.equal(w.auth.activeRefreshTokens().length, 0);
  const again = await w.app.handle(new Request(w.api + '/v1/auth/app/refresh', {method: 'POST',
    headers: {'Content-Type': 'application/json'}, body: JSON.stringify({refreshToken: second.refreshToken})}));
  assert.equal(again.status, 401);
  for (const tok of [first.accessToken, first.refreshToken, second.refreshToken, PASSWORD]) assert.ok(!JSON.stringify(w.logs).includes(tok));
});

test('Worker-Schiene: falsches Passwort, Tempolimit, wiederverwendetes Refresh-Token meldet ab', {skip}, async () => {
  const {auth, store} = await setup();
  await assert.rejects(auth.signIn('app@example.test', 'Falsches-Passwort-1'), e => e instanceof AuthError && e.code === 'INVALID_CREDENTIALS' && e.status === 401);
  for (let i = 0; i < 9; i++) await auth.signIn('app@example.test', 'Falsches-Passwort-1').catch(() => {});
  await assert.rejects(auth.signIn('app@example.test', PASSWORD), e => e.code === 'RATE_LIMITED' && e.status === 429);
  assert.equal(await store.get(), null);

  // Wiederverwendung: Ein Angreifer hat das Refresh-Token kopiert und zuerst erneuert -> die App wird abgemeldet.
  const b = await setup();
  await b.auth.signIn('app@example.test', PASSWORD);
  const stolen = (await b.store.get()).refreshToken;
  const thief = await b.w.app.handle(new Request(b.w.api + '/v1/auth/app/refresh', {method: 'POST',
    headers: {'Content-Type': 'application/json'}, body: JSON.stringify({refreshToken: stolen})}));
  assert.equal(thief.status, 200);
  const thiefPair = await thief.json();
  await assert.rejects(b.auth.forceRefresh(), e => e.code === 'TOKEN_INVALID' && e.status === 401);
  assert.equal(b.auth.state().signedIn, false, 'abgemeldet, Eintrag geloescht');
  assert.equal(await b.store.get(), null);
  const thiefAgain = await b.w.app.handle(new Request(b.w.api + '/v1/auth/app/refresh', {method: 'POST',
    headers: {'Content-Type': 'application/json'}, body: JSON.stringify({refreshToken: thiefPair.refreshToken})}));
  assert.equal(thiefAgain.status, 401, 'auch das Paar des Angreifers ist widerrufen');
});

test('Worker-Schiene im Browser (mit Origin) wird abgewiesen', {skip}, async () => {
  const {w, config} = await setup();
  const browserFetch = (url, init = {}) => w.app.handle(new Request(url, {...init, headers: {...init.headers, Origin: 'capacitor://localhost'}}));
  const auth = createAuth({config, store: memoryStore(), fetchImpl: browserFetch, now: Date.now});
  await assert.rejects(auth.signIn('app@example.test', PASSWORD), e => e.code === 'APP_CLIENT_ONLY' && e.status === 403);
  assert.equal(auth.state().signedIn, false);
});
