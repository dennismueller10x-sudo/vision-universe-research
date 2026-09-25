#!/usr/bin/env node
// Browser-QA der Maerkte-Seite (#/maerkte) gegen eine echte Seite - keine
// Attrappen, keine abgefangenen Daten. Prueft, was der Nutzer sieht:
// Gruppen je Assetklasse, Tracker-Kennzeichnung (nie Indexpunkte), echter
// Nikkei-Index, Krypto 24/7, Renditen/Leitzinsen in bp ohne Kursfarbe,
// Einheiten je Barrel/MMBtu/Unze, kein Querlauf auf dem Telefon.
// Usage: node scripts/discover/browser-qa-maerkte.mjs --url https://research.visionuniverse.de --out /tmp/maerkte-qa
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
let playwright;
try{playwright=require('playwright');}catch{playwright=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');}
const arg=(key,otherwise)=>{const i=process.argv.indexOf('--'+key);return i<0?otherwise:process.argv[i+1];};
const base=arg('url','http://127.0.0.1:8765').replace(/\/$/,'');
const out=arg('out','/tmp/maerkte-qa');await mkdir(out,{recursive:true});

const GRUPPEN=['aktien','energie','edelmetalle','krypto','us-renditen','eu-renditen','leitzinsen','devisen'];
const PFLICHT={
 aktien:['QQQ','SPY','DIA','N225'],energie:['WTI','BRENT','NATGAS'],edelmetalle:['XAUUSD','XAGUSD','XPTUSD','XPDUSD'],
 krypto:['BTCUSD','ETHUSD','SOLUSD','XRPUSD'],'us-renditen':['US2Y','US5Y','US10Y','US30Y'],'eu-renditen':['DE2Y','DE10Y','DE30Y'],
 leitzinsen:['FED_TARGET','US_EFFR','ECB_DFR'],devisen:['EURUSD']
};
const TRACKER={QQQ:'Nasdaq 100',SPY:'S&P 500',DIA:'Dow Jones'};

const checks=[];
function check(name,pass,detail){checks.push({name,pass:!!pass,detail:detail===undefined?null:detail});}

const browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined});
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
 await page.screenshot({path:`${out}/maerkte-${key}.png`});
 await page.click('.dx-maerkte-sprung[data-ziel="maerkte-krypto"]');await page.waitForTimeout(900);
 await page.screenshot({path:`${out}/maerkte-${key}-krypto.png`});
 await page.close();
}
await browser.close();

const failed=checks.filter(c=>!c.pass);
const report={schemaVersion:'vu-discover-maerkte-qa-1.0.0',checkedAt:new Date().toISOString(),against:base,
 result:failed.length?'FAIL':'PASS',checks:checks.length,failed:failed.length,failures:failed,evidence};
await writeFile(`${out}/maerkte-qa.json`,JSON.stringify(report,null,1));
for(const c of checks)console.log((c.pass?'PASS ':'FAIL ')+c.name+(c.pass?'':' -> '+JSON.stringify(c.detail)));
console.log(`\nMaerkte-QA gegen ${base}: ${report.result} (${checks.length-failed.length}/${checks.length})`);
for(const k of evidence.mobile.gruppen)console.log(`  ${k.titel}: `+k.karten.map(x=>`${x.symbol} ${x.wert||'-'} ${x.veraenderung||''}`).join(' | '));
process.exit(failed.length?1:0);
