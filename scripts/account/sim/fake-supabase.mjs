// Simuliertes Supabase fuer Tests und lokale Entwicklung (nie produktiv).
//
//   Auth   Registrierung, Bestaetigung per E-Mail-Link (PKCE), Login, Refresh mit
//          Rotation, Passwort-Reset, Logout, Admin-Loeschung. Zugriffstoken sind
//          echte ES256-JWTs, Schluessel unter /auth/v1/.well-known/jwks.json.
//          E-Mails landen im Postfach `outbox`.
//   REST   Die PostgREST-Teilmenge, die der Worker nutzt (GET/PATCH auf
//          Tabellen mit eq/is-Filtern, order, limit; POST rpc). Ausgefuehrt im
//          ECHTEN PostgreSQL mit Rolle und Claims der Anfrage - RLS, Rechte,
//          Trigger und billing_*-Funktionen sind also die echten.
import {webcrypto as crypto, createHash, randomUUID} from 'node:crypto';
import {PgError} from './pg.mjs';

const b64url = buf => Buffer.from(buf).toString('base64url');
const IDENT = /^[a-z_][a-z0-9_]{0,62}$/;

export const LOCAL_KEYS = Object.freeze({publishable: 'sb_publishable_local_simulation', secret: 'sb_secret_local_simulation'});

