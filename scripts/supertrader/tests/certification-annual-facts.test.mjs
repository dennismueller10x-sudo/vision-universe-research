import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {certifyAnnualFacts, acceptanceIndex, parseAnnualPrimaryArtifact, certifyOriginalAcceptance,
  selectAnnualFactsAtFormation} from '../research/certification/annual-facts.mjs';
import {selectPITFact} from '../research/tournament/engines/fundamental.mjs';
import {resolvePreviousFiscalPeriod} from '../research/certification/fiscal-period-links.mjs';

const issuerCik = '0000123456', securityId = 'SYNTHETIC_CERTIFICATION_SECURITY';
const digest = text => crypto.createHash('sha256').update(text).digest('hex');
const approval = (id, extra = {}) => ({id, status: 'APPROVED_BEFORE_MEASUREMENT', reviewer: 'SYNTHETIC_REVIEW',
  reviewArtifactSha256: 'a'.repeat(64), primarySources: ['https://storage.fasb.org/ASU%202015-01.pdf'], ...extra});
const sessions = [{sessionDate: '2025-03-03', formationCutoffUTC: '2025-03-03T21:00:00Z'},
  {sessionDate: '2025-03-04', formationCutoffUTC: '2025-03-04T21:00:00Z'},
  {sessionDate: '2025-04-07', formationCutoffUTC: '2025-04-07T21:00:00Z'}];
function makeFiling({year = 2024, end = '2024-12-31', start = '2024-01-01', accession = '0000123456-25-000001',
  form = '10-K', accepted = '2025-03-03T21:30:00Z', localAcceptance = '20250303163000', filed = '2025-03-03',
  revenue = 100, units = 'USD', extra = '', quarter = false, comparative = '', focusYear = year} = {}) {
  const context = (id, from, through) => `<xbrli:context id="${id}"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">123456</xbrli:identifier></xbrli:entity><xbrli:period>${from ? `<xbrli:startDate>${from}</xbrli:startDate><xbrli:endDate>${through}</xbrli:endDate>` : `<xbrli:instant>${through}</xbrli:instant>`}</xbrli:period></xbrli:context>`;
  const fact = (concept, value, instant = false, unit = 'usd') => `<gaap:${concept} contextRef="${instant ? 'instant' : 'annual'}" unitRef="${unit}" decimals="-6">${value}</gaap:${concept}>`;
  const text = `<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:iso4217="http://www.xbrl.org/2003/iso4217" xmlns:gaap="http://fasb.org/us-gaap/2024" xmlns:dei="http://xbrl.sec.gov/dei/2024">
    ${context('annual', quarter ? `${year}-10-01` : start, end)}${context('instant', null, end)}
    <xbrli:unit id="usd"><xbrli:measure>iso4217:${units}</xbrli:measure></xbrli:unit>
    <xbrli:unit id="shares"><xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unit>
    <dei:DocumentFiscalYearFocus contextRef="instant">${focusYear}</dei:DocumentFiscalYearFocus>
    <dei:DocumentFiscalPeriodFocus contextRef="instant">FY</dei:DocumentFiscalPeriodFocus>
    <dei:DocumentPeriodEndDate contextRef="instant">${end}</dei:DocumentPeriodEndDate>
    <dei:DocumentType contextRef="instant">${form}</dei:DocumentType>
    ${fact('Revenues', revenue)}${fact('CostOfGoodsAndServicesSold', 60)}${fact('Assets', 200, true)}
    ${fact('NetCashProvidedByUsedInOperatingActivities', 20)}${fact('StockholdersEquity', 120, true)}
    ${fact('PreferredStockSharesOutstanding', 0, true, 'shares')}${fact('NetIncomeLoss', 15)}
    ${fact('IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest', 25)}
    ${fact('InterestAndDebtExpense', 5)}${fact('OperatingIncomeLoss', 24)}
    ${fact('ProceedsFromIssuanceOfCommonStock', 0)}${extra}${comparative}
  </xbrli:xbrl>`;
  const base = `https://www.sec.gov/Archives/edgar/data/123456/${accession.replaceAll('-', '')}/`;
  const header = `<ACCEPTANCE-DATETIME>${localAcceptance}\nACCESSION NUMBER: ${accession}\nCONFORMED SUBMISSION TYPE: ${form}\nCONFORMED PERIOD OF REPORT: ${end.replaceAll('-', '')}\nFILED AS OF DATE: ${filed.replaceAll('-', '')}\nSTANDARD INDUSTRIAL CLASSIFICATION: SYNTHETIC INDUSTRY [1234]\n`;
  return {metadata: {accessionNumber: accession, acceptanceDateTime: accepted, reportDate: end, filingDate: filed, form},
    document: {accession, text, sha256: digest(text), url: base + 'instance.xml',
      filingHeader: {text: header, sha256: digest(header), url: base + accession + '.txt'}}};
}
function input(filings, extra = {}) {
  const recent = Object.fromEntries(['accessionNumber', 'acceptanceDateTime', 'reportDate', 'filingDate', 'form'].map(key => [key, filings.map(f => f.metadata[key])]));
  return {issuerCik, securityId, submissions: {cik: 123456, filings: {recent}},
    filingDocuments: filings.map(f => f.document), signalSessions: sessions, ...extra};
}

