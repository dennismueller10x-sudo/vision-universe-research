// Pilot-Backtest: Mechanik mit synthetischen Reihen pruefen (kein Look-ahead,
// Ausfuehrung zur Folgewoche, Kosten, Kanalausstieg, Datenanomalien).
import test from 'node:test';
import assert from 'node:assert/strict';
import { runPilot, metricsOf, PILOT_SPEC } from '../pilot/donchian-weekly.mjs';
import { isoWeekKey } from '../engine/indicators.mjs';

function fridays(n, start = '1998-01-02') {
  const out = []; const d = new Date(start + 'T12:00:00Z');
  for (let i = 0; i < n; i++) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 7); }
  return out;
}
const mk = (symbol, closes, dates) => ({ symbol, points: closes.map((c, i) => [isoWeekKey(dates[i]), dates[i], c]) });
const spec = { ...PILOT_SPEC, start: '2000-01-07', isEnd: '2000-12-31', maxPositions: 1 };

test('Pilot: Einstieg erst zum Schluss der Folgewoche, Ausstieg ueber den 10-Wochen-Kanal', () => {
  const dates = fridays(200);
  const s0 = dates.indexOf('2000-01-07');
  // flach 10, dann ab Woche s0+5 Ausbruch auf 12, 13, 14 ..., dann Absturz
  const closes = dates.map((d, i) => (i < s0 + 5 ? 10 : i < s0 + 15 ? 11 + (i - (s0 + 5)) : 5));
  const res = runPilot({ series: [mk('AAA', closes, dates)], spyWeek: new Map() }, spec);
  assert.equal(res.trades.length, 1);
  const t = res.trades[0];
  assert.equal(t.entryWeek, dates[s0 + 6], 'Signal in Woche s0+5, Ausfuehrung s0+6');
  // Einstiegspreis = Schluss s0+6 (12) + Kosten; Ausstieg: Signal in s0+15 (5 < Kanaltief), Ausfuehrung s0+16 (5)
  assert.equal(t.exitWeek, dates[s0 + 16]);
  const expected = (5 * (1 - spec.costPerSide)) / (12 * (1 + spec.costPerSide)) - 1;
  assert.ok(Math.abs(t.ret - expected) < 1e-12, `${t.ret} vs ${expected}`);
});

test('Pilot: kein Signal ohne volle 20-Wochen-Historie und unter 5 USD', () => {
  const dates = fridays(200);
  const cheap = dates.map((d, i) => 1 + i * 0.01);
  const res = runPilot({ series: [mk('PENNY', cheap, dates)], spyWeek: new Map() }, spec);
  assert.equal(res.trades.length + res.openAtEnd.length, 0);
});

test('Pilot: Datenanomalie (Kurs x10 in einer Woche) loest keinen Handel in dieser Woche aus', () => {
  const dates = fridays(200);
  const s0 = dates.indexOf('2000-01-07');
  const closes = dates.map((d, i) => (i < s0 + 5 ? 10 : 100));
  const res = runPilot({ series: [mk('SPLIT', closes, dates)], spyWeek: new Map() }, spec);
  assert.equal(res.anomalies, 1);
  // Nach der Anomalie ist der Kanal flach (100 = 100) -> kein Ausbruchssignal
  assert.equal(res.trades.length + res.openAtEnd.length, 0);
});

test('Kennzahlen: CAGR und Drawdown einer bekannten Kurve', () => {
  const curve = [['2000-01-01', 1], ['2000-07-01', 0.5], ['2001-01-01', 2]];
  const m = metricsOf(curve);
  assert.equal(m.maxDrawdown, -0.5);
  assert.ok(Math.abs(m.totalReturn - 1) < 1e-9);
});
