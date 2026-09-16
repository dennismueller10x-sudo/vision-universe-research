/* =========================================================================
   VU SOCIAL — DER GENERISCHE VEROEFFENTLICHUNGSWEG (PU1–PU20)

   Der Smoke-Test veroeffentlichte EINEN vorher bekannten Beitrag. Dieser
   Endpunkt veroeffentlicht ein beliebiges Inhaltsobjekt der Pipeline —
   und damit wird aus der Frage "wurde zweimal gedrueckt" eine Frage, die
   ein Automat stellt, nicht ein Mensch.

   -------------------------------------------------------------------------
   WAS HIER BEWIESEN WERDEN MUSS
   -------------------------------------------------------------------------

   Die Graph API kennt kein Idempotenz-Token. Ein zweiter
   media_publish-Aufruf erzeugt einen zweiten Beitrag, und nichts an der
   Anfrage verhindert das. Die Einmaligkeit kann also nur bei uns liegen —
   und sie muss ENTSCHIEDEN SEIN, BEVOR der erste Graph-Aufruf laeuft.

   Deshalb pruefen mehrere Tests hier nicht das Ergebnis, sondern den
   ZEITPUNKT: PU9 liest den Speicher im Moment des ersten ausgehenden
   Aufrufs. Ein Anspruch, der erst danach entsteht, waere wertlos — genau
   der Absturz zwischen Container und Freigabe wuerde ihn ueberspringen.

   Und quer durch alle Faelle gilt eine Zaehlung: `media_publish` darf pro
   Inhaltsobjekt hoechstens einmal vorkommen. Diese Zahl ist der
   eigentliche Gegenstand dieser Datei.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";

import worker from "../src/index.js";
import {
  createEnv, request, PAGE_TOKEN, TEST_ADMIN_KEY
} from "./harness.mjs";
import { CONNECTION_KEY, claimKey, readClaim, claimPublish, settleClaim } from "../src/store.js";

const ZIEL = "visionuniverse.aktienreports";
const IG_ID = "17841400000000001";
const BILD = "https://research.visionuniverse.de/assets/social/beitrag-1.jpg";
const INHALT = "vu-content-2026-09-16-001";

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
 * Ein Graph-Doppelgaenger, der jeden Aufruf mitschreibt.
 *
 * `beiErstemAufruf` wird VOR der ersten Antwort ausgefuehrt. Damit laesst
 * sich feststellen, was zu diesem Zeitpunkt bereits im Speicher stand —
 * und nur so ist die Reihenfolge "erst Anspruch, dann Meta" pruefbar.
 */
function publishGraph(options = {}) {
  const aufrufe = [];
  let erster = true;

  const fetchImpl = async (rawUrl, init = {}) => {
    const url = new URL(rawUrl);
    const pfad = url.pathname.split("/").slice(2).join("/");
    const methode = (init && init.method) || "GET";
    aufrufe.push({ pfad, methode, url: rawUrl });

    if (erster) {
      erster = false;
      if (options.beiErstemAufruf) await options.beiErstemAufruf();
    }

    const json = (body, status = 200) => ({
      ok: status >= 200 && status < 300, status,
      text: () => Promise.resolve(JSON.stringify(body)),
      headers: new Headers({ "content-type": "application/json" })
    });

    if (methode === "HEAD") {
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
      return json({ id: "container_7" });
    }
    if (pfad === "container_7") {
      return json({ status_code: options.containerStatus || "FINISHED" });
    }
    if (pfad === `${IG_ID}/media_publish` && methode === "POST") {
      if (options.publishFehler) {
        return json({ error: { message: "Permission error", code: 200, error_subcode: 1363047,
          type: "OAuthException", fbtrace_id: "Def456UvW" } }, 403);
      }
      return json({ id: "media_555" });
    }
    if (pfad === "media_555") {
      return json({ id: "media_555", permalink: "https://www.instagram.com/p/PU555/",
        timestamp: "2026-09-16T09:00:00+0000", media_type: "IMAGE", caption: "…" });
    }
    return json({ error: { message: "unerwartet: " + pfad, code: 100 } }, 404);
  };

  return { fetchImpl, aufrufe };
}

async function publishEnv(options = {}) {
  const g = publishGraph(options);
  const env = createEnv(Object.assign({
    META_IG_ALLOWED_USERNAMES: ZIEL,
    VU_SOCIAL_AUTOPUBLISH: options.autopublish === undefined ? "on" : options.autopublish,
    __graph: g, __fetchImpl: g.fetchImpl
  }, options.env || {}));
  if (options.verbunden !== false) await verbunden(env, options.record || {});
  return { env, g };
}

