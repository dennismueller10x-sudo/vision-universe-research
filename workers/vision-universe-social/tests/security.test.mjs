/* =========================================================================
   vision-universe-social — SCHWAERZUNG, FEHLERABBILDUNG, DICHTHEIT

   Der Worker haelt das einzige langlebige Meta-Token des Projekts. Diese
   Datei prueft die Annahme, auf der die gesamte Speicherentscheidung
   ruht:

       DAS TOKEN VERLAESST DEN WORKER NIE.

   Nicht "es wird nicht geloggt". Nicht "wir geben es nicht absichtlich
   aus". Sondern: es gibt keinen Weg hinaus — auch nicht ueber eine
   Fehlermeldung, die Meta uns zurueckspiegelt, und auch nicht ueber einen
   unerwarteten Ausnahmefehler.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";

import worker from "../src/index.js";
import {
  createEnv, createGraph, request, completeConnect,
  TEST_ADMIN_KEY, TEST_APP_SECRET, PAGE_TOKEN, LONG_USER_TOKEN
} from "./harness.mjs";
import { redact, redactText, fingerprint, REDACT_MASK } from "../src/redact.js";
import { graph } from "../src/graph.js";

const adminQuery = "?key=" + encodeURIComponent(TEST_ADMIN_KEY);

/* ------------------------------------------------------ Schwaerzung */

test("S1 · Tokenformen werden unabhaengig vom Schluesselnamen entfernt", () => {
  const probes = [
    "EAA" + "x".repeat(50),
    "IG" + "y".repeat(40),
    "Bearer " + "z".repeat(40),
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk",
    "https://graph.facebook.com/v21.0/me?access_token=" + "q".repeat(40),
    "appsecret_proof=" + "a".repeat(64)
  ];
  for (const probe of probes) {
    const cleaned = redactText(probe);
    assert.ok(cleaned.includes(REDACT_MASK), `nicht geschwaerzt: ${probe.slice(0, 20)}`);
    assert.ok(!cleaned.includes("x".repeat(50)));
  }
});

test("S2 · Die Schwaerzung geht in die Tiefe und laesst die Eingabe unberuehrt", () => {
  const input = {
    access_token: PAGE_TOKEN,
    nested: { list: [{ client_secret: TEST_APP_SECRET }], note: "token " + PAGE_TOKEN },
    state: "abc", code: "AQD123"
  };
  const copy = JSON.parse(JSON.stringify(input));
  const cleaned = redact(input, [TEST_APP_SECRET]);
  const serialized = JSON.stringify(cleaned);

  assert.ok(!serialized.includes(PAGE_TOKEN));
  assert.ok(!serialized.includes(TEST_APP_SECRET));
  assert.equal(cleaned.state, REDACT_MASK, "state und code erlauben einen Nachspiel-Angriff");
  assert.equal(cleaned.code, REDACT_MASK);
  /* Eine Bereinigungsfunktion, die ihre Eingabe veraendert, waere ein
     Seiteneffekt an der empfindlichsten Stelle. */
  assert.deepEqual(input, copy);
});

test("S3 · Der Fingerabdruck identifiziert, ohne zu verraten", async () => {
  const a = await fingerprint(PAGE_TOKEN);
  const b = await fingerprint(PAGE_TOKEN);
  const c = await fingerprint(LONG_USER_TOKEN);
  assert.equal(a, b, "Derselbe Wert ergibt denselben Abdruck");
  assert.notEqual(a, c);
  assert.equal(a.length, 16);
  assert.ok(!PAGE_TOKEN.includes(a), "Der Abdruck darf kein Ausschnitt des Tokens sein");
  assert.equal(await fingerprint(null), null);
});

/* ------------------------------------------- Gespiegelte Geheimnisse */

test("S4 · Ein von Meta zurueckgespiegeltes Token erreicht keine Antwort", async () => {
  /* Der boesartige Fall aus der Praxis: der Anbieter schreibt den
     gesamten Request in die Fehlermeldung. */
  const leaky = createGraph();
  const original = leaky.fetchImpl;
  leaky.fetchImpl = (url, init) => {
    if (String(url).includes("/insights")) {
      return Promise.resolve({
        ok: false, status: 400,
        text: () => Promise.resolve(JSON.stringify({
          error: {
            code: 100,
            message: "Invalid request: " + String(url) +
                     " with secret " + TEST_APP_SECRET + " and token " + PAGE_TOKEN
          }
        }))
      });
    }
    return original(url, init);
  };
  const env = createEnv({ __graph: leaky, __fetchImpl: leaky.fetchImpl });
  await completeConnect(worker, env);

  const response = await worker.fetch(request("/social/meta/verify" + adminQuery), env);
  const text = await response.text();
  assert.ok(!text.includes(PAGE_TOKEN), "Das Token wurde durchgereicht");
  assert.ok(!text.includes(TEST_APP_SECRET), "Das App-Secret wurde durchgereicht");
  assert.ok(text.includes("redacted"));
});

test("S5 · Auch der Token-Tausch reicht ein gespiegeltes Secret nicht durch", async () => {
  const leaky = createGraph({
    failOn: { "oauth/access_token": { code: 100, message: "bad secret " + TEST_APP_SECRET } }
  });
  const env = createEnv({ __graph: leaky, __fetchImpl: leaky.fetchImpl });
  const { callback } = await completeConnect(worker, env);
  const html = await callback.text();
  assert.ok(!html.includes(TEST_APP_SECRET));
  assert.equal(env.VU_SOCIAL_KV.__size(), 0);
});

