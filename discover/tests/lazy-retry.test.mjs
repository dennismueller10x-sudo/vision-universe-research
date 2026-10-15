/* Kontrollierte Wiederholung transienter Server-Fehler beim Nachladen von Skripten (discover/ui/lazy.js).
   Fake-DOM, virtuelle Zeit, kein Netz. Das Fake bildet nach, was in Chromium gemessen wurde:
   - <link rel=preload as=script>: ein erfolgreicher Treffer wird vom naechsten <script> derselben Adresse ohne Netz genutzt,
     ein fehlgeschlagener Treffer laesst genau diesen naechsten Ladeversuch ohne Netz scheitern.
   - <script async=false>: ein Fehler (onerror) hindert Nachfolger nicht an der Ausfuehrung - deshalb haengt lazy.js sie erst
     nach dem Vorgaenger an. Das Fake meldet `overlap`, wenn ein Skript eingefuegt wird, waehrend ein anderes noch laedt.
   - options.webkit: WebKit (iOS) verwendet eine fehlgeschlagene Preload-Ressource fuer JEDE identische Adresse erneut, ohne neuen
     Abruf; nur eine geaenderte Adresse (Wiederholungs-Query) laedt frisch. Chromium verbraucht den Fehlertreffer nur einmal.
   Dieser Test ersetzt keinen Browser. Echte Browser (Chromium und WebKit, echte Gruppenlisten, Fehlerinjektion):
   scripts/discover/lazy-fault-qa.mjs (von Hand oder in CI aufrufbar; nicht Teil von scripts/discover/browser-qa.mjs). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = readFileSync(join(root, 'discover/ui/lazy.js'), 'utf8');

/* statuses: Adresse -> Antworten je Netzabruf (200 | HTTP-Status | 'net' | 'probe200' = Skriptfehler, Probe meldet 200).
   options.groups: Name -> Skriptliste; options.exec: Adresse -> Funktion(context) bei Ausfuehrung;
   options.preload=false: Browser ohne Vorladen; options.hangProbe: fetch antwortet nie; options.noFetch. */
