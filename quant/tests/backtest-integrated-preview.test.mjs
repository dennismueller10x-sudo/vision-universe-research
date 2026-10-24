import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Preview=require('../../server/quant-backtest-preview.cjs'),{materialize}=require('../../scripts/quant/materialize-real-backtest-read.cjs');
const root=resolve(import.meta.dirname,'../..'),folder=fs.mkdtempSync(join(tmpdir(),'vu-integrated-')),site=join(folder,'public'),directory=join(folder,'private'),key='6'.repeat(64);
fs.mkdirSync(join(site,'quant/app'),{recursive:true});fs.writeFileSync(join(site,'release-delivery.json'),JSON.stringify({status:'PASS',sourceCommit:'a'.repeat(40)}));
fs.writeFileSync(join(site,'quant/index.html'),'<html><head><script>document.documentElement.dataset.theme="light";</script></head><body><script src="/quant/release-bundle.js?v=123"></script></body></html>');
fs.writeFileSync(join(site,'quant/release-bundle.js'),'/* public code */');fs.writeFileSync(join(site,'quant/app/page-backtest.js'),'/* public lazy code */');
fs.symlinkSync(join(directory,'release.json'),join(site,'quant/stolen.json'));
materialize({root,output:directory,ids:['ref_NVDA']});
const app=Preview.create({root,directory,credentialKey:key,publicDirectory:site}),url=await app.listen(),origin=new URL(url).origin;
let cookie;
test.after(async()=>{await app.close();fs.rmSync(folder,{recursive:true,force:true});});
test('existing Quant entry and integration assets require a real server session',async()=>{
 assert.equal((await fetch(origin+'/quant/',{redirect:'manual'})).status,303);
 assert.equal((await fetch(url+'integrated.js')).status,401);
 assert.equal((await fetch(origin+'/quant/release-bundle.js')).status,401);
 const r=await fetch(url+'login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({key})});assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/Path=\//);cookie=r.headers.get('set-cookie').split(';')[0];
});
test('only existing public release HTML is augmented; CSP hashes preserve original initializers',async()=>{
 const r=await fetch(origin+'/quant/',{headers:{Cookie:cookie}});assert.equal(r.status,200);const html=await r.text();assert.ok(html.indexOf('internal-backtest/integrated.js')<html.indexOf('release-bundle.js'));
 assert.equal(html.includes(key),false);assert.match(r.headers.get('content-security-policy'),/script-src 'self' 'sha256-/);assert.equal(r.headers.get('content-security-policy').includes("script-src 'self' 'unsafe-inline'"),false);assert.match(r.headers.get('cache-control'),/no-store/);
 assert.equal((await fetch(origin+'/quant/app/page-backtest.js?v=123',{headers:{Cookie:cookie}})).status,200);
});
test('private roots, symlink escapes, direct inventories, other products and modified query never serve data',async()=>{
 for(const p of ['/quant/stolen.json','/release.json','/server/quant-backtest-store.cjs','/quant/internal-backtest/release.json','/discover/','/quant/index.html?preview=true']){
 const r=await fetch(origin+p,{headers:{Cookie:cookie}});assert.ok(r.status>=400,p);assert.equal((await r.text()).includes('summaryHash'),false);
 }
 assert.equal((await fetch(origin+'/quant/release-bundle.js?secret=true',{headers:{Cookie:cookie}})).status,400);
});
test('logout denies previously warmed product page, code and pinned data URLs',async()=>{
 await fetch(url+'logout',{method:'POST',headers:{Cookie:cookie,Origin:origin}});
 for(const p of ['/quant/release-bundle.js','/quant/internal-backtest/integrated.js','/quant/internal-backtest/data?ticker=NVDA']){const r=await fetch(origin+p,{headers:{Cookie:cookie,'If-None-Match':'previous'}});assert.equal(r.status,401);assert.match(r.headers.get('cache-control'),/no-store/);}
 assert.equal((await fetch(origin+'/quant/',{headers:{Cookie:cookie},redirect:'manual'})).status,303);
});
test('private outputs cannot become a public release and production entry has no integration loader',()=>{
 assert.throws(()=>Preview.create({root,directory,credentialKey:key,publicDirectory:directory}),/SEPARATE_PUBLIC_RELEASE/);
 const html=fs.readFileSync(join(root,'quant/index.html'),'utf8');assert.equal(html.includes('integrated.js'),false);assert.equal(html.includes('internal-backtest'),false);
 const source=fs.readFileSync(join(root,'scripts/quant/preview/integrated.js'),'utf8');assert.ok(source.includes('NOT_CERTIFIED'));assert.ok(source.includes("className:'line-benchmark'"));assert.equal(source.includes('localStorage'),false);
});
