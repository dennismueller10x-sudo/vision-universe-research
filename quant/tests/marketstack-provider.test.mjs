import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const Identity=require('../../core/identity.js');
const {createMarketstackClient,estimateCredits}=require('../../providers/marketstack/client.js');
const {createMarketstackProvider,normalizeBar,assetType,normalizeCurrency}=require('../../providers/marketstack/adapter.js');
const response=(data,status=200,headers={})=>({status,headers:{get:k=>headers[k]??null},text:async()=>JSON.stringify(data)});
const client=(extra={})=>createMarketstackClient({apiKey:'TESTKEY-MARKETSTACK-NEVER-LOG',allowUncoordinatedTestRequests:true,minIntervalMs:0,baseBackoffMs:0,sleep:async()=>{},...extra});
const mapping={isin:'DE0007164600',mic:'XETR',mappingVerified:true,currencyVerified:true,mappingSource:'independent listing fixture',currencySource:'independent currency fixture',symbol:'SAP.DE',exchange:'XETR',currency:'EUR',assetType:'equity',listingId:Identity.listingIdFor({isin:'DE0007164600',mic:'XETR'}),securityId:Identity.securityIdForISIN('DE0007164600')};
const row={symbol:'SAP.DE',exchange:'XETR',price_currency:'EUR',asset_type:'Stock',date:'2026-09-30T00:00:00+0000',open:200,high:210,low:199,close:208,volume:1000,adj_open:100,adj_high:105,adj_low:99.5,adj_close:104,adj_volume:2000,split_factor:2,dividend:1};
const provider=(fetchImpl,extra={})=>{const mappings=Object.fromEntries(Object.entries(extra.mappings||{sap:mapping}).map(([id,entry])=>{const mic=entry.exchange||entry.mic;return [id,{...entry,mic,listingId:entry.isin?Identity.listingIdFor({isin:entry.isin,mic}):entry.listingId,securityId:entry.isin?Identity.securityIdForISIN(entry.isin):entry.securityId}];}));return createMarketstackProvider({client:client({fetchImpl}),...extra,mappings});};
test('dedicated action endpoints preserve symbol evidence without inventing MIC or share basis',async()=>{
 const p=provider(async url=>response({data:[{symbol:'SAP.DE',date:'2026-09-30',split_factor:2}]}));
 const r=await p.getActionEvents('sap','splits',{from:'2026-09-01',to:'2026-10-06'});
 assert.equal(r.available,true);assert.equal(r.data.verified,false);assert.equal(r.data.events[0].identityState,'EXACT_SYMBOL_MIC_NOT_REPORTED');
 assert.equal(r.data.events[0].shareBasis,'UNVERIFIED');assert.equal(r.provenance.endpoint,'/splits');
 const bad=provider(async()=>response({data:[{symbol:'SAP',exchange:'XNYS',date:'2026-09-30',dividend:1}]}));
 const b=await bad.getActionEvents('sap','dividends',{from:'2026-09-01',to:'2026-10-06'});
 assert.equal(b.data.events.length,0);assert.equal(b.data.anomalies[0].reason,'symbolMismatch');
});
test('cost accounting reserves ETF multiplier and symbols on every page',()=>{
 assert.equal(estimateCredits('/etflist'),20);assert.equal(estimateCredits('/etfholdings'),20);assert.equal(estimateCredits('/eod',{symbols:'AAPL,MSFT,AAPL'}),2);
});
test('no credential means zero calls',async()=>{
 let calls=0;const c=client({apiKey:'',fetchImpl:async()=>{calls++;}});assert.equal((await c.request('/exchanges')).reason,'notConfigured');assert.equal(calls,0);
});
test('credentials injected only at fetch and absent from result/error/accounting',async()=>{
 const c=client({maxRetries:0,fetchImpl:async url=>{assert.match(url,/access_key=TESTKEY-MARKETSTACK-NEVER-LOG/);throw new Error(url);}});
 const result=await c.request('/eod',{symbols:'AAPL'});assert.equal(result.reason,'networkError');assert.ok(!JSON.stringify({result,stats:c.stats(),health:c.health()}).includes('TESTKEY-MARKETSTACK-NEVER-LOG'));
});
test('provider error text and nested credentials are sanitized',async()=>{
 const c=client({fetchImpl:async()=>response({data:[{safe:'x',access_key:'TESTKEY-MARKETSTACK-NEVER-LOG',name:'TESTKEY-MARKETSTACK-NEVER-LOG'}]})});
 const res=await c.request('/exchanges');assert.ok(!JSON.stringify(res).includes('TESTKEY-MARKETSTACK-NEVER-LOG'));assert.equal(res.data.data[0].name,'[REDACTED]');
});
test('ETF safety budget blocks before sending and retries reserve credits',async()=>{
 let calls=0;const c=client({maxCredits:21,fetchImpl:async()=>{calls++;return response({},503);}});
 const res=await c.request('/etfholdings',{ticker:'SPY'});assert.equal(res.reason,'budgetExceeded');assert.equal(calls,1);assert.equal(c.stats().estimatedCreditsConsumed,20);
});
test('HTTP and HTTP200 monthly quotas never retry; entitlements remain explicit',async()=>{
 for(const status of [200,429]) {
  let calls=0;const c=client({fetchImpl:async()=>{calls++;return response({error:{code:'too_many_requests',message:'TESTKEY-MARKETSTACK-NEVER-LOG'}},status);}});
  assert.equal((await c.request('/eod')).reason,'quotaExceeded');assert.equal(calls,1);
 }
 const c=client({fetchImpl:async()=>response({error:{code:'function_access_restricted'}},403)});
 assert.equal((await c.request('/company_facts')).reason,'entitlementRestricted');
});
test('rate throttling respects Retry-After and succeeds, including body-less429',async()=>{
 for(const body of [{error:{code:'rate_limit_reached'}},{}]) {
  let calls=0,waits=[];const c=client({sleep:async ms=>waits.push(ms),fetchImpl:async()=>++calls===1?response(body,429,{'retry-after':'2'}):response({data:[]})});
  assert.equal((await c.request('/exchanges')).ok,true);assert.equal(calls,2);assert.deepEqual(waits,[2000]);assert.equal(c.stats().requestsAttempted,2);
 }
});
test('timeout bounds hanging body and does not leak a URL',async()=>{
 const c=client({timeoutMs:10,maxRetries:0,fetchImpl:async()=>({status:200,text:async()=>new Promise(()=>{})})});
 assert.equal((await c.request('/exchanges')).reason,'timeout');assert.equal(c.stats().requestsAttempted,1);
});
test('pagination returns all pages, resume cursor on safety block, detects stalled offset',async()=>{
 const c=client({fetchImpl:async url=>{const offset=Number(new URL(url).searchParams.get('offset'));return response({pagination:{offset,count:1,total:2},data:[{offset}]});}});
 const res=await c.paginate('/exchanges',{limit:1});assert.deepEqual(res.data,[{offset:0},{offset:1}]);assert.equal(res.complete,true);
 const blocked=client({maxRequests:1,fetchImpl:async()=>response({pagination:{offset:0,count:1,total:2},data:[1]})});
 const partial=await blocked.paginate('/exchanges',{limit:1});assert.equal(partial.complete,false);assert.equal(partial.nextOffset,1);assert.deepEqual(partial.data,[1]);
 const stalled=client({fetchImpl:async()=>response({pagination:{offset:0,count:1,total:3},data:[1]})});
 assert.equal((await stalled.paginate('/exchanges',{limit:1})).reason,'invalidPagination');
});
test('cache and concurrent identical requests consume one HTTP request',async()=>{
 let calls=0;const c=client({fetchImpl:async()=>{calls++;return response({data:[1]});}});
 await Promise.all([c.request('/exchanges'),c.request('/exchanges')]);assert.equal((await c.request('/exchanges')).fromCache,true);assert.equal(calls,1);assert.equal(c.stats().deduplicated,1);
});
test('batching is bounded and retains remaining work',async()=>{
 const c=client({maxCredits:2,fetchImpl:async()=>response({data:[]})});
 const res=await c.requestBatches('/eod',['A','B','C'],{}, {batchSize:2});assert.equal(res.ok,false);assert.equal(res.processed,2);assert.equal(res.remaining,1);
});
test('non-provider destinations, credential parameters, relative traversal rejected',async()=>{
 assert.throws(()=>client({baseUrl:'https://example.com'}));assert.throws(()=>client({baseUrl:'http://api.marketstack.com'}));
 const c=client();assert.equal((await c.request('/../eod')).reason,'invalidEndpoint');assert.equal((await c.request('/eod',{access_key:'bad'})).reason,'invalidParameters');
});
test('listing identity mandatory; no symbol-only/currency/asset type inference',async()=>{
 let calls=0;const p=provider(async()=>{calls++;});assert.equal((await p.getDailyBars('SAP')).reason,'symbolUnmapped');assert.equal(calls,0);
 const bad=provider(async()=>{}, {mappings:{sap:{symbol:'SAP.DE'}}});assert.equal((await bad.getDailyBars('sap')).reason,'incompleteListingIdentity');
 assert.equal(assetType('ETF'),null);assert.equal(assetType('Fund'),null);assert.equal(assetType('Preferred Stock'),'preferred_equity');
});
test('canonical normalization preserves raw+adjusted/currency/freshness and rejects bad bars',()=>{
 const good=normalizeBar('sap',row,mapping,{retrievedAt:'2026-10-01T10:00:00Z'});assert.equal(good.ok,true);assert.equal(good.bar.currency,'EUR');assert.equal(good.bar.close,208);assert.equal(good.bar.adjustedClose,null);assert.equal(good.bar.adjustmentObservation.close,104);assert.equal(good.bar.adjustmentStatus,'unknown');assert.equal(good.bar.delay_state,'EOD_ONLY');
 for(const bad of [{close:0},{low:220},{volume:-1},{adj_close:-2},{date:'2026-02-30'},{split_factor:0}])assert.equal(normalizeBar('sap',{...row,...bad},mapping).ok,false);
 assert.equal(normalizeBar('sap',{...row,price_currency:'USD'},mapping).reason,'currencyMismatch');
 assert.equal(normalizeBar('sap',{...row,exchange:'XNYS'},mapping).reason,'exchangeMismatch');
});
test('provider sorts/dedupes, rejects mixed venue, exposes anomalies, caches actions',async()=>{
 let calls=0;const p=provider(async()=>{calls++;return response({data:[row,row,{...row,date:'2026-09-29',close:0}]});});
 const res=await p.getDailyBars('sap');assert.equal(res.available,true);assert.equal(res.data.bars.length,1);assert.equal(res.data.anomalies.length,2);
 const actions=await p.getCorporateActions('sap');assert.equal(actions.data.length,2);assert.equal(actions.data[0].announcedAt,null);assert.equal(calls,1);
 const invalid=provider(async()=>response({data:[row,{...row,price_currency:'USD'}]}));assert.equal((await invalid.getDailyBars('sap')).reason,'identityMismatch');
});
test('LSE pence cannot silently become GBP',async()=>{
 const p=provider(async()=>response({data:[{...row,symbol:'SHEL.L',exchange:'XLON',price_currency:'GBX'}]}),{mappings:{shell:{...mapping,symbol:'SHEL.L',exchange:'XLON',currency:'GBP'}}});
 assert.equal((await p.getDailyBars('shell')).reason,'identityMismatch');
});
test('quotes preserve EOD and intraday UNKNOWN delay, no LIVE claim',async()=>{
 const p=provider(async()=>response({data:[row]}));assert.equal((await p.getQuote('sap')).data.delay_state,'EOD_ONLY');
 const i=provider(async()=>response({data:[{...row,symbol:'SAP-DE',exchange:'IEXG',marketstack_last:209}]}),{mappings:{sap:{...mapping,intradayExchange:'IEXG'}}});const quote=await i.getQuote('sap',{frequency:'INTRADAY'});assert.equal(quote.data.last,209);assert.equal(quote.data.delay_state,'UNKNOWN');
 assert.equal(p.capabilities.sets.market.realtime,null);
});
test('snapshot venue/currency and multi-match ambiguity are gated',async()=>{
 const good=provider(async()=>response({data:[{ticker:'SAP.DE',exchange_code:'XETR',currency:'EUR',price:'209.5',trade_last:'2026-10-01T10:00:00Z'}]}));assert.equal((await good.getQuote('sap',{frequency:'SNAPSHOT'})).data.last,209.5);
 const bad=provider(async()=>response({data:[row,row]}));assert.equal((await bad.getQuote('sap')).reason,'ambiguousListing');
});

