// Anmeldung gegen Supabase Auth (GoTrue) mit Bearer-Token; derselbe Benutzer wie im Web.
// Die Konto-API (konto.visionuniverse.de) prueft das JWT bereits als "Authorization: Bearer" (workers/vu-account/src/auth.mjs).
// Fehlerarten werden getrennt: Offline ist KEINE Abmeldung, ein abgelehnter Refresh-Token schon.
export class AuthError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status || 0; }
}
export const OFFLINE = 'OFFLINE';

export function createAuth({config, store, fetchImpl = (...a) => globalThis.fetch(...a), now = Date.now}) {
  let session = null;      // im Arbeitsspeicher; Kopie liegt im sicheren Speicher
  let inflight = null;     // ein Refresh gleichzeitig (Refresh-Tokens werden rotiert)
  const listeners = new Set();
  const emit = () => listeners.forEach(fn => { try { fn(publicState()); } catch { /* Zuhoerer darf nichts brechen */ } });
  const publicState = () => ({signedIn: Boolean(session), user: session?.user || null});

  async function post(path, body, token) {
    const headers = {'Content-Type': 'application/json', apikey: config.supabasePublishableKey};
    if (token) headers.Authorization = `Bearer ${token}`;
    let res;
    try { res = await fetchImpl(`${config.supabaseUrl}/auth/v1/${path}`, {method: 'POST', headers, body: body ? JSON.stringify(body) : undefined}); }
    catch { throw new AuthError(OFFLINE); }
    let data = null;
    try { data = await res.json(); } catch { /* leere Antwort */ }
    if (!res.ok) throw new AuthError(String(data?.error_code || data?.code || 'AUTH_FAILED'), res.status);
    return data;
  }

  function toSession(d) {
    if (!d?.access_token || !d?.refresh_token) throw new AuthError('AUTH_RESPONSE_INVALID');
    const ttl = Number(d.expires_in) > 0 ? Number(d.expires_in) : 3600;
    return {accessToken: d.access_token, refreshToken: d.refresh_token, expiresAt: now() + ttl * 1000,
      user: {id: d.user?.id || null, email: d.user?.email || null}};
  }
  async function persist(s) { session = s; await store.set(s); emit(); }
  async function drop() { session = null; await store.clear(); emit(); }

  async function refresh() {
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const d = await post('token?grant_type=refresh_token', {refresh_token: session.refreshToken});
        await persist(toSession(d));
      } catch (e) {
        // Abgelehnt (4xx): Sitzung ist ungueltig -> abmelden. Offline/5xx: Sitzung behalten, spaeter erneut.
        if (e instanceof AuthError && e.status >= 400 && e.status < 500) await drop();
        throw e;
      } finally { inflight = null; }
    })();
    return inflight;
  }

  return {
    state: publicState,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async restore() {
      const saved = await store.get();
      if (!saved) return publicState();
      session = saved; emit();
      if (saved.expiresAt - now() < config.refreshMarginSeconds * 1000) await refresh().catch(() => {});
      return publicState();
    },
    async signIn(email, password) {
      if (!config.configured) throw new AuthError('NOT_CONFIGURED');
      const d = await post('token?grant_type=password', {email: String(email || '').trim(), password: String(password || '')});
      await persist(toSession(d));
      return publicState();
    },
    // Liefert ein gueltiges Zugriffstoken (erneuert rechtzeitig) oder null.
    async accessToken() {
      if (!session) return null;
      if (session.expiresAt - now() < config.refreshMarginSeconds * 1000) {
        try { await refresh(); } catch { /* abgelehnt: Sitzung ist weg (siehe unten); offline: altes Token behalten */ }
      }
      return session ? session.accessToken : null;
    },
    async forceRefresh() { if (!session) return null; await refresh(); return session?.accessToken || null; },
    async signOut() {
      const token = session?.accessToken;
      await drop();                                           // lokal sofort, auch ohne Netz
      if (token) await post('logout', null, token).catch(() => {}); // Server best effort
      return publicState();
    },
  };
}
