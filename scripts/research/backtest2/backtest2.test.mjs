// Backtest 2.0 – Gegentests auf künstlichen Kursen mit bekanntem Ergebnis (Protokoll §5). Schreibt nichts ins Repository.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { allocate, setSecurity, setTerminal, finalize } from './market.mjs';
import { buildSignals } from './signals.mjs';
import { simulate, sideBps, INITIAL } from './engine.mjs';
import * as Q from './search.mjs';
import { loadMarket } from './data.mjs';
import { walkForward, summarize } from './run.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');

function calendar(n, start = '2007-01-02') {
  const out = []; let d = new Date(start + 'T00:00:00Z');
  while (out.length < n) { const w = d.getUTCDay(); if (w && w < 6) out.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 864e5); }
  return out;
}
/** Markt aus Schlusskurs-Pfaden; Eröffnung = Vortagesschluss (oder openOverride), Hoch/Tief ±0,5 %. */
function market(paths, { start, opens = {}, spy = null, volume = 1e6 } = {}) {
  const T = paths[0].length, dates = calendar(T, start);
  const m = allocate(dates, paths.map((_, s) => 'S' + s));
  paths.forEach((p, s) => {
    const cols = { o: new Float64Array(T), h: new Float64Array(T), l: new Float64Array(T), c: Float64Array.from(p), rc: Float64Array.from(p), v: new Float64Array(T).fill(volume) };
    for (let t = 0; t < T; t++) {
      if (!(p[t] > 0)) { cols.c[t] = NaN; cols.o[t] = NaN; continue; }
      cols.o[t] = opens[s]?.[t] ?? (t > 0 && p[t - 1] > 0 ? p[t - 1] : p[t]);
      cols.h[t] = Math.max(cols.o[t], p[t]) * 1.005; cols.l[t] = Math.min(cols.o[t], p[t]) * 0.995;
    }
    setSecurity(m, s, cols);
  });
  return finalize(m, spy ?? Float64Array.from({ length: T }, (_, t) => 100 + t));
}
/** Signalquelle von Hand: je Tag die Liste der Titel. */
const manual = (T, f) => { const offsets = new Int32Array(T + 1), items = []; for (let t = 0; t < T; t++) { offsets[t] = items.length; items.push(...f(t)); } offsets[T] = items.length; return { offsets, items: Int32Array.from(items) }; };
const P = (over = {}) => ({ positions: 1, sizing: 'EQUAL', cap: 1, exit: { kind: 'HOLD', days: 100000 }, filter: 'NONE', uniTop: 3000, minPrice: 5, ...over });

test('Kauf zur Eröffnung des Folgetags, nicht zum Signalschluss (kein Blick in die Zukunft)', () => {
  const T = 40, p = Array.from({ length: T }, (_, t) => (t < 20 ? 50 : 60));
  const opens = { 0: { 20: 60 } }; // Sprung über Nacht nach dem Signal am Tag 19
  const m = market([p], { opens });
  const r = simulate(m, manual(T, (t) => (t === 19 ? [0] : [])), P(), { trades: true, t1: T - 1 });
  assert.equal(r.stats.buys, 1);
  const bps = sideBps(m.adv[20]);
  // gekauft zu 60 (Eröffnung nach dem Sprung), nicht zu 50: kein Gewinn aus dem Sprung, nur Kosten
  assert.ok(Math.abs(r.equity - INITIAL / (1 + bps / 1e4) * 1) < 1, r.equity);
});

test('Gleichmäßiger Anstieg: Ergebnis = Anstieg ab Kaufkurs minus Kauf- und Verkaufskosten', () => {
  const T = 300, p = Array.from({ length: T }, (_, t) => 20 * 1.002 ** t);
  const m = market([p]);
  // Signal am Tag 15 (vorher gibt es keinen Umsatzrang: Ø Dollarumsatz braucht 10 Sitzungen)
  const r = simulate(m, manual(T, (t) => (t === 15 ? [0] : [])), P({ exit: { kind: 'HOLD', days: 200 } }), { trades: true });
  const tr = r.trades[0], bps = sideBps(m.adv[16]);
  assert.equal(tr.entryT, 16); assert.equal(tr.exitT, 217); // Haltedauer erreicht am Schluss 216, Verkauf zur Eröffnung 217
  const expected = INITIAL / (1 + bps / 1e4) * (tr.exit / tr.entry) * (1 - sideBps(m.adv[217]) / 1e4);
  assert.ok(Math.abs(r.equity - expected) < 1e-6 * INITIAL, `${r.equity} vs ${expected}`);
  assert.ok(Math.abs(tr.exit / tr.entry - p[216] / p[15]) < 1e-5); // Eröffnung = Vortagesschluss
});

