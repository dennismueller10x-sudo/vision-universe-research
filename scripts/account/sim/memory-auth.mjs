// Supabase Auth im Arbeitsspeicher (ohne PostgreSQL): Passwort-Grant,
// Refresh-Rotation mit Wiederverwendungserkennung wie GoTrue, Logout
// (scope=local) und JWKS mit echtem ES256. Fuer Einheitstests des Workers
// (workers/vu-account/tests/unit.test.mjs) und den App-Test gegen den echten
// Worker (app/tests/worker-route.test.mjs). Kein Netzwerk.
import {randomUUID} from 'node:crypto';
import {createApp} from '../../../workers/vu-account/src/index.mjs';
import {LOCAL_KEYS} from './fake-supabase.mjs';

const b64url = v => Buffer.from(typeof v === 'string' ? v : new Uint8Array(v)).toString('base64url');
export const MEMORY_SUPABASE = 'http://supabase.memory';
export const MEMORY_API = 'https://account.memory';

export async function createMemoryAuth({now = () => Date.now(), users = {}} = {}) {
  const keyPair = await crypto.subtle.generateKey({name: 'ECDSA', namedCurve: 'P-256'}, true, ['sign', 'verify']);
  const jwk = {...(await crypto.subtle.exportKey('jwk', keyPair.publicKey)), kid: 'mem-es256', alg: 'ES256', use: 'sig'};
  const issuer = MEMORY_SUPABASE + '/auth/v1';
  const accounts = new Map(Object.entries(users).map(([email, u]) => [email, {id: randomUUID(), confirmed: true, ...u}]));
  const refreshTokens = new Map(); // token -> {userId, email, sessionId}
  const used = new Map();          // rotiertes Token -> sessionId
  const calls = [];
  const reply = (status, body) => new Response(body === null ? null : JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
  const authError = (status, code) => reply(status, {error_code: code, msg: code});

  async function sign(claims) {
    const h = b64url(JSON.stringify({alg: 'ES256', typ: 'JWT', kid: jwk.kid})), p = b64url(JSON.stringify(claims));
    const s = await crypto.subtle.sign({name: 'ECDSA', hash: 'SHA-256'}, keyPair.privateKey, Buffer.from(`${h}.${p}`));
    return `${h}.${p}.${b64url(s)}`;
  }
  async function claimsOf(token) {
    const [h, p, s] = String(token || '').split('.');
    if (!s) return null;
    const ok = await crypto.subtle.verify({name: 'ECDSA', hash: 'SHA-256'}, keyPair.publicKey, Buffer.from(s, 'base64url'), Buffer.from(`${h}.${p}`));
    return ok ? JSON.parse(Buffer.from(p, 'base64url').toString()) : null;
  }
  async function issue(userId, email, sessionId = randomUUID()) {
    const iat = Math.floor(now() / 1000);
    const access = await sign({iss: issuer, aud: 'authenticated', role: 'authenticated', sub: userId, email, iat, exp: iat + 3600,
      session_id: sessionId, amr: [{method: 'password', timestamp: iat}], aal: 'aal1', is_anonymous: false});
    const refresh = b64url(crypto.getRandomValues(new Uint8Array(24)));
    refreshTokens.set(refresh, {userId, email, sessionId});
    return {access_token: access, token_type: 'bearer', expires_in: 3600, refresh_token: refresh, user: {id: userId, email}};
  }
  const revokeSession = sessionId => { for (const [t, e] of refreshTokens) if (e.sessionId === sessionId) refreshTokens.delete(t); };

  async function handle(req) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/auth\/v1/, '');
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    calls.push({path, grant: url.searchParams.get('grant_type'), headers: Object.fromEntries(req.headers)});
    if (path === '/.well-known/jwks.json') return reply(200, {keys: [jwk]});
    if (path === '/token' && url.searchParams.get('grant_type') === 'password') {
      const a = accounts.get(String(body.email || '').toLowerCase());
      if (!a || a.password !== body.password) return authError(400, 'invalid_credentials');
      if (!a.confirmed) return authError(400, 'email_not_confirmed');
      return reply(200, await issue(a.id, String(body.email).toLowerCase()));
    }
    if (path === '/token' && url.searchParams.get('grant_type') === 'refresh_token') {
      const reused = used.get(body.refresh_token);
      if (reused) { revokeSession(reused); return authError(400, 'refresh_token_already_used'); }
      const entry = refreshTokens.get(body.refresh_token);
      if (!entry) return authError(400, 'refresh_token_not_found');
      refreshTokens.delete(body.refresh_token);
      used.set(body.refresh_token, entry.sessionId);
      return reply(200, await issue(entry.userId, entry.email, entry.sessionId));
    }
    if (path === '/logout' && req.method === 'POST') {
      const claims = await claimsOf((req.headers.get('Authorization') || '').slice(7));
      if (!claims) return authError(401, 'bad_jwt');
      revokeSession(claims.session_id);
      return reply(204, null);
    }
    return authError(404, 'not_found');
  }

  const fetchImpl = async (input, init) => {
    const req = input instanceof Request ? input : new Request(input, init);
    if (req.url.startsWith(MEMORY_SUPABASE)) return handle(req);
    throw new Error('NETZWERK_IN_SIMULATION_VERBOTEN ' + req.url);
  };
  const env = {VU_ENVIRONMENT: 'development', VU_SITE_ORIGIN: 'https://research.memory', VU_ACCOUNT_API_ORIGIN: MEMORY_API,
    SUPABASE_URL: MEMORY_SUPABASE, SUPABASE_PUBLISHABLE_KEY: LOCAL_KEYS.publishable, SUPABASE_SECRET_KEY: LOCAL_KEYS.secret};
  return {fetchImpl, env, calls, accounts, activeRefreshTokens: () => [...refreshTokens.keys()], sign, issuer};
}

// Worker vu-account gegen das Speicher-Supabase; Protokoll wird mitgeschrieben.
export async function createMemoryWorker({now = () => Date.now(), users, envOverrides = {}, limiterBinding} = {}) {
  const auth = await createMemoryAuth({now, users});
  const logs = [];
  const app = createApp({env: {...auth.env, ...envOverrides, ...(limiterBinding ? {VU_ACCOUNT_LIMITER: limiterBinding} : {})},
    fetchImpl: auth.fetchImpl, now, log: (level, message, fields) => logs.push({level, message, ...fields})});
  return {app, auth, logs, api: MEMORY_API};
}
