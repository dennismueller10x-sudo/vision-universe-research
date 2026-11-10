/* DQ-PQ-1..5: Zustandspruefungen, die frueher als Tests auf Live-Artefakten liefen (docs/quality/TESTARTEN.md).
   Hier mit eigener Eingabe: jede Regel besteht bei gesunden und faellt bei kaputten Daten. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Q = require('../product-quality.js');
const REASONS = ['A_REASON'];
const entries = n => Array.from({ length: n }, (_, i) => ({ s: 'T' + i, c: 10, d: '2026-11-06', n: 'Name ' + i }));
const index = (over = {}) => ({ schemaVersion: 'universe-list-1.3.0', coverage: { universe: 6100, entries: 6100, withName: 6100, withPrice: 6100, withValuationReason: 1 },
  entries: Object.assign(entries(6100), { 0: { s: 'T0', c: 10, d: '2026-11-06', n: 'Name 0', v: 'A_REASON' } }), ...over });

test('PQ-1: gesundes Verzeichnis besteht; Zukunft, Ticker-Name, fehlende Deckung, unbekannter Grund fallen', () => {
  assert.equal(Q.universeList(index(), '2026-11-10', REASONS).status, 'PASS');
  assert.equal(Q.universeList(null, '2026-11-10', REASONS).checked, 0);
  const bad = (mut) => { const i = index(); mut(i); return Q.universeList(i, '2026-11-10', REASONS); };
  assert.match(bad(i => { i.entries[1].d = '2026-12-01'; }).samples.join(), /Zukunft/);
  assert.match(bad(i => { i.entries[1].n = 'T1'; }).samples.join(), /Name ist der Ticker/);
  assert.match(bad(i => { i.entries[1].c = -1; }).samples.join(), /keine Zahl/);
  assert.match(bad(i => { i.entries[1].v = 'X'; i.coverage.withValuationReason = 2; }).samples.join(), /unbekannter Bewertungsgrund/);
  assert.match(bad(i => { i.coverage.withPrice = 10; }).samples.join(), /nur 10 Kurse/);
  assert.match(bad(i => { i.schemaVersion = 'x'; }).samples.join(), /unbekannte Fassung/);
  assert.match(bad(i => { i.entries[2] = { s: 'T2' }; }).samples.join(), /ohne Kurs und ohne Namen/);
  assert.match(bad(i => { i.entries[1].v = 'SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING'; i.entries[1].il = 1; i.coverage.withValuationReason = 2; }).samples.join(), /mehrerer Notierungen/);
});

test('PQ-2: Statusbericht ohne Zugang nennt fehlende Kurse; Zugangsdaten und fehlende Grenze fallen', () => {
  const ok = { dataMode: 'mock', configured: false, notice: 'Keine echten Kursdaten', publicDataState: { mode: 'UNAVAILABLE' }, boundary: 'x' };
  assert.equal(Q.marketStatus(ok, ['mock', 'real']).status, 'PASS');
  assert.equal(Q.marketStatus({ ...ok, dataMode: 'real' }, ['mock', 'real']).status, 'FAIL');
  assert.equal(Q.marketStatus({ ...ok, notice: 'Mock-Modus aktiv, Keine Kursdaten' }, ['mock']).status, 'FAIL');
  assert.equal(Q.marketStatus({ ...ok, extra: 'apikey=1' }, ['mock']).status, 'FAIL');
  assert.equal(Q.marketStatus({ ...ok, boundary: '' }, ['mock']).status, 'FAIL');
  assert.equal(Q.marketStatus({ ...ok, dataMode: 'zzz' }, ['mock']).status, 'FAIL');
  assert.equal(Q.marketStatus(null, ['mock']).checked, 0);
});

test('PQ-3: SPY in einer Liste faellt, fehlende Listen werden uebersprungen', () => {
  assert.equal(Q.benchmarkNotInUniverse({ a: [{ ticker: 'AAPL' }], b: [{ s: 'MSFT' }], c: null }).checked, 2);
  assert.equal(Q.benchmarkNotInUniverse({ a: [{ ticker: 'AAPL' }] }).status, 'PASS');
  assert.match(Q.benchmarkNotInUniverse({ Produktuniversum: [{ ticker: 'A' }], Marktfaehigkeit: [] }).samples.join(), /nicht dieselbe Menge/);
  for (const spy of [{ ticker: 'SPY' }, { securityId: 'ref_SPY' }, { s: 'SPY' }, { m: 'ref_SPY' }])
    assert.deepEqual(Q.benchmarkNotInUniverse({ liste: [spy] }).samples, ['SPY in liste']);
});

test('PQ-4: Drift-Feld nur geprueft, wenn vorhanden; Stichtag, Hinweis und Zahlen muessen stimmen', () => {
  const s = (d) => ({ asOf: '2026-11-06', observationDrift: d });
  const good = { asOf: '2026-11-06', note: 'wird nicht durch eine heutige Neuberechnung ersetzt', rowsPublished: 5, rowsToday: 6 };
  assert.equal(Q.observationSummary({ asOf: '2026-11-06' }).checked, 0);
  assert.equal(Q.observationSummary(s(good)).status, 'PASS');
  assert.equal(Q.observationSummary(s({ ...good, asOf: '2026-11-05' })).status, 'FAIL');
  assert.equal(Q.observationSummary(s({ ...good, note: 'x' })).status, 'FAIL');
  assert.equal(Q.observationSummary(s({ ...good, rowsToday: null })).status, 'FAIL');
});

test('PQ-5: SEC-Universum traegt Ausschlusszahl und Validierungssatz', () => {
  const ok = { totals: { excluded: { wrongType: 0 } }, description: 'Validierungssatz' };
  assert.equal(Q.secUniverse(ok).status, 'PASS');
  assert.equal(Q.secUniverse({ ...ok, description: '' }).status, 'FAIL');
  assert.equal(Q.secUniverse({ ...ok, totals: {} }).status, 'FAIL');
});

test('PQ-6: Technical v3 besteht mit Methodenschluessel und aktueller Engine; alte Engine, Gewicht und fehlender Schluessel fallen', () => {
  const ok = () => ({ index: { methodologyKey: 'elliott-v3' }, meta: { elliott: { engine: 'v3', confluenceWeight: 0, status: 'EXPERIMENTAL_STRUCTURE_MODEL' } },
    shard: { X: { versions: { elliott: 'e3.1', elliottStatus: 'EXPERIMENTAL_STRUCTURE_MODEL', ruleSet: 'r', dataAsOf: '2026-11-06', api: 'a' } } } });
  assert.equal(Q.technicalV3(ok(), 'e3.1').status, 'PASS');
  assert.equal(Q.technicalV3({}, 'e3.1').checked, 0);
  assert.match(Q.technicalV3(ok(), 'e3.2').samples.join(), /nicht von der aktuellen Engine/);
  const a = ok(); delete a.index.methodologyKey; assert.match(Q.technicalV3(a, 'e3.1').samples.join(), /methodologyKey/);
  const b = ok(); b.meta.elliott.confluenceWeight = 1; assert.match(Q.technicalV3(b, 'e3.1').samples.join(), /confluenceWeight/);
  const d = ok(); d.shard.X.versions.elliottStatus = 'X'; assert.match(Q.technicalV3(d, 'e3.1').samples.join(), /elliottStatus/);
  const c = ok(); delete c.shard.X.versions.api; assert.match(Q.technicalV3(c, 'e3.1').samples.join(), /ruleSet\/dataAsOf\/api/);
});