test('actual XBRL concept/context/unit proof emits unchanged-selector-compatible annual USD facts', () => {
  const result = certifyAnnualFacts(input([makeFiling()]));
  const revenue = result.fundamentals.find(f => f.key === 'revenue');
  assert.equal(revenue.value, 100); assert.equal(revenue.unit, 'USD'); // decimals=-6 does not multiply raw USD.
  assert.equal(revenue.availableAt, '2025-03-03T21:30:00.000Z');
  assert.equal(revenue.eligibility.firstEligibleSignalSession, '2025-03-04');
  assert.equal(revenue.certification.operands[0].concept, 'Revenues');
  assert.equal(revenue.certification.operands[0].source.sha256, input([makeFiling()]).filingDocuments[0].sha256);
  assert.equal(selectPITFact({fundamentals: result.fundamentals}, 'revenue', '2025-03-04T21:00:00Z', {annual: true}).value, 100);
});

test('EUR, quarters, dimensional facts and fake namespace labels never become annual normalized USD', () => {
  for (const options of [{units: 'EUR'}, {quarter: true}]) {
    const result = certifyAnnualFacts(input([makeFiling(options)]));
    assert.equal(result.fundamentals.length, 0); assert.equal(result.status, 'BLOCKED_DATA');
  }
  const filing = makeFiling();
  filing.document.text = filing.document.text.replace('http://fasb.org/us-gaap/2024', 'https://fake.example/us-gaap/2024');
  filing.document.sha256 = digest(filing.document.text);
  assert.equal(certifyAnnualFacts(input([filing])).fundamentals.length, 0);
  const dimensional = makeFiling();
  dimensional.document.text = dimensional.document.text.replaceAll('</xbrli:entity>', '<xbrli:segment><fake/></xbrli:segment></xbrli:entity>');
  dimensional.document.sha256 = digest(dimensional.document.text);
  assert.equal(certifyAnnualFacts(input([dimensional])).fundamentals.length, 0);
});

test('amended facts become visible only at real acceptance, never backdated to the original fiscal period', () => {
  const original = makeFiling(), amendment = makeFiling({form: '10-K/A', accession: '0000123456-25-000002',
    accepted: '2025-04-07T20:00:00Z', localAcceptance: '20250407160000', filed: '2025-04-07', revenue: 90});
  const result = certifyAnnualFacts(input([original, amendment]));
  const security = {fundamentals: result.fundamentals};
  assert.equal(selectPITFact(security, 'revenue', '2025-04-07T19:59:59Z').value, 100);
  assert.equal(selectPITFact(security, 'revenue', '2025-04-07T20:00:00Z').value, 90);
  assert.equal(result.fundamentals.find(f => f.key === 'revenue' && f.value === 90).firstKnownAt, '2025-04-07T20:00:00.000Z');
});