function ruf(body, methode = "POST") {
  const init = { method: methode };
  if (body !== null && methode === "POST") {
    init.body = JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }
  return request("/social/meta/publish?key=" + encodeURIComponent(TEST_ADMIN_KEY), init);
}

const NORMAL = { contentId: INHALT, imageUrl: BILD, caption: "Ein Beitrag." };

/** Wie oft wurde tatsaechlich freigegeben? Die einzige Zahl, die zaehlt. */
function freigaben(g) {
  return g.aufrufe.filter((a) => a.pfad === `${IG_ID}/media_publish` && a.methode === "POST").length;
}

/* ------------------------------------------------------------------ */
/* DIE SPERREN — sie stehen vor allem anderen                          */
/* ------------------------------------------------------------------ */

test("PU1 · Ohne globalen Schalter geschieht nichts — und zwar wirklich nichts", async () => {
  const { env, g } = await publishEnv({ autopublish: undefined });
  delete env.VU_SOCIAL_AUTOPUBLISH;

  const antwort = await worker.fetch(ruf(NORMAL), env);
  assert.equal(antwort.status, 403);

  const body = await antwort.json();
  assert.equal(body.error, "publishingDisabled");
  assert.equal(body.published, false);
  assert.equal(g.aufrufe.length, 0, "Kein einziger ausgehender Aufruf");
  assert.equal(await env.VU_SOCIAL_KV.get(claimKey(INHALT)), null,
    "Auch kein Anspruch — der Schalter steht VOR dem Anspruch");
});

test("PU2 · 'off', 'true' und '' sind allesamt nicht 'on'", async () => {
  for (const wert of ["off", "true", "1", "yes", "", " on "]) {
    const { env, g } = await publishEnv({ autopublish: wert });
    const antwort = await worker.fetch(ruf(NORMAL), env);
    assert.equal(antwort.status, 403, `Wert ${JSON.stringify(wert)} haette sperren muessen`);
    assert.equal(g.aufrufe.length, 0);
  }
  /* Gross-/Kleinschreibung ist die einzige erlaubte Abweichung. */
  const { env } = await publishEnv({ autopublish: "ON" });
  const antwort = await worker.fetch(ruf(NORMAL), env);
  assert.notEqual(antwort.status, 403);
});

test("PU3 · Ohne Admin-Schluessel — noch vor dem Schalter", async () => {
  const { env, g } = await publishEnv();
  const antwort = await worker.fetch(
    request("/social/meta/publish", { method: "POST", body: JSON.stringify(NORMAL) }), env);
  assert.equal(antwort.status, 401);
  assert.equal(g.aufrufe.length, 0);
});

test("PU4 · Nur POST — ein GET waere ueber einen untergeschobenen Link ausloesbar", async () => {
  const { env, g } = await publishEnv();
  const antwort = await worker.fetch(ruf(null, "GET"), env);
  assert.equal(antwort.status, 405);
  const body = await antwort.json();
  assert.equal(body.published, false);
  assert.equal(g.aufrufe.length, 0);
});

test("PU5 · Ohne contentId gibt es nichts, worauf sich Einmaligkeit bezieht", async () => {
  const { env, g } = await publishEnv();
  const antwort = await worker.fetch(ruf({ imageUrl: BILD }), env);
  assert.equal(antwort.status, 400);
  assert.equal((await antwort.json()).error, "contentIdRequired");
  assert.equal(g.aufrufe.length, 0);
});

test("PU6 · Ohne Bildadresse kein Bildbeitrag", async () => {
  const { env, g } = await publishEnv();
  const antwort = await worker.fetch(ruf({ contentId: INHALT }), env);
  assert.equal(antwort.status, 400);
  assert.equal((await antwort.json()).error, "imageUrlRequired");
  assert.equal(g.aufrufe.length, 0);
});

test("PU7 · Ohne Verbindung wird nichts veroeffentlicht", async () => {
  const { env, g } = await publishEnv({ verbunden: false });
  const antwort = await worker.fetch(ruf(NORMAL), env);
  assert.equal(antwort.status, 409);
  assert.equal((await antwort.json()).error, "notConnected");
  assert.equal(g.aufrufe.length, 0);
  assert.equal(await env.VU_SOCIAL_KV.get(claimKey(INHALT)), null,
    "Ein Anspruch ohne Verbindung waere ein Anspruch auf nichts");
});

