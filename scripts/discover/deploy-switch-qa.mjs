#!/usr/bin/env node
// Discover: Deployment-Wechsel mit offenem Tab, im echten Browser, hinter der Passwortsperre.
//
// Echt sind lazy.js, Waechter (quant/ui/release-guard.js), Shell (QuantShell.loadJSON), die Kennung der Pipeline und die Sperre; die
// Seite dazwischen ist ein Stand-in mit denselben Skriptgruppen-Templates wie discover/index.html (dx-lazy-detail/-markets/-daten).
// Release B tauscht app.js und die Gruppen-Skripte aus und verschiebt die Detaildaten (/discover/data/stocks/US_REAL -> .../v2).
// Ein Tab von A bleibt offen, der Server liefert danach B aus. Ohne Waechter kaeme neuer Gruppen-Code neben das alte app.js.
//
// Aufruf: NODE_PATH=<playwright> node scripts/discover/deploy-switch-qa.mjs [--engine chromium,webkit] [--out <Ordner>] [--without-guard]
// --without-guard laesst den Waechter weg (Tabs von vor diesem Stand): die Szenarien 1 bis 3 muessen dann scheitern (Gegenprobe).
// Bausteine: scripts/vu2/deploy-switch-lib.mjs (gemeinsam mit scripts/vu2/deploy-switch-qa.mjs).
import {buildRelease,serve,openTab,recorder,launch,finish,arg,flag,wait,requirePlaywright} from '../vu2/deploy-switch-lib.mjs';

const playwright=requirePlaywright();
const engines=arg('engine','chromium').split(',');
const WITHOUT_GUARD=flag('without-guard');

const PAGE=`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mini-Discover</title></head><body>
<main><label for="q">Suche</label><input id="q" type="text" autocomplete="off"><div id="out" role="status">leer</div></main>
<template id="dx-lazy-detail"><script src="/discover/ui/detail.js"></script></template>
<template id="dx-lazy-markets"><script src="/discover/ui/markets.js"></script></template>
<template id="dx-lazy-daten"><script src="/discover/ui/daten.js"></script></template>
${WITHOUT_GUARD?'':'<script src="/quant/ui/release-guard.js"></script>'}<script src="/quant/ui/shell.js"></script><script src="/discover/ui/lazy.js"></script><script src="/discover/app.js"></script></body></html>`;
const app=(version,dir)=>`(function(){window.AppApi={version:'${version}'};
var out=document.getElementById('out');function show(t){out.textContent=t;}
function route(){var p=location.hash.replace(/^#\\/?/,'').split('/');if(!p[0])return show('Start ['+AppApi.version+']');show('lade');
 VUDiscover.Lazy.forRoute(p).then(function(){
  if(p[0]==='s')return QuantShell.loadJSON('/discover/data/stocks/${dir}'+p[1]+'.json').then(function(d){show('Detail '+p[1]+': '+d.name+' ['+AppApi.version+'/'+DetailApi.version+']');});
  if(p[0]==='maerkte')return show('Märkte ['+AppApi.version+'/'+MarketsApi.version+']');
  if(p[0]==='daten')return show('Daten ['+AppApi.version+'/'+DatenApi.version+']');
 }).catch(function(){show('Gerade nicht erreichbar');});}
window.addEventListener('hashchange',route);route();})();`;
const group=(api,version)=>`window.${api}={version:'${version}'};if(window.AppApi.version!=='${version}')window.__mixed=true;`;

function release(version,{moved}){
 const dir=moved?'v2/':'US_REAL/';
 const files={'discover/index.html':PAGE,'discover/app.js':app(version,dir),'discover/ui/detail.js':group('DetailApi',version),
  'discover/ui/markets.js':group('MarketsApi',version),'discover/ui/daten.js':group('DatenApi',version),
  'index.html':'<!doctype html><html><head><meta charset="utf-8"><title>Start</title></head><body>Start</body></html>'};
 for(const t of ['NVDA','AAPL','MSFT'])files['discover/data/stocks/'+dir+t+'.json']=JSON.stringify({name:'Name '+t});
 return buildRelease(version,{files,copy:['quant/ui/release-guard.js','quant/ui/shell.js','discover/ui/lazy.js']});
}

const {results,record}=recorder();
const out=page=>page.evaluate(()=>(document.getElementById('out')||{}).textContent).catch(()=>null);
async function until(page,pred,ms=12000){const end=Date.now()+ms;let last=null;while(Date.now()<end){last=await out(page);if(last!==null&&pred(last))return last;await wait(150);}return last;}
const go=(page,hash)=>page.evaluate(h=>{location.hash=h;},hash);

