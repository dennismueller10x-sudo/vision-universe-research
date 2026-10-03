import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import {pinSecurityMasterBaseline,readSecurityMasterBaseline} from '../../scripts/market/us-security-master-baseline.mjs';
const root=resolve(import.meta.dirname,'../..');
test('discovery baseline remains bound to original bytes after live membership changes, and tampered snapshots fail',()=>{
 const dir=mkdtempSync(join(tmpdir(),'vu-master-baseline-'));
 try {
  const file=join(dir,'current.json'),original={securities:[{ticker:'DNA',securityId:'ref_DNA'}]};
  writeFileSync(file,JSON.stringify(original));
  const first=pinSecurityMasterBaseline({root:dir,outDir:dir,sourceFile:file}),snapshot=join(dir,first.file),before=readFileSync(snapshot);
  assert.deepEqual(readSecurityMasterBaseline(snapshot,first.sha256).document,original);
  assert.equal(pinSecurityMasterBaseline({root:dir,outDir:dir,sourceFile:file}).file,first.file);assert.deepEqual(readFileSync(snapshot),before);
  writeFileSync(file,JSON.stringify({securities:[...original.securities,{ticker:'CART',securityId:'ref_CART'}]}));
  const next=pinSecurityMasterBaseline({root:dir,outDir:dir,sourceFile:file});assert.notEqual(next.file,first.file);assert.equal(readSecurityMasterBaseline(snapshot,first.sha256).document.securities.length,1);
  // Network discovery may take minutes: pin the bytes already consumed,
  // rather than rereading a concurrently updated canonical membership file.
  assert.equal(pinSecurityMasterBaseline({root:dir,outDir:dir,sourceFile:file,sourceBytes:Buffer.from(JSON.stringify(original))}).file,first.file);
  writeFileSync(snapshot,gzipSync(readFileSync(file)));assert.throws(()=>readSecurityMasterBaseline(snapshot,first.sha256),/BASELINE_HASH_MISMATCH/);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
test('existing native security-master builder emits an immutable checked baseline instead of referencing mutable membership',()=>{
 const dir=mkdtempSync(join(tmpdir(),'vu-master-build-'));
 try {
  const file=join(dir,'current.json'),out=join(dir,'out');writeFileSync(file,JSON.stringify({securities:[{ticker:'DNA',securityId:'ref_DNA',exchange:'NYSE',company:'Ginkgo Bioworks Holdings',startDate:'2021-04-19'}]}));
  execFileSync(process.execPath,[join(root,'scripts/market/build-us-security-master.mjs'),'--offline','--baseline',file,'--out',out,'--work-dir',join(dir,'private'),'--today','2026-10-02'],{encoding:'utf8'});
  const recon=JSON.parse(readFileSync(join(out,'reconciliation.json'))),nd=recon.nonDestructive;
  assert.notEqual(resolve(root,nd.baselineFile),file);assert.match(nd.baselineSha256,/^[a-f0-9]{64}$/);assert.equal(nd.baselineCount,1);assert.equal(nd.baselinePreserved,1);assert.equal(nd.baselineRemoved,0);
  writeFileSync(file,JSON.stringify({securities:[]}));assert.equal(readSecurityMasterBaseline(resolve(root,nd.baselineFile),nd.baselineSha256).document.securities.length,1);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
