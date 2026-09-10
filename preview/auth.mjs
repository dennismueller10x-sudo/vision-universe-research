/* =========================================================================
   VISION UNIVERSE — preview/auth.mjs

   ZUGANGSPRUEFUNG FUER DIE FULL-UNIVERSE-VORSCHAU

   Was das ist: ein befristetes Entwicklungsschloss. Nur der Eigentuemer
   und ausdruecklich benannte Tester kommen an die Vorschau.

   Was das NICHT ist: das kuenftige Kundenkontosystem von Vision
   Universe. Nichts hier soll dessen Architektur vorwegnehmen. Die
   ganze Vorschau liegt in EINEM Verzeichnis und laesst sich in einem
   Commit entfernen - das ist Absicht und die wichtigste Eigenschaft
   dieses Codes.

   WARUM SERVERSEITIG UND NICHT IM BROWSER

   Ein Passwortfeld in JavaScript ist kein Schloss, sondern ein Schild.
   Wer die Seite laedt, hat die Daten schon. Diese Pruefung entscheidet
   VOR dem Ausliefern: ohne gueltige Sitzung geht keine geschuetzte
   Datei ueber die Leitung - kein HTML, kein JSON, nichts.

   WAS NIE IM REPOSITORY STEHT

   Kein Passwort, kein Hash, kein Sitzungsschluessel. Alles kommt aus
   der Umgebung:

     PREVIEW_USERS            "kennung:scryptHash" je Zeile oder mit ; getrennt
     PREVIEW_SESSION_SECRET   Signierschluessel der Sitzungscookies
     PREVIEW_SESSION_EPOCH    optional; Erhoehen entzieht ALLEN Sitzungen den Zugang

   Der Hash entsteht mit preview/hash-password.mjs. Selbst die Umgebung
   traegt damit nur einen Hash, nicht das Passwort - eine Ebene mehr,
   die nichts kostet.
   ========================================================================= */
import { createHmac, scryptSync, timingSafeEqual, randomBytes } from "node:crypto";

/* scrypt-Parameter. N=16384 ist der Node-Standard und fuer ein
   Entwicklungsschloss reichlich: ein Versuch kostet rund 100 ms, was
   Rateversuche teuer und die Anmeldung nicht spuerbar macht. */
export const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64, saltBytes: 16 };

export const COOKIE_NAME = "vu_preview_session";
/* Wie lange eine Sitzung gilt. Lang genug, dass niemand beim Arbeiten
   staendig neu anmeldet; kurz genug, dass ein vergessener Browser nicht
   wochenlang offen steht. */
export const DEFAULT_TTL_MS = 12 * 3600 * 1000;

/* ---------------------------------------------------------- Passwort */

