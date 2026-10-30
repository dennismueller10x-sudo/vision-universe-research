// V12 REQUAL - fast tests (no frame build, no production data written): registration integrity, pure functions,
// strategy ledger on a synthetic population, and consistency of the committed evidence files.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const DOCS = path.join(ROOT, 'docs/quant-recovery/v12/requal');
const L = require(path.join(ROOT, 'scripts/quant/v12/requal/lib.cjs'));
const P6 = require(path.join(ROOT, 'scripts/quant/v12/requal/p6-strategies.cjs'));
const P5C = require(path.join(ROOT, 'scripts/quant/v12/requal/p5c-factor.cjs'));
const { readRegistration } = require(path.join(ROOT, 'scripts/quant/v12/requal/plan.cjs'));
const read = f => JSON.parse(fs.readFileSync(path.join(DOCS, f), 'utf8'));

test('registrations 1.0.0/1.0.1/1.0.2 match their sha256 files and the amendment chain', () => {
  const hashes = {};
  for (const v of ['1.0.0', '1.0.1', '1.0.2']) {
    const text = fs.readFileSync(path.join(DOCS, `registration-${v}.json`), 'utf8');
    const want = fs.readFileSync(path.join(DOCS, `registration-${v}.sha256`), 'utf8').split(/\s+/)[0];
    hashes[v] = crypto.createHash('sha256').update(text).digest('hex');
    assert.equal(hashes[v], want, v);
  }
  const r = readRegistration().registration;
  assert.equal(r.version, '1.0.2');
  assert.deepEqual(r.amends.map(a => a.sha256), [hashes['1.0.0'], hashes['1.0.1']]);
  assert.equal(r.P6.strategies.length, 6);
  assert.equal(r.certificationStatus, 'NOT_CERTIFIED');
  assert.equal(r.productionApproved, false);
});

test('lastIdx honours the 7-day window (Good Friday week)', () => {
  const d = ['2016-03-18', '2016-03-24', '2016-04-01'];
  assert.equal(L.lastIdx(d, '2016-03-31', 7), 1);
  assert.equal(L.lastIdx(d, '2016-03-31', 6), -1);
  assert.equal(L.lastIdx(d, '2016-03-01', 7), -1);
});

test('fiscal year and SPY total-return reference on a synthetic series', () => {
  assert.equal(L.fiscalYearOf('2019-12-31'), '2020-09-30');
  assert.equal(L.fiscalYearOf('2020-09-30'), '2020-09-30');
  const spy = { at: d => ({ '2019-12-31': 100, '2020-03-31': 110, '2020-06-30': 99 })[d], ret: (a, b) => ({ '2019-12-31': 100, '2020-03-31': 110, '2020-06-30': 99 })[b] / ({ '2019-12-31': 100, '2020-03-31': 110, '2020-06-30': 99 })[a] - 1 };
  const dist = { byFy: new Map([['2020-09-30', 8]]) };
  const r = L.spyTotalReturn(spy, dist, '2019-12-31', '2020-06-30');
  // q1: price +10 %, yield 2/100 ; q2: price -10 %, yield 2/110
  assert.ok(Math.abs(r.tr - ((1 + 0.10 + 0.02) * (1 - 0.10 + 2 / 110) - 1)) < 1e-12);
  assert.equal(r.carried, false);
  const r2 = L.spyTotalReturn(spy, { byFy: new Map([['2019-09-30', 8]]) }, '2019-12-31', '2020-03-31');
  assert.equal(r2.carried, true);
});

