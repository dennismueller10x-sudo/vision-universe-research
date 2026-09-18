import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {createFsDriver} from '../../scripts/market/storage/fs-driver.mjs';
const require=createRequire(import.meta.url);
const Store=require('../engines/history-store.js'),Guard=require('../engines/zero-cost-guard.js');
const month='2026-09';
function setup(t){
 const root=mkdtempSync(join(tmpdir(),'vu2-usage-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const driver=createFsDriver(root),store=Store.createHistoryStore({driver});
 const key=store.usageKey.replace('MONTH',month);
 return {driver,store,key};
}
const invalid=e=>e.code==='HISTORY_USAGE_INVALID' && !e.message.includes('secret-sentinel');
test('missing month keeps existing semantics; actual counters survive a new store instance',async t=>{
 const {driver,store}=setup(t);assert.deepEqual(await store.readUsage(month),Guard.emptyUsage(month));
 const state={...Guard.emptyUsage(month),classAOperations:200,classBOperations:500,storageBytes:1234};
 await store.writeUsage(state);const restored=await Store.createHistoryStore({driver}).readUsage(month);
 assert.equal(restored.classAOperations,200);assert.equal(restored.classBOperations,500);assert.equal(restored.storageBytes,1234);
 assert.deepEqual(await store.readUsage('2026-10'),Guard.emptyUsage('2026-10'));
});
test('corrupt, wrong-month and invalid counters cannot silently reset consumed budget',async t=>{
 const {driver,store,key}=setup(t),base=Guard.emptyUsage(month);
 const bad=['{"secret-sentinel"',null,[],{...base,month:'2026-08'},
  ...['classAOperations','classBOperations','storageBytes','objectCount','bytesUploaded','bytesDownloaded'].flatMap(field=>
   [-1,0.5,null,'0',Number.MAX_SAFE_INTEGER+1].map(value=>({...base,[field]:value}))),
  {...base,runs:null}];
 for(const value of bad){
  await driver.put(key,Buffer.from(typeof value==='string'?value:JSON.stringify(value)));
  await assert.rejects(store.readUsage(month),invalid);
 }
});
test('invalid write preserves prior counters and spends no write budget',async t=>{
 const {driver,store,key}=setup(t);await store.writeUsage({...Guard.emptyUsage(month),classAOperations:99});
 const before=await driver.get(key),spent=store.budget.spent.classA;
 await assert.rejects(store.writeUsage({...Guard.emptyUsage(month),classAOperations:-1}),invalid);
 await assert.rejects(store.writeUsage({...Guard.emptyUsage(month),month:undefined}),invalid);
 assert.deepEqual(await driver.get(key),before);assert.equal(store.budget.spent.classA,spent);
});
test('invalid month is rejected before any driver access and transport failure propagates',async()=>{
 let calls=0;
 const store=Store.createHistoryStore({driver:{kind:'fs',get:async()=>{calls++;throw new Error('TRANSPORT_DOWN');}}});
 for(const m of ['2026-13','../2026-09','invalid',42])await assert.rejects(store.readUsage(m),invalid);
 assert.equal(calls,0);
 await assert.rejects(store.readUsage(month),/TRANSPORT_DOWN/);assert.equal(calls,1);
});
