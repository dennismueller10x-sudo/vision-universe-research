// Runde 9: Minutenreihenfolge am Kauf-Stop-Tag (intraday-study.mjs) - Entscheidungslogik.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, stratum, select, evaluate, QUOTA } from '../validation/intraday-study.mjs';

const m = (i, o, hi, lo, c) => ({ date: `2020-05-29T${String(13 + Math.floor((30 + i) / 60)).padStart(2, '0')}:${String((30 + i) % 60).padStart(2, '0')}:00.000Z`, open: o, high: hi, low: lo, close: c, volume: 100 });
// Tagesbalken bereinigt = roh (Faktor 1): O 98, H 105, L 95, C 101; Trigger 100.
const rec = { trigger: 100, fill: 100, stop: 95, open: 98, high: 105, low: 95, close: 101, rawFactor: 1, adr: 0.1 };

test('R9-I1 Tief VOR dem Kauf: Momentum-Stop = Tagestief, kein Ausstieg; Tief NACH dem Kauf: Stop höher, Ausstieg', () => {
  const lowFirst = [m(0, 98, 98, 95, 96), m(1, 96, 100.5, 96, 100), m(2, 100, 105, 99, 104), m(3, 104, 104, 100, 101)];
  const a = resolve(rec, lowFirst, 'MOMENTUM_BREAKOUT');
  assert.equal(a.status, 'RESOLVED'); assert.equal(a.entryMinute, '09:31'); assert.equal(a.exitSameDay, false); assert.equal(a.stopAdj, 95);
  const lowLater = [m(0, 98, 99, 97, 98.5), m(1, 98.5, 100.5, 98, 100), m(2, 100, 105, 99, 104), m(3, 104, 104, 95, 101)];
  const b = resolve(rec, lowLater, 'MOMENTUM_BREAKOUT');
  assert.equal(b.stopAdj, 97, 'Stop = tiefstes Tief bis zum Kauf');
  assert.equal(b.exitSameDay, true); assert.equal(b.exitMinute, '09:33'); assert.equal(b.dayLowAfterEntry, true);
});

test('R9-I2 Fester Stop (Darvas/Turtle): Ausstieg nur, wenn das Tief NACH dem Kauf den Stop erreicht', () => {
  const r = { ...rec, stop: 99, low: 98.5 };
  const before = [m(0, 98, 99, 98.5, 98.8), m(1, 98.8, 100.5, 99.2, 100.2), m(2, 100.2, 105, 100, 101)];
  assert.equal(resolve(r, before, 'DARVAS_BOX').exitSameDay, false);
  const after = [m(0, 98, 99.5, 99.2, 99.4), m(1, 99.4, 100.5, 99.3, 100.2), m(2, 100.2, 105, 98.5, 101)];
  assert.equal(resolve(r, after, 'DARVAS_BOX').exitSameDay, true);
});

test('R9-I3 Gap: Einstieg zur Eröffnung; Kontrollen: kein Trigger auf IEX, Identität, keine Daten', () => {
  const g = resolve({ ...rec, open: 102, fill: 102, low: 95.5 }, [m(0, 102, 103, 101.5, 102.5), m(1, 102.5, 105, 95.5, 101)], 'DARVAS_BOX');
  assert.equal(g.gap, true); assert.equal(g.fillAdj, 102); assert.equal(g.entryMinute, '09:30'); assert.equal(g.iexGapAgrees, true);
  const j = resolve(rec, [m(0, 98, 99, 95, 98.5), m(2, 100.8, 105, 100.5, 101)], 'DARVAS_BOX');
  assert.equal(j.fillAdj, 100, 'Preis bleibt beim Modell'); assert.ok(Math.abs(j.printJump - 0.008) < 1e-9, 'IEX-Drucksprung als Diagnose');
  assert.equal(resolve({ ...rec, trigger: 104.95 }, [m(0, 98, 99.9, 95.1, 99), m(1, 99, 104.9, 95, 101)], 'DARVAS_BOX').status, 'IEX_HIGH_BELOW_TRIGGER', 'IEX-Hoch 104,9 innerhalb 1 % des Tageshochs, Trigger 104,95 aber nicht erreicht');
  const amb = resolve({ ...rec, stop: 99, low: 98.5 }, [m(0, 98, 99, 98.8, 98.9), m(1, 98.9, 100.5, 98.5, 100.2), m(2, 100.2, 105, 100, 101)], 'DARVAS_BOX');
  assert.equal(amb.minuteAmbiguous, true, 'Tief im Einstiegsbalken unter dem Stop: Minutenauflösung reicht nicht, vorsichtig gezählt');
  const r2 = { ...rec, high: 95.9, low: 95 };
  assert.equal(resolve(r2, [m(0, 98, 99, 97, 98)], 'DARVAS_BOX').status, 'IDENTITY_MISMATCH');
  assert.equal(resolve(rec, [], 'DARVAS_BOX').status, 'NO_INTRADAY');
});

