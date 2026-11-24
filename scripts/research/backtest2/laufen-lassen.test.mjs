// Gewinner laufen lassen und Gewinner-Erkennung (Stufe 9): Gegentests auf künstlichen Daten. Schreibt nichts ins Repository.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocate, setSecurity, finalize } from './market.mjs';
import { monthEnds } from './merkmale.mjs';
import { crossSections } from './faktor-wf.mjs';
import { patternFlags } from './trader-wf.mjs';
import { drift, evaluate, winnerCapture, report, PORTFOLIOS, R } from './laufen-lassen.mjs';

function calendar(n, start) { const out = []; let d = new Date(start + 'T00:00:00Z'); while (out.length < n) { const w = d.getUTCDay(); if (w && w < 6) out.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 864e5); } return out; }
function market(paths, start = '2011-01-03') {
  const T = paths[0].length, m = allocate(calendar(T, start), paths.map((_, s) => 'ref_S' + s));
  paths.forEach((p, s) => { const c = Float64Array.from(p), o = Float64Array.from(p, (x, t) => (t ? p[t - 1] : x)); setSecurity(m, s, { o, h: c.map((x) => x * 1.001), l: c.map((x) => x * 0.999), c, rc: c, v: new Float64Array(T).fill(1e6) }); });
  return finalize(m, Float64Array.from({ length: T }, (_, t) => 100 * Math.exp(0.0003 * t)));
}
const row = (fy, v) => [fy, 'FY', fy + '-12-31', v, (fy + 1) + '-01-20', 'acc' + fy, 0];
const years = Array.from({ length: 19 }, (_, k) => 2008 + k);
/* Aktienzahl sinkt jedes Jahr (Rückkäufe), Bruttogewinn je Bilanzsumme nach q */
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

test('Vorab fest: acht Depots, 25 Plätze, Gewinner = mindestens +100 % in 12 Monaten', () => {
  assert.deepEqual(PORTFOLIOS.map((p) => p.id), ['NONE+F', 'MINERVINI+F', 'TURTLE+F', 'DARVASBOX+F', 'KULLAMAEGI+F', 'MINERVINI', 'DARVASBOX', 'KULLAMAEGI']);
  assert.deepEqual(R, { maxRank: 1000, slots: 25, fromYear: 2014, winner: 1.0, winnerMonths: 12, topShare: 0.2 });
});

test('Laufen lassen: kein Zurückstellen, Verkauf erst unter der 200-Tage-Linie, Depotwert stimmt mit den Positionen', () => {
  /* 60 Titel: 20 steigen stetig (einer davon sehr stark), 10 steigen bis zur Mitte und fallen dann, 30 fallen immer (nie über der 200-Tage-Linie, nie gekauft) */
  const { m, xs, flags, nextT } = setup(60, 2500, (x, s, rnd, T) => { let p = 20; return Array.from({ length: T }, (_, t) => (p *= Math.exp((s === 0 ? 0.003 : s >= 30 ? -0.0008 : s >= 20 && t > T / 2 ? -0.004 : 0.0006) + 0.004 * (rnd() - 0.5)))); });
  const run = drift(m, xs, flags, nextT, { pattern: 'NONE', score: 'mom_gpa_buyback' });
  assert.equal(run.net.length, xs.length);
  assert.ok(run.count.every((c) => c <= 25) && run.count.at(-1) > 10);
  /* der starke Titel wird gekauft, nie verkauft und ist am Ende ein Vielfaches seines Einsatzes */
  const star = run.trades.filter((t) => t.s === 0);
  assert.equal(star.length, 1); assert.equal(star[0].exit, null); assert.ok(star[0].value / star[0].cost > 10, String(star[0].value / star[0].cost));
  assert.equal(run.trades.some((t) => t.s >= 30), false, 'Titel unter der 200-Tage-Linie werden nie gekauft');
  /* fallende Titel werden verkauft: kein offener Posten liegt unter seiner 200-Tage-Linie */
  const tLast = xs.at(-1).t;
  for (const t of run.trades.filter((x) => x.exit === null)) assert.ok(m.c[t.s * m.T + tLast] > m.sma200[t.s * m.T + tLast]);
  assert.ok(run.trades.some((t) => t.s >= 20 && t.exit !== null), 'fallende Titel wurden gekauft und wieder verkauft');
  assert.equal(run.trades.some((t) => t.s >= 20 && t.exit === null), false, 'kein fallender Titel ist am Ende noch im Depot');
  /* Depotwert aus Monatsrenditen = Kasse + Positionen am Ende (bis auf den letzten Monatsschritt geprüft über Vorzeichen und Größe) */
  const equity = run.net.reduce((a, r) => a * (1 + r), 1);
  assert.ok(equity > 3, 'der Gewinner trägt das Depot: ' + equity);
  /* ohne den starken Titel deutlich weniger */
  const without = drift(m, xs, flags, nextT, { pattern: 'NONE', score: 'mom_gpa_buyback' }, { exclude: new Set([0]) });
  assert.equal(without.trades.some((t) => t.s === 0), false);
  assert.ok(without.net.reduce((a, r) => a * (1 + r), 1) < equity / 1.5);
});

test('Auswertung und Gewinner-Erkennung: Ehrlichkeitsproben, Bericht ohne Lücken', () => {
  const { m, xs, flags, nextT } = setup(60, 2600, (x, s, rnd, T) => { let p = 20; return Array.from({ length: T }, () => (p *= Math.exp(0.0012 * x - 0.0002 + (s % 7 === 0 ? 0.002 : 0) + 0.012 * (rnd() - 0.5)))); });
  const spy = xs.map(() => Math.exp(0.0003 * 21) - 1);
  const ev = evaluate(m, xs, flags, nextT, { SPY: spy, QQQ: spy, RSP: spy }, { draws: 199, nameOf: (s) => 'S' + s });
  assert.equal(ev.portfolios.length, 8);
  const p = ev.portfolios[0];
  assert.ok(p.trades > 0 && p.avgHoldMonths > 1 && p.topPositions.length > 0 && p.topPositions[0].multiple >= p.topPositions.at(-1).multiple);
  assert.ok(p.withoutTop && /^S\d+$/.test(p.withoutTop.ticker));
  assert.ok(p.top5ShareOfGain === null || p.top5ShareOfGain > 0);
  const w = winnerCapture(m, xs, flags);
  assert.ok(w.titleMonths > 1000 && w.baseRate >= 0 && w.baseRate <= 1);
  assert.equal(w.rows.length, 10); assert.equal(w.rows.at(-1).key, 'SIGNAL');
  for (const r of w.rows) { assert.ok(r.yield === null || (r.yield >= 0 && r.yield <= 1)); assert.ok(r.capture === null || (r.capture >= 0 && r.capture <= 1)); }
  /* das beste Fünftel markiert etwa ein Fünftel der Titel-Monate mit Signal */
  assert.ok(w.rows.at(-1).flagged > 0.1 * w.titleMonths && w.rows.at(-1).flagged < 0.3 * w.titleMonths);
  const md = report({ result: ev, winners: w, smoke: true, data: { loaded: 60 }, dataFingerprint: 'test' });
  assert.match(md, /Stufe 9/); assert.match(md, /ohne größten Gewinner/); assert.match(md, /Teil B/); assert.doesNotMatch(md, /NaN|undefined/);
});
