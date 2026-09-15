/* =========================================================================
   VU SOCIAL — META/INSTAGRAM: OAUTH, CSRF, TOKEN-LEBENSZYKLUS, WEBHOOKS
   (§9, §43 "OAuth", "State/CSRF", "Token lifecycle", §50)

   Diese Datei ist der Sicherheitskern des ersten produktiven Providers.
   Kein Test hier braucht Zugangsdaten oder Netzwerk: die fetch-Funktion
   wird eingesetzt, und das ist auch die einzige Art, wie ein solcher Test
   verlaesslich sein kann.

   Der schaerfste Test ist M9. Er stellt den boesartigen Fall nach, den
   quant/tests/secrets.test.mjs S8 fuer Twelve Data prueft: der Anbieter
   spiegelt das Token in seiner Fehlermeldung zurueck. Wenn der Adapter das
   durchreicht, steht das Token im Workflow-Log und damit oeffentlich.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHmac } from "node:crypto";

const require = createRequire(import.meta.url);
const Meta = require("../providers/meta/adapter.js");
const Provider = require("../engines/provider.js");
const Capabilities = require("../engines/capabilities.js");

/* Testwerte. Sie tragen absichtlich das Praefix, das
   quant/tests/secrets.test.mjs als Platzhalter kennt — ein Test braucht
   etwas, das die FORM eines Schluessels hat, sonst prueft er nicht, was er
   pruefen soll. */
const APP_SECRET = "geheim-app-secret-nicht-ausgeben";
const TOKEN = "EAA" + "T".repeat(60);
const ISO = "2026-09-15T12:00:00Z";
const now = () => new Date(ISO);

function responder(payload, ok = true, status = 200) {
  return () => Promise.resolve({
    ok, status,
    text: () => Promise.resolve(typeof payload === "string" ? payload : JSON.stringify(payload))
  });
}

function provider(overrides = {}) {
  return Meta.createMetaProvider(Object.assign({
    appId: "1234567890", appSecret: APP_SECRET,
    tokenProvider: () => TOKEN, now,
    fetchImpl: responder({ id: "me" })
  }, overrides));
}

test("M1 · Ohne state gibt es keinen Autorisierungslink", () => {
  const p = provider();
  const res = p.getAuthorizationUrl({ redirectUri: "https://example.invalid/cb" });
  assert.equal(res.available, false);
  assert.equal(res.reason, "missingState");
  assert.match(res.message, /CSRF/);
});

test("M2 · Ohne registrierte Redirect-URI gibt es keinen Link", () => {
  const res = provider().getAuthorizationUrl({ state: Meta.createState() });
  assert.equal(res.reason, "missingRedirectUri");
});

test("M3 · Der Autorisierungslink traegt state, Rechte und response_type", () => {
  const state = Meta.createState();
  const res = provider().getAuthorizationUrl({ state, redirectUri: "https://example.invalid/cb" });
  assert.equal(res.available, true);
  const url = new URL(res.data.url);
  assert.equal(url.searchParams.get("state"), state);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.ok(url.searchParams.get("scope").includes("instagram_content_publish"));
  /* Das App-Secret hat in einem Link, den ein Browser oeffnet, nichts zu suchen. */
  assert.ok(!res.data.url.includes(APP_SECRET));
});

test("M4 · state-Werte sind zufaellig und werden in konstanter Zeit verglichen", () => {
  const a = Meta.createState();
  const b = Meta.createState();
  assert.notEqual(a, b);
  assert.ok(a.length >= 32);
  assert.equal(Meta.verifyState(a, a), true);
  assert.equal(Meta.verifyState(a, b), false);
  assert.equal(Meta.verifyState(a, a.slice(0, -1)), false);
  assert.equal(Meta.verifyState(a, null), false);
  assert.equal(Meta.verifyState("", ""), false, "Ein leerer state ist kein gueltiger state");
});

test("M5 · Ein Token-Tausch ohne state-Pruefung findet nicht statt", async () => {
  const res = await provider().exchangeCode({ code: "c", redirectUri: "https://example.invalid/cb" });
  assert.equal(res.available, false);
  assert.equal(res.reason, "missingState");
});

test("M6 · Ein falscher state bricht den Tausch ab (CSRF)", async () => {
  let called = false;
  const p = provider({ fetchImpl: () => { called = true; return responder({})(); } });
  const res = await p.exchangeCode({
    code: "c", redirectUri: "https://example.invalid/cb",
    expectedState: Meta.createState(), receivedState: Meta.createState()
  });
  assert.equal(res.reason, "stateMismatch");
  assert.equal(called, false, "Bei state-Verdacht darf kein Aufruf hinausgehen");
});

