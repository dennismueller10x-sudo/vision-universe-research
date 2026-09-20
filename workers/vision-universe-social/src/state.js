/* =========================================================================
   vision-universe-social — src/state.js
   OAUTH-STATE OHNE SPEICHER

   -------------------------------------------------------------------------
   DIE ENTSCHEIDUNG, DIE HIER GETROFFEN IST
   -------------------------------------------------------------------------

   Der uebliche Weg, einen OAuth-`state` gegen CSRF abzusichern, ist: Wert
   erzeugen, serverseitig ablegen, im Callback nachschlagen. Das verlangt
   einen Speicher fuer etwas, das zehn Minuten lebt.

   Der `state` ist stattdessen SELBST-VERIFIZIERBAR: er traegt seinen
   eigenen HMAC. Der Worker kann im Callback pruefen, ob er ihn selbst
   ausgestellt hat und wann — ohne irgendwo nachzuschlagen.

   Dazu kommt ein `__Host-`-Cookie mit derselben Nonce (Double Submit).
   Beides zusammen deckt zwei verschiedene Angriffe ab:

     HMAC    faengt einen `state`, den wir nie ausgestellt haben
     Cookie  faengt einen `state`, den wir ausgestellt haben, der aber in
             einem FREMDEN Browser ankommt — der klassische CSRF-Fall, in
             dem jemand dem Owner seinen Autorisierungslink unterschiebt

   Ein HMAC allein wuerde den zweiten Fall nicht fangen. Ein Cookie allein
   nicht den ersten.

   -------------------------------------------------------------------------
   WOHER DER SCHLUESSEL KOMMT
   -------------------------------------------------------------------------

   Abgeleitet aus META_APP_SECRET ueber HMAC mit einem festen Label. Das
   ist eine gewoehnliche Schluesselableitung und vermeidet ein weiteres
   Geheimnis, das jemand setzen, drehen und vergessen kann.

   Der abgeleitete Schluessel wird NIE ausgegeben und nie gespeichert.
   ========================================================================= */

const STATE_LABEL = "vu-social-oauth-state-v1";
const MAX_AGE_SECONDS = 600;          /* 10 Minuten */
const COOKIE_NAME = "__Host-vu_oauth_nonce";

/* ---------------------------------------------------------------- Base64url */

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

/* ------------------------------------------------------------------- HMAC */

async function importKey(secret) {
  return crypto.subtle.importKey(
    "raw", new TextEncoder().encode(String(secret)),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function hmac(secret, message) {
  const key = await importKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key,
    typeof message === "string" ? new TextEncoder().encode(message) : message);
  return new Uint8Array(signature);
}

/** Der abgeleitete State-Schluessel. Verlaesst diese Datei nicht. */
async function stateKey(appSecret) {
  if (!appSecret) throw new Error("stateKey ohne App-Secret");
  return toBase64Url(await hmac(appSecret, STATE_LABEL));
}

/** Vergleich in konstanter Zeit — ohne fruehen Ausstieg bei erster Abweichung. */
export function timingSafeEqual(a, b) {
  const left = String(a === undefined || a === null ? "" : a);
  const right = String(b === undefined || b === null ? "" : b);
  if (left.length === 0 || left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

/* ------------------------------------------------------------------ State */

/**
 * Erzeugt einen signierten `state` und die dazugehoerige Nonce.
 *
 * @returns { state, nonce, cookie }
 */
export async function createState(appSecret, options = {}) {
  const nonceBytes = crypto.getRandomValues(new Uint8Array(32));
  const nonce = toBase64Url(nonceBytes);
  const payload = {
    n: nonce,
    t: Math.floor((options.now === undefined ? Date.now() : options.now) / 1000),
    v: 1
  };
  const encoded = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = toBase64Url(await hmac(await stateKey(appSecret), encoded));
  const state = encoded + "." + signature;

  return {
    state,
    nonce,
    /* __Host- verlangt Secure, Path=/ und KEIN Domain-Attribut. Das
       bindet das Cookie an genau diesen Host und macht es fuer
       Subdomains unerreichbar.
       SameSite=Lax ist hier richtig und nicht zu lasch: der Callback ist
       eine Top-Level-Navigation per GET von Facebook zurueck, und genau
       die laesst Lax zu. Strict wuerde das Cookie beim Rueckweg
       unterdruecken und den Flow brechen. */
    cookie: `${COOKIE_NAME}=${nonce}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}`
  };
}

/**
 * Prueft einen zurueckkommenden `state`.
 *
 * @returns { valid, reason, ageSeconds }
 */
export async function verifyState(appSecret, state, cookieHeader, options = {}) {
  if (typeof state !== "string" || state.indexOf(".") === -1) {
    return { valid: false, reason: "malformedState" };
  }
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) return { valid: false, reason: "malformedState" };

  const expected = toBase64Url(await hmac(await stateKey(appSecret), encoded));
  if (!timingSafeEqual(signature, expected)) {
    return { valid: false, reason: "signatureMismatch" };
  }

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromBase64Url(encoded)));
  } catch (err) {
    return { valid: false, reason: "malformedPayload" };
  }
  if (!payload || payload.v !== 1 || typeof payload.n !== "string" || typeof payload.t !== "number") {
    return { valid: false, reason: "malformedPayload" };
  }

  /* `=== undefined` und nicht `||`: der Zeitpunkt 0 ist ein Zeitpunkt und
     kein fehlender Wert. Dieselbe Stelle in session.js hat genau das
     einmal falsch gemacht, und ein Test mass daraufhin den Abstand zu
     heute statt der Sitzungsdauer. */
  const nowSeconds = Math.floor((options.now === undefined ? Date.now() : options.now) / 1000);
  const ageSeconds = nowSeconds - payload.t;
  /* Auch ein Zeitstempel aus der Zukunft ist ein Fund: er bedeutet, dass
     der `state` nicht aus diesem Lauf stammt. */
  if (ageSeconds < -60) return { valid: false, reason: "futureTimestamp", ageSeconds };
  if (ageSeconds > MAX_AGE_SECONDS) return { valid: false, reason: "expired", ageSeconds };

  const cookieNonce = readCookie(cookieHeader, COOKIE_NAME);
  if (!cookieNonce) return { valid: false, reason: "missingCookie", ageSeconds };
  if (!timingSafeEqual(cookieNonce, payload.n)) {
    return { valid: false, reason: "cookieMismatch", ageSeconds };
  }

  return { valid: true, reason: null, ageSeconds };
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

/** Loescht das Nonce-Cookie — nach dem Callback wird es nicht mehr gebraucht. */
export function clearStateCookie() {
  return `${COOKIE_NAME}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export const STATE_COOKIE_NAME = COOKIE_NAME;
export const STATE_MAX_AGE_SECONDS = MAX_AGE_SECONDS;
