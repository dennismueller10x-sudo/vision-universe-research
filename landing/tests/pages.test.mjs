import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {stagePages} from '../scripts/stage-pages.mjs';
import {root} from '../scripts/build.mjs';

test('Pages-Staging bleibt auf das separate Ziel begrenzt und erhält dessen CNAME',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'vu-pages-'));
  const target=join(dir,'target'),source=join(dir,'build');
  await mkdir(target);await mkdir(source);
  const git=(...args)=>execFileSync('git',args,{cwd:target,encoding:'utf8'}).trim();
  try{
    git('init','-b','gh-pages');git('config','user.name','Synthetic Test');git('config','user.email','test@example.invalid');
    await writeFile(join(target,'README.md'),'Original');git('add','.');git('commit','-m','Synthetic fixture');
    git('remote','add','origin','https://github.com/test-owner/vision-universe-research.git');
    await writeFile(join(source,'index.html'),'<link rel="canonical" href="https://www.visionuniverse.de/">');await writeFile(join(source,'.nojekyll'),'');
    await assert.rejects(stagePages({target,source,owner:'test-owner'}),/separate Landing-Pages-Ziel/);
    assert.equal(await readFile(join(target,'README.md'),'utf8'),'Original');
    await assert.rejects(stagePages({target:resolve(root,'..'),source,owner:'test-owner'}),/Research/);
    git('remote','set-url','origin','https://github.com/test-owner/vision-universe-landing-pages.git');
    await writeFile(join(target,'CNAME'),'research.visionuniverse.de');git('add','.');git('commit','-m','Foreign domain');
    await assert.rejects(stagePages({target,source,owner:'test-owner'}),/Fremde CNAME/);
    assert.equal(await readFile(join(target,'CNAME'),'utf8'),'research.visionuniverse.de');
    await writeFile(join(target,'CNAME'),'www.visionuniverse.de');git('add','.');git('commit','-m','Target fixture domain');
    await writeFile(join(source,'CNAME'),'unexpected.example');
    await assert.rejects(stagePages({target,source,owner:'test-owner'}),/Quell-Build/);
    assert.equal(await readFile(join(target,'README.md'),'utf8'),'Original');await rm(join(source,'CNAME'));
    await writeFile(join(source,'index.html'),'<meta name="robots" content="noindex, nofollow"><link href="https://www.visionuniverse.de/">');
    await assert.rejects(stagePages({target,source,owner:'test-owner'}),/Produktionsbuild/);
    await writeFile(join(source,'index.html'),'<link rel="canonical" href="https://www.visionuniverse.de/">');
    await stagePages({target,source,owner:'test-owner'});
    assert.equal(await readFile(join(target,'CNAME'),'utf8'),'www.visionuniverse.de');
    assert.equal(await readFile(join(target,'.nojekyll'),'utf8'),'');
    assert.match(await readFile(join(target,'index.html'),'utf8'),/canonical/);
    assert.match(await readFile(join(target,'README.md'),'utf8'),/vision-universe-research/);
    assert.equal(git('log','--format=%s','-1'),'Target fixture domain','Staging committet und pusht nicht');
  }finally{await rm(dir,{recursive:true,force:true});}
});
