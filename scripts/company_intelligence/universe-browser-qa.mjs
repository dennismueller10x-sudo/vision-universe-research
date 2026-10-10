/* Real existing Discover pages. Candidate overlays are explicitly labelled;
   live acceptance has no interception. Bounded representative browser sample. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {accessStateFor,STORAGE_KEY} from '../access-gate/build.mjs';
import {eligibilityRollout} from './eligibility-rollout.mjs';
import {eligibilityValid} from './universe-approval.mjs';
import {objectPool} from './bounded-objects.mjs';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const args=process.argv.slice(2),arg=k=>args[args.indexOf(k)+1],live=args.includes('--live'),directory=arg('--consumer'),out=arg('--out');
const origin='https://research.visionuniverse.de';mkdirSync(dirname(out),{recursive:true});
const sample=JSON.parse(readFileSync(arg('--sample')));
const proof=live?await(await fetch(origin+'/company-intelligence-refresh.json?qa='+Date.now())).json():null;
const m=live?proof.manifest:JSON.parse(readFileSync(join(directory,'manifest.json')));assert(eligibilityValid(m));assert.equal(m.generation,sample.generation);
const payloads=new Map();
await objectPool(Object.entries(m.assets),async ([path,meta])=>{
 const b=live?Buffer.from(await(await fetch(origin+'/company-intelligence/data/'+path+'?qa='+Date.now())).arrayBuffer()):readFileSync(join(directory,path));
 assert.equal(b.length,meta.bytes,path);assert.equal(createHash('sha256').update(b).digest('hex'),meta.sha256,path);payloads.set(path,b);
},12);
const browser=await chromium.launch({headless:true,args:['--no-sandbox']}),cases=[];
const state=accessStateFor(process.env.RESEARCH_ACCESS_PASSWORD),ui=readFileSync('company-intelligence/ui/stock-section.js'),contract=readFileSync('company-intelligence/api/contract.js');
const rollout=live?null:eligibilityRollout(readFileSync('company-intelligence/config/rollout.js','utf8'),m,{canary:true});
const release=await(await fetch(origin+'/release-delivery.json?qa='+Date.now())).json();
const tickers=sample.stocks,matrices=[...new Set([...sample.groups.HIGH_PROFILE,...sample.groups.SPARSE.slice(0,3),...sample.groups.INTERNATIONAL_ADR.slice(0,2)])];
const work=[...tickers.map(ticker=>({ticker,width:390,theme:'dark'})),...matrices.flatMap(ticker=>[390,430,768,1440].flatMap(width=>['dark','light'].filter(theme=>width!==390||theme!=='dark').map(theme=>({ticker,width,theme}))))];
let failure=null;
async function routes(page){
 if(live)return;
 await page.route('**/company-intelligence/data/**',route=>{const path=new URL(route.request().url()).pathname.split('/company-intelligence/data/')[1];return route.fulfill({status:payloads.has(path)?200:404,contentType:'application/json',body:payloads.get(path)||'{}'});});
 for(const [path,body] of [['config/rollout.js',rollout],['ui/stock-section.js',ui],['api/contract.js',contract]])await page.route('**/company-intelligence/'+path+'*',route=>route.fulfill({status:200,contentType:'application/javascript',body}));
}
try{
 const locked=await browser.newPage();let protectedRequests=0;locked.on('request',r=>{if(r.url().includes('/company-intelligence/data/'))protectedRequests++;});
 await locked.goto(origin+'/discover/#/s/US_REAL/AAPL');await locked.waitForSelector('#research-access-gate');assert.equal(protectedRequests,0);await locked.close();
 await objectPool(work,async ({ticker,width,theme})=>{
  const cid=Object.keys(m.eligibility).find(c=>m.eligibility[c].tickers.includes(ticker));assert(cid,ticker);
  const expected=JSON.parse(payloads.get(`snapshots/${m.generation}/${cid}.json`)),flags=m.eligibility[cid].modules;
  const page=await browser.newPage({viewport:{width,height:860},colorScheme:theme}),errors=[],requests=[];
  try{
   await routes(page);await page.addInitScript(({key,state,theme})=>{localStorage.setItem(key,JSON.stringify(state));localStorage.setItem('vu-discover-theme-v1',theme);},{key:STORAGE_KEY,state,theme});
   page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('/company-intelligence/data/'))requests.push({path:new URL(r.url()).pathname,status:r.status()});});
   await page.goto(origin+'/discover/#/s/US_REAL/'+ticker,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(({cid,generatedAt})=>{const e=document.querySelector('.ci-company-intelligence');return document.querySelector('#v2-main')?.getAttribute('aria-busy')==='false'&&e?.dataset.state==='AVAILABLE'&&e.dataset.companyId===cid&&e.dataset.generatedAt===generatedAt&&e.getAttribute('aria-busy')==='false';},{cid,generatedAt:expected.generatedAt},{timeout:30000});
   const chapter=page.locator('.ci-company-intelligence'),text=await chapter.innerText();
   assert.equal(await chapter.locator('.ci-profile[lang=de]').count()>0,flags.profile,ticker+':profile');
   assert.equal(await chapter.locator('.ci-kpi').count()>0,flags.financials,ticker+':financials');
   assert.equal(await chapter.locator('.ci-change').count()>0,flags.whatChanged,ticker+':changes');
   assert.equal(await chapter.locator('.ci-story[data-intelligence-type]:visible').count()>0,flags.aktuelles,ticker+':aktuelles');
   assert.equal(await chapter.locator('.ci-event').count()>0,flags.nextEvent,ticker+':events');
   assert.equal(await chapter.locator('.ci-missing-profile').count(),0);assert.equal(await page.locator('vu-navigation').count(),1);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,ticker+':overflow');assert.deepEqual(errors,[],ticker);
   assert(requests.some(r=>r.path.includes(m.generation)));assert(requests.every(r=>r.status===200));
   if(expected.latestFinancials.stale&&flags.financials)assert(text.includes('Veraltete Geschäftszahlen'));
   if(expected.events.some(e=>e.confirmationStatus==='ESTIMATED'))assert(text.includes('Geschätzt'));
   assert(!text.includes('keine Meldungen enthalten'));assert(!text.includes('Kein bestätigter kommender Termin'));
   const links=await chapter.locator('a').evaluateAll(as=>as.map(a=>({url:a.href,height:a.getBoundingClientRect().height})));assert(links.filter(l=>l.height>0).every(l=>l.height>=44&&l.url.startsWith('https:')));
   if(width===390&&theme==='dark'||matrices.includes(ticker)&&[430,1440].includes(width)&&theme==='dark')await chapter.screenshot({path:out+'-'+ticker+'-'+width+'-'+theme+'.png'});
   cases.push({ticker,cid,width,theme,status:'PASS',modules:flags});
  }catch(e){failure={ticker,cid,width,theme,message:String(e.message).slice(0,600),errors,requests};await page.screenshot({path:out+'-failure.png'});throw e;}finally{await page.close();}
 },3);
 for(const ticker of sample.ineligible){
  const page=await browser.newPage({viewport:{width:390,height:860}});await routes(page);await page.addInitScript(({key,state})=>localStorage.setItem(key,JSON.stringify(state)),{key:STORAGE_KEY,state});let requests=0;const errors=[];
  page.on('request',r=>{if(r.url().includes('/company-intelligence/data/'))requests++;});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/discover/#/s/US_REAL/'+ticker);await page.waitForFunction(()=>document.querySelector('#v2-main')?.getAttribute('aria-busy')==='false',null,{timeout:30000});
  assert.equal(requests,0,ticker+':ineligible-request');assert.equal(await page.locator('.ci-company-intelligence').count(),0,ticker);assert.equal(await page.locator('vu-navigation').count(),1);assert.deepEqual(errors,[]);
  cases.push({ticker,status:'PASS',eligible:false,consumerRequests:0});await page.close();
 }
 writeFileSync(out,JSON.stringify({status:'PASS',mode:live?'ACTUAL_PRODUCTION':'REAL_DISCOVER_ROUTED_CANDIDATE',generation:m.generation,sourceCommit:release.sourceCommit,seed:sample.seed,verifiedAssets:payloads.size,protectedAccess:true,cases},null,2)+'\n');
}catch(e){writeFileSync(out,JSON.stringify({status:'FAIL',mode:live?'ACTUAL_PRODUCTION':'REAL_DISCOVER_ROUTED_CANDIDATE',generation:m.generation,failure,completedCases:cases.length},null,2)+'\n');throw e;}finally{await browser.close();}
