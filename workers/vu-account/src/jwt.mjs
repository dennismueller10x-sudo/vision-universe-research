// Pruefung der Supabase-Zugriffstoken im Worker (ohne Bibliothek).
// Gehostete Supabase-Projekte signieren asymmetrisch (ES256/RS256) und
// veroeffentlichen die Schluessel unter /auth/v1/.well-known/jwks.json.
// HS256 nur mit ausdruecklich gesetztem Legacy-Geheimnis (lokale Instanz).

import {base64UrlDecode, timingSafeEqual, base64UrlEncode} from './crypto.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALGS = {
  ES256: {import: {name: 'ECDSA', namedCurve: 'P-256'}, verify: {name: 'ECDSA', hash: 'SHA-256'}},
  RS256: {import: {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, verify: {name: 'RSASSA-PKCS1-v1_5'}},
};

export class JwtError extends Error {}

export function createJwksCache({url, fetchImpl, ttlMs = 10 * 60 * 1000, now = () => Date.now()}) {
  let keys = null, fetchedAt = 0, lastMiss = 0;
  async function load() {
    const res = await fetchImpl(url, {headers: {Accept: 'application/json'}});
    if (!res.ok) throw new JwtError('JWKS_UNAVAILABLE');
    const body = await res.json();
    keys = new Map();
    for (const jwk of body.keys || []) if (jwk.kid && ALGS[jwk.alg]) keys.set(jwk.kid, jwk);
    fetchedAt = now();
  }
  return {
    async get(kid) {
      if (!keys || now() - fetchedAt > ttlMs) await load();
      if (!keys.has(kid) && now() - lastMiss > 60_000) { lastMiss = now(); await load(); } // Schluesselwechsel
      return keys.get(kid) || null;
    },
  };
}

const importCache = new Map();
async function importJwk(jwk) {
  const id = jwk.kid + ':' + (jwk.x || jwk.n || '');
  if (!importCache.has(id)) {
    const {kty, crv, x, y, n, e} = jwk;
    importCache.set(id, crypto.subtle.importKey('jwk', {kty, crv, x, y, n, e, ext: true}, ALGS[jwk.alg].import, false, ['verify']));
  }
  return importCache.get(id);
}

export async function verifyAccessToken(token, {jwks, legacySecret, issuer, audience = 'authenticated', now = Date.now(), leewaySec = 30}) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new JwtError('TOKEN_MALFORMED');
  let header, claims;
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
  } catch { throw new JwtError('TOKEN_MALFORMED'); }
  const signed = new TextEncoder().encode(parts[0] + '.' + parts[1]);
  const signature = base64UrlDecode(parts[2]);

  if (header.alg === 'HS256') {
    if (!legacySecret) throw new JwtError('ALG_NOT_ALLOWED');
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(legacySecret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
    const expected = base64UrlEncode(await crypto.subtle.sign('HMAC', key, signed));
    if (!timingSafeEqual(expected, parts[2])) throw new JwtError('SIGNATURE_INVALID');
  } else if (ALGS[header.alg]) {
    if (!jwks) throw new JwtError('JWKS_NOT_CONFIGURED');
    const jwk = await jwks.get(header.kid);
    if (!jwk || jwk.alg !== header.alg) throw new JwtError('KEY_UNKNOWN');
    const ok = await crypto.subtle.verify(ALGS[header.alg].verify, await importJwk(jwk), signature, signed);
    if (!ok) throw new JwtError('SIGNATURE_INVALID');
  } else {
    throw new JwtError('ALG_NOT_ALLOWED'); // auch "none"
  }

  const t = Math.floor(now / 1000);
  if (typeof claims.exp !== 'number' || claims.exp + leewaySec < t) throw new JwtError('TOKEN_EXPIRED');
  if (typeof claims.nbf === 'number' && claims.nbf - leewaySec > t) throw new JwtError('TOKEN_NOT_YET_VALID');
  if (issuer && claims.iss !== issuer) throw new JwtError('ISSUER_INVALID');
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(audience)) throw new JwtError('AUDIENCE_INVALID');
  if (claims.role !== 'authenticated') throw new JwtError('ROLE_INVALID');
  if (!UUID.test(String(claims.sub || ''))) throw new JwtError('SUBJECT_INVALID');
  if (claims.is_anonymous === true) throw new JwtError('ANONYMOUS_NOT_ALLOWED');
  return claims;
}
