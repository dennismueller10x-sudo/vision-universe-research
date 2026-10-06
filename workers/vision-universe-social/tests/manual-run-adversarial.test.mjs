/* =========================================================================
   vision-universe-social — DIE ANGRIFFE AUF "JETZT PRUEFEN" (AY1–AY9)

   §43/§44.

   -------------------------------------------------------------------------
   WARUM DIESER KNOPF EINE EIGENE ANGRIFFSLISTE BRAUCHT
   -------------------------------------------------------------------------

   MR1–MR16 fragen: tut der Knopf, was er soll? Diese Datei fragt das
   Gegenteil, und sie fragt es an einer Stelle, die neu ist: bis zu
   diesem Auftrag konnte ein Lauf NUR vom Zeitplan ausgehen. Jetzt gibt
   es einen zweiten Ausloeser, und er haengt im offenen Netz.

   Ein Lauf kostet etwas. Er verbraucht ChatGPT-Work-Budget, er kann
   einen Creative Job oeffnen, er schreibt in die Warteschlange. Wer
   den Knopf oft genug drueckt, verbraucht fremdes Geld - ohne je
   etwas zu veroeffentlichen. Das ist der eigentliche Angriff hier,
   und er ist leiser als ein ungewollter Beitrag.

   ZWEI FAELLE SIND KEINE HYPOTHESEN. Der Zeitpunkt aus der Zukunft
   stammt aus einer Gegenprobe an dieser Datei: die Sperre gegen den
   doppelten Druck verschwand dabei ersatzlos. Und dass ein Dispatch
   Eingaben tragen koennte, ist die Bauart von workflow_dispatch - man
   muss sich entscheiden, keine zu senden.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";

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

function envMitDispatch(overrides = {}) {
  return createEnv(Object.assign({
    VU_GITHUB_DISPATCH_TOKEN: TOKEN,
    VU_GITHUB_REPO: "beispiel/repo",
    VU_GITHUB_REF: "main"
  }, overrides));
}

function fetchAufzeichnen(status = 204) {
  const rufe = [];
  const echt = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    rufe.push({ url: String(url), init: init || {} });
    return new Response(null, { status });
  };
  return { rufe, zurueck: () => { globalThis.fetch = echt; } };
}

async function druecke(env, cookie, init = {}) {
  return await worker.fetch(request("/approval/run", Object.assign({
    method: "POST", headers: cookie ? { cookie } : {}
  }, init)), env);
}

/* =========================================================================
   ANGRIFF 1: DAS BUDGET LEERDRUECKEN
   ========================================================================= */

test("AY1 · Angriff: zwanzig Mal hintereinander druecken", async () => {
  const env = envMitDispatch();
  const cookie = await anmelden(env);
  const netz = fetchAufzeichnen();
  try {
    for (let i = 0; i < 20; i += 1) await druecke(env, cookie);
  } finally { netz.zurueck(); }

  /* ANTWORT: genau EIN Dispatch. Nicht zwanzig, nicht zwei. Jeder
     weitere Lauf haette Work-Budget verbraucht. */
  assert.equal(netz.rufe.length, 1,
    "Zwanzig Druecke haben " + netz.rufe.length + " Laeufe angestossen");
});

test("AY2 · Angriff: mit vielen Sitzungen gleichzeitig druecken", async () => {
  /* Die Sperre darf nicht an der Sitzung haengen - sonst umgeht man sie,
     indem man sich mehrfach anmeldet. Sie haengt am Lauf, und davon gibt
     es genau einen. */
  const env = envMitDispatch();
  const cookies = [await anmelden(env), await anmelden(env), await anmelden(env)];
  assert.ok(cookies.every(Boolean), "Drei Sitzungen liessen sich nicht anlegen");

  const netz = fetchAufzeichnen();
  try {
    for (const c of cookies) await druecke(env, c);
  } finally { netz.zurueck(); }

  assert.equal(netz.rufe.length, 1,
    "Drei Sitzungen haben " + netz.rufe.length + " Laeufe angestossen");
});

/* =========================================================================
   ANGRIFF 2: DIE SPERRE AUSHEBELN
   ========================================================================= */

