// Kullamaegi EP/PS Phase 1: Qualitaetskennzahlen der Tiingo-IEX-Minuten (scripts/supertrader/validation/kk-intraday-probe.mjs).
// Reine Funktionen auf synthetischen Minuten; kein Netz. Budget und Faelle festgeschrieben.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dayQuality, openingVolume, aggregate5, PROBE_CASES, RELVOL_CASES, CONSOLIDATED_CASES, MAX_REQUESTS } from '../validation/kk-intraday-probe.mjs';

// 2023-05-25 is EDT (UTC-4): 09:30 ET = 13:30 UTC
const at = (k) => new Date(Date.UTC(2023, 4, 25, 13, 30) + k * 60000).toISOString();
const minute = (k, px, v = 100) => ({ date: at(k), open: px, high: px * 1.001, low: px * 0.999, close: px, volume: v });

test('KK-PROBE-BUDGET: festgelegte Faelle, hoechstens MAX_REQUESTS Anfragen', () => {
  const planned = PROBE_CASES.length * 3 + RELVOL_CASES.length * 11 + CONSOLIDATED_CASES.length;
  assert.ok(planned <= MAX_REQUESTS, `${planned}`);
  assert.ok(PROBE_CASES.every(([k]) => ['EP', 'PS', 'COVERAGE'].includes(k)));
});

test('KK-PROBE-QUALITY: Abdeckung, Opening Range, VWAP, Volumenanteil und 5-Minuten-Konsistenz', () => {
  const bars = Array.from({ length: 390 }, (_, k) => minute(k, 100 + k * 0.01, 100));
  const five = [];
  for (let k = 0; k < 390; k += 5) { const g = bars.slice(k, k + 5); five.push({ date: at(k), open: g[0].open, high: Math.max(...g.map((b) => b.high)), low: Math.min(...g.map((b) => b.low)), close: g.at(-1).close, volume: 500 }); }
  const eod = { open: 100, high: Math.max(...bars.map((b) => b.high)), low: Math.min(...bars.map((b) => b.low)), close: bars.at(-1).close, volume: 390 * 100 * 50 };
  const q = dayQuality(bars, five, eod);
  assert.equal(q.coverage, 1); assert.equal(q.firstEt, '09:30'); assert.equal(q.lastEt, '15:59'); assert.equal(q.outsideSession, 0);
  assert.equal(q.openingRange5Bars, 5); assert.equal(q.openingRange15Bars, 15); assert.equal(q.openingRange30Bars, 30);
  assert.equal(q.iexVolumeShare, 0.02); // IEX is one venue: a 2 % share must be visible, never treated as market volume
  assert.equal(q.highVsEod, 0); assert.equal(q.vwapComputable, true); assert.equal(q.vwapInsideDailyRange, true);
  assert.equal(q.fiveMinuteLabel, 'BUCKET_START'); assert.equal(q.fiveMinuteMaxPriceDiff, 0); assert.equal(q.fiveMinuteVolumeRatio, 1);
});

test('KK-PROBE-EMPTY: ein leerer Tag liefert Zaehlwerte, keine erfundenen Werte', () => {
  const q = dayQuality([], [], { open: 1, high: 1, low: 1, close: 1, volume: 1 });
  assert.deepEqual(q, { bars1m: 0, bars5m: 0, coverage: 0 });
});

test('KK-PROBE-OPENING-VOLUME: nur die ersten n Sitzungsminuten zaehlen', () => {
  const bars = [minute(-1, 10, 999), minute(0, 10, 1), minute(29, 10, 2), minute(30, 10, 4)];
  assert.equal(openingVolume(bars, 30), 3);
  assert.equal(aggregate5(bars).get(0).volume, 1);
});
