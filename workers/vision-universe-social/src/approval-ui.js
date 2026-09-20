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
  figure { margin:0 0 20px; }
  figure img { display:block; width:100%; height:auto; background:#f2f2f2; }
  figcaption { margin-top:8px; }
  dl { margin:0 0 4px; }
  dt { font-size:11px; letter-spacing:.12em; text-transform:uppercase; font-weight:700;
       color:var(--grau); margin:16px 0 2px; }
  dd { margin:0; font-size:16px; }
  .luecke { color:var(--grau); font-style:italic; }
  .caption { white-space:pre-wrap; font-size:16px; }
  .warum { margin:0 0 12px; }
  .warum em { font-style:normal; font-weight:700; }
  .betrieb { border:1px solid var(--tinte); padding:14px 16px; margin:0 0 20px; }
  textarea { width:100%; padding:14px 16px; font:inherit; font-size:16px;
             color:var(--tinte); background:var(--papier);
             border:1px solid var(--tinte); border-radius:0; appearance:none;
             margin-bottom:4px; }
  textarea:focus { outline:2px solid var(--tinte); outline-offset:2px; }
  a.zurueck { color:var(--tinte); font-size:14px; }
  form + form { margin-top:28px; }
  blockquote.grund { margin:16px 0; padding:12px 0 12px 16px;
                     border-left:3px solid var(--tinte); font-size:17px; }
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
${jetztPruefen()}
${abmelden()}`);
  }

  if (anzahl === 0) {
    return approvalResponse("Freigabe", `
<h1>Aktuell wartet kein Beitrag auf deine Freigabe.</h1>
${standZeile(z)}
${soeben(z)}
${rest(z)}
${jetztPruefen()}
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
  /* Gegen `anzahl` und nicht gegen activeCount: die soeben
     Entschiedenen sind aus beiden Zahlen heraus, und sie als Luecke zu
     melden waere eine Warnung ueber etwas, das gerade richtig lief. */
  const luecke = posten.length !== anzahl ? `
<p class="leise warnung">Die Zustandsmaschine meldet ${escapeHtml(String(anzahl))},
uebertragen wurden ${escapeHtml(String(posten.length))}. Der Unterschied ist echt und
kein Anzeigefehler: zu den fehlenden liegt hier kein vollstaendiger Datensatz vor.</p>` : "";

  return approvalResponse("Freigabe", `
<h1>${escapeHtml(String(anzahl))} Beitr${anzahl === 1 ? "ag wartet" : "aege warten"} auf Freigabe.</h1>
${standZeile(z)}
${soeben(z)}
${luecke}
${liste}
${jetztPruefen()}
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

/**
 * Was der Owner soeben entschieden hat, das Repository aber noch nicht
 * weiss.
 *
 * Die Zahl der Maschine ist "Stand generatedAt". Der Worker weiss seit
 * dem Uebertragen mehr: die Entscheidungen, die inzwischen hier
 * gefallen sind. Sie abzuziehen ist KEINE zweite Definition von
 * "wartet" - es ist dieselbe Definition auf neuere Tatsachen
 * angewandt.
 *
 * Gesagt wird es trotzdem. Eine Zahl, die kleiner ist als die der
 * Maschine, ohne dass jemand erfaehrt warum, waere genau die Art
 * stiller Arithmetik, gegen die diese Oberflaeche gebaut ist.
 */
function soeben(z) {
  const n = typeof z.soebenEntschieden === "number" ? z.soebenEntschieden : 0;
  if (!n) return "";
  return `<p class="leise">${n} Beitr${n === 1 ? "ag" : "aege"} soeben entschieden —
noch nicht im Repository. Der naechste Orchestratorlauf holt die Entscheidung ab.</p>`;
}

function rest(z) {
  const gehalten = Array.isArray(z.held) ? z.held.length : 0;
  const entschieden = Array.isArray(z.decided) ? z.decided.length : 0;
  if (!gehalten && !entschieden) return "";
  return `<p class="leise">Im Bestand: ${entschieden} entschieden oder abgeloest,
${gehalten} auf einem Haltegrund. Beides wartet nicht auf dich.</p>`;
}

/* -------------------------------------------------------------------
   DER KNOPF (§2)

   Er steht auf ALLEN drei Lagen der Startseite - gerade auf der, auf
   der nichts wartet. Dort ist die Frage "und jetzt?" am naechsten, und
   ein Knopf, den es nur bei Arbeit gibt, ist bei Stille nicht da.

   Ein Formular, kein Link: ein Link waere ueber ein fremdes Bild
   ausloesbar. Und kein JavaScript - die Seite traegt keines, und
   dieser Knopf ist kein Grund, damit anzufangen.

   Der Satz darunter ist Teil des Knopfes und keine Zierde: er sagt,
   dass hier die UHR uebersprungen wird und nichts sonst.
   ------------------------------------------------------------------- */
function jetztPruefen() {
  return `<hr class="linie">
<form method="POST" action="/approval/run">
  <button class="weiter" type="submit">Jetzt pruefen</button>
</form>
<p class="leise">Startet dieselbe Pruefung, die der Zeitplan zweimal taeglich
startet. Du ueberspringst damit die Uhr — nicht die Pruefungen.</p>`;
}

function abmelden() {
  return `<hr class="linie">
<form method="POST" action="/approval/logout">
  <button class="leer" type="submit">Abmelden</button>
</form>`;
}

/* =========================================================================
   DIE KANDIDATENKARTE

   -------------------------------------------------------------------------
   DIE VORSCHAU IST DIE SENDUNG
   -------------------------------------------------------------------------

   Das Bild auf dieser Seite ist das Bild, das veroeffentlicht wuerde -
   unter seiner echten Adresse, nicht neu gerendert und nicht
   ersatzweise erzeugt. Der Text ist der Text, Zeichen fuer Zeichen,
   ohne Kuerzung und ohne Aufbereitung.

   Wer hier etwas "schoener" darstellt, laesst den Owner etwas
   freigeben, das er nicht gesehen hat, und etwas sehen, das er nicht
   freigibt. Das ist kein Darstellungsdetail, sondern der Unterschied
   zwischen einer Freigabe und einer Vermutung.

   -------------------------------------------------------------------------
   EINE LUECKE IST EINE LUECKE
   -------------------------------------------------------------------------

   Felder ohne Provenance werden ANGEZEIGT - als "nicht in der
   Provenance", nicht weggelassen und nicht gefuellt. Ein weggelassenes
   Feld sieht aus wie ein Feld, das es nicht gibt; ein gefuelltes wie
   eine Antwort. Beides waere falsch, und das zweite gefaehrlich.
   ========================================================================= */

function wert(f) {
  if (!f || typeof f !== "object") return { text: null, fehlt: true };
  if (f.value === null || f.value === undefined || f.value === "") {
    return { text: null, fehlt: true };
  }
  if (Array.isArray(f.value)) {
    return { text: f.value.length ? f.value.join(" · ") : null, fehlt: !f.value.length };
  }
  return { text: String(f.value), fehlt: false };
}

/** Eine Zeile im Steckbrief. Eine Luecke wird sichtbar und nicht still. */
function zeile(beschriftung, f) {
  const w = wert(f);
  const inhalt = w.fehlt
    ? `<span class="luecke">nicht in der Provenance</span>`
    : escapeHtml(w.text);
  return `<dt>${escapeHtml(beschriftung)}</dt><dd>${inhalt}</dd>`;
}

/** Ein Warum-Block. Fehlt alles darin, sagt er genau das. */
function warumBlock(titel, felder) {
  const zeilen = felder.map(([b, f]) => {
    const w = wert(f);
    if (w.fehlt) return null;
    return `<p class="warum">${escapeHtml(b) ? `<em>${escapeHtml(b)}</em> ` : ""}${escapeHtml(w.text)}</p>`;
  }).filter(Boolean);

  if (!zeilen.length) {
    return `<h2>${escapeHtml(titel)}</h2>
<p class="luecke">Dazu steht nichts in der Provenance. Diese Frage bleibt hier
unbeantwortet — sie wird nicht nachtraeglich beantwortet.</p>`;
  }
  return `<h2>${escapeHtml(titel)}</h2>${zeilen.join("")}`;
}

const GUETE_TEXT = {
  BESTANDEN: "bestanden",
  NICHT_BESTANDEN: "nicht bestanden",
  NICHT_ANWENDBAR: "nicht anwendbar",
  NICHT_IN_DER_PROVENANCE: "nicht geprueft"
};

/**
 * Die Karte eines Kandidaten.
 *
 * @param i        ein Eintrag der Projektion
 * @param stelle   { nummer, von }  — "1 von 3"
 * @param hinweis  optionaler Betriebszustand (§12), NIE eine Leistungsaussage
 */
export function candidatePage(i, stelle, hinweis) {
  const a = i.anzeige || {};
  const w = i.warum || {};
  const g = i.guete || {};

  const zaehler = stelle && stelle.von
    ? `<p class="zaehler">${escapeHtml(String(stelle.nummer))} von ${escapeHtml(String(stelle.von))}</p>`
    : "";

  const meldung = hinweis ? `
<div class="betrieb">
  <p><strong>${escapeHtml(hinweis.titel)}</strong></p>
  <p class="leise">${escapeHtml(hinweis.text)}</p>
</div>` : "";

  /* Die Stunde als Uhrzeit. Eine nackte Zahl neben "geplante Zeit"
     laesst offen, ob Stunde, Tag oder Rang gemeint ist. */
  const stunde = a.geplanteStundeUtc && a.geplanteStundeUtc.value !== null
    && a.geplanteStundeUtc.value !== undefined
    ? { value: String(a.geplanteStundeUtc.value).padStart(2, "0") + ":00 UTC",
        basis: a.geplanteStundeUtc.basis }
    : a.geplanteStundeUtc;

  const gueteZeile = g.zustand
    ? `<dt>Qualitaetstor</dt><dd>${escapeHtml(GUETE_TEXT[g.zustand] || g.zustand)}${
        typeof g.score === "number" ? " · " + escapeHtml(String(g.score)) : ""}${
        g.erklaerung ? `<br><span class="leise">${escapeHtml(g.erklaerung)}</span>` : ""}</dd>`
    : "";

  return approvalResponse("Beitrag", `
${zaehler}
${meldung}

<figure>
  <img src="${escapeHtml(i.payload.imageUrl)}" alt="" width="1080" height="1350">
  <figcaption class="leise">Dieses Bild wuerde veroeffentlicht — unter genau dieser Adresse.</figcaption>
</figure>

<h1 class="hook">${escapeHtml((a.hook && a.hook.value) || "Ohne Hook")}</h1>

<h2>Text</h2>
<p class="caption">${escapeHtml(i.payload.caption === null || i.payload.caption === undefined
  ? "" : i.payload.caption)}</p>
<p class="leise">Das ist der Text, der veroeffentlicht wuerde. Wort fuer Wort.</p>

<h2>Steckbrief</h2>
<dl>
  ${zeile("Thema", a.thema)}
  ${zeile("Inhaltsfamilie", a.familie)}
  ${zeile("Kernfrage", a.kernfrage)}
  ${zeile("Format", a.format)}
  ${zeile("Erzaehlrichtung", a.storyRichtung)}
  ${zeile("Hook-Strategie", a.hookStrategie)}
  ${zeile("Visual-Strategie", a.visualStrategie)}
  ${zeile("Erkunden oder Ausnutzen", a.modus)}
  ${zeile("Geplante Zeit", stunde)}
  ${zeile("Evidenz", (w.thema && w.thema.evidenz) || null)}
  ${zeile("Gelegenheit", (w.thema && w.thema.gelegenheit) || null)}
  ${gueteZeile}
</dl>

${warumBlock("Warum dieses Thema", [
  ["", w.thema && w.thema.erklaerung],
  ["Unterlegen:", w.thema && w.thema.alternativen]
])}

${warumBlock("Warum dieser Einstieg", [
  ["", w.einstieg && w.einstieg.erklaerung],
  ["Muster:", w.einstieg && w.einstieg.muster],
  ["Nachbesserung:", w.einstieg && w.einstieg.korrektur]
])}

${warumBlock("Warum dieses Visual", [
  ["", w.visual && w.visual.kernidee],
  ["Auf dem Telefon:", w.visual && w.visual.blickpunkt],
  ["Abgeleitet:", w.visual && w.visual.ableitung],
  ["Muss zeigen:", w.visual && w.visual.mussZeigen],
  ["Darf nicht zeigen:", w.visual && w.visual.darfNichtZeigen]
])}

<hr class="linie">

<form method="POST" action="/approval/${escapeHtml(i.candidateId)}/approve">
  <input type="hidden" name="fingerprint" value="${escapeHtml(i.contentHash)}">
  <button type="submit">Freigeben</button>
</form>

<form method="POST" action="/approval/${escapeHtml(i.candidateId)}/reject">
  <input type="hidden" name="fingerprint" value="${escapeHtml(i.contentHash)}">
  <label for="grund">Was soll besser werden?</label>
  <textarea id="grund" name="reason" rows="3" required
            placeholder="Der Grund geht in die Auswahl zurueck, nicht in die Leistung."></textarea>
  <button class="leer" type="submit">Ablehnen</button>
</form>

<p class="leise hinweis">Eine Ablehnung ist keine Leistungsaussage. Dieser Beitrag
waere nie veroeffentlicht worden und hat deshalb keine Reichweite — weder eine
schlechte noch eine gute.</p>

<p><a class="zurueck" href="/approval">Zurueck zur Uebersicht</a></p>`);
}

/* =========================================================================
   JETZT PRUEFEN — DIE ZWEI ANTWORTEN (§2–§5, §39–§41)

   Der Knopf hat genau zwei Ausgaenge, und beide sagen dem Owner, was
   als Naechstes passiert. "Angestossen" ohne den Satz, was das heisst,
   waere eine Bestaetigung ohne Inhalt: der Owner wuesste nicht, ob er
   gleich einen Beitrag bekommt oder eine Begruendung.
   ========================================================================= */

export function laufAngestossenSeite(d) {
  const zeit = d && d.angestossenAt ? escapeHtml(alterInWorten(d.angestossenAt)) : "gerade eben";
  return approvalResponse("Lauf angestossen", `
<h1>Die Pruefung laeuft.</h1>
<p class="leise">Angestossen ${zeit}. Es ist derselbe Lauf, den der Zeitplan
zweimal taeglich startet — nicht ein schnellerer und nicht ein anderer.</p>
<p class="leise">Was er findet, entscheidet er selbst. Du hast die Uhr
uebersprungen, nicht die Pruefungen: Evidenz, Qualitaet, Portfolio und die
Freigabe stehen unveraendert davor.</p>
<p class="leise">Wenn etwas entsteht, steht es hier. Wenn nichts entsteht, steht
hier, was gesucht wurde und warum nichts genommen wurde.</p>
<p><a class="weiter" href="/approval">Zurueck zur Uebersicht</a></p>
${abmelden()}`);
}

export function laufNichtMoeglichSeite(d) {
  const x = d || {};
  let detail = "";
  if (x.grund === "NICHT_EINGERICHTET") {
    /* Die NAMEN der fehlenden Einstellungen, nie ihre Werte. Wer die
       Seite sieht, soll wissen, was zu tun ist; wer sie nicht sehen
       duerfte, erfaehrt daraus nichts ueber das Geheimnis. */
    detail = `<p class="leise">Es fehlt die Verbindung zum Lauf:
${escapeHtml((x.fehlend || []).join(", "))}. Bis dahin startet der Lauf weiter
nach Zeitplan.</p>`;
  } else if (x.grund === "SCHON_ANGESTOSSEN") {
    detail = `<p class="leise">Er wurde vor Kurzem schon angestossen und arbeitet
noch. Ein zweiter Anstoss erzeugt keinen zweiten Lauf — er wuerde nur warten und
danach dieselbe Arbeit noch einmal machen.</p>
<p class="leise">Wieder moeglich in etwa ${escapeHtml(String(
      Math.ceil((x.wartenSekunden || 0) / 60)))} Minute(n).</p>`;
  } else {
    detail = `<p class="leise">Der Anstoss kam nicht an${
      x.status ? " (Status " + escapeHtml(String(x.status)) + ")" : ""}. Der
Zeitplan laeuft unveraendert weiter; es ist nichts verloren.</p>`;
  }
  return approvalResponse("Lauf nicht angestossen", `
<h1>${escapeHtml(x.satz || "Der Lauf laesst sich nicht anstossen.")}</h1>
${detail}
<p><a class="weiter" href="/approval">Zurueck zur Uebersicht</a></p>
${abmelden()}`);
}
