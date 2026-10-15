import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { analyse, hookPattern, hookOf, normalize, toMarkdown } from "../../scripts/social/reel-research.mjs";
import { parseArgs, buildRequest } from "../../scripts/social/ig-reel.mjs";

const NOW = Date.parse("2026-10-15T12:00:00Z");
const item = (o) => Object.assign({ shortCode: "x" + Math.random().toString(36).slice(2, 7), ownerUsername: "a",
  timestamp: "2026-10-01T10:00:00Z", videoPlayCount: 1000, likesCount: 50, commentsCount: 5, videoDuration: 20,
  caption: "Warum steigt die Aktie?\nText", url: "https://www.instagram.com/reel/x/" }, o);

test("reel-research · Kennzahlen, Ausreisser, Hook-Muster", () => {
  const items = [item({ videoPlayCount: 1000 }), item({ videoPlayCount: 1200 }), item({ videoPlayCount: 900 }),
    item({ videoPlayCount: 9000, caption: "5 Fehler bei ETFs", videoDuration: 40 })];
  const a = analyse(items, { now: NOW });
  assert.equal(a.n, 4);
  const top = a.top[0];
  assert.equal(top.plays, 9000);
  assert.ok(top.outlierFactor > 5);
  assert.equal(top.hookPattern, "zahl");
  assert.equal(a.vertrauen, "nur-beschreibend");
  assert.match(a.hinweis, /Zu wenige/);
  const r = normalize(item({ likesCount: -1 }), NOW);
  assert.equal(r.likes, null);
  assert.equal(r.engagementRate, null, "ausgeblendete Likes werden nicht als 0 gerechnet");
  assert.equal(hookPattern("Wie viel Rendite ist normal?"), "frage");
  assert.equal(hookPattern("Warum Anleger jetzt nervös werden"), "w-frage-aussage");
  assert.equal(hookOf("x".repeat(200)).length, 88);
  assert.match(toMarkdown(a), /Reel-Recherche \(4 Reels/);
});

test("reel-research · ignoriert Fehlereintraege, gibt keine ganze Caption weiter", () => {
  const lang = "L".repeat(500);
  const a = analyse([{ error: "x" }, item({ caption: lang })], { now: NOW });
  assert.equal(a.n, 1);
  assert.ok(!JSON.stringify(a.reels).includes("L".repeat(100)));
});

test("ig-reel · Anfrage-Bau und kein publish-Befehl", () => {
  const dir = mkdtempSync(join(tmpdir(), "reel-"));
  const f = join(dir, "caption.txt");
  writeFileSync(f, "Text mit Zeilen\n\n#boerse\n");
  const args = parseArgs(["prepare", "--content-id", "reel_a1", "--video-url", "https://x.example/v.mp4", "--caption-file", f, "--no-feed"]);
  const r = buildRequest("prepare", args, "https://w.example/");
  assert.equal(r.url, "https://w.example/social/reel/prepare");
  assert.deepEqual(r.body, { contentId: "reel_a1", videoUrl: "https://x.example/v.mp4", caption: "Text mit Zeilen\n\n#boerse", shareToFeed: false });
  assert.equal(buildRequest("status", { "content-id": "r a" }, "https://w.example").url, "https://w.example/social/reel/status?contentId=r%20a");
  assert.throws(() => buildRequest("publish", {}), /prepare \| status/);
  assert.throws(() => buildRequest("prepare", {}), /Pflicht/);
  const ohneKey = spawnSync(process.execPath, ["scripts/social/ig-reel.mjs", "status", "--content-id", "x"], { env: { PATH: process.env.PATH }, encoding: "utf8" });
  assert.equal(ohneKey.status, 3);
});
