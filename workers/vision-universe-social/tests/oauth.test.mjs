/* =========================================================================
   vision-universe-social — OAUTH, CSRF, TOKEN, CAPABILITIES

   Die Tests bilden die Reihenfolge ab, in der ein Angriff oder ein Unfall
   tatsaechlich auftritt:

     W1-W4    der Worker ohne Konfiguration und ohne Schluessel
     W5-W8    der Autorisierungslink
     W9-W15   der Callback — hier liegen die Sperren
     W16-W20  was gespeichert wird und was nicht
     W21-W25  Capabilities aus echten Rechten
     W26-W29  Verify, Disconnect, Wiederholung

   Der wichtigste Test ist W11: bei CSRF-Verdacht darf KEIN Token
   angefordert werden. Ein Worker, der erst tauscht und dann prueft, hat
   den Code bereits eingeloest — und damit dem Angreifer geantwortet.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";

import worker, { __internals } from "../src/index.js";
import {
  createEnv, createGraph, createKV, request, startConnect, completeConnect, cookieFrom,
  TEST_ADMIN_KEY, TEST_APP_SECRET, TEST_BASE_URL, PAGE_TOKEN, LONG_USER_TOKEN,
  SHORT_USER_TOKEN, DEFAULT_GRANTED
} from "./harness.mjs";
import { createState, verifyState, timingSafeEqual } from "../src/state.js";
import { deriveCapabilities } from "../src/capabilities.js";
import { redact, redactText } from "../src/redact.js";
import { readConnection, readPublic } from "../src/store.js";

const adminQuery = "?key=" + encodeURIComponent(TEST_ADMIN_KEY);

/* ------------------------------------------------- Konfiguration */

test("W1 · Ohne Konfiguration meldet /health, was fehlt — und nennt nur Namen", async () => {
  const response = await worker.fetch(request("/health"), {});
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.alive, true);
  assert.equal(body.configured, false);
  assert.ok(body.missingConfiguration.includes("META_APP_ID"));
  assert.ok(body.missingConfiguration.includes("VU_SOCIAL_ADMIN_KEY"));
  /* Nur Namen. Kein Wert, kein Hinweis auf einen Wert. */
  assert.ok(!JSON.stringify(body).includes(TEST_APP_SECRET));
});

test("W2 · Ohne Admin-Schluessel bleiben die Endpunkte geschlossen", async () => {
  const env = createEnv();
  for (const path of ["/social/meta/connect", "/social/meta/status", "/social/meta/verify"]) {
    const response = await worker.fetch(request(path), env);
    assert.equal(response.status, 401, path);
    const body = await response.json();
    assert.equal(body.error, "unauthorized");
    /* Keine Auskunft, ob der Schluessel fehlte oder falsch war. */
    assert.ok(!/fehlt|falsch|laenge/i.test(body.message));
  }
});

test("W3 · Ein zu kurzer Admin-Schluessel wird abgelehnt, nicht akzeptiert", async () => {
  const env = createEnv({ VU_SOCIAL_ADMIN_KEY: "zu-kurz" });
  const response = await worker.fetch(request("/social/meta/status?key=zu-kurz"), env);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "weakAdminKey");
  assert.equal(__internals.MIN_ADMIN_KEY_LENGTH, 32);
});

test("W4 · Der Admin-Schluessel wird in konstanter Zeit verglichen", () => {
  assert.equal(timingSafeEqual(TEST_ADMIN_KEY, TEST_ADMIN_KEY), true);
  assert.equal(timingSafeEqual(TEST_ADMIN_KEY, TEST_ADMIN_KEY.slice(0, -1) + "x"), false);
  assert.equal(timingSafeEqual(TEST_ADMIN_KEY, TEST_ADMIN_KEY.slice(0, -1)), false);
  assert.equal(timingSafeEqual("", ""), false, "Ein leerer Schluessel ist kein Schluessel");
});

/* --------------------------------------------- Autorisierungslink */

test("W5 · /connect leitet zum Meta-Dialog mit state, Rechten und response_type", async () => {
  const env = createEnv();
  const { response, location } = await startConnect(worker, env);
  assert.equal(response.status, 302);
  const url = new URL(location);
  assert.equal(url.host, "www.facebook.com");
  assert.ok(url.searchParams.get("state"));
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), env.META_APP_ID);
  assert.equal(url.searchParams.get("redirect_uri"), TEST_BASE_URL + "/social/meta/callback");
  /* Nur die Rechte, die das System braucht (§9.4). */
  const scopes = url.searchParams.get("scope").split(",");
  assert.deepEqual(scopes.sort(), DEFAULT_GRANTED.slice().sort());
  /* Das App-Secret hat in einem Link, den ein Browser oeffnet, nichts zu suchen. */
  assert.ok(!location.includes(TEST_APP_SECRET));
});

