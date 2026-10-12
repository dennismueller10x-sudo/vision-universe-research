import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {methods} from '../research/tournament/methods.mjs';
import {decryptSealed} from '../validation/lib.mjs';
import {parseCurrentRerunArguments,validateCurrentEligibility,scanCurrentData,runCurrentRerun,exportCurrentInputs} from '../research/certification/current-rerun.mjs';

const ASOF='2026-10-09';
const eligibility=()=>({schema:'supertrader-method-eligibility-2.0.0',methods:methods.map((m,i)=>({id:m.id,eligibility:i>=3&&i<=6?'BLOCKED':'PARTIAL',fully_certified:false,overall_confidence:'LOW',reason_codes:['SOURCE_UNCERTIFIED']}))});
const input=()=>({state:'AVAILABLE',formationDate:ASOF,securities:[{id:'SYNTHETIC_CURRENT',ticker:'SYNTHETIC',fundamentals:[],bars:[{date:ASOF,open:100,high:101,low:99,close:100,rawClose:100,rawVolume:100000,volume:100000,totalReturnIndex:1}]}],scanner:[],coverage:{benchmarkAvailable:true},calendar:[ASOF],benchmark:{bars:[{date:ASOF,close:100,totalReturnIndex:1}]},limitations:['SYNTHETIC_FIXTURE_NOT_PROVIDER_DATA']});
const fakeScan=(_data,method,_protocol,asOf)=>({id:method.id,asOf,status:'READY',numberMatches:1,candidates:[{id:'SYNTHETIC_CURRENT',ticker:'SYNTHETIC'}]});

test('current CLI requires explicit four arguments, real day and unique flags',()=>{
  const args=['--out','/tmp/synthetic-current','--freeze','/tmp/freeze.json','--eligibility','/tmp/eligibility.json','--as-of',ASOF];
  assert.equal(parseCurrentRerunArguments(args).asOf,ASOF);
  for(const bad of [args.slice(0,-2),[...args,'--out','another'],[...args,'--launch'],[...args.slice(0,-1),'2026-02-31']])assert.throws(()=>parseCurrentRerunArguments(bad));
});

test('all ten admissions are explicit; PARTIAL diagnostics never become qualified consensus',()=>{
  const e=eligibility();assert.equal(validateCurrentEligibility(e).size,10);
  assert.throws(()=>validateCurrentEligibility({...e,methods:e.methods.slice(1)}));
  assert.throws(()=>validateCurrentEligibility({...e,methods:[...e.methods.slice(1),e.methods[1]]}));
  const data=input();data.scanner=data.securities;
  const result=scanCurrentData(data,{asOf:ASOF,eligibility:e,protocol:{},scan:fakeScan});
  assert.equal(result.scans.length,10);assert.equal(result.scans.filter(s=>s.eligibility==='BLOCKED').length,4);
  for(const s of result.scans.filter(s=>s.eligibility==='BLOCKED')){assert.equal(s.numberMatches,null);assert.deepEqual(s.candidates,[]);assert.equal(s.unranked,true);}
  assert.deepEqual(result.consensus.qualifiedEligible,[]);assert.deepEqual(result.consensus.qualifiedEligibleMethodIds,[]);
  assert.equal(result.consensus.partialDiagnosticMethodIds.length,6);assert.equal(result.consensus.partialDiagnostic.length,1);
  assert.ok(data.securities[0].sourceFeatures.turtleN20);assert.equal(data.securities[0].priceSource,undefined);
});

test('stale benchmark session blocks every current method rather than reusing prior matches',()=>{
  const data=input();data.formationDate='2026-10-08';let calls=0;
  const result=scanCurrentData(data,{asOf:ASOF,eligibility:eligibility(),protocol:{},scan:()=>{calls++;throw Error('SHOULD_NOT_SCAN');}});
  assert.equal(calls,0);assert.ok(result.scans.every(s=>s.status==='BLOCKED_DATA'&&s.numberMatches===null));
  assert.equal(result.consensus.partialDiagnostic.length,0);
});

