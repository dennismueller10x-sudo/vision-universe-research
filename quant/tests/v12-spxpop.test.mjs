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

test('rules: frozen files match their sha256 and the code implements rules-1.1.1', () => {
  for (const v of ['1.0.0', '1.0.1', '1.1.0', '1.1.1']) {
    const expected = fs.readFileSync(path.join(DIR, `rules-${v}.sha256`), 'utf8').split(/\s+/)[0];
    assert.equal(sha(fs.readFileSync(path.join(DIR, `rules-${v}.json`))), expected, v);
  }
  const r = read('rules-1.1.1.json');
  assert.equal(r.ruleVersion, IP.RULE.version);
  assert.match(r.identityChain.identityBreak, /log 2/);
  assert.equal(r.amendments.find(a => a.version === '1.1.1').afterSightOfResults, true);
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
    const man = read('manifest-1.1.1.json');
    fs.copyFileSync(path.join(DIR, man.dataFile), path.join(tmp, man.dataFile));
    fs.writeFileSync(path.join(tmp, 'manifest-1.1.1.json'), JSON.stringify({ ...man, dataSha256: '0'.repeat(64) }));
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
  const man = read('manifest-1.1.1.json');
  const buf = fs.readFileSync(path.join(DIR, man.dataFile));
  assert.equal(sha(buf), man.dataSha256);
  const sum = read('summary-1.1.1.json');
  for (const k of ['studyId', 'ruleVersion', 'dataSource', 'listingIdentity', 'returnBasis', 'availability', 'reproHash', 'scope']) assert.ok(sum[k], k);
  assert.equal(sum.certificationStatus, 'NOT_CERTIFIED'); assert.equal(sum.productionApproved, false); assert.equal(sum.returnBasis, 'PRICE_RETURN');
  const txt = require('node:zlib').gunzipSync(buf).toString('utf8');
  assert.equal(/"[0-9]{3}[0-9A-Z]{5}[0-9]"/.test(txt), false);
  const val = read('validation-1.1.1.json');
  assert.ok(val.returnVsSeries.exactDates.n > 1000 && val.returnVsSeries.exactDates.p99Pp < 0.1);
  assert.ok(val.splitVsProvider.agreeNone + val.splitVsProvider.agreeSplit > 0.97 * val.splitVsProvider.pairs);
});

test('1.1.1 identity break at mergers: rule, Broadcom 2015/16 and the 1.1.0 data still loadable', () => {
  // rule: C3/C4 tier, share discontinuity, every hypothesis more than doubles relative to the index
  assert.equal(IP.identityBreak({ tier: 'C3_CIK', cls: 'AMBIGUOUS_CA', point: null, lo: 2.004, hi: 2.004 }, 0.072).break, true);
  assert.equal(IP.identityBreak({ tier: 'C3_CIK', cls: 'SHARE_CHANGE', point: 1.688, lo: 1.688, hi: 1.688 }, 0.03).break, true);
  assert.equal(IP.identityBreak({ tier: 'C2_NAME', cls: 'AMBIGUOUS_CA', point: null, lo: 6.6, hi: 7.8 }, 0.2).break, false); // same name = same security
  assert.equal(IP.identityBreak({ tier: 'C3_CIK', cls: 'NONE', point: 3.17, lo: 3.17, hi: 3.17 }, 0.2).break, false); // no share discontinuity
  assert.equal(IP.identityBreak({ tier: 'C3_CIK', cls: 'SHARE_CHANGE', point: -0.79, lo: -0.79, hi: -0.79 }, 0.0).break, false); // downward (special dividend, spin-off)
  assert.equal(IP.identityBreak({ tier: 'C4_FUZZY', cls: 'AMBIGUOUS_CA', point: null, lo: -0.67, hi: 5.6 }, 0.0).break, false); // one hypothesis plausible
  assert.throws(() => IP.identityBreak({ tier: 'C3_CIK', cls: 'SHARE_CHANGE', point: 1 }, -1), /IDENTITY_BREAK_INPUT/);
  assert.ok(IP.FATES.indexOf('IDENTITY_BREAK') === IP.FATES.length - 1);
  const pop = IP.createIndexPopulation({ optIn: true });
  const m = pop.members('PIT_SP500', '2015-09-30').members.filter(x => /broadcom/i.test(x.name));
  assert.equal(m.length, 1);
  assert.deepEqual([m[0].status, m[0].fate, m[0].return, m[0].lower, m[0].upper], ['BOUNDED_EXIT', 'IDENTITY_BREAK', null, -1, null]);
  const val = read('validation-1.1.1.json');
  assert.equal(val.identityBreaks.cases.length, 13);
  assert.equal(val.totals.identityBreaksMerger, 13);
  assert.ok(val.identityBreaks.cases.every(c => (c.tier === 'C3_CIK' || c.tier === 'C4_FUZZY') && c.excessLog > Math.log(2)));
  // no remaining chained case of the same signature
  assert.ok(val.identityBreaks.remainingOver100pct.every(c => !((c.tier === 'C3_CIK' || c.tier === 'C4_FUZZY') && (c.splitClass === 'SHARE_CHANGE' || c.splitClass === 'AMBIGUOUS_CA') && c.excessLog > Math.log(2))));
  // old published state unchanged and loadable
  const old = IP.createIndexPopulation({ optIn: true, ruleVersion: '1.1.0' });
  assert.equal(old.ruleVersion, '1.1.0');
  const mo = old.members('PIT_SP500', '2015-09-30').members.filter(x => /broadcom/i.test(x.name));
  assert.equal(mo[0].status, 'BOUNDED_AMBIGUOUS_CA');
  assert.throws(() => IP.createIndexPopulation({ optIn: true, ruleVersion: '1.0.1' }), /UNKNOWN_VERSION/);
  const p0 = old.periods('PIT_SP500').find(p => p.t0 === '2015-09-30'), p1 = pop.periods('PIT_SP500').find(p => p.t0 === '2015-09-30');
  assert.equal(p0.errorPp, -0.1174); assert.equal(p1.errorPp, -0.4583); assert.equal(p1.qualification, 'QUALIFIED');
});
