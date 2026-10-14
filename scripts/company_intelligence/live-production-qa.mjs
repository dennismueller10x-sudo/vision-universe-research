/* Actual production origin, no query opt-in; secrets remain runner-only. */
import {createRequire} from 'node:module';
import {writeFileSync,mkdirSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {accessStateFor,STORAGE_KEY} from '../access-gate/build.mjs';
import {runtimeCandidate} from './runtime-candidate.mjs';
const {manifest:reviewed,delivery:runtimeDelivery}=await runtimeCandidate();
import {assertConsumerResponses} from './browser-delivery-proof.mjs';
import {verifyPropagation,evaluateRelease,PropagationError,CAUSE,DEFAULTS,referenceDataSha256} from './propagation-proof.mjs';
import {attachDiagnostics,collectFailure,bounded,redactor} from './browser-diagnostics.mjs';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const {fetchWithRetry}=require('../../company-intelligence/api/contract.js');
const args=process.argv.slice(2),arg=(k,f)=>args.includes(k)?args[args.indexOf(k)+1]:f;
const routine=args.includes('--routine');
const origin=arg('--url','https://research.visionuniverse.de').replace(/\/$/,''),out=arg('--out','/tmp/company-intelligence-live');
assert(origin==='https://research.visionuniverse.de','EXISTING_PRODUCTION_ORIGIN_REQUIRED');mkdirSync(out,{recursive:true});
const expectedSha=process.env.EXPECTED_PRODUCTION_SHA||null;
/* Referenz-Hash der Discover-Datei: nur mit erwartetem Commit, denn nur dann entspricht der Checkout dem gebauten Release. */
const dataRef=referenceDataSha256(fileURLToPath(new URL('../../discover/data/stocks/US_REAL/AAPL.json',import.meta.url)),expectedSha),localDataSha=()=>dataRef.sha256;
/* Zeitbudget des Jobs (timeout-minutes 35, davon Checkout/Installation/andere QA-Schritte schon verbraucht): Reserve konfigurierbar. */
const startedAt=Date.now(),budget={startedAt,totalMs:Number(process.env.CI_QA_BUDGET_MS)||20*60000,reserveMs:Number(process.env.CI_QA_RESERVE_MS)||3*60000,proofMaxMs:DEFAULTS.maxMs};
const secrets=(()=>{try{const pw=process.env.RESEARCH_ACCESS_PASSWORD;return [pw,...Object.values(accessStateFor(pw)||{})].filter(v=>typeof v==='string'&&v.length>=8);}catch{return [];}})();
const redact=redactor(secrets);
const writeReport=report=>writeFileSync(out+'/report.json',redact(JSON.stringify(report,null,2))+'\n');
const brief=p=>p&&{referenceData:dataRef.reason??'SHA256',status:p.status,cause:p.cause,message:p.message,elapsedMs:p.elapsedMs,maxMs:p.maxMs,attemptCount:p.attemptCount,intermediateSeen:p.intermediateSeen,fingerprint:p.fingerprint,observed:p.observed,expectedSha:p.expectedSha,attempts:p.attempts};
let failure=null;
/* Eine Browser-Bewertung des bereits als ausgeliefert BEWIESENEN Releases. Fehler hier sind echte Fehler. */
async function phase({propagation,attempt,previousFailure}){
const deliveryRetries=[];
const get=path=>fetchWithRetry(fetch,origin+path+'?ci-proof='+Date.now(),{signal:AbortSignal.timeout(30000),cache:'no-store'},retry=>deliveryRetries.push({path,...retry}));
const fetchJSON=async path=>{const r=await get(path);assert(r.ok,path+' '+r.status);return r.json();};
let release=null,delivery=null,browser=null,assetEntries=[],activePage=null,active=null;const cases=[];
try{
 release=await fetchJSON('/release-delivery.json');
 if(expectedSha)assert.equal(release.sourceCommit,expectedSha,'WRONG_PRODUCTION_COMMIT');
 delivery=await fetchJSON('/company-intelligence-delivery.json');assert.equal(delivery.generation,reviewed.generation);assert.equal(delivery.issuers,reviewed.scope==='PER_ISSUER_ELIGIBILITY'?Object.keys(reviewed.eligibility).length:45);assert.equal(delivery.cohortStocks,reviewed.tickers.length);
 assetEntries=Object.entries(reviewed.assets).filter(([path])=>!routine||path==='index.json'||path.endsWith('/lookup/AA.json')||path.endsWith('/lookup/XP.json')||path.endsWith('/iss_cik_0000320193.json')||path.endsWith('/iss_cik_0001810997.json'));
 for(const [path,meta] of assetEntries){
  const r=await get('/company-intelligence/data/'+path);assert(r.ok,path+' '+r.status);const bytes=Buffer.from(await r.arrayBuffer());assert.equal(bytes.length,meta.bytes,path);assert.equal(createHash('sha256').update(bytes).digest('hex'),meta.sha256,path);
 }
 browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.CHROMIUM_PATH||undefined});
 const closed=await browser.newPage();await closed.goto(origin+'/discover/#/s/US_REAL/AAPL');await closed.waitForSelector('#research-access-gate');assert.equal(await closed.locator('.ci-company-intelligence').count(),0);await closed.close();
 const state=accessStateFor(process.env.RESEARCH_ACCESS_PASSWORD);
 for(const ticker of (routine?['AAPL','XPEV']:['AAPL','NVDA','TSLA','MSFT','PLTR','GOOG','GOOGL','XPEV','BOH','SBSI','AMPY'])){
  const page=await browser.newPage({viewport:{width:390,height:860}}),errors=[],responses=[],diagnostics=attachDiagnostics(page,{origin});
  activePage=page;active={ticker,errors,responses,diagnostics};
  await page.addInitScript(({key,state})=>localStorage.setItem(key,JSON.stringify(state)),{key:STORAGE_KEY,state});
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('/company-intelligence/data/'))responses.push({url:r.url(),status:r.status()});});
  await page.goto(origin+'/discover/#/s/US_REAL/'+ticker,{waitUntil:'domcontentloaded'});await page.waitForSelector('.ci-company-intelligence h2');
  const chapter=page.locator('.ci-company-intelligence');assert(!(await chapter.innerText()).includes('derzeit nicht verfügbar'),ticker);assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assertConsumerResponses(responses,ticker);
  assert.equal(await page.locator('vu-navigation').count(),1);assert(await chapter.locator('a').count()>0);await chapter.scrollIntoViewIfNeeded();await page.screenshot({path:out+'/'+ticker+'-390.png'});
  cases.push({ticker,width:390,status:'PASS',consumerRequests:responses});await page.close();
 }
 writeReport({status:'PASS',origin,sourceCommit:release.sourceCommit,generation:delivery.generation,verifiedAssetHashes:assetEntries.length,deliveryRetries,routine,protectedExistingAccessGate:true,noQueryOptIn:true,attempt,previousFailure,propagation:brief(propagation),cases});
 console.log(JSON.stringify({status:'PASS',sourceCommit:release.sourceCommit,generation:delivery.generation,assets:assetEntries.length,stocks:cases.length,routine,attempt,propagationAttempts:propagation.attemptCount}));
 return {stocks:cases.length};
}catch(error){
 const found=activePage?await collectFailure(activePage,active.diagnostics,{screenshotPath:out+'/failure.png'}):{page:null,diagnostics:null,screenshot:null};
 const markers=activePage?await bounded(activePage.locator('.ci-company-intelligence').evaluateAll(es=>es.map(e=>({state:e.dataset.state,companyId:e.dataset.companyId,generatedAt:e.dataset.generatedAt,text:e.innerText.slice(0,1200)}))).catch(()=>[]),[]):[];
 error.observed={metaRelease:found.page?.metaRelease??null};
 failure={status:'FAIL',cause:'BROWSER_ASSERTION_AFTER_PROVEN_PROPAGATION',sourceCommit:release?.sourceCommit??propagation.observed.commit,generation:delivery?.generation??null,attempt,previousFailure,propagation:brief(propagation),active:active&&{ticker:active.ticker,errors:active.errors,responses:active.responses},markers,accessGate:found.page?.accessGate??null,pageText:found.page?.text??null,pageState:found.page,browserDiagnostics:found.diagnostics,screenshot:found.screenshot,deliveryRetries,error:{name:error.name,message:String(error.message).slice(0,2000)},completedCases:cases.length};
 writeReport(failure);
 throw error;
}finally{if(browser)await browser.close();}
}
try{
 const done=await evaluateRelease({
  budget,
  prove:o=>verifyPropagation({origin,expectedSha,expectedDataSha256:localDataSha(),log:a=>console.error('propagation',JSON.stringify({n:a.n,atMs:a.atMs,ok:a.ok,observed:a.observed,failed:(a.failed||[]).map(c=>c.name+':'+c.cause)})),...o}),
  runBrowser:phase
 });
 if(done.retried)console.log('::warning title=Live-QA erst im zweiten Versuch bestanden::'+redact(String(done.previousFailure?.message||'').replace(/[\r\n%]+/g,' ').slice(0,300))+' | Grund: '+(done.previousFailure?.decision?.reason||'?')+' | Kennung: '+(done.propagation?.fingerprint||'?'));
}catch(error){
 if(error instanceof PropagationError)writeReport({status:'FAIL',cause:CAUSE,origin,sourceCommit:expectedSha,propagation:brief(error.propagation),previousFailure:error.previousFailure??null,error:{name:error.name,message:String(error.message).slice(0,2000)}});
 else if(failure&&error.propagationEvidence){const e=error.propagationEvidence;writeReport({...failure,previousFailure:error.previousFailure??failure.previousFailure,propagation:brief(e.proof),reproof:brief(e.reproof),retryDecision:e.decision});}
 throw error;
}
