// Vorwärtstest: Gegentests auf künstlichen Snapshots und Kursen. Schreibt nichts ins Repository.
import test from 'node:test';
import assert from 'node:assert/strict';
import { score, monthlyDecisions, closeAfter, evaluate, chain, VARIANTS } from './forward.mjs';

test('Score: Pflichtfaktoren nötig, Revisionen werden umverteilt', () => {
  const f = { quality: 50, growth: 50, momentum: 90, value: 50, profitability: 70, revisions: null, risk: 50 };
  assert.ok(Math.abs(score(VARIANTS.live, f) - (5 + 7.5 + 22.5 + 7.5 + 10.5 + 2.5) / 0.85) < 1e-9);
  assert.equal(score(VARIANTS.live, { ...f, risk: null }), null);
  assert.equal(score(VARIANTS.mp, f), 80);
});

test('Monatsentscheidung = erster Snapshot je Monat; Einstieg am ersten Handelstag danach', () => {
  assert.deepEqual(monthlyDecisions(['2026-10-02', '2026-10-01', '2026-11-03', '2026-11-04']), ['2026-10-01', '2026-11-03']);
  assert.deepEqual(closeAfter([['2026-10-01', 10], ['2026-10-02', 11]], '2026-10-01'), { date: '2026-10-02', close: 11 });
});

test('Bewertung: das obere Fünftel einer Variante gewinnt, wenn seine Titel steigen; Kosten auf den Umschlag', () => {
  const tickers = Array.from({ length: 50 }, (_, i) => 'T' + i);
  const mk = (asOf) => ({ asOf, rows: Object.fromEntries(tickers.map((t, i) => [t, { quality: 50, growth: 50, momentum: i * 2, value: 50, profitability: i * 2, revisions: null, risk: 50 }])) });
  const days = ['2026-10-01', '2026-10-02', '2026-11-02', '2026-11-03', '2026-12-01', '2026-12-02'];
  const price = (i) => days.map((d, k) => [d, 100 * (1 + (i >= 40 ? 0.1 : 0) * (k >= 3 ? 1 : 0))]);
  const spy = days.map((d) => [d, 100]);
  const months = evaluate([mk('2026-10-01'), mk('2026-11-02'), mk('2026-12-01')], (t) => price(+t.slice(1)), spy);
  assert.equal(months.length, 2); // Okt und Nov; der Dezember-Snapshot hat keinen Folgemonat
  assert.equal(months[1].variants.mp.turnover, 0); assert.ok(Math.abs(months[1].variants.mp.net) < 1e-12); // gleiche Titel, flacher Kurs
  const m = months[0];
  assert.equal(m.entry, '2026-10-02'); assert.equal(m.exit, '2026-11-03');
  assert.equal(m.variants.mp.names, 10);
  assert.ok(Math.abs(m.variants.mp.net - (0.1 - 6 / 1e4)) < 1e-12);
  const c = chain(months, '2026-10');
  assert.equal(c.variants.mp.monthsAheadSpy, 1); assert.equal(c.months, 2);
  assert.equal(chain(months, '2026-12').spy, null);
});
