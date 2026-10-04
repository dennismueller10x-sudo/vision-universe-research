import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { factorCoverageFromRows, mergeScopedMarketFactors } from '../../scripts/market/tiingo2-factors.mjs';

const root = resolve(import.meta.dirname, '../..');
const broad = JSON.parse(readFileSync(resolve(root, 'quant/data/market/factors/factors-FULL_UNIVERSE.json')));

test('delivered broad factor coverage is exactly reproducible before a scoped merge', () => {
  assert.deepEqual(factorCoverageFromRows(broad.securities, broad.skipped), broad.coverage);
});

test('a scoped DNA calculation replaces a skipped entry exactly once while existing factor rows stay intact', () => {
  // The daily market refresh may already have calculated DNA. Model the
  // skipped-to-calculated transition explicitly against either main state.
  const baseline = structuredClone(broad);
  baseline.securities = baseline.securities.filter(row => row.ticker !== 'DNA');
  baseline.skipped = [...baseline.skipped.filter(row => row.ticker !== 'DNA'),
    { ticker: 'DNA', securityId: 'ref_DNA', reason: 'TEST_SCOPED_RECALCULATION' }];
  baseline.coverage = factorCoverageFromRows(baseline.securities, baseline.skipped);
  const template = broad.securities.find(row => row.ticker === 'AAPL');
  const dna = { ...structuredClone(template), ticker: 'DNA', securityId: 'ref_DNA' };
  const merged = mergeScopedMarketFactors(baseline, { securities: [dna] }, { asOf: '2026-10-03' });
  assert.equal(merged.coverage.requested, baseline.coverage.requested);
  assert.equal(merged.coverage.computed, baseline.coverage.computed + 1);
  assert.equal(merged.coverage.skipped, baseline.coverage.skipped - 1);
  assert.equal(merged.skipped.some(row => row.ticker === 'DNA'), false);
  assert.deepEqual(merged.securities.find(row => row.ticker === 'AAPL'), template);
  assert.deepEqual(merged.coverage, factorCoverageFromRows(merged.securities, merged.skipped));
});
