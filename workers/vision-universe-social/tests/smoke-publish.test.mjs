/* =========================================================================
   vision-universe-social — DER EINE TESTBEITRAG

   Dies ist der erste Code im Projekt, der etwas OEFFENTLICH macht. Alles
   bisherige war lesend oder speichernd; ein Fehler kostete einen Versuch.
   Hier kostet ein Fehler einen Beitrag im Konto eines Unternehmens.

   -------------------------------------------------------------------------
   WARUM SO VIELE SPERREN
   -------------------------------------------------------------------------

   Die Graph API kennt KEIN Idempotenz-Token. Ein zweiter
   media_publish-Aufruf mit demselben Container erzeugt einen zweiten
   Beitrag. Es gibt also keine Wiederholung, die folgenlos waere — und
   damit keine Sperre, die man sich sparen koennte:

     Admin-Schluessel   sonst koennte jeder veroeffentlichen
     nur POST           ein GET waere ueber einen Link ausloesbar
     confirm=...        absichtlich unbequem zu tippen
     Allowlist          erneut, gegen den GESPEICHERTEN Datensatz
     einmalig           die einzige Sperre gegen einen zweiten Beitrag

   Jede davon hat unten ihren eigenen Test. Ein Test, der nur den
   Erfolgsweg prueft, prueft hier das Unwichtigere.

   -------------------------------------------------------------------------
   ZWEI SCHRITTE, GETRENNT
   -------------------------------------------------------------------------

   Container erstellen und freigeben sind zwei Aufrufe. Dazwischen liegt
   der einzige Moment, in dem sich noch nichts Oeffentliches ereignet hat.
   S6 prueft, dass dieser Moment genutzt wird: ein Container in ERROR
   fuehrt NICHT zur Freigabe.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";

import worker from "../src/index.js";
import {
  createEnv, createGraph, request, PAGE_TOKEN, TEST_ADMIN_KEY, TEST_APP_SECRET
} from "./harness.mjs";
import { CONNECTION_KEY, SMOKE_KEY } from "../src/store.js";

const CONFIRM = "PUBLISH-ONE-TEST-POST";
const AGAIN = "JA-ICH-WEISS-DASS-EIN-ZWEITER-BEITRAG-ENTSTEHT";
const ZIEL = "visionuniverse.aktienreports";
const IG_ID = "17841400000000001";
const BILD = "https://research.visionuniverse.de/assets/social/vu-social-publishing-test.jpg";

/* Der Wortlaut, den der Owner freigegeben hat — mit Umlauten und scharfem
   s. Der Doppelgaenger bekommt ihn im Original, damit der Weg durch die
   URL-Kodierung hier mitgeprueft wird und nicht erst im Beitrag. */
const CAPTION = "Technischer Test unserer Social-Infrastruktur. Dieser Beitrag dient " +
  "ausschlie\u00DFlich der \u00DCberpr\u00FCfung des Publishing-Workflows.";

/* Eine bestehende Verbindung, wie sie nach dem Callback im Speicher liegt. */
function verbunden(env, overrides = {}) {
  return env.VU_SOCIAL_KV.put(CONNECTION_KEY, JSON.stringify(Object.assign({
    version: 1,
    instagramAccountId: IG_ID,
    instagramUsername: ZIEL,
    pageId: "page_vu",
    pageName: "Vision Universe",
    pageAccessToken: PAGE_TOKEN,
    tokenType: "page",
    permissions: { granted: [], declined: [], requested: [], missing: [] },
    capabilities: {}
  }, overrides)));
}

/**
 * Ein Graph-Doppelgaenger fuer den Publishing-Weg.
 *
 * Er merkt sich JEDEN Aufruf. Das ist hier wichtiger als sonst: die
 * Frage "wurde media_publish aufgerufen" ist die Frage, ob ein Beitrag
 * entstanden ist.
 */
