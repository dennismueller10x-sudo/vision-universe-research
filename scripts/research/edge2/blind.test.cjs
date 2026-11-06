'use strict';
// Tests des blinden KI-Backtests (synthetische Daten = Softwarevalidierung, keine Studienaussage).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../..');
const B = require('./blind.cjs');
const R = require('./run-blind.cjs');
const PIN = require('./protocol-pin.cjs');

function panel(T = 520, n = 160) {
  let s = 7; const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const cal = []; const d0 = Date.parse('2014-01-03T00:00:00Z');
  for (let t = 0; t < T; t++) cal.push(new Date(d0 + t * 7 * 86400000).toISOString().slice(0, 10));
  const securities = [];
  for (let i = 0; i < n; i++) { const adj = []; let p = 20 + 30 * r(); for (let t = 0; t < T; t++) { p *= 1 + (r() - 0.5) * 0.06; adj.push(p); }
    securities.push({ id: 'ref_T' + i, sector: ['A1', 'B2', 'C3', 'D4'][i % 4], adj, raw: adj.slice(), dv: new Array(T).fill(50e6), bundle: null, terminal: null }); }
  return { calendar: cal, securities, benchmark: { levels: cal.map(() => 100) } };
}
const salt = 'x'.repeat(64);

test('Protokoll und Prompt gepinnt', () => {
  const b = fs.readFileSync(path.join(ROOT, PIN.BLIND_PROTOCOL_FILE));
  assert.equal(crypto.createHash('sha256').update(b).digest('hex'), PIN.BLIND_PROTOCOL_SHA256);
  const doc = JSON.parse(b);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, doc.prompt.file))).digest('hex'), doc.prompt.sha256);
});

test('Pakete: monatlich, 50 Kandidaten, keine Ticker, kein Datum, keine Branche im Klartext, deterministisch je Salz', () => {
  const p = panel(), w = ['2016-01-01', '2023-12-31'];
  const a = B.buildPackets(p, { window: w, salt }), b = B.buildPackets(p, { window: w, salt }), c = B.buildPackets(p, { window: w, salt: 'y'.repeat(64) });
  assert.equal(a.packets.length, B.decisionWeeks(p, w).length);
  assert.equal(a.packetsSha256, b.packetsSha256);
  assert.notEqual(a.packetsSha256, c.packetsSha256);
  const text = JSON.stringify(a.packets);
  assert.ok(!/ref_T|\d{4}-\d{2}-\d{2}|A1|B2|C3|D4/.test(text));
  for (const x of a.packets) { assert.equal(x.candidates.length, 50); assert.equal(x.candidates[0].relativePath[0], 100); assert.equal(x.candidates[0].relativePath.length, 14); }
  // Reihenfolge nicht chronologisch: nach Paket-ID sortiert.
  const ids = a.packets.map(x => x.packetId); assert.deepEqual(ids, ids.slice().sort());
  assert.throws(() => B.buildPackets(p, { window: w, salt: 'kurz' }), /SALT_REQUIRED/);
});

test('Auswahlen -> Ziele: gleichgewichtet, Ausführung t+1, ungültige Labels gemeldet', () => {
  const p = panel(), r = B.buildPackets(p, { window: ['2016-01-01', '2016-06-30'], salt });
  const k = r.keys[0], labels = Object.keys(k.labels).slice(0, 10);
  const tg = B.targetsFromPicks(p, r.keys, { [k.packetId]: labels.concat(['K99']) });
  assert.equal(tg.targets[0].executionDate, p.calendar[k.t + 1]);
  assert.equal(Object.keys(tg.targets[0].weights).length, 10);
  assert.ok(tg.problems.some(x => x.problem === 'INVALID_LABELS'));
  assert.ok(tg.problems.some(x => x.problem === 'NO_PICKS'));
});

test('Erkennungstest: Schwellen nach Protokoll', () => {
  const keys = { keys: [{ state: 'BUILT', packetId: 'P1', date: '2018-03-02', labels: { K01: 'ref_AAPL', K02: 'ref_XYZ' } }, { state: 'BUILT', packetId: 'P2', date: '2021-03-05', labels: { K01: 'dl_ABC' } }] };
  const blind = R.scoreRecognition({ P1: { year: 2023, firms: {} }, P2: { year: 2016, firms: {} } }, keys);
  assert.equal(blind.failed, false);
  const leak = R.scoreRecognition({ P1: { year: 2018, firms: { K01: 'Apple (AAPL)' } }, P2: { year: 2021 } }, keys);
  assert.equal(leak.failed, true);
  assert.equal(leak.firmHits, 1);
});

test('KI-Vorwärtsledger: Hash-Kette, Manipulation fällt auf; Antwortprüfung', () => {
  const K = require('./ki-forward.cjs'), os = require('node:os');
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'edge2-')), 'ledger.jsonl');
  K.append({ type: 'MARK', asOf: '2026-11-10', closes: {} }, f);
  K.append({ type: 'MARK', asOf: '2026-11-17', closes: {} }, f);
  assert.equal(K.ledger(f).length, 2);
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('2026-11-10', '2026-11-11'));
  assert.throws(() => K.append({ type: 'MARK', asOf: 'x', closes: {} }, f), /LEDGER_CHAIN_BROKEN/);
  const pk = { packetId: 'P1', candidates: Array.from({ length: 50 }, (_, i) => ({ label: 'K' + String(i + 1).padStart(2, '0'), group: 'ABCDEFGHIJ'[i % 10] })) };
  const ok = { packetId: 'P1', picks: pk.candidates.slice(0, 10).map(c => ({ label: c.label })) };
  assert.equal(K.validAnswer(ok, pk), null);
  assert.equal(K.validAnswer({ ...ok, picks: ok.picks.slice(0, 9) }, pk), 'NOT_10_VALID_LABELS');
  const four = { packetId: 'P1', picks: ['K01', 'K11', 'K21', 'K31', 'K02', 'K03', 'K04', 'K05', 'K06', 'K07'].map(label => ({ label })) };
  assert.equal(K.validAnswer(four, pk), 'MORE_THAN_3_PER_GROUP');
});
