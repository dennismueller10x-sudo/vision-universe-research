/* Die Konto-Endpunkte gegen einen nachgebauten Supabase- und RevenueCat-Server
   (fetch-Attrappe). Kein Netz, keine Zugangsdaten. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Readable } from "node:stream";

const require = createRequire(import.meta.url);
const Me = require("../../../api/me.js");
const Webhook = require("../../../api/revenuecat-webhook.js");
const Premium = require("../../../api/premium.js");

const NOW = Date.parse("2026-10-03T12:00:00Z");
const USER = "11111111-1111-4111-8111-111111111111";
const TOKEN = "DUMMY-user-access-token-0123456789";
const ENV = {
  VU_ACCOUNTS_ENABLED: "true", SUPABASE_URL: "https://db.example.supabase.co", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service",
  REVENUECAT_WEBHOOK_AUTH: "Bearer hook-secret", REVENUECAT_API_KEY: "rc-key",
  VU_PREMIUM_S3_ENDPOINT: "https://r2.example", VU_PREMIUM_S3_BUCKET: "b", VU_PREMIUM_S3_ACCESS_KEY_ID: "k", VU_PREMIUM_S3_SECRET_ACCESS_KEY: "s"
};

function req({ method = "GET", url = "/", headers = {}, body } = {}) {
  const r = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  return Object.assign(r, { method, url, headers });
}
function res() {
  const out = { headers: {}, statusCode: 0, body: null };
  return Object.assign(out, {
    setHeader(k, v) { out.headers[k.toLowerCase()] = v; },
    end(b) { out.body = b ? JSON.parse(b) : null; }
  });
}

/* Ein kleiner Supabase: Auth (/auth/v1/user, admin) und PostgREST fuer einige Tabellen. */
function fakeBackend({ entitlements = [], subscriber = null, profiles = [{ id: USER }] } = {}) {
  const db = { entitlements: [...entitlements], billing_events: [], profiles };
  const calls = [];
  const reply = (status, data) => ({ ok: status < 300, status, text: async () => (data === undefined ? "" : JSON.stringify(data)), json: async () => data });
  async function fetchImpl(url, init = {}) {
    const u = new URL(url), h = init.headers || {}, method = init.method || "GET";
    calls.push({ method, path: u.pathname, search: u.search, h });
    if (u.hostname === "api.revenuecat.com") {
      return h.Authorization === "Bearer rc-key" ? reply(200, { subscriber }) : reply(401, {});
    }
    if (u.pathname === "/auth/v1/user") return h.Authorization === "Bearer " + TOKEN ? reply(200, { id: USER, email: "a@example.com" }) : reply(401, {});
    if (u.pathname.startsWith("/auth/v1/admin/users/")) {
      assert.equal(h.Authorization, "Bearer service");
      return reply(200, {});
    }
    const table = u.pathname.replace("/rest/v1/", "");
    assert.equal(h.Authorization, "Bearer service", "REST nur mit Service-Key");
    if (method === "GET") {
      let rows = db[table] || [];
      for (const [k, v] of u.searchParams) {
        if (v.startsWith("eq.")) rows = rows.filter((r) => String(r[k]) === v.slice(3));
        if (v.startsWith("in.(")) { const set = v.slice(4, -1).split(","); rows = rows.filter((r) => set.includes(r[k])); }
      }
      return reply(200, rows);
    }
    if (method === "POST") {
      const rows = JSON.parse(init.body), written = [];
      for (const r of rows) {
        const keys = (u.searchParams.get("on_conflict") || "id").split(",");
        const i = (db[table] ||= []).findIndex((x) => keys.every((k) => x[k] === r[k]));
        if (i >= 0 && h.Prefer.includes("ignore-duplicates")) continue;
        if (i >= 0) db[table][i] = { ...db[table][i], ...r }; else db[table].push({ ...r });
        written.push(r);
      }
      return reply(201, written);
    }
    if (method === "PATCH") {
      const id = u.searchParams.get("id").slice(3);
      for (const r of db[table]) if (r.id === id) Object.assign(r, JSON.parse(init.body));
      return reply(204);
    }
    return reply(404, {});
  }
  return { db, calls, fetchImpl };
}

