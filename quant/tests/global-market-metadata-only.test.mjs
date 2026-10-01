import test from 'node:test';import assert from 'node:assert/strict';import{mkdtempSync,readFileSync,existsSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';import{buildGlobalMarket}from'../../scripts/universe/build-global-market.mjs';
const row=()=>({listingId:'vu_abc123',securityId:'sec_abc',companyId:null,fundId:null,ticker:'SAP',mic:'XETR',exchange:'Xetra',assetType:'EQUITY',classificationSource:'verified-reference',listingCountry:'DE',tradingCurrency:'EUR',source:'reference',sourceUpdatedAt:'2026-10-01T10:00:00Z',coverage:{fundamentals:'NONE',price_history:'NONE',price_eod:'NONE'}});
const layer=r=>({schemaVersion:'global-market-1.0.0',listings:[r]});
const withTemp=fn=>{const path=mkdtempSync(join(tmpdir(),'vu-metadata-'));try{return fn(path);}finally{rmSync(path,{recursive:true,force:true});}};
test('metadata-only identity opt-in emits null price without chart data or fake capabilities',()=>withTemp(path=>{
 const r=row();buildGlobalMarket(layer(r),{},path,null,{allowMetadataOnly:true});const instrument=JSON.parse(readFileSync(join(path,'instruments/SA.json'))).instruments[0],search=JSON.parse(readFileSync(join(path,'search/SA.json'))).entries[0];
 assert.equal(instrument.price,null);assert.equal(instrument.historyPath,undefined);assert.equal(instrument.cap,undefined);assert.deepEqual(search.cap,['HAS_PROFILE']);assert(!existsSync(join(path,'history',r.listingId+'.json')));assert.equal(instrument.coverage.price_history,'NONE');
}));
test('default publisher and optimistic metadata coverage still require real history',()=>withTemp(path=>{
 assert.throws(()=>buildGlobalMarket(layer(row()),{},path),/GLOBAL_PRICE_GATE/);
 for(const coverage of [{price_history:'UNKNOWN',price_eod:'NONE'},{price_history:'PARTIAL',price_eod:'NONE'},{price_history:'NONE',price_eod:'FULL'}])assert.throws(()=>buildGlobalMarket(layer({...row(),coverage}),{},path,null,{allowMetadataOnly:true}),/GLOBAL_PRICE_GATE/);
 assert.throws(()=>buildGlobalMarket(layer({...row(),price:null}),{},path,null,{allowMetadataOnly:true}),/GLOBAL_PRICE_GATE/);
}));
test('metadata-only mode never weakens supplied history currency and identity gates',()=>withTemp(path=>{
 const r=row(),bar={securityId:r.securityId,date:'2026-09-30',open:100,high:102,low:99,close:101,volume:1000,currency:'USD'};
 assert.throws(()=>buildGlobalMarket(layer(r),{[r.listingId]:{bars:[bar]}},path,null,{allowMetadataOnly:true}),/GLOBAL_HISTORY_IDENTITY_OR_CURRENCY_MISMATCH/);
 assert.throws(()=>buildGlobalMarket(layer(r),{[r.listingId]:{bars:[{...bar,currency:'EUR',securityId:'other'}]}},path,null,{allowMetadataOnly:true}),/GLOBAL_HISTORY_IDENTITY_OR_CURRENCY_MISMATCH/);
 assert.throws(()=>buildGlobalMarket(layer(r),{[r.listingId]:{bars:[]}},path,null,{allowMetadataOnly:true}),/GLOBAL_PRICE_GATE/);
}));
