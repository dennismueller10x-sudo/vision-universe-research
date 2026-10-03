/* =========================================================================
   VISION UNIVERSE — Konto-Client fuer Web und spaetere App (Capacitor).

   Spricht direkt mit Supabase Auth (Login, Registrierung, Passwort) und
   PostgREST (Profil, Watchlists, Berichte) - Row-Level-Security sorgt
   dafuer, dass das Token nur die eigenen Zeilen sieht. Der Premium-Status
   kommt vom eigenen Server (/api/me), weil nur der ihn schreiben darf.

   Kein Paket, keine Abhaengigkeit; im Browser window.VUAccountClient,
   in Node (Tests) module.exports.
   ========================================================================= */
(function (g) {
  "use strict";

  const SESSION_KEY = "vu.account.session.v1";
  const LOCAL_WATCHLIST_KEY = "vu2.watchlist.selection.v1";
  const TICKER = /^[A-Z0-9][A-Z0-9.-]{0,11}$/;

  class AccountError extends Error {
    constructor(code, status, detail) {
      super(code);
      this.code = code;
      this.status = status || 0;
      this.detail = detail || null;
    }
  }

  /* Supabase-Fehlermeldungen -> stabile Codes fuer die Oberflaeche. */
  function authErrorCode(status, data) {
    const msg = String(data && (data.error_code || data.code || data.msg || data.message || data.error_description || data.error) || "").toLowerCase();
    if (msg.includes("invalid_credentials") || msg.includes("invalid login")) return "INVALID_CREDENTIALS";
    if (msg.includes("email_not_confirmed") || msg.includes("not confirmed")) return "EMAIL_NOT_CONFIRMED";
    if (msg.includes("user_already_exists") || msg.includes("already registered")) return "EMAIL_TAKEN";
    if (msg.includes("weak_password") || msg.includes("password should")) return "WEAK_PASSWORD";
    if (msg.includes("same_password")) return "SAME_PASSWORD";
    if (status === 429 || msg.includes("rate limit")) return "RATE_LIMITED";
    if (status === 401 || status === 403) return "UNAUTHENTICATED";
    return "REQUEST_FAILED";
  }

  function createAccountClient(options) {
    const config = options || {};
    const url = String(config.supabaseUrl || "").replace(/\/+$/, "");
    const anonKey = String(config.anonKey || "");
    const apiBase = String(config.apiBase || "").replace(/\/+$/, "");
    const storage = config.storage || null;
    const fetchImpl = config.fetchImpl || (typeof fetch === "function" ? fetch.bind(g) : null);
    const now = config.now || (() => Date.now());
    const enabled = Boolean(config.enabled && /^https:\/\//.test(url) && anonKey && fetchImpl);
    let refreshing = null;

    function readSession() {
      if (!storage) return null;
      try {
        const s = JSON.parse(storage.getItem(SESSION_KEY) || "null");
        return s && s.access_token && s.refresh_token && s.user && s.user.id ? s : null;
      } catch { return null; }
    }
    function writeSession(data) {
      if (!data || !data.access_token || !data.refresh_token) return null;
      const expiresAt = Number(data.expires_at) ? Number(data.expires_at) * 1000 : now() + (Number(data.expires_in) || 3600) * 1000;
      const session = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at_ms: expiresAt,
        user: data.user ? { id: data.user.id, email: data.user.email || null } : (readSession() || {}).user || null };
      if (!session.user || !session.user.id) return null;
      if (storage) storage.setItem(SESSION_KEY, JSON.stringify(session));
      return session;
    }
    function clearSession() { if (storage) storage.removeItem(SESSION_KEY); }

    async function request(path, { method = "GET", token, body, headers = {}, base = url } = {}) {
      if (!enabled) throw new AccountError("NOT_CONFIGURED");
      // Den eigenen Server (apiBase) erreicht nur das Token; "apikey" ist ein Supabase-Header.
      const h = base === url ? { apikey: anonKey, ...headers } : { ...headers };
      if (token) h.Authorization = "Bearer " + token;
      if (body !== undefined) h["Content-Type"] = "application/json";
      let res;
      try {
        res = await fetchImpl(base + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
      } catch { throw new AccountError("NETWORK_ERROR"); }
      const raw = await res.text();
      let data = null;
      if (raw) { try { data = JSON.parse(raw); } catch { data = null; } }
      return { status: res.status, ok: res.ok, data };
    }

    async function auth(path, body, token) {
      const res = await request("/auth/v1/" + path, { method: path === "user" ? "PUT" : "POST", body, token });
      if (!res.ok) throw new AccountError(authErrorCode(res.status, res.data), res.status);
      return res.data;
    }

    async function refresh(session) {
      if (!refreshing) {
        refreshing = auth("token?grant_type=refresh_token", { refresh_token: session.refresh_token })
          .then(writeSession)
          .catch((e) => { if (e.code === "UNAUTHENTICATED" || e.status === 400) clearSession(); throw e; })
          .finally(() => { refreshing = null; });
      }
      return refreshing;
    }

    /* Gueltige Sitzung oder null; erneuert das Token 60 s vor Ablauf. */
    async function session() {
      const s = readSession();
      if (!s) return null;
      if (s.expires_at_ms - now() > 60000) return s;
      try { return await refresh(s); } catch (e) { return e.code === "NETWORK_ERROR" ? s : null; }
    }

    async function requireSession() {
      const s = await session();
      if (!s) throw new AccountError("UNAUTHENTICATED", 401);
      return s;
    }

    async function rest(path, { method = "GET", body, prefer } = {}) {
      const s = await requireSession();
      const res = await request("/rest/v1/" + path, { method, body, token: s.access_token, headers: prefer ? { Prefer: prefer } : {} });
      if (!res.ok) {
        const own = /[A-Z_]+_(?:LIMIT_REACHED|NOT_OWNED)/.exec(String(res.data && res.data.message || ""));
        throw new AccountError(own ? own[0] : authErrorCode(res.status, res.data), res.status);
      }
      return res.data;
    }

    function cleanTicker(value) {
      const t = String(value || "").trim().toUpperCase();
      if (!TICKER.test(t)) throw new AccountError("INVALID_TICKER");
      return t;
    }

    return {
      enabled,

      /* ------------------------------------------------ Anmeldung */
      async signUp({ email, password, displayName, redirectTo }) {
        const q = redirectTo ? "?redirect_to=" + encodeURIComponent(redirectTo) : "";
        const data = await auth("signup" + q, { email, password, data: displayName ? { display_name: displayName } : {} });
        // Mit E-Mail-Bestaetigung (empfohlen) gibt es hier noch keine Sitzung.
        const s = data && data.access_token ? writeSession(data) : null;
        return { session: s, confirmationRequired: !s };
      },
      async signIn({ email, password }) {
        return writeSession(await auth("token?grant_type=password", { email, password }));
      },
      async sendPasswordReset({ email, redirectTo }) {
        const q = redirectTo ? "?redirect_to=" + encodeURIComponent(redirectTo) : "";
        await auth("recover" + q, { email });
      },
      async updatePassword(password) {
        const s = await requireSession();
        await auth("user", { password }, s.access_token);
      },
      async signOut() {
        const s = readSession();
        clearSession();
        if (s) { try { await request("/auth/v1/logout", { method: "POST", token: s.access_token }); } catch { /* lokal abgemeldet reicht */ } }
      },
      /* Links aus Bestaetigungs- und Passwort-Mails tragen die Sitzung im #-Teil der URL. */
      handleRedirect(hash) {
        const p = new URLSearchParams(String(hash || "").replace(/^#/, ""));
        if (p.get("error") || p.get("error_code")) return { type: "error", code: p.get("error_code") || p.get("error"), description: p.get("error_description") };
        if (!p.get("access_token") || !p.get("refresh_token")) return null;
        let user = null;
        try {
          const payload = JSON.parse(atobUrl(p.get("access_token").split(".")[1]));
          user = { id: payload.sub, email: payload.email || null };
        } catch { return { type: "error", code: "INVALID_TOKEN" }; }
        const s = writeSession({ access_token: p.get("access_token"), refresh_token: p.get("refresh_token"),
          expires_in: p.get("expires_in"), expires_at: p.get("expires_at"), user });
        return s ? { type: p.get("type") || "login", session: s } : { type: "error", code: "INVALID_TOKEN" };
      },
      session,

      /* ------------------------------------------------ Konto (eigener Server) */
      async me() {
        const s = await requireSession();
        const res = await request("/api/me", { token: s.access_token, base: apiBase });
        if (res.status === 401) { clearSession(); throw new AccountError("UNAUTHENTICATED", 401); }
        if (!res.ok || !res.data) throw new AccountError("ACCOUNT_SERVICE_UNAVAILABLE", res.status);
        return res.data;
      },
      async deleteAccount() {
        const s = await requireSession();
        const res = await request("/api/me", { method: "DELETE", token: s.access_token, base: apiBase, body: { confirm: "DELETE" } });
        if (!res.ok || !res.data || res.data.state !== "DELETED") throw new AccountError("DELETE_FAILED", res.status);
        clearSession();
        return res.data;
      },

      /* ------------------------------------------------ Profil */
      async profile() {
        const s = await requireSession();
        const rows = await rest("profiles?id=eq." + s.user.id + "&select=display_name,locale,report_frequency,report_email");
        return rows[0] || null;
      },
      async updateProfile(patch) {
        const s = await requireSession();
        const allowed = {};
        for (const k of ["display_name", "locale", "report_frequency", "report_email"]) if (k in patch) allowed[k] = patch[k];
        await rest("profiles?id=eq." + s.user.id, { method: "PATCH", body: allowed, prefer: "return=minimal" });
      },

      /* ------------------------------------------------ Watchlists */
      async watchlists() {
        const rows = await rest("watchlists?select=id,name,position,watchlist_items(ticker,added_at)&order=position.asc,created_at.asc");
        return rows.map((w) => ({ id: w.id, name: w.name, position: w.position,
          tickers: (w.watchlist_items || []).map((i) => i.ticker).sort() }));
      },
      async createWatchlist(name) {
        const s = await requireSession();
        const clean = String(name || "").trim().slice(0, 60);
        if (!clean) throw new AccountError("INVALID_NAME");
        const [row] = await rest("watchlists", { method: "POST", body: { user_id: s.user.id, name: clean, position: Math.floor(now() / 1000) }, prefer: "return=representation" });
        return { id: row.id, name: row.name, position: row.position, tickers: [] };
      },
      async renameWatchlist(id, name) {
        const clean = String(name || "").trim().slice(0, 60);
        if (!clean) throw new AccountError("INVALID_NAME");
        await rest("watchlists?id=eq." + encodeURIComponent(id), { method: "PATCH", body: { name: clean }, prefer: "return=minimal" });
      },
      async deleteWatchlist(id) {
        await rest("watchlists?id=eq." + encodeURIComponent(id), { method: "DELETE", prefer: "return=minimal" });
      },
      async addTickers(watchlistId, tickers) {
        const s = await requireSession();
        const list = [...new Set((Array.isArray(tickers) ? tickers : [tickers]).map(cleanTicker))];
        if (!list.length) return [];
        await rest("watchlist_items?on_conflict=watchlist_id,ticker", { method: "POST",
          body: list.map((ticker) => ({ watchlist_id: watchlistId, user_id: s.user.id, ticker })),
          prefer: "return=minimal,resolution=ignore-duplicates" });
        return list;
      },
      async removeTicker(watchlistId, ticker) {
        await rest("watchlist_items?watchlist_id=eq." + encodeURIComponent(watchlistId) + "&ticker=eq." + encodeURIComponent(cleanTicker(ticker)),
          { method: "DELETE", prefer: "return=minimal" });
      },

      /* Die bisherige Watchlist lebt nur im Browser (quant/api/watchlist-workspace.js).
         Beim ersten Login einmal ins Konto uebernehmen; die lokale Liste bleibt unveraendert. */
      localWatchlist() {
        try {
          const data = JSON.parse((storage && storage.getItem(LOCAL_WATCHLIST_KEY)) || "null");
          return data && data.version === "1.0.0" && Array.isArray(data.tickers) ? data.tickers.filter((t) => TICKER.test(t)) : [];
        } catch { return []; }
      },
      localImportDone(userId) {
        return Boolean(storage && storage.getItem("vu.account.local-import." + userId));
      },
      async importLocalWatchlist(watchlistId) {
        const s = await requireSession();
        const tickers = this.localWatchlist().slice(0, 500);
        if (tickers.length) await this.addTickers(watchlistId, tickers);
        if (storage) storage.setItem("vu.account.local-import." + s.user.id, new Date(now()).toISOString());
        return tickers.length;
      },

      /* ------------------------------------------------ Berichte */
      async reports(limit = 20) {
        return rest("user_reports?select=id,report_date,frequency,tickers,items,read_at&order=report_date.desc&limit=" + Math.min(100, Math.max(1, limit | 0)));
      },
      async markReportRead(id) {
        await rest("user_reports?id=eq." + encodeURIComponent(id), { method: "PATCH", body: { read_at: new Date(now()).toISOString() }, prefer: "return=minimal" });
      }
    };
  }

  function atobUrl(part) {
    const b64 = String(part).replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    if (typeof atob === "function") return new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    return Buffer.from(b64, "base64").toString("utf8");
  }

  const api = { createAccountClient, AccountError, SESSION_KEY, LOCAL_WATCHLIST_KEY };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else g.VUAccountClient = api;
})(typeof window !== "undefined" ? window : globalThis);
