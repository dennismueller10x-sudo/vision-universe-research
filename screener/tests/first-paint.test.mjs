// Erster Bildaufbau der Startansicht: Kopfdatei (universe-<id>.meta.json)
// statt Warten auf das ganze Universum - ohne andere Werte oder anderes
// Verhalten. Laeuft app.js in einem kleinen Schein-DOM (keine Abhaengigkeiten).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { universeMeta, SCHEMA } from '../../scripts/screener/build-universe.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const FULL_URL = '/screener/data/universe-US_REAL.json';
const META_URL = '/screener/data/universe-US_REAL.meta.json';

// ---------------------------------------------------------------- Artefakte
const artifact = {
  schema: SCHEMA, universeId: 'US_REAL', universeLabel: 'US-Aktien', asOf: '2026-10-09', fundamentalsAsOf: '2026-09-30',
  generatedAt: '2026-10-10T05:00:00.000Z', count: 3, excluded: {}, sanitized: { FOREIGN_FILER: 1 },
  universeRule: 'Testregel', sources: { prices: 'Test' }, technicalIntelligence: null,
  factorPublication: { compositeAllowed: false, rankingAllowed: false }, valuationPolicy: {}, formulas: { perf1w: 'x' },
  dict: { sectors: { tech: 'Technologie' }, majorGroups: {}, divisions: {} },
  coverage: { s: 3 }, columns: ['s', 'n', 'co', 'ipo', 'mcap', 'sec'],
  cols: { s: ['AAA', 'BBB', 'CCC'], n: ['Aaa Inc', 'Bbb Corp', 'Ccc Ltd'], co: ['US', 'US', 'US'], ipo: ['2001-01-01', null, '2010-05-05'], mcap: [3e9, 2e10, null], sec: ['tech', 'tech', null] }
};

test('Kopfdatei = Artefakt ohne cols (gleiche Metadaten)', () => {
  const meta = universeMeta(artifact);
  const { cols, ...rest } = artifact;
  assert.ok(cols);
  assert.deepEqual(meta, rest);
  assert.equal('cols' in meta, false);
  assert.ok(artifact.cols, 'Eingabe bleibt unveraendert');
});

const built = new URL('../data/universe-US_REAL.json', import.meta.url);
const builtMeta = new URL('../data/universe-US_REAL.meta.json', import.meta.url);
test('Gebautes Universum: Kopfdatei entspricht dem Artefakt ohne cols', { skip: !existsSync(built) && 'Artefakt nicht gebaut' }, () => {
  assert.ok(existsSync(builtMeta), 'Kopfdatei fehlt neben dem Artefakt');
  const full = JSON.parse(readFileSync(built, 'utf8'));
  const meta = JSON.parse(readFileSync(builtMeta, 'utf8'));
  const { cols, ...rest } = full;
  assert.ok(cols && Array.isArray(cols.s));
  assert.deepEqual(meta, rest);
  assert.equal(meta.count, cols.s.length);
  assert.ok(readFileSync(builtMeta).length < 64 * 1024, 'Kopfdatei soll klein bleiben');
});

