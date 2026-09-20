/* =========================================================================
   vision-universe-social — tests/harness.mjs

   Der Worker laeuft in der CI ohne Cloudflare und ohne Meta.

   Moeglich ist das, weil er ausschliesslich Web-Standards benutzt — fetch,
   crypto.subtle, URL, Request, Response. Node 22 hat alle davon. Was
   fehlt, ist die KV-Bindung und der echte Graph-Endpunkt; beides wird
   hier ersetzt.

   DAS IST KEIN NACHBAU VON META.

   Der Graph-Doppelgaenger haelt sich an das, was die Graph API
   dokumentiert zurueckgibt, und laesst sich auf jeden Fehlerfall stellen.
   Wer damit gruen ist, hat bewiesen, dass unser Ablauf stimmt — nicht,
   dass Meta mitspielt. Das beweist nur der Lauf gegen Meta, und der ist
   ausdruecklich kein CI-Schritt.
   ========================================================================= */

/** Eine KV-Bindung im Arbeitsspeicher. Dieselbe Oberflaeche wie Workers KV. */
export function createKV(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    async get(key) { return store.has(key) ? store.get(key) : null; },
    async put(key, value) { store.set(key, String(value)); },
    async delete(key) { store.delete(key); },
    /* Workers KV kann Schluessel auflisten, und der Entscheidungsjournal
       braucht das: ein Schluessel je Entscheidung, damit zwei gleichzeitige
       Eintraege einander nicht ueberschreiben.

       Nachgebildet wird genau die Form, die der echte Aufruf liefert -
       `{ keys: [{name}], list_complete, cursor }` -, nicht eine bequemere.
       Eine Attrappe, die mehr kann als das Original, verschiebt den
       Fehler nur nach hinten. */
    async list(options = {}) {
      const prefix = String(options.prefix || "");
      const grenze = Math.max(1, Number(options.limit) || 1000);
      const alle = [...store.keys()].filter((k) => k.startsWith(prefix)).sort();
      const ab = options.cursor ? alle.indexOf(options.cursor) + 1 : 0;
      const seite = alle.slice(ab, ab + grenze);
      const fertig = ab + seite.length >= alle.length;
      return {
        keys: seite.map((name) => ({ name })),
        list_complete: fertig,
        cursor: fertig ? undefined : seite[seite.length - 1]
      };
    },
    /* Nur fuer Tests: hineinschauen, ohne den Vertrag zu erweitern. */
    __raw() { return store; },
    __size() { return store.size; }
  };
}

export const TEST_APP_ID = "1234567890123456";
/* Traegt bewusst das Platzhalter-Praefix, das die Geheimnistests des
   Repositories kennen — ein Test braucht einen Wert in Schluesselform,
   sonst prueft er nicht, was er pruefen soll. */
export const TEST_APP_SECRET = "geheim-app-secret-nur-fuer-tests-0123456789";
export const TEST_ADMIN_KEY = "geheim-admin-key-mindestens-32-zeichen-lang-0123";
export const TEST_BASE_URL = "https://vision-universe-social.example.invalid";

export const SHORT_USER_TOKEN = "EAA" + "s".repeat(60);
export const LONG_USER_TOKEN = "EAA" + "l".repeat(60);
export const PAGE_TOKEN = "EAA" + "p".repeat(60);

export const DEFAULT_GRANTED = [
  "instagram_basic", "instagram_content_publish", "instagram_manage_insights",
  "instagram_manage_comments", "pages_show_list", "pages_read_engagement"
];

/**
 * Ein Graph-Doppelgaenger.
 *
 * @param options.granted        erteilte Rechte
 * @param options.pages          Seiten mit/ohne Instagram-Konto
 * @param options.failOn         { "me/permissions": {code:190,...} }
 * @param options.onCall         Beobachter fuer jede Anfrage
 */
