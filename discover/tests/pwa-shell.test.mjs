// PWA Stufe 1: Manifest gueltig, Icons vorhanden, Service Worker cached nur die Offline-Seite.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');

test('manifest: Pflichtfelder, Start in Discover, Icons existieren als PNG passender Groesse', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.start_url, '/discover/');
  assert.equal(m.scope, '/');
  assert.equal(m.display, 'standalone');
  assert.ok(m.icons.some(i => i.purpose === 'maskable'));
  for (const i of m.icons) {
    const p = i.src.replace(/^\//, '');
    assert.ok(existsSync(new URL(p, root)), p);
    const b = readFileSync(new URL(p, root));
    assert.equal(b.subarray(1, 4).toString(), 'PNG');
    const [w, h] = i.sizes.split('x').map(Number);
    assert.deepEqual([b.readUInt32BE(16), b.readUInt32BE(20)], [w, h], p);
  }
});

function loadWorker() {
  const handlers = {}, cached = [], responded = [];
  const ctx = {
    self: {addEventListener: (t, f) => { handlers[t] = f; }, skipWaiting: () => Promise.resolve(), clients: {claim: () => Promise.resolve()}},
    caches: {open: async () => ({addAll: async l => { cached.push(...l); }}), keys: async () => [], match: async () => 'OFFLINE'},
    fetch: () => Promise.reject(new Error('offline')),
    Response: {error: () => 'ERR'},
  };
  vm.runInNewContext(read('sw.js'), ctx);
  return {handlers, cached, responded};
}

test('service worker: precached nur Offline-Seite und Icon, keine Daten oder Skripte', async () => {
  const {handlers, cached} = loadWorker();
  let p; handlers.install({waitUntil: x => { p = x; }}); await p;
  assert.deepEqual(cached, ['/offline.html', '/assets/icons/icon-192.png']);
  assert.ok(!cached.some(u => /\/data\/|\.js$|\.json$/.test(u)));
});

test('service worker: greift nur bei Seitennavigation ein, Daten- und Skriptanfragen bleiben unberuehrt', async () => {
  const {handlers} = loadWorker();
  const fire = req => { let r = null; handlers.fetch({request: req, respondWith: x => { r = x; }}); return r; };
  for (const url of ['/quant/data/x.json', '/discover/app.js', '/api/history'])
    assert.equal(fire({mode: 'cors', method: 'GET', url}), null, url);
  assert.equal(fire({mode: 'navigate', method: 'POST', url: '/'}), null);
  assert.equal(await fire({mode: 'navigate', method: 'GET', url: '/discover/'}), 'OFFLINE');
});

test('Discover und Startseite verlinken Manifest und Registrierung', () => {
  for (const p of ['discover/index.html', 'index.html']) {
    const s = read(p);
    assert.match(s, /<link rel="manifest" href="\/manifest\.webmanifest">/, p);
    assert.match(s, /<script src="\/assets\/pwa\.js" defer><\/script>/, p);
  }
});
