/* Scope reduction is permitted per issuer; systemic collapses are refused. */
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const read=p=>JSON.parse(readFileSync(p));
const digest=p=>createHash('sha256').update(JSON.stringify(p)).digest('hex');
function masterInstruments(){
 const root=fileURLToPath(new URL('../../quant/data/universe/instruments/',import.meta.url));
 return readdirSync(root).filter(p=>p.endsWith('.json')).flatMap(p=>read(join(root,p)).instruments);
}
/* Register der belegten Tickerwechsel (ADR-009, quant/config/ticker-successions.json, gelesen ueber core/ticker-succession.js; je Eintrag
   gleiche CIK und zitierter Beleg). Nicht lesbar oder formfehlerhaft: leere Liste, also keine Nachfolge erklaert (fail closed).
   Eintraege mit retirePredecessor:false (Vorgaenger bleibt im Produkt) erklaeren nichts. */
export function loadSuccessions(){
 try{
  const require=createRequire(import.meta.url),{tickerSuccessions}=require('../../core/ticker-succession.js');
  const doc=read(fileURLToPath(new URL('../../quant/config/ticker-successions.json',import.meta.url)));
  return Object.values(tickerSuccessions(doc)).filter(e=>e.retirePredecessor!==false);
 }catch{return [];}
}
export function approvedNonEquityPrune(cid,before,after,master){
 // Only a strict subset of unchanged identities can be a pruning operation.
 // Additions, ticker/issuer moves, unexplained disappearance and ID changes
 // retain the original fail-closed guard. Consume the Master; never edit it.
 const key=l=>JSON.stringify([l.symbol,l.instrumentId]),old=new Set(before.map(key)),current=new Set(after.map(key));
 if(!after.length||old.size!==before.length||current.size!==after.length||after.some(l=>!old.has(key(l))))return false;
 const removed=before.filter(l=>!current.has(key(l)));
 if(!removed.length)return false;
 return removed.every(l=>{
  const matches=master.filter(r=>r.instrumentId===l.instrumentId||r.symbol===l.symbol);
  return matches.length===1&&matches[0].instrumentId===l.instrumentId&&matches[0].symbol===l.symbol
   &&matches[0].issuerId===cid&&cid==='iss_cik_'+matches[0].cik
   &&matches[0].productEligibility==='EXCLUDED'
   &&(nonEquityExclusion(matches[0])||endedListingExclusion(matches[0]));
 });
}
// Zwei erklaerte Abgangsarten, beide nur aus dem Master gelesen (nie editiert): bestaetigt kein Eigenkapital
// (CONFIRMED_NON_EQUITY:<Klasse>) oder bestaetigt beendete Notierung (Teil B3, eligibility-cleanup-2026-11-21:
// CONFIRMED_LISTING_ENDED:MASTER_INACTIVE|ACQUISITION|SUCCEEDED). Ein Abgang eines Teils der Notierungen eines weiter
// zugelassenen Emittenten ist damit erklaert; Neuzugaenge, Ticker-/Emittentenwechsel und ID-Aenderungen bleiben gesperrt.
const nonEquityExclusion=m=>['DEBT','ETN','RIGHT','WARRANT'].includes(m.securityClass)&&m.productEligibilityReason==='CONFIRMED_NON_EQUITY:'+m.securityClass;
const endedListingExclusion=m=>/^CONFIRMED_LISTING_ENDED:(MASTER_INACTIVE|ACQUISITION|SUCCEEDED)$/.test(String(m.productEligibilityReason));
/* Belegte Nachfolge (Kuerzelwechsel, Quant-Nachfolgeregister, 8-K mit gleicher CIK): Der Vorgaenger steht im Master als
   EXCLUDED CONFIRMED_LISTING_ENDED:SUCCEEDED und ist im Register der Tickerwechsel (ADR-009) belegt; der Nachfolger, der Nachfolger als ELIGIBLE beim SELBEN Emittenten (issuerId und CIK). Erklaert nur den
   Ersatz, nie ein Wachstum (hoechstens so viele neue wie entfallene Notierungen); unveraenderte Notierungen bleiben identisch.
   Der Master wird nur gelesen. Jede andere Umbelegung bleibt UNEXPLAINED_PUBLIC_IDENTITY_REMAPPING. */
