// Supertrader 9 – historical infrastructure, execution side (exit classes, gap stops, delisting settlement, A/B
// reproducibility, uncertainty per year and method). Synthetic fixtures only; nothing is written to the repository.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as X from '../source-faithful/research/st9-hist-execution.mjs';
import * as H from '../source-faithful/research/st9-hist-universe.mjs';
import * as S from '../source-faithful/research/st9-v13-delisted-study.mjs';
import { REGISTRATION_FILE } from '../source-faithful/research/run-st9-v13-delisted-study.mjs';
import { runResearchLifecycle } from '../source-faithful/research/lifecycle-engine.mjs';
import { securityFromSegment } from '../source-faithful/runner/snapshot-input.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const WIN = Object.freeze({ warmupFrom: '2015-01-01', from: '2016-01-04', to: '2017-06-30' });
const CAL = (() => { const out = []; for (let t = Date.UTC(2014, 5, 2); t <= Date.UTC(2017, 5, 30); t += 864e5) { const d = new Date(t); if (d.getUTCDay() % 6) out.push(d.toISOString().slice(0, 10)); } return out; })();
const COSTS = Object.freeze({ slippageBps: 10, commissionBps: 1 });
const SLIP = COSTS.slippageBps / 1e4;
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
function raw(from, to, { c0 = 20, drift = 0.001, seed = 1, noise = 0.004, edit = null } = {}) {
  const r = rng(seed), out = []; let c = c0;
  for (const d of CAL) {
    if (d < from || d > to) continue;
    const o = c; c = c * (1 + drift + noise * (r() - 0.5));
    const b = { date: d, open: o, high: Math.max(o, c) * 1.003, low: Math.min(o, c) * 0.997, close: Number(c.toFixed(4)), volume: 1e6, adjClose: null, dividend: 0, splitFactor: 1 };
    if (edit) edit(b);
    out.push(b);
  }
  return out;
}
const sec = (id, rs, endCause = 'ACTIVE') => securityFromSegment({ id, raw: rs, endCause, delisted: endCause !== 'ACTIVE', survivor: endCause === 'ACTIVE' });
const ds = (securities, from = '2016-01-04', to = '2017-06-30') => ({ calendar: CAL.filter((d) => d >= from && d <= to), securities, spyTR: [], benchmark: CAL.map((date) => ({ date, open: 1, high: 1, low: 1, close: 1, volume: 1, splitAdj: 1 })) });

/** Minimal method adapter: one signal on SIG, buy at the next open with a fixed stop, no other exit rule. */
const adapterFor = (sig, stop) => ({ version: 'st9-test-1', strategy: 'ST9_TEST', validateConfig: () => [], prepare: (s) => ({ s }), signalAt: (ctx, i) => (ctx.s.bars[i].date === sig ? { date: sig } : null), eligibility: () => ({ state: 'ELIGIBLE', blockers: [], order: { type: 'ON_OPEN', stop }, openManualDecisions: [] }), onClose() {} });
const CONFIG = Object.freeze({ intrabarOrder: 'PESSIMISTIC', sizing: Object.freeze({ mode: 'WEIGHT', weight: 0.1 }) });
const lifecycle = (d, sig, stop) => runResearchLifecycle(d, { adapter: adapterFor(sig, stop), config: CONFIG, from: d.calendar[0] });

