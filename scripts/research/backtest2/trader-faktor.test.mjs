// Trader-Muster mit Faktoren (Stufe 4): Gegentests auf künstlichen Daten mit bekanntem Ergebnis. Schreibt nichts ins Repository.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocate, setSecurity, finalize } from './market.mjs';
import { crossSections, SIGNALS } from './faktor-wf.mjs';
import { trendTemplateAt, scoreOf, portfolioSeries, evaluate, PORTFOLIOS, RULES, SCORES } from './trader-faktor.mjs';

function calendar(n, start) { const out = []; let d = new Date(start + 'T00:00:00Z'); while (out.length < n) { const w = d.getUTCDay(); if (w && w < 6) out.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 864e5); } return out; }
function market(paths, spy, start = '2009-01-02') {
  const T = paths[0].length, m = allocate(calendar(T, start), paths.map((_, s) => 'S' + s));
  paths.forEach((p, s) => { const c = Float64Array.from(p), o = Float64Array.from(p, (x, t) => (t ? p[t - 1] : x)); setSecurity(m, s, { o, h: c.map((x) => x * 1.001), l: c.map((x) => x * 0.999), c, rc: c, v: new Float64Array(T).fill(1e6) }); });
  return finalize(m, spy);
}
const row = (fy, v) => [fy, 'FY', fy + '-12-31', v, (fy + 1) + '-01-20', 'acc' + fy, 0];
const years = Array.from({ length: 19 }, (_, k) => 2008 + k);
const bundle = (q) => ({ annual: {
  revenue: years.map((y) => row(y, 100)), gross_profit: years.map((y) => row(y, 100 * q)), total_assets: years.map((y) => row(y, 100)),
  net_income: years.map((y) => row(y, 10)), stockholders_equity: years.map((y) => row(y, 50)), shares_outstanding: years.map((y) => row(y, 10)),
  operating_cash_flow: years.map((y) => row(y, 12)), free_cash_flow: years.map((y) => row(y, 8)) } });

test('Vorab fest: acht Depots, H1 ist die einzige Hypothese, Kontrollen für Muster und Faktoren', () => {
  assert.equal(PORTFOLIOS.length, 8);
  assert.deepEqual(PORTFOLIOS.filter((p) => p.primary).map((p) => p.id), ['H1']);
  assert.deepEqual(PORTFOLIOS.map((p) => p.id), ['H1', 'H1-50', 'H2', 'H2-50', 'K1', 'K1-50', 'K2', 'K2-50']);
  const by = Object.fromEntries(PORTFOLIOS.map((p) => [p.id, p]));
  assert.ok(by.H1.template && by.H1.score === 'mom_gpa' && by.H1.n === 25);
  assert.ok(by.K1.template && by.K1.score === 'rs', 'K1: nur das Muster');
  assert.ok(!by.K2.template && by.K2.score === 'mom_gpa', 'K2: nur die Faktoren');
  assert.deepEqual(RULES, { maxRank: 1000, minNames: 10, fromYear: 2014, pHint: 0.10 });
  for (const parts of Object.values(SCORES)) for (const p of parts) assert.ok(SIGNALS.some((s) => s[0] === p), p);
});

test('Trendvorlage: stetiger Anstieg erfüllt sie, Abstieg und Seitwärts nicht, zu wenig Historie nicht; nur Balken bis t', () => {
  const T = 600, up = Array.from({ length: T }, (_, t) => 20 * Math.exp(0.002 * t)), down = Array.from({ length: T }, (_, t) => 200 * Math.exp(-0.002 * t)), flat = new Array(T).fill(50);
  /* erst Anstieg, dann Einbruch um 40 % in den letzten 30 Tagen: unter 75 % des 52-Wochen-Hochs */
  const crash = up.map((v, t) => (t >= T - 30 ? v * 0.6 : v));
  const m = market([up, down, flat, crash], Float64Array.from({ length: T }, (_, t) => 100 + t));
  assert.equal(trendTemplateAt(m, 0, T - 1), true);
  assert.equal(trendTemplateAt(m, 1, T - 1), false);
  assert.equal(trendTemplateAt(m, 2, T - 1), false);
  assert.equal(trendTemplateAt(m, 3, T - 1), false);
  assert.equal(trendTemplateAt(m, 3, T - 40), true, 'vor dem Einbruch erfüllt: spätere Kurse zählen nicht');
  assert.equal(trendTemplateAt(m, 0, 200), false, 'unter 253 Balken keine Aussage');
});

