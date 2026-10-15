// V4 measurement layer: one regression per closed V3 adversarial finding (A3-A12) plus oracle/certification paths.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { MEASUREMENT_POLICY_V4, terminalFactorV4, causalQuarantineTerminal, createStaleTracker } from '../research/v4/measurement/measurement-policy-v4.mjs';
import { createBook, executeTargets, settleTerminals, markClose, reconcileBook, DUST_BOOK_VALUE_CAP } from '../research/v4/measurement/accounting-v4.mjs';
import { classifyPriceLevel, priceSanityCensus, applyPriceSanityQuarantine } from '../research/v4/measurement/price-sanity-v4.mjs';
import { parseFrenchSections, ewMarketOracle, momentumOracle } from '../research/v4/oracle/french-library-v4.mjs';
import { buildConstructions, holdingReturn, breakpoints, bucketOf } from '../research/v4/oracle/constructions-v4.mjs';
import { compareSeries, compareEwMarket } from '../research/v4/oracle/compare-v4.mjs';
import { runEqualWeightBook } from '../research/v4/oracle/book-v4.mjs';
import { truncationReview, recomputeDividends, assembleReview } from '../research/v4/review/review-v4.mjs';
import { certifyV4 } from '../research/v4/completion-v4.mjs';
import { importClosureV4, ENTRY_POINTS_V4, freezeIdOf, canonicalJson } from '../research/v4/freeze-v4.mjs';
import { zipMember } from '../research/v4/capture-oracle-v4.mjs';
import { exchangeOf } from '../research/v4/measurement/price-sanity-v4.mjs';
import { calibrateV4 } from '../research/v4/run-calibration-v4.mjs';
import { syntheticData, identityOracle, weekdays } from './v4-fixtures.mjs';

const cfg = { slippageBpsPerSide: 0, commissionBpsPerSide: 0 };
const bar = (date, px, extra = {}) => ({ date, open: px, high: px, low: px, close: px, volume: 100, rawClose: px, dividend: 0, ...extra });

test('A5: data-quarantine terminal is booked on the first session on/after max(from, observedAt), never on `from` alone', () => {
  const calendar = ['2020-01-02', '2020-01-03', '2020-01-06', '2020-01-07'];
  const s = { bars: [bar('2020-01-02', 10)], dataQuarantine: { from: '2020-01-03', observedAt: '2020-01-05' }, terminal: { date: '2020-01-03', kind: 'DATA_QUARANTINE' } };
  const t = causalQuarantineTerminal(s, calendar);
  assert.equal(t.date, '2020-01-06');
  assert.equal(t.lastClose, 10);
});

test('A4/A5: data events settle at the last valid close (factor 1); economic delistings keep the frozen -30 % baseline', () => {
  assert.equal(terminalFactorV4({ kind: 'DATA_QUARANTINE' }, 'UNKNOWN_PROCEEDS_MINUS_30_PERCENT'), 1);
  assert.equal(terminalFactorV4({ kind: 'SECURITY_UNAVAILABLE' }, 'UNKNOWN_PROCEEDS_MINUS_30_PERCENT', { dataEventScenario: 'UNKNOWN_PROCEEDS_MINUS_30_PERCENT' }), 0.7);
  assert.equal(terminalFactorV4({ kind: 'DELISTED', delistClass: 'UNKNOWN' }, 'UNKNOWN_PROCEEDS_MINUS_30_PERCENT'), 0.7);
  assert.equal(terminalFactorV4({ kind: 'DELISTED', delistClass: 'ACQUISITION' }, 'UNKNOWN_PROCEEDS_MINUS_30_PERCENT'), 1);
  assert.equal(terminalFactorV4({ kind: 'DELISTED' }, 'DISTRESS_ZERO_OTHER_MINUS_30', { distress: true }), 0);
  assert.throws(() => terminalFactorV4({ kind: 'DELISTED' }, 'MADE_UP'), /UNKNOWN_ECONOMIC_SCENARIO/);
});

