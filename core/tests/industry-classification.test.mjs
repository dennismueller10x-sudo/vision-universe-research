// core/industry-classification.js - Point-in-Time-Regeln mit synthetischen Grenzfaellen.
// Echte SEC-Beispiele aus dem gebauten Datensatz: industry-classification-sec.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const IC = require('../industry-classification.js');
const { STATUS } = IC;

// [knownAt, sic, accession, form, source, precision, flag]
const issuers = {
  '0000000001': { observations: [
    ['2015-02-10T21:01:59Z', '2731', '0000000001-15-000001', '10-K', 'F', 'M', ''],
    ['2015-05-05T13:00:59Z', '2731', '0000000001-15-000002', '10-Q', 'F', 'M', ''],
    // Annahme 18:44:31 ET (nach Handelsschluss) am 05.08.2015 = 22:44:31Z
    ['2015-08-05T22:44:31Z', '5961', '0000000001-15-000003', '10-Q', 'H', 'S', ''],
  ] },
  '0000000002': { observations: [
    ['2016-03-01T15:00:59Z', '1311', '0000000002-16-000001', '10-K', 'F', 'M', 'CONFLICT'],
    ['2016-03-01T15:00:59Z', '1381', '0000000002-16-000002', '10-K/A', 'F', 'M', 'CONFLICT'],
  ] },
  '0000000003': { observations: [['2017-01-05T15:00:59Z', null, '0000000003-17-000001', 'S-1', 'F', 'M', '']] },
};
const codes = { 2731: { description: 'BOOKS: PUBLISHING OR PUBLISHING AND PRINTING' }, 5961: { description: 'RETAIL-CATALOG & MAIL-ORDER HOUSES' } };
const api = IC.create({ issuers, codes });

test('vor der ersten Beobachtung: UNKNOWN, kein Rueckgriff auf spaetere oder aktuelle SIC', () => {
  const r = api.getIndustryClassification('1', '2014-12-31');
  assert.equal(r.status, STATUS.UNKNOWN_BEFORE_FIRST_OBSERVATION);
  assert.equal(r.sic, null);
});

test('SIC-Wechsel im Zeitverlauf: jede Abfrage sieht nur die bis dahin bekannte SIC', () => {
  assert.equal(api.getIndustryClassification('iss_cik_0000000001', '2015-06-30').sic, '2731');
  assert.equal(api.getIndustryClassification('0000000001', '2015-08-06').sic, '5961');
});

test('Filing nach Handelsschluss: am selben Datum unsichtbar, am Folgetag sichtbar', () => {
  const sameDay = api.getIndustryClassification('1', '2015-08-05');
  assert.equal(sameDay.cutoff, '2015-08-05T20:00:00Z'); // 16:00 EDT
  assert.equal(sameDay.sic, '2731');
  const exactAfter = api.getIndustryClassification('1', '2015-08-05T22:44:31Z');
  assert.equal(exactAfter.sic, '5961');
  const oneSecondBefore = api.getIndustryClassification('1', '2015-08-05T22:44:30Z');
  assert.equal(oneSecondBefore.sic, '2731');
});

test('Lookahead-Schutz: Ergebnis haengt nicht von spaeteren Beobachtungen ab', () => {
  const truncated = IC.create({ issuers: { '0000000001': { observations: issuers['0000000001'].observations.slice(0, 2) } } });
  for (const d of ['2015-02-10', '2015-02-11', '2015-07-01', '2015-08-05']) {
    const a = api.getIndustryClassification('1', d), b = truncated.getIndustryClassification('1', d);
    assert.equal(a.sic, b.sic, d);
    assert.equal(a.knownAt, b.knownAt, d);
  }
});

test('Fortschreibung ist als INFERRED_INTERVAL ausgewiesen, nie als belegte Gueltigkeit', () => {
  const r = api.getIndustryClassification('1', '2015-07-01');
  assert.equal(r.interval.kind, 'INFERRED_INTERVAL');
  assert.equal(r.interval.validFrom, null);
  assert.equal(r.interval.validTo, null);
  assert.equal(r.interval.observedFrom, '2015-02-10T21:01:59Z');
  assert.equal(r.interval.observationsInRun, 2);
  assert.ok(r.ageDays > 56 && r.ageDays < 58);
});

test('Staleness nur auf ausdrueckliche Grenze des Aufrufers', () => {
  assert.equal(api.getIndustryClassification('1', '2019-01-01').status, STATUS.OBSERVED);
  const r = api.getIndustryClassification('1', '2019-01-01', { maxAgeDays: 400 });
  assert.equal(r.status, STATUS.STALE);
  assert.equal(r.sic, '5961'); // der Wert bleibt sichtbar, das Urteil liegt beim Aufrufer
});

