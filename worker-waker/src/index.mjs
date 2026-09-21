/* =========================================================================
   VISION UNIVERSE — vu-intraday-waker

   EIN WECKER. MEHR NICHT.

   Am 21.09.2026 legte GitHub ueber eine Stunde lang kein einziges
   Zeitplan-Ereignis fuer den Intraday-Takt an. Kein Fehler, keine
   Meldung - die Ereignisse entstanden schlicht nicht. Ein System, dessen
   Herzschlag von derselben Plattform kommt wie seine Arbeit, hat keinen
   unabhaengigen Puls.

   Dieser Worker ist dieser Puls. Er laeuft auf Cloudflare, also
   ausserhalb von GitHub Actions, und tut genau eine Sache: er ruft den
   bestehenden Taktgeber-Workflow auf.

   WAS ER AUSDRUECKLICH NICHT TUT (Auftrag §8)

     - Er holt keine Kurse. Kein Tiingo-Aufruf, kein Anbieterschluessel.
     - Er baut keine 527 Anfragen in einem Worker nach.
     - Er speichert nichts und kennt keine Daten.
     - Er ist keine zweite Pipeline und keine zweite Source of Truth.

   Die Datenverarbeitung bleibt vollstaendig in der bestehenden
   GitHub-Pipeline. Dieser Worker weiss nur, wie spaet es ist.

   WIE ER SICH AUSWEIST (Eigentuemerentscheidung 21.09.2026)

   Ueber eine GitHub App, nicht ueber ein persoenliches Token. Die App
   ist auf genau dieses Repository installiert und hat genau eine
   Berechtigung: Actions read and write. Der private Schluessel liegt als
   Cloudflare-Secret und verlaesst den Worker nie; aus ihm entsteht bei
   jedem Takt ein JWT, daraus ein Installationstoken mit einer Stunde
   Lebensdauer. Die Installation ID wird ueber die API ermittelt, nicht
   von Hand eingetragen. Details und die Formatfrage: github-app.mjs.

   WARUM EIN EIGENER WORKER UND NICHT vu-live

   vu-live traegt den Realtime-Strom und ein Durable Object. Der Auftrag
   sagt: an dieser Laufzeit nichts aendern. Ein Wecker, der im selben
   Skript sitzt, koennte sie im Fehlerfall mitreissen. Getrennt kann er
   das nicht - und er braucht weder Durable Object noch WebSocket.

   ZERO COST

   Cloudflare Workers Free: 100.000 Anfragen am Tag. Dieser Wecker
   braucht bei einem Takt von fuenf Minuten waehrend einer
   Sechseinhalb-Stunden-Sitzung 78 - also 0,078 % des Kontingents. Kein
   Durable Object, kein KV, kein R2, kein D1.

   WAS FEHLT

   Der private Schluessel als Worker-Secret (GITHUB_APP_PRIVATE_KEY).
   Ohne ihn kann der Wecker nichts ausloesen und sagt das auch - er
   faellt nicht auf einen stillen Leerlauf zurueck. Ihn zu hinterlegen
   ist der einzige Schritt, den nur der Eigentuemer tun kann.
   ========================================================================= */

import { holeZugang } from "./github-app.mjs";

const WORKFLOW = "intraday-pacemaker.yml";

function notiere(ereignis, felder) {
  /* Nur Anzahlen, Gruende und Zustaende - nie ein Schluessel, nie ein
     Token, nie eine URL mit Zugangsdaten. Was hier steht, landet im
     Cloudflare-Protokoll, und das ist lesbar. */
  console.log(JSON.stringify(Object.assign({ ereignis }, felder || {})));
}

/**
 * Laeuft schon ein Block? Dann wird nicht geweckt.
 *
 * Nicht aus Sparsamkeit: ein zweiter Lauf wuerde von der
 * Concurrency-Gruppe ohnehin in die Warteschlange gestellt. Aber eine
 * Warteschlange, in die alle fuenf Minuten etwas faellt, ist ein
 * Trigger-Sturm mit Wartezimmer. Der Auftrag verlangt Deduplication
 * (§17), und die gehoert an die Stelle, die das Wecken ausloest.
 */
async function laeuftSchon(env, kopf) {
  const url = "https://api.github.com/repos/" + env.GITHUB_REPO +
              "/actions/workflows/" + WORKFLOW + "/runs?status=in_progress&per_page=1";
  const r = await fetch(url, { headers: kopf });
  if (!r.ok) return { bekannt: false, grund: "http" + r.status };
  const d = await r.json();
  return { bekannt: true, laeuft: (d.total_count || 0) > 0 };
}

