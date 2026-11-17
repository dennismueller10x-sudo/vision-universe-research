import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {childRun,childEnding,CHILD_STDERR_FILE,CHILD_STDERR_TAIL} from '../child-run.mjs';
const fail=(props)=>()=>{throw Object.assign(new Error('Command failed: node x'),props);};
const dir=()=>mkdtempSync(join(tmpdir(),'child-run-'));
test('success passes the result through and writes nothing',()=>{
 const d=dir();try{assert.equal(childRun('X','node',['a'],{}, {temporary:d,exec:()=>'ok'}),'ok');assert.throws(()=>readFileSync(join(d,CHILD_STDERR_FILE)));}finally{rmSync(d,{recursive:true,force:true});}
});
test('every ending becomes an uppercase failure code with the exit signal (SIGKILL = memory) and stderr tail in the uploaded file',()=>{
 const cases=[[{signal:'SIGKILL',status:null},'PROFILE_BROWSER_QA_FAILED_SIGKILL'],[{status:2},'PROFILE_BROWSER_QA_FAILED_EXIT2'],[{code:'ETIMEDOUT',signal:'SIGTERM'},'PROFILE_BROWSER_QA_FAILED_TIMEOUT'],[{code:'ENOBUFS',signal:'SIGTERM'},'PROFILE_BROWSER_QA_FAILED_STDERR_OVERFLOW'],[{},'PROFILE_BROWSER_QA_FAILED']];
 for(const [props,expected] of cases){
  const d=dir();
  try{
   assert.throws(()=>childRun('PROFILE_BROWSER_QA','node',['qa'],{},{temporary:d,exec:fail({...props,stderr:'x'.repeat(CHILD_STDERR_TAIL+500)+'ENDE'})}),e=>e.message===expected&&/^[A-Z0-9_:-]+$/.test(e.message));
   const text=readFileSync(join(d,CHILD_STDERR_FILE),'utf8');
   assert(text.startsWith('[PROFILE_BROWSER_QA] status='));assert(text.includes('ENDE'));assert(text.length<CHILD_STDERR_TAIL+200);
  }finally{rmSync(d,{recursive:true,force:true});}
 }
 assert.equal(childEnding({signal:'SIGKILL'}),'_SIGKILL');
});
test('a missing temporary directory never hides the failure code',()=>{
 assert.throws(()=>childRun('PROFILE_SAMPLES','python3',[],{},{temporary:join(tmpdir(),'does-not-exist-'+Date.now()),exec:fail({status:1})}),e=>e.message==='PROFILE_SAMPLES_FAILED_EXIT1');
});
test('profile-source-run.mjs: no child process without failure detail (only the onboarding step has its own catch)',()=>{
 const src=readFileSync(new URL('../profile-source-run.mjs',import.meta.url),'utf8');
 assert.equal((src.match(/\bexecFileSync\(/g)||[]).length,1,'only the onboarding call keeps its own execFileSync');
 for(const label of ['CATALOGUE_SEED','SOURCE_AUDIT_BEFORE','QA_METADATA','SOURCE_AUDIT_FUNNEL','PROFILE_SAMPLES','PROFILE_BROWSER_QA'])assert(src.includes(`childRun('${label}'`),label);
});
