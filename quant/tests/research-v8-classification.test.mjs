import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
const require=createRequire(import.meta.url),A=require('../engines/weekly-real-adapter.cjs');
const {materialize}=require('../../scripts/quant/materialize-real-backtest-read.cjs');
const root=resolve(import.meta.dirname,'../..');
const evidence=JSON.parse(readFileSync(join(root,'quant/config/research-classification-evidence.json')));
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
  assert.equal(snapshot.input.codes['quant/config/research-classification-evidence.json'],A.hash(readFileSync(join(root,'quant/config/research-classification-evidence.json'),'utf8')));
  for(const id of ['ref_FRMEP','ref_MBINM']){
   const summary=JSON.parse(readFileSync(join(out,report.generation,'listings',id,'summary.json')));
   assert.deepEqual(summary.periods,{});assert.equal(summary.certification,'NOT_CERTIFIED');
  }
 }finally{rmSync(out,{recursive:true,force:true});}
});
