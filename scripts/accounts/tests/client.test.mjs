import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createAccountClient, SESSION_KEY } = require("../../../konto/auth-client.js");

const USER = "11111111-1111-4111-8111-111111111111";
const NOW = Date.parse("2026-10-03T12:00:00Z");

function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}
function jwt(payload) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return b({ alg: "HS256" }) + "." + b(payload) + ".sig";
}
function fake(handlers) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ url: u, method: init.method || "GET", headers: init.headers || {}, body: init.body ? JSON.parse(init.body) : undefined });
    const [status, data] = (handlers[(init.method || "GET") + " " + u.pathname] || (() => [404, {}]))(calls.at(-1));
    return { status, ok: status < 300, text: async () => (data === undefined ? "" : JSON.stringify(data)) };
  };
  return { calls, fetchImpl };
}
const base = { enabled: true, supabaseUrl: "https://db.example.supabase.co", anonKey: "anon", apiBase: "https://api.example" };
const tokens = (extra = {}) => ({ access_token: "acc-1", refresh_token: "ref-1", expires_in: 3600, user: { id: USER, email: "a@example.com" }, ...extra });

test("Ohne Konfiguration inaktiv", () => {
  assert.equal(createAccountClient({}).enabled, false);
  assert.equal(createAccountClient({ ...base, supabaseUrl: "http://insecure" }).enabled, false);
});

test("Anmelden speichert die Sitzung, Fehler werden zu stabilen Codes", async () => {
  const storage = memoryStorage();
  const f = fake({
    "POST /auth/v1/token": (c) => c.body.password === "richtig-123" ? [200, tokens()] : [400, { error_code: "invalid_credentials", msg: "Invalid login credentials" }]
  });
  const client = createAccountClient({ ...base, storage, fetchImpl: f.fetchImpl, now: () => NOW });
  await assert.rejects(client.signIn({ email: "a@example.com", password: "falsch" }), { code: "INVALID_CREDENTIALS" });
  const s = await client.signIn({ email: "a@example.com", password: "richtig-123" });
  assert.equal(s.user.id, USER);
  assert.equal(f.calls[0].headers.apikey, "anon");
  assert.equal(f.calls[0].url.search, "?grant_type=password");
  assert.ok(JSON.parse(storage.getItem(SESSION_KEY)).access_token);
});

test("Registrierung mit E-Mail-Bestaetigung liefert noch keine Sitzung", async () => {
  const f = fake({ "POST /auth/v1/signup": () => [200, { id: USER, email: "a@example.com" }] });
  const client = createAccountClient({ ...base, storage: memoryStorage(), fetchImpl: f.fetchImpl });
  const r = await client.signUp({ email: "a@example.com", password: "x".repeat(12), displayName: "Anna", redirectTo: "https://research.visionuniverse.de/konto/" });
  assert.equal(r.confirmationRequired, true);
  assert.deepEqual(f.calls[0].body.data, { display_name: "Anna" });
  assert.match(f.calls[0].url.search, /redirect_to=https%3A%2F%2Fresearch/);
});

test("Token wird kurz vor Ablauf erneuert; abgelehnte Erneuerung meldet ab", async () => {
  const storage = memoryStorage({ [SESSION_KEY]: JSON.stringify({ access_token: "old", refresh_token: "ref-1", expires_at_ms: NOW + 30000, user: { id: USER } }) });
  let ok = true;
  const f = fake({ "POST /auth/v1/token": () => (ok ? [200, tokens({ access_token: "new", user: undefined })] : [400, { error: "invalid_grant" }]) });
  const client = createAccountClient({ ...base, storage, fetchImpl: f.fetchImpl, now: () => NOW });
  const s = await client.session();
  assert.equal(s.access_token, "new");
  assert.equal(s.user.id, USER, "User bleibt erhalten, auch wenn die Antwort keinen mitliefert");
  storage.setItem(SESSION_KEY, JSON.stringify({ ...s, expires_at_ms: NOW }));
  ok = false;
  assert.equal(await client.session(), null);
  assert.equal(storage.getItem(SESSION_KEY), null);
});

test("Redirect aus Bestaetigungs- und Passwort-Mail", () => {
  const storage = memoryStorage();
  const client = createAccountClient({ ...base, storage, fetchImpl: async () => ({}) , now: () => NOW });
  const r = client.handleRedirect("#access_token=" + jwt({ sub: USER, email: "a@example.com" }) + "&refresh_token=r&expires_in=3600&type=recovery");
  assert.equal(r.type, "recovery");
  assert.equal(r.session.user.id, USER);
  assert.equal(client.handleRedirect("#error=access_denied&error_code=otp_expired").code, "otp_expired");
  assert.equal(client.handleRedirect(""), null);
});

test("Watchlists: Token des Users, Tickerpruefung, Dubletten ignoriert, /api/me ohne apikey", async () => {
  const storage = memoryStorage({ [SESSION_KEY]: JSON.stringify({ access_token: "acc", refresh_token: "r", expires_at_ms: NOW + 3600000, user: { id: USER } }),
    "vu2.watchlist.selection.v1": JSON.stringify({ version: "1.0.0", tickers: ["NVDA", "PLTR", "bad ticker"] }) });
  const f = fake({
    "GET /rest/v1/watchlists": () => [200, [{ id: "w1", name: "Meine Watchlist", position: 0, watchlist_items: [{ ticker: "PLTR" }, { ticker: "AAPL" }] }]],
    "POST /rest/v1/watchlist_items": () => [201],
    "GET /api/me": () => [200, { state: "AVAILABLE", access: { premium: false } }]
  });
  const client = createAccountClient({ ...base, storage, fetchImpl: f.fetchImpl, now: () => NOW });
  const lists = await client.watchlists();
  assert.deepEqual(lists[0].tickers, ["AAPL", "PLTR"]);
  assert.equal(f.calls[0].headers.Authorization, "Bearer acc");
  await assert.rejects(client.addTickers("w1", ["NVDA", "../x"]), { code: "INVALID_TICKER" });
  await client.addTickers("w1", [" nvda", "NVDA", "msft"]);
  const post = f.calls.at(-1);
  assert.deepEqual(post.body.map((r) => r.ticker), ["NVDA", "MSFT"]);
  assert.ok(post.body.every((r) => r.user_id === USER && r.watchlist_id === "w1"));
  assert.match(post.headers.Prefer, /ignore-duplicates/);
  assert.deepEqual(client.localWatchlist(), ["NVDA", "PLTR"]);
  assert.equal(client.localImportDone(USER), false);
  assert.equal(await client.importLocalWatchlist("w1"), 2);
  assert.equal(client.localImportDone(USER), true);
  await client.me();
  const me = f.calls.at(-1);
  assert.equal(me.url.origin, "https://api.example");
  assert.equal(me.headers.apikey, undefined, "eigener Server bekommt keinen Supabase-Header (CORS)");
});

test("Datenbank-Grenzen kommen als eigene Codes an", async () => {
  const storage = memoryStorage({ [SESSION_KEY]: JSON.stringify({ access_token: "acc", refresh_token: "r", expires_at_ms: NOW + 3600000, user: { id: USER } }) });
  const f = fake({ "POST /rest/v1/watchlists": () => [400, { code: "P0001", message: "WATCHLIST_LIMIT_REACHED" }] });
  const client = createAccountClient({ ...base, storage, fetchImpl: f.fetchImpl, now: () => NOW });
  await assert.rejects(client.createWatchlist("Neu"), { code: "WATCHLIST_LIMIT_REACHED" });
  await assert.rejects(client.createWatchlist("   "), { code: "INVALID_NAME" });
});
