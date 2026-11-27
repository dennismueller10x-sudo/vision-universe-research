// Ziel 20 % (Stufe 12): Gegentests auf künstlichen Daten. Schreibt nichts ins Repository.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocate, setSecurity, finalize } from './market.mjs';
import { monthEnds } from './merkmale.mjs';
import { crossSections } from './faktor-wf.mjs';
import { patternFlags } from './trader-wf.mjs';
import { drift } from './laufen-lassen.mjs';
import { run, regimes, levered, tradeStats, evaluate, report, BASES, VARIANTS, R } from './ziel20.mjs';

function calendar(n, start) { const out = []; let d = new Date(start + 'T00:00:00Z'); while (out.length < n) { const w = d.getUTCDay(); if (w && w < 6) out.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 864e5); } return out; }
function market(paths, spy, start = '2011-01-03') {
  const T = paths[0].length, m = allocate(calendar(T, start), paths.map((_, s) => 'ref_S' + s));
  paths.forEach((p, s) => { const c = Float64Array.from(p), o = Float64Array.from(p, (x, t) => (t ? p[t - 1] : x)); setSecurity(m, s, { o, h: c.map((x) => x * 1.001), l: c.map((x) => x * 0.999), c, rc: c, v: new Float64Array(T).fill(1e6) }); });
  return finalize(m, spy || Float64Array.from({ length: T }, (_, t) => 100 * Math.exp(0.0003 * t)));
}
const row = (fy, v) => [fy, 'FY', fy + '-12-31', v, (fy + 1) + '-01-20', 'acc' + fy, 0];
const years = Array.from({ length: 19 }, (_, k) => 2008 + k);
const bundle = (q) => ({ annual: { revenue: years.map((y) => row(y, 100)), gross_profit: years.map((y) => row(y, 100 * q)), total_assets: years.map((y) => row(y, 100)),
  net_income: years.map((y) => row(y, 10)), stockholders_equity: years.map((y) => row(y, 50)), shares_outstanding: years.map((y, k) => row(y, 100 - k * (1 + q))),
  operating_cash_flow: years.map((y) => row(y, 12)), free_cash_flow: years.map((y) => row(y, 8)) } });
function setup(S, T, mk, spy) {
  let seed = 3; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const q = Array.from({ length: S }, () => rnd()), paths = q.map((x, s) => mk(x, s, rnd, T)), m = market(paths, spy);
  const xs = crossSections(m, (s) => bundle(q[s]), { from: 2014, universe: { maxRank: 3000, minPrice: 1 } });
  const endsT = monthEnds(m.dates), ends = endsT.map((t) => m.dates[t]), nextT = xs.map((x) => endsT[ends.indexOf(x.date) + 1]);
  return { m, xs, flags: patternFlags(m, xs), nextT };
}
const F = { pattern: 'NONE', score: 'mom_gpa_buyback' };

test('Vorab fest: sechs Grunddepots, zwölf Varianten, Zielmarke 20 %', () => {
  assert.equal(BASES.length, 6); assert.equal(VARIANTS.length, 12);
  assert.deepEqual(R.target, { cagr: 0.20, withoutTop: 0.17, maxDrawdown: -0.40 });
  assert.equal(R.hardStop, 0.08); assert.equal(R.leverage, 1.5);
});

test('BASIS entspricht dem Depot aus Stufe 9', () => {
  const { m, xs, flags, nextT } = setup(60, 2500, (x, s, rnd, T) => { let p = 20; return Array.from({ length: T }, (_, t) => (p *= Math.exp((s >= 30 ? -0.0008 : s >= 20 && t > T / 2 ? -0.004 : 0.0006) + 0.004 * (rnd() - 0.5)))); });
  const a = run(m, xs, flags, nextT, regimes(m, xs), F), b = drift(m, xs, flags, nextT, F);
  assert.equal(a.net.length, b.net.length);
  a.net.forEach((r, i) => assert.ok(Math.abs(r - b.net[i]) < 1e-9, `Monat ${i}: ${r} vs ${b.net[i]}`));
});

