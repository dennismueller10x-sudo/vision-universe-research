/* An explainable bounded inventory is the authorization, never an all-on gate. */
import {readFileSync} from 'node:fs';
export const universeConfig=JSON.parse(readFileSync(new URL('../../company-intelligence/config/universe-rollout.json',import.meta.url)));
export const moduleNames=['profile','aktuelles','financials','whatChanged','nextEvent','calls','documents'];
const identity=/^(?:iss_cik_\d{10}|vu_[a-f0-9]{14})$/;
export function eligibilityValid(m){
 if(m?.scope!=='PER_ISSUER_ELIGIBILITY'||m.eligibilityVersion!==universeConfig.eligibilityVersion||m.sourceUsagePolicy!==universeConfig.sourceUsagePolicy||!m.eligibility||typeof m.eligibility!=='object'||Array.isArray(m.eligibility))return false;
 const issuers=Object.keys(m.eligibility),tickers=new Set();
 if(!issuers.length||issuers.length>universeConfig.maximumIssuers||!Array.isArray(m.tickers)||m.tickers.length>universeConfig.maximumListings)return false;
 for(const [cid,r] of Object.entries(m.eligibility)){
  if(!identity.test(cid)||!['ELIGIBLE_FULL','ELIGIBLE_PARTIAL'].includes(r?.status)||!r.modules||Object.keys(r.modules).length!==moduleNames.length||!moduleNames.every(k=>typeof r.modules[k]==='boolean')||!moduleNames.some(k=>k!=='whatChanged'&&r.modules[k])||!Array.isArray(r.tickers)||!r.tickers.length)return false;
  if(r.modules.whatChanged&&!r.modules.financials)return false;
  for(const t of r.tickers){if(!/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(t)||tickers.has(t))return false;tickers.add(t);}
 }
 const paths=Object.keys(m.assets||{}).filter(p=>p!=='index.json'&&!p.includes('/lookup/'));
 if(paths.length!==issuers.length||paths.some(p=>!m.eligibility[p.split('/').at(-1).replace(/\.json$/,'')]))return false;
 return m.tickers.length===tickers.size&&m.tickers.every(t=>tickers.has(t));
}
export function universeApproved(m){
 return eligibilityValid(m)&&m.productionApproval===universeConfig.approvalId&&m.releaseState==='APPROVED_CONTROLLED_PRODUCTION'&&
  m.refreshValidation?.status==='PASS'&&m.refreshValidation?.privateCompanies>=universeConfig.minimumPrivatePayloads&&
  /^[a-f0-9]{64}$/.test(m.refreshValidation?.checkpointSha256||'')&&m.refreshValidation?.structural==='PASS';
}
export function eligibilityByTicker(m){
 if(!eligibilityValid(m))throw Error('INVALID_PER_ISSUER_ELIGIBILITY');
 return Object.fromEntries(Object.entries(m.eligibility).flatMap(([companyId,r])=>r.tickers.map(t=>[t,{companyId,status:r.status,modules:r.modules}])));
}