test('HTTP200 internal errors retry without billing or secret claims',async()=>{let calls=0;const c=client({fetchImpl:async()=>++calls===1?response({error:{code:'internal_error'}}):response({data:[]})});assert.equal((await c.request('/exchanges')).ok,true);assert.equal(c.stats().requestsAttempted,2);});

test('official numeric code plus type errors classify entitlement and terminal quotas',async()=>{
 for(const type of ['usage_limit_reached','daily_limit_reached','fair_use_limit_reached','fairuse_limit_reached']) {
  let calls=0;const c=client({fetchImpl:async()=>{calls++;return response({error:{code:104,type,info:'TESTKEY-MARKETSTACK-NEVER-LOG'}},429);}});
  assert.equal((await c.request('/eod')).reason,'quotaExceeded');assert.equal(calls,1);
 }
 const c=client({fetchImpl:async()=>response({error:{code:105,type:'function_access_restricted'}},403)});
 assert.equal((await c.request('/company_facts')).reason,'entitlementRestricted');
 let calls=0;const r=client({fetchImpl:async()=>++calls===1?response({error:{code:106,type:'rate_limit_reached'}},429):response({data:[]})});
 assert.equal((await r.request('/exchanges')).ok,true);assert.equal(calls,2);
 let attempts=0;const i=client({fetchImpl:async()=>++attempts===1?response({error:{code:0,type:'internal_error'}},500):response({data:[]})});assert.equal((await i.request('/exchanges')).ok,true);assert.equal(attempts,2);
});
test('metadata normalizes direct singular and wrapped plural exchange responses',async()=>{
 for(const payload of [{name:'SAP SE',symbol:'SAP.DE',isin:'DE0007164600',item_type:'equity',stock_exchange:{mic:'XETR'}},{data:{name:'SAP SE',symbol:'SAP.DE',stock_exchanges:[{mic:'XETR'}]}}]) {
  const p=provider(async()=>response(payload));const meta=await p.getMetadata('sap');assert.equal(meta.available,true);assert.equal(meta.data.name,'SAP SE');assert.equal(meta.data.currency,'EUR');assert.equal(meta.data.assetType,'equity');
 }
 const p=provider(async()=>response({name:'Wrong',symbol:'SAP',stock_exchange:{mic:'XNYS'}}));assert.equal((await p.getMetadata('sap')).reason,'symbolMismatch');
});

