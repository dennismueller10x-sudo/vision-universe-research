/* =========================================================================
   vision-universe-social — DER REAL BEOBACHTETE FALL vom 2026-09-16

   Zweiter realer OAuth-Lauf. Meta hat die bestehende Autorisierung
   wiederverwendet und direkt zum Callback zurueckgeleitet. Der Befund:

     reason: noPagesVisible
     pages:  []
     granular_scopes:
       pages_show_list           -> target_id der Vision-Universe-Seite
       instagram_basic           -> Instagram-target_id
       instagram_manage_insights -> dieselbe Instagram-target_id
       instagram_content_publish -> dieselbe Instagram-target_id

   Damit ist belegt: Seite und Konto SIND freigegeben, und `/me/accounts`
   ist trotzdem leer.

   -------------------------------------------------------------------------
   WARUM /me/accounts HIER LEER IST
   -------------------------------------------------------------------------

   Es zaehlt die Seiten auf, die der angemeldete Mensch ALS PERSON
   verwaltet. Beim Business Login mit gezielter Asset-Auswahl entsteht
   der Zugriff aber nicht ueber diese persoenliche Liste, sondern als
   Freigabe am Token. Beides sind gueltige Wege zu einer Seite — nur
   fuehrt der zweite nicht durch `/me/accounts`.

   -------------------------------------------------------------------------
   WARUM DIE ID TROTZDEM NICHT EINFACH UEBERNOMMEN WIRD
   -------------------------------------------------------------------------

   Eine `target_id` ist eine Zahl aus einer Antwort. Sie sagt, dass IRGEND
   etwas freigegeben wurde — nicht, dass es das richtige Konto ist, nicht
   einmal, dass es ein Instagram-Konto ist. Die Tests unten pruefen
   deshalb beide Richtungen: dass der Realfall durchkommt (G1-G4) UND
   dass jede Abweichung davon haengen bleibt (N1-N6).
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";

import worker from "../src/index.js";
import {
  assetsFromGranularScopes, validateInstagramAsset, resolveAccountsFromAssets
} from "../src/graph.js";
import { createEnv, createGraph, completeConnect, PAGE_TOKEN, LONG_USER_TOKEN } from "./harness.mjs";
import { CONNECTION_KEY } from "../src/store.js";

const ZIEL = "visionuniverse.aktienreports";
const IG_ID = "17841400000000001";
const PAGE_ID = "100000000000001";

/* Genau die Form, die der reale Lauf gemeldet hat. */
function realeScopes(igId = IG_ID, pageId = PAGE_ID) {
  return [
    { scope: "pages_show_list", targetIds: [pageId] },
    { scope: "instagram_basic", targetIds: [igId] },
    { scope: "instagram_manage_insights", targetIds: [igId] },
    { scope: "instagram_content_publish", targetIds: [igId] }
  ];
}

/* Ein Graph-Doppelgaenger fuer den Asset-Weg: /me/accounts leer,
   Einzelabrufe der Assets beantwortbar. */
function assetGraph(options = {}) {
  const igId = options.igId || IG_ID;
  const username = options.username || ZIEL;
  const pageToken = options.pageToken === undefined ? PAGE_TOKEN : options.pageToken;
  const gesehen = [];

  return {
    gesehen,
    ctx: {
      apiVersion: "v21.0",
      appSecret: "s",
      fetchImpl: async (url) => {
        const u = new URL(url);
        const pfad = u.pathname.replace("/v21.0/", "");
        gesehen.push(pfad);
        const json = (body, status = 200) => new Response(JSON.stringify(body), {
          status, headers: { "content-type": "application/json" }
        });

        if (pfad === igId) {
          if (options.igUnbekannt) return json({ error: { message: "Unsupported get request", code: 100 } }, 400);
          if (options.igOhneUsername) return json({ id: igId });
          if (options.igAndereId) return json({ id: "999", username });
          return json({ id: igId, username, name: "Vision Universe Aktienreports" });
        }
        if (pfad === PAGE_ID) {
          if (options.seiteUnlesbar) return json({ error: { message: "nope", code: 100 } }, 400);
          return json(Object.assign({ id: PAGE_ID, name: "Vision Universe" },
            pageToken ? { access_token: pageToken } : {}));
        }
        return json({ data: [] });
      }
    }
  };
}

/* ------------------------------------------------------------------ */
/* G — DER REALFALL                                                    */
/* ------------------------------------------------------------------ */

test("G1 · Die drei Instagram-Rechte nennen dasselbe Konto", () => {
  const result = assetsFromGranularScopes(realeScopes());
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.instagramAccountIds, [IG_ID]);
  assert.deepEqual(result.data.pageIds, [PAGE_ID]);
});

test("G2 · Die Instagram-ID wird bei der API gegengeprueft", async () => {
  /* Ohne diesen Schritt waere die Allowlist wertlos: sie prueft einen
     Handle, und der Handle kaeme sonst aus derselben Antwort, die man
     gerade pruefen will. */
  const g = assetGraph();
  const result = await validateInstagramAsset(g.ctx, IG_ID, "token");
  assert.equal(result.ok, true);
  assert.equal(result.data.instagramUsername, ZIEL);
  assert.ok(g.gesehen.includes(IG_ID), "Die ID wurde tatsaechlich abgefragt");
});

