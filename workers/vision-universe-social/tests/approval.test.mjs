/* =========================================================================
   VU SOCIAL — Das Owner-Gate (AP1–AP16)

   Der Owner hat entschieden: kein autonomes Veroeffentlichen, aber der
   Loop darf einen fertigen Beitrag vorlegen und ihn nach Freigabe
   senden. Damit gibt es ZWEI Gruende, aus denen dieser Endpunkt etwas
   veroeffentlichen darf — und sie sind nicht dasselbe:

     AUTOPUBLISH   Das System darf von sich aus senden. Ein Schalter.
     APPROVAL      Ein Mensch hat GENAU DIESEN Beitrag freigegeben.
                   Kein Schalter, sondern eine Aussage ueber einen Inhalt.

   -------------------------------------------------------------------------
   WAS HIER WIRKLICH GEPRUEFT WIRD
   -------------------------------------------------------------------------

   "Nach der Freigabe wird nichts mehr geaendert" ist als Zusage wertlos:
   zwischen Freigabe und Aufruf liegt ein Automat, und ein Automat haelt
   keine Zusagen. Der Inhaltsabdruck macht daraus eine Pruefung, die der
   Worker selbst durchfuehrt — an der Zahl, die er aus dem zu sendenden
   Inhalt nachrechnet, nicht an der, die die Freigabe mitbringt.

   AP7 ist der Test, der zaehlt: ein geaenderter Text mit gueltig
   aussehender Freigabe wird NICHT veroeffentlicht.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";

import worker from "../src/index.js";
import { createEnv, request, PAGE_TOKEN, TEST_ADMIN_KEY,
  jpegBytes, bildAntwort } from "./harness.mjs";
import { CONNECTION_KEY, claimKey, readClaim } from "../src/store.js";
import { contentHash } from "../src/redact.js";

const ZIEL = "visionuniverse.aktienreports";
const IG_ID = "17841400000000001";
const BILD = "https://research.visionuniverse.de/assets/social/pkg_x.jpg";
const INHALT = "pkg_x";
const TEXT = "Der Abstand ist so gross wie seit 1999 nicht. Warum das zaehlt.";

function verbunden(env) {
  return env.VU_SOCIAL_KV.put(CONNECTION_KEY, JSON.stringify({
    version: 1, instagramAccountId: IG_ID, instagramUsername: ZIEL,
    pageId: "page_vu", pageName: "Vision Universe", pageAccessToken: PAGE_TOKEN,
    tokenType: "page", permissions: { granted: [], declined: [], requested: [], missing: [] },
    capabilities: {}
  }));
}

function publishGraph(options = {}) {
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

    /* Die Bildpruefung holt die Datei, nicht ihren Kopf. */
    if (!url.hostname.includes("graph.") || methode === "HEAD") {
      return bildAntwort(jpegBytes());
    }
    if (pfad === `${IG_ID}/media` && methode === "POST") return json({ id: "container_9" });
    if (pfad === "container_9") return json({ status_code: "FINISHED" });
    if (pfad === `${IG_ID}/media_publish` && methode === "POST") return json({ id: "media_777" });
    if (pfad === "media_777") {
      return json({ id: "media_777", permalink: "https://www.instagram.com/p/AP777/",
        timestamp: "2026-09-17T09:00:00+0000", media_type: "IMAGE", caption: TEXT });
    }
    return json({ error: { message: "unerwartet: " + pfad, code: 100 } }, 404);
  };
  return { fetchImpl, aufrufe };
}

async function umgebung(overrides = {}) {
  const g = publishGraph();
  const env = createEnv(Object.assign({
    META_IG_ALLOWED_USERNAMES: ZIEL,
    __graph: g, __fetchImpl: g.fetchImpl
  }, overrides));
  await verbunden(env);
  return { env, g };
}

async function freigabeFuer(spec) {
  return {
    candidateId: "cand_2026_09_17_001",
    approvedBy: "owner",
    approvedAt: "2026-09-17T08:30:00Z",
    contentHash: await contentHash(spec)
  };
}

function ruf(body) {
  return request("/social/meta/publish?key=" + encodeURIComponent(TEST_ADMIN_KEY), {
    method: "POST", body: JSON.stringify(body),
    headers: { "content-type": "application/json" }
  });
}

const INHALTE = { contentId: INHALT, imageUrl: BILD, caption: TEXT };
const freigaben = (g) => g.aufrufe.filter((a) =>
  a.pfad === `${IG_ID}/media_publish` && a.methode === "POST").length;

/* ------------------------------------------------------------------ */
/* DIE ZWEI ERLAUBNISSE                                                */
/* ------------------------------------------------------------------ */

