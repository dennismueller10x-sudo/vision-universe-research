import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readLiveAsset} from '../live-asset-read.mjs';
const body='{"generation":"verified"}',meta={bytes:Buffer.byteLength(body),sha256:createHash('sha256').update(body).digest('hex')};
test('new Pages HTML fallback recovers with bounded retries and exact byte/hash proof',async()=>{
 let calls=0;const retries=[];
 const b=await readLiveAsset('https://example.test/asset.json',meta,{pause:async()=>{},onRetry:r=>retries.push(r),fetcher:async()=>++calls===1?new Response('<html>fallback</html>',{headers:{'content-type':'text/html'}}):new Response(body,{headers:{'content-type':'application/json'}})});
 assert.equal(calls,2);assert.equal(retries.length,1);assert.equal(b.toString(),body);
});
test('persistent hosting failure stops at three; JSON corruption is never retried',async()=>{
 let calls=0;await assert.rejects(readLiveAsset('https://example.test/asset.json',meta,{pause:async()=>{},fetcher:async()=>{calls++;return new Response('fallback',{status:404});}}),/LIVE_ASSET_HOSTING_FAILURE/);assert.equal(calls,3);
 for(const b of [body.replace('verified','corrupt!'),'{bad']){calls=0;await assert.rejects(readLiveAsset('https://example.test/asset.json',meta,{pause:async()=>{},fetcher:async()=>{calls++;return new Response(b,{headers:{'content-type':'application/json'}});}}));assert.equal(calls,1);}
});
// 16.11.2026 13:57Z: Hosting antwortete 503, danach brach die Verbindung ab ("fetch failed", ECONNRESET). Das darf kein Absturz sein.
const reset=()=>Object.assign(new TypeError('fetch failed'),{cause:Object.assign(new Error('read ECONNRESET'),{code:'ECONNRESET'})});
test('503 then ECONNRESET then success: both transient failures are retried within three attempts',async()=>{
 let calls=0;const retries=[];
 const b=await readLiveAsset('https://example.test/asset.json',meta,{pause:async()=>{},onRetry:r=>retries.push(r),fetcher:async()=>{calls++;if(calls===1)return new Response('x',{status:503,headers:{'content-type':'text/html'}});if(calls===2)throw reset();return new Response(body,{headers:{'content-type':'application/json'}});}});
 assert.equal(calls,3);assert.equal(b.toString(),body);assert.deepEqual(retries.map(r=>r.status),[503,0]);assert.equal(retries[1].error,'ECONNRESET');
});
test('persistent network failure ends with the typed TransientNetworkError after three attempts',async()=>{
 let calls=0;
 await assert.rejects(readLiveAsset('https://example.test/asset.json',meta,{pause:async()=>{},fetcher:async()=>{calls++;throw reset();}}),e=>e.name==='TransientNetworkError'&&e.code==='ECONNRESET'&&/LIVE_ASSET_NETWORK_FAILURE/.test(e.message));
 assert.equal(calls,3);
});
test('non-network errors are not retried and stay fatal',async()=>{
 let calls=0;
 await assert.rejects(readLiveAsset('https://example.test/asset.json',meta,{pause:async()=>{},fetcher:async()=>{calls++;throw new RangeError('bug');}}),RangeError);
 assert.equal(calls,1);
});