export function createGraph(options = {}) {
  const granted = options.granted || DEFAULT_GRANTED;
  const pages = options.pages !== undefined ? options.pages : [{
    id: "page_100", name: "Vision Universe",
    access_token: PAGE_TOKEN,
    instagram_business_account: { id: "17841400000000001", username: "visionuniverse", name: "Vision Universe" }
  }];
  const failOn = options.failOn || {};
  const calls = [];

  /* Fuer den Business-Login-Weg: welche Assets das Token freigibt, und
     was die API zu jeder einzelnen Asset-ID sagt. Beides ist bewusst
     getrennt — der reale Fall war ja gerade, dass die Freigabe existiert
     und die Sammelabfrage sie nicht zeigt. */
  const granularScopes = options.granularScopes || null;
  const assets = options.assets || null;

  function respond(body, status = 200) {
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(JSON.stringify(body))
    });
  }

  function errorFor(key) {
    const spec = failOn[key];
    if (!spec) return null;
    return respond({ error: Object.assign({ message: "fehlgeschlagen" }, spec) },
      spec.status || 400);
  }

  const fetchImpl = (rawUrl, init = {}) => {
    const url = new URL(rawUrl);
    const path = url.pathname.split("/").slice(2).join("/");   /* Version entfernen */
    calls.push({ path, method: (init && init.method) || "GET", url: rawUrl });

    const forced = errorFor(path);
    if (forced) return forced;

    if (path === "oauth/access_token") {
      if (url.searchParams.get("grant_type") === "fb_exchange_token") {
        return respond({ access_token: LONG_USER_TOKEN, expires_in: 5184000 });
      }
      if (!url.searchParams.get("code")) {
        return respond({ error: { message: "missing code", code: 100 } }, 400);
      }
      return respond({ access_token: SHORT_USER_TOKEN, expires_in: 3600 });
    }

    if (path === "me/permissions") {
      if ((init && init.method) === "DELETE") return respond({ success: true });
      return respond({
        data: DEFAULT_GRANTED.map((permission) => ({
          permission, status: granted.includes(permission) ? "granted" : "declined"
        }))
      });
    }

    if (path === "me/accounts") return respond({ data: pages });

    if (path === "debug_token") {
      return respond({ data: {
        scopes: granted,
        granular_scopes: (granularScopes || []).map((s) => ({
          scope: s.scope, target_ids: s.targetIds
        }))
      } });
    }

    /* Eine einzelne Asset-ID. Ist sie hinterlegt, antwortet der
       Doppelgaenger mit genau dem, was dort steht — sonst mit der
       bisherigen Standardantwort, damit alte Tests unveraendert laufen. */
    if (/^\d+$/.test(path)) {
      if (assets && Object.prototype.hasOwnProperty.call(assets, path)) {
        const asset = assets[path];
        if (!asset) return respond({ error: { message: "Unsupported get request", code: 100 } }, 400);
        return respond(Object.assign({ followers_count: 4210, media_count: 37 }, asset));
      }
      return respond({ id: path, username: "visionuniverse", followers_count: 4210, media_count: 37 });
    }
    if (/^\d+\/insights$/.test(path)) {
      return respond({ data: [
        { name: "impressions", values: [{ value: 15400 }] },
        { name: "reach", values: [{ value: 9100 }] },
        { name: "profile_views", values: [{ value: 318 }] }
      ] });
    }
    if (/^\d+\/media$/.test(path)) {
      return respond({ data: [
        { id: "m1", permalink: "https://instagram.invalid/p/m1", timestamp: "2026-09-10T10:00:00+0000",
          media_type: "IMAGE" }
      ] });
    }

    return respond({ error: { message: "unbekannter Pfad " + path, code: 100 } }, 404);
  };

  return { fetchImpl, calls, pageToken: PAGE_TOKEN };
}

/** Eine Worker-Umgebung. */
export function createEnv(overrides = {}) {
  const graph = overrides.__graph || createGraph();
  return Object.assign({
    META_APP_ID: TEST_APP_ID,
    META_APP_SECRET: TEST_APP_SECRET,
    VU_SOCIAL_ADMIN_KEY: TEST_ADMIN_KEY,
    PUBLIC_BASE_URL: TEST_BASE_URL,
    META_API_VERSION: "v21.0",
    VU_SOCIAL_KV: createKV(),
    __fetchImpl: graph.fetchImpl,
    __graph: graph
  }, overrides);
}

/** Baut eine Anfrage an den Worker. */
export function request(path, init = {}) {
  const url = path.startsWith("http") ? path : TEST_BASE_URL + path;
  return new Request(url, init);
}

/** Liest das Set-Cookie einer Antwort. */
export function cookieFrom(response) {
  const raw = response.headers.get("set-cookie");
  if (!raw) return null;
  return raw.split(";")[0];
}

/** Fuehrt Connect aus und gibt state und Cookie zurueck. */
export async function startConnect(worker, env) {
  const response = await worker.fetch(
    request("/social/meta/connect?key=" + encodeURIComponent(env.VU_SOCIAL_ADMIN_KEY)), env);
  const location = response.headers.get("location");
  const cookie = cookieFrom(response);
  const state = location ? new URL(location).searchParams.get("state") : null;
  return { response, location, cookie, state };
}

