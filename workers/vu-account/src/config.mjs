// Konfiguration aus der Worker-Umgebung. Fehlende Werte schalten einzelne
// Bereiche ab (Antwort 503 mit Zustand), statt still mit Platzhaltern zu laufen.
//
// TESTMODUS-SPERRE: Ein Stripe-Live-Schluessel (sk_live_/rk_live_) wird nur
// akzeptiert, wenn STRIPE_LIVE_MODE_APPROVED="true" gesetzt ist. Das ist die
// ausdrueckliche Produktionsfreigabe (docs/accounts/LIVE_RELEASE.md).

import {LEGAL_VERSION, LEGAL_STATUS} from './legal/texts.mjs';

const list = value => String(value || '').split(',').map(s => s.trim()).filter(Boolean);
const flag = value => String(value || '').trim().toLowerCase() === 'true';
const origin = value => {
  try { const u = new URL(String(value || '')); return u.origin; } catch { return ''; }
};

export function stripeKeyMode(key) {
  const k = String(key || '');
  if (/^(sk|rk)_test_/.test(k)) return 'test';
  if (/^(sk|rk)_live_/.test(k)) return 'live';
  return k ? 'invalid' : 'missing';
}

export function loadConfig(env = {}) {
  const siteOrigin = origin(env.VU_SITE_ORIGIN) || 'https://research.visionuniverse.de';
  const apiOrigin = origin(env.VU_ACCOUNT_API_ORIGIN);
  const allowedOrigins = new Set([siteOrigin, ...list(env.VU_ALLOWED_ORIGINS).map(origin).filter(Boolean)]);
  const stripeMode = stripeKeyMode(env.STRIPE_SECRET_KEY);
  const liveApproved = flag(env.STRIPE_LIVE_MODE_APPROVED);
  const cookieSecure = String(env.VU_COOKIE_SECURE || 'true').toLowerCase() !== 'false';
  return {
    environment: env.VU_ENVIRONMENT === 'production' ? 'production' : 'development',
    siteOrigin, apiOrigin, allowedOrigins,
    supabase: {
      url: origin(env.SUPABASE_URL),
      publishableKey: String(env.SUPABASE_PUBLISHABLE_KEY || ''),
      secretKey: String(env.SUPABASE_SECRET_KEY || ''),
      jwtIssuer: env.SUPABASE_URL ? origin(env.SUPABASE_URL) + '/auth/v1' : '',
      // Nur fuer lokale Supabase-Instanzen mit symmetrischem Schluessel. Gehostete
      // Projekte nutzen asymmetrische Signaturschluessel ueber JWKS.
      legacyJwtSecret: String(env.SUPABASE_JWT_SECRET || ''),
      forwardClientIp: flag(env.SUPABASE_FORWARD_CLIENT_IP),
    },
    stripe: {
      secretKey: String(env.STRIPE_SECRET_KEY || ''),
      webhookSecret: String(env.STRIPE_WEBHOOK_SECRET || ''),
      apiBase: origin(env.STRIPE_API_BASE) || 'https://api.stripe.com',
      apiVersion: String(env.STRIPE_API_VERSION || '2025-03-31.basil'),
      mode: stripeMode,
      liveApproved,
      requireTerms: flag(env.STRIPE_CHECKOUT_REQUIRE_TERMS),
      portalConfiguration: /^bpc_[A-Za-z0-9]+$/.test(String(env.STRIPE_PORTAL_CONFIGURATION || '')) ? env.STRIPE_PORTAL_CONFIGURATION : '',
      checkoutHosts: new Set(['checkout.stripe.com', ...list(env.STRIPE_CHECKOUT_HOSTS)]),
      // Wer den Checkout starten darf: public | testers (Rolle billing_tester) | off.
      // Ohne Angabe im Live-Modus nur Tester (kein versehentlich oeffentlicher Live-Checkout).
      // "public" wirkt im Live-Modus nur zusammen mit freigegebenen Rechtstexten (legalApproved), sonst "testers".
      checkoutAccess: effectiveCheckoutAccess(checkoutAccess(env.VU_CHECKOUT_ACCESS, stripeMode), legalApproved(env), stripeMode),
      requestedCheckoutAccess: checkoutAccess(env.VU_CHECKOUT_ACCESS, stripeMode),
      // Umsatzsteuer: "none" (Bruttopreis ohne Steuerausweis) oder "automatic" (Stripe Tax: Steuer aus dem
      // Bruttopreis herausgerechnet, je nach Kundenland und Registrierung). docs/accounts/STEUER.md.
      tax: taxMode(env.STRIPE_TAX_MODE),
    },
    registration: {
      enabled: flag(env.VU_REGISTRATION_ENABLED),
      allowlist: new Set(list(env.VU_REGISTRATION_ALLOWLIST).map(e => e.toLowerCase())),
    },
    legal: {version: LEGAL_VERSION, status: LEGAL_STATUS, approved: legalApproved(env)},
    brevo: {
      // A Kontaktverwaltung und B Newsletter getrennt schaltbar; beide Vorgabe "aus".
      sync: flag(env.VU_BREVO_SYNC),
      newsletter: flag(env.VU_NEWSLETTER),
      lists: {users: listId(env.VU_BREVO_LIST_USERS), free: listId(env.VU_BREVO_LIST_FREE), pro: listId(env.VU_BREVO_LIST_PRO),
        newsletter: listId(env.VU_BREVO_LIST_NEWSLETTER)},
    },
    mail: {
      apiKey: String(env.BREVO_API_KEY || ''),
      apiBase: origin(env.BREVO_API_BASE) || 'https://api.brevo.com',
      sender: String(env.VU_MAIL_SENDER || ''),
      senderName: String(env.VU_MAIL_SENDER_NAME || 'Vision Universe'),
    },
    cancellation: {
      // "true": ordentliche Kuendigung ohne Anmeldung bei eindeutigem Vorschlag sofort
      // bei Stripe zum Laufzeitende vormerken. "false": Eingang speichern, bestaetigen,
      // Zuordnung vorschlagen; ausfuehren nur durch eine berechtigte Person
      // (scripts/account/cancellations.mjs).
      // Vorgabe des Owners: AUS ("false"), bis zur ausdruecklichen Freigabe.
      autoProcess: String(env.VU_CANCELLATION_AUTO_PROCESS || 'false').toLowerCase() === 'true',
      // Empfaenger von Betriebsalarmen (Kuendigung ueberfaellig, Bestaetigung nicht zustellbar).
      opsAlertEmail: String(env.VU_OPS_ALERT_EMAIL || ''),
    },
    cookies: {
      secure: cookieSecure,
      prefix: cookieSecure ? '__Host-' : '',
      refreshMaxAge: 30 * 24 * 3600,
    },
  };
}

