import test from 'node:test';import assert from 'node:assert/strict';
import {directory,closeSeries,materialize,certifiedReadiness} from '../materialize-de-eu.mjs';
import {createHash} from 'node:crypto';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,symlinkSync,mkdirSync,readdirSync,lstatSync,utimesSync,chmodSync,existsSync,linkSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Core=require('../../../core/client.js');
import {permitted} from '../../vu2/build-release.mjs';
const row={isin:'DE0007164600',mic:'XETR',ticker:'SAP',assetType:'EQUITY',mappingStatus:'VERIFIED',mappingSource:'official',indexMemberships:['DAX','DAX','TECDAX'],tradingCurrency:'EUR',quoteUnit:'MAJOR',listingCountry:'DE'};
const h={isin:row.isin,mic:row.mic,currency:'EUR',quoteUnit:'MAJOR',provider:'marketstack',sourceEvidence:'original sha',points:[['2026-10-01',100],['2026-10-02',101]],quality:{status:'PARTIAL',gaps:['2026-09-30']}};
test('certified chart window is a distinct central projection; current price remains full-series truth',async()=>{
 const out=mkdtempSync(join(tmpdir(),'vu-certified-window-'));try{
  const r=directory([row],'2026-10-06').listings[0],bars=h.points.map(p=>({date:p[0],close:p[1]}));
  const history={...h,bars},inputSeriesHash=createHash('sha256').update(JSON.stringify(bars)).digest('hex');
  const proof={status:'PARTIAL',state:'CHART_READY_WITH_LIMITATION',asOf:'2026-10-02',inputSeriesHash,window:{start:'2026-10-02',end:'2026-10-02'},evidence:['sha256:actual-cert'],cause:'UNKNOWN_ADJUSTMENT_BASIS'};
  const input={rows:[row],histories:{[r.listingId]:history},asOf:'2026-10-06',out,expectedSessions:{XETR:'2026-10-02'},readiness:{[r.listingId]:{chart:proof}}};
  materialize(input);const c=Core.create({load:async path=>JSON.parse(readFileSync(join(out,path),'utf8'))});
  const [series,latest,screen,list]=await Promise.all([c.getListingPriceSeries(r.listingId),c.getListingLatestPrice(r.listingId),c.getListingScreener(),c.getListing(r.listingId)]);
  assert.equal(series.state,'AVAILABLE');assert.deepEqual(series.data.chartPoints,[h.points[1]]);assert.deepEqual(series.data.points,h.points);
  assert.equal(latest.data.close,101);assert.deepEqual(latest.data,screen.data.listings[0].price);assert.deepEqual(series.data.readiness,list.data.readiness);
  assert.equal(series.data.readiness.technical.status,'NOT_TESTED');assert.equal(latest.data.provider,'marketstack');assert.deepEqual(latest.data.quality,h.quality);
  assert.equal(materialize(input).changed,false);
  for(const patch of [{inputSeriesHash:'0'.repeat(64)},{asOf:'2026-10-06'},{evidence:[]},{status:'READY'},{window:{start:'2026-09-01',end:'2026-10-01'}}])assert.throws(()=>materialize({...input,readiness:{[r.listingId]:{chart:{...proof,...patch}}}}),/READINESS_/);
  assert.throws(()=>materialize({...input,expectedSessions:{XETR:'2026-10-05'}}),/CHART_FRESHNESS_CONTRADICTION/);
  const p=join(out,'core/data/de-eu/series',r.listingId+'.json'),v=JSON.parse(readFileSync(p));v.chartPoints=h.points;writeFileSync(p,JSON.stringify(v));
  const tampered=Core.create({load:async path=>JSON.parse(readFileSync(join(out,path),'utf8'))});assert.equal((await tampered.getListingPriceSeries(r.listingId)).reason,'LOCAL_CHART_WINDOW_INVALID');
 }finally{rmSync(out,{recursive:true,force:true});}
});
test('a stale EOD cannot acquire a READY freshness state through readiness evidence',()=>{
 const series={asOf:'2026-10-02',points:h.points};
 assert.throws(()=>certifiedReadiness({latestEod:{status:'READY',state:'STALE',asOf:series.asOf,inputSeriesHash:'a'.repeat(64),window:{start:series.asOf,end:series.asOf},evidence:['calendar']}},series,'a'.repeat(64)),/STATUS_STATE_MISMATCH/);
 const proof={status:'READY',state:'FRESH_LAST_VALID_SESSION',asOf:series.asOf,inputSeriesHash:'a'.repeat(64),window:{start:series.asOf,end:series.asOf},evidence:['calendar']};
 for(const freshness of ['STALE','UNKNOWN','STALE_CACHE'])assert.throws(()=>certifiedReadiness({latestEod:proof},{...series,expectedSession:'2026-10-06',freshness},proof.inputSeriesHash),/FRESHNESS_CONTRADICTION/);
 assert.throws(()=>certifiedReadiness({latestEod:proof},{...series,expectedSession:null,freshness:'CURRENT'},proof.inputSeriesHash),/FRESHNESS_CONTRADICTION/);
 assert.equal(certifiedReadiness({latestEod:proof},{...series,expectedSession:series.asOf,freshness:'CURRENT'},proof.inputSeriesHash).latestEod.status,'READY');
});
test('issuer domicile is independently proved and never inferred from Xetra or DAX membership',()=>{
 const companyReference={lei:'549300V9QSIG4WX4GJ96',domicileCountry:'NL',basis:'EXACT_GLEIF_ISIN_LEI_REFERENCE',
  evidence:{sourceSystem:'GLEIF_ANNA_ISIN_TO_LEI_AND_GLEIF_LEGAL_ENTITY_REFERENCE',leiBatchResponseSHA256:'a'.repeat(64),leiRecordURL:'https://api.gleif.org/api/v1/lei-records/549300V9QSIG4WX4GJ96'}};
 const issuerRow={...row,issuerLEI:companyReference.lei,referencedIssuerId:'iss_lei_'+companyReference.lei};
 const proved=directory([{...issuerRow,companyReference}],'2026-10-06').listings[0];assert.equal(proved.companyCountry,'NL');assert.equal(proved.listingCountry,'DE');
 assert.equal(directory([row],'2026-10-06').listings[0].companyCountry,null);
 assert.equal(directory([{...issuerRow,companyReference:{...companyReference,evidence:{...companyReference.evidence,leiRecordURL:'https://api.gleif.org/api/v1/lei-records/WRONG'}}}],'2026-10-06').listings[0].companyCountry,null);
 assert.equal(directory([{...row,companyCountry:'DE'}],'2026-10-06').listings[0].companyCountry,'DE');
 assert.equal(directory([{...issuerRow,issuerLEI:'529900D6BF99LW9R2E68',companyReference}],'2026-10-06').listings[0].companyCountry,null);
 assert.equal(directory([{...issuerRow,referencedIssuerId:'iss_lei_529900D6BF99LW9R2E68',companyReference}],'2026-10-06').listings[0].companyCountry,null);
 assert.equal(directory([{...row,companyReference}],'2026-10-06').listings[0].companyCountry,null);
 const esma={...companyReference,domicileCountry:'LU',basis:'EXACT_ESMA_ISIN_LEI_REFERENCE',evidence:{...companyReference.evidence,sourceSystem:'ESMA_FIRDS_EXACT_ISIN_ISSUER_LEI_AND_GLEIF_LEGAL_ENTITY_REFERENCE',regulatoryResponseSHA256:'b'.repeat(64)}};
 assert.equal(directory([{...issuerRow,companyReference:esma}],'2026-10-06').listings[0].companyCountry,'LU');
 assert.equal(directory([{...issuerRow,companyReference:{...esma,evidence:{...esma.evidence,regulatoryResponseSHA256:null}}}],'2026-10-06').listings[0].companyCountry,null);
});
test('canonical multi-index directory and gap-preserving unknown-basis close series',()=>{
 const r=directory([row],'2026-10-06').listings[0];assert.deepEqual(r.indexMemberships,['DAX','TECDAX']);
 const s=closeSeries(r,h,{asOf:'2026-10-06',expectedSession:'2026-10-05'});assert.equal(s.freshness,'STALE');assert.equal(s.changeVerified,false);assert.deepEqual(s.points,h.points);assert.deepEqual(s.quality,h.quality);
 assert.throws(()=>closeSeries(r,{...h,mic:'XNAS'},{asOf:'2026-10-06'}));
 assert.throws(()=>closeSeries(r,{...h,points:[['2026-10-02',1],['2026-10-02',2]]},{asOf:'2026-10-06'}));
 assert.throws(()=>closeSeries(r,{...h,bars:[{date:'2026-10-01',close:10},{date:'2026-10-02',close:11}]},{asOf:'2026-10-06'}),/COMPETING_HISTORY_PROJECTION/);
 assert.throws(()=>directory([row,row],'2026-10-06'));
});
test('a proven completed-session lower bound marks older EOD stale but never invents exact freshness',()=>{
 const r=directory([row],'2026-10-06').listings[0],opts={asOf:'2026-10-06',lastProvenCompletedSession:'2026-10-05'};
 assert.equal(closeSeries(r,h,opts).freshness,'STALE');assert.equal(closeSeries(r,h,opts).expectedSession,null);
 const current={...h,points:[...h.points,['2026-10-05',102]]};assert.equal(closeSeries(r,current,opts).freshness,'UNKNOWN');
 assert.equal(closeSeries(r,{...current,points:[...current.points,['2026-10-06',103]]},opts).freshness,'UNKNOWN');
 assert.throws(()=>closeSeries(r,h,{...opts,lastProvenCompletedSession:'2026-10-07'}),/FIXED_AS_OF_REQUIRED/);
 assert.throws(()=>closeSeries(r,h,{...opts,expectedSession:'2026-10-02'}),/FIXED_AS_OF_REQUIRED/);
});
test('private output rejects symlink parents and nested core/data escapes',()=>{
 const out=mkdtempSync(join(tmpdir(),'vu-de-eu-links-'));try{
 symlinkSync(process.cwd(),join(out,'repo'),'dir');assert.throws(()=>materialize({rows:[row],asOf:'2026-10-06',out:join(out,'repo','tmp')}),/SYMLINK/);
 mkdirSync(join(out,'private'));symlinkSync(process.cwd(),join(out,'private','core'),'dir');
 assert.throws(()=>materialize({rows:[row],asOf:'2026-10-06',out:join(out,'private')}),/SYMLINK/);
 mkdirSync(join(out,'sibling-worktree'));writeFileSync(join(out,'sibling-worktree','.git'),'gitdir: /another/repository/worktrees/sibling');
 assert.throws(()=>materialize({rows:[row],asOf:'2026-10-06',out:join(out,'sibling-worktree','private')}),/OUTSIDE_REPOSITORY/);
 }finally{rmSync(out,{recursive:true,force:true});}
});
test('public release excludes private EU series and internal source metadata',()=>{
 assert.equal(permitted('core/data/de-eu/series/lst_XETR_DE0007164600.json'),false);
 assert.equal(permitted('core/config/de-eu-reference-sources.json'),false);
 assert.equal(permitted('reports/marketstack/de-eu/de_eu_product_readiness.json'),false);
 assert.equal(permitted('core/client.js'),true);
});
function treeSnapshot(root){
 const snapshots={};function walk(path,relative=''){const stat=lstatSync(path,{bigint:true});snapshots[relative]={inode:stat.ino.toString(),mtime:stat.mtimeNs.toString(),bytes:stat.isFile()?readFileSync(path).toString('base64'):null};if(stat.isDirectory())for(const name of readdirSync(path).sort())walk(join(path,name),relative?relative+'/'+name:name);}walk(root);return snapshots;
}
function freezeMtimes(root){for(const name of readdirSync(root)){const path=join(root,name);if(lstatSync(path).isDirectory())freezeMtimes(path);else utimesSync(path,1000000000,1000000000);}utimesSync(root,1000000000,1000000000);}
test('identical input preserves every output inode/mtime/byte and upgrades legacy private modes without rewriting',()=>{
 const out=mkdtempSync(join(tmpdir(),'vu-de-eu-'));try{
 const r=directory([row],'2026-10-06').listings[0],input={rows:[row],histories:{[r.listingId]:h},asOf:'2026-10-06',out};
 assert.equal(materialize(input).changed,true);const target=join(out,'core/data/de-eu'),listings=join(target,'listings.json');
 assert.equal(lstatSync(listings).mode&0o777,0o600);assert.equal(lstatSync(target).mode&0o777,0o700);
 chmodSync(listings,0o644);chmodSync(target,0o755);freezeMtimes(out);const before=treeSnapshot(out);
 assert.equal(materialize(input).changed,false);assert.deepEqual(treeSnapshot(out),before);assert.equal(lstatSync(listings).mode&0o777,0o600);assert.equal(lstatSync(target).mode&0o777,0o700);
 assert.equal(existsSync(target+'.previous'),false);assert.throws(()=>materialize({...input,out:process.cwd()}),/PRIVATE_OUTPUT/);
 }finally{rmSync(out,{recursive:true,force:true});}
});
test('per-listing private history input produces the same contract without a combined JSON string and rejects unsafe files',()=>{
 const out=mkdtempSync(join(tmpdir(),'vu-de-eu-files-'));try{
  const historiesDir=join(out,'normalized');mkdirSync(historiesDir);const id=directory([row],'2026-10-06').listings[0].listingId,p=join(historiesDir,id+'.json');writeFileSync(p,JSON.stringify(h));
  const input={rows:[row],asOf:'2026-10-06',out};materialize({...input,histories:{[id]:h}});const before=treeSnapshot(join(out,'core'));
  assert.equal(materialize({...input,historiesDir}).changed,false);assert.deepEqual(treeSnapshot(join(out,'core')),before);
  assert.throws(()=>materialize({...input,historiesDir,histories:{[id]:h}}),/COMPETING_HISTORY_INPUTS/);
  rmSync(p);symlinkSync(join(out,'core/data/de-eu/listings.json'),p);assert.throws(()=>materialize({...input,historiesDir}),/SYMLINK/);
  rmSync(p);linkSync(join(out,'core/data/de-eu/listings.json'),p);assert.throws(()=>materialize({...input,historiesDir}),/FILE_TYPE_REJECTED/);
 }finally{rmSync(out,{recursive:true,force:true});}
});
test('a real new EOD replaces the owned tree and updates screener/detail/chart through the same central contract',async()=>{
 const out=mkdtempSync(join(tmpdir(),'vu-de-eu-new-eod-'));try{
 const r=directory([row],'2026-10-06').listings[0],input={rows:[row],histories:{[r.listingId]:h},asOf:'2026-10-06',out,expectedSessions:{XETR:'2026-10-05'}};
 materialize(input);const target=join(out,'core/data/de-eu'),oldInode=lstatSync(target).ino;
 const updated={...h,points:[...h.points,['2026-10-05',102.25]]};assert.equal(materialize({...input,histories:{[r.listingId]:updated}}).changed,true);assert.notEqual(lstatSync(target).ino,oldInode);
 const c=Core.create({load:async path=>JSON.parse(readFileSync(join(out,path),'utf8'))});const [screener,latest,series]=await Promise.all([c.getListingScreener(),c.getListingLatestPrice(r.listingId),c.getListingPriceSeries(r.listingId)]);
 assert.equal(latest.state,'AVAILABLE');assert.equal(latest.data.close,102.25);assert.equal(latest.data.date,'2026-10-05');assert.equal(latest.data.freshness,'CURRENT');assert.deepEqual(screener.data.listings[0].price,latest.data);assert.equal(series.data.points.at(-1)[1],latest.data.close);assert.equal(existsSync(target+'.previous'),false);
 assert.equal(materialize({...input,histories:{[r.listingId]:updated}}).changed,false);
 }finally{rmSync(out,{recursive:true,force:true});}
});
test('stale extra files force a clean generated tree; symlinks and hardlinks never receive producer writes',()=>{
 const out=mkdtempSync(join(tmpdir(),'vu-de-eu-tree-'));try{
 const input={rows:[row],asOf:'2026-10-06',out},target=join(out,'core/data/de-eu');materialize(input);
 writeFileSync(join(target,'stale.json'),'stale');assert.equal(materialize(input).changed,true);assert.equal(existsSync(join(target,'stale.json')),false);
 const external=join(out,'protected.json');writeFileSync(external,'protected',{mode:0o644});chmodSync(external,0o644);const original=treeSnapshot(out);symlinkSync(external,join(target,'unowned.json'));assert.throws(()=>materialize(input),/SYMLINK/);assert.equal(readFileSync(external,'utf8'),'protected');assert.equal(existsSync(target+'.previous'),false);rmSync(join(target,'unowned.json'));
 linkSync(external,join(target,'unowned.json'));assert.throws(()=>materialize(input),/LINK_REJECTED/);assert.equal(lstatSync(external).mode&0o777,0o644);rmSync(join(target,'unowned.json'));assert.equal(treeSnapshot(out)['protected.json'].mtime,original['protected.json'].mtime);
 }finally{rmSync(out,{recursive:true,force:true});}
});

