#!/usr/bin/env node
// Real-browser checks; no fixture interception and no simulated market data.
// Usage: node scripts/discover-v2/browser-qa.mjs --url http://127.0.0.1:8765 --out /tmp/discover-v2-qa
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
let playwright;
try{playwright=require('playwright');}catch{playwright=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');}
const arg=(key,otherwise)=>{const i=process.argv.indexOf('--'+key);return i<0?otherwise:process.argv[i+1];};
const base=arg('url','http://127.0.0.1:8765').replace(/\/$/,'');
const out=arg('out','/tmp/discover-v2-qa');await mkdir(out,{recursive:true});
const browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined});
const checks=[],errors=[],shots=[],performance=[],accessibility=[];
let axePath;try{axePath=require.resolve('axe-core/axe.min.js');}catch{}
async function a11y(page,key){if(!axePath)throw Error('axe-core required for accessibility gate');await page.addScriptTag({path:axePath});const result=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}));accessibility.push({key,violations:result.violations,incomplete:result.incomplete});assert.deepEqual(result.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);}
async function check(name,fn){try{await fn();checks.push({name,pass:true});}catch(e){checks.push({name,pass:false,error:e.message});}}
async function screenshot(page,name){const path=out+'/'+name+'.png';await page.screenshot({path,fullPage:false});shots.push(path);}
try{
for(const width of [320,390,1440])for(const colorScheme of ['light','dark']){
 const ctx=await browser.newContext({viewport:{width,height:width<500?844:900},colorScheme,hasTouch:width<500,isMobile:width<500,deviceScaleFactor:1});
 const page=await ctx.newPage();const key=width+'-'+colorScheme;
 page.on('pageerror',e=>errors.push({key,message:e.message}));
 const bad=[];page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)bad.push({status:r.status(),url:r.url()});});
 await page.goto(base+'/discover-v2/',{waitUntil:'networkidle'});await page.waitForTimeout(700);
 await check(key+' noindex',async()=>assert((await page.locator('meta[name=robots]').getAttribute('content')).includes('noindex')));
 await check(key+' main visible',async()=>assert(await page.locator('main').isVisible()));
 await check(key+' five-second entry heuristic',async()=>{const text=await page.locator('body').innerText();assert(/Aktien/.test(text)&&/entdeck|versteh/i.test(text),'Entry does not explain the purpose');assert(await page.getByRole('button',{name:/Such/i}).count()>0,'Search not obvious');});
 await check(key+' no horizontal page overflow',async()=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)));
 await check(key+' stock discovery links',async()=>assert(await page.locator('main a[href*="/s/"]').count()>=4));
 await check(key+' visible controls named',async()=>{const missing=await page.locator('main button').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length&&!((n.getAttribute('aria-label')||n.textContent||'').trim())).map(n=>n.outerHTML));assert.deepEqual(missing,[]);});
 await check(key+' document structure',async()=>{assert.equal(await page.locator('main').count(),1);assert.equal(await page.locator('h1').count(),1);assert.equal(await page.locator('html').getAttribute('lang'),'de');});
 performance.push({view:'home',key,...await page.evaluate(()=>({resources:performance.getEntriesByType('resource').map(r=>({url:r.name,bytes:r.decodedBodySize,duration:r.duration})),navigation:performance.getEntriesByType('navigation').map(r=>({domContentLoaded:r.domContentLoadedEventEnd,load:r.loadEventEnd})),domNodes:document.querySelectorAll('*').length}))});
 await check(key+' incremental view resource budget',async()=>{const resources=performance.at(-1).resources.filter(r=>new URL(r.url).pathname.startsWith('/discover-v2/'));assert(resources.reduce((n,r)=>n+r.bytes,0)<=150000,'New view scripts/styles exceed 150 KB decoded');assert(resources.length<=12,'New view adds more than 12 requests');});
 await check(key+' home accessibility',()=>a11y(page,key+'-home'));
 await check(key+' navigation versions',async()=>{const nav=page.locator('vu-navigation');assert.equal(await nav.locator('a[href="/discover/"]').count(),1);assert.equal(await nav.locator('a[href="/discover-v2/"]').count(),1);});
 await screenshot(page,key+'-home');
 await page.evaluate(()=>scrollTo(0,innerHeight));await screenshot(page,key+'-discovery');
 await check(key+' search opens and closes',async()=>{await page.getByRole('button',{name:/Such/i}).first().click();const input=page.locator('input[type=search]').first();await input.waitFor({state:'visible'});await input.fill('AAPL');await page.waitForTimeout(800);assert(/Apple|AAPL/.test(await page.locator('body').innerText()));await screenshot(page,key+'-search');await page.keyboard.press('Escape');assert(!await input.isVisible(),'Escape must close search');});
 await page.goto(base+'/discover-v2/#/s/US_REAL/AAPL',{waitUntil:'networkidle'});await page.waitForTimeout(1000);
 await check(key+' stock identity and chart',async()=>{assert(/Apple|AAPL/.test(await page.locator('main').innerText()));assert(await page.locator('main svg').count()>0,'No visual chart');});
 await check(key+' stock overflow',async()=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)));
 await screenshot(page,key+'-stock');
 await check(key+' unavailable chart ranges disabled',async()=>{const wrong=await page.locator('.dx-tf button').evaluateAll(nodes=>nodes.filter(n=>n.getAttribute('aria-disabled')==='true'&&!n.disabled).map(n=>n.textContent));assert.deepEqual(wrong,[]);assert(await page.locator('.dx-tf button').count()>0);});
 await check(key+' stock accessibility',()=>a11y(page,key+'-stock'));
 await page.evaluate(()=>scrollTo(0,innerHeight));await screenshot(page,key+'-fundamentals');
 await page.goto(base+'/discover-v2/#/einzeln/US_REAL',{waitUntil:'networkidle'});
 await check(key+' feed continues beyond first batch',async()=>{await page.locator('.dx-feed-spur').waitFor();for(let i=0;i<3&&await page.locator('.dx-feed-screen[data-symbol]').count()<=12;i++){await page.locator('.dx-feed-spur').evaluate(n=>{n.scrollTop=n.scrollHeight;});await page.waitForTimeout(700);}const symbols=await page.locator('.dx-feed-screen[data-symbol]').evaluateAll(nodes=>nodes.map(n=>n.dataset.symbol));assert(symbols.length>12,'Feed stopped after first batch');assert.equal(symbols.length,new Set(symbols).size,'Feed contains duplicate symbols');});
 await screenshot(page,key+'-feed');
 await check(key+' feed exit cleanup',async()=>{await page.locator('.dx-feed-zurueck').click();await page.locator('.v2-home').waitFor({state:'visible'});assert(!await page.locator('body').evaluate(n=>n.classList.contains('dx-feed-aktiv')||n.classList.contains('v2-feed-active')));assert.equal(await page.locator('.dx-feed').count(),0);});
 await check(key+' no local HTTP errors',async()=>assert.deepEqual(bad,[]));
 await ctx.close();
}
await check('no uncaught page errors',async()=>assert.deepEqual(errors,[]));
}finally{await browser.close();}
const report={status:checks.every(x=>x.pass)?'PASS':'FAIL',checks,errors,shots,performance,limitations:['Five-second check is an automated content heuristic, not an independent human usability test.','Screenshots require visual review.','A Saturday run cannot prove receipt of regular-session realtime trades.','Automated structural checks are not a WCAG certification.','Local resource measurements are not a production latency SLA.']};
await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(report.status!=='PASS')process.exitCode=1;
await writeFile(out+'/accessibility.json',JSON.stringify(accessibility,null,2));