// ---------------------------------------------------------------- Schein-DOM
function makeDom() {
  function classes(el) { return String(el.className || '').split(/\s+/).filter(Boolean); }
  function matches(el, sel) {
    if (el.nodeType !== 1) return false;
    const m = /^([a-z0-9-]*)((?:\.[\w-]+)*)$/i.exec(sel.trim());
    if (!m) return false;
    if (m[1] && el.tagName !== m[1].toUpperCase()) return false;
    const want = m[2].split('.').filter(Boolean), have = classes(el);
    return want.every((c) => have.includes(c));
  }
  function walk(el, fn) { for (const c of el.children || []) { fn(c); walk(c, fn); } }
  function textNode(t) { return { nodeType: 3, data: String(t), parentNode: null, get textContent() { return this.data; }, remove() { detach(this); } }; }
  function detach(n) { if (n.parentNode) { const k = n.parentNode.children; k.splice(k.indexOf(n), 1); n.parentNode = null; } }
  function element(tag) {
    const el = {
      nodeType: 1, tagName: String(tag).toUpperCase(), value: '', children: [], parentNode: null, attributes: {}, className: '', style: {}, listeners: {}, _html: null,
      setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'class') this.className = String(v); },
      getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; },
      addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
      removeEventListener() {},
      dispatch(t) { for (const fn of this.listeners[t] || []) fn.call(this, { type: t, target: this, preventDefault() {}, stopPropagation() {} }); },
      appendChild(n) { detach(n); n.parentNode = this; this.children.push(n); this._html = null; return n; },
      append(...ns) { for (const n of ns) this.appendChild(typeof n === 'string' ? textNode(n) : n); },
      replaceChildren(...ns) { for (const c of this.children.slice()) detach(c); this._html = null; this.append(...ns); },
      replaceWith(n) { const p = this.parentNode; if (!p) return; p.children[p.children.indexOf(this)] = n; n.parentNode = p; this.parentNode = null; },
      remove() { detach(this); },
      contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; },
      querySelector(sel) { let hit = null; walk(this, (c) => { if (!hit && matches(c, sel)) hit = c; }); return hit; },
      querySelectorAll(sel) { const out = []; walk(this, (c) => { if (matches(c, sel)) out.push(c); }); return out; },
      focus() {}, blur() {}, scrollIntoView() {},
      getBoundingClientRect() { return { width: 390, height: 40, left: 0, top: 0 }; },
      get offsetParent() { return this.parentNode; },
      get firstChild() { return this.children[0] || null; },
      get classList() {
        const self = this;
        const set = (list) => { self.className = list.join(' '); };
        return { add(...c) { set([...new Set(classes(self).concat(c))]); }, remove(...c) { set(classes(self).filter((x) => !c.includes(x))); },
          toggle(c, on) { const has = classes(self).includes(c); if (on === undefined ? !has : on) this.add(c); else this.remove(c); }, contains(c) { return classes(self).includes(c); } };
      },
      set textContent(t) { for (const c of this.children.slice()) detach(c); this._html = null; if (t !== '' && t !== null && t !== undefined) this.appendChild(textNode(t)); },
      get textContent() { return this._html !== null ? this._html.replace(/<[^>]*>/g, '') : this.children.map((c) => c.textContent).join(''); },
      set innerHTML(h) { for (const c of this.children.slice()) detach(c); this._html = String(h); },
      get innerHTML() { return this._html || ''; }
    };
    return el;
  }
  const body = element('body'), root = element('div');
  root.setAttribute('id', 'sc-root'); body.appendChild(root);
  const document = {
    title: '', body, activeElement: null,
    createElement: element, createElementNS: (_, t) => element(t), createTextNode: textNode,
    getElementById: (id) => (id === 'sc-root' ? root : null),
    querySelector: (sel) => body.querySelector(sel), querySelectorAll: (sel) => body.querySelectorAll(sel),
    addEventListener() {}, dispatchEvent() {}, contains: (n) => body.contains(n)
  };
  return { document, root, body };
}

function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const tick = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

/** Startet app.js; `respond(url)` liefert ein Promise auf { status, body }. */
function startApp({ search = '', respond }) {
  const { document, root, body } = makeDom();
  const requests = [];
  const store = new Map();
  const win = {
    document, console, setTimeout, clearTimeout, URLSearchParams, Promise, Event: class { constructor(t) { this.type = t; } },
    location: { search, pathname: '/screener/', hash: '', get href() { return 'https://x.test/screener/' + this.search; } },
    history: { length: 1, pushState() {}, replaceState() {}, go() {}, back() {} },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    requestAnimationFrame: (fn) => setTimeout(fn, 0), scrollY: 0, innerWidth: 390, onscroll: null,
    addEventListener() {}, removeEventListener() {}, scrollTo() {},
    fetch: (url, opts) => { requests.push({ url, opts }); return respond(url).then((r) => ({ ok: r.status === 200, status: r.status, json: () => Promise.resolve(JSON.parse(JSON.stringify(r.body))) })); }
  };
  win.window = win; win.globalThis = win;
  vm.createContext(win);
  for (const p of ['screener/engine/fields.js', 'screener/engine/query.js', 'screener/engine/engine.js', 'core/identity.js', 'screener/engine/adapters.js', 'screener/engine/store.js', 'screener/app.js']) {
    vm.runInContext(readFileSync(join(ROOT, p), 'utf8'), win, { filename: p });
  }
  return { win, document, root, body, requests };
}
const text = (root) => root.textContent;
const skeleton = (root) => root.querySelectorAll('.sc-skel').length > 0;
function findButton(root, label) { let hit = null; (function w(n) { for (const c of n.children) { if (!hit && c.tagName === 'BUTTON' && c.textContent.includes(label)) hit = c; if (c.children) w(c); } })(root); return hit; }

