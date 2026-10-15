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

test("ig-check · Netzfehler und 5xx werden wiederholt, 4xx nicht", async () => {
  let n = 0;
  const flaky = async () => {
    n++;
    if (n === 1) { const e = new TypeError("fetch failed"); e.cause = { code: "ECONNRESET" }; throw e; }
    if (n === 2) return { ok: false, status: 502, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ ok: 1 }) };
  };
  const get = makeClient("https://x.invalid", "K", flaky, { waitMs: 0 });
  assert.deepEqual(await get("/x"), { ok: 1 });
  assert.equal(n, 3);

  let m = 0;
  const denied = makeClient("https://x.invalid", "K", async () => { m++; return { ok: false, status: 401, json: async () => ({}) }; }, { waitMs: 0 });
  await assert.rejects(denied("/x"), /401/);
  assert.equal(m, 1);

  const down = makeClient("https://x.invalid", "K", async () => { const e = new TypeError("fetch failed"); e.cause = { code: "ETIMEDOUT" }; throw e; }, { retries: 1, waitMs: 0 });
  await assert.rejects(down("/x"), /ETIMEDOUT/);
});
