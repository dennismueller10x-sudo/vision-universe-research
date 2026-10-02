import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canonicalAdjustmentPrototype,splitAdjustmentFactors,totalReturnReinvestmentFactors} from '../../scripts/market/marketstack-canonical-adjustment-prototype.mjs';
import {compareAdjustedControlWindow,buildProductAdjustmentValidation,buildUSFullWindowAdjustmentStudy} from '../../scripts/market/validate-marketstack-product-adjustments.mjs';
const source={reference:'TEST_ONLY_SYNTHETIC_ACTION_AND_CALENDAR',sha256:'a'.repeat(64)};
const make=(closes=[100,102,10.5,11])=>{
 const dates=['2024-06-06','2024-06-07','2024-06-10','2024-06-11'];
 return {mode:'SPLIT_ADJUSTED',identity:{listingId:'test:XNAS:TEST',symbol:'TEST',mic:'XNAS',currency:'USD',verified:true,source},
   bars:closes.map((close,i)=>({date:dates[i],symbol:'TEST',exchange:'XNAS',currency:'USD',open:close,high:close*1.01,low:close*.99,close,volume:i<2?100:1000})),
   coverage:{from:dates[0],to:dates[3],expectedSessions:dates,calendarVerified:true,calendarSource:source,actionSource:source,splitsComplete:true,dividendsComplete:true,actionsCompleteThrough:dates[3]},
   fieldBasis:{price:'AS_TRADED',priceVerified:true,priceSource:source,volume:'AS_TRADED',volumeVerified:true,volumeSource:source},
   actions:[{type:'SPLIT',date:dates[2],factor:10,currency:'USD',symbol:'TEST',mic:'XNAS',verified:true,source}]};
};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
test('ten-for-one split preserves economic return, SMA and split-scaled volume without false90%loss',()=>{
 const r=canonicalAdjustmentPrototype(make());assert.equal(r.status,'READY_WITH_VU_ADJUSTMENT');assert.equal(r.productionAdmission,false);
 r.bars.forEach((b,i)=>near(b.close,[10,10.2,10.5,11][i]));assert.deepEqual(r.bars.map(b=>b.volume),[1000,1000,1000,1000]);
 near(r.bars[2].close/r.bars[1].close-1,10.5/10.2-1);near(r.bars.reduce((s,b)=>s+b.close,0)/4,10.425);
});
test('reverse split has correct price and volume factors',()=>{
 const x=make([10,10.2,102,110]);x.actions[0].factor=.1;
 const r=canonicalAdjustmentPrototype(x);near(r.bars[0].close,100);near(r.bars[0].volume,10);near(r.bars[2].close/r.bars[1].close,1);
});
test('already split-adjusted volume remains unchanged and mismatched anchors reject',()=>{
 const x=make();x.fieldBasis.volume='SPLIT_ADJUSTED_TO_ANCHOR';x.fieldBasis.volumeAnchor=x.coverage.to;x.bars.forEach(b=>b.volume=1000);
 assert.deepEqual(canonicalAdjustmentPrototype(x).bars.map(b=>b.volume),[1000,1000,1000,1000]);
 x.fieldBasis.volumeAnchor='2024-06-10';assert.equal(canonicalAdjustmentPrototype(x).status,'BLOCKED');
});
test('already adjusted OHLC is rejected rather than double-adjusted',()=>{
 const x=make();x.fieldBasis.price='SPLIT_ADJUSTED';const r=canonicalAdjustmentPrototype(x);assert.equal(r.status,'BLOCKED');assert.equal(r.bars.length,0);
});
test('true cash reinvestment matches investor wealth, differs from prior-close vendor convention',()=>{
 const x=make([100,101,90,95]);x.actions=[{...x.actions[0],type:'CASH_DIVIDEND',amount:10,shareBasis:'POST_EVENT_SHARES'}];x.mode='TOTAL_RETURN';
 const r=canonicalAdjustmentPrototype(x);assert.equal(r.status,'READY_WITH_VU_ADJUSTMENT');near(r.bars[2].close/r.bars[1].close,(90+10)/101);
 near(r.bars[1].close,101*90/100);assert.notEqual(r.bars[1].close,101-10);assert.deepEqual(r.bars.map(b=>b.volume),[100,100,1000,1000]);
 x.mode='SPLIT_ADJUSTED';near(canonicalAdjustmentPrototype(x).bars[1].close,101);
});
test('split and post-event dividend on same session use consistent share basis',()=>{
 const x=make();x.mode='TOTAL_RETURN';x.actions.push({...x.actions[0],type:'CASH_DIVIDEND',amount:1,shareBasis:'POST_EVENT_SHARES'});
 const r=canonicalAdjustmentPrototype(x);near(r.bars[2].close/r.bars[1].close,(10.5+1)/10.2);near(r.bars[0].close,10*10.5/11.5);
});
test('multiple splits transform dividend and volume into anchor share units',()=>{
 const x=make([100,50,25,24]);x.actions=[{...x.actions[0],date:'2024-06-07',factor:2},{...x.actions[0],date:'2024-06-10',factor:2},
   {...x.actions[0],date:'2024-06-07',type:'CASH_DIVIDEND',amount:2,shareBasis:'POST_EVENT_SHARES'}];x.mode='TOTAL_RETURN';
 const r=canonicalAdjustmentPrototype(x);near(r.bars[1].close/r.bars[0].close,26/25);near(r.bars[0].volume,400);
});
for(const [name,mutate,code] of [
 ['quote currency',x=>delete x.bars[0].currency,'BAR_IDENTITY_OR_CURRENCY_MISMATCH'],
 ['identity source',x=>delete x.identity.source,'UNVERIFIED_IDENTITY_OR_QUOTE_UNIT'],
 ['raw basis',x=>x.fieldBasis.priceVerified=false,'UNVERIFIED_AS_TRADED_PRICE_BASIS'],
 ['volume basis',x=>x.fieldBasis.volumeVerified=false,'UNVERIFIED_VOLUME_BASIS'],
 ['action completeness',x=>x.coverage.splitsComplete=false,'INCOMPLETE_SPLIT_ACTION_COVERAGE'],
 ['calendar',x=>delete x.coverage.expectedSessions,'UNVERIFIED_OR_MISSING_SESSIONS'],
 ['missing session',x=>x.bars.splice(1,1),'UNVERIFIED_OR_MISSING_SESSIONS'],
 ['duplicates',x=>x.bars.push({...x.bars[1]}),'DUPLICATE_BAR'],
 ['compound action',x=>x.actions[0].type='SPINOFF','UNSUPPORTED_CORPORATE_ACTION'],
 ['unverified event',x=>x.actions[0].verified=false,'UNVERIFIED_ACTION_IDENTITY'],
 ['ADR/local identity',x=>x.actions[0].symbol='TEST.ADR','UNVERIFIED_ACTION_IDENTITY'],
 ['invalid OHLC',x=>x.bars[0].high=1,'INVALID_OHLC'],
 ['zero factor',x=>x.actions[0].factor=0,'INVALID_SPLIT_FACTOR'],
 ['negative volume',x=>x.bars[0].volume=-1,'INVALID_VOLUME'],
 ['duplicate actions',x=>x.actions.push({...x.actions[0]}),'DUPLICATE_OR_COMPOUND_ACTION_REQUIRES_REVIEW']
])test(`fail closed on ${name}`,()=>{const x=make();mutate(x);const r=canonicalAdjustmentPrototype(x);assert.equal(r.status,'BLOCKED');assert.deepEqual(r.bars,[]);assert.ok(r.issues.some(i=>i.code===code));});
test('dividend completeness gate differs from split-only series',()=>{
 const x=make();x.coverage.dividendsComplete=false;assert.equal(canonicalAdjustmentPrototype(x).status,'READY_WITH_VU_ADJUSTMENT');x.mode='TOTAL_RETURN';assert.equal(canonicalAdjustmentPrototype(x).status,'BLOCKED');
});
test('invalid dates and floating point overflow never emit adjusted prices',()=>{
 const x=make();x.bars[0].date='2024-02-31';assert.equal(canonicalAdjustmentPrototype(x).status,'BLOCKED');
 const y=make();y.actions[0].factor=Number.MIN_VALUE;assert.equal(canonicalAdjustmentPrototype(y).status,'BLOCKED');
});
test('malformed provider objects return blocked evidence rather than throwing or inventing values',()=>{
 for(const mutate of [x=>x.bars[0]=null,x=>x.bars[0]=[],x=>x.actions[0]=null,x=>x.actions[0]='split',x=>x.identity=null,x=>x.coverage=null,x=>x.fieldBasis=null]){
  const x=make();mutate(x);const r=canonicalAdjustmentPrototype(x);assert.equal(r.status,'BLOCKED');assert.deepEqual(r.bars,[]);
 }
});
test('published empirical report keeps bounded controls separate from global admission',()=>{
 const r=JSON.parse(readFileSync(new URL('../../reports/marketstack/marketstack_adjustment_validation.json',import.meta.url)));
 assert.equal(r.summary.controlWindows,17);assert.equal(r.summary.fullTechnicalSeriesCertified,0);assert.equal(r.productionChanged,false);
 for(const row of r.rows){assert.equal(row.fullHistoryCertified,false);assert.equal(row.compatibility.backtesting,'BLOCKED');}
 const a=r.rows.find(x=>x.symbol==='AAPL'),n=r.rows.find(x=>x.symbol==='NVDA');
 assert.equal(a.numericalReconstruction.empiricallyObservedPriceBasis,'SPLIT_ADJUSTED_TO_WINDOW_ANCHOR');
 assert.equal(n.numericalReconstruction.empiricallyObservedPriceBasis,'AS_TRADED');
 assert.ok(a.numericalReconstruction.splitAdjustedCloseErrorBps.max<.001);assert.ok(n.numericalReconstruction.splitAdjustedCloseErrorBps.max<.001);
 assert.equal(n.numericalReconstruction.currencyVerified,false);
});
test('analytical dividend factor uses ex-date close and retains terminal price',()=>{
 assert.deepEqual(totalReturnReinvestmentFactors([{date:'a',close:100},{date:'b',close:90}],new Map([['b',10]])),[.9,1]);
 assert.deepEqual(splitAdjustmentFactors([{date:'2024-01-01'},{date:'2024-01-02'}],[{type:'SPLIT',date:'2024-01-02',factor:2}],'2024-01-02'),[.5,1]);
});
test('fresh75response action/history audit distinguishes pagination from independent completeness',()=>{
 const r=JSON.parse(readFileSync(new URL('../../reports/marketstack/marketstack_adjustment_validation.json',import.meta.url))).usFullWindowStudy;
 assert.equal(r.sourceRunId,'36964230530');assert.equal(r.summary.symbolsRequested,25);assert.equal(r.summary.declaredCompleteEndpointResponses,75);
 assert.equal(r.summary.withAtLeast250Bars,20);assert.equal(r.summary.independentlyComparedListings,5);assert.equal(r.summary.fullHistoryCertified,0);
 const n=r.rows.find(x=>x.symbol==='NVDA');assert.equal(n.actionDifferences.dividends.length,1);assert.equal(n.actionDifferences.dividends[0].date,'2024-03-05');assert.equal(n.actionDifferences.dividends[0].embeddedEodValue,.004);assert.equal(n.actionDifferences.dividends[0].separateEndpointValue,.04);
 assert.equal(n.actionDifferences.dividends[0].interpretation,'BOUNDED_SPLIT_SHARE_BASIS_PATTERN_CONFIRMED_WITH_TIINGO_ACTIONS');
 assert.equal(n.actionDifferences.dividends[0].independentShareBasisDiagnostic.anchorShareFactor,.1);
 assert.equal(n.independentlyCompleteActions,false);assert.equal(n.compatibility.technicalIndicators,'UNSAFE');
 assert.equal(r.rows.find(x=>x.symbol==='AAPL').missingHistoricalCurrencyBars,0);
 assert.ok(n.missingHistoricalCurrencyBars>0);
 assert.equal(n.conflictingHistoricalCurrencyBars,51);assert.equal(n.rawProviderCurrencyCounts.ARS,51);
 assert.equal(r.rows.find(x=>x.symbol==='XOM').conflictingHistoricalCurrencyBars,290);
 assert.equal(n.revisionControls[0].pairedDays,10);assert.deepEqual(n.revisionControls[0].observedChanges,[]);
 const w=r.rows.find(x=>x.symbol==='WMT');assert.equal(w.bars,0);assert.deepEqual(w.actionDifferences.splits,[]);assert.deepEqual(w.actionDatesWithoutPriceBar.splits,['2024-02-26']);
});
test('HTTPsuccess cannot imply complete pagination, correct action identity or observed price availability',()=>{
 const row={date:'2024-06-10',symbol:'TEST',exchange:'XNAS',price_currency:'USD',open:10,high:11,low:9,close:10,volume:100,adj_open:10,adj_high:11,adj_low:9,adj_close:10,split_factor:1,dividend:0};
 const entry=(endpoint,data,total=data.length)=>({endpoint,label:endpoint==='eod'?'product-fitness-us-eod':'test',params:{symbols:'TEST',exchange:'XNAS',date_from:'2024-06-10',date_to:'2024-06-10'},ok:true,data:{pagination:{limit:1000,offset:0,count:data.length,total},data}});
 const r=buildUSFullWindowAdjustmentStudy({run:{runId:'TEST'},endpoints:[entry('eod',[row],2),entry('splits',[]),entry('dividends',[])]});
 assert.equal(r.rows[0].providerPaginationComplete,false);assert.equal(r.rows[0].independentlyCompleteActions,false);assert.equal(r.rows[0].fullHistoryCertified,false);
});
test('response origin is distinct from a replay-container identifier',()=>{
 const entry=(endpoint,origin)=>({endpoint,label:endpoint==='eod'?'product-fitness-us-eod':'test',sourceRunId:origin,params:{symbols:'TEST',exchange:'XNAS',date_from:'2024-06-10',date_to:'2024-06-10'},ok:true,data:{pagination:{limit:1000,offset:0,count:0,total:0},data:[]}});
 const probe={run:{snapshotRunId:'CONTAINER'},endpoints:[entry('eod','ORIGINAL'),entry('splits','ORIGINAL'),entry('dividends','ORIGINAL')]};
 assert.equal(buildUSFullWindowAdjustmentStudy(probe).sourceRunId,'ORIGINAL');
 probe.endpoints[2].sourceRunId='DIFFERENT_ORIGIN';assert.equal(buildUSFullWindowAdjustmentStudy(probe).sourceRunId,null);
 delete probe.endpoints[0].sourceRunId;delete probe.endpoints[1].sourceRunId;delete probe.endpoints[2].sourceRunId;assert.equal(buildUSFullWindowAdjustmentStudy(probe).sourceRunId,null);
});