/** Erzeugt "salt$hash" aus einem Klartextpasswort. Nur fuer das Hilfsskript. */
export function hashPassword(password, saltHex) {
  const salt = saltHex ? Buffer.from(saltHex, "hex") : randomBytes(SCRYPT.saltBytes);
  const hash = scryptSync(String(password), salt, SCRYPT.keylen,
                          { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `${salt.toString("hex")}$${hash.toString("hex")}`;
}

/**
 * Prueft ein Passwort gegen "salt$hash".
 *
 * Vergleicht in konstanter Zeit. Ein Vergleich, der beim ersten
 * abweichenden Byte abbricht, verraet ueber die Antwortzeit, wie weit
 * ein Rateversuch gekommen ist.
 */
export function verifyPassword(password, stored) {
  const teile = String(stored || "").split("$");
  if (teile.length !== 2) return false;
  let salt, erwartet;
  try {
    salt = Buffer.from(teile[0], "hex");
    erwartet = Buffer.from(teile[1], "hex");
  } catch (err) { return false; }
  if (!salt.length || erwartet.length !== SCRYPT.keylen) return false;
  let gerechnet;
  try {
    gerechnet = scryptSync(String(password), salt, SCRYPT.keylen,
                           { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  } catch (err) { return false; }
  return timingSafeEqual(gerechnet, erwartet);
}

/* ------------------------------------------------------- Benutzerliste */

/**
 * Liest PREVIEW_USERS.
 *
 * Form: "kennung:salt$hash", mehrere getrennt durch ";" oder Zeilenumbruch.
 * Die Kennung wird kleingeschrieben verglichen (E-Mail-Adressen sind es
 * praktisch immer), das Passwort niemals.
 *
 * Eine Zeile, die wie ein Klartextpasswort aussieht, wird ABGELEHNT und
 * nicht stillschweigend akzeptiert: ein Schloss, das im Zweifel
 * durchlaesst, ist keines.
 */
export function parseUsers(raw) {
  const nutzer = new Map();
  const probleme = [];
  const zeilen = String(raw || "").split(/[;\n]+/).map((z) => z.trim()).filter(Boolean);
  for (const zeile of zeilen) {
    const trenn = zeile.indexOf(":");
    if (trenn <= 0) { probleme.push("Eintrag ohne Kennung:Hash-Trennung"); continue; }
    const kennung = zeile.slice(0, trenn).trim().toLowerCase();
    const geheim = zeile.slice(trenn + 1).trim();
    if (!/^[0-9a-f]{2,}\$[0-9a-f]{64,}$/i.test(geheim)) {
      /* Absichtlich ohne die Kennung im Text: die Meldung landet im Log. */
      probleme.push("Eintrag traegt keinen scrypt-Hash der Form salt$hash");
      continue;
    }
    nutzer.set(kennung, geheim);
  }
  return { users: nutzer, problems: probleme };
}

/* --------------------------------------------------------- Sitzungen */

function base64url(buf) {
  return Buffer.from(buf).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function vonBase64url(s) {
  return Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/**
 * Baut ein signiertes Sitzungstoken.
 *
 * Aufbau: base64url(nutzlast).base64url(hmac). Die Nutzlast traegt
 * Kennung, Ablauf, eine Sitzungs-Id (fuer den Entzug) und die Epoche.
 * Kein Verschluesseln, nur Signieren - die Nutzlast ist nicht geheim,
 * sie darf nur nicht faelschbar sein.
 */
export function issueSession(kennung, opts) {
  opts = opts || {};
  const jetzt = opts.now || Date.now();
  const nutzlast = {
    sub: String(kennung).toLowerCase(),
    iat: jetzt,
    exp: jetzt + (opts.ttlMs || DEFAULT_TTL_MS),
    sid: opts.sid || randomBytes(16).toString("hex"),
    epoch: opts.epoch === undefined ? 0 : Number(opts.epoch)
  };
  const roh = Buffer.from(JSON.stringify(nutzlast), "utf8");
  const sig = createHmac("sha256", opts.secret).update(roh).digest();
  return { token: `${base64url(roh)}.${base64url(sig)}`, payload: nutzlast };
}

/**
 * Prueft ein Sitzungstoken.
 *
 * Gibt {valid:false, reason} zurueck, nie eine Ausnahme: ein
 * unlesbares Cookie ist ein Alltagsfall (abgelaufen, veraendert,
 * anderer Schluessel) und kein Programmfehler.
 */
export function verifySession(token, opts) {
  opts = opts || {};
  const jetzt = opts.now || Date.now();
  const stuecke = String(token || "").split(".");
  if (stuecke.length !== 2) return { valid: false, reason: "malformed" };

  let roh, sig;
  try { roh = vonBase64url(stuecke[0]); sig = vonBase64url(stuecke[1]); }
  catch (err) { return { valid: false, reason: "malformed" }; }

  const erwartet = createHmac("sha256", opts.secret).update(roh).digest();
  if (sig.length !== erwartet.length) return { valid: false, reason: "badSignature" };
  if (!timingSafeEqual(sig, erwartet)) return { valid: false, reason: "badSignature" };

  let nutzlast;
  try { nutzlast = JSON.parse(roh.toString("utf8")); }
  catch (err) { return { valid: false, reason: "malformed" }; }

  if (!nutzlast || typeof nutzlast.exp !== "number") return { valid: false, reason: "malformed" };
  if (nutzlast.exp <= jetzt) return { valid: false, reason: "expired" };

  /* Die Epoche entzieht ALLEN Sitzungen den Zugang, ohne dass ein
     Serverzustand ueberleben muss. Ein Neustart mit erhoehter Epoche
     ist ein vollstaendiger Rueckruf. */
  const epoche = opts.epoch === undefined ? 0 : Number(opts.epoch);
  if (Number(nutzlast.epoch || 0) !== epoche) return { valid: false, reason: "epochRevoked" };

  /* Einzelner Rueckruf: die Abmeldung legt die Sitzungs-Id hierher. */
  if (opts.revoked && opts.revoked.has(nutzlast.sid)) {
    return { valid: false, reason: "revoked" };
  }

  return { valid: true, payload: nutzlast };
}

/* ------------------------------------------------------------ Cookies */

export function cookieHeader(token, opts) {
  opts = opts || {};
  const teile = [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",                       /* kein Zugriff aus JavaScript */
    "SameSite=Strict",                /* keine Mitgabe an fremde Herkunft */
    `Max-Age=${Math.floor((opts.ttlMs || DEFAULT_TTL_MS) / 1000)}`
  ];
  /* Secure nur weglassen, wenn ausdruecklich unverschluesselt getestet
     wird - sonst kaeme das Cookie ueber http gar nicht an. In der
     Auslieferung ist es immer gesetzt. */
  if (opts.secure !== false) teile.push("Secure");
  return teile.join("; ");
}

export function clearCookieHeader(opts) {
  opts = opts || {};
  const teile = [`${COOKIE_NAME}=`, "Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=0"];
  if (opts.secure !== false) teile.push("Secure");
  return teile.join("; ");
}

export function readCookie(cookieKopf, name) {
  const gesucht = name || COOKIE_NAME;
  for (const stueck of String(cookieKopf || "").split(";")) {
    const i = stueck.indexOf("=");
    if (i < 0) continue;
    if (stueck.slice(0, i).trim() === gesucht) return stueck.slice(i + 1).trim();
  }
  return null;
}

/* ------------------------------------------------- Anmeldedrosselung */

/**
 * Einfache Drosselung je Herkunft.
 *
 * Kein Ersatz fuer eine echte Abwehr, aber sie macht Durchprobieren
 * unbrauchbar: nach `max` Fehlversuchen im Fenster ist die Herkunft
 * gesperrt, und scrypt kostet ohnehin je Versuch rund 100 ms.
 *
 * Der Zustand liegt im Arbeitsspeicher. Fuer ein befristetes
 * Entwicklungsschloss ist das richtig - ein Neustart loescht ihn, und
 * ein Neustart ist hier ein seltener, bewusster Vorgang.
 */
export function createRateLimiter(opts) {
  opts = opts || {};
  const max = opts.max || 5;
  const fensterMs = opts.windowMs || 15 * 60 * 1000;
  const versuche = new Map();

  return {
    /** Darf diese Herkunft es noch versuchen? */
    check(schluessel, now) {
      const jetzt = now || Date.now();
      const liste = (versuche.get(schluessel) || []).filter((t) => jetzt - t < fensterMs);
      versuche.set(schluessel, liste);
      return { allowed: liste.length < max, remaining: Math.max(0, max - liste.length),
               retryAfterMs: liste.length >= max ? fensterMs - (jetzt - liste[0]) : 0 };
    },
    /** Einen Fehlversuch vermerken. Erfolge zaehlen nicht. */
    fail(schluessel, now) {
      const jetzt = now || Date.now();
      const liste = (versuche.get(schluessel) || []).filter((t) => jetzt - t < fensterMs);
      liste.push(jetzt);
      versuche.set(schluessel, liste);
    },
    /** Nach einer erfolgreichen Anmeldung ist die Herkunft entlastet. */
    reset(schluessel) { versuche.delete(schluessel); },
    size() { return versuche.size; }
  };
}

/* ------------------------------------------------------- Anmeldelogik */

/**
 * Die eigentliche Entscheidung.
 *
 * Gibt immer dieselbe Ablehnung zurueck - "Kennung oder Passwort falsch".
 * Zu sagen, WELCHES falsch war, verraet, welche Kennungen existieren.
 */
export function authenticate(kennung, passwort, nutzer) {
  const gesucht = String(kennung || "").trim().toLowerCase();
  if (!gesucht || !passwort) return { ok: false, reason: "missingCredentials" };

  const gespeichert = nutzer.get(gesucht);
  if (!gespeichert) {
    /* Auch fuer eine unbekannte Kennung einmal rechnen, damit die
       Antwortzeit nicht verraet, ob es sie gibt. */
    verifyPassword(passwort, `${"00".repeat(SCRYPT.saltBytes)}$${"00".repeat(SCRYPT.keylen)}`);
    return { ok: false, reason: "invalidCredentials" };
  }
  if (!verifyPassword(passwort, gespeichert)) {
    return { ok: false, reason: "invalidCredentials" };
  }
  return { ok: true, subject: gesucht };
}
