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

   Ein GitHub-Token mit actions:write als Worker-Secret
   (GITHUB_DISPATCH_TOKEN). Ohne dieses Token kann der Wecker nichts
   ausloesen und sagt das auch - er faellt nicht auf einen stillen
   Leerlauf zurueck. Das Token anzulegen ist eine Owner-Entscheidung.
   ========================================================================= */

const WORKFLOW = "intraday-pacemaker.yml";

function notiere(ereignis, felder) {
  /* Nur Anzahlen, Gruende und Zustaende - nie ein Token, nie eine URL
     mit Zugangsdaten. Was hier steht, landet im Cloudflare-Protokoll. */
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

async function wecke(env) {
  if (!env.GITHUB_DISPATCH_TOKEN) {
    notiere("keinToken", {
      hinweis: "GITHUB_DISPATCH_TOKEN fehlt - der Wecker kann nichts ausloesen."
    });
    return { ok: false, grund: "keinToken" };
  }
  if (!env.GITHUB_REPO) {
    notiere("keinRepo", { hinweis: "GITHUB_REPO ist nicht gesetzt." });
    return { ok: false, grund: "keinRepo" };
  }

  const kopf = {
    "authorization": "Bearer " + env.GITHUB_DISPATCH_TOKEN,
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

  const r = await fetch(
    "https://api.github.com/repos/" + env.GITHUB_REPO + "/dispatches",
    {
      method: "POST",
      headers: Object.assign({ "content-type": "application/json" }, kopf),
      body: JSON.stringify({
        event_type: "intraday-tick",
        client_payload: { quelle: "cloudflare-cron", at: new Date().toISOString() }
      })
    }
  );
  if (!r.ok) {
    notiere("weckenFehlgeschlagen", { status: r.status });
    return { ok: false, grund: "http" + r.status };
  }
  notiere("geweckt", {});
  return { ok: true, grund: "geweckt" };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(wecke(env));
  },

  /* Ein Zustandspunkt zum Nachsehen. Er weckt nicht und braucht kein
     Token - er sagt nur, ob der Wecker eingerichtet ist. Ohne ihn liesse
     sich von aussen nicht unterscheiden, ob der Wecker schweigt, weil
     alles gut ist, oder weil er nie aufgestellt wurde. */
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/status") {
      return new Response("vu-intraday-waker", { status: 404 });
    }
    return Response.json({
      dienst: "vu-intraday-waker",
      rolle: "Wecker fuer " + WORKFLOW + " - holt keine Daten",
      tokenHinterlegt: !!env.GITHUB_DISPATCH_TOKEN,
      repo: env.GITHUB_REPO || null,
      zeit: new Date().toISOString()
    });
  }
};

export { wecke, laeuftSchon };