async function scenarios(engine,browser,state,A,B){
 const origin='http://127.0.0.1:'+state.port;
 const swap=()=>{state.root=B.dir;state.staleHtml=null;};
 const open=async(hash,pred,opts)=>{state.root=A.dir;state.staleHtml=null;const t=await openTab(browser,opts);await t.page.goto(origin+'/discover/'+hash);await until(t.page,pred);await wait(2300);return t;};   // der Waechter haelt einen Befund 2 s

 {const {ctx,page,log}=await open('#/',x=>/^Start \[A\]/.test(x));   // 1) Gruppe noch nicht geladen
  const before=log.loads;swap();
  await go(page,'#/s/AAPL');
  const result=await until(page,x=>/^Detail AAPL/.test(x)||/nicht erreichbar/.test(x));
  const mixed=await page.evaluate(()=>window.__mixed===true),hash=await page.evaluate(()=>location.hash);
  record(engine,'Gruppe nachladen: erst neu laden, kein neues Gruppen-Skript neben altem app.js',result==='Detail AAPL: Name AAPL [B/B]'&&!mixed&&hash==='#/s/AAPL'&&log.loads-before===1,JSON.stringify({result,gemischt:mixed,hash,neuladungen:log.loads-before}));
  await ctx.close();}

 {const {ctx,page,log}=await open('#/maerkte',x=>/^Märkte \[A\/A\]/.test(x));   // 2) Maerkte offen, Daten-Gruppe neu
  const before=log.loads;swap();
  await go(page,'#/daten');
  const daten=await until(page,x=>/^Daten/.test(x));
  await go(page,'#/maerkte');const markets=await until(page,x=>/^Märkte/.test(x));
  await go(page,'#/s/MSFT');const detail=await until(page,x=>/^Detail MSFT/.test(x));
  const mixed=await page.evaluate(()=>window.__mixed===true);
  record(engine,'Maerkte, Daten, Detail nach dem Wechsel: alle auf B, ein Neuladen insgesamt',daten==='Daten [B/B]'&&markets==='Märkte [B/B]'&&detail==='Detail MSFT: Name MSFT [B/B]'&&!mixed&&log.loads-before===1,JSON.stringify({daten,markets,detail,gemischt:mixed,neuladungen:log.loads-before}));
  await ctx.close();}

 {const {ctx,page,log}=await open('#/s/NVDA',x=>/^Detail NVDA/.test(x));   // 3) alle Gruppen geladen, Datei weg
  const first=await out(page);
  const before=log.loads;swap();
  await go(page,'#/s/AAPL');
  const result=await until(page,x=>/^Detail AAPL/.test(x)||/nicht erreichbar/.test(x));
  record(engine,'Datei weg (404) bei geladener Gruppe: ein Neuladen, neue Detaildaten, Route bleibt',/\[A\/A\]$/.test(first)&&result==='Detail AAPL: Name AAPL [B/B]'&&log.loads-before===1&&(await page.evaluate(()=>location.hash))==='#/s/AAPL',JSON.stringify({first,result,neuladungen:log.loads-before}));
  await ctx.close();}

 {const {ctx,page,log}=await open('#/',x=>/^Start \[A\]/.test(x));   // 4) Eingabe laeuft
  await page.fill('#q','Apple');await page.focus('#q');
  const before=log.loads;swap();
  await go(page,'#/s/AAPL');
  await wait(1500);
  const banner=!!(await page.$('#vu-release-banner')),kept=await page.inputValue('#q').catch(()=>null),idle=log.loads===before,shown=await out(page);
  await page.evaluate(()=>{document.activeElement.blur();location.hash='#/s/MSFT';});
  const result=await until(page,x=>/^Detail MSFT.*\[B\/B\]/.test(x));
  const restored=await page.inputValue('#q').catch(()=>null);
  record(engine,'Eingabe laeuft: Hinweis statt Neuladen, danach Neuladen mit wiederhergestellter Eingabe',banner&&idle&&kept==='Apple'&&/nicht erreichbar/.test(shown||'')&&/\[B\/B\]/.test(result||'')&&restored==='Apple'&&log.loads-before===1,JSON.stringify({banner,ohneNeuladen:idle,kept,shown,result,restored,neuladungen:log.loads-before}));
  await ctx.close();}

 {const {ctx,page,log}=await open('#/',x=>/^Start \[A\]/.test(x),{storage:false});   // 5) sessionStorage blockiert
  const before=log.loads;swap();
  await go(page,'#/s/AAPL');
  await wait(1500);
  const banner=!!(await page.$('#vu-release-banner')),mixed=await page.evaluate(()=>window.__mixed===true);
  record(engine,'sessionStorage blockiert: kein Neuladen, Hinweis, kein gemischter Code',banner&&!mixed&&log.loads===before,JSON.stringify({banner,gemischt:mixed,neuladungen:log.loads-before,text:await out(page)}));
  await ctx.close();}

 {const {ctx,page,log}=await open('#/',x=>/^Start \[A\]/.test(x));   // 6) Veralteter Rand
  const before=log.loads;state.root=B.dir;state.staleHtml=A.dir;
  await go(page,'#/s/AAPL');
  await wait(4000);
  const banner=!!(await page.$('#vu-release-banner')),mixed=await page.evaluate(()=>window.__mixed===true);
  record(engine,'Veralteter Cache: ein Neuladen, danach Hinweis, keine Schleife, kein gemischter Code',banner&&!mixed&&log.loads-before===1,JSON.stringify({banner,gemischt:mixed,neuladungen:log.loads-before}));
  state.staleHtml=null;await ctx.close();}
}

const A=await release('A',{moved:false}),B=await release('B',{moved:true});
console.log('Kennungen A',JSON.stringify(A.ids.products),'B',JSON.stringify(B.ids.products));
if(A.ids.products.discover===B.ids.products.discover){console.error('A und B haben dieselbe Kennung');process.exit(2);}
const state={root:A.dir,staleHtml:null};
const server=await serve(state,/^\/(discover\/index\.html|__research\/content\/discover\/index\.html)$/);state.port=server.address().port;
for(const engine of engines){
 const browser=await launch(playwright,engine);
 try{await scenarios(engine,browser,state,A,B);}catch(e){record(engine,'Szenario abgebrochen',false,String(e&&e.stack||e).slice(0,400));}
 await browser.close();
}
server.close();
await finish({results,dirs:[A.dir,B.dir],withoutGuard:WITHOUT_GUARD,minimum:3,controlPattern:/^(Gruppe nachladen|Maerkte|Datei weg)/});
