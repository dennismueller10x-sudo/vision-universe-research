/* =========================================================================
   VU SOCIAL — Insights-Ingestion (I1–I12)

   Dieser Endpunkt ist die Wurzel des Rueckwegs im Kreislauf. Ohne
   gemessene Leistung bleibt "Leistung vergleichbarer Beitraege" fuer
   immer ungemessen, und jede Strategie waere eine Meinung.

   Er ist lesend — und die Tests pruefen genau das mit, weil er im selben
   Modul sitzt wie der Endpunkt, der veroeffentlicht.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import {
  createEnv, createGraph, request, PAGE_TOKEN, TEST_ADMIN_KEY, TEST_APP_SECRET
} from "./harness.mjs";
import { CONNECTION_KEY } from "../src/store.js";

const ZIEL = "visionuniverse.aktienreports";
const IG_ID = "17841400000000001";
const MEDIA = "17992767560843861";

function verbunden(env) {
  return env.VU_SOCIAL_KV.put(CONNECTION_KEY, JSON.stringify({
    version: 1, instagramAccountId: IG_ID, instagramUsername: ZIEL,
    pageId: "page_vu", pageName: "Vision Universe", pageAccessToken: PAGE_TOKEN,
    tokenType: "page", permissions: { granted: [], declined: [], requested: [], missing: [] },
    capabilities: {}
  }));
}

/**
 * Ein Graph-Doppelgaenger fuer den Lesepfad.
 *
 * `zusatzFehlt` stellt den Fall nach, der in der Realitaet der haeufigste
 * ist: eine Metrik existiert fuer diesen Medientyp nicht, und die API
 * lehnt die GANZE Abfrage ab.
 */
function leseGraph(options = {}) {
  const aufrufe = [];
  const fetchImpl = async (rawUrl, init = {}) => {
    const url = new URL(rawUrl);
    const pfad = url.pathname.split("/").slice(2).join("/");
    aufrufe.push({ pfad, methode: (init && init.method) || "GET", url: rawUrl });

    const json = (body, status = 200) => ({
      ok: status >= 200 && status < 300, status,
      text: () => Promise.resolve(JSON.stringify(body)),
      headers: new Headers({ "content-type": "application/json" })
    });

    if (pfad === `${IG_ID}/media`) {
      return json({ data: [{ id: MEDIA, permalink: "https://www.instagram.com/p/X/",
        timestamp: "2026-09-16T17:10:14+0000", media_type: "IMAGE" }] });
    }
    if (pfad === MEDIA) {
      return json({ id: MEDIA, permalink: "https://www.instagram.com/p/X/",
        timestamp: "2026-09-16T17:10:14+0000", media_type: "IMAGE", caption: "Test" });
    }
    if (pfad === `${MEDIA}/insights`) {
      const metrik = url.searchParams.get("metric") || "";
      const istZusatz = metrik.includes("views");
      if (istZusatz && options.zusatzFehlt) {
        return json({ error: { message: "metric[0] must be one of the following values",
          code: 100, error_subcode: 2108006, type: "OAuthException",
          fbtrace_id: "Zzz111" } }, 400);
      }
      if (!istZusatz && options.basisFehler) {
        return json({ error: { message: "Object does not exist", code: 803,
          type: "OAuthException", fbtrace_id: "Yyy222" } }, 400);
      }
      const namen = metrik.split(",");
      return json({ data: namen.map((n, i) => ({ name: n, values: [{ value: 10 + i }] })) });
    }
    return json({ error: { message: "unerwartet: " + pfad, code: 100 } }, 404);
  };
  return { fetchImpl, aufrufe };
}

async function leseEnv(options = {}) {
  const g = leseGraph(options);
  const env = createEnv({ __graph: g, __fetchImpl: g.fetchImpl });
  await verbunden(env);
  return { env, g };
}

const ruf = (q = "") => request("/social/meta/insights" + q,
  { headers: { authorization: `Bearer ${TEST_ADMIN_KEY}` } });

/* ------------------------------------------------------------------ */