/** Fuehrt den vollstaendigen Flow aus. */
export async function completeConnect(worker, env, options = {}) {
  const started = await startConnect(worker, env);
  const callback = await worker.fetch(request(
    `/social/meta/callback?code=${options.code || "AQD-testcode-0123456789"}&state=` +
    encodeURIComponent(options.state || started.state),
    { headers: { cookie: options.cookie === null ? "" : (options.cookie || started.cookie) } }), env);
  return { started, callback };
}

/* =========================================================================
   EIN GRAPH-DOPPELGAENGER FUER DEN VEROEFFENTLICHUNGSWEG

   Der allgemeine Doppelgaenger oben kennt Autorisierung und Abruf. Der
   Veroeffentlichungsweg braucht vier weitere Antworten - Bildpruefung,
   Container, Containerstatus, Freigabe - und jede davon muss sich auf
   Fehler stellen lassen.

   Er steht hier und nicht in einer Testdatei, weil ihn inzwischen zwei
   Wege brauchen: /social/meta/publish und das Approval Center. Zwei
   Attrappen fuer denselben Dienst wuerden auseinanderlaufen, und die
   Tests waeren dann gegen verschiedene Metas gruen.
   ========================================================================= */

export const PUBLISH_IG_ID = "17841400000000001";
export const PUBLISH_MEDIA_ID = "media_555";
export const PUBLISH_PERMALINK = "https://www.instagram.com/p/PU555/";

export function createPublishGraph(options = {}) {
  const aufrufe = [];

  const fetchImpl = async (rawUrl, init = {}) => {
    const url = new URL(rawUrl);
    const pfad = url.pathname.split("/").slice(2).join("/");
    const methode = (init && init.method) || "GET";
    aufrufe.push({ pfad, methode, url: rawUrl });

    const json = (body, status = 200) => ({
      ok: status >= 200 && status < 300, status,
      text: () => Promise.resolve(JSON.stringify(body)),
      headers: new Headers({ "content-type": "application/json" })
    });

    /* Die Bildpruefung. Sie holt den Kopf der Datei und nicht die
       Datei - das genuegt fuer "gibt es das, und ist es ein Bild". */
    if (methode === "HEAD") {
      if (options.bildFehlt) return { ok: false, status: 404, headers: new Headers() };
      return { ok: true, status: 200,
        headers: new Headers({ "content-type": options.bildTyp || "image/jpeg",
          "content-length": "68000" }) };
    }

    const ig = options.instagramAccountId || PUBLISH_IG_ID;

    if (pfad === ig + "/media" && methode === "POST") {
      if (options.containerFehler) {
        return json({ error: { message: "Invalid image", code: 9004,
          error_subcode: 2207052, type: "OAuthException", fbtrace_id: "Abc123XyZ" } }, 400);
      }
      return json({ id: "container_7" });
    }
    if (pfad === "container_7") {
      return json({ status_code: options.containerStatus || "FINISHED" });
    }
    if (pfad === ig + "/media_publish" && methode === "POST") {
      if (options.publishFehler) {
        return json({ error: Object.assign({ message: "Permission error", code: 200,
          error_subcode: 1363047, type: "OAuthException", fbtrace_id: "Def456UvW" },
          options.publishFehler === true ? {} : options.publishFehler) }, 403);
      }
      return json({ id: PUBLISH_MEDIA_ID });
    }
    if (pfad === PUBLISH_MEDIA_ID) {
      return json({ id: PUBLISH_MEDIA_ID, permalink: PUBLISH_PERMALINK,
        timestamp: "2026-09-20T09:00:00+0000", media_type: "IMAGE" });
    }
    return json({ error: { message: "unerwartet: " + pfad, code: 100 } }, 404);
  };

  return { fetchImpl, aufrufe };
}

/** Legt eine Verbindung an, ohne den OAuth-Weg zu gehen. */
export async function verbinde(env, overrides = {}) {
  await env.VU_SOCIAL_KV.put("meta:connection:v1", JSON.stringify(Object.assign({
    version: 1,
    instagramAccountId: PUBLISH_IG_ID,
    instagramUsername: "visionuniverse",
    pageId: "page_vu",
    pageName: "Vision Universe",
    pageAccessToken: PAGE_TOKEN,
    tokenType: "page",
    permissions: { granted: [], declined: [], requested: [], missing: [] },
    capabilities: {}
  }, overrides)));
}
