// Supertrader Neustart – historischer Backtest der V1-Methoden (Top 5). Synthetische Reihen, kein Netz, keine Anbieterdaten.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as T from '../source-faithful/research/run-st-hist-top5.mjs';
import * as L from '../validation/lib.mjs';
import { securityFromSegment } from '../source-faithful/runner/snapshot-input.mjs';
import { SF6_VALIDATION_PROTOCOL } from '../source-faithful/research/run-sf6-validation.mjs';

const WIN = Object.freeze({ warmupFrom: '2015-01-01', from: '2016-01-04', to: '2017-06-30' });
const CAL = (() => { const out = []; for (let t = Date.UTC(2014, 5, 2); t <= Date.UTC(2017, 11, 29); t += 864e5) { const d = new Date(t); if (d.getUTCDay() % 6) out.push(d.toISOString().slice(0, 10)); } return out; })();
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
function bars(seed, drift) {
  const r = rng(seed), out = []; let c = 20;
  for (const d of CAL) { const o = c; c = c * (1 + drift + 0.03 * (r() - 0.5)); out.push({ date: d, open: o, high: Math.max(o, c) * 1.01, low: Math.min(o, c) * 0.99, close: Number(c.toFixed(4)), volume: 2e6 * (1 + r()), adjClose: null, dividend: 0, splitFactor: 1 }); }
  return out;
}
const sec = (id, seed, drift) => securityFromSegment({ id, raw: bars(seed, drift), endCause: 'ACTIVE', delisted: false, survivor: true });
const ds = () => ({ calendar: CAL.filter((d) => d >= WIN.from && d <= WIN.to), securities: [sec('tiingo:NYSE:AAA:2010-01-04', 3, 0.0015), sec('tiingo:NYSE:BBB:2010-01-04', 5, 0.0008), sec('tiingo:NASDAQ:CCC:2010-01-04', 9, 0.002)], spyTR: CAL.map((date, i) => ({ date, value: 100 * 1.0003 ** i })), benchmark: CAL.map((date) => ({ date, open: 1, high: 1, low: 1, close: 1, volume: 1, splitAdj: 1 })) });

test('ST-HIST-1: genau die V1-Methoden, als Forschung beschriftet, keine Renditeaussage', () => {
  assert.deepEqual([...T.TOP5], ['TURTLE_S1', 'TURTLE_S2', 'DARVAS', 'KK_BREAKOUT', 'BUYABLE_GAP_UP']);
  assert.equal(T.LABEL.label, 'Forschung, nicht zertifiziert');
  assert.equal(T.LABEL.performanceClaim, 'NONE');
  assert.equal(T.LABEL.productionApproved, false);
});

