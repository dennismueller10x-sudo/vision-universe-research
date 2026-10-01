import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCoverIdentityHTML, crosscheckClassRemovals } from '../../scripts/market/summarize-marketstack-us-class-removals.mjs';
const fact = (name, context, value) => '<ix:nonNumeric name="dei:' + name + '" contextRef="' + context + '">' + value + '</ix:nonNumeric>';
const cover = (groups, cik='123') => parseCoverIdentityHTML(fact('EntityCentralIndexKey','issuer',cik) + groups.flatMap(([symbol,title,exchange,context]) => [
  fact('TradingSymbol',context,symbol),fact('Security12bTitle',context,title),fact('SecurityExchangeName',context,exchange)]).join(''));
const quality = (symbol,type='EQUITY_COMMON') => ({ protectedBaselineSource: { sha256:'base' }, generatedAt:'fixed',asOfDate:'2026-10-01',rows:[{
  securityId:'ref_'+symbol,ticker:symbol,providerSymbol:symbol,baselineInstrumentType:type,expectedMics:['XNYS'],identifiers:{},activeStatus:{},latestQuality:{originalStatus:'STALE_LATEST_ACTIVE'} }] });
const inputs = (parsed,description) => [{ publicRequests:1,rows:[{cik:'0000000123',terminationOrDelistingFilings:[{form:'25-NSE',filingDate:'2026-08-25',
  parsed:{issuerCik:'0000000123',exchangeName:'NEW YORK STOCK EXCHANGE LLC',descriptionClassSecurity:description}}]}]},
  {publicRequests:1,rows:[{issuerCik:'0000000123',filingDate:'2026-07-29',parsed}]}];