export async function createFakeSupabase({baseUrl, pg, now = () => Date.now()}) {
  const keyPair = await crypto.subtle.generateKey({name: 'ECDSA', namedCurve: 'P-256'}, true, ['sign', 'verify']);
  const publicJwk = {...(await crypto.subtle.exportKey('jwk', keyPair.publicKey)), kid: 'sim-es256', alg: 'ES256', use: 'sig'};
  const issuer = baseUrl + '/auth/v1';
  const passwords = new Map();      // userId -> sha256(password)
  const refreshTokens = new Map();  // token -> {userId, sessionId, amr}
  const oneTimeTokens = new Map();  // token -> {userId, type, challenge}
  const authCodes = new Map();      // code -> {userId, challenge, method}
  const outbox = [];
  const hash = s => createHash('sha256').update(String(s)).digest('hex');

  async function sign(claims) {
    const header = b64url(JSON.stringify({alg: 'ES256', typ: 'JWT', kid: publicJwk.kid}));
    const payload = b64url(JSON.stringify(claims));
    const sig = await crypto.subtle.sign({name: 'ECDSA', hash: 'SHA-256'}, keyPair.privateKey, Buffer.from(`${header}.${payload}`));
    return `${header}.${payload}.${b64url(sig)}`;
  }

  async function userById(id) {
    return (await pg.json(`select to_json(u) from (select id, email, email_confirmed_at, raw_user_meta_data from auth.users where id = :'id') u`, {id})) || null;
  }
  async function userByEmail(email) {
    return (await pg.json(`select to_json(u) from (select id, email, email_confirmed_at from auth.users where email = :'email') u`, {email})) || null;
  }

  async function issueSession(user, method, sessionId = randomUUID()) {
    const iat = Math.floor(now() / 1000);
    const amr = [{method, timestamp: iat}];
    const access = await sign({iss: issuer, aud: 'authenticated', role: 'authenticated', sub: user.id, email: user.email,
      iat, exp: iat + 3600, session_id: sessionId, amr, aal: 'aal1', is_anonymous: false});
    const refresh = b64url(crypto.getRandomValues(new Uint8Array(24)));
    refreshTokens.set(refresh, {userId: user.id, sessionId, amr: method});
    return {access_token: access, token_type: 'bearer', expires_in: 3600, refresh_token: refresh,
      user: {id: user.id, email: user.email}};
  }

  // Minimaler JWT-Leser fuer die REST-Simulation (die Pruefung macht PostgREST
  // in echt; hier genuegt die Signaturpruefung mit unserem Schluessel).
  async function claimsOf(token) {
    const [h, p, s] = String(token).split('.');
    if (!s) return null;
    const ok = await crypto.subtle.verify({name: 'ECDSA', hash: 'SHA-256'}, keyPair.publicKey, Buffer.from(s, 'base64url'), Buffer.from(`${h}.${p}`));
    const claims = ok ? JSON.parse(Buffer.from(p, 'base64url')) : null;
    return claims && claims.exp > now() / 1000 ? claims : null;
  }

  const reply = (status, body, headers = {}) => new Response(body === null ? null : JSON.stringify(body),
    {status, headers: {'Content-Type': 'application/json', ...headers}});
  const authError = (status, code, msg) => reply(status, {error_code: code, msg});

  function sendMail(to, type, token, redirectTo) {
    const link = `${baseUrl}/auth/v1/verify?token=${token}&type=${type}&redirect_to=${encodeURIComponent(redirectTo)}`;
    outbox.push({to, type, link, sentAt: new Date(now()).toISOString()});
  }

  async function handleAuth(req, url) {
    const path = url.pathname.slice('/auth/v1'.length);
    const apikey = req.headers.get('apikey');
    if (path === '/.well-known/jwks.json') return reply(200, {keys: [publicJwk]});
    if (path === '/verify' && req.method === 'GET') {
      const entry = oneTimeTokens.get(url.searchParams.get('token'));
      const redirectTo = url.searchParams.get('redirect_to') || '';
      oneTimeTokens.delete(url.searchParams.get('token'));
      if (!entry) return new Response(null, {status: 303, headers: {Location: `${redirectTo}${redirectTo.includes('?') ? '&' : '?'}error=access_denied&error_code=otp_expired`}});
      if (entry.type === 'signup') await pg.json(`update auth.users set email_confirmed_at = now() where id = :'id' returning to_json(id)`, {id: entry.userId});
      const code = randomUUID();
      authCodes.set(code, {userId: entry.userId, challenge: entry.challenge, method: entry.type === 'recovery' ? 'recovery' : 'otp'});
      return new Response(null, {status: 303, headers: {Location: `${redirectTo}${redirectTo.includes('?') ? '&' : '?'}code=${code}`}});
    }
    if (![LOCAL_KEYS.secret, LOCAL_KEYS.publishable].includes(apikey)) return authError(401, 'no_api_key', 'Invalid API key');
    const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await req.json().catch(() => ({}));
    const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');

    if (path === '/signup' && req.method === 'POST') {
      const email = String(body.email || '').toLowerCase();
      if (String(body.password || '').length < 10) return authError(422, 'weak_password', 'Password too weak');
      const existing = await userByEmail(email);
      if (existing) return reply(200, {id: randomUUID(), email, identities: []}); // keine Kontoauskunft
      const id = await pg.json(`insert into auth.users (email, raw_user_meta_data) values (:'email', :'meta'::jsonb) returning to_json(id)`,
        {email, meta: JSON.stringify(body.data || {})});
      passwords.set(id, hash(body.password));
      const token = b64url(crypto.getRandomValues(new Uint8Array(18)));
      oneTimeTokens.set(token, {userId: id, type: 'signup', challenge: body.code_challenge});
      sendMail(email, 'signup', token, url.searchParams.get('redirect_to'));
      return reply(200, {id, email});
    }
    if (path === '/recover' && req.method === 'POST') {
      const user = await userByEmail(String(body.email || '').toLowerCase());
      if (user) {
        const token = b64url(crypto.getRandomValues(new Uint8Array(18)));
        oneTimeTokens.set(token, {userId: user.id, type: 'recovery', challenge: body.code_challenge});
        sendMail(user.email, 'recovery', token, url.searchParams.get('redirect_to'));
      }
      return reply(200, {});
    }
    if (path === '/token' && req.method === 'POST') {
      const grant = url.searchParams.get('grant_type');
      if (grant === 'password') {
        const user = await userByEmail(String(body.email || '').toLowerCase());
        if (!user || passwords.get(user.id) !== hash(body.password)) return authError(400, 'invalid_credentials', 'Invalid login credentials');
        if (!user.email_confirmed_at) return authError(400, 'email_not_confirmed', 'Email not confirmed');
        return reply(200, await issueSession(user, 'password'));
      }
      if (grant === 'refresh_token') {
        const entry = refreshTokens.get(body.refresh_token);
        if (!entry) return authError(400, 'refresh_token_not_found', 'Invalid Refresh Token');
        refreshTokens.delete(body.refresh_token); // Rotation
        const user = await userById(entry.userId);
        if (!user) return authError(400, 'user_not_found', 'User not found');
        return reply(200, await issueSession(user, entry.amr, entry.sessionId));
      }
      if (grant === 'pkce') {
        const entry = authCodes.get(body.auth_code);
        authCodes.delete(body.auth_code);
        const challenge = createHash('sha256').update(String(body.code_verifier || '')).digest('base64url');
        if (!entry || entry.challenge !== challenge) return authError(400, 'bad_code_verifier', 'code challenge does not match');
        return reply(200, await issueSession(await userById(entry.userId), entry.method));
      }
      return authError(400, 'unsupported_grant_type', 'unsupported');
    }
    if (path === '/user' && req.method === 'GET') {
      const claims = await claimsOf(bearer);
      if (!claims) return authError(401, 'bad_jwt', 'invalid JWT');
      const u = await userById(claims.sub);
      return u ? reply(200, {id: u.id, email: u.email, user_metadata: u.raw_user_meta_data || {}}) : authError(404, 'user_not_found', 'User not found');
    }
    if (path === '/user' && req.method === 'PUT') {
      const claims = await claimsOf(bearer);
      if (!claims) return authError(401, 'bad_jwt', 'invalid JWT');
      // Wie GoTrue: "data" wird flach in user_metadata gemischt (null bleibt als Wert stehen).
      if (body.data && typeof body.data === 'object' && body.password === undefined) {
        await pg.json(`update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || :'meta'::jsonb where id = :'id' returning to_json(id)`,
          {id: claims.sub, meta: JSON.stringify(body.data)});
        const u = await userById(claims.sub);
        return reply(200, {id: u.id, email: u.email, user_metadata: u.raw_user_meta_data || {}});
      }
      if (passwords.get(claims.sub) === hash(body.password)) return authError(422, 'same_password', 'same password');
      passwords.set(claims.sub, hash(body.password));
      return reply(200, {id: claims.sub, email: claims.email});
    }
    if (path === '/logout' && req.method === 'POST') {
      const claims = await claimsOf(bearer);
      if (!claims) return authError(401, 'bad_jwt', 'invalid JWT');
      for (const [t, e] of refreshTokens) if (e.sessionId === claims.session_id) refreshTokens.delete(t);
      return reply(204, null);
    }
    const admin = path.match(/^\/admin\/users\/([0-9a-f-]{36})$/);
    if (admin && req.method === 'DELETE') {
      if (apikey !== LOCAL_KEYS.secret) return authError(403, 'not_admin', 'User not allowed');
      await pg.json(`delete from auth.users where id = :'id' returning to_json(id)`, {id: admin[1]});
      for (const [t, e] of refreshTokens) if (e.userId === admin[1]) refreshTokens.delete(t);
      passwords.delete(admin[1]);
      return reply(200, {});
    }
    return authError(404, 'not_found', 'not found');
  }

  // ------------------------------------------------------------------ REST
  const argTypes = new Map();
  async function functionArgs(fn) {
    if (!argTypes.has(fn)) {
      argTypes.set(fn, await pg.json(`select coalesce(json_agg(json_build_object('name', n, 'type', format_type(t, null)) order by o), '[]'::json)
        from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace,
        unnest(p.proargnames, p.proargtypes::oid[]) with ordinality as a(n, t, o)
        where ns.nspname = 'public' and p.proname = :'fn'`, {fn}));
    }
    return argTypes.get(fn);
  }

  function pgError(e) {
    if (!(e instanceof PgError)) throw e;
    const status = e.sqlstate === '42501' ? 403 : e.sqlstate === '23505' ? 409 : e.sqlstate === '42883' ? 404 : 400;
    return reply(status, {code: e.sqlstate, message: e.message});
  }

  async function roleOf(req) {
    const apikey = req.headers.get('apikey');
    const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
    if (apikey === LOCAL_KEYS.secret) return {role: 'service_role', claims: {role: 'service_role'}};
    if (apikey !== LOCAL_KEYS.publishable) return null;
    if (!bearer) return {role: 'anon', claims: {role: 'anon'}};
    const claims = await claimsOf(bearer);
    return claims ? {role: 'authenticated', claims} : 'expired';
  }

  function filters(params, vars) {
    const where = [];
    let i = 0;
    for (const [col, raw] of params) {
      if (['select', 'order', 'limit'].includes(col)) continue;
      if (!IDENT.test(col)) throw new PgError('42703', 'bad column');
      const m = raw.match(/^(eq|is)\.(.*)$/);
      if (!m) throw new PgError('22023', 'unsupported filter');
      if (m[1] === 'is') where.push(`${col} is ${m[2] === 'true' ? 'true' : m[2] === 'false' ? 'false' : 'null'}`);
      else { vars['f' + i] = m[2]; where.push(`${col}::text = :'f${i}'`); i++; }
    }
    return where.length ? ' where ' + where.join(' and ') : '';
  }

  async function handleRest(req, url) {
    const who = await roleOf(req);
    if (!who) return reply(401, {code: 'PGRST301', message: 'No API key'});
    if (who === 'expired') return reply(401, {code: 'PGRST301', message: 'JWT expired'});
    const path = url.pathname.slice('/rest/v1/'.length);
    try {
      if (path.startsWith('rpc/') && req.method === 'POST') {
        const fn = path.slice(4);
        if (!IDENT.test(fn)) return reply(404, {code: 'PGRST202', message: 'not found'});
        const args = await req.json().catch(() => ({}));
        const params = await functionArgs(fn);
        const call = params.filter(a => a.name in args).map(a => `${a.name} => (:'args'::jsonb -> '${a.name}' #>> '{}')::${a.type}`);
        for (const a of params) if (a.type === 'jsonb' && a.name in args) call[call.findIndex(c => c.startsWith(a.name + ' '))] = `${a.name} => (:'args'::jsonb -> '${a.name}')`;
        const result = await pg.json(`select coalesce(to_json(public.${fn}(${call.join(', ')})), 'null'::json)`,
          {args: JSON.stringify(args)}, who);
        return reply(200, result);
      }
      const table = path;
      if (!IDENT.test(table)) return reply(404, {code: 'PGRST205', message: 'not found'});
      const vars = {};
      const where = filters(url.searchParams, vars);
      if (req.method === 'GET') {
        let tail = '';
        const order = url.searchParams.get('order');
        if (order) {
          const [col, dir, nulls] = order.split('.');
          if (!IDENT.test(col)) throw new PgError('42703', 'bad order');
          tail += ` order by ${col} ${dir === 'desc' ? 'desc' : 'asc'}${nulls === 'nullslast' ? ' nulls last' : nulls === 'nullsfirst' ? ' nulls first' : ''}`;
        }
        const limit = Number(url.searchParams.get('limit'));
        if (limit > 0) tail += ` limit ${Math.min(1000, Math.floor(limit))}`;
        return reply(200, await pg.json(`select coalesce(json_agg(t), '[]'::json) from (select * from public.${table}${where}${tail}) t`, vars, who));
      }
      if (req.method === 'PATCH') {
        const body = await req.json();
        const cols = Object.keys(body);
        if (!cols.length || !cols.every(c => IDENT.test(c))) throw new PgError('42703', 'bad column');
        vars.body = JSON.stringify(body);
        const set = cols.map(c => `${c} = (json_populate_record(null::public.${table}, :'body'::json)).${c}`).join(', ');
        return reply(200, await pg.json(`with u as (update public.${table} set ${set}${where} returning *) select coalesce(json_agg(u), '[]'::json) from u`, vars, who));
      }
      return reply(405, {code: 'PGRST', message: 'method'});
    } catch (e) { return pgError(e); }
  }

  return {
    baseUrl, outbox, issuer,
    async handle(req) {
      const url = new URL(req.url);
      if (url.pathname.startsWith('/auth/v1/')) return handleAuth(req, url);
      if (url.pathname.startsWith('/rest/v1/')) return handleRest(req, url);
      return reply(404, {message: 'not found'});
    },
    lastMail: to => [...outbox].reverse().find(m => m.to === to) || null,
  };
}
