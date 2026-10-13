// Supplied academic reference returns certify arithmetic only, never stock construction.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const MOM_COLUMNS = ['Lo PRIOR', ...Array.from({ length: 8 }, (_, i) => `PRIOR ${i + 2}`), 'Hi PRIOR'];
const VAR_DECILES = ['Lo 10', ...Array.from({ length: 8 }, (_, i) => `Dec ${i + 2}`), 'Hi 10'];
export const REFERENCE_RETURN_SCHEMAS = Object.freeze({
  MOMENTUM_EW: Object.freeze({ sourceId: 'FRENCH_MOM10', label: 'Average Equal Weighted Returns -- Monthly', columns: Object.freeze(MOM_COLUMNS), selected: Object.freeze(MOM_COLUMNS), long: 'Hi PRIOR', short: 'Lo PRIOR' }),
  VARIANCE_EW: Object.freeze({ sourceId: 'FRENCH_VAR', label: 'Equal Weighted Returns -- Monthly', columns: Object.freeze(['Lo 20', 'Qnt 2', 'Qnt 3', 'Qnt 4', 'Hi 20', ...VAR_DECILES]), selected: Object.freeze(VAR_DECILES), long: 'Lo 10', short: 'Hi 10' }),
});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const finite = x => typeof x === 'number' && Number.isFinite(x);
function demand(condition, code) { if (!condition) throw new Error(code); }
function validDay(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s; }
function validMonth(s) { return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s); }
function monthIndex(s) { return Number(s.slice(0, 4)) * 12 + Number(s.slice(5)) - 1; }
function monthAt(n) { return `${Math.floor(n / 12)}-${String(n % 12 + 1).padStart(2, '0')}`; }
function cells(line) {
  const out = []; let value = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (quoted && line[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { out.push(value.trim()); value = ''; }
    else value += c;
  }
  demand(!quoted, 'INVALID_CSV_QUOTE'); out.push(value.trim()); return out;
}
function percentReturn(value) {
  if (value === '') return null;
  demand(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value), 'INVALID_RETURN_CELL');
  const n = Number(value); demand(Number.isFinite(n), 'NONFINITE_RETURN_CELL');
  if (n === -99.99 || n === -999) return null;
  demand(n >= -100, 'LONG_PORTFOLIO_RETURN_BELOW_MINUS_100_PERCENT');
  return n / 100;
}
function ordered(rows, key) { for (let i = 1; i < rows.length; i++) demand(rows[i - 1][key] < rows[i][key], 'DUPLICATE_OR_REVERSED_REFERENCE_DATE'); }
export function parseFrenchMonthlyPortfolios(text, { kind } = {}) {
  const spec = REFERENCE_RETURN_SCHEMAS[kind]; demand(spec && typeof text === 'string', 'INVALID_REFERENCE_SCHEMA');
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const positions = lines.flatMap((line, i) => line.trim() === spec.label ? [i] : []);
  demand(positions.length === 1, positions.length ? 'DUPLICATE_REFERENCE_BLOCK' : 'MISSING_REFERENCE_BLOCK');
  let i = positions[0] + 1; while (i < lines.length && !lines[i].trim()) i++;
  const header = cells(lines[i++] || ''); demand(header[0] === '', 'INVALID_REFERENCE_HEADER_DATE_COLUMN');
  demand(JSON.stringify(header.slice(1)) === JSON.stringify(spec.columns), 'REFERENCE_COLUMNS_MISMATCH');
  const rows = []; let started = false;
  for (; i < lines.length; i++) {
    if (!lines[i].trim()) { if (started) break; else continue; }
    const row = cells(lines[i]), token = row[0];
    if (!/^\d{6}$/.test(token)) { demand(!/^\d/.test(token) || /^\d{4}$/.test(token), 'INVALID_REFERENCE_MONTH'); break; }
    const month = `${token.slice(0, 4)}-${token.slice(4)}`; demand(validMonth(month), 'INVALID_REFERENCE_MONTH');
    demand(row.length === spec.columns.length + 1, 'REFERENCE_ROW_WIDTH_MISMATCH'); started = true;
    const values = {};
    // Every data cell is checked, but quintiles are not selected as deciles.
    const allValues = row.slice(1).map(percentReturn);
    for (const column of spec.selected) values[column] = allValues[spec.columns.indexOf(column)];
    rows.push({ month, values });
  }
  demand(rows.length, 'EMPTY_REFERENCE_BLOCK'); ordered(rows, 'month');
  const missingCells = rows.reduce((n, row) => n + Object.values(row.values).filter(x => x === null).length, 0);
  return { schema: 'french-monthly-reference-parsed-1.0.0', kind, sourceId: spec.sourceId, selectedBlock: spec.label, columns: [...spec.selected], longColumn: spec.long, shortColumn: spec.short, unit: 'DECIMAL_MONTHLY_TOTAL_RETURN', sourceUnit: 'PERCENT', conversion: 'DIVIDE_100_ONCE', status: missingCells ? 'PARTIAL' : 'READY', missingCells, rows, certificationCeiling: 'ARITHMETIC_REFERENCE_PARITY', stockConstructionCertified: false };
}
export function parseFrenchDailyRF(text) {
  demand(typeof text === 'string', 'INVALID_RF_TEXT'); const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const found = lines.flatMap((line, i) => /^\s*,\s*Mkt-RF\s*,/.test(line) ? [i] : []);
  demand(found.length === 1, found.length ? 'DUPLICATE_RF_HEADER' : 'MISSING_RF_HEADER');
  const header = cells(lines[found[0]]); demand(JSON.stringify(header) === JSON.stringify(['', 'Mkt-RF', 'SMB', 'HML', 'RF']), 'RF_COLUMNS_MISMATCH');
  const rows = [];
  for (let i = found[0] + 1; i < lines.length; i++) {
    if (!lines[i].trim()) { if (rows.length) break; else continue; }
    const c = cells(lines[i]); if (!/^\d{8}$/.test(c[0])) { demand(!/^\d/.test(c[0]), 'INVALID_RF_DATE'); break; }
    const date = `${c[0].slice(0, 4)}-${c[0].slice(4, 6)}-${c[0].slice(6)}`;
    demand(validDay(date) && c.length === header.length, 'INVALID_RF_OBSERVATION');
    const returnDecimal = percentReturn(c[4]); demand(returnDecimal === null || returnDecimal > -1, 'INVALID_RF_GROSS_RETURN');
    rows.push({ date, returnDecimal, sourceId: 'FRENCH_DAILY_RF' });
  }
  demand(rows.length, 'EMPTY_RF_REFERENCE'); ordered(rows, 'date');
  return { schema: 'french-daily-rf-parsed-1.0.0', sourceId: 'FRENCH_DAILY_RF', unit: 'DECIMAL_DAILY_RF_RETURN', sourceUnit: 'PERCENT', conversion: 'DIVIDE_100_ONCE', rows, missingObservations: rows.filter(r => r.returnDecimal === null).length, historicalVintage: 'EX_POST_RECONSTRUCTED_RESEARCH_SNAPSHOT', originalDatastreamEquivalence: 'UNCERTIFIED' };
}
export function createDailyRFAdapter(parsed) {
  demand(Array.isArray(parsed?.rows), 'INVALID_PARSED_RF'); ordered(parsed.rows, 'date');
  const map = new Map();
  for (const r of parsed.rows) { demand(validDay(r.date) && r.sourceId === 'FRENCH_DAILY_RF' && (r.returnDecimal === null || finite(r.returnDecimal) && r.returnDecimal > -1), 'INVALID_PARSED_RF_ROW'); map.set(r.date, r.returnDecimal); }
  return {
    getDailyRF(date) { demand(validDay(date), 'INVALID_RF_LOOKUP_DATE'); return map.get(date) ?? null; },
    toRows({ from = '0000-01-01', to = '9999-12-31', includeMissing = false } = {}) { return parsed.rows.filter(r => r.date >= from && r.date <= to && (includeMissing || r.returnDecimal !== null)).map(r => ({ ...r })); },
    logReturnBetween(startExclusive, endInclusive, { expectedDates, allowZeroLength = false } = {}) {
      demand(validDay(startExclusive) && validDay(endInclusive) && startExclusive <= endInclusive && Array.isArray(expectedDates), 'EXACT_RF_CALENDAR_REQUIRED');
      demand(expectedDates.every(validDay) && expectedDates.every((d, i) => !i || expectedDates[i - 1] < d), 'INVALID_RF_EXPECTED_CALENDAR');
      const dates = expectedDates.filter(d => d > startExclusive && d <= endInclusive), missingDates = dates.filter(d => !finite(map.get(d)));
      if (startExclusive === endInclusive) { demand(allowZeroLength === true, 'ZERO_LENGTH_RF_INTERVAL_NOT_ALLOWED'); return { status: 'READY', logReturn: 0, missingDates: [], expectedSessions: 0, sourceId: 'FRENCH_DAILY_RF' }; }
      if (!dates.length || dates.at(-1) !== endInclusive) return { status: 'UNAVAILABLE', logReturn: null, missingDates: [...new Set([...missingDates, endInclusive])], expectedSessions: dates.length, reason: 'EXACT_RF_INTERVAL_END_ANCHOR_REQUIRED', sourceId: 'FRENCH_DAILY_RF' };
      if (missingDates.length) return { status: 'UNAVAILABLE', logReturn: null, missingDates, expectedSessions: dates.length, sourceId: 'FRENCH_DAILY_RF' };
      return { status: 'READY', logReturn: dates.reduce((v, d) => v + Math.log1p(map.get(d)), 0), missingDates: [], expectedSessions: dates.length, sourceId: 'FRENCH_DAILY_RF' };
    },
  };
}
function selected(rows, from, to, columns) {
  demand(Array.isArray(rows) && validMonth(from) && validMonth(to) && from <= to, 'INVALID_REFERENCE_WINDOW'); ordered(rows, 'month');
  const map = new Map(rows.map(r => [r.month, r])), chosen = [], missingMonths = [], missingCells = [];
  for (let n = monthIndex(from); n <= monthIndex(to); n++) {
    const month = monthAt(n), row = map.get(month); if (!row) { missingMonths.push(month); continue; }
    for (const column of columns) if (!finite(row.values?.[column])) missingCells.push({ month, column });
    chosen.push(row);
  }
  return { rows: chosen, missingMonths, missingCells, complete: !missingMonths.length && !missingCells.length };
}
function moments(xs) {
  const mean = xs.length ? xs.reduce((v, x) => v + x, 0) / xs.length : null;
  const variance = xs.length > 1 ? xs.reduce((v, x) => v + (x - mean) ** 2, 0) / (xs.length - 1) : null;
  const sd = variance === null ? null : Math.sqrt(variance);
  const out = { meanMonthly: mean, annualizedArithmeticMean: mean === null ? null : mean * 12, annualizedVolatility: sd === null ? null : sd * Math.sqrt(12), sharpeZeroRF: sd > 0 ? mean / sd * Math.sqrt(12) : null, naiveDescriptiveT: sd > 0 ? mean / sd * Math.sqrt(xs.length) : null };
  demand(Object.values(out).every(x => x === null || finite(x)), 'NONFINITE_REFERENCE_MOMENTS'); return out;
}
export function referencePortfolioMetrics(rows, { column, from, to } = {}) {
  const s = selected(rows, from, to, [column]), base = { status: s.complete ? 'READY' : 'UNAVAILABLE', column, from, to, months: monthIndex(to) - monthIndex(from) + 1, missingMonths: s.missingMonths, missingCells: s.missingCells, sharpeRiskFree: 0, exposure: null, turnover: null, portfolioSize: null, stockConstructionCertified: false };
  if (!s.complete) return { ...base, totalReturn: null, cagrMonthlyPeriods: null, maxDrawdown: null, meanMonthly: null, annualizedArithmeticMean: null, annualizedVolatility: null, sharpeZeroRF: null, naiveDescriptiveT: null, curve: [] };
  const returns = s.rows.map(r => r.values[column]); demand(returns.every(r => r >= -1), 'INVALID_LONG_REFERENCE_RETURN');
  let equity = 1, peak = 1, maxDrawdown = 0; const curve = [];
  for (let i = 0; i < returns.length; i++) { equity *= 1 + returns[i]; demand(finite(equity), 'NONFINITE_REFERENCE_EQUITY'); peak = Math.max(peak, equity); maxDrawdown = Math.min(maxDrawdown, equity / peak - 1); curve.push({ month: s.rows[i].month, equity }); }
  const cagrMonthlyPeriods = equity ** (12 / returns.length) - 1; demand(finite(cagrMonthlyPeriods), 'NONFINITE_REFERENCE_ANNUALIZED_EQUITY');
  return { ...base, ...moments(returns), totalReturn: equity - 1, cagrMonthlyPeriods, maxDrawdown, curve, annualization: '12_MONTHLY_RETURN_PERIODS_PER_YEAR; SOURCE_TABLE_MEAN_IS_NOT_CAGR' };
}
export function referenceSpreadMetrics(rows, { longColumn, shortColumn, from, to } = {}) {
  const s = selected(rows, from, to, [longColumn, shortColumn]);
  const xs = s.complete ? s.rows.map(r => r.values[longColumn] - r.values[shortColumn]) : [];
  return { status: s.complete ? 'READY' : 'UNAVAILABLE', from, to, longColumn, shortColumn, observations: s.complete ? xs.length : 0, missingMonths: s.missingMonths, missingCells: s.missingCells, ...moments(xs), series: s.complete ? s.rows.map((r, i) => ({ month: r.month, returnDecimal: xs[i] })) : [], cagr: null, totalReturn: null, maxDrawdown: null, fundedAccountConvention: 'UNSPECIFIED; W_MINUS_L_PER_DOLLAR_LONG_NOT_NET_ZERO_EQUITY_CAGR', tInterpretation: 'NAIVE_DESCRIPTIVE_ONLY; NOT_OVERLAP_ROBUST_OR_ALPHA_PROOF', stockConstructionCertified: false };
}
const direction = x => !finite(x) ? 'UNAVAILABLE' : x > 0 ? 'POSITIVE' : x < 0 ? 'NEGATIVE' : 'ZERO';
export function referenceArithmeticReport(parsed, { from, to } = {}) {
  const long = referencePortfolioMetrics(parsed.rows, { column: parsed.longColumn, from, to });
  const short = referencePortfolioMetrics(parsed.rows, { column: parsed.shortColumn, from, to });
  const spread = referenceSpreadMetrics(parsed.rows, { longColumn: parsed.longColumn, shortColumn: parsed.shortColumn, from, to });
  const decileMetrics = parsed.columns.map(column => referencePortfolioMetrics(parsed.rows, { column, from, to }));
  const fullScope = selected(parsed.rows, from, to, parsed.columns);
  const referenceCoverage = { selectedDeciles: parsed.columns.length, completeDeciles: decileMetrics.filter(m => m.status === 'READY').length, fullDecileRiskShapeComplete: fullScope.complete, missingMonths: fullScope.missingMonths, missingCells: fullScope.missingCells };
  const riskDifference = finite(long.annualizedVolatility) && finite(short.annualizedVolatility) ? short.annualizedVolatility - long.annualizedVolatility : null;
  const sharpeDifference = finite(long.sharpeZeroRF) && finite(short.sharpeZeroRF) ? long.sharpeZeroRF - short.sharpeZeroRF : null;
  return { schema: 'supplied-reference-arithmetic-report-1.0.0', kind: parsed.kind, sourceId: parsed.sourceId, status: fullScope.complete ? 'COMPUTED' : long.status === 'READY' && short.status === 'READY' ? 'PARTIAL' : 'UNAVAILABLE', referenceCoverage, certificationCeiling: 'ARITHMETIC_REFERENCE_PARITY', constructionVerdict: 'NOT_A_STOCK_LEVEL_CONSTRUCTION_TEST', originalPaperNumericReplication: false, benchmark: 'SOURCE_OTHER_BUCKET; NO_SPY_COMPARISON', long, short, spread, decileMetrics, contextualScreens: { spreadMeanDirection: direction(spread.meanMonthly), longLowerVolatilityDirection: direction(riskDifference), longHigherZeroRFSharpeDirection: direction(sharpeDifference), fullDecileRiskShapeStatus: fullScope.complete ? 'COMPLETE' : 'UNAVAILABLE_DECILES', meaning: 'SAME_SUPPLIED_SERIES_DESCRIPTIVE_DIAGNOSTICS; NOT_ORIGINAL_PAPER_PASS_FAIL' }, publishedTurnover: null, publishedExposure: null };
}
export function publicReferenceSummary(report) {
  return { sourceId: report.sourceId, kind: report.kind, status: report.status, certificationCeiling: 'ARITHMETIC_REFERENCE_PARITY', constructionVerdict: 'NOT_A_STOCK_LEVEL_CONSTRUCTION_TEST', stockConstructionCertified: false, months: report.long.months, missingMonthCount: report.referenceCoverage.missingMonths.length, missingCellCount: report.referenceCoverage.missingCells.length, completeDecileCount: report.referenceCoverage.completeDeciles, fullDecileRiskShapeComplete: report.referenceCoverage.fullDecileRiskShapeComplete, spreadMeanDirection: report.contextualScreens.spreadMeanDirection, longLowerVolatilityDirection: report.contextualScreens.longLowerVolatilityDirection, longHigherZeroRFSharpeDirection: report.contextualScreens.longHigherZeroRFSharpeDirection };
}
export function assertReferenceFreeze(freeze, { codeSha256, sourcePlanSha256, inputReceipts } = {}) {
  const f = freeze?.referenceArithmetic;
  demand(freeze?.frozenBeforePerformance === true && f?.noPostResultTuning === true, 'PREMEASUREMENT_REFERENCE_FREEZE_REQUIRED');
  demand(/^[a-f0-9]{64}$/.test(codeSha256 || '') && f.codeSha256 === codeSha256, 'REFERENCE_CODE_FREEZE_MISMATCH');
  demand(/^[a-f0-9]{64}$/.test(sourcePlanSha256 || '') && f.sourcePlanSha256 === sourcePlanSha256, 'REFERENCE_SOURCE_PLAN_FREEZE_MISMATCH');
  demand(Array.isArray(f.inputReceipts) && Array.isArray(inputReceipts) && f.inputReceipts.length === inputReceipts.length, 'REFERENCE_RECEIPTS_REQUIRED');
  const map = new Map(f.inputReceipts.map(r => [r.id, r.sha256])); demand(map.size === f.inputReceipts.length, 'DUPLICATE_REFERENCE_RECEIPT');
  demand(new Set(inputReceipts.map(r => r.id)).size === inputReceipts.length && inputReceipts.every(r => /^[a-f0-9]{64}$/.test(r.sha256 || '') && map.get(r.id) === r.sha256), 'REFERENCE_INPUT_FREEZE_MISMATCH');
  demand(validMonth(f.window?.from) && validMonth(f.window?.to) && f.window.from <= f.window.to, 'REFERENCE_WINDOW_FREEZE_REQUIRED');
  return true;
}
export function writeFrozenReferenceArtifact({ freezePath, sourcePlanPath, outPath = '/workspace/private/calibration/reference-parsed.json' } = {}) {
  demand(!fs.existsSync(outPath), 'REFERENCE_OUTPUT_ALREADY_EXISTS');
  // Establish premeasurement state/code/plan before opening any actual reference CSV.
  const freezeBytes = fs.readFileSync(freezePath), freeze = JSON.parse(freezeBytes), planBytes = fs.readFileSync(sourcePlanPath), plan = JSON.parse(planBytes);
  const codeSha256 = hash(fs.readFileSync(fileURLToPath(import.meta.url))), sourcePlanSha256 = hash(planBytes);
  const ids = ['FRENCH_MOM10', 'FRENCH_VAR', 'FRENCH_DAILY_RF'];
  const inputs = ids.map(id => {
    const source = plan.sources.find(s => s.id === id); demand(source, 'REFERENCE_SOURCE_MISSING');
    const member = id === 'FRENCH_DAILY_RF' ? source : source.members?.[0];
    demand(typeof member?.csvPath === 'string' && /^[a-f0-9]{64}$/.test(member.csvSha256 || member.sha256 || ''), 'REFERENCE_CSV_RECEIPT_MISSING');
    return { id, path: member.csvPath, sha256: member.csvSha256 || member.sha256, zipSha256: source.sha256, url: source.url };
  });
  assertReferenceFreeze(freeze, { codeSha256, sourcePlanSha256, inputReceipts: inputs });
  const bytes = inputs.map(i => { const b = fs.readFileSync(i.path); demand(hash(b) === i.sha256, 'REFERENCE_SOURCE_BYTES_MISMATCH'); return b; });
  const momentum = parseFrenchMonthlyPortfolios(bytes[0].toString('utf8'), { kind: 'MOMENTUM_EW' });
  const variance = parseFrenchMonthlyPortfolios(bytes[1].toString('utf8'), { kind: 'VARIANCE_EW' });
  const rf = parseFrenchDailyRF(bytes[2].toString('utf8'));
  const payload = { schema: 'calibration-private-supplied-reference-parsed-1.0.0', freezeSha256: hash(freezeBytes), freezeFileSha256: hash(freezeBytes), codeSha256, sourcePlanSha256, inputReceipts: inputs, referenceInputSha256s: Object.fromEntries(inputs.map(i => [i.id, i.sha256])), referenceWindow: freeze.referenceArithmetic.window, referenceMonthlySeries: { momentumEW: momentum, varianceEW: variance }, riskFreeDaily: createDailyRFAdapter(rf).toRows({ from: '2015-01-01', to: '2026-09-30' }), riskFreeMetadata: { sourceId: rf.sourceId, actualFirstDate: rf.rows[0].date, actualLastDate: rf.rows.at(-1).date, missingObservations: rf.missingObservations, unit: rf.unit, historicalVintage: rf.historicalVintage, originalDatastreamEquivalence: rf.originalDatastreamEquivalence, missingRFNeverFilled: true }, reports: [momentum, variance].map(p => referenceArithmeticReport(p, freeze.referenceArithmetic.window)), stockConstructionCertified: false, certificationCeiling: 'ARITHMETIC_REFERENCE_PARITY', providerFiguresPublished: false };
  fs.mkdirSync(path.dirname(outPath), { recursive: true }); fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return { status: 'PRIVATE_REFERENCE_ARITHMETIC_WRITTEN', outPath, sha256: hash(fs.readFileSync(outPath)), seriesCount: 2, rfObservationCount: payload.riskFreeDaily.length, summaries: payload.reports.map(publicReferenceSummary) };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let privateFailurePath;
  try {
    const args = process.argv.slice(2), options = {};
    demand(args.shift() === '--execute-frozen-reference-arithmetic', 'EXPLICIT_FROZEN_REFERENCE_EXECUTION_REQUIRED');
    while (args.length) { const key = args.shift(), value = args.shift(); demand(['--freeze', '--source-plan', '--out'].includes(key) && !options[key] && typeof value === 'string' && !value.startsWith('--'), 'INVALID_OR_DUPLICATE_REFERENCE_ARGUMENT'); options[key] = value; }
    demand(options['--freeze'] && options['--source-plan'], 'ALL_REFERENCE_BINDINGS_REQUIRED');
    const outPath = path.resolve(options['--out'] || '/workspace/private/calibration/reference-parsed.json');
    demand(outPath.startsWith('/workspace/private/'), 'PRIVATE_REFERENCE_OUTPUT_REQUIRED');
    fs.mkdirSync(path.dirname(outPath), { recursive: true }); demand(fs.realpathSync(path.dirname(outPath)).startsWith('/workspace/private/'), 'PRIVATE_REFERENCE_REAL_OUTPUT_REQUIRED');
    privateFailurePath = outPath + '.failure.private.json';
    const result = writeFrozenReferenceArtifact({ freezePath: options['--freeze'], sourcePlanPath: options['--source-plan'], outPath });
    process.stdout.write(JSON.stringify({ status: result.status, seriesCount: result.seriesCount, rfObservationCount: result.rfObservationCount, sha256: result.sha256, summaries: result.summaries }) + '\n');
  } catch (e) { if (privateFailurePath) { try { fs.writeFileSync(privateFailurePath, JSON.stringify({ status: 'FAILED_CLOSED', name: e.name, message: e.message, stack: e.stack }, null, 2) + '\n', { mode: 0o600 }); } catch {} } process.stderr.write('REFERENCE_ARITHMETIC_FAILED_CLOSED\n'); process.exitCode = 1; }
}
