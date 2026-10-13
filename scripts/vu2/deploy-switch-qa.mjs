#!/usr/bin/env node
// Quant: Deployment-Wechsel mit offenem Tab, im echten Browser, hinter der Passwortsperre.
//
// Release B hat die Daten von A verschoben (/data/tech/by-ticker -> /data/tech/v2, wie #616 die Scherben der technischen
// Auswertung) und das nachgeladene Skript ausgetauscht. Ein Tab von A bleibt offen, der Server liefert danach B aus.
// Echt sind Waechter, Shell (QuantShell.loadJSON), Kennung der Pipeline und Sperre; die Seite dazwischen ist ein Stand-in.
// Das Discover-Gegenstueck: scripts/discover/deploy-switch-qa.mjs (gleiche Bausteine, scripts/vu2/deploy-switch-lib.mjs).
//
// Aufruf: NODE_PATH=<playwright> node scripts/vu2/deploy-switch-qa.mjs [--engine chromium,webkit] [--out <Ordner>] [--without-guard]
// --without-guard laesst den Waechter weg (Verhalten der Tabs von vor diesem Stand): die Szenarien 1 bis 3 muessen dann
// scheitern - die Gegenprobe, dass dieser Test den Fehler wirklich sieht. Exit-Code 0 heisst dann "Gegenprobe bestanden".
import {buildRelease,serve,openTab,recorder,launch,finish,arg,flag,wait,requirePlaywright} from './deploy-switch-lib.mjs';

const playwright=requirePlaywright();
const engines=arg('engine','chromium').split(',');
const WITHOUT_GUARD=flag('without-guard');
const TICKERS=['NVDA','AAPL','MSFT','AMZN'];

const PAGE=`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Deployment-Wechsel</title></head><body>
<main><h1>Mini-Quant</h1><label for="note">Notiz</label><input id="note" type="text" autocomplete="off"><button id="lazy" type="button">Chartbild</button><div id="out" role="status">leer</div></main>
${WITHOUT_GUARD?'':'<script src="/quant/ui/release-guard.js"></script>'}<script src="/quant/ui/shell.js"></script><script src="/quant/app/mini.js"></script></body></html>`;
/* Wie quant/app/app.js#loadScript: erst der Waechter, Kennung als Stempel. */
const app=(version,dir)=>`(function(){window.APP_VERSION='${version}';
var out=document.getElementById('out');function show(t){out.textContent=t;}
function route(){var m=location.hash.match(/^#\\/aktie\\/([A-Z]+)$/);if(!m)return;var t=m[1];show('lade '+t);
 QuantShell.loadJSON('/data/tech/${dir}'+t+'.json').then(function(d){show('Technik '+t+': '+d.trend+' ['+window.APP_VERSION+']');}).catch(function(){show('Technik nicht verfügbar');});}
window.addEventListener('hashchange',route);route();
document.getElementById('lazy').addEventListener('click',function(){
 var g=window.VUReleaseGuard;(g?g.beforeLoad():Promise.resolve()).then(function(){var s=document.createElement('script');s.src='/quant/app/lazy.js'+(g&&g.identity()?'?v='+g.identity().id:'');s.onload=function(){show('Chartbild '+window.LAZY+(window.__mixed?' GEMISCHT':''));};document.head.appendChild(s);},function(){show('Chartbild gesperrt');});});
})();`;
const lazy=version=>`window.LAZY='${version}';if(window.APP_VERSION!=='${version}')window.__mixed=true;`;

function release(version,{moved}){
 const dir=moved?'v2/':'by-ticker/';
 const files={'quant/index.html':PAGE,'quant/app/mini.js':app(version,dir),'quant/app/lazy.js':lazy(version),
  'index.html':'<!doctype html><html><head><meta charset="utf-8"><title>Start</title></head><body>Start</body></html>'};
 for(const t of TICKERS)files['data/tech/'+dir+t+'.json']=JSON.stringify({trend:'Trend '+t});
 return buildRelease(version,{files,copy:['quant/ui/release-guard.js','quant/ui/shell.js']});
}

const {results,record}=recorder();
const out=page=>page.evaluate(()=>(document.getElementById('out')||{}).textContent).catch(()=>null);
async function until(page,pred,ms=12000){const end=Date.now()+ms;let last=null;while(Date.now()<end){last=await out(page);if(last!==null&&pred(last))return last;await wait(150);}return last;}

