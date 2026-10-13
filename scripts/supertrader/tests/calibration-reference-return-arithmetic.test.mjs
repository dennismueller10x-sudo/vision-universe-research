import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { REFERENCE_RETURN_SCHEMAS as schemas, parseFrenchMonthlyPortfolios, parseFrenchDailyRF, createDailyRFAdapter, referencePortfolioMetrics, referenceSpreadMetrics, referenceArithmeticReport, publicReferenceSummary, assertReferenceFreeze, writeFrozenReferenceArtifact } from '../research/calibration/reference-return-arithmetic.mjs';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} differs from ${b}`);
const hash = b => createHash('sha256').update(b).digest('hex');
const modulePath = fileURLToPath(new URL('../research/calibration/reference-return-arithmetic.mjs', import.meta.url));
function monthly(kind, rows, prefix = '') {
  const s = schemas[kind];
  return `${prefix}${s.label}\n\n,${s.columns.join(',')}\n${rows.map(([date, values]) => `${date},${s.columns.map((c, i) => values[c] ?? values[i] ?? 0).join(',')}`).join('\n')}\n\nNumber of Firms in Portfolios\n,OTHER\n201801,123\n`;
}
const direct = rs => rs.map(([month, A, B]) => ({ month, values: { A, B } }));
const rfText = rows => `Public test header\n,Mkt-RF,SMB,HML,RF\n${rows.map(([d, x]) => `${d},999,999,999,${x}`).join('\n')}\n`;

test('momentum reads exact EW block despite preceding value-weight decoy, converts percent once', () => {
  const decoy = `Value Weight Returns -- Monthly\n,${schemas.MOMENTUM_EW.columns.join(',')}\n201801,${Array(10).fill(900).join(',')}\n\n`;
  const p = parseFrenchMonthlyPortfolios(monthly('MOMENTUM_EW', [['201801', { 'Lo PRIOR': -2, 'Hi PRIOR': 12 }], ['201802', { 'Lo PRIOR': 0, 'Hi PRIOR': 0 }]], decoy), { kind: 'MOMENTUM_EW' });
  assert.equal(p.rows.length, 2); assert.equal(p.rows[0].values['Hi PRIOR'], 0.12); assert.equal(p.rows[0].values['Lo PRIOR'], -0.02);
  assert.equal(p.rows[1].values['Hi PRIOR'], 0); assert.equal(p.stockConstructionCertified, false);
});
test('variance excludes five quintiles and uses explicit Lo10/Hi10 EW deciles', () => {
  const p = parseFrenchMonthlyPortfolios(monthly('VARIANCE_EW', [['201801', { 'Lo 20': 900, 'Lo 10': 3, 'Hi 10': -4 }]]), { kind: 'VARIANCE_EW' });
  assert.equal(p.columns.length, 10); assert.equal(p.longColumn, 'Lo 10'); assert.equal(p.shortColumn, 'Hi 10');
  assert.equal(p.rows[0].values['Lo 20'], undefined); assert.equal(p.rows[0].values['Lo 10'], 0.03); assert.equal(p.rows[0].values['Hi 10'], -0.04);
});
test('BOM, quoted header cells and whitespace remain valid, annual/count blocks stay excluded', () => {
  let text = monthly('MOMENTUM_EW', [['201801', { 'Hi PRIOR': 1 }]]);
  text = '\uFEFF' + text.replace(',Lo PRIOR,', ',"Lo PRIOR",').replace('201801,', ' 201801 , ');
  const p = parseFrenchMonthlyPortfolios(text, { kind: 'MOMENTUM_EW' }); assert.equal(p.rows.length, 1); assert.equal(p.rows[0].values['Hi PRIOR'], 0.01);
});
test('French -99.99 and -999 sentinels are missing, -99.0 and zero are real returns', () => {
  const p = parseFrenchMonthlyPortfolios(monthly('MOMENTUM_EW', [['201801', [-99.99, -999, -99.0, 0]]]), { kind: 'MOMENTUM_EW' });
  assert.equal(p.status, 'PARTIAL'); assert.equal(p.missingCells, 2); assert.equal(p.rows[0].values['Lo PRIOR'], null); assert.equal(p.rows[0].values['PRIOR 2'], null);
  assert.equal(p.rows[0].values['PRIOR 3'], -0.99); assert.equal(p.rows[0].values['PRIOR 4'], 0);
});
test('missing/duplicate labels and mismatched column semantics fail closed', () => {
  const text = monthly('MOMENTUM_EW', [['201801', []]]);
  assert.throws(() => parseFrenchMonthlyPortfolios(text.replace(schemas.MOMENTUM_EW.label, 'Equal Weighted Returns'), { kind: 'MOMENTUM_EW' }), /MISSING_REFERENCE_BLOCK/);
  assert.throws(() => parseFrenchMonthlyPortfolios(text + text, { kind: 'MOMENTUM_EW' }), /DUPLICATE_REFERENCE_BLOCK/);
  assert.throws(() => parseFrenchMonthlyPortfolios(text.replace('Hi PRIOR', 'Hi 10'), { kind: 'MOMENTUM_EW' }), /REFERENCE_COLUMNS_MISMATCH/);
});
test('invalid dates, unordered duplicate months and corrupted return cells fail closed', () => {
  for (const rows of [[['201813', []]], [['201802', []], ['201801', []]], [['201801', []], ['201801', []]]]) assert.throws(() => parseFrenchMonthlyPortfolios(monthly('MOMENTUM_EW', rows), { kind: 'MOMENTUM_EW' }));
  assert.throws(() => parseFrenchMonthlyPortfolios(monthly('MOMENTUM_EW', [['201801', { 'Hi PRIOR': 'NaN' }]]), { kind: 'MOMENTUM_EW' }), /INVALID_RETURN_CELL/);
  assert.throws(() => parseFrenchMonthlyPortfolios(monthly('MOMENTUM_EW', [['201801', { 'Hi PRIOR': -101 }]]), { kind: 'MOMENTUM_EW' }), /BELOW_MINUS_100/);
});
test('independent two-month accounting includes initial wealth and high-water loss', () => {
  const m = referencePortfolioMetrics(direct([['2018-01', 0.1], ['2018-02', -0.1]]), { column: 'A', from: '2018-01', to: '2018-02' });
  near(m.totalReturn, -0.01); near(m.cagrMonthlyPeriods, 0.99 ** 6 - 1); near(m.maxDrawdown, -0.1);
  near(m.annualizedVolatility, Math.sqrt(0.02) * Math.sqrt(12)); near(m.sharpeZeroRF, 0);
  const firstLoss = referencePortfolioMetrics(direct([['2018-01', -0.2], ['2018-02', 0.25]]), { column: 'A', from: '2018-01', to: '2018-02' });
  near(firstLoss.totalReturn, 0); near(firstLoss.maxDrawdown, -0.2); assert.equal(firstLoss.exposure, null); assert.equal(firstLoss.turnover, null);
});
test('total loss remains zero wealth and cannot revive on later positive returns', () => {
  const m = referencePortfolioMetrics(direct([['2018-01', -1], ['2018-02', 0.5]]), { column: 'A', from: '2018-01', to: '2018-02' });
  assert.equal(m.totalReturn, -1); assert.equal(m.cagrMonthlyPeriods, -1); assert.equal(m.maxDrawdown, -1); assert.equal(m.curve[1].equity, 0);
});
test('monthly winner-minus-loser is a spread, never an invented funded-account CAGR', () => {
  const m = referenceSpreadMetrics(direct([['2018-01', 0.1, 0.02], ['2018-02', 0, 0.01]]), { longColumn: 'A', shortColumn: 'B', from: '2018-01', to: '2018-02' });
  near(m.meanMonthly, 0.035); near(m.annualizedArithmeticMean, 0.42); assert.deepEqual(m.series.map(x => x.returnDecimal), [0.08, -0.01]);
  assert.equal(m.cagr, null); assert.equal(m.maxDrawdown, null); assert.equal(m.totalReturn, null); assert.match(m.tInterpretation, /NOT_OVERLAP_ROBUST/);
});
test('missing month/cell is unavailable, without skipping or zero-return imputation', () => {
  const rows = direct([['2018-01', 0.1, 0.01], ['2018-03', 0.1, 0.01]]);
  const m = referencePortfolioMetrics(rows, { column: 'A', from: '2018-01', to: '2018-03' });
  assert.equal(m.status, 'UNAVAILABLE'); assert.equal(m.totalReturn, null); assert.equal(m.meanMonthly, null); assert.deepEqual(m.missingMonths, ['2018-02']);
  const s = referenceSpreadMetrics(direct([['2018-01', 0.1, null]]), { longColumn: 'A', shortColumn: 'B', from: '2018-01', to: '2018-01' });
  assert.equal(s.status, 'UNAVAILABLE'); assert.equal(s.meanMonthly, null); assert.equal(s.observations, 0);
});
test('variance screens stay descriptive arithmetic rather than stock-construction certification', () => {
  const p = parseFrenchMonthlyPortfolios(monthly('VARIANCE_EW', [['201801', { 'Lo 10': 1, 'Hi 10': 20 }], ['201802', { 'Lo 10': 1, 'Hi 10': -20 }]]), { kind: 'VARIANCE_EW' });
  const r = referenceArithmeticReport(p, { from: '2018-01', to: '2018-02' });
  assert.equal(r.contextualScreens.spreadMeanDirection, 'POSITIVE'); assert.equal(r.contextualScreens.longLowerVolatilityDirection, 'POSITIVE');
  assert.equal(r.contextualScreens.longHigherZeroRFSharpeDirection, 'UNAVAILABLE'); assert.equal(r.originalPaperNumericReplication, false);
  const pub = publicReferenceSummary(r); assert.equal(pub.stockConstructionCertified, false); assert.equal(pub.certificationCeiling, 'ARITHMETIC_REFERENCE_PARITY');
  for (const key of ['long', 'short', 'spread', 'curve', 'meanMonthly', 'totalReturn', 'annualizedVolatility']) assert.equal(pub[key], undefined);
});
test('daily RF parses only RF column, percent once; missing and negative RF retained truthfully', () => {
  const p = parseFrenchDailyRF(rfText([['20150102', 1], ['20150105', 0], ['20150106', -0.1], ['20150107', -99.99]]));
  assert.equal(p.rows[0].returnDecimal, 0.01); assert.equal(p.rows[1].returnDecimal, 0); assert.equal(p.rows[2].returnDecimal, -0.001); assert.equal(p.rows[3].returnDecimal, null);
  assert.equal(p.rows[0].sourceId, 'FRENCH_DAILY_RF'); assert.equal(p.originalDatastreamEquivalence, 'UNCERTIFIED');
  const a = createDailyRFAdapter(p); assert.equal(a.toRows().length, 3); assert.equal(a.toRows({ includeMissing: true }).length, 4); assert.equal(a.getDailyRF('2015-01-07'), null);
});
test('RF calendar requires every exact expected session and never carries last observation', () => {
  const a = createDailyRFAdapter(parseFrenchDailyRF(rfText([['20150102', 1], ['20150106', 2]])));
  const ok = a.logReturnBetween('2015-01-01', '2015-01-06', { expectedDates: ['2015-01-02', '2015-01-06'] });
  near(ok.logReturn, Math.log(1.01 * 1.02)); assert.equal(ok.status, 'READY');
  const gap = a.logReturnBetween('2015-01-01', '2015-01-06', { expectedDates: ['2015-01-02', '2015-01-05', '2015-01-06'] });
  assert.equal(gap.status, 'UNAVAILABLE'); assert.equal(gap.logReturn, null); assert.deepEqual(gap.missingDates, ['2015-01-05']);
  assert.throws(() => a.logReturnBetween('2015-01-01', '2015-01-06'), /EXACT_RF_CALENDAR_REQUIRED/);
  assert.throws(() => a.logReturnBetween('2015-01-01', '2015-01-06', { expectedDates: ['2015-01-06', '2015-01-02'] }), /INVALID_RF_EXPECTED_CALENDAR/);
});
test('daily RF warmup slice clips future observations before downstream engine context', () => {
  const a = createDailyRFAdapter(parseFrenchDailyRF(rfText([['20141231', 1], ['20150102', 2], ['20260831', 3], ['20990102', 4]])));
  assert.deepEqual(a.toRows({ from: '2015-01-01', to: '2026-09-30' }).map(r => r.date), ['2015-01-02', '2026-08-31']);
  assert.equal(a.getDailyRF('2026-09-01'), null);
});
test('daily RF duplicate/invalid dates and invalid gross return are rejected', () => {
  assert.throws(() => parseFrenchDailyRF(rfText([['20150230', 0]])), /INVALID_RF_OBSERVATION/);
  assert.throws(() => parseFrenchDailyRF(rfText([['20150102', 0], ['20150102', 0]])), /DUPLICATE_OR_REVERSED/);
  assert.throws(() => parseFrenchDailyRF(rfText([['20150102', -100]])), /INVALID_RF_GROSS_RETURN/);
});
test('interior-decile missingness prevents full risk-shape COMPUTED and is publicly counted', () => {
  const p = parseFrenchMonthlyPortfolios(monthly('VARIANCE_EW', [['201801', { 'Dec 4': -99.99, 'Lo 10': 1, 'Hi 10': 2 }], ['201802', { 'Dec 4': 0, 'Lo 10': -1, 'Hi 10': -2 }]]), { kind: 'VARIANCE_EW' });
  const r = referenceArithmeticReport(p, { from: '2018-01', to: '2018-02' });
  assert.equal(r.status, 'PARTIAL'); assert.equal(r.long.status, 'READY'); assert.equal(r.referenceCoverage.completeDeciles, 9);
  assert.equal(r.referenceCoverage.fullDecileRiskShapeComplete, false); assert.deepEqual(r.referenceCoverage.missingCells, [{ month: '2018-01', column: 'Dec 4' }]);
  const pub = publicReferenceSummary(r); assert.equal(pub.missingCellCount, 1); assert.equal(pub.completeDecileCount, 9); assert.equal(pub.fullDecileRiskShapeComplete, false);
});
test('RF empty/truncated interval calendar is unavailable and zero interval needs explicit allowance', () => {
  const a = createDailyRFAdapter(parseFrenchDailyRF(rfText([['20150102', 1], ['20150106', 2]])));
  for (const expectedDates of [[], ['2015-01-02']]) {
    const r = a.logReturnBetween('2015-01-01', '2015-01-06', { expectedDates }); assert.equal(r.status, 'UNAVAILABLE'); assert.equal(r.logReturn, null); assert.match(r.reason, /END_ANCHOR/);
  }
  assert.throws(() => a.logReturnBetween('2015-01-02', '2015-01-02', { expectedDates: [] }), /ZERO_LENGTH/);
  assert.equal(a.logReturnBetween('2015-01-02', '2015-01-02', { expectedDates: [], allowZeroLength: true }).logReturn, 0);
});
test('finite input cells cannot silently overflow equity or arithmetic moments into READY', () => {
  assert.throws(() => referencePortfolioMetrics(direct([['2018-01', 1e200], ['2018-02', 1e200]]), { column: 'A', from: '2018-01', to: '2018-02' }), /NONFINITE_REFERENCE_EQUITY/);
  assert.throws(() => referencePortfolioMetrics(direct([['2018-01', 1e50]]), { column: 'A', from: '2018-01', to: '2018-01' }), /NONFINITE_REFERENCE_ANNUALIZED_EQUITY/);
  assert.throws(() => referenceSpreadMetrics(direct([['2018-01', 1e200, 0], ['2018-02', 0, 1e200]]), { longColumn: 'A', shortColumn: 'B', from: '2018-01', to: '2018-02' }), /NONFINITE_REFERENCE_MOMENTS/);
});
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reference-arithmetic-'));
  const defs = [['FRENCH_MOM10', monthly('MOMENTUM_EW', [['201801', { 'Hi PRIOR': 10 }], ['201802', { 'Hi PRIOR': -10 }]])], ['FRENCH_VAR', monthly('VARIANCE_EW', [['201801', { 'Lo 10': 1 }], ['201802', { 'Lo 10': -1 }]])], ['FRENCH_DAILY_RF', rfText([['20150102', 0], ['20180102', 0.1]])]];
  const sources = defs.map(([id, text]) => { const csvPath = path.join(dir, `${id}.csv`); fs.writeFileSync(csvPath, text); const sha256 = hash(text); return id === 'FRENCH_DAILY_RF' ? { id, csvPath, csvSha256: sha256, sha256: '0'.repeat(64) } : { id, members: [{ csvPath, sha256 }], sha256: '0'.repeat(64) }; });
  const sourcePlanPath = path.join(dir, 'plan.json'); fs.writeFileSync(sourcePlanPath, JSON.stringify({ sources }));
  const inputReceipts = sources.map(s => ({ id: s.id, sha256: s.csvSha256 || s.members[0].sha256 }));
  const actual = { codeSha256: hash(fs.readFileSync(modulePath)), sourcePlanSha256: hash(fs.readFileSync(sourcePlanPath)), inputReceipts };
  const freeze = { frozenBeforePerformance: true, referenceArithmetic: { ...actual, window: { from: '2018-01', to: '2018-02' }, noPostResultTuning: true } };
  const freezePath = path.join(dir, 'freeze.json'); fs.writeFileSync(freezePath, JSON.stringify(freeze));
  return { dir, sourcePlanPath, freezePath, freeze, actual, outPath: path.join(dir, 'private-result.json') };
}
test('freeze requires premeasurement code/plan/unique exact input receipts and window', () => {
  const f = fixture(); try {
    assert.equal(assertReferenceFreeze(f.freeze, f.actual), true);
    assert.throws(() => assertReferenceFreeze({ ...f.freeze, frozenBeforePerformance: false }, f.actual), /PREMEASUREMENT/);
    assert.throws(() => assertReferenceFreeze(f.freeze, { ...f.actual, codeSha256: '1'.repeat(64) }), /CODE_FREEZE_MISMATCH/);
    assert.throws(() => assertReferenceFreeze(f.freeze, { ...f.actual, sourcePlanSha256: '1'.repeat(64) }), /SOURCE_PLAN_FREEZE_MISMATCH/);
    const bad = { ...f.actual, inputReceipts: f.actual.inputReceipts.map((r, i) => i ? r : { ...r, sha256: '1'.repeat(64) }) };
    assert.throws(() => assertReferenceFreeze(f.freeze, bad), /INPUT_FREEZE_MISMATCH/);
  } finally { fs.rmSync(f.dir, { recursive: true }); }
});
test('frozen synthetic file integration preserves receipts, private output and refuses overwrite', () => {
  const f = fixture(); try {
    const result = writeFrozenReferenceArtifact(f); assert.equal(result.seriesCount, 2); assert.equal(result.status, 'PRIVATE_REFERENCE_ARITHMETIC_WRITTEN');
    const p = JSON.parse(fs.readFileSync(f.outPath)); near(p.reports[0].long.totalReturn, -0.01);
    assert.equal(p.freezeFileSha256, hash(fs.readFileSync(f.freezePath))); assert.deepEqual(p.referenceInputSha256s, Object.fromEntries(f.actual.inputReceipts.map(r => [r.id, r.sha256])));
    assert.equal(p.certificationCeiling, 'ARITHMETIC_REFERENCE_PARITY'); assert.equal(p.stockConstructionCertified, false);
    assert.equal(p.inputReceipts.length, 3); assert.equal(fs.statSync(f.outPath).mode & 0o777, 0o600);
    assert.throws(() => writeFrozenReferenceArtifact(f), /REFERENCE_OUTPUT_ALREADY_EXISTS/);
  } finally { fs.rmSync(f.dir, { recursive: true }); }
});
test('bad freeze blocks before reading actual return files; changed source bytes also fail closed', () => {
  const f = fixture(); try {
    const plan = JSON.parse(fs.readFileSync(f.sourcePlanPath)); fs.rmSync(plan.sources[0].members[0].csvPath);
    f.freeze.frozenBeforePerformance = false; fs.writeFileSync(f.freezePath, JSON.stringify(f.freeze));
    assert.throws(() => writeFrozenReferenceArtifact(f), /PREMEASUREMENT/); assert.equal(fs.existsSync(f.outPath), false);
    f.freeze.frozenBeforePerformance = true; fs.writeFileSync(f.freezePath, JSON.stringify(f.freeze)); fs.writeFileSync(plan.sources[0].members[0].csvPath, 'altered source bytes');
    assert.throws(() => writeFrozenReferenceArtifact(f), /SOURCE_BYTES_MISMATCH/); assert.equal(fs.existsSync(f.outPath), false);
  } finally { fs.rmSync(f.dir, { recursive: true }); }
});