test('intraday trading date uses exchange timezone including DST and midnight',()=>{
 const us={...mapping,symbol:'AAPL',exchange:'XNAS',currency:'USD',timezone:'America/New_York',intradayExchange:'IEXG'};
 const late={...row,symbol:'AAPL',exchange:'IEXG',price_currency:'USD',date:'2026-10-01T00:00:00Z'};
 assert.equal(normalizeBar('aapl',late,us,{frequency:'INTRADAY'}).bar.date,'2026-09-30');
 const winter={...late,date:'2026-01-03T01:00:00Z'};assert.equal(normalizeBar('aapl',winter,us,{frequency:'INTRADAY'}).bar.date,'2026-01-02');
 assert.equal(normalizeBar('sap',row,mapping,{frequency:'INTRADAY'}).reason,'intradayVenueUnmapped');
 assert.equal(normalizeBar('sap',row,{...mapping,timezone:'Europe/Berlin',intradayExchange:'XETR'},{frequency:'INTRADAY'}).bar.date,'2026-09-30');
});

test('company ratings documented endpoint throttle is independent of global pacing',async()=>{
 let clock=0,waits=[];const c=client({cacheTtlMs:0,now:()=>clock,sleep:async ms=>{waits.push(ms);clock+=ms;},fetchImpl:async()=>response({data:[]})});
 await c.request('/companyratings',{ticker:'AAPL'});await c.request('/companyratings',{ticker:'MSFT'});assert.deepEqual(waits,[60000]);assert.equal(c.stats().requestsAttempted,2);
});

