"use strict";

/* Alle Konto-Einstellungen kommen aus der Umgebung (Vercel -> Settings ->
   Environment Variables). Ohne VU_ACCOUNTS_ENABLED=true bleibt jeder
   Konto-Endpunkt inert und antwortet NOT_CONFIGURED - so kann der Code
   auf main liegen, bevor Supabase und RevenueCat eingerichtet sind. */

function text(env, name) {
  return String(env[name] || "").trim();
}

function flag(env, name) {
  return text(env, name).toLowerCase() === "true";
}

function accountsConfig(env = process.env) {
  const supabaseUrl = text(env, "SUPABASE_URL").replace(/\/+$/, "");
  const config = {
    enabled: flag(env, "VU_ACCOUNTS_ENABLED"),
    supabaseUrl,
    anonKey: text(env, "SUPABASE_ANON_KEY"),
    serviceKey: text(env, "SUPABASE_SERVICE_ROLE_KEY"),
    revenuecat: {
      webhookAuth: text(env, "REVENUECAT_WEBHOOK_AUTH"),
      apiKey: text(env, "REVENUECAT_API_KEY"),
      entitlementId: text(env, "REVENUECAT_ENTITLEMENT_ID") || "premium",
      acceptSandbox: flag(env, "VU_ACCOUNTS_ACCEPT_SANDBOX")
    },
    premiumStorage: {
      endpoint: text(env, "VU_PREMIUM_S3_ENDPOINT"),
      bucket: text(env, "VU_PREMIUM_S3_BUCKET"),
      region: text(env, "VU_PREMIUM_S3_REGION") || "auto",
      accessKeyId: text(env, "VU_PREMIUM_S3_ACCESS_KEY_ID"),
      secretAccessKey: text(env, "VU_PREMIUM_S3_SECRET_ACCESS_KEY"),
      prefix: text(env, "VU_PREMIUM_S3_PREFIX") || "premium/"
    }
  };
  config.supabaseReady = config.enabled && /^https:\/\/[^/]+$/.test(supabaseUrl) &&
    Boolean(config.anonKey && config.serviceKey);
  config.revenuecatReady = config.supabaseReady && Boolean(config.revenuecat.webhookAuth && config.revenuecat.apiKey);
  const s = config.premiumStorage;
  config.premiumStorageReady = config.supabaseReady &&
    Boolean(s.endpoint && s.bucket && s.accessKeyId && s.secretAccessKey);
  return config;
}

module.exports = { accountsConfig };
