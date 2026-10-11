/* Component regression only: synthetic local assets, never ledger/coverage data.
   Keep the production smoke's failed-request assertion unchanged. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const {SCHEMA}=require('../../company-intelligence/api/contract.js');
const generation='f'.repeat(24),generatedAt=new Date().toISOString().replace(/\.\d{3}Z$/,'Z');
const symbols=['TESTA','TESTB','TESTC'],flags={profile:false,aktuelles:false,financials:true,whatChanged:false,nextEvent:false,calls:false,documents:false};
const cids=Object.fromEntries(symbols.map((t,i)=>[t,'iss_cik_'+String(i+1).padStart(10,'0')]));
const index={schema:SCHEMA,state:'AVAILABLE',generation,companies:{},tickers:{}};
for(const t of symbols){index.companies[cids[t]]=`snapshots/${generation}/${cids[t]}.json`;index.tickers[t]=[{companyId:cids[t],instrumentId:'vu_'+String(symbols.indexOf(t)+1).padStart(14,'0')}]}
const payload=t=>({schema:SCHEMA,state:'AVAILABLE',companyId:cids[t],generatedAt,listings:[{symbol:t,instrumentId:index.tickers[t][0].instrumentId}],news:[],events:[],earnings:[],filings:[],calls:[],timeline:[],materials:[],earningsBundles:[],eligibility:{modules:flags},latestFinancials:{state:'AVAILABLE',currency:'USD',reportingPeriod:'2026-06-30',fiscalYear:2026,fiscalQuarter:'Q2',sourceAsOf:generatedAt,metrics:{revenue:{current:{value:t==='TESTB'?200:100,unit:'USD'}}}}});
let heldA,receivedA,abortedA=false;const waitingA=new Promise(r=>receivedA=r);
const server=createServer((req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 const send=value=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(value))};
 if(path==='/'){res.setHeader('content-type','text/html');res.end('<main id="host"></main>');return}
 if(path.endsWith('index.json')){send(index);return}
 const t=symbols.find(t=>path.endsWith(cids[t]+'.json'));
 if(t==='TESTA'){heldA=()=>send(payload(t));res.on('close',()=>{if(!res.writableEnded)abortedA=true});receivedA();return}
 if(t==='TESTC')return; // Deliberately stalls to prove the existing deadline.
 if(t){send(payload(t));return}res.writeHead(404);res.end();
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true,args:['--no-sandbox']}),page=await browser.newPage(),failures=[];
page.on('requestfailed',r=>failures.push({url:r.url(),error:r.failure()?.errorText}));
try{
 await page.goto(origin);
 await page.addScriptTag({content:readFileSync('company-intelligence/api/contract.js','utf8')});
 await page.addScriptTag({content:readFileSync(process.env.CI_NAVIGATION_TEST_RENDERER||'company-intelligence/ui/stock-section.js','utf8')});
 await page.evaluate(({generation,cids,flags})=>{window.VUCompanyIntelligenceRollout={enabled:()=>true,stage:1,expectedGeneration:generation,base:'/data/',eligibility:Object.fromEntries(Object.entries(cids).map(([t,companyId])=>[t,{companyId,modules:flags}]))};window.disposeA=VUCompanyIntelligenceStock.mount(document.querySelector('#host'),'TESTA')},{generation,cids,flags});
 await waitingA;
 await page.evaluate(()=>{disposeA();window.disposeB=VUCompanyIntelligenceStock.mount(document.querySelector('#host'),'TESTB')});
 await page.waitForFunction(cid=>document.querySelector('.ci-company-intelligence')?.dataset.companyId===cid,cids.TESTB);
 heldA();await page.waitForTimeout(100);
 assert.equal(abortedA,false,'navigation must not abort prepared data');assert.deepEqual(failures,[]);
 assert.equal(await page.locator('.ci-company-intelligence').count(),1);
 assert.equal(await page.locator('.ci-company-intelligence').getAttribute('data-company-id'),cids.TESTB,'late issuer A must not replace issuer B');
 assert((await page.locator('.ci-company-intelligence').innerText()).includes('200'));
 await page.evaluate(()=>{disposeB();const timer=window.setTimeout.bind(window);window.deadlines=[];window.setTimeout=(fn,ms,...args)=>{if(ms===10000){deadlines.push(ms);return timer(fn,100,...args)}return timer(fn,ms,...args)};VUCompanyIntelligenceStock.mount(document.querySelector('#host'),'TESTC')});
 await page.waitForFunction(()=>document.querySelectorAll('.ci-company-intelligence').length===0);
 assert.deepEqual(await page.evaluate(()=>deadlines),[10000],'production deadline remains 10 seconds');
 assert.equal(failures.length,1,'only the deliberate stalled request may fail');
 assert(failures[0].url.endsWith(cids.TESTC+'.json'));assert.match(failures[0].error,/ABORTED/);
 console.log('NAVIGATION_LIFECYCLE_PASS: no abort on disposal, no late issuer mutation, bounded timeout fail-closed');
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
