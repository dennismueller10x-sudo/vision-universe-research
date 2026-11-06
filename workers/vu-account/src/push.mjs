import {HttpError, json, readJson} from './http.mjs';
import {requireUser} from './auth.mjs';
export function deviceToken(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_:.-]{20,4096}$/.test(token)) throw new HttpError(400, 'PUSH_TOKEN_INVALID');
  return token;
}
export async function register(ctx) {
  const user = await requireUser(ctx); await ctx.limit('sensitive', user.id);
  const b = await readJson(ctx.request);
  if (!['ios', 'android'].includes(b.platform)) throw new HttpError(400, 'PUSH_PLATFORM_INVALID');
  await ctx.sb.user.rpc(user.accessToken, 'push_register', {p_token: deviceToken(b.token), p_platform: b.platform});
  return json(ctx.request, ctx.cfg, 200, {state: 'REGISTERED'}, {cookies: ctx.outCookies});
}
export async function remove(ctx) {
  const user = await requireUser(ctx); await ctx.limit('sensitive', user.id);
  const b = await readJson(ctx.request);
  await ctx.sb.user.rpc(user.accessToken, 'push_remove', {p_token: deviceToken(b.token)});
  return json(ctx.request, ctx.cfg, 200, {state: 'REMOVED'}, {cookies: ctx.outCookies});
}
const encode = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const part = value => encode(new TextEncoder().encode(JSON.stringify(value)));
// OAuth JWT assertion; Tokens nur in diesem Isolate, nie in Logs oder Antworten.
export function createFcm({secret, fetchImpl = fetch, now = Date.now}) {
  let cached = null;
  return {
    configured: Boolean(secret),
    async send(token, count) {
      const account = JSON.parse(secret);
      if (!/^[a-z0-9-]+$/.test(account.project_id) || !account.client_email || !account.private_key) throw Error('FCM_CONFIG_INVALID');
      if (!cached || cached.until < now()) {
        const seconds = Math.floor(now()/1000);
        const unsigned = part({alg:'RS256',typ:'JWT'})+'.'+part({iss:account.client_email,
          scope:'https://www.googleapis.com/auth/firebase.messaging', aud:'https://oauth2.googleapis.com/token',iat:seconds,exp:seconds+3600});
        const der = Uint8Array.from(atob(account.private_key.replace(/-----[^-]+-----|\s/g,'')), c=>c.charCodeAt(0));
        const key = await crypto.subtle.importKey('pkcs8',der,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
        const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(unsigned));
        const res = await fetchImpl('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
          body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:unsigned+'.'+encode(new Uint8Array(signature))}).toString()});
        if (!res.ok) throw Error('FCM_AUTH_FAILED');
        const data = await res.json();
        if (!data.access_token) throw Error('FCM_AUTH_FAILED');
        cached = {token:data.access_token,until:now()+Math.min(Number(data.expires_in)||3600,3600)*1000-60000};
      }
      const res = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,{
        method:'POST', headers:{Authorization:`Bearer ${cached.token}`,'Content-Type':'application/json'},
        body:JSON.stringify({message:{token,notification:{title:'Watchlist · Tagesübersicht',
          body:`${count} neue Regelereignisse in der persönlichen Watchlist. Details und Datenstand in der App.`},
          android:{ttl:'86400s',collapse_key:'watchlist-daily'},apns:{headers:{'apns-collapse-id':'watchlist-daily','apns-expiration':String(Math.floor(now()/1000)+86400)}}}})});
      if (!res.ok) throw Error('FCM_SEND_FAILED');
    },
  };
}
const TYPES = {PRICE_EVENT:['NEW_52W_HIGH','VOLUME_SPIKE'], SUPERTRADER_SIGNAL:['VALID_SIGNAL','VALID_SIGNAL_ENDED','STATE_CHANGED'],
  QUANT_CHANGE:['FACTOR_BAND_UP','FACTOR_BAND_DOWN','DATA_QUALITY_CHANGED']};
export function deliverableEvents(doc, now) {
  if (doc?.ruleVersion !== 'watchlist-events-1.1.0' || !Array.isArray(doc.events) || doc.events.length>5000) return [];
  return doc.events.filter(e => /^ev_[a-f0-9]{16}$/.test(e.eventId) && /^vu_[a-f0-9]{6,32}$/.test(e.instrumentId) &&
    e.source?.ruleVersion === doc.ruleVersion && TYPES[e.type]?.includes(e.subtype) &&
    Date.parse(e.occurredAt)<=now && Date.parse(e.occurredAt)>now-86400000 && (!e.expiresAt || Date.parse(e.expiresAt)>now));
}
export async function runPush({fcm, service, fetchImpl = fetch, now = Date.now}) {
  if (!fcm.configured) return {skipped:'FCM_NOT_CONFIGURED'};
  // Fester vertrauenswuerdiger Ort, keine Client-Ereignisse oder beliebigen URLs.
  const response = await fetchImpl('https://research.visionuniverse.de/core/data/watchlist-events-v1.json');
  if (!response.ok) return {skipped:'EVENTS_UNAVAILABLE'};
  const events = deliverableEvents(await response.json(), now());
  if (!events.length) return {skipped:'NO_EVENTS'};
  const claims = await service.rpc('push_claim_daily', {p_events:events});
  let sent=0,failed=0;
  for (const claim of claims || []) {
    try { await fcm.send(claim.token,claim.count); sent++; } catch { failed++; }
  }
  return {sent,failed};
}
