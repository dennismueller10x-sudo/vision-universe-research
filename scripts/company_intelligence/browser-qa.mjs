#!/usr/bin/env node
/* Optional existing Playwright tooling against real packaged stock pages.
   No generated history is committed. Attack cases modify responses only in-browser. */
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url), {chromium}=require('playwright');
const arg=(k,f)=>{const i=process.argv.indexOf('--'+k);return i<0?f:process.argv[i+1]};
const base=arg('url','http://127.0.0.1:8783').replace(/\/$/,''), out=arg('out','/tmp/intelligence-browser-qa');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.CHROMIUM_PATH||undefined});
const cases=[];
const route=(product,ticker,preview=true)=>product==='quant'?`/quant/${preview?'?company-intelligence=preview':''}#/aktie/${ticker}`:`/discover/${preview?'?company-intelligence=preview':''}#/s/US_REAL/${ticker}`;
try{
 for(const product of ['quant','discover']){
  for(const ticker of ['AAPL','NVDA','TSLA','MSFT','ROOT','GOOG','CHE'])for(const width of [390,430,768,1440]){
   const page=await browser.newPage({viewport:{width,height:860}}), errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+route(product,ticker));await page.waitForFunction(()=>document.querySelector('.ci-company-intelligence')?.textContent.includes('Letzte Quartalszahlen'));
   const chapter=page.locator('.ci-company-intelligence');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await chapter.evaluate(e=>e.scrollWidth>e.clientWidth),false);assert.deepEqual(errors,[]);
   if(width===390&&['NVDA','ROOT','CHE'].includes(ticker)){await chapter.screenshot({path:`${out}/${product}-${ticker}.png`});await writeFile(`${out}/${product}-${ticker}.txt`,await chapter.innerText())}
   cases.push({product,ticker,width,status:'PASS'});await page.close();
  }
  const page=await browser.newPage(), requests=[];page.on('request',r=>{if(r.url().includes('/company-intelligence/data/'))requests.push(r.url())});await page.goto(base+route(product,'AAPL',false));await page.waitForTimeout(1200);assert.equal(await page.locator('.ci-company-intelligence').count(),0);assert.deepEqual(requests,[]);cases.push({product,kind:'DISABLED_ZERO_REQUESTS',status:'PASS'});await page.close();
  for(const attack of ['FETCH_503','GENERATION_MISMATCH','EXPIRED_SNAPSHOT','LOW_PRIORITY_AND_OLD_AMENDMENT','PAST_TIMED_CALL','BERLIN_DATE_BOUNDARY','XSS_AND_UNSAFE_LINK']){
   const p=await browser.newPage({viewport:{width:390,height:860}});
   if(attack==='FETCH_503')await p.route('**/company-intelligence/data/index.json',r=>r.fulfill({status:503,body:'{}'}));
   if(attack==='GENERATION_MISMATCH')await p.route('**/company-intelligence/data/**/lookup/AA.json',async r=>{const response=await r.fetch(), body=await response.json();body.generation='0'.repeat(24);await r.fulfill({response,json:body})});
   if(attack==='EXPIRED_SNAPSHOT')await p.route('**/company-intelligence/data/**/iss_cik_0000320193.json',async r=>{const response=await r.fetch(),body=await response.json();body.generatedAt=new Date(Date.now()-8*86400000).toISOString().replace(/\.\d{3}Z$/,'Z');await r.fulfill({response,json:body})});
   if(attack==='LOW_PRIORITY_AND_OLD_AMENDMENT')await p.route('**/company-intelligence/data/**/iss_cik_0000320193.json',async r=>{const response=await r.fetch(),body=await response.json();body.news=[];body.materialEvents=[{companyId:body.companyId,eventId:'routine',eventType:'MATERIAL_SEC_EVENT',importance:'MEDIUM',secItems:['5.02'],date:body.generatedAt.slice(0,10)}];body.earnings=[{companyId:body.companyId,eventId:'amendment',eventType:'PERIODIC_REPORT_PUBLISHED',isAmendment:true,fiscalQuarter:'Q1',fiscalYear:2021,date:body.generatedAt.slice(0,10)},{companyId:body.companyId,eventId:'report',eventType:'PERIODIC_REPORT_PUBLISHED',fiscalQuarter:'Q3',fiscalYear:2026,date:body.generatedAt.slice(0,10)}];await r.fulfill({response,json:body})});
   if(attack==='PAST_TIMED_CALL')await p.route('**/company-intelligence/data/**/iss_cik_0000320193.json',async r=>{const response=await r.fetch(),body=await response.json(),past=new Date(Date.now()-3600000).toISOString();body.events=[{companyId:body.companyId,eventId:'past-call',eventType:'EARNINGS_CALL',confirmationStatus:'CONFIRMED',date:past.slice(0,10),time:past.slice(11,19),timezone:'UTC',startsAt:past,headline:'Vergangenes Gespräch',sourceUrl:'https://www.apple.com/'}];body.calls=[];await r.fulfill({response,json:body})});
   if(attack==='BERLIN_DATE_BOUNDARY')await p.route('**/company-intelligence/data/**/iss_cik_0000320193.json',async r=>{const response=await r.fetch(),body=await response.json();body.events=[{companyId:body.companyId,eventId:'overnight-call',eventType:'EARNINGS_CALL',confirmationStatus:'CONFIRMED',date:'2026-10-24',time:'23:30:00',timezone:'UTC',startsAt:'2026-10-24T23:30:00Z',headline:'Gespräch an der Datumsgrenze',sourceUrl:'https://www.apple.com/'}];body.calls=[];await r.fulfill({response,json:body})});
   if(attack==='XSS_AND_UNSAFE_LINK')await p.route('**/company-intelligence/data/**/iss_cik_0000320193.json',async r=>{const response=await r.fetch(),body=await response.json();body.news=[{companyId:body.companyId,newsId:'attack',headline:'<img src=x onerror="window.__intelligenceXss=true">',canonicalUrl:'javascript:window.__intelligenceXss=true',publishedAt:body.generatedAt,importance:'CRITICAL'}];body.materialEvents=[];await r.fulfill({response,json:body})});
   await p.goto(base+route(product,'AAPL'));await p.waitForFunction(()=>document.querySelector('.ci-company-intelligence h2'));
   if(attack==='LOW_PRIORITY_AND_OLD_AMENDMENT'){const text=await p.locator('.ci-block').first().innerText();assert(text.includes('FY 2026'));assert(!text.includes('FY 2021'));assert(!text.includes('Management'))}
   else if(attack==='PAST_TIMED_CALL'){const next=p.locator('.ci-block').filter({has:p.getByRole('heading',{name:'Nächste Quartalszahlen'})});assert((await next.innerText()).includes('Noch kein belastbarer Termin'));assert(!(await p.locator('.ci-company-intelligence').innerText()).includes('Vergangenes Gespräch'));}
   else if(attack==='BERLIN_DATE_BOUNDARY'){const next=p.locator('.ci-block').filter({has:p.getByRole('heading',{name:'Nächste Quartalszahlen'})});assert((await next.innerText()).includes('25. Okt. 2026'));assert(!(await next.innerText()).includes('24. Okt. 2026'));assert((await next.innerText()).includes('01:30'));}
   else if(attack==='XSS_AND_UNSAFE_LINK'){await p.waitForFunction(()=>document.querySelector('.ci-company-intelligence')?.textContent.includes('<img'));assert.equal(await p.evaluate(()=>window.__intelligenceXss),undefined);assert.equal(await p.locator('.ci-company-intelligence img, .ci-company-intelligence a[href^="javascript:"]').count(),0)}
   else await p.waitForFunction(()=>document.querySelector('.ci-company-intelligence')?.textContent.includes('derzeit nicht verfügbar'));
   cases.push({product,kind:attack,status:'PASS'});await p.close();
  }
 }
 await writeFile(out+'/report.json',JSON.stringify({status:'PASS',cases},null,2));console.log(JSON.stringify({status:'PASS',cases:cases.length,responsiveCases:56,disabledCases:2,adversarialCases:14}));
}finally{await browser.close()}
