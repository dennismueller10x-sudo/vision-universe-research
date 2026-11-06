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