test("M7 · Ein gelungener Tausch gibt das Token NICHT zurueck", async () => {
  const state = Meta.createState();
  let call = 0;
  const p = provider({
    fetchImpl: () => {
      call++;
      return responder(call === 1
        ? { access_token: "kurzlebig-" + TOKEN, expires_in: 3600 }
        : { access_token: TOKEN, expires_in: 5184000 })();
    }
  });
  const res = await p.exchangeCode({
    code: "c", redirectUri: "https://example.invalid/cb",
    expectedState: state, receivedState: state
  });
  assert.equal(res.available, true);
  assert.equal(call, 2, "Nach dem kurzlebigen Token muss sofort das langlebige geholt werden");

  const serialized = JSON.stringify(res);
  assert.ok(!serialized.includes(TOKEN), "Das Token darf den Adapter nicht verlassen");
  assert.ok(!serialized.includes(APP_SECRET));
  assert.equal(res.data.secretName, "META_LONG_LIVED_TOKEN");
  assert.equal(res.data.tokenFingerprint.length, 16);
  assert.ok(res.data.expiresAt > ISO);
});

test("M8 · Die Verlaengerung meldet, wenn ein NEUES Token ausgestellt wurde", async () => {
  const rotated = "EAA" + "R".repeat(60);
  const p = provider({ fetchImpl: responder({ access_token: rotated, expires_in: 5184000 }) });
  const res = await p.refreshToken();
  assert.equal(res.available, true);
  assert.equal(res.data.rotated, true);
  assert.match(res.message, /muss ersetzt werden/);
  assert.ok(!JSON.stringify(res).includes(rotated));

  const same = provider({ fetchImpl: responder({ access_token: TOKEN, expires_in: 5184000 }) });
  assert.equal((await same.refreshToken()).data.rotated, false);
});

test("M9 · Ein gespiegeltes Token in einer Fehlermeldung wird nicht durchgereicht", async () => {
  const p = provider({
    fetchImpl: (url) => responder({
      error: { code: 190, message: "Invalid OAuth access token " + TOKEN + " for app " + APP_SECRET +
                                   " (request " + url + ")" }
    }, false, 400)()
  });
  const health = await p.healthCheck();
  const serialized = JSON.stringify(health);
  assert.ok(!serialized.includes(TOKEN), "Der Adapter reicht das Token aus einer Anbieterantwort durch");
  assert.ok(!serialized.includes(APP_SECRET), "Der Adapter reicht das App-Secret durch");
  assert.match(serialized, /redacted/);
  assert.equal(health.status, "unavailable");

  /* Auch die Einzelabrufe. */
  for (const call of [p.getAccounts(), p.getPermissions(), p.getPostMetrics("1")]) {
    const res = await call;
    assert.ok(!JSON.stringify(res).includes(TOKEN));
  }
});

test("M10 · Meta-Fehlercodes werden auf kanonische Gruende abgebildet", async () => {
  const cases = [
    [{ code: 190 }, "tokenExpired"],
    [{ code: 10 }, "permissionRevoked"],
    [{ code: 4 }, "rateLimited"],
    [{ code: 2 }, "providerOutage"],
    [{ code: 9004 }, "invalidMedia"],
    [{ code: 99999 }, "providerError"]
  ];
  for (const [error, expected] of cases) {
    const p = provider({ fetchImpl: responder({ error: Object.assign({ message: "x" }, error) }, false, 400) });
    const res = await p.getPermissions();
    assert.equal(res.reason, expected, `code ${error.code}`);
    /* Kein Meta-Code oberhalb des Adapters. */
    assert.ok(!("code" in res));
  }
});

test("M11 · Ohne Secrets meldet der Provider not_configured und nennt die fehlenden Namen", async () => {
  const p = Meta.createMetaProvider({});
  const health = await p.healthCheck();
  assert.equal(health.status, "not_configured");
  assert.deepEqual(health.missing, ["META_APP_ID", "META_APP_SECRET", "META_LONG_LIVED_TOKEN"]);
  /* Nicht konfiguriert ist kein Fehler, sondern eine offene Owner-Handlung. */
  assert.notEqual(health.status, "unavailable");

  const publish = await p.publish({ idempotencyKey: "k", accountId: "meta:1", media: {} });
  assert.equal(publish.reason, "notConfigured");
});

test("M12 · Der Token-Tausch ist SUPPORTED — und die Notiz sagt, WO er laeuft", () => {
  const caps = Meta.metaCapabilities();
  /* Seit dem Worker gibt es eine Runtime fuer den Callback. Die
     Faehigkeit beschreibt das System, nicht diese Datei. */
  assert.equal(Capabilities.lookup(caps, "auth", "serverSideTokenExchange"), "SUPPORTED");
  assert.equal(Capabilities.lookup(caps, "auth", "oauth"), "SUPPORTED");
  /* Die Deklaration ist unbestaetigt, und das steht drin. */
  assert.equal(caps.verifiedAt, null,
    "Solange kein Lauf gegen die echte API stattgefunden hat, bleibt verifiedAt null");
  /* Eine Faehigkeit, die woanders erfuellt wird, muss sagen wo — sonst
     sucht jemand den Callback in dieser Datei. */
  assert.match(caps.notes.serverSideTokenExchange, /vision-universe-social/);
  assert.match(caps.notes.serverSideTokenExchange, /\/social\/meta\/callback/);
  assert.match(caps.notes.tokenLocation, /verlaesst den Worker nie|Cloudflare KV/);
});