test('formation eligibility prevents direct date-asOf selector day-end from admitting after-close facts', () => {
  const result = certifyAnnualFacts(input([makeFiling()]));
  assert.equal(selectPITFact({fundamentals: result.fundamentals}, 'revenue', '2025-03-03').value, 100);
  assert.equal(selectAnnualFactsAtFormation(result, {formationCutoffUTC: '2025-03-03T21:00:00Z', sessionDate: '2025-03-03'}).length, 0);
  assert.ok(selectAnnualFactsAtFormation(result, {formationCutoffUTC: '2025-03-04T21:00:00Z', sessionDate: '2025-03-04'}).length > 0);
  assert.throws(() => selectAnnualFactsAtFormation(result, {formationCutoffUTC: '2025-03-03', sessionDate: '2025-03-03'}), /EXPLICIT_UTC/);
});

test('header NY clock overrides inconsistent API UTC clock with explicit conflict and MEDIUM/PIT_PARTIAL', () => {
  const filing = makeFiling({accepted: '2025-03-04T02:30:00Z'});
  const result = certifyAnnualFacts(input([filing])), fact = result.fundamentals.find(f => f.key === 'revenue');
  assert.equal(fact.availableAt, '2025-03-03T21:30:00.000Z');
  assert.equal(fact.certification.apiClockConflict, true); assert.equal(fact.certification.confidence, 'MEDIUM');
  assert.equal(fact.certification.pitState, 'PIT_PARTIAL_TIME_SOURCE_CONFLICT');
  const absent = makeFiling(); delete absent.document.filingHeader;
  assert.equal(certifyAnnualFacts(input([absent])).fundamentals.length, 0);
});

test('ASU elimination mapping needs reviewed source identity and actual period-start effective date', () => {
  const derivationApprovals = [approval('US_GAAP_ASU2015_01_NET_INCOME_PARENT_NO_EXTRAORDINARY')];
  assert.ok(certifyAnnualFacts(input([makeFiling()], {derivationApprovals})).fundamentals.some(f => f.key === 'incomeBeforeExtraordinaryItems'));
  assert.equal(certifyAnnualFacts(input([makeFiling()])).fundamentals.some(f => f.key === 'incomeBeforeExtraordinaryItems'), false);
  const old = makeFiling({year: 2016, start: '2015-12-15', end: '2016-12-14'});
  assert.equal(certifyAnnualFacts(input([old], {derivationApprovals})).fundamentals.some(f => f.key === 'incomeBeforeExtraordinaryItems'), false);
  const applicable = makeFiling({year: 2016, start: '2015-12-16', end: '2016-12-15'});
  assert.ok(certifyAnnualFacts(input([applicable], {derivationApprovals})).fundamentals.some(f => f.key === 'incomeBeforeExtraordinaryItems'));
});

test('common equity, EBIT and issuance never use missing-preferred, operating-income or absent-issuance shortcuts', () => {
  const derivationApprovals = [approval('COMMON_EQUITY_PARENT_WITH_ZERO_PREFERRED_OUTSTANDING'),
    approval('EBIT_PBT_PLUS_GROSS_INTEREST_SOURCE_COMPATIBLE', {ebitDefinition: 'TOTAL_PRETAX_EARNINGS_BEFORE_GROSS_INTEREST'})];
  const result = certifyAnnualFacts(input([makeFiling()], {derivationApprovals}));
  assert.equal(result.fundamentals.find(f => f.key === 'bookEquity').value, 120);
  assert.equal(result.fundamentals.find(f => f.key === 'ebit').value, 30);
  assert.equal(result.fundamentals.some(f => f.key === 'noCommonEquityIssued'), false);
  assert.equal(result.fundamentals.some(f => f.key === 'grossCommonEquityIssued'), false);
  const missing = makeFiling(); missing.document.text = missing.document.text.replace(/<gaap:PreferredStockSharesOutstanding[^>]*>.*?<\/gaap:PreferredStockSharesOutstanding>/, '');
  missing.document.sha256 = digest(missing.document.text);
  assert.equal(certifyAnnualFacts(input([missing], {derivationApprovals})).fundamentals.some(f => f.key === 'bookEquity'), false);
  const issuance = makeFiling({extra: '<gaap:ProceedsFromStockOptionsExercised contextRef="annual" unitRef="usd">3</gaap:ProceedsFromStockOptionsExercised>'});
  assert.equal(certifyAnnualFacts(input([issuance])).fundamentals.find(f => f.key === 'noCommonEquityIssued').value, false);
  assert.equal(certifyAnnualFacts(input([makeFiling()])).fundamentals.some(f => f.key === 'ebit'), false);
});

