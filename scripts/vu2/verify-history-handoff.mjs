import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createMarketStore}=require('../../quant/engines/market-store.js');
const Eod=require('../../quant/engines/market-eod-gate.js');

// QA evidence only: no product score, provider request or publication path.
export function verifyHistoryHandoff({preflight,sync,members,store,calendar,now}){
 const session=Eod.latestClosedSession(now,calendar);
 const validHeader=preflight?.executionAllowed===true && preflight.measured===true && preflight.offline===false &&
  preflight.operation==='RECOVERY' && sync?.direction==='PULL' && sync.provider===preflight.provider &&
  sync.gate===preflight.gate && sync.market===preflight.market &&
  sync.zeroCost?.preflight?.generatedAt===preflight.generatedAt &&
  Array.isArray(members) && members.length>0 && members.length<=5 &&
  sync.tally?.requested===members.length && sync.tally?.ok===members.length &&
  sync.tally?.failed===0 && sync.tally?.missing===0;
 const securities=[];
 if(validHeader)for(const member of members){
  try{
   const series=store.readBars(member.securityId);
   const valid=series && series.securityId===member.securityId && series.ticker===member.ticker &&
    series.provider===preflight.provider && series.restoredFrom==='history-store' &&
    series.bars.length>0 && series.bars.every(bar=>bar.securityId===member.securityId);
   const last=valid?series.bars.at(-1).date:null;
   const plan=valid?Eod.plan(last,session,calendar):null;
   securities.push({securityId:member.securityId,ticker:member.ticker,
    restore:valid?'PASS':'FAIL',barCount:valid?series.bars.length:null,lastStoredDate:last,
    eodCoverage:plan?.state??'UNAVAILABLE',reason:valid?(plan?.reason??null):'RESTORE_IDENTITY_OR_HISTORY_INVALID'});
  }catch{
   securities.push({securityId:member.securityId,ticker:member.ticker,restore:'FAIL',barCount:null,
    lastStoredDate:null,eodCoverage:'UNAVAILABLE',reason:'RESTORE_READ_ERROR'});
  }
 }
 const sampleRestore=validHeader && securities.every(s=>s.restore==='PASS')?'PASS':'FAIL';
 return {version:'vu2-history-handoff-1',sampleRestore,
  reason:validHeader?null:'PREFLIGHT_OR_SYNC_EVIDENCE_INVALID',
  latestClosedSession:session.date??null,securities,
  productionLifecycle:'NOT_CERTIFIED',
  openEvidence:['DURABLE_CHECKPOINT_LINEAGE','PROVIDER_FINALITY','CORPORATE_ACTION_RECONCILIATION',
   'DEPENDENT_FEATURE_REFRESH','ACCOUNT_WIDE_USAGE_AND_CONCURRENCY'],
  scope:'At most five existing universe members; no prices or bars in this report.'};
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),arg=name=>args[args.indexOf(name)+1];
 for(const name of ['--preflight','--sync','--work-dir','--out'])if(!args.includes(name))throw new Error('Missing '+name);
 const read=p=>JSON.parse(readFileSync(p,'utf8'));
 const preflight=read(arg('--preflight')),sync=read(arg('--sync'));
 // Fixed existing source and sample size, matching the workflow; no new universe.
 const universe=read(new URL('../../quant/data/market/scale/universe-GATE_100.json',import.meta.url));
 const members=universe.securities.slice(0,5);
 const result=verifyHistoryHandoff({preflight,sync,members,
  store:createMarketStore({workingDir:resolve(arg('--work-dir')),providerId:'tiingo'}),
  calendar:read(new URL('../../quant/config/market-calendar.json',import.meta.url)),now:new Date().toISOString()});
 result.observedAt=new Date().toISOString();result.sourceCommit=process.env.GITHUB_SHA??null;
 mkdirSync(dirname(arg('--out')),{recursive:true});writeFileSync(arg('--out'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));if(result.sampleRestore!=='PASS')process.exitCode=1;
}
