/* =========================================================================
   vision-universe-social — DER DIAGNOSE-ENDPUNKT

   Er beantwortet eine einzige Frage: warum weist Meta die Hashtag-Suche
   ab? Und er beantwortet sie so, dass daraus kein voreiliger
   Owner-Schritt folgt.

   -------------------------------------------------------------------------
   DER FEHLER, DEN DIESE DATEI FESTNAGELT
   -------------------------------------------------------------------------

   Die erste Fassung fragte `env.VU_META_APP_ID` ab. So heissen die
   Variablen nicht — sie heissen META_APP_ID und META_APP_SECRET. Die
   Bedingung war damit immer falsch, `debug_token` lief nie, und der
   Endpunkt meldete `scopeSource: "UNREADABLE"`.

   Der echte Lauf gegen die Produktion hat das zurueckgemeldet, und es
   haette als BEFUND durchgehen koennen: "die Rechte sind bei der
   Business-Anmeldung nicht lesbar" klingt wie eine Eigenschaft der
   Plattform. Es war ein Tippfehler.

   Daraus folgen zwei Tests: einer, der prueft, dass gelesen WIRD, und
   einer, der jeden kuenftigen Namensvertipper derselben Art findet.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import worker from "../src/index.js";
import { createEnv, request, completeConnect } from "./harness.mjs";

const HIER = dirname(fileURLToPath(import.meta.url));
const ADMIN = { Authorization: "Bearer " + "t".repeat(48) };

async function verbunden() {
  const env = createEnv();
  await completeConnect(worker, env);
  return env;
}

function adminKopf(env) {
  return { Authorization: "Bearer " + env.VU_SOCIAL_ADMIN_KEY };
}

/* ------------------------------------------------------------ Zugang */

test("HC1 · Ohne Admin-Schluessel gibt es keine Auskunft", async () => {
  const env = await verbunden();
  const res = await worker.fetch(request("/social/meta/hashtag-capability"), env);
  assert.equal(res.status, 401);
});

test("HC2 · Nur lesend — POST wird abgewiesen", async () => {
  const env = await verbunden();
  const res = await worker.fetch(request("/social/meta/hashtag-capability",
    { method: "POST", headers: adminKopf(env) }), env);
  assert.equal(res.status, 405);
});

test("HC3 · Ohne Verbindung wird nichts behauptet", async () => {
  const env = createEnv();
  const res = await worker.fetch(request("/social/meta/hashtag-capability",
    { headers: adminKopf(env) }), env);
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.error, "notConnected");
});

/* ------------------------------------------- Die Rechte werden gelesen */

test("HC4 · Die erteilten Rechte werden tatsaechlich gelesen", async () => {
  /* Der Test, den der Tippfehler gebraucht haette. UNREADABLE darf
     nicht herauskommen, wenn App-ID und Secret gesetzt sind - und in
     der Testumgebung sind sie es. */
  const env = await verbunden();
  const res = await worker.fetch(request("/social/meta/hashtag-capability",
    { headers: adminKopf(env) }), env);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.notEqual(body.scopeSource, "UNREADABLE",
    "Mit vorhandenen App-Zugangsdaten muessen die Rechte lesbar sein");
  assert.ok(Array.isArray(body.grantedScopes) && body.grantedScopes.length > 0);
});

test("HC5 · Eine Unlesbarkeit bekommt einen Grund", async () => {
  /* Ohne App-Zugangsdaten IST sie unlesbar - dann muss der Grund
     dastehen. Eine Unlesbarkeit ohne Grund ist keine Messung. */
  const env = await verbunden();
  delete env.META_APP_SECRET;
  const res = await worker.fetch(request("/social/meta/hashtag-capability",
    { headers: adminKopf(env) }), env);
  const body = await res.json();
  if (body.scopeSource === "UNREADABLE") {
    assert.ok(body.scopeReadError, "Unlesbar ohne Grund ist kein Befund");
  } else {
    /* Der gespeicherte Stand aus der Autorisierung traegt sie sonst. */
    assert.equal(body.scopeSource, "STORED_AT_AUTHORIZATION");
  }
});

/* ----------------------------------------------------- Der Versuch */

test("HC6 · Ohne ?probe= wird nichts abgefragt", async () => {
  /* Einen neuen Hashtag-Platz auszugeben, nur um eine Fehlermeldung zu
     lesen, waere der teuerste aller Tests. */
  const env = await verbunden();
  const res = await worker.fetch(request("/social/meta/hashtag-capability",
    { headers: adminKopf(env) }), env);
  const body = await res.json();
  assert.equal(body.probe, null);
  assert.match(body.note, /Kein Versuch ausgefuehrt/);
});

test("HC7 · Mit ?probe= laeuft genau ein Versuch, und er kostet keinen Platz", async () => {
  const env = await verbunden();
  const res = await worker.fetch(request(
    "/social/meta/hashtag-capability?probe=aktien", { headers: adminKopf(env) }), env);
  const body = await res.json();
  assert.ok(body.probe);
  assert.equal(body.probe.hashtag, "aktien");
  assert.equal(body.probe.costsNewSlot, false);
});

