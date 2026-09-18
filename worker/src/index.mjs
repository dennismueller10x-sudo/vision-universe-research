/* =========================================================================
   VISION UNIVERSE — worker/src/index.mjs

   Der Eingang. Er tut so wenig wie moeglich.

   Ein Worker nimmt die Verbindung an, prueft den Ursprung und reicht sie
   an das eine Durable Object weiter. Er haelt keinen Zustand, keine
   Kurse und keine Verbindung zum Anbieter - sonst gaebe es zwei Orte,
   an denen Realtime entsteht, und zwei Wahrheiten ueber den letzten
   Kurs.

   WARUM EIN EINZIGES OBJEKT

   idFromName("vu-live-us") ergibt weltweit dieselbe Instanz. Hundert
   Browser auf NVDA landen damit in einem Objekt, das genau ein
   NVDA-Abonnement beim Anbieter haelt. Das ist der ganze Grund, warum
   diese Sache nichts kostet: gezahlt wird nach abonnierten Titeln, nicht
   nach Zuschauern.

   URSPRUENGE

   Der Browser darf nicht selbst bestimmen, wer hier hereinkommt. Die
   Liste steht hier, nicht in der Anfrage. Ein WebSocket kennt kein
   Preflight - der Ursprung wird deshalb beim Upgrade selbst geprueft
   und nicht nur in einem CORS-Kopf beantwortet.

   SCHLUESSEL

   Der Tiingo-Schluessel steht als Cloudflare Secret in der Umgebung. Er
   wird hier nicht gelesen, nicht protokolliert und erscheint in keiner
   Antwort. Auch /health nennt ihn nicht - dort steht nur, ob er gesetzt
   ist.
   ========================================================================= */

export { VuLive } from "./vu-live.mjs";

const VERSION = "vu-live-worker-1.0.0";

/* Die Vision-Universe-Ursprünge, die es heute gibt. research.* ist die
   Discover-Oberflaeche (CNAME im Repo); die beiden anderen sind die
   Hauptdomain, damit ein spaeterer Umzug der Oberflaeche nicht als
   Notfall-Deployment endet. Mehr nicht: jede weitere Zeile hier ist eine
   Erlaubnis, die niemand gebeten hat. */
const ORIGINS = [
  "https://research.visionuniverse.de",
  "https://visionuniverse.de",
  "https://www.visionuniverse.de"
];

/* Genau ein Objekt fuer den US-Handel. Kein Sharding: gemessen sind
   2,22 Mikrosekunden Rechenzeit je Ereignis und rund 8 MB fuer fuenfzig
   Titel - bei einem Kern und 128 MB. */
const OBJECT_NAME = "vu-live-us";

function erlaubterUrsprung(request, env) {
  const ursprung = request.headers.get("Origin");
  if (!ursprung) return null;
  if (ORIGINS.indexOf(ursprung) !== -1) return ursprung;
  /* Nur fuer die oertliche Entwicklung, und nur wenn es ausdruecklich
     gesetzt wurde. In der veroeffentlichten Umgebung ist es nicht
     gesetzt. */
  if (env.ALLOW_LOCAL_ORIGIN === "true" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(ursprung)) {
    return ursprung;
  }
  return null;
}

function korsKoepfe(ursprung) {
  const k = {
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    "vary": "Origin"
  };
  if (ursprung) k["access-control-allow-origin"] = ursprung;
  return k;
}

function json(daten, status, ursprung) {
  return new Response(JSON.stringify(daten, null, 2), {
    status: status || 200,
    headers: Object.assign({ "content-type": "application/json; charset=utf-8",
                             "cache-control": "no-store" },
                           korsKoepfe(ursprung))
  });
}

function objekt(env) {
  const id = env.VU_LIVE.idFromName(OBJECT_NAME);
  return env.VU_LIVE.get(id);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pfad = url.pathname.replace(/\/+$/, "") || "/";
    const ursprung = erlaubterUrsprung(request, env);

    if (request.method === "OPTIONS") {
      /* Ohne erlaubten Ursprung wird kein Kopf gesetzt - der Browser
         lehnt dann von selbst ab, und wir muessen nicht erklaeren,
         warum. */
      return new Response(null, { status: 204, headers: korsKoepfe(ursprung) });
    }

    if (pfad === "/" || pfad === "/version") {
      return json({
        service: "vu-live",
        version: VERSION,
        endpoints: ["/live (WebSocket)", "/health", "/version"],
        priceType: "REALTIME_REFERENCE",
        source: "TIINGO_IEX_LEVEL6",
        note: "Kursreferenz aus einem Teilmarkt, kein offizieller Abschluss."
      }, 200, ursprung);
    }

    if (pfad === "/health") {
      /* Der Zustandsbericht kommt aus dem Objekt selbst - alles andere
         waere eine zweite Meinung ueber denselben Gegenstand. */
      const antwort = await objekt(env).fetch(new Request("https://vu-live/health"));
      const koerper = await antwort.json();
      koerper.worker = { version: VERSION, tiingoKeyConfigured: Boolean(env.TIINGO_API_KEY) };
      return json(koerper, antwort.status, ursprung);
    }

    if (pfad === "/live") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return json({ error: "upgradeRequired",
                      message: "/live spricht WebSocket." }, 426, ursprung);
      }
      /* Ein WebSocket-Upgrade laeuft ohne Preflight durch. Wer hier
         hereinkommt, entscheidet sich deshalb an dieser Stelle - und
         nicht an einem Kopf in der Antwort, den ein Nicht-Browser
         ohnehin ignoriert. */
      if (!ursprung) {
        return json({ error: "originNotAllowed",
                      message: "Dieser Ursprung ist fuer vu-live nicht freigegeben." },
                    403, null);
      }
      return objekt(env).fetch(request);
    }

    return json({ error: "notFound", path: pfad }, 404, ursprung);
  }
};
