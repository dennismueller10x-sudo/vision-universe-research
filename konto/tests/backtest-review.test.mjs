// Interne Backtest-Vorschau (/konto/admin/backtests/): ohne Sitzung keine Anfrage, nur Serverdaten, Grenzen immer,
// jede Zahl mit Bezeichnung und Nachweisart, keine Verlinkung von oeffentlichen Seiten.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const KONTO = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(KONTO, '..');
const R = require('../admin/backtests/review.js');
const BUNDLE = JSON.parse(readFileSync(join(ROOT, 'workers/vu-account/data/backtest-review-bundle.json'), 'utf8'));

// Antworten in der Form des Konto-Workers (workers/vu-account/src/backtests.mjs), aus dem committeten Paket.
const FRAME = {audience: BUNDLE.audience, label: BUNDLE.label, trust: BUNDLE.trust, certification: 'NOT_CERTIFIED', productionApproved: false,
  publiclyActivated: false, claim: BUNDLE.claim, limits: BUNDLE.limits, masterGeneration: BUNDLE.masterGeneration, catalogHash: BUNDLE.catalogHash,
  previewHash: BUNDLE.previewHash, bundleHash: BUNDLE.bundleHash, certificationArtifact: BUNDLE.certificationArtifact,
  evidenceClasses: BUNDLE.evidenceClasses, stateLabels: BUNDLE.stateLabels};
const OVERVIEW = {state: 'OK', ...FRAME, menu: BUNDLE.menu, kinds: BUNDLE.kinds,
  precomputed: BUNDLE.entries.map(e => ({label: e.label, selection: e.selection, template: e.template, kind: e.kind, specHash: e.specHash, stateCode: e.stateCode, evidence: e.evidence}))};
const found = e => ({state: 'PRECOMPUTED', ...FRAME, specHash: e.specHash, entry: e});
const NOT = {state: 'NOT_PRECOMPUTED', display: 'nicht vorgerechnet', ...FRAME, specHash: 'a'.repeat(64), template: 'signal-2022-bear', kind: 'SIGNAL_BACKTEST'};

// ------------------------------------------------------------ minimales DOM (nur was review.js nutzt)
class Node {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; this.own = ''; this.hidden = false; this.listeners = {}; this.value = undefined; this.checked = false; }
  get textContent() { return this.own + this.children.map(c => c.textContent).join(''); }
  set textContent(v) { this.own = String(v); this.children = []; if (this.tag === 'select') this.value = undefined; }
  set className(v) { this.attrs.class = v; }
  get className() { return this.attrs.class || ''; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'value') this.value = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  appendChild(c) { this.children.push(c); if (this.tag === 'select' && this.value === undefined && c.tag === 'option') this.value = c.attrs.value; return c; }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  fire(t) { for (const fn of this.listeners[t] || []) fn.call(this, {preventDefault() {}}); }
  all() { return [this, ...this.children.flatMap(c => c.all())]; }
  querySelector(sel) { return sel === 'button[type=submit]' ? (this.button ||= new Node('button')) : null; }
}
function fakeDocument() {
  const ids = {};
  const doc = {
    createElement: tag => new Node(tag),
    getElementById: id => (ids[id] ||= Object.assign(new Node(id.startsWith('br-') && /kind|template|cost|benchmark|factor$|precomputed|methods/.test(id) ? 'select' : 'div'), {id})),
    querySelectorAll: sel => {
      const m = /^input\[name=(.+)\]$/.exec(sel);
      return Object.values(ids).flatMap(n => n.all()).filter(n => m && n.tag === 'input' && n.attrs.name === m[1]);
    }
  };
  for (const id of ['br-from', 'br-to']) doc.getElementById(id).value = '';
  doc.getElementById('br-methods').value = '';
  doc.getElementById('br-wrap').hidden = true; doc.getElementById('br-result').hidden = true;
  return doc;
}
function fakeApi(replies) {
  const calls = [];
  const reply = (method, path, body) => { calls.push({method, path, body}); const r = replies(method, path, body); return Promise.resolve(r); };
  return {calls, get: p => reply('GET', p), post: (p, b) => reply('POST', p, b), message: s => 'Meldung ' + s};
}
const texts = node => node.all().map(n => n.own).filter(Boolean);

test('ohne Sitzung (oder ohne Endpunkt) keine Anfrage an die Vorschau', async () => {
  const api = fakeApi(() => ({ok: true, status: 200, data: OVERVIEW}));
  const doc = fakeDocument();
  const out = await R.start({api, doc, requireSession: () => Promise.resolve(null), notice: () => {}, disableForms: () => {}});
  assert.equal(out, null);
  assert.deepEqual(api.calls, [], 'keine Anfrage ohne Sitzung');
  assert.equal(doc.getElementById('br-wrap').hidden, true, 'nichts aufgedeckt');
  const js = readFileSync(join(KONTO, 'konto.js'), 'utf8');
  const view = js.slice(js.indexOf("views['backtest-review']"), js.indexOf('// Navigation innerhalb des Kontos'));
  assert.ok(view.indexOf('A.available()') < view.indexOf('VUBacktestReview.start'), 'ohne Endpunkt: unavailable() vor jeder Anfrage');
  assert.ok(view.includes('requireSession: requireSession'), 'Sitzung wird vor der Anfrage geprueft (requireSession aus konto.js)');
});

