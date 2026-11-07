import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {startServer} from './server.mjs';
const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const {chromium}=createRequire(import.meta.url)('playwright'),root=arg('--root'),out=arg('--out','/tmp/e5-early-head.json');
if(!root)throw Error('USAGE: early-head-qa.mjs --root <release> [--out <report>]');
const server=await startServer(root),base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({executablePath:arg('--browser','/usr/bin/chromium')}),checks=[];
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 let release;const gate=new Promise(r=>release=r);await page.route('**/quant/release-bundle.js*',async route=>{await gate;await route.continue();});
 await page.goto(base+'/quant/#/aktie/NVDA',{waitUntil:'commit'});
 await page.locator('.vu-shead-value').waitFor();
 const before=await page.evaluate(()=>{window.__e5Head=document.querySelector('.vu-shead');window.__e5Question=document.querySelector('.qv3-step-q');return {price:document.querySelector('.vu-shead-value').textContent,count:document.querySelectorAll('.vu-shead').length,routerLoaded:!!window.QXStock};});
 assert.equal(before.count,1);assert.equal(before.routerLoaded,false);assert.match(before.price,/\d/);checks.push({name:'real price appears while full router is blocked',...before});
 release();await page.waitForFunction(()=>document.querySelector('#qx-main')?.dataset.ready==='true',{timeout:60000});
 const after=await page.evaluate(()=>({sameHead:window.__e5Head===document.querySelector('.vu-shead'),sameQuestion:window.__e5Question===document.querySelector('#einordnung-kurz .qv3-step-q'),count:document.querySelectorAll('.vu-shead').length}));assert.deepEqual(after,{sameHead:true,sameQuestion:true,count:1});checks.push({name:'full router adopts existing head and question',...after});
 await page.evaluate(()=>location.hash='#/aktie/NVDA?tab=methodik');await page.waitForTimeout(100);await page.waitForFunction(()=>document.querySelector('#qx-main')?.dataset.ready==='true',{timeout:60000});assert.equal(await page.locator('.vu-shead-name').count(),1);assert(await page.locator('.vu-shead-name').innerText());checks.push({name:'same-stock navigation has exactly one visible head'});
 await page.evaluate(()=>location.hash='#/aktien');await page.waitForTimeout(100);await page.waitForFunction(()=>document.querySelector('#qx-main')?.dataset.ready==='true',{timeout:60000});await page.evaluate(()=>location.hash='#/aktie/NVDA');await page.waitForTimeout(100);await page.waitForFunction(()=>document.querySelector('#qx-main')?.dataset.ready==='true',{timeout:60000});assert.equal(await page.locator('.vu-shead').count(),1);checks.push({name:'list/detail return does not reuse a disposed early head'});assert.deepEqual(errors,[]);await context.close();
 const tc=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),tp=await tc.newPage();let resume;const hold=new Promise(r=>resume=r);await tp.route('**/quant/engines/technical/feature-store.js*',async route=>{await hold;await route.continue();});await tp.goto(base+'/technical/#/chart/NVDA',{waitUntil:'domcontentloaded'});await tp.locator('.vu-shead-value').waitFor({timeout:30000});assert.match(await tp.locator('.vu-shead-value').innerText(),/\d/);checks.push({name:'Technical displays its validated instrument price while chart engines are blocked'});resume();await tp.waitForTimeout(1000);await tc.close();
 console.log(JSON.stringify({checks}));await writeFile(out,JSON.stringify({checks},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
