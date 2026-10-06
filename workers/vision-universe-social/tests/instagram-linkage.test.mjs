/* =========================================================================
   vision-universe-social — DER REALFALL vom 2026-09-16

   Der Business-Login lief durch. Der Owner hat im Dialog ausdruecklich
   ausgewaehlt:

     Facebook-Seite:   Vision Universe
     Instagram-Konto:  visionuniverse.aktienreports

   Meta hat vier Rechte bestaetigt und die Verknuepfung ausdruecklich
   gemeldet. Unser Callback antwortete trotzdem `noInstagramAccount` und
   behauptete, keine Seite habe ein verbundenes Instagram-Konto.

   -------------------------------------------------------------------------
   WAS AN DIESER MELDUNG FALSCH WAR
   -------------------------------------------------------------------------

   Sie behauptete mehr, als der Abruf hergab. `noInstagramAccount` trat
   in ZWEI voellig verschiedenen Lagen auf:

     a) /me/accounts lieferte gar keine Seite
     b) /me/accounts lieferte Seiten, aber keine mit dem Feld
        `instagram_business_account`

   (a) loest man im Login-Dialog, (b) in der Instagram-Verknuepfung. Ein
   gemeinsamer Name schickt den Owner mit halber Wahrscheinlichkeit an
   die falsche Stelle — und der Abbruch verwarf die Antwort, sodass sich
   hinterher nicht mehr feststellen liess, welcher Fall vorlag.

   Diese Tests halten die Trennung fest und pruefen, dass der Befund den
   Abbruch ueberlebt.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";

import worker from "../src/index.js";
import { resolveAccounts, probePageLinkage, debugToken } from "../src/graph.js";
import { createEnv, createGraph, completeConnect, PAGE_TOKEN } from "./harness.mjs";
import { CONNECTION_KEY } from "../src/store.js";

/* Eine Antwort, wie /me/accounts sie liefert. */
function accountsDouble(rows) {
  return {
    apiVersion: "v21.0",
    appSecret: "s",
    fetchImpl: async () => new Response(JSON.stringify({ data: rows }), {
      status: 200, headers: { "content-type": "application/json" }
    })
  };
}

const GRANTED = ["instagram_basic", "instagram_content_publish",
  "instagram_manage_insights", "pages_show_list"];

test("L1 · Keine Seite sichtbar ist NICHT dasselbe wie kein Instagram-Konto", async () => {
  const result = await resolveAccounts(accountsDouble([]), "token", GRANTED);
  assert.equal(result.reason, "noPagesVisible");
  assert.doesNotMatch(result.message, /Professional-Konto/,
    "Ueber die Instagram-Einrichtung darf hier nichts behauptet werden — " +
    "es war nichts da, woran sie haette haengen koennen.");
});

test("L2 · Seite sichtbar ohne instagram_business_account meldet genau das", async () => {
  /* Der Fall, den der Owner gesehen hat — falls /me/accounts die Seite
     tatsaechlich geliefert hat. */
  const result = await resolveAccounts(
    accountsDouble([{ id: "page_vu", name: "Vision Universe", access_token: PAGE_TOKEN }]),
    "token", GRANTED);

  assert.equal(result.reason, "noInstagramAccount");
  assert.match(result.message, /nicht leer/i);
  assert.match(result.message, /instagram_business_account/,
    "Die Meldung nennt das Feld, an dem es lag — nicht eine Vermutung ueber Meta");
  assert.match(result.message, /anderes Feld/,
    "Und sie laesst offen, dass die Verbindung ueber ein anderes Feld laufen kann");
});

test("L3 · Der Bericht nennt die Seite, um die es geht", async () => {
  const result = await resolveAccounts(
    accountsDouble([{ id: "page_vu", name: "Vision Universe", access_token: PAGE_TOKEN }]),
    "token", GRANTED);

  assert.equal(result.pages.length, 1);
  assert.equal(result.pages[0].pageId, "page_vu");
  assert.equal(result.pages[0].pageName, "Vision Universe");
  assert.equal(result.pages[0].hasInstagramBusinessAccount, false);
});

