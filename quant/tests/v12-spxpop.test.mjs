import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const DIR = path.join(ROOT, 'docs/quant-recovery/v12/spxpop');
const IP = require(path.join(ROOT, 'quant/engines/research-index-population.cjs'));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const read = f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));

test('rules: frozen files match their sha256 and the code implements rules-1.1.0', () => {
  for (const v of ['1.0.0', '1.0.1', '1.1.0']) {
    const expected = fs.readFileSync(path.join(DIR, `rules-${v}.sha256`), 'utf8').split(/\s+/)[0];
    assert.equal(sha(fs.readFileSync(path.join(DIR, `rules-${v}.json`))), expected, v);
  }
  const r = read('rules-1.1.0.json');
  assert.equal(r.ruleVersion, IP.RULE.version);
  assert.deepEqual(IP.RATIOS.map(x => x.label).sort(), [...r.splitDetection.ratios].sort());
  assert.match(r.splitDetection.ratioTolerance, /0\.15/);
  assert.equal(IP.RULE.RATIO_TOL, 0.15);
  assert.equal(r.amendments.find(a => a.version === '1.1.0').afterSightOfResults, true);
  assert.equal(r.amendments.find(a => a.version === '1.0.1').afterSightOfResults, false);
});

test('classifySplit: no trigger, registered splits incl. the 1.0.1 failure cases, share change, ambiguity', () => {
  assert.equal(IP.classifySplit(1.05, 1.1, 0.05).cls, 'NONE');
  const two = IP.classifySplit(1.95, 0.55, 0.05);
  assert.equal(two.cls, 'SPLIT'); assert.equal(two.factor, 2); assert.ok(Math.abs(two.point - 0.10) < 1e-12);
  // 1.0.1 failures (rules-1.1.0 findings): q off the ratio by more than 5 %, Booking 25:1 outside the forward ratios
  assert.deepEqual([IP.classifySplit(3.184, 0.394, -0.053).cls, IP.classifySplit(3.184, 0.394, -0.053).factor], ['SPLIT', 3]); // Tesla 2022
  assert.deepEqual([IP.classifySplit(10.703, 0.108, 0.05).cls, IP.classifySplit(10.703, 0.108, 0.05).factor], ['SPLIT', 10]); // Broadcom 2024
  assert.deepEqual([IP.classifySplit(24.465, 0.0423, 0.27).cls, IP.classifySplit(24.465, 0.0423, 0.27).factor], ['SPLIT', 25]); // Booking 2026
  // Nasdaq-100 capping (q 0.787) is no longer a 4:5 reverse split
  assert.equal(IP.classifySplit(0.787, 1.235, 0.05).cls, 'SHARE_CHANGE');
  assert.equal(IP.classifySplit(1.2, 0.9, 0.0).cls, 'SHARE_CHANGE');
  const amb = IP.classifySplit(2, Math.SQRT1_2, 0);
  assert.equal(amb.cls, 'AMBIGUOUS_CA'); assert.equal(amb.point, null);
  assert.ok(amb.lo < 0 && amb.hi > 0);
  assert.throws(() => IP.classifySplit(0, 1, 0), /CLASSIFY_INPUT/);
});

test('tolerance, period qualification and span rules', () => {
  assert.equal(IP.tolerancePp('2020-03-31', '2020-06-30'), 0.5);
  assert.ok(Math.abs(IP.tolerancePp('2010-03-31', '2010-09-30') - 0.5 * Math.sqrt(2)) < 1e-12);
  assert.equal(IP.tolerancePp('2008-09-30', '2009-09-30'), 1);
  assert.equal(IP.tolerancePp('2020-03-31', '2020-06-30', true), 0.75);
  const t = ['2020-03-31', '2020-06-30'];
  assert.equal(IP.qualifyPeriod({ coveredW: 0.99, boundedW: 0.01, errorPp: 0.2 }, ...t), 'QUALIFIED');
  assert.equal(IP.qualifyPeriod({ coveredW: 0.99, boundedW: 0.01, errorPp: 0.6 }, ...t), 'NOT_QUALIFIED_ERROR');
  assert.equal(IP.qualifyPeriod({ coveredW: 0.96, boundedW: 0.04, errorPp: 0 }, ...t), 'NOT_QUALIFIED_COVERAGE');
  assert.equal(IP.qualifyPeriod({ coveredW: 0.99, boundedW: 0.01, errorPp: null, internalAgree: 0.995 }, ...t), 'QUALIFIED_INTERNAL');
  assert.equal(IP.qualifyPeriod({ coveredW: 0.99, boundedW: 0.01, errorPp: null, internalAgree: 0.98 }, ...t), 'NOT_QUALIFIED_NO_REFERENCE');
  const Q = 'QUALIFIED', N = 'NOT_QUALIFIED_ERROR';
  assert.equal(IP.qualifiedSpan([N, Q, Q, Q]), 1);
  assert.equal(IP.qualifiedSpan([Q, N, N, Q, Q]), 3);
  assert.equal(IP.qualifiedSpan([N, N]), null);
  assert.equal(IP.qualifiedSpan([Q, Q, Q, Q, Q, Q, Q, Q, Q, N, Q]), 0);
});

