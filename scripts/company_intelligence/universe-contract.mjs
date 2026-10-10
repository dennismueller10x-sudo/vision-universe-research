/* Full structural consumer validation; no browser per issuer, no network. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {validateManifest} from './public-delivery.mjs';
import {eligibilityValid,moduleNames} from './universe-approval.mjs';
const require=createRequire(import.meta.url),api=require('../../company-intelligence/api/contract.js');
const sandbox={VUCompanyIntelligence:api};runInNewContext(readFileSync(new URL('../../company-intelligence/ui/stock-section.js',import.meta.url),'utf8'),sandbox);
export async function universeContracts(directory){
 const m=validateManifest(JSON.parse(readFileSync(join(directory,'manifest.json'))));assert(eligibilityValid(m));
 const values=new Map();
 for(const [path,meta] of Object.entries(m.assets)){
  const b=readFileSync(join(directory,path));assert.equal(b.length,meta.bytes,path);assert.equal(createHash('sha256').update(b).digest('hex'),meta.sha256,path);
  const p=JSON.parse(b);values.set(path,p);
  if(path==='index.json'||path.includes('/lookup/'))continue;
  const r=m.eligibility[p.companyId];assert(r,p.companyId);assert.deepEqual(p.eligibility.modules,r.modules);assert.equal(p.sourceUsagePolicy,undefined); // provenance policy lives in generation manifest
  const vm=sandbox.VUCompanyIntelligenceStock.viewModel(p,Date.parse(m.generatedAt));
  assert.equal(Boolean(p.companyProfile),r.modules.profile,p.companyId+':profile');
  assert.equal(p.latestFinancials.state==='AVAILABLE'&&vm.metrics.length>0,r.modules.financials,p.companyId+':financials');
  assert.equal(vm.changes.length>0,r.modules.whatChanged,p.companyId+':whatChanged');
  assert.equal(vm.recent.length>0,r.modules.aktuelles,p.companyId+':aktuelles');
  assert.equal(vm.confirmed.length+vm.estimates.length>0,r.modules.nextEvent,p.companyId+':nextEvent');
  if(r.modules.profile)assert.equal(p.companyProfile.language,'de');
  if(p.latestFinancials.state==='AVAILABLE')assert.equal(typeof p.latestFinancials.stale,'boolean');
  function publicRows(v,profile=false){
   if(!v||typeof v!=='object')return;
   for(const [key,value] of Object.entries(v)){
    assert(!['body','articleBody','fullText','html','checkpoint','checkpoints','sourceHealth','discoveryCheckpoint','backfillCursor'].includes(key),p.companyId+':private:'+key);
    if(/(?:Url|url)$/.test(key)&&value)assert(api.safeLink(value)&&value.startsWith('https:'),p.companyId+':link');
    publicRows(value,profile||key==='companyProfile');
   }
  }
  publicRows(p);
 }
 const fetch=async path=>({ok:values.has(path.slice(1)),status:values.has(path.slice(1))?200:404,json:async()=>values.get(path.slice(1))});
 for(const [cid,r] of Object.entries(m.eligibility))for(const ticker of r.tickers){
  const p=await api.load(ticker,{enabled:true,expectedGeneration:m.generation,base:'/',fetch,now:m.generatedAt});
  assert.equal(p.state,'AVAILABLE',ticker+':'+p.reason);assert.equal(p.companyId,cid,ticker);
 }
 return {status:'PASS',generation:m.generation,issuers:Object.keys(m.eligibility).length,listings:m.tickers.length,verifiedAssets:values.size,
  modules:Object.fromEntries(moduleNames.map(k=>[k,Object.values(m.eligibility).filter(r=>r.modules[k]).length]))};
}
