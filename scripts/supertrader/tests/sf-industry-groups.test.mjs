// PIT-SIC -> Turtle groupsOf / Weinstein-Zugehoerigkeit (adapters/industry-groups.mjs). Synthetisch, keine Marktdaten.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { makeTurtleGroupsOf, makeWeinsteinGroupMembership, cikCandidatesFromSegments, BINDING_STATUS, IDENTITY_EVIDENCE } from '../source-faithful/adapters/industry-groups.mjs';
import { runTurtle } from '../source-faithful/methods/turtle.mjs';

const require = createRequire(import.meta.url);
const IC = require('../../../core/industry-classification.js');

const day = (k) => new Date(Date.UTC(2020, 0, 1) + k * 864e5).toISOString().slice(0, 10);
const bars = (rows) => rows.map(([o, h, l, c], k) => ({ date: day(k), open: o, high: h, low: l, close: c, volume: 1e6, rawClose: c, rawVolume: 1e6, splitAdj: 1, dividend: 0 }));
const flat = (n, p = 100, r = 5) => Array.from({ length: n }, () => [p, p + r, p - r, p]);

// CIK 1 und 2: gleiche 4-stellige SIC; CIK 3: gleiche 2-stellige; CIK 4: SIC erst nach Handelsschluss bekannt.
const obs = (knownAt, sic) => [[knownAt, sic, 'x', '10-K', 'H', 'S', '']];
const classification = IC.create({ issuers: {
  '0000000001': { observations: obs('2019-02-01T15:00:00Z', '3571') },
  '0000000002': { observations: obs('2019-02-01T15:00:00Z', '3571') },
  '0000000003': { observations: obs('2019-02-01T15:00:00Z', '3577') },
  '0000000004': { observations: obs('2020-03-01T22:30:00Z', '3571') }, // 01.03.2020 17:30 ET
  '0000000006': { observations: obs('2019-02-01T15:00:00Z', '3571') },
} });
const segs = [1, 2, 3, 4, 5, 6].map((n) => ({ id: `S${n}`, raw: bars(flat(70)), fund: n === 5 ? null : { cik: String(n).padStart(10, '0') } }));
// Herkunft aus validation/sec-pit.mjs: S6 nur ueber die heutige Ticker-Liste zugeordnet
const secPit = { S1: { cik: '0000000001', how: 'NAME_MATCH' }, S2: { cik: '0000000002', how: 'NAME_MATCH' }, S3: { cik: '0000000003', how: 'NAME_MATCH' }, S4: { cik: '0000000004', how: 'NAME_MATCH' }, S6: { cik: '0000000006', how: 'KNOWN' } };
const cikCandidates = cikCandidatesFromSegments(segs, secPit);
const decision = { ref: 'TEST-ONLY', basis: 'SIC_PROXY', closely: 'industry', loosely: 'majorGroup', maxAgeDays: 500, acceptedIdentityEvidence: [IDENTITY_EVIDENCE.NAME_EXACT_XBRL_IN_LISTING_WINDOW] };

test('ohne Owner-Entscheidung keine Gruppen: MODEL_ASSUMPTION_REQUIRED, keine Voreinstellung', () => {
  const partial = [undefined, {}, { ref: 'x' }, { ref: 'x', maxAgeDays: 400 }, { ...decision, acceptedIdentityEvidence: [] }, { ...decision, acceptedIdentityEvidence: ['TICKER'] }, { ...decision, basis: 'PRICE_CORRELATION' }];
  for (const d of partial) assert.throws(() => makeTurtleGroupsOf({ classification, cikCandidates, decision: d }), (e) => e.code === 'MODEL_ASSUMPTION_REQUIRED');
  assert.throws(() => makeTurtleGroupsOf({ classification, cikCandidates, decision: { ...decision, closely: 'majorGroup', loosely: 'industry' } }), RangeError);
  assert.throws(() => makeWeinsteinGroupMembership({ classification, cikCandidates, decision: { ref: 'x', maxAgeDays: 1, acceptedIdentityEvidence: ['UNSPECIFIED'] } }), (e) => e.code === 'MODEL_ASSUMPTION_REQUIRED');
});

