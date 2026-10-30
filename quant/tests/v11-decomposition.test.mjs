import test from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const K = require('../../scripts/quant/v10/studies/common.cjs');
const SS = require('../../scripts/quant/v10/studies/signal-study.cjs');
const E = require('../../scripts/quant/v11/decomposition/events.cjs');
const PF = require('../../scripts/quant/v11/decomposition/portfolio.cjs');
const A = require('../../scripts/quant/v11/decomposition/assemble.cjs');
const { readRegistration, protocolHash } = require('../../scripts/quant/v11/decomposition/register.cjs');
const { plan } = require('../../scripts/quant/v11/decomposition/plan.cjs');
const Portfolio = require('../engines/research-portfolio.cjs');

function weeks(n, start = Date.UTC(1998, 0, 2)) { const out = []; for (let i = 0; i < n; i++) out.push(new Date(start + i * 7 * 86400000).toISOString().slice(0, 10)); return out; }
function series(seed, n, drift = 0.003) { let s = seed, p = 20; const out = []; for (let i = 0; i < n; i++) { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; p *= 1 + drift + (s / 4294967296 - 0.5) * 0.14; out.push(Math.round(p * 1e4) / 1e4); } return out; }
// Synthetic context: four listings on one weekly calendar (one starts later, one has a calendar gap).
function synthetic() {
  const cal = weeks(420), docs = new Map(), frame = [];
  const mk = (id, from, to, seed, skip = -1) => {
    const closes = series(seed, to - from), points = [];
    for (let i = from; i < to; i++) if (i !== skip) points.push([cal[i], closes[i - from]]);
    docs.set(id, { points, listingId: 'tiingo:NASDAQ:' + id.slice(4) + ':1990-01-01', listingStart: cal[from], identityHash: 'a'.repeat(64), masterGeneratedAt: '2026-01-01T00:00:00Z', asOf: cal.at(-1) }); frame.push(id);
  };
  mk('ref_AAA', 0, 420, 7); mk('ref_BBB', 60, 420, 99); mk('ref_CCC', 0, 400, 1234, 250); mk('ref_DDD', 0, 420, 4242);
  const fr = { calendar: cal, frame, docs, loaderOptions: {} };
  const byDate = new Map(cal.map((d, i) => [d, 100 * (1.001 ** i)]));
  const ctx = { fr, panel: K.buildPanel(fr), T: cal.length, manifestHash: 'b'.repeat(64),
    benchmark: { byDate, provenance: { sourceBytesHash: 'c'.repeat(64) }, ret: (a, z) => byDate.has(a) && byDate.has(z) ? byDate.get(z) / byDate.get(a) - 1 : null } };
  for (const p of ctx.panel) { p.elig = new Uint8Array(p.closes.length); for (let k = K.Signal.WARMUP_WEEKS; k < p.closes.length; k++) if (K.eligibleAt(p, k, K.SIGNAL_FEATURE_LOOKBACK)) p.elig[k] = 1; }
  ctx.studyCalendar = cal.slice(60, 380);
  return ctx;
}

test('registration is intact, bound to the protocol hash, and equals the plan', () => {
  const reg = readRegistration(), r = reg.registration, p = plan(protocolHash());
  for (const k of Object.keys(p)) assert.deepEqual(r[k], p[k], 'plan field changed after registration: ' + k);
  assert.equal(r.protocol.period, 'FULL_DESCRIPTIVE');
  assert.equal(r.evidence.productionApproved, false);
  assert.equal(r.evidence.certificationStatus, 'NOT_CERTIFIED');
});

test('window returns require a contiguous calendar path that also covers the signal bar', () => {
  const ctx = synthetic(), c = ctx.panel.find(p => p.id === 'ref_CCC');
  const k = 240; // gap at calendar 250 (bar 250 missing)
  assert.equal(E.winRet(c, k, 1, 13), null);
  assert.equal(E.winRet(c, 200, 1, 13), c.closes[214] / c.closes[201] - 1);
  assert.equal(E.winRet(c, 200, -4, 4), c.closes[200] / c.closes[196] - 1);
  assert.equal(E.winRet(c, 255, -10, 10), null, 'pre-signal window across the gap');
});

