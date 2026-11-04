/* Local, read-only browser gate. Output must be outside production data. */
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const auditContract=require('./academy-audit-contract.cjs');
const root=fileURLToPath(new URL('../../../',import.meta.url)), out=resolve(process.argv[process.argv.indexOf('--out')+1]||'/tmp/academy-qa');
if(!process.argv.includes('--out'))throw Error('Pass --out DIR');
const siteIndex=process.argv.indexOf('--site');
const site=siteIndex>=0 ? String(process.argv[siteIndex+1]||'').replace(/\/$/,'') : null;
if(siteIndex>=0 && site!=='https://research.visionuniverse.de')throw Error('LIVE_SITE_NOT_ALLOWED');
let gate=null;
if(site){
 const response=await fetch(site+'/__research/config.json');
 if(response.ok){
  if(!process.env.RESEARCH_ACCESS_PASSWORD)throw Error('NO_AUTHORIZED_TEST_ACCESS');
  const {accessStateFor,STORAGE_KEY}=await import('../../access-gate/build.mjs');
  gate={key:STORAGE_KEY,value:JSON.stringify(accessStateFor(process.env.RESEARCH_ACCESS_PASSWORD))};
 }else if(response.status!==404)throw Error('ACCESS_CONFIGURATION_UNAVAILABLE');
}
const content=JSON.parse(await readFile(root+'technical/academy/content.json','utf8'));
const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.gz':'application/gzip','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{try{let p=decodeURIComponent(new URL(req.url,'http://x').pathname);if(p.endsWith('/'))p+='index.html';const f=resolve(root,'.'+p);if(!f.startsWith(root))throw Error('path');res.setHeader('content-type',types[extname(f)]||'application/octet-stream');res.end(await readFile(f));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));await mkdir(out,{recursive:true});
const base=site ? site+'/technical/' : 'http://127.0.0.1:'+server.address().port+'/technical/',browser=await chromium.launch(),results=[],journeys=[],performanceChecks=[],visualCoverage=[];
async function createContext(options){
 const context=await browser.newContext(options);
 if(gate)await context.addInitScript(([key,value,origin])=>{if(location.origin===origin){try{localStorage.setItem(key,value);}catch(_){}}},[gate.key,gate.value,new URL(site).origin]);
 return context;
}
const assert=(x,msg)=>{if(!x)throw Error(msg);};
async function check(name,fn){try{await fn();results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.message});}}
try{
if(site){const response=await fetch(site+'/technical/academy/content.json');assert(response.ok,'PUBLISHED_ACADEMY_NOT_READY');assert(JSON.stringify(await response.json())===JSON.stringify(content),'PUBLISHED_CONTENT_DIFFERS_FROM_REVIEWED_SOURCE');}
for(const width of [360,390,1280])for(const theme of ['light','dark']){
 const context=await createContext({viewport:{width,height:844},deviceScaleFactor:1,isMobile:width<500,hasTouch:width<500});
 await context.addInitScript(t=>localStorage.setItem('vu-discover-theme-v1',t),theme);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const prefix=width+'-'+theme;
 async function overflow(){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow');}
 await check(prefix+' central Academy single strategy entry',async()=>{
  await page.goto(base.replace('/technical/','/academy/'));await page.locator('.vu-a-world-card').first().waitFor();
  assert(await page.locator('.vu-a-world-card').count()===11,'11 existing worlds');
  assert(await page.evaluate(()=>document.documentElement.dataset.theme)===theme,'entry theme follows preference');
  const entry=page.locator('a.vu-a-world-card[href="/technical/#/akademie"]');assert(await entry.count()===1,'single strategy world link');
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const ax=await page.evaluate(()=>axe.run(document.querySelector('a.vu-a-world-card[href="/technical/#/akademie"]'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));assert(!ax.violations.length,ax.violations.map(x=>x.id).join(','));
  const pilotContrast=await page.evaluate(()=>axe.run(document.querySelector('.vu-a-pilot'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));assert(!pilotContrast.violations.length,pilotContrast.violations.map(x=>x.id).join(','));
  const questionContrast=await page.locator('#questions-mount a',{hasText:'Wie lese ich einen Chart'}).evaluate(n=>axe.run(n,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));assert(!questionContrast.violations.length,questionContrast.violations.map(x=>x.id).join(','));
  await entry.focus();await page.keyboard.press('Enter');await page.getByRole('heading',{name:'Strategie-Akademie',exact:true}).waitFor();
  await page.getByRole('link',{name:'← Vision Universe Academy',exact:true}).click();await entry.waitFor();
  await page.screenshot({path:out+'/'+prefix+'-central-academy.png',fullPage:true});
  await page.locator('#questions-mount a',{hasText:'Wie lese ich einen Chart'}).click();await page.locator('.ta-paths section').first().waitFor();
 });
 await check(prefix+' catalog/navigation',async()=>{await page.goto(base+'#/akademie');await page.getByRole('heading',{name:'Strategie-Akademie',exact:true}).waitFor();assert(await page.locator('.ta-paths section').count()===8,'8 paths');assert(await page.locator('.ta-paths li').count()===32,'32 lessons');await overflow();await page.screenshot({path:out+'/'+prefix+'-katalog.png',fullPage:true});});
 await check(prefix+' all 32 lessons',async()=>{
  for(const l of content.lessons){await page.goto(base+'#/akademie/'+l.id);await page.getByRole('heading',{name:l.title,exact:true}).waitFor();assert(await page.locator('.ta h2').count()===8,'complete sections '+l.id);assert(await page.locator('figure').count()===1,'visual');assert(await page.locator('input[type=radio]').count()===2,'answers');await overflow();}
 });
 await check(prefix+' all 32 visual lessons: scenes, keyboard, accessibility, quiz and progress',async()=>{
  for(const id of content.lessons.map(l=>l.id)){
   const l=content.lessons.find(x=>x.id===id);
   await page.goto(base+'#/akademie/'+id);await page.locator('.ta-pilot').waitFor();
   const buttons=page.getByRole('group',{name:'Chart-Beispiele'}).getByRole('button');assert(await buttons.count()===3,'three scenes '+id);
   await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
   for(let i=0;i<3;i++){
    await buttons.nth(i).focus();await page.keyboard.press('Enter');
    assert(await buttons.nth(i).getAttribute('aria-pressed')==='true','selected scene');
    assert(await buttons.evaluateAll(bs=>bs.filter(b=>b.getAttribute('aria-pressed')==='true').length)===1,'single selected scene');
    assert(await page.locator('.ta-chart svg desc').textContent()===l.presentation.scenes[i].description,'chart text equivalent');
    assert(await page.locator('.ta-observations h3').textContent()===l.presentation.scenes[i].title,'scene meaning');
    assert(await page.locator('.ta-chart figcaption').textContent().then(t=>t.includes('keine historischen Marktdaten')),'constructed chart label');
    assert(await buttons.nth(i).evaluate(b=>b===document.activeElement),'keyboard focus retained');
    await overflow();
    const ax=await page.evaluate(()=>axe.run(document.querySelector('.ta-pilot'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
    assert(!ax.violations.length,id+'/'+i+': '+ax.violations.map(v=>v.id+' '+v.nodes.map(n=>n.target).join(',')).join(';'));
    const bounds=await page.locator('.ta-chart svg').evaluate(svg=>Array.from(svg.querySelectorAll('text,path,rect,circle,line')).map(n=>{const b=n.getBBox();return {x:b.x,y:b.y,w:b.width,h:b.height};}));
    assert(bounds.every(b=>b.x>=0&&b.y>=0&&b.x+b.w<=361&&b.y+b.h<=271),'diagram clipped '+id+'/'+i);
    if(width===390&&i===0 || width===390&&theme==='light'&&i===2 || (width===360||width===1280)&&id.endsWith('-1')&&i===0){
     await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:out+'/'+prefix+'-'+id+'-scene-'+(i+1)+'.png',fullPage:true});
     if(i===0)await page.screenshot({path:out+'/'+prefix+'-'+id+'-hero.png'});
    }
   }
   const wrong=l.quiz.choices.find(x=>x.id!==l.quiz.answer).id;
   await page.locator('input[value='+wrong+']').check();await page.getByRole('button',{name:'Antwort prüfen'}).click();await page.getByRole('status').filter({hasText:'Noch nicht richtig.'}).waitFor();
   await page.locator('input[value='+l.quiz.answer+']').check();await page.getByRole('button',{name:'Antwort prüfen'}).click();await page.getByRole('status').filter({hasText:'Richtig.'}).waitFor();
   const mark=page.locator('.ta-pilot > button[aria-pressed]'),wasDone=await mark.getAttribute('aria-pressed')==='true';
   if(!wasDone)await mark.click();await page.reload();await page.locator('.ta-pilot').waitFor();
   assert(await page.locator('.ta-pilot > button[aria-pressed]').getAttribute('aria-pressed')==='true','progress persisted '+id);
   await page.locator('a[data-practice]').click();await page.getByRole('navigation',{name:'Zur Akademie zurück',exact:true}).waitFor();await page.reload();
   await page.getByRole('link',{name:'← Zur Lektion: '+l.title,exact:true}).click();await page.locator('.ta-pilot').waitFor();
   const secondary=await page.locator('.ta-practice-links a').evaluateAll(ns=>ns.map(n=>n.getAttribute('href')));
   for(const href of secondary){
    await page.locator('.ta-practice-links a[href="'+href+'"]').click();
    await page.getByRole('navigation',{name:'Zur Akademie zurück',exact:true}).waitFor();assert(await page.evaluate(()=>location.hash)===href,'secondary route '+id);
    await page.getByRole('link',{name:'← Zur Lektion: '+l.title,exact:true}).click();await page.locator('.ta-pilot').waitFor();
   }
   if(!wasDone)await page.locator('.ta-pilot > button[aria-pressed]').click();
   assert(await page.locator('input[value='+l.quiz.answer+']').isChecked(),'quiz resume '+id);
   assert(await page.locator('.ta-scenes button[aria-pressed=true]').getAttribute('data-scene')===l.presentation.scenes[2].id,'scene resume '+id);
   visualCoverage.push({width,theme,lesson:id,scenes:3,axeRuns:3,quiz:true,progress:true,practiceReturn:true,secondaryLinks:secondary.length});
  }
 });
 await check(prefix+' all 32 lessons: touch targets and doubled text',async()=>{
  for(const id of content.lessons.map(l=>l.id)){
   await page.goto(base+'#/akademie/'+id);await page.locator('.ta-pilot').waitFor();
   const targets=await page.locator('.ta-scenes button, .ta-primary').evaluateAll(ns=>ns.map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height})));
   assert(targets.every(t=>t.w>=44&&t.h>=44),'44px touch targets '+id);
   await page.addStyleTag({content:'.ta-pilot h1,.ta-pilot h2,.ta-pilot h3,.ta-pilot p,.ta-pilot li,.ta-pilot summary,.ta-pilot button,.ta-pilot label,.ta-pilot a {font-size:200% !important}'});
   await page.getByRole('group',{name:'Chart-Beispiele'}).getByRole('button').last().click();
   await overflow();
   assert(await page.locator('.ta-scenes button').last().evaluate(n=>n.scrollWidth<=n.clientWidth+1),'zoomed scene label fits');
   if(width===360&&id.endsWith('-1'))await page.screenshot({path:out+'/'+prefix+'-'+id+'-double-text.png',fullPage:true});
  }
 });
 await check(prefix+' quiz/progress/keyboard/practice',async()=>{
  await page.goto(base+'#/akademie/struktur-1');await page.locator('fieldset').waitFor();await page.locator('input[value=b]').check();await page.getByRole('button',{name:'Antwort prüfen'}).click();await page.getByRole('status').filter({hasText:'Noch nicht richtig'}).waitFor();
  await page.locator('input[value=a]').check();await page.getByRole('button',{name:'Antwort prüfen'}).click();await page.getByRole('status').filter({hasText:'Richtig.'}).waitFor();
  await page.locator('input[value=b]').check();await page.getByRole('status').filter({hasText:'Antwort geändert'}).waitFor();await page.locator('input[value=a]').check();await page.getByRole('button',{name:'Antwort prüfen'}).click();
  const mark=page.getByRole('button',{name:'Lektion als abgeschlossen markieren'});await mark.focus();await page.keyboard.press('Enter');assert(await page.getByRole('button',{name:'Abschluss aufheben'}).getAttribute('aria-pressed')==='true','keyboard mark');
  await page.reload();await page.getByRole('button',{name:'Abschluss aufheben'}).waitFor();await page.screenshot({path:out+'/'+prefix+'-lektion.png',fullPage:true});
  await page.getByRole('link',{name:'Chart Studio öffnen und Titel wählen'}).click();await page.getByRole('heading',{name:'Chart Studio',exact:true}).waitFor();
  await page.getByRole('link',{name:'← Zur Lektion: Aufbau einer Kurskerze',exact:true}).click();
  await page.locator('fieldset').waitFor();assert(await page.locator('input[value=a]').isChecked(),'answer restored');await page.getByRole('status').filter({hasText:'Richtig.'}).waitFor();
  await page.waitForFunction(()=>scrollY>0,{},{timeout:5000});
  await page.locator('a[data-practice]').click();await page.reload();await page.getByRole('link',{name:'← Zur Lektion: Aufbau einer Kurskerze',exact:true}).click();await page.locator('fieldset').waitFor();assert(await page.locator('input[value=a]').isChecked(),'answer restored after practice reload');
  await page.goto(base+'#/akademie/trend-4');await page.getByRole('link',{name:'Etablierte Trendvorlage öffnen'}).click();await page.getByRole('heading',{name:'Etablierter Aufwärtstrend',exact:true}).waitFor();
  await page.goto(base+'#/akademie/routine-1');await page.getByRole('link',{name:'Analyseziel im Assistenten wählen'}).click();await page.getByRole('heading',{name:'Analyse-Assistent',exact:true}).waitFor();
 });
 await check(prefix+' 32 semantic practice routes and return',async()=>{
  for(const l of content.lessons){
   await page.goto(base+'#/akademie/'+l.id);await page.locator('a[data-practice]').waitFor();
   const group=['struktur','trend','breakout','momentum','risiko','wechsel','zeitrahmen','routine'].indexOf(l.pathId);
   const expected=auditContract.targetGroups[group][Number(l.id.split('-')[1])-1];
   assert(await page.locator('a[data-practice]').getAttribute('href')===auditContract.targets[expected],'semantic href '+l.id);
   assert(await page.locator('.ta-pilot .ta-basics > p, .ta:not(.ta-pilot) p').first().evaluate(n=>parseFloat(getComputedStyle(n).fontSize))>=16,'lesson text font size');
   const box=await page.locator('label').first().boundingBox();assert(box.height>=44,'touch label');
   const button=await page.getByRole('button',{name:'Antwort prüfen'}).boundingBox();assert(button.height>=44,'touch button');
   await page.locator('a[data-practice]').click();await page.getByRole('navigation',{name:'Zur Akademie zurück',exact:true}).waitFor();
   assert(await page.evaluate(()=>location.hash)===auditContract.targets[expected],'arrived '+l.id);
   assert(await page.locator('#tc-main h1').count()===1,'destination heading exists '+l.id);
   assert(!await page.getByText('Seite nicht gefunden',{exact:true}).count(),'not found '+l.id);
   await page.getByRole('link',{name:'← Zur Lektion: '+l.title,exact:true}).click();await page.getByRole('heading',{name:l.title,exact:true}).waitFor();
   await overflow();
  }
 });
 await check(prefix+' axe accessibility on shared lesson types',async()=>{
  for(const id of ['', '/struktur-1', '/momentum-3', '/risiko-2', '/risiko-4']){
   await page.goto(base+'#/akademie'+id);await page.locator('.ta h1').waitFor();
   await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
   if(width===390 && ['/momentum-3','/risiko-2','/risiko-4'].includes(id))await page.screenshot({path:out+'/'+prefix+id.replace('/','-')+'.png',fullPage:true});
   const report=await page.evaluate(()=>axe.run(document.querySelector('.ta'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
   assert(!report.violations.length,id+': '+report.violations.map(v=>v.id+' '+v.nodes.map(n=>n.target).join(', ')).join('; '));
  }
 });
 await check(prefix+' glossary/not-found/errors',async()=>{
  await page.goto(base+'#/akademie/glossar');await page.getByRole('heading',{name:'Glossar',exact:true}).waitFor();assert(await page.locator('.ta section').count()===content.glossary.length,'glossary');await overflow();
  await page.goto(base+'#/akademie/missing');await page.getByRole('heading',{name:'Lektion nicht gefunden'}).waitFor();assert(!errors.length,errors.join('\n').slice(0,600));
 });
 await check(prefix+' keyboard/empty answer/next previous/glossary/reset',async()=>{
  await page.goto(base+'#/akademie/risiko-2');await page.locator('fieldset').waitFor();await page.getByRole('button',{name:'Antwort prüfen'}).click();assert(await page.locator('input:invalid').count()>0,'empty answer prevented');
  await page.locator('input[type=radio]').first().focus();await page.keyboard.press('Space');assert(await page.locator('input:checked').count()===1,'keyboard radio');
  await page.locator('.ta-basics > details > summary').click();const term=page.locator('.ta-terms summary').first();await term.focus();await page.keyboard.press('Enter');assert(await term.evaluate(n=>n.parentElement.open),'keyboard glossary');
  await page.getByRole('link',{name:'Nächste Lektion →',exact:true}).click();await page.getByRole('heading',{name:'Bollinger-Bänder',exact:true}).waitFor();await page.getByRole('link',{name:'← Vorherige Lektion',exact:true}).click();await page.getByRole('heading',{name:'ATR',exact:true}).waitFor();
  await page.goto(base+'#/akademie');await page.getByRole('heading',{name:'Strategie-Akademie',exact:true}).waitFor();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Lokalen Fortschritt zurücksetzen'}).click();await page.getByRole('status').filter({hasText:'0 von 32'}).waitFor();assert(await page.getByRole('button',{name:'Lokalen Fortschritt zurücksetzen'}).evaluate(n=>n===document.activeElement),'reset retains focus');
 });
 for(const id of ['trend-1','momentum-1','zeitrahmen-1'])await check(prefix+' complete user journey '+id,async()=>{
  const l=content.lessons.find(x=>x.id===id),path=content.paths.find(p=>p.id===l.pathId);
  await page.goto(base.replace('/technical/','/academy/'));await page.locator('a.vu-a-world-card[href="/technical/#/akademie"]').click();
  await page.locator('.ta-paths section').filter({has:page.getByRole('heading',{name:path.title,exact:true})}).getByRole('link',{name:l.title,exact:true}).click();
  await page.locator('fieldset').waitFor();const expected=Object.entries(auditContract.answers).find(([key])=>key===id)[1];await page.getByLabel(expected,{exact:true}).check();await page.getByRole('button',{name:'Antwort prüfen'}).click();await page.getByRole('status').filter({hasText:'Richtig.'}).waitFor();
  await page.locator('a[data-practice]').click();await page.locator('.tc-hit .tc-ticks').first().waitFor();
  const goal=await page.locator('#tc-main h1').innerText();
  await page.locator('a',{hasText:'Im Screener bearbeiten'}).click();await page.locator('.tc-cta').waitFor();const matches=await page.locator('.tc-cta').innerText();await page.locator('.tc-cta').click();
  await page.locator('.tc-hits .tc-hit').first().click();await page.locator('.tc-chart svg').first().waitFor();const chart=await page.evaluate(()=>location.hash);
  if(width===390)await page.screenshot({path:out+'/'+prefix+'-'+id+'-practice.png',fullPage:true});
  await page.getByRole('link',{name:'← Zur Lektion: '+l.title,exact:true}).click();await page.locator('fieldset').waitFor();assert(await page.getByLabel(expected,{exact:true}).isChecked(),'quiz restored after analysis');await page.getByRole('status').filter({hasText:'Richtig.'}).waitFor();
  await page.getByRole('button',{name:'Lektion als abgeschlossen markieren',exact:true}).click();await page.reload();await page.getByRole('button',{name:'Abschluss aufheben',exact:true}).waitFor();
  if(width===390){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{scrollTo(0,0);resolve();}))));await page.waitForFunction(()=>scrollY===0);await page.screenshot({path:out+'/'+prefix+'-'+id+'-completed.png',fullPage:true});}
  await page.getByRole('link',{name:'← Alle Lernpfade',exact:true}).click();await page.getByRole('status').filter({hasText:'von 32 Lektionen abgeschlossen'}).waitFor();const progress=await page.getByRole('status').filter({hasText:'von 32 Lektionen abgeschlossen'}).innerText();
  assert(await page.getByRole('link',{name:l.title+' · abgeschlossen',exact:true}).count()===1,'catalog shows completed lesson');
  journeys.push({width,theme,lesson:id,path:path.title,goal,matches,chart,progress,pass:true});
 });
 await context.close();
}
if(!site)await check('central Academy registry failure and retry',async()=>{
 const context=await createContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/academy/data/experiences.json',r=>r.abort());await page.goto(base.replace('/technical/','/academy/'));await page.locator('.vu-a-error').waitFor();
 await page.unroute('**/academy/data/experiences.json');await page.route('**/academy/data/experiences.json',r=>r.fulfill({json:{}}));await page.getByRole('button',{name:'Neu laden',exact:true}).click();await page.locator('.vu-a-error').waitFor();
 await page.unroute('**/academy/data/experiences.json');await page.getByRole('button',{name:'Neu laden',exact:true}).click();await page.locator('a.vu-a-world-card[href="/technical/#/akademie"]').waitFor();assert(!errors.length,errors.join(';'));await context.close();
});
if(!site)await check('cold Academy loading with mobile network and CPU profile',async()=>{
 for(const route of ['/academy/','/technical/#/akademie','/technical/#/akademie/trend-1']){
  const context=await createContext({viewport:{width:390,height:844}}),page=await context.newPage(),cdp=await context.newCDPSession(page);
  await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:90000});await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  let contentRequests=0;page.on('request',r=>{if(r.url().endsWith('/technical/academy/content.json'))contentRequests++;});const start=Date.now();await page.goto(base.replace('/technical/','')+route,{waitUntil:'domcontentloaded'});
  if(route==='/academy/')await page.locator('a.vu-a-world-card[href="/technical/#/akademie"]').waitFor();else if(route.endsWith('trend-1'))await page.locator('fieldset').waitFor();else await page.locator('.ta-paths section').first().waitFor();
  const ms=Date.now()-start;assert(ms<15000,'cold load exceeds 15s failure ceiling');assert(contentRequests<2,'duplicate lesson payload');performanceChecks.push({route,ms,contentRequests,profile:'390px, CPU x4, 150ms latency, 1.6Mbit/s, empty cache',ceilingMs:15000});await context.close();
 }
});
await check('real chart analysis and screener handoff retain academy return',async()=>{
 const context=await createContext({viewport:{width:390,height:844}}),page=await context.newPage();
 await page.goto(base+'#/akademie/momentum-2');await page.locator('a[data-practice]').click();await page.getByRole('heading',{name:'Chart Studio',exact:true}).waitFor();
 await page.evaluate(()=>location.hash='#/chart/NVDA');const rsi=page.getByRole('button',{name:'RSI',exact:true});await rsi.waitFor();if(await rsi.getAttribute('aria-pressed')!=='true')await rsi.click();assert(await rsi.getAttribute('aria-pressed')==='true','RSI enabled');
 await page.getByRole('link',{name:'← Zur Lektion: RSI',exact:true}).click();await page.getByRole('heading',{name:'RSI',exact:true}).waitFor();
 await page.evaluate(()=>{dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});await page.locator('input[value=a]').check();await page.getByRole('button',{name:'Antwort prüfen'}).click();await page.getByRole('status').filter({hasText:'Richtig.'}).waitFor();
 await page.goto(base+'#/akademie/routine-2');await page.locator('a[data-practice]').click();await page.getByRole('heading',{name:'Kriterien kombinieren',exact:true}).waitFor();
 await page.locator('a',{hasText:'Im Screener bearbeiten'}).click();await page.locator('.tc-builder').waitFor();await page.getByRole('link',{name:'← Zur Lektion: Filter kombinieren',exact:true}).click();await page.getByRole('heading',{name:'Filter kombinieren',exact:true}).waitFor();await context.close();
});
if(!site)await check('blocked storage / safe text / load retry',async()=>{
 const context=await createContext();await context.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw Error('blocked');}});});const page=await context.newPage();
 await page.route('**/technical/academy/content.json',r=>r.abort());await page.goto(base+'#/akademie/struktur-1');await page.getByRole('button',{name:'Erneut versuchen'}).waitFor();
 await page.unroute('**/technical/academy/content.json');await page.route('**/technical/academy/content.json',r=>r.fulfill({json:{paths:[],lessons:[],glossary:[]}}));await page.getByRole('button',{name:'Erneut versuchen'}).click();await page.getByRole('button',{name:'Erneut versuchen'}).waitFor();await page.unroute('**/technical/academy/content.json');await page.route('**/technical/academy/content.json',r=>{const c=structuredClone(content);c.lessons[0].foundations[0]='<img src=x onerror="window.academyInjection=true">';return r.fulfill({json:c});});await page.getByRole('button',{name:'Erneut versuchen'}).click();await page.getByRole('button',{name:'Lektion als abgeschlossen markieren'}).click();await page.getByRole('status').filter({hasText:'Speichern ist gesperrt'}).waitFor();assert(await page.locator('.ta img').count()===0,'injected image');assert(await page.evaluate(()=>!window.academyInjection),'injected execution');await context.close();
});
if(!site)await check('presentation failures fall back and graphic/text payloads never execute',async()=>{
 const context=await createContext({viewport:{width:360,height:844}}),page=await context.newPage();
 for(const mode of ['missing-scene','unsafe-graphic','wrong-topic','literal-text']){
  await page.route('**/technical/academy/content.json',r=>{const c=structuredClone(content),p=c.lessons[0].presentation;
   if(mode==='missing-scene')p.scenes[0]=null;
   else if(mode==='unsafe-graphic')p.scenes[0].graphic=[{op:'image',href:'javascript:window.pilotInjection=true'}];
   else if(mode==='wrong-topic')p.topic='zeitrahmen-1';
   else{p.intro='<img src=x onerror="window.pilotInjection=true">';p.scenes[0].graphic[0].text=p.intro;}
   return r.fulfill({json:c});});
  await page.goto(base+'#/akademie/struktur-1');await page.locator('fieldset').waitFor();
  assert(await page.locator('.ta-pilot').count()===(mode==='literal-text'?1:0),'invalid optional presentation fallback '+mode);
  assert(await page.locator('.ta img, .ta image').count()===0,'no markup inserted');assert(await page.evaluate(()=>!window.pilotInjection),'no content execution');
  if(mode==='literal-text')assert(await page.locator('.ta-basics').textContent().then(t=>t.includes('<img')),'untrusted text remains literal');
  await page.unroute('**/technical/academy/content.json');await page.goto('about:blank');
 }
 await context.close();
});
await check('complete visual coverage: 32 lessons, 96 scenes in all six viewport/theme combinations',async()=>{
 assert(visualCoverage.length===192,'missing full lesson coverage '+visualCoverage.length);
 assert(new Set(visualCoverage.map(x=>x.width+'-'+x.theme+'-'+x.lesson)).size===192,'duplicate lesson coverage');
 assert(visualCoverage.reduce((n,x)=>n+x.scenes,0)===576,'all scenes covered');
});
}finally{await browser.close();server.close();}
await writeFile(out+'/report.json',JSON.stringify({mode:site?'live':'local',site,authenticated:!!gate,localOnlyChecks:site?['registry failure injection','cold network profile','blocked storage and hostile payload injection','presentation failure injection']:[],results,journeys,performanceChecks,visualCoverage},null,2));console.log(JSON.stringify({passed:results.filter(r=>r.pass).length,total:results.length,failures:results.filter(r=>!r.pass)},null,2));if(results.some(r=>!r.pass))process.exitCode=1;