test('Bindungsstatus bleibt DATA_BLOCKED; Turtle-Gruppen sind in der Quelle nur Futures-Beispiele', () => {
  assert.equal(BINDING_STATUS['TUR-SF-LIMIT-CORR'].status, 'DATA_BLOCKED');
  assert.ok(BINDING_STATUS['TUR-SF-LIMIT-CORR'].blockedBy.includes('NO_SOURCE_CORRELATION_MEASURE_WINDOW_OR_THRESHOLD'));
  assert.equal(BINDING_STATUS['WEIN-SF-GROUP'].status, 'DATA_BLOCKED');
});

test('Identitaet: Herkunft aus sec-pit wird gekennzeichnet; ohne Herkunft UNSPECIFIED', () => {
  assert.equal(cikCandidates.get('S6')[0].evidence, IDENTITY_EVIDENCE.CURRENT_TICKER_MAPPING);
  assert.equal(cikCandidates.get('S1')[0].evidence, IDENTITY_EVIDENCE.NAME_EXACT_XBRL_IN_LISTING_WINDOW);
  assert.equal(cikCandidatesFromSegments(segs).get('S1')[0].evidence, IDENTITY_EVIDENCE.UNSPECIFIED);
  assert.equal(cikCandidates.has('S5'), false);
});

test('eine heutige Ticker-Zuordnung zaehlt nie still als historische Bestaetigung', () => {
  const strict = makeTurtleGroupsOf({ classification, cikCandidates, decision });
  assert.equal(strict.groupsOf('S6', '2020-01-10'), null);
  assert.equal(strict.diagnostics().missingByReason.IDENTITY_EVIDENCE_NOT_ACCEPTED, 1);
  // nur wenn die Entscheidung genau diese Klasse annimmt, und dann sichtbar in der Bilanz
  const lax = makeTurtleGroupsOf({ classification, cikCandidates, decision: { ...decision, acceptedIdentityEvidence: [IDENTITY_EVIDENCE.NAME_EXACT_XBRL_IN_LISTING_WINDOW, IDENTITY_EVIDENCE.CURRENT_TICKER_MAPPING] } });
  assert.deepEqual(lax.groupsOf('S6', '2020-01-10'), { closely: 'SIC4:3571', loosely: 'SIC2:35' });
  assert.equal(lax.diagnostics().resolvedByIdentityEvidence.CURRENT_TICKER_MAPPING, 1);
  // ohne Herkunft (seg.fund.cik allein) nur, wenn UNSPECIFIED ausdruecklich angenommen ist
  const noProvenance = makeTurtleGroupsOf({ classification, cikCandidates: cikCandidatesFromSegments(segs), decision });
  assert.equal(noProvenance.groupsOf('S1', '2020-01-10'), null);
});

test('groupsOf: Ebenen aus der SIC zum Zeitpunkt, unbekannte Zustaende null und mit Grund gezaehlt', () => {
  const { groupsOf, diagnostics } = makeTurtleGroupsOf({ classification, cikCandidates, decision });
  assert.deepEqual(groupsOf('S1', '2020-01-10'), { closely: 'SIC4:3571', loosely: 'SIC2:35' });
  assert.deepEqual(groupsOf('S3', '2020-01-10'), { closely: 'SIC4:3577', loosely: 'SIC2:35' });
  assert.equal(groupsOf('S5', '2020-01-10'), null);           // keine CIK im Snapshot
  assert.equal(groupsOf('S4', '2020-01-10'), null);           // vor der ersten Beobachtung
  assert.equal(groupsOf('S1', '2019-12-01'), null);           // ausserhalb des Segmentfensters
  const d = diagnostics();
  assert.equal(d.missingByReason.IDENTITY_NO_CIK, 1);
  assert.equal(d.missingByReason.UNKNOWN_BEFORE_FIRST_OBSERVATION, 1);
  assert.equal(d.missingByReason.IDENTITY_OUTSIDE_EVIDENCED_WINDOW, 1);
  assert.equal(d.unknown, 3);
  assert.equal(d.missingGroupMeaning, 'UNKNOWN_NOT_INDEPENDENT');
  assert.match(d.carryForwardAssumption, /500 Tage/);
  // jede verwendete Beobachtung ist in der Kern-API als deklarierte Fortschreibung markiert
  const r = classification.getIndustryClassification('1', '2020-01-10', { maxAgeDays: decision.maxAgeDays, assumptionRef: decision.ref });
  assert.deepEqual(r.carryForward, { declared: true, maxAgeDays: 500, assumptionRef: 'TEST-ONLY' });
});

