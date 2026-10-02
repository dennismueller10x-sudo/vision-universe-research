// Interner Datentest, Teil 2 (Momentum, Weinstein, Darvas, Minervini): reine Bausteine ohne Netz.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { rawGate, percentilesInPlace, segCtx, tradesFor, verifyGeneric, judge, ENGINES, PREREG_METHODS } from '../validation/analyze-methods.mjs';
import { percentileRanks, isoWeekKey } from '../engine/indicators.mjs';
import weinstein from '../engine/strategies/weinstein.mjs';
import kk from '../engine/strategies/kk-breakout.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');

function tradingDays(from, n) {
  const out = []; const d = new Date(from + 'T00:00:00Z');
  while (out.length < n) { const w = d.getUTCDay(); if (w !== 0 && w !== 6) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
// Lange Seitwaertsbasis, dann Ausbruch mit Volumen, Trend, Abschwung.
function synth(n, { base = 40, seed = 11, vol = 2e6 } = {}) {
  const dates = tradingDays('2015-06-01', n);
  let s = seed; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 - 0.5; };
  let p = base; const bars = [];
  for (let i = 0; i < n; i++) {
    const drift = i < 200 ? (i < 120 ? -0.002 : 0) : i < 330 ? 0.006 : i < 380 ? -0.01 : 0.001;
    p *= 1 + drift + rnd() * 0.012;
    const v = vol * (i >= 200 && i < 215 ? 3 : 1) * (1 + rnd() * 0.3);
    bars.push({ date: dates[i], open: p * (1 + rnd() * 0.004), high: p * 1.015, low: p * 0.985, close: p, volume: v, adjClose: null, dividend: 0, splitFactor: 1 });
  }
  return bars;
}
function bench(n) { const m = new Map(); for (const d of tradingDays('2015-06-01', n)) m.set(isoWeekKey(d), 100); return { byWeek: m }; }

test('VM-1 Praeregistrierung der vier Methoden: eingefroren, Live-Versionen, Minervini-Ausstieg als VU gekennzeichnet', () => {
  const p = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/supertrader/validation/PREREGISTRATION-METHODS.json'), 'utf8'));
  assert.equal(p.schema, PREREG_METHODS);
  assert.equal(p.status, 'FROZEN_BEFORE_RUN');
  assert.deepEqual(p.methods.map((m) => [m.strategyId, m.version]), ENGINES.map((e) => [e.id, e.version]));
  const mv = p.methods.find((m) => m.strategyId === 'MINERVINI_VCP');
  assert.match(mv.provenance, /keine geprüfte Minervini-Originalregel/);
  assert.equal(p.acceptance.robustPositiveRequires.length, 4);
});

test('VM-2 Rohkursgrenze greift nicht in Wochenstrategien an Tagen ohne Wochenentscheidung ein', () => {
  const g = rawGate(weinstein);
  const ctx = { raw: { close: [1, 1] } };
  const base = { ...weinstein, scan: () => undefined, PARAMS: weinstein.PARAMS };
  assert.equal(rawGate(base).scan(ctx, 0, null), undefined, 'kein Wochenende: keine Entscheidung');
  const yes = { ...weinstein, scan: () => ({ stage: 'SETUP' }), PARAMS: weinstein.PARAMS };
  assert.equal(rawGate(yes).scan(ctx, 0, null), null, 'Rohkurs 1 USD < 5 USD');
  assert.deepEqual(rawGate(yes).scan({ raw: { close: [12] } }, 0, null), { stage: 'SETUP' });
  void g;
});

test('VM-3 Perzentile identisch zu indicators.percentileRanks (Mittelrang bei Gleichstand)', () => {
  const vals = [0.1, -0.2, 0.1, 0.5, 0.3, -0.2, 0.0];
  const ref = percentileRanks(vals.map((v, i) => ({ key: i, value: v })));
  const got = new Map();
  percentilesInPlace(Float64Array.from(vals), vals.map((_, i) => i), (id, r) => got.set(id, r));
  for (let i = 0; i < vals.length; i++) assert.equal(got.get(i), ref.get(i));
});

test('VM-4 Alle vier Engines laufen auf Point-in-Time-Segmenten (Wochenreihe inklusive); erzeugte Trades halten C3m', () => {
  const n = 900;
  const dates = tradingDays('2015-01-02', n);
  const wk = new Map(); for (const d of dates) wk.set(isoWeekKey(d), 100);
  let total = 0, checked = 0;
  for (let k = 1; k <= 40; k++) {
    let s = k * 7919; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 - 0.5; };
    let p = 30, mu = 0; const raw = [];
    for (let i = 0; i < n; i++) {
      if (i % 60 === 0) mu = rnd() * 0.008;
      p *= 1 + mu + rnd() * 0.05; const o = p * (1 + rnd() * 0.01);
      raw.push({ date: dates[i], open: o, high: Math.max(o, p) * (1 + Math.abs(rnd()) * 0.02), low: Math.min(o, p) * (1 - Math.abs(rnd()) * 0.02), close: p, volume: 2e6 * (1 + Math.abs(rnd()) * 3), adjClose: null, dividend: 0, splitFactor: 1 });
    }
    const seg = { id: 'tiingo:NYSE:S' + k + ':2015-01-02', raw, delisted: false, survivor: true, cross: { mom21: new Array(n).fill(99.5), mom63: new Array(n).fill(99.5), mom126: new Array(n).fill(99), rs: new Array(n).fill(99) } };
    const ctx = segCtx(seg, { byWeek: wk });
    assert.ok(ctx.weekly && ctx.weekAt.some((x) => x !== null), 'Wochenreihe aus Tagesbalken');
    for (const e of ENGINES) {
      const trades = tradesFor(e, seg, ctx);
      total += trades.length;
      for (const t of trades.filter((x) => !x.terminal)) { checked++; const v = verifyGeneric(t, ctx, e); assert.ok(v.ok, e.id + ' ' + JSON.stringify(v)); }
    }
  }
  assert.ok(total >= 1 && checked >= 1, 'mindestens ein geprüfter Trade');
});