function world(statuses, options = {}) {
  const appended = [], removed = [], links = [], probes = [], sleeps = [], warnings = [], executed = [], requests = [];
  const calls = {}, lastStatus = {}, preloaded = new Set(), failedPreload = new Map();
  let clock = 0, pending = [], seq = 0, inflight = 0, overlap = false;
  const fakeTimeout = (fn, ms) => { const id = ++seq; pending.push({ id, fn, at: clock + (ms || 0) }); return id; };
  const fakeClear = id => { pending = pending.filter(t => t.id !== id); };
  const pump = () => new Promise(resolve => setImmediate(() => {
    const next = pending.sort((a, b) => a.at - b.at)[0];
    if (!next) return resolve(false);
    pending = pending.filter(t => t !== next);
    if (next.at > clock) { sleeps.push(next.at - clock); clock = next.at; }
    next.fn(); resolve(true);
  }));
  const network = url => {
    requests.push(url);
    const base = url.split('?')[0];   // der Server ignoriert die Query: Antworten und Zaehler je Pfad
    const list = statuses[base] || [200];
    const n = calls[base] = (calls[base] || 0) + 1;
    return lastStatus[base] = list[Math.min(n, list.length) - 1];
  };
  let context;
  const document = {
    readyState: 'complete',
    head: { appendChild(node) {
      if (node.rel === 'preload') {
        links.push(node.href);
        const outcome = network(node.href);
        setImmediate(() => { if (outcome === 200) { preloaded.add(node.href); node.onload(); } else { failedPreload.set(node.href, outcome); node.onerror(); } });
        return;
      }
      appended.push(node.src);
      if (inflight > 0) overlap = true;
      inflight++;
      let outcome;
      if (preloaded.delete(node.src)) outcome = 200;
      else if (failedPreload.has(node.src)) { outcome = failedPreload.get(node.src); if (!options.webkit) failedPreload.delete(node.src); }
      else outcome = network(node.src);
      setImmediate(() => {
        inflight--;
        if (outcome === 200) {
          executed.push(node.src.split('?')[0]);
          const hook = options.exec && options.exec[node.src.split('?')[0]];
          if (hook) hook(context);
          node.onload();
        } else node.onerror();
      });
    } },
    getElementById: id => {
      const name = id.replace('dx-lazy-', '');
      const list = options.groups ? options.groups[name] : (options.group || null);
      return /^dx-lazy-/.test(id) && list ? { content: { querySelectorAll: () => list.map(src => ({ getAttribute: () => src })) } } : null;
    },
    createElement: tag => tag === 'link'
      ? { relList: options.preload === false ? undefined : { supports: () => true }, remove() { removed.push('link:' + this.href); } }
      : { remove() { removed.push('script:' + this.src); } },
    addEventListener() {}
  };
  context = {
    document, location: { hash: '', reload() {} }, sessionStorage: { getItem: () => null, setItem() {} }, navigator: {},
    setTimeout: fakeTimeout, clearTimeout: fakeClear, module: { exports: {} }, addEventListener() {}, removeEventListener() {},
    Date: { now: () => clock }, Math: { random: () => options.random ?? 0, floor: Math.floor, min: Math.min },
    console: { warn: (...a) => warnings.push(a.join(' ')), error() {} }
  };
  if (!options.noFetch) {
    context.AbortController = class { constructor() { this.signal = {}; } abort() {} };
    context.fetch = (src, init) => {
      probes.push({ src, method: init.method, cache: init.cache });
      if (options.hangProbe) return new Promise(() => {});
      const outcome = lastStatus[src.split('?')[0]];
      if (outcome === 'probe200') return Promise.resolve({ status: 200 });
      if (outcome === 'net') return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve({ status: outcome, text() { throw new Error('Body darf nie gelesen werden'); } });
    };
  }
  context.globalThis = context;
  vm.runInNewContext(source, context);
  const run = async promise => {
    let result;
    promise.then(v => (result = { ok: true, value: v }), e => (result = { ok: false, error: e }));
    while (!result) { await pump(); }
    return result;
  };
  return { api: context.module.exports, appended, removed, links, probes, sleeps, warnings, executed, requests, context, run, clock: () => clock, overlap: () => overlap };
}
const U = '/discover/engines/narrative.js';
const loadOne = w => w.api.load('g');
const one = [U];

test('503 beim ersten Abruf, dann ok: Erfolg, 1 Probe, Wiederholung nach 300 ms, Knoten entfernt', async () => {
  const w = world({ [U]: [503, 200] }, { group: one });
  assert.equal((await w.run(loadOne(w))).ok, true);
  assert.deepEqual(w.probes, [{ src: U, method: 'HEAD', cache: 'no-store' }]);
  assert.deepEqual(w.sleeps, [300]);
  assert.deepEqual(w.executed, [U], 'ausgefuehrt genau einmal');
  assert.ok(w.removed.includes('script:' + U), 'fehlgeschlagener Skriptknoten wird entfernt');
  assert.ok(w.removed.includes('link:' + U), 'Vorlade-Knoten wird entfernt');
});

test('503 immer: genau 3 Ladeversuche, 2 Proben, LAZY_SCRIPT_FAILED mit Originalursache, Gesamtdauer begrenzt', async () => {
  const w = world({ [U]: [503] }, { group: one, random: 0.999 });
  const r = await w.run(loadOne(w));
  assert.equal(r.ok, false);
  assert.match(r.error.message, /^LAZY_SCRIPT_FAILED:\/discover\/engines\/narrative\.js$/);
  assert.equal(r.error.attempts, 3);
  assert.equal(r.error.status, 503);
  assert.equal(w.probes.length, 2);
  assert.equal(w.requests.length, 3, 'ein Abruf (Vorladen) + zwei Wiederholungen des Skripts');
  assert.deepEqual(w.sleeps, [399, 999]);
  assert.ok(w.clock() < 4000, 'Gesamtdauer ' + w.clock());
  assert.deepEqual(w.executed, []);
});

