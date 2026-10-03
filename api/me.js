"use strict";

/* =========================================================================
   GET    /api/me  -> Konto, Profil und Premium-Status des angemeldeten Users
   DELETE /api/me  -> Konto endgueltig loeschen (Body: {"confirm":"DELETE"})

   Anmeldung: Authorization: Bearer <Supabase-Access-Token>.
   Inert, solange VU_ACCOUNTS_ENABLED nicht "true" ist.
   ========================================================================= */

const { accountsConfig } = require("../server/accounts/config.js");
const { createSupabase } = require("../server/accounts/supabase.js");
const { accessSummary } = require("../server/accounts/access.js");
const { send, guard, bearer, readJson } = require("../server/accounts/http.js");

const METHODS = ["GET", "DELETE"];

function createHandler({ env = process.env, fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  return async function handler(req, res) {
    if (guard(req, res, METHODS)) return;
    const reply = (status, body) => send(req, res, status, body, METHODS);
    const config = accountsConfig(env);
    if (!config.supabaseReady) return reply(200, { state: "NOT_CONFIGURED" });

    const token = bearer(req);
    if (!token) return reply(401, { state: "UNAUTHENTICATED" });
    try {
      const db = createSupabase({ url: config.supabaseUrl, anonKey: config.anonKey, serviceKey: config.serviceKey, fetchImpl });
      const user = await db.getUser(token);
      if (!user) return reply(401, { state: "UNAUTHENTICATED" });
      const id = { user_id: "eq." + user.id };

      if (req.method === "DELETE") {
        const body = await readJson(req);
        if (!body || body.confirm !== "DELETE") return reply(400, { state: "CONFIRMATION_REQUIRED" });
        const rows = await db.select("entitlements", { ...id, select: "status,store,expires_at,grace_expires_at,entitlement,will_renew" });
        const access = accessSummary(rows, now());
        await db.deleteUser(user.id);
        // Ein laufendes Store-Abo endet nicht durch das Loeschen des Kontos.
        // Kuendigen kann nur der Kunde selbst in den Einstellungen von Apple bzw. Google.
        return reply(200, { state: "DELETED", storeSubscriptionStillRenews: access.premium && access.willRenew, store: access.store });
      }

      const [profiles, entitlements] = await Promise.all([
        db.select("profiles", { id: "eq." + user.id, select: "display_name,locale,report_frequency,report_email,created_at" }),
        db.select("entitlements", { ...id, select: "entitlement,status,store,expires_at,grace_expires_at,will_renew" })
      ]);
      return reply(200, {
        state: "AVAILABLE",
        user: { id: user.id, email: user.email || null, emailConfirmed: Boolean(user.email_confirmed_at) },
        profile: profiles[0] || null,
        access: accessSummary(entitlements, now())
      });
    } catch {
      return reply(503, { state: "ACCOUNT_SERVICE_UNAVAILABLE" });
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
