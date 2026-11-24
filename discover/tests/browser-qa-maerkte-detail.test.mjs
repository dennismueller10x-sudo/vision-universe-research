import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* Die Detailseiten (#/maerkte/<SYMBOL>) werden in einer Schleife per Hash-Wechsel
   geoeffnet (gleiches Dokument). Die Pruefung muss auf das Symbol warten, sonst
   liest sie die Seite des vorigen (Monitor-Lauf 45312575650: SPY zeigte QQQ). */
test('Markt-QA wartet je Detailseite auf data-instrument des gefragten Symbols', () => {
  const src = fs.readFileSync(new URL('../../scripts/discover/browser-qa-maerkte.mjs', import.meta.url), 'utf8');
  assert.match(src, /waitForSelector\('\.dx-md\[data-instrument="'\+sym\+'"\] h1'/);
  assert.doesNotMatch(src, /waitForSelector\('\.dx-md h1',\{timeout:30000\}\)/);
  const md = fs.readFileSync(new URL('../ui/market-detail.js', import.meta.url), 'utf8');
  assert.match(md, /"data-instrument": c\.instrument\.symbol/, 'die Seite trägt das Symbol als data-instrument');
});