test('measured nested venue ticker response paginates and 200 domain errors are unavailable',async()=>{
 const c=client({fetchImpl:async url=>{const offset=Number(new URL(url).searchParams.get('offset'));return response({pagination:{offset,count:1,total:2},data:{mic:'XETR',tickers:[{symbol:offset?'SIE.DE':'SAP.DE'}]}});}});
 const list=await c.paginate('/exchanges/XETR/tickers',{limit:1});assert.equal(list.complete,true);assert.equal(list.data.length,2);
 const missing=client({fetchImpl:async()=>response({code:404,message:'error',details:'No data is available for this ticker at the moment.'})});
 const result=await missing.request('/etfholdings',{ticker:'SPY'});assert.equal(result.ok,false);assert.equal(result.reason,'dataUnavailable');assert.equal(result.providerErrorCode,404);
});
test('symbol accounting separates unique request symbols from retry/page units',async()=>{
 let calls=0;const c=client({fetchImpl:async()=>++calls===1?response({},503):response({data:[]})});
 await c.request('/eod',{symbols:'NVDA,AAPL'});await c.request('/intraday',{symbols:'NVDA'});assert.equal(c.stats().symbolsProcessed,2);assert.equal(c.stats().symbolRequestUnits,5);
});
test('explicit IEX source mapping leaves canonical Nasdaq listing identity intact',async()=>{
 const us={...mapping,symbol:'NVDA',exchange:'XNAS',mic:'XNAS',currency:'USD',timezone:'America/New_York',intradayExchange:'IEXG'};
 let exchange=null;const p=provider(async url=>{exchange=new URL(url).searchParams.get('exchange');return response({data:[{...row,symbol:'NVDA',exchange:'IEXG',price_currency:'USD',date:'2026-09-30T00:00:00Z'}]});},{mappings:{nvda:us},intradayBarsVerified:true});
 const res=await p.getIntradayBars('nvda');assert.equal(res.available,true);assert.equal(exchange,'IEXG');assert.equal(res.data.bars[0].sourceVenue,'IEXG');assert.equal(res.data.bars[0].date,'2026-09-29');assert.equal(res.provenance.listing_exchange,'XNAS');assert.equal(res.provenance.provider_exchange,'IEXG');
 const unmapped=provider(async()=>{throw Error('must not request');},{mappings:{nvda:{...us,intradayExchange:null}}});assert.equal((await unmapped.getIntradayBars('nvda')).reason,'intradayVenueUnmapped');
});

