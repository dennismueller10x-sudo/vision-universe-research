// Market Pulse: neue 52W-Hochs und -Tiefs symmetrisch (beide Schlusskurs gegen Fensterextrem).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require = createRequire(import.meta.url);
const MP = require('../engines/multi-asset/market-pulse.js');

const row = (v, st = {}) => ({values: v, fieldStatus: st});

test('beide Seiten nach derselben Regel und mit demselben Nenner', () => {
  const rows = [
    row({newHigh52w: true, closeAtHigh52w: false, distanceTo52wLow: 0.4}),  // nur Tageshoch beruehrt -> kein Schluss-Hoch
    row({newHigh52w: true, closeAtHigh52w: true, distanceTo52wLow: 0.5}),
    row({closeAtHigh52w: false, distanceTo52wLow: 0}),
    row({closeAtHigh52w: false, distanceTo52wLow: -0.000001}),
    row({closeAtHigh52w: false, distanceTo52wLow: 0.01}),
    row({closeAtHigh52w: null, distanceTo52wLow: 0}),                      // unvollstaendig: nicht im Nenner
    row({closeAtHigh52w: true, distanceTo52wLow: 0.2}, {closeAtHigh52w: 'INSUFFICIENT_HISTORY'})
  ];
  const x = MP.breadthExtremes(rows);
  assert.equal(x.version, MP.EXTREMES_VERSION);
  assert.deepEqual([x.newHighs.count, x.newLows.count], [1, 2]);
  assert.equal(x.newHighs.evaluated, 5);
  assert.equal(x.newLows.evaluated, 5);
});

test('Evidenz traegt die ehrliche Beschriftung und die Methodik nennt die Regel', () => {
  const x = MP.breadthExtremes([row({closeAtHigh52w: true, distanceTo52wLow: 0.1})]);
  const d = MP.breadth({universe: {label: 'U'}, asOf: '2026-10-02', expectedAsOf: '2026-10-02',
    above50: {matched: 1, evaluated: 2}, above200: {matched: 1, evaluated: 2},
    extremesVersion: x.version, newHighs: x.newHighs, newLows: x.newLows});
  const ev = Object.fromEntries(d.evidence.map((e) => [e.key, e]));
  assert.equal(ev.newHighs.label, 'Schluss auf 52-Wochen-Hoch');
  assert.equal(ev.newLows.label, 'Schluss auf 52-Wochen-Tief');
  assert.match(d.methodology, /beide den Schlusskurs/);
});

test('Produzent nutzt die symmetrische Zaehlung, nicht mehr newHigh52w gegen Schlusskurs-Tief', () => {
  const src = readFileSync(new URL('../../scripts/market/build-market-pulse.mjs', import.meta.url), 'utf8');
  assert.match(src, /MP\.breadthExtremes\(rows\)/);
  assert.doesNotMatch(src, /cnt\("newHigh52w"/);
});
