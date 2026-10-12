import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

/* Startseite (/): Render-Budget.
   Die Messung (LCP, TBT, Eingabeverzoegerung) liegt in der PR-Beschreibung; diese Tests halten die
   Ursachen fest, damit sie nicht still zurueckkehren:
   - Dauerlaeufer (infinite) animieren nur transform/opacity (Compositor) - kein box-shadow, filter,
     clip-path, text-shadow, Custom Property; eine dauerhaft laufende Main-Thread-Animation haelt sonst
     jeden Frame der Seite im Style-Neuaufbau.
   - Abschnitte unterhalb des ersten Bildschirms sind mit content-visibility:auto ausgezeichnet und haben
     eine Hoehenschaetzung (sonst springen Scrollleiste und Anker).
   - Bei reduzierter Bewegung stehen auch Pseudo-Elemente still (das * allein erfasst sie nicht).
   - Das Hero-JavaScript schreibt nichts je Frame und laeuft erst nach dem ersten Zeichnen. */
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = p => readFileSync(join(root, p), 'utf8');
const css = read('assets/home/home.css');
const html = read('index.html');
const template = read('scripts/home/index.template.html');
const intro = read('assets/home/hero-intro.js');
const motion = read('assets/home/home-motion.js');

const keyframes = Object.fromEntries([...css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)].map(m => [m[1], m[2]]));

test('Dauerlaeufer animieren nur Compositor-Eigenschaften (oder sind an Sichtbarkeit gebunden)', () => {
  const infinite = [...css.matchAll(/([^{}]+)\{[^{}]*animation:([^;}]*infinite[^;}]*)[;}]/g)];
  assert.ok(infinite.length >= 5, 'erwartet: hudspin, bob, marquee, flow, livepulse, filmpulse ...');
  const gated = new Set(['flow']);                                  // stroke-dashoffset: nur sichtbar (.hub.on)
  for (const [, selector, decl] of infinite) {
    for (const name of decl.split(',').map(d => d.trim().split(/\s+/)[0])) {
      if (!keyframes[name]) continue;
      if (gated.has(name)) continue;
      const bad = keyframes[name].match(/box-shadow|filter|clip-path|text-shadow|--[\w-]+\s*:|stroke-dash|background|width|height|top|left/);
      assert.equal(bad, null, `@keyframes ${name} (${selector.trim()}) animiert ${bad && bad[0]} im Dauerlauf`);
    }
  }
  assert.match(css, /\.hub:not\(\.on\) \.hub-lines g\[stroke\]\{animation-play-state:paused\}/, 'flow laeuft nur, solange der Kreis im Bild ist');
});

