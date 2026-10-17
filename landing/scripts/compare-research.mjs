// Design contracts and reproducible before/after captures. Research source assets
// stay byte-identical; landing geometry deliberately follows the approved brief.
import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,stat,rm} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {root,build} from './build.mjs';
import {checkProductGallery,showDiscover} from '../tests/product-gallery-checks.mjs';

const baseline='11bda0c1a2a0d8add32ea0338a1ec32dfd8e3f49';
const provenance=JSON.parse(await readFile(resolve(root,'reference/source.json'),'utf8'));
const css=(await readFile(resolve(root,'assets/home/home.css'),'utf8')).replace('url(../fonts/inter-latin.woff2)','url(/assets/fonts/inter-latin.woff2)');
assert.equal(createHash('sha256').update(css).digest('hex'),provenance.cssSha256,'Originale Research-CSS bleibt unverändert');
const temporary=resolve(root,'tests/output/design-review');
await rm(temporary,{recursive:true,force:true});await mkdir(temporary,{recursive:true});
// An explicit immutable, public repository baseline; no live service or secrets.
const archive=execFileSync('git',['archive',baseline,'landing'],{cwd:resolve(root,'..'),maxBuffer:64*1024*1024});
execFileSync('tar',['-x','-C',temporary],{input:archive});
const previous=await import(pathToFileURL(resolve(temporary,'landing/scripts/build.mjs')));
const config={mode:'public',liveFlowVerified:true,privacyReviewed:true,privacyHtmlPath:'legal-drafts/newsletter-release-2026-10-14.html'};
await previous.build({config});
const output=resolve(root,'tests/output/design-current');await build({output,config});
const directories={before:resolve(temporary,'landing/dist'),after:output};
// Check original font/logo bytes too: no redrawn or substituted brand assets.
for(const asset of ['assets/fonts/inter-latin.woff2','assets/vision-universe-logo.png','assets/vision-universe-logo-web.png'])assert.deepEqual(await readFile(resolve(output,asset)),await readFile(resolve(directories.before,asset)));
const server=createServer(async(req,res)=>{
  try{
    const pathname=new URL(req.url,'http://localhost').pathname,version=pathname.split('/')[1],directory=directories[version];
    if(!directory)throw Error();let path=resolve(directory,'.'+pathname.slice(version.length+1));
    if(path!==directory&&!path.startsWith(directory+sep))throw Error();if((await stat(path)).isDirectory())path=resolve(path,'index.html');
    const content=await readFile(path);res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'application/javascript','.png':'image/png','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream');res.end(content);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
const review=resolve(root,'review/redesign');await mkdir(review,{recursive:true});
const results=[];
try{
  for(const[name,width,height,budget]of[['desktop',1440,900,1800],['iphone',390,844,1688],['tablet',768,1024,2200],['narrow',320,800,2000]]){
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,reducedMotion:'reduce',isMobile:name==='iphone',hasTouch:name==='iphone'});
    const page=await context.newPage(),errors=[],external=[];let posts=0;
    page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(base))external.push(r.url());if(r.method()==='POST')posts++});
    await page.goto(base+'/after/',{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
    assert.equal((await page.locator('h1').textContent()).replace(/\s+/g,' ').trim(),'Investieren mit Weitblick. Alles in einer App.');
    assert.equal(await page.locator('h1 em').innerText(),'Weitblick.');
    assert.match(await page.locator('.hero-badge').innerText(),/Coming soon\s*Bald verfügbar/i);
    assert.match(await page.locator('.preview-caption').innerText(),/Noch nicht verfügbar\./);
    assert.equal(await page.locator('h1 em').evaluate(e=>getComputedStyle(e).color),'rgb(200, 245, 49)');
    assert.match(await page.locator('h1').evaluate(e=>getComputedStyle(e).fontFamily),/Inter/);
    assert.equal(await page.locator('.footer').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(8, 10, 12)');
    assert.equal(await page.locator('.browser').count(),0,'Overview uses an iPhone');
    assert.equal(await page.locator('.preview-caption>span').textContent(),'Konzeptansicht');
    const metrics=await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,cta:document.querySelector('.hero-cta').getBoundingClientRect().toJSON(),form:document.querySelector('#newsletter').getBoundingClientRect().toJSON(),products:document.querySelector('#produkte').getBoundingClientRect().toJSON(),hero:document.querySelector('#hero').getBoundingClientRect().toJSON()}));
    const totalBudget=width<=760?budget+430:budget;
    assert.equal(metrics.width,width,`${name}: no horizontal overflow`);assert.ok(metrics.height<=totalBudget,`${name}: compact three-section page (${metrics.height})`);
    assert.ok(metrics.cta.top>0&&metrics.cta.bottom<height,`${name}: CTA in first viewport`);
    assert.ok(metrics.hero.bottom<=metrics.products.top&&metrics.products.bottom<=metrics.form.top,'Three areas: hero, products, newsletter');
    for(const card of await page.locator('.product-card').all()){
      const box=await card.boundingBox(),phone=await card.locator('.phone').boundingBox();
      assert.ok(phone.x>=box.x-1&&phone.x+phone.width<=box.x+box.width+1&&phone.y+phone.height<=box.y+box.height+1,'Entire iPhone fits its tile');
    }
    await checkProductGallery(page);
    const headerHeight=await page.locator('.lp-head').evaluate(e=>e.getBoundingClientRect().height);
    await page.evaluate(()=>scrollTo(0,150));await page.waitForFunction(()=>document.querySelector('.lp-head').classList.contains('scrolled'));
    assert.equal(await page.locator('.lp-head').evaluate(e=>e.getBoundingClientRect().height),headerHeight,'Sticky header must not shift the signup during scroll');
    await page.evaluate(()=>scrollTo(0,0));await page.waitForFunction(()=>!document.querySelector('.lp-head').classList.contains('scrolled'));
    assert.equal(await page.locator('#email').isDisabled(),false);assert.equal(await page.locator('#consent').isChecked(),false);
    assert.ok(await page.locator('#email').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=16),'Email input avoids automatic Safari focus zoom');
    assert.equal(await page.locator('[name=CONSENT_VERSION]').getAttribute('value'),'vu-newsletter-v1');
    for(const selector of ['.deck-btn','[data-preview-reset]'])for(const box of await page.locator(selector).evaluateAll(es=>es.map(e=>e.getBoundingClientRect().toJSON())))assert.ok(box.width>=44&&box.height>=44,'Swipe controls retain 44px touch targets');
    if(['desktop','iphone'].includes(name)){
      await page.locator('#product-track').evaluate(e=>e.scrollLeft=0);
      await page.screenshot({path:resolve(review,'after-'+name+'.png'),fullPage:true});
      await showDiscover(page);
      await page.evaluate(()=>scrollTo(0,document.querySelector('#produkte').getBoundingClientRect().top+scrollY-document.querySelector('.lp-head').getBoundingClientRect().height-16));
      // Chromium full-page capture resets nested horizontal scrollers. Capture
      // the selected tile at its real viewport position, without changing CSS.
      await page.screenshot({path:resolve(review,'after-'+name+'-discover.png')});
      await page.locator('#product-track').evaluate(e=>e.scrollLeft=0);
    }
    for(const path of ['impressum/','datenschutz/','newsletter/bestaetigen/','newsletter/bestaetigt/','newsletter/fehler/']){
      await page.goto(base+'/after/'+path,{waitUntil:'networkidle'});
      const afterText=await page.locator('body').innerText(),afterLinks=await page.locator('a').evaluateAll(es=>es.map(e=>e.getAttribute('href')));
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width,`${name}: legal overflow`);
      assert.equal(await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(8, 10, 12)');
      const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.deepEqual(axe.violations.map(v=>({id:v.id,target:v.nodes.map(n=>n.target)})),[],`${name}: ${path} accessibility`);
      assert.match(await page.locator('link[rel=stylesheet]').getAttribute('href'),/legal\.css\?v=[a-f0-9]{16}$/,'Legal styles bypass stale browser caches');
      if(['desktop','iphone'].includes(name)&&['impressum/','datenschutz/','newsletter/bestaetigen/'].includes(path))await page.screenshot({path:resolve(review,'after-'+path.split('/')[0]+'-'+name+'.png'),fullPage:path==='impressum/'});
      await page.goto(base+'/before/'+path,{waitUntil:'networkidle'});
      assert.equal(await page.locator('body').innerText(),afterText,'All legal/confirmation wording unchanged');
      assert.deepEqual(await page.locator('a').evaluateAll(es=>es.map(e=>e.getAttribute('href'))),afterLinks,'All legal destinations unchanged');
      if(['desktop','iphone'].includes(name)&&path==='impressum/')await page.screenshot({path:resolve(review,'before-imprint-'+name+'.png'),fullPage:true});
    }
    if(['desktop','iphone'].includes(name)){await page.goto(base+'/before/',{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:resolve(review,'before-'+name+'.png'),fullPage:true});}
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.equal(posts,0);
    results.push({name,viewport:{width,height},pageHeight:metrics.height,horizontalOverflow:false,ctaInFirstViewport:true,threeSections:true,iphoneOverview:true,productGallery:true,newsletterAfterProducts:true,legalTextAndLinksUnchanged:true,legalAxeViolations:0,externalRequests:0,posts:0});await context.close();
  }
  await writeFile(resolve(review,'checks.json'),JSON.stringify({baseline,reference:provenance.commit,scope:'Local public-mode rendering, approved unchanged privacy document, no credentials or live endpoints; legal copy/links compared with immutable baseline.',results},null,2)+'\n');
  console.log(JSON.stringify(results,null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
