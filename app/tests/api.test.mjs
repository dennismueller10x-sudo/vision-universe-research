import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuth} from '../www/js/auth.js';
import {createApi, ApiError} from '../www/js/api.js';
import {memoryStore} from '../www/js/token-store.js';
import {fakeSupabase, CONFIG, clock} from './helpers.mjs';

async function setup(handler, sbOpts = {}) {
  const sb = fakeSupabase(sbOpts), now = clock();
  const auth = createAuth({config: CONFIG, store: memoryStore(), fetchImpl: sb, now});
  await auth.signIn('a@b.de', 'richtig');
  const seen = [];
  const fetchImpl = async (url, init) => { seen.push({url, init}); return handler(url, init, seen.length); };
  return {api: createApi({config: CONFIG, auth, fetchImpl}), seen, sb, auth};
}
const res = (status, data) => ({ok: status < 400, status, json: async () => data});

test('Anfragen tragen Authorization: Bearer und keine Cookies', async () => {
  const {api, seen} = await setup(() => res(200, {items: [], lists: []}));
  await api.watchlist();
  assert.equal(seen[0].url, 'https://api.test/v1/watchlist');
  assert.equal(seen[0].init.headers.Authorization, 'Bearer at1');
  assert.equal(seen[0].init.credentials, undefined);
});

test('401: einmal erneuern, einmal wiederholen', async () => {
  const {api, seen} = await setup((u, i, n) => (n === 1 ? res(401, {state: 'NOT_AUTHENTICATED'}) : res(200, {ok: true})));
  await api.me();
  assert.equal(seen.length, 2);
  assert.equal(seen[1].init.headers.Authorization, 'Bearer at2');
});

test('dauerhaft 401: NOT_AUTHENTICATED, keine Endlosschleife', async () => {
  const {api, seen} = await setup(() => res(401, {state: 'NOT_AUTHENTICATED'}));
  await assert.rejects(api.me(), e => e instanceof ApiError && e.status === 401);
  assert.equal(seen.length, 2);
});

test('Netzfehler wird OFFLINE, nicht als Abmeldung behandelt', async () => {
  const {api, auth} = await setup(() => { throw new TypeError('network'); });
  await assert.rejects(api.watchlist(), e => e.code === 'OFFLINE');
  assert.equal(auth.state().signedIn, true);
});

test('Entfernen sendet instrumentId und listId', async () => {
  const {api, seen} = await setup(() => res(200, {state: 'REMOVED'}));
  await api.removeFromWatchlist({instrumentId: 'vu_abc123', listId: 'l1'});
  assert.deepEqual(JSON.parse(seen[0].init.body), {instrumentId: 'vu_abc123', listId: 'l1'});
});

test('ohne Anmeldung kein Netzaufruf', async () => {
  const auth = createAuth({config: CONFIG, store: memoryStore(), fetchImpl: fakeSupabase()});
  let called = false;
  const api = createApi({config: CONFIG, auth, fetchImpl: async () => { called = true; return res(200, {}); }});
  await assert.rejects(api.me(), e => e.code === 'NOT_AUTHENTICATED');
  assert.equal(called, false);
});