test('gap through the stop: the engine fills at the open; a fill at the stop is flagged (before / after on a fixture)', () => {
  // flat ~20, then on 2016-03-01 the open gaps to 15, below the stop at 18
  const rs = raw('2015-06-01', '2016-06-30', { drift: 0, noise: 0, edit: (b) => { if (b.date === '2016-03-01') { b.open = 15; b.low = 14.8; b.high = 15.5; b.close = 15.2; } } });
  const d = ds([sec('tiingo:NYSE:GAP:2000-01-03', rs)], '2016-01-04', '2016-06-30');
  const run = lifecycle(d, '2016-02-01', 18);
  const t = run.trades[0];
  assert.equal(t.exitDate, '2016-03-01'); assert.equal(t.exitReason, 'STOP_INITIAL_GAP_OPEN');
  const sell = run.ledger.find((r) => r.side === 'SELL');
  assert.ok(Math.abs(sell.price - 15 * (1 - SLIP)) < 1e-9, 'after: filled at the open of the gap bar, never at the stop');
  const after = X.classifyExits(d, run, { slippageBps: COSTS.slippageBps, trades: run.trades });
  assert.deepEqual(after.classes, { GAP_THROUGH_STOP_AT_OPEN: 1 }); assert.equal(after.violationCount, 0);
  // before: the naive daily model books the stop level although the market opened below it
  const naive = { ...run, ledger: run.ledger.map((r) => (r === sell ? { ...r, price: 18 * (1 - SLIP), gross: r.shares * 18 * (1 - SLIP) } : r)) };
  const before = X.classifyExits(d, naive, { slippageBps: COSTS.slippageBps, trades: run.trades });
  assert.deepEqual(before.violations, { STOP_FILL_ABOVE_OPEN: 1, STOP_GAP_NOT_FILLED_AT_OPEN: 1 });
  assert.ok(sell.shares * (18 - 15) * (1 - SLIP) > 0, 'the naive model overstates the exit by (stop - open) per share');
  const audit = X.auditRun(d, { run, trades: run.trades }, { key: 'ST9_TEST', costs: COSTS, from: d.calendar[0] });
  assert.equal(audit.pass, true, JSON.stringify(audit.violations));
});

test('intraday touch: fill at the stop level; same-bar order without intraday data is flagged INTRADAY_ORDER_ASSUMED', () => {
  const rs = raw('2015-06-01', '2016-06-30', { drift: 0, noise: 0, edit: (b) => { if (b.date === '2016-03-01') { b.low = 17.5; } } });
  const d = ds([sec('tiingo:NYSE:TCH:2000-01-03', rs)], '2016-01-04', '2016-06-30');
  const run = lifecycle(d, '2016-02-01', 18);
  assert.equal(run.trades[0].exitReason, 'STOP_INITIAL');
  const c = X.classifyExits(d, run, { slippageBps: COSTS.slippageBps, trades: run.trades });
  assert.deepEqual(c.classes, { INTRADAY_AT_STOP: 1 }); assert.equal(c.violationCount, 0);
  const assumed = { ledger: [{ date: '2016-03-01', id: 'tiingo:NYSE:TCH:2000-01-03', side: 'SELL', shares: 1, price: 18 * (1 - SLIP), gross: 18 * (1 - SLIP), fee: 0, reason: 'STOP_SAME_BAR_ASSUMED' }] };
  const a = X.classifyExits(d, assumed, { slippageBps: COSTS.slippageBps });
  assert.deepEqual(a.classes, { INTRADAY_ORDER_ASSUMED: 1 });
  assert.equal(a.perTrade.get('tiingo:NYSE:TCH:2000-01-03|2016-03-01'), 'INTRADAY_ORDER_ASSUMED');
});

