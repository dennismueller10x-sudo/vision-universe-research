import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {buildETFAudit,buildMetadataMatrix,buildETFIdentityCoverage,issuerFamilyHint,summarizeHoldings,normalizeSIXETFReference,normalizeEuronextETFReference,compactETFAudit,summarizeETFFollowUp,normalizeUSNasdaqETFReference} from '../../scripts/market/audit-marketstack-etfs.mjs';
const require=createRequire(import.meta.url);
const fixture=require('./fixtures/marketstack-voo-holdings.json');
const identity={key:'VOO@ARCX',symbol:'VOO',mic:'ARCX',assetType:'ETF',tradingCurrency:'USD',isin:'US9229083632'};
const classified={candidates:[{providerSymbol:'VOO',mic:'ARCX',assetType:'ETF',providerName:'Vanguard S&P 500 ETF',isin:identity.isin,tradingCurrency:'USD',listingCountry:'US',officialStatus:'ACTIVE',referenceSourceId:'TEST_OFFICIAL',officialInstrumentType:'ETF'}]};
const plan={representatives:[],newHoldingsSymbols:[]};
const bar=(changes={})=>({symbol:'VOO',exchange:'ARCX',asset_type:'ETF',price_currency:'USD',date:'2026-09-30T00:00:00+0000',open:10,high:11,low:9,close:10.5,volume:100,...changes});
const entry=(endpoint,data,params={})=>({endpoint,ok:true,data,params,checkedAt:'2026-10-01T00:00:00Z',retrievedAt:'2026-10-01T00:00:00Z',sourceRunId:'test-run',sourceRunAttribution:'EXPLICIT_TEST_RESPONSE'});
const probe=entries=>({run:{runId:'test-run'},endpoints:entries});
const audit=(entries=[],options={})=>buildETFAudit({classification:classified,plan,probes:[probe(entries)],...options});

test('issuer families remain anchored name hints, with no index-provider confusion',()=>{
  assert.equal(issuerFamilyHint('VanEck J.P. Morgan EM Local Currency Bond UCITS ETF'),'VanEck');
  assert.equal(issuerFamilyHint('JPM Global Equity Multi-Factor UCITS ETF'),'JPMorgan');
  assert.equal(issuerFamilyHint('Fund tracking iShares World Index'),null);
  const report=audit();const listing=report.listings[0];
  assert.equal(listing.issuerFamilyHint,'Vanguard');assert.equal(listing.issuerLegalEntity,null);
  assert.equal(listing.fundDomicile,null);assert.equal(listing.UCITSRegulatoryStatus,null);
});

test('real holdings sample retains fund-series scope, signed derivative/collateral lines and uncertain PIT',()=>{
  const result=summarizeHoldings(fixture.payload,identity,{asOf:'2026-10-01',retrievedAt:fixture.retrievedAt});
  assert.equal(result.state,'AVAILABLE_PARTIAL');assert.equal(result.portfolioScope,'REPORTED_FUND_SERIES');
  assert.equal(result.fullHoldingsVerified,false);assert.equal(result.completeness,'UNKNOWN');
  assert.equal(result.publicAvailableAt,null);assert.equal(result.ETFShareClassAUM,null);
  assert.equal(result.staleForCurrentPortfolio,true);assert.equal(result.holdingsLines,5);
  assert.ok(result.negativeWeightLines>0);assert.ok(result.derivativeLines>0);assert.ok(result.cashOrCollateralLines>0);
  assert.equal(result.derivedAUMForbidden,true);
});

test('equal ISIN legs remain distinct and exact duplicates are visible rather than discarded',()=>{
  const payload=structuredClone(fixture.payload),base=structuredClone(payload.output.holdings[0]);
  const derivative=structuredClone(base);derivative.investment_security.asset_category='DE';
  derivative.investment_security.cash_collateral='Y';derivative.investment_security.percent_value='-0.1';
  payload.output.holdings=[base,derivative,structuredClone(base)];
  const result=summarizeHoldings(payload,identity,{asOf:'2026-10-01'});
  assert.equal(result.holdingsLines,3);assert.equal(result.duplicateExactPositionLines,1);
  assert.equal(result.duplicateISINLines,2);assert.equal(result.negativeWeightLines,1);
});

test('holdings missing/invalid weights and total anomalies stay visible',()=>{
  const payload=structuredClone(fixture.payload);payload.output.holdings[0].investment_security.percent_value='unavailable';
  payload.output.holdings.push({invalid:true});
  const result=summarizeHoldings(payload,identity,{asOf:'2026-10-01'});
  assert.ok(result.missingWeights>=1);assert.equal(result.validLines,5);
  assert.ok(result.anomalies.some(a=>a.code==='INVALID_HOLDING'));
  assert.ok(result.anomalies.some(a=>a.code==='HOLDINGS_TOTAL_REQUIRES_REVIEW'));
});

test('position-key collisions are distinct from exact reported line duplicates',()=>{
  const payload=structuredClone(fixture.payload),base=structuredClone(payload.output.holdings[0]),different=structuredClone(base);
  different.investment_security.percent_value='0.01';payload.output.holdings=[base,different];
  const result=summarizeHoldings(payload,identity,{asOf:'2026-10-01'});
  assert.equal(result.duplicateExactPositionLines,0);assert.equal(result.positionKeyCollisionLines,1);
  assert.equal(result.returnedSeriesISINMatchesExpected,true);assert.equal(result.expectedISIN,identity.isin);
});