test('widerspruechliche Beobachtungen am selben Zeitpunkt -> CONFLICT ohne SIC', () => {
  const r = api.getIndustryClassification('2', '2016-06-01');
  assert.equal(r.status, STATUS.CONFLICT);
  assert.equal(r.sic, null);
  assert.deepEqual([...r.conflictingSics].sort(), ['1311', '1381']);
});

test('SEC hatte keine SIC zugewiesen -> NO_SIC_ASSIGNED', () => {
  assert.equal(api.getIndustryClassification('3', '2017-02-01').status, STATUS.NO_SIC_ASSIGNED);
});

test('unbekannte CIK und ungueltige Kennung', () => {
  assert.equal(api.getIndustryClassification('999', '2020-01-01').status, STATUS.UNKNOWN_NO_OBSERVATIONS);
  assert.equal(api.getIndustryClassification('ref_AAPL', '2020-01-01').status, STATUS.IDENTITY_HOLD);
});

test('asOf ohne Zeitzone wird abgelehnt', () => {
  assert.throws(() => api.getIndustryClassification('1', '2015-08-05T22:44:31'), /Zeitzone/);
});

test('Eastern Time: Sommer- und Winterzeit, Umstellungstage', () => {
  assert.equal(IC.cutoffOf('2026-01-15').cutoff, '2026-01-15T21:00:00Z');
  assert.equal(IC.cutoffOf('2026-07-15').cutoff, '2026-07-15T20:00:00Z');
  assert.equal(IC.cutoffOf('2026-03-08').cutoff, '2026-03-08T20:00:00Z'); // zweiter Sonntag im Maerz
  assert.equal(IC.cutoffOf('2026-03-07').cutoff, '2026-03-07T21:00:00Z');
  assert.equal(IC.cutoffOf('2026-11-01').cutoff, '2026-11-01T21:00:00Z'); // erster Sonntag im November
  assert.equal(IC.cutoffOf('2006-04-02').cutoff, '2006-04-02T20:00:00Z'); // alte Regel: erster Sonntag im April
  assert.equal(IC.cutoffOf('2006-10-29').cutoff, '2006-10-29T21:00:00Z'); // letzter Sonntag im Oktober
});

test('Hindsight-Sicht ist gekennzeichnet und nennt das Wechselfenster', () => {
  const data = IC.create({ issuers: { '0000000001': { observations: issuers['0000000001'].observations, runs: [
    { sic: '2731', firstKnownAt: '2015-02-10T21:01:59Z', lastKnownAt: '2015-05-05T13:00:59Z', n: 2 },
    { sic: '5961', firstKnownAt: '2015-08-05T22:44:31Z', lastKnownAt: '2015-08-05T22:44:31Z', n: 1 },
  ] } }, codes });
  const h = data.history('1');
  assert.equal(h.view, 'HINDSIGHT_AUDIT_ONLY');
  assert.deepEqual(h.runs[0].changeWindowAfter, { from: '2015-05-05T13:00:59Z', to: '2015-08-05T22:44:31Z', kind: 'UNKNOWN_CHANGE_TIME' });
});

test('Identitaet: mehrere Listings einer CIK, Tickerwechsel, Mehrdeutigkeit, Fenster', () => {
  // zwei Aktiengattungen (GOOG/GOOGL) zeigen auf dieselbe CIK
  assert.equal(IC.resolveIssuer([{ cik: '1652044' }, { cik: '0001652044' }], '2020-01-02').cik, '0001652044');
  // Tickerwechsel FB -> META: die CIK bleibt, der Ticker ist kein Schluessel
  assert.equal(IC.resolveIssuer([{ cik: '1326801', validFrom: '2012-05-18' }], '2022-06-09').cik, '0001326801');
  // derselbe Ticker frueher bei einem anderen Emittenten: zwei CIKs im Fenster -> Hold
  const amb = IC.resolveIssuer([{ cik: '1', validFrom: '2000-01-01' }, { cik: '2', validFrom: '2010-01-01' }], '2015-01-01');
  assert.equal(amb.status, STATUS.IDENTITY_HOLD);
  assert.equal(amb.reason, 'AMBIGUOUS_CIK');
  // Zuordnung nur fuer das belegte Listing-Fenster
  assert.equal(IC.resolveIssuer([{ cik: '1', validFrom: '2016-10-18' }], '2015-01-01').reason, 'OUTSIDE_EVIDENCED_WINDOW');
  assert.equal(IC.resolveIssuer([], '2015-01-01').reason, 'NO_CIK');
});

test('SIC-Ebenen sind reine Code-Struktur', () => {
  assert.deepEqual(IC.sicLevels('5961'), { industry: '5961', industryGroup: '596', majorGroup: '59' });
  assert.equal(IC.sicLevels(null), null);
});