test('original FY lineage preserves 52/53-week ends and chains through independently validated resolver', () => {
  const filings = [
    makeFiling({year: 2022, start: '2022-01-02', end: '2022-12-31', accession: '0000123456-23-000001', accepted: '2023-03-06T17:00:00Z', localAcceptance: '20230306120000', filed: '2023-03-06'}),
    makeFiling({year: 2023, start: '2023-01-01', end: '2023-12-30', accession: '0000123456-24-000001', accepted: '2024-03-04T17:00:00Z', localAcceptance: '20240304120000', filed: '2024-03-04'}),
    makeFiling({year: 2024, start: '2023-12-31', end: '2024-12-28'}),
  ];
  const result = certifyAnnualFacts(input(filings));
  const security = {id: securityId, issuerCik, fiscalPeriodLinks: result.fiscalPeriodLinks};
  const previous = resolvePreviousFiscalPeriod(security, '2024-12-28', {formationCutoffUTC: '2025-03-04T21:00:00Z', steps: 2});
  assert.equal(previous.status, 'CERTIFIED'); assert.equal(previous.periodEnd, '2022-12-31');
  assert.deepEqual(result.fiscalPeriodLinks.map(l => l.currentPeriodEnd), ['2023-12-30', '2024-12-28']);
});

test('later contradictory fiscal focus blocks only after its actual known time, preserving original history', () => {
  const prior = makeFiling({year: 2023, start: '2023-01-01', end: '2023-12-31', accession: '0000123456-24-000001', accepted: '2024-03-04T17:00:00Z', localAcceptance: '20240304120000', filed: '2024-03-04'});
  const conflicting = makeFiling({focusYear: 2025, form: '10-K/A', accession: '0000123456-25-000002', accepted: '2025-04-07T20:00:00Z', localAcceptance: '20250407160000', filed: '2025-04-07'});
  const result = certifyAnnualFacts(input([prior, makeFiling(), conflicting]));
  const security = {id: securityId, issuerCik, fiscalPeriodLinks: result.fiscalPeriodLinks};
  assert.equal(resolvePreviousFiscalPeriod(security, '2024-12-31', {formationCutoffUTC: '2025-03-04T21:00:00Z'}).status, 'CERTIFIED');
  assert.equal(resolvePreviousFiscalPeriod(security, '2024-12-31', {formationCutoffUTC: '2025-04-07T21:00:00Z'}).status, 'BLOCKED');
  assert.ok(selectPITFact({fundamentals: result.fundamentals}, 'revenue', '2025-03-04T21:00:00Z'));
});

test('proof hashes, wrong accession URLs, malformed UTC API times and conflicting metadata fail closed', () => {
  const filing = makeFiling();
  assert.throws(() => parseAnnualPrimaryArtifact({...filing.document, sha256: 'b'.repeat(64)}, issuerCik, filing.document.accession), /SHA256/);
  assert.throws(() => parseAnnualPrimaryArtifact({...filing.document, url: filing.document.url.replace('/123456/', '/999999/')}, issuerCik, filing.document.accession), /URL_MISMATCH/);
  const missingZone = input([makeFiling({accepted: '2025-03-03T21:30:00'})]);
  assert.equal(acceptanceIndex(missingZone.submissions).values().next().value.acceptedAt, null);
  assert.equal(certifyAnnualFacts(missingZone).fundamentals[0].certification.apiClockConflict, true);
  const invalidDay = input([makeFiling({accepted: '2025-02-30T21:30:00Z'})]);
  assert.equal(acceptanceIndex(invalidDay.submissions).values().next().value.acceptedAt, null);
  const data = input([filing]);
  const other = structuredClone(data.submissions);other.filings.recent.acceptanceDateTime[0] = '2025-03-03T22:00:00Z';
  assert.throws(() => acceptanceIndex(data.submissions, [other]), /CONFLICTING_ACCESSION/);
  const record = acceptanceIndex(data.submissions).get(filing.document.accession);
  const ambiguous = {...filing.document.filingHeader, text: filing.document.filingHeader.text.replace('20250303163000', '20251102013000')};
  ambiguous.sha256 = digest(ambiguous.text);
  assert.throws(() => certifyOriginalAcceptance(ambiguous, record), /LOCAL_CLOCK_NOT_CERTIFIED/);
});

