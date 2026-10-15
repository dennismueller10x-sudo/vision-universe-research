// Pages runtime only. No logging, database, contact updates or unsubscribe endpoint.
export const CONSENT_VERSION='vu-newsletter-v1';
export const CONSENT_TEXT='Ich möchte den Vision-Universe-Newsletter per E-Mail erhalten: Neuigkeiten zu Vision Universe, neue Research-Inhalte und Informationen zu seinen Produkten einschließlich des App-Starts. Ich kann mich jederzeit über den Abmeldelink abmelden.';
export const TEMPLATE_NAME='VU | Newsletter | DE | API Double Opt In | v1';
export const TEMPLATE_TAG='vu-newsletter-api-doi-v1';
export const PENDING='Wenn eine neue Anmeldung möglich ist, erhältst du eine Bestätigungsmail. Bitte prüfe dein Postfach. Erst dein Klick bestätigt die neue Anmeldung.';
const PUBLIC_ORIGIN='https://www.visionuniverse.de';
const PREVIEW_ORIGIN='https://feat-brevo-app-waitlist-doi.vision-universe.pages.dev';
const API='https://api.brevo.com/v3';
const PATH='/api/newsletter/subscribe';
const ACCESS_PATH='/api/newsletter/test-access';
const DIAGNOSTIC_PATH='/api/newsletter/test-diagnostics';
const BAD='Die Anmeldung konnte nicht verarbeitet werden. Bitte prüfe deine Eingaben und versuche es später erneut.';
const UNKNOWN='Wir konnten die Anfrage nicht abschließend prüfen. Eine Anmeldung ist nicht bestätigt. Bitte prüfe dein Postfach; es erfolgt keine automatische Wiederholung.';
const CLOSED='Die Anmeldung ist noch nicht freigeschaltet. Deine E-Mail-Adresse wurde nicht zur Anmeldung übermittelt.';
const TOO_MANY='Zu viele Anfragen. Bitte versuche es später erneut.';
const TEST_EXISTING='Für diesen Betreiber-Test brauchst du eine neue, von dir kontrollierte Adresse, die bisher nicht in Brevo vorhanden ist. Der vorhandene Kontakt wurde nicht verändert und keine Bestätigungsmail angefordert.';
const H={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};

async function authorizedTest(request,env,now){
  if(env.NEWSLETTER_STAGE!=='production'||env.NEWSLETTER_CONTROLLED_ENABLED!=='true'||env.NEWSLETTER_PRIVACY_APPROVED!=='true'||!Number.isSafeInteger(Number(env.NEWSLETTER_TEST_UNTIL))||Number(env.NEWSLETTER_TEST_UNTIL)<=now)return false;
  const token=request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  const expected=env.NEWSLETTER_TEST_ACCESS_HASH;
  if(!token||typeof expected!=='string'||!/^[a-f0-9]{64}$/.test(expected))return false;
  const actual=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))].map(v=>v.toString(16).padStart(2,'0')).join('');
  let diff=0;for(let i=0;i<64;i++)diff|=actual.charCodeAt(i)^expected.charCodeAt(i);return diff===0;
}

