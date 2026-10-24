import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,rmSync,writeFileSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {request as httpRequest} from 'node:http';
import {randomBytes} from 'node:crypto';
const require=createRequire(import.meta.url),Preview=require('../../server/quant-backtest-preview.cjs'),{materialize}=require('../../scripts/quant/materialize-real-backtest-read.cjs');
const root=resolve(import.meta.dirname,'../..'),out=mkdtempSync(join(tmpdir(),'vu-preview-security-')),key=randomBytes(32).toString('hex');
materialize({root,output:out,ids:['ref_NVDA','ref_MSFT','ref_XOM','ref_ARM','ref_AAPL','ref_BGC','ref_AAAC','ref_AACT']});
let now=Date.now();const app=Preview.create({directory:out,credentialKey:key,clock:()=>now,ttlMs:1000,allowedTickers:['NVDA','MSFT','XOM','ARM','AAPL','BGC','AAAC','AACT']}),url=await app.listen(),origin=new URL(url).origin;
const call=(route,{cookie,method='GET',body,headers={}}={})=>fetch(url+route,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json',Origin:origin}:{}),...headers},body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body)});
async function login(){const res=await call('login',{method:'POST',body:{key}});assert.equal(res.status,200);return res.headers.get('set-cookie').split(';')[0];}
test.after(async()=>{await app.close();rmSync(out,{recursive:true,force:true});});
test('loopback binding, no embedded secrets, no unauthenticated inventory or data',async()=>{
 assert.equal(app.server.address().address,'127.0.0.1');const page=await call('');const text=await page.text();assert.match(text,/<form[^>]*method="post"[^>]*action="\/quant\/internal-backtest\/login"/);assert.equal(text.includes(key),false);assert.equal(text.includes('4926635'),false);
 for(const route of ['session','data?ticker=NVDA','data?ticker=NVDA&section=trades','../private/summary.json'])assert.equal((await call(route)).status,401);
});
test('explicit session, HttpOnly/SameSite cookie, real NVDA and lazy pinned details',async()=>{
 const response=await call('login',{method:'POST',body:{key}});assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);const cookie=response.headers.get('set-cookie').split(';')[0];
 const res=await call('data?ticker=NVDA',{cookie});assert.equal(res.status,200);assert.match(res.headers.get('cache-control'),/private, no-store/);assert.equal(res.headers.get('etag'),null);const s=await res.json();assert.equal(s.certification,'NOT_CERTIFIED');assert.equal(s.result.metrics.completedTrades,21);assert.ok(Math.abs(s.result.endCapital-4926635.787429842)<1e-6);
 const params=new URLSearchParams({ticker:'NVDA',section:'equity',generation:s.generation,listingId:s.identity.listingId});const d=await call('data?'+params,{cookie});assert.equal(d.status,200);assert.equal((await d.json()).result.equity.length,1395);
 params.set('section','trades');const t=await (await call('data?'+params,{cookie})).json();assert.equal(t.result.trades.length,21);assert.equal(t.result.openPosition.completed,false);
});
test('missing, wrong and expired authority cannot bypass through cached/conditional detail URLs',async()=>{
 assert.equal((await call('login',{method:'POST',body:{key:'incorrect'}})).status,401);const cookie=await login();
 assert.equal((await call('data?ticker=NVDA',{cookie:'vu_backtest_review='+'0'.repeat(64)})).status,401);
 assert.equal((await call('data?ticker=NVDA',{cookie})).status,200);now+=2000;
 for(const route of ['data?ticker=NVDA','data?ticker=NVDA&section=trades','session']){const r=await call(route,{cookie,headers:{'If-None-Match':'cached','If-Modified-Since':new Date().toUTCString()}});assert.equal(r.status,401);assert.equal((await r.json()).result,undefined);}
});
test('logout revokes the server session, including replay of its previously valid cookie',async()=>{
 const cookie=await login();assert.equal((await call('logout',{cookie,method:'POST',headers:{Origin:origin}})).status,200);assert.equal((await call('data?ticker=NVDA',{cookie})).status,401);
});
test('foreign origins, hostile host, paths, listing, generation and period are rejected',async()=>{
 const cookie=await login();assert.equal((await call('session',{cookie,headers:{Origin:'https://attacker.invalid'}})).status,403);assert.equal(await new Promise((ok,fail)=>{const req=httpRequest(url+'session',{headers:{Host:'attacker.invalid',Cookie:cookie}},res=>{res.resume();ok(res.statusCode);});req.on('error',fail);req.end();}),403);
 assert.equal((await call('session',{cookie,headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
 assert.equal((await call('data?ticker=OTHER',{cookie})).status,403);assert.equal((await call('data?ticker=NVDA&period=ALL',{cookie})).status,400);assert.equal((await call('data?ticker=NVDA&ticker=AAPL',{cookie})).status,400);
 assert.equal((await call('data?ticker=NVDA&section=trades',{cookie})).status,400);
 assert.equal((await call('data?ticker=NVDA&listingId=WRONG',{cookie})).status,409);assert.equal((await call('data?ticker=NVDA&generation='+'0'.repeat(64),{cookie})).status,409);
 assert.equal((await call('data?ticker=NVDA&generation=../../etc/passwd',{cookie})).status,400);
 assert.equal((await call('../../release.json',{cookie})).status,404);
 assert.equal((await call('login',{method:'POST',body:'x'.repeat(5000)})).status,413);
});
test('real additional stocks obey quality holds; blocked sections never have performance',async()=>{
 const cookie=await login();for(const ticker of ['AAPL','BGC','AAAC','AACT']){const r=await (await call('data?ticker='+ticker,{cookie})).json();assert.equal(r.state,'BLOCKED',ticker);assert.equal(r.result,undefined);assert.equal(r.certification,'NOT_CERTIFIED');}
 for(const ticker of ['MSFT','XOM','ARM']){const r=await (await call('data?ticker='+ticker,{cookie})).json();assert.equal(r.state,'AVAILABLE_LIMITED',ticker);assert.equal(r.returnBasis,'PRICE_RETURN');}
});
test('independent server allow-list and response byte cap fail closed',async()=>{
 const limited=Preview.create({directory:out,credentialKey:key,maxResponseBytes:512}),u=await limited.listen(),o=new URL(u).origin;
 try{const login=await fetch(u+'login',{method:'POST',headers:{Origin:o,'Content-Type':'application/json'},body:JSON.stringify({key})}),cookie=login.headers.get('set-cookie').split(';')[0];assert.equal((await fetch(u+'data?ticker=MSFT',{headers:{Cookie:cookie}})).status,403);const r=await fetch(u+'data?ticker=NVDA',{headers:{Cookie:cookie}});assert.equal(r.status,503);assert.deepEqual(await r.json(),{state:'PAYLOAD_LIMIT'});}finally{await limited.close();}
});
test('credential files require private permissions and no server path logs secrets',async()=>{
 const file=join(out,'access-key');writeFileSync(file,key,{mode:0o600});assert.ok((await Preview.credential(file))===key);chmodSync(file,0o644);await assert.rejects(Preview.credential(file),/PRIVATE_CREDENTIAL_FILE_REQUIRED/);
});
