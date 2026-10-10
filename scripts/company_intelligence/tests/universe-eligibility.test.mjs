import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {eligibilityValid,universeApproved,universeConfig} from '../universe-approval.mjs';
import {eligibilityRollout} from '../eligibility-rollout.mjs';
import {objectPool} from '../bounded-objects.mjs';
import {validateManifest} from '../public-delivery.mjs';
import {universeActive,activeNamespace} from '../refresh-storage.mjs';
import {refreshConfig} from '../refresh-approval.mjs';
const cid='iss_cik_0001652044',generation='a'.repeat(24),modules={profile:true,aktuelles:false,financials:false,whatChanged:false,nextEvent:false,calls:false,documents:false};
function fixture(){return {schema:1,generation,generatedAt:'2026-10-10T05:54:50Z',scope:'PER_ISSUER_ELIGIBILITY',eligibilityVersion:universeConfig.eligibilityVersion,
 sourceUsagePolicy:universeConfig.sourceUsagePolicy,tickers:['GOOG','GOOGL'],eligibility:{[cid]:{status:'ELIGIBLE_PARTIAL',modules:{...modules},tickers:['GOOG','GOOGL']}},
 assets:Object.fromEntries(['index.json',`snapshots/${generation}/${cid}.json`].map(p=>[p,{bytes:1,sha256:'b'.repeat(64)}])),
 productionApproval:universeConfig.approvalId,releaseState:'APPROVED_CONTROLLED_PRODUCTION',refreshValidation:{status:'PASS',structural:'PASS',privateCompanies:5120,checkpointSha256:'c'.repeat(64)}};}
test('explainable issuer/module manifest binds share classes to one issuer',()=>{const m=fixture();assert(eligibilityValid(m));assert(universeApproved(m));assert.equal(validateManifest(m),m);});
test('empty technical modules, wrong source policy and duplicate issuer mapping cannot authorize rollout',()=>{
 for(const alter of [m=>m.eligibility[cid].modules.profile=false,m=>m.sourceUsagePolicy='PUBLISHER_BODIES',m=>m.eligibility.iss_cik_0000320193={...m.eligibility[cid]},m=>m.refreshValidation.privateCompanies=45,m=>m.eligibility[cid].modules.whatChanged=true]){
  const m=fixture();alter(m);assert(!universeApproved(m));
 }
});
test('delivery-derived gate allows eligible new stock; ineligible and query override remain closed',()=>{
 const m=fixture(),original=readFileSync(new URL('../../../company-intelligence/config/rollout.js',import.meta.url),'utf8');
 const text=eligibilityRollout(original,m,{canary:true}),sandbox={URLSearchParams};runInNewContext(text,sandbox);const gate=sandbox.VUCompanyIntelligenceRollout;
 assert(gate.enabled('GOOG'));assert(gate.enabled('GOOGL'));assert(!gate.enabled('TSLA',{enabled:true,search:'?company-intelligence=preview'}));assert(!gate.enabled('ZZZZZ'));assert.equal(gate.expectedGeneration,generation);
 gate.productionOff=true;assert(!gate.enabled('GOOG'));assert(original.includes('const eligibility = null;'));
});
test('bounded object work never exceeds configured concurrency; failure rejects',async()=>{
 let active=0,max=0;const results=await objectPool(Array.from({length:100},(_,i)=>i),async i=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,1));active--;return i*i;},4);
 assert.equal(max,4);assert.equal(results[99],9801);await assert.rejects(objectPool([1,2,3],async i=>{if(i===2)throw Error('READBACK_FAILED');return i;}),/READBACK_FAILED/);
});
test('shared Quant bundle validates only the Company Intelligence gate',()=>{
 const original=readFileSync(new URL('../../../company-intelligence/config/rollout.js',import.meta.url),'utf8');
 const bundle='throw Error("UNRELATED_CHART_CODE_MUST_NOT_RUN");\n'+original+'\nthrow Error("UNRELATED_NAVIGATION_MUST_NOT_RUN");';
 const result=eligibilityRollout(bundle,fixture(),{canary:true});assert(result.includes('UNRELATED_CHART_CODE_MUST_NOT_RUN'));assert(result.includes('UNRELATED_NAVIGATION_MUST_NOT_RUN'));assert(result.includes(generation));
});

test('armed configuration never activates without validated durable authorization; rollback returns legacy scope',async()=>{
 assert.equal(universeConfig.enabled,true);
 assert.equal(await universeActive({get:async()=>null}),false);
 assert.equal(await activeNamespace({get:async()=>null}),refreshConfig.consumerNamespace);
 const driver=state=>({get:async()=>Buffer.from(JSON.stringify({schema:1,state,approvalId:universeConfig.approvalId}))});
 assert.equal(await activeNamespace(driver('AVAILABLE')),universeConfig.consumerNamespace);
 assert.equal(await activeNamespace(driver('ROLLBACK_46')),refreshConfig.consumerNamespace);
 await assert.rejects(universeActive(driver('ALL_ON')),/INVALID_UNIVERSE_ACTIVATION_POINTER/);
});
