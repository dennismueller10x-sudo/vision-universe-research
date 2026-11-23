// Vorwärtstest Fassung B: Gegentests auf künstlichen Scherben und Kursen. Schreibt nichts ins Repository.
import test from 'node:test';
import assert from 'node:assert/strict';
import { componentScore, rowsOf, picksOf, coverageOf, firstPerMonth, evaluate, chain, VARIANTS, COMPONENTS, OFFICIAL_FROM, REGISTERED } from './forward-b.mjs';

const sec = (cap, mom, gp, gpState = 'AVAILABLE') => ({ marketCap: cap, factors: {
  momentum: { components: [{ id: 'priceReturn12m1m', state: 'AVAILABLE', score: mom }, { id: 'priceReturn6m', state: 'AVAILABLE', score: 1 }] },
  profitability: { components: [{ id: 'grossProfitabilityTtm', state: gpState, score: gp }] } } });

test('Registrierung: vor dem ersten gezählten Monat festgelegt, feste Varianten und Bausteine', () => {
  assert.equal(REGISTERED, '2026-11-23'); assert.equal(OFFICIAL_FROM, '2026-12'); assert.ok(REGISTERED.slice(0, 7) < OFFICIAL_FROM);
  assert.deepEqual(VARIANTS, { B1000: { universe: 1000, top: 0.2 }, B500: { universe: 500, top: 0.1 } });
  assert.deepEqual(COMPONENTS, { momentum: 'priceReturn12m1m', profitability: 'grossProfitabilityTtm' });
});

test('Baustein-Score: nur AVAILABLE und Zahl, sonst null', () => {
  assert.equal(componentScore(sec(1, 70, 30), 'momentum', 'priceReturn12m1m'), 70);
  assert.equal(componentScore(sec(1, 70, 30, 'UNAVAILABLE'), 'profitability', 'grossProfitabilityTtm'), null);
  assert.equal(componentScore(sec(1, 70, null), 'profitability', 'grossProfitabilityTtm'), null);
  assert.equal(componentScore({ factors: {} }, 'momentum', 'priceReturn12m1m'), null);
  assert.equal(componentScore(null, 'momentum', 'priceReturn12m1m'), null);
});

test('Zeilen: alle Titel mit Börsenwert; Signal = Mittel beider Bausteine, sonst null', () => {
  const rows = rowsOf([{ securities: { A: sec(10, 80, 40), B: sec(5, 80, 40, 'UNAVAILABLE'), C: sec(null, 80, 40), D: sec(0, 80, 40) } }, { securities: { E: sec(7, 20, 60) } }, null]);
  assert.deepEqual(rows, [{ ticker: 'A', marketCap: 10, signal: 60 }, { ticker: 'B', marketCap: 5, signal: null }, { ticker: 'E', marketCap: 7, signal: 40 }]);
});

test('Auswahl: erst die größten nach Börsenwert, dann der beste Anteil der wählbaren; Titel ohne Signal bleiben im Universum', () => {
  /* 1.200 Titel, Börsenwert absteigend mit dem Index; jeder zweite ohne Bruttogewinn; Signal steigt mit dem Index */
  const rows = Array.from({ length: 1200 }, (_, i) => ({ ticker: 'T' + String(i).padStart(4, '0'), marketCap: 1e6 - i, signal: i % 2 ? null : i / 12 }));
  const cov = coverageOf(rows);
  assert.deepEqual(cov, { B1000: { universe: 1000, withSignal: 500 }, B500: { universe: 500, withSignal: 250 } });
  const p = picksOf(rows);
  assert.equal(p.B1000.length, 100, 'Fünftel der 500 wählbaren unter den 1.000 größten');
  assert.equal(p.B500.length, 25, 'Zehntel der 250 wählbaren unter den 500 größten');
  /* höchstes Signal innerhalb des Universums: die geraden Indizes knapp unter 1000 bzw. 500, nie darüber */
  assert.ok(p.B1000.every((t) => +t.slice(1) < 1000 && +t.slice(1) % 2 === 0 && +t.slice(1) >= 800));
  assert.ok(p.B500.every((t) => +t.slice(1) < 500 && +t.slice(1) >= 450));
  /* ein kleiner Titel mit dem besten Signal gehört nicht zum Universum und wird nicht gewählt */
  assert.equal(picksOf(rows.concat({ ticker: 'KLEIN', marketCap: 1, signal: 100 })).B1000.includes('KLEIN'), false);
  /* deterministisch, unabhängig von der Reihenfolge der Eingabe */
  assert.deepEqual(picksOf(rows.slice().reverse()), p);
});

test('Stichtag: erster Eintrag je Monat', () => {
  assert.deepEqual(firstPerMonth([{ date: '2026-12-03', c: 2 }, { date: '2026-12-01', c: 1 }, { date: '2027-01-02', c: 3 }]).map((x) => x.c), [1, 3]);
});

test('Bewertung: Rendite der Auswahl nach Kosten gegen SPY; ein Monat zählt erst mit erreichtem Ausstieg', () => {
  const days = ['2026-12-01', '2026-12-02', '2027-01-04', '2027-01-05', '2027-02-01', '2027-02-02'];
  const up = days.map((d, k) => [d, 100 * (k >= 3 ? 1.1 : 1)]), flat = days.map((d) => [d, 100]);
  const spy = days.map((d, k) => [d, 100 * (k >= 3 ? 1.02 : 1)]);
  const snaps = [{ asOf: '2026-12-01', picks: { B1000: ['UP1', 'UP2', 'FLAT'], B500: ['UP1'] } }, { asOf: '2027-01-04', picks: { B1000: ['UP1', 'UP2', 'FLAT'], B500: ['FLAT'] } }, { asOf: '2027-02-01', picks: { B1000: [], B500: [] } }];
  const priceOf = (t) => (t.startsWith('UP') ? up : t === 'FLAT' ? flat : null);
  const months = evaluate(snaps, priceOf, spy);
  assert.equal(months.length, 2);
  const m = months[0];
  assert.equal(m.entry, '2026-12-02'); assert.equal(m.exit, '2027-01-05');
  assert.ok(Math.abs(m.spy - 0.02) < 1e-12);
  /* Erstkauf: Umschlag 100 %, 6 bp */
  assert.ok(Math.abs(m.variants.B1000.net - (0.2 / 3 - 6 / 1e4)) < 1e-12);
  assert.ok(Math.abs(m.variants.B500.net - (0.1 - 6 / 1e4)) < 1e-12);
  /* zweiter Monat: B1000 unverändert (kein Umschlag, flach), B500 wechselt ganz (ein Titel raus, einer rein = 200 %) */
  assert.equal(months[1].variants.B1000.turnover, 0);
  assert.ok(Math.abs(months[1].variants.B500.net - (0 - 2 * 6 / 1e4)) < 1e-12);
  /* Titel ohne Kurs am Einstiegstag ist nicht kaufbar und zählt nicht mit */
  const miss = evaluate([{ asOf: '2026-12-01', picks: { B1000: ['UP1', 'OHNE'], B500: [] } }, snaps[1]], priceOf, spy)[0].variants;
  assert.equal(miss.B1000.names, 1); assert.equal(miss.B1000.missingEntry, 1); assert.equal(miss.B500.net, null);
  const c = chain(months, '2026-12');
  assert.equal(c.months, 2); assert.equal(c.variants.B1000.monthsAheadSpy, 1); assert.equal(c.variants.B500.monthsAheadSpy, 1);
  assert.equal(chain(months, '2027-03').spy, null);
});
