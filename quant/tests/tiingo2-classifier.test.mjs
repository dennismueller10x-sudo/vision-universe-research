import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { isConsumerInstrument } from '../../scripts/market/universe-source.mjs';

const require = createRequire(import.meta.url);
const Base = require('../engines/instrument-classification.js');
const Master = require('../engines/us-security-master.js');
const opts = { today: '2026-10-02', listedRoots: { FCNC: true, AACB: true, ABCD: true, DCOM: true } };
const row = (ticker, name, extra = {}) => ({ ticker, name, assetType: 'Stock', exchange: 'NASDAQ',
  currency: 'USD', startDate: '2020-01-02', endDate: '2026-10-01', ...extra });

test('schema compatibility and new classification rule provenance remain independent', () => {
  assert.equal(Master.VERSION, 'us-security-master-1.2.0');
  assert.equal(Master.CLASSIFICATION_RULE_VERSION, 'us-security-master-rules-1.3.1');
  const input = row('PFBC', 'Preferred Bank');
  assert.equal(Master.classifySecurity(input, opts).classificationRuleVersion, Master.CLASSIFICATION_RULE_VERSION);
  const master = Master.buildSecurityMaster({ providerRows: [input], baseline: [], today: opts.today });
  assert.equal(master.version, Master.VERSION);
  assert.equal(master.classificationRuleVersion, Master.CLASSIFICATION_RULE_VERSION);
});

test('bare domestic depositary shares do not become American ADRs or override preferred suffix evidence', () => {
  for (const [ticker, name] of [
    ['MNSBP', 'MainStreet Bancshares, Inc. - Depositary Shares'],
    ['WAFDP', 'WaFd, Inc. - Depositary Shares']
  ]) {
    const roots = { MNSB: true, WAFD: true };
    assert.equal(Base.classify(row(ticker, name), opts).instrumentType, 'UNKNOWN', ticker);
    for (const exchange of ['NASDAQ', 'NYSE']) {
      const c = Master.classifySecurity(row(ticker, name, { exchange }), { ...opts, listedRoots: roots });
      assert.equal(c.instrumentType, 'PREFERRED', ticker);
      assert.equal(isConsumerInstrument(c.instrumentType), false, ticker);
      assert.equal(c.classificationStatus, exchange === 'NASDAQ' ? 'CLASSIFIED' : 'REVIEW');
    }
  }
  const unknown = Master.classifySecurity(row('ZZZZ', 'Domestic Issuer - Depositary Shares'), opts);
  assert.equal(unknown.instrumentType, 'UNKNOWN');
  assert.equal(unknown.classificationStatus, 'UNKNOWN');
  assert.equal(Master.classifySecurity(row('ZZZZ', 'Domestic Realty Trust - Depositary Shares'), opts).instrumentType, 'UNKNOWN');
  for (const [ticker, name] of [['MNSB', 'MainStreet Bancshares Inc - Common Stock'], ['WAFD', 'WaFd Inc - Common Stock']]) {
    assert.equal(Master.classifySecurity(row(ticker, name), opts).instrumentType, 'EQUITY_COMMON');
  }
  const adr = Master.classifySecurity(row('SKHY', 'SK hynix Inc. - American Depositary Shares'), opts);
  assert.equal(adr.instrumentType, 'ADR');
  assert.equal(Base.classify(row('PREF', 'Foreign Issuer American Depositary Shares representing Preferred Stock'), opts).instrumentType, 'PREFERRED');
});

test('PFBC Preferred Bank names its issuer; a separately evidenced preferred still fails consumer policy', () => {
  for (const name of ['Preferred Bank', 'Preferred Bank Common Stock']) {
    assert.equal(Base.classify(row('PFBC', name), opts).instrumentType, 'COMMON_STOCK');
    const c = Master.classifySecurity(row('PFBC', name), opts);
    assert.equal(c.instrumentType, 'EQUITY_COMMON');
    assert.equal(c.eligibleUsEquity, true);
    assert.equal(isConsumerInstrument(c.instrumentType), true);
  }
  for (const [ticker, name] of [['PFBC-P-A', 'Preferred Bank'], ['PFBCA', 'Preferred Bank Preferred Shares']]) {
    assert.equal(Base.classify(row(ticker, name), opts).instrumentType, 'PREFERRED');
    assert.equal(Master.classifySecurity(row(ticker, name), opts).instrumentType, 'PREFERRED');
    assert.equal(isConsumerInstrument('PREFERRED'), false);
  }
});

test('issuer REIT/trust/depositary names never overwrite an evidenced preferred security', () => {
  for (const [ticker, name] of [
    ['CDR-P-B', 'Cedar Realty Trust Inc'], ['PW-P-A', 'Power REIT'],
    ['JPM-P-M', 'J P Morgan Chase & Co Depositary Shares Series M'],
    ['FCNCP', 'First Citizens Bancshares Inc']
  ]) {
    const c = Master.classifySecurity(row(ticker, name), opts);
    assert.equal(c.instrumentType, 'PREFERRED', ticker);
    assert.equal(isConsumerInstrument(c.instrumentType), false, ticker);
  }
});