test('regime rule R1 labels crash, recovery, sideways and bull deterministically', () => {
  const dates = [], values = [];
  const add = (d, v) => { dates.push(d); values.push(v); };
  let t = Date.parse('2019-01-01');
  for (let i = 0; i < 400; i++) { const d = new Date(t + i * 86400000).toISOString().slice(0, 10); add(d, 100); }
  // period A: crash to 85 then 95 ; period B: recovery 95 -> 105 ; period C: flat ; period D: +10 %
  const spy = { dates, values };
  const set = (from, to, f) => { for (let k = 0; k < dates.length; k++) if (dates[k] > from && dates[k] <= to) values[k] = f(dates[k]); };
  set('2019-03-31', '2019-06-30', d => (d < '2019-05-15' ? 85 : 95));
  set('2019-06-30', '2019-09-30', () => 105);
  set('2019-09-30', '2019-12-31', () => 106);
  set('2019-12-31', '2020-02-04', () => 117);
  const ps = [{ t0: '2019-03-31', t1: '2019-06-30' }, { t0: '2019-06-30', t1: '2019-09-30' }, { t0: '2019-09-30', t1: '2019-12-31' }, { t0: '2019-12-31', t1: '2020-01-31' }];
  const r = L.regimeR1(spy, ps).map(x => x.label);
  assert.deepEqual(r, ['CRASH_BEAR', 'RECOVERY', 'SIDEWAYS', 'BULL']);
});

test('inference helpers: Holm, Newey-West, deterministic block bootstrap', () => {
  assert.deepEqual(L.holm([0.01, 0.04, null, 0.03]).map(x => x === null ? null : Math.round(x * 1e6) / 1e6), [0.03, 0.06, null, 0.06]);
  const x = Array.from({ length: 40 }, (_, i) => Math.sin(i) * 0.01 + 0.002);
  const nw = L.neweyWest(x, 2);
  assert.ok(nw.se > 0 && nw.p > 0 && nw.p < 1);
  const a = L.blockBootstrap(x, { block: 4, replicates: 999, seed: 7 }), b = L.blockBootstrap(x, { block: 4, replicates: 999, seed: 7 });
  assert.equal(a.p, b.p);
  assert.equal(a.state, 'NOT_ROBUST_FEW_BLOCKS');
});

test('perf: CAGR, drawdown and Sharpe on known rows', () => {
  const rows = [{ t0: '2020-01-01', t1: '2020-12-31', r: 0.10, cash: 0 }, { t0: '2020-12-31', t1: '2021-12-31', r: -0.20, cash: 0 }];
  const p = L.perf(rows);
  assert.ok(Math.abs(p.total - (1.1 * 0.8 - 1)) < 1e-6);
  assert.ok(Math.abs(p.maxDD - -0.2) < 1e-6);
});

test('P5c spearman and quintile assignment', () => {
  assert.ok(Math.abs(P5C.spearman([1, 2, 3, 4], [10, 20, 30, 40]) - 1) < 1e-12);
  assert.ok(Math.abs(P5C.spearman([1, 2, 3, 4], [4, 3, 2, 1]) + 1) < 1e-12);
  const rows = Array.from({ length: 150 }, (_, i) => ({ id: 'ref_' + String(i).padStart(3, '0'), score: i, y: i / 1000 }));
  const st = P5C.periodStats(rows);
  assert.equal(st.n, 150);
  assert.ok(st.q[4] > st.q[0]);
  assert.equal(P5C.periodStats(rows.slice(0, 99)).ic, null);
});

