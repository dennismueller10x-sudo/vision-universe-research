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
await build({output:resolve(output,'ready'),config:{actionUrl:'/api/waitlist/signup',doubleOptInVerified:true,privacyReviewed:true,privacyHtmlPath:'tests/output/privacy-fixture.html',sourceAttribute:'SOURCE'}});
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
  try{const pathname=new URL(req.url,'http://localhost').pathname;let path=resolve(output,((pathname.startsWith('/ready/')||pathname.startsWith('/blocked/'))?'':'ready/')+'.'+pathname);if(!path.startsWith(output+sep))throw Error();if((await stat(path)).isDirectory())path=resolve(path,'index.html');res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404);res.end('404');}
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
  const pattern='**/api/waitlist/signup';
  const record=route=>{posts.push({method:route.request().method(),data:route.request().postData()});};
  await page.route(pattern,async route=>{record(route);await route.fulfill({status:202,contentType:'application/json',body:JSON.stringify({message:'Bitte bestätige deine E-Mail-Adresse.'})});});
  await page.locator('button[type=submit]').click();assert.equal(posts.length,0);assert.match(await page.locator('#email-error').innerText(),/E-Mail-Adresse/);
  await page.locator('#email').fill('ungueltig');await page.locator('button[type=submit]').click();assert.equal(posts.length,0);assert.match(await page.locator('#email-error').innerText(),/gültige/);
  await page.locator('#email').fill('qa@example.test');await page.locator('button[type=submit]').click();assert.equal(posts.length,0);assert.match(await page.locator('#consent-error').innerText(),/stimme/);
  await page.locator('#consent').check();await page.locator('#email-address-check').fill('bot');await page.locator('button[type=submit]').click();assert.equal(posts.length,0);assert.match(await page.locator('#signup-status').innerText(),/nicht gesendet/);
  await page.locator('#email-address-check').fill('');
  await page.context().setOffline(true);await page.locator('button[type=submit]').click();assert.match(await page.locator('#signup-status').innerText(),/offline/);assert.equal(posts.length,0);await page.context().setOffline(false);
  let release;const pending=new Promise(resolve=>{release=resolve});
  await page.unroute(pattern);await page.route(pattern,async route=>{record(route);await pending;await route.fulfill({status:202,contentType:'application/json',body:JSON.stringify({message:'Bitte bestätige deine E-Mail-Adresse.'})});});
  await page.locator('button[type=submit]').click();assert.equal(await page.locator('#newsletter-form').getAttribute('aria-busy'),'true');assert.equal(await page.locator('button[type=submit]').isDisabled(),true);
  release();await page.waitForURL('**/warteliste/bestaetigen/');assert.equal(posts.length,1);
  const payload=new URLSearchParams(posts[0].data);assert.equal(payload.get('EMAIL'),'qa@example.test');assert.equal(payload.get('OPT_IN'),'1');assert.equal(payload.get('consent_version'),'vu-app-launch-v1');
  assert.match(await page.locator('h1').innerText(),/Bitte bestätige/);
  await page.goto(base+'/ready/');await page.locator('#email').fill('qa@example.test');await page.locator('#consent').check();
  await page.unroute(pattern);await page.route(pattern,async route=>{record(route);await route.fulfill({status:429,contentType:'application/json',body:JSON.stringify({message:'Zu viele Anfragen. Bitte versuche es später erneut.'})});});
  await page.locator('button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#signup-status').textContent.includes('Zu viele'));assert.equal(posts.length,2);assert.equal(await page.locator('#email').inputValue(),'qa@example.test');
  await page.clock.install();let finishTimeout;const delayed=new Promise(resolve=>{finishTimeout=resolve});
  await page.unroute(pattern);await page.route(pattern,async route=>{await delayed;try{await route.fulfill({status:202,contentType:'application/json',body:'{}'});}catch{}});
  await page.locator('button[type=submit]').click();await page.clock.fastForward(20001);await page.waitForFunction(()=>document.querySelector('#signup-status').textContent.includes('nicht bestätigt'));assert.equal(await page.locator('button[type=submit]').isDisabled(),false);finishTimeout();await page.clock.resume();
  const native=await browser.newPage({javaScriptEnabled:false});await native.route(pattern,async route=>{record(route);await route.fulfill({status:303,headers:{location:'/warteliste/bestaetigen/'},body:''});});
  await native.goto(base+'/ready/');await native.locator('#email').fill('native@example.test');await native.locator('button[type=submit]').click();assert.equal(posts.length,2);await native.locator('#consent').check();await native.locator('button[type=submit]').click();await native.waitForURL('**/warteliste/bestaetigen/');assert.equal(posts.length,3);
  await native.close();await page.close();
  const accountContext=await browser.newContext({viewport:{width:390,height:844}});const account=await accountContext.newPage();let withdrawals=0;
  await account.route('**/api/waitlist/confirmed',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({confirmed:true,message:'Deine E-Mail-Adresse ist bestätigt.'})}));
  await account.route('**/api/waitlist/unsubscribe',async route=>{withdrawals++;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({unsubscribed:true,message:'Du bist von der App-Warteliste abgemeldet.'})});});
  await account.goto(base+'/warteliste/bestaetigt/#t=synthetic');await account.locator('#unsubscribe-link').waitFor({state:'visible'});assert.equal(new URL(account.url()).hash,'');
  await account.locator('#unsubscribe-link').click();assert.equal(withdrawals,0);await account.locator('#unsubscribe-button').click();await account.waitForFunction(()=>document.querySelector('#waitlist-status').textContent.includes('abgemeldet'));assert.equal(withdrawals,1);assert.equal(new URL(account.url()).hash,'');
  for(const name of ['bestaetigen','bestaetigt','abmelden']){
    await account.goto(base+'/warteliste/'+name+'/');assert.equal(await account.evaluate(()=>document.documentElement.scrollWidth),390);
    const axe=await new AxeBuilder({page:account}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.deepEqual(axe.violations.map(v=>v.id),[]);
  }
  await accountContext.close();
  await writeFile(resolve(screenshots,'metrics.json'),JSON.stringify({metrics,newsletter:'Konfigurierte POST-Zustände gegen abgefangenen Testanbieter geprüft. Kein echter Brevo-Kontakt oder Live-DOI getestet.',browser:'Chromium',testedAt:new Date().toISOString()},null,2)+'\n');
  console.log(JSON.stringify({metrics,formChecks:'blocked, validation, consent, honeypot, loading, POST payload, offline, timeout, provider rejection, no-JS, confirmation, unsubscribe, fragment removal',liveBrevo:'BLOCKED'},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