test('A4: a held position without a bar is settled after the stale limit instead of being carried forever', () => {
  const t = createStaleTracker();
  const held = ['x'];
  t.observe('d0', held, new Map([['x', { close: 10, volume: 5 }]]));
  let exceeded = [];
  for (let i = 1; i <= MEASUREMENT_POLICY_V4.staleCarryMaxSessions; i++) exceeded = t.observe('d' + i, held, new Map());
  assert.deepEqual(exceeded, []);
  assert.deepEqual(t.observe('dx', held, new Map()), ['x']);
  // a zero-volume bar with an unchanged close is not a fresh price
  const u = createStaleTracker();
  u.observe('a', held, new Map([['x', { close: 10, volume: 5 }]]));
  u.observe('b', held, new Map([['x', { close: 10, volume: 0 }]]));
  assert.equal(u.staleSessions('x'), 1);
});

test('A8 regression (V3 52W failure): residual at a 2e11 adjusted price is kept (value-aware), not silently deleted', () => {
  const book = createBook(100000);
  const px = 1.97e11;
  executeTargets(book, [{ id: 'z', weight: 0.5 }, { id: 'y', weight: 0.5 }], new Map([['z', bar('2020-01-02', px)], ['y', bar('2020-01-02', 10)]]), '2020-01-02', cfg, { asOf: '2020-01-01' });
  markClose(book, new Map([['z', bar('2020-01-02', px)], ['y', bar('2020-01-02', 10)]]), '2020-01-02');
  // rebalance leaving a residual of ~8e-11 shares (value ~15.6): V3 deleted it because shares < 1e-10
  const shares = book.positions.get('z').shares, keep = 8e-11;
  const w = (keep * px) / 100000;
  executeTargets(book, [{ id: 'z', weight: w }, { id: 'y', weight: 0.5 }], new Map([['z', bar('2020-01-03', px)], ['y', bar('2020-01-03', 10)]]), '2020-01-03', cfg, { asOf: '2020-01-02' });
  markClose(book, new Map([['z', bar('2020-01-03', px)], ['y', bar('2020-01-03', 10)]]), '2020-01-03');
  assert.ok(shares > keep);
  assert.ok(book.positions.has('z'), 'position worth ~15.6 must stay on the book');
  assert.equal(book.dustWriteOffs.length, 0);
  assert.equal(reconcileBook(book).pass, true);
});

test('A8: summed dust above the book cap fails closed', () => {
  const book = createBook(100000);
  book.dustWriteOffs.push({ id: 'q', date: 'd', shares: 1, cost: 0, dividends: 0, markValue: DUST_BOOK_VALUE_CAP + 0.5 });
  book.curve.push({ date: 'd', equity: 100000 });
  assert.equal(reconcileBook(book).pass, false);
});

test('A12: reconciliation tolerance is gross-flow based and independent of final equity size', () => {
  const book = createBook(100000);
  executeTargets(book, [{ id: 'a', weight: 1 }], new Map([['a', bar('2020-01-02', 10)]]), '2020-01-02', cfg, { asOf: '2020-01-01' });
  markClose(book, new Map([['a', bar('2020-01-02', 10)]]), '2020-01-02');
  const r = reconcileBook(book);
  assert.equal(r.toleranceBasis, 'ABSOLUTE_FLOOR_PLUS_GROSS_FLOW_BINARY64_ENVELOPE');
  assert.ok(r.tolerance < 1e-5 && r.pass);
});

test('V3 regression kept: no order fills without a real source bar; data-event settlement may use the last valid close', () => {
  const book = createBook(1000);
  executeTargets(book, [{ id: 'a', weight: 1 }], new Map(), '2020-01-02', cfg, { asOf: '2020-01-01' });
  assert.equal(book.positions.size, 0);
  assert.equal(book.rejections[0].reason, 'NO_EXECUTABLE_OPEN');
  executeTargets(book, [{ id: 'a', weight: 1 }], new Map([['a', bar('2020-01-03', 10)]]), '2020-01-03', cfg, { asOf: '2020-01-02' });
  markClose(book, new Map([['a', bar('2020-01-03', 10)]]), '2020-01-03');
  settleTerminals(book, new Map(), [{ id: 'a', date: '2020-01-06', kind: 'DATA_QUARANTINE', lastClose: 10 }], '2020-01-06', cfg, 'UNKNOWN_PROCEEDS_MINUS_30_PERCENT');
  assert.equal(book.positions.size, 0);
  assert.ok(Math.abs(book.cash - 1000) < 1e-9, 'data quarantine is not an economic delisting');
  const b2 = createBook(1000);
  executeTargets(b2, [{ id: 'a', weight: 1 }], new Map([['a', bar('2020-01-03', 10)]]), '2020-01-03', cfg, { asOf: '2020-01-02' });
  assert.throws(() => settleTerminals(b2, new Map(), [{ id: 'a', date: '2020-01-06', kind: 'DELISTED' }], '2020-01-06', cfg, 'UNKNOWN_PROCEEDS_MINUS_30_PERCENT'), /TERMINAL_WITHOUT_BAR/);
});

