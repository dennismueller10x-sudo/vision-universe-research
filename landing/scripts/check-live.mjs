// Acceptance against the actual Pages preview/public landing; never submits leads.
import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {root} from './build.mjs';

const url=new URL(process.argv[2]);
assert.ok(url.protocol==='https:'&&!url.username&&!url.password&&(url.hostname.endsWith('.pages.dev')||url.hostname==='www.visionuniverse.de'),'Nur tatsächliche Pages-URL oder eigene www-Domain prüfen');
const expected=JSON.parse(await readFile(resolve(root,'review/design-comparison.json'),'utf8'));
const cssResponse=await fetch(new URL('assets/home/home.css',url));assert.equal(cssResponse.status,200);
const css=(await cssResponse.text()).replace('url(../fonts/inter-latin.woff2)','url(/assets/fonts/inter-latin.woff2)');
assert.equal(createHash('sha256').update(css).digest('hex'),expected.reference.cssSha256);
const selectors={header:'.lp-head',logo:'.lp-logo',logoImage:'.lp-logo img',shell:'.hero .shell',hero:'.hero',grid:'.hero-grid',title:'.hero h1',accent:'.hero h1 em',lead:'.hero .lead',badge:'.hero-badge',button:'.hero .btn-app',glow:'.hero::before',background:'.hero-grid-fx',stage:'.stage',phone:'.stage .phone',browser:'.stage .browser',hud:'.stage .hud'};
const output=resolve(root,'tests/output/live');await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
const metrics=[];
try{
  for(const[name,width,height,limit]of[['desktop',1440,900,1800],['iphone',390,844,1688]]){
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,reducedMotion:'reduce',isMobile:name==='iphone',hasTouch:name==='iphone'});
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const response=await page.goto(url.href,{waitUntil:'networkidle'});assert.equal(response.status(),200);await page.evaluate(()=>document.fonts.ready);
    assert.match(await page.locator('.hero-badge').innerText(),/app\s+bald verfügbar/i);
    assert.equal(await page.locator('input[type=password],script[src*="access-gate"]').count(),0);
    assert.doesNotMatch(await page.locator('body').innerText(),/NVIDIA|NVDA/);
    assert.equal(await page.locator('a[href*="apps.apple.com"],a[href*="play.google.com"]').count(),0);
    assert.equal(await page.locator('#newsletter-form').getAttribute('data-ready'),'false');
    assert.equal(await page.locator('#email').isDisabled(),true);assert.equal(await page.locator('button[type=submit]').isDisabled(),true);
    assert.match(await page.locator('#signup-status').innerText(),/noch nicht entgegennehmen/);
    const m=await page.evaluate(()=>({height:document.documentElement.scrollHeight,width:document.documentElement.scrollWidth}));assert.equal(m.width,width);assert.ok(m.height<=limit);
    const original=expected.comparisons.find(c=>c.name===name).styles;
    const actual=await page.evaluate(({selectors,original})=>Object.fromEntries(Object.entries(selectors).map(([name,selector])=>{
      const [main,pseudo]=selector.split('::');const style=getComputedStyle(document.querySelector(main),pseudo?'::'+pseudo:null);
      return[name,Object.fromEntries(Object.keys(original[name]).map(prop=>[prop,style[prop]]))];
    })),{selectors,original});assert.deepEqual(actual,original,name+': 17 originale Research-Stilgruppen');
    const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.equal(axe.violations.length,0);assert.deepEqual(errors,[]);
    await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').innerText(),'Zum Inhalt');
    await page.locator('.hero .btn').click();assert.equal(new URL(page.url()).hash,'#newsletter');
    await page.goto(url.href,{waitUntil:'networkidle'});await page.screenshot({path:resolve(output,name+'.png'),fullPage:true});
    metrics.push({name,...m,axeViolations:0,styleGroups:17,newsletter:'BLOCKED'});await context.close();
  }
  await writeFile(resolve(output,'metrics.json'),JSON.stringify({url:url.origin,checkedAt:new Date().toISOString(),metrics},null,2));console.log(JSON.stringify(metrics));
}finally{await browser.close();}
