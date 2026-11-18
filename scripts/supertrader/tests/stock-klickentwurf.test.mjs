// Supertrader-Aktienseite nach dem Klickentwurf (Owner 17.11.2026): Wortwahl „Regel erfüllt laut Methode“, Stufen der
// Methode nur sachlich als „Stand im Ablauf“, Folgen/Melden bleibt aus (ST_ALERTS_UI), keine Reiterzeile des Rahmens,
// Haken je erkannter Methode nur aus der Datei der Aktie (sf-candidates/ticker/) und den Regelnamen der schon geladenen summary.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const RED = fs.readFileSync(path.join(ROOT, 'supertrader/assets/st-redesign.js'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'supertrader/assets/supertrader.js'), 'utf8');
const at = RED.indexOf('  function stock(D, X) {');
const stock = RED.slice(at, RED.indexOf('\n  }\n', at));
const card = RED.slice(RED.indexOf('  function checkDot('), RED.indexOf('  /* ============================================================ ST08'));

test('Aktie: nur „Regel erfüllt laut Methode“, kein „Muster erkannt“ oder „Kein Muster“ als Urteil', () => {
  assert.ok(stock.length > 1000 && card.length > 500, 'Abschnitte gefunden');
  assert.match(stock, /var RULE = 'Regel erfüllt laut Methode';/);
  for (const bad of [/Muster erkannt/, /Kein Muster(?!depot)/, /STAGE_TXT\[/, /Signal/, /Empfehlung/]) {
    assert.ok(!bad.test(stock) && !bad.test(card), String(bad));
  }
  assert.match(card, /'Stand im Ablauf: ' \+ st\.name/, 'Stufe sachlich mit dem Namen aus summary.json');
});

test('Folgen/Melden bleibt aus', () => {
  assert.match(RED, /var ST_ALERTS_UI = false;/);
  assert.doesNotMatch(stock, /bellHtml\(/);
});

test('Haken je Methode aus der Datei der Aktie; keine weitere Datei', () => {
  assert.match(stock, /sf-candidates\/ticker\/' \+ shard \+ '\.json/);
  assert.match(card, /v\.features/);
  assert.match(card, /v\.met \|\| \[\]/);
  assert.match(card, /sum\.ruleLabels/);
  assert.doesNotMatch(card, /getJSON|fetch\(/);
});

test('Aktie ohne Reiterzeile des Rahmens, Pillen vor dem Rechtssatz', () => {
  assert.match(APP, /if \(page === 'stock'\) \{ if \(window\.VUNavigation && window\.VUNavigation\.rahmen\) window\.VUNavigation\.rahmen\(\{ tabs: 'inhalt' \}\)/);
  assert.match(stock, /others: othersSlot/);
  assert.match(stock, /legal\.parentNode\.insertBefore\(othersSlot, legal\)/);
});
