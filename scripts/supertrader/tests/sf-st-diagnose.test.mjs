// Supertrader Diagnose (Wasserfall REF -> günstige Kosten -> Intrabar -> Auswahl -> TraderFox-Rechnung).
// Synthetische Reihen, kein Netz, keine Anbieterdaten.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as D from '../source-faithful/research/run-st-diagnose.mjs';
import { securityFromSegment } from '../source-faithful/runner/snapshot-input.mjs';
import { SF5_LIFECYCLES } from '../source-faithful/research/sf5-lifecycles.mjs';
import { prepareAll } from '../source-faithful/research/lifecycle-engine.mjs';

const WIN = Object.freeze({ warmupFrom: '2015-01-01', from: '2016-01-04', to: '2017-06-30' });
const CAL = (() => { const out = []; for (let t = Date.UTC(2014, 5, 2); t <= Date.UTC(2017, 11, 29); t += 864e5) { const d = new Date(t); if (d.getUTCDay() % 6) out.push(d.toISOString().slice(0, 10)); } return out; })();
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
function bars(seed, drift, vol = 2e6, until = null) {
  const r = rng(seed), out = []; let c = 20;
  for (const d of CAL) { if (until && d > until) break; const o = c; c = c * (1 + drift + 0.04 * (r() - 0.5)); out.push({ date: d, open: o, high: Math.max(o, c) * 1.012, low: Math.min(o, c) * 0.988, close: Number(c.toFixed(4)), volume: vol * (1 + r()), adjClose: null, dividend: 0, splitFactor: 1 }); }
  return out;
}
const sec = (id, seed, drift, vol, endCause = 'ACTIVE', until = null) => securityFromSegment({ id, raw: bars(seed, drift, vol, until), endCause, delisted: endCause === 'LISTING_INACTIVE', survivor: endCause === 'ACTIVE' });
const ds = () => ({
  calendar: CAL.filter((d) => d >= WIN.from && d <= WIN.to),
  securities: [
    sec('tiingo:NYSE:AAA:2010-01-04', 3, 0.0015, 3e6), sec('tiingo:NYSE:BBB:2010-01-04', 5, 0.0008, 2e6), sec('tiingo:NASDAQ:CCC:2010-01-04', 9, 0.002, 1e6),
    sec('tiingo:NASDAQ:DDD:2010-01-04', 11, 0.0012, 4e6), sec('tiingo:NYSE:EEE:2010-01-04', 13, -0.002, 2e6, 'LISTING_INACTIVE', '2016-09-30'),
  ],
  spyTR: CAL.map((date, i) => ({ date, value: 100 * 1.0003 ** i })), benchmark: CAL.map((date) => ({ date, open: 1, high: 1, low: 1, close: 1, volume: 1, splitAdj: 1 })),
});

test('DIAG-1: Überlebende ohne Endereignis; heutige Umsatzspitze mit Wissen vom Fensterende', () => {
  const d = ds();
  assert.equal(D.survivorsOnly(d).securities.length, 4);
  const top = D.topByDollarVolumeAtEnd(D.survivorsOnly(d), { to: WIN.to, count: 2 });
  assert.equal(top.securities.length, 2);
  assert.ok(top.securities.every((s) => !s.terminal));
});

test('DIAG-2: die Auswahl nach Stärke gibt je Tag höchstens topK Signale weiter und ändert die Setups nicht', () => {
  const d = ds(), lc = SF5_LIFECYCLES.find((x) => x.key === 'DARVAS'), cfg = lc.variants.find((v) => v.id === 'REF').config;
  const prep = prepareAll(d, lc.adapter, cfg), wrapped = D.rankedAdapter(lc.adapter, d, cfg, prep, { topK: 1 });
  const perDay = new Map();
  for (const s of d.securities) { const ctx = prep.get(s.id); if (!ctx) continue; for (let i = 0; i < s.bars.length; i++) { const a = lc.adapter.signalAt(ctx, i, cfg), b = wrapped.signalAt(ctx, i, cfg); if (b) { assert.deepEqual(b, a); perDay.set(s.bars[i].date, (perDay.get(s.bars[i].date) || 0) + 1); } } }
  for (const n of perDay.values()) assert.ok(n <= 1);
});

test('DIAG-3: Wasserfall je Methode mit allen Schritten, Kassenabgleich bestanden, deterministisch', () => {
  for (const key of D.DIAG_METHODS) {
    const a = D.diagnoseMethod(ds(), key, { window: WIN });
    assert.deepEqual(Object.keys(a.steps), [...D.STEPS], key);
    for (const [s, x] of Object.entries(a.steps)) {
      assert.ok('cagr' in x && 'turnoverPerYear' in x && 'costsPerYearOfEquity' in x, `${key} ${s}`);
      if (x.reconciliation !== undefined && x.reconciliation !== null) assert.equal(x.reconciliation, true, `${key} ${s}`);
    }
    assert.ok(a.steps.T3_COST_ZERO.costsPaid === 0 || a.steps.T3_COST_ZERO.trades === 0, key);
    assert.ok(typeof a.steps.T4_BEST_VARIANT.chosenVariant === 'string' && a.steps.T4_BEST_VARIANT.tried >= 2, key);
    assert.equal(JSON.stringify(D.diagnoseMethod(ds(), key, { window: WIN })), JSON.stringify(a), key);
  }
});

test('DIAG-4: öffentlicher Teil ohne Renditezahl; Workflow kennt den Modus nur mit Prüfschlüssel', () => {
  const m = { DARVAS: D.diagnoseMethod(ds(), 'DARVAS', { window: WIN }) };
  const pub = JSON.stringify(D.publicPart({ methods: m, receipt: { version: D.ST_DIAGNOSE_VERSION } }));
  for (const f of ['totalReturn', 'cagr', 'maxDrawdown', 'hitRate', 'spyDistance', 'annualReturns']) assert.ok(!pub.includes(`"${f}"`), f);
  const w = fs.readFileSync(new URL('../../../.github/workflows/supertrader-st-hist-top5.yml', import.meta.url), 'utf8');
  assert.match(w, /diagnose/);
  assert.match(w, /DIAGNOSE_NEEDS_REVIEWER_KEY/);
});

test('DIAG-5: TraderFox-Vergleich je Methode: dieselben Regeln auf alle Titel und auf die heute größten, ohne Auswahl nach Stärke', () => {
  for (const key of D.TOP1000_METHODS) {
    const a = D.compareTop1000(ds(), key, { window: WIN });
    assert.ok('cagr' in a.honest && 'cagr' in a.top1000, key);
    assert.ok(a.population.top1000Now <= a.population.all, key);
  }
  const pub = JSON.stringify(D.publicPart({ methods: { DARVAS: D.compareTop1000(ds(), 'DARVAS', { window: WIN }) }, receipt: {} }));
  for (const f of ['cagr', 'totalReturn', 'maxDrawdown']) assert.ok(!pub.includes(`"${f}"`), f);
});
