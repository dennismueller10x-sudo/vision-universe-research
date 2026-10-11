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
