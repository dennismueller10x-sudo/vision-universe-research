import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { hasAccess, accessSummary } = require("../../../server/accounts/access.js");
const RevenueCat = require("../../../server/accounts/revenuecat.js");
const { accountsConfig } = require("../../../server/accounts/config.js");

const NOW = Date.parse("2026-10-03T12:00:00Z");
const day = 86400000;
const iso = (ms) => new Date(ms).toISOString();
const row = (patch) => ({ entitlement: "premium", status: "active", store: "APP_STORE", expires_at: iso(NOW + day), grace_expires_at: null, ...patch });

/* Dieselben Faelle wie scripts/accounts/tests/sql/rls-check.sql fuer public.has_premium(). */
test("Zugangsregel: Status und Ablauf", () => {
  assert.equal(hasAccess(row({}), NOW), true);
  assert.equal(hasAccess(row({ status: "trial" }), NOW), true);
  assert.equal(hasAccess(row({ status: "cancelled" }), NOW), true, "gekuendigt, Zeitraum laeuft noch");
  assert.equal(hasAccess(row({ status: "billing_issue" }), NOW), true);
  assert.equal(hasAccess(row({ expires_at: iso(NOW - 1) }), NOW), false, "abgelaufen");
  assert.equal(hasAccess(row({ status: "grace", expires_at: iso(NOW - day), grace_expires_at: iso(NOW + day) }), NOW), true);
  assert.equal(hasAccess(row({ status: "grace", expires_at: iso(NOW - day), grace_expires_at: iso(NOW - 1) }), NOW), false);
  assert.equal(hasAccess(row({ status: "expired", expires_at: iso(NOW + day) }), NOW), false, "expired schlaegt Datum");
  assert.equal(hasAccess(row({ status: "revoked" }), NOW), false);
  assert.equal(hasAccess(row({ store: "MANUAL", expires_at: null }), NOW), true, "unbefristet");
  assert.equal(hasAccess(row({ status: "unknown" }), NOW), false);
  assert.equal(hasAccess(row({ entitlement: "other" }), NOW), false);
  assert.equal(hasAccess(row({ expires_at: "kein datum" }), NOW), false);
  assert.equal(hasAccess(null, NOW), false);
});

test("Zusammenfassung fuer App und Web", () => {
  assert.deepEqual(accessSummary([], NOW).state, "NONE");
  const s = accessSummary([row({ status: "trial", will_renew: true })], NOW);
  assert.equal(s.premium, true);
  assert.equal(s.trial, true);
  assert.equal(s.willRenew, true);
  assert.equal("source_event_id" in s, false);
});

test("Konfiguration bleibt inert ohne Flag", () => {
  const full = { SUPABASE_URL: "https://x.supabase.co/", SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s",
    REVENUECAT_WEBHOOK_AUTH: "Bearer w", REVENUECAT_API_KEY: "k" };
  assert.equal(accountsConfig(full).supabaseReady, false);
  const on = accountsConfig({ ...full, VU_ACCOUNTS_ENABLED: "true" });
  assert.equal(on.supabaseReady, true);
  assert.equal(on.supabaseUrl, "https://x.supabase.co");
  assert.equal(on.revenuecatReady, true);
  assert.equal(on.premiumStorageReady, false);
  assert.equal(accountsConfig({ ...full, VU_ACCOUNTS_ENABLED: "true", SUPABASE_URL: "http://x" }).supabaseReady, false);
});

test("RevenueCat: Webhook-Pruefung und Event", () => {
  assert.equal(RevenueCat.verifyWebhookAuth("Bearer abc", "Bearer abc"), true);
  assert.equal(RevenueCat.verifyWebhookAuth("Bearer abd", "Bearer abc"), false);
  assert.equal(RevenueCat.verifyWebhookAuth("Bearer abc", ""), false);
  assert.equal(RevenueCat.verifyWebhookAuth(undefined, "x"), false);
  assert.equal(RevenueCat.parseWebhook({}), null);
  const uid = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222";
  const e = RevenueCat.parseWebhook({ event: { id: "e1", type: "TRANSFER", app_user_id: "$RCAnonymousID:abc",
    transferred_from: [uid.toUpperCase()], transferred_to: [other], environment: "PRODUCTION" } });
  assert.deepEqual(e.userIds, [uid, other], "nur Konto-IDs, kleingeschrieben, ohne Dubletten");
});

test("RevenueCat: Kundenstand -> Freischaltung", () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const sub = (ent, s) => ({ entitlements: { premium: { product_identifier: "vu_premium_monthly", expires_date: iso(NOW + day), ...ent } },
    subscriptions: { vu_premium_monthly: { store: "app_store", period_type: "normal", ...s } } });
  const map = (subscriber) => RevenueCat.entitlementFromSubscriber(subscriber, { userId, now: NOW, eventId: "e1" });

  const active = map(sub({}, {}));
  assert.equal(active.status, "active");
  assert.equal(active.store, "APP_STORE");
  assert.equal(active.will_renew, true);
  assert.equal(active.source_event_id, "e1");
  assert.equal(map(sub({}, { period_type: "trial" })).status, "trial");
  assert.equal(map(sub({}, { store: "play_store", unsubscribe_detected_at: iso(NOW) })).status, "cancelled");
  assert.equal(map(sub({}, { unsubscribe_detected_at: iso(NOW) })).will_renew, false);
  assert.equal(map(sub({}, { billing_issues_detected_at: iso(NOW) })).status, "billing_issue");
  assert.equal(map(sub({ expires_date: iso(NOW - 1) }, {})).status, "expired");
  assert.equal(map(sub({ expires_date: iso(NOW - 1), grace_period_expires_date: iso(NOW + day) }, {})).status, "grace");
  assert.equal(map(sub({}, { refunded_at: iso(NOW) })).status, "revoked");
  assert.equal(map({ entitlements: {}, subscriptions: {} }).status, "expired", "kein Entitlement mehr");
  assert.equal(map(sub({}, { store: "stripe" })).store, "OTHER");
  // Konsistenz: was als Zugang gemappt wird, muss hasAccess auch so sehen.
  for (const s of [sub({}, {}), sub({}, { period_type: "trial" }), sub({ expires_date: iso(NOW - 1) }, {}), sub({}, { refunded_at: iso(NOW) })]) {
    const r = { ...map(s) };
    assert.equal(hasAccess(r, NOW), !["expired", "revoked"].includes(r.status));
  }
});
