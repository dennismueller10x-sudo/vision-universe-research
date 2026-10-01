import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { compareCompanyFacts: compare, KEY_METRICS } = require('../../providers/marketstack/fundamental-crosscheck.js');

// Synthetic reported-fact fixtures exercise the access-path comparison.
// They are NOT evidence of Marketstack account entitlements or real coverage.
const reported = (changes = {}) => ({ start: '2024-01-01', end: '2024-12-31',
  val: 100, accn: '0000000001-25-000001', form: '10-K', filed: '2025-02-01',
  fy: 2024, fp: 'FY', ...changes });
function payload(entries = [reported()], { concept = 'Revenues', taxonomy = 'us-gaap', unit = 'USD', cik = 1 } = {}) {
  return { cik, entityName: 'Synthetic test issuer', facts: { [taxonomy]: {
    [concept]: { label: concept, units: { [unit]: entries } }
  } } };
}
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}

test('Marketstack company_facts wrapper matches CIK and every provenance field without mutating sources', () => {
  const sec = freeze(payload()), ms = freeze({ data: { ...payload(), cik: '0000000001' } });
  const before = JSON.stringify([sec, ms]);
  const result = compare(ms, sec);
  assert.equal(result.status, 'MATCH');
  assert.equal(result.sourceRelation, 'SAME_REGULATORY_SOURCE');
  assert.equal(result.counts.matched, 1);
  assert.equal(result.canonicalMetricsCompared, false);
  assert.equal(result.pointInTimeCertified, false);
  assert.equal(result.rows[0].accn, reported().accn);
  assert.equal(result.rows[0].filed, reported().filed);
  assert.equal(result.rows[0].availableAt, undefined);
  assert.equal(JSON.stringify([sec, ms]), before);
});

test('CIK disagreement blocks comparisons even if ticker-independent facts are identical', () => {
  const result = compare(payload(undefined, { cik: 2 }), payload());
  assert.equal(result.status, 'IDENTITY_MISMATCH');
  assert.deepEqual(result.issues[0].flags, ['CIK_MISMATCH']);
  assert.equal(result.counts.matched, 0);
  assert.deepEqual(result.rows, []);
});

test('malformed and entitlement/error responses remain unavailable', () => {
  for (const bad of [null, {}, { data: [] }, { data: { cik: 1, facts: [] } },
    { error: { code: 'function_access_restricted' } }, payload(undefined, { cik: 'CIK1' })]) {
    assert.equal(compare(bad, payload()).status, 'UNAVAILABLE');
  }
});

test('reasonable tolerance accepts rounding, reports material mismatches and preserves zero/negative facts', () => {
  assert.equal(compare(payload([reported({ val: 100.00001 })]), payload()).status, 'MATCH');
  const mismatch = compare(payload([reported({ val: 101 })]), payload());
  assert.equal(mismatch.status, 'REVIEW_REQUIRED');
  assert.equal(mismatch.counts.valueMismatches, 1);
  assert.equal(mismatch.rows[0].absoluteDifference, 1);
  for (const val of [0, -100]) assert.equal(compare(payload([reported({ val })]), payload([reported({ val })])).status, 'MATCH');
  for (const value of [-1, NaN, Infinity, '0']) assert.throws(() => compare(payload(), payload(), { relativeTolerance: value }), /TOLERANCE_INVALID/);
});

test('duplicates cannot silently pick a winning reported value', () => {
  const sec = payload([reported(), reported()]);
  const ms = payload([reported(), reported({ val: 200 })]);
  const result = compare(ms, sec);
  assert.equal(result.rows[0].status, 'AMBIGUOUS_DUPLICATE');
  assert.equal(result.counts.matched, 0);
  assert.equal(result.counts.duplicateSEC, 1);
  assert.equal(result.counts.duplicateMarketstack, 1);
  assert.deepEqual(result.rows[0].marketstackValues, [100, 200]);
});

test('missing or invalid filing/period dates never receive fabricated PIT anchors', () => {
  for (const [changes, flag] of [
    [{ filed: undefined }, 'MISSING_FILED_DATE'], [{ end: undefined }, 'MISSING_END_DATE'],
    [{ start: undefined }, 'MISSING_START_DATE'], [{ filed: '2025-02-30' }, 'INVALID_FILED_DATE'],
    [{ filed: '2024-12-01' }, 'FILING_BEFORE_PERIOD_END'],
    [{ start: '2025-01-01' }, 'PERIOD_ORDER_INVALID'],
    [{ dimensions: { Segment: 'Retail' } }, 'DIMENSIONAL_FACT_NOT_CONSOLIDATED'],
    [{ val: '100' }, 'INVALID_VALUE'], [{ val: Infinity }, 'INVALID_VALUE']
  ]) {
    const result = compare(payload([reported(changes)]), payload());
    assert.equal(result.counts.matched, 0);
    assert.ok(result.issues.some(issue => issue.flags.includes(flag)), flag);
    assert.equal(result.issues[0].availableAt, undefined);
  }
});

