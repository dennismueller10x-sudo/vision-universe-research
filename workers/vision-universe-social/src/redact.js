/* =========================================================================
   vision-universe-social — src/redact.js

   Der Worker haelt das einzige langlebige Meta-Token des Projekts. Damit
   ist er der Ort, an dem ein Leck am teuersten waere: wer das Token hat,
   kann im Namen von Vision Universe veroeffentlichen.

   Diese Datei ist die letzte Station vor jeder Ausgabe — Antwort, Log,
   Fehlermeldung. Sie entfernt alles, was wie ein Zugangsdatum aussieht.

   WARUM NICHT NUR "WIR LOGGEN EBEN KEINE TOKENS"

   Weil das Token nicht nur dort auftaucht, wo wir es hinschreiben. Meta
   spiegelt in Fehlermeldungen regelmaessig den gesamten Request zurueck,
   inklusive `access_token=` in der URL. Eine Regel, an die man sich
   erinnern muss, ist im dritten Monat keine Regel mehr; eine Funktion,
   durch die jede Ausgabe laeuft, schon.
   ========================================================================= */

const MASK = "[redacted]";

/* Formen, die ein Zugangsdatum haben kann — unabhaengig davon, unter
   welchem Schluessel oder in welchem Satz es steht. */
const TOKEN_SHAPES = [
  /\bEA[A-Za-z0-9]{20,}/g,                                   /* Meta User/Page Token */
  /\bIG[A-Za-z0-9]{20,}/g,                                   /* Instagram Token */
  /\bBearer\s+[A-Za-z0-9._\-]{20,}/gi,
  /\beyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}/g,  /* JWT */
  /access_token=[^&\s"'<>]+/gi,
  /appsecret_proof=[^&\s"'<>]+/gi,
  /client_secret=[^&\s"'<>]+/gi,
  /\bcode=[A-Za-z0-9._\-]{20,}/g                             /* Authorization Code */
];

/* Schluesselnamen, deren WERT immer ersetzt wird. */
const SECRET_KEYS = [
  "access_token", "accesstoken", "pageaccesstoken", "page_access_token",
  "refresh_token", "refreshtoken", "token", "secret", "app_secret", "appsecret",
  "client_secret", "clientsecret", "password", "authorization",
  "appsecret_proof", "code", "state", "adminkey", "admin_key"
];

/**
 * Bereinigt einen String. `extra` nimmt konkrete Werte auf, die in dieser
 * Anfrage im Spiel sind (das App-Secret, das aktuelle Token) — sie werden
 * zusaetzlich woertlich entfernt, auch wenn sie keiner bekannten Form
 * entsprechen.
 */
export function redactText(value, extra) {
  let out = String(value === undefined || value === null ? "" : value);
  for (const secret of extra || []) {
    if (secret && String(secret).length >= 8) out = out.split(String(secret)).join(MASK);
  }
  for (const shape of TOKEN_SHAPES) out = out.replace(shape, MASK);
  return out;
}

/**
 * Tiefe Bereinigung eines beliebigen Werts. Arbeitet auf einer Kopie —
 * eine Bereinigungsfunktion, die ihre Eingabe veraendert, waere ein
 * Seiteneffekt an der empfindlichsten Stelle des Systems.
 */
export function redact(value, extra, depth = 0) {
  if (depth > 12) return MASK;
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactText(value, extra);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, extra, depth + 1));
  if (typeof value !== "object") return MASK;

  const out = {};
  for (const key of Object.keys(value)) {
    if (SECRET_KEYS.includes(key.toLowerCase())) { out[key] = MASK; continue; }
    out[key] = redact(value[key], extra, depth + 1);
  }
  return out;
}

/**
 * Ein Fingerabdruck, aus dem sich der Wert nicht rekonstruieren laesst.
 * Er beantwortet die einzige Frage, die man ohne den Wert stellen muss:
 * "ist das noch dasselbe Token?"
 */
export async function fingerprint(value) {
  if (!value) return null;
  const data = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const REDACT_MASK = MASK;

/* =========================================================================
   DER INHALTSABDRUCK

   -------------------------------------------------------------------------
   WOZU
   -------------------------------------------------------------------------

   Der Owner gibt EINEN Beitrag frei — nicht eine Absicht, nicht eine
   Kennung, sondern genau diesen Text unter genau diesem Bild. Ohne einen
   Abdruck darueber waere "nach der Freigabe nichts mehr aendern" eine
   Zusage, die niemand pruefen kann: zwischen Freigabe und Aufruf liegt
   ein Automat, und ein Automat haelt keine Zusagen, er fuehrt Code aus.

   Der Abdruck macht daraus eine Pruefung. Die Freigabe nennt den
   Abdruck; der Worker rechnet ihn aus dem nach, was tatsaechlich
   gesendet werden soll. Stimmen sie nicht ueberein, wird nicht
   veroeffentlicht — und zwar unabhaengig davon, ob die Abweichung ein
   Angriff, ein Fehler oder ein spaeterer Einfall war.

   -------------------------------------------------------------------------
   WAS HINEINGEHT
   -------------------------------------------------------------------------

   Genau die drei Dinge, die oeffentlich werden: das Inhaltsobjekt, das
   Bild und der Text. Nichts sonst — kein Zeitstempel, keine Version,
   keine Kennung des Freigebenden. Was nicht oeffentlich wird, darf den
   Abdruck nicht aendern, sonst waere eine Freigabe schon dadurch
   ungueltig, dass jemand sie erneut aufschreibt.

   Die Reihenfolge ist festgelegt und nicht alphabetisch sortiert: sie
   steht hier, und dieselbe Reihenfolge steht im Repository. Zwei
   Implementierungen derselben Frage sind unvermeidlich, weil der Worker
   nichts aus dem Repository laden kann — aber sie sind gegeneinander
   getestet.
   ========================================================================= */
export async function contentHash(spec) {
  const kanonisch = JSON.stringify({
    contentId: String((spec && spec.contentId) || ""),
    imageUrl: String((spec && spec.imageUrl) || ""),
    caption: String(spec && spec.caption !== undefined && spec.caption !== null
      ? spec.caption : "")
  });
  const daten = new TextEncoder().encode(kanonisch);
  const digest = await crypto.subtle.digest("SHA-256", daten);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}
