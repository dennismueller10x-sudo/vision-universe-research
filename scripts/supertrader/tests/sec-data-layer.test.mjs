// Phase 2B – generischer SEC-Datenlayer: Ergebnis-Ereignisse (8-K Item 2.02) und SIC point-in-time.
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractEarningsEvents, eventsKnownAt, lastEarningsRelease, EV, EVENT } from '../data-layer/sec/earnings-events.mjs';
import { parseHeaderSic, sicAt, industryGroup, groupStrength, periodicFilings, sicHistoryByBisection } from '../data-layer/sec/industry-sic.mjs';

const page = (rows) => ({
  form: rows.map((r) => r[0]), filingDate: rows.map((r) => r[1]), accessionNumber: rows.map((r) => r[2]),
  items: rows.map((r) => r[3] || ''), reportDate: rows.map((r) => r[4] || ''), acceptanceDateTime: rows.map(() => ''),
});

test('SDL-T-8K-01: nur 8-K mit Item 2.02 sind Ergebnismitteilungen; andere 8-K fallen weg', () => {
  const ev = extractEarningsEvents([page([
    ['8-K', '2020-01-28', 'a1', '2.02,9.01'], ['8-K', '2020-02-10', 'a2', '5.02'], ['8-K', '2020-04-30', 'a3', '2.02'], ['10-Q', '2020-05-01', 'a4', ''],
  ])]);
  assert.deepEqual(ev.map((e) => [e[EV.ACCN], e[EV.TYPE]]), [['a1', EVENT.EARNINGS_RELEASE], ['a3', EVENT.EARNINGS_RELEASE], ['a4', EVENT.PERIODIC_REPORT]]);
});

test('SDL-T-8K-02: Sichtbarkeit erst ab dem Handelstag NACH dem Einreichungsdatum', () => {
  const ev = extractEarningsEvents([page([['8-K', '2020-01-28', 'a1', '2.02']])]);
  assert.equal(lastEarningsRelease(ev, '2020-01-28'), null, 'am Einreichungstag noch nicht bekannt');
  assert.equal(lastEarningsRelease(ev, '2020-01-29').accession, 'a1');
  assert.equal(eventsKnownAt(ev, '2020-01-28').length, 0);
});

test('SDL-T-8K-03: 8-K/A setzt die letzte Mitteilung nicht zurueck', () => {
  const ev = extractEarningsEvents([page([['8-K', '2020-01-28', 'a1', '2.02'], ['8-K/A', '2020-03-15', 'a2', '2.02']])]);
  assert.equal(ev[1][EV.TYPE], EVENT.AMENDMENT);
  assert.equal(lastEarningsRelease(ev, '2020-04-01').filed, '2020-01-28');
});

test('SDL-T-8K-04: Mehrfacheinreichung binnen 10 Tagen ist Duplikat; Accession aus zwei Seiten nur einmal', () => {
  const ev = extractEarningsEvents([
    page([['8-K', '2005-01-11', 'a1', '2.02'], ['8-K', '2005-01-12', 'a2', '2.02']]),
    page([['8-K', '2005-01-11', 'a1', '2.02'], ['8-K', '2005-04-13', 'a3', '2.02']]),
  ]);
  assert.deepEqual(ev.map((e) => e[EV.TYPE]), [EVENT.EARNINGS_RELEASE, EVENT.DUPLICATE, EVENT.EARNINGS_RELEASE]);
  assert.equal(lastEarningsRelease(ev, '2005-02-01').filed, '2005-01-11');
});

test('SDL-T-8K-05: Item-Liste wird exakt verglichen (2.020 / 12.02 sind nicht 2.02)', () => {
  const ev = extractEarningsEvents([page([['8-K', '2020-01-28', 'a1', '12.02'], ['8-K', '2020-01-29', 'a2', ' 2.02 ,9.01']])]);
  assert.deepEqual(ev.map((e) => e[EV.ACCN]), ['a2']);
});

test('SDL-T-SIC-01: Kopf-Parser liest ASSIGNED-SIC und das Textformat', () => {
  assert.equal(parseHeaderSic('<SEC-HEADER>\n<ASSIGNED-SIC>7374\n'), '7374');
  assert.equal(parseHeaderSic('STANDARD INDUSTRIAL CLASSIFICATION:\tSERVICES-COMPUTER PROCESSING [7374]'), '7374');
  assert.equal(parseHeaderSic('<ASSIGNED-SIC>100'), '0100');
  assert.equal(parseHeaderSic('kein Kopf'), null);
  assert.equal(parseHeaderSic('<ASSIGNED-SIC>0000'), null, 'SIC 0000 = unbekannt');
  const multi = '<FILER>\n<CIK>0000041091\n<ASSIGNED-SIC>4911\n</FILER>\n<FILER>\n<CIK>0001004155\n<ASSIGNED-SIC>4924\n</FILER>';
  assert.equal(parseHeaderSic(multi, '0001004155'), '4924', 'Block des eigenen Emittenten, nicht der erste');
  assert.equal(parseHeaderSic(multi, '41091'), '4911');
  assert.equal(parseHeaderSic(multi, '999'), null, 'Emittent fehlt im Kopf -> unbekannt');
});

