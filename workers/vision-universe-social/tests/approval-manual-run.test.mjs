/* =========================================================================
   vision-universe-social — JETZT PRUEFEN (MR1–MR16)

   §2–§5, §27–§31, §38.

   -------------------------------------------------------------------------
   WAS DIESER KNOPF BEWEISEN MUSS
   -------------------------------------------------------------------------

     1. ER GEHOERT DEM OWNER. Ohne Sitzung loest er nichts aus, und er
        ist ohne Sitzung auch nicht zu sehen.

     2. ER IST KEIN LINK. Ein GET waere ueber ein fremdes Bild
        ausloesbar - und das Ergebnis waere ein produktiver Lauf auf
        Kosten des Owners.

     3. ER FAELLT GESCHLOSSEN AUS. Fehlt die Verbindung zum Lauf,
        passiert nichts, und es steht da, WELCHE Einstellung fehlt -
        nie, welchen Wert sie haette.

     4. ER LOEST NICHT ZWEIMAL AUS. Ein zweiter Druck kurz danach
        stoesst keinen zweiten Lauf an.

     5. ER SETZT NICHTS ZURUECK (§38). Keine Tageszaehler, keine
        Abstandszeitpunkte, kein Portfolio-Zustand.

     6. DAS GEHEIMNIS BLEIBT GEHEIM. Nicht im HTML, nicht in einer
        Adresse, nicht in der Antwort - und im Header, nicht in der URL.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import worker from "../src/index.js";
import { createEnv, request, TEST_ADMIN_KEY } from "./harness.mjs";
import { MANUAL_RUN_KEY } from "../src/store.js";
import { MANUAL_RUN_SPERRE_SEKUNDEN } from "../src/approval.js";

const TOKEN = "ghp_nur_fuer_den_test_0000000000000000";

async function anmelden(env) {
  const antwort = await worker.fetch(request("/approval/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ adminKey: TEST_ADMIN_KEY })
  }), env);
  const gesetzt = antwort.headers.get("set-cookie");
  return gesetzt ? gesetzt.split(";")[0] : null;
}

/** Eine Umgebung, in der der Dispatch eingerichtet ist - mit aufgezeichnetem fetch. */
function envMitDispatch(overrides = {}) {
  const env = createEnv(Object.assign({
    VU_GITHUB_DISPATCH_TOKEN: TOKEN,
    VU_GITHUB_REPO: "beispiel/repo",
    VU_GITHUB_REF: "main"
  }, overrides));
  return env;
}

/** Faengt globale fetch-Aufrufe ab und gibt sie zur Pruefung zurueck. */
function fetchAufzeichnen(status = 204) {
  const rufe = [];
  const echt = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    rufe.push({ url: String(url), init: init || {} });
    return new Response(null, { status });
  };
  return { rufe, zurueck: () => { globalThis.fetch = echt; } };
}

async function druecke(env, cookie) {
  return await worker.fetch(request("/approval/run", {
    method: "POST", headers: cookie ? { cookie } : {}
  }), env);
}

/* ------------------------------------------------------ Das Tor */

test("MR1 · Ohne Sitzung loest der Knopf nichts aus", async () => {
  const env = envMitDispatch();
  const f = fetchAufzeichnen();
  try {
    const antwort = await druecke(env, null);
    assert.equal(f.rufe.length, 0, "Es wurde trotzdem nach aussen gerufen");
    /* Das Anmeldeformular, kein Lauf. */
    const html = await antwort.text();
    assert.doesNotMatch(html, /Die Pruefung laeuft/);
  } finally { f.zurueck(); }
});

test("MR2 · Ohne Sitzung ist der Knopf nicht einmal sichtbar", async () => {
  const env = envMitDispatch();
  const antwort = await worker.fetch(request("/approval"), env);
  const html = await antwort.text();
  assert.doesNotMatch(html, /\/approval\/run/);
});

