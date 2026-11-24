// Ereignisstudie (Stufe 11): Gegentests auf künstlichen Daten. Schreibt nichts ins Repository.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocate, setSecurity, finalize } from './market.mjs';
import { crossSections } from './faktor-wf.mjs';
import { patternFlags } from './trader-wf.mjs';
import { study, report, R } from './ereignis-studie.mjs';

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

test('Vorab fest: Horizonte 1, 3, 6, 12 Monate, mindestens 3 markierte Titel, t über 2', () => {
  assert.deepEqual(R, { maxRank: 1000, fromYear: 2014, splitYear: 2020, horizons: [1, 3, 6, 12], topShare: 0.2, minFlagged: 3, tMin: 2 });
});

test('Ein eigenes Muster, das die dauerhaft stärkeren Titel markiert, zeigt positiven Vorsprung in Mittel und Median; ein Zufallsmuster nicht', () => {
  let seed = 5; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const S = 80, T = 3300, q = Array.from({ length: S }, () => rnd());
  const paths = q.map((_, s) => { let p = 20; return Array.from({ length: T }, () => (p *= Math.exp((s < 20 ? 0.0012 : 0.0002) + 0.01 * (rnd() - 0.5)))); });
  const m = market(paths), xs = crossSections(m, (s) => bundle(q[s]), { from: 2014, universe: { maxRank: 1000, minPrice: 1 } });
  const flags = patternFlags(m, xs);
  /* zwei Muster von Hand überschreiben: MINERVINI = die 20 starken Titel, TURTLE = jeder vierte Titel unabhängig von der Stärke */
  flags.MINERVINI = xs.map((x) => Uint8Array.from(x.s, (s) => (s < 20 ? 1 : 0)));
  flags.TURTLE = xs.map((x) => Uint8Array.from(x.s, (s) => (s % 4 === 1 ? 1 : 0)));
  const res = study(m, xs, flags), by = Object.fromEntries(res.rows.map((r) => [r.key, r]));
  const g = by.MINERVINI.per[12], z = by.TURTLE.per[12];
  assert.ok(g.excessMean > 0.1 && g.excessMedian > 0.1 && g.hitRate > 0.8 && g.t > 2, JSON.stringify(g));
  assert.ok(g.early > 0 && g.late > 0);
  assert.equal(by.MINERVINI.notable, true);
  assert.ok(Math.abs(z.excessMean) < 0.05, JSON.stringify(z)); assert.equal(by.TURTLE.notable, false);
  assert.ok(by.MINERVINI.per[1].months > by.MINERVINI.per[12].months, 'kürzerer Horizont hat mehr auswertbare Monate');
  const md = report({ result: res, dataFingerprint: 'x', smoke: true });
  assert.ok(md.includes('RAUCHTEST') && !md.includes('undefined') && !md.includes('NaN'));
});
