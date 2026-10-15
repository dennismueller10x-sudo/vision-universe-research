import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { buildUrl, shape } from "../../scripts/social/ig.mjs";

test("ig · URLs und Filter", () => {
  assert.equal(buildUrl("https://x.de/", "status"), "https://x.de/social/meta/status");
  assert.equal(buildUrl("https://x.de", "media", { limit: 5, after: "C" }), "https://x.de/social/meta/profile?limit=5&after=C");
  assert.equal(buildUrl("https://x.de", "publish"), null);
  const body = { profile: { username: "a" }, media: [{ media_product_type: "REELS" }, { media_product_type: "FEED" }], next: null };
  assert.equal(shape("profile", body).username, "a");
  assert.equal(shape("media", body, { reels: true }).media.length, 1);
});

test("ig · ohne Schluessel Exit 3 und keine Netzwerkanfrage", () => {
  const r = spawnSync(process.execPath, ["scripts/social/ig.mjs", "profile"],
    { env: { PATH: process.env.PATH }, encoding: "utf8" });
  assert.equal(r.status, 3);
});
