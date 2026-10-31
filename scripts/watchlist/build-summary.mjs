/* Watchlist-Uebersicht (vu-watchlist-summary-1.0.0): EINE gemeinsame Auslieferungsansicht fuer alle Watchlists
   (core/data/watchlist-summary-v1/: meta.json, rows/<shardKey>.json, names.json - siehe splitSummary).

   Nur im Release-Bau (scripts/vu2/build-release.mjs), nie committet - wie core/data/stock-availability. Sie rechnet kein
   Modell neu: sie waehlt aus den veroeffentlichten Artefakten derselben Auslieferung die Felder einer Watchlist-Zeile und
   wendet die bestehenden Gates an. Jeder Nutzer laedt dieselbe Datei (CDN-Cache), in Supabase steht nur seine Auswahl.

   Quelle je Abschnitt (Schluessel der Zeile ist die instrumentId aus dem Company Master, ADR-001):
     Identitaet   quant/data/universe/instruments/<shard>.json            Name, Boerse, Waehrung, aktiv/delistet
     Kurs         quant/data/product/universe-list-v1.json.gz             letzter veroeffentlichter Schluss (published-close.js, ADR-002)
     Quant        quant/data/product/factor-evidence-v1/<shard>.json.gz   sieben Faktoren + Stufe aus der Position; KEIN Gesamtscore
                                                                          (publication.compositeAllowed=false wird uebernommen)
     Technik      technical/data/screener-v1.json                         52W-Hoch (Plattformdefinition), Abstand, Volumen, RSI, Trend
     Supertrader  supertrader/data/signals-core.json + registry-core.json Zustaende je Strategie + Freigabestufe der Strategie
   Zugeordnet wird ein Kurs/Score nur dem Listing, dessen kanonische securityId (ref_<TICKER>, core/identity.js) die Quelle
   traegt, das aktiv ist und dessen Waehrung passt. Sonst bleibt der Abschnitt leer und traegt den Grund.
   Fehlt eine Quelle, fehlt der Abschnitt (state SOURCE_MISSING) - nie ein Ersatzwert.
   Belegte Ticker-Wiederverwendung (quant/config/ticker-reuse-quarantine.json, gelesen ueber
   scripts/market/universe-source.mjs#loadTickerReuseQuarantine): unter dem Ticker handelt heute ein anderes Wertpapier
   (z. B. ein ETF) als das Unternehmen, auf das Name, Stamm und securityId zeigen. Solche Zeilen behalten Kennung, Kuerzel,
   Boerse und Status, tragen aber keinen Namen der alten Identitaet und keine Kurs-, Quant-, Technik- oder
   Supertrader-Werte; jeder Abschnitt nennt den Grund IDENTITY_QUARANTINED (why), gezaehlt in withheld. */
