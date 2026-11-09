/* Kennzahl-Detail (FX03, Entscheidung 7) und Fundamental-Start (FX01), Konzept „Verstehen. Finden.“, PR 3. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const M = require('../../../fundamental/engine/model.js');
const C = require('../../../fundamental/engine/catalog.js');
const APP = readFileSync(new URL('../../../fundamental/app.js', import.meta.url), 'utf8');
const arr = (name) => Function('return ' + APP.match(new RegExp('var ' + name + ' = (\\[[\\s\\S]*?\\]);'))[1])();

test('ein Reiter: 3 J · 5 J · 10 J · Max · Quartale (Max an vierter Stelle, wie die Browser-QA es antippt)', () => {
  assert.deepEqual(arr('SPAN').map((x) => x[1]), ['3 J', '5 J', '10 J', 'Max', 'Quartale']);
  assert.match(APP, /class: 'fu-seg-b', 'aria-pressed': String\(on\)/);
});

test('„+ Firma“: bis zu drei weitere Firmen, in der Adresse als &mit=A~B, eigene Firma und Doppelte fallen weg', () => {
  assert.deepEqual(M.parseRoute('#/NVDA?ansicht=kennzahl&k=revenue&mit=AMD~AVGO').firms, ['AMD', 'AVGO']);
  assert.deepEqual(M.parseRoute('#/NVDA?ansicht=kennzahl&k=revenue&mit=brk.b').firms, ['BRK.B']);
  assert.equal(M.parseRoute('#/NVDA?ansicht=kennzahl&k=revenue&mit=A~B~C~D').firms, undefined, 'höchstens drei');
  assert.match(APP, /firms\.length >= 3\) return;/);
  assert.match(APP, /'&mit=' \+ firms\.join\('~'\)/);
  assert.match(APP, /function pickFirm\(taken, onPick\)/);
});

test('Hinweis „Volle Historie …“ steht unten, nach dem Inhalt', () => {
  assert.match(APP, /isOverview \? \[stockHead\(t, co\)\]\.concat\(content, st, fallback\) : content\.concat\(st, fallback\)/);
});

test('Startseite: Ranglisten-Schiene in der Reihenfolge des Mockups, jede eine bestehende Rangliste (Regeln unverändert)', () => {
  const home = Function('return ' + APP.match(/HOME_RANKS = (\[[^\]]*\])/)[1])();
  assert.deepEqual(home.slice(0, 3), ['wachstum', 'profitabel', 'cashflow']);
  assert.deepEqual([...home].sort(), C.RANKINGS.map((r) => r.id).sort(), 'alle sechs Ranglisten');
  assert.match(APP, /C\.ranking\(U, def\.id, RANK_SIZE, 3\)/);
});

test('Startseite: „Zahlen lesen in 30 Sekunden“ mit echtem Beispielwert aus dem Katalog, „Selbst filtern“ führt zum Screener', () => {
  const learn = arr('LEARN');
  assert.deepEqual(learn.map((x) => x[1]), ['Umsatz', 'Nettogewinn', 'Free Cashflow', 'KGV']);
  for (const [id] of learn) assert.ok(C.BY_ID[id], id);
  assert.match(APP, /navEl\('\/screener\/',[\s\S]{0,160}'Selbst filtern'/);
  assert.doesNotMatch(APP, /Beispiel: NVIDIA in 4 Zahlen/);
});