export function approvedSuccession(cid,before,after,master,successions=[]){
 const key=l=>JSON.stringify([l.symbol,l.instrumentId]),old=new Set(before.map(key)),current=new Set(after.map(key));
 if(!after.length||old.size!==before.length||current.size!==after.length)return false;
 const removed=before.filter(l=>!current.has(key(l))),added=after.filter(l=>!old.has(key(l)));
 if(!removed.length||!added.length||added.length>removed.length)return false;
 const row=l=>{const m=master.filter(r=>r.instrumentId===l.instrumentId||r.symbol===l.symbol);return m.length===1&&m[0].instrumentId===l.instrumentId&&m[0].symbol===l.symbol&&m[0].issuerId===cid&&cid==='iss_cik_'+m[0].cik?m[0]:null;};
 return removed.every(l=>{const m=row(l);return m&&m.productEligibility==='EXCLUDED'&&m.productEligibilityReason==='CONFIRMED_LISTING_ENDED:SUCCEEDED';})
  &&added.every(l=>{const m=row(l);return m&&m.productEligibility==='ELIGIBLE';})
  // Belegt im Register (8-K, gleiche CIK): jede entfallene Notierung hat einen Eintrag auf eine der neuen, jede neue ist Ziel eines Eintrags.
  &&removed.every(l=>successions.some(e=>e.fromTicker===l.symbol&&cid==='iss_cik_'+e.cik&&added.some(a=>a.symbol===e.toTicker)))
  &&added.every(a=>successions.some(e=>e.toTicker===a.symbol&&cid==='iss_cik_'+e.cik&&removed.some(l=>l.symbol===e.fromTicker)));
}
export function universeChanges(directory,previous,{masterRows,successions}={}){
 const m=read(join(directory,'manifest.json')),prior=read(join(previous,'index.json'));
 const oldPaths={};
 // An initial universe release compares every preserved existing cohort issuer.
 const oldManifestPath=join(previous,'manifest.json');
 let oldManifest;try{oldManifest=read(oldManifestPath);}catch{throw Error('PREVIOUS_VERIFIED_MANIFEST_REQUIRED');}
 for(const path of Object.keys(oldManifest.assets))if(path!=='index.json'&&!path.includes('/lookup/'))oldPaths[path.split('/').at(-1).replace(/\.json$/,'')]=path;
 const counts={profiles:0,news:0,financials:0},oldCounts={profiles:0,news:0,financials:0},changed=[],removed=[],remapped=[],approvedPrunes=[],approvedSuccessions=[];
 for(const [cid,path] of Object.entries(oldPaths)){
  const p=read(join(previous,path));oldCounts.profiles+=Boolean(p.companyProfile);oldCounts.news+=p.news.length;oldCounts.financials+=p.latestFinancials.state==='AVAILABLE';
  const current=m.eligibility[cid];if(!current){removed.push(cid);continue;}
  const q=read(join(directory,`snapshots/${m.generation}/${cid}.json`));
  const identities=v=>v.listings.map(l=>[l.symbol,l.instrumentId]).sort();
  if(JSON.stringify(identities(p))!==JSON.stringify(identities(q))){
   masterRows??=masterInstruments();successions??=loadSuccessions();
   if(approvedNonEquityPrune(cid,p.listings,q.listings,masterRows))approvedPrunes.push({issuer:cid,removedListings:p.listings.length-q.listings.length});
   else if(approvedSuccession(cid,p.listings,q.listings,masterRows,successions))approvedSuccessions.push({issuer:cid,removedListings:p.listings.map(l=>l.symbol).filter(x=>!q.listings.some(n=>n.symbol===x)),addedListings:q.listings.map(l=>l.symbol).filter(x=>!p.listings.some(n=>n.symbol===x))});
   else remapped.push(cid);
  }
  if(p.latestFinancials.state==='AVAILABLE'&&q.latestFinancials.state==='AVAILABLE'&&(q.latestFinancials.reportingPeriod||'')<(p.latestFinancials.reportingPeriod||''))throw Error('FINANCIAL_PERIOD_REGRESSION');
 }
 if(remapped.length)throw Error('UNEXPLAINED_PUBLIC_IDENTITY_REMAPPING');
 for(const cid of Object.keys(m.eligibility)){
  const p=read(join(directory,`snapshots/${m.generation}/${cid}.json`));counts.profiles+=Boolean(p.companyProfile);counts.news+=p.news.length;counts.financials+=p.latestFinancials.state==='AVAILABLE';
  if(!oldPaths[cid])changed.push(cid);else{const q=read(join(previous,oldPaths[cid]));delete p.generatedAt;delete q.generatedAt;if(digest(p)!==digest(q))changed.push(cid);}
 }
 if(removed.length>Math.max(10,Math.floor(Object.keys(oldPaths).length*0.02)))throw Error('ELIGIBLE_ISSUER_COLLAPSE_REFUSED');
 for(const key of Object.keys(counts))if(oldCounts[key]-counts[key]>Math.max(key==='news'?100:5,oldCounts[key]*0.1))throw Error('MODULE_COVERAGE_COLLAPSE_REFUSED');
 return {status:'PASS',...counts,newsIssuers:Object.keys(m.eligibility).filter(cid=>read(join(directory,`snapshots/${m.generation}/${cid}.json`)).news.length>0).length,
  changedIssuers:changed,removedIssuers:removed,identityRemappings:remapped.length,
  approvedNonEquityPrunes:approvedPrunes,approvedSuccessions,previousGeneration:prior.generation};
}
