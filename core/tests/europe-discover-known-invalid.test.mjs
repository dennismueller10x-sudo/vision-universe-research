// Europe Discover refresh: known-invalid provider symbols (HTTP 422
// no_valid_symbols_provided) are taken from the recorded evidence of the
// previous refresh and are not requested again. They stay BLOCKED with the
// identical reason, keep their identity, count towards the 22-blocked limit,
// and are requested again only on an explicit re-probe.
// Synthetic transport only; every output goes to temp dirs, never discover/data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
const Calendar=require('../europe-exchange-calendar.js'),Isolation=require('../europe-publication-isolation.js');
const root=new URL('../../',import.meta.url).pathname;
const R=await import(join(root,'scripts/marketstack/europe-discover-refresh.mjs'));
const K=R.KNOWN_INVALID_POLICY,sha=x=>createHash('sha256').update(x).digest('hex');
let baseline;
async function base(){return baseline??=await R.loadBaseline(root);}

// Next date after `iso` with an XETR and an XPAR session, 19:00 UTC (after every Europe close).
function nextSession(iso,minDays=1){for(let t=Date.parse(iso.slice(0,10))+minDays*86400000;;t+=86400000){const d=new Date(t).toISOString().slice(0,10);if(Calendar.sessions('XETR',d,d).length&&Calendar.sessions('XPAR',d,d).length)return d+'T19:00:00.000Z';}}
const newest=b=>b.catalog.securities.map(x=>x.listings[0].discoverChart.lastDate).sort().at(-1);

/** Synthetic /eod transport over the publication in dataDir. Symbols in
 * `invalid` get Marketstack's real 422 answer; calls are counted per symbol. */
function transport(catalog,dataDir,{now,invalid=new Set(),conflict=new Set(),calls=new Map()}){
 const bySymbol=new Map(catalog.securities.map(s=>[s.listings[0].providerSymbol+'@'+s.listings[0].mic,s]));let n=0;
 return async url=>{
  const u=new URL(url),symbol=u.searchParams.get('symbols'),mic=u.searchParams.get('exchange'),from=u.searchParams.get('date_from'),to=u.searchParams.get('date_to'),s=bySymbol.get(symbol+'@'+mic);
  calls.set(symbol,(calls.get(symbol)||0)+1);n++;
  const headers={'x-increment-usage':'1','x-quota-limit':'100000','x-quota-remaining':String(90000-n)},h={get:k=>headers[k.toLowerCase()]??null};
  if(invalid.has(symbol))return {status:422,headers:h,text:async()=>JSON.stringify({error:{code:'no_valid_symbols_provided',message:'No valid symbols provided.'}})};
  const series=JSON.parse(await readFile(join(dataDir,'series',s.securityId+'.json'),'utf8')),close=series.points.at(-1)[1];
  const days=Calendar.sessions(mic,from,to).filter(x=>Date.parse(x.close)<=Date.parse(now)).map(x=>x.date);
  const data=days.map((d,i)=>{const c=d===from?(conflict.has(s.securityId)?close+1:close):+(close*(1+i/1000)).toFixed(4);
   return {open:c,high:c,low:c,close:c,volume:1000,adj_close:c,split_factor:1,dividend:0,name:s.name,exchange_code:mic,asset_type:'Stock',price_currency:s.listings[0].currency.toLowerCase(),symbol,exchange:mic,date:d+'T00:00:00+0000'};});
  return {status:200,headers:h,text:async()=>JSON.stringify({pagination:{limit:1000,offset:0,count:data.length,total:data.length},data})};
 };
}

