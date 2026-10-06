import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),I=require('../identity.js'),C=require('../client.js');
const isin='DE0007164600',listingId=I.listingIdFor({isin,mic:'XETR'}),securityId=I.securityIdForISIN(isin);
const row={isin,listingId,securityId,ticker:'SAP',name:'SAP SE',assetType:'EQUITY',mic:'XETR',tradingCurrency:'EUR',quoteUnit:'MAJOR',mappingStatus:'VERIFIED',mappingSource:'official-isin-mic',region:'EUROPE',indexMemberships:['DAX','EURO_STOXX_50']};
const directory={schemaVersion:'de-eu-directory-1.0.0',privateDevelopment:true,referenceAsOf:'2026-10-06',listings:[row]};
const series={schemaVersion:'de-eu-close-series-1.0.0',privateDevelopment:true,listingId,securityId,mic:'XETR',currency:'EUR',quoteUnit:'MAJOR',provider:'marketstack',basis:'PROVIDER_REPORTED_UNVERIFIED',sourceEvidence:'cached-response',asOf:'2026-10-02',expectedSession:'2026-10-05',freshness:'STALE',points:[['2026-10-01',100],['2026-10-02',101]],changeVerified:false};
function client(d=directory,s=series){return C.create({load:async p=>{if(p===C.PATHS.localListings())return d;if(p===C.PATHS.localSeries(listingId))return s;throw Error('not found');}});}
test('ISIN checksum and canonical listing/security distinction preserve US bytes',()=>{
 assert.equal(I.normalizeISIN(isin),isin);assert.equal(I.normalizeISIN('DE0007164601'),null);
 assert.equal(I.normalizeISIN('../../secret'),null);assert.equal(I.securityIdForTicker('SAP'),'ref_SAP');
 assert.equal(I.securityIdForTicker('BRK-B'),'ref_BRK_B');assert.notEqual(listingId,I.listingIdFor({isin,mic:'XFRA'}));
 assert.equal(securityId,I.securityIdForISIN(isin));assert.notEqual(securityId,I.securityIdForISIN('US8030542042'));
 assert.ok(I.isListingId(listingId));assert.ok(!I.isListingId('lst_XETR_DE0007164601'));
 assert.throws(()=>I.listingIdFor({isin,mic:'../../'}));
 assert.equal(I.companyIdForLEI('529900D6BF99LW9R2E68'),'iss_lei_529900D6BF99LW9R2E68');
 assert.throws(()=>I.companyIdForLEI('529900D6BF99LW9R2E69'));
});
test('search by name/ISIN/index and selected venue uses a single series for detail and price',async()=>{
 const c=client();assert.equal((await c.searchListings(isin)).data.listings[0].listingId,listingId);
 assert.equal((await c.getListings({index:'DAX'})).data.listings.length,1);
 assert.equal((await c.getListings({index:'MDAX'})).data.listings.length,0);
 const p=await c.getListingLatestPrice(listingId),s=await c.getListingPriceSeries(listingId);
 assert.equal(p.data.close,s.data.points.at(-1)[1]);assert.equal(p.data.currency,'EUR');assert.equal(p.data.freshness,'STALE');
 assert.equal(p.data.changePercent,null,'unverified change never appears as a metric');
 assert.equal((await c.getLatestPrice('SAP')).state,'UNAVAILABLE','no EU data on US route');
 assert.equal((await c.getListing('SAP')).reason,'INVALID_LISTING_ID');
 assert.equal((await c.getListingPriceSeries(listingId,{range:'MAX'})).reason,'REQUESTED_RANGE_NOT_MATERIALIZED');
});
test('identity/venue/currency/duplicate contamination fails closed',async()=>{
 for(const patch of [{mic:'XNAS'},{currency:'USD'},{securityId:'ref_SAP'},{listingId:'other'},{points:[['2026-10-02',101],['2026-10-02',100]]},{points:[['2026-10-02',0]]},{asOf:'2026-10-03'},{expectedSession:'2026-10-01'}]){
  assert.equal((await client(directory,{...series,...patch}).getListingPriceSeries(listingId)).state,'UNAVAILABLE',JSON.stringify(patch));
 }
 assert.equal((await client({...directory,listings:[row,row]}).getListings()).reason,'LOCAL_IDENTITY_INVALID');
 assert.equal((await client({...directory,listings:[{...row,mappingStatus:'UNVERIFIED'}]}).getListings()).state,'UNAVAILABLE');
});
test('German preferred class remains distinct; invalid path never reaches loader',async()=>{
 const preferred='DE0007664039',ordinary='DE0007664005';assert.notEqual(I.securityIdForISIN(preferred),I.securityIdForISIN(ordinary));
 let calls=0;const c=C.create({load:async()=>{calls++;throw Error('x');}});
 assert.equal((await c.getListingPriceSeries('../../secret')).reason,'INVALID_LISTING_ID');assert.equal(calls,0);
});