/* Künstliche Querschnitte: 60 Titel, Signalspalten gezielt belegt. */
function fakeXs(n, fill) {
  const K = SIGNALS.length, col = (k) => SIGNALS.findIndex((s) => s[0] === k);
  return Array.from({ length: n }, (_, e) => {
    const P = new Float32Array(60 * K).fill(NaN), r = new Float64Array(60);
    for (let i = 0; i < 60; i++) fill(P, r, i, e, (k, v) => { P[i * K + col(k)] = v; });
    return { date: `${2014 + Math.floor(e / 12)}-${String((e % 12) + 1).padStart(2, '0')}-28`, s: Int32Array.from({ length: 60 }, (_, i) => i), r, adv: new Float64Array(60).fill(1e9),
      rank: Int32Array.from({ length: 60 }, (_, i) => i + 1), cap: new Float64Array(60).fill(1), K, P };
  });
}

test('Depotreihe: Muster als Schranke, Rang nach Punktwert, fehlender Baustein schließt aus, unter 10 Kandidaten Kasse', () => {
  const xs = fakeXs(3, (P, r, i, e, set) => { set('momentum12_1', i / 60); if (i !== 59) set('gpa', i / 60); set('rs6', 1 - i / 60); r[i] = i >= 30 ? 0.02 : 0; });
  const all = xs.map(() => new Uint8Array(60).fill(1)), half = xs.map(() => Uint8Array.from({ length: 60 }, (_, i) => (i < 30 ? 1 : 0))), few = xs.map(() => Uint8Array.from({ length: 60 }, (_, i) => (i < 5 ? 1 : 0)));
  assert.ok(Number.isNaN(scoreOf(xs[0], 59, SCORES.mom_gpa)), 'ohne Bruttogewinn kein Punktwert');
  assert.ok(Math.abs(scoreOf(xs[0], 30, SCORES.mom_gpa) - 0.5) < 1e-6);
  const H1 = PORTFOLIOS.find((p) => p.id === 'H1'), K2 = PORTFOLIOS.find((p) => p.id === 'K2');
  /* ohne Schranke: die 25 höchsten Punktwerte unter den 59 wählbaren (Titel 34..58), alle +2 % */
  const s = portfolioSeries(xs, all, K2);
  assert.equal(s.names[0], 25); assert.equal(s.candidates[0], 59);
  assert.ok(Math.abs(s.turnover[0] - 1) < 1e-9 && Math.abs(s.turnover[1]) < 1e-9);
  assert.ok(Math.abs(s.net[1] - 0.02) < 1e-12);
  assert.ok(s.net[0] < 0.02 && s.net[0] > 0.019, 'Aufbau kostet');
  /* mit Schranke auf die Titel 0..29: 25 beste davon (5..29), alle 0 % */
  const t = portfolioSeries(xs, half, H1);
  assert.equal(t.names[1], 25); assert.equal(t.candidates[1], 30); assert.ok(Math.abs(t.net[1]) < 1e-12);
  /* nur 5 Kandidaten: Kasse */
  const c = portfolioSeries(xs, few, H1);
  assert.deepEqual(c.names, [0, 0, 0]); assert.deepEqual(c.net, [0, 0, 0]);
  /* 50er-Depot nimmt höchstens, was da ist */
  assert.equal(portfolioSeries(xs, half, PORTFOLIOS.find((p) => p.id === 'H1-50')).names[0], 30);
});

