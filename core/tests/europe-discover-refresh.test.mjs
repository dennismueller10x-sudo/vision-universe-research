// Europe Discover refresh: append-only Close refresh over the published,
// hash-bound projection. Synthetic transport only; outputs go to a temp dir.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
const Calendar=require('../europe-exchange-calendar.js'),Sessions=require('../europe-session-proof.js'),Admission=require('../europe-discover-eligibility.js'),Market=require('../europe-market-data.js'),Isolation=require('../europe-publication-isolation.js');
const root=new URL('../../',import.meta.url).pathname;
const R=await import(join(root,'scripts/marketstack/europe-discover-refresh.mjs'));
const NOW='2026-11-03T18:00:00.000Z'; // dry-run only
let baseline;
async function base(){return baseline??=await R.loadBaseline(root);}

/** Synthetic Marketstack /eod transport: overlap row with the published close
 * plus one row per completed session; values are test fixtures only. */
function transport(catalog,{now=NOW,conflict=new Set(),skipDates=new Map(),jump=new Set()}={}){
 const last=new Map(catalog.securities.map(s=>[s.listings[0].providerSymbol+'@'+s.listings[0].mic,s]));
 return async url=>{
  const u=new URL(url),symbol=u.searchParams.get('symbols'),mic=u.searchParams.get('exchange'),from=u.searchParams.get('date_from'),to=u.searchParams.get('date_to'),s=last.get(symbol+'@'+mic);
  const series=JSON.parse(await readFile(join(root,'discover/data/europe/series/'+s.securityId+'.json'),'utf8')),close=series.points.at(-1)[1];
  const days=Calendar.sessions(mic,from,to).filter(x=>Date.parse(x.close)<=Date.parse(now)).map(x=>x.date).filter(d=>!(skipDates.get(s.securityId)||[]).includes(d));
  const data=days.map((d,i)=>{const c=d===from?(conflict.has(s.securityId)?close+1:close):+(close*(jump.has(s.securityId)&&i===days.length-1?3:1+i/1000)).toFixed(4);
   return {open:c,high:c,low:c,close:c,volume:1000,adj_close:c,split_factor:1,dividend:0,name:s.name,exchange_code:mic,asset_type:'Stock',price_currency:s.listings[0].currency.toLowerCase(),symbol,exchange:mic,date:d+'T00:00:00+0000'};});
  return {status:200,headers:{get:()=>null},text:async()=>JSON.stringify({pagination:{limit:1000,offset:0,count:data.length,total:data.length},data})};
 };
}

test('rule calendar reproduces the reviewed October 2026 exchange_calendars schedule exactly',async()=>{
 // SHA-256 of the reviewed exchange_calendars 4.13.2 sessions (all ten MICs,
 // 2026-10-01..2026-10-30) published on 2026-10-10.
 const mics=['XAMS','XBRU','XCSE','XETR','XMAD','XMIL','XPAR','XSTO','XSWX','XWBO'];
 const generated=Object.fromEntries(mics.map(m=>[m,Calendar.sessions(m,'2026-10-01','2026-10-30')]));
 assert.equal(createHash('sha256').update(JSON.stringify(generated)).digest('hex'),'ccf785e171efb51c9bc57b35a842a12337a3c55a2089e294ccc05c6bfa9e6787');
 const pub=JSON.parse(await readFile(join(root,'discover/data/europe/calendar.json'),'utf8'));
 for(const [mic,c]of Object.entries(pub.calendars))assert.deepEqual(Calendar.sessions(mic,c.coverageFrom,c.coverageTo),c.sessions,mic);
 assert.deepEqual(Calendar.sessions('XWBO','2026-10-26','2026-10-26'),[]);
 assert.equal(Calendar.sessions('XSTO','2026-10-30','2026-10-30')[0].close,'2026-10-30T12:00:00+00:00');
 assert.equal(Calendar.sessions('XETR','2026-10-26','2026-10-26')[0].close,'2026-10-26T16:30:00+00:00');
 assert.deepEqual(Calendar.sessions('XETR','2026-12-24','2026-12-31').map(x=>x.date),['2026-12-28','2026-12-29','2026-12-30']);
});

