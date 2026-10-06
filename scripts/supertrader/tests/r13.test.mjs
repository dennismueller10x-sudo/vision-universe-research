import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyDelisting } from '../validation/sec-pit.mjs';
import { replay, invariants, holdTrades } from '../validation/audit-r13.mjs';
import { runPortfolioTR, SCENARIOS } from '../validation/portfolio.mjs';

test('R13-D1 Delisting-Klassifikation: Übernahmedokumente im Fenster → ACQUISITION, sonst UNKNOWN', () => {
  const f = { form: ['10-Q', 'DEFM14A', '8-K'], filingDate: ['2018-05-01', '2018-08-20', '2018-10-10'] };
  assert.equal(classifyDelisting(f, '2018-10-10').cls, 'ACQUISITION');
  assert.equal(classifyDelisting(f, '2021-10-10').cls, 'UNKNOWN'); // ausserhalb des Fensters
  assert.equal(classifyDelisting({ form: ['NT 10-K', '15-12G'], filingDate: ['2018-03-01', '2018-04-01'] }, '2018-04-01').cls, 'UNKNOWN');
});

test('R13-D2 S1C bucht Übernahmen zum letzten Kurs (Fall SYNT: 40,99 USD bei Barangebot 41 USD), sonst −30 %', () => {
  const syn = { lastClose: 40.99, distress: false, delistClass: 'ACQUISITION' };
  assert.equal(SCENARIOS.S1_MINUS_30(syn), 40.99 * 0.7); // bisherige Annahme: Verlust trotz Barübernahme
  assert.ok(Math.abs(SCENARIOS.S1C_CLASSIFIED(syn, 0.001) - 40.99 * 0.999) < 1e-9);
  assert.equal(SCENARIOS.S1C_CLASSIFIED({ lastClose: 5, distress: false, delistClass: 'UNKNOWN' }, 0.001), 3.5);
  assert.equal(SCENARIOS.S2C_CLASSIFIED({ lastClose: 0.5, distress: true, delistClass: 'UNKNOWN' }, 0.001), 0);
});

const cal = ['2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05', '2024-01-08'];
const mk = (id, entry, exitDate, exitPx, extra = {}) => ({ id, listingId: id, entry: { date: entry, price: 10 }, initialStop: 9, exits: exitDate ? [{ date: exitDate, price: exitPx, fraction: 1, ruleId: 'X' }] : [], terminal: null,
  marks: new Map(cal.filter((d) => d >= entry).map((d, i) => [d, 10 + i])), divs: new Map([['2024-01-04', 0.5]]), ...extra });

test('R13-C1 Zweite Buchung stimmt mit dem Portfoliomodul überein (Dividende, Teilverkauf, Delisting)', () => {
  const partial = mk('B', '2024-01-02', null, null, { exits: [{ date: '2024-01-03', price: 11, fraction: 0.5, ruleId: 'P' }, { date: '2024-01-08', price: 12, fraction: 0.5, ruleId: 'Q' }] });
  const del = mk('C', '2024-01-03', null, null, { terminal: { date: '2024-01-05', lastClose: 8, distress: false, kind: 'DELISTED', delistClass: 'ACQUISITION' } });
  const trades = [mk('A', '2024-01-02', '2024-01-05', 12), partial, del];
  const cfg = { initialEquity: 100000, riskPerTrade: 0.01, maxPositionPct: 0.2, maxPositions: 5, maxExposure: 1 };
  const run = runPortfolioTR(trades, cal, cfg, { scenario: 'S1C_CLASSIFIED' });
  const r = replay(run, cal, cfg, { scenarioFn: SCENARIOS.S1C_CLASSIFIED });
  assert.ok(r.maxRelDiff < 1e-12, String(r.maxRelDiff));
});

test('R13-B1 Invarianten erkennen Kurse außerhalb der Tagesspanne und unvollständige Ausstiege', () => {
  const ctx = { bars: { date: cal, high: [11, 11, 11, 11, 11], low: [9, 9, 9, 9, 9], close: [10, 10, 10, 10, 10] } };
  assert.deepEqual(invariants({ entry: { date: '2024-01-02', price: 10 }, exits: [{ date: '2024-01-03', price: 9.5, fraction: 1, ruleId: 'X' }] }, ctx, { delisted: false }), []);
  assert.ok(invariants({ entry: { date: '2024-01-02', price: 12 }, exits: [{ date: '2024-01-03', price: 9.5, fraction: 0.5, ruleId: 'X' }] }, ctx, { delisted: false }).includes('ENTRY_OUTSIDE_RANGE'));
  assert.ok(invariants({ entry: { date: '2024-01-02', price: 10 }, exits: [{ date: '2024-01-03', price: 9.5, fraction: 0.5, ruleId: 'X' }] }, ctx, { delisted: false }).includes('FRACTIONS_NOT_ONE'));
});

test('R13-F2 Gegenprobe Halten: gleicher Einstieg, Verkauf nach N Sitzungen, keine Überlappung', () => {
  const d = Array.from({ length: 10 }, (_, i) => `2024-02-${String(i + 1).padStart(2, '0')}`);
  const ctx = { bars: { date: d, close: d.map((_, i) => 10 + i) }, divAdj: d.map(() => 0), raw: { close: d.map(() => 10) } };
  const t = (e) => ({ id: e, entry: { date: e, price: 10 }, exits: [{ date: d[d.indexOf(e) + 1], price: 10, fraction: 1 }] });
  const h = holdTrades([t(d[0]), t(d[2]), t(d[5])], ctx, { delisted: false }, 4);
  assert.equal(h.length, 2); // d[2] liegt innerhalb der ersten Haltedauer
  assert.equal(h[0].exits[0].date, d[4]); assert.equal(h[0].exits[0].ruleId, 'G2-HOLD126');
});