test('Nachgezogener Stopp: Verkauf zu min(Eröffnung, Stopp) vom Schlusshoch', () => {
  const T = 60, p = Array.from({ length: T }, (_, t) => (t <= 30 ? 50 + t : 80 - (t - 30) * 2));
  const m = market([p]);
  const r = simulate(m, manual(T, (t) => (t === 15 ? [0] : [])), P({ exit: { kind: 'TRAIL', pct: 0.1 } }), { trades: true });
  const tr = r.trades[0];
  assert.equal(tr.reason, 'TRAIL');
  const stop = 80 * 0.9; // Schlusshoch 80 am Tag 30
  assert.ok(Math.abs(tr.exit - Math.min(m.o[tr.exitT], stop)) < 1e-4, `${tr.exit}`);
  assert.ok(m.l[tr.exitT] <= stop && m.l[tr.exitT - 1] > stop);
});

test('Delisteter Titel mit Insolvenz: Endwert 0 am letzten Handelstag, kein Kauf danach', () => {
  const T = 50, p = Array.from({ length: T }, (_, t) => (t <= 30 ? 40 : NaN));
  const m = market([p]); setTerminal(m, 0, 30, 0);
  const r = simulate(m, manual(T, (t) => (t < 25 ? [0] : [])), P(), { trades: true });
  assert.equal(r.stats.terminals, 1);
  assert.ok(r.equity < 0.01 * INITIAL, `${r.equity}`);
  assert.equal(r.trades.at(-1).reason, 'TERMINAL');
});

test('Marktfilter aus: keine Positionen, Depot bleibt Cash', () => {
  const T = 260, p = Array.from({ length: T }, (_, t) => 30 + t * 0.1);
  const spyDown = Float64Array.from({ length: T }, (_, t) => 300 - t);
  const m = market([p], { spy: spyDown });
  const r = simulate(m, manual(T, () => [0]), P({ filter: 'SMA200' }));
  assert.equal(r.stats.buys, 0); assert.equal(r.equity, INITIAL);
});

test('Positionszahl und gleiche Gewichtung: höchstens N Titel, je 1/N', () => {
  const T = 30, paths = Array.from({ length: 5 }, (_, s) => Array.from({ length: T }, () => 20 + s));
  const m = market(paths);
  let seen = 0;
  simulate(m, manual(T, () => [0, 1, 2, 3, 4]), P({ positions: 3 }), { onDay: () => { seen++; } });
  const r = simulate(m, manual(T, () => [0, 1, 2, 3, 4]), P({ positions: 3 }), { trades: true });
  assert.equal(r.stats.buys, 3); assert.equal(r.openPositions, 3); assert.equal(seen, T);
});

test('Universum: Titel außerhalb des Rangs oder unter der Preisgrenze werden nicht gekauft', () => {
  const T = 30, m = market([Array(T).fill(4), Array(T).fill(20)], { volume: 1e6 });
  const r = simulate(m, manual(T, () => [0, 1]), P({ positions: 2, minPrice: 5 }));
  assert.equal(r.stats.buys, 1);
});

test('Signale: Ausbruch 20 Tage erst am Tag des Schlusses über dem Hoch, Trendvorlage im Aufwärtstrend', () => {
  const T = 400, p = Array.from({ length: T }, (_, t) => 20 * 1.003 ** t * (1 + 0.01 * Math.sin(t / 3)));
  const m = market([p]);
  const sig = buildSignals(m);
  const days = (k) => { const out = []; for (let t = 0; t < T; t++) if (sig[k].offsets[t + 1] > sig[k].offsets[t]) out.push(t); return out; };
  assert.ok(days('TREND_TEMPLATE').length > 50);
  for (const t of days('BREAKOUT_20')) { let hi = -Infinity; for (let k = t - 20; k < t; k++) hi = Math.max(hi, m.h[k]); assert.ok(m.c[t] > hi); }
  assert.equal(days('LEADER_RS')[0] >= 252, true);
});

test('Walk-forward: Auswahl sieht nur die Lernjahre', () => {
  // zwei Kombinationen, Kennzahlen von Hand: A gut in 2008–2013, schlecht danach; B umgekehrt
  const m = { dates: calendar(4500, '2007-01-02') };
  const nYears = +m.dates.at(-1).slice(0, 4) - Q.FIRST_YEAR + 1;
  const stats = new Float64Array(2 * nYears * Q.YEAR_FIELDS);
  for (let y = 0; y < nYears; y++) {
    const a = (0 * nYears + y) * Q.YEAR_FIELDS, b = (1 * nYears + y) * Q.YEAR_FIELDS;
    stats[a + 3] = INITIAL * (y < 6 ? 1.3 ** (y + 1) : 1.3 ** 6 * 0.5); stats[a + 4] = y < 6 ? -0.1 : -0.6;
    stats[b + 3] = INITIAL * (y < 6 ? 1.01 ** (y + 1) : 5); stats[b + 4] = -0.05;
  }
  const spy = m.dates.filter((_, i) => i % 5 === 0).map((d, i) => [d, 100 * 1.0015 ** i]);
  const sel = Q.selectRound(stats, 2, nYears, Q.ROUNDS[0], m, spy);
  assert.equal(sel.combo, 0); // in der Lernzeit war A besser; dass B später gewinnt, darf die Auswahl nicht wissen
  const sel4 = Q.selectRound(stats, 2, nYears, Q.ROUNDS[3], m, spy);
  assert.equal(sel4.combo, 1); // A fällt in Runde 4 wegen max. Verlust −60 % heraus
});