test('measured session snapshots cannot enter technical interval bars by default',async()=>{
 const us={...mapping,symbol:'NVDA',exchange:'XNAS',currency:'USD',timezone:'America/New_York',intradayExchange:'IEXG'};
 const p=provider(async()=>{throw Error('must not request unverified candles');},{mappings:{nvda:us}});assert.equal((await p.getIntradayBars('nvda')).reason,'intradayBarSemanticsUnverified');
 const q=provider(async()=>response({data:[{symbol:'NVDA',exchange:'IEXG',date:'2026-09-29T17:15:00+0000',open:231.07,high:232.815,low:229.05,close:228.86,volume:1428319,marketstack_last:229.275}]}),{mappings:{nvda:us}});
 const quote=await q.getQuote('nvda',{frequency:'INTRADAY'});assert.equal(quote.data.last,229.275);assert.equal(quote.data.previousClose,228.86);assert.equal(quote.data.priceKind,'REFERENCE');
 const unavailable=provider(async()=>response({data:[{symbol:'NVDA',exchange:'IEXG',date:'2026-09-29T21:30:00+0000',close:227.8,marketstack_last:null,last:null}]}),{mappings:{nvda:us}});assert.equal((await unavailable.getQuote('nvda',{frequency:'INTRADAY'})).reason,'invalidQuote');
});
test('attempt reservations persist before fetch and failed accounting blocks network',async()=>{let saved,calls=0;const c=client({onAttempt:r=>{saved=r;},fetchImpl:async()=>{assert.equal(saved.estimatedCreditsConsumed,20);calls++;return response({data:[]});}});await c.request('/etfholdings',{ticker:'VOO'});assert.equal(calls,1);const broken=client({onAttempt:()=>{throw Error('disk failed');},fetchImpl:async()=>{calls++;}});assert.equal((await broken.request('/exchanges')).reason,'accountingPersistenceFailed');assert.equal(calls,1);});

