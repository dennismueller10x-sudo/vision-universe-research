// Live public acceptance without subscribing anyone, private access or mail delivery.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {root} from './build.mjs';

let policy=await readFile(resolve(root,'legal-drafts/newsletter-release-2026-10-14.html'),'utf8');
assert.match(policy,/data-policy-status="approved"/);
assert.match(policy,/data-newsletter-release-scope="public"/);
assert.doesNotMatch(policy,/\bOFFEN\b/);
// The existing build strips these exact shared browser navigation snippets.
for(const snippet of ['<link rel="stylesheet" href="/assets/site-navigation.css">','<vu-navigation></vu-navigation>','<script src="/assets/site-navigation.js"></script>'])policy=policy.replace(snippet,'');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
try{
  for(const [host,width,height] of [['visionuniverse.de',390,844],['www.visionuniverse.de',1440,1000]]){
    const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',()=>errors.push('pageerror'));
    const response=await page.goto('https://'+host+'/',{waitUntil:'networkidle'});
    assert.equal(response.status(),200);assert.equal(page.url(),'https://www.visionuniverse.de/');
    assert.equal(await page.locator('#newsletter-form').getAttribute('data-ready'),'true');
    assert.equal(await page.locator('#newsletter-form').getAttribute('data-controlled'),null);
    assert.equal(await page.locator('#newsletter-form').getAttribute('action'),'/api/newsletter/subscribe');
    for(const selector of ['#email','#consent','button[type=submit]'])assert.equal(await page.locator(selector).isDisabled(),false);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
    const probe=await page.evaluate(async()=>{
      const result=await fetch('/api/newsletter/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
      return {status:result.status,keys:Object.keys(await result.json())};
    });
    // Closed gates return 503 before input validation. A blank request must now
    // reach validation (400), never any provider call or email delivery.
    assert.equal(probe.status,400);assert.deepEqual(probe.keys,['message']);
    const privacy=await page.goto('https://www.visionuniverse.de/datenschutz/',{waitUntil:'networkidle'});
    assert.equal(privacy.status(),200);
    await page.waitForFunction(()=>!document.querySelector('a[href^="/cdn-cgi/l/email-protection"]'));
    const matches=await page.evaluate(source=>{
      // Cloudflare obfuscates public mailto links in transit. Compare the
      // decoded legal text, link targets and release markers, not CDN markup.
      const extract=doc=>{
        const body=doc.body.cloneNode(true);body.querySelectorAll('script,style').forEach(e=>e.remove());
        return {text:body.textContent.replace(/\s+/g,' ').trim(),
          links:[...doc.querySelectorAll('a')].map(a=>a.getAttribute('href')),
          markers:['lang','data-policy-status','data-newsletter-release-scope'].map(k=>doc.documentElement.getAttribute(k))};
      };
      return JSON.stringify(extract(document))===JSON.stringify(extract(new DOMParser().parseFromString(source,'text/html')));
    },policy);
    assert.equal(matches,true);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({host,finalHost:'www.visionuniverse.de',publicFormEnabled:true,privateAccessRequired:false,serverValidationHttp:400,approvedPolicyMatches:true,horizontalOverflow:false,emailsSent:0}));
    await context.close();
  }
}finally{await browser.close();}
