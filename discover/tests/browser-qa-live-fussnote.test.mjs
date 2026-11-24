import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* Die Fussnote .dx-intraday-note gibt es nur bei gezeichnetem Tagesverlauf
   (discover/ui/detail.js). Die Live-QA darf sie deshalb nie hart lesen. */
test('Live-QA liest die Fussnote nur, wenn sie da ist', () => {
  const src = fs.readFileSync(new URL('../../scripts/discover/browser-qa-live.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /locator\("\.dx-intraday-note"\)\.textContent\(\)/);
  assert.match(src, /fussnote\.count\(\)/);
  assert.match(src, /\.dx-chart-hero-meta/);
});