test('nach endgueltigem Fehler gilt das Skript nicht als geladen: spaeterer Aufruf versucht erneut', async () => {
  const w = world({ [U]: [503, 503, 503, 200] }, { group: one });
  assert.equal((await w.run(loadOne(w))).ok, false);
  assert.equal((await w.run(loadOne(w))).ok, true);
  assert.deepEqual(w.executed, [U]);
});

test('404/403/410: sofort Fehler, keine Wiederholung, keine Wartezeit; 429/408 werden wiederholt', async () => {
  for (const status of [404, 403, 410]) {
    const w = world({ [U]: [status] }, { group: one });
    const r = await w.run(loadOne(w));
    assert.equal(r.ok, false, String(status));
    assert.match(r.error.message, /^LAZY_SCRIPT_FAILED:/);
    assert.equal(r.error.attempts, 1);
    assert.equal(r.error.status, status);
    assert.equal(w.probes.length, 1);
    assert.deepEqual(w.sleeps, []);
    assert.equal(w.requests.length, 1, 'kein zweiter Abruf');
  }
  for (const status of [429, 408]) {
    const w = world({ [U]: [status, 200] }, { group: one });
    assert.equal((await w.run(loadOne(w))).ok, true, String(status));
  }
});

test('Netzfehler: begrenzte Wiederholung (3 Versuche), danach derselbe Fehler; ein spaeter Erfolg wird genutzt', async () => {
  const w = world({ [U]: ['net'] }, { group: one });
  const r = await w.run(loadOne(w));
  assert.equal(r.ok, false);
  assert.match(r.error.message, /LAZY_SCRIPT_FAILED:/);
  assert.equal(r.error.status, 0);
  assert.equal(r.error.attempts, 3);
  const ok = world({ [U]: ['net', 200] }, { group: one });
  assert.equal((await ok.run(loadOne(ok))).ok, true);
});

test('Skriptfehler, aber Probe meldet 200: erneut laden, begrenzt auf 3 Versuche', async () => {
  const w = world({ [U]: ['probe200', 200] }, { group: one });
  assert.equal((await w.run(loadOne(w))).ok, true);
  const always = world({ [U]: ['probe200'] }, { group: one });
  const r = await always.run(loadOne(always));
  assert.equal(r.ok, false);
  assert.equal(r.error.attempts, 3);
  assert.equal(r.error.status, 200);
});

test('Budget: haengt die Statusprobe, endet die Wiederholung vor der Zeitgrenze (2 statt 3 Versuche)', async () => {
  const w = world({ [U]: [503] }, { group: one, hangProbe: true });
  const r = await w.run(loadOne(w));
  assert.equal(r.ok, false);
  assert.equal(r.error.attempts, 2, 'der dritte Versuch wuerde das Budget sprengen');
  assert.equal(r.error.status, 0);
  assert.ok(w.clock() <= 3500, 'Dauer bis zum Fehler ' + w.clock());
  assert.ok(w.clock() >= 3000, 'beide Proben liefen in ihre Zeitueberschreitung: ' + w.clock());
});

test('kein fetch verfuegbar: bisheriges Verhalten - sofort Fehler, keine Wiederholung', async () => {
  const w = world({ [U]: [503] }, { group: one, noFetch: true });
  const r = await w.run(loadOne(w));
  assert.equal(r.ok, false);
  assert.equal(r.error.attempts, 1);
});

test('paralleler Aufruf derselben Gruppe (auch waehrend der Wiederholung): ein Ladevorgang', async () => {
  const w = world({ [U]: [503, 200] }, { group: one });
  const r = await w.run(Promise.all([w.api.load('g'), w.api.load('g'), Promise.resolve().then(() => w.api.load('g'))]));
  assert.equal(r.ok, true);
  assert.equal(w.requests.length, 2);
  assert.equal(w.probes.length, 1);
  assert.deepEqual(w.executed, [U]);
});

