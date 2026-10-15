/* Kontrollierte Wiederholung transienter Server-Fehler beim Nachladen von Skripten (discover/ui/lazy.js).
   Fake-DOM, virtuelle Zeit, kein Netz. Browserlauf: scripts/discover/browser-qa.mjs (Discover Frontend CI). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = readFileSync(join(root, 'discover/ui/lazy.js'), 'utf8');

/* statuses: Adresse -> Liste der Antworten je Versuch (200 = laedt, 'net' = Netzfehler, Zahl = HTTP-Status).
   Die Probe (HEAD) liefert den Status des zuletzt fehlgeschlagenen Versuchs; 'net' -> fetch lehnt ab. */
function world(statuses, options = {}) {
  const appended = [], removed = [], probes = [], sleeps = [], warnings = [];
  const attempts = {};
  let clock = 0, pending = [], seq = 0;
  const lastStatus = {};
  const fakeTimeout = (fn, ms) => { const id = ++seq; pending.push({ id, fn, at: clock + (ms || 0) }); return id; };
  const fakeClear = id => { pending = pending.filter(t => t.id !== id); };
  const pump = () => new Promise(resolve => setImmediate(() => {
    const next = pending.sort((a, b) => a.at - b.at)[0];
    if (!next) return resolve(false);
    pending = pending.filter(t => t !== next);
    if (next.at > clock) { sleeps.push(next.at - clock); clock = next.at; }
    next.fn(); resolve(true);
  }));
  const document = {
    readyState: 'complete',
    head: { appendChild(node) {
      appended.push(node.src);
      const list = statuses[node.src.split('?')[0]] || [200];
      const n = attempts[node.src] = (attempts[node.src] || 0) + 1;
      const outcome = list[Math.min(n, list.length) - 1];
      lastStatus[node.src] = outcome;
      setImmediate(() => (outcome === 200 ? node.onload() : node.onerror()));
    } },
    getElementById: id => /^dx-lazy-/.test(id) ? { content: { querySelectorAll: () => ((options.groups && options.groups[id.slice(8)]) || options.group || []).map(src => ({ getAttribute: () => src })) } } : null,
    createElement: () => ({ remove() { removed.push(this.src); } }), addEventListener() {}
  };
  const context = {
    document, location: { hash: '', reload() {} }, sessionStorage: { getItem: () => null, setItem() {} }, navigator: {},
    setTimeout: fakeTimeout, clearTimeout: fakeClear, module: { exports: {} }, addEventListener() {}, removeEventListener() {},
    Date: { now: () => clock }, Math: { random: () => options.random ?? 0, floor: Math.floor, min: Math.min },
    console: { warn: (...a) => warnings.push(a.join(' ')), error() {} }
  };
  if (!options.noFetch) {
    context.AbortController = class { constructor() { this.signal = {}; } abort() {} };
    context.fetch = (src, init) => {
      probes.push({ src, method: init.method, cache: init.cache });
      const outcome = lastStatus[src];
      if (outcome === 'probe200') return Promise.resolve({ status: 200 });
      if (outcome === 'net') return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve({ status: outcome, text() { throw new Error('Body darf nie gelesen werden'); }, json() { throw new Error('Body darf nie gelesen werden'); } });
    };
  }
  context.globalThis = context;
  vm.runInNewContext(source, context);
  const run = async promise => {
    let result;
    const guarded = promise.then(v => (result = { ok: true, value: v }), e => (result = { ok: false, error: e }));
    while (!result) { await pump(); }
    await guarded;
    return result;
  };
  return { api: context.module.exports, appended, removed, probes, sleeps, warnings, run, clock: () => clock };
}
const U = '/discover/engines/narrative.js';
const loadOne = w => w.api.load('g');

test('503 beim ersten Versuch, dann ok: Erfolg nach 1 Wiederholung, 1 Probe, Knoten entfernt', async () => {
  const w = world({ [U]: [503, 200] }, { group: [U] });
  const r = await w.run(loadOne(w));
  assert.equal(r.ok, true);
  assert.equal(w.appended.length, 2);
  assert.deepEqual(w.removed, [U]);
  assert.deepEqual(w.probes, [{ src: U, method: 'HEAD', cache: 'no-store' }]);
  assert.deepEqual(w.sleeps, [300]);
});

test('503 dreimal: genau 3 Versuche, 2 Proben, Fehler LAZY_SCRIPT_FAILED mit Originalursache, Gesamtdauer begrenzt', async () => {
  const w = world({ [U]: [503] }, { group: [U], random: 0.999 });
  const r = await w.run(loadOne(w));
  assert.equal(r.ok, false);
  assert.match(r.error.message, /^LAZY_SCRIPT_FAILED:\/discover\/engines\/narrative\.js$/);
  assert.equal(r.error.attempts, 3);
  assert.equal(r.error.status, 503);
  assert.equal(w.appended.length, 3);
  assert.equal(w.probes.length, 2);
  assert.equal(w.removed.length, 3, 'kein Muell im DOM');
  assert.deepEqual(w.sleeps, [399, 999]);
  assert.ok(w.clock() < 4000, 'Gesamtdauer ' + w.clock());
});

