import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,renameSync,symlinkSync,unlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {existingFileChanges} from './helpers/existing-file-changes.mjs';
test('additions are allowed while edits, deletions and renames retain evidence',()=>{
 const root=mkdtempSync(join(tmpdir(),'vu-existing-'));const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
 try{
  git('init','-q');git('config','user.name','QA');git('config','user.email','qa@example.invalid');
  for(const name of ['modified.js','deleted.js','renamed.js','type.js'])writeFileSync(join(root,name),name+'\n');
  git('add','.');git('commit','-qm','baseline');const base=git('rev-parse','HEAD').trim();
  writeFileSync(join(root,'new-engine.js'),'new\n');git('add','.');git('commit','-qm','add');
  assert.deepEqual(existingFileChanges(root,base+'...HEAD'),[]);
  writeFileSync(join(root,'modified.js'),'changed\n');unlinkSync(join(root,'deleted.js'));renameSync(join(root,'renamed.js'),join(root,'outside with\ttab.js'));
  unlinkSync(join(root,'type.js'));symlinkSync('modified.js',join(root,'type.js'));
  git('add','-A');git('commit','-qm','mutations');
  assert.deepEqual(existingFileChanges(root,base+'...HEAD').sort(),['modified.js','deleted.js','renamed.js','outside with\ttab.js','type.js'].sort());
  const beforeReturn=git('rev-parse','HEAD').trim();
  renameSync(join(root,'outside with\ttab.js'),join(root,'renamed.js'));git('add','-A');git('commit','-qm','reverse rename');
  assert.deepEqual(existingFileChanges(root,beforeReturn+'...HEAD').sort(),['outside with\ttab.js','renamed.js'].sort());
  assert.throws(()=>existingFileChanges(root,'missing-ref...HEAD'));
 }finally{rmSync(root,{recursive:true,force:true});}
});
