import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeUcitsHoldings, analyzeUcitsMetadata, buildEtfIdentity, ucitsProductReadiness } from '../../../scripts/marketstack/ucits-quality.mjs';

const options = { now: '2026-10-08', weightUnit: 'percent', fundStructure: 'physical' };
const basket = extra => ({ holdings: [{ ticker: 'A', weight: 60, assetType: 'EQUITY' }, { ticker: 'B', weight: 39, assetType: 'EQUITY' }, { name: 'Cash', weight: 1, assetType: 'CASH' }], asOf: '2026-10-07', providerTotal: 3, complete: true, ...extra });

test('all original rows and signed weights survive; no normalization to 100', () => {
  const original = basket({ holdings: [{ ticker: 'A', weight: 40, assetType: 'EQUITY', unrecognized: { foo: true } }, { ticker: 'A', weight: -1, assetType: 'SWAP' }], providerTotal: 99 });
  const before = JSON.stringify(original);
  const result = analyzeUcitsHoldings(original, options);
  assert.equal(result.holdingsCount, 2);
  assert.equal(result.status, 'PARTIAL');
  assert.equal(result.sumWeights, 0.39);
  assert.equal(result.normalizedRows[0].weightFraction, 0.4);
  assert.equal(result.normalizedRows[1].weightOriginal, -1);
  assert.deepEqual(result.rawRows, original.holdings);
  assert.deepEqual(result.normalizedRows[0].raw.unrecognized, { foo: true });
  assert.equal(JSON.stringify(original), before);
});

test('FULL needs count, complete transfer, date, units and fund-structure weight evidence', () => {
  assert.equal(analyzeUcitsHoldings(basket(), options).status, 'FULL');
  assert.equal(analyzeUcitsHoldings(basket({ providerTotal: undefined }), options).status, 'LIKELY_FULL');
  for (const extra of [{ complete: false }, { complete: false, paginationComplete: true }, { paginationComplete: false }, { asOf: null }, { providerTotal: 4 }]) {
    assert.equal(analyzeUcitsHoldings(basket(extra), options).status, 'PARTIAL');
  }
  assert.equal(analyzeUcitsHoldings(basket(), { now: options.now, weightUnit: 'percent' }).status, 'PARTIAL');
  assert.equal(analyzeUcitsHoldings(basket(), { now: options.now, fundStructure: 'physical' }).sumWeights, null);
});

test('504 preserves coverage UNKNOWN and never means unsupported', () => {
  for (const input of [{ status: 504, reason: 'httpError' }, { httpStatus: 504 }, { errors: [{ status: 504 }] }, { status: 'HTTP504' }]) {
    const result = analyzeUcitsHoldings(input, options);
    assert.equal(result.status, 'GATEWAY_ERROR');
    assert.equal(result.underlyingCoverage, 'UNKNOWN');
    assert.equal(result.xrayReady, false);
    assert.equal(JSON.stringify(result).includes('UNSUPPORTED'), false);
  }
});

test('as-of freshness is explicit, future or malformed dates cannot be FULL', () => {
  assert.equal(analyzeUcitsHoldings(basket({ asOf: '2026-01-01' }), options).status, 'STALE');
  assert.equal(analyzeUcitsHoldings(basket({ asOf: '2026-10-09' }), options).status, 'PARTIAL');
  assert.equal(analyzeUcitsHoldings(basket({ asOf: '2026-02-30' }), options).asOf, null);
  assert.equal(analyzeUcitsHoldings({}, options).status, 'UNAVAILABLE');
});

test('physical cash rows are retained; derivatives or unknown types block XRay', () => {
  const complete = analyzeUcitsHoldings(basket(), options);
  assert.equal(complete.xrayReady, true);
  assert.equal(complete.cashWeight, 0.01);
  const derivatives = analyzeUcitsHoldings(basket({ holdings: [{ weight: 100, assetType: 'SWAP' }], providerTotal: 1, structureCoverageCertified: true }), { ...options, fundStructure: 'synthetic' });
  assert.equal(derivatives.status, 'FULL');
  assert.equal(derivatives.xrayReady, false);
  const unknown = analyzeUcitsHoldings(basket({ holdings: [{ weight: 100, assetType: 'MYSTERY' }], providerTotal: 1 }), options);
  assert.equal(unknown.xrayReady, false);
});