test("I1 · Ohne Admin-Schluessel keine Zahlen", async () => {
  const { env } = await leseEnv();
  const antwort = await worker.fetch(request("/social/meta/insights"), env);
  assert.equal(antwort.status, 401);
});

test("I2 · Nur GET — POST wird abgewiesen", async () => {
  const { env } = await leseEnv();
  const antwort = await worker.fetch(
    request("/social/meta/insights", { method: "POST",
      headers: { authorization: `Bearer ${TEST_ADMIN_KEY}` } }), env);
  assert.equal(antwort.status, 405);
});

test("I3 · Ohne Verbindung wird nichts behauptet", async () => {
  const g = leseGraph();
  const env = createEnv({ __graph: g, __fetchImpl: g.fetchImpl });
  const antwort = await worker.fetch(ruf(), env);
  assert.equal(antwort.status, 409);
  assert.equal((await antwort.json()).error, "notConnected");
});

test("I4 · Die Kennzahlen eines Beitrags werden gelesen", async () => {
  const { env } = await leseEnv();
  const body = await (await worker.fetch(ruf(`?media=${MEDIA}`), env)).json();

  assert.equal(body.requested, 1);
  assert.equal(body.measured, 1);
  const post = body.posts[0];
  assert.equal(post.mediaId, MEDIA);
  assert.equal(typeof post.metrics.reach, "number");
  assert.equal(post.media.mediaType, "IMAGE");
});

test("I5 · Eine archivierte Kennung ist weiterhin abfragbar", async () => {
  /* Der Grund, warum ?media= ueberhaupt existiert: ein archivierter
     Beitrag taucht in der Medienliste nicht mehr auf. Genau das ist mit
     dem einen realen Beitrag dieses Projekts passiert. */
  const { env, g } = await leseEnv();
  await worker.fetch(ruf(`?media=${MEDIA}`), env);
  assert.equal(g.aufrufe.some((a) => a.pfad === `${IG_ID}/media`), false,
    "Die Medienliste wurde gar nicht erst gefragt");
  assert.ok(g.aufrufe.some((a) => a.pfad === `${MEDIA}/insights`));
});

test("I6 · Ohne ?media wird die Medienliste des Kontos gelesen", async () => {
  const { env, g } = await leseEnv();
  const body = await (await worker.fetch(ruf(), env)).json();
  assert.equal(body.source, "Medienliste des Kontos");
  assert.ok(g.aufrufe.some((a) => a.pfad === `${IG_ID}/media`));
  assert.equal(body.posts[0].mediaId, MEDIA);
});

test("I7 · Faellt die Zusatzgruppe aus, bleiben die Basiszahlen stehen", async () => {
  /* Der Kern der Zweiteilung. Die Graph API lehnt eine Insights-Abfrage
     KOMPLETT ab, wenn eine Metrik fuer diesen Medientyp nicht existiert.
     In einer gemeinsamen Abfrage saehe "ein Bild kennt keine views" aus
     wie "der Beitrag hatte keine Reichweite". */
  const { env } = await leseEnv({ zusatzFehlt: true });
  const body = await (await worker.fetch(ruf(`?media=${MEDIA}`), env)).json();

  const post = body.posts[0];
  assert.equal(typeof post.metrics.reach, "number", "Reichweite ueberlebt");
  assert.ok(post.unanswered.includes("views"), "und die Luecke wird benannt");
  assert.equal(body.measured, 1);
});

test("I8 · Nicht beantwortete Metriken stehen nicht als 0 da", async () => {
  const { env } = await leseEnv({ zusatzFehlt: true });
  const body = await (await worker.fetch(ruf(`?media=${MEDIA}`), env)).json();
  const post = body.posts[0];
  for (const m of post.unanswered) {
    assert.notEqual(post.metrics[m], 0, `${m} darf nicht als 0 erscheinen`);
    assert.equal(post.metrics[m], undefined);
  }
});

test("I9 · Scheitert die Basisgruppe, wird das als Fehler gemeldet", async () => {
  const { env } = await leseEnv({ basisFehler: true });
  const body = await (await worker.fetch(ruf(`?media=${MEDIA}`), env)).json();
  const post = body.posts[0];
  assert.equal(post.metrics, null, "keine erfundenen Zahlen");
  assert.equal(post.metricsError.reason !== undefined, true);
  assert.equal(post.metricsError.fbtraceId, "Yyy222", "die Spur fuer den Meta-Support reist mit");
  assert.equal(body.measured, 0);
});

