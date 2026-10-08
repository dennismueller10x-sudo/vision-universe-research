import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createRunBudget,privateOutput,runAudit,TARGET_CREDITS,HARD_CAP} from '../../../scripts/marketstack/capability-audit.mjs';
const plan=JSON.parse(readFileSync(new URL('../../../docs/marketstack-audit/representative-plan.json',import.meta.url),'utf8'));
const repo=resolve(new URL('../../..',import.meta.url).pathname);
test('private output rejects repo paths including dot-dot names and symlink ancestors',()=>{
 for(const p of [repo,join(repo,'docs/raw'),join(repo,'..private'),join(repo,'..hidden/raw')])assert.throws(()=>privateOutput(p));
 const dir=mkdtempSync(join(tmpdir(),'ms-output-'));try{symlinkSync(repo,join(dir,'linked'));assert.throws(()=>privateOutput(join(dir,'linked/raw')));}finally{rmSync(dir,{recursive:true});}
});
test('durable reservation precedes paid request and enforces ETF costs / hard cap',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ms-budget-'));try{const file=join(dir,'budget.json'),budget=createRunBudget(file,20);await budget.reserve({cost:20,endpoint:'/etfholdings'});assert.equal(JSON.parse(readFileSync(file)).estimatedCredits,20);await assert.rejects(budget.reserve({cost:1,endpoint:'/eod'}));assert.throws(()=>createRunBudget(file,20));assert.throws(()=>createRunBudget(join(dir,'bad'),HARD_CAP+1));assert.equal(TARGET_CREDITS,1999);}finally{rmSync(dir,{recursive:true});}
});
test('absent key makes zero calls and writes nothing; plan has no unverified sibling aliases',async()=>{
 let calls=0;await assert.rejects(runAudit({plan,out:join(tmpdir(),'ms-no-key'),apiKey:'',fetchImpl:()=>{calls++;}}),/KEY_NOT_CONFIGURED/);assert.equal(calls,0);assert.equal(plan.cases.length,42);assert(plan.cases.every(c=>!c.aliases?.length));
});
test('auth error circuits immediately and original raw response is stored outside product tree',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ms-auth-'));try{let calls=0;const body=' { "error": { "code": "invalid_access_key" } }\n';const r=await runAudit({plan,out:dir,apiKey:'fake-key',fetchImpl:async()=>{calls++;return {status:401,text:async()=>body,headers:new Headers()};}});assert.equal(calls,1);assert.equal(r.terminalReason,'authError');assert.equal(r.budget.requests,1);assert.equal(readFileSync(join(dir,'raw-provider/0001.json'),'utf8'),body);assert.equal(r.productionWrites,0);}finally{rmSync(dir,{recursive:true});}
});
test('42-case dry transport honors run budget and never registers product capabilities',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ms-run-'));try{let calls=0;const r=await runAudit({plan,out:dir,apiKey:'fake-key',maxCredits:60,fetchImpl:async url=>{calls++;return {status:200,text:async()=>JSON.stringify({pagination:{limit:1000,offset:0,count:0,total:0},data:[]}),headers:new Headers()};}});assert(r.budget.estimatedCredits<=60);assert.equal(r.budget.requests,calls);assert(Object.values(r.capabilityFlags).every(v=>v==='UNKNOWN'));assert.equal(r.productionWrites,0);assert.equal(r.terminalReason,'budgetExceeded');}finally{rmSync(dir,{recursive:true});}
});
test('focused follow-up executes only explicit probes against the same shared ledger',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ms-focused-'));try{let calls=0;const focused={...plan,mode:'FOCUSED_VERIFICATION',operations:[{case:'AAPL',label:'MIC_recheck',method:'getLatestEOD',args:[{providerTicker:'AAPL',mic:'XNAS'}]}]};const r=await runAudit({plan:focused,out:dir,apiKey:'fake-key',maxCredits:2,fetchImpl:async()=>{calls++;return {status:200,text:async()=>JSON.stringify({pagination:{limit:1000,offset:0,count:1,total:1},data:[{symbol:'AAPL',exchange:'XNAS',exchange_code:'NASDAQ',close:10}]}),headers:new Headers()};}});assert.equal(calls,1);assert.equal(r.results.length,1);assert.equal(r.results[0].result.ok,true);assert.equal(r.budget.estimatedCredits,1);}finally{rmSync(dir,{recursive:true});}
});
