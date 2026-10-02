// Pilot-Backtest: Mechanik mit synthetischen Reihen pruefen (kein Look-ahead,
// Ausfuehrung zur Folgewoche, Kosten, Kanalausstieg, Datenanomalien).
import test from 'node:test';
import assert from 'node:assert/strict';
import { runPilot, metricsOf, PILOT_SPEC, verifyTradeFromRaw } from '../pilot/donchian-weekly.mjs';
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

// v1.1.0: Daten- und Buchungskorrekturen (K1-K3)
function breakout(dates, s0) { return dates.map((d, i) => (i < s0 + 5 ? 10 : 11 + Math.min(i - (s0 + 5), 9))); }

test('K1: Datenluecke > 4 Wochen beendet die Position zum letzten Kurs (kein Einfrieren ueber Jahre)', () => {
  const dates = fridays(300);
  const s0 = dates.indexOf('2000-01-07');
  const closes = breakout(dates, s0);
  // Reihe bricht nach s0+12 ab und taucht erst 100 Wochen spaeter mit anderem Niveau wieder auf (Kuerzel neu vergeben)
  const pts = dates.map((d, i) => [d, i > s0 + 12 && i < s0 + 112 ? null : i >= s0 + 112 ? 3 : closes[i]]).filter((p) => p[1] !== null);
  // zweite, lueckenlose Reihe unter 5 USD (handelt nie) haelt den Wochenkalender vollstaendig - wie im echten Universum
  const series = [{ symbol: 'GAP', points: pts.map(([d, c]) => [isoWeekKey(d), d, c]) }, mk('CAL', dates.map(() => 2), dates)];
  const v1 = runPilot({ series, spyWeek: new Map() }, { ...spec, dataBreaks: false });
  const t1 = v1.trades[0] || v1.openAtEnd[0];
  assert.ok(t1, 'v1.0.0 haelt die Position');
  const res = runPilot({ series, spyWeek: new Map() }, spec);
  const t = res.trades[0];
  assert.equal(t.reason, 'DATA_BREAK');
  const lastValid = dates.indexOf(t.exitWeek) - dates.indexOf(dates[s0 + 12]);
  assert.ok(lastValid <= spec.maxGapWeeks + 1, `${lastValid} Wochen nach dem letzten Kurs abgerechnet`);
  assert.ok(!v1.openAtEnd.length || v1.trades.length === 0 ? true : v1.trades[0].weeks > 50, 'v1.0.0 fror die Position ueber die Luecke ein');
  assert.equal(t.exitClose, closes[s0 + 12], 'letzter gueltiger Kurs');
  assert.ok(res.gapBreaks >= 1);
});

test('K2: Anomalie in gehaltener Position wird wie im Vergleich behandelt (Abrechnung vor dem Sprung)', () => {
  const dates = fridays(300);
  const s0 = dates.indexOf('2000-01-07');
  const closes = breakout(dates, s0).map((c, i) => (i >= s0 + 14 ? c / 50 : c)); // -98 % in einer Woche
  const series = [mk('CRASH', closes, dates)];
  const v1 = runPilot({ series, spyWeek: new Map() }, { ...spec, dataBreaks: false });
  const v1t = v1.trades[0] || v1.openAtEnd[0];
  assert.ok(v1t.ret < -0.9, 'v1.0.0 bucht den Sprung voll');
  const res = runPilot({ series, spyWeek: new Map() }, spec);
  assert.equal(res.trades[0].reason, 'DATA_BREAK');
  assert.equal(res.trades[0].exitClose, closes[s0 + 13]);
  // Vergleichsportfolio: die Anomaliewoche und der Folgeabschnitt fliessen nicht ein (Reihe beginnt neu)
  const ewAfter = res.ewCurve.find(([d]) => d === dates[s0 + 20])[1];
  const ewBefore = res.ewCurve.find(([d]) => d === dates[s0 + 13])[1];
  assert.equal(ewAfter, ewBefore);
});

test('K3: Depotwert am Ende = Start + gebuchte Trades + offene Positionen; Trades aus Rohkursen nachrechenbar', () => {
  const dates = fridays(400);
  const s0 = dates.indexOf('2000-01-07');
  const series = ['A', 'B', 'C'].map((sym, j) => mk(sym, dates.map((d, i) => 20 + 6 * Math.sin((i + 7 * j) / 9) + i * 0.02), dates));
  const res = runPilot({ series, spyWeek: new Map() }, { ...spec, maxPositions: 2 });
  assert.ok(res.trades.length > 5);
  const sum = res.trades.reduce((a, t) => a + t.pnl, 0) + res.openAtEnd.reduce((a, t) => a + t.pnlMarked, 0);
  assert.ok(Math.abs(res.equity.at(-1)[1] - (1 + sum)) < 1e-9);
  for (const t of res.trades) {
    const s = series.find((x) => x.symbol === t.symbol);
    assert.ok(verifyTradeFromRaw(s.points, t, spec).ok, `${t.symbol} ${t.entryWeek}`);
  }
  void s0;
});