test('delisting: settlement on the last traded bar at its close; later rows, other prices and late entries are violations', () => {
  const rs = raw('2015-06-01', '2016-04-29', { drift: 0, noise: 0 });
  const s = sec('tiingo:NYSE:DLS:2000-01-03', rs, 'LISTING_INACTIVE');
  const d = ds([s], '2016-01-04', '2016-06-30');
  const run = lifecycle(d, '2016-02-01', 10);
  const sell = run.ledger.find((r) => r.side === 'SELL');
  assert.equal(sell.reason, 'TERMINAL_DELISTED'); assert.equal(sell.date, '2016-04-29');
  const ok = X.classifyExits(d, run, { slippageBps: COSTS.slippageBps, trades: run.trades });
  assert.deepEqual(ok.classes, { TERMINAL_AT_LAST_TRADED_CLOSE: 1 }); assert.equal(ok.violationCount, 0);
  const tamper = (f) => X.classifyExits(d, { ledger: run.ledger.map((r) => (r === sell ? f(r) : r)) }, { slippageBps: COSTS.slippageBps }).violations;
  assert.deepEqual(tamper((r) => ({ ...r, price: r.price * 1.05 })), { TERMINAL_NOT_AT_LAST_TRADED_CLOSE: 1 });
  assert.deepEqual(tamper((r) => ({ ...r, date: '2016-05-06' })), { TERMINAL_NOT_ON_LAST_TRADED_BAR: 1 }, 'no forward-filled settlement');
  assert.deepEqual(tamper((r) => ({ ...r, reason: 'MA_EXIT', date: '2016-05-06' })), { EXIT_AFTER_LAST_BAR: 1 });
  const late = X.classifyExits(d, { ledger: [{ date: '2016-04-29', id: s.id, side: 'BUY', shares: 1, price: 20, gross: 20, fee: 0, reason: 'ENTRY' }] }, { slippageBps: COSTS.slippageBps });
  assert.deepEqual(late.violations, { ENTRY_ON_OR_AFTER_TERMINAL: 1 });
  const unavailable = X.classifyExits(d, { ledger: [{ ...sell, reason: 'SECURITY_UNAVAILABLE' }] }, { slippageBps: COSTS.slippageBps });
  assert.deepEqual(unavailable.classes, { DATA_EVENT_CENSORED: 1 });
});

/** A + one added (V13-like) chain that Turtle S1 holds into its delisting. */
function study(cls = 'UNKNOWN') {
  const A = ds([sec('tiingo:NYSE:BASE:2010-01-04', raw('2014-06-02', '2017-06-30', { seed: 7, drift: 0.0002 })), sec('tiingo:NASDAQ:AAA:2014-06-02', raw('2014-06-02', '2016-03-31', { seed: 8 }), 'LISTING_INACTIVE')]);
  const add = sec('v13dl:NASDAQ:e000000000000001', raw('2015-01-02', '2016-09-30', { seed: 31, drift: 0.004, noise: 0.02, c0: 15 }), 'LISTING_INACTIVE');
  add.v13 = Object.freeze({ chainId: 'e000000000000001', terminalClass: cls, scenarios: S.V13_TERMINAL_SCENARIOS[cls], lastTradeDate: '2016-09-30' });
  const B = { ...A, securities: [...A.securities, add] }, addedIds = new Set(['v13dl:NASDAQ:e000000000000001']);
  const params = S.studyParameters({ methods: ['TURTLE_S1', 'KK_BREAKOUT'], window: WIN });
  return { A, B, addedIds, params };
}

test('every reference run is audited without changing the result; repeat runs give the identical hash (no seeds)', () => {
  const { A, B, addedIds, params } = study();
  const seen = [];
  const res = S.runStudy({ dsA: A, dsB: B, addedIds, params, onRun: ({ key, frame, ds: d, r, opts }) => seen.push({ key, frame, audit: X.auditRun(d, r, { key, costs: opts.costs, from: opts.from }), trades: r.trades }) });
  const plain = S.runStudy({ dsA: A, dsB: B, addedIds, params });
  assert.equal(X.assertSameResult(res, plain), X.resultSha256(res), 'the observer does not change the registered result');
  assert.equal(seen.length, 4);
  for (const s of seen) assert.equal(s.audit.pass, true, `${s.key} ${s.frame}: ${JSON.stringify(s.audit.violations)}`);
  const tB = seen.find((s) => s.key === 'TURTLE_S1' && s.frame === 'B');
  assert.ok(tB.audit.exitClasses.TERMINAL_AT_LAST_TRADED_CLOSE >= 1, 'the added chain is settled at its last traded close');
  assert.ok(seen.find((s) => s.key === 'KK_BREAKOUT').audit.lifecycleChecks, 'sf5 lifecycles also get checkLifecycleRun');
  assert.throws(() => X.assertSameResult(res, { ...res, methods: {} }), /DETERMINISM_FAILED/);
  assert.equal(X.SEEDS, 'NONE_USED');
});