test('R9-I4 Split: Umrechnung über den Faktor Rohkurs/bereinigt', () => {
  const r = { ...rec, rawFactor: 4, low: 95, high: 105 }; // Rohkurse viermal so hoch wie bereinigt
  const bars = [m(0, 392, 396, 380, 390), m(1, 390, 402, 388, 400), m(2, 400, 420, 396, 404)]; // Tief 380 = 95 bereinigt, Hoch 420 = 105
  const x = resolve(r, bars, 'MOMENTUM_BREAKOUT');
  assert.equal(x.status, 'RESOLVED'); assert.equal(x.fillAdj, 100); assert.equal(x.stopAdj, 95);
});

test('R9-I5 Schichten und Auswahl nach Protokoll (Hash, Quoten, Vollerhebung Momentum)', () => {
  assert.equal(stratum('MOMENTUM_BREAKOUT', { close: 99, fill: 100, stop: 95, low: 95 }), 'AMBIGUOUS');
  assert.equal(stratum('DARVAS_BOX', { close: 101, fill: 100, stop: 99, low: 98 }), 'AMBIGUOUS');
  assert.equal(stratum('DARVAS_BOX', { close: 98.5, fill: 100, stop: 99, low: 98 }), 'CERTAIN');
  assert.equal(stratum('DARVAS_BOX', { close: 101, fill: 100, stop: 99, low: 99.5 }), 'CLEAR');
  const recs = [];
  for (let i = 0; i < 500; i++) recs.push({ engine: 'DARVAS_BOX@3.0.0', seg: 's' + i, date: '2020-01-02', stratum: 'AMBIGUOUS', splitNear: false });
  for (let i = 0; i < 7; i++) recs.push({ engine: 'MOMENTUM_BREAKOUT@3.1.0', seg: 'k' + i, date: '2020-01-02', stratum: 'CLEAR', splitNear: false });
  const sel = select(recs);
  assert.equal(sel.filter((x) => x.engine.startsWith('DARVAS')).length, QUOTA['DARVAS_BOX@3.0.0'].AMBIGUOUS);
  assert.equal(sel.filter((x) => x.engine.startsWith('MOMENTUM')).length, 7);
  assert.deepEqual(select(recs).map((x) => x.seg), sel.map((x) => x.seg), 'deterministisch');
  const ev = evaluate([{ engine: 'X', stratum: 'AMBIGUOUS', neutralExit: false, pessExit: true, truth: { status: 'RESOLVED', exitSameDay: true, fillDiff: 0, stopDiff: 0, gap: false } }]);
  assert.equal(ev.X.strata.AMBIGUOUS.truthExitShare.p, 1); assert.equal(ev.X.strata.AMBIGUOUS.pessAgreeShare, 1);
});

test('R9-I6 Simulator: Minutenquelle bestimmt Einstieg, Stop und Gleichtags-Ausstieg; ohne Minuten bleibt die Tagesbalken-Annahme', async () => {
  const { simulate } = await import('../engine/simulator.mjs');
  const kk3 = (await import('../engine/strategies/kk-breakout-v3.mjs')).default;
  const stub = { ...kk3, id: 'MOMENTUM_BREAKOUT', version: '9', PARAMS: {},
    scan: () => ({ stage: 'ENTRY_READY', rules: {}, facts: {}, levels: { trigger: 100, invalidation: 80, adr20: 0.05 } }),
    invalidate: () => null, manage: () => ({}) };
  const bars = { date: ['2026-01-05', '2026-01-06', '2026-01-07'], open: [95, 98, 103], high: [97, 104, 106], low: [94, 97, 101], close: [96, 99, 105], volume: [1e6, 2e6, 1e6] };
  const ctx = { symbol: 'X', bars, ind: { adr20: [0.05, 0.05, 0.05], vol50: [1e6, 1e6, 1e6] }, cross: {} };
  // Ohne Minuten: neutral, Stop = Tagestief 97, kein Ausstieg am Einstiegstag.
  const a = simulate(stub, ctx, { from: 0, to: 1 });
  assert.equal(a.state.signal.entry.evidence, 'DAILY_BAR_HIGH_REACHED_TRIGGER');
  assert.equal(a.state.signal.entry.sameDayOrder, 'AMBIGUOUS', 'Schluss 99 unter dem Einstieg 100: Reihenfolge aus Tagesbalken offen');
  // Mit Minuten: Tief erst nach dem Kauf -> Stop 98,5 (Tief bis zum Kauf), Ausstieg am selben Tag.
  const oracle = () => ({ status: 'RESOLVED', fill: 100, stop: 98.5, exitSameDay: true, exitPrice: 98.5, entryMinute: '10:12' });
  const b = simulate(stub, ctx, { from: 0, to: 1, intradayOracle: oracle });
  const s = b.finished[0];
  assert.equal(s.entry.evidence, 'INTRADAY_1MIN'); assert.equal(s.entry.entryMinute, '10:12');
  assert.equal(s.initialStop, 98.5); assert.equal(s.exits[0].priceBasis, 'SAME_DAY_INTRADAY');
  assert.ok(Math.abs(s.exits[0].price - 98.5 * 0.999) < 1e-9);
  // Unaufgeloeste Minuten: Rueckfall auf die Annahme.
  const c = simulate(stub, ctx, { from: 0, to: 1, intradayOracle: () => ({ status: 'NO_INTRADAY' }) });
  assert.equal(c.state.signal.entry.evidence, 'DAILY_BAR_HIGH_REACHED_TRIGGER');
});
