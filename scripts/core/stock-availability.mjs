/* Verfuegbarkeits-Manifest des Aktien-Navigators (VU3 Stufe 2.1, Teil 2).

   Nur im Release-Bau (scripts/vu2/build-release.mjs), nie committet: es leitet sich aus den veroeffentlichten Artefakten
   derselben Auslieferung ab und kann ihnen deshalb nicht hinterherlaufen. Kein Produkt wird neu gerechnet, kein Datenlauf
   angestossen; gelesen wird nur, was die Produkte selbst als Beleg ihrer Detailseite laden.

   Nachweis je Modul (Schluessel: US = Kuerzel, EUROPE = securityId, siehe core/stock-context.js):
     discover US      stock-index/US_REAL.json  UND  stocks/US_REAL/<SYM>.json   (discover/app.js laedt beides)
     discover EUROPE  europe/catalog.json       UND  europe/manifest.json#series  (Detail = Katalog + Kursreihe)
     quant            product/universe-list-v1.json.gz entries[].s               (Aktienliste der Quant-Seite)
     technik/elliott  technical-intelligence/v3/index.json.gz rows[].t           (Chartbild /elliott/#/<T>)
     technical        technical/data/screener-v1.json cols.s                      (Chart Studio /technical/#/chart/<T>)
     supertrader      data/build.json slices.stock  UND  stock/<SYM>/index.html   (Seite und Daten)
     fundamental      fundamental/index.html  UND  discover stocks/US_REAL/<SYM>.json fundamentals.available
                      (fundamental/engine/model.js liest genau diesen Block; ohne ihn zeigt die Seite nur den Leerzustand)
     hedgefonds       hedgefonds/data/stocks/index.json rows[].ticker               (hedgefonds/app.js#stockByTicker: Kuerzel -> CUSIP-Seite)
   Fehlt die Quelle eines Moduls, fehlt das Modul im Manifest: der Navigator zeigt es neutral als "unknown".

   Ausgabe: <out>/<shardKey>.json, ein kleiner Ausschnitt je StockContext.availabilityShard (eine Anfrage je Detailseite). */
