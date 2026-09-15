/* =========================================================================
   vision-universe-social — DER FLOW MIT DER ECHTEN KONFIGURATION

   Die Autorisierung des Owners soll nicht der erste Durchlauf dieses
   Pfades sein. Diese Tests fahren ihn vorher ab — mit genau der
   Rechtemenge, die in der Konfiguration "Vision Universe Social" steht:

     instagram_basic
     instagram_content_publish
     instagram_manage_insights
     pages_show_list

   Nicht dabei: instagram_manage_comments, pages_read_engagement.

   Das ist keine Wiederholung der bestehenden OAuth-Tests. Die laufen mit
   allen sechs Rechten (DEFAULT_GRANTED) und beweisen deshalb nichts ueber
   den Fall, der jetzt tatsaechlich eintritt: vier Rechte, Business-Dialog,
   `requested` unbekannt.

   -------------------------------------------------------------------------
   WAS HIER NICHT PASSIERT
   -------------------------------------------------------------------------

   Kein Meta-Kontakt. Der Graph-Doppelgaenger antwortet, wie die Graph API
   es dokumentiert. Gruen heisst: unser Ablauf stimmt. Ob Meta mitspielt,
   beweist nur der Lauf gegen Meta — und der ist die Owner-Handlung.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";

import worker from "../src/index.js";
import {
  createEnv, createGraph, completeConnect, request,
  PAGE_TOKEN, LONG_USER_TOKEN, TEST_APP_SECRET, TEST_ADMIN_KEY
} from "./harness.mjs";
import { CONNECTION_KEY } from "../src/store.js";

/* Die Rechte der Konfiguration des Owners, Stand 2026-09-15. */
const OWNER_GRANTED = [
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_insights",
  "pages_show_list"
];

const CONFIG_ID = "1555849235747979";

function ownerEnv(overrides = {}) {
  return createEnv(Object.assign({
    META_LOGIN_CONFIG_ID: CONFIG_ID,
    __graph: createGraph({ granted: OWNER_GRANTED })
  }, overrides));
}

test("O1 · Der Connect-Link ist der Business-Dialog mit dieser Konfiguration", async () => {
  const env = ownerEnv();
  const response = await worker.fetch(
    request("/social/meta/connect?key=" + encodeURIComponent(TEST_ADMIN_KEY)), env);
  assert.equal(response.status, 302);

  const target = new URL(response.headers.get("location"));
  assert.equal(target.searchParams.get("config_id"), CONFIG_ID);
  assert.equal(target.searchParams.get("override_default_response_type"), "true");
  assert.equal(target.searchParams.get("scope"), null);
  assert.equal(target.searchParams.get("response_type"), "code");
});

test("O2 · Der vollstaendige Flow kommt mit vier Rechten durch", async () => {
  /* Die eigentliche Frage: reichen die vier Rechte, oder bleibt der
     Callback an einer Grundrechte-Pruefung haengen? */
  const env = ownerEnv();
  const { callback } = await completeConnect(worker, env);
  assert.equal(callback.status, 200, await callback.clone().text().catch(() => ""));

  const record = JSON.parse(await env.VU_SOCIAL_KV.get(CONNECTION_KEY));
  assert.ok(record, "Es muss ein Datensatz entstanden sein");
  assert.equal(record.instagramUsername, "visionuniverse");
  assert.equal(record.pageAccessToken, PAGE_TOKEN);
});

test("O3 · Das User-Token wird nicht gespeichert", async () => {
  /* Die Zusicherung gilt unabhaengig vom Dialog. */
  const env = ownerEnv();
  await completeConnect(worker, env);
  const raw = await env.VU_SOCIAL_KV.get(CONNECTION_KEY);
  assert.ok(!raw.includes(LONG_USER_TOKEN), "Nur das Page-Token bleibt liegen");
  assert.ok(!raw.includes(TEST_APP_SECRET));
});

