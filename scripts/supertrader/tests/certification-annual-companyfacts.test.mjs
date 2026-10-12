import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {certifyCompanyfactsAnnualPartial, conservativeAfterFilingDayUTC,
  selectAnnualFactsAtFormation} from '../research/certification/annual-facts.mjs';
import {selectPITFact} from '../research/tournament/engines/fundamental.mjs';

const issuer = '0000123456', original = '0000123456-25-000001', later = '0000123456-25-000002';
function receipt(document, url) {
  const text = JSON.stringify(document);
  return {text, url, sha256: crypto.createHash('sha256').update(text).digest('hex')};
}
function fixture() {
  const cf = {cik: 123456, facts: {'us-gaap': {}}};
  const add = (tag, val, start = '2024-01-01') => {cf.facts['us-gaap'][tag] = {units: {USD: [
    {accn: original, form: '10-K', fp: 'FY', fy: 2024, filed: '2025-03-03', start, end: '2024-12-31', val},
  ]}};};
  add('Revenues', 100); add('CostOfGoodsAndServicesSold', 60); add('Assets', 200, undefined);
  // An explicit absent duration for the balance-sheet instant, not a synthetic annual flow.
  delete cf.facts['us-gaap'].Assets.units.USD[0].start;
  const submissions = {cik: 123456, sic: '9999', filings: {recent: {accessionNumber: [original], form: ['10-K'],
    reportDate: ['2024-12-31'], filingDate: ['2025-03-03'], acceptanceDateTime: ['2025-03-04T02:30:00Z']}}};
  const sessions = [{sessionDate: '2025-03-03', formationCutoffUTC: '2025-03-03T21:00:00Z'},
    {sessionDate: '2025-03-04', formationCutoffUTC: '2025-03-04T21:00:00Z'},
    {sessionDate: '2025-04-08', formationCutoffUTC: '2025-04-08T21:00:00Z'}];
  const call = (extra = {}) => certifyCompanyfactsAnnualPartial({issuerCik: issuer, securityId: 'SYNTHETIC_PARTIAL_INPUT', signalSessions: sessions,
    companyfactsArtifact: receipt(cf, `https://data.sec.gov/api/xbrl/companyfacts/CIK${issuer}.json`),
    submissionsArtifact: receipt(submissions, `https://data.sec.gov/submissions/CIK${issuer}.json`), ...extra});
  return {cf, submissions, call};
}

test('official current annual accession facts are MEDIUM/PIT_PARTIAL with an explicit non-actual date bound', () => {
  const {call} = fixture(), result = call(), facts = result.fundamentals;
  assert.deepEqual(facts.map(f => f.key), ['revenue', 'cogs', 'assets']);
  assert.equal(facts[0].availableAt, '2025-03-04T05:00:00.000Z');
  assert.equal(facts[0].actualAcceptedAt, null); assert.equal(facts[0].firstKnownAt, null);
  assert.equal(facts[0].certification.confidence, 'MEDIUM'); assert.equal(facts[0].certification.primaryContextVerified, false);
  assert.equal(facts[0].fiscalYear, null); assert.equal(facts[0].reportedFiscalYearClaim, 2024);
  assert.equal(result.fiscalPeriodLinks.length, 0); assert.ok(result.missingContracts.includes('sic'));
  assert.equal(selectAnnualFactsAtFormation(result, {sessionDate: '2025-03-03', formationCutoffUTC: '2025-03-03T21:00:00Z'}).length, 0);
  const selected = selectAnnualFactsAtFormation(result, {sessionDate: '2025-03-04', formationCutoffUTC: '2025-03-04T21:00:00Z'});
  assert.equal(selectPITFact({fundamentals: selected}, 'revenue', '2025-03-04T21:00:00Z', {annual: true}).value, 100);
});

test('NY conservative midnight boundary handles standard/daylight time without blind API clock interpretation', () => {
  assert.equal(conservativeAfterFilingDayUTC('2025-03-03'), '2025-03-04T05:00:00.000Z');
  assert.equal(conservativeAfterFilingDayUTC('2025-07-07'), '2025-07-08T04:00:00.000Z');
  assert.throws(() => conservativeAfterFilingDayUTC('2025-02-30'), /FILING_DATE_REQUIRED/);
});

test('comparative periods, quarterly flows, current SIC and foreign units cannot masquerade as original current FY', () => {
  for (const edit of [f => {f.cf.facts['us-gaap'].Revenues.units.USD[0].end = '2023-12-31';},
    f => {f.cf.facts['us-gaap'].Revenues.units.USD[0].start = '2024-10-01';},
    f => {f.submissions.filings.recent.form[0] = '10-K/A';},
    f => {f.cf.facts['us-gaap'].Revenues.units.EUR = f.cf.facts['us-gaap'].Revenues.units.USD; delete f.cf.facts['us-gaap'].Revenues.units.USD;}]) {
    const f = fixture();edit(f); assert.equal(f.call().fundamentals.some(r => r.key === 'revenue'), false);
  }
  const f = fixture();f.cf.facts['us-gaap'].Revenues.units.USD[0].fy = 2099;
  const row = f.call().fundamentals.find(r => r.key === 'revenue');
  assert.equal(row.fiscalYear, null);assert.equal(row.certification.annualPeriodEvidence.fiscalYearMethod, 'UNKNOWN_DEI_FISCAL_YEAR_NOT_CERTIFIED');
});

