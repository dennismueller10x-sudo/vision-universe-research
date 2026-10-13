// Cloudflare Pages runtime only. No logging, analytics, contact creation or campaigns.
export const APP_LIST = 5;
export const CONSENT_VERSION = 'vu-app-launch-v1';
export const CONSENT_TEXT = 'Ich möchte von Vision Universe per E-Mail über den Start der App und Neuigkeiten zur App informiert werden. Ich kann meine Einwilligung jederzeit über den Abmeldelink widerrufen.';
const ORIGIN = 'https://www.visionuniverse.de';
const API = 'https://api.brevo.com/v3';
const encoder = new TextEncoder();
const generic = 'Bitte bestätige deine E-Mail-Adresse. Wenn eine Anmeldung möglich ist, erhältst du eine Bestätigungsmail. Erst nach deinem Klick kommst du auf die App-Warteliste.';

function answer(status, message, extra = {}) {
  return Response.json({message, ...extra}, {status, headers: {'Cache-Control':'no-store',
    'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'}});
}
function secretBytes(env) {
  if (!/^[a-f0-9]{64}$/.test(env.WAITLIST_TOKEN_KEY || '')) throw Error('Unavailable');
  return Uint8Array.from(env.WAITLIST_TOKEN_KEY.match(/../g), x => parseInt(x,16));
}
async function identifier(env, kind, value) {
  const key = await crypto.subtle.importKey('raw',secretBytes(env),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const result = await crypto.subtle.sign('HMAC',key,encoder.encode(kind+':'+value));
  return [...new Uint8Array(result)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
const base64 = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
function unbase64(text) {
  if (!/^[A-Za-z0-9_-]{1,1200}$/.test(text)) throw Error('Invalid');
  return Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
}
export async function seal(env, payload) {
  const key=await crypto.subtle.importKey('raw',secretBytes(env),'AES-GCM',false,['encrypt']);
  const nonce=crypto.getRandomValues(new Uint8Array(12));
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData:encoder.encode(CONSENT_VERSION)},key,encoder.encode(JSON.stringify(payload)));
  return base64(nonce)+'.'+base64(new Uint8Array(encrypted));
}
export async function open(env, token) {
  const parts=String(token||'').split('.');
  if(parts.length!==2)throw Error('Invalid');
  const key=await crypto.subtle.importKey('raw',secretBytes(env),'AES-GCM',false,['decrypt']);
  const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:unbase64(parts[0]),additionalData:encoder.encode(CONSENT_VERSION)},key,unbase64(parts[1]));
  const payload=JSON.parse(new TextDecoder().decode(data));
  if(payload.purpose!=='app' || !/^[a-f0-9]{32}$/.test(payload.requestId)||normalize(payload.email)!==payload.email)throw Error('Invalid');
  return payload;
}
function normalize(email) {
  if(typeof email!=='string')return '';
  email=email.trim().toLowerCase();
  if(email.length>254||! /^[a-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(email) || email.includes('..'))return '';
  return email; // Plus aliases remain distinct; no provider-specific assumptions.
}
async function bodyOf(request) {
  if(Number(request.headers.get('Content-Length')||0)>2048)throw Error('Invalid');
  const reader=request.body?.getReader();
  if(!reader)throw Error('Invalid');
  const chunks=[];let length=0;
  for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>2048){await reader.cancel();throw Error('Invalid');}chunks.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const text=new TextDecoder().decode(bytes);
  const type=(request.headers.get('Content-Type')||'').split(';')[0];
  if(type==='application/json')return JSON.parse(text);
  if(type==='application/x-www-form-urlencoded')return Object.fromEntries(new URLSearchParams(text));
  throw Error('Invalid');
}
export function store(env) {
  const db=env.WAITLIST_DB;
  if(!db?.prepare)throw Error('Unavailable');
  return {
    prune(window){return db.prepare('DELETE FROM waitlist_limits WHERE window<?').bind(window-144).run();},
    async limit(key,window,max){
      const count=await db.prepare('INSERT INTO waitlist_limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window RETURNING count').bind(key,window).first('count');
      return count<=max;
    },
    async reserve(key,id,now){
      const result=await db.prepare('INSERT OR IGNORE INTO waitlist_requests(email_key,request_id,state,requested_at,consent_version) VALUES(?,?,\'reserved\',?,?)').bind(key,id,now,CONSENT_VERSION).run();
      return result.meta.changes===1;
    },
    row(key){return db.prepare('SELECT * FROM waitlist_requests WHERE email_key=?').bind(key).first();},
    async reserveNotice(key){
      return (await db.prepare('UPDATE waitlist_requests SET notice_state=\'reserved\' WHERE email_key=? AND state=\'confirmed\' AND notice_state IS NULL').bind(key).run()).meta.changes===1;
    },
    noticeState(key,state){return db.prepare('UPDATE waitlist_requests SET notice_state=? WHERE email_key=?').bind(state,key).run();},
    async state(key,state,now){
      if(state==='confirmed')await db.prepare('UPDATE waitlist_requests SET state=?,confirmed_at=COALESCE(confirmed_at,?) WHERE email_key=? AND state IN (\'reserved\',\'accepted\',\'unknown\',\'confirmed\')').bind(state,now,key).run();
      else if(state==='withdrawn')await db.prepare('UPDATE waitlist_requests SET state=?,withdrawn_at=COALESCE(withdrawn_at,?) WHERE email_key=?').bind(state,now,key).run();
      else await db.prepare('UPDATE waitlist_requests SET state=? WHERE email_key=? AND state=\'reserved\'').bind(state,key).run();
    }
  };
}
async function brevo(env, method, path, body, fetcher) {
  const permitted=method==='GET' && /^\/contacts\/[^/]+$/.test(path) ||
    method==='POST' && path==='/contacts/doubleOptinConfirmation' ||
    method==='POST' && path==='/smtp/email' && body?.templateId===Number(env.WAITLIST_CONFIRMATION_TEMPLATE_ID) && body?.to?.length===1 ||
    method==='PUT' && /^\/contacts\/\d+$/.test(path);
  if(!permitted)throw Error('Denied');
  const response=await fetcher(API+path,{method,redirect:'error',signal:AbortSignal.timeout(15000),
    headers:{'api-key':env.BREVO_API_KEY,'Accept':'application/json',...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{})});
  if(method==='GET' && response.status===404)return null;
  if(!response.ok)throw Error('Provider rejected');
  if(method!=='GET')return null;
  return response.json();
}
function proof(contact,payload) {
  return !!contact && Number.isSafeInteger(contact.id) && contact.attributes?.VU_APP_REQUEST_ID===payload.requestId &&
    contact.attributes?.VU_APP_PURPOSE==='app-launch' && contact.attributes?.VU_APP_CONSENT_VERSION===CONSENT_VERSION;
}
export function eligibleAppRecipient(contact,row) {
  return row?.state==='confirmed' && contact?.emailBlacklisted===false && contact.listIds?.includes(APP_LIST) &&
    contact.attributes?.VU_APP_REQUEST_ID===row.request_id && contact.attributes?.VU_APP_PURPOSE==='app-launch';
}
export async function handleWaitlist(request,env,{fetcher=fetch,now=Date.now()}={}) {
  try {
    const url=new URL(request.url);
    if(!url.pathname.startsWith('/api/waitlist/'))return null;
    if(request.method!=='POST')return answer(405,'Diese Anfrage ist nicht zulässig.');
    if(request.headers.get('Origin')!==url.origin || (url.origin!==ORIGIN && url.origin!==env.WAITLIST_TEST_REDIRECT_ORIGIN &&
      !(env.WAITLIST_TEST_ACCESS_TOKEN && request.headers.get('X-Waitlist-Test')===env.WAITLIST_TEST_ACCESS_TOKEN)))return answer(403,'Diese Anfrage ist nicht zulässig.');
    const signup=url.pathname==='/api/waitlist/signup';
    const testMode=env.WAITLIST_TEST_ACCESS_TOKEN && request.headers.get('X-Waitlist-Test')===env.WAITLIST_TEST_ACCESS_TOKEN;
    if(!env.BREVO_API_KEY || !env.WAITLIST_DB || !env.WAITLIST_TOKEN_KEY)return answer(503,'Die Anmeldung ist noch nicht freigeschaltet.');
    if(signup && !(env.WAITLIST_PUBLIC_ENABLED==='true' && env.WAITLIST_PRIVACY_APPROVED==='true' && env.WAITLIST_E2E_VERIFIED==='true') && !testMode)return answer(503,'Die Anmeldung ist noch nicht freigeschaltet. Deine E-Mail-Adresse wurde nicht übermittelt.');
    const ip=request.headers.get('CF-Connecting-IP');
    if(!ip)return answer(503,'Die Anfrage konnte nicht geprüft werden.');
    const db=store(env);const window=Math.floor(now/600000);
    await db.prune(window);
    if(!await db.limit(await identifier(env,'ip',ip),window,10))return answer(429,'Zu viele Anfragen. Bitte versuche es später erneut.');
    let body;try{body=await bodyOf(request);}catch{return answer(400,'Bitte prüfe deine Angaben.');}
    if(signup) {
      if(body.email_address_check)return answer(202,generic);
      const email=normalize(body.EMAIL);
      if(!email || body.OPT_IN!=='1' || body.consent_version!==CONSENT_VERSION)return answer(400,'Gib eine gültige E-Mail-Adresse ein und stimme den App-Informationen zu.');
      if(!/^[1-9]\d*$/.test(env.WAITLIST_DOI_TEMPLATE_ID||'') || !/^[1-9]\d*$/.test(env.WAITLIST_CONFIRMATION_TEMPLATE_ID||''))return answer(503,'Die Anmeldung ist noch nicht freigeschaltet.');
      if(testMode && normalize(env.WAITLIST_TEST_EMAIL)!==email)return answer(403,'Testadresse nicht freigegeben.');
      const key=await identifier(env,'email',email);
      const existing=await brevo(env,'GET','/contacts/'+encodeURIComponent(email),null,fetcher);
      // Existing records, including pending, unsubscribed or imported contacts, are never resubscribed.
      if(existing || await db.row(key))return answer(202,generic);
      if(!await db.limit('global-doi',Math.floor(now/86400000)*144,50))return answer(429,'Zu viele Anfragen. Bitte versuche es später erneut.');
      const requestId=crypto.randomUUID().replaceAll('-','');
      if(!await db.reserve(key,requestId,now))return answer(202,generic);
      const token=await seal(env,{purpose:'app',email,requestId});
      const redirectOrigin=testMode && /^https:\/\/[a-z0-9-]+\.vision-universe\.pages\.dev$/.test(env.WAITLIST_TEST_REDIRECT_ORIGIN||'') ? env.WAITLIST_TEST_REDIRECT_ORIGIN : ORIGIN;
      try {
        await brevo(env,'POST','/contacts/doubleOptinConfirmation',{
          email,includeListIds:[APP_LIST],templateId:Number(env.WAITLIST_DOI_TEMPLATE_ID),
          redirectionUrl:redirectOrigin+'/warteliste/bestaetigt/#t='+token,
          attributes:{VU_SOURCE:'Coming-soon-Landingpage',VU_APP_REQUEST_ID:requestId,
            VU_APP_PURPOSE:'app-launch',VU_APP_CONSENT_VERSION:CONSENT_VERSION},
          contactPixelTrackingConsent:false
        },fetcher);
        await db.state(key,'accepted',now);
      } catch {await db.state(key,'unknown',now);return answer(503,'Die Anfrage wurde nicht bestätigt. Prüfe dein Postfach; bitte nicht mehrfach absenden.');}
      return answer(202,generic); // API acceptance is neither delivery nor DOI proof.
    }
    if(!['/api/waitlist/confirmed','/api/waitlist/unsubscribe'].includes(url.pathname))return answer(404,'Seite nicht gefunden.');
    let payload;try{payload=await open(env,body.token);}catch{return answer(400,'Dieser Link ist ungültig.');}
    const key=await identifier(env,'email',payload.email);const row=await db.row(key);
    if(!row || row.request_id!==payload.requestId)return answer(400,'Dieser Link ist ungültig.');
    const contact=await brevo(env,'GET','/contacts/'+encodeURIComponent(payload.email),null,fetcher);
    if(!proof(contact,payload))return answer(409,'Die Bestätigung ist noch nicht nachgewiesen. Bitte nutze den Link aus deiner Bestätigungsmail.');
    if(url.pathname==='/api/waitlist/confirmed') {
      if(row.state==='withdrawn'||contact.emailBlacklisted||!contact.listIds?.includes(APP_LIST))return answer(409,'Diese Anmeldung ist nicht aktiv.');
      await db.state(key,'confirmed',now);
      if((await db.row(key)).state!=='confirmed')return answer(409,'Diese Anmeldung ist nicht aktiv.');
      if(await db.reserveNotice(key)){
        try{
          await brevo(env,'POST','/smtp/email',{templateId:Number(env.WAITLIST_CONFIRMATION_TEMPLATE_ID),
            to:[{email:payload.email}],params:{unsubscribe_url:ORIGIN+'/warteliste/abmelden/#t='+body.token},
            headers:{'X-Mailin-custom':'vu-app-confirmation'}},fetcher);
          await db.noticeState(key,'accepted');
        }catch{await db.noticeState(key,'unknown');} // No blind retry of an irreversible send.
      }
      return answer(200,'Deine E-Mail-Adresse ist bestätigt. Du stehst jetzt auf der App-Warteliste.',{confirmed:true});
    }
    await db.state(key,'withdrawn',now); // Fail closed for later programmatic recipient selection.
    if(contact.listIds?.includes(APP_LIST)) {
      await brevo(env,'PUT','/contacts/'+contact.id,{unlinkListIds:[APP_LIST]},fetcher);
      const after=await brevo(env,'GET','/contacts/'+encodeURIComponent(payload.email),null,fetcher);
      if(!after || after.listIds?.includes(APP_LIST))throw Error('Not verified');
      if(JSON.stringify((after.listIds||[]).filter(id=>id!==APP_LIST).sort())!==JSON.stringify((contact.listIds||[]).filter(id=>id!==APP_LIST).sort()))throw Error('Unexpected list change');
    }
    return answer(200,'Du bist von der App-Warteliste abgemeldet. Du erhältst keine weiteren App-Informationen für diese Anmeldung.',{unsubscribed:true});
  } catch {return answer(503,'Die Anfrage konnte nicht bestätigt werden. Bitte versuche es später erneut.');}
}
