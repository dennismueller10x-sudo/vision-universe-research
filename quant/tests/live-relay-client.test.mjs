import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Client=require('../api/live-relay-client.js');
const now=Date.parse('2026-09-18T15:00:00Z');
const message=(overrides={})=>({op:'u',schemaVersion:'vu-live-update-1.1.0',v:[['TSLA',240,now,999,999,999,999,now-1000]],semantics:[{priceType:'TRADE',messageForm:'iexTyped',candlePriceType:'REALTIME_REFERENCE'}],...overrides});
test('only confirmed current symbol trade price is consumed; reference OHLC is never used',()=>{
 assert.deepEqual(Client.decode(message(),'TSLA',now),[{ticker:'TSLA',price:240,timestamp:now-1000,receivedAt:now,priceType:'TRADE',source:'VISION_UNIVERSE_RELAY'}]);
 assert.deepEqual(Client.decode(message(),'NVDA',now),[]);
});
test('quotes, unspecified events, legacy payloads, malformed arrays and future/stale events fail closed',()=>{
 for(const mutate of [m=>delete m.schemaVersion,m=>delete m.semantics,m=>m.semantics=[],m=>m.semantics[0].priceType='QUOTE',m=>m.semantics[0].priceType='UNSPECIFIED',m=>m.semantics[0].messageForm='iexNoTypeField',m=>m.v[0][1]=null,m=>m.v[0][1]=Infinity,m=>m.v[0][7]=now+1,m=>m.v[0][2]=now+1,m=>m.v[0][7]=now-90001]){const m=message();mutate(m);assert.deepEqual(Client.decode(m,'TSLA',now),[]);}
});
function fixture(){let time=now,closed=0;const sent=[],updates=[],queue=new Map();let next=0;const socket={send:m=>sent.push(JSON.parse(m)),close:()=>closed++};
 const capability={state:'AVAILABLE',identity:{securityId:'vu_abc',masterMemberId:'ref_TSLA',ticker:'TSLA'},url:'wss://live.visionuniverse.de/live',onDemand:true,chartMovement:'TRADE_EVENTS_ONLY'};
 const client=Client.create({capability,connect:()=>socket,now:()=>time,onChange:u=>updates.push(u),timers:{now:()=>time,setTimeout:fn=>{queue.set(++next,fn);return next;},clearTimeout:id=>queue.delete(id)}});
 return {client,socket,sent,updates,queue,capability,closed:()=>closed,advance:ms=>{time+=ms;const f=[...queue.values()];queue.clear();f.forEach(fn=>fn());},send:m=>socket.onmessage({data:JSON.stringify(m)})};
}
test('on-demand subscription, no duplicate connection, ordering, stale state and cleanup',()=>{
 const f=fixture();assert.equal(f.sent.length,0);assert.equal(f.client.start(),true);assert.equal(f.client.start(),false);f.socket.onopen();assert.deepEqual(f.sent[0],{op:'subscribe',symbols:['TSLA']});
 f.send(message());assert.equal(f.client.snapshot().isLive,true);f.send(message());assert.equal(f.client.snapshot().points.length,1);
 f.send(message({semantics:[{priceType:'QUOTE'}]}));assert.equal(f.client.snapshot().last.price,240);
 f.advance(91000);assert.equal(f.client.snapshot().state,'STALE');assert.equal(f.client.snapshot().isLive,false);
 f.client.stop('HIDDEN');assert.equal(f.closed(),1);assert.equal(f.queue.size,0);f.send(message());assert.equal(f.client.snapshot().state,'NOT_CONNECTED');
});
test('denial, closed session, budget and socket errors stop without reconnect storm',()=>{
 for(const event of [{op:'denied',symbol:'TSLA',reason:'sessionClosed'},{op:'status',session:'CLOSED'},{op:'budget',verdict:'BLOCK'}]){const f=fixture();f.client.start();f.socket.onopen();f.send(event);assert.equal(f.client.snapshot().state,'NOT_CONNECTED');assert.equal(f.closed(),1);assert.equal(f.queue.size,0);}
 const f=fixture();f.client.start();f.socket.onerror();assert.equal(f.client.snapshot().isLive,false);assert.equal(f.closed(),1);
});
test('old connection callbacks cannot affect an explicitly restarted subscription',()=>{
 const f=fixture();f.client.start();const old=f.socket.onmessage;f.client.stop();f.client.start();old({data:JSON.stringify(message())});assert.equal(f.client.snapshot().points.length,0);
});
test('invalid identity or alternate endpoint never opens a connection',()=>{
 for(const field of ['url','identity']){const f=fixture();f.capability[field]=field==='url'?'wss://provider.invalid':{};assert.equal(f.client.start(),false);assert.equal(f.sent.length,0);}
});

test('late socket open/error after stop cannot subscribe or publish errors',()=>{
 const f=fixture();f.client.start();const open=f.socket.onopen,error=f.socket.onerror;f.client.stop('HIDDEN');open();error();assert.equal(f.sent.length,0);assert.equal(f.client.snapshot().reason,'HIDDEN');
});
test('existing relay OK/WARNING budget verdicts do not stop a subscription',()=>{
 const f=fixture();f.client.start();f.socket.onopen();for(const verdict of ['OK','WARNING'])f.send({op:'budget',verdict});assert.equal(f.closed(),0);f.send(message());assert.equal(f.client.snapshot().isLive,true);
});