test('complete requested history windows require contiguous distinct delivered candles',()=>{
  const page=(offset,rows,total=2)=>({...entry('eod',{pagination:{offset,total},data:rows},{symbols:'VOO',exchange:'ARCX',date_from:'2026-09-29',date_to:'2026-09-30',offset}),label:'etf-audit-history'});
  const first=bar({date:'2026-09-29T00:00:00+0000'}),last=bar();
  const summary=summarizeETFFollowUp([page(0,[first]),page(1,[last])]);
  assert.equal(summary.newHistoryWindowsDelivered,1);assert.equal(summary.newHistoryRawRows,2);
  assert.equal(summary.historyWindows[0].fullInceptionHistoryVerified,false);
  assert.equal(summarizeETFFollowUp([page(0,[first]),page(1,[first])]).newHistoryWindowsDelivered,0);
  assert.equal(summarizeETFFollowUp([page(0,[first]),page(2,[last])]).newHistoryWindowsDelivered,0);
  assert.equal(summarizeETFFollowUp([page(0,[first]),page(1,[last],3)]).newHistoryWindowsDelivered,0);
  assert.equal(summarizeETFFollowUp([{...page(0,[first]),seeded:true}]).newHistoryWindows,0);
});

test('future holdings as-of is quarantined while a future fiscal year end cannot advance freshness',()=>{
  const future=structuredClone(fixture.payload);future.output.attributes.date_report_period='2027-12-31';
  const report=audit([entry('etfholdings',future,{ticker:'VOO'})]);assert.equal(report.holdingsTests[0].state,'QUARANTINED');
  assert.equal(report.holdingsTests[0].reason,'REPORT_DATE_AFTER_AUDIT_DATE');assert.equal(report.counts.holdingsSamplesAvailable,0);
  assert.equal(report.listings[0].coverage.holdings,'QUARANTINED');assert.equal(report.holdingsTests[0].publicAvailableAt,null);
  const fiscal=structuredClone(fixture.payload);fiscal.output.attributes.end_report_period='2027-02-28';
  const fiscalResult=summarizeHoldings(fiscal,identity,{asOf:'2026-10-01'});
  assert.equal(fiscalResult.state,'AVAILABLE_PARTIAL');assert.equal(fiscalResult.actualAsOf,'2024-12-31');
  assert.equal(fiscalResult.fundFiscalYearEnd,'2027-02-28');assert.equal(fiscalResult.staleForCurrentPortfolio,true);
  assert.throws(()=>audit([],{asOf:'2026-02-31'}),/Calendar-valid audit date/);
});

test('provider ETF directory membership and unrelated false ETF labels cannot admit equities',()=>{
  const report=audit([entry('etflist',{pagination:{total:52421},data:[{ticker:'000001.SZ'}]}),
    entry('eod',{data:[bar({symbol:'MSFT',exchange:'XNAS'})]})]);
  assert.equal(report.listings.length,1);assert.equal(report.unexpectedETFLabels[0].symbol,'MSFT');
  assert.equal(report.etflistContamination[0].membershipUsedForClassification,false);
  assert.equal(report.etflistContamination[0].knownEquityContaminationProven,true);
});

test('official ETC control cannot become ETF through provider labels or holdings',()=>{
  const report=audit([entry('tickers/4GLD.DE',{symbol:'4GLD.DE',name:'Xetra-Gold',isin:'DE000A0S9GB0',item_type:'ETF',stock_exchange:{mic:'XETR'}})],
    {plan:{...plan,representatives:[{symbol:'4GLD.DE',mic:'XETR',name:'Xetra-Gold',classification:'ETC_OFFICIAL',isin:'DE000A0S9GB0',tradingCurrency:'EUR'}]}});
  const control=report.listings.find(x=>x.symbol==='4GLD.DE');assert.equal(control.assetType,'ETC');
  assert.equal(control.identityConflict,'PROVIDER_ETF_OFFICIAL_ETC_CONFLICT');assert.equal(control.coverage.history,'QUARANTINED');
});

test('metadata ISIN conflict blocks subsequent history and holdings',()=>{
  const report=audit([entry('tickers/VOO',{name:'Vanguard',symbol:'VOO',isin:'US0000000000',item_type:'ETF',stock_exchange:{mic:'ARCX'}}),
    entry('eod',{data:[bar()]}),entry('etfholdings',fixture.payload,{ticker:'VOO'})]);
  const listing=report.listings[0];assert.equal(listing.history.uniqueBars,0);
  assert.equal(listing.coverage.history,'QUARANTINED');assert.equal(listing.coverage.holdings,'QUARANTINED');
  assert.equal(report.holdingsTests[0].state,'QUARANTINED');assert.equal(report.counts.holdingsSamplesAvailable,0);
});

