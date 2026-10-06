/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/verify-approval-center.mjs

   DER SMOKE, DER NICHTS VEROEFFENTLICHT

   -------------------------------------------------------------------------
   WAS HIER GEPRUEFT WIRD
   -------------------------------------------------------------------------

   Ob das Approval Center unter seiner echten Adresse steht und sich
   richtig verhaelt — LESEND. Kein Beitrag geht hinaus, keine
   Entscheidung wird getroffen, kein Kandidatenzustand geaendert.

   Die einzige Schreibhandlung ist eine Anmeldung, und sie schreibt
   nichts: das Sitzungstoken ist selbst-verifizierbar, der Worker legt
   es nirgends ab. Danach wird gelesen.

   -------------------------------------------------------------------------
   DER LEERE ZUSTAND IST DER RICHTIGE SMOKE
   -------------------------------------------------------------------------

   Steht ACTIVE_APPROVAL_QUEUE_COUNT auf null, gibt es keinen Beitrag
   anzusehen — und das ist kein unvollstaendiger Test, sondern der
   vollstaendige. Die Frage lautet "verhaelt sich die Oberflaeche
   richtig", nicht "gibt es gerade Arbeit".

   Einen Kandidaten zu erfinden, nur damit der Smoke etwas zu zeigen
   hat, waere genau die Art Beweis, die nichts beweist.

   -------------------------------------------------------------------------
   WAS DIESES SKRIPT NIEMALS TUT
   -------------------------------------------------------------------------

   /approve, /publish oder /reject aufrufen. Nicht als Option, nicht
   hinter einer Flagge. Die Adressen stehen hier nur, um zu pruefen,
   dass ein GET auf sie 405 sagt.

   Ausfuehren:
     VU_SOCIAL_ADMIN_KEY=... node scripts/social/verify-approval-center.mjs
   ========================================================================= */
const WORKER = process.env.VU_SOCIAL_WORKER_URL || "https://social.visionuniverse.de";

const befunde = [];
function befund(id, ok, text) {
  befunde.push({ id, ok, text });
  console.log((ok === true ? "  ja    " : ok === false ? "  NEIN  " : "  offen ") + id);
  if (text) console.log("        " + text);
}

async function hole(pfad, init = {}) {
  const antwort = await fetch(WORKER + pfad, Object.assign({ redirect: "manual" }, init));
  return { status: antwort.status, headers: antwort.headers, text: await antwort.text() };
}

