#!/usr/bin/env node
/* Real local browser verification; no screenshots/traces/secrets in Git. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium,webkit,devices}=require('playwright'),Preview=require('../../../server/quant-backtest-preview.cjs');
async function main(){
 const args=process.argv.slice(2),get=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d,directory=get('--directory'),output=get('--output');if(!directory||!output)throw Error('PRIVATE_OUTPUT_REQUIRED');
 const root=path.resolve(__dirname,'../../..');if(!path.relative(root,path.resolve(output)).startsWith('..'+path.sep))throw Error('QA_OUTPUT_MUST_BE_PRIVATE');fs.mkdirSync(output,{recursive:true,mode:0o700});
 const key=crypto.randomBytes(32).toString('hex'),app=Preview.create({directory,credentialKey:key,allowedTickers:['NVDA','MSFT','XOM','ARM','AAPL','BGC','AAAC','AACT']}),url=await app.listen(),runs=[];
 try{for(const [engine,name,options] of [[chromium,'chromium-desktop',{viewport:{width:1440,height:1000}}],[webkit,'webkit-iphone',devices['iPhone 13']]]){
  const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']}:(process.env.WEBKIT_PATH?{executablePath:process.env.WEBKIT_PATH}:{}))});
  try{const context=await browser.newContext(options),page=await context.newPage(),errors=[],metrics=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
   page.on('response',async r=>{if(r.url().includes('/data?')){const q=new URL(r.url());try{metrics.push({section:q.searchParams.get('section')||'summary',status:r.status(),bytes:(await r.body()).length});}catch{}}});
   await page.goto(url);await page.fill('#key',key);await page.click('#login button');await page.waitForFunction(()=>document.querySelector('#summary').textContent.includes('Ergebnishash'));
   assert.equal(await page.locator('#key').inputValue(),'');assert.equal(await page.locator('#review').isVisible(),true);assert.ok((await page.locator('#summary').innerText()).includes('NOT_CERTIFIED'));checks.push('real NVDA summary, status and credential cleared');
   assert.equal(metrics.some(x=>x.section==='trades'||x.section==='equity'),false);checks.push('no eager detail request');
   await page.click('#equity-button');await page.waitForSelector('#equity svg');assert.equal(await page.locator('#equity svg').count(),2);checks.push('unchanged QuantCharts renders both strategy/stock and strategy/SPY comparisons');
   await page.click('#trades-button');await page.waitForSelector('#trades tbody tr');assert.equal(await page.locator('#trades tbody tr').count(),21);assert.ok((await page.locator('#trades').innerText()).includes('Nicht abgeschlossen'));checks.push('21 real trades and incomplete open position');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(output,name+'-dark.png'),fullPage:true});
   await page.evaluate(()=>document.documentElement.dataset.theme='light');await page.screenshot({path:path.join(output,name+'-light.png'),fullPage:true});checks.push('dark/light existing CSS, no horizontal document overflow');
   for(const period of ['1Y','3Y','5Y','10Y','MAX']){await page.selectOption('#period',period);await page.waitForFunction(p=>document.querySelector('#summary').textContent.includes('Ergebnishash')&&document.querySelector('#message').textContent==='Echte vorberechnete V3-Ergebnisse geladen.',period);const s=await page.evaluate(async p=>(await fetch('data?'+new URLSearchParams({ticker:'NVDA',period:p}),{cache:'no-store'})).json(),period);assert.equal(s.period,period);assert.equal(s.certification,'NOT_CERTIFIED');}
   checks.push('all five real periods');
   for(const ticker of ['MSFT','XOM','ARM','AAPL','BGC','AAAC','AACT']){await page.selectOption('#ticker',ticker);await page.waitForFunction(t=>document.querySelector('#summary h2')?.textContent===t,ticker);const blocked=['AAPL','BGC','AAAC','AACT'].includes(ticker);assert.equal(await page.locator('#summary').innerText().then(t=>t.includes('Endkapital')),!blocked);assert.equal(await page.locator('#equity-button').isVisible(),!blocked);}
   checks.push('all real edge cases including BGC and AAPL holds');
   await page.click('#logout');await page.waitForFunction(()=>document.querySelector('#review').hidden);const replay=await page.request.get(url+'data?ticker=NVDA');assert.equal(replay.status(),401);await page.reload();assert.equal(await page.locator('#review').isVisible(),false);assert.equal(await page.locator('#summary').textContent(),'');checks.push('logout, direct URL/cache replay and reload disclose no results');
   const short=Preview.create({directory,credentialKey:key,ttlMs:1500});const shortUrl=await short.listen();try{await page.goto(shortUrl);await page.fill('#key',key);await page.click('#login button');await page.waitForFunction(()=>document.querySelector('#summary').textContent.includes('Ergebnishash'));await page.waitForFunction(()=>document.querySelector('#review').hidden,{},{timeout:6000});assert.equal(await page.locator('#summary').textContent(),'');assert.equal((await page.request.get(shortUrl+'data?ticker=NVDA')).status(),401);checks.push('real browser session expiry clears data and rejects cached/direct replay');}finally{await short.close();}
   const nojs=await browser.newContext({...options,javaScriptEnabled:false});try{const form=await nojs.newPage();await form.goto(url);await form.fill('#key',key);await Promise.all([form.waitForURL('**/login'),form.click('#login button')]);assert.equal(new URL(form.url()).search,'');assert.equal((await form.locator('body').innerText()).includes(key),false);checks.push('JavaScript-disabled login fails closed without placing credentials in URL');}finally{await nojs.close();}
   assert.deepEqual(errors,[]);runs.push({browser:name,version:browser.version(),checks,metrics,errors,viewport:options.viewport});await context.close();
  }finally{await browser.close();}
 }
 }finally{await app.close();}
 const report={state:'PASS',runs,realData:true,publiclyActivated:false,certification:'NOT_CERTIFIED',screenshots:'PRIVATE_LOCAL_OUTPUT_ONLY'};fs.writeFileSync(path.join(output,'browser-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({state:'PASS',browsers:runs.map(r=>r.browser),checks:runs.reduce((n,r)=>n+r.checks.length,0)}));
}
if(require.main===module)main().catch(e=>{console.error('LOCAL_PREVIEW_BROWSER_QA_FAILED: '+String(e.message).slice(0,220));process.exitCode=1;});
