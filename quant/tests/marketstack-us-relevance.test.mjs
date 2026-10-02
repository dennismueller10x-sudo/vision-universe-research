import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { classifyRelevance, liquidityEvidence, generateReport, diagnoseRetest } from '../../scripts/market/validate-marketstack-us-relevance.mjs';
const base = {consumer:true,currentRole:'EQUITY_COMMON',baselineActive:'ACTIVE',currentListingObserved:true,historicalConflict:false,documentedClassRemoval:false,indexes:[],liquidity:{recentAndUsable:true,averageVolume60d:50000}};
const classify = override => classifyRelevance({...base,...override});
test('mapped major index with current common class is high relevance',()=>assert.equal(classify({indexes:['NDX']}).bucket,'A'));
test('observed common class plus recent activity is bounded investable candidate',()=>assert.equal(classify({}).bucket,'B'));
test('low volume is analytical liquidity bucket and does not infer microcap',()=>assert.equal(classify({liquidity:{recentAndUsable:true,averageVolume60d:9999}}).bucket,'C'));
test('unknown activity does not become low liquidity or inactive',()=>assert.equal(classify({liquidity:{recentAndUsable:false,averageVolume60d:0}}).bucket,'G'));
test('stale liquidity does not qualify common security',()=>assert.equal(classify({liquidity:{recentAndUsable:false,averageVolume60d:50000}}).bucket,'G'));
test('current common class alone does not certify baseline inactive record',()=>assert.equal(classify({baselineActive:'INACTIVE'}).bucket,'G'));
test('inactive baseline without current listing is explicitly tentative inactive',()=>assert.deepEqual(classify({baselineActive:'INACTIVE',currentListingObserved:false}),{bucket:'E',reason:'BASELINE_INACTIVE_CURRENT_TERMINATION_NOT_PROVEN'}));
test('historical issuer conflict defeats current common class and index priority',()=>assert.equal(classify({historicalConflict:true,indexes:['NDX']}).bucket,'G'));
test('ADR is user relevant unresolved basis and never ordinary share',()=>assert.equal(classify({currentRole:'ADR',indexes:['NDX']}).bucket,'G'));
test('current ETF role excludes equity company analysis even if legacy common',()=>assert.equal(classify({currentRole:'ETF',indexes:['NDX']}).bucket,'D'));
test('index membership does not invent common role',()=>assert.equal(classify({currentRole:'UNKNOWN',indexes:['SP500']}).bucket,'G'));
test('proven duplicate requires explicit proof input',()=>assert.equal(classify({provedDuplicate:true}).bucket,'F'));
test('exact class venue removal precedes index presence',()=>assert.equal(classify({documentedClassRemoval:true,indexes:['SP500']}).bucket,'E'));
test('nonconsumer membership remains separated without changing eligibility',()=>assert.equal(classify({consumer:false}).bucket,'D'));
test('liquidity rejects future dates, malformed numeric values and failed factors',()=>{
 const f={asOf:'2026-09-29',bars:300,dataQuality:'PASS',values:{avgVolume60d:50000}};
 assert.equal(liquidityEvidence(f,'2026-10-01').recentAndUsable,true);
 assert.equal(liquidityEvidence({...f,asOf:'2026-10-03'},'2026-10-01').recentAndUsable,false);
 assert.equal(liquidityEvidence({...f,values:{avgVolume60d:'50000'}},'2026-10-01').recentAndUsable,false);
 assert.equal(liquidityEvidence({...f,dataQuality:'FAIL'},'2026-10-01').recentAndUsable,false);
});
const report=generateReport();
test('complete accepted gap populations reconcile without treating four venue gaps as prior flags',()=>{
 assert.equal(report.totals.retainedRecords,7803);assert.equal(report.totals.nonExactDirectoryRecords,1065);
 assert.equal(report.totals.rejectedExactLatest,460);assert.equal(report.totals.allRetainedIdentityOrLatestGaps,1525);
 assert.equal(report.totals.allAuditedRequiredListingGaps,1529);assert.equal(report.totals.additionalCurrentVenueGaps,4);
 assert.equal(report.totals.protectedConsumerGaps,1401);assert.equal(report.totals.currentCommonClassConsumerGaps,787);
 assert.equal(Object.values(report.totals.bucketCounts).reduce((a,b)=>a+b,0),1529);
 assert.equal(new Set(report.rows.map(r=>r.symbol)).size,1529);
});
test('complete unmatched and consumer records each have exactly one named relevance classification',()=>{
 for(const file of ['us_marketstack_unmatched_classification.json','us_marketstack_consumer_final.json']){
  const source=JSON.parse(fs.readFileSync(new URL(`../../reports/marketstack/${file}`,import.meta.url)));
  const rows=source.allProtectedConsumerGaps ?? source.rows;
  for(const r of rows){const found=report.rows.filter(x=>x.symbol === (r.symbol ?? r.ticker));assert.equal(found.length,1);assert.ok('ABCDEFG'.includes(found[0].relevanceBucket));}
 }
});
test('major index counts preserve dated source proxy and unmatched uncertainty',()=>{
 const by=new Map(report.indexCoverage.map(x=>[x.indexId,x]));
 assert.equal(by.get('SP500').latestOrIdentityGaps,81);assert.equal(by.get('NDX').latestOrIdentityGaps,27);assert.equal(by.get('DJIA').latestOrIdentityGaps,6);
 assert.equal(by.get('SP500').sourceScope,'FUND_HOLDINGS_PROXY_NOT_OFFICIAL_COMPLETE_INDEX');
 assert.equal(by.get('NDX').sourceScope,'INDEX_OWNER_DATED_LIST');
 assert.equal(by.get('SP500').unmatchedSourceRows.length,6);
 for(const x of by.values())assert.equal(x.completeOfficialIndexGapCount,null);
});
test('four current venue conflicts remain unsafe despite valid legacy quotes',()=>{
 for(const symbol of ['FITB','KHC','OPAD','QBTS']){
  const r=report.rows.find(x=>x.symbol===symbol);assert.equal(r.validLatestCovered,true);assert.equal(r.currentCommonIdentityCovered,false);
  assert.equal(r.degradation,'CURRENT_REQUIRED_LISTING_IDENTITY_UNVALIDATED');assert.equal(r.safeForNewMarketstackQuant,false);
 }
});
test('core named rejections make user impact explicit without claiming numerical price wrong',()=>{
 for(const s of ['META','AMD','CAT','BA']){const r=report.rows.find(x=>x.symbol===s);assert.equal(r.latestStatus,'CURRENCY_MISMATCH');assert.equal(r.relevanceBucket,'A');assert.equal(r.validLatestCovered,false);}
 for(const s of ['WMT','PLTR'])assert.ok(report.namedHighRelevanceConsumerGaps.some(r=>r.symbol===s));
});
test('unknown total unsupported and legal continuity cannot be converted to zero readiness',()=>{
 assert.equal(report.totals.genuineUnsupportedActiveCommonStocks,null);assert.equal(report.totals.provedGloballyUnsupported,0);
 assert.equal(report.topMarketCapGapCount,null);assert.equal(report.currentCommonClassCoverage.ACTIVE_CONSUMER_COMMON_STOCKS_TOTAL,null);
 assert.ok(report.rows.every(r=>r.legalIssuerSecurityContinuityFullyProven===false && r.safeForNewMarketstackQuant===false && r.productionAdmissionChanged===false));
});
test('source bytes hash exactly and generation is deterministic',()=>{
 for(const source of report.sources){const b=fs.readFileSync(new URL(`../../${source.path}`,import.meta.url));assert.equal(crypto.createHash('sha256').update(b).digest('hex'),source.sha256);}
 assert.deepEqual(generateReport(),report);
 const published=JSON.parse(fs.readFileSync(new URL('../../reports/marketstack/us_gap_relevance.json',import.meta.url)));
 delete published.recentHistoryDiagnosticRetest;assert.deepEqual(published,report);
});

