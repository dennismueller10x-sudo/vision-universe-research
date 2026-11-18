import {HttpError, json, readJson} from './http.mjs';
import {requireUser} from './auth.mjs';
import {SF_INDEX_URL, stageEvents, noticeMessage, forClaim, RESEARCH} from './st-notices.mjs';
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
    // message: {title, body} fuer genau eine Stufen-Meldung (st-notices.mjs#noticeMessage), sonst die Tagesuebersicht.
    async send(token, count, message = null) {
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
        body:JSON.stringify({message:{token,notification:message || {title:'Watchlist · Tagesübersicht',
          body:`${count} neue Regelereignisse in der persönlichen Watchlist. Details und Datenstand in der App.`},
          android:{ttl:'86400s',collapse_key:'watchlist-daily'},apns:{headers:{'apns-collapse-id':'watchlist-daily','apns-expiration':String(Math.floor(now()/1000)+86400)}}}})});
      if (!res.ok) throw Error('FCM_SEND_FAILED');
    },
  };
}
const TYPES = {PRICE_EVENT:['NEW_52W_HIGH','VOLUME_SPIKE'], PRICE_MOVE:['DAILY_UP_5','DAILY_DOWN_5'], EARNINGS:['QUARTERLY_REPORT','ANNUAL_REPORT'], FUND_13F:['NEW_POSITION'], ELLIOTT_CHANGE:['READING_CHANGED','WAVE_CONFIRMED'], SUPERTRADER_SIGNAL:['VALID_SIGNAL','VALID_SIGNAL_ENDED','STATE_CHANGED'],
  QUANT_CHANGE:['FACTOR_BAND_UP','FACTOR_BAND_DOWN','DATA_QUALITY_CHANGED']};
export function deliverableEvents(doc, now) {
  if (doc?.ruleVersion !== 'watchlist-events-1.5.0' || !Array.isArray(doc.events) || doc.events.length>5000) return [];
  return doc.events.filter(e => /^ev_[a-f0-9]{16}$/.test(e.eventId) && /^vu_[a-f0-9]{6,32}$/.test(e.instrumentId) &&
    e.source?.ruleVersion === doc.ruleVersion && TYPES[e.type]?.includes(e.subtype) &&
    Date.parse(e.occurredAt)<=now && Date.parse(e.occurredAt)>now-86400000 && (!e.expiresAt || Date.parse(e.expiresAt)>now));
}
// Stufen-Meldungen der Supertrader-Methoden aus dem veroeffentlichten Kandidatenstand (fester Ort, nur lesen).
// occurredAt = erster Blick des Workers auf diesen Stand (supertrader_stage_seen): dasselbe 24-Stunden-Fenster wie
// die Watchlist-Ereignisse, ein alter Stand kommt nicht jeden Tag wieder. Fehler: keine Stufen-Meldungen, nichts sonst.
export async function stageNotices({service, fetchImpl = fetch, now = Date.now}) {
  try {
    const res = await fetchImpl(SF_INDEX_URL);
    if (!res.ok) return [];
    // Erst den Stand aus dem Dateikopf lesen; das ganze Dokument nur parsen, solange er frisch ist (Rechenzeit je Cron-Lauf).
    const raw = await res.text(), asOf = /^\{"schema":"[^"]*","asOf":"(\d{4}-\d{2}-\d{2})"/.exec(raw.slice(0, 200));
    if (!asOf) return [];
    const seen = Date.parse(await service.rpc('supertrader_stage_seen', {p_as_of: asOf[1]}));
    if (!Number.isFinite(seen) || seen > now() || seen <= now() - 86400000) return [];
    const events = stageEvents(JSON.parse(raw));
    if (!events.length || events[0].asOf !== asOf[1]) return [];
    const occurredAt = new Date(seen).toISOString();
    return events.map(e => ({...e, occurredAt}));
  } catch { return []; }
}
// Tagesuebersicht, wenn mehr als eine Meldung zusammenkommt; mit einer Stufen-Meldung darin der Forschungshinweis.
export function digestMessage(count, withStage) {
  return {title: 'Watchlist · Tagesübersicht', body: `${count} neue Regelereignisse in Watchlist und gefolgten Methoden. Details und Datenstand in der App.`
    + (withStage ? ` Supertrader: ${RESEARCH}.` : '')};
}
// stageAlerts: Supertrader-Stufen-Meldungen mitsenden (cfg.supertraderAlerts.enabled). Aus (Standard bis zur
// Anwaltspruefung): weder Kandidatenstand noch supertrader_stage_seen werden gelesen, nur die Watchlist-Ereignisse wie bisher.
export async function runPush({fcm, service, fetchImpl = fetch, now = Date.now, stageAlerts = false}) {
  if (!fcm.configured) return {skipped:'FCM_NOT_CONFIGURED'};
  // Fester vertrauenswuerdiger Ort, keine Client-Ereignisse oder beliebigen URLs.
  const response = await fetchImpl('https://research.visionuniverse.de/core/data/watchlist-events-v1.json');
  const events = response.ok ? deliverableEvents(await response.json(), now()) : [];
  const stage = stageAlerts === true ? await stageNotices({service, fetchImpl, now}) : [];
  if (!response.ok && !stage.length) return {skipped:'EVENTS_UNAVAILABLE'};
  const all = events.concat(stage.map(forClaim)).slice(0, 5000);
  if (!all.length) return {skipped:'NO_EVENTS'};
  const claims = await service.rpc('push_claim_daily', {p_events:all});
  const byId = new Map(stage.map(e => [e.eventId, e]));
  let sent=0,failed=0;
  for (const claim of claims || []) {
    const ids = Array.isArray(claim.ids) ? claim.ids : [], one = claim.count === 1 ? byId.get(ids[0]) : null;
    const message = one ? noticeMessage(one) : Number(claim.stage) > 0 || ids.some(id => byId.has(id)) ? digestMessage(claim.count, true) : null;
    try { await fcm.send(claim.token,claim.count,message); sent++; } catch { failed++; }
  }
  return {sent,failed};
}