function publishGraph(options = {}) {
  const aufrufe = [];
  const fetchImpl = async (rawUrl, init = {}) => {
    const url = new URL(rawUrl);
    const pfad = url.pathname.split("/").slice(2).join("/");
    const methode = (init && init.method) || "GET";
    /* Die ganze Adresse, nicht nur der Pfad: die Bildunterschrift reist
       als Parameter mit, und ob sie unveraendert ankommt, ist genau das,
       was ein Test hier feststellen kann. */
    aufrufe.push({ pfad, methode, url: rawUrl });

    const json = (body, status = 200) => ({
      ok: status >= 200 && status < 300, status,
      text: () => Promise.resolve(JSON.stringify(body)),
      headers: new Headers({ "content-type": "application/json" })
    });

    /* Der HEAD auf die Bildadresse laeuft ueber denselben fetch. */
    if (rawUrl === BILD || methode === "HEAD") {
      if (options.bildFehlt) return { ok: false, status: 404, headers: new Headers() };
      return { ok: true, status: 200,
        headers: new Headers({ "content-type": options.bildTyp || "image/jpeg",
          "content-length": "68000" }) };
    }

    if (pfad === `${IG_ID}/media` && methode === "POST") {
      if (options.containerFehler) {
        return json({ error: { message: "Invalid image", code: 9004, error_subcode: 2207052,
          type: "OAuthException", fbtrace_id: "Abc123XyZ" } }, 400);
      }
      return json({ id: "container_1" });
    }
    if (pfad === "container_1") {
      return json({ status_code: options.containerStatus || "FINISHED" });
    }
    if (pfad === `${IG_ID}/media_publish` && methode === "POST") {
      if (options.publishFehler) {
        return json({ error: { message: "Permission error", code: 200, error_subcode: 1363047,
          type: "OAuthException", fbtrace_id: "Def456UvW" } }, 403);
      }
      return json({ id: "media_999" });
    }
    if (pfad === "media_999") {
      return json({ id: "media_999", permalink: "https://www.instagram.com/p/TEST999/",
        timestamp: "2026-09-16T09:00:00+0000", media_type: "IMAGE", caption: "…" });
    }
    return json({ error: { message: "unerwartet: " + pfad, code: 100 } }, 404);
  };
  return { fetchImpl, aufrufe };
}

async function smokeEnv(options = {}) {
  const g = publishGraph(options);
  const env = createEnv({
    META_IG_ALLOWED_USERNAMES: ZIEL,
    VU_SOCIAL_SMOKE_IMAGE_URL: BILD,
    VU_SOCIAL_SMOKE_CAPTION: CAPTION,
    __graph: g, __fetchImpl: g.fetchImpl
  });
  await verbunden(env, options.record || {});
  return { env, g };
}

function ruf(query = `?confirm=${CONFIRM}`, methode = "POST") {
  return request("/social/meta/smoke-publish" + query +
    (query.includes("?") ? "&" : "?") + "key=" + encodeURIComponent(TEST_ADMIN_KEY),
    { method: methode });
}

/* ------------------------------------------------------------------ */
/* S — DER ERFOLGSWEG                                                  */
/* ------------------------------------------------------------------ */

test("S1 · Container, Freigabe, Rueckpruefung — in dieser Reihenfolge", async () => {
  const { env, g } = await smokeEnv();
  const antwort = await worker.fetch(ruf(), env);
  assert.equal(antwort.status, 200, await antwort.clone().text());

  const body = await antwort.json();
  assert.equal(body.published, true);
  assert.equal(body.mediaId, "media_999");
  assert.equal(body.permalink, "https://www.instagram.com/p/TEST999/");
  assert.equal(body.verified, true);

  const schritte = g.aufrufe.filter((a) => a.methode === "POST").map((a) => a.pfad);
  assert.deepEqual(schritte, [`${IG_ID}/media`, `${IG_ID}/media_publish`],
    "Genau zwei schreibende Aufrufe, in dieser Reihenfolge");
});

test("S2 · Das Ergebnis wird dauerhaft protokolliert", async () => {
  const { env } = await smokeEnv();
  await worker.fetch(ruf(), env);

  const log = JSON.parse(await env.VU_SOCIAL_KV.get(SMOKE_KEY));
  assert.equal(log.published, true);
  assert.equal(log.mediaId, "media_999");
  assert.equal(log.permalink, "https://www.instagram.com/p/TEST999/");
  assert.equal(log.attempts.length, 1);
  assert.equal(log.attempts[0].instagramUsername, ZIEL);
  assert.ok(log.attempts[0].finishedAt, "Anfang und Ende stehen drin");
});

test("S3 · Im Protokoll steht niemals ein Token", async () => {
  const { env } = await smokeEnv();
  await worker.fetch(ruf(), env);
  const roh = await env.VU_SOCIAL_KV.get(SMOKE_KEY);
  assert.ok(!roh.includes(PAGE_TOKEN));
  assert.ok(!roh.includes(TEST_APP_SECRET));
  assert.ok(!roh.includes(TEST_ADMIN_KEY));
});

/* ------------------------------------------------------------------ */
/* Die Sperren                                                         */
/* ------------------------------------------------------------------ */

test("S4 · Ohne Bestaetigung wird nichts veroeffentlicht", async () => {
  /* Gueltiger Schluessel, aber kein `confirm`. */
  const { env, g } = await smokeEnv();
  const antwort = await worker.fetch(ruf(""), env);
  assert.equal(antwort.status, 400);
  assert.equal((await antwort.json()).error, "confirmationRequired");
  assert.equal(g.aufrufe.length, 0, "Es wurde nicht einmal etwas abgefragt");
});

