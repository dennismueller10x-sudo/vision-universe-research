// Ereignis-Methoden mit Faktoren (Stufe 6): Gegentests auf künstlichen Tagesbalken mit Umsatz. Schreibt nichts ins Repository.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocate, setSecurity, finalize } from './market.mjs';
import { crossSections } from './faktor-wf.mjs';
import { kullamaegiAt, pocketAt, gapUpAt, grailAt, darvasBoxAt, adxEma, patternFlags, evaluate, report, PATTERNS, PORTFOLIOS, E } from './trader-ereignis.mjs';

function calendar(n, start) { const out = []; let d = new Date(start + 'T00:00:00Z'); while (out.length < n) { const w = d.getUTCDay(); if (w && w < 6) out.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 864e5); } return out; }
/* Titel: {c: Schlüsse, v?: Umsätze, o?/h?/l?: optional je Tag} */
function market(secs, start = '2009-01-02') {
  const T = secs[0].c.length, m = allocate(calendar(T, start), secs.map((_, s) => 'S' + s));
  secs.forEach((x, s) => { const c = Float64Array.from(x.c), o = Float64Array.from(x.o || x.c.map((v, t) => (t ? x.c[t - 1] : v)));
    setSecurity(m, s, { o, h: Float64Array.from(x.h || x.c.map((v, t) => Math.max(v, o[t]) * 1.001)), l: Float64Array.from(x.l || x.c.map((v, t) => Math.min(v, o[t]) * 0.999)), c, rc: c, v: Float64Array.from(x.v || new Array(T).fill(1e6)) }); });
  return finalize(m, Float64Array.from({ length: T }, (_, t) => 100 + t * 0.01));
}
const flat = (T, p = 50) => new Array(T).fill(p);

test('Vorab fest: fünf Muster, elf Depots, Schwellen', () => {
  assert.deepEqual(PATTERNS, ['KULLAMAEGI', 'POCKET', 'GAPUP', 'GRAIL', 'DARVASBOX']);
  assert.equal(PORTFOLIOS.length, 11);
  assert.deepEqual(PORTFOLIOS.filter((p) => p.id.endsWith('+F')).map((p) => p.pattern), PATTERNS);
  assert.equal(E.window, 21); assert.equal(E.kkRet, 0.30); assert.equal(E.gapOpen, 0.04); assert.equal(E.volMult, 1.5); assert.equal(E.adxMin, 30); assert.equal(E.boxHistory, 756);
});

test('Kullamägi: starker Anstieg und enge Spanne nahe dem Hoch; ohne Anstieg oder mit weiter Spanne nicht', () => {
  const T = 400;
  /* +50 % über 40 Tage bis vor 15 Tagen, danach eng seitwärts mit leichtem Anstieg */
  const setup = Array.from({ length: T }, (_, t) => (t < T - 55 ? 40 : t < T - 15 ? 40 * (1 + 0.5 * (t - (T - 55)) / 40) : 60 + 0.02 * (t - (T - 15))));
  /* derselbe Anstieg, danach wilde Schwankung (Spanne über 15 %) */
  const wild = setup.map((v, t) => (t >= T - 10 ? v * (t % 2 ? 1.1 : 0.92) : v));
  const m = market([{ c: setup }, { c: flat(T) }, { c: wild }]);
  assert.deepEqual([0, 1, 2].map((s) => kullamaegiAt(m, s, T - 1)), [true, false, false]);
  assert.equal(kullamaegiAt(m, 0, T - 56), false, 'vor dem Anstieg nicht: spätere Kurse zählen nicht');
});

test('Pocket Pivot: Aufwärtstag mit mehr Umsatz als jeder Abwärtstag der 10 Sitzungen davor, über der 50-Tage-Linie', () => {
  const T = 300, c = Array.from({ length: T }, (_, t) => 50 + 0.05 * t + (t % 2 ? -0.2 : 0.2)), v = new Array(T).fill(1e6);
  const hit = { c: c.slice(), v: v.slice() }; hit.c[T - 5] = hit.c[T - 6] + 1; hit.v[T - 5] = 3e6; for (let t = T - 4; t < T; t++) hit.c[t] = hit.c[T - 5] + 0.1 * (t - (T - 5));
  /* gleicher Tag, aber kein Umsatzsprung */
  const quiet = { c: hit.c.slice(), v: v.slice() };
  /* Umsatzsprung, danach Rückfall unter das Tief des Tages */
  const failed = { c: hit.c.slice(), v: hit.v.slice() }; failed.c[T - 1] = hit.c[T - 6] - 3;
  const m = market([hit, quiet, failed]);
  assert.deepEqual([0, 1, 2].map((s) => pocketAt(m, s, T - 1)), [true, false, false]);
});