test("PU8 · Die Allowlist wird gegen den GESPEICHERTEN Datensatz erneut geprueft", async () => {
  /* Der Fall ist nicht theoretisch: die Verbindung entsteht einmal, die
     Konfiguration aendert sich danach. Geprueft wird, was gespeichert
     ist — nicht, was beim Verbinden galt. */
  const { env, g } = await publishEnv({ record: { instagramUsername: "ein.anderes.konto" } });
  const antwort = await worker.fetch(ruf(NORMAL), env);
  assert.equal(antwort.status, 403);

  const body = await antwort.json();
  assert.equal(body.error, "targetNotAllowed");
  assert.equal(body.published, false);
  assert.equal(g.aufrufe.length, 0);
  assert.equal(await env.VU_SOCIAL_KV.get(claimKey(INHALT)), null);
});

/* ------------------------------------------------------------------ */
/* DER ERFOLGSWEG                                                      */
/* ------------------------------------------------------------------ */

test("PU9 · Der Anspruch steht im Speicher, BEVOR der erste Aufruf hinausgeht", async () => {
  /* Der wichtigste Test dieser Datei. Nicht "gibt es am Ende einen
     Anspruch" — sondern "gab es ihn schon, als der erste Aufruf lief".
     Nur diese Reihenfolge ueberlebt einen Absturz mittendrin. */
  let beimErstenAufruf = "nicht abgefragt";
  let aufrufeZumZeitpunkt = -1;
  const { env, g } = await publishEnv({
    beiErstemAufruf: async () => {
      /* Die Zahl muss HIER festgehalten werden. Am Ende der Anfrage
         stuenden laengst alle fuenf Aufrufe in der Liste, und der Test
         wuerde etwas anderes messen als seinen Namen. */
      aufrufeZumZeitpunkt = g.aufrufe.length;
      beimErstenAufruf = await env.VU_SOCIAL_KV.get(claimKey(INHALT));
    }
  });

  const antwort = await worker.fetch(ruf(NORMAL), env);
  assert.equal(antwort.status, 200, await antwort.clone().text());

  assert.notEqual(beimErstenAufruf, null,
    "Beim ersten ausgehenden Aufruf lag noch kein Anspruch vor");
  assert.notEqual(beimErstenAufruf, "nicht abgefragt");
  const frueh = JSON.parse(beimErstenAufruf);
  assert.equal(frueh.state, "IN_FLIGHT");
  assert.equal(frueh.contentId, INHALT);
  assert.equal(frueh.mediaId, null, "Zu diesem Zeitpunkt kann es keine Medien-ID geben");
  assert.equal(aufrufeZumZeitpunkt, 1, "Genau ein Aufruf war zum Zeitpunkt der Messung gelaufen");
});

test("PU10 · Container, Freigabe, Rueckpruefung — genau zwei schreibende Aufrufe", async () => {
  const { env, g } = await publishEnv();
  const antwort = await worker.fetch(ruf(NORMAL), env);
  assert.equal(antwort.status, 200, await antwort.clone().text());

  const body = await antwort.json();
  assert.equal(body.published, true);
  assert.equal(body.idempotent, false);
  assert.equal(body.contentId, INHALT);
  assert.equal(body.mediaId, "media_555");
  assert.equal(body.permalink, "https://www.instagram.com/p/PU555/");
  assert.equal(body.verified, true);
  assert.equal(body.account, ZIEL);

  const schreibend = g.aufrufe.filter((a) => a.methode === "POST").map((a) => a.pfad);
  assert.deepEqual(schreibend, [`${IG_ID}/media`, `${IG_ID}/media_publish`]);
});

test("PU11 · Der erfuellte Anspruch traegt Medien-ID und Permalink", async () => {
  const { env } = await publishEnv();
  await worker.fetch(ruf(NORMAL), env);

  const claim = await readClaim(env, INHALT);
  assert.equal(claim.state, "PUBLISHED");
  assert.equal(claim.mediaId, "media_555");
  assert.equal(claim.permalink, "https://www.instagram.com/p/PU555/");
  assert.equal(claim.verified, true);
  assert.ok(claim.claimedAt && claim.settledAt, "Anfang und Ende stehen drin");
});