test('regional provider metadata cannot bind an unsuffixed US ETF to a local listing',()=>{
  const regional={...plan,representatives:[{symbol:'USFR.XLON',mic:'XLON',classification:'FUND_NAME_CANDIDATE',region:'GB',name:'WisdomTree USD Floating Rate Treasury Bond UCITS ETF'}]};
  const report=audit([entry('tickers/USFR.XLON',{symbol:'USFR',isin:'US97717Y5270',name:'WisdomTree Floating Rate Treasury Fund',item_type:'etf',stock_exchange:{mic:'XLON'}})],{plan:regional});
  const listing=report.listings.find(r=>r.symbol==='USFR.XLON');assert.equal(listing.identityConflict,'PROVIDER_SYMBOL_MISMATCH');
  assert.equal(listing.assetType,'UNKNOWN');assert.equal(listing.providerName,'WisdomTree USD Floating Rate Treasury Bond UCITS ETF');
  assert.equal(listing.coverage.history,'QUARANTINED');assert.equal(listing.coverage.holdings,'QUARANTINED');
});

test('contradictory same-date observations quarantine the series and preserve both evidence paths',()=>{
  const report=audit([entry('eod',{data:[bar()]}),entry('eod',{data:[bar({close:10.6})]})]);
  const listing=report.listings[0],conflict=listing.history.anomalies[0];
  assert.equal(listing.history.uniqueBars,1);assert.equal(listing.coverage.history,'QUARANTINED');
  assert.equal(conflict.reason,'CONTRADICTORY_SAME_DATE_OBSERVATIONS');
  assert.deepEqual(conflict.changedFields,['close']);assert.notEqual(conflict.previous.valueHash,conflict.current.valueHash);
  assert.equal(conflict.previous.close,undefined);assert.equal(conflict.current.close,undefined);
  assert.equal(conflict.previous.observation.sourceRun.runId,'test-run');assert.equal(conflict.observation.sourceRun.runId,'test-run');
});

test('expected official currency is retained and unexpected provider units quarantine history',()=>{
  const report=audit([entry('eod',{data:[bar({price_currency:'MXN'})]})]);
  assert.equal(report.listings[0].tradingCurrency,'USD');assert.equal(report.listings[0].history.uniqueBars,0);
  assert.equal(report.listings[0].history.anomalies[0].reason,'currencyMismatch');
  assert.equal(report.listings[0].coverage.history,'QUARANTINED');
});

test('dividends require returned symbol, venue, currency and requested date agreement',()=>{
  const rows=[{symbol:'MSFT',exchange:'ARCX',currency:'USD',date:'2026-09-15',dividend:1},
    {symbol:'VOO',date:'2026-09-15',dividend:1},{symbol:'VOO',exchange:'ARCX',currency:'EUR',date:'2026-09-15',dividend:1},
    {symbol:'VOO',exchange:'ARCX',currency:'USD',date:'2026-08-01',dividend:1}];
  const report=audit([entry('dividends',{data:rows},{symbols:'VOO',date_from:'2026-09-01',date_to:'2026-09-30'})]);
  assert.deepEqual(report.dividendObservedSymbols,[]);
  assert.deepEqual(report.dividendTests.map(x=>x.reason),['SYMBOL_MISMATCH','VENUE_NOT_PROVIDED','CURRENCY_MISMATCH','OUTSIDE_REQUESTED_DATE_RANGE']);
  const verified=audit([entry('dividends',{data:[{symbol:'VOO',exchange:'ARCX',currency:'usd',date:'2026-09-15',dividend:1}]},{symbols:'VOO'})]);
  assert.deepEqual(verified.dividendObservedSymbols,['VOO']);
});

test('official inventory is distinct from provider support and exact ambiguous joins pick no winner',()=>{
  const refs={sources:[{source_url:'https://example.test/official'}],masters:[{mic:'XETR',updatedAt:'2026-10-01',rows:[
    {mic:'XETR',mnemonic:'ABC',isin:'DE0000000001',name:'ETF one',assetType:'ETF',active:true,tradingCurrency:'EUR'},
    {mic:'XETR',mnemonic:'ABC',isin:'DE0000000002',name:'ETF two',assetType:'ETF',active:true,tradingCurrency:'EUR'}]}]};
  const directory=entry('exchanges/XETR/tickers',{pagination:{total:1,offset:0,count:1},data:{tickers:[{symbol:'ABC.DE',name:'ETF',stock_exchange:{mic:'XETR'}}]}},{offset:0});
  const report=audit([directory],{officialReferences:[refs]});
  assert.equal(report.officialInventories[0].activeETFs,2);assert.equal(report.officialInventories[0].providerCoverageProven,false);
  assert.equal(report.officialJoinEvidence[0].counts.byStatus.AMBIGUOUS_REFERENCE,1);
  assert.equal(report.listings.length,1);
});

test('metadata matrix never manufactures fees, AUM, domicile or regulatory status',()=>{
  const report=audit([entry('eod',{data:[bar()]})]),matrix=buildMetadataMatrix(report);
  for(const field of ['TER','AUM','FUND_DOMICILE','UCITS_STATUS','INCEPTION_DATE'])
    assert.equal(matrix.fields.find(x=>x.field===field).providerStatus,'NOT AVAILABLE');
  assert.equal(matrix.fields.find(x=>x.field==='UCITS_STATUS').regulatoryStatusVerified,false);
  assert.equal(matrix.fields.find(x=>x.field==='FUND_DOMICILE').ISINPrefixIsNotDomicile,true);
  assert.equal(report.counts.classifiedETFListings,1);assert.equal(report.counts.providerObservedETFListings,1);
  assert.equal(report.counts.fullyVerifiedCurrentHoldings,0);assert.equal(report.productionActivated,false);
});

