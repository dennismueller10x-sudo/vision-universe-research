import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* Die V3-Startseite hat genau fuenf Karten mit Tagesverlauf und laedt beim Scrollen nichts
   nach (Owner-Entscheidung ueber Steuerung, 24.11.2026). Die Live-QA prueft das streng. */
const src = fs.readFileSync(new URL('../../scripts/discover/browser-qa-live.mjs', import.meta.url), 'utf8');

test('Live-QA: keine Erwartung mehr an nachgeladene Karten oder Abmeldung beim Scrollen', () => {
  assert.doesNotMatch(src, /Beim Scrollen werden Abonnements gekuendigt/);
  assert.doesNotMatch(src, /Nachgeladene Karten zeigen ebenfalls Tagesverlauf/);
  assert.doesNotMatch(src, /querySelectorAll\("\.dx-poster, \.v2-stock"\)/);
});

test('Live-QA: genau fuenf Karten, Snapshots hoechstens je Karte, Abos beim Verlassen gekuendigt', () => {
  assert.match(src, /genau die 5 Karten tragen einen Tagesverlauf", intra === 5 && intra2 === 5/);
  assert.match(src, /s2\.snapshotRequests <= intra2/);
  assert.match(src, /location\.hash = "#\/maerkte"/);
  assert.match(src, /nachher\.subscribers === 0 && nachher\.unsubscriptions >= vorher\.subscribers/);
});