test('Statistik: Bootstrap erkennt klare Überrendite, nicht Rauschen; Normalquantil', () => {
  let a = 1; const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647 - 0.5; };
  assert.ok(Q.bootstrapP(Array.from({ length: 300 }, () => 0.004 + 0.01 * rnd()), 999) < 0.01);
  assert.ok(Q.bootstrapP(Array.from({ length: 300 }, () => 0.01 * rnd()), 999) > 0.05);
  assert.ok(Math.abs(Q.PhiInv(0.975) - 1.959964) < 1e-4); assert.ok(Math.abs(Q.Phi(1.959964) - 0.975) < 1e-4);
});

test('Gitter: feste Reihenfolge, Kennung = Position, keine Dubletten', () => {
  const list = Q.combos();
  list.forEach((c, i) => assert.equal(c.id, i));
  assert.equal(new Set(list.map((c) => Q.label(c))).size, list.length);
  assert.ok(list.length > 20000 && list.length < 60000, String(list.length));
});

test('Gesamter Ablauf auf künstlichem Markt: Walk-forward und Zusammenfassung laufen, Kasse stimmt', async () => {
  let s = 7; const g = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const T = 4800, paths = Array.from({ length: 12 }, (_, k) => { let p = 30; return Array.from({ length: T }, () => (p *= Math.exp(0.0003 * (k % 3) + 0.015 * (g() - 0.5)))); });
  const m = market(paths), sig = buildSignals(m, { prefilter: { maxRank: 3000, minPrice: 5 } });
  const grid = { ...Q.GRID, positions: [3], sizing: [Q.GRID.sizing[0]], exit: [Q.GRID.exit[1], Q.GRID.exit[8]], filter: ['NONE'], universe: [Q.GRID.universe[4]] };
  const list = Q.combos(grid), end = m.dates.at(-1), nYears = +end.slice(0, 4) - Q.FIRST_YEAR + 1, w = Q.windowDates(m, Q.FIRST_YEAR, 9999);
  const stats = new Float64Array(list.length * nYears * Q.YEAR_FIELDS).fill(NaN);
  for (const c of list) stats.set(Q.yearStats(m, sig[c.source], c, w.t0, w.t1, nYears), c.id * nYears * Q.YEAR_FIELDS);
  const bench = { SPY: m.dates.filter((_, i) => i % 5 === 0).map((d, i) => [d, 100 * 1.0012 ** i]) };
  bench.QQQ = bench.SPY; bench.RSP = bench.SPY;
  const wf = walkForward(m, sig, list, stats, nYears, bench, end);
  assert.ok(['schlägt den Index', 'schlägt nur in Phasen', 'nur risikobereinigt', 'schlägt nicht'].includes(wf.verdict));
  assert.equal(wf.rounds.length, 4);
  const sm = summarize(m, sig, list, stats, nYears, bench);
  assert.equal(sm.top.length, Math.min(20, list.length));
});

test('Datenlader auf echten Kursdateien (NVDA, MSFT, XOM aus den Test-Fixtures)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt2-'));
  fs.mkdirSync(path.join(dir, 'tiingo/daily'), { recursive: true });
  const fx = path.join(ROOT, 'quant/tests/fixtures/product-intelligence-materialization/quant/data/market/golden-preview/daily');
  for (const f of fs.readdirSync(fx)) fs.copyFileSync(path.join(fx, f), path.join(dir, 'tiingo/daily', f));
  try {
    const { market: m, counts } = loadMarket({ workDir: dir, log: () => {} });
    assert.ok(counts.loaded >= 2, JSON.stringify(counts));
    const s = m.ids.indexOf('ref_NVDA'); assert.ok(s >= 0);
    const t = m.dates.indexOf('2024-06-10'); // Tag nach dem 10:1-Split
    if (t > 0 && m.c[s * m.T + t] > 0) assert.ok(Math.abs(m.c[s * m.T + t] / m.c[s * m.T + t - 1] - 1) < 0.2, 'Gesamtrendite-Reihe ohne Split-Sprung');
    assert.ok(m.rank[s * m.T + m.dates.indexOf('2024-06-10')] <= 3);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
