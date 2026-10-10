import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,constants} from 'node:crypto';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EUROPE21_BRANCH,EUROPE21_ALLOCATIONS,EUROPE21_TRIGGER,validateEurope21Plan,europe21SignedPayload,verifyEurope21Marker,ingestEurope21} from '../../../scripts/marketstack/europe21-ingestion.mjs';
import {hash} from '../../../scripts/marketstack/europe-ingestion.mjs';
import {createEuropeBudget} from '../../../scripts/marketstack/europe-credits.mjs';
import {verifyExecutionEnvironment,fetchCompleteWorkflowHistory} from '../../../scripts/marketstack/actions-europe21.mjs';
const baseline='a'.repeat(40),head='b'.repeat(40);
const plan=(phase='phase1',operations=[])=>({version:21,phase,baselineMain:baseline,targetCredits:10000,hardCap:18000,maxCredits:EUROPE21_ALLOCATIONS[phase],operations});
const keys=generateKeyPairSync('rsa',{modulusLength:2048}),publicKey=keys.publicKey.export({type:'spki',format:'pem'});
function signed(p){const m={version:21,phase:p.phase,baselineMain:baseline,sourceSha:baseline,planHash:hash(JSON.stringify(p))};m.signature=sign('sha256',Buffer.from(europe21SignedPayload(m)),{key:keys.privateKey,padding:constants.RSA_PKCS1_PSS_PADDING,saltLength:32}).toString('base64');return m;}
const run=(id,phase='phase1',conclusion=null)=>({id,workflow_id:23,head_branch:EUROPE21_BRANCH,head_sha:head,event:'push',run_attempt:1,display_title:'Marketstack Europe21 '+phase,conclusion});
function context(p,runs=[run(10)]){return{before:baseline,parents:[baseline],changedPaths:[EUROPE21_TRIGGER],envelope:p,publicKey,runs,runId:10,workflowId:23,runAttempt:1,headSha:head};}
test('additional fixed allocations sum18000, forbid full discovery ETF US and oversized batches',()=>{
 assert.equal(Object.values(EUROPE21_ALLOCATIONS).reduce((a,b)=>a+b),18000);
 for(const kind of ['directory','etfs','holdings'])assert.throws(()=>validateEurope21Plan(plan('phase1',[{kind,mic:'XETR',symbol:'SXR8.DE',market:'EUROPE'}])),/REFUSED/);
 assert.throws(()=>validateEurope21Plan({...plan(),hardCap:25000}));
 assert.throws(()=>validateEurope21Plan(plan('phase1',[{kind:'history',listing:{providerTicker:'AAPL',mic:'XNAS'}}])),/PROTECTED/);
 assert.throws(()=>validateEurope21Plan(plan('phase1',Array.from({length:61},()=>({kind:'history',listing:{providerTicker:'SAP.DE',mic:'XETR'},maxPages:100})))),/BUDGET/);
});
test('signed marker requires exact source, phase, complete current workflow binding and single changed marker',()=>{
 const p=plan(),m=signed(p),c=context(p);assert.equal(verifyEurope21Marker(m,c),true);
 for(const override of [{changedPaths:[EUROPE21_TRIGGER,'core/identity.js']},{before:head},{headSha:baseline},{runId:'NaN'},{runs:[{...run(10),workflow_id:24}]},{runs:[{...run(10),head_branch:'main'}]},{runs:[run(10),run(10)]},{runAttempt:2}])assert.throws(()=>verifyEurope21Marker(m,{...c,...override}));
});
test('failed prior phase consumes its allocation, reruns and unsigned phase drift are refused',()=>{
 const p=plan(),m=signed(p);assert.throws(()=>verifyEurope21Marker(m,context(p,[run(10),run(9,'phase1','failure')])),/REPLAY/);
 assert.throws(()=>verifyEurope21Marker({...m,signature:''},context(p)),/SIGNATURE/);
 assert.throws(()=>verifyEurope21Marker({...m,phase:'phase2'},context(p)),/SOURCE/);
});
test('preceding phases require exact same workflow successful history',()=>{
 const p=plan('phase3'),m=signed(p),c=context(p,[run(10,'phase3'),run(8,'phase2','success'),run(7,'phase1','success')]);assert.equal(verifyEurope21Marker(m,c),true);
 assert.throws(()=>verifyEurope21Marker(m,{...c,runs:[run(10,'phase3'),run(7,'phase1','success')]}),/PRECEDING/);
 assert.throws(()=>verifyEurope21Marker(m,{...c,runs:[run(10,'phase3'),{...run(8,'phase2','success'),workflow_id:24},run(7,'phase1','success')]}),/HISTORY/);
});
test('actual durable phase ledger enforces lower cap, preserves failed reservation and refuses reset',async()=>{
 const d=mkdtempSync(join(tmpdir(),'vu21-cap-'));try{const f=join(d,'ledger'),b=createEuropeBudget(f,{maxCredits:2,targetCredits:10000,hardCap:18000});await b.reserve({cost:2,endpoint:'/eod'});await assert.rejects(b.reserve({cost:1,endpoint:'/eod'}),/BUDGET/);assert.equal(b.status().estimatedCredits,2);assert.equal(b.status().hardCap,18000);b.close();assert.throws(()=>createEuropeBudget(f,{maxCredits:2,targetCredits:10000,hardCap:18000}),/EXISTING/);assert.throws(()=>createEuropeBudget(join(d,'bad'),{maxCredits:18001,targetCredits:10000,hardCap:18000}),/HARD_CAP/);}finally{rmSync(d,{recursive:true,force:true});}
});
test('environment refuses rerun, wrong branch, title or checkout before paid collection',()=>{
 const e={GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/'+EUROPE21_BRANCH,GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:head};const v={ref:e.GITHUB_REF,head_commit:{id:head,message:'phase1'}};verifyExecutionEnvironment(e,v,{phase:'phase1'},head);
 for(const override of [{GITHUB_RUN_ATTEMPT:'2'},{GITHUB_REF:'refs/heads/main'},{GITHUB_EVENT_NAME:'workflow_dispatch'}])assert.throws(()=>verifyExecutionEnvironment({...e,...override},v,{phase:'phase1'},head));
 assert.throws(()=>verifyExecutionEnvironment(e,v,{phase:'phase2'},head));
});
const response=body=>({ok:true,json:async()=>body});
test('history reader binds exact workflow file and refuses count truncation or rerun',async()=>{
 const c={...run(10),path:'.github/workflows/marketstack-europe21-ingestion.yml'};let urls=[];
 const options={repository:'test/repo',token:'TEST',runId:10,fetchImpl:async u=>{urls.push(String(u));return response(urls.length===1?c:{total_count:1,workflow_runs:[c]});}};
 assert.equal((await fetchCompleteWorkflowHistory(options)).workflowId,23);assert.match(urls[1],/workflows\/23\/runs/);
 for(const mutation of [{run_attempt:2},{path:'.github/workflows/other.yml'},{head_branch:'main'}])await assert.rejects(fetchCompleteWorkflowHistory({...options,fetchImpl:async()=>response({...c,...mutation})}),/WORKFLOW/);
 let n=0;await assert.rejects(fetchCompleteWorkflowHistory({...options,fetchImpl:async()=>response(++n===1?c:{total_count:2,workflow_runs:[c]})}),/INCOMPLETE/);
});
test('collector snapshots signed plan across async transport and persists new-run accounting',async()=>{
 const d=mkdtempSync(join(tmpdir(),'vu21-clone-')),out=join(d,'out'),p=plan('phase1',[{kind:'latestBatch',mic:'XETR',symbols:['SAP.DE']},{kind:'history',listing:{providerTicker:'SAP.DE',mic:'XETR'},from:'2026-09-17',to:'2026-09-17'}]),expected=hash(JSON.stringify(p));let paths=[];
 try{const s=await ingestEurope21({envelope:p,out,apiKey:'TESTKEY-europe21',fetchImpl:async u=>{paths.push(new URL(u).pathname);p.operations[1]={kind:'directory',mic:'XETR'};return{status:200,headers:{get:()=>null},text:async()=>JSON.stringify({pagination:{limit:1000,offset:0,total:0,count:0},data:[]})};}});
 assert.deepEqual(paths,['/v2/eod/latest','/v2/eod']);assert.equal(s.runPlanHash,expected);assert.equal(s.budget.hardCap,18000);assert.equal(s.budget.maxCredits,6000);assert.equal(s.budget.estimatedCredits,2);assert.equal(s.oldRunCreditsIncluded,false);assert.equal(JSON.parse(readFileSync(join(out,'summary.json'))).phase,'phase1');assert.equal(s.productionWrites,0);
 }finally{rmSync(d,{recursive:true,force:true});}
});
