"use strict";

/* =========================================================================
   GET /api/premium?path=<datei.json>

   Liefert eine Premium-Datei aus dem privaten R2-Bucket - nur an
   angemeldete User mit aktivem Abo (server/accounts/access.js).

   Das ist der Ort, an den die heute oeffentlich ausgelieferten
   Premium-Daten umziehen (siehe docs/VU_ACCOUNTS_SUBSCRIPTIONS.md,
   "Bezahlschranke"). Eigene Zugangsdaten (VU_PREMIUM_S3_*), damit dieser
   Endpunkt nie den Schluessel des History-Speichers braucht.
   ========================================================================= */

const { accountsConfig } = require("../server/accounts/config.js");
const { createSupabase } = require("../server/accounts/supabase.js");
const { hasAccess } = require("../server/accounts/access.js");
const { send, guard, bearer } = require("../server/accounts/http.js");

const PATH = /^[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_.-]*){0,4}\.json$/i;

function validPath(value) {
  const path = String(value || "");
  return path.length <= 200 && PATH.test(path) && !path.split("/").some((p) => p === ".." || p.startsWith(".")) ? path : null;
}

function defaultDriver(storage) {
  return import("../scripts/market/storage/s3-driver.mjs").then((m) => m.createS3Driver({
    endpoint: storage.endpoint, bucket: storage.bucket, region: storage.region,
    accessKeyId: storage.accessKeyId, secretAccessKey: storage.secretAccessKey
  }));
}

function createHandler({ env = process.env, fetchImpl = globalThis.fetch, now = () => Date.now(), driverFactory = defaultDriver } = {}) {
  let driverPromise;
  return async function handler(req, res) {
    if (guard(req, res, ["GET"])) return;
    const reply = (status, body) => send(req, res, status, body, ["GET"]);
    const config = accountsConfig(env);
    if (!config.premiumStorageReady) return reply(200, { state: "NOT_CONFIGURED" });
    const path = validPath(new URL(req.url, "http://localhost").searchParams.get("path"));
    if (!path) return reply(400, { state: "INVALID_PATH" });
    const token = bearer(req);
    if (!token) return reply(401, { state: "UNAUTHENTICATED" });
    try {
      const db = createSupabase({ url: config.supabaseUrl, anonKey: config.anonKey, serviceKey: config.serviceKey, fetchImpl });
      const user = await db.getUser(token);
      if (!user) return reply(401, { state: "UNAUTHENTICATED" });
      const rows = await db.select("entitlements", {
        user_id: "eq." + user.id, entitlement: "eq.premium", select: "entitlement,status,expires_at,grace_expires_at"
      });
      if (!hasAccess(rows[0], now())) return reply(402, { state: "PREMIUM_REQUIRED" });
      if (!driverPromise) driverPromise = driverFactory(config.premiumStorage);
      const buffer = await (await driverPromise).get(config.premiumStorage.prefix + path);
      if (!buffer) return reply(404, { state: "NOT_FOUND" });
      let data;
      try { data = JSON.parse(buffer.toString("utf8")); } catch { return reply(502, { state: "INVALID_PREMIUM_FILE" }); }
      return reply(200, { state: "AVAILABLE", path, data });
    } catch {
      driverPromise = null;
      return reply(503, { state: "PREMIUM_SERVICE_UNAVAILABLE" });
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.validPath = validPath;
