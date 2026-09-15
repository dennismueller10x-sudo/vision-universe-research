/* =========================================================================
   vision-universe-social — FACEBOOK LOGIN FOR BUSINESS

   Meta hat zwei Anmeldungen, die dieselbe Adresse benutzen:

     Facebook Login (klassisch)   — die Rechte stehen in `scope`
     Facebook Login for Business  — die Rechte stehen in einer
                                    Konfiguration, die Adresse nennt nur
                                    deren `config_id`

   Der Worker hat zuerst nur die klassische gebaut. Der Owner hat bei Meta
   aber eine Business-Konfiguration angelegt ("Vision Universe Social",
   Login-Option General, Nutzer-Zugriffstoken). Ein klassischer Link gegen
   eine Business-Konfiguration ist nicht "fast richtig" — es ist der
   falsche Dialog.

   -------------------------------------------------------------------------
   WARUM `scope` DABEI VERSCHWINDEN MUSS
   -------------------------------------------------------------------------

   `config_id` ersetzt `scope`. Wer beides schickt, beschreibt zwei
   verschiedene Rechtemengen in einer Anfrage. Deshalb pruefen die Tests
   nicht nur, dass `config_id` da ist, sondern auch, dass `scope` WEG ist
   (B3) — die Abwesenheit ist hier die eigentliche Zusicherung.

   -------------------------------------------------------------------------
   WARUM `override_default_response_type`
   -------------------------------------------------------------------------

   Die Konfiguration bringt eine eigene Vorgabe fuer den Antworttyp mit.
   Steht sie auf `token`, kaeme das Token im URL-Fragment zurueck — dort,
   wo ein Server es nie zu sehen bekommt. Der Callback saehe eine Anfrage
   ohne `code` und koennte nur melden, dass Parameter fehlen: ein Fehler,
   der wie ein Verkabelungsfehler aussieht und keiner ist.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";

import { authorizationUrl, loginMode, REQUIRED_SCOPES } from "../src/graph.js";

const CTX = { apiVersion: "v21.0" };
const BASE = {
  appId: "1234567890",
  redirectUri: "https://example.workers.dev/social/meta/callback",
  state: "signierter-state"
};

const params = (url) => new URL(url).searchParams;

test("B1 · Ohne Konfigurations-ID bleibt es beim klassischen Dialog", () => {
  const p = params(authorizationUrl(CTX, Object.assign({}, BASE, { scopes: REQUIRED_SCOPES })));
  assert.equal(p.get("scope"), REQUIRED_SCOPES.join(","));
  assert.equal(p.get("config_id"), null);
  assert.equal(p.get("override_default_response_type"), null);
  assert.equal(p.get("response_type"), "code");
});

test("B2 · Mit Konfigurations-ID wird der Business-Dialog gebaut", () => {
  const p = params(authorizationUrl(CTX, Object.assign({}, BASE, { configId: "987654321012345" })));
  assert.equal(p.get("config_id"), "987654321012345");
  assert.equal(p.get("override_default_response_type"), "true");
  assert.equal(p.get("response_type"), "code");
});

test("B3 · Im Business-Dialog wird KEIN scope mitgeschickt", () => {
  /* Der eigentliche Punkt. `config_id` ersetzt `scope` — beides zusammen
     beschreibt zwei Rechtemengen in einer Anfrage. */
  const p = params(authorizationUrl(CTX, Object.assign({}, BASE, {
    configId: "987654321012345",
    scopes: REQUIRED_SCOPES          /* ausdruecklich uebergeben ... */
  })));
  assert.equal(p.get("scope"), null, "... und trotzdem nicht in der Adresse");
  assert.equal(p.get("config_id"), "987654321012345");
});

test("B4 · Eine leere oder nur aus Leerzeichen bestehende ID zaehlt nicht als gesetzt", () => {
  /* Eine nicht ausgefuellte Variable in wrangler.toml ist der
     wahrscheinlichste Fall. Sie darf nicht zu `config_id=` fuehren —
     Meta bekaeme dann eine leere Konfiguration genannt und lehnte ab,
     waehrend die Ursache wie ein Meta-Problem aussieht. */
  for (const leer of ["", "   ", null, undefined]) {
    const p = params(authorizationUrl(CTX, Object.assign({}, BASE, { configId: leer })));
    assert.equal(p.get("config_id"), null, `configId=${JSON.stringify(leer)}`);
    assert.ok(p.get("scope"), "stattdessen gilt der klassische Weg");
  }
});

test("B5 · Die ID wird von Leerzeichen befreit", () => {
  /* Ein aus dem Meta-Dashboard kopierter Wert traegt gern ein
     Leerzeichen mit. In einer URL wird daraus %20 — und die
     Konfiguration ist nicht mehr auffindbar. */
  const p = params(authorizationUrl(CTX, Object.assign({}, BASE, { configId: "  987654321012345\n" })));
  assert.equal(p.get("config_id"), "987654321012345");
});