test('corrected adapter shape consumes every row and percent contract, and keeps report start separate', () => {
  const raw = [{ output: { attributes: { ticker: 'TEST', date_report_period: '2026-07-01', end_report_period: '2026-09-30' } } }];
  const result = analyzeUcitsHoldings({ complete: true, raw, pagination: { total: 2 }, data: {
    holdings: [{ weightPercent: 99, weightRaw: '99', assetCategory: 'EC', raw: { original: true } }, { weightPercent: 1, weightRaw: '1', assetCategory: 'DC' }],
    reportDates: ['2026-07-01'], reportedPeriodEnds: ['2026-09-30'], reportedTotal: 2
  } }, { now: options.now, fundStructure: 'physical' });
  assert.equal(result.status, 'FULL');
  assert.equal(result.asOf, '2026-09-30');
  assert.deepEqual(result.reportPeriodStarts, ['2026-07-01']);
  assert.equal(result.weightUnit, 'percent');
  assert.equal(result.normalizedRows[0].weightOriginal, '99');
  assert.deepEqual(result.normalizedRows[0].raw, { original: true });
  assert.deepEqual(result.raw, raw);
});

test('an adapter report with no certified period end never calls period start its as-of', () => {
  const result = analyzeUcitsHoldings({ complete: true, data: { holdings: [{ weightPercent: 100, assetCategory: 'EC' }], reportDates: ['2026-07-01'], reportedPeriodEnds: [null], reportedTotal: 1 } }, options);
  assert.equal(result.asOf, null);
  assert.equal(result.status, 'PARTIAL');
});

test('identical raw rows cannot certify completeness or XRay and every row remains preserved', () => {
  const row = { ticker: 'A', weight: 50, assetType: 'EQUITY' };
  const result = analyzeUcitsHoldings(basket({ holdings: [row, { ...row }], providerTotal: 2 }), options);
  assert.equal(result.status, 'PARTIAL');
  assert.equal(result.xrayReady, false);
  assert.equal(result.duplicateRowCount, 1);
  assert.equal(result.rawRows.length, 2);
  assert.equal(result.sumWeights, 1);
  assert.ok(result.reasons.includes('DUPLICATE_HOLDINGS_ROWS'));
  const reordered = { assetType: 'EQUITY', weight: 50, ticker: 'A' };
  assert.equal(analyzeUcitsHoldings(basket({ holdings: [row, reordered], providerTotal: 2 }), options).status, 'PARTIAL');
});

test('malformed, inconsistent or overwritten report dates cannot certify current holdings', () => {
  for (const asOf of ['2026-10-07garbage', '2026-10-07T00:00:00Z', '2026-02-30']) {
    const result = analyzeUcitsHoldings(basket({ asOf }), options);
    assert.equal(result.status, 'PARTIAL');
    assert.equal(result.asOf, null);
    assert.ok(result.reasons.includes('INVALID_AS_OF_EVIDENCE'));
  }
  const conflicts = analyzeUcitsHoldings(basket({ data: { reportedPeriodEnds: ['2026-01-01', '2026-10-07'] } }), options);
  assert.equal(conflicts.status, 'PARTIAL');
  assert.equal(conflicts.asOf, null);
  assert.equal(conflicts.xrayReady, false);
  assert.ok(conflicts.reasons.includes('CONFLICTING_AS_OF_EVIDENCE'));
  const overridden = analyzeUcitsHoldings(basket({ data: { reportedPeriodEnds: ['2026-01-01'] } }), options);
  assert.equal(overridden.status, 'PARTIAL');
  assert.ok(overridden.reasons.includes('CONFLICTING_AS_OF_EVIDENCE'));
  assert.equal(analyzeUcitsHoldings(basket(), { ...options, now: '2026-10-08T12:00:00.000Z' }).status, 'FULL');
  assert.throws(() => analyzeUcitsHoldings(basket(), { ...options, now: '2026-10-08garbage' }), /INVALID_NOW/);
});