const observed=JSON.parse(fs.readFileSync(new URL('../../reports/marketstack/us_gap_relevance.json',import.meta.url))).recentHistoryDiagnosticRetest;
test('separate real retest includes all 25 and preserves original gap populations',()=>{
 assert.equal(observed.totalHistoryRequestsObserved,25);assert.equal(observed.nonemptyHistoryResponses,21);assert.equal(observed.emptyHistoryResponses,4);
 assert.equal(observed.totalObservedBars,13804);assert.equal(observed.latestObservationContractPass,21);
 assert.equal(observed.invalidOHLCBars,100);assert.equal(observed.missingCurrencyBars,4356);assert.equal(observed.contradictoryCurrencyBars,2804);
 assert.equal(observed.frozenCoverageAndClassificationsUnchanged,true);
 assert.equal(report.totals.allAuditedRequiredListingGaps,1529);
});
test('latest bounded bars do not certify current latest freshness or full-history safety',()=>{
 assert.ok(observed.rows.every(r=>r.latestQuoteFreshness.startsWith('NOT_TESTED')));
 assert.equal(observed.rawHistoryContractsPass,1);
 const short=observed.rows.find(r=>r.rawHistoryContractsPass);assert.equal(short.requestedSymbol,'VAI');assert.equal(short.observedBars,24);
 assert.ok(observed.rows.every(r=>!r.safeForNewMarketstackQuant && !r.safeForNewMarketstackBacktest && !r.newProductionAdmission));
});
test('empty current venue results remain sample failures without unsupported inference',()=>{
 assert.deepEqual(observed.rows.filter(r=>r.observedBars===0).map(r=>r.requestedSymbol),['BRK.B','PANW','PLTR','WMT']);
 assert.match(observed.rows.find(r=>r.requestedSymbol==='BRK.B').emptyResponseInterpretation,/FORMAT_CANDIDATES_NOT_EXHAUSTED/);
 assert.ok(observed.rows.every(r=>r.aliasApproved===false && r.securityIdentityIndependentlyProven===false));
});
test('currency contradictions remain visible despite USD latest bars',()=>{
 for(const [symbol,currency,count] of [['NVDA','ARS',51],['MSFT','EUR',37],['JPM','MXN',289],['XOM','MXN',290]]){
  const r=observed.rows.find(r=>r.requestedSymbol===symbol);assert.equal(r.currencyCounts[currency],count);assert.equal(r.latestNativeUSDCurrencyValid,true);assert.equal(r.rawHistoryContractsPass,false);
 }
});
test('history analysis does not double bill shared 75 source requests',()=>{
 assert.equal(observed.requestAccounting.analysisRequestsMade,0);assert.equal(observed.requestAccounting.analysisAdditionalEstimatedCredits,0);
 assert.equal(observed.requestAccounting.sharedSourceRunEstimatedCredits,75);assert.equal(observed.requestAccounting.sharedSourceRunRequests,75);
 assert.equal(observed.requestAccounting.sharedSourceRunAccountingGroupId,'36964230530');assert.match(observed.source.sha256,/^[a-f0-9]{64}$/);
});
test('diagnostic fixtures reject contradictory historical bars and keep no admission even when latest passes',()=>{
 const valid={open:10,high:11,low:9,close:10,volume:100,symbol:'X',exchange:'XNAS',price_currency:'USD',date:'2026-09-30T00:00:00Z'};
 const evidence={run:{snapshotRunId:'36964230530'},endpoints:[{endpoint:'eod',label:'product-fitness-us-eod',params:{symbols:'X',exchange:'XNAS',date_from:'2024-01-01',date_to:'2026-09-30'},data:{data:[{...valid,date:'2026-09-29T00:00:00Z',price_currency:'ARS'},valid]},ok:true}]};
 const a=diagnoseRetest(evidence,report);assert.equal(a.latestObservationContractPass,1);assert.equal(a.rawHistoryContractsPass,0);assert.equal(a.rows[0].contradictoryCurrencyBars,1);assert.equal(a.rows[0].safeForNewMarketstackQuant,false);
 assert.deepEqual(diagnoseRetest(evidence,report),a);
});
