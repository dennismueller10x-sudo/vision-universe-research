/* Skriptgruppen und Deployment-Wechsel (discover/ui/lazy.js + quant/ui/release-guard.js): Entscheidungen ohne Browser.
   Der Browserlauf mit Gate und beiden Engines: scripts/discover/deploy-switch-qa.mjs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = readFileSync(join(root, 'discover/ui/lazy.js'), 'utf8');

function world(templates, guard, options = {}) {
  const appended = [];
  const reloads = { count: 0 };
  const document = {
    readyState: 'complete',
    head: { appendChild(node) { appended.push(node.src); setTimeout(() => (options.fail && options.fail(node.src) ? node.onerror() : node.onload()), 1); } },
    getElementById: id => { const list = templates[id.replace('dx-lazy-', '')]; return list ? { content: { querySelectorAll: () => list.map(src => ({ getAttribute: () => src })) } } : null; },
    createElement: () => ({ remove() {} }), addEventListener() {}
  };
  const store = {};
  const context = { document, location: { hash: '', reload() { reloads.count++; } }, sessionStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } },
    setTimeout, clearTimeout, module: { exports: {} }, navigator: {}, addEventListener() {}, removeEventListener() {}, VUReleaseGuard: guard };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return { api: context.module.exports, appended, reloads };
}
const guardStub = (over = {}) => {
  const calls = [];
  return { calls, known: () => true, beforeLoad: () => { calls.push('beforeLoad'); return Promise.resolve(); }, onMissing: () => { calls.push('onMissing'); return Promise.resolve('SAME'); }, ...over };
};
const tick = () => new Promise(r => setTimeout(r, 5));

test('Gruppe laden: erst der Waechter, dann die Skripte - bei einem neuen Release (Waechter bleibt offen) wird nichts geladen', async () => {
  const guard = guardStub({ beforeLoad: () => new Promise(() => {}) });
  const { api, appended } = world({ detail: ['/d.js'] }, guard);
  api.load('detail');
  await tick();
  assert.deepEqual(appended, [], 'kein neues Skript neben dem alten Code, solange die Seite neu laedt');
});

test('Gruppe laden: Waechter ohne Beanstandung -> Skripte in Reihenfolge; ein Befund RELEASE_STALE lehnt ab und wird spaeter erneut versucht', async () => {
  let stale = true;
  const guard = guardStub({ beforeLoad: () => (stale ? Promise.reject(new Error('RELEASE_STALE')) : Promise.resolve()) });
  const { api, appended, reloads } = world({ detail: ['/a.js', '/b.js'] }, guard);
  await assert.rejects(api.load('detail'), /RELEASE_STALE/);
  assert.deepEqual(appended, []);
  assert.equal(reloads.count, 0, 'das Neuladen entscheidet der Waechter, nicht lazy.js');
  stale = false;
  await api.load('detail');
  assert.deepEqual(appended, ['/a.js', '/b.js']);
});

test('Ladefehler mit Waechter: er wird gefragt (neuer Release -> Neuladen), lazy.js laedt nicht selbst neu; der Fehler bleibt', async () => {
  const guard = guardStub();
  const { api, reloads } = world({ a: ['/x.js'] }, guard, { fail: () => true });
  await assert.rejects(api.load('a'), /LAZY_SCRIPT_FAILED/);
  assert.deepEqual(guard.calls, ['beforeLoad', 'onMissing']);
  assert.equal(reloads.count, 0);
});

test('Ladefehler, neuer Release: onMissing laedt neu und bleibt offen - der Aufruf endet nicht mit einem Fehlerbild', async () => {
  const guard = guardStub({ onMissing: () => new Promise(() => {}) });
  const { api } = world({ a: ['/x.js'] }, guard, { fail: () => true });
  let settled = false;
  api.load('a').then(() => { settled = true; }, () => { settled = true; });
  await tick(); await tick();
  assert.equal(settled, false);
});

test('ohne Kennung (known() false) oder ohne Waechter: bisheriges Verhalten - ein Ladefehler laedt einmal neu', async () => {
  for (const guard of [guardStub({ known: () => false }), undefined]) {
    const { api, reloads } = world({ a: ['/x.js'] }, guard, { fail: () => true });
    await assert.rejects(api.load('a'), /LAZY_SCRIPT_FAILED/);
    await assert.rejects(api.load('a'), /LAZY_SCRIPT_FAILED/);
    assert.equal(reloads.count, 1);
    if (guard) assert.deepEqual(guard.calls, [], 'ohne Kennung wird der Waechter nicht befragt');
  }
});

test('index.html: der Waechter steht im Start vor shell.js (shell.js fragt ihn bei einem 404)', () => {
  const html = readFileSync(join(root, 'discover/index.html'), 'utf8');
  const start = html.match(/<template id="dx-start">([\s\S]*?)<\/template>/)[1];
  const order = [...start.matchAll(/<script src="([^"?]+)/g)].map(m => m[1]);
  assert.ok(order.indexOf('/quant/ui/release-guard.js') >= 0, 'release-guard.js fehlt im Start');
  assert.ok(order.indexOf('/quant/ui/release-guard.js') < order.indexOf('/quant/ui/shell.js'));
});
