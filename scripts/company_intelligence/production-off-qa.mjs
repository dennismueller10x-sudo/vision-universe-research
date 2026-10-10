import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {accessStateFor,STORAGE_KEY} from '../access-gate/build.mjs';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const out=process.env.RUNNER_TEMP+'/live-off',origin='https://research.visionuniverse.de';mkdirSync(out,{recursive:true});
const index=await(await fetch(origin+'/company-intelligence/data/index.json?off-proof='+Date.now())).json();assert.equal(index.state,'DISABLED');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']}),state=accessStateFor(process.env.RESEARCH_ACCESS_PASSWORD),cases=[];
try{for(const product of ['discover','quant'])for(const width of [390,430,768,1440]){
 const page=await browser.newPage({viewport:{width,height:860}}),requests=[],errors=[];
 await page.addInitScript(({key,state})=>localStorage.setItem(key,JSON.stringify(state)),{key:STORAGE_KEY,state});
 page.on('request',r=>{if(r.url().includes('/company-intelligence/data/'))requests.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+(product==='discover'?'/discover/#/s/US_REAL/AAPL':'/quant/#/aktie/AAPL'));
 // The existing access gate restores application scripts asynchronously.
 // Wait for the real hard-off runtime instead of assuming a 1.5-second load.
 await page.waitForFunction(()=>globalThis.VUCompanyIntelligenceRollout?.stage===0&&globalThis.VUCompanyIntelligenceRollout?.productionOff===true);
 await page.waitForTimeout(1500);
 assert.equal(await page.locator('#research-access-gate').count(),0);assert.equal(await page.locator('.ci-company-intelligence').count(),0);assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.evaluate(()=>VUCompanyIntelligenceRollout.stage),0);cases.push({product,width,status:'PASS',consumerRequests:0});await page.close();
}writeFileSync(out+'/report.json',JSON.stringify({status:'PASS',origin,gate:'CLOSED',cases},null,2)+'\n');console.log('PRODUCTION_OFF_8_CASES_PASS');}finally{await browser.close();}
