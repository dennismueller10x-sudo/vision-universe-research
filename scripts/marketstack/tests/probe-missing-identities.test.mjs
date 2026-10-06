import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,readdirSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';
import {planIdentityProbe,verifyIdentityResponse,probeIdentity} from '../probe-missing-identities.mjs';
const require=createRequire(import.meta.url),Identity=require('../../../core/identity.js'),Client=require('../../../providers/marketstack/client.js');
const isin='DE0007164600',asOf='2026-10-06';
const mapping=({shareClass='ORDINARY_SHARE',cached=[]}={})=>({schemaVersion:'de-eu-listing-map-1.0.0',asOf,listings:[{isin,mic:'XETR',securityId:Identity.securityIdForISIN(isin),listingId:Identity.listingIdFor({isin,mic:'XETR'}),shareClass,tradingCurrency:'EUR'}],identityProbe:{privateDevelopment:true,publicDisplay:false,listings:[{isin,name:'Exact Target',preferredMIC:'XETR',officialLocalTicker:'SAP',currentOfficialListing:true,exactCachedProviderCandidates:cached}]}});
const metadata=(symbol='SAP.DE',mic='XETR',overrides={})=>({symbol,isin,item_type:'equity',name:'A name is not identity proof',stock_exchange:{mic},...overrides});
const authorization=map=>({kind:'USER_AUTHORIZED_BOUNDED_RUN',id:'test-identity',source:'explicit-user-authorization-fixture',runId:'identity-test',month:new Date().toISOString().slice(0,7),observedAt:new Date().toISOString(),hardLimit:20000,targetLimit:15000,sourceSHA:'a'.repeat(40),referenceHash:createHash('sha256').update(JSON.stringify(map)).digest('hex'),unknownAccountUsageAcknowledged:true});
async function fixture(fn){const dir=mkdtempSync(join(tmpdir(),'vu-private-identity-'));try{await fn(dir);}finally{rmSync(dir,{recursive:true,force:true});}}
function factory(response,calls){return options=>Client.createMarketstackClient({...options,apiKey:'TESTKEY-IDENTITY-PROBE',minIntervalMs:0,fetchImpl:async url=>{const endpoint=new URL(url).pathname;calls.push(endpoint);const res=response(endpoint,calls.length);return {status:res.status??200,text:async()=>JSON.stringify(res.body)};}});}
test('frozen official symbols remain unverified candidates; canonical classes and bounded cached alternatives are retained',()=>{
 const map=mapping({cached:[{providerSymbol:'SAP.DE',mic:'XETR'},{providerSymbol:'SAP.F',mic:'XFRA',metadataStatus:'QUARANTINED'}]});const plan=planIdentityProbe(map);assert.equal(plan.candidateCount,2);assert.equal(plan.targets[0].candidates[0].providerVerified,false);assert.equal(plan.targets[0].candidates[1].priorStatus,'QUARANTINED');
 assert.throws(()=>planIdentityProbe({...map,identityProbe:{...map.identityProbe,listings:Array(13).fill(map.identityProbe.listings[0])}}),/FROZEN_IDENTITY_PROBE_REQUIRED/);
 assert.throws(()=>planIdentityProbe(mapping({cached:Array.from({length:20},(_,i)=>({providerSymbol:'ALT'+i+'.F',mic:'XFRA'}))})),/CANDIDATE_LIMIT/);
 const bad=mapping();bad.listings[0].securityId='ref_SAP';assert.throws(()=>planIdentityProbe(bad),/NOT_CANONICAL/);
});
test('identity approval requires exact symbol, ISIN, MIC and share class; fuzzy names and absent ISIN never suffice',()=>{
 const {targets}=planIdentityProbe(mapping()),t=targets[0],c=t.candidates[0];assert.equal(verifyIdentityResponse(metadata(),t,c).accepted,true);
 for(const body of [metadata('OTHER.DE'),metadata('SAP.DE','XFRA'),metadata('SAP.DE','XETR',{isin:''}),metadata('SAP.DE','XETR',{isin:'US0378331005'}),metadata('SAP.DE','XETR',{item_type:'etf'})])assert.equal(verifyIdentityResponse(body,t,c).accepted,false);
 assert.equal(verifyIdentityResponse([],t,c).cause,'UNSUPPORTED_LISTING');
 const unknown=planIdentityProbe(mapping({shareClass:'UNKNOWN'})).targets[0];assert.equal(verifyIdentityResponse(metadata(),unknown,c).reason,'OFFICIAL_SHARE_CLASS_UNRESOLVED');
});
test('real shared client/counter records only metadata and exact-response mapping delta privately',()=>fixture(async privateDir=>{
 const map=mapping(),calls=[];const result=await probeIdentity({listingMap:map,accountEvidence:authorization(map),privateDir,asOf,runId:'identity-test',clientFactory:factory(()=>({body:metadata()}),calls)});
 assert.deepEqual(calls,['/v2/tickers/SAP.DE']);assert.equal(result.budget.estimatedCreditsConsumed,1);assert.equal(result.resolvedTargets,1);assert.equal(result.mappingDelta[0].resolutionStatus,'FOUND');assert.equal(result.mappingDelta[0].priceHistoryAdmitted,false);assert.equal(result.priceHistoryRequests,0);assert.equal(readdirSync(join(privateDir,'source')).length,1);assert.equal(JSON.parse(readFileSync(join(privateDir,'identity-probe/de_eu_identity_probe.json'))).publicDisplay,false);
}));
test('verified alternative uses canonical alternative listing ID without transferring original currency basis',()=>fixture(async privateDir=>{
 const map=mapping({cached:[{providerSymbol:'SAP.F',mic:'XFRA'}]}),calls=[];const result=await probeIdentity({listingMap:map,accountEvidence:authorization(map),privateDir,asOf,runId:'identity-test',clientFactory:factory((_,count)=>({body:count===1?metadata('SAP.DE','XETR',{isin:'US0378331005'}):metadata('SAP.F','XFRA')}),calls)});
 assert.equal(calls.length,2);const delta=result.mappingDelta[0];assert.equal(delta.resolutionStatus,'ALIAS_RESOLVED');assert.notEqual(delta.listingId,delta.targetListingId);assert.equal(delta.listingId,Identity.listingIdFor({isin,mic:'XFRA'}));assert.equal(delta.securityId,Identity.securityIdForISIN(isin));assert.equal(delta.tradingCurrency,null);assert.equal(delta.priceHistoryAdmitted,false);
}));
test('first authentication/quota failure stops every remaining candidate and emits bounded private evidence',()=>fixture(async privateDir=>{
 const map=mapping({cached:[{providerSymbol:'SAP.F',mic:'XFRA'}]}),calls=[];const result=await probeIdentity({listingMap:map,accountEvidence:authorization(map),privateDir,asOf,runId:'identity-test',clientFactory:factory(()=>({status:401,body:{error:{type:'invalid_access_key'}}}),calls)});
 assert.equal(calls.length,1);assert.equal(result.terminalReason,'authError');assert.equal(result.budget.estimatedCreditsConsumed,1);assert.equal(result.resolvedTargets,0);
}));
test('no retries or price/history fallback on transient metadata errors',()=>fixture(async privateDir=>{
 const map=mapping(),calls=[];await probeIdentity({listingMap:map,accountEvidence:authorization(map),privateDir,asOf,runId:'identity-test',clientFactory:factory(()=>({status:503,body:{error:{type:'internal_error'}}}),calls)});assert.equal(calls.length,1);assert.ok(calls.every(p=>p.includes('/tickers/')));
}));
test('invalid reference and missing authorization stop before client construction',()=>fixture(async privateDir=>{
 let constructions=0;const map=mapping(),common={listingMap:map,accountEvidence:null,privateDir,asOf,runId:'identity-test',clientFactory:()=>{constructions++;throw Error('SHOULD_NOT_CONSTRUCT');}};
 await assert.rejects(probeIdentity(common),/ACCOUNT_BUDGET_UNVERIFIED/);await assert.rejects(probeIdentity({...common,listingMap:{...map,identityProbe:undefined}}),/FROZEN_IDENTITY_PROBE_REQUIRED/);assert.equal(constructions,0);
}));

