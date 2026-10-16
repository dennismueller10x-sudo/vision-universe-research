/* Automation approval is scope/policy bound, never an approval for new issuers. */
import {readFileSync} from 'node:fs';
import {universeApproved} from './universe-approval.mjs';
export const refreshConfig=JSON.parse(readFileSync(new URL('../../company-intelligence/config/continuous-refresh.json',import.meta.url)));
export const frozenInventory=JSON.parse(readFileSync(new URL('../../docs/company-intelligence/full-data-release-candidate.json',import.meta.url))).inventory;
export const frozenTickers=JSON.parse(readFileSync(new URL('../../docs/company-intelligence/full-data-consumer-manifest.json',import.meta.url))).tickers;
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function refreshApproved(m){
 if(m?.scope==='PER_ISSUER_ELIGIBILITY')return universeApproved(m);
 return refreshConfig.schema===1 && m?.productionApproval===refreshConfig.approvalId &&
  m.releaseState==='APPROVED_CONTROLLED_PRODUCTION' && m.sourceUsagePolicy===refreshConfig.sourceUsagePolicy &&
  equal(m.tickers,frozenTickers) && m.tickers.length===46 && m.refreshValidation?.profiles===45 &&
  m.refreshValidation?.privateCompanies>=5120 && m.refreshValidation?.status==='PASS' &&
  /^[a-f0-9]{64}$/.test(m.refreshValidation?.checkpointSha256||'') &&
  equal(Object.keys(m.assets||{}).filter(p=>p!=='index.json'&&!p.includes('/lookup/')).map(p=>p.split('/').at(-1).replace(/\.json$/,'')).sort(),Object.keys(frozenInventory).sort());
}
export function safePublicRefresh(m,health,inventory){
 if(!refreshApproved(m))throw Error('REFRESH_APPROVAL_REQUIRED');
 if(m.scope==='PER_ISSUER_ELIGIBILITY')inventory=Object.fromEntries(Object.entries(m.eligibility).map(([cid,r])=>[cid,{tickers:r.tickers,status:r.status,modules:r.modules}]));
 return {schema:1,status:'PASS',generation:m.generation,generatedAt:m.generatedAt,sourceUsagePolicy:m.sourceUsagePolicy,
  manifest:{schema:m.schema,generation:m.generation,generatedAt:m.generatedAt,assets:m.assets,tickers:m.tickers,
   ...(m.scope==='PER_ISSUER_ELIGIBILITY'?{scope:m.scope,eligibilityVersion:m.eligibilityVersion,eligibility:m.eligibility,sourceUsagePolicy:m.sourceUsagePolicy}:{})},inventory,
  health:{lastSuccessfulPrivateRefresh:health.lastSuccessfulRefresh,lastSuccessfulConsumerBuild:health.lastSuccessfulConsumerBuild,
   lastSuccessfulProductionPublication:health.lastSuccessfulProductionPublication||null},cohortStocks:m.tickers.length,issuers:m.scope==='PER_ISSUER_ELIGIBILITY'?Object.keys(m.eligibility).length:45};
}
export function freshness(last,now=Date.now()){
 if(!last||!Number.isFinite(Date.parse(last)))return 'CRITICAL';
 const age=now-Date.parse(last);return age>12*3600000?'CRITICAL':age>8*3600000?'WARNING':'HEALTHY';
}
/* Thresholds are intentionally the single hard-coded 8 h / 12 h pair above. The
   `warningHours`/`criticalHours` keys in continuous-refresh.json are NOT read by
   freshness(); they only document these values. Changing them has no effect. */
export const FRESHNESS_HOURS=Object.freeze({warning:8,critical:12});
const ageHours=(ts,now)=>Number.isFinite(Date.parse(ts))?Math.round((now-Date.parse(ts))/360000)/10:null;
/* The run's own refresh SLO. `report.health.lastSuccessfulRefresh` is stamped with
   the current time by the engine in the same run, so judging only its age is a
   tautology. The run counts as HEALTHY only if it truly succeeded AND published;
   then the freshness of what was actually published is judged. Stricter only. */
export function runSLO(report,now=Date.now()){
 const succeeded=report?.status==='SUCCESS'&&!report.failureStage&&report.published===true&&report.retainedLastGood===false;
 if(!succeeded)return {refreshSLO:'CRITICAL',runSucceeded:false,failureCode:report?.failureCode||(report?.status&&report.status!=='SUCCESS'?String(report.status):'RUN_NOT_PUBLISHED')};
 return {refreshSLO:freshness(report.health?.lastSuccessfulRefresh,now),runSucceeded:true,failureCode:null};
}
/* Standalone read-only health verdict. Exit-code contract (see CONTINUOUS_REFRESH.md):
   CRITICAL -> 1; WARNING/OFF/HEALTHY -> 0; a crash of the check itself -> 2. */
export function evaluateHealth(good,observed,production,now=Date.now(),pointerState=null){
 const h=good?.health||{},off=production.state==='GATE_CLOSED';
 const goodRefresh=h.lastSuccessfulRefresh||null,build=h.lastSuccessfulConsumerBuild||null;
 const delivery=production.state==='VERIFIED'?(observed?.lastSuccessfulProductionPublication||null):null;
 const s={schema:1,checkedAt:new Date(now).toISOString(),generation:good?.generation||null,
  lastSuccessfulGoodRefresh:goodRefresh,
  // Deprecated alias: the value always came from the GOOD pointer, not the private ledger.
  lastSuccessfulPrivateRefresh:goodRefresh,
  lastSuccessfulConsumerBuild:build,
  // Evidence of "delivery verified against GOOD", re-stamped by every same-generation
  // Pages observation. It does NOT prove new data; see goodDataAgeHours for that.
  lastSuccessfulProductionPublication:delivery,
  goodDataAgeHours:ageHours(goodRefresh,now),consumerBuildAgeHours:ageHours(build,now),deliveryVerifiedAgeHours:ageHours(delivery,now),
  productionState:production.state,productionReason:production.reason||null,servedGeneration:production.servedGeneration??null,
  gateState:production.gateState||null,gateReason:production.gateReason||null,
  failureStage:h.failureStage||null,failureCode:h.failureCode||null,
  failureSource:h.failureStage||h.failureCode?'GOOD_HEALTH':'NOT_RECORDED_IN_GOOD_HEALTH'};
 // Nur zusaetzliche Felder, keine Schwellen: ohne GOOD-Zeiger (LEGACY_FALLBACK) ist die Ursache sonst nur "generation=null".
 if(pointerState){s.goodState=pointerState;s.goodStateReason=pointerState==='GOOD'?null:pointerState==='LEGACY_FALLBACK'?'NO_LEGACY_GOOD_RESTORE_REQUIRED':'GOOD_POINTER_'+pointerState;}
 s.refreshSLO=freshness(goodRefresh,now);s.buildSLO=freshness(build,now);
 s.publicationSLO=off?'OFF':freshness(delivery,now);
 const all=[s.refreshSLO,s.buildSLO,s.publicationSLO];
 s.status=all.includes('CRITICAL')?'CRITICAL':all.includes('WARNING')?'WARNING':off?'OFF':'HEALTHY';
 s.exitCode=s.status==='CRITICAL'?1:0;
 return s;
}
