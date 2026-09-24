import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),C=require('../api/market-signal-contract.js'),Service=require('../api/product-services.js'),Policy=require('../engines/display-policy.js'),Query=require('../engines/query.js'),Rules=require('../engines/rule-contract.js');
/* Die erwarteten Ereignisse sind am Bestand bis CUTOFF belegt. Der taegliche
   Marktdaten-Refresh schreibt golden-preview/daily fort und laesst DANACH
   diese Suite laufen: ohne Stichtag zaehlte der Test die Ereignisse des
   jeweils neuesten Bestands, ein neuer Regelwechsel (5 statt 4) machte die
   Suite rot, und der Commit der frischen Tageskurse fiel weg - vier Laeufe
   in Folge (18.-23.09.2026), Discover blieb auf dem 18.09. stehen. */
const CUTOFF='2026-09-18';
const pin=s=>{if(s&&Array.isArray(s.bars))s.bars=s.bars.filter(b=>b.date<=CUTOFF);return s;};
const read=p=>JSON.parse(readFileSync(new URL('../..'+p,import.meta.url))),readPinned=p=>p.includes('/golden-preview/daily/')?pin(read(p)):read(p);
const api=Service.create({loadJSON:p=>Promise.resolve(readPinned(p)),displayPolicy:Policy,queryEngine:Query}),recipes=api.getRecipes();
const source=t=>pin(JSON.parse(readFileSync(new URL('../data/market/golden-preview/daily/ref_'+t+'.json',import.meta.url))));
test('real observations reproduce two known MSFT rule transitions and unchanged dates produce no new event',()=>{const r=C.build(source('MSFT'),{ticker:'MSFT',recipes,lookback:60});assert.equal(r.state,'AVAILABLE');assert.deepEqual(r.events.map(e=>[e.asOf,e.definitionId]),[['2026-07-31','positive-momentum'],['2026-07-30','above-long-trend']]);for(const e of r.events){const recipe=recipes.find(r=>r.id===e.definitionId),previous=Object.fromEntries(e.evidence.map(m=>[m.metricId,m.previous])),current=Object.fromEntries(e.evidence.map(m=>[m.metricId,m.current]));assert.equal(e.transition,Rules.transition(previous,current,e.predicate));assert.equal(e.predicateHash,Rules.predicateHash(recipe.predicate));assert.equal(e.queryHash,Query.queryHash(recipe.query));assert.ok(e.expiration.at>e.asOf);assert.equal(e.status,'HISTORICAL');}assert.equal(C.build(source('MSFT'),{ticker:'MSFT',recipes}).events.length,0);});
test('canonical security identity supports punctuation-normalized class tickers',()=>{const s=source('MSFT'),ticker='MSFT-P-A',securityId='ref_MSFT_P_A';s.ticker=ticker;s.securityId=securityId;s.bars=s.bars.map(b=>({...b,securityId}));const r=C.build(s,{ticker,securityId,recipes,lookback:60});assert.equal(r.state,'AVAILABLE');assert.ok(r.events.every(e=>e.ticker===ticker));});
test('signal identity follows the predicate rather than presentation sort and limit',()=>{const changed=recipes.map(r=>({...r,query:Query.createQuery({...r.query,sort:[{field:r.field,direction:'asc'}],limit:5})})),before=C.build(source('MSFT'),{ticker:'MSFT',recipes,lookback:60}),after=C.build(source('MSFT'),{ticker:'MSFT',recipes:changed,lookback:60});assert.deepEqual(after.events.map(e=>e.id),before.events.map(e=>e.id));});
test('signal evaluation rejects a query that diverges from its canonical predicate',()=>{const changed=recipes.map((r,i)=>i?{...r}:{...r,query:Query.createQuery({filters:[{field:r.field,operator:'gte',value:999,scale:'raw'}]})});assert.equal(C.build(source('MSFT'),{ticker:'MSFT',recipes:changed,lookback:60}).reason,'UNSUPPORTED_SIGNAL_RULE');});
test('later prices cannot change earlier observed transitions',()=>{const s=source('MSFT'),before=C.build(s,{ticker:'MSFT',recipes,lookback:60});s.bars.at(-1).close*=2;s.bars.at(-1).adjustedClose*=2;const after=C.build(s,{ticker:'MSFT',recipes,lookback:60});assert.deepEqual(after.events.filter(e=>e.asOf<after.asOf),before.events.filter(e=>e.asOf<before.asOf));});
test('future, duplicate, nonfinite, unknown adjustments and split windows are not signal evidence',()=>{for(const mutate of [s=>s.bars.at(-1).date='2099-01-01',s=>s.bars.at(-1).date=s.bars.at(-2).date,s=>s.bars.at(-1).close=NaN,s=>s.adjustmentStatus='unknown',s=>s.bars.at(-1).splitFactor=2,s=>s.updatedAt='2099-01-01T00:00:00Z']){const s=source('NVDA');mutate(s);assert.equal(C.build(s,{ticker:'NVDA',recipes}).state,'UNAVAILABLE');}});
test('a split inside the signal window is accepted only with canonical reconciliation evidence',()=>{const s=source('NVDA');s.bars.at(-1).splitFactor=2;s.corporateActionReconciliation={status:'PASS',method:'CANONICAL_SPLIT_FACTORS_V1',priceSeriesType:'SPLIT_ADJUSTED',events:1};assert.equal(C.build(s,{ticker:'NVDA',recipes}).state,'AVAILABLE');});
test('approved scope is preserved and denied raw display prevents history reads',async()=>{const result=await api.getSignals({lookback:60});assert.equal(result.results.length,5);assert.equal(result.partial,false);assert.equal(result.events.length,4);let rawReads=0;const denied=Service.create({loadJSON:p=>{if(p.includes('/golden-preview/'))rawReads++;return Promise.resolve(readPinned(p));},displayPolicy:{...Policy,check:args=>({allowed:args.form==='derived'})},queryEngine:Query});assert.equal((await denied.getSignals()).state,'UNAVAILABLE');assert.equal(rawReads,0);});