test('Ablauf: Uebersicht vom Server, Auswahl geht an den Server, Ergebnis nur aus der Antwort', async () => {
  const sigEntry = BUNDLE.entries.find(e => e.label.startsWith('Signal 2022 Baer, nur TREND_DOWN, 1.'));
  const api = fakeApi((m, p, b) => {
    if (m === 'GET' && p === '/v1/admin/backtests') return {ok: true, status: 200, state: 'OK', data: OVERVIEW};
    if (m === 'POST' && p === '/v1/admin/backtests/lookup') {
      const e = BUNDLE.entries.find(x => JSON.stringify(x.selection) === JSON.stringify(b.selection));
      return {ok: true, status: 200, data: e ? found(e) : NOT};
    }
    throw new Error('unerwartet ' + m + ' ' + p);
  });
  const doc = fakeDocument(), notes = [];
  await R.start({api, doc, requireSession: () => Promise.resolve({id: 'u'}), notice: (t, k) => notes.push([t, k]), disableForms: () => {}});
  assert.deepEqual(api.calls.map(c => c.method + ' ' + c.path), ['GET /v1/admin/backtests']);
  assert.equal(doc.getElementById('br-wrap').hidden, false);
  const frame = doc.getElementById('br-frame').textContent;
  for (const l of BUNDLE.limits) assert.ok(frame.includes(l), 'Grenze sichtbar: ' + l);
  assert.ok(frame.includes('NOT_CERTIFIED') && frame.includes('productionApproved: false'));
  assert.equal(doc.getElementById('br-kinds').children.length, 6);
  // Formular: Signal-Backtest, Vorlage signal-2022-bear, Zeitraum, Regel TREND_DOWN -> exakt die registrierte Auswahl.
  doc.getElementById('br-kind').value = 'SIGNAL_BACKTEST'; doc.getElementById('br-kind').fire('change');
  doc.getElementById('br-template').value = 'signal-2022-bear';
  doc.getElementById('br-from').value = '2022-01-01'; doc.getElementById('br-to').value = '2022-06-30';
  doc.querySelectorAll('input[name=br-rule]').find(n => n.attrs.value === 'TREND_DOWN').checked = true;
  doc.getElementById('br-form').fire('submit');
  await new Promise(r => setImmediate(r));
  const post = api.calls.at(-1);
  assert.equal(post.path, '/v1/admin/backtests/lookup');
  assert.equal(JSON.stringify(post.body.selection), JSON.stringify(sigEntry.selection), 'gleiche Schluesselreihenfolge wie das Raster');
  const res = doc.getElementById('br-result');
  assert.equal(res.hidden, false); assert.equal(res.getAttribute('data-state'), 'PRECOMPUTED');
  assert.ok(res.textContent.includes(sigEntry.evidence.label));
  assert.ok(res.textContent.includes(R.pct(sigEntry.display.metrics.hitRate)), 'Trefferquote aus der Antwort');
  for (const l of BUNDLE.limits) assert.ok(res.textContent.includes(l));
  // Nicht vorgerechnet: kein Ergebnis, Grenzen trotzdem.
  doc.getElementById('br-cost').value = 'NONE';
  doc.getElementById('br-form').fire('submit');
  await new Promise(r => setImmediate(r));
  assert.equal(res.getAttribute('data-state'), 'NOT_PRECOMPUTED');
  assert.ok(res.textContent.includes('nicht vorgerechnet'));
  for (const l of BUNDLE.limits) assert.ok(res.textContent.includes(l));
  assert.equal(res.all().some(n => n.tag === 'table'), false, 'keine Zahlentabelle ohne vorgerechnetes Ergebnis');
});

test('Fehler vom Server: Meldung, keine Daten, Formulare gesperrt', async () => {
  for (const state of ['PREVIEW_NOT_ACTIVATED', 'NOT_BACKTEST_REVIEWER', 'BACKTEST_BUNDLE_INVALID']) {
    const api = fakeApi(() => ({ok: false, status: 403, state, data: {state}}));
    const doc = fakeDocument(), notes = []; let disabled = false;
    await R.start({api, doc, requireSession: () => Promise.resolve({id: 'u'}), notice: (t, k) => notes.push([t, k]), disableForms: () => { disabled = true; }});
    assert.equal(disabled, true);
    assert.equal(doc.getElementById('br-wrap').hidden, true);
    assert.equal(notes.at(-1)[1], 'error'); assert.equal(notes.at(-1)[0], R.MESSAGES[state]);
  }
});