test('nach endgueltigem Fehler gilt das Skript nicht als geladen: spaeterer Aufruf versucht erneut', async () => {
  const w = world({ [U]: [503, 503, 503, 200] }, { group: [U] });
  assert.equal((await w.run(loadOne(w))).ok, false);
  const again = await w.run(loadOne(w));
  assert.equal(again.ok, true);
  assert.equal(w.appended.length, 4);
});

test('404: sofort Fehler, genau 1 Versuch, 1 Probe, keine Wartezeit', async () => {
  const w = world({ [U]: [404] }, { group: [U] });
  const r = await w.run(loadOne(w));
  assert.equal(r.ok, false);
  assert.match(r.error.message, /LAZY_SCRIPT_FAILED:/);
  assert.equal(r.error.status, 404);
  assert.equal(w.appended.length, 1);
  assert.equal(w.probes.length, 1);
  assert.deepEqual(w.sleeps, []);
});

test('403 und 410 wiederholen ebenfalls nicht; 429 und 408 schon', async () => {
  for (const status of [403, 410]) {
    const w = world({ [U]: [status] }, { group: [U] });
    assert.equal((await w.run(loadOne(w))).ok, false);
    assert.equal(w.appended.length, 1, String(status));
  }
  for (const status of [429, 408]) {
    const w = world({ [U]: [status, 200] }, { group: [U] });
    assert.equal((await w.run(loadOne(w))).ok, true);
    assert.equal(w.appended.length, 2, String(status));
  }
});

test('Netzfehler: begrenzte Wiederholung (3 Versuche), danach derselbe Fehler', async () => {
  const w = world({ [U]: ['net'] }, { group: [U] });
  const r = await w.run(loadOne(w));
  assert.equal(r.ok, false);
  assert.match(r.error.message, /LAZY_SCRIPT_FAILED:/);
  assert.equal(r.error.status, 0);
  assert.equal(w.appended.length, 3);
  const ok = world({ [U]: ['net', 200] }, { group: [U] });
  assert.equal((await ok.run(loadOne(ok))).ok, true);
});

test('Skriptfehler, aber Probe meldet 200: Skript wird erneut geladen (begrenzt auf 3 Versuche)', async () => {
  const w = world({ [U]: ['probe200', 200] }, { group: [U] });
  assert.equal((await w.run(loadOne(w))).ok, true);
  assert.equal(w.appended.length, 2);
  const always = world({ [U]: ['probe200'] }, { group: [U] });
  const r = await always.run(loadOne(always));
  assert.equal(r.ok, false);
  assert.equal(always.appended.length, 3);
  assert.equal(r.error.status, 200);
});

test('kein fetch verfuegbar: bisheriges Verhalten - sofort Fehler, keine Wiederholung', async () => {
  const w = world({ [U]: [503] }, { group: [U], noFetch: true });
  const r = await w.run(loadOne(w));
  assert.equal(r.ok, false);
  assert.equal(w.appended.length, 1);
});

test('paralleler Aufruf derselben Adresse (auch waehrend der Wiederholung): ein Ladevorgang je Versuch', async () => {
  const w = world({ [U]: [503, 200] }, { group: [U] });
  const a = w.api.load('g');
  const b = w.api.load('g');
  const c = Promise.resolve().then(() => w.api.load('g'));
  const r = await w.run(Promise.all([a, b, c]));
  assert.equal(r.ok, true);
  assert.equal(w.appended.length, 2, 'ein Ursprungsversuch + eine Wiederholung, nicht je Aufrufer');
  assert.equal(w.probes.length, 1);
});

test('Normalfall: Erfolg ohne Zusatzrequest, ohne Probe, ohne Wartezeit', async () => {
  const w = world({}, { group: [U, '/a.js'] });
  const r = await w.run(loadOne(w));
  assert.equal(r.ok, true);
  assert.deepEqual(w.appended, [U, '/a.js']);
  assert.deepEqual(w.probes, []);
  assert.deepEqual(w.sleeps, []);
  assert.deepEqual(w.removed, []);
});

test('Gruppe: ein transient fehlgeschlagenes Skript blockiert die Gruppe nicht dauerhaft, die anderen laden nicht doppelt', async () => {
  const w = world({ '/b.js': [503, 200] }, { group: ['/a.js', '/b.js', '/c.js'] });
  const r = await w.run(loadOne(w));
  assert.equal(r.ok, true);
  assert.deepEqual(w.appended.slice().sort(), ['/a.js', '/b.js', '/b.js', '/c.js']);
});

test('forRoute reicht den Fehler unveraendert an app.js weiter (route()-catch zeigt die Meldung)', async () => {
  const w = world({ [U]: [503] }, { group: [U] });
  const r = await w.run(w.api.forRoute(['s']));
  assert.equal(r.ok, false);
  assert.match(r.error.message, /^LAZY_SCRIPT_FAILED:/);
  assert.equal(w.appended.length, 3);
});

test('zwei Gruppen mit demselben Skript (geteiltes Modul) laden es auch beim Wiederholen nur einmal', async () => {
  const w = world({ '/shared.js': [503, 200] }, { groups: { detail: ['/shared.js', '/d.js'], markets: ['/shared.js', '/m.js'] } });
  const r = await w.run(Promise.all([w.api.load('detail'), w.api.load('markets')]));
  assert.equal(r.ok, true);
  assert.equal(w.appended.filter(src => src === '/shared.js').length, 2, 'ein Versuch + eine Wiederholung, nicht je Gruppe');
  assert.equal(w.probes.length, 1);
});
