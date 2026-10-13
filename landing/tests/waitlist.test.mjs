import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleWaitlist,store,open,seal,eligibleAppRecipient,CONSENT_VERSION} from '../server/waitlist.mjs';

function fixture(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../server/schema.sql',import.meta.url),'utf8'));
  const database={prepare(sql){return{bind(...values){return{
    async first(column){const row=sqlite.prepare(sql).get(...values);return column?row?.[column]:row||null;},
    async run(){const result=sqlite.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}};}
  };}};}};
  const env={BREVO_API_KEY:'synthetic-provider-key',WAITLIST_TOKEN_KEY:'1'.repeat(64),WAITLIST_DB:database,
    WAITLIST_DOI_TEMPLATE_ID:'1',WAITLIST_CONFIRMATION_TEMPLATE_ID:'2',WAITLIST_PUBLIC_ENABLED:'true',WAITLIST_PRIVACY_APPROVED:'true',WAITLIST_E2E_VERIFIED:'true'};
  let contact=null;const calls=[];let failure=false;
  const fetcher=async(url,options)=>{
    const path=new URL(url).pathname;const body=options.body?JSON.parse(options.body):null;
    calls.push({path,method:options.method,body});
    if(failure)throw Error('synthetic-provider-key recipient@example.test');
    if(options.method==='GET')return contact?Response.json(contact):new Response(null,{status:404});
    if(options.method==='POST'&&path==='/v3/contacts/doubleOptinConfirmation')return new Response(null,{status:201});
    if(options.method==='POST'&&path==='/v3/smtp/email')return new Response(null,{status:201});
    if(options.method==='PUT'&&path==='/v3/contacts/99'){
      assert.deepEqual(body,{unlinkListIds:[5]});contact.listIds=contact.listIds.filter(id=>id!==5);return new Response(null,{status:204});
    }
    throw Error('Unexpected contact creation or send endpoint');
  };
  const request=(path,body,headers={})=>new Request('https://www.visionuniverse.de/api/waitlist/'+path,{method:'POST',headers:{Origin:'https://www.visionuniverse.de','CF-Connecting-IP':'192.0.2.4','Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  const signup=(email='recipient@example.test')=>({EMAIL:email,OPT_IN:'1',consent_version:CONSENT_VERSION,email_address_check:''});
  const run=(path,body,headers)=>handleWaitlist(request(path,body,headers),env,{fetcher,now:1000000000});
  return{env,sqlite,calls,signup,run,request,fetcher,setContact(value){contact=value;},setFailure(value){failure=value;},get contact(){return contact;}};
}
async function accepted(f){
  assert.equal((await f.run('signup',f.signup())).status,202);
  const doi=f.calls.find(c=>c.method==='POST');
  const token=new URLSearchParams(new URL(doi.body.redirectionUrl).hash.slice(1)).get('t');
  const payload=await open(f.env,token);
  return{doi,token,payload};
}

test('Closed privacy/DOI gates reject before data parsing and provider access',async()=>{
  for(const flag of ['WAITLIST_PUBLIC_ENABLED','WAITLIST_PRIVACY_APPROVED','WAITLIST_E2E_VERIFIED']){
    const f=fixture();f.env[flag]='false';assert.equal((await f.run('signup',f.signup())).status,503);assert.equal(f.calls.length,0);
  }
});
test('Existing imports, unsubscribe and blocklist records are never sent a DOI',async()=>{
  for(const record of [{id:2,listIds:[4]},{id:3,listIds:[6]},{id:4,listIds:[],emailBlacklisted:true},{id:5,listIds:[5]}]){
    const f=fixture();f.setContact(record);assert.equal((await f.run('signup',f.signup())).status,202);assert.ok(f.calls.every(c=>c.method==='GET'));
  }
});
test('Only official DOI adds list 5 after provider click; callback cannot fabricate membership',async()=>{
  const f=fixture();const {doi,token,payload}=await accepted(f);
  assert.deepEqual(doi.body.includeListIds,[5]);assert.equal(doi.body.contactPixelTrackingConsent,false);assert.ok(!doi.body.excludeListIds);
  assert.equal(f.contact,null);assert.equal((await f.run('confirmed',{token})).status,409);
  f.setContact({id:99,emailBlacklisted:false,listIds:[5],attributes:doi.body.attributes});
  assert.equal((await f.run('confirmed',{token})).status,200);
  const row=f.sqlite.prepare('SELECT * FROM waitlist_requests').get();assert.equal(row.state,'confirmed');assert.equal(row.request_id,payload.requestId);
  assert.equal(eligibleAppRecipient(f.contact,row),true);
});
test('Parallel and repeated signup reserve once and send only one DOI',async()=>{
  const f=fixture();const results=await Promise.all([f.run('signup',f.signup()),f.run('signup',f.signup()),f.run('signup',f.signup())]);
  assert.ok(results.every(r=>r.status===202));assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
  assert.equal((await f.run('signup',f.signup())).status,202);assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
});
test('Unsubscribe preserves foreign lists and blocklist, excludes later app sends and is repeatable',async()=>{
  const f=fixture();const {doi,token}=await accepted(f);
  f.setContact({id:99,emailBlacklisted:false,listIds:[5,4,6,123],attributes:doi.body.attributes});
  await f.run('confirmed',{token});
  assert.equal((await f.run('unsubscribe',{token})).status,200);
  assert.deepEqual(f.contact.listIds,[4,6,123]);assert.equal(f.contact.emailBlacklisted,false);
  const row=f.sqlite.prepare('SELECT * FROM waitlist_requests').get();assert.equal(row.state,'withdrawn');assert.equal(eligibleAppRecipient(f.contact,row),false);
  assert.equal((await f.run('unsubscribe',{token})).status,200);assert.equal(f.calls.filter(c=>c.method==='PUT').length,1);
  assert.equal((await f.run('confirmed',{token})).status,409);
  await f.run('signup',f.signup());assert.equal(f.calls.filter(c=>c.path==='/v3/contacts/doubleOptinConfirmation').length,1);
  assert.equal(f.calls.filter(c=>c.path==='/v3/smtp/email').length,1);
});
test('Bad tokens, cross-origin POST, missing consent and honeypots never send',async()=>{
  const f=fixture();assert.equal((await f.run('signup',f.signup(),{Origin:'https://attacker.invalid'})).status,403);
  assert.equal((await f.run('signup',{...f.signup(),OPT_IN:'0'})).status,400);
  assert.equal((await f.run('signup',{...f.signup(),email_address_check:'bot'})).status,202);
  assert.equal((await f.run('unsubscribe',{token:'not-valid'})).status,400);assert.equal(f.calls.length,0);
  const token=await seal(f.env,{purpose:'app',email:'recipient@example.test',requestId:'a'.repeat(32)});
  assert.equal((await f.run('confirmed',{token})).status,400);
});
test('Unknown provider outcome is reserved and errors never expose data or keys',async()=>{
  const f=fixture();let postFailure=true;const real=f.fetcher;
  const fetcher=async(url,options)=>{if(options.method==='POST'&&postFailure)throw Error('synthetic-provider-key recipient@example.test');return real(url,options);};
  const result=await handleWaitlist(f.request('signup',f.signup()),f.env,{fetcher});
  assert.equal(result.status,503);assert.doesNotMatch(await result.text(),/synthetic-provider-key|recipient@/);
  postFailure=false;await f.run('signup',f.signup());assert.equal(f.calls.filter(c=>c.method==='POST').length,0);
  assert.equal(f.sqlite.prepare('SELECT state FROM waitlist_requests').get().state,'unknown');
});
test('Rate limit and body size bound abusive requests; plaintext never enters D1',async()=>{
  const f=fixture();for(let i=0;i<10;i++)await f.run('signup',{...f.signup(),OPT_IN:'0'});
  assert.equal((await f.run('signup',f.signup())).status,429);
  const g=fixture();assert.equal((await g.run('signup',{EMAIL:'x'.repeat(3000)})).status,400);
  const h=fixture();await accepted(h);const rows=JSON.stringify(h.sqlite.prepare('SELECT * FROM waitlist_requests').all());
  assert.ok(!rows.includes('recipient@'));assert.match(h.sqlite.prepare('SELECT email_key FROM waitlist_requests').get().email_key,/^[a-f0-9]{64}$/);
});
test('Plus aliases remain distinct; no broker-side local memory dedupe assumptions',async()=>{
  const f=fixture();await f.run('signup',f.signup('recipient+app@example.test'));await f.run('signup',f.signup('recipient@example.test'));
  assert.equal(f.calls.filter(c=>c.method==='POST').length,2);
});
