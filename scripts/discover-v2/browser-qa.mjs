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
const engine=arg('engine','chromium');assert(['chromium','webkit'].includes(engine));
const browser=await playwright[engine].launch({headless:true,...(engine==='chromium'?{executablePath:process.env.CHROMIUM_PATH||undefined}:{})});
const checks=[],errors=[],shots=[],performance=[],accessibility=[],firstScreenEvidence=[],interactionEvidence=[];
let axePath;try{axePath=require.resolve('axe-core/axe.min.js');}catch{}
async function a11y(page,key){if(!axePath)throw Error('axe-core required for accessibility gate');await page.addScriptTag({path:axePath});const result=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}));accessibility.push({key,violations:result.violations,incomplete:result.incomplete});assert.deepEqual(result.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);}
async function check(name,fn){const started=Date.now();try{await fn();checks.push({name,pass:true,milliseconds:Date.now()-started});}catch(e){checks.push({name,pass:false,milliseconds:Date.now()-started,error:e.message});}}
async function screenshot(page,name){const path=out+'/'+name+'.png';await page.screenshot({path,fullPage:false});shots.push(path);}
try{
for(const width of (engine==='webkit'?[390]:[320,390,1440]))for(const colorScheme of (engine==='webkit'?['dark']:['light','dark'])){
 const ctx=await browser.newContext({viewport:{width,height:width<500?844:900},colorScheme,hasTouch:width<500,isMobile:width<500,deviceScaleFactor:1});
 const page=await ctx.newPage();const key=width+'-'+colorScheme+(engine==='webkit'?'-webkit':'');
 page.on('pageerror',e=>errors.push({key,message:e.message}));
 const bad=[];page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)bad.push({status:r.status(),url:r.url()});});
 const entryStarted=Date.now();await page.goto(base+'/discover-v2/',{waitUntil:'networkidle'});await page.waitForTimeout(700);
 await check(key+' noindex',async()=>assert((await page.locator('meta[name=robots]').getAttribute('content')).includes('noindex')));
 await check(key+' main visible',async()=>assert(await page.locator('main').isVisible()));
 await check(key+' five-second entry heuristic',async()=>{const text=await page.locator('body').innerText();assert(/Aktien/.test(text)&&/entdeck|versteh/i.test(text),'Entry does not explain the purpose');const viewport=page.viewportSize();const targets=[['purpose',page.locator('h1')],['search',page.locator('.v2-search-prompt')],['hero action',page.locator('.v2-stock-hero .v2-stock-cta').first()]];const bounds=[];for(const [label,target] of targets){const box=await target.boundingBox();assert(box&&box.width>0&&box.height>0,label+' missing');assert(box.x>=0&&box.y>=70&&box.x+box.width<=viewport.width+1&&box.y+box.height<=viewport.height-75,label+' outside unobstructed first viewport');bounds.push({label,...box});}const milliseconds=Date.now()-entryStarted;firstScreenEvidence.push({key,milliseconds,bounds});assert(milliseconds<=5000,'First-screen content took '+milliseconds+' ms locally');});
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
 await check(key+' search opens traps focus and restores it',async()=>{const opener=page.locator('.v2-dock-search');await opener.click();const input=page.locator('input[type=search]').first();await input.waitFor({state:'visible'});await input.fill('AAPL');await page.waitForTimeout(800);assert(/Apple|AAPL/.test(await page.locator('body').innerText()));for(let i=0;i<12;i++){await page.keyboard.press(i<6?'Tab':'Shift+Tab');assert(await page.locator('.dx-search').evaluate(n=>n.contains(document.activeElement)),'Focus escaped search');}await screenshot(page,key+'-search');if(width===390)await check(key+' search accessibility',()=>a11y(page,key+'-search'));await page.keyboard.press('Escape');await input.waitFor({state:'hidden'});assert(await opener.evaluate(n=>n===document.activeElement),'Search opener focus not restored');});
 await page.goto(base+'/discover-v2/#/s/US_REAL/AAPL',{waitUntil:'networkidle'});await page.waitForTimeout(1000);
 await check(key+' stock identity and chart',async()=>{assert(/Apple|AAPL/.test(await page.locator('main').innerText()));assert(await page.locator('main svg').count()>0,'No visual chart');});
 await check(key+' stock overflow',async()=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)));
 await screenshot(page,key+'-stock');
 await check(key+' chart price and source visible early',async()=>{const hero=page.locator('.dx-chart-hero').first();const bounds=await hero.boundingBox();assert(bounds,'Missing chart price hero');if(width<500)assert(bounds.y<=420,'Mobile chart price starts below 420px: '+bounds.y);const text=await hero.innerText();assert(/\d/.test(text)&&/Kurs|Schluss|Stand|Heute|Handelstag/i.test(text),'Missing source/session evidence: '+text);interactionEvidence.push({key,type:'chart-hero',bounds,text});});
 await check(key+' unavailable chart ranges disabled',async()=>{const wrong=await page.locator('.dx-tf button').evaluateAll(nodes=>nodes.filter(n=>n.getAttribute('aria-disabled')==='true'&&!n.disabled).map(n=>n.textContent));assert.deepEqual(wrong,[]);assert(await page.locator('.dx-tf button').count()>0);});
 await check(key+' chart range updates evidence',async()=>{const samples=[];for(const [label,range,word] of [['1M','1M','Monat'],['1J','1Y','Jahr']]){const button=page.locator('.dx-tf').getByRole('button',{name:label,exact:true});assert(await button.isEnabled(),'AAPL range unavailable: '+label);await button.click();await page.locator('.dx-range-chart-wrap[data-range="'+range+'"]').waitFor();assert.equal(await button.getAttribute('aria-pressed'),'true');const evidence=await page.locator('.dx-chart-hero').innerText();assert(evidence.includes(word),'Range context missing: '+evidence);samples.push({label,evidence});}assert.notEqual(samples[0].evidence,samples[1].evidence,'Range data did not update');interactionEvidence.push({key,type:'chart-range',samples});});
 await check(key+' stock accessibility',()=>a11y(page,key+'-stock'));
 await check(key+' fundamental metric changes visual evidence',async()=>{const journey=page.locator('#journey');await journey.scrollIntoViewIfNeeded();const tabs=journey.getByRole('tab');assert(await tabs.count()>=2,'AAPL needs multiple canonical metrics');const first=await journey.locator('.dx-journey-kopf').innerText();const svgBefore=await journey.locator('.dx-journey-bild').innerHTML();await tabs.nth(1).click();assert.equal(await tabs.nth(1).getAttribute('aria-selected'),'true');assert.equal(await tabs.nth(0).getAttribute('aria-selected'),'false');const second=await journey.locator('.dx-journey-kopf').innerText();assert(first!==second&&svgBefore!==await journey.locator('.dx-journey-bild').innerHTML(),'Fundamental visual did not change');interactionEvidence.push({key,type:'fundamental-metric',metric:await tabs.nth(1).innerText(),before:first,after:second});await journey.evaluate(n=>n.scrollIntoView({block:'start',behavior:'instant'}));await screenshot(page,key+'-fundamentals');});
 await page.goto(base+'/discover-v2/#/einzeln/US_REAL',{waitUntil:'networkidle'});
 await check(key+' feed is bounded and swipes one screen',async()=>{
  const track=page.locator('.dx-feed-spur');await track.waitFor();
  const count=await page.locator('.dx-feed-screen[data-symbol]').count();assert(count>0&&count<=24,'Initial feed eagerly rendered '+count+' cards');
  const visible=()=>track.evaluate(n=>{const bounds=n.getBoundingClientRect();const cards=Array.from(n.querySelectorAll('.dx-feed-screen[data-symbol]')).map(card=>{const box=card.getBoundingClientRect();return {symbol:card.dataset.symbol,index:card.dataset.index,visibleHeight:Math.max(0,Math.min(box.bottom,bounds.bottom)-Math.max(box.top,bounds.top))};}).sort((a,b)=>b.visibleHeight-a.visibleHeight);return {height:n.clientHeight,viewport:innerHeight,scrollTop:n.scrollTop,card:cards[0]};});
  const before=await visible();assert(before.height>100&&before.height<=before.viewport,'Feed track is not viewport-bounded');
  const counterBefore=await page.locator('.dx-feed-zaehler').innerText();
  await track.evaluate(n=>{n.scrollTop=n.clientHeight;});await page.waitForTimeout(700);
  const after=await visible(),counterAfter=await page.locator('.dx-feed-zaehler').innerText();
  assert(after.scrollTop>0,'Feed did not scroll');assert.notEqual(after.card.symbol,before.card.symbol,'Visible stock did not change');assert.equal(after.card.index,'1','One screen scroll did not reach second stock');assert.notEqual(counterAfter,counterBefore,'Feed counter did not follow visible stock');assert(/^2 von /i.test(counterAfter),'Counter does not identify second stock: '+counterAfter);
  interactionEvidence.push({key,type:'feed-single-screen',initialCards:count,before,after,counterBefore,counterAfter});
  await screenshot(page,key+'-feed-second-stock');
 });
 await check(key+' feed continues beyond first batch',async()=>{await page.locator('.dx-feed-spur').waitFor();for(let i=0;i<3&&await page.locator('.dx-feed-screen[data-symbol]').count()<=12;i++){await page.locator('.dx-feed-spur').evaluate(n=>{n.scrollTop=n.scrollHeight;});await page.waitForTimeout(700);}const symbols=await page.locator('.dx-feed-screen[data-symbol]').evaluateAll(nodes=>nodes.map(n=>n.dataset.symbol));assert(symbols.length>12,'Feed stopped after first batch');assert.equal(symbols.length,new Set(symbols).size,'Feed contains duplicate symbols');});
 await screenshot(page,key+'-feed');
 if(width===390)await check(key+' feed accessibility',()=>a11y(page,key+'-feed'));
 await check(key+' feed exit cleanup',async()=>{await page.locator('.dx-feed-zurueck').click();await page.locator('.v2-home').waitFor({state:'visible'});assert(!await page.locator('body').evaluate(n=>n.classList.contains('dx-feed-aktiv')||n.classList.contains('v2-feed-active')));assert.equal(await page.locator('.dx-feed').count(),0);});
 if(engine==='chromium'&&width===390&&colorScheme==='dark')await check(key+' complete canonical home journey',async()=>{
  const meta=await (await page.request.get(base+'/discover/data/meta.json')).json();
  const contract=meta.home.find(h=>h.universeId==='US_REAL');
  const chunks=await Promise.all(contract.chunks.map(async path=>(await (await page.request.get(base+path)).json())));
  const expected=chunks.reduce((n,chunk)=>n+chunk.surfaces.length,0);
  for(let attempt=0;attempt<6&&await page.locator('.v2-finish').count()===0;attempt++){
   await page.evaluate(()=>scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
   await page.waitForTimeout(700);
  }
  assert.equal(await page.locator('.v2-finish').count(),1,'Journey must end once');
  assert.equal(await page.locator('.v2-load-more').count(),0,'Unloaded chunk remains');
  const surfaces=await page.locator('.v2-journey > :not(.v2-finish)').evaluateAll(nodes=>nodes.map(n=>({id:n.getAttribute('data-surface'),className:n.className,title:n.querySelector('h2')?.textContent||''})));
  assert(surfaces.length>=30,'Discovery journey is prematurely short');assert.equal(surfaces.length,expected,'Not every canonical surface was rendered');
  const ids=surfaces.map(s=>s.id).filter(Boolean);assert.equal(ids.length,new Set(ids).size,'Duplicated discovery surfaces');
  interactionEvidence.push({key,type:'complete-home',chunks:chunks.length,expected,rendered:surfaces.length,surfaces});
  await page.locator('.v2-journey > :not(.v2-finish)').nth(Math.max(0,surfaces.length-4)).scrollIntoViewIfNeeded();await screenshot(page,key+'-late-discovery');
  await page.locator('.v2-finish').scrollIntoViewIfNeeded();await screenshot(page,key+'-journey-finish');
 });
 await check(key+' no local HTTP errors',async()=>assert.deepEqual(bad,[]));
 await ctx.close();
}
await check('no uncaught page errors',async()=>assert.deepEqual(errors,[]));
}catch(e){checks.push({name:'browser suite completion',pass:false,error:e.stack||e.message});}finally{await browser.close();}
const report={status:checks.every(x=>x.pass)?'PASS':'FAIL',checks,errors,shots,performance,limitations:['Five-second check is an automated content heuristic, not an independent human usability test.','Screenshots require visual review.','A Saturday run cannot prove receipt of regular-session realtime trades.','Automated structural checks are not a WCAG certification.','Local resource measurements are not a production latency SLA.']};
report.engine=engine;report.firstScreenEvidence=firstScreenEvidence;report.interactionEvidence=interactionEvidence;
await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,totalChecks:checks.length,passed:checks.filter(c=>c.pass).length,failed:checks.filter(c=>!c.pass),screenshots:shots.length,firstScreenMilliseconds:firstScreenEvidence.map(e=>({key:e.key,milliseconds:e.milliseconds})),totalCheckMilliseconds:checks.reduce((n,c)=>n+(c.milliseconds||0),0)},null,2));if(report.status!=='PASS')process.exitCode=1;
await writeFile(out+'/accessibility.json',JSON.stringify(accessibility,null,2));
