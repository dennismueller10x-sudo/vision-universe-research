// Sitzung und Anmeldung (Backend-for-Frontend).
//
// Der Browser sieht nie ein Token: Zugriffs- und Erneuerungstoken liegen in
// HttpOnly-Cookies des API-Hosts (__Host-, Secure, SameSite=Lax). Apps
// (spaeter) melden sich direkt bei Supabase an und schicken
// "Authorization: Bearer <JWT>" - beides prueft resolveSession gleich.

import {HttpError, json, redirect, cookie, clearCookie, cookieValue, readJson} from './http.mjs';
import {verifyAccessToken, JwtError} from './jwt.mjs';
import {pkcePair} from './crypto.mjs';
import {SupabaseError} from './supabase.mjs';
import {SITE_PATHS} from './config.mjs';
import * as v from './validate.mjs';

const AT = 'vu_at', RT = 'vu_rt', PKCE = 'vu_pkce';

function sessionCookies(ctx, session) {
  const ttl = Math.min(Number(session.expires_in) || 3600, 3600);
  return [cookie(ctx.cfg, AT, session.access_token, ttl), cookie(ctx.cfg, RT, session.refresh_token, ctx.cfg.cookies.refreshMaxAge)];
}
const clearSession = ctx => [clearCookie(ctx.cfg, AT), clearCookie(ctx.cfg, RT)];

function userFromClaims(claims, accessToken) {
  return {id: claims.sub, email: claims.email || null, amr: Array.isArray(claims.amr) ? claims.amr : [], accessToken,
    sessionId: claims.session_id || null};
}

async function verify(ctx, token) {
  return verifyAccessToken(token, {jwks: ctx.jwks, legacySecret: ctx.cfg.supabase.legacyJwtSecret,
    issuer: ctx.cfg.supabase.jwtIssuer, now: ctx.now()});
}

// Liefert den angemeldeten Nutzer oder null. Erneuert abgelaufene Cookie-
// Sitzungen still und haengt die neuen Cookies an ctx.outCookies.
export async function resolveSession(ctx) {
  const header = ctx.request.headers.get('Authorization') || '';
  if (header.startsWith('Bearer ')) {
    try { return {...userFromClaims(await verify(ctx, header.slice(7)), header.slice(7)), bearer: true}; }
    catch (e) { if (e instanceof JwtError) throw new HttpError(401, 'TOKEN_INVALID'); throw e; }
  }
  const at = cookieValue(ctx.cfg, ctx.cookies, AT);
  if (at) {
    try { return {...userFromClaims(await verify(ctx, at), at), bearer: false}; }
    catch (e) { if (!(e instanceof JwtError)) throw e; }
  }
  const rt = cookieValue(ctx.cfg, ctx.cookies, RT);
  if (!rt) return null;
  try {
    const session = await ctx.sb.auth.refresh({refreshToken: rt, ip: ctx.ip});
    ctx.outCookies.push(...sessionCookies(ctx, session));
    return {...userFromClaims(await verify(ctx, session.access_token), session.access_token), bearer: false};
  } catch (e) {
    if (e instanceof SupabaseError && e.status < 500) { ctx.outCookies.push(...clearSession(ctx)); return null; }
    throw e;
  }
}

export async function requireUser(ctx) {
  const user = await resolveSession(ctx);
  if (!user) throw new HttpError(401, 'NOT_AUTHENTICATED');
  return user;
}

const publicUser = u => ({id: u.id, email: u.email});

export async function session(ctx) {
  const user = await resolveSession(ctx);
  return json(ctx.request, ctx.cfg, 200, user ? {authenticated: true, user: publicUser(user)} : {authenticated: false},
    {cookies: ctx.outCookies});
}

