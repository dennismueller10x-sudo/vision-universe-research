// Die Leere-Seiten-Erkennung der Direktlink-QA (scripts/discover/direct-link-lib.mjs):
// ein Seitengeruest allein darf nie als gerendert gelten. Reine Bewertung, kein Browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import {SPECS, STRICT_ERRORS, fullSpec, verdict} from '../../scripts/discover/direct-link-lib.mjs';

const stock = overrides => ({hasMain: true, busy: 'false', gateVisible: false, textLength: 9000, h1: ['NVIDIA'], strictHits: [], includesMissing: [], textReHit: true,
  priceOk: true, coreCount: 2, coreBad: null, coreSkeletons: 0, charts: [{w: 374, h: 405, geometry: 2}], ...overrides});
const nvda = fullSpec(SPECS.nvda);

test('vollstaendige Aktienseite besteht', () => assert.deepEqual(verdict(stock(), nvda), []));

test('nur Seitengeruest (h1 vorhanden, sonst leer) besteht nicht', () => {
  const shell = stock({textLength: 12, h1: ['Discover'], priceOk: false, coreCount: 0, charts: []});
  const problems = verdict(shell, nvda);
  assert(problems.some(p => /passt nicht/.test(p)));
  assert(problems.some(p => /zu kurz/.test(p)));
  assert(problems.some(p => /Kursblock/.test(p)));
  assert(problems.some(p => /Chart/.test(p)));
});

test('leeres Dokument und sichtbare Zugangsmaske bestehen nicht', () => {
  assert.match(verdict({hasMain: false, gateVisible: false}, nvda)[0], /Seitengeruest/);
  assert.match(verdict({hasMain: false, gateVisible: true}, nvda)[0], /Zugangsmaske/);
});

test('Chart ohne Geometrie oder ohne Flaeche zaehlt nicht', () => {
  assert(verdict(stock({charts: [{w: 374, h: 405, geometry: 0}]}), nvda).some(p => /Chart/.test(p)));
  assert(verdict(stock({charts: [{w: 0, h: 0, geometry: 5}]}), nvda).some(p => /Chart/.test(p)));
  assert(verdict(stock({charts: []}), nvda).some(p => /Chart/.test(p)));
});

test('Ladeanzeige, Skeleton und Fehlermeldung im Kern bestehen nicht', () => {
  assert(verdict(stock({coreBad: 'lädt'}), nvda).some(p => /Platzhalter/.test(p)));
  assert(verdict(stock({coreSkeletons: 1}), nvda).some(p => /Skeleton/.test(p)));
  assert(verdict(stock({strictHits: ['Gerade nicht erreichbar'], h1: ['Gerade nicht erreichbar']}), nvda).some(p => /Fehlermeldung/.test(p)));
  assert(verdict(stock({busy: 'true'}), nvda).some(p => /aria-busy/.test(p)));
});

test('die harten Fehlermeldungen aus dem Auftrag sind hinterlegt', () => {
  for (const phrase of ['Gerade nicht erreichbar', 'Technik nicht verfügbar']) assert(STRICT_ERRORS.includes(phrase), phrase);
});

test('Feed (Einzelansicht): Zaehler und gefuellte erste Karte sind Pflicht', () => {
  const feed = fullSpec(SPECS.einzeln);
  const ok = {hasMain: true, busy: 'false', gateVisible: false, textLength: 3600, h1: [], strictHits: [], includesMissing: [], textReHit: true, priceOk: true, coreCount: 0,
    charts: [{w: 346, h: 185, geometry: 2}], feedCounter: '1 von 400', feedFirstText: 300, coreSkeletons: 0, coreBad: null};
  assert.deepEqual(verdict(ok, feed), []);
  assert(verdict({...ok, feedCounter: ''}, feed).some(p => /Zaehler/.test(p)));
  assert(verdict({...ok, feedFirstText: 10}, feed).some(p => /leer/.test(p)));
  assert(verdict({...ok, coreSkeletons: 2}, feed).some(p => /Skeleton/.test(p)));
});

test('jede Route hat einen eigenen Pfad und mindestens ein positives Merkmal', () => {
  for (const [name, spec] of Object.entries(SPECS)) {
    assert(spec.path.startsWith('/discover/'), name);
    assert(spec.h1 || spec.feed, name + ' braucht h1 oder Feed-Merkmal');
    assert(spec.minText > 0, name + ' braucht Mindesttext');
  }
});