test("/api/me: inert ohne Konfiguration", async () => {
  const r = res();
  await Me.createHandler({ env: {} })(req({ headers: {} }), r);
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.state, "NOT_CONFIGURED");
});

test("/api/me: ohne oder mit falschem Token 401", async () => {
  const backend = fakeBackend();
  const handler = Me.createHandler({ env: ENV, fetchImpl: backend.fetchImpl, now: () => NOW });
  let r = res(); await handler(req(), r); assert.equal(r.statusCode, 401);
  r = res(); await handler(req({ headers: { authorization: "Bearer DUMMY-wrong-token-0123456789" } }), r); assert.equal(r.statusCode, 401);
});

test("/api/me: liefert Premium-Status, Herkunft der App erlaubt", async () => {
  const backend = fakeBackend({ entitlements: [{ user_id: USER, entitlement: "premium", status: "trial", store: "APP_STORE", expires_at: new Date(NOW + 86400000).toISOString(), will_renew: true }] });
  const r = res();
  await Me.createHandler({ env: ENV, fetchImpl: backend.fetchImpl, now: () => NOW })(
    req({ headers: { authorization: "Bearer " + TOKEN, origin: "capacitor://localhost" } }), r);
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.user.id, USER);
  assert.equal(r.body.access.premium, true);
  assert.equal(r.body.access.trial, true);
  assert.equal(r.headers["access-control-allow-origin"], "capacitor://localhost");
});

test("/api/me: fremde Herkunft abgelehnt, DELETE braucht Bestaetigung", async () => {
  const backend = fakeBackend();
  const handler = Me.createHandler({ env: ENV, fetchImpl: backend.fetchImpl, now: () => NOW });
  let r = res(); await handler(req({ headers: { origin: "https://evil.example" } }), r); assert.equal(r.statusCode, 403);
  r = res(); await handler(req({ method: "DELETE", headers: { authorization: "Bearer " + TOKEN }, body: {} }), r);
  assert.equal(r.statusCode, 400);
  r = res(); await handler(req({ method: "DELETE", headers: { authorization: "Bearer " + TOKEN }, body: { confirm: "DELETE" } }), r);
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.state, "DELETED");
  assert.ok(backend.calls.some((c) => c.method === "DELETE" && c.path === "/auth/v1/admin/users/" + USER));
});

const subscriber = { entitlements: { premium: { product_identifier: "vu_premium_monthly", expires_date: new Date(NOW + 7 * 86400000).toISOString() } },
  subscriptions: { vu_premium_monthly: { store: "app_store", period_type: "trial" } } };
const event = (patch = {}) => ({ event: { id: "evt-1", type: "INITIAL_PURCHASE", app_user_id: USER, environment: "PRODUCTION", ...patch } });
const hook = (body, auth = "Bearer hook-secret") => req({ method: "POST", headers: { authorization: auth }, body });

test("Webhook: falsches Geheimnis 401, nichts geschrieben", async () => {
  const backend = fakeBackend({ subscriber });
  const r = res();
  await Webhook.createHandler({ env: ENV, fetchImpl: backend.fetchImpl, now: () => NOW })(hook(event(), "Bearer nope"), r);
  assert.equal(r.statusCode, 401);
  assert.equal(backend.calls.length, 0);
});

test("Webhook: Kauf schaltet frei, Dublette wird nicht erneut verarbeitet", async () => {
  const backend = fakeBackend({ subscriber });
  const handler = Webhook.createHandler({ env: ENV, fetchImpl: backend.fetchImpl, now: () => NOW });
  let r = res(); await handler(hook(event()), r);
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.state, "PROCESSED");
  assert.equal(backend.db.entitlements.length, 1);
  assert.equal(backend.db.entitlements[0].status, "trial");
  assert.ok(backend.db.billing_events[0].processed_at);
  const before = backend.calls.length;
  r = res(); await handler(hook(event()), r);
  assert.equal(r.body.state, "DUPLICATE");
  assert.equal(backend.calls.filter((c, i) => i >= before && c.path.startsWith("/v1/subscribers")).length, 0);
});