export async function login(ctx) {
  const body = await readJson(ctx.request);
  const email = v.email(body.email);
  await ctx.limit('login', ctx.ip || email);
  const password = String(body.password || '');
  if (!password || password.length > 200) throw new HttpError(400, 'PASSWORD_REQUIRED');
  let result;
  try { result = await ctx.sb.auth.signInWithPassword({email, password, ip: ctx.ip}); }
  catch (e) {
    if (e instanceof SupabaseError && e.code === 'email_not_confirmed') throw new HttpError(403, 'EMAIL_NOT_CONFIRMED');
    if (e instanceof SupabaseError && e.status === 429) throw new HttpError(429, 'RATE_LIMITED');
    if (e instanceof SupabaseError && e.status < 500) throw new HttpError(401, 'INVALID_CREDENTIALS');
    throw e;
  }
  const claims = await verify(ctx, result.access_token);
  return json(ctx.request, ctx.cfg, 200, {authenticated: true, user: publicUser(userFromClaims(claims))},
    {cookies: sessionCookies(ctx, result)});
}

export async function logout(ctx) {
  const user = await resolveSession(ctx).catch(() => null);
  if (user) await ctx.sb.auth.logout({accessToken: user.accessToken, ip: ctx.ip}).catch(() => {});
  return json(ctx.request, ctx.cfg, 200, {authenticated: false}, {cookies: clearSession(ctx)});
}

// Registrierung ist standardmaessig GESCHLOSSEN (VU_REGISTRATION_ENABLED).
// Fuer Tests im Entwicklungsprojekt: VU_REGISTRATION_ALLOWLIST.
export async function signup(ctx) {
  const body = await readJson(ctx.request);
  const email = v.email(body.email);
  const {enabled, allowlist} = ctx.cfg.registration;
  if (!enabled && !allowlist.has(email)) throw new HttpError(403, 'REGISTRATION_CLOSED');
  await ctx.limit('signup', ctx.ip || email);
  const password = v.password(body.password);
  if (body.acceptTerms !== true) throw new HttpError(400, 'TERMS_REQUIRED');
  const {verifier, challenge} = await pkcePair();
  try {
    await ctx.sb.auth.signUp({email, password, ip: ctx.ip, codeChallenge: challenge,
      redirectTo: ctx.cfg.apiOrigin + '/v1/auth/callback?flow=signup',
      data: {display_name: v.displayName(body.displayName), terms_accepted_at: new Date(ctx.now()).toISOString(),
        terms_version: String(body.termsVersion || '').slice(0, 20) || null}});
  } catch (e) {
    if (e instanceof SupabaseError && e.status === 429) throw new HttpError(429, 'RATE_LIMITED');
    if (e instanceof SupabaseError && e.code === 'weak_password') throw new HttpError(400, 'PASSWORD_WEAK');
    if (e instanceof SupabaseError && e.code === 'signup_disabled') throw new HttpError(403, 'REGISTRATION_CLOSED');
    // Bestehende Adresse: Supabase antwortet bei aktiver Bestaetigung absichtlich gleich.
    if (!(e instanceof SupabaseError && e.status < 500)) throw e;
  }
  return json(ctx.request, ctx.cfg, 202, {state: 'CHECK_EMAIL'}, {cookies: [cookie(ctx.cfg, PKCE, verifier, 3600)]});
}

export async function recover(ctx) {
  const body = await readJson(ctx.request);
  const email = v.email(body.email);
  await ctx.limit('recover', ctx.ip || email);
  const {verifier, challenge} = await pkcePair();
  try {
    await ctx.sb.auth.recover({email, codeChallenge: challenge, ip: ctx.ip,
      redirectTo: ctx.cfg.apiOrigin + '/v1/auth/callback?flow=recovery'});
  } catch (e) {
    if (e instanceof SupabaseError && e.status === 429) throw new HttpError(429, 'RATE_LIMITED');
    if (!(e instanceof SupabaseError && e.status < 500)) throw e;
  }
  // Immer gleich - verraet nicht, ob es das Konto gibt.
  return json(ctx.request, ctx.cfg, 202, {state: 'CHECK_EMAIL'}, {cookies: [cookie(ctx.cfg, PKCE, verifier, 3600)]});
}