test("L4 · Der Bericht traegt niemals ein Seiten-Token", async () => {
  /* Er landet auf einer Seite im Browser. Die Zeilen aus /me/accounts
     tragen je ein Page-Token — das darf nicht mitwandern. */
  const result = await resolveAccounts(
    accountsDouble([{ id: "page_vu", name: "Vision Universe", access_token: PAGE_TOKEN }]),
    "token", GRANTED);
  assert.ok(!JSON.stringify(result.pages).includes(PAGE_TOKEN));
});

test("L5 · Die Feldprobe befragt die API, statt das Feld zu raten", async () => {
  /* Jedes Feld einzeln: eines, das diese API-Version nicht kennt, wuerde
     in einer Sammelabfrage die ganze Antwort kippen. */
  const gefragt = [];
  const ctx = {
    apiVersion: "v21.0", appSecret: "s",
    fetchImpl: async (url) => {
      const felder = new URL(url).searchParams.get("fields");
      gefragt.push(felder);
      if (felder.startsWith("connected_instagram_account")) {
        return new Response(JSON.stringify({
          connected_instagram_account: { id: "17841400000000001", username: "visionuniverse.aktienreports" }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ id: "page_vu" }), {
        status: 200, headers: { "content-type": "application/json" }
      });
    }
  };

  const findings = await probePageLinkage(ctx, "page_vu", "token");
  assert.equal(gefragt.length, 3, "Drei Felder, drei Anfragen");

  const treffer = findings.find((f) => f.present);
  assert.ok(treffer, "Die Probe findet das Konto ueber das Feld, das gefuellt ist");
  assert.equal(treffer.field, "connected_instagram_account");
  assert.equal(treffer.instagramUsername, "visionuniverse.aktienreports");

  const leer = findings.find((f) => f.field === "instagram_business_account");
  assert.equal(leer.present, false, "Und sagt zugleich, welches Feld leer war");
});

test("L6 · Ein Feld, das die API nicht kennt, kippt die Probe nicht", async () => {
  const ctx = {
    apiVersion: "v21.0", appSecret: "s",
    fetchImpl: async (url) => {
      if (new URL(url).searchParams.get("fields").startsWith("page_backed")) {
        return new Response(JSON.stringify({
          error: { message: "Unknown field", code: 100 }
        }), { status: 400, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ id: "p" }), {
        status: 200, headers: { "content-type": "application/json" } });
    }
  };
  const findings = await probePageLinkage(ctx, "p", "token");
  assert.equal(findings.length, 3, "Alle drei werden berichtet");
  const kaputt = findings.find((f) => f.field === "page_backed_instagram_accounts");
  assert.equal(kaputt.readable, false, "Das eine wird als unlesbar vermerkt");
  assert.ok(findings.some((f) => f.readable), "Die anderen bleiben auswertbar");
});

test("L7 · granular_scopes nennen die tatsaechlich freigegebenen Assets", async () => {
  /* Nur hier steht, WELCHE Seite der Nutzer im Dialog ausgewaehlt hat.
     /me/permissions sagt nur, welche RECHTE erteilt wurden. */
  const ctx = {
    apiVersion: "v21.0", appSecret: "s",
    fetchImpl: async () => new Response(JSON.stringify({
      data: {
        scopes: GRANTED,
        granular_scopes: [
          { scope: "pages_show_list", target_ids: ["page_vu"] },
          { scope: "instagram_basic", target_ids: ["17841400000000001"] }
        ]
      }
    }), { status: 200, headers: { "content-type": "application/json" } })
  };

  const result = await debugToken(ctx, { appId: "1", appSecret: "s", inputToken: "t" });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.granular[0], { scope: "pages_show_list", targetIds: ["page_vu"] });
  assert.ok(!JSON.stringify(result.data).includes("\"t\""), "Kein Token im Ergebnis");
});

/* =========================================================================
   DIE ZIEL-ALLOWLIST

   Ein Autorisierungsdialog zeigt alles, worauf der angemeldete Mensch
   Rechte hat — auch private Konten. Ein Fehlgriff dort faellt erst auf,
   wenn ein Beitrag am falschen Ort steht; dann ist er veroeffentlicht.
   ========================================================================= */

const ZIEL = "visionuniverse.aktienreports";