test('jede Zahl mit Bezeichnung, Nachweisart und Grundlage; Grenzen und Zertifizierung in jedem Ergebnis', () => {
  for (const e of BUNDLE.entries) {
    const m = R.resultModel(found(e));
    assert.equal(m.badge, e.evidence.label);
    for (const s of m.sections) for (const row of s.rows) {
      assert.equal(row.length, 4, s.title);
      assert.ok(row[0].length > 0, 'Bezeichnung');
      assert.equal(row[2], e.evidence.label, 'Nachweisart je Zeile');
      assert.ok(row[3].length > 0, 'Grundlage');
    }
    assert.deepEqual(m.limits, BUNDLE.limits);
    assert.ok(m.certification.some(l => l.includes('NOT_CERTIFIED') && l.includes('productionApproved: false')));
    assert.ok(m.certification.some(l => l.includes('Zertifizierte Arten laut Artefakt: keine')));
  }
  for (const d of [NOT, {state: 'UNAVAILABLE', ...FRAME}]) {
    const m = R.resultModel(d);
    assert.deepEqual(m.sections, []);
    assert.deepEqual(m.limits, BUNDLE.limits);
    assert.ok(m.certification.length >= 3);
  }
  const strategyB = BUNDLE.entries.find(e => e.stateCode === 'B');
  const mb = R.resultModel(found(strategyB));
  assert.equal(mb.badge, 'Nicht gerechnet (Eingaben fehlen)');
  assert.ok(mb.sections.flatMap(s => s.rows).filter(r => ['Gesamtrendite', 'Rendite p. a. (CAGR)', 'Maximaler Drawdown'].includes(r[0])).every(r => r[1] === '–'),
    'fehlende Zahlen bleiben leer, nichts wird ergaenzt');
});

test('nur Serverdaten: Anzeige folgt der Antwort, nichts wird im Browser gerechnet oder nachgeladen', () => {
  const e = structuredClone(BUNDLE.entries.find(x => x.kind === 'STRATEGY_BACKTEST' && x.stateCode === 'A'));
  const doc = fakeDocument(), mount = doc.createElement('section');
  R.renderResult(doc, mount, R.resultModel(found(e)));
  assert.ok(mount.textContent.includes(R.pct(e.display.metrics.cagr)));
  e.display.metrics.cagr = 0.0123; e.display.metrics.totalReturn = 0.9;
  const again = doc.createElement('section');
  R.renderResult(doc, again, R.resultModel(found(e)));
  assert.ok(again.textContent.includes(R.pct(0.0123)), 'CAGR wie geliefert, nicht aus der Gesamtrendite abgeleitet');
  assert.ok(texts(again).every(t => typeof t === 'string'));
  const src = readFileSync(join(KONTO, 'admin/backtests/review.js'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML|document\.write|eval\(|new Function/.test(src), 'nur textContent');
  assert.ok(!/\bfetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage/.test(src), 'keine eigenen Anfragen, kein Speicher');
  assert.deepEqual([...new Set(src.match(/'\/v1\/[^']*'/g))].sort(), ["'/v1/admin/backtests'", "'/v1/admin/backtests/lookup'"]);
  assert.ok(!/Math\.(pow|exp|log|sqrt)|reduce\(/.test(src), 'keine Kennzahlrechnung im Browser');
});

test('Seite: noindex, gemeinsame Shell, nicht verlinkt von oeffentlichen Seiten oder der Navigation', () => {
  const html = readFileSync(join(KONTO, 'admin/backtests/index.html'), 'utf8');
  assert.ok(html.includes('<meta name="robots" content="noindex,nofollow">'));
  assert.ok(html.includes('data-view="backtest-review"'));
  assert.ok(html.indexOf('/konto/admin/backtests/review.js') < html.indexOf('/konto/konto.js'), 'Ansicht vor der Seitensteuerung geladen');
  assert.ok(!/\son[a-z]+=|style="|<script[^>]+src="https?:/.test(html));
  let refs = [];
  try {
    refs = execFileSync('git', ['grep', '--untracked', '-l', '-F', '/konto/admin/backtests', '--', '.', ':!docs', ':!konto/admin/backtests', ':!konto/tests'],
      {cwd: ROOT, encoding: 'utf8'}).trim().split('\n').filter(Boolean);
  } catch (e) { if (e.status !== 1) throw e; }
  assert.deepEqual(refs, [], 'kein Link ausser auf der Seite selbst');
  for (const f of ['assets/site-navigation.js', 'konto/admin/tarife/index.html', 'konto/index.html', 'index.html'])
    assert.equal(readFileSync(join(ROOT, f), 'utf8').includes('admin/backtests'), false, f);
});
