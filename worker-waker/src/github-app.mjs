/* =========================================================================
   VISION UNIVERSE — GitHub-App-Authentifizierung fuer den Wecker

   WARUM APP STATT PAT

   Ein Personal Access Token ist ein Mensch. Es haengt an einem Konto,
   laeuft ab oder eben nicht, und wer es hat, hat es ganz. Eine GitHub
   App ist eine Sache: sie ist auf genau ein Repository installiert, hat
   genau eine Berechtigung (Actions: read and write), und das Token, mit
   dem sie arbeitet, lebt eine Stunde.

   DIE KETTE

     Privater Schluessel (Cloudflare-Secret, verlaesst den Worker nie)
        -> JWT, mit RS256 signiert, gueltig neun Minuten
        -> GET /repos/{repo}/installation      -> Installation ID
        -> POST /app/installations/{id}/access_tokens
        -> Installationstoken, gueltig eine Stunde
        -> POST /repos/{repo}/dispatches       -> der bestehende Takt

   Die Installation ID wird ERMITTELT, nicht konfiguriert. Ein weiterer
   Wert von Hand waere ein weiterer Wert, der falsch sein kann.

   WAS HIER NIE PASSIERT

   Der private Schluessel wird nie protokolliert, nie zurueckgegeben, nie
   in eine URL geschrieben und nie an etwas anderes als die WebCrypto-API
   gereicht. Dasselbe gilt fuer JWT und Installationstoken. Was in den
   Cloudflare-Protokollen landet, sind Ereignisnamen, Zahlen und Gruende.

   ZWEI PEM-FORMATE

   GitHub liefert den Schluessel als PKCS#1 ("BEGIN RSA PRIVATE KEY").
   WebCrypto liest nur PKCS#8 ("BEGIN PRIVATE KEY"). Statt den
   Eigentuemer zu einer openssl-Umwandlung zu zwingen - ein Schritt mehr,
   bei dem ein Schluessel auf der Platte liegen bleiben kann - erkennt
   dieser Code beide Formate und legt die PKCS#8-Huelle bei Bedarf selbst
   herum. Das ist reine DER-Verpackung, keine Kryptografie: der
   Schluessel bleibt Byte fuer Byte derselbe (Test WK-12).
   ========================================================================= */

/* --- DER-Grundlagen ---------------------------------------------------- */

function derLaenge(n) {
  if (n < 0x80) return [n];
  const bytes = [];
  let rest = n;
  while (rest > 0) { bytes.unshift(rest & 0xff); rest = Math.floor(rest / 256); }
  return [0x80 | bytes.length].concat(bytes);
}

function derHuelle(kennung, inhalt) {
  const kopf = [kennung].concat(derLaenge(inhalt.length));
  const raus = new Uint8Array(kopf.length + inhalt.length);
  raus.set(kopf, 0);
  raus.set(inhalt, kopf.length);
  return raus;
}

/* PrivateKeyInfo ::= SEQUENCE { version INTEGER (0),
                                 algorithm AlgorithmIdentifier (rsaEncryption),
                                 privateKey OCTET STRING } */
const VERSION_NULL = [0x02, 0x01, 0x00];
const RSA_ENCRYPTION = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86,
                        0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];

export function pkcs1ZuPkcs8(pkcs1) {
  const oktett = derHuelle(0x04, pkcs1);
  const inhalt = new Uint8Array(VERSION_NULL.length + RSA_ENCRYPTION.length + oktett.length);
  inhalt.set(VERSION_NULL, 0);
  inhalt.set(RSA_ENCRYPTION, VERSION_NULL.length);
  inhalt.set(oktett, VERSION_NULL.length + RSA_ENCRYPTION.length);
  return derHuelle(0x30, inhalt);
}

/* --- Text und Bytes ---------------------------------------------------- */

function base64ZuBytes(b64) {
  const roh = atob(b64);
  const raus = new Uint8Array(roh.length);
  for (let i = 0; i < roh.length; i += 1) raus[i] = roh.charCodeAt(i);
  return raus;
}

