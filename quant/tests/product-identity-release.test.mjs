import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Service=require('../api/product-services.js'),Policy=require('../engines/display-policy.js'),Query=require('../engines/query.js');
const root=new URL('../../',import.meta.url);
function api(mutate=()=>{},reads=[]){return Service.create({loadJSON:async path=>{reads.push(path);const data=JSON.parse(await readFile(new URL(path.slice(1),root),'utf8'));mutate(path,data);return data;},displayPolicy:Policy,queryEngine:Query});}
test('all approved product rows use existing stable Company Master IDs across stock and screener',async()=>{
 const service=api(),universe=await service.getUniverse(),screen=await service.screen(Query.createQuery({}));
 assert.equal(universe.stocks.length,5);
 for(const row of universe.stocks){
  const shard=JSON.parse(await readFile(new URL('quant/data/universe/instruments/'+row.ticker.slice(0,2)+'.json',root),'utf8'));
  const canonical=shard.instruments.find(i=>i.symbol===row.ticker);
  assert.equal(row.securityId,canonical.instrumentId);assert.equal(row.masterMemberId,canonical.masterMemberId);assert.equal(row.issuerId,canonical.issuerId);
  assert.equal(screen.stocks.find(s=>s.ticker===row.ticker).securityId,canonical.instrumentId);
  const stock=await service.getStockIntelligence(row.ticker);assert.equal(stock.securityId,canonical.instrumentId);assert.equal(stock.quant.state,'AVAILABLE');assert.equal(stock.chart.state,'AVAILABLE');
 }
});
test('missing, excluded, unknown or mismatched canonical identity fails before market-history consumption',async()=>{
 for(const mutate of [i=>{i.productEligibility='EXCLUDED';},i=>{i.productEligibility='UNKNOWN';},i=>{i.legacyIds=[];},i=>{i.instrumentId='sec_NVDA';},i=>{i.symbol='OTHER';}]){
  const reads=[],service=api((path,data)=>{if(path.endsWith('/instruments/NV.json'))mutate(data.instruments.find(i=>i.symbol==='NVDA'));},reads);
  assert.equal((await service.getStockIntelligence('NVDA')).state,'UNAVAILABLE');
  assert.equal((await service.getHistoricalFundamentals('NVDA')).state,'UNAVAILABLE');
  assert.equal((await service.getTechnicalWorkspace('NVDA')).state,'UNAVAILABLE');
  assert.ok(!reads.some(p=>p.includes('/daily/')||p.includes('/technical/instruments/')));
 }
});
test('source aliases and historical issuer evidence cannot be silently reassigned',async()=>{
 const badPanel=api((p,d)=>{if(p.endsWith('quant-factor-inputs.json'))d.securities.NVDA.securityId='sec_MSFT';});
 assert.equal((await badPanel.getStockIntelligence('NVDA')).state,'UNAVAILABLE');
 const badIssuer=api((p,d)=>{if(p.endsWith('inspector_index.json'))d.companies.find(c=>c.ticker==='NVDA').cik='0000789019';});
 assert.equal((await badIssuer.getHistoricalFundamentals('NVDA')).reason,'INVALID_IDENTITY');
});