test("AY3 · Angriff: den Zeitpunkt des letzten Laufs in die Zukunft setzen", async () => {
  /* DIESER FALL IST GEMESSEN, NICHT AUSGEDACHT.

     Die erste Fassung prueffte `her >= 0`. Ein Zeitpunkt aus der
     Zukunft machte `her` negativ - und die Sperre fiel ersatzlos weg.
     Eine zurueckgestellte Uhr haette gereicht. */
  const env = envMitDispatch();
  const cookie = await anmelden(env);
  await env.VU_SOCIAL_KV.put(MANUAL_RUN_KEY, JSON.stringify({
    requestedAt: "2099-01-01T00:00:00.000Z", ok: true, status: 204
  }));

  const netz = fetchAufzeichnen();
  let antwort;
  try { antwort = await druecke(env, cookie); } finally { netz.zurueck(); }

  assert.equal(netz.rufe.length, 0,
    "Ein Zeitpunkt aus der Zukunft hat die Sperre aufgehoben");
  assert.match(await antwort.text(), /schon angestossen/i);
});

test("AY4 · Angriff: den Zeitpunkt unlesbar machen", async () => {
  const env = envMitDispatch();
  const cookie = await anmelden(env);
  await env.VU_SOCIAL_KV.put(MANUAL_RUN_KEY, JSON.stringify({
    requestedAt: "irgendwann", ok: true, status: 204
  }));

  const netz = fetchAufzeichnen();
  try { await druecke(env, cookie); } finally { netz.zurueck(); }
  assert.equal(netz.rufe.length, 0, "Ein unlesbares Datum hat die Sperre aufgehoben");
});

test("AY5 · Und der Knopf bleibt trotzdem nicht fuer immer tot", async () => {
  /* Fail closed darf nicht heissen: fuer immer zu. Ein kaputter
     Eintrag wird mit der eigenen Uhr neu gesetzt, damit sich die Lage
     nach der Sperrfrist von selbst aufloest. */
  const env = envMitDispatch();
  const cookie = await anmelden(env);
  await env.VU_SOCIAL_KV.put(MANUAL_RUN_KEY, JSON.stringify({
    requestedAt: "2099-01-01T00:00:00.000Z", ok: true, status: 204
  }));

  const netz = fetchAufzeichnen();
  try {
    await druecke(env, cookie);
    const danach = JSON.parse(await env.VU_SOCIAL_KV.get(MANUAL_RUN_KEY));
    const alter = (Date.now() - Date.parse(danach.requestedAt)) / 1000;
    assert.ok(Number.isFinite(alter) && alter >= 0 && alter < 60,
      "Der Zeitpunkt wurde nicht mit der eigenen Uhr neu gesetzt: " + danach.requestedAt);

    /* Und nach der Sperrfrist geht es wieder - gemessen, nicht behauptet. */
    await env.VU_SOCIAL_KV.put(MANUAL_RUN_KEY, JSON.stringify({
      requestedAt: new Date(Date.now() - (MANUAL_RUN_SPERRE_SEKUNDEN + 5) * 1000).toISOString(),
      ok: true, status: 204
    }));
    await druecke(env, cookie);
    assert.equal(netz.rufe.length, 1, "Nach der Sperrfrist liess sich nichts anstossen");
  } finally { netz.zurueck(); }
});

/* =========================================================================
   ANGRIFF 3: DEN LAUF STEUERN
   ========================================================================= */

