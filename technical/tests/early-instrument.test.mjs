// K3 (Owner 07.11.2026, Tempo): ein Chart-Deep-Link laedt sein Instrument per Preload aus dem <head>.
// Der Preload muss exakt die Adresse treffen, die die Seite spaeter mit fetch() liest, sonst laedt der Browser doppelt.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const M = createRequire(import.meta.url)('../engine/model.js');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = html.match(/<!-- K3:[^\n]*\n<script>([\s\S]*?)<\/script>/)[1];

function preloadFor(hash) {
  const appended = [];
  const document = {createElement: () => ({}), head: {appendChild: l => appended.push(l)}};
  vm.runInNewContext(script, {location: {hash}, document, decodeURIComponent});
  return appended;
}

test('K3 · Preload-Adresse gleich technicalPaths()[0], Ticker wie parseRoute normalisiert', () => {
  for (const [hash, t] of [['#/chart/NVDA', 'NVDA'], ['#/chart/brk.b/studio', 'BRK.B'], ['#chart/msft?x=1', 'MSFT']]) {
    const [l] = preloadFor(hash);
    assert.equal(l.href, M.technicalPaths(t)[0]);
    assert.equal(M.parseRoute(hash).ticker, t);
    assert.equal(l.rel, 'preload'); assert.equal(l.as, 'fetch'); assert.equal(l.crossOrigin, 'anonymous');
  }
});

test('K3 · kein Preload ohne gueltigen Ticker', () => {
  for (const hash of ['', '#/', '#/screener', '#/chart/', '#/chart/<script>', '#/chart/ABCDEFGHIJKLMN']) assert.equal(preloadFor(hash).length, 0, hash);
});