export function createHandler({providerFetch=globalThis.fetch,cacheProvider=()=>globalThis.caches.default,now=Date.now}={}){
  const locks=new Map();
  async function exclusive(key,task){
    while(locks.has(key))await locks.get(key);
    if(locks.size>=1024)throw Error('Capacity');
    let release;const promise=new Promise(r=>release=r);locks.set(key,promise);
    try{return await task();}finally{locks.delete(key);release();}
  }
  async function digest(value,key){
    const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    return [...new Uint8Array(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('');
  }
  async function provider(path,env,body){
    const response=await providerFetch(API+path,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(8000),headers:{'api-key':env.BREVO_API_KEY,'Accept':'application/json','User-Agent':'VisionUniverse-Brevo/1.0',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    // Never surface provider bodies/errors to visitors or logs.
    return response;
  }
  async function readBody(request,form){
    const reader=request.body?.getReader();if(!reader)throw Error('Body');
    let bytes=0;const chunks=[];
    try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>4096)throw Error('Size');chunks.push(part.value);}}
    finally{await reader.cancel().catch(()=>{});}
    const all=new Uint8Array(bytes);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.length;}
    const text=new TextDecoder('utf-8',{fatal:true}).decode(all);
    if(!form){const data=JSON.parse(text);if(!data||Array.isArray(data)||Object.keys(data).some(k=>!['email','consent','consentVersion','honeypot'].includes(k)))throw Error('Fields');return data;}
    const pairs=new URLSearchParams(text);if([...pairs.keys()].some(k=>!['EMAIL','OPT_IN','CONSENT_VERSION','email_address_check','locale'].includes(k))||[...new Set(pairs.keys())].some(k=>pairs.getAll(k).length!==1))throw Error('Fields');
    return {email:pairs.get('EMAIL'),consent:pairs.get('OPT_IN')==='1',consentVersion:pairs.get('CONSENT_VERSION'),honeypot:pairs.get('email_address_check')||''};
  }
  function answer(status,message,form,origin,extra={}){
    if(form)return new Response(null,{status:303,headers:{...H,Location:origin+(status===202?'/newsletter/bestaetigen/':'/newsletter/fehler/')}});
    return new Response(JSON.stringify({message}),{status,headers:{...H,'Content-Type':'application/json; charset=utf-8',...extra}});
  }
  return async function handle(request,env){
    const url=new URL(request.url);
    if(![PATH,ACCESS_PATH,DIAGNOSTIC_PATH].includes(url.pathname))return new Response('Nicht gefunden',{status:404,headers:H});
    if(request.method!=='POST')return new Response('Nur POST',{status:405,headers:{...H,Allow:'POST'}});
    const type=(request.headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase();
    const form=type==='application/x-www-form-urlencoded';
    const out=(status,msg,extra)=>answer(status,msg,form,url.origin,extra);
    const stage=env.NEWSLETTER_STAGE;
    const expected=stage==='production'?PUBLIC_ORIGIN:stage==='preview'?PREVIEW_ORIGIN:'';
    if(!expected||url.origin!==expected||request.headers.get('Origin')!==expected||!['same-origin',null].includes(request.headers.get('Sec-Fetch-Site')))return out(403,BAD);
    const publicReady=stage==='production'&&['NEWSLETTER_PUBLIC_ENABLED','NEWSLETTER_PRIVACY_APPROVED','NEWSLETTER_E2E_VERIFIED'].every(n=>env[n]==='true');
    const testing=stage==='preview'&&env.NEWSLETTER_TEST_MODE==='true'&&typeof env.NEWSLETTER_TEST_EMAIL==='string'&&env.NEWSLETTER_TEST_EMAIL.length>3;
    const controlled=await authorizedTest(request,env,now());
    const diagnostic=url.pathname===DIAGNOSTIC_PATH;
    if(diagnostic&&(!controlled||form))return out(503,CLOSED);
    // Validate access before the browser enables fields. No body, contact/API
    // lookup, cache write, email address or provider call is needed here.
    if(url.pathname===ACCESS_PATH){
      if(!controlled||!env.BREVO_API_KEY||typeof env.NEWSLETTER_RATE_KEY!=='string'||env.NEWSLETTER_RATE_KEY.length<32)return out(503,'Der private Testzugang ist abgelaufen oder nicht mehr gültig. Bitte öffne einen aktuellen privaten Testlink. Deine E-Mail-Adresse wurde nicht übermittelt.');
      return new Response(JSON.stringify({expiresAt:Number(env.NEWSLETTER_TEST_UNTIL)}),{status:200,headers:{...H,'Content-Type':'application/json; charset=utf-8'}});
    }
    if(!publicReady&&!testing&&!controlled)return out(503,CLOSED);
    if(!['application/json','application/x-www-form-urlencoded'].includes(type))return out(415,BAD);
    if(!env.BREVO_API_KEY||typeof env.NEWSLETTER_RATE_KEY!=='string'||env.NEWSLETTER_RATE_KEY.length<32)return out(503,CLOSED);
    const ip=request.headers.get('CF-Connecting-IP');if(!ip||ip.length>64||!/^[:.0-9a-f]+$/i.test(ip))return out(403,BAD);
    let data;
    try{data=await readBody(request,form);}catch{return out(400,BAD);}
    if(typeof data.email!=='string'||data.email.length>254||typeof data.honeypot!=='string')return out(400,BAD);
    const email=data.email.trim().toLowerCase();
    if(!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(email)||data.consent!==true||data.consentVersion!==CONSENT_VERSION)return out(400,BAD);
    if(testing&&email!==env.NEWSLETTER_TEST_EMAIL.trim().toLowerCase())return out(503,CLOSED);
    if(data.honeypot)return out(202,PENDING);
    // Fixed labels only: no raw exception, provider body, address, URL or key.
    const trace={stage:'cache',http:null};
    const diagnosis=(status,extra={})=>new Response(JSON.stringify({diagnostic:{...trace,...extra}}),{status,headers:{...H,'Content-Type':'application/json; charset=utf-8'}});
    async function checkedProvider(stage,path,body){
      trace.stage=stage;trace.http=null;
      const response=await provider(path,env,body);trace.http=response.status;return response;
    }
    try{
      const cache=cacheProvider();if(!cache)throw Error('Cache unavailable');
      trace.stage='rate_hmac';
      const ipHash=await digest('ip:'+ip,env.NEWSLETTER_RATE_KEY);
      const ipKey=new Request(url.origin+'/.newsletter-internal/ip/'+ipHash+'/'+Math.floor(now()/600000));
      trace.stage='rate_cache';
      if(diagnostic){
        // Prove real edge cache read/write without touching delivery reservations
        // or binding the operator link. Contains only a constant, expires in 60s.
        const probe=new Request(url.origin+'/.newsletter-internal/diagnostic/'+env.NEWSLETTER_TEST_ACCESS_HASH);
        await cache.put(probe,new Response('ok',{headers:{'Cache-Control':'max-age=60'}}));
        if((await cache.match(probe))?.status!==200)throw Error('Cache probe');
      }
      const permitted=diagnostic||await exclusive('ip:'+ipHash,async()=>{
        const previous=await cache.match(ipKey);const count=previous?Number(await previous.text()):0;
        if(!Number.isInteger(count)||count<0)throw Error('Cache data');
        if(count>=3)return false;
        await cache.put(ipKey,new Response(String(count+1),{headers:{'Cache-Control':'max-age=600'}}));return true;
      });
      if(!permitted)return out(429,TOO_MANY,{'Retry-After':'600'});
      trace.stage='email_hmac';
      const emailHash=await digest('email:'+email,env.NEWSLETTER_RATE_KEY);
      return await exclusive('email:'+emailHash,async()=>{
        const hold=new Request(url.origin+'/.newsletter-internal/email/'+emailHash);
        trace.stage='reservation_read';
        const reserved=Boolean(await cache.match(hold));
        if(reserved&&!diagnostic)return out(202,PENDING);
        // Every existing contact, regardless of list/status, remains untouched.
        const contact=await checkedProvider('contact_lookup','/contacts/'+encodeURIComponent(email));
        // The authenticated owner test needs a genuinely new address. Public
        // responses remain neutral and never disclose contact membership.
        if(contact.status===200)return diagnostic?diagnosis(409,{existing:true,reserved}):out(controlled?409:202,controlled?TEST_EXISTING:PENDING);
        if(contact.status!==404)throw Error('Lookup uncertain');
        // Respect transactional blocks even if no marketing profile remains.
        let suppressionComplete=false;
        for(let offset=0;offset<2000;offset+=100){
          const response=await checkedProvider('suppression','/smtp/blockedContacts?limit=100&offset='+offset);
          if(response.status!==200)throw Error('Suppression unavailable');
          const page=await response.json();if(!Array.isArray(page.contacts))throw Error('Suppression shape');
          if(page.contacts.some(c=>typeof c.email==='string'&&c.email.trim().toLowerCase()===email))return diagnostic?diagnosis(409,{suppressed:true,reserved}):out(202,PENDING);
          if(page.contacts.length<100){suppressionComplete=true;break;}
        }
        if(!suppressionComplete)throw Error('Suppression pagination incomplete');
        // Global provider events survive POP changes; API lag still exists.
        const events=await checkedProvider('events','/smtp/statistics/events?templateId='+encodeURIComponent(env.NEWSLETTER_DOI_TEMPLATE_ID||'')+'&email='+encodeURIComponent(email)+'&days=1&limit=1');
        if(events.status!==200)throw Error('Event read uncertain');
        const history=await events.json();
        // Brevo omits its optional events field for an empty successful report.
        const eventRows=history&&typeof history==='object'&&!Array.isArray(history)&&Object.keys(history).length===0?[]:history?.events;
        if(!Array.isArray(eventRows))throw Error('Event shape');
        if(eventRows.length)return diagnostic?diagnosis(409,{prior_event:true,reserved}):out(202,PENDING);
        trace.stage='template_id';
        const id=Number(env.NEWSLETTER_DOI_TEMPLATE_ID);
        if(!Number.isInteger(id)||id<=4)throw Error('Wrong template');
        const attributesResponse=await checkedProvider('attributes','/contacts/attributes');
        if(attributesResponse.status!==200)throw Error('Consent attribute unavailable');
        const attributes=await attributesResponse.json();
        if(!Array.isArray(attributes.attributes)||!attributes.attributes.some(a=>a.name==='VU_EMAIL_CONSENT'&&a.category==='normal'&&a.type==='text'))throw Error('Consent schema mismatch');
        const templateResponse=await checkedProvider('template','/smtp/templates/'+id);
        if(templateResponse.status!==200)throw Error('Template unavailable');
        const template=await templateResponse.json();
        if(template.name!==TEMPLATE_NAME||template.isActive!==true||template.tag!==TEMPLATE_TAG||!template.htmlContent?.includes('{{ params.DOIurl }}')||!template.htmlContent.includes(CONSENT_TEXT)||template.htmlContent.includes('{{ doubleoptin }}'))throw Error('Template incompatible');
        const budgetResponse=await checkedProvider('budget','/smtp/statistics/aggregatedReport?days=1&tag='+TEMPLATE_TAG);
        if(budgetResponse.status!==200)throw Error('Budget unavailable');
        const budget=await budgetResponse.json();
        if(!Number.isInteger(budget.requests)||budget.requests<0)throw Error('Budget shape');
        if(budget.requests>=50)return out(429,TOO_MANY,{'Retry-After':'3600'});
        if(diagnostic)return diagnosis(200,{stage:'ready',reserved,provider_write_calls:0});
        trace.stage='test_binding';trace.http=null;
        if(controlled){
          // Pseudonymous, short-lived address binding for the one operator link.
          // Cache is per POP; possession of the private link authorizes the owner.
          const testKey=new Request(url.origin+'/.newsletter-internal/test/'+env.NEWSLETTER_TEST_ACCESS_HASH);
          const own=await exclusive('test:'+env.NEWSLETTER_TEST_ACCESS_HASH,async()=>{
            const prior=await cache.match(testKey);
            if(prior)return (await prior.text())===emailHash;
            await cache.put(testKey,new Response(emailHash,{headers:{'Cache-Control':'max-age='+Math.min(7200,Math.max(1,Math.ceil((Number(env.NEWSLETTER_TEST_UNTIL)-now())/1000)))}}));return true;
          });
          if(!own)return out(503,CLOSED);
        }
        // Reserve before the only delivery call. Keep on errors/uncertain results.
        trace.stage='reservation_write';
        await cache.put(hold,new Response('reserved',{headers:{'Cache-Control':'max-age=86400'}}));
        const secondCheck=await checkedProvider('second_contact_lookup','/contacts/'+encodeURIComponent(email));
        if(secondCheck.status===200)return out(202,PENDING);
        if(secondCheck.status!==404)throw Error('Second lookup uncertain');
        const result=await checkedProvider('doi_request','/contacts/doubleOptinConfirmation',{email,includeListIds:[4],templateId:id,redirectionUrl:expected+'/newsletter/bestaetigt/',contactPixelTrackingConsent:false,attributes:{VU_EMAIL_CONSENT:'subscribed'}});
        if(result.status!==201)throw Error('Delivery outcome uncertain');
        return out(202,PENDING);
      });
    }catch{
      if(diagnostic)return diagnosis(503);
      if(controlled)return new Response(JSON.stringify({message:UNKNOWN,diagnostic:trace}),{status:503,headers:{...H,'Content-Type':'application/json; charset=utf-8'}});
      return out(503,UNKNOWN);
    }
  };
}
const handle=createHandler();
export default {async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(path.startsWith('/.newsletter-internal/')||path.startsWith('/_worker')||path.startsWith('/server/'))return new Response('Nicht gefunden',{status:404,headers:H});
  if(path.startsWith('/api/'))return handle(request,env);
  return env.ASSETS.fetch(request);
}};
