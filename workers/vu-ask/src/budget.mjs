/* =========================================================================
   VISION UNIVERSE — workers/vu-ask/src/budget.mjs

   DIE HARTE KOSTENGRENZE

   GERECHNET WIRD VORHER (wie zero-cost-guard.js): Bevor eine Frage an das
   Sprachmodell geht, wird der schlechteste Fall ihrer Kosten reserviert -
   volle Eingabe plus die hoechstmoegliche Ausgabe. Passt diese Reservierung
   nicht mehr unter eine der Grenzen, geht die Frage nicht hinaus. Erst die
   Antwort ersetzt die Reservierung durch die tatsaechlich berechneten
   Token. Bleibt eine Antwort aus (Zeitueberschreitung), bleibt die
   Reservierung stehen: lieber zu vorsichtig gezaehlt als zu wenig.

   Die Grenzen, von innen nach aussen:
     pro Nutzer und Tag      VU_ASK_PER_USER_DAILY   (Standard 1)
     alle Nutzer pro Tag     VU_ASK_GLOBAL_DAILY     (Standard 200)
     pro Kalendermonat       VU_ASK_MONTHLY_USD      (Standard 20 $)
     insgesamt               VU_ASK_TOTAL_USD        (Standard 200 $)

   Die aeusserste Grenze steht bewusst UNTER dem Guthaben im
   Anthropic-Konto. Dort ist die letzte Sicherung: Prepaid-Guthaben ohne
   automatisches Nachladen - ist es aufgebraucht, lehnt Anthropic ab, und
   es entsteht keine Rechnung.
   ========================================================================= */

/* US-Dollar je Million Token. Ein Modell, das hier nicht steht, wird
   nicht aufgerufen - ohne Preis keine Reservierung, ohne Reservierung
   kein Aufruf. */
export const PRICES = {
  "claude-haiku-4-5": { input: 1.0, output: 5.0, cacheWrite: 1.25, cacheRead: 0.1 },
};

export const DEFAULTS = {
  perUserDaily: 1,
  globalDaily: 200,
  monthlyUsd: 20,
  totalUsd: 200,
  maxOutputTokens: 1200,
  requestsPerIpDaily: 40,
};

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function limitsFrom(env) {
  return {
    enabled: String(env.VU_ASK_ENABLED || "false") === "true",
    model: env.VU_ASK_MODEL || "claude-haiku-4-5",
    perUserDaily: num(env.VU_ASK_PER_USER_DAILY, DEFAULTS.perUserDaily),
    globalDaily: num(env.VU_ASK_GLOBAL_DAILY, DEFAULTS.globalDaily),
    monthlyUsd: num(env.VU_ASK_MONTHLY_USD, DEFAULTS.monthlyUsd),
    totalUsd: num(env.VU_ASK_TOTAL_USD, DEFAULTS.totalUsd),
    maxOutputTokens: num(env.VU_ASK_MAX_OUTPUT_TOKENS, DEFAULTS.maxOutputTokens),
    requestsPerIpDaily: num(env.VU_ASK_REQUESTS_PER_IP_DAILY, DEFAULTS.requestsPerIpDaily),
  };
}

export function dayKey(now) { return new Date(now).toISOString().slice(0, 10); }
export function monthKey(now) { return new Date(now).toISOString().slice(0, 7); }
export function nextResetIso(now) {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString();
}

/** Kosten einer beantworteten Anfrage aus dem usage-Block der API. */
export function costOf(model, usage) {
  const p = PRICES[model];
  if (!p || !usage) return null;
  const t = (k) => num(usage[k], 0);
  return (t("input_tokens") * p.input + t("output_tokens") * p.output +
          t("cache_creation_input_tokens") * p.cacheWrite + t("cache_read_input_tokens") * p.cacheRead) / 1e6;
}

/** Schlechtester Fall VOR dem Aufruf. Zeichen/3 ueberschaetzt die
    Tokenzahl deutscher Texte bewusst. */
export function worstCase(model, promptChars, maxOutputTokens) {
  const p = PRICES[model];
  if (!p) return null;
  return (Math.ceil(promptChars / 3) * p.input + maxOutputTokens * p.output) / 1e6;
}

/**
 * Darf eine neue Frage an das Modell? Reine Funktion ueber den Zaehlern.
 * @returns {{ok:true}|{ok:false, reason:string}}
 */
export function admit({ limits, reserve, user, day, month, total }) {
  if (!limits.enabled) return { ok: false, reason: "DISABLED" };
  if (!Number.isFinite(reserve)) return { ok: false, reason: "UNPRICED_MODEL" };
  if (user.llm >= limits.perUserDaily) return { ok: false, reason: "USER_DAILY_LIMIT" };
  if (day.llm >= limits.globalDaily) return { ok: false, reason: "GLOBAL_DAILY_LIMIT" };
  if (month.usd + reserve > limits.monthlyUsd) return { ok: false, reason: "MONTHLY_BUDGET" };
  if (total.usd + reserve > limits.totalUsd) return { ok: false, reason: "TOTAL_BUDGET" };
  return { ok: true };
}

export const REASON_TEXT = {
  DISABLED: "Die Fragefunktion ist gerade abgeschaltet.",
  UNPRICED_MODEL: "Die Fragefunktion ist gerade abgeschaltet.",
  USER_DAILY_LIMIT: "Ihre Frage für heute ist verbraucht. Morgen steht wieder eine zur Verfügung.",
  GLOBAL_DAILY_LIMIT: "Das Tageskontingent aller Nutzer ist erreicht. Morgen geht es weiter.",
  MONTHLY_BUDGET: "Das Monatsbudget der Fragefunktion ist ausgeschöpft.",
  TOTAL_BUDGET: "Das Budget der Fragefunktion ist ausgeschöpft.",
  RATE_LIMIT: "Zu viele Anfragen von diesem Anschluss. Bitte morgen erneut versuchen.",
  BOT_CHECK: "Die Sicherheitsprüfung ist fehlgeschlagen. Bitte die Seite neu laden.",
};