import {readFileSync,existsSync,mkdirSync,writeFileSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const require=createRequire(import.meta.url);
const SC=require('../../core/stock-context.js');
export const AVAILABILITY_DIR='core/data/stock-availability/';
export const SHARD_BUDGET=16*1024;

function readJson(root,rel){const p=join(root,rel);if(!existsSync(p))return null;const b=readFileSync(p);return JSON.parse(rel.endsWith('.gz')?gunzipSync(b):b);}

/** Belegte Schluessel je Modul und Region. Ein Modul ohne lesbare Quelle fehlt (-> unknown), es wird nie als leer behauptet. */
export function collectEvidence(root){
 const ev={},skipped={};
 const put=(product,region,keys)=>{(ev[product]=ev[product]||{})[region]=[...new Set(keys)].sort();};
 const tryModule=(name,fn)=>{try{fn();}catch(e){skipped[name]=String(e&&e.message||e).slice(0,160);}};
 tryModule('discover.US',()=>{
  const idx=readJson(root,'discover/data/stock-index/US_REAL.json');if(!idx||!Array.isArray(idx.symbols))throw Error('DISCOVER_INDEX_MISSING');
  const dir=join(root,'discover/data/stocks/US_REAL');if(!existsSync(dir))throw Error('DISCOVER_STOCKS_MISSING');
  const files=new Set(readdirSync(dir).filter(f=>f.endsWith('.json')).map(f=>f.slice(0,-5)));
  put('discover','US',idx.symbols.filter(s=>files.has(s)&&valid(()=>SC.fromUs(s))));
 });
 tryModule('discover.EUROPE',()=>{
  const cat=readJson(root,'discover/data/europe/catalog.json'),man=readJson(root,'discover/data/europe/manifest.json');
  if(!cat||!man||!man.series)throw Error('EUROPE_SOURCES_MISSING');
  const rows=cat.securities||cat.entries||[];
  put('discover','EUROPE',rows.filter(r=>Object.hasOwn(man.series,r.securityId)&&valid(()=>SC.fromEurope({securityId:r.securityId,ticker:r.ticker}))).map(r=>r.securityId));
 });
 tryModule('quant.US',()=>{
  const list=readJson(root,'quant/data/product/universe-list-v1.json.gz');if(!list||!Array.isArray(list.entries))throw Error('QUANT_LIST_MISSING');
  put('quant','US',list.entries.map(e=>e.s).filter(s=>valid(()=>SC.fromUs(s))));
 });
 tryModule('technik.US',()=>{
  const idx=readJson(root,'quant/data/technical-intelligence/v3/index.json.gz');if(!idx||!Array.isArray(idx.rows))throw Error('TECHNICAL_INDEX_MISSING');
  const keys=idx.rows.map(r=>r.t).filter(s=>valid(()=>SC.fromUs(s)));
  put('technik','US',keys);put('elliott','US',keys);
 });
 tryModule('technical.US',()=>{
  const ds=readJson(root,'technical/data/screener-v1.json');if(!ds||!ds.cols||!Array.isArray(ds.cols.s))throw Error('TECHNICAL_SCREENER_MISSING');
  put('technical','US',ds.cols.s.filter(s=>valid(()=>SC.fromUs(s))));
 });
 tryModule('supertrader.US',()=>{
  const build=readJson(root,'supertrader/data/build.json');if(!build||!build.slices||!Array.isArray(build.slices.stock))throw Error('SUPERTRADER_BUILD_MISSING');
  put('supertrader','US',build.slices.stock.filter(s=>valid(()=>SC.fromUs(s))&&existsSync(join(root,'supertrader/stock',s,'index.html'))&&existsSync(join(root,'supertrader/data/stock',s+'.json'))));
 });
 tryModule('fundamental.US',()=>{
  if(!existsSync(join(root,'fundamental/index.html')))throw Error('FUNDAMENTAL_PAGE_MISSING');
  const dir=join(root,'discover/data/stocks/US_REAL');if(!existsSync(dir))throw Error('DISCOVER_STOCKS_MISSING');
  const keys=[];
  for(const f of readdirSync(dir)){
   if(!f.endsWith('.json'))continue;
   const s=f.slice(0,-5);if(!valid(()=>SC.fromUs(s)))continue;
   let doc;try{doc=JSON.parse(readFileSync(join(dir,f)));}catch{continue;}
   if(doc&&doc.fundamentals&&doc.fundamentals.available===true)keys.push(s);
  }
  put('fundamental','US',keys);
 });
 tryModule('hedgefonds.US',()=>{
  const idx=readJson(root,'hedgefonds/data/stocks/index.json');if(!idx||!Array.isArray(idx.fields)||!Array.isArray(idx.rows))throw Error('HEDGEFONDS_INDEX_MISSING');
  const ti=idx.fields.indexOf('ticker');if(ti<0)throw Error('HEDGEFONDS_INDEX_NO_TICKER');
  put('hedgefonds','US',idx.rows.map(r=>String(r[ti]||'').toUpperCase()).filter(s=>s&&valid(()=>SC.fromUs(s))));
 });
 return {evidence:ev,skipped};
}
function valid(fn){try{fn();return true;}catch{return false;}}

/** Evidenz -> {<shardKey>: Manifest-Ausschnitt}. Jeder Ausschnitt fuehrt jedes belegte Modul (auch mit leerer Liste:
    dann ist fuer diesen Ausschnitt belegt, dass das Modul keine dieser Aktien fuehrt). */
export function buildShards(evidence){
 const keys=new Set();
 const shardOf=(region,k)=>SC.availabilityShard(region==='US'?SC.fromUs(k):SC.fromEurope({securityId:k}));
 const placed={};
 for(const [product,regions] of Object.entries(evidence))for(const [region,list] of Object.entries(regions))for(const k of list){
  const s=shardOf(region,k);keys.add(s);((placed[s]=placed[s]||{})[product]=placed[s][product]||{});(placed[s][product][region]=placed[s][product][region]||[]).push(k);
 }
 const shards={};
 for(const s of [...keys].sort()){
  const modules={};
  for(const [product,regions] of Object.entries(evidence)){modules[product]={};for(const region of Object.keys(regions))modules[product][region]=(placed[s]&&placed[s][product]&&placed[s][product][region])||[];}
  shards[s]={schema:SC.SCHEMA,shard:s,modules};
 }
 return shards;
}

/* VU3-Finalisierung: ein Anzeigename je US-Aktie fuer den Aktienkopf aller Welten - aus dem Security-Master
   (quant/data/market/security-master/company-names.json, Feld displayName; Erzeuger build-company-names.mjs).
   Nur Kuerzel, die im Ausschnitt ohnehin stehen; fehlt der Name, bleibt der Name der Welt. */
export function addNames(shards,root){
 const doc=readJson(root,'quant/data/market/security-master/company-names.json');
 if(!doc||!Array.isArray(doc.rows))return 0;
 const names=new Map(doc.rows.filter(r=>r&&r.ticker&&r.displayName&&r.inProductUniverse).map(r=>[r.ticker,r.displayName]));
 let n=0;
 for(const doc of Object.values(shards)){
  const tickers=new Set(Object.values(doc.modules).flatMap(m=>m.US||[]));
  const out={};for(const t of [...tickers].sort())if(names.has(t)){out[t]=names.get(t);n++;}
  if(Object.keys(out).length)doc.names=out;
 }
 return n;
}

export function writeAvailability({root,out}){
 const {evidence,skipped}=collectEvidence(resolve(root));
 const shards=buildShards(evidence);
 const named=addNames(shards,resolve(root));
 mkdirSync(out,{recursive:true});
 for(const [k,doc] of Object.entries(shards)){
  if(!/^[A-Z0-9_]{1,2}$/.test(k))throw Error('AVAILABILITY_SHARD_KEY_INVALID');
  const b=Buffer.from(JSON.stringify(doc));if(b.length>SHARD_BUDGET)throw Error('AVAILABILITY_SHARD_BUDGET_EXCEEDED');
  writeFileSync(join(out,k+'.json'),b);
 }
 const counts=Object.fromEntries(Object.entries(evidence).map(([p,r])=>[p,Object.fromEntries(Object.entries(r).map(([g,l])=>[g,l.length]))]));
 return {schema:SC.SCHEMA,shards:Object.keys(shards).length,counts,named,skipped};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const out=process.argv.find(a=>a.startsWith('--out='))?.slice(6);
 if(!out){console.error('usage: stock-availability.mjs --out=<dir>');process.exitCode=2;}
 else console.log(JSON.stringify(writeAvailability({root:process.cwd(),out:resolve(out)}),null,1));
}