test('currency case normalization preserves GBP versus GBp numerical units',async()=>{
 assert.equal(normalizeCurrency('usd'),'USD');assert.equal(normalizeCurrency('gbp'),'GBP');assert.equal(normalizeCurrency('GBp'),'GBX');assert.equal(normalizeCurrency('GBX'),'GBX');assert.equal(normalizeCurrency('US Dollar'),null);
 const us={...mapping,symbol:'AAPL',exchange:'XNAS',currency:'USD'};const usRow={...row,symbol:'AAPL',exchange:'XNAS',price_currency:'usd'};
 assert.equal(normalizeBar('aapl',usRow,us).bar.currency,'USD');assert.equal(normalizeBar('aapl',usRow,{...us,currency:'usd'}).bar.currency,'USD');
 const gb={...mapping,symbol:'SHEL.L',exchange:'XLON',currency:'GBP'};const penceRow={...row,symbol:'SHEL.L',exchange:'XLON',price_currency:'GBp',open:2500,high:2600,low:2400,close:2550};
 assert.equal(normalizeBar('shell',penceRow,gb).reason,'currencyMismatch');const pence=normalizeBar('shell',penceRow,{...gb,currency:'GBX'});assert.equal(pence.bar.currency,'GBX');assert.equal(pence.bar.close,2550);
 const p=provider(async()=>response({data:[usRow]}),{mappings:{aapl:{...us,currency:'usd'}}});assert.equal((await p.getDailyBars('aapl')).data.currency,'USD');
});