test('comparative companyfacts filing FY never relabels original annual-period lineage or restatements', () => {
  const prior = makeFiling({year: 2023, start: '2023-01-01', end: '2023-12-31', accession: '0000123456-24-000001',
    accepted: '2024-03-04T17:00:00Z', localAcceptance: '20240304120000', filed: '2024-03-04', revenue: 80});
  const comparative = `<xbrli:context id="prior"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">123456</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:startDate>2023-01-01</xbrli:startDate><xbrli:endDate>2023-12-31</xbrli:endDate></xbrli:period></xbrli:context><gaap:Revenues contextRef="prior" unitRef="usd">75</gaap:Revenues>`;
  const current = makeFiling({comparative});
  const companyfacts = {cik: 123456, facts: {'us-gaap': {Revenues: {units: {USD: [
    {accn: prior.document.accession, start: '2023-01-01', end: '2023-12-31', val: 80, filed: '2024-03-04', fy: 2099, fp: 'FY'},
    {accn: current.document.accession, start: '2023-01-01', end: '2023-12-31', val: 75, filed: '2025-03-03', fy: 2099, fp: 'FY'},
    {accn: current.document.accession, start: '2024-01-01', end: '2024-12-31', val: 100, filed: '2025-03-03', fy: 2099, fp: 'FY'},
  ]}}}}};
  const result = certifyAnnualFacts(input([prior, current], {companyfacts}));
  const priorVersions = result.fundamentals.filter(f => f.key === 'revenue' && f.periodEnd === '2023-12-31');
  assert.deepEqual(priorVersions.map(f => f.fiscalYear), [2023, 2023]);
  assert.deepEqual(priorVersions.map(f => f.value), [80, 75]);
  assert.equal(selectPITFact({fundamentals: priorVersions}, 'revenue', '2024-06-30T21:00:00Z').value, 80);
  assert.equal(selectPITFact({fundamentals: priorVersions}, 'revenue', '2025-03-04T21:00:00Z').value, 75);
  companyfacts.facts['us-gaap'].Revenues.units.USD[1].val = 999;
  assert.equal(certifyAnnualFacts(input([prior, current], {companyfacts})).fundamentals.some(f => f.key === 'revenue' && f.value === 75), false);
});

test('reviewed total-debt components require explicit finance-lease coverage, never missing-as-zero', () => {
  const components = `<gaap:DebtCurrent contextRef="instant" unitRef="usd">10</gaap:DebtCurrent><gaap:LongTermDebtNoncurrent contextRef="instant" unitRef="usd">30</gaap:LongTermDebtNoncurrent>`;
  const derivationApprovals = [approval('TOTAL_DEBT_CURRENT_PLUS_NONCURRENT_WITH_EXPLICIT_FINANCE_LEASE_COVERAGE',
    {debtDefinition: 'DEBT_EXCLUDING_OPERATING_LEASES_INCLUDING_FINANCE_LEASES'})];
  assert.equal(certifyAnnualFacts(input([makeFiling({extra: components})], {derivationApprovals})).fundamentals.some(f => f.key === 'totalDebt'), false);
  const filing = makeFiling({extra: components + '<gaap:FinanceLeaseLiabilityNoncurrent contextRef="instant" unitRef="usd">2</gaap:FinanceLeaseLiabilityNoncurrent>'});
  const debt = certifyAnnualFacts(input([filing], {derivationApprovals})).fundamentals.find(f => f.key === 'totalDebt');
  assert.equal(debt.value, 42); assert.equal(debt.certification.operands.length, 3);
  assert.equal(debt.certification.mapping, 'DERIVED_NONOVERLAPPING_DEBT_COMPONENTS');
  assert.equal(certifyAnnualFacts(input([filing])).fundamentals.some(f => f.key === 'totalDebt'), false);
});