test('loader is opt-in and fail-closed', () => {
  assert.throws(() => IP.createIndexPopulation(), /OPT_IN_REQUIRED/);
  assert.throws(() => IP.createIndexPopulation({ optIn: 'yes' }), /OPT_IN_REQUIRED/);
  assert.throws(() => IP.createIndexPopulation({ optIn: true, boundedAs: 'MID' }), /BOUNDED_SCENARIO/);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v12-spxpop-'));
  try {
    const man = read('manifest-1.1.0.json');
    fs.copyFileSync(path.join(DIR, man.dataFile), path.join(tmp, man.dataFile));
    fs.writeFileSync(path.join(tmp, 'manifest-1.1.0.json'), JSON.stringify({ ...man, dataSha256: '0'.repeat(64) }));
    assert.throws(() => IP.createIndexPopulation({ optIn: true, dir: tmp }), /DATA_HASH_MISMATCH/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  const pop = IP.createIndexPopulation({ optIn: true });
  assert.throws(() => pop.members('PIT_SP500', '2004-09-30'), /PERIOD_NOT_QUALIFIED/);
  assert.throws(() => pop.periods('NOPE'), /UNKNOWN/);
  const all = IP.createIndexPopulation({ optIn: true, allowUnqualified: true });
  assert.throws(() => all.members('PIT_R3000', '2020-03-31'), /NO_MEMBER_DATA/); // IWV member columns are not published
  assert.throws(() => all.members('PIT_DJIA', '2020-01-31'), /NO_MEMBER_DATA|NO_PERIOD/);
  const early = all.members('PIT_SP500', '2004-09-30');
  assert.equal(early.qualification, 'NOT_QUALIFIED_COVERAGE');
  assert.ok(early.members.some(m => m.group === 'bounded' && m.return === null));
});

test('published population: weights, returns and the fund consistency of qualified periods', () => {
  const pop = IP.createIndexPopulation({ optIn: true, boundedAs: 'ZERO' });
  const ps = pop.periods('PIT_SP500');
  assert.equal(ps.length, 52);
  const s = pop.populations().find(p => p.id === 'PIT_SP500');
  assert.equal(s.qualifiedSpanFrom, '2009-09-30');
  assert.equal(s.qualifiedSpanTo, '2026-06-30');
  for (const p of ps.filter(x => x.qualification === 'QUALIFIED')) {
    assert.ok(Math.abs(p.errorPp) <= p.tolerancePp + 1e-9, p.t0);
    assert.ok(p.observedW + p.estimatedW >= 0.97 && p.boundedW <= 0.03, p.t0);
    const m = pop.members('PIT_SP500', p.t0);
    const wsum = m.members.reduce((a, x) => a + x.weight, 0);
    assert.ok(Math.abs(wsum - 1) < 1e-4, p.t0 + ' weights ' + wsum);
    // index point return from the published rows (ambiguous at the midpoint, as in the builder)
    const r = m.members.reduce((a, x) => a + x.weight * (x.return != null ? x.return : (x.lower + x.upper) / 2), 0);
    assert.ok(Math.abs(r - p.rPoint) < 2e-4, p.t0 + ' ' + r + ' vs ' + p.rPoint);
    for (const x of m.members) {
      assert.ok(IP.STATUS.includes(x.status));
      if (x.group !== 'bounded') assert.ok(Number.isFinite(x.return) && x.return > -1, x.name);
      if (x.splitClass === 'SPLIT') assert.ok(x.splitFactor > 0 && x.splitFactor !== 1);
    }
  }
  const r1000 = pop.periods('PIT_R1000');
  assert.equal(r1000.length, 54);
  assert.ok(r1000.filter(p => p.t0 >= '2019-09-30').every(p => p.qualification === 'QUALIFIED' && p.referenceKind === 'NPORT_TR_MINUS_SPY_DIVIDEND_GAP'));
});

test('evidence files: manifest hash, contract fields, no CUSIP in clear text', () => {
  const man = read('manifest-1.1.0.json');
  const buf = fs.readFileSync(path.join(DIR, man.dataFile));
  assert.equal(sha(buf), man.dataSha256);
  const sum = read('summary-1.1.0.json');
  for (const k of ['studyId', 'ruleVersion', 'dataSource', 'listingIdentity', 'returnBasis', 'availability', 'reproHash', 'scope']) assert.ok(sum[k], k);
  assert.equal(sum.certificationStatus, 'NOT_CERTIFIED'); assert.equal(sum.productionApproved, false); assert.equal(sum.returnBasis, 'PRICE_RETURN');
  const txt = require('node:zlib').gunzipSync(buf).toString('utf8');
  assert.equal(/"[0-9]{3}[0-9A-Z]{5}[0-9]"/.test(txt), false);
  const val = read('validation-1.1.0.json');
  assert.ok(val.returnVsSeries.exactDates.n > 1000 && val.returnVsSeries.exactDates.p99Pp < 0.1);
  assert.ok(val.splitVsProvider.agreeNone + val.splitVsProvider.agreeSplit > 0.97 * val.splitVsProvider.pairs);
});
