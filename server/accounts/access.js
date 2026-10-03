"use strict";

/* =========================================================================
   VISION UNIVERSE — Zugangsregel fuer Premium.

   Dieselbe Regel steht in SQL als public.has_premium()
   (supabase/migrations/20261003000000_accounts.sql). Beide aendern sich nur
   gemeinsam; scripts/accounts/tests/access.test.mjs haelt die Faelle fest.

   Zugang besteht, wenn der Status weder "expired" noch "revoked" ist UND
   (kein Ablaufdatum ODER Ablauf in der Zukunft ODER Kulanzfrist laeuft).
   "cancelled" heisst: Verlaengerung abgeschaltet, bezahlter Zeitraum laeuft
   noch - also weiterhin Zugang bis expires_at.
   ========================================================================= */

const STATUSES = Object.freeze(["trial", "active", "grace", "billing_issue", "cancelled", "expired", "revoked"]);
const PREMIUM = "premium";

function time(value) {
  if (value === null || value === undefined || value === "") return null;
  const ms = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : NaN;
}

function hasAccess(row, now = Date.now()) {
  if (!row || row.entitlement !== PREMIUM || !STATUSES.includes(row.status)) return false;
  if (row.status === "expired" || row.status === "revoked") return false;
  const expires = time(row.expires_at), grace = time(row.grace_expires_at);
  if (Number.isNaN(expires) || Number.isNaN(grace)) return false;
  if (expires === null) return true;
  return expires > now || (grace !== null && grace > now);
}

/* Antwort fuer App und Web. Gibt nie Interna wie Event-IDs heraus. */
function accessSummary(rows, now = Date.now()) {
  const row = (Array.isArray(rows) ? rows : []).find((r) => r && r.entitlement === PREMIUM) || null;
  if (!row) return { state: "NONE", premium: false, status: null, store: null, expiresAt: null, trial: false, willRenew: false };
  const premium = hasAccess(row, now);
  return {
    state: premium ? "PREMIUM" : "NONE",
    premium,
    status: row.status,
    store: row.store,
    expiresAt: row.expires_at || null,
    graceExpiresAt: row.grace_expires_at || null,
    trial: premium && row.status === "trial",
    willRenew: Boolean(row.will_renew)
  };
}

module.exports = { STATUSES, PREMIUM, hasAccess, accessSummary };
