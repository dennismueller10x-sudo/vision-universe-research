// App-Rahmen (Strang AA): in der App (UA VUEdge/1, iframe unter capacitor://localhost) holt der Konto-Client das Token von der Shell
// und sendet Bearer ohne Cookie; ausserhalb der App bleibt alles beim Cookie.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const A = createRequire(import.meta.url)('../account-api.js');

function fakeWin({app = true, token = 'jwt-1', fresh = 'jwt-2'} = {}) {
  const listeners = [], sent = [];
  const parent = {postMessage(msg, origin) {
    sent.push({msg, origin});
    if (msg.type === 'vu:token-request') queueMicrotask(() => listeners.forEach(fn => fn({source: parent, origin: 'capacitor://localhost',
      data: {type: 'vu:token', id: msg.id, token: msg.force ? fresh : token}})));
  }};
  const win = {parent: app ? parent : null, navigator: {userAgent: app ? 'Mozilla/5.0 VUApp/1 VUEdge/1' : 'Mozilla/5.0'},
    location: {ancestorOrigins: ['capacitor://localhost'], origin: 'https://research.visionuniverse.de', href: 'https://research.visionuniverse.de/konto/', reload() {}},
    addEventListener: (t, fn) => { if (t === 'message') listeners.push(fn); }, sent};
  if (!app) win.parent = win;
  return win;
}
const cfg = () => { globalThis.VU_ACCOUNT_CONFIG = {endpoint: 'https://konto.visionuniverse.de'}; };
const reply = (status, data) => ({status, ok: status < 400, text: async () => JSON.stringify(data)});

test('inApp: nur mit Marke VUEdge/1 und im Rahmen', () => {
  assert.equal(A.inApp(fakeWin()), true);
  assert.equal(A.inApp(fakeWin({app: false})), false);
});

test('App: Bearer vom Token der Shell, keine Cookies, Anfrage geht an die Shell nur mit Herkunft capacitor://localhost', async () => {
  cfg(); const win = fakeWin(), calls = [];
  const r = await A.request('GET', '/v1/watchlist', undefined, {win, fetch: async (url, init) => { calls.push({url, init}); return reply(200, {items: []}); }});
  assert.equal(r.ok, true);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer jwt-1');
  assert.equal(calls[0].init.credentials, 'omit');
  assert.equal(win.sent[0].origin, 'capacitor://localhost');
  assert.equal(win.sent[0].msg.type, 'vu:token-request');
});

test('App: 401 -> Shell erneuert einmal, Wiederholung mit neuem Token; zweite 401 bleibt 401', async () => {
  cfg(); const win = fakeWin(), seen = [];
  const r = await A.request('GET', '/v1/me', undefined, {win, fetch: async (u, init) => { seen.push(init.headers.Authorization); return reply(init.headers.Authorization === 'Bearer jwt-2' ? 200 : 401, {}); }});
  assert.deepEqual(seen, ['Bearer jwt-1', 'Bearer jwt-2']); assert.equal(r.ok, true);
  const seen2 = [];
  const r2 = await A.request('GET', '/v1/me', undefined, {win: fakeWin(), fetch: async (u, init) => { seen2.push(init.headers.Authorization); return reply(401, {state: 'NOT_AUTHENTICATED'}); }});
  assert.equal(seen2.length, 2); assert.equal(r2.status, 401);
});

test('App ohne Sitzung: anonym (kein Cookie, kein Bearer) -> Server antwortet 401', async () => {
  cfg(); const win = fakeWin({token: null}); let init;
  await A.request('GET', '/v1/session', undefined, {win, fetch: async (u, i) => { init = i; return reply(200, {authenticated: false}); }});
  assert.equal(init.headers.Authorization, undefined); assert.equal(init.credentials, 'omit');
});

test('Antworten fremder Herkunft oder fremden Fensters werden ignoriert', async () => {
  const listeners = [], parent = {postMessage(msg) { sent = msg; }}; let sent = null;
  const win = {parent, navigator: {userAgent: 'VUEdge/1'}, location: {ancestorOrigins: ['capacitor://localhost']}, addEventListener: (t, fn) => listeners.push(fn)};
  const p = A.appToken(false, win);
  const fire = (source, origin) => listeners.forEach(fn => fn({source, origin, data: {type: 'vu:token', id: sent.id, token: source === parent && origin === 'capacitor://localhost' ? 'echt' : 'gefaelscht'}}));
  fire(parent, 'https://evil.example'); fire({}, 'capacitor://localhost');   // beide verworfen
  fire(parent, 'capacitor://localhost');
  assert.equal(await p, 'echt');
});

test('Browser (keine App): Cookie wie bisher', async () => {
  cfg(); let init;
  await A.request('GET', '/v1/session', undefined, {win: fakeWin({app: false}), fetch: async (u, i) => { init = i; return reply(200, {authenticated: true}); }});
  assert.equal(init.credentials, 'include'); assert.equal(init.headers.Authorization, undefined);
});
