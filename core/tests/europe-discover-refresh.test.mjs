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
const Calendar=require('../europe-exchange-calendar.js'),Sessions=require('../europe-session-proof.js'),Admission=require('../europe-discover-eligibility.js'),Market=require('../europe-market-data.js');
const root=new URL('../../',import.meta.url).pathname;
const R=await import(join(root,'scripts/marketstack/europe-discover-refresh.mjs'));
const NOW='2026-11-03T18:00:00.000Z';
let baseline;
async function base(){return baseline??=await R.loadBaseline(root);}

/** Synthetic Marketstack /eod transport: overlap row with the published close
 * plus one row per completed session; values are test fixtures only. */
function transport(catalog,{conflict=new Set(),skipDates=new Map(),jump=new Set()}={}){
 const last=new Map(catalog.securities.map(s=>[s.listings[0].providerSymbol+'@'+s.listings[0].mic,s]));
 return async url=>{
  const u=new URL(url),symbol=u.searchParams.get('symbols'),mic=u.searchParams.get('exchange'),from=u.searchParams.get('date_from'),to=u.searchParams.get('date_to'),s=last.get(symbol+'@'+mic);
  const series=JSON.parse(await readFile(join(root,'discover/data/europe/series/'+s.securityId+'.json'),'utf8')),close=series.points.at(-1)[1];
  const days=Calendar.sessions(mic,from,to).filter(x=>Date.parse(x.close)<=Date.parse(NOW)).map(x=>x.date).filter(d=>!(skipDates.get(s.securityId)||[]).includes(d));
  const data=days.map((d,i)=>{const c=d===from?(conflict.has(s.securityId)?close+1:close):+(close*(jump.has(s.securityId)&&i===1?3:1+i/1000)).toFixed(4);
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
 try{const r=await R.refreshPublication({root,out,now:NOW,dryRun:true});
  assert.equal(r.listings,449);assert.equal(r.plan.requests,449);assert.equal(r.plan.credits,449);assert.ok(r.plan.worstCaseCredits<=R.REFRESH_LIMITS.hardCap);
 }finally{await rm(out,{recursive:true,force:true});}
});

test('append-only refresh keeps every old price, binds the new calendar and passes the unchanged gates',async()=>{
 const b=await base(),out=await mkdtemp(join(tmpdir(),'eu-refresh-')),priv=await mkdtemp(join(tmpdir(),'eu-refresh-private-'));
 const rhm='ref_RHM_DE_XETR',skip=b.catalog.securities.find(s=>s.listings[0].mic==='XPAR').securityId,conflict=b.catalog.securities.find(s=>s.listings[0].mic==='XAMS').securityId,jump=b.catalog.securities.find(s=>s.listings[0].mic==='XMIL').securityId;
 try{
  const r=await R.refreshPublication({root,out,privateDir:join(priv,'run'),now:NOW,apiKey:'test-key',fetchImpl:transport(b.catalog,{conflict:new Set([conflict]),jump:new Set([jump]),skipDates:new Map([[skip,['2026-10-20']]])}),sleep:async()=>{}});
  assert.equal(r.run.requests,449);assert.equal(r.run.reservedCredits,449);
  assert.deepEqual(r.held.map(h=>[h.securityId,h.reason]).sort(),[[conflict,'OVERLAP_CLOSE_CONFLICT'],[jump,'TAIL_CRITICAL_CLOSE_ISSUE']].sort());
  const manifest=JSON.parse(await readFile(join(out,'manifest.json'),'utf8')),catalog=JSON.parse(await readFile(join(out,'catalog.json'),'utf8')),calendar=JSON.parse(await readFile(join(out,'calendar.json'),'utf8'));
  assert.equal(catalog.securities.length,449);
  assert.deepEqual(catalog.securities.map(s=>s.securityId),b.catalog.securities.map(s=>s.securityId),'same European coverage');
  const raw=await readFile(join(out,'catalog.json'),'utf8');assert.ok(!raw.includes('test-key')&&!raw.includes('access_key'));
  const now=NOW,projected=Sessions.refreshCatalog(catalog,calendar,{now});
  const rows=projected.securities.map(s=>[s.securityId,Admission.evaluate(s,s.listings[0],now)]);
  assert.deepEqual(rows.filter(([,e])=>!e.DISCOVER_ELIGIBLE).map(([id])=>id).sort(),[conflict,jump].sort(),'only held listings turn stale');
  const s=projected.securities.find(x=>x.securityId===rhm),p=s.listings[0].discoverChart;
  assert.equal(p.lastDate,'2026-11-03');assert.equal(p.sessionLag,0);assert.equal(p.calendarProof.coverageTo>'2026-11-03',true);
  const one=JSON.parse(await readFile(join(out,'series',rhm+'.json'),'utf8')),long=JSON.parse(await readFile(join(out,'series-long',rhm+'.json'),'utf8'));
  const oldLong=b.long.get(rhm);assert.deepEqual(long.points.slice(0,oldLong.points.length),oldLong.points,'old prices unchanged');
  assert.equal(one.points[0][0]>'2025-11-03',true);assert.equal(one.points.at(-1)[0],'2026-11-03');
  for(const range of ['1Y','MAX'])assert.ok(Admission.evaluate(s,s.listings[0],now,range).DISCOVER_ELIGIBLE,range);
  // A skipped provider day becomes a visible segment break, never an invented price.
  const sk=JSON.parse(await readFile(join(out,'series-long',skip+'.json'),'utf8'));
  assert.ok(!sk.points.some(x=>x[0]==='2026-10-20'));assert.ok(sk.segments.some(g=>g[0][0]==='2026-10-21'));
  // Held listings keep byte-identical prices.
  assert.equal(manifest.series[conflict].sha256,b.manifest.series[conflict].sha256);
  // The public client accepts the refreshed hash-bound series for 1Y and MAX.
  const client=Market.create({catalog:projected,rights:manifest.rights,audience:'public',now,usClient:{},loadSeries:async q=>{const binding=q.range==='1Y'?manifest.series[q.securityId]:manifest.history[q.securityId][q.range];return JSON.parse(await readFile(join(out,binding.url.replace('/discover/data/europe/','')),'utf8'));}});
  const ref={region:'EUROPE',securityId:rhm,listingId:s.listings[0].listingId};
  for(const range of ['1Y','MAX']){const res=await client.getPriceSeries(ref,{range});assert.equal(res.state,'AVAILABLE',range+' '+res.reason);assert.equal(res.data.points.at(-1)[0],'2026-11-03');}
 }finally{await rm(out,{recursive:true,force:true});await rm(priv,{recursive:true,force:true});}
});
