// Supertrader 8.0 – Eingangsprüfung des (deaktivierten) Tageslaufs, O-2: fehlende oder veraltete Eingaben blockieren.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCalendar } from '../source-faithful/product/eod-adapter.mjs';
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

test('SF8-GATE-AUX: veraltete oder undatierte Nebenquellen (Wochenreihen, Kontinuität, SIC, Namen, Stammdaten) blockieren', () => {
  assert.deepEqual(staleAuxiliary(undefined, '2026-10-26'), [], 'Stand im Repository: alle Nebenquellen frisch');
  const late = staleAuxiliary(undefined, '2027-01-15').map((x) => x.source).sort();
  assert.deepEqual(late, Object.keys(AUX_MAX_AGE_DAYS).sort());
  const r = checkInputs({ today: '2026-11-20', asOf: '2026-11-19', calendar });
  assert.equal(r.status, GATE_STATUS.STALE, 'Tagesbalken aktuell, Nebenquellen zu alt');
  assert.ok(r.staleSources.some((x) => x.source === 'sic'));
});
