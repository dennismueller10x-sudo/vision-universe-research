// Faktor-Walk-forward: Gegentests auf künstlichen Daten mit bekanntem Ergebnis. Schreibt nichts ins Repository.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocate, setSecurity, finalize } from './market.mjs';
import { specs, neighborsOf, crossSections, portfolioSeries, walkForward, windowStats, SIGNALS, GRID, HYPOTHESIS } from './faktor-wf.mjs';

function calendar(n, start) { const out = []; let d = new Date(start + 'T00:00:00Z'); while (out.length < n) { const w = d.getUTCDay(); if (w && w < 6) out.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 864e5); } return out; }
const row = (fy, v) => [fy, 'FY', fy + '-12-31', v, (fy + 1) + '-01-20', 'acc' + fy, 0];
const years = Array.from({ length: 17 }, (_, k) => 2008 + k);
const bundle = (q, shares = 10) => ({ annual: {
  revenue: years.map((y) => row(y, 100)), gross_profit: years.map((y) => row(y, 100 * q)), total_assets: years.map((y) => row(y, 100)),
  net_income: years.map((y) => row(y, 10)), stockholders_equity: years.map((y) => row(y, 50)), shares_outstanding: years.map((y) => row(y, shares)),
  operating_cash_flow: years.map((y) => row(y, 12)), free_cash_flow: years.map((y) => row(y, 8)) } });

function market(paths, spy, start = '2009-01-02') {
  const T = paths[0].length, m = allocate(calendar(T, start), paths.map((_, s) => 'S' + s));
  paths.forEach((p, s) => { const c = Float64Array.from(p), o = Float64Array.from(p, (x, t) => (t ? p[t - 1] : x)); setSecurity(m, s, { o, h: c.map((x) => x * 1.001), l: c.map((x) => x * 0.999), c, rc: c, v: new Float64Array(T).fill(1e6) }); });
  return finalize(m, spy);
}

test('Raster: 512 Depots, jedes mit 4 Nachbarn (eine Einstellung anders), Hypothese im Raster', () => {
  const list = specs();
  assert.equal(list.length, SIGNALS.length * 16);
  assert.equal(list.length, 512);
  const n = neighborsOf(list);
  assert.ok(n.every((x) => x.length === 4));
  assert.ok(n[0].every((k) => list[k].signal === list[0].signal));
  assert.ok(GRID.signal.includes(HYPOTHESIS.signal));
});

test('Depotreihe: Umschlag nur bei Wechsel, Marktfilter aus = Kasse 0 % mit Verkaufskosten', () => {
  const xs = [0, 1, 2].map((e) => ({ date: '2015-0' + (e + 1) + '-30', s: Int32Array.from({ length: 60 }, (_, i) => i), r: new Float64Array(60).fill(0.01), adv: new Float64Array(60).fill(1e9),
    rank: Int32Array.from({ length: 60 }, (_, i) => i + 1), cap: new Float64Array(60).fill(1), K: SIGNALS.length, filterOn: e !== 2,
    P: (() => { const P = new Float32Array(60 * SIGNALS.length).fill(NaN); for (let r = 0; r < 60; r++) P[r * SIGNALS.length] = r / 60; return P; })() }));
  const spec = { signal: SIGNALS[0][0], top: 0.2, maxRank: 1000, weight: 'EW', filter: 'SPY200' };
  const s = portfolioSeries(xs, spec);
  assert.equal(s.names[0], 12);
  assert.ok(Math.abs(s.turnover[0] - 1) < 1e-9); // Aufbau
  assert.ok(Math.abs(s.turnover[1]) < 1e-9); // gleiche Titel
  assert.ok(Math.abs(s.net[1] - 0.01) < 1e-12);
  assert.equal(s.names[2], 0);
  assert.ok(s.net[2] < 0 && s.net[2] > -0.001, String(s.net[2])); // Kasse: nur Verkaufskosten
});

test('Fenster gegen SPY: Hälften, Jahre vorn, Verlust', () => {
  const months = ['2014-01-31', '2014-06-30', '2015-01-30', '2015-06-30'], net = [0.02, 0.02, -0.01, 0.04], spy = [0.01, 0.01, 0.01, 0.01];
  const w = windowStats(net, spy, months, [0, 1, 2, 3]);
  assert.equal(w.years, 2); assert.equal(w.yearsAhead, 2);
  assert.ok(w.firstHalf > 0 && w.secondHalf > 0 && w.maxDrawdown < 0);
});

test('Walk-forward: eingebauter Vorteil der Bruttogewinn-Quote wird nur aus Lernjahren gefunden und hält auf ungesehenen Jahren', () => {
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const S = 150, T = 4100, quality = Array.from({ length: S }, () => rnd());
  const paths = quality.map((q) => { let p = 20; return Array.from({ length: T }, () => (p *= Math.exp(0.0001 + 0.0008 * q + 0.012 * (rnd() - 0.5)))); });
  const spy = Float64Array.from({ length: T }, (_, t) => 100 * Math.exp(0.0003 * t));
  const m = market(paths, spy);
  const xs = crossSections(m, (s) => bundle(quality[s]), { from: 2010, universe: { maxRank: 1000, minPrice: 1 } });
  assert.ok(xs.length > 150);
  const spyM = xs.map(() => Math.exp(0.0003 * 21) - 1);
  const wf = walkForward(xs, { SPY: spyM, QQQ: spyM, RSP: spyM });
  assert.equal(wf.rounds.length, 4);
  for (const r of wf.rounds) assert.ok(r.pickSpec && /gpa|quant|grossMargin/.test(r.pickSpec.signal), r.pick);
  assert.ok(wf.fassungA.excessSpy > 0.03, JSON.stringify(wf.fassungA));
  assert.ok(wf.fassungB.excessSpy > 0.03, JSON.stringify(wf.fassungB));
  // Zufallsmerkmal (Umsatzwachstum: bei allen null) hat keinen Vorteil gegenüber dem Durchschnitt
  const rev = wf.signalsOos.find((x) => x.key === 'revenueGrowthYoy');
  assert.ok(rev.excessSpy < wf.fassungB.excessSpy);
});