test('A/B diff and uncertainty per year and method: censored delisting, origin, method data flag', () => {
  const { A, B, addedIds, params } = study('UNKNOWN');
  const got = {};
  S.runStudy({ dsA: A, dsB: B, addedIds, params, onRun: ({ key, frame, ds: d, r, opts }) => { (got[key] ||= {})[frame] = { r, a: X.auditRun(d, r, { key, costs: opts.costs, from: opts.from }) }; } });
  const outcome = new Map(H.listingWindows(B, { addedIds }).map((w) => [w.lid, H.outcomeOf(w)]));
  const t = got.TURTLE_S1;
  const cov = X.tradeCoverageByYear(t.B.r.trades, { key: 'TURTLE_S1', addedIds, outcomeOfId: (id) => outcome.get(id), perTrade: t.B.a._perTrade });
  assert.ok(cov.total.flags.DELISTING_OUTCOME_UNKNOWN_CENSORED >= 1);
  assert.ok(Object.values(cov.byYear).some((y) => y.B_ADDED >= 1));
  assert.ok(cov.total.flaggedShare > 0 && cov.total.flaggedShare <= 1);
  const sepa = X.tradeCoverageByYear([{ id: 'v13dl:NASDAQ:e000000000000001', entryDate: '2016-02-01', status: 'CLOSED', exitDate: '2016-03-01', exitReason: 'STOP_INITIAL' }], { key: 'MINERVINI_SEPA', addedIds });
  assert.deepEqual(sepa.total.flags, { FUNDAMENTALS_NOT_BLOCKING_EVIDENCE_MANUAL: 1, ADDED_CHAIN_WITHOUT_FUNDAMENTALS: 1 });
  const diff = X.abDiff(t.A.r.trades, t.B.r.trades, { addedIds });
  assert.ok(diff.bAdded >= 1);
  assert.equal(diff.aOwn.base, t.A.r.trades.length);
  const same = X.abDiff(t.A.r.trades, t.A.r.trades);
  assert.equal(same.identical, true);
  const pub = JSON.stringify(X.publicAudit(t.B.a));
  assert.ok(!/e000000000000001|BASE|AAA/.test(pub), 'public audit carries no id');
});

test('registered references are re-hashed (fail closed); one input fingerprint over every part', () => {
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, REGISTRATION_FILE), 'utf8'));
  const v = X.verifyRegisteredReferences(ROOT, reg);
  assert.equal(v.files, Object.keys(reg.references.sha256).length);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'st9-refs-'));
  const f = 'scripts/supertrader/source-faithful/runner/metrics.mjs';
  fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
  fs.writeFileSync(path.join(root, f), fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n// changed\n');
  assert.throws(() => X.verifyRegisteredReferences(root, { references: { sha256: { [f]: reg.references.sha256[f] } } }), /REGISTERED_REFERENCE_CHANGED/);
  assert.throws(() => X.verifyRegisteredReferences(root, { references: { sha256: { 'nope.mjs': 'x' } } }), /REGISTERED_REFERENCE_MISSING/);
  assert.throws(() => X.verifyRegisteredReferences(root, {}), /REGISTRATION_REFERENCES_MISSING/);
  const a = X.inputFingerprint({ snapshotId: 'sts1-x', datasetSha256: 'd', identityBlocklistSha256: null });
  assert.equal(a.sha256, X.inputFingerprint({ identityBlocklistSha256: null, datasetSha256: 'd', snapshotId: 'sts1-x' }).sha256, 'key order does not matter');
  assert.notEqual(a.sha256, X.inputFingerprint({ snapshotId: 'sts1-x', datasetSha256: 'e', identityBlocklistSha256: null }).sha256);
  assert.throws(() => X.inputFingerprint({ datasetSha256: '' }), /FINGERPRINT_PART_INVALID/);
});
