/* Fundamental-Aktie (Konzept „Verstehen. Finden.“, PR 2, Entscheidung 6): Aktienkopf + Perspektiven-Leiste ohne zweite
   Leiste, Satz, Kennzahlen-Streifen mit sechs Zahlen, ein Finanz-Chart, Kapitel. Die alten Unteransichten bleiben erreichbar. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const M = require('../../../fundamental/engine/model.js');
const C = require('../../../fundamental/engine/catalog.js');
const APP = readFileSync(new URL('../../../fundamental/app.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../../../fundamental/app.css', import.meta.url), 'utf8');

const arr = (name) => Function('return ' + APP.match(new RegExp('var ' + name + ' = (\\[[\\s\\S]*?\\]);'))[1])();

test('keine zweite Leiste: kein Reiter Überblick · Kennzahlen · Branche · Finanzen mehr', () => {
  assert.doesNotMatch(APP, /class: 'vu-seg fu-tabs'/);
  assert.doesNotMatch(APP, /function tabs\(/);
  assert.match(APP, /isOverview \? \[stockHead\(t, co\)\]/, 'Aktienkopf mit Perspektiven-Leiste nur auf der Aktie selbst');
});

test('Kennzahlen-Streifen: sechs Zahlen in der Reihenfolge des Mockups, jede aus dem Katalog', () => {
  const strip = arr('STRIP');
  assert.deepEqual(strip.map((x) => x[1]), ['Börsenwert', 'Umsatz', 'KGV', 'Nettomarge', 'Free Cashflow', 'Kapitalrendite']);
  for (const [id] of strip) assert.ok(C.BY_ID[id], id);
});

test('Finanz-Chart: Umsatz · Gewinn · Cashflow · Marge, Jahre und Quartale', () => {
  assert.deepEqual(arr('FIN').map((x) => x[1]), ['Umsatz', 'Gewinn', 'Cashflow', 'Marge']);
  for (const [id] of arr('FIN')) assert.ok(C.BY_ID[id] && C.BY_ID[id].q, id + ' hat Quartalswerte');
  assert.match(APP, /\['annual', 'Jahre'\], \['quarterly', 'Quartale'\]/);
  assert.match(APP, /'Vergleichen'\]/);
});

test('Kapitel: acht Zeilen, jede öffnet eine bestehende Ansicht unter ihrer alten Adresse', () => {
  const ch = arr('CHAPTERS');
  assert.deepEqual(ch.map((c) => c[1]), ['Bilanz und Schulden', 'Cashflow', 'Bewertung', 'In der Branche', 'Analysten', 'Dividende', 'Alle 60 Kennzahlen', 'Quellen']);
  const target = { bilanz: 'finanzen', cashflow: 'finanzen', branche: 'vergleich' };
  const views = ['kennzahlen', 'kennzahl', 'vergleich', 'finanzen', 'mehr'];
  const areas = Object.keys(Function('return ' + APP.match(/var AREAS = (\{[^}]*\});/)[1])());
  for (const [id] of ch) {
    const sub = target[id] || id;
    assert.ok(views.includes(sub) || areas.includes(sub), id + ' -> ' + sub);
    assert.equal(M.parseRoute('#/NVDA?ansicht=' + sub).sub, sub);
  }
});

test('alte Adressen der Unteransichten funktionieren weiter', () => {
  for (const sub of ['kennzahlen', 'branche', 'finanzen', 'dividende', 'analysten', 'bewertung', 'quellen', 'mehr', 'vergleich']) {
    const r = M.parseRoute('#/NVDA?ansicht=' + sub);
    assert.equal(r.view, 'company'); assert.equal(r.ticker, 'NVDA'); assert.equal(r.sub, sub);
  }
  assert.equal(M.parseRoute('#/NVDA?ansicht=finanzen&t=bilanz').tab, 'bilanz');
});

test('das „?“ steht klein am Rand (keine schwarzen Fragezeichen-Knöpfe auf Kacheln), Tippfläche bleibt 44 px', () => {
  assert.doesNotMatch(APP, /fu-ktile-h/);
  assert.match(CSS, /\.fu-story-h \.vu-q\{width:44px;height:44px/);
});

test('Säulen bleiben in der Karte: die globale 44-px-Mindestbreite für Knöpfe gilt nicht für Säulen', () => {
  assert.match(CSS, /\.fu-bc\{[^}]*min-width:0!important/);
  assert.match(CSS, /\.fu-fin-c\{[^}]*min-width:0!important/);
});
