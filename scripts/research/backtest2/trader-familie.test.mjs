// Übrige Trader-Muster mit Faktoren (Stufe 5): Gegentests auf künstlichen Daten. Schreibt nichts ins Repository.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocate, setSecurity, finalize } from './market.mjs';
import { crossSections, SIGNALS } from './faktor-wf.mjs';
import { turtleAt, darvasAt, weinsteinAt, barsBack, patternFlags, portfolioSeries, evaluate, holm, report, PORTFOLIOS, PATTERNS, NEW_PATTERNS, RULES } from './trader-familie.mjs';

function calendar(n, start) { const out = []; let d = new Date(start + 'T00:00:00Z'); while (out.length < n) { const w = d.getUTCDay(); if (w && w < 6) out.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 864e5); } return out; }
function market(paths, start = '2009-01-02') {
  const T = paths[0].length, m = allocate(calendar(T, start), paths.map((_, s) => 'S' + s));
  paths.forEach((p, s) => { const c = Float64Array.from(p), o = Float64Array.from(p, (x, t) => (t ? p[t - 1] : x)); setSecurity(m, s, { o, h: c.map((x) => x * 1.001), l: c.map((x) => x * 0.999), c, rc: c, v: new Float64Array(T).fill(1e6) }); });
  return finalize(m, Float64Array.from({ length: T }, (_, t) => 100 + t * 0.01));
}
const row = (fy, v) => [fy, 'FY', fy + '-12-31', v, (fy + 1) + '-01-20', 'acc' + fy, 0];
const years = Array.from({ length: 19 }, (_, k) => 2008 + k);
const bundle = (q) => ({ annual: { revenue: years.map((y) => row(y, 100)), gross_profit: years.map((y) => row(y, 100 * q)), total_assets: years.map((y) => row(y, 100)),
  net_income: years.map((y) => row(y, 10)), stockholders_equity: years.map((y) => row(y, 50)), shares_outstanding: years.map((y) => row(y, 10)),
  operating_cash_flow: years.map((y) => row(y, 12)), free_cash_flow: years.map((y) => row(y, 8)) } });

test('Vorab fest: vier Muster, je „+ Faktoren“ und „nur Muster“, dazu „nur Faktoren“; Urteil nur für die drei neuen', () => {
  assert.deepEqual(PATTERNS, ['MINERVINI', 'TURTLE', 'DARVAS', 'WEINSTEIN']);
  assert.deepEqual(NEW_PATTERNS, ['TURTLE', 'DARVAS', 'WEINSTEIN']);
  assert.deepEqual(PORTFOLIOS.map((p) => p.id), ['MINERVINI+F', 'MINERVINI', 'TURTLE+F', 'TURTLE', 'DARVAS+F', 'DARVAS', 'WEINSTEIN+F', 'WEINSTEIN', 'FAKTOREN']);
  for (const p of PORTFOLIOS) assert.equal(p.score, p.id.endsWith('+F') || p.id === 'FAKTOREN' ? 'mom_gpa' : 'rs');
  assert.equal(RULES.n, 25); assert.equal(RULES.turtle, 55); assert.equal(RULES.darvas, 504); assert.equal(RULES.pHint, 0.10);
});

test('Muster aus Kursen: Ausbruch, Zweijahreshoch mit haltendem Kasten, Stufe 2; nur Balken bis t', () => {
  const T = 700, flat = new Array(T).fill(50);
  /* lange flach, in den letzten 10 Tagen Sprung um 10 %: 55-Tage-Ausbruch und neues Zweijahreshoch */
  const jump = flat.map((v, t) => (t >= T - 10 ? 55 : 50));
  /* Sprung vor 40 Tagen: kein Ausbruch mehr im 21-Tage-Fenster */
  const old = flat.map((v, t) => (t >= T - 40 ? 55 : 50));
  /* Sprung, danach 10 % Rückfall unter das Hoch: Kasten hält nicht (Darvas nein), Ausbruch im Fenster bleibt (Turtle ja) */
  const failed = flat.map((v, t) => (t >= T - 10 && t < T - 3 ? 60 : t >= T - 3 ? 53.5 : 50));
  /* stetiger Anstieg: Stufe 2; stetiger Abstieg: nicht */
  const up = Array.from({ length: T }, (_, t) => 20 * Math.exp(0.001 * t)), down = Array.from({ length: T }, (_, t) => 80 * Math.exp(-0.001 * t));
  const m = market([flat, jump, old, failed, up, down]);
  const t = T - 1;
  assert.deepEqual([0, 1, 2, 3].map((s) => turtleAt(m, s, t)), [false, true, false, true]);
  assert.deepEqual([0, 1, 2, 3].map((s) => darvasAt(m, s, t)), [false, true, false, false]);
  assert.deepEqual([0, 4, 5].map((s) => weinsteinAt(m, s, t)), [false, true, false]);
  assert.equal(turtleAt(m, 1, T - 11), false, 'vor dem Sprung kein Ausbruch: spätere Kurse zählen nicht');
  assert.equal(darvasAt(m, 1, 300), false, 'unter 525 Balken keine Aussage');
  assert.equal(barsBack(m, 0, 10, 50), null);
  assert.equal(barsBack(m, 0, t, 50).length, 50);
});