test("W6 · Das Nonce-Cookie ist __Host-, Secure, HttpOnly und kurzlebig", async () => {
  const env = createEnv();
  const { response } = await startConnect(worker, env);
  const raw = response.headers.get("set-cookie");
  assert.match(raw, /^__Host-vu_oauth_nonce=/);
  assert.match(raw, /Secure/);
  assert.match(raw, /HttpOnly/);
  assert.match(raw, /SameSite=Lax/);
  assert.match(raw, /Path=\//);
  /* __Host- verlangt, dass KEIN Domain-Attribut gesetzt ist. */
  assert.ok(!/Domain=/i.test(raw));
});

test("W7 · Zwei Aufrufe erzeugen zwei verschiedene state-Werte", async () => {
  const env = createEnv();
  const a = await startConnect(worker, env);
  const b = await startConnect(worker, env);
  assert.notEqual(a.state, b.state);
  assert.notEqual(a.cookie, b.cookie);
});

test("W8 · Ohne vollstaendige Konfiguration gibt es keinen Link", async () => {
  const env = createEnv({ PUBLIC_BASE_URL: undefined });
  const response = await worker.fetch(request("/social/meta/connect" + adminQuery), env);
  assert.equal(response.status, 503);
  const html = await response.text();
  assert.match(html, /PUBLIC_BASE_URL/);
  assert.ok(!html.includes(TEST_APP_SECRET));
});

/* ---------------------------------------------------- Der Callback */

test("W9 · Ein Callback ohne code oder state wird abgewiesen", async () => {
  const env = createEnv();
  const response = await worker.fetch(request("/social/meta/callback"), env);
  assert.equal(response.status, 400);
  assert.match(await response.text(), /missingParameters/);
  assert.equal(env.VU_SOCIAL_KV.__size(), 0, "Es darf nichts gespeichert worden sein");
});

test("W10 · Ein Abbruch im Meta-Dialog ist ein verstaendlicher Zustand", async () => {
  const env = createEnv();
  const response = await worker.fetch(
    request("/social/meta/callback?error=access_denied&error_description=User+denied"), env);
  assert.equal(response.status, 400);
  const html = await response.text();
  assert.match(html, /accessDenied/);
  assert.match(html, /abgebrochen oder abgelehnt/);
  assert.equal(env.VU_SOCIAL_KV.__size(), 0);
});

test("W11 · Bei CSRF-Verdacht wird KEIN Token angefordert", async () => {
  const env = createEnv();
  const started = await startConnect(worker, env);
  const before = env.__graph.calls.length;

  /* Fremder state, gueltiges Cookie. */
  const forged = await createState(TEST_APP_SECRET + "-anderer-schluessel");
  const response = await worker.fetch(request(
    `/social/meta/callback?code=AQD-test&state=${encodeURIComponent(forged.state)}`,
    { headers: { cookie: started.cookie } }), env);

  assert.equal(response.status, 400);
  assert.match(await response.text(), /signatureMismatch/);
  assert.equal(env.__graph.calls.length, before,
    "Nach einem ungueltigen state darf kein einziger Graph-Aufruf hinausgegangen sein");
  assert.equal(env.VU_SOCIAL_KV.__size(), 0);
});

test("W12 · Ein gueltiger state im FALSCHEN Browser wird abgewiesen", async () => {
  const env = createEnv();
  const started = await startConnect(worker, env);
  const before = env.__graph.calls.length;

  /* Der klassische CSRF-Fall: der Angreifer schiebt dem Owner seinen
     eigenen, echten Autorisierungslink unter. Der state ist gueltig — das
     Cookie fehlt. */
  const response = await worker.fetch(request(
    `/social/meta/callback?code=AQD-test&state=${encodeURIComponent(started.state)}`), env);

  assert.equal(response.status, 400);
  assert.match(await response.text(), /missingCookie/);
  assert.equal(env.__graph.calls.length, before);
});

test("W13 · Ein state mit fremdem Cookie wird abgewiesen", async () => {
  const env = createEnv();
  const a = await startConnect(worker, env);
  const b = await startConnect(worker, env);
  const response = await worker.fetch(request(
    `/social/meta/callback?code=AQD-test&state=${encodeURIComponent(a.state)}`,
    { headers: { cookie: b.cookie } }), env);
  assert.equal(response.status, 400);
  assert.match(await response.text(), /cookieMismatch/);
});

test("W14 · Ein abgelaufener state wird abgewiesen", async () => {
  const eleven = Date.now() - 11 * 60 * 1000;
  const old = await createState(TEST_APP_SECRET, { now: eleven });
  const verified = await verifyState(TEST_APP_SECRET, old.state, old.cookie);
  assert.equal(verified.valid, false);
  assert.equal(verified.reason, "expired");
});

test("W15 · Ein state aus der Zukunft ist ein Fund", async () => {
  const future = Date.now() + 10 * 60 * 1000;
  const ahead = await createState(TEST_APP_SECRET, { now: future });
  const verified = await verifyState(TEST_APP_SECRET, ahead.state, ahead.cookie);
  assert.equal(verified.valid, false);
  assert.equal(verified.reason, "futureTimestamp");
});

/* ------------------------------------------- Was gespeichert wird */

test("W16 · Der vollstaendige Flow verbindet und speichert das PAGE-Token", async () => {
  const env = createEnv();
  const { callback } = await completeConnect(worker, env);
  assert.equal(callback.status, 200);

  const record = await readConnection(env);
  assert.ok(record, "Es muss ein Datensatz entstanden sein");
  assert.equal(record.instagramAccountId, "17841400000000001");
  assert.equal(record.instagramUsername, "visionuniverse");
  assert.equal(record.pageId, "page_100");

  /* DER KERN: gespeichert wird das Page-Token, nicht das User-Token.
     Ein Page-Token laeuft nicht ab — das ist der Unterschied zwischen
     "einmal autorisieren" und "alle 60 Tage neu". */
  assert.equal(record.pageAccessToken, PAGE_TOKEN);
  assert.equal(record.tokenExpiresAt, null);
  assert.ok(!JSON.stringify(record).includes(LONG_USER_TOKEN),
    "Das User-Token wird nach der Ableitung verworfen");
  assert.ok(!JSON.stringify(record).includes(SHORT_USER_TOKEN));
});

test("W17 · Die Erfolgsseite zeigt niemals ein Token", async () => {
  const env = createEnv();
  const { callback } = await completeConnect(worker, env);
  const html = await callback.text();

  assert.ok(!html.includes(PAGE_TOKEN), "Das Token darf nicht auf der Seite stehen");
  assert.ok(!html.includes(LONG_USER_TOKEN));
  assert.ok(!html.includes(TEST_APP_SECRET));
  /* Stattdessen der Fingerabdruck — er beantwortet "ist das noch dasselbe?". */
  assert.match(html, /Fingerabdruck/);
  assert.match(html, /visionuniverse/);
  /* Und das Nonce-Cookie ist abgeraeumt. */
  assert.match(callback.headers.get("set-cookie") || "", /Max-Age=0/);
});

test("W18 · /status gibt den Zustand ohne Token zurueck", async () => {
  const env = createEnv();
  await completeConnect(worker, env);
  const response = await worker.fetch(request("/social/meta/status" + adminQuery), env);
  const body = await response.json();
  const serialized = JSON.stringify(body);

  assert.equal(body.connection.connected, true);
  assert.equal(body.connection.instagramUsername, "visionuniverse");
  assert.equal(body.connection.tokenKind, "page");
  assert.equal(typeof body.connection.tokenFingerprint, "string");
  assert.equal(body.connection.tokenFingerprint.length, 16);

  assert.ok(!serialized.includes(PAGE_TOKEN), "Kein Endpunkt gibt das Token heraus");
  assert.ok(!serialized.includes(TEST_APP_SECRET));
  assert.ok(!serialized.includes(TEST_ADMIN_KEY));
  /* Das Feld existiert nicht — es ist nicht nur geschwaerzt. */
  assert.ok(!("pageAccessToken" in body.connection));
});

test("W19 · Ohne Instagram-Konto wird nichts gespeichert und der Grund genannt", async () => {
  const graph = createGraph({ pages: [{ id: "page_9", name: "Seite ohne Instagram" }] });
  const env = createEnv({ __graph: graph, __fetchImpl: graph.fetchImpl });
  const { callback } = await completeConnect(worker, env);

  assert.equal(callback.status, 400);
  const html = await callback.text();
  assert.match(html, /noInstagramAccount/);
  /* Die Meldung sagt jetzt, WAS die API geantwortet hat: Seitenliste
     nicht leer, Feld nicht gefuellt. Frueher stand hier eine Diagnose
     ("kein Professional-Konto"), die der Abruf gar nicht belegen kann. */
  assert.match(html, /nicht leer/i);
  assert.match(html, /instagram_business_account/);
  assert.equal(env.VU_SOCIAL_KV.__size(), 0);
});

test("W20 · Ein Token, das den Testabruf nicht besteht, wird nicht gespeichert", async () => {
  const graph = createGraph({ failOn: { "17841400000000001": { code: 190, message: "invalid" } } });
  const env = createEnv({ __graph: graph, __fetchImpl: graph.fetchImpl });
  const { callback } = await completeConnect(worker, env);

  assert.equal(callback.status, 502);
  assert.match(await callback.text(), /Testabruf/);
  assert.equal(env.VU_SOCIAL_KV.__size(), 0,
    "Ein Token, das nicht funktioniert, gehoert nicht in den Speicher");
});

/* ----------------------------------- Capabilities aus echten Rechten */

test("W21 · Fehlende Rechte ergeben geprueft nicht verfuegbare Faehigkeiten", () => {
  const partial = deriveCapabilities(
    ["instagram_basic", "pages_show_list", "pages_read_engagement"], DEFAULT_GRANTED);

  assert.equal(partial.operational, true, "Die Grundrechte reichen fuer die Aufloesung");
  assert.equal(partial.sets.publish.publishImage, "UNAVAILABLE");
  assert.equal(partial.sets.analytics.accountInsights, "UNAVAILABLE");
  assert.ok(partial.missing.includes("instagram_content_publish"));
  assert.match(partial.explanation, /NICHT moeglich/);
});

test("W22 · Vollstaendige Rechte ergeben nutzbare Faehigkeiten", () => {
  const full = deriveCapabilities(DEFAULT_GRANTED, DEFAULT_GRANTED);
  assert.equal(full.operational, true);
  assert.equal(full.sets.publish.publishImage, "SUPPORTED");
  assert.equal(full.sets.analytics.accountInsights, "SUPPORTED");
  assert.equal(full.sets.audience.readComments, "SUPPORTED");
  assert.deepEqual(full.missing, []);
});

test("W23 · Fehlende Grundrechte machen die Verbindung nicht arbeitsfaehig", () => {
  const broken = deriveCapabilities(["instagram_content_publish"], DEFAULT_GRANTED);
  assert.equal(broken.operational, false);
  assert.ok(broken.missingEssential.includes("instagram_basic"));
  assert.match(broken.explanation, /nicht arbeitsfaehig/);
});

test("W24 · Ungeprueftes bleibt ungeprueft — null wird nicht zu UNAVAILABLE", () => {
  const full = deriveCapabilities(DEFAULT_GRANTED, DEFAULT_GRANTED);
  assert.equal(full.sets.publish.publishStory, null,
    "Stories sind kontotypabhaengig und aus Rechten nicht ableitbar");
  assert.equal(full.sets.publish.productTags, null);
  assert.equal(full.sets.audience.readDirectMessages, null);
  /* Was aus der API folgt, steht fest — unabhaengig von Rechten. */
  assert.equal(full.sets.publish.idempotencyToken, "UNAVAILABLE");
  assert.equal(full.sets.publish.scheduledPublish, "UNAVAILABLE");
});

test("W25 · Im Worker ist serverSideTokenExchange erfuellt", () => {
  const full = deriveCapabilities(DEFAULT_GRANTED, DEFAULT_GRANTED);
  assert.equal(full.sets.auth.serverSideTokenExchange, "SUPPORTED",
    "Das ist der ganze Zweck dieses Workers");
  assert.equal(full.sets.auth.oauth, "SUPPORTED");
});

test("W25b · Ein Callback mit unvollstaendigen Rechten speichert nichts", async () => {
  const graph = createGraph({ granted: ["instagram_content_publish"] });
  const env = createEnv({ __graph: graph, __fetchImpl: graph.fetchImpl });
  const { callback } = await completeConnect(worker, env);
  assert.equal(callback.status, 400);
  assert.match(await callback.text(), /missingEssentialPermissions/);
  assert.equal(env.VU_SOCIAL_KV.__size(), 0);
});

/* ------------------------------------- Verify, Disconnect, Wiederholung */

test("W26 · /verify prueft live, veroeffentlicht nichts und gibt kein Token heraus", async () => {
  const env = createEnv();
  await completeConnect(worker, env);
  const response = await worker.fetch(request("/social/meta/verify" + adminQuery), env);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.verdict, "VERIFIED");
  assert.equal(body.published, false, "Der Verifikationslauf veroeffentlicht nichts");

  const names = body.checks.map((c) => c.name);
  assert.ok(names.includes("Konto erreichbar"));
  assert.ok(names.includes("Instagram-Professional-Konto erkannt"));
  assert.ok(names.includes("Publishing Capability"));
  assert.ok(names.includes("Insights Capability"));
  assert.ok(names.includes("Analytics Read"));
  assert.ok(body.checks.every((c) => c.result !== "FAIL"));

  const serialized = JSON.stringify(body);
  assert.ok(!serialized.includes(PAGE_TOKEN));
  assert.ok(!serialized.includes(TEST_APP_SECRET));

  /* Kein einziger POST an die Graph API. */
  assert.ok(env.__graph.calls.every((call) => call.method !== "POST"),
    "Verify darf ausschliesslich lesen");
});

