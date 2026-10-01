import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeUSListingEvidence } from '../../scripts/market/summarize-marketstack-us-listing-evidence.mjs';
const directory = rows => ({ rows, sources: ['nasdaqlisted.txt', 'otherlisted.txt'].map(file => ({ status: 'FETCHED',
  url: 'https://www.nasdaqtrader.com/dynamic/SymDir/' + file, footer: 'File Creation Time: 1001202611:01|||||' })) });
const base = (ticker, type = 'EQUITY_COMMON') => ({ securityId: ticker, ticker, providerSymbol: ticker,
  baselineInstrumentType: type, expectedMics: ['XNYS'] });
test('official ETF flag cannot override explicit ETN class and current test issues stay separate', () => {
  const r = summarizeUSListingEvidence(directory([{ 'ACT Symbol': 'NOTE', 'Security Name': 'Leveraged ETN', ETF: 'Y', Exchange: 'P', _source: 'otherlisted.txt' },
    { Symbol: 'TEST', 'Security Name': 'Test common stock', ETF: 'N', 'Test Issue': 'Y', _source: 'nasdaqlisted.txt' }]),
    [base('NOTE'), base('TEST')], { asOfDate: '2026-10-01' });
  assert.equal(r.rows[0].currentListing.role, 'ETN'); assert.equal(r.rows[1].currentListing.role, 'TEST_SECURITY');
});
test('preferred mapping preserves ACT class token and never converts common shares into preferred aliases', () => {
  const d = directory([{ 'ACT Symbol': 'ALL$I', 'Security Name': 'Allstate Preferred Stock Series I', Exchange: 'N', ETF: 'N', _source: 'otherlisted.txt' }]);
  const r = summarizeUSListingEvidence(d, [base('ALL-P-I', 'PREFERRED')], { asOfDate: '2026-10-01' });
  assert.equal(r.rows[0].preferredClassTokenVerified, true); assert.equal(r.rows[0].providerAlias, 'ALL-PI');
  assert.equal(summarizeUSListingEvidence(d, [base('ALL-P-I')], { asOfDate: '2026-10-01' }).rows[0].preferredClassTokenVerified, false);
});
test('primary directory absence and venue mismatch do not claim provider unavailable', () => {
  const r = summarizeUSListingEvidence(directory([{ Symbol: 'REAL', 'Security Name': 'Real Common Stock', _source: 'nasdaqlisted.txt', ETF: 'N' }]),
    [base('REAL'), base('OLD')], { asOfDate: '2026-10-01' });
  assert.equal(r.rows[0].baselineVenueMatches, false); assert.equal(r.rows[0].genuineCommonEquityRoleObserved, true);
  assert.equal(r.rows[1].currentProviderUnavailableProven, false); assert.equal(r.totals.providerUnavailableProven, 0);
  assert.equal(summarizeUSListingEvidence(directory([]), [base('OLD')], { asOfDate: '2026-10-02' }).rows[0].publicDirectoryStatus, 'PUBLIC_DIRECTORY_INCOMPLETE');
});
