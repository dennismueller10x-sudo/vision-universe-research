/* VU SOCIAL — Profil und Beitragsliste fuer die Claude-Code-Steuerung (P1–P6). Rein lesend. */
import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { createEnv, request, PAGE_TOKEN, TEST_ADMIN_KEY } from "./harness.mjs";
import { CONNECTION_KEY } from "../src/store.js";

const ZIEL = "app.visionuniverse";
const IG_ID = "17841480148117405";

function aufbau(extra = {}) {
  const aufrufe = [];
  const antwort = (body, status = 200) => ({
    ok: status < 300, status, text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers({ "content-type": "application/json" })
  });
  const fetchImpl = async (rawUrl, init = {}) => {
    const url = new URL(rawUrl);
    const pfad = url.pathname.split("/").slice(2).join("/");
    aufrufe.push({ pfad, methode: (init && init.method) || "GET", params: url.searchParams });
    if (pfad === IG_ID) return antwort({ id: IG_ID, username: ZIEL, biography: "Bio", media_count: 2 });
    if (pfad === `${IG_ID}/media`) {
      return antwort({ data: [{ id: "1", media_type: "VIDEO", media_product_type: "REELS" },
        { id: "2", media_type: "IMAGE", media_product_type: "FEED" }],
        paging: { cursors: { after: "CUR" }, next: "https://x" } });
    }
    return antwort({ error: { message: "unerwartet " + pfad, code: 100 } }, 404);
  };
  const env = createEnv({ META_IG_ACCOUNT_ID: IG_ID, META_IG_ALLOWED_USERNAMES: ZIEL,
    __fetchImpl: fetchImpl, ...extra });
  return { env, aufrufe };
}
const verbinden = (env, username = ZIEL) => env.VU_SOCIAL_KV.put(CONNECTION_KEY, JSON.stringify({
  version: 1, instagramAccountId: IG_ID, instagramUsername: username, pageId: "p",
  pageName: "VU", pageAccessToken: PAGE_TOKEN, tokenType: "page",
  permissions: { granted: [], declined: [], requested: [], missing: [] }, capabilities: {} }));
const ruf = (q = "", opt = {}) => request("/social/meta/profile" + q,
  { headers: { authorization: `Bearer ${TEST_ADMIN_KEY}` }, ...opt });

test("P1 · Ohne Admin-Schluessel nichts", async () => {
  const { env } = aufbau(); await verbinden(env);
  assert.equal((await worker.fetch(request("/social/meta/profile"), env)).status, 401);
});

test("P2 · Nur GET", async () => {
  const { env } = aufbau(); await verbinden(env);
  assert.equal((await worker.fetch(ruf("", { method: "POST" }), env)).status, 405);
});

test("P3 · Profil und Medienliste, ohne Token in der Antwort, ohne POST", async () => {
  const { env, aufrufe } = aufbau(); await verbinden(env);
  const res = await worker.fetch(ruf("?limit=2"), env);
  const text = await res.text();
  assert.equal(res.status, 200);
  assert.ok(!text.includes(PAGE_TOKEN), "Token darf nie in der Antwort stehen");
  const body = JSON.parse(text);
  assert.equal(body.profile.username, ZIEL);
  assert.equal(body.media[0].media_product_type, "REELS");
  assert.equal(body.next, "CUR");
  assert.ok(aufrufe.every((a) => a.methode === "GET"));
  assert.equal(aufrufe.length, 2);
});

test("P4 · Ohne Verbindung 409", async () => {
  const { env } = aufbau();
  assert.equal((await worker.fetch(ruf(), env)).status, 409);
});

test("P5 · Konto ausserhalb der Allowlist wird nicht gelesen", async () => {
  const { env, aufrufe } = aufbau(); await verbinden(env, "fremdes.konto");
  assert.equal((await worker.fetch(ruf(), env)).status, 403);
  assert.equal(aufrufe.length, 0);
});

test("P6 · limit wird auf 25 gedeckelt, after weitergereicht", async () => {
  const { env, aufrufe } = aufbau(); await verbinden(env);
  await worker.fetch(ruf("?limit=500&after=ABC"), env);
  const m = aufrufe.find((a) => a.pfad === `${IG_ID}/media`);
  assert.equal(m.params.get("limit"), "25");
  assert.equal(m.params.get("after"), "ABC");
});
