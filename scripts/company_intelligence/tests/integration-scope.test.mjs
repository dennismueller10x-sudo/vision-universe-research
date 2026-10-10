import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { permittedStockHook, unexpectedProtectedChanges } from '../check-quant-integration.mjs';
const modulePaths = ['company-intelligence/config/rollout.js','company-intelligence/ui/stock-section.js'];
const mount = 'if (global.VUCompanyIntelligenceStock) disposers.push(global.VUCompanyIntelligenceStock.mount(bodyHost, ticker));';
const assets = ['<link rel="stylesheet" href="/company-intelligence/ui/stock-section.css">','<script src="/company-intelligence/api/contract.js"></script>','<script src="/company-intelligence/config/rollout.js"></script>','<script src="/company-intelligence/ui/stock-section.js"></script>'];
const patch = lines => '--- a/file\n+++ b/file\n@@ -1,0 +2 @@\n'+lines.map(line=>'+'+line).join('\n')+'\n';
test('only the approved additive stock mount and asset imports qualify',()=>{
 assert.equal(permittedStockHook('quant/app/page-stock.js',patch([mount]),modulePaths),true);
 assert.equal(permittedStockHook('quant/index.html',patch(assets),modulePaths),true);
});
test('a Discover-only change cannot qualify by using the stock hook',()=>{
 for (const paths of [[],modulePaths.slice(0,1),modulePaths.slice(1)]) assert.equal(permittedStockHook('quant/app/page-stock.js',patch([mount]),paths),false);
});
test('removal, rename, copy and mode changes remain protected',()=>{
 for (const extra of ['-existingLogic();\n','old mode 100644\nnew mode 100755\n','rename from old.js\n','copy from old.js\n']) assert.equal(permittedStockHook('quant/app/page-stock.js',patch([mount])+extra,modulePaths),false);
});
test('a Quant logic change remains rejected alongside an approved mount',()=>{
 assert.equal(permittedStockHook('quant/app/page-stock.js',patch([mount,'recalculateQuantScore();']),modulePaths),false);
 assert.equal(permittedStockHook('quant/index.html',patch([...assets,'<script src="/unrelated.js"></script>']),modulePaths),false);
});
test('duplicate mounts and repeated script loading remain rejected',()=>{
 assert.equal(permittedStockHook('quant/app/page-stock.js',patch([mount,mount]),modulePaths),false);
 assert.equal(permittedStockHook('quant/index.html',patch([...assets,assets[0]]),modulePaths),false);
});
test('other protected files and empty patches receive no exception',()=>{
 assert.equal(permittedStockHook('quant/engines/core.js',patch([mount]),modulePaths),false);
 assert.equal(permittedStockHook('quant/app/page-stock.js','',modulePaths),false);
});
test('Git failures stop the check instead of reporting an empty diff',()=>{
 for(const result of [{status:128,stdout:''},{status:0,error:new Error('spawn failed'),stdout:''}]) assert.throws(()=>unexpectedProtectedChanges('base','head',['quant/index.html'],()=>result),/INTEGRATION_SCOPE_GIT_FAILED/);
});
test('real Git history retains the exception while rejecting later engine or stock logic changes',()=>{
 const root=mkdtempSync(join(tmpdir(),'intelligence-scope-'));
 const git=args=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 const put=(path,body)=>{mkdirSync(join(root,path,'..'),{recursive:true});writeFileSync(join(root,path),body);};
 const commit=()=>{git(['add','.']);git(['-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','fixture']);return git(['rev-parse','HEAD']);};
 const run=(cmd,args,opts)=>spawnSync(cmd,args,{...opts,cwd:root});
 try{
  git(['init','-q']);put('quant/app/page-stock.js','existingLogic();\n');put('quant/index.html','<html>\n');const base=commit();
  put('quant/app/page-stock.js','existingLogic();\n'+mount+'\n');put('quant/index.html','<html>\n'+assets.join('\n')+'\n');for(const path of modulePaths)put(path,'gated module fixture\n');const head=commit();
  assert.deepEqual(unexpectedProtectedChanges(base,head,['quant/app/page-stock.js','quant/index.html'],run),[]);
  put('quant/engines/core.js','changed engine\n');const engineHead=commit();assert.deepEqual(unexpectedProtectedChanges(base,engineHead,['quant/app/page-stock.js','quant/index.html','quant/engines/core.js'],run),['quant/engines/core.js']);
  put('quant/app/page-stock.js','replacementLogic();\n'+mount+'\n');const changedHead=commit();assert.deepEqual(unexpectedProtectedChanges(base,changedHead,['quant/app/page-stock.js','quant/index.html'],run),['quant/app/page-stock.js']);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('Master-page exception permits only the exact issuer mount and availability copy',async()=>{
 const {masterDetailIntegrationOnly}=await import('../master-detail-integration.mjs');
 const {readFileSync}=await import('node:fs');
 const after=readFileSync(new URL('../../../discover/ui/detail.js',import.meta.url),'utf8');
 const prior=spawnSync('git',['show','440a1645048d6b559988488f9a0f3148f21d3cdd:discover/ui/detail.js'],{encoding:'utf8'});assert.equal(prior.status,0);
 assert(masterDetailIntegrationOnly(prior.stdout,after));
 assert(!masterDetailIntegrationOnly(prior.stdout,after+'\nrecalculateQuant();\n'));
 assert(!masterDetailIntegrationOnly(prior.stdout,after.replace('caps.HAS_PRICE_HISTORY','true')));
 assert(!masterDetailIntegrationOnly(prior.stdout,after.replace('inst.symbol);','"WRONG_ISSUER");')));
});