test('NASDAQ suffix evidence remains strict on venue and explicit common-stock contradictions', () => {
  for (const [ticker, name, exchange] of [
    ['ABCDP', 'Separate Issuer Common Stock', 'NASDAQ'],
    ['ABCDW', 'Separate Issuer Ordinary Shares', 'NASDAQ'],
    ['DCOMP', 'Dime Community Bancshares Inc', 'NYSE']
  ]) {
    const c = Master.classifySecurity(row(ticker, name, { exchange }), opts);
    assert.equal(c.classificationStatus, 'REVIEW', ticker);
    assert.equal(c.classificationConfidence, 'LOW', ticker);
    assert.notEqual(Master.decideProductEligibility({ instrumentType: c.instrumentType,
      classificationStatus: c.classificationStatus, eligible: c.eligibleUsEquity }).status, 'EXCLUDED');
  }
  assert.equal(Master.classifySecurity(row('FCNCP', 'First Citizens Bancshares Inc'), opts).instrumentType, 'PREFERRED');
  assert.equal(Master.classifySecurity(row('AACBW', null), opts).instrumentType, 'WARRANT');
  // A provider security name confirms the actual preferred, including after a venue move.
  const confirmed = Master.classifySecurity(row('DCOMP', 'Dime Community Bancshares Preferred Stock', { exchange: 'NYSE' }), opts);
  assert.equal(confirmed.instrumentType, 'PREFERRED');
  assert.equal(confirmed.classificationStatus, 'CLASSIFIED');
});

test('Tiingo compact MutualFund labels are funds, including on a US venue', () => {
  for (const assetType of ['MutualFund', 'Mutual Fund', 'Fund', ' mutualfund ']) {
    const r = row('FAKEF', 'Example Portfolio', { assetType });
    assert.equal(Base.classify(r, opts).instrumentType, 'FUND');
    const c = Master.classifySecurity(r, opts);
    assert.equal(c.instrumentType, 'MUTUAL_FUND');
    assert.equal(isConsumerInstrument(c.instrumentType), false);
  }
});

test('explicit provider investment-company form overrides Common Stock but fund-management businesses remain common', () => {
  for (const description of [
    'Ives Ultra AI Opportunities Inc. is a listed closed-end fund structured to invest in a targeted portfolio.',
    'Ives Ultra AI Opportunities Inc. is a non-diversified, closed-end management investment company registered under the Investment Company Act of 1940.'
  ]) {
    const r = row('IVAI', 'Ives Ultra AI Opportunities Inc. Common Stock', { description });
    assert.equal(Base.classify(r, opts).instrumentType, 'FUND');
    const c = Master.classifySecurity(r, opts);
    assert.equal(c.instrumentType, 'CEF');
    assert.equal(isConsumerInstrument(c.instrumentType), false);
    assert.ok(c.flags.includes('PROVIDER_DESCRIPTION_CLOSED_END_FUND'));
  }
  const manager = row('BLK', 'BlackRock Inc. Common Stock', {
    description: 'BlackRock provides asset management services to institutional clients and manages closed-end funds.'
  });
  assert.equal(Master.classifySecurity(manager, opts).instrumentType, 'EQUITY_COMMON');
  const issued = Master.classifySecurity(row('SNDK', 'Sandisk Corporation - Common Stock When-Issued'), opts);
  assert.equal(issued.instrumentType, 'EQUITY_COMMON');
  assert.ok(issued.flags.includes('WHEN_ISSUED_LISTING_METADATA_REVIEW'));
});

test('legitimate classes, Test Systems issuer words and bank/REIT industry data preserve current consumer policy', () => {
  for (const [ticker, name, extra] of [
    ['BRK-A', 'Berkshire Hathaway Inc', { exchange: 'NYSE' }],
    ['BRK-B', 'Berkshire Hathaway Inc', { exchange: 'NYSE' }],
    ['GOOG', 'Alphabet Inc', {}], ['GOOGL', 'Alphabet Inc', {}],
    ['AEHR', 'Aehr Test Systems', {}], ['JPM', 'J P Morgan Chase & Co', { sic: '6021' }],
    ['DNA', 'Ginkgo Bioworks Holdings Inc', { sic: '8731', exchange: 'NYSE' }],
    ['O', 'Realty Income Corp REIT', { sic: '6798', exchange: 'NYSE' }]
  ]) {
    const c = Master.classifySecurity(row(ticker, name, extra), opts);
    assert.equal(isConsumerInstrument(c.instrumentType), true, ticker);
    assert.notEqual(c.instrumentType, 'TEST_SECURITY', ticker);
    assert.notEqual(c.instrumentType, 'PREFERRED', ticker);
  }
  for (const ticker of ['TEST', 'ZXZZT', 'MTEST-A']) {
    assert.equal(Master.classifySecurity(row(ticker, null), opts).instrumentType, 'TEST_SECURITY');
  }
});
