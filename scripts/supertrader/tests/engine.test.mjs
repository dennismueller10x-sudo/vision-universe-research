import test from 'node:test';
import assert from 'node:assert/strict';
import { computeIndicators, sma, percentileRanks, isoWeekKey } from '../engine/indicators.mjs';
import { stopBuyFill, stopSellFill, DEFAULT_EXECUTION } from '../engine/execution.mjs';
import { assertTransition } from '../engine/lifecycle.mjs';
import { simulate } from '../engine/simulator.mjs';
import { computeMetrics, runPortfolio } from '../engine/backtest.mjs';
import { evaluateGates } from '../engine/gates.mjs';
import darvas, { findBox } from '../engine/strategies/darvas.mjs';
import minervini, { zigzag } from '../engine/strategies/minervini.mjs';
import kk from '../engine/strategies/kk-breakout.mjs';
import greenblatt from '../engine/strategies/greenblatt.mjs';

function dates(n, start = '2025-01-06') {
  const out = []; const d = new Date(start + 'T12:00:00Z');
  while (out.length < n) { const wd = d.getUTCDay(); if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
function barsFrom(rows) {
  const b = { date: dates(rows.length), open: [], high: [], low: [], close: [], volume: [] };
  rows.forEach(([o, h, l, c, v]) => { b.open.push(o); b.high.push(h); b.low.push(l); b.close.push(c); b.volume.push(v ?? 1e6); });
  return b;
}
const slip = DEFAULT_EXECUTION.slippageBps / 10000;

test('sma ist kausal und liefert null ohne Historie', () => {
  const s = sma([1, 2, 3, 4, 5], 3);
  assert.deepEqual(s, [null, null, 2, 3, 4]);
});

test('Indikatoren an Index t haengen nicht von spaeteren Balken ab (kein Look-ahead)', () => {
  const rows = Array.from({ length: 300 }, (_, i) => { const c = 50 + Math.sin(i / 7) * 5 + i * 0.05; return [c, c * 1.02, c * 0.98, c, 1e6 + i]; });
  const full = computeIndicators(barsFrom(rows));
  const cut = computeIndicators(barsFrom(rows.slice(0, 260)));
  for (const k of Object.keys(cut)) assert.deepEqual(full[k].slice(0, 260), cut[k], k);
});

test('Stop-Buy fuellt bei Gap zur Eroeffnung, nicht zum Trigger', () => {
  assert.equal(stopBuyFill(100, 99).price, 100 * (1 + slip));
  const g = stopBuyFill(100, 105);
  assert.equal(g.price, 105 * (1 + slip));
  assert.equal(g.gapped, true);
});

test('Stop-Loss fuellt bei Gap unter dem Stop zur Eroeffnung', () => {
  const g = stopSellFill(100, 92);
  assert.equal(g.price, 92 * (1 - slip));
  assert.equal(g.gapped, true);
  assert.equal(stopSellFill(100, 101).price, 100 * (1 - slip));
});

test('Lifecycle lehnt unzulaessige Uebergaenge ab', () => {
  assert.throws(() => assertTransition(null, 'ACTIVE'));
  assert.throws(() => assertTransition('CLOSED', 'ACTIVE'));
  assert.throws(() => assertTransition('SETUP', 'CLOSED'));
  assertTransition('SETUP', 'TRIGGERED');
  assert.throws(() => assertTransition('TRIGGERED', 'CLOSED'), 'bestaetigt ist noch keine Position');
  assertTransition('TRIGGERED', 'ACTIVE');
  assertTransition('WARNING', 'ACTIVE');
});

test('Perzentilraenge: gleiche Werte gleicher Rang, Extreme 0 und 100', () => {
  const r = percentileRanks([{ key: 'a', value: 1 }, { key: 'b', value: 2 }, { key: 'c', value: 2 }, { key: 'd', value: 3 }]);
  assert.equal(r.get('a'), 0); assert.equal(r.get('d'), 100); assert.equal(r.get('b'), r.get('c'));
});

test('ISO-Woche: Freitag und folgender Montag liegen in verschiedenen Wochen', () => {
  assert.notEqual(isoWeekKey('2026-09-25'), isoWeekKey('2026-09-28'));
  assert.equal(isoWeekKey('2026-09-21'), isoWeekKey('2026-09-25'));
});

/* Darvas-Szenario: Anstieg, Box 100/94, Ausbruch, dann Stop */
function darvasRows({ gapOpen = null, crash = false } = {}) {
  const rows = [];
  for (let i = 0; i < 260; i++) { const c = 60 + i * 0.15; rows.push([c, c + 0.5, c - 0.5, c, 2e6]); }
  // Box: Top 100 bei Index 260, danach 94-99
  rows.push([98, 100, 97, 99, 2e6]);
  for (const c of [97, 96, 95, 96, 97, 98, 97, 96.5]) rows.push([c, c + 1, c - 1.5 < 94 ? 94 : c - 1.5, c, 2e6]);
  // Ausbruchstag
  rows.push([gapOpen ?? 99, Math.max(101, (gapOpen ?? 99) + 1), gapOpen ? gapOpen - 0.5 : 98.5, 100.5, 3e6]);
  if (crash) rows.push([90, 91, 88, 89, 3e6]);
  else for (let i = 0; i < 5; i++) rows.push([101 + i, 102.5 + i, 100.5 + i, 102 + i, 2e6]);
  return rows;
}

function ctxOf(rows) {
  const bars = barsFrom(rows);
  return { symbol: 'TEST', bars, ind: computeIndicators(bars), cross: { mom126: new Array(rows.length).fill(90) } };
}

test('Darvas-Box: Oberkante und Unterkante werden kausal erkannt', () => {
  const ctx = ctxOf(darvasRows());
  const box = findBox(ctx.bars, 268, darvas.PARAMS);
  assert.ok(box, 'Box erwartet');
  assert.equal(box.top.value, 100);
  assert.equal(box.bottom.value, 94);
});

test('Zigzag erkennt abwechselnde Hochs und Tiefs', () => {
  const closes = [100, 110, 100, 108, 102, 106, 103, 105];
  const rows = closes.map((c) => [c, c, c, c, 1e6]);
  const zz = zigzag(barsFrom(rows), 0, rows.length - 1, 0.03);
  const types = zz.points.map((p) => p.type).join('');
  assert.match(types, /HLHL/);
});

test('Minervini: ohne Trend Template kein Scan-Ergebnis', () => {
  const rows = Array.from({ length: 300 }, (_, i) => { const c = 100 - i * 0.1; return [c, c + 1, c - 1, c, 1e6]; });
  const ctx = ctxOf(rows); ctx.cross = { rs: new Array(300).fill(99) };
  assert.equal(minervini.scan(ctx, 299), null);
});

test('Greenblatt: kein Ranking, solange ROC-Pflichtfelder fehlen', () => {
  const cov = greenblatt.coverage([{ symbol: 'A', fields: { operating_income: true, market_cap: true, total_debt: true, cash_and_equivalents: true, sic: '3571' } }]);
  assert.equal(cov.rankingComputable, false);
  assert.deepEqual(cov.missingFields.sort(), ['current_assets', 'current_liabilities', 'net_ppe']);
  assert.equal(greenblatt.excludedBySic('6021'), true);
  assert.equal(greenblatt.excludedBySic('4911'), true);
  assert.equal(greenblatt.excludedBySic('3571'), false);
});

test('Gates: ohne Survivorship-Kontrolle werden keine Kennzahlen freigegeben', () => {
  const cov = { dailyOhlcvYears: 20, weeklyCloseYears: 30, delistedWithPriceHistory: 100, survivorshipControls: false, historicalMembershipDates: 300, pitFundamentalSymbols: 5000, intradaySessionsRetained: 2, intradayHasOhlc: false, splitAdjusted: true, totalReturnUniform: true, delistingReturns: true };
  const g = evaluateGates('DARVAS_BOX_N3_VU', cov, { baselines: [{ id: 'x' }] });
  assert.equal(g.metricsPublishable, false);
  assert.ok(g.failedGates.includes('SURVIVORSHIP'));
  const noRights = evaluateGates('DARVAS_BOX_N3_VU', { ...cov, survivorshipControls: true }, { baselines: [{ id: 'x' }] });
  assert.equal(noRights.metricsPublishable, false, 'ohne geklaerte Nutzungsrechte keine veroeffentlichten Kennzahlen');
  assert.ok(noRights.failedGates.includes('USAGE_RIGHTS'));
  const ok = evaluateGates('DARVAS_BOX_N3_VU', { ...cov, survivorshipControls: true, usageRightsConfirmed: true }, { baselines: [{ id: 'x' }] });
  assert.equal(ok.metricsPublishable, true);
  assert.equal(ok.status, 'BACKTEST_READY');
});

test('Gates: ORH-Variante ohne Intraday-Historie ist DATA_COVERAGE_PENDING', () => {
  const cov = { dailyOhlcvYears: 1, weeklyCloseYears: 30, delistedWithPriceHistory: 0, survivorshipControls: false, historicalMembershipDates: 2, pitFundamentalSymbols: 5, intradaySessionsRetained: 2, intradayHasOhlc: false, splitAdjusted: true };
  const g = evaluateGates('KK_COMMON_BREAKOUT_ORH', cov, { baselines: [{ id: 'x' }] });
  assert.equal(g.status, 'DATA_COVERAGE_PENDING');
});

test('Portfolio und Kennzahlen: synthetischer Verlauf', () => {
  const cal = dates(300);
  const sig = (sym, i, j, entry, exit, stop) => ({ id: sym, entry: { date: cal[i], price: entry }, initialStop: stop, exits: [{ date: cal[j], price: exit, fraction: 1 }], result: { returnPct: exit / entry - 1, sessionsHeld: j - i } });
  const trades = [
    { symbol: 'A', signal: sig('A', 10, 30, 100, 120, 95) },
    { symbol: 'B', signal: sig('B', 40, 50, 50, 45, 47) },
    { symbol: 'C', signal: sig('C', 60, 90, 20, 26, 19) },
  ];
  const price = { A: [100, 120, 10, 30], B: [50, 45, 40, 50], C: [20, 26, 60, 90] };
  const priceOf = (s, d) => { const i = cal.indexOf(d); const [p0, p1, a, b] = price[s]; if (i < a) return p0; if (i > b) return p1; return p0 + (p1 - p0) * (i - a) / (b - a); };
  const pf = runPortfolio(trades, priceOf, cal);
  assert.equal(pf.taken.length, 3);
  const m = computeMetrics(pf.equity, pf.taken, [{ value: 100 }, { value: 110 }]);
  assert.equal(m.trades, 3);
  assert.ok(Math.abs(m.hitRate - 2 / 3) < 1e-9);
  assert.ok(m.maxDrawdown <= 0);
  assert.ok(m.totalReturn > 0);
  assert.ok(Number.isFinite(m.sharpe));
});

test('Gates: Variante ohne Gate-Definition wird nie freigegeben', () => {
  const g = evaluateGates('UNBEKANNT', { dailyOhlcvYears: 30 }, {});
  assert.equal(g.metricsPublishable, false);
  assert.equal(g.status, 'NOT_COMPARABLE');
});

test('Pruefplaene: methodenspezifische Mindestfenster statt pauschal 8 Jahre', () => {
  const cov = { dailyOhlcvYears: 12, weeklyCloseYears: 12, delistedWithPriceHistory: 100, survivorshipControls: true, historicalMembershipDates: 300, pitFundamentalSymbols: 5000, intradaySessionsRetained: 0, intradayHasOhlc: false, splitAdjusted: true, totalReturnUniform: true, delistingReturns: true, usageRightsConfirmed: true };
  const daily = evaluateGates('DONCHIAN_TURTLE_S1_DAILY', cov, { baselines: [{ id: 'x' }] });
  assert.equal(daily.metricsPublishable, true, '12 Jahre genuegen der Tagesmethode (Plan: 10)');
  const weekly = evaluateGates('WEINSTEIN_STAGE2_WEEKLY', cov, { timeframe: 'weekly', baselines: [{ id: 'x' }] });
  assert.ok(weekly.failedGates.includes('HISTORY'), 'Wochenmethode braucht 20 Jahre');
  assert.equal(weekly.testPlan.minYears, 20);
  const gb = evaluateGates('GREENBLATT_US_ORIGINAL', cov, { baselines: [{ id: 'x' }] });
  assert.equal(gb.testPlan.unit, 'Jahreskohorten');
});
