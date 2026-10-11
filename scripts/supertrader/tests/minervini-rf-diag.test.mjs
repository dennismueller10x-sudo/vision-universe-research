// Minervini Rule Fidelity – Tests der privaten Kursdiagnose (rf-diag-lib.mjs) mit SYNTHETISCHEN Reihen.
// Keine echten Kurse, keine historischen Gewinner als Fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { engineBase, powerPlayAt, powerPlayWindow, baseMeasures, publicRow } from '../ground-truth/rf-diag-lib.mjs';

// Reihe aus Stuetzpunkten [[Sitzungen, Zielkurs], ...] ab Startkurs; Hoch/Tief +-0,2 %.
function path(start, legs) {
  const close = [start];
  for (const [n, to] of legs) { const from = close[close.length - 1]; for (let k = 1; k <= n; k++) close.push(from + (to - from) * k / n); }
  return { close, high: close.map((c) => c * 1.002), low: close.map((c) => c * 0.998) };
}
const last = (b) => b.close.length - 1;

test('RF-DIAG-BASE: engineBase = hoechstes Hoch, Gleichstand juengerer Balken, Fenster begrenzt', () => {
  const high = [1, 5, 3, 5, 2], low = [0.5, 1, 1, 1, 1];
  assert.deepEqual(engineBase(high, low, 4, 225), { ws: 0, h1: 3, baseSessions: 1 });
  assert.equal(engineBase(high, low, 4, 2).h1, 3);
  assert.equal(engineBase([1, NaN, 2], [1, 1, 1], 2), null, 'Datenluecke wie DATA_GAP');
});

test('RF-DIAG-PP-YES: +150 % in 25 Sitzungen, 15 Sitzungen enge Flagge (~6 %) -> YES', () => {
  const b = path(10, [[60, 10], [25, 25], [15, 23.6], [0, 23.6]]);
  const r = powerPlayAt(b, last(b));
  assert.equal(r.verdict, 'YES'); assert.equal(r.firstFail, null);
  assert.ok(r.thrustStrict && r.flagLenOk && r.flagLe10);
  assert.equal(r.flagSessions, 15);
});

test('RF-DIAG-PP-THRUST: nur +90 % -> NO (THRUST)', () => {
  const b = path(10, [[60, 10], [25, 19], [15, 18]]);
  const r = powerPlayAt(b, last(b));
  assert.equal(r.verdict, 'NO'); assert.equal(r.firstFail, 'THRUST');
});

test('RF-DIAG-PP-LENGTH: Flagge von 8 Sitzungen ist zu kurz, 12 genuegt (Ausnahme der Quelle)', () => {
  const short = path(10, [[60, 10], [25, 25], [8, 23.8]]);
  assert.equal(powerPlayAt(short, last(short)).firstFail, 'FLAG_LENGTH');
  const twelve = path(10, [[60, 10], [25, 25], [12, 23.8]]);
  assert.equal(powerPlayAt(twelve, last(twelve)).verdict, 'YES');
});

test('RF-DIAG-PP-DEPTH-TIGHTNESS: 22 % Flaggentiefe ohne VCP-Merkmale -> NO; 30 % -> FLAG_DEPTH', () => {
  const deep22 = path(10, [[60, 10], [25, 25], [15, 19.5]]);
  const r22 = powerPlayAt(deep22, last(deep22));
  assert.equal(r22.verdict, 'NO'); assert.equal(r22.firstFail, 'FLAG_TIGHTNESS');
  const deep30 = path(10, [[60, 10], [25, 25], [15, 17.4]]);
  assert.equal(powerPlayAt(deep30, last(deep30)).firstFail, 'FLAG_DEPTH');
});