test('known-invalid symbols come only from recorded 422 evidence of the last refresh (held and hash-bound BLOCKED)',async()=>{
 const b=await base(),known=R.knownInvalidSymbols(b.manifest,b.catalog);
 const held=new Set((b.manifest.refresh?.held||[]).filter(h=>h.reason===K.reasonCode).map(h=>h.securityId));
 assert.deepEqual(known.map(k=>k.securityId),(b.manifest.publication?.blocked||[]).filter(x=>held.has(x.securityId)&&x.reasonClass===K.reasonClass&&x.reasonCode===K.reasonCode).map(x=>x.securityId));
 for(const k of known){assert.equal(k.reasonClass,'PROVIDER_DATA_UNAVAILABLE');assert.equal(k.reasonCode,'PROVIDER_REQUEST_FAILED:providerError:no_valid_symbols_provided:HTTP422');assert.equal(k.source,'PREVIOUS_REFRESH_PROVIDER_REJECTION');assert.ok(Date.parse(k.lastProbedAt));}
 // Only the AMI.DE price break is not a provider rejection; it is never pre-excluded.
 assert.ok(!known.some(k=>k.securityId==='ref_AMI_DE_XETR'));
 // Synthetic manifests: both records are required; other reasons never qualify.
 const s=b.catalog.securities.slice(0,3).map(x=>({securityId:x.securityId,ticker:x.listings[0].ticker,mic:x.listings[0].mic,providerSymbol:x.listings[0].providerSymbol}));
 const blocked=(id,reasonClass=K.reasonClass,reasonCode=K.reasonCode)=>({securityId:id,ticker:null,mic:null,reasonClass,reasonCode,admissionReasons:[]});
 const m=(held,blockedList,preExcluded)=>({refresh:{evaluatedAt:'2026-11-03T16:07:47.486Z',held,...(preExcluded?{preExcluded}:{})},publication:{blocked:blockedList}});
 assert.deepEqual(R.knownInvalidSymbols({},b.catalog),[]);
 assert.deepEqual(R.knownInvalidSymbols(m([{securityId:s[0].securityId,reason:K.reasonCode}],[]),b.catalog),[],'held alone is not enough');
 assert.deepEqual(R.knownInvalidSymbols(m([],[blocked(s[0].securityId)]),b.catalog),[],'blocked alone is not enough');
 assert.deepEqual(R.knownInvalidSymbols(m([{securityId:s[0].securityId,reason:'PROVIDER_REQUEST_FAILED:internalError:internal_error:HTTP500'}],[blocked(s[0].securityId,K.reasonClass,'PROVIDER_REQUEST_FAILED:internalError:internal_error:HTTP500')]),b.catalog),[],'transient failures are requested again');
 const first=R.knownInvalidSymbols(m([{securityId:s[0].securityId,reason:K.reasonCode}],[blocked(s[0].securityId)]),b.catalog);
 assert.deepEqual(first.map(x=>[x.securityId,x.providerSymbol,x.mic,x.lastProbedAt]),[[s[0].securityId,s[0].providerSymbol,s[0].mic,'2026-11-03T16:07:47.486Z']]);
 // Carried forward: the time of the last real request stays; a changed provider symbol lapses the evidence.
 const carried=R.knownInvalidSymbols(m([{securityId:s[0].securityId,reason:K.reasonCode}],[blocked(s[0].securityId)],[{...first[0],lastProbedAt:'2026-11-01T17:47:00.000Z'}]),b.catalog);
 assert.equal(carried[0].lastProbedAt,'2026-11-01T17:47:00.000Z');
 assert.deepEqual(R.knownInvalidSymbols(m([{securityId:s[0].securityId,reason:K.reasonCode}],[blocked(s[0].securityId)],[{...first[0],providerSymbol:'OTHER.PA'}]),b.catalog),[]);
});