test('SDL-T-SIC-02: SIC point-in-time – kein Rueckfuellen, kein heutiger Wert in der Vergangenheit', () => {
  const h = [['2015-02-20', 'x1', '7374'], ['2020-02-27', 'x2', '7374'], ['2023-02-23', 'x3', '7389']];
  assert.equal(sicAt(h, '2015-02-20'), null, 'vor der ersten bekannten Einreichung unbekannt');
  assert.equal(sicAt(h, '2016-01-04'), '7374');
  assert.equal(sicAt(h, '2023-02-23'), '7374', 'am Einreichungstag noch alt');
  assert.equal(sicAt(h, '2023-02-24'), '7389');
});

test('SDL-T-SIC-03: Bisektion findet jeden Wechsel und liest nur wenige Koepfe', async () => {
  const filings = Array.from({ length: 40 }, (_, i) => ({ filingDate: `20${String(10 + Math.floor(i / 4)).padStart(2, '0')}-0${1 + (i % 4) * 2}-15`, accession: 'f' + i }));
  const truth = (i) => (i < 13 ? '7374' : i < 31 ? '7389' : '6199');
  let reads = 0;
  const h = await sicHistoryByBisection(filings, async (f) => { reads++; return truth(Number(f.accession.slice(1))); });
  assert.ok(reads < 20, `nur ${reads} Koepfe`);
  for (let i = 0; i < 40; i++) {
    const next = i + 1 < 40 ? filings[i + 1].filingDate : '2099-01-01';
    assert.equal(sicAt(h, next), truth(i), `nach Einreichung ${i}`);
  }
});

test('SDL-T-SIC-04: Bisektion ueberspringt unlesbare Koepfe; gleiche Enden = eine Klasse', async () => {
  const filings = Array.from({ length: 10 }, (_, i) => ({ filingDate: `2010-01-${String(10 + i)}`, accession: 'f' + i }));
  const h = await sicHistoryByBisection(filings, async (f) => (f.accession === 'f0' ? null : '2834'));
  assert.deepEqual(h.map((x) => x[1]), ['f1', 'f9']);
  assert.deepEqual(await sicHistoryByBisection([], async () => '1000'), []);
});

test('SDL-T-SIC-05: periodische Einreichungen ohne Aenderungen (/A) und ohne doppelte Accessions', () => {
  const f = periodicFilings([page([['10-K', '2012-02-01', 'k1'], ['10-K/A', '2012-03-01', 'k2'], ['10-Q', '2012-05-01', 'q1'], ['8-K', '2012-05-02', 'e1'], ['10-Q', '2006-05-01', 'old']]), page([['10-K', '2012-02-01', 'k1']])], 2010);
  assert.deepEqual(f.map((x) => x.accession), ['k1', 'q1']);
  const ksb = periodicFilings([page([['10-KSB', '2007-03-01', 's1'], ['10-QSB', '2007-05-01', 's2'], ['10-KSB/A', '2007-06-01', 's3']])], 2006);
  assert.deepEqual(ksb.map((x) => x.accession), ['s1', 's2'], 'Kleinemittenten-Formulare bis 2008');
});

test('SDL-T-IND-01: Gruppenstaerke ist VU-Formalisierung ohne Defaults, leave-one-out, Fallback, Schalen ausgeschlossen', () => {
  assert.throws(() => groupStrength([], 'a', '7374', {}), /angeben/);
  const m = [{ id: 'a', sic: '7374', rsPct: 99 }, { id: 'b', sic: '7372', rsPct: 80 }, { id: 'c', sic: '7371', rsPct: 60 }, { id: 'd', sic: '7379', rsPct: 70 }, { id: 'e', sic: '6770', rsPct: 1 }];
  const g = groupStrength(m, 'a', '7374', { level: 4, fallbackLevel: 3, minMembers: 3 });
  assert.deepEqual(g, { level: 3, group: '737', members: 3, medianRs: 70 });
  assert.equal(groupStrength(m, 'e', '6770', { level: 3, fallbackLevel: 2, minMembers: 1 }), null);
  assert.equal(industryGroup('7374', 2), '73');
  assert.throws(() => industryGroup('7374', 1));
});