test('units/currencies and provenance mismatches are diagnostic only, never matched value comparisons', () => {
  const cases = [
    [payload(undefined, { unit: 'EUR' }), 'UNIT_MISMATCH_REVIEW'],
    [payload([reported({ start: '2024-07-01' })]), 'PERIOD_START_MISMATCH_REVIEW'],
    [payload([reported({ end: '2024-09-30' })]), 'PERIOD_END_MISMATCH_REVIEW'],
    [payload([reported({ accn: '0000000001-25-000002' })]), 'ACCESSION_MISMATCH_REVIEW'],
    [payload([reported({ filed: '2025-02-02' })]), 'FILING_DATE_MISMATCH_REVIEW'],
    [payload([reported({ form: '10-K/A' })]), 'FORM_MISMATCH_REVIEW'],
    [payload(undefined, { concept: 'SalesRevenueNet' }), 'CONCEPT_MISMATCH_REVIEW']
  ];
  for (const [ms, flag] of cases) {
    const result = compare(ms, payload());
    assert.equal(result.counts.matched, 0, flag);
    assert.equal(result.counts.missingInMarketstack, 1);
    assert.equal(result.counts.missingInSEC, 1);
    assert.ok(result.rows.some(row => row.flags.includes(flag)), flag);
  }
});

test('filing fiscal labels are flagged metadata, never used to assign reported periods', () => {
  const result = compare(payload([reported({ fy: 2025, fp: 'Q1' })]), payload());
  assert.equal(result.counts.matched, 1);
  assert.ok(result.rows[0].flags.includes('FILING_FISCAL_METADATA_MISMATCH'));
  assert.equal(result.status, 'REVIEW_REQUIRED');
});

test('amendments and YTD facts remain separate instead of selecting current values for past observations', () => {
  const rows = [reported(), reported({ accn: '0000000001-25-000002', form: '10-K/A', filed: '2025-03-01', val: 110 }),
    reported({ end: '2024-09-30', form: '10-Q', filed: '2024-11-01', accn: '0000000001-24-000003', val: 75, fp: 'Q3' })];
  const result = compare(payload(rows), payload(rows));
  assert.equal(result.counts.matched, 3);
  assert.equal(result.rows.length, 3);
  assert.ok(result.rows.some(row => row.start === '2024-01-01' && row.end === '2024-09-30'));
  assert.equal(result.rows.some(row => row.fiscalPeriod === 'Q3'), false);
});

test('IFRS original reporting currency and instant facts compare without USD conversion', () => {
  const sec = payload([reported()], { taxonomy: 'ifrs-full', concept: 'Revenue', unit: 'TWD' });
  assert.equal(compare(sec, sec).rows[0].unit, 'TWD');
  const instant = payload([reported({ start: undefined })], { concept: 'Assets' });
  assert.equal(compare(instant, instant).status, 'MATCH');
  const wrong = payload([reported()], { concept: 'Assets' });
  assert.ok(compare(wrong, wrong).issues[0].flags.includes('PERIOD_KIND_MISMATCH'));
  const scaledUnit = payload(undefined, { unit: 'USD millions' });
  assert.ok(compare(scaledUnit, scaledUnit).issues[0].flags.includes('UNIT_DIMENSION_MISMATCH'));
  const wrongEPS = payload(undefined, { concept: 'EarningsPerShareBasic', unit: 'shares' });
  assert.ok(compare(wrongEPS, wrongEPS).issues[0].flags.includes('UNIT_DIMENSION_MISMATCH'));
  const eps = payload(undefined, { taxonomy: 'ifrs-full', concept: 'BasicEarningsLossPerShare', unit: 'TWD/shares' });
  assert.equal(compare(eps, eps).status, 'MATCH');
});

test('key-metric coverage is explicit; FCF is not synthesized from reported components', () => {
  const result = compare(payload(), payload());
  assert.deepEqual(result.metrics.map(row => row.metric), [...KEY_METRICS]);
  const fcf = result.metrics.find(row => row.metric === 'free_cash_flow');
  assert.equal(fcf.status, 'UNAVAILABLE');
  assert.equal(fcf.canonicalValidated, false);
  assert.deepEqual(fcf.dependencies, ['operating_cash_flow', 'capital_expenditures']);
  assert.equal(fcf.reason, 'DERIVED_METRIC_REQUIRES_CANONICAL_VALIDATION');
});

test('comparison artifacts are deterministic across provider response ordering', () => {
  const a = reported(), b = reported({ end: '2023-12-31', start: '2023-01-01', val: 80 });
  assert.deepEqual(compare(payload([a, b]), payload([b, a])), compare(payload([b, a]), payload([a, b])));
});