test('a later original claiming the same FY at another end cannot suppress previously known lineage', () => {
  const prior = makeFiling({year: 2023, start: '2023-01-01', end: '2023-12-31', accession: '0000123456-24-000001',
    accepted: '2024-03-04T17:00:00Z', localAcceptance: '20240304120000', filed: '2024-03-04'});
  const future = makeFiling({year: 2024, end: '2024-12-30', accession: '0000123456-25-000003',
    accepted: '2025-04-07T20:00:00Z', localAcceptance: '20250407160000', filed: '2025-04-07'});
  const result = certifyAnnualFacts(input([prior, makeFiling(), future]));
  const security = {id: securityId, issuerCik, fiscalPeriodLinks: result.fiscalPeriodLinks};
  assert.equal(resolvePreviousFiscalPeriod(security, '2024-12-31', {formationCutoffUTC: '2025-03-04T21:00:00Z'}).periodEnd, '2023-12-31');
  assert.equal(resolvePreviousFiscalPeriod(security, '2024-12-31', {formationCutoffUTC: '2025-04-07T21:00:00Z'}).status, 'BLOCKED');
});

test('unit QName resolution uses its element scope and cannot be changed by a later namespace rebinding', () => {
  const fake = makeFiling();
  fake.document.text = fake.document.text.replace('xmlns:iso4217="http://www.xbrl.org/2003/iso4217"', 'xmlns:iso4217="https://fake.example/currency"')
    .replace('</xbrli:xbrl>', '<note xmlns:iso4217="http://www.xbrl.org/2003/iso4217"/></xbrli:xbrl>');
  fake.document.sha256 = digest(fake.document.text);
  assert.equal(certifyAnnualFacts(input([fake])).fundamentals.length, 0);
  const valid = makeFiling();
  valid.document.text = valid.document.text.replace('</xbrli:xbrl>', '<note xmlns:iso4217="https://fake.example/currency"/></xbrli:xbrl>');
  valid.document.sha256 = digest(valid.document.text);
  assert.ok(certifyAnnualFacts(input([valid])).fundamentals.some(f => f.key === 'revenue'));
});

test('published contradictory annual facts block the key instead of hiding conflict behind an older value', () => {
  const amendment = makeFiling({form: '10-K/A', accession: '0000123456-25-000002',
    accepted: '2025-04-07T20:00:00Z', localAcceptance: '20250407160000', filed: '2025-04-07',
    extra: '<gaap:Revenues contextRef="annual" unitRef="usd">999</gaap:Revenues>'});
  const result = certifyAnnualFacts(input([makeFiling(), amendment]));
  assert.ok(result.factConflicts.some(c => c.key === 'revenue'));
  assert.ok(selectAnnualFactsAtFormation(result, {sessionDate: '2025-03-04', formationCutoffUTC: '2025-03-04T21:00:00Z'}).some(f => f.key === 'revenue'));
  assert.equal(selectAnnualFactsAtFormation(result, {sessionDate: '2025-04-07', formationCutoffUTC: '2025-04-07T21:00:00Z'}).some(f => f.key === 'revenue'), false);
});

test('duplicate or empty XML IDs and missing declared references never resolve through an overwritten or None key', () => {
  for (const change of [text => text.replace('<xbrli:unit id="usd">', '<xbrli:unit>'),
    text => text.replace('id="annual"', 'id=""'),
    text => text.replace('</xbrli:xbrl>', '<xbrli:unit id="usd"><xbrli:measure>iso4217:EUR</xbrli:measure></xbrli:unit></xbrli:xbrl>'),
    text => text.replace('</xbrli:xbrl>', '<xbrli:context id="annual"><xbrli:entity/><xbrli:period/></xbrli:context></xbrli:xbrl>')]) {
    const filing = makeFiling();filing.document.text = change(filing.document.text);filing.document.sha256 = digest(filing.document.text);
    assert.equal(certifyAnnualFacts(input([filing])).fundamentals.length, 0);
  }
  for (const reference of ['contextRef="annual"', 'unitRef="usd"']) {
    const filing = makeFiling();
    filing.document.text = filing.document.text.replace(`<gaap:Revenues ${reference}`, '<gaap:Revenues');
    if (reference === 'unitRef="usd"') filing.document.text = filing.document.text.replace('<gaap:Revenues contextRef="annual" unitRef="usd"', '<gaap:Revenues contextRef="annual"');
    filing.document.sha256 = digest(filing.document.text);
    assert.equal(certifyAnnualFacts(input([filing])).fundamentals.some(r => r.key === 'revenue'), false);
  }
});