test('Marktphase: unter der 200-Tage-Linie des Markts wird nicht gekauft, bei RAUS alles verkauft', () => {
  const T = 3300, spy = Float64Array.from({ length: T }, (_, t) => 100 * Math.exp(t < 2000 ? 0.0004 * t : 0.8 - 0.0006 * (t - 2000)));
  const { m, xs, flags, nextT } = setup(60, T, (x, s, rnd, n) => { let p = 20; return Array.from({ length: n }, () => (p *= Math.exp(0.0006 + 0.004 * (rnd() - 0.5)))); }, spy);
  const reg = regimes(m, xs), off = reg.map((r, i) => (r.spy ? -1 : i)).filter((i) => i >= 0);
  assert.ok(off.length > 20 && off.length < xs.length);
  const out = run(m, xs, flags, nextT, reg, F, { regime: 'OUT', kind: 'SPY' }), buy = run(m, xs, flags, nextT, reg, F, { regime: 'BUY', kind: 'SPY' });
  for (const i of off) assert.equal(out.count[i], 0, 'RAUS: keine Position im schwachen Markt');
  assert.ok(buy.count[off.at(-1)] > 0, 'KAUF: bestehende Positionen bleiben');
  assert.ok(out.net[off.at(-1)] === 0);
});

test('Stopp 8 %: wer kurz vor einem Rückschlag kauft, wird nahe −8 % verkauft; ohne Stopp bleibt die Position', () => {
  /* jeder Titel steigt 250 Tage und fällt dann 15 Tage um je 2 % (zusammen rund −26 %, bleibt über der 200-Tage-Linie), versetzt je Titel */
  const { m, xs, flags, nextT } = setup(60, 2500, (x, s, rnd, T) => { let p = 20; return Array.from({ length: T }, (_, t) => (p *= Math.exp((t + s * 17) % 265 >= 250 ? -0.02 : 0.004))); });
  const reg = regimes(m, xs), base = run(m, xs, flags, nextT, reg, F), stop = run(m, xs, flags, nextT, reg, F, { hard: true });
  const closedLoss = (r) => r.trades.filter((t) => t.exit && t.value / t.cost < 0.95);
  assert.equal(closedLoss(base).length, 0, 'ohne Stopp wird im Rückschlag nicht verkauft');
  assert.ok(closedLoss(stop).length > 0, 'mit Stopp gibt es geschlossene Verlustpositionen');
  /* höchstens 8 % plus ein Tagesschritt von 2 % plus Kosten */
  for (const t of closedLoss(stop)) assert.ok(t.value / t.cost > 0.86 && t.value / t.cost < 0.93, String(t.value / t.cost));
});

test('Hebel und Trade-Statistik rechnen nachvollziehbar', () => {
  const reg = [{ spy: true }, { spy: false }], l = levered([0.10, -0.10], reg, 'ALWAYS'), g = levered([0.10, -0.10], reg, 'REGIME');
  assert.ok(Math.abs(l[0] - (0.15 - 0.5 * 0.04 / 12)) < 1e-12 && Math.abs(l[1] - (-0.15 - 0.5 * 0.04 / 12)) < 1e-12);
  assert.ok(Math.abs(g[1] + 0.10) < 1e-12);
  assert.equal(levered([-0.9], [{ spy: true }], 'ALWAYS')[0], -1);
  const s = tradeStats([{ cost: 1, value: 3 }, { cost: 1, value: 0.7 }, { cost: 1, value: 0.95 }, { cost: 1, value: 1.1 }]);
  assert.equal(s.trades, 4); assert.equal(s.loserShare, 0.5); assert.equal(s.doublers, 1); assert.equal(s.bigLoserShare, 0.25);
  assert.ok(Math.abs(s.sumGains - 2.1) < 1e-9 && Math.abs(s.sumLosses + 0.35) < 1e-9);
});

test('Auswertung: alle Varianten, Nebenwerte nutzen nur Rang über 1.000, Bericht ohne Lücken', () => {
  const { m, xs, flags, nextT } = setup(80, 3300, (x, s, rnd, T) => { let p = 20; return Array.from({ length: T }, () => (p *= Math.exp(0.0002 + 0.0009 * x + 0.012 * (rnd() - 0.5)))); });
  const d = { xs, flags, nextT }, spy = new Map(xs.map((x) => [x.date, 0.008]));
  const res = evaluate(m, d, d, spy, { draws: 99, bases: BASES.slice(0, 2), rules: { ...R, smallRank: [41, 80] } });
  assert.equal(res.rows.length, 24);
  assert.ok(res.rows.every((r) => typeof r.hit === 'boolean'));
  const small = run(m, xs, flags, nextT, regimes(m, xs), F, {}, { rank: [41, 80] });
  const rankAt = new Map(); xs.forEach((x) => x.s.forEach((s, r) => rankAt.set(x.date + '|' + s, x.rank[r])));
  assert.ok(small.trades.length > 0 && small.trades.every((t) => rankAt.get(t.entry + '|' + t.s) >= 41));
  const md = report({ result: res, dataFingerprint: 'x', smoke: true });
  assert.ok(md.includes('RAUCHTEST') && !md.includes('undefined') && !md.includes('NaN'));
});
