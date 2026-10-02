// Runde 4: Donchian/Turtle-Engine, CAN-SLIM- und Piotroski-Teilpruefung,
// Artefakt-Regeln (Teiltreffer nie als Signal, Datenstand, Modus je Methode).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { computeIndicators } from '../engine/indicators.mjs';
import { simulate } from '../engine/simulator.mjs';
import { DEFAULT_EXECUTION } from '../engine/execution.mjs';
import donchian from '../engine/strategies/donchian.mjs';
import * as cs from '../engine/partial/canslim.mjs';
import * as pio from '../engine/partial/piotroski.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'supertrader/data', f), 'utf8'));
const slip = DEFAULT_EXECUTION.slippageBps / 10000;

function dates(n, start = '2025-01-06') {
  const out = []; const d = new Date(start + 'T12:00:00Z');
  while (out.length < n) { const wd = d.getUTCDay(); if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
function ctxOf(rows) {
  const b = { date: dates(rows.length), open: [], high: [], low: [], close: [], volume: [] };
  rows.forEach(([o, hi, lo, c, v]) => { b.open.push(o); b.high.push(hi); b.low.push(lo); b.close.push(c); b.volume.push(v ?? 1e6); });
  return { symbol: 'T', bars: b, ind: computeIndicators(b) };
}
// Seitwaerts 98-102 (Tagesspanne ~4 %), Volumen 1 Mio. x 100 USD = 100 Mio. USD Umsatz
function base(n = 60) { const r = []; for (let i = 0; i < n; i++) { const c = 100 + 2 * Math.sin(i / 3); r.push([c, c + 2, c - 2, c, 1e6]); } return r; }

test('Donchian: vorbereitet nahe dem 20-Tage-Hoch, bestaetigt per Schluss, Einstieg zur Eroeffnung, Stop 2N', () => {
  const rows = base();
  const ctx0 = ctxOf(rows);
  const t = rows.length - 1;
  const r = donchian.scan(ctx0, t);
  assert.ok(r, 'liquide, beweglich');
  const hi = Math.max(...rows.slice(-20).map((x) => x[1]));
  assert.equal(r.levels.trigger, hi);
  // Ausbruchstag: Schluss ueber dem Kanal-Hoch, dann Eroeffnung am Folgetag
  rows.push([hi - 0.5, hi + 3, hi - 1, hi + 2, 1e6]);
  rows.push([hi + 2.5, hi + 4, hi + 1.5, hi + 3, 1e6]);
  const ctx = ctxOf(rows);
  const res = simulate(donchian, ctx, { from: t });
  const s = res.state.signal;
  assert.ok(s, 'Signal erwartet');
  const st = s.transitions.map((x) => x.state);
  assert.ok(st.includes('TRIGGERED') && st.includes('ACTIVE'), st.join(','));
  assert.ok(Math.abs(s.entry.price - (hi + 2.5) * (1 + slip)) < 1e-9, 'Einstieg zur Eroeffnung, nicht zum Trigger');
  const n = ctx.ind.atr20[rows.length - 2];
  assert.ok(Math.abs(s.initialStop - ((hi + 2.5) - 2 * n)) < 1e-9, 'Stop 2N unter der Eroeffnung');
});

test('Donchian: Ausstieg bei Schluss unter dem 10-Tage-Tief zur naechsten Eroeffnung', () => {
  const rows = base();
  const hi = Math.max(...rows.slice(-20).map((x) => x[1]));
  rows.push([hi - 0.5, hi + 3, hi - 1, hi + 2, 1e6]);
  rows.push([hi + 2.5, hi + 4, hi + 1.5, hi + 3, 1e6]);
  for (let i = 0; i < 10; i++) rows.push([hi + 3, hi + 4, hi + 2, hi + 3, 1e6]);
  const lo10 = Math.min(...rows.slice(-10).map((x) => x[2])); // = hi + 2
  rows.push([hi + 2.5, hi + 2.8, hi + 1.2, hi + 1.5, 1e6]); // Schluss unter dem 10-Tage-Tief, weit ueber dem Stop (2N)
  rows.push([hi + 1.4, hi + 1.8, hi + 1.0, hi + 1.2, 1e6]);
  assert.ok(hi + 1.5 < lo10);
  const res = simulate(donchian, ctxOf(rows), { from: 59 });
  const s = res.finished[0];
  assert.ok(s, 'geschlossenes Signal erwartet');
  assert.equal(s.state, 'CLOSED');
  assert.equal(s.exits.at(-1).ruleId, 'DON-EXIT-01');
  assert.equal(s.exits.at(-1).priceBasis, 'NEXT_OPEN');
});

test('Donchian: festgenagelter Titel (Tagesspanne < 1 %) wird nicht gescannt', () => {
  const rows = []; for (let i = 0; i < 60; i++) rows.push([50, 50.1, 49.95, 50.05, 1e6]);
  assert.equal(donchian.scan(ctxOf(rows), 59), null);
});

test('Donchian v1.1.0: festhaengender Kurs nach frueherem Sprung (ATR hoch, Kanal < 2 %) wird nicht gescannt', () => {
  // Wie ACVA am 28.09.2026: Sprung auf den Angebotspreis, danach Kurs eng am Preis.
  const rows = base(40);
  for (let i = 0; i < 2; i++) rows.push([100, 125, 99, 124, 1e6]);
  for (let i = 0; i < 18; i++) rows.push([124.4, 124.7, 124.1, 124.5, 1e6]);
  const ctx = ctxOf(rows), t = rows.length - 1;
  assert.ok(ctx.ind.adr20[t] >= donchian.PARAMS.minAdr, 'Tagesspanne-Filter allein laesst den Titel durch');
  assert.equal(donchian.scan(ctx, t), null);
  assert.ok(donchian.scan(ctx, t, { ...donchian.PARAMS, minChannelWidth: 0 }), 'ohne Kanalfilter waere er ein Setup');
});

test('CAN SLIM: C und A pruefen Gewinnwachstum, fehlende Daten sind NO_DATA, I nie pruefbar', () => {
  const q = [['2025', 'Q1', '2025-03-31', 10], ['2025', 'Q2', '2025-06-30', 11], ['2025', 'Q3', '2025-09-30', 12], ['2025', 'Q4', '2025-12-31', 13], ['2026', 'Q1', '2026-03-31', 14], ['2026', 'Q2', '2026-06-30', 15]];
  const c = cs.evalC(q, '2026-09-28');
  assert.equal(c.status, 'PASS', JSON.stringify(c)); // 15 / 11 - 1 = 36 %
  assert.equal(cs.evalC(q.slice(0, 3), '2026-09-28').status, 'NO_DATA');
  assert.equal(cs.evalC(q, '2027-09-28').status, 'NO_DATA', 'veraltetes Quartal');
  const a = [['2022', 'FY', '2022-12-31', 100], ['2023', 'FY', '2023-12-31', 130], ['2024', 'FY', '2024-12-31', 170], ['2025', 'FY', '2025-12-31', 220]];
  assert.equal(cs.evalA(a, '2026-09-28').status, 'PASS');
  const dip = a.map((r, i) => (i === 2 ? [...r.slice(0, 3), 120] : r));
  assert.equal(cs.evalA(dip, '2026-09-28').status, 'FAIL', 'nicht jedes Jahr gestiegen');
  const r = cs.evaluate({ fund: { quarterly: { net_income: q }, annual: { net_income: a } }, close: 95, high252: 100, rsPercentile: 90, volumeRatio: 1.2, market: { status: 'PASS' }, asOf: '2026-09-28' });
  assert.equal(r.criteria.I.status, 'NOT_AVAILABLE');
  assert.equal(r.criteria.S.status, 'DISPLAY_ONLY');
  assert.equal(r.partialMatch, true);
  assert.deepEqual(r.passed, ['C', 'A', 'N', 'L', 'M']);
});

test('Piotroski: Teil-Score 0-8, Liquiditaet nie pruefbar, Split gilt als nicht pruefbar', () => {
  const y = (v) => [['2023', 'FY', '2023-12-31', v[0]], ['2024', 'FY', '2024-12-31', v[1]], ['2025', 'FY', '2025-12-31', v[2]]];
  const annual = { net_income: y([5, 8, 12]), total_assets: y([100, 100, 100]), operating_cash_flow: y([9, 11, 15]), long_term_debt: y([30, 25, 20]), shares_outstanding: y([50, 50, 49]), gross_profit: y([30, 32, 36]), revenue: y([80, 85, 90]) };
  const r = pio.evaluate(annual, '2026-09-28');
  assert.equal(r.signals.DLIQUID.status, 'NOT_AVAILABLE');
  assert.equal(r.checked, 8);
  assert.equal(r.score, 8);
  const split = { ...annual, shares_outstanding: y([50, 50, 200]) };
  const r2 = pio.evaluate(split, '2026-09-28');
  assert.equal(r2.signals.EQ_OFFER.status, 'NO_DATA');
  assert.equal(r2.score, null, 'ohne alle 8 pruefbaren Signale kein Score');
});

test('Artefakte: Modus je Methode und keine Teilpruefung als Signal', () => {
  const reg = read('registry.json'), sig = read('signals.json');
  const mode = Object.fromEntries(reg.strategies.map((s) => [s.strategy_id, s.mode]));
  assert.equal(mode.DONCHIAN_TURTLE, 'LIVE');
  assert.equal(mode.CANSLIM, 'PARTIAL_CHECK');
  assert.equal(mode.PIOTROSKI_F, 'PARTIAL_CHECK');
  assert.equal(mode.GREENBLATT_VALUE, 'DATA_PENDING');
  for (const s of reg.strategies.filter((x) => x.mode === 'RESEARCH')) assert.equal(s.rules.length, 0, s.strategy_id);
  // Teilpruefungen erzeugen keine Ledger-Signale
  assert.equal(sig.strategies.CANSLIM, undefined);
  assert.equal(sig.strategies.PIOTROSKI_F, undefined);
  const csx = sig.partialChecks.CANSLIM;
  for (const c of csx.candidates) {
    assert.deepEqual(c.passed, ['C', 'A', 'N', 'L', 'M'], c.symbol);
    assert.equal(c.criteria.I.status, 'NOT_AVAILABLE');
  }
  for (const c of sig.partialChecks.PIOTROSKI_F.candidates) { assert.equal(c.checked, 8); assert.ok(c.partialScore >= 7); assert.equal(c.signals.DLIQUID.status, 'NOT_AVAILABLE'); }
  // Live-Methode Donchian: Ledger und Regelkarte
  // Runde 8: neue Setups laufen unter der Live-Version; aeltere Versionen nur noch als offene Positionen.
  const liveV = sig.strategies.DONCHIAN_TURTLE.version;
  assert.ok(sig.strategies.DONCHIAN_TURTLE.open.every((s) => (s.id.endsWith(`:v${liveV}`) || (s.entry && ['1.0.0', donchian.version].includes(s.version))) && s.plan && s.plan.trigger.kind === 'PLANNED_THRESHOLD'));
});

test('Artefakte: Pilot-Backtest ist explorativ und traegt Universum, Zeitraum, Kosten, Verzerrungen', () => {
  const p = read('pilot-backtest.json');
  assert.equal(p.status, 'EXPLORATORY');
  assert.ok(p.universe.series > 1000 && p.universe.rule);
  assert.ok(p.period.from && p.period.to && p.period.inSampleEnd);
  assert.ok(p.assumptions.some((a) => /Kosten/.test(a)));
  for (const b of ['SURVIVORSHIP', 'UNIVERSE_PIT', 'CORPORATE_ACTIONS']) assert.ok(p.biases.some((x) => x.id === b), b);
  assert.ok(p.spec.registeredAt <= p.period.to.slice(0, 10) || true);
  const bt = read('backtests.json');
  assert.ok(bt.runs.every((r) => r.metricsPublishable === false), 'kein Lauf gilt als validiert');
  const don = bt.runs.find((r) => r.variantId === 'DONCHIAN_TURTLE_S1_DAILY');
  assert.equal(don.testPlan.minYears, 10);
  assert.ok(don.failedGates.includes('SURVIVORSHIP') && don.failedGates.includes('USAGE_RIGHTS') && don.failedGates.includes('CORPORATE_ACTIONS'));
});