test('later amendment uncertainty invalidates the first vintage only after conservative publication bound', () => {
  const {call, submissions} = fixture();
  submissions.filings.recent.accessionNumber.push(later);submissions.filings.recent.form.push('10-K/A');
  submissions.filings.recent.reportDate.push('2024-12-31');submissions.filings.recent.filingDate.push('2025-04-07');
  submissions.filings.recent.acceptanceDateTime.push('2025-04-07T20:00:00Z');
  const result = call();
  assert.ok(selectAnnualFactsAtFormation(result, {sessionDate: '2025-03-04', formationCutoffUTC: '2025-03-04T21:00:00Z'}).some(f => f.key === 'revenue'));
  assert.equal(selectAnnualFactsAtFormation(result, {sessionDate: '2025-04-08', formationCutoffUTC: '2025-04-08T21:00:00Z'}).length, 0);
});

test('conflicting official aliases and changed comparative values block old key rather than silently select a fallback', () => {
  const f = fixture();
  f.cf.facts['us-gaap'].RevenueFromContractWithCustomerExcludingAssessedTax = {units: {USD: [
    {...f.cf.facts['us-gaap'].Revenues.units.USD[0], val: 999},
  ]}};
  const result = f.call();
  assert.equal(selectAnnualFactsAtFormation(result, {sessionDate: '2025-03-04', formationCutoffUTC: '2025-03-04T21:00:00Z'}).some(r => r.key === 'revenue'), false);
  const other = fixture();
  for (const [key, value] of Object.entries({accessionNumber: later, form: '10-K', reportDate: '2025-12-31', filingDate: '2026-03-03', acceptanceDateTime: '2026-03-03T22:00:00Z'})) other.submissions.filings.recent[key].push(value);
  other.cf.facts['us-gaap'].Revenues.units.USD.push({...other.cf.facts['us-gaap'].Revenues.units.USD[0], accn: later, filed: '2026-03-03', val: 90, fy: 2025});
  const changed = other.call();
  assert.ok(changed.factConflicts.some(r => r.key === 'revenue' && r.knownFrom === '2026-03-04T05:00:00.000Z'));
});

test('raw official JSON hash, issuer URL and bulk-entry/container binding are mandatory', () => {
  const f = fixture(), cf = receipt(f.cf, `https://data.sec.gov/api/xbrl/companyfacts/CIK${issuer}.json`),
    sub = receipt(f.submissions, `https://data.sec.gov/submissions/CIK${issuer}.json`);
  const options = {issuerCik: issuer, securityId: 'SYNTHETIC_PARTIAL_INPUT', companyfactsArtifact: cf, submissionsArtifact: sub};
  assert.throws(() => certifyCompanyfactsAnnualPartial({...options, companyfactsArtifact: {...cf, sha256: 'b'.repeat(64)}}), /RECEIPT_SHA256/);
  assert.throws(() => certifyCompanyfactsAnnualPartial({...options, companyfactsArtifact: {...cf, url: cf.url.replace(issuer, '0000999999')}}), /DATASET_MISMATCH/);
  const bulk = {...cf, url: 'https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip', entryName: `CIK${issuer}.json`};
  assert.throws(() => certifyCompanyfactsAnnualPartial({...options, companyfactsArtifact: bulk}), /DATASET_MISMATCH/);
  assert.equal(certifyCompanyfactsAnnualPartial({...options, companyfactsArtifact: {...bulk, containerSha256: 'a'.repeat(64)}}).pitState, 'PIT_PARTIAL');
});

test('optional original archival SIC header supplies historical classification without promoting current API SIC', () => {
  const {call} = fixture();
  const text = `<ACCEPTANCE-DATETIME>20250303123000\nACCESSION NUMBER: ${original}\nCONFORMED SUBMISSION TYPE: 10-K\nCONFORMED PERIOD OF REPORT: 20241231\nFILED AS OF DATE: 20250303\nSTANDARD INDUSTRIAL CLASSIFICATION: SYNTHETIC [1234]\n`;
  const header = {text, accession: original, sha256: crypto.createHash('sha256').update(text).digest('hex'),
    url: `https://www.sec.gov/Archives/edgar/data/123456/${original.replaceAll('-', '')}/${original}.txt`};
  const row = call({originalHeaders: [header]}).fundamentals.find(f => f.key === 'sic');
  assert.equal(row.value, 1234); assert.equal(row.unit, 'CODE');
  assert.equal(row.availableAt, '2025-03-03T17:30:00.000Z');
  assert.equal(row.certification.mapping, 'EXACT_ORIGINAL_ACCESSION_HEADER');
  assert.equal(call().fundamentals.some(f => f.key === 'sic'), false);
  const unknown = {...header, text: text.replace('[1234]', '[0000]')};
  unknown.sha256 = crypto.createHash('sha256').update(unknown.text).digest('hex');
  assert.equal(call({originalHeaders: [unknown]}).fundamentals.some(f => f.key === 'sic'), false);
});

test('unknown archival API acceptance is permitted only as partial date-bound data with valid original dates', () => {
  const f = fixture();delete f.submissions.filings.recent.acceptanceDateTime;
  const result = f.call(), revenue = result.fundamentals.find(r => r.key === 'revenue');
  assert.equal(revenue.actualAcceptedAt, null); assert.equal(revenue.certification.rawApiAcceptanceDateTime, null);
  assert.equal(revenue.availableAt, '2025-03-04T05:00:00.000Z'); assert.equal(result.pitState, 'PIT_PARTIAL');
  for (const edit of [x => {x.submissions.filings.recent.filingDate[0] = '2025-02-30';},
    x => {x.submissions.filings.recent.reportDate[0] = '';}, x => {x.submissions.filings.recent.accessionNumber[0] = 'UNKNOWN';}]) {
    const bad = fixture();delete bad.submissions.filings.recent.acceptanceDateTime;edit(bad);
    assert.equal(bad.call().fundamentals.length, 0);
  }
});
