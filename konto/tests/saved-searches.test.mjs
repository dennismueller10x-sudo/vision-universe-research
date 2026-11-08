// Z3 · Gespeicherte Suchen im Konto (konto/saved-searches.js): Abgleich, Hochladen, Spiegeln, Gerätespeicher.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const read = p => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
function mem(init = {}) { const m = {...init}; return {getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }, m}; }

function fakeAccount(remote = []) {
  const calls = []; let n = 0;
  const A = {
    available: () => true, message: s => 'M:' + s, calls, remote,
    get: p => { calls.push(['GET', p]); return Promise.resolve({ok: true, status: 200, data: {searches: remote.slice(), limit: 50}}); },
    post: (p, b) => {
      calls.push(['POST', p, b]);
      if (p === '/v1/searches/remove') return Promise.resolve({ok: true, status: 200, data: {state: 'REMOVED'}});
      if (remote.length >= 50) return Promise.resolve({ok: false, status: 409, state: 'SAVED_SEARCHES_LIMIT_REACHED'});
      const s = {id: 'r' + (++n), world: b.world, name: b.name, query: b.query}; remote.push(s);
      return Promise.resolve({ok: true, status: 201, data: {state: 'CREATED', search: s}});
    },
    patch: (p, b) => { calls.push(['PATCH', p, b]); return Promise.resolve({ok: true, status: 200, data: {search: b}}); },
  };
  return A;
}
function load(A) {
  globalThis.VUAccount = A;
  delete require.cache[require.resolve('../saved-searches.js')];
  return require('../saved-searches.js');
}

test('reconcile: gleiche Suche verknüpfen, fremde aufs Gerät, im Konto gelöschte nur entkoppeln', () => {
  const S = load(null);
  const local = [{id: 'a', name: 'X', query: {p: 1}, acct: null}, {id: 'b', name: 'Y', query: {p: 2}, acct: 'gone'}, {id: 'c', name: 'Z', query: {p: 3}, acct: null}];
  const remote = [{id: 'r1', name: 'X', query: {p: 1}}, {id: 'r2', name: 'W', query: {p: 9}}];
  const plan = S.reconcile(local, remote);
  assert.deepEqual(plan.link, [{id: 'a', acct: 'r1'}]);
  assert.deepEqual(plan.unlink, ['b']);
  assert.deepEqual(plan.pending, ['c']);
  assert.deepEqual(plan.add.map(r => r.id), ['r2']);
});

test('ohne Anmeldung: nichts geht ans Konto, Satz sagt „nur in diesem Browser“', async () => {
  delete globalThis.VUAccount;
  globalThis.localStorage = mem();
  const S = load(undefined);
  const st = await S.sync({world: 'screener', list: () => [], link() {}, unlink() {}, add() {}});
  assert.equal(st.signedIn, false);
  assert.match(S.line(st), /nur in diesem Browser/);
  delete globalThis.localStorage;
});

test('angemeldet: sync, „Im Konto speichern“, Spiegeln und Löschen über /v1/searches', async () => {
  const A = fakeAccount([{id: 'r9', name: 'Vom Handy', query: {query: 'abc'}}]);
  const S = load(A);
  const store = S.localStore('vu-test-searches', mem());
  store.save('Nur hier', {query: 'xyz'});
  const a = {world: 'quant', list: store.list, link: store.link, unlink: store.unlink, add: store.add};
  const st = await S.sync(a);
  assert.deepEqual([st.signedIn, st.count, st.limit, st.pending], [true, 1, 50, 1]);
  assert.equal(store.list().length, 2, 'Suche aus dem Konto liegt jetzt auch auf dem Gerät');
  assert.match(S.line(st), /Im Konto: 1 von 50 · 1 Suche nur auf diesem Gerät/);
  const up = await S.pushPending(a);
  assert.deepEqual([up.state, up.saved], ['OK', 1]);
  assert.ok(store.list().every(s => s.acct), 'alle verknüpft');
  assert.deepEqual(A.calls.find(c => c[0] === 'POST').slice(1), ['/v1/searches', {world: 'quant', name: 'Nur hier', query: {query: 'xyz'}}]);
  const one = store.list().find(s => s.name === 'Nur hier');
  store.save('Umbenannt', {query: 'xyz'});
  await S.saved(a, one.id);
  assert.deepEqual(A.calls.at(-1), ['PATCH', '/v1/searches', {id: one.acct, name: 'Umbenannt', query: {query: 'xyz'}}]);
  await S.removed(one.acct);
  assert.deepEqual(A.calls.at(-1), ['POST', '/v1/searches/remove', {id: one.acct}]);
  delete globalThis.VUAccount;
});

test('Grenze 50 je Konto: Hochladen stoppt mit der Meldung des Kontos', async () => {
  const A = fakeAccount(Array.from({length: 50}, (_, i) => ({id: 'x' + i, name: 'S' + i, query: {i}})));
  const S = load(A);
  const store = S.localStore('vu-test-searches', mem());
  store.save('Eine zu viel', {i: 'neu'});
  const r = await S.pushPending({world: 'technical', list: store.list, link: store.link, unlink: store.unlink, add() {}});
  assert.deepEqual([r.saved, r.state, r.message], [0, 'SAVED_SEARCHES_LIMIT_REACHED', 'M:SAVED_SEARCHES_LIMIT_REACHED']);
  assert.equal(store.list()[0].acct, null, 'bleibt auf dem Gerät');
  assert.equal(S.LIMIT, 50);
  delete globalThis.VUAccount;
});

test('Seiten: S04, T04 und Q02 nutzen das Modul; „Im Konto speichern: bald“ ist weg', () => {
  for (const p of ['screener/index.html', 'technical/index.html', 'quant/index.html']) assert.match(read(p), /<script src="\/konto\/saved-searches\.js"><\/script>/, p);
  const sc = read('screener/app.js'), tc = read('technical/app.js'), qp = read('quant/app/pages.js');
  assert.doesNotMatch(sc, /Im Konto speichern: bald/);
  assert.match(sc, /world: 'screener'/); assert.match(tc, /world: "technical"/); assert.match(qp, /world: "quant"/);
  for (const js of [sc, tc, qp]) { assert.match(js, /SS\.sync\(/); assert.match(js, /SS\.pushPending\(/); assert.match(js, /SS\.removed\(/); }
  const msg = read('konto/account-api.js');
  assert.match(msg, /SAVED_SEARCHES_LIMIT_REACHED: 'Im Konto ist Platz für 50 Suchen/);
});
