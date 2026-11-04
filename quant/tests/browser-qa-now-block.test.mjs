// Gegenproben zur Zustandspruefung des Blocks "Was ist jetzt wichtig?" (Issue #1289, Sperr-Revision UIP-R3).
// Die Pruefung muss (a) jeden fachlich gueltigen Zustand annehmen, unabhaengig vom Wortlaut, und (b) jeden ungueltigen ablehnen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { judgeNowBlock } from '../../scripts/vu2/qa-now-block.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ev = (explanation) => ({ label: 'Beliebige Bezeichnung', explanation, date: '02.11.2026' });
const dom = (o = {}) => ({ loading: false, eventItems: [], none: 0, nextLines: [], empty: [], ...o });

test('QNB-1 · gueltig mit Ereignissen: beliebiger Wortlaut (der Fall NVDA vom 03.11.2026 ohne "Setup", "Veraenderung", "Stand")', () => {
  const expected = { available: true, events: [{ explanation: 'Erfüllt nicht mehr: Abstand zum 200-Tage-Durchschnitt ≥ 0 %.' }], nextOpen: 1 };
  const d = dom({ eventItems: [{ label: 'Unter die langfristige Linie', explanation: 'Erfüllt nicht mehr: Abstand zum 200-Tage-Durchschnitt ≥ 0 %.', date: '02.11.2026' }], nextLines: ['Nächster Schritt: Für „Beobachten“ fehlt noch eine von 2 Bedingungen.'] });
  assert.deepEqual(judgeNowBlock(expected, d), []);
});

test('QNB-2 · gueltig ohne Ereignisse (Leerhinweis), gueltig ohne Radar (Leerzustand), jeweils ohne naechsten Schritt', () => {
  assert.deepEqual(judgeNowBlock({ available: true, events: [], nextOpen: 0 }, dom({ none: 1 })), []);
  assert.deepEqual(judgeNowBlock({ available: false, events: [], nextOpen: 0 }, dom({ empty: ['Für diese Aktie liegt kein Radar-Stand vor.'] })), []);
});

test('QNB-3 · mehrere Ereignisse in der veroeffentlichten Reihenfolge', () => {
  const expected = { available: true, events: [{ explanation: 'a' }, { explanation: 'b' }], nextOpen: 0 };
  assert.deepEqual(judgeNowBlock(expected, dom({ eventItems: [ev('a'), ev('b')] })), []);
  assert.ok(judgeNowBlock(expected, dom({ eventItems: [ev('b'), ev('a')] })).length >= 2, 'falsche Reihenfolge wird erkannt');
});

test('QNB-4 · GEGENPROBE: Platzhalter, fehlender Block, leerer Block werden abgelehnt', () => {
  const expected = { available: true, events: [{ explanation: 'x' }], nextOpen: 0 };
  assert.match(judgeNowBlock(expected, dom({ loading: true, eventItems: [ev('x')] })).join('|'), /Platzhalter/);
  assert.deepEqual(judgeNowBlock(expected, null), ['Block .q-now fehlt']);
  assert.ok(judgeNowBlock(expected, dom()).length > 0, 'leerer Block bei veroeffentlichtem Ereignis');
  assert.ok(judgeNowBlock({ available: true, events: [], nextOpen: 0 }, dom()).length > 0, 'leerer Block ohne Leerhinweis');
  assert.ok(judgeNowBlock({ available: false, events: [], nextOpen: 0 }, dom()).length > 0, 'leerer Block ohne Leerzustand');
});

test('QNB-5 · GEGENPROBE: falsche Anzahl, fehlende Felder, abweichende Erklaerung, widerspruechliche Zustaende', () => {
  const expected = { available: true, events: [{ explanation: 'a' }, { explanation: 'b' }], nextOpen: 0 };
  assert.match(judgeNowBlock(expected, dom({ eventItems: [ev('a')] })).join('|'), /1 angezeigt, 2 veroeffentlicht/);
  assert.match(judgeNowBlock(expected, dom({ eventItems: [ev('a'), { label: '', explanation: 'b', date: '' }] })).join('|'), /ohne Bezeichnung.*ohne Datum|ohne Datum.*ohne Bezeichnung/);
  assert.match(judgeNowBlock(expected, dom({ eventItems: [ev('a'), ev('anders')] })).join('|'), /weicht von der veroeffentlichten ab/);
  assert.match(judgeNowBlock(expected, dom({ eventItems: [ev('a'), ev('b')], none: 1 })).join('|'), /Leerhinweis.*trotz/);
  assert.match(judgeNowBlock({ available: true, events: [], nextOpen: 0 }, dom({ eventItems: [ev('x')], none: 1 })).join('|'), /obwohl keine veroeffentlicht/);
  assert.match(judgeNowBlock({ available: false, events: [], nextOpen: 0 }, dom({ eventItems: [ev('x')], empty: ['kein Radar-Stand'] })).join('|'), /Radar nicht verfuegbar/);
});

test('QNB-6 · GEGENPROBE: Zeile "Naechster Schritt" genau dann, wenn die API offene Bedingungen nennt', () => {
  const base = { available: true, events: [{ explanation: 'a' }] };
  assert.match(judgeNowBlock({ ...base, nextOpen: 2 }, dom({ eventItems: [ev('a')] })).join('|'), /Naechster Schritt" fehlt/);
  assert.match(judgeNowBlock({ ...base, nextOpen: 0 }, dom({ eventItems: [ev('a')], nextLines: ['Nächster Schritt: x'] })).join('|'), /angezeigt, obwohl die API keine/);
  assert.match(judgeNowBlock({ ...base, nextOpen: 1 }, dom({ eventItems: [ev('a')], nextLines: ['   '] })).join('|'), /fehlt/);
});

test('QNB-7 · GEGENPROBE: unlesbarer erwarteter Zustand wird abgelehnt (fail closed), nicht stillschweigend akzeptiert', () => {
  for (const bad of [null, undefined, {}, { available: 'ja', events: [], nextOpen: 0 }, { available: true, events: null, nextOpen: 0 }, { available: true, events: [], nextOpen: 'x' }]) {
    assert.deepEqual(judgeNowBlock(bad, dom({ none: 1 })), ['erwarteter Zustand unlesbar']);
  }
});

test('QNB-8 · die QA ruft das Urteil auf; der Wortlaut-Test und die Timeout-Grenze sind nicht wieder da', () => {
  const qa = readFileSync(join(ROOT, 'scripts/vu2/browser-qa.mjs'), 'utf8');
  assert.match(qa, /import \{judgeNowBlock\} from '\.\/qa-now-block\.mjs'/);
  assert.match(qa, /judgeNowBlock\(/);
  assert.doesNotMatch(qa, /hasText:\/Setup\|Veränderung\|Stand\//, 'kein Wortlaut-Filter mehr');
  assert.doesNotMatch(qa, /setDefaultTimeout\(|timeout:\s*(6|9)\d{4}|timeout:\s*\d{6}/, 'keine pauschale Timeout-Erhoehung');
});