test('Holm: monoton, nie unter dem Rohwert, höchstens 1', () => {
  const a = holm([0.01, 0.04, 0.03]);
  assert.ok(Math.abs(a[0] - 0.03) < 1e-12 && Math.abs(a[2] - 0.06) < 1e-12 && Math.abs(a[1] - 0.06) < 1e-12);
  assert.deepEqual(holm([0.5, 0.9, 0.7]), [1, 1, 1]);
});

function fakeXs(n, fill) {
  const K = SIGNALS.length, col = (k) => SIGNALS.findIndex((s) => s[0] === k);
  return Array.from({ length: n }, (_, e) => {
    const P = new Float32Array(60 * K).fill(NaN), r = new Float64Array(60);
    for (let i = 0; i < 60; i++) fill(r, i, e, (k, v) => { P[i * K + col(k)] = v; });
    return { date: `${2014 + Math.floor(e / 12)}-${String((e % 12) + 1).padStart(2, '0')}-28`, s: Int32Array.from({ length: 60 }, (_, i) => i), r, adv: new Float64Array(60).fill(1e9),
      rank: Int32Array.from({ length: 60 }, (_, i) => i + 1), cap: new Float64Array(60).fill(1), K, P };
  });
}

test('Urteil: Hinweis nur für das Muster, dessen Kombination vor SPY und vor beiden Kontrollen liegt', () => {
  const months = 72, spy = new Array(months).fill(0.004), bench = { SPY: spy, QQQ: spy, RSP: spy };
  /* Titel 30..59 erfüllen TURTLE; stark laufen nur Titel 45..59 (Muster UND hoher Punktwert). Andere Muster: Titel 0..29, flach. */
  const xs = fakeXs(months, (r, i, e, set) => {
    const high = i >= 45 || i < 15; set('momentum12_1', high ? 0.9 + (i % 15) / 1000 : 0.2); set('gpa', high ? 0.9 : 0.2); set('rs6', i >= 30 && i < 45 ? 0.95 : 0.3);
    r[i] = i >= 45 ? 0.03 + (e % 2 ? 0.01 : -0.01) : 0;
  });
  const flag = (fn) => xs.map(() => Uint8Array.from({ length: 60 }, (_, i) => (fn(i) ? 1 : 0)));
  const flags = { TURTLE: flag((i) => i >= 30), MINERVINI: flag((i) => i < 30), DARVAS: flag((i) => i < 30), WEINSTEIN: flag((i) => i < 30) };
  const ev = evaluate(xs, flags, bench, { draws: 499 });
  const v = Object.fromEntries(ev.verdicts.map((x) => [x.pattern, x]));
  assert.equal(v.TURTLE.hint, true, JSON.stringify(v.TURTLE));
  assert.equal(v.DARVAS.hint, false); assert.equal(v.WEINSTEIN.hint, false);
  assert.ok(v.TURTLE.vsPattern > 0 && v.TURTLE.vsFactors > 0);
  assert.equal(ev.portfolios.length, 9);
  const s = portfolioSeries(xs, flags, PORTFOLIOS.find((p) => p.id === 'TURTLE+F'));
  assert.equal(s.names[0], 25); assert.equal(s.candidates[0], 30);
  const md = report({ result: ev, smoke: true, data: { loaded: 60 }, dataFingerprint: 'test' });
  assert.match(md, /RAUCHTEST/); assert.match(md, /Urteil je neuem Muster/); assert.doesNotMatch(md, /NaN|undefined/);
});

test('Durchstich: Muster-Flags aus einem künstlichen Markt, alle neun Depots rechnen', () => {
  let seed = 5; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const S = 80, T = 2600, q = Array.from({ length: S }, () => rnd());
  const paths = q.map((x) => { let p = 20; return Array.from({ length: T }, () => (p *= Math.exp(0.0012 * x - 0.0002 + 0.012 * (rnd() - 0.5)))); });
  const m = market(paths, '2011-01-03');
  const xs = crossSections(m, (s) => bundle(q[s]), { from: 2014, universe: { maxRank: 1000, minPrice: 1 } });
  const flags = patternFlags(m, xs);
  for (const p of PATTERNS) assert.ok(flags[p].some((f) => f.some((v) => v === 1)), p + ' kommt vor');
  const spyM = xs.map(() => 0.004), ev = evaluate(xs, flags, { SPY: spyM, QQQ: spyM, RSP: spyM }, { draws: 199 });
  assert.equal(ev.portfolios.length, 9); assert.equal(ev.verdicts.length, 3);
});