test('chain: a real 422 is not retried, the next run does not request it, keeps it BLOCKED with provenance and counts it against the 22 limit; only a re-probe requests it again',async()=>{
 const b=await base(),tmp=await mkdtemp(join(tmpdir(),'eu-known-invalid-')),dir=join(tmp,'discover/data/europe'),outs=[];
 const xetr=b.catalog.securities.filter(s=>s.listings[0].mic==='XETR'&&s.securityId!=='ref_AMI_DE_XETR').slice(0,2),invalid=new Set(xetr.map(s=>s.listings[0].providerSymbol)),ids=xetr.map(s=>s.securityId).sort();
 const run=async(opts,label)=>{const out=await mkdtemp(join(tmpdir(),'eu-known-invalid-'+label+'-'));outs.push(out);return {out,r:await R.refreshPublication({root,privateDir:join(out+'-private','run'),apiKey:'test-key',sleep:async()=>{},...opts,out:opts.out||out})};};
 try{
  await cp(join(root,'discover/data/europe'),dir,{recursive:true});
  // Run 1 (re-probe of everything): the provider rejects two symbols with 422.
  const now1=nextSession(newest(b)+'T00:00:00.000Z',10),calls1=new Map();
  const r1=(await run({out:dir,now:now1,reprobeKnownInvalid:true,fetchImpl:transport(b.catalog,dir,{now:now1,invalid,calls:calls1})},'r1')).r;
  for(const s of invalid)assert.equal(calls1.get(s),1,s+' a deterministic 422 is not retried');
  assert.equal(r1.run.requests,449,'no retry pass for the 422 answers');assert.deepEqual(r1.preExcluded,[]);
  assert.deepEqual(r1.blocked.map(x=>[x.securityId,x.reasonClass,x.reasonCode]),ids.map(id=>[id,K.reasonClass,K.reasonCode]));
  const m1=JSON.parse(await readFile(join(dir,'manifest.json'),'utf8'));assert.deepEqual(m1.refresh.preExcluded,[]);assert.equal(m1.refresh.knownInvalidReprobe,true);
  const b1=await R.loadBaseline(root,dir);assert.deepEqual(R.knownInvalidSymbols(b1.manifest,b1.catalog).map(k=>[k.securityId,k.lastProbedAt]),ids.map(id=>[id,now1]));
  // Run 2 (scheduled, default): the two symbols are not requested at all.
  const now2=nextSession(now1),calls2=new Map();
  const {out:o2,r:r2}=await run({baselineDir:dir,now:now2,scheduled:true,fetchImpl:transport(b1.catalog,dir,{now:now2,invalid,calls:calls2})},'r2');
  for(const s of invalid)assert.equal(calls2.get(s),undefined,s+' not requested');
  assert.equal(r2.run.requests,447);assert.equal(r2.run.actualBilledCredits,447);assert.equal(r2.plan.excluded,2);
  assert.equal(r2.failure,null);assert.equal(r2.admitted,447);
  assert.deepEqual(r2.blocked.map(x=>[x.securityId,x.reasonClass,x.reasonCode]),ids.map(id=>[id,K.reasonClass,K.reasonCode]),'same reason class and code as after the real request');
  const m2=JSON.parse(await readFile(join(o2,'manifest.json'),'utf8')),c2=JSON.parse(await readFile(join(o2,'catalog.json'),'utf8'));
  assert.deepEqual(m2.refresh.preExcluded.map(k=>[k.securityId,k.providerSymbol,k.lastProbedAt,k.source]),xetr.map(s=>[s.securityId,s.listings[0].providerSymbol,now1,K.source]).sort((a,b)=>a[0]<b[0]?-1:1));
  assert.deepEqual(m2.refresh.held.filter(h=>ids.includes(h.securityId)).map(h=>h.reason),[K.reasonCode,K.reasonCode]);
  assert.equal(m2.refresh.knownInvalidReprobe,false);assert.equal(m2.refresh.schedule,true);
  // Identity stays published; the catalog flag carries the reason (the site labels it), no chart, no price.
  for(const id of ids){const s=c2.securities.find(x=>x.securityId===id),o=b.catalog.securities.find(x=>x.securityId===id);assert.equal(s.isin,o.isin);assert.equal(s.listings[0].providerSymbol,o.listings[0].providerSymbol);assert.deepEqual(s.listings[0].discoverPublication,{status:'BLOCKED',reasonClass:K.reasonClass,reasonCode:K.reasonCode});}
  assert.equal(Isolation.verify(m2,c2,sha).blocked.length,2);
  // Run 3: 21 further faulty stocks plus the two pre-excluded ones are 23 > 22: the publication aborts.
  const more=new Set(b1.catalog.securities.filter(s=>!ids.includes(s.securityId)&&s.securityId!=='ref_AMI_DE_XETR').slice(0,21).map(s=>s.securityId));
  // (a held stock is blocked by the unchanged freshness gate once its last close is more than three sessions old)
  const now3=nextSession(now1,8);
  await assert.rejects(run({baselineDir:dir,now:now3,fetchImpl:transport(b1.catalog,dir,{now:now3,invalid,conflict:more})},'r3'),/BLOCKED_SHARE_LIMIT_EXCEEDED:23>22/);
  // Run 4: an explicit re-probe requests them again; served again, they are admitted.
  const calls4=new Map(),{r:r4}=await run({baselineDir:dir,now:now2,reprobeKnownInvalid:true,fetchImpl:transport(b1.catalog,dir,{now:now2,calls:calls4})},'r4');
  for(const s of invalid)assert.equal(calls4.get(s),1,s+' requested on re-probe');
  assert.equal(r4.run.requests,449);assert.equal(r4.admitted,449);assert.deepEqual(r4.blocked,[]);assert.deepEqual(r4.preExcluded,[]);
 }finally{await rm(tmp,{recursive:true,force:true});for(const o of outs){await rm(o,{recursive:true,force:true});await rm(o+'-private',{recursive:true,force:true});}}
});
