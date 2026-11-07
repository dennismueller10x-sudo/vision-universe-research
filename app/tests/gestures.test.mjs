import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const G = createRequire(import.meta.url)('../../assets/vu-gestures.js');
test('edge exclusive to first 20px and primary left pointer', () => {
  for (const x of [0, 10, 20]) assert.equal(G.edgeStart(x, true, 0), true);
  for (const x of [-1, 20.01, 80]) assert.equal(G.edgeStart(x, true, 0), false);
  assert.equal(G.edgeStart(10, false, 0), false); assert.equal(G.edgeStart(10, true, 2), false);
});
test('horizontal intent; vertical scroll, leftward movement and jitter', () => {
  assert.equal(G.intent(4, 5), 'pending'); assert.equal(G.intent(30, 10), 'back');
  assert.equal(G.intent(10, 30), 'cancel'); assert.equal(G.intent(-30, 0), 'cancel');
});
test('35% threshold inclusive, cancel always springs back; no velocity shortcut', () => {
  assert.equal(G.release(136.49, 390, false), false); assert.equal(G.release(136.5, 390, false), true);
  assert.equal(G.release(390, 390, true), false); assert.equal(G.release(0, 0, false), false);
});
test('sheet snap points and abort preserve previous detent', () => {
  assert.equal(G.sheetTarget(186, 844, false, false), 'close');
  assert.equal(G.sheetTarget(-102, 844, false, false), 'full');
  assert.equal(G.sheetTarget(10, 844, false, false), 'half');
  assert.equal(G.sheetTarget(400, 844, true, true), 'full');
  assert.equal(G.sheetTarget(-400, 844, false, true), 'half');
});
test('reduced motion removes settling animation without changing thresholds', () => {
  assert.equal(G.duration(true), 0); assert.equal(G.duration(false), 240);
  assert.equal(G.release(140, 390, false), true);
});
test('K1: native edge flag only from the iOS app user agent', () => {
  assert.equal(G.nativeEdge('Mozilla/5.0 (iPhone) VUApp/1 VUEdge/1'), true);
  assert.equal(G.nativeEdge('Mozilla/5.0 (Linux; Android) VUApp/1'), false);
  assert.equal(G.nativeEdge(''), false);
});
test('K1: nav state for the native gesture (Navigation API keys, home, sheet)', () => {
  const entries = [{key: 'a', index: 0}, {key: 'b', index: 1}, {key: 'c', index: 2}];
  const nav = {currentEntry: entries[1], entries: () => entries, canGoForward: true};
  assert.deepEqual(G.navState(nav, null, false, false), {type: 'vu:nav-state', back: true, forward: true, key: 'b', backKey: 'a', forwardKey: 'c'});
  const home = G.navState({currentEntry: entries[0], entries: () => entries, canGoForward: false, canGoBack: false}, null, false, true);
  assert.equal(home.back, false); assert.equal(home.backKey, null);
  const sheet = G.navState(nav, null, true, true);
  assert.equal(sheet.back, true); assert.equal(sheet.forward, false); assert.equal(sheet.key, 'b#sheet'); assert.equal(sheet.backKey, 'b');
  const old = G.navState(undefined, {href: 'https://research.visionuniverse.de/quant/#/aktie/NVDA'}, false, false);
  assert.equal(old.key, 'https://research.visionuniverse.de/quant/#/aktie/NVDA'); assert.equal(old.forward, false); assert.equal(old.backKey, null);
});
test('K4: Tipp-Gefuehl nur in der App; Fliesstext bleibt markierbar', async () => {
  const css = (await import('node:fs')).readFileSync(new URL('../../assets/vu-gestures.css', import.meta.url), 'utf8');
  const k4 = css.slice(css.indexOf('/* K4'));
  for (const line of k4.split('\n').filter(l => /^\[data|^@media/.test(l))) assert.match(line, /\[data-vu-gestures\]/);
  assert.match(k4, /touch-action:manipulation/);
  assert.match(k4, /:active\{opacity:\.62;transition:opacity 0s\}/);
  assert.doesNotMatch(k4, /(^|[,{\s])p[,{\s]|body\{[^}]*user-select:none/);
});