test('official SIX metadata retains separate source fields and ManagementFee cannot turn into TER',()=>{
  const payload={colNames:['FundLongName','ValorSymbol','ISIN','TradingBaseCurrency','FundCurrency','ProductLineDesc','IssuerNameFull','IssuerLongNameDesc','LegalStructureCountryDesc','ManagementFee','ReplicationMethodDesc','FundUnderlyingDescription'],
    rowData:[['iShares $ Corp Bond UCITS ETF USD (Acc)','LQDA','IE00BYXYYJ35','CHF','USD','Exchange Traded Funds','iShares plc','iShares','Ireland',0.2,'Physical','Markit iBoxx USD Liquid Investment Grade Index']]};
  const source={source_system:'SIX_OFFICIAL_ETF_EXPLORER',url:'https://www.six-group.com/fqs/ref.json',sha256:'fixture'};
  const reference=normalizeSIXETFReference(payload,source);
  const directory=entry('exchanges/XSWX/tickers',{pagination:{total:1,offset:0,count:1},data:{tickers:[{symbol:'LQDA.XSWX',stock_exchange:{mic:'XSWX'}}]}},{offset:0});
  const report=audit([directory],{officialReferences:[reference]});
  const listed=report.listings.find(x=>x.symbol==='LQDA.XSWX');assert.equal(listed.tradingCurrency,'CHF');assert.equal(listed.assetType,'ETF');
  assert.equal(listed.officialFundMetadata.fundCurrency,'USD');assert.equal(listed.officialFundMetadata.managementFeeReported,0.2);
  assert.equal(listed.officialFundMetadata.managementFeeIsTER,false);assert.equal(listed.officialFundMetadata.UCITSRegulatoryStatus,null);
  assert.equal(listed.officialFundMetadata.source.source_system,'SIX_OFFICIAL_ETF_EXPLORER');
  const matrix=buildMetadataMatrix(report);assert.equal(matrix.fields.find(x=>x.field==='TER').externalStatus,'UNKNOWN');
  assert.equal(matrix.fields.find(x=>x.field==='FUND_CURRENCY').externalStatus,'PARTIAL');
  assert.equal(matrix.fields.find(x=>x.field==='FUND_CURRENCY').providerStatus,'NOT AVAILABLE');
});

test('official SIX records require actual provider discovery and duplicate trading lines remain ambiguous',()=>{
  const payload={colNames:['FundLongName','ValorSymbol','ISIN','TradingBaseCurrency','FundCurrency','ProductLineDesc'],rowData:[
    ['Fund','SAME','IE0000000001','CHF','USD','Exchange Traded Funds'],['Fund','SAME','IE0000000001','USD','USD','Exchange Traded Funds'],
    ['Structured','ETN','IE0000000002','USD','USD','Exchange Traded Product']]};
  const reference=normalizeSIXETFReference(payload,{});assert.equal(reference.rows.length,2);
  const reportWithoutDiscovery=audit([],{officialReferences:[reference]});assert.equal(reportWithoutDiscovery.listings.length,1);
  const directory=entry('exchanges/XSWX/tickers',{pagination:{total:1,offset:0,count:1},data:{tickers:[{symbol:'SAME.XSWX'}]}},{offset:0});
  const ambiguous=audit([directory],{officialReferences:[reference]});assert.equal(ambiguous.listings.length,1);
  assert.equal(ambiguous.supplementJoinAnomalies[0].reason,'AMBIGUOUS_OFFICIAL_SUPPLEMENT_IDENTITY');
});

test('SIX references resolve recovered .SW listings only through observed unambiguous namespaces',()=>{
  const payload={colNames:['FundLongName','ValorSymbol','ISIN','TradingBaseCurrency','FundCurrency','ProductLineDesc'],rowData:[['Fund','LIVE','IE0000000001','CHF','USD','Exchange Traded Funds']]};
  const reference=normalizeSIXETFReference(payload,{});
  assert.equal(reference.rows[0].symbol,undefined);
  const directory=rows=>entry('exchanges/XSWX/tickers',{pagination:{total:rows.length,offset:0,count:rows.length},data:{tickers:rows.map(symbol=>({symbol}))}},{offset:0});
  const report=audit([directory(['LIVE.SW'])],{officialReferences:[reference]});
  assert.equal(report.listings.find(r=>r.symbol==='LIVE.SW').assetType,'ETF');
  assert.equal(report.listings.some(r=>r.symbol==='LIVE.XSWX'),false);
  const ambiguous=audit([directory(['LIVE.SW','LIVE.XSWX'])],{officialReferences:[reference]});
  assert.equal(ambiguous.listings.some(r=>r.symbol==='LIVE.SW'||r.symbol==='LIVE.XSWX'),false);
  assert.equal(ambiguous.supplementJoinAnomalies[0].reason,'AMBIGUOUS_PROVIDER_SYMBOL_NAMESPACE');
});