test('optional consumer compaction preserves prices, readiness gates and full private input hashes',()=>{
 const out=mkdtempSync(join(tmpdir(),'vu-local-compact-'));try{
  const r=directory([row],'2026-10-06').listings[0],bars=h.points.map(p=>({date:p[0],close:p[1]})),hash=createHash('sha256').update(JSON.stringify(bars)).digest('hex');
  const evidence=Array.from({length:80},(_,i)=>'private-long-original-source-'+i+'x'.repeat(200)),proof={status:'READY',state:'CHART_READY',asOf:'2026-10-02',dataAsOf:'2026-10-06',inputSeriesHash:hash,window:{start:h.points[0][0],end:'2026-10-02'},evidence};
  const input={rows:[{...row,aliases:['SAP local'],sourceEvidence:evidence,referenceEvidence:[{privateGraph:'x'.repeat(50000)}]}],histories:{[r.listingId]:{...h,bars}},asOf:'2026-10-06',expectedSessions:{XETR:'2026-10-02'},readiness:{[r.listingId]:{chart:proof}},out};
  const before=JSON.stringify(input);materialize({...input,compactConsumerProjection:true});assert.equal(JSON.stringify(input),before);
  const dir=JSON.parse(readFileSync(join(out,'core/data/de-eu/listings.json'))),series=JSON.parse(readFileSync(join(out,'core/data/de-eu/series',r.listingId+'.json'))),scr=JSON.parse(readFileSync(join(out,'core/data/de-eu/screener.json')));
  const compact=dir.listings[0];assert.equal(compact.sourceEvidence,undefined);assert.equal(compact.referenceEvidence,undefined);assert.deepEqual(compact.aliases,['SAP local']);assert.match(compact.privateMetadataHash,/^[a-f0-9]{64}$/);
  assert.equal(compact.readiness.chart.status,'READY');assert.equal(compact.readiness.chart.evidence.length,1);assert.equal(compact.readiness.chart.evidenceCount,80);assert.equal(compact.readiness.chart.fullProofHash,createHash('sha256').update(JSON.stringify(proof)).digest('hex'));assert.deepEqual(series.readiness,compact.readiness);assert.deepEqual(scr.listings[0].price.readiness,compact.readiness);assert.deepEqual(series.points,h.points);assert.equal(materialize({...input,compactConsumerProjection:true}).changed,false);
  proof.window.end='2026-10-07';assert.throws(()=>materialize({...input,compactConsumerProjection:true}),/EVIDENCE_MISMATCH/);
 }finally{rmSync(out,{recursive:true,force:true});}
});
