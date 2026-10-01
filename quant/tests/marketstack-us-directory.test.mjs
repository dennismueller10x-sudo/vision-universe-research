import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeUSDirectory } from '../../scripts/market/summarize-marketstack-us-directory.mjs';
const baseline = { decisions: [{ ticker: 'AAA', securityId: 'ref_AAA', exchange: 'NASDAQ', instrument_type: 'EQUITY_COMMON',
  active_status: 'ACTIVE', product_eligibility: 'ELIGIBLE' }, { ticker: 'MISSING', securityId: 'ref_MISSING', exchange: 'NASDAQ',
  instrument_type: 'EQUITY_COMMON', active_status: 'ACTIVE', product_eligibility: 'ELIGIBLE' }] };
const batch = (offset, rows, total, extras = {}) => ({ label: 'complete-us-directory', endpoint: 'exchanges/XNAS/tickers',
  params: { offset }, ok: true, data: rows, nextOffset: offset + rows.length, pagination: { total }, ...extras });
test('Incomplete directory absence stays unresolved until contiguous resumed pages cover total', () => {
  const first = batch(0, [{ symbol: 'AAA', has_eod: true }], 2, { ok: false, reason: 'pageBudgetExceeded', complete: false });
  const partial = summarizeUSDirectory(baseline, [{ endpoints: [first] }]);
  assert.equal(partial.totals.TOTAL_MARKETSTACK_MATCHED, 1);
  assert.equal(partial.totals.TOTAL_MARKETSTACK_MISSING, 0);
  assert.equal(partial.totals.TOTAL_UNRESOLVED, 1);
  assert.equal(partial.directoryComplete, false);
  const complete = summarizeUSDirectory(baseline, [{ endpoints: [first] }, { endpoints: [batch(1, [{ symbol: 'OTHER', has_eod: false }], 2)] }]);
  assert.equal(complete.directoryComplete, true);
  assert.equal(complete.totals.TOTAL_MARKETSTACK_MISSING, 1);
});
test('Changing totals or missing middle pages cannot certify completeness', () => {
  const changed = summarizeUSDirectory(baseline, [{ endpoints: [batch(0, [{ symbol: 'AAA' }], 2), batch(1, [{ symbol: 'OTHER' }], 3)] }]);
  assert.equal(changed.directoryComplete, false);
  assert.equal(changed.venues[0].inconsistentTotals, true);
  const gap = summarizeUSDirectory(baseline, [{ endpoints: [batch(0, [{ symbol: 'AAA' }], 3), batch(2, [{ symbol: 'OTHER' }], 3)] }]);
  assert.equal(gap.directoryComplete, false);
  assert.deepEqual(gap.venues[0].gaps, [{ from: 1, to: 2 }]);
});
test('Directory has_eod false is distinct from actual price unavailability and conflicting metadata is unresolved', () => {
  const result = summarizeUSDirectory(baseline, [{ endpoints: [batch(0, [{ symbol: 'AAA', has_eod: false },
    { symbol: 'MISSING', has_eod: true }, { symbol: 'MISSING', has_eod: false }], 3)] }]);
  assert.equal(result.totals.TOTAL_MARKETSTACK_MATCHED, 1);
  assert.equal(result.totals.TOTAL_EOD_ADVERTISED, 0);
  assert.equal(result.rows[0].actualPriceValidation, 'NOT_TESTED_COMPLETE_UNIVERSE');
  assert.equal(result.rows[1].status, 'DIRECTORY_METADATA_CONFLICT');
  assert.equal(result.totals.TOTAL_DATA_MISMATCH, null);
});
test('Symbol variants and unqueried venues are review states; no ticker-only global join', () => {
  const decisions = [...baseline.decisions, { ...baseline.decisions[0], ticker: 'BRK-B', securityId: 'ref_BRK-B', exchange: 'NYSE' },
    { ...baseline.decisions[0], ticker: 'OTC', securityId: 'ref_OTC', exchange: 'EXPM' }];
  const result = summarizeUSDirectory({ decisions }, [{ endpoints: [batch(0, [{ symbol: 'AAA', has_eod: true }], 1),
    { ...batch(0, [{ symbol: 'BRK.B', has_eod: false }], 1), endpoint: 'exchanges/XNYS/tickers' }] }]);
  assert.equal(result.rows.find(r => r.ticker === 'BRK-B').status, 'SYMBOL_VARIANT_REVIEW');
  assert.equal(result.rows.find(r => r.ticker === 'OTC').status, 'VENUE_UNRESOLVED');
  assert.equal(result.allBaselineVenuesCovered, false);
});
test('Missing or malformed directories cannot turn missing observations into verified absences', () => {
  assert.equal(summarizeUSDirectory(baseline, []).directoryComplete, false);
  const bad = summarizeUSDirectory(baseline, [{ endpoints: [batch(0, [{ symbol: null }], 1)] }]);
  assert.equal(bad.directoryComplete, false);
  assert.equal(bad.venues[0].invalidDirectoryRows, 1);
  assert.equal(bad.totals.TOTAL_MARKETSTACK_MISSING, 0);
  assert.throws(() => summarizeUSDirectory({ decisions: [baseline.decisions[0], baseline.decisions[0]] }, []), /Duplicate/);
});
