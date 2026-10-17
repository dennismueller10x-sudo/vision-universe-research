// Entirely synthetic. No Brevo traffic, real contacts or email delivery.
import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {build,root} from '../scripts/build.mjs';
import {checkIphonePreview} from './iphone-preview-checks.mjs';

const output=resolve(root,'tests/output/public-browser');
const policy='tests/output/public-browser-policy.html';
await mkdir(resolve(root,'tests/output'),{recursive:true});
await writeFile(resolve(root,policy),'<!doctype html><html lang="de" data-policy-status="approved" data-newsletter-release-scope="public"><head><title>Nur synthetischer Datenschutz</title></head><body>Testfixture.</body></html>');
await build({output,production:true,config:{mode:'public',liveFlowVerified:true,privacyReviewed:true,privacyHtmlPath:policy}});
let origin,posts=0,accessCalls=0,previousStyleReads=0,previousMotionReads=0;
const server=createServer(async(req,res)=>{
  const requestUrl=new URL(req.url,origin),pathname=requestUrl.pathname;
  if(pathname==='/previous.html'){
    res.writeHead(200,{'Content-Type':'text/html'});
    res.end('<!doctype html><html><head><link rel="stylesheet" href="/styles.css"><script src="/presentation.js"></script></head><body>Previous deployment</body></html>');return;
  }
  if(pathname==='/styles.css'&&!requestUrl.search){
    previousStyleReads++;res.writeHead(200,{'Content-Type':'text/css','Cache-Control':'public, max-age=31536000'});
    res.end('body { --previous-landing-styles: loaded; }');return;
  }
  if(pathname==='/presentation.js'&&!requestUrl.search){
    previousMotionReads++;res.writeHead(200,{'Content-Type':'application/javascript','Cache-Control':'public, max-age=31536000'});
    res.end('document.documentElement.dataset.previousLandingMotion="loaded";document.documentElement.classList.add("intro");');return;
  }
  if(pathname==='/api/newsletter/test-access'){
    accessCalls++;res.writeHead(503);res.end();return;
  }
  if(pathname==='/api/newsletter/subscribe'){
    assert.equal(req.method,'POST');assert.equal(req.headers.authorization,undefined);
    let body='';for await(const chunk of req)body+=chunk;
    const form=req.headers['content-type'].startsWith('application/x-www-form-urlencoded');
    const data=form?Object.fromEntries(new URLSearchParams(body)):JSON.parse(body);
    assert.equal(data[form?'EMAIL':'email'],'synthetic-public@example.test');
    assert.equal(data[form?'OPT_IN':'consent'],form?'1':true);
    posts++;res.writeHead(form?303:202,form?{Location:'/newsletter/bestaetigen/'}:{'Content-Type':'application/json'});
    res.end(form?'':JSON.stringify({message:'Bitte bestätige deine E-Mail-Adresse.'}));return;
  }
  const path=resolve(output,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
  if(!path.startsWith(output+sep)){res.writeHead(404);res.end();return;}
  try{const content=await readFile(path);res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream'});res.end(content);}
  catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
try{
  for(const [name,engine] of [['Chromium',chromium],['WebKit',webkit]]){
    const browser=await engine.launch(name==='Chromium'?{executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']}:{});
    try{
      // No request routing here: Playwright routes disable the HTTP cache.
      // Reproduce a visitor who cached styles before the new module shipped.
      const cached=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
      const returning=await cached.newPage(),beforeStyles=previousStyleReads,beforeMotion=previousMotionReads,beforePosts=posts;
      await returning.goto(origin+'/previous.html',{waitUntil:'networkidle'});
      assert.equal(previousStyleReads,beforeStyles+1);
      assert.equal(previousMotionReads,beforeMotion+1);
      assert.equal(await returning.locator('html').getAttribute('data-previous-landing-motion'),'loaded');
      assert.equal(await returning.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--previous-landing-styles').trim()),'loaded');
      await returning.goto(origin+'/',{waitUntil:'networkidle'});
      assert.equal(previousStyleReads,beforeStyles+1,'Old URL must not be requested again');
      assert.equal(previousMotionReads,beforeMotion+1);
      assert.equal(await returning.locator('html').getAttribute('data-previous-landing-motion'),null,'New composition must not run cached old intro');
      assert.equal(await returning.locator('html').evaluate(e=>e.classList.contains('intro')),false);
      assert.equal(await returning.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--previous-landing-styles').trim()),'','New markup must not reuse cached old styles');
      await checkIphonePreview(returning);
      assert.equal(posts,beforePosts);assert.equal(await returning.locator('#email').isDisabled(),false);
      await cached.close();
      for(const javaScriptEnabled of [true,false]){
        const context=await browser.newContext({viewport:{width:390,height:844},javaScriptEnabled});
        await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
        const page=await context.newPage(),before=posts;
        await page.goto(origin+'/');
        await checkIphonePreview(page);
        assert.equal(posts,before); // The static iPhone never submits the newsletter form.
        assert.equal(await page.locator('#email').isDisabled(),false);
        assert.equal(await page.locator('#newsletter-form').getAttribute('data-controlled'),null);
        await page.locator('#email').fill('synthetic-public@example.test');
        await page.locator('#consent').check();
        await page.locator('button[type=submit]').click();
        await page.waitForURL('**/newsletter/bestaetigen/');
        assert.match(await page.locator('h1').innerText(),/Bitte bestätige deine E-Mail-Adresse/);
        assert.equal(posts,before+1);assert.equal(accessCalls,0);
        assert.equal(new URL(page.url()).hash,'');
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
        if(javaScriptEnabled)assert.deepEqual(await page.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0]);
        await context.close();
      }
      console.log(name+': returning mobile visitor with cached old styles verified; single static iPhone and ten complete product names verified; public signup without private access, native and JS submission, one synthetic request and mobile confirmation verified; zero emails.');
    }finally{await browser.close();}
  }
}finally{await new Promise(r=>server.close(r));}
