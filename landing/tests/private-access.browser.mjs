// Synthetic only: test browser redirect/history/resume behavior, never Brevo.
import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {createServer} from 'node:http';
import {build,root} from '../scripts/build.mjs';
const output=resolve(root,'tests/output/private-browser');
await build({output,config:{mode:'controlled',privacyReviewed:true,privacyHtmlPath:'legal-drafts/newsletter-release-2026-10-14.html'}});
const token='a'.repeat(43);
let www,apex,expiresAt,allowed,accessCalls,posts;
const server=createServer(async(req,res)=>{
  assert.ok(!req.url.includes(token),'fragment must never reach HTTP');
  assert.ok(!(req.headers.referer||'').includes(token));
  if(req.headers.host.startsWith('localhost:')){res.writeHead(301,{Location:www+req.url});res.end();return;}
  const pathname=new URL(req.url,www).pathname;
  if(pathname==='/api/newsletter/test-access'){
    accessCalls++;assert.equal(req.method,'POST');let body='';for await(const chunk of req)body+=chunk;assert.equal(body,'');
    const ok=allowed&&req.headers.authorization==='Bearer '+token;
    res.writeHead(ok?200:503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(ok?{expiresAt}:{message:'Unavailable'}));return;
  }
  if(pathname==='/api/newsletter/subscribe'){
    posts++;assert.equal(req.headers.authorization,'Bearer '+token);
    res.writeHead(202,{'Content-Type':'application/json'});res.end(JSON.stringify({message:'Bitte prüfe dein Postfach.'}));return;
  }
  const path=resolve(output,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
  try{res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png'})[extname(path)]||'application/octet-stream'});res.end(await readFile(path));}catch{res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
www='http://127.0.0.1:'+server.address().port;apex='http://localhost:'+server.address().port;
try{
for(const [name,engine] of [['Chromium',chromium],['WebKit',webkit]]){
  const browser=await engine.launch(name==='Chromium'?{executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']}:{});
  try{
    // iPhone device/UA also exercises a webview-style UA without Safari suffix.
    for(const inApp of [false,true]){
      const device=devices['iPhone 13'];
      const context=await browser.newContext({...device,userAgent:inApp?device.userAgent.replace(/ Version\/[^ ]+| Safari\/[^ ]+/g,''):device.userAgent});
      expiresAt=Date.now()+60000;allowed=true;accessCalls=0;posts=0;
      const page=await context.newPage();
      await page.goto(apex+'/#vu-test='+token);await page.waitForFunction(()=>document.querySelector('#newsletter-form').dataset.ready==='true');
      assert.equal(page.url(),www+'/');assert.equal(await page.locator('#email').isDisabled(),false);
      await page.locator('a[href="#newsletter"]:visible').first().click();assert.equal(new URL(page.url()).hash,'#newsletter');
      await page.locator('#email').fill('synthetic@example.test');await page.locator('#consent').check();
      allowed=false;await page.locator('button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#signup-status').textContent.includes('abgelaufen'));
      assert.equal(posts,0);assert.equal(await page.locator('#email').isDisabled(),true);
      allowed=true;await page.goto(www+'/#vu-test='+token);await page.waitForFunction(()=>document.querySelector('#newsletter-form').dataset.ready==='true');
      // Restoring the webview from memory must revalidate a rotated access key.
      allowed=false;await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
      await page.waitForFunction(()=>document.querySelector('#signup-status').textContent.includes('abgelaufen'));assert.equal(await page.locator('#email').isDisabled(),true);
      allowed=true;expiresAt=Date.now()-1;await page.reload();assert.equal(await page.locator('#email').isDisabled(),true);
      await page.evaluate(t=>location.hash='vu-test='+t,token);await page.waitForFunction(()=>document.querySelector('#signup-status').textContent.includes('abgelaufen'));assert.equal(posts,0);
      expiresAt=Date.now()+1000;await page.evaluate(t=>location.hash='vu-test='+t,token);await page.waitForFunction(()=>document.querySelector('#newsletter-form').dataset.ready==='true');
      await page.waitForFunction(()=>document.querySelector('#signup-status').textContent.includes('abgelaufen'));assert.equal(await page.locator('#email').isDisabled(),true);
      expiresAt=Date.now()+60000;await page.goto(www+'/#vu-test='+token);await page.waitForFunction(()=>document.querySelector('#newsletter-form').dataset.ready==='true');
      await page.locator('#email').fill('synthetic@example.test');await page.locator('#consent').check();await page.locator('button[type=submit]').click();
      await page.waitForFunction(()=>document.querySelector('#signup-status').textContent.includes('Postfach'));assert.equal(posts,1);assert.ok(accessCalls>=7);
      assert.equal(await page.locator('button[type=submit]').innerText(),'Postfach prüfen');assert.equal(await page.locator('#signup-status').evaluate(e=>e===document.activeElement),true);
      const bounds=await page.locator('#signup-status').boundingBox();assert.ok(bounds.y>=0&&bounds.y+bounds.height<=844,'result must be visible after a mobile tap');
      // Reopening the original link in the same webview does not reload JS.
      // It must rearm the button after validation, without resending anything.
      await page.evaluate(t=>location.hash='vu-test='+t,token);
      await page.waitForFunction(()=>document.querySelector('#newsletter-form').dataset.ready==='true'&&!document.querySelector('#newsletter-form button').disabled);
      assert.equal(posts,1);assert.equal(await page.locator('button[type=submit]').innerText(),'Newsletter abonnieren');
      await page.reload();assert.equal(await page.locator('#email').isDisabled(),true);
      assert.deepEqual(await page.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0]);assert.equal(await context.cookies().then(c=>c.length),0);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
      await context.close();
    }
    console.log(name+': iPhone Safari and in-app UA, apex redirect, fragment removal, expired/rotated access, resume, in-page link and closed public form verified (synthetic).');
  }finally{await browser.close();}
}
}finally{await new Promise(r=>server.close(r));}