function mitKonto(username, id = "17841400000000001") {
  return createGraph({
    granted: GRANTED,
    pages: [{
      id: "page_vu", name: "Vision Universe", access_token: PAGE_TOKEN,
      instagram_business_account: { id, username }
    }]
  });
}

test("A1 · Das erlaubte Konto wird gespeichert", async () => {
  const graph = mitKonto(ZIEL);
  const env = createEnv({
    META_IG_ALLOWED_USERNAMES: ZIEL, __graph: graph, __fetchImpl: graph.fetchImpl
  });
  const { callback } = await completeConnect(worker, env);
  assert.equal(callback.status, 200);
  const record = JSON.parse(await env.VU_SOCIAL_KV.get(CONNECTION_KEY));
  assert.equal(record.instagramUsername, ZIEL);
});

test("A2 · Ein fremdes Konto wird NICHT gespeichert", async () => {
  /* Der eigentliche Zweck: ein privates Konto, versehentlich im Dialog
     gewaehlt, darf nie Publishing-Ziel werden. */
  const graph = mitKonto("privat.dennis", "17841499999999999");
  const env = createEnv({
    META_IG_ALLOWED_USERNAMES: ZIEL, __graph: graph, __fetchImpl: graph.fetchImpl
  });
  const { callback } = await completeConnect(worker, env);

  assert.equal(callback.status, 400);
  const html = await callback.text();
  assert.match(html, /targetNotAllowed/);
  assert.match(html, /privat\.dennis/, "Der Bericht nennt, was statt dessen gefunden wurde");
  assert.equal(env.VU_SOCIAL_KV.__size(), 0, "Nichts gespeichert");
});

test("A3 · Gross- und Kleinschreibung und ein @ aendern nichts", async () => {
  const graph = mitKonto("VisionUniverse.Aktienreports");
  const env = createEnv({
    META_IG_ALLOWED_USERNAMES: "@" + ZIEL, __graph: graph, __fetchImpl: graph.fetchImpl
  });
  const { callback } = await completeConnect(worker, env);
  assert.equal(callback.status, 200);
});

test("A4 · Handle UND ID: stimmt eines nicht, wird nicht gespeichert", async () => {
  /* Kein Doppel-Gemoppel: passt der Handle, aber nicht die ID, ist
     irgendwo etwas vertauscht — das soll auffallen. */
  const graph = mitKonto(ZIEL, "17841400000000001");
  const env = createEnv({
    META_IG_ALLOWED_USERNAMES: ZIEL,
    META_IG_ACCOUNT_ID: "17841499999999999",
    __graph: graph, __fetchImpl: graph.fetchImpl
  });
  const { callback } = await completeConnect(worker, env);
  assert.equal(callback.status, 400);
  assert.match(await callback.text(), /targetNotAllowed/);
  assert.equal(env.VU_SOCIAL_KV.__size(), 0);
});

test("A5 · Aus mehreren Konten wird genau das erlaubte gewaehlt", async () => {
  const graph = createGraph({
    granted: GRANTED,
    pages: [
      { id: "p_privat", name: "Privat", access_token: PAGE_TOKEN,
        instagram_business_account: { id: "17841499999999999", username: "privat.dennis" } },
      { id: "page_vu", name: "Vision Universe", access_token: PAGE_TOKEN,
        instagram_business_account: { id: "17841400000000001", username: ZIEL } }
    ]
  });
  const env = createEnv({
    META_IG_ALLOWED_USERNAMES: ZIEL, __graph: graph, __fetchImpl: graph.fetchImpl
  });
  const { callback } = await completeConnect(worker, env);
  assert.equal(callback.status, 200);

  const record = JSON.parse(await env.VU_SOCIAL_KV.get(CONNECTION_KEY));
  assert.equal(record.instagramUsername, ZIEL,
    "Nicht das erste Konto der Liste, sondern das erlaubte");
  assert.equal(record.pageId, "page_vu");
});

test("A6 · Ohne Allowlist bleibt das Verhalten wie bisher", async () => {
  /* Die Sperre darf den klassischen Weg nicht heimlich veraendern. */
  const graph = mitKonto("irgendwer");
  const env = createEnv({ __graph: graph, __fetchImpl: graph.fetchImpl });
  const { callback } = await completeConnect(worker, env);
  assert.equal(callback.status, 200);
});
