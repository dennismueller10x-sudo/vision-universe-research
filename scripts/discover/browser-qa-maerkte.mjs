#!/usr/bin/env node
// Browser-QA der Maerkte-Seite (#/maerkte) gegen eine echte Seite - keine
// Attrappen, keine abgefangenen Daten. Prueft, was der Nutzer sieht:
// Gruppen je Assetklasse, Tracker-Kennzeichnung (nie Indexpunkte), echter
// Nikkei-Index, Krypto 24/7, Renditen/Leitzinsen in bp ohne Kursfarbe,
// Einheiten je Barrel/MMBtu/Unze, kein Querlauf auf dem Telefon.
// Markets 2.0: dazu Markt jetzt, Market Pulse, Movers, klickbare Karten und die
// Marktdetails (#/maerkte/<SYMBOL>) - Tracker-Wahrheit, Einheiten, Zeitraeume,
// kein falsches Live, Deep Link, Zurueck. Breiten 320/390/1440, hell/dunkel.
// Usage: node scripts/discover/browser-qa-maerkte.mjs --url https://research.visionuniverse.de --out /tmp/maerkte-qa [--engine webkit]
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
let playwright;
try{playwright=require('playwright');}catch{playwright=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');}
const arg=(key,otherwise)=>{const i=process.argv.indexOf('--'+key);return i<0?otherwise:process.argv[i+1];};
const base=arg('url','http://127.0.0.1:8765').replace(/\/$/,'');
const out=arg('out','/tmp/maerkte-qa');await mkdir(out,{recursive:true});
const engine=arg('engine','chromium');if(!['chromium','webkit'].includes(engine))throw Error('engine');

const GRUPPEN=['aktien','energie','edelmetalle','krypto','us-renditen','eu-renditen','leitzinsen','devisen'];
const PFLICHT={
 aktien:['QQQ','SPY','DIA','N225'],energie:['WTI','BRENT','NATGAS'],edelmetalle:['XAUUSD','XAGUSD','XPTUSD','XPDUSD'],
 krypto:['BTCUSD','ETHUSD','SOLUSD','XRPUSD'],'us-renditen':['US2Y','US5Y','US10Y','US30Y'],'eu-renditen':['DE2Y','DE10Y','DE30Y'],
 leitzinsen:['FED_TARGET','US_EFFR','ECB_DFR'],devisen:['EURUSD']
};
const TRACKER={QQQ:'Nasdaq 100',SPY:'S&P 500',DIA:'Dow Jones'};

const checks=[];
function check(name,pass,detail){checks.push({name,pass:!!pass,detail:detail===undefined?null:detail});}

const browser=await playwright[engine].launch({headless:true,...(engine==='chromium'?{executablePath:process.env.CHROMIUM_PATH||undefined}:{})});
const evidence={};
for(const [key,viewport] of [['mobile',{width:390,height:844}],['desktop',{width:1280,height:900}]]){
 const page=await browser.newPage({viewport});
 const pageErrors=[];page.on('pageerror',e=>pageErrors.push(String(e)));
 await page.goto(base+'/discover/#/maerkte',{waitUntil:'networkidle'});
 await page.waitForSelector('.dx-maerkte .dx-markt-karte',{timeout:30000});
 const seite=await page.evaluate(()=>{
  const t=(n,s)=>{const x=n.querySelector(s);return x?x.textContent.trim():null;};
  return {
   gruppen:[...document.querySelectorAll('.dx-maerkte-gruppe')].map(g=>({id:g.id.replace(/^maerkte-/,''),titel:t(g,'h2'),
    karten:[...g.querySelectorAll('.dx-markt-karte')].map(k=>({symbol:k.dataset.instrument,assetClass:k.dataset.assetClass,proxy:k.dataset.proxy,
     quoteState:k.dataset.quoteState,freshness:k.dataset.freshness,unit:k.dataset.unit,klasse:t(k,'.dx-markt-klasse'),titel:t(k,'h3'),
     wert:t(k,'.dx-markt-wert'),veraenderung:t(k,'.dx-markt-veraenderung b'),
     richtung:(k.querySelector('.dx-markt-veraenderung')||{className:''}).className.replace('dx-markt-veraenderung','').trim(),
     zustand:t(k,'.dx-markt-zustand'),semantik:t(k,'.dx-markt-semantik'),quelle:t(k,'.dx-markt-quelle')}))})),
   sprung:[...document.querySelectorAll('.dx-maerkte-sprung')].map(b=>b.textContent.trim()),
   querlauf:document.documentElement.scrollWidth>window.innerWidth,
   datenstand:t(document,'.dx-maerkte-stand')
  };
 });
 evidence[key]={...seite,pageErrors};
 const karten=Object.fromEntries(seite.gruppen.flatMap(g=>g.karten.map(k=>[k.symbol,{...k,gruppe:g.id}])));
 const p=(n,ok,d)=>check(key+': '+n,ok,d);

 p('Gruppen in der Reihenfolge der Owner-Liste',JSON.stringify(seite.gruppen.map(g=>g.id))===JSON.stringify(GRUPPEN),seite.gruppen.map(g=>g.id));
 p('Sprungleiste je Gruppe',seite.sprung.length===seite.gruppen.length,seite.sprung);
 for(const [gruppe,syms] of Object.entries(PFLICHT))for(const s of syms){
  const k=karten[s];
  p(s+' in '+gruppe+' mit Wert',k&&k.gruppe===gruppe&&k.quoteState==='AVAILABLE'&&!!k.wert,k?{gruppe:k.gruppe,state:k.quoteState,wert:k.wert,frische:k.freshness}:'fehlt');
 }
 for(const [s,markt] of Object.entries(TRACKER)){
  const k=karten[s]||{};
  p(s+' als Tracker gekennzeichnet',k.assetClass==='ETF'&&k.proxy==='tracker'&&k.klasse&&k.klasse.toLowerCase()===('tracker · '+s).toLowerCase()&&k.titel===markt,{klasse:k.klasse,titel:k.titel,proxy:k.proxy});
  p(s+' nie als Indexpunkte',k.wert&&!/Pkt|Punkte/.test(k.wert)&&/%$/.test(k.veraenderung||''),{wert:k.wert,veraenderung:k.veraenderung});
  p(s+' Offenlegung sichtbar',/nicht der offizielle Indexstand/.test(k.semantik||''),k.semantik);
 }
 const n225=karten.N225||{};
 p('Nikkei 225 als echter Index in Punkten',n225.assetClass==='INDEX'&&/Pkt\.$/.test(n225.wert||'')&&n225.proxy==='none',{wert:n225.wert,assetClass:n225.assetClass});
 for(const s of PFLICHT.krypto){const k=karten[s]||{};p(s+' 24/7 ohne Boersensitzung',/24\/7/.test(k.zustand||'')&&!/Sitzung|Börse/.test(k.zustand||''),k.zustand);}
 for(const s of [...PFLICHT['us-renditen'],...PFLICHT['eu-renditen'],...PFLICHT.leitzinsen]){
  const k=karten[s]||{};
  p(s+' Prozent, bp, keine Kursfarbe',/%$/.test(k.wert||'')&&!/[€$]/.test(k.wert||'')&&/ bp$/.test(k.veraenderung||'')&&k.richtung==='is-neutral',{wert:k.wert,veraenderung:k.veraenderung,richtung:k.richtung});
 }
 for(const [s,einheit] of [['WTI','/bbl'],['BRENT','/bbl'],['NATGAS','/MMBtu'],['XAUUSD','/oz'],['XAGUSD','/oz'],['XPTUSD','/oz'],['XPDUSD','/oz']]){
  const k=karten[s]||{};p(s+' Einheit '+einheit,(k.wert||'').endsWith(einheit),k.wert);
 }
 const fx=karten.EURUSD||{};p('EUR/USD als Kurs, nicht umgerechnet',/USD$/.test(fx.wert||'')&&!/€/.test(fx.wert||''),fx.wert);
 p('Keine Seitenfehler',pageErrors.length===0,pageErrors);
 if(key==='mobile')p('Kein Querlauf auf dem Telefon',!seite.querlauf,seite.querlauf);
 const intel=await page.evaluate(()=>({
  jetzt:[...document.querySelectorAll('.dx-jetzt-item')].map(a=>a.getAttribute('href')),
  headline:(document.querySelector('.dx-puls-schlagzeile')||{}).textContent||'',
  dims:[...document.querySelectorAll('.dx-puls-dim')].map(d=>d.dataset.dimension),
  puls:(document.querySelector('.dx-maerkte-puls')||{}).textContent||'',
  movers:[...document.querySelectorAll('.dx-movers-spalte a')].map(a=>a.getAttribute('href')),
  kartenLinks:[...document.querySelectorAll('a.dx-markt-karte')].map(a=>a.getAttribute('href'))
 }));
 p('Markt jetzt: 1-5 Eintraege, jeder fuehrt zum Marktdetail',intel.jetzt.length>=1&&intel.jetzt.length<=5&&intel.jetzt.every(h=>/^#\/maerkte\/[A-Z0-9_]+$/.test(h)),intel.jetzt);
 p('Market Pulse: Schlagzeile und fuenf Dimensionen',intel.headline.length>10&&JSON.stringify(intel.dims)===JSON.stringify(['TREND','BREADTH','MOMENTUM','RISK','CROSS_ASSET']),{headline:intel.headline,dims:intel.dims});
 p('Market Pulse: kein Gesamtscore, keine Prognose',!/\/100|Score \d/.test(intel.puls)&&/keine Prognose/.test(intel.puls),null);
 p('Movers verlinken auf Aktienseiten',intel.movers.length===0||intel.movers.every(h=>/^#\/s\/US_REAL\//.test(h)),intel.movers.slice(0,3));
 p('Jede Karte mit Wert ist ein Link zum Marktdetail',intel.kartenLinks.length>=28&&intel.kartenLinks.every(h=>/^#\/maerkte\//.test(h)),intel.kartenLinks.length);
 await page.screenshot({path:`${out}/maerkte-${key}.png`});
 await page.click('.dx-maerkte-sprung[data-ziel="maerkte-krypto"]');await page.waitForTimeout(900);
 await page.screenshot({path:`${out}/maerkte-${key}-krypto.png`});
 await page.close();
}
/* ------------------------------------------------ Marktdetails */
const DETAIL=['QQQ','SPY','DIA','N225','WTI','XAUUSD','BTCUSD','ETHUSD','US10Y','DE10Y','FED_TARGET','ECB_DFR','EURUSD'];
evidence.detail={};
for(const [key,viewport,scheme] of [['390-light',{width:390,height:844},'light'],['320-dark',{width:320,height:700},'dark'],['1440-light',{width:1440,height:900},'light']]){
 const page=await browser.newPage({viewport,colorScheme:scheme});
 const pageErrors=[];page.on('pageerror',e=>pageErrors.push(String(e)));
 const d=(n,ok,x)=>check(key+' detail: '+n,ok,x);
 for(const sym of (key==='390-light'?DETAIL:['QQQ','BTCUSD','US10Y','FED_TARGET'])){
  await page.goto(base+'/discover/#/maerkte/'+sym,{waitUntil:'networkidle'});
  await page.waitForSelector('.dx-md h1',{timeout:30000});
  await page.waitForFunction(()=>document.querySelector('.dx-md-chart svg')||document.querySelector('.dx-md-chart .dx-md-leer'),null,{timeout:20000}).catch(()=>null);
  const r=await page.evaluate(()=>{const t=s=>{const x=document.querySelector(s);return x?x.textContent.trim():''};
   const svg=document.querySelector('.dx-md-chart svg');
   return {eyebrow:t('.dx-md-eyebrow'),h1:t('.dx-md h1'),wert:t('.dx-md-wert'),ver:t('.dx-md-veraenderung b'),status:t('.dx-md-status'),
    frische:(document.querySelector('.dx-md-frische')||{className:''}).className,tracker:!!document.querySelector('.dx-md-tracker'),trackerText:t('.dx-md-tracker'),
    ranges:[...document.querySelectorAll('.dx-md-tf button')].map(b=>({id:b.dataset.range,disabled:b.disabled,pressed:b.getAttribute('aria-pressed')==='true'})),
    svg:!!svg,dir:svg?svg.getAttribute('data-direction'):null,fuss:t('.dx-md-chart-fuss'),back:(document.querySelector('.dx-md .dx-back')||{}).getAttribute?.('href'),
    assetClass:(document.querySelector('.dx-md')||{dataset:{}}).dataset.assetClass,querlauf:document.documentElement.scrollWidth>innerWidth};});
  evidence.detail[key+':'+sym]=r;
  const rg=Object.fromEntries(r.ranges.map(x=>[x.id,x]));
  d(sym+' Kopf mit Name, Wert, Veraenderung, Stand',r.h1&&r.wert&&r.wert!=='–'&&r.ver&&/Stand|gültig seit/.test(r.status),{h1:r.h1,wert:r.wert,ver:r.ver});
  d(sym+' Chart gezeichnet',r.svg,r.fuss);
  d(sym+' Zeitraeume 1T..MAX, einer gewaehlt',r.ranges.length===7&&r.ranges.filter(x=>x.pressed).length===1&&!rg['1Y'].disabled,r.ranges);
  d(sym+' Zurueck zu Maerkte',r.back==='#/maerkte',r.back);
  d(sym+' kein Querlauf',!r.querlauf,null);
  d(sym+' Live nur beim Tracker mit frischem Tick',!/is-live/.test(r.frische)||r.tracker,r.frische);
  if(['QQQ','SPY','DIA'].includes(sym)){
   d(sym+' Tracker-Kennzeichnung und Offenlegung',r.eyebrow.includes('Tracker · '+sym)&&r.tracker&&/nicht der offizielle Indexstand/.test(r.trackerText),r.eyebrow);
   d(sym+' Tracker nie in Punkten, Chart je Anteil',!/Pkt/.test(r.wert)&&/je Anteil/.test(r.fuss),{wert:r.wert,fuss:r.fuss});
  }
  if(sym==='N225')d('N225 echter Index in Punkten, ohne Tracker',/Pkt\.$/.test(r.wert)&&!r.tracker,r.wert);
  if(['BTCUSD','ETHUSD'].includes(sym))d(sym+' 24/7 statt Boersensitzung',/24\/7/.test(r.status)&&!/Sitzung|Börse/.test(r.status),r.status);
  if(['US10Y','DE10Y'].includes(sym))d(sym+' Rendite in %, bp, neutral, kein 1T',/%$/.test(r.wert)&&/bp$/.test(r.ver)&&r.dir==='neutral'&&rg['1D'].disabled,{wert:r.wert,ver:r.ver,dir:r.dir});
  if(['FED_TARGET','ECB_DFR'].includes(sym))d(sym+' Leitzins als Beschluss, kein 1T',/gültig seit/.test(r.status)&&/%$/.test(r.wert)&&rg['1D'].disabled&&/Beschluss/.test(r.fuss),{status:r.status,fuss:r.fuss});
  if(sym==='WTI')d('WTI Tageswert, kein 1T, kein Live, je Barrel',rg['1D'].disabled&&!/Live/.test(r.status)&&/\/bbl$/.test(r.wert),{wert:r.wert,status:r.status});
  if(sym==='XAUUSD')d('Gold je Feinunze, 5J nur mit Historie',/\/oz$/.test(r.wert)&&/Feinunze/.test(r.fuss),{wert:r.wert,fuss:r.fuss});
  if(sym==='EURUSD')d('EUR/USD als Kurs, nicht umgerechnet',/USD$/.test(r.wert)&&!/€/.test(r.wert),r.wert);
  if(key==='390-light'&&['QQQ','BTCUSD','US10Y'].includes(sym))await page.screenshot({path:`${out}/detail-${sym}-${key}.png`,fullPage:true});
 }
 d('keine Seitenfehler',pageErrors.length===0,pageErrors);
 await page.close();
}
/* Barrierefreiheit (axe, wenn installiert): keine kritischen/ernsten Verstoesse. */
{
 let axePath=null;try{axePath=require.resolve('axe-core/axe.min.js');}catch{}
 if(axePath){
  const page=await browser.newPage({viewport:{width:390,height:844}});
  for(const route of ['#/maerkte','#/maerkte/QQQ','#/maerkte/US10Y']){
   await page.goto(base+'/discover/'+route,{waitUntil:'networkidle'});await page.waitForSelector(route==='#/maerkte'?'.dx-markt-karte':'.dx-md h1');
   await page.addScriptTag({path:axePath});
   const v=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}}).then(r=>r.violations.filter(x=>['critical','serious'].includes(x.impact)).map(x=>({id:x.id,nodes:x.nodes.slice(0,3).map(n=>n.target)}))));
   check('Barrierefreiheit '+route+': keine kritischen/ernsten Verstoesse',v.length===0,v);
  }
  await page.close();
 } else check('Barrierefreiheit: axe-core verfuegbar',process.env.CI!=='true',"axe-core nicht installiert");
}
/* Navigation: Karte -> Detail, Reload auf der Detailroute, Zurueck. */
{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.goto(base+'/discover/#/maerkte',{waitUntil:'networkidle'});await page.waitForSelector('a.dx-markt-karte');
 await page.click('a.dx-markt-karte[data-instrument="BTCUSD"]');await page.waitForSelector('.dx-md h1');
 check('Navigation: Karte oeffnet Marktdetail',(await page.evaluate(()=>location.hash))==='#/maerkte/BTCUSD',null);
 await page.reload({waitUntil:'networkidle'});await page.waitForSelector('.dx-md h1');
 check('Navigation: Reload auf Detailroute',(await page.textContent('.dx-md h1')).trim()==='Bitcoin',null);
 await page.goBack({waitUntil:'networkidle'});await page.waitForSelector('.dx-maerkte',{timeout:15000}).catch(()=>null);
 check('Navigation: Browser-Zurueck fuehrt zur Uebersicht',(await page.evaluate(()=>location.hash))==='#/maerkte',null);
 await page.close();
}
await browser.close();

const failed=checks.filter(c=>!c.pass);
const report={schemaVersion:'vu-discover-maerkte-qa-1.1.0',checkedAt:new Date().toISOString(),against:base,engine,
 result:failed.length?'FAIL':'PASS',checks:checks.length,failed:failed.length,failures:failed,evidence};
await writeFile(`${out}/maerkte-qa-${engine}.json`,JSON.stringify(report,null,1));
for(const c of checks)console.log((c.pass?'PASS ':'FAIL ')+c.name+(c.pass?'':' -> '+JSON.stringify(c.detail)));
console.log(`\nMaerkte-QA (${engine}) gegen ${base}: ${report.result} (${checks.length-failed.length}/${checks.length})`);
for(const k of evidence.mobile.gruppen)console.log(`  ${k.titel}: `+k.karten.map(x=>`${x.symbol} ${x.wert||'-'} ${x.veraenderung||''}`).join(' | '));
process.exit(failed.length?1:0);
