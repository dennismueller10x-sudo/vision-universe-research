/* =========================================================================
   vision-universe-social — src/session.js
   DIE OWNER-SITZUNG FUERS TELEFON

   -------------------------------------------------------------------------
   WARUM DER BESTEHENDE ZUGANG HIER NICHT REICHT
   -------------------------------------------------------------------------

   Die Admin-Endpunkte nehmen den Schluessel auf zwei Wegen:

     Authorization: Bearer <schluessel>     fuer Skripte und Workflows
     ?key=<schluessel>                      fuer curl von Hand

   Beide sind fuer ein Telefon unbrauchbar. Einen Bearer-Header kann ein
   Browser bei einer gewoehnlichen Navigation nicht mitschicken, und der
   Query-Parameter ist ausdruecklich verboten: er steht in der
   Adresszeile, im Verlauf, in jedem Screenshot und in jedem
   Zugriffsprotokoll, das jemand jemals anlegt.

   Der Auftrag sagt: erweitere die bestehende Architektur MINIMAL, keine
   zweite Identitaetsplattform.

   -------------------------------------------------------------------------
   DIE ERWEITERUNG
   -------------------------------------------------------------------------

   Derselbe Schluessel, EINMAL im Rumpf eines POST gegeben, wird gegen
   ein Sitzungscookie getauscht. Das Cookie traegt kein Geheimnis,
   sondern einen signierten Zeitstempel: der Worker kann nachrechnen,
   dass er ihn selbst ausgestellt hat und wann - ohne irgendwo
   nachzuschlagen.

   Das ist dasselbe Verfahren, das state.js fuer den OAuth-State
   benutzt, und aus demselben Grund: ein Speicher fuer etwas, das
   Stunden lebt, waere ein Speicher mehr, der kaputtgehen kann.

   -------------------------------------------------------------------------
   WORAUS DER SCHLUESSEL ABGELEITET IST
   -------------------------------------------------------------------------

   Aus VU_SOCIAL_ADMIN_KEY ueber HMAC mit festem Label. Damit gilt: wer
   den Admin-Schluessel dreht, entwertet alle laufenden Sitzungen. Das
   ist die Widerrufsmoeglichkeit, die eine zustandslose Sitzung sonst
   nicht hat - und sie kostet nichts.

   Der abgeleitete Schluessel verlaesst diese Datei nicht.
   ========================================================================= */

const SESSION_LABEL = "vu-social-owner-session-v1";
/* Zwoelf Stunden. Lang genug, dass der Owner nicht bei jedem Blick neu
   anmeldet; kurz genug, dass ein liegengelassenes Telefon nicht wochenlang
   freigeben kann. */
const MAX_AGE_SECONDS = 12 * 60 * 60;
/* __Host- verlangt Secure, Path=/ und KEIN Domain-Attribut: das Cookie
   gehoert genau diesem Host und ist fuer Subdomains unerreichbar.
   SameSite=Strict, weil es hier - anders als beim OAuth-Rueckweg - keine
   Navigation von aussen gibt, die das Cookie braeuchte. Eine fremde Seite
   soll keine Freigabe ausloesen koennen. */
const COOKIE_NAME = "__Host-vu_owner_session";

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text) {
  const padded = String(text).replace(/-/g, "+").replace(/_/g, "/")
    .padEnd(Math.ceil(String(text).length / 4) * 4, "=");
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(String(secret)),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key,
    new TextEncoder().encode(String(message))));
}

async function sessionKey(adminKey) {
  if (!adminKey) throw new Error("sessionKey ohne Admin-Schluessel");
  return toBase64Url(await hmac(adminKey, SESSION_LABEL));
}

/** Vergleich in konstanter Zeit. Dieselbe Regel wie in state.js. */
export function timingSafeEqual(a, b) {
  const left = String(a === undefined || a === null ? "" : a);
  const right = String(b === undefined || b === null ? "" : b);
  if (left.length === 0 || left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

export function readCookie(cookieHeader, name) {
  if (typeof cookieHeader !== "string" || !cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

/**
 * Stellt eine Sitzung aus.
 *
 * Das Ergebnis enthaelt KEIN Geheimnis: `token` ist ein signierter
 * Zeitstempel, aus dem sich der Admin-Schluessel nicht zurueckrechnen
 * laesst.
 */
export async function createSession(adminKey, options = {}) {
  const payload = {
    t: Math.floor((options.now === undefined ? Date.now() : options.now) / 1000),
    v: 1
  };
  const encoded = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = toBase64Url(await hmac(await sessionKey(adminKey), encoded));
  const token = encoded + "." + signature;

  return {
    token,
    cookie: `${COOKIE_NAME}=${token}; Path=/; Secure; HttpOnly; ` +
      `SameSite=Strict; Max-Age=${MAX_AGE_SECONDS}`
  };
}

/**
 * Prueft eine Sitzung.
 *
 * Fail closed in jedem Zweig: ohne Admin-Schluessel in der Umgebung gibt
 * es keine gueltige Sitzung, auch keine abgelaufene - dann ist der
 * Worker nicht konfiguriert, und das ist etwas anderes als "nicht
 * angemeldet".
 */
export async function verifySession(adminKey, token, options = {}) {
  if (!adminKey) return { valid: false, reason: "notConfigured" };
  if (typeof token !== "string" || token.indexOf(".") === -1) {
    return { valid: false, reason: "noSession" };
  }
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return { valid: false, reason: "malformed" };

  const expected = toBase64Url(await hmac(await sessionKey(adminKey), encoded));
  if (!timingSafeEqual(signature, expected)) {
    return { valid: false, reason: "signatureMismatch" };
  }

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromBase64Url(encoded)));
  } catch (err) {
    return { valid: false, reason: "malformedPayload" };
  }
  if (!payload || payload.v !== 1 || typeof payload.t !== "number") {
    return { valid: false, reason: "malformedPayload" };
  }

  /* `=== undefined` und nicht `||`: der Zeitpunkt 0 ist ein Zeitpunkt.
     Mit `||` faellt er auf die echte Uhr zurueck, und ein Test, der
     eine Zeitspanne misst, misst dann den Abstand zu heute. */
  const nowSeconds = Math.floor((options.now === undefined ? Date.now() : options.now) / 1000);
  const ageSeconds = nowSeconds - payload.t;
  /* Ein Zeitstempel aus der Zukunft ist ein Fund und keine Kleinigkeit:
     er heisst, dass dieses Token nicht aus diesem Lauf stammt. */
  if (ageSeconds < -60) return { valid: false, reason: "futureTimestamp", ageSeconds };
  if (ageSeconds > MAX_AGE_SECONDS) return { valid: false, reason: "expired", ageSeconds };

  return { valid: true, reason: null, ageSeconds };
}

/** Die Sitzung aus einem Request, ohne dass der Aufrufer das Cookie kennt. */
export async function sessionFromRequest(request, env, options = {}) {
  const token = readCookie(request.headers.get("cookie"), COOKIE_NAME);
  return verifySession(env && env.VU_SOCIAL_ADMIN_KEY, token, options);
}

/** Beendet die Sitzung. */
export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
export const SESSION_MAX_AGE_SECONDS = MAX_AGE_SECONDS;