test('official US ETF roles require exact current symbols and MICs; ETNs/tests/unknown venues stay separate',()=>{
  const reference=normalizeUSNasdaqETFReference({retrievedAt:'2026-10-01T00:00:00Z',sources:['nasdaqlisted.txt','otherlisted.txt'].map(file=>({url:'https://www.nasdaqtrader.com/dynamic/SymDir/'+file,status:'FETCHED',footer:'File Creation Time: 1001202611:01'})),rows:[
    {_source:'nasdaqlisted.txt',Symbol:'EXACT','Security Name':'Verified Equity ETF',ETF:'Y','Test Issue':'N'},
    {_source:'otherlisted.txt','ACT Symbol':'NOTE','Security Name':'Leveraged ETN',ETF:'Y','Test Issue':'N',Exchange:'P'},
    {_source:'nasdaqlisted.txt',Symbol:'TEST','Security Name':'Test ETF',ETF:'Y','Test Issue':'Y'},
    {_source:'otherlisted.txt','ACT Symbol':'UNKNOWN','Security Name':'Unknown Venue ETF',ETF:'Y','Test Issue':'N',Exchange:'F'},
    {_source:'nasdaqlisted.txt',Symbol:'WRONG','Security Name':'Verified Fund ETF',ETF:'Y','Test Issue':'N'}]});
  assert.equal(reference.officialInventory.ETFflagY,5);assert.equal(reference.officialInventory.ETFRoleRows,3);
  assert.equal(reference.officialInventory.ETNFlaggedRowsExcluded,1);assert.equal(reference.officialInventory.testSymbolsExcluded,1);
  assert.equal(reference.officialInventory.ETFRoleUnknownMICRows,1);assert.equal(reference.officialInventory.complete,true);
  const dir=(mic,symbols)=>entry(`exchanges/${mic}/tickers`,{pagination:{total:symbols.length,offset:0,count:symbols.length},data:{tickers:symbols.map(symbol=>({symbol}))}},{offset:0});
  const report=audit([dir('XNAS',['EXACT']),dir('ARCX',['WRONG'])],{officialReferences:[reference]});
  const exact=report.listings.find(r=>r.symbol==='EXACT');assert.equal(exact.assetType,'ETF');assert.equal(exact.isin,null);assert.equal(exact.tradingCurrency,null);
  assert.equal(report.listings.some(r=>r.symbol==='WRONG'),false);assert.equal(report.USListingCensus.exactSymbolAndMICMatches,1);
  assert.equal(report.USListingCensus.byMIC.XNAS,1);assert.equal(report.USListingCensus.candidateListingPresenceIsNotPriceHistoryOrHoldingsVerification,true);
  const bad=audit([dir('XNAS',['EXACT']),entry('tickers/EXACT',{symbol:'EXACT',name:'Company Common Stock',item_type:'equity',stock_exchange:{mic:'XNAS'}})],{officialReferences:[reference]});
  assert.equal(bad.listings.find(r=>r.symbol==='EXACT').identityConflict,'PROVIDER_TYPE_OFFICIAL_ETF_CONFLICT');assert.equal(bad.USListingCensus.identityAdmissibleCandidates,0);
  const wrongMic=audit([dir('XNAS',['EXACT']),entry('tickers/EXACT',{symbol:'EXACT',item_type:'etf',stock_exchange:{mic:'ARCX'}})],{officialReferences:[reference]});
  assert.equal(wrongMic.listings.find(r=>r.symbol==='EXACT').identityConflict,'PROVIDER_METADATA_VENUE_MISMATCH');
  const priceConflict=audit([dir('XNAS',['EXACT']),entry('eod',{data:[bar({symbol:'EXACT',exchange:'XNAS',asset_type:'equity'})]})],{officialReferences:[reference]});
  assert.equal(priceConflict.listings.find(r=>r.symbol==='EXACT').identityConflict,'PROVIDER_PRICE_TYPE_OFFICIAL_ETF_CONFLICT');
  assert.equal(priceConflict.listings.find(r=>r.symbol==='EXACT').history.coverage,'QUARANTINED');
  assert.equal(priceConflict.listings.find(r=>r.symbol==='EXACT').history.uniqueBars,0);
});

test('checkpoint-seeded cached observations do not count as new independent holdings tests',()=>{
  const original=entry('etfholdings',fixture.payload,{ticker:'VOO'});
  const report=buildETFAudit({classification:classified,plan,probes:[probe([original]),{run:{runId:'resumed'},endpoints:[{...original,seeded:true}]}]});
  assert.equal(report.holdingsTests.length,1);assert.equal(report.counts.holdingsSamplesAvailable,1);
  assert.equal(report.reusedObservationsDeduplicated,1);assert.equal(report.holdingsTests[0].sourceRun.runId,'test-run');
});

test('unflagged copied checkpoint observations also preserve one independent sample',()=>{
  const original=probe([entry('etfholdings',fixture.payload,{ticker:'VOO'})]),copy=structuredClone(original);copy.run.runId='copied-checkpoint';
  const report=buildETFAudit({classification:classified,plan,probes:[original,copy]});
  assert.equal(report.holdingsTests.length,1);assert.equal(report.reusedObservationsDeduplicated,1);
  assert.equal(report.providerDecision.status,'DEFERRED');assert.equal(report.providerDecision.selectedOption,null);
});