test('population sums are the equal-weighted mean over eligible complete observations of the signal week', () => {
  const ctx = synthetic(), pop = E.popSums(ctx, 1, 13), c = 150;
  const vals = ctx.panel.map(p => { const k = p.cal.indexOf(c); return k >= 0 && p.elig[k] ? E.winRet(p, k, 1, 13) : null; }).filter(v => v !== null);
  assert.ok(vals.length >= 2);
  assert.ok(Math.abs(pop.at(c) - K.mean(vals)) < 1e-15);
});

test('additive decomposition identity and closed-form break-even cost', () => {
  const g = 0.031, S = 0.02, P = 0.028, net = K.netOf(g, 10, 5), cost = g - net;
  assert.ok(Math.abs(net - (S + (P - S) + (g - P) - cost)) < 1e-15);
  const s = A.breakEven(g, S); assert.ok(Math.abs(K.netOf(g, s * 1e4, 0) - S) < 1e-12);
  assert.ok(A.breakEven(0.01, 0.02) < 0, 'no positive break-even when gross < SPY');
  assert.ok(Math.abs(A.qnorm(0.975) - 1.959964) < 1e-5); assert.ok(Math.abs(A.qnorm(0.8) - 0.841621) < 1e-5);
});

test('funded schedule: hash tie-break is the V10 schedule, slots and holding are respected, weights are feasible', () => {
  const ctx = synthetic(), F = { maxPositions: 2, holdingWeeks: 13 };
  const pr = PF.prepare(ctx, 'TREND_UP', 13);
  const v10 = SS.fundedSchedule({ ...ctx, studyCalendar: ctx.studyCalendar }, SS.detectionFlags(ctx.panel, K.Signal.RULES), 'TREND_UP', F);
  const mine = PF.schedule(pr, 2, 'EQUAL', PF.keyFor('HASH_V10'));
  assert.deepEqual(mine.episodes, v10.episodes); assert.deepEqual(mine.targets, v10.targets);
  for (const w of ['EQUAL', 'VOL_INVERSE', 'FULLY_INVESTED']) for (const tie of ['HASH_V10', 3]) {
    const s = PF.schedule(pr, 2, w, PF.keyFor(tie));
    for (const t of s.targets) { const ws = Object.values(t.weights); assert.ok(ws.length <= 2); assert.ok(ws.reduce((a, b) => a + b, 0) <= 1 + 1e-12); if (w !== 'FULLY_INVESTED') for (const x of ws) assert.ok(x <= 1 + 1e-12); }
    for (const e of s.episodes) assert.equal(e.exitExec - e.entryExec, 13);
  }
  const vol = PF.schedule(pr, 2, 'VOL_INVERSE', PF.keyFor('HASH_V10'));
  for (const t of vol.targets) { const ws = Object.values(t.weights); assert.ok(ws.every(x => x <= 2 / 2 + 1e-12)); assert.ok(ws.reduce((a, b) => a + b, 0) <= ws.length / 2 + 1e-12); }
});

test('replica ledger equals research-portfolio on the same schedule (used only beyond the engine budget)', () => {
  const ctx = synthetic(), pr = PF.prepare(ctx, 'TREND_UP', 13); let compared = 0;
  for (const [w, tie] of [['EQUAL', 'HASH_V10'], ['VOL_INVERSE', 5], ['FULLY_INVESTED', 2]]) {
    const sch = PF.schedule(pr, 2, w, PF.keyFor(tie));
    if (!sch.episodes.length) continue;
    const costs = { feeBps: 10, slippageBps: 5 };
    const r = Portfolio.runPortfolio(SS.fundedInput(ctx, sch, costs, {})), q = PF.replicaLedger(ctx, pr, sch, costs);
    assert.equal(q.equity.length, r.equity.length);
    for (let i = 0; i < r.equity.length; i++) { assert.equal(q.equity[i].date, r.equity[i].date); assert.ok(Math.abs(q.equity[i].value / r.equity[i].value - 1) < 1e-10); }
    assert.ok(Math.abs(q.metrics.cagr - r.metrics.cagr) < 1e-12);
    assert.ok(Math.abs(q.metrics.maxDrawdown - r.metrics.maxDrawdown) < 1e-12); compared++;
  }
  assert.equal(compared, 3);
});
