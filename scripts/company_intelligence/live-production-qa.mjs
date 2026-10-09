/* Actual production origin, no query opt-in; secrets remain runner-only. */
import {createRequire} from 'node:module';
import {writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {accessStateFor,STORAGE_KEY} from '../access-gate/build.mjs';
import {runtimeCandidate} from './runtime-candidate.mjs';
const {manifest:reviewed,delivery:runtimeDelivery}=await runtimeCandidate();
import {assertConsumerResponses} from './browser-delivery-proof.mjs';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const {fetchWithRetry}=require('../../company-intelligence/api/contract.js');
const deliveryRetries=[];
const args=process.argv.slice(2),arg=(k,f)=>args.includes(k)?args[args.indexOf(k)+1]:f;
const routine=args.includes('--routine');
const origin=arg('--url','https://research.visionuniverse.de').replace(/\/$/,''),out=arg('--out','/tmp/company-intelligence-live');
assert(origin==='https://research.visionuniverse.de','EXISTING_PRODUCTION_ORIGIN_REQUIRED');mkdirSync(out,{recursive:true});
const get=path=>fetchWithRetry(fetch,origin+path+'?ci-proof='+Date.now(),{signal:AbortSignal.timeout(30000)},retry=>deliveryRetries.push({path,...retry}));
const fetchJSON=async path=>{const r=await get(path);assert(r.ok,path+' '+r.status);return r.json();};
const release=await fetchJSON('/release-delivery.json');
if(process.env.EXPECTED_PRODUCTION_SHA)assert.equal(release.sourceCommit,process.env.EXPECTED_PRODUCTION_SHA,'WRONG_PRODUCTION_COMMIT');
const delivery=await fetchJSON('/company-intelligence-delivery.json');assert.equal(delivery.generation,reviewed.generation);assert.equal(delivery.issuers,45);assert.equal(delivery.cohortStocks,46);
const assetEntries=Object.entries(reviewed.assets).filter(([path])=>!routine||path==='index.json'||path.endsWith('/lookup/AA.json')||path.endsWith('/lookup/XP.json')||path.endsWith('/iss_cik_0000320193.json')||path.endsWith('/iss_cik_0001810997.json'));
for(const [path,meta] of assetEntries){
 const r=await get('/company-intelligence/data/'+path);assert(r.ok,path+' '+r.status);const bytes=Buffer.from(await r.arrayBuffer());assert.equal(bytes.length,meta.bytes,path);assert.equal(createHash('sha256').update(bytes).digest('hex'),meta.sha256,path);
}
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.CHROMIUM_PATH||undefined}),cases=[];
try{
 const closed=await browser.newPage();await closed.goto(origin+'/discover/#/s/US_REAL/AAPL');await closed.waitForSelector('#research-access-gate');assert.equal(await closed.locator('.ci-company-intelligence').count(),0);await closed.close();
 const state=accessStateFor(process.env.RESEARCH_ACCESS_PASSWORD);
 for(const ticker of (routine?['AAPL','XPEV']:['AAPL','NVDA','TSLA','MSFT','PLTR','GOOG','GOOGL','XPEV','BOH','SBSI','AMPY'])){
  const page=await browser.newPage({viewport:{width:390,height:860}}),errors=[],responses=[];
  await page.addInitScript(({key,state})=>localStorage.setItem(key,JSON.stringify(state)),{key:STORAGE_KEY,state});
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('/company-intelligence/data/'))responses.push({url:r.url(),status:r.status()});});
  await page.goto(origin+'/discover/#/s/US_REAL/'+ticker,{waitUntil:'domcontentloaded'});await page.waitForSelector('.ci-company-intelligence h2');
  const chapter=page.locator('.ci-company-intelligence');assert(!(await chapter.innerText()).includes('derzeit nicht verfügbar'),ticker);assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assertConsumerResponses(responses,ticker);
  assert.equal(await page.locator('vu-navigation').count(),1);assert(await chapter.locator('a').count()>0);await chapter.scrollIntoViewIfNeeded();await page.screenshot({path:out+'/'+ticker+'-390.png'});
  cases.push({ticker,width:390,status:'PASS',consumerRequests:responses});await page.close();
 }
 writeFileSync(out+'/report.json',JSON.stringify({status:'PASS',origin,sourceCommit:release.sourceCommit,generation:delivery.generation,verifiedAssetHashes:assetEntries.length,deliveryRetries,routine,protectedExistingAccessGate:true,noQueryOptIn:true,cases},null,2)+'\n');
 console.log(JSON.stringify({status:'PASS',sourceCommit:release.sourceCommit,generation:delivery.generation,assets:assetEntries.length,stocks:cases.length,routine}));
}finally{await browser.close();}