test("HC8 · Der Endpunkt urteilt nicht — er stellt fest", async () => {
  /* Die Unterscheidung zwischen fehlendem Recht und fehlender
     Freischaltung trifft hashtag-access.js, wo sie pruefbar ist. */
  const env = await verbunden();
  const res = await worker.fetch(request("/social/meta/hashtag-capability",
    { headers: adminKopf(env) }), env);
  const body = await res.json();
  assert.equal(body.diagnosisBy, "social/engines/hashtag-access.js");
  for (const feld of ["reauthorizationHelps", "ownerActionRequired", "featureLikelyMissing"]) {
    assert.equal(body[feld], undefined, "Der Worker schliesst nicht: " + feld);
  }
});

/* ------------------------------------------------ Allowlist und Publishing */

test("HC9 · Die Allowlist wird im Worker ausgewertet, nicht beim Aufrufer", async () => {
  /* Sie steht in der Umgebung des Workers. Wer sie aus /status zu
     lesen versucht, bekommt undefined und haelt es fuer "nicht auf der
     Liste". */
  const env = await verbunden();
  env.META_IG_ALLOWED_USERNAMES = "visionuniverse.aktienreports";
  const res = await worker.fetch(request("/social/meta/hashtag-capability",
    { headers: adminKopf(env) }), env);
  const body = await res.json();
  assert.equal(body.allowlist.configured, true);
  assert.equal(typeof body.allowlist.matches, "boolean");
});

test("HC10 · Ohne konfigurierte Allowlist ist `matches` null und nicht false", async () => {
  /* Keine Einschraenkung heisst nicht "passt nicht". */
  const env = await verbunden();
  const res = await worker.fetch(request("/social/meta/hashtag-capability",
    { headers: adminKopf(env) }), env);
  const body = await res.json();
  assert.equal(body.allowlist.configured, false);
  assert.equal(body.allowlist.matches, null);
});

test("HC11 · Veroeffentlichen wird aus den Rechten abgeleitet, nicht geraten", async () => {
  const env = await verbunden();
  const res = await worker.fetch(request("/social/meta/hashtag-capability",
    { headers: adminKopf(env) }), env);
  const body = await res.json();
  assert.equal(body.canPublish,
    body.grantedScopes ? body.grantedScopes.includes("instagram_content_publish") : null);
});

/* ------------------------------- Die allgemeine Wache gegen Namensvertipper */

test("HC12 · Jede benutzte Umgebungsvariable gibt es wirklich", async () => {
  /* -----------------------------------------------------------------
     DIE VERALLGEMEINERUNG DES FEHLERS

     `env.VU_META_APP_ID` war kein Sonderfall, sondern ein Exemplar:
     ein Name, den niemand vergibt, gelesen an einer Stelle, wo
     `undefined` wie eine Aussage aussieht. JavaScript sagt dazu
     nichts - eine unbekannte Eigenschaft ist einfach undefined.

     Dieser Test vergleicht deshalb jede in index.js gelesene
     Umgebungsvariable mit denen, die die Testumgebung und die
     Konfigurationspruefung kennen. Ein neuer Name muss an einer von
     beiden Stellen auftauchen - sonst ist er ein Vertipper. */
  const roh = readFileSync(join(HIER, "..", "src", "index.js"), "utf8");
  /* Kommentare erst entfernen. Der erste Anlauf hat `env.VU_META_APP_ID`
     gefunden - im Kommentar, der den Fehler ERKLAERT. Ein Pruefwerkzeug,
     das die Beschreibung eines Fehlers fuer den Fehler haelt, meldet
     ihn fuer immer. */
  const quelle = roh
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  const benutzt = new Set(
    [...quelle.matchAll(/\benv\.([A-Z][A-Z0-9_]{2,})\b/g)].map((m) => m[1]));

  /* Was die Testumgebung stellt. */
  const ausHarness = new Set(Object.keys(createEnv()));
  /* Was die Konfigurationspruefung des Workers selbst nennt. */
  const ausConfig = new Set(
    [...quelle.matchAll(/missing\.push\("([A-Z][A-Z0-9_]*)/g)].map((m) => m[1]));
  /* Optionale Variablen, die bewusst fehlen duerfen - jede einzeln
     benannt, damit die Liste nicht zum Sammelbecken wird. */
  const optional = new Set([
    "META_API_VERSION", "META_LOGIN_CONFIG_ID", "META_IG_ACCOUNT_ID",
    "META_IG_ALLOWED_USERNAMES", "VU_SOCIAL_SMOKE_IMAGE_URL",
    "VU_SOCIAL_SMOKE_CAPTION", "VU_SOCIAL_AUTOPUBLISH", "GLOBAL_AUTOPUBLISH",
    "VU_SOCIAL_SUBREQUEST_BUDGET", "VU_SOCIAL_BUILD"
  ]);

  const unbekannt = [...benutzt].filter((n) =>
    !ausHarness.has(n) && !ausConfig.has(n) && !optional.has(n));

  assert.deepEqual(unbekannt, [],
    "Diese Namen liest der Worker, aber niemand setzt sie: " + unbekannt.join(", "));
});
