// Merkmals-Studie: Gegentests auf künstlichen Daten mit bekanntem Ergebnis. Schreibt nichts ins Repository.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocate, setSecurity, setTerminal, finalize } from './market.mjs';
import { fundamentalFeatures, forwardReturn, study, evaluate, monthEnds, pctRank, FEATURES, COMBOS } from './merkmale.mjs';

function calendar(n, start) { const out = []; let d = new Date(start + 'T00:00:00Z'); while (out.length < n) { const w = d.getUTCDay(); if (w && w < 6) out.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 864e5); } return out; }
const row = (fy, end, v, filed) => [fy, 'FY', end, v, filed, 'acc' + fy, 0];
const bundleWith = (over = {}) => ({ annual: {
  revenue: [row(2019, '2019-12-31', 100, '2020-02-20'), row(2020, '2020-12-31', 150, '2021-02-20')],
  gross_profit: [row(2019, '2019-12-31', 60, '2020-02-20'), row(2020, '2020-12-31', 90, '2021-02-20')],
  net_income: [row(2019, '2019-12-31', 10, '2020-02-20'), row(2020, '2020-12-31', 20, '2021-02-20')],
  free_cash_flow: [row(2019, '2019-12-31', 15, '2020-02-20'), row(2020, '2020-12-31', 30, '2021-02-20')],
  operating_cash_flow: [row(2019, '2019-12-31', 18, '2020-02-20'), row(2020, '2020-12-31', 35, '2021-02-20')],
  total_assets: [row(2019, '2019-12-31', 200, '2020-02-20'), row(2020, '2020-12-31', 220, '2021-02-20')],
  stockholders_equity: [row(2019, '2019-12-31', 100, '2020-02-20'), row(2020, '2020-12-31', 110, '2021-02-20')],
  shares_outstanding: [row(2019, '2019-12-31', 10, '2020-02-20'), row(2020, '2020-12-31', 9, '2021-02-20')],
  ...over } });

test('Fundamentaldaten: nur was vor dem Stichtag eingereicht war; Rule of 40, Bruttogewinn/Bilanz, Rückkäufe richtig', () => {
  const b = bundleWith();
  const before = fundamentalFeatures(b, '2021-02-15', 50), after = fundamentalFeatures(b, '2021-03-01', 50);
  assert.equal(before.revenueGrowthYoy, null); // GJ 2020 noch nicht gemeldet -> nur ein Jahr sichtbar
  assert.ok(Math.abs(before.gpa - 60 / 200) < 1e-12);
  assert.ok(Math.abs(after.revenueGrowthYoy - 0.5) < 1e-12);
  assert.ok(Math.abs(after.ruleOf40 - (0.5 + 30 / 150)) < 1e-12);
  assert.ok(Math.abs(after.buyback - 0.1) < 1e-12); // 10 -> 9 Aktien
  assert.ok(Math.abs(after.earningsYield - 20 / (9 * 50)) < 1e-12);
  assert.ok(Math.abs(after.accrualsLow - (-(20 - 35) / 220)) < 1e-12);
  assert.equal(fundamentalFeatures(b, '2023-06-30', 50), null); // älter als 548 Tage
});

function market(paths, start = '2009-01-02') {
  const T = paths[0].length, m = allocate(calendar(T, start), paths.map((_, s) => 'S' + s));
  paths.forEach((p, s) => { const c = Float64Array.from(p), o = Float64Array.from(p, (x, t) => (t ? p[t - 1] : x)); setSecurity(m, s, { o, h: c.map((x) => x * 1.001), l: c.map((x) => x * 0.999), c, rc: c, v: new Float64Array(T).fill(1e6) }); });
  return finalize(m, Float64Array.from({ length: T }, (_, t) => 100 + t * 0.01));
}

test('Rendite bis zum nächsten Ultimo; delistet mit Endwertquote', () => {
  const T = 400, m = market([Array.from({ length: T }, (_, t) => 20 + t * 0.1), Array.from({ length: T }, (_, t) => (t <= 310 ? 30 : NaN))]);
  setTerminal(m, 1, 310, 0);
  const ends = monthEnds(m.dates, 2009), t = ends.find((x) => x < 310 && ends[ends.indexOf(x) + 1] > 310), tn = ends[ends.indexOf(t) + 1];
  assert.equal(forwardReturn(m, 1, t, tn), -1); // Insolvenz im Monat -> −100 %
  assert.ok(Math.abs(forwardReturn(m, 0, ends[0], ends[1]) - (m.c[ends[1]] / m.c[ends[0]] - 1)) < 1e-6);
});

test('Studie: ein Merkmal, das künftige Gewinner kennzeichnet, liegt vorn; Zufallsmerkmal nicht', () => {
  // 120 Titel; Titel mit hoher Bruttogewinn-Quote steigen jeden Monat stärker (eingebauter Vorteil)
  let seed = 3; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const S = 120, T = 260 + 21 * 30, quality = Array.from({ length: S }, () => rnd());
  const paths = quality.map((q) => { let p = 20; return Array.from({ length: T }, () => (p *= Math.exp(0.0002 + 0.0006 * q + 0.01 * (rnd() - 0.5)))); });
  const m = market(paths, '2009-01-02');
  const bundles = quality.map((q) => bundleWith({ gross_profit: [row(2009, '2009-12-31', 100 * q, '2010-01-15'), row(2010, '2010-12-31', 100 * q, '2011-01-15'), row(2011, '2011-12-31', 100 * q, '2012-01-15')], revenue: [row(2009, '2009-12-31', 100, '2010-01-15'), row(2010, '2010-12-31', 100, '2011-01-15'), row(2011, '2011-12-31', 100, '2012-01-15')], total_assets: [row(2009, '2009-12-31', 100, '2010-01-15'), row(2010, '2010-12-31', 100, '2011-01-15'), row(2011, '2011-12-31', 100, '2012-01-15')] }));
  const st = study(m, (s) => bundles[s], { from: 2010, universe: { maxRank: 1000, minPrice: 1 } });
  assert.ok(st.months.length >= 20);
  const rows = evaluate(st, st.months.map(() => 0.005));
  const gpa = rows.find((r) => r.key === 'gpa');
  assert.ok(gpa.excessUniverse > 0.02, JSON.stringify(gpa));
  assert.equal(rows.length, FEATURES.length + COMBOS.length + 1);
});

test('Perzentile: Gleichstand gemittelt, null bleibt null', () => {
  assert.deepEqual(pctRank([3, null, 1, 3]), [5 / 6, null, 1 / 3, 5 / 6]);
});
