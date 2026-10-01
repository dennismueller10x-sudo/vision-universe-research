import test from 'node:test';
import assert from 'node:assert/strict';
import { parseForm25XML, summarizeUSSECEvidence } from '../../scripts/market/summarize-marketstack-us-sec-evidence.mjs';
const xml = cls => '<notificationOfRemoval><exchange><cik>1354457</cik><entityName>Nasdaq</entityName></exchange>' +
  '<issuer><cik>123</cik><entityName>Company</entityName></issuer><descriptionClassSecurity>' + cls + '</descriptionClassSecurity>' +
  '<ruleProvision>Rule</ruleProvision><signatureData><signatureDate>2026-09-01</signatureDate></signatureData></notificationOfRemoval>';
const row = (symbol, type = 'EQUITY_COMMON') => ({ securityId: symbol, ticker: symbol, expectedMics: ['XNAS'], baselineInstrumentType: type, identifiers: { cik: '0000000123' } });
const current = data => ({ status: 'OK', generatedAt: '2026-10-01', byTicker: data });
const form = cls => ({ rows: [{ status: 'FETCHED', cik: '0000000123', baselineSymbols: ['OLD', 'WAR'], form: '25-NSE', filingDate: '2026-09-01',
  accessionNumber: 'official', source: 'https://www.sec.gov/Archives/official.xml', parsed: parseForm25XML(xml(cls)) }] });

test('Form25 parser separates exchange and issuer CIK and rejects HTML, entities and duplicate identity fields', () => {
  const r = parseForm25XML(xml('Common Stock')); assert.equal(r.issuerCik, '0000000123'); assert.equal(r.exchangeCik, '0001354457');
  assert.equal(r.descriptionClassSecurity, 'Common Stock');
  assert.equal(parseForm25XML('<html>Form25</html>'), null);
  assert.equal(parseForm25XML('<!DOCTYPE x>' + xml('Common Stock')), null);
  assert.equal(parseForm25XML(xml('Common Stock').replace('<cik>123</cik>', '<cik>123</cik><cik>456</cik>')), null);
});

test('removed SEC symbol and same-CIK new symbol cannot establish missing provider coverage or alias', () => {
  const r = summarizeUSSECEvidence({ byTicker: { OLD: { cik: '123', exchange: 'Nasdaq' } } }, current({ NEW: { cik: '123', exchange: 'Nasdaq' } }), [row('OLD')], {}, {}, { asOfDate: '2026-10-01' });
  assert.equal(r.rows[0].currentSECStatus, 'CURRENT_SEC_SYMBOL_REMOVED_ISSUER_OTHER_SYMBOLS_REVIEW');
  assert.equal(r.rows[0].identityAliasAccepted, false); assert.equal(r.rows[0].genuinelyProviderMissing, false);
});

test('warrant delisting never applies to ordinary shares of the same issuer', () => {
  const r = summarizeUSSECEvidence({}, current({}), [row('OLD'), row('WAR', 'WARRANT')], {}, form('Warrant expires 9/2/2026'), { asOfDate: '2026-10-01' });
  assert.equal(r.rows.find(r => r.ticker === 'OLD').officialSecurityClassDelistingFiled, false);
  assert.equal(r.rows.find(r => r.ticker === 'WAR').officialSecurityClassDelistingFiled, true);
  assert.equal(r.totals.providerUnavailableProven, 0);
});

test('multiple share classes, future filings and mixed-class notifications fail closed', () => {
  const r = summarizeUSSECEvidence({}, current({}), [row('OLD'), row('OTHER')], {}, form('Common Stock'), { asOfDate: '2026-10-01' });
  assert.equal(r.rows[0].officialSecurityClassDelistingFiled, false);
  const protectedSibling = summarizeUSSECEvidence({}, current({}), [row('OLD')], {}, form('Common Stock'),
    { asOfDate: '2026-10-01', allBaselineRows: [row('OLD'), row('UNFLAGGED_SECOND_CLASS')] });
  assert.equal(protectedSibling.rows[0].officialSecurityClassDelistingFiled, false);
  const mixed = summarizeUSSECEvidence({}, current({}), [row('OLD')], {}, form('Ordinary Shares, Warrants'), { asOfDate: '2026-10-01' });
  assert.equal(mixed.rows[0].officialSecurityClassDelistingFiled, false);
  const future = form('Common Stock'); future.rows[0].filingDate = '2026-10-02';
  assert.equal(summarizeUSSECEvidence({}, current({}), [row('OLD')], {}, future, { asOfDate: '2026-10-01' }).rows[0].officialForm25.length, 0);
});

test('same-issuer class removal at another venue is retained but cannot mark baseline listing removed', () => {
  const old = { ...row('OLD'), expectedMics: ['XNYS'] };
  const r = summarizeUSSECEvidence({}, current({}), [old], {}, form('Common Stock'), { asOfDate: '2026-10-01' });
  assert.equal(r.rows[0].officialSecurityClassDelistingFiled, true);
  assert.equal(r.rows[0].officialBaselineListingRemovalFiled, false);
  assert.equal(r.rows[0].officialForm25[0].exchangeMic, 'XNAS');
});