test('metadata does not invent domicile, UCITS certification, TER units or missing zeroes', () => {
  const result = analyzeUcitsMetadata({ name: 'Sample UCITS ETF', country: 'DE', exchange: 'XETR', expense_ratio: '0.2', description: 'physical accumulation' });
  assert.equal(result.fields.country, 'DE');
  assert.equal(result.fields.domicile, null);
  assert.equal(result.fields.ucits, null);
  assert.equal(result.ucitsCertified, false);
  assert.equal(result.ucitsNameCue, 'OBSERVED_NAME_CUE');
  assert.equal(result.fields.ter, 0.2);
  assert.equal(result.fields.terFraction, null);
  assert.equal(result.fields.nav, null);
  assert.equal(result.fields.aum, null);
  assert.equal(result.fields.replication, null);
  assert.equal(result.provenance.ter.field, 'expense_ratio');
  const explicit = analyzeUcitsMetadata({ ter: 0.2, ter_unit: 'percent', ucits: true, domicile: 'IE' });
  assert.equal(explicit.fields.terFraction, 0.002);
  assert.equal(explicit.ucitsCertified, true);
});

test('same ISIN groups share class listings, distinct classes require explicit fund linkage', () => {
  const input = [
    { name: 'Sample', isin: 'IE00B4L5Y983', symbol: 'EUNL', mic: 'XETR' },
    { name: 'Sample', isin: 'IE00B4L5Y983', symbol: 'IWDA', mic: 'XLON' },
    { name: 'Sample', isin: 'IE00B5BMR087', symbol: 'SXR8', mic: 'XETR' }
  ];
  const result = buildEtfIdentity(input);
  assert.equal(result.counts.shareClasses, 2);
  assert.equal(result.counts.funds, 0);
  assert.equal(result.unresolvedFundListings, 3);
  assert.equal(result.counts.listings, 3);
  const linked = buildEtfIdentity(input.map(row => ({ ...row, fundId: 'existing-fund' })));
  assert.equal(linked.counts.funds, 1);
  assert.equal(linked.funds[0].shareClassIds.length, 2);
  const conflict = buildEtfIdentity([{ ...input[0], fundId: 'one' }, { ...input[1], fundId: 'two' }]);
  assert.equal(conflict.conflicts.length, 1);
  const invalid = buildEtfIdentity([{ isin: 'IE00B4L5Y984', symbol: 'BAD', mic: 'XETR' }]);
  assert.equal(invalid.listings[0].identityStatus, 'REVIEW');
  assert.equal(invalid.counts.shareClasses, 0);
});

test('Vorsorge fusion proposal never overwrites primary; rights block publication separately', () => {
  const args = { identity: { isin: 'IE00B4L5Y983', identityStatus: 'MAPPED_SHARE_CLASS' },
    holdings: analyzeUcitsHoldings(basket(), options), metadata: analyzeUcitsMetadata({ ter: 0.2, ter_unit: 'percent', ucits: true, domicile: 'IE' }),
    price: { valid: true, freshness: 'CURRENT' } };
  const result = ucitsProductReadiness(args);
  assert.equal(result.tier, 4);
  assert.equal(result.vorsorgeReady, true);
  assert.equal(result.publicationReady, false);
  assert.equal(result.fusionPolicy.overwritePrimary, false);
  assert.equal(result.fusionPolicy.normalizePartialHoldingsTo100, false);
  assert.equal(ucitsProductReadiness({ ...args, identity: { ...args.identity, conflicts: ['bad'] } }).fusionReady, false);
  assert.equal(ucitsProductReadiness({ ...args, rights: { displayConfirmed: true, commercialConfirmed: true } }).publicationReady, true);
});
