import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {gzipSync,gunzipSync} from 'node:zlib';
import {projectQuarterly} from '../../scripts/vu2/build-release.mjs';
const require=createRequire(import.meta.url),History=require('../api/fundamentals-contract.js'),Service=require('../api/product-services.js'),Policy=require('../engines/display-policy.js'),Query=require('../engines/query.js');
const root=new URL('../../',import.meta.url),load=async p=>JSON.parse(await readFile(new URL(p.replace(/^\//,''),root),'utf8'));
const source=await load('quant/data/sec/consumer/CIK0001318605.json'),projected=projectQuarterly(source);
const options={ticker:'TSLA',name:'Tesla',cik:'0001318605',securityId:'vu_abc',masterMemberId:'ref_TSLA',period:'quarterly'};
test('projection preserves existing standalone quarter facts and excludes annual/TTM payloads',()=>{
 assert.equal(projected.annual,undefined);assert.equal(projected.ttm,undefined);assert.equal(projected.calendar,undefined);
 const decoded=JSON.parse(gunzipSync(gzipSync(JSON.stringify(projected))));
 for(const [metric,rows] of Object.entries(decoded.quarterly)){
  assert.deepEqual(rows,source.quarterly[metric]);assert.equal(decoded.units[metric],source.units[metric]);
  const view=History.buildQuarterly(decoded,{...options,metric});assert.equal(view.state,'AVAILABLE',metric);assert.equal(view.pitEligibility,'NOT_CERTIFIED');assert.equal(view.availabilityPrecision,'FILING_DATE');
  assert.deepEqual(view.rows.map(r=>[r.fiscalYear,r.fiscalPeriod,r.end,r.value,r.filed,r.accession,Number(r.derived)]),rows);
 }
});
test('quarterly identity, time, unit, period and provenance errors fail closed',()=>{
 for(const mutate of [x=>x.cik='0000000001',x=>x.dataSource.isMock=true,x=>x.asOf='2099-01-01',x=>x.generatedAtUtc='2099-01-01T00:00:00Z',x=>x.columns.reverse(),x=>x.semantics.quarterly='YTD',x=>x.quarterly.revenue.push(x.quarterly.revenue[0]),x=>x.quarterly.revenue[0][3]=null,x=>x.quarterly.revenue[0][4]='2099-01-01',x=>x.quarterly.revenue[0][1]='FY',x=>x.quarterly.revenue[0][6]=2,x=>x.units.revenue='unknown']){const x=structuredClone(projected);mutate(x);assert.equal(History.buildQuarterly(x,options).state,'UNAVAILABLE');}
 assert.equal(History.buildQuarterly(projected,{...options,period:'ttm'}).reason,'INVALID_SELECTION');
});
test('presentation preserves reported currency and upstream derived flags without calculating',()=>{
 const x=structuredClone(projected);x.units.revenue='EUR';x.quarterly.revenue[0][6]=1;const result=History.buildQuarterly(x,options);
 assert.equal(result.metric.unit,'EUR');assert.equal(result.rows[0].value,x.quarterly.revenue[0][3]);assert.equal(result.rows[0].derived,true);assert.equal(result.rows[0].transformation,'PRECOMPUTED_DERIVED_QUARTER');
});
test('product service resolves canonical issuer before one release artifact; annual and TTM semantics stay separate',async()=>{
 const compressedReads=[],jsonReads=[];
 const api=Service.create({loadJSON:async p=>{jsonReads.push(p);return load(p);},loadCompressedJSON:async p=>{compressedReads.push(p);return projected;},displayPolicy:Policy,queryEngine:Query});
 const result=await api.getHistoricalFundamentals('TSLA',{period:'quarterly'});
 assert.equal(result.state,'AVAILABLE');assert.deepEqual(compressedReads,['/quant/data/sec/quarterly/CIK0001318605.json.gz']);assert.ok(!jsonReads.some(p=>p.includes('/discover/')));
 const annual=await api.getHistoricalFundamentals('TSLA');assert.equal(annual.state,'AVAILABLE');assert.ok(jsonReads.includes('/discover/data/stocks/US_REAL/TSLA.json'));
 assert.equal((await api.getHistoricalFundamentals('TSLA',{period:'ttm'})).state,'UNAVAILABLE');assert.equal(compressedReads.length,1);
 assert.equal((await api.getHistoricalFundamentals('NOT_VALID!',{period:'quarterly'})).reason,'INVALID_IDENTITY');assert.equal(compressedReads.length,1);
});
test('release projection cannot publish mock or unrelated canonical sources',()=>{
 for(const mutate of [x=>x.dataSource.isMock=true,x=>x.schema='other',x=>x.cik='../secret',x=>x.columns=['value']]){const x=structuredClone(source);mutate(x);assert.throws(()=>projectQuarterly(x),/INVALID_QUARTERLY_SOURCE/);}
});
test('production loader decompresses one same-origin artifact and rejects oversized expansion',async()=>{
 const original=globalThis.fetch,reads=[];
 try{
  globalThis.fetch=async(url,options)=>{reads.push({url,options});return new Response(gzipSync(JSON.stringify(projected)));};
  const api=Service.create({loadJSON:load,displayPolicy:Policy,queryEngine:Query});
  assert.equal((await api.getHistoricalFundamentals('TSLA',{period:'quarterly'})).state,'AVAILABLE');
  assert.equal(reads.length,1);assert.equal(reads[0].url,'/quant/data/sec/quarterly/CIK0001318605.json.gz');assert.equal(reads[0].options.credentials,'omit');
  globalThis.fetch=async()=>new Response(gzipSync(' '.repeat(1048577)));
  assert.equal((await api.getHistoricalFundamentals('TSLA',{period:'quarterly'})).state,'UNAVAILABLE');
  globalThis.fetch=async()=>new Response('not compressed');
  assert.equal((await api.getHistoricalFundamentals('TSLA',{period:'quarterly'})).state,'UNAVAILABLE');
 }finally{globalThis.fetch=original;}
});
test('future-dated share facts are withheld by the same validator, never repaired or leaked',async()=>{
 for(const cik of ['0000006201','0000006207','0001056943','0001754170']){
  const original=await load('quant/data/sec/consumer/CIK'+cik+'.json'),before=JSON.stringify(original),projection=projectQuarterly(original);
  assert.equal(projection.quarterly.shares_outstanding,undefined);assert.equal(projection.unavailableMetrics.shares_outstanding,'INVALID_FACT_EVIDENCE');assert.equal(JSON.stringify(original),before);
  assert.equal(History.buildQuarterly(projection,{...options,cik,metric:'shares_outstanding'}).reason,'INVALID_FACT_EVIDENCE');
  assert.ok(Object.keys(projection.quarterly).length>0,'unrelated valid metrics must remain available');
 }
});
