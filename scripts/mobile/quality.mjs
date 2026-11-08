import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {startServer} from './server.mjs';
const require=createRequire(import.meta.url),{chromium}=require('playwright'),{default:AxeBuilder}=require('@axe-core/playwright');
const root=process.argv[2], out=resolve(process.argv[3]||'/tmp/e5-quality');
await mkdir(out,{recursive:true});
const server=await startServer(root),base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'});
const routes=['/','/quant/','/quant/#/aktie/NVDA','/technical/#/chart/NVDA','/fundamental/#/NVDA','/supertrader/','/supertrader/stock/NVDA/','/discover/','/quant/musterdepots/','/analysten/','/mein-dashboard/'];
const deliveryOverlay=await readFile(resolve(root,'mobile-code-overlay.json'),'utf8').then(JSON.parse).catch(()=>null);
const rows=[],metadata={schema:1,measuredAt:new Date().toISOString(),deliveryOverlay,viewport:'390x844',browser:browser.version()};
try {
for(const mode of ['light','dark'])for(let i=0;i<routes.length;i++){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,colorScheme:mode,serviceWorkers:'block'});
 await context.addInitScript(mode=>localStorage.setItem('vu-discover-theme-v1',mode),mode);
 const page=await context.newPage(), errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const response=await page.goto(base+routes[i],{waitUntil:'load',timeout:60000});
 await page.waitForTimeout(8000);
 const axe=await new AxeBuilder({page}).withRules(['color-contrast']).analyze();
 const controls=await page.evaluate(()=>[...document.querySelectorAll('button,input:not([type=hidden]),select,summary,[role=button],a.vu-btn,a.vu-round,a.vu-snav-chip')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&e.checkVisibility({visibilityProperty:true,opacityProperty:true})&&!e.closest('[inert]');}).map(e=>{
  const labels=e.labels?[...e.labels]:[], ids=(e.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>document.getElementById(id)).filter(Boolean);
  const label=e.getAttribute('aria-label')||ids.map(n=>n.textContent).join(' ')||labels.map(n=>n.textContent).join(' ')||e.textContent?.trim();
  const rect=/^(checkbox|radio)$/.test(e.type)&&labels[0]?labels[0].getBoundingClientRect():e.getBoundingClientRect();
  return {tag:e.tagName,type:e.type,label:label?.slice(0,100),width:rect.width,height:rect.height,tabIndex:e.tabIndex};
 }).filter(e=>e.width<44||e.height<44||!e.label));
 const budget=await page.evaluate(()=>{const rs=performance.getEntriesByType('resource').filter(r=>/^\/discover\/(app|home|detail|themes)\.(js|css)$/.test(new URL(r.name).pathname));return {bytes:rs.reduce((n,r)=>n+r.decodedBodySize,0),requests:rs.length};});
 const focusOrder=[];
 for(let tab=0;tab<16;tab++){
  await page.keyboard.press('Tab');
  focusOrder.push(await page.evaluate(()=>{let e=document.activeElement;while(e?.shadowRoot?.activeElement)e=e.shadowRoot.activeElement;const r=e?.getBoundingClientRect();return {tag:e?.tagName,label:e?.getAttribute('aria-label')||e?.textContent?.trim().slice(0,80),inert:!!e?.closest('[inert]'),visible:!!r&&r.width>0&&r.height>0};}));
 }
 const overflow=await page.evaluate(()=>Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth);
 const movementLabels=await page.locator('.vu-shead-change,.vu-chg').evaluateAll(nodes=>nodes.map(e=>({text:e.textContent,label:e.getAttribute('aria-label'),role:e.getAttribute('role')})));
 const theme=await page.evaluate(()=>document.documentElement.getAttribute('data-theme'));
 const headerTop=await page.locator('vu-navigation,header.hd').first().evaluate(e=>e.getBoundingClientRect().top);
 await page.evaluate(()=>scrollTo(0,500));await page.waitForTimeout(100);
 const scrolledHeaderTop=await page.locator('vu-navigation,header.hd').first().evaluate(e=>e.getBoundingClientRect().top);
 const row={theme,headerTop,scrolledHeaderTop,budget,focusOrder,overflow,movementLabels,route:routes[i],mode,status:response?.status(),errors,violations:axe.violations,incomplete:axe.incomplete,controls};
 rows.push(row);console.log(JSON.stringify({...row,violations:axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:axe.incomplete.map(v=>({id:v.id,count:v.nodes.length}))}));
 await page.screenshot({path:resolve(out,`${mode}-${i}.png`),fullPage:true});
 await writeFile(resolve(out,'results.json'),JSON.stringify({...metadata,rows},null,2));
 if(routes[i]==='/analysten/'){
  const first=page.locator('.bar-row[role=button]').first();await first.focus();await page.keyboard.press('Enter');await page.waitForTimeout(300);
  const dialog=page.getByRole('dialog');
  if(!await dialog.isVisible())throw Error('Analyst dialog did not open from keyboard');
  for(let tab=0;tab<5;tab++){await page.keyboard.press('Tab');if(!await page.evaluate(()=>document.querySelector('#stock-detail').contains(document.activeElement)))throw Error('Dialog focus escaped');}
  const dialogAxe=await new AxeBuilder({page}).withRules(['color-contrast']).analyze();
  rows.push({route:routes[i],mode,view:'dialog',violations:dialogAxe.violations,incomplete:dialogAxe.incomplete});
  await page.keyboard.press('Escape');
  if(!await first.evaluate(e=>e===document.activeElement))throw Error('Analyst dialog did not restore focus');
 }
 await writeFile(resolve(out,'results.json'),JSON.stringify({...metadata,rows},null,2));
 await context.close();
}
await writeFile(resolve(out,'results.json'),JSON.stringify({...metadata,rows},null,2));
 const offlineContext=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'allow'}),offlinePage=await offlineContext.newPage();
 await offlinePage.goto(base+'/',{waitUntil:'load'});
 await offlinePage.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;});
 await offlinePage.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await offlinePage.evaluate(async()=>{await fetch('/discover/logos/files/NVDA.png');await fetch('/quant/data/product/market-regime-v1.json');});
 await offlinePage.waitForFunction(async()=>!!await caches.match('/discover/logos/files/NVDA.png'));
 await offlineContext.setOffline(true);
 const offlineDataRejected=await offlinePage.evaluate(()=>fetch('/quant/data/product/market-regime-v1.json').then(()=>false,()=>true));
 const logoBytes=await offlinePage.evaluate(()=>fetch('/discover/logos/files/NVDA.png').then(r=>r.arrayBuffer()).then(b=>b.byteLength));
 await offlinePage.goto(base+'/e5-offline-check/',{waitUntil:'domcontentloaded'});
 const offlineNotice=await offlinePage.getByRole('heading',{name:'Keine Verbindung'}).isVisible();
 const offline={offlineDataRejected,logoBytes,offlineNotice};await offlineContext.close();
 await writeFile(resolve(out,'results.json'),JSON.stringify({...metadata,rows,offline},null,2));
 if(!offlineDataRejected||!logoBytes||!offlineNotice)throw Error('Offline/cache browser contract failed');
 const failures=rows.filter(r=>r.violations.length||r.errors?.length||r.status>=400||r.theme&&r.theme!==r.mode||Math.abs(r.headerTop||0)>1||Math.abs(r.scrolledHeaderTop||0)>1||r.controls?.some(c=>!c.label||c.width<44||c.height<44)||r.focusOrder?.some(f=>f.inert||!f.visible)||r.budget?.bytes>180000||r.budget?.requests>12||r.overflow>1||r.movementLabels?.some(m=>!m.label||m.role!=='img'));if(failures.length)process.exitCode=1;
} finally {await browser.close();await new Promise(r=>server.close(r));}
