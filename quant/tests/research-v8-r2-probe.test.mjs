import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {probe} from '../../scripts/quant/probe-v8-r2-archives.mjs';
const env={VU_HISTORY_S3_ENDPOINT:'https://fixture.invalid',VU_HISTORY_S3_BUCKET:'fixture-bucket',VU_HISTORY_S3_ACCESS_KEY_ID:'fixture-key',VU_HISTORY_S3_SECRET_ACCESS_KEY:'fixture-secret'};
test('V8 R2 probe observes missing runtime bindings without network or claiming absent archives',async()=>{
 const r=await probe({env:{},fetchImpl:()=>{throw Error('NETWORK_NOT_ALLOWED');}});
 assert.equal(r.state,'NOT_CONFIGURED_IN_THIS_RUNTIME');assert.equal(r.networkRequests,0);assert.equal(r.budgetSpent.classA,0);
});
test('V8 R2 probe reuses signed read-only driver, bounds metadata sample and omits private index fields',async()=>{
 const symbols=Object.fromEntries(Array.from({length:120},(_,i)=>['T'+String(i).padStart(3,'0'),{first:'2000-01-03',last:'2026-10-23',barCount:5000,privatePrice:987654321}]));
 const body=gzipSync(JSON.stringify({symbols,generatedAt:'2026-10-23T20:00:00Z'})),calls=[];
 const r=await probe({env,fetchImpl:async(url,options)=>{
  calls.push(options.method);assert.ok(options.headers.authorization.startsWith('AWS4-HMAC-SHA256 '));assert.equal(new URL(url).search,'');
  if(url.endsWith('.zst'))return new Response(null,{status:404});
  return new Response(options.method==='HEAD'?null:body,{status:200,headers:{'content-length':String(body.length)}});
 }});
 assert.deepEqual(calls,['HEAD','GET','HEAD']);assert.equal(r.state,'READABLE_INDEX_PROVED');assert.equal(r.objects[0].symbolCount,120);assert.equal(r.objects[0].sample.length,100);assert.equal(r.budgetSpent.classA,0);assert.equal(r.budgetSpent.classB,3);
 const serialized=JSON.stringify(r);assert.ok(!serialized.includes('fixture-secret'));assert.ok(!serialized.includes('fixture-key'));assert.ok(!serialized.includes('987654321'));assert.ok(!serialized.includes('authorization'));
});
test('V8 R2 probe does not fetch oversize indexes or retry an explicit access denial',async()=>{
 let count=0;
 const large=await probe({env,fetchImpl:async()=>{count++;return new Response(null,{status:200,headers:{'content-length':String(5*1024*1024)}});}});
 assert.equal(count,2);assert.equal(large.networkRequests,2);assert.ok(large.objects.every(x=>x.contentSkipped==='COMPRESSED_INDEX_ABOVE_BUDGET'));
 count=0;const denied=await probe({env,fetchImpl:async()=>{count++;return new Response('private-body-must-not-escape',{status:403});}});
 assert.equal(count,1);assert.equal(denied.objects[0].reason,'HTTP_403');assert.ok(!JSON.stringify(denied).includes('private-body-must-not-escape'));
});
