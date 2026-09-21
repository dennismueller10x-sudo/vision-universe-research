#!/usr/bin/env node
// Real-browser checks; no fixture interception and no simulated market data.
// Usage: node scripts/discover-v2/browser-qa.mjs --url http://127.0.0.1:8765 --out /tmp/discover-v2-qa
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
let playwright;
try{playwright=require('playwright');}catch{playwright=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');}
const arg=(key,otherwise)=>{const i=process.argv.indexOf('--'+key);return i<0?otherwise:process.argv[i+1];};
const base=arg('url','http://127.0.0.1:8765').replace(/\/$/,'');
const out=arg('out','/tmp/discover-v2-qa');await mkdir(out,{recursive:true});
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
  const body=css(document.body),main=css(document.querySelector('.v2-main')),bar=css(document.querySelector('.v2-bar'));
  const dock=document.querySelector('.v2-dock'),ds=css(dock),db=dock.getBoundingClientRect();
  const active=dock.querySelector('[aria-current=page]'),as=active&&css(active);
  return {bodyBackground:body.backgroundColor,mainBackground:main.backgroundColor,barBackground:bar.backgroundColor,
   pureWhite:[body.backgroundColor,bar.backgroundColor].every(v=>{const c=rgb(v);return c[0]===255&&c[1]===255&&c[2]===255;}),
   dock:{box:db.toJSON(),position:ds.position,bottom:innerHeight-db.bottom,left:db.left,right:innerWidth-db.right,borderRadius:parseFloat(ds.borderRadius),background:ds.backgroundColor,backdropFilter:ds.backdropFilter||ds.webkitBackdropFilter,boxShadow:ds.boxShadow,borderWidth:parseFloat(ds.borderTopWidth)},
   active:{background:as&&as.backgroundColor,color:as&&as.color,luminance:as&&luminance(as.backgroundColor)}};
 });
 designEvidence.push({key,type:'premium-material',...material});
 assert(material.pureWhite,'Light neutral canvas/header must be pure white: '+JSON.stringify(material));
 assert.equal(material.dock.position,'fixed');assert(material.dock.left>=8&&material.dock.right>=8,'Dock must float inside viewport');assert(material.dock.bottom>=8,'Dock needs a visible safe-area gap');assert(material.dock.borderRadius>=20,'Dock lacks premium capsule geometry');assert(/blur\(/.test(material.dock.backdropFilter),'Dock has no real backdrop blur');assert(material.dock.borderWidth>0&&!/^none$/.test(material.dock.boxShadow),'Dock needs material border and depth');assert(material.active.luminance!==null&&material.active.luminance<45,'Active state must be a deep monochrome capsule');

 const surfaces=page.locator('.v2-journey > [data-surface]');
 const intensity=await surfaces.evaluateAll(nodes=>nodes.map((node,index)=>{let owner=node,s=getComputedStyle(owner),raw=s.backgroundColor,m=(raw.match(/[\d.]+/g)||[]).map(Number);while(owner.parentElement&&(raw==='transparent'||(m.length>3&&m[3]===0))){owner=owner.parentElement;s=getComputedStyle(owner);raw=s.backgroundColor;m=(raw.match(/[\d.]+/g)||[]).map(Number);}m=m.slice(0,3);const max=Math.max(...m),min=Math.min(...m),lum=m.length===3?(m[0]+m[1]+m[2])/3:null;return {index,id:node.dataset.surface,archetype:node.dataset.archetype||'',background:raw,lum,saturation:m.length===3?max-min:0};}));
 const pick={white:intensity.find(x=>x.lum!==null&&x.lum>245),color:intensity.find(x=>x.saturation>55&&x.lum>45),cinema:intensity.find(x=>x.lum!==null&&x.lum<55)};
 for(const [tone,entry] of Object.entries(pick)){assert(entry,'Missing '+tone+' surface for three-intensity rhythm');const target=surfaces.nth(entry.index);await target.evaluate(n=>n.scrollIntoView({block:'center',behavior:'instant'}));await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await screenshot(page,key+'-dock-over-'+tone);}

 const rhythm=[];const maxY=await surfaces.last().evaluate(n=>Math.max(0,n.getBoundingClientRect().bottom+scrollY-innerHeight*.8));
 for(let i=0;i<12;i++){
  const y=Math.round(maxY*i/11);await page.evaluate(y=>scrollTo({top:y,behavior:'instant'}),y);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));
  rhythm.push(await page.evaluate(index=>{
   const candidates=Array.from(document.querySelectorAll('.v2-journey > [data-surface]')).map(n=>{const r=n.getBoundingClientRect(),visible=Math.max(0,Math.min(r.bottom,innerHeight)-Math.max(r.top,0));return {n,r,visible};}).filter(x=>x.visible>0).sort((a,b)=>b.visible-a.visible);
   const hit=candidates[0],n=hit&&hit.n;if(!n)return {index,empty:true};const charts=Array.from(n.querySelectorAll('svg.dx-art,.dx-lazy-media')).map(c=>c.getBoundingClientRect().height).filter(Boolean);
   return {index,y:scrollY,id:n.dataset.surface,archetype:n.dataset.archetype||'',surfaceType:n.dataset.surfaceType||'',world:n.dataset.world||'',visible:hit.visible,features:{chart:charts.length>0,chartBand:charts.length?Math.round(Math.max(...charts)/50)*50:0,ranking:!!n.querySelector('.v2-stock-rank'),story:!!n.querySelector('.v2-story-bars'),cards:n.querySelectorAll('.v2-stock').length,layout:getComputedStyle(n.querySelector('.v2-track')||n).display}};
  },i));
  await screenshot(page,key+'-rhythm-'+String(i+1).padStart(2,'0'));
 }
 const semanticCharts=await page.locator('.v2-journey svg.dx-art[data-direction]').evaluateAll(nodes=>nodes.map(n=>({direction:n.dataset.direction,color:getComputedStyle(n).color})).filter(x=>x.direction==='up'||x.direction==='down'));
 for(const chart of semanticCharts){const c=(chart.color.match(/[\d.]+/g)||[]).slice(0,3).map(Number);if(chart.direction==='up')assert(c[1]>c[0]&&c[1]>c[2],'Positive discovery chart is not green: '+chart.color);else assert(c[0]>c[1]&&c[0]>c[2],'Negative discovery chart is not red: '+chart.color);}
 assert(semanticCharts.some(x=>x.direction==='up')&&semanticCharts.some(x=>x.direction==='down'),'Semantic QA needs positive and negative discovery charts');designEvidence.push({key,type:'semantic-chart-colours',charts:semanticCharts});
 const signatures=rhythm.filter(x=>!x.empty).map(x=>[x.archetype,x.features.chartBand,x.features.ranking?'rank':'',x.features.story?'story':'',x.features.layout].join('|'));
 const archetypes=new Set(rhythm.map(x=>x.archetype).filter(Boolean)),unique=new Set(signatures);
 let longest=1,run=1;for(let i=1;i<signatures.length;i++){run=signatures[i]===signatures[i-1]?run+1:1;longest=Math.max(longest,run);}
 const portfolio=await surfaces.evaluateAll(nodes=>({ranking:nodes.some(n=>n.querySelector('.v2-stock-rank')),story:nodes.some(n=>n.querySelector('.v2-story-bars')),chartSurfaces:nodes.filter(n=>n.querySelector('svg.dx-art,.dx-lazy-media')).length,chartBands:[...new Set(nodes.flatMap(n=>Array.from(n.querySelectorAll('svg.dx-art,.dx-lazy-media')).map(c=>Math.round(c.getBoundingClientRect().height/50)*50).filter(Boolean)))]}));
 const composition={key,type:'ten-viewport-diversity',rhythm,archetypes:[...archetypes],signatures:[...unique],longestRepeat:longest,intensities:pick,portfolio};designEvidence.push(composition);
 assert(rhythm.length>=10&&rhythm.every(x=>!x.empty),'Ten mobile journey viewports need inspectable content');assert(archetypes.size>=6,'Need at least six archetypes across the long journey');assert(unique.size>=7,'Colour alone is not surface diversity');assert(longest<=2,'Same surface composition repeats across more than two sampled viewports');assert(portfolio.ranking&&portfolio.story&&portfolio.chartSurfaces>=8&&portfolio.chartBands.length>=2,'Journey needs distinct ranking, story and differently sized chart beats');
}
try{
await check('captions use structured metadata, not accessibility copy',async()=>{const source=await readFile(new URL('../../discover-v2/home.js',import.meta.url),'utf8');assert(source.includes('D.Artwork.verlauf'),'Caption renderer must consume the structured chart model');assert(!/getAttribute\(['"]aria-label['"]\)[\s\S]{0,160}\.match\(/.test(source),'Visible caption is reconstructed from an accessibility string');});
for(const width of (engine==='webkit'?[390]:[320,390,1440]))for(const colorScheme of (engine==='webkit'?['dark']:['light','dark'])){
 const ctx=await browser.newContext({viewport:{width,height:width<500?844:900},colorScheme,hasTouch:width<500,isMobile:width<500,deviceScaleFactor:1});
 await ctx.addInitScript(()=>{window.__dv2Vitals={cls:0,longTasks:0,longTaskMs:0,shiftSources:[]};try{new PerformanceObserver(list=>list.getEntries().forEach(e=>{if(!e.hadRecentInput){window.__dv2Vitals.cls+=e.value;window.__dv2Vitals.shiftSources.push({value:e.value,sources:(e.sources||[]).map(s=>({node:s.node?.className||s.node?.tagName,previousRect:s.previousRect,currentRect:s.currentRect}))});}})).observe({type:'layout-shift',buffered:true});new PerformanceObserver(list=>list.getEntries().forEach(e=>{window.__dv2Vitals.longTasks++;window.__dv2Vitals.longTaskMs+=e.duration;})).observe({type:'longtask',buffered:true});}catch{}});
 const page=await ctx.newPage();const key=width+'-'+colorScheme+(engine==='webkit'?'-webkit':'');
 page.on('pageerror',e=>errors.push({key,message:e.message}));
 const bad=[];page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)bad.push({status:r.status(),url:r.url()});});
 const entryStarted=Date.now();await page.goto(base+'/discover-v2/',{waitUntil:'domcontentloaded'});await page.locator('.v2-stock-hero .v2-stock-cta').first().waitFor({state:'visible'});
 await check(key+' noindex',async()=>assert((await page.locator('meta[name=robots]').getAttribute('content')).includes('noindex')));
 await check(key+' main visible',async()=>assert(await page.locator('main').isVisible()));
 await check(key+' five-second entry heuristic',async()=>{const text=await page.locator('body').innerText();assert(/Aktien/.test(text)&&/entdeck|versteh/i.test(text),'Entry does not explain the purpose');const viewport=page.viewportSize();const targets=[['purpose',page.locator('h1')],['search',page.locator('.v2-search-prompt')],['hero action',page.locator('.v2-stock-hero .v2-stock-cta').first()]];const bounds=[];for(const [label,target] of targets){const box=await target.boundingBox();assert(box&&box.width>0&&box.height>0,label+' missing');assert(box.x>=0&&box.y>=70&&box.x+box.width<=viewport.width+1&&box.y+box.height<=viewport.height-75,label+' outside unobstructed first viewport');bounds.push({label,...box});}const milliseconds=Date.now()-entryStarted;firstScreenEvidence.push({key,milliseconds,bounds});assert(milliseconds<=5000,'First-screen content took '+milliseconds+' ms locally');});
 await check(key+' no horizontal page overflow',async()=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)));
 await check(key+' stock discovery links',async()=>assert(await page.locator('main a[href*="/s/"]').count()>=4));
 await check(key+' visible controls named',async()=>{const missing=await page.locator('main button').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length&&!((n.getAttribute('aria-label')||n.textContent||'').trim())).map(n=>n.outerHTML));assert.deepEqual(missing,[]);});
 await check(key+' document structure',async()=>{assert.equal(await page.locator('main').count(),1);assert.equal(await page.locator('h1').count(),1);assert.equal(await page.locator('html').getAttribute('lang'),'de');});
 await page.waitForLoadState('networkidle');
 performance.push({view:'home',key,...await page.evaluate(()=>({resources:performance.getEntriesByType('resource').map(r=>({url:r.name,bytes:r.decodedBodySize,duration:r.duration})),navigation:performance.getEntriesByType('navigation').map(r=>({domContentLoaded:r.domContentLoadedEventEnd,load:r.loadEventEnd})),domNodes:document.querySelectorAll('*').length}))});
 await check(key+' incremental view resource budget',async()=>{const resources=performance.at(-1).resources.filter(r=>new URL(r.url).pathname.startsWith('/discover-v2/'));assert(resources.reduce((n,r)=>n+r.bytes,0)<=150000,'New view scripts/styles exceed 150 KB decoded');assert(resources.length<=12,'New view adds more than 12 requests');});
 await check(key+' stable first render performance',async()=>{const metrics=await page.evaluate(()=>({...window.__dv2Vitals,domNodes:document.querySelectorAll('*').length}));performance.at(-1).vitals=metrics;assert(metrics.cls<=.15,'Cumulative layout shift exceeds 0.15: '+metrics.cls);assert(metrics.domNodes<=3000,'Initial home DOM is too large: '+metrics.domNodes);assert(metrics.longTaskMs<=1800,'First render accumulated excessive long tasks: '+metrics.longTaskMs);});
 await check(key+' home accessibility',()=>a11y(page,key+'-home'));
 await check(key+' navigation versions',async()=>{const nav=page.locator('vu-navigation');assert.equal(await nav.locator('a[href="/discover/"]').count(),1);assert.equal(await nav.locator('a[href="/discover-v2/"]').count(),1);});
 await screenshot(page,key+'-home');
 await check(key+' hero horizontal exploration',async()=>{
  const track=page.locator('.v2-hero-track');assert(await track.locator('[data-symbol]').count()>=2,'Hero needs another canonical stock');
  const evidence=()=>track.evaluate(n=>{const b=n.getBoundingClientRect();return {scrollLeft:n.scrollLeft,clientWidth:n.clientWidth,cards:Array.from(n.querySelectorAll('[data-symbol]')).map(c=>{const r=c.getBoundingClientRect();return {symbol:c.dataset.symbol,visibleWidth:Math.max(0,Math.min(r.right,b.right)-Math.max(r.left,b.left))};}).sort((a,b)=>b.visibleWidth-a.visibleWidth)};});
  const before=await evidence();
  if(width<500&&engine==='chromium'){
   const box=await track.boundingBox();const y=Math.min(box.y+box.height*.55,page.viewportSize().height-140);const start=box.x+box.width*.85,end=box.x+box.width*.15;
   const touch=await ctx.newCDPSession(page);await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start,y}]});
   for(let step=1;step<=10;step++)await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start+(end-start)*step/10,y}]});
   await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await touch.detach();
  }else await track.evaluate(n=>{const cards=n.querySelectorAll('.v2-hero-item');n.scrollTo({left:cards[1].offsetLeft-cards[0].offsetLeft,behavior:'instant'});});
  await page.waitForFunction(symbol=>{const n=document.querySelector('.v2-hero-track'),b=n.getBoundingClientRect();return Array.from(n.querySelectorAll('[data-symbol]')).map(c=>{const r=c.getBoundingClientRect();return {symbol:c.dataset.symbol,visible:Math.max(0,Math.min(r.right,b.right)-Math.max(r.left,b.left))};}).sort((a,b)=>b.visible-a.visible)[0]?.symbol!==symbol;},before.cards[0].symbol);
  const after=await evidence();assert(after.scrollLeft>before.scrollLeft,'Hero did not scroll horizontally');assert.notEqual(after.cards[0].symbol,before.cards[0].symbol,'Hero visible company did not change');interactionEvidence.push({key,type:'hero-swipe',input:width<500&&engine==='chromium'?'native-touch':'native-scroll',before,after});await screenshot(page,key+'-hero-next');
 });
 await page.evaluate(()=>scrollTo(0,innerHeight));await screenshot(page,key+'-discovery');
 await check(key+' responsive navigation remains reachable',async()=>{
  const nav=page.locator('.v2-dock');const state=await nav.evaluate(n=>({box:n.getBoundingClientRect().toJSON(),position:getComputedStyle(n).position,paddingBottom:parseFloat(getComputedStyle(n).paddingBottom),height:innerHeight,labels:Array.from(n.querySelectorAll('a,button')).map(a=>({label:a.textContent.trim(),width:a.getBoundingClientRect().width,height:a.getBoundingClientRect().height,current:a.getAttribute('aria-current')}))}));
  assert(state.labels.length>=4,'Navigation needs named home/world/feed/search destinations');assert(state.labels.every(i=>i.label),'Navigation contains an unlabeled action');assert(state.labels.some(i=>i.current==='page'),'Current route not identified');
  if(width<500){assert.equal(state.position,'fixed');const gap=state.height-state.box.bottom;assert(gap>=8&&gap<=80,'Mobile navigation must float above the safe-area edge: '+gap);assert(state.labels.every(i=>i.width>=44&&i.height>=44),'Mobile targets smaller than 44px');assert(state.paddingBottom>=0);}
  else assert.notEqual(state.position,'fixed','Desktop must use its distinct header navigation');interactionEvidence.push({key,type:'responsive-navigation',...state});
 });
 if(engine==='chromium'&&width===390&&colorScheme==='light'){
  await check(key+' premium mobile material and diversity',()=>premiumMobileAudit(page,key));
  await check(key+' worlds are distinct discovery entrances',async()=>{await page.goto(base+'/discover-v2/#/welten',{waitUntil:'networkidle'});const doors=page.locator('.v2-world-directory .v2-world-door');assert(await doors.count()>=8,'World directory needs multiple data-backed entrances');const styles=await doors.evaluateAll(nodes=>nodes.slice(0,4).map(n=>getComputedStyle(n).backgroundImage||getComputedStyle(n).backgroundColor));assert(new Set(styles).size>=3,'World entrances lack visual differentiation');await screenshot(page,key+'-worlds');await page.goto(base+'/discover-v2/',{waitUntil:'networkidle'});await page.locator('.v2-stock-hero').first().waitFor();});
  await check(key+' home freshness contract is visible',async()=>{await page.locator('.v2-stock-hero .dx-lazy-media').first().scrollIntoViewIfNeeded();await page.waitForTimeout(250);const live=page.locator('.v2-stock .dx-lazy-media[data-live]');assert(await live.count()>0,'Home does not consume canonical snapshot/intraday artwork');const invalid=await live.evaluateAll(nodes=>nodes.filter(n=>!['LIVE','LAST_SESSION','STALE','UNAVAILABLE'].includes(n.dataset.freshness||'')).map(n=>({symbol:n.dataset.symbol,freshness:n.dataset.freshness})));assert.deepEqual(invalid,[]);const caption=await page.locator('.v2-stock-hero .v2-stock-caption').first().innerText();assert(/Tagesverlauf|Kursverlauf|nicht verfügbar|Keine Kursreihe/i.test(caption),'Structured period/source caption is missing: '+caption);});
 }
 await check(key+' search opens traps focus and restores it',async()=>{const opener=page.locator('.v2-dock-search:visible').first();await opener.click();const input=page.locator('input[type=search]').first();await input.waitFor({state:'visible'});await input.fill('AAPL');await page.waitForFunction(()=>Array.from(document.querySelectorAll('.dx-search .dx-result')).some(n=>/Apple|AAPL/.test(n.textContent)));for(let i=0;i<12;i++){await page.keyboard.press(i<6?'Tab':'Shift+Tab');assert(await page.locator('.dx-search').evaluate(n=>n.contains(document.activeElement)),'Focus escaped search');}await screenshot(page,key+'-search');if(width===390)await check(key+' search accessibility',()=>a11y(page,key+'-search'));await page.keyboard.press('Escape');await input.waitFor({state:'hidden'});assert(await opener.evaluate(n=>n===document.activeElement),'Search opener focus not restored');});
 await page.goto(base+'/discover-v2/#/s/US_REAL/AAPL',{waitUntil:'networkidle'});await page.waitForTimeout(1000);
 await check(key+' stock identity and chart',async()=>{assert(/Apple|AAPL/.test(await page.locator('main').innerText()));assert(await page.locator('main svg').count()>0,'No visual chart');});
 await check(key+' stock overflow',async()=>{const overflow=await page.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:innerWidth,culprits:Array.from(document.querySelectorAll('main *')).map(n=>({node:n.className||n.tagName,right:n.getBoundingClientRect().right,left:n.getBoundingClientRect().left})).filter(x=>x.right>innerWidth+1||x.left<-1).slice(0,20)}));assert(overflow.page<=overflow.viewport+1,'Stock page overflows: '+JSON.stringify(overflow));});
 await screenshot(page,key+'-stock');
 await check(key+' dominant consumer chart and semantic colour',async()=>{const evidence=await page.evaluate(()=>{const svg=document.querySelector('.dx-chapter--chart svg.dx-range-chart,.dx-chapter--chart svg.dx-micro--intraday'),chapter=document.querySelector('.dx-chapter--chart'),direction=svg&&svg.getAttribute('data-direction'),color=svg&&getComputedStyle(svg).color;return {svg:svg&&svg.getBoundingClientRect().toJSON(),chapter:chapter&&chapter.getBoundingClientRect().toJSON(),viewport:{width:innerWidth,height:innerHeight},direction,color};});assert(evidence.svg,'Stock page has no primary price chart');assert(evidence.svg.width>=Math.min(330,evidence.viewport.width*.84),'Primary chart is too narrow');if(width<500)assert(evidence.svg.height>=180,'Primary mobile chart is too small: '+evidence.svg.height);if(evidence.direction==='up'){const c=(evidence.color.match(/[\d.]+/g)||[]).map(Number);assert(c[1]>c[0]&&c[1]>c[2],'Positive chart is not semantically green: '+evidence.color);}if(evidence.direction==='down'){const c=(evidence.color.match(/[\d.]+/g)||[]).map(Number);assert(c[0]>c[1]&&c[0]>c[2],'Negative chart is not semantically red: '+evidence.color);}designEvidence.push({key,type:'stock-chart',...evidence});});
 await check(key+' chart price and source visible early',async()=>{const hero=page.locator('.dx-chart-hero').first();const bounds=await hero.boundingBox();assert(bounds,'Missing chart price hero');if(width<500)assert(bounds.y<=420,'Mobile chart price starts below 420px: '+bounds.y);const text=await hero.innerText();assert(/\d/.test(text)&&/Kurs|Schluss|Stand|Heute|Handelstag/i.test(text),'Missing source/session evidence: '+text);interactionEvidence.push({key,type:'chart-hero',bounds,text});});
 await check(key+' unavailable chart ranges disabled',async()=>{const wrong=await page.locator('.dx-tf button').evaluateAll(nodes=>nodes.filter(n=>n.getAttribute('aria-disabled')==='true'&&!n.disabled).map(n=>n.textContent));assert.deepEqual(wrong,[]);assert(await page.locator('.dx-tf button').count()>0);});
 await check(key+' chart range updates evidence',async()=>{const samples=[];for(const [label,range,word] of [['1M','1M','Monat'],['1J','1Y','Jahr']]){const button=page.locator('.dx-tf').getByRole('button',{name:label,exact:true});assert(await button.isEnabled(),'AAPL range unavailable: '+label);await button.click();await page.locator('.dx-range-chart-wrap[data-range="'+range+'"]').waitFor();assert.equal(await button.getAttribute('aria-pressed'),'true');const evidence=await page.locator('.dx-chart-hero').innerText();assert(evidence.includes(word),'Range context missing: '+evidence);samples.push({label,evidence});}assert.notEqual(samples[0].evidence,samples[1].evidence,'Range data did not update');interactionEvidence.push({key,type:'chart-range',samples});});
 await check(key+' stock accessibility',()=>a11y(page,key+'-stock'));
 await check(key+' fundamental metric changes visual evidence',async()=>{const journey=page.locator('#journey');await journey.scrollIntoViewIfNeeded();const tabs=journey.getByRole('tab');assert(await tabs.count()>=2,'AAPL needs multiple canonical metrics');const first=await journey.locator('.dx-journey-kopf').innerText();const svgBefore=await journey.locator('.dx-journey-bild').innerHTML();await tabs.nth(1).click();assert.equal(await tabs.nth(1).getAttribute('aria-selected'),'true');assert.equal(await tabs.nth(0).getAttribute('aria-selected'),'false');const second=await journey.locator('.dx-journey-kopf').innerText();assert(first!==second&&svgBefore!==await journey.locator('.dx-journey-bild').innerHTML(),'Fundamental visual did not change');interactionEvidence.push({key,type:'fundamental-metric',metric:await tabs.nth(1).innerText(),before:first,after:second});await journey.evaluate(n=>n.scrollIntoView({block:'start',behavior:'instant'}));await screenshot(page,key+'-fundamentals');});
 await check(key+' stock offers onward company exploration',async()=>{
  const next=page.locator('.dv2-stock-neighbors .dx-rail a[href^="#/s/"]').first();await next.scrollIntoViewIfNeeded();
  const href=await next.getAttribute('href');assert(href&&!href.endsWith('/AAPL'),'Next stock must differ from current stock');await screenshot(page,key+'-stock-onward');await next.click();await page.waitForURL(url=>url.hash===href);await page.locator('.dx-chart-hero').first().waitFor();
  assert(await page.locator('.dv2-stock-next a[href^="#/einzeln/"]').count()>0,'Next stock has no return to discovery');interactionEvidence.push({key,type:'stock-onward',from:'AAPL',to:href});
 });
 await page.goto(base+'/discover-v2/#/einzeln/US_REAL',{waitUntil:'networkidle'});
 await check(key+' feed is bounded and swipes one screen',async()=>{
  const track=page.locator('.dx-feed-spur');await track.waitFor();
  const count=await page.locator('.dx-feed-screen[data-symbol]').count();assert(count>0&&count<=24,'Initial feed eagerly rendered '+count+' cards');
  const visible=()=>track.evaluate(n=>{const bounds=n.getBoundingClientRect();const cards=Array.from(n.querySelectorAll('.dx-feed-screen[data-symbol]')).map(card=>{const box=card.getBoundingClientRect();return {symbol:card.dataset.symbol,index:card.dataset.index,visibleHeight:Math.max(0,Math.min(box.bottom,bounds.bottom)-Math.max(box.top,bounds.top))};}).sort((a,b)=>b.visibleHeight-a.visibleHeight);return {height:n.clientHeight,viewport:innerHeight,scrollTop:n.scrollTop,card:cards[0]};});
  const before=await visible();assert(before.height>100&&before.height<=before.viewport,'Feed track is not viewport-bounded');
  const counterBefore=await page.locator('.dx-feed-zaehler').innerText();
  await track.evaluate(n=>{n.scrollTop=n.clientHeight;});await waitCounter(page,2);
  const after=await visible(),counterAfter=await page.locator('.dx-feed-zaehler').innerText();
  assert(after.scrollTop>0,'Feed did not scroll');assert.notEqual(after.card.symbol,before.card.symbol,'Visible stock did not change');assert.equal(after.card.index,'1','One screen scroll did not reach second stock');assert.notEqual(counterAfter,counterBefore,'Feed counter did not follow visible stock');assert(/^2 von /i.test(counterAfter),'Counter does not identify second stock: '+counterAfter);
  interactionEvidence.push({key,type:'feed-single-screen',initialCards:count,before,after,counterBefore,counterAfter});
  await screenshot(page,key+'-feed-second-stock');
 });
 await check(key+' feed continues beyond first batch',async()=>{await page.locator('.dx-feed-spur').waitFor();await page.locator('.dx-feed-spur').evaluate(n=>{n.scrollTop=n.scrollHeight;});await page.waitForFunction(()=>document.querySelectorAll('.dx-feed-screen[data-symbol]').length>12);const symbols=await page.locator('.dx-feed-screen[data-symbol]').evaluateAll(nodes=>nodes.map(n=>n.dataset.symbol));assert(symbols.length>12,'Feed stopped after first batch');assert.equal(symbols.length,new Set(symbols).size,'Feed contains duplicate symbols');});
 await screenshot(page,key+'-feed');
 if(width===390)await check(key+' feed accessibility',()=>a11y(page,key+'-feed'));
 const savedCounter=await page.locator('.dx-feed-zaehler').innerText(),savedStock=await visibleFeedStock(page);
 await check(key+' feed exit cleanup',async()=>{await page.locator('.dx-feed-zurueck').click();await page.locator('.v2-home').waitFor({state:'visible'});assert(!await page.locator('body').evaluate(n=>n.classList.contains('dx-feed-aktiv')||n.classList.contains('v2-feed-active')));assert.equal(await page.locator('.dx-feed').count(),0);});
 await check(key+' feed session resumes exploration',async()=>{
  await page.locator('.v2-nav-explore').click();await waitCounter(page,1);await page.locator('.v2-feed-resume').waitFor();
  const resumed=await visibleFeedStock(page);assert.equal(resumed.symbol,savedStock.symbol,'Session must resume at the same canonical company');assert.equal(resumed.index,0,'Resumed suffix must start at its first screen');assert(await page.locator('.dx-feed-screen[data-symbol]').count()<=24,'Resume eagerly mounted predecessor stocks');interactionEvidence.push({key,type:'feed-resume',savedCounter,savedStock,resumed});await page.locator('.dx-feed-zurueck').click();await page.locator('.v2-home').waitFor({state:'visible'});
 });
 if(engine==='chromium'&&width===390&&colorScheme==='dark')await check(key+' deep session resume loads a bounded canonical suffix',async()=>{
  const feed=await (await page.request.get(base+'/discover/data/feed/US_REAL.json')).json();const position=Math.min(120,feed.order.length-24);assert(position>84,'Need a genuine deep feed position');
  await page.evaluate(index=>window.VUDiscover.memory.setPosition('feed:US_REAL',index),position);
  const deep=await ctx.newPage(),requests=[];deep.on('pageerror',error=>errors.push({key:key+'-deep-resume',message:error.message}));deep.on('response',response=>{if(response.url().startsWith(base)&&response.status()>=400)bad.push({status:response.status(),url:response.url()});});deep.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/discover/data/stocks/US_REAL/'))requests.push(request.url());});
  try{await deep.goto(base+'/discover-v2/#/einzeln/US_REAL',{waitUntil:'networkidle'});await deep.locator('.v2-feed-resume').waitFor();const visible=await visibleFeedStock(deep),count=await deep.locator('.dx-feed-screen[data-symbol]').count();assert.equal(visible.symbol,feed.order[position].s);assert(count>0&&count<=24,'Deep resume mounted '+count+' stocks');assert(requests.length<=24,'Deep resume fetched '+requests.length+' stock bundles');const allowed=new Set(feed.order.slice(position,position+24).map(entry=>entry.s));assert(requests.every(url=>allowed.has(decodeURIComponent(new URL(url).pathname.split('/').at(-1).replace(/\.json$/,'')))),'Deep resume requested predecessor or unrelated stocks');interactionEvidence.push({key,type:'deep-feed-resume',position,visible,mounted:count,stockRequests:requests.length});await screenshot(deep,key+'-feed-deep-resume');await deep.locator('.v2-feed-restart').click();await deep.locator('.v2-feed-resume').waitFor({state:'hidden'});await waitCounter(deep,1);assert.equal((await visibleFeedStock(deep)).symbol,feed.order[0].s,'Restart did not restore the canonical beginning');}finally{await deep.close();}
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
  const surfaces=await page.locator('.v2-journey > :not(.v2-finish)').evaluateAll(nodes=>nodes.map(n=>({id:n.getAttribute('data-surface'),archetype:n.getAttribute('data-archetype'),className:n.className,title:n.querySelector('h2')?.textContent||''})));
  assert(surfaces.length>=30,'Discovery journey is prematurely short');assert.equal(surfaces.length,expected,'Not every canonical surface was rendered');
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
