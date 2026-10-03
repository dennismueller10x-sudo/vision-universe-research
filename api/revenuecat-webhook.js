"use strict";

/* =========================================================================
   POST /api/revenuecat-webhook

   Empfaengt jedes Abo-Ereignis aus App Store und Google Play (ueber
   RevenueCat) und schreibt den daraus folgenden Zugang nach
   public.entitlements. Ablauf:

     1. Authorization-Header gegen REVENUECAT_WEBHOOK_AUTH pruefen.
     2. Event in billing_events ablegen (Event-ID = Primaerschluessel;
        bereits verarbeitete Dubletten enden hier mit 200).
     3. Fuer jede betroffene Supabase-User-ID den aktuellen Kundenstand
        bei RevenueCat holen und die Zeile schreiben (siehe
        server/accounts/revenuecat.js, warum nicht aus dem Event).
     4. Fehler -> 500, damit RevenueCat die Zustellung wiederholt.
   ========================================================================= */

const { accountsConfig } = require("../server/accounts/config.js");
const { createSupabase } = require("../server/accounts/supabase.js");
const RevenueCat = require("../server/accounts/revenuecat.js");
const { send, readJson } = require("../server/accounts/http.js");

function createHandler({ env = process.env, fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  return async function handler(req, res) {
    // Server-zu-Server: kein CORS, nur POST.
    const reply = (status, body) => send(req, res, status, body, ["POST"]);
    if (req.method !== "POST") return reply(405, { state: "METHOD_NOT_ALLOWED" });
    const config = accountsConfig(env);
    if (!config.revenuecatReady) return reply(503, { state: "NOT_CONFIGURED" });
    if (!RevenueCat.verifyWebhookAuth(req.headers && req.headers.authorization, config.revenuecat.webhookAuth)) {
      return reply(401, { state: "UNAUTHORIZED" });
    }
    const body = await readJson(req);
    const event = RevenueCat.parseWebhook(body);
    if (!event) return reply(400, { state: "INVALID_EVENT" });

    const db = createSupabase({ url: config.supabaseUrl, anonKey: config.anonKey, serviceKey: config.serviceKey, fetchImpl });
    const finish = (patch) => db.update("billing_events", { id: "eq." + event.id }, { processed_at: new Date(now()).toISOString(), ...patch });
    try {
      const inserted = await db.upsert("billing_events", [{
        id: event.id, provider: "revenuecat", app_user_id: event.appUserId, type: event.type,
        environment: event.environment, payload: body
      }], { onConflict: "id", ignoreDuplicates: true });
      if (!inserted.length) {
        const [known] = await db.select("billing_events", { id: "eq." + event.id, select: "processed_at" });
        if (known && known.processed_at) return reply(200, { state: "DUPLICATE" });
      }
      if (event.environment === "SANDBOX" && !config.revenuecat.acceptSandbox) {
        await finish({ error: "IGNORED_SANDBOX" });
        return reply(200, { state: "IGNORED_SANDBOX" });
      }
      if (!event.userIds.length) {
        await finish({ error: "NO_ACCOUNT_USER_ID" });
        return reply(200, { state: "NO_ACCOUNT_USER_ID" });
      }
      const rows = [];
      for (const userId of event.userIds) {
        const subscriber = await RevenueCat.fetchSubscriber(userId, { apiKey: config.revenuecat.apiKey, fetchImpl });
        rows.push(RevenueCat.entitlementFromSubscriber(subscriber, {
          userId, entitlementId: config.revenuecat.entitlementId, eventId: event.id, now: now()
        }));
      }
      // Eine User-ID ohne Konto (z. B. bereits geloescht) verletzt den Fremdschluessel.
      // Darum nur bestehende Konten schreiben.
      const existing = await db.select("profiles", { id: "in.(" + event.userIds.join(",") + ")", select: "id" });
      const known = new Set(existing.map((p) => p.id));
      const writable = rows.filter((r) => known.has(r.user_id));
      if (writable.length) await db.upsert("entitlements", writable, { onConflict: "user_id,entitlement" });
      await finish({ error: writable.length === rows.length ? null : "UNKNOWN_ACCOUNT_SKIPPED" });
      return reply(200, { state: "PROCESSED", updated: writable.length });
    } catch (error) {
      try { await db.update("billing_events", { id: "eq." + event.id }, { error: String(error && error.message || "FAILED").slice(0, 200) }); } catch { /* Protokoll ist zweitrangig */ }
      return reply(500, { state: "RETRY" });
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
