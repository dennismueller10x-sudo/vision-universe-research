import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile,stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {build,root} from '../scripts/build.mjs';

const output=resolve(root,'tests/output/browser');
await mkdir(output,{recursive:true});
const privacyPath=resolve(root,'tests/output/privacy-fixture.html');
await writeFile(privacyPath,'<!doctype html><html lang="de"><head><title>Testfixture</title></head><body>Nur für Integrationstests.</body></html>');
await build({output:resolve(output,'blocked')});
await build({output:resolve(output,'ready'),config:{mode:'public',liveFlowVerified:true,privacyReviewed:true,privacyHtmlPath:'tests/output/privacy-fixture.html'}});
await build({output:resolve(output,'controlled'),config:{mode:'controlled',privacyReviewed:true,privacyHtmlPath:'tests/output/privacy-fixture.html'}});
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
  try{const pathname=new URL(req.url,'http://localhost').pathname;let path=resolve(output,((pathname.startsWith('/ready/')||pathname.startsWith('/blocked/')||pathname.startsWith('/controlled/'))?'':'ready/')+'.'+pathname);if(!path.startsWith(output+sep))throw Error();if((await stat(path)).isDirectory())path=resolve(path,'index.html');res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404);res.end('404');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const screenshots=resolve(root,'review');await mkdir(screenshots,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
const metrics=[];
try{
  for(const [name,width,height,limit] of [['desktop',1440,900,1800],['iphone',390,844,1688],['narrow',320,800,Infinity]]){
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:name==='iphone'?2:1,reducedMotion:'reduce',isMobile:name==='iphone',hasTouch:name==='iphone'});
    const page=await context.newPage();
    const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(base))external.push(r.url())});
    await page.goto(base+'/blocked/',{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
    const m=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight}));
    assert.ok(m.height<=limit,`${name} height ${m.height}>${limit}`);assert.equal(m.scrollWidth,width,`${name} horizontal overflow`);
    assert.equal(await page.locator('#email').isDisabled(),true);assert.equal(await page.locator('button[type=submit]').isDisabled(),true);
    assert.equal(await page.locator('#consent').isChecked(),false);
    await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').innerText(),'Zum Inhalt');
    assert.notEqual(await page.locator(':focus').evaluate(e=>getComputedStyle(e).outlineStyle),'none');
    for(const link of ['.lp-cta','.hero .btn']){if(!(await page.locator(link).isVisible()))continue;await page.locator(link).click();assert.equal(new URL(page.url()).hash,'#newsletter');const y=await page.locator('#newsletter').evaluate(e=>e.getBoundingClientRect().top);assert.ok(y<height&&y>=0,`${name} anchor not visible`);await page.goto(base+'/blocked/');}
    assert.equal(await page.locator('input[type=password],script[src*="access"],script[src*="pwa"]').count(),0);
    assert.equal(await page.locator('a[href^="/discover"],a[href^="/quant"],a[href^="/ask"]').count(),0);
    assert.equal(await page.locator('#email').getAttribute('type'),'email');
    assert.equal(await page.locator('label[for=email]').innerText(),'Deine E-Mail-Adresse');
    const accessibility=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.deepEqual(accessibility.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[],`${name} axe`);
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    if(name!=='narrow')await page.screenshot({path:resolve(screenshots,name+'.png'),fullPage:true});
    metrics.push({name,viewport:`${width} × ${height}`,...m,axeViolations:accessibility.violations.length});
    // 200% text reflow: content may grow vertically, never horizontally or clip.
    // Research uses px/clamp fonts: changing only root font-size would not test
    // its actual text. Double every content font from a simultaneous snapshot;
    // keep the aria-hidden device illustration at its original image scale.
    await page.evaluate(()=>{
      const rows=[...document.querySelectorAll('body *')].filter(e=>!e.closest('[aria-hidden="true"],.stage')&&e.namespaceURI==='http://www.w3.org/1999/xhtml'&&([...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())||e.matches('input,button'))).map(e=>[e,parseFloat(getComputedStyle(e).fontSize),parseFloat(getComputedStyle(e).lineHeight)]);
      for(const[e,size,line]of rows){e.style.fontSize=size*2+'px';if(Number.isFinite(line))e.style.lineHeight=line*2+'px';}
    });assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width,`${name} text zoom overflow`);assert.ok(await page.locator('.footer').isVisible());
    await context.close();
  }
  // All network responses below are synthetic; no real contacts or messages.
  for(const width of [1440,390,320]){
    const context=await browser.newContext({viewport:{width,height:844}});const page=await context.newPage();const posts=[];
    await page.route('**/api/newsletter/subscribe',async route=>{
      posts.push({method:route.request().method(),data:JSON.parse(route.request().postData())});
      await route.fulfill({status:202,contentType:'application/json',body:JSON.stringify({message:'Wenn eine neue Anmeldung möglich ist, erhältst du eine Bestätigungsmail. Bitte prüfe dein Postfach.'})});
    });
    await page.goto(base+'/ready/',{waitUntil:'networkidle'});
    assert.equal(await page.locator('iframe').count(),0);assert.equal(await page.locator('#email').isDisabled(),false);
    await page.locator('button[type=submit]').click();assert.equal(posts.length,0);assert.match(await page.locator('#email-error').innerText(),/E-Mail-Adresse/);
    await page.locator('#email').fill('bad');await page.locator('button[type=submit]').click();assert.equal(posts.length,0);
    await page.locator('#email').fill('qa+new@example.test');await page.locator('button[type=submit]').click();assert.equal(posts.length,0);assert.match(await page.locator('#consent-error').innerText(),/stimme/);
    await page.locator('#consent').check();await page.locator('#email-address-check').fill('bot');await page.locator('button[type=submit]').click();assert.equal(posts.length,0);
    await page.locator('#email-address-check').fill('');await page.context().setOffline(true);await page.locator('button[type=submit]').click();assert.equal(posts.length,0);assert.match(await page.locator('#signup-status').innerText(),/offline/);await page.context().setOffline(false);
    await page.locator('button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#signup-status').textContent.includes('Postfach'));assert.equal(await page.locator('button[type=submit]').innerText(),'Postfach prüfen');assert.equal(await page.locator('#signup-status').evaluate(e=>e===document.activeElement),true);
    assert.equal(posts.length,1);assert.deepEqual(posts[0],{method:'POST',data:{email:'qa+new@example.test',consent:true,consentVersion:'vu-newsletter-v1',honeypot:''}});
    assert.equal(await page.locator('button[type=submit]').isDisabled(),true);assert.equal(new URL(page.url()).pathname,'/ready/');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
    const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.deepEqual(axe.violations.map(v=>v.id),[]);
    await page.goto(base+'/ready/newsletter/bestaetigt/');assert.match(await page.locator('main').innerText(),/direkter Aufruf dieser Seite bestätigt keine Anmeldung/);assert.equal(await page.locator('main button,main input').count(),0);
    await context.close();
  }
  const page=await browser.newPage();
  await page.route('**/api/newsletter/subscribe',route=>route.abort());
  await page.goto(base+'/ready/');await page.locator('#email').fill('qa@example.test');await page.locator('#consent').check();await page.locator('button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#signup-status').textContent.includes('verlässliche Rückmeldung'));assert.equal(await page.locator('button[type=submit]').innerText(),'Rückmeldung beachten');assert.equal(await page.locator('#signup-status').evaluate(e=>e===document.activeElement),true);assert.equal(await page.locator('button[type=submit]').isDisabled(),true);await page.close();
  for(const width of [1440,390,320]){
    const context=await browser.newContext({viewport:{width,height:844}});const page=await context.newPage();let posts=0;
    await page.route('**/api/newsletter/test-access',async route=>{
      assert.equal(route.request().method(),'POST');assert.equal(route.request().postData(),null);assert.equal(route.request().headers().authorization,'Bearer '+'a'.repeat(43));
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({expiresAt:Date.now()+60000})});
    });
    await page.route('**/api/newsletter/subscribe',async route=>{
      posts++;assert.equal(route.request().headers().authorization,'Bearer '+ 'a'.repeat(43));assert.ok(!route.request().url().includes('vu-test'));
      await route.fulfill({status:202,contentType:'application/json',body:JSON.stringify({message:'Bitte prüfe dein Postfach.'})});
    });
    await page.goto(base+'/controlled/');assert.equal(await page.locator('#email').isDisabled(),true);
    await page.goto(base+'/controlled/#vu-test='+ 'a'.repeat(43));await page.waitForFunction(()=>document.querySelector('#newsletter-form').dataset.ready==='true');assert.equal(await page.locator('#email').isDisabled(),false);assert.equal(new URL(page.url()).hash,'');
    await page.locator('#email').fill('new-controlled@example.test');await page.locator('#consent').check();await page.locator('button[type=submit]').click();
    await page.waitForFunction(()=>document.querySelector('#signup-status').textContent.includes('Postfach'));assert.equal(await page.locator('button[type=submit]').innerText(),'Postfach prüfen');assert.equal(await page.locator('#signup-status').evaluate(e=>e===document.activeElement),true);assert.equal(posts,1);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
    assert.deepEqual((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations.map(v=>v.id),[]);
    await page.reload();assert.equal(await page.locator('#email').isDisabled(),true);assert.equal(await page.evaluate(()=>localStorage.length),0);await context.close();
  }
  const nojs=await browser.newContext({javaScriptEnabled:false});const native=await nojs.newPage();
  await native.goto(base+'/blocked/');assert.equal(await native.locator('#email').isDisabled(),true);
  await native.route('**/api/newsletter/subscribe',async route=>{
    assert.equal(route.request().method(),'POST');const body=new URLSearchParams(route.request().postData());assert.equal(body.get('CONSENT_VERSION'),'vu-newsletter-v1');assert.equal(body.get('OPT_IN'),'1');
    await route.fulfill({status:303,headers:{Location:'/ready/newsletter/bestaetigen/'}});
  });
  await native.goto(base+'/ready/');await native.locator('#email').fill('qa@example.test');await native.locator('#consent').check();await native.locator('button[type=submit]').click();await native.waitForURL('**/newsletter/bestaetigen/');assert.match(await native.locator('main').innerText(),/Bestätigungsmail/);await nojs.close();
  await writeFile(resolve(screenshots,'metrics.json'),JSON.stringify({metrics,newsletter:'Eigene Formularoberfläche und gleiche Herkunft mit synthetischen API-Antworten geprüft. Kein echter Postfach-/Klick-/Abmeldetest.',browser:'Chromium',testedAt:new Date().toISOString()},null,2)+'\n');
  console.log(JSON.stringify({metrics,formChecks:'own design, validation, consent, honeypot, offline, one same-origin request, uncertain outcome, no-JS branded fallback, no iframe',controlledChecks:'ordinary visitors disabled, private fragment removed, bearer only in header, owner types address, same-document activation, no local storage, mobile reflow',liveBrevo:'BLOCKED'},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
