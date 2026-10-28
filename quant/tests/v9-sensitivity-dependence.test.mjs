import test from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const D = require('../../scripts/quant/v9/sensitivity/dependence.cjs'), V = require('../engines/research-validation.cjs');

function noise(seed, n) { let s = seed; const x = []; for (let i = 0; i < n; i++) { s = D.xorshift(s); x.push(s / 4294967296 - 0.5); } return x; }
function ar1(phi, seed, n) { const e = noise(seed, n), x = [e[0]]; for (let i = 1; i < n; i++) x.push(phi * x[i - 1] + e[i]); return x; }
function weeks(n) { const out = [], t = Date.UTC(2000, 0, 7); for (let i = 0; i < n; i++) out.push(new Date(t + i * 7 * 86400000).toISOString().slice(0, 10)); return out; }

test('chi-square tail matches known quantiles', () => {
  assert.ok(Math.abs(D.chi2Sf(3.841458820694124, 1) - 0.05) < 1e-12);
  assert.ok(Math.abs(D.chi2Sf(18.307038053275146, 10) - 0.05) < 1e-12);
  assert.ok(Math.abs(D.chi2Sf(7.814727903251178, 3) - 0.05) < 1e-12);
  assert.equal(D.chi2Sf(0, 4), 1);
});

test('aggregate keeps zero-event dates and centres the linearised series', () => {
  const cal = weeks(10), rows = [{ date: cal[1], value: 0.1 }, { date: cal[1], value: 0.3 }, { date: cal[5], value: -0.1 }];
  const a = D.aggregate(cal, rows);
  assert.equal(a.T, 10); assert.equal(a.n, 3); assert.equal(a.occupiedDates, 2);
  assert.ok(Math.abs(a.estimate - 0.1) < 1e-15);
  assert.ok(Math.abs(a.z.reduce((s, v) => s + v, 0)) < 1e-15); assert.equal(a.z[0], 0);
  assert.throws(() => D.aggregate(cal, [{ date: '1999-01-01', value: 1 }]), /OBSERVATION_NOT_ON_CALENDAR/);
});

test('ACF, Bartlett LRV and Ljung-Box basics', () => {
  const x = noise(11, 500), r = D.acf(x, 5), g = D.autocovariances(x, 0)[0];
  assert.equal(r[0], 1); assert.ok(Math.abs(D.bartlettLrv(x, 0) - g) < 1e-15);
  const lb = D.ljungBox(r, 500, 5); assert.ok(lb.q > 0 && lb.pValue > 0.01);
  const y = ar1(0.9, 3, 500), lby = D.ljungBox(D.acf(y, 10), 500, 10); assert.ok(lby.pValue < 1e-10);
  assert.ok(D.bartlettLrv(y, 30) > 5 * D.bartlettLrv(y, 0));
});

test('Politis-White block length grows with dependence and respects the cap', () => {
  const w = D.politisWhite(noise(5, 1500)), a = D.politisWhite(ar1(0.8, 5, 1500)), b = D.politisWhite(ar1(0.99, 5, 1500));
  assert.ok(w.bCB < 5, 'white noise ' + w.bCB); assert.ok(a.bCB > 10 && a.bCB > w.bCB);
  assert.ok(Math.abs(a.bCB / a.bSB - Math.cbrt(1.5)) < 1e-12, 'PPW 2009: D_SB = 2 g0^2, D_CB = 4/3 g0^2'); assert.ok(b.bCB <= b.bMax);
});

test('KPSS, CUSUM and ADF react to the expected alternatives', () => {
  const x = noise(17, 800), trend = x.map((v, i) => v + i / 400), shift = x.map((v, i) => v + (i < 400 ? 0 : 0.2));
  assert.equal(D.kpss(x, 12).reject05, false); assert.equal(D.kpss(trend, 12).reject05, true);
  assert.equal(D.cusum(x, 12).reject05, false); assert.equal(D.cusum(shift, 12).reject05, true);
  let w = 0; const rw = x.map(v => (w += v));
  assert.equal(D.adf(x, 4).rejectUnitRoot05, true); assert.equal(D.adf(rw, 4).rejectUnitRoot05, false);
});

test('CBB helper reproduces the engine bootstrap exactly; SB/MBB are deterministic and sensible', () => {
  const cal = weeks(300), vals = noise(23, 300), rows = [];
  cal.forEach((d, i) => { if (i % 3) rows.push({ id: 'r' + i, date: d, value: vals[i] + 0.01 }); });
  const cfg = { calendar: cal, blockLength: 13, minimumBlockLength: 13, replicates: 199, seed: 1729, alpha: 0.05, assumption: 'CONDITIONAL_WEAK_STATIONARITY_AND_MIXING' };
  const eng = V.inferTemporalBlockMean(cfg, rows), a = D.aggregate(cal, rows);
  assert.deepEqual(D.blockBootstrap('CBB', a.sums, a.counts, 13, 199, 1729), eng.bootstrap);
  const s = D.summarizeBootstrap(eng.bootstrap, eng.estimate, 0.05); assert.equal(s.pValue, eng.pValue); assert.deepEqual(s.ci, eng.ci);
  const sb = D.blockBootstrap('SB', a.sums, a.counts, 13, 199, 1729), mbb = D.blockBootstrap('MBB', a.sums, a.counts, 13, 199, 1729);
  assert.deepEqual(sb, D.blockBootstrap('SB', a.sums, a.counts, 13, 199, 1729)); assert.equal(mbb.length, 199);
  const ratio = D.summarizeBootstrap(sb, a.estimate, 0.05).se / s.se; assert.ok(ratio > 0.6 && ratio < 1.6, String(ratio));
  assert.throws(() => D.blockBootstrap('XX', a.sums, a.counts, 13, 9, 1), /BOOTSTRAP_KIND/);
});

test('split-period Wald and overlap theory', () => {
  const cal = weeks(400), v = noise(29, 400);
  const same = D.splitPeriods(D.aggregate(cal, cal.map((d, i) => ({ date: d, value: v[i] }))), 4, 52);
  const diff = D.splitPeriods(D.aggregate(cal, cal.map((d, i) => ({ date: d, value: v[i] + (i < 200 ? 0.3 : -0.3) }))), 4, 52);
  assert.equal(same.df, 3); assert.ok(same.pValue > 0.01); assert.ok(diff.pValue < 1e-6);
  const o = D.overlapSummary(D.acf(v, 30), 4, 400);
  assert.equal(o.theoreticalOverlapLags, 3); assert.deepEqual(o.theoreticalAcfIidWeekly, [0.75, 0.5, 0.25]);
});

test('linear solver matches a hand-solved system', () => {
  const x = D.solveLinear([[2, 1], [1, 3]], [3, 5]); assert.ok(Math.abs(x[0] - 0.8) < 1e-14 && Math.abs(x[1] - 1.4) < 1e-14);
});
