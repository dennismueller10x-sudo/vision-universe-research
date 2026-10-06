import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {materialize,directory} from '../materialize-de-eu.mjs';
import {permitted} from '../../vu2/build-release.mjs';
const require=createRequire(import.meta.url),Core=require('../../../core/client.js'),I=require('../../../core/identity.js');
const row={isin:'DE0007164600',mic:'XETR',ticker:'SAP',name:'Synthetic canonical contract',assetType:'EQUITY',mappingStatus:'VERIFIED',mappingSource:'TEST_EXACT_ISIN_MIC',indexMemberships:[],tradingCurrency:'EUR',quoteUnit:'MAJOR',listingCountry:'DE'};
test('non-index Consumer security keeps canonical IDs and identical screener/detail/chart prices',async()=>{
 const out=mkdtempSync(join(tmpdir(),'vu-europe-consumer-'));try{
  const canonical=directory([row],'2026-10-06').listings[0],id=canonical.listingId;
  const h={isin:row.isin,mic:row.mic,currency:'EUR',quoteUnit:'MAJOR',provider:'marketstack',sourceEvidence:'TEST_RESPONSE_HASH',
   retrievedAt:'2026-10-06T12:00:00Z',points:[['2026-10-01',100.126],['2026-10-02',101.124]]};
  const input={rows:[row],histories:{[id]:h},asOf:'2026-10-06',out};materialize(input);
  const bytes=readFileSync(join(out,'core/data/de-eu/screener.json'),'utf8');materialize(input);
  assert.equal(readFileSync(join(out,'core/data/de-eu/screener.json'),'utf8'),bytes);
  const c=Core.create({load:async p=>JSON.parse(readFileSync(join(out,p),'utf8'))});
  const projected=await c.getListingScreener(),latest=await c.getListingLatestPrice(id),series=await c.getListingPriceSeries(id);
  assert.equal(projected.state,'AVAILABLE');assert.deepEqual(projected.data.listings[0].price,latest.data);
  assert.equal(latest.data.close,series.data.points.at(-1)[1]);assert.equal(latest.data.changePercent,null);
  assert.deepEqual(projected.data.listings[0].fields,{});assert.equal((await c.getListingScreener({country:'FR'})).data.listings.length,0);
  assert.equal((await c.getListingScreener({currency:'USD'})).data.listings.length,0);assert.equal((await c.getLatestPrice('SAP')).state,'UNAVAILABLE');
 }finally{rmSync(out,{recursive:true,force:true});}
});
test('consumer projection rejects US identity, currency contamination and unevidenced technical values',async()=>{
 const r={...row,listingId:I.listingIdFor(row),securityId:I.securityIdForISIN(row.isin)};
 const d={schemaVersion:'de-eu-directory-1.0.0',privateDevelopment:true,referenceAsOf:'2026-10-06',dataAsOf:'2026-10-06',listings:[r]};
 const projection={schemaVersion:'de-eu-screener-1.0.0',privateDevelopment:true,publicDisplay:false,referenceAsOf:d.referenceAsOf,dataAsOf:d.dataAsOf,listings:[{...r,price:null,fields:{}}]};
 for(const patch of [{securityId:'ref_SAP'},{price:{listingId:r.listingId,securityId:r.securityId,mic:'XETR',currency:'USD',quoteUnit:'MAJOR',date:'2026-10-02',close:1,kind:'EOD_CLOSE'}},{fields:{sma200:{status:'READY',value:0,evidence:[],asOf:'2026-10-02'}}},{fields:{sma200:{status:'READY',value:200,evidence:['TEST_ENGINE'],asOf:'2027-01-01',inputSeriesHash:'a'.repeat(64),window:{from:'2026-10-01',to:'2027-01-01'}}}}]){
  const c=Core.create({load:async p=>p===Core.PATHS.localListings()?d:{...projection,listings:[{...projection.listings[0],...patch}]}});
  assert.equal((await c.getListingScreener()).state,'UNAVAILABLE');
 }
 assert.equal(permitted('core/data/de-eu/screener.json'),false);
});
test('compact projection cannot replace canonical company, logo or index references',async()=>{
 const r={...row,listingId:I.listingIdFor(row),securityId:I.securityIdForISIN(row.isin),companyId:null,logo:{status:'EXISTING_FALLBACK'}};
 const d={schemaVersion:'de-eu-directory-1.0.0',privateDevelopment:true,referenceAsOf:'2026-10-06',dataAsOf:'2026-10-06',listings:[r]};
 const s={schemaVersion:'de-eu-screener-1.0.0',privateDevelopment:true,publicDisplay:false,referenceAsOf:d.referenceAsOf,dataAsOf:d.dataAsOf,
  listings:[{...r,name:'Wrong issuer',companyId:'ref_SAP',logo:{status:'VERIFIED_LOGO',path:'/wrong.png'},indexMemberships:['FAKE'],price:null,fields:{}}]};
 const c=Core.create({load:async p=>p===Core.PATHS.localListings()?d:s});
 assert.deepEqual((await c.getListingScreener()).data.listings[0],{...r,price:null,fields:{}});
});
