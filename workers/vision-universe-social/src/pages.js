/* =========================================================================
   vision-universe-social — src/pages.js
   DIE SEITEN, DIE DER OWNER IM BROWSER SIEHT

   Sie sind bewusst schlicht: der Worker liefert vier Seiten, kein
   Designsystem. Alles, was der Owner dauerhaft anschaut, steht im
   Command Center unter /social/ — diese Seiten begleiten genau einen
   Vorgang, die Autorisierung.

   EINE REGEL: SIE ZEIGEN NIE EIN TOKEN.

   Auch nicht "nur einmal, damit der Owner es kopieren kann". Der Sinn der
   Worker-Architektur ist, dass das Token an genau einem Ort liegt. Eine
   Seite, die es anzeigt, hebt das auf — der Browserverlauf, der Screenshot
   und der Blick ueber die Schulter sind dann drei neue Orte.
   ========================================================================= */

function escapeHtml(value) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const STYLE = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin:0; background:#fbfaf8; color:#111;
    font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    padding: env(safe-area-inset-top,0) 0 env(safe-area-inset-bottom,0); }
  .wrap { max-width:640px; margin:0 auto; padding:32px 20px 64px; }
  h1 { font-size:20px; letter-spacing:-.01em; margin:0 0 4px; }
  .sub { color:#55534e; font-size:13px; margin:0 0 24px; }
  .card { background:#fff; border:1px solid #e5e3dd; border-radius:10px; padding:18px; margin:0 0 14px; }
  .ok { border-color:#bfe3d0; background:#e8f5ee; }
  .bad { border-color:#f0c4c4; background:#fbeaea; }
  .warn { border-color:#f0dcb4; background:#fdf3e0; }
  dl { margin:0; display:grid; grid-template-columns:1fr; gap:10px; }
  dt { font-size:11px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:#8a8781; }
  dd { margin:2px 0 0; font-size:14px; word-break:break-word; }
  ul { margin:8px 0 0; padding-left:20px; font-size:14px; }
  li { margin:4px 0; }
  code { background:#f1efea; border:1px solid #e5e3dd; border-radius:4px; padding:1px 5px;
    font:12px ui-monospace,SFMono-Regular,Menlo,monospace; word-break:break-all; }
  a.btn { display:inline-block; margin-top:14px; padding:12px 18px; min-height:44px;
    background:#111; color:#fff; text-decoration:none; border-radius:8px; font-weight:600; }
  .muted { color:#55534e; font-size:13px; }
  @media (min-width:560px){ dl { grid-template-columns:200px 1fr; align-items:baseline; }
    dt { grid-column:1; } dd { grid-column:2; } }
`;

function shell(title, body) {
  return `<!DOCTYPE html>
<html lang="de"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<title>${escapeHtml(title)} — Vision Universe Social</title>
<style>${STYLE}</style>
</head><body><div class="wrap">
<h1>Vision Universe® Social</h1>
<p class="sub">Meta- und Instagram-Verbindung</p>
${body}
</div></body></html>`;
}

export function htmlResponse(title, body, status = 200, headers = {}) {
  return new Response(shell(title, body), {
    status,
    headers: Object.assign({
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      /* Diese Seiten laden nichts nach. Die Richtlinie sagt das auch. */
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY"
    }, headers)
  });
}

/* ------------------------------------------------------------------ */

export function successPage(publicRecord, checks, headers = {}) {
  const rows = [
    ["Instagram-Konto", publicRecord.instagramUsername
      ? "@" + publicRecord.instagramUsername : publicRecord.instagramAccountId],
    ["Instagram-Account-ID", publicRecord.instagramAccountId],
    ["Facebook-Seite", publicRecord.pageName || publicRecord.pageId],
    ["Token", "im Worker gespeichert · Fingerabdruck " + (publicRecord.tokenFingerprint || "—")],
    ["Erteilte Rechte", (publicRecord.permissions.granted || []).join(", ") || "keine"]
  ];

  const missing = publicRecord.permissions.missing || [];
  const missingBlock = missing.length
    ? `<div class="card warn"><strong>Nicht erteilte Rechte</strong>
         <ul>${missing.map((m) => `<li><code>${escapeHtml(m)}</code></li>`).join("")}</ul>
         <p class="muted">Die davon abhaengigen Faehigkeiten sind geprueft nicht verfuegbar.
         Das ist kein Fehler, sondern eine Entscheidung im Meta-Dialog. Wenn das so nicht
         gewollt war: erneut verbinden und im Dialog alle Rechte bestaetigt lassen.</p></div>`
    : "";

  const checkList = (checks || []).map((c) =>
    `<li>${c.ok ? "erfuellt" : "offen"} — ${escapeHtml(c.label)}</li>`).join("");

  return htmlResponse("Verbunden", `
<div class="card ok"><strong>Die Verbindung steht.</strong>
<p class="muted">Es wurde nichts veroeffentlicht. Der Worker hat gelesen, aufgeloest und gespeichert.</p></div>
<div class="card"><dl>
${rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join("")}
</dl></div>
${missingBlock}
<div class="card"><strong>Nachweise</strong><ul>${checkList}</ul></div>
<div class="card"><strong>Naechster Schritt</strong>
<p class="muted">Diese Seite kann geschlossen werden. Der Zustand ist jetzt ueber
<code>/social/meta/status</code> abrufbar und erscheint im Social Command Center.</p></div>`,
    200, headers);
}

/**
 * Die Abbruchseite.
 *
 * `details` ist optional und traegt den Befund, den die API geliefert
 * hat — welche Seiten sichtbar waren, welche Felder gefuellt, welche
 * Assets der Nutzer freigegeben hat.
 *
 * Das steht hier und nicht in einem Protokoll, weil ein Abbruch sonst
 * seine eigene Ursache verliert: der Autorisierungscode ist verbraucht,
 * das Token nirgends gespeichert, und die naechste Frage waere wieder
 * "bitte noch einmal einloggen". Ein Fehler, der sagt was er gesehen
 * hat, kostet einen Versuch. Einer, der es nicht sagt, kostet beliebig
 * viele.
 *
 * Es sind ausschliesslich Kennungen und Ja/Nein-Werte — nie ein Token.
 */
export function errorPage(reason, message, status = 400, headers = {}, details = null) {
  const befund = details ? `
<div class="card"><strong>Was die API geantwortet hat</strong>
<pre style="white-space:pre-wrap;word-break:break-word;font-size:.85em;margin:.5em 0 0">${
    escapeHtml(JSON.stringify(details, null, 2))}</pre>
<p class="muted">Kennungen und Ja/Nein-Werte. Kein Token, kein Geheimnis.</p></div>` : "";

  return htmlResponse("Nicht verbunden", `
<div class="card bad"><strong>Die Verbindung wurde nicht hergestellt.</strong>
<p class="muted">Grund: <code>${escapeHtml(reason)}</code></p></div>
<div class="card"><p>${escapeHtml(message)}</p></div>${befund}
<div class="card"><strong>Was jetzt?</strong>
<p class="muted">Der Vorgang wurde abgebrochen, bevor etwas gespeichert wurde. Eine bestehende
Verbindung ist unveraendert. Der Link zum erneuten Versuch ist derselbe wie beim ersten Mal.</p></div>`,
    status, headers);
}

export function disconnectedPage(revoked) {
  return htmlResponse("Getrennt", `
<div class="card ok"><strong>Die Verbindung wurde getrennt.</strong></div>
<div class="card"><p>Der gespeicherte Datensatz einschliesslich Token ist geloescht.</p>
<p class="muted">${revoked
    ? "Die Rechte wurden zusaetzlich bei Meta widerrufen."
    : "Der Widerruf bei Meta konnte nicht bestaetigt werden. Bitte die Berechtigung zusaetzlich " +
      "in den Meta-Einstellungen unter \"Business-Integrationen\" entfernen."}</p></div>`);
}

export function indexPage(publicRecord) {
  const connected = publicRecord && publicRecord.connected;
  return htmlResponse("Status", `
<div class="card ${connected ? "ok" : ""}">
<strong>${connected ? "Verbunden" : "Nicht verbunden"}</strong>
<p class="muted">${connected
    ? "Instagram: @" + escapeHtml(publicRecord.instagramUsername || publicRecord.instagramAccountId)
    : "Der Worker laeuft und wartet auf eine Autorisierung."}</p></div>
<div class="card"><strong>Endpunkte</strong>
<ul>
<li><code>GET /social/meta/connect</code> — Autorisierung starten (Admin-Schluessel noetig)</li>
<li><code>GET /social/meta/callback</code> — Rueckweg von Meta</li>
<li><code>GET /social/meta/status</code> — Zustand als JSON, ohne Token</li>
<li><code>GET /social/meta/verify</code> — Faehigkeiten gegen die echte API pruefen</li>
<li><code>POST /social/meta/disconnect</code> — trennen und loeschen</li>
</ul></div>`);
}
