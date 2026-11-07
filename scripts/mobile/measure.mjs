/** E5 mobile lab. Install Playwright outside the root; NODE_PATH=/tmp/e5-tools/node_modules.
 * node scripts/mobile/measure.mjs --root /tmp/release --out /tmp/before.json
 * Chromium executable: --browser /usr/bin/chromium. No production artifacts written.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {startServer} from './server.mjs';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const arg = (n, fallback) => { const i = process.argv.indexOf(n); return i < 0 ? fallback : process.argv[i + 1]; };
const root = resolve(arg('--root', '.'));
const runs = Number(arg('--runs', 3)), windowMs = Number(arg('--window', 20000));
if (!Number.isInteger(runs) || runs < 1 || !Number.isFinite(windowMs) || windowMs < 1000) throw Error('Invalid runs/window');
const {chromium} = createRequire(import.meta.url)('playwright');
const routes = ['/', '/quant/', '/quant/#/aktie/NVDA', '/technical/#/chart/NVDA', '/fundamental/#/NVDA', '/supertrader/', '/supertrader/stock/NVDA/', '/discover/', '/quant/musterdepots/', '/analysten/', '/mein-dashboard/'];
const server = await startServer(root);
const base = arg('--base-url', `http://127.0.0.1:${server.address().port}`);
const browser = await chromium.launch({executablePath:arg('--browser', undefined)});
const samples = [];
const overlay = await readFile(resolve(root, 'mobile-code-overlay.json'), 'utf8').then(JSON.parse).catch(() => null);
const delivery = await readFile(resolve(root, 'release-delivery.json'), 'utf8').then(JSON.parse).catch(() => null);
try {
 for (const route of routes.filter(p => !arg('--route') || p === arg('--route'))) for (let run = 1; run <= runs; run++) {
  const context = await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,serviceWorkers:'block',colorScheme:'light'});
  const page = await context.newPage(), cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', {cacheDisabled:true});
  await cdp.send('Network.emulateNetworkConditions', {offline:false,latency:150,downloadThroughput:1600000/8,uploadThroughput:750000/8,connectionType:'cellular4g'});
  await cdp.send('Emulation.setCPUThrottlingRate', {rate:4});
  await page.addInitScript(() => {
   const m = window.__e5 = {lcp:null,cls:0,shifts:[],tasks:[],firstNumber:null,numberText:null};
   let sum = 0, start = 0, last = 0;
   new PerformanceObserver(list => {for (const e of list.getEntries()) m.lcp = e.startTime;}).observe({type:'largest-contentful-paint',buffered:true});
   new PerformanceObserver(list => {for (const e of list.getEntries()) if (!e.hadRecentInput) {if (e.startTime-last > 1000 || e.startTime-start > 5000) {sum=0;start=e.startTime;} sum+=e.value;last=e.startTime;m.shifts.push({at:e.startTime,value:e.value,sources:(e.sources||[]).map(s=>({node:(s.node?.nodeName||'')+'#'+(s.node?.id||'')+'.'+(typeof s.node?.className==='string'?s.node.className:''),previous:s.previousRect.toJSON(),current:s.currentRect.toJSON()}))});m.cls=Math.max(m.cls,sum);}}).observe({type:'layout-shift',buffered:true});
   new PerformanceObserver(list => m.tasks.push(...list.getEntries().map(e => ({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});
   // Explicit stock-head value; never count dates, navigation counts or a skeleton.
   function number() {
    const el=document.querySelector('.vu-shead-value');
    if (!el || !/\d/.test(el.textContent)) return;
    const r=el.getBoundingClientRect(), s=getComputedStyle(el);
    if (r.width && r.height && r.top < innerHeight && r.bottom > 0 && s.visibility!=='hidden' && s.display!=='none') {
     requestAnimationFrame(() => {if (m.firstNumber===null) {m.firstNumber=performance.now();m.numberText=el.textContent.trim();}});
     observer.disconnect();
    }
   }
   const observer=new MutationObserver(number);observer.observe(document,{childList:true,subtree:true,characterData:true});
  });
  const requests=[], current=new Map(), errors=[];
  cdp.on('Network.requestWillBeSent', e => {if (/^https?:/.test(e.request.url)) {const r={url:e.request.url,bytes:0};requests.push(r);current.set(e.requestId,r);}});
  cdp.on('Network.responseReceived', e => {const r=current.get(e.requestId);if(r) r.status=e.response.status;});
  cdp.on('Network.dataReceived', e => {const r=current.get(e.requestId);if(r) r.bytes+=e.encodedDataLength;});
  cdp.on('Network.loadingFinished', e => {const r=current.get(e.requestId);if(r) {r.bytes=e.encodedDataLength;r.finished=true;}});
  cdp.on('Network.loadingFailed', e => {const r=current.get(e.requestId);if(r) r.error=e.errorText;});
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base+route, {waitUntil:'commit',timeout:60000});
  await page.waitForTimeout(windowMs);
  const metrics=await page.evaluate(() => {
   const m=window.__e5, fcp=performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null;
   return {...m,cls:fcp===null?null:m.cls,tasks:undefined,fcp,tbt:fcp===null?null:m.tasks.reduce((s,t)=>s+(fcp===null?0:Math.max(0,t.start+t.duration-Math.max(t.start+50,fcp))),0)};
  });
  const sample={route,run,...metrics,requests:requests.length,bytes:requests.reduce((s,r)=>s+r.bytes,0),unfinished:requests.filter(r=>!r.finished&&!r.error).length,failures:requests.filter(r=>r.status>=400||r.error),errors,resources:requests};
  samples.push(sample);
  console.log(JSON.stringify({...sample,resources:undefined}));
  await context.close();
 }
 const median = a => {a=a.map(x=>x===null?Infinity:x).sort((a,b)=>a-b);const value=a[Math.floor(a.length/2)];return Number.isFinite(value)?value:null;};
 const rows=[...new Set(samples.map(s=>s.route))].map(route=> {const ss=samples.filter(s=>s.route===route);return {route,...Object.fromEntries(['lcp','cls','tbt','bytes','requests','firstNumber'].map(k=>[k,median(ss.map(s=>s[k]))])),incompleteRuns:ss.filter(s=>s.unfinished>0||s.lcp===null).length,failedRuns:ss.filter(s=>s.failures.length||s.errors.length).length};});
 const result={schema:1,deliveryOverlay:overlay,sourceCommit:delivery?.sourceCommit ?? null,commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),browser:browser.version(),measuredAt:new Date().toISOString(),profile:{viewport:'390x844',downloadBps:1600000,uploadBps:750000,latencyMs:150,cpu:4,windowMs,runs,cache:'cold, SW blocked',root,base},note:'TBT lab proxy: long-task blocking after FCP until fixed observation end; not INP or Lighthouse TBT. Null firstNumber = no visible stock-head price within window. Bytes = CDP wire including headers; unfinished responses counted partially.',rows,samples};
 await writeFile(resolve(arg('--out','/tmp/e5-measurement.json')),JSON.stringify(result,null,2)+'\n');
 console.table(rows);
} finally {await browser.close();await new Promise(r=>server.close(r));}
