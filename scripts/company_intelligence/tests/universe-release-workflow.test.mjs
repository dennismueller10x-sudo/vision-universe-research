import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const path=fileURLToPath(new URL('../../../.github/workflows/company-intelligence-universe-release.yml',import.meta.url));
const yamlToJson=text=>JSON.parse(execFileSync('python3',['-I','-c','import sys,json,yaml;print(json.dumps(yaml.safe_load(sys.stdin.read())))'],{input:text,encoding:'utf8'}));
const load=text=>yamlToJson(text??readFileSync(path,'utf8'));
// Minimal evaluator for the expression subset the workflow uses.
function condition(expr,{mode,failed=false,activation='success'}){
 if(expr===undefined)return true;
 const js=String(expr).replace(/\$\{\{|\}\}/g,'').replace(/inputs\.mode/g,'MODE').replace(/steps\.activation\.outcome/g,'ACTIVATION')
  .replace(/github\.ref\b/g,'REF').replace(/failure\(\)/g,'FAILED').replace(/cancelled\(\)/g,'false').replace(/always\(\)/g,'true');
 return Boolean(new Function('MODE','ACTIVATION','FAILED','REF',`return (${js});`)(mode,activation,failed,'refs/heads/main'));
}
const stepsFor=(doc,mode)=>doc.jobs.release.steps.filter(s=>condition(s.if,{mode})).map(s=>s.name||s.uses);
const find=(doc,part)=>doc.jobs.release.steps.find(s=>(s.name||'').includes(part));
const doc=load();
const triggers=doc.on??doc.true;
test('workflow YAML parses and keeps the main-only job, permissions and concurrency',()=>{
 assert.deepEqual(doc.permissions,{contents:'read',actions:'write'});
 assert.deepEqual(doc.concurrency,{group:'company-intelligence-continuous-production','cancel-in-progress':false});
 assert.equal(doc.jobs.release.if,"github.ref == 'refs/heads/main'");
 assert.equal(doc.jobs.release['timeout-minutes'],120);
});
test('mode options add refreeze; scaling_run is optional in the form but mandatory for activate',()=>{
 const inputs=triggers.workflow_dispatch.inputs;
 assert.deepEqual(inputs.mode.options,['activate','rollback','health','refreeze']);
 assert.equal(inputs.mode.default,'activate');
 assert.equal(inputs.scaling_run.required,false);
 const guard=find(doc,'Require a scaling run for activate');
 assert.equal(condition(guard.if,{mode:'activate'}),true);
 for(const m of ['rollback','health','refreeze'])assert.equal(condition(guard.if,{mode:m}),false);
 assert.equal(guard.env.SCALE_RUN,'${{ inputs.scaling_run }}');
 assert.match(guard.run,/\^\[0-9\]\+\$/);assert.match(guard.run,/exit 1/);
 // The guard runs before the first expensive step.
 const names=doc.jobs.release.steps.map(s=>s.name||s.uses);
 assert.ok(names.indexOf(guard.name)<names.indexOf(find(doc,'Browser and policy contracts').name));
});
test('activate, rollback and health keep their step sets',()=>{
 const guard='Require a scaling run for activate (fail closed)',co='actions/checkout@v4',py='actions/setup-python@v5',node='actions/setup-node@v4',up='actions/upload-artifact@v4';
 const browser='Browser and policy contracts',act='Preserve 46 rollback, verify full R2 consumer and activate eligible gate',pages='Deploy existing Pages and wait for exact consumer generation';
 assert.deepEqual(stepsFor(doc,'activate'),[guard,co,co,py,node,browser,'Verify scale receipt from an ancestor of production code','Current private state twice, all assets and real sampled Discover',act,pages,'Actual production broad sample and source-to-browser readback',up]);
 assert.deepEqual(stepsFor(doc,'rollback'),[co,co,py,node,browser,act,pages,'Actual 46-scope rollback acceptance',up]);
 assert.deepEqual(stepsFor(doc,'health'),[co,py,node,act,pages,'Actual unchanged generation and reconciled source health',up]);
});
test('refreeze runs checkout, node, the command, its evaluation and the artifact only',()=>{
 const run=stepsFor(doc,'refreeze');
 assert.ok(!run.some(n=>/Browser|playwright|scale receipt|Deploy existing Pages|production broad sample|Fail closed|Preserve 46|Current private|rollback acceptance/i.test(n)),run.join('|'));
 assert.deepEqual(run.filter(n=>n!=='actions/setup-python@v5'),['actions/checkout@v4','actions/setup-node@v4','Re-freeze immutable 46 rollback onto current legacy GOOD','Require untouched gate, activation and universe GOOD after refreeze','actions/upload-artifact@v4']);
 const [first,second]=doc.jobs.release.steps.filter(s=>s.uses==='actions/checkout@v4');
 assert.equal(first.with.ref,'${{ github.ref }}');
 assert.equal(first.with['fetch-depth'],"${{ (inputs.mode == 'health' || inputs.mode == 'refreeze') && 1 || 0 }}");
 assert.equal(condition(second.if,{mode:'refreeze'}),false);
});
test('a refreeze failure never triggers restore46 or Pages dispatch, other modes keep the recovery',()=>{
 const f=find(doc,'Fail closed to immutable 46');
 const ctx=mode=>({mode,failed:true,activation:'success'});
 assert.equal(condition(f.if,ctx('refreeze')),false);
 assert.equal(condition(f.if,{...ctx('refreeze'),activation:'skipped'}),false);
 assert.equal(condition(f.if,ctx('activate')),true);
 assert.equal(condition(f.if,ctx('rollback')),true);
 assert.equal(condition(f.if,ctx('health')),false);
 assert.match(f.if,/inputs\.mode != 'refreeze'/);
 const refreezeSteps=doc.jobs.release.steps.filter(s=>/refreeze/i.test(s.name||''));
 for(const s of refreezeSteps)assert.doesNotMatch(s.run||'',/rollback --temporary|pages-release|gh workflow run|restore46/);
});
test('refreeze result is evaluated strictly and the command only sees inputs through env',()=>{
 const cmd=find(doc,'Re-freeze immutable 46');
 assert.equal(cmd.env.EXPECT_GENERATION,'${{ inputs.expect_generation }}');
 assert.match(cmd.run,/universe-release\.mjs refreeze --temporary/);
 assert.match(cmd.run,/--expect-generation "\$EXPECT_GENERATION"/);
 assert.match(cmd.run,/set -euo pipefail/);
 const ev=find(doc,'Require untouched gate');
 for(const k of ['privateStateModified','activationModified','gateModified','universeGoodModified'])assert.ok(ev.run.includes(k));
 assert.match(ev.run,/REFROZEN/);assert.match(ev.run,/ALREADY_CURRENT/);assert.match(ev.run,/strictEqual\(r\[k\],false/);
 assert.equal(triggers.workflow_dispatch.inputs.expect_generation.required,false);
});
test('ADR-005: no inputs expression inside any run text',()=>{
 for(const s of doc.jobs.release.steps)if(s.run)assert.doesNotMatch(s.run,/\$\{\{\s*(github\.event\.)?inputs\./,s.name);
 assert.doesNotMatch(readFileSync(path,'utf8'),/run:[^\n]*\$\{\{\s*inputs\./);
});
// Mutations: the structural checks must notice each regression.
const mutate=(from,to)=>{const t=readFileSync(path,'utf8');assert.ok(t.includes(from),from);return load(t.replace(from,to));};
test('mutation: fail-closed step reaching refreeze is detected',()=>{
 const m=mutate(" && inputs.mode != 'refreeze' && steps.activation.outcome"," && steps.activation.outcome");
 assert.equal(condition(find(m,'Fail closed to immutable 46').if,{mode:'refreeze',failed:true,activation:'success'}),true);
});
test('mutation: scaling_run no longer mandatory for activate is detected',()=>{
 const m=mutate("        if: inputs.mode == 'activate'\n        env:\n          SCALE_RUN: ${{ inputs.scaling_run }}\n        run: |\n          if !","        if: inputs.mode == 'never'\n        env:\n          SCALE_RUN: ${{ inputs.scaling_run }}\n        run: |\n          if !");
 assert.equal(condition(find(m,'Require a scaling run').if,{mode:'activate'}),false);
});
test('mutation: Pages wait or browser suite reaching refreeze is detected',()=>{
 const m=mutate("        id: deployment\n        if: inputs.mode != 'refreeze'\n","        id: deployment\n");
 assert.ok(stepsFor(m,'refreeze').includes('Deploy existing Pages and wait for exact consumer generation'));
 const b=mutate("if: inputs.mode != 'health' && inputs.mode != 'refreeze'\n        run: |\n          node --test","if: inputs.mode != 'health'\n        run: |\n          node --test");
 assert.ok(stepsFor(b,'refreeze').includes('Browser and policy contracts'));
});
test('mutation: inputs in a run block is detected',()=>{
 const m=mutate('node scripts/company_intelligence/universe-release.mjs refreeze --temporary','echo ${{ inputs.expect_generation }} && node scripts/company_intelligence/universe-release.mjs refreeze --temporary');
 assert.ok(m.jobs.release.steps.some(s=>/\$\{\{\s*inputs\./.test(s.run||'')));
});
