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
await build({output:resolve(output,'ready'),config:{actionUrl:'https://test.sibforms.com/serve/TEST-ONLY',doubleOptInVerified:true,privacyReviewed:true,privacyHtmlPath:'tests/output/privacy-fixture.html',sourceAttribute:'SOURCE'}});
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
  try{let path=resolve(output,'.'+new URL(req.url,'http://localhost').pathname);if(!path.startsWith(output+sep))throw Error();if((await stat(path)).isDirectory())path=resolve(path,'index.html');res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404);res.end('404');}
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
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.goto(base+'/ready/',{waitUntil:'networkidle'});
  let posts=[];
  await page.route('https://test.sibforms.com/**',async route=>{const req=route.request();posts.push({method:req.method(),data:req.postData()});await route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html lang="de"><title>Brevo – simulierte Testantwort</title><p>Bitte bestätige deine E-Mail-Adresse. TEST, kein Live-Versand.</p></html>'});});
  await page.locator('button[type=submit]').click();assert.equal(posts.length,0);assert.match(await page.locator('#email-error').innerText(),/E-Mail-Adresse/);assert.equal(await page.locator('#email').getAttribute('aria-invalid'),'true');
  await page.locator('#email').fill('ungueltig');await page.locator('button[type=submit]').click();assert.equal(posts.length,0);assert.match(await page.locator('#email-error').innerText(),/gültige/);
  await page.locator('#email').fill('qa@example.com');await page.locator('button[type=submit]').click();assert.equal(posts.length,0);assert.match(await page.locator('#consent-error').innerText(),/stimme/);
  await page.locator('#consent').check();await page.locator('#email-address-check').fill('bot');await page.locator('button[type=submit]').click();assert.equal(posts.length,0);assert.match(await page.locator('#signup-status').innerText(),/nicht gesendet/);assert.equal(await page.locator('#email').inputValue(),'qa@example.com');
  await page.locator('#email-address-check').fill('');
  // Inspect loading synchronously before native POST navigation starts. Some
  // Chromium versions defer separate locator queries while navigation is pending.
  let releaseSubmission;
  const submissionReleased=new Promise(resolve=>{releaseSubmission=resolve});
  await page.route('https://test.sibforms.com/**',async route=>{await submissionReleased;const req=route.request();posts.push({method:req.method(),data:req.postData()});await route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html lang="de"><title>Nur Test</title><p>Bitte bestätige deine E-Mail-Adresse. TEST, kein Live-Versand.</p></html>'});});
  const loading=await page.evaluate(()=>{
    const button=document.querySelector('button[type=submit]');
    button.click();
    return {busy:document.querySelector('#newsletter-form').getAttribute('aria-busy'),disabled:button.disabled};
  });
  assert.deepEqual(loading,{busy:'true',disabled:true});
  releaseSubmission();
  await page.waitForURL('https://test.sibforms.com/**');assert.equal(posts.length,1);assert.equal(posts[0].method,'POST');const payload=new URLSearchParams(posts[0].data);assert.equal(payload.get('EMAIL'),'qa@example.com');assert.equal(payload.get('OPT_IN'),'1');assert.equal(payload.get('SOURCE'),'Coming-soon-Landingpage');assert.equal(payload.get('email_address_check'),'');
  await page.goBack();assert.equal(await page.locator('button[type=submit]').isDisabled(),false);assert.equal(await page.locator('#newsletter-form').getAttribute('aria-busy'),null);
  await page.context().setOffline(true);await page.locator('button[type=submit]').click();assert.match(await page.locator('#signup-status').innerText(),/offline/);assert.equal(posts.length,1);assert.equal(await page.locator('#email').inputValue(),'qa@example.com');await page.context().setOffline(false);
  await page.clock.install();await page.evaluate(()=>document.querySelector('#newsletter-form').addEventListener('submit',e=>e.preventDefault(),{once:true}));await page.locator('button[type=submit]').click();await page.clock.fastForward(20001);assert.match(await page.locator('#signup-status').innerText(),/nicht bestätigt/);assert.equal(await page.locator('button[type=submit]').isDisabled(),false);assert.equal(posts.length,1);
  await page.clock.resume();
  await page.unroute('https://test.sibforms.com/**');await page.route('https://test.sibforms.com/**',async route=>{posts.push({method:route.request().method(),data:route.request().postData()});await route.fulfill({status:400,contentType:'text/html',body:'<p>Die Anmeldung ist fehlgeschlagen. Nur simulierte Testantwort.</p>'});});await page.locator('button[type=submit]').click();await page.waitForURL('https://test.sibforms.com/**');assert.match(await page.locator('body').innerText(),/fehlgeschlagen/);assert.equal(posts.length,2);
  // JavaScript-off path retains native labels, required consent and real POST.
  const native=await browser.newPage({javaScriptEnabled:false});await native.route('https://test.sibforms.com/**',async route=>{posts.push({method:route.request().method(),data:route.request().postData()});await route.fulfill({status:200,contentType:'text/html',body:'<p>Bitte bestätige deine E-Mail-Adresse. Nur Test.</p>'});});await native.goto(base+'/ready/');await native.locator('#email').fill('native@example.com');await native.locator('button[type=submit]').click();assert.equal(posts.length,2);await native.locator('#consent').check();await native.locator('button[type=submit]').click();await native.waitForURL('https://test.sibforms.com/**');assert.equal(posts.length,3);
  await native.close();await page.close();
  await writeFile(resolve(screenshots,'metrics.json'),JSON.stringify({metrics,newsletter:'Konfigurierte POST-Zustände gegen abgefangenen Testanbieter geprüft. Kein echter Brevo-Kontakt oder Live-DOI getestet.',browser:'Chromium',testedAt:new Date().toISOString()},null,2)+'\n');
  console.log(JSON.stringify({metrics,formChecks:'blocked, validation, consent, honeypot, loading, POST payload, back navigation, offline, timeout, provider rejection, no-JS',liveBrevo:'BLOCKED'},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
