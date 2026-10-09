// Reproduce the real password gate's document replacement and a delayed stock
// reroute before touching production. Uses only synthetic, local consumer data.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {protectRelease,accessStateFor,STORAGE_KEY} from '../access-gate/build.mjs';
import {waitForHydratedConsumer} from './hydrated-consumer-review.mjs';
const {chromium}=createRequire(import.meta.url)('playwright');
const directory=await mkdtemp(join(tmpdir(),'ci-protected-hydration-'));
const companyId='fixture-issuer',generatedAt='2026-10-08T14:36:50Z',password='local-synthetic-hydration-test';
let browser,server;
try{
 await writeFile(join(directory,'index.html'),'<!doctype html><html><body><main id="v2-main" aria-busy="false"></main><script src="/app.js"></script></body></html>');
 await writeFile(join(directory,'app.js'),`const root=document.querySelector('#v2-main');
 const render=()=>{root.setAttribute('aria-busy','false');root.innerHTML='<section class="ci-company-intelligence" aria-busy="false" data-state="AVAILABLE" data-company-id="${companyId}" data-generated-at="${generatedAt}"><h2>Auf einen Blick</h2></section>';};
 render();fetch('/fx-ready.json').then(()=>{window.fixtureFxEmitted=true;document.dispatchEvent(new CustomEvent('vu-fx-ready'));root.setAttribute('aria-busy','true');root.innerHTML='<section class="ci-company-intelligence" aria-busy="true">Laden</section>';return fetch('/consumer.json');}).then(render);`);
 await protectRelease({output:directory,password});
 server=createServer(async(req,res)=>{
  if(['/fx-ready.json','/consumer.json'].includes(req.url)){setTimeout(()=>{res.setHeader('Content-Type','application/json');res.end('{}');},req.url==='/fx-ready.json'?450:150);return;}
  try{const path=new URL(req.url,'http://localhost').pathname;const bytes=await readFile(join(directory,path==='/'?'index.html':path.slice(1)));res.setHeader('Content-Type',path.endsWith('.js')?'application/javascript':path.endsWith('.json')?'application/json':'text/html');res.end(bytes);}catch{res.statusCode=404;res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.CHROMIUM_PATH||undefined});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({key,state})=>{localStorage.setItem(key,JSON.stringify(state));window.fixtureOriginalDocumentListener=false;document.addEventListener('vu-fx-ready',()=>{window.fixtureOriginalDocumentListener=true;});},{key:STORAGE_KEY,state:accessStateFor(password)});
 await page.goto('http://127.0.0.1:'+server.address().port+'/');
 await page.waitForSelector('.ci-company-intelligence[aria-busy=false] h2');
 await waitForHydratedConsumer(page,{companyId,generatedAt});
 assert.equal(await page.evaluate(()=>window.fixtureFxEmitted),true);
 assert.equal(await page.evaluate(()=>window.fixtureOriginalDocumentListener),false,'document.open removes the original listener');
 assert.equal(await page.locator('.ci-company-intelligence').getAttribute('data-company-id'),companyId);
 assert.deepEqual(errors,[]);
 for(const incorrect of [{companyId:'wrong-issuer',generatedAt},{companyId,generatedAt:'wrong-generation-time'}])await assert.rejects(waitForHydratedConsumer(page,{...incorrect,timeout:100}),{name:'TimeoutError'});
 console.log(JSON.stringify({status:'PASS',realAccessGate:true,delayedReroute:true,originalDocumentListenerRemoved:true,wrongIssuerRejected:true,wrongTimestampRejected:true,productionRequests:0,privateStateWrites:0}));
}finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
