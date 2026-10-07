/** Explicitly invoked provider-only audit; no product writes, schedules or upload. */
import {readFileSync,writeFileSync,mkdirSync,existsSync,lstatSync,realpathSync,rmSync} from 'node:fs';
import {resolve,join,dirname,isAbsolute,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createAuditAdapter,normalizeObservation}=require('../../providers/marketstack/audit-adapter.js');
const {estimateCredits}=require('../../providers/marketstack/client.js');
export const TARGET_CREDITS=1999,HARD_CAP=3500;
const repo=realpathSync(resolve(dirname(fileURLToPath(import.meta.url)),'../..'));
const hash=x=>createHash('sha256').update(x).digest('hex');
export function privateOutput(path) {
  const out=resolve(path);
  const fromRepo=relative(repo,out);
  if(!(fromRepo==='..'||fromRepo.startsWith('..'+sep)||isAbsolute(fromRepo)))throw Error('AUDIT_OUTPUT_MUST_BE_OUTSIDE_REPOSITORY');
  for(let p=out;;p=dirname(p)){if(existsSync(p)&&lstatSync(p).isSymbolicLink())throw Error('AUDIT_OUTPUT_SYMLINK_REFUSED');if(dirname(p)===p)break;}
  return out;
}
export function createRunBudget(file,maxCredits=TARGET_CREDITS) {
  if(!Number.isInteger(maxCredits)||maxCredits<1||maxCredits>HARD_CAP)throw Error('INVALID_CREDIT_CAP');
  if(existsSync(file))throw Error('EXISTING_RUN_LEDGER_REFUSED_USE_FRESH_OUTPUT');
  const state={schemaVersion:'marketstack-audit-budget-1',maxCredits,hardCap:HARD_CAP,estimatedCredits:0,requests:0,semantics:'CONSERVATIVE_RESERVED_NOT_OBSERVED_BILLING',reservations:[]};
  const save=()=>writeFileSync(file,JSON.stringify(state,null,2)+'\n',{mode:0o600});save();
  return {reserve:async({cost,endpoint})=>{if(state.estimatedCredits+cost>maxCredits)throw Object.assign(Error('RUN_BUDGET_EXCEEDED'),{code:'RUN_BUDGET_EXCEEDED'});state.estimatedCredits+=cost;state.requests++;state.reservations.push({endpoint,cost,at:new Date().toISOString()});save();},status:()=>structuredClone(state)};
}
export async function runAudit({plan,out,maxCredits=TARGET_CREDITS,apiKey=process.env.MARKETSTACK_API_KEY,fetchImpl}={}) {
  out=privateOutput(out);
  if(!apiKey)throw Error('MARKETSTACK_API_KEY_NOT_CONFIGURED');
  if(!Array.isArray(plan?.cases)||plan.cases.length<30||plan.cases.length>50)throw Error('REPRESENTATIVE_SET_REQUIRED_30_TO_50');
  const focused=plan.mode==='FOCUSED_VERIFICATION';
  const allowedMethods=new Set(['searchTicker','listExchangeTickers','getLatestEOD','getHistoricalEOD','getRealtimePrice','getIntraday','getSplits','getDividends','getETFHoldings','getTicker','getTickerInfo']);
  if(plan.mode&& !focused||focused&&(!Array.isArray(plan.operations)||plan.operations.length<1||plan.operations.length>150||plan.operations.some(o=>!o.case||!o.label||o.method&&!allowedMethods.has(o.method)||!o.method&&!o.endpoint)))throw Error('INVALID_FOCUSED_PLAN');
  if(plan.requestTimeoutMs!==undefined&&(!Number.isInteger(plan.requestTimeoutMs)||plan.requestTimeoutMs<1000||plan.requestTimeoutMs>90000))throw Error('INVALID_REQUEST_TIMEOUT');
  mkdirSync(out,{recursive:true,mode:0o700});
  const lock=join(out,'.running');mkdirSync(lock,{mode:0o700});
  const rawDir=join(out,'raw-provider'),normalizedDir=join(out,'normalized-observations');
  mkdirSync(rawDir,{mode:0o700});mkdirSync(normalizedDir,{mode:0o700});
  const budget=createRunBudget(join(out,'credits.json'),maxCredits),responses=[],results=[];
  let context=null,sequence=0,terminalReason=null;
  const clientOptions={apiKey,fetchImpl,sharedBudget:budget,maxCredits,maxRequests:600,maxRetries:0,cacheTtlMs:0,timeoutMs:plan.requestTimeoutMs??30000,minIntervalMs:fetchImpl?0:250,endpointIntervals:fetchImpl?{'/stockprice':0}:undefined,
    onResponse:async r=>{const id=String(++sequence).padStart(4,'0'),raw=r.rawText;
      writeFileSync(join(rawDir,id+'.json'),raw,{mode:0o600});
      const meta={...r,rawText:undefined,body:undefined,id,sha256:hash(raw),testCase:context};
      responses.push(meta);writeFileSync(join(rawDir,id+'.meta.json'),JSON.stringify(meta,null,2)+'\n',{mode:0o600});}};
  const api=createAuditAdapter(clientOptions),client=api.client;
  const request=async(endpoint,params={},options={})=>client.request(endpoint,params,{cacheTtlMs:0,...options});
  async function measure(label,fn) {
    if(terminalReason)return {ok:false,reason:terminalReason,skipped:true};
    const before=sequence;let result;
    try{result=await fn();}catch{result={ok:false,reason:'AUDIT_OPERATION_FAILED'};}
    if(['authError','quotaExceeded','budgetExceeded','RUN_BUDGET_EXCEEDED'].includes(result.reason))terminalReason=result.reason;
    const entry={case:context,label,responseIds:responses.slice(before).map(r=>r.id),result};results.push(entry);
    writeFileSync(join(normalizedDir,String(results.length).padStart(4,'0')+'.json'),JSON.stringify(entry,null,2)+'\n',{mode:0o600});return result;
  }
  try {
    if(focused)for(const o of plan.operations){context=o.case;await measure(o.label,()=>o.method?api[o.method](...(o.args||[])):request(o.endpoint,o.params||{}));}
    for(const c of focused?[]:plan.cases) {
      context=c.company;
      if(terminalReason||budget.status().estimatedCredits>=maxCredits)break;
      await measure('company_search',()=>api.searchTicker(c.company,{maxPages:3,limit:1000}));
      if(c.mic)await measure('exchange_ticker_search',()=>api.listExchangeTickers(c.mic,{search:c.company,maxPages:3,limit:1000}));
      if(!c.providerTicker)continue;
      await measure('ticker_search',()=>api.searchTicker(c.providerTicker,{exchange:c.mic,maxPages:2}));
      await measure('exact_and_observed_alias_metadata',()=>api.resolveTicker({providerTicker:c.providerTicker,canonicalTicker:c.canonicalTicker,aliases:c.aliases||[],mic:c.mic}));
      const listing={providerTicker:c.providerTicker,mic:c.mic};
      await measure('EOD_latest_no_cache',()=>api.getLatestEOD(listing,{maxPages:2}));
      if(c.kind==='EQUITY') {
        await measure('recent_EOD_date_bounds',()=>api.getHistoricalEOD(listing,{from:plan.recentFrom,to:plan.asOf,maxPages:2}));
        if(c.latestProbe) {
          await measure('stockprice_qualified',()=>api.getRealtimePrice(listing));
          if(c.canonicalTicker&&c.canonicalTicker!==c.providerTicker)await measure('stockprice_explicit_local_candidate',()=>request('/stockprice',{ticker:c.canonicalTicker,exchange:c.mic}));
          await measure('intraday_latest_15min',()=>api.getIntraday(listing,{latest:true,interval:'15min',maxPages:2}));
          await measure('intraday_1min_entitlement',()=>request('/intraday/latest',{symbols:c.providerTicker,exchange:c.mic,interval:'1min',limit:1}));
        }
        if(c.historyProbe)for(const [label,from] of Object.entries(plan.historyFrom))await measure('history_'+label+'_boundary_sample',()=>request('/eod',{symbols:c.providerTicker,exchange:c.mic,date_from:from,date_to:plan.asOf,sort:'ASC',limit:1}));
        if(c.actionProbe) {
          await measure('split_events',()=>api.getSplits(listing,{from:'2020-01-01',to:plan.asOf,maxPages:3}));
          await measure('dividend_events',()=>api.getDividends(listing,{from:'2020-01-01',to:plan.asOf,maxPages:3}));
          await measure('known_action_EOD',()=>request('/eod',{symbols:c.providerTicker,exchange:c.mic,date_from:c.actionFrom,date_to:c.actionTo,sort:'ASC',limit:20}));
        }
      } else {
        await measure('ETF_list_exact',()=>api.listETFs({ticker:c.providerTicker,maxPages:1}));
        const holdings=await measure('ETF_holdings',()=>api.getETFHoldings(c.providerTicker,{maxPages:2}));
        // A differential offset probe is evidence, not a completeness certificate.
        // It never causes arbitrary slicing/100%-weight normalization.
        if(c.paginationProbe&&holdings.raw?.length)await measure('ETF_holdings_offset_differential',()=>request('/etfholdings',{ticker:c.providerTicker,limit:1,offset:1}));
      }
    }
    context='PROFESSIONAL_REFERENCE_ENDPOINTS';
    for(const [endpoint,params] of focused?[]:[['/exchanges',{limit:1}],['/currencies',{limit:1}],['/timezones',{limit:1}],['/tickerinfo',{ticker:'AAPL'}],['/indexlist',{limit:1}],['/indexinfo',{index:'us500'}],['/bondlist',{limit:1}],['/bond',{country:'germany'}],['/commodities',{commodity_name:'gold'}],['/commoditieshistory',{commodity_name:'gold',date_from:plan.recentFrom,date_to:plan.asOf,frequency:'daily'}]])
      await measure(endpoint,()=>request(endpoint,params));
    const summary={asOf:plan.asOf,startedPlan:plan,accountPlan:'USER_STATED_PROFESSIONAL_ACCOUNT_NAME_NOT_VERIFIED_BY_API',
      results,responses,terminalReason,budget:budget.status(),transportStats:client.stats(),capabilityFlags:api.capabilities,
      conclusions:'OBSERVATIONS_REQUIRE_REVIEW_NOT_AUTOMATIC_PROVIDER_CAPABILITIES',productionWrites:0};
    writeFileSync(join(out,'summary.json'),JSON.stringify(summary,null,2)+'\n',{mode:0o600});return summary;
  } finally {rmSync(lock,{recursive:true});}
}
async function cli() {
  const args=process.argv.slice(2),arg=name=>args.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3);
  const planPath=arg('plan')||join(repo,'docs/marketstack-audit/representative-plan.json');
  const plan=JSON.parse(readFileSync(planPath,'utf8'));
  if(!args.includes('--live')) {console.log(JSON.stringify({mode:'OFFLINE_PLAN_ONLY',cases:plan.cases.length,targetCredits:TARGET_CREDITS,hardCap:HARD_CAP,accountRequests:0},null,2));return;}
  if(!arg('out')||!isAbsolute(arg('out')))throw Error('ABSOLUTE_PRIVATE_OUT_REQUIRED');
  const result=await runAudit({plan,out:arg('out'),maxCredits:arg('max-credits')?Number(arg('max-credits')):TARGET_CREDITS});
  console.log(JSON.stringify({cases:result.startedPlan.cases.length,requests:result.budget.requests,estimatedCredits:result.budget.estimatedCredits,output:arg('out')}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))cli().catch(e=>{console.error(['MARKETSTACK_API_KEY_NOT_CONFIGURED','ABSOLUTE_PRIVATE_OUT_REQUIRED','INVALID_CREDIT_CAP','EXISTING_RUN_LEDGER_REFUSED_USE_FRESH_OUTPUT'].includes(e.message)?e.message:'AUDIT_FAILED_SEE_PRIVATE_EVIDENCE');process.exitCode=1;});