test('freeze is checked before loader; current reports/inputs are encrypted and no historical run exists',async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'current-cert-test-'));
  const pair=crypto.generateKeyPairSync('rsa',{modulusLength:2048});const publicPem=pair.publicKey.export({type:'spki',format:'pem'}),privatePem=pair.privateKey.export({type:'pkcs8',format:'pem'});
  const keys=[['owner',publicPem],['session',publicPem]],freezePath=path.join(temp,'freeze.json'),eligibilityPath=path.join(temp,'eligibility.json'),out=path.join(temp,'output');
  const eligibilityBytes=JSON.stringify(eligibility());
  fs.writeFileSync(freezePath,JSON.stringify({frozenBeforeRerunPerformance:true,frozenAt:'2026-10-12T12:00:00Z',eligibility:eligibility(),files:{'scripts/supertrader/research/certification/SUPERTRADER-METHOD-ELIGIBILITY.json':crypto.createHash('sha256').update(eligibilityBytes).digest('hex')}}));fs.writeFileSync(eligibilityPath,eligibilityBytes);
  const options={out,freezePath,eligibilityPath,asOf:ASOF};let called=false;
  await assert.rejects(runCurrentRerun(options,{keys,assertFreezeV2:()=>{throw Error('UNFROZEN');},loader:async()=>{called=true;return input();}}));assert.equal(called,false);
  let frozen=false;
  const result=await runCurrentRerun(options,{keys,assertFreezeV2:()=>{frozen=true;},loader:async opts=>{assert.equal(frozen,true);assert.equal(opts.lookbackBars,1000000);assert.equal(opts.maxStaleDays,0);const data=input();data.scanner=data.securities;return data;},scan:fakeScan});
  assert.equal(result.status.methods,10);assert.equal(result.status.partialMethods,6);assert.equal(result.status.blockedMethods,4);assert.equal(result.status.historicalPerformanceCalculated,false);
  const report=JSON.parse(decryptSealed(privatePem,JSON.parse(fs.readFileSync(path.join(out,'current-rerun-results.owner.sealed.json')))));
  assert.equal(report.historicalCalculation,'NOT_RUN_CURRENT_ONLY');assert.equal(report.results,undefined);assert.equal(report.benchmarkMetrics,undefined);assert.equal(report.forwardLedger.records.length,0);
  assert.ok(fs.existsSync(path.join(out,'inputs/current-input-securities-0001.owner.sealed.json')));
  assert.ok(!fs.readFileSync(path.join(out,'safe-status.json'),'utf8').includes('SYNTHETIC_CURRENT'));
  assert.equal(fs.statSync(path.join(out,'current-rerun-results.owner.sealed.json')).mode&0o777,0o600);
  fs.rmSync(temp,{recursive:true,force:true});
});

test('bounded input chunks are lossless and separately encrypted under inputs directory',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'current-input-test-')),pair=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
  const pub=pair.publicKey.export({type:'spki',format:'pem'}),priv=pair.privateKey.export({type:'pkcs8',format:'pem'});
  const data=input();data.securities=Array.from({length:3},(_,i)=>({...data.securities[0],id:`SYNTHETIC_${i}`}));
  const receipt=exportCurrentInputs(data,{out:temp,keys:[['owner',pub]],maxBytes:350});
  const restored=receipt.chunkFiles.flatMap(f=>JSON.parse(decryptSealed(priv,JSON.parse(fs.readFileSync(path.join(temp,f.file))))).securities);
  assert.deepEqual(restored,data.securities);assert.equal(receipt.securityChunks,3);
  for(const f of receipt.chunkFiles)assert.ok(decryptSealed(priv,JSON.parse(fs.readFileSync(path.join(temp,f.file)))).length<=350);assert.ok(receipt.chunkFiles.every(f=>f.file.startsWith('inputs/')));
  fs.rmSync(temp,{recursive:true,force:true});
});


test('a coherent alternate eligibility cannot promote a PARTIAL method before source loading',async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'current-admission-test-'));
  try{
    const e=eligibility(),canonicalBytes=JSON.stringify(e),freezePath=path.join(temp,'freeze.json'),eligibilityPath=path.join(temp,'eligibility.json');
    fs.writeFileSync(freezePath,JSON.stringify({eligibility:e,files:{'scripts/supertrader/research/certification/SUPERTRADER-METHOD-ELIGIBILITY.json':crypto.createHash('sha256').update(canonicalBytes).digest('hex')}}));
    const tampered=structuredClone(e);tampered.methods[0].eligibility='ELIGIBLE';tampered.methods[0].fully_certified=true;
    fs.writeFileSync(eligibilityPath,JSON.stringify(tampered));let called=false;
    const options={out:path.join(temp,'out'),freezePath,eligibilityPath,asOf:ASOF};
    await assert.rejects(runCurrentRerun(options,{keys:[],assertFreezeV2:()=>{},loader:async()=>{called=true;return input();}}),/CURRENT_ELIGIBILITY_NOT_IDENTICAL_TO_FREEZE/);
    assert.equal(called,false);
    fs.writeFileSync(eligibilityPath,canonicalBytes+'\n');
    await assert.rejects(runCurrentRerun(options,{keys:[],assertFreezeV2:()=>{},loader:async()=>{called=true;return input();}}),/CURRENT_ELIGIBILITY_BYTES_NOT_FROZEN_CONTRACT/);
    assert.equal(called,false);
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
