import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Identity=require('../../server/product-identity.js');
const instrument={symbol:'ADR',instrumentId:'vu_12345678901234',masterMemberId:'ref_ADR',legacyIds:['ref_ADR'],issuerId:'iss_cik_0001234567',cik:'0001234567',securityType:'ADR',securityClass:'ADR',productEligibility:'SEPARATE_CLASS',primaryListing:true,active:true,firstTradeDate:'2025-01-02',companyName:'Issuer ADR'};
async function resolve(row,securityId=row.instrumentId){return Identity.resolveIdentity({ticker:row.symbol,securityId},{loadJSON:async()=>({instruments:[row]})});}

test('canonical consumer ADR and other separate common classes retain security/company identity for watchlists',async()=>{
 for(const securityClass of ['ADR','REIT','TRUST','SPAC']){
  const row={...instrument,securityClass,securityType:securityClass==='ADR'?'ADR':'COMMON_STOCK'};
  const primary=await resolve(row),legacy=await resolve(row,'ref_ADR');
  assert.equal(primary.state,'AVAILABLE');assert.equal(legacy.state,'AVAILABLE');
  assert.equal(primary.identity.instrumentId,instrument.instrumentId);assert.equal(primary.identity.masterMemberId,'ref_ADR');
  assert.equal(primary.identity.issuerId,instrument.issuerId);assert.equal(row.active,true);assert.equal(row.firstTradeDate,'2025-01-02');
 }
});

test('preferred, warrants and funds cannot use separate-class consumer admission',async()=>{
 for(const securityType of ['PREFERRED','WARRANT','ETF','FUND','UNIT','RIGHT']){
  assert.equal((await resolve({...instrument,securityType,securityClass:securityType})).state,'NOT_ELIGIBLE');
  assert.equal((await resolve({...instrument,productEligibility:'ELIGIBLE',securityType,securityClass:securityType})).state,'NOT_ELIGIBLE');
 }
 assert.equal((await resolve({...instrument,securityType:'PREFERRED',securityClass:'ADR'})).state,'NOT_ELIGIBLE');
 assert.equal((await resolve({...instrument,securityClass:'UNKNOWN'})).state,'NOT_ELIGIBLE');
});

test('ADR admission never bypasses canonical alias and issuer checks',async()=>{
 assert.equal((await resolve({...instrument,legacyIds:[]})).state,'INVALID_IDENTITY');
 assert.equal((await resolve({...instrument,issuerId:'iss_cik_0009999999'})).state,'INVALID_IDENTITY');
 assert.equal((await resolve(instrument,'ref_OTHER')).state,'SYMBOL_NOT_SUPPORTED');
 const common={...instrument,securityClass:'EQUITY_COMMON',securityType:'COMMON_STOCK',productEligibility:'ELIGIBLE'};
 assert.equal((await resolve(common)).identity.instrumentId,instrument.instrumentId);
});
