#!/usr/bin/env node
/* Reels aus Claude Code vorbereiten und beobachten. Ruft nur den Worker vision-universe-social auf.
   Der Admin-Schluessel kommt aus der Umgebung (VU_SOCIAL_ADMIN_KEY), nie aus Datei oder Argument.

     node scripts/social/ig-reel.mjs prepare --content-id reel_2026_10_20_a --video-url https://… \
          --caption-file caption.txt [--no-feed]
     node scripts/social/ig-reel.mjs status --content-id reel_2026_10_20_a

   `prepare` veroeffentlicht NICHTS: es misst das Video und legt eine Karte im Approval Center an.
   Veroeffentlicht wird ausschliesslich dort, durch den Owner. Dieses Skript hat bewusst keinen publish-Befehl. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--no-feed") out.noFeed = true;
    else if (a.startsWith("--")) out[a.slice(2)] = argv[i + 1] !== undefined && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    else out._.push(a);
  }
  return out;
}

export function buildRequest(cmd, args, base = "https://social.visionuniverse.de") {
  const root = String(base).replace(/\/+$/, "");
  if (cmd === "prepare") {
    const caption = args["caption-file"] ? readFileSync(args["caption-file"], "utf8").replace(/\s+$/, "")
      : (typeof args.caption === "string" ? args.caption : "");
    if (!args["content-id"] || !args["video-url"]) throw new Error("--content-id und --video-url sind Pflicht");
    return { method: "POST", url: root + "/social/reel/prepare", body: {
      contentId: args["content-id"], videoUrl: args["video-url"], caption, shareToFeed: args.noFeed ? false : true } };
  }
  if (cmd === "status") {
    if (!args["content-id"]) throw new Error("--content-id ist Pflicht");
    return { method: "GET", url: root + "/social/reel/status?contentId=" + encodeURIComponent(args["content-id"]) };
  }
  throw new Error("Befehle: prepare | status");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const key = process.env.VU_SOCIAL_ADMIN_KEY;
  if (!key) { console.error("VU_SOCIAL_ADMIN_KEY ist nicht gesetzt (Umgebung, nicht Datei)."); process.exit(3); }
  let req;
  try { req = buildRequest(args._[0], args, process.env.VU_SOCIAL_WORKER_URL || undefined); }
  catch (e) { console.error(e.message); process.exit(2); }
  const res = await fetch(req.url, { method: req.method, headers: Object.assign({ authorization: "Bearer " + key },
    req.body ? { "content-type": "application/json" } : {}), body: req.body ? JSON.stringify(req.body) : undefined });
  const body = await res.json().catch(() => ({}));
  console.log(JSON.stringify(body, null, 2));
  if (!res.ok) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
