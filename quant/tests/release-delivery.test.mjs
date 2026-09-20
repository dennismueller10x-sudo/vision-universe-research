import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';
import {projectInspector,permitted,SEC_BUDGET} from '../../scripts/vu2/build-release.mjs';
const require=createRequire(import.meta.url),History=require('../api/fundamentals-contract.js');
const load=p=>JSON.parse(readFileSync(new URL('../data/sec/'+p,import.meta.url)));
test('release projection preserves every existing history metric and period result without source-only fields',()=>{
 for(const c of load('inspector_index.json').companies){const original=load('inspector/'+c.ticker+'.json'),projected=projectInspector(original);
 assert.equal(projected.rows.length,original.rows.length);assert.equal(projected.rows.some(r=>'inputs'in r),false);
 for(const metric of History.metrics)for(const period of ['annual','quarterly','ttm']){
  const opts={ticker:c.ticker,cik:c.cik,metric:metric.id,period};assert.deepEqual(History.build(projected,opts),History.build(original,opts));
 }
 }
});
test('full SEC/fundamental stores and test fixtures cannot enter the static artifact',()=>{
 for(const path of ['quant/data/sec/consumer/a.json','quant/data/sec/canonical/a.json','quant/data/sec/inspector/a.json','quant/data/fundamentals/issuers/a.json','quant/tests/fixtures/a.json','.env','.git/config'])assert.equal(permitted(path),false,path);
 for(const path of ['vu2/index.html','discover/data/stocks/NVDA.json','quant/api/product-services.js','CNAME','.nojekyll'])assert.equal(permitted(path),true,path);
 assert.equal(SEC_BUDGET,8388608);
});

test('builder rejects contaminated destinations and symlink inputs without deleting canonical storage',async()=>{
 const {mkdtemp,mkdir,writeFile,readFile,symlink,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {execFileSync}=await import('node:child_process');
 const {buildRelease}=await import('../../scripts/vu2/build-release.mjs');
 const tmp=await mkdtemp(join(tmpdir(),'release-contract-')),root=join(tmp,'source'),output=join(tmp,'site');
 try{
  await mkdir(join(root,'quant/data/sec/canonical'),{recursive:true});await mkdir(join(root,'quant/data/sec/consumer'),{recursive:true});
  await writeFile(join(root,'quant/data/sec/canonical/private.json'),'[1,2,3]');
  await writeFile(join(root,'quant/data/sec/consumer/private.json'),'[4,5,6]');
  await writeFile(join(root,'quant/data/sec/inspector_index.json'),JSON.stringify({companies:[]}));
  for(const name of ['quant-factor-inputs.json','coverage_matrix.json','pit_gates.json'])await writeFile(join(root,'quant/data/sec/'+name),JSON.stringify({evidence:'retained',name}));
  await writeFile(join(root,'index.html'),'existing home');
  await mkdir(join(root,'vu2'));await writeFile(join(root,'vu2/index.html'),'<body><script src="/vu2/app.js"></script></body>');await writeFile(join(root,'vu2/app.js'),'void 0;');
  execFileSync('git',['init','-q'],{cwd:root});execFileSync('git',['add','.'],{cwd:root});
  execFileSync('git',['-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','fixture'],{cwd:root});
  await assert.rejects(buildRelease({root,output:join(root,'site')}),/OUTPUT_MUST_BE_OUTSIDE_SOURCE/);
  const report=await buildRelease({root,output});assert.equal(report.status,'PASS');
  const firstHTML=await readFile(join(output,'vu2/index.html'),'utf8');assert.match(firstHTML,/release-bundle\.js\?v=[a-f0-9]{16}/);
  await writeFile(join(root,'vu2/app.js'),'void 1;');
  const second=join(tmp,'second');await buildRelease({root,output:second});
  const secondHTML=await readFile(join(second,'vu2/index.html'),'utf8');
  assert.notEqual(firstHTML.match(/\?v=([a-f0-9]+)/)[1],secondHTML.match(/\?v=([a-f0-9]+)/)[1],'changed browser code must have a distinct cache key');
  assert.match(await readFile(join(output,'quant/index.html'),'utf8'),/location\.replace\("\/vu2\/"/);
  assert.equal(await readFile(join(output,'Quant/index.html'),'utf8'),await readFile(join(output,'quant/index.html'),'utf8'));
  assert.equal(await readFile(join(root,'index.html'),'utf8'),'existing home');
  for(const name of ['coverage_matrix.json','pit_gates.json'])assert.deepEqual(JSON.parse(await readFile(join(output,'quant/data/sec/'+name),'utf8')),JSON.parse(await readFile(join(root,'quant/data/sec/'+name),'utf8')));
  assert.equal(await readFile(join(root,'quant/data/sec/canonical/private.json'),'utf8'),'[1,2,3]');
  await assert.rejects(readFile(join(output,'quant/data/sec/canonical/private.json')),/ENOENT/);
  await assert.rejects(readFile(join(output,'quant/data/sec/consumer/private.json')),/ENOENT/);
  await assert.rejects(buildRelease({root,output}),/OUTPUT_NOT_EMPTY/);
  await symlink(join(root,'quant/data/sec/canonical/private.json'),join(root,'leak.json'));execFileSync('git',['add','leak.json'],{cwd:root});
  await assert.rejects(buildRelease({root,output:join(tmp,'symlink-site')}),/NON_FILE_INPUT/);
 }finally{await rm(tmp,{recursive:true,force:true});}
});
