// Europe Discover refresh on a schedule: billing headers, quota reserve,
// trading-day skip and per-stock isolation on the scheduled path.
// Synthetic transport only; outputs go to temp dirs, never discover/data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const Calendar=require('../europe-exchange-calendar.js');
const root=new URL('../../',import.meta.url).pathname;
const R=await import(join(root,'scripts/marketstack/europe-discover-refresh.mjs'));
let baseline;
async function base(){return baseline??=await R.loadBaseline(root);}

// First XETR session at least ten days after the newest published session,
// 19:00 UTC (after every Europe close), so the tests stay valid after refreshes.
function sessionRunDate(b){const last=b.catalog.securities.map(x=>x.listings[0].discoverChart.lastDate).sort().at(-1);let t=Date.parse(last)+10*86400000;for(;;t+=86400000){const d=new Date(t).toISOString().slice(0,10);if(Calendar.sessions('XETR',d,d).length&&Calendar.sessions('XPAR',d,d).length)return d+'T19:00:00.000Z';}}
function weekendAfter(b){const d=Date.parse(sessionRunDate(b).slice(0,10));for(let t=d;;t+=86400000)if(new Date(t).getUTCDay()===6)return new Date(t).toISOString().slice(0,10)+'T19:00:00.000Z';}

/** Synthetic /eod transport with Marketstack's billing headers. */
function transport(catalog,{now,conflict=new Set(),quotaStart=90000,calls={n:0}}){
 const last=new Map(catalog.securities.map(s=>[s.listings[0].providerSymbol+'@'+s.listings[0].mic,s]));
 return async url=>{
  calls.n++;
  const u=new URL(url),symbol=u.searchParams.get('symbols'),mic=u.searchParams.get('exchange'),from=u.searchParams.get('date_from'),to=u.searchParams.get('date_to'),s=last.get(symbol+'@'+mic);
  const series=JSON.parse(await readFile(join(root,'discover/data/europe/series/'+s.securityId+'.json'),'utf8')),close=series.points.at(-1)[1];
  const days=Calendar.sessions(mic,from,to).filter(x=>Date.parse(x.close)<=Date.parse(now)).map(x=>x.date);
  const data=days.map((d,i)=>{const c=d===from?(conflict.has(s.securityId)?close+1:close):+(close*(1+i/1000)).toFixed(4);
   return {open:c,high:c,low:c,close:c,volume:1000,adj_close:c,split_factor:1,dividend:0,name:s.name,exchange_code:mic,asset_type:'Stock',price_currency:s.listings[0].currency.toLowerCase(),symbol,exchange:mic,date:d+'T00:00:00+0000'};});
  const headers={'x-increment-usage':'1','x-quota-limit':'100000','x-quota-remaining':String(quotaStart-calls.n)};
  return {status:200,headers:{get:n=>headers[n.toLowerCase()]??null},text:async()=>JSON.stringify({pagination:{limit:1000,offset:0,count:data.length,total:data.length},data})};
 };
}

test('usage ledger sums the billed credits and keeps the lowest observed remainder; missing headers stay UNKNOWN',()=>{
 const u=R.usageLedger();u.record({'x-increment-usage':'1','x-quota-limit':'100000','x-quota-remaining':'99011'},'t1');u.record({'x-increment-usage':'1','x-quota-remaining':'99010'},'t2');
 assert.deepEqual(u.summary(),{actualBilledCredits:2,quota:{limit:100000,remaining:99010,observedAt:'t2',responses:2,responsesWithUsageHeader:2,source:'MARKETSTACK_RESPONSE_HEADERS'}});
 const v=R.usageLedger();v.record({},'t');assert.equal(v.summary().actualBilledCredits,'UNKNOWN');assert.equal(v.summary().quota.remaining,null);
});

test('schedule decision: no request on a weekend, before the close, after a completed refresh, or below the reserve of the same month',async()=>{
 const b=await base(),now=sessionRunDate(b),planned=449;
 const sat=R.scheduleDecision({manifest:b.manifest,catalog:b.catalog,now:weekendAfter(b),plannedCredits:planned});assert.equal(sat.run,false);assert.equal(sat.reason,'NO_EUROPE_SESSION_TODAY');
 const xmas=R.scheduleDecision({manifest:b.manifest,catalog:b.catalog,now:'2026-12-25T19:00:00.000Z',plannedCredits:planned});assert.equal(xmas.reason,'NO_EUROPE_SESSION_TODAY');
 const early=R.scheduleDecision({manifest:b.manifest,catalog:b.catalog,now:now.slice(0,10)+'T12:00:00.000Z',plannedCredits:planned});assert.equal(early.reason,'BEFORE_LAST_EUROPE_CLOSE');
 const ok=R.scheduleDecision({manifest:b.manifest,catalog:b.catalog,now,plannedCredits:planned});assert.equal(ok.run,true,JSON.stringify(ok));
 const done=R.scheduleDecision({manifest:{...b.manifest,refresh:{...b.manifest.refresh,evaluatedAt:now}},catalog:b.catalog,now,plannedCredits:planned});assert.equal(done.reason,'ALREADY_REFRESHED_AFTER_TODAYS_CLOSE');
 const low={...b.manifest,refresh:{...b.manifest.refresh,quota:{remaining:5300,observedAt:now.slice(0,8)+'01T19:00:00.000Z'}}};
 assert.equal(R.scheduleDecision({manifest:low,catalog:b.catalog,now,plannedCredits:planned}).reason,'QUOTA_RESERVE_FROM_LAST_RUN');
 // A remainder observed in an earlier month says nothing after the monthly reset; the live header check still applies.
 const old={...b.manifest,refresh:{...b.manifest.refresh,quota:{remaining:10,observedAt:'2000-01-31T19:00:00.000Z'}}};
 assert.equal(R.scheduleDecision({manifest:old,catalog:b.catalog,now,plannedCredits:planned}).run,true);
});