test('A9: >1e6 levels are classified, not clamped; only proven defects are quarantined', () => {
  const dates = weekdays('2020-01-01', '2020-03-31');
  const mk = (id, f) => ({ id, listing: { id: `tiingo:NASDAQ:${id}:2019-01-02` }, bars: dates.map((d, i) => f(d, i)) });
  const serial = mk('SERIAL', (d, i) => ({ date: d, rawClose: i < 30 ? 0.05 : 5, close: 2e9, splitFactor: i === 30 ? 0.01 : 1, volume: 10 }));
  const artifact = mk('ARTIFACT', (d, i) => ({ date: d, rawClose: 5, close: 2e9, splitFactor: i === 30 ? 0.0001 : 1, volume: 10 }));
  const unit = mk('UNIT', (d, i) => ({ date: d, rawClose: i < 30 ? 5 : 5000, close: 2e6, splitFactor: 1, volume: 10 }));
  const plain = mk('PLAIN', (d) => ({ date: d, rawClose: 5, close: 5, splitFactor: 1, volume: 10 }));
  assert.equal(classifyPriceLevel(serial).cls, 'GENUINE_ADJUSTED_LEVEL_SERIAL_REVERSE_SPLITS');
  assert.equal(classifyPriceLevel(artifact).cls, 'SPLIT_ARTIFACT');
  assert.equal(classifyPriceLevel(unit).cls, 'UNIT_ISSUE');
  assert.equal(classifyPriceLevel(plain), null);
  const census = priceSanityCensus([serial, artifact, unit, plain]);
  assert.equal(census.affected, 3);
  assert.equal(census.defectQuarantined, 2);
  const out = applyPriceSanityQuarantine({ securities: [serial, artifact, unit, plain] }, census).data.securities;
  assert.equal(out.find((s) => s.id === 'SERIAL').bars.length, dates.length);
  assert.equal(out.find((s) => s.id === 'ARTIFACT').bars.length, 30);
  assert.match(out.find((s) => s.id === 'ARTIFACT').dataQuarantine.reason, /SPLIT_ARTIFACT/);
});

test('French parser: monthly sections, missing values null, EW market is firm-count weighted', () => {
  const head = ',Lo 10,2-Dec,3-Dec,4-Dec,5-Dec,6-Dec,7-Dec,8-Dec,9-Dec,Hi 10';
  const text = ['x', '  Average Equal Weighted Returns -- Monthly', head, '201801, 1,1,1,1,1,1,1,1,1, 3', '201802, -99.99,1,1,1,1,1,1,1,1,1', '', '  Number of Firms in Portfolios', head, '201801, 10,10,10,10,10,10,10,10,10,30', '201802, 1,1,1,1,1,1,1,1,1,1', ''].join('\n');
  const s = parseFrenchSections(text);
  const ew = ewMarketOracle(s, { from: '2018-01', to: '2018-12' });
  assert.equal(ew[0].ret, (90 * 1 + 30 * 3) / 120 / 100);
  assert.equal(ew[1].ret, null);
  const momText = ['  Average Equal Weighted Returns -- Monthly', ',Lo PRIOR,PRIOR 2,PRIOR 3,PRIOR 4,PRIOR 5,PRIOR 6,PRIOR 7,PRIOR 8,PRIOR 9,Hi PRIOR', '201801, 1,2,3,4,5,6,7,8,9,10', '', '  Number of Firms in Portfolios', ',Lo PRIOR,PRIOR 2,PRIOR 3,PRIOR 4,PRIOR 5,PRIOR 6,PRIOR 7,PRIOR 8,PRIOR 9,Hi PRIOR', '201801, 1,1,1,1,1,1,1,1,1,1'].join('\n');
  assert.equal(momentumOracle(parseFrenchSections(momText), { from: '2018-01', to: '2018-12' })[0].buckets[9], 0.1);
});

