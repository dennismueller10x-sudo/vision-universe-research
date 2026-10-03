// Runde 8: Kullamaegi Breakout 3.0.0 - Regelidentitaet gegen den Originaltext
// (qullamaggie.com "3 TIMELESS setups", gelesen 02.10.2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../engine/simulator.mjs';
import kk3, { intradayEntry } from '../engine/strategies/kk-breakout-v3.mjs';
import kk1 from '../engine/strategies/kk-breakout.mjs';

const pend = { levels: { trigger: 100, adr20: 0.05 } };
const ctx1 = (o) => ({ bars: { open: [0, o.open], high: [0, o.high], low: [0, o.low], close: [0, o.close], volume: [0, 2e6] }, ind: { adr20: [0.05, 0.05], vol50: [1e6, 1e6] } });

test('R8-K1 "enter when the stock is starting to break out": Kauf-Stop am Trigger im Tagesverlauf, nicht am Folgetag', () => {
  assert.equal(intradayEntry(ctx1({ open: 98, high: 99.9, low: 97, close: 99 }), 1, pend), null, 'Hoch unter dem Trigger: kein Einstieg');
  const e = intradayEntry(ctx1({ open: 98, high: 104, low: 97, close: 103 }), 1, pend);
  assert.equal(e.price, 100, 'Füllung am Trigger');
  assert.equal(e.ruleId, 'KK-BO-ENTRY-ORH-D');
  const g = intradayEntry(ctx1({ open: 102, high: 106, low: 101, close: 105 }), 1, pend);
  assert.equal(g.price, 102, 'Eröffnung über dem Trigger: Füllung zur Eröffnung');
  assert.equal(kk3.entryMode, 'BUY_STOP_INTRADAY');
  assert.equal(kk1.entryMode, undefined, '1.1.0 bleibt bei Schlusskurs-Bestätigung');
});

test('R8-K2 "Stop is always lows of the day … not wider than the ADR": Tagestief, gekappt auf 1 ADR', () => {
  const e = intradayEntry(ctx1({ open: 98, high: 104, low: 97, close: 103 }), 1, pend);
  assert.equal(e.stop, 97); assert.equal(e.stopRuleId, 'KK-BO-STOP-LOD');
  const w = intradayEntry(ctx1({ open: 92, high: 104, low: 90, close: 103 }), 1, pend);
  assert.ok(Math.abs(w.stop - 95) < 1e-9, 'Tagestief 10 % unter dem Einstieg, ADR 5 %: Stop 95'); assert.equal(w.stopRuleId, 'KK-BO-STOP-ADR');
  assert.equal(intradayEntry(ctx1({ open: 98, high: 104, low: 97, close: 99 }), 1, pend).pessimisticSameDayExit, true, 'Schluss unter dem Einstieg: vorsichtige Variante steigt aus');
});

// Minimal-Strategie fuer die Simulator-Mechanik des Kauf-Stops.
const stub = { id: 'S', version: '9', variant: 'S', timeframe: 'daily', entryMode: 'BUY_STOP_INTRADAY', PARAMS: {},
  scan: (ctx, t) => (t === 0 ? { stage: 'ENTRY_READY', rules: {}, facts: {}, levels: { trigger: 100, invalidation: 80, adr20: 0.05 } } : { stage: 'ENTRY_READY', rules: {}, facts: {}, levels: { trigger: 100, invalidation: 80, adr20: 0.05 } }),
  invalidate: () => null, intradayEntry, confirm: () => null, planEntry: () => ({}), manage: () => ({}) };
const bars = { date: ['2026-01-05', '2026-01-06', '2026-01-07'], open: [95, 98, 103], high: [97, 104, 106], low: [94, 97, 101], close: [96, 99, 105], volume: [1e6, 2e6, 1e6] };
const ctx = { symbol: 'X', bars, ind: { adr20: [0.05, 0.05, 0.05], vol50: [1e6, 1e6, 1e6] }, cross: {} };

test('R8-K3 Simulator: Entdeckung am Abend, Kauf-Stop am nächsten Tag, Protokoll mit Datum, Preis, Regel', () => {
  const r = simulate(stub, ctx, { from: 0, to: 2 });
  const s = r.state.signal;
  assert.equal(s.entry.date, '2026-01-06'); assert.equal(s.entry.priceBasis, 'BUY_STOP');
  assert.ok(Math.abs(s.entry.price - 100 * 1.001) < 1e-9, 'Trigger + 10 bp');
  assert.equal(s.initialStop, 97);
  assert.deepEqual(s.transitions.map((x) => x.state), ['ENTRY_READY', 'TRIGGERED', 'ACTIVE']);
  assert.ok(s.transitions.every((x) => x.date && x.ruleId && x.dataAsOf));
});

test('R8-K4 Vorsichtige Gegenprobe: Schluss unter dem Einstieg = Ausstieg am selben Tag zum Stop', () => {
  const r = simulate(stub, ctx, { from: 0, to: 2, sameDayPolicy: 'PESSIMISTIC' });
  const s = r.finished[0];
  assert.equal(s.exits[0].date, '2026-01-06'); assert.equal(s.exits[0].priceBasis, 'SAME_DAY_PESSIMISTIC');
  assert.ok(s.exits[0].price <= 97);
});

test('R8-K5 Restliche Regeln aus dem Originaltext unverändert: 1/3 nach 3 Tagen, Einstand, Rest am ersten Schluss unter der 10-Tage-Linie', () => {
  const pos = { entry: 100, initialStop: 97, stop: 97, heldSessions: 3, partialDone: false, levels: { trigger: 100 } };
  const m = kk3.manage({ bars: { close: [104] }, ind: { sma10: [101] } }, 0, pos);
  assert.deepEqual(m.partialNextOpen, { fraction: 1 / 3, ruleId: 'KK-BO-SCALE-01' }); assert.equal(m.stop, 100);
  assert.equal(kk3.manage({ bars: { close: [99] }, ind: { sma10: [101] } }, 0, { ...pos, heldSessions: 1 }).exitNextOpen, undefined);
  assert.equal(kk3.manage({ bars: { close: [99] }, ind: { sma10: [101] } }, 0, { ...pos, partialDone: true, stop: 100 }).exitNextOpen, 'KK-BO-TRAIL-02');
  assert.equal(kk3.portfolio.maxPositionPct, 0.25); assert.equal(kk3.portfolio.riskPerTrade, 0.005);
  assert.equal(kk3.PARAMS.momentumPercentile, 98);
});

test('R8-K6 Momentum 3.1.0: „surfing the rising 10 and 20 day“ – Schluss über einer der Linien genügt; keine Sperre nach verlorenem Setup', async () => {
  const kk31 = (await import('../engine/strategies/kk-breakout-v31.mjs')).default;
  assert.equal(kk31.PARAMS.trendMode, 'SURF_10_OR_20');
  assert.equal(kk31.cooldownAfterSetupLost, 0);
  assert.equal(kk31.entryMode, 'BUY_STOP_INTRADAY');
  assert.equal(kk3.cooldownAfterSetupLost, undefined, '3.0.0 bleibt bei LC-COOLDOWN-01');
  assert.equal(kk3.PARAMS.trendMode, undefined, '3.0.0 bleibt bei „über beiden Linien“');
});
