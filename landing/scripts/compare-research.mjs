// Design contracts and reproducible before/after captures. Since the owner approval of 14.11.2026 the start page
// is the website ("Website-Mock-up 3"); the checks of the former coming-soon picture are replaced by the equivalent
// requirements of the new page. Unchanged and still compared with the immutable baseline: the signup form (fields,
// consent, flags, action), every legal and confirmation page (wording and link targets) and the brand assets.
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
import {checkStartPage} from '../tests/start-page-checks.mjs';
import {checkConsentDisclosure} from '../tests/consent-disclosure-checks.mjs';

const baseline='11bda0c1a2a0d8add32ea0338a1ec32dfd8e3f49';
const provenance=JSON.parse(await readFile(resolve(root,'reference/source.json'),'utf8'));
const css=(await readFile(resolve(root,'assets/home/home.css'),'utf8')).replace('url(../fonts/inter-latin.woff2)','url(/assets/fonts/inter-latin.woff2)');
assert.equal(createHash('sha256').update(css).digest('hex'),provenance.cssSha256,'Originale Research-CSS bleibt unverändert');
const temporary=resolve(root,'tests/output/design-review');
await rm(temporary,{recursive:true,force:true});await mkdir(temporary,{recursive:true});
// An explicit immutable, public repository baseline; no live service or secrets.
const archive=execFileSync('git',['archive',baseline,'landing'],{cwd:resolve(root,'..'),maxBuffer:64*1024*1024});
execFileSync('tar',['-x','-C',temporary],{input:archive});
// Freigegebene Rechtstext-Revisionen (review/legal-revisions.json): nur genau diese Dateien mit genau dieser Prüfsumme
// ersetzen die Basisfassung. Jede weitere Änderung an Rechtstexten fällt weiter gegen die Basis auf.
for(const revision of JSON.parse(await readFile(resolve(root,'review/legal-revisions.json'),'utf8')).revisions)for(const {file,sha256} of revision.files){
  const bytes=await readFile(resolve(root,file));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),sha256,`${revision.id}: ${file} weicht von der freigegebenen Fassung ab`);
  await mkdir(resolve(temporary,'landing',file,'..'),{recursive:true});await writeFile(resolve(temporary,'landing',file),bytes);
}
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
    const content=await readFile(path);res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'application/javascript','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.woff2':'font/woff2','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream');res.end(content);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