test('oracle capture: minimal ZIP reader extracts a deflated member exactly', () => {
  const data = Buffer.from('hello french library'), comp = zlib.deflateRawSync(data), name = Buffer.from('a.csv');
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(0, 42);
  const cdOffset = 30 + name.length + comp.length, cd = Buffer.concat([central, name]);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(cdOffset, 16);
  assert.equal(zipMember(Buffer.concat([local, name, comp, cd, eocd]), 'a.csv').toString(), 'hello french library');
});

test('breakpoints: type-7 percentiles and first-bucket-not-exceeded assignment', () => {
  const bps = breakpoints([1, 2, 3, 4, 5], 5);
  assert.deepEqual(bps, [1.8, 2.6, 3.4, 4.2]);
  assert.equal(bucketOf(1.8, bps), 0); assert.equal(bucketOf(1.81, bps), 1); assert.equal(bucketOf(9, bps), 4);
});

test('holding return: delisting inside the month uses the frozen economic factor; long gaps are UNAVAILABLE at factor 1', () => {
  const cal = ['2020-01-31', '2020-02-03', '2020-02-04', '2020-02-05', '2020-02-06', '2020-02-07', '2020-02-10', '2020-02-11', '2020-02-28'];
  const idx = new Map(cal.map((d, i) => [d, i]));
  const s = { bars: [{ date: '2020-01-31', totalReturnIndex: 1, close: 1, rawClose: 10 }, { date: '2020-02-04', totalReturnIndex: 1.1, close: 1.1, rawClose: 11 }], terminal: { date: '2020-02-04', kind: 'DELISTED', delistClass: 'UNKNOWN' } };
  const r = holdingReturn(s, '2020-01-31', '2020-02-28', idx);
  assert.equal(r.category, 'TERMINAL_DELISTED'); assert.ok(Math.abs(r.ret - (1.1 * 0.7 - 1)) < 1e-12);
  const g = holdingReturn({ ...s, terminal: null }, '2020-01-31', '2020-02-28', idx);
  assert.equal(g.category, 'UNAVAILABLE_BEYOND_LIMIT'); assert.ok(Math.abs(g.ret - 0.1) < 1e-12);
});

test('comparison: identical series PASS; sign-flipped series FAIL on correlation and direction (A2)', () => {
  const months = Array.from({ length: 104 }, (_, i) => `M${String(i).padStart(3, '0')}`);
  const ref = new Map(months.map((m, i) => [m, 0.01 + 0.03 * Math.sin(i)]));
  assert.equal(compareSeries(ref, ref, { kind: 'spread' }).verdict, 'PASS');
  const flipped = new Map([...ref].map(([m, v]) => [m, -v]));
  const c = compareSeries(flipped, ref, { kind: 'spread' });
  assert.equal(c.verdict, 'FAIL');
  assert.ok(c.failedHardChecks.includes('CORRELATION') && c.failedHardChecks.includes('DIRECTION'));
  const sparse = new Map(months.slice(0, 50).map((m) => [m, ref.get(m)]));
  assert.equal(compareSeries(sparse, ref, { kind: 'market', windowMonths: 104 }).verdict, 'INSUFFICIENT_REFERENCE_DATA');
});

const synthetic = syntheticData();
const base = buildConstructions(synthetic, {});

test('end-to-end synthetic: identity oracle certifies, internal two-path reconciliation and review pass', () => {
  const r = calibrateV4(synthetic, identityOracle(base.months));
  assert.equal(r.internal.verdict, 'PASS');
  assert.equal(r.review.status, 'PASS');
  assert.equal(r.certification.level, 'CERTIFIED');
});