test("O4 · Veroeffentlichen und Insights gelten als nachgewiesen", async () => {
  const env = ownerEnv();
  await completeConnect(worker, env);
  const caps = JSON.parse(await env.VU_SOCIAL_KV.get(CONNECTION_KEY)).capabilities;

  assert.equal(caps.operational, true, "Die Grundrechte sind vollstaendig");
  assert.equal(caps.sets.publish.publishImage, "SUPPORTED");
  assert.equal(caps.sets.analytics.accountInsights, "SUPPORTED");
});

test("O5 · Nicht angefragte Rechte sind ungeprueft, nicht 'nicht verfuegbar'", async () => {
  /* Der Kern der Modus-Unterscheidung. Im Business-Dialog kann der Worker
     nicht wissen, welche Rechte die Konfiguration anfragt. Wuerde er
     REQUIRED_SCOPES als angefragt ausgeben, meldete der Bericht
     Faehigkeiten als GEPRUEFT nicht verfuegbar, die niemand je verlangt
     hat — und der Owner suchte einen Fehler, den es nicht gibt.

     `null` heisst ungeprueft. Das ist dieselbe Regel wie ueberall sonst
     im Projekt (MASTER §31.6). */
  const env = ownerEnv();
  await completeConnect(worker, env);
  const caps = JSON.parse(await env.VU_SOCIAL_KV.get(CONNECTION_KEY)).capabilities;

  assert.deepEqual(caps.requested, [], "Im Business-Dialog ist die Anfrage nicht bekannt");
  assert.deepEqual(caps.missing, [], "Also kann auch nichts als fehlend gelten");
  assert.deepEqual(caps.missingEssential, []);

  /* instagram_manage_comments wurde bewusst nicht gewaehlt. */
  assert.equal(caps.sets.audience.readComments, null,
    "Ungeprueft — nicht 'geprueft nicht verfuegbar'");
});

test("O6 · Im klassischen Dialog bleibt 'nicht erteilt' ein geprueftes UNAVAILABLE", async () => {
  /* Der Gegenbeweis zu O5: dort, wo wir die Rechte selbst angefragt
     haben, ist ein Ausbleiben eine Antwort und kein Nichtwissen. */
  const env = createEnv({
    META_LOGIN_CONFIG_ID: "",
    __graph: createGraph({ granted: OWNER_GRANTED })
  });
  await completeConnect(worker, env);
  const caps = JSON.parse(await env.VU_SOCIAL_KV.get(CONNECTION_KEY)).capabilities;

  assert.ok(caps.missing.includes("instagram_manage_comments"));
  assert.equal(caps.sets.audience.readComments, "UNAVAILABLE");
});

test("O7 · Ohne pages_show_list nennt die Meldung das Recht, nicht die Einrichtung", async () => {
  /* Der Fall, der vor dem Nachtragen des Rechts eingetreten waere. Er
     bleibt geprueft, weil eine Konfiguration sich wieder aendern kann. */
  const env = createEnv({
    META_LOGIN_CONFIG_ID: CONFIG_ID,
    __graph: createGraph({
      granted: ["instagram_basic", "instagram_content_publish", "instagram_manage_insights"],
      pages: []
    })
  });
  const { callback } = await completeConnect(worker, env);
  assert.notEqual(callback.status, 200);

  const html = await callback.text();
  assert.match(html, /pages_show_list/);
  assert.equal(await env.VU_SOCIAL_KV.get(CONNECTION_KEY), null,
    "Bei einem Abbruch darf nichts gespeichert werden");
});

test("O8 · Die Erfolgsseite zeigt kein Token", async () => {
  const env = ownerEnv();
  const { callback } = await completeConnect(worker, env);
  const html = await callback.text();
  assert.ok(!html.includes(PAGE_TOKEN));
  assert.ok(!html.includes(LONG_USER_TOKEN));
  assert.ok(!html.includes(TEST_APP_SECRET));
  assert.ok(!html.includes(TEST_ADMIN_KEY));
});