test("AY6 · Angriff: dem Lauf ueber den Rumpf Eingaben mitgeben", async () => {
  /* workflow_dispatch kann `inputs` tragen. Wer sie vom Aufrufer
     uebernimmt, hat einen Knopf gebaut, der nicht EINEN Lauf anstoesst,
     sondern einen beliebigen. */
  const env = envMitDispatch();
  const cookie = await anmelden(env);
  const netz = fetchAufzeichnen();
  try {
    await druecke(env, cookie, {
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        ref: "angreifer-zweig",
        inputs: { VU_SOCIAL_AUTOPUBLISH: "on", publish: "true" },
        workflow: "deploy.yml"
      })
    });
  } finally { netz.zurueck(); }

  assert.equal(netz.rufe.length, 1);
  const rumpf = JSON.parse(netz.rufe[0].init.body);

  /* -----------------------------------------------------------------
     SEIT §29/§30 TRAEGT DER DISPATCH EINGABEN - ABER EIGENE

     Vorher galt hier "nur `ref` und sonst nichts". Das war die
     einfachste Form der richtigen Regel, solange es nur einen Knopf
     gab.

     Jetzt gibt es drei, und der Modus muss mitreisen. Die Regel ist
     deshalb nicht schwaecher geworden, sondern genauer: der Worker
     BAUT die Eingaben aus einem gepruefen Modus, er reicht keine
     durch. Was der Aufrufer schickt, kommt nicht an.
     ----------------------------------------------------------------- */
  assert.deepEqual(Object.keys(rumpf).sort(), ["inputs", "ref"],
    "Der Dispatch traegt etwas anderes als Zweig und Eingaben: " +
    JSON.stringify(rumpf));
  /* Seit dem "Jetzt pruefen"-Fix (Owner-Feststellung 24.09.: der Knopf
     versprach denselben vollen Lauf wie der Zeitplan, loeste aber
     `nur_entscheiden=true` aus und ueberspraeng damit die Arbeit statt
     nur der Uhr) reist `nur_entscheiden` gar nicht mehr mit - alle drei
     Knoepfe bekommen denselben vollen Lauf, ueber den in der
     Workflow-Datei erklaerten Vorgabewert (`default: false`). */
  assert.deepEqual(Object.keys(rumpf.inputs).sort(),
    ["modus", "thema"],
    "Die Eingaben sind nicht der geschlossene Satz: " +
    JSON.stringify(rumpf.inputs));
  assert.ok(["JETZT_PRUEFEN", "MANUAL_NOW", "MANUAL_TOPIC"]
    .includes(rumpf.inputs.modus));
  /* Ein JSON-Rumpf ist kein Formular: die Eingaben des Angreifers
     erreichen den Worker gar nicht erst, und es bleibt beim
     harmlosesten der drei Modi. */
  assert.equal(rumpf.inputs.modus, "JETZT_PRUEFEN",
    "Eine fehlende Angabe ist zur weiterreichenden Handlung geworden");
  assert.equal(rumpf.inputs.thema, "");
  assert.equal(rumpf.ref, "main", "Der Zweig kam vom Aufrufer statt aus der Konfiguration");
  assert.ok(!netz.rufe[0].url.includes("deploy.yml"),
    "Der Aufrufer konnte den Workflow waehlen");
  assert.ok(!JSON.stringify(netz.rufe[0]).includes("AUTOPUBLISH"),
    "Eine Autopublish-Eingabe ist bis in den Dispatch durchgereicht worden");
});

test("AY7 · Angriff: ueber den Zweig auf fremden Code zeigen", async () => {
  /* Der Zweig kommt aus der Worker-Konfiguration. Waere er vom Aufrufer
     waehlbar, koennte ein beliebiger Zweig des Repositories mit den
     Produktionsgeheimnissen laufen. */
  const env = envMitDispatch({ VU_GITHUB_REF: "main" });
  const cookie = await anmelden(env);
  const netz = fetchAufzeichnen();
  try {
    await worker.fetch(request("/approval/run?ref=angreifer-zweig", {
      method: "POST", headers: { cookie }
    }), env);
  } finally { netz.zurueck(); }
  assert.equal(JSON.parse(netz.rufe[0].init.body).ref, "main");
});

/* =========================================================================
   ANGRIFF 4: DAS GEHEIMNIS HERAUSLOCKEN
   ========================================================================= */

test("AY8 · Angriff: den Fehler von GitHub als Spiegel benutzen", async () => {
  /* Wer eine fremde Fehlermeldung durchreicht, reicht mit ihr Adressen,
     Header und manchmal das Token durch. Hier wird der Fehler zu einem
     Satz, und der Satz nennt nichts. */
  const env = envMitDispatch();
  const cookie = await anmelden(env);
  const echt = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("connect ECONNREFUSED api.github.com — authorization: Bearer " + TOKEN);
  };
  let text;
  try {
    text = await (await druecke(env, cookie)).text();
  } finally { globalThis.fetch = echt; }

  assert.ok(!text.includes(TOKEN), "Das Token steht in der Antwort");
  assert.ok(!/ECONNREFUSED|Bearer/.test(text),
    "Die fremde Fehlermeldung ist durchgereicht worden");
  assert.match(text, /liess sich nicht anstossen/i);
});

test("AY9 · Angriff: den fehlgeschlagenen Anstoss als Sperre missbrauchen", async () => {
  /* Umgekehrter Fall zu AY1: ein FEHLGESCHLAGENER Versuch darf den
     naechsten echten Versuch nicht blockieren - sonst legt ein einziger
     Netzfehler den Knopf fuer fuenf Minuten lahm. */
  const env = envMitDispatch();
  const cookie = await anmelden(env);
  const kaputt = fetchAufzeichnen(500);
  try { await druecke(env, cookie); } finally { kaputt.zurueck(); }

  const gut = fetchAufzeichnen(204);
  try { await druecke(env, cookie); } finally { gut.zurueck(); }
  assert.equal(gut.rufe.length, 1,
    "Nach einem fehlgeschlagenen Anstoss liess sich nichts mehr anstossen");
});
