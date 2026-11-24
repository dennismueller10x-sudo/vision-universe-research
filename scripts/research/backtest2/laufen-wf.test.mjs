// Laufen lassen im Walk-forward (Stufe 10): Gegentests auf künstlichen Daten. Schreibt nichts ins Repository.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocate, setSecurity, finalize } from './market.mjs';
import { monthEnds } from './merkmale.mjs';
import { crossSections } from './faktor-wf.mjs';
import { patternFlags } from './trader-wf.mjs';
import { drift } from './laufen-lassen.mjs';
import { grid, neighborsOf, select, walkForward, report, DIMS, RULES } from './laufen-wf.mjs';

function calendar(n, start) { const out = []; let d = new Date(start + 'T00:00:00Z'); while (out.length < n) { const w = d.getUTCDay(); if (w && w < 6) out.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 864e5); } return out; }
function market(paths, start = '2011-01-03') {
  const T = paths[0].length, m = allocate(calendar(T, start), paths.map((_, s) => 'ref_S' + s));
  paths.forEach((p, s) => { const c = Float64Array.from(p), o = Float64Array.from(p, (x, t) => (t ? p[t - 1] : x)); setSecurity(m, s, { o, h: c.map((x) => x * 1.001), l: c.map((x) => x * 0.999), c, rc: c, v: new Float64Array(T).fill(1e6) }); });
  return finalize(m, Float64Array.from({ length: T }, (_, t) => 100 * Math.exp(0.0003 * t)));
}
const row = (fy, v) => [fy, 'FY', fy + '-12-31', v, (fy + 1) + '-01-20', 'acc' + fy, 0];
const years = Array.from({ length: 19 }, (_, k) => 2008 + k);
const bundle = (q) => ({ annual: { revenue: years.map((y) => row(y, 100)), gross_profit: years.map((y) => row(y, 100 * q)), total_assets: years.map((y) => row(y, 100)),
  net_income: years.map((y) => row(y, 10)), stockholders_equity: years.map((y) => row(y, 50)), shares_outstanding: years.map((y, k) => row(y, 100 - k * (1 + q))),
  operating_cash_flow: years.map((y) => row(y, 12)), free_cash_flow: years.map((y) => row(y, 8)) } });
function setup(S, T, mk) {
  let seed = 3; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const q = Array.from({ length: S }, () => rnd()), paths = q.map((x, s) => mk(x, s, rnd, T)), m = market(paths);
  const xs = crossSections(m, (s) => bundle(q[s]), { from: 2014, universe: { maxRank: 1000, minPrice: 1 } });
  const endsT = monthEnds(m.dates), ends = endsT.map((t) => m.dates[t]), nextT = xs.map((x) => endsT[ends.indexOf(x.date) + 1]);
  return { m, xs, flags: patternFlags(m, xs), nextT };
}

test('Vorab fest: 216 Depots, Teilung 2020, Nachbarn unterscheiden sich in genau einer Dimension', () => {
  const g = grid();
  assert.equal(g.length, 216); assert.equal(new Set(g.map((x) => x.id)).size, 216);
  assert.deepEqual(RULES, { fromYear: 2014, splitYear: 2020, pBeat: 0.10 });
  assert.deepEqual(DIMS.slots, [10, 15, 25, 40]);
  const nb = neighborsOf(g[0], g);
  assert.equal(nb.length, 2 + 2 + 3 + 2 + 1);
});

test('Auswahl nimmt das Minimum aus eigener Rendite ohne größten Gewinner und Nachbar-Median: ein einsamer Ausreißer gewinnt nicht', () => {
  const g = grid(), stats = g.map(() => ({ cagr: 0.10, withoutTop: { cagr: 0.10 } }));
  stats[5] = { cagr: 0.90, withoutTop: { cagr: 0.90 } };            /* einsamer Ausreißer: Nachbarn bei 10 % */
  const robust = g.map((x, i) => (x.slots === 15 && x.score === 'mom_gpa' ? i : -1)).filter((i) => i >= 0);
  for (const i of robust) stats[i] = { cagr: 0.20, withoutTop: { cagr: 0.18 } };
  const pick = select(g, stats);
  assert.ok(robust.includes(pick.index), g[pick.index].id);
  assert.ok(Math.abs(pick.key - 0.15) < 1e-12, String(pick.key));   /* 5 von 10 Nachbarn robust: Median 15 % */
});

test('Nachlaufender Ausstieg verkauft einen Titel, der 25 % unter seinem Hoch liegt, auch über der 200-Tage-Linie', () => {
  /* Titel 0 steigt stark, fällt dann um ein Drittel (bleibt über der 200-Tage-Linie), der Rest steigt langsam */
  const { m, xs, flags, nextT } = setup(60, 2500, (x, s, rnd, T) => { let p = 20; return Array.from({ length: T }, (_, t) => (p *= Math.exp((s === 0 ? (t > 1800 && t <= 1840 ? -0.010 : 0.006) : 0.0005) + 0.003 * (rnd() - 0.5)))); });
  const a = drift(m, xs, flags, nextT, { pattern: 'NONE', score: 'mom', exit: 'SMA200' }), b = drift(m, xs, flags, nextT, { pattern: 'NONE', score: 'mom', exit: 'TRAIL' });
  assert.equal(a.trades.filter((t) => t.s === 0 && t.exit !== null).length, 0, 'über der Linie: bleibt');
  assert.ok(b.trades.some((t) => t.s === 0 && t.exit !== null), 'nachlaufend: verkauft');
});

test('Walk-forward: beide Runden, Hebel-Tabelle, Bericht ohne Lücken; Prüfung beginnt frisch im Teilungsjahr', () => {
  const { m, xs, flags, nextT } = setup(80, 3300, (x, s, rnd, T) => { let p = 20; return Array.from({ length: T }, () => (p *= Math.exp(0.0002 + 0.0009 * x + 0.012 * (rnd() - 0.5)))); });
  const spy = xs.map(() => 0.008), small = grid().filter((g) => g.slots <= 15 && g.universe === 1000 && g.pattern !== 'TURTLE');
  const res = walkForward(m, xs, flags, nextT, spy, { draws: 199, gridList: small });
  assert.equal(res.folds.length, 2);
  assert.equal(res.folds[0].test[0].slice(0, 4), '2020'); assert.ok(res.folds[0].learn[1] < '2020');
  assert.equal(res.folds[1].test[1].slice(0, 4), '2019');
  assert.equal(typeof res.proven, 'boolean');
  assert.deepEqual(Object.keys(res.levers), Object.keys(DIMS));
  const md = report({ result: res, dataFingerprint: 'x', smoke: true });
  assert.ok(md.includes('RAUCHTEST') && !md.includes('undefined') && !md.includes('NaN'));
});
