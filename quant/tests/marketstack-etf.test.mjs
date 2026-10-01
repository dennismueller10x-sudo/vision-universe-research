import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {normalizeETFHoldings} = require('../../providers/marketstack/etf.js');
const fixture = require('./fixtures/marketstack-voo-holdings.json');
const dateFixture = require('./fixtures/marketstack-ief-holdings-dates.json');
const identity = {securityId: 'security_voo', listingId: 'listing_voo_arcx', assetType: 'etf', symbol: 'VOO', isin: 'US9229083632'};
const normalize = (payload = fixture.payload, id = identity) => normalizeETFHoldings(payload, id, {retrievedAt: fixture.retrievedAt});

test('real VOO report preserves percentage units, signed derivatives and collateral lines', () => {
  const result = normalize();
  assert.equal(result.ok, true);
  const d = result.data;
  assert.equal(d.reportDate, '2024-12-31');
  assert.equal(d.signatureDate, '2025-02-27');
  assert.equal(d.publicAvailableAt, null);
  assert.equal(d.fund.seriesId, 'S000002839');
  assert.equal(d.portfolioScope, 'REPORTED_FUND_SERIES');
  assert.equal(d.holdings[0].weightPercent, 0.064039295060);
  assert.equal(d.holdings[0].weightFraction, 0.00064039295060);
  assert.equal(d.holdings[0].raw.percent_value, '0.064039295060');
  assert.equal(d.holdings[2].valueUSD, -185850);
  assert.ok(d.holdings[2].weightPercent < 0);
  assert.equal(d.holdings[2].assetCategory, 'DE');
  assert.equal(d.holdings[2].isin, null);
  assert.equal(d.holdings[2].lei, null);
  assert.equal(d.holdings[3].cashCollateral, 'Y');
  assert.equal(d.holdings[4].cashCollateral, 'N');
  assert.equal(d.holdings.length, 5);
  assert.equal(d.completeness, 'UNKNOWN');
  assert.equal(d.coverage, 'PARTIAL');
  assert.ok(d.anomalies.some(a => a.code === 'HOLDINGS_TOTAL_REQUIRES_REVIEW'));
  assert.ok(!d.anomalies.some(a => a.code === 'DUPLICATE_HOLDING_LINE'));
});

test('ETF identity mandatory; provider errors and fund mismatches fail closed', () => {
  assert.equal(normalize(undefined, {...identity, assetType: 'equity'}).reason, 'etfIdentityRequired');
  assert.equal(normalize(undefined, {...identity, listingId: null}).reason, 'etfIdentityRequired');
  assert.equal(normalize(undefined, {...identity, symbol: 'SPY'}).reason, 'symbolMismatch');
  assert.equal(normalize(undefined, {...identity, isin: 'US0000000000'}).reason, 'isinMismatch');
  assert.equal(normalize({code: 404, message: 'No holdings'}).reason, 'providerError');
  assert.equal(normalize({}).reason, 'invalidHoldingsResponse');
});

test('unknown weights remain null; duplicate and malformed rows are retained and flagged', () => {
  const payload = structuredClone(fixture.payload);
  payload.output.holdings[0].investment_security.percent_value = '';
  payload.output.holdings.push(structuredClone(payload.output.holdings[0]), {});
  const r = normalize(payload);
  assert.equal(r.ok, true);
  assert.equal(r.data.holdings[0].weightPercent, null);
  assert.equal(r.data.holdings[0].weightFraction, null);
  assert.equal(r.data.holdings.length, 7);
  assert.ok(r.data.anomalies.some(a => a.code === 'MISSING_OR_INVALID_WEIGHT'));
  assert.ok(r.data.anomalies.some(a => a.code === 'DUPLICATE_HOLDING_LINE'));
  assert.ok(r.data.anomalies.some(a => a.code === 'INVALID_HOLDING'));
});

test('report dates must be calendar-valid; modern retrieval cannot manufacture PIT', () => {
  const payload = structuredClone(fixture.payload);
  payload.output.attributes.date_report_period = '2024-02-30';
  assert.equal(normalize(payload).reason, 'reportDateMissing');
  assert.equal(normalize().data.publicAvailableAt, null);
  assert.equal(normalize().data.provenance.retrieved_at, fixture.retrievedAt);
});

test('real IEF N-PORT date pair separates actual holdings as-of from future fiscal year end',()=>{
  const actual=normalizeETFHoldings(dateFixture.payload,{securityId:'security_ief',listingId:'listing_ief_arcx',assetType:'etf',symbol:'IEF',isin:'US4642874402'},{retrievedAt:dateFixture.retrievedAt});
  assert.equal(actual.ok,true);assert.equal(actual.data.reportDate,'2026-05-31');
  assert.equal(actual.data.actualAsOf,'2026-05-31');assert.equal(actual.data.fundFiscalYearEnd,'2027-02-28');
  assert.equal(actual.data.reportPeriodStart,'2026-05-31');assert.equal(actual.data.reportPeriodEnd,'2027-02-28');
  assert.equal(actual.data.dateSemantics.legacyPeriodFields,'PROVIDER_LABELS_NOT_PERIOD_BOUNDARIES');
  assert.equal(actual.data.publicAvailableAt,null);assert.equal(actual.data.coverage,'NONE');
  const missing=structuredClone(dateFixture.payload);delete missing.output.attributes.date_report_period;
  assert.equal(normalizeETFHoldings(missing,{securityId:'security_ief',listingId:'listing_ief_arcx',assetType:'etf',symbol:'IEF'}).reason,'reportDateMissing');
});