test('kein Lookahead: Filing nach Handelsschluss gilt erst ab dem naechsten Datum', () => {
  const { groupsOf } = makeTurtleGroupsOf({ classification, cikCandidates, decision });
  assert.equal(groupsOf('S4', '2020-03-01'), null);
  assert.deepEqual(groupsOf('S4', '2020-03-02'), { closely: 'SIC4:3571', loosely: 'SIC2:35' });
});

test('Fortschreibung nur bis maxAgeDays der Entscheidung; aelter ist unbekannt (STALE, gezaehlt)', () => {
  const { groupsOf, diagnostics } = makeTurtleGroupsOf({ classification, cikCandidates, decision: { ...decision, maxAgeDays: 30 } });
  assert.equal(groupsOf('S1', '2020-01-10'), null);
  assert.equal(diagnostics().missingByReason.STALE, 1);
});

test('ohne Aktivierung unveraendert; mit Adapter greifen die Limits, Konformitaet wird nie behauptet', () => {
  const secs = segs.map((s) => ({ id: s.id, terminal: null, bars: bars([...flat(60, 100, 12.5), [100, 151, 112, 150], ...flat(5, 150, 2)]) }));
  const data = { calendar: secs[0].bars.map((b) => b.date), securities: secs };
  const base = runTurtle(data, { system: 'S2', from: day(0) });
  const again = runTurtle(data, { system: 'S2', from: day(0) });
  assert.deepEqual(base.ledger, again.ledger);
  assert.equal(base.correlationLimits, 'NOT_EVALUATED_NO_PIT_GROUPS');
  const adapter = makeTurtleGroupsOf({ classification, cikCandidates, decision });
  const withGroups = runTurtle(data, { system: 'S2', from: day(0), groupsOf: adapter.groupsOf });
  assert.equal(withGroups.correlationLimits, 'ENFORCED_PARTIAL_GROUP_COVERAGE');
  assert.ok(withGroups.counts.rejectCorrelationLimit6 + withGroups.counts.rejectCorrelationLimit10 > 0);
  const c = adapter.conformance(withGroups);
  assert.equal(c.ruleConformance, 'NOT_ESTABLISHED');
  assert.ok(c.reasons.includes('GROUPS_ARE_SIC_PROXY_NOT_SOURCE_CORRELATION'));
  assert.ok(c.reasons.includes('UNKNOWN_GROUPS_LIMITED_ONLY_BY_LIMIT4_LIMIT12'));
  assert.ok(c.entriesWithUnknownGroup > 0);
  // auch bei voller Abdeckung keine Konformitaet: nur S1-S3 mit bekannter Gruppe
  const full = runTurtle({ calendar: data.calendar, securities: secs.slice(0, 3) }, { system: 'S2', from: day(0), groupsOf: adapter.groupsOf });
  assert.equal(full.correlationLimits, 'ENFORCED_WITH_CALLER_GROUPS');
  assert.equal(adapter.conformance(full).ruleConformance, 'NOT_ESTABLISHED');
});

test('Weinstein: Zugehoerigkeit zum Zeitpunkt, Unbekannte getrennt, Gruppen-Stage bleibt DATA_BLOCKED', () => {
  const m = makeWeinsteinGroupMembership({ classification, cikCandidates, decision: { ref: 'TEST-ONLY', level: 'industryGroup', maxAgeDays: 500, acceptedIdentityEvidence: [IDENTITY_EVIDENCE.NAME_EXACT_XBRL_IN_LISTING_WINDOW] } });
  const r = m.rosterAt(['S1', 'S2', 'S3', 'S4', 'S5', 'S6'], '2020-01-10');
  assert.deepEqual(r.groups, { 'SIC3:357': ['S1', 'S2', 'S3'] });
  assert.deepEqual(r.unknown, ['S4', 'S5', 'S6']);
  assert.equal(r.unknownMeaning, 'UNKNOWN_NOT_INDEPENDENT');
  assert.equal(r.groupStage, 'DATA_BLOCKED');
});