test("PU12 · Die Bildunterschrift reist unveraendert mit", async () => {
  const text = "Kursrutsch bei Small Caps — was daran neu ist. Überprüft.";
  const { env, g } = await publishEnv();
  await worker.fetch(ruf({ contentId: INHALT, imageUrl: BILD, caption: text }), env);

  const container = g.aufrufe.find((a) => a.pfad === `${IG_ID}/media` && a.methode === "POST");
  const mitgereist = new URL(container.url).searchParams.get("caption");
  assert.equal(mitgereist, text, "Die Kodierung darf den Wortlaut nicht veraendern");
});

/* ------------------------------------------------------------------ */
/* DIE EINMALIGKEIT                                                    */
/* ------------------------------------------------------------------ */

test("PU13 · Der zweite Aufruf gibt dasselbe Ergebnis — und veroeffentlicht NICHT", async () => {
  const { env, g } = await publishEnv();

  const erste = await worker.fetch(ruf(NORMAL), env);
  const ersteBody = await erste.json();
  assert.equal(freigaben(g), 1);

  const zweite = await worker.fetch(ruf(NORMAL), env);
  assert.equal(zweite.status, 200);
  const zweiteBody = await zweite.json();

  assert.equal(zweiteBody.published, true);
  assert.equal(zweiteBody.idempotent, true, "Die Antwort sagt, dass nichts Neues entstand");
  assert.equal(zweiteBody.mediaId, ersteBody.mediaId);
  assert.equal(zweiteBody.permalink, ersteBody.permalink);
  assert.equal(freigaben(g), 1, "DIE Zahl: eine Freigabe, nicht zwei");
});

test("PU14 · Ein laufender Anspruch sperrt — auch wenn niemand mehr laeuft", async () => {
  /* Genau der Absturzfall: der Anspruch steht, der Worker ist tot, der
     Beitrag existiert vielleicht. Hier wird NICHT geraten. */
  const { env, g } = await publishEnv();
  await claimPublish(env, INHALT, { now: "2026-09-16T08:00:00.000Z" });

  const antwort = await worker.fetch(ruf(NORMAL), env);
  assert.equal(antwort.status, 409);

  const body = await antwort.json();
  assert.equal(body.error, "claimInFlight");
  assert.equal(body.published, false);
  assert.match(body.message, /nachsehen/i, "Die Antwort sagt, was ein Mensch tun muss");
  assert.equal(g.aufrufe.length, 0, "Kein Aufruf — die Unsicherheit wird nicht vergroessert");
});

test("PU15 · Ein frueher gescheiterter Anspruch wiederholt sich nicht von selbst", async () => {
  const { env, g } = await publishEnv();
  await claimPublish(env, INHALT, {});
  await settleClaim(env, INHALT, { state: "FAILED", stage: "createContainer" });

  const antwort = await worker.fetch(ruf(NORMAL), env);
  assert.equal(antwort.status, 409);
  assert.equal((await antwort.json()).error, "claimFailedEarlier");
  assert.equal(g.aufrufe.length, 0);
});

test("PU16 · Zwei Inhaltsobjekte sind zwei Ansprueche", async () => {
  /* Die Sperre darf nicht global sein, sonst veroeffentlicht die
     Pipeline genau einmal und nie wieder. */
  const { env, g } = await publishEnv();
  await worker.fetch(ruf(NORMAL), env);
  const zweite = await worker.fetch(
    ruf({ contentId: "vu-content-2026-09-16-002", imageUrl: BILD, caption: "Zwei." }), env);

  assert.equal(zweite.status, 200);
  assert.equal((await zweite.json()).idempotent, false);
  assert.equal(freigaben(g), 2, "Zwei Inhaltsobjekte, zwei Beitraege");
});

/* ------------------------------------------------------------------ */
/* DIE FEHLERWEGE                                                      */
/* ------------------------------------------------------------------ */

test("PU17 · Eine gescheiterte Freigabe bleibt OFFEN, nicht gescheitert", async () => {
  /* Nach media_publish weiss niemand ohne nachzusehen, ob ein Beitrag
     entstanden ist. FAILED waere eine Behauptung; IN_FLIGHT ist die
     Wahrheit. */
  const { env, g } = await publishEnv({ publishFehler: true });
  const antwort = await worker.fetch(ruf(NORMAL), env);
  assert.equal(antwort.status, 502);

  const body = await antwort.json();
  assert.equal(body.published, false);
  assert.equal(body.uncertain, true);
  assert.equal(body.stage, "publish");

  const claim = await readClaim(env, INHALT);
  assert.equal(claim.state, "IN_FLIGHT", "Nicht FAILED — das waere mehr behauptet als bekannt");
  assert.equal(claim.uncertain, true);

  /* Und die Folge davon: ein zweiter Versuch veroeffentlicht nicht. */
  const zweite = await worker.fetch(ruf(NORMAL), env);
  assert.equal(zweite.status, 409);
  assert.equal(freigaben(g), 1, "Der eine ungewisse Versuch bleibt der einzige");
});