// Ziel der Links aus Bestaetigungs- und Ruecksetz-E-Mail. Leitet nur auf feste
// Pfade der eigenen Seite weiter (kein offener Redirect).
export async function callback(ctx) {
  const url = new URL(ctx.request.url);
  const flow = url.searchParams.get('flow') === 'recovery' ? 'recovery' : 'signup';
  const code = url.searchParams.get('code') || '';
  const site = path => ctx.cfg.siteOrigin + path;
  const fail = status => redirect(site((flow === 'recovery' ? '/konto/passwort/' : SITE_PATHS.login) + '?status=' + status),
    {cookies: [clearCookie(ctx.cfg, PKCE)]});
  if (!/^[A-Za-z0-9-]{8,128}$/.test(code)) return fail('link_invalid');
  const verifier = cookieValue(ctx.cfg, ctx.cookies, PKCE);
  // Link auf einem anderen Geraet geoeffnet: Die Adresse ist trotzdem bestaetigt.
  if (!verifier) return fail(flow === 'signup' ? 'verified_other_device' : 'link_other_device');
  let result;
  try { result = await ctx.sb.auth.exchangeCode({authCode: code, codeVerifier: verifier, ip: ctx.ip}); }
  catch (e) { if (e instanceof SupabaseError && e.status < 500) return fail('link_expired'); throw e; }
  const target = flow === 'recovery' ? SITE_PATHS.newPassword : SITE_PATHS.account + '?status=verified';
  return redirect(site(target), {cookies: [...sessionCookies(ctx, result), clearCookie(ctx.cfg, PKCE)]});
}

const RECOVERY_WINDOW_SEC = 15 * 60;

export async function changePassword(ctx) {
  const user = await requireUser(ctx);
  await ctx.limit('sensitive', user.id);
  const body = await readJson(ctx.request);
  const password = v.password(body.password);
  const recovery = user.amr.some(a => a.method === 'recovery' && ctx.now() / 1000 - Number(a.timestamp) < RECOVERY_WINDOW_SEC);
  if (!recovery) await reauthenticate(ctx, user, body.currentPassword);
  try { await ctx.sb.auth.updatePassword({accessToken: user.accessToken, password, ip: ctx.ip}); }
  catch (e) {
    if (e instanceof SupabaseError && e.code === 'same_password') throw new HttpError(400, 'PASSWORD_UNCHANGED');
    if (e instanceof SupabaseError && e.code === 'weak_password') throw new HttpError(400, 'PASSWORD_WEAK');
    if (e instanceof SupabaseError && e.code === 'reauthentication_needed') throw new HttpError(403, 'REAUTHENTICATION_REQUIRED');
    throw e;
  }
  return json(ctx.request, ctx.cfg, 200, {state: 'PASSWORD_CHANGED'}, {cookies: ctx.outCookies});
}

// Bestaetigt das aktuelle Passwort (vor Passwortwechsel und Kontoloeschung).
export async function reauthenticate(ctx, user, currentPassword) {
  if (!user.email) throw new HttpError(403, 'REAUTHENTICATION_REQUIRED');
  const pw = String(currentPassword || '');
  if (!pw || pw.length > 200) throw new HttpError(403, 'REAUTHENTICATION_REQUIRED');
  try {
    const result = await ctx.sb.auth.signInWithPassword({email: user.email, password: pw, ip: ctx.ip});
    if (!user.bearer) ctx.outCookies.push(...sessionCookies(ctx, result));
    user.accessToken = result.access_token;
  } catch (e) {
    if (e instanceof SupabaseError && e.status < 500) throw new HttpError(403, 'CURRENT_PASSWORD_INVALID');
    throw e;
  }
}

export {clearSession};
