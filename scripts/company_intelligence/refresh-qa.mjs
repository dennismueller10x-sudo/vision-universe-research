/* Read-only real Discover UI. Candidate mode intercepts consumer bytes only;
   live mode verifies the actually served bytes without interception. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import {accessStateFor,STORAGE_KEY} from '../access-gate/build.mjs';
import {frozenInventory,refreshConfig} from './refresh-approval.mjs';
import {waitForHydratedConsumer} from './hydrated-consumer-review.mjs';
import {runtimeCandidate} from './runtime-candidate.mjs';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const args=process.argv.slice(2),arg=k=>args[args.indexOf(k)+1],live=args.includes('--live');
const origin='https://research.visionuniverse.de',out=arg('--out'),directory=arg('--consumer');mkdirSync(dirname(out),{recursive:true});
const runtime=live?await runtimeCandidate(origin):null;
const manifest=live?runtime.manifest:JSON.parse(readFileSync(join(directory,'manifest.json')));
const release=await(await fetch(origin+'/release-delivery.json?refresh='+Date.now())).json();
if(live&&process.env.EXPECTED_PRODUCTION_SHA)assert.equal(release.sourceCommit,process.env.EXPECTED_PRODUCTION_SHA);
const payloads=new Map();
for(const [path,meta] of Object.entries(manifest.assets)){
 const bytes=live?Buffer.from(await(await fetch(origin+'/company-intelligence/data/'+path+'?refresh='+Date.now())).arrayBuffer()):readFileSync(join(directory,path));
 assert.equal(bytes.length,meta.bytes,path);assert.equal(createHash('sha256').update(bytes).digest('hex'),meta.sha256,path);
 payloads.set(path,bytes);
}
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.CHROMIUM_PATH||undefined}),cases=[];
let active=null,activePage=null;
try{
 const locked=await browser.newPage();let blockedRequests=0;locked.on('request',r=>{if(r.url().includes('/company-intelligence/data/'))blockedRequests++;});
 await locked.goto(origin+'/discover/#/s/US_REAL/AAPL');await locked.waitForSelector('#research-access-gate');assert.equal(await locked.locator('.ci-company-intelligence').count(),0);assert.equal(blockedRequests,0);await locked.close();
 const state=accessStateFor(process.env.RESEARCH_ACCESS_PASSWORD);
 for(const ticker of ['TSLA','AAPL','NVDA','PLTR','XPEV','MSFT','ACU','VEON'])for(const width of [390,1440]){
  const cid=Object.keys(frozenInventory).find(c=>frozenInventory[c].tickers.includes(ticker));
  const expected=JSON.parse(payloads.get(`snapshots/${manifest.generation}/${cid}.json`));
  const page=await browser.newPage({viewport:{width,height:860},colorScheme:'dark'}),errors=[],requests=[];
  active={ticker,cid,width,errors,requests};activePage=page;
  if(!live){
   await page.route('**/company-intelligence/data/**',route=>{const p=new URL(route.request().url()).pathname.split('/company-intelligence/data/')[1];assert(payloads.has(p),'UNKNOWN_CANDIDATE_ASSET');return route.fulfill({status:200,contentType:'application/json',body:payloads.get(p)});});
   await page.route('**/company-intelligence/config/rollout.js*',async route=>{const response=await route.fetch();const text=await response.text();assert(/expectedGeneration:\s*['"][a-f0-9]{24}['"]/.test(text),'CANDIDATE_UI_BASELINE_MISMATCH');await route.fulfill({response,body:text.replace(/(expectedGeneration:\s*['"])[a-f0-9]{24}(['"])/,'$1'+manifest.generation+'$2')});});
  }
  await page.addInitScript(({key,state})=>{localStorage.setItem(key,JSON.stringify(state));localStorage.setItem('vu-discover-theme-v1','dark');},{key:STORAGE_KEY,state});
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('/company-intelligence/data/'))requests.push({url:new URL(r.url()).pathname,status:r.status()});});
  await page.goto(origin+'/discover/#/s/US_REAL/'+ticker,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(cid=>{const e=document.querySelector('.ci-company-intelligence');return e?.dataset.state==='AVAILABLE'&&e.dataset.companyId===cid&&e.getAttribute('aria-busy')==='false';},cid,{timeout:30000});
  await waitForHydratedConsumer(page,{companyId:cid,generatedAt:expected.generatedAt,timeout:30000});
  const chapter=page.locator('.ci-company-intelligence'),text=await chapter.innerText();
  assert.equal(await chapter.getAttribute('data-generated-at'),expected.generatedAt);assert.equal(await chapter.getAttribute('data-experience'),'v2');
  assert.equal(await chapter.locator('.ci-profile[lang=de]').count(),1);assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await page.locator('vu-navigation').count(),1);assert(requests.some(r=>r.url.includes(manifest.generation)));assert(requests.every(r=>r.status===200));
  assert(!text.includes('keine Meldungen enthalten'));assert(!text.includes('Kein bestätigter kommender Termin'));
  assert.equal(await chapter.locator('.ci-kpi').count()>0,expected.latestFinancials.state==='AVAILABLE');
  if(expected.latestFinancials.stale&&expected.latestFinancials.state==='AVAILABLE')assert(text.includes('Veraltete Geschäftszahlen'));
  assert.equal(await chapter.locator('details.ci-documents[open],details.ci-sources[open]').count(),0);
  const links=await chapter.locator('a').evaluateAll(as=>as.map(a=>({url:a.href,height:a.getBoundingClientRect().height})));assert(links.filter(a=>a.height>0).every(a=>a.height>=44&&a.url.startsWith('https:')));
  cases.push({ticker,cid,width,status:'PASS',news:expected.news.length,generation:manifest.generation});await page.close();
 }
 const outside=await browser.newPage();let requests=0;outside.on('request',r=>{if(r.url().includes('/company-intelligence/data/'))requests++;});await outside.addInitScript(({key,state})=>localStorage.setItem(key,JSON.stringify(state)),{key:STORAGE_KEY,state});
 await outside.goto(origin+'/discover/#/s/US_REAL/ZZZZZ');await outside.waitForTimeout(2000);assert.equal(requests,0);await outside.close();
 const report={status:'PASS',mode:live?'ACTUAL_PRODUCTION':'REAL_UI_ROUTED_CANDIDATE',sourceCommit:release.sourceCommit,generation:manifest.generation,verifiedAssets:payloads.size,protectedAccess:true,cohortStocks:46,cohortIssuers:45,cases};writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,mode:report.mode,generation:report.generation,cases:cases.length}));
}catch(error){
 const message=String(error.message).replaceAll(process.env.RESEARCH_ACCESS_PASSWORD||'__NO_SECRET__','[REDACTED]').slice(0,2000);
 const markers=activePage?await activePage.locator('.ci-company-intelligence').evaluateAll(es=>es.map(e=>({state:e.dataset.state,companyId:e.dataset.companyId,generatedAt:e.dataset.generatedAt,text:e.innerText.slice(0,1200)}))).catch(()=>[]):[];
 if(activePage)await activePage.screenshot({path:out+'-failure.png'}).catch(()=>{});
 writeFileSync(out,JSON.stringify({status:'FAIL',mode:live?'ACTUAL_PRODUCTION':'REAL_UI_ROUTED_CANDIDATE',generation:manifest.generation,active,markers,error:{name:error.name,message},completedCases:cases.length},null,2)+'\n');
 throw error;
}finally{await browser.close();}
