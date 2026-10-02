// Runde 8: Darvas 3.0.0 (TIME 1959) und Weinstein 3.0.0 (Buchzitate über Bulkowski) - Kauforder am Ausbruch.
import test from 'node:test';
import assert from 'node:assert/strict';
import dar3, { intradayEntry as darEntry, PORTFOLIO as DP } from '../engine/strategies/darvas-v3.mjs';
import dar2 from '../engine/strategies/darvas-v2.mjs';
import wein3, { intradayEntry as weinEntry, manage as weinManage } from '../engine/strategies/weinstein-v3.mjs';

test('R8-D1 "places buy orders at breakout points", Stop "just below his buy order", 5-6 Titel', () => {
  const ctx = { bars: { open: [0, 99], high: [0, 102], low: [0, 99.5], close: [0, 101], volume: [0, 3e6] }, ind: { vol50: [1e6, 1e6] } };
  const e = darEntry(ctx, 1, { levels: { trigger: 100 } });
  assert.equal(e.price, 100); assert.equal(e.stop, 99); assert.equal(e.ruleId, 'DAR-ENTRY-BS'); assert.equal(e.volumeRatio, 3);
  assert.equal(e.pessimisticSameDayExit, false);
  ctx.bars.high = [0, 100];
  assert.equal(darEntry(ctx, 1, { levels: { trigger: 100 } }), null);
  assert.equal(DP.maxPositions, 6); assert.equal(dar3.entryMode, 'BUY_STOP_INTRADAY'); assert.equal(dar2.entryMode, undefined);
});

const wctx = (over = {}) => ({
  bars: { date: ['d0', 'd1', 'd2', 'd3'], open: [100, 100, 104, 104], high: [101, 106, 105, 106], low: [99, 99, 103, 103], close: [100, 105, 104, 105], volume: [1, 1, 1, 1] },
  weekAt: [0, null, null, 1],
  weekly: { close: [100, 105], volume: [10, over.vol ?? 10], volAvg4: [10, 10], mkt: [110, 110], mktMa30: [100, 100], mansfield: [over.rs ?? 0.1, 0.1], ma30: [90, 90] },
});

test('R8-W1 Kauf-Stop über der Basis; Markt und relative Stärke zum letzten Wochenschluss', () => {
  const pend = { levels: { trigger: 102, invalidation: 95 } };
  const e = weinEntry(wctx(), 1, pend);
  assert.equal(e.price, 102); assert.equal(e.stop, 95); assert.equal(e.ruleId, 'WEIN-ENTRY-BS');
  assert.equal(weinEntry(wctx({ rs: -0.1 }), 1, pend).ruleId, 'WEIN-RS-02');
  assert.equal(wein3.entryMode, 'BUY_STOP_INTRADAY');
});

test('R8-W2 "If you have purchased it with a buy-stop order, then sell it for a fast profit"', () => {
  const pos = { entry: 102, entryIndex: 1, stop: 95 };
  assert.equal(weinManage(wctx({ vol: 15 }), 3, pos).exitNextOpen, 'WEIN-VOL-04', '1,5× Volumen < 2×: Verkauf beim ersten Schluss über dem Einstieg');
  assert.equal(weinManage(wctx({ vol: 25 }), 3, pos).exitNextOpen, undefined, '2,5× Volumen: halten');
});
