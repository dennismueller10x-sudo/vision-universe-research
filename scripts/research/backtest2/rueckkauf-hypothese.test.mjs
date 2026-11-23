// Feste Hypothese Momentum + Bruttogewinn/Bilanz + Rückkäufe (Stufe 8): Gegentests auf künstlichen Daten. Schreibt nichts ins Repository.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIGNALS } from './faktor-wf.mjs';
import { series, evaluate, report, HYPOTHESIS, CHECKS, FROM_YEAR } from './rueckkauf-hypothese.mjs';

function fakeXs(n, fill, start = 2014) {
  const K = SIGNALS.length, col = (k) => SIGNALS.findIndex((s) => s[0] === k);
  return Array.from({ length: n }, (_, e) => {
    const P = new Float32Array(60 * K).fill(NaN), r = new Float64Array(60);
    for (let i = 0; i < 60; i++) fill((k, v) => { P[i * K + col(k)] = v; }, r, i, e);
    return { date: `${start + Math.floor(e / 12)}-${String((e % 12) + 1).padStart(2, '0')}-28`, s: Int32Array.from({ length: 60 }, (_, i) => i), r, adv: new Float64Array(60).fill(1e9),
      rank: Int32Array.from({ length: 60 }, (_, i) => i + 1), cap: new Float64Array(60).fill(1), K, P };
  });
}

test('Vorab fest: eine Regel (R25) und sieben Gegenproben, jede ändert genau eine Einstellung', () => {
  assert.deepEqual(HYPOTHESIS, { id: 'R25', label: 'Momentum + Bruttogewinn/Bilanz + Rückkäufe · 25 Titel · Haltepuffer', pattern: false, score: 'mom_gpa_buyback', n: 25, hold: true, dropTop: 0 });
  assert.deepEqual(CHECKS.map((c) => c.id), ['R25-ohne-1', 'R25-ohne-2', 'R25-ohne-Puffer', 'R15', 'R50', 'R25-Trendvorlage', 'MG25']);
  for (const c of CHECKS) assert.equal(['pattern', 'score', 'n', 'hold', 'dropTop'].filter((k) => c[k] !== HYPOTHESIS[k]).length, 1, c.id);
  assert.equal(FROM_YEAR, 2014);
});

test('Härtetest: ohne den besten Titel sinkt die Monatsrendite um dessen Beitrag; ein Titel bleibt immer', () => {
  /* 25 gehaltene Titel (35..59), einer davon +50 %, die übrigen +1 % */
  const xs = fakeXs(2, (set, r, i) => { set('momentum12_1', i / 60); set('gpa', i / 60); set('buyback', i / 60); r[i] = i === 59 ? 0.5 : 0.01; });
  const flags = xs.map(() => new Uint8Array(60));
  const full = series(xs, flags, HYPOTHESIS), d1 = series(xs, flags, { ...HYPOTHESIS, dropTop: 1 }), d2 = series(xs, flags, { ...HYPOTHESIS, dropTop: 2 });
  assert.equal(full.names[1], 25);
  assert.ok(Math.abs(full.net[1] - (0.5 + 24 * 0.01) / 25) < 1e-12, 'zweiter Monat ohne Umschlag');
  assert.ok(Math.abs(d1.net[1] - 0.01) < 1e-12 && Math.abs(d2.net[1] - 0.01) < 1e-12);
  assert.deepEqual(d1.turnover, full.turnover, 'Kosten und Umschlag bleiben die des echten Depots');
  /* fehlt ein Baustein (Rückkäufe), ist der Titel nicht wählbar */
  const xs2 = fakeXs(1, (set, r, i) => { set('momentum12_1', i / 60); set('gpa', i / 60); if (i < 12) set('buyback', 0.5); r[i] = 0; });
  assert.equal(series(xs2, xs2.map(() => new Uint8Array(60)), HYPOTHESIS).names[0], 12);
  /* Muster als Schranke */
  const f = xs.map(() => Uint8Array.from({ length: 60 }, (_, i) => (i < 30 ? 1 : 0)));
  assert.equal(series(xs, f, { ...HYPOTHESIS, pattern: true }).net[1] < full.net[1], true);
});

test('Auswertung: Kalenderjahre, Teilzeiträume, Gegenproben und Bericht', () => {
  const months = 4 * 12 + 6, spy = new Array(months).fill(0.008), bench = { SPY: spy, QQQ: spy, RSP: spy };
  const xs = fakeXs(months, (set, r, i, e) => { set('momentum12_1', i / 60); set('gpa', i / 60); set('buyback', i / 60); r[i] = (i >= 35 ? 0.015 : 0.002) + (e % 2 ? 0.01 : -0.01); });
  const ev = evaluate(xs, xs.map(() => new Uint8Array(60)), bench, { draws: 299 });
  assert.equal(ev.months, months); assert.equal(ev.years.length, 5); assert.equal(ev.years.at(-1).months, 6);
  assert.ok(ev.hypothesis.excess > 0 && ev.hypothesis.cashMonths === 0);
  assert.equal(ev.checks.length, 7); assert.equal('net' in ev.hypothesis, false);
  assert.ok(ev.checks.find((c) => c.id === 'R25-ohne-1').cagr <= ev.hypothesis.cagr + 1e-9);
  assert.ok(ev.worstYearVsSpy && ev.worstYearVsSpy.months === 12);
  const md = report({ result: ev, smoke: true, data: { loaded: 60 }, dataFingerprint: 'test' });
  assert.match(md, /Stufe 8/); assert.match(md, /Kalenderjahre/); assert.match(md, /Härtetest/); assert.match(md, /\(6 Mon\.\)/); assert.doesNotMatch(md, /NaN|undefined/);
});
