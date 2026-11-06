import test from 'node:test';
import assert from 'node:assert/strict';
import {biometricStore} from '../www/js/biometric.js';
import {memoryStore} from '../www/js/token-store.js';
import {createAuth} from '../www/js/auth.js';
import {createPush} from '../www/js/push.js';
import {CONFIG, fakeSupabase, clock} from './helpers.mjs';
const prefs = () => { let v=null; return {get:async()=>v,set:async x=>{v=x;}}; };
test('Biometrie: Opt-in, Neustart gesperrt, Passwort-Fallback, Abschalten und Loeschen', async()=>{
 const disk=memoryStore(), preferences=prefs(); let deny=false,checks=0;
 const plugin={isAvailable:async()=>({isAvailable:true}),verifyIdentity:async()=>{checks++;if(deny)throw Error();}};
 const make=()=>biometricStore({store:disk,preferences,plugin});
 const a=make(); await a.init(); await a.set({refreshToken:'r'});
 assert.equal(await disk.get(),null); await a.choose(true); assert.equal((await disk.get()).refreshToken,'r');
 const b=make(); await b.init(); deny=true; assert.equal(await b.get(),null);
 deny=false; assert.equal((await b.get()).refreshToken,'r'); assert.equal(checks,3);
 await b.choose(false); assert.equal(await disk.get(),null); assert.equal(b.asked(),true);
 await b.clear(); assert.equal(await b.get(),null);
});
test('Biometrischer Start erneuert auch ein noch gueltiges Token und rotiert',async()=>{
 const store=memoryStore(), f=fakeSupabase(), now=clock();
 const a=createAuth({config:CONFIG,store,fetchImpl:f,now}); await a.signIn('a@b.de','richtig');
 const old=(await store.get()).refreshToken;
 const b=createAuth({config:CONFIG,store,fetchImpl:f,now}); await b.restore({forceRefresh:true});
 assert.notEqual((await store.get()).refreshToken,old);
});
test('Push: kein Prompt beim Start, Opt-in registriert, Abschalten entfernt nur eigenes Token', async()=>{
 let prompts=0,registered=0,removed=[],listeners={};
 const plugin={requestPermissions:async()=>{prompts++;return {receive:'granted'};},checkPermissions:async()=>({receive:'granted'}),
 addListener:async(k,fn)=>{listeners[k]=fn;return {remove:async()=>{}};},register:async()=>{registered++;await listeners.registration({value:'fcm-token'});},unregister:async()=>{}};
 const p=createPush({plugin,preferences:prefs(),platform:'ios',api:{registerPush:async()=>{},removePush:async b=>removed.push(b.token)}});
 await p.init(); await p.resume(); assert.equal(prompts,0); assert.equal(registered,0);
 await p.enable(); assert.equal(prompts,1); assert.equal(p.enabled(),true);
 await p.disable(); assert.deepEqual(removed,['fcm-token']); assert.equal(p.enabled(),false);
});
test('Biometrischer Start: abgelehnter oder fehlender Refresh gibt keine Sitzung frei',async()=>{
 for (const opts of [{rejectRefresh:true},{down:true}]) {
  const store=memoryStore(), now=clock();
  const a=createAuth({config:CONFIG,store,fetchImpl:fakeSupabase(),now}); await a.signIn('a@b.de','richtig');
  const b=createAuth({config:CONFIG,store,fetchImpl:fakeSupabase(opts),now});
  await b.restore({forceRefresh:true}); assert.equal(b.state().signedIn,false); assert.equal(await b.accessToken(),null);
 }
});
test('Offline-Abschalten merkt Serverbereinigung vor und fragt keine Berechtigung erneut',async()=>{
 const preferences=prefs(); await preferences.set({enabled:true,token:'device'}); let down=true,unregistered=0,removed=0;
 const p=createPush({preferences,platform:'android',plugin:{unregister:async()=>{unregistered++;}},
  api:{removePush:async()=>{if(down)throw Error();removed++;}}});
 await p.init();await assert.rejects(p.disable());assert.equal(p.enabled(),false);assert.equal(unregistered,1);
 down=false;await p.resume();assert.equal(removed,1);assert.deepEqual(await preferences.get(),{});
});
