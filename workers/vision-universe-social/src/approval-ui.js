/* =========================================================================
   vision-universe-social — src/approval-ui.js
   DIE OBERFLAECHE DES APPROVAL CENTERS

   -------------------------------------------------------------------------
   WARUM EIGENE SEITEN UND NICHT pages.js
   -------------------------------------------------------------------------

   pages.js begleitet genau einen technischen Vorgang: die Autorisierung
   bei Meta. Die Seiten dort duerfen wie ein Werkzeug aussehen, weil der
   Owner sie zweimal im Jahr sieht.

   Das Approval Center ist das Gegenteil: es ist die Oberflaeche, an der
   entschieden wird, was oeffentlich wird. Sie wird auf einem Telefon
   benutzt, im Stehen, mit einem Daumen. Sie zeigt einen Beitrag und
   stellt eine Frage. Ein Entwicklerwerkzeug an dieser Stelle waere nicht
   nur haesslich, sondern falsch: es wuerde zum Ueberfliegen einladen,
   und ueberflogen wird hier nichts.

   -------------------------------------------------------------------------
   WAS DIESE DATEI NICHT TUT
   -------------------------------------------------------------------------

   Sie entscheidet nichts. Sie liest keinen Zustand. Sie bekommt fertige
   Werte und setzt sie in HTML. Jede Frage nach "darf das", "gibt es
   das", "ist das noch aktuell" wird vorher beantwortet, serverseitig,
   in approval.js.

   -------------------------------------------------------------------------
   DIE REGEL, DIE HIER HAERTER IST ALS IRGENDWO SONST
   -------------------------------------------------------------------------

   KEIN GEHEIMNIS IM DOKUMENT.

   Nicht im HTML, nicht in einem Attribut, nicht in einem Skript, nicht
   in einer URL. Diese Seiten laden kein JavaScript-Bundle und tragen
   keinen Schluessel. Die Anmeldung ist ein Formular-POST; danach traegt
   ein HttpOnly-Cookie die Sitzung, und das Dokument weiss von ihr
   nichts.
   ========================================================================= */

function escapeHtml(value) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* -------------------------------------------------------------------------
   SCHWARZ UND WEISS, EDITORIAL, EINE SPALTE

   Keine Rahmen um Karten, keine Farbflaechen fuer Zustaende. Der
   Unterschied zwischen "wartet" und "veroeffentlicht" ist Typografie
   und Abstand, nicht Gruen und Grau. Farbe gibt es an genau einer
   Stelle: dem Knopf, der etwas oeffentlich macht.
   ------------------------------------------------------------------------- */
const STYLE = `
  :root { color-scheme: light; --tinte:#0b0b0b; --papier:#ffffff; --grau:#6b6b6b;
          --linie:#e6e6e6; }
  * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  html,body { margin:0; background:var(--papier); color:var(--tinte); }
  body { font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Helvetica,Arial,sans-serif;
         -webkit-font-smoothing:antialiased;
         padding:env(safe-area-inset-top,0) 0 calc(env(safe-area-inset-bottom,0) + 24px); }
  .blatt { max-width:560px; margin:0 auto; padding:28px 20px 40px; }
  .marke { font-size:11px; letter-spacing:.18em; text-transform:uppercase;
           font-weight:700; margin:0 0 28px; }
  h1 { font-size:26px; line-height:1.2; letter-spacing:-.02em; font-weight:700; margin:0 0 10px; }
  h2 { font-size:13px; letter-spacing:.1em; text-transform:uppercase; font-weight:700;
       color:var(--grau); margin:32px 0 10px; }
  p { margin:0 0 14px; }
  .leise { color:var(--grau); font-size:14px; }
  .linie { border:0; border-top:1px solid var(--linie); margin:28px 0; }
  form { margin:24px 0 0; }
  label { display:block; font-size:12px; letter-spacing:.08em; text-transform:uppercase;
          font-weight:700; color:var(--grau); margin:0 0 8px; }
  input[type=password], input[type=text] {
    width:100%; min-height:52px; padding:14px 16px; font-size:16px;
    color:var(--tinte); background:var(--papier);
    border:1px solid var(--tinte); border-radius:0; appearance:none; }
  input:focus { outline:2px solid var(--tinte); outline-offset:2px; }
  button { width:100%; min-height:52px; margin-top:14px; padding:14px 18px;
    font:inherit; font-weight:700; letter-spacing:.02em;
    color:var(--papier); background:var(--tinte);
    border:1px solid var(--tinte); border-radius:0; cursor:pointer; }
  button.leer { color:var(--tinte); background:var(--papier); }
  .hinweis { border-top:1px solid var(--linie); margin-top:32px; padding-top:16px; }
  article { border-top:1px solid var(--linie); padding:24px 0 8px; }
  .zaehler { font-size:11px; letter-spacing:.14em; text-transform:uppercase;
             font-weight:700; color:var(--grau); margin:0 0 8px; }
  .thema { font-size:13px; letter-spacing:.06em; text-transform:uppercase;
           color:var(--grau); margin:0 0 6px; }
  .hook { font-size:19px; line-height:1.35; font-weight:600; letter-spacing:-.01em;
          margin:0 0 14px; }
  a.weiter { display:inline-block; min-height:48px; line-height:48px; padding:0 22px;
             color:var(--papier); background:var(--tinte); text-decoration:none;
             font-weight:700; font-size:15px; }
  .warnung { border-left:3px solid var(--tinte); padding-left:12px; }
`;

