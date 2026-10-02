import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Service=require('../api/product-services.js'),Policy=require('../engines/display-policy.js'),Query=require('../engines/query.js');
const root=new URL('../../',import.meta.url);
function api(mutate=()=>{}){return Service.create({loadJSON:async path=>{const data=JSON.parse(await readFile(new URL(path.slice(1),root),'utf8'));mutate(path,data);return data;},displayPolicy:Policy,queryEngine:Query});}
test('broad stock projection carries the canonical issuer instead of dropping the company identity',async()=>{
 const shard=JSON.parse(await readFile(new URL('quant/data/universe/instruments/TS.json',root),'utf8')),canonical=shard.instruments.find(i=>i.symbol==='TSLA');
 assert.ok(canonical.issuerId);
 const stock=await api().getStockIntelligence('TSLA');
 assert.equal(stock.issuerId,canonical.issuerId);assert.equal(stock.instrumentId,canonical.instrumentId);assert.equal(stock.masterMemberId,canonical.masterMemberId);
});
test('a broad capability cannot silently point the stock to a different canonical listing or security',async()=>{
 for(const field of ['m','i']){
  const stock=await api((p,d)=>{if(p.endsWith('market-capability.json'))d.members.find(m=>m.s==='TSLA')[field]=field==='m'?'ref_AAPL':'vu_another_listing';}).getStockIntelligence('TSLA');
  assert.equal(stock.state,'UNAVAILABLE');assert.equal(stock.reason,'INVALID_IDENTITY');
 }
});
for(const count of [2,4,5])test(`${count} real price points keep quotes available and enforce the five-point stock chart gate`,async()=>{
 const service=api((p,d)=>{
  if(p==='/quant/data/market/golden-preview/daily/ref_TSLA.json')throw Error('compact source only');
  if(p==='/quant/data/market/discover-series/ref_TSLA.json'){d.points=d.points.slice(-count);d.from=d.points[0][0];}
 });
 const history=await service.getHistoricalPriceHistory('TSLA');assert.equal(history.state,'AVAILABLE');assert.equal(history.bars.length,count);
 const stock=await service.getStockIntelligence('TSLA');assert.equal(stock.state,'AVAILABLE');assert.equal(stock.price.state,'AVAILABLE');assert.ok(stock.price.value>0);
 assert.equal(stock.chart.state,count>=5?'AVAILABLE':'UNAVAILABLE');
 if(count<5){assert.equal(stock.chart.reason,'INSUFFICIENT_CHART_HISTORY');assert.deepEqual(stock.chart.bars,[]);}
});
