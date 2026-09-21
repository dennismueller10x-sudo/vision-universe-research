#!/usr/bin/env node
/* Discover 2.1 frontend contract gate.
 * It verifies reuse and presentation boundaries. It does not recalculate
 * rankings, freshness, eligibility or realtime semantics. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(path,'utf8');
const json=path=>JSON.parse(read(path));
const html=read('discover-v2/index.html');
const home=read('discover-v2/home.js');
const app=read('discover-v2/app.js');
const sharedCards=read('discover/ui/cards.js');
const sharedFeed=read('discover/ui/feed.js');
const sharedDetail=read('discover/ui/detail.js');
const sourceState=read('quant/engines/realtime/source-state.js');
const freshness=read('quant/engines/realtime/freshness.js');
const worker=read('worker/src/vu-live.mjs');
const meta=json('discover/data/meta.json');
const feed=json('discover/data/feed/US_REAL.json');

const checks=[];
function check(name,fn){fn();checks.push({name,status:'PASS'});}

check('B1 canonical freshness and source-state engines are loaded',()=>{
  for(const path of ['/quant/engines/realtime/freshness.js','/quant/engines/realtime/source-state.js','/discover/ui/live-hub.js','/discover/ui/cards.js']) assert(html.includes(path),path);
  assert.match(freshness,/STATES\s*=\s*\["LIVE",\s*"LAST_SESSION",\s*"STALE",\s*"UNAVAILABLE"\]/);
  assert.match(sourceState,/ZUSTAENDE\s*=\s*\["REALTIME",\s*"SNAPSHOT",\s*"FINAL_SESSION",\s*"STALE"\]/);
  assert.match(sharedCards,/data-freshness/);
  assert.match(sharedDetail,/SourceState/);
});

check('B1/B2 home and worlds use canonical visible-card snapshot adapter',()=>{
  assert.match(home,/D\.Cards\.lazyArtwork/);
  assert.match(home,/live:\s*options\.live\s*!==\s*false/);
  assert.match(home,/data-freshness/);
  assert.match(home,/data-session/);
  assert.match(app,/V\.Home\.render/);
  assert.match(app,/D\.Cards\.grid/);
  assert.match(sharedCards,/Hub\.subscribe\(card\.symbol,\s*zeigen\)/);
  assert.doesNotMatch(sharedCards,/Hub\.live\(card\.symbol,\s*zeigen\)/);
});

check('B2 feed uses the same canonical card/snapshot renderer',()=>{
  assert.match(app,/D\.Feed\.render/);
  assert.match(sharedFeed,/lazyArtwork\(karte/);
  assert.doesNotMatch(sharedFeed,/live:\s*false/);
});

check('B2 stream remains stock-page-only and bounded',()=>{
  const stream=meta.realtime?.stream;
  assert.equal(stream?.scope,'stockPage');
  assert.equal(stream?.available,true);
  assert(stream.maxSymbolsPerClient>0&&stream.maxSymbolsPerClient<=5);
  assert.match(sharedDetail,/\(Hub\.live\s*\|\|\s*Hub\.subscribe\)/);
});

check('B3 visible captions use structured metadata, never accessibility prose',()=>{
  assert.match(home,/rendered\.range/);
  assert.match(home,/rendered\.asOf/);
  assert.match(home,/media\.getAttribute\('data-freshness'\)/);
  assert.match(home,/media\.getAttribute\('data-session'\)/);
  assert.doesNotMatch(home,/getAttribute\(['"]aria-label['"]\)/);
  assert.doesNotMatch(home,/aria-label[^\n]*\.match\(/);
});

check('B4 realtime event semantics are variable and therefore stay tick-aligned',()=>{
  assert.match(worker,/priceType:\s*tick\.priceType\s*===\s*"TRADE"/);
  assert.match(worker,/messageForm:\s*tick\.messageForm/);
  assert.match(worker,/semantics\.push\(w\.semantics\)/);
  assert.match(worker,/schemaVersion:\s*UPDATE_SCHEMA,\s*v:\s*nutz,\s*semantics/);
});

check('B5 preview route remains noindex and comparison route remains present',()=>{
  assert.match(html,/<meta\s+name="robots"\s+content="noindex, nofollow">/);
  assert.match(app,/href:\s*['"]\/discover\/['"]/);
});

check('Zero-cost visibility boundary is unchanged',()=>{
  assert.equal(meta.realtime.intraday.isLiveStream,false);
  assert.equal(meta.realtime.intraday.isDelayed,true);
  assert.equal(meta.realtime.intraday.refreshMinutes,5);
  assert.match(worker,/FreeBudget\.create/);
  assert.match(worker,/budgetProtect/);
  assert.match(worker,/budgetExhausted/);
});

check('Canonical feed entries remain members of the canonical feed order',()=>{
  const order=new Set(feed.order.map(entry=>entry.s));
  assert(feed.cards.length>0);
  for(const card of feed.cards) assert(order.has(card.symbol),card.symbol);
});

const extreme=feed.cards.filter(card=>{
  const z=card.plain&&card.plain.zahl;
  return z&&/^return/.test(z.quelle||'')&&typeof z.roh==='number'&&Math.abs(z.roh)>=10;
}).map(card=>{
  const detail=json('discover/data/stocks/US_REAL/'+card.symbol+'.json');
  return {symbol:card.symbol,value:card.plain.zahl.roh,period:card.plain.zahl.label,
    discoveryEligible:detail.discoveryEligible,dataQuality:detail.dataQuality,dataQualityReason:detail.dataQualityReason};
});

const fullFrame={op:'u',t:0,schemaVersion:'vu-live-update-1.1.0',v:[['NVDA',180,0,170,180,170,180,0]],semantics:[{priceType:'TRADE',messageForm:'iexTyped',candlePriceType:'REALTIME_REFERENCE'}]};
const withoutSemantics={...fullFrame};delete withoutSemantics.semantics;
const withoutConstant={...fullFrame,semantics:[{priceType:'TRADE',messageForm:'iexTyped'}]};
const bytes=value=>Buffer.byteLength(JSON.stringify(value));

console.log(JSON.stringify({status:'PASS_WITH_OWNER_REVIEW',checks,b1:'PASS',b2:'PASS',b3:'PASS',b4:'PASS_NO_CHANGE',b5:'PASS',b6:'SEE_REGRESSION_GATE',zeroCost:'PASS',realtimePayloadMeasurement:{singleSymbolBytes:{current:bytes(fullFrame),withoutAllSemantics:bytes(withoutSemantics),withoutConstantCandleSemantic:bytes(withoutConstant)},decision:'priceType and messageForm are event-specific; moving semantics to handshake would lose per-event truth. Constant candlePriceType alone does not justify a wire-contract change in this frontend-only scope.'},ownerReview:{id:'EXTREME_DISCOVERY_RESULTS',items:extreme,reason:'Existing canonical eligibility permits these WARNING entries; frontend must not invent a suppression or ranking rule.'}},null,2));