test("MR3 · Ein GET loest keinen Lauf aus", async () => {
  /* Sonst genuegte ein untergeschobener Link - oder ein Bild-Tag. */
  const env = envMitDispatch();
  const cookie = await anmelden(env);
  const f = fetchAufzeichnen();
  try {
    const antwort = await worker.fetch(request("/approval/run", {
      method: "GET", headers: { cookie }
    }), env);
    assert.equal(antwort.status, 405);
    assert.equal(f.rufe.length, 0);
  } finally { f.zurueck(); }
});

/* --------------------------------------------------- Fail closed */

test("MR4 · Ohne eingerichtete Verbindung passiert nichts", async () => {
  const env = createEnv();
  const cookie = await anmelden(env);
  const f = fetchAufzeichnen();
  try {
    const antwort = await druecke(env, cookie);
    const html = await antwort.text();
    assert.equal(f.rufe.length, 0);
    assert.match(html, /VU_GITHUB_DISPATCH_TOKEN/);
    assert.match(html, /VU_GITHUB_REPO/);
    assert.match(html, /nach Zeitplan/);
  } finally { f.zurueck(); }
});

test("MR5 · Der fehlende Wert wird nie genannt, nur der Name", async () => {
  const env = createEnv({ VU_GITHUB_REPO: "beispiel/repo" });
  const cookie = await anmelden(env);
  const antwort = await druecke(env, cookie);
  const html = await antwort.text();
  assert.match(html, /VU_GITHUB_DISPATCH_TOKEN/);
  assert.doesNotMatch(html, /ghp_/);
  /* Und der vorhandene Name faellt nicht als fehlend an. */
  assert.doesNotMatch(html, /VU_GITHUB_REPO/);
});

/* ------------------------------------------------- Der Anstoss */

test("MR6 · Mit Sitzung wird genau EIN Dispatch gesendet", async () => {
  const env = envMitDispatch();
  const cookie = await anmelden(env);
  const f = fetchAufzeichnen(204);
  try {
    const antwort = await druecke(env, cookie);
    const html = await antwort.text();
    assert.equal(f.rufe.length, 1);
    assert.match(html, /Die Pruefung laeuft/);
  } finally { f.zurueck(); }
});

test("MR7 · Es ist DERSELBE Workflow, den der Zeitplan startet", async () => {
  /* Keine zweite Pipeline. Die Datei, die hier angestossen wird, muss
     die sein, die der Scheduler faehrt. */
  const env = envMitDispatch();
  const cookie = await anmelden(env);
  const f = fetchAufzeichnen(204);
  try {
    await druecke(env, cookie);
    assert.match(f.rufe[0].url,
      /\/repos\/beispiel\/repo\/actions\/workflows\/social-orchestrator\.yml\/dispatches$/);
    const workflow = readFileSync(
      new URL("../../../.github/workflows/social-orchestrator.yml", import.meta.url), "utf8");
    assert.match(workflow, /workflow_dispatch:/);
  } finally { f.zurueck(); }
});

test("MR8 · Das Token steht im Header und nie in der Adresse", async () => {
  const env = envMitDispatch();
  const cookie = await anmelden(env);
  const f = fetchAufzeichnen(204);
  try {
    await druecke(env, cookie);
    const ruf = f.rufe[0];
    assert.doesNotMatch(ruf.url, /ghp_|token|key=/i,
      "Das Geheimnis steht in der Adresse: " + ruf.url);
    assert.equal(ruf.init.headers.authorization, "Bearer " + TOKEN);
  } finally { f.zurueck(); }
});

test("MR9 · Das Token erscheint in keiner Antwort", async () => {
  const env = envMitDispatch();
  const cookie = await anmelden(env);
  for (const status of [204, 403, 404]) {
    const f = fetchAufzeichnen(status);
    try {
      const antwort = await druecke(env, cookie);
      const html = await antwort.text();
      assert.doesNotMatch(html, /ghp_/, "Token in der Antwort bei Status " + status);
      assert.doesNotMatch(html, /authorization/i);
    } finally { f.zurueck(); }
  }
});

/* --------------------------------------------- Der doppelte Druck */

