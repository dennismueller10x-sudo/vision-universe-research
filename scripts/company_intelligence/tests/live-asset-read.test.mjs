import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {readLiveAsset,LIVE_READ_ATTEMPTS,LIVE_READ_PAUSES_MS,LIVE_SETTLE_MS,LIVE_READ_CONCURRENCY} from '../live-asset-read.mjs';
const body='{"generation":"verified"}',meta={bytes:Buffer.byteLength(body),sha256:createHash('sha256').update(body).digest('hex')};
test('new Pages HTML fallback recovers with bounded retries and exact byte/hash proof',async()=>{
 let calls=0;const retries=[];
 const b=await readLiveAsset('https://example.test/asset.json',meta,{pause:async()=>{},onRetry:r=>retries.push(r),fetcher:async()=>++calls===1?new Response('<html>fallback</html>',{headers:{'content-type':'text/html'}}):new Response(body,{headers:{'content-type':'application/json'}})});
 assert.equal(calls,2);assert.equal(retries.length,1);assert.equal(b.toString(),body);
});
test('persistent hosting failure stops at the bounded attempt limit; JSON corruption is never retried',async()=>{
 let calls=0;await assert.rejects(readLiveAsset('https://example.test/asset.json',meta,{pause:async()=>{},fetcher:async()=>{calls++;return new Response('fallback',{status:404});}}),/LIVE_ASSET_HOSTING_FAILURE/);assert.equal(calls,LIVE_READ_ATTEMPTS);
 for(const b of [body.replace('verified','corrupt!'),'{bad']){calls=0;await assert.rejects(readLiveAsset('https://example.test/asset.json',meta,{pause:async()=>{},fetcher:async()=>{calls++;return new Response(b,{headers:{'content-type':'application/json'}});}}));assert.equal(calls,1);}
});
// 16.11.2026 13:57Z: Hosting antwortete 503, danach brach die Verbindung ab ("fetch failed", ECONNRESET). Das darf kein Absturz sein.
const reset=()=>Object.assign(new TypeError('fetch failed'),{cause:Object.assign(new Error('read ECONNRESET'),{code:'ECONNRESET'})});
test('503 then ECONNRESET then success: both transient failures are retried within three attempts',async()=>{
 let calls=0;const retries=[];
 const b=await readLiveAsset('https://example.test/asset.json',meta,{pause:async()=>{},onRetry:r=>retries.push(r),fetcher:async()=>{calls++;if(calls===1)return new Response('x',{status:503,headers:{'content-type':'text/html'}});if(calls===2)throw reset();return new Response(body,{headers:{'content-type':'application/json'}});}});
 assert.equal(calls,3);assert.equal(b.toString(),body);assert.deepEqual(retries.map(r=>r.status),[503,0]);assert.equal(retries[1].error,'ECONNRESET');
});
test('persistent network failure ends with the typed TransientNetworkError after the bounded attempts',async()=>{
 let calls=0;
 await assert.rejects(readLiveAsset('https://example.test/asset.json',meta,{pause:async()=>{},fetcher:async()=>{calls++;throw reset();}}),e=>e.name==='TransientNetworkError'&&e.code==='ECONNRESET'&&/LIVE_ASSET_NETWORK_FAILURE/.test(e.message));
 assert.equal(calls,LIVE_READ_ATTEMPTS);
});
test('non-network errors are not retried and stay fatal',async()=>{
 let calls=0;
 await assert.rejects(readLiveAsset('https://example.test/asset.json',meta,{pause:async()=>{},fetcher:async()=>{calls++;throw new RangeError('bug');}}),RangeError);
 assert.equal(calls,1);
});

// 17.11.2026 08:26Z: nach dem Deploy 503, dann 429 bei vielen parallelen Snapshot-Zugriffen; mit Geduld wird der Zugriff durchgelassen.
test('503 then repeated 429 then success: waits with the bounded backoff and honors Retry-After (max 30 s)',async()=>{
 let calls=0;const pauses=[],retries=[];
 const b=await readLiveAsset('https://example.test/asset.json',meta,{pause:async ms=>{pauses.push(ms);},onRetry:r=>retries.push(r.status),fetcher:async()=>{calls++;
  if(calls===1)return new Response('x',{status:503,headers:{'content-type':'text/html'}});
  if(calls===2)return new Response('x',{status:429,headers:{'content-type':'text/html','retry-after':'3'}});
  if(calls===3)return new Response('x',{status:429,headers:{'content-type':'text/html','retry-after':'120'}});
  return new Response(body,{headers:{'content-type':'application/json'}});}});
 assert.equal(b.toString(),body);assert.equal(calls,4);assert.deepEqual(retries,[503,429,429]);
 assert.deepEqual(pauses,[1000,3000,30000]); // Basis 1 s; Retry-After 3 s hebt 2 s an; 120 s wird auf 30 s gedeckelt
});
test('the bounded schedule is fixed: eight attempts, pauses 1/2/4/8/15/30/30 s, never longer than 30 s',()=>{
 assert.equal(LIVE_READ_ATTEMPTS,8);assert.deepEqual([...LIVE_READ_PAUSES_MS],[1000,2000,4000,8000,15000,30000,30000]);
 assert.equal(Math.max(...LIVE_READ_PAUSES_MS)<=30000,true);
});

test('live reading is gentle: 60 s settle time before the first read and at most two concurrent reads, wired into universe-browser-qa',()=>{
 assert.equal(LIVE_SETTLE_MS,60000);assert.equal(LIVE_READ_CONCURRENCY,2);
 const qa=readFileSync(new URL('../universe-browser-qa.mjs',import.meta.url),'utf8');
 assert(qa.includes('LIVE_READ_CONCURRENCY'),'live pool uses the constant');assert(!/live\?4:12/.test(qa),'no hard-coded 4 live readers');
 assert(/if\(live\)await new Promise\(r=>setTimeout\(r,Number\(process\.env\.VU_LIVE_SETTLE_MS\?\?LIVE_SETTLE_MS\)\)\)/.test(qa),'settle wait only in live mode, before the pool');
 assert(qa.indexOf('LIVE_SETTLE_MS)))')<qa.indexOf('objectPool(Object.entries(m.assets)'),'settle wait comes before the first read');
});