async function scenarios(engine,browser,state,A,B){
 const origin='http://127.0.0.1:'+state.port;
 const swap=()=>{state.root=B.dir;state.staleHtml=null;};
 const open=async opts=>{state.root=A.dir;state.staleHtml=null;const t=await openTab(browser,opts);await t.page.goto(origin+'/quant/#/aktie/NVDA');await until(t.page,x=>/^Technik NVDA/.test(x));await wait(2300);return t;};   // der Waechter haelt einen Befund 2 s

 {const {ctx,page,log}=await open();   // 1) Datei weg
  const first=await out(page);
  await page.evaluate(()=>localStorage.setItem('vu.quant.watchlist.v1','["NVDA"]'));
  const before=log.loads;swap();const seen=[];
  for(const t of ['AAPL','MSFT','AMZN']){
   await page.evaluate(h=>{location.hash=h;},'#/aktie/'+t);
   seen.push(await until(page,x=>new RegExp('^Technik '+t+':').test(x)||/nicht verfügbar/.test(x)));
  }
  const watch=await page.evaluate(()=>localStorage.getItem('vu.quant.watchlist.v1')),hash=await page.evaluate(()=>location.hash);
  const ok=/\[A\]/.test(first)&&seen.every((s,i)=>new RegExp('^Technik '+['AAPL','MSFT','AMZN'][i]+': Trend .*\\[B\\]$').test(s))&&log.loads-before===1&&watch==='["NVDA"]'&&hash==='#/aktie/AMZN'&&!log.errors.length&&!(await page.$('#vu-release-banner'));
  record(engine,'Datei weg (404): ein Neuladen, neue Daten, Route und Merkliste bleiben',ok,JSON.stringify({first,seen,neuladungen:log.loads-before,watch,hash,fehler:log.errors.slice(0,2)}));
  await ctx.close();}

 {const {ctx,page,log}=await open();   // 2) Nachgeladenes Skript
  const before=log.loads;swap();
  await page.click('#lazy');
  const result=await until(page,t=>/^Chartbild/.test(t)||/^Technik NVDA: .*\[B\]/.test(t));
  const mixed=await page.evaluate(()=>window.__mixed===true);
  record(engine,'Nachladen: erst neu laden, nie ein neues Skript neben altem Code',!mixed&&log.loads-before===1&&!/GEMISCHT/.test(result||''),JSON.stringify({result,gemischt:mixed,neuladungen:log.loads-before}));
  await page.click('#lazy');const after=await until(page,t=>/^Chartbild/.test(t));
  record(engine,'Nachladen nach dem Neuladen: B-Skript auf B-Code',after==='Chartbild B',after);
  await ctx.close();}

 {const {ctx,page,log}=await open();   // 3) Eingabe laeuft
  await page.fill('#note','Kaufen unter 100');await page.focus('#note');
  const before=log.loads;swap();
  await page.evaluate(()=>{location.hash='#/aktie/AAPL';});
  await wait(1500);
  const banner=!!(await page.$('#vu-release-banner')),kept=await page.inputValue('#note').catch(()=>null),idle=log.loads===before;
  await page.evaluate(()=>{document.activeElement.blur();location.hash='#/aktie/MSFT';});
  const result=await until(page,t=>/^Technik MSFT: .*\[B\]/.test(t));
  const restored=await page.inputValue('#note').catch(()=>null);
  record(engine,'Eingabe laeuft: Hinweis statt Neuladen, danach Neuladen mit wiederhergestellter Eingabe',banner&&idle&&kept==='Kaufen unter 100'&&/\[B\]/.test(result||'')&&restored==='Kaufen unter 100'&&log.loads-before===1,JSON.stringify({banner,ohneNeuladen:idle,kept,result,restored,neuladungen:log.loads-before}));
  await ctx.close();}

 {const {ctx,page,log}=await open({storage:false});   // 4) sessionStorage blockiert
  const before=log.loads;swap();
  await page.evaluate(()=>{location.hash='#/aktie/AAPL';});
  await wait(1500);
  const banner=!!(await page.$('#vu-release-banner')),text=await out(page);
  record(engine,'sessionStorage blockiert: kein Neuladen, Hinweis',banner&&log.loads===before&&/nicht verfügbar/.test(text||''),JSON.stringify({banner,neuladungen:log.loads-before,text}));
  await ctx.close();}

 {const {ctx,page,log}=await open();   // 5) Veralteter Rand
  const before=log.loads;state.root=B.dir;state.staleHtml=A.dir;
  await page.evaluate(()=>{location.hash='#/aktie/AAPL';});
  await wait(4000);
  const banner=!!(await page.$('#vu-release-banner'));
  record(engine,'Veralteter Cache: ein Neuladen, danach Hinweis, keine Schleife',banner&&log.loads-before===1,JSON.stringify({banner,neuladungen:log.loads-before}));
  state.staleHtml=null;await ctx.close();}
}

const A=await release('A',{moved:false}),B=await release('B',{moved:true});
console.log('Kennungen A',JSON.stringify(A.ids.products),'B',JSON.stringify(B.ids.products));
if(A.ids.products.quant===B.ids.products.quant){console.error('A und B haben dieselbe Kennung');process.exit(2);}
const state={root:A.dir,staleHtml:null};
const server=await serve(state,/^\/(quant\/index\.html|__research\/content\/quant\/index\.html)$/);state.port=server.address().port;
for(const engine of engines){
 const browser=await launch(playwright,engine);
 try{await scenarios(engine,browser,state,A,B);}catch(e){record(engine,'Szenario abgebrochen',false,String(e&&e.stack||e).slice(0,400));}
 await browser.close();
}
server.close();
await finish({results,dirs:[A.dir,B.dir],withoutGuard:WITHOUT_GUARD,minimum:3,controlPattern:/^(Datei weg|Nachladen|Eingabe)/});