test('overflow, insufficient comparison history and pre-close snapshots fail closed',()=>{const overflow=source('MSFT');overflow.bars.at(-1).close=1e100;assert.equal(C.build(overflow,{ticker:'MSFT',recipes}).reason,'INVALID_SIGNAL_PANEL');const short=source('MSFT');short.bars=short.bars.slice(-202);assert.equal(C.build(short,{ticker:'MSFT',recipes,lookback:60}).reason,'INSUFFICIENT_HISTORY');const early=source('MSFT');early.updatedAt=early.bars.at(-1).date+'T13:00:00Z';assert.equal(C.build(early,{ticker:'MSFT',recipes}).reason,'SESSION_NOT_CLOSED_AT_SNAPSHOT');});

test('unavailable coverage retains the requested company identity',async()=>{const broken=Service.create({loadJSON:p=>{const data=JSON.parse(readFileSync(new URL('../..'+p,import.meta.url)));if(p.endsWith('ref_MSFT.json'))data.updatedAt='2099-01-01T00:00:00Z';return Promise.resolve(data);},displayPolicy:Policy,queryEngine:Query});const result=await broken.getSignals();assert.equal(result.partial,true);assert.equal(result.results.find(r=>r.state==='UNAVAILABLE').ticker,'MSFT');});

test('a later daily refresh cannot change the pinned expectations (counter-check: unpinned, it would)',()=>{
  const fresh=JSON.parse(readFileSync(new URL('../data/market/golden-preview/daily/ref_MSFT.json',import.meta.url)));
  fresh.bars=fresh.bars.filter(b=>b.date<=CUTOFF);
  const last=fresh.bars.at(-1);
  /* Drei weitere Sitzungen mit halbiertem Kurs: unter dem 200-Tage-Schnitt, also ein neuer Regelwechsel. */
  for(const date of ['2026-09-21','2026-09-22','2026-09-23'])fresh.bars.push({...last,date,close:last.close/2,adjustedClose:last.adjustedClose/2,open:last.open/2,adjustedOpen:last.adjustedOpen/2,high:last.high/2,adjustedHigh:last.adjustedHigh/2,low:last.low/2,adjustedLow:last.adjustedLow/2});
  fresh.updatedAt='2026-09-23T23:00:00.000Z';
  const pinned=C.build(pin(structuredClone(fresh)),{ticker:'MSFT',recipes,lookback:60}),unpinned=C.build(structuredClone(fresh),{ticker:'MSFT',recipes,lookback:60});
  assert.equal(pinned.asOf,CUTOFF);
  assert.deepEqual(pinned.events.map(e=>[e.asOf,e.definitionId]),[['2026-07-31','positive-momentum'],['2026-07-30','above-long-trend']]);
  assert.equal(unpinned.state,'AVAILABLE');
  assert.equal(unpinned.asOf,'2026-09-23');
  assert.ok(unpinned.events.length>pinned.events.length,'die Gegenprobe muss ohne Stichtag einen zusaetzlichen Wechsel sehen');
});
