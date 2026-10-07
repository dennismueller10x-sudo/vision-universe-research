import { test } from 'node:test';
import assert from 'node:assert/strict';
import kk32 from '../engine/strategies/kk-breakout-v32.mjs';
import kk31 from '../engine/strategies/kk-breakout-v31.mjs';
import { continuationBase, PARAMS as W4 } from '../engine/strategies/weinstein-v4.mjs';
import { earningsAt } from '../engine/earnings.mjs';
import don21, { rankScore } from '../engine/strategies/donchian-v21.mjs';
import { quarterly, normName } from '../validation/sec-pit.mjs';

const kkCtx = (closes, ma) => ({ bars: { close: closes, open: closes, high: closes, low: closes, date: closes.map((_, i) => `2024-01-${String(i + 1).padStart(2, '0')}`) }, ind: { [kk32.PARAMS.trailSma]: closes.map(() => ma), sma10: closes.map(() => ma), sma20: closes.map(() => ma) } });

test('R11-KK Momentum 3.2.0: Einstand erst, wenn der Schluss über dem Einstieg liegt (KK-BO-BE-02)', () => {
  const p = kk32.PARAMS;
  const pos = { entry: 10, stop: 9, heldSessions: p.partialAfterSessions, partialDone: false };
  // Kurs unter Einstieg: Stop bleibt, Teilverkauf wie bisher
  const below = kk32.manage(kkCtx([9.5], 9), 0, pos);
  assert.equal(below.stop, undefined);
  assert.equal(below.partialNextOpen.ruleId, 'KK-BO-SCALE-01');
  // Kurs über Einstieg: Stop auf Einstand
  const above = kk32.manage(kkCtx([10.5], 9), 0, pos);
  assert.equal(above.stop, 10); assert.equal(above.stopRuleId, 'KK-BO-BE-02');
  // 3.1.0 hob den Stop auch unter dem Markt an (Fehler aus der Fallprüfung)
  const old = kk31.manage(kkCtx([9.5], 9), 0, pos);
  assert.equal(old.stop, 10);
  assert.equal(kk32.version, '3.2.0');
  assert.ok(kk32.manageCompatible.includes('3.1.0'));
});

function weekly(closes) {
  const ma30 = closes.map((_, k) => (k < 29 ? NaN : closes.slice(k - 29, k + 1).reduce((a, b) => a + b, 0) / 30));
  return { close: closes, ma30, date: closes.map((_, k) => new Date(Date.UTC(2020, 0, 6 + 7 * k)).toISOString().slice(0, 10)) };
}

test('R11-W Weinstein 4.0.0: Fortsetzungsbasis in Stufe 2 (WEIN-CONT-01)', () => {
  const up = Array.from({ length: 60 }, (_, i) => 10 + i * 0.5); // Stufe 2, Hoch 39.5 in Woche 59
  const base = [38, 37, 37.5, 38, 38.5, 39, 38.8, 39.2, 39.4, 39.3];
  const ok = continuationBase(weekly([...up, ...base]), 69, W4);
  assert.equal(ok.ok, true); assert.equal(ok.weeks, 10); assert.ok(ok.depth < 0.07);
  // zu kurz (unter acht Wochen seit dem Hoch)
  assert.equal(continuationBase(weekly([...up, ...base.slice(0, 5)]), 64, W4).reason, 'BASE_TOO_SHORT');
  // zu tief (> 25 %)
  const deep = [38, 33, 28, 29, 30, 31, 32, 33, 34];
  const r = continuationBase(weekly([...up, ...deep]), 68, W4);
  assert.ok(['TOO_DEEP', 'BELOW_MA30', 'NOT_STAGE_2'].includes(r.reason));
  // Abwärtstrend ist keine Stufe 2
  assert.equal(continuationBase(weekly(up.slice().reverse()), 59, W4).reason, 'NOT_STAGE_2');
});