test('Normalfall: jede Adresse genau einmal angefragt, Reihenfolge wie in der Gruppe, keine Probe, keine Wartezeit', async () => {
  const group = ['/a.js', U, '/c.js', '/d.js'];
  for (const preload of [true, false]) {
    const w = world({}, { groups: { g: group }, preload });
    assert.equal((await w.run(loadOne(w))).ok, true);
    assert.deepEqual(w.requests, group, 'jede Adresse einmal (preload=' + preload + ')');
    assert.deepEqual(w.executed, group);
    assert.deepEqual(w.appended, group);
    assert.deepEqual(w.probes, []);
    assert.deepEqual(w.sleeps, []);
    assert.equal(w.overlap(), false, 'Skripte werden nacheinander eingefuegt');
    assert.deepEqual(w.links, preload ? group : [], 'Vorladen parallel fuer alle');
  }
});

/* Der Befund des Reviews: detail.js haelt beim Laden global.VUChartRanges fest (var Ranges = global.VUChartRanges). */
const capture = { '/ranges.js': ctx => { ctx.VUChartRanges = {}; }, '/detail.js': ctx => { ctx.captured = typeof ctx.VUChartRanges; } };
const chain = ['/charts.js', '/other.js', '/ranges.js', '/mid.js', '/detail.js'];

test('Gruppe, nicht-letztes Skript faellt voruebergehend aus: Wiederholung vor den Nachfolgern, Nachfolger sehen die Globale', async () => {
  for (const preload of [true, false]) for (const failing of ['/charts.js', '/ranges.js', '/mid.js']) {
    const w = world({ [failing]: [503, 200] }, { groups: { g: chain }, exec: capture, preload });
    const r = await w.run(loadOne(w));
    assert.equal(r.ok, true, failing);
    assert.deepEqual(w.executed, chain, 'Reihenfolge unveraendert, jedes Skript genau einmal (' + failing + ', preload=' + preload + ')');
    assert.equal(w.context.captured, 'object', 'detail.js lief nach ranges.js (' + failing + ')');
    assert.equal(w.overlap(), false);
  }
});

test('Gruppe, nicht-letztes Skript faellt dauerhaft aus: Fehler wie bisher, kein Nachfolger wird ausgefuehrt, Gruppe nicht "geladen"', async () => {
  for (const status of [503, 404]) {
    const w = world({ '/ranges.js': [status] }, { groups: { g: chain }, exec: capture });
    const r = await w.run(loadOne(w));
    assert.equal(r.ok, false);
    assert.match(r.error.message, /^LAZY_SCRIPT_FAILED:\/ranges\.js$/);
    assert.deepEqual(w.executed, ['/charts.js', '/other.js'], 'keine Teilausfuehrung der Nachfolger');
    assert.equal(w.context.captured, undefined);
    // spaeterer Aufruf (Server wieder da) laedt den Rest in der richtigen Reihenfolge
    const again = world({ '/ranges.js': [status, 200] }, { groups: { g: chain }, exec: capture });
    assert.equal((await again.run(loadOne(again))).ok, status === 503, 'nur bei 503 heilt schon der interne Versuch');
  }
});

test('Fehler im Gruppenaufruf: Selbstheilung wie bisher (ohne Waechter laedt die Seite einmal neu)', async () => {
  const w = world({ [U]: [404] }, { group: one });
  let reloads = 0;
  w.context.location.reload = () => { reloads++; };
  w.context.sessionStorage.setItem = () => {};
  const r = await w.run(loadOne(w));
  assert.equal(r.ok, false);
  assert.equal(reloads, 1);
});

test('forRoute reicht den Fehler unveraendert an app.js weiter (route()-catch zeigt die Meldung)', async () => {
  const w = world({ [U]: [503] }, { group: one });
  const r = await w.run(w.api.forRoute(['s']));
  assert.equal(r.ok, false);
  assert.match(r.error.message, /^LAZY_SCRIPT_FAILED:/);
  assert.equal(r.error.attempts, 3);
});