test('Gap-Up: Lücke mit Umsatz, die hält; ohne Umsatz oder nach Schließen der Lücke nicht', () => {
  const T = 300, base = flat(T), v = new Array(T).fill(1e6);
  const mk = (vol, last) => { const c = base.slice(), o = base.slice(), vv = v.slice(); for (let t = T - 8; t < T; t++) { c[t] = 55; o[t] = 55; } o[T - 8] = 54; vv[T - 8] = vol; if (last) c[T - 1] = last; return { c, o, v: vv }; };
  const m = market([mk(3e6), mk(1e6), mk(3e6, 51)]);
  assert.deepEqual([0, 1, 2].map((s) => gapUpAt(m, s, T - 1)), [true, false, false]);
  assert.equal(gapUpAt(m, 0, T - 9), false, 'vor der Lücke nicht');
});

test('Holy Grail: starker Trend (ADX über 30) mit Rücksetzer an den 20-Tage-EMA; Seitwärtsmarkt nicht', () => {
  const T = 300;
  /* stetiger Anstieg, in den letzten 4 Tagen Rücksetzer bis an den EMA, am Schluss wieder darüber */
  const up = Array.from({ length: T }, (_, t) => 20 * Math.exp(0.006 * t));
  const pull = up.slice(); const top = pull[T - 5]; pull[T - 4] = top * 0.97; pull[T - 3] = top * 0.95; pull[T - 2] = top * 0.945; pull[T - 1] = top * 0.97;
  const side = Array.from({ length: T }, (_, t) => 50 + (t % 4 < 2 ? 0.5 : -0.5));
  const m = market([{ c: pull }, { c: side }, { c: up }]);
  const bars = Array.from({ length: 100 }, (_, k) => T - 100 + k), r = adxEma(m, 2, bars);
  assert.ok(r.adx > 30 && r.pdi > r.ndi, JSON.stringify({ adx: r.adx, pdi: r.pdi, ndi: r.ndi }));
  assert.equal(grailAt(m, 0, T - 1), true);
  assert.equal(grailAt(m, 1, T - 1), false);
  assert.equal(grailAt(m, 2, T - 1), false, 'ohne Rücksetzer an den EMA kein Muster');
});

test('Darvas-Kasten: Ausbruch über die Decke der letzten 15 Sitzungen mit Umsatz, nahe am Allzeithoch, mindestens 756 Balken', () => {
  const T = 900, v = new Array(T).fill(1e6);
  const rise = Array.from({ length: T }, (_, t) => (t < T - 20 ? 20 + 0.03 * t : 20 + 0.03 * (T - 20)));
  const hit = { c: rise.slice(), v: v.slice() }; for (let t = T - 3; t < T; t++) hit.c[t] = rise[T - 21] * 1.04; hit.v[T - 3] = 2.5e6;
  const noVol = { c: hit.c.slice(), v: v.slice() };
  /* Ausbruch mit Umsatz, aber weit unter einem alten Hoch */
  const far = { c: hit.c.slice(), v: hit.v.slice() }; far.c[100] = 200;
  const m = market([hit, noVol, far, { c: hit.c.slice(-600), v: hit.v.slice(-600) }].slice(0, 3));
  assert.deepEqual([0, 1, 2].map((s) => darvasBoxAt(m, s, T - 1)), [true, false, false]);
  assert.equal(darvasBoxAt(m, 0, 700), false, 'unter 756 Balken keine Aussage');
});

test('Durchstich: Flags aus einem künstlichen Markt, elf Depots und Bericht', () => {
  let seed = 9; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const S = 60, T = 2700;
  const secs = Array.from({ length: S }, () => { let p = 20; const q = rnd(); return { c: Array.from({ length: T }, () => (p *= Math.exp(0.001 * q - 0.0001 + 0.02 * (rnd() - 0.5)))), v: Array.from({ length: T }, () => 5e5 + 2e6 * rnd() * rnd()) }; });
  const m = market(secs, '2010-06-01');
  const row = (fy, val) => [fy, 'FY', fy + '-12-31', val, (fy + 1) + '-01-20', 'acc' + fy, 0], years = Array.from({ length: 19 }, (_, k) => 2008 + k);
  const bundle = { annual: Object.fromEntries(['revenue', 'gross_profit', 'total_assets', 'net_income', 'stockholders_equity', 'shares_outstanding', 'operating_cash_flow', 'free_cash_flow'].map((k) => [k, years.map((y) => row(y, 50))])) };
  const xs = crossSections(m, () => bundle, { from: 2014, universe: { maxRank: 1000, minPrice: 1 } });
  const flags = patternFlags(m, xs);
  assert.deepEqual(Object.keys(flags), PATTERNS);
  for (const p of ['POCKET', 'GRAIL']) assert.ok(flags[p].some((f) => f.some((x) => x === 1)), p + ' kommt vor');
  const spyM = xs.map(() => 0.004), ev = evaluate(xs, flags, { SPY: spyM, QQQ: spyM, RSP: spyM }, { draws: 199 });
  assert.equal(ev.portfolios.length, 11); assert.equal(ev.verdicts.length, 5);
  assert.match(ev.rule, /Holm über 5 Hypothesen/);
  const md = report({ result: ev, smoke: true, data: { loaded: S }, dataFingerprint: 'test' });
  assert.match(md, /Stufe 6/); assert.match(md, /elf vorab feste Depots/); assert.match(md, /Kullamägi/); assert.doesNotMatch(md, /NaN|undefined/);
});