function huelle(titel, inhalt) {
  return `<!DOCTYPE html>
<html lang="de"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow,noarchive">
<meta name="color-scheme" content="light">
<title>${escapeHtml(titel)} — Vision Universe® Social</title>
<style>${STYLE}</style>
</head><body><main class="blatt">
<p class="marke">Vision Universe® Social Approval</p>
${inhalt}
</main></body></html>`;
}

/**
 * Die Kopfzeilen jeder Seite des Approval Centers.
 *
 * `form-action 'self'` und nicht `'none'`: hier gibt es Formulare, und
 * zwar genau die, die zu diesem Host gehoeren. `script-src` fehlt
 * absichtlich vollstaendig — `default-src 'none'` deckt es ab, und eine
 * Seite, die kein Skript laedt, soll auch keines laden duerfen.
 *
 * `img-src https:` ist die einzige Oeffnung: die Vorschau zeigt das
 * Bild, das tatsaechlich veroeffentlicht wuerde, und das liegt unter
 * seiner echten, oeffentlichen Adresse (§5 — Preview ist Payload). Ein
 * nachgebautes Ersatzbild waere eine andere Frage als die, die der
 * Owner beantworten soll.
 */
export function approvalResponse(titel, inhalt, status = 200, headers = {}) {
  return new Response(huelle(titel, inhalt), {
    status,
    headers: Object.assign({
      "content-type": "text/html; charset=utf-8",
      /* `private` zusaetzlich zu `no-store`: was hier steht, darf in
         keinem geteilten Zwischenspeicher liegen. */
      "cache-control": "no-store, private",
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'; img-src https:; " +
        "form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      /* Das Approval Center ist keine oeffentliche Oberflaeche (§10).
         Der Robots-Header wirkt auch dort, wo ein Meta-Tag nicht
         gelesen wird. */
      "x-robots-tag": "noindex, nofollow, noarchive"
    }, headers)
  });
}

/* ------------------------------------------------------------------ */

/**
 * Die Anmeldeseite.
 *
 * SIE ZEIGT NICHTS. Kein Beitrag, keine Anzahl, kein Kontoname, kein
 * Hinweis darauf, ob gerade etwas wartet. Die Zahl der wartenden
 * Beitraege ist selbst eine Auskunft ueber den Betrieb, und ohne
 * Sitzung gibt es hier keine Auskunft (§10).
 *
 * `grund` faerbt nur den Satz darueber, warum die Seite erscheint —
 * nicht, was sie preisgibt.
 */
export function signInPage(grund, headers = {}) {
  const saetze = {
    noSession: "Diese Seite ist der Zugang zur Freigabe. Bitte anmelden.",
    expired: "Die Sitzung ist abgelaufen. Bitte erneut anmelden.",
    signedOut: "Abgemeldet. Die Sitzung auf diesem Geraet ist beendet.",
    wrongKey: "Der Schluessel stimmt nicht.",
    invalid: "Die Sitzung ist nicht mehr gueltig. Bitte erneut anmelden."
  };
  const satz = saetze[grund] || saetze.noSession;
  /* 401 fuer alles, was an fehlender oder ungueltiger Anmeldung liegt;
     200 nur fuer das ausdrueckliche Abmelden — dort ist nichts
     misslungen. */
  const status = grund === "signedOut" ? 200 : 401;

  return approvalResponse("Anmelden", `
<h1>Anmelden</h1>
<p class="leise">${escapeHtml(satz)}</p>
<form method="POST" action="/approval/session" autocomplete="on">
  <label for="adminKey">Owner-Schluessel</label>
  <input id="adminKey" name="adminKey" type="password" required
         autocomplete="current-password" autocapitalize="off"
         autocorrect="off" spellcheck="false" inputmode="text">
  <button type="submit">Anmelden</button>
</form>
<div class="hinweis">
  <p class="leise">Der Schluessel wird einmal gesendet und nicht gespeichert.
  Danach traegt ein Sitzungscookie die Anmeldung — zwoelf Stunden lang,
  auf diesem Geraet, in diesem Browser.</p>
  <p class="leise">Diese Seite veroeffentlicht nichts.</p>
</div>`, status, headers);
}

export { escapeHtml };

/* ------------------------------------------------------------------ */

