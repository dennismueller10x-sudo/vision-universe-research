// Gemeinsame Hilfen: simulierte Supabase- und Konto-API ohne Netz.
export function jwtLike(sub = 'u1') { return `t.${sub}.${Math.random().toString(36).slice(2)}`; }

export function fakeSupabase({expiresIn = 3600, rejectRefresh = false, down = false} = {}) {
  const calls = [];
  let n = 0;
  const impl = async (url, init = {}) => {
    calls.push({url, init, body: init.body ? JSON.parse(init.body) : null});
    if (down) throw new TypeError('network');
    const u = new URL(url);
    const reply = (status, data) => ({ok: status < 400, status, json: async () => data});
    if (u.pathname.endsWith('/auth/v1/token')) {
      const grant = u.searchParams.get('grant_type');
      if (grant === 'password') {
        const b = JSON.parse(init.body);
        if (b.password !== 'richtig') return reply(400, {error_code: 'invalid_credentials'});
        n++; return reply(200, {access_token: 'at' + n, refresh_token: 'rt' + n, expires_in: expiresIn, user: {id: 'u1', email: b.email}});
      }
      if (grant === 'refresh_token') {
        if (rejectRefresh) return reply(400, {error_code: 'refresh_token_not_found'});
        n++; return reply(200, {access_token: 'at' + n, refresh_token: 'rt' + n, expires_in: expiresIn, user: {id: 'u1', email: 'a@b.de'}});
      }
    }
    if (u.pathname.endsWith('/auth/v1/logout')) return reply(204, null);
    return reply(404, {});
  };
  impl.calls = calls; impl.setDown = v => { down = v; };
  return impl;
}

export const CONFIG = {supabaseUrl: 'https://x.supabase.co', supabasePublishableKey: 'sb_publishable_test', accountApi: 'https://api.test',
  contentOrigin: 'https://c.test', refreshMarginSeconds: 60, configured: true};

export function clock(start = 1_000_000) { let t = start; const f = () => t; f.advance = ms => { t += ms; }; return f; }