test('response origin survives snapshot replay and unknown seeded origin is never the latest run',()=>{
  const old=entry('etfholdings',fixture.payload,{ticker:'VOO'});old.sourceRunId='original-paid-run';old.sourceRunAttribution='CHECKPOINT_INTERVAL_ATTRIBUTION';
  const report=buildETFAudit({classification:classified,plan,probes:[{run:{snapshotRunId:'latest-container'},endpoints:[old]}]});
  assert.equal(report.holdingsTests[0].sourceRunId,'original-paid-run');assert.equal(report.holdingsTests[0].sourceRun.attribution,'CHECKPOINT_INTERVAL_ATTRIBUTION');
  assert.deepEqual(report.sourceRuns.map(r=>r.runId),['original-paid-run']);assert.equal(report.snapshotRuns[0].snapshotRunId,'latest-container');
  const unknown={...old,seeded:true};delete unknown.sourceRunId;delete unknown.sourceRunAttribution;
  const unresolved=buildETFAudit({classification:classified,plan,probes:[{run:{runId:'latest-container'},endpoints:[unknown]}]});
  assert.equal(unresolved.holdingsTests[0].sourceRunId,null);assert.equal(unresolved.holdingsTests[0].sourceRun,null);
  assert.equal(unresolved.holdingsTests[0].sourceRunAttribution,'UNKNOWN_SEEDED_ORIGINAL_RUN');assert.equal(unresolved.sourceRuns.length,0);
  const single={...unknown,seeded:false};
  const original=buildETFAudit({classification:classified,plan,probes:[{schemaVersion:'marketstack-probe-1.0.0',run:{source:'github-actions',runId:'original-single-run'},accounting:{provider:'marketstack',requestsAttempted:1},endpoints:[single]}]});
  assert.equal(original.holdingsTests[0].sourceRunId,'original-single-run');assert.equal(original.holdingsTests[0].sourceRunAttribution,'ORIGINAL_SINGLE_RUN_PROBE');
  const mixed=buildETFAudit({classification:classified,plan,probes:[{schemaVersion:'marketstack-probe-1.0.0',run:{source:'github-actions',runId:'latest-container'},accounting:{prior:{startedAt:'2026-09-01',finishedAt:'2026-09-02'}},endpoints:[single]}]});
  assert.equal(mixed.holdingsTests[0].sourceRunId,null);assert.equal(mixed.sourceRuns.length,0);
});

test('response evidence includes an unchanged payload hash and original request parameters',()=>{
  const response=entry('etfholdings',fixture.payload,{ticker:'VOO',exchange:'ARCX'}),first=audit([response]);
  const replay=audit([{...structuredClone(response),seeded:true}]);
  assert.match(first.holdingsTests[0].responseSHA256,/^[a-f0-9]{64}$/);
  assert.equal(first.holdingsTests[0].responseSHA256,replay.holdingsTests[0].responseSHA256);
  assert.deepEqual(first.holdingsTests[0].requestParameters,{ticker:'VOO',exchange:'ARCX'});
  assert.equal(first.holdingsTests[0].retrievedAt,response.retrievedAt);
  assert.equal(first.holdingsTests[0].sourceRunId,'test-run');
  const contentProof={canonicalResponseSHA256:'a'.repeat(64),originalActionProbeSHA256s:['b'.repeat(64)]};
  const corroborated=audit([{...response,sourceRunContentProof:contentProof}]);
  assert.deepEqual(corroborated.holdingsTests[0].sourceRunContentProof,contentProof);
});

test('ETF reconciliation deduplicates securities by ISIN across venues and currencies without counting funds',()=>{
  const candidates=[
    {providerSymbol:'ONE.DE',mic:'XETR',isin:'IE0000000001',tradingCurrency:'EUR',listingCountry:'DE'},
    {providerSymbol:'ONEU.DE',mic:'XETR',isin:'IE0000000001',tradingCurrency:'USD',listingCountry:'DE'},
    {providerSymbol:'ONE.L',mic:'XLON',isin:'IE0000000001',tradingCurrency:'GBP',listingCountry:'GB'},
    {providerSymbol:'TWO.DE',mic:'XETR',isin:'IE0000000002',tradingCurrency:'EUR',listingCountry:'DE'}
  ].map(r=>({...r,assetType:'ETF',providerName:'Identical umbrella UCITS ETF',officialStatus:'ACTIVE',referenceSourceId:'TEST_OFFICIAL'}));
  const report=buildETFAudit({classification:{candidates},plan}),result=buildETFIdentityCoverage(report,{sourceAuditSHA256:'artifact-hash'});
  assert.equal(result.counts.EuropeanOfficialETFListingCandidates,4);
  assert.equal(result.counts.EuropeanDistinctISINSecurityOrShareClassCandidates,2);
  assert.equal(result.counts.EuropeanDistinctVenueISINCurrencyIdentities,4);
  assert.equal(result.counts.EuropeanShareClassesOnMultipleVenues,1);
  assert.equal(result.counts.EuropeanShareClassesWithAnyKnownActiveListing,2);
  assert.equal(result.counts.verifiedUniqueETFFunds,null);
  assert.equal(result.counts.verifiedGlobalETFShareClassCount,null);
  assert.equal(result.counts.EuropeanUCITSNameLabelShareClassCandidates,2);
  assert.equal(result.counts.regulatoryUCITSVerified,0);
  assert.deepEqual(result.shareClasses[0].tradingCurrencies,['EUR','GBP','USD']);
  assert.equal(result.sourceAuditSHA256,'artifact-hash');
  assert.ok(result.listingRecords.every(r=>r.productionActivated===false&&r.companyFundamentals==='NOT_APPLICABLE'));
  assert.equal(result.listingRecords[0].UCITSNameLabelEvidence.observedName,'Identical umbrella UCITS ETF');
  assert.equal(result.listingRecords[0].UCITSNameLabelEvidence.regulatoryStatus,'UNVERIFIED');
  assert.throws(()=>buildETFIdentityCoverage(compactETFAudit(report)),/Complete private ETF registry/);
  assert.throws(()=>buildETFIdentityCoverage({...report,listings:report.listings.slice(0,1)}),/registry count mismatch/);
});

