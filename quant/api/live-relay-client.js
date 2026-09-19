/* Quant adapter for the existing VU Cloudflare wire contract. No provider
 * connection, candle reuse, history rewrite, or alternate subscription backend. */
(function(g){
'use strict';
const Transport=typeof module!=='undefined'&&module.exports?require('../engines/realtime/transport.js'):g.VURealtime.Transport;
function decode(message,ticker,now,freshMs=90000){
 if(message?.op!=='u'||message.schemaVersion!=='vu-live-update-1.1.0'||!Array.isArray(message.v)||!Array.isArray(message.semantics)||message.v.length!==message.semantics.length)return [];
 const result=[];
 for(let i=0;i<message.v.length;i++){
  const row=message.v[i],sem=message.semantics[i];
  if(!Array.isArray(row)||row.length!==8||row[0]!==ticker||sem?.priceType!=='TRADE'||sem.messageForm!=='iexTyped'||sem.candlePriceType!=='REALTIME_REFERENCE')continue;
  const price=row[1],received=row[2],at=row[7];
  if(!Number.isFinite(price)||price<=0||!Number.isFinite(at)||!Number.isFinite(received)||at>now||received>now||at>received||now-at>freshMs||now-received>freshMs)continue;
  result.push({ticker,price,timestamp:at,receivedAt:received,priceType:'TRADE',source:'VISION_UNIVERSE_RELAY'});
 }
 return result;
}
function create({capability,connect,onChange=()=>{},now=()=>Date.now(),timers=Transport.defaultTimers()}){
 const ticker=capability?.identity?.ticker;
 let transport=null,socket=null,heartbeat=null,generation=0,state='NOT_CONNECTED',reason=null,points=[];
 const freshMs=90000;
 function snapshot(){const last=points.at(-1);return {state,reason,identity:capability?.identity,points:points.map(p=>({...p})),last:last?{...last}:null,isLive:state==='LIVE'&&!!last&&now()-last.timestamp<=freshMs};}
 function emit(next,why=null){state=next;reason=why;onChange(snapshot());}
 function stop(why='STOPPED'){
  generation++;if(heartbeat!==null)timers.clearTimeout(heartbeat);heartbeat=null;
  const current=transport;transport=null;socket=null;current?.stop();emit('NOT_CONNECTED',why);
 }
 function start(){
  if(transport)return false;
  if(capability?.state!=='AVAILABLE'||capability.url!=='wss://live.visionuniverse.de/live'||capability.chartMovement!=='TRADE_EVENTS_ONLY'||capability.onDemand!==true||!/^vu_[a-f0-9]+$/.test(capability.identity?.securityId)||!capability.identity?.masterMemberId||!/^[A-Z0-9.-]{1,12}$/.test(ticker)){emit('UNAVAILABLE','INVALID_CAPABILITY');return false;}
  const epoch=++generation;points=[];emit('CONNECTING');
  function current(){return epoch===generation;}
  function tick(){if(!current())return;try{socket?.send(JSON.stringify({op:'ping'}));}catch{stop('CONNECTION_ERROR');return;}
   if(points.length&&now()-points.at(-1).timestamp>freshMs)emit('STALE','NO_FRESH_CONFIRMED_TRADE');
   heartbeat=timers.setTimeout(tick,15000);
  }
  transport=Transport.createWebSocketTransport({id:'vu-cloudflare',connect:()=>{socket=connect(capability.url);return socket;},onOpenSend:()=>JSON.stringify({op:'subscribe',symbols:[ticker]}),parse:event=>{
   if(!current())return null;
   let message;try{message=JSON.parse(event.data);}catch{return null;}
   if(message.op==='denied'&&message.symbol===ticker){stop(message.reason||'SUBSCRIPTION_DENIED');return null;}
   if(message.op==='budget'&&!['OK','WARNING'].includes(message.verdict)){stop('BUDGET_LIMIT');return null;}
   if(message.op==='status'&&(message.session&&message.session!=='REGULAR'||['IDLE','DISABLED','ERROR','BLOCKED'].includes(message.state))){stop(message.reason||'RELAY_UNAVAILABLE');return null;}
   for(const point of decode(message,ticker,now(),freshMs)){
    if(!current()||points.length&&point.timestamp<=points.at(-1).timestamp)continue;
    points.push(point);if(points.length>300)points.shift();emit('LIVE');
   }
   return null;
  }});
  const started=transport.start({onOpen:()=>{if(current()){emit('WAITING_FOR_TRADE');tick();}},onError:()=>{if(current())stop('CONNECTION_ERROR');},onClose:()=>{if(current())stop('CONNECTION_CLOSED');}});
  if(!started&&current())stop('CONNECTION_ERROR');return started;
 }
 return {start,stop,snapshot};
}
const api={decode,create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else g.VULiveRelayClient=api;
})(typeof window!=='undefined'?window:globalThis);