test("MR10 · Ein zweiter Druck kurz danach loest nichts aus", async () => {
  const env = envMitDispatch();
  const cookie = await anmelden(env);
  const f = fetchAufzeichnen(204);
  try {
    await druecke(env, cookie);
    const zweite = await druecke(env, cookie);
    const html = await zweite.text();
    assert.equal(f.rufe.length, 1, "Es wurde zweimal angestossen");
    assert.match(html, /keinen zweiten Lauf/);
  } finally { f.zurueck(); }
});

test("MR11 · Ein fehlgeschlagener Anstoss sperrt den naechsten nicht", async () => {
  /* Sonst haelt ein Fehler den Owner von seinem Versuch ab. */
  const env = envMitDispatch();
  const cookie = await anmelden(env);
  const schlecht = fetchAufzeichnen(403);
  try { await druecke(env, cookie); } finally { schlecht.zurueck(); }
  const gut = fetchAufzeichnen(204);
  try {
    const antwort = await druecke(env, cookie);
    const html = await antwort.text();
    assert.equal(gut.rufe.length, 1);
    assert.match(html, /Die Pruefung laeuft/);
  } finally { gut.zurueck(); }
});

test("MR12 · Die Sperrfrist ist benannt und endlich", async () => {
  assert.ok(MANUAL_RUN_SPERRE_SEKUNDEN > 0);
  assert.ok(MANUAL_RUN_SPERRE_SEKUNDEN <= 3600,
    "Eine Sperre, die laenger haelt als eine Stunde, ist keine gegen " +
    "den doppelten Druck mehr");
});

/* ------------------------------------------ Es setzt nichts zurueck */

test("MR13 · Der Knopf schreibt genau EINEN Eintrag (§38)", async () => {
  /* Keine Tageszaehler, keine Abstandszeitpunkte, kein Portfolio. Was
     dieser Weg in den Speicher schreibt, ist vollstaendig
     aufzaehlbar - und das wird hier aufgezaehlt. */
  const env = envMitDispatch();
  const cookie = await anmelden(env);
  /* Ueber `list()` - die Attrappe bildet den echten Aufruf nach. Ein
     erster Anlauf las `.store`, ein Feld, das es weder in der Attrappe
     noch in Workers KV gibt: die Menge war beide Male leer, und der
     Test haette jede Zahl von Schreibvorgaengen durchgelassen. */
  const schluessel = async () => {
    const r = await env.VU_SOCIAL_KV.list({});
    return r.keys.map((k) => k.name);
  };
  const vorher = new Set(await schluessel());
  const f = fetchAufzeichnen(204);
  try { await druecke(env, cookie); } finally { f.zurueck(); }
  const neu = (await schluessel()).filter((k) => !vorher.has(k));
  assert.deepEqual(neu, [MANUAL_RUN_KEY]);
});

test("MR14 · Der Eintrag traegt kein Geheimnis", async () => {
  const env = envMitDispatch();
  const cookie = await anmelden(env);
  const f = fetchAufzeichnen(204);
  try { await druecke(env, cookie); } finally { f.zurueck(); }
  const roh = await env.VU_SOCIAL_KV.get(MANUAL_RUN_KEY);
  assert.doesNotMatch(roh, /ghp_|Bearer|authorization/i);
});

/* ------------------------------------------------- Der Knopf selbst */

test("MR15 · Der Knopf steht auch dort, wo nichts wartet", async () => {
  /* Gerade dort ist die Frage "und jetzt?" am naechsten. Ein Knopf,
     den es nur bei Arbeit gibt, ist bei Stille nicht da. */
  const { landingPage } = await import("../src/approval-ui.js");
  for (const z of [{ anzahl: null }, { anzahl: 0 }]) {
    const html = await landingPage(z).text();
    assert.match(html, /action="\/approval\/run"/);
    assert.match(html, /method="POST"/);
  }
});

test("MR16 · Die Seite sagt, dass nur die UHR uebersprungen wird", async () => {
  /* JETZT PRUEFEN heisst "starte jetzt", nicht "erzeuge zwingend".
     Steht das nicht da, liest der Owner den Knopf als Versprechen. */
  const { landingPage } = await import("../src/approval-ui.js");
  const html = await landingPage({ anzahl: 0 }).text();
  assert.match(html, /Uhr/);
  assert.match(html, /nicht die Pruefungen/);
});