test('US ETF flags keep missing ISINs and legal fund identities unresolved in reconciliation',()=>{
  const reference={source:{source_system:'NASDAQTRADER_OFFICIAL_CURRENT_LISTING_DIRECTORY'},rows:[
    {symbol:'FLAG',mic:'XNAS',isin:null,assetType:'ETF',officialName:'Identical umbrella ETF',listingCountry:'US',active:null}]};
  const directory=entry('exchanges/XNAS/tickers',{pagination:{total:1,offset:0,count:1},data:{tickers:[{symbol:'FLAG'}]}},{offset:0});
  const report=audit([directory],{officialReferences:[reference]}),result=buildETFIdentityCoverage(report);
  assert.equal(result.counts.USExactPrimaryMICFlagListingCandidates,1);
  assert.equal(result.counts.USDistinctObservedNonconflictingISIN,0);
  const us=result.listingRecords.find(r=>r.providerSymbol==='FLAG');
  assert.equal(us.isin,null);assert.equal(us.legalFundIdentityVerified,false);assert.equal(us.active,null);
  assert.equal(us.identityScope,'CURRENT_US_PRIMARY_MIC_ETF_FLAG_CANDIDATE');
  assert.equal(result.counts.verifiedUniqueETFFunds,null);
});

test('requested ETF matrix distinguishes absent provider fields, reported supplements and uncertain UCITS',()=>{
  const report=audit([entry('etfholdings',fixture.payload,{ticker:'VOO'})]),matrix=buildMetadataMatrix(report).coverageMatrix;
  assert.equal(matrix.length,16);
  assert.ok(matrix.every(r=>['AVAILABLE','PARTIAL','NONE','UNVERIFIED'].includes(r.status)&&r.productionEligibilityGranted===false));
  const field=name=>matrix.find(r=>r.field===name);
  assert.equal(field('holdings').status,'PARTIAL');assert.equal(field('holding_weights').status,'PARTIAL');
  assert.equal(field('UCITS').status,'UNVERIFIED');assert.equal(field('UCITS').providerStatus,'NONE');
  assert.equal(field('TER/OCF').status,'NONE');assert.equal(field('AUM').status,'NONE');
  assert.equal(field('WKN').providerStatus,'NONE');assert.equal(field('WKN').status,'NONE');
  assert.equal(field('dividends').status,'UNVERIFIED');
  assert.match(field('holdings').reliability,/completeness/i);
  const official=structuredClone(classified);official.candidates[0].wkn='A1JX53';
  const withWKN=buildMetadataMatrix(audit([],{classification:official}));
  assert.equal(withWKN.fields.find(r=>r.field==='WKN').officialObservedListings,1);
  assert.equal(withWKN.coverageMatrix.find(r=>r.field==='WKN').status,'PARTIAL');
});

test('holdings position data returned is counted separately from usable partial reports',()=>{
  const payload=structuredClone(fixture.payload);payload.output.attributes.date_report_period='2027-12-31';
  const result=buildETFIdentityCoverage(audit([entry('etfholdings',payload,{ticker:'VOO'})]));
  assert.equal(result.counts.holdingsEndpointsWithAnyReturnedPositionData,1);
  assert.equal(result.counts.holdingsEndpointsWithAnyUsablePositionData,0);
  assert.equal(result.counts.partialHoldingsReports,0);assert.equal(result.counts.verifiedCompleteCurrentHoldings,0);
  assert.equal(result.holdingsByRegion.US.observations,1);assert.equal(result.holdingsByRegion.US.usablePartialReports,0);
});

test('ambiguous same-symbol holdings do not acquire a region from one preferred listing',()=>{
  const candidates=[...classified.candidates,{...classified.candidates[0],mic:'XETR',listingCountry:'DE',tradingCurrency:'EUR'}];
  const report=audit([entry('etfholdings',fixture.payload,{ticker:'VOO'})],{classification:{candidates}});
  assert.equal(report.holdingsTests[0].state,'AMBIGUOUS_LISTING');
  const result=buildETFIdentityCoverage(report);
  assert.equal(result.holdingsByRegion.UNKNOWN_OR_AMBIGUOUS.observations,1);
  assert.equal(result.holdingsByRegion.US,undefined);assert.equal(result.holdingsByRegion.EUROPEAN_LISTING,undefined);
});

