/* =========================================================================
   VISION UNIVERSE — preview/server.mjs

   DER VORSCHAUSERVER

   Er liefert die Full-Universe-Vorschau aus und entscheidet VOR dem
   Ausliefern, ob der Anfragende hinein darf. Ohne gueltige Sitzung geht
   keine geschuetzte Datei ueber die Leitung: kein HTML, kein JSON, kein
   Skript.

   WAS DIESER SERVER MIT research.visionuniverse.de ZU TUN HAT: NICHTS.

   Die oeffentliche Seite liegt unveraendert auf GitHub Pages. Pages hat
   keine Serverseite und kann nicht pruefen - deshalb ist die Vorschau
   ein eigener Dienst auf einem eigenen Namen. Die oeffentliche Seite
   wird von dieser Aenderung nicht angefasst; sie weiss nichts davon.

   ENTFERNEN

   Verzeichnis preview/ loeschen, den Dienst abschalten, fertig. Es gibt
   keine Verflechtung mit dem uebrigen Code: dieser Server liest
   Dateien, sonst nichts. Kein Modul der Anwendung importiert ihn.

   AUSFUEHREN

     PREVIEW_USERS='du@example.com:<salt$hash>' \
     PREVIEW_SESSION_SECRET='<zufall>' \
     node preview/server.mjs --port 8080

   Den Hash erzeugt preview/hash-password.mjs.
   ========================================================================= */
