import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const CLI=require('../../scripts/quant/run-research.cjs');
const Store=require('../engines/research-artifacts.cjs');
const Contract=require('../engines/research-contract.cjs');
const Validation=require('../engines/research-validation.cjs');
const repository=fileURLToPath(new URL('../..',import.meta.url));
const script=path.join(repository,'scripts/quant/run-research.cjs');
function workspace(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v6-cli-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
function fixture(){return {model:'TRADE_IID',seed:123,simulations:20,horizon:5,initialCapital:100,
  observations:[{date:'2020-01-01',return:0.1},{date:'2020-02-01',return:-0.05},{date:'2020-03-01',return:0.03}],returnBasis:'PRICE_RETURN',
  costs:{basis:'ALREADY_NET',modelVersion:'synthetic-net-1'},provenance:{sourceKind:'SYNTHETIC_TEST',sourceHash:'a'.repeat(64),sourceVersion:'cli-test-1',samplingUnit:'NON_OVERLAPPING_TRADE',scope:'SYNTHETIC CLI TEST ONLY'},retainPaths:1};}
function call(args){return spawnSync(process.execPath,[script,...args],{cwd:repository,encoding:'utf8',maxBuffer:1024*1024});}
function run(dir,input=fixture(),method='monte-carlo',output=path.join(dir,'private-store')){
  const inputPath=path.join(dir,'input.json');fs.writeFileSync(inputPath,JSON.stringify(input));
  return call(['--method',method,'--input',inputPath,'--out',output]);
}
function successful(result){assert.equal(result.status,0,result.stderr);assert.equal(result.signal,null);return JSON.parse(result.stdout);}
test('research CLI exposes all13 existing/new areas with no public activation',()=>{
  assert.equal(Object.keys(CLI.METHODS).length,13);
  assert.deepEqual(Object.values(CLI.METHODS).map(x=>x[0]).sort(),[...Contract.AREAS].sort());
  const help=call(['--help']);assert.equal(help.status,0,help.stderr);
  for(const method of Object.keys(CLI.METHODS))assert.ok(help.stdout.includes(method));
});
test('actual CLI writes a private hashed generation and deterministic repeat reuses it',t=>{
  const dir=workspace(t),store=path.join(dir,'private-store'),first=successful(run(dir)),second=successful(run(dir));
  assert.equal(first.area,'MONTE_CARLO');assert.equal(first.certification,'NOT_CERTIFIED');assert.equal(first.productionApproved,false);
  assert.equal(first.parent,null);assert.equal(first.reused,false);assert.equal(second.reused,true);
  assert.equal(first.generation,second.generation);assert.equal(first.resultHash,second.resultHash);
  assert.equal(Store.current(store),first.generation);
  const archived=Store.read(store,first.generation).payload;
  assert.equal(archived.resultHash,first.resultHash);assert.equal(archived.result.synthetic,true);
  assert.equal(archived.result.independentEvidence,'NOT_ESTABLISHED_BY_SIMULATION');
  assert.equal(Contract.hash(archived),first.generation);
  const {resultHash,...body}=archived;assert.equal(Contract.hash(body),resultHash);
  assert.equal(archived.dependencies['scripts/quant/run-research.cjs'],Contract.shaFile(script));
  assert.equal(archived.dependencyHash,Contract.hash(archived.dependencies));
  if(process.platform!=='win32')for(const file of ['current.json',first.generation+'.json'])assert.equal(fs.statSync(path.join(store,file)).mode&0o077,0,'private artifacts must not be readable by group/others');
});
test('actual CLI seed changes create distinct immutable generations; rollback rejects corrupt archive',t=>{
  const dir=workspace(t),store=path.join(dir,'private-store'),input=fixture();
  const first=successful(run(dir,input)),firstBytes=fs.readFileSync(path.join(store,first.generation+'.json'),'utf8');
  input.seed++;const second=successful(run(dir,input));
  assert.notEqual(first.generation,second.generation);assert.notEqual(first.resultHash,second.resultHash);assert.equal(second.parent,first.generation);
  assert.equal(fs.readFileSync(path.join(store,first.generation+'.json'),'utf8'),firstBytes);
  assert.equal(Store.rollback(store,first.generation,second.generation).previous,second.generation);
  const corruptedPath=path.join(store,second.generation+'.json'),corrupted=JSON.parse(fs.readFileSync(corruptedPath,'utf8'));
  corrupted.payload.result.distributions.endCapital.mean+=1;fs.writeFileSync(corruptedPath,JSON.stringify(corrupted));
  assert.throws(()=>Store.rollback(store,second.generation,first.generation),/CORRUPT_RESEARCH_GENERATION/);
  assert.equal(Store.current(store),first.generation);
  assert.equal(fs.existsSync(path.join(store,'writer.lock')),false);
});
test('actual CLI rejects unknown methods/arguments/invalid JSON and preserves last valid pointer',t=>{
  const dir=workspace(t),store=path.join(dir,'private-store'),valid=successful(run(dir));
  for(const method of ['unknown-method','__proto__','constructor']){
    const r=run(dir,fixture(),method);assert.equal(r.status,1);assert.match(r.stderr,/UNKNOWN_RESEARCH_METHOD/);
  }
  for(const args of [[],['--method'],['--unknown','x'],['--method','monte-carlo','--method','monte-carlo']]){
    const r=call(args);assert.equal(r.status,1);assert.match(r.stderr,/REQUIRED|INVALID_ARGUMENTS/);
  }
  const file=path.join(dir,'invalid.json');fs.writeFileSync(file,'{not json');
  assert.equal(call(['--method','monte-carlo','--input',file,'--out',store]).status,1);
  assert.equal(Store.current(store),valid.generation);
});
test('actual CLI rejects output inside repository without creating a directory',t=>{
  const dir=workspace(t),forbidden=path.join(repository,'v6-cli-forbidden-output-'+path.basename(dir));
  assert.equal(fs.existsSync(forbidden),false);
  const r=run(dir,fixture(),'monte-carlo',forbidden);
  assert.equal(r.status,1);assert.match(r.stderr,/OUTPUT_MUST_BE_PRIVATE_OUTSIDE_REPOSITORY/);
  assert.equal(fs.existsSync(forbidden),false);
});
test('actual CLI rejects oversized input before parse and accepts exact32MiB boundary for parsing',t=>{
  const dir=workspace(t),file=path.join(dir,'budget.json'),store=path.join(dir,'private-store');
  const fd=fs.openSync(file,'w');
  try{fs.ftruncateSync(fd,32*1024*1024+1);}finally{fs.closeSync(fd);}
  const oversized=call(['--method','monte-carlo','--input',file,'--out',store]);
  assert.equal(oversized.status,1);assert.match(oversized.stderr,/RESEARCH_INPUT_BUDGET_EXCEEDED/);
  assert.equal(fs.existsSync(store),false);
  // Valid JSON followed by whitespace: exercise equality rather than only >32MiB.
  const bounded=fs.openSync(file,'w'),chunk=Buffer.alloc(1024*1024,32);
  try{fs.writeSync(bounded,'{}');let remaining=32*1024*1024-2;while(remaining){const size=Math.min(remaining,chunk.length);fs.writeSync(bounded,chunk,0,size);remaining-=size;}}finally{fs.closeSync(bounded);}
  assert.equal(fs.statSync(file).size,32*1024*1024);
  const exact=call(['--method','unknown-method','--input',file,'--out',store]);
  assert.equal(exact.status,1);assert.match(exact.stderr,/UNKNOWN_RESEARCH_METHOD/);assert.doesNotMatch(exact.stderr,/BUDGET/);
  assert.equal(fs.existsSync(store),false);
});
function sensitivityFixture(){
  // The recorded-grid adapter is an explicit evaluator, separate from the
  // original scientific evaluator that produced the archived row estimates.
  // Register its exported source exactly; never disable source-hash validation.
  const evaluatorHash=Validation.hash(CLI.recordedSensitivityEvaluator(new Map()).toString());
  const registration=Validation.registerSensitivity({id:'SYNTHETIC_CLI_GRID',ruleHash:'synthetic-rule',datasetHash:'synthetic-data',evaluatorHash,
    primaryEndpoint:'synthetic-net-return',registeredAt:'2020-01-01T00:00:00Z',purpose:'EXPLORATORY_ROBUSTNESS',alpha:0.05,
    dimensions:{feeBps:[0,10]},baseline:{feeBps:0}});
  return {registration,context:{ruleHash:'synthetic-rule',datasetHash:'synthetic-data',evaluatorHash,executedAt:'2020-01-02T00:00:00Z',holdout:false},
    results:registration.points.map(parameters=>({parameters,result:{estimate:0.01-parameters.feeBps/10000,pValue:0.2,n:20,ci:[-0.01,0.03],inferenceMethod:'SYNTHETIC_TEST_ONLY',clusters:4,effectiveN:8}}))};
}
test('actual CLI sensitivity runs the registered recorded-grid factory with complete source binding',t=>{
  const dir=workspace(t),input=sensitivityFixture(),out=successful(run(dir,input,'sensitivity'));
  assert.equal(out.area,'PARAMETER_SENSITIVITY');assert.equal(out.certification,'NOT_CERTIFIED');assert.equal(out.productionApproved,false);
  const result=Store.read(path.join(dir,'private-store'),out.generation).payload.result;
  assert.equal(result.rows.length,2);assert.equal(result.registrationHash,input.registration.resultHash);
  assert.equal(result.multiplicity,'HOLM_WITHIN_REGISTERED_GRID_ONLY');
  assert.equal(result.rows[0].adjustedPValue,0.4);assert.equal(result.rows[1].adjustedPValue,0.4);
  assert.equal(result.neighborhood.sameDirection,true);assert.equal(result.neighborhood.count,1);
});
test('actual CLI sensitivity rejects evaluator/context changes and holdout tuning without replacing pointer',t=>{
  const dir=workspace(t),input=sensitivityFixture(),published=successful(run(dir,input,'sensitivity'));
  const changedContext=structuredClone(input);changedContext.context.evaluatorHash='unregistered-callback';
  const invalidContext=run(dir,changedContext,'sensitivity');assert.equal(invalidContext.status,1);assert.match(invalidContext.stderr,/SENSITIVITY_CONTEXT_CHANGED/);
  const changedSource=structuredClone(input),evaluatorHash='different-evaluator-source';
  changedSource.registration=Validation.registerSensitivity({...input.registration.specification,evaluatorHash});changedSource.context.evaluatorHash=evaluatorHash;
  const invalidSource=run(dir,changedSource,'sensitivity');assert.equal(invalidSource.status,1);assert.match(invalidSource.stderr,/SENSITIVITY_EVALUATOR_SOURCE_CHANGED/);
  const holdout=structuredClone(input);holdout.context.holdout=true;
  const invalidHoldout=run(dir,holdout,'sensitivity');assert.equal(invalidHoldout.status,1);assert.match(invalidHoldout.stderr,/HOLDOUT_TUNING_PROHIBITED/);
  assert.equal(Store.current(path.join(dir,'private-store')),published.generation);
});
test('actual CLI sensitivity rejects missing/extra/duplicate/substituted grid rows and tampered registration',t=>{
  const dir=workspace(t),input=sensitivityFixture(),published=successful(run(dir,input,'sensitivity'));
  const missing=structuredClone(input);missing.results.pop();
  const extra=structuredClone(input);extra.results.push({parameters:{feeBps:20},result:input.results[0].result});
  const duplicate=structuredClone(input);duplicate.results.push(duplicate.results[0]);
  const substituted=structuredClone(input);substituted.results[1].parameters={feeBps:99};
  const tampered=structuredClone(input);tampered.registration.specification.primaryEndpoint='changed-without-registration';
  for(const [candidate,reason]of [[missing,/GRID_RESULT_COUNT_MISMATCH/],[extra,/GRID_RESULT_COUNT_MISMATCH/],[duplicate,/DUPLICATE_GRID_RESULT/],[substituted,/MISSING_REGISTERED_GRID_RESULT/],[tampered,/SENSITIVITY_REGISTRATION_HASH_MISMATCH/]]){
    const out=run(dir,candidate,'sensitivity');assert.equal(out.status,1);assert.match(out.stderr,reason);
    assert.equal(Store.current(path.join(dir,'private-store')),published.generation);
  }
});
