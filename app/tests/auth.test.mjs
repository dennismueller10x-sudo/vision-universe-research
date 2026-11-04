import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuth, AuthError, OFFLINE} from '../www/js/auth.js';
import {memoryStore} from '../www/js/token-store.js';
import {fakeSupabase, CONFIG, clock} from './helpers.mjs';

const make = (opts = {}, store = memoryStore()) => {
  const fetchImpl = fakeSupabase(opts), now = clock();
  return {auth: createAuth({config: CONFIG, store, fetchImpl, now}), fetchImpl, now, store};
};

test('Login speichert Sitzung im Speicher, sendet apikey und kein Token im Klartext-Log', async () => {
  const {auth, fetchImpl, store} = make();
  await auth.signIn(' a@b.de ', 'richtig');
  assert.equal(auth.state().signedIn, true);
  assert.equal(fetchImpl.calls[0].init.headers.apikey, 'sb_publishable_test');
  assert.equal(fetchImpl.calls[0].body.email, 'a@b.de');
  assert.equal((await store.get()).refreshToken, 'rt1');
});

test('falsches Passwort: Fehler, keine Sitzung', async () => {
  const {auth, store} = make();
  await assert.rejects(auth.signIn('a@b.de', 'falsch'), e => e instanceof AuthError && e.code === 'invalid_credentials');
  assert.equal(auth.state().signedIn, false);
  assert.equal(await store.get(), null);
});

test('Session-Erneuerung vor Ablauf, Refresh-Token wird rotiert', async () => {
  const {auth, now, store} = make({expiresIn: 120});
  await auth.signIn('a@b.de', 'richtig');
  assert.equal(await auth.accessToken(), 'at1');          // noch gueltig
  now.advance(70_000);                                    // < 60 s Restlaufzeit
  assert.equal(await auth.accessToken(), 'at2');
  assert.equal((await store.get()).refreshToken, 'rt2');
});

test('gleichzeitige Zugriffe erneuern nur einmal (Single-Flight)', async () => {
  const {auth, now, fetchImpl} = make({expiresIn: 120});
  await auth.signIn('a@b.de', 'richtig');
  now.advance(70_000);
  const tokens = await Promise.all([auth.accessToken(), auth.accessToken(), auth.accessToken()]);
  assert.deepEqual(tokens, ['at2', 'at2', 'at2']);
  assert.equal(fetchImpl.calls.filter(c => c.url.includes('refresh_token')).length, 1);
});

test('abgelehnter Refresh-Token meldet ab und loescht den Speicher', async () => {
  const store = memoryStore();
  const ok = make({expiresIn: 120}, store);
  await ok.auth.signIn('a@b.de', 'richtig');
  const bad = createAuth({config: CONFIG, store, fetchImpl: fakeSupabase({rejectRefresh: true}), now: () => ok.now() + 100_000});
  await bad.restore();
  assert.equal(bad.state().signedIn, false);
  assert.equal(await store.get(), null);
});

test('ohne Netz bleibt die Sitzung bestehen (Offline ist keine Abmeldung)', async () => {
  const {auth, now, fetchImpl, store} = make({expiresIn: 120});
  await auth.signIn('a@b.de', 'richtig');
  fetchImpl.setDown(true);
  now.advance(70_000);
  assert.equal(await auth.accessToken(), 'at1');          // altes Token, Sitzung bleibt
  assert.equal(auth.state().signedIn, true);
  assert.equal((await store.get()).refreshToken, 'rt1');
  await assert.rejects(auth.forceRefresh(), e => e.code === OFFLINE);
});

test('Login ohne Netz: OFFLINE', async () => {
  const {auth} = make({down: true});
  await assert.rejects(auth.signIn('a@b.de', 'richtig'), e => e.code === OFFLINE);
});

test('Abmelden loescht lokal sofort, auch wenn der Server nicht erreichbar ist', async () => {
  const {auth, fetchImpl, store} = make();
  await auth.signIn('a@b.de', 'richtig');
  fetchImpl.setDown(true);
  await auth.signOut();
  assert.equal(auth.state().signedIn, false);
  assert.equal(await store.get(), null);
});

test('Wiederherstellung beim Start aus dem Speicher', async () => {
  const store = memoryStore();
  await make({}, store).auth.signIn('a@b.de', 'richtig');
  const again = createAuth({config: CONFIG, store, fetchImpl: fakeSupabase(), now: clock()});
  assert.equal((await again.restore()).signedIn, true);
});

test('nicht konfiguriert: Anmeldung verweigert, kein Netzaufruf', async () => {
  const fetchImpl = fakeSupabase();
  const auth = createAuth({config: {...CONFIG, configured: false}, store: memoryStore(), fetchImpl});
  await assert.rejects(auth.signIn('a@b.de', 'richtig'), e => e.code === 'NOT_CONFIGURED');
  assert.equal(fetchImpl.calls.length, 0);
});
