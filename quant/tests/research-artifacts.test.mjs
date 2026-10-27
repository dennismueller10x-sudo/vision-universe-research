import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), S=require('../engines/research-artifacts.cjs');
function store(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v6-generation-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
test('private research generations publish/reuse and rollback without rewriting archive',t=>{const d=store(t);const a=S.publish(d,{value:1},null), b=S.publish(d,{value:2},a.generation);assert.equal(S.current(d),b.generation);assert.deepEqual(S.read(d,a.generation).payload,{value:1});assert.equal(S.publish(d,{value:2},b.generation).reused,true);assert.equal(S.rollback(d,a.generation,b.generation).previous,b.generation);assert.equal(S.current(d),a.generation);assert.ok(fs.existsSync(path.join(d,b.generation+'.json')));});
test('hash corruption and invalid rollback preserve last pointer',t=>{const d=store(t),a=S.publish(d,{value:1}),b=S.publish(d,{value:2});S.rollback(d,a.generation,b.generation);fs.writeFileSync(path.join(d,b.generation+'.json'),JSON.stringify({schemaVersion:S.SCHEMA,payload:{value:900}}));assert.throws(()=>S.rollback(d,b.generation),/CORRUPT/);assert.equal(S.current(d),a.generation);assert.throws(()=>S.rollback(d,'../escape'),/INVALID_GENERATION/);assert.equal(S.current(d),a.generation);});
test('writer lock and compare-and-swap reject concurrent stale writers',t=>{const d=store(t),a=S.publish(d,{value:1});fs.writeFileSync(path.join(d,'writer.lock'),'existing');assert.throws(()=>S.publish(d,{value:2}),/LOCKED/);assert.equal(S.current(d),a.generation);fs.unlinkSync(path.join(d,'writer.lock'));assert.throws(()=>S.publish(d,{value:3},null),/PARENT_CHANGED/);assert.equal(S.current(d),a.generation);assert.equal(fs.existsSync(path.join(d,'writer.lock')),false);});
test('invalid payload cannot replace generation and symlink archive rejected',t=>{const d=store(t),a=S.publish(d,{value:1});assert.throws(()=>S.publish(d,{value:Infinity}),/NON_FINITE/);assert.equal(S.current(d),a.generation);const p=path.join(d,a.generation+'.json'),other=path.join(d,'external.json');fs.renameSync(p,other);fs.symlinkSync(other,p);assert.throws(()=>S.current(d),/SYMLINK/);});