test("S6 · Ein unerwarteter Ausnahmefehler verraet nichts", async () => {
  const env = createEnv({
    VU_SOCIAL_KV: {
      get() { throw new Error("KV kaputt bei Token " + PAGE_TOKEN); },
      put() {}, delete() {}
    }
  });
  const response = await worker.fetch(request("/social/meta/status" + adminQuery), env);
  const text = await response.text();
  assert.equal(response.status, 500);
  assert.ok(!text.includes(PAGE_TOKEN));
  assert.equal(JSON.parse(text).error, "internalError");
});

/* ------------------------------------------------- Fehlerabbildung */

test("S7 · Meta-Fehlercodes werden auf kanonische Gruende abgebildet", async () => {
  const cases = [
    [190, "tokenExpired"], [10, "permissionRevoked"], [4, "rateLimited"],
    [2, "providerOutage"], [9004, "invalidMedia"], [99999, "providerError"]
  ];
  for (const [code, expected] of cases) {
    const stub = {
      apiVersion: "v21.0", appSecret: TEST_APP_SECRET,
      fetchImpl: () => Promise.resolve({
        ok: false, status: 400,
        text: () => Promise.resolve(JSON.stringify({ error: { code, message: "x" } }))
      })
    };
    const result = await graph(stub, "me", {}, "EAA" + "t".repeat(40));
    assert.equal(result.reason, expected, `code ${code}`);
    /* Oberhalb des Adapters existiert kein Meta-Code mehr. */
    assert.ok(!("code" in result));
  }
});

test("S8 · Ein Netzwerkfehler ist wiederholbar, ein Rechtefehler nicht", async () => {
  const network = {
    apiVersion: "v21.0", appSecret: TEST_APP_SECRET,
    fetchImpl: () => Promise.reject(new Error("socket hang up"))
  };
  const failed = await graph(network, "me", {}, "EAA" + "t".repeat(40));
  assert.equal(failed.reason, "networkError");
  assert.equal(failed.retryable, true);

  const denied = {
    apiVersion: "v21.0", appSecret: TEST_APP_SECRET,
    fetchImpl: () => Promise.resolve({
      ok: false, status: 400,
      text: () => Promise.resolve(JSON.stringify({ error: { code: 10, message: "no permission" } }))
    })
  };
  const result = await graph(denied, "me", {}, "EAA" + "t".repeat(40));
  assert.equal(result.reason, "permissionRevoked");
  assert.notEqual(result.retryable, true, "Warten hilft gegen ein fehlendes Recht nicht");
});

/* -------------------------------------------------- Kopf und Rahmen */

test("S9 · Antworten tragen die Schutz-Kopfzeilen und werden nicht zwischengespeichert", async () => {
  const env = createEnv();
  const response = await worker.fetch(request("/social/meta/status" + adminQuery), env);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
});

test("S10 · Die HTML-Seiten laden nichts nach", async () => {
  const env = createEnv();
  const { callback } = await completeConnect(worker, env);
  const csp = callback.headers.get("content-security-policy");
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  const html = await callback.text();
  assert.ok(!/<script/i.test(html), "Keine Seite des Workers fuehrt Skripte aus");
  assert.ok(!/src=/i.test(html), "Keine Seite laedt eine externe Ressource");
});

test("S11 · Kontonamen werden als Text eingesetzt, nicht als Markup", async () => {
  const graph2 = createGraph({ pages: [{
    id: "page_x", name: '<script>alert(1)</script>', access_token: PAGE_TOKEN,
    instagram_business_account: { id: "17841400000000003", username: '"><img src=x onerror=alert(1)>' }
  }] });
  const env = createEnv({ __graph: graph2, __fetchImpl: graph2.fetchImpl });
  const { callback } = await completeConnect(worker, env);
  const html = await callback.text();

  /* Die Eigenschaft, auf die es ankommt, ist nicht "die Zeichenkette
     kommt nicht vor" — sie kommt vor, als TEXT. Sie ist: kein Tag wird
     roh ausgegeben. `onerror=alert(1)` innerhalb von &lt;img …&gt; ist
     Inhalt und kein Attribut. */
  assert.ok(!/<img/i.test(html), "Ein rohes <img> waere ausfuehrbar");
  assert.ok(!html.includes("<script>alert"), "Ein rohes <script> waere ausfuehrbar");
  assert.match(html, /&lt;script&gt;/, "Der Seitenname erscheint escaped");
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/, "Der Benutzername erscheint escaped");
});

test("S12 · Unbekannte Pfade und falsche Methoden geben nichts preis", async () => {
  const env = createEnv();
  await completeConnect(worker, env);

  const notFound = await worker.fetch(request("/social/meta/gibtesnicht" + adminQuery), env);
  assert.equal(notFound.status, 404);
  const body = await notFound.json();
  assert.equal(body.error, "notFound");
  assert.ok(!JSON.stringify(body).includes(PAGE_TOKEN));

  const wrongMethod = await worker.fetch(
    request("/social/meta/connect" + adminQuery, { method: "POST" }), env);
  assert.equal(wrongMethod.status, 405);
});

test("S13 · /health verraet nichts ueber die Verbindung", async () => {
  const env = createEnv();
  await completeConnect(worker, env);
  const response = await worker.fetch(request("/health"), env);
  const body = await response.json();

  /* /health ist oeffentlich. Es beantwortet "laeuft der Worker", nicht
     "wer ist verbunden". */
  assert.equal(body.alive, true);
  assert.ok(!("connection" in body));
  const serialized = JSON.stringify(body);
  assert.ok(!serialized.includes("visionuniverse"));
  assert.ok(!serialized.includes("17841400000000001"));
  assert.ok(!serialized.includes(PAGE_TOKEN));
});
