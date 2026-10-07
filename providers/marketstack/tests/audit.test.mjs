import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createMarketstackClient}=require('../client.js');
const {createAuditAdapter,capabilityFlags,normalizeObservation}=require('../audit-adapter.js');
function fake(pages,overrides={}) {
  const calls=[],persisted=[];
  const client=createMarketstackClient({apiKey:'synthetic-secret',maxRequests:100,maxCredits:1000,maxRetries:0,minIntervalMs:0,allowUncoordinatedTestRequests:true,
    onResponse:r=>persisted.push(r),fetchImpl:async url=>{const u=new URL(url);calls.push(u);const body=typeof pages==='function'?pages(u,calls.length-1):pages[calls.length-1];return {status:200,text:async()=>JSON.stringify(body),headers:new Headers()};},...overrides});
  return {client,api:createAuditAdapter({client}),calls,persisted};
}
const paged=(data,offset,total,limit=2)=>({pagination:{limit,offset,count:data.length,total},data});
const listing={providerTicker:'SAP.DE',mic:'XETR'};
const row={symbol:'SAP.DE',exchange:'XETR',open:10,high:12,low:9,close:11,volume:0,date:'2026-10-06T00:00:00+0000'};
test('search paginates by actual count, short intermediate page, dedup scoped identity',async()=>{
 const f=fake([paged([{ticker:'SAP',stock_exchange:{mic:'XETR'}}],0,3),paged([{ticker:'SAP',stock_exchange:{mic:'XNYS'}},{ticker:'HFG.DE',stock_exchange:{mic:'XETR'}}],1,3)]);
 const r=await f.api.searchTicker('SAP',{limit:2});assert.equal(r.complete,true);assert.equal(r.data.length,3);assert.deepEqual(f.calls.map(u=>u.searchParams.get('offset')),['0','1']);assert(f.calls.every(u=>u.pathname==='/v2/tickerslist'));
});
test('exchange nested pagination preserves exchange object and scope each page',async()=>{
 const body=(rows,offset)=>({pagination:{limit:2,offset,count:rows.length,total:3},data:{mic:'XETR',timezone:{timezone:'Europe/Berlin'},tickers:rows}});
 const f=fake([body([{symbol:'A'},{symbol:'B'}],0),body([{symbol:'C'}],2)]);const r=await f.api.listExchangeTickers('XETR',{limit:2});assert.equal(r.complete,true);assert.equal(r.raw[1].data.mic,'XETR');assert(f.calls.every(u=>u.pathname==='/v2/exchanges/XETR/tickers'));
});
test('invalid total never certifies completion',async()=>{
 for(const total of [null,-1,0.5,'',true,undefined]){const f=fake([paged([{ticker:'A'}],0,total)]);const r=await f.client.paginate('/tickerslist',{limit:2});assert.equal(r.ok,false);assert.equal(r.complete,false);assert.equal(r.reason,'invalidPagination');}
});
test('zero limit is rejected before fetch',async()=>{const f=fake([]);assert.equal((await f.client.paginate('/tickerslist',{limit:0})).reason,'invalidPagination');assert.equal(f.calls.length,0);});
test('repeated page, moving totals, wrong counts and empty before total fail visibly',async()=>{
 for(const [pages,reason] of [ [[paged([{ticker:'A'}],0,2),paged([{ticker:'A'}],1,2)],'paginationRepeated'], [[paged([{ticker:'A'}],0,3),paged([{ticker:'B'}],1,4)],'paginationChanged'], [[{...paged([{ticker:'A'}],0,3),pagination:{offset:0,count:2,total:3}}],'invalidPagination'], [[paged([],0,3)],'invalidPagination'] ]){const f=fake(pages);const r=await f.client.paginate('/tickerslist',{limit:2});assert.equal(r.reason,reason);assert.equal(r.complete,false);}
});
test('page budget and missing metadata do not silently truncate',async()=>{
 const f=fake([paged([{ticker:'A'}],0,5)]);const r=await f.client.paginate('/tickerslist',{limit:2},{maxPages:1});assert.equal(r.reason,'pageBudgetExceeded');assert.equal(r.data.length,1);assert.equal(r.complete,false);
 const g=fake([{data:[{ticker:'A'}]}]);assert.equal((await g.client.paginate('/tickerslist',{limit:2})).complete,false);
});
test('verified aliases resolve exact/qualified symbol without suffix invention',async()=>{
 const f=fake(u=>u.pathname.endsWith('SAP.DE')?{data:{symbol:'SAP.DE',stock_exchange:{mic:'XETR'}}}:{data:[]});
 const r=await f.api.resolveTicker({canonicalTicker:'SAP',aliases:['SAP.DE'],mic:'XETR'});assert.equal(r.providerTicker,'SAP.DE');assert.deepEqual(f.calls.map(u=>u.pathname),['/v2/tickers/SAP','/v2/tickers/SAP.DE']);
 const g=fake([{data:[]}]);assert.equal((await g.api.resolveTicker({canonicalTicker:'SAP',mic:'XETR'})).coverageConclusion,'UNKNOWN');assert.equal(g.calls.length,1);
});
test('same ticker wrong venue and ambiguous identity are not accepted',async()=>{
 const f=fake([{data:[{ticker:'SAP',stock_exchange:{mic:'XNYS'}}]}]);assert.equal((await f.api.resolveTicker({providerTicker:'SAP',mic:'XETR'})).ok,false);
});
test('latest EOD uses latest endpoint, bypasses cache and retains raw timestamp',async()=>{
 const f=fake([paged([row],0,1,1000),paged([row],0,1,1000)]);for(let i=0;i<2;i++){const r=await f.api.getLatestEOD(listing);assert.equal(r.data[0].normalized.marketTimestamp,row.date);assert.equal(r.data[0].normalized.tradingDate,'2026-10-06');}assert.equal(f.calls.length,2);assert(f.calls.every(u=>u.pathname==='/v2/eod/latest'&&!u.searchParams.has('date_from')));
});
test('Europe snapshot routes separately from IEX and does not assert realtime delay',async()=>{
 const snap={ticker:'SAP.DE',exchange_code:'XETR',price:'11.20',currency:'EUR',trade_last:'2026-10-07T10:00:00Z',country:'Germany'};const f=fake([{data:[snap]}]);const r=await f.api.getRealtimePrice(listing);assert.equal(f.calls[0].pathname,'/v2/stockprice');assert.equal(f.calls[0].searchParams.get('ticker'),'SAP.DE');assert.equal(r.data[0].normalized.delayState,'UNKNOWN');assert.equal(r.data[0].normalized.providerUpdateTimestamp,null);assert.deepEqual(r.data[0].raw,snap);
});
test('intraday forwards interval and after hours; no implicit ticker rewrite',async()=>{
 const f=fake([paged([{...row,marketstack_last:11}],0,1,1000)]);await f.api.getIntraday(listing,{latest:true,interval:'5min',extendedHours:true});assert.equal(f.calls[0].pathname,'/v2/intraday/latest');assert.equal(f.calls[0].searchParams.get('interval'),'5min');assert.equal(f.calls[0].searchParams.get('after_hours'),'true');assert.equal(f.calls[0].searchParams.get('symbols'),'SAP.DE');
});
test('all adjusted fields, zero volume and future provider fields preserved without certification',()=>{
 const raw={...row,adj_open:9,adj_high:11,adj_low:8,adj_close:10,adj_volume:5,split_factor:1,dividend:0,future:{x:7}};const r=normalizeObservation(raw,{kind:'EOD'});assert.deepEqual(r.raw,raw);assert.equal(r.normalized.adjustedClose,10);assert.equal(r.normalized.volume,0);assert.equal(r.normalized.adjustmentVerification,'UNVERIFIED');r.raw.future.x=8;assert.equal(raw.future.x,7);
});
const holding=(name,weight)=>({investment_security:{name,isin:'XX'+name,percent_value:weight,invested_country:'DE',future:9}});
const holdingsBody=(rows,offset,total)=>({basics:{fund_name:'Test fund'},output:{attributes:{ticker:'SPY',date_report_period:'2026-06-30',end_report_period:'2026-12-31'},signature:{signed:'yes'},holdings:rows},...(total===undefined?{}:{pagination:{limit:2,offset,count:rows.length,total}})});
test('nested ETF multi-page holdings and signed original weights preserved',async()=>{
 const f=fake([holdingsBody([holding('A','60'),holding('B','-2')],0,3),holdingsBody([holding('C','10')],2,3)]);const r=await f.api.getETFHoldings('SPY',{limit:2});assert.equal(r.complete,true);assert.equal(r.data.downloadedCount,3);assert.equal(r.data.sumWeightsPercent,68);assert.deepEqual(r.data.holdings.map(h=>h.weightRaw),['60','-2','10']);assert.equal(r.data.reportDates[0],'2026-06-30');assert.equal(r.data.signatures[0].signed,'yes');assert.deepEqual(f.calls.map(u=>u.searchParams.get('offset')),['0','2']);
});
test('ETF no pagination stays unverified; ignored offset never certifies FULL',async()=>{
 const rows=[holding('A','10')];const f=fake([holdingsBody(rows,0)]);const r=await f.api.getETFHoldings('SPY',{limit:2});assert.equal(r.complete,false);assert.equal(r.data.completenessBasis,'UNKNOWN');
 const g=fake([holdingsBody(rows,0),holdingsBody(rows,1)]);const s=await g.api.getETFHoldings('SPY',{limit:1,probePagination:true});assert.equal(s.reason,'paginationRepeated');assert.equal(s.complete,false);
});
test('ETF changing filing cannot merge into complete holdings',async()=>{
 const one=holdingsBody([holding('A','60')],0,2),two=holdingsBody([holding('B','40')],1,2);two.output.attributes.date_report_period='2026-07-31';const f=fake([one,two]);const r=await f.api.getETFHoldings('SPY',{limit:2});assert.equal(r.complete,false);assert.equal(r.reason,'holdingsReportChanged');
});
test('capabilities require per-flag evidence, never default marketing to SUPPORTED',()=>{
 assert(Object.values(capabilityFlags()).every(v=>v==='UNKNOWN'));assert.throws(()=>capabilityFlags({realtimeEurope:{status:'SUPPORTED'}}));assert.equal(capabilityFlags({realtimeEurope:{status:'PARTIAL',source:'fixture'}}).realtimeEurope,'PARTIAL');
});
test('raw text saved before normalization, documented errors mapped, key redacted',async()=>{
 const f=fake([{error:{code:'404_not_found',message:'synthetic-secret'}}]);const r=await f.client.request('/tickers/NONE');assert.equal(r.reason,'dataUnavailable');assert(!JSON.stringify(f.persisted).includes('synthetic-secret'));assert.equal(JSON.parse(f.persisted[0].rawText).error.code,'404_not_found');assert(!('access_key' in f.persisted[0].params));
});
test('budget limits count ETF multiplier and refuse without shared coordination',async()=>{
 const f=fake([holdingsBody([],0)],{maxCredits:19});assert.equal((await f.api.getETFHoldings('SPY')).reason,'budgetExceeded');assert.equal(f.calls.length,0);
 const g=fake([],{allowUncoordinatedTestRequests:false});assert.equal((await g.client.request('/eod/latest',{symbols:'SAP.DE'})).reason,'budgetUnverified');assert.equal(g.calls.length,0);
 const noFake=createMarketstackClient({apiKey:'synthetic',allowUncoordinatedTestRequests:true,maxRetries:0});assert.equal((await noFake.request('/tickerslist')).reason,'budgetUnverified');
});
test('requiring audit adapter does not alter provider registry, Tiingo instance, fetch or identities',()=>{
 const Providers=require('../../../quant/engines/provider.js'),Identity=require('../../../core/identity.js');const before=JSON.stringify(Providers),identity=Identity.securityIdForTicker('AAPL'),fetchBefore=globalThis.fetch;delete require.cache[require.resolve('../audit-adapter.js')];require('../audit-adapter.js');assert.equal(JSON.stringify(Providers),before);assert.equal(Identity.securityIdForTicker('AAPL'),identity);assert.equal(globalThis.fetch,fetchBefore);
});
test('dedicated actions retain exact symbol without inventing unreported venue',async()=>{
 for(const [method,value] of [['getSplits',{split_factor:4,stock_split:'4:1'}],['getDividends',{dividend:0.5,payment_date:'2026-10-15'}]]) {
  const raw={symbol:'SAP.DE',date:'2026-10-06',...value},f=fake([paged([raw],0,1,1000)]);const r=await f.api[method](listing);
  assert.equal(r.ok,true);assert.equal(r.data[0].identityVenueState,'NOT_REPORTED');assert.equal(r.data[0].canonicalAdmission,false);assert.deepEqual(r.data[0].raw,raw);assert.equal(f.calls[0].searchParams.has('exchange'),false);
 }
 const f=fake([paged([{symbol:'SAP.DE',exchange:'XNYS',date:'2026-10-06',split_factor:4}],0,1,1000)]);assert.equal((await f.api.getSplits(listing)).reason,'identityMismatch');
});
test('suffix-only pages cannot certify global completion and batch incompleteness propagates',async()=>{
 const f=fake([paged([{ticker:'B'}],1,2)]);const r=await f.client.paginate('/tickerslist',{limit:2,offset:1});assert.equal(r.complete,false);assert.equal(r.scopeComplete,true);assert.equal(r.coverage,'SUFFIX_ONLY');
 const g=fake([{data:[row]}]);const b=await g.client.requestBatches('/eod',['SAP.DE'],{limit:2});assert.equal(b.ok,false);assert.equal(b.complete,false);assert.equal(b.reason,'paginationUnverified');assert.equal(b.results[0].data.length,1);
});
test('holdings cannot certify wrong fund, missing report, empty or overlapping report pages',async()=>{
 const wrong=holdingsBody([holding('A','10')],0,1);wrong.output.attributes.ticker='QQQ';const f=fake([wrong]);assert.equal((await f.api.getETFHoldings('SPY')).complete,false);
 const g=fake([{...paged([holding('A','10')],0,1),basics:{fund_name:'Unknown'}}]);assert.equal((await g.api.getETFHoldings('SPY')).reason,'holdingsIdentityUnverified');
 const h=fake([holdingsBody([],0,0)]);const e=await h.api.getETFHoldings('SPY');assert.equal(e.complete,false);assert.equal(e.data.sumWeightsPercent,null);
 const j=fake([holdingsBody([holding('A','60'),holding('B','40')],0,4),holdingsBody([holding('B','40'),holding('C','10')],2,4)]);const overlap=await j.api.getETFHoldings('SPY',{limit:2});assert.equal(overlap.complete,false);assert.equal(overlap.reason,'holdingsRepeatedAcrossPages');assert.equal(overlap.data.holdings.length,4);assert.equal(overlap.data.sumWeightsPercent,150);
});
test('zero TTL forces raw refresh even if generic client already has a warm quote cache',async()=>{
 const f=fake([paged([row],0,1,1000),paged([{...row,date:'2026-10-07'}],0,1,1000)],{cacheTtlMs:300000});await f.client.request('/eod/latest',{symbols:'SAP.DE',exchange:'XETR',limit:1000,offset:0});const r=await f.api.getLatestEOD(listing);assert.equal(f.calls.length,2);assert.equal(r.data[0].normalized.tradingDate,'2026-10-07');
});