test('P6 ledger: costs on traded notional, exits become cash, market filter to cash', () => {
  const mk = (chainId, sid, r, group = 'observed') => ({ chainId, securityId: sid, group, ret: { ZERO: r, LOWER: group === 'bounded' ? -1 : r } });
  const per = [{ t0: '2020-03-31', t1: '2020-06-30', rank: 'r1', qualification: 'QUALIFIED' }, { t0: '2020-06-30', t1: '2020-09-30', rank: 'r2', qualification: 'QUALIFIED' }];
  const members = { '2020-03-31': { members: [mk(1, 'ref_A', 0.10), mk(2, 'ref_B', 0, 'bounded')] }, '2020-06-30': { members: [mk(1, 'ref_A', 0.0), mk(3, 'ref_C', 0.0)] } };
  const ctx = { pop: { members: t0 => members[t0] }, panel: new Map(), filter: new Map([['2020-03-31', { on: true }], ['2020-06-30', { on: false }]]),
    cash: { ret: () => 0.01 }, nextChains: new Map([['2020-03-31', new Set([1, 3])], ['2020-06-30', null]]) };
  const rows = P6.simulate('S1_EW_SP500', ctx, per, 'ZERO', 0.001, 'EFFR');
  // period 1: buy 100 % (traded 1), gross = 0.5*0.10 + 0.5*0 = 0.05
  assert.ok(Math.abs(rows[0].traded - 1) < 1e-12);
  assert.ok(Math.abs(rows[0].r - ((1 - 0.001) * 1.05 - 1)) < 1e-12);
  // drift: A = 0.55/1.05, B exited -> cash 0.5/1.05; targets A 0.5, C 0.5 -> traded |0.5-0.5238| + |0.5-0|
  const wA = 0.55 / 1.05;
  assert.ok(Math.abs(rows[1].traded - (Math.abs(0.5 - wA) + 0.5)) < 1e-12);
  const lo = P6.simulate('S1_EW_SP500', ctx, per, 'LOWER', 0, 'EFFR');
  assert.ok(Math.abs(lo[0].r - (0.5 * 0.10 + 0.5 * -1)) < 1e-12);
  const s6 = P6.simulate('S6_EW_BUFFER_FILTER', ctx, per, 'ZERO', 0, 'EFFR');
  assert.ok(Math.abs(s6[0].equity - 0.9) < 1e-12 && Math.abs(s6[1].equity - 0.45) < 1e-12);
  assert.ok(Math.abs(s6[1].r - (0.45 * 0 + 0.55 * 0.01)) < 1e-12);
});

test('market filter uses ten month-end closes up to t0', () => {
  const dates = [], values = [];
  for (let m = 1; m <= 12; m++) { const d = `2020-${String(m).padStart(2, '0')}-28`; dates.push(d); values.push(100 + m); }
  const f = P6.marketFilter({ dates, values }, '2020-12-31');
  assert.equal(f.sma10m, (103 + 112) * 10 / 2 / 10);
  assert.equal(f.on, true);
});

test('committed evidence: identities, registration link, Python parity', () => {
  const sha = readRegistration().sha256, okSha = new Set([sha, fs.readFileSync(path.join(DOCS, 'registration-1.0.1.sha256'), 'utf8').split(/\s+/)[0]]);
  const a = read('p5a-population-1.0.0.json');
  assert.ok(okSha.has(a.registrationSha256));
  assert.equal(a.periods.length, 47);
  for (const sc of ['ZERO', 'LOWER']) assert.ok(a.aggregates[sc].full.identityMaxAbsResidual < 1e-12);
  const b = read('p5b-signals-1.0.0.json');
  for (const s of Object.values(b.steps)) for (const c of s.cells) assert.ok(Math.abs(c.identityResidual) < 1e-12);
  const p6 = read('p6-strategies-1.0.0.json');
  assert.equal(p6.registrationSha256, sha);
  assert.equal(Object.keys(p6.results.registeredSpan.scenarios.ZERO.BASE.strategies).length, 6);
  for (const x of [a, b, p6]) { assert.equal(x.certificationStatus, 'NOT_CERTIFIED'); assert.equal(x.productionApproved, false); }
  const py = read('python-check-1.0.0.json');
  assert.ok(py.P5a.maxAbsDiffAll < 1e-6);
  assert.equal(py.P5a.withSeriesOrFrameCountMismatchPeriods.length, 0);
  assert.ok(Math.abs(py.P6_S5_LOWVOL_Q1_ZERO_BASE.cagrDiff) < 1e-6);
});