export function supabaseReady(cfg) {
  return Boolean(cfg.supabase.url && cfg.supabase.publishableKey && cfg.supabase.secretKey && cfg.apiOrigin);
}

const listId = value => (/^[1-9][0-9]{0,8}$/.test(String(value || '')) ? Number(value) : null);

// Rechtstexte gelten nur als freigegeben, wenn der Code sie als freigegeben fuehrt UND die
// Konfiguration genau diese Fassung bestaetigt (zwei unabhaengige Schritte).
export function legalApproved(env) {
  return LEGAL_STATUS === 'freigegeben' && String(env.VU_LEGAL_APPROVED || '') === LEGAL_VERSION;
}
// Nur im Live-Modus (echte Zahlungen); Testmodus und Simulation bleiben unveraendert.
export function effectiveCheckoutAccess(access, approved, mode = 'live') {
  return mode === 'live' && access === 'public' && !approved ? 'testers' : access;
}
// Umsatzsteuer: "none" (kein Steuerausweis) oder "automatic" (Stripe Tax). Ein fester Steuersatz (txr_) wird nicht
// mehr unterstuetzt: Nie zwei Steuerberechnungen auf derselben Buchung (docs/accounts/STEUER.md).
export function taxMode(value) {
  return String(value || '').trim() === 'automatic' ? {mode: 'automatic'} : {mode: 'none'};
}

// Warum Abrechnung gerade nicht moeglich ist - oder null.
export function checkoutAccess(value, mode) {
  const v = String(value || '').trim().toLowerCase();
  if (['public', 'testers', 'off'].includes(v)) return v;
  return mode === 'live' ? 'testers' : 'public';
}

export function billingBlocker(cfg) {
  if (!supabaseReady(cfg)) return 'ACCOUNTS_NOT_CONFIGURED';
  if (cfg.stripe.mode === 'missing') return 'BILLING_NOT_CONFIGURED';
  if (cfg.stripe.mode === 'invalid') return 'BILLING_KEY_INVALID';
  if (cfg.stripe.mode === 'live' && !cfg.stripe.liveApproved) return 'BILLING_LIVE_MODE_NOT_APPROVED';
  if (!cfg.stripe.webhookSecret.startsWith('whsec_')) return 'BILLING_WEBHOOK_NOT_CONFIGURED';
  return null;
}

// Erlaubte Rueckspruenge nach Login, Checkout, Portal: feste Pfade, nie aus der Anfrage.
export const SITE_PATHS = Object.freeze({
  account: '/konto/',
  login: '/konto/anmelden/',
  newPassword: '/konto/passwort-neu/',
  subscription: '/konto/abo/',
  plans: '/konto/tarife/',
});