const q = (end, v, filed) => [end, v, filed, 0];
test('R11-M Minervini 3.0.0: Gewinnprüfung nur mit damals eingereichten Werten (MIN-EPS-01)', () => {
  const fund = {
    eps: [q('2022-03-31', 0.2, '2022-05-01'), q('2022-06-30', 0.2, '2022-08-01'), q('2023-03-31', 0.3, '2023-05-01'), q('2023-06-30', 0.4, '2023-08-01')],
    rev: [q('2022-06-30', 100, '2022-08-01'), q('2023-06-30', 120, '2023-08-01')],
  };
  // +100 % nach +50 % im Vorquartal, Umsatz gestiegen
  assert.equal(earningsAt(fund, '2023-08-02').ok, true);
  // am Einreichungstag noch nicht sichtbar -> Vorquartal (+50 %), dessen Vorquartal fehlt -> NA
  assert.equal(earningsAt(fund, '2023-08-01').reason, 'MIN-EPS-NA');
  assert.equal(earningsAt(null, '2023-08-02').reason, 'MIN-EPS-NA');
  // keine Beschleunigung
  const slow = { ...fund, eps: [...fund.eps.slice(0, 3), q('2023-06-30', 0.26, '2023-08-01')] };
  assert.equal(earningsAt(slow, '2023-08-02').reason, 'MIN-EPS-ACC');
  // Umsatz gefallen
  assert.equal(earningsAt({ ...fund, rev: [q('2022-06-30', 100, '2022-08-01'), q('2023-06-30', 90, '2023-08-01')] }, '2023-08-02').reason, 'MIN-REV-01');
  // Vorquartal mit Verlust im Vorjahr zählt als Beschleunigung (Präzisierung vor dem ersten Lauf)
  const fromLoss = { ...fund, eps: [q('2022-03-31', -0.1, '2022-05-01'), ...fund.eps.slice(1)] };
  assert.equal(earningsAt(fromLoss, '2023-08-02').ok, true);
});

test('R11-T Turtle 2.1.0: Rang (Schluss − Schluss vor 63 Sitzungen) / N vom Vortag, Portfolio nach Rang', async () => {
  const n = 100;
  const mk = (slope) => { const c = Array.from({ length: n }, (_, i) => 50 + slope * i + (i % 2 ? 0.5 : -0.5)); return { bars: { close: c, high: c.map((x) => x + 1), low: c.map((x) => x - 1), open: c } }; };
  const a = rankScore(mk(0.1), 90), b = rankScore(mk(0.3), 90);
  assert.ok(Number.isFinite(a) && b > a);
  assert.equal(rankScore(mk(0.3), 60), null);
  assert.equal(don21.portfolio.priority, 'SCORE');
  const { runPortfolioTR } = await import('../validation/portfolio.mjs');
  const t = (id, s) => ({ id, listingId: id, rankScore: s, entry: { date: '2024-01-02', price: 10 }, initialStop: 9, exits: [{ date: '2024-01-05', price: 11, fraction: 1, ruleId: 'X' }], terminal: null, marks: new Map([['2024-01-02', 10], ['2024-01-03', 10], ['2024-01-05', 11]]), divs: new Map() });
  const cfg = { initialEquity: 100000, riskPerTrade: 0.01, maxPositionPct: 0.2, maxPositions: 1, maxExposure: 1, priority: 'SCORE' };
  const cal = ['2024-01-02', '2024-01-03', '2024-01-05'];
  assert.equal(runPortfolioTR([t('AAA', 1), t('ZZZ', 5), t('MMM', null)], cal, cfg).taken[0].tr.id, 'ZZZ');
});

test('R11-SEC Quartalswerte: erste Einreichung, Q4 aus Geschäftsjahr, Namensnormierung', () => {
  const e = (start, end, val, filed) => ({ start, end, val, filed });
  const rows = quarterly([
    e('2023-01-01', '2023-03-31', 1, '2023-05-01'), e('2023-01-01', '2023-03-31', 1.5, '2024-05-01'),
    e('2023-04-01', '2023-06-30', 2, '2023-08-01'), e('2023-07-01', '2023-09-30', 3, '2023-11-01'),
    e('2023-01-01', '2023-12-31', 10, '2024-02-15'),
  ]);
  assert.deepEqual(rows[0], ['2023-03-31', 1, '2023-05-01', 0]);
  assert.deepEqual(rows[3], ['2023-12-31', 4, '2024-02-15', 1]);
  // E7: abgeleitetes Q4 erst bekannt, wenn der letzte Bestandteil eingereicht ist; EPS wird nie abgeleitet.
  const late = quarterly([
    e('2012-01-01', '2012-03-31', 1, '2013-05-06'), e('2012-04-01', '2012-06-30', 2, '2013-08-01'),
    e('2012-07-01', '2012-09-30', 3, '2013-10-30'), e('2012-01-01', '2012-12-31', 10, '2013-02-21'),
  ]);
  assert.deepEqual(late[3], ['2012-12-31', 4, '2013-10-30', 1]);
  const eps = quarterly([
    e('2023-01-01', '2023-03-31', 0.6, '2023-05-01'), e('2023-04-01', '2023-06-30', 0.85, '2023-08-01'),
    e('2023-07-01', '2023-09-30', 0.69, '2023-11-01'), e('2023-01-01', '2023-12-31', 3.12, '2024-02-15'),
  ], { perShare: true });
  assert.equal(eps.length, 3);
  assert.ok(!eps.some((r) => r[0] === '2023-12-31'));
  assert.equal(normName('Super Micro Computer, Inc.'), normName('SUPER MICRO COMPUTER INC'));
  assert.equal(normName('Procter & Gamble Co'), 'PROCTER AND GAMBLE');
});
