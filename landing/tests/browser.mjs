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
await build({output:resolve(output,'ready'),config:{formUrl:'https://test.sibforms.com/serve/SYNTHETIC_FORM',unsubscribeFormUrl:'https://test.sibforms.com/serve/SYNTHETIC_UNSUBSCRIBE',liveFlowVerified:true,privacyReviewed:true,privacyHtmlPath:'tests/output/privacy-fixture.html'}});
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
  // Provider fixture proves iframe integration, never real DOI or mail delivery.
  for(const width of [1440,390,320]){
    const page=await browser.newPage({viewport:{width,height:844}});
    let providerLoads=0;
    await page.route('https://test.sibforms.com/**',async route=>{
      providerLoads++;
      assert.equal(route.request().method(),'GET');
      assert.equal(route.request().headers()['referer'],undefined);
      await route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html lang="de"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:12px"><h1>Nur synthetisches Brevo-Formular</h1><label>E-Mail <input type="email" required></label><p>Diese Fixture meldet niemanden an.</p></body></html>'});
    });
    await page.goto(base+'/ready/',{waitUntil:'networkidle'});
    await page.locator('iframe').scrollIntoViewIfNeeded();
    await page.frameLocator('iframe').locator('h1').waitFor();
    assert.equal(providerLoads,1);
    assert.equal(await page.locator('#newsletter-form,input[name=EMAIL]').count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
    assert.equal(await page.locator('iframe').getAttribute('title'),'Anmeldung zum Vision-Universe-Newsletter');
    assert.ok(await page.locator('.brevo-form a').isVisible());
    await page.goto(base+'/ready/newsletter/bestaetigt/');
    assert.match(await page.locator('main').innerText(),/direkter Aufruf dieser Seite bestätigt keine Anmeldung/);
    assert.equal(await page.locator('#brevo-unsubscribe a').getAttribute('href'),'https://test.sibforms.com/serve/SYNTHETIC_UNSUBSCRIBE');
    assert.equal(await page.locator('main button,main input').count(),0);
    await page.close();
  }
  const nojs=await browser.newContext({javaScriptEnabled:false});
  const page=await nojs.newPage();await page.goto(base+'/blocked/');
  assert.equal(await page.locator('#email').isDisabled(),true);
  assert.equal(await page.locator('iframe').count(),0);
  await nojs.close();
  await writeFile(resolve(screenshots,'metrics.json'),JSON.stringify({metrics,newsletter:'Brevo-Iframe mit abgefangener synthetischer Providerseite geprüft. Kein echter Brevo-Kontakt, Postfach- oder Abmeldetest.',browser:'Chromium',testedAt:new Date().toISOString()},null,2)+'\n');
  console.log(JSON.stringify({metrics,formChecks:'blocked/no-JS, synthetic provider iframe at 1440/390/320, no parent POST, no referrer, static redirect notice, provider unsubscribe link',liveBrevo:'BLOCKED'},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