test('RF-DIAG-PP-VCPLIKE: 15 % Flagge mit zwei fallenden Kontraktionen -> YES ueber VCP-Merkmale', () => {
  // Hoch 25, Tief 21,3 (-15 %), Erholung 24,5, Tief 23,6 (-3,7 %), Ende 24
  const b = path(10, [[60, 10], [25, 25], [6, 21.3], [4, 24.5], [4, 23.6], [2, 24]]);
  const r = powerPlayAt(b, last(b));
  assert.ok(r.vcpLike, JSON.stringify(r.detail.contractions));
  assert.equal(r.verdict, 'YES');
});

test('RF-DIAG-PP-WINDOW: erster Treffer in t*-5 .. t*+5, Offset relativ zu t*', () => {
  const b = path(10, [[60, 10], [25, 25], [12, 23.8], [6, 23.8]]);
  const tStar = last(b) - 3;
  const w = powerPlayWindow(b, tStar);
  assert.notEqual(w.verdict, 'NO');
  assert.ok(w.offset >= -5 && w.offset <= 5);
  assert.equal(powerPlayWindow(path(10, [[80, 10]]), 79).verdict, 'NO');
});

test('RF-DIAG-FLAT: Flat Base mit Hoch auf der rechten Seite wird von der Engine-Basis verfehlt (FLAT_BASE_MISSED)', () => {
  // 40 Sitzungen Aufstieg, dann 40 Sitzungen seitwaerts zwischen 20 und 21,5 (7 %), letztes Hoch rechts
  const b = path(10, [[60, 20], [10, 20.4], [10, 20.0], [10, 20.8], [8, 20.3], [2, 21.5]]);
  const m = baseMeasures(b, last(b));
  assert.ok(m.baseSessions < 15, String(m.baseSessions));
  assert.ok(m.flatSessions15 >= 20, String(m.flatSessions15));
  assert.equal(m.baseFinding, 'FLAT_BASE_MISSED');
});

test('RF-DIAG-SHORT-PAUSE: kurze flache Pause unter einem frischen Hoch -> SHORT_PAUSE_AT_HIGHS', () => {
  // 80 Sitzungen volatil (Range > 15 %), Ausbruch auf 24, 6 Sitzungen Pause (~3 %)
  const b = path(15, [[20, 21], [20, 15], [20, 21], [20, 15], [15, 24], [6, 23.3]]);
  const m = baseMeasures(b, last(b));
  assert.ok(m.baseSessions < 15);
  assert.ok(m.pauseLe15 && m.pauseLe10);
  assert.ok(m.flatSessions15 < 20);
  assert.equal(m.baseFinding, 'SHORT_PAUSE_AT_HIGHS');
});

test('RF-DIAG-NO-STRUCTURE: kein Ausbruch, tiefe Pause -> NO_BASE_STRUCTURE; lange Basis -> NOT_SHORT', () => {
  const b = path(15, [[60, 25], [10, 25], [6, 18]]); // Spitze links, dann tiefer Fall; Basis seit Spitze 6 Sitzungen? -> kurz, keine Flat, Pause tief
  const m = baseMeasures(b, last(b));
  assert.equal(m.baseFinding, 'NO_BASE_STRUCTURE');
  const long = path(15, [[40, 25], [40, 22], [20, 24]]);
  assert.equal(baseMeasures(long, last(long)).baseFinding, 'NOT_SHORT');
});

test('RF-DIAG-PRIVACY: die oeffentliche Zeile akzeptiert nur Wahrheitswerte, ganze Zahlen, null und Kennungen', () => {
  const ok = publicRow({ case_id: 'GT-001', ticker: 'ZGNX', flagSessions: 14, flagLe10: true, offset: null, baseFinding: 'NOT_SHORT' });
  assert.equal(ok.flagSessions, 14);
  assert.throws(() => publicRow({ flagDepth: 0.153 }), /ganze Zahl/);
  assert.throws(() => publicRow({ close: 123.45 }), /ganze Zahl/);
  assert.throws(() => publicRow({ note: 'ein langer Satz mit Leerzeichen und 12,5 %' }), /Kennung/);
  assert.throws(() => publicRow({ arr: [1, 2] }), /Kennung/);
});
