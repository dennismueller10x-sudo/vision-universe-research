import test from 'node:test';import assert from 'node:assert/strict';
import {directory,closeSeries,materialize} from '../materialize-de-eu.mjs';
import {mkdtempSync,readFileSync,rmSync,symlinkSync,mkdirSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {permitted} from '../../vu2/build-release.mjs';
const row={isin:'DE0007164600',mic:'XETR',ticker:'SAP',assetType:'EQUITY',mappingStatus:'VERIFIED',mappingSource:'official',indexMemberships:['DAX','DAX','TECDAX'],tradingCurrency:'EUR',quoteUnit:'MAJOR',listingCountry:'DE'};
const h={isin:row.isin,mic:row.mic,currency:'EUR',quoteUnit:'MAJOR',provider:'marketstack',sourceEvidence:'original sha',points:[['2026-10-01',100],['2026-10-02',101]],quality:{status:'PARTIAL',gaps:['2026-09-30']}};
test('canonical multi-index directory and gap-preserving unknown-basis close series',()=>{
 const r=directory([row],'2026-10-06').listings[0];assert.deepEqual(r.indexMemberships,['DAX','TECDAX']);
 const s=closeSeries(r,h,{asOf:'2026-10-06',expectedSession:'2026-10-05'});assert.equal(s.freshness,'STALE');assert.equal(s.changeVerified,false);assert.deepEqual(s.points,h.points);assert.deepEqual(s.quality,h.quality);
 assert.throws(()=>closeSeries(r,{...h,mic:'XNAS'},{asOf:'2026-10-06'}));
 assert.throws(()=>closeSeries(r,{...h,points:[['2026-10-02',1],['2026-10-02',2]]},{asOf:'2026-10-06'}));
 assert.throws(()=>directory([row,row],'2026-10-06'));
});
test('private output rejects symlink parents and nested core/data escapes',()=>{
 const out=mkdtempSync(join(tmpdir(),'vu-de-eu-links-'));try{
 symlinkSync(process.cwd(),join(out,'repo'),'dir');assert.throws(()=>materialize({rows:[row],asOf:'2026-10-06',out:join(out,'repo','tmp')}),/SYMLINK/);
 mkdirSync(join(out,'private'));symlinkSync(process.cwd(),join(out,'private','core'),'dir');
 assert.throws(()=>materialize({rows:[row],asOf:'2026-10-06',out:join(out,'private')}),/SYMLINK/);
 }finally{rmSync(out,{recursive:true,force:true});}
});
test('public release excludes private EU series and internal source metadata',()=>{
 assert.equal(permitted('core/data/de-eu/series/lst_XETR_DE0007164600.json'),false);
 assert.equal(permitted('core/config/de-eu-reference-sources.json'),false);
 assert.equal(permitted('reports/marketstack/de-eu/de_eu_product_readiness.json'),false);
 assert.equal(permitted('core/client.js'),true);
});
test('same input repeats byte-identically; private raw values never reach repository',()=>{
 const out=mkdtempSync(join(tmpdir(),'vu-de-eu-'));try{
 const r=directory([row],'2026-10-06').listings[0],input={rows:[row],histories:{[r.listingId]:h},asOf:'2026-10-06',out};
 materialize(input);const one=readFileSync(join(out,'core/data/de-eu/listings.json'),'utf8');
 materialize(input);assert.equal(readFileSync(join(out,'core/data/de-eu/listings.json'),'utf8'),one);
 assert.throws(()=>materialize({...input,out:process.cwd()}),/PRIVATE_OUTPUT/);
 }finally{rmSync(out,{recursive:true,force:true});}
});
