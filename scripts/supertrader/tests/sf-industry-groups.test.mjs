// PIT-SIC -> Turtle groupsOf / Weinstein-Zugehoerigkeit (adapters/industry-groups.mjs). Synthetisch, keine Marktdaten.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { makeTurtleGroupsOf, makeWeinsteinGroupMembership, cikCandidatesFromSegments, BINDING_STATUS } from '../source-faithful/adapters/industry-groups.mjs';
import { runTurtle } from '../source-faithful/methods/turtle.mjs';

const require = createRequire(import.meta.url);
const IC = require('../../../core/industry-classification.js');

const day = (k) => new Date(Date.UTC(2020, 0, 1) + k * 864e5).toISOString().slice(0, 10);
const bars = (rows) => rows.map(([o, h, l, c], k) => ({ date: day(k), open: o, high: h, low: l, close: c, volume: 1e6, rawClose: c, rawVolume: 1e6, splitAdj: 1, dividend: 0 }));
const flat = (n, p = 100, r = 5) => Array.from({ length: n }, () => [p, p + r, p - r, p]);

// CIK 1 und 2: gleiche 4-stellige SIC; CIK 3: gleiche 2-stellige; CIK 4: SIC erst nach Handelsschluss am Breakout-Vortag bekannt.
const obs = (knownAt, sic) => [[knownAt, sic, 'x', '10-K', 'H', 'S', '']];
const classification = IC.create({ issuers: {
  '0000000001': { observations: obs('2019-02-01T15:00:00Z', '3571') },
  '0000000002': { observations: obs('2019-02-01T15:00:00Z', '3571') },
  '0000000003': { observations: obs('2019-02-01T15:00:00Z', '3577') },
  '0000000004': { observations: obs('2020-03-01T22:30:00Z', '3571') }, // 01.03.2020 17:30 ET
} });
const segs = [1, 2, 3, 4, 5].map((n) => ({ id: `S${n}`, raw: bars(flat(70)), fund: n === 5 ? null : { cik: String(n).padStart(10, '0') } }));
const cikCandidates = cikCandidatesFromSegments(segs);
const decision = { ref: 'TEST-ONLY', closely: 'industry', loosely: 'majorGroup', maxAgeDays: 500 };

test('ohne Owner-Entscheidung keine Gruppen: MODEL_ASSUMPTION_REQUIRED, keine Voreinstellung', () => {
  for (const d of [undefined, {}, { ref: 'x' }, { ref: 'x', maxAgeDays: 400 }]) {
    assert.throws(() => makeTurtleGroupsOf({ classification, cikCandidates, decision: d }), (e) => e.code === 'MODEL_ASSUMPTION_REQUIRED');
  }
  assert.throws(() => makeTurtleGroupsOf({ classification, cikCandidates, decision: { ...decision, closely: 'majorGroup', loosely: 'industry' } }), RangeError);
  assert.throws(() => makeWeinsteinGroupMembership({ classification, cikCandidates, decision: { ref: 'x', maxAgeDays: 1 } }), (e) => e.code === 'MODEL_ASSUMPTION_REQUIRED');
});

test('Bindungsstatus bleibt DATA_BLOCKED; der Adapter schaltet nichts frei', () => {
  assert.equal(BINDING_STATUS['TUR-SF-LIMIT-CORR'].status, 'DATA_BLOCKED');
  assert.equal(BINDING_STATUS['WEIN-SF-GROUP'].status, 'DATA_BLOCKED');
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
});

test('kein Lookahead: Filing nach Handelsschluss gilt erst ab dem naechsten Datum', () => {
  const { groupsOf } = makeTurtleGroupsOf({ classification, cikCandidates, decision });
  assert.equal(groupsOf('S4', '2020-03-01'), null);
  assert.deepEqual(groupsOf('S4', '2020-03-02'), { closely: 'SIC4:3571', loosely: 'SIC2:35' });
});

test('maxAgeDays der Entscheidung macht alte Beobachtungen zu fehlenden Gruppen (STALE, gezaehlt)', () => {
  const { groupsOf, diagnostics } = makeTurtleGroupsOf({ classification, cikCandidates, decision: { ...decision, maxAgeDays: 30 } });
  assert.equal(groupsOf('S1', '2020-01-10'), null);
  assert.equal(diagnostics().missingByReason.STALE, 1);
});

test('ohne Aktivierung unveraendert: runTurtle ohne groupsOf = bisheriges Ergebnis; mit Adapter partielle Abdeckung sichtbar', () => {
  const secs = segs.map((s) => ({ id: s.id, terminal: null, bars: bars([...flat(60, 100, 12.5), [100, 151, 112, 150], ...flat(5, 150, 2)]) }));
  const data = { calendar: secs[0].bars.map((b) => b.date), securities: secs };
  const base = runTurtle(data, { system: 'S2', from: day(0) });
  const again = runTurtle(data, { system: 'S2', from: day(0) });
  assert.deepEqual(base.ledger, again.ledger);
  assert.equal(base.correlationLimits, 'NOT_EVALUATED_NO_PIT_GROUPS');
  const { groupsOf } = makeTurtleGroupsOf({ classification, cikCandidates, decision });
  const withGroups = runTurtle(data, { system: 'S2', from: day(0), groupsOf });
  assert.equal(withGroups.correlationLimits, 'ENFORCED_PARTIAL_GROUP_COVERAGE');
  assert.ok(withGroups.counts.correlationGroupMissing > 0);
  // S1 und S2 teilen SIC 3571 (eng), S1-S3 die Major Group 35 (lose): die Limits greifen
  assert.ok(withGroups.counts.rejectCorrelationLimit6 + withGroups.counts.rejectCorrelationLimit10 > 0);
});

test('Weinstein: Zugehoerigkeit zum Zeitpunkt, Gruppen-Stage bleibt DATA_BLOCKED', () => {
  const m = makeWeinsteinGroupMembership({ classification, cikCandidates, decision: { ref: 'TEST-ONLY', level: 'industryGroup', maxAgeDays: 500 } });
  const r = m.rosterAt(['S1', 'S2', 'S3', 'S4', 'S5'], '2020-01-10');
  assert.deepEqual(r.groups, { 'SIC3:357': ['S1', 'S2', 'S3'] });
  assert.deepEqual(r.unknown, ['S4', 'S5']);
  assert.equal(r.groupStage, 'DATA_BLOCKED');
});