import {classifyMetadataFailure,identityResolution} from '../probe-missing-identities.mjs';
test('404 candidate means unsupported; mixed missing identity retains unresolved identity rather than final-candidate suppression',()=>{
 const missing=classifyMetadataFailure({status:404,reason:'providerError'});assert.equal(missing.cause,'UNSUPPORTED_LISTING');assert.equal(missing.reason,'PROVIDER_SYMBOL_NOT_FOUND');
 assert.deepEqual(identityResolution([missing]),{resolutionStatus:'NOT_SUPPORTED',cause:'UNSUPPORTED_LISTING'});
 const mismatch={accepted:false,cause:'MAPPING_ERROR',reason:'RESPONSE_SHARE_CLASS_MISMATCH'};
 assert.deepEqual(identityResolution([mismatch,missing]),{resolutionStatus:'IDENTITY_UNRESOLVED',cause:'MAPPING_ERROR'});
 assert.equal(identityResolution([missing,{cause:'MAPPING_ERROR',reason:'RESPONSE_ISIN_MISSING'}]).resolutionStatus,'IDENTITY_UNRESOLVED');
 assert.equal(identityResolution([],{resolutionStatus:'FOUND'}).resolutionStatus,'FOUND');assert.equal(identityResolution([],{resolutionStatus:'ALIAS_RESOLVED'}).resolutionStatus,'ALIAS_RESOLVED');
});
test('HTTP404 actual-client fixture persists source status and does not turn provider absence into data defect',()=>fixture(async privateDir=>{
 const map=mapping(),calls=[];const result=await probeIdentity({listingMap:map,accountEvidence:authorization(map),privateDir,asOf,runId:'identity-test',clientFactory:factory(()=>({status:404,body:{error:{type:'not_found'}}}),calls)});
 assert.equal(calls.length,1);assert.equal(result.results[0].resolutionStatus,'NOT_SUPPORTED');assert.equal(result.results[0].cause,'UNSUPPORTED_LISTING');assert.equal(result.results[0].attempts[0].httpStatus,404);assert.equal(result.budget.estimatedCreditsConsumed,1);assert.equal(result.mappingDelta.length,0);
}));
test('an unsupported alternate never conceals an earlier real provider-data defect',()=>{
 assert.deepEqual(identityResolution([{cause:'PROVIDER_DATA_DEFECT',reason:'INVALID_METADATA_RESPONSE'},{cause:'UNSUPPORTED_LISTING'}]),{resolutionStatus:'IDENTITY_UNRESOLVED',cause:'PROVIDER_DATA_DEFECT'});
});