test("M13 · Die Graph API kennt keinen Idempotenz-Token — und der Adapter sagt es", () => {
  const caps = Meta.metaCapabilities();
  assert.equal(Capabilities.lookup(caps, "publish", "idempotencyToken"), "UNAVAILABLE");
  /* Daraus folgt, dass der Schutz bei uns liegt — siehe publishing.test.mjs. */
  assert.equal(Capabilities.lookup(caps, "publish", "publishText"), "UNAVAILABLE");
  assert.equal(Capabilities.lookup(caps, "publish", "scheduledPublish"), "UNAVAILABLE");
  assert.equal(Capabilities.lookup(caps, "publish", "publishStory"), null, "Ungeprueft bleibt ungeprueft");
});

test("M14 · Eine Veroeffentlichung ohne Idempotenzschluessel wird abgelehnt", async () => {
  const res = await provider().publish({ accountId: "meta:1", media: { type: "IMAGE", url: "https://a/b.jpg" } });
  assert.equal(res.reason, "missingIdempotencyKey");
});

test("M15 · Der Medientest laeuft vor dem Aufruf und kennt die Plattformgrenzen", () => {
  const p = provider();
  assert.match(p.validateMedia({ type: "IMAGE", url: "http://a/b.jpg" }).message, /https/);
  assert.match(p.validateMedia({ type: "CAROUSEL", items: [1] }).message, /2 bis 10/);
  assert.match(p.validateMedia({ type: "IMAGE", url: "https://a/b.jpg", caption: "x".repeat(2300) }).message,
    /2200/);
  assert.equal(p.validateMedia({ type: "IMAGE", url: "https://a/b.jpg" }).available, true);
});

test("M16 · Ein halb erzeugter Beitrag meldet seinen Container statt blind zu wiederholen", async () => {
  let call = 0;
  const p = provider({
    fetchImpl: () => {
      call++;
      if (call === 1) return responder({ id: "container_1" })();
      return responder({ error: { code: 2, message: "temporary" } }, false, 500)();
    }
  });
  const res = await p.publish({
    idempotencyKey: "k", accountId: "meta:17841",
    media: { type: "IMAGE", url: "https://a/b.jpg", caption: "Text" }
  });
  assert.equal(res.available, false);
  assert.equal(res.data.pendingContainer, "container_1");
  assert.match(res.message, /Container wurde bereits erzeugt/);
});

test("M17 · Die Webhook-Signatur wird geprueft und ein falscher Absender abgelehnt", () => {
  const body = JSON.stringify({ object: "instagram", entry: [] });
  const good = "sha256=" + createHmac("sha256", APP_SECRET).update(body).digest("hex");

  assert.deepEqual(Meta.verifyWebhookSignature(body, good, APP_SECRET), { valid: true, reason: null });
  assert.equal(Meta.verifyWebhookSignature(body, good, "anderes-secret").valid, false);
  assert.equal(Meta.verifyWebhookSignature("veraenderter body", good, APP_SECRET).valid, false);
  assert.equal(Meta.verifyWebhookSignature(body, "sha1=abc", APP_SECRET).reason, "malformedHeader");
  assert.equal(Meta.verifyWebhookSignature(body, good, null).reason, "noSecret");
  assert.equal(Meta.verifyWebhookSignature(body, undefined, APP_SECRET).reason, "malformedHeader");
});

test("M18 · appsecret_proof ist ein HMAC des Tokens und nicht das Token", () => {
  const proof = Meta.appSecretProof(TOKEN, APP_SECRET);
  assert.equal(proof.length, 64);
  assert.ok(!proof.includes(TOKEN.slice(0, 10)));
  assert.notEqual(proof, Meta.appSecretProof(TOKEN, "anderes-secret"));
});

test("M19 · Kontoaufloesung ueber die Facebook-Seite, und eine klare Aussage, wenn keine da ist", async () => {
  const withAccount = provider({
    fetchImpl: responder({ data: [{ id: "page_1", name: "VU",
      instagram_business_account: { id: "17841400000000000", username: "visionuniverse" } }] })
  });
  const res = await withAccount.getAccounts();
  assert.equal(res.available, true);
  assert.equal(res.data[0].accountType, "INSTAGRAM_PROFESSIONAL");
  assert.equal(res.data[0].externalId, "17841400000000000");
  assert.equal(res.data[0].pageId, "page_1");
  assert.deepEqual(Provider.findVendorLeakage(res.data), [],
    "Das kanonische Konto darf kein Meta-Feld tragen");

  const without = provider({ fetchImpl: responder({ data: [{ id: "page_2", name: "Ohne IG" }] }) });
  const none = await without.getAccounts();
  assert.equal(none.reason, "noInstagramAccount");
  assert.match(none.message, /Einrichtungsfrage/);
});

test("M20 · Erwaehnungen melden ihre Voraussetzung statt eine leere Liste", async () => {
  const res = await provider().getMentions({});
  assert.equal(res.available, false);
  assert.match(res.message, /Webhook/);
  assert.equal(res.data, null, "Eine leere Liste waere die Aussage 'es gibt keine Erwaehnungen'");
});
