// Plattform-Audit 03.10.2026: kaputte Supertrader-Ziele.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { weeklySeriesId, symbolsIn } from '../build.mjs';

test('Wochenreihen-ID folgt der Company-Master-Regel (Bindestrich-Ticker)', () => {
  assert.equal(weeklySeriesId('BRK-A'), 'ref_BRK_A');
  assert.equal(weeklySeriesId('MOG-A'), 'ref_MOG_A');
  assert.equal(weeklySeriesId('NVDA'), 'ref_NVDA');
  const src = readFileSync(new URL('../build.mjs', import.meta.url), 'utf8');
  assert.ok(!/discover-series-long\/ref_\$\{/.test(src), 'Wochenpfad wird wieder roh gebildet');
});

test('Jedes Symbol der Teilpruefungen bekommt eine Aktienseite (kein 404)', () => {
  const partial = { CANSLIM: { candidates: [{ symbol: 'NVDA' }], rows: [{ symbol: 'DAR', criteria: {} }] }, PIOTROSKI_F: { top: [{ symbol: 'ROKU' }] } };
  assert.deepEqual([...symbolsIn(partial)].sort(), ['DAR', 'NVDA', 'ROKU']);
  const src = readFileSync(new URL('../build.mjs', import.meta.url), 'utf8');
  assert.match(src, /writeStockPages\(signals, \[\.\.\.TREND52_SYMBOLS, \.\.\.symbolsIn\(signals\.partialChecks\)\]\)/);
});
