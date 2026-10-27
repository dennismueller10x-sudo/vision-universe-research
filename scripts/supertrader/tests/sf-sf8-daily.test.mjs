// Supertrader 8.0 – Eingangsprüfung des (deaktivierten) Tageslaufs, O-2: fehlende oder veraltete Eingaben blockieren.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCalendar, SOURCES } from '../source-faithful/product/eod-adapter.mjs';
import { checkInputs, lastCompletedSession, missingSources, staleAuxiliary, AUX_MAX_AGE_DAYS, GATE_STATUS } from '../source-faithful/product/input-gate.mjs';

const calendar = createCalendar();

test('SF8-GATE-SESSION: abgeschlossene Sitzung ist die letzte XNYS-Sitzung vor dem Lauftag', () => {
  assert.equal(lastCompletedSession(calendar, '2026-10-26'), '2026-10-23'); // Montag -> Freitag
  assert.equal(lastCompletedSession(calendar, '2026-10-24'), '2026-10-23'); // Samstag -> Freitag
  assert.equal(lastCompletedSession(calendar, '2026-10-23'), '2026-10-22'); // Freitag früh: Donnerstag
  assert.equal(lastCompletedSession(calendar, '2026-11-27'), '2026-11-25'); // Thanksgiving 26.11. übersprungen
});

test('SF8-GATE-CURRENT-STALE: Stand vor der erwarteten Sitzung blockiert', () => {
  assert.equal(checkInputs({ today: '2026-10-26', asOf: '2026-10-23', calendar }).status, GATE_STATUS.CURRENT);
  const stale = checkInputs({ today: '2026-10-28', asOf: '2026-10-23', calendar });
  assert.equal(stale.status, GATE_STATUS.STALE);
  assert.equal(stale.expectedSession, '2026-10-27');
  assert.equal(checkInputs({ today: '2026-10-26', asOf: null, calendar }).status, GATE_STATUS.STALE);
  assert.throws(() => checkInputs({ asOf: '2026-10-23', calendar }), /INPUT_GATE_TODAY_REQUIRED/);
});

test('SF8-GATE-MISSING: fehlende Pflichtquellen blockieren vor jeder Datumsprüfung', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sf8-gate-'));
  try {
    const r = checkInputs({ root: tmp, today: '2026-10-26', asOf: '2026-10-23', calendar });
    assert.equal(r.status, GATE_STATUS.MISSING);
    assert.ok(r.missing.includes('dailyBars') && r.missing.includes('sic'));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  assert.deepEqual(missingSources(), [], 'im Repository sind alle Quellen vorhanden');
});

test('SF8-GATE-CALENDAR: außerhalb der Kalenderabdeckung keine Aussage über Sitzungen', () => {
  const narrow = { ...calendar, inCoverage: () => false };
  assert.equal(checkInputs({ today: '2026-10-26', asOf: '2026-10-23', calendar: narrow }).status, GATE_STATUS.CALENDAR);
});

// Review HIGH 3: keine Zusicherung über künftige Daten des Repositorys – das Alter wird an einer Fixture mit festen
// Erzeugungsdaten geprüft (sonst kippt der Test, sobald ein Nachtlauf die Quellen erneuert).
function fixtureRoot(generatedAt) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sf8-gate-aux-'));
  const w = (rel, obj) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(obj)); };
  for (const [key, rel] of Object.entries(SOURCES)) {
    const at = generatedAt[key];
    if (key === 'weeklyLong') w(path.join(rel, 'index.json'), at === undefined ? {} : { generatedAt: at });
    else if (key === 'dailyBars' || key === 'priceReference') w(path.join(rel, 'X.json'), {});
    else w(rel, at === undefined ? { x: 1 } : { generatedAt: at, x: 1 });
  }
  return root;
}
const FRESH = { weeklyLong: '2026-10-20T00:00:00Z', continuity: '2026-10-20T00:00:00Z', sic: '2026-10-20T00:00:00Z', names: '2026-10-01T00:00:00Z', master: '2026-09-11T00:00:00Z' };

test('SF8-GATE-AUX: veraltete oder undatierte Nebenquellen (Wochenreihen, Kontinuität, SIC, Namen, Stammdaten) blockieren', () => {
  assert.deepEqual(staleAuxiliary(undefined, '2026-10-26'), [], 'Stand im Repository am 26.10.2026: alle Nebenquellen frisch');
  const root = fixtureRoot(FRESH);
  try {
    assert.deepEqual(missingSources(root), []);
    assert.deepEqual(staleAuxiliary(root, '2026-10-26'), []);
    // je Quelle genau an ihrer Grenze (zulässig) und einen Tag danach (veraltet)
    for (const [key, maxDays] of Object.entries(AUX_MAX_AGE_DAYS)) {
      const at = Date.parse(FRESH[key]);
      const day = (n) => new Date(at + n * 864e5).toISOString().slice(0, 10);
      assert.ok(!staleAuxiliary(root, day(maxDays)).some((x) => x.source === key), `${key} an der Grenze`);
      assert.ok(staleAuxiliary(root, day(maxDays + 1)).some((x) => x.source === key), `${key} einen Tag danach`);
    }
    assert.deepEqual(staleAuxiliary(root, '2027-01-15').map((x) => x.source).sort(), Object.keys(AUX_MAX_AGE_DAYS).sort());
    const r = checkInputs({ root, today: '2026-11-20', asOf: '2026-11-19', calendar });
    assert.equal(r.status, GATE_STATUS.STALE, 'Tagesbalken aktuell, Nebenquellen zu alt');
    assert.ok(r.staleSources.some((x) => x.source === 'sic'));
    assert.equal(checkInputs({ root, today: '2026-10-27', asOf: '2026-10-26', calendar }).status, GATE_STATUS.CURRENT);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
  const undated = fixtureRoot({ ...FRESH, sic: undefined });
  try { assert.deepEqual(staleAuxiliary(undated, '2026-10-26').map((x) => x.source), ['sic'], 'ohne Erzeugungsdatum = veraltet'); }
  finally { fs.rmSync(undated, { recursive: true, force: true }); }
});