test("S4b · Ohne Admin-Schluessel gar nichts — und das VOR der Bestaetigung", async () => {
  /* Die Reihenfolge ist Absicht: wer den Schluessel nicht hat, soll
     nicht einmal erfahren, welche Bestaetigung verlangt waere. */
  const { env, g } = await smokeEnv();
  const antwort = await worker.fetch(
    request(`/social/meta/smoke-publish?confirm=${CONFIRM}`, { method: "POST" }), env);
  assert.equal(antwort.status, 401);
  assert.ok(!(await antwort.text()).includes(CONFIRM));
  assert.equal(g.aufrufe.length, 0);
});

test("S5 · Ein GET loest nichts aus", async () => {
  /* Ein Link genuegte sonst. */
  const { env, g } = await smokeEnv();
  const antwort = await worker.fetch(ruf(`?confirm=${CONFIRM}`, "GET"), env);
  assert.equal(antwort.status, 405);
  assert.equal(g.aufrufe.length, 0);
});

test("S6 · Ein Container in ERROR wird NICHT freigegeben", async () => {
  /* Der Moment zwischen den beiden Schritten, genutzt. */
  const { env, g } = await smokeEnv({ containerStatus: "ERROR" });
  const antwort = await worker.fetch(ruf(), env);

  assert.equal(antwort.status, 502);
  assert.equal((await antwort.json()).error, "containerNotUsable");
  assert.ok(!g.aufrufe.some((a) => a.pfad.endsWith("media_publish")),
    "media_publish darf gar nicht erst aufgerufen worden sein");
});

test("S7 · Nur einmal — ein zweiter Aufruf erzeugt keinen zweiten Beitrag", async () => {
  /* Die wichtigste Sperre: die Graph API kennt kein Idempotenz-Token. */
  const { env, g } = await smokeEnv();
  await worker.fetch(ruf(), env);
  const vorher = g.aufrufe.length;

  const zweite = await worker.fetch(ruf(), env);
  assert.equal(zweite.status, 409);
  const body = await zweite.json();
  assert.equal(body.error, "alreadyPublished");
  assert.equal(body.mediaId, "media_999", "Der erste Beitrag wird genannt");
  assert.equal(g.aufrufe.length, vorher, "Kein einziger weiterer Aufruf");
});

test("S8 · Der zweite Beitrag ist moeglich, aber nur ausdruecklich", async () => {
  /* Die Sperre soll schuetzen, nicht einmauern — der Weg daran vorbei
     benennt beim Tippen, was er tut. */
  const { env } = await smokeEnv();
  await worker.fetch(ruf(), env);
  const zweite = await worker.fetch(ruf(`?confirm=${CONFIRM}&again=${AGAIN}`), env);
  assert.equal(zweite.status, 200);

  const log = JSON.parse(await env.VU_SOCIAL_KV.get(SMOKE_KEY));
  assert.equal(log.attempts.length, 2, "Beide Versuche stehen im Protokoll");
});

test("S9 · Ein Konto ausserhalb der Allowlist wird nicht bedient", async () => {
  /* Erneut geprueft, gegen den GESPEICHERTEN Datensatz: zwischen
     Verbinden und Veroeffentlichen kann die Konfiguration sich geaendert
     haben, und ein Beitrag ist nicht zuruecknehmbar. */
  const { env, g } = await smokeEnv({ record: { instagramUsername: "privat.dennis" } });
  const antwort = await worker.fetch(ruf(), env);

  assert.equal(antwort.status, 403);
  assert.equal((await antwort.json()).error, "targetNotAllowed");
  assert.equal(g.aufrufe.length, 0);
});

test("S10 · Ohne Verbindung wird nichts versucht", async () => {
  const g = publishGraph();
  const env = createEnv({
    META_IG_ALLOWED_USERNAMES: ZIEL, VU_SOCIAL_SMOKE_IMAGE_URL: BILD,
    __graph: g, __fetchImpl: g.fetchImpl
  });
  const antwort = await worker.fetch(ruf(), env);
  assert.equal(antwort.status, 409);
  assert.equal((await antwort.json()).error, "notConnected");
});

/* ------------------------------------------------------------------ */
/* Fehlerdiagnose                                                      */
/* ------------------------------------------------------------------ */