async function main() {
  const key = process.env.VU_SOCIAL_ADMIN_KEY;

  console.log("VISION UNIVERSE SOCIAL — Approval Center, read-only");
  console.log("Adresse: " + WORKER);
  console.log("");

  /* ------------------------------------------------ Laeuft der Worker? */
  let gesundheit = null;
  try {
    const h = await hole("/health");
    gesundheit = JSON.parse(h.text);
    befund("WORKER_ANTWORTET", h.status === 200,
      "HTTP " + h.status + ", Build " + (gesundheit.build || "unbekannt"));
  } catch (err) {
    befund("WORKER_ANTWORTET", false, String(err && err.message));
    return abschluss();
  }

  /* ------------------------------------------- Ohne Anmeldung: nichts */
  const zu = await hole("/approval");
  befund("UNANGEMELDET_VERSCHLOSSEN", zu.status === 401,
    "HTTP " + zu.status + " auf /approval");
  befund("UNANGEMELDET_FORMULAR", /name="adminKey"/.test(zu.text),
    "Der Weg hinein ist sichtbar.");

  /* Was NICHT dastehen darf. Ohne Sitzung gibt es keine Auskunft ueber
     den Betrieb — auch nicht die Zahl der Wartenden. */
  const ohneStil = zu.text.replace(/<style[\s\S]*?<\/style>/gi, "");
  const verraeterisch = [/AWAITING_APPROVAL/, /cand_[0-9]/, /pkg_[0-9a-f]/,
    /\bwartet\b/i, /caption/i, /visionuniverse\.aktienreports/];
  const lecks = verraeterisch.filter((r) => r.test(ohneStil));
  befund("UNANGEMELDET_KEINE_AUSKUNFT", lecks.length === 0,
    lecks.length ? "Gefunden: " + lecks.join(", ") : "Kein Betriebsdetail sichtbar.");

  /* Die Kopfzeilen, die §10 verlangt. */
  const csp = String(zu.headers.get("content-security-policy") || "");
  befund("KOPFZEILEN",
    /default-src 'none'/.test(csp) && /frame-ancestors 'none'/.test(csp)
      && /no-store/.test(String(zu.headers.get("cache-control")))
      && /noindex/.test(String(zu.headers.get("x-robots-tag"))),
    "CSP, no-store und noindex stehen.");

  /* Ein Skript darf die Seite nicht nachladen. */
  befund("KEIN_SKRIPT", !/<script/i.test(zu.text),
    "Die Anmeldeseite laedt kein JavaScript.");

  /* --------------------------------- Der Schluessel in der Adresszeile */
  if (key) {
    const query = await hole("/approval?key=" + encodeURIComponent(key));
    befund("QUERY_SCHLUESSEL_WIRKT_NICHT", query.status === 401,
      "HTTP " + query.status + " — der Schluessel in der URL oeffnet nichts.");
  }

  /* ---------------------------------------------- Entscheidungsrouten */
  /* NUR die Methodenpruefung. Es wird nichts entschieden. */
  const gets = await Promise.all([
    hole("/approval/cand_smoke_nichtvorhanden/publish"),
    hole("/approval/cand_smoke_nichtvorhanden/reject")
  ]);
  befund("ENTSCHEIDUNG_NICHT_PER_LINK",
    gets.every((g) => g.status === 401 || g.status === 405),
    "GET auf die Entscheidungsrouten: " + gets.map((g) => g.status).join(", ") +
    " — ohne Sitzung 401, mit Sitzung 405. Nie 200.");

  /* ------------------------------------------------- Mit Anmeldung */
  if (!key) {
    befund("ANGEMELDETE_ANSICHT", null,
      "Ohne VU_SOCIAL_ADMIN_KEY nicht pruefbar. Der unangemeldete Teil steht.");
    return abschluss();
  }

  const anmeldung = await hole("/approval/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ adminKey: key })
  });
  const cookie = String(anmeldung.headers.get("set-cookie") || "").split(";")[0];

  befund("ANMELDUNG", anmeldung.status === 303 && cookie.startsWith("__Host-"),
    "HTTP " + anmeldung.status + ", Cookie " + (cookie ? cookie.split("=")[0] : "keines"));
  befund("COOKIE_OHNE_GEHEIMNIS", Boolean(cookie) && !cookie.includes(key),
    "Das Cookie traegt einen signierten Zeitstempel, nicht den Schluessel.");

  if (!cookie) return abschluss();

  const offen = await hole("/approval", { headers: { cookie } });
  befund("ANGEMELDETE_ANSICHT", offen.status === 200, "HTTP " + offen.status);

  /* -----------------------------------------------------------------
     DIE ZAHL - UND DREI LAGEN, DIE NICHT VERSCHMELZEN DUERFEN
     ----------------------------------------------------------------- */
  const ueberschrift = (offen.text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || "";
  const sauber = ueberschrift.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const warten = (sauber.match(/^(\d+) Beitr/) || [])[1];

  if (/Noch kein Stand/.test(sauber)) {
    befund("WARTESCHLANGE", null,
      "Es liegt noch keine uebertragene Schlange vor. Das heisst NICHT, dass " +
      "nichts wartet — der naechste Orchestratorlauf traegt sie ein.");
  } else if (/wartet kein Beitrag/.test(sauber)) {
    /* Der leere Zustand IST der richtige Smoke. */
    befund("WARTESCHLANGE", true,
      "ACTIVE_APPROVAL_QUEUE_COUNT = 0. Der leere Zustand ist die korrekte " +
      "Anzeige und der vollstaendige Smoke.");
  } else if (warten) {
    befund("WARTESCHLANGE", true,
      warten + " Beitrag/Beitraege warten. Es wird KEINER angesehen und keiner " +
      "entschieden — dieser Lauf ist read-only.");
  } else {
    befund("WARTESCHLANGE", false, "Unerwartete Ueberschrift: " + sauber);
  }

  befund("ANGEMELDET_OHNE_GEHEIMNIS", !offen.text.includes(key),
    "Auch hinter der Anmeldung steht kein Schluessel im Dokument.");

  abschluss();
}

function abschluss() {
  const rot = befunde.filter((b) => b.ok === false);
  const grau = befunde.filter((b) => b.ok === null);

  console.log("");
  console.log("Geprueft: " + befunde.length + " | nicht erfuellt: " + rot.length +
    " | nicht pruefbar: " + grau.length);
  console.log("");
  console.log("Es wurde NICHTS veroeffentlicht, NICHTS freigegeben und NICHTS abgelehnt.");

  if (rot.length) {
    console.log("");
    console.log("APPROVAL_CENTER_LIVE = false");
    for (const b of rot) console.log("  - " + b.id + ": " + (b.text || ""));
    process.exit(1);
  }
  console.log("APPROVAL_CENTER_LIVE = true" +
    (grau.length ? " (in " + grau.length + " Punkt(en) nicht pruefbar)" : ""));
}

main().catch((err) => {
  /* Ein Netzfehler ist ein Befund und kein Stacktrace. */
  console.log("");
  console.log("ABBRUCH: " + String(err && err.message));
  console.log("APPROVAL_CENTER_LIVE = false (nicht erreichbar)");
  process.exit(1);
});