test('a scheduled run on a non-session day makes no provider request and writes nothing',async()=>{
 const b=await base(),now=weekendAfter(b),out=await mkdtemp(join(tmpdir(),'eu-sched-')),calls={n:0};
 try{const r=await R.refreshPublication({root,out,now,apiKey:'test-key',scheduled:true,fetchImpl:transport(b.catalog,{now,calls}),sleep:async()=>{}});
  assert.equal(r.skipped,true);assert.equal(r.decision.reason,'NO_EUROPE_SESSION_TODAY');assert.equal(r.requests,0);assert.equal(calls.n,0);
  await assert.rejects(readFile(join(out,'manifest.json')));
 }finally{await rm(out,{recursive:true,force:true});}
});

test('the live quota reserve stops after the first billed response; nothing is published',async()=>{
 const b=await base(),now=sessionRunDate(b),out=await mkdtemp(join(tmpdir(),'eu-sched-')),priv=await mkdtemp(join(tmpdir(),'eu-sched-private-')),report=join(out,'..',out.split('/').pop()+'-report.json'),calls={n:0};
 try{
  await assert.rejects(R.refreshPublication({root,out,privateDir:join(priv,'run'),now,apiKey:'test-key',scheduled:true,reportPath:report,fetchImpl:transport(b.catalog,{now,quotaStart:5300,calls}),sleep:async()=>{}}),/PROVIDER_RUN_STOPPED:QUOTA_RESERVE_REACHED/);
  assert.equal(calls.n,1,'exactly one billed request reveals the remainder');
  const r=JSON.parse(await readFile(report,'utf8'));assert.equal(r.run.quota.remaining,5299);assert.equal(r.run.actualBilledCredits,1);
  await assert.rejects(readFile(join(out,'manifest.json')),'nothing is published');
 }finally{await rm(out,{recursive:true,force:true});await rm(priv,{recursive:true,force:true});await rm(report,{force:true});}
});

test('scheduled path: one faulty stock is isolated as BLOCKED, 448 are admitted, billing and quota are recorded',async()=>{
 const b=await base(),now=sessionRunDate(b),out=await mkdtemp(join(tmpdir(),'eu-sched-')),priv=await mkdtemp(join(tmpdir(),'eu-sched-private-')),calls={n:0};
 const conflict=b.catalog.securities.find(s=>s.listings[0].mic==='XETR'&&s.securityId!=='ref_RHM_DE_XETR').securityId;
 try{
  const r=await R.refreshPublication({root,out,privateDir:join(priv,'run'),now,apiKey:'test-key',scheduled:true,fetchImpl:transport(b.catalog,{now,conflict:new Set([conflict]),calls}),sleep:async()=>{}});
  assert.equal(r.failure,null);assert.equal(r.admitted,448);assert.deepEqual(r.blocked.map(x=>x.securityId),[conflict]);
  // Billing comes through the real client (providers/marketstack/client.js reads x-increment-usage / x-quota-*).
  assert.equal(r.run.requests,449);assert.equal(r.run.actualBilledCredits,449);assert.equal(r.run.quota.remaining,90000-449);assert.equal(r.run.scheduled,true);
  const manifest=JSON.parse(await readFile(join(out,'manifest.json'),'utf8'));
  assert.equal(manifest.refresh.schedule,true);assert.equal(manifest.refresh.actualBilledCredits,449);assert.equal(manifest.refresh.quota.remaining,90000-449);assert.equal(manifest.refresh.quota.limit,100000);
  assert.equal(manifest.publication.admitted,448);assert.deepEqual(manifest.publication.blocked.map(x=>x.securityId),[conflict]);
  // The next scheduled check on the same evening refuses a second run without a request.
  assert.equal(R.scheduleDecision({manifest,catalog:b.catalog,now,plannedCredits:449}).reason,'ALREADY_REFRESHED_AFTER_TODAYS_CLOSE');
 }finally{await rm(out,{recursive:true,force:true});await rm(priv,{recursive:true,force:true});}
});
