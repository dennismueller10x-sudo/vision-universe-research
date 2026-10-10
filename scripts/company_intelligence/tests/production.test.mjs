import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {approval,reviewed,approvedForPublication,approve} from '../production-approval.mjs';
import {stageProduction,setProductionGate} from '../production-release.mjs';
const approved=()=>({...structuredClone(reviewed),releaseState:'APPROVED_CONTROLLED_PRODUCTION',productionApproval:approval.approvalId});
test('rollout loader, approval and reviewed consumer bind the same exact generation and unchanged cohort',()=>{
 const require=createRequire(import.meta.url),rollout=require('../../../company-intelligence/config/rollout.js');
 assert.equal(rollout.expectedGeneration,approval.consumerGeneration);
 assert.equal(rollout.expectedGeneration,reviewed.generation);
 assert.deepEqual([...rollout.cohort].sort(),reviewed.tickers);
 assert.equal(rollout.stage,1);
});
test('production authorization is bound to the exact reviewed assets, source policy, time and cohort',()=>{
 assert.equal(approvedForPublication(approved()),true);
 for(const change of [m=>m.tickers.push('ZZZZ'),m=>m.generation='a'.repeat(24),m=>m.sourceUsagePolicy='ALL_PUBLISHERS',m=>m.generatedAt='2026-10-07T00:00:00Z',m=>m.assets['index.json'].sha256='0'.repeat(64),m=>delete m.assets['index.json'],m=>m.productionApproval='another-approval']){const m=approved();change(m);assert.equal(approvedForPublication(m),false);}
 assert.equal(approvedForPublication(reviewed),false);
});
test('promotion changes only manifest release approval, and cannot promote another candidate',()=>{
 const root=mkdtempSync(join(tmpdir(),'ci-approval-'));
 try{const file=join(root,'manifest.json');writeFileSync(file,JSON.stringify(reviewed));const m=approve(root);assert.equal(m.generation,reviewed.generation);assert.deepEqual(m.assets,reviewed.assets);assert.equal(approvedForPublication(m),true);writeFileSync(file,JSON.stringify({...reviewed,tickers:['AAPL']}));assert.throws(()=>approve(root),/EXACT_REVIEWED/);}finally{rmSync(root,{recursive:true,force:true});}
});
test('an unavailable or foreign production pointer fails before changing the disabled index',async()=>{
 const root=mkdtempSync(join(tmpdir(),'ci-production-'));
 try{mkdirSync(join(root,'company-intelligence/data'),{recursive:true});const path=join(root,'company-intelligence/data/index.json');writeFileSync(path,'{"state":"DISABLED"}');for(const value of [null,Buffer.from(JSON.stringify(reviewed)),Buffer.from(JSON.stringify({...approved(),generation:'0'.repeat(24)}))]){await assert.rejects(stageProduction({get:async()=>value},root,{enabled:true}),/PRODUCTION_GATE|APPROVED_PRODUCTION_POINTER/);assert.equal(readFileSync(path,'utf8'),'{"state":"DISABLED"}');}}finally{rmSync(root,{recursive:true,force:true});}
});
test('persistent emergency gate off needs no intact generation and never changes consumer or private state',async()=>{
 const objects=new Map(),written=[];const driver={get:async k=>objects.get(k)||null,put:async(k,b)=>{objects.set(k,b);written.push(k);}};
 await setProductionGate(driver,'DISABLED');assert.equal(written.length,1);assert(written[0].endsWith('/gate.json'));assert.equal(JSON.parse(objects.get(written[0])).state,'DISABLED');
 await assert.rejects(setProductionGate(driver,'AVAILABLE'),/APPROVED_PRODUCTION_POINTER_REQUIRED/);assert.equal(written.length,1);
});
test('emergency gate off requires zero R2 reads and closes both packaged products',async()=>{
 const root=mkdtempSync(join(tmpdir(),'ci-off-'));
 try{for(const path of ['company-intelligence/config/rollout.js','quant/release-bundle.js']){mkdirSync(join(root,path,'..'),{recursive:true});writeFileSync(join(root,path),'const config = {stage:1, cohort:[]};');}writeFileSync(join(root,'company-intelligence/config/private.json'),'{}');const result=await stageProduction({get:()=>{throw Error('must not read')}},root,{enabled:false});assert.equal(result.privateObjectsRead,0);for(const path of ['company-intelligence/config/rollout.js','quant/release-bundle.js'])assert(readFileSync(join(root,path),'utf8').includes('stage:0,'));assert.throws(()=>readFileSync(join(root,'company-intelligence/config/private.json')));}finally{rmSync(root,{recursive:true,force:true});}
});