test('public artifact keeps complete ETF census keys without duplicating provider directory metadata',()=>{
  const report=audit(),compact=compactETFAudit(report);
  assert.equal(report.listings.length,1);assert.equal(compact.listings.length,0);
  assert.deepEqual(compact.censusListingKeys,['VOO@ARCX']);assert.equal(compact.fullRegistryListingCount,1);
  assert.deepEqual(compact.counts,report.counts);assert.equal(compact.productionActivated,false);
});

test('public diagnostic samples stay bounded while exact private observation counts remain available',()=>{
  const raw=audit([entry('eod',{data:Array.from({length:9},(_,i)=>bar({date:`2026-09-${String(i+1).padStart(2,'0')}T00:00:00+0000`,low:12}))})]);
  const compact=compactETFAudit(raw),history=compact.listings[0].history;
  assert.equal(raw.listings[0].history.anomalies.length,9);assert.equal(history.anomalies.length,3);
  assert.equal(history.anomalyObservations,9);assert.equal(history.anomalyCountsByReason.invalidOHLC,9);
  assert.equal(compact.historyQuality.anomalyObservationsByReason.invalidOHLC,9);
});

const europeanRow=(mic='XAMS',display=mic,currency='EUR')=>[
  `<a href="/en/product/etfs/IE00B6R52259-${mic}">iShares MSCI All Country World UCITS ETF</a>`,'SSAC',`<div>${display}</div>`,null,
  currency?`<div>${currency} <span>123.45</span></div>`:'<div>-</div>'];
const europeanPage=(rows,type='ETF',total=rows.length,offset=0)=>({payload:{iTotalDisplayRecords:total,aaData:rows},source:{productTypeFilter:type,offset,sha256:'test-hash',method:'POST',requestBody:new URLSearchParams({'args[productType]':type}).toString()}});

test('Euronext typed JSON keeps ETF subtypes, primary venue and missing currency without name inference',()=>{
  const ref=normalizeEuronextETFReference([europeanPage([europeanRow('XAMS','XAMS, XPAR'),europeanRow('XPAR','XPAR',null)],'ACTIVE ETF')]);
  assert.equal(ref.rows.length,2);assert.equal(ref.rows[0].officialInstrumentType,'ACTIVE ETF');assert.equal(ref.rows[0].mic,'XAMS');
  assert.deepEqual(ref.rows[0].additionalDisplayedVenues,['XPAR']);assert.equal(ref.rows[1].tradingCurrency,null);
  assert.equal(ref.officialInventory.completeByType['ACTIVE ETF'],true);
  assert.throws(()=>normalizeEuronextETFReference([europeanPage([europeanRow()],'ETN')]),/ETF type filter/);
});

test('Euronext pagination cannot claim complete coverage across gaps or contradicting venues',()=>{
  const incomplete=normalizeEuronextETFReference([europeanPage([europeanRow()],'ETF',3,1)]);
  assert.equal(incomplete.officialInventory.completeByType.ETF,false);
  assert.throws(()=>normalizeEuronextETFReference([europeanPage([europeanRow('XAMS','XPAR')])]),/listing identity/);
  assert.throws(()=>normalizeEuronextETFReference([europeanPage([europeanRow()],'ETF',1,1)]),/pagination/);
});

test('Euronext references use actual discovered provider namespace and do not alias ETFPlus to Milan',()=>{
  const ref=normalizeEuronextETFReference([europeanPage([europeanRow(),europeanRow('ETFP')])]);
  const directory=entry('exchanges/XAMS/tickers',{pagination:{offset:0,total:1},data:{tickers:[{symbol:'SSAC.AS'}]}},{offset:0});
  const report=audit([directory],{officialReferences:[ref]});
  assert.ok(report.listings.some(r=>r.symbol==='SSAC.AS'&&r.mic==='XAMS'&&r.assetType==='ETF'));
  assert.ok(!report.listings.some(r=>r.mic==='XMIL'||r.mic==='ETFP'));
  const duplicated=entry('exchanges/XAMS/tickers',{pagination:{offset:0,total:2},data:{tickers:[{symbol:'SSAC.AS'},{symbol:'SSAC.XAMS'}]}},{offset:0});
  const ambiguous=audit([duplicated],{officialReferences:[ref]});assert.equal(ambiguous.listings.length,1);
  assert.ok(ambiguous.supplementJoinAnomalies.some(a=>a.reason==='AMBIGUOUS_PROVIDER_SYMBOL_NAMESPACE'));
});

test('Euronext duplicate page content at a new offset cannot prove a complete corpus',()=>{
  const first=europeanPage([europeanRow()],'ETF',2,0),second=europeanPage([europeanRow()],'ETF',2,1);
  const ref=normalizeEuronextETFReference([first,second]);assert.equal(ref.officialInventory.completeByType.ETF,false);
  assert.equal(ref.rows.length,1);assert.equal(ref.officialInventory.duplicateIdentityRowsByType.ETF,1);
  const replay=normalizeEuronextETFReference([first,structuredClone(first)]);assert.equal(replay.rows.length,1);
  assert.equal(replay.officialInventory.replayedPagesIgnored,1);assert.equal(replay.officialInventory.duplicateIdentityRowsByType.ETF,undefined);
  assert.throws(()=>normalizeEuronextETFReference([{...first,source:{...first.source,method:'GET'}}]),/POST provenance/);
});