import {readFileSync,existsSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {loadTickerReuseQuarantine} from '../market/universe-source.mjs';

const require=createRequire(import.meta.url);
const Identity=require('../../core/identity.js');
const FE=require('../../quant/engines/factor-evidence.js');
const TS=require('../../quant/engines/realtime/trading-session.js');
export const SUMMARY_DIR='core/data/watchlist-summary-v1/';
export const SHARD_BUDGET=48*1024; /* groesste Scherbe heute ~20 KB roh (AL), ~4,5 KB gzip */
export const SCHEMA='vu-watchlist-summary-1.0.0';
/* Offene Lebenszyklus-Zustaende (registry-core.json lifecycle); CLOSED/INVALIDATED sind Geschichte, keine Lage. */
const OPEN_STATES=['DISCOVERED','WATCH','SETUP','ENTRY_READY','TRIGGERED','ACTIVE','WARNING','EXIT'];
const BAND_IDS=FE.BANDS.map(b=>b.id);

function readJson(root,rel){const p=join(root,rel);if(!existsSync(p))return null;const b=readFileSync(p);return JSON.parse(rel.endsWith('.gz')?gunzipSync(b):b);}
const round=(v,d)=>typeof v==='number'&&Number.isFinite(v)?Math.round(v*10**d)/10**d:null;
const domainRule=(reg,id)=>{const d=(reg&&reg.domains||[]).find(x=>x.id===id);return d?{domain:id,artifact:d.artifact,freshness:d.freshness||null}:{domain:id,artifact:null,freshness:null};};

/** Liefert {doc, report}. doc ist spaltenweise (cols[feld][zeile]), wie technical/data/screener-v1.json. */
export function buildSummary(root,{now=new Date()}={}){
 const registry=readJson(root,'core/registry/domains.json'),calendar=readJson(root,'quant/config/market-calendar.json');
 const skipped={},sources={};
 const tryPart=(name,fn)=>{try{fn();}catch(e){skipped[name]=String(e&&e.message||e).slice(0,200);}};

 // ---- Identitaet: alle Instrumente des Company Master (auch delistete, damit gespeicherte Eintraege erklaerbar bleiben)
 const manifest=readJson(root,'quant/data/universe/master-manifest.json');
 if(!manifest||!manifest.shards||!Array.isArray(manifest.shards.index))throw Error('COMPANY_MASTER_MISSING');
 const rows=[],bySymbol=new Map();
 const quarantine=loadTickerReuseQuarantine(root);
 const quarantined=quarantine?quarantine.records:new Map();
 const withheld={};
 for(const {shard} of manifest.shards.index){
  const part=readJson(root,'quant/data/universe/instruments/'+shard+'.json');if(!part)throw Error('COMPANY_MASTER_SHARD_MISSING:'+shard);
  for(const m of part.instruments||[]){
   if(!Identity.isInstrumentId(m.instrumentId)||!Identity.normalizeTicker(m.symbol))continue;
   const sid=Identity.securityIdForTicker(m.symbol),iq=quarantined.has(sid);
   const r={i:m.instrumentId,s:m.symbol,n:iq?null:m.companyName||null,x:m.exchange||null,cu:m.currency||null,act:m.active?1:0,
    del:m.delistedAt||null,el:m.productEligibility||null,sid,legacy:m.masterMemberId||null};
   if(iq){r.iq=true;r.why={identity:'IDENTITY_QUARANTINED'};withheld['identity:IDENTITY_QUARANTINED']=(withheld['identity:IDENTITY_QUARANTINED']||0)+1;}
   rows.push(r);
   if(!bySymbol.has(r.s))bySymbol.set(r.s,[]);bySymbol.get(r.s).push(r);
  }
 }
 sources.master={...domainRule(registry,'companyMaster'),asOf:manifest.asOf||null,generatedAt:manifest.generatedAt||null};
 if(quarantine)sources.master.identityQuarantine={artifact:'/'+quarantine.file,sha256:quarantine.sha256,securities:quarantined.size,reason:'IDENTITY_QUARANTINED'};
 /* Genau ein Listing traegt die Daten eines Tickers: aktiv, und seine kanonische securityId ist die der Quelle. */
 const listingFor=(ticker,sid,currency)=>{
  const cands=(bySymbol.get(ticker)||[]).filter(r=>r.sid===sid);
  const active=cands.filter(r=>r.act===1);
  if(!cands.length)return {reason:'NOT_IN_COMPANY_MASTER'};
  if(cands.some(r=>r.iq))return {reason:'IDENTITY_QUARANTINED',rows:cands};
  if(active.length>1)return {reason:'LISTING_AMBIGUOUS',rows:active};
  if(!active.length)return {reason:'LISTING_INACTIVE',rows:cands};
  if(currency&&active[0].cu&&currency!==active[0].cu)return {reason:'CURRENCY_MISMATCH',rows:active};
  return {row:active[0]};
 };
 const note=(rowsOf,section,reason)=>{for(const r of rowsOf||[]){(r.why=r.why||{})[section]=reason;}withheld[section+':'+reason]=(withheld[section+':'+reason]||0)+1;};

 // ---- Kurs
 tryPart('price',()=>{
  const list=readJson(root,'quant/data/product/universe-list-v1.json.gz');if(!list||!Array.isArray(list.entries))throw Error('UNIVERSE_LIST_MISSING');
  sources.price={...domainRule(registry,'eodPrices'),artifact:'/quant/data/product/universe-list-v1.json.gz',schema:list.schemaVersion||null,
   generatedAt:list.generatedAt||null,asOf:null,basis:'SPLIT_ADJUSTED_EOD_CLOSE'};
  for(const e of list.entries){
   if(!(e.c>0)||!e.d)continue;
   let sid;try{sid=Identity.securityIdForTicker(e.s);}catch{continue;}
   const hit=listingFor(e.s,sid,e.u);
   if(!hit.row){note(hit.rows,'price',hit.reason);continue;}
   Object.assign(hit.row,{c:e.c,cd:e.d,pu:e.u||null});
   if(!sources.price.asOf||e.d>sources.price.asOf)sources.price.asOf=e.d;
  }
 });

 // ---- Quant: Faktoren mit Stufe; Gesamtscore bleibt zurueckgehalten
 tryPart('quant',()=>{
  const summary=readJson(root,'quant/data/product/factor-evidence-v1/summary.json');
  const screening=readJson(root,'quant/data/product/factor-evidence-v1/screening.json.gz');
  /* Wird der Gesamtscore eines Tages veroeffentlicht (compositeAllowed=true), gilt der Vertrag nicht mehr: dann faellt der
     Quant-Abschnitt aus, bis die Watchlist in einem eigenen PR dafuer freigegeben ist - nie automatisch. */
  if(screening&&screening.publication&&screening.publication.compositeAllowed!==false)throw Error('QUANT_PUBLICATION_CHANGED');
  if(!screening||FE.screeningVersionState(screening)!=='CURRENT')throw Error('QUANT_SCREENING_NOT_CURRENT');
  const status=readJson(root,'quant/data/product/evidence-status-v1.json');
  const shards=new Set(Object.keys(screening.rows).map(t=>(t+'_').slice(0,2).replace(/[^A-Z0-9._-]/g,'_')));
  let asOf=null,invalid=0;
  for(const key of shards){
   const shard=readJson(root,'quant/data/product/factor-evidence-v1/'+key+'.json.gz');
   if(!shard||!FE.validShard(shard,key)){invalid++;continue;}
   if(shard.asOf&&(!asOf||shard.asOf>asOf))asOf=shard.asOf;
   for(const [ticker,rec] of Object.entries(shard.securities||{})){
    if(FE.publicationViolations(rec).length){withheld['quant:PUBLICATION_VIOLATION']=(withheld['quant:PUBLICATION_VIOLATION']||0)+1;continue;}
    const hit=listingFor(ticker,rec.securityId,null);
    if(!hit.row){note(hit.rows,'quant',hit.reason);continue;}
    const f=FE.FACTOR_ORDER.map(id=>{const x=rec.factors&&rec.factors[id];if(!x||x.state!=='AVAILABLE')return null;const b=FE.bandForPosition(x.position);return [round(x.score,1),b?BAND_IDS.indexOf(b.id):null];});
    Object.assign(hit.row,{q:f,qdq:rec.dataQuality||null,qd:rec.asOf||null,mc:typeof rec.marketCap==='number'?rec.marketCap:null});
   }
  }
  if(invalid)skipped.quantShards=invalid+' Scherbe(n) ungueltig';
  sources.quant={...domainRule(registry,'quant'),artifact:'/quant/data/product/factor-evidence-v1/',asOf,
   generatedAt:(status&&status.generatedAt)||screening.generatedAt||null,methodologyVersion:screening.methodologyVersion,
   factorOrder:FE.FACTOR_ORDER,bands:FE.BANDS.map(b=>({id:b.id,label:b.label})),
   publication:{compositeAllowed:false,rankingAllowed:false,reason:(screening.publication&&screening.publication.reason)||'QUANT_V2_NOT_ACTIVE',
    explanation:(screening.publication&&screening.publication.explanation)||null},universe:summary&&summary.count||null};
 });

 // ---- Technik: 52W-Hoch, Volumen, Trend (Plattformdefinition aus market-factors.js, siehe discover/engines/high52w.js)
 tryPart('technical',()=>{
  const ds=readJson(root,'technical/data/screener-v1.json');if(!ds||!ds.cols||!Array.isArray(ds.cols.s))throw Error('TECHNICAL_SCREENER_MISSING');
  const c=ds.cols,n=c.s.length;
  for(let k=0;k<n;k++){
   const t=c.s[k];let sid;try{sid=Identity.securityIdForTicker(t);}catch{continue;}
   if(c.sid&&c.sid[k]&&c.sid[k]!==sid){withheld['technical:IDENTITY_MISMATCH']=(withheld['technical:IDENTITY_MISMATCH']||0)+1;continue;}
   const hit=listingFor(t,sid,null);
   if(!hit.row){note(hit.rows,'technical',hit.reason);continue;}
   const pick=f=>c[f]?c[f][k]:null;
   Object.assign(hit.row,{td:pick('asOf'),tf:pick('fresh')===true?1:pick('fresh')===false?0:null,
    h52:pick('newHigh52w'),h52w:pick('newHigh52w@1W'),h52m:pick('newHigh52w@1M'),dh:round(pick('distHigh52w'),4),
    rv:round(pick('relVol'),2),vs:pick('volSpike'),rsi:round(pick('rsi14'),1),a200:pick('aboveSma200'),st:pick('structure')||null});
  }
  sources.technical={...domainRule(registry,'technicalWorld'),artifact:'/technical/data/screener-v1.json',schema:ds.schemaVersion,asOf:ds.asOf||null,
   generatedAt:ds.generatedFrom||null,definitions:{newHigh52w:'Tageshoch erreicht das 252-Sitzungen-Hoch (einschliesslich heute), split-bereinigt',
   near:'Abstand zum 52W-Hoch hoechstens 5 % (wie Discover nearHigh/watch)',volSpike:'Volumen mindestens 2-fach Durchschnitt (relVol >= 2)',
   weekly:'newHigh52w@1W/@1M: auf Wochen-/Monatsschluss gerechnet, kein Ereignisprotokoll'}};
 });

 // ---- Supertrader: Zustaende und Freigabe der Strategie
 tryPart('supertrader',()=>{
  const sig=readJson(root,'supertrader/data/signals-core.json'),reg=readJson(root,'supertrader/data/registry-core.json'),build=readJson(root,'supertrader/data/build.json');
  if(!sig||!sig.bySymbol||!reg||!Array.isArray(reg.strategies))throw Error('SUPERTRADER_MISSING');
  const strategies={};
  for(const s of reg.strategies){
   const ev=s.evidence||{};
   /* Freigegeben nur: LIVE, Stufe CRITERIA_MET, nicht als Forschung dargestellt (supertrader.js#isResearchS) UND mit
      benannter Regelversion. Gueltig ist spaeter nur ein Signal genau dieser Version (siehe releasedVersion unten). */
   const released=s.mode==='LIVE'&&ev.level==='CRITERIA_MET'&&ev.presentation!=='RESEARCH'&&typeof ev.version==='string'&&/^\d+\.\d+\.\d+$/.test(ev.version);
   strategies[s.strategy_id]={name:s.strategy_name||s.strategy_id,mode:s.mode||null,level:ev.level||'NOT_TESTED',levelLabel:ev.levelLabel||null,
    presentation:ev.presentation||null,presentationLabel:ev.presentationLabel||null,released,releasedVersion:released?ev.version:null,slug:s.slug||null};
  }
  for(const [t,entries] of Object.entries(sig.bySymbol)){
   let sid;try{sid=Identity.securityIdForTicker(t);}catch{continue;}
   const hit=listingFor(t,sid,null);
   if(!hit.row){note(hit.rows,'supertrader',hit.reason);continue;}
   /* [Strategie, Zustand, Regelversion des Signals] - die Version steht in der Signal-ID (…:v3.2.0), WATCH-Eintraege haben keine. */
   const open=(entries||[]).filter(e=>strategies[e.strategyId]&&OPEN_STATES.includes(e.state))
    .map(e=>{const v=/:v(\d+\.\d+\.\d+)$/.exec(String(e.id||''));return [e.strategyId,e.state,v?v[1]:null];});
   hit.row.sts=open.length?open:[];
  }
  sources.supertrader={...domainRule(registry,'supertrader'),artifact:'/supertrader/data/signals-core.json',asOf:(build&&build.asOf)||sig.asOf||null,
   generatedAt:sig.inputsGeneratedAt||null,strategies,lifecycle:(reg.lifecycle&&reg.lifecycle.labels)||{},openStates:OPEN_STATES,
   slices:new Set(((build&&build.slices&&build.slices.stock)||[]))};
 });

 // ---- Optionale Euro-Anzeige (nur vorbereitet, Standard aus): EZB-Referenzkurse aus quant/data/market/fx/ecb (vorhandener
 //      Datenlauf, kein neuer Anbieter). Je Listing-Waehrung der letzte Kurs bis zum Kursstand; massgeblich bleibt die Listing-Waehrung.
 tryPart('fx',()=>{
  const asOf=sources.price&&sources.price.asOf;if(!asOf)throw Error('PRICE_ASOF_MISSING');
  const need=[...new Set(rows.filter(r=>r.c&&r.pu&&r.pu!=='EUR').map(r=>r.pu))].sort(),rates={};
  for(const cur of need){
   const ser=readJson(root,'quant/data/market/fx/ecb/EUR'+cur+'.json');
   if(!ser||ser.base!=='EUR'||ser.quote!==cur||!Array.isArray(ser.points))continue;
   let hit=null;for(const p of ser.points){if(p[0]<=asOf&&p[1]>0)hit=p;else if(p[0]>asOf)break;}
   if(hit)rates[cur]=[hit[0],hit[1]];
  }
  sources.fx={artifact:'/quant/data/market/fx/ecb/',base:'EUR',source:'ecb',attribution:'Wechselkurse: Europäische Zentralbank (EZB-Referenzkurse).',
   asOf,rates,note:'EUR je Listing-Waehrung (EZB: 1 EUR = rate Fremdwaehrung). Nur Anzeigehilfe, Listing-Waehrung bleibt massgeblich.'};
 });

 // ---- Kalender: Handelstage nach dem aeltesten Quellstand, damit der Browser veraltete Daten ohne Engine erkennt
 const oldest=[sources.price,sources.supertrader,sources.technical].map(s=>s&&s.asOf).filter(Boolean).sort()[0]||null;
 const sessions=[];
 if(oldest&&calendar){let d=oldest;for(let k=0;k<40;k++){d=TS.nextTradingDay(d,{calendar});if(!d)break;sessions.push(d);}}

 // ---- spaltenweise ausgeben
 const FIELDS=['i','s','n','x','cu','act','del','el','c','cd','pu','q','qdq','qd','mc','td','tf','h52','h52w','h52m','dh','rv','vs','rsi','a200','st','sts','why'];
 rows.sort((a,b)=>a.s<b.s?-1:a.s>b.s?1:a.i<b.i?-1:1);
 const cols={};for(const f of FIELDS)cols[f]=rows.map(r=>r[f]===undefined?null:r[f]);
 const slices=sources.supertrader&&sources.supertrader.slices;
 if(slices){cols.stp=rows.map(r=>slices.has(r.s)&&r.act===1&&!r.iq?1:0);delete sources.supertrader.slices;}
 const doc={schemaVersion:SCHEMA,generatedAt:now.toISOString(),count:rows.length,calendar:{exchange:'XNYS',after:oldest,sessions},
  sources,skipped,withheld,fields:Object.keys(cols),cols};
 const report={rows:rows.length,priced:rows.filter(r=>r.c).length,quant:rows.filter(r=>r.q).length,technical:rows.filter(r=>r.td).length,
  supertrader:rows.filter(r=>r.sts&&r.sts.length).length,skipped,withheld};
 return {doc,report};
}

/* Auslieferung in Teilen, damit eine Watchlist nur laedt, was sie zeigt:
     meta.json            Quellen, Freigaben, Kalender, Felder (ein paar KB)
     rows/<shardKey>.json Zeilen je Company-Master-Scherbe (core/identity.js#shardKey des Tickers)
     names.json           i, s, n, x, act aller Instrumente - nur fuer Suche und Uebernahme, erst bei Bedarf geladen */
export function splitSummary(doc){
 const {cols,...meta}=doc,shards={};
 cols.s.forEach((s,k)=>{const key=Identity.shardKey(s);(shards[key]=shards[key]||[]).push(k);});
 const pick=(ks,fields)=>{const o={};for(const f of fields)o[f]=ks.map(k=>cols[f][k]);return o;};
 const rows={};for(const [key,ks] of Object.entries(shards))rows[key]={schemaVersion:doc.schemaVersion,shard:key,cols:pick(ks,doc.fields)};
 const all=cols.i.map((_,k)=>k),nameFields=['i','s','n','x','act'];
 return {meta:{...meta,shards:Object.keys(rows).sort()},rows,names:{schemaVersion:doc.schemaVersion,generatedAt:doc.generatedAt,fields:nameFields,cols:pick(all,nameFields)}};
}

export function writeSummary({root,out,now}){
 const {doc,report}=buildSummary(root,{now});
 const parts=splitSummary(doc);
 let bytes=0;
 const put=(rel,obj,budget)=>{const text=JSON.stringify(obj),n=Buffer.byteLength(text);if(budget&&n>budget)throw Error('WATCHLIST_SHARD_BUDGET_EXCEEDED:'+rel+':'+n);
  const p=join(out,rel);mkdirSync(dirname(p),{recursive:true});writeFileSync(p,text);bytes+=n;};
 put('meta.json',parts.meta,64*1024);
 for(const [key,part] of Object.entries(parts.rows)){if(!/^[A-Z0-9_]{1,2}$/.test(key))throw Error('WATCHLIST_SHARD_KEY_INVALID');put('rows/'+key+'.json',part,SHARD_BUDGET);}
 put('names.json',parts.names,2*1024*1024);
 return {...report,shards:Object.keys(parts.rows).length,bytes};
}

if(import.meta.url===`file://${process.argv[1]}`){
 const arg=n=>(process.argv.find(a=>a.startsWith('--'+n+'='))||'').slice(n.length+3);
 const root=arg('root')||join(dirname(new URL(import.meta.url).pathname),'../..');
 const out=arg('out');if(!out){console.error('--out=<verzeichnis> fehlt (nie in das Repository schreiben)');process.exit(2);}
 console.log(JSON.stringify(writeSummary({root,out}),null,1));
}