test("AP1 · Ohne Schalter und ohne Freigabe: nichts", async () => {
  const { env, g } = await umgebung();
  const antwort = await worker.fetch(ruf(INHALTE), env);
  assert.equal(antwort.status, 403);
  assert.equal((await antwort.json()).error, "publishingDisabled");
  assert.equal(g.aufrufe.length, 0);
  assert.equal(await env.VU_SOCIAL_KV.get(claimKey(INHALT)), null);
});

test("AP2 · Eine gueltige Freigabe genuegt — der Schalter bleibt aus", async () => {
  /* Das ist die Betriebsstufe, die der Owner freigegeben hat: das System
     legt vor, ein Mensch entscheidet, die Pipeline sendet. */
  const { env, g } = await umgebung();
  assert.notEqual(String(env.VU_SOCIAL_AUTOPUBLISH || "").toLowerCase(), "on");

  const antwort = await worker.fetch(ruf(Object.assign({
    approval: await freigabeFuer(INHALTE) }, INHALTE)), env);

  assert.equal(antwort.status, 200, await antwort.clone().text());
  const body = await antwort.json();
  assert.equal(body.published, true);
  assert.equal(body.via, "APPROVAL");
  assert.equal(body.mediaId, "media_777");
  assert.equal(freigaben(g), 1);
});

test("AP3 · Der Weg steht in der Antwort und im Anspruch", async () => {
  /* Wer spaeter fragt "wer wollte das", soll es nicht aus dem Fehlen
     eines Schalters erschliessen muessen. */
  const { env } = await umgebung();
  await worker.fetch(ruf(Object.assign({ approval: await freigabeFuer(INHALTE) }, INHALTE)), env);

  const claim = await readClaim(env, INHALT);
  assert.equal(claim.via, "APPROVAL");
  assert.equal(claim.approval.candidateId, "cand_2026_09_17_001");
  assert.equal(claim.approval.approvedBy, "owner");
  assert.ok(claim.approval.contentHash);
});

test("AP4 · Mit Schalter geht es auch ohne Freigabe — und heisst dann anders", async () => {
  const { env } = await umgebung({ VU_SOCIAL_AUTOPUBLISH: "on" });
  const antwort = await worker.fetch(ruf(INHALTE), env);
  assert.equal(antwort.status, 200);
  const body = await antwort.json();
  assert.equal(body.via, "AUTOPUBLISH");
  assert.equal(body.approval, null);
});

/* ------------------------------------------------------------------ */
/* DER ABDRUCK                                                         */
/* ------------------------------------------------------------------ */

test("AP5 · Eine Freigabe ohne Abdruck gibt nichts frei", async () => {
  /* Sie liesse sich auf jeden beliebigen Text anwenden. */
  const { env, g } = await umgebung();
  const antwort = await worker.fetch(ruf(Object.assign({
    approval: { candidateId: "c1", approvedBy: "owner" } }, INHALTE)), env);

  assert.equal(antwort.status, 400);
  assert.equal((await antwort.json()).error, "approvalWithoutHash");
  assert.equal(g.aufrufe.length, 0);
});

test("AP6 · Ein falscher Abdruck veroeffentlicht nicht", async () => {
  const { env, g } = await umgebung();
  const antwort = await worker.fetch(ruf(Object.assign({
    approval: { candidateId: "c1", contentHash: "0".repeat(64) } }, INHALTE)), env);

  assert.equal(antwort.status, 409);
  assert.equal((await antwort.json()).error, "approvalMismatch");
  assert.equal(freigaben(g), 0);
});

test("AP7 · Ein geaenderter Text macht die Freigabe ungueltig", async () => {
  /* DER Test dieser Datei. Die Freigabe galt einem Wortlaut; gesendet
     werden soll ein anderer. Dass die Kennung dieselbe ist, aendert
     daran nichts — freigegeben wurde nicht die Kennung. */
  const { env, g } = await umgebung();
  const freigabe = await freigabeFuer(INHALTE);

  const antwort = await worker.fetch(ruf(Object.assign({}, INHALTE, {
    caption: TEXT + " Jetzt kaufen!", approval: freigabe })), env);

  assert.equal(antwort.status, 409);
  const body = await antwort.json();
  assert.equal(body.error, "approvalMismatch");
  assert.equal(body.published, false);
  assert.notEqual(body.expectedHash, body.actualHash);
  assert.equal(freigaben(g), 0, "es entstand kein Beitrag");
  assert.equal(await env.VU_SOCIAL_KV.get(claimKey(INHALT)), null,
    "und auch kein Anspruch — die Pruefung steht vor dem Anspruch");
});