test('Urteil: Hinweis nur, wenn H1 vor SPY (p < 0,10) UND vor beiden Kontrollen liegt', () => {
  const months = 60, spy = new Array(months).fill(0.005), bench = { SPY: spy, QQQ: spy, RSP: spy };
  /* Titel 30..59 erfüllen das Muster. Stark sind nur Titel, die Muster UND hohen Punktwert haben (45..59): +3 % mit Schwankung.
     Hoher Punktwert ohne Muster (0..14 bekommen ebenfalls hohen Punktwert) und Muster mit hoher relativer Stärke, aber
     niedrigem Punktwert (30..44) laufen flach. */
  const build = (strong) => fakeXs(months, (P, r, i, e, set) => {
    const high = i >= 45 || i < 15; set('momentum12_1', high ? 0.9 + (i % 15) / 1000 : 0.2); set('gpa', high ? 0.9 : 0.2);
    set('rs6', i >= 30 && i < 45 ? 0.95 : 0.3); set('revenueGrowthYoy', 0.5); set('roe', 0.5);
    r[i] = i >= 45 ? strong + (e % 2 ? 0.01 : -0.01) : 0;
  });
  const flags = (xs) => xs.map(() => Uint8Array.from({ length: 60 }, (_, i) => (i >= 30 ? 1 : 0)));
  const good = build(0.03), ev = evaluate(good, flags(good), bench, { draws: 499 });
  const by = Object.fromEntries(ev.portfolios.map((p) => [p.id, p]));
  assert.ok(by.H1.excess > 0.1 && by.H1.pBootstrap < 0.1, JSON.stringify(by.H1));
  assert.ok(by.H1.cagr > by.K1.cagr && by.H1.cagr > by.K2.cagr, 'Kombination trägt mehr als jeder Teil');
  assert.equal(ev.verdict.hint, true);
  assert.equal(ev.months, months); assert.equal(by.H1.avgNames, 25); assert.equal(by.H1.avgCandidates, 30); assert.equal(by.H1.cashMonths, 0);
  assert.equal(by.H1.periods.length, 2);
  /* ohne Vorteil: kein Hinweis */
  const none = build(0.0), ev0 = evaluate(none, flags(none), bench, { draws: 499 });
  assert.equal(ev0.verdict.hint, false); assert.match(ev0.verdict.text, /nicht belegt/);
});

test('Durchstich auf einem künstlichen Markt: Muster wird aus Kursen erkannt, Depots rechnen bis zum Bericht', async () => {
  let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const S = 80, T = 2300, q = Array.from({ length: S }, () => rnd());
  const paths = q.map((x) => { let p = 20; return Array.from({ length: T }, () => (p *= Math.exp(0.0012 * x - 0.0002 + 0.01 * (rnd() - 0.5)))); });
  const m = market(paths, Float64Array.from({ length: T }, (_, t) => 100 * Math.exp(0.0003 * t)), '2012-01-02');
  const xs = crossSections(m, (s) => bundle(q[s]), { from: 2013, universe: { maxRank: 1000, minPrice: 1 } });
  const flags = xs.map((x) => Uint8Array.from(x.s, (s) => (trendTemplateAt(m, s, x.t) ? 1 : 0)));
  assert.ok(flags.some((f) => f.some((v) => v === 1)) && flags.some((f) => f.some((v) => v === 0)), 'Muster trennt');
  const spyM = xs.map(() => Math.exp(0.0003 * 21) - 1);
  const ev = evaluate(xs, flags, { SPY: spyM, QQQ: spyM, RSP: spyM }, { draws: 199 });
  assert.equal(ev.portfolios.length, 8);
  const { report } = await import('./trader-faktor.mjs');
  const md = report({ result: ev, smoke: true, data: { loaded: S }, dataFingerprint: 'test' });
  assert.match(md, /RAUCHTEST/); assert.match(md, /Forschung, nicht zertifiziert/); assert.match(md, /## Urteil/);
  assert.doesNotMatch(md, /NaN|undefined/);
});
