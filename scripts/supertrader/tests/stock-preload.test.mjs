// Aktienseite: der Kurs im Kopf wartete auf eine Kette aus Nachlade-Skripten und erst danach auf die Kursreihe
// (Messung 07.11.2026: 2,6 s). Der Seitengenerator kuendigt beides im <head> an. Ein Preload hilft nur, wenn seine
// Adresse exakt die spaetere Anfrage trifft - sonst laedt der Browser doppelt. Diese Tests binden die Adressen an die
// Stellen, die sie spaeter anfragen (st-redesign.js#series, supertrader.js#stockKit/loadScript, core/identity.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { renderPage, stockPreloads, stockSeriesHref, STOCK_PRELOAD_SCRIPTS } from '../build.mjs';

const Identity = createRequire(import.meta.url)('../../../core/identity.js');
const SRC = (f) => fs.readFileSync(new URL('../../../' + f, import.meta.url), 'utf8');

test('Kursreihe: Adresse kommt aus core/identity.js (ADR-001) und gleicht st-redesign.js#series()', () => {
  for (const sym of ['NVDA', 'BRK.B', 'BF-B', 'MOG-A']) {
    assert.equal(stockSeriesHref(sym), '/quant/data/market/discover-series/' + encodeURIComponent(Identity.securityIdForTicker(sym)) + '.json');
  }
  assert.equal(stockSeriesHref('BRK.B'), '/quant/data/market/discover-series/ref_BRK_B.json');
  const st = SRC('supertrader/assets/st-redesign.js');
  assert.match(st, /fetch\('\/quant\/data\/market\/discover-series\/' \+ encodeURIComponent\(id\) \+ '\.json'/, 'gleiche Adressbildung wie die Seite');
  assert.match(st, /var id = I \? I\.securityIdForTicker\(sym\) : null;/);
  assert.doesNotMatch(SRC('scripts/supertrader/build.mjs'), /["'`]ref_["'`]\s*\+/, 'keine eigene ref_-Bildung im Generator');
});

test('Skripte: jede vorgeladene Datei laedt die Aktienseite spaeter genau unter dieser Adresse nach', () => {
  const st = SRC('supertrader/assets/supertrader.js'), red = SRC('supertrader/assets/st-redesign.js');
  const asked = new Set([...(st + red).matchAll(/loadScript\((?:BASE \+ )?'([^']+)'\)/g)].map((m) => (m[0].includes('BASE +') ? '/supertrader/' : '') + m[1]));
  for (const href of STOCK_PRELOAD_SCRIPTS) assert.ok(asked.has(href), href + ' wird nicht per loadScript angefragt');
  /* loadScript nimmt einen passenden Preload (auch mit Release-Stempel ?v=) statt einer zweiten Anfrage. */
  assert.match(st, /link\[rel="preload"\]\[as="script"\]\[href="' \+ src \+ '"\]/);
  assert.match(st, /href\^="' \+ src\.split\('\?'\)\[0\] \+ '\?"\]/);
});

test('Erzeugte Aktienseite: Preloads im <head>, Kursreihe als fetch mit crossorigin; andere Seiten ohne Preload', () => {
  const html = renderPage({ title: 't', description: 'd', page: 'stock', depth: 3, attrs: ' data-symbol="NVDA"', head: stockPreloads('NVDA') });
  const head = html.slice(0, html.indexOf('</head>'));
  for (const href of STOCK_PRELOAD_SCRIPTS) assert.ok(head.includes(`<link rel="preload" as="script" href="${href}">`), href);
  assert.ok(head.includes(`<link rel="preload" as="fetch" crossorigin="anonymous" href="${stockSeriesHref('NVDA')}">`));
  assert.ok(head.indexOf('rel="preload"') > head.indexOf('supertrader.css'), 'nach den Stylesheets');
  const home = renderPage({ title: 't', description: 'd', page: 'home', depth: 1 });
  assert.doesNotMatch(home, /rel="preload"/);
  assert.match(SRC('scripts/supertrader/build.mjs'), /attrs: ` data-symbol="\$\{sym\}"`, head: stockPreloads\(sym\)/, 'writeStockPages setzt die Preloads');
});
