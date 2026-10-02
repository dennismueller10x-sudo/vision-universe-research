// Runde 7: Regelidentitaet der neuen Versionen an konstruierten Entscheidungen.
// Jede Pruefung bildet einen Satz der Regelbeschreibung ab (Quelle in der Engine).
import test from 'node:test';
import assert from 'node:assert/strict';
import kk1 from '../engine/strategies/kk-breakout.mjs';
import kk2 from '../engine/strategies/kk-breakout-v2.mjs';
import wein2, { marketOk } from '../engine/strategies/weinstein-v2.mjs';
import min2 from '../engine/strategies/minervini-v2.mjs';
import dar2 from '../engine/strategies/darvas-v2.mjs';
import dar1 from '../engine/strategies/darvas.mjs';

const pos = (o) => ({ entry: 100, initialStop: 95, stop: 95, heldSessions: 1, partialDone: false, levels: { trigger: 99 }, ...o });

test('R7-E1 Momentum 2.0.0: vor dem Teilverkauf kein 10-Tage-Ausstieg (1.1.0 stieg aus), danach für den Rest', () => {
  const ctx = { bars: { close: [97] }, ind: { sma10: [98] } };
  assert.equal(kk1.manage(ctx, 0, pos({ heldSessions: 1 })).exitNextOpen, 'KK-BO-TRAIL-01', '1.1.0: ganze Position ab Tag 1');
  assert.equal(kk2.manage(ctx, 0, pos({ heldSessions: 1 })).exitNextOpen, undefined, '2.0.0: vor dem Teilverkauf nur der Stop');
  const d3 = kk2.manage({ bars: { close: [104] }, ind: { sma10: [101] } }, 0, pos({ heldSessions: 3 }));
  assert.deepEqual(d3.partialNextOpen, { fraction: 1 / 3, ruleId: 'KK-BO-SCALE-01' });
  assert.equal(d3.stop, 100, 'Rest auf Einstand');
  assert.equal(kk2.manage(ctx, 0, pos({ heldSessions: 5, partialDone: true, stop: 100 })).exitNextOpen, 'KK-BO-TRAIL-02');
  assert.equal(kk2.version, '2.0.0'); assert.ok(kk2.legacy['1.1.0'] === kk1, 'alte Positionen nach 1.1.0 weitergeführt');
});

// Wochenkontext mit einer Woche k = 1.
function wctx({ close = 110, trigger = 105, vol = 300, volAvg4 = 100, mkt = 400, mktMa30 = 380, mktMa30Prev = 370, mansfield = 0.05, ma30 = 100 } = {}) {
  return { weekAt: [1], weekly: { close: [100, close], volume: [0, vol], volAvg4: [0, volAvg4], mkt: [0, mkt], mktMa30: [mktMa30Prev, mktMa30], mansfield: [0, mansfield], ma30: [99, ma30] }, _trigger: trigger };
}
const pend = (trigger) => ({ levels: { trigger, invalidation: 90 }, rules: {}, facts: {} });

test('R7-E2 Weinstein 2.0.0: Ausbruch nur mit Markt nicht in Stufe 4, RS > 0 und >= 2x Volumen der vier Vorwochen', () => {
  const p = { ...wein2.PARAMS, mktSlopeWeeks: 1 };
  assert.equal(wein2.confirm(wctx(), 0, pend(105), p).ruleId, 'WEIN-ST2-02');
  assert.equal(wein2.confirm(wctx({ mkt: 370 }), 0, pend(105), p).ruleId, 'WEIN-MKT-01', 'SPY unter der 30-Wochen-Linie');
  assert.equal(wein2.confirm(wctx({ mansfield: -0.01 }), 0, pend(105), p).ruleId, 'WEIN-RS-02');
  assert.equal(wein2.confirm(wctx({ vol: 190 }), 0, pend(105), p).ruleId, 'WEIN-VOL-03', '1,9x reicht nicht');
  assert.equal(wein2.confirm(wctx({ close: 104 }), 0, pend(105), p), null, 'kein Wochenschluss über dem Widerstand');
  assert.equal(marketOk({ mkt: [0, 400], mktMa30: [400, 380] }, 1, p), false, 'fallende Marktlinie');
});

test('R7-E3 Weinstein 2.0.0: vorbereitete Basis bleibt, wenn die Linie vor dem Ausbruch dreht; Ausstieg nur per Wochenschluss unter der Linie', () => {
  const ctx = wctx({ close: 103 });
  const r = wein2.scan(ctx, 0, wein2.PARAMS, { pending: { ...pend(105), state: 'SETUP' } });
  assert.equal(r.levels.trigger, 105, 'Trigger unverändert');
  assert.equal(r.stage, 'ENTRY_READY');
  const m = wein2.manage({ weekAt: [1], weekly: { close: [0, 98], ma30: [0, 100], mansfield: [0, 0.1] } }, 0, pos({}));
  assert.equal(m.exitNextOpen, 'WEIN-EXIT-01');
  assert.equal(m.stop, undefined, 'kein VU-Stop unter der Linie innerhalb der Woche');
  assert.deepEqual(wein2.manage({ weekAt: [null] }, 0, pos({})), {}, 'keine Entscheidung ohne vollständige Woche');
});

test('R7-E4 Minervini 2.0.0: Ausbruch braucht >= 1,4x Volumen; Einstand ab 3R; Ausstieg unter der 50-Tage-Linie nur mit Volumen', () => {
  const c = (close, vol) => ({ bars: { close: [0, close], volume: [0, vol] }, ind: { vol50: [100, 100], sma50: [0, 0] } });
  assert.equal(min2.confirm(c(101, 130), 1, pend(100)).notTaken, true);
  assert.equal(min2.confirm(c(101, 150), 1, pend(100)).ruleId, 'MIN-ENTRY-D2');
  const be = min2.manage({ bars: { close: [116], volume: [50] }, ind: { sma50: [90], vol50: [100] } }, 0, pos({ initialStop: 95, stop: 95 }));
  assert.equal(be.stop, 100); assert.equal(be.stopRuleId, 'MIN-BE-01');
  const noBe = min2.manage({ bars: { close: [114], volume: [50] }, ind: { sma50: [90], vol50: [100] } }, 0, pos({}));
  assert.equal(noBe.stop, undefined, 'unter 3R kein Einstand');
  assert.equal(min2.manage({ bars: { close: [98], volume: [80] }, ind: { sma50: [99], vol50: [100] } }, 0, pos({})).exitNextOpen, undefined, 'leises Unterschreiten: Warnung, kein Ausstieg');
  assert.equal(min2.manage({ bars: { close: [98], volume: [120] }, ind: { sma50: [99], vol50: [100] } }, 0, pos({})).exitNextOpen, 'MIN-EXIT-02');
  assert.equal(min2.PARAMS.lowDistance, 1.30);
  assert.equal(min2.portfolio.riskPerTrade, 0.0125); assert.equal(min2.portfolio.maxPositionPct, 0.25);
});

test('R7-E5 Darvas 2.0.0: Anfangsstop knapp unter der Ausbruchsmarke statt an der Boxunterkante', () => {
  const sig = { levels: { boxTop: 50, boxBottom: 44 } };
  assert.equal(dar1.planEntry({}, 0, sig).stop, 44);
  assert.equal(dar2.planEntry({}, 0, sig).stop, 49.5);
  assert.equal(dar2.planEntry({}, 0, sig).stopRuleId, 'DAR-STOP-02');
});
