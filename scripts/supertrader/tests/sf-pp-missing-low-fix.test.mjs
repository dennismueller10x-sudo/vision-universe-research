// Power-Play-Fix fehlendes Korrekturtief (sf-minervini-1.0.1 / sf-minervini-components-1.0.1): Vorher/Nachher.
// Die alte Logik liegt eingefroren in research/pp-missing-low-comparison.mjs und dient nur dem Nachweis.
import test from 'node:test';
import assert from 'node:assert/strict';
import { powerPlayClassify } from '../source-faithful/research/minervini-components.mjs';
import { legacyPowerPlayClassify, transitionsAt, transitionsDaily } from '../source-faithful/research/pp-missing-low-comparison.mjs';
import { powerPlaySetupSeries, powerPlaySetupAt } from '../source-faithful/research/minervini-lifecycle.mjs';

const day = (k) => new Date(Date.UTC(2019, 0, 1) + k * 864e5).toISOString().slice(0, 10);
const bar = (k, c, lo = c * 0.998) => ({ date: day(k), open: c, high: c * 1.002, low: lo, close: c, volume: 1e6, rawClose: c, rawVolume: 1e6, splitAdj: 1 });
function missingLowCase() {
  const b = [], add = (c, lo) => b.push(bar(b.length, c, lo));
  for (let k = 0; k < 60; k++) add(10);
  for (let k = 0; k < 30; k++) add(10 + k * 0.5);
  for (let k = 0; k < 5; k++) add(23);
  add(23, NaN);
  for (let k = 0; k < 5; k++) add(15);
  for (let k = 0; k < 100; k++) add(20);
  return { id: 'ML', bars: b };
}
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const randomSeries = (seed, n, gaps) => { const r = rng(seed); let c = 20; const out = []; for (let k = 0; k < n; k++) { c *= 1 + 0.001 + 0.03 * (r() - 0.5) * 2 + (r() < 0.03 ? 0.25 : 0); const b = bar(k, c, c * (1 - 0.02 * r())); out.push(r() < gaps ? { ...b, high: NaN, low: NaN } : r() < gaps ? { ...b, low: NaN } : b); } return { id: `R${seed}`, bars: out }; };

test('GC-MIN-PP-MISSING-LOW-CLASS: vorher MANUAL_REVIEW_SETUP mit NaN-Korrektur, nachher DATA_BLOCKED_SETUP mit Grund', () => {
  const s = missingLowCase();
  // bar 190: the missing low (bar 95) lies outside the 80-session window that already reports MISSING_BARS_IN_WINDOW
  assert.equal(powerPlayClassify(s, 150).reasons[0], 'MISSING_BARS_IN_WINDOW');
  const old = legacyPowerPlayClassify(s, 190), now = powerPlayClassify(s, 190);
  assert.equal(old.classification, 'MANUAL_REVIEW_SETUP'); assert.ok(Number.isNaN(old.evidence.correction.correction));
  assert.equal(now.classification, 'DATA_BLOCKED_SETUP'); assert.deepEqual(now.reasons, ['MISSING_LOW_IN_CONSOLIDATION']);
  assert.equal(now.buyDeclarationAllowed, false); assert.equal(now.tradability, 'NOT_A_TRADABLE_STRATEGY');
  // the lifecycle setup series stays exact against the fixed classification
  const series = powerPlaySetupSeries(s), counts = {};
  for (let i = 0; i < s.bars.length; i++) { const st = powerPlaySetupAt(s, i).state; counts[st] = (counts[st] || 0) + 1; }
  assert.deepEqual(series.counts, counts);
});

test('SF4-PPFIX-DAILY-EQUALS-FULL: der gezielte Tagesvergleich ist identisch mit der Vollberechnung beider Fassungen', () => {
  const secs = [missingLowCase(), ...[21, 22, 23, 24, 25, 26].map((s) => randomSeries(s, 400, 0.004))];
  const ds = { securities: secs };
  const daily = transitionsDaily(ds), full = transitionsAt(ds, () => true);
  const strip = ({ barsEvaluatedWithBothVersions, ...x }) => x;
  assert.deepEqual(strip(daily), full);
  assert.ok(full.changed > 0, 'the cases must contain changed bars');
  for (const k of Object.keys(full.transitions)) assert.match(k, / -> DATA_BLOCKED_SETUP$/, 'the fix only moves bars to DATA_BLOCKED_SETUP');
  // without missing lows nothing changes
  const clean = { securities: [21, 22, 23].map((s) => randomSeries(s, 400, 0)) };
  assert.equal(transitionsAt(clean, () => true).changed, 0);
});