import { createServer } from "node:http";
import { createReadStream, statSync, existsSync, readFileSync } from "node:fs";
import { join, dirname, resolve, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import {
  parseUsers, authenticate, issueSession, verifySession,
  cookieHeader, clearCookieHeader, readCookie, createRateLimiter,
  COOKIE_NAME, DEFAULT_TTL_MS
} from "./auth.mjs";

const root = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const PORT = parseInt(arg("--port", process.env.PORT || "8080"), 10);
const HOST = arg("--host", process.env.HOST || "127.0.0.1");
/* Was ausgeliefert wird. Standard ist das Repository selbst - die
   Vorschau zeigt dieselbe Anwendung, nur mit den Daten, die oeffentlich
   noch nicht freigegeben sind. */
const SERVE_ROOT = resolve(arg("--serve-root", process.env.PREVIEW_SERVE_ROOT || root));
/* Unverschluesselt nur fuer Tests. Ohne diese Angabe traegt das Cookie
   Secure und kaeme ueber http nicht zurueck. */
const INSECURE_COOKIES = argv.includes("--insecure-cookies") ||
                         process.env.PREVIEW_INSECURE_COOKIES === "1";
const TTL_MS = parseInt(process.env.PREVIEW_SESSION_TTL_MS || "", 10) || DEFAULT_TTL_MS;
const EPOCH = Number(process.env.PREVIEW_SESSION_EPOCH || 0);

/* ------------------------------------------------------ Zugangsdaten */

const { users, problems } = parseUsers(process.env.PREVIEW_USERS);
const SESSION_SECRET = process.env.PREVIEW_SESSION_SECRET || "";

/* Ohne Zugangsdaten startet der Server NICHT.
   Ein Vorschauserver, der bei fehlender Konfiguration einfach alles
   ausliefert, ist die gefaehrlichste Variante von allen: er sieht aus
   wie ein Schloss und ist eine offene Tuer. */
const startFehler = [];
if (!users.size) startFehler.push("PREVIEW_USERS enthaelt keinen gueltigen Eintrag");
if (SESSION_SECRET.length < 32) {
  startFehler.push("PREVIEW_SESSION_SECRET fehlt oder ist kuerzer als 32 Zeichen");
}
for (const p of problems) startFehler.push("PREVIEW_USERS: " + p);

/* --------------------------------------------------- Was ist geschuetzt */

/* Alles ist geschuetzt - ausser dem, was die Anmeldung selbst braucht.
   Diese Richtung ist wichtig: eine Liste geschuetzter Pfade vergisst
   irgendwann einen, eine Liste offener Pfade nicht. */
const OFFEN = new Set(["/login", "/logout", "/preview-health"]);

/* ----------------------------------------------------------- Zustand */

/* Zurueckgerufene Sitzungen. Die Abmeldung legt die Sitzungs-Id hierher,
   damit ein noch gueltiges Cookie nach dem Abmelden nicht weiterhin
   funktioniert - Cookie loeschen allein genuegt nicht, wer es kopiert
   hat, koennte es zurueckspielen. */
const zurueckgerufen = new Set();
const drossel = createRateLimiter({ max: 5, windowMs: 15 * 60 * 1000 });

/* -------------------------------------------------------- Hilfsmittel */

const TYPEN = {
  ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".gif": "image/gif", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8", ".csv": "text/csv; charset=utf-8"
};

function herkunft(req) {
  /* Hinter einem Proxy steht die echte Herkunft im Kopf. Nur der erste
     Eintrag zaehlt; die uebrigen kann der Anfragende selbst setzen. */
  const weiter = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return weiter || (req.socket && req.socket.remoteAddress) || "unbekannt";
}

/** Will der Anfragende eine Seite sehen oder Daten holen? */
function willSeite(req) {
  const akzeptiert = String(req.headers.accept || "");
  const modus = String(req.headers["sec-fetch-mode"] || "");
  if (modus === "navigate") return true;
  if (String(req.headers["x-requested-with"] || "").toLowerCase() === "fetch") return false;
  return /text\/html/.test(akzeptiert);
}

function sicherheitsKoepfe(extra) {
  return Object.assign({
    /* Die Vorschau darf nicht in einem fremden Rahmen laufen und nicht
       zwischengespeichert werden - ein Proxy, der geschuetzte Antworten
       aufbewahrt, gibt sie dem Naechsten. */
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    Pragma: "no-cache",
    /* Suchmaschinen haben hier nichts zu holen - und sollen es auch
       nicht versuchen. */
    "X-Robots-Tag": "noindex, nofollow, noarchive"
  }, extra || {});
}

function antwort(res, status, koepfe, koerper) {
  res.writeHead(status, sicherheitsKoepfe(koepfe));
  res.end(koerper);
}

/* ------------------------------------------------------ Anmeldeseite */

function anmeldeSeite(meldung) {
  /* Bewusst eine einzige Datei ohne Skript. Es gibt nichts zu tun, was
     JavaScript brauchte, und weniger Angriffsflaeche ist hier gratis. */
  const hinweis = meldung
    ? `<p class="fehler" role="alert">${meldung}</p>`
    : `<p class="hinweis">Interne Vorschau. Zugang nur fuer benannte Tester.</p>`;
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Vision Universe — Interne Vorschau</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center;
         font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
         background:#0e1116; color:#e6edf3; padding:24px; }
  .karte { width:100%; max-width:380px; background:#161b22; border:1px solid #30363d;
           border-radius:10px; padding:28px; }
  h1 { margin:0 0 4px; font-size:17px; letter-spacing:.02em; }
  .marke { font-size:11px; text-transform:uppercase; letter-spacing:.12em;
           color:#7d8590; margin-bottom:18px; }
  label { display:block; font-size:12px; color:#7d8590; margin:14px 0 5px; }
  input { width:100%; padding:9px 11px; border-radius:6px; border:1px solid #30363d;
          background:#0d1117; color:#e6edf3; font-size:14px; }
  input:focus { outline:2px solid #388bfd; outline-offset:-1px; border-color:#388bfd; }
  button { width:100%; margin-top:20px; padding:10px; border:0; border-radius:6px;
           background:#238636; color:#fff; font-size:14px; font-weight:600; cursor:pointer; }
  button:hover { background:#2ea043; }
  .fehler { margin:0 0 6px; padding:9px 11px; border-radius:6px; font-size:13px;
            background:#3d1418; border:1px solid #6e2530; color:#ffb4ab; }
  .hinweis { margin:0 0 6px; font-size:12.5px; color:#7d8590; }
  .fuss { margin:18px 0 0; font-size:11.5px; color:#6e7681; line-height:1.5; }
</style></head>
<body>
  <main class="karte">
    <div class="marke">Vision Universe®</div>
    <h1>Interne Vorschau</h1>
    ${hinweis}
    <form method="POST" action="/login" autocomplete="on">
      <label for="k">Kennung oder E-Mail</label>
      <input id="k" name="username" type="text" required autocapitalize="none"
             autocomplete="username" spellcheck="false" autofocus>
      <label for="p">Passwort</label>
      <input id="p" name="password" type="password" required autocomplete="current-password">
      <button type="submit">Anmelden</button>
    </form>
    <p class="fuss">Befristetes Entwicklungsschloss. Nicht das Kundenkontosystem.
       Die Vorschau zeigt Daten, die oeffentlich nicht freigegeben sind.</p>
  </main>
</body></html>`;
}

/* ----------------------------------------------------- Koerper lesen */

function leseKoerper(req, maxBytes) {
  return new Promise((fertig) => {
    let daten = "";
    let zuGross = false;
    req.on("data", (stueck) => {
      if (zuGross) return;
      daten += stueck;
      /* Ein Anmeldeformular ist winzig. Alles darueber ist kein
         Anmeldeversuch und wird nicht in den Speicher gelesen. */
      if (daten.length > (maxBytes || 4096)) { zuGross = true; daten = ""; }
    });
    req.on("end", () => fertig({ body: daten, tooLarge: zuGross }));
    req.on("error", () => fertig({ body: "", tooLarge: false }));
  });
}

/* --------------------------------------------------- Datei ausliefern */

function liefereDatei(req, res, pfad) {
  let ziel = pfad;
  try {
    const st = statSync(ziel);
    if (st.isDirectory()) {
      const index = join(ziel, "index.html");
      if (!existsSync(index)) return antwort(res, 404, { "Content-Type": "text/plain; charset=utf-8" }, "Nicht gefunden");
      ziel = index;
    }
  } catch (err) {
    return antwort(res, 404, { "Content-Type": "text/plain; charset=utf-8" }, "Nicht gefunden");
  }
  const typ = TYPEN[extname(ziel).toLowerCase()] || "application/octet-stream";
  res.writeHead(200, sicherheitsKoepfe({ "Content-Type": typ }));
  createReadStream(ziel).on("error", () => { try { res.end(); } catch (e) { /* zu */ } }).pipe(res);
}

/* --------------------------------------------------------- Der Server */

export function createPreviewServer() {
  return createServer(async (req, res) => {
    let pfad;
    try { pfad = decodeURIComponent(new URL(req.url, "http://x").pathname); }
    catch (err) { return antwort(res, 400, { "Content-Type": "text/plain; charset=utf-8" }, "Ungueltige Anfrage"); }

    /* Ein Zustandsendpunkt ohne jede Auskunft ueber Inhalte. Er sagt
       "der Dienst lebt" und ob das Schloss scharf ist - nicht mehr. */
    if (pfad === "/preview-health") {
      return antwort(res, startFehler.length ? 503 : 200,
        { "Content-Type": "application/json; charset=utf-8" },
        JSON.stringify({
          service: "vision-universe-preview",
          authConfigured: startFehler.length === 0,
          authenticationRequired: true,
          enforcement: "server-side",
          note: "Befristetes Entwicklungsschloss. Kein Kundenkontosystem."
        }));
    }

    /* Ohne Konfiguration wird nichts ausgeliefert - auch keine
       Anmeldeseite. Sonst entsteht der Eindruck, es fehle nur das
       Passwort, waehrend in Wahrheit das Schloss fehlt. */
    if (startFehler.length) {
      return antwort(res, 503, { "Content-Type": "text/plain; charset=utf-8" },
        "Vorschau nicht konfiguriert. Der Dienst liefert nichts aus.\n");
    }

    /* ------------------------------------------------------ Abmelden */

    if (pfad === "/logout") {
      /* Nur POST. Ein Abmelden per GET liesse sich durch ein fremdes
         Bild auf einer anderen Seite ausloesen. */
      if (req.method !== "POST") {
        return antwort(res, 405, { Allow: "POST", "Content-Type": "text/plain; charset=utf-8" },
          "Abmelden verlangt POST.");
      }
      const token = readCookie(req.headers.cookie, COOKIE_NAME);
      const geprueft = verifySession(token, { secret: SESSION_SECRET, epoch: EPOCH, revoked: zurueckgerufen });
      /* Die Sitzung wird serverseitig zurueckgerufen, nicht nur das
         Cookie geloescht. Ein kopiertes Cookie darf danach nicht mehr
         funktionieren. */
      if (geprueft.valid) zurueckgerufen.add(geprueft.payload.sid);
      return antwort(res, 303, {
        Location: "/login",
        "Set-Cookie": clearCookieHeader({ secure: !INSECURE_COOKIES }),
        "Content-Type": "text/plain; charset=utf-8"
      }, "Abgemeldet.\n");
    }

    /* ------------------------------------------------------- Anmelden */

    if (pfad === "/login") {
      if (req.method === "GET") {
        return antwort(res, 200, { "Content-Type": "text/html; charset=utf-8" }, anmeldeSeite(null));
      }
      if (req.method !== "POST") {
        return antwort(res, 405, { Allow: "GET, POST", "Content-Type": "text/plain; charset=utf-8" },
          "Nur GET und POST.");
      }

      const quelle = herkunft(req);
      const erlaubt = drossel.check(quelle);
      if (!erlaubt.allowed) {
        /* Absichtlich dieselbe Sprache wie bei falschen Daten, nur mit
           Wartezeit: wer draussen ist, soll nicht erfahren, ob er nah
           dran war. */
        return antwort(res, 429, {
          "Content-Type": "text/html; charset=utf-8",
          "Retry-After": String(Math.ceil(erlaubt.retryAfterMs / 1000))
        }, anmeldeSeite("Zu viele Versuche. Spaeter erneut probieren."));
      }

      const { body, tooLarge } = await leseKoerper(req, 4096);
      if (tooLarge) {
        return antwort(res, 413, { "Content-Type": "text/plain; charset=utf-8" }, "Anfrage zu gross.");
      }
      const felder = new URLSearchParams(body);
      const ergebnis = authenticate(felder.get("username"), felder.get("password"), users);

      if (!ergebnis.ok) {
        drossel.fail(quelle);
        /* Im Log steht der Vorgang, nie die eingegebenen Daten. Ein Log,
           das Anmeldeversuche mitschreibt, sammelt Passwoerter - meist
           die richtigen mit einem Tippfehler. */
        console.warn(`[preview] Anmeldung abgelehnt (${ergebnis.reason}) von ${quelle}`);
        return antwort(res, 401, { "Content-Type": "text/html; charset=utf-8" },
          anmeldeSeite("Kennung oder Passwort falsch."));
      }

      drossel.reset(quelle);
      const { token, payload } = issueSession(ergebnis.subject, {
        secret: SESSION_SECRET, ttlMs: TTL_MS, epoch: EPOCH
      });
      console.log(`[preview] Anmeldung erfolgreich fuer ${ergebnis.subject} (Sitzung ${payload.sid.slice(0, 8)}…)`);
      return antwort(res, 303, {
        Location: "/",
        "Set-Cookie": cookieHeader(token, { ttlMs: TTL_MS, secure: !INSECURE_COOKIES }),
        "Content-Type": "text/plain; charset=utf-8"
      }, "Angemeldet.\n");
    }

    /* --------------------------------------- Alles andere ist geschuetzt */

    if (!OFFEN.has(pfad)) {
      const token = readCookie(req.headers.cookie, COOKIE_NAME);
      const geprueft = verifySession(token, {
        secret: SESSION_SECRET, epoch: EPOCH, revoked: zurueckgerufen
      });
      if (!geprueft.valid) {
        /* Eine Seite bekommt eine Umleitung, ein Datenabruf einen
           Fehlercode. Ein 302 auf eine JSON-Anfrage laesst den Aufrufer
           HTML fuer Daten halten - der Fehler ist dann schwerer zu
           finden als die fehlende Berechtigung. */
        if (willSeite(req)) {
          return antwort(res, 302, { Location: "/login", "Content-Type": "text/plain; charset=utf-8" },
            "Anmeldung erforderlich.\n");
        }
        return antwort(res, 401, {
          "Content-Type": "application/json; charset=utf-8",
          "WWW-Authenticate": 'Cookie realm="vision-universe-preview"'
        }, JSON.stringify({
          error: "unauthenticated",
          reason: geprueft.reason,
          message: "Anmeldung erforderlich. Diese Vorschau liefert ohne Sitzung keine Daten aus."
        }));
      }
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      return antwort(res, 405, { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" },
        "Nur GET und HEAD.");
    }

    /* Kein Ausbruch aus dem Wurzelverzeichnis. normalize() allein
       genuegt nicht - erst der Vergleich der aufgeloesten Pfade. */
    const angefragt = resolve(join(SERVE_ROOT, normalize(pfad)));
    if (angefragt !== SERVE_ROOT && !angefragt.startsWith(SERVE_ROOT + "/")) {
      return antwort(res, 403, { "Content-Type": "text/plain; charset=utf-8" }, "Verboten");
    }
    /* Das Verzeichnis .git und die Vorschau selbst gehoeren nicht ins
       Netz - auch nicht fuer angemeldete Tester. */
    const relativ = angefragt.slice(SERVE_ROOT.length);
    if (/(^|\/)(\.git|\.github|node_modules|preview)(\/|$)/.test(relativ)) {
      return antwort(res, 403, { "Content-Type": "text/plain; charset=utf-8" }, "Verboten");
    }

    return liefereDatei(req, res, angefragt);
  });
}

/* --------------------------------------------------------- Startpunkt */

const direktGestartet = process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (direktGestartet) {
  if (startFehler.length) {
    console.error("\n  Vorschau NICHT startklar:\n");
    for (const f of startFehler) console.error("    - " + f);
    console.error("\n  Der Dienst startet trotzdem und liefert 503 - nichts wird ausgeliefert.");
    console.error("  Zugangsdaten erzeugen: node preview/hash-password.mjs\n");
  }
  const server = createPreviewServer();
  server.listen(PORT, HOST, () => {
    /* Den ZUGEWIESENEN Port melden, nicht den angefragten. Mit --port 0
       waehlt das Betriebssystem, und wer dann die konfigurierte 0
       ausgibt, schickt jeden Aufrufer auf Port 0. */
    const vergeben = server.address() && server.address().port;
    console.log(`\n  Vision Universe — Interne Vorschau`);
    console.log(`  Adresse:      http://${HOST}:${vergeben || PORT}`);
    console.log(`  Ausgeliefert: ${SERVE_ROOT}`);
    console.log(`  Schloss:      ${startFehler.length ? "NICHT KONFIGURIERT (503)" : `scharf, ${users.size} Kennung(en)`}`);
    console.log(`  Sitzung:      ${Math.round(TTL_MS / 3600000)} h, Epoche ${EPOCH}` +
                `${INSECURE_COOKIES ? ", COOKIES OHNE Secure (nur fuer Tests)" : ""}\n`);
  });
}