test('Eine dauerhaft laufende @property-/Custom-Property-Animation (frueher --a im HUD) gibt es nicht mehr', () => {
  assert.doesNotMatch(css, /@property\s+--a/);
  assert.doesNotMatch(css, /@keyframes hudspin\{to\{--a/);
});

test('Jeder data-cv-Abschnitt hat content-visibility:auto und eine Hoehenschaetzung in drei Breiten', () => {
  const marked = [...html.matchAll(/<(?:section|div|footer)\b[^>]*\bdata-cv\b[^>]*>/g)].map(m => m[0]);
  assert.equal(marked.length, [...template.matchAll(/\bdata-cv\b/g)].length, 'index.html entspricht dem Template (Generator ausfuehren)');
  assert.ok(marked.length >= 15);
  const autoBlock = css.match(/RENDER-KOSTEN[\s\S]*?\{content-visibility:auto\}/)[0];
  const sizes = css.slice(css.indexOf('RENDER-KOSTEN'));
  const tiers = Number(css.match(/(\d+) Stufen mit/)[1]);
  assert.ok(tiers >= 12, 'Hoehenschaetzung in feinen Breitenstufen (320-1920 px)');
  assert.equal([...css.matchAll(/@media \(min-width:\d+px\)\{#app-module\{contain-intrinsic/g)].length, tiers - 1);
  const covered = [];
  for (const tag of marked) {
    const id = (tag.match(/\bid="([^"]+)"/) || [])[1];
    const first = ((tag.match(/\bclass="([^"]+)"/) || [])[1] || '').split(' ')[0];
    const candidates = [id && '#' + id, first && '.' + first].filter(Boolean);
    const sel = candidates.find(c => autoBlock.includes(c + ',') || autoBlock.includes(c + '{'));
    if (!sel) { covered.push(null); continue; }                       // ohne id/Klasse: Position, siehe unten
    covered.push(sel);
    assert.equal(sizes.split(`${sel}{contain-intrinsic-block-size:auto `).length - 1, tiers, `${sel}: Hoehenschaetzung in jeder Breitenstufe`);
  }
  assert.equal(covered.filter(c => c === null).length, 3, 'genau drei Abschnitte werden ueber nth-of-type angesprochen');
  // Abschnitte ohne id werden ueber ihre Position angesprochen
  for (const n of [8, 9, 11]) assert.equal(sizes.split(`main > section:nth-of-type(${n}){contain-intrinsic-block-size:auto `).length - 1, tiers);
  assert.match(css, /\.cv-on\{content-visibility:visible!important\}/);
});

test('Ueber dem ersten Bildschirm (Kopf, Hero, Kennzahlen) steht kein content-visibility', () => {
  const autoBlock = css.match(/RENDER-KOSTEN[\s\S]*?\{content-visibility:auto\}/)[0];
  for (const s of ['#hero', '#lp-head', '.hero', '.stats', '.lp-head']) assert.ok(!autoBlock.includes(s), s);
});

test('Reduzierte Bewegung stoppt auch ::before und ::after', () => {
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{html\{scroll-behavior:auto\}\*,\*::before,\*::after\{animation:none!important;transition:none!important\}\}/);
});

test('Hero-JavaScript: kein Schreiben je Frame, Einrichtung nach dem ersten Zeichnen, Orbit/Lichtpunkt als Web Animation', () => {
  assert.doesNotMatch(intro, /getPointAtLength\([^)]*\)[^;]*\n[^\n]*setAttribute\('cx'/, 'kein cx/cy-Schreiben je Frame');
  assert.doesNotMatch(intro, /requestAnimationFrame\(frame\)|function frame\(/);
  assert.match(intro, /function afterPaint\(fn\)/);
  assert.match(intro, /\.animate\(frames\(/, 'Orbit als Web Animation');
  assert.match(intro, /iterations: 2/, 'Lichtpunkt: zwei Runden, danach Ruhe (Main-Thread-Animation)');
  assert.match(intro, /prefers-reduced-motion|classList\.contains\('intro'\)/);
});

test('home-motion.js: Einrichtung im Leerlauf bzw. bei erster Eingabe, Abschnitte als eigene Aufgaben', () => {
  assert.match(motion, /requestIdleCallback/);
  assert.match(motion, /steps\.push\(function (huds|hub|journey|stats|deck|film)\(/);
  assert.match(motion, /boot\(true\)/, 'erste Eingabe startet alles sofort (Klick geht nicht ins Leere)');
  assert.doesNotMatch(motion, /\.toLocaleString\(/, 'Intl.NumberFormat einmal anlegen statt je Aufruf');
  assert.match(motion, /function release\(id\)/, 'Anker geben davorliegende Abschnitte frei');
});

test('Die Hero-Textzeitachse startet sofort (Ueberschrift ohne Verzoegerung), Endzustand unveraendert', () => {
  assert.match(css, /html\.intro \.hero h1\{animation:hx-up \.45s 0s /);
  assert.match(css, /@keyframes hx-up\{from\{opacity:0;transform:translateY\(26px\);filter:blur\(8px\)\}to\{opacity:1;transform:none;filter:none\}\}/);
});

test('Ungueltige Hashes (#%zz) brechen home-motion.js nicht ab: Einrichtung bleibt verdrahtet (Verhalten)', () => {
  for (const hash of ['#%zz', '#%E0%A4%A', '#%', '#vorsorge', '#']) {
    const listeners = [];
    const node = () => ({ classList: { add() {}, toggle() {}, remove() {}, contains: () => false }, contains: () => false, compareDocumentPosition: () => 4, addEventListener() {}, setAttribute() {}, querySelector: () => null, querySelectorAll: () => [] });
    const doc = { readyState: 'complete', getElementById: id => (id === 'vorsorge' ? node() : null), querySelector: () => null, querySelectorAll: sel => (sel === '[data-cv]' ? [node()] : []), addEventListener: (n, f) => listeners.push(['doc', n, f]) };
    const win = { location: { hash }, matchMedia: () => ({ matches: false }), addEventListener: (n, f) => listeners.push(['win', n, f]), requestIdleCallback: f => listeners.push(['idle', 'idle', f]), scrollY: 0 };
    const sandbox = { window: win, document: doc, location: win.location, IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} }, performance: { now: () => 0 }, requestIdleCallback: win.requestIdleCallback, requestAnimationFrame: f => f(), setTimeout: f => f(), clearTimeout() {}, Intl, Math, Set, console };
    sandbox.globalThis = sandbox;
    assert.doesNotThrow(() => vm.runInNewContext(motion, sandbox), `Hash ${hash}`);
    assert.ok(listeners.some(l => l[1] === 'scroll'), `Hash ${hash}: Eingabe-Start nicht verdrahtet`);
    assert.ok(listeners.some(l => l[1] === 'idle'), `Hash ${hash}: Leerlauf-Start nicht verdrahtet`);
    const click = listeners.find(l => l[0] === 'doc' && l[1] === 'click')[2];
    assert.doesNotThrow(() => click({ target: { closest: () => ({ getAttribute: () => '#%zz' }) } }));
    const hc = listeners.find(l => l[1] === 'hashchange')[2];
    assert.doesNotThrow(() => hc());
  }
});
