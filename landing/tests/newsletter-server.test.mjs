import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,CONSENT_TEXT,CONSENT_VERSION,TEMPLATE_NAME,TEMPLATE_TAG,PENDING} from '../server/newsletter.mjs';
const origin='https://www.visionuniverse.de';
function fixture(options={}){
  let clock=0;const stored=new Map(),calls=[];
  const cache={async match(r){const v=stored.get(r.url);if(!v||v.until<=clock)return undefined;return new Response(v.body);},async put(r,s){stored.set(r.url,{body:await s.text(),until:clock+Number(s.headers.get('Cache-Control').split('=')[1])*1000});}};
  const env={NEWSLETTER_STAGE:'production',NEWSLETTER_PUBLIC_ENABLED:'true',NEWSLETTER_PRIVACY_APPROVED:'true',NEWSLETTER_E2E_VERIFIED:'true',BREVO_API_KEY:'synthetic-api-key',NEWSLETTER_RATE_KEY:'a'.repeat(64),NEWSLETTER_DOI_TEMPLATE_ID:'5'};
  const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
  const handler=createHandler({cacheProvider:()=>{if(options.cacheFailure)throw Error('Secret cache details new+qa@example.test');return cache;},now:()=>clock,providerFetch:async(url,init)=>{
    assert.equal(init.headers['api-key'],env.BREVO_API_KEY);assert.equal(init.redirect,'manual');
    const path=new URL(url).pathname;calls.push({path,method:init.method,body:init.body&&JSON.parse(init.body)});
    if(path.startsWith('/v3/contacts/')&&path!=='/v3/contacts/attributes'&&init.method==='GET')return json(options.existing||{},options.lookupStatus||(options.existing?200:404));
    if(path==='/v3/smtp/blockedContacts')return json({contacts:options.blocked||[]});
    if(path==='/v3/smtp/statistics/events')return json(Object.hasOwn(options,'eventResponse')?options.eventResponse:{events:options.events||[]});
    if(path==='/v3/contacts/attributes')return json({attributes:options.attributes??[{name:'VU_EMAIL_CONSENT',category:'normal',type:'text'}]});
    if(path==='/v3/smtp/templates/5')return json({name:TEMPLATE_NAME,isActive:true,doiTemplate:true,tag:TEMPLATE_TAG,htmlContent:'{{ params.DOIurl }}'+CONSENT_TEXT,...options.template});
    if(path==='/v3/smtp/statistics/aggregatedReport')return json({requests:options.budget??0});
    if(path==='/v3/contacts/doubleOptinConfirmation'){
      if(options.throwSend)throw Error('Synthetic provider secret/personal details, never surface');
      return json({},options.sendStatus||201);
    }
    throw Error('Unexpected endpoint');
  }});
  const request=(email='new+qa@example.test',patch={},headers={})=>new Request(origin+'/api/newsletter/subscribe',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1',...headers},body:JSON.stringify({email,consent:true,consentVersion:CONSENT_VERSION,honeypot:'',...patch})});
  return {handler,env,request,calls,stored,advance:n=>clock+=n,sends:()=>calls.filter(c=>c.method==='POST')};
}
test('Alle öffentlichen Gates und Preview-Testadressen werden serverseitig erzwungen',async()=>{
  for(const gate of ['NEWSLETTER_PUBLIC_ENABLED','NEWSLETTER_PRIVACY_APPROVED','NEWSLETTER_E2E_VERIFIED']){
    const f=fixture();f.env[gate]='false';assert.equal((await f.handler(f.request(),f.env)).status,503);assert.equal(f.calls.length,0);
  }
  const f=fixture();f.env.NEWSLETTER_STAGE='preview';f.env.NEWSLETTER_TEST_MODE='true';f.env.NEWSLETTER_TEST_EMAIL='only-new@example.test';
  const preview='https://feat-brevo-app-waitlist-doi.vision-universe.pages.dev';
  const req=new Request(preview+'/api/newsletter/subscribe',{method:'POST',headers:{Origin:preview,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify({email:'other@example.test',consent:true,consentVersion:CONSENT_VERSION,honeypot:''})});
  assert.equal((await f.handler(req,f.env)).status,503);assert.equal(f.calls.length,0);
});
test('Private Laufzeitdiagnose prüft dieselben GETs und Cache ohne DOI, Reservierung oder Adressbindung',async()=>{
  const token='a'.repeat(43),hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');
  const f=fixture();Object.assign(f.env,{NEWSLETTER_PUBLIC_ENABLED:'false',NEWSLETTER_E2E_VERIFIED:'false',NEWSLETTER_CONTROLLED_ENABLED:'true',NEWSLETTER_TEST_ACCESS_HASH:hash,NEWSLETTER_TEST_UNTIL:'7200000'});
  const diagnostic=(headers={})=>new Request(origin+'/api/newsletter/test-diagnostics',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1',...headers},body:JSON.stringify({email:'new+qa@example.test',consent:true,consentVersion:CONSENT_VERSION,honeypot:''})});
  assert.equal((await f.handler(diagnostic(),f.env)).status,503);assert.equal(f.calls.length,0);
  const result=await f.handler(diagnostic({Authorization:'Bearer '+token}),f.env);
  assert.equal(result.status,200);assert.deepEqual(await result.json(),{diagnostic:{stage:'ready',http:200,reserved:false,provider_write_calls:0}});
  assert.equal(result.headers.get('Cache-Control'),'no-store');assert.equal(f.sends().length,0);
  assert.equal(f.calls.length,6);assert.ok(f.calls.every(c=>c.method==='GET'));
  assert.ok([...f.stored.keys()].every(k=>k.includes('/diagnostic/')));
  // A read-only probe must not consume the first-send reservation or bind it.
  assert.equal((await f.handler(f.request(undefined,{}, {Authorization:'Bearer '+token}),f.env)).status,202);assert.equal(f.sends().length,1);
});
test('Feste private Fehlerphasen zeigen Cache- und Providerfehler ohne Rohdaten; öffentlich keine Diagnose',async()=>{
  const token='a'.repeat(43),hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');
  for(const [options,stage,http] of [[{cacheFailure:true},'cache',null],[{lookupStatus:403},'contact_lookup',403],[{template:{isActive:false}},'template',200]]){
    const f=fixture(options);Object.assign(f.env,{NEWSLETTER_CONTROLLED_ENABLED:'true',NEWSLETTER_TEST_ACCESS_HASH:hash,NEWSLETTER_TEST_UNTIL:'7200000'});
    const response=await f.handler(f.request(undefined,{}, {Authorization:'Bearer '+token}),f.env);
    assert.equal(response.status,503);const text=await response.text();assert.deepEqual(JSON.parse(text).diagnostic,{stage,http});
    assert.doesNotMatch(text,/synthetic-api-key|Secret cache|new\+qa@example/);assert.equal(f.sends().length,0);
    const publicResponse=await f.handler(f.request(),f.env);assert.equal(publicResponse.status,503);assert.equal((await publicResponse.json()).diagnostic,undefined);
  }
});
test('Private Statusprüfung zeigt Mitgliedschaft und Sperre ausschließlich als Flags ohne Kontakt-/Ereignisrohdaten',async()=>{
  const token='a'.repeat(43),hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');
  for(const options of [{existing:{email:'synthetic-private@example.test',listIds:[4],emailBlacklisted:true,attributes:{VU_EMAIL_CONSENT:'subscribed'}}},{events:[{event:'delivered',email:'synthetic-private@example.test',messageId:'private-event-id'}]},{events:[{event:'unexpected-personalized-text',email:'synthetic-private@example.test'}]}]){
    const f=fixture(options);Object.assign(f.env,{NEWSLETTER_CONTROLLED_ENABLED:'true',NEWSLETTER_TEST_ACCESS_HASH:hash,NEWSLETTER_TEST_UNTIL:'7200000'});
    const original=f.request(undefined,{}, {Authorization:'Bearer '+token});
    const response=await f.handler(new Request(origin+'/api/newsletter/test-diagnostics',original),f.env);
    assert.equal(response.status,409);const raw=await response.text(),value=JSON.parse(raw).diagnostic;
    assert.doesNotMatch(raw,/synthetic-private|private-event-id|unexpected-personalized-text/);
    if(options.existing){assert.equal(value.member4,true);assert.equal(value.marketing_blocked,true);assert.equal(value.consent_subscribed,true);}
    else assert.equal(value.latest_event,options.events[0].event==='delivered'?'delivered':'other');
    assert.equal(f.sends().length,0);assert.ok([...f.stored.keys()].every(k=>k.includes('/diagnostic/')));
  }
});
test('Privater Hauptdomain-Test benötigt Freigabe, geheimes Zugangsmerkmal und gültige Frist',async()=>{
  const token='a'.repeat(43);
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))].map(v=>v.toString(16).padStart(2,'0')).join('');
  function controlled(){const f=fixture();Object.assign(f.env,{NEWSLETTER_PUBLIC_ENABLED:'false',NEWSLETTER_E2E_VERIFIED:'false',NEWSLETTER_CONTROLLED_ENABLED:'true',NEWSLETTER_TEST_ACCESS_HASH:hash,NEWSLETTER_TEST_UNTIL:'7200000'});return f;}
  for(const [patch,authorization] of [[{},undefined],[{},'Bearer '+ 'b'.repeat(43)],[{NEWSLETTER_PRIVACY_APPROVED:'false'},'Bearer '+token],[{NEWSLETTER_TEST_UNTIL:'0'},'Bearer '+token],[{NEWSLETTER_CONTROLLED_ENABLED:'false'},'Bearer '+token]]){
    const f=controlled();Object.assign(f.env,patch);assert.equal((await f.handler(f.request(undefined,{},authorization?{Authorization:authorization}:{}),f.env)).status,503);assert.equal(f.calls.length,0);
  }
  const f=controlled();const req=(email)=>f.request(email,{}, {Authorization:'Bearer '+token});
  assert.equal((await f.handler(req('new@example.test'),f.env)).status,202);assert.equal(f.sends().length,1);
  assert.equal((await f.handler(req('other@example.test'),f.env)).status,503);assert.equal(f.sends().length,1);
  assert.equal((await f.handler(req('new@example.test'),f.env)).status,202);assert.equal(f.sends().length,1);
  f.advance(7200001);assert.equal((await f.handler(req('new@example.test'),f.env)).status,503);assert.equal(f.sends().length,1);
});
test('Origin, Eingaben, Consentversion, Größe und Honeypot begrenzen den Endpoint',async()=>{
  for(const [patch,headers,status] of [[{}, {Origin:'https://evil.example'},403],[{consent:false},{},400],[{consentVersion:'old'},{},400],[{email:'bad'},{},400],[{listIds:[5,6]},{},400],[{email:'x'.repeat(5000)},{},400],[{honeypot:'bot'},{},202]]){
    const f=fixture();assert.equal((await f.handler(f.request(undefined,patch,headers),f.env)).status,status);assert.equal(f.calls.length,0);
  }
  const f=fixture();assert.equal((await f.handler(new Request(origin+'/api/newsletter/subscribe'),f.env)).status,405);assert.equal(f.calls.length,0);
});
test('Testzugang wird vor Feldeingabe ohne Provider, Adresse oder Cache-Schreibzugriff geprüft',async()=>{
  const token='a'.repeat(43),hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');
  const f=fixture();Object.assign(f.env,{NEWSLETTER_PUBLIC_ENABLED:'false',NEWSLETTER_E2E_VERIFIED:'false',NEWSLETTER_CONTROLLED_ENABLED:'true',NEWSLETTER_TEST_ACCESS_HASH:hash,NEWSLETTER_TEST_UNTIL:'7200000'});
  const request=(headers={},method='POST')=>new Request(origin+'/api/newsletter/test-access',{method,headers:{Origin:origin,Authorization:'Bearer '+token,...headers}});
  const ok=await f.handler(request(),f.env);assert.equal(ok.status,200);assert.deepEqual(await ok.json(),{expiresAt:7200000});assert.equal(ok.headers.get('Cache-Control'),'no-store');
  for(const headers of [{Authorization:''},{Authorization:'Bearer '+'b'.repeat(43)},{Origin:'https://visionuniverse.de'},{'Sec-Fetch-Site':'cross-site'}])assert.ok([403,503].includes((await f.handler(request(headers),f.env)).status));
  assert.equal((await f.handler(request({},'GET'),f.env)).status,405);
  f.advance(7200000);const expired=await f.handler(request(),f.env);assert.equal(expired.status,503);assert.match((await expired.json()).message,/abgelaufen/);
  assert.equal(f.calls.length,0);assert.equal(f.stored.size,0);
});
test('Nur der authentifizierte Betreiber-Test erklärt vorhandene Kontakte ohne Neuaufnahme',async()=>{
  const options={existing:{listIds:[4],emailBlacklisted:true}},f=fixture(options),token='a'.repeat(43);
  const hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');
  Object.assign(f.env,{NEWSLETTER_PUBLIC_ENABLED:'false',NEWSLETTER_E2E_VERIFIED:'false',NEWSLETTER_CONTROLLED_ENABLED:'true',NEWSLETTER_TEST_ACCESS_HASH:hash,NEWSLETTER_TEST_UNTIL:'7200000'});
  const response=await f.handler(f.request(undefined,{}, {Authorization:'Bearer '+token}),f.env);
  assert.equal(response.status,409);assert.match((await response.json()).message,/neue, von dir kontrollierte Adresse/);assert.equal(f.sends().length,0);
  delete options.existing;assert.equal((await f.handler(f.request('genuinely-new@example.test',{}, {Authorization:'Bearer '+token}),f.env)).status,202);assert.equal(f.sends().length,1);
});
test('Jeder Bestandskontakt bleibt unverändert, einschließlich Abmeldung und interner Listen',async()=>{
  for(const contact of [{listIds:[4],attributes:{buyer:true}},{listIds:[6]},{emailBlacklisted:true},{listIds:[],attributes:{status:'unclear'}}]){
    const f=fixture({existing:contact});const result=await f.handler(f.request(),f.env);
    assert.equal(result.status,202);assert.equal((await result.json()).message,PENDING);assert.equal(f.sends().length,0);assert.equal(f.calls.length,1);
  }
});
test('Transaktionale Sperren und bereits protokollierte DOI-Anfragen werden nicht erneut versendet',async()=>{
  for(const options of [{blocked:[{email:'NEW+QA@example.test'}]},{events:[{event:'request'}]}]){
    const f=fixture(options);assert.equal((await f.handler(f.request(),f.env)).status,202);assert.equal(f.sends().length,0);
  }
});
test('Dokumentierter leerer Brevo-Ereignisbericht erlaubt erste Anmeldung; unklare Formen bleiben gesperrt',async()=>{
  const empty=fixture({eventResponse:{}});assert.equal((await empty.handler(empty.request(),empty.env)).status,202);assert.equal(empty.sends().length,1);
  for(const eventResponse of [null,[],{events:null},{events:{}},{unexpected:[]}]){
    const f=fixture({eventResponse});assert.equal((await f.handler(f.request(),f.env)).status,503);assert.equal(f.sends().length,0);
  }
});
test('Neue Adresse behält Plus-Alias; ausschließlich offizielles DOI an Liste 4',async()=>{
  const f=fixture();const result=await f.handler(f.request(' NEW+QA@example.test '),f.env);
  assert.equal(result.status,202);assert.equal(f.sends().length,1);
  assert.deepEqual(f.sends()[0],{path:'/v3/contacts/doubleOptinConfirmation',method:'POST',body:{email:'new+qa@example.test',includeListIds:[4],templateId:5,redirectionUrl:origin+'/newsletter/bestaetigt/',contactPixelTrackingConsent:false,attributes:{VU_EMAIL_CONSENT:'subscribed'}}});
  assert.equal((await result.json()).message,PENDING);assert.equal(result.headers.get('Cache-Control'),'no-store');
  assert.ok([...f.stored.keys()].every(k=>!k.includes('example.test')&&!k.includes('192.0.2.1')));
});
test('Parallele Wiederholung und unklarer Provider-Ausgang bleiben lokal reserviert',async()=>{
  for(const options of [{},{throwSend:true},{sendStatus:500}]){
    const f=fixture(options);const results=await Promise.all([f.handler(f.request(),f.env),f.handler(f.request(),f.env)]);
    assert.equal(f.sends().length,1);assert.ok(results.some(r=>r.status===202));
    f.advance(601000);assert.equal((await f.handler(f.request(),f.env)).status,202);assert.equal(f.sends().length,1);
    for(const r of results)assert.doesNotMatch(await r.text(),/synthetic-api-key|new\+qa@example|personal details/);
  }
});
test('Ratenfenster, Budget, unklare Bestandsabfrage und falsche Vorlage stoppen Versand',async()=>{
  const f=fixture();for(let i=0;i<3;i++)await f.handler(f.request('n'+i+'@example.test'),f.env);
  assert.equal((await f.handler(f.request('four@example.test'),f.env)).status,429);assert.equal(f.sends().length,3);
  for(const options of [{budget:50},{template:{doiTemplate:false}},{template:{doiTemplate:undefined}},{lookupStatus:403},{lookupStatus:302},{lookupStatus:307},{attributes:[]},{attributes:[{name:'VU_EMAIL_CONSENT',category:'normal',type:'boolean'}]},{template:{htmlContent:'{{ doubleoptin }}'}}]){
    const g=fixture(options);assert.ok([429,503].includes((await g.handler(g.request(),g.env)).status));assert.equal(g.sends().length,0);
  }
  const g=fixture();g.env.NEWSLETTER_DOI_TEMPLATE_ID='4';assert.equal((await g.handler(g.request(),g.env)).status,503);assert.equal(g.sends().length,0);
});
test('Ohne JavaScript bleibt die Rückmeldung auf einer eigenen gebrandeten Seite',async()=>{
  const f=fixture();const req=new Request(origin+'/api/newsletter/subscribe',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded','CF-Connecting-IP':'192.0.2.1'},body:new URLSearchParams({EMAIL:'new@example.test',OPT_IN:'1',CONSENT_VERSION,locale:'de',email_address_check:''})});
  const response=await f.handler(req,f.env);assert.equal(response.status,303);assert.equal(response.headers.get('Location'),origin+'/newsletter/bestaetigen/');assert.equal(f.sends().length,1);
});