const review=resolve(root,'review/redesign');await mkdir(review,{recursive:true});
const results=[];
try{
  // No height budgets any more: they belonged to the compact coming-soon page, the website is a full page.
  for(const[name,width,height]of[['desktop',1440,900],['iphone',390,844],['iphone-se',375,667],['tablet',768,1024],['narrow',320,800]]){
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,reducedMotion:'reduce',isMobile:width<=390,hasTouch:width<=390});
    const page=await context.newPage(),errors=[],external=[];let posts=0;
    page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(base))external.push(r.url());if(r.method()==='POST')posts++});
    await page.goto(base+'/after/',{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
    assert.equal((await page.locator('h1').textContent()).replace(/\s+/g,' ').trim(),'Die Börse ist laut. Wir bringen Ordnung hinein.');
    assert.equal(await page.locator('h1 .hl').innerText(),'Ordnung');
    assert.equal(await page.locator('.heroX .soon').innerText(),'App bald verfügbar · zum Start kostenlos');
    // Lime is a fill behind black text, never a text colour on white (owner 14.11.2026).
    assert.deepEqual(await page.locator('h1 .hl').evaluate(e=>[getComputedStyle(e).backgroundColor,getComputedStyle(e).color]),['rgb(200, 245, 49)','rgb(11, 12, 14)']);
    assert.match(await page.locator('h1').evaluate(e=>getComputedStyle(e).fontFamily),/Inter/);
    assert.equal(await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');
    // Palette: black, white, greys and the one neon lime. No green hue other than the lime and its pale tint.
    assert.deepEqual(await page.evaluate(()=>{
      const allowed=new Set(['200,245,49','238,249,204']),found=new Set();
      for(const e of document.querySelectorAll('body *'))for(const p of ['color','backgroundColor','borderTopColor','fill','stroke']){
        const m=/^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/.exec(getComputedStyle(e)[p]);if(!m||m[4]==='0')continue;
        const [r,g,b]=m.slice(1,4).map(Number);if(g>r+12&&g>b+12&&!allowed.has(`${r},${g},${b}`))found.add(`${p} ${m[0]} ${e.tagName}.${e.className}`);
      }
      return [...found];
    }),[],`${name}: only the neon lime and its pale tint`);
    assert.doesNotMatch(await page.locator('body').innerText(),/Konzeptansicht|Mock-up/);
    const metrics=await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight}));
    assert.equal(metrics.width,width,`${name}: no horizontal overflow`);
    await checkStartPage(page);
    await checkConsentDisclosure(page);
    // Only the authorized compact presentation differs: the full canonical
    // consent stays accessible, all fields/flags/action and dynamic states stay.
    const form=await page.locator('#newsletter-form').evaluate(e=>e.outerHTML);
    await page.goto(base+'/before/',{waitUntil:'networkidle'});
    const comparison=await page.locator('#newsletter-form').evaluate((before,html)=>{
      const after=new DOMParser().parseFromString(html,'text/html').querySelector('form');
      const full=after.querySelector('#consent-details-text').textContent;
      const canonical=before.querySelector('.consent>span').textContent.replace(/\s*Datenschutz\.$/,'');
      const copy=after.querySelector('.consent>span').textContent;
      const describedBy=after.querySelector('#consent').getAttribute('aria-describedby');
      const hint=after.querySelector('#signup-status').textContent;
      after.querySelector('.consent-details').remove();
      // Restore only the permitted text node; the privacy link and all its
      // attributes must still compare exactly with the original form.
      after.querySelector('.consent>span').firstChild.textContent=before.querySelector('.consent>span').firstChild.textContent;
      after.querySelector('#consent').setAttribute('aria-describedby',before.querySelector('#consent').getAttribute('aria-describedby'));
      after.querySelector('#signup-status').textContent=before.querySelector('#signup-status').textContent;
      const normalize=s=>s.replace(/>\s+</g,'><');
      return {canonicalMatches:full===canonical,copy,describedBy,hint,allOtherMarkupMatches:normalize(after.outerHTML)===normalize(before.outerHTML)};
    },form);
    assert.equal(comparison.canonicalMatches,true,'Original complete consent remains verbatim');
    assert.equal(comparison.copy,'Ich möchte den Newsletter per E-Mail erhalten. Abmeldung jederzeit. Datenschutz.');
    assert.equal(comparison.describedBy,'consent-error consent-details-text');
    assert.equal(comparison.hint,'Anmeldung mit E-Mail-Bestätigung.');
    assert.equal(comparison.allOtherMarkupMatches,true,'All form markup other than approved compact presentation unchanged');
    await page.goto(base+'/after/',{waitUntil:'networkidle'});
    const headerHeight=await page.locator('.nav .bar').evaluate(e=>e.getBoundingClientRect().height);
    await page.evaluate(()=>scrollTo({top:150,behavior:'instant'}));
    assert.deepEqual(await page.locator('.nav .bar').evaluate(e=>[e.getBoundingClientRect().height,Math.round(e.getBoundingClientRect().top)<=20]),[headerHeight,true],'Sticky header keeps its height and stays at the top during scroll');
    await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
    assert.equal(await page.locator('#email').isDisabled(),false);assert.equal(await page.locator('#consent').isChecked(),false);
    assert.ok(await page.locator('#email').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=16),'Email input avoids automatic Safari focus zoom');
    assert.equal(await page.locator('[name=CONSENT_VERSION]').getAttribute('value'),'vu-newsletter-v1');
    for(const selector of ['#email','button[type=submit]','.consent']){
      const box=await page.locator(selector).boundingBox();assert.ok(box.width>=44&&box.height>=44,'Signup retains 44px touch targets');
    }
    if(['desktop','iphone','iphone-se'].includes(name))await page.screenshot({path:resolve(review,'after-'+name+'.png')});
    for(const path of ['impressum/','datenschutz/','newsletter/bestaetigen/','newsletter/bestaetigt/','newsletter/fehler/']){
      await page.goto(base+'/after/'+path,{waitUntil:'networkidle'});
      const afterText=await page.locator('body').innerText(),afterLinks=await page.locator('a').evaluateAll(es=>es.map(e=>e.getAttribute('href')));
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width,`${name}: legal overflow`);
      // Legal and confirmation pages wear the light design of the website (owner 14.11.2026); only legal.css changed.
      assert.equal(await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');
      assert.match(await page.locator('.brand').evaluate(e=>getComputedStyle(e,'::before').content),/^"VISION UNIVERSE®"/);
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
    results.push({name,viewport:{width,height},pageHeight:metrics.height,horizontalOverflow:false,oneStageDevice:true,twelveModules:true,completeModuleNames:true,onlyNeonLime:true,formControlsAndConsentUnchanged:true,compactConsentDisclosure:true,signupClosesThePage:true,legalTextAndLinksUnchanged:true,legalAxeViolations:0,externalRequests:0,posts:0});await context.close();
  }
  await writeFile(resolve(review,'checks.json'),JSON.stringify({baseline,reference:provenance.commit,scope:'Local public-mode rendering, approved unchanged privacy document, no credentials or live endpoints; legal copy/links compared with immutable baseline.',results},null,2)+'\n');
  console.log(JSON.stringify(results,null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
