import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const SAT=Date.UTC(2026,10,21,12,0,0), WED_OPEN=Date.UTC(2026,10,18,15,0,0), WED_NIGHT=Date.UTC(2026,10,19,2,0,0);
const source=readFileSync(new URL('../../../sw.js',import.meta.url),'utf8');
function runtime(start){
 const handlers={}, stores=new Map();const networkOptions=[];let now=start||SAT,online=true,calls=0,version='v1';
 let kill=false;const network=async(request,options)=>{if(request==='/sw-kill.json')return new Response(JSON.stringify({kill}));networkOptions.push(options);calls++;if(!online)throw Error('offline');return new Response(version,{headers:{'cache-control':'public,max-age=600'}});};
 const key=r=>typeof r==='string'?new URL(r,'https://example.test').href:r.url;
 const caches={open:async name=>{if(!stores.has(name))stores.set(name,new Map());const m=stores.get(name);return {match:async r=>m.get(key(r))?.clone(),put:async(r,v)=>m.set(key(r),v.clone()),delete:async r=>m.delete(key(r)),keys:async()=>[...m.keys()].map(url=>({url})),addAll:async paths=>{for(const p of paths)m.set(key(p),await network());}};},keys:async()=>[...stores.keys()],delete:async n=>stores.delete(n),match:async r=>{for(const m of stores.values())if(m.has(key(r)))return m.get(key(r)).clone();}};
 const self={registration:{unregister:async()=>{self.unregistered=true;}},location:{origin:'https://example.test'},navigator:{get onLine(){return online;}},clients:{claim:async()=>{}},skipWaiting:async()=>{},addEventListener:(n,fn)=>handlers[n]=fn};
 class Clock extends Date{static now(){return now;}}
 vm.runInNewContext(source,{self,caches,fetch:network,URL,Response,Headers,Date:Clock});
 async function event(name,request){let response;const waits=[];handlers[name]({request,respondWith:r=>response=r,waitUntil:p=>waits.push(p)});return {response:response?await response:undefined,done:()=>Promise.all(waits)};}
 return {self,event,stores,networkOptions,get calls(){return calls;},advance:n=>now+=n,offline:()=>online=false,version:v=>version=v,setKill:v=>kill=v};
}
const req=(path,extra={})=>({url:'https://example.test'+path,method:'GET',mode:'cors',cache:'default',...extra});
test('SW revalidates public assets, expires data, excludes account and preserves offline fallback',async()=>{
 const r=runtime();await (await r.event('install')).done();
 let e=await r.event('fetch',req('/assets/test.js?v=fixture'));assert.equal(await e.response.text(),'v1');await e.done();
 r.version('v2');e=await r.event('fetch',req('/assets/test.js?v=fixture'));assert.equal(await e.response.text(),'v1');await e.done();
 e=await r.event('fetch',req('/assets/test.js?v=fixture'));assert.equal(await e.response.text(),'v2');await e.done();
 e=await r.event('fetch',req('/quant/data/test.json'));await e.done();assert.equal(r.networkOptions.at(-1).cache,'no-cache');const calls=r.calls;
 r.version('v3');e=await r.event('fetch',req('/quant/data/test.json'));assert.equal(await e.response.text(),'v2');assert.equal(r.calls,calls);
 e=await r.event('fetch',req('/quant/data/test.json',{cache:'no-cache'}));assert.equal(await e.response.text(),'v3');await e.done();
 for(const path of ['/assets/unversioned.js','/assets/unversioned.css','/konto/profile.json','/v1/me','/assets/a.js?token=secret'])assert.equal((await r.event('fetch',req(path))).response,undefined);
 r.stores.set('unrelated-app',new Map());r.stores.set('vu-shell-v1',new Map());await (await r.event('activate')).done();assert(r.stores.has('unrelated-app'));assert(!r.stores.has('vu-shell-v1'));
 r.advance(30001);r.offline();await assert.rejects(r.event('fetch',req('/quant/data/test.json')),/offline/);
 e=await r.event('fetch',req('/other-page/',{mode:'navigate'}));assert.equal(await e.response.text(),'v1');await e.done();
});

test('SW cache bound preserves the offline shell and refuses no-store requests',async()=>{
 const r=runtime();await (await r.event('install')).done();
 for(let i=0;i<165;i++)await (await r.event('fetch',req('/discover/logos/'+i+'.png'))).done();
 const assets=r.stores.get('vu-shell-e5-v2');assert.equal(assets.size,160);assert(assets.has('https://example.test/offline.html'));
 assert.equal((await r.event('fetch',req('/quant/data/test.json',{cache:'no-store'}))).response,undefined);
});

