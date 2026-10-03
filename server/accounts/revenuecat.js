"use strict";

/* =========================================================================
   VISION UNIVERSE — RevenueCat (App Store + Google Play) -> entitlements.

   WARUM DER WEBHOOK NICHT DIREKT AUS DEM EVENT SCHREIBT

   Webhooks koennen doppelt, verspaetet und in falscher Reihenfolge kommen.
   Ein spaetes RENEWAL nach einer EXPIRATION wuerde sonst einen falschen
   Zustand herstellen. Deshalb ist das Event nur der Anlass: Wir holen bei
   jedem Event den aktuellen Kundenstand von der RevenueCat-API
   (GET /v1/subscribers/{app_user_id}) und schreiben genau den. Das ist
   idempotent - dasselbe Event zweimal ergibt dieselbe Zeile.

   KONVENTION: Die App meldet sich bei RevenueCat mit der Supabase-User-ID
   an (Purchases.logIn(userId)). Nur solche IDs (UUID) werden verarbeitet;
   anonyme Kaeufe ($RCAnonymousID:...) haben noch kein Konto.
   ========================================================================= */

const { timingSafeEqual } = require("node:crypto");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STORES = { app_store: "APP_STORE", mac_app_store: "MAC_APP_STORE", play_store: "PLAY_STORE", promotional: "PROMOTIONAL" };

function verifyWebhookAuth(header, secret) {
  if (!secret || typeof header !== "string") return false;
  const a = Buffer.from(header), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

function parseWebhook(body) {
  const event = body && typeof body === "object" ? body.event : null;
  if (!event || typeof event !== "object" || typeof event.id !== "string" || !event.id || typeof event.type !== "string") {
    return null;
  }
  const ids = [event.app_user_id, event.original_app_user_id,
    ...(Array.isArray(event.aliases) ? event.aliases : []),
    ...(Array.isArray(event.transferred_from) ? event.transferred_from : []),
    ...(Array.isArray(event.transferred_to) ? event.transferred_to : [])];
  return {
    id: event.id,
    type: event.type,
    environment: typeof event.environment === "string" ? event.environment : null,
    appUserId: typeof event.app_user_id === "string" ? event.app_user_id : null,
    userIds: [...new Set(ids.filter((id) => typeof id === "string" && UUID.test(id)).map((id) => id.toLowerCase()))]
  };
}

async function fetchSubscriber(appUserId, { apiKey, fetchImpl = globalThis.fetch }) {
  const res = await fetchImpl("https://api.revenuecat.com/v1/subscribers/" + encodeURIComponent(appUserId), {
    headers: { Authorization: "Bearer " + apiKey, Accept: "application/json" }
  });
  if (!res.ok) {
    const error = new Error("REVENUECAT_UNAVAILABLE");
    error.status = res.status;
    throw error;
  }
  const data = await res.json();
  return data && data.subscriber ? data.subscriber : null;
}

function ms(value) {
  if (value === null || value === undefined) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

/* Kundenstand -> Zeile fuer public.entitlements. */
function entitlementFromSubscriber(subscriber, { userId, entitlementId = "premium", eventId = null, now = Date.now() }) {
  const base = { user_id: userId, entitlement: "premium", source_event_id: eventId };
  const ent = subscriber && subscriber.entitlements ? subscriber.entitlements[entitlementId] : null;
  if (!ent) {
    return { ...base, status: "expired", store: "OTHER", product_id: null, period_type: null,
      expires_at: null, grace_expires_at: null, will_renew: false, is_sandbox: false };
  }
  const product = ent.product_identifier || null;
  const sub = (subscriber.subscriptions && product && subscriber.subscriptions[product]) || {};
  const expires = ms(ent.expires_date), grace = ms(ent.grace_period_expires_date || sub.grace_period_expires_date);
  const periodType = String(sub.period_type || "normal").toLowerCase();
  let status;
  if (sub.refunded_at) status = "revoked";
  else if (expires !== null && expires <= now) status = grace !== null && grace > now ? "grace" : "expired";
  else if (sub.billing_issues_detected_at) status = "billing_issue";
  else if (periodType === "trial") status = "trial";
  else if (sub.unsubscribe_detected_at) status = "cancelled";
  else status = "active";
  return {
    ...base,
    status,
    store: STORES[String(sub.store || "").toLowerCase()] || "OTHER",
    product_id: product,
    period_type: periodType,
    expires_at: expires === null ? null : new Date(expires).toISOString(),
    grace_expires_at: grace === null ? null : new Date(grace).toISOString(),
    will_renew: !sub.unsubscribe_detected_at && !sub.refunded_at && status !== "expired" && status !== "revoked",
    is_sandbox: Boolean(sub.is_sandbox)
  };
}

module.exports = { UUID, verifyWebhookAuth, parseWebhook, fetchSubscriber, entitlementFromSubscriber };
