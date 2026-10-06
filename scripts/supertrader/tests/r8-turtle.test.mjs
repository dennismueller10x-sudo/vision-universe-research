// Runde 8: Turtle System 1 (Donchian 2.0.0) - Regelidentitaet gegen "The Original
// Turtle Trading Rules" (OriginalTurtles.org, PDF, gelesen 02.10.2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import tur, { turtleN, breakoutState, intradayEntry, manage, PORTFOLIO } from '../engine/strategies/donchian-v2.mjs';
import don1 from '../engine/strategies/donchian.mjs';
import { runPortfolioTR } from '../validation/portfolio.mjs';

const series = (rows) => ({ date: rows.map((_, i) => `2020-01-${String(i + 1).padStart(2, '0')}`), open: rows.map((r) => r[0]), high: rows.map((r) => r[1]), low: rows.map((r) => r[2]), close: rows.map((r) => r[3]), volume: rows.map(() => 1e6) });

test('R8-T1 N = (19 x PDN + TR) / 20, Start mit dem 20-Tage-Mittel der True Range', () => {
  const rows = Array.from({ length: 22 }, () => [100, 101, 99, 100]);
  rows[21] = [100, 106, 99, 105];
  const N = turtleN(series(rows));
  assert.equal(N[18], null); assert.equal(N[19], 2);
  assert.equal(N[20], 2); assert.ok(Math.abs(N[21] - (19 * 2 + 7) / 20) < 1e-12);
});

test('R8-T2 "traded at the breakout when it was exceeded during the day … on the open" bei Gap', () => {
  const ctx = { bars: { open: [0, 99], high: [0, 102], low: [0, 98], close: [0, 101] }, ind: {} };
  const bars = ctx.bars; bars.close = [100, 101]; bars.date = ['a', 'b'];
  const pend = { levels: { trigger: 100, n: 2, triggerRule: 'TUR-ENTRY-S1-20' } };
  const e = intradayEntry(ctx, 1, pend);
  assert.equal(e.price, 100); assert.equal(e.stop, 100 - 2 * 2); assert.equal(e.stopRuleId, 'TUR-STOP-2N');
  ctx.bars.open = [0, 103]; ctx.bars.high = [0, 104];
  assert.equal(intradayEntry(ctx, 1, pend).price, 103, 'Eröffnung über dem Ausbruch: Einstieg zur Eröffnung');
  ctx.bars.high = [0, 100];
  assert.equal(intradayEntry(ctx, 1, pend), null, '"exceeded by a single tick": Berühren reicht nicht');
  assert.equal(tur.entryMode, 'BUY_STOP_INTRADAY'); assert.equal(don1.entryMode, undefined, '1.1.0 bleibt erhalten');
});

test('R8-T3 Filter: nach einem Gewinner-Ausbruch gilt der 55-Tage-Failsafe, nach einem Verlierer wieder 20 Tage', () => {
  // 25 ruhige Tage, Ausbruch an Tag 25, Anstieg, dann Bruch des 10-Tage-Tiefs mit Gewinn.
  const rows = [];
  for (let i = 0; i < 25; i++) rows.push([100, 101, 99, 100]);
  for (let i = 0; i < 15; i++) { const p = 102 + i * 2; rows.push([p - 1, p + 1, p - 2, p]); }
  rows.push([110, 111, 100, 101]); // Tief unter dem 10-Tage-Tief, Ausstieg bei ~ 10-Tage-Tief > Einstieg
  const st = breakoutState(series(rows)).state;
  assert.equal(st[24], 'NONE'); assert.equal(st[25], 'OPEN'); assert.equal(st[rows.length - 1], 'WIN');
  const rows2 = [];
  for (let i = 0; i < 25; i++) rows2.push([100, 101, 99, 100]);
  rows2.push([100, 102, 99.5, 101.5]); rows2.push([101, 101, 90, 91]); // 2N gegen die Position
  assert.equal(breakoutState(series(rows2)).state[26], 'LOSS');
});

test('R8-T4 System-1-Ausstieg: Marke = 10-Tage-Tief, steigt nur', () => {
  const lows = [90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101];
  const ctx = { bars: { low: lows, close: lows.map((x) => x + 5) } };
  const m = manage(ctx, 11, { stop: 85, entry: 95 });
  assert.equal(m.stop, 92); assert.equal(m.stopRuleId, 'TUR-EXIT-S1-10D');
  assert.equal(manage(ctx, 11, { stop: 93, entry: 95 }).stop, undefined, 'Stop sinkt nie');
});

test('R8-T5 Unit = 1 % Konto je N (2 % Risiko bei 2N), notionelles Konto -20 % je 10 % Verlust', () => {
  assert.equal(PORTFOLIO.riskPerTrade, 0.02); assert.equal(PORTFOLIO.maxPositions, 12);
  const mk = (id, d, px, stop, exitD, exitPx) => ({ id, listingId: id, entry: { date: d, price: px }, initialStop: stop, exits: [{ date: exitD, price: exitPx, fraction: 1 }], terminal: null, marks: new Map([[d, px], [exitD, exitPx]]), divs: new Map() });
  const cal = ['2020-01-02', '2020-01-03', '2020-01-06', '2020-01-07'];
  const cfg = { ...PORTFOLIO, maxPositionPct: 1, initialEquity: 100000 };
  // Verlust 11 % am ersten Trade, danach wird mit 80 000 statt 89 000 bemessen.
  const t1 = mk('A', cal[0], 100, 98, cal[1], 89); // 1000 Stück, -11 000
  const t2 = mk('B', cal[2], 50, 48, cal[3], 50);
  const r = runPortfolioTR([t1, t2], cal, cfg, { commissionBps: 0 });
  const b = r.taken.find((p) => p.tr.id === 'B');
  assert.ok(Math.abs(b.entryShares - (80000 * 0.02) / 2) < 1e-6, `Stücke ${b.entryShares}`);
  const r2 = runPortfolioTR([t1, t2], cal, { ...cfg, turtleNotional: null }, { commissionBps: 0 });
  assert.ok(r2.taken.find((p) => p.tr.id === 'B').entryShares > b.entryShares);
});
