import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {productionBaseline,identicalProtectedInputs} from '../production-regression-base.mjs';
test('actual GitHub PR merge parent and main push before retain an independent unchanged product control',()=>{
 const root=mkdtempSync(join(tmpdir(),'ci-production-control-'));
 const git=(...args)=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 const save=(path,value)=>{mkdirSync(join(root,path,'..'),{recursive:true});writeFileSync(join(root,path),value);};
 const commit=message=>{git('add','.');git('commit','-m',message);return git('rev-parse','HEAD');};
 const eventPath=join(root,'.git','trusted-event.json');
 try{
  git('init','-b','main');git('config','user.name','Production control test');git('config','user.email','control@example.invalid');
  save('quant/input.json','{"price":1}\n');const old=commit('old main');git('switch','-c','content');save('company-intelligence/review.json','{"profile":"reviewed"}\n');const branch=commit('content only');
  git('switch','main');save('quant/input.json','{"price":2}\n');const current=commit('independent market update');git('merge','--no-ff','--no-edit','content');const merged=git('rev-parse','HEAD');
  writeFileSync(eventPath,JSON.stringify({pull_request:{base:{sha:old},head:{sha:branch}}}));
  const pr=productionBaseline({eventName:'pull_request',eventPath,pinnedSha:old,cwd:root});assert.equal(pr.baseline,current);assert.deepEqual(identicalProtectedInputs(pr.baseline,root),[]);
  writeFileSync(eventPath,JSON.stringify({ref:'refs/heads/main',before:current,after:merged}));
  const push=productionBaseline({eventName:'push',eventPath,pinnedSha:old,cwd:root});assert.equal(push.baseline,current);assert.equal(push.baselineBasis,'TRUSTED_GITHUB_MAIN_PUSH_PREVIOUS_HEAD');assert.deepEqual(identicalProtectedInputs(push.baseline,root),[]);
  // A real protected input change must still fail; it cannot be relabelled as pre-existing.
  save('quant/input.json','{"price":999}\n');const bad=commit('protected change');writeFileSync(eventPath,JSON.stringify({ref:'refs/heads/main',before:merged,after:bad}));const changed=productionBaseline({eventName:'push',eventPath,pinnedSha:old,cwd:root});assert.throws(()=>identicalProtectedInputs(changed.baseline,root),/REQUIRES_IDENTICAL_PROTECTED_INPUTS/);
  // Neither another branch nor a mismatched checked-out head is trusted.
  writeFileSync(eventPath,JSON.stringify({ref:'refs/heads/other',before:merged,after:bad}));assert.throws(()=>productionBaseline({eventName:'push',eventPath,pinnedSha:old,cwd:root}),/TRUSTED_MAIN_PUSH_ANCESTRY_REQUIRED/);
  writeFileSync(eventPath,JSON.stringify({ref:'refs/heads/main',before:current,after:merged}));assert.throws(()=>productionBaseline({eventName:'push',eventPath,pinnedSha:old,cwd:root}),/TRUSTED_MAIN_PUSH_ANCESTRY_REQUIRED/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