test('ST-HIST-2: je Methode und vorregistrierter Kostenstufe Trades, Trefferquote, Rendite, max. Verlust, SPY, Kosten; deterministisch', () => {
  const a = T.runTop5(ds(), { window: WIN });
  for (const k of T.TOP5) {
    assert.deepEqual(Object.keys(a[k].costs), SF6_VALIDATION_PROTOCOL.costLevels.map((c) => c.id));
    const m = a[k].costs.REF;
    for (const f of ['trades', 'hitRate', 'totalReturn', 'cagr', 'maxDrawdown', 'spyTotalReturn', 'spyDistance', 'costsPaid']) assert.ok(f in m, `${k} ${f}`);
    assert.ok(m.maxDrawdown <= 0);
    assert.ok(m.costsPaid >= a[k].costs['COST-0'].costsPaid);
  }
  const b = T.runTop5(ds(), { window: WIN });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('ST-HIST-3: der öffentliche Teil trägt keine Renditezahl; der versiegelte Teil ist nur mit dem Prüfschlüssel lesbar', () => {
  const A = T.runTop5(ds(), { window: WIN });
  const result = { A, quarantine: { A: { policy: 'DQ-K5-BOOK' } }, receipt: { version: T.ST_HIST_TOP5_VERSION } };
  const pub = JSON.stringify(T.publicPart(result));
  for (const f of ['totalReturn', 'cagr', 'maxDrawdown', 'hitRate', 'spyDistance', 'annualReturns']) assert.ok(!pub.includes(`"${f}"`), f);
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const sealed = L.encryptForOwner(publicKey.export({ type: 'spki', format: 'pem' }), Buffer.from(JSON.stringify(result)));
  assert.deepEqual(JSON.parse(L.decryptSealed(privateKey.export({ type: 'pkcs8', format: 'pem' }), sealed)).A, JSON.parse(JSON.stringify(A)));
});

test('ST-HIST-4: Workflow nur manuell, nur lesend, kein Commit, Eingaben über env', () => {
  const w = fs.readFileSync(new URL('../../../.github/workflows/supertrader-st-hist-top5.yml', import.meta.url), 'utf8');
  assert.match(w, /workflow_dispatch/);
  assert.doesNotMatch(w, /\n\s+schedule:/);
  assert.match(w, /permissions:\n\s+contents: read/);
  assert.doesNotMatch(w, /git push|push-with-retry/);
  assert.doesNotMatch(w, /run: [^\n]*\$\{\{\s*inputs\./);
  assert.match(w, /group: supertrader-st-hist-top5-\$\{\{ github\.ref_name \}\}/);
});

test('ST-HIST-5: Sensitivität Delisting-Erlös als echte Neuläufe (S0/S1/S2), Austritts- und Populationszählung, Audit fail closed', () => {
  const sec2 = (id, seed, drift, end) => securityFromSegment({ id, raw: bars(seed, drift).filter((b) => b.date <= end), endCause: 'LISTING_INACTIVE', delisted: true, survivor: false });
  const d = ds(); d.securities.push(sec2('tiingo:NASDAQ:DDD:2010-01-04', 11, 0.0025, '2017-03-31'));
  const a = T.runTop5(d, { window: WIN, costLevels: SF6_VALIDATION_PROTOCOL.costLevels.filter((c) => c.id === 'REF') });
  for (const k of T.TOP5) {
    const p = a[k].delistingProceeds;
    assert.deepEqual(Object.keys(p), ['DELIST_100', 'DELIST_70', 'DELIST_DISTRESS_0']);
    assert.ok(Math.abs(p.DELIST_100.totalReturn - a[k].costs.REF.totalReturn) < 1e-12, `${k}: 100 % ist die Referenz`);
    assert.equal(p.DELIST_100.scenario, 'S0_LAST_PRICE');
    for (const v of Object.values(p)) assert.ok(v.maxDrawdown >= -1 && v.maxDrawdown <= 0, `${k}: max. Verlust zwischen 0 und -100 %`);
    assert.deepEqual(Object.keys(a[k].exitCensus), ['TERMINAL_DELISTED', 'SECURITY_UNAVAILABLE', 'OTHER']);
  }
  assert.deepEqual(T.populationCensus(d), { ACTIVE_AT_WINDOW_END: 3, LISTING_INACTIVE: 1 });
  assert.equal(T.auditPassAll({ A: { X: { audit: { pass: true } } } }), true);
  assert.equal(T.auditPassAll({ A: { X: { audit: { pass: true } } }, B: { X: { audit: { pass: false } } } }), false);
  const runner = fs.readFileSync(new URL('../source-faithful/research/run-st-hist-top5.mjs', import.meta.url), 'utf8');
  assert.match(runner, /if \(!auditPass\) \{[^}]*process\.exit\(4\)/, 'fail closed');
});

test('ST-HIST-6: E3-Export je Methode und Fenster ab Cash, kostenfrei, mit Fills, Kurve, Terminalen und ADV20', () => {
  const W = [{ id: 'W1', from: '2016-01-04', to: '2016-12-30' }, { id: 'W2', from: '2017-01-03', to: '2017-06-30' }];
  const e = T.edgeExport(ds(), { windows: W });
  assert.equal(e.schema, 'st-edge-export-1.0.0');
  assert.ok(e.benchmark.spyClose.length > 0);
  for (const k of T.TOP5) for (const w of W) {
    const x = e.methods[k].windows[w.id];
    assert.deepEqual(x.costs, { slippageBps: 0, commissionBps: 0 });
    assert.ok(x.curve.every((p) => p.date >= w.from && p.date <= w.to), `${k} ${w.id}: Kurve im Fenster`);
    assert.ok(x.fills.every((f) => f.date >= w.from && f.date <= w.to), `${k} ${w.id}: keine Position vor dem Fenster`);
    for (const f of x.fills.filter((f) => f.side === 'BUY')) { assert.ok(f.securityId && f.ticker && f.shares > 0 && f.price > 0); assert.ok(f.adv20Usd === null || f.adv20Usd > 0); }
    assert.ok(Math.abs(x.curve[0].equity - 100000) < 100000 * 0.2 || x.fills.length === 0, 'Start in Cash');
    assert.equal(x.holdings.length, x.curve.length);
    assert.deepEqual(x.holdings[0].positions.length <= x.fills.filter((f) => f.date === x.curve[0].date && f.side === 'BUY').length, true, 'Start ohne Altbestand');
    for (const h of x.holdings) for (const [id, n] of h.positions) assert.ok(id && n > 0, `${k} ${w.id} ${h.date}: nur positive Bestände`);
    if (x.curve.at(-1).positions !== null) assert.equal(x.holdings.at(-1).positions.length, x.curve.at(-1).positions, `${k} ${w.id}: Bestände = Positionszahl der Engine`);
  }
  assert.deepEqual(T.EDGE_WINDOWS.map((w) => [w.from, w.to]), [['2016-01-04', '2019-12-31'], ['2020-01-02', '2026-09-30']]);
});

test('ST-HIST-7: Darvas-Spannweite der Balkenreihenfolge nur mit der vorregistrierten Variante ALT-INTRABAR-OPTIMISTIC', () => {
  const a = T.runTop5(ds(), { window: WIN, costLevels: SF6_VALIDATION_PROTOCOL.costLevels.filter((c) => c.id === 'REF') });
  assert.deepEqual(Object.keys(a.DARVAS.intrabarVariants), ['ALT-INTRABAR-OPTIMISTIC']);
  assert.deepEqual(a.DARVAS.intrabarVariants['ALT-INTRABAR-OPTIMISTIC'].changes, { intrabarOrder: 'OPTIMISTIC' });
  for (const k of ['TURTLE_S1', 'TURTLE_S2', 'KK_BREAKOUT', 'BUYABLE_GAP_UP']) assert.equal(a[k].intrabarVariants, undefined, `${k}: keine nicht registrierte Variante`);
});

test('ST-HIST-8: Plausibilitätsdiagnose ohne Hebel (Exposure <= 1, Cash >= 0) und mit schlechtesten Trades und Tagen', () => {
  const a = T.runTop5(ds(), { window: WIN, costLevels: SF6_VALIDATION_PROTOCOL.costLevels.filter((c) => c.id === 'REF') });
  for (const k of T.TOP5) {
    const p = a[k].plausibility;
    assert.ok(p.maxExposure <= 1 + 1e-9 && p.minCash >= -1e-6, `${k}: kein Hebel`);
    assert.ok(Array.isArray(p.worstTrades) && Array.isArray(p.worstDays));
    assert.ok(p.worstDays.every((d, i, arr) => i === 0 || arr[i - 1].ret <= d.ret));
  }
});

test('ST-HIST-9: C08-Treuevariante FID-1 neben der Referenz; R-Verteilung und goldene Trades; Referenz unverändert', async () => {
  const FID = await import('../source-faithful/research/kk-breakout-fidelity.mjs');
  const d = ds();
  const f = T.kkFidelityRun(d, { window: WIN });
  assert.deepEqual(Object.keys(f.costs), ['COST-0', 'REF']);
  assert.ok(f.costs.REF.rDistribution && 'avgWinR' in f.costs.REF.rDistribution && 'shareAbove5R' in f.costs.REF.rDistribution);
  assert.equal(f.costs.REF.goldenTrades.length, FID.KK_GOLDEN_TRADES.length);
  assert.ok(f.marketOnShare >= 0 && f.marketOnShare <= 1);
  // Querschnitt: in drei Titeln sind die besten 2 % genau ein Titel je Datum mit voller Historie
  const L1 = FID.momentumLeaders(d.securities);
  assert.ok([...L1.values()].every((s) => s.size <= 3));
  // Referenz C08 unverändert: die gepinnte Variantenregistrierung bleibt gleich
  const KK = await import('../source-faithful/research/kk-breakout-lifecycle.mjs');
  assert.equal(KK.KK_REFERENCE_CONFIG.entryTiming, 'NEXT_OPEN');
  const a = T.runTop5(d, { window: WIN, costLevels: SF6_VALIDATION_PROTOCOL.costLevels.filter((c) => c.id === 'REF') });
  assert.ok(a.KK_BREAKOUT.rDistribution && Array.isArray(a.KK_BREAKOUT.goldenTrades));
});