test('A1: an EW control that fails its external oracle makes the measurement layer NOT_CERTIFIED', () => {
  const o = identityOracle(base.months);
  o.EW_MARKET = o.EW_MARKET.map((x, i) => ({ ...x, ret: (i % 2 ? 1 : -1) * 0.05 }));
  const r = calibrateV4(synthetic, o);
  assert.equal(r.oracles.EW_MARKET.verdict, 'FAIL');
  assert.equal(r.certification.level, 'NOT_CERTIFIED');
  assert.ok(r.certification.reasons.includes('MEASUREMENT_LAYER_EW_CONTROL_FAILED'));
});

test('A1: reconciliation alone is not calibration (insufficient EW reference => INTERNALLY_RECONCILED at most)', () => {
  const o = identityOracle(base.months);
  o.EW_MARKET = o.EW_MARKET.map((x, i) => ({ ...x, ret: i < 30 ? x.ret : null }));
  assert.equal(calibrateV4(synthetic, o).certification.level, 'INTERNALLY_RECONCILED');
});

test('A7: the independent truncated scorer detects a membership that used information after formation', () => {
  const months = buildConstructions(synthetic, {}).months;
  assert.equal(truncationReview(synthetic, months, synthetic.benchmark.bars.map((b) => b.date), exchangeOf).status, 'PASS');
  const tampered = structuredClone(months);
  const m = tampered[0].MOM_12_2_EW_DECILES.privateMembership; const moved = m[0].pop(); m[9].push(moved);
  assert.equal(truncationReview(synthetic, tampered, synthetic.benchmark.bars.map((b) => b.date), exchangeOf).status, 'FAIL');
});

test('A6: dividends recomputed from the fill ledger match; an inflated booked dividend fails R8b', () => {
  const run = runEqualWeightBook(synthetic, base.months.slice(0, 12), { mode: 'CLOSE' });
  assert.equal(recomputeDividends(run.book, synthetic).status, 'PASS');
  run.book.dividends += 500;
  assert.equal(recomputeDividends(run.book, synthetic).status, 'FAIL');
});

test('A10: duplicate or missing reviewed books are rejected; certification needs every oracle exactly once', () => {
  assert.throws(() => assembleReview([{ book: 'A', checks: [] }, { book: 'A', checks: [] }], ['A']), /DUPLICATE_REVIEWED_BOOK/);
  assert.equal(assembleReview([{ book: 'A', checks: [{ id: 'x', hard: true, status: 'PASS' }] }], ['A', 'B']).status, 'FAIL');
  assert.throws(() => certifyV4({ internal: { verdict: 'PASS' }, review: { status: 'PASS' }, oracles: { EW_MARKET: { verdict: 'PASS' } } }), /ORACLE_SET_INCOMPLETE/);
});

test('certification matrix: CERTIFIED needs EW + two factor families; MAJOR findings and flips cap at PARTIALLY', () => {
  const pass = { verdict: 'PASS' }, fail = { verdict: 'FAIL' };
  const ok = { internal: { verdict: 'PASS' }, review: { status: 'PASS' } };
  assert.equal(certifyV4({ ...ok, oracles: { EW_MARKET: pass, MOM_12_2_EW_DECILES: pass, VAR_60D_EW_QUINTILES: pass } }).level, 'CERTIFIED');
  assert.equal(certifyV4({ ...ok, oracles: { EW_MARKET: pass, MOM_12_2_EW_DECILES: fail, VAR_60D_EW_QUINTILES: pass } }).level, 'PARTIALLY_CERTIFIED');
  assert.equal(certifyV4({ ...ok, oracles: { EW_MARKET: pass, MOM_12_2_EW_DECILES: pass, VAR_60D_EW_QUINTILES: pass }, openFindings: [{ id: 'X', severity: 'MAJOR', status: 'OPEN' }] }).level, 'PARTIALLY_CERTIFIED');
  assert.equal(certifyV4({ ...ok, oracles: { EW_MARKET: pass, MOM_12_2_EW_DECILES: pass, VAR_60D_EW_QUINTILES: pass }, openFindings: [{ id: 'X', severity: 'BLOCKER', status: 'OPEN' }] }).level, 'NOT_CERTIFIED');
  assert.equal(certifyV4({ ...ok, oracles: { EW_MARKET: pass, MOM_12_2_EW_DECILES: pass, VAR_60D_EW_QUINTILES: pass }, sensitivities: [{ id: 'S', verdicts: { VAR_60D_EW_QUINTILES: 'FAIL' } }] }).level, 'PARTIALLY_CERTIFIED');
  assert.equal(certifyV4({ internal: { verdict: 'FAIL' }, review: { status: 'PASS' }, oracles: { EW_MARKET: pass, MOM_12_2_EW_DECILES: pass, VAR_60D_EW_QUINTILES: pass } }).level, 'NOT_CERTIFIED');
});

