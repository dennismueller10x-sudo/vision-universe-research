import { test } from "node:test";
import assert from "node:assert/strict";
import { checkIdentity, collectMedia, collectInsights, makeClient } from "../../scripts/social/ig-check.mjs";

const ID = "17841480148117405";

test("ig-check · Identitaet", () => {
  assert.equal(checkIdentity({ id: ID, username: "App.VisionUniverse" }, { id: ID, username: "app.visionuniverse" }).ok, true);
  assert.equal(checkIdentity({ id: "1", username: "app.visionuniverse" }, { id: ID, username: "app.visionuniverse" }).ok, false);
  assert.equal(checkIdentity({ id: ID, username: "anders" }, { id: ID, username: "app.visionuniverse" }).ok, false);
});

test("ig-check · Seiten, Insights-Batches, vertagte Beitraege werden nachgeholt", async () => {
  const all = Array.from({ length: 30 }, (_, i) => ({ id: String(100 + i) }));
  const calls = [];
  const get = async (path) => {
    calls.push(path);
    if (path.startsWith("/social/meta/profile")) {
      const page = path.includes("after=P2") ? 2 : 1;
      return page === 1
        ? { profile: { id: ID, username: "u" }, media: all.slice(0, 25), next: "P2" }
        : { profile: { id: ID, username: "u" }, media: all.slice(25), next: null };
    }
    const ids = new URL("http://x" + path).searchParams.get("media").split(",");
    const take = ids.slice(0, 6), rest = ids.slice(6);   // Worker vertagt den Rest
    return { posts: take.map((m) => ({ mediaId: m, metrics: { reach: 1 } })), deferred: rest };
  };
  const { media } = await collectMedia(get);
  assert.equal(media.length, 30);
  const ins = await collectInsights(get, media.map((m) => m.id));
  assert.equal(ins.size, 30);
  assert.ok([...ins.values()].every((v) => v.measured));
});

test("ig-check · Fehler enthalten nie den Schluessel", async () => {
  const get = makeClient("https://x.invalid", "GEHEIMER-SCHLUESSEL", async () => ({ ok: false, status: 401, json: async () => ({ error: "unauthorized" }) }));
  await assert.rejects(get("/x"), (e) => !String(e.message).includes("GEHEIM") && /401/.test(e.message));
});