test("AP8 · Auch ein geaendertes Bild macht die Freigabe ungueltig", async () => {
  const { env, g } = await umgebung();
  const freigabe = await freigabeFuer(INHALTE);
  const antwort = await worker.fetch(ruf(Object.assign({}, INHALTE, {
    imageUrl: "https://research.visionuniverse.de/assets/social/etwas-anderes.jpg",
    approval: freigabe })), env);

  assert.equal(antwort.status, 409);
  assert.equal(freigaben(g), 0);
});

test("AP9 · Auch eine andere Inhaltskennung macht die Freigabe ungueltig", async () => {
  const { env, g } = await umgebung();
  const freigabe = await freigabeFuer(INHALTE);
  const antwort = await worker.fetch(ruf(Object.assign({}, INHALTE, {
    contentId: "pkg_y", approval: freigabe })), env);

  assert.equal(antwort.status, 409);
  assert.equal(freigaben(g), 0);
});

test("AP10 · Was nicht oeffentlich wird, aendert den Abdruck nicht", async () => {
  /* Sonst waere eine Freigabe schon dadurch ungueltig, dass jemand sie
     erneut aufschreibt — mit anderem Zeitstempel oder anderem Namen. */
  const a = await contentHash(INHALTE);
  const b = await contentHash(Object.assign({}, INHALTE, {
    approvedAt: "2026-01-01T00:00:00Z", approvedBy: "jemand", strategyVersion: "v9" }));
  assert.equal(a, b);
});

test("AP11 · Leerer Text und fehlender Text sind derselbe Abdruck", async () => {
  /* "" und fehlend sind dieselbe oeffentliche Wirkung: kein Text. Sie
     verschieden zu behandeln haette eine Freigabe an einer Stelle
     scheitern lassen, an der sich nichts geaendert hat. */
  const ohne = await contentHash({ contentId: "a", imageUrl: "b" });
  const leer = await contentHash({ contentId: "a", imageUrl: "b", caption: "" });
  const nichts = await contentHash({ contentId: "a", imageUrl: "b", caption: null });
  assert.equal(ohne, leer);
  assert.equal(ohne, nichts);
});

test("AP12 · Der Abdruck haengt an jedem der drei Teile", async () => {
  const basis = await contentHash(INHALTE);
  for (const feld of ["contentId", "imageUrl", "caption"]) {
    const anders = Object.assign({}, INHALTE, { [feld]: INHALTE[feld] + "x" });
    assert.notEqual(await contentHash(anders), basis, feld + " aendert den Abdruck nicht");
  }
});

/* ------------------------------------------------------------------ */
/* DIE UEBRIGEN SPERREN GELTEN WEITER                                  */
/* ------------------------------------------------------------------ */

test("AP13 · Eine Freigabe ersetzt den Admin-Schluessel nicht", async () => {
  const { env, g } = await umgebung();
  const antwort = await worker.fetch(request("/social/meta/publish", {
    method: "POST",
    body: JSON.stringify(Object.assign({ approval: await freigabeFuer(INHALTE) }, INHALTE))
  }), env);
  assert.equal(antwort.status, 401);
  assert.equal(g.aufrufe.length, 0);
});

test("AP14 · Eine Freigabe ersetzt die Allowlist nicht", async () => {
  const { env, g } = await umgebung({ META_IG_ALLOWED_USERNAMES: "ein.anderes.konto" });
  const antwort = await worker.fetch(ruf(Object.assign({
    approval: await freigabeFuer(INHALTE) }, INHALTE)), env);
  assert.equal(antwort.status, 403);
  assert.equal((await antwort.json()).error, "targetNotAllowed");
  assert.equal(g.aufrufe.length, 0);
});

test("AP15 · Eine Freigabe hebt die Einmaligkeit nicht auf", async () => {
  /* Zweimal freigeben heisst nicht zweimal veroeffentlichen. Der
     Anspruch entscheidet, nicht die Freigabe. */
  const { env, g } = await umgebung();
  const freigabe = await freigabeFuer(INHALTE);

  const erste = await worker.fetch(ruf(Object.assign({ approval: freigabe }, INHALTE)), env);
  assert.equal((await erste.json()).published, true);

  const zweite = await worker.fetch(ruf(Object.assign({ approval: freigabe }, INHALTE)), env);
  const body = await zweite.json();
  assert.equal(body.idempotent, true);
  assert.equal(body.via, "APPROVAL", "auch der zweite Aufruf weiss, wie es entstand");
  assert.equal(freigaben(g), 1);
});

test("AP16 · In keiner Antwort steht ein Token", async () => {
  const { env } = await umgebung();
  const antwort = await worker.fetch(ruf(Object.assign({
    approval: await freigabeFuer(INHALTE) }, INHALTE)), env);
  const text = await antwort.text();
  assert.ok(!text.includes(PAGE_TOKEN));
});