test('VM-5 Delisting mitten in einer Position: offene Rest-Position wird als DELISTED abgeschlossen, nie verschwiegen', () => {
  const n = 300;
  const raw = synth(n).slice(0, 235);
  const seg = { id: 'tiingo:NYSE:DEL:2015-01-02', raw, delisted: true, survivor: false, cross: { mom21: new Array(n).fill(99.5), mom63: new Array(n).fill(99.5), mom126: new Array(n).fill(99), rs: new Array(n).fill(99) } };
  const ctx = segCtx(seg, bench(n));
  const trades = tradesFor(kk, seg, ctx);
  for (const t of trades.filter((x) => x.terminal)) { assert.equal(t.terminal.kind, 'DELISTED'); assert.equal(t.terminal.date, raw[raw.length - 1].date); }
});

test('VM-6 Entscheidungsregel: R1-R4 positiv, robust negativ, sonst nicht belastbar', () => {
  const sub = (a, b) => [{ excess: a }, { excess: b }];
  const pos = { S0_LAST_PRICE: { excessCagr: 0.02, subperiods: sub(0.01, 0.01) }, S1_MINUS_30: { excessCagr: 0.01, subperiods: sub(0.01, 0.02) }, S2_DISTRESS_ZERO: { excessCagr: 0.01 }, COST2_S1: { excessCagr: 0.005 }, SEEDS_S1: Array.from({ length: 20 }, (_, i) => ({ excessCagr: i < 17 ? 0.01 : -0.01 })) };
  assert.equal(judge(pos).verdict, 'ROBUST_POSITIVE');
  assert.equal(judge(pos).evidence, 'CRITERIA_MET');
  const neg = { S0_LAST_PRICE: { excessCagr: -0.05, subperiods: sub(-0.02, -0.07) }, S1_MINUS_30: { excessCagr: -0.06, subperiods: sub(-0.03, -0.08) }, S2_DISTRESS_ZERO: { excessCagr: -0.06 }, COST2_S1: { excessCagr: -0.08 }, SEEDS_S1: [] };
  assert.equal(judge(neg).verdict, 'ROBUST_NEGATIVE');
  assert.equal(judge(neg).evidence, 'TESTED_NO_EDGE');
  const mixed = { ...neg, S0_LAST_PRICE: { excessCagr: 0.01, subperiods: sub(0.03, -0.01) } };
  assert.equal(judge(mixed).verdict, 'NOT_ROBUST');
  assert.equal(judge(mixed).evidence, 'TESTED_NO_EDGE');
});