async function wecke(env, optionen) {
  if (!env.GITHUB_REPO) {
    notiere("keinRepo", { hinweis: "GITHUB_REPO ist nicht gesetzt." });
    return { ok: false, grund: "keinRepo" };
  }

  const zugang = await holeZugang(env, optionen);
  if (!zugang.ok) {
    /* Jeder Grund bekommt einen eigenen Namen. "Es ging nicht" waere
       eine Meldung, mit der niemand etwas anfangen kann - und genau die
       Sorte Stille, gegen die dieser Wecker gebaut ist. */
    notiere(zugang.grund, {
      hinweis: HINWEISE[zugang.grund] || "Der Wecker kann sich nicht ausweisen.",
      status: zugang.status
    });
    return { ok: false, grund: zugang.grund };
  }
  if (zugang.installationErmittelt) {
    notiere("installationErmittelt", { hinweis: "Installation ueber die API bestimmt." });
  }

  const kopf = {
    "authorization": "Bearer " + zugang.token,
    "accept": "application/vnd.github+json",
    "user-agent": "vu-intraday-waker",
    "x-github-api-version": "2022-11-28"
  };

  const lage = await laeuftSchon(env, kopf);
  if (lage.bekannt && lage.laeuft) {
    notiere("bereitsWach", { hinweis: "Ein Block laeuft - nicht geweckt." });
    return { ok: true, grund: "bereitsWach" };
  }
  if (!lage.bekannt) {
    /* Unbekannt heisst nicht "nein". Wecken ist hier die sichere
       Richtung: ein ueberfluessiger Lauf endet in Sekunden, ein
       ausgefallener Takt kostet eine Stunde Stillstand. */
    notiere("lageUnbekannt", { grund: lage.grund });
  }

  /* WARUM workflow_dispatch UND NICHT repository_dispatch
     ---------------------------------------------------
     Der Taktgeber hoert auf beides. Die Wahl faellt aber nicht nach
     Geschmack, sondern nach der Berechtigung, die die App hat:

       POST /repos/{repo}/dispatches                      -> Contents: write
       POST /repos/{repo}/actions/workflows/{x}/dispatches -> Actions:  write

     Die App hat Actions read and write und sonst nichts. Ueber
     repository_dispatch bekaeme sie bei jedem Takt ein 403, und der
     Wecker waere eine Attrappe. Der Workflow behaelt beide Eingaenge -
     genutzt wird der, der zur vergebenen Berechtigung passt. */
  const r = await fetch(
    "https://api.github.com/repos/" + env.GITHUB_REPO +
      "/actions/workflows/" + WORKFLOW + "/dispatches",
    {
      method: "POST",
      headers: Object.assign({ "content-type": "application/json" }, kopf),
      body: JSON.stringify({ ref: env.GITHUB_BRANCH || "main" })
    }
  );
  if (!r.ok) {
    notiere("weckenFehlgeschlagen", { status: r.status });
    return { ok: false, grund: "http" + r.status };
  }
  notiere("geweckt", { ausSpeicher: !!zugang.ausSpeicher });
  return { ok: true, grund: "geweckt" };
}

const HINWEISE = {
  keineAppId: "GITHUB_APP_ID fehlt - in wrangler.toml eintragen.",
  keinSchluessel: "GITHUB_APP_PRIVATE_KEY fehlt - der Wecker kann nichts ausloesen.",
  keinRepo: "GITHUB_REPO ist nicht gesetzt.",
  schluesselUnlesbar: "Der hinterlegte Schluessel ist kein lesbares PEM.",
  signaturFehlgeschlagen: "Das App-JWT liess sich nicht signieren.",
  keineInstallation: "Die App ist auf diesem Repository nicht installiert oder darf es nicht sehen.",
  keinZugangstoken: "Die Installation gab kein Token heraus - Berechtigungen pruefen."
};

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(wecke(env));
  },

  /* Ein Zustandspunkt zum Nachsehen. Er weckt nicht und spricht mit
     niemandem - er sagt nur, ob der Wecker eingerichtet ist. Ohne ihn
     liesse sich von aussen nicht unterscheiden, ob der Wecker schweigt,
     weil alles gut ist, oder weil er nie aufgestellt wurde.

     Was hier NICHT steht: der Schluessel, ein Token, die Installation
     ID. Diese Adresse ist oeffentlich erreichbar; sie beantwortet nur
     die Frage "ist etwas hinterlegt", nicht "was". */
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/status") {
      return new Response("vu-intraday-waker", { status: 404 });
    }
    return Response.json({
      dienst: "vu-intraday-waker",
      rolle: "Wecker fuer " + WORKFLOW + " - holt keine Daten",
      ausweis: "github-app",
      appIdHinterlegt: !!env.GITHUB_APP_ID,
      schluesselHinterlegt: !!env.GITHUB_APP_PRIVATE_KEY,
      repo: env.GITHUB_REPO || null,
      zeit: new Date().toISOString()
    });
  }
};

export { wecke, laeuftSchon };