test("PU18 · Ein Container-Fehler fuehrt nie zur Freigabe", async () => {
  const { env, g } = await publishEnv({ containerFehler: true });
  const antwort = await worker.fetch(ruf(NORMAL), env);
  assert.equal(antwort.status, 502);

  const body = await antwort.json();
  assert.equal(body.stage, "createContainer");
  assert.equal(body.published, false);
  assert.equal(freigaben(g), 0);

  const claim = await readClaim(env, INHALT);
  assert.equal(claim.state, "FAILED", "Hier ist die Lage eindeutig: nichts entstand");
});

test("PU19 · Ein Container in ERROR wird nicht freigegeben", async () => {
  const { env, g } = await publishEnv({ containerStatus: "ERROR" });
  const antwort = await worker.fetch(ruf(NORMAL), env);
  assert.equal(antwort.status, 502);
  assert.equal((await antwort.json()).error, "containerNotReady");
  assert.equal(freigaben(g), 0);
  assert.equal((await readClaim(env, INHALT)).state, "FAILED");
});

test("PU20 · Ein unerreichbares Bild stoppt vor jedem Graph-Aufruf", async () => {
  const { env, g } = await publishEnv({ bildFehlt: true });
  const antwort = await worker.fetch(ruf(NORMAL), env);
  assert.equal(antwort.status, 400);

  const body = await antwort.json();
  assert.equal(body.error, "imageUnreachable");
  assert.equal(body.stage, "imageCheck");
  assert.equal(g.aufrufe.filter((a) => a.methode === "POST").length, 0);
  assert.equal((await readClaim(env, INHALT)).state, "FAILED");
});

/* ------------------------------------------------------------------ */
/* DIE GEHEIMNISSE UND DER SPEICHER                                    */
/* ------------------------------------------------------------------ */

test("PU21 · In keiner Antwort und in keinem Anspruch steht ein Token", async () => {
  const faelle = [{}, { publishFehler: true }, { containerFehler: true }];
  for (const fall of faelle) {
    const { env } = await publishEnv(fall);
    const antwort = await worker.fetch(ruf(NORMAL), env);
    const text = await antwort.text();
    assert.ok(!text.includes(PAGE_TOKEN), "Token in der Antwort: " + JSON.stringify(fall));

    const claim = await env.VU_SOCIAL_KV.get(claimKey(INHALT));
    assert.ok(!String(claim).includes(PAGE_TOKEN), "Token im Anspruch: " + JSON.stringify(fall));
  }
});

test("PU22 · Ohne Speicher wird kein Anspruch angemeldet — und ohne Anspruch nichts veroeffentlicht", async () => {
  /* Auf Ebene des Speichers geprueft, weil der Endpunkt ohne KV schon an
     der Verbindung scheitert. Die Regel gilt trotzdem und gehoert
     festgehalten: kein Speicher heisst nein, nicht "dann eben ohne". */
  const ergebnis = await claimPublish({}, INHALT, {});
  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.reason, "noStorage");
});

test("PU23 · Einmal PUBLISHED bleibt PUBLISHED", async () => {
  /* Ein spaeterer Fehlversuch darf den Beleg nicht ueberschreiben — der
     Beitrag ist dann ja da, und ein Anspruch, der ihn vergisst, wuerde
     eine Wiederholung erlauben. */
  const { env } = await publishEnv();
  await claimPublish(env, INHALT, {});
  await settleClaim(env, INHALT, { state: "PUBLISHED", mediaId: "media_555",
    permalink: "https://www.instagram.com/p/PU555/" });
  const danach = await settleClaim(env, INHALT, { state: "FAILED", error: { reason: "egal" } });

  assert.equal(danach.state, "PUBLISHED");
  assert.equal(danach.mediaId, "media_555");
  assert.equal(danach.permalink, "https://www.instagram.com/p/PU555/");
});