test('open market: public data never from cache and never stored (no stale live price)',async()=>{
 const r=runtime(WED_OPEN);await (await r.event('install')).done();
 let e=await r.event('fetch',req('/quant/data/market/intraday/index.json'));assert.equal(await e.response.text(),'v1');await e.done();
 assert.equal(r.stores.get('vu-shell-e5-v2-data')?.size||0,0);
 r.version('v2');e=await r.event('fetch',req('/quant/data/market/intraday/index.json'));assert.equal(await e.response.text(),'v2');
 assert.equal(r.networkOptions.at(-1).cache,'no-cache');
 r.advance(1000);r.version('v3');e=await r.event('fetch',req('/technical/data/index-v1.json'));assert.equal(await e.response.text(),'v3');
});

test('closed market: fresh 2 min from cache, 2-30 min stale-while-revalidate, then network',async()=>{
 const r=runtime(WED_NIGHT);await (await r.event('install')).done();
 let e=await r.event('fetch',req('/quant/data/test.json'));await e.done();const c0=r.calls;
 r.version('v2');r.advance(60000);e=await r.event('fetch',req('/quant/data/test.json'));assert.equal(await e.response.text(),'v1');assert.equal(r.calls,c0);
 r.advance(300000);e=await r.event('fetch',req('/quant/data/test.json'));assert.equal(await e.response.text(),'v1');await e.done();assert.equal(r.calls,c0+1);
 e=await r.event('fetch',req('/quant/data/test.json',{cache:'no-cache'}));assert.equal(await e.response.text(),'v2');await e.done();
 r.version('v3');r.advance(1900000);e=await r.event('fetch',req('/quant/data/test.json'));assert.equal(await e.response.text(),'v3');
});

test('content-hash assets are cache-first and never refetched',async()=>{
 const r=runtime();await (await r.event('install')).done();
 let e=await r.event('fetch',req('/assets/app.js?v=0123456789abcdef'));await e.done();const c=r.calls;
 r.version('v2');e=await r.event('fetch',req('/assets/app.js?v=0123456789abcdef'));assert.equal(await e.response.text(),'v1');await e.done();assert.equal(r.calls,c);
});

test('account, login, payment, gate, api, authorized and credentialed requests are never intercepted',async()=>{
 const r=runtime();await (await r.event('install')).done();
 for(const p of ['/konto/assets/a.png','/mein-dashboard/app.js?v=0123456789abcdef','/v1/me','/api/history.json','/checkout/x.js?v=0123456789abcdef','/stripe/x.png','/assets/login.js?v=0123456789abcdef','/assets/protected/x.png','/company-intelligence/data/x.json','/quant/data/protected/x.json','/assets/gate.js?v=0123456789abcdef'])assert.equal((await r.event('fetch',req(p))).response,undefined,p);
 assert.equal((await r.event('fetch',req('/assets/a.png',{headers:new Headers({authorization:'Bearer x'})}))).response,undefined);
 assert.equal((await r.event('fetch',req('/quant/data/a.json',{credentials:'include'}))).response,undefined);
 assert.equal(r.stores.get('vu-shell-e5-v2')?.has('https://example.test/konto/assets/a.png')||false,false);
});

test('kill switch file wipes vu-shell caches, unregisters and passes everything through',async()=>{
 const r=runtime();await (await r.event('install')).done();
 let e=await r.event('fetch',req('/assets/test.js?v=fixture'));await e.done();assert(r.stores.get('vu-shell-e5-v2').size>1);
 r.setKill(true);e=await r.event('activate');await e.done();
 assert(!r.stores.has('vu-shell-e5-v2'));assert(r.self.unregistered);
 assert.equal((await r.event('fetch',req('/assets/test.js?v=fixture'))).response,undefined);
});

test('kill switch off keeps caching; version bump removes older vu-shell caches',async()=>{
 const r=runtime();await (await r.event('install')).done();r.setKill(false);
 r.stores.set('vu-shell-e5-v1',new Map());r.stores.set('vu-shell-e5-v1-data',new Map());await (await r.event('activate')).done();
 assert(!r.stores.has('vu-shell-e5-v1')&&!r.stores.has('vu-shell-e5-v1-data')&&r.stores.has('vu-shell-e5-v2'));assert(!r.self.unregistered);
});
