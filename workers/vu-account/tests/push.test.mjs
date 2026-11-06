import test from 'node:test';
import assert from 'node:assert/strict';
import {createFcm,runPush,deliverableEvents,deviceToken} from '../src/push.mjs';
import {appLogin,appRefresh} from '../src/auth.mjs';
const now=Date.now();
const event={eventId:'ev_0123456789abcdef',instrumentId:'vu_abcdef',type:'PRICE_EVENT',subtype:'NEW_52W_HIGH',
 occurredAt:new Date(now-1000).toISOString(),source:{ruleVersion:'watchlist-events-1.1.0'}};
const doc={ruleVersion:'watchlist-events-1.1.0',events:[event]};
test('ohne Secret keinerlei Netzwerk oder DB',async()=>{
 assert.deepEqual(await runPush({fcm:createFcm({}),service:null,fetchImpl:()=>{throw Error();}}),{skipped:'FCM_NOT_CONFIGURED'});
});
test('nur bekannte frische instrumentbezogene Ereignisse; kein Quell- oder Fremdtext',()=>{
 assert.equal(deliverableEvents(doc,now).length,1);
 for(const patch of [{instrumentId:null},{type:'WATCHLIST_NEWS'},{subtype:'BUY_NOW'},{occurredAt:new Date(now-86400001).toISOString()},{expiresAt:new Date(now-1).toISOString()}])
 assert.equal(deliverableEvents({...doc,events:[{...event,...patch}]},now).length,0);
 assert.throws(()=>deviceToken('bad\nvalue'));
});
test('Claims vor Versand, Fehler werden nicht wiederholt; keine Tokens im Ergebnis',async()=>{
 let claims=0,sends=0;
 const r=await runPush({fcm:{configured:true,send:async()=>{sends++;throw Error('secret');}},now:()=>now,
 fetchImpl:async()=>({ok:true,json:async()=>doc}),service:{rpc:async(fn,args)=>{claims++;assert.equal(fn,'push_claim_daily');assert.equal(args.p_events.length,1);return [{token:'secret',count:1}];}}});
 assert.deepEqual(r,{sent:0,failed:1});assert.equal(claims,1);assert.equal(sends,1);
});
test('native Tokenendpunkte verweigern Origin und Cookie vor Auth-Aufruf',async()=>{
 for (const headers of [{Origin:'https://research.visionuniverse.de'},{Cookie:'a=b'}])
 for (const fn of [appLogin,appRefresh]) await assert.rejects(fn({request:new Request('https://a.test',{headers})}),e=>e.state==='NATIVE_ONLY');
});
test('FCM HTTP v1: signiertes OAuth, Cache, neutraler Inhalt, keine Schluessel im Versand',async()=>{
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const der=Buffer.from(await crypto.subtle.exportKey('pkcs8',pair.privateKey)).toString('base64');let oauth=0,messages=[];
 const fcm=createFcm({secret:JSON.stringify({project_id:'vu-test',client_email:'svc@example.test',private_key:`-----BEGIN PRIVATE KEY-----\n${der}\n-----END PRIVATE KEY-----`}),fetchImpl:async(url,init)=>{
 if(url.includes('oauth2')) {oauth++;const jwt=new URLSearchParams(init.body).get('assertion').split('.');assert.equal(jwt.length,3);
 assert.equal(await crypto.subtle.verify('RSASSA-PKCS1-v1_5',pair.publicKey,Buffer.from(jwt[2],'base64url'),Buffer.from(jwt.slice(0,2).join('.'))),true);
 return {ok:true,json:async()=>({access_token:'oauth',expires_in:3600})};}
 assert.equal(url,'https://fcm.googleapis.com/v1/projects/vu-test/messages:send');messages.push(JSON.parse(init.body));return {ok:true};}});
 await fcm.send('device',3);await fcm.send('device',4);assert.equal(oauth,1);
 assert.match(messages[0].message.notification.body,/3 neue Regelereignisse/);
 assert.doesNotMatch(JSON.stringify(messages),/jetzt kaufen|verkaufen|PRIVATE KEY/i);
});