test("B6 · Redirect-URI und state bleiben in beiden Dialogen unveraendert", () => {
  /* Der Business-Dialog aendert die Rechte, nicht die Absicherung. */
  for (const configId of [undefined, "987654321012345"]) {
    const p = params(authorizationUrl(CTX, Object.assign({}, BASE, { configId })));
    assert.equal(p.get("redirect_uri"), BASE.redirectUri);
    assert.equal(p.get("state"), BASE.state);
    assert.equal(p.get("client_id"), BASE.appId);
  }
});

test("B7 · Der Dialog laesst sich benennen, ohne ihn zu oeffnen", () => {
  assert.equal(loginMode("987654321012345"), "business");
  assert.equal(loginMode(""), "classic");
  assert.equal(loginMode("   "), "classic");
  assert.equal(loginMode(undefined), "classic");
  assert.equal(loginMode(null), "classic");
});

test("B8 · Die Adresse ist der Meta-Dialog, nicht die Graph-API", () => {
  /* Zwei verschiedene Hosts, die leicht zu verwechseln sind:
     www.facebook.com fuehrt den Dialog, graph.facebook.com tauscht
     danach den Code. */
  const url = new URL(authorizationUrl(CTX, Object.assign({}, BASE, { configId: "987654321012345" })));
  assert.equal(url.hostname, "www.facebook.com");
  assert.equal(url.pathname, "/v21.0/dialog/oauth");
});

test("B9 · Die Konfigurations-ID steht nirgends als Geheimnis behandelt", () => {
  /* Sie ist eine Kennung: sie steht im Link, den der Nutzer ohnehin
     sieht. Ohne App-Secret ist mit ihr nichts anzufangen. Dieser Test
     haelt die Entscheidung fest, damit sie nicht spaeter versehentlich
     in die Secret-Liste wandert und dort Arbeit macht. */
  const url = authorizationUrl(CTX, Object.assign({}, BASE, { configId: "987654321012345" }));
  assert.ok(url.includes("987654321012345"),
    "Die ID steht sichtbar im Dialog-Link — das ist ihr Zweck.");
});

/* =========================================================================
   ZWEI LAGEN, DIE VON AUSSEN GLEICH AUSSEHEN

   /me/accounts ohne `pages_show_list` antwortet mit 200 und einer LEEREN
   Liste. Kein Fehler, kein Hinweis. Genau dasselbe antwortet ein Zugang,
   dessen Seiten kein Instagram-Konto haben.

   Ohne Unterscheidung schickt die Meldung den Owner in die
   Business-Suite, um eine Verbindung zu reparieren, die in Ordnung ist.

   Das ist kein erfundener Fall: die Login-Konfiguration des Owners traegt
   instagram_basic, instagram_content_publish und
   instagram_manage_insights — pages_show_list ist nicht dabei.
   ========================================================================= */

import { resolveAccounts } from "../src/graph.js";

function graphDouble(payload) {
  return async () => new Response(JSON.stringify(payload), {
    status: 200, headers: { "content-type": "application/json" }
  });
}

const GCTX = (payload) => ({ apiVersion: "v21.0", appSecret: "s", fetchImpl: graphDouble(payload) });

test("B10 · Leere Liste OHNE pages_show_list heisst: nicht gefragt, nicht gesehen", async () => {
  const result = await resolveAccounts(GCTX({ data: [] }), "token",
    ["instagram_basic", "instagram_content_publish", "instagram_manage_insights"]);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "missingPagePermission");
  assert.match(result.message, /pages_show_list/);
  assert.match(result.message, /nicht geprueft|nichts gesagt/,
    "Ueber die Instagram-Einrichtung darf nichts behauptet werden");
});

test("B11 · Leere Liste MIT pages_show_list heisst: wirklich kein Konto", async () => {
  const result = await resolveAccounts(GCTX({ data: [] }), "token",
    ["instagram_basic", "pages_show_list"]);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "noInstagramAccount");
});

test("B12 · Seiten ohne Instagram bleiben noInstagramAccount, nicht Rechtefrage", async () => {
  /* Hier ist die Liste NICHT leer — das Recht war also da. Die Ursache
     liegt dann wirklich in der Einrichtung. */
  const result = await resolveAccounts(GCTX({ data: [{ id: "1", name: "Seite" }] }), "token",
    ["instagram_basic"]);
  assert.equal(result.reason, "noInstagramAccount");
});

test("B13 · Ohne Angabe der erteilten Rechte wird nichts behauptet", async () => {
  /* Wer die Rechte nicht mitgibt, bekommt die alte, vorsichtigere
     Meldung — keine erfundene Diagnose. */
  const result = await resolveAccounts(GCTX({ data: [] }), "token", undefined);
  assert.equal(result.reason, "noInstagramAccount");
});

test("B14 · Ein verbundenes Konto kommt unveraendert durch", async () => {
  const result = await resolveAccounts(GCTX({
    data: [{
      id: "seite1", name: "Vision Universe", access_token: "page-token",
      instagram_business_account: { id: "ig1", username: "visionuniverse" }
    }]
  }), "token", ["instagram_basic", "pages_show_list"]);
  assert.equal(result.ok, true);
  assert.equal(result.data.accounts.length, 1);
  assert.equal(result.data.accounts[0].instagramAccountId, "ig1");
  assert.equal(result.data.accounts[0].pageAccessToken, "page-token");
});
