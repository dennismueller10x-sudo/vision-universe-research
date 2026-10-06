import test from 'node:test';import assert from 'node:assert/strict';
import {directory,closeSeries,materialize} from '../materialize-de-eu.mjs';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,symlinkSync,mkdirSync,readdirSync,lstatSync,utimesSync,chmodSync,existsSync,linkSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Core=require('../../../core/client.js');
import {permitted} from '../../vu2/build-release.mjs';
const row={isin:'DE0007164600',mic:'XETR',ticker:'SAP',assetType:'EQUITY',mappingStatus:'VERIFIED',mappingSource:'official',indexMemberships:['DAX','DAX','TECDAX'],tradingCurrency:'EUR',quoteUnit:'MAJOR',listingCountry:'DE'};
const h={isin:row.isin,mic:row.mic,currency:'EUR',quoteUnit:'MAJOR',provider:'marketstack',sourceEvidence:'original sha',points:[['2026-10-01',100],['2026-10-02',101]],quality:{status:'PARTIAL',gaps:['2026-09-30']}};
test('canonical multi-index directory and gap-preserving unknown-basis close series',()=>{
 const r=directory([row],'2026-10-06').listings[0];assert.deepEqual(r.indexMemberships,['DAX','TECDAX']);
 const s=closeSeries(r,h,{asOf:'2026-10-06',expectedSession:'2026-10-05'});assert.equal(s.freshness,'STALE');assert.equal(s.changeVerified,false);assert.deepEqual(s.points,h.points);assert.deepEqual(s.quality,h.quality);
 assert.throws(()=>closeSeries(r,{...h,mic:'XNAS'},{asOf:'2026-10-06'}));
 assert.throws(()=>closeSeries(r,{...h,points:[['2026-10-02',1],['2026-10-02',2]]},{asOf:'2026-10-06'}));
 assert.throws(()=>closeSeries(r,{...h,bars:[{date:'2026-10-01',close:10},{date:'2026-10-02',close:11}]},{asOf:'2026-10-06'}),/COMPETING_HISTORY_PROJECTION/);
 assert.throws(()=>directory([row,row],'2026-10-06'));
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
