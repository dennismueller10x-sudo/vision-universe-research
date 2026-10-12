import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url), Core=require('../europe-market-data.js'),now='2026-10-10T07:00:00Z',H='a'.repeat(64);
function fixture(){
 const points=[];for(let date=new Date('2026-09-01T00:00:00Z');date<=new Date('2026-10-09T00:00:00Z');date.setUTCDate(date.getUTCDate()+1))if(![0,6].includes(date.getUTCDay()))points.push([date.toISOString().slice(0,10),100+points.length]);
 const s={region:'EUROPE',companyId:'LEI:example',securityId:'ref_EXAMPLE_DE_XETR',primaryListingId:'marketstack:XETR:EXAMPLE.DE',isin:'DE0000000001',acceptance:'DISCOVER_ONLY',identity:{status:'VERIFIED'},name:'Example AG',ticker:'EXAMPLE.DE'};
 const l={listingId:s.primaryListingId,mic:'XETR',providerSymbol:s.ticker,ticker:s.ticker,currency:'EUR',country:'DE',latest:{date:'2026-10-09',status:'LAST_VALID_SESSION'},history:{valid:true,observations:points.length},priceQuality:{status:'VALIDATED',evidenceRef:H,volumeValid:false},adjustment:{status:'ADJUSTMENT_UNKNOWN'}};
 const bind={companyId:s.companyId,securityId:s.securityId,listingId:l.listingId,mic:l.mic,providerSymbol:l.providerSymbol,currency:l.currency,isin:s.isin};
 l.identityAdmission={...bind,version:'europe-discover-identity-2.0.0',status:'UNIVERSE_IDENTITY_READY',assetType:'EQUITY',issuerCountry:'DE',issuerBinding:'VERIFIED_LEGAL_ISSUER',securityKey:'ISIN:'+s.isin,active:true,localListingPlausible:true,duplicateResolved:true,evidenceRefs:[{sha256:H,verified:true}]};
 l.discoverChart={...bind,version:'europe-discover-close-chart-1',chartStatus:'CHART_LIMITED',evidenceRef:{sha256:H,verified:true},pointsSha256:createHash('sha256').update(JSON.stringify(points)).digest('hex'),sourceInputSha256:H,immutableExclusionsSha256:H,evaluatedAt:now,observationCount:points.length,firstDate:points[0][0],lastDate:points.at(-1)[0],sessionLag:0,calendarSource:{sha256:H},calendarSourceSha256:H,calendarProof:{evaluatedAt:now,verified:true,mic:'XETR',sourceSha256:H,coverageFrom:'2025-01-01',coverageTo:'2026-12-31',expectedLastCompletedSession:'2026-10-09',nextScheduledSession:{date:'2026-10-12',close:'2026-10-12T15:30:00Z'}},priceBasis:'RAW_UNADJUSTED',currency:'EUR',quoteUnit:'EUR',quoteBasis:{...bind,kind:'OFFICIAL_LISTING_QUOTE_REFERENCE',sourceSha256:H,quoteUnit:'EUR'},reasonCodes:[],criticalIssues:[],segments:[points.slice(0,10),points.slice(10)]};s.listings=[l];
 return {s,l,points,catalog:{securities:[s]},ref:{region:'EUROPE',securityId:s.securityId}};
}
function client(f,options={}){return Core.create({catalog:f.catalog,usClient:{},audience:'research',now,loadSeries:async r=>({securityId:f.s.securityId,listingId:f.l.listingId,basis:r.basis,currency:'EUR',points:f.points,segments:f.l.discoverChart.segments,provenance:{evidenceRef:H}}),...options});}
test('Review-derived security exposes identity, Close chart and basic screener independently of strict analytics',async()=>{
 const f=fixture(),c=client(f),r=(await c.getReadiness(f.ref)).data;assert.equal(r.DISCOVER_ELIGIBLE,true);assert.equal(r.QUANT_READY,false);assert.equal(r.TECHNICAL_READY,false);assert.equal(r.SUPERTRADER_READY,false);assert.equal(r.BACKTEST_READY,false);
 assert.equal((await c.getPriceSeries(f.ref)).state,'AVAILABLE');assert.equal((await c.getBaseScreenerRow(f.ref)).state,'AVAILABLE');assert.equal((await c.getScreenerRow(f.ref)).state,'UNAVAILABLE');assert.equal((await c.getTechnicalData(f.ref)).state,'UNAVAILABLE');assert.equal((await c.getQuantData(f.ref)).data.score,null);assert.equal((await c.search(f.s.isin)).data.results.length,1);
});
test('hashed valid Close evidence prevents cache/provider-point corruption and preserves quarantined-gap segments',async()=>{
 const f=fixture();let result=await client(f).getPriceSeries(f.ref);assert.deepEqual(result.data.segments,f.l.discoverChart.segments);f.points=f.points.map(p=>[...p]);f.points[1][1]+=1;result=await client(f).getPriceSeries(f.ref);assert.equal(result.reason,'CLOSE_SERIES_INTEGRITY_MISMATCH');
});
test('older ranges require independent proof and public display stays closed',async()=>{
 const f=fixture();assert.equal((await client(f).getPriceSeries(f.ref,{range:'MAX'})).reason,'CHART_RANGE_NOT_VALIDATED');assert.equal((await client(f,{audience:'public'}).getPriceSeries(f.ref)).reason,'DISPLAY_RIGHTS_UNCONFIRMED');assert.equal((await client(f).getReadiness(f.ref)).data.publicTier,0);
});
test('canonical watchlist add/save/reload/remove does not touch legacy US storage and blocked identity is excluded',()=>{
 const f=fixture(),data=new Map([['legacy.US','original']]),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};const a=Core.createWatchlist({catalog:f.catalog,storage});a.add(f.s.securityId);a.save();const b=Core.createWatchlist({catalog:f.catalog,storage});assert.deepEqual(b.reload(),[f.s.securityId]);b.remove(f.s.securityId);b.save();assert.equal(data.get('legacy.US'),'original');f.l.identityAdmission.status='BLOCKED';assert.throws(()=>Core.createWatchlist({catalog:f.catalog,storage}).add(f.s.securityId),/CANONICAL_ID_NOT_ACCEPTED/);
});
test('US client and canonical IDs preserved; protected collision fails closed',async()=>{
 const f=fixture(),ref={region:'US',securityId:'ref_AAPL'},answer={value:'existing Tiingo response'},calls=[];const c=client(f,{usClient:{getPriceSeries:function(...a){calls.push(a);return answer;}}});assert.strictEqual(await c.getPriceSeries(ref,{range:'MAX'}),answer);assert.deepEqual(calls,[[ref,{range:'MAX'}]]);assert.throws(()=>client(f,{protectedIds:[f.s.securityId]}),/INVALID_EUROPE_CATALOG_IDENTITY/);
});
test('lazy MAX segments are hash-bound without copying long point arrays into the catalog',async()=>{
 const f=fixture(),segments=f.l.discoverChart.segments,hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
 f.l.discoverChart.ranges={MAX:{...f.l.discoverChart,segments:undefined,segmentsSha256:hash(segments)}};
 const c=client(f,{loadSeries:async r=>({securityId:f.s.securityId,listingId:f.l.listingId,basis:r.basis,currency:'EUR',points:f.points,segments,provenance:{evidenceRef:H}})});
 const result=await c.getPriceSeries(f.ref,{range:'MAX'});assert.equal(result.state,'AVAILABLE');assert.deepEqual(result.data.segments,segments);assert.equal((await c.getReadiness(f.ref)).data.QUANT_READY,false);
 const forged=[f.points];const altered=client(f,{loadSeries:async r=>({securityId:f.s.securityId,listingId:f.l.listingId,basis:r.basis,currency:'EUR',points:f.points,segments:forged,provenance:{evidenceRef:H}})});assert.equal((await altered.getPriceSeries(f.ref,{range:'MAX'})).reason,'CLOSE_CHART_SEGMENT_INTEGRITY_MISMATCH');
});
test('display continuity v2 recomposes real points only and fails closed on forged segments',async()=>{
 const f=fixture(),hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex'),sourceSegments=f.l.discoverChart.segments;
 f.l.discoverChart.segmentsSha256=hash(sourceSegments);
 const window={version:'vu-discover-display-window-2',sourcePointsSha256:hash(f.points),sourceSegmentsSha256:hash(sourceSegments),calendarSha256:H,safeHistoryStart:f.points[0][0],truncated:false,visualQualityStatus:'MINOR_GAPS',chartStatus:'CHART_LIMITED',segmentStartDates:[f.points[0][0]],displaySegmentsSha256:hash([f.points])};
 f.l.discoverDisplay={version:'vu-discover-display-policy-2',ranges:{'1Y':window}};
 const valid=await client(f).getPriceSeries(f.ref);assert.equal(valid.state,'AVAILABLE');assert.deepEqual(valid.data.points,f.points);assert.deepEqual(valid.data.segments,[f.points]);assert.equal((await client(f).getReadiness(f.ref)).data.TECHNICAL_READY,false);
 window.segmentStartDates.push(f.points[10][0]);assert.equal((await client(f).getPriceSeries(f.ref)).reason,'DISPLAY_SEGMENT_INTEGRITY_MISMATCH');
});
test('MAX Close readiness never overrides independently limited one-year history',async()=>{
 const f=fixture(),hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex'),sourceSegments=f.l.discoverChart.segments;f.l.discoverChart.segmentsSha256=hash(sourceSegments);
 const base={version:'vu-discover-display-window-2',sourcePointsSha256:hash(f.points),sourceSegmentsSha256:hash(sourceSegments),calendarSha256:H,safeHistoryStart:f.points[0][0],truncated:false,visualQualityStatus:'MINOR_GAPS',segmentStartDates:[f.points[0][0]],displaySegmentsSha256:hash([f.points])};
 f.l.discoverDisplay={version:'vu-discover-display-policy-2',ranges:{'1Y':{...base,chartStatus:'CHART_LIMITED'},MAX:{...base,chartStatus:'CHART_READY'}}};
 f.l.discoverChart.ranges={MAX:{...f.l.discoverChart,segments:undefined}};
 assert.equal((await client(f).getReadiness(f.ref)).data.CHART,'CHART_LIMITED');
 assert.equal((await client(f).getPriceSeries(f.ref,{range:'MAX'})).data.chartStatus,'CHART_READY');
});
