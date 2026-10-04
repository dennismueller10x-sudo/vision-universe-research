/* Ein Supertrader-Signal fuer einen Titel ohne Discover-Seite (LOGI,
   03.10.2026: vom Faktor-Qualitaetsgate gesperrt) darf keinen toten Link
   zeigen. Der Build weist den Zustand explizit aus; die Seite zeigt dann
   einen Hinweis. Signale und Positionen bleiben unveraendert. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverAvailability } from '../build.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

test('discoverAvailability: genau die Titel ohne Discover-Aktienseite, sortiert und ohne Doppel', () => {
  const a = discoverAvailability(['LOGI', 'AAPL', 'LOGI', 'MSFT'], ['AAPL', 'MSFT', 'NVDA']);
  assert.equal(a.checked, 3);
  assert.deepEqual(a.unavailable, ['LOGI']);
  assert.equal(a.source, 'discover/data/stock-index/US_REAL.json');
  assert.deepEqual(discoverAvailability(['AAPL'], ['AAPL']).unavailable, []);
});

test('Build weist den Zustand vor dem Schreiben von signals.json aus und veraendert keine Signale', () => {
  const src = readFileSync(join(ROOT, 'scripts', 'supertrader', 'build.mjs'), 'utf8');
  const i = src.indexOf('signals.discoverAvailability = discoverAvailability(');
  assert.ok(i > 0 && i < src.indexOf("writeJson(path.join(DATA, 'signals.json'), signals)"));
  assert.match(src, /discoverAvailability\(\s*\[\.\.\.Object\.keys\(signals\.bySymbol\), \.\.\.TREND52_SYMBOLS\]/);
});

test('Seite: jeder Discover-Link laeuft ueber discoverLink, mit Hinweis statt totem Link', () => {
  const src = readFileSync(join(ROOT, 'supertrader', 'assets', 'supertrader.js'), 'utf8');
  assert.equal((src.match(/\/discover\/#\/s\/US_REAL\//g) || []).length, 1, 'nur discoverLink baut den Link');
  assert.match(src, /function discoverLink\(sym, sig, label\)/);
  assert.match(src, /av\.unavailable \|\| \[\]\)\.indexOf\(sym\) >= 0\) return h\('p', \{ class: 'st-hint', 'data-discover': 'unavailable'/);
  assert.match(src, /Aktienansicht vorübergehend nicht verfügbar – Daten werden geprüft\./);
});