test('verified local preferred equity is not globally excluded or inferred from generic preferred labels',async()=>{
 const preferred={...mapping,symbol:'HEN3.DE',isin:'DE0006048432',assetType:'preferred_equity',shareClassVerified:true};
 const p=provider(async()=>response({data:[{...row,symbol:'HEN3.DE',asset_type:'Stock'}]}),{mappings:{henkel:preferred}});
 assert.equal((await p.getDailyBars('henkel')).data.assetType,'preferred_equity');
 const unverified=provider(async()=>{assert.fail('must not request');},{mappings:{henkel:{...preferred,shareClassVerified:false}}});
 assert.equal((await unverified.getDailyBars('henkel')).reason,'shareClassUnverified');assert.equal(assetType('Hybrid Security'),null);assert.equal(typeof p.getETFHoldings,'undefined');
});
test('price identity requires returned symbol and venue; ISIN mismatch and unverified currency block',async()=>{
 assert.equal(normalizeBar('sap',{...row,exchange:'XETR',exchange_code:'XNYS'},mapping).reason,'exchangeMismatch');
 assert.equal(normalizeBar('sap',{...row,exchange:'XNYS',exchange_code:'XETR'},mapping).reason,'exchangeMismatch');
 for(const [patch,expected] of [[{symbol:null},'symbolMissing'],[{exchange:null},'exchangeMissing'],[{isin:'US8030542042'},'isinMismatch']])assert.equal(normalizeBar('sap',{...row,...patch},mapping).reason,expected);
 const unverified=provider(async()=>{assert.fail('must not request');},{mappings:{sap:{...mapping,currencyVerified:false}}});assert.equal((await unverified.getQuote('sap')).reason,'listingIdentityUnverified');
});
test('missing row currency is marked as verified metadata derivation and never converted silently',()=>{
 const b=normalizeBar('sap',{...row,price_currency:null},mapping).bar;assert.equal(b.currencyProvenance.kind,'VERIFIED_LISTING_DERIVATION');assert.equal(b.currencyProvenance.source,mapping.currencySource);assert.equal(b.close,row.close);
});
test('invalid bars and duplicates remain visible blockers for technical admission',async()=>{
 const p=provider(async()=>response({data:[row,row,{...row,date:'2026-09-29',close:0}]}));const r=await p.getDailyBars('sap');assert.equal(r.data.qualityStatus,'PARTIAL');assert.equal(r.data.technicalAdmission,'BLOCKED');assert.equal(r.data.quarantinedSourceRows.length,1);
});
test('a global adjustment switch cannot certify provider fields or apply a second split adjustment',()=>{
 const unverified=normalizeBar('sap',row,mapping,{adjustmentVerified:true}).bar;assert.equal(unverified.adjustedClose,null);assert.equal(unverified.close,208);assert.equal(unverified.volume,1000);
 const verified={...mapping,adjustmentEvidence:{verified:true,source:'independent adjustment fixture',from:'2026-09-01',to:'2026-09-30',ohlcBasis:'SPLIT_AND_DIVIDEND_ADJUSTED'}};
 assert.equal(normalizeBar('sap',row,verified).bar.adjustedClose,104);assert.equal(normalizeBar('sap',{...row,date:'2026-10-01'},verified).bar.adjustedClose,null);
});
test('real client fixes v2 and asynchronous persistence completes before fetch',async()=>{
 assert.throws(()=>client({baseUrl:'https://api.marketstack.com/v1'}),/version must remain v2/);
 let persisted=false;const c=client({onAttempt:async()=>{await new Promise(r=>setTimeout(r,1));persisted=true;},fetchImpl:async()=>{assert.equal(persisted,true);return response({data:[]});}});
 const r=await c.request('/eod');assert.equal(r.apiVersion,'v2');assert.equal(r.endpoint,'/eod');
});

 test('adapter rejects noncanonical/US-colliding local IDs, invalid ISINs and venue identity',async()=>{
  for(const patch of [{securityId:'ref_SAP'},{listingId:'listing_sap_xetr'},{isin:'DE0007164601'},{mic:'BAD'},{exchange:'XNYS'},{security_id:'ref_SAP'},{listing_id:'legacy_us_listing'}]){
   const p=createMarketstackProvider({client:client({fetchImpl:async()=>{assert.fail('bad identity must not send');}}),mappings:{sap:{...mapping,...patch}}});
   const result=await p.getQuote('sap');assert.equal(result.available,false);assert.match(result.reason,/invalidCanonicalListingIdentity|exchangeMicMismatch|conflictingIdentityAliases/);
  }
 });

test('empty singular ticker metadata is unavailable, malformed nonempty arrays remain invalid',async()=>{
 for(const payload of [[],{data:[]}]) assert.equal((await provider(async()=>response(payload)).getMetadata('sap')).reason,'dataUnavailable');
 for(const payload of [[{symbol:'SAP.DE'}],{data:[{symbol:'SAP.DE'}]}]) assert.equal((await provider(async()=>response(payload)).getMetadata('sap')).reason,'invalidResponse');
});

test('documented ticker not-found response is unavailable and never retried',async()=>{
 let calls=0;const c=client({maxRetries:2,fetchImpl:async()=>{calls++;return response({error:{code:'not_found_error',message:'No ticker metadata'}},404);}});
 const result=await c.request('/tickers/NO-SUCH.DE');assert.equal(result.reason,'dataUnavailable');assert.equal(result.status,404);assert.equal(calls,1);assert.equal(c.stats().retries,0);
});