function bytesZuBase64Url(bytes) {
  let roh = "";
  for (let i = 0; i < bytes.length; i += 1) roh += String.fromCharCode(bytes[i]);
  return btoa(roh).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function textZuBase64Url(text) {
  return bytesZuBase64Url(new TextEncoder().encode(text));
}

/**
 * Liest ein PEM und sagt, in welchem Format es steckt.
 *
 * Toleriert das, was beim Kopieren durch Oberflaechen passiert:
 * Windows-Zeilenenden, fuehrende Leerzeichen und als Text
 * durchgereichte \n-Folgen. Ein Schluessel, der an einem Leerzeichen
 * scheitert, kostet eine Sitzung Stillstand.
 */
export function lesePem(pem) {
  if (typeof pem !== "string" || pem.length === 0) return null;
  const text = pem.replace(/\\n/g, "\n").replace(/\r/g, "");
  const treffer = /-----BEGIN (RSA )?PRIVATE KEY-----([\s\S]*?)-----END (RSA )?PRIVATE KEY-----/.exec(text);
  if (!treffer) return null;
  const koerper = treffer[2].replace(/\s+/g, "");
  if (koerper.length === 0) return null;
  let bytes;
  try { bytes = base64ZuBytes(koerper); } catch (e) { return null; }
  return { form: treffer[1] ? "PKCS1" : "PKCS8", bytes };
}

/* --- Schluessel und JWT ------------------------------------------------ */

export async function importiereSchluessel(pem, subtle) {
  const gelesen = lesePem(pem);
  if (!gelesen) return null;
  const pkcs8 = gelesen.form === "PKCS1" ? pkcs1ZuPkcs8(gelesen.bytes) : gelesen.bytes;
  const krypto = subtle || crypto.subtle;
  try {
    return await krypto.importKey(
      "pkcs8",
      pkcs8.buffer.slice(pkcs8.byteOffset, pkcs8.byteOffset + pkcs8.byteLength),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,                 /* nicht exportierbar - er soll hier nicht wieder rauskommen */
      ["sign"]
    );
  } catch (e) {
    return null;
  }
}

/**
 * Baut das App-JWT.
 *
 * GitHub verlangt exp - iat <= 600 Sekunden und rechnet in UTC. Die
 * iat liegt bewusst eine Minute in der Vergangenheit: Cloudflares Uhr
 * und GitHubs Uhr sind nicht dieselbe, und ein JWT "aus der Zukunft"
 * wird kommentarlos mit 401 abgelehnt. 540 Sekunden Spanne bleiben
 * unter der Grenze, auch mit dieser Ruecksetzung.
 */
export async function baueJwt(appId, schluessel, jetztMs, subtle) {
  const jetzt = Math.floor((typeof jetztMs === "number" ? jetztMs : Date.now()) / 1000);
  const kopf = textZuBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const inhalt = textZuBase64Url(JSON.stringify({
    iat: jetzt - 60,
    exp: jetzt + 480,
    iss: String(appId)
  }));
  const zuSignieren = kopf + "." + inhalt;
  const krypto = subtle || crypto.subtle;
  const signatur = await krypto.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    schluessel,
    new TextEncoder().encode(zuSignieren)
  );
  return zuSignieren + "." + bytesZuBase64Url(new Uint8Array(signatur));
}

/* --- GitHub-Aufrufe ---------------------------------------------------- */

const KOPF_BASIS = {
  "accept": "application/vnd.github+json",
  "user-agent": "vu-intraday-waker",
  "x-github-api-version": "2022-11-28"
};

/**
 * Welche Installation gehoert zu diesem Repository?
 *
 * Ein Aufruf, ein Wert - statt eines weiteren Eintrags in der
 * Konfiguration, den jemand von Hand richtig abschreiben muss.
 */