test('zwei Gruppen mit demselben Skript (geteiltes Modul): nur einmal angefragt und ausgefuehrt, auch beim Wiederholen', async () => {
  const w = world({ '/shared.js': [503, 200] }, { groups: { detail: ['/shared.js', '/d.js'], markets: ['/shared.js', '/m.js'] } });
  const r = await w.run(Promise.all([w.api.load('detail'), w.api.load('markets')]));
  assert.equal(r.ok, true);
  assert.equal(w.executed.filter(src => src === '/shared.js').length, 1);
  assert.equal(w.requests.filter(src => src.split('?')[0] === '/shared.js').length, 2, 'Vorladen + eine Wiederholung');
  assert.equal(w.probes.length, 1);
});

test('?v=-Stempel: Vorladen und Skript nutzen dieselbe Adresse (sonst gaebe es zwei Downloads)', async () => {
  const group = ['/discover/ui/detail.js?v=abc123', '/quant/x.js'];
  const w = world({}, { groups: { detail: group, g: group } });
  assert.equal((await w.run(w.api.load('detail'))).ok, true);
  assert.deepEqual(w.links, ['/discover/ui/detail.js?v=abc123', '/quant/x.js?v=abc123']);
  assert.deepEqual(w.appended, w.links);
});

test('WebKit-Modell: ein fehlgeschlagener Preload wird fuer identische Adressen wiederverwendet - Wiederholungen nutzen eine neue Adresse', async () => {
  for (const failing of ['/charts.js', '/ranges.js', '/mid.js']) {
    const w = world({ [failing]: [503, 200] }, { groups: { g: chain }, exec: capture, webkit: true });
    const r = await w.run(loadOne(w));
    assert.equal(r.ok, true, failing);
    assert.deepEqual(w.executed, chain);
    assert.equal(w.context.captured, 'object');
    assert.equal(w.appended.filter(src => src.startsWith(failing)).join(), failing + ',' + failing + '?retry=2', 'Versuch 1 mit Originaladresse (Preload-Treffer), Versuch 2 mit retry=2');
    assert.equal(w.probes.length, 1);
    assert.equal(w.probes[0].src, failing, 'Statusprobe auf der Originaladresse');
  }
});

test('WebKit-Modell, dauerhafter 503: Fehler nennt die ORIGINAL-Adresse, 3 Versuche, Wiederholungen mit retry=2/retry=3, kein Nachfolger', async () => {
  const w = world({ '/ranges.js': [503] }, { groups: { g: chain }, exec: capture, webkit: true });
  const r = await w.run(loadOne(w));
  assert.equal(r.ok, false);
  assert.equal(r.error.message, 'LAZY_SCRIPT_FAILED:/ranges.js');
  assert.equal(r.error.attempts, 3);
  assert.equal(r.error.status, 503);
  assert.deepEqual(w.appended.filter(src => src.startsWith('/ranges.js')), ['/ranges.js', '/ranges.js?retry=2', '/ranges.js?retry=3']);
  assert.deepEqual(w.executed, ['/charts.js', '/other.js']);
  assert.equal(w.requests.filter(src => src.startsWith('/ranges.js')).length, 3, 'Vorladen + zwei frische Abrufe');
});

test('Wiederholungsadresse mit vorhandenem ?v=-Stempel haengt &retry=n an; Schluessel und Fehlertext bleiben bei der Originaladresse', async () => {
  const group = ['/discover/ui/detail.js?v=abc123', '/x.js'];
  const w = world({ '/x.js': [503] }, { groups: { detail: group }, webkit: true });
  const r = await w.run(w.api.load('detail'));
  assert.equal(r.ok, false);
  assert.equal(r.error.message, 'LAZY_SCRIPT_FAILED:/x.js?v=abc123');
  assert.deepEqual(w.appended.filter(src => src.startsWith('/x.js')), ['/x.js?v=abc123', '/x.js?v=abc123&retry=2', '/x.js?v=abc123&retry=3']);
  // der Eintrag der Skripte wurde freigegeben: ein spaeterer Aufruf versucht erneut (Schluessel unveraendert)
  const again = await w.run(w.api.load('detail'));
  assert.equal(again.ok, false);
  assert.equal(w.appended.filter(src => src.startsWith('/discover/ui/detail.js')).length, 1, 'bereits geladenes Skript wird nicht erneut eingefuegt');
});