/** "vor 3 Stunden" statt eines Zeitstempels, den niemand im Kopf umrechnet. */
export function alterInWorten(millisekunden) {
  if (typeof millisekunden !== "number" || !isFinite(millisekunden) || millisekunden < 0) {
    return null;
  }
  const minuten = Math.floor(millisekunden / 60000);
  if (minuten < 1) return "gerade eben";
  if (minuten < 60) return "vor " + minuten + " Minute" + (minuten === 1 ? "" : "n");
  const stunden = Math.floor(minuten / 60);
  if (stunden < 24) return "vor " + stunden + " Stunde" + (stunden === 1 ? "" : "n");
  const tage = Math.floor(stunden / 24);
  return "vor " + tage + " Tag" + (tage === 1 ? "" : "en");
}

/**
 * Die Startseite hinter der Anmeldung.
 *
 * `zustand` traegt alles Entschiedene mit; diese Funktion entscheidet
 * nichts nach. Insbesondere ist `anzahl` die Zahl aus der kanonischen
 * Zustandsmaschine und nicht `items.length` - die beiden koennen
 * auseinanderfallen, und dann ist genau das die Nachricht.
 */
export function landingPage(zustand) {
  const z = zustand || {};
  const anzahl = typeof z.anzahl === "number" ? z.anzahl : null;
  const posten = Array.isArray(z.items) ? z.items : [];

  /* --------------------------------------------------------------
     DREI LAGEN, DIE NICHT ZU ZWEIEN VERSCHMELZEN DUERFEN

       kein Stand    Der Orchestrator hat noch nie uebertragen. Wir
                     wissen NICHT, ob etwas wartet.
       null wartet   Wir wissen es, und es wartet nichts.
       n wartet      Es wartet etwas.

     Die erste als "nichts wartet" anzuzeigen waere die bequemste
     Luege der ganzen Oberflaeche: sie sieht aus wie Ruhe und ist
     Blindheit.
     -------------------------------------------------------------- */
  if (anzahl === null) {
    return approvalResponse("Freigabe", `
<h1>Noch kein Stand</h1>
<p class="leise">Es liegt noch keine uebertragene Warteschlange vor. Das heisst
<em>nicht</em>, dass nichts wartet — es heisst, dass wir es hier nicht wissen.</p>
<p class="leise">Der Orchestrator uebertraegt sie bei seinem naechsten Lauf.</p>
${abmelden()}`);
  }

  if (anzahl === 0) {
    return approvalResponse("Freigabe", `
<h1>Aktuell wartet kein Beitrag auf deine Freigabe.</h1>
${standZeile(z)}
${rest(z)}
${abmelden()}`);
  }

  const liste = posten.map((i, n) => `
<article>
  <p class="zaehler">${n + 1} von ${escapeHtml(String(anzahl))}</p>
  <h2 class="thema">${escapeHtml(i.thema || "Ohne Thema")}</h2>
  <p class="hook">${escapeHtml(i.hook || "")}</p>
  <p><a class="weiter" href="/approval/${encodeURIComponent(i.candidateId)}">Ansehen und entscheiden</a></p>
</article>`).join("");

  /* Die Zahl kommt aus der Engine, die Karten aus der Uebertragung.
     Fallen sie auseinander, steht das da — und wird nicht dadurch
     aufgeloest, dass eine der beiden gewinnt. */
  const luecke = posten.length !== anzahl ? `
<p class="leise warnung">Die Zustandsmaschine meldet ${escapeHtml(String(anzahl))},
uebertragen wurden ${escapeHtml(String(posten.length))}. Der Unterschied ist echt und
kein Anzeigefehler: zu den fehlenden liegt hier kein vollstaendiger Datensatz vor.</p>` : "";

  return approvalResponse("Freigabe", `
<h1>${escapeHtml(String(anzahl))} Beitr${anzahl === 1 ? "ag wartet" : "aege warten"} auf Freigabe.</h1>
${standZeile(z)}
${luecke}
${liste}
${abmelden()}`);
}

function standZeile(z) {
  const alt = z.alter ? escapeHtml(z.alter) : null;
  if (!alt) return "";
  /* Ein alter Stand wird benannt und nicht versteckt. Was er bedeutet,
     entscheidet die Freigabe selbst: dort wird der Abdruck gegen das
     nachgerechnet, was tatsaechlich gesendet wuerde. */
  const warnung = z.veraltet
    ? " Das ist laenger her als ein Orchestratorlauf — moeglicherweise ist der Stand nicht der aktuelle."
    : "";
  return `<p class="leise">Stand: ${alt}.${escapeHtml(warnung)}</p>`;
}

function rest(z) {
  const gehalten = Array.isArray(z.held) ? z.held.length : 0;
  const entschieden = Array.isArray(z.decided) ? z.decided.length : 0;
  if (!gehalten && !entschieden) return "";
  return `<p class="leise">Im Bestand: ${entschieden} entschieden oder abgeloest,
${gehalten} auf einem Haltegrund. Beides wartet nicht auf dich.</p>`;
}

function abmelden() {
  return `<hr class="linie">
<form method="POST" action="/approval/logout">
  <button class="leer" type="submit">Abmelden</button>
</form>`;
}
