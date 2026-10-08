#!/usr/bin/env node
// Real-browser checks; no fixture interception and no simulated market data.
// Browser QA of the one canonical Discover (/discover/, formerly served as /discover-v2/).
// Usage: node scripts/discover/browser-qa.mjs --url http://127.0.0.1:8765 --out /tmp/discover-qa
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
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
async function visibleFeedStock(page){return page.locator('.dx-feed-spur').evaluate(n=>{const b=n.getBoundingClientRect();return Array.from(n.querySelectorAll('.dx-feed-screen[data-symbol]')).map(c=>{const r=c.getBoundingClientRect();return {index:Number(c.dataset.index),symbol:c.dataset.symbol,height:Math.max(0,Math.min(r.bottom,b.bottom)-Math.max(r.top,b.top))};}).sort((a,b)=>b.height-a.height)[0];});}
async function loadCompleteHome(page){
 for(let attempt=0;attempt<8&&await page.locator('.v2-load-more').count();attempt++){
  const before=await page.locator('.v2-journey > [data-surface]').count();
  await page.locator('.v2-load-more').scrollIntoViewIfNeeded();
  await page.waitForFunction(count=>document.querySelectorAll('.v2-journey > [data-surface]').length>count||document.querySelector('.v2-finish'),before);
 }
 assert.equal(await page.locator('.v2-load-more').count(),0,'Discovery journey still has an unloaded chunk');
}
async function premiumMobileAudit(page,key){
 await loadCompleteHome(page);
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

 const surfaces=page.locator('.v2-journey > [data-surface]');
 const intensity=await surfaces.evaluateAll(nodes=>nodes.map((node,index)=>{let owner=node,s=getComputedStyle(owner),raw=s.backgroundColor,m=(raw.match(/[\d.]+/g)||[]).map(Number);while(owner.parentElement&&(raw==='transparent'||(m.length>3&&m[3]===0))){owner=owner.parentElement;s=getComputedStyle(owner);raw=s.backgroundColor;m=(raw.match(/[\d.]+/g)||[]).map(Number);}m=m.slice(0,3);const max=Math.max(...m),min=Math.min(...m),lum=m.length===3?(m[0]+m[1]+m[2])/3:null;return {index,id:node.dataset.surface,archetype:node.dataset.archetype||'',background:raw,lum,saturation:m.length===3?max-min:0};}));
 const pick={white:intensity.find(x=>x.lum!==null&&x.lum>245),color:intensity.find(x=>x.saturation>55&&x.lum>45),cinema:intensity.find(x=>x.lum!==null&&x.lum<55)};
 for(const [tone,entry] of Object.entries(pick)){assert(entry,'Missing '+tone+' surface for three-intensity rhythm');const target=surfaces.nth(entry.index);await target.evaluate(n=>n.scrollIntoView({block:'center',behavior:'instant'}));await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await screenshot(page,key+'-dock-over-'+tone);}

 const rhythm=[];const maxY=await surfaces.last().evaluate(n=>Math.max(0,n.getBoundingClientRect().bottom+scrollY-innerHeight*.8));
 for(let i=0;i<12;i++){
  const y=Math.round(maxY*i/11);await page.evaluate(y=>scrollTo({top:y,behavior:'instant'}),y);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));
  rhythm.push(await page.evaluate(index=>{
   const candidates=Array.from(document.querySelectorAll('.v2-journey > [data-surface]')).map((n,sectionIndex)=>{const r=n.getBoundingClientRect(),visible=Math.max(0,Math.min(r.bottom,innerHeight)-Math.max(r.top,0));return {n,r,visible,sectionIndex};}).filter(x=>x.visible>0).sort((a,b)=>b.visible-a.visible);
   const hit=candidates[0],n=hit&&hit.n;if(!n)return {index,empty:true};const charts=Array.from(n.querySelectorAll('svg.dx-art,.dx-lazy-media')).map(c=>c.getBoundingClientRect().height).filter(Boolean);
   return {index,y:scrollY,id:n.dataset.surface,sectionIndex:hit.sectionIndex,archetype:n.dataset.archetype||'',surfaceType:n.dataset.surfaceType||'',world:n.dataset.world||'',visible:hit.visible,features:{chart:charts.length>0,chartBand:charts.length?Math.round(Math.max(...charts)/50)*50:0,ranking:!!n.querySelector('.v2-stock-rank'),story:!!n.querySelector('.v2-motion-art'),cards:n.querySelectorAll('.v2-stock').length,layout:getComputedStyle(n.querySelector('.v2-track')||n).display}};
  },i));
  await screenshot(page,key+'-rhythm-'+String(i+1).padStart(2,'0'));
 }
 const semanticCharts=await page.locator('.v2-journey svg.dx-art[data-direction],.v2-journey svg.dx-micro[data-direction]').evaluateAll(nodes=>nodes.map(n=>({direction:n.dataset.direction,color:getComputedStyle(n).color})).filter(x=>x.direction==='up'||x.direction==='down'));
 for(const chart of semanticCharts){const c=(chart.color.match(/[\d.]+/g)||[]).slice(0,3).map(Number);if(chart.direction==='up')assert(c[1]>c[0]&&c[1]>c[2],'Positive discovery chart is not green: '+chart.color);else assert(c[0]>c[1]&&c[0]>c[2],'Negative discovery chart is not red: '+chart.color);}
 const semanticTokens=await page.evaluate(()=>{const root=document.querySelector('.v2-home'),probe=value=>{const n=document.createElement('i');n.style.color=value;root.append(n);const color=getComputedStyle(n).color;n.remove();return color;};return {positive:probe('var(--v2-green)'),negative:probe('var(--v2-red)'),neutral:probe('var(--v2-muted)')};});
 const positive=(semanticTokens.positive.match(/[\d.]+/g)||[]).slice(0,3).map(Number),negative=(semanticTokens.negative.match(/[\d.]+/g)||[]).slice(0,3).map(Number);assert(semanticCharts.length>0,'Canonical journey exposes no directional chart');assert(positive[1]>positive[0]&&positive[1]>positive[2],'Positive system token is not green');assert(negative[0]>negative[1]&&negative[0]>negative[2],'Negative system token is not red');designEvidence.push({key,type:'semantic-chart-colours',charts:semanticCharts,tokens:semanticTokens});
 // A long single section can cover several fixed viewport samples. Count it
 // once for module repetition; adjacent separate sections still count.
 const sampled=rhythm.filter(x=>!x.empty);
 const signatures=sampled.filter((x,i)=>i===0||x.sectionIndex!==sampled[i-1].sectionIndex).map(x=>[x.archetype,x.features.chartBand,x.features.ranking?'rank':'',x.features.story?'story':'',x.features.layout].join('|'));
 const archetypes=new Set(rhythm.map(x=>x.archetype).filter(Boolean)),unique=new Set(signatures);
 let longest=1,run=1;for(let i=1;i<signatures.length;i++){run=signatures[i]===signatures[i-1]?run+1:1;longest=Math.max(longest,run);}
 const portfolio=await surfaces.evaluateAll(nodes=>({ranking:nodes.some(n=>n.querySelector('.v2-stock-rank')),story:nodes.some(n=>n.querySelector('.v2-motion-art')),chartSurfaces:nodes.filter(n=>n.querySelector('svg.dx-art,.dx-lazy-media')).length,chartBands:[...new Set(nodes.flatMap(n=>Array.from(n.querySelectorAll('svg.dx-art,.dx-lazy-media')).map(c=>Math.round(c.getBoundingClientRect().height/50)*50).filter(Boolean)))]}));
 const composition={key,type:'ten-viewport-diversity',rhythm,archetypes:[...archetypes],signatures:[...unique],longestRepeat:longest,intensities:pick,portfolio};designEvidence.push(composition);
 assert(rhythm.length>=10&&rhythm.every(x=>!x.empty),'Ten mobile journey viewports need inspectable content');assert(archetypes.size>=5,'Need five distinct archetypes across the long journey: '+[...archetypes]);assert(unique.size>=7,'Colour alone is not surface diversity');assert(longest<=2,'Same surface composition repeats across more than two sampled viewports: '+JSON.stringify({longest,rhythm:rhythm.map(x=>({index:x.index,id:x.id,archetype:x.archetype,visible:x.visible,features:x.features}))}));assert(portfolio.ranking&&portfolio.story&&portfolio.chartSurfaces>=5&&portfolio.chartBands.length>=2,'Journey needs distinct ranking, visual interlude and differently sized chart beats: '+JSON.stringify(portfolio));
}
try{
await check('captions use structured metadata, not accessibility copy',async()=>{const source=await readFile(new URL('../../discover/home.js',import.meta.url),'utf8');assert(source.includes('D.Artwork.verlauf'),'Caption renderer must consume the structured chart model');assert(!/getAttribute\(['"]aria-label['"]\)[\s\S]{0,160}\.match\(/.test(source),'Visible caption is reconstructed from an accessibility string');});
for(const width of (engine==='webkit'?[390]:[320,390,1440]))for(const colorScheme of (engine==='webkit'?['dark']:['light','dark'])){
 const ctx=await browser.newContext({viewport:{width,height:width<500?844:900},colorScheme,hasTouch:width<500,isMobile:width<500,deviceScaleFactor:1});
 await ctx.addInitScript(()=>{window.__dv2Vitals={cls:0,longTasks:0,longTaskMs:0,shiftSources:[]};try{new PerformanceObserver(list=>list.getEntries().forEach(e=>{if(!e.hadRecentInput){window.__dv2Vitals.cls+=e.value;window.__dv2Vitals.shiftSources.push({value:e.value,sources:(e.sources||[]).map(s=>({node:s.node?.className||s.node?.tagName,previousRect:s.previousRect,currentRect:s.currentRect}))});}})).observe({type:'layout-shift',buffered:true});new PerformanceObserver(list=>list.getEntries().forEach(e=>{window.__dv2Vitals.longTasks++;window.__dv2Vitals.longTaskMs+=e.duration;})).observe({type:'longtask',buffered:true});}catch{}});
 const page=await ctx.newPage();const key=width+'-'+colorScheme+(engine==='webkit'?'-webkit':'');
 page.on('pageerror',e=>errors.push({key,message:e.message}));
 const bad=[];page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)bad.push({status:r.status(),url:r.url()});});
 const entryStarted=Date.now();await page.goto(base+'/discover/',{waitUntil:'domcontentloaded'});await page.locator('.v2-hero-track .v2-stock').first().waitFor({state:'visible'});
 await check(key+' fresh visit starts light regardless of device scheme',async()=>{
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  assert.equal(await page.locator('html').getAttribute('data-theme-mode'),'light');
  assert.equal(await page.locator('vu-navigation').getAttribute('theme'),'light');
  assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'),'#ffffff');
 });
 if(width===390)await check(key+' dark setting is explicit and persists',async()=>{
  await page.goto(base+'/discover/#/settings',{waitUntil:'domcontentloaded'});
  const choices=page.locator('.v2-settings-choices button');await choices.first().waitFor();
  assert.deepEqual(await choices.allTextContents(),['Hell','Dunkel']);
  await choices.getByText('Dunkel').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  await page.reload({waitUntil:'domcontentloaded'});
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  await page.locator('.v2-settings-choices button').getByText('Hell').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  await page.goto(base+'/discover/',{waitUntil:'domcontentloaded'});
  await page.locator('.v2-hero-track .v2-stock').first().waitFor({state:'visible'});
 });
 await check(key+' canonical page is indexable',async()=>{const robots=page.locator('meta[name=robots]');assert(!(await robots.count())||!(await robots.getAttribute('content')).includes('noindex'),'canonical /discover/ must not be noindex');});
 await check(key+' main visible',async()=>assert(await page.locator('main').isVisible()));
 await check(key+' five-second entry heuristic',async()=>{const text=await page.locator('body').innerText();assert(/Aktien/.test(text)&&/entdeck|versteh/i.test(text),'Entry does not explain the purpose');const viewport=page.viewportSize();const targets=[['purpose',page.locator('h1')],['search',page.locator('.v2-search-prompt')],['hero action',page.locator('.v2-intro-cta').first()]];const bounds=[];for(const [label,target] of targets){const box=await target.boundingBox();assert(box&&box.width>0&&box.height>0,label+' missing');assert(box.x>=0&&box.y>=70&&box.x+box.width<=viewport.width+1&&box.y+box.height<=viewport.height-75,label+' outside unobstructed first viewport');bounds.push({label,...box});}const milliseconds=Date.now()-entryStarted;firstScreenEvidence.push({key,milliseconds,bounds});assert(milliseconds<=5000,'First-screen content took '+milliseconds+' ms locally');});
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
  const destinations=await nav.locator('[data-group="discover"] .links a').evaluateAll(nodes=>nodes.map(n=>({label:n.lastChild.textContent.trim(),href:n.getAttribute('href')})));
  assert.deepEqual(destinations.map(x=>x.label),['Übersicht','Welten','Strategien','Entdecken','Suchen','Märkte','Watchlist']);
  assert.deepEqual(destinations.map(x=>x.href),['/discover/#/','/discover/#/welten','/discover/#/strategien','/discover/#/einzeln/US_REAL','/discover/#/suche','/discover/#/maerkte','/discover/#/watchlist']);
  assert.equal(await nav.locator('[data-group="discover"] .group-link').getAttribute('href'),'/discover/#/');
  assert.equal(await nav.locator('a[href="/discover-v2/"]').count(),0);
  /* Gemeinsame Shell: der Kopf traegt Marke, AI Atlas und Farbschema; das
     globale Menue oeffnet ☰ rechts in der Produkt-Leiste (#vu-dock). */
  const header=await nav.evaluate(n=>{const root=n.shadowRoot,brand=root.querySelector('.brand').getBoundingClientRect(),atlas=root.querySelector('.atlas').getBoundingClientRect();return {viewport:innerWidth,brand:brand.toJSON(),atlas:atlas.toJSON(),toggle:getComputedStyle(root.querySelector('.toggle')).display,section:getComputedStyle(root.querySelector('.section')).display};});
  assert(header.brand.left>=0&&header.atlas.right<=header.viewport&&header.atlas.left>=header.brand.right,'Header overflows: '+JSON.stringify(header));
  assert.equal(header.section,'none');assert.equal(header.toggle,'none','Redundant header menu button on a page with product dock');
  const menu=page.locator('#vu-dock button.menu');
  await menu.click();
  try{
   await page.waitForFunction(()=>{const p=document.querySelector('vu-navigation').shadowRoot.querySelector('.panel').getBoundingClientRect();return p.left>=-1&&p.right<=innerWidth+1;},null,{timeout:3000});
   const panel=await nav.evaluate(n=>{const root=n.shadowRoot,p=root.querySelector('.panel').getBoundingClientRect();return {left:p.left,right:p.right,columns:getComputedStyle(root.querySelector('.links')).gridTemplateColumns.split(' ').length,locked:document.documentElement.classList.contains('vu-menu-open'),dockInert:document.getElementById('vu-dock').inert};});
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
   const bounds=await home.locator('#lp-head').evaluate(n=>{const logo=n.querySelector('.lp-logo').getBoundingClientRect();return {viewport:innerWidth,logo:logo.toJSON(),overflow:document.documentElement.scrollWidth-innerWidth};});
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
  }else await track.evaluate(n=>{const cards=n.querySelectorAll('.v2-hero-item');n.scrollTo({left:cards[1].offsetLeft-cards[0].offsetLeft,behavior:'instant'});});
  if(needsScroll){await page.waitForFunction(symbol=>{const n=document.querySelector('.v2-hero-track'),b=n.getBoundingClientRect();return Array.from(n.querySelectorAll('[data-symbol]')).map(c=>{const r=c.getBoundingClientRect();return {symbol:c.dataset.symbol,visible:Math.max(0,Math.min(r.right,b.right)-Math.max(r.left,b.left))};}).sort((a,b)=>b.visible-a.visible)[0]?.symbol!==symbol;},before.cards[0].symbol);
   const after=await evidence();assert(after.scrollLeft>before.scrollLeft,'Hero did not scroll horizontally');assert.notEqual(after.cards[0].symbol,before.cards[0].symbol,'Hero visible company did not change');interactionEvidence.push({key,type:'hero-swipe',input:width<500&&engine==='chromium'?'native-touch':'native-scroll',before,after});}
  await screenshot(page,key+'-hero-next');
 });
 await page.evaluate(()=>scrollTo(0,innerHeight));await screenshot(page,key+'-discovery');
 await check(key+' responsive navigation remains reachable',async()=>{
  const nav=page.locator('#vu-dock nav');const state=await nav.evaluate(n=>({box:n.getBoundingClientRect().toJSON(),position:getComputedStyle(n.getRootNode().host).position,paddingBottom:parseFloat(getComputedStyle(n).paddingBottom),height:innerHeight,labels:Array.from(n.querySelectorAll('a,button')).map(a=>({label:a.textContent.trim(),width:a.getBoundingClientRect().width,height:a.getBoundingClientRect().height,current:a.getAttribute('aria-current')}))}));
  assert.deepEqual(state.labels.map(i=>i.label),['Discover','Welten','Strategien','Entdecken','Menü']);assert(state.labels.some(i=>i.current==='page'),'Current route not identified');
  assert.equal(state.position,'fixed');const gap=state.height-state.box.bottom;assert(gap>=6&&gap<=24,'Product dock must float just above the viewport edge: '+gap);assert(state.labels.every(i=>i.width>=44&&i.height>=44),'Dock targets smaller than 44px');assert(state.paddingBottom>=0);
  if(width>=500)assert(state.box.width<=760,'Desktop dock must not stretch across the viewport: '+state.box.width);interactionEvidence.push({key,type:'responsive-navigation',...state});
 });
 if(engine==='chromium'&&width===390&&colorScheme==='light'){
  await check(key+' premium mobile material and diversity',()=>premiumMobileAudit(page,key));
  await check(key+' themes and strategies stay separate',async()=>{
    await page.goto(base+'/discover/#/welten',{waitUntil:'networkidle'});
    const themes=page.locator('.v2-theme-grid .v2-theme-tile');
    assert(await themes.count()>=40,'All 40 Themenwelten must be listed');
    assert.equal(await page.locator('.v2-world-directory,.v2-collection-links').count(),0,'Strategies must not appear in Welten');
    await screenshot(page,key+'-worlds');
    await page.goto(base+'/discover/#/strategien',{waitUntil:'networkidle'});
    const strategies=page.locator('.v2-main .v2-collection-link');
    assert(await strategies.count()>=19,'Canonical Discover strategies must be listed');
    for(const rowId of ['sp500-staerkste','djia-staerkste','ndx-staerkste','qualitaet-zum-preis','qualitaet-wachstum']){
      const image=page.locator('.v2-main .v2-collection-link[href$="/'+rowId+'"] .v2-collection-image');
      assert.equal(await image.count(),1,'Strategy artwork missing: '+rowId);
      const src=await image.getAttribute('src');assert(src.endsWith('/'+rowId+'.jpeg'),'Wrong artwork for '+rowId+': '+src);
      const response=await page.request.get(base+src);assert(response.ok()&&/^image\/jpeg/.test(response.headers()['content-type']||''),'Strategy artwork cannot load: '+src);
    }
    assert.equal(await page.locator('.v2-theme-grid').count(),0,'Themes must not appear in Strategien');
    assert.equal(await page.locator('#vu-dock a[aria-current=page]').innerText(),'Strategien');
    const first=await strategies.first().boundingBox();assert(first&&first.width<=page.viewportSize().width,'Strategy card overflows mobile viewport');
    await screenshot(page,key+'-strategies');
    const href=await strategies.first().getAttribute('href');
    await page.goto(base+'/discover/'+href,{waitUntil:'networkidle'});
    assert.equal(await page.locator('.v2-back').getAttribute('href'),'#/strategien');
    const stock=page.locator('.v2-main>.dx-grid .dx-poster').first();await stock.waitFor({state:'visible'});
    await screenshot(page,key+'-strategy-stocks');
    await page.goto(base+'/discover/',{waitUntil:'networkidle'});
    await page.locator('.v2-hero-track .v2-stock').first().waitFor();
  });
  await check(key+' home freshness contract is visible',async()=>{await page.locator('.v2-hero-track .dx-lazy-media').first().scrollIntoViewIfNeeded();await page.waitForTimeout(250);const live=page.locator('.v2-stock .dx-lazy-media[data-live]');assert(await live.count()>0,'Home does not consume canonical snapshot/intraday artwork');const invalid=await live.evaluateAll(nodes=>nodes.filter(n=>!['LIVE','LAST_SESSION','STALE','UNAVAILABLE'].includes(n.dataset.freshness||'')).map(n=>({symbol:n.dataset.symbol,freshness:n.dataset.freshness})));assert.deepEqual(invalid,[]);const caption=await page.locator('.v2-hero-track .v2-stock-caption').first().innerText();assert(/Tagesverlauf|Kursverlauf|nicht verfügbar|Keine Kursreihe/i.test(caption),'Structured period/source caption is missing: '+caption);});
 }
 await check(key+' search opens traps focus and restores it',async()=>{const opener=page.locator('.v2-search-prompt:visible').first();await opener.click();const input=page.locator('input[type=search]').first();await input.waitFor({state:'visible'});await input.fill('AAPL');await page.waitForFunction(()=>Array.from(document.querySelectorAll('.dx-search .dx-result')).some(n=>/Apple|AAPL/.test(n.textContent)));for(let i=0;i<12;i++){await page.keyboard.press(i<6?'Tab':'Shift+Tab');assert(await page.locator('.dx-search').evaluate(n=>n.contains(document.activeElement)),'Focus escaped search');}await screenshot(page,key+'-search');if(width===390)await check(key+' search accessibility',()=>a11y(page,key+'-search'));await page.keyboard.press('Escape');await input.waitFor({state:'hidden'});assert(await opener.evaluate(n=>n===document.activeElement),'Search opener focus not restored');});
 await page.goto(base+'/discover/#/s/US_REAL/AAPL',{waitUntil:'networkidle'});await page.waitForTimeout(1000);
 await check(key+' stock identity and chart',async()=>{assert(/Apple|AAPL/.test(await page.locator('main').innerText()));assert(await page.locator('main svg').count()>0,'No visual chart');});
 await check(key+' stock overflow',async()=>{const overflow=await page.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:innerWidth,culprits:Array.from(document.querySelectorAll('main *')).map(n=>({node:n.className||n.tagName,right:n.getBoundingClientRect().right,left:n.getBoundingClientRect().left})).filter(x=>x.right>innerWidth+1||x.left<-1).slice(0,20)}));assert(overflow.page<=overflow.viewport+1,'Stock page overflows: '+JSON.stringify(overflow));});
 await screenshot(page,key+'-stock');
 await check(key+' dominant consumer chart and semantic colour',async()=>{const evidence=await page.evaluate(()=>{const svg=document.querySelector('.dx-chapter--chart svg.dx-range-chart,.dx-chapter--chart svg.dx-micro--intraday'),chapter=document.querySelector('.dx-chapter--chart'),direction=svg&&svg.getAttribute('data-direction'),color=svg&&getComputedStyle(svg).color;return {svg:svg&&svg.getBoundingClientRect().toJSON(),chapter:chapter&&chapter.getBoundingClientRect().toJSON(),viewport:{width:innerWidth,height:innerHeight},direction,color};});assert(evidence.svg,'Stock page has no primary price chart');assert(evidence.svg.width>=Math.min(330,evidence.viewport.width*.84),'Primary chart is too narrow');if(width<500)assert(evidence.svg.height>=180,'Primary mobile chart is too small: '+evidence.svg.height);if(evidence.direction==='up'){const c=(evidence.color.match(/[\d.]+/g)||[]).map(Number);assert(c[1]>c[0]&&c[1]>c[2],'Positive chart is not semantically green: '+evidence.color);}if(evidence.direction==='down'){const c=(evidence.color.match(/[\d.]+/g)||[]).map(Number);assert(c[0]>c[1]&&c[0]>c[2],'Negative chart is not semantically red: '+evidence.color);}designEvidence.push({key,type:'stock-chart',...evidence});});
 await check(key+' chart price and source visible early',async()=>{const hero=page.locator('.dx-chart-hero').first();const bounds=await hero.boundingBox();assert(bounds,'Missing chart price hero');if(width<500)assert(bounds.y<=420,'Mobile chart price starts below 420px: '+bounds.y);const text=await hero.innerText();assert(/\d/.test(text)&&/Kurs|Schluss|Stand|Heute|Handelstag/i.test(text),'Missing source/session evidence: '+text);interactionEvidence.push({key,type:'chart-hero',bounds,text});});
 await check(key+' unavailable chart ranges disabled',async()=>{const wrong=await page.locator('.dx-tf button').evaluateAll(nodes=>nodes.filter(n=>n.getAttribute('aria-disabled')==='true'&&!n.disabled).map(n=>n.textContent));assert.deepEqual(wrong,[]);assert(await page.locator('.dx-tf button').count()>0);});
 await check(key+' chart range updates evidence',async()=>{const samples=[];for(const [label,range,word] of [['1M','1M','Monat'],['1J','1Y','Jahr']]){const button=page.locator('.dx-tf').getByRole('button',{name:label,exact:true});assert(await button.isEnabled(),'AAPL range unavailable: '+label);await button.click();await page.locator('.dx-range-chart-wrap[data-range="'+range+'"]').waitFor();assert.equal(await button.getAttribute('aria-pressed'),'true');const evidence=await page.locator('.dx-chart-hero').innerText();assert(evidence.includes(word),'Range context missing: '+evidence);samples.push({label,evidence});}assert.notEqual(samples[0].evidence,samples[1].evidence,'Range data did not update');interactionEvidence.push({key,type:'chart-range',samples});});
 await check(key+' stock accessibility',()=>a11y(page,key+'-stock'));
 await check(key+' fundamental metric and year selection update visual evidence',async()=>{const journey=page.locator('#journey');await journey.scrollIntoViewIfNeeded();const tabs=journey.getByRole('tab');assert(await tabs.count()>=2,'AAPL needs multiple canonical metrics');const first=await journey.locator('.dx-journey-kopf').innerText();const svgBefore=await journey.locator('.dx-journey-bild').innerHTML();await tabs.nth(1).click();assert.equal(await tabs.nth(1).getAttribute('aria-selected'),'true');assert.equal(await tabs.nth(0).getAttribute('aria-selected'),'false');const second=await journey.locator('.dx-journey-kopf').innerText();assert(first!==second&&svgBefore!==await journey.locator('.dx-journey-bild').innerHTML(),'Fundamental visual did not change');const bars=journey.locator('.dx-journey-bar');assert(await bars.count()>=3,'Fundamental chart needs selectable fiscal years');assert.equal(await journey.locator('.dx-journey-wert').count(),0,'Loose values must not cover the chart');const target=bars.nth(1);const title=await target.locator('title').textContent();await target.click();assert.equal(await target.getAttribute('aria-pressed'),'true');assert(await target.evaluate(n=>n.classList.contains('is-selected')),'Selected fiscal year is not visually active');const active=await journey.locator('.dx-journey-nach').innerText();const match=title&&title.match(/^GJ\s+([^:]+):\s*(.+)$/);assert(match&&active.includes(match[1])&&active.includes(match[2]),'Selected fiscal year and value did not move to the chart header');interactionEvidence.push({key,type:'fundamental-metric-year',metric:await tabs.nth(1).innerText(),before:first,after:second,selected:title,active});await journey.evaluate(n=>n.scrollIntoView({block:'start',behavior:'instant'}));await screenshot(page,key+'-fundamentals');});
 await check(key+' valuation is a distinct canonical metric module',async()=>{const section=page.locator('.dv2-stock-valuation');assert.equal((await section.locator('h2').first().innerText()).toLocaleLowerCase('de-DE'),'bewertung');const block=section.locator('.dv2-valuation-components');assert(await block.count()===1,'Valuation building-block module missing');const labels=await block.locator('.dv2-valuation-card span').allTextContents();assert(labels.length>=7&&labels.includes('KGV')&&labels.includes('KUV')&&labels.includes('Gewinnrendite')&&labels.includes('KGV / Markt')&&labels.includes('Free-Cashflow-Rendite'),'Expected AAPL valuation components missing: '+labels.join(', '));await section.evaluate(n=>n.scrollIntoView({block:'start',behavior:'instant'}));await screenshot(page,key+'-valuation');});
 await check(key+' stock offers onward company exploration',async()=>{
  const next=page.locator('.dv2-stock-neighbors .dx-rail a[href^="#/s/"]').first();await next.scrollIntoViewIfNeeded();
  const href=await next.getAttribute('href');assert(href&&!href.endsWith('/AAPL'),'Next stock must differ from current stock');await screenshot(page,key+'-stock-onward');await next.click();await page.waitForURL(url=>url.hash===href);await page.locator('.dx-chart-hero').first().waitFor();
  assert(await page.locator('.dv2-stock-next a[href^="#/einzeln/"]').first().waitFor({state:'attached',timeout:10000}).then(()=>true,()=>false),'Next stock has no return to discovery');interactionEvidence.push({key,type:'stock-onward',from:'AAPL',to:href});
 });
 if(engine==='chromium'&&width===390&&colorScheme==='light')await check(key+' CrowdStrike business copy and zero-line chart scale',async()=>{
  await page.goto(base+'/discover/#/s/US_REAL/CRWD',{waitUntil:'networkidle'});await page.locator('.dv2-stock-business').waitFor();
  const copy=await page.locator('.dv2-stock-business .dx-chapter-lead').innerText();assert(/Cloud-Plattform/.test(copy)&&/Sicherheit/.test(copy),'CrowdStrike business description still empty: '+copy);
  const chart=page.locator('.dx-chapter--chart svg.dx-micro--intraday');if(await chart.count()){
   await page.waitForFunction(()=>document.querySelector('.dx-chapter--chart svg.dx-micro--intraday')?.dataset.v2PreviousCloseScale==='true');
   const scale=await chart.evaluate(svg=>{const base=svg.querySelector('.dx-art-base'),view=svg.viewBox.baseVal,basis=svg.__basis;return {mode:svg.dataset.v2PreviousCloseScale,baseY:Number(base?.getAttribute('y1')),top:basis.padTop,bottom:view.height-basis.padBottom,low:Math.min(...svg.__punkte.map(p=>p.close)),previousClose:basis.previousClose};});
   assert.equal(scale.mode,'true');assert(scale.low<scale.previousClose?scale.baseY>scale.top&&scale.baseY<scale.bottom:Math.abs(scale.baseY-scale.bottom)<1,'Previous close baseline must reflect the session range: '+JSON.stringify(scale));
  }
  await page.locator('.dv2-stock-business').scrollIntoViewIfNeeded();await screenshot(page,key+'-crowdstrike-business');
 });
 await page.goto(base+'/discover/#/einzeln/US_REAL',{waitUntil:'networkidle'});
 if(width<500)await check(key+' feed stock link remains reachable above the dock',async()=>{
  const card=page.locator('.dx-feed-screen[data-symbol]').first(),button=card.locator('.dx-cta .dx-btn');
  await button.evaluate(n=>n.scrollIntoView({block:'end',behavior:'instant'}));
  const bounds=await page.evaluate(()=>{const button=document.querySelector('.dx-feed-screen[data-symbol] .dx-cta .dx-btn'),dock=document.getElementById('vu-dock').shadowRoot.querySelector('nav'),track=document.querySelector('.dx-feed-spur');const b=button.getBoundingClientRect(),d=dock.getBoundingClientRect(),t=track.getBoundingClientRect();return {button:b.toJSON(),dock:d.toJSON(),track:t.toJSON(),hit:document.elementFromPoint(b.left+b.width/2,b.top+b.height/2)?.closest('.dx-btn')===button,scrollTop:track.scrollTop};});
  assert(bounds.button.top>=bounds.track.top&&bounds.button.bottom<=Math.min(bounds.dock.top-8,bounds.track.bottom),'Stock action is covered by the dock: '+JSON.stringify(bounds));
  assert(bounds.hit,'Stock action is not tappable');
  await card.evaluate(n=>n.scrollIntoView({block:'start',behavior:'instant'}));
  interactionEvidence.push({key,type:'feed-action-clearance',...bounds});
 });
 if(width===390)await check(key+' feed annual chart label stays above controls',async()=>{
  const card=page.locator('.dx-feed-screen[data-symbol]').first();
  await card.getByRole('tab',{name:'Umsatz'}).click();await card.locator('.v2-focus-bars').waitFor();
  const caption=await card.locator('.v2-stock-caption').boundingBox(),tabs=await card.locator('.v2-focus-tabs').boundingBox();
  assert(caption&&tabs&&caption.y+caption.height<=tabs.y-1,'Annual chart label overlaps chart controls');
  assert(await card.locator('.dx-feed-metrics').evaluate(n=>n.scrollWidth<=n.clientWidth),'Annual chart overflows the feed');
  await card.getByRole('tab',{name:'Chart'}).click();
 });
 await check(key+' feed is bounded and reaches the next stock',async()=>{
  const track=page.locator('.dx-feed-spur');await track.waitFor();
  const freeScroll=await track.evaluate(async n=>{
   const first=n.querySelector('.dx-feed-screen[data-symbol]');
   const target=Math.round(first.getBoundingClientRect().height*.45);
   n.scrollTop=target;
   await new Promise(resolve=>setTimeout(resolve,350));
   const result={target,actual:n.scrollTop,snap:getComputedStyle(n).scrollSnapType};
   n.scrollTop=0;
   return result;
  });
  assert.equal(freeScroll.snap,'none','Feed must not snap between stocks');
  assert(Math.abs(freeScroll.actual-freeScroll.target)<=2,'Feed jumped away from a free-scroll position: '+JSON.stringify(freeScroll));
  const count=await page.locator('.dx-feed-screen[data-symbol]').count();assert(count>0&&count<=24,'Initial feed eagerly rendered '+count+' cards');
  const visible=()=>track.evaluate(n=>{const bounds=n.getBoundingClientRect();const cards=Array.from(n.querySelectorAll('.dx-feed-screen[data-symbol]')).map(card=>{const box=card.getBoundingClientRect();return {symbol:card.dataset.symbol,index:card.dataset.index,visibleHeight:Math.max(0,Math.min(box.bottom,bounds.bottom)-Math.max(box.top,bounds.top))};}).sort((a,b)=>b.visibleHeight-a.visibleHeight);return {height:n.clientHeight,viewport:innerHeight,scrollTop:n.scrollTop,card:cards[0]};});
  const before=await visible();assert(before.height>100&&before.height<=before.viewport,'Feed track is not viewport-bounded');
  const counterBefore=await page.locator('.dx-feed-zaehler').innerText();
  await page.locator('.dx-feed-screen[data-symbol]').nth(1).evaluate(n=>n.scrollIntoView({block:'start',behavior:'instant'}));await waitCounter(page,2);
  const after=await visible(),counterAfter=await page.locator('.dx-feed-zaehler').innerText();
  assert(after.scrollTop>0,'Feed did not scroll');assert.notEqual(after.card.symbol,before.card.symbol,'Visible stock did not change');assert.equal(after.card.index,'1','Scrolling did not reach second stock');assert.notEqual(counterAfter,counterBefore,'Feed counter did not follow visible stock');assert(/^2 von /i.test(counterAfter),'Counter does not identify second stock: '+counterAfter);
  interactionEvidence.push({key,type:'feed-single-screen',initialCards:count,before,after,counterBefore,counterAfter});
  await screenshot(page,key+'-feed-second-stock');
 });
 await check(key+' feed continues beyond first batch',async()=>{await page.locator('.dx-feed-spur').waitFor();await page.locator('.dx-feed-spur').evaluate(n=>{n.scrollTop=n.scrollHeight;});await page.waitForFunction(()=>document.querySelectorAll('.dx-feed-screen[data-symbol]').length>12);const symbols=await page.locator('.dx-feed-screen[data-symbol]').evaluateAll(nodes=>nodes.map(n=>n.dataset.symbol));assert(symbols.length>12,'Feed stopped after first batch');assert.equal(symbols.length,new Set(symbols).size,'Feed contains duplicate symbols');});
 await screenshot(page,key+'-feed');
 if(width===390)await check(key+' feed accessibility',()=>a11y(page,key+'-feed'));
 const savedCounter=await page.locator('.dx-feed-zaehler').innerText(),savedStock=await visibleFeedStock(page);
 await check(key+' feed exit cleanup',async()=>{await page.locator('.dx-feed-zurueck').click();await page.locator('.v2-home').waitFor({state:'visible'});assert(!await page.locator('body').evaluate(n=>n.classList.contains('dx-feed-aktiv')||n.classList.contains('v2-feed-active')));assert.equal(await page.locator('.dx-feed').count(),0);});
 await check(key+' feed session resumes exploration',async()=>{
  await page.locator('#vu-dock a[data-id=entdecken]').click();await waitCounter(page,1);await page.locator('.v2-feed-resume').waitFor();
  const resumed=await visibleFeedStock(page);assert.equal(resumed.symbol,savedStock.symbol,'Session must resume at the same canonical company');assert.equal(resumed.index,0,'Resumed suffix must start at its first screen');assert(await page.locator('.dx-feed-screen[data-symbol]').count()<=24,'Resume eagerly mounted predecessor stocks');interactionEvidence.push({key,type:'feed-resume',savedCounter,savedStock,resumed});await page.locator('.dx-feed-zurueck').click();await page.locator('.v2-home').waitFor({state:'visible'});
 });
 if(engine==='chromium'&&width===390&&colorScheme==='dark')await check(key+' deep session resume loads a bounded canonical suffix',async()=>{
  const feed=await (await page.request.get(base+'/discover/data/feed/US_REAL.json')).json();const position=Math.min(120,feed.order.length-24);assert(position>84,'Need a genuine deep feed position');
  await page.evaluate(index=>window.VUDiscover.memory.setPosition('feed:US_REAL',index),position);
  const deep=await ctx.newPage(),requests=[];deep.on('pageerror',error=>errors.push({key:key+'-deep-resume',message:error.message}));deep.on('response',response=>{if(response.url().startsWith(base)&&response.status()>=400)bad.push({status:response.status(),url:response.url()});});deep.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/discover/data/stocks/US_REAL/'))requests.push(request.url());});
  try{await deep.goto(base+'/discover/#/einzeln/US_REAL',{waitUntil:'networkidle'});await deep.locator('.v2-feed-resume').waitFor();const visible=await visibleFeedStock(deep),count=await deep.locator('.dx-feed-screen[data-symbol]').count();assert.equal(visible.symbol,feed.order[position].s);assert(count>0&&count<=24,'Deep resume mounted '+count+' stocks');assert(requests.length<=24,'Deep resume fetched '+requests.length+' stock bundles');const allowed=new Set(feed.order.slice(position,position+24).map(entry=>entry.s));assert(requests.every(url=>allowed.has(decodeURIComponent(new URL(url).pathname.split('/').at(-1).replace(/\.json$/,'')))),'Deep resume requested predecessor or unrelated stocks');interactionEvidence.push({key,type:'deep-feed-resume',position,visible,mounted:count,stockRequests:requests.length});await screenshot(deep,key+'-feed-deep-resume');await deep.locator('.v2-feed-restart').click();await deep.locator('.v2-feed-resume').waitFor({state:'hidden'});await waitCounter(deep,1);assert.equal((await visibleFeedStock(deep)).symbol,feed.order[0].s,'Restart did not restore the canonical beginning');}finally{await deep.close();}
 });
 if(engine==='chromium'&&width===390&&colorScheme==='dark')await check(key+' complete canonical home journey',async()=>{
  const meta=await (await page.request.get(base+'/discover/data/meta.json')).json();
  const contract=meta.home.find(h=>h.universeId==='US_REAL');
  const chunks=await Promise.all(contract.chunks.map(async path=>(await (await page.request.get(base+path)).json())));
  const expected=chunks.reduce((n,chunk)=>n+chunk.surfaces.length,0);
  for(let attempt=0;attempt<chunks.length&&await page.locator('.v2-finish').count()===0;attempt++){
   const before=await page.locator('.v2-journey > [data-surface]').count();
   await page.locator('.v2-load-more').scrollIntoViewIfNeeded();
   await page.waitForFunction(count=>document.querySelectorAll('.v2-journey > [data-surface]').length>count||document.querySelector('.v2-finish'),before);
  }
  assert.equal(await page.locator('.v2-finish').count(),1,'Journey must end once');
  assert.equal(await page.locator('.v2-load-more').count(),0,'Unloaded chunk remains');
  const surfaces=await page.locator('.v2-journey > :not(.v2-finish):not([data-block])').evaluateAll(nodes=>nodes.map(n=>({id:n.getAttribute('data-surface'),archetype:n.getAttribute('data-archetype'),className:n.className,title:n.querySelector('h2')?.textContent||''})));
  assert(surfaces.length>=8,'Discovery journey is prematurely short');
  assert.equal(await page.locator('.v2-top-tabs [role=tab]').count(),5,'Canonical top lists must remain reachable as tabs');
  assert(await page.locator('.v2-collection-directory a').count()>=10,'Bundled stock worlds must remain reachable');
  for(const selector of ['.v2-market-today','.v2-themes','.v2-spotlight','.v2-pulse-teaser'])assert.equal(await page.locator(selector).count(),1,selector+' missing');
  const featured=page.locator('.v2-spotlight-featured .v2-focus');
  assert.equal(await featured.locator('[role=tab]').allTextContents().then(x=>x.join('|')),'Chart|Umsatz|Gewinn|Cashflow');
  for(const label of ['Umsatz','Gewinn','Cashflow']){
   await featured.getByRole('tab',{name:label}).click();
   await featured.locator('.v2-focus-bars').waitFor();
   assert(await featured.locator('.v2-focus-bar').count()>=2,label+' has no annual series');
   assert.equal(await featured.locator('.v2-focus-stage').getAttribute('aria-label'),label);
  }
  await featured.getByRole('tab',{name:'Chart'}).click();
  assert.equal(await featured.locator('.dx-lazy-media').count(),1,'Original price chart must remain available');
  await featured.locator('.v2-stock-market-cap strong').waitFor({state:'visible'});
  assert(!/^–$/.test(await featured.locator('.v2-stock-market-cap strong').innerText()),'Featured market capitalization did not load');
  const small=page.locator('.v2-spotlight .v2-hero-item .v2-tile-shell').first();
  assert.equal(await small.getByRole('tab').allTextContents().then(x=>x.join('|')),'Chart|Umsatz|Gewinn|Cashflow');
  const symbol=await small.getAttribute('data-symbol');
  await small.getByRole('tab',{name:'Umsatz'}).click();
  await small.locator('.v2-focus-bars, .v2-focus-empty').first().waitFor();
  assert.equal(await small.locator('.v2-tile-stage').getAttribute('aria-label'),'Umsatz');
  await small.locator('.v2-stock-market-cap strong').waitFor({state:'visible'});
  assert(!/^–$/.test(await small.locator('.v2-stock-market-cap strong').innerText()),'Compact market capitalization did not load');
  await small.getByRole('tab',{name:'Chart'}).click();
  assert.equal(await small.locator('.dx-lazy-media').count(),1,'Compact price chart must remain available');
  assert((await small.locator('a.v2-tile').getAttribute('href')).endsWith('/'+symbol),'Compact profile link was lost');
  const ranking=page.locator('.v2-top-panel .v2-tile-shell').first();
  assert.equal(await ranking.getByRole('tab').count(),4,'Rankings also need all four chart views');
  const narrow=page.locator('.v2-hero-track .v2-tile-shell').first();
  const fit=await narrow.locator('.v2-focus-tabs button').evaluateAll(nodes=>nodes.map(n=>({text:n.textContent,button:n.getBoundingClientRect(),label:n.scrollWidth})).every((x,i,a)=>x.label<=x.button.width+1&&a.every((y,j)=>i===j||x.button.right<=y.button.left||y.button.right<=x.button.left||x.button.bottom<=y.button.top||y.button.bottom<=x.button.top)));
  assert(fit,'Four chart tabs overlap or clip in a narrow mobile stock preview');
  const ids=surfaces.map(s=>s.id).filter(Boolean);assert.equal(ids.length,new Set(ids).size,'Duplicated discovery surfaces');
  interactionEvidence.push({key,type:'complete-home',chunks:chunks.length,expected,rendered:surfaces.length,surfaces});
  const archetypes=[...new Set(surfaces.map(s=>s.archetype).filter(Boolean))];assert(archetypes.length>=5,'Discovery needs at least five distinct surface archetypes for visual review');
  for(const archetype of archetypes){const surface=page.locator('.v2-journey > [data-archetype="'+archetype+'"]').first();await surface.evaluate(n=>n.scrollIntoView({block:'start',behavior:'instant'}));await screenshot(page,key+'-world-'+archetype);}
  await page.locator('.v2-journey > :not(.v2-finish)').nth(Math.max(0,surfaces.length-4)).scrollIntoViewIfNeeded();await screenshot(page,key+'-late-discovery');
  await page.locator('.v2-finish').scrollIntoViewIfNeeded();await screenshot(page,key+'-journey-finish');
 });
 await check(key+' no local HTTP errors',async()=>assert.deepEqual(bad,[]));
 await ctx.close();
}
await check('no uncaught page errors',async()=>assert.deepEqual(errors,[]));
}catch(e){checks.push({name:'browser suite completion',pass:false,error:e.stack||e.message});}finally{await browser.close();}
const report={status:checks.every(x=>x.pass)?'PASS':'FAIL',checks,errors,shots,performance,designEvidence,limitations:['Five-second check is an automated content heuristic, not an independent human usability test.','Premium feel still requires the documented screenshot critique; material and composition checks only provide objective evidence.','A closed-market run cannot prove receipt of a new regular-session realtime tick.','Automated structural checks are not a WCAG certification.','Local resource measurements are not a production latency SLA.']};
report.engine=engine;report.firstScreenEvidence=firstScreenEvidence;report.interactionEvidence=interactionEvidence;report.screenshotEvidence=screenshotEvidence;
await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,totalChecks:checks.length,passed:checks.filter(c=>c.pass).length,failed:checks.filter(c=>!c.pass),screenshots:shots.length,firstScreenMilliseconds:firstScreenEvidence.map(e=>({key:e.key,milliseconds:e.milliseconds})),totalCheckMilliseconds:checks.reduce((n,c)=>n+(c.milliseconds||0),0)},null,2));if(report.status!=='PASS')process.exitCode=1;
await writeFile(out+'/accessibility.json',JSON.stringify(accessibility,null,2));
