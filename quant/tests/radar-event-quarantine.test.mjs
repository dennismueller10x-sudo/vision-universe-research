import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const require = createRequire(import.meta.url);
const Q = require('../engines/radar-event-quarantine.js');
const config = JSON.parse(readFileSync(new URL('../config/radar-event-quarantine.json', import.meta.url), 'utf8'));

test('die Quarantaeneliste ist gueltig und jeder Eintrag traegt Grund und Beleg', () => {
  assert.deepEqual(Q.validate(config), { valid: true, errors: [] });
  assert.ok(config.entries.length >= 1);
});

test('nur das einzeln benannte Ereignis faellt heraus - kein Muster, kein anderer Tag, kein anderer Typ', () => {
  const m = Q.index(config);
  assert.equal(Q.isQuarantined(m, 'DFLI', 'TREND_UP', '2026-10-12'), true);
  assert.equal(Q.isQuarantined(m, 'DFLI', 'TREND_UP', '2026-10-13'), false);
  assert.equal(Q.isQuarantined(m, 'DFLI', 'TREND_DOWN', '2026-10-12'), false);
  assert.equal(Q.isQuarantined(m, 'MSFT', 'TREND_UP', '2026-10-12'), false);
});

test('unvollstaendige oder doppelte Eintraege werden abgewiesen', () => {
  const e = config.entries[0];
  assert.equal(Q.validate({ entries: [{ ...e, reason: '' }] }).valid, false);
  assert.equal(Q.validate({ entries: [{ ...e, evidence: 'kurz' }] }).valid, false);
  assert.equal(Q.validate({ entries: [e, e] }).valid, false);
  assert.equal(Q.validate({ entries: [{ ...e, occurredAt: '12.10.2026' }] }).valid, false);
  assert.throws(() => Q.index({ entries: [{ ...e, ticker: 'x y' }] }), /RADAR_EVENT_QUARANTINE_INVALID/);
});

test('jeder Eintrag verweist auf ein tatsaechlich im Snapshot stehendes Ereignis (kein Eintrag ins Leere)', () => {
  for (const e of config.entries) {
    const f = new URL('../data/product/radar-history/events/' + e.occurredAt + '.json.gz', import.meta.url);
    const snap = JSON.parse(gunzipSync(readFileSync(f)));
    assert.ok(snap.rows.some((r) => r[0] === e.ticker && r[1] === e.eventType && r[3] === e.occurredAt), e.ticker + ' ' + e.occurredAt);
  }
});
