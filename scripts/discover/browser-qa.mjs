#!/usr/bin/env node
import {navigate} from '../quality/browser-navigation.mjs';
// Real-browser checks; no fixture interception and no simulated market data.
// Browser QA of the one canonical Discover (/discover/, formerly served as /discover-v2/).
// Usage: node scripts/discover/browser-qa.mjs --url http://127.0.0.1:8765 --out /tmp/discover-qa
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {SPECS,waitRendered} from './direct-link-lib.mjs';
import {activeDefects, createRecorder} from './known-defects.mjs';
const require=createRequire(import.meta.url);
let playwright;
try{playwright=require('playwright');}catch{playwright=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');}
const arg=(key,otherwise)=>{const i=process.argv.indexOf('--'+key);return i<0?otherwise:process.argv[i+1];};
const base=arg('url','http://127.0.0.1:8765').replace(/\/$/,'');
const out=arg('out','/tmp/discover-qa');await mkdir(out,{recursive:true});
const engine=arg('engine','chromium');assert(['chromium','webkit'].includes(engine));
const browser=await playwright[engine].launch({headless:true,...(engine==='chromium'?{executablePath:process.env.CHROMIUM_PATH||undefined}:{})});
const checks=[],errors=[],shots=[],performance=[],accessibility=[],firstScreenEvidence=[],interactionEvidence=[],screenshotEvidence=[],designEvidence=[];
let axePath;try{axePath=require.resolve('axe-core/axe.min.js');}catch{}
async function a11y(page,key){if(!axePath)throw Error('axe-core required for accessibility gate');await page.addScriptTag({path:axePath});const result=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}));accessibility.push({key,violations:result.violations,incomplete:result.incomplete});assert.deepEqual(result.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);}
async function check(name,fn){const started=Date.now();try{await fn();checks.push({name,pass:true,milliseconds:Date.now()-started});}catch(e){checks.push({name,pass:false,milliseconds:Date.now()-started,error:e.message});}}
async function screenshot(page,name){
 // Use the same actual clipping semantics as the canonical lazy loader.
 // Bounding boxes alone count cards hidden above a scroll container as visible.
 let readinessError=null;
 try{
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>!Array.from(document.querySelectorAll('.dx-lazy-media[data-loading]')).some(node=>{
   let r=node.getBoundingClientRect(),left=Math.max(0,r.left),right=Math.min(innerWidth,r.right),top=Math.max(0,r.top),bottom=Math.min(innerHeight,r.bottom);
   for(let p=node.parentElement;p&&right>left&&bottom>top;p=p.parentElement){const s=getComputedStyle(p);if(s.overflowX!=='visible'||s.overflowY!=='visible'){r=p.getBoundingClientRect();left=Math.max(left,r.left);right=Math.min(right,r.right);top=Math.max(top,r.top);bottom=Math.min(bottom,r.bottom);}}
   return right>left&&bottom>top;
  }),{},{timeout:15000});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 }catch(error){readinessError=error.message;checks.push({name:name+' screenshot visible artwork readiness',pass:false,error:readinessError});}
 const pending=await page.evaluate(()=>Array.from(document.querySelectorAll('.dx-lazy-media[data-loading]')).map(node=>({symbol:node.dataset.symbol,bounds:node.getBoundingClientRect().toJSON(),clippingAncestors:Array.from((function*(n){for(let p=n.parentElement;p;p=p.parentElement)yield p;})(node)).filter(parent=>{const style=getComputedStyle(parent);return style.overflowX!=='visible'||style.overflowY!=='visible';}).map(parent=>({className:parent.className,bounds:parent.getBoundingClientRect().toJSON(),overflow:getComputedStyle(parent).overflow}))})));
 screenshotEvidence.push({name,readinessError,pending});
 const path=out+'/'+name+'.png';try{await page.screenshot({path,fullPage:false});shots.push(path);}catch(error){checks.push({name:name+' screenshot capture',pass:false,error:error.message});}
}
async function waitCounter(page,index){await page.waitForFunction(i=>new RegExp('^'+i+'\\s+von\\s','i').test(document.querySelector('.dx-feed-zaehler')?.textContent?.trim()||''),index);}
async function visibleFeedStock(page){/* Redesign D05: eine Karte je Aktie. */return page.locator('.dv3-card[data-symbol]').evaluate(n=>({index:Number(n.dataset.index),symbol:n.dataset.symbol}));}
async function premiumMobileAudit(page,key){

 const material=await page.evaluate(()=>{
  const css=n=>getComputedStyle(n),rgb=value=>(value.match(/[\d.]+/g)||[]).slice(0,4).map(Number);
  const luminance=value=>{const c=rgb(value);return c.length<3?null:(c[0]+c[1]+c[2])/3;};
  /* UI-Vereinheitlichung 10/2026: Kopf und Produkt-Leiste sind die gemeinsame
     Vision-Universe-Shell (vu-navigation, #vu-dock - beide im Shadow DOM). */
  const body=css(document.body),main=css(document.querySelector('.v2-main')),bar=css(document.querySelector('vu-navigation').shadowRoot.querySelector('header'));
  const host=document.getElementById('vu-dock'),dock=host.shadowRoot.querySelector('nav'),ds=css(dock),db=dock.getBoundingClientRect();
  const active=dock.querySelector('[aria-current=page]'),as=active&&css(active);
  return {bodyBackground:body.backgroundColor,mainBackground:main.backgroundColor,barBackground:bar.backgroundColor,
   pureWhite:[body.backgroundColor].every(v=>{const c=rgb(v);return c[0]===255&&c[1]===255&&c[2]===255;})&&luminance(bar.backgroundColor)>=250,
   dock:{box:db.toJSON(),position:css(host).position,bottom:innerHeight-db.bottom,left:db.left,right:innerWidth-db.right,borderRadius:parseFloat(ds.borderRadius),background:ds.backgroundColor,luminance:luminance(ds.backgroundColor),boxShadow:ds.boxShadow},
   active:{background:as&&as.backgroundColor,color:as&&as.color,luminance:as&&luminance(as.backgroundColor)}};
 });
 designEvidence.push({key,type:'premium-material',...material});
 assert(material.pureWhite,'Light neutral canvas/header must be pure white: '+JSON.stringify(material));
 assert.equal(material.dock.position,'fixed');assert(material.dock.left>=6&&material.dock.right>=6,'Dock must float inside viewport');assert(material.dock.bottom>=6&&material.dock.bottom<=16,'Dock must float just above the visible viewport edge: '+material.dock.bottom);assert(material.dock.borderRadius>=20,'Dock lacks capsule geometry');assert(material.dock.luminance!==null&&material.dock.luminance<40,'Dock must be the solid near-black Vision Universe surface');assert(!/^none$/.test(material.dock.boxShadow),'Dock needs depth');assert(material.active.luminance!==null&&material.active.luminance>80,'Active state must use the Discover signal lime');

 /* Konzept „Reihe für Reihe“ (n-home): Billboard, Markt-Zeile, Top 10, dann die Schienen in fester Reihenfolge; nur Weiss, Schwarz, Neongruen und Graustufen (kein Rot, kein Gruen). */
 await page.waitForFunction(()=>document.querySelector('.dr-sec--top10 .dr-poster'),null,{timeout:15000}).catch(()=>{});
 const top=await page.evaluate(()=>Array.from(document.querySelectorAll('.v2-journey > section')).slice(0,3).map(n=>n.classList.contains('dr-bb')?'billboard':n.classList.contains('dr-sec--markt')?'markt':n.classList.contains('dr-sec--top10')?'top10':n.className));
 assert.deepEqual(top,['billboard','markt','top10'],'n-home: oben fest Billboard, Markt, Top 10: '+top.join(' | '));
 const order=await page.locator('.v2-journey > section .dr-head h2').allTextContents();
 const expected=['Top 10 heute','Neue Jahreshochs','Themenwelten','Comeback?','Langfristige Compounder','Kennt kaum jemand','Bekannte Namen in Bewegung','Strategien','Gerade in Bewegung'];
 assert.deepEqual(order.filter(t=>expected.includes(t)),expected.filter(t=>order.includes(t)),'n-home section order: '+order.join(' | '));
 for(const must of ['Top 10 heute','Themenwelten','Strategien'])assert(order.includes(must),'n-home without '+must+': '+order.join(' | '));
 assert(order.length<=14,'At most 14 rows on the home page: '+order.length);
 const palette=await page.evaluate(()=>{const rgb=v=>(v.match(/[\d.]+/g)||[]).slice(0,3).map(Number),hue=c=>{const [r,g,b]=c,mx=Math.max(r,g,b),mn=Math.min(r,g,b);return mx-mn;};
  const lime=c=>c[0]===200&&c[1]===245&&c[2]===49,grey=c=>hue(c)<=8;
  return Array.from(document.querySelectorAll('.v2-journey .vu-chg')).map(n=>rgb(getComputedStyle(n).backgroundColor)).filter(c=>!(lime(c)||grey(c)));});
 assert.deepEqual(palette,[],'Price pills must be lime or ink, never red/green: '+JSON.stringify(palette));
 for(const sel of ['.dr-sec--markt','.dr-sec--top10','.dr-sec--strat','.dv3-swipecard']){const n=page.locator(sel).first();if(await n.count()){await n.scrollIntoViewIfNeeded();await screenshot(page,key+'-home'+sel.replace(/[^a-z]+/g,'-'));}}
 designEvidence.push({key,type:'d01-order',order});
}
// Bekannte, unveraenderte Datenfehler (known-defects.json): ausserhalb von try, weil der Bericht nach dem Lauf sie zusammenfasst.
const known=createRecorder(activeDefects());
try{
await check('Discover views draw price lines with the one chart (C06)',async()=>{const source=await readFile(new URL('../../discover/ui/v3.js',import.meta.url),'utf8');assert(source.includes('VUChart.sparkline'),'D01-D08 must draw price lines with assets/vu-chart.js');assert(!/#(?:e4382f|d93a30|5cc850|1e8433)/i.test(source),'Red/green colours are not part of the redesign');});
for(const width of (engine==='webkit'?[390]:[320,390,1440]))for(const colorScheme of (engine==='webkit'?['dark']:['light','dark'])){
 const ctx=await browser.newContext({viewport:{width,height:width<500?844:900},colorScheme,hasTouch:width<500,isMobile:width<500,deviceScaleFactor:1});
 await ctx.addInitScript(()=>{window.__dv2Vitals={cls:0,longTasks:0,longTaskMs:0,shiftSources:[]};try{new PerformanceObserver(list=>list.getEntries().forEach(e=>{if(!e.hadRecentInput){window.__dv2Vitals.cls+=e.value;window.__dv2Vitals.shiftSources.push({value:e.value,sources:(e.sources||[]).map(s=>({node:s.node?.className||s.node?.tagName,previousRect:s.previousRect,currentRect:s.currentRect}))});}})).observe({type:'layout-shift',buffered:true});new PerformanceObserver(list=>list.getEntries().forEach(e=>{window.__dv2Vitals.longTasks++;window.__dv2Vitals.longTaskMs+=e.duration;})).observe({type:'longtask',buffered:true});}catch{}});
 const page=await ctx.newPage();const key=width+'-'+colorScheme+(engine==='webkit'?'-webkit':'');
 page.on('pageerror',e=>errors.push({key,message:e.message}));
 const bad=[];page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)bad.push({status:r.status(),url:r.url()});});
 const entryStarted=Date.now();await navigate(page,base+'/discover/',{waitUntil:'domcontentloaded'});await page.locator('.v2-hero-track [data-symbol]').first().waitFor({state:'visible'});
 // Measure the cold Home entry before unrelated settings, theme and reload checks.
 await check(key+' five-second entry heuristic',async()=>{const text=await page.locator('body').innerText();assert(/Aktien/.test(text)&&/Was bewegt\s+die Börse heute\?/.test(text),'Entry does not explain the purpose');const viewport=page.viewportSize();const targets=[['purpose',page.locator('h1')],['search',page.locator('.v2-search-prompt')],['genre chips',page.locator('.dr-genres button').first()]];const bounds=[];for(const [label,target] of targets){const box=await target.boundingBox();assert(box&&box.width>0&&box.height>0,label+' missing');assert(box.x>=0&&box.y>=70&&box.x+box.width<=viewport.width+1&&box.y+box.height<=viewport.height-75,label+' outside unobstructed first viewport');bounds.push({label,...box});}const milliseconds=Date.now()-entryStarted;firstScreenEvidence.push({key,milliseconds,bounds});assert(milliseconds<=5000,'First-screen content took '+milliseconds+' ms locally');});
 await check(key+' fresh visit starts light regardless of device scheme',async()=>{
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  assert.equal(await page.locator('html').getAttribute('data-theme-mode'),'light');
  assert.equal(await page.locator('vu-navigation').getAttribute('theme'),'light');
  assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'),'#ffffff');
 });
 if(width===390)await check(key+' dark setting is explicit and persists',async()=>{
  await navigate(page,base+'/discover/#/settings',{waitUntil:'domcontentloaded'});
  const choices=page.locator('.v2-settings-choices button');await choices.first().waitFor();
  assert.deepEqual(await choices.allTextContents(),['Hell','Dunkel']);
  await choices.getByText('Dunkel').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  await page.reload({waitUntil:'domcontentloaded'});
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  await page.locator('.v2-settings-choices button').getByText('Hell').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  await navigate(page,base+'/discover/',{waitUntil:'domcontentloaded'});
  await page.locator('.v2-hero-track [data-symbol]').first().waitFor({state:'visible'});
 });
 await check(key+' canonical page is indexable',async()=>{const robots=page.locator('meta[name=robots]');assert(!(await robots.count())||!(await robots.getAttribute('content')).includes('noindex'),'canonical /discover/ must not be noindex');});
 await check(key+' main visible',async()=>assert(await page.locator('main').isVisible()));
 await check(key+' no horizontal page overflow',async()=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)));
 await check(key+' stock discovery links',async()=>assert(await page.locator('main a[href*="/s/"]').count()>=4));
 await check(key+' visible controls named',async()=>{const missing=await page.locator('main button').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length&&!((n.getAttribute('aria-label')||n.textContent||'').trim())).map(n=>n.outerHTML));assert.deepEqual(missing,[]);});
 await check(key+' document structure',async()=>{assert.equal(await page.locator('main').count(),1);assert.equal(await page.locator('h1').count(),1);assert.equal(await page.locator('html').getAttribute('lang'),'de');});
 await page.waitForLoadState('networkidle');
 performance.push({view:'home',key,...await page.evaluate(()=>({resources:performance.getEntriesByType('resource').map(r=>({url:r.name,bytes:r.decodedBodySize,duration:r.duration})),navigation:performance.getEntriesByType('navigation').map(r=>({domContentLoaded:r.domContentLoadedEventEnd,load:r.loadEventEnd})),domNodes:document.querySelectorAll('*').length}))});
 // Discovery 2.1 redesign: +themes.js (Katalog der 40 Themenwelten) and the compact tile layer.
 await check(key+' incremental view resource budget',async()=>{const resources=performance.at(-1).resources.filter(r=>/^\/discover\/(app|home|detail|themes)\.(js|css)$/.test(new URL(r.url).pathname));assert(resources.reduce((n,r)=>n+r.bytes,0)<=180000,'New view scripts/styles exceed 180 KB decoded');assert(resources.length<=12,'New view adds more than 12 requests');});
 await check(key+' stable first render performance',async()=>{const metrics=await page.evaluate(()=>({...window.__dv2Vitals,domNodes:document.querySelectorAll('*').length}));performance.at(-1).vitals=metrics;assert(metrics.cls<=.15,'Cumulative layout shift exceeds 0.15: '+metrics.cls);assert(metrics.domNodes<=3000,'Initial home DOM is too large: '+metrics.domNodes);assert(metrics.longTaskMs<=1800,'First render accumulated excessive long tasks: '+metrics.longTaskMs);});
 await check(key+' home accessibility',()=>a11y(page,key+'-home'));
 await check(key+' shared menu separates Discover from platform products',async()=>{
  const nav=page.locator('vu-navigation');
  // Menue (Mockup N3): Raster der Produkte, darunter die Unterseiten der aktuellen Welt.
  const destinations=await nav.locator('.here-links a').evaluateAll(nodes=>nodes.map(n=>({label:n.textContent.trim(),href:n.getAttribute('href')})));
  assert.deepEqual(destinations.map(x=>x.label),['Übersicht','Welten','Strategien','Entdecken','Suchen','Märkte','Watchlist']);
  assert.deepEqual(destinations.map(x=>x.href),['/discover/#/','/discover/#/welten','/discover/#/strategien','/discover/#/einzeln/US_REAL','/discover/#/suche','/discover/#/maerkte','/discover/#/watchlist']);
  assert.equal(await nav.locator('.tile[data-group="discover"]').getAttribute('href'),'/discover/#/');
  assert.equal(await nav.locator('a[href="/discover-v2/"]').count(),0);
  /* Gemeinsame Shell (Redesign C01): links die Welt (Discover), rechts Suche, AI Atlas und Mein Bereich; das
     globale Menue oeffnet ☰ rechts in der Produkt-Leiste (#vu-dock). */
  const header=await nav.evaluate(n=>{const root=n.shadowRoot,world=root.querySelector('.world'),w=world.getBoundingClientRect(),atlas=root.querySelector('.atlas').getBoundingClientRect();return {viewport:innerWidth,world:w.toJSON(),worldName:world.textContent.trim(),worldHidden:world.hidden,atlas:atlas.toJSON(),toggle:getComputedStyle(root.querySelector('.toggle')).display};});
  assert(!header.worldHidden&&header.worldName==='Discover','Header does not show the Discover world: '+JSON.stringify(header));
  assert(header.world.left>=0&&header.atlas.right<=header.viewport&&header.atlas.left>=header.world.right,'Header overflows: '+JSON.stringify(header));
  assert.equal(header.toggle,'none','Redundant header menu button on a page with product dock');
  const menu=page.locator('#vu-dock button.menu');
  await menu.click();
  try{
   await page.waitForFunction(()=>{const p=document.querySelector('vu-navigation').shadowRoot.querySelector('.panel').getBoundingClientRect();return p.left>=-1&&p.right<=innerWidth+1;},null,{timeout:3000});
   const panel=await nav.evaluate(n=>{const root=n.shadowRoot,p=root.querySelector('.panel').getBoundingClientRect();return {left:p.left,right:p.right,columns:getComputedStyle(root.querySelector('.here-links')).gridTemplateColumns.split(' ').length,locked:document.documentElement.classList.contains('vu-menu-open'),dockInert:document.getElementById('vu-dock').inert};});
   assert(panel.columns===1,'Mobile menu uses columns: '+JSON.stringify(panel));
   assert(panel.locked&&panel.dockInert,'Menu must lock page scroll and take the dock out of focus order: '+JSON.stringify(panel));
   await page.keyboard.press('Escape');
   await page.waitForFunction(()=>!document.querySelector('vu-navigation').hasAttribute('open'),null,{timeout:3000});
   assert(await menu.evaluate(n=>n.getRootNode().activeElement===n),'Focus must return to the dock menu button');
  }finally{await nav.evaluate(n=>{if(n.hasAttribute('open'))n.shadowRoot.querySelector('.close').click();});}
 });
 if(engine==='chromium'&&width===390&&colorScheme==='light')await check('platform home mobile menu stays in viewport',async()=>{
  const home=await ctx.newPage();
  try{
   await home.goto(base+'/',{waitUntil:'domcontentloaded'});
   /* Seit 06.10.2026 traegt die Startseite ihren eigenen Landingpage-Kopf
      (<meta name="vu-navigation" content="none">) statt der Plattform-Navigation. */
   assert.equal(await home.locator('vu-navigation').count(),0,'Landing page must not stack the platform header on its own');
   /* Redesign 2027 (E01): Kopf header.hd mit .hd-logo; bis dahin #lp-head mit .lp-logo. */
   const bounds=await home.locator('#lp-head, header.hd').first().evaluate(n=>{const logo=n.querySelector('.lp-logo, .hd-logo').getBoundingClientRect();return {viewport:innerWidth,logo:logo.toJSON(),overflow:document.documentElement.scrollWidth-innerWidth};});
   assert(bounds.logo.left>=0&&bounds.logo.right<=bounds.viewport&&bounds.overflow<=1,'Landing header overflows: '+JSON.stringify(bounds));
  }finally{await home.close();}
 });
 await screenshot(page,key+'-home');
 await check(key+' hero horizontal exploration',async()=>{
  const track=page.locator('.v2-hero-track');assert(await track.locator('[data-symbol]').count()>=2,'Hero needs another canonical stock');
  // Discovery 2.1: the hero image sits above the rail, so the rail may start below the first mobile viewport.
  await track.scrollIntoViewIfNeeded();
  const evidence=()=>track.evaluate(n=>{const b=n.getBoundingClientRect();return {scrollLeft:n.scrollLeft,clientWidth:n.clientWidth,cards:Array.from(n.querySelectorAll('[data-symbol]')).map(c=>{const r=c.getBoundingClientRect();return {symbol:c.dataset.symbol,visibleWidth:Math.max(0,Math.min(r.right,b.right)-Math.max(r.left,b.left))};}).sort((a,b)=>b.visibleWidth-a.visibleWidth)};});
  const before=await evidence();
  const needsScroll=await track.evaluate(n=>n.scrollWidth>n.clientWidth+1);
  if(!needsScroll){assert(before.cards.slice(0,4).every(c=>c.visibleWidth>0),'Desktop rail must show further Discover stocks');}
  else if(width<500&&engine==='chromium'){
   const box=await track.boundingBox();const y=Math.min(box.y+box.height*.55,page.viewportSize().height-140);const start=box.x+box.width*.85,end=box.x+box.width*.15;
   const touch=await ctx.newCDPSession(page);await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start,y}]});
   for(let step=1;step<=10;step++)await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start+(end-start)*step/10,y}]});
   await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await touch.detach();
  }else await track.evaluate(n=>{const cards=n.querySelectorAll('[data-symbol]');n.scrollTo({left:cards[1].offsetLeft-cards[0].offsetLeft,behavior:'instant'});});
  if(needsScroll){await page.waitForFunction(symbol=>{const n=document.querySelector('.v2-hero-track'),b=n.getBoundingClientRect();return Array.from(n.querySelectorAll('[data-symbol]')).map(c=>{const r=c.getBoundingClientRect();return {symbol:c.dataset.symbol,visible:Math.max(0,Math.min(r.right,b.right)-Math.max(r.left,b.left))};}).sort((a,b)=>b.visible-a.visible)[0]?.symbol!==symbol;},before.cards[0].symbol);
   const after=await evidence();assert(after.scrollLeft>before.scrollLeft,'Hero did not scroll horizontally');assert.notEqual(after.cards[0].symbol,before.cards[0].symbol,'Hero visible company did not change');interactionEvidence.push({key,type:'hero-swipe',input:width<500&&engine==='chromium'?'native-touch':'native-scroll',before,after});}
  await screenshot(page,key+'-hero-next');
 });
 await page.evaluate(()=>scrollTo(0,innerHeight));await screenshot(page,key+'-discovery');
 await check(key+' responsive navigation remains reachable',async()=>{
  const nav=page.locator('#vu-dock nav');const state=await nav.evaluate(n=>({box:n.getBoundingClientRect().toJSON(),position:getComputedStyle(n.getRootNode().host).position,paddingBottom:parseFloat(getComputedStyle(n).paddingBottom),height:innerHeight,labels:Array.from(n.querySelectorAll('a,button')).map(a=>({label:a.textContent.trim(),width:a.getBoundingClientRect().width,height:a.getBoundingClientRect().height,current:a.getAttribute('aria-current')}))}));
  assert.deepEqual(state.labels.map(i=>i.label),['Discover','Welten','Strategien','Swipen','Menü']);assert(state.labels.some(i=>i.current==='page'),'Current route not identified');
  assert.equal(state.position,'fixed');const gap=state.height-state.box.bottom;assert(gap>=6&&gap<=24,'Product dock must float just above the viewport edge: '+gap);assert(state.labels.every(i=>i.width>=44&&i.height>=44),'Dock targets smaller than 44px');assert(state.paddingBottom>=0);
  if(width>=500)assert(state.box.width<=760,'Desktop dock must not stretch across the viewport: '+state.box.width);interactionEvidence.push({key,type:'responsive-navigation',...state});
 });
 if(engine==='chromium'&&width===390&&colorScheme==='light'){
  await check(key+' premium mobile material and diversity',()=>premiumMobileAudit(page,key));
  await check(key+' themes and strategies stay separate',async()=>{
    /* Redesign D02: Bereich-Filter, Bildkarten fuer die ersten Themen je Bereich, der Rest als Zeilen - alle 54 erreichbar. */
    await navigate(page,base+'/discover/#/welten',{waitUntil:'networkidle'});
    const themes=page.locator('.dv3-welten [data-theme]');
    assert(await themes.count()>=40,'All Themenwelten must be listed');
    assert.equal(await page.locator('.dv3-srow').count(),0,'Strategies must not appear in Welten');
    await screenshot(page,key+'-worlds');
    await page.locator('.dv3-chips button[data-g="e"]').click();
    const filtered=await page.locator('.dv3-welten [data-theme]').evaluateAll(nodes=>nodes.map(n=>n.dataset.group));
    assert(filtered.length>0&&filtered.every(g=>g==='e'),'Area filter must show only its themes: '+filtered.join(','));
    await screenshot(page,key+'-worlds-filter');
    /* D04: vier Gruppen, je Auswahl eine Zeile mit Trefferzahl. */
    await navigate(page,base+'/discover/#/strategien',{waitUntil:'networkidle'});
    const strategies=page.locator('.v2-main .dv3-srow');
    assert(await strategies.count()>=19,'Canonical Discover strategies must be listed');
    assert.equal(await page.locator('.dv3-sgroup').count(),4,'Strategies come in four groups');
    for(const rowId of ['sp500-staerkste','djia-staerkste','ndx-staerkste','qualitaet-zum-preis','qualitaet-wachstum'])assert.equal(await page.locator('.dv3-srow[data-row="'+rowId+'"]').count(),1,'Strategy missing: '+rowId);
    assert(/Treffer/.test(await strategies.first().innerText()),'Strategy row needs its match count');
    assert.equal(await page.locator('.dv3-welten').count(),0,'Themes must not appear in Strategien');
    assert.equal(await page.locator('#vu-dock a[aria-current=page]').innerText(),'Strategien');
    const first=await strategies.first().boundingBox();assert(first&&first.width<=page.viewportSize().width,'Strategy row overflows mobile viewport');
    await screenshot(page,key+'-strategies');
    const href=await strategies.first().getAttribute('href');
    /* Konzept „Reihe für Reihe“ (n-row): #/strategien/<reihe> fuehrt auf die Seite der Reihe #/c/US_REAL/<reihe>. */
    await navigate(page,base+'/discover/'+href,{waitUntil:'networkidle'});
    await page.waitForURL(url=>/^#\/c\/US_REAL\/[a-z0-9-]+$/.test(new URL(url).hash));
    await page.locator('.dr-rowhero h1').waitFor({state:'visible'});
    assert.equal(await page.locator('.dr-rowhero').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(0, 0, 0)','Row head is dark');
    assert(await page.locator('.dr-rule .dr-rule__i').count()>=1,'Row page explains its rule');
    assert.equal(await page.locator('.dr-rowhero a[href^="#/swipen?reihe="]').count(),1,'Row swipe entry');
    const stock=page.locator('.dr-rks a[href*="/s/"]').first();await stock.waitFor({state:'visible'});
    assert(await page.locator('.dr-rks .dr-rk').count()>=5,'Row ranking');
    await screenshot(page,key+'-strategy-stocks');
    /* n-row-swipe: Swipen nur mit den Aktien dieser Reihe, Fortschritt „1 von N“. */
    await navigate(page,base+'/discover/'+(await page.locator('.dr-rowhero a[href^="#/swipen?reihe="]').getAttribute('href')),{waitUntil:'networkidle'});
    await page.locator('.dr-rsw__card[data-symbol]').waitFor({state:'visible'});
    const pos=await page.locator('.dr-rsw__pos').innerText();assert(/^\d+ von \d+$/.test(pos),'Row swipe progress: '+pos);
    const firstSwipe=await page.locator('.dr-rsw__card').getAttribute('data-symbol');await page.locator('.dr-rsw__b[data-a="skip"]').click();
    await page.waitForFunction(s=>document.querySelector('.dr-rsw__card')?.dataset.symbol!==s,firstSwipe);
    await screenshot(page,key+'-row-swipe');
    /* n-all: alle Reihen nach Genre, mit Trefferzahl. */
    await navigate(page,base+'/discover/#/reihen',{waitUntil:'networkidle'});
    assert(await page.locator('.dr-all .dr-all__r').count()>=19,'All rows listed');
    assert.deepEqual((await page.locator('.dr-all__g h2').allTextContents()).slice(0,4),['Kursbewegung','Unternehmen','Indizes','Entdecken']);
    await screenshot(page,key+'-all-rows');
    /* Alte Sammlungsadresse leitet weiter (Thema bzw. Strategie). */
    await navigate(page,base+'/discover/#/c/US_REAL/thema-ki',{waitUntil:'networkidle'});
    await page.waitForURL(url=>new URL(url).hash==='#/thema/kuenstliche-intelligenz');
    await page.locator('.dv3-firms a[href*="/s/"]').first().waitFor({state:'visible'});
    await screenshot(page,key+'-theme');
    await navigate(page,base+'/discover/',{waitUntil:'domcontentloaded'});
    await page.locator('.v2-hero-track [data-symbol]').first().waitFor();
  });
  await check(key+' home freshness contract is visible',async()=>{/* Redesign D01: Schluss-Datum im Kopf statt Etikett je Karte. */await page.locator('.dv3-asof').waitFor();await page.waitForFunction(()=>/Schluss \S+ \d{2}\.\d{2}\./.test(document.querySelector('.dv3-asof')?.textContent||''),null,{timeout:10000});});
 }
 await check(key+' search opens traps focus and restores it',async()=>{const opener=page.locator('.v2-search-prompt:visible').first();await opener.click();const input=page.locator('input[type=search]').first();await input.waitFor({state:'visible'});await input.fill('AAPL');await page.waitForFunction(()=>Array.from(document.querySelectorAll('.dx-search .dx-result')).some(n=>/Apple|AAPL/.test(n.textContent)));for(let i=0;i<12;i++){await page.keyboard.press(i<6?'Tab':'Shift+Tab');assert(await page.locator('.dx-search').evaluate(n=>n.contains(document.activeElement)),'Focus escaped search');}await screenshot(page,key+'-search');if(width===390)await check(key+' search accessibility',()=>a11y(page,key+'-search'));await page.keyboard.press('Escape');await input.waitFor({state:'hidden'});assert(await opener.evaluate(n=>n===document.activeElement),'Search opener focus not restored');});
 await navigate(page,base+'/discover/#/s/US_REAL/AAPL',{waitUntil:'networkidle'});await page.waitForTimeout(1000);
 await check(key+' stock identity and chart',async()=>{assert(/Apple|AAPL/.test(await page.locator('main').innerText()));assert(await page.locator('main svg').count()>0,'No visual chart');});
 await check(key+' stock overflow',async()=>{const overflow=await page.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:innerWidth,culprits:Array.from(document.querySelectorAll('main *')).map(n=>({node:n.className||n.tagName,right:n.getBoundingClientRect().right,left:n.getBoundingClientRect().left})).filter(x=>x.right>innerWidth+1||x.left<-1).slice(0,20)}));assert(overflow.page<=overflow.viewport+1,'Stock page overflows: '+JSON.stringify(overflow));});
 await screenshot(page,key+'-stock');
 await check(key+' dominant consumer chart and semantic colour',async()=>{const evidence=await page.evaluate(()=>{const svg=document.querySelector('.dx-chapter--chart svg.dx-range-chart,.dx-chapter--chart svg.dx-micro--intraday'),chapter=document.querySelector('.dx-chapter--chart'),direction=svg&&svg.getAttribute('data-direction'),color=svg&&getComputedStyle(svg).color;return {svg:svg&&svg.getBoundingClientRect().toJSON(),chapter:chapter&&chapter.getBoundingClientRect().toJSON(),viewport:{width:innerWidth,height:innerHeight},direction,color};});assert(evidence.svg,'Stock page has no primary price chart');assert(evidence.svg.width>=Math.min(330,evidence.viewport.width*.84),'Primary chart is too narrow');if(width<500)assert(evidence.svg.height>=180,'Primary mobile chart is too small: '+evidence.svg.height);/* Redesign C06: die Linie traegt die Schriftfarbe (Schwarz hell, Weiss dunkel), nie Rot oder Gruen; die Richtung steht in data-direction und in der Kursbewegung. */assert(['up','down','flat'].includes(evidence.direction),'Chart without direction: '+evidence.direction);{const c=(evidence.color.match(/[\d.]+/g)||[]).map(Number);assert(Math.max(...c.slice(0,3))-Math.min(...c.slice(0,3))<=8,'Chart line is coloured instead of ink: '+evidence.color);}designEvidence.push({key,type:'stock-chart',...evidence});});
 await check(key+' chart price and source visible early',async()=>{const hero=page.locator('.dx-chart-hero').first();const bounds=await hero.boundingBox();assert(bounds,'Missing chart price hero');if(width<500)assert(bounds.y<=420,'Mobile chart price starts below 420px: '+bounds.y);const text=await hero.innerText();assert(/\d/.test(text)&&/Kurs|Schluss|Stand|Heute|Handelstag/i.test(text),'Missing source/session evidence: '+text);interactionEvidence.push({key,type:'chart-hero',bounds,text});});
 await check(key+' unavailable chart ranges disabled',async()=>{const wrong=await page.locator('.dx-tf button').evaluateAll(nodes=>nodes.filter(n=>n.getAttribute('aria-disabled')==='true'&&!n.disabled).map(n=>n.textContent));assert.deepEqual(wrong,[]);assert(await page.locator('.dx-tf button').count()>0);});
 await check(key+' chart range updates evidence',async()=>{const samples=[];for(const [label,range,word] of [['1M','1M','Monat'],['1J','1Y','Jahr']]){const button=page.locator('.dx-tf').getByRole('button',{name:label,exact:true});assert(await button.isEnabled(),'AAPL range unavailable: '+label);await button.click();await page.locator('.dx-range-chart-wrap[data-range="'+range+'"]').waitFor();assert.equal(await button.getAttribute('aria-pressed'),'true');/* Überblick (a-top, Kopf C04): der Kopf zeigt die Tagesbewegung; den Zeitraum nennen Datumsachse und der Kopf für Bildschirmleser. */const c04=await page.locator('.dx-chart-hero--c04').count();await page.waitForFunction(([w,c])=>(c?(document.querySelector('.dx-chart-hero-span')?.textContent||''):(document.querySelector('.dx-chart-hero')?.innerText||'')).includes(w),[word,c04],{timeout:5000}).catch(()=>{});const evidence=c04?(await page.locator('.dx-chart-hero-span').textContent())+' | '+(await page.locator('.dx-range-chart .dx-range-date').allTextContents()).join(' – '):await page.locator('.dx-chart-hero').innerText();assert(evidence.includes(word),'Range context missing: '+evidence);if(c04)assert.equal(await page.locator('.dx-range-chart .dx-range-date').count(),2,'C04 chart: start and end date');samples.push({label,evidence});}assert.notEqual(samples[0].evidence,samples[1].evidence,'Range data did not update');interactionEvidence.push({key,type:'chart-range',samples});});
 await check(key+' stock accessibility',()=>a11y(page,key+'-stock'));
 await check(key+' fundamental metric and year selection update visual evidence',async()=>{/* D09: die Kennzahlen-Reise steht unter „Alle Kennzahlen PRO“ (zugeklappt). */await page.evaluate(()=>{const j=document.querySelector('#journey'),d=j&&j.closest('details');if(d)d.open=true;});const journey=page.locator('#journey');await journey.scrollIntoViewIfNeeded();const tabs=journey.getByRole('tab');assert(await tabs.count()>=2,'AAPL needs multiple canonical metrics');const first=await journey.locator('.dx-journey-kopf').innerText();const svgBefore=await journey.locator('.dx-journey-bild').innerHTML();await tabs.nth(1).click();assert.equal(await tabs.nth(1).getAttribute('aria-selected'),'true');assert.equal(await tabs.nth(0).getAttribute('aria-selected'),'false');const second=await journey.locator('.dx-journey-kopf').innerText();assert(first!==second&&svgBefore!==await journey.locator('.dx-journey-bild').innerHTML(),'Fundamental visual did not change');const bars=journey.locator('.dx-journey-bar');assert(await bars.count()>=3,'Fundamental chart needs selectable fiscal years');assert.equal(await journey.locator('.dx-journey-wert').count(),0,'Loose values must not cover the chart');const target=bars.nth(1);const title=await target.locator('title').textContent();await target.click();assert.equal(await target.getAttribute('aria-pressed'),'true');assert(await target.evaluate(n=>n.classList.contains('is-selected')),'Selected fiscal year is not visually active');const active=await journey.locator('.dx-journey-nach').innerText();const match=title&&title.match(/^GJ\s+([^:]+):\s*(.+)$/);assert(match&&active.includes(match[1])&&active.includes(match[2]),'Selected fiscal year and value did not move to the chart header');interactionEvidence.push({key,type:'fundamental-metric-year',metric:await tabs.nth(1).innerText(),before:first,after:second,selected:title,active});await journey.evaluate(n=>n.scrollIntoView({block:'start',behavior:'instant'}));await screenshot(page,key+'-fundamentals');});
 await check(key+' valuation is a distinct canonical metric module',async()=>{if(await page.locator('.dv3-overview').count()){/* a-chapter: „Ist … teuer?“ ist Kapitel 5 und zugeklappt; der Inhalt steht unverändert darin. */await page.evaluate(()=>{const d=document.querySelector('.dv3-ep[data-ch="teuer"]');if(d)d.open=true;});/* Redesign 2027 (D09): „Ist <Firma> teuer?“ mit KGV gegen den Markt und vier Kacheln; die vollständige Bewertung steht unter „Alle Kennzahlen“. */const v3=page.locator('.dv3-overview .dv2-stock-valuation');assert.equal(await v3.count(),1,'D09 valuation section missing');assert(/teuer\?$/.test((await v3.locator('h2').first().innerText()).trim()),'D09 valuation title');const tiles=await v3.locator('.dv2-valuation-components .vu-tile__label').allTextContents();for(const t of ['Börsenwert','Kurs-Umsatz (KUV)','Gewinnrendite','Free-Cashflow-Rendite'])assert(tiles.includes(t),'D09 tile missing: '+t+' in '+tiles.join(', '));await v3.evaluate(n=>n.scrollIntoView({block:'start',behavior:'instant'}));await screenshot(page,key+'-valuation');return;}const section=page.locator('.dv2-stock-valuation');assert.equal((await section.locator('h2').first().innerText()).toLocaleLowerCase('de-DE'),'bewertung');const block=section.locator('.dv2-valuation-components');assert(await block.count()===1,'Valuation building-block module missing');const labels=await block.locator('.dv2-valuation-card span').allTextContents();assert(labels.length>=7&&labels.includes('KGV')&&labels.includes('KUV')&&labels.includes('Gewinnrendite')&&labels.includes('KGV / Markt')&&labels.includes('Free-Cashflow-Rendite'),'Expected AAPL valuation components missing: '+labels.join(', '));await section.evaluate(n=>n.scrollIntoView({block:'start',behavior:'instant'}));await screenshot(page,key+'-valuation');});
 await check(key+' stock offers onward company exploration',async()=>{
  const v3=await page.locator('.dv3-overview').count();
  /* Konzept „Reihe für Reihe“ (a-full): die nächsten Aktien stehen als Poster in „Mehr wie …“. */const next=page.locator(v3?'.dv3-overview .dv3-next a.dr-poster__a[href^="#/s/"]':'.dv2-stock-neighbors .dx-rail a[href^="#/s/"]').first();await next.scrollIntoViewIfNeeded();
  const href=await next.getAttribute('href');assert(href&&!href.endsWith('/AAPL'),'Next stock must differ from current stock');await screenshot(page,key+'-stock-onward');await next.click();await page.waitForURL(url=>url.hash===href);await page.locator('.dx-chart-hero').first().waitFor();
  /* Redesign 2027: zurück zum Entdecken über die Produkt-Leiste (Swipen), nicht über Knöpfe am Seitenende. */
  if(v3)assert(await page.waitForFunction(()=>!!document.getElementById('vu-dock')?.shadowRoot?.querySelector('a[href*="#/einzeln/"]'),null,{timeout:10000}).then(()=>true,()=>false),'Next stock has no return to discovery (dock)');
  else assert(await page.locator('.dv2-stock-next a[href^="#/einzeln/"]').first().waitFor({state:'attached',timeout:10000}).then(()=>true,()=>false),'Next stock has no return to discovery');interactionEvidence.push({key,type:'stock-onward',from:'AAPL',to:href});
 });
 if(width===390)await check(key+' stock title page: story, closed chapters, rows, onward only from a row',async()=>{
  /* Konzept „Reihe für Reihe“ (AX03/AX04): Story in drei Sätzen, 7 Kapitel zu, Reihen der Aktie, „Mehr wie …“; Leiste und Endkarte nur mit ?reihe=. */
  /* Frühere Prüfungen öffnen Kapitel 5; die Seite merkt sich das auf dem Gerät. Für „standardmäßig zu“ ohne Gedächtnis laden. */
  await page.evaluate(()=>{try{localStorage.removeItem('vu-discover-chapters-v1');}catch(e){}});
  await navigate(page,base+'/discover/#/s/US_REAL/NVDA',{waitUntil:'networkidle'});await page.reload({waitUntil:'networkidle'});await page.locator('.dv3-titel .dv3-story').waitFor();
  assert.equal(await page.locator('.dv3-story .dv3-story-r').count(),3,'Story in three sentences');
  const eps=page.locator('.dv3-titel .dv3-ep');assert.equal(await eps.count(),7,'Seven chapters');
  assert.equal(await page.locator('.dv3-titel .dv3-ep[open]').count(),0,'Chapters closed by default');
  assert.equal(await page.locator('.dv3-titel').getByText(/Was dafür spricht|was dagegen|In einem Satz|Auf einen Blick|anderen Welten/).count(),0,'Old blocks are gone');
  assert(await page.locator('#dv3-reihen .dv3-rk2').count()>=1,'Rows of the stock');
  assert.equal(await page.locator('.dv3-rowctx, .dv3-endcard').count(),0,'No onward bar without origin');
  assert(/\$/.test(await page.locator('.dx-chart-hero-preis > b').first().innerText()),'Head price in dollars');
  await eps.nth(2).locator('summary').click();assert.equal(await eps.nth(2).getAttribute('open'),'');await screenshot(page,key+'-stock-chapter');
  await navigate(page,base+'/discover/#/s/US_REAL/NVDA?reihe=langfristige-compounder',{waitUntil:'networkidle'});await page.reload({waitUntil:'networkidle'});
  await page.locator('.dv3-rowctx').waitFor();assert(/\d+ von \d/.test(await page.locator('.dv3-rowctx').innerText()),'Row position');
  await page.locator('.dv3-endcard').scrollIntoViewIfNeeded();await screenshot(page,key+'-stock-from-row');
  const nh=await page.locator('.dv3-endcard .dv3-endcard-a a').first().getAttribute('href');assert(/\?reihe=langfristige-compounder$/.test(nh),'Next keeps the row: '+nh);
  await page.evaluate(()=>{try{localStorage.removeItem('vu-discover-chapters-v1');}catch(e){}});
 });
 if(engine==='chromium'&&width===390&&colorScheme==='light')await check(key+' CrowdStrike business copy and zero-line chart scale',async()=>{
  await navigate(page,base+'/discover/#/s/US_REAL/CRWD',{waitUntil:'networkidle'});/* a-chapter: Kapitel 2 „Was macht …?“ ist zugeklappt, der Text steht unverändert darin. */await page.locator('.dv3-overview').waitFor({timeout:8000}).catch(()=>{});await page.evaluate(()=>{const d=document.querySelector('.dv3-ep[data-ch="firma"]');if(d)d.open=true;});const bizSel=await page.locator('.dv3-overview [data-sec=firma]').waitFor({timeout:8000}).then(()=>'.dv3-overview [data-sec=firma]',()=>'.dv2-stock-business');await page.locator(bizSel).waitFor();
  const copy=await page.locator(bizSel+(bizSel==='.dv2-stock-business'?' .dx-chapter-lead':' .dv3-firma-t')).innerText();assert(/Cloud-Plattform/.test(copy)&&/Sicherheit/.test(copy),'CrowdStrike business description still empty: '+copy);
  const chart=page.locator('.dx-chapter--chart svg.dx-micro--intraday');if(await chart.count()){
   await page.waitForFunction(()=>document.querySelector('.dx-chapter--chart svg.dx-micro--intraday')?.dataset.v2PreviousCloseScale==='true');
   const scale=await chart.evaluate(svg=>{const base=svg.querySelector('.dx-art-base'),view=svg.viewBox.baseVal,basis=svg.__basis;return {mode:svg.dataset.v2PreviousCloseScale,baseY:Number(base?.getAttribute('y1')),top:basis.padTop,bottom:view.height-basis.padBottom,low:Math.min(...svg.__punkte.map(p=>p.close)),previousClose:basis.previousClose};});
   assert.equal(scale.mode,'true');assert(scale.low<scale.previousClose?scale.baseY>scale.top&&scale.baseY<scale.bottom:Math.abs(scale.baseY-scale.bottom)<1,'Previous close baseline must reflect the session range: '+JSON.stringify(scale));
  }
  await page.locator(bizSel).scrollIntoViewIfNeeded();await screenshot(page,key+'-crowdstrike-business');
 });
 /* Redesign D05: #/einzeln/<U> leitet auf #/swipen; eine Karte, drei Gesten (weiter, oeffnen, merken), Merken mit Rueckgaengig. */
 await page.evaluate(()=>{try{localStorage.setItem('vu-discover-swipe-intro-v1','1');}catch(e){}});
 await navigate(page,base+'/discover/#/einzeln/US_REAL',{waitUntil:'networkidle'});
 await check(key+' old feed address forwards to swipen',async()=>{await page.waitForURL(url=>new URL(url).hash==='#/swipen');});
 await check(key+' swipe card shows one stock with sentence and chart',async()=>{
  const card=page.locator('.dv3-card[data-symbol]');await card.waitFor();await waitCounter(page,1);
  assert.equal(await page.locator('.dv3-card[data-symbol]').count(),1,'Exactly one card at a time');
  await card.locator('.dv3-chart svg').waitFor({timeout:15000}).catch(()=>{});assert(await card.locator('.dv3-chart svg').count()===1,'Card chart missing');
  assert((await card.innerText()).length>=80,'Card text too short');
 });
 if(width<500)await check(key+' swipe buttons remain reachable above the dock',async()=>{
  const bounds=await page.evaluate(()=>{const b=document.querySelector('.dv3-swipe__btns').getBoundingClientRect(),dock=document.getElementById('vu-dock').shadowRoot.querySelector('nav').getBoundingClientRect();return {buttons:b.toJSON(),dock:dock.toJSON()};});
  await page.locator('.dv3-swipe__btns').scrollIntoViewIfNeeded();
  const after=await page.evaluate(()=>{const b=document.querySelector('.dv3-swipe__btns').getBoundingClientRect(),dock=document.getElementById('vu-dock').shadowRoot.querySelector('nav').getBoundingClientRect();return b.bottom<=dock.top+1;});
  assert(after,'Swipe buttons hidden behind the dock: '+JSON.stringify(bounds));interactionEvidence.push({key,type:'swipe-button-clearance',...bounds});
 });
 await check(key+' skip shows the next stock',async()=>{
  const before=await visibleFeedStock(page);await page.locator('.dv3-b--skip').click();await waitCounter(page,2);
  await page.waitForFunction(s=>document.querySelector('.dv3-card[data-symbol]')?.dataset.symbol!==s,before.symbol);
  const after=await visibleFeedStock(page);assert.notEqual(after.symbol,before.symbol);interactionEvidence.push({key,type:'swipe-skip',before,after});
 });
 await check(key+' keep saves to the watchlist and can be undone',async()=>{
  const card=await visibleFeedStock(page);await page.locator('.dv3-b--keep').click();
  await page.locator('.dv3-toast').waitFor({state:'visible'});await screenshot(page,key+'-swipe-kept');
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('vu-discover-watchlist-v1')||'[]'));assert(saved.includes(card.symbol),'Kept stock not on watchlist');
  const undo=page.locator('.dv3-toast button');if(await undo.count()){await undo.click();await waitCounter(page,2);const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('vu-discover-watchlist-v1')||'[]'));assert(!after.includes(card.symbol),'Undo did not remove the stock');}
 });
 await check(key+' arrow key and collection filter',async()=>{
  await page.keyboard.press('ArrowLeft');await waitCounter(page,3);
  await page.locator('.dv3-swipe__bar .vu-chip[data-f="bekannt"]').click();await waitCounter(page,1);
  await page.locator('.dv3-swipe__bar .vu-chip[data-f="alle"]').click();await waitCounter(page,3);
 });
 await screenshot(page,key+'-feed');
 if(width===390)await check(key+' feed accessibility',()=>a11y(page,key+'-feed'));
 await check(key+' swipe session resumes',async()=>{
  const saved=await visibleFeedStock(page);
  await navigate(page,base+'/discover/#/',{waitUntil:'domcontentloaded'});await page.locator('.v2-hero-track [data-symbol]').first().waitFor();
  await navigate(page,base+'/discover/#/swipen',{waitUntil:'domcontentloaded'});await page.locator('.dv3-card[data-symbol]').waitFor();
  assert.equal((await visibleFeedStock(page)).symbol,saved.symbol,'Session must resume at the same canonical company');
  await page.locator('.v2-feed-resume').waitFor();await page.locator('.v2-feed-restart').click();await waitCounter(page,1);
 });
 if(engine==='chromium'&&width===390&&colorScheme==='dark')await check(key+' deep session resume loads a bounded canonical suffix',async()=>{
  const feed=await (await page.request.get(base+'/discover/data/feed/US_REAL.json')).json();const position=Math.min(120,feed.order.length-24);
  await page.evaluate(index=>window.VUDiscover.memory.setPosition('feed:US_REAL',index),position);
  const deep=await ctx.newPage(),requests=[];deep.on('pageerror',error=>errors.push({key:key+'-deep-resume',message:error.message}));deep.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/discover/data/stocks/US_REAL/'))requests.push(request.url());});
  try{await deep.goto(base+'/discover/#/swipen',{waitUntil:'networkidle'});await deep.locator('.v2-feed-resume').waitFor();await waitCounter(deep,position+1);
   assert.equal((await visibleFeedStock(deep)).symbol,feed.order[position].s);assert(requests.length<=4,'Deep resume fetched '+requests.length+' stock bundles');
   interactionEvidence.push({key,type:'deep-feed-resume',position,stockRequests:requests.length});await screenshot(deep,key+'-feed-deep-resume');}finally{await deep.close();}
 });
 if(engine==='chromium'&&width===390&&colorScheme==='dark')await check(key+' complete canonical home journey',async()=>{
  /* Konzept „Reihe für Reihe“ (n-home, n-genre): Billboard mit Sheet „Warum?“, Markt-Zeile, Top 10, Schienen, Strategien, Genre-Chips ohne Seitenwechsel, Swipen. */
  await navigate(page,base+'/discover/',{waitUntil:'domcontentloaded'});await page.locator('.v2-hero-track [data-symbol]').first().waitFor();
  assert(await page.locator('.v2-hero-track [data-symbol]').count()>=2,'Heute im Blick needs several stocks');
  assert.equal(await page.locator('.dr-bb').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(0, 0, 0)','Billboard is black in both modes');
  assert.equal(await page.locator('.dr-ms[href="#/maerkte"]').count(),1,'Market strip leads to Märkte');
  await page.locator('.dr-sec--top10 .dr-t10').first().waitFor();assert(await page.locator('.dr-sec--top10 .dr-t10').count()>=5,'Top 10 heute');
  await page.locator('.dr-bb__q').first().click();await page.locator('#dv3-sheet:not([hidden])').waitFor();await screenshot(page,key+'-why-sheet');await page.keyboard.press('Escape');
  await page.locator('.dr-sec--strat').scrollIntoViewIfNeeded();assert(await page.locator('.dr-sec--strat .dr-sk').count()>=3,'Strategy cards');
  await page.locator('.dr-sec[data-row="bekannte-namen"]').scrollIntoViewIfNeeded();await page.locator('.dr-sec[data-row="bekannte-namen"] .dr-poster').first().waitFor({timeout:15000});
  assert.equal(await page.locator('.dv3-swipecard[href="#/swipen"]').count(),1,'Swipe teaser');
  /* n-preview: Halten oder Rechtsklick auf ein Poster zeigt die Vorschau mit den Reihen der Aktie, ohne die Seite zu verlassen. */
  const pvPoster=page.locator('.dr-sec[data-row="new-52-week-highs"] .dr-poster').first();await pvPoster.scrollIntoViewIfNeeded();await pvPoster.waitFor();
  const pvUrl=page.url();await pvPoster.click({button:'right'});await page.locator('.dr-pvsheet:not([hidden])').waitFor();
  await page.waitForFunction(()=>/^Steht heute in \d+ Reihen?$|keiner/.test(document.querySelector('.dr-pv__in')?.textContent||''));
  assert.equal(page.url(),pvUrl,'Preview keeps the page');await screenshot(page,key+'-preview');await page.keyboard.press('Escape');
  assert.equal(await page.locator('.dr-allrows[href="#/reihen"]').count(),1,'All rows entry on the home page');
  /* K1 „Weiterschauen“: eine angesehene Aktie steht danach unter „Zuletzt angesehen“ (nur auf dem Gerät). */
  const seen=await page.locator('.dr-sec--top10 .dr-poster').first().getAttribute('data-symbol');
  await navigate(page,base+'/discover/#/s/US_REAL/'+seen,{waitUntil:'networkidle'});await page.locator('h1').first().waitFor();
  await navigate(page,base+'/discover/',{waitUntil:'domcontentloaded'});await page.locator('.v2-hero-track [data-symbol]').first().waitFor();
  const recent=page.locator('.dr-sec--recent');await recent.scrollIntoViewIfNeeded();
  assert.equal(await recent.locator('.dr-cw[data-symbol="'+seen+'"]').count(),1,'Recently viewed stock on the home page: '+seen);
  await screenshot(page,key+'-recent');
  for(const sel of ['.dr-bb','.dr-sec--themes','.dr-sec[data-row="new-52-week-highs"]','.dr-sec[data-row="bekannte-namen"]']){await page.locator(sel).first().scrollIntoViewIfNeeded();await screenshot(page,key+'-world'+sel.replace(/[^a-z0-9]+/g,'-'));}
  const before=page.url();await page.evaluate(()=>scrollTo(0,0));await page.locator('.dr-genres button[data-genre="unternehmen"]').click();
  await page.locator('.dr-sec[data-row="umsatz-waechst-stark"]').waitFor();assert.equal(await page.locator('.dr-bb').count(),0,'Genre view without billboard');
  assert.equal(await page.locator('.dr-genres button[data-genre="unternehmen"]').getAttribute('aria-pressed'),'true');
  assert(/genre=unternehmen/.test(page.url())&&page.url().split('#')[0]===before.split('#')[0],'Genre filter keeps the page: '+page.url());
  await screenshot(page,key+'-genre-unternehmen');
  await page.locator('.dr-genres button[data-genre="alle"]').click();await page.locator('.v2-hero-track [data-symbol]').first().waitFor();
 });
 await check(key+' no local HTTP errors',async()=>assert.deepEqual(bad,[]));
 await ctx.close();
}
// Direktlinks auf Routen mit nachgeladenen Skriptgruppen: jeder frische Aufruf muss zeichnen (kein "Gerade nicht erreichbar", keine Seitenfehler).
// WebKit zeigte hier einmal ein Zufallsrennen zwischen Parser und Start; deshalb dort 25 frische Aufrufe je Link.
await check('direct links to lazy-loaded routes render on every fresh load',async()=>{
 // Seit der Verschaerfung zaehlt nur eine Route als gerendert, die ihre Inhaltsmerkmale SICHTBAR zeigt (direct-link-lib.mjs):
 // erwarteter h1, Kursblock, gezeichneter Chart, Mindesttext, keine Ladeanzeige. Die Seite durch die Zugangsmaske und
 // unter langsamer Verbindung prueft browser-qa-direct.mjs.
 const loads=engine==='webkit'?25:4,device=engine==='webkit'?playwright.devices['iPhone 13']:{viewport:{width:390,height:844},isMobile:true,hasTouch:true};
 const {defaultBrowserType,...options}=device,failures=[];
 for(const key of ['daten','maerkte','nvda','rheinmetall','einzeln']){
  for(let i=0;i<loads;i++){
   const context=await browser.newContext(options),page=await context.newPage(),pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
   try{
    await navigate(page,base+SPECS[key].path,{waitUntil:'load'});
    const rendered=await waitRendered(page,key,{timeout:30000});
    // Bekannter, unveraenderter Datenfehler (known-defects.json): sichtbar gemeldet, aber nur bei exakter Signatur kein Abbruch.
    if((!rendered.ok||pageErrors.length)&&!known.absorb(key,rendered.problems,pageErrors))failures.push(key+' #'+i+': '+rendered.problems.slice(0,3).join('; ')+' '+pageErrors.slice(0,1).join());
   }catch(e){failures.push(key+' #'+i+': '+e.message.split('\n')[0]);}
   await context.close();
  }
 }
 assert.deepEqual(failures,[]);
});
await check('no uncaught page errors',async()=>assert.deepEqual(errors,[]));
}catch(e){checks.push({name:'browser suite completion',pass:false,error:e.stack||e.message});}finally{await browser.close();}
const report={status:checks.every(x=>x.pass)?'PASS':'FAIL',checks,errors,shots,performance,designEvidence,limitations:['Five-second check is an automated content heuristic, not an independent human usability test.','Premium feel still requires the documented screenshot critique; material and composition checks only provide objective evidence.','A closed-market run cannot prove receipt of a new regular-session realtime tick.','Automated structural checks are not a WCAG certification.','Local resource measurements are not a production latency SLA.']};
report.engine=engine;report.knownDefects=known.summary();known.report('browser-qa '+engine);report.firstScreenEvidence=firstScreenEvidence;report.interactionEvidence=interactionEvidence;report.screenshotEvidence=screenshotEvidence;
await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,totalChecks:checks.length,passed:checks.filter(c=>c.pass).length,failed:checks.filter(c=>!c.pass),screenshots:shots.length,firstScreenMilliseconds:firstScreenEvidence.map(e=>({key:e.key,milliseconds:e.milliseconds})),totalCheckMilliseconds:checks.reduce((n,c)=>n+(c.milliseconds||0),0)},null,2));if(report.status!=='PASS')process.exitCode=1;
await writeFile(out+'/accessibility.json',JSON.stringify(accessibility,null,2));