test('1.1.0 correction after independent review: amendment, SPXPOP 1.1.1, scenarios FATE/UPPER, CW_ALL benchmark, span 2013, Python parity', () => {
  const am = fs.readFileSync(path.join(DOCS, 'amendment-1.1.0.json'), 'utf8');
  assert.equal(crypto.createHash('sha256').update(am).digest('hex'), fs.readFileSync(path.join(DOCS, 'amendment-1.1.0.sha256'), 'utf8').split(/\s+/)[0]);
  const reg = readRegistration();
  assert.equal(reg.registration.version, '1.0.2'); // strategies and parameters unchanged
  const a = read('p5a-population-1.1.0.json');
  assert.equal(a.population.rules, '1.1.1');
  assert.deepEqual(Object.keys(a.aggregates), ['ZERO', 'LOWER', 'FATE', 'UPPER']);
  for (const sc of Object.keys(a.aggregates)) assert.ok(a.aggregates[sc].full.identityMaxAbsResidual < 1e-12, sc);
  // the survivorship term is largest under LOWER (its upper bound) and smallest under UPPER
  const sv = sc => a.aggregates[sc].full.terms.survivorshipInIndex.annualizedArithmeticPp;
  assert.ok(sv('LOWER') > sv('FATE') && sv('LOWER') > sv('ZERO') && sv('UPPER') < sv('ZERO') && sv('UPPER') < sv('FATE'));
  assert.match(a.scenarios.LOWER, /UPPER bound of the survivorship term/);
  assert.match(a.scenarios.ZERO, /NOT a bound/);
  assert.ok(a.takeoverPremium.n >= 5 && a.takeoverPremium.median > 0 && a.takeoverPremium.p75 >= a.takeoverPremium.median);
  assert.equal(a.aggregates.ZERO.from2013_03_rule101.from, '2013-03-31');
  for (const k of Object.keys(a.aggregates.ZERO.full.terms)) assert.ok('cagrDiffPp' in a.aggregates.ZERO.full.terms[k]);
  // FATE/UPPER mapping on the scenario object of one member
  const p6 = read('p6-strategies-1.1.0.json');
  assert.equal(p6.registrationSha256, reg.sha256);
  assert.equal(p6.populationRules, '1.1.1');
  assert.match(p6.execution, /same-bar/);
  const z = p6.results.registeredSpan.scenarios.ZERO.BASE;
  assert.ok(z.references.CW_ALL && z.multipleTestingVsCwAll.family === 6);
  for (const s of Object.values(z.strategies)) assert.ok(s.vsCwAll && Number.isFinite(s.vsCwAll.cagrDiff) && Number.isFinite(s.boundedWeightHeldMean));
  assert.equal(p6.results.span2013_rule101.from, '2013-03-31');
  const d = read('p5d-attribution-1.1.0.json');
  assert.doesNotMatch(d.population.text, /came from 2000-2012 and does not exist/);
  assert.match(d.population.text, /not a causal attribution/);
  assert.ok(d.strategies.S5_LOWVOL_Q1.vsCwAllPp !== undefined && d.population.survivorshipInIndexByScenario.FATE);
  const py = read('python-check-1.1.0.json');
  assert.ok(py.P5a.maxAbsDiffAll < 1e-6);
  assert.equal(py.P5a.withSeriesOrFrameCountMismatchPeriods.length, 0);
  assert.ok(Math.abs(py.P6_S5_LOWVOL_Q1_ZERO_BASE.cagrDiff) < 1e-6 && Math.abs(py.P6_S5_LOWVOL_Q1_ZERO_BASE_span2013.cagrDiff) < 1e-6);
  assert.ok(py.takeoverPremium.nEqual && py.takeoverPremium.maxAbsDiff < 1e-9);
  // the 1.0.0 results stay unchanged next to 1.1.0
  assert.equal(read('p5a-population-1.0.0.json').population.rules, '1.1.0');
});

test('scenario mapping FATE/UPPER of bounded members (lib.FATE_CLASS)', () => {
  assert.equal(L.FATE_CLASS.IDENTITY_BREAK, 'TAKEOVER');
  assert.equal(L.FATE_CLASS.DELISTED_BANKRUPTCY, 'DELISTING');
  assert.equal(L.FATE_CLASS.TEMPORARY_ABSENCE, 'INDEX_CHANGE');
  assert.equal(L.FATE_CLASS.NO_CIK, 'UNKNOWN');
  assert.equal(L.quant([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(L.quant([1, 2, 3, 4], 0.75), 3.25);
});
