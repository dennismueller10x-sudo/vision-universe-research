// Resumable ingestion into the existing canonical working store. Never writes US production files.
import { createRequire } from 'node:module';
import { readFileSync,writeFileSync,mkdirSync,renameSync,existsSync } from 'node:fs';
import { dirname,resolve,join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url);
const G=require('../../quant/engines/global-market.js');
const {createMarketStore,ingestionRunId}=require('../../quant/engines/market-store.js');
const {createMarketstackProvider}=require('../../providers/marketstack/adapter.js');
const {createMarketstackClient}=require('../../providers/marketstack/client.js');
const arg=(n,fallback)=>process.argv.find(a=>a.startsWith('--'+n+'='))?.slice(n.length+3)||fallback;
const atomic=(p,v)=>{mkdirSync(dirname(p),{recursive:true});writeFileSync(p+'.tmp',JSON.stringify(v,null,2)+'\n');renameSync(p+'.tmp',p);};
export async function ingestListings({layer,provider,store,initial=false,from='2020-01-01',to=new Date().toISOString().slice(0,10),runId,maxPages=10}) {
 G.validate(layer);if(!G.validDate(from)||!G.validDate(to)||from>to)throw Error('INVALID_DATE_RANGE');
 const scope=createHash('sha256').update(JSON.stringify({from,to,listings:layer.listings.map(r=>[r.listingId,r.securityId,r.providerSymbol,r.mic,r.tradingCurrency]).sort()})).digest('hex');
 runId=runId||ingestionRunId(initial)+'-'+scope.slice(0,16);
 const checkpoint=store.loadCheckpoint(runId);
 if(checkpoint.scope && checkpoint.scope!==scope)throw Error('CHECKPOINT_SCOPE_MISMATCH');
 checkpoint.scope=scope;
 const done=new Set(checkpoint.done), failures=new Map(checkpoint.failed.map(r=>[r.listingId,r]));
 const result={schemaVersion:'marketstack-ingestion-1.0.0',runId,total:layer.listings.length,processed:0,remaining:0,rows:[]};
 listingsLoop: for(const row of layer.listings){
  if(done.has(row.listingId)){result.rows.push({listingId:row.listingId,state:'CHECKPOINT_COMPLETE'});continue;}
  const stored=store.readBars(row.listingId);
  if(stored&&((stored.listingId&&stored.listingId!==row.listingId)||stored.bars.some(b=>b.securityId!==row.securityId||b.currency!==row.tradingCurrency)))throw Error('STORED_LISTING_IDENTITY_OR_CURRENCY_MISMATCH');
  const last=stored?.bars.at(-1)?.date;const needsEarlier=initial&&stored?.bars.length&&stored.bars[0].date>from;const progress=checkpoint.windowProgress?.[row.listingId];const next=progress?.targetTo===to ? progress.nextFrom : needsEarlier?from:last?store.nextFetchFrom(row.listingId,{initialFrom:from}):from;
  if(next>to){done.add(row.listingId);result.rows.push({listingId:row.listingId,state:'CURRENT'});}
  else {
   let cursor = next, complete = true;
   while (cursor <= to) {
    const end = new Date(cursor + 'T00:00:00Z'); end.setUTCDate(end.getUTCDate() + 364);
    const windowTo = end.toISOString().slice(0,10) < to ? end.toISOString().slice(0,10) : to;
    const response=await provider.getDailyBars(row.listingId,{from:cursor,to:windowTo,maxPages});
    const bars=response.data?.bars||[], issues=G.priceIssues(bars);
    if(response.available && response.complete!==false && !(response.data?.anomalies||[]).length && issues.length===0 && bars.every(b=>b.currency===row.tradingCurrency && b.securityId===row.securityId && b.date>=cursor && b.date<=windowTo)){
     store.mergeBars(row.listingId,bars,{listingId:row.listingId,canonicalSecurityId:row.securityId,tradingCurrency:row.tradingCurrency,assetType:row.assetType,
      provenance:response.provenance,retrievedAt:response.provenance?.retrieved_at || null,adjustmentStatus:response.data.adjustmentStatus});
     result.rows.push({listingId:row.listingId,state:'STORED',from:cursor,to:windowTo,bars:bars.length});
     // Calendar window, rather than last trade, advances through holidays.
     const following = new Date(windowTo + 'T00:00:00Z'); following.setUTCDate(following.getUTCDate()+1);cursor=following.toISOString().slice(0,10);
     checkpoint.windowProgress={...(checkpoint.windowProgress||{}),[row.listingId]:{nextFrom:cursor,targetTo:to}};
     store.saveCheckpoint(checkpoint);
    } else {
     complete=false;
     const failed={listingId:row.listingId,state:'UNAVAILABLE',from:cursor,to:windowTo,reason:response.reason||'QUALITY_GATE',issues:[...issues,...(response.data?.anomalies||[]).map(a=>a.reason)]};failures.set(row.listingId,failed);result.rows.push(failed);
     if(['budgetExceeded','pageBudgetExceeded','quotaExceeded','rateLimited','entitlementRestricted','notConfigured'].includes(response.reason))break listingsLoop;
     break;
    }
   }
   if(complete){done.add(row.listingId);failures.delete(row.listingId);result.processed++;}

  }
  checkpoint.done=[...done];checkpoint.failed=[...failures.values()];store.saveCheckpoint(checkpoint);
 }
 checkpoint.done=[...done];checkpoint.failed=[...failures.values()];checkpoint.requests=provider.stats().requestsAttempted;store.saveCheckpoint(checkpoint);
 result.remaining=layer.listings.filter(r=>!done.has(r.listingId)).length;result.accounting=provider.stats();return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const phase=arg('phase','incremental'),working=resolve(arg('working','.market-cache'));
 const maxCredits=Number(arg('max-credits','100')),maxRequests=Number(arg('max-requests','100')),monthlyCeiling=Number(arg('monthly-ceiling','5000'));
 if(!Number.isInteger(monthlyCeiling)||monthlyCeiling<1||monthlyCeiling>100000)throw Error('INVALID_MONTHLY_SAFETY_CEILING');
 const ledgerPath=join(working,'marketstack','budget-ledger.json'),month=new Date().toISOString().slice(0,7);
 let ledger=existsSync(ledgerPath)?JSON.parse(readFileSync(ledgerPath)):null;
 if(!ledger||ledger.month!==month)ledger={month,estimatedCreditsConsumed:0,requestsAttempted:0,runs:[]};
 if(!Number.isFinite(ledger.estimatedCreditsConsumed)||ledger.estimatedCreditsConsumed<0)throw Error('CORRUPT_BUDGET_LEDGER');
 const available=Math.max(0,monthlyCeiling-ledger.estimatedCreditsConsumed);
 const openingCredits=ledger.estimatedCreditsConsumed,openingRequests=ledger.requestsAttempted;
 const client=createMarketstackClient({maxCredits:Math.min(maxCredits,available),maxRequests,onAttempt:accounting=>{
   ledger.estimatedCreditsConsumed=openingCredits+accounting.estimatedCreditsConsumed;ledger.requestsAttempted=openingRequests+accounting.requestsAttempted;
   ledger.reservationAt=new Date().toISOString();atomic(ledgerPath,ledger);
 }});
 let result;
 try {
  if(phase==='discovery'){
   const mic=arg('exchange');if(!/^[A-Z0-9]{4}$/.test(mic||''))throw Error('EXCHANGE_REQUIRED');
   const p=join(working,'marketstack','discovery',mic+'.json');let prior=existsSync(p)?JSON.parse(readFileSync(p)):null;
   if(prior?.complete)result={state:'CACHED_DISCOVERY',exchange:mic,symbols:prior.rows.length};
   else {const r=await client.paginate('/exchanges/'+mic+'/tickers',{limit:1000,offset:prior?.nextOffset||0},{maxPages:Number(arg('max-pages','10'))});const rows=[...(prior?.rows||[]),...(Array.isArray(r.data)?r.data:[])];atomic(p,{exchange:mic,rows,complete:r.complete===true,nextOffset:r.nextOffset||prior?.nextOffset||0,retrievedAt:new Date().toISOString()});result={state:r.ok?'DISCOVERED':'PARTIAL',exchange:mic,symbols:rows.length,remaining:'PROVIDER_PAGINATION',reason:r.reason};}
  }else if(['backfill','incremental'].includes(phase)){
   const input=arg('listings');if(!input)throw Error('VERIFIED_LISTINGS_REQUIRED');const layer=G.validate(JSON.parse(readFileSync(input)));
   const mappings=Object.fromEntries(layer.listings.map(r=>[r.listingId,{symbol:r.providerSymbol||r.ticker,exchange:r.mic,mic:r.mic,currency:r.tradingCurrency,assetType:r.assetType,securityId:r.securityId,listingId:r.listingId}]));
   const provider=createMarketstackProvider({client,mappings});const store=createMarketStore({root:process.cwd(),workingDir:working,providerId:'marketstack',publishedDir:join(working,'marketstack','unpublished')});
   const recent=new Date();recent.setUTCDate(recent.getUTCDate()-14);
   // An empty incremental cache requests a short repair window, not six years.
   result=await ingestListings({layer,provider,store,initial:phase==='backfill',from:arg('from',phase==='backfill'?'2020-01-01':recent.toISOString().slice(0,10)),to:arg('to',new Date().toISOString().slice(0,10)),maxPages:Number(arg('max-pages','10'))});
  }else throw Error('INVALID_INGESTION_PHASE');
 }finally{
  const accounting=client.stats();ledger.estimatedCreditsConsumed=openingCredits+accounting.estimatedCreditsConsumed;ledger.requestsAttempted=openingRequests+accounting.requestsAttempted;ledger.runs.push({at:new Date().toISOString(),phase,accounting});atomic(ledgerPath,ledger);
 }
 result.accounting=client.stats();result.monthlySafety={ceiling:monthlyCeiling,estimatedUsed:ledger.estimatedCreditsConsumed,remaining:Math.max(0,monthlyCeiling-ledger.estimatedCreditsConsumed),accountBalance:null};
 atomic(resolve(arg('out',join(working,'marketstack','latest-run.json'))),result);console.log(JSON.stringify(result));
}
