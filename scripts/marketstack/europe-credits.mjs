/** Private, conservative run accounting. Never represents observed provider billing. */
import {openSync,closeSync,writeFileSync,readFileSync,fsyncSync,renameSync,unlinkSync,lstatSync,fstatSync,mkdirSync,realpathSync} from 'node:fs';
import {resolve,dirname,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {estimateCredits}=require('../../providers/marketstack/client.js');
export const TARGET_CREDITS=15000,HARD_CAP=25000;
const repo=realpathSync(resolve(dirname(fileURLToPath(import.meta.url)),'../..'));
const fail=code=>Object.assign(new Error(code),{code});
function integer(value,name,min=0){if(!Number.isSafeInteger(value)||value<min)throw fail('INVALID_'+name);return value;}
function privatePath(file){
 if(typeof file!=='string'||!file)throw fail('INVALID_LEDGER_PATH');
 const out=resolve(file),r=relative(repo,out);
 if(!(r==='..'||r.startsWith('..'+sep)||isAbsolute(r)))throw fail('EUROPE_OUTPUT_MUST_BE_OUTSIDE_REPOSITORY');
 for(let p=out;;p=dirname(p)){
  try{if(lstatSync(p).isSymbolicLink())throw fail('EUROPE_OUTPUT_SYMLINK_REFUSED');}catch(e){if(e.code!=='ENOENT')throw e;}
  if(dirname(p)===p)break;
 }
 return out;
}

/** Includes every potential page and attempt; batching changes HTTP count, not symbol credits. */
export function estimateEuropeBatch(operations=[]){
 if(!Array.isArray(operations))throw fail('INVALID_BATCH');
 const rows=operations.map(o=>{
  if(!o||typeof o.endpoint!=='string'||!/^\/[a-zA-Z0-9_/{},.-]+$/.test(o.endpoint)||o.endpoint.includes('..'))throw fail('INVALID_ENDPOINT');
  if(o.params!=null&&(typeof o.params!=='object'||Array.isArray(o.params)||Object.keys(o.params).some(k=>/access_key|api_key/i.test(k))))throw fail('INVALID_PARAMETERS');
  const requests=integer(o.pages??1,'PAGES',1)*integer(o.attempts??1,'ATTEMPTS',1);
  const credits=requests*estimateCredits(o.endpoint,o.params??{});
  integer(requests,'REQUESTS');integer(credits,'CREDITS');
  return {endpoint:o.endpoint,requests,credits};
 });
 const requests=rows.reduce((n,o)=>n+o.requests,0),credits=rows.reduce((n,o)=>n+o.credits,0);
 integer(requests,'REQUESTS');integer(credits,'CREDITS');
 return {requests,credits,operations:rows,semantics:'CONSERVATIVE_RESERVED_NOT_OBSERVED_BILLING'};
}

/** One ledger for ALL clients in this run. Crashes leave the exclusive lock in place.
 * Existing ledgers cannot be resumed/reset; reservations are retained on HTTP failure.
 */
export function createEuropeBudget(file,{maxCredits=TARGET_CREDITS,runId=randomUUID(),targetCredits=TARGET_CREDITS,hardCap=HARD_CAP}={}){
 integer(targetCredits,'TARGET_CREDITS',1);integer(hardCap,'HARD_CAP',1);
 if(hardCap>HARD_CAP||targetCredits>hardCap)throw fail('HARD_CAP_EXCEEDED');
 integer(maxCredits,'CREDIT_CAP',1);if(maxCredits>hardCap)throw fail('HARD_CAP_EXCEEDED');
 if(typeof runId!=='string'||!runId||runId.length>120)throw fail('INVALID_RUN_ID');
 file=privatePath(file);mkdirSync(dirname(file),{recursive:true,mode:0o700});privatePath(file);
 const lock=file+'.lock',journal=file+'.attempts.jsonl';privatePath(lock);privatePath(journal);
 let lockFd;try{lockFd=openSync(lock,'wx',0o600);}catch{throw fail('LEDGER_EXCLUSIVE_LOCK_REFUSED');}
 const lockStat=fstatSync(lockFd);let closed=false,blocked=false,expectedBytes,journalFd,journalStat;
 const state={schemaVersion:'marketstack-europe-budget-1',runId,targetCredits,hardCap,maxCredits,requests:0,estimatedCredits:0,actualBilledCredits:'UNKNOWN',accountRemainingCredits:'UNKNOWN',semantics:'CONSERVATIVE_RESERVED_NOT_OBSERVED_BILLING',reservations:[]};
 const directorySync=()=>{const fd=openSync(dirname(file),'r');try{fsyncSync(fd);}finally{closeSync(fd);}};
 function check(){
  if(closed||blocked)throw fail('LEDGER_CLOSED_OR_BLOCKED');
  try{
   privatePath(file);privatePath(lock);privatePath(journal);
   const current=lstatSync(lock);if(current.ino!==lockStat.ino||current.dev!==lockStat.dev||readFileSync(lock,'utf8')!==runId+'\n')throw fail('LEDGER_LOCK_CHANGED');
   if(!lstatSync(file).isFile()||readFileSync(file,'utf8')!==expectedBytes)throw fail('LEDGER_STATE_CHANGED');
   const j=lstatSync(journal);if(!j.isFile()||j.ino!==journalStat.ino||j.dev!==journalStat.dev||j.size!==journalStat.size||j.mtimeMs!==journalStat.mtimeMs)throw fail('LEDGER_JOURNAL_CHANGED');
  }catch(e){blocked=true;throw fail(e.code==='EUROPE_OUTPUT_SYMLINK_REFUSED'?e.code:'LEDGER_STATE_UNVERIFIED');}
 }
 function persist(next,initial=false){
  // Journal entries are durable first; the atomic snapshot stays bounded in size.
  // A crash between journal and snapshot cannot resume this ledger automatically.
  const {reservations,...snapshot}=next;
  const bytes=JSON.stringify({...snapshot,journalPath:journal,reservationCount:next.requests,latestReservation:initial?null:next.latestReservation},null,2)+'\n',target=initial?file:file+'.'+randomUUID()+'.tmp';let fd;
  try{if(!initial){writeFileSync(journalFd,JSON.stringify(next.latestReservation)+'\n');fsyncSync(journalFd);journalStat=fstatSync(journalFd);}privatePath(target);fd=openSync(target,'wx',0o600);writeFileSync(fd,bytes);fsyncSync(fd);closeSync(fd);fd=undefined;if(!initial)renameSync(target,file);directorySync();expectedBytes=bytes;}
  catch(e){blocked=true;if(fd!==undefined)closeSync(fd);throw fail(initial&&e.code==='EEXIST'?'EXISTING_RUN_LEDGER_REFUSED':'LEDGER_PERSISTENCE_FAILED');}
 }
 try{writeFileSync(lockFd,runId+'\n');fsyncSync(lockFd);journalFd=openSync(journal,'wx',0o600);fsyncSync(journalFd);journalStat=fstatSync(journalFd);persist(state,true);}catch(e){closeSync(lockFd);if(journalFd!==undefined)closeSync(journalFd);throw e.code==='EEXIST'?fail('EXISTING_RUN_LEDGER_REFUSED'):e;}
 return {
  async reserve({cost,endpoint}={}){
   check();integer(cost,'RESERVATION_COST',1);
   if(typeof endpoint!=='string'||!/^\/[a-zA-Z0-9_/{},.-]+$/.test(endpoint)||endpoint.includes('..'))throw fail('INVALID_ENDPOINT');
   if(cost<estimateCredits(endpoint))throw fail('RESERVATION_UNDER_ENDPOINT_ESTIMATE');
   if(state.estimatedCredits+cost>maxCredits)throw fail('EUROPE_RUN_BUDGET_EXCEEDED');
   const next={...state,requests:state.requests+1,estimatedCredits:state.estimatedCredits+cost,latestReservation:{attempt:state.requests+1,cost,endpoint,at:new Date().toISOString()}};
   persist(next);Object.assign(state,next);state.reservations.push(next.latestReservation);return {attempt:state.requests,remainingCredits:maxCredits-state.estimatedCredits};
  },
  status(){check();return {...structuredClone(state),remainingCredits:maxCredits-state.estimatedCredits};},
  estimateBatch(operations){check();const estimate=estimateEuropeBatch(operations);if(state.estimatedCredits+estimate.credits>maxCredits)throw fail('EUROPE_BATCH_EXCEEDS_BUDGET');return {...estimate,remainingAfterBatch:maxCredits-state.estimatedCredits-estimate.credits};},
  close(){if(closed)return;check();closeSync(journalFd);closeSync(lockFd);unlinkSync(lock);directorySync();closed=true;}
 };
}

/** Inventory-driven scenarios only. Caller supplies observed listings, never target index sizes. */
export function buildRefreshCreditModel({equities=[],etfs=[],inventorySource=null,historyPagesPerListing=3,historyFetchesPerListing=1,tradingDaysPerMonth=22,corporateActionRefreshesPerMonth=4,holdingsRefreshesPerMonth=1,symbolsPerRequest=100,attempts=1,measuredRun=null}={}){
 if(symbolsPerRequest>100)throw fail('SYMBOL_BATCH_TRANSPORT_LIMIT_EXCEEDED');
 if(!Array.isArray(equities)||!Array.isArray(etfs)||[...equities,...etfs].some(r=>!r||typeof r!=='object'||Array.isArray(r)))throw fail('OBSERVED_INVENTORY_REQUIRED');
 for(const [name,value,min] of [['HISTORY_PAGES',historyPagesPerListing,1],['HISTORY_FETCHES',historyFetchesPerListing,1],['TRADING_DAYS',tradingDaysPerMonth,0],['ACTION_REFRESHES',corporateActionRefreshesPerMonth,0],['HOLDINGS_REFRESHES',holdingsRefreshesPerMonth,0],['SYMBOLS_PER_REQUEST',symbolsPerRequest,1],['ATTEMPTS',attempts,1]])integer(value,name,min);
 const key=(row,index)=>row.listingId??row.listingKey??((row.providerSymbol??row.providerTicker)&&row.mic?row.mic+':'+(row.providerSymbol??row.providerTicker):'UNRESOLVED:'+index);
 const eq=[...new Map(equities.map((r,i)=>[key(r,i),r])).values()],funds=[...new Map(etfs.map((r,i)=>[key(r,i),r])).values()];
 const holdings=[...new Set(funds.map((r,i)=>r.holdingsKey??r.shareClassId??r.isin??key(r,i)))];
 const listings=eq.length+funds.length,holdingsQueries=holdings.length;
 // Native EOD requests bind one exchange. Never assume that listings from
 // different MICs can share a request; unresolved MICs are charged separately.
 const byMic=new Map();let unknownMicListings=0;
 for(const row of [...eq,...funds]){
  if(typeof row.mic!=='string'||!/^[A-Z0-9]{4}$/.test(row.mic)){unknownMicListings++;continue;}
  byMic.set(row.mic,(byMic.get(row.mic)??0)+1);
 }
 const latestBatchesByMic=[...byMic].sort(([a],[b])=>a.localeCompare(b,'en')).map(([mic,count])=>({mic,listings:count,requests:Math.ceil(count/symbolsPerRequest)}));
 const latestRequests=unknownMicListings+latestBatchesByMic.reduce((n,row)=>n+row.requests,0);
 const pair=(requests,credits)=>({requests:requests*attempts,credits:credits*attempts});
 const latest=pair(latestRequests,listings),history=pair(listings*historyPagesPerListing*historyFetchesPerListing,listings*historyPagesPerListing*historyFetchesPerListing),actions=pair(listings*2,listings*2),holdingsCost=pair(holdingsQueries,holdingsQueries*estimateCredits('/etfholdings'));
 const total=parts=>({requests:parts.reduce((n,p)=>n+p.requests,0),credits:parts.reduce((n,p)=>n+p.credits,0)});
 const multiply=(p,n)=>({requests:p.requests*n,credits:p.credits*n});
 const monthlyHoldings=multiply(holdingsCost,holdingsRefreshesPerMonth);
 const optimizedMonthly=total([multiply(latest,tradingDaysPerMonth),multiply(actions,corporateActionRefreshesPerMonth),monthlyHoldings]);
 return {schemaVersion:'marketstack-refresh-credit-model-1',inventory:{source:inventorySource,equityListings:eq.length,etfListings:funds.length,holdingsQueryIdentities:holdingsQueries,latestBatchesByMic,unknownMicListings,unresolvedRows:[...eq,...funds].filter((r,i)=>key(r,i).startsWith('UNRESOLVED:')).length},
  plan:{monthlyRequests:100000,source:'USER_STATED_PROFESSIONAL_CONTRACT_PLAN',verifiedAccountPlan:false,actualBilledCredits:'UNKNOWN',remainingCredits:'UNKNOWN'},
  assumptions:{historyPagesPerListing,historyFetchesPerListing,tradingDaysPerMonth,corporateActionRefreshesPerMonth,holdingsRefreshesPerMonth,symbolsPerRequest,attempts,pagination:'HISTORY_PAGE_COUNT_REQUIRES_MEASUREMENT',batching:'PER_MIC_ONLY_UNKNOWN_MIC_UNBATCHED_REDUCES_HTTP_NOT_SYMBOL_CREDITS'},
  measuredRun:measuredRun?structuredClone(measuredRun):null,bootstrap:{history,latest,corporateActions:actions,holdings:holdingsCost,total:total([history,latest,actions,holdingsCost])},
  daily:{latest,total:latest},etfHoldings:{perRefresh:holdingsCost,monthly:monthlyHoldings},optimizedMonthly,
  unoptimizedMonthly:total([multiply(history,tradingDaysPerMonth),multiply(latest,tradingDaysPerMonth),multiply(actions,tradingDaysPerMonth),monthlyHoldings]),
  safeMonthlyRefreshCost:null,monthlyFeasibility:'UNVERIFIED',scheduleEnabled:false,
  limitations:['Observed billing, account remaining budget and existing workloads are unknown','Histories bootstrap once; corporate-action delta and holdings cadence are explicit assumptions','No schedule approval follows from conservative scenario arithmetic']};
}