test('Startansicht: sofort aus der Kopfdatei, volles Universum laedt parallel, Text identisch', async () => {
  // Referenz: heutiger Ablauf (Kopfdatei fehlt) - Startansicht erst mit dem Universum.
  const ref = startApp({ respond: (u) => Promise.resolve(u === FULL_URL ? { status: 200, body: artifact } : { status: 404 }) });
  await tick();
  assert.equal(skeleton(ref.root), false);
  const expected = text(ref.root);
  assert.match(expected, /Aktien im Universum/);
  assert.match(expected, /Universum: 3 US-Aktien · Kurse Stand 09\.10\.2026 · Fundamentaldaten SEC EDGAR bis 30\.09\.2026/);

  const full = deferred();
  const app = startApp({ respond: (u) => (u === META_URL ? Promise.resolve({ status: 200, body: universeMeta(artifact) }) : u === FULL_URL ? full.promise : Promise.resolve({ status: 404 })) });
  assert.equal(skeleton(app.root), true, 'vor jeder Antwort: Platzhalter wie bisher');
  assert.deepEqual(app.requests.map((r) => r.url).sort(), [FULL_URL, META_URL].sort(), 'volles Universum startet sofort mit, nicht erst bei Bedarf');
  await tick();
  assert.equal(skeleton(app.root), false, 'Startansicht steht ohne Spalten');
  assert.equal(text(app.root), expected, 'Vorschau = spaetere Startansicht');
  assert.equal(app.requests.length, 2, "keine weiteren Abrufe fuer die Startansicht");

  // Eine Aktion, die Spalten braucht, wartet auf das Universum (und laeuft dann).
  findButton(app.root, 'Filter hinzufügen').dispatch('click');
  await tick();
  assert.equal(app.body.querySelectorAll('.sc-sheet').length, 0, 'kein Sheet ohne Daten');
  full.resolve({ status: 200, body: artifact });
  await tick();
  assert.equal(text(app.root), expected, 'nach dem Laden unveraendert');
  assert.equal(app.body.querySelectorAll('.sc-sheet').length, 1, 'wartende Aktion laeuft nach dem Laden genau einmal');
});

test('Kopfdatei fehlt oder ist ungueltig: Platzhalter bis zum Universum wie bisher', async () => {
  for (const meta of [{ status: 404 }, { status: 200, body: { schema: 'falsch', count: 3 } }, { status: 200, body: artifact }]) {
    const full = deferred();
    const app = startApp({ respond: (u) => (u === META_URL ? Promise.resolve(meta) : full.promise) });
    await tick();
    assert.equal(skeleton(app.root), true, JSON.stringify(meta).slice(0, 40));
    full.resolve({ status: 200, body: artifact });
    await tick();
    assert.equal(skeleton(app.root), false);
  }
});

test('Link mit Zustand (?view=…): keine Kopfdatei, Platzhalter bis zum Universum', async () => {
  const full = deferred();
  const app = startApp({ search: '?view=saved', respond: (u) => (u === FULL_URL ? full.promise : Promise.resolve({ status: 200, body: universeMeta(artifact) })) });
  await tick();
  assert.deepEqual(app.requests.map((r) => r.url), [FULL_URL]);
  assert.equal(skeleton(app.root), true);
  full.resolve({ status: 200, body: artifact });
  await tick();
  assert.equal(skeleton(app.root), false);
  assert.match(text(app.root), /Gespeicherte Screens|Gespeichert/);
});

test('Universum scheitert nach der Vorschau: Fehleransicht wie bisher, wartende Aktion verfaellt', async () => {
  const full = deferred();
  const app = startApp({ respond: (u) => (u === META_URL ? Promise.resolve({ status: 200, body: universeMeta(artifact) }) : full.promise) });
  await tick();
  assert.equal(skeleton(app.root), false);
  findButton(app.root, 'Filter hinzufügen').dispatch('click');
  full.resolve({ status: 404 });
  await tick();
  assert.match(text(app.root), /Screener-Daten nicht verfügbar/);
  assert.equal(app.body.querySelectorAll('.sc-sheet').length, 0);
});