test("Webhook: Sandbox ignoriert, anonyme ID ohne Konto, unbekanntes Konto nicht geschrieben", async () => {
  let backend = fakeBackend({ subscriber });
  let r = res(); await Webhook.createHandler({ env: ENV, fetchImpl: backend.fetchImpl, now: () => NOW })(hook(event({ environment: "SANDBOX" })), r);
  assert.equal(r.body.state, "IGNORED_SANDBOX");
  assert.equal(backend.db.entitlements.length, 0);

  backend = fakeBackend({ subscriber });
  r = res(); await Webhook.createHandler({ env: ENV, fetchImpl: backend.fetchImpl, now: () => NOW })(hook(event({ id: "e2", app_user_id: "$RCAnonymousID:x" })), r);
  assert.equal(r.body.state, "NO_ACCOUNT_USER_ID");

  backend = fakeBackend({ subscriber, profiles: [] });
  r = res(); await Webhook.createHandler({ env: ENV, fetchImpl: backend.fetchImpl, now: () => NOW })(hook(event({ id: "e3" })), r);
  assert.equal(r.body.state, "PROCESSED");
  assert.equal(r.body.updated, 0);
  assert.equal(backend.db.entitlements.length, 0);
});

test("Webhook: RevenueCat nicht erreichbar -> 500 zum Wiederholen, Wiederholung verarbeitet", async () => {
  const backend = fakeBackend({ subscriber });
  const broken = { ...ENV, REVENUECAT_API_KEY: "falsch" };
  let r = res(); await Webhook.createHandler({ env: broken, fetchImpl: backend.fetchImpl, now: () => NOW })(hook(event()), r);
  assert.equal(r.statusCode, 500);
  assert.equal(backend.db.billing_events[0].processed_at, undefined);
  r = res(); await Webhook.createHandler({ env: ENV, fetchImpl: backend.fetchImpl, now: () => NOW })(hook(event()), r);
  assert.equal(r.body.state, "PROCESSED", "unverarbeitete Dublette wird nachgeholt");
  assert.equal(backend.db.entitlements[0].status, "trial");
});

test("/api/premium: Pfadpruefung, Abo-Pflicht, Auslieferung", async () => {
  assert.equal(Premium.validPath("reports/nvda.json"), "reports/nvda.json");
  for (const bad of ["../x.json", "a/../b.json", ".env.json", "x.txt", "/abs.json", "a//b.json", ""]) assert.equal(Premium.validPath(bad), null, bad);

  const files = { "premium/reports/nvda.json": Buffer.from('{"ok":true}') };
  const driverFactory = async () => ({ get: async (key) => files[key] || null });
  const call = async (backend, path) => {
    const r = res();
    await Premium.createHandler({ env: ENV, fetchImpl: backend.fetchImpl, now: () => NOW, driverFactory })(
      req({ url: "/api/premium?path=" + encodeURIComponent(path), headers: { authorization: "Bearer " + TOKEN } }), r);
    return r;
  };
  let r = await call(fakeBackend(), "reports/nvda.json");
  assert.equal(r.statusCode, 402, "ohne Abo kein Inhalt");
  const paying = fakeBackend({ entitlements: [{ user_id: USER, entitlement: "premium", status: "active", expires_at: new Date(NOW + 1000).toISOString() }] });
  r = await call(paying, "reports/nvda.json");
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body.data, { ok: true });
  r = await call(paying, "reports/missing.json");
  assert.equal(r.statusCode, 404);
  r = await call(paying, "../secrets.json");
  assert.equal(r.statusCode, 400);
});