test("W27 · /verify ohne Verbindung sagt das, statt zu raten", async () => {
  const env = createEnv();
  const response = await worker.fetch(request("/social/meta/verify" + adminQuery), env);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).verdict, "NOT_CONNECTED");
});

test("W28 · Trennen loescht den Datensatz und widerruft bei Meta", async () => {
  const env = createEnv();
  await completeConnect(worker, env);
  assert.equal(env.VU_SOCIAL_KV.__size(), 1);

  /* Per GET geht es nicht — ein untergeschobener Link wuerde sonst trennen. */
  const viaGet = await worker.fetch(request("/social/meta/disconnect" + adminQuery), env);
  assert.equal(viaGet.status, 405);
  assert.equal(env.VU_SOCIAL_KV.__size(), 1);

  const response = await worker.fetch(
    request("/social/meta/disconnect" + adminQuery, { method: "POST" }), env);
  const body = await response.json();
  assert.equal(body.disconnected, true);
  assert.equal(body.revokedAtMeta, true);
  assert.equal(env.VU_SOCIAL_KV.__size(), 0);

  /* Der Widerruf ging tatsaechlich hinaus. */
  assert.ok(env.__graph.calls.some((c) => c.path === "me/permissions" && c.method === "DELETE"));
});

test("W29 · Eine zweite Autorisierung ersetzt die erste, ohne Reste zu lassen", async () => {
  const env = createEnv();
  await completeConnect(worker, env);
  const first = await readConnection(env);

  const graph = createGraph({ pages: [{
    id: "page_200", name: "Zweite Seite", access_token: "EAA" + "z".repeat(60),
    instagram_business_account: { id: "17841400000000002", username: "vu_zweit" }
  }] });
  env.__fetchImpl = graph.fetchImpl;
  env.__graph = graph;

  await completeConnect(worker, env);
  const second = await readConnection(env);

  assert.equal(env.VU_SOCIAL_KV.__size(), 1, "Es bleibt genau ein Datensatz");
  assert.equal(second.instagramAccountId, "17841400000000002");
  assert.notEqual(second.pageAccessToken, first.pageAccessToken);
  assert.ok(!JSON.stringify(second).includes(first.pageAccessToken),
    "Vom alten Token darf kein Rest bleiben");
});

test("W30 · Ein konfiguriertes Zielkonto sperrt eine fremde Autorisierung", async () => {
  /* Der Grund heisst jetzt `targetNotAllowed` statt `accountMismatch`:
     derselbe Schutz, aber er greift ueber ID UND Handle, nicht nur ueber
     die ID. Ein Name fuer einen Begriff. */
  const env = createEnv({ META_IG_ACCOUNT_ID: "17841499999999999" });
  const { callback } = await completeConnect(worker, env);
  assert.equal(callback.status, 400);
  assert.match(await callback.text(), /targetNotAllowed/);
  assert.equal(env.VU_SOCIAL_KV.__size(), 0);
});