test("S11 · Ein unerreichbares Bild faellt VOR Meta auf", async () => {
  /* Sonst kaeme es als Meta-Fehlercode zurueck, der nach einem Problem
     mit dem Konto aussieht. */
  const { env, g } = await smokeEnv({ bildFehlt: true });
  const antwort = await worker.fetch(ruf(), env);

  assert.equal(antwort.status, 400);
  const body = await antwort.json();
  assert.equal(body.error, "imageUnreachable");
  assert.equal(body.stage, "imageCheck");
  assert.ok(!g.aufrufe.some((a) => a.methode === "POST"), "Meta wurde gar nicht gefragt");
});

test("S12 · Ein Bild, das kein JPEG ist, wird abgelehnt", async () => {
  const { env } = await smokeEnv({ bildTyp: "image/png" });
  const antwort = await worker.fetch(ruf(), env);
  assert.equal((await antwort.json()).error, "imageNotJpeg");
});

test("S13 · Ein Meta-Fehler wird vollstaendig erfasst", async () => {
  /* code, subcode und fbtrace_id sind das, was eine Ruecksprache mit dem
     Support ueberhaupt erst moeglich macht. */
  const { env } = await smokeEnv({ containerFehler: true });
  const antwort = await worker.fetch(ruf(), env);

  assert.equal(antwort.status, 502);
  const body = await antwort.json();
  assert.equal(body.stage, "createContainer");
  assert.equal(body.meta.metaCode, 9004);
  assert.equal(body.meta.metaSubcode, 2207052);
  assert.equal(body.meta.metaType, "OAuthException");
  assert.equal(body.meta.fbtraceId, "Abc123XyZ");
  assert.equal(body.meta.httpStatus, 400);
  assert.equal(body.published, false);

  const log = JSON.parse(await env.VU_SOCIAL_KV.get(SMOKE_KEY));
  assert.equal(log.published, false, "Ein Fehlversuch macht daraus keine Veroeffentlichung");
  assert.equal(log.attempts[0].error.fbtraceId, "Abc123XyZ");
});

test("S14 · Scheitert die Freigabe, wird das als UNSICHER gemeldet", async () => {
  /* Nach media_publish ist nicht mehr sicher, ob nichts passiert ist.
     Eine Meldung, die "nichts veroeffentlicht" behauptet, waere hier
     eine Behauptung ueber etwas, das niemand geprueft hat. */
  const { env } = await smokeEnv({ publishFehler: true });
  const antwort = await worker.fetch(ruf(), env);

  const body = await antwort.json();
  assert.equal(body.stage, "publish");
  assert.equal(body.meta.metaCode, 200);
  assert.match(body.message, /NICHT sicher|nachsehen/,
    "Die Meldung sagt, dass der Zustand offen ist");
});

test("S15 · Fehlerdaten im Protokoll tragen kein Token", async () => {
  const { env } = await smokeEnv({ publishFehler: true });
  await worker.fetch(ruf(), env);
  const roh = await env.VU_SOCIAL_KV.get(SMOKE_KEY);
  assert.ok(!roh.includes(PAGE_TOKEN));
  assert.ok(!roh.includes(TEST_APP_SECRET));
});

test("S16 · Die Bildunterschrift erreicht Meta unveraendert", async () => {
  /* Zwischen wrangler.toml und dem Beitrag liegen zwei Umformungen: die
     Worker-Umgebung und die URL-Kodierung in graph(). Der Owner hat den
     Wortlaut zeichengenau freigegeben — ein "ausschliesslich" anstelle
     von "ausschließlich" waere auf einem Unternehmensprofil ein
     sichtbarer Fehler, und einer, den vor der Veroeffentlichung
     niemand zu sehen bekommt. */
  const { env, g } = await smokeEnv();
  await worker.fetch(ruf(), env);

  const container = g.aufrufe.find((a) => a.pfad === `${IG_ID}/media` && a.methode === "POST");
  assert.ok(container, "Es wurde kein Container erstellt");

  const params = new URL(container.url).searchParams;
  assert.equal(params.get("caption"), CAPTION);
  assert.equal(params.get("image_url"), BILD);
});

test("S17 · Der Container traegt keine weiteren oeffentlichen Angaben", async () => {
  /* Freigegeben waren Bild und Text. Ein Standort, eine Markierung oder
     ein Produkt-Tag waere eine oeffentliche Angabe, die niemand bestellt
     hat — und Meta nimmt sie klaglos an. */
  const { env, g } = await smokeEnv();
  await worker.fetch(ruf(), env);

  const container = g.aufrufe.find((a) => a.pfad === `${IG_ID}/media` && a.methode === "POST");
  const keys = [...new URL(container.url).searchParams.keys()].sort();

  /* access_token und appsecret_proof gehoeren zur Authentisierung, nicht
     zum Beitrag. Alles Uebrige waere Inhalt. */
  assert.deepEqual(keys, ["access_token", "appsecret_proof", "caption", "image_url"]);
});
