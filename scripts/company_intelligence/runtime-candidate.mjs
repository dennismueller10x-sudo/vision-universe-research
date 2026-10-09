import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewed} from './production-approval.mjs';
import {frozenInventory,frozenTickers,refreshConfig} from './refresh-approval.mjs';
export async function runtimeCandidate(origin='https://research.visionuniverse.de'){
 const candidate=JSON.parse(readFileSync(new URL('../../docs/company-intelligence/full-data-release-candidate.json',import.meta.url)));
 const get=async p=>{const r=await fetch(origin+p+'?refresh-proof='+Date.now(),{signal:AbortSignal.timeout(30000)});assert(r.ok,p);return r.json();};
 const delivery=await get('/company-intelligence-delivery.json');
 assert.equal(delivery.cohortStocks,46);assert.equal(delivery.issuers,45);
 if(delivery.generation===reviewed.generation)return {candidate,manifest:reviewed,delivery};
 const proof=await get('/company-intelligence-refresh.json');
 assert.equal(proof.schema,1);assert.equal(proof.status,'PASS');assert.equal(proof.generation,delivery.generation);
 assert.equal(proof.sourceUsagePolicy,refreshConfig.sourceUsagePolicy);assert.deepEqual(proof.manifest.tickers,frozenTickers);
 assert.deepEqual(Object.keys(proof.inventory).sort(),Object.keys(frozenInventory).sort());
 for(const [cid,v] of Object.entries(proof.inventory))assert.deepEqual(v.tickers,frozenInventory[cid].tickers);
 assert.deepEqual(Object.keys(proof.manifest.assets).filter(p=>p!=='index.json'&&!p.includes('/lookup/')).map(p=>p.split('/').at(-1).replace(/\.json$/,'')).sort(),Object.keys(frozenInventory).sort());
 return {candidate:{...candidate,generation:proof.generation,inventory:proof.inventory},manifest:proof.manifest,delivery,proof};
}
