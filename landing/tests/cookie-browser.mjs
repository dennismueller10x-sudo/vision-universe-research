import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile, stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve, extname, sep} from 'node:path';
import {build, root} from '../scripts/build.mjs';

const output=resolve(root,'tests/output/cookie-browser');await build({output});
const screenshots=resolve(root,'review/cookies');await mkdir(screenshots,{recursive:true});
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
  try {let path=resolve(output,'.'+new URL(req.url,'http://localhost').pathname);if(path!==output&&!path.startsWith(output+sep))throw Error();if((await stat(path)).isDirectory())path=resolve(path,'index.html');res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');res.end(await readFile(path));}
  catch {res.writeHead(404);res.end('404');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
const metrics=[];
const stored = page => page.evaluate(()=>JSON.parse(localStorage.getItem('vu_cookie_preferences')));
const checkAxe = async page => {const a=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.deepEqual(a.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);};
try {
  for(const [name,width,height] of [['desktop',1440,900],['iphone',390,844],['narrow',320,800]]) {
    const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',isMobile:name==='iphone',hasTouch:name==='iphone'});
    const page=await context.newPage();const errors=[],failed=[],external=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push({url:r.url(),status:r.status()});});page.on('request',r=>{if(!r.url().startsWith(base))external.push(r.url());});
    await page.goto(base+'/',{waitUntil:'networkidle'});
    assert.equal(await stored(page),null);assert.equal(await page.locator('#cookie-banner').isVisible(),true);
    assert.deepEqual(await context.cookies(),[]);await checkAxe(page);
    for(const button of await page.locator('#cookie-banner button').all())assert.ok((await button.boundingBox()).height>=44);
    if(name!=='narrow')await page.screenshot({path:resolve(screenshots,name+'-banner.png')});
    await page.locator('#cookie-banner [data-cookie-settings]').click();
    assert.equal(await page.locator('#cookie-dialog').isVisible(),true);assert.equal(await page.locator(':focus').getAttribute('id'),'cookie-close');
    assert.equal(await page.locator('#cookie-statistics').isChecked(),false);assert.equal(await page.locator('#cookie-statistics').isDisabled(),true);
    assert.equal(await page.locator('#cookie-marketing').isChecked(),false);assert.equal(await page.locator('#cookie-marketing').isDisabled(),true);
    await checkAxe(page);
    for(let i=0;i<10;i++){await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').evaluate(e=>!!e.closest('#cookie-dialog')),true);}
    await page.keyboard.press('Escape');assert.equal(await stored(page),null);assert.equal(await page.locator(':focus').getAttribute('data-cookie-settings'),'');
    await page.locator('#cookie-banner [data-cookie-settings]').click();
    if(name!=='narrow')await page.screenshot({path:resolve(screenshots,name+'-settings.png')});
    await page.locator('#cookie-dialog [data-cookie-choice=necessary]').click();
    assert.equal(await page.locator('#cookie-dialog').isVisible(),false);assert.equal(await page.locator('#cookie-banner').isVisible(),false);
    assert.deepEqual((await stored(page)).preferences,{statistics:false,marketing:false});
    await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('#cookie-banner').isVisible(),false);
    const size=await page.evaluate(()=>({height:document.documentElement.scrollHeight,width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));assert.equal(size.scrollWidth,width);
    await page.locator('footer [data-cookie-settings]').click();await page.locator('#cookie-dialog [data-cookie-choice=all]').click();
    assert.deepEqual((await stored(page)).preferences,{statistics:false,marketing:false});
    // All published legal routes share the same choice and working settings.
    for(const route of ['/datenschutz/','/impressum/','/policies/privacy-policy/','/policies/legal-notice/']) {
      await page.goto(base+route,{waitUntil:'networkidle'});assert.equal(await page.locator('#cookie-banner').isVisible(),false);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);await checkAxe(page);
      await page.locator('footer [data-cookie-settings]').click();assert.equal(await page.locator('#cookie-dialog').isVisible(),true);await page.keyboard.press('Escape');
    }
    await page.goto(base+'/',{waitUntil:'networkidle'});await page.locator('footer [data-cookie-settings]').click();
    await page.evaluate(()=>{
      const rows=[...document.querySelectorAll('#cookie-dialog *')].filter(e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(e=>[e,parseFloat(getComputedStyle(e).fontSize),parseFloat(getComputedStyle(e).lineHeight)]);
      for(const[e,size,line] of rows){e.style.fontSize=size*2+'px';if(Number.isFinite(line))e.style.lineHeight=line*2+'px';}
    });
    const reflow=await page.locator('#cookie-dialog').evaluate(e=>({width:e.clientWidth,scrollWidth:e.scrollWidth,scrollHeight:e.scrollHeight,height:e.clientHeight}));assert.ok(reflow.scrollWidth<=reflow.width+1,`${name} dialog text zoom overflow`);
    await page.locator('#cookie-form button[type=submit]').click();assert.equal(await page.locator('#cookie-dialog').isVisible(),false);
    assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.deepEqual(external,[]);
    metrics.push({name,viewport:`${width} × ${height}`,...size,dialogTextZoom:reflow,axeViolations:0,resourceErrors:0});await context.close();
  }
  const context=await browser.newContext();const page=await context.newPage();await page.goto(base+'/',{waitUntil:'networkidle'});
  // Synthetic first-party callbacks exercise the real gate, no vendor/contact.
  await page.evaluate(()=>{
    window.testConsentCalls=[];
    for(const [id,category] of [['local-statistics','statistics'],['local-marketing','marketing']])VisionUniverseConsent.registerService({id,category,name:'Lokaler Test',description:'Keine Übertragung.',enable(){testConsentCalls.push(id+':enable')},disable(){testConsentCalls.push(id+':disable')}});
  });
  assert.deepEqual(await page.evaluate(()=>testConsentCalls),[]);
  await page.locator('#cookie-banner [data-cookie-settings]').click();await page.locator('#cookie-statistics').check();await page.locator('#cookie-form button[type=submit]').click();
  assert.deepEqual(await page.evaluate(()=>testConsentCalls),['local-statistics:enable']);
  await page.locator('footer [data-cookie-settings]').click();await page.locator('#cookie-dialog [data-cookie-choice=all]').click();
  assert.deepEqual(await page.evaluate(()=>testConsentCalls),['local-statistics:enable','local-marketing:enable']);
  await page.locator('footer [data-cookie-settings]').click();await page.locator('#cookie-dialog [data-cookie-choice=necessary]').click();
  assert.deepEqual(await page.evaluate(()=>testConsentCalls),['local-statistics:enable','local-marketing:enable','local-statistics:disable','local-marketing:disable']);
  assert.equal(await page.locator('#email').isDisabled(),true);assert.equal(await page.locator('#consent').isChecked(),false);
  await page.evaluate(()=>localStorage.setItem('vu_cookie_preferences','invalid'));await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('#cookie-banner').isVisible(),true);
  await context.close();
  const unavailable=await browser.newContext();await unavailable.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Blocked','SecurityError')}})});
  const blocked=await unavailable.newPage();await blocked.goto(base+'/',{waitUntil:'networkidle'});await blocked.locator('#cookie-banner [data-cookie-choice=necessary]').click();
  assert.equal(await blocked.locator('#cookie-banner').isVisible(),false);assert.match(await blocked.locator('#cookie-announcement').innerText(),/nicht.*dauerhaft/);assert.equal(await blocked.locator('#cookie-announcement').isVisible(),true);
  await blocked.locator('footer [data-cookie-settings]').click();await blocked.keyboard.press('Escape');assert.equal(await blocked.locator('#cookie-banner').isVisible(),false);await unavailable.close();
  const native=await browser.newContext({javaScriptEnabled:false});const noJs=await native.newPage();await noJs.goto(base+'/',{waitUntil:'networkidle'});await noJs.locator('footer [data-cookie-settings]').click();assert.equal(new URL(noJs.url()).pathname,'/datenschutz/');assert.equal(new URL(noJs.url()).hash,'#cookie-einstellungen');assert.match(await noJs.locator('main').innerText(),/Ohne JavaScript/);assert.deepEqual(await native.cookies(),[]);await native.close();
  const report={testedAt:new Date().toISOString(),browser:'Chromium; iPhone viewport, no physical Safari',metrics,checks:['first visit: no stored selection or cookies','equal actions and 44px targets','modal focus, Escape and no implicit consent','necessary/all/granular choices','reload and shared legal routes','200% text reflow','activation and withdrawal callbacks with local mocks only','invalid storage','blocked storage: honest visible message','no JavaScript fallback','newsletter remains independent and disabled'],liveTracking:false,liveBrevo:false};
  await writeFile(resolve(screenshots,'metrics.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
} finally {await browser.close();await new Promise(r=>server.close(r));}