test('publication window is derived from data and run date, so it can never silently expire',async()=>{
 for(const run of ['2026-11-03','2027-06-15','2031-01-06','2040-02-29']){
  const w=Calendar.publicationWindow(['2026-10-09',run],run);
  assert.ok(w.coverageTo>run&&w.coverageFrom<'2026-10-09',run);
  for(const mic of Object.keys(Calendar.RULES))assert.ok(Calendar.sessions(mic,run,w.coverageTo).length>40,mic+' '+run);
 }
 // No fixed calendar dates in the producer or the calendar rules.
 for(const file of ['scripts/marketstack/europe-discover-refresh.mjs','core/europe-exchange-calendar.js','scripts/marketstack/europe-discover-publication.mjs']){
  const src=await readFile(join(root,file),'utf8');
  assert.deepEqual(src.match(/['"]20\d\d-\d\d-\d\d['"]/g)||[],[],file+' must not contain a hard-coded calendar date');
 }
});

test('the published calendar keeps every listing evaluable today (coverage must not be exhausted)',{skip:process.env.EUROPE_LIVE_CALENDAR_CHECK!=='1'&&'opt-in: EUROPE_LIVE_CALENDAR_CHECK=1 checks the committed data against the wall clock'},async()=>{
 const b=await base();
 // The browser runs this on every Europe route; it must not throw.
 assert.doesNotThrow(()=>Sessions.refreshCatalog(b.catalog,b.calendar,{now:new Date().toISOString()}),'calendar coverage exhausted: run the Europe refresh');
});

test('dry run estimates one request and one reserved credit per listing, within the cap',async()=>{
 const out=await mkdtemp(join(tmpdir(),'eu-refresh-'));
 try{const b=await base(),now=runDate(b),r=await R.refreshPublication({root,out,now,dryRun:true,reprobeKnownInvalid:true});
  assert.equal(r.listings,449);assert.equal(r.plan.requests,449);assert.equal(r.plan.credits,449);assert.ok(r.plan.worstCaseCredits<=R.REFRESH_LIMITS.hardCap);
  // Default: known-invalid provider symbols from the last refresh are not requested.
  const known=R.knownInvalidSymbols(b.manifest,b.catalog),d=await R.refreshPublication({root,out,now,dryRun:true});
  assert.equal(d.plan.requests,449-known.length);assert.equal(d.plan.excluded,known.length);assert.deepEqual(d.preExcluded,known);
 }finally{await rm(out,{recursive:true,force:true});}
});

// Run date derived from the committed baseline: ten calendar days after its
// newest session, 18:00 UTC, so the test stays valid after every refresh.
function runDate(b){const last=b.catalog.securities.map(x=>x.listings[0].discoverChart.lastDate).sort().at(-1);return new Date(Date.parse(last)+10*86400000).toISOString().slice(0,10)+'T18:00:00.000Z';}

test('a listing that cannot be refreshed is published as BLOCKED with its reason; the other 448 must each pass every gate',async()=>{
 const b=await base(),now=runDate(b),out=await mkdtemp(join(tmpdir(),'eu-refresh-')),priv=await mkdtemp(join(tmpdir(),'eu-refresh-private-')),report=join(out,'..',out.split('/').pop()+'-report.json');
 const conflict=b.catalog.securities.find(s=>s.listings[0].mic==='XAMS').securityId;
 try{
  const r=await R.refreshPublication({root,out,privateDir:join(priv,'run'),now,apiKey:'test-key',reprobeKnownInvalid:true,reportPath:report,fetchImpl:transport(b.catalog,{now,conflict:new Set([conflict])}),sleep:async()=>{}});
  assert.equal(r.failure,null);assert.equal(r.admitted,448);
  assert.deepEqual(r.held.map(h=>[h.securityId,h.reason]),[[conflict,'OVERLAP_CLOSE_CONFLICT']]);
  assert.deepEqual(r.blocked.map(x=>[x.securityId,x.reasonClass,x.reasonCode]),[[conflict,'PRICE_DISCONTINUITY_UNRESOLVED','OVERLAP_CLOSE_CONFLICT']]);
  const manifest=JSON.parse(await readFile(join(out,'manifest.json'),'utf8')),catalog=JSON.parse(await readFile(join(out,'catalog.json'),'utf8')),calendar=JSON.parse(await readFile(join(out,'calendar.json'),'utf8'));
  const sha=x=>createHash('sha256').update(x).digest('hex');
  assert.equal(sha(await readFile(join(out,'catalog.json'))),manifest.catalog.sha256);
  const p=Isolation.verify(manifest,catalog,sha);assert.equal(p.admitted.length,448);assert.deepEqual(p.blocked.map(x=>x.securityId),[conflict]);
  assert.equal(catalog.securities.length,449,'the universe stays complete');assert.equal(Object.keys(manifest.series).length,449);
  const projected=Sessions.refreshCatalog(catalog,calendar,{now});
  for(const s of projected.securities){const e=Admission.evaluate(s,s.listings[0],now);assert.equal(e.DISCOVER_ELIGIBLE,s.securityId!==conflict,s.securityId);}
  const s=projected.securities.find(x=>x.securityId===conflict),e=Admission.evaluate(s,s.listings[0],now);assert.ok(e.discoverReasonCodes.includes('PUBLICATION_BLOCKED'));
  // A blocked security never gets a chart or a price, even though its old hash-bound series stays the refresh baseline.
  const client=Market.create({catalog:projected,rights:manifest.rights,audience:'public',now,usClient:{},loadSeries:async q=>{const binding=q.range==='1Y'?manifest.series[q.securityId]:manifest.history[q.securityId][q.range];return JSON.parse(await readFile(join(out,binding.url.replace('/discover/data/europe/','')),'utf8'));}});
  const ref={region:'EUROPE',securityId:conflict};for(const range of ['1Y','MAX'])assert.notEqual((await client.getPriceSeries(ref,{range})).state,'AVAILABLE');assert.notEqual((await client.getLatestPrice(ref)).state,'AVAILABLE');
  // Even a valid chart proof is refused once the publication blocks the listing.
  const lifted=structuredClone(projected.securities.find(x=>x.securityId!==conflict));assert.ok(Admission.evaluate(lifted,lifted.listings[0],now).DISCOVER_ELIGIBLE);lifted.listings[0].discoverPublication={status:'BLOCKED',reasonClass:'ADMISSION_CHECK_FAILED',reasonCode:'TEST'};assert.equal(Admission.evaluate(lifted,lifted.listings[0],now).DISCOVER_ELIGIBLE,false);
 }finally{await rm(out,{recursive:true,force:true});await rm(priv,{recursive:true,force:true});await rm(report,{force:true});}
});

test('more than 22 blocked securities (5 % of 449) abort the whole publication; nothing is written',async()=>{
 const b=await base(),now=runDate(b),out=await mkdtemp(join(tmpdir(),'eu-refresh-')),priv=await mkdtemp(join(tmpdir(),'eu-refresh-private-')),report=join(out,'..',out.split('/').pop()+'-report.json');
 const many=new Set(b.catalog.securities.slice(0,23).map(s=>s.securityId));
 try{
  await assert.rejects(R.refreshPublication({root,out,privateDir:join(priv,'run'),now,apiKey:'test-key',reprobeKnownInvalid:true,reportPath:report,fetchImpl:transport(b.catalog,{now,conflict:many}),sleep:async()=>{}}),/BLOCKED_SHARE_LIMIT_EXCEEDED:23>22/);
  const r=JSON.parse(await readFile(report,'utf8'));assert.equal(r.blocked.length,23);
  await assert.rejects(readFile(join(out,'manifest.json')),'nothing is published');
 }finally{await rm(out,{recursive:true,force:true});await rm(priv,{recursive:true,force:true});await rm(report,{force:true});}
});

test('append-only refresh keeps every old price, binds the new calendar and passes the unchanged gates',async()=>{
 const b=await base(),now=runDate(b),out=await mkdtemp(join(tmpdir(),'eu-refresh-')),priv=await mkdtemp(join(tmpdir(),'eu-refresh-private-'));
 const rhm='ref_RHM_DE_XETR',skip=b.catalog.securities.find(s=>s.listings[0].mic==='XPAR').securityId,jump=b.catalog.securities.find(s=>s.listings[0].mic==='XMIL').securityId;
 const skipMic=b.catalog.securities.find(s=>s.securityId===skip).listings[0].mic,skipFrom=b.catalog.securities.find(s=>s.securityId===skip).listings[0].discoverChart.lastDate;
 const skipDay=Calendar.sessions(skipMic,skipFrom,now.slice(0,10))[2].date;
 let calls=0;const flaky=transport(b.catalog,{now,jump:new Set([jump]),skipDates:new Map([[skip,[skipDay]]])}),fetchImpl=async url=>{calls++;if(calls===3)return {status:500,headers:{get:()=>null},text:async()=>JSON.stringify({error:{code:500,type:'internal_error'}})};return flaky(url);};
 try{
  const r=await R.refreshPublication({root,out,privateDir:join(priv,'run'),now,apiKey:'test-key',reprobeKnownInvalid:true,fetchImpl,sleep:async()=>{}});
  assert.equal(r.run.requests,450,'449 listings plus one bounded retry');assert.deepEqual(r.held,[]);
  const manifest=JSON.parse(await readFile(join(out,'manifest.json'),'utf8')),catalog=JSON.parse(await readFile(join(out,'catalog.json'),'utf8')),calendar=JSON.parse(await readFile(join(out,'calendar.json'),'utf8'));
  assert.deepEqual(catalog.securities.map(s=>s.securityId),b.catalog.securities.map(s=>s.securityId),'same European coverage');
  const raw=await readFile(join(out,'catalog.json'),'utf8');assert.ok(!raw.includes('test-key')&&!raw.includes('access_key'));
  const projected=Sessions.refreshCatalog(catalog,calendar,{now});
  assert.deepEqual(projected.securities.filter(s=>!Admission.evaluate(s,s.listings[0],now).DISCOVER_ELIGIBLE).map(s=>s.securityId),[]);
  assert.equal(manifest.publication.admitted,449);assert.deepEqual(manifest.publication.blocked,[]);
  const s=projected.securities.find(x=>x.securityId===rhm),p=s.listings[0].discoverChart,expected=Calendar.sessions('XETR',p.lastDate,now.slice(0,10)).filter(x=>Date.parse(x.close)<=Date.parse(now)).at(-1).date;
  assert.equal(p.lastDate,expected);assert.equal(p.sessionLag,0);assert.ok(p.calendarProof.coverageTo>now.slice(0,10));
  const one=JSON.parse(await readFile(join(out,'series',rhm+'.json'),'utf8')),long=JSON.parse(await readFile(join(out,'series-long',rhm+'.json'),'utf8'));
  const oldLong=b.long.get(rhm);assert.deepEqual(long.points.slice(0,oldLong.points.length),oldLong.points,'old prices unchanged');
  assert.equal(one.points.at(-1)[0],expected);assert.ok(one.points[0][0]>(+expected.slice(0,4)-1)+expected.slice(4));
  for(const range of ['1Y','MAX'])assert.ok(Admission.evaluate(s,s.listings[0],now,range).DISCOVER_ELIGIBLE,range);
  // A skipped provider day becomes a visible segment break, never an invented price.
  const sk=JSON.parse(await readFile(join(out,'series-long',skip+'.json'),'utf8'));
  assert.ok(!sk.points.some(x=>x[0]===skipDay));assert.ok(sk.segments.some(g=>g[0][0]>skipDay&&g[0][0]===sk.points.find(x=>x[0]>skipDay)[0]));
  // An unexplained jump on the newest day is not published; earlier verified days are.
  const j=projected.securities.find(x=>x.securityId===jump).listings[0].discoverChart,jl=JSON.parse(await readFile(join(out,'series-long',jump+'.json'),'utf8'));
  assert.equal(j.sessionLag,1);assert.equal(j.ranges.MAX.refresh.reason,'UNEXPLAINED_CLOSE_DISCONTINUITY');assert.ok(jl.points.at(-1)[0]<j.ranges.MAX.refresh.unpublishedFrom);
  // The public client accepts the refreshed hash-bound series for 1Y and MAX.
  const client=Market.create({catalog:projected,rights:manifest.rights,audience:'public',now,usClient:{},loadSeries:async q=>{const binding=q.range==='1Y'?manifest.series[q.securityId]:manifest.history[q.securityId][q.range];return JSON.parse(await readFile(join(out,binding.url.replace('/discover/data/europe/','')),'utf8'));}});
  const ref={region:'EUROPE',securityId:rhm,listingId:s.listings[0].listingId};
  for(const range of ['1Y','MAX']){const res=await client.getPriceSeries(ref,{range});assert.equal(res.state,'AVAILABLE',range+' '+res.reason);assert.equal(res.data.points.at(-1)[0],expected);}
 }finally{await rm(out,{recursive:true,force:true});await rm(priv,{recursive:true,force:true});}
});
