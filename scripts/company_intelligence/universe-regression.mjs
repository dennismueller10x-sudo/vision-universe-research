/* Scope reduction is permitted per issuer; systemic collapses are refused. */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const read=p=>JSON.parse(readFileSync(p));
const digest=p=>createHash('sha256').update(JSON.stringify(p)).digest('hex');
export function universeChanges(directory,previous){
 const m=read(join(directory,'manifest.json')),prior=read(join(previous,'index.json'));
 const oldPaths={};
 // An initial universe release compares every preserved existing cohort issuer.
 const oldManifestPath=join(previous,'manifest.json');
 let oldManifest;try{oldManifest=read(oldManifestPath);}catch{throw Error('PREVIOUS_VERIFIED_MANIFEST_REQUIRED');}
 for(const path of Object.keys(oldManifest.assets))if(path!=='index.json'&&!path.includes('/lookup/'))oldPaths[path.split('/').at(-1).replace(/\.json$/,'')]=path;
 const counts={profiles:0,news:0,financials:0},oldCounts={profiles:0,news:0,financials:0},changed=[],removed=[],remapped=[];
 for(const [cid,path] of Object.entries(oldPaths)){
  const p=read(join(previous,path));oldCounts.profiles+=Boolean(p.companyProfile);oldCounts.news+=p.news.length;oldCounts.financials+=p.latestFinancials.state==='AVAILABLE';
  const current=m.eligibility[cid];if(!current){removed.push(cid);continue;}
  const q=read(join(directory,`snapshots/${m.generation}/${cid}.json`));
  const identities=v=>v.listings.map(l=>[l.symbol,l.instrumentId]).sort();
  if(JSON.stringify(identities(p))!==JSON.stringify(identities(q)))remapped.push(cid);
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
  changedIssuers:changed,removedIssuers:removed,identityRemappings:remapped.length,previousGeneration:prior.generation};
}