test("I10 · Stammdaten und Zahlen scheitern unabhaengig voneinander", async () => {
  const { env } = await leseEnv({ basisFehler: true });
  const body = await (await worker.fetch(ruf(`?media=${MEDIA}`), env)).json();
  const post = body.posts[0];
  assert.ok(post.media, "die Stammdaten sind trotzdem da");
  assert.equal(post.media.permalink, "https://www.instagram.com/p/X/");
});

test("I11 · Jede Zahl traegt ihre Herkunft", async () => {
  /* Eine Kennzahl ohne Herkunft ist spaeter nicht von einer geschaetzten
     zu unterscheiden. */
  const { env } = await leseEnv();
  const body = await (await worker.fetch(ruf(`?media=${MEDIA}`), env)).json();
  const p = body.posts[0].provenance;
  assert.equal(p.source, "instagram.graph");
  assert.equal(p.accountId, IG_ID);
  assert.equal(p.measured, true);
  assert.ok(p.fetchedAt);
});

test("I12 · Der Lesepfad beruehrt kein Publishing und gibt kein Token heraus", async () => {
  const { env, g } = await leseEnv();
  const antwort = await worker.fetch(ruf(`?media=${MEDIA}`), env);
  const roh = await antwort.text();

  assert.equal(g.aufrufe.some((a) => /media_publish|\/media$/.test(a.pfad) && a.methode === "POST"),
    false, "kein POST auf einen erzeugenden Pfad");
  assert.ok(!roh.includes(PAGE_TOKEN));
  assert.ok(!roh.includes(TEST_APP_SECRET));
});

test("I13 · Das Subrequest-Budget begrenzt, was pro Anfrage geholt wird", async () => {
  /* Der reale Fall: 26 Beitraege = 53 ausgehende Aufrufe, erlaubt sind
     50. Die letzten neun kamen als networkError zurueck und sahen aus
     wie ein Problem bei Meta. Es war eine Obergrenze bei uns. */
  const g = leseGraph();
  const env = createEnv({ __graph: g, __fetchImpl: g.fetchImpl,
    VU_SOCIAL_SUBREQUEST_BUDGET: "6" });
  await verbunden(env);

  const viele = ["1", "2", "3", "4", "5"].join(",");
  const body = await (await worker.fetch(ruf(`?media=${viele}`), env)).json();

  assert.equal(body.requested, 5);
  assert.equal(body.fetched, 3, "Budget 6 / 2 Aufrufe je Beitrag = 3");
  assert.equal(body.deferred.length, 2);
});

test("I14 · Nicht abgefragt ist OFFEN, nicht gescheitert", async () => {
  /* Der Unterschied entscheidet, ob jemand nach einem Fehler sucht oder
     einfach nachfasst. */
  const g = leseGraph();
  const env = createEnv({ __graph: g, __fetchImpl: g.fetchImpl,
    VU_SOCIAL_SUBREQUEST_BUDGET: "4" });
  await verbunden(env);

  /* Budget 4, zwei Aufrufe je Beitrag -> zwei Beitraege passen. */
  const body = await (await worker.fetch(ruf("?media=1,2,3"), env)).json();
  assert.deepEqual(body.deferred, ["3"]);
  assert.match(body.deferredReason, /nicht gemessen worden und nicht/);
  assert.match(body.deferredReason, /nachholen/);
  /* Sie tauchen NICHT als fehlgeschlagene Beitraege auf. */
  assert.equal(body.posts.length, 2);
});

test("I15 · Ohne Budgetgrenze bleibt alles beim Alten", async () => {
  const { env } = await leseEnv();
  const body = await (await worker.fetch(ruf(`?media=${MEDIA}`), env)).json();
  assert.equal(body.fetched, 1);
  assert.deepEqual(body.deferred, []);
  assert.equal(body.deferredReason, null);
});