test('coverpage joins trading symbol, exact security class and exchange only within same iXBRL context',()=>{
  const parsed=cover([['TWO','Common Stock','New York Stock Exchange','common'],['TWO PRA','8.125% Series A Preferred Stock','New York Stock Exchange','preferred']]);
  assert.equal(parsed.issuerCik,'0000000123');assert.equal(parsed.groups.length,2);
  const out=crosscheckClassRemovals(quality('TWO'),...inputs(parsed,'8.125% Series A Preferred Stock'));
  assert.equal(out.totals.additionalStaleExplanations,0);assert.equal(out.rows[0].rejectedCandidateReasons[0],'FORM25_OTHER_SECURITY_CLASS_NOT_TARGET');
});
test('matching official common-class removal notification explains staleness without global delisting or safety promotion',()=>{
  const parsed=cover([['TWO','Common Stock','New York Stock Exchange','common']]);
  const out=crosscheckClassRemovals(quality('TWO'),...inputs(parsed,'Common Stock'));
  assert.equal(out.totals.additionalStaleExplanations,1);assert.equal(out.totals.safetyPromotions,0);
  assert.equal(out.rows[0].evidence[0].worldwideDelistingProven,false);assert.equal(out.rows[0].evidence[0].effectiveLastTradeDateKnown,false);
});
test('common-class letters prevent a class C filing from explaining class A stale quote',()=>{
  const parsed=cover([['A','Series A common stock','New York Stock Exchange','a'],['C','Series C common stock','New York Stock Exchange','c']]);
  assert.equal(crosscheckClassRemovals(quality('A'),...inputs(parsed,'Class C Common Stock')).totals.additionalStaleExplanations,0);
  assert.equal(crosscheckClassRemovals(quality('A'),...inputs(parsed,'Class A Common Stock, Class C Common Stock')).totals.additionalStaleExplanations,1);
});
test('warrant or unit titles do not misclassify their underlying common stock text',()=>{
  const warrant=cover([['W','Warrants to purchase one share of common stock','New York Stock Exchange','w']]);
  assert.equal(crosscheckClassRemovals(quality('W','WARRANT'),...inputs(warrant,'Warrant')).totals.additionalStaleExplanations,1);
  const unit=cover([['U','Units each consisting of one Class A ordinary share and one-half warrant','New York Stock Exchange','u']]);
  assert.equal(crosscheckClassRemovals(quality('U','UNIT'),...inputs(unit,'Class A Ordinary Shares, Warrants, Units')).totals.additionalStaleExplanations,1);
});
test('preferred notation retains issuer root and full series; an A filing cannot cover B',()=>{
  const parsed=cover([['MDV.PA','7.375% Series A Preferred Stock','New York Stock Exchange','a'],['MDV.PB','Series B Preferred Stock','New York Stock Exchange','b']]);
  assert.equal(crosscheckClassRemovals(quality('MDV-P-A','PREFERRED'),...inputs(parsed,'7.375% Series A Preferred Stock')).totals.additionalStaleExplanations,1);
  assert.equal(crosscheckClassRemovals(quality('MDV-P-B','PREFERRED'),...inputs(parsed,'7.375% Series A Preferred Stock')).totals.additionalStaleExplanations,0);
});
test('mismatched issuer, exchange or future filing cannot be used to excuse historical stale quote',()=>{
  const parsed=cover([['TWO','Common Stock','New York Stock Exchange','common']]);
  const q=quality('TWO'),args=inputs(parsed,'Common Stock');q.rows[0].identifiers.cik='0000000999';
  assert.equal(crosscheckClassRemovals(q,...args).totals.additionalStaleExplanations,0);
  delete q.rows[0].identifiers.cik;args[0].rows[0].terminationOrDelistingFilings[0].parsed.exchangeName='Nasdaq';
  assert.equal(crosscheckClassRemovals(q,...args).totals.additionalStaleExplanations,0);
  args[0].rows[0].terminationOrDelistingFilings[0].parsed.exchangeName='NEW YORK STOCK EXCHANGE LLC';args[0].rows[0].terminationOrDelistingFilings[0].filingDate='2026-10-02';
  assert.equal(crosscheckClassRemovals(q,...args).totals.additionalStaleExplanations,0);
});
test('425 is never treated as Form25 and duplicate/conflicting context identity is rejected',()=>{
  const parsed=cover([['TWO','Common Stock','New York Stock Exchange','common']]),args=inputs(parsed,'Common Stock');
  args[0].rows[0].terminationOrDelistingFilings[0].form='425';
  assert.equal(crosscheckClassRemovals(quality('TWO'),...args).totals.additionalStaleExplanations,0);
  const malformed=parseCoverIdentityHTML(fact('EntityCentralIndexKey','issuer','123')+fact('TradingSymbol','g','TWO')+fact('TradingSymbol','g','OTHER')+fact('Security12bTitle','g','Common Stock')+fact('SecurityExchangeName','g','New York Stock Exchange'));
  assert.equal(crosscheckClassRemovals(quality('TWO'),...inputs(malformed,'Common Stock')).totals.additionalStaleExplanations,0);
});

test('explicit old/new ticker declaration is required; two issuer sibling symbols alone do not establish a rename', async()=>{
  const {parseExplicitTickerRenameHTML}=await import('../../scripts/market/summarize-marketstack-us-class-removals.mjs');
  const document=fact('EntityCentralIndexKey','issuer','1711012')+fact('TradingSymbol','common','AIHS')+fact('Security12bTitle','common','Common Stock')+fact('SecurityExchangeName','common','Nasdaq')+
    'new trading symbol “VAI,” replacing its current trading symbol “AIHS,” subject to final processing and confirmation by Nasdaq. The CUSIP will not change and will remain as 817225303.';
  const result=parseExplicitTickerRenameHTML(document,'AIHS','VAI');assert.equal(result.issuerCik,'0001711012');assert.equal(result.announcedCUSIP,'817225303');
  assert.equal(result.conditionalOnExchangeConfirmation,true);assert.equal(result.automaticProviderAliasApproval,false);
  assert.equal(parseExplicitTickerRenameHTML('Our issuer tickers include AIHS and VAI.','AIHS','VAI'),null);
});