export async function holeInstallationId(repo, jwt, netz) {
  const r = await (netz || fetch)(
    "https://api.github.com/repos/" + repo + "/installation",
    { headers: Object.assign({ authorization: "Bearer " + jwt }, KOPF_BASIS) }
  );
  if (!r.ok) return { ok: false, status: r.status };
  const d = await r.json();
  if (!d || !d.id) return { ok: false, status: "ohneId" };
  return { ok: true, id: d.id };
}

export async function holeInstallationstoken(installationId, jwt, netz) {
  const r = await (netz || fetch)(
    "https://api.github.com/app/installations/" + installationId + "/access_tokens",
    { method: "POST", headers: Object.assign({ authorization: "Bearer " + jwt }, KOPF_BASIS) }
  );
  if (!r.ok) return { ok: false, status: r.status };
  const d = await r.json();
  if (!d || !d.token) return { ok: false, status: "ohneToken" };
  const ablauf = d.expires_at ? Date.parse(d.expires_at) : Date.now() + 3600000;
  return { ok: true, token: d.token, ablaufMs: Number.isFinite(ablauf) ? ablauf : Date.now() + 3600000 };
}

/* --- Zwischenspeicher --------------------------------------------------- */

/* Ein Isolat lebt auf Cloudflare wenige Minuten bis Stunden - der
   Zwischenspeicher ist deshalb ein Bonus, keine Zusage. Genau richtig:
   78 Tokenanfragen am Tag waeren auch ohne ihn kein Problem, und ein
   dauerhafter Speicher waere ein Zustand, den dieser Wecker nicht haben
   soll (kein KV, kein DO). Faellt das Isolat weg, wird neu geholt. */
let merkInstallation = null;
let merkToken = null;

export function zuruecksetzen() { merkInstallation = null; merkToken = null; }

const VORLAUF_MS = 5 * 60 * 1000;   /* fuenf Minuten vor Ablauf erneuern */

/**
 * Liefert ein gueltiges Installationstoken - aus dem Zwischenspeicher
 * oder frisch. Gibt im Fehlerfall einen Grund zurueck, nie eine
 * Ausnahme mit Schluesselinhalt darin.
 */
export async function holeZugang(env, optionen) {
  const o = optionen || {};
  const jetzt = typeof o.jetztMs === "number" ? o.jetztMs : Date.now();
  const netz = o.netz || fetch;

  if (merkToken && merkToken.ablaufMs - jetzt > VORLAUF_MS) {
    return { ok: true, token: merkToken.token, ausSpeicher: true };
  }
  if (!env.GITHUB_APP_ID) return { ok: false, grund: "keineAppId" };
  if (!env.GITHUB_APP_PRIVATE_KEY) return { ok: false, grund: "keinSchluessel" };
  if (!env.GITHUB_REPO) return { ok: false, grund: "keinRepo" };

  const schluessel = await importiereSchluessel(env.GITHUB_APP_PRIVATE_KEY, o.subtle);
  if (!schluessel) return { ok: false, grund: "schluesselUnlesbar" };

  let jwt;
  try {
    jwt = await baueJwt(env.GITHUB_APP_ID, schluessel, jetzt, o.subtle);
  } catch (e) {
    return { ok: false, grund: "signaturFehlgeschlagen" };
  }

  if (!merkInstallation) {
    const inst = await holeInstallationId(env.GITHUB_REPO, jwt, netz);
    if (!inst.ok) return { ok: false, grund: "keineInstallation", status: inst.status };
    merkInstallation = inst.id;
  }

  const tok = await holeInstallationstoken(merkInstallation, jwt, netz);
  if (!tok.ok) {
    /* Eine Installation kann entfernt oder neu angelegt werden. Dann ist
       die gemerkte ID falsch, und nur ein Vergessen hilft - sonst
       scheitert jeder weitere Takt an demselben alten Wert. */
    merkInstallation = null;
    return { ok: false, grund: "keinZugangstoken", status: tok.status };
  }
  merkToken = { token: tok.token, ablaufMs: tok.ablaufMs };
  return { ok: true, token: tok.token, ausSpeicher: false, installationErmittelt: true };
}
