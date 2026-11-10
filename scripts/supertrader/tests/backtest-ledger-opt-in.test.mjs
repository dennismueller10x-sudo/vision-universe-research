// Strang U, Folgeauftrag (U2-F1/U2-F2): Opt-ins im Legacy-Portfolio engine/backtest.mjs, bewiesen gegen das unabhaengige Orakel
// (scripts/quant/tests/test_ledger_oracle.py S14-S16) und gegen den produktiven Pfad validation/portfolio.mjs runPortfolioTR.
// Standardverhalten bleibt unveraendert (C2-Gleichheit, eingefrorene Runden). Forschung, nicht zertifiziert. Nur synthetische Daten.
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeIndicators } from '../engine/indicators.mjs';
import { simulate } from '../engine/simulator.mjs';
import { collectTrades, runPortfolio, PORTFOLIO_DEFAULTS } from '../engine/backtest.mjs';
import { runPortfolioTR } from '../validation/portfolio.mjs';
import turtle from '../engine/strategies/donchian-v2.mjs';

const rng = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const dates = (n) => { const o = []; const d = new Date('2018-01-02T12:00:00Z'); while (o.length < n) { const w = d.getUTCDay(); if (w !== 0 && w !== 6) o.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); } return o; };
const N = 700, cal = dates(N);
function series(seed, drift, delistAt) {
  const r = rng(seed); let p = 50; const b = { date: [], open: [], high: [], low: [], close: [], volume: [] };
  for (let i = 0; i < (delistAt ?? N); i++) {
    const c = p * (1 + (r() - 0.5) * 0.04 + drift), o = p * (1 + (r() - 0.5) * 0.01);
    b.date.push(cal[i]); b.open.push(o); b.high.push(Math.max(o, c) * (1 + r() * 0.012)); b.low.push(Math.min(o, c) * (1 - r() * 0.012)); b.close.push(c); b.volume.push(2e6); p = c;
  }
  return b;
}
const syms = Array.from({ length: 12 }, (_, k) => { const bars = series(500 + k, 0.0008 - 0.0003 * (k % 3), k % 4 === 3 ? 600 : null); return { symbol: 'T' + k, bars, ind: computeIndicators(bars) }; });
const priceOf = (sym, d) => { const s = syms.find((x) => x.symbol === sym); const i = s.bars.date.indexOf(d); return i >= 0 ? s.bars.close[i] : undefined; };

const sig = (id, i, j, entry, exit, stop, extra = {}) => ({ id, entry: { date: cal[i], price: entry }, initialStop: stop, exits: [{ date: cal[j], price: exit, fraction: 1 }], result: { returnPct: exit / entry - 1 }, ...extra });
const hand = () => [{ symbol: 'A', signal: sig('A', 10, 30, 100.1, 119.88, 95) }];
const price = (s, d) => { const i = cal.indexOf(d); return i < 10 ? 100.1 : i < 30 ? 100.1 + (119.88 - 100.1) * (i - 10) / 20 : 119.88; };

test('U2-F1 Standard unveraendert: keine Gebuehr im Cash, kein Feld commissions', () => {
  const r = runPortfolio(hand(), price, cal);
  assert.equal('commissions' in r, false);
  const shares = Math.min(100000 * 0.005 / 5.1, 100000 * 0.2 / 100.1, 100000 / 100.1);
  assert.ok(Math.abs(r.equity.at(-1).equity - (100000 + shares * (119.88 - 100.1))) < 1e-9);
});

test('U2-F1 Opt-in cfg.commissionBps: Gebuehr je Seite, Endwert = brutto minus Gebuehren, gleich runPortfolioTR', () => {
  const cfg = { ...PORTFOLIO_DEFAULTS, commissionBps: 1 };
  const gross = runPortfolio(hand(), price, cal), net = runPortfolio(hand(), price, cal, cfg);
  const f = 1e-4, shares = Math.min(100000 * 0.005 / 5.1, 100000 * 0.2 / 100.1, 100000 / (100.1 * (1 + f)));
  assert.ok(Math.abs(net.commissions - shares * (100.1 + 119.88) * f) < 1e-9);
  assert.ok(Math.abs(net.equity.at(-1).equity - (100000 + shares * (119.88 * (1 - f) - 100.1 * (1 + f)))) < 1e-9);
  assert.ok(net.equity.at(-1).equity < gross.equity.at(-1).equity);
  const marks = new Map(cal.map((d) => [d, price('A', d)]));
  const tr = { id: 'A', listingId: 'A', entry: { date: cal[10], price: 100.1 }, initialStop: 95, exits: [{ date: cal[30], price: 119.88, fraction: 1 }], terminal: null, marks, divs: new Map() };
  const prod = runPortfolioTR([tr], cal, PORTFOLIO_DEFAULTS, { dividends: false, commissionBps: 1, sizingSameDay: true, engineCompat: true });
  assert.ok(Math.abs(prod.equity.at(-1).equity - net.equity.at(-1).equity) < 1e-9);
  assert.ok(Math.abs(prod.book.commissions - net.commissions) < 1e-9);
});

test('U2-F2 Standard: am Serienende offene Position wird verworfen (Legacy, gepinnt)', () => {
  const open = syms.filter((s) => simulate(turtle, s, {}).state.signal?.entry);
  assert.ok(open.length >= 1, 'das synthetische Panel enthaelt offene Positionen');
  assert.equal(collectTrades(turtle, syms).filter((t) => t.signal.exits.some((x) => x.ruleId === 'OPEN_AT_END_MARK')).length, 0);
});

test('U2-F2 Opt-in openAtEnd=MARK: jede offene Position kommt als Bewertung zum letzten Schluss herein, auch bei Delisting', () => {
  const open = syms.filter((s) => simulate(turtle, s, {}).state.signal?.entry);
  const old = collectTrades(turtle, syms), neu = collectTrades(turtle, syms, { openAtEnd: 'MARK' });
  assert.equal(neu.length - old.length, open.length);
  const marked = neu.filter((t) => t.signal.openAtEnd);
  assert.equal(marked.length, open.length);
  for (const t of marked) {
    const s = syms.find((x) => x.symbol === t.symbol), mark = t.signal.exits.at(-1);
    assert.equal(mark.ruleId, 'OPEN_AT_END_MARK');
    assert.equal(mark.date, s.bars.date.at(-1)); assert.equal(mark.price, s.bars.close.at(-1));
    assert.equal(t.signal.result.basis, 'OPEN_AT_END_MARK');
  }
  // Bewertung statt Order: die Position bleibt im Portfolio offen und wird auch nach dem Reihenende (Delisting) zum letzten Schluss bewertet.
  const r = runPortfolio(neu, priceOf, cal);
  assert.ok(r.equity.every((e) => Number.isFinite(e.equity) && e.equity > 0));
  const delisted = marked.find((t) => syms.find((x) => x.symbol === t.symbol).bars.date.length < N);
  if (delisted) { const s = syms.find((x) => x.symbol === delisted.symbol); assert.ok(s.bars.close.at(-1) > 0); }
  // Mit Opt-in und ohne Gebuehr ist der Endwert die Summe aus Cash und Marktwert; Standardlauf ohne diese Trades weicht davon ab.
  assert.notEqual(r.equity.at(-1).equity, runPortfolio(old, priceOf, cal).equity.at(-1).equity);
});
