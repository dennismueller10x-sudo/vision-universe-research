import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdtempSync,rmSync,mkdirSync,cpSync,writeFileSync} from 'node:fs';
import fsp from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url),A=require('../engines/weekly-real-adapter.cjs');
const {materialize}=require('../../scripts/quant/materialize-real-backtest-read.cjs');
const root=resolve(import.meta.dirname,'../..');
const evidence=require('../engines/research-classification-evidence.cjs');
const originalAudit=JSON.parse(readFileSync(join(root,'docs/quant-recovery/v8/identity-source-validation.json')));
test('V8 exact original-source classification conflicts block two real common-stock research admissions',()=>{
 for(const id of ['ref_FRMEP','ref_MBINM'])assert.throws(()=>A.load(root,id),/^Error: ORIGINAL_SOURCE_CLASSIFICATION_CONFLICT$/);
 assert.equal(A.load(root,'ref_NVDA').securityId,'ref_NVDA');
});
test('V8 classification holds require exact listing ID and original source evidence, without ticker suffix rules',()=>{
 for(const e of evidence.records){
  const audit=originalAudit.results.find(x=>'ref_'+x.ticker===e.securityId);assert.ok(audit);
  assert.equal(e.source.prefixSha256,audit.sourceHash);assert.match(e.source.prefixSha256,/^[a-f0-9]{64}$/);assert.equal(e.source.accession,audit.accession);assert.equal(e.source.filingDate,audit.filingDate);assert.equal(e.sourceClass,audit.sourceClass);assert.equal(e.priorClassification,'EQUITY_COMMON');
  const doc={securityId:e.securityId,ticker:e.ticker},identity={canonical_id:e.canonicalId};assert.deepEqual(A.classificationConflict(doc,identity),e);
  assert.equal(A.classificationConflict(doc,{canonical_id:e.canonicalId+':OTHER_INTERVAL'}),undefined);
  assert.equal(A.classificationConflict({...doc,securityId:e.securityId+'OTHER'},identity),undefined);
 }
 assert.equal(A.classificationConflict({securityId:'ref_OTHERP',ticker:'OTHERP'},{canonical_id:'tiingo:NASDAQ:OTHERP:2000-01-01'}),undefined);
});
test('V8 rejected classifications materialize as blocked without performance and bind source evidence into generation',()=>{
 const out=mkdtempSync(join(tmpdir(),'v8-classification-generation-'));
 try{
  const report=materialize({root,output:out,ids:['ref_FRMEP','ref_MBINM']});assert.deepEqual(report.counts,{A:0,B:0,C:2});
  const snapshot=JSON.parse(readFileSync(join(out,report.generation,'snapshot.json')));
  assert.equal(snapshot.input.codes['quant/engines/research-classification-evidence.cjs'],A.hash(readFileSync(join(root,'quant/engines/research-classification-evidence.cjs'),'utf8')));
  for(const id of ['ref_FRMEP','ref_MBINM']){
   const summary=JSON.parse(readFileSync(join(out,report.generation,'listings',id,'summary.json')));
   assert.deepEqual(summary.periods,{});assert.equal(summary.certification,'NOT_CERTIFIED');
  }
 }finally{rmSync(out,{recursive:true,force:true});}
});

function fixture(id){
 const folder=mkdtempSync(join(tmpdir(),'v8-classification-reader-')),source=join(folder,'source'),output=join(folder,'private');
 for(const p of ['quant/engines','quant/api','quant/methodology','quant/data/universe/instruments','quant/data/market/security-master/us-security-master.json','quant/data/market/multi-asset/series/SPY.json','quant/data/market/multi-asset/instruments.json','quant/data/market/discover-series/ref_SPY.json','quant/data/market/discover-series-long/'+id+'.json','scripts/quant/materialize-real-backtest-read.cjs','scripts/quant/run-real-weekly-backtest.cjs','scripts/quant/contracts/weekly-execution-model-v2.json','quant/config/development-preview.json','quant/config/feature-gates.json']){
  mkdirSync(dirname(join(source,p)),{recursive:true});cpSync(join(root,p),join(source,p),{recursive:true});
 }
 return {folder,source,output,registry:join(source,'quant/engines/research-classification-evidence.cjs')};
}
function buildFixture(f,id){
 const code=`const {materialize}=require(${JSON.stringify(join(f.source,'scripts/quant/materialize-real-backtest-read.cjs'))});console.log(JSON.stringify(materialize({root:${JSON.stringify(f.source)},output:${JSON.stringify(f.output)},ids:[${JSON.stringify(id)}]})))`;
 return JSON.parse(execFileSync(process.execPath,['-e',code],{encoding:'utf8'}));
}
test('V8 restored source classification evidence blocks both changed and legacy-unbound preferred performance',async()=>{
 const Reader=require('../../server/quant-backtest-reader.cjs');
 for(const mode of ['CHANGED','LEGACY_UNBOUND']){
  const f=fixture('ref_FRMEP');
  try{
   const current=readFileSync(f.registry,'utf8');writeFileSync(f.registry,"module.exports={schemaVersion:'research-classification-evidence-1.0.0',records:[]};\n");
   if(mode==='LEGACY_UNBOUND'){
    const file=join(f.source,'scripts/quant/materialize-real-backtest-read.cjs');writeFileSync(file,readFileSync(file,'utf8').replace("'quant/engines/research-classification-evidence.cjs',",''));
   }
   const prior=buildFixture(f,'ref_FRMEP');assert.equal(prior.counts.B,1,'fixture models the prior incorrect common-stock admission');
   writeFileSync(f.registry,current);
   const reader=Reader.create({directory:f.output,root:f.source,enabled:true,audience:'INTERNAL_REVIEW',allowedTickers:['FRMEP']});
   const result=await reader.getRealBacktest('FRMEP');assert.equal(result.state,'UNAVAILABLE');assert.equal(result.reason,'BACKTEST_IDENTITY_CHANGED_REBUILD_REQUIRED');assert.equal(result.result,undefined);
  }finally{rmSync(f.folder,{recursive:true,force:true});}
 }
});
test('V8 source evidence changed during asynchronous reading withholds the financial payload',async()=>{
 const f=fixture('ref_NVDA'),Reader=require('../../server/quant-backtest-reader.cjs'),originalRead=fsp.readFile;let reads=0;
 try{
  buildFixture(f,'ref_NVDA');
  fsp.readFile=async function(file,...args){
   if(String(file)===f.registry&&++reads===3)writeFileSync(f.registry,readFileSync(f.registry,'utf8')+'\n// isolated dependency revision during read\n');
   return originalRead.call(this,file,...args);
  };
  const reader=Reader.create({directory:f.output,root:f.source,enabled:true,audience:'INTERNAL_REVIEW',allowedTickers:['NVDA']}),result=await reader.getRealBacktest('NVDA');
  assert.ok(reads>=3);assert.equal(result.state,'UNAVAILABLE');assert.equal(result.reason,'BACKTEST_ACCESS_CONTEXT_CHANGED');assert.equal(result.result,undefined);
 }finally{fsp.readFile=originalRead;rmSync(f.folder,{recursive:true,force:true});}
});
