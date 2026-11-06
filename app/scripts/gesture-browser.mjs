// Real pages, real data; --out only. Requires Playwright and axe-core outside the web pipeline.
import {createRequire} from 'node:module';
import {mkdir, writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const arg = (k, d) => process.argv.find(a => a.startsWith('--'+k+'='))?.slice(k.length+3) || d;
const deps = arg('modules', process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES);
const {chromium} = require(deps ? deps+'/playwright' : 'playwright');
const axe = require.resolve(deps ? deps+'/axe-core/axe.min.js' : 'axe-core/axe.min.js');
const base = arg('url', 'http://127.0.0.1:8765');
const out = arg('out', '/tmp/vu-gestures-qa'); await mkdir(out, {recursive:true});
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', args:['--no-sandbox']});
const report = [];
async function contrast(page) {
  await page.addScriptTag({path:axe});
  return page.evaluate(async()=> (await axe.run(document,{runOnly:{type:'rule', values:['color-contrast']}})).violations.flatMap(v=>v.nodes.map(n=>({id:v.id,target:n.target,summary:n.failureSummary}))));
}
async function swipe(page, x, y, dx, dy, cancel=false, mid) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let i=1;i<=12;i++) {await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/12,y:y+dy*i/12}]});if(i===8&&mid) await mid();}
  await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]}); await cdp.detach();
  await page.waitForTimeout(350);
}
try {
  for (const [name, path, summary] of [['quant','/quant/','Zone, Ungültig-Marke und alle Bedingungen'],['supertrader','/supertrader/stock/NVDA/','Daten & Methodik']]) {
    for (const theme of ['light','dark']) {
      const ctx = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'no-preference'});
      const page=await ctx.newPage();
      await page.addInitScript(t=>localStorage.setItem('vu-discover-theme-v1',t),theme);
      const route = path+(name==='quant'?'#/aktie/NVDA':'');
      await page.goto(base+route); await page.waitForTimeout(4500);
      const before=await contrast(page);
      const original=page.locator('summary').filter({hasText:summary}).first(); await original.scrollIntoViewIfNeeded(); await original.click();
      await page.screenshot({path:out+'/'+name+'-'+theme+'-before.png'});
      await page.goto(base+path+'?vuGestures=1'+(name==='quant'?'#/aktie/NVDA':'')); await page.waitForTimeout(4500);
      await page.waitForFunction(()=>!!globalThis.VUGestures);
      const after = await contrast(page);
      assert.deepEqual(after.filter(v=>!before.some(b=>JSON.stringify(b.target)===JSON.stringify(v.target))),[], 'new page contrast findings');
      const target=page.locator('summary').filter({hasText:summary}).first(); await target.scrollIntoViewIfNeeded();
      await target.click(); const sheet=page.locator('.vu-gesture-sheet'); await sheet.waitFor({state:'visible'}); await page.waitForTimeout(300);
      await page.screenshot({path:out+'/'+name+'-'+theme+'-sheet.png'});
      const sheetContrast = await contrast(page);
      assert.deepEqual(sheetContrast,[], 'sheet contrast');
      const header=page.locator('.vu-gesture-head'); let r=await header.boundingBox();
      await swipe(page,195,r.y+25,0,-160);
      assert.equal(await sheet.evaluate(e=>e.classList.contains('vu-gesture-full')),true);
      assert.equal(await header.getByRole('button',{name:'Zurück'}).isVisible(),true);
      await page.screenshot({path:out+'/'+name+'-'+theme+'-full.png'});
      r=await header.boundingBox(); await swipe(page,195,r.y+25,0,240,true);
      assert.equal(await sheet.isVisible(),true, 'cancel retains sheet');
      r=await header.boundingBox(); await swipe(page,195,r.y+25,0,240);
      assert.equal(await page.locator('.vu-gesture-sheet').count(),0);
      if (name === 'supertrader') {
        const method=page.locator('a[href^="/supertrader/strategies/"]:visible').first();
        const address=page.url(); await method.click();
        await page.locator('.vu-gesture-document').waitFor();
        assert.equal(page.url(),address,'method detail remains over stock');
        await page.locator('.vu-gesture-head').getByRole('button',{name:'Zurück'}).click();
        assert.equal(await page.locator('.vu-gesture-document').count(),0);
      }
      // Focus returns to the original control. Scroll remains usable.
      await page.evaluate(()=>{scrollTo(0,0);history.pushState({},'',location.href+'&edge-test');});
      const url=page.url();
      await swipe(page,10,400,90,0); assert.equal(page.url(),url,'below threshold');
      await swipe(page,10,400,180,0,true); assert.equal(page.url(),url,'pointer cancel');
      await swipe(page,80,400,180,0); assert.equal(page.url(),url,'chart/table interior never starts back');
      await swipe(page,10,400,170,0,false,async()=>{
        assert(await page.evaluate(()=>parseFloat(getComputedStyle(document.body).transform.split(',')[4])>50),'page follows finger');
        const capture=await page.context().newCDPSession(page);
        const shot=await capture.send('Page.captureScreenshot',{format:'png'}); await writeFile(out+'/'+name+'-'+theme+'-drag.png',Buffer.from(shot.data,'base64')); await capture.detach();
      });
      assert.notEqual(page.url(),url,'35% navigates back');
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.evaluate(()=>history.pushState({},'',location.href+'&reduced'));
      await swipe(page,10,400,160,0); assert(!page.url().endsWith('&reduced'));
      report.push({name,theme,beforeContrast:before,afterContrast:after,sheetContrast,gestures:'pass'});
      await ctx.close();
    }
  }
  // Capacitor plugin contract: system back closes a sheet, navigates history, then minimizes at root.
  const nativeCtx = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,userAgent:'VUApp/1'});
  const nativePage = await nativeCtx.newPage();
  await nativePage.addInitScript(()=>{globalThis.__minimized=0;globalThis.Capacitor={isNativePlatform:()=>true,Plugins:{App:{addListener:(event,fn)=>{if(event==='backButton')globalThis.__systemBack=fn;},minimizeApp:()=>globalThis.__minimized++}}};});
  await nativePage.goto(base+'/quant/'); await nativePage.waitForFunction(()=>!!globalThis.__systemBack);
  await nativePage.evaluate(()=>globalThis.__systemBack()); assert.equal(await nativePage.evaluate(()=>__minimized),1);
  await nativePage.evaluate(()=>location.hash='/aktie/NVDA'); await nativePage.waitForTimeout(4000);
  await nativePage.locator('summary').filter({hasText:'Zone, Ungültig-Marke und alle Bedingungen'}).click();
  await nativePage.evaluate(()=>globalThis.__systemBack()); assert.equal(await nativePage.locator('.vu-gesture-sheet').count(),0);
  await nativePage.evaluate(()=>globalThis.__systemBack()); await nativePage.waitForTimeout(400);
  assert(!nativePage.url().includes('NVDA')); report.push({nativePlugin:'sheet/history/minimize pass (mock plugin; not a device test)'}); await nativeCtx.close();
  const ctx=await browser.newContext(); const p=await ctx.newPage();
  await p.goto(base+'/discover/'); await p.waitForTimeout(4500);
  const budget=await p.evaluate(()=>{const e=performance.getEntriesByType('resource');const a=e.filter(x=>/\/discover\/(app|home|detail|themes)\.(js|css)/.test(new URL(x.name).pathname));return {decoded:a.reduce((n,x)=>n+x.decodedBodySize,0),requests:a.length,gestureRequests:e.filter(x=>/vu-gestures\./.test(x.name)).length};});
  assert(budget.decoded<=180000&&budget.requests<=12); assert.equal(budget.gestureRequests,0);
  report.push({budget}); await ctx.close();
} finally {await writeFile(out+'/results.json',JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report.map(({name,theme,gestures,budget,nativePlugin})=>({name,theme,gestures,budget,nativePlugin})),null,2));