test("G3 · Seite und Konto werden getrennt aufgeloest", async () => {
  /* Die Seite liefert das Token, NICHT die Instagram-ID. Das ist der
     Unterschied zum alten Weg, wo die Seite die einzige Quelle war. */
  const g = assetGraph();
  const result = await resolveAccountsFromAssets(g.ctx, "token", realeScopes());

  assert.equal(result.ok, true);
  assert.equal(result.data.source, "granularScopes");
  assert.equal(result.data.accounts.length, 1);
  assert.equal(result.data.accounts[0].instagramAccountId, IG_ID);
  assert.equal(result.data.accounts[0].instagramUsername, ZIEL);
  assert.equal(result.data.accounts[0].pageId, PAGE_ID);
  assert.equal(result.data.accounts[0].pageAccessToken, PAGE_TOKEN);
});

test("G4 · Ganzer Callback: pages=[] und trotzdem eine Verbindung", async () => {
  /* Der Realfall von Anfang bis Ende. */
  const g = createGraph({
    granted: ["instagram_basic", "instagram_content_publish",
      "instagram_manage_insights", "pages_show_list"],
    pages: [],
    granularScopes: realeScopes(),
    assets: { [IG_ID]: { id: IG_ID, username: ZIEL, name: "VU" },
      [PAGE_ID]: { id: PAGE_ID, name: "Vision Universe", access_token: PAGE_TOKEN } }
  });
  const env = createEnv({
    META_IG_ALLOWED_USERNAMES: ZIEL, __graph: g, __fetchImpl: g.fetchImpl
  });

  const { callback } = await completeConnect(worker, env);
  assert.equal(callback.status, 200, await callback.clone().text());

  const record = JSON.parse(await env.VU_SOCIAL_KV.get(CONNECTION_KEY));
  assert.equal(record.instagramAccountId, IG_ID);
  assert.equal(record.instagramUsername, ZIEL);
  assert.equal(record.pageId, PAGE_ID);
  assert.equal(record.resolvedVia, "granularScopes",
    "Der Datensatz haelt fest, ueber welchen Weg er entstanden ist");
});

test("G5 · Ohne Seiten-Token wird das Nutzer-Token genommen und der Ablauf vermerkt", async () => {
  /* Ueber den Asset-Weg kommt nicht zwingend ein Seiten-Token mit. Ein
     harter Abbruch waere hier zu streng: das langlebige Nutzer-Token
     traegt instagram_content_publish fuer genau dieses Konto. */
  const g = createGraph({
    granted: ["instagram_basic", "instagram_content_publish",
      "instagram_manage_insights", "pages_show_list"],
    pages: [],
    granularScopes: realeScopes(),
    assets: { [IG_ID]: { id: IG_ID, username: ZIEL },
      [PAGE_ID]: { id: PAGE_ID, name: "Vision Universe" } }
  });
  const env = createEnv({
    META_IG_ALLOWED_USERNAMES: ZIEL, __graph: g, __fetchImpl: g.fetchImpl
  });

  const { callback } = await completeConnect(worker, env);
  assert.equal(callback.status, 200, await callback.clone().text());

  const record = JSON.parse(await env.VU_SOCIAL_KV.get(CONNECTION_KEY));
  assert.equal(record.tokenType, "user");
  assert.equal(record.pageAccessToken, LONG_USER_TOKEN);
  assert.ok(record.tokenExpiresAt, "Ein Nutzer-Token laeuft ab — das muss dabeistehen");
});

/* ------------------------------------------------------------------ */
/* N — WAS HAENGEN BLEIBEN MUSS                                        */
/* ------------------------------------------------------------------ */

test("N1 · Verschiedene Instagram-IDs in den Rechten: nichts speichern", () => {
  const scopes = [
    { scope: "pages_show_list", targetIds: [PAGE_ID] },
    { scope: "instagram_basic", targetIds: [IG_ID] },
    { scope: "instagram_manage_insights", targetIds: [IG_ID] },
    { scope: "instagram_content_publish", targetIds: ["17841499999999999"] }
  ];
  const result = assetsFromGranularScopes(scopes);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "assetScopesInconsistent");
  assert.match(result.message, /raten/,
    "Die Meldung sagt, warum nicht gewaehlt wird: es waere geraten");
});

test("N2 · Ein fehlendes Instagram-Recht: nichts speichern", () => {
  const scopes = [
    { scope: "pages_show_list", targetIds: [PAGE_ID] },
    { scope: "instagram_basic", targetIds: [IG_ID] },
    { scope: "instagram_manage_insights", targetIds: [IG_ID] }
  ];
  const result = assetsFromGranularScopes(scopes);
  assert.equal(result.reason, "assetScopesIncomplete");
  assert.deepEqual(result.missingAssetScopes, ["instagram_content_publish"]);
});

