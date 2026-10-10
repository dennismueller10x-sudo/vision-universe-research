/* Automation approval is scope/policy bound, never an approval for new issuers. */
import {readFileSync} from 'node:fs';
export const refreshConfig=JSON.parse(readFileSync(new URL('../../company-intelligence/config/continuous-refresh.json',import.meta.url)));
export const frozenInventory=JSON.parse(readFileSync(new URL('../../docs/company-intelligence/full-data-release-candidate.json',import.meta.url))).inventory;
export const frozenTickers=JSON.parse(readFileSync(new URL('../../docs/company-intelligence/full-data-consumer-manifest.json',import.meta.url))).tickers;
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function refreshApproved(m){
 return refreshConfig.schema===1 && m?.productionApproval===refreshConfig.approvalId &&
  m.releaseState==='APPROVED_CONTROLLED_PRODUCTION' && m.sourceUsagePolicy===refreshConfig.sourceUsagePolicy &&
  equal(m.tickers,frozenTickers) && m.tickers.length===46 && m.refreshValidation?.profiles===45 &&
  m.refreshValidation?.privateCompanies>=5120 && m.refreshValidation?.status==='PASS' &&
  /^[a-f0-9]{64}$/.test(m.refreshValidation?.checkpointSha256||'') &&
  equal(Object.keys(m.assets||{}).filter(p=>p!=='index.json'&&!p.includes('/lookup/')).map(p=>p.split('/').at(-1).replace(/\.json$/,'')).sort(),Object.keys(frozenInventory).sort());
}
export function safePublicRefresh(m,health,inventory){
 if(!refreshApproved(m))throw Error('REFRESH_APPROVAL_REQUIRED');
 return {schema:1,status:'PASS',generation:m.generation,generatedAt:m.generatedAt,sourceUsagePolicy:m.sourceUsagePolicy,
  manifest:{schema:m.schema,generation:m.generation,generatedAt:m.generatedAt,assets:m.assets,tickers:m.tickers},inventory,
  health:{lastSuccessfulPrivateRefresh:health.lastSuccessfulRefresh,lastSuccessfulConsumerBuild:health.lastSuccessfulConsumerBuild,
   lastSuccessfulProductionPublication:health.lastSuccessfulProductionPublication||null},cohortStocks:46,issuers:45};
}
export function freshness(last,now=Date.now()){
 if(!last||!Number.isFinite(Date.parse(last)))return 'CRITICAL';
 const age=now-Date.parse(last);return age>12*3600000?'CRITICAL':age>8*3600000?'WARNING':'HEALTHY';
}
