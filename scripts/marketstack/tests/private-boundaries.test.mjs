import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {rejectSymlinkAncestors} from '../private-output.mjs';
import {buildRelease} from '../../vu2/build-release.mjs';

test('private writes reject nested and dangling symlink files',()=>{
 const dir=mkdtempSync(join(tmpdir(),'vu-private-boundary-'));
 try{
  mkdirSync(join(dir,'reports'));
  symlinkSync(join(dir,'missing.json'),join(dir,'reports','result.json'));
  assert.throws(()=>rejectSymlinkAncestors(join(dir,'reports','result.json')),/SYMLINK/);
  symlinkSync(join(dir,'reports'),join(dir,'alias'),'dir');
  assert.throws(()=>rejectSymlinkAncestors(join(dir,'alias','new.json')),/SYMLINK/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('public hygiene refuses nonempty local metadata and licensed series',()=>{
 const dir=mkdtempSync(join(tmpdir(),'vu-public-boundary-'));
 try{
  const data=join(dir,'core/data/de-eu');mkdirSync(data,{recursive:true});
  const run=()=>spawnSync(process.execPath,['scripts/market/assert-public-data-hygiene.mjs','--root='+dir],{encoding:'utf8'});
  writeFileSync(join(data,'listings.json'),JSON.stringify({state:'DISABLED',publicDisplay:false,listings:[]}));
  assert.equal(run().status,0);
  writeFileSync(join(data,'listings.json'),JSON.stringify({state:'PRIVATE_DEVELOPMENT',publicDisplay:false,listings:[{listingId:'SYNTHETIC'}]}));
  assert.equal(run().status,1);
  writeFileSync(join(data,'listings.json'),JSON.stringify({state:'DISABLED',publicDisplay:false,listings:[]}));
  mkdirSync(join(data,'series'));writeFileSync(join(data,'series/fixture.json'),'{}');assert.equal(run().status,1);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('actual public packager refuses a tracked private directory before copying',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'vu-packager-boundary-'));
 try{
  const root=join(dir,'source');mkdirSync(join(root,'core/data/de-eu'),{recursive:true});
  execFileSync('git',['init','-q'],{cwd:root});
  writeFileSync(join(root,'core/data/de-eu/listings.json'),JSON.stringify({state:'PRIVATE_DEVELOPMENT',publicDisplay:false,listings:[{listingId:'SYNTHETIC'}]}));
  execFileSync('git',['add','core/data/de-eu/listings.json'],{cwd:root});
  await assert.rejects(buildRelease({root,output:join(dir,'release')}),/DE_EU_PRIVATE_DATA_PUBLICATION_BLOCKED/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