test("N3 · Ein Recht ohne target_ids zaehlt als fehlend", () => {
  const scopes = realeScopes().map((s) =>
    s.scope === "instagram_basic" ? { scope: s.scope, targetIds: [] } : s);
  assert.equal(assetsFromGranularScopes(scopes).reason, "assetScopesIncomplete");
});

test("N4 · Eine ID, die die API nicht kennt: nichts speichern", async () => {
  const g = assetGraph({ igUnbekannt: true });
  const result = await resolveAccountsFromAssets(g.ctx, "token", realeScopes());
  assert.equal(result.ok, false);
  assert.equal(result.reason, "assetValidationFailed");
  assert.match(result.message, new RegExp(IG_ID), "Die Meldung nennt die ID, um die es geht");
});

test("N5 · Eine ID ohne Instagram-Handle ist kein Instagram-Konto", async () => {
  const g = assetGraph({ igOhneUsername: true });
  const result = await validateInstagramAsset(g.ctx, IG_ID, "token");
  assert.equal(result.reason, "assetNotInstagram");
});

test("N6 · Antwortet die API mit einer anderen ID, bleibt es haengen", async () => {
  /* Klingt paranoid, ist aber die einzige Stelle, an der eine
     verwechselte ID noch auffallen kann. */
  const g = assetGraph({ igAndereId: true });
  const result = await validateInstagramAsset(g.ctx, IG_ID, "token");
  assert.equal(result.reason, "assetIdentityMismatch");
});

test("N7 · Falscher Username: Allowlist greift auch auf dem Asset-Weg", async () => {
  const g = createGraph({
    granted: ["instagram_basic", "instagram_content_publish",
      "instagram_manage_insights", "pages_show_list"],
    pages: [],
    granularScopes: realeScopes(),
    assets: { [IG_ID]: { id: IG_ID, username: "privat.dennis" },
      [PAGE_ID]: { id: PAGE_ID, name: "Privat", access_token: PAGE_TOKEN } }
  });
  const env = createEnv({
    META_IG_ALLOWED_USERNAMES: ZIEL, __graph: g, __fetchImpl: g.fetchImpl
  });

  const { callback } = await completeConnect(worker, env);
  assert.equal(callback.status, 400);
  assert.match(await callback.text(), /targetNotAllowed/);
  assert.equal(env.VU_SOCIAL_KV.__size(), 0, "Nichts gespeichert");
});

test("N8 · Zusaetzliche nicht erlaubte Instagram-Assets werden ausgesiebt", async () => {
  /* Mehrere freigegebene Konten: die Allowlist entscheidet, nicht die
     Reihenfolge der Antwort. */
  const fremd = "17841499999999999";
  const scopes = [
    { scope: "pages_show_list", targetIds: [PAGE_ID] },
    { scope: "instagram_basic", targetIds: [fremd, IG_ID] },
    { scope: "instagram_manage_insights", targetIds: [IG_ID, fremd] },
    { scope: "instagram_content_publish", targetIds: [fremd, IG_ID] }
  ];
  const g = createGraph({
    granted: ["instagram_basic", "instagram_content_publish",
      "instagram_manage_insights", "pages_show_list"],
    pages: [],
    granularScopes: scopes,
    assets: {
      [IG_ID]: { id: IG_ID, username: ZIEL },
      [fremd]: { id: fremd, username: "privat.dennis" },
      [PAGE_ID]: { id: PAGE_ID, name: "Vision Universe", access_token: PAGE_TOKEN }
    }
  });
  const env = createEnv({
    META_IG_ALLOWED_USERNAMES: ZIEL, __graph: g, __fetchImpl: g.fetchImpl
  });

  const { callback } = await completeConnect(worker, env);
  assert.equal(callback.status, 200, await callback.clone().text());

  const record = JSON.parse(await env.VU_SOCIAL_KV.get(CONNECTION_KEY));
  assert.equal(record.instagramUsername, ZIEL, "Das erlaubte Konto, nicht das erste");
  assert.equal(record.instagramAccountId, IG_ID);
});

test("N9 · Die Reihenfolge der target_ids aendert das Urteil nicht", () => {
  /* N8 nutzt absichtlich verschiedene Reihenfolgen in den drei Rechten.
     Ein Vergleich, der darauf hereinfaellt, meldete falschen Alarm. */
  const a = ["17841499999999999", IG_ID];
  const b = [IG_ID, "17841499999999999"];
  const result = assetsFromGranularScopes([
    { scope: "pages_show_list", targetIds: [PAGE_ID] },
    { scope: "instagram_basic", targetIds: a },
    { scope: "instagram_manage_insights", targetIds: b },
    { scope: "instagram_content_publish", targetIds: a }
  ]);
  assert.equal(result.ok, true);
});

test("N10 · Leere granulare Scopes: nichts speichern", () => {
  assert.equal(assetsFromGranularScopes([]).reason, "assetScopesIncomplete");
  assert.equal(assetsFromGranularScopes(null).reason, "assetScopesIncomplete");
});