test('A3: the V4 freeze closure binds the split/total-return loaders reached via require(path.join(root, ...))', () => {
  const c = importClosureV4(ENTRY_POINTS_V4);
  for (const f of ['quant/engines/return-series.js', 'quant/engines/canonical-total-return.js', 'scripts/supertrader/research/tournament/data.mjs', 'scripts/supertrader/research/v4/measurement/accounting-v4.mjs']) assert.ok(c.files.includes(f), f);
  assert.deepEqual(c.unresolvedDynamicRequires, []);
});

test('A3: an unresolvable dynamic require is reported (freeze must fail closed)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v4freeze-'));
  fs.writeFileSync(path.join(dir, 'e.mjs'), "const p='x';\nconst m=require(p);\n");
  assert.equal(importClosureV4(['e.mjs'], dir).unresolvedDynamicRequires.length, 1);
});

test('A13: freeze id is content-only (createdAt/provenance excluded) and key-order independent', () => {
  assert.equal(freezeIdOf({ a: 1, b: { c: 2, d: 3 } }), freezeIdOf({ b: { d: 3, c: 2 }, a: 1 }));
  assert.equal(canonicalJson({ b: 1, a: [2, { y: 1, x: 2 }] }), '{"a":[2,{"x":2,"y":1}],"b":1}');
});

test('spec/acceptance artifacts are generated from the frozen code (no drift)', async () => {
  const { calibrationSpecV4, SPEC_PATH } = await import('../research/v4/build-calibration-spec-v4.mjs');
  assert.deepEqual(JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8')), JSON.parse(JSON.stringify(calibrationSpecV4())));
  const { buildAcceptance } = await import('../research/v4/acceptance/build-acceptance-v4.mjs');
  const src = JSON.parse(fs.readFileSync(new URL('../research/v4/SUPERTRADER-V4-SOURCE-ACCEPTANCE.json', import.meta.url), 'utf8'));
  assert.deepEqual(src, JSON.parse(JSON.stringify(buildAcceptance().source)));
});

test('eligibility rule: source-partial never becomes IMPLEMENT_NOW; manual methods never declare BUY', async () => {
  const { buildAcceptance } = await import('../research/v4/acceptance/build-acceptance-v4.mjs');
  const cert = { level: 'CERTIFIED', externallyValidatedSlices: ['EW_MARKET', 'MOM_12_2_EW_DECILES', 'VAR_60D_EW_QUINTILES'] };
  const e = buildAcceptance({ calibration: { certification: cert } }).eligibility.methods;
  const by = Object.fromEntries(e.map((x) => [x.id, x]));
  assert.equal(by.TURTLE_S1_SOURCE.eligibility, 'IMPLEMENT_NOW');
  assert.equal(by.TURTLE_S1_SOURCE.measurement, 'MEASUREMENT_PARTIAL');
  assert.equal(by.DARVAS_LATER_QA.eligibility, 'RESEARCH_ONLY');
  assert.equal(by.MINERVINI_SEPA_VCP.eligibility, 'MANUAL_LAYER_REQUIRED');
  assert.equal(by.MINERVINI_SEPA_VCP.buyDeclarationAllowed, false);
  assert.equal(by.KULLAMAGI_PARABOLIC_SHORT.eligibility, 'DATA_BLOCKED');
  const notCert = buildAcceptance({ calibration: { certification: { level: 'NOT_CERTIFIED', externallyValidatedSlices: [] } } }).eligibility.methods;
  assert.ok(notCert.every((x) => x.eligibility !== 'IMPLEMENT_NOW'));
});
