import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {accessStateFor,STORAGE_KEY} from '../access-gate/build.mjs';
import {verifyPropagation,PropagationError,CAUSE} from './propagation-proof.mjs';
import {attachDiagnostics,collectFailure} from './browser-diagnostics.mjs';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const out=process.env.RUNNER_TEMP+'/live-off',origin='https://research.visionuniverse.de';mkdirSync(out,{recursive:true});
/* Erwarteter Commit: der Job checkt den gebauten Commit aus (needs.package.outputs.source_sha). Nur im Pages-Release-Lauf
   aus HEAD abgeleitet; sonst nur Konsistenzpruefung. */
const headSha=()=>{try{return execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();}catch{return null;}};
const expectedSha=process.env.EXPECTED_PRODUCTION_SHA||(process.env.GITHUB_WORKFLOW==='Quant 2.0 Production Pages'?headSha():null);
const dataSha=()=>{try{return expectedSha?createHash('sha256').update(readFileSync(fileURLToPath(new URL('../../discover/data/stocks/US_REAL/AAPL.json',import.meta.url)))).digest('hex'):null;}catch{return null;}};
const secrets=(()=>{try{const pw=process.env.RESEARCH_ACCESS_PASSWORD;return [pw,...Object.values(accessStateFor(pw)||{})].filter(v=>typeof v==='string'&&v.length>=8);}catch{return [];}})();
const writeReport=report=>writeFileSync(out+'/report.json',secrets.reduce((t,v)=>t.split(v).join('[REDACTED]'),JSON.stringify(report,null,2))+'\n');
const brief=p=>p&&{status:p.status,cause:p.cause,message:p.message,elapsedMs:p.elapsedMs,maxMs:p.maxMs,attemptCount:p.attemptCount,intermediateSeen:p.intermediateSeen,fingerprint:p.fingerprint,observed:p.observed,expectedSha:p.expectedSha,attempts:p.attempts};
const propagation=await verifyPropagation({origin,expectedSha,expectedDataSha256:dataSha(),log:a=>console.error('propagation',JSON.stringify({n:a.n,atMs:a.atMs,ok:a.ok,observed:a.observed,failed:(a.failed||[]).map(c=>c.name+':'+c.cause)}))});
if(propagation.status!=='PROPAGATED'){
 // Klare Ursache statt eines spaeteren Timeouts: der Release ist nicht (vollstaendig) ausgeliefert. Fail-closed.
 writeReport({status:'FAIL',cause:CAUSE,origin,gate:'CLOSED',propagation:brief(propagation)});
 throw new PropagationError(propagation);
}
const index=await(await fetch(origin+'/company-intelligence/data/index.json?off-proof='+Date.now(),{cache:'no-store'})).json();assert.equal(index.state,'DISABLED');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']}),state=accessStateFor(process.env.RESEARCH_ACCESS_PASSWORD),cases=[];
let activePage=null,active=null;
try{for(const product of ['discover','quant'])for(const width of [390,430,768,1440]){
 const page=await browser.newPage({viewport:{width,height:860}}),requests=[],errors=[],diagnostics=attachDiagnostics(page,{origin});
 activePage=page;active={product,width,requests,errors,diagnostics};
 await page.addInitScript(({key,state})=>localStorage.setItem(key,JSON.stringify(state)),{key:STORAGE_KEY,state});
 page.on('request',r=>{if(r.url().includes('/company-intelligence/data/'))requests.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+(product==='discover'?'/discover/#/s/US_REAL/AAPL':'/quant/#/aktie/AAPL'));
 // The existing access gate restores application scripts asynchronously.
 // Wait for the real hard-off runtime instead of assuming a 1.5-second load.
 await page.waitForFunction(()=>globalThis.VUCompanyIntelligenceRollout?.stage===0&&globalThis.VUCompanyIntelligenceRollout?.productionOff===true);
 await page.waitForTimeout(1500);
 assert.equal(await page.locator('#research-access-gate').count(),0);assert.equal(await page.locator('.ci-company-intelligence').count(),0);assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.evaluate(()=>VUCompanyIntelligenceRollout.stage),0);cases.push({product,width,status:'PASS',consumerRequests:0});await page.close();
}writeReport({status:'PASS',origin,gate:'CLOSED',propagation:brief(propagation),cases});console.log('PRODUCTION_OFF_8_CASES_PASS');}
catch(error){
 const found=activePage?await collectFailure(activePage,active.diagnostics,{screenshotPath:out+'/failure.png'}):{page:null,diagnostics:null,screenshot:null};
 writeReport({status:'FAIL',cause:'BROWSER_ASSERTION_AFTER_PROVEN_PROPAGATION',origin,gate:'CLOSED',propagation:brief(propagation),active:active&&{product:active.product,width:active.width,requests:active.requests,errors:active.errors},pageState:found.page,browserDiagnostics:found.diagnostics,screenshot:found.screenshot,error:{name:error.name,message:String(error.message).slice(0,2000)},completedCases:cases.length});
 throw error;
}finally{await browser.close();}
